# Rhea · @RunonRhea

Rendered Instagram Reels for [@RunonRhea](https://www.instagram.com/RunonRhea), served from GitHub
Pages, and a GitHub Actions job that publishes them. The first run, owner math every weekday at
7:00 AM Pacific, is `content/2026-10.json`: Friday 2026-10-16, then every weekday from 2026-10-19
to 2026-11-12.

**October 20, 2026: two Reels a day.** The sections down to "Why posts arrive from a launch agent"
describe the morning owner-math run as first built and still true for it; everything new (the 6 PM
slot, tips, myths, feature Reels of the app, memorial days, the Desktop copy, the hashtag rules) is in
**"Two slots a day"** at the end, and what the posts may say about Rhea is in `FACTS.md`.

Each Reel is one piece of **owner math**: a number an owner of a coffee shop, quick-service
franchise or salon should know (labor %, prime cost, break-even per day, what sales tax and tips
are not…), with a worked example, the result very large, and one line on what to do about it.
Every number on a card is arithmetic on the inputs listed with the post; rules of thumb are labeled
as rules of thumb; no industry statistics are invented. Rhea itself is described only as
"automated books, labor and per-store profit for multi-store owners" (rheafi.com).

```
brand.json                         handle, site, the four card themes, time zone, posting hour, caption footer, hashtag sets
content/2026-10.json               a run of 20 posts (hook, term, formula, inputs, steps, result, takeaway, caption)
scripts/verify.mjs                 recomputes every step and result from the inputs; exits non-zero on a mismatch
scripts/contrast.mjs               WCAG contrast of every theme (verify runs it too)
render/template.html               the 1080×1920 card in one of four themes; all motion is a function of the CSS variable --t (seconds)
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
scripts/kick-post.sh, launchd/     the Mac launch agents (7 AM and 6 PM) that kick the job on time
```

## How it mirrors icubasics-social

Same shape as the Question of the Day publisher, so the two repos are run the same way:

- `scripts/publish.mjs` is a copy of icubasics-social's publisher with the brand branches removed:
  one account per repository, Reels only. Same flow: read `posts/index.json` for today, HEAD-check
  the media URL on GitHub Pages, create a `REELS` container (`share_to_feed=true`, `thumb_offset`
  from `meta.json`), poll its status, `media_publish`, then write the marker
  `published/<date>.json`. `refresh` and `check` modes are kept. The time zone, the slots' hours
  and the Pages URL come from `brand.json` instead of constants. (Since October 20 it posts two
  slots a day and memorial carousels, with icubasics-social's carousel code: "Index, markers and
  the publisher" below.)
- `.github/workflows/post.yml` has the same steps (credentials check, dry-run API check, publish,
  marker commit with a pull-rebase retry, weekly token refresh), on Pacific crons in both PDT and
  PST plus a retry for each slot, every day, committing as `rhea-social-bot`.
- `scripts/setup-secrets.sh`, `scripts/kick-post.sh` and `launchd/com.rhea.morning.plist` and
  `com.rhea.evening.plist` are the same tools for the same reasons (see "Why posts arrive from a
  launch agent" below).
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
6. **Test, then post:** Actions → "Post @RunonRhea" → Run workflow with `dry_run` checked (it
   checks the token and logs what would be posted). A run with a `date` (and a `slot`) and `dry_run`
   off posts that day right away, whatever the time of day. From the command line:
   `gh workflow run "Post @RunonRhea" --repo alexgateley/rhea-social -f date=2026-10-20 -f slot=morning -f dry_run=false`.
   (The first Reel, 2026-10-16, went out this way under the workflow's first name, "Post Owner
   math".) The rest post themselves.
7. **Launch agents (recommended):** after the workflow with the `slot` input is on `main`,
   `cp launchd/com.rhea.morning.plist launchd/com.rhea.evening.plist ~/Library/LaunchAgents/`, then
   `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.rhea.morning.plist` and the same for
   `com.rhea.evening.plist`. Test with `launchctl kickstart gui/$(id -u)/com.rhea.morning`; the log
   is `~/Library/Logs/rhea-runonrhea.log`. (The first run's `com.rhea.ownermath.plist` was never
   installed and is gone.)

Rendering locally needs Node 22, ffmpeg on the PATH, `npm install` (Playwright and the Inter Tight
font files) and a Chromium that Playwright can find: `npx playwright install chromium`, or set
`CHROME_PATH` to a Chrome or Chromium binary.

## Every month

1. Draft `content/YYYY-MM.json`, named for the month its first post falls in: one post per weekday,
   in date order (the run may continue into the next month, as the first one does). Copy the shape
   of `content/2026-10.json`: a `theme` (see below), hook of at most 9 words, a term, the formula
   in plain words, the inputs with units, 3 to 5 worked steps, the result, a takeaway of at most
   18 words, the caption and hashtags (see "Captions and hashtags"). `thumbOffsetMs` is 12500 for
   3 steps, 14100 for 4, 15700 for 5 (`render/timing.mjs`). A new topic needs its formula added to
   `COMPUTE` in `scripts/compute.mjs` (formerly in `scripts/verify.mjs`). Since October 20, 2026 the
   month holds both slots and four types: see "Drafting a month" under "Hashtags and discovery".
2. `npm run verify` – recomputes every step, result and quoted figure; fix anything it lists.
3. `npm run render -- --month YYYY-MM` – renders every post (about a minute each; add
   `--only <slug>` for one). It refuses content that does not verify and stops if a card would
   overflow the frame.
4. Review `posts/<date>-<slug>/cover.jpg` and a few `reel.mp4`s.
5. Commit and push. The job picks each day up on its date.

If the dates move after rendering (a run starts earlier, a day is skipped), change them in the
content file and run `npm run relink -- --month YYYY-MM`: the cards show no date, so the folders are
renamed and `posts/index.json` rebuilt without re-rendering.

A post with a marker in `published/` has already gone out: `render` and `relink` leave its folder,
caption and video exactly as they were (`--force` overrides for `render`). The first Reel,
2026-10-16, was posted before themes and the new captions existed and stays as published.

## Themes

Each post names one of four themes in `brand.json`; the template colors the whole card from it
and inverts the Ξ mark on the dark ones. From post 2 they rotate `ink → sage-wash → sage → paper`
(`themeRotation`): a cycle of four over Instagram's three-column grid, so no column is ever a
stripe of one color. Post 1 is `paper`.

| Theme | Background | Hook | Result, values, takeaway | Muted | Headings | Accent | Takeaway wash |
| --- | --- | --- | --- | --- | --- | --- | --- |
| paper | #f5f2ed | #0e1116 | #0e1116 | #545961 | #3f5c4a | #7f9886 | #e9efe9 |
| ink | #0e1116 | #f5f2ed | #f5f2ed | #c9c4bb | #7f9886 | #7f9886 | #1b2320 |
| sage-wash | #e9efe9 | #3f5c4a | #0e1116 | #545961 | #3f5c4a | #3f5c4a | #ffffff |
| sage | #3f5c4a | #f5f2ed | #f5f2ed | #dadbd5 | #e3e3dd | #acb6ac | #34503f |

WCAG 2 contrast, computed by `node scripts/contrast.mjs` (and checked by `npm run verify`: body text
needs 4.5:1, large text 3:1; the accent is decorative and reported only):

| Pair | paper | ink | sage-wash | sage | Needs |
| --- | --- | --- | --- | --- | --- |
| Hook on background | 16.94 | 16.94 | 6.33 | 6.62 | 3 (large) |
| Result and step values on background | 16.94 | 16.94 | 16.20 | 6.62 | 3 (large) |
| Formula and step labels (muted) on background | 6.31 | 10.89 | 6.04 | 5.31 | 4.5 |
| Kicker, term, result label (heading) on background | 6.62 | 6.07 | 6.33 | 5.74 | 4.5 |
| Takeaway text on its wash | 16.20 | 14.38 | 18.91 | 7.95 | 4.5 |
| Mark bars on mark tile | 18.91 | 16.94 | 18.91 | 16.94 | 3 |
| Accent (rule, bar, border) on background | 2.79 | 6.07 | 6.33 | 3.53 | decorative |

On `sage`, the accent is paper at 60% over the background (#acb6ac), headings paper at 90%
(#e3e3dd) and muted text paper at 85% (#dadbd5), stored as solid colors so the ratios are exact.

## Captions and hashtags

**Superseded on 2026-10-20 by "Hashtags and discovery" under "Two slots a day" below** (five hashtags
at most, pools by type and audience instead of the A/B sets, a 125-character first line). Kept for
the two posts that went out with the old sets.

A caption is a keyword sentence, then 2 to 4 short lines restating the number, then the brand
footer, then the hashtags:

- **First line:** plain English with the words people search and who it is for, no hashtags, e.g.
  "Labor cost percentage for restaurant, coffee shop and salon owners: how to calculate it and what
  it means." `verify` requires 8+ words, one of the audience words in `brand.json`
  (`captionKeywords`) and "owners" or "operators".
- **Hashtags:** 3 to 5 topic tags from one of two sets, plus `#RunonRhea` on every post.
  Set A (`#restaurantowner #smallbusinessowner #laborcost #franchiseowner #coffeeshopowner`) goes on
  even-numbered posts, set B (`#restaurantmanagement #salonowner #profitmargin #multiunit
  #smallbusinessfinance`) on odd-numbered posts, counted by position in the content file. This is an
  **A/B test: review reach and profile visits per set in Instagram Insights on 2026-11-02** (two
  weeks of posts), then keep the better set or mix them. `#ownermath` and `#restaurantmath` were
  dropped (no audience). `verify` enforces the set by parity and the brand tag.

## Commands

Current as of October 20, 2026 (two slots a day); the builders' new commands are also listed under
"Commands added" below.

| Command | What it does |
| --- | --- |
| `npm run verify` | check every `content/*.json` (`-- --month 2026-10` for one), and the themes' contrast |
| `node scripts/contrast.mjs` | print every theme's contrast ratios |
| `npm run schedule -- --from 2026-10-21 --to 2026-11-30` | print the slot and type every day should carry |
| `npm run render -- --month 2026-11` | render what is new or changed, rewrite captions, rebuild both indexes, then copy new Reels to the Desktop (`--slot`, `--type`, `--only <slug>`, `--no-desktop`, `--no-verify`, `--force`) |
| `npm run relink -- --month 2026-10` | re-date rendered folders and rebuild the indexes after a schedule change |
| `npm run record -- --id overview-stores` | record one feature from the local app into `render/features/<id>/` |
| `npm run contact-sheet -- --month 2026-11` | every cover of the month on one page in `render/tmp/` |
| `npm run desktop` | copy new Reels and captions to `~/Desktop/Instagram Reels to edit/@runonrhea/<date>/` (each file once; `DESKTOP_REELS_DIR=<folder>` writes elsewhere) |
| `npm run publish:dry` | log what the publisher would post right now, both slots, without calling the API (dry runs skip the hour checks) |
| `POST_DATE=2026-10-21 SLOT=evening npm run publish:dry` | the same for one date and slot (`SLOT` is `auto`, `morning` or `evening`) |
| `POST_DATE=2026-10-25 npm run publish:dry` | the memorial carousel: its five slide URLs and the full caption |
| `node scripts/publish.mjs mark --date 2026-10-25 --slot memorial` | record a post put up by hand (`--slot morning`, `evening` or `memorial`, optional `--note "..."`; also `npm run mark -- ...`), then commit and push the marker |
| `npm run prune -- --days 30 --dry-run` | list (or, without `--dry-run`, remove) `reel.mp4` and `cover.jpg` of posts posted more than 30 days ago |
| `npm test` | the publisher, memorial, prune, Desktop-copy and workflow tests (fake fetch, temporary folders; no network) |
| `npm run check` | verify the token, account and publishing quota (needs `IG_USER_ID`, `IG_ACCESS_TOKEN`) |
| `node scripts/publish.mjs refresh` | refresh the long-lived token into `new-token.txt` |
| `gh workflow run "Post @RunonRhea" -f dry_run=true` | run the job from the command line, logging only |
| `gh workflow run "Post @RunonRhea" -f date=2026-10-21 -f slot=evening -f dry_run=false` | post one day and slot now |
| `KICK_DRY_RUN=true sh scripts/kick-post.sh evening` | show the command a launch agent would run, without running it |

## Notes

- The job runs every day at 14:07, 15:07 and 16:07 UTC (the morning slot) and 01:07, 02:07 and
  03:07 UTC (the evening slot); the script posts a slot only from its hour in America/Los_Angeles
  (7 AM, 6 PM), which handles daylight saving time, unless `POST_DATE` is given.
- If a slot has no folder for the day in its index, the job logs that and does nothing for it.
- To skip a post, delete its folder and its line in the slot's index before its hour. To re-post
  one, delete its marker (`published/<date>.json`, `<date>-evening.json`) and run the workflow with
  that date and slot. To post early or on demand, run the workflow with that `date` and `slot` (or
  `POST_DATE=... SLOT=... node scripts/publish.mjs`).
- A Reel plays 22.4 s (3 steps), 24.0 s (4) or 25.6 s (5): hook 0–3 s, term and formula 3–7 s,
  one step every 1.6 s, the result holds 4.2 s, the takeaway 4.2 s, the end card 2.2 s. The cover
  frame is taken 0.7 s after the result lands.

## Why posts arrive from a launch agent on Alex's Mac

GitHub's cron scheduler fires hours late or not at all on a quiet repository, so the schedule in
the workflow is only a backup. The real trigger is two launchd agents on Alex's Mac:
`launchd/com.rhea.morning.plist` runs `scripts/kick-post.sh morning` at 7:05 and 9:05 AM Pacific,
`launchd/com.rhea.evening.plist` runs `scripts/kick-post.sh evening` at 6:05 and 8:05 PM. The
script calls `gh workflow run "Post @RunonRhea" -f slot=<slot> -f dry_run=false`; the workflow
posts each slot once (a marker per date and slot in `published/` prevents duplicates) and only from
the slot's hour, so extra kicks are harmless. launchd runs a missed job at the next wake, but a Mac that is shut down or
offline at both times posts only if GitHub's own schedule happens to fire.

---

# Two slots a day

Planned October 20, 2026, from the founder's answers: two Reels a day, a mix of owner math, daily tips for
multi-store owners, myth vs fact and feature Reels of the app on demo data, "different things each day", every
post true of Rhea as it is now (`FACTS.md`), and every Reel with its caption also copied to the Desktop so he can
re-post an edited version with music later. Everything below is the design the three builders (A content,
B renderers, C publisher) work from; where a builder finds a reason to change a default, they say so in their
PR body and here.

## The two slots

| Slot | Pacific time | Weekdays | Weekends | Marker | Index |
| --- | --- | --- | --- | --- | --- |
| morning | 7:00 AM (`slots.morning.hour`) | owner math (the existing run to Nov 12, new owner math from Nov 13) | a tip or a myth | `published/<date>.json` (unchanged) | `posts/index.json` (unchanged: date → folder) |
| evening | 6:00 PM (`slots.evening.hour`) | feature, tip, feature, myth, repeating | the same cycle | `published/<date>-evening.json` | `posts/index-evening.json` (date → folder) |

Folders: morning `posts/<date>-<slug>/` (unchanged), evening `posts/<date>-evening-<slug>/`. Each holds `reel.mp4`,
`cover.jpg`, `caption.txt` and `meta.json`, and `meta.json` gains `slot`, `type` and `cardHash` (below). Nothing
that has a marker in `published/` is re-rendered, re-dated or changed; every existing date's morning post stays
as it is (captions excepted: see "Captions only" below).

Pacific time stays (`brand.json` `timezone`, as the first run and the founder's Mac). `weekdaysOnly` is now
`false`: the morning slot posts every day.

## Rotation, October 21 to November 30

Mechanical (`scripts/schedule.mjs` prints it for any range; `verify` checks each content file against it):
weekday mornings owner math; the evening cycle `feature, tip, feature, myth` over every non-memorial day from
October 21 (`brand.json` `rotation.start`); weekend mornings the type that day's evening is not, and when the
evening is a feature, the type **the same weekend's other morning** is not (if that day is a memorial date, the type
the previous weekend morning was not); a memorial date takes no regular post in either slot and does not advance
the cycle. *As built (builder A):* the plan's first wording, "the type the previous weekend morning was not",
contradicts its own table on November 7, 15, 21 and 29 and would put two tips on one weekend; the rule above is
the one the table follows, and `scripts/schedule.test.mjs` checks the whole table. So a day's two posts differ,
consecutive evenings differ and a weekend's two mornings differ. Ten feature recordings (F1–F10) run once each;
the second half of November adds eight new recordings and two second passes (as built, below). The slugs are in
the content files; `npm run schedule -- --from 2026-10-21 --to 2026-11-30` prints each slot with its slug.

| Date | Day | 7 AM | 6 PM |
| --- | --- | --- | --- |
| 2026-10-21 | Wed | owner math: sales-per-labor-hour (rendered) | feature F1 overview-stores |
| 2026-10-22 | Thu | owner math: overtime-week (rendered) | tip T1 |
| 2026-10-23 | Fri | owner math: food-cost-vs-cogs (rendered) | feature F2 store-days |
| 2026-10-24 | Sat | tip T2 | myth M1 |
| 2026-10-25 | Sun | **memorial carousel, the only post** | nothing |
| 2026-10-26 | Mon | owner math: prime-cost (rendered) | feature F3 labor-overtime |
| 2026-10-27 | Tue | owner math: rent-percent (rendered) | tip T3 |
| 2026-10-28 | Wed | owner math: royalty-ad-fund (rendered) | feature F4 ledger-entry |
| 2026-10-29 | Thu | owner math: break-even (rendered) | myth M2 |
| 2026-10-30 | Fri | owner math: sales-tax-not-revenue (rendered) | feature F5 deposits |
| 2026-10-31 | Sat | myth M3 | tip T4 |
| 2026-11-01 | Sun | tip T5 | feature F6 data-health |
| 2026-11-02 | Mon | owner math: tips-not-sales (rendered) | myth M4 |
| 2026-11-03 | Tue | owner math: gift-card-liability (rendered) | feature F7 your-numbers |
| 2026-11-04 | Wed | owner math: card-fees (rendered) | tip T6 |
| 2026-11-05 | Thu | owner math: blended-card-rate (rendered) | feature F8 synopsis |
| 2026-11-06 | Fri | owner math: card-sales-in-transit (rendered) | myth M5 |
| 2026-11-07 | Sat | tip T7 | feature F9 month-close |
| 2026-11-08 | Sun | myth M6 | tip T8 |
| 2026-11-09 | Mon | owner math: missing-deposit (rendered) | feature F10 compare-bookkeeper |
| 2026-11-10 | Tue | owner math: cash-over-short (rendered) | myth M7 |
| 2026-11-11 | Wed | owner math: ticket-times-transactions (rendered) | feature: statements-reconcile (new) |
| 2026-11-12 | Thu | owner math: four-wall-profit (rendered) | tip T9 |
| 2026-11-13 | Fri | owner math: labor-hours-budget | feature F1 overview-stores, 2nd pass |
| 2026-11-14 | Sat | tip T10 | myth M8 |
| 2026-11-15 | Sun | myth M9 | feature: bills (new) |
| 2026-11-16 | Mon | owner math: discount-rate | tip T11 |
| 2026-11-17 | Tue | owner math: delivery-commission | feature: year-end (new) |
| 2026-11-18 | Wed | owner math: minimum-crew | myth M10 |
| 2026-11-19 | Thu | owner math: fees-on-tax-and-tips | feature: connections-import (new) |
| 2026-11-20 | Fri | owner math: wage-increase-price | tip T12 |
| 2026-11-21 | Sat | myth M11 | feature: labor-payroll (new) |
| 2026-11-22 | Sun | tip T13 | myth M12 |
| 2026-11-23 | Mon | owner math: holiday-traffic-hours | feature: sales-tax (new) |
| 2026-11-24 | Tue | owner math: loaded-hourly-cost | tip T14 |
| 2026-11-25 | Wed | owner math: cash-in-the-safe | feature: demo-tour (new; the guided demo and the 7-day free trial) |
| 2026-11-26 | Thu | owner math: closed-day-cost (Thanksgiving) | myth M13 |
| 2026-11-27 | Fri | owner math: overhead-per-store | feature: budgets (new) |
| 2026-11-28 | Sat | myth M14 | tip T15 |
| 2026-11-29 | Sun | tip T16 | feature F9 month-close, 2nd pass (closing November) |
| 2026-11-30 | Mon | owner math: accrued-wages | myth M15 |

Written (builder A): 12 new owner-math posts, 16 tips, 15 myths and 20 feature posts on **18 distinct
recordings** (the plan's ten, then statements and reconciliation, bills and approvals, the year-end package,
POS connections and the file drop, labor and payroll as paid, sales tax, the guided demo with the trial, and
budgets; overview-stores and month-close return for a second pass with new headlines). Beyond November the same
rule continues; `npm run schedule -- --from 2026-12-01 --to 2026-12-31` prints the month to draft.

`content/recordings.json` lists every recording: the screens and steps, the evidence its posts cite, which posts
use it, and for each new one a scene spec in `render/features/<id>.json`'s format (copy it there and
`npm run record -- --id <id>`; each runs 13–16 s). `verify` refuses a feature post whose recording is not in
that file and warns until the recording exists.

## Content files and schemas

One content file per month, `content/YYYY-MM.json`, holding every post dated in that month in `(date, slot)`
order, both slots. The grandfathered exception is `content/2026-10.json`, whose owner-math run continues to
November 12 as first written; October's new posts (the evening slot from the 21st, the weekend mornings) are
added to it in order, and November's new posts, including the owner math for November 13–30, go in
`content/2026-11.json`. `verify` checks every file: a file's first post is dated in its month, posts are in
`(date, slot)` order, no `(date, slot)` is used twice across all files, no post is dated on a memorial date, and
each post's slot and type match the rotation (a post may carry `"rotationOverride": "<reason>"` to differ).

Every post has: `date`, `slot` (`morning` | `evening`), `type` (`owner-math` | `tip` | `myth` | `feature`;
a post without `slot` or `type` is a morning owner-math post, so the existing file needs no edit to keep
verifying), `slug` (unique across the repo), `theme` (`themeRule`), `caption`, `hashtags`, `thumbOffsetMs`.
Any `$`, `%` or `¢` figure anywhere in a post must be one of its `inputs`, computed from them by the post's
`COMPUTE` entry (now in `scripts/compute.mjs`, which `verify` imports; an entry may list `quotes`, further
computed figures a card shows), or one of the pinned `pricing` strings in `brand.json`: no other number ships.
Hooks and headlines at most 9 words, takeaways at most 18, the caption's first line as in "Hashtags and
discovery".

*Added as built (builder A)*, on every post that is not yet published: `keyword` (the search phrase the caption's
first line leads with: `verify` wants it within the first 60 characters), `audiences` (the industry groups the post
is true for, from `franchise`, `restaurant`, `coffee`, `salon`; default all four; industry hashtags come only from
these), optional `hashtagHints` (tags the hashtag picker must keep, e.g. `#multiunitfranchisee` on the royalty
post), optional `taxAdjacent: true` on any type, and `claims` with evidence on **any** post whose card or caption
names Rhea, not only features. A rendered video's card text that a newer rule would refuse (the gift-card card's
"customers") is reported as a warning, since changing it means a new video. Published posts are history: `verify`
rechecks only their arithmetic.

**owner-math** (unchanged): `hook`, `term`, `formula`, `inputs`, `steps` (3–5 `{label, value}`), `result`
`{label, value}`, `takeaway`. Timeline `render/timing.mjs` as today (22.4 / 24.0 / 25.6 s).

**tip**: `hook` (the problem or the question, ≤ 9 words), `title` (the tip in ≤ 5 words, the kicker's line),
`lines` (3–5 short lines, ≤ 10 words each: what to do and why), `action` (the big line, ≤ 4 words, e.g.
"Every Monday", "Per LLC", "Before payroll"), `takeaway` (≤ 18 words), optional `inputs` when a line quotes a
figure, optional `taxAdjacent: true` (then the takeaway or caption must say "ask your CPA"). Timeline: hook 0–3 s,
title at 3 s, lines from 7 s every 1.6 s, `action` holds 4.2 s, takeaway 4.2 s, end card 2.2 s: the same lengths
as owner math, so `thumbOffsetMs` is 12 500 / 14 100 / 15 700 by line count, taken as the action lands.

**myth**: `hook` (the myth as people say it, ≤ 9 words, shown under a "MYTH" label), `fact` (≤ 7 words, the big
line under a "FACT" label), `why` (2–4 lines, ≤ 10 words each), `takeaway`, optional `inputs`. Timeline: hook
0–3.5 s, "FACT" and `fact` at 3.5 s, `why` lines from 7.5 s every 1.6 s, the fact holds, takeaway at the last
line + 1.6 + 4.2 s, end card 2.2 s; `thumbOffsetMs` = 4 200 (the fact fully shown, with the myth above it).

**feature**: `headline` (≤ 9 words), `sub` (≤ 14 words, optional), `demoNote` (always exactly
`brand.product.demoNote`, "Demo company · made-up numbers"), `recording` (the id of a recording in
`render/features/<id>.json`, see below), `claims` (1–4 `{text, evidence}` where `evidence` is a path in the Rhea
repo or `FACTS.md`'s row; `verify` checks the path exists when `RHEA_REPO` is set and warns otherwise), `cta`
(fixed: "Try the demo: demo.rheafi.com"). Timeline: headline and sub from 0 s, the recording plays from 1.0 s for
its scenes' total (12–18 s), the end card 2.2 s; `thumbOffsetMs` is set per post (default 4 000) where the key
screen is on. Two posts may name the same recording only 14 or more days apart and never with the same
headline.

Captions: first line (the search sentence), then 2–4 short lines, then the footer (`captionFooter`, or
`captionFooterFeature` for a feature), then the hashtags. Tips and myths may close the body with one question
("Which store is yours?") since replies and shares count; never a "follow for more".

### Captions only: the existing owner-math posts

The 18 unpublished owner-math posts (October 20, which has not gone out yet, to November 12) have new first
lines, keywords, audiences and hashtag sets in `content/2026-10.json`; their cards and videos are unchanged (one
caption line changed too: the gift-card post now says "you owe gift card holders", not "customers").
`npm run relink -- --month 2026-10` rewrote their `caption.txt` and `meta.json` caption fields; `render` does the
same whenever only caption fields change. Posts with a marker (October 16 and 19) keep caption, hashtags and
files exactly as published.

## Rendering the new types

Built by builder B on October 20, 2026; where it differs from the plan, "Renderer: what changed from the plan"
below says so and why.

`render/template.html` draws four card types in the same frame, themes and motion rules (every motion a function
of `--t`); `window.setPost(post, timing, brand)` picks the layout by `post.type`, and the owner-math card is drawn
exactly as before (checked frame by frame against the old template: the only differences are Chromium's own
run-to-run noise, a handful of pixels at 1/255 that the old template also shows against itself).

- **tip**: the hook alone, then "The tip" and the `title` (in the term and formula block), the `lines` as numbered
  rows, the `action` very large under "Do it" (`actionLabel` and `titleLabel` may override those two labels), the
  takeaway. The action stays on one line when it fits at 120 px or more, otherwise it wraps to two (150 to 104 px).
- **myth**: the hook under an outlined "MYTH" pill; as the fact lands the myth slides up, turns the muted color and
  is struck through; the `fact` very large under a filled "FACT" pill (132 to 92 px, up to three lines); the `why`
  lines as rows; the takeaway.
- **feature**: the `headline` (76 to 56 px, at most two lines) and `sub` (34 to 28 px, at most two lines) at the
  top, the demo note as a pill on its own line just above the window for the whole Reel, the recording in a
  rounded 600×1300 window at (240, 560), the bar, then the end card with the `cta` as its big line.
- Every type: the kicker is `brand.kickers[type]`, the end card's line `brand.endCardLines[type]` (hidden on a
  feature when it repeats the `cta`); in tips, myths and features a space before `%` or `¢` never breaks a line.
  Nothing is ever cut: a card that would not fit is refused with the sizes it tried (`render --check` lists every
  post's fit without rendering, so content can be fixed before a long render).

`render/timing.mjs` has `timing(post)` per type (owner math and tips 22.4 / 24.0 / 25.6 s, myths 21.3 / 22.9 /
24.5 s for 2 / 3 / 4 lines with the cover at 4 200 ms, features the recording's length + 3.2 s) and
`cardHash(post)`, the SHA-1 of the fields that draw the card (type, theme, hook, term, formula, steps, result,
takeaway, title, lines, action, actionLabel, fact, why, headline, sub, demoNote, cta, recording; for a feature
also the SHA-1 of its `recording.mp4`), written to `meta.json`. The template is not in the hash: after a template
change, re-render with `--force`.

Render rules (`render/render.mjs`, decisions in `render/plan.mjs`): `--month YYYY-MM` renders a content file;
`--slot`, `--type` and `--only` narrow it; `--jobs 2` renders two cards at once. A post with a marker in
`published/` for its slot is never touched (no flag overrides it), and a memorial date gets nothing. A folder whose
`meta.json` `cardHash` equals the content's is not re-rendered: only `caption.txt` and `meta.json`'s caption fields
are rewritten (and the cover, if a feature's `thumbOffsetMs` moved). A folder rendered before `cardHash` existed
(the 18 first-run posts) adopts the hash when the card fields its `meta.json` recorded (theme, hook, result, cover
time) still match; if they differ, the video is kept, the caption rewritten and the difference printed, and
`--force` re-renders it. `--force` re-renders anything else without a marker. A post whose folder sits under an
older unposted date is moved, as `relink` does. Every Reel is checked against the specs of the Reels Instagram
already accepted (`render/probe.mjs`: H.264 High 4.1, 1080×1920, yuv420p, 24 fps, AAC-LC stereo 48 kHz,
`+faststart`, the length `meta.json` says, a 1080×1920 cover) before the run moves on. After rendering, `render`
rebuilds `posts/index.json` and `posts/index-evening.json` from every content file, draws the month's contact
sheet, and runs the Desktop copy unless `--no-desktop`. `--no-verify` skips the content check for a builder's
test render and does not write the indexes; `--content <file> --out <dir>` renders sample posts outside `posts/`.

`render/contact-sheet.mjs --month YYYY-MM` puts every cover of the month on one page, a week per row and each day's
7 AM and 6 PM side by side, labeled with type, theme and slug, "posted" on posted slots and a plain tile for a
memorial day (never its slides): `render/tmp/contact-sheet-YYYY-MM.jpg` (ignored by git). `render` draws it after
every run.

### Feature Reels: recording and composing

A feature Reel is a screen recording of the local app on demo data, composed into the 1080×1920 frame: headline
and sub at the top, the demo note above the window, the recording in a rounded phone-shaped window 600×1300 at
(240, 560), the theme's background and progress bar, then the end card. The geometry follows the founder's other
feature Reels (`feature.swift`: a 1300 px tall window in the lower frame) in Rhea's themes and type.

- **Recording** (`npm run record -- --id <recording>`; `--id a,b,c` or `--all` records several in one sign-in;
  `--dry-run` checks the scene files only): Playwright with `CHROME_PATH`, viewport 430×932 CSS px at
  `deviceScaleFactor` 2 (an 860×1864 frame, the window's aspect), against `FEATURE_APP_URL` (default
  `http://localhost:3600`, and only localhost is accepted). `render/features/<id>.json` holds the scenes:
  `{ "signIn": "viewer", "scenes": [{ "path": "/labor", "settle": 0.8, "start": <target>, "moves": [{ "hold": 1.4 },
  { "scroll": { "text": "Labor by store", "offset": 60 }, "over": 1.6 }, { "scrollX": { "text": "Sales", "to": 900 },
  "over": 2.2 }], "tap": { "role": "link", "text": "Exceptions" }, "escape": false, "note": "..." }] }` (the file's
  header in `render/record-feature.mjs` has every option). Every frame is a deterministic PNG screenshot at 24 fps:
  per frame the script sets the scroll position from the move's eased curve and takes a screenshot; a hold is one
  screenshot repeated; a tap shows a ring on the element for half a second, then clicks it, and the next scene
  starts on the page it opens (a cut). It signs in once per run ("Look around the demo company", the read-only demo
  viewer, which needs no credentials in the recorder; or the demo owner from `FEATURE_OWNER_EMAIL` /
  `FEATURE_OWNER_PASSWORD`, never a file), marks the demo tour done and presses Escape on each page (a scene with
  `"escape": false` keeps an open tour card), hides the caret, scrollbars and focus rings, and refuses: any `path`
  on the blocklist (`/admin`, `/setup/people`, `/setup/billing`, `/account`), any page showing an email address,
  and any page showing the two-letter word for artificial intelligence or naming Claude or Anthropic (posts never
  say either). Frames go to `render/tmp/features/<id>/` and are encoded once to `render/features/<id>/recording.mp4`
  (H.264, 24 fps, 860×1864, CRF 16, no audio) with `frames.json` (each scene's frames and its time in the Reel,
  `reelSec`), so composing never needs the app again. Recordings are committed (0.4 to 3 MB each; they are inputs,
  never pruned).
- **Composing** (`render.mjs` for `type: "feature"`): the template draws every frame with the window transparent
  (Chromium's `omitBackground`), and ffmpeg lays the recording, scaled to 600×1300 with Lanczos, under it: its first
  frame waits in the window from 0 s, it plays from 1.0 s, and its last frame stays under the end card as it fades
  in. Same codec settings as the cards (libx264 High 4.1, CRF 20, yuv420p, silent AAC 64k, `+faststart`). The cover
  is the composed Reel's frame at `thumbOffsetMs` (pick it inside one of the recording's holds: `frames.json`
  lists each scene's `reelSec`).
- **Running the app** for a recording session (what worked on October 20, 2026; `FACTS.md` has the background):
  in `/Users/alex/Desktop/rhea`, `npm ci`, then `BETTER_AUTH_SECRET=<32+ throwaway characters> npm run build`
  (`next build` refuses to prerender without it); seed `DATABASE_DIR=.data/e2e-social` with `npm run seed:demo` and
  throwaway `DEMO_OWNER_PASSWORD`, `DEMO_VIEWER_EMAIL=visitor@demo.rheafi.com` and `DEMO_VIEWER_PASSWORD`; start
  `npx next start -H localhost -p 3600` with the same `DATABASE_DIR`, `DEMO_VIEWER_*`, a throwaway
  `BETTER_AUTH_SECRET`, `APP_URL=http://localhost:3600` and **`RHEA_ENV=demo`** (the "Look around the demo company"
  button and the viewer's exemption from the second sign-in step exist only on the demo service; with `RHEA_ENV`
  unset the button does not show). Keep every value out of files and chat. The button allows 10 entries an hour
  per client, which is why the recorder signs in once per run; restart the app to reset it. Afterwards stop the
  app and `rm -rf .data/e2e-social`; never touch `.data/pglite`.
- **labor-overtime needs a full workweek**: the Labor page's "Overtime this week" is the workweek of the data's last
  day, and the seed ends the data yesterday, so on a Monday or Tuesday the panel says "Nobody is close to 40
  hours". Record it from a seed made Thursday to Saturday, or seed with the clock moved (a preload that shifts
  `Date` to, say, Saturday 17:00 UTC, for the seed process only). The committed recording was made from data
  ending Friday 2026-10-16 and shows "3 in overtime · 11 close" with first names, stores and hours.

Every feature post carries `demoNote` on screen for its whole length and `claims` with evidence; its headline
and caption say "sample data" or "demo" at least once.

The recordings (`render/features/`, made October 20, 2026 on the demo seed; `frames.json` holds each scene):

| Recording | Screens | Length |
| --- | --- | --- |
| overview-stores | Overview, last 30 days: synopsis, the four tiles, net income by store, the stores table to 106 and 111 in red | 15.0 s |
| store-days | Store 106: tiles (labor above 33%), daily sales and labor % with the target line, the store P&L | 13.2 s |
| labor-overtime | Labor: tiles, "Overtime this week" (3 in overtime, 11 close), labor by store, labor % by day in red | 14.4 s |
| ledger-entry | Ledger entries, tap a daily sales entry: its 13 lines to Total · Balanced | 13.0 s |
| deposits | Deposits, last month: 495 matched, 1 variance, the $2,886 card day with no deposit, tap Exceptions | 13.5 s |
| data-health | Data health: "Nothing needs a look", the stores-by-day grid, scrolled sideways to the latest days | 14.4 s |
| your-numbers | Your numbers: Labor, tap Prime cost, tap Tickets | 15.7 s |
| synopsis | Earlier synopses: "Do first", then the watch lines | 15.2 s |
| month-close | Month close: tiles, months to close, tap Sunrise Bagel 102 LLC's August: its checklist and the close | 14.4 s |
| compare-bookkeeper | Compare: no reports yet and the steps; Sunrise Bagel 101 LLC's September: the five steps, clearing accounts | 14.4 s |
| statements-reconcile | Statements: the accounts, tap checking 2214: its register; Reconcile accounts for October | 15.9 s |
| bills | Bills: past-due note, accounts payable by LLC, tap a bill waiting for approval | 14.7 s |
| year-end | Year-end package, Sunrise Bagel 101 LLC 2026: the verdict, "not a tax return", what is in the package | 14.6 s |
| labor-payroll | Labor, then Labor → Payroll: no payroll as paid yet, how Rhea keeps it from counting twice | 12.2 s |
| sales-tax | Sales tax, Sunrise Bagel 101 LLC: collected vs paid by month, by store, "Rhea never files" | 12.5 s |
| demo-tour | /demo ("Try Rhea"), then the guided tour's first three cards | 14.1 s |
| budgets | Setup → Budgets (read-only), then the Overview's synopsis line on a store's pace to its budget | 12.0 s |
| balance-sheet | Balance sheet, Sunrise Bagel 101 LLC, September: assets, liabilities, equity, "Equals assets" | 15.0 s |

Not recorded: `connections-import`. On the local app, Connections shows developer setup steps (environment
variable names, "Connect with Shopify cannot start") and Import names Claude, so neither screen can go in a post
as it is; `balance-sheet` is recorded as a replacement.

### Renderer: what changed from the plan, and why

- **The window sits at y 560, not 500, and the demo note is a pill above it, not under it.** Under the window the
  note would sit behind Instagram's caption and buttons for the whole Reel; above it, it is always visible and
  never covers the app's own header.
- **The recorder's scene format** is a list of moves (holds, scrolls to a pixel or to an element, sideways scrolls)
  and taps, with `start` and `escape` options, instead of one hold and one scroll per scene: real screens needed
  it. It signs in once per run because the demo button allows 10 entries an hour.
- **Recordings refuse more than the blocklist**: email addresses and the words posts never say.
- **`--force` never overrides a marker** (it did in the first run's renderer); a posted Reel is changed by nothing.
- **A first-run folder whose card no longer matches the content keeps its video** unless `--force`, so a theme or
  hook edit to the 18 rendered posts can't silently re-render them.
- **The owner-math end card's line now comes from `brand.endCardLines`** like every type's. The 18 first-run Reels
  keep "Owner math, every weekday" (adopted, not re-rendered); new owner-math Reels show whatever
  `endCardLines["owner-math"]` says.
- **Two contrast pairs added** (`scripts/contrast.mjs`): the FACT pill and the demo note draw the background color
  on a filled pill; both pass in all four themes (5.74:1 lowest).

## Index, markers and the publisher

`scripts/publish.mjs` reads `brand.slots`, `brand.memorial` and the two indexes and, on every run, posts
whatever is due and not yet posted: the morning slot from `slots.morning.hour`, the evening slot from
`slots.evening.hour`, each with its own marker, so one run at 6 PM also catches a morning post that never went
out. `SLOT=morning|evening` (the workflow's `slot` input) limits a run to one slot; `POST_DATE` with `SLOT`
posts a specific day and slot now (a date without a slot means both). A marker for the date and slot means
"already posted" whatever the run; nothing posts twice. The Reel request is unchanged (`REELS`, `share_to_feed`,
`thumb_offset` from `meta.json`), with a HEAD check of the media URL first. The publisher's logic moves into
`scripts/lib/publisher.mjs` (`createPublisher({ root, fetch, now, env })`) so `scripts/publish.test.mjs` can run
it against a temporary repo folder with a fake `fetch`; `scripts/publish.mjs` stays the command.

New mode `node scripts/publish.mjs mark --date YYYY-MM-DD --slot morning|evening|memorial [--note "..."]`
writes the marker by hand (`mediaId: "by-hand"`), for a post the founder put up himself before the job ran;
commit and push the marker so the job sees it.

As built (builder C), in addition to the above:

- **One slot failing never stops the other.** Each slot (and the memorial post) is tried on its own; whatever
  went out keeps its marker, the run exits non-zero if anything failed, and the next run retries only what is
  missing.
- **Guards before any call to Instagram:** the folder name must be a post folder (`<date>-<slug>`); `reel.mp4`
  must exist; when `meta.json` names a `slot` or `date`, it must match the index (an index pointing at the
  wrong folder posts nothing and says so); the caption must fit Instagram's 2,200 characters.
- **Hashtag limit as a safety net:** `verify` requires exactly five; if a caption still reaches the publisher
  with more than `hashtagRules.maxPerPost` (5), the trailing hashtag line is cut to five with a warning (the
  same rule icubasics-social's publisher applies), so Instagram never refuses a post over it. Memorial
  captions are posted exactly as written: nothing added, nothing cut.
- **Dry runs** (`DRY_RUN=true`, `npm run publish:dry`) skip the hour checks, never call `fetch` (not even the
  HEAD check), never write a marker, and print each post's URL and full caption (for the memorial: every
  slide URL in order, then the caption).
- **Markers** now carry `slot` (and `type` when `meta.json` has one); the two existing morning markers keep
  their shape and stay valid (`published/<date>.json` is the morning marker).
- `brand.json` `postHour` is gone (the hours are `slots.*.hour`); `weekdaysOnly` stays `false` and is no longer
  read.

### Memorial days

`brand.memorial.dates` lists the days Kathy's memorial post is the only post (2026-10-25, 2027-04-20,
2027-05-09). On such a date:

- the 7 AM run publishes the carousel in `posts/memorial/<date>/` once: one `IMAGE` container per `slide-N.jpg`
  (in order) with `is_carousel_item=true`, then a `CAROUSEL` container with `children` and `caption.txt`, poll
  until `FINISHED`, `media_publish`, marker `published/<date>-memorial.json` (the carousel code is the one
  icubasics-social's `publish.mjs` runs for its recap carousels; Meta: JPEG only, every slide cropped to the
  first slide's aspect, 1080×1350 here, up to 20 children);
- nothing else posts that day in either slot, even if an index has an entry; `verify` refuses a post dated on a
  memorial date, and `render` leaves both slots empty;
- a memorial date with no `posts/memorial/<date>/` folder (2027-04-20 and 2027-05-09 today) posts nothing and
  logs "Memorial day <date>: no memorial post prepared; nothing posts today";
- the Desktop copy adds nothing for it, and `~/Desktop/Instagram Reels to edit/@runonrhea/2026-10-25/` is
  never written, renamed or deleted;
- if the founder posts it by hand first: `node scripts/publish.mjs mark --date 2026-10-25 --slot memorial`,
  commit, push. That one line is all it takes: the job then sees the memorial marker, skips the carousel, and
  still posts nothing else that day. (`--note "posted from my phone"` is optional; an existing marker is never
  overwritten.)

As built: the memorial post is tried only in the morning slot (a run limited to `SLOT=evening` posts nothing on a
memorial day, even when the carousel has not gone out); a plain run after 7 AM, including the 6 PM ones, posts
the carousel if it is still missing. `posts/memorial/index.json` records each file's SHA-256; the tests
(`scripts/memorial.test.mjs`) require the copies to match it and, on the founder's Mac where the git-ignored
`memorial/2026-10-25/` exists, to match the originals byte for byte, and check every slide is a 1080×1350 JPEG and
the caption has no hashtags. The publisher only warns on a checksum mismatch (a deliberate update by the founder
should still post). On GitHub the "no memorial post prepared" line is a `::notice::`, so 2027-04-20 and
2027-05-09 show up in the run summary until their folders exist. The carousel's child containers carry only
`image_url` and `is_carousel_item=true`, exactly as icubasics-social's working recap code sends them (no
`media_type` and no alt text on the children).

`posts/memorial/2026-10-25/` holds exact copies of the six files in `memorial/2026-10-25/` (slide-1.jpg to
slide-5.jpg, caption.txt; checksums equal, checked by a test), and `posts/memorial/index.json` maps the date to
its folder and slide list. `memorial/` itself (kathy.md, and the git-ignored `memorial/src/` and `memorial/20*/`)
is the founder's: nothing there is changed, re-rendered, renamed or deleted, and its `.gitignore` lines stay.
No generated post ever uses her story, name or photo; memorial posts carry no hashtags.

### The workflow and the launch agents

`.github/workflows/post.yml`, renamed "Post @RunonRhea" (kick-post.sh and the docs follow):

```
schedule:
  - cron: '7 14 * * *'   # 7:07 AM PDT morning slot
  - cron: '7 15 * * *'   # 7:07 AM PST morning slot (8:07 PDT retry)
  - cron: '7 16 * * *'   # retry
  - cron: '7 1 * * *'    # 6:07 PM PDT evening slot (01:07 UTC the next calendar day)
  - cron: '7 2 * * *'    # 6:07 PM PST evening slot (7:07 PDT retry)
  - cron: '7 3 * * *'    # retry
workflow_dispatch inputs: date (YYYY-MM-DD), slot (choice: auto, morning, evening), dry_run (boolean)
```

The weekdays-only rule is gone. The job's steps stay (credentials check, dry-run API check, publish, marker
commit with the pull-rebase retry, the Monday token refresh); the publish step passes `SLOT` from the `slot`
input (`auto` = both), and the marker commit names every new marker. Then it runs the prune (below) and commits
its deletions in the same push. Concurrency group `post-runonrhea`, never cancelled.

Launch agents (written, not loaded; the founder installs them): `launchd/com.rhea.morning.plist` kicks
`scripts/kick-post.sh morning` at 7:05 and 9:05 AM, `launchd/com.rhea.evening.plist` kicks
`scripts/kick-post.sh evening` at 6:05 and 8:05 PM, both with the real path
`/Users/alex/Desktop/rhea-social/scripts/kick-post.sh`, logs in `~/Library/Logs/rhea-runonrhea*.log`.
`kick-post.sh <slot>` runs `gh workflow run "Post @RunonRhea" -f slot=<slot> -f dry_run=false`, no weekend
check. Install:

```
cp launchd/com.rhea.morning.plist launchd/com.rhea.evening.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.rhea.morning.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.rhea.evening.plist
```

GitHub's own schedule is the backup it always was. A day that passes before the branch is pushed is not posted
late by the job (the date moves on); the founder can post it with `-f date=... -f slot=...`.

As built: the marker commit reads e.g. "Posted 2026-10-21, 2026-10-21 evening" (or "Posted 2026-10-25 memorial"),
and adds "; pruned N old media files" when the prune removed something; a run with only prune deletions commits
"Pruned media posted more than 30 days ago". The prune is skipped on dry runs. The token refresh moved from
"scheduled runs on Mondays (UTC)" to "any non-dry run on a Monday morning, Pacific", because the schedule alone is
unreliable and a launch-agent kick is a `workflow_dispatch`; a second refresh the same morning is refused by
Instagram (token under 24 hours old) and only logged. Install the launch agents only after the branch is on
`main`: until then GitHub's workflow is still "Post Owner math", which has no `slot` input, and the kicks would
fail (logged in `~/Library/Logs/rhea-runonrhea.log`). The old `launchd/com.rhea.ownermath.plist` (never
installed) is deleted. `KICK_DRY_RUN=true sh scripts/kick-post.sh morning` prints the command without running it.

## The Desktop copy

`scripts/desktop-copy.mjs` (also `npm run desktop`; `render` runs it at the end) copies every rendered Reel
dated on or after `desktopCopy.firstDate` (2026-10-20) with its caption to
`~/Desktop/Instagram Reels to edit/@runonrhea/<YYYY-MM-DD>/`, named exactly like the founder's other accounts',
date first:

```
2026-10-21/2026-10-21 7AM owner math sales-per-labor-hour.mp4
2026-10-21/2026-10-21 7AM owner math sales-per-labor-hour.txt
2026-10-21/2026-10-21 6PM feature overview-stores.mp4
2026-10-21/2026-10-21 6PM feature overview-stores.txt
```

The slot label (`7AM`, `6PM`), type label (`owner math`, `tip`, `myth`, `feature`) and slug come from
`meta.json`. Each file is copied once and its key (`<date>/<name>`) recorded in
`~/Desktop/Instagram Reels to edit/@runonrhea/.copied`, so a file the founder deleted is never copied back and
an emptied day folder's files are never recreated (the folder itself may be removed by him). The script never
touches the other accounts' folders or the shared `.copied` one level up, never writes into a memorial date's
folder, and takes `DESKTOP_REELS_DIR` as an override so its tests and the builders run against a temporary
folder only. Future months fill in on their own because `render` ends with it.

As built (builder C), `scripts/desktop-copy.mjs`:

- Reads both indexes (`posts/index.json` → `7AM`, `posts/index-evening.json` → `6PM`), so it copies exactly what
  is scheduled, and takes the type and slug from `meta.json` (a morning folder without `type`, like the 18
  owner-math folders rendered before October 20, counts as owner math). A post whose `reel.mp4` is missing (not
  rendered, or pruned) is skipped and not recorded, so it is copied if it comes back.
- Keys in `.copied` are one per file, `<date>/<name>.mp4` and `<date>/<name>.txt`, so deleting just the video or
  just the caption is also respected. A file of the same name already there (put there by hand) is recorded and
  never overwritten. Videos are written to a hidden `.<name>.partial` and renamed, so an interrupted copy never
  leaves half a video.
- Like the founder's other accounts' copy, a caption follows later caption changes, but only while the post has
  no marker, its video is still in the folder, and the `.txt` is exactly what the script last wrote (a hash per
  caption in `@runonrhea/.captions.json`): a caption the founder edited, or one he put there, is never
  overwritten.
- Memorial dates from `brand.json` and, hard-coded as well, 2026-10-25 are skipped entirely: no file and no folder
  is ever created for them.
- It refuses to write anywhere in `~/Desktop/Instagram Reels to edit` but its `@runonrhea` folder (never the
  shared folder with the other app's `.copied`, never `@icubasics`, `@rnbasicsnclex`, `@themedicbasics`), and
  refuses those account names anywhere else.
- Proved against a temporary folder on 2026-10-20 with the real repo: 36 files (the 18 owner-math Reels from
  October 20 to November 12 and their captions), and a second run added nothing. The real Desktop folder was not
  written to. If the founder ever deletes `@runonrhea/.copied`, the next run copies everything again.
- `render/render.mjs` runs `node scripts/desktop-copy.mjs` at its end unless `--no-desktop` (it inherits
  `DESKTOP_REELS_DIR`); the module also exports `desktopCopy()` (returns `{ added, refreshed, skipped }`) and
  exits non-zero only for a refused folder.

## GitHub Pages size

Each owner-math Reel is about 0.7 MB and a feature Reel 3–6 MB; two a day is roughly 100 MB a month on the Pages
site. `scripts/prune.mjs --days 30` (run by the workflow after each marker commit, and by hand) deletes
`reel.mp4` and `cover.jpg` of every post whose marker is older than `prune.afterDays`, keeps `caption.txt` and
`meta.json`, and never touches a post without a marker, `posts/memorial/` or `render/features/`. Thirty days
leaves the founder a month to run the Desktop copy before a Reel leaves the repo. Git history still keeps every
file (about 1.2 GB a year at this pace): when the repository nears GitHub's 1 GB guidance, move media to Git LFS
or a bucket; not needed in 2026.

## Hashtags and discovery

Researched October 20, 2026 (planner, then builder A again with web searches and page reads). Each point says
whether the source is Instagram's own words or someone reporting them.

**What Instagram allows and says**

- **Five hashtags per reel or post.** Instagram's @creators account, December 18, 2025: "Starting today,
  Instagram will allow up to 5 hashtags in a reel or post" (the Threads post as quoted by
  [Storycut, checked October 3, 2026](https://www.storycut.com/blog/instagram-hashtag-limit)), and Instagram's
  statement that it "will gradually update the number of hashtags that you can include in a caption for a reel or
  post to five" because "using fewer (up to 5) more targeted hashtags, rather than many generic ones" can improve
  performance ([Social Media Today, December 18, 2025](https://www.socialmediatoday.com/news/instagram-implements-new-limits-on-hashtag-use/808309/);
  also [BetaNews, December 19, 2025](https://betanews.com/2025/12/19/instagram-puts-a-limit-on-hashtag-usage/)).
  Instagram's Help Center now reads "You can use up to 5 tags on a post" (as quoted by Storycut; the page,
  help.instagram.com/351460621611097, would not render here). An earlier test in November 2025 capped some
  accounts at three; the announced and current limit is five. Meta's developer reference for the caption field
  reportedly still says 30 (secondary); we follow Instagram's five. **Rule: exactly five, every regular post.**
- **In the caption, not a comment.** Instagram's search guidance, as quoted by Storycut and by several SEO guides:
  "For a post to be found in Search, put keywords and hashtags in the caption, not the comments." Whether
  first-comment tags count toward the five is unconfirmed either way. **Rule: the five are the caption's last
  line** (the API posts a caption; C's publisher also cuts anything past five as a safety net).
- **Hashtags classify; they don't buy reach.** Adam Mosseri: hashtags "don't improve visibility on Instagram" but
  are "a great way to let people know what a post is about and connect posts" (May 2025, quoted by
  [Social Media Today](https://www.socialmediatoday.com/news/instagram-implements-new-limits-on-hashtag-use/808309/)).
  So a tag earns its slot only if the right people follow or search it and it truly describes the post.
- **Captions are what search reads.** Instagram, August 2026: "Captions add relevant context, spark conversation,
  and tell search engines what your content is about"; use "descriptive and relevant keywords"; only the first two
  lines show before "more" ([Social Media Today, August 23, 2026](https://socialmediatoday.com/news/instagram-stresses-the-importance-of-captions/828554/)).
  Mosseri's account of Search: the text typed is "by far the most important signal", matched against usernames,
  bios, captions, hashtags and places, then the searcher's activity, then popularity
  ([Search Engine Journal's report of Instagram's 2021 post](https://www.searchenginejournal.com/how-instagram-ranks-search-results/417449/);
  the original page no longer loads). Since July 10, 2025, public posts of professional accounts can also show in
  Google and Bing ([PPC Land](https://ppc.land/instagram-content-becomes-searchable-on-google-starting-july-10/);
  secondary). Whether in-app search reads on-screen text or speech is claimed by marketing blogs only:
  unverified.
- **What gets a Reel in front of people who don't follow you.** Instagram's own
  ["Instagram Ranking Explained"](https://about.instagram.com/blog/announcements/instagram-ranking-explained)
  (Mosseri, May 31, 2023): Reels are ranked mostly on how likely you are "to reshare a reel, watch a reel all the
  way through, like it, and go to the audio page"; low-resolution, watermarked, muted, bordered, reposted and
  "majority text" Reels may be shown less; "Most of the content you'll see in Explore is from people you don't
  follow". Mosseri, January 2025: "The top three signals that matter most for ranking are watch time, likes and
  sends", and "sends are slightly more important for unconnected content", that is, for reaching non-followers
  ([Social Media Today, January 22, 2025](https://www.socialmediatoday.com/news/instagram-shares-algorithm-2025/738034/)).
- **Banned and broken tags.** Instagram publishes no list; a restricted tag's page says recent posts are hidden
  ([Ayrshare, updated 2026](https://www.ayrshare.com/avoid-using-these-instagram-banned-hashtags/); secondary).
  Third-party "banned tag checkers" are often out of date.
- **Tag sizes.** No reliable public source gives current post counts for these tags; generator sites show
  estimates without a method, and Instagram shows a count only inside the app. **No size is written down here.**
  The pools mark tags broad, mid or niche by what each describes and who uses it (`hashtagPools.tiers`, labeled
  "judged, not measured").

**What the posts do about it (`brand.json` `hashtagRules`, `hashtagPools`; enforced by `verify`, picked by
`scripts/hashtags.mjs`)**

- **No `#RunonRhea` in the five** (a change from the plan). A brand tag nobody follows reaches nobody; the handle
  and the caption footer carry the brand, and the founder's other accounts use no brand tag either. All five
  slots go to tags owners follow and search.
- **The five:** at least one **topic** tag the writer picks for what the post is about (the picker never adds
  one: a tag for a topic the post isn't about would mislead); **two industry tags from two different industries
  the post is true for** (`audiences`: no salon tag on food cost, prime cost, delivery or comps; no franchise-only
  claims for independents); at least one **bookkeeping or broad-owner** tag; and the mix holds **at least one
  broad and one niche** tag. The fifth slot goes to a third industry or a second bookkeeping/broad tag.
- **Rotation:** no identical set within 14 days; consecutive posts share at most two tags; every industry group
  and the bookkeeping group appear every Monday-to-Sunday week. Over October 20 to November 30 the 81 unpublished
  posts use all 50 pool tags, none more than 14 times.
- **Never:** a tag outside the pools (so nothing made up or misspelled), the denylist (vendor and competitor
  brand tags such as #quickbooks, #toast, #square, #gusto, #restaurant365; the banned product word; generic or
  engagement-bait tags such as #smallbusiness, #entrepreneur, #followforfollow), or a retired tag (each with its
  reason in `hashtagPools.retired`: #multiunit is mostly apartment buildings, #cashflow mostly real-estate
  investing, #giftcards consumer promos, #overtime sports, #foodbusiness home bakers, #beautybusiness solo
  pros…). Memorial posts carry none.
- **The first caption line is the search sentence:** the phrase owners type (`keyword`, within the first 60
  characters, because a Reel's caption shows about one line before "more"), then who it is for, under 125
  characters; the card's hook and term say the topic in words too.
- **For non-followers:** tips and myths may end the caption with one question worth replying to or sending to a
  partner (never "follow for more"); feature Reels show the app moving, which also answers the "majority text"
  caution. **Flag for the founder:** owner-math, tip and myth cards are mostly text by design; if their reach to
  non-followers lags the feature Reels in Insights, that is the likely reason, and the music re-posts and more
  feature Reels are the levers.

| Pool | Tags (judged tier: **broad**, mid, *niche*) |
| --- | --- |
| franchise | #franchiseowner, #franchisee, **#franchising**, #franchisebusiness, *#multiunitfranchisee*, *#franchiselife* |
| restaurant and quick service | #restaurantowner, #restaurantowners, #restaurantmanagement, **#restaurantbusiness**, **#restaurantindustry**, *#restaurateur*, *#qsr* |
| coffee | #coffeeshopowner, #cafeowner, #coffeebusiness, *#coffeeshopbusiness*, *#coffeeshopowners* |
| salon | #salonowner, *#salonowners*, #salonbusiness, *#salonownerlife* |
| bookkeeping | *#smallbusinessbookkeeping*, **#bookkeeping**, #bookkeepingtips, #smallbusinessfinance, #businessfinance, #accountingtips |
| broad owner | **#smallbusinessowner**, **#businessowner**, **#smallbusinesstips** |
| topic: owner math | *#laborcost*, *#primecost*, *#foodcost*, #profitmargin, *#breakeven*, #salestax, *#creditcardfees*, #cashflowmanagement, **#payroll**, *#menupricing*, *#restaurantaccounting* |
| topic: tip | **#businesstips**, *#monthendclose*, *#bankreconciliation*, *#accountspayable*, *#laborcost*, *#foodcost*, *#primecost*, #salestax, *#creditcardfees*, #cashflowmanagement, *#restaurantaccounting*, #profitmargin, **#payroll** |
| topic: myth | #profitmargin, #cashflowmanagement, *#laborcost*, *#foodcost*, *#primecost*, #salestax, *#creditcardfees*, *#monthendclose*, *#restaurantaccounting*, **#payroll**, *#bankreconciliation*, **#businesstips** |
| topic: feature | *#bookkeepingsoftware*, #accountingsoftware, *#restauranttech*, *#restaurantaccounting*, #franchiseaccounting, *#laborcost*, *#bankreconciliation*, *#monthendclose*, #salestax, *#accountspayable*, #cashflowmanagement, **#payroll**, #profitmargin |
| memorial | none |

Before adding a tag to a pool: look it up under Search, Tags in the Instagram app; drop it if the page is empty,
says recent posts are hidden, or is mostly spam or another industry; then `npm run verify`.

**API facts kept from Meta's page** ([developers.facebook.com](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing)):
100 API-published posts per 24 hours (one section still says 50; two a day is far under either), carousels up to
20 JPEG children cropped to the first slide's aspect, no music, no scheduling, no drafts through the API, and
`alt_text` for images only ("Reels and stories are not supported"), so Reels carry their keywords in the caption
and on screen. Reels' encoding specifications were not on the page; the current ffmpeg settings are kept because
the two published Reels prove them.

Unverified and left as is: whether first-comment hashtags count toward five; the exact weights of sends, watch
time and likes; whether on-screen text or speech is read for in-app search; any tag's current size.

### Drafting a month (content, builder A's tools)

1. `npm run schedule -- --from 2026-12-01 --to 2026-12-31`: the type each slot carries, and what is written.
2. Write the posts in `content/YYYY-MM.json` in `(date, slot)` order, with `keyword`, `audiences`, and only the
   topic tag(s) in `hashtags`; a new owner-math topic gets its formula in `scripts/compute.mjs`; a new feature
   gets its recording in `content/recordings.json`.
3. `node scripts/hashtags.mjs --month YYYY-MM` completes the five on each unpublished post (`--redo` re-picks the
   month, `--dry-run` prints).
4. `npm run verify` (with `RHEA_REPO=/Users/alex/Desktop/rhea` it also checks every claim's file exists), then
   `npm test` (the schedule, hashtag and verify tests are among them).

## Builders and ownership

Three builders in parallel on branch `twice-daily`, each in its own files, then one integration pass. Nobody
pushes, opens a PR, dispatches the workflow, calls the Instagram API, loads a launch agent, writes into
`~/Desktop/Instagram Reels to edit`, or commits in `/Users/alex/Desktop/rhea`. At most three heavy jobs on the
Mac at once (a render, a build and a recording session count as one each).

**A, content and checks** owns `content/*.json`, `scripts/verify.mjs`, `scripts/format.mjs`, `scripts/schedule.mjs`.
Writes the 16 tips, 15 myths, 20 feature posts (on B's ten recording ids) and the 12 owner-math posts for
November 13–30 (each with a `COMPUTE` entry; candidates: the discount rate as dollars a day, a labor-hours budget
from a labor % target, delivery commission on delivery sales, the loaded hourly cost with benefits, comps as a
share of sales, cash sitting in the safe before deposit, card fees paid on sales tax and tips, a 25¢ price change
at a day's ticket count, extra hours for 20% more traffic at the same SPLH, the cost of a closed day from fixed
costs, the royalty on a holiday week, days of sales in transit across the group), the new first lines and hashtag
sets on every unpublished post, and `verify` extended: slots, types and the rotation; memorial dates; the figure
rule for every type; the pricing pin; banned words (the two-letter word for artificial intelligence and
"A-I accountant", "tax software", "testimonial", "customers", "saves you", competitor names, "fake", "seamless",
"leverage"); claims with evidence on features; the five-hashtag rule from the pools; the first line's 125
characters and keywords; "ask your CPA" on tax-adjacent tips; `hashtagSets` deleted once the pools are read.
Runs `npm run relink -- --month 2026-10` to rewrite the 18 captions.

**B, renderers** owns `render/*` (template card types, `timing.mjs` with `cardHash`, `render.mjs` idempotency and
CLI, `record-feature.mjs`, `features/*.json` and the ten `recording.mp4`s, `contact-sheet.mjs`),
`scripts/contrast.mjs`, and the local app session for recording (`FACTS.md` recipe; builds `/Users/alex/Desktop/rhea`,
starts it on port 3600 only, stops it, deletes `.data/e2e-social`). Renders with `--no-desktop` always.
Delivers covers and a contact sheet for review.

**C, publisher and copies** owns `scripts/publish.mjs` and `scripts/lib/publisher.mjs`, `scripts/publish.test.mjs`,
`.github/workflows/post.yml`, `scripts/kick-post.sh`, `launchd/*.plist`, `scripts/prune.mjs` and its test,
`scripts/desktop-copy.mjs` and its test, `posts/memorial/` (the six copied files, `index.json`, the checksum test),
`package.json` scripts and the README's command table. Tests use `node:test`, a fake `fetch` and temporary folders
(`npm test`); dry runs only against the real indexes.

Contracts between them, fixed here: `meta.json` fields `slot`, `type`, `cardHash`, `thumbOffsetMs`; folder names
and the two indexes; marker names; `brand.json` keys as written; the recording id as the only link between a
feature post and B's files; `DESKTOP_REELS_DIR` and `FEATURE_*` environment names.

Integration (after all three): `npm run verify`; `npm run render -- --month 2026-10 --no-desktop` and
`-- --month 2026-11 --no-desktop` (about a minute a card, so an hour or two in all); review covers and the
contact sheets; `npm test`; `POST_DATE=2026-10-21 SLOT=evening npm run publish:dry`,
`POST_DATE=2026-10-25 npm run publish:dry` (the carousel, dry) and `POST_DATE=2026-10-26 npm run publish:dry`;
`DESKTOP_REELS_DIR=/tmp/<folder> npm run desktop` and look at the names; commit. The founder then pushes,
installs the two launch agents, runs `npm run desktop` once for the real folder, and may post today's missed
morning Reel with `gh workflow run "Post @RunonRhea" -f date=2026-10-20 -f slot=morning -f dry_run=false`.

## Commands added

| Command | What it does |
| --- | --- |
| `npm run schedule -- --from 2026-10-21 --to 2026-11-30` | print the slot and type every day should carry |
| `npm run render -- --month 2026-11 [--slot evening] [--type tip] [--only <slug>] [--no-desktop] [--no-verify] [--force]` | render what is new or changed; rewrite captions; rebuild both indexes; copy to the Desktop |
| `npm run record -- --id overview-stores` | record one feature from the local app into `render/features/<id>/` |
| `npm run contact-sheet -- --month 2026-11` | every cover of the month on one page in `render/tmp/` |
| `npm run desktop` | copy new Reels and captions to the Desktop folder (`DESKTOP_REELS_DIR` overrides it) |
| `npm run prune -- --days 30 [--dry-run]` | remove media of posts posted more than 30 days ago |
| `SLOT=evening npm run publish:dry`, `POST_DATE=... SLOT=... npm run publish:dry` | what the publisher would post |
| `node scripts/publish.mjs mark --date 2026-10-25 --slot memorial` | record a post the founder put up by hand |
| `npm test` | the publisher, memorial, prune, Desktop-copy and workflow tests (fake fetch, temporary folders) |
| `gh workflow run "Post @RunonRhea" -f date=2026-10-21 -f slot=evening -f dry_run=false` | post one day and slot now |

## Decisions and why

- **Pacific time, 7 AM and 6 PM:** `brand.json` already says Pacific; 6 PM mirrors the founder's other accounts'
  evening slot and sits after a store's afternoon lull. The crons are written for both PDT and PST with a retry
  each, and the script itself decides by Pacific hour, so daylight saving needs no edit.
- **Every run posts whatever is due:** one code path for both slots, and an evening run repairs a morning the
  scheduler skipped. Markers per slot make extra kicks harmless. No cross-day catch-up: posting yesterday's
  Reel a day late is a founder's call, made with the `date` and `slot` inputs.
- **Separate index files and marker names instead of a new index format:** `posts/index.json` and
  `published/<date>.json` are what the live publisher reads, so the morning posts already rendered need no
  migration and the live job keeps working until the branch lands.
- **Content by month, both slots in one file, October grandfathered:** one file is what the founder drafts
  monthly; the October file already runs to November 12 and its posts' folders are keyed by date and slug, so
  moving them would buy nothing.
- **`cardHash` idempotency instead of a "captions only" flag:** the renderer can then always be run for a whole
  month; videos change only when a card field does, which is also what makes "captions only" for the 18
  rendered posts safe.
- **Ten recordings shown twice instead of twenty:** recording and checking a feature against the live app is
  the expensive part; the founder's other account cycles five or six features; the second pass gets a new
  headline and caption, two weeks later, so the grid never shows the same card twice in a row. More recordings
  replace second-pass slots when time allows. *As built:* eight of the ten second-pass slots got new recordings
  (statements, bills, year-end, connections and the file drop, payroll as paid, sales tax, the guided demo,
  budgets), so the month covers the product as it is now; overview-stores and month-close return once each.
- **A phone-shaped window for feature Reels:** a 9:16 Reel watched on a phone shows a phone-width screen
  legibly; Rhea's pages fit a phone; the geometry matches the founder's other feature Reels.
- **Deterministic screenshots instead of Playwright's video:** crisp 2× frames, the same frame every time
  (like the cards), and recording and composing are separate steps, so a composition change needs no app.
- **Tips and myths reuse the owner-math timeline and layout:** the same 22–26 s, the same cover rule, no new
  motion to tune, and the grid stays one family.
- **Hashtags: exactly five, in the caption, from pools:** Instagram's own limit and its advice ("fewer, more
  targeted"); pools make a typo or a vendor tag impossible; rotation keeps the sets from repeating; sizes are
  not invented. The November 2 A/B review is dropped because almost nothing shipped under it. *As built:* no
  `#RunonRhea` in the five (no audience; the slot goes to a tag owners follow), topic tags only from the writer,
  industry tags only for industries the post is true for, and a picker (`scripts/hashtags.mjs`) so every month's
  sets keep the rules without hand-juggling.
- **No alt text on Reels:** the API refuses it for Reels; the keywords go in the caption's first line and on
  the card.
- **Memorial carousel through the morning slot, with its own marker and dates in brand.json:** the founder asked
  for everything to auto-post "in case I forget"; the dates are data with tests; a by-hand `mark` command keeps
  a manual post from posting twice; both regular slots stay empty by rule in `verify`, the renderer and the
  publisher, three independent guards.
- **Prune after 30 days, markers only:** Instagram holds the media after posting; a month leaves time for the
  Desktop copy; unposted media and the memorial folder are never candidates.
- **The Desktop copy is a side effect of `render`, with its own `.copied` list under `@runonrhea/`:** the same
  mechanism as `push-month.sh` in the founder's other app, kept apart from that app's list and folders; a
  deleted file stays deleted.
- **Workflow renamed "Post @RunonRhea":** "Post Owner math" would misdescribe tips and features; the name
  appears only in this repo (kick-post.sh and the docs).
