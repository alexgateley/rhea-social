// The timeline of one Reel, in seconds, per card type. Shared by the renderer (which drives the
// template's --t from it), verify.mjs (which checks each post's thumbOffsetMs against it) and
// publish.mjs (which reads the offset back from meta.json).
//
// owner-math (unchanged since the first run), and tip, which uses the same clock:
//   0.0      hook, alone and centered
//   3.0      hook moves to the top; term and formula appear (tip: "The tip" and its title)
//   7.0      first worked step (tip: first line); one more every 1.6 s
//   +1.6     the result, very large (tip: the action), holds 4.2 s
//   +4.2     the takeaway, holds 4.2 s
//   +4.2     end card (the mark, "RunonRhea · rheafi.com", the type's end line), 2.2 s
//   Three steps or lines make a 22.4 s Reel, four 24.0 s, five 25.6 s; the cover is taken 0.7 s
//   after the result (or action) lands: 12 500, 14 100 or 15 700 ms.
//
// myth:
//   0.0      "MYTH" and the myth, alone and centered
//   3.1      the myth moves to the top
//   3.5      "FACT" and the fact, very large; the myth is struck through
//   7.5      first "why" line; one more every 1.6 s
//   +1.6     the fact holds 4.2 s more (where owner math lands its result)
//   +4.2     the takeaway, holds 4.2 s; then the end card, 2.2 s
//   Two lines make a 21.3 s Reel, three 22.9 s, four 24.5 s; the cover is at 4 200 ms (the fact
//   fully shown under the struck myth).
//
// feature:
//   0.0      headline, sub and the demo note; the recording's first frame waits in the window
//   1.0      the recording plays (its own length, 12–18 s, from render/features/<id>/frames.json)
//   +0.0     end card, 2.2 s, over the recording's last frame
//   The cover is at the post's thumbOffsetMs (default 4 000): a moment where the key screen shows.
//   Reel time = recording time + 1.0 s.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FPS = 24;
export const HOOK_AT = 0;
export const TERM_AT = 3;
export const STEPS_AT = 7;
export const STEP_GAP = 1.6;
export const RESULT_HOLD = 4.2;
export const TAKEAWAY_HOLD = 4.2;
export const END_HOLD = 2.2;
/** How long the result's fade and scale-in take; the cover frame is taken just after it. */
export const RESULT_SETTLE = 0.7;
/** Myth: when the fact lands, and when the first "why" line follows. */
export const FACT_AT = 3.5;
export const WHY_AT = 7.5;
/** Feature: when the recording starts to play, and the cover offset when a post names none. */
export const RECORDING_AT = 1.0;
export const FEATURE_THUMB_DEFAULT_MS = 4000;

export const TYPES = ['owner-math', 'tip', 'myth', 'feature'];
const here = path.dirname(fileURLToPath(import.meta.url));
export const FEATURES_DIR = path.join(here, 'features');

/** A post with no `type` is a morning owner-math post (the first run's content has no type field). */
export const typeOf = (post) => post.type || 'owner-math';
export const slotOf = (post) => post.slot || 'morning';

/** Whole frames, so 22.4 s is 538 frames = 22.417 s. */
const wholeFrames = (endSec) => {
  const frames = Math.round(endSec * FPS);
  return { frames, duration: Math.round((frames / FPS) * 1000) / 1000 };
};

/** owner-math and tip: n rows (steps or lines), 3 to 5. */
function cardTiming(post, n, what) {
  if (!Number.isInteger(n) || n < 3 || n > 5) throw new Error(`${post.slug}: a ${typeOf(post)} post has 3 to 5 ${what}, not ${n ?? 0}`);
  const stepsAt = Array.from({ length: n }, (_, i) => STEPS_AT + i * STEP_GAP);
  const resultAt = STEPS_AT + n * STEP_GAP;
  const takeawayAt = resultAt + RESULT_HOLD;
  const endAt = takeawayAt + TAKEAWAY_HOLD;
  const { frames, duration } = wholeFrames(endAt + END_HOLD);
  const thumbOffsetMs = Math.round((resultAt + RESULT_SETTLE) * 1000);
  return { type: typeOf(post), hookAt: HOOK_AT, hookMoveAt: TERM_AT - 0.4, termAt: TERM_AT, stepsAt, resultAt, takeawayAt, endAt, frames, duration, thumbOffsetMs, fps: FPS };
}

function mythTiming(post) {
  const n = Array.isArray(post.why) ? post.why.length : 0;
  if (n < 2 || n > 4) throw new Error(`${post.slug}: a myth has 2 to 4 "why" lines, not ${n}`);
  const stepsAt = Array.from({ length: n }, (_, i) => WHY_AT + i * STEP_GAP);
  const holdFrom = WHY_AT + n * STEP_GAP; // the last line + 1.6
  const takeawayAt = holdFrom + RESULT_HOLD;
  const endAt = takeawayAt + TAKEAWAY_HOLD;
  const { frames, duration } = wholeFrames(endAt + END_HOLD);
  const thumbOffsetMs = Math.round((FACT_AT + RESULT_SETTLE) * 1000);
  return { type: 'myth', hookAt: HOOK_AT, hookMoveAt: FACT_AT - 0.4, termAt: null, strikeAt: FACT_AT + 0.2, stepsAt, resultAt: FACT_AT, holdFrom, takeawayAt, endAt, frames, duration, thumbOffsetMs, fps: FPS };
}

/** A recording's frames.json (written by render/record-feature.mjs), or null when it was never recorded. */
export function readRecording(id, dir = FEATURES_DIR) {
  if (typeof id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return null;
  const file = path.join(dir, id, 'frames.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function featureTiming(post, recording) {
  const rec = recording ?? readRecording(post.recording);
  if (!rec) throw new Error(`${post.slug}: recording "${post.recording}" has not been recorded (render/features/${post.recording}/frames.json); run npm run record -- --id ${post.recording}`);
  const recordingSec = rec.frames / (rec.fps || FPS);
  const endAt = RECORDING_AT + recordingSec;
  const { frames, duration } = wholeFrames(endAt + END_HOLD);
  const thumbOffsetMs = Number.isInteger(post.thumbOffsetMs) ? post.thumbOffsetMs : FEATURE_THUMB_DEFAULT_MS;
  // The cover must show the recording, not the waiting first frame or the end card
  const thumbRange = [Math.round(RECORDING_AT * 1000), Math.floor(endAt * 1000)];
  return { type: 'feature', hookAt: HOOK_AT, recordingAt: RECORDING_AT, recordingSec, recordingFrames: rec.frames, endAt, frames, duration, thumbOffsetMs, thumbRange, fps: FPS };
}

/**
 * The timeline for one post. `options.recording` passes a feature's frames.json (otherwise it is
 * read from render/features/<id>/frames.json).
 */
export function timing(post, options = {}) {
  const type = typeOf(post);
  if (type === 'owner-math') return cardTiming(post, post.steps?.length, 'steps');
  if (type === 'tip') return cardTiming(post, post.lines?.length, 'lines');
  if (type === 'myth') return mythTiming(post);
  if (type === 'feature') return featureTiming(post, options.recording);
  throw new Error(`${post.slug}: unknown type "${type}" (${TYPES.join(', ')})`);
}

/** The post fields that draw a card; changing any of them changes the video. */
export const CARD_FIELDS = ['type', 'theme', 'hook', 'term', 'formula', 'steps', 'result', 'takeaway', 'title', 'lines', 'action', 'actionLabel', 'fact', 'why', 'headline', 'sub', 'demoNote', 'cta', 'recording', 'scenes'];

const stable = (v) => {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v;
};

/**
 * SHA-1 of the fields that draw the card, written to meta.json as cardHash. The caption, hashtags,
 * date, slot and thumbOffsetMs are not in it: they change caption.txt or the cover, never the
 * video. A feature's hash also covers its recording (`extra.recording`, the SHA-1 of
 * recording.mp4), so a new recording recomposes the Reel. A post without `type` hashes the same as
 * one with "type": "owner-math", and a missing theme the same as "paper". The template itself is
 * not in the hash: after a template change, re-render with --force.
 */
export function cardHash(post, extra = {}) {
  const fields = { type: typeOf(post), theme: post.theme || 'paper' };
  for (const k of CARD_FIELDS) if (k !== 'type' && k !== 'theme' && post[k] !== undefined) fields[k] = post[k];
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) fields[`_${k}`] = v;
  return crypto.createHash('sha1').update(JSON.stringify(stable(fields))).digest('hex');
}

/** SHA-1 of a file's bytes (a feature's recording.mp4). */
export function fileHash(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}
