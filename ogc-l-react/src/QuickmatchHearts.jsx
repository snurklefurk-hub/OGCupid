import React from "react";

// Original vector control icons: the approved arrow-shot heart and deflated
// heart, with actual button semantics rather than decorative Unicode emoji.
export function HeartIcon({kind}) {
  if(kind==="like")return <svg className="ogcl-heart-icon" viewBox="0 0 96 78" aria-hidden="true" focusable="false">
    <path d="M48 70 C37 60 10 40 10 24 C10 10 21 4 33 9 C40 12 45 18 48 23 C51 18 56 12 63 9 C75 4 86 10 86 24 C86 40 59 60 48 70Z"
      fill="#f83265" stroke="#9e1543" strokeWidth="3" strokeLinejoin="round"/>
    <path d="M11 61 L80 8" stroke="#f4d7a7" strokeWidth="7" strokeLinecap="round"/>
    <path d="M11 61 L80 8" stroke="#6e4c27" strokeWidth="2.2" strokeLinecap="round"/>
    <path d="M65 7 L86 4 L79 23" fill="none" stroke="#6e4c27" strokeWidth="4" strokeLinejoin="round" strokeLinecap="square"/>
    <path d="M16 54 L9 46 M23 63 L15 70" stroke="#6e4c27" strokeWidth="3" strokeLinecap="round"/>
  </svg>;
  return <svg className="ogcl-heart-icon" viewBox="0 0 96 78" aria-hidden="true" focusable="false">
    <path d="M46 22 C38 10 29 6 20 9 C8 13 7 27 15 38 C22 47 31 53 39 60 L44 69"
      fill="#afb7c3" stroke="#5a6b7b" strokeWidth="3.2" strokeLinejoin="round"/>
    <path d="M52 22 C61 8 75 5 85 15 C93 25 88 37 79 43 L68 51 L59 56 L54 72"
      fill="#afb7c3" stroke="#5a6b7b" strokeWidth="3.2" strokeLinejoin="round"/>
    <path d="M47 17 L54 29 L43 38 L53 48 L44 59 L49 73"
      fill="none" stroke="#ffffff" strokeWidth="5" strokeLinejoin="round"/>
    <path d="M47 17 L54 29 L43 38 L53 48 L44 59 L49 73" fill="none" stroke="#617383" strokeWidth="2.3"/>
    <path d="M59 57 Q73 62 72 69" fill="none" stroke="#8794a4" strokeWidth="3" strokeLinecap="round"/>
  </svg>;
}

export function HeartDecision({kind,disabled,onClick}) {
  const like=kind==="like";
  const name=like?"Like":"Dislike";
  return <button type="button"
    className={"ogcl-heart-decision "+(like?"ogcl-heart-positive":"ogcl-heart-negative")}
    aria-label={name+" this Quickmatch member"}
    title={name} disabled={disabled} onClick={onClick}>
    <HeartIcon kind={kind}/>
    <span>{name}</span>
  </button>;
}
