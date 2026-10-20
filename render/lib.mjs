// What render.mjs, relink.mjs and contact-sheet.mjs share: the content files, folder and marker
// names per slot, the caption text, and the two indexes the publisher reads.
//
//   morning   posts/<date>-<slug>/           marker published/<date>.json           index posts/index.json
//   evening   posts/<date>-evening-<slug>/   marker published/<date>-evening.json   index posts/index-evening.json
//
// (brand.json `slots` holds the index paths and marker suffixes; the folder names are fixed here.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { typeOf, slotOf } from './timing.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SLOTS = ['morning', 'evening'];

export const loadBrand = (root = ROOT) => JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));

/** content/YYYY-MM.json files, in order. */
export function contentFiles(root = ROOT) {
  const dir = path.join(root, 'content');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort().map((f) => path.join(dir, f));
}

/** Every post of every content file, with the file it came from. */
export function allPosts(root = ROOT) {
  const out = [];
  for (const file of contentFiles(root)) {
    for (const post of JSON.parse(fs.readFileSync(file, 'utf8')).posts ?? []) out.push({ file, post });
  }
  return out;
}

const slotConfig = (brand, slot) => {
  const s = brand.slots?.[slot];
  if (s) return s;
  if (slot === 'morning') return { index: 'posts/index.json', markerSuffix: '', label: '7AM' };
  throw new Error(`unknown slot "${slot}" (brand.json slots)`);
};

/** The folder of a post under posts/: morning <date>-<slug>, evening <date>-evening-<slug>. */
export const folderName = (post) => (slotOf(post) === 'morning' ? `${post.date}-${post.slug}` : `${post.date}-${slotOf(post)}-${post.slug}`);

/** The slug a folder name holds for a slot, or null when the folder is not that slot's. */
export function slugOfFolder(folder, slot) {
  const m = folder.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!m) return null;
  if (slot === 'morning') return SLOTS.some((s) => s !== 'morning' && m[2].startsWith(`${s}-`)) ? null : m[2];
  return m[2].startsWith(`${slot}-`) ? m[2].slice(slot.length + 1) : null;
}

export const dateOfFolder = (folder) => folder.slice(0, 10);

export const postsDirOf = (brand, root = ROOT) => path.join(root, brand.postsDir || 'posts');
export const publishedDirOf = (brand, root = ROOT) => path.join(root, brand.publishedDir || 'published');

/** published/<date><suffix>.json: the slot's marker, written by the publisher after posting. */
export const markerFile = (brand, date, slot, root = ROOT) => path.join(publishedDirOf(brand, root), `${date}${slotConfig(brand, slot).markerSuffix ?? ''}.json`);
export const indexFile = (brand, slot, root = ROOT) => path.join(root, slotConfig(brand, slot).index);
export const slotLabel = (brand, slot) => slotConfig(brand, slot).label || slot;

/** A memorial date takes no regular post in either slot (brand.memorial.dates). */
export const isMemorialDate = (brand, date) => (brand.memorial?.dates ?? []).includes(date);

/** caption.txt: the caption, the footer (features have their own), the hashtags. */
export function captionText(brand, post) {
  const footer = typeOf(post) === 'feature' ? (brand.captionFooterFeature || brand.captionFooter) : brand.captionFooter;
  return `${post.caption.trim()}\n\n${footer}\n\n${(post.hashtags ?? []).join(' ')}\n`;
}

/**
 * Rebuilds posts/index.json and posts/index-evening.json from every content file: a post is listed
 * when its folder has reel.mp4, or when it has a marker and its folder is still there (pruned media
 * keeps the record). An existing entry for a date no content file claims for that slot is kept if
 * its folder still exists. No memorial date is ever listed. Returns { morning: n, evening: n }.
 */
export function rebuildIndexes(brand, root = ROOT) {
  const postsDir = postsDirOf(brand, root);
  const counts = {};
  const posts = allPosts(root).map(({ post }) => post);
  for (const slot of SLOTS) {
    if (slot !== 'morning' && !brand.slots?.[slot]) continue;
    const file = indexFile(brand, slot, root);
    const before = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const claimed = new Set();
    const index = {};
    for (const p of posts) {
      if (slotOf(p) !== slot) continue;
      claimed.add(p.date);
      if (isMemorialDate(brand, p.date)) continue;
      const folder = folderName(p);
      const dir = path.join(postsDir, folder);
      const hasReel = fs.existsSync(path.join(dir, 'reel.mp4'));
      const posted = fs.existsSync(markerFile(brand, p.date, slot, root)) && fs.existsSync(dir);
      if (hasReel || posted) index[p.date] = folder;
    }
    for (const [date, folder] of Object.entries(before)) {
      if (!claimed.has(date) && !isMemorialDate(brand, date) && fs.existsSync(path.join(postsDir, folder))) index[date] = folder;
    }
    const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
    const text = JSON.stringify(sorted, null, 2) + '\n';
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
    counts[slot] = Object.keys(sorted).length;
  }
  return counts;
}

/** Short words for logs and the contact sheet. */
export const describe = (brand, post) => `${post.date} ${slotLabel(brand, slotOf(post))} ${typeOf(post)} ${post.slug}`;
