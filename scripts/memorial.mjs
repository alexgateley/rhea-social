#!/usr/bin/env node
// Keeps the committed memorial carousels (posts/memorial/<date>/, served by Pages and posted by the
// job) the same as the founder's own files (memorial/<date>/, git-ignored, on his Mac only):
//
//   npm run memorial:check                        # compare every memorial date's files (verify runs this too)
//   npm run memorial:sync -- --date 2026-10-25    # copy his slide-N.jpg and caption.txt over, update the index
//   npm run memorial:sync -- --date 2026-10-25 --dry-run
//
// The job posts the committed copies, never memorial/ (GitHub never sees that folder), so an edit
// there reaches Instagram only after a sync, a commit and a push to main before 7 AM that day.
// memorial/ is the founder's: this script only reads it. Copied: slide-1.jpg, slide-2.jpg, … in
// number order, and caption.txt, byte for byte; nothing else in his folder (drafts, a cover, a reel)
// is copied. posts/memorial/index.json gets the slide list and each file's SHA-256.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLIDE = /^slide-(\d+)\.jpe?g$/i;
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

const dirs = (root, brand, date) => ({
  source: path.join(root, 'memorial', date),
  committed: path.join(root, brand.memorial?.dir || 'posts/memorial', date),
  index: path.join(root, brand.memorial?.dir || 'posts/memorial', 'index.json'),
});

/** The founder's slides for a date, in number order, and his caption (or null when he has none). */
export function sourceFiles(root, brand, date) {
  const { source } = dirs(root, brand, date);
  if (!fs.existsSync(source)) return null;
  const slides = fs.readdirSync(source).filter((f) => SLIDE.test(f)).sort((a, b) => Number(a.match(SLIDE)[1]) - Number(b.match(SLIDE)[1]));
  const caption = fs.existsSync(path.join(source, 'caption.txt')) ? 'caption.txt' : null;
  return { slides, caption };
}

/**
 * Every difference between memorial/<date>/ and posts/memorial/<date>/ for the memorial dates whose
 * source folder is on this machine, and between the committed files and their checksums in the index.
 * Returns a list of problems in plain words (empty when they agree).
 */
export function compareMemorial(root = ROOT, brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'))) {
  const problems = [];
  const index = readJson(dirs(root, brand, 'x').index, {});
  for (const date of brand.memorial?.dates ?? []) {
    const { source, committed } = dirs(root, brand, date);
    const entry = index[date];
    const fix = `run npm run memorial:sync -- --date ${date}, then commit and push to main before 7 AM on ${date}`;
    // The committed copies against their own index
    if (entry) {
      for (const f of [...(entry.slides ?? []), entry.caption || 'caption.txt']) {
        const file = path.join(committed, f);
        if (!fs.existsSync(file)) problems.push(`memorial ${date}: posts/memorial/${date}/${f} is in the index but missing`);
        else if (entry.sha256?.[f] && sha256(file) !== entry.sha256[f]) problems.push(`memorial ${date}: posts/memorial/${date}/${f} does not match its checksum in posts/memorial/index.json`);
      }
    }
    const src = sourceFiles(root, brand, date);
    if (!src || (!src.slides.length && !src.caption)) continue; // nothing of the founder's on this machine for that date
    if (!entry) { problems.push(`memorial ${date}: memorial/${date}/ has a memorial post, but nothing is committed for it: ${fix}`); continue; }
    const differs = [];
    for (const f of [...src.slides, ...(src.caption ? [src.caption] : [])]) {
      const mine = path.join(committed, f);
      if (!fs.existsSync(mine)) differs.push(`${f} (not copied)`);
      else if (sha256(mine) !== sha256(path.join(source, f))) differs.push(f);
    }
    for (const f of entry.slides ?? []) if (!src.slides.includes(f)) differs.push(`${f} (no longer in memorial/${date}/)`);
    if (JSON.stringify(entry.slides ?? []) !== JSON.stringify(src.slides) && !differs.some((d) => /not copied|no longer/.test(d))) differs.push('the slide order');
    if (differs.length) problems.push(`memorial ${date}: the job would post an older version. memorial/${date}/ and posts/memorial/${date}/ differ: ${differs.join(', ')}; ${fix}`);
  }
  return problems;
}

/** Copies the founder's files for one date into posts/memorial/<date>/ and rewrites its index entry. */
export function syncMemorial({ root = ROOT, date, dryRun = false, log = console.log } = {}) {
  const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));
  if (!(brand.memorial?.dates ?? []).includes(date)) throw new Error(`${date} is not a memorial date (brand.json memorial.dates: ${(brand.memorial?.dates ?? []).join(', ')})`);
  const { source, committed, index: indexFile } = dirs(root, brand, date);
  const src = sourceFiles(root, brand, date);
  if (!src) throw new Error(`memorial/${date}/ does not exist on this machine`);
  if (src.slides.length < 2 || src.slides.length > 20) throw new Error(`memorial/${date}/ has ${src.slides.length} slide-N.jpg files; a carousel takes 2 to 20`);
  if (!src.caption) throw new Error(`memorial/${date}/caption.txt is missing`);
  for (const f of src.slides) {
    const b = fs.readFileSync(path.join(source, f));
    if (b.readUInt16BE(0) !== 0xffd8) throw new Error(`memorial/${date}/${f} is not a JPEG (Instagram carousels take JPEG only)`);
  }
  const files = [...src.slides, src.caption];
  const changed = files.filter((f) => !fs.existsSync(path.join(committed, f)) || sha256(path.join(committed, f)) !== sha256(path.join(source, f)));
  const stale = fs.existsSync(committed) ? fs.readdirSync(committed).filter((f) => SLIDE.test(f) && !src.slides.includes(f)) : [];
  const index = readJson(indexFile, {});
  const entry = {
    folder: date,
    slides: src.slides,
    caption: src.caption,
    source: index[date]?.source ?? `memorial/${date}/ (copied unchanged; the founder approved the photo being public)`,
    sha256: Object.fromEntries(files.map((f) => [f, sha256(path.join(source, f))])),
  };
  const indexChanged = JSON.stringify(index[date] ?? null) !== JSON.stringify(entry);
  if (!changed.length && !stale.length && !indexChanged) { log(`memorial ${date}: posts/memorial/${date}/ already matches memorial/${date}/; nothing to do.`); return { changed: [], stale: [] }; }
  log(`memorial ${date}: ${dryRun ? 'would copy' : 'copying'} ${changed.length ? changed.join(', ') : 'nothing'}${stale.length ? `; ${dryRun ? 'would remove' : 'removing'} ${stale.join(', ')} (no longer in memorial/${date}/)` : ''}${indexChanged ? '; index updated' : ''}`);
  if (dryRun) return { changed, stale };
  fs.mkdirSync(committed, { recursive: true });
  for (const f of changed) fs.copyFileSync(path.join(source, f), path.join(committed, f));
  for (const f of stale) fs.rmSync(path.join(committed, f));
  index[date] = entry;
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(indexFile, JSON.stringify(sorted, null, 2) + '\n');
  log(`Now commit posts/memorial/ and push it to main before 7 AM on ${date}: the job posts what is on main.`);
  return { changed, stale };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const mode = args[0];
  const date = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;
  try {
    if (mode === 'sync') {
      if (!date) throw new Error('Usage: node scripts/memorial.mjs sync --date YYYY-MM-DD [--dry-run]');
      syncMemorial({ date, dryRun: args.includes('--dry-run') });
    } else if (mode === 'check' || !mode) {
      const problems = compareMemorial();
      if (problems.length) { for (const p of problems) console.error(p); process.exit(1); }
      console.log('Memorial posts: the committed copies match their index and the founder\'s files (where they are on this machine).');
    } else throw new Error(`Unknown mode "${mode}" (check or sync)`);
  } catch (e) { console.error(`ERROR: ${e.message}`); process.exit(1); }
}
