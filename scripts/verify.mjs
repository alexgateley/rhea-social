#!/usr/bin/env node
// Checks a run of Owner math content before anything is rendered or posted:
//
//   node scripts/verify.mjs                 # every content/*.json
//   node scripts/verify.mjs --month 2026-10 # one file
//
// For every post it recomputes each worked step and the result from the post's inputs, using the
// per-slug formulas below (`COMPUTE`), and compares the formatted strings to the content file
// character for character. It also checks the numbers quoted in the takeaway and caption, the
// schedule (weekdays only, in order, no duplicates), the hook and takeaway lengths, the theme
// (one of brand.json's, all of which must meet WCAG AA), the caption's first line (a plain-English
// keyword sentence naming the audience, no hashtags), the hashtags (3 to 5 from the post's set,
// A on even-numbered posts and B on odd, plus the brand tag), the cover frame offset against
// render/timing.mjs, and that the word "AI" appears nowhere. A content file is named for the month its first post falls in
// (content/2026-10.json); its run may continue into the next month. Exits non-zero when any file
// has a problem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { usd, pct1, num, parseInput, round } from './format.mjs';
import { checkThemes } from './contrast.mjs';
import { timing } from '../render/timing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand.json'), 'utf8'));

const MAX_HOOK_WORDS = 9;
const MONEY = /\$\d{1,3}(?:,\d{3})*(?:\.\d+)?(?![\d,]\d)/g;
const MAX_TAKEAWAY_WORDS = 18;
const words = (s) => s.trim().split(/\s+/).length;

// ---------------------------------------------------------------------------------------------
// The formulas. `i` holds the post's inputs parsed to numbers (percentages and cents as fractions:
// "7.65%" → 0.0765, "10¢" → 0.10). Each returns the step values and the result in display form,
// plus the numbers that the takeaway and caption must quote.
// ---------------------------------------------------------------------------------------------
const COMPUTE = {
  'labor-percent': (i) => {
    const wages = i['Wages this week'], sales = i['Net sales this week'];
    const ratio = wages / sales;
    return {
      steps: [usd(wages), usd(sales), num(ratio, 3)],
      result: pct1(ratio),
      takeaway: [usd(0.01 * sales)],
      caption: [usd(wages), usd(sales), pct1(ratio), usd(0.01 * sales)],
    };
  },

  'loaded-labor': (i) => {
    const wages = i['Wages this week'], rate = i['Employer payroll tax'], sales = i['Net sales this week'];
    const tax = round(wages * rate, 2);
    const loaded = wages + tax;
    return {
      steps: [usd(wages), usd(tax), usd(loaded), pct1(wages / sales)],
      result: pct1(loaded / sales),
      takeaway: [`${num(rate * 100, 2)}%`],
      caption: [usd(wages), usd(loaded), usd(sales), pct1(loaded / sales), pct1(wages / sales)],
    };
  },

  'sales-per-labor-hour': (i) => {
    const sales = i['Net sales this week'], hours = i['Hours worked this week'], wages = i['Wages this week'];
    const splh = round(sales / hours, 2);
    const wage = round(wages / hours, 2);
    return {
      steps: [usd(sales), `${num(hours)} h`, usd(wage)],
      result: usd(splh),
      // The identity labor % = average wage ÷ SPLH, on the displayed (rounded) figures
      takeaway: [usd(wage), usd(splh), pct1(wage / splh)],
      caption: [usd(sales), num(hours), usd(splh), usd(wage), pct1(wage / splh)],
    };
  },

  'one-labor-point': (i) => {
    const sales = i['Annual net sales'], point = i['One point'], wage = i['Average wage'], stores = i['Stores'], days = i['Days in a year'];
    const year = sales * point;
    const perDay = round(year / days, 2);
    const hours = round(perDay / wage, 1);
    return {
      steps: [usd(sales), `${num(point * 100)}% of sales`, usd(perDay), `${hours.toFixed(1)} hours a day`],
      result: usd(year),
      takeaway: [num(stores), usd(year * stores)],
      caption: [usd(sales), usd(year), usd(perDay), `${hours.toFixed(1)} hours`, usd(wage), usd(year * stores)],
    };
  },

  'overtime-week': (i) => {
    const wage = i['Hourly wage'], hours = i['Overtime hours this week'], ot = i['Overtime rate'], tax = i['Employer payroll tax'], weeks = i['Weeks in a year'];
    const otPay = hours * wage * ot;
    const straight = hours * wage;
    const premium = otPay - straight;
    const premiumLoaded = round(premium * (1 + tax), 2);
    const otLoaded = round(otPay * (1 + tax), 2);
    const straightLoaded = round(straight * (1 + tax), 2);
    return {
      steps: [usd(otPay, { cents: 'always' }), usd(straight, { cents: 'always' }), usd(premium, { cents: 'always' }), usd(premiumLoaded)],
      result: usd(otLoaded),
      takeaway: [usd(premiumLoaded * weeks)],
      caption: [usd(otPay), usd(otLoaded), usd(straightLoaded), usd(premiumLoaded), usd(premiumLoaded * weeks)],
    };
  },

  'food-cost-vs-cogs': (i) => {
    const sales = i['Net sales this month'], food = i['Food used'], paper = i['Paper and packaging used'];
    const cogs = food + paper;
    return {
      steps: [pct1(food / sales), pct1(paper / sales), usd(cogs)],
      result: pct1(cogs / sales),
      takeaway: [usd(paper)],
      caption: [usd(food), usd(sales), pct1(food / sales), usd(paper), usd(cogs), pct1(cogs / sales)],
    };
  },

  'prime-cost': (i) => {
    const sales = i['Net sales this month'], cogs = i['COGS'], labor = i['Fully loaded labor'], rule = i['Rule of thumb'];
    const prime = cogs + labor;
    const over = prime / sales - rule;
    return {
      steps: [pct1(cogs / sales), pct1(labor / sales), usd(prime)],
      result: pct1(prime / sales),
      takeaway: [`${num(rule * 100)}%`, `${num(over * 100, 1)} points`, usd(over * sales)],
      caption: [usd(cogs), usd(labor), usd(prime), usd(sales), pct1(prime / sales), usd(over * sales)],
    };
  },

  'rent-percent': (i) => {
    const rent = i['Monthly rent with CAM'], sales = i['Net sales this month'], slow = i['A slower month'], rule = i['Rule of thumb'];
    const line = rent / rule;
    return {
      steps: [usd(rent), usd(sales), pct1(rent / slow), usd(line)],
      result: pct1(rent / sales),
      takeaway: [`${num(rule * 100)}%`, usd(line)],
      caption: [usd(rent), usd(sales), pct1(rent / sales), usd(slow), pct1(rent / slow), usd(line)],
    };
  },

  'royalty-ad-fund': (i) => {
    const sales = i['Sales this month'], royalty = i['Royalty'], ad = i['Ad fund'], days = i['Days in the month'];
    const r = sales * royalty, a = sales * ad, total = r + a;
    return {
      steps: [usd(r), usd(a), usd(total / days), usd(total * 12)],
      result: usd(total),
      takeaway: [`${num((1 - royalty - ad) * 100)}%`],
      caption: [usd(sales), usd(total), usd(total / days), usd(total * 12)],
    };
  },

  'break-even': (i) => {
    const fixed = i['Fixed costs per month'], variable = i['Variable costs'], sales = i['Sales this month'], days = i['Days in the month'];
    const margin = 1 - variable;
    const beMonth = fixed / margin;
    const avgDay = sales / days;
    const beDay = Math.ceil(beMonth / avgDay);
    return {
      steps: [pct1(margin), usd(beMonth, { cents: 'never' }), usd(avgDay, { cents: 'never' }), `day ${beDay}`],
      result: usd(beMonth / days, { cents: 'never' }),
      takeaway: [`${num(margin * 100)}¢`],
      caption: [usd(fixed), `${num(margin * 100)}%`, usd(beMonth, { cents: 'never' }), usd(beMonth / days, { cents: 'never' }), usd(avgDay, { cents: 'never' }), `day ${beDay}`, `${num(margin * 100)}¢`],
    };
  },

  'sales-tax-not-revenue': (i) => {
    const totals = i['Register totals this month'], rate = i['Sales tax rate'], days = i['Days in the month'];
    const net = totals / (1 + rate);
    const tax = totals - net;
    return {
      steps: [usd(totals), usd(net), usd(tax / days)],
      result: usd(tax),
      takeaway: [`${num(rate * 100, 2)}%`],
      caption: [usd(totals), `${num(rate * 100, 2)}%`, usd(net), usd(tax)],
    };
  },

  'tips-not-sales': (i) => {
    const tips = i['Card tips this month'], sales = i['Net sales this month'], tax = i['Employer payroll tax on tips'], fee = i['Card fee'];
    const t = round(tips * tax, 2), f = round(tips * fee, 2);
    return {
      steps: [usd(tips), pct1(tips / sales), usd(t), usd(f, { cents: 'always' })],
      result: usd(t + f),
      takeaway: [],
      caption: [usd(tips), usd(0), usd(t), usd(f, { cents: 'always' }), usd(t + f)],
    };
  },

  'gift-card-liability': (i) => {
    const sold = i['Gift cards sold in December'], dec = i['Redeemed in December'], jan = i['Redeemed in January'], opening = i['Opening balance'];
    const owed = opening + sold - dec;
    return {
      steps: [usd(sold), usd(dec), usd(jan)],
      result: usd(owed),
      takeaway: [usd(owed - jan)],
      caption: [usd(sold), usd(dec), usd(owed), usd(jan), usd(owed - jan)],
    };
  },

  'card-fees': (i) => {
    const sales = i['Card sales this month'], rate = i['Percentage rate'], fee = i['Per-transaction fee'], txns = i['Card transactions'];
    const pctFee = sales * rate, perTxn = txns * fee, total = pctFee + perTxn;
    return {
      steps: [usd(pctFee), usd(perTxn), usd(total), usd(sales / txns)],
      result: pct1(total / sales),
      takeaway: [],
      caption: [usd(sales), usd(pctFee), num(txns), usd(perTxn), usd(total), pct1(total / sales), usd(sales / txns), pct1(perTxn / total)],
    };
  },

  'blended-card-rate': (i) => {
    const sales = i['Card sales per store per year'], a = i['Current blended rate'], b = i['Negotiated rate'], stores = i['Stores'];
    const feeA = sales * a, feeB = sales * b, diff = feeA - feeB;
    return {
      steps: [usd(feeA), usd(feeB), usd(diff / 12)],
      result: usd(diff),
      takeaway: [num(stores), usd(diff * stores)],
      caption: [usd(sales), usd(feeA), usd(feeB), usd(diff), usd(diff / 12), num(stores), usd(diff * stores)],
    };
  },

  'card-sales-in-transit': (i) => {
    const perDay = i['Card sales per day'], stores = i['Stores'];
    // Next-business-day funding: Mon–Thu wait 1 day each, Friday 3, Saturday 2, Sunday 1 = 10 store-days a week
    const waits = [1, 1, 1, 1, 3, 2, 1];
    const weekendDays = 3;
    const avgWait = waits.reduce((s, d) => s + d, 0) / waits.length;
    const sunday = perDay * weekendDays;
    return {
      steps: [usd(perDay), `${weekendDays} days`, `${num(avgWait, 1)} days`],
      result: usd(sunday),
      takeaway: [num(stores), usd(sunday * stores)],
      caption: [usd(perDay), usd(sunday), usd(sunday * stores), num(stores), `${num(avgWait, 1)} days`],
    };
  },

  'missing-deposit': (i) => {
    const amount = i['Missing deposit'], rate = i['Line of credit rate'], days = i['Days until found'], margin = i['Net margin'];
    const interest = amount * rate * days / 365;
    return {
      steps: [usd(interest), usd(amount), pct1(margin)],
      result: usd(amount / margin),
      takeaway: [],
      caption: [usd(amount), num(days), usd(interest), `${num(rate * 100)}%`, `${num(margin * 100)}%`, usd(amount / margin)],
    };
  },

  'cash-over-short': (i) => {
    const sales = i['Net sales this month'], share = i['Cash share of sales'], rule = i['Rule of thumb'], days = i['Days in the month'];
    const cash = sales * share;
    const perDay = cash / days;
    return {
      steps: [usd(cash), usd(perDay), usd(perDay * rule)],
      result: usd(cash * rule),
      takeaway: [`${num(rule * 100, 1)}%`],
      caption: [`${num(share * 100)}%`, usd(sales), usd(cash), usd(perDay), `${num(rule * 100, 1)}%`, usd(perDay * rule), usd(cash * rule)],
    };
  },

  'ticket-times-transactions': (i) => {
    const ticket = i['Average ticket'], txns = i['Transactions per day'], lift = i['Ticket lift'], traffic = i['Traffic lift'], days = i['Days in a year'];
    const day = ticket * txns;
    const moreTicket = (ticket + lift) * txns - day;
    const moreTraffic = ticket * (txns + traffic) - day;
    return {
      steps: [`${usd(day)} a day`, `${usd(moreTicket, { sign: true })} a day`, `${usd(moreTraffic, { sign: true })} a day`],
      result: usd(moreTicket * days),
      takeaway: [],
      caption: [usd(ticket), num(txns), usd(day), usd(moreTicket), num(traffic), usd(moreTraffic), usd(moreTicket * days)],
    };
  },

  'four-wall-profit': (i) => {
    const sales = i['Annual net sales'], margin = i['Four-wall margin'], points = i['Labor improvement'];
    const profit = sales * margin;
    const add = sales * points / 100;
    return {
      steps: [usd(profit), usd(add), usd(profit + add)],
      result: pct1(add / profit, { sign: true }),
      takeaway: [pct1(margin), `${num(add / profit * 100)}%`],
      caption: [usd(sales), pct1(margin), usd(profit), usd(add), usd(profit + add), pct1(add / profit)],
    };
  },
};

// ---------------------------------------------------------------------------------------------

const isWeekday = (iso) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d >= 1 && d <= 5; };
const isDate = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`));

function verifyMonth(file) {
  const content = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = [];
  const say = (post, msg) => problems.push(`${post ? post.slug + ': ' : ''}${msg}`);

  const posts = content.posts ?? [];
  if (!Array.isArray(posts) || posts.length === 0) say(null, 'no posts');

  // Schedule: a run starts in the month the file is named for and continues on weekdays, in
  // order, possibly into the next month (a run that starts mid-month ends mid-month)
  const fileMonth = path.basename(file, '.json');
  if (content.month !== fileMonth) say(null, `"month" is ${content.month}; the file is ${fileMonth}.json`);
  const seenDates = new Set(), seenSlugs = new Set();
  let previous = '';
  for (const p of posts) {
    if (!isDate(p.date ?? '')) say(p, `date "${p.date}" is not YYYY-MM-DD`);
    else {
      if (!isWeekday(p.date)) say(p, `${p.date} is a weekend day`);
      if (p.date < `${fileMonth}-01`) say(p, `${p.date} is before ${fileMonth}`);
      if (previous && p.date <= previous) say(p, `${p.date} is not after the previous post (${previous})`);
      previous = p.date;
    }
    if (seenDates.has(p.date)) say(p, `${p.date} is used twice`);
    if (seenSlugs.has(p.slug)) say(p, 'slug is used twice');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug ?? '')) say(p, `slug "${p.slug}" is not lowercase words joined by hyphens`);
    seenDates.add(p.date); seenSlugs.add(p.slug);
  }
  if (posts.length && posts[0].date && posts[0].date.slice(0, 7) !== fileMonth) say(null, `the first post is dated ${posts[0].date}; the file is named for ${fileMonth}`);

  for (const p of posts) {
    for (const key of ['date', 'slug', 'theme', 'hook', 'term', 'formula', 'inputs', 'steps', 'result', 'takeaway', 'caption', 'hashtags', 'thumbOffsetMs']) {
      if (p[key] === undefined || p[key] === '') say(p, `missing ${key}`);
    }
    if (words(p.hook ?? '') > MAX_HOOK_WORDS) say(p, `hook has ${words(p.hook)} words (max ${MAX_HOOK_WORDS})`);
    if (!/[?.!]$/.test(p.hook ?? '')) say(p, 'hook should end with ?, . or !');
    if (words(p.takeaway ?? '') > MAX_TAKEAWAY_WORDS) say(p, `takeaway has ${words(p.takeaway)} words (max ${MAX_TAKEAWAY_WORDS})`);
    if (!brand.themes[p.theme]) say(p, `theme "${p.theme}" is not one of ${Object.keys(brand.themes).join(', ')}`);

    // Caption: a keyword sentence first (what people search: the topic and the audience, no
    // hashtags), then 2 to 4 short lines restating the number
    const captionLines = (p.caption ?? '').split('\n').filter((l) => l.trim());
    if (captionLines.length < 3 || captionLines.length > 5) say(p, `caption has ${captionLines.length} lines (a keyword line plus 2 to 4)`);
    const first = captionLines[0] ?? '';
    if (first.includes('#')) say(p, 'the caption\'s first line must be plain English, no hashtags');
    if (words(first) < 8) say(p, 'the caption\'s first line should be a full keyword sentence (8+ words)');
    if (!brand.captionKeywords.some((k) => first.toLowerCase().includes(k))) say(p, `the caption's first line should name the audience (${brand.captionKeywords.join(', ')})`);
    if (!/\b(owners?|operators?)\b/i.test(first)) say(p, 'the caption\'s first line should say who it is for (owners / operators)');
    if (!/[.!?]$/.test(first.trim())) say(p, 'the caption\'s first line should end with a period');

    // Hashtags: 3 to 5 from the post's set (A on even-numbered posts, B on odd) plus the brand tag
    const n = posts.indexOf(p) + 1;
    const setName = n % 2 === 0 ? 'A' : 'B';
    const set = brand.hashtagSets[setName];
    const otherSet = brand.hashtagSets[setName === 'A' ? 'B' : 'A'];
    const tags = Array.isArray(p.hashtags) ? p.hashtags : [];
    const brandTags = tags.filter((h) => h.toLowerCase() === brand.brandHashtag.toLowerCase());
    const topicTags = tags.filter((h) => h.toLowerCase() !== brand.brandHashtag.toLowerCase());
    if (brandTags.length !== 1) say(p, `needs the brand tag ${brand.brandHashtag} exactly once`);
    if (topicTags.length < 3 || topicTags.length > 5) say(p, `has ${topicTags.length} topic hashtags (3 to 5, from set ${setName})`);
    for (const h of topicTags) {
      if (otherSet.includes(h)) say(p, `hashtag ${h} is from set ${setName === 'A' ? 'B' : 'A'}; post ${n} uses set ${setName}`);
      else if (!set.includes(h)) say(p, `hashtag ${h} is not in set ${setName} (brand.json hashtagSets)`);
    }
    if (new Set(tags.map((h) => h.toLowerCase())).size !== tags.length) say(p, 'repeated hashtag');
    if (/#(ownermath|restaurantmath)\b/i.test(tags.join(' '))) say(p, '#ownermath and #restaurantmath are retired (no audience)');
    if (!Array.isArray(p.steps) || p.steps.length < 3 || p.steps.length > 5) say(p, `has ${p.steps?.length ?? 0} steps (3 to 5)`);

    // Never the word "AI", anywhere in the post
    const text = JSON.stringify(p);
    if (/\bAI\b/.test(text)) say(p, 'contains the word "AI"');

    // Cover frame: where the result is fully shown, per render/timing.mjs
    try {
      const t = timing(p);
      if (p.thumbOffsetMs !== t.thumbOffsetMs) say(p, `thumbOffsetMs is ${p.thumbOffsetMs}; the result is fully shown at ${t.thumbOffsetMs} (${p.steps.length} steps)`);
      if (t.duration < 22 || t.duration > 26) say(p, `duration ${t.duration}s is outside 22–26 s`);
    } catch (e) { say(p, e.message); }

    // The arithmetic
    const compute = COMPUTE[p.slug];
    if (!compute) { say(p, 'no formula in verify.mjs (add it to COMPUTE)'); continue; }
    let inputs;
    try {
      inputs = Object.fromEntries(Object.entries(p.inputs).map(([k, v]) => [k, parseInput(v)]));
    } catch (e) { say(p, e.message); continue; }
    let expected;
    try { expected = compute(inputs); } catch (e) { say(p, `formula threw: ${e.message}`); continue; }
    if (expected.steps.length !== p.steps.length) say(p, `formula yields ${expected.steps.length} steps, content has ${p.steps.length}`);
    expected.steps.forEach((v, k) => {
      if (p.steps[k] && p.steps[k].value !== v) say(p, `step ${k + 1} "${p.steps[k].label}" is "${p.steps[k].value}", computed "${v}"`);
    });
    if (p.result.value !== expected.result) say(p, `result is "${p.result.value}", computed "${expected.result}"`);
    for (const s of expected.takeaway) if (!p.takeaway.includes(s)) say(p, `takeaway should quote ${s}`);
    for (const s of expected.caption) if (!p.caption.includes(s)) say(p, `caption should quote ${s}`);
    // Every number the takeaway or caption quotes with a $ sign must be one the formula produced
    const allowed = new Set([...expected.steps, expected.result, ...expected.takeaway, ...expected.caption, ...Object.values(p.inputs)].flatMap((s) => String(s).match(MONEY) ?? []));
    for (const field of ['takeaway', 'caption', 'hook']) {
      for (const m of (p[field] ?? '').match(MONEY) ?? []) {
        if (!allowed.has(m)) say(p, `${field} quotes ${m}, which no formula or input produces`);
      }
    }
  }

  return { content, problems };
}

const args = process.argv.slice(2);
const monthArg = args.includes('--month') ? args[args.indexOf('--month') + 1] : null;
const dir = path.join(root, 'content');
const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f) && (!monthArg || f === `${monthArg}.json`)).sort();
if (files.length === 0) { console.error(`No content file${monthArg ? ` for ${monthArg}` : ''} in content/`); process.exit(1); }

// The word "AI" is banned in product copy; check the repo's prose too
for (const f of ['README.md', 'render/template.html', 'brand.json']) {
  const file = path.join(root, f);
  if (fs.existsSync(file) && /\bAI\b/.test(fs.readFileSync(file, 'utf8'))) { console.error(`${f} contains the word "AI"`); process.exit(1); }
}

// Every theme must meet WCAG AA (body 4.5:1, large text 3:1) before any card uses it
const low = checkThemes(brand.themes).filter((r) => !r.ok);
if (low.length) {
  for (const r of low) console.error(`brand.json theme "${r.theme}": ${r.label} is ${r.ratio.toFixed(2)}:1 (${r.fg} on ${r.bg}), needs ${r.min}:1`);
  process.exit(1);
}
console.log(`brand.json: ${Object.keys(brand.themes).length} themes meet WCAG AA (node scripts/contrast.mjs for the ratios).`);

let failed = false;
for (const f of files) {
  const { content, problems } = verifyMonth(path.join(dir, f));
  const n = content.posts?.length ?? 0;
  if (problems.length) {
    failed = true;
    console.error(`${f}: ${problems.length} problem${problems.length === 1 ? '' : 's'} in ${n} posts`);
    for (const p of problems) console.error(`  - ${p}`);
  } else {
    const first = content.posts[0]?.date, last = content.posts[n - 1]?.date;
    console.log(`${f}: ${n} posts verified (${first} to ${last}, weekdays); every step and result recomputes.`);
  }
}
process.exit(failed ? 1 : 0);
