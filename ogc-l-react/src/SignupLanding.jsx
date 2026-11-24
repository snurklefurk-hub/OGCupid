import React,{useState} from "react";
import {useNavigate} from "react-router-dom";
import {SIGNUP_ORIENTATIONS,SIGNUP_GENDERS,signupIdentity} from "./signup-landing.mjs";

export default function SignupLanding({onContinue,selection}){
  const navigate=useNavigate();
  const [orientation,setOrientation]=useState(selection?.orientation||"Straight");
  const [gender,setGender]=useState(selection?.gender||"Woman");
  function submit(event){
    event.preventDefault();
    const identity=signupIdentity(orientation,gender);
    if(!identity)return;
    onContinue(identity);
    navigate("/signup2");
  }
  return <form className="ogcl-signup-form" onSubmit={submit}>
        <span>I am a</span>
        <select aria-label="Orientation" value={orientation} onChange={e=>setOrientation(e.target.value)}>
          {SIGNUP_ORIENTATIONS.map(value=><option key={value}>{value}</option>)}
        </select>
        <select aria-label="Gender" value={gender} onChange={e=>setGender(e.target.value)}>
          {SIGNUP_GENDERS.map(value=><option key={value}>{value}</option>)}
        </select>
        <button type="submit">CONTINUE</button>
        {(gender==="Something else"||orientation==="Something else")&&<p className="ogcl-signup-more" role="status">Dont worry, we've got more options inside</p>}
      </form>;
}
