#!/usr/bin/env node
// Checks rendered Reels against the specs of the Reels Instagram already accepted (the first run's
// reel.mp4, posted 2026-10-16 and 2026-10-19): H.264 High at level 4.1, 1080×1920, yuv420p, 24 fps,
// an AAC-LC stereo 48 kHz track, the moov atom before the media data (+faststart), the length
// meta.json says, and a cover.jpg of 1080×1920.
//
//   node render/probe.mjs                       # every posts/*/reel.mp4
//   node render/probe.mjs posts/2026-11-01-evening-data-health render/tmp/samples/...   # some folders
//
// render.mjs runs the same check on each Reel it encodes.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SPEC = {
  video: { codec_name: 'h264', profile: 'High', level: 41, width: 1080, height: 1920, pix_fmt: 'yuv420p', r_frame_rate: '24/1' },
  audio: { codec_name: 'aac', profile: 'LC', sample_rate: '48000', channels: 2 },
  cover: { width: 1080, height: 1920 },
};

const ffprobe = () => process.env.FFPROBE || (process.env.FFMPEG ? path.join(path.dirname(process.env.FFMPEG), 'ffprobe') : 'ffprobe');

function probe(file) {
  const r = spawnSync(ffprobe(), ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,level,width,height,pix_fmt,r_frame_rate,sample_rate,channels:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout);
}

/** True when the file's moov atom comes before its mdat (what +faststart does). */
export function moovFirst(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(8);
    for (let pos = 0; pos + 8 <= size;) {
      fs.readSync(fd, head, 0, 8, pos);
      let len = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (len === 1) { const big = Buffer.alloc(8); fs.readSync(fd, big, 0, 8, pos + 8); len = Number(big.readBigUInt64BE(0)); }
      if (len < 8) return false;
      pos += len;
    }
    return false;
  } finally { fs.closeSync(fd); }
}

/** Problems with one post folder's reel.mp4 and cover.jpg (empty when it matches the spec). */
export function checkReel(folder) {
  const problems = [];
  const mp4 = path.join(folder, 'reel.mp4');
  if (!fs.existsSync(mp4)) return ['no reel.mp4'];
  const info = probe(mp4);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  if (!v) problems.push('no video stream');
  else for (const [k, want] of Object.entries(SPEC.video)) if (v[k] !== want) problems.push(`video ${k} is ${v[k]}, want ${want}`);
  if (!a) problems.push('no audio track (Instagram wants one; the renderer adds silence)');
  else for (const [k, want] of Object.entries(SPEC.audio)) if (a[k] !== want) problems.push(`audio ${k} is ${a[k]}, want ${want}`);
  if (!moovFirst(mp4)) problems.push('moov atom after the media data (encode with -movflags +faststart)');
  const duration = Number(info.format?.duration);
  const metaFile = path.join(folder, 'meta.json');
  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (meta.durationSec && Math.abs(duration - meta.durationSec) > 0.1) problems.push(`plays ${duration.toFixed(2)} s; meta.json says ${meta.durationSec} s`);
    if (meta.thumbOffsetMs != null && (meta.thumbOffsetMs < 0 || meta.thumbOffsetMs / 1000 > duration)) problems.push(`thumbOffsetMs ${meta.thumbOffsetMs} is outside the Reel`);
  }
  if (duration < 3 || duration > 90) problems.push(`plays ${duration.toFixed(2)} s (Reels by API: 3 s to 15 min; ours are 15–26 s)`);
  const cover = path.join(folder, 'cover.jpg');
  if (!fs.existsSync(cover)) problems.push('no cover.jpg');
  else {
    const c = probe(cover).streams[0];
    if (c.width !== SPEC.cover.width || c.height !== SPEC.cover.height) problems.push(`cover is ${c.width}×${c.height}, want 1080×1920`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let folders = process.argv.slice(2).map((f) => path.resolve(f));
  if (!folders.length) {
    const posts = path.join(root, 'posts');
    folders = fs.readdirSync(posts).map((f) => path.join(posts, f)).filter((f) => fs.existsSync(path.join(f, 'reel.mp4'))).sort();
  }
  let bad = 0;
  for (const f of folders) {
    const problems = checkReel(f);
    if (problems.length) bad++;
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${path.relative(root, f) || f}${problems.length ? `: ${problems.join('; ')}` : ''}`);
  }
  console.log(bad ? `${bad} of ${folders.length} Reels differ from the spec.` : `All ${folders.length} Reels match the spec of the Reels Instagram accepted.`);
  process.exit(bad ? 1 : 0);
}
