// The memorial post as committed: posts/memorial/2026-10-25/ holds exact copies of the founder's six
// files (memorial/2026-10-25/, git-ignored, on his Mac only), indexed with their checksums; every
// slide is a 1080x1350 JPEG; the caption carries no hashtags; and a dry run of the real publisher for
// 2026-10-25 shows exactly the five slides and the caption, calling nothing.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
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
