// The hashtag picker (scripts/hashtags.mjs) against brand.json's real pools: every set it picks keeps
// the rules verify.mjs enforces, it never adds a topic tag the writer did not choose, and it is
// deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPicker, industryRule, namedIndustries, pluralPair } from './hashtags.mjs';
import { addDays, daysBetween } from './schedule.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));
const pools = brand.hashtagPools;
const lower = (t) => t.toLowerCase();
const groupOf = new Map();
for (const [g, tags] of Object.entries(pools.industry)) for (const t of tags) groupOf.set(lower(t), g);

const TOPICS = { 'owner-math': '#laborcost', tip: '#monthendclose', myth: '#cashflowmanagement', feature: '#bookkeepingsoftware' };
function sequence(days = 40, audiences) {
  const posts = [];
  for (let k = 0; k < days; k++) {
    const date = addDays('2026-12-01', k);
    posts.push({ date, slot: 'morning', type: 'owner-math', slug: `m${k}`, audiences, hashtags: [TOPICS['owner-math']] });
    posts.push({ date, slot: 'evening', type: k % 2 ? 'tip' : 'feature', slug: `e${k}`, audiences, hashtags: [TOPICS[k % 2 ? 'tip' : 'feature']] });
  }
  return posts;
}
function run(posts) {
  const { pick } = createPicker(brand);
  const history = [];
  for (const p of posts) { p.hashtags = pick(p, history); history.push({ date: p.date, hashtags: p.hashtags }); }
  return posts;
}

test('every picked set keeps the composition rules', () => {
  const { composes } = createPicker(brand);
  for (const p of run(sequence())) {
    assert.equal(p.hashtags.length, 5, p.slug);
    assert.equal(new Set(p.hashtags.map(lower)).size, 5, `${p.slug}: no repeats`);
    assert.ok(composes(p.hashtags, p), `${p.slug}: ${p.hashtags.join(' ')}`);
    for (const t of p.hashtags) assert.ok(!pools.denylist.map(lower).includes(lower(t)), `${t} is denylisted`);
  }
});

test('never adds a topic tag of its own', () => {
  for (const p of run(sequence())) {
    const topic = pools.topic[p.type].map(lower);
    const topics = p.hashtags.filter((t) => topic.includes(lower(t)));
    assert.deepEqual(topics, [TOPICS[p.type]], `${p.slug}: ${p.hashtags.join(' ')}`);
  }
});

test('neighbors share at most two tags and no set repeats within 14 days', () => {
  const posts = run(sequence());
  for (let i = 1; i < posts.length; i++) {
    const shared = posts[i].hashtags.filter((t) => posts[i - 1].hashtags.includes(t));
    assert.ok(shared.length <= 2, `${posts[i].slug} shares ${shared.join(' ')}`);
    for (let j = 0; j < i; j++) {
      if (daysBetween(posts[j].date, posts[i].date) >= 14) continue;
      assert.notEqual([...posts[i].hashtags].sort().join(' '), [...posts[j].hashtags].sort().join(' '), `${posts[i].slug} repeats ${posts[j].slug}`);
    }
  }
});

test('industry tags only from the industries a post fits', () => {
  for (const p of run(sequence(20, ['franchise', 'restaurant', 'coffee']))) {
    for (const t of p.hashtags) assert.notEqual(groupOf.get(lower(t)), 'salon', `${p.slug}: ${t}`);
  }
});

test('keeps hints and is deterministic', () => {
  const a = run(sequence(10).map((p, k) => (k === 3 ? { ...p, hashtagHints: ['#multiunitfranchisee'] } : p)));
  const b = run(sequence(10).map((p, k) => (k === 3 ? { ...p, hashtagHints: ['#multiunitfranchisee'] } : p)));
  assert.ok(a[3].hashtags.includes('#multiunitfranchisee'));
  assert.deepEqual(a.map((p) => p.hashtags), b.map((p) => p.hashtags));
});

test('refuses a post with no topic tag', () => {
  const { pick } = createPicker(brand);
  assert.throws(() => pick({ date: '2026-12-01', type: 'tip', slug: 'x', hashtags: [] }, []), /topic tag/);
});

test('the first line names the industries in the order it names them', () => {
  assert.deepEqual(namedIndustries('Restaurant group dashboard for multi-unit franchise owners: find the store.'), ['restaurant', 'franchise']);
  assert.deepEqual(namedIndustries('Net sales vs gross for restaurant, coffee shop and salon owners.'), ['restaurant', 'coffee', 'salon']);
  assert.deepEqual(namedIndustries('A tip for multi-store owners: one bank account per LLC.'), []);
  assert.deepEqual(namedIndustries('Labor for quick-service and cafe owners.'), ['restaurant', 'coffee']);
});

test('industry tags follow the first line (franchise always allowed)', () => {
  const all = ['franchise', 'restaurant', 'coffee', 'salon'];
  const first = 'Multi-store dashboard for franchise and restaurant owners: every store side by side.';
  assert.equal(industryRule(first, all, ['franchise', 'restaurant']), null);
  assert.match(industryRule(first, all, ['coffee', 'salon']), /two of the industries/);
  assert.match(industryRule(first, all, ['franchise', 'restaurant', 'salon']), /salon industry tags/);
  // Names only franchise owners: a franchise tag, the second industry from any group
  assert.equal(industryRule('Month-end close for multi-store franchise owners: a checklist.', all, ['franchise', 'salon']), null);
  assert.match(industryRule('Month-end close for multi-store franchise owners: a checklist.', all, ['coffee', 'salon']), /a franchise tag/);
  // Names restaurant, coffee and salon: two of them, plus franchise if wanted
  assert.equal(industryRule('Tips are not sales for restaurant, coffee shop and salon owners.', all, ['franchise', 'coffee', 'salon']), null);
  assert.match(industryRule('Tips are not sales for restaurant, coffee shop and salon owners.', all, ['franchise', 'coffee']), /two of the industries/);
  // Names no industry: free
  assert.equal(industryRule('A tip for multi-store owners: one bank account per LLC.', all, ['coffee', 'salon']), null);
  // An industry the post is not for does not count as named
  assert.equal(industryRule('Food cost for restaurant and salon owners.', ['franchise', 'restaurant', 'coffee'], ['restaurant', 'franchise']), null);
});

test('never a tag and its plural in one set', () => {
  assert.deepEqual(pluralPair(['#restaurantowner', '#Restaurantowners', '#laborcost']), ['#restaurantowner', '#restaurantowners']);
  assert.equal(pluralPair(['#salonowner', '#salonbusiness']), null);
  const { composes } = createPicker(brand);
  const p = { date: '2026-12-01', type: 'owner-math', slug: 'x', caption: 'Labor cost for multi-store owners: what it is.' };
  assert.equal(composes(['#laborcost', '#restaurantowner', '#restaurantowners', '#bookkeeping', '#smallbusinessowner'], p), false);
  for (const q of run(sequence())) assert.equal(pluralPair(q.hashtags), null, q.hashtags.join(' '));
});

test('every unpublished post in content/ keeps the first-line rule and has no plural pair', () => {
  const brandAll = Object.keys(pools.industry);
  for (const f of fs.readdirSync(path.join(root, 'content')).filter((x) => /^\d{4}-\d{2}\.json$/.test(x))) {
    for (const p of JSON.parse(fs.readFileSync(path.join(root, 'content', f), 'utf8')).posts) {
      const marker = path.join(root, 'published', `${p.date}${p.slot === 'evening' ? '-evening' : ''}.json`);
      if (fs.existsSync(marker)) continue;
      const groups = p.hashtags.map((t) => groupOf.get(lower(t))).filter(Boolean);
      assert.equal(industryRule(p.caption.split('\n')[0], p.audiences ?? brandAll, groups), null, `${p.date} ${p.slug}: ${p.hashtags.join(' ')}`);
      assert.equal(pluralPair(p.hashtags), null, `${p.date} ${p.slug}`);
      assert.ok(!p.hashtags.map(lower).includes('#breakeven'), `${p.slug}: #breakeven is retired`);
    }
  }
});
