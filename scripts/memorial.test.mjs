// The memorial post as committed: posts/memorial/2026-10-25/ holds exact copies of the founder's six
// files (memorial/2026-10-25/, git-ignored, on his Mac only), indexed with their checksums; every
// slide is a 1080x1350 JPEG; the caption carries no hashtags; and a dry run of the real publisher for
// 2026-10-25 shows exactly the five slides and the caption, calling nothing.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublisher } from './lib/publisher.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));
const memDir = path.join(root, brand.memorial.dir);
const index = JSON.parse(fs.readFileSync(path.join(memDir, 'index.json'), 'utf8'));
const FILES = ['slide-1.jpg', 'slide-2.jpg', 'slide-3.jpg', 'slide-4.jpg', 'slide-5.jpg', 'caption.txt'];
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Width and height from a JPEG's start-of-frame segment. */
function jpegSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.readUInt16BE(0), 0xffd8, `${file} is not a JPEG`);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error(`${file}: no frame header`);
}

test('memorial dates are a setting: 2026-10-25, 2027-04-20 and 2027-05-09, posted in the morning slot', () => {
  assert.deepEqual(brand.memorial.dates, ['2026-10-25', '2027-04-20', '2027-05-09']);
  assert.equal(brand.memorial.slot, 'morning');
  assert.equal(brand.memorial.dir, 'posts/memorial');
  assert.deepEqual(Object.keys(index), ['2026-10-25'], 'only 2026-10-25 has a memorial post prepared');
});

test('posts/memorial/2026-10-25 holds exactly the six files, matching the checksums in its index', () => {
  const entry = index['2026-10-25'];
  assert.deepEqual(entry.slides, FILES.slice(0, 5));
  assert.equal(entry.caption, 'caption.txt');
  assert.deepEqual(fs.readdirSync(path.join(memDir, '2026-10-25')).filter((f) => !f.startsWith('.')).sort(), [...FILES].sort());
  for (const f of FILES) assert.equal(sha256(path.join(memDir, '2026-10-25', f)), entry.sha256[f], `${f} changed`);
});

test('they are unchanged copies of the founder\'s memorial/2026-10-25 files (when that folder is on this machine)', (t) => {
  const source = path.join(root, 'memorial', '2026-10-25');
  if (!fs.existsSync(source)) return t.skip('memorial/2026-10-25 is git-ignored and only on the founder\'s Mac');
  for (const f of FILES) assert.equal(sha256(path.join(memDir, '2026-10-25', f)), sha256(path.join(source, f)), `${f} differs from memorial/2026-10-25/${f}`);
});

test('every slide is a 1080x1350 JPEG (Instagram crops a carousel to its first slide)', () => {
  for (const f of FILES.slice(0, 5)) assert.deepEqual(jpegSize(path.join(memDir, '2026-10-25', f)), { width: 1080, height: 1350 }, f);
});

test('the memorial caption has no hashtags and fits Instagram\'s 2,200 characters', () => {
  const caption = fs.readFileSync(path.join(memDir, '2026-10-25', 'caption.txt'), 'utf8');
  assert.doesNotMatch(caption, /(^|\s)#[\p{L}\p{N}_]+/u);
  assert.ok(caption.trim().length <= 2200);
});

test('dry run of the real repo for 2026-10-25: exactly the five slides and the caption, nothing called', async () => {
  const logs = [];
  const publisher = createPublisher({
    root,
    fetch: () => { throw new Error('fetch must not be called'); },
    now: () => new Date('2026-10-20T19:00:00Z'),
    env: { DRY_RUN: 'true', POST_DATE: '2026-10-25' },
    log: (m) => logs.push(String(m)),
    warn: (m) => logs.push(String(m)),
  });
  const result = await publisher.publish();
  assert.deepEqual(result.errors, []);
  assert.equal(result.posted.length, 0);
  assert.equal(result.dryRun.length, 1);
  const [d] = result.dryRun;
  assert.equal(d.slot, 'memorial');
  assert.deepEqual(d.slides, FILES.slice(0, 5).map((f) => `${brand.pagesBaseUrl}/posts/memorial/2026-10-25/${f}`));
  assert.equal(d.caption, fs.readFileSync(path.join(memDir, '2026-10-25', 'caption.txt'), 'utf8').trim());
  assert.doesNotMatch(logs.join('\n'), /WARNING/);
  assert.ok(!fs.existsSync(path.join(root, 'published', '2026-10-25-memorial.json')) || JSON.parse(fs.readFileSync(path.join(root, 'published', '2026-10-25-memorial.json'), 'utf8')).date === '2026-10-25');
});

// ---- scripts/memorial.mjs: the check verify runs, and the sync, against a temporary repo with made-up
// files (never the founder's photo) ----

const JPEG = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`made-up slide ${n}`)]);

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhea-memorial-'));
  fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify(brand));
  const src = path.join(dir, 'memorial', '2026-10-25');
  fs.mkdirSync(src, { recursive: true });
  for (const n of [1, 2, 3]) fs.writeFileSync(path.join(src, `slide-${n}.jpg`), JPEG(n));
  fs.writeFileSync(path.join(src, 'caption.txt'), 'A made-up caption.\n');
  // The founder's other files in the same folder are never copied
  fs.writeFileSync(path.join(src, 'cover.jpg'), JPEG('cover'));
  fs.writeFileSync(path.join(src, 'reel.mp4'), 'a draft');
  fs.writeFileSync(path.join(dir, 'memorial', 'notes.md'), 'private notes');
  return { dir, src };
}

const snapshot = (dir) => Object.fromEntries(fs.readdirSync(dir, { recursive: true }).sort().map((f) => {
  const p = path.join(dir, f);
  return [f, fs.statSync(p).isDirectory() ? 'dir' : `${sha256(p)} ${fs.statSync(p).mtimeMs}`];
}));

test('memorial:sync copies only slide-N.jpg and caption.txt, writes their checksums, and never changes memorial/', async () => {
  const { compareMemorial, syncMemorial } = await import('./memorial.mjs');
  const { dir, src } = tempRepo();
  try {
    const before = snapshot(path.join(dir, 'memorial'));
    assert.match(compareMemorial(dir, brand).join('\n'), /memorial 2026-10-25: memorial\/2026-10-25\/ has a memorial post, but nothing is committed/);
    const dry = syncMemorial({ root: dir, date: '2026-10-25', dryRun: true, log: () => {} });
    assert.deepEqual(dry.changed, ['slide-1.jpg', 'slide-2.jpg', 'slide-3.jpg', 'caption.txt']);
    assert.ok(!fs.existsSync(path.join(dir, 'posts')), 'a dry run writes nothing');
    syncMemorial({ root: dir, date: '2026-10-25', log: () => {} });
    const out = path.join(dir, 'posts', 'memorial', '2026-10-25');
    assert.deepEqual(fs.readdirSync(out).sort(), ['caption.txt', 'slide-1.jpg', 'slide-2.jpg', 'slide-3.jpg']);
    for (const f of fs.readdirSync(out)) assert.equal(sha256(path.join(out, f)), sha256(path.join(src, f)));
    const idx = JSON.parse(fs.readFileSync(path.join(dir, 'posts', 'memorial', 'index.json'), 'utf8'))['2026-10-25'];
    assert.deepEqual(idx.slides, ['slide-1.jpg', 'slide-2.jpg', 'slide-3.jpg']);
    assert.equal(idx.sha256['caption.txt'], sha256(path.join(src, 'caption.txt')));
    assert.deepEqual(compareMemorial(dir, brand), []);
    assert.deepEqual(snapshot(path.join(dir, 'memorial')), before, 'memorial/ is read, never written');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an edit to the founder\'s files after the copy is caught by name until it is synced', async () => {
  const { compareMemorial, syncMemorial } = await import('./memorial.mjs');
  const { dir, src } = tempRepo();
  try {
    syncMemorial({ root: dir, date: '2026-10-25', log: () => {} });
    fs.writeFileSync(path.join(src, 'slide-2.jpg'), JPEG('2 edited'));
    fs.writeFileSync(path.join(src, 'caption.txt'), 'A reworded caption.\n');
    fs.writeFileSync(path.join(src, 'slide-4.jpg'), JPEG(4));
    const problems = compareMemorial(dir, brand).join('\n');
    assert.match(problems, /the job would post an older version/);
    assert.match(problems, /slide-2\.jpg/);
    assert.match(problems, /caption\.txt/);
    assert.match(problems, /slide-4\.jpg \(not copied\)/);
    assert.match(problems, /npm run memorial:sync -- --date 2026-10-25/);
    const { changed, stale } = syncMemorial({ root: dir, date: '2026-10-25', log: () => {} });
    assert.deepEqual(changed.sort(), ['caption.txt', 'slide-2.jpg', 'slide-4.jpg']);
    assert.deepEqual(stale, []);
    assert.deepEqual(compareMemorial(dir, brand), []);
    // A slide the founder removed leaves the committed carousel too
    fs.rmSync(path.join(src, 'slide-4.jpg'));
    assert.match(compareMemorial(dir, brand).join('\n'), /slide-4\.jpg \(no longer in memorial\/2026-10-25\/\)/);
    assert.deepEqual(syncMemorial({ root: dir, date: '2026-10-25', log: () => {} }).stale, ['slide-4.jpg']);
    assert.ok(!fs.existsSync(path.join(dir, 'posts', 'memorial', '2026-10-25', 'slide-4.jpg')));
    assert.deepEqual(compareMemorial(dir, brand), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a committed copy that no longer matches its own checksum is caught, and sync refuses a non-memorial date', async () => {
  const { compareMemorial, syncMemorial } = await import('./memorial.mjs');
  const { dir } = tempRepo();
  try {
    syncMemorial({ root: dir, date: '2026-10-25', log: () => {} });
    fs.rmSync(path.join(dir, 'memorial'), { recursive: true }); // as on GitHub, where memorial/ never is
    assert.deepEqual(compareMemorial(dir, brand), []);
    fs.writeFileSync(path.join(dir, 'posts', 'memorial', '2026-10-25', 'slide-1.jpg'), JPEG('swapped'));
    assert.match(compareMemorial(dir, brand).join('\n'), /slide-1\.jpg does not match its checksum/);
    assert.throws(() => syncMemorial({ root: dir, date: '2026-10-26', log: () => {} }), /not a memorial date/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the real repo: the committed memorial copies agree with the founder\'s files (verify runs the same check)', async () => {
  const { compareMemorial } = await import('./memorial.mjs');
  assert.deepEqual(compareMemorial(root, brand), []);
});

test('memorial/ is the founder\'s and never published: his notes and drafts are git-ignored', () => {
  const ignored = (p) => spawnSync('git', ['-C', root, 'check-ignore', '-q', p]).status === 0;
  assert.ok(ignored('memorial/kathy.md'), 'memorial/kathy.md must be git-ignored: Pages serves every committed file publicly');
  assert.ok(ignored('memorial/src/photo.jpg'));
  assert.ok(ignored('memorial/2026-10-25/slide-1.jpg'));
  assert.ok(!ignored('posts/memorial/2026-10-25/slide-1.jpg'), 'the committed copies are what the job posts');
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gi, /^memorial\/src\/$/m);
  assert.match(gi, /^memorial\/20\*\/$/m);
});
