// The publisher against a temporary repository folder, a fake fetch and a fixed clock: the right post
// per date and slot, never twice, the time windows in Pacific time (daylight saving included),
// memorial days (the carousel once at 7 AM, nothing else that day, nothing when none is prepared),
// dry runs (no calls), the by-hand marker and the hashtag limit. Nothing here reaches the network.
//
//   npm test
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BY_HAND_WORKFLOW, checkMarkBranch, createPublisher, limitHashtags, localParts, markerName } from './lib/publisher.mjs';

const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realBrand = JSON.parse(fs.readFileSync(path.join(realRoot, 'brand.json'), 'utf8'));
const BASE = 'https://pages.example.test/rhea-social';
const CAPTION = (title) => `${title} for restaurant and franchise owners: test caption first line.\nLine two.\n\nRhea footer.\n\n#RunonRhea #franchiseowner #restaurantowner #laborcost #smallbusinessowner`;
const MEMORIAL_CAPTION = 'In memory: a test caption.\n\nSecond paragraph.\n';

const roots = [];
after(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

/** A temporary repo with the real brand.json, posts for the given (date, slot) pairs and a memorial. */
function makeRepo({ posts = [], memorial = ['2026-10-25'], markers = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rhea-publish-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'brand.json'), JSON.stringify(realBrand, null, 2));
  fs.mkdirSync(path.join(root, 'posts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'published'), { recursive: true });
  const indexes = { morning: {}, evening: {} };
  for (const p of posts) {
    const slug = p.slug || `${p.slot}-post`;
    const folder = p.slot === 'evening' ? `${p.date}-evening-${slug}` : `${p.date}-${slug}`;
    const dir = path.join(root, 'posts', folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'reel.mp4'), 'not really a video');
    fs.writeFileSync(path.join(dir, 'caption.txt'), (p.caption ?? CAPTION(`${p.date} ${p.slot}`)) + '\n');
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
      date: p.metaDate ?? p.date, slug, slot: p.metaSlot ?? p.slot, type: p.type ?? (p.slot === 'morning' ? 'owner-math' : 'feature'), thumbOffsetMs: 14100,
    }));
    indexes[p.slot][p.date] = folder;
  }
  fs.writeFileSync(path.join(root, 'posts', 'index.json'), JSON.stringify(indexes.morning, null, 2));
  fs.writeFileSync(path.join(root, 'posts', 'index-evening.json'), JSON.stringify(indexes.evening, null, 2));
  const memIndex = {};
  for (const date of memorial) {
    const dir = path.join(root, 'posts', 'memorial', date);
    fs.mkdirSync(dir, { recursive: true });
    const slides = [1, 2, 3, 4, 5].map((n) => `slide-${n}.jpg`);
    for (const s of slides) fs.writeFileSync(path.join(dir, s), `jpeg ${s}`);
    fs.writeFileSync(path.join(dir, 'caption.txt'), MEMORIAL_CAPTION);
    memIndex[date] = { folder: date, slides, caption: 'caption.txt' };
  }
  fs.mkdirSync(path.join(root, 'posts', 'memorial'), { recursive: true });
  fs.writeFileSync(path.join(root, 'posts', 'memorial', 'index.json'), JSON.stringify(memIndex, null, 2));
  for (const [date, slot] of markers) {
    fs.writeFileSync(path.join(root, 'published', markerName(realBrand, date, slot)), JSON.stringify({ date, slot, mediaId: 'earlier' }));
  }
  return root;
}

/** A fake Instagram + Pages: records every call; `failHead` makes HEAD fail for URLs containing it. */
function fakeFetch({ failHead } = {}) {
  const calls = [];
  let n = 0;
  const reply = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const u = new URL(url);
    const params = Object.fromEntries(method === 'GET' ? u.searchParams : new URLSearchParams(init.body || ''));
    const hasToken = params.access_token === 'test-token';
    delete params.access_token;
    calls.push({ method, url: method === 'GET' ? `${u.origin}${u.pathname}` : url, params, hasToken });
    if (method === 'HEAD') return failHead && url.includes(failHead) ? reply({}, false, 404) : reply({});
    if (method === 'GET' && params.fields === 'status_code') return reply({ status_code: 'FINISHED' });
    if (u.pathname.endsWith('/media_publish')) return reply({ id: `media-${++n}` });
    if (u.pathname.endsWith('/media')) return reply({ id: `container-${++n}` });
    return reply({ error: { message: `unexpected ${method} ${u.pathname}` } }, false, 400);
  };
  return { fetch, calls };
}

const failingFetch = () => { throw new Error('fetch must not be called'); };

function run(root, { at, env = {}, fetch } = {}) {
  const logs = [];
  const fake = fetch ? { fetch, calls: null } : fakeFetch();
  const publisher = createPublisher({
    root,
    fetch: fake.fetch,
    now: () => new Date(at),
    env: { IG_ACCESS_TOKEN: 'test-token', IG_USER_ID: '1789', PAGES_BASE_URL: BASE, ...env },
    log: (m) => logs.push(String(m)),
    warn: (m) => logs.push(String(m)),
    sleep: async () => {},
  });
  return publisher.publish().then((result) => ({ result, calls: fake.calls, logs: logs.join('\n') }));
}

const marker = (root, date, slot) => path.join(root, 'published', markerName(realBrand, date, slot));
const readMarker = (root, date, slot) => JSON.parse(fs.readFileSync(marker(root, date, slot), 'utf8'));
const reelCalls = (calls) => calls.filter((c) => c.params.media_type === 'REELS');

test('Pacific wall clock: summer, winter and both daylight-saving change days', () => {
  assert.deepEqual(localParts(new Date('2026-10-21T14:07:00Z'), 'America/Los_Angeles').hour, 7);
  assert.equal(localParts(new Date('2026-10-22T01:07:00Z'), 'America/Los_Angeles').date, '2026-10-21');
  assert.equal(localParts(new Date('2026-10-22T01:07:00Z'), 'America/Los_Angeles').hour, 18);
  assert.equal(localParts(new Date('2026-11-01T14:07:00Z'), 'America/Los_Angeles').hour, 6); // PST from 2 AM Nov 1
  assert.equal(localParts(new Date('2026-11-03T02:07:00Z'), 'America/Los_Angeles').date, '2026-11-02');
  assert.equal(localParts(new Date('2027-03-14T14:07:00Z'), 'America/Los_Angeles').hour, 7); // PDT from 2 AM Mar 14
  assert.equal(localParts(new Date('2027-03-13T14:07:00Z'), 'America/Los_Angeles').hour, 6);
});

test('the morning Reel posts once from 7 AM Pacific, with published/<date>.json', async () => {
  const root = makeRepo({ posts: [{ date: '2026-10-21', slot: 'morning', slug: 'sales-per-labor-hour' }, { date: '2026-10-21', slot: 'evening' }] });
  const first = await run(root, { at: '2026-10-21T14:07:00Z' }); // 7:07 AM PDT
  assert.deepEqual(first.result.errors, []);
  assert.deepEqual(first.result.posted.map((p) => p.slot), ['morning']);
  const reels = reelCalls(first.calls);
  assert.equal(reels.length, 1);
  assert.equal(reels[0].params.video_url, `${BASE}/posts/2026-10-21-sales-per-labor-hour/reel.mp4`);
  assert.equal(reels[0].params.share_to_feed, 'true');
  assert.equal(reels[0].params.thumb_offset, '14100');
  assert.equal(reels[0].params.caption, CAPTION('2026-10-21 morning'));
  assert.ok(first.calls.every((c) => c.method === 'HEAD' || c.hasToken));
  assert.equal(first.calls[0].method, 'HEAD'); // the media URL is checked before Instagram is asked
  const m = readMarker(root, '2026-10-21', 'morning');
  assert.equal(m.slot, 'morning');
  assert.equal(m.folder, '2026-10-21-sales-per-labor-hour');
  assert.equal(m.mediaId, first.result.posted[0].mediaId);
  assert.ok(!fs.existsSync(marker(root, '2026-10-21', 'evening')));

  const again = await run(root, { at: '2026-10-21T16:07:00Z' });
  assert.equal(again.calls.length, 0);
  assert.match(again.logs, /already posted/);
});

test('before 7 AM Pacific nothing is called', async () => {
  const root = makeRepo({ posts: [{ date: '2026-10-21', slot: 'morning' }, { date: '2026-10-21', slot: 'evening' }] });
  const { calls, result } = await run(root, { at: '2026-10-21T13:59:00Z' }); // 6:59 AM PDT
  assert.equal(calls.length, 0);
  assert.deepEqual(result.skipped.map((s) => s.reason), ['before-hour', 'before-hour']);
  assert.deepEqual(fs.readdirSync(path.join(root, 'published')), []);
});

test('the evening Reel posts once from 6 PM Pacific with published/<date>-evening.json', async () => {
  const root = makeRepo({
    posts: [{ date: '2026-10-21', slot: 'morning' }, { date: '2026-10-21', slot: 'evening', slug: 'overview-stores' }],
    markers: [['2026-10-21', 'morning']],
  });
  const early = await run(root, { at: '2026-10-22T00:59:00Z' }); // 5:59 PM PDT on the 21st
  assert.equal(early.calls.length, 0);
  const due = await run(root, { at: '2026-10-22T01:07:00Z' }); // 6:07 PM PDT on the 21st
  assert.deepEqual(due.result.posted.map((p) => [p.date, p.slot]), [['2026-10-21', 'evening']]);
  assert.equal(reelCalls(due.calls)[0].params.video_url, `${BASE}/posts/2026-10-21-evening-overview-stores/reel.mp4`);
  assert.equal(readMarker(root, '2026-10-21', 'evening').folder, '2026-10-21-evening-overview-stores');
  assert.equal(readMarker(root, '2026-10-21', 'morning').mediaId, 'earlier'); // the morning marker is untouched
  const again = await run(root, { at: '2026-10-22T03:07:00Z' });
  assert.equal(again.calls.length, 0);
});

test('a 6 PM run also posts a morning Reel that never went out; SLOT limits a run to one slot', async () => {
  const both = makeRepo({ posts: [{ date: '2026-10-21', slot: 'morning' }, { date: '2026-10-21', slot: 'evening' }] });
  const auto = await run(both, { at: '2026-10-22T01:07:00Z', env: { SLOT: 'auto' } });
  assert.deepEqual(auto.result.posted.map((p) => p.slot), ['morning', 'evening']);

  const eveningOnly = makeRepo({ posts: [{ date: '2026-10-21', slot: 'morning' }, { date: '2026-10-21', slot: 'evening' }] });
  const e = await run(eveningOnly, { at: '2026-10-22T01:07:00Z', env: { SLOT: 'evening' } });
  assert.deepEqual(e.result.posted.map((p) => p.slot), ['evening']);
  assert.ok(!fs.existsSync(marker(eveningOnly, '2026-10-21', 'morning')));

  const morningOnly = makeRepo({ posts: [{ date: '2026-10-21', slot: 'morning' }, { date: '2026-10-21', slot: 'evening' }] });
  const m = await run(morningOnly, { at: '2026-10-22T01:07:00Z', env: { SLOT: 'morning' } });
  assert.deepEqual(m.result.posted.map((p) => p.slot), ['morning']);
  assert.ok(!fs.existsSync(marker(morningOnly, '2026-10-21', 'evening')));

  await assert.rejects(run(morningOnly, { at: '2026-10-22T01:07:00Z', env: { SLOT: 'noon' } }), /SLOT must be/);
});

test('winter time (PST): the slots open at 7 AM and 6 PM Pacific, not by UTC', async () => {
  const root = makeRepo({ posts: [{ date: '2026-11-02', slot: 'morning' }, { date: '2026-11-02', slot: 'evening' }] });
  assert.equal((await run(root, { at: '2026-11-02T14:07:00Z' })).calls.length, 0); // 6:07 AM PST
  const morning = await run(root, { at: '2026-11-02T15:07:00Z' }); // 7:07 AM PST
  assert.deepEqual(morning.result.posted.map((p) => p.slot), ['morning']);
  assert.equal((await run(root, { at: '2026-11-03T01:07:00Z' })).calls.length, 0); // 5:07 PM PST on the 2nd
  const evening = await run(root, { at: '2026-11-03T02:07:00Z' }); // 6:07 PM PST on the 2nd
  assert.deepEqual(evening.result.posted.map((p) => [p.date, p.slot]), [['2026-11-02', 'evening']]);
});

test('daylight-saving change days: Nov 1, 2026 and Mar 14, 2027', async () => {
  const fall = makeRepo({ posts: [{ date: '2026-11-01', slot: 'morning' }] });
  assert.equal((await run(fall, { at: '2026-11-01T14:07:00Z' })).calls.length, 0); // 6:07 AM PST
  assert.equal((await run(fall, { at: '2026-11-01T15:07:00Z' })).result.posted.length, 1); // 7:07 AM PST
  const spring = makeRepo({ posts: [{ date: '2027-03-14', slot: 'morning' }, { date: '2027-03-13', slot: 'morning' }] });
  assert.equal((await run(spring, { at: '2027-03-13T14:07:00Z' })).calls.length, 0); // 6:07 AM PST
  assert.equal((await run(spring, { at: '2027-03-14T14:07:00Z' })).result.posted[0].date, '2027-03-14'); // 7:07 AM PDT
});

test('POST_DATE (with SLOT) posts that date now, whatever the hour, and only once', async () => {
  const root = makeRepo({ posts: [{ date: '2026-10-20', slot: 'morning', slug: 'loaded-labor' }, { date: '2026-10-21', slot: 'evening' }] });
  const r = await run(root, { at: '2026-10-21T12:00:00Z', env: { POST_DATE: '2026-10-20', SLOT: 'morning' } }); // 5 AM on the 21st
  assert.deepEqual(r.result.posted.map((p) => [p.date, p.slot, p.folder]), [['2026-10-20', 'morning', '2026-10-20-loaded-labor']]);
  const again = await run(root, { at: '2026-10-21T12:00:00Z', env: { POST_DATE: '2026-10-20', SLOT: 'morning' } });
  assert.equal(again.calls.length, 0);
  await assert.rejects(run(root, { at: '2026-10-21T12:00:00Z', env: { POST_DATE: '10/20/2026' } }), /POST_DATE/);
});

test('memorial day: the carousel posts once at 7 AM and nothing else posts that day', async () => {
  // Both indexes name a folder for the memorial date, to prove they are ignored
  const root = makeRepo({ posts: [{ date: '2026-10-25', slot: 'morning' }, { date: '2026-10-25', slot: 'evening' }] });
  const early = await run(root, { at: '2026-10-25T13:30:00Z' }); // 6:30 AM PDT
  assert.equal(early.calls.length, 0);

  const r = await run(root, { at: '2026-10-25T14:07:00Z' }); // 7:07 AM PDT
  assert.deepEqual(r.result.errors, []);
  assert.deepEqual(r.result.posted.map((p) => p.slot), ['memorial']);
  const slides = [1, 2, 3, 4, 5].map((n) => `${BASE}/posts/memorial/2026-10-25/slide-${n}.jpg`);
  assert.deepEqual(r.calls.filter((c) => c.method === 'HEAD').map((c) => c.url), slides);
  const items = r.calls.filter((c) => c.params.is_carousel_item === 'true');
  assert.deepEqual(items.map((c) => c.params.image_url), slides); // in slide order
  assert.ok(items.every((c) => !('caption' in c.params)));
  const carousel = r.calls.filter((c) => c.params.media_type === 'CAROUSEL');
  assert.equal(carousel.length, 1);
  assert.equal(carousel[0].params.children, 'container-1,container-2,container-3,container-4,container-5');
  assert.equal(carousel[0].params.caption, MEMORIAL_CAPTION.trim()); // exactly as written, no hashtags added
  assert.equal(reelCalls(r.calls).length, 0);
  assert.equal(r.calls.filter((c) => c.url.endsWith('/media_publish')).length, 1);
  const m = readMarker(root, '2026-10-25', 'memorial');
  assert.equal(m.kind, 'carousel');
  assert.equal(m.slides, 5);
  assert.deepEqual(fs.readdirSync(path.join(root, 'published')), ['2026-10-25-memorial.json']);

  for (const at of ['2026-10-25T14:30:00Z', '2026-10-25T16:07:00Z', '2026-10-26T01:07:00Z', '2026-10-26T03:07:00Z']) {
    const later = await run(root, { at });
    assert.equal(later.calls.length, 0, `a run at ${at} must call nothing`);
  }
  assert.deepEqual(fs.readdirSync(path.join(root, 'published')), ['2026-10-25-memorial.json']);
});

test('memorial day: the evening slot never posts, and an auto run at 6 PM catches a missed carousel', async () => {
  const root = makeRepo({ posts: [{ date: '2026-10-25', slot: 'evening' }] });
  const evening = await run(root, { at: '2026-10-26T01:07:00Z', env: { SLOT: 'evening' } });
  assert.equal(evening.calls.length, 0);
  assert.deepEqual(fs.readdirSync(path.join(root, 'published')), []);
  const forced = await run(root, { at: '2026-10-26T01:07:00Z', env: { POST_DATE: '2026-10-25', SLOT: 'evening' } });
  assert.equal(forced.calls.length, 0);
  const auto = await run(root, { at: '2026-10-26T01:07:00Z' });
  assert.deepEqual(auto.result.posted.map((p) => p.slot), ['memorial']);
  assert.equal(reelCalls(auto.calls).length, 0);
});

test('memorial day with nothing prepared (2027-04-20, 2027-05-09) posts nothing and says so', async () => {
  assert.ok(realBrand.memorial.dates.includes('2027-04-20') && realBrand.memorial.dates.includes('2027-05-09'));
  for (const date of ['2027-04-20', '2027-05-09']) {
    const root = makeRepo({ posts: [{ date, slot: 'morning' }, { date, slot: 'evening' }], memorial: ['2026-10-25'] });
    for (const at of [`${date}T14:07:00Z`, `${date}T23:59:00Z`]) {
      const r = await run(root, { at, env: { GITHUB_ACTIONS: 'true' } });
      assert.equal(r.calls.length, 0);
      assert.deepEqual(r.result.errors, []);
      assert.match(r.logs, new RegExp(`::notice::Memorial day ${date}: no memorial post prepared`));
    }
    assert.deepEqual(fs.readdirSync(path.join(root, 'published')), []);
  }
});

test('dry run: calls nothing, writes nothing, shows the slides, the caption and the Reels', async () => {
  const root = makeRepo({ posts: [{ date: '2026-10-21', slot: 'morning' }, { date: '2026-10-21', slot: 'evening' }] });
  const env = { DRY_RUN: 'true', IG_ACCESS_TOKEN: '', IG_USER_ID: '' };
  const day = await run(root, { at: '2026-10-21T10:00:00Z', env, fetch: failingFetch }); // 3 AM: dry runs skip the hour
  assert.deepEqual(day.result.errors, []);
  assert.deepEqual(day.result.dryRun.map((d) => d.slot), ['morning', 'evening']);
  const mem = await run(root, { at: '2026-10-21T10:00:00Z', env: { ...env, POST_DATE: '2026-10-25' }, fetch: failingFetch });
  assert.equal(mem.result.dryRun.length, 1);
  assert.equal(mem.result.dryRun[0].slides.length, 5);
  assert.equal(mem.result.dryRun[0].caption, MEMORIAL_CAPTION.trim());
  assert.match(mem.logs, /5\. .*slide-5\.jpg/);
  assert.match(mem.logs, /In memory: a test caption\./);
  assert.deepEqual(fs.readdirSync(path.join(root, 'published')), []);
});

test('without credentials a real run calls nothing and reports the error', async () => {
  const root = makeRepo({ posts: [{ date: '2026-10-21', slot: 'morning' }] });
  const r = await run(root, { at: '2026-10-21T15:00:00Z', env: { IG_ACCESS_TOKEN: '' }, fetch: failingFetch });
  assert.equal(r.result.errors.length, 1);
  assert.match(r.result.errors[0].message, /IG_ACCESS_TOKEN/);
});

test('one slot failing does not stop the other; only the posted slot gets a marker', async () => {
  const root = makeRepo({ posts: [{ date: '2026-10-21', slot: 'morning', slug: 'broken' }, { date: '2026-10-21', slot: 'evening' }] });
  const fake = fakeFetch({ failHead: 'broken' });
  const r = await run(root, { at: '2026-10-22T01:07:00Z', fetch: fake.fetch });
  assert.deepEqual(r.result.errors.map((e) => e.slot), ['morning']);
  assert.deepEqual(r.result.posted.map((p) => p.slot), ['evening']);
  assert.ok(!fs.existsSync(marker(root, '2026-10-21', 'morning')));
  assert.ok(fs.existsSync(marker(root, '2026-10-21', 'evening')));
});

test('an index pointing at another slot\'s or date\'s folder posts nothing', async () => {
  const root = makeRepo({ posts: [{ date: '2026-10-21', slot: 'evening', metaSlot: 'morning' }, { date: '2026-10-22', slot: 'morning', metaDate: '2026-10-23' }] });
  const a = await run(root, { at: '2026-10-22T01:07:00Z', env: { SLOT: 'evening' } });
  assert.equal(a.calls.length, 0);
  assert.match(a.result.errors[0].message, /disagree/);
  const b = await run(root, { at: '2026-10-22T15:07:00Z', env: { SLOT: 'morning' } });
  assert.equal(b.calls.length, 0);
  assert.match(b.result.errors[0].message, /disagree/);
});

test('a caption with more than five hashtags goes out with five', async () => {
  const caption = 'Labor cost for restaurant owners: a test.\n\nFooter.\n\n#RunonRhea #a #b #c #d #e #f';
  assert.equal(limitHashtags(caption, 5).caption, 'Labor cost for restaurant owners: a test.\n\nFooter.\n\n#RunonRhea #a #b #c #d');
  assert.equal(limitHashtags(CAPTION('x'), 5).caption, CAPTION('x'));
  const root = makeRepo({ posts: [{ date: '2026-10-21', slot: 'morning', caption }] });
  const r = await run(root, { at: '2026-10-21T15:00:00Z' });
  assert.equal(reelCalls(r.calls)[0].params.caption, 'Labor cost for restaurant owners: a test.\n\nFooter.\n\n#RunonRhea #a #b #c #d');
  assert.match(r.logs, /more than 5 hashtags/);
});

test('mark: a by-hand marker stops the job, is never overwritten, and only memorial dates take a memorial marker', async () => {
  const root = makeRepo({ posts: [{ date: '2026-10-21', slot: 'evening', slug: 'overview-stores' }] });
  const logs = [];
  const pub = createPublisher({ root, fetch: failingFetch, now: () => new Date('2026-10-21T20:00:00Z'), env: {}, log: (m) => logs.push(m) });
  assert.equal(pub.mark({ date: '2026-10-25', slot: 'memorial', note: 'posted from the phone' }).written, true);
  const m = readMarker(root, '2026-10-25', 'memorial');
  assert.equal(m.mediaId, 'by-hand');
  assert.equal(m.note, 'posted from the phone');
  assert.equal(m.folder, 'posts/memorial/2026-10-25');
  assert.equal(pub.mark({ date: '2026-10-25', slot: 'memorial' }).written, false);
  assert.equal(readMarker(root, '2026-10-25', 'memorial').note, 'posted from the phone');
  assert.throws(() => pub.mark({ date: '2026-10-26', slot: 'memorial' }), /not a memorial date/);
  assert.throws(() => pub.mark({ date: '2026-10-26', slot: 'noon' }), /--slot/);
  assert.throws(() => pub.mark({ slot: 'morning' }), /--date/);
  pub.mark({ date: '2026-10-21', slot: 'evening' });
  assert.equal(readMarker(root, '2026-10-21', 'evening').folder, '2026-10-21-evening-overview-stores');
  assert.match(logs.join('\n'), /git add published\/2026-10-21-evening\.json/);
  assert.match(logs.join('\n'), /&& git push origin main/); // never a bare push: it would go to the current branch

  const job = await run(root, { at: '2026-10-25T15:00:00Z' });
  assert.equal(job.calls.length, 0);
  const evening = await run(root, { at: '2026-10-22T02:00:00Z' });
  assert.equal(evening.calls.length, 0);
});

test('mark on a memorial date records the memorial post whatever slot is named, so the carousel never posts twice', async () => {
  for (const slot of ['morning', 'evening', 'auto', undefined]) {
    const root = makeRepo({ posts: [{ date: '2026-10-25', slot: 'morning' }] });
    const logs = [];
    const pub = createPublisher({ root, fetch: failingFetch, now: () => new Date('2026-10-25T13:00:00Z'), env: {}, log: (m) => logs.push(m) });
    const r = pub.mark({ date: '2026-10-25', slot });
    assert.equal(r.slot, 'memorial');
    assert.deepEqual(fs.readdirSync(path.join(root, 'published')), ['2026-10-25-memorial.json']);
    assert.match(logs.join('\n'), /memorial date/);
    for (const at of ['2026-10-25T14:07:00Z', '2026-10-26T01:07:00Z']) {
      const job = await run(root, { at });
      assert.equal(job.calls.length, 0, `${slot}: a run at ${at} must post nothing`);
    }
  }
  const root = makeRepo();
  const pub = createPublisher({ root, fetch: failingFetch, env: {}, log: () => {} });
  assert.throws(() => pub.mark({ date: '2026-10-26', slot: 'auto' }), /auto works only on a memorial date/);
  // In the workflow (by_hand) the marker is committed by the job itself: no push instructions
  const logs = [];
  createPublisher({ root, fetch: failingFetch, env: { GITHUB_ACTIONS: 'true' }, log: (m) => logs.push(m) }).mark({ date: '2027-04-20' });
  assert.ok(fs.existsSync(marker(root, '2027-04-20', 'memorial')));
  assert.doesNotMatch(logs.join('\n'), /git push/);
});

test('a local mark refuses a clone that is not on main, or is behind origin/main', () => {
  const fake = ({ branch = 'main', fetchOk = true, behind = '0' } = {}) => {
    const calls = [];
    const git = (args) => {
      calls.push(args.join(' '));
      if (args[0] === 'rev-parse') return { status: 0, stdout: `${branch}\n`, stderr: '' };
      if (args[0] === 'fetch') return fetchOk ? { status: 0, stdout: '', stderr: '' } : { status: 128, stdout: '', stderr: 'fatal: unable to access' };
      if (args[0] === 'rev-list') return { status: 0, stdout: `${behind}\n`, stderr: '' };
      return { status: 1, stdout: '', stderr: 'unexpected' };
    };
    return { git, calls };
  };
  // twice-daily (where go-live leaves the clone): refused, with the fix
  const a = checkMarkBranch(fake({ branch: 'twice-daily' }).git);
  assert.equal(a.ok, false);
  assert.match(a.reason, /on "twice-daily", but the job reads main only/);
  assert.equal(a.fix, 'git switch main && git pull --rebase origin main');
  // main behind origin/main (the bot's own marker commits): refused, pull first
  const f = fake({ behind: '2' });
  const b = checkMarkBranch(f.git);
  assert.equal(b.ok, false);
  assert.match(b.reason, /2 commits behind origin\/main/);
  assert.equal(b.fix, 'git pull --rebase origin main');
  assert.deepEqual(f.calls, ['rev-parse --abbrev-ref HEAD', 'fetch --quiet origin main', 'rev-list --count HEAD..origin/main']);
  // no network: refused (the workflow's by_hand input is the way out)
  assert.equal(checkMarkBranch(fake({ fetchOk: false }).git).ok, false);
  // on an up-to-date main: fine
  assert.deepEqual(checkMarkBranch(fake().git), { ok: true });
  assert.equal(BY_HAND_WORKFLOW('2026-10-25'), 'gh workflow run "Post @RunonRhea" --repo alexgateley/rhea-social -f date=2026-10-25 -f by_hand=true');
});

test('the mark command refuses this clone when it is not on main, and points to the workflow', () => {
  const branch = spawnSync('git', ['-C', realRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  if (branch === 'main') return; // only meaningful off main; the fake-git test above covers main
  const r = spawnSync(process.execPath, [path.join(realRoot, 'scripts/publish.mjs'), 'mark', '--date', '2026-10-25', '--slot', 'memorial'], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not writing the marker: this clone is on/);
  assert.match(r.stderr, /-f date=2026-10-25 -f by_hand=true/);
  assert.ok(!fs.existsSync(path.join(realRoot, 'published', '2026-10-25-memorial.json')));
});

test('the live repo keeps its morning markers and indexes valid for the new publisher', () => {
  // published/<date>.json stays the morning marker; posts/index.json stays the morning index
  assert.equal(markerName(realBrand, '2026-10-19', 'morning'), '2026-10-19.json');
  assert.equal(markerName(realBrand, '2026-10-21', 'evening'), '2026-10-21-evening.json');
  assert.equal(markerName(realBrand, '2026-10-25', 'memorial'), '2026-10-25-memorial.json');
  assert.equal(realBrand.slots.morning.index, 'posts/index.json');
  assert.equal(realBrand.slots.morning.hour, 7);
  assert.equal(realBrand.slots.evening.hour, 18);
  assert.equal(realBrand.timezone, 'America/Los_Angeles');
  for (const f of fs.readdirSync(path.join(realRoot, 'published')).filter((f) => f.endsWith('.json'))) {
    const m = JSON.parse(fs.readFileSync(path.join(realRoot, 'published', f), 'utf8'));
    assert.ok(f.startsWith(m.date), `${f} is named after its date`);
  }
  const index = JSON.parse(fs.readFileSync(path.join(realRoot, 'posts', 'index.json'), 'utf8'));
  for (const date of realBrand.memorial.dates) assert.equal(index[date], undefined, `posts/index.json must have nothing on memorial date ${date}`);
});
