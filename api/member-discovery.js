import { rankDiscoverableProfiles, SCORING_VERSION } from "./discovery-score.js";

// Authenticated, member-only discovery. JWT validation, active account checks,
// CORS and no-store response headers are enforced in member-profile.ts before
// invoking this handler. All queries run in a transaction-local member identity
// and are subject to existing member RLS policies.
const MAX_CANDIDATES = 250;
const PUBLIC_ANSWER_FIELDS = "user_id, question_id, option_id, acceptable_options, importance, is_private";

export async function handleDiscovery(request, userId, withMember, json) {
  if (request.method !== "GET") return json(request, {error:"Method not allowed"}, 405);
  try {
    const results = await withMember(userId, async client => {
      // The SECURITY DEFINER predicate returns *only* a boolean for completed
      // onboarding. It is not a general-purpose read into another member's
      // private onboarding record.
      const selected = await client.query(
        `SELECT p.user_id, p.display_name, routes.slug
           FROM app_private.member_profiles AS p
           INNER JOIN app_private.member_profile_routes AS routes
             ON routes.user_id = p.user_id
           WHERE p.user_id <> $1::uuid
             AND app_private.is_discoverable_member(p.user_id)
           ORDER BY p.created_at DESC, p.user_id
           LIMIT $2`,
        [userId, MAX_CANDIDATES]
      );
      const members = selected.rows;
      if (members.length === 0) return {members, viewerAnswers:[], byUser:new Map(), penalties:new Map()};

      const ids = [userId, ...members.map(member => member.user_id)];
      const answers = await client.query(
        `SELECT ${PUBLIC_ANSWER_FIELDS}
         FROM app_private.member_match_answers
         WHERE user_id = ANY($1::uuid[])
           AND is_private = false
         ORDER BY user_id, question_id`,
        [ids]
      );
      const byUser = new Map();
      for (const row of answers.rows) {
        const id = String(row.user_id);
        if (!byUser.has(id)) byUser.set(id, []);
        byUser.get(id).push(row);
      }
      // Actor-only Quickmatch penalties never alter the underlying question
      // calculation or another member's pairwise scores.
      const penaltyRows=await client.query(
        `SELECT target_user_id,match_penalty_points
         FROM app_private.member_quickmatch_decisions
         WHERE user_id=$1::uuid AND match_penalty_points>0`,[userId]);
      const penalties=new Map(penaltyRows.rows.map(row=>[
        String(row.target_user_id),Number(row.match_penalty_points)
      ]));
      return {members, viewerAnswers:byUser.get(userId) || [], byUser,penalties};
    });

    const ranked = rankDiscoverableProfiles(
      results.members, results.viewerAnswers, results.byUser
    );
    const profiles=ranked.map(member=>{
      const penalty=results.penalties.get(member.userId) || 0;
      return {...member,matchPercent:member.matchPercent===null
        ? null:Math.max(0,member.matchPercent-penalty)};
    });
    return json(request, {
      profiles,
      scoringVersion: SCORING_VERSION,
      calculation: "Provisional reciprocal question-answer match with owner-specific Quickmatch adjustment; Friend/Enemy not yet calculated",
      candidateLimit: MAX_CANDIDATES
    });
  } catch (error) {
    // Never expose SQL, member IDs, question preferences or DB errors.
    console.error("Member discovery unavailable", error instanceof Error ? error.name : "unknown");
    return json(request, {error:"Member discovery temporarily unavailable"}, 503);
  }
}
