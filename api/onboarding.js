// All calls arrive after JWT verification and use the transaction-scoped member ID.
const genders = new Set(['Man','Woman','Transman','Transwoman','Something else']);
const orientations = new Set(['Gay','Straight','Bi','Something else']);
const jsonBody = async request => {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) throw Error('Expected JSON');
  const raw = await request.text();
  if (raw.length > 4000) throw Error('Request too large');
  return JSON.parse(raw);
};
export function adultBirthDate(value, today = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) return false;
  const oldest = new Date(Date.UTC(today.getUTCFullYear()-120,today.getUTCMonth(),today.getUTCDate()));
  const youngest = new Date(Date.UTC(today.getUTCFullYear()-18,today.getUTCMonth(),today.getUTCDate()));
  return date >= oldest && date <= youngest;
}
export function scorePersona(answers) {
  if (!Array.isArray(answers) || answers.length !== 28 ||
      !answers.every(n => [-2,-1,1,2].includes(n))) return null;
  const polarity = [
    [1,-1,1,-1,1,-1,1],
    [1,-1,1,-1,1,-1,1],
    [1,-1,1,-1,1,-1,1],
    [1,-1,1,-1,1,-1,1],
  ];
  const letters = [['D','R'],['G','B'],['L','S'],['D','M']];
  return letters.map((pair, axis) => {
    let total=0, majority=0;
    for (let round=0;round<7;round++) {
      const weighted=answers[round*4+axis]*polarity[axis][round];
      total+=weighted; majority+=Math.sign(weighted);
    }
    return pair[total>0 || (total===0 && majority>0) ? 0 : 1];
  }).join('');
}
export async function handleOnboarding(request,userId,withMember,json,verifiedPlace) {
  try {
    if (request.method === 'GET') {
      const result=await withMember(userId,async client => {
        const [state,profile,photos,answers,verified]=await Promise.all([
          client.query('SELECT gender,orientation,birth_date,country_code,zip_code,locality_id,locality_shard,city_label,details_complete,match_age_min,match_age_max,explored_at,primary_self_photo_id,persona_code FROM app_private.member_onboarding WHERE user_id=$1::uuid',[userId]),
          client.query('SELECT about_me, interested_in, relationship_goal FROM app_private.member_profiles WHERE user_id=$1::uuid',[userId]),
          client.query('SELECT count(*)::int AS total, bool_or(is_primary) AS primary FROM app_private.member_photos WHERE user_id=$1::uuid',[userId]),
          client.query('SELECT count(*)::int AS total FROM app_private.member_match_answers WHERE user_id=$1::uuid',[userId]),
          client.query('SELECT app_private.current_member_email_verified() AS value'),
        ]);
        return {state:state.rows[0]||null,profile:profile.rows[0]||null,photos:photos.rows[0],answers:answers.rows[0].total,verified:verified.rows[0].value};
      });
      const s=result.state;
      const identity=Boolean(s?.gender && s?.orientation);
      const locality=Boolean(adultBirthDate(s?.birth_date?.toISOString?.().slice(0,10)) && s?.locality_id);
      const profile=Boolean(s?.details_complete && result.profile?.interested_in?.trim() &&
        result.profile?.relationship_goal?.trim() && result.profile?.about_me?.trim());
      const photo=Boolean(profile && s?.primary_self_photo_id && result.photos.primary);
      const quiz=Boolean(photo && (result.answers>=25 || s?.persona_code));
      return json(request,{identity,locality,profile,photo,quiz,explored:Boolean(s?.explored_at),verified:result.verified,answerCount:result.answers,photoCount:result.photos.total,state:s});
    }
    if (request.method !== 'PUT') return json(request,{error:'Method not allowed'},405);
    const body=await jsonBody(request);
    if (!body || typeof body !== 'object') throw Error('Invalid onboarding input');
    if (body.step==='identity') {
      if (!genders.has(body.gender) || !orientations.has(body.orientation)) throw Error('Choose your gender and orientation');
      await withMember(userId,client=>client.query(`INSERT INTO app_private.member_onboarding(user_id,gender,orientation) VALUES($1::uuid,$2,$3)
        ON CONFLICT(user_id) DO UPDATE SET gender=$2,orientation=$3`,[userId,body.gender,body.orientation]));
    } else if (body.step==='locality') {
      if (!adultBirthDate(body.birthDate)) throw Error('Enter a valid birthdate (18 or older)');
      if (typeof body.countryCode!=='string' || !/^[A-Z]{2}$/.test(body.countryCode)) throw Error('Choose a country');
      if (body.countryCode==='US' && !/^\d{5}$/.test(body.zipCode)) throw Error('Enter a valid ZIP code');
      const place=await verifiedPlace(body.locality);
      if (!place || !place.label.endsWith(new Intl.DisplayNames(['en'],{type:'region'}).of(body.countryCode))) throw Error('Choose a city in your country');
      await withMember(userId,async client=>{
        const row=await client.query('SELECT gender,orientation FROM app_private.member_onboarding WHERE user_id=$1::uuid',[userId]);
        if (!row.rows[0]?.gender || !row.rows[0]?.orientation) throw Error('Complete identity first');
        await client.query(`UPDATE app_private.member_onboarding SET birth_date=$2::date,country_code=$3,zip_code=$4,locality_id=$5,locality_shard=$6,city_label=$7 WHERE user_id=$1::uuid`,
          [userId,body.birthDate,body.countryCode,body.countryCode==='US'?body.zipCode:null,place.id,place.key,place.label]);
      });
    } else if (body.step==='details') {
      if (!Number.isInteger(body.matchAgeMin) || !Number.isInteger(body.matchAgeMax) || body.matchAgeMin < 18 || body.matchAgeMax > 120 || body.matchAgeMin > body.matchAgeMax) throw Error('Choose a valid age range');
      await withMember(userId,async client=>{
        const row=await client.query('SELECT birth_date,locality_id FROM app_private.member_onboarding WHERE user_id=$1::uuid',[userId]);
        const profile=await client.query('SELECT interested_in,relationship_goal FROM app_private.member_profiles WHERE user_id=$1::uuid',[userId]);
        if (!row.rows[0]?.birth_date || !row.rows[0]?.locality_id ||
            !profile.rows[0]?.interested_in?.trim() || !profile.rows[0]?.relationship_goal?.trim())
          throw Error('Save your details first');
        await client.query('UPDATE app_private.member_onboarding SET details_complete=true,match_age_min=$2,match_age_max=$3 WHERE user_id=$1::uuid',[userId,body.matchAgeMin,body.matchAgeMax]);
      });
    } else if (body.step==='self-photo') {
      if (body.confirmed !== true) throw Error('Confirm your main photo shows you');
      await withMember(userId,async client=>{
        const progress=await client.query(`SELECT o.details_complete,p.about_me
          FROM app_private.member_onboarding o JOIN app_private.member_profiles p ON p.user_id=o.user_id
          WHERE o.user_id=$1::uuid`,[userId]);
        if (!progress.rows[0]?.details_complete || !progress.rows[0]?.about_me?.trim())
          throw Error('Complete your profile first');
        const photo=await client.query('SELECT id FROM app_private.member_photos WHERE user_id=$1::uuid AND is_primary=true',[userId]);
        if (!photo.rowCount) throw Error('Upload and select a main photo first');
        await client.query('UPDATE app_private.member_onboarding SET primary_self_photo_id=$2::uuid WHERE user_id=$1::uuid',[userId,photo.rows[0].id]);
      });
    } else if (body.step==='explore') {
      await withMember(userId,async client=>{
        const row=await client.query(`SELECT o.details_complete,o.primary_self_photo_id,o.persona_code,p.about_me,
          EXISTS(SELECT 1 FROM app_private.member_photos ph WHERE ph.id=o.primary_self_photo_id AND ph.is_primary AND ph.user_id=o.user_id) AS has_photo,
          (SELECT count(*) FROM app_private.member_match_answers a WHERE a.user_id=o.user_id) AS question_count
          FROM app_private.member_onboarding o JOIN app_private.member_profiles p ON p.user_id=o.user_id
          WHERE o.user_id=$1::uuid`,[userId]);
        const r=row.rows[0];
        if (!r?.details_complete || !r?.about_me?.trim() || !r?.has_photo ||
            (Number(r.question_count)<25 && !r.persona_code)) throw Error('Finish your onboarding steps first');
        await client.query('UPDATE app_private.member_onboarding SET explored_at=now() WHERE user_id=$1::uuid',[userId]);
      });
    } else if (body.step==='persona') {
      const code=scorePersona(body.answers);
      if (!code) throw Error('Finish all 28 Persona questions');
      await withMember(userId,async client=>{
        const progress=await client.query(`SELECT o.primary_self_photo_id FROM app_private.member_onboarding o
          JOIN app_private.member_photos p ON p.id=o.primary_self_photo_id AND p.is_primary
          WHERE o.user_id=$1::uuid`,[userId]);
        if (!progress.rowCount) throw Error('Complete photos first');
        await client.query('UPDATE app_private.member_onboarding SET persona_code=$2,persona_answers=$3::smallint[] WHERE user_id=$1::uuid',[userId,code,body.answers]);
      });
    } else throw Error('Unknown onboarding step');
    return json(request,{saved:true});
  } catch (error) {
    return json(request,{error:error instanceof Error?error.message:'Could not save onboarding'},400);
  }
}
