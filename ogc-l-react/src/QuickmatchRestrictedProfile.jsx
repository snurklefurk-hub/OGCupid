import React,{useEffect,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import QuickmatchPhotos from "./QuickmatchPhotos.jsx";

// Unlike a standard member profile, this restricted Quickmatch presentation
// exposes only the explicitly approved genuine profile fields. The data is
// fetched live from the same authenticated canonical profile endpoint.
export default function QuickmatchRestrictedProfile({member,children}) {
  const {getPublicProfile}=useMemberSession();
  const [profile,setProfile]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");setProfile(null);
    void getPublicProfile(member.slug).then(value=>{
      if(active && value.userId===member.userId){setProfile(value);setLoading(false);}
      else if(active){setError("Member profile could not be verified.");setLoading(false);}
    }).catch(()=>{
      if(active){setError("The member's saved profile is temporarily unavailable.");setLoading(false);}
    });
    return ()=>{active=false;};
  },[member.slug,member.userId,getPublicProfile]);

  const details=profile?[
    ["Age",profile.age==null?null:String(profile.age)],
    ["Gender",profile.details.gender],
    ["Orientation",profile.details.orientation],
    ["Relationship status",profile.details.status],
    ["Location",profile.cityRegion]
  ].filter(([,value])=>Boolean(value)):[];
  return <div className="ogcl-quickmatch-restricted">
    <QuickmatchPhotos memberId={member.userId}/>
    {children}
    <div className="ogcl-quickmatch-restricted-header">
      <h2>{member.displayName}</h2>
      <p>{member.matchPercent==null?"Not enough shared answers":member.matchPercent+"% Match"} ·
        Friend / Enemy: not yet calculated</p>
    </div>
    {loading && <p role="status">Loading saved profile details…</p>}
    {error && <p className="ogcl-error" role="alert">{error}</p>}
    {profile && <>
      {details.length>0 && <dl className="ogcl-quickmatch-facts">
        {details.map(([label,value])=><React.Fragment key={label}>
          <dt>{label}</dt><dd>{value}</dd>
        </React.Fragment>)}
      </dl>}
      <div className="ogcl-quickmatch-essays">
{profile.essays.aboutMe&&<section><h3>My self-summary</h3><p>{profile.essays.aboutMe}</p></section>}
        {profile.essays.messageMeIf&&<section><h3>You should message me if</h3><p>{profile.essays.messageMeIf}</p></section>}
      </div>
    </>}
  </div>;
}
