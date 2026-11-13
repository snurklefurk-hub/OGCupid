import test from 'node:test';
import assert from 'node:assert/strict';
import { validProfileChoice } from './profile-choices.js';
test('controlled details accept supported values and reject new arbitrary values', () => {
  assert.equal(validProfileChoice('bodyType', 'Athletic'), true);
  assert.equal(validProfileChoice('bodyType', 'made up'), false);
  assert.equal(validProfileChoice('relationshipType', 'Strictly Polyamorous'), false);
  assert.equal(validProfileChoice('relationshipType', 'Strictly Polyamorous', 'Strictly Polyamorous'), true);
  assert.equal(validProfileChoice('vaping', 'Just weed'), true);
  assert.equal(validProfileChoice('vaping', 'Just weed · Often'), true);
  assert.equal(validProfileChoice('drugs', 'Just weed · Sometimes'), true);
});
test('legacy values can be retained, replaced, or explicitly cleared', () => {
  assert.equal(validProfileChoice('bodyType', 'legacy', 'legacy'), true);
  assert.equal(validProfileChoice('bodyType', 'new arbitrary', 'legacy'), false);
  assert.equal(validProfileChoice('bodyType', '', 'legacy'), true);
  assert.equal(validProfileChoice('bodyType', 'Average', 'legacy'), true);
});
