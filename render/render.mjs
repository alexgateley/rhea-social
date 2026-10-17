#!/usr/bin/env node
// Renders Owner math Reels from a month of content, one folder per post under posts/:
//
//   npm run render -- --month 2026-11                 # every post of the month
//   npm run render -- --month 2026-11 --only prime-cost
//   npm run render -- --month 2026-11 --keep-frames   # leave the PNG frames in render/tmp/
//
// For each post: Chromium (Playwright) loads render/template.html, window.setPost() fills it, and
// the clock --t is stepped from 0 to the end at 24 fps with one PNG screenshot per frame. ffmpeg
// then encodes the frames to H.264 with a silent AAC track (Instagram wants audio). The folder gets
//
//   posts/<date>-<slug>/reel.mp4      the Reel, 1080×1920
//   posts/<date>-<slug>/cover.jpg     the frame at thumbOffsetMs (the result fully shown)
//   posts/<date>-<slug>/caption.txt   caption lines + brand footer + hashtags
//   posts/<date>-<slug>/meta.json     thumbOffsetMs, duration, frames and the layout report
//
// and posts/index.json maps date → folder for scripts/publish.mjs. Run `npm run verify` first; this
// script refuses content that does not verify.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { timing } from './timing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const month = opt('--month');
const only = opt('--only');
const keepFrames = args.includes('--keep-frames');
if (!month || !/^\d{4}-\d{2}$/.test(month)) { console.error('Usage: node render/render.mjs --month YYYY-MM [--only <slug>] [--keep-frames]'); process.exit(2); }

const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));
const contentFile = path.join(root, 'content', `${month}.json`);
if (!fs.existsSync(contentFile)) { console.error(`No content file ${path.relative(root, contentFile)}`); process.exit(2); }

// Content must verify before it is rendered
const verify = spawnSync(process.execPath, [path.join(root, 'scripts/verify.mjs'), '--month', month], { stdio: 'inherit' });
if (verify.status !== 0) process.exit(verify.status ?? 1);

const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
const posts = content.posts.filter((p) => !only || p.slug === only);
if (posts.length === 0) { console.error(`No post with slug "${only}" in ${month}`); process.exit(2); }

const postsDir = path.join(root, brand.postsDir || 'posts');
const tmpRoot = path.join(root, 'render', 'tmp');
const templateUrl = pathToFileURL(path.join(root, 'render', 'template.html')).href;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';

const folderName = (p) => `${p.date}-${p.slug}`;
const captionText = (p) => `${p.caption.trim()}\n\n${brand.captionFooter}\n\n${p.hashtags.join(' ')}\n`;

function updateIndex(entries) {
  const file = path.join(postsDir, 'index.json');
  const index = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  for (const [date, folder] of entries) index[date] = folder;
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n');
}

async function renderPost(browser, post) {
  const t = timing(post);
  const folder = path.join(postsDir, folderName(post));
  const tmp = path.join(tmpRoot, post.slug);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(folder, { recursive: true });

  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { throw new Error(`template error: ${e.message}`); });
  await page.goto(templateUrl, { waitUntil: 'load' });
  const report = await page.evaluate(({ post, t, brand }) => window.setPost(post, t, brand), { post, t, brand });
  if (report.overflow) {
    await page.close();
    throw new Error(`${post.slug}: the card does not fit the frame (content bottom ${report.contentBottom}px, limit ${report.bottomLimit}px, scale ${report.scale}). Shorten the hook, a step label or the takeaway.`);
  }

  const started = Date.now();
  for (let f = 0; f < t.frames; f++) {
    await page.evaluate((sec) => window.setT(sec), f / t.fps);
    await page.screenshot({ path: path.join(tmp, `frame-${String(f).padStart(5, '0')}.png`), type: 'png' });
  }
  // The cover: the frame where the big number has fully landed
  await page.evaluate((sec) => window.setT(sec), t.thumbOffsetMs / 1000);
  await page.screenshot({ path: path.join(folder, 'cover.jpg'), type: 'jpeg', quality: 90 });
  await page.close();
  const shotSeconds = Math.round((Date.now() - started) / 1000);

  const mp4 = path.join(folder, 'reel.mp4');
  const enc = spawnSync(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-framerate', String(t.fps), '-i', path.join(tmp, 'frame-%05d.png'),
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-crf', '20',
    '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '64k',
    mp4,
  ], { stdio: 'inherit' });
  if (enc.status !== 0) throw new Error(`${post.slug}: ffmpeg failed (${enc.status})`);
  if (!keepFrames) fs.rmSync(tmp, { recursive: true, force: true });

  fs.writeFileSync(path.join(folder, 'caption.txt'), captionText(post));
  fs.writeFileSync(path.join(folder, 'meta.json'), JSON.stringify({
    date: post.date,
    slug: post.slug,
    hook: post.hook,
    result: post.result,
    thumbOffsetMs: t.thumbOffsetMs,
    durationSec: t.duration,
    frames: t.frames,
    fps: t.fps,
    width: 1080,
    height: 1920,
    layout: { resultSize: report.resultSize, scale: report.scale, contentBottom: report.contentBottom, hookLines: report.hookLines },
    renderedAt: new Date().toISOString(),
    chromium: browser.version(),
  }, null, 2) + '\n');

  const size = fs.statSync(mp4).size;
  console.log(`${folderName(post)}: ${t.frames} frames (${t.duration.toFixed(2)} s) in ${shotSeconds} s, reel.mp4 ${(size / 1e6).toFixed(1)} MB, result at ${report.resultSize}px, scale ${report.scale}, bottom ${report.contentBottom}px`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  const done = [];
  for (const post of posts) {
    await renderPost(browser, post);
    done.push([post.date, folderName(post)]);
    updateIndex(done);
  }
  console.log(`Rendered ${done.length} post${done.length === 1 ? '' : 's'}; posts/index.json updated.`);
} finally {
  await browser.close();
}
