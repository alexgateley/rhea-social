#!/usr/bin/env node
// The posting rule: which type of post each day's 7 AM and 6 PM slots carry. verify.mjs imports
// typesFor() and checks every content file against it; the command prints it for drafting a month:
//
//   npm run schedule -- --from 2026-10-21 --to 2026-11-30
//   npm run schedule -- --from 2026-12-01 --to 2026-12-31 --json
//
// The rule (brand.json "rotation"):
//   - before rotation.start (2026-10-21): the first run only, owner math on weekday mornings, no evening slot;
//   - a memorial date (brand.json memorial.dates): no regular post in either slot, and the evening cycle
//     does not advance;
//   - evenings: rotation.evening (feature, tip, feature, myth), one step per non-memorial day from
//     rotation.start;
//   - weekday mornings: owner math;
//   - weekend mornings: a tip when that evening is a myth, a myth when it is a tip; when the evening is a
//     feature, the type the same weekend's other morning is not (so a weekend's two mornings differ); if
//     that other day is a memorial date or before rotation.start, the type the previous weekend morning
//     was not.
// So a day's two posts always differ, consecutive evenings always differ, and a weekend never has two
// mornings of one type.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

export function loadBrand(dir = root) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'brand.json'), 'utf8'));
}

const DAY_MS = 86400000;
const toMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso, n) => new Date(toMs(iso) + n * DAY_MS).toISOString().slice(0, 10);
export const weekday = (iso) => new Date(toMs(iso)).getUTCDay(); // 0 Sunday … 6 Saturday
export const isWeekend = (iso) => { const d = weekday(iso); return d === 0 || d === 6; };
export const dayName = (iso) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday(iso)];
export const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY_MS);
export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toMs(s)) && new Date(toMs(s)).toISOString().slice(0, 10) === s;

const other = (t) => (t === 'tip' ? 'myth' : 'tip');

/**
 * Returns a function date → { morning, evening, memorial } where each slot is a post type
 * ('owner-math' | 'tip' | 'myth' | 'feature') or null (no regular post in that slot).
 */
export function createSchedule(brand = loadBrand()) {
  const rotation = brand.rotation || {};
  const start = rotation.start;
  if (!isIsoDate(start)) throw new Error('brand.json rotation.start must be a YYYY-MM-DD date');
  const cycle = rotation.evening;
  if (!Array.isArray(cycle) || cycle.length === 0) throw new Error('brand.json rotation.evening must list the evening types');
  const memorialDates = new Set(brand.memorial?.dates ?? []);
  const isMemorial = (iso) => memorialDates.has(iso);

  // Evening cycle position: non-memorial days from start, counted once and cached
  const eveningIndex = new Map();
  const indexOf = (iso) => {
    if (eveningIndex.has(iso)) return eveningIndex.get(iso);
    let k = 0;
    for (let d = start; d < iso; d = addDays(d, 1)) if (!isMemorial(d)) k++;
    eveningIndex.set(iso, k);
    return k;
  };
  const eveningOf = (iso) => (iso < start || isMemorial(iso) ? null : cycle[indexOf(iso) % cycle.length]);

  const morningCache = new Map();
  const morningOf = (iso) => {
    if (morningCache.has(iso)) return morningCache.get(iso);
    let type;
    if (isMemorial(iso)) type = null;
    else if (!isWeekend(iso)) type = 'owner-math';
    else if (iso < start) type = null; // the first run posted weekdays only
    else {
      const evening = eveningOf(iso);
      if (evening === 'tip' || evening === 'myth') type = other(evening);
      else {
        // The evening is a feature: differ from the same weekend's other morning
        const partner = weekday(iso) === 6 ? addDays(iso, 1) : addDays(iso, -1);
        const partnerEvening = partner >= start && !isMemorial(partner) ? eveningOf(partner) : null;
        if (partnerEvening === 'tip' || partnerEvening === 'myth') type = other(other(partnerEvening));
        else {
          // Fall back to the previous weekend morning that has a tip or a myth
          let previous = null;
          for (let d = addDays(iso, -1); d >= start; d = addDays(d, -1)) {
            if (isWeekend(d) && !isMemorial(d)) { previous = morningOf(d); if (previous) break; }
          }
          type = previous ? other(previous) : 'tip';
        }
      }
    }
    morningCache.set(iso, type);
    return type;
  };

  const typesFor = (iso) => ({ date: iso, day: dayName(iso), memorial: isMemorial(iso), morning: morningOf(iso), evening: eveningOf(iso) });
  return { typesFor, isMemorial, start, cycle };
}

// ---------------------------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------------------------

function readContent() {
  const dir = path.join(root, 'content');
  const bySlot = new Map();
  for (const f of fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort()) {
    for (const p of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).posts ?? []) {
      bySlot.set(`${p.date}|${p.slot || 'morning'}`, p);
    }
  }
  return bySlot;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const from = opt('--from'), to = opt('--to');
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) {
    console.error('Usage: node scripts/schedule.mjs --from YYYY-MM-DD --to YYYY-MM-DD [--json]');
    process.exit(2);
  }
  const { typesFor } = createSchedule();
  const content = readContent();
  const rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const t = typesFor(d);
    const m = content.get(`${d}|morning`), e = content.get(`${d}|evening`);
    rows.push({ ...t, morningSlug: m?.slug ?? null, eveningSlug: e?.slug ?? null });
  }
  if (args.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
  const cell = (type, slug) => (type ? `${type}${slug ? ` (${slug})` : ' (to write)'}` : slug ? `none, but content has ${slug}` : '—');
  for (const r of rows) {
    if (r.memorial) { console.log(`${r.date} ${r.day}  memorial: the memorial post is the only post; no regular post in either slot`); continue; }
    console.log(`${r.date} ${r.day}  7AM ${cell(r.morning, r.morningSlug).padEnd(46)}  6PM ${cell(r.evening, r.eveningSlug)}`);
  }
}
