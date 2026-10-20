#!/usr/bin/env node
// Re-dates rendered posts and rewrites their captions without re-rendering them. A card shows no
// date, so when the schedule moves (a run starts earlier, a day is skipped) the existing reel.mp4
// and cover.jpg stay valid:
//
//   npm run relink -- --month 2026-10
//
// For every post in content/<month>.json it finds the rendered folder with the same slot and slug
// under posts/ (whatever date it was rendered under), renames it (morning <date>-<slug>, evening
// <date>-evening-<slug>), rewrites meta.json's date and caption fields and caption.txt from the
// content, and rebuilds posts/index.json and posts/index-evening.json from every content file. A
// post with no rendered folder is listed; render it with `npm run render -- --month <month>`. A
// post with a marker in published/ is left exactly as it was (its caption and files are what
// people saw), and a memorial date gets nothing. `npm run render` does all of this too (and
// renders what is missing); relink is the quick way when only dates or captions changed.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { slotOf } from './timing.mjs';
import { ROOT, loadBrand, folderName, slugOfFolder, dateOfFolder, markerFile, isMemorialDate, captionText, rebuildIndexes, postsDirOf } from './lib.mjs';

const root = ROOT;
const args = process.argv.slice(2);
const month = args.includes('--month') ? args[args.indexOf('--month') + 1] : null;
if (!month || !/^\d{4}-\d{2}$/.test(month)) { console.error('Usage: node render/relink.mjs --month YYYY-MM'); process.exit(2); }

const brand = loadBrand(root);
const postsDir = postsDirOf(brand, root);
const verify = spawnSync(process.execPath, [path.join(root, 'scripts/verify.mjs'), '--month', month], { stdio: 'inherit' });
if (verify.status !== 0) process.exit(verify.status ?? 1);

const content = JSON.parse(fs.readFileSync(path.join(root, 'content', `${month}.json`), 'utf8'));
const folders = fs.readdirSync(postsDir).filter((f) => fs.statSync(path.join(postsDir, f)).isDirectory());

const missing = [];
for (const post of content.posts) {
  const slot = slotOf(post);
  if (isMemorialDate(brand, post.date)) { console.log(`${post.date} is a memorial date: no regular post (${post.slug} skipped)`); continue; }
  const want = folderName(post);
  const have = folders.includes(want) ? want : folders.find((f) => slugOfFolder(f, slot) === post.slug);
  if (!have) { missing.push(`${post.slug} (${slot})`); continue; }
  if (fs.existsSync(markerFile(brand, post.date, slot, root))) {
    if (have !== want) console.log(`${want} is published but its folder is ${have}; not touching it`);
    continue;
  }
  if (have !== want) {
    if (fs.existsSync(markerFile(brand, dateOfFolder(have), slot, root))) { console.log(`${have} was posted; a posted Reel is never re-dated (${post.slug} needs a new slug)`); continue; }
    fs.renameSync(path.join(postsDir, have), path.join(postsDir, want));
    folders[folders.indexOf(have)] = want;
    console.log(`${have} → ${want}`);
  }
  const metaFile = path.join(postsDir, want, 'meta.json');
  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const next = { ...meta, date: post.date, slot, captionFirstLine: post.caption.trim().split('\n')[0], hashtags: post.hashtags ?? [] };
    if (JSON.stringify(next) !== JSON.stringify(meta)) fs.writeFileSync(metaFile, JSON.stringify(next, null, 2) + '\n');
  }
  const caption = captionText(brand, post);
  const captionFile = path.join(postsDir, want, 'caption.txt');
  if (!fs.existsSync(captionFile) || fs.readFileSync(captionFile, 'utf8') !== caption) {
    fs.writeFileSync(captionFile, caption);
    console.log(`${want}: caption rewritten`);
  }
}

const counts = rebuildIndexes(brand, root);
console.log(`Indexes rebuilt: ${Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(', ')} dates.`);
if (missing.length) {
  console.log(`Not rendered yet: ${missing.join(', ')} (npm run render -- --month ${month})`);
  process.exit(1);
}
