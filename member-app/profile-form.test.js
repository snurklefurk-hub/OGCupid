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
