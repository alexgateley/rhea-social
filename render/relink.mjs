#!/usr/bin/env node
// Re-dates rendered posts without re-rendering them. A card shows no date, so when the schedule
// moves (a run starts earlier, a day is skipped) the existing reel.mp4 and cover.jpg stay valid:
//
//   npm run relink -- --month 2026-10
//
// For every post in content/<month>.json it finds the rendered folder with the same slug under
// posts/ (whatever date it was rendered under), renames it to <date>-<slug>, rewrites meta.json's
// date and caption.txt from the content, and rebuilds posts/index.json from every content file
// whose posts have a folder. A post with no rendered folder is listed; render it with
// `npm run render -- --month <month> --only <slug>`.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const month = args.includes('--month') ? args[args.indexOf('--month') + 1] : null;
if (!month || !/^\d{4}-\d{2}$/.test(month)) { console.error('Usage: node render/relink.mjs --month YYYY-MM'); process.exit(2); }

const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));
const postsDir = path.join(root, brand.postsDir || 'posts');
const verify = spawnSync(process.execPath, [path.join(root, 'scripts/verify.mjs'), '--month', month], { stdio: 'inherit' });
if (verify.status !== 0) process.exit(verify.status ?? 1);

const content = JSON.parse(fs.readFileSync(path.join(root, 'content', `${month}.json`), 'utf8'));
const folders = fs.readdirSync(postsDir).filter((f) => fs.statSync(path.join(postsDir, f)).isDirectory());
const folderOf = (slug) => folders.find((f) => f.replace(/^\d{4}-\d{2}-\d{2}-/, '') === slug);
const captionText = (p) => `${p.caption.trim()}\n\n${brand.captionFooter}\n\n${p.hashtags.join(' ')}\n`;

const missing = [];
for (const post of content.posts) {
  const want = `${post.date}-${post.slug}`;
  const have = folderOf(post.slug);
  if (!have) { missing.push(post.slug); continue; }
  if (have !== want) {
    fs.renameSync(path.join(postsDir, have), path.join(postsDir, want));
    folders[folders.indexOf(have)] = want;
    console.log(`${have} → ${want}`);
  }
  const metaFile = path.join(postsDir, want, 'meta.json');
  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (meta.date !== post.date || meta.hook !== post.hook) {
      fs.writeFileSync(metaFile, JSON.stringify({ ...meta, date: post.date, hook: post.hook, result: post.result }, null, 2) + '\n');
    }
  }
  fs.writeFileSync(path.join(postsDir, want, 'caption.txt'), captionText(post));
}

// index.json: every content file's posts that have a folder, by date
const index = {};
for (const f of fs.readdirSync(path.join(root, 'content')).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort()) {
  for (const p of JSON.parse(fs.readFileSync(path.join(root, 'content', f), 'utf8')).posts) {
    const folder = `${p.date}-${p.slug}`;
    if (fs.existsSync(path.join(postsDir, folder, 'reel.mp4'))) index[p.date] = folder;
  }
}
fs.writeFileSync(path.join(postsDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`posts/index.json: ${Object.keys(index).length} dates.`);
if (missing.length) {
  console.log(`Not rendered yet: ${missing.join(', ')} (npm run render -- --month ${month} --only <slug>)`);
  process.exit(1);
}
