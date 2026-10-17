# Rhea · Owner math

Rendered Instagram Reels for [@RunonRhea](https://www.instagram.com/RunonRhea), served from GitHub
Pages, and a GitHub Actions job that publishes one Reel every weekday at 7:00 AM Pacific. The first
run is `content/2026-10.json`: Friday 2026-10-16, then every weekday from 2026-10-19 to 2026-11-12.

Each Reel is one piece of **owner math**: a number an owner of a coffee shop, quick-service
franchise or salon should know (labor %, prime cost, break-even per day, what sales tax and tips
are not…), with a worked example, the result very large, and one line on what to do about it.
Every number on a card is arithmetic on the inputs listed with the post; rules of thumb are labeled
as rules of thumb; no industry statistics are invented. Rhea itself is described only as
"automated books, labor and per-store profit for multi-store owners" (rheafi.com).

```
brand.json                         handle, site, colors, time zone, posting hour, caption footer, hashtags
content/2026-10.json               a run of 20 posts (hook, term, formula, inputs, steps, result, takeaway, caption)
scripts/verify.mjs                 recomputes every step and result from the inputs; exits non-zero on a mismatch
render/template.html               the 1080×1920 card; all motion is a function of the CSS variable --t (seconds)
render/render.mjs                  Chromium frames at 24 fps → ffmpeg → posts/<date>-<slug>/
render/relink.mjs                  re-dates rendered folders when the schedule moves (no re-render needed)
posts/<date>-<slug>/reel.mp4       the Reel (H.264, silent AAC track, 22–26 s)
posts/<date>-<slug>/cover.jpg      the frame at thumbOffsetMs, where the big number is fully shown
posts/<date>-<slug>/caption.txt    caption lines + brand footer + hashtags
posts/<date>-<slug>/meta.json      thumbOffsetMs, duration, frames, layout report
posts/index.json                   date → folder
published/<date>.json              written by the job after posting (prevents double posts)
scripts/publish.mjs                the publisher (post, refresh, check)
.github/workflows/post.yml         the daily job
scripts/setup-secrets.sh           stores the Instagram credentials as repo secrets
scripts/kick-post.sh, launchd/     the Mac launch agent that kicks the job on time
```

## How it mirrors icubasics-social

Same shape as the Question of the Day publisher, so the two repos are run the same way:

- `scripts/publish.mjs` is a copy of icubasics-social's publisher with the brand branches removed:
  one account per repository, Reels only. Same flow: read `posts/index.json` for today, HEAD-check
  the media URL on GitHub Pages, create a `REELS` container (`share_to_feed=true`, `thumb_offset`
  from `meta.json`), poll its status, `media_publish`, then write the marker
  `published/<date>.json`. `refresh` and `check` modes are kept. The time zone, posting hour,
  weekdays-only rule and Pages URL come from `brand.json` instead of constants.
- `.github/workflows/post.yml` has the same steps (credentials check, dry-run API check, publish,
  marker commit with a pull-rebase retry, weekly token refresh), on 7 AM Pacific crons in both PDT
  and PST plus a retry, weekdays only, committing as `rhea-social-bot`.
- `scripts/setup-secrets.sh`, `scripts/kick-post.sh` and `launchd/com.rhea.ownermath.plist` are the
  same tools for the same reasons (see "Why posts arrive from a launch agent" below).
- Posts live in the repo, including the rendered media, served by GitHub Pages from `main` (`.nojekyll`).

What is different: the content is written here (`content/YYYY-MM.json`) and rendered here
(`npm run render`), not pushed in from an app repo; and `npm run verify` checks the arithmetic
before anything renders or posts.

## One-time setup

1. **GitHub repo:** create `alexgateley/rhea-social` (public, so Pages can serve the media), add
   it as the remote and push `main`.
2. **GitHub Pages:** repo Settings → Pages → Source "Deploy from a branch", branch `main`,
   folder `/ (root)`. Media is then served at `https://alexgateley.github.io/rhea-social/posts/...`
   (the `pagesBaseUrl` in `brand.json`). Wait for the first Pages deploy before posting.
3. **Instagram account:** switch @RunonRhea to a professional (Business) account in the Instagram
   app: Settings → Account type and tools → Switch to professional account.
4. **Meta app:** in the existing Meta app (developers.facebook.com/apps, the one used for
   icubasics), open Instagram → "API setup with Instagram business login". Under "Generate access
   tokens" click Add account and log in as @RunonRhea, click "Add all required permissions" and also
   add `instagram_business_content_publish`. Generate the token and copy the **Instagram user ID**
   and the **access token** (long-lived, 60 days). The app can stay in development mode: accounts
   with a role on the app need no App Review.
5. **Secrets:** run `sh scripts/setup-secrets.sh`. It prompts for the user ID and the token (the
   token is not echoed), checks the token against the API and stores `IG_USER_ID` and
   `IG_ACCESS_TOKEN` as repo secrets with `gh secret set`. Never paste tokens in chat or commit
   them. Optionally also give it a fine-grained GitHub personal access token for this repo with
   *Secrets: Read and write* (`GH_PAT`), so the job can store the refreshed Instagram token every
   Monday; without it, regenerate the token in the Meta dashboard every 60 days.
6. **Test, then post the first Reel:** Actions → "Post Owner math" → Run workflow with `dry_run`
   checked (it checks the token and logs what would be posted). Then run it again with
   `date` = `2026-10-16` and `dry_run` off: that posts the first Reel right away, whatever the time
   of day (a `date` skips the 7 AM and weekday checks). From the command line:
   `gh workflow run "Post Owner math" --repo alexgateley/rhea-social -f date=2026-10-16 -f dry_run=false`.
   The rest post themselves on their weekdays.
7. **Launch agent (optional but recommended):** edit the script path in
   `launchd/com.rhea.ownermath.plist` (the `/Users/alex/<path-to>/rhea-social` placeholder), then
   `cp launchd/com.rhea.ownermath.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.rhea.ownermath.plist`.
   Test with `launchctl kickstart gui/$(id -u)/com.rhea.ownermath`; the log is
   `~/Library/Logs/rhea-ownermath.log`.

Rendering locally needs Node 22, ffmpeg on the PATH, `npm install` (Playwright and the Inter Tight
font files) and a Chromium that Playwright can find: `npx playwright install chromium`, or set
`CHROME_PATH` to a Chrome or Chromium binary.

## Every month

1. Draft `content/YYYY-MM.json`, named for the month its first post falls in: one post per weekday,
   in date order (the run may continue into the next month, as the first one does). Copy the shape
   of `content/2026-10.json` (hook of at most 9 words, a term, the formula in plain words, the
   inputs with units, 3 to 5 worked steps, the result, a takeaway of at most 18 words, 2 to 4
   caption lines, 6 to 8 hashtags from `brand.json`). `thumbOffsetMs` is 12500 for 3 steps, 14100
   for 4, 15700 for 5 (`render/timing.mjs`). A new topic needs its formula added to `COMPUTE` in
   `scripts/verify.mjs`.
2. `npm run verify` – recomputes every step, result and quoted figure; fix anything it lists.
3. `npm run render -- --month YYYY-MM` – renders every post (about a minute each; add
   `--only <slug>` for one). It refuses content that does not verify and stops if a card would
   overflow the frame.
4. Review `posts/<date>-<slug>/cover.jpg` and a few `reel.mp4`s.
5. Commit and push. The job picks each day up on its date.

If the dates move after rendering (a run starts earlier, a day is skipped), change them in the
content file and run `npm run relink -- --month YYYY-MM`: the cards show no date, so the folders are
renamed and `posts/index.json` rebuilt without re-rendering.

## Commands

| Command | What it does |
| --- | --- |
| `npm run verify` | check every `content/*.json` (`-- --month 2026-10` for one) |
| `npm run render -- --month 2026-10` | render the run's Reels into `posts/` (`--only <slug>`, `--keep-frames`) |
| `npm run relink -- --month 2026-10` | re-date rendered folders and rebuild `posts/index.json` after a schedule change |
| `npm run publish:dry` | log what the publisher would post today without calling the API |
| `POST_DATE=2026-10-16 npm run publish:dry` | the same for a specific date |
| `npm run check` | verify the token, account and publishing quota (needs `IG_USER_ID`, `IG_ACCESS_TOKEN`) |
| `node scripts/publish.mjs refresh` | refresh the long-lived token into `new-token.txt` |
| `gh workflow run "Post Owner math" -f dry_run=true` | run the job from the command line |
| `gh workflow run "Post Owner math" -f date=2026-10-16 -f dry_run=false` | post a specific day now |

## Notes

- The job runs at 14:07, 15:07 and 16:07 UTC on weekdays; the script posts only from 7 AM
  America/Los_Angeles onward, which handles daylight saving time, and never on a weekend unless
  `POST_DATE` is given.
- If a day has no folder in `posts/index.json`, the job logs that and does nothing.
- To skip a day, delete its folder and its line in `index.json` before 7 AM. To re-post a day,
  delete `published/<date>.json` and run the workflow with that date. To post a day early or on
  demand, run the workflow with that `date` (or `POST_DATE=... node scripts/publish.mjs`).
- A Reel plays 22.4 s (3 steps), 24.0 s (4) or 25.6 s (5): hook 0–3 s, term and formula 3–7 s,
  one step every 1.6 s, the result holds 4.2 s, the takeaway 4.2 s, the end card 2.2 s. The cover
  frame is taken 0.7 s after the result lands.

## Why posts arrive from a launch agent on Alex's Mac

GitHub's cron scheduler fires hours late or not at all on a quiet repository, so the schedule in
the workflow is only a backup. The real trigger is a launchd agent on Alex's Mac,
`launchd/com.rhea.ownermath.plist`, which runs `scripts/kick-post.sh` at 7:05 and 9:05 AM Pacific.
The script calls `gh workflow run "Post Owner math" -f dry_run=false`; the workflow posts today's
Reel once (the marker in `published/` prevents duplicates) and only from 7 AM Pacific onward, so
extra kicks are harmless. launchd runs a missed job at the next wake, but a Mac that is shut down or
offline at both times posts only if GitHub's own schedule happens to fire.
