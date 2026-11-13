import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./member-profile.ts', import.meta.url), 'utf8');
const queryBuilder = source.slice(source.indexOf('const columns = profileTextFields.map'), source.indexOf('const result = await withMember(userId, async client => {', source.indexOf('const columns = profileTextFields.map')));

test('profile INSERT binds every field and preserves omitted update fields', () => {
  const profileTextFields = [['work', 'work', 200], ['vaping', 'vaping', 100]];
  for (const fields of [{ work: 'Engineer', vaping: 'Never' }, { work: '' }, {}]) {
    const sql = vm.runInNewContext(`${queryBuilder}; sql`, { profileTextFields, fields });
    assert.deepEqual([...sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1])), [1, 2, 3, 4, 5, 6]);
    const updates = sql.split('DO UPDATE SET')[1];
    assert.equal(updates.includes('work = EXCLUDED.work'), Object.hasOwn(fields, 'work'));
    assert.equal(updates.includes('vaping = EXCLUDED.vaping'), Object.hasOwn(fields, 'vaping'));
    assert.equal(updates.includes('display_name ='), false);
  }
});
