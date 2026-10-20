#!/usr/bin/env node
// WCAG 2 contrast for the card themes in brand.json. Used by verify.mjs (every theme must meet AA)
// and runnable on its own to print the table that README quotes:
//
//   node scripts/contrast.mjs
//
// Text pairs must reach 4.5:1 (body) or 3:1 (large text: the hook and the result). The accent is
// decorative (hook rule, progress bar, takeaway border, feature window ring), so its ratio is
// reported, not required. The demo note is held to 4.5:1 although its 28px type counts as large.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/**
 * The pairs each theme is judged on: [label, foreground key, background key, minimum, kind]. Every
 * color pair render/template.html draws is one of these, for all four card types:
 *   owner-math  hook; term, kicker, result label (heading); formula, step labels (muted); step values, result (type); takeaway on wash
 *   tip         as owner math; the title and lines in type, the line numbers in heading
 *   myth        the "MYTH" pill outlined in heading; the myth in hook, then muted once struck; the "FACT" pill
 *               (background color on heading); the fact and the why lines in type
 *   feature     headline in hook; sub in muted; the demo note (background color on a type pill); the end
 *               card's call to action in type; the window ring in accent (decorative)
 */
export const PAIRS = [
  ['hook, feature headline on background', 'hook', 'bg', 3, 'large text'],
  ['result, step values, tip and myth lines, end card call to action (type) on background', 'type', 'bg', 3, 'large text'],
  ['formula, step labels, feature sub, struck myth (muted) on background', 'muted', 'bg', 4.5, 'body'],
  ['kicker, term, result label, tip numbers, MYTH pill (heading) on background', 'heading', 'bg', 4.5, 'body'],
  ['FACT pill: background color on heading', 'bg', 'heading', 4.5, 'body'],
  ['demo note: background color on a type pill', 'bg', 'type', 4.5, 'body'],
  ['takeaway text on its wash', 'type', 'wash', 4.5, 'body'],
  ['mark bars on mark tile', 'markFg', 'markBg', 3, 'graphic'],
  ['accent (rule, bar, border, window ring) on background', 'accent', 'bg', 0, 'decorative'],
];

export function checkThemes(themes) {
  const rows = [];
  for (const [name, t] of Object.entries(themes)) {
    for (const [label, fg, bg, min, kind] of PAIRS) {
      const ratio = contrast(t[fg], t[bg]);
      rows.push({ theme: name, label, fg: t[fg], bg: t[bg], ratio, min, kind, ok: ratio >= min });
    }
  }
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));
  const rows = checkThemes(brand.themes);
  let theme = '';
  for (const r of rows) {
    if (r.theme !== theme) { theme = r.theme; console.log(`\n${theme}`); }
    console.log(`  ${r.ratio.toFixed(2).padStart(6)}:1  ${r.ok ? 'ok ' : 'LOW'}  ${r.label} (${r.fg} on ${r.bg}; ${r.kind}${r.min ? `, needs ${r.min}:1` : ''})`);
  }
  const low = rows.filter((r) => !r.ok);
  console.log(low.length ? `\n${low.length} pair(s) below AA` : '\nEvery theme meets WCAG AA.');
  process.exit(low.length ? 1 : 0);
}
