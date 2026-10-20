// The schedule as written down: the workflow's crons cover 7 AM and 6 PM Pacific in both PDT and
// PST, its inputs are date, slot and dry_run, and the kick script and both launch agents name the
// same workflow, slots and real path. Text checks only: nothing is run, dispatched or loaded.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localParts } from './lib/publisher.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const yml = read('.github/workflows/post.yml');
const brand = JSON.parse(read('brand.json'));
const crons = [...yml.matchAll(/cron: '(\d+) (\d+) \* \* \*'/g)].map((m) => ({ minute: Number(m[1]), hour: Number(m[2]) }));

test('the workflow is "Post @RunonRhea", every day, with date, slot and dry_run inputs', () => {
  assert.match(yml, /^name: Post @RunonRhea$/m);
  assert.equal(crons.length, 6);
  assert.doesNotMatch(yml, /cron: '.* 1-5'/);
  assert.match(yml, /slot:\n\s+description: .*\n\s+type: choice\n\s+options: \[auto, morning, evening\]/);
  assert.match(yml, /SLOT: \$\{\{ inputs\.slot \}\}/);
  assert.match(yml, /POST_DATE: \$\{\{ inputs\.date \}\}/);
  assert.match(yml, /group: post-runonrhea/);
  assert.match(yml, /node scripts\/prune\.mjs/);
});

test('some cron lands within an hour after each slot opens, in summer and in winter', () => {
  // A summer and a winter day; for each slot, the first cron at or after the slot's hour (Pacific)
  for (const day of ['2026-07-15', '2026-12-15']) {
    for (const [name, slot] of Object.entries(brand.slots)) {
      const hits = [];
      for (const c of crons) {
        for (const d of [day, nextDay(day)]) {
          const at = new Date(`${d}T${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}:00Z`);
          const local = localParts(at, brand.timezone);
          if (local.date === day && local.hour === slot.hour) hits.push(at.toISOString());
        }
      }
      assert.ok(hits.length >= 1, `${name} on ${day}: no cron in the ${slot.hour}:00 hour Pacific`);
    }
  }
});

test('kick-post.sh takes a slot and kicks the same workflow; the launch agents pass morning and evening with the real path', () => {
  const kick = read('scripts/kick-post.sh');
  assert.match(kick, /WORKFLOW="Post @RunonRhea"/);
  assert.match(kick, /-f slot="\$SLOT"/);
  assert.doesNotMatch(kick, /weekend/);
  for (const [slot, hours] of [['morning', [7, 9]], ['evening', [18, 20]]]) {
    const plist = read(`launchd/com.rhea.${slot}.plist`);
    assert.match(plist, /<string>\/Users\/alex\/Desktop\/rhea-social\/scripts\/kick-post\.sh<\/string>/);
    assert.match(plist, new RegExp(`<string>${slot}</string>\\s*</array>`));
    assert.match(plist, new RegExp(`<string>com\\.rhea\\.${slot}</string>`));
    const got = [...plist.matchAll(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>\s*<key>Minute<\/key>\s*<integer>5<\/integer>/g)].map((m) => Number(m[1]));
    assert.deepEqual(got, hours);
  }
  assert.ok(!fs.existsSync(path.join(root, 'launchd', 'com.rhea.ownermath.plist')), 'the old weekday-only agent is gone');
});

function nextDay(d) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
