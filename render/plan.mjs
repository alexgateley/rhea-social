// What render.mjs does with one post, decided from the files on disk. Pure apart from reading
// posts/ and published/, so render/render.test.mjs can check every rule against a temporary folder.
//
//   memorial         the date is a memorial date: no regular post in either slot (nothing written)
//   published        the slot has a marker in published/: left exactly as it is, whatever the flags
//   captions         reel.mp4 exists and meta.json's cardHash equals the content's: only caption.txt,
//                    meta.json's caption fields and (if thumbOffsetMs moved) the cover are rewritten
//   adopt            reel.mp4 exists, meta.json has no cardHash (rendered before cardHash existed) and
//                    the card fields meta.json records still match: adopt the hash, captions as above
//   legacy-differs   as adopt, but a recorded card field differs: the video is kept and the caption
//                    rewritten; --force re-renders it
//   render           anything else without a marker, or --force
//   error            the slug's folder sits under a date that has a marker (a posted Reel cannot move)
//
// A post whose folder is missing but whose slug has an unposted folder under another date is moved
// there first (`renameFrom`), as relink does: the cards show no date.
import fs from 'node:fs';
import path from 'node:path';
import { typeOf, slotOf } from './timing.mjs';
import { folderName, slugOfFolder, dateOfFolder, markerFile, isMemorialDate } from './lib.mjs';

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/** The legacy (pre-cardHash) owner-math fields meta.json recorded, compared with the content. */
export function legacyDifferences(meta, post, t) {
  const diffs = [];
  if (typeOf(post) !== 'owner-math') diffs.push(`type is now ${typeOf(post)}`);
  if (meta.slug !== post.slug) diffs.push(`slug ${meta.slug} → ${post.slug}`);
  if ((meta.theme || 'paper') !== (post.theme || 'paper')) diffs.push(`theme ${meta.theme || 'paper'} → ${post.theme || 'paper'}`);
  if (meta.hook !== post.hook) diffs.push('hook changed');
  if (meta.result?.label !== post.result?.label || meta.result?.value !== post.result?.value) diffs.push('result changed');
  if (t && meta.thumbOffsetMs !== t.thumbOffsetMs) diffs.push(`step count changed (cover ${meta.thumbOffsetMs} → ${t.thumbOffsetMs} ms)`);
  return diffs;
}

/**
 * @param {object} o
 * @param {object} o.post      the content post
 * @param {object} o.brand     brand.json
 * @param {string} o.root      repo root (for published/)
 * @param {string} o.postsDir  where folders live (posts/, or a sample folder)
 * @param {string} o.hash      cardHash of the post as it is now
 * @param {object} [o.timing]  the post's timing (for the legacy check)
 * @param {boolean} [o.force]
 * @param {boolean} [o.checkMarkers=true]  false for sample renders outside posts/
 */
export function planPost({ post, brand, root, postsDir, hash, timing, force = false, checkMarkers = true }) {
  const slot = slotOf(post);
  const folder = folderName(post);
  const plan = { action: 'render', folder, slot, type: typeOf(post), reasons: [] };
  if (isMemorialDate(brand, post.date)) return { ...plan, action: 'memorial', reasons: [`${post.date} is a memorial date: no regular post in either slot`] };
  if (checkMarkers && fs.existsSync(markerFile(brand, post.date, slot, root))) return { ...plan, action: 'published', reasons: ['posted (marker in published/)'] };

  let dir = path.join(postsDir, folder);
  if (!fs.existsSync(dir) && fs.existsSync(postsDir)) {
    const other = fs.readdirSync(postsDir).find((f) => f !== folder && slugOfFolder(f, slot) === post.slug && fs.statSync(path.join(postsDir, f)).isDirectory());
    if (other) {
      if (checkMarkers && fs.existsSync(markerFile(brand, dateOfFolder(other), slot, root))) {
        return { ...plan, action: 'error', reasons: [`${other} was posted on ${dateOfFolder(other)}; a posted Reel is never re-dated (give this post a new slug)`] };
      }
      plan.renameFrom = other;
      dir = path.join(postsDir, other);
    }
  }
  const hasReel = fs.existsSync(path.join(dir, 'reel.mp4'));
  const meta = readJson(path.join(dir, 'meta.json'));
  if (force || !hasReel || !meta) return { ...plan, action: 'render', reasons: [force ? '--force' : !hasReel ? 'not rendered yet' : 'no meta.json'] };
  if (meta.cardHash) {
    return meta.cardHash === hash
      ? { ...plan, action: 'captions', reasons: ['card unchanged'] }
      : { ...plan, action: 'render', reasons: ['card changed'] };
  }
  const diffs = legacyDifferences(meta, post, timing);
  return diffs.length
    ? { ...plan, action: 'legacy-differs', reasons: diffs }
    : { ...plan, action: 'adopt', reasons: ['rendered before cardHash; its card matches the content'] };
}
