// Stable, intentionally fictional portraits for the ten seeded T+E accounts.
// Do not apply this to real members: their protected, uploaded photos are untouched.
// These illustrations replace repeated stock-photo stand-ins only in the React UI.
const IDS = Object.freeze([
  "a48905fa-ce4d-4339-a6ad-3fd786f20720", // BookishBea
  "60ab46c9-72b4-40a9-a962-47d9dc37c6a6", // CoffeeCal
  "e7dea573-7c35-4497-b464-d3f64bab9f95", // FernFreya
  "dc856022-b296-4759-9bd7-8e5d89547dbd", // MapleMaya
  "6b8c06e4-74dc-44a2-9bb4-a079540c451e", // OrbitOwen
  "86430bce-65f3-49d7-80e7-b4b2333f6c5a", // PixelParker
  "52b276b5-2fd5-4ee9-8852-34a42fdf06a5", // RiverRiley
  "170b0318-f89b-415a-aa6e-00b34c103567", // SunnySage
  "898be3d3-42a6-4fd8-a393-bb4eee3aa0ea", // TrailTheo
  "5a398fb9-eadd-44d3-a239-351a6508b314"  // VinylNora
]);
const PALETTES = Object.freeze([
  ["#f3bfbb","#f8e6c7","#a75f3c","#282124","#5565a0","#c96781"],
  ["#b1d5d4","#d5a07c","#4c3028","#3e3028","#bc714f","#e7ca7a"],
  ["#e4c1ef","#8e5a43","#211b28","#2b2025","#4c8186","#a6d1b4"],
  ["#dce5a3","#d6a27b","#673e28","#443326","#a2517c","#f5d46c"],
  ["#b8c9f1","#b77957","#3b2927","#322a2d","#3e7a8f","#ffa976"],
  ["#e0c9fd","#f2c49b","#a65735","#38292a","#7b83ba","#d4edf6"],
  ["#fad7a3","#754635","#28201c","#302d30","#577653","#bfd7a8"],
  ["#b4e0dc","#c18b65","#343025","#49332a","#af6b65","#f5debc"],
  ["#f9cbbb","#e2b28e","#6b3925","#30201b","#526d9c","#b1d8db"],
  ["#c6d9f1","#966047","#38282a","#392f3d","#ae7c94","#f9d6b5"]
]);
// Different actual silhouettes, hairlines, glasses, colors and accessories;
// names/IDs never appear as text on the portraits.
function portraitSvg(index) {
  const [background,skin,hair,ink,shirt,accent]=PALETTES[index];
  const hairBack = [0,2,3,7,9].includes(index)
    ? `<path d="M328 279 Q322 85 482 100 Q650 93 645 300 L649 525 Q589 550 545 475 L422 477 Q355 542 321 500Z" fill="${hair}"/>`
    : "";
  const cuts = [
    `<path d="M345 257 Q315 111 466 112 Q638 102 619 268 Q575 228 548 167 Q483 244 382 232Z" fill="${hair}"/>`,
    `<path d="M347 237 Q359 128 470 126 Q590 115 610 235 L578 214 L553 187 L482 211 L398 216Z" fill="${hair}"/>`,
    `<path d="M345 245 Q330 106 485 114 Q642 115 620 277 Q574 239 542 178 Q448 243 373 219Z" fill="${hair}"/><g fill="${hair}"><circle cx="364" cy="220" r="30"/><circle cx="406" cy="152" r="31"/><circle cx="464" cy="135" r="33"/><circle cx="523" cy="146" r="36"/><circle cx="592" cy="202" r="35"/></g>`,
    `<path d="M344 260 Q326 125 462 115 Q619 106 623 247 Q565 231 528 192 Q440 253 372 233Z" fill="${hair}"/><path d="M371 203 Q441 205 478 151 L508 179 Q455 250 368 251Z" fill="${hair}"/>`,
    `<path d="M359 215 Q375 167 470 158 Q582 157 599 227 Q500 183 387 224Z" fill="${hair}"/>`,
    `<path d="M345 250 Q334 145 450 143 Q558 120 615 212 L603 248 Q566 193 515 188 Q470 232 371 225Z" fill="${hair}"/>`,
    `<g fill="${hair}"><circle cx="376" cy="208" r="37"/><circle cx="401" cy="162" r="35"/><circle cx="451" cy="144" r="39"/><circle cx="505" cy="140" r="38"/><circle cx="559" cy="166" r="37"/><circle cx="598" cy="212" r="32"/></g>`,
    `<circle cx="482" cy="111" r="63" fill="${hair}"/><path d="M343 267 Q331 148 465 158 Q607 149 621 262 Q583 216 533 219 Q449 187 373 246Z" fill="${hair}"/>`,
    `<path d="M362 222 Q388 167 476 173 Q565 161 602 223 Q472 193 362 222Z" fill="${hair}"/>`,
    `<path d="M346 246 Q339 129 471 124 Q607 121 618 264 Q564 229 555 161 Q502 237 378 227Z" fill="${hair}"/>`
  ];
  const glasses=[0,3,5,8].includes(index)
    ? `<g fill="none" stroke="${ink}" stroke-width="8"><rect x="388" y="291" width="82" height="57" rx="17"/><rect x="489" y="291" width="82" height="57" rx="17"/><path d="M470 313H489 M388 309L350 296 M571 309L609 296"/></g>`
    : "";
  const beard=[4,6].includes(index)
    ? `<path d="M394 395 Q410 491 480 493 Q552 491 571 390 Q549 417 531 421 Q484 454 429 419Z" fill="${hair}" opacity=".93"/>`
    : "";
  const earrings=[2,3,7,9].includes(index)
    ? `<g fill="${accent}"><circle cx="345" cy="357" r="10"/><circle cx="616" cy="357" r="10"/></g>`
    : "";
  const details=index%3===0
    ? `<path d="M400 537L478 607L554 537" fill="none" stroke="${accent}" stroke-width="22" stroke-linejoin="round"/>`
    : index%3===1
      ? `<path d="M411 518L480 573L548 518" fill="none" stroke="white" stroke-width="19" opacity=".82"/>`
      : `<path d="M375 605Q475 561 585 605" fill="none" stroke="${accent}" stroke-width="16"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" width="960" height="640">
    <title>Fictional illustrated test profile portrait</title>
    <rect width="960" height="640" fill="${background}"/>
    <circle cx="${index%2===0?160:795}" cy="90" r="226" fill="${accent}" opacity=".42"/>
    <path d="M0 570Q220 465 490 565Q710 665 960 520V640H0Z" fill="${accent}" opacity=".37"/>
    <ellipse cx="480" cy="678" rx="256" ry="209" fill="${shirt}"/>
    <rect x="424" y="418" width="112" height="158" rx="47" fill="${skin}"/>
    ${hairBack}
    <ellipse cx="480" cy="310" rx="136" ry="185" fill="${skin}"/>
    <ellipse cx="350" cy="350" rx="18" ry="30" fill="${skin}"/>
    <ellipse cx="609" cy="350" rx="18" ry="30" fill="${skin}"/>
    ${cuts[index]}
    <g fill="${ink}"><ellipse cx="429" cy="315" rx="9" ry="12"/><ellipse cx="531" cy="315" rx="9" ry="12"/></g>
    <path d="M482 325Q461 374 485 376" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round" opacity=".45"/>
    <path d="M446 406Q480 430 520 404" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
    ${beard}${glasses}${earrings}${details}
    <rect x="20" y="578" width="91" height="38" rx="12" fill="#222b42" opacity=".82"/>
    <text x="65" y="604" text-anchor="middle" font-family="sans-serif" font-size="21" font-weight="700" fill="white">T+E</text>
  </svg>`;
}
export const SYNTHETIC_PROFILE_IDS=IDS;
export function syntheticProfilePortrait(userId) {
  const index=IDS.indexOf(String(userId||"").toLowerCase());
  return index<0?null:new Blob([portraitSvg(index)],{type:"image/svg+xml"});
}
