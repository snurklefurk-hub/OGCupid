import React from "react";

// The user's original November 19 Quickmatch artwork, displayed as a
// transparent two-panel sprite. Left: Like; right: Dislike.
// This is not generated/reimagined artwork. Only the source image was
// resized for web delivery. The button semantics and vote logic are unchanged.
export function HeartIcon({kind}) {
  return <span aria-hidden="true" className={
    "ogcl-heart-icon "+(kind==="like"?"ogcl-heart-like":"ogcl-heart-dislike")
  }/>;
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
