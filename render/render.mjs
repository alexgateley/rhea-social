#!/usr/bin/env node
// Renders @RunonRhea Reels from a month of content, one folder per post under posts/:
//
//   npm run render -- --month 2026-11                       # every post of the month's file, both slots
//   npm run render -- --month 2026-11 --slot evening        # one slot
//   npm run render -- --month 2026-11 --type tip            # one type (owner-math, tip, myth, feature)
//   npm run render -- --month 2026-11 --only prime-cost     # one post
//   npm run render -- --month 2026-11 --check               # fit every card to the frame, write nothing
//   npm run render -- --month 2026-11 --force               # re-render what has no marker, even if unchanged
//   npm run render -- --month 2026-11 --no-desktop          # skip the Desktop copy at the end
//   npm run render -- --month 2026-11 --no-verify           # skip verify (a builder's test; no index is written)
//   npm run render -- --month 2026-11 --jobs 2              # two cards at once (each is one heavy job's worth of CPU)
//   npm run render -- --content render/samples.json --out render/tmp/samples   # sample renders, outside posts/
//
// Folders: morning posts/<date>-<slug>/, evening posts/<date>-evening-<slug>/, each with reel.mp4,
// cover.jpg (the frame at thumbOffsetMs), caption.txt and meta.json (slot, type, cardHash,
// thumbOffsetMs, layout). Rules, in render/plan.mjs: a post with a marker in published/ is never
// touched (no flag overrides it); a memorial date gets nothing; a folder whose meta.json cardHash
// equals the content's is not re-rendered, only its caption.txt (and the cover, if thumbOffsetMs
// moved); a folder rendered before cardHash existed adopts the hash when its recorded card fields
// still match. After rendering, both indexes are rebuilt from every content file, the month's
// contact sheet is drawn (render/tmp/contact-sheet-YYYY-MM.jpg) and the Desktop copy runs
// (scripts/desktop-copy.mjs) unless --no-desktop.
//
// owner-math, tip and myth: Chromium (Playwright) loads render/template.html, window.setPost() fills
// it, and the clock --t is stepped at 24 fps with one PNG screenshot per frame; ffmpeg encodes them
// to H.264 with an AAC track: the quiet audio bed from render/audio.mjs (original audio Rhea owns;
// Instagram shows muted Reels to fewer people), or silence when brand.json audioBed.enabled is false.
// feature: the template draws the frame with a transparent window; ffmpeg lays the recording
// (render/features/<id>/recording.mp4, scaled to 600×1300) under it from 1.0 s, holding its first
// frame before and its last frame under the end card. Same codec settings.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { timing, cardHash, fileHash, typeOf, slotOf, readRecording, FEATURES_DIR, TYPES, RECORDING_AT } from './timing.mjs';
import { ROOT, loadBrand, captionText, rebuildIndexes, describe, isMemorialDate } from './lib.mjs';
import { planPost } from './plan.mjs';
import { checkReel } from './probe.mjs';
import { writeBed } from './audio.mjs';

const root = ROOT;
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const flag = (name) => args.includes(name);
const month = opt('--month');
const contentArg = opt('--content');
const outArg = opt('--out');
const onlySlot = opt('--slot');
const onlyType = opt('--type');
const only = opt('--only');
const force = flag('--force');
const check = flag('--check');
const keepFrames = flag('--keep-frames');
const noVerify = flag('--no-verify') || !!contentArg;
const noDesktop = flag('--no-desktop') || !!contentArg;
const noSheet = flag('--no-sheet');
const jobs = Math.max(1, Math.min(3, Number(opt('--jobs') || 1)));
const usage = 'Usage: node render/render.mjs --month YYYY-MM [--slot morning|evening] [--type owner-math|tip|myth|feature] [--only <slug>] [--check] [--force] [--no-desktop] [--no-verify] [--no-sheet] [--keep-frames] [--jobs N]\n       node render/render.mjs --content <file.json> --out <dir> [...]';
if (contentArg ? !outArg : (!month || !/^\d{4}-\d{2}$/.test(month))) { console.error(usage); process.exit(2); }
if (onlySlot && !['morning', 'evening'].includes(onlySlot)) { console.error(`--slot is morning or evening, not ${onlySlot}`); process.exit(2); }
if (onlyType && !TYPES.includes(onlyType)) { console.error(`--type is one of ${TYPES.join(', ')}, not ${onlyType}`); process.exit(2); }

const brand = loadBrand(root);
const contentFile = contentArg ? path.resolve(contentArg) : path.join(root, 'content', `${month}.json`);
if (!fs.existsSync(contentFile)) { console.error(`No content file ${path.relative(root, contentFile)}`); process.exit(2); }

// Content must verify before it is rendered
if (!noVerify && !check) {
  const verify = spawnSync(process.execPath, [path.join(root, 'scripts/verify.mjs'), '--month', month], { stdio: 'inherit' });
  if (verify.status !== 0) process.exit(verify.status ?? 1);
}

const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
const posts = (content.posts ?? []).filter((p) => (!only || p.slug === only) && (!onlySlot || slotOf(p) === onlySlot) && (!onlyType || typeOf(p) === onlyType));
if (posts.length === 0) { console.error(`No post matches in ${path.relative(root, contentFile)}`); process.exit(2); }

const postsDir = outArg ? path.resolve(outArg) : path.join(root, brand.postsDir || 'posts');
const tmpRoot = path.join(root, 'render', 'tmp');
const templateUrl = pathToFileURL(path.join(root, 'render', 'template.html')).href;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';

/** Runs a command without blocking the other pages; rejects with its stderr on failure. */
function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.trim().slice(-800)}`))));
  });
}

const ENCODE = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-crf', '20', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k'];
const SILENCE = ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'];
const bedOn = brand.audioBed?.enabled !== false;
/** The audio input for one Reel: the bed, written for exactly its length, or silence. */
const audioInput = (tmp, seconds) => (bedOn ? ['-i', writeBed(path.join(tmp, 'bed.wav'), seconds, { level: brand.audioBed?.levelDb ?? -28 })] : SILENCE);

/** The cover from the finished Reel at a time (features, and covers whose offset moved). */
async function coverFromReel(mp4, ms, out) {
  await run(ffmpeg, ['-y', '-loglevel', 'error', '-ss', (ms / 1000).toFixed(3), '-i', mp4, '-frames:v', '1', '-q:v', '2', out]);
}

/** Loads the template with one post and returns the page and its layout report. */
async function openCard(browser, post, t, { transparent = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(templateUrl, { waitUntil: 'load' });
  const report = await page.evaluate(({ post, t, brand }) => window.setPost(post, t, brand), { post, t, brand });
  if (errors.length) { await page.close(); throw new Error(`${post.slug}: template error: ${errors.join('; ')}`); }
  return { page, report, transparent };
}

const overflowMessage = (post, r) => (typeOf(post) === 'feature'
  ? `${post.slug}: the headline does not fit above the window (headline ${r.headlineSize}px on ${r.headlineLines} lines, sub ${r.subSize}px on ${r.subLines} lines, bottom ${r.contentBottom}px, limit ${r.bottomLimit}px). Shorten the headline or the sub.`
  : `${post.slug}: the card does not fit the frame (content bottom ${r.contentBottom}px, limit ${r.bottomLimit}px, scale ${r.scale}${r.resultLines ? `, big line ${r.resultSize}px on ${r.resultLines} lines` : ''}). Shorten the hook, a line or the takeaway.`);

async function renderPost(browser, post, plan) {
  const type = typeOf(post);
  const recording = type === 'feature' ? readRecording(post.recording) : null;
  const t = timing(post, { recording });
  const folder = path.join(postsDir, plan.folder);
  const tmp = path.join(tmpRoot, `${slotOf(post)}-${post.slug}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(folder, { recursive: true });

  const { page, report } = await openCard(browser, post, t);
  if (report.overflow) { await page.close(); throw new Error(overflowMessage(post, report)); }

  const started = Date.now();
  const shot = { type: 'png', omitBackground: type === 'feature' };
  for (let f = 0; f < t.frames; f++) {
    await page.evaluate((sec) => window.setT(sec), f / t.fps);
    await page.screenshot({ ...shot, path: path.join(tmp, `frame-${String(f).padStart(5, '0')}.png`) });
  }
  const mp4 = path.join(folder, 'reel.mp4');
  const cover = path.join(folder, 'cover.jpg');
  let recordingInfo;
  if (type !== 'feature') {
    // The cover: the frame where the big number (or line) has fully landed
    await page.evaluate((sec) => window.setT(sec), t.thumbOffsetMs / 1000);
    await page.screenshot({ path: cover, type: 'jpeg', quality: 90 });
    await page.close();
    await run(ffmpeg, [
      '-y', '-loglevel', 'error',
      '-framerate', String(t.fps), '-i', path.join(tmp, 'frame-%05d.png'),
      ...audioInput(tmp, t.duration), '-shortest', ...ENCODE, mp4,
    ]);
  } else {
    await page.close();
    const recFile = path.join(FEATURES_DIR, post.recording, 'recording.mp4');
    if (!fs.existsSync(recFile)) throw new Error(`${post.slug}: ${path.relative(root, recFile)} is missing`);
    recordingInfo = { id: post.recording, sha1: fileHash(recFile), frames: recording.frames, fps: recording.fps };
    const win = report.window;
    const hold = (t.duration - t.endAt + 1).toFixed(3); // the last frame under the end card, with a margin
    await run(ffmpeg, [
      '-y', '-loglevel', 'error',
      '-framerate', String(t.fps), '-i', path.join(tmp, 'frame-%05d.png'),
      '-i', recFile,
      ...audioInput(tmp, t.duration),
      '-filter_complex',
      `[1:v]fps=${t.fps},scale=${win.w}:${win.h}:flags=lanczos,setsar=1,`
        + `tpad=start_duration=${RECORDING_AT}:start_mode=clone:stop_duration=${hold}:stop_mode=clone[rec];`
        + `color=c=black:s=1080x1920:r=${t.fps}[base];`
        + `[base][rec]overlay=${win.x}:${win.y}:eof_action=repeat[under];`
        + `[under][0:v]overlay=0:0:format=auto:shortest=1,format=yuv420p[v]`,
      '-map', '[v]', '-map', '2:a', '-frames:v', String(t.frames), '-shortest', ...ENCODE, mp4,
    ]);
    await coverFromReel(mp4, t.thumbOffsetMs, cover);
  }
  if (!keepFrames) fs.rmSync(tmp, { recursive: true, force: true });

  fs.writeFileSync(path.join(folder, 'caption.txt'), captionText(brand, post));
  writeMeta(folder, post, t, {
    cardHash: plan.hash,
    durationSec: t.duration, frames: t.frames, fps: t.fps, width: 1080, height: 1920,
    layout: report,
    ...(recordingInfo ? { recording: recordingInfo } : {}),
    renderedAt: new Date().toISOString(),
    audio: bedOn ? { bed: 'render/audio.mjs', levelDb: brand.audioBed?.levelDb ?? -28 } : { bed: 'silence' },
    chromium: browser.version(),
  });
  // The same specs as the Reels Instagram already accepted (render/probe.mjs)
  const problems = checkReel(folder);
  if (problems.length) throw new Error(`${plan.folder}: the Reel does not match the accepted spec: ${problems.join('; ')}`);
  const size = fs.statSync(mp4).size;
  console.log(`${plan.folder}: ${t.frames} frames (${t.duration.toFixed(2)} s) in ${Math.round((Date.now() - started) / 1000)} s, reel.mp4 ${(size / 1e6).toFixed(1)} MB${type === 'feature' ? `, headline ${report.headlineSize}px` : `, big line ${report.resultSize}px, scale ${report.scale}, gap ${report.gap}, bottom ${report.contentBottom}px`}`);
}

/** meta.json: what the publisher, the Desktop copy and the next render read. Keeps fields it does not set. */
function writeMeta(folder, post, t, fields, { keepCard = false } = {}) {
  const file = path.join(folder, 'meta.json');
  const before = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const type = typeOf(post);
  // keepCard: the video was not re-rendered and differs from the content, so meta.json keeps
  // describing the video (its theme, hook and result) rather than the content
  const card = keepCard ? {}
    : type === 'owner-math' ? { theme: post.theme || 'paper', hook: post.hook, result: post.result }
      : type === 'tip' ? { theme: post.theme || 'paper', hook: post.hook, title: post.title, action: post.action }
        : type === 'myth' ? { theme: post.theme || 'paper', hook: post.hook, fact: post.fact }
          : { theme: post.theme || 'paper', headline: post.headline, recording: post.recording };
  const meta = {
    ...before,
    date: post.date,
    slot: slotOf(post),
    type: keepCard ? (before.type || 'owner-math') : type,
    slug: post.slug,
    ...card,
    thumbOffsetMs: t.thumbOffsetMs,
    captionFirstLine: post.caption.trim().split('\n')[0],
    hashtags: post.hashtags ?? [],
    ...fields,
  };
  fs.writeFileSync(file, JSON.stringify(meta, null, 2) + '\n');
}

/** captions / adopt / legacy-differs: the video stays; caption.txt, meta.json and maybe the cover change. */
async function refreshPost(post, plan) {
  const folder = path.join(postsDir, plan.folder);
  if (plan.renameFrom) {
    fs.renameSync(path.join(postsDir, plan.renameFrom), folder);
    console.log(`${plan.renameFrom} → ${plan.folder}`);
  }
  const t = timing(post);
  const metaFile = path.join(folder, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const notes = [];
  const caption = captionText(brand, post);
  const captionFile = path.join(folder, 'caption.txt');
  if (!fs.existsSync(captionFile) || fs.readFileSync(captionFile, 'utf8') !== caption) { fs.writeFileSync(captionFile, caption); notes.push('caption rewritten'); }
  if (meta.thumbOffsetMs !== t.thumbOffsetMs && plan.action !== 'legacy-differs') {
    await coverFromReel(path.join(folder, 'reel.mp4'), t.thumbOffsetMs, path.join(folder, 'cover.jpg'));
    notes.push(`cover moved to ${t.thumbOffsetMs} ms`);
  }
  const fields = plan.action === 'legacy-differs' ? {} : { cardHash: plan.hash };
  if (plan.action === 'adopt') { fields.cardHashAdoptedAt = new Date().toISOString(); notes.push('adopted cardHash (rendered before it existed; card fields match)'); }
  const keepCard = plan.action === 'legacy-differs';
  writeMeta(folder, post, t, { ...fields, ...(keepCard ? { thumbOffsetMs: meta.thumbOffsetMs } : {}) }, { keepCard });
  if (plan.action === 'legacy-differs') notes.push(`video kept although ${plan.reasons.join(', ')}; --force re-renders it`);
  console.log(`${plan.folder}: video unchanged${notes.length ? `; ${notes.join('; ')}` : ''}`);
}

/** --check: every card's fit, nothing written. A feature without a recording is laid out on a 15 s stand-in. */
async function checkPosts(browser) {
  let bad = 0;
  for (const post of posts) {
    if (isMemorialDate(brand, post.date)) { console.log(`${describe(brand, post)}: memorial date, no regular post`); continue; }
    let t;
    try { t = timing(post); } catch (e) {
      if (typeOf(post) !== 'feature') { console.log(`${describe(brand, post)}: ${e.message}`); bad++; continue; }
      t = timing(post, { recording: { frames: 360, fps: 24 } });
      console.log(`${describe(brand, post)}: (no recording yet; laid out on a 15 s stand-in)`);
    }
    try {
      const { page, report } = await openCard(browser, post, t);
      await page.close();
      const ok = !report.overflow;
      if (!ok) bad++;
      const thumbOk = typeOf(post) !== 'feature' || (t.thumbOffsetMs >= t.thumbRange[0] && t.thumbOffsetMs < t.thumbRange[1]);
      if (!thumbOk) bad++;
      console.log(`${ok && thumbOk ? 'ok  ' : 'FAIL'} ${describe(brand, post)}: ${t.duration.toFixed(1)} s, cover ${t.thumbOffsetMs} ms${thumbOk ? '' : ` (outside the recording, ${t.thumbRange.join('–')} ms)`}, ${typeOf(post) === 'feature'
        ? `headline ${report.headlineSize}px × ${report.headlineLines}, sub ${report.subSize}px × ${report.subLines}, top ${report.headTop}, bottom ${report.contentBottom}/${report.bottomLimit}`
        : `big line ${report.resultSize}px${report.resultLines ? ` × ${report.resultLines}` : ''}, scale ${report.scale}, gap ${report.gap}, bottom ${report.contentBottom}/${report.bottomLimit}, right ${report.rightEdge}, hook top ${report.hookTop}`}${ok ? '' : `\n     ${overflowMessage(post, report)}`}`);
    } catch (e) { bad++; console.log(`FAIL ${describe(brand, post)}: ${e.message}`); }
  }
  return bad;
}

let browser;
const getBrowser = async () => (browser ??= await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined }));
let failed = 0;
try {
  if (check) {
    failed = await checkPosts(await getBrowser());
    console.log(failed ? `\n${failed} problem(s).` : `\nEvery card fits (${posts.length} checked).`);
  } else {
    const work = [];
    for (const post of posts) {
      let hash, t;
      try {
        const type = typeOf(post);
        const recFile = type === 'feature' ? path.join(FEATURES_DIR, post.recording ?? '', 'recording.mp4') : null;
        hash = cardHash(post, type === 'feature' && fs.existsSync(recFile) ? { recording: fileHash(recFile) } : {});
        t = timing(post);
      } catch (e) { console.error(`${describe(brand, post)}: ${e.message}`); failed++; continue; }
      const plan = { ...planPost({ post, brand, root, postsDir, hash, timing: t, force, checkMarkers: !contentArg }), hash };
      if (plan.action === 'memorial') { console.log(`${describe(brand, post)}: ${plan.reasons[0]}; nothing rendered`); continue; }
      if (plan.action === 'published') { console.log(`${plan.folder}: already published; left as it is.`); continue; }
      if (plan.action === 'error') { console.error(`${describe(brand, post)}: ${plan.reasons[0]}`); failed++; continue; }
      work.push({ post, plan });
    }
    const toRender = work.filter((w) => w.plan.action === 'render');
    for (const w of work.filter((w) => w.plan.action !== 'render')) {
      try { await refreshPost(w.post, w.plan); } catch (e) { console.error(`${w.plan.folder}: ${e.message}`); failed++; }
    }
    if (toRender.length) {
      const b = await getBrowser();
      const queue = [...toRender];
      const worker = async () => {
        for (let w = queue.shift(); w; w = queue.shift()) {
          try {
            if (w.plan.renameFrom) {
              fs.renameSync(path.join(postsDir, w.plan.renameFrom), path.join(postsDir, w.plan.folder));
              console.log(`${w.plan.renameFrom} → ${w.plan.folder}`);
            }
            await renderPost(b, w.post, w.plan);
          } catch (e) { console.error(e.message); failed++; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(jobs, toRender.length) }, worker));
    }
    console.log(`Rendered ${toRender.length}, refreshed ${work.length - toRender.length}${failed ? `, ${failed} failed` : ''}.`);

    if (!contentArg && !noVerify) {
      const counts = rebuildIndexes(brand, root);
      console.log(`Indexes rebuilt: ${Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(', ')} dates.`);
    } else if (!contentArg) console.log('--no-verify: indexes not written.');

    if (!noSheet) {
      const { makeContactSheet } = await import('./contact-sheet.mjs');
      const sheetMonth = month || posts[0].date.slice(0, 7);
      const file = await makeContactSheet({ month: sheetMonth, browser: await getBrowser(), postsDir, contentFile: contentArg ? contentFile : null, out: contentArg ? path.join(postsDir, `contact-sheet-${sheetMonth}.jpg`) : undefined });
      console.log(`Contact sheet: ${path.relative(root, file)}`);
    }
  }
} finally {
  if (browser) await browser.close();
}

if (!check && !noDesktop) {
  const desktop = path.join(root, 'scripts', 'desktop-copy.mjs');
  if (fs.existsSync(desktop)) {
    const r = spawnSync(process.execPath, [desktop], { stdio: 'inherit' });
    if (r.status !== 0) { console.error('Desktop copy failed (the Reels are rendered; run npm run desktop again).'); failed++; }
  } else console.log('Desktop copy: scripts/desktop-copy.mjs not found; skipped.');
}
process.exit(failed ? 1 : 0);
