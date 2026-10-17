// Publishes today's Owner math Reel to Instagram (@RunonRhea) through the Instagram API. A copy of
// icubasics-social's publisher with the brand read from brand.json instead of BRAND branches: one
// account per repository, Reels only. Each day has one marker file in published/, so a run posts
// the day once however many times it is kicked.
//
//   node scripts/publish.mjs            # post today's Reel (from 7 AM America/Los_Angeles, weekdays)
//   node scripts/publish.mjs refresh    # refresh the long-lived token, write it to new-token.txt
//   node scripts/publish.mjs check      # verify the token, the account and the publishing quota
//
// Environment:
//   IG_ACCESS_TOKEN   long-lived token from the Meta app dashboard (Instagram API with Instagram Login)
//   IG_USER_ID        the Instagram professional account id shown next to the token
//   PAGES_BASE_URL    where posts/ is served; defaults to pagesBaseUrl in brand.json
//   POST_DATE         optional YYYY-MM-DD to post a specific day now, skipping the time-of-day and
//                     weekday checks
//   DRY_RUN           "true" to log what would be posted without calling the API
//
// brand.json supplies: timezone, postHour, weekdaysOnly, pagesBaseUrl, postsDir, publishedDir.
// posts/index.json maps each date to its folder; the folder holds reel.mp4, caption.txt and
// meta.json (thumbOffsetMs: the frame with the big number, used as the cover).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));

const TZ = brand.timezone;
const POST_HOUR = brand.postHour;
const WEEKDAYS_ONLY = brand.weekdaysOnly === true;
const GRAPH = 'https://graph.instagram.com';

const token = process.env.IG_ACCESS_TOKEN;
const userId = process.env.IG_USER_ID;
const base = (process.env.PAGES_BASE_URL || brand.pagesBaseUrl || '').replace(/\/$/, '');
const forcedDate = process.env.POST_DATE || '';
const dryRun = process.env.DRY_RUN === 'true';
const postsDir = path.join(root, brand.postsDir || 'posts');
const publishedDir = path.join(root, brand.publishedDir || 'published');
const postsUrlDir = brand.postsDir || 'posts';

const fail = (msg) => { console.error(`ERROR: ${msg}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(endpoint, params = {}, method = 'POST') {
  const url = new URL(`${GRAPH}/${endpoint}`);
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === 'GET'
    ? await fetch(`${url}?${body}`)
    : await fetch(url, { method, body });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`${endpoint}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

const localParts = (date = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hour12: false, weekday: 'short' })
      .formatToParts(date).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, weekday: parts.weekday };
};

async function refreshToken() {
  if (!token) fail('IG_ACCESS_TOKEN is not set');
  const res = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
  const json = await res.json();
  if (!res.ok || json.error) {
    // Tokens under 24 hours old can't be refreshed yet; that's fine
    console.log(`Token not refreshed: ${JSON.stringify(json.error ?? json)}`);
    return;
  }
  fs.writeFileSync(path.join(root, 'new-token.txt'), json.access_token);
  console.log(`Token refreshed; valid for ${Math.round(json.expires_in / 86400)} more days`);
}

// Read-only: proves the token, the user id and the content-publishing permission all work
async function checkAccess() {
  if (!token || !userId) fail('IG_ACCESS_TOKEN and IG_USER_ID must be set');
  const me = await api('me', { fields: 'user_id,username' }, 'GET');
  const limit = await api(`${userId}/content_publishing_limit`, { fields: 'quota_usage,config' }, 'GET');
  const q = limit.data?.[0] ?? {};
  console.log(`Token OK for @${me.username} (${me.user_id}); posts used in the last 24 h: ${q.quota_usage ?? '?'} of ${q.config?.quota_total ?? '?'}`);
  if (me.username && me.username.toLowerCase() !== brand.handle.toLowerCase()) {
    console.log(`::warning::The token belongs to @${me.username}, but brand.json says @${brand.handle}`);
  }
}

function writeMarker(marker, data) {
  fs.mkdirSync(publishedDir, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify({ ...data, postedAt: new Date().toISOString() }, null, 2) + '\n');
}

async function assertReachable(url) {
  const head = await fetch(url, { method: 'HEAD' });
  if (!head.ok) throw new Error(`Not reachable (${head.status}): ${url}. Has GitHub Pages finished deploying?`);
}

/** Waits until Instagram has processed a media container. */
async function waitForContainer(creationId, attempts, delayMs) {
  for (let i = 0; i < attempts; i++) {
    const { status_code: status } = await api(creationId, { fields: 'status_code' }, 'GET');
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Instagram reported ${status} while processing the upload`);
    await sleep(delayMs);
  }
  throw new Error('Instagram did not finish processing the upload in time');
}

async function publishToday() {
  const now = localParts();
  const date = forcedDate || now.date;
  // GitHub schedules often fire hours late, so post any time from POST_HOUR onward; the marker in
  // published/ keeps a day from posting twice. POST_DATE skips both checks.
  if (!forcedDate && !dryRun && now.hour < POST_HOUR) {
    console.log(`It is ${now.hour}:00 in ${TZ}; posting happens from ${POST_HOUR}:00. Nothing to do.`);
    return;
  }
  if (!forcedDate && WEEKDAYS_ONLY && (now.weekday === 'Sat' || now.weekday === 'Sun')) {
    console.log(`${date} is a ${now.weekday} in ${TZ}; Owner math posts on weekdays. Nothing to do.`);
    return;
  }
  const index = JSON.parse(fs.readFileSync(path.join(postsDir, 'index.json'), 'utf8'));
  const folder = index[date];
  if (!folder) {
    console.log(`No post prepared for ${date}. Draft content/${date.slice(0, 7)}.json, then npm run verify and npm run render.`);
    return;
  }
  const marker = path.join(publishedDir, `${date}.json`);
  if (fs.existsSync(marker)) {
    console.log(`${date} was already posted (${path.relative(root, marker)}).`);
    return;
  }
  if (!dryRun && (!token || !userId || !base)) fail('IG_ACCESS_TOKEN, IG_USER_ID and PAGES_BASE_URL (or pagesBaseUrl in brand.json) must all be set');
  const dir = path.join(postsDir, folder);
  if (!fs.existsSync(path.join(dir, 'reel.mp4'))) fail(`${folder}/reel.mp4 is missing; run npm run render`);
  const caption = fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8').trim();
  const meta = fs.existsSync(path.join(dir, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) : {};
  const thumbOffsetMs = Number.isInteger(meta.thumbOffsetMs) ? meta.thumbOffsetMs : 0;
  const video_url = `${base}/${postsUrlDir}/${folder}/reel.mp4`;

  console.log(`Posting @${brand.handle} ${date} Reel (${folder}), cover at ${thumbOffsetMs} ms\n  ${video_url}`);
  if (dryRun) { console.log('DRY RUN: not calling the API.'); return; }

  await assertReachable(video_url);
  const { id: creationId } = await api(`${userId}/media`, {
    media_type: 'REELS',
    video_url,
    caption,
    share_to_feed: 'true',
    thumb_offset: String(thumbOffsetMs),
  });
  // Video is transcoded before it can be published, which takes longer than images
  await waitForContainer(creationId, 60, 5000);
  const { id: mediaId } = await api(`${userId}/media_publish`, { creation_id: creationId });
  writeMarker(marker, { date, folder, mediaId, kind: 'reel', thumbOffsetMs });
  console.log(`Published Reel: media id ${mediaId}`);
}

const mode = process.argv[2] ?? 'post';
(mode === 'refresh' ? refreshToken() : mode === 'check' ? checkAccess() : publishToday()).catch((e) => fail(e.message));
