// Publishes @RunonRhea's Reels to Instagram through the Instagram API (with Instagram Login): two
// slots a day, a 7 AM and a 6 PM Reel (Pacific), and on memorial days only the memorial carousel.
// The logic is in scripts/lib/publisher.mjs (tested by scripts/publish.test.mjs with a fake fetch);
// this file is the command the workflow runs.
//
//   node scripts/publish.mjs            # post whatever is due today and not yet posted
//   node scripts/publish.mjs refresh    # refresh the long-lived token, write it to new-token.txt
//   node scripts/publish.mjs check      # verify the token, the account and the publishing quota
//   node scripts/publish.mjs mark --date 2026-10-25 --slot memorial [--note "posted from the app"]
//                                       # record a post put up by hand, so the job never posts it
//
// A by-hand marker counts only once it is on main (the job reads nothing else). The simplest way is
// the workflow itself, which writes the marker on main from anywhere (the GitHub app works too):
//   gh workflow run "Post @RunonRhea" --repo alexgateley/rhea-social -f date=2026-10-25 -f by_hand=true
// Run locally, `mark` first checks that this clone is on main and up to date with origin/main
// (it fetches), and refuses otherwise; then commit and `git push origin main`.
// `--no-git-check` skips that check (the tests and the workflow do).
//
// Environment:
//   IG_ACCESS_TOKEN   long-lived token from the Meta app dashboard (Instagram API with Instagram Login)
//   IG_USER_ID        the Instagram professional account id shown next to the token
//   PAGES_BASE_URL    where posts/ is served; defaults to pagesBaseUrl in brand.json
//   SLOT              auto (default: both slots), morning (7 AM) or evening (6 PM)
//   POST_DATE         optional YYYY-MM-DD: post that date now, skipping the time-of-day check
//   DRY_RUN           "true" to log what would be posted (the slides, the caption) without calling the API
//
// brand.json supplies the time zone, `slots` (hour, index, marker suffix per slot), `memorial`
// (dates, folder, marker suffix), pagesBaseUrl, postsDir and publishedDir. Each slot's index maps a
// date to a folder under posts/ holding reel.mp4, caption.txt and meta.json (thumbOffsetMs: the
// cover frame). A marker in published/ per date and slot keeps anything from posting twice:
// published/<date>.json (morning), <date>-evening.json, <date>-memorial.json.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BY_HAND_WORKFLOW, checkMarkBranch, createPublisher } from './lib/publisher.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args[0] && !args[0].startsWith('--') ? args[0] : 'post';
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const fail = (msg) => { console.error(`ERROR: ${msg}`); process.exit(1); };

async function main() {
  const publisher = createPublisher({ root });
  if (mode === 'refresh') return void (await publisher.refresh());
  if (mode === 'check') return void (await publisher.check());
  if (mode === 'mark') {
    const date = opt('--date');
    if (process.env.GITHUB_ACTIONS !== 'true' && !args.includes('--no-git-check')) {
      const git = (gitArgs) => {
        const r = spawnSync('git', ['-C', root, ...gitArgs], { encoding: 'utf8' });
        return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr || (r.error ? String(r.error.message) : '') };
      };
      const branch = checkMarkBranch(git);
      if (!branch.ok) {
        fail(`not writing the marker: ${branch.reason}.\n${branch.fix ? `  Fix it with: ${branch.fix}\n  then run this mark command again.\n` : ''}`
          + `  Or record it on GitHub, which writes it on main from anywhere:\n    ${BY_HAND_WORKFLOW(date || 'YYYY-MM-DD')}`);
      }
    }
    return void publisher.mark({ date, slot: opt('--slot'), note: opt('--note') });
  }
  if (mode !== 'post') fail(`Unknown mode "${mode}" (post, refresh, check or mark)`);
  const result = await publisher.publish();
  if (result.errors.length) process.exit(1);
}

main().catch((e) => fail(e.message));
