// The hashtag picker (scripts/hashtags.mjs) against brand.json's real pools: every set it picks keeps
// the rules verify.mjs enforces, it never adds a topic tag the writer did not choose, and it is
// deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPicker } from './hashtags.mjs';
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
