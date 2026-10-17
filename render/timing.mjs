// The timeline of one Reel, in seconds, derived only from the number of worked steps. Shared by
// the renderer (which drives the template's --t from it), verify.mjs (which checks each post's
// thumbOffsetMs against it) and publish.mjs (which reads the offset back from meta.json).
//
//   0.0      hook, alone and centered
//   3.0      hook moves to the top; term and formula appear
//   7.0      first worked step; one more every 1.6 s
//   +1.6     the result, very large, holds 4.2 s
//   +4.2     the takeaway, holds 4.2 s
//   +4.2     end card (the mark, "RunonRhea · rheafi.com"), 2.2 s
//
// Three steps make a 22.4 s Reel, four 24.0 s, five 25.6 s.

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

export function timing(post) {
  const n = post.steps.length;
  if (n < 3 || n > 5) throw new Error(`${post.slug}: a post has 3 to 5 steps, not ${n}`);
  const stepsAt = Array.from({ length: n }, (_, i) => STEPS_AT + i * STEP_GAP);
  const resultAt = STEPS_AT + n * STEP_GAP;
  const takeawayAt = resultAt + RESULT_HOLD;
  const endAt = takeawayAt + TAKEAWAY_HOLD;
  const frames = Math.round((endAt + END_HOLD) * FPS);
  const duration = Math.round((frames / FPS) * 1000) / 1000; // whole frames, so 22.4 s is 538 frames = 22.417 s
  const thumbOffsetMs = Math.round((resultAt + RESULT_SETTLE) * 1000);
  return { hookAt: HOOK_AT, termAt: TERM_AT, stepsAt, resultAt, takeawayAt, endAt, frames, duration, thumbOffsetMs, fps: FPS };
}
