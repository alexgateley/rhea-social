#!/usr/bin/env node
// Completes each post's five hashtags from brand.json's pools, under the rules verify.mjs enforces:
//
//   npm run hashtags -- --month 2026-12            # fill posts with fewer than five tags
//   npm run hashtags -- --month 2026-12 --redo     # re-pick every unpublished post of the month
//   npm run hashtags -- --month 2026-12 --dry-run  # print, don't write
//
// The writer chooses what the post is about: put its topic tag (one or two from the type's pool,
// hashtagPools.topic) in "hashtags", and list the industries it is true for in "audiences" (default:
// all four). The picker never adds a topic tag of its own. Tags in "hashtagHints" are kept too (for example #multiunitfranchisee on a royalty post).
// The picker adds the rest so that each set has two industry tags from two different groups the post
// fits (and, when the caption's first line names industries, the ones it names: industryRule; a post
// true for one industry only, like a royalty post, takes both from that one), never two tags for the
// same audience (pluralPair: a plural, or a hashtagRules.sameAudience group), a
// bookkeeping or broad-owner tag, at least one broad and one niche tag, never repeats a set
// within 14 days, shares at most two tags with the post before it, and covers every industry group
// and the bookkeeping group each week; among the sets that keep the rules it takes the one whose tags
// were used least recently. Published posts are never touched. Deterministic: same input, same tags.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, daysBetween, weekday } from './schedule.mjs';
import { stringifyContent } from './format.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lower = (t) => String(t).toLowerCase();
const slotOf = (p) => p.slot || 'morning';
const typeOf = (p) => p.type || 'owner-math';
const orderKey = (p) => `${p.date}|${slotOf(p) === 'morning' ? 0 : 1}`;
const mondayOf = (iso) => addDays(iso, -((weekday(iso) + 6) % 7));

// The industries a caption's first line names, in the order it names them (brand.json
// hashtagRules.industryFromFirstLine): the words search reads and the industry tags should say the same
// audience.
const NAMED = [
  ['franchise', /\bfranchise(e|es)?\b|\bfranchising\b|\bmulti-unit\b/i],
  ['restaurant', /\brestaurants?\b|\bquick[- ]service\b|\bQSR\b/i],
  ['coffee', /\bcoffee\b|\bcaf(e|é)s?\b/i],
  ['salon', /\bsalons?\b/i],
];
/**
 * Two tags that reach the same people waste one of the five slots: a tag and its plural (#salonowner,
 * #salonowners), or two tags brand.json lists as one audience (`hashtagRules.sameAudience`, e.g.
 * #restaurantowner and #restaurateur). Returns the first such pair, or null.
 */
export function pluralPair(tags, sameAudience = []) {
  const l = tags.map((t) => String(t).toLowerCase());
  for (const t of l) if (l.includes(`${t}s`)) return [t, `${t}s`];
  for (const group of sameAudience) {
    const hit = group.map((t) => String(t).toLowerCase()).filter((t) => l.includes(t));
    if (hit.length > 1) return hit.slice(0, 2);
  }
  return null;
}

/** A post about franchise royalties or the ad fund: true for franchise owners only (hashtagRules.industryFit). */
export function isRoyaltyPost(p) {
  const text = [p.keyword, p.hook, p.term, p.title, p.fact, p.headline, String(p.caption ?? '').split('\n')[0]].filter(Boolean).join('\n');
  return /\broyalt(y|ies)\b|\bad[- ]fund\b/i.test(text);
}

export function namedIndustries(text) {
  return NAMED.map(([g, re]) => [g, String(text ?? '').search(re)]).filter(([, at]) => at >= 0).sort((a, b) => a[1] - b[1]).map(([g]) => g);
}

/**
 * The first-line rule for a post's industry tags. `groups` are the industry groups of its industry tags.
 * Returns null when the tags keep it, otherwise what is wrong.
 */
export function industryRule(firstLine, audiences, groups) {
  const named = namedIndustries(firstLine).filter((g) => audiences.includes(g));
  if (!named.length) return null;
  const have = new Set(groups);
  const need = Math.min(2, named.length);
  if (named.filter((g) => have.has(g)).length < need) {
    return `its industry tags should include ${need === 1 ? `a ${named[0]} tag` : `two of the industries its first line names (${named.join(', ')})`}`;
  }
  const allowed = new Set([...named, 'franchise'].filter((g) => audiences.includes(g)));
  if (allowed.size >= 2) {
    const off = [...have].filter((g) => !allowed.has(g));
    if (off.length) return `has ${off.join(' and ')} industry tags, but its first line names ${named.join(', ')} (industry tags follow the first line; franchise is always allowed)`;
  }
  return null;
}

export function createPicker(brand) {
  const pools = brand.hashtagPools;
  const INDUSTRY = Object.keys(pools.industry);
  const groupOf = new Map();
  for (const g of INDUSTRY) for (const t of pools.industry[g]) groupOf.set(lower(t), g);
  for (const t of pools.bookkeeping) groupOf.set(lower(t), 'bookkeeping');
  for (const t of pools.broad) groupOf.set(lower(t), 'broad');
  const broadTier = new Set(pools.tiers.broad.map(lower));
  const nicheTier = new Set(pools.tiers.niche.map(lower));
  const want = brand.hashtagRules.exactly ?? 5;
  const sameAudience = brand.hashtagRules.sameAudience ?? [];

  /** Does a full set keep the composition rules for this post? */
  function composes(tags, p) {
    const topic = new Set(pools.topic[typeOf(p)].map(lower));
    const audiences = p.audiences ?? INDUSTRY;
    let topicCount = 0, bookOrBroad = 0, industry = 0;
    const groups = new Set();
    for (const t of tags) {
      const l = lower(t);
      if (topic.has(l)) { topicCount++; continue; }
      const g = groupOf.get(l);
      if (!g) return false;
      if (g === 'bookkeeping' || g === 'broad') { bookOrBroad++; continue; }
      if (!audiences.includes(g)) return false;
      industry++; groups.add(g);
    }
    const industryGroups = tags.map((t) => groupOf.get(lower(t))).filter((g) => g && g !== 'bookkeeping' && g !== 'broad');
    if (pluralPair(tags, sameAudience)) return false;
    // Two industry tags from two groups; a post true for one industry only (a royalty post: franchise)
    // takes both from that one
    return topicCount >= 1 && industry >= 2 && groups.size >= Math.min(2, audiences.length) && bookOrBroad >= 1
      && tags.some((t) => broadTier.has(lower(t))) && tags.some((t) => nicheTier.has(lower(t)))
      && industryRule(String(p.caption ?? '').split('\n')[0], audiences, industryGroups) === null;
  }

  /** Every way to choose k items from list, in order. */
  function* choose(list, k, start = 0, acc = []) {
    if (acc.length === k) { yield acc; return; }
    for (let i = start; i <= list.length - (k - acc.length); i++) yield* choose(list, k, i + 1, [...acc, list[i]]);
  }

  /**
   * Picks the tags for `p` given everything placed before it (`history`: posts in order, with their
   * final hashtags) and the posts after it that are already fixed (`after`).
   */
  function pick(p, history, after = []) {
    const topic = pools.topic[typeOf(p)];
    const topicSet = new Set(topic.map(lower));
    const hints = new Set((p.hashtagHints ?? []).map(lower));
    const kept = [];
    for (const t of p.hashtags ?? []) if ((topicSet.has(lower(t)) || hints.has(lower(t))) && !kept.some((k) => lower(k) === lower(t))) kept.push(t);
    for (const t of p.hashtagHints ?? []) if (!kept.some((k) => lower(k) === lower(t))) kept.push(t);
    if (!kept.some((t) => topicSet.has(lower(t)))) throw new Error(`${p.date} ${p.slug}: put its topic tag (from hashtagPools.topic["${typeOf(p)}"]) in hashtags first`);
    const audiences = p.audiences ?? INDUSTRY;
    // Topic tags come only from the writer (a topic the post is not about would mislead): the picker
    // adds industry, bookkeeping and broad-owner tags
    const candidates = [
      ...audiences.flatMap((g) => pools.industry[g]),
      ...pools.bookkeeping, ...pools.broad,
    ].filter((t) => !kept.some((k) => lower(k) === lower(t)));

    const prev = history.at(-1);
    const next = after[0];
    const lastUse = new Map();
    for (const h of history) for (const t of h.hashtags) lastUse.set(lower(t), h.date);
    const week = mondayOf(p.date);
    const covered = new Set(history.filter((h) => mondayOf(h.date) === week).flatMap((h) => h.hashtags.map((t) => groupOf.get(lower(t))).filter(Boolean)));
    const near = [...history, ...after].filter((h) => Math.abs(daysBetween(h.date, p.date)) < 14 && h.hashtags.length === want);
    const nearSets = new Set(near.map((h) => h.hashtags.map(lower).sort().join(' ')));
    const prevGroups = new Set((prev?.hashtags ?? []).map((t) => groupOf.get(lower(t))).filter(Boolean));

    let best = null;
    for (const extra of choose(candidates, want - kept.length)) {
      const tags = [...kept, ...extra];
      if (!composes(tags, p)) continue;
      const key = tags.map(lower).sort().join(' ');
      if (nearSets.has(key)) continue;
      const sharedPrev = prev ? tags.filter((t) => prev.hashtags.map(lower).includes(lower(t))).length : 0;
      const sharedNext = next ? tags.filter((t) => next.hashtags.map(lower).includes(lower(t))).length : 0;
      if (sharedPrev > 2 || sharedNext > 2) continue;
      let cost = sharedPrev * 3 + sharedNext * 3;
      for (const t of extra) {
        const used = lastUse.get(lower(t));
        if (used) cost += Math.max(0, 10 - daysBetween(used, p.date)) * 2;
        const g = groupOf.get(lower(t));
        if (g && prevGroups.has(g) && g !== 'bookkeeping' && g !== 'broad') cost += 1.5;
        if (g === 'bookkeeping') cost -= 0.5;
      }
      const groups = new Set(tags.map((t) => groupOf.get(lower(t))).filter(Boolean));
      // Two tags from one industry reach much the same people: prefer a third industry or a bookkeeping tag
      for (const g of INDUSTRY) { const n = tags.filter((t) => groupOf.get(lower(t)) === g).length; if (n > 1) cost += 2.5 * (n - 1); }
      for (const g of [...INDUSTRY, 'bookkeeping']) if (groups.has(g) && !covered.has(g)) cost -= 3;
      if (!best || cost < best.cost || (cost === best.cost && key < best.key)) best = { cost, key, tags };
    }
    if (!best) throw new Error(`${p.date} ${p.slug}: no set of ${want} keeps every rule; widen its audiences or change its topic tag`);
    // Topic first, then industries, then bookkeeping/broad: the order people read
    const rank = (t) => (topicSet.has(lower(t)) ? 0 : ['bookkeeping', 'broad'].includes(groupOf.get(lower(t))) ? 2 : 1);
    return [...best.tags].sort((a, b) => rank(a) - rank(b));
  }

  return { pick, composes };
}

// ---------------------------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const month = args.includes('--month') ? args[args.indexOf('--month') + 1] : null;
  const redo = args.includes('--redo'), dry = args.includes('--dry-run');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) { console.error('Usage: node scripts/hashtags.mjs --month YYYY-MM [--redo] [--dry-run]'); process.exit(2); }
  const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));
  const contentDir = path.join(root, 'content');
  const files = fs.readdirSync(contentDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort()
    .map((f) => ({ f, content: JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf8')) }));
  const target = files.find((x) => x.f === `${month}.json`);
  if (!target) { console.error(`No content/${month}.json`); process.exit(2); }
  const marker = (p) => path.join(root, brand.publishedDir || 'published', `${p.date}${brand.slots?.[slotOf(p)]?.markerSuffix ?? ''}.json`);
  const all = files.flatMap((x) => x.content.posts.map((p) => ({ p, mine: x === target }))).sort((a, b) => orderKey(a.p).localeCompare(orderKey(b.p)));
  const { pick } = createPicker(brand);
  const want = brand.hashtagRules.exactly ?? 5;
  const todo = (x) => x.mine && !fs.existsSync(marker(x.p)) && (redo || (x.p.hashtags ?? []).length < want);
  const history = [];
  let changed = 0;
  for (const [i, x] of all.entries()) {
    if (todo(x)) {
      const after = all.slice(i + 1).filter((y) => !todo(y)).map((y) => ({ date: y.p.date, hashtags: y.p.hashtags ?? [] }));
      const tags = pick(x.p, history, after.length && all[i + 1] && !todo(all[i + 1]) ? after : []);
      if (tags.join(' ') !== (x.p.hashtags ?? []).join(' ')) changed++;
      x.p.hashtags = tags;
      console.log(`${x.p.date} ${slotOf(x.p) === 'evening' ? '6PM' : '7AM'} ${x.p.slug.padEnd(30)} ${tags.join(' ')}`);
    }
    history.push({ date: x.p.date, hashtags: x.p.hashtags ?? [] });
  }
  if (!dry) fs.writeFileSync(path.join(contentDir, target.f), stringifyContent(target.content));
  console.log(`${changed} post${changed === 1 ? '' : 's'} ${dry ? 'would change' : 'changed'} in content/${target.f}. Run npm run verify.`);
}
