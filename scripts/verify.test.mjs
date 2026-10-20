// scripts/verify.mjs against a temporary copy of the repo: the real content passes, and each kind of
// mistake it exists to catch makes it fail with a message that says what is wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifyScript = path.join(repo, 'scripts', 'verify.mjs');

/** A temporary repo with what verify reads: brand, facts, content, markers, rendered posts' meta. */
function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhea-verify-'));
  for (const f of ['brand.json', 'FACTS.md']) fs.copyFileSync(path.join(repo, f), path.join(dir, f));
  for (const sub of ['content', 'published']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
    for (const f of fs.readdirSync(path.join(repo, sub)).filter((f) => f.endsWith('.json'))) fs.copyFileSync(path.join(repo, sub, f), path.join(dir, sub, f));
  }
  // Rendered posts: meta.json and a stand-in reel, so "already in the rendered video" works as in the repo
  for (const folder of fs.readdirSync(path.join(repo, 'posts'))) {
    const meta = path.join(repo, 'posts', folder, 'meta.json');
    if (!fs.existsSync(meta) || !fs.existsSync(path.join(repo, 'posts', folder, 'reel.mp4'))) continue;
    fs.mkdirSync(path.join(dir, 'posts', folder), { recursive: true });
    fs.copyFileSync(meta, path.join(dir, 'posts', folder, 'meta.json'));
    fs.writeFileSync(path.join(dir, 'posts', folder, 'reel.mp4'), '');
  }
  return dir;
}

function verify(dir) {
  const env = { ...process.env, VERIFY_ROOT: dir };
  delete env.RHEA_REPO;
  const r = spawnSync(process.execPath, [verifyScript], { env, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

/** Changes one post (found by slug in any content file) and returns the temporary root. */
function withPost(slug, change) {
  const dir = makeRoot();
  for (const f of fs.readdirSync(path.join(dir, 'content')).filter((f) => /^\d{4}-\d{2}\.json$/.test(f))) {
    const file = path.join(dir, 'content', f);
    const content = JSON.parse(fs.readFileSync(file, 'utf8'));
    const i = content.posts.findIndex((p) => p.slug === slug);
    if (i < 0) continue;
    const next = change(content.posts[i], content.posts, i);
    if (next === null) content.posts.splice(i, 1); else if (next) content.posts[i] = next;
    fs.writeFileSync(file, JSON.stringify(content, null, 2));
    return dir;
  }
  throw new Error(`no post ${slug}`);
}

function fails(dir, pattern) {
  const r = verify(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.notEqual(r.status, 0, 'verify should fail');
  assert.match(r.out, pattern);
}

test('the content as written passes', () => {
  const dir = makeRoot();
  const r = verify(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /2026-11\.json: \d+ posts verified/);
});

test('a wrong number fails', () => {
  fails(withPost('labor-hours-budget', (p) => { p.steps[1].value = '451 h'; }), /step 2 .* is "451 h", computed "450 h"/);
  fails(withPost('accrued-wages', (p) => { p.result.value = '$13,563'; }), /result is "\$13,563", computed "\$13,564"/);
});

test('a figure nobody computed fails', () => {
  fails(withPost('labor-daily', (p) => { p.caption = p.caption.replace('A daily look', 'A $999 daily look'); }), /quotes \$999, which is not an input/);
  fails(withPost('busy-week-labor', (p) => { p.why[0] = 'Busy weeks add 12% overtime.'; }), /why 1 quotes 12%/);
});

test('more hashtags than the limit fails', () => {
  fails(withPost('one-llc-one-bank', (p) => { p.hashtags = [...p.hashtags, '#restaurantowner']; }), /has 6 hashtags \(exactly 5; Instagram allows up to 5\)/);
});

test('a set reused on neighboring days fails', () => {
  // The day before's evening set, reused the next evening (a feature on 10-30 copying 10-28's)
  const dir = makeRoot();
  const file = path.join(dir, 'content', '2026-10.json');
  const content = JSON.parse(fs.readFileSync(file, 'utf8'));
  const from = content.posts.find((p) => p.slug === 'a-day-in-the-ledger');
  content.posts.find((p) => p.slug === 'card-deposits-matched').hashtags = [...from.hashtags];
  fs.writeFileSync(file, JSON.stringify(content, null, 2));
  fails(dir, /card-deposits-matched: uses the same five hashtags as 2026-10-28 6PM a-day-in-the-ledger, 2 days earlier/);
});

test('a tag outside the pools, a vendor tag or the brand tag fails', () => {
  fails(withPost('one-chart-of-accounts', (p) => { p.hashtags[4] = '#quickbooks'; }), /#quickbooks is on the denylist/);
  fails(withPost('one-chart-of-accounts', (p) => { p.hashtags[4] = '#RunonRhea'; }), /#RunonRhea is retired/);
  fails(withPost('one-chart-of-accounts', (p) => { p.hashtags[4] = '#madeuptag'; }), /#madeuptag is in no pool/);
});

test('an industry tag on a post that is not for that industry fails', () => {
  fails(withPost('delivery-commission', (p) => { p.hashtags[1] = '#salonowner'; }), /#salonowner is a salon tag, but the post is for franchise, restaurant, coffee/);
});

test('the banned word and other banned words fail', () => {
  fails(withPost('labor-daily', (p) => { p.caption += '\nOur AI reads it.'; }), /contains the word "AI"/);
  fails(withPost('store-days', (p) => { p.sub = 'Seamless daily labor for every store'; }), /sub contains "seamless"/);
  fails(withPost('one-group-pnl', (p) => { p.why[0] = 'Restaurant365 shows one P&L.'; }), /a competitor's name/);
  fails(withPost('one-group-pnl', (p) => { p.caption = p.caption.replace('A group P&L', 'Our customers say a group P&L'); }), /"customers"/);
});

test('a claim without evidence, or evidence FACTS.md does not list, fails', () => {
  fails(withPost('overview-stores', (p) => { delete p.claims[0].evidence; }), /claim 1 .* has no evidence/);
  fails(withPost('overview-stores', (p) => { p.claims[0].evidence = 'src/made/up.ts'; }), /evidence "src\/made\/up.ts" is not listed in FACTS.md/);
  fails(withPost('labor-daily', (p) => { p.caption += '\nRhea fixes this.'; }), /names Rhea, so it needs claims with evidence/);
});

test('caption limits fail', () => {
  fails(withPost('labor-daily', (p) => { p.caption = p.caption.replace(/^[^\n]+/, `${'Labor cost percentage, daily, for restaurant owners '.repeat(3)}.`); }), /the first line is \d+ characters \(at most 125/);
  fails(withPost('labor-daily', (p) => { p.keyword = 'prime cost'; }), /does not contain the keyword "prime cost"/);
  fails(withPost('labor-daily', (p) => { p.caption += `\n${'x'.repeat(2100)}`; }), /caption line .* characters|Instagram allows 2200/);
  fails(withPost('labor-daily', (p) => { p.caption += ' #laborcost'; }), /hashtags go in the hashtags list only/);
});

test('status words, pinned pricing and tax-adjacent rules fail when missing', () => {
  fails(withPost('overview-stores', (p) => { p.caption += '\nIt pushes every day to QuickBooks.'; }), /QuickBooks: the push is sandbox only/);
  fails(withPost('guided-demo-tour', (p) => { p.caption = p.caption.replace('7-day free trial', '14-day free trial'); }), /a trial other than the "7-day free trial"/);
  fails(withPost('set-sales-tax-aside', (p) => { p.caption = p.caption.replace(' Rates, due dates and rules: ask your CPA.', ''); p.takeaway = 'Collected tax is a debt from the day it is collected.'; }), /tax-adjacent: the takeaway or caption must say "ask your CPA"/);
});

test('schedule rules fail: memorial dates, missing days, wrong type', () => {
  fails(withPost('net-sales-not-gross', (p) => ({ ...p, date: '2026-10-25' })), /2026-10-25 is a memorial date/);
  fails(withPost('one-llc-one-bank', () => null), /2026-10-22 6PM: no post \(the rotation wants a tip\)/);
  fails(withPost('one-llc-one-bank', (p) => ({ ...p, type: 'myth', fact: 'x', why: ['a', 'b'] })), /the rotation puts a tip in this slot, not a myth/);
});

test('a feature reusing its recording within 14 days fails', () => {
  fails(withPost('which-store-drags', (p) => ({ ...p, date: '2026-10-23', slot: 'evening' })), /used twice|recording overview-stores again/);
});

test('word limits fail', () => {
  fails(withPost('labor-daily', (p) => { p.action = 'Every single morning before opening'; }), /action has 5 words \(max 4\)/);
  fails(withPost('one-group-pnl', (p) => { p.fact = 'Every single store needs its very own P&L.'; }), /fact has 8 words \(max 7\)/);
});
