// The @RunonRhea publisher's logic, separate from the command (scripts/publish.mjs) so the tests can
// run it against a temporary repository folder with a fake fetch and a fixed clock.
//
// Two slots a day, each with its own index and marker (brand.json `slots`):
//
//   morning  from 7:00 AM Pacific   posts/index.json          published/<date>.json
//   evening  from 6:00 PM Pacific   posts/index-evening.json  published/<date>-evening.json
//
// Every run posts whatever is due and not yet posted on today's date: a slot is due from its hour
// to midnight Pacific, so a 6 PM run also posts a morning Reel the scheduler skipped. A marker for
// the date and slot means "already posted", whatever the run. `SLOT` limits a run to one slot;
// `POST_DATE` posts that date now, whatever the hour.
//
// Memorial days (brand.json `memorial.dates`): the memorial carousel in posts/memorial/<date>/ is
// the only post of the day. It goes out once, in the morning slot (from 7 AM), with its own marker
// published/<date>-memorial.json; neither regular slot posts that day even if an index names a
// folder for it. A memorial date with nothing prepared posts nothing and says so.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const GRAPH = 'https://graph.instagram.com';
export const SLOT_NAMES = ['morning', 'evening'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FOLDER_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;
const SLIDE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.jpe?g$/;
/** Instagram's caption limit (characters). */
export const CAPTION_MAX = 2200;

export function readBrand(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));
}

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

/** The slots from brand.json, or the one 7 AM slot of the first run if a brand has none. */
export function slotsOf(brand) {
  if (brand.slots && typeof brand.slots === 'object') return brand.slots;
  return { morning: { hour: 7, label: '7AM', index: `${brand.postsDir || 'posts'}/index.json`, markerSuffix: '' } };
}

export function memorialOf(brand) {
  const m = brand.memorial || {};
  return {
    dates: Array.isArray(m.dates) ? m.dates : [],
    dir: m.dir || 'posts/memorial',
    slot: m.slot || 'morning',
    markerSuffix: m.markerSuffix ?? '-memorial',
  };
}

/** The marker file name for a date and slot ('morning', 'evening' or 'memorial'). */
export function markerName(brand, date, slot) {
  if (slot === 'memorial') return `${date}${memorialOf(brand).markerSuffix}.json`;
  const s = slotsOf(brand)[slot];
  if (!s) throw new Error(`Unknown slot "${slot}"`);
  return `${date}${s.markerSuffix ?? ''}.json`;
}

/** Date, hour and minute on the wall clock in `timeZone` (daylight saving included). */
export function localParts(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, minute: Number(parts.minute), weekday: parts.weekday };
}

const HASHTAG_RE = /(^|\s)#[\p{L}\p{N}_]+/gu;
export const countHashtags = (text) => (text.match(HASHTAG_RE) || []).length;

/**
 * Keeps a caption within Instagram's hashtag limit: if it has more than `max`, the trailing line of
 * hashtags is cut down so the whole caption has `max` (the same safety net as icubasics-social's
 * publisher). verify.mjs requires exactly five from the pools; this only stops a hand-edited caption
 * from being refused by Instagram.
 */
export function limitHashtags(caption, max) {
  const total = countHashtags(caption);
  if (!max || total <= max) return { caption, removed: [] };
  const lines = caption.split('\n');
  const last = lines[lines.length - 1].trim();
  const tokens = last.split(/\s+/);
  if (!tokens.every((t) => t.startsWith('#'))) return { caption, removed: [], over: total - max };
  const before = total - tokens.length;
  const keep = Math.max(0, max - before);
  lines[lines.length - 1] = tokens.slice(0, keep).join(' ');
  const removed = tokens.slice(keep);
  return { caption: lines.join('\n').trimEnd(), removed, over: Math.max(0, before - max) };
}

/** The one-line way to record a by-hand post from anywhere: the workflow writes the marker on main. */
export const BY_HAND_WORKFLOW = (date) => `gh workflow run "Post @RunonRhea" --repo alexgateley/rhea-social -f date=${date} -f by_hand=true`;

/**
 * A marker counts only on main: the job checks out main and nothing else. Before `mark` writes one in
 * a local clone, the clone must be on main and not behind origin/main (after a fetch); otherwise the
 * marker lands on a branch the job never reads (a bare `git push` from twice-daily pushes there), or
 * the push is refused because the bot's own marker commits are newer. `git(args)` runs git in the
 * clone and returns { status, stdout, stderr } (the tests pass a fake). Resolves to { ok, reason, fix }.
 */
export function checkMarkBranch(git) {
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (head.status !== 0) return { ok: false, reason: `this folder is not a git clone (${String(head.stderr || '').trim()})`, fix: null };
  const branch = head.stdout.trim();
  if (branch !== 'main') {
    return { ok: false, reason: `this clone is on "${branch}", but the job reads main only, so a marker committed here would not stop it`, fix: 'git switch main && git pull --rebase origin main' };
  }
  const fetched = git(['fetch', '--quiet', 'origin', 'main']);
  if (fetched.status !== 0) return { ok: false, reason: `could not fetch origin main (${String(fetched.stderr || '').trim().split('\n')[0]})`, fix: null };
  const behind = Number(git(['rev-list', '--count', 'HEAD..origin/main']).stdout.trim() || 0);
  if (behind > 0) {
    return { ok: false, reason: `main is ${behind} commit${behind === 1 ? '' : 's'} behind origin/main (the job commits a marker after every post), so the push would be refused`, fix: 'git pull --rebase origin main' };
  }
  return { ok: true };
}

/**
 * createPublisher({ root, fetch, now, env, log, warn, sleep }) → { publish, mark, refresh, check }
 *
 * root   the repository folder (brand.json, posts/, published/)
 * fetch  the HTTP client (the tests pass a fake)
 * now    () => Date, the clock
 * env    IG_ACCESS_TOKEN, IG_USER_ID, PAGES_BASE_URL, POST_DATE, SLOT, DRY_RUN, GITHUB_ACTIONS
 */
export function createPublisher({
  root,
  fetch: fetchImpl = globalThis.fetch,
  now = () => new Date(),
  env = process.env,
  log = console.log,
  warn = console.error,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  if (!root) throw new Error('createPublisher needs root');
  const brand = readBrand(root);
  const TZ = brand.timezone || 'America/Los_Angeles';
  const slots = slotsOf(brand);
  const memorial = memorialOf(brand);
  const postsUrlDir = brand.postsDir || 'posts';
  const postsDir = path.join(root, postsUrlDir);
  const publishedDir = path.join(root, brand.publishedDir || 'published');
  const maxTags = brand.hashtagRules?.maxPerPost ?? 5;

  const token = env.IG_ACCESS_TOKEN || '';
  const userId = env.IG_USER_ID || '';
  const base = (env.PAGES_BASE_URL || brand.pagesBaseUrl || '').replace(/\/$/, '');
  const dryRun = env.DRY_RUN === 'true';
  const notice = (msg) => log(env.GITHUB_ACTIONS === 'true' ? `::notice::${msg}` : msg);

  async function api(endpoint, params = {}, method = 'POST') {
    const url = `${GRAPH}/${endpoint}`;
    const body = new URLSearchParams({ ...params, access_token: token });
    const res = method === 'GET' ? await fetchImpl(`${url}?${body}`) : await fetchImpl(url, { method, body });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(`${endpoint}: ${JSON.stringify(json.error ?? json)}`);
    return json;
  }

  async function assertReachable(url) {
    const head = await fetchImpl(url, { method: 'HEAD' });
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

  function writeMarker(file, data) {
    fs.mkdirSync(publishedDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...data, postedAt: now().toISOString() }, null, 2) + '\n');
  }

  const markerPath = (date, slot) => path.join(publishedDir, markerName(brand, date, slot));
  const rel = (p) => path.relative(root, p);

  function requireCredentials() {
    if (!token || !userId || !base) throw new Error('IG_ACCESS_TOKEN, IG_USER_ID and PAGES_BASE_URL (or pagesBaseUrl in brand.json) must all be set');
  }

  function readCaption(file, label) {
    const raw = fs.readFileSync(file, 'utf8').trim();
    const { caption, removed, over } = limitHashtags(raw, maxTags);
    if (removed.length) warn(`WARNING: ${label}: the caption had more than ${maxTags} hashtags; not posting ${removed.join(' ')}`);
    if (over) throw new Error(`${label}: the caption has ${countHashtags(raw)} hashtags outside its last line; Instagram allows ${maxTags}`);
    if (caption.length > CAPTION_MAX) throw new Error(`${label}: the caption is ${caption.length} characters; Instagram allows ${CAPTION_MAX}`);
    return caption;
  }

  const showCaption = (caption) => caption.split('\n').map((l) => `  | ${l}`).join('\n');

  /** The slots a run looks at: SLOT=morning|evening, or both for '' / 'auto'. */
  function requestedSlots() {
    const s = (env.SLOT || 'auto').trim().toLowerCase();
    if (s === '' || s === 'auto' || s === 'both') return Object.keys(slots);
    if (!slots[s]) throw new Error(`SLOT must be auto, ${Object.keys(slots).join(' or ')}; not "${env.SLOT}"`);
    return [s];
  }

  async function postSlot({ date, slot, forced, local, result }) {
    const s = slots[slot];
    const label = `${date} ${slot} (${s.label || `${s.hour}:00`})`;
    if (!forced && !dryRun && local.hour < s.hour) {
      log(`${label}: it is ${local.hour}:${String(local.minute).padStart(2, '0')} in ${TZ}; this slot posts from ${s.hour}:00. Nothing to do yet.`);
      result.skipped.push({ date, slot, reason: 'before-hour' });
      return;
    }
    const index = readJson(path.join(root, s.index), {});
    const folder = index[date];
    if (!folder) {
      log(`${label}: no post prepared (${s.index} has no ${date}).`);
      result.skipped.push({ date, slot, reason: 'no-post' });
      return;
    }
    const marker = markerPath(date, slot);
    if (fs.existsSync(marker)) {
      log(`${label}: already posted (${rel(marker)}).`);
      result.skipped.push({ date, slot, reason: 'posted' });
      return;
    }
    if (!FOLDER_RE.test(folder)) throw new Error(`${label}: ${s.index} names "${folder}", which is not a post folder name`);
    const dir = path.join(postsDir, folder);
    if (!fs.existsSync(path.join(dir, 'reel.mp4'))) throw new Error(`${label}: ${postsUrlDir}/${folder}/reel.mp4 is missing; run npm run render`);
    const meta = readJson(path.join(dir, 'meta.json'), {});
    if (meta.slot && meta.slot !== slot) throw new Error(`${label}: ${folder}/meta.json says slot "${meta.slot}"; the index and the folder disagree`);
    if (meta.date && meta.date !== date) throw new Error(`${label}: ${folder}/meta.json says date ${meta.date}; the index and the folder disagree`);
    const caption = readCaption(path.join(dir, 'caption.txt'), label);
    const thumbOffsetMs = Number.isInteger(meta.thumbOffsetMs) ? meta.thumbOffsetMs : 0;
    const type = meta.type || (slot === 'morning' ? 'owner-math' : undefined);
    if (!dryRun) requireCredentials();
    const video_url = `${base}/${postsUrlDir}/${folder}/reel.mp4`;
    log(`Posting @${brand.handle} ${label} Reel${type ? ` [${type}]` : ''} (${folder}), cover at ${thumbOffsetMs} ms\n  ${video_url}`);
    if (dryRun) {
      log(`Caption (${countHashtags(caption)} hashtags):\n${showCaption(caption)}`);
      log('DRY RUN: not calling the API.');
      result.dryRun.push({ date, slot, folder, video_url, caption, thumbOffsetMs });
      return;
    }

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
    writeMarker(marker, { date, slot, folder, mediaId, kind: 'reel', ...(type ? { type } : {}), thumbOffsetMs });
    log(`Published ${slot} Reel: media id ${mediaId}`);
    result.posted.push({ date, slot, folder, mediaId });
  }

  /** The prepared memorial carousel for a date, or null. */
  function memorialPost(date) {
    const dir = path.join(root, memorial.dir);
    const entry = readJson(path.join(dir, 'index.json'), {})[date];
    if (!entry) return null;
    const folder = entry.folder || date;
    if (!DATE_RE.test(folder)) throw new Error(`Memorial ${date}: index.json names folder "${folder}"; expected the date`);
    const folderDir = path.join(dir, folder);
    if (!fs.existsSync(folderDir)) return null;
    const slides = entry.slides || [];
    if (slides.length < 2 || slides.length > 20) throw new Error(`Memorial ${date}: a carousel needs 2 to 20 slides, not ${slides.length}`);
    for (const s of slides) {
      if (!SLIDE_RE.test(s)) throw new Error(`Memorial ${date}: "${s}" is not a JPEG slide name`);
      if (!fs.existsSync(path.join(folderDir, s))) throw new Error(`Memorial ${date}: ${memorial.dir}/${folder}/${s} is missing`);
    }
    const captionFile = path.join(folderDir, entry.caption || 'caption.txt');
    if (!fs.existsSync(captionFile)) throw new Error(`Memorial ${date}: ${memorial.dir}/${folder}/${entry.caption || 'caption.txt'} is missing`);
    return { folder, folderDir, slides, captionFile, sha256: entry.sha256 || {} };
  }

  async function postMemorial({ date, forced, local, requested, result }) {
    const slotName = memorial.slot;
    const s = slots[slotName];
    const head = `Memorial day ${date}`;
    for (const name of Object.keys(slots)) {
      const folder = readJson(path.join(root, slots[name].index), {})[date];
      if (folder) warn(`WARNING: ${head}: ${slots[name].index} names ${folder} for this date; it is not posted (the memorial post is the only post today).`);
    }
    if (!requested.includes(slotName)) {
      log(`${head}: the memorial post is the only post today and goes out in the ${slotName} slot; nothing posts in the ${requested.join(' or ')} slot.`);
      result.skipped.push({ date, slot: requested.join(','), reason: 'memorial-day' });
      return;
    }
    const marker = markerPath(date, 'memorial');
    if (fs.existsSync(marker)) {
      log(`${head}: the memorial post is already up (${rel(marker)}). Nothing else posts today.`);
      result.skipped.push({ date, slot: 'memorial', reason: 'posted' });
      return;
    }
    if (!forced && !dryRun && local.hour < s.hour) {
      log(`${head}: it is ${local.hour}:${String(local.minute).padStart(2, '0')} in ${TZ}; the memorial post goes out from ${s.hour}:00. Nothing else posts today.`);
      result.skipped.push({ date, slot: 'memorial', reason: 'before-hour' });
      return;
    }
    const post = memorialPost(date);
    if (!post) {
      notice(`${head}: no memorial post prepared (${memorial.dir}/${date}/); nothing posts today.`);
      result.skipped.push({ date, slot: 'memorial', reason: 'no-memorial-post' });
      return;
    }
    // The files are the founder's, copied unchanged; a checksum that differs from the index is
    // reported (the test suite enforces it) but does not stop the post.
    for (const f of [...post.slides, path.basename(post.captionFile)]) {
      const want = post.sha256[f];
      if (!want) continue;
      const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(post.folderDir, f))).digest('hex');
      if (got !== want) warn(`WARNING: ${head}: ${f} differs from the checksum in ${memorial.dir}/index.json`);
    }
    // Posted exactly as written: no hashtags are added, none are cut
    const caption = fs.readFileSync(post.captionFile, 'utf8').trim();
    if (caption.length > CAPTION_MAX) throw new Error(`${head}: the caption is ${caption.length} characters; Instagram allows ${CAPTION_MAX}`);
    if (!dryRun) requireCredentials();
    const urls = post.slides.map((f) => `${base}/${memorial.dir}/${post.folder}/${f}`);
    log(`${head}: posting the memorial carousel (${urls.length} slides) once, in the ${slotName} slot; nothing else posts today.`);
    urls.forEach((u, i) => log(`  ${i + 1}. ${u}`));
    if (dryRun) {
      log(`Caption:\n${showCaption(caption)}`);
      log('DRY RUN: not calling the API.');
      result.dryRun.push({ date, slot: 'memorial', folder: `${memorial.dir}/${post.folder}`, slides: urls, caption });
      return;
    }

    // icubasics-social's carousel flow: every image reachable, one container per slide marked as a
    // carousel item (in order), then the CAROUSEL container with the children and the caption
    for (const u of urls) await assertReachable(u);
    const children = [];
    for (const image_url of urls) {
      const { id } = await api(`${userId}/media`, { image_url, is_carousel_item: 'true' });
      children.push(id);
    }
    const { id: creationId } = await api(`${userId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });
    await waitForContainer(creationId, 20, 3000);
    const { id: mediaId } = await api(`${userId}/media_publish`, { creation_id: creationId });
    writeMarker(marker, { date, slot: 'memorial', folder: `${memorial.dir}/${post.folder}`, mediaId, kind: 'carousel', slides: urls.length });
    log(`Published the memorial carousel: media id ${mediaId}`);
    result.posted.push({ date, slot: 'memorial', folder: `${memorial.dir}/${post.folder}`, mediaId });
  }

  /** Posts whatever is due and not yet posted. Resolves to { date, posted, skipped, dryRun, errors }. */
  async function publish() {
    const forced = (env.POST_DATE || '').trim();
    if (forced && !DATE_RE.test(forced)) throw new Error(`POST_DATE must be YYYY-MM-DD, not "${forced}"`);
    const requested = requestedSlots();
    const local = localParts(now(), TZ);
    const date = forced || local.date;
    const result = { date, posted: [], skipped: [], dryRun: [], errors: [] };
    if (dryRun && !forced) log(`DRY RUN for ${date} (${local.hour}:${String(local.minute).padStart(2, '0')} in ${TZ}): the hour checks are skipped.`);

    if (memorial.dates.includes(date)) {
      try {
        await postMemorial({ date, forced, local, requested, result });
      } catch (e) {
        warn(`ERROR (memorial): ${e.message}`);
        result.errors.push({ slot: 'memorial', message: e.message });
      }
      return result;
    }
    // The slots are independent: one failing must not stop the other, and whatever was posted keeps
    // its marker so the next run only retries what is missing
    for (const slot of requested) {
      try {
        await postSlot({ date, slot, forced, local, result });
      } catch (e) {
        warn(`ERROR (${slot}): ${e.message}`);
        result.errors.push({ slot, message: e.message });
      }
    }
    return result;
  }

  /**
   * Records a post the founder put up by hand, so the job won't post it again:
   *   node scripts/publish.mjs mark --date 2026-10-25 --slot memorial
   * The job reads main only, so the marker counts once it is on main: the workflow's by_hand input
   * writes it there; run locally, scripts/publish.mjs first checks this clone is on an up-to-date main
   * (checkMarkBranch below).
   */
  function mark({ date, slot, note } = {}) {
    if (!date || !DATE_RE.test(date)) throw new Error('mark needs --date YYYY-MM-DD');
    const valid = [...Object.keys(slots), 'memorial'];
    // On a memorial date the memorial post is the only post, and only its marker stops the job: any
    // slot named that day (morning, evening, auto or none) records the memorial post
    if (memorial.dates.includes(date) && slot !== 'memorial') {
      log(`${date} is a memorial date: the memorial post is the only post that day, so this records the memorial post${slot ? ` (not "${slot}")` : ''}.`);
      slot = 'memorial';
    }
    if (!valid.includes(slot)) throw new Error(`mark needs --slot ${valid.join('|')}${slot === 'auto' ? ' (auto works only on a memorial date)' : ''}`);
    if (slot === 'memorial' && !memorial.dates.includes(date)) {
      throw new Error(`${date} is not a memorial date (brand.json memorial.dates: ${memorial.dates.join(', ')})`);
    }
    const file = markerPath(date, slot);
    if (fs.existsSync(file)) {
      log(`${rel(file)} already exists; nothing changed.`);
      return { file, written: false, slot };
    }
    const folder = slot === 'memorial'
      ? `${memorial.dir}/${date}`
      : readJson(path.join(root, slots[slot].index), {})[date];
    writeMarker(file, {
      date, slot, ...(folder ? { folder } : {}), mediaId: 'by-hand',
      kind: slot === 'memorial' ? 'carousel' : 'reel', ...(note ? { note } : {}),
    });
    log(`Wrote ${rel(file)}: the job will not post ${date} ${slot}.`);
    if (env.GITHUB_ACTIONS !== 'true') {
      log(`Commit it and push it to main (the only branch the job reads) before the slot's hour:\n  git add ${rel(file)} && git commit -m "Posted ${date} ${slot} by hand" && git push origin main`);
    }
    return { file, written: true, slot };
  }

  async function refresh() {
    if (!token) throw new Error('IG_ACCESS_TOKEN is not set');
    const res = await fetchImpl(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
    const json = await res.json();
    if (!res.ok || json.error) {
      // Tokens under 24 hours old can't be refreshed yet; that's fine
      log(`Token not refreshed: ${JSON.stringify(json.error ?? json)}`);
      return false;
    }
    fs.writeFileSync(path.join(root, 'new-token.txt'), json.access_token);
    log(`Token refreshed; valid for ${Math.round(json.expires_in / 86400)} more days`);
    return true;
  }

  // Read-only: proves the token, the user id and the content-publishing permission all work
  async function check() {
    if (!token || !userId) throw new Error('IG_ACCESS_TOKEN and IG_USER_ID must be set');
    const me = await api('me', { fields: 'user_id,username' }, 'GET');
    const limit = await api(`${userId}/content_publishing_limit`, { fields: 'quota_usage,config' }, 'GET');
    const q = limit.data?.[0] ?? {};
    log(`Token OK for @${me.username} (${me.user_id}); posts used in the last 24 h: ${q.quota_usage ?? '?'} of ${q.config?.quota_total ?? '?'}`);
    if (me.username && me.username.toLowerCase() !== String(brand.handle).toLowerCase()) {
      log(`::warning::The token belongs to @${me.username}, but brand.json says @${brand.handle}`);
    }
  }

  return { publish, mark, refresh, check, brand };
}
