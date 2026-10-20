// The posting rule (scripts/schedule.mjs): the plan's table for October 21 – November 30, 2026, the
// memorial dates, and the invariants for every day through 2027.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchedule, addDays, isWeekend, weekday } from './schedule.mjs';

const brand = {
  rotation: { start: '2026-10-21', evening: ['feature', 'tip', 'feature', 'myth'] },
  memorial: { dates: ['2026-10-25', '2027-04-20', '2027-05-09'] },
};
const { typesFor } = createSchedule(brand);
const short = { 'owner-math': 'O', tip: 'T', myth: 'M', feature: 'F' };
const cell = (d) => { const t = typesFor(d); return t.memorial ? 'memorial' : `${short[t.morning] ?? '-'}${short[t.evening] ?? '-'}`; };

test('reproduces the planned table, October 21 to November 30, 2026', () => {
  // 7 AM then 6 PM, from README "Rotation, October 21 to November 30"
  const plan = {
    '2026-10-21': 'OF', '2026-10-22': 'OT', '2026-10-23': 'OF', '2026-10-24': 'TM', '2026-10-25': 'memorial',
    '2026-10-26': 'OF', '2026-10-27': 'OT', '2026-10-28': 'OF', '2026-10-29': 'OM', '2026-10-30': 'OF',
    '2026-10-31': 'MT', '2026-11-01': 'TF', '2026-11-02': 'OM', '2026-11-03': 'OF', '2026-11-04': 'OT',
    '2026-11-05': 'OF', '2026-11-06': 'OM', '2026-11-07': 'TF', '2026-11-08': 'MT', '2026-11-09': 'OF',
    '2026-11-10': 'OM', '2026-11-11': 'OF', '2026-11-12': 'OT', '2026-11-13': 'OF', '2026-11-14': 'TM',
    '2026-11-15': 'MF', '2026-11-16': 'OT', '2026-11-17': 'OF', '2026-11-18': 'OM', '2026-11-19': 'OF',
    '2026-11-20': 'OT', '2026-11-21': 'MF', '2026-11-22': 'TM', '2026-11-23': 'OF', '2026-11-24': 'OT',
    '2026-11-25': 'OF', '2026-11-26': 'OM', '2026-11-27': 'OF', '2026-11-28': 'MT', '2026-11-29': 'TF',
    '2026-11-30': 'OM',
  };
  for (const [date, want] of Object.entries(plan)) assert.equal(cell(date), want, date);
  const counts = { T: 0, M: 0, F: 0, O: 0 };
  for (const v of Object.values(plan)) if (v !== 'memorial') for (const c of v) counts[c]++;
  assert.deepEqual(counts, { O: 29, T: 16, M: 15, F: 20 }); // 17 rendered owner math + 12 new
});

test('before the rotation starts: owner math on weekday mornings only', () => {
  assert.equal(cell('2026-10-16'), 'O-');
  assert.equal(cell('2026-10-17'), '--');
  assert.equal(cell('2026-10-18'), '--');
  assert.equal(cell('2026-10-20'), 'O-');
});

test('memorial dates take no regular post and do not advance the evening cycle', () => {
  for (const d of brand.memorial.dates) {
    const t = typesFor(d);
    assert.equal(t.memorial, true);
    assert.equal(t.morning, null);
    assert.equal(t.evening, null);
  }
  // Oct 24 evening is a myth; the cycle resumes on Oct 26 with a feature, as if Oct 25 did not exist
  assert.equal(typesFor('2026-10-24').evening, 'myth');
  assert.equal(typesFor('2026-10-26').evening, 'feature');
  assert.equal(typesFor('2027-04-19').evening, 'myth');
  assert.equal(typesFor('2027-04-21').evening, 'feature');
});

test('invariants for every day through 2027', () => {
  let previousEvening = null;
  for (let d = '2026-10-21'; d <= '2027-12-31'; d = addDays(d, 1)) {
    const t = typesFor(d);
    if (t.memorial) continue;
    assert.ok(t.morning && t.evening, `${d} has both slots`);
    assert.notEqual(t.morning, t.evening, `${d}: a day's two posts differ`);
    if (previousEvening) assert.notEqual(t.evening, previousEvening, `${d}: consecutive evenings differ`);
    previousEvening = t.evening;
    if (!isWeekend(d)) assert.equal(t.morning, 'owner-math', `${d}: weekday mornings are owner math`);
    else assert.ok(['tip', 'myth'].includes(t.morning), `${d}: weekend mornings are a tip or a myth`);
    if (weekday(d) === 0) {
      const sat = typesFor(addDays(d, -1));
      if (!sat.memorial) assert.notEqual(sat.morning, t.morning, `${d}: a weekend's two mornings differ`);
    }
  }
});

test('refuses a rotation without a start date', () => {
  assert.throws(() => createSchedule({ rotation: { evening: ['tip'] } }), /rotation.start/);
});
