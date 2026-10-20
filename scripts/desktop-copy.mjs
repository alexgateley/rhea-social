#!/usr/bin/env node
// Copies every @RunonRhea Reel with its caption to the Desktop, so Alex can re-post an edited version
// with Instagram music when he has time (the API can't add licensed music). Autoposting is the main
// path and is unchanged; this is a side copy, laid out like his other accounts' but in day folders:
//
//   ~/Desktop/Instagram Reels to edit/@runonrhea/2026-10-21/2026-10-21 7AM owner math sales-per-labor-hour.mp4
//   ~/Desktop/Instagram Reels to edit/@runonrhea/2026-10-21/2026-10-21 7AM owner math sales-per-labor-hour.txt
//   ~/Desktop/Instagram Reels to edit/@runonrhea/2026-10-21/2026-10-21 6PM feature overview-stores.mp4
//   ~/Desktop/Instagram Reels to edit/@runonrhea/2026-10-21/2026-10-21 6PM feature overview-stores.txt
//
//   npm run desktop                                   # also run at the end of npm run render
//   DESKTOP_REELS_DIR=/tmp/reels npm run desktop      # somewhere else (tests, a dry look)
//
// What it copies: every post in posts/index.json (7AM) and posts/index-evening.json (6PM) dated on or
// after brand.json desktopCopy.firstDate (2026-10-20) whose reel.mp4 is in the repo. The slot label,
// type label and slug come from brand.json and the post's meta.json.
//
// Deleting is safe: each file is copied once and recorded in <dir>/.copied (its own list, never the
// shared one in "Instagram Reels to edit"), so a file Alex deleted, or a day folder he removed, never
// comes back. While a post has not gone out yet and both its files are still there, its .txt follows
// caption changes (as his other accounts' copy does), but only while the .txt is exactly what this
// script wrote (<dir>/.captions.json keeps a hash of it), so his own edits are never overwritten.
// Memorial dates are never written to (the
// 2026-10-25 folder holds the founder's own memorial post), and the other accounts' folders
// (@icubasics, @rnbasicsnclex, @themedicbasics) are never touched.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHARED_DIR_NAME = 'Instagram Reels to edit';
export const OTHER_ACCOUNTS = ['@icubasics', '@rnbasicsnclex', '@themedicbasics'];
// Never written to, whatever brand.json says: the founder's own memorial post for his mother
export const PROTECTED_DAYS = ['2026-10-25'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const expandHome = (p, home) => (p === '~' ? home : p.startsWith('~/') ? path.join(home, p.slice(2)) : p);
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const sha1 = (text) => crypto.createHash('sha1').update(text).digest('hex');

/** Refuses any folder but @runonrhea's own: never the shared folder, never another account's. */
export function checkTarget(dir, { home = os.homedir() } = {}) {
  const resolved = path.resolve(dir);
  const shared = path.join(home, 'Desktop', SHARED_DIR_NAME);
  const base = path.basename(resolved);
  if (OTHER_ACCOUNTS.some((a) => a.toLowerCase() === base.toLowerCase())) throw new Error(`Refusing to write into ${resolved}: that is another account's folder`);
  if (base === SHARED_DIR_NAME || resolved === shared) throw new Error(`Refusing to write into ${resolved}: use its @runonrhea folder`);
  if (resolved.startsWith(shared + path.sep) && path.dirname(resolved) !== shared) throw new Error(`Refusing to write into ${resolved}: only ${path.join(shared, '@runonrhea')} is ours`);
  if (path.dirname(resolved) === shared && base !== '@runonrhea') throw new Error(`Refusing to write into ${resolved}: only ${path.join(shared, '@runonrhea')} is ours`);
  return resolved;
}

/**
 * desktopCopy({ root, dir, home, log }) → { dir, added, refreshed, skipped }
 * root  the repository folder; dir  the account folder (default DESKTOP_REELS_DIR or brand.json's)
 */
export function desktopCopy({ root = DEFAULT_ROOT, dir, home = os.homedir(), env = process.env, log = console.log } = {}) {
  const brand = readJson(path.join(root, 'brand.json'), null);
  if (!brand) throw new Error(`No brand.json in ${root}`);
  const cfg = brand.desktopCopy || {};
  const target = checkTarget(dir || env.DESKTOP_REELS_DIR || expandHome(cfg.dir || `~/Desktop/${SHARED_DIR_NAME}/@runonrhea`, home), { home });
  const firstDate = cfg.firstDate || '2026-10-20';
  const typeLabels = cfg.typeLabels || { 'owner-math': 'owner math', tip: 'tip', myth: 'myth', feature: 'feature' };
  const memorialDates = new Set([...(brand.memorial?.dates || []), ...PROTECTED_DAYS]);
  const slots = brand.slots || { morning: { label: '7AM', index: 'posts/index.json', markerSuffix: '' } };
  const postsDir = path.join(root, brand.postsDir || 'posts');
  const publishedDir = path.join(root, brand.publishedDir || 'published');

  fs.mkdirSync(target, { recursive: true });
  const listFile = path.join(target, cfg.listFile || '.copied');
  const copied = new Set(fs.existsSync(listFile) ? fs.readFileSync(listFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : []);
  const saveList = () => {
    const tmp = `${listFile}.tmp`;
    fs.writeFileSync(tmp, [...copied].sort().join('\n') + '\n');
    fs.renameSync(tmp, listFile);
  };
  // What each caption file held when this script last wrote it: a caption is refreshed only while it
  // is still exactly that (never a file Alex edited or put there himself)
  const writtenFile = path.join(target, '.captions.json');
  const written = readJson(writtenFile, {});
  const save = () => {
    saveList();
    const tmp = `${writtenFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(Object.entries(written).sort()), null, 1) + '\n');
    fs.renameSync(tmp, writtenFile);
  };
  const result = { dir: target, added: [], refreshed: [], skipped: [] };

  // Copies through a hidden partial file, so an interrupted copy never leaves half a video behind
  const copyOnce = (key, dest, write) => {
    if (copied.has(key)) return false;
    if (fs.existsSync(dest)) { copied.add(key); return false; } // already there (put there by hand): never overwritten
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const partial = path.join(path.dirname(dest), `.${path.basename(dest)}.partial`);
    write(partial);
    fs.renameSync(partial, dest);
    copied.add(key);
    result.added.push(key);
    return true;
  };

  const entries = [];
  for (const [slot, s] of Object.entries(slots)) {
    const index = readJson(path.join(root, s.index), {});
    for (const [date, folder] of Object.entries(index)) entries.push({ date, slot, s, folder });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || Object.keys(slots).indexOf(a.slot) - Object.keys(slots).indexOf(b.slot));

  for (const { date, slot, s, folder } of entries) {
    if (!DATE_RE.test(date) || date < firstDate) continue;
    if (memorialDates.has(date)) { result.skipped.push({ date, slot, reason: 'memorial date: never written to' }); continue; }
    const src = path.join(postsDir, folder);
    if (path.dirname(src) !== postsDir) { result.skipped.push({ date, slot, reason: `bad folder name ${folder}` }); continue; }
    const video = path.join(src, 'reel.mp4');
    const captionFile = path.join(src, 'caption.txt');
    if (!fs.existsSync(video) || !fs.existsSync(captionFile)) { result.skipped.push({ date, slot, reason: 'not rendered (or pruned)' }); continue; }
    const meta = readJson(path.join(src, 'meta.json'), {});
    const type = meta.type || (slot === 'morning' ? 'owner-math' : null);
    const slug = meta.slug || folder.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/^evening-/, '');
    if (!type || !typeLabels[type]) { result.skipped.push({ date, slot, reason: `unknown type in ${folder}/meta.json` }); continue; }
    if (!SLUG_RE.test(slug)) { result.skipped.push({ date, slot, reason: `bad slug "${slug}"` }); continue; }
    const name = `${date} ${s.label || slot} ${typeLabels[type]} ${slug}`;
    const dayDir = path.join(target, date);
    const caption = fs.readFileSync(captionFile, 'utf8').trim() + '\n';
    const mp4Key = `${date}/${name}.mp4`;
    const txtKey = `${date}/${name}.txt`;
    const mp4 = path.join(dayDir, `${name}.mp4`);
    const txt = path.join(dayDir, `${name}.txt`);

    copyOnce(mp4Key, mp4, (to) => fs.copyFileSync(video, to));
    if (copyOnce(txtKey, txt, (to) => fs.writeFileSync(to, caption))) written[txtKey] = sha1(caption);
    // The caption changed before the post went out: refresh it while the video is still there and
    // the .txt is untouched since this script wrote it
    const posted = fs.existsSync(path.join(publishedDir, `${date}${s.markerSuffix ?? ''}.json`));
    if (!posted && written[txtKey] && fs.existsSync(mp4) && fs.existsSync(txt)) {
      const onDisk = fs.readFileSync(txt, 'utf8');
      if (onDisk !== caption && sha1(onDisk) === written[txtKey]) {
        fs.writeFileSync(txt, caption);
        written[txtKey] = sha1(caption);
        result.refreshed.push(txtKey);
      }
    }
    save();
  }
  save();
  log(`Desktop Reels: ${result.added.length} files added${result.refreshed.length ? `, ${result.refreshed.length} captions refreshed` : ''} in ${target}`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    desktopCopy();
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
}
