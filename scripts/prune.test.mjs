// scripts/prune.mjs against a temporary repository: only media of posts that went out more than N
// days ago is removed; unposted posts, the memorial carousel and feature recordings never are.
//
//   npm test
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prune } from './prune.mjs';

const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realBrand = JSON.parse(fs.readFileSync(path.join(realRoot, 'brand.json'), 'utf8'));
const NOW = new Date('2026-12-15T20:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const roots = [];
after(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rhea-prune-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'brand.json'), JSON.stringify(realBrand));
  const post = (folder) => {
    const dir = path.join(root, 'posts', folder);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of ['reel.mp4', 'cover.jpg', 'caption.txt', 'meta.json']) fs.writeFileSync(path.join(dir, f), f);
  };
  const mark = (file, data) => fs.writeFileSync(path.join(root, 'published', file), JSON.stringify(data));
  fs.mkdirSync(path.join(root, 'published'), { recursive: true });
  // Posted 40 days ago, morning and evening
  post('2026-11-05-card-fees'); mark('2026-11-05.json', { date: '2026-11-05', folder: '2026-11-05-card-fees', postedAt: daysAgo(40) });
  post('2026-11-05-evening-deposits'); mark('2026-11-05-evening.json', { date: '2026-11-05', slot: 'evening', folder: '2026-11-05-evening-deposits', postedAt: daysAgo(40) });
  // Posted 10 days ago
  post('2026-12-05-recent'); mark('2026-12-05.json', { date: '2026-12-05', folder: '2026-12-05-recent', postedAt: daysAgo(10) });
  // An old marker without a folder field: found through the index
  post('2026-11-01-no-folder-field'); mark('2026-11-01.json', { date: '2026-11-01', postedAt: daysAgo(44) });
  // Never posted (an old date with no marker)
  post('2026-11-02-never-posted');
  // An old marker whose folder an index still lists for a date with no marker: protected
  post('2026-11-03-shared'); mark('2026-11-03.json', { date: '2026-11-03', folder: '2026-11-03-shared', postedAt: daysAgo(42) });
  // A marker that tries to point outside posts/
  mark('2026-11-04.json', { date: '2026-11-04', folder: '../render/features/overview-stores', postedAt: daysAgo(41) });
  // Memorial: an old marker, never pruned
  fs.mkdirSync(path.join(root, 'posts', 'memorial', '2026-10-25'), { recursive: true });
  for (const f of ['slide-1.jpg', 'caption.txt']) fs.writeFileSync(path.join(root, 'posts', 'memorial', '2026-10-25', f), f);
  mark('2026-10-25-memorial.json', { date: '2026-10-25', slot: 'memorial', folder: 'posts/memorial/2026-10-25', postedAt: daysAgo(51) });
  // Feature recordings
  fs.mkdirSync(path.join(root, 'render', 'features', 'overview-stores'), { recursive: true });
  fs.writeFileSync(path.join(root, 'render', 'features', 'overview-stores', 'recording.mp4'), 'rec');
  fs.writeFileSync(path.join(root, 'posts', 'index.json'), JSON.stringify({
    '2026-11-01': '2026-11-01-no-folder-field', '2026-11-02': '2026-11-02-never-posted', '2026-11-03': '2026-11-03-shared',
    '2026-11-05': '2026-11-05-card-fees', '2026-12-05': '2026-12-05-recent',
  }));
  fs.writeFileSync(path.join(root, 'posts', 'index-evening.json'), JSON.stringify({ '2026-11-05': '2026-11-05-evening-deposits', '2026-11-06': '2026-11-03-shared' }));
  return root;
}

const exists = (root, p) => fs.existsSync(path.join(root, p));

test('removes reel.mp4 and cover.jpg of posts posted more than 30 days ago, keeping caption and meta', () => {
  const root = makeRepo();
  const r = prune({ root, now: NOW, log: () => {} });
  assert.deepEqual(r.removed.sort(), [
    'posts/2026-11-01-no-folder-field/cover.jpg', 'posts/2026-11-01-no-folder-field/reel.mp4',
    'posts/2026-11-05-card-fees/cover.jpg', 'posts/2026-11-05-card-fees/reel.mp4',
    'posts/2026-11-05-evening-deposits/cover.jpg', 'posts/2026-11-05-evening-deposits/reel.mp4',
  ]);
  for (const f of r.removed) assert.ok(!exists(root, f));
  assert.ok(exists(root, 'posts/2026-11-05-card-fees/caption.txt'));
  assert.ok(exists(root, 'posts/2026-11-05-card-fees/meta.json'));
});

test('never touches recent posts, unposted posts, the memorial carousel or feature recordings', () => {
  const root = makeRepo();
  const r = prune({ root, now: NOW, log: () => {} });
  assert.ok(exists(root, 'posts/2026-12-05-recent/reel.mp4'));
  assert.ok(exists(root, 'posts/2026-11-02-never-posted/reel.mp4'));
  assert.ok(exists(root, 'posts/2026-11-03-shared/reel.mp4'));
  assert.deepEqual(r.protected, ['2026-11-03-shared']);
  assert.ok(exists(root, 'posts/memorial/2026-10-25/slide-1.jpg'));
  assert.ok(exists(root, 'render/features/overview-stores/recording.mp4'));
});

test('--dry-run lists the same files and deletes nothing; --days changes the window', () => {
  const root = makeRepo();
  const dry = prune({ root, now: NOW, dryRun: true, log: () => {} });
  assert.equal(dry.removed.length, 6);
  for (const f of dry.removed) assert.ok(exists(root, f));
  assert.equal(prune({ root, now: NOW, days: 60, dryRun: true, log: () => {} }).removed.length, 0);
  assert.equal(prune({ root, now: NOW, days: 5, dryRun: true, log: () => {} }).removed.length, 8);
  assert.throws(() => prune({ root, now: NOW, days: 0, log: () => {} }), /--days/);
});

test('the live repo: nothing is old enough to prune today', () => {
  const r = prune({ root: realRoot, now: new Date('2026-10-20T20:00:00Z'), dryRun: true, log: () => {} });
  assert.deepEqual(r.removed, []);
});
