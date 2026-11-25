import React,{useEffect,useRef,useState} from "react";

export const countries="AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
export const countryNames=new Intl.DisplayNames(["en"],{type:"region"});
const cleanCity=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const shardFor=value=>cleanCity(value).slice(0,2).padEnd(2,"_");
const cityLabel=city=>[city.n,city.a&&city.a.toLowerCase()!==city.n.toLowerCase()?city.a:"",countryNames.of(city.c)].filter(Boolean).join(", ");

export function CityChooser({country,stored,onPick,confirmation=false,disabled=false}){
  const [input,setInput]=useState(stored?.label||"");
  const [results,setResults]=useState([]);
  const [hint,setHint]=useState("");
  const [zip,setZip]=useState(stored?.zip||"");
  const seq=useRef(0);
  const selectedLabel=useRef("");
  const confirmed=city=>confirmation?`Oh, ${city.n}? I hear it’s nice this time of year`:"✓ "+cityLabel(city);
  useEffect(()=>{
    setInput(stored?.label||"");
    setZip(stored?.zip||"");
  },[stored?.label,stored?.zip]);
  useEffect(()=>{
    if(country!=="US"||!/^\d{5}$/.test(zip)){setHint("");return;}
    let alive=true;const serial=++seq.current;
    setHint("Checking ZIP code…");
    (async()=>{
      const res=await fetch("https://api.zippopotam.us/us/"+zip,{cache:"no-store"});
      if(!res.ok)throw Error("ZIP code wasn't found.");
      const data=await res.json();
      const place=data.places?.[0];
      if(!place?.["place name"])throw Error("ZIP code has no listed city.");
      const key=shardFor(place["place name"]);
      const list=await fetch("/locations/"+key+".json",{cache:"force-cache"}).then(r=>{
        if(!r.ok)throw Error("City directory unavailable.");return r.json();
      });
      const city=list.find(item=>item.c==="US"&&
        cleanCity(item.n)===cleanCity(place["place name"])&&
        [place.state,place["state abbreviation"]].some(region=>cleanCity(item.a)===cleanCity(region)));
      if(!city)throw Error("Couldn't verify that ZIP against our city directory.");
      if(alive&&serial===seq.current){onPick({id:city.id,key,label:cityLabel(city)});setHint(confirmed(city));}
    })().catch(e=>{if(alive&&serial===seq.current){onPick(null);setHint(e.message);}});
    return()=>{alive=false;};
  },[country,zip]);
  useEffect(()=>{
    if(country==="US")return;
    if(input===selectedLabel.current&&input)return;
    const base=input.split(",")[0].trim(),needle=cleanCity(base);
    if(needle.length<2){setResults([]);setHint("");return;}
    let live=true;const serial=++seq.current;
    setHint("Searching cities…");
    fetch("/locations/"+shardFor(base)+".json",{cache:"force-cache"})
      .then(r=>{if(!r.ok)throw Error("City directory unavailable.");return r.json();})
      .then(list=>{
        if(!live||serial!==seq.current)return;
        const options=list.filter(item=>item.c===country&&cleanCity(item.n).startsWith(needle)).slice(0,14);
        setResults(options);
        setHint(options.length?"Choose a city from the list.":"No matching city. Try a nearby city.");
      }).catch(()=>{if(live&&serial===seq.current){setHint("City search unavailable.");setResults([]);}});
    return()=>{live=false;};
  },[country,input]);
  if(country==="US")return <><label>ZIP code
    <input name="zipCode" type="text" inputMode="numeric" pattern="[0-9]{5}" maxLength={5}
      required disabled={disabled} autoComplete="postal-code" value={zip} onChange={e=>{setZip(e.target.value);setHint("");onPick(null);}}/></label>
    <p className="ogcl-note" role="status">{hint}</p></>;
  return <><label>City
    <input type="search" value={input} required disabled={disabled} maxLength={100}
      placeholder="Start typing your city"
      onChange={e=>{selectedLabel.current="";setInput(e.target.value);setResults([]);setHint("");onPick(null);}}/></label>
    <p className="ogcl-note" role="status">{hint}</p>
    {!!results.length&&<div role="listbox" className="ogcl-city-options">
      {results.map(item=><button type="button" role="option" aria-selected={false} disabled={disabled} key={item.id}
        onClick={()=>{const label=cityLabel(item);selectedLabel.current=label;setInput(label);
          setResults([]);setHint(confirmed(item));onPick({id:item.id,key:shardFor(item.n),label});}}>
        {cityLabel(item)}</button>)}
    </div>}
  </>;
}

