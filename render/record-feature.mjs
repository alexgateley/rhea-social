#!/usr/bin/env node
// Records one feature of the Rhea app, on demo data, as a phone-sized screen recording that
// render.mjs composes into a feature Reel:
//
//   npm run record -- --id overview-stores            # render/features/overview-stores.json → render/features/overview-stores/
//   npm run record -- --all                           # every render/features/*.json
//   npm run record -- --id deposits --keep-frames     # keep the PNG frames in render/tmp/features/<id>/
//   npm run record -- --id deposits --dry-run         # check the scene file only (no browser)
//   npm run record -- --all --check-view              # play every scene against the app and check every frame's
//                                                     # guards (NEVER_IN_VIEW, emails, banned words), writing nothing
//
// The app must be running locally on demo data (README "Feature Reels: recording and composing";
// FACTS.md "Running the app locally for recording"): FEATURE_APP_URL, default
// http://localhost:3600. Only localhost is accepted: never production, never a visitor's practice
// company.
//
// How it works: Playwright drives Chrome (CHROME_PATH) at a 430×932 CSS px viewport at device scale
// 2 (an 860×1864 frame, the Reel window's aspect). It signs in once ("Look around the demo
// company", the read-only demo viewer, which needs no credentials here; or the demo owner with
// FEATURE_OWNER_EMAIL / FEATURE_OWNER_PASSWORD from the environment, never a file), marks the demo
// tour done and presses Escape, then plays the scenes. Every frame is a screenshot taken at 24 fps of
// a page that is not moving on its own: per frame the script sets the scroll position from the
// move's eased curve, so the result is the same every time and as sharp as the screen. A hold is one
// screenshot repeated. A tap shows a ring on the element for half a second, then clicks it: the next
// scene starts on the page it opens (a cut). Frames go to render/tmp/features/<id>/ and are encoded
// once to render/features/<id>/recording.mp4 (H.264, 24 fps, 860×1864, no audio) with frames.json
// (scene boundaries and times), so composing never needs the app again.
//
// Refused while recording: a path on the blocklist (/admin, /setup/people, /setup/billing,
// /account), a page showing an email address, and a page showing the two-letter word for
// artificial intelligence or naming Claude or Anthropic (posts never say either). And never in
// view in any frame (the page may hold them further down): what a post may not say or show without
// its status, NEVER_IN_VIEW (Pay from Rhea and its Stripe line, test mode; the app's "ten minutes
// instead of an hour", a time-savings figure nothing backs), plus a scene file's own "avoid" list.
//
// Scene file (render/features/<id>.json):
//   { "id": "deposits", "title": "…", "signIn": "viewer",
//     "scenes": [ { "path": "/deposits?range=lastmonth", "note": "…", "settle": 0.8,
//                   "moves": [ { "hold": 1.4 },
//                              { "scroll": { "text": "Bank deposits", "offset": 90 }, "over": 1.8 },
//                              { "scroll": 1200, "over": 2.0 },
//                              { "scrollX": { "text": "Net revenue", "to": 260 }, "over": 1.2 } ],
//                   "tap": { "text": "Exceptions" } } ] }
//   path: navigate there (a scene without one continues on the page the previous tap opened);
//   scroll: CSS px, or an element ({ "text" | "selector", "offset" }) to bring "offset" px below the top;
//   scrollX: scroll the element's nearest sideways-scrolling box to "to" px; tap: { text | selector, role?, nth? };
//   start: a scroll target applied before the scene's first frame (not recorded); escape: false keeps
//   an open tour card (Escape is pressed on every page otherwise, to close it).
//   text matches exactly unless "exact": false; "nth" picks the n-th match (from 0) instead of the first;
//   "avoid": [ "phrase", … ] at the top of the file: text that must never be on screen in any frame.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
export const FEATURES_DIR = path.join(here, 'features');
export const FPS = 24;
export const VIEWPORT = { width: 430, height: 932, deviceScaleFactor: 2 };
export const BLOCKED_PATHS = ['/admin', '/setup/people', '/setup/billing', '/account'];
export const LENGTH = { min: 12, max: 18, hardMin: 10, hardMax: 20 };
const TAP_SEC = 0.5;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const BANNED_TEXT = [/\bAI\b/, /\bClaude\b/, /\bAnthropic\b/];
/** Never on screen in any frame of any recording (October 20, 2026 review): test-mode features and claims nothing backs. */
export const NEVER_IN_VIEW = [/\bPay from Rhea\b/, /\bsent by Stripe\b/, /instead of an hour/i, /\bsaves? you\b/i, /\bminutes instead of\b/i];

export const isBlocked = (p) => BLOCKED_PATHS.some((b) => p === b || p.startsWith(`${b}/`) || p.startsWith(`${b}?`));

/** Seconds a scene takes on screen (moves plus the tap ring). */
export const sceneSeconds = (s) => (s.moves ?? []).reduce((sum, m) => sum + (m.hold ?? m.over ?? 0), 0) + (s.tap ? TAP_SEC : 0);

/** Checks a scene file; returns a list of problems (empty when it is fine) and the total length. */
export function checkSpec(spec, id) {
  const problems = [];
  if (spec.id !== id) problems.push(`"id" is ${spec.id}; the file is ${id}.json`);
  if (!['viewer', 'owner'].includes(spec.signIn ?? 'viewer')) problems.push(`signIn is viewer or owner, not ${spec.signIn}`);
  if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) problems.push('no scenes');
  (spec.scenes ?? []).forEach((s, k) => {
    const where = `scene ${k + 1}`;
    if (k === 0 && !s.path) problems.push(`${where}: the first scene needs a path`);
    if (k > 0 && !s.path && !spec.scenes[k - 1].tap) problems.push(`${where}: no path, and the scene before it does not tap anything`);
    if (s.path && (typeof s.path !== 'string' || !s.path.startsWith('/'))) problems.push(`${where}: path must start with /`);
    if (s.path && isBlocked(s.path.split(/[?#]/)[0])) problems.push(`${where}: ${s.path} is on the blocklist (${BLOCKED_PATHS.join(', ')})`);
    if (!Array.isArray(s.moves) || s.moves.length === 0) problems.push(`${where}: no moves`);
    for (const m of s.moves ?? []) {
      const kinds = ['hold', 'scroll', 'scrollX'].filter((key) => key in m);
      if (kinds.length !== 1) problems.push(`${where}: a move is exactly one of hold, scroll, scrollX`);
      if ('hold' in m && !(m.hold > 0)) problems.push(`${where}: hold must be > 0 seconds`);
      if (('scroll' in m || 'scrollX' in m) && !(m.over > 0)) problems.push(`${where}: a scroll needs "over" seconds`);
    }
    if (s.tap && !s.tap.text && !s.tap.selector) problems.push(`${where}: tap needs text or selector`);
  });
  if (spec.avoid !== undefined && (!Array.isArray(spec.avoid) || spec.avoid.some((a) => typeof a !== 'string' || !a.trim()))) problems.push('"avoid" is a list of phrases');
  const total = (spec.scenes ?? []).reduce((sum, s) => sum + sceneSeconds(s), 0);
  if (total < LENGTH.hardMin || total > LENGTH.hardMax) problems.push(`${total.toFixed(1)} s long; a recording is ${LENGTH.min}–${LENGTH.max} s`);
  return { problems, total };
}

const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/** Launches Chrome, signs in once and returns the session every recording in this run shares. */
export async function openSession() {
  const appUrl = new URL(process.env.FEATURE_APP_URL || 'http://localhost:3600');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(appUrl.hostname)) throw new Error(`FEATURE_APP_URL must be the local app (localhost), not ${appUrl.hostname}`);
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'America/Chicago',
  });
  // The demo tour: marked done before any page loads (src/components/tour/tour-state.ts TOUR_STORAGE_KEY)
  await context.addInitScript(() => {
    try {
      const done = { step: 0, done: true, startedAt: new Date().toISOString() };
      localStorage.setItem('rhea.tour.v1', JSON.stringify({ tracks: { maple: done, practice: done } }));
    } catch { /* storage blocked: Escape below closes the card */ }
  });
  return { appUrl, browser, context, signedInAs: null };
}

/** Signs the session in once (the demo's "Look around" button allows 10 entries an hour per client). */
async function signIn(session, as) {
  if (session.signedInAs === as) return;
  if (session.signedInAs) throw new Error(`this run is signed in as the ${session.signedInAs}; record ${as} recordings in another run`);
  const page = await session.context.newPage();
  await page.goto(new URL('/sign-in', session.appUrl).href, { waitUntil: 'networkidle' });
  if (as === 'viewer') {
    const button = page.getByRole('button', { name: /Look around the demo company/i });
    if (await button.count()) await button.click();
    else if (process.env.FEATURE_VIEWER_EMAIL && process.env.FEATURE_VIEWER_PASSWORD) {
      await page.getByLabel(/email/i).first().fill(process.env.FEATURE_VIEWER_EMAIL);
      await page.getByLabel(/password/i).first().fill(process.env.FEATURE_VIEWER_PASSWORD);
      await page.getByRole('button', { name: /^sign in$/i }).click();
    } else throw new Error('no "Look around the demo company" button: start the app with RHEA_ENV=demo and DEMO_VIEWER_EMAIL/DEMO_VIEWER_PASSWORD (README), or set FEATURE_VIEWER_EMAIL/FEATURE_VIEWER_PASSWORD');
  } else {
    if (!process.env.FEATURE_OWNER_EMAIL || !process.env.FEATURE_OWNER_PASSWORD) throw new Error('signIn "owner" needs FEATURE_OWNER_EMAIL and FEATURE_OWNER_PASSWORD in the environment');
    await page.getByLabel(/email/i).first().fill(process.env.FEATURE_OWNER_EMAIL);
    await page.getByLabel(/password/i).first().fill(process.env.FEATURE_OWNER_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
  }
  try {
    await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 20000 });
  } catch {
    const message = await page.locator('[role="alert"], .text-red-ink, form p').allInnerTexts().catch(() => []);
    throw new Error(`could not sign in as the demo ${as}${message.length ? `: ${message.join(' ').slice(0, 200)}` : ''} (the demo button allows 10 entries an hour; restart the app to reset it)`);
  }
  await page.close();
  session.signedInAs = as;
}

export async function record(session, id, { keepFrames = false, checkOnly = false } = {}) {
  const specFile = path.join(FEATURES_DIR, `${id}.json`);
  if (!fs.existsSync(specFile)) throw new Error(`no scene file render/features/${id}.json`);
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  const { problems, total } = checkSpec(spec, id);
  if (problems.length) throw new Error(`${id}: ${problems.join('; ')}`);
  if (total < LENGTH.min || total > LENGTH.max) console.warn(`${id}: ${total.toFixed(1)} s (aim for ${LENGTH.min}–${LENGTH.max} s)`);
  await signIn(session, spec.signIn ?? 'viewer');
  const { appUrl, browser } = session;

  const framesDir = path.join(root, 'render', 'tmp', 'features', checkOnly ? `${id}-check` : id);
  fs.rmSync(framesDir, { recursive: true, force: true });
  if (!checkOnly) fs.mkdirSync(framesDir, { recursive: true });
  const page = await session.context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const settle = async (seconds = 0.6, { escape = true } = {}) => {
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; } * { caret-color: transparent !important; } *:focus, *:focus-visible { outline: none !important; } ::-webkit-scrollbar { display: none !important; } nextjs-portal { display: none !important; }' });
    // Escape closes the demo tour's card; a scene that shows the tour says "escape": false
    if (escape) await page.keyboard.press('Escape');
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.waitForTimeout(Math.round(seconds * 1000));
  };
  const guard = async () => {
    const url = new URL(page.url());
    if (url.host !== appUrl.host) throw new Error(`left the local app (${url.host})`);
    if (url.pathname.startsWith('/sign-in')) throw new Error(`signed out: landed on ${url.pathname}`);
    if (isBlocked(url.pathname)) throw new Error(`${url.pathname} is on the blocklist`);
    const text = await page.evaluate(() => document.body.innerText);
    const email = text.match(EMAIL);
    if (email) throw new Error(`${url.pathname} shows an email address; pick another screen`);
    for (const re of BANNED_TEXT) if (re.test(text)) throw new Error(`${url.pathname} shows "${text.match(re)[0]}"; posts never say it, pick another screen`);
  };

  // Text that must never be on screen: checked on every screenshot, by where it is drawn
  const avoid = [...NEVER_IN_VIEW, ...(spec.avoid ?? []).map((a) => new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))]
    .map((re) => ({ source: re.source, flags: re.flags }));
  const inView = () => page.evaluate((patterns) => {
    const res = patterns.map((p) => new RegExp(p.source, p.flags));
    const vh = window.innerHeight, vw = window.innerWidth;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent;
      if (!res.some((re) => re.test(text))) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw) return text.trim().slice(0, 90);
    }
    return null;
  }, avoid);

  let frame = 0;
  const shot = async () => {
    const seen = await inView();
    if (seen) throw new Error(`frame ${frame}: "${seen}" is on screen; it must never be (NEVER_IN_VIEW or the scene file's "avoid"); stop the scene before it or scroll less`);
    const file = path.join(framesDir, `frame-${String(frame).padStart(5, '0')}.png`);
    if (!checkOnly) await page.screenshot({ path: file, type: 'png', animations: 'disabled', caret: 'hide', scale: 'device' });
    frame++;
    return file;
  };
  const repeat = (file, n) => {
    for (let i = 0; i < n; i++) { if (!checkOnly) fs.copyFileSync(file, path.join(framesDir, `frame-${String(frame).padStart(5, '0')}.png`)); frame++; }
  };
  const locate = (target) => {
    const all = target.selector ? page.locator(target.selector) : target.role ? page.getByRole(target.role, { name: target.text, exact: target.exact ?? false }) : page.getByText(target.text, { exact: target.exact ?? true });
    // Only what is drawn: the app keeps desktop-only copies of some cells hidden on a phone
    const loc = all.filter({ visible: true });
    return Number.isInteger(target.nth) ? loc.nth(target.nth) : loc.first();
  };
  const scrollTarget = async (target) => {
    if (typeof target === 'number') return target;
    const loc = locate(target);
    await loc.waitFor({ state: 'attached', timeout: 10000 });
    return loc.evaluate((el, offset) => el.getBoundingClientRect().top + window.scrollY - offset, target.offset ?? 80);
  };
  const clampY = (y) => page.evaluate((v) => Math.max(0, Math.min(v, document.scrollingElement.scrollHeight - window.innerHeight)), y);

  const scenesOut = [];
  for (const [k, scene] of spec.scenes.entries()) {
    if (scene.path) {
      await page.goto(new URL(scene.path, appUrl).href, { waitUntil: 'networkidle' });
    }
    await settle(scene.settle ?? 0.6, { escape: scene.escape !== false });
    await guard();
    // Where the scene starts, before its first frame (not recorded)
    if (scene.start !== undefined) {
      await page.evaluate((v) => window.scrollTo(0, v), await clampY(await scrollTarget(scene.start)));
      await page.waitForTimeout(150);
    }
    const startFrame = frame;
    for (const move of scene.moves) {
      if ('hold' in move) {
        const n = Math.round(move.hold * FPS);
        const file = await shot();
        repeat(file, n - 1);
      } else if ('scroll' in move) {
        const from = await page.evaluate(() => window.scrollY);
        const to = await clampY(await scrollTarget(move.scroll));
        const n = Math.round(move.over * FPS);
        for (let i = 1; i <= n; i++) {
          const y = from + (to - from) * easeInOut(i / n);
          await page.evaluate((v) => window.scrollTo(0, v), y);
          await shot();
        }
      } else if ('scrollX' in move) {
        const loc = locate(move.scrollX);
        const box = await loc.evaluateHandle((el) => {
          for (let e = el; e; e = e.parentElement) {
            const s = getComputedStyle(e);
            if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth) return e;
          }
          return null;
        });
        if (!(await box.evaluate((e) => !!e))) throw new Error(`scene ${k + 1}: nothing scrolls sideways around "${move.scrollX.text || move.scrollX.selector}"`);
        const from = await box.evaluate((e) => e.scrollLeft);
        const to = await box.evaluate((e, v) => Math.max(0, Math.min(v, e.scrollWidth - e.clientWidth)), move.scrollX.to ?? 0);
        const n = Math.round(move.over * FPS);
        for (let i = 1; i <= n; i++) {
          await box.evaluate((e, v) => { e.scrollLeft = v; }, from + (to - from) * easeInOut(i / n));
          await shot();
        }
      }
    }
    if (scene.tap) {
      const loc = locate(scene.tap);
      const bb = await loc.boundingBox();
      if (!bb || bb.y < 0 || bb.y + bb.height > VIEWPORT.height) throw new Error(`scene ${k + 1}: "${scene.tap.text || scene.tap.selector}" is not on screen when tapped; scroll to it first`);
      const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
      const n = Math.round(TAP_SEC * FPS);
      for (let i = 0; i < n; i++) {
        const p = i / (n - 1);
        await page.evaluate(({ cx, cy, p }) => {
          let ring = document.getElementById('rhea-reel-tap');
          if (!ring) {
            ring = document.createElement('div');
            ring.id = 'rhea-reel-tap';
            Object.assign(ring.style, { position: 'fixed', zIndex: 2147483647, width: '54px', height: '54px', borderRadius: '50%', pointerEvents: 'none', background: 'rgba(14,17,22,0.16)', border: '3px solid rgba(14,17,22,0.55)', boxSizing: 'border-box' });
            document.body.append(ring);
          }
          const scale = 0.6 + 0.4 * Math.min(1, p * 1.6);
          ring.style.left = `${cx - 27}px`; ring.style.top = `${cy - 27}px`;
          ring.style.opacity = String(Math.min(1, p * 2.2));
          ring.style.transform = `scale(${scale})`;
        }, { cx, cy, p });
        await shot();
      }
      const before = page.url();
      await loc.evaluate((el) => { el.dataset.reelTapped = '1'; });
      await loc.click();
      await page.waitForURL((u) => u.href !== before, { timeout: 5000 }).catch(() => {});
      // A soft navigation can change the URL before the new page is drawn: wait for the tapped element
      // to leave (it stays when it is part of a shared menu or tabs; then the wait simply ends)
      await page.waitForFunction(() => !document.querySelector('[data-reel-tapped]'), null, { timeout: 3000 }).catch(() => {});
      await page.evaluate(() => {
        document.getElementById('rhea-reel-tap')?.remove();
        document.querySelectorAll('[data-reel-tapped]').forEach((el) => { delete el.dataset.reelTapped; });
      });
    }
    const endFrame = frame;
    scenesOut.push({
      path: scene.path ?? new URL(page.url()).pathname + new URL(page.url()).search,
      note: scene.note ?? '',
      startFrame, endFrame,
      startSec: +(startFrame / FPS).toFixed(3), endSec: +(endFrame / FPS).toFixed(3),
      reelSec: [+(1 + startFrame / FPS).toFixed(3), +(1 + endFrame / FPS).toFixed(3)],
    });
  }
  const chromiumVersion = browser.version();
  await page.close();
  if (errors.length) console.warn(`${id}: the page logged ${errors.length} error(s): ${errors.slice(0, 2).join(' | ').slice(0, 300)}`);
  if (checkOnly) {
    console.log(`${id}: ${frame} frames played, every guard passed (nothing written)`);
    return { id, frames: frame, scenes: scenesOut };
  }

  const outDir = path.join(FEATURES_DIR, id);
  fs.mkdirSync(outDir, { recursive: true });
  const mp4 = path.join(outDir, 'recording.mp4');
  const enc = spawnSync(process.env.FFMPEG || 'ffmpeg', [
    '-y', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', path.join(framesDir, 'frame-%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-an',
    mp4,
  ], { stdio: 'inherit' });
  if (enc.status !== 0) throw new Error(`${id}: ffmpeg failed (${enc.status})`);
  let appCommit = null;
  if (process.env.RHEA_REPO) {
    const git = spawnSync('git', ['-C', process.env.RHEA_REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
    if (git.status === 0) appCommit = git.stdout.trim();
  }
  const meta = {
    id,
    title: spec.title ?? id,
    fps: FPS,
    frames: frame,
    durationSec: +(frame / FPS).toFixed(3),
    width: VIEWPORT.width * VIEWPORT.deviceScaleFactor,
    height: VIEWPORT.height * VIEWPORT.deviceScaleFactor,
    viewport: VIEWPORT,
    signIn: spec.signIn ?? 'viewer',
    scenes: scenesOut,
    note: 'Reel time = recording time + 1.0 s (render/timing.mjs RECORDING_AT). Pick a feature post\'s thumbOffsetMs inside a scene\'s reelSec.',
    recordedAt: new Date().toISOString(),
    app: { url: appUrl.origin, commit: appCommit, data: 'demo seed (npm run seed:demo), sample data only' },
    chromium: chromiumVersion,
  };
  fs.writeFileSync(path.join(outDir, 'frames.json'), JSON.stringify(meta, null, 2) + '\n');
  if (!keepFrames) fs.rmSync(framesDir, { recursive: true, force: true });
  console.log(`${id}: ${frame} frames (${meta.durationSec} s), ${scenesOut.length} scene(s), recording.mp4 ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB`);
  return meta;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const dry = args.includes('--dry-run');
  const listed = args.flatMap((a, i) => (a === '--id' ? String(args[i + 1] ?? '').split(',') : [])).filter(Boolean);
  const ids = all ? fs.readdirSync(FEATURES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : listed;
  if (!ids.length) { console.error('Usage: node render/record-feature.mjs --id <recording> [--keep-frames] [--dry-run] | --all'); process.exit(2); }
  let failed = 0;
  let session = null;
  try {
    for (const one of ids) {
      try {
        if (dry) {
          const spec = JSON.parse(fs.readFileSync(path.join(FEATURES_DIR, `${one}.json`), 'utf8'));
          const { problems, total } = checkSpec(spec, one);
          console.log(`${problems.length ? 'FAIL' : 'ok  '} ${one}: ${total.toFixed(1)} s${problems.length ? `: ${problems.join('; ')}` : ''}`);
          if (problems.length) failed++;
        } else {
          session ??= await openSession();
          await record(session, one, { keepFrames: args.includes('--keep-frames'), checkOnly: args.includes('--check-view') });
        }
      } catch (e) { console.error(`${one}: ${e.message.split('\n')[0]}`); failed++; }
    }
  } finally {
    if (session) await session.browser.close();
  }
  process.exit(failed ? 1 : 0);
}
