// The formulas behind every figure on a card or in a caption, one entry per post slug. verify.mjs
// recomputes each post from its inputs with these and compares the strings character for character.
//
// `i` holds the post's inputs parsed to numbers (percentages and cents as fractions: "7.65%" →
// 0.0765, "10¢" → 0.10; "520 h" → 520). An owner-math entry returns
//   steps     the step values, in order
//   result    the result value
//   takeaway  strings the takeaway must quote
//   caption   strings the caption must quote
//   quotes    (optional) further figures the post may quote anywhere
// A tip or myth that quotes a figure has an entry too, returning { quotes } (and optionally
// takeaway and caption, which must then appear). No $, % or ¢ figure ships unless it is an input,
// one of these strings, or a pinned price in brand.json.
import { usd, pct1, num, round, cents } from './format.mjs';

export const COMPUTE = {
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
      quotes: [`${num((food / sales) * 100)}%`], // the hook: Food cost 28%?
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
      quotes: [cents(prime / sales)], // the hook: 63.5¢ of every dollar
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
      quotes: [`${num((royalty + ad) * 100)}%`], // the hook: 8% off the top
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
      quotes: ['100%'], // step 1: Contribution margin: 100% − 62%
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
      quotes: [`${num((a - b) * 100, 1)}%`], // the hook: 0.6% sounds small
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
      quotes: [usd(ticket + lift)], // step 2: $12.90 × 380
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
      quotes: [`${num(points)}%`], // step 2: One labor point: 1% × sales
    };
  },

  // ---------------------------------------------------------------------------------------------
  // Owner math, November 13–30, 2026
  // ---------------------------------------------------------------------------------------------

  'labor-hours-budget': (i) => {
    const sales = i['Forecast sales next week'], target = i['Labor % target'], wage = i['Average wage'], days = i['Days open'];
    const dollars = sales * target;
    const hours = dollars / wage;
    const perDay = hours / days;
    return {
      steps: [usd(dollars), `${num(hours)} h`, `${num(perDay, 1)} h`],
      result: `${num(hours)} h`,
      takeaway: [`${num(hours)} hours`],
      caption: [`${num(target * 100)}%`, usd(sales), usd(dollars), usd(wage), `${num(hours)} hours`, num(perDay, 1)],
    };
  },

  'discount-rate': (i) => {
    const gross = i['Gross sales this month'], disc = i['Discounts this month'], days = i['Days in the month'], months = i['Months in a year'];
    const perDay = disc / days;
    return {
      steps: [usd(disc), usd(gross), usd(perDay)],
      result: pct1(disc / gross),
      takeaway: [usd(perDay), usd(disc * months)],
      caption: [usd(disc), usd(gross), pct1(disc / gross), usd(perDay), usd(disc * months)],
    };
  },

  'delivery-commission': (i) => {
    const sales = i['Delivery app sales this month'], rate = i['Commission rate'], food = i['Food and packaging cost'];
    const commission = sales * rate, foodCost = sales * food, left = sales - commission - foodCost;
    return {
      steps: [usd(commission), usd(foodCost), usd(left)],
      result: pct1(left / sales),
      takeaway: [pct1(1 - food), `${num(rate * 100)}%`],
      caption: [usd(sales), `${num(rate * 100)}%`, usd(commission), `${num(food * 100)}%`, usd(left), pct1(left / sales), pct1(1 - food)],
    };
  },

  'minimum-crew': (i) => {
    const crew = i['Minimum crew'], open = i['Hours open'], wage = i['Average wage'], busy = i['Busy day sales'], slow = i['Slow day sales'];
    const hours = crew * open, cost = hours * wage;
    return {
      steps: [`${num(hours)} h`, usd(cost), pct1(cost / busy)],
      result: pct1(cost / slow),
      takeaway: [],
      caption: [usd(wage), usd(cost), usd(busy), pct1(cost / busy), usd(slow), pct1(cost / slow)],
    };
  },

  'fees-on-tax-and-tips': (i) => {
    const sales = i['Card net sales this month'], taxRate = i['Sales tax rate'], tips = i['Card tips this month'], fee = i['Card fee rate'], months = i['Months in a year'];
    const tax = round(sales * taxRate, 2);
    const base = tax + tips;
    const monthly = round(base * fee, 2);
    return {
      steps: [usd(tax), usd(tips), usd(base)],
      result: usd(monthly, { cents: 'always' }),
      takeaway: [usd(monthly * months, { cents: 'always' })],
      caption: [usd(sales), usd(tax), `${num(taxRate * 100, 2)}%`, usd(tips), `${num(fee * 100, 1)}%`, usd(monthly, { cents: 'always' }), usd(monthly * months, { cents: 'always' })],
    };
  },

  'wage-increase-price': (i) => {
    const raise = i['Raise per hour'], hours = i['Hours a week'], tax = i['Employer payroll tax'], sales = i['Sales a week'], weeks = i['Weeks in a year'];
    const extra = raise * hours;
    const loaded = round(extra * (1 + tax), 2);
    const ratio = loaded / sales;
    return {
      steps: [usd(extra), usd(loaded), num(ratio, 3)],
      result: pct1(ratio),
      takeaway: [usd(loaded * weeks, { cents: 'never' })],
      caption: [usd(raise), usd(extra), usd(loaded), `${num(tax * 100, 2)}%`, usd(sales), pct1(ratio), usd(loaded * weeks, { cents: 'never' })],
    };
  },

  'holiday-traffic-hours': (i) => {
    const sales = i['Normal week sales'], lift = i['Holiday week lift'], splh = i['Sales per labor hour target'];
    const normal = round(sales / splh, 1);
    const holidaySales = sales * (1 + lift);
    const holiday = round(holidaySales / splh, 1);
    return {
      steps: [`${num(normal, 1)} h`, usd(holidaySales), `${num(holiday, 1)} h`],
      result: `${num(holiday - normal, 1)} h`,
      takeaway: [usd(splh)],
      caption: [usd(sales), usd(splh), `${num(normal, 1)} hours`, `${num(lift * 100)}%`, usd(holidaySales), `${num(holiday, 1)} hours`, `${num(holiday - normal, 1)} more hours`],
    };
  },

  'loaded-hourly-cost': (i) => {
    const wage = i['Hourly wage'], taxRate = i['Employer payroll tax'], compRate = i["Workers' comp rate"], benefits = i['Benefits per hour'];
    const tax = round(wage * taxRate, 2), comp = round(wage * compRate, 2);
    const loaded = round(wage + tax + comp + benefits, 2);
    return {
      steps: [usd(tax), usd(comp), usd(benefits)],
      result: usd(loaded),
      takeaway: [pct1(loaded / wage - 1), usd(loaded), usd(wage)],
      caption: [usd(wage), usd(tax), usd(comp), usd(benefits), usd(loaded), pct1(loaded / wage - 1)],
    };
  },

  'cash-in-the-safe': (i) => {
    const perDay = i['Cash sales a day'], days = i['Days between bank deposits'], stores = i['Stores'];
    const safe = perDay * days;
    return {
      steps: [usd(perDay), usd(safe), usd(perDay * stores)],
      result: usd(safe * stores),
      takeaway: [usd(perDay * stores)],
      caption: [usd(perDay), usd(safe), usd(safe * stores), usd(perDay * stores)],
    };
  },

  'closed-day-cost': (i) => {
    const fixed = i['Fixed costs per month'], days = i['Days in the month'], sales = i["Average day's sales"], margin = i['Margin after food, paper and hourly labor'];
    return {
      steps: [usd(fixed / days), usd(sales), `${num(margin * 100)}%`],
      result: usd(sales * margin),
      takeaway: [usd(fixed / days)],
      caption: [usd(fixed), usd(fixed / days), usd(sales), `${num(margin * 100)}%`, usd(sales * margin)],
    };
  },

  'overhead-per-store': (i) => {
    const overhead = i['Group overhead a month'], stores = i['Stores'], fourWall = i["One store's four-wall profit a month"];
    const share = overhead / stores;
    return {
      steps: [usd(share), usd(fourWall), usd(fourWall - share)],
      result: pct1(share / fourWall),
      takeaway: [],
      caption: [usd(overhead), usd(share), usd(fourWall), usd(fourWall - share), pct1(share / fourWall)],
    };
  },

  'accrued-wages': (i) => {
    const perDay = i['Wages earned a day'], days = i['Pay-period days in November, paid in December'], taxRate = i['Employer payroll tax'];
    const wages = perDay * days;
    const tax = round(wages * taxRate, 2);
    return {
      steps: [usd(perDay), usd(wages), usd(tax, { cents: 'always' })],
      result: usd(wages + tax, { cents: 'never' }), // to the dollar, so the big number fits the card
      takeaway: [usd(wages + tax, { cents: 'never' })],
      caption: [usd(perDay), usd(wages), usd(tax, { cents: 'always' }), `${num(taxRate * 100, 2)}%`, usd(wages + tax, { cents: 'never' })],
    };
  },
};
