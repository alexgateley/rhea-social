// The schedule as written down: the workflow's crons cover 7 AM and 6 PM Pacific in both PDT and
// PST, its inputs are date, slot, dry_run and by_hand, every run checks out main as it is when it
// starts, and both launch agents kick the same workflow with slot=auto without reading anything from
// ~/Desktop. Nothing is dispatched or loaded: the agents' command runs once against a fake gh and
// curl in a temporary HOME.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

test('every run checks out main as it is when the run starts, so a queued run sees the marker a run before it pushed', () => {
  assert.match(yml, /- uses: actions\/checkout@v4\n\s+with:\n\s+ref: \$\{\{ github\.ref \}\}/);
});

test('by_hand records a by-hand post on main and posts nothing; the Monday refresh runs even after a failed post', () => {
  assert.match(yml, /by_hand:\n\s+description: .*\n\s+type: boolean\n\s+default: false/);
  assert.match(yml, /- name: Publish what is due\n\s+if: steps\.creds\.outputs\.ready == 'true' && inputs\.by_hand != true/);
  assert.match(yml, /- name: Record a post made by hand\n\s+if: inputs\.by_hand == true/);
  assert.match(yml, /node scripts\/publish\.mjs mark --date "\$POST_DATE" --slot "\$SLOT"/);
  assert.match(yml, /- name: Record what was posted\n\s+if: always\(\) && \(steps\.creds\.outputs\.ready == 'true' \|\| inputs\.by_hand == true\)/);
  assert.match(yml, /- name: Refresh the Instagram token \(Monday mornings\)\n\s+if: always\(\) && /);
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

test('kick-post.sh takes a slot (auto by default) and kicks the same workflow', () => {
  const kick = read('scripts/kick-post.sh');
  assert.match(kick, /WORKFLOW="Post @RunonRhea"/);
  assert.match(kick, /SLOT="\$\{1:-auto\}"/);
  assert.match(kick, /-f slot="\$SLOT"/);
  assert.doesNotMatch(kick, /weekend/);
  const dry = spawnSync('sh', [path.join(root, 'scripts/kick-post.sh')], { env: { ...process.env, KICK_DRY_RUN: 'true' }, encoding: 'utf8' });
  assert.equal(dry.stdout.trim(), 'would run: gh workflow run "Post @RunonRhea" --repo alexgateley/rhea-social -f slot=auto -f dry_run=false');
});

/** The agent's ProgramArguments, read from the plist's XML (plain strings, entities decoded). */
function programArguments(plist) {
  const block = plist.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)[1];
  const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return [...block.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => decode(m[1]));
}

test('the launch agents kick slot=auto at 7:05/9:05 AM and 6:05/8:05 PM, and read nothing from ~/Desktop', () => {
  for (const [slot, hours] of [['morning', [7, 9]], ['evening', [18, 20]]]) {
    const plist = read(`launchd/com.rhea.${slot}.plist`);
    assert.match(plist, new RegExp(`<string>com\\.rhea\\.${slot}</string>`));
    const got = [...plist.matchAll(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>\s*<key>Minute<\/key>\s*<integer>5<\/integer>/g)].map((m) => Number(m[1]));
    assert.deepEqual(got, hours);
    const argv = programArguments(plist);
    assert.deepEqual([argv[0], argv[1], argv[3]], ['/bin/sh', '-c', slot]);
    // macOS protects ~/Desktop from launchd jobs: no argument, path or log may point there
    for (const a of argv) assert.doesNotMatch(a, /Desktop/, `${slot}: the agent must not read from ~/Desktop`);
    assert.doesNotMatch(plist.replace(/<!--[\s\S]*?-->/g, ''), /Desktop/);
    assert.match(argv[2], /gh workflow run "Post @RunonRhea" --repo alexgateley\/rhea-social -f slot=auto -f dry_run=false/);
    if (process.platform === 'darwin' && fs.existsSync('/usr/bin/plutil')) {
      const lint = spawnSync('/usr/bin/plutil', ['-lint', path.join(root, `launchd/com.rhea.${slot}.plist`)], { encoding: 'utf8' });
      assert.equal(lint.status, 0, lint.stdout + lint.stderr);
    }
  }
  assert.ok(!fs.existsSync(path.join(root, 'launchd', 'com.rhea.ownermath.plist')), 'the old weekday-only agent is gone');
});

test('the agents\' command runs: it waits for the network, kicks slot=auto and logs to ~/Library/Logs/rhea-runonrhea.log', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rhea-agent-'));
  try {
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin);
    // Fakes: curl answers at once, gh records its arguments and prints what the real one prints
    fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\nprintf '%s\\n' "$@" > "${tmp}/gh-args"\necho "Created workflow_dispatch event"\n`, { mode: 0o755 });
    for (const slot of ['morning', 'evening']) {
      const argv = programArguments(read(`launchd/com.rhea.${slot}.plist`));
      const r = spawnSync(argv[0], argv.slice(1), { env: { HOME: tmp, PATH: `${bin}:/usr/bin:/bin` }, encoding: 'utf8', cwd: tmp });
      assert.equal(r.status, 0, r.stderr);
      const args = fs.readFileSync(path.join(tmp, 'gh-args'), 'utf8').trim().split('\n');
      assert.deepEqual(args, ['workflow', 'run', 'Post @RunonRhea', '--repo', 'alexgateley/rhea-social', '-f', 'slot=auto', '-f', 'dry_run=false']);
    }
    const log = fs.readFileSync(path.join(tmp, 'Library', 'Logs', 'rhea-runonrhea.log'), 'utf8');
    assert.match(log, /kicked auto \(morning agent\): Created workflow_dispatch event/);
    assert.match(log, /kicked auto \(evening agent\): Created workflow_dispatch event/);
    // A failed kick is logged as FAILED and exits non-zero
    fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\necho "could not find workflow" >&2\nexit 1\n', { mode: 0o755 });
    const argv = programArguments(read('launchd/com.rhea.morning.plist'));
    const bad = spawnSync(argv[0], argv.slice(1), { env: { HOME: tmp, PATH: `${bin}:/usr/bin:/bin` }, encoding: 'utf8', cwd: tmp });
    assert.equal(bad.status, 1);
    assert.match(fs.readFileSync(path.join(tmp, 'Library', 'Logs', 'rhea-runonrhea.log'), 'utf8'), /FAILED to kick auto \(morning agent\): could not find workflow/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

function nextDay(d) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
