#!/usr/bin/env node
// Checks every post before anything is rendered or posted:
//
//   node scripts/verify.mjs                  # every content/*.json
//   node scripts/verify.mjs --month 2026-11  # report one file (the cross-file checks still read all)
//   RHEA_REPO=/Users/alex/Desktop/rhea node scripts/verify.mjs   # also check each claim's file exists
//
// What it checks, for both slots (morning 7 AM, evening 6 PM) and all four types:
//   - the schedule: dates, (date, slot) used once, the type each slot must carry (scripts/schedule.mjs),
//     no post on a memorial date, every day from the rotation's start to the last content date filled;
//   - the arithmetic: every owner-math step and result recomputed from its inputs (scripts/compute.mjs),
//     and the figure rule for every type: any $, % or ¢ figure must be an input, a computed string or a
//     pinned rheafi.com price; "trial" and "guarantee" only in rheafi.com's exact words;
//   - the words: card text limits per type; never the banned words (the product word for artificial
//     intelligence, "tax software", competitor names, "customers", "fake", "seamless"…); status words
//     wherever QuickBooks, Pay from Rhea, Gusto, Melio or a POS connection is named; "ask your CPA" on
//     tax-adjacent posts;
//   - claims: a feature's claims each name evidence that FACTS.md lists (and, with RHEA_REPO, that
//     exists in the Rhea repo); any other post that names Rhea needs claims too;
//   - captions: a search sentence first (keyword up front, audience, owners, at most 125 characters),
//     2 to 4 short lines, no hashtags in the text, Instagram's 2,200-character limit with footer and tags;
//   - hashtags: exactly five from brand.json's pools (topic, two industries the post fits, bookkeeping or
//     broad, one broad and one niche), never a denylisted tag; no identical set within 14 days,
//     neighbors share at most two, every industry group and bookkeeping each week;
//   - themes: a valid theme, never the same as the post before (column repeats in the grid are warned);
//   - features: the demo note and call to action exactly, a recording id that content/recordings.json
//     describes, the same recording again only 14+ days later with a new headline.
// A post with a marker in published/ is history: only its arithmetic is rechecked.
// Exits non-zero when any file has a problem; warnings do not fail.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInput } from './format.mjs';
import { checkThemes } from './contrast.mjs';
import { COMPUTE } from './compute.mjs';
import { createSchedule, addDays, daysBetween, isIsoDate, weekday } from './schedule.mjs';
import { timing, cardHash } from '../render/timing.mjs';
import { industryRule, pluralPair } from './hashtags.mjs';

// VERIFY_ROOT points the check at another copy of the repo (scripts/verify.test.mjs uses a temporary one)
const root = process.env.VERIFY_ROOT ? path.resolve(process.env.VERIFY_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));
const facts = fs.readFileSync(path.join(root, 'FACTS.md'), 'utf8');
const publishedDir = path.join(root, brand.publishedDir || 'published');
const postsDir = path.join(root, brand.postsDir || 'posts');
const schedule = createSchedule(brand);

// ---------------------------------------------------------------------------------------------
// Limits and word lists
// ---------------------------------------------------------------------------------------------

const TYPES = ['owner-math', 'tip', 'myth', 'feature'];
const SLOTS = ['morning', 'evening'];
const LIMIT = {
  hookWords: 9, takeawayWords: 18,
  tipTitleWords: 5, tipLines: [3, 5], tipLineWords: 10, tipActionWords: 4,
  mythFactWords: 7, mythWhy: [2, 4], mythWhyWords: 10,
  headlineWords: 9, subWords: 14, claims: [1, 4],
  firstLineChars: brand.captionFirstLine?.maxChars ?? 125,
  firstLineWords: brand.captionFirstLine?.minWords ?? 8,
  keywordWithin: 60, // the post's search keyword must start within the first 60 characters
  bodyLines: [2, 4], bodyLineChars: 130,
  captionChars: 2200, // Instagram's caption limit, footer and hashtags included
  recordingGapDays: 14, setRepeatDays: 14, sharedWithNeighbor: 2,
};
// The first run's owner math was written as one run in 2026-10.json and continues to November 12
const GRANDFATHERED = { '2026-10': { until: '2026-11-12', slot: 'morning', type: 'owner-math' } };

const BANNED = [
  [/\bAI\b/, 'the word "AI"'],
  [/\bA\.I\.?(?=\s|$)/i, 'the word "A.I."'],
  [/artificial intelligence/i, '"artificial intelligence"'],
  [/\bAI[- ]?accountant/i, '"AI accountant"'],
  [/\bClaude\b|\bAnthropic\b/, 'a model or vendor name (Claude, Anthropic)'],
  [/tax software/i, '"tax software" (Rhea is not tax software)'],
  [/\b(files?|filing|does|do|prepares?) (your |their )?(income |sales |payroll )?tax(es| returns?)? for you\b|\bfiles your taxes\b|\bdoes your taxes\b/i, 'a claim that Rhea files or does taxes'],
  [/\btestimonials?\b/i, '"testimonial"'],
  [/\bcustomers?\b/i, '"customers" (say guests; Rhea has no customers to cite)'],
  [/\bsaves? you\b|\bsavings\b|\bsave \$|\bsaving \$/i, 'a savings claim'],
  [/\bfake\b/i, '"fake" (say sample data)'],
  [/\bseamless(ly)?\b/i, '"seamless"'],
  [/\bleverag(e|es|ed|ing)\b/i, '"leverage"'],
  [/\bsmart\b/i, '"smart"'],
  [/\bonboarding\b|\bwizard\b|\bconfigure\b|\bintegrations?\b|\btenants?\b/i, 'internal product words (onboarding, wizard, configure, integration, tenant)'],
  [/sign up today|\bDM (us|me)\b|follow for more|link in comments/i, 'a call to action Rhea does not use'],
  [/replaces? (your )?bookkeeper|replaces? (your )?(accountant|CPA)/i, '"replaces your bookkeeper/CPA"'],
  [/live QuickBooks/i, '"live QuickBooks" (the push is sandbox only)'],
  [/\bmost (owners|operators|restaurants|stores|salons|franchisees)\b|\bthe average (store|owner|restaurant|salon|franchisee)\b|\bstudies show\b|\bindustry average\b|\bon average,? (owners|stores|restaurants)\b|\b\d+ out of \d+ (owners|stores|restaurants)\b/i, 'an invented statistic'],
  [/\b(Restaurant365|R365|MarginEdge|Margin ?Edge|xtraCHEF|Ottimate|Plate ?IQ|Botkeeper|Fathom|Vagaro|Boulevard|Bench\.co|Bookkeep|Decimal\.com|Pilot\.com)\b/, 'a competitor\'s name'],
  [/\bRhea (Card|is a bank|lends|loans)\b|\bRhea Card\b/i, 'the Rhea Card or banking (not available)'],
  [/\bguaranteed\b/i, '"guaranteed" (only the exact 60-day money-back guarantee wording)'],
];

// Whenever a post names one of these, it must also say the status FACTS.md gives it
const STATUS = [
  // (reading the bookkeeper's QuickBooks Online reports is built; pushing to QuickBooks is sandbox only)
  [/\bQuickBooks\b(?! Online (reports?|exports?|P&L))/, /\bsandbox\b|with or without QuickBooks/i, 'QuickBooks: the push is sandbox only, say "sandbox" (or "with or without QuickBooks")'],
  [/\bPay from Rhea\b|\bStripe\b/, /\btest mode\b/i, 'Pay from Rhea and Stripe are in test mode: say so'],
  [/\bGusto\b/, /\boff\b/i, 'Connect with Gusto is off until the founder has keys: say so'],
  [/\bMelio\b/, /\bpending\b/i, 'Melio is pending: say so'],
  [/\b(Square|Clover|Shopify|7shifts)\b/, /\bsandbox(es)?\b|\btest accounts?\b/i, 'POS connections are tested on sandboxes and test accounts so far: say so'],
  [/\bToast\b/, /\bexport\b/i, 'Toast comes in through its nightly export: say so'],
];

// Tips, myths and features that touch tax rules say "ask your CPA" (any post may also set taxAdjacent: true)
const TAX_ADJACENT = /\b(fil(e|es|ing)|remit(s|ting)?|pay(ing)?) (your |the |its )?(sales |payroll |income )?tax(es)?\b|\btax (rules?|returns?|filings?|deadlines?|due dates?)\b|\bpayroll tax (rules?|deposits?)\b|\b1099s?\b|\bW-9s?\b|\bTIN\b|\bdeduct(ible|ion|ions)?\b|\bIRS\b|\bwrite-?offs?\b|\bdepreciat\w*|\btaxed\b/i;

// $, % and ¢ figures
const FIGURE = /\$\d{1,3}(?:,\d{3})*(?:\.\d+)?(?![\d,]\d)|\d+(?:,\d{3})*(?:\.\d+)?%|\d+(?:\.\d+)?¢/g;
const figuresIn = (s) => String(s ?? '').match(FIGURE) ?? [];

const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
const slotOf = (p) => p.slot || 'morning';
const typeOf = (p) => p.type || 'owner-math';
const orderKey = (p) => `${p.date}|${slotOf(p) === 'morning' ? 0 : 1}`;
const markerFile = (p) => path.join(publishedDir, `${p.date}${brand.slots?.[slotOf(p)]?.markerSuffix ?? (slotOf(p) === 'evening' ? '-evening' : '')}.json`);
const isPublished = (p) => fs.existsSync(markerFile(p));
const folderOf = (p) => (slotOf(p) === 'evening' ? `${p.date}-evening-${p.slug}` : `${p.date}-${p.slug}`);

// Pinned prices and phrases (brand.json pricing): the only words a post may use about price, trial
// and guarantee
const pinnedStrings = [];
(function collect(v, key) {
  if (key === 'source' || key === 'rule') return;
  if (typeof v === 'string') pinnedStrings.push(v);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) collect(x, k);
})(brand.pricing);
const TRIAL = brand.pricing?.trial ?? '7-day free trial';
const GUARANTEE = '60-day money-back guarantee';

// ---------------------------------------------------------------------------------------------
// Hashtag pools
// ---------------------------------------------------------------------------------------------

const pools = brand.hashtagPools ?? {};
const INDUSTRY = Object.keys(pools.industry ?? {});
const lower = (t) => String(t).toLowerCase();
const groupOfTag = new Map();
for (const g of INDUSTRY) for (const t of pools.industry[g]) groupOfTag.set(lower(t), g);
for (const t of pools.bookkeeping ?? []) groupOfTag.set(lower(t), 'bookkeeping');
for (const t of pools.broad ?? []) groupOfTag.set(lower(t), 'broad');
const topicPool = (type) => new Set((pools.topic?.[type] ?? []).map(lower));
const broadTier = new Set((pools.tiers?.broad ?? []).map(lower));
const nicheTier = new Set((pools.tiers?.niche ?? []).map(lower));
const denied = new Set((pools.denylist ?? []).map(lower));
const retiredKey = new Map(Object.keys(pools.retired ?? {}).map((k) => [lower(k), k]));

function checkPools() {
  const problems = [];
  const allTopic = new Set(Object.values(pools.topic ?? {}).flat().map(lower));
  for (const t of allTopic) if (groupOfTag.has(t)) problems.push(`hashtagPools: ${t} is both a topic tag and an audience tag (pools must not overlap)`);
  for (const t of [...groupOfTag.keys(), ...allTopic]) {
    if (!/^#[a-z0-9]+$/.test(t)) problems.push(`hashtagPools: ${t} is not a plain #word tag`);
    if (denied.has(t)) problems.push(`hashtagPools: ${t} is on the denylist`);
    if (retiredKey.has(t)) problems.push(`hashtagPools: ${t} is retired`);
  }
  for (const t of [...broadTier, ...nicheTier]) if (!groupOfTag.has(t) && !allTopic.has(t)) problems.push(`hashtagPools.tiers: ${t} is in no pool`);
  if ((brand.hashtagRules?.maxPerPost ?? 0) !== 5) problems.push('hashtagRules.maxPerPost must be 5 (Instagram: up to 5 hashtags in a reel or post)');
  if (Array.isArray(brand.rotation?.evening) && brand.rotation.evening.some((t) => !TYPES.includes(t))) problems.push('rotation.evening lists an unknown type');
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Recordings (content/recordings.json: what each feature recording shows and how to record it)
// ---------------------------------------------------------------------------------------------

const recordingsFile = path.join(root, 'content', 'recordings.json');
const recordings = fs.existsSync(recordingsFile) ? JSON.parse(fs.readFileSync(recordingsFile, 'utf8')).recordings ?? {} : {};

// ---------------------------------------------------------------------------------------------
// Per-post checks
// ---------------------------------------------------------------------------------------------

/** Every piece of text a post shows or posts, with a name for messages. */
function textFields(p) {
  const out = [['hook', p.hook], ['takeaway', p.takeaway], ['caption', p.caption]];
  const t = typeOf(p);
  if (t === 'owner-math') {
    out.push(['term', p.term], ['formula', p.formula], ['result label', p.result?.label], ['result', p.result?.value]);
    (p.steps ?? []).forEach((s, k) => out.push([`step ${k + 1} label`, s?.label], [`step ${k + 1} value`, s?.value]));
  } else if (t === 'tip') {
    out.push(['title', p.title], ['titleLabel', p.titleLabel], ['action', p.action], ['actionLabel', p.actionLabel]);
    (p.lines ?? []).forEach((l, k) => out.push([`line ${k + 1}`, l]));
  } else if (t === 'myth') {
    out.push(['fact', p.fact]);
    (p.why ?? []).forEach((l, k) => out.push([`why ${k + 1}`, l]));
  } else if (t === 'feature') {
    out.push(['headline', p.headline], ['sub', p.sub], ['demoNote', p.demoNote], ['cta', p.cta]);
  }
  (p.claims ?? []).forEach((c, k) => out.push([`claim ${k + 1}`, c?.text]));
  return out.filter(([, v]) => typeof v === 'string' && v.length);
}

function checkWords(p, say, sayCard = say) {
  const fields = textFields(p);
  const all = fields.map(([, v]) => v).join('\n');
  for (const [name, text] of fields) {
    const s = name === 'caption' || name.startsWith('claim') ? say : sayCard;
    for (const [re, what] of BANNED) if (re.test(text)) s(`${name} contains ${what}`);
    // "trial" and "guarantee" only in rheafi.com's words
    const noTrial = text.split(TRIAL).join('').replace(/\btrial balances?\b/gi, '');
    if (/\btrial\b/i.test(noTrial)) s(`${name} mentions a trial other than the "${TRIAL}"`);
    const noGuarantee = text.split(GUARANTEE).join('');
    if (/\bguarantee|money-back|refund (your|the|of the) subscription/i.test(noGuarantee)) s(`${name} mentions a guarantee or refund other than the "${GUARANTEE}"`);
  }
  for (const [mention, needs, what] of STATUS) if (mention.test(all) && !needs.test(all)) say(what);
  const inputsText = JSON.stringify(p.inputs ?? {});
  for (const [re, what] of BANNED) if (re.test(inputsText)) say(`inputs contain ${what}`);
}

/** The figure rule: every $, % or ¢ in a post comes from its inputs, its formula or a pinned price. */
function checkFigures(p, expected, say, sayCard = say) {
  const allowed = new Set();
  for (const v of Object.values(p.inputs ?? {})) for (const f of figuresIn(v)) allowed.add(f);
  if (expected) {
    for (const s of [...(expected.steps ?? []), expected.result, ...(expected.takeaway ?? []), ...(expected.caption ?? []), ...(expected.quotes ?? [])]) {
      for (const f of figuresIn(s)) allowed.add(f);
    }
  }
  for (const [name, text] of textFields(p)) {
    for (const f of figuresIn(text)) {
      if (allowed.has(f)) continue;
      const pinned = pinnedStrings.some((s) => s.includes(f) && text.includes(s));
      if (!pinned) (name === 'caption' || name.startsWith('claim') ? say : sayCard)(`${name} quotes ${f}, which is not an input, not computed (scripts/compute.mjs) and not a pinned price`);
    }
  }
}

function checkClaims(p, say) {
  const claims = p.claims;
  if (claims === undefined) return;
  if (!Array.isArray(claims)) { say('claims must be a list of { text, evidence }'); return; }
  const rheaRepo = process.env.RHEA_REPO;
  for (const [k, c] of claims.entries()) {
    if (!c || typeof c.text !== 'string' || !c.text.trim()) { say(`claim ${k + 1} has no text`); continue; }
    if (typeof c.evidence !== 'string' || !c.evidence.trim()) { say(`claim ${k + 1} ("${c.text}") has no evidence`); continue; }
    if (!facts.includes(c.evidence)) say(`claim ${k + 1} evidence "${c.evidence}" is not listed in FACTS.md`);
    if (rheaRepo) {
      // A route ("/stores/[storeId]") is the page under src/app; a path is a file or folder in the repo
      const site = /^rhea-site\//.test(c.evidence);
      const base = site ? (process.env.RHEA_SITE_REPO || path.join(path.dirname(rheaRepo), 'rhea-site')) : rheaRepo;
      const rel = c.evidence.startsWith('/') ? path.join('src/app', c.evidence.split('?')[0]) : site ? c.evidence.replace(/^rhea-site\//, '') : c.evidence;
      if (!fs.existsSync(path.join(base, rel))) say(`claim ${k + 1} evidence ${c.evidence} does not exist in ${site ? 'rhea-site' : 'the Rhea repo'} (${rel})`);
    }
  }
}

function checkCaption(p, say) {
  const caption = p.caption ?? '';
  if (caption.includes('#')) say('the caption text has a "#": hashtags go in the hashtags list only');
  const lines = caption.split('\n').map((l) => l.trim()).filter(Boolean);
  const [first = '', ...body] = lines;
  if (body.length < LIMIT.bodyLines[0] || body.length > LIMIT.bodyLines[1]) say(`the caption has ${body.length} lines after the first (${LIMIT.bodyLines[0]} to ${LIMIT.bodyLines[1]})`);
  if (first.length > LIMIT.firstLineChars) say(`the first line is ${first.length} characters (at most ${LIMIT.firstLineChars}, so it shows whole)`);
  if (words(first) < LIMIT.firstLineWords) say(`the first line has ${words(first)} words (a search sentence of ${LIMIT.firstLineWords}+)`);
  if (!brand.captionKeywords.some((k) => first.toLowerCase().includes(k))) say(`the first line should name the audience (${brand.captionKeywords.join(', ')})`);
  if (!/\b(owners?|operators?)\b/i.test(first)) say('the first line should say who it is for (owners or operators)');
  if (!/[.!?]$/.test(first)) say('the first line should end with a period or question mark');
  if (typeof p.keyword !== 'string' || !p.keyword.trim()) say('missing keyword (the search phrase the first line leads with)');
  else {
    const at = first.toLowerCase().indexOf(p.keyword.toLowerCase());
    if (at < 0) say(`the first line does not contain the keyword "${p.keyword}"`);
    else if (at > LIMIT.keywordWithin) say(`the keyword "${p.keyword}" starts at character ${at}; put it in the first ${LIMIT.keywordWithin}`);
  }
  for (const [k, l] of body.entries()) if (l.length > LIMIT.bodyLineChars) say(`caption line ${k + 2} is ${l.length} characters (short lines: at most ${LIMIT.bodyLineChars})`);
  const questions = body.filter((l) => /\?$/.test(l));
  if (questions.length > 1) say('at most one question in the caption body');
  if (questions.length === 1 && !/\?$/.test(body[body.length - 1])) say('the question goes last in the caption body');
  const footer = typeOf(p) === 'feature' ? (brand.captionFooterFeature || brand.captionFooter) : brand.captionFooter;
  const full = `${caption.trim()}\n\n${footer}\n\n${(p.hashtags ?? []).join(' ')}`;
  if (full.length > LIMIT.captionChars) say(`the caption with footer and hashtags is ${full.length} characters (Instagram allows ${LIMIT.captionChars})`);
}

function checkHashtagSet(p, say) {
  const tags = p.hashtags;
  const want = brand.hashtagRules?.exactly ?? 5;
  if (!Array.isArray(tags)) { say('hashtags must be a list'); return; }
  for (const h of p.hashtagHints ?? []) if (!tags.map(lower).includes(lower(h))) say(`hashtagHints lists ${h}, which is not in hashtags`);
  if (tags.length !== want) say(`has ${tags.length} hashtags (exactly ${want}; Instagram allows up to 5)`);
  if (new Set(tags.map(lower)).size !== tags.length) say('repeats a hashtag');
  const pair = pluralPair(tags);
  if (pair) say(`has both #${pair[0].slice(1)} and #${pair[1].slice(1)}: one tag and its plural reach the same people, so one of the five is wasted`);
  const type = typeOf(p);
  const topic = topicPool(type);
  const audiences = p.audiences ?? INDUSTRY;
  if (!Array.isArray(audiences) || audiences.length < 2 || audiences.some((a) => !INDUSTRY.includes(a))) say(`audiences must list two or more of ${INDUSTRY.join(', ')}`);
  let topicCount = 0, bookOrBroad = 0, broad = 0, niche = 0, industryCount = 0;
  const industryGroups = new Set();
  for (const t of tags) {
    const l = lower(t);
    if (!/^#[a-z0-9]+$/i.test(t)) { say(`hashtag "${t}" is not a plain #word tag`); continue; }
    if (denied.has(l)) { say(`hashtag ${t} is on the denylist (vendor, competitor, banned or generic)`); continue; }
    if (retiredKey.has(l)) { say(`hashtag ${t} is retired (${pools.retired[retiredKey.get(l)]})`); continue; }
    if (broadTier.has(l)) broad++;
    if (nicheTier.has(l)) niche++;
    if (topic.has(l)) { topicCount++; continue; }
    const g = groupOfTag.get(l);
    if (!g) { say(`hashtag ${t} is in no pool for a ${type} post (brand.json hashtagPools)`); continue; }
    if (g === 'bookkeeping' || g === 'broad') { bookOrBroad++; continue; }
    industryCount++;
    industryGroups.add(g);
    if (Array.isArray(audiences) && !audiences.includes(g)) say(`hashtag ${t} is a ${g} tag, but the post is for ${audiences.join(', ')} (audiences)`);
  }
  if (topicCount < 1) say(`needs at least one topic tag from the ${type} pool`);
  if (industryCount < 2 || industryGroups.size < 2) say('needs industry tags from at least two different industry groups');
  if (Array.isArray(audiences)) {
    const groups = tags.map((t) => groupOfTag.get(lower(t))).filter((g) => g && g !== 'bookkeeping' && g !== 'broad');
    const wrong = industryRule(String(p.caption ?? '').split('\n')[0], audiences, groups);
    if (wrong) say(`hashtags: ${wrong}`);
  }
  if (bookOrBroad < 1) say('needs a bookkeeping or broad-owner tag');
  if (broad < 1) say('needs at least one broad tag (hashtagPools.tiers.broad) in the mix');
  if (niche < 1) say('needs at least one niche tag (hashtagPools.tiers.niche) in the mix');
}

function checkOwnerMath(p, say, published) {
  for (const key of ['hook', 'term', 'formula', 'inputs', 'steps', 'result', 'takeaway']) if (p[key] === undefined || p[key] === '') say(`missing ${key}`);
  if (!Array.isArray(p.steps) || p.steps.length < 3 || p.steps.length > 5) say(`has ${p.steps?.length ?? 0} steps (3 to 5)`);
  try {
    const t = timing(p);
    if (p.thumbOffsetMs !== t.thumbOffsetMs) say(`thumbOffsetMs is ${p.thumbOffsetMs}; the result is fully shown at ${t.thumbOffsetMs}`);
    if (t.duration < 22 || t.duration > 26) say(`duration ${t.duration}s is outside 22–26 s`);
  } catch (e) { say(e.message); }
  const compute = COMPUTE[p.slug];
  if (!compute) { say('no formula in scripts/compute.mjs (add it to COMPUTE)'); return null; }
  let inputs, expected;
  try { inputs = Object.fromEntries(Object.entries(p.inputs ?? {}).map(([k, v]) => [k, parseInput(v)])); } catch (e) { say(e.message); return null; }
  try { expected = compute(inputs); } catch (e) { say(`formula threw: ${e.message}`); return null; }
  for (const [k, v] of Object.entries(inputs)) if (typeof v === 'number' && Number.isNaN(v)) say(`input "${k}" is not a number`);
  if (expected.steps.length !== (p.steps ?? []).length) say(`formula yields ${expected.steps.length} steps, content has ${p.steps?.length ?? 0}`);
  expected.steps.forEach((v, k) => { if (p.steps?.[k] && p.steps[k].value !== v) say(`step ${k + 1} "${p.steps[k].label}" is "${p.steps[k].value}", computed "${v}"`); });
  if (p.result?.value !== expected.result) say(`result is "${p.result?.value}", computed "${expected.result}"`);
  for (const s of expected.takeaway ?? []) if (!(p.takeaway ?? '').includes(s)) say(`takeaway should quote ${s}`);
  if (!published) for (const s of expected.caption ?? []) if (!(p.caption ?? '').includes(s)) say(`caption should quote ${s}`);
  if (published) {
    // The first run's rule, for what already went out: every $ figure is a formula's or an input's
    const MONEY = /\$\d{1,3}(?:,\d{3})*(?:\.\d+)?(?![\d,]\d)/g;
    const allowed = new Set([...expected.steps, expected.result, ...expected.takeaway, ...expected.caption, ...Object.values(p.inputs)].flatMap((s) => String(s).match(MONEY) ?? []));
    for (const field of ['takeaway', 'hook']) for (const m of (p[field] ?? '').match(MONEY) ?? []) if (!allowed.has(m)) say(`${field} quotes ${m}, which no formula or input produces`);
  }
  return expected;
}

function checkTip(p, say) {
  for (const key of ['hook', 'title', 'lines', 'action', 'takeaway']) if (p[key] === undefined || p[key] === '') say(`missing ${key}`);
  if (words(p.title) > LIMIT.tipTitleWords) say(`title has ${words(p.title)} words (max ${LIMIT.tipTitleWords})`);
  const lines = Array.isArray(p.lines) ? p.lines : [];
  if (lines.length < LIMIT.tipLines[0] || lines.length > LIMIT.tipLines[1]) say(`has ${lines.length} lines (${LIMIT.tipLines[0]} to ${LIMIT.tipLines[1]})`);
  lines.forEach((l, k) => { if (words(l) > LIMIT.tipLineWords) say(`line ${k + 1} has ${words(l)} words (max ${LIMIT.tipLineWords})`); });
  if (words(p.action) > LIMIT.tipActionWords) say(`action has ${words(p.action)} words (max ${LIMIT.tipActionWords})`);
  const n = lines.length;
  const want = Math.round((7 + n * 1.6 + 0.7) * 1000);
  if (n >= 3 && n <= 5 && p.thumbOffsetMs !== want) say(`thumbOffsetMs is ${p.thumbOffsetMs}; with ${n} lines the action is fully shown at ${want}`);
  return computeQuotes(p, say);
}

function checkMyth(p, say) {
  for (const key of ['hook', 'fact', 'why', 'takeaway']) if (p[key] === undefined || p[key] === '') say(`missing ${key}`);
  if (words(p.fact) > LIMIT.mythFactWords) say(`fact has ${words(p.fact)} words (max ${LIMIT.mythFactWords})`);
  const why = Array.isArray(p.why) ? p.why : [];
  if (why.length < LIMIT.mythWhy[0] || why.length > LIMIT.mythWhy[1]) say(`has ${why.length} "why" lines (${LIMIT.mythWhy[0]} to ${LIMIT.mythWhy[1]})`);
  why.forEach((l, k) => { if (words(l) > LIMIT.mythWhyWords) say(`why line ${k + 1} has ${words(l)} words (max ${LIMIT.mythWhyWords})`); });
  if (p.thumbOffsetMs !== 4200) say(`thumbOffsetMs is ${p.thumbOffsetMs}; a myth's cover is at 4200 (the fact under the myth)`);
  return computeQuotes(p, say);
}

/** A tip or myth that quotes a computed figure has a COMPUTE entry returning { quotes, takeaway?, caption? }. */
function computeQuotes(p, say) {
  const compute = COMPUTE[p.slug];
  if (!compute) return null;
  try {
    const inputs = Object.fromEntries(Object.entries(p.inputs ?? {}).map(([k, v]) => [k, parseInput(v)]));
    const expected = compute(inputs);
    for (const s of expected.takeaway ?? []) if (!(p.takeaway ?? '').includes(s)) say(`takeaway should quote ${s}`);
    for (const s of expected.caption ?? []) if (!(p.caption ?? '').includes(s)) say(`caption should quote ${s}`);
    return expected;
  } catch (e) { say(`formula threw: ${e.message}`); return null; }
}

function checkFeature(p, say, warn) {
  for (const key of ['headline', 'demoNote', 'recording', 'claims', 'cta']) if (p[key] === undefined || p[key] === '') say(`missing ${key}`);
  if (words(p.headline) > LIMIT.headlineWords) say(`headline has ${words(p.headline)} words (max ${LIMIT.headlineWords})`);
  if (p.sub !== undefined && words(p.sub) > LIMIT.subWords) say(`sub has ${words(p.sub)} words (max ${LIMIT.subWords})`);
  if (p.demoNote !== brand.product?.demoNote) say(`demoNote must be exactly "${brand.product?.demoNote}"`);
  const cta = `Try the demo: ${brand.product?.demoUrl ?? 'demo.rheafi.com'}`;
  if (p.cta !== cta) say(`cta must be exactly "${cta}"`);
  if (!Array.isArray(p.claims) || p.claims.length < LIMIT.claims[0] || p.claims.length > LIMIT.claims[1]) say(`has ${p.claims?.length ?? 0} claims (${LIMIT.claims[0]} to ${LIMIT.claims[1]}, each with evidence)`);
  if (!/\bdemo\b|sample data/i.test(p.caption ?? '')) say('the caption must say "demo" or "sample data" (the screens are the demo company)');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.recording ?? '')) say(`recording "${p.recording}" is not an id`);
  else {
    if (!recordings[p.recording]) say(`recording "${p.recording}" is not described in content/recordings.json (screens and steps to record)`);
    const setUp = fs.existsSync(path.join(root, 'render', 'features', `${p.recording}.json`)) || fs.existsSync(path.join(root, 'render', 'features', p.recording, 'frames.json'));
    if (!setUp) warn(`recording "${p.recording}" is not set up in render/features/ yet (content/recordings.json has its shot list)`);
  }
  if (!Number.isInteger(p.thumbOffsetMs) || p.thumbOffsetMs < 1000 || p.thumbOffsetMs > 19000) say(`thumbOffsetMs ${p.thumbOffsetMs} must be inside the recording (1000 to 19000)`);
  return null;
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

const args = process.argv.slice(2);
const monthArg = args.includes('--month') ? args[args.indexOf('--month') + 1] : null;
const contentDir = path.join(root, 'content');
const allFiles = fs.readdirSync(contentDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
if (monthArg && !allFiles.includes(`${monthArg}.json`)) { console.error(`No content file for ${monthArg} in content/`); process.exit(1); }
if (allFiles.length === 0) { console.error('No content file in content/'); process.exit(1); }

// Prose files: never the banned product word
for (const f of ['README.md', 'FACTS.md', 'render/template.html', 'brand.json', 'content/recordings.json']) {
  const file = path.join(root, f);
  if (fs.existsSync(file) && /\bAI\b/.test(fs.readFileSync(file, 'utf8'))) { console.error(`${f} contains the word "AI"`); process.exit(1); }
}

// Themes must meet WCAG AA before any card uses them
const low = checkThemes(brand.themes).filter((r) => !r.ok);
if (low.length) {
  for (const r of low) console.error(`brand.json theme "${r.theme}": ${r.label} is ${r.ratio.toFixed(2)}:1 (${r.fg} on ${r.bg}), needs ${r.min}:1`);
  process.exit(1);
}
console.log(`brand.json: ${Object.keys(brand.themes).length} themes meet WCAG AA (node scripts/contrast.mjs for the ratios).`);

const problems = new Map(allFiles.map((f) => [f, []]));
const warnings = new Map(allFiles.map((f) => [f, []]));
const globalProblems = checkPools();

const files = allFiles.map((f) => {
  const content = JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf8'));
  return { name: f, month: f.replace('.json', ''), content, posts: content.posts ?? [] };
});
const all = [];
for (const file of files) for (const p of file.posts) all.push({ p, file: file.name });
const tag = (p) => `${p.date} ${slotOf(p) === 'evening' ? '6PM' : '7AM'} ${p.slug ?? '(no slug)'}`;
const sayFor = (file, p) => (msg) => problems.get(file).push(`${p ? `${tag(p)}: ` : ''}${msg}`);
const warnFor = (file, p) => (msg) => warnings.get(file).push(`${p ? `${tag(p)}: ` : ''}${msg}`);

// File-level: month, order, dates
for (const file of files) {
  const say = sayFor(file.name, null);
  if (file.content.month !== file.month) say(`"month" is ${file.content.month}; the file is ${file.name}`);
  if (file.posts.length === 0) say('no posts');
  const grand = GRANDFATHERED[file.month];
  let previous = '';
  for (const p of file.posts) {
    const s = sayFor(file.name, p);
    if (!isIsoDate(p.date ?? '')) { s(`date "${p.date}" is not YYYY-MM-DD`); continue; }
    if (p.date.slice(0, 7) < file.month) s(`dated before ${file.month}`);
    if (p.date.slice(0, 7) > file.month) {
      const ok = grand && p.date <= grand.until && slotOf(p) === grand.slot && typeOf(p) === grand.type;
      if (!ok) s(`dated after ${file.month}: a post goes in the file of the month it is dated in (only the first run's owner math in 2026-10.json continues to ${grand?.until ?? 'its end'})`);
    }
    const k = orderKey(p);
    if (previous && k <= previous) s('is not after the post before it in (date, slot) order');
    previous = k;
  }
  if (file.posts[0]?.date && file.posts[0].date.slice(0, 7) !== file.month) say(`the first post is dated ${file.posts[0].date}; the file is named for ${file.month}`);
}

// Global: (date, slot) once, slugs once, slots and types, memorial dates
const bySlot = new Map(), bySlug = new Map();
for (const { p, file } of all) {
  const s = sayFor(file, p);
  if (!SLOTS.includes(slotOf(p))) s(`slot "${p.slot}" is not morning or evening`);
  if (!TYPES.includes(typeOf(p))) s(`type "${p.type}" is not one of ${TYPES.join(', ')}`);
  const key = `${p.date}|${slotOf(p)}`;
  if (bySlot.has(key)) s(`${p.date} ${slotOf(p)} is used twice (also ${bySlot.get(key).slug})`);
  bySlot.set(key, p);
  if (bySlug.has(p.slug)) s('slug is used twice across content files');
  bySlug.set(p.slug, p);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug ?? '')) s(`slug "${p.slug}" is not lowercase words joined by hyphens`);
  if (!isIsoDate(p.date ?? '')) continue;
  const expected = schedule.typesFor(p.date);
  if (expected.memorial) { s(`${p.date} is a memorial date: no regular post in either slot`); continue; }
  const want = expected[slotOf(p)];
  if (want !== typeOf(p)) {
    if (typeof p.rotationOverride === 'string' && p.rotationOverride.trim().length >= 10) warnFor(file, p)(`differs from the rotation (${want ?? 'no post'}): ${p.rotationOverride}`);
    else s(`the rotation puts ${want ? `a ${want}` : 'no post'} in this slot, not a ${typeOf(p)} (scripts/schedule.mjs; add "rotationOverride": "<reason>" to differ on purpose)`);
  }
}

// Every day from the rotation's start to the last content date has its posts
const sorted = [...all].sort((a, b) => orderKey(a.p).localeCompare(orderKey(b.p)));
const lastDate = sorted.at(-1)?.p.date;
if (lastDate) {
  for (let d = schedule.start; d <= lastDate; d = addDays(d, 1)) {
    const t = schedule.typesFor(d);
    for (const slot of SLOTS) {
      if (t[slot] && !bySlot.has(`${d}|${slot}`)) {
        const file = allFiles.includes(`${d.slice(0, 7)}.json`) ? `${d.slice(0, 7)}.json` : allFiles.at(-1);
        sayFor(file, null)(`${d} ${slot === 'morning' ? '7AM' : '6PM'}: no post (the rotation wants a ${t[slot]})`);
      }
    }
  }
}

// Per post
for (const { p, file } of all) {
  const say = sayFor(file, p), warn = warnFor(file, p);
  const published = isPublished(p);
  const type = typeOf(p);
  if (!brand.themes[p.theme]) say(`theme "${p.theme}" is not one of ${Object.keys(brand.themes).join(', ')}`);
  for (const key of ['date', 'slug', 'theme', 'caption', 'hashtags', 'thumbOffsetMs']) if (p[key] === undefined || p[key] === '') say(`missing ${key}`);
  if (type !== 'feature') {
    if (words(p.hook) > LIMIT.hookWords) say(`hook has ${words(p.hook)} words (max ${LIMIT.hookWords})`);
    if (p.hook && !/[?.!]$/.test(p.hook)) say('hook should end with ?, . or !');
    if (words(p.takeaway) > LIMIT.takeawayWords) say(`takeaway has ${words(p.takeaway)} words (max ${LIMIT.takeawayWords})`);
  }
  // The renderer's timeline must agree on the cover (render/timing.mjs)
  if (type === 'tip' || type === 'myth') {
    try { const t = timing(p); if (t.thumbOffsetMs !== p.thumbOffsetMs) say(`render/timing.mjs puts the cover at ${t.thumbOffsetMs}, the post says ${p.thumbOffsetMs}`); } catch { /* checked by checkTip / checkMyth */ }
  }

  let expected = null;
  if (type === 'owner-math') expected = checkOwnerMath(p, say, published);
  else if (type === 'tip') expected = checkTip(p, say);
  else if (type === 'myth') expected = checkMyth(p, say);
  else if (type === 'feature') expected = checkFeature(p, say, warn);

  // Never the banned product word, anywhere (published or not)
  if (/\bAI\b/.test(JSON.stringify(p))) say('contains the word "AI"');
  if (published) continue; // what went out stays as it went out

  // Card text already in a rendered video that will not be re-rendered (same card fields): a problem
  // there is reported as a warning, since changing it means a new video (render --force)
  const sayCard = videoFrozen(p) ? (msg) => warn(`${msg} (already in the rendered video)`) : say;
  checkFigures(p, expected, say, sayCard);
  checkWords(p, say, sayCard);
  checkClaims(p, say);
  const text = textFields(p).map(([, v]) => v).join('\n');
  if (type === 'feature' || /\bRhea\b/.test(text)) {
    if (!Array.isArray(p.claims) || p.claims.length === 0) say('names Rhea, so it needs claims with evidence');
  }
  if (p.taxAdjacent || (type !== 'owner-math' && TAX_ADJACENT.test(text))) {
    if (!/ask your CPA/i.test(`${p.takeaway ?? ''}\n${p.caption ?? ''}`)) say('is tax-adjacent: the takeaway or caption must say "ask your CPA"');
  }
  checkCaption(p, say);
  checkHashtagSet(p, say);
}

/** The post's video exists and its card fields are the ones it was rendered from. */
function videoFrozen(p) {
  if (typeOf(p) === 'feature') return false;
  const dir = path.join(postsDir, folderOf(p));
  if (!fs.existsSync(path.join(dir, 'reel.mp4')) || !fs.existsSync(path.join(dir, 'meta.json'))) return false;
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    if (meta.cardHash) return meta.cardHash === cardHash(p);
    return meta.hook === p.hook && (meta.theme || 'paper') === (p.theme || 'paper') && JSON.stringify(meta.result ?? null) === JSON.stringify(p.result ?? null);
  } catch { return false; }
}

// Sequence checks over every post in (date, slot) order
const seq = sorted.map(({ p, file }) => ({ p, file, published: isPublished(p) }));
const frozenTheme = (x) => {
  if (x.published) return true;
  const dir = path.join(postsDir, folderOf(x.p));
  if (!fs.existsSync(path.join(dir, 'meta.json')) || !fs.existsSync(path.join(dir, 'reel.mp4'))) return false;
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).theme === x.p.theme; } catch { return false; }
};
// The grid includes the memorial carousels: a photo tile between the posts around it
const grid = [];
let lastSeen = null;
for (const x of seq) {
  if (lastSeen) for (let d = addDays(lastSeen, 1); d <= x.p.date; d = addDays(d, 1)) if (schedule.isMemorial(d)) grid.push(null);
  grid.push(x);
  lastSeen = x.p.date;
}
let columnRepeats = 0;
for (let i = 1; i < seq.length; i++) {
  const a = seq[i - 1], b = seq[i];
  const say = sayFor(b.file, b.p);
  if (a.p.theme === b.p.theme && !(frozenTheme(a) && frozenTheme(b))) say(`theme ${b.p.theme} is the same as the post before it (${tag(a.p)})`);
  if (b.published) continue;
  const shared = (b.p.hashtags ?? []).filter((t) => (a.p.hashtags ?? []).map(lower).includes(lower(t)));
  if (shared.length > LIMIT.sharedWithNeighbor) say(`shares ${shared.length} hashtags with the post before it (${shared.join(' ')}; at most ${LIMIT.sharedWithNeighbor})`);
}
for (let i = 3; i < grid.length; i++) {
  const a = grid[i - 3], b = grid[i];
  if (!a || !b || a.p.theme !== b.p.theme || (frozenTheme(a) && frozenTheme(b))) continue;
  columnRepeats++;
  warnFor(b.file, b.p)(`theme ${b.p.theme} sits above the same theme in the grid (${tag(a.p)}, three posts earlier)`);
}

// Identical sets within 14 days; recording reuse
const unpublished = seq.filter((x) => !x.published);
for (let i = 0; i < unpublished.length; i++) {
  const b = unpublished[i];
  const setB = [...(b.p.hashtags ?? [])].map(lower).sort().join(' ');
  for (let j = 0; j < i; j++) {
    const a = unpublished[j];
    const gap = daysBetween(a.p.date, b.p.date);
    if (gap < LIMIT.setRepeatDays && [...(a.p.hashtags ?? [])].map(lower).sort().join(' ') === setB) {
      sayFor(b.file, b.p)(`uses the same five hashtags as ${tag(a.p)}, ${gap} days earlier (no repeat within ${LIMIT.setRepeatDays} days)`);
    }
    if (typeOf(b.p) === 'feature' && typeOf(a.p) === 'feature' && a.p.recording === b.p.recording) {
      if (gap < LIMIT.recordingGapDays) sayFor(b.file, b.p)(`shows recording ${b.p.recording} again ${gap} days after ${tag(a.p)} (at least ${LIMIT.recordingGapDays})`);
      if (a.p.headline === b.p.headline) sayFor(b.file, b.p)(`repeats ${tag(a.p)}'s headline; a second pass needs a new one`);
      if (a.p.caption === b.p.caption) sayFor(b.file, b.p)(`repeats ${tag(a.p)}'s caption`);
    }
  }
}

// Every industry group and the bookkeeping group in each Monday–Sunday week the unpublished posts cover
if (unpublished.length) {
  const first = unpublished[0].p.date, last = unpublished.at(-1).p.date;
  for (let monday = addDays(first, (8 - weekday(first)) % 7); addDays(monday, 6) <= last; monday = addDays(monday, 7)) {
    const sunday = addDays(monday, 6);
    const week = unpublished.filter((x) => x.p.date >= monday && x.p.date <= sunday);
    const groups = new Set(week.flatMap((x) => (x.p.hashtags ?? []).map((t) => groupOfTag.get(lower(t))).filter(Boolean)));
    const missing = [...INDUSTRY, 'bookkeeping'].filter((g) => !groups.has(g));
    if (missing.length && week.length) sayFor(week.at(-1).file, null)(`week of ${monday}: no ${missing.join(', ')} hashtag on any post (every group at least once a week)`);
  }
}

// Report
let failed = false;
if (globalProblems.length) { failed = true; console.error('brand.json:'); for (const m of globalProblems) console.error(`  - ${m}`); }
for (const f of monthArg ? [`${monthArg}.json`] : allFiles) {
  const file = files.find((x) => x.name === f);
  const list = problems.get(f), warn = warnings.get(f);
  const n = file.posts.length;
  if (list.length) {
    failed = true;
    console.error(`${f}: ${list.length} problem${list.length === 1 ? '' : 's'} in ${n} posts`);
    for (const m of list) console.error(`  - ${m}`);
  } else {
    const types = TYPES.map((t) => [t, file.posts.filter((p) => typeOf(p) === t).length]).filter(([, c]) => c).map(([t, c]) => `${c} ${t}`).join(', ');
    console.log(`${f}: ${n} posts verified (${file.posts[0]?.date} to ${file.posts.at(-1)?.date}; ${types}); every figure recomputes, every claim has evidence, every hashtag set keeps the rules.`);
  }
  if (warn.length) {
    console.log(`${f}: ${warn.length} warning${warn.length === 1 ? '' : 's'}`);
    for (const m of warn) console.log(`  · ${m}`);
  }
}
if (!monthArg && columnRepeats) console.log(`Grid: ${columnRepeats} theme column repeat${columnRepeats === 1 ? '' : 's'} (warnings above; the rendered morning posts' themes are fixed).`);
if (!process.env.RHEA_REPO) console.log('Claims: evidence checked against FACTS.md; set RHEA_REPO=/Users/alex/Desktop/rhea to check each file exists too.');
process.exit(failed ? 1 : 0);
