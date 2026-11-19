import test from "node:test";
import assert from "node:assert/strict";
import {SYNTHETIC_PROFILE_IDS,syntheticProfilePortrait} from "./test-profile-portraits.mjs";

test("all ten seeded T+E profiles have a distinct, valid illustrated portrait", async () => {
  assert.equal(SYNTHETIC_PROFILE_IDS.length,10);
  assert.equal(new Set(SYNTHETIC_PROFILE_IDS).size,10);
  const portraits=SYNTHETIC_PROFILE_IDS.map(id=>syntheticProfilePortrait(id));
  assert.ok(portraits.every(p=>p instanceof Blob && p.type==="image/svg+xml"));
  const svg=await Promise.all(portraits.map(p=>p.text()));
  assert.equal(new Set(svg).size,10);
  assert.ok(svg.every(s=>s.startsWith("<svg ") &&
    s.includes("Fictional illustrated test profile portrait") &&
    s.includes("T+E") && s.includes("</svg>")));
});

test("test portraits remain stable, and genuine or unknown members are never substituted", async () => {
  const id=SYNTHETIC_PROFILE_IDS[0];
  assert.equal(await syntheticProfilePortrait(id).text(),
    await syntheticProfilePortrait(id.toUpperCase()).text());
  assert.equal(syntheticProfilePortrait("7a6a545e-fad7-4c03-957e-1ef005d4ad15"),null);
  assert.equal(syntheticProfilePortrait(""),null);
  assert.equal(syntheticProfilePortrait(null),null);
});
