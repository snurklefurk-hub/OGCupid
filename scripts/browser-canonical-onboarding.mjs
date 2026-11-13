// Browser exercise against a LOCAL Vite frontend and an ISOLATED Neon branch.
// Only synthetic accounts are created. No credentials or tokens are logged.
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";

const baseURL="http://localhost:5173";
const email="qa-browser-"+Date.now()+"-"+randomBytes(4).toString("hex")+"@example.invalid";
const password="Q!8a-"+randomBytes(18).toString("hex");
const stageAuth="https://ep-wild-term-bbvgmd5y.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth";
const stageApi="https://br-tiny-wave-bbnpjp0m-members.compute.c-15.us-east-1.aws.neon.tech";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:850}});
const page=await context.newPage();
const errors=[];
let created=false,deleted=false;
page.on("pageerror",e=>errors.push(String(e.message).slice(0,180)));
const shard=readFileSync(new URL("../public/locations/at.json",import.meta.url),"utf8");
await page.route("**/locations/at.json",route=>route.fulfill({status:200,contentType:"application/json",body:shard}));
await page.route("https://api.zippopotam.us/us/30301",route=>route.fulfill({
  status:200,contentType:"application/json",
  body:JSON.stringify({"post code":"30301","country":"United States","country abbreviation":"US",
    "places":[{"place name":"Atlanta","state":"Georgia","state abbreviation":"GA"}]})
}));
const visible=async selector=>page.locator(selector).waitFor({state:"visible",timeout:20000});
const value=async selector=>page.locator(selector).textContent();
async function screenshot(name){
  mkdirSync("test-results",{recursive:true});
  await page.screenshot({path:"test-results/"+name+".png",fullPage:true,timeout:10000}).catch(()=>{});
}
async function cleanup(){
  if(!created || deleted)return;
  try {
    if(!await page.locator("#ogc-delete").isVisible()){
      await page.goto(baseURL+"/#welcome-title",{waitUntil:"domcontentloaded"});
      await visible("#ogc-delete");
    }
    await page.locator("#ogc-delete").click();
    await visible("#ogc-delete-form");
    await page.locator('#ogc-delete-form input[name="password"]').fill(password);
    await page.locator('#ogc-delete-form input[name="confirmation"]').fill("DELETE");
    await page.locator("#ogc-delete-form button[type=submit]").click();
    await page.locator("#signup-form").waitFor({state:"hidden",timeout:10000}).catch(()=>{});
    deleted=await page.locator("#ogc-onboarding").isHidden();
  }catch {console.log("CLEANUP WARNING: browser account may need removal in isolated Neon staging");}
}

try {
  await page.goto(baseURL+"/?join=1",{waitUntil:"domcontentloaded",timeout:30000});
  await visible("#signup-form");
  await page.locator("#signup-name").fill("Browser QA");
  await page.locator("#signup-email").fill(email);
  await page.locator("#signup-password").fill(password);
  await page.locator("#signup-submit").click();
  await visible("#ogc-identity");
  created=true;
  console.log("PASS browser signup enters gender/orientation without OTP");
  await screenshot("01-identity");

  await page.locator('#ogc-identity select[name="gender"]').selectOption("Man");
  await page.locator('#ogc-identity select[name="orientation"]').selectOption("Bi");
  await page.locator("#ogc-identity button[type=submit]").click();
  await visible("#ogc-location");
  assert.equal(await page.locator("#ogc-country").inputValue(),"US");
  console.log("PASS default USA ZIP country");
  await screenshot("02-birthdate-location");

  await page.locator('#ogc-location select[name="month"]').selectOption("01");
  await page.locator('#ogc-location select[name="day"]').selectOption("02");
  await page.locator('#ogc-location select[name="year"]').selectOption("1990");
  await page.locator("#ogc-zip").fill("30301");
  await page.locator("#ogc-city-message").getByText(/Ahh, Atlanta/).waitFor({state:"visible",timeout:20000});
  await visible("#ogc-location-ready");
  await page.locator('#ogc-location button[type=submit]').click();
  await visible("#ogc-tile-0");
  assert.equal(await page.locator("#ogc-tile-1").getAttribute("data-locked"),"true");
  await page.locator("#ogc-tile-2").click();
  await visible("#ogc-locked-dialog");
  assert.match(await value("#ogc-locked-title"),/Getting ahead of yourself/);
  await page.locator("#ogc-locked-dialog button").click();
  console.log("PASS birthdate/location, city confirmation, disabled quadrants and teasing popup");
  await screenshot("03-locked-quadrants");

  await page.locator("#ogc-tile-0").click();
  await visible("#ogc-details");
  assert.match(await value("#ogc-identity-description"),/Bi Man/);
  assert.match(await value("#ogc-zodiac"),/Capricorn/);
  await page.locator('input[name="interestedIn"][value="Woman"]').check();
  await page.locator('input[name="openTo"][value="long-term dating"]').check();
  await page.locator('input[name="diet"][value="Other"]').check();
  await page.locator('input[name="drugs"][value="Sometimes"]').check();
  await page.locator('input[name="justWeed"]').check();
  await page.locator('select[name="languageName1"]').selectOption("English");
  await page.locator('select[name="languageLevel1"]').selectOption("Fluently");
  await page.locator('select[name="languageName2"]').selectOption("French");
  await page.locator('select[name="languageLevel2"]').selectOption("Okay");
  await page.locator('select[name="languageName3"]').selectOption("Spanish");
  await visible("#ogc-polyglot");
  await page.locator('select[name="languageLevel3"]').selectOption("Poorly");
  await screenshot("04-profile-checkboxes");
  await page.locator('#ogc-details button[type=submit]').click();
  await visible("#ogc-summary");
  console.log("PASS profile questionnaire, zodiac, independent weed frequency and Latin Easter egg");
  await screenshot("05-self-summary");

  await page.locator('#ogc-summary textarea[name="aboutMe"]').fill(
    "I'm a test account with a short self summary, interested in proving this new onboarding flow works.");
  await page.locator('#ogc-summary button[type=submit]').click();
  await visible("#ogc-tile-0");
  assert.equal(await page.locator("#ogc-tile-1").getAttribute("aria-disabled"),"false");
  assert.equal(await page.locator("#ogc-tile-2").getAttribute("aria-disabled"),"true");
  console.log("PASS summary returns to welcome with profile check and photo unlocked");
  await screenshot("06-photos-unlocked");

  await page.reload({waitUntil:"domcontentloaded"});
  await visible("#ogc-tile-1");
  assert.equal(await page.locator("#ogc-tile-1").getAttribute("aria-disabled"),"false");
  console.log("PASS saved onboarding progress survives full page reload");

  await page.locator("#ogc-delete").click();
  await visible("#ogc-delete-form");
  await page.locator('#ogc-delete-form input[name="password"]').fill(password);
  await page.locator('#ogc-delete-form input[name="confirmation"]').fill("DELETE");
  await page.locator("#ogc-delete-form button[type=submit]").click();
  await page.locator("#ogc-onboarding").waitFor({state:"hidden",timeout:20000});
  deleted=true;
  if(errors.length)throw Error("Uncaught browser exceptions: "+errors.join(" | "));
  console.log("PASS password-confirmed deletion during onboarding without verified email");
} catch(e) {
  await screenshot("error-current-state");
  const message=await page.locator("#ogc-onboard-error").textContent().catch(()=>"");
  const notice=await page.locator("#notice").textContent().catch(()=>"");
  console.error("BROWSER SMOKE FAILED:",String(e?.message??e).slice(0,500));
  console.error("SAVED UI ERROR:",String(message||notice||"no visible error").slice(0,230));
  if(errors.length)console.error("BROWSER EXCEPTIONS:",errors.join(" | ").slice(0,500));
  process.exitCode=1;
} finally {
  await cleanup();
  await context.close();
  await browser.close();
}
