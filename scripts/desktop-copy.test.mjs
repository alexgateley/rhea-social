// scripts/desktop-copy.mjs against a temporary repository and a temporary "Instagram Reels to edit"
// folder: exact names in day folders, each file copied once, deleted files and emptied day folders
// never coming back, the memorial day's folder and the other accounts' folders and list untouched.
// Never the real Desktop.
//
//   npm test
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTarget, desktopCopy } from './desktop-copy.mjs';

const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realBrand = JSON.parse(fs.readFileSync(path.join(realRoot, 'brand.json'), 'utf8'));
const temps = [];
after(() => { for (const r of temps) fs.rmSync(r, { recursive: true, force: true }); });
const tmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); temps.push(d); return d; };

const POSTS = [
  { date: '2026-10-19', slot: 'morning', slug: 'labor-percent', type: 'owner-math', posted: true },
  { date: '2026-10-20', slot: 'morning', slug: 'loaded-labor', type: null }, // an existing folder: meta.json without type
  { date: '2026-10-21', slot: 'morning', slug: 'sales-per-labor-hour', type: 'owner-math' },
  { date: '2026-10-21', slot: 'evening', slug: 'overview-stores', type: 'feature' },
  { date: '2026-10-24', slot: 'morning', slug: 'weekly-labor-check', type: 'tip' },
  { date: '2026-10-24', slot: 'evening', slug: 'profit-is-cash', type: 'myth' },
  { date: '2026-10-25', slot: 'morning', slug: 'should-never-copy', type: 'tip' }, // memorial date: must be ignored
];

function makeRepo() {
  const root = tmp('rhea-desktop-repo-');
  fs.writeFileSync(path.join(root, 'brand.json'), JSON.stringify(realBrand));
  fs.mkdirSync(path.join(root, 'published'), { recursive: true });
  const idx = { morning: {}, evening: {} };
  for (const p of POSTS) {
    const folder = p.slot === 'evening' ? `${p.date}-evening-${p.slug}` : `${p.date}-${p.slug}`;
    const dir = path.join(root, 'posts', folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'reel.mp4'), `video ${folder}`);
    fs.writeFileSync(path.join(dir, 'caption.txt'), `Caption for ${folder}\n\n#RunonRhea\n`);
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ date: p.date, slug: p.slug, ...(p.type ? { type: p.type, slot: p.slot } : {}) }));
    idx[p.slot][p.date] = folder;
    if (p.posted) fs.writeFileSync(path.join(root, 'published', `${p.date}.json`), '{}');
  }
  fs.writeFileSync(path.join(root, 'posts', 'index.json'), JSON.stringify(idx.morning));
  fs.writeFileSync(path.join(root, 'posts', 'index-evening.json'), JSON.stringify(idx.evening));
  return root;
}

/** A fake ~/Desktop with "Instagram Reels to edit": the other accounts, their shared .copied, and the memorial folder. */
function makeHome() {
  const home = tmp('rhea-desktop-home-');
  const shared = path.join(home, 'Desktop', 'Instagram Reels to edit');
  for (const a of ['@icubasics', '@rnbasicsnclex', '@themedicbasics']) {
    fs.mkdirSync(path.join(shared, a), { recursive: true });
    fs.writeFileSync(path.join(shared, a, '2026-10-21 7AM question cmc.txt'), 'theirs');
  }
  fs.writeFileSync(path.join(shared, '.copied'), '@icubasics/2026-10-21 7AM question cmc\n');
  const memorial = path.join(shared, '@runonrhea', '2026-10-25');
  fs.mkdirSync(memorial, { recursive: true });
  for (const f of ['caption.txt', 'slide-1.jpg']) fs.writeFileSync(path.join(memorial, f), `founder's ${f}`);
  return { home, shared, dir: path.join(shared, '@runonrhea'), memorial };
}

/** Every file under a folder with its content, for before/after comparisons. */
function snapshot(dir) {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8'); } };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

const quiet = () => {};

test('copies every Reel from 2026-10-20 into day folders, named date first like the other accounts', () => {
  const root = makeRepo();
  const { home, dir } = makeHome();
  const r = desktopCopy({ root, home, dir, log: quiet });
  const files = Object.keys(snapshot(dir)).filter((f) => !f.startsWith('2026-10-25/')).sort();
  assert.deepEqual(files, [
    '.captions.json',
    '.copied',
    '2026-10-20/2026-10-20 7AM owner math loaded-labor.mp4',
    '2026-10-20/2026-10-20 7AM owner math loaded-labor.txt',
    '2026-10-21/2026-10-21 6PM feature overview-stores.mp4',
    '2026-10-21/2026-10-21 6PM feature overview-stores.txt',
    '2026-10-21/2026-10-21 7AM owner math sales-per-labor-hour.mp4',
    '2026-10-21/2026-10-21 7AM owner math sales-per-labor-hour.txt',
    '2026-10-24/2026-10-24 6PM myth profit-is-cash.mp4',
    '2026-10-24/2026-10-24 6PM myth profit-is-cash.txt',
    '2026-10-24/2026-10-24 7AM tip weekly-labor-check.mp4',
    '2026-10-24/2026-10-24 7AM tip weekly-labor-check.txt',
  ]);
  assert.equal(r.added.length, 10);
  assert.equal(fs.readFileSync(path.join(dir, '2026-10-21', '2026-10-21 6PM feature overview-stores.mp4'), 'utf8'), 'video 2026-10-21-evening-overview-stores');
  assert.equal(fs.readFileSync(path.join(dir, '2026-10-21', '2026-10-21 6PM feature overview-stores.txt'), 'utf8'), 'Caption for 2026-10-21-evening-overview-stores\n\n#RunonRhea\n');
  const list = fs.readFileSync(path.join(dir, '.copied'), 'utf8').trim().split('\n');
  assert.equal(list.length, 10);
  assert.ok(list.includes('2026-10-21/2026-10-21 7AM owner math sales-per-labor-hour.mp4'));
  assert.ok(!Object.keys(snapshot(dir)).some((f) => f.includes('.partial')));
});

test('each file is copied once: a second run adds nothing; deleted files and emptied day folders never come back', () => {
  const root = makeRepo();
  const { home, dir } = makeHome();
  desktopCopy({ root, home, dir, log: quiet });
  assert.equal(desktopCopy({ root, home, dir, log: quiet }).added.length, 0);
  fs.rmSync(path.join(dir, '2026-10-21', '2026-10-21 7AM owner math sales-per-labor-hour.mp4'));
  fs.rmSync(path.join(dir, '2026-10-24'), { recursive: true });
  const again = desktopCopy({ root, home, dir, log: quiet });
  assert.deepEqual(again.added, []);
  assert.ok(!fs.existsSync(path.join(dir, '2026-10-24')));
  assert.ok(!fs.existsSync(path.join(dir, '2026-10-21', '2026-10-21 7AM owner math sales-per-labor-hour.mp4')));
  assert.ok(fs.existsSync(path.join(dir, '2026-10-21', '2026-10-21 7AM owner math sales-per-labor-hour.txt')));
});

test('new posts (a later render) are added; a changed caption follows only while the post is unposted and both files are there', () => {
  const root = makeRepo();
  const { home, dir } = makeHome();
  desktopCopy({ root, home, dir, log: quiet });
  // A new evening post appears
  const folder = '2026-10-22-evening-weekly-tip';
  fs.mkdirSync(path.join(root, 'posts', folder));
  fs.writeFileSync(path.join(root, 'posts', folder, 'reel.mp4'), 'v');
  fs.writeFileSync(path.join(root, 'posts', folder, 'caption.txt'), 'c');
  fs.writeFileSync(path.join(root, 'posts', folder, 'meta.json'), JSON.stringify({ slug: 'weekly-tip', type: 'tip', slot: 'evening' }));
  const evIdx = JSON.parse(fs.readFileSync(path.join(root, 'posts', 'index-evening.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'posts', 'index-evening.json'), JSON.stringify({ ...evIdx, '2026-10-22': folder }));
  // Captions change: one unposted, one already posted (2026-10-20 gets a marker now)
  fs.writeFileSync(path.join(root, 'posts', '2026-10-21-sales-per-labor-hour', 'caption.txt'), 'New first line\n');
  fs.writeFileSync(path.join(root, 'published', '2026-10-20.json'), '{}');
  fs.writeFileSync(path.join(root, 'posts', '2026-10-20-loaded-labor', 'caption.txt'), 'Changed after posting\n');
  const r = desktopCopy({ root, home, dir, log: quiet });
  assert.deepEqual(r.added, ['2026-10-22/2026-10-22 6PM tip weekly-tip.mp4', '2026-10-22/2026-10-22 6PM tip weekly-tip.txt']);
  assert.deepEqual(r.refreshed, ['2026-10-21/2026-10-21 7AM owner math sales-per-labor-hour.txt']);
  assert.equal(fs.readFileSync(path.join(dir, '2026-10-21', '2026-10-21 7AM owner math sales-per-labor-hour.txt'), 'utf8'), 'New first line\n');
  assert.match(fs.readFileSync(path.join(dir, '2026-10-20', '2026-10-20 7AM owner math loaded-labor.txt'), 'utf8'), /Caption for/);
  // A caption the founder edited is never overwritten
  fs.writeFileSync(path.join(dir, '2026-10-24', '2026-10-24 7AM tip weekly-labor-check.txt'), 'my music version caption');
  fs.writeFileSync(path.join(root, 'posts', '2026-10-24-weekly-labor-check', 'caption.txt'), 'Rewritten\n');
  assert.deepEqual(desktopCopy({ root, home, dir, log: quiet }).refreshed, []);
  assert.equal(fs.readFileSync(path.join(dir, '2026-10-24', '2026-10-24 7AM tip weekly-labor-check.txt'), 'utf8'), 'my music version caption');
  // Once the video is deleted, its caption is left as the founder left it
  fs.rmSync(path.join(dir, '2026-10-21', '2026-10-21 7AM owner math sales-per-labor-hour.mp4'));
  fs.writeFileSync(path.join(root, 'posts', '2026-10-21-sales-per-labor-hour', 'caption.txt'), 'Third version\n');
  assert.deepEqual(desktopCopy({ root, home, dir, log: quiet }).refreshed, []);
});

test('never writes into the memorial day\'s folder, nor the other accounts\' folders or their shared list', () => {
  const root = makeRepo();
  const { home, shared, dir, memorial } = makeHome();
  const before = snapshot(shared);
  const memorialBefore = snapshot(memorial);
  const r = desktopCopy({ root, home, dir, log: quiet });
  assert.deepEqual(snapshot(memorial), memorialBefore);
  assert.ok(r.skipped.some((s) => s.date === '2026-10-25'));
  const after = snapshot(shared);
  for (const [f, content] of Object.entries(before)) assert.equal(after[f], content, `${f} changed`);
  const added = Object.keys(after).filter((f) => !(f in before));
  assert.ok(added.every((f) => f.startsWith('@runonrhea/') && !f.startsWith('@runonrhea/2026-10-25/')), added.join(', '));
});

test('refuses any folder but @runonrhea\'s own; a pre-existing file of the same name is never overwritten', () => {
  const { home, shared } = makeHome();
  assert.throws(() => checkTarget(shared, { home }), /@runonrhea/);
  for (const a of ['@icubasics', '@rnbasicsnclex', '@themedicbasics']) assert.throws(() => checkTarget(path.join(shared, a), { home }), /another account/);
  assert.throws(() => checkTarget(path.join(shared, '@other'), { home }), /only/);
  assert.throws(() => checkTarget(path.join(shared, '@runonrhea', '2026-10-21'), { home }), /only/);
  assert.throws(() => checkTarget(path.join(os.tmpdir(), '@icubasics'), { home }), /another account/);
  assert.equal(checkTarget(path.join(shared, '@runonrhea'), { home }), path.join(shared, '@runonrhea'));
  const root = makeRepo();
  assert.throws(() => desktopCopy({ root, home, dir: shared, log: quiet }), /@runonrhea/);

  const dir = path.join(shared, '@runonrhea');
  fs.mkdirSync(path.join(dir, '2026-10-21'), { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-10-21', '2026-10-21 6PM feature overview-stores.txt'), 'my own edit');
  desktopCopy({ root, home, dir, log: quiet });
  assert.equal(fs.readFileSync(path.join(dir, '2026-10-21', '2026-10-21 6PM feature overview-stores.txt'), 'utf8'), 'my own edit');
});

test('DESKTOP_REELS_DIR points the copy somewhere else', () => {
  const root = makeRepo();
  const { home } = makeHome();
  const elsewhere = path.join(tmp('rhea-desktop-env-'), '@runonrhea');
  const r = desktopCopy({ root, home, env: { DESKTOP_REELS_DIR: elsewhere }, log: quiet });
  assert.equal(r.dir, elsewhere);
  assert.ok(fs.existsSync(path.join(elsewhere, '2026-10-21', '2026-10-21 6PM feature overview-stores.mp4')));
  assert.ok(!fs.existsSync(path.join(home, 'Desktop', 'Instagram Reels to edit', '@runonrhea', '2026-10-21')));
});

test('brand.json: the Desktop folder, first date and labels the founder asked for', () => {
  assert.equal(realBrand.desktopCopy.dir, '~/Desktop/Instagram Reels to edit/@runonrhea');
  assert.equal(realBrand.desktopCopy.firstDate, '2026-10-20');
  assert.equal(realBrand.slots.morning.label, '7AM');
  assert.equal(realBrand.slots.evening.label, '6PM');
  assert.deepEqual(realBrand.desktopCopy.typeLabels, { 'owner-math': 'owner math', tip: 'tip', myth: 'myth', feature: 'feature' });
});
