import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

test('profile draft and preview have their required form controls', () => {
  for (const name of ['aboutMe', 'age', 'displayName', 'diet', 'education', 'relationshipType']) {
    assert.ok(html.includes(`name="${name}"`), `missing ${name}`);
  }
  assert.ok(html.includes('id="bio-count"'));
  assert.equal((html.match(/name="aboutMe"/g) || []).length, 1);
});

test('qualified choices and paired choices restore their editable components', () => {
  const functions = source.slice(source.indexOf('function restoreQualifiedChoice'), source.indexOf('function readProfileDraft'));
  const context = vm.createContext({});
  vm.runInContext(functions, context);
  const form = { elements: { diet: {}, dietStrict: {}, religion: {}, religionImportance: {} } };
  context.restoreQualifiedChoice(form, 'diet', 'dietStrict', 'Strictly Vegan', 'Strictly ');
  assert.equal(form.elements.diet.value, 'Vegan');
  assert.equal(form.elements.dietStrict.checked, true);
  context.restorePairedChoice(form, 'religion', 'religionImportance', "Atheism, and it's really important");
  assert.equal(form.elements.religion.value, 'Atheism');
  assert.equal(form.elements.religionImportance.value, "and it's really important");
  context.restoreQualifiedChoice(form, 'diet', 'dietStrict', 'Omnivore', 'Strictly ');
  assert.equal(form.elements.dietStrict.checked, false);
});

test('profile changes retain the deployed photo and home interfaces', () => {
  assert.ok(source.includes('handlePhoto') || source.includes('photoUI'));
  assert.ok(html.includes('id="homework-dashboard"'));
  assert.ok(!html.includes('Your homework.'));
});

test('profile submit saves without the removed search-origin control', async () => {
  let submit;
  let pending;
  let saved;
  const draft = { cityRegion: '', locality: null, searchOrigin: null, work: 'QA' };
  const form = { elements: {}, reportValidity: () => true, querySelector: () => ({}) };
  const handler = source.slice(source.indexOf('  $("profile-form").addEventListener("submit"'), source.indexOf('  $("question-skip").addEventListener'));
  vm.runInNewContext(handler, {
    $: () => ({ addEventListener: (_event, callback) => { submit = callback; } }),
    operation: (_button, _label, callback) => { pending = callback(); },
    readProfileDraft: () => draft,
    cachedProfile: null,
    requestProfile: async (method, payload) => { assert.equal(method, 'PUT'); assert.equal(payload, draft); return { profile: payload }; },
    showStoredProfile: profile => { saved = profile; },
    message: () => {},
  });
  submit({ preventDefault() {}, currentTarget: form });
  await pending;
  assert.equal(saved, draft);
});
