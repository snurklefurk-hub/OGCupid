import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { adultBirthDate, scorePersona } from './onboarding.js';

test('birthdate is a real date and member is at least 18 today', () => {
  const today=new Date('2026-11-13T12:00:00Z');
  assert.equal(adultBirthDate('2008-11-13',today),true);
  assert.equal(adultBirthDate('2008-11-14',today),false);
  assert.equal(adultBirthDate('2007-02-29',today),false);
  assert.equal(adultBirthDate('2000-02-29',today),true);
});

test('Persona requires every answer and derives code from all axes', () => {
  assert.equal(scorePersona(Array(27).fill(2)),null);
  assert.equal(scorePersona([...Array(27).fill(2),null]),null);
  assert.equal(scorePersona(Array(28).fill(0)),null);
  assert.equal(scorePersona(Array(28).fill(2)),'DGLD');
});
