# Rhea, as it is today (October 20, 2026)

What every post may say about Rhea. Written for the people who write the Reels, from the code and docs
in `/Users/alex/Desktop/rhea` (branch `instagram` = master `9bc6e96`) and the marketing site
`/Users/alex/Desktop/rhea-site` (main `31f2535`). When this file and the code disagree, the code wins:
re-check the file named beside a claim before using it. A claim with no file beside it is not made.

Status words used below, and the only ones a post may imply:

| Word | Meaning |
| --- | --- |
| **built** | merged on master, runs on the demo at demo.rheafi.com with sample data, and on app.rheafi.com (which has no customers yet) |
| **sandbox** | built and tested only against the vendor's sandbox or a test account; nothing real has ever been written |
| **test mode** | built; runs with the partner's test keys only until the founder switches it on |
| **off** | built, but switched off until the founder has keys or a partner's approval |
| **pending** | not built; waiting on a partner |
| **not built** | nothing in the code |

## One sentence

Rhea: automated books, labor and per-store profit for multi-store owners (`brand.json` `captionFooter`;
`rhea/CLAUDE.md` first lines; `rhea-site/src/lib/site.ts` `SITE_DESCRIPTION`). The site's headline is
"Bookkeeping that runs itself." for "multi-store franchise owners", "now forming a pilot for groups of
about 8–30 stores" (`rhea-site/src/app/page.tsx` `Hero`).

## What it does, feature by feature

### Data in

| Feature | Status | Proof |
| --- | --- | --- |
| Square: "Connect with Square" (OAuth, read-only scopes), daily sales, time cards, payouts | sandbox | `rhea/src/integrations/square/`, `src/server/square-import.ts`, `render.yaml` `SQUARE_ENVIRONMENT: sandbox` |
| Clover: merchant API token, daily sales and time cards (never reports wages) | sandbox | `src/integrations/clover/`, `src/server/clover-import.ts`, `docs/clover-setup.md` |
| Shopify POS: "Connect with Shopify", locations to stores, Shopify Payments payouts | sandbox (development stores only; `SHOPIFY_ENVIRONMENT=development` everywhere but production) | `src/integrations/shopify/`, `src/server/shopify-import.ts`, `docs/shopify-setup.md` |
| Toast: the nightly SFTP export read by built-in layouts; detail files refused, guests' columns dropped | built (production service only; checked against Toast's field reference, "[verify] against a real export") | `src/integrations/toast/`, `src/server/toast-sftp.ts`, `/connections/toast`, `docs/toast-setup.md`, `docs/handoff.md` "Toast" |
| 7shifts: time punches with wages on a company token | built (sandbox trial company so far) | `src/integrations/sevenshifts/`, `src/server/sevenshifts-import.ts`, `docs/sevenshifts-setup.md` |
| Files: one Import drop zone for CSV, Excel, PDF and photos; Rhea's templates and saved layouts read by Rhea; unfamiliar files read by Claude, always previewed, nothing saved until confirmed | built (Claude reading only with `ANTHROPIC_API_KEY`) | `/import`, `src/server/smart-import.ts`, `src/integrations/files/smart/`, `docs/claude-file-reading.md` |
| Reports by email (an inbound address per feed) | built (production only) | `docs/email-intake.md`, `src/server/feeds/` |
| Nightly imports for connected accounts (Square, Clover, Shopify, 7shifts, Gusto) by the daily job | built | `src/server/jobs/`, `render.yaml` `rhea-jobs` (12:00 and 14:00 UTC) |
| Bank and card statements: CSV/OFX/QFX/QBO upload; treatments (transfers, card payments, draws, loans, payroll summary, sales tax, royalties, splits); "Rhea suggests" merchants (Claude, never for a person's payment); high-confidence lines book themselves, marked "Booked by Rhea: check it" with Undo; bank reconciliation | built | `/statements`, `/statements/reconcile`, `src/core/statements/`, `src/server/statements-import.ts`, `docs/handoff.md` "Statements that book themselves" |
| PDF statements | not built | `docs/PICKUP.md` Next 5 |

### The books

| Feature | Status | Proof |
| --- | --- | --- |
| Every store's day becomes a balanced journal entry in Rhea's own ledger (sales, discounts, comps, refunds, service charges, sales tax to a liability, tips to a payable, gift cards sold to a liability, card tenders to clearing, cash; residual to Cash Over/Short 6990) | built | `src/core/journal/`, `src/core/types.ts` sales identity, `CLAUDE.md` Accounting rules |
| POS-to-account mapping table (store row, group default, by date); an unknown POS label waits on the "needs a home" list, posted to 2990, never guessed | built | `/setup/mapping`, `src/core/mapping/`, `src/server/pos-mappings.ts` |
| One LLC per store, several stores per LLC, each with its own books; group roll-up | built | `/setup/stores`, `src/server/store-setup.ts` |
| Business dates from each store's time zone and business-day end hour | built | `src/core/business-day.ts` |
| Trial balance per LLC, journal-lines export, clearing-account rollforward tied to the trial balance | built | `/ledger/trial-balance`, `/ledger/rollforward`, `src/core/reports/trial-balance.ts`, `rollforward.ts` |
| Balance sheet with opening balances typed on Setup | built | `/ledger/balance-sheet`, `src/server/opening-balances.ts`, `src/core/reports/balance-sheet.ts` |
| Month close: months close in order, corrections only by reversal plus a new version, an add-only audit log; the owner's month-end checklist and "Close every ready month" | built | `/ledger/close`, `/ledger/close/[legalEntityId]/[month]`, `src/core/ledger/`, `src/server/month-close.ts`, `src/server/close-checklist.ts` |
| Compare with the bookkeeper: the bookkeeper's QuickBooks Online exports (P&L, Trial Balance, General Ledger…) saved as reference data; an account crosswalk; a difference report to the cent, Rhea − bookkeeper, from the general ledger (best) or the P&L (a trial balance alone compares nothing: it is shown for information); explanations with reason codes | built | `/ledger/compare`, `src/core/bookkeeper/`, `src/server/difference-report.ts`, `docs/bookkeeper-compare.md` |
| True month-end profit per store from the bookkeeper's monthly P&L (rent, utilities, actual payroll…) | built | `src/server/month-end-costs.ts`, `src/core/bookkeeper/month-end.ts` |
| Honest P&L: net income, prime cost and COGS % shown only when every store-month in view has month-end costs; otherwise a partial P&L that says so | built | `src/core/reports/completeness.ts`, `src/server/month-end-costs.ts` `loadPnlData` |
| QuickBooks Online: OAuth, one entry per store day pushed with an idempotency `requestid`, a class per store, entries never edited once pushed (reversals), labor accruals and bank-line deposits never pushed | **sandbox only**: `QBO_ENVIRONMENT=sandbox` on every service, `RHEA_ALLOW_QBO_PRODUCTION=false`; "no live company has ever been written"; the one-QuickBooks-company-per-LLC link is partial | `src/integrations/quickbooks/`, `src/server/quickbooks-sync.ts`, `render.yaml`, `docs/feature-map.md` 2.1 "Today" |
| Bills to QuickBooks (as bills and vendor credits) | sandbox | `src/server/quickbooks-bills.ts`, `docs/handoff.md` "PR C" |
| Budgets per store with pace words, on/off switch | built | `/setup/budgets`, `src/core/budgets/`, `src/server/budgets.ts` |

### Labor

| Feature | Status | Proof |
| --- | --- | --- |
| Hours, overtime, labor % per store per day from the time clock; each store's labor % target and employer burden rate (7.65% until set); daily labor accrual entries kept in Rhea only | built | `/labor`, `/stores/[storeId]`, `src/core/labor/`, `CLAUDE.md` |
| Who is heading for overtime this workweek (names and hours, never pay) | built | `/labor` (`labor-overtime` tour anchor), `src/components/overview/overtime-panel.tsx` |
| Pay rates per person and job, applied at every rebuild; a shift without a wage costs $0 with a warning | built | `/setup/pay-rates`, `src/core/labor/pay-rates.ts` |
| Payroll as paid: any provider's payroll summary file (company totals, never a person's pay) replaces the time-clock estimate; a payroll register with people is refused | built | `/labor/payroll`, `src/core/payroll/`, `src/server/payroll.ts`, `samples/templates/rhea-payroll-summary-template.csv` |
| "Connect with Gusto" | **off** until the founder has Gusto developer keys; sandbox after that | `src/integrations/gusto/`, `docs/gusto-setup.md`, `docs/PICKUP.md` |
| Overtime alerts and labor % in the owner's morning email | built | `src/core/notifications/`, `src/server/jobs/owner-email-task.ts` |

### Deposits and cash

| Feature | Status | Proof |
| --- | --- | --- |
| Card sales matched to processor payouts (Square, Shopify) and to bank deposits; a card day whose money never arrived listed first; variance per deposit | built | `/deposits`, `src/core/reconciliation/` |
| Bank-line deposit entries for stores without payout data (never pushed to QuickBooks) | built | `src/core/reconciliation/bank-line-deposits.ts` |
| Cash, delivery, tips and gift-card settlement | not built (clearing only for card payouts; the pages say so) | `docs/feature-map.md` 2.5 |

### Seeing the numbers

| Feature | Status | Proof |
| --- | --- | --- |
| Overview: the group's sales, labor and profit for the period; every store side by side (net revenue, labor %, COGS, net income; labor % amber or red over target); deposit exceptions; overtime panel | built | `/` (`?range=7d|30d|mtd|lastmonth|YYYY-MM`), `src/components/overview/`, `src/lib/ui/period.ts` |
| Store page: sales and labor % day by day with the target line; the store's P&L | built | `/stores/[storeId]` |
| Your numbers: seven views (sales, labor, prime cost, tickets, discounts and leakage, cash, franchisor fees), tiles, one chart, a by-store table with the period before and the change, every number's source | built | `/numbers?view=sales|labor|prime_cost|tickets|leakage|cash|fees`, `src/core/numbers/types.ts` |
| Month summary ("September at a glance"), also in the owner's email after the 2nd | built | `/numbers/month`, `src/core/month-summary/` |
| Daily synopsis (Basic and Trends) on the Overview and in the owner's email | built | `/synopsis`, `src/core/synopsis/`, `docs/plans/daily-synopsis-plan.md` |
| The owner's morning email: one line per store, worst first; data gaps, labor % against target, sales against the same weekday last week, over/short; overtime pace Thursdays and Fridays; Mondays last week | built (sends only with `EMAIL_API_KEY`) | `/setup/notifications`, `src/server/owner-email.ts`, `docs/email.md` |
| Data health: per store and day for 14 days whether sales, time cards, payouts and deposits are in, in words; a daily email to the founder when something is bad | built | `/health`, `src/core/health/`, `src/server/data-health.ts` |
| Exports to Excel and CSV (ledger, trial balance, journal lines, year-end package) with a formula-injection guard | built | `src/lib/export/` |
| Sales tax collected vs paid: filing periods per LLC, Mark filed, by month tied to 2210, reminders; Rhea never files | built | `/ledger/sales-tax`, `/setup/sales-tax`, `src/core/sales-tax/` |
| Year-end package per LLC and year: completeness verdict, trial balance with tax lines, P&L by month and store, schedules, "What Rhea doesn't know", one .xlsx and CSVs; four-column trial balance; TurboTax Desktop TXF (Schedule C LLCs; **untested in TurboTax**) | built | `/ledger/year-end`, `src/core/year-end/`, `docs/PICKUP.md` |
| 1099 preparation: vendors' 1099 choice, the year-end 1099 list, a TaxBandits bulk-upload CSV; Rhea never files and never stores a TIN (**the CSV's columns are unchecked against TaxBandits' template**) | built | `src/core/year-end/form-1099.ts`, `src/lib/export/taxbandits.ts`, `docs/PICKUP.md` |

### Bills and money out

| Feature | Status | Proof |
| --- | --- | --- |
| Vendors; bills by email, photo or typing; approvals (owner above a threshold); AP aging; payments matched to statement lines; what you owe by LLC | built | `/bills`, `/setup/vendors`, `/setup/bills`, `src/core/bills/`, `src/server/bills.ts` |
| Pay from Rhea: ACH from the LLC's bank through Stripe (Treasury for platforms) | **test mode**: `STRIPE_BILL_PAY_SECRET_KEY` test only; Stripe's Treasury application and a sandbox run are founder to-dos | `src/server/bill-pay.ts`, `src/integrations/payments/`, `docs/bill-pay.md`, `docs/PICKUP.md` "Waiting on the founder" |
| Card payments for bills through Melio | **pending** (Melio's Embedded Partnerships application) | `docs/PICKUP.md` Next 7 |
| Inventory | not built | `rhea-site/src/lib/pricing.ts` `INCLUDED_ROWS` "no inventory" |
| The Rhea Card (a card per store or manager) | not built, "planned product", "not available" | `rhea-site/src/app/page.tsx` `RheaCard` |

### Accounts, access, setup

| Feature | Status | Proof |
| --- | --- | --- |
| Sign-in with a second step: passkey (Face ID, Touch ID, Windows Hello, a security key), emailed code, or an authenticator app; "trust this device"; roles owner, bookkeeper, accountant, manager; invitations; unlimited users | built | `src/server/auth/`, `/setup/people`, `/account/two-step` |
| Setup interview (`/welcome`): stores and LLCs, business type (coffee, quick service, full service, salon, retail, other), how the team is paid, bills, approvals, accounts, payroll and tax questions, which parts of Rhea to show | built | `/welcome`, `src/server/setup-interview.ts`, `src/core/onboarding/` |
| Tailored workspace: owners see only the parts they chose (Labor, Bills, Statements, Compare, Year-end; Sales and profit by store and Data health always on) | built (PR #45 merged) | `src/core/workspace/parts.ts`, `/welcome/parts` |
| Business profiles: trade accounts and labels for coffee shops, quick service, full service, salons, retail | built | `src/core/profiles/`, `/setup/business` |
| Billing through Stripe (Setup → Billing: annual or monthly, Checkout, Customer Portal, invoices) | **test mode**: `STRIPE_ENVIRONMENT: test` on `render.yaml`; nothing charged | `/setup/billing`, `src/server/billing/`, `docs/billing.md` |
| Deletion requests (Setup → Your data) and the founder's per-organization delete | built | `/setup/data`, `src/server/deletion-requests.ts` |
| Every imported file kept encrypted for 400 days and linked to its entries; AES-256-GCM tokens; no Social Security numbers ever collected | built | `src/server/file-originals.ts`, `src/server/crypto.ts`, `CLAUDE.md` Security rules |
| Demo: a guided tour (12 steps) through the 15-store demo group; practice companies (a blank company, deleted after 2 hours, "Connect (pretend)" fills five weeks of sample data) | built, public at demo.rheafi.com | `src/core/tour/steps.ts`, `src/server/demo-sandbox.ts`, `/demo` |
| Royalty and ad-fund check, franchisor P&L in the brand's template, lender and landlord reports, store-manager logins, shared-cost allocation, reading costs back from QuickBooks | not built (the demo hard-codes a 6% royalty and 2% ad fund) | `docs/feature-map.md` tiers 2 and 3 |

### Production state

- app.rheafi.com is live, invite-only (`SIGN_UP_MODE=invite`), and **has no customers yet** (`docs/PICKUP.md`:
  "empty of customers so far"; `docs/handoff.md` Status: "demo and sandbox only. No real customer data has been
  loaded"). Never imply customers, usage numbers or results.
- demo.rheafi.com is the public demo: Maple Street Hospitality Group, 15 Sunrise Bagel Co. stores in Texas, each
  its own LLC, 60 days of generated data ending yesterday; four LLCs (stores 101, 103, 105 and 108, `DEMO_MONEY_STORE_NUMBERS` in
  `src/integrations/demo/money.ts`; 101 and 105 also have a business credit card) also have bank and card statements,
  bills and opening balances; every store has a year of budgets. The seed closes no month and saves no bookkeeper's
  report (nothing in `src/server/demo-seed-on-empty.ts` calls `closeMonth` or saves a `bookkeeper_reports` row), so
  Ledger → Month close shows months waiting and an audit log of the seed's own actions, and Compare shows the LLCs
  with no report yet. Stores 106 and 111 run high labor on purpose
  (`src/integrations/demo/stores.ts` `runsHotLabor`).
- The company: Grip Theory LLC, California; sales@rheafi.com, (707) 394-5086 (`rhea-site/src/lib/site.ts`).
- Rhea is **not tax software** and never files anything (sales tax, 1099s, income tax): it prepares lists,
  reports and files for the owner's CPA or filing service (`docs/PICKUP.md`, `src/core/sales-tax/`,
  `src/core/year-end/form-1099.ts`).

## Pricing, trial, guarantee and setup fee (exactly as rheafi.com states them)

Source: `rhea-site/src/lib/pricing.ts` and `rhea-site/src/app/pricing/page.tsx`, live on rheafi.com/pricing.
Every post that names a price uses these words and numbers and no others (pinned in `brand.json` `pricing`).

- **One plan, every feature at every size, priced per store a month, billed annually:**
  stores 1–3 **$149**, 4–10 **$139**, 11–20 **$129**, 21–30 **$119**; over 30 stores: "We'll quote".
  "Each store is priced in its band, like tax brackets, so adding a store never raises what your other stores
  cost. Five stores: 3 × $149 + 2 × $139 = $725 a month." (`PRICE_BANDS`, `billArithmetic`)
- **Billed monthly:** $20 more per store in every band (`MONTHLY_EXTRA`).
- **Trial:** "7-day free trial", at every size, no payment method needed (`PLAN.trialDays`, decided October 19, 2026).
- **Guarantee:** "60-day money-back guarantee: not for you in the first 60 days, and we refund your subscription in
  full" (`PLAN.guaranteeDays`). The guided setup fee is not refunded.
- **Optional guided setup:** "We believe Rhea is easy to set up yourself. If you'd rather we do it with you, guided
  setup is $199 + $49 a store, one time, paid when you subscribe." (`PLAN.setupFee`, confirmed October 20, 2026.)
- **Groups:** "From 4 stores, a named contact and annual invoices paid by bank transfer (ACH)" (`PLAN.groupFrom`).
- **Files:** "40 unfamiliar files read per store a month, shared across your stores, plus 50 more per store in your
  first 60 days"; extra files "in packs of 100 for $25" (`PLAN.filesPerStore`, `TOP_UP_PACK`).
- **Included at every size** (the pricing page's list): daily balanced books from each store's register; sales
  matched to bank deposits; labor % and overtime alerts by store; profit and loss for every store; a group P&L and
  month close across all your LLCs; month-end close checked against your bookkeeper's books; a morning email with
  each store's sales, labor % and over/short; unlimited users, with free seats for your bookkeeper and CPA; every
  file kept encrypted; exports to Excel and CSV; the same price with or without QuickBooks.
- **Stage:** "Rhea is in pilot. Pilots for groups of 4 or more stores are open now; one to three stores can start
  once self-serve sign-up opens." The home page's button is **Join the Waitlist**. No "sign up today".
- The site's FAQ still says "Rhea connects to Square and Clover" and puts Toast "on the roadmap"; the app also has
  Shopify, Toast's export and 7shifts (above). A post may say what the code does, and should prefer the site's
  framing where the two differ until the site catches up (a founder follow-up, not ours).

## Audience and their pains

Owners and operators of 5–30 locations (the pilot: "about 8–30 stores"): franchise groups (quick service, usually
one LLC per store), coffee shops, salons; sometimes full service and retail (`src/core/profiles/`). Their
bookkeeper and CPA stay (the FAQ: "Does Rhea replace my bookkeeper or CPA? No."). What hurts, from the plans and
`docs/feature-map.md`:

- the books lag weeks behind the register; labor % arrives with payroll, not daily;
- one LLC per store means fifteen sets of books and fifteen QuickBooks companies;
- stores on different POS systems after an acquisition;
- money that is not theirs in the deposit (sales tax, tips, gift cards), and card fees on it;
- card sales in transit, missing deposits, drawer over/short nobody reads;
- the month never closes, and nobody knows which store actually makes money;
- sales tax and 1099 deadlines handled from memory;
- spreadsheets and data entry.

## Words

**Say:** "automated books, labor and per-store profit for multi-store owners"; "Rhea's own ledger"; "balanced
entries"; "per store" and "by store"; "labor %"; "prime cost"; "sales tax is a liability"; "tips are a payable";
"with or without QuickBooks"; "sandbox", "test mode" and "off until" when that is the status; "sample data" /
"demo company, made-up numbers" for every screen; "Rhea reads it for you; you check a preview before anything is
saved" for unfamiliar files (the pricing page's words); "ask your CPA" on anything tax-adjacent; "Try the demo:
demo.rheafi.com"; "rheafi.com (link in bio)".

**Never:** the two-letter word for artificial intelligence (spelled here as "A-I" so the repo's own word scan stays
clean), in any form, and never "A-I accountant" (`CLAUDE.md`); "Claude" or "Anthropic" in a post (the demo tour's own
forbidden list, `src/core/tour/steps.ts`); "tax software", "files your taxes", "does your taxes"; customers,
customer counts, testimonials, quotes, "owners love"; any savings figure or "saves you $"; invented statistics
("most owners…", "the average store…"); "replaces your bookkeeper"; "live QuickBooks" or any suggestion a real
company has been written to; "pays your bills by card"; "payroll" as if Rhea ran it (it reads payroll totals);
"bank", "card" or "lend" as something Rhea is or does (Rhea is not a bank; the Rhea Card is not available);
"guaranteed" outside the exact 60-day wording; competitor names in any negative sense (and no competitor's brand
hashtag); "fake" (say "sample data"); "seamless", "leverage"; a price other than the pinned ones.

## Call to action

Primary: **Try the demo: demo.rheafi.com** (public, a guided tour, sample data; `/demo` offers "Look around" and
"Start a practice company"). Secondary: **rheafi.com (link in bio)**, where the button is Join the Waitlist and
the pricing is public. Never "sign up today" (production is invite-only), never "DM us for a quote".

## Which demo screens show each feature

All on the local app for recording (`FEATURE_RECORDING` in README: port 3600, demo data) or demo.rheafi.com.
Paths are the app's; the period picker is `?range=7d|30d|mtd|lastmonth|YYYY-MM` on the pages that have it.
Everything shown is the demo group's sample data; every feature Reel carries "Demo company · made-up numbers".

| Feature Reel | Screen | What to show | Demo data needed |
| --- | --- | --- | --- |
| overview-stores | `/?range=30d` | the group KPIs, then the store table: labor % amber/red on 106 and 111 | the seed |
| store-days | `/stores/store-106?range=30d` | the daily sales and labor % chart with the target line, then the store P&L | the seed |
| labor-overtime | `/labor` | "heading for overtime" (names and hours), the store table | the seed |
| ledger-entry | `/ledger`, then one `daily_sales` entry | the entry list, one balanced entry's lines and its source | the seed |
| deposits | `/deposits` | card days with no deposit first, then deposits with variances | the seed (planted anomalies: `demoAnomalies`) |
| data-health | `/health` | problems first, the 14-day grid in words | the seed |
| your-numbers | `/numbers?view=labor`, `?view=prime_cost`, `?view=tickets` | tiles, the chart, the by-store table with the change | the seed |
| synopsis | `/synopsis` | the day's synopsis lines, Basic and Trends | the seed (`computeDailySynopsis` runs in the seed) |
| month-close | `/ledger/close` | months to close with their checklists, corrections waiting, the audit log | the seed (it closes no month: show "Months to close" and the checklist, not a closed one) |
| compare-bookkeeper | `/ledger/compare`, then one LLC-month | the by-month table, the month's checklist and rollforward | the seed saves no bookkeeper report, so the difference report is empty: show the page as the place the bookkeeper's P&L lands ("drop your bookkeeper's P&L on Import"), or record the rollforward and trial balance tabs instead |
| statements-reconcile (optional, 2nd pass) | `/statements`, `/statements/reconcile` | lines booked themselves, "Looks right / Undo", the reconciliation | the four money LLCs |
| bills (optional) | `/bills` | bills waiting, approvals, AP aging; a paid bill's lines and its matched payment. Never the bill page's Pay from Rhea card (test mode; a bill waiting for approval shows it on its first screen) | the four money LLCs |
| year-end (optional) | `/ledger/year-end` | the completeness verdict, the sections, the downloads | the seed (year to date) |
| import (optional) | `/import` | the drop zone, a template preview (no Claude call) | a Rhea template CSV from `samples/templates/` |
| connections (optional) | `/connections` | the cards; "test accounts, never a real store's" | none |
| budgets (optional) | `/setup/budgets` and the Overview's pace words | the switch, a store's year | the seed |
| sales-tax (optional) | `/ledger/sales-tax` | filing periods, by month tied to 2210. Never the notes card under By store: its first line says the return "takes ten minutes instead of an hour" (`src/core/sales-tax/settings.ts` `SALES_TAX_PROMISE`, also on Setup → Sales tax), a savings figure posts never make | periods come from the daily task `sales-tax-periods`: check the demo has them; otherwise skip |
| balance-sheet (optional) | `/ledger/balance-sheet` | a money LLC's balance sheet tying to the reconciliation | the four money LLCs |

Rules for every recording (the recorder enforces the text ones: `NEVER_IN_VIEW` in `render/record-feature.mjs`
and each scene file's `avoid`): nothing on screen that a post may not say, such as Pay from Rhea (test mode) or
the app's own time-savings line; the demo viewer or demo owner only (never production, never a practice company with a
visitor's data); dismiss the tour card first (Escape, or `localStorage` key `rhea.tour.v1`); never show the Admin
page, Setup → People's email addresses, Setup → Billing, or an address bar; the on-screen period must be a whole
one the data covers (the seed covers 60 days ending yesterday, so `30d` and `lastmonth` are safe).

## Running the app locally for recording

From `docs/PICKUP.md`, `.env.example`, `scripts/seed-demo.ts` and `src/server/demo-accounts.ts`:

```sh
cd /Users/alex/Desktop/rhea
npm ci && npm run build
# A throwaway database folder (never .data/pglite). The seed needs RHEA_ENCRYPTION_KEY, which .env.local has.
# The viewer behind "Enter the demo" needs both variables (12+ characters); make the values up for this session
# only, keep them out of the repo and the chat.
DATABASE_DIR=.data/e2e-social DEMO_OWNER_PASSWORD='<local throwaway>' \
DEMO_VIEWER_EMAIL=visitor@demo.rheafi.com DEMO_VIEWER_PASSWORD='<local throwaway>' npm run seed:demo
DATABASE_DIR=.data/e2e-social APP_URL=http://localhost:3600 \
DEMO_VIEWER_EMAIL=visitor@demo.rheafi.com DEMO_VIEWER_PASSWORD='<the same>' npx next start -H localhost -p 3600
# afterwards: stop it and rm -rf .data/e2e-social
```

Notes: `APP_PASSWORD` no longer exists (sign-in replaced it); `RHEA_ENV` stays unset on a laptop, which allows demo
data and refuses production vendor keys; `DEMO_SEED_ON_EMPTY=true` also fills an empty database at first start, but
then the owner's password is made up and never shown, so seed with `npm run seed:demo` and a password you chose.
Explicit variables win over `.env.local` (Node's `--env-file` and Next's env loader never override a set variable).
On a laptop the second sign-in step is optional (`src/server/auth/session.ts`), and the demo viewer is excused from it.
The viewer is read-only, which is all a recording needs.

**Corrected after recording (October 20, 2026):** the recipe above is incomplete. `npm run build` and
`next start` also need a throwaway `BETTER_AUTH_SECRET` (32+ characters; the build refuses to prerender without it),
and the "Look around the demo company" button, with the viewer's exemption from the second sign-in step, exists only
with `RHEA_ENV=demo`. The recipe that worked is in README.md, "Feature Reels: recording and composing", under
"Running the app".
