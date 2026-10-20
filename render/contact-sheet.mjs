#!/usr/bin/env node
// Every cover of a month on one page, both slots, for a one-look review before pushing:
//
//   npm run contact-sheet -- --month 2026-11      → render/tmp/contact-sheet-2026-11.jpg (ignored by git)
//
// One row per week (Monday first), each day a pair of tiles: 7 AM on the left, 6 PM on the right,
// labeled with the date, slot, type, theme and slug. A posted slot carries "posted". A memorial
// date shows a plain "Memorial post" tile (never the memorial's slides); a slot with no rendered
// cover says "not rendered". render.mjs draws it after every run.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { typeOf, slotOf } from './timing.mjs';
import { ROOT, loadBrand, allPosts, folderName, markerFile, isMemorialDate, postsDirOf } from './lib.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Draws the sheet and returns its path. `contentFile` limits it to one file's posts (sample renders);
 * otherwise every content file's posts dated in the month are used.
 */
export async function makeContactSheet({ month, browser, root = ROOT, postsDir, contentFile = null, out } = {}) {
  const brand = loadBrand(root);
  const dir = postsDir || postsDirOf(brand, root);
  const posts = contentFile
    ? JSON.parse(fs.readFileSync(contentFile, 'utf8')).posts
    : allPosts(root).map(({ post }) => post).filter((p) => p.date.startsWith(month));
  const bySlot = new Map(posts.map((p) => [`${p.date}|${slotOf(p)}`, p]));
  const first = `${month}-01`;
  const dates = posts.map((p) => p.date).sort();
  const last = contentFile && dates.length ? dates.at(-1) : new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
  const start = contentFile && dates.length ? dates[0] : first;
  let d = addDays(start, -((dayOf(start) + 6) % 7)); // back to Monday

  const tile = (date, slot) => {
    const label = slot === 'morning' ? (brand.slots?.morning?.label || '7AM') : (brand.slots?.evening?.label || '6PM');
    if (date < start || date > last) return '<div class="tile out"></div>';
    if (isMemorialDate(brand, date)) {
      return `<div class="tile memo"><div class="ph">${slot === 'morning' ? 'Memorial post<br><small>carousel, 7 AM</small>' : 'nothing<br><small>memorial day</small>'}</div><div class="cap"><b>${label}</b></div></div>`;
    }
    const p = bySlot.get(`${date}|${slot}`);
    if (!p) return `<div class="tile none"><div class="ph">no post</div><div class="cap"><b>${label}</b></div></div>`;
    const cover = path.join(dir, folderName(p), 'cover.jpg');
    const posted = !contentFile && fs.existsSync(markerFile(brand, date, slot, root));
    const img = fs.existsSync(cover) ? `<img src="${pathToFileURL(cover).href}">` : '<div class="ph">not rendered</div>';
    return `<div class="tile">${img}${posted ? '<span class="posted">posted</span>' : ''}<div class="cap"><b>${label}</b> ${esc(typeOf(p))} · ${esc(p.theme || 'paper')}<br>${esc(p.slug)}</div></div>`;
  };

  let rows = '';
  while (d <= last) {
    let cells = '';
    for (let i = 0; i < 7; i++, d = addDays(d, 1)) {
      const inRange = d >= start && d <= last;
      cells += `<div class="day${inRange ? '' : ' faded'}"><div class="date">${DAYS[dayOf(d)]} ${d.slice(5)}</div><div class="pair">${tile(d, 'morning')}${tile(d, 'evening')}</div></div>`;
    }
    rows += `<div class="week">${cells}</div>`;
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: "Inter Tight"; font-weight: 400 700; src: url("${pathToFileURL(path.join(root, 'node_modules/@fontsource/inter-tight/files/inter-tight-latin-500-normal.woff2')).href}") format("woff2"); }
    body { margin: 0; padding: 28px; background: #e9e6e0; font-family: "Inter Tight", system-ui, sans-serif; color: #0e1116; width: max-content; }
    h1 { font-size: 28px; margin: 0 0 18px; }
    .week { display: flex; gap: 14px; margin-bottom: 18px; }
    .day { width: 300px; }
    .day.faded { opacity: 0.25; }
    .date { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
    .pair { display: flex; gap: 6px; }
    .tile { position: relative; width: 147px; }
    .tile img, .tile .ph { display: block; width: 147px; height: 261px; border-radius: 6px; }
    .tile .ph { background: #d8d4cc; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 14px; color: #545961; }
    .tile.memo .ph { background: #0e1116; color: #f5f2ed; }
    .tile.out { visibility: hidden; height: 1px; }
    .cap { font-size: 11.5px; line-height: 1.3; margin-top: 4px; word-break: break-all; }
    .posted { position: absolute; top: 6px; left: 6px; background: #3f5c4a; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 99px; }
  </style></head><body><h1>@${esc(brand.handle)} · ${esc(month)} · 7 AM | 6 PM</h1>${rows}</body></html>`;

  const tmpDir = path.join(root, 'render', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const htmlFile = path.join(tmpDir, `contact-sheet-${month}.html`);
  fs.writeFileSync(htmlFile, html);
  const file = out || path.join(tmpDir, `contact-sheet-${month}.jpg`);
  let own = null;
  if (!browser) {
    const { chromium } = await import('playwright-core');
    own = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  }
  const page = await (browser || own).newPage({ viewport: { width: 2200, height: 300 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, type: 'jpeg', quality: 82, fullPage: true });
  await page.close();
  if (own) await own.close();
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const month = args.includes('--month') ? args[args.indexOf('--month') + 1] : null;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) { console.error('Usage: node render/contact-sheet.mjs --month YYYY-MM'); process.exit(2); }
  const file = await makeContactSheet({ month });
  console.log(path.relative(ROOT, file));
}
