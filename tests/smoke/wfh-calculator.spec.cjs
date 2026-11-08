// Work From Home Calculator: the engine through window.WfhCalculator, then
// the page. Strict CSP, so waits use expect.poll, not waitForFunction.

const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly, readDownloadText } = require('./helpers.cjs');

const PAGE = '/tools/wfh-calculator.html';

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.WfhCalculator && window.WfhCalculator.getResult()))).toBe(true);
}

// A plain scenario built in the page: one driver, no fixed costs.
const BASE = `(() => {
  const W = window.WfhCalculator;
  const s = W.blankScenario();
  Object.assign(s.person, { homeLunch: 4, homeEnergyPerDay: 1 });
  const j = s.jobs[0];
  Object.assign(j, { daysOff: 20, salary: 52000, hoursPerWeek: 40, paidWeeks: 52, taxMode: 'flat', marginalRatePct: 30, officeDaysPerWeek: 3, officeLunch: 14 });
  j.tripIn = { minutes: 30, legs: [{ ...j.tripIn.legs[0], mode: 'car_fuel', distance: 20, efficiency: 25, fuelPrice: 3.5 }] };
  return s;
})()`;

test.describe('engine', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('fuel cost is distance over mpg times price, in both unit systems', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const leg = { mode: 'car_fuel', distance: 20, efficiency: 25, fuelPrice: 3.5 };
      const metric = W.convertLeg(leg, 'metric');
      return { us: W.legCost(leg, 'us'), metric: W.legCost(metric, 'metric'), back: W.convertLeg(metric, 'us') };
    });
    expect(r.us).toBeCloseTo(2.8, 10);
    expect(r.metric).toBeCloseTo(2.8, 4);
    expect(r.back.distance).toBeCloseTo(20, 4);
    expect(r.back.efficiency).toBeCloseTo(25, 4);
  });

  test('other leg modes: carpool split, rideshare surge and tip, all-in rate, EV', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      return {
        carpool: W.legCost({ mode: 'car_fuel', distance: 20, efficiency: 25, fuelPrice: 3.5, riders: 2 }),
        ride: W.legCost({ mode: 'rideshare', fare: 20, surgePct: 10, tipPct: 15 }),
        rate: W.legCost({ mode: 'car_rate', distance: 10, ratePerDistance: 0.725 }),
        ev: W.legCost({ mode: 'ev', distance: 30, efficiency: 3, energyPrice: 0.15 }),
      };
    });
    expect(r.carpool).toBeCloseTo(1.4, 10);
    expect(r.ride).toBeCloseTo(25.3, 10);
    expect(r.rate).toBeCloseTo(7.25, 10);
    expect(r.ev).toBeCloseTo(1.5, 10);
  });

  test('salary to hourly, and the after-tax and DOT time rates', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const pay = W.payFigures({ payMode: 'salary', salary: 52000, hoursPerWeek: 40, paidWeeks: 52, marginalRatePct: 30 });
      return { pay, net: W.timeRate({ timeValueMode: 'net' }, pay).rate, dot: W.timeRate({ timeValueMode: 'dot' }, pay).rate };
    });
    expect(r.pay.hourly).toBeCloseTo(25, 10);
    expect(r.net).toBeCloseTo(17.5, 10);
    expect(r.dot).toBeCloseTo(12.5, 10);
  });

  test('a known office day and year add up by hand', async ({ page }) => {
    const r = await page.evaluate(`(() => { const W = window.WfhCalculator; return W.calculate(${BASE}); })()`);
    expect(r.ok).toBe(true);
    // 5.60 fuel + 14 lunch office side, against 4 lunch + 1 energy home side.
    expect(r.single.officeDayCost.money).toBeCloseTo(5.6 + 14 - 4 - 1, 9);
    // 240 working days, 3 of 5 office: 144 office and 96 home days.
    const p = r.single.policy;
    expect(p.officeDays).toBeCloseTo(144, 9);
    expect(p.money).toBeCloseTo(144 * (5.6 + 14) + 96 * (4 + 1), 9);
    // 60 minutes a day at $17.50 after tax.
    expect(p.time).toBeCloseTo(144 * 17.5, 9);
  });

  test('equivalent raise divides the saving by one minus the marginal rate', async ({ page }) => {
    const r = await page.evaluate(`(() => { const W = window.WfhCalculator; return W.calculate(${BASE}); })()`);
    for (const p of r.single.patterns) {
      expect(p.equivalentRaise).toBeCloseTo(p.savingVsFull / 0.7, 9);
    }
    // At 3 days, 96 fewer office days than full office, each worth 14.60 money plus 17.50 time.
    const three = r.single.patterns.find((p) => p.daysPerWeek === 3);
    expect(three.savingVsFull).toBeCloseTo(96 * 32.1, 9);
    expect(three.equivalentRaise).toBeCloseTo(96 * 32.1 / 0.7, 9);
  });

  test('with no fixed costs, totals fall in a straight line with office days', async ({ page }) => {
    const r = await page.evaluate(`(() => { const W = window.WfhCalculator; return W.calculate(${BASE}); })()`);
    const totals = r.single.patterns.map((p) => p.total);
    const step = totals[0] - totals[1];
    for (let i = 1; i < totals.length; i += 1) expect(totals[i - 1] - totals[i]).toBeCloseTo(step, 6);
  });

  test('a monthly pass bends the curve at its break-even, and pre-tax is capped', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const s = W.blankScenario();
      s.jobs[0].daysOff = 20;
      const j = s.jobs[0];
      Object.assign(j, { salary: 52000, hoursPerWeek: 40, paidWeeks: 52, taxMode: 'flat', marginalRatePct: 30, officeDaysPerWeek: 5, transitPassMonthly: 100 });
      j.tripIn = { minutes: 30, legs: [{ mode: 'transit', fare: 2.5 }] };
      const r1 = W.calculate(s);
      // Fares of $40 a day make the $400 pass the cheaper choice, so the cap binds.
      j.transitPretax = true;
      j.transitPassMonthly = 400;
      j.tripIn.legs = [{ mode: 'transit', fare: 20 }];
      const r2 = W.calculate(s);
      return { r1, r2 };
    });
    const ev = r.r1.single;
    // $5 a day over 48 working weeks against $1,200 a year: 5 days a week at the break-even.
    expect(ev.transitBreakEven).toBeCloseTo(1200 / (5 * 48), 9);
    const five = ev.patterns.find((p) => p.daysPerWeek === 5);
    const four = ev.patterns.find((p) => p.daysPerWeek === 4);
    expect(five.commute).toBeCloseTo(1200, 9);
    expect(five.usesTransitPass).toBe(false);
    expect(four.commute).toBeCloseTo(4 * 48 * 5, 9);
    // 400 a month is over the $340 cap: only 340 x 12 earns the 30%.
    const p5 = r.r2.single.patterns.find((p) => p.daysPerWeek === 5);
    expect(p5.pretaxSaving).toBeCloseTo(340 * 12 * 0.3, 9);
  });

  test('two jobs: break-even pay equalizes the nets, and swapping flips the sign', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const s = W.EXAMPLES.find((e) => e.id === 'offers').build();
      const c = W.compareJobs(s);
      const t = structuredClone(s);
      t.jobs[1].salary = c.breakEven.annual;
      const atBreakEven = W.compareJobs(t);
      const swapped = structuredClone(s);
      swapped.jobs = [s.jobs[1], s.jobs[0]];
      const same = structuredClone(s);
      same.jobs = [s.jobs[0], structuredClone(s.jobs[0])];
      return { c, atBreakEven, swapped: W.compareJobs(swapped), same: W.compareJobs(same) };
    });
    expect(Math.abs(r.atBreakEven.difference)).toBeLessThan(0.005);
    expect(r.c.breakEven.annual).toBeGreaterThan(105000);
    expect(r.swapped.difference).toBeCloseTo(-r.c.difference, 6);
    expect(r.same.difference).toBeCloseTo(0, 9);
  });

  test('only the pay gap is taxed, at the marginal rate of the higher-paid job', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const s = W.blankScenario();
      s.compare = true;
      Object.assign(s.jobs[0], { salary: 95000, hoursPerWeek: 40, paidWeeks: 52, taxMode: 'flat', marginalRatePct: 30 });
      Object.assign(s.jobs[1], { salary: 105000, hoursPerWeek: 40, paidWeeks: 52, taxMode: 'flat', marginalRatePct: 32 });
      const up = W.compareJobs(s);
      [s.jobs[0].marginalRatePct, s.jobs[1].marginalRatePct] = [32, 30];
      s.jobs[1].salary = 85000;
      const down = W.compareJobs(s);
      return { up, down };
    });
    // Taxing whole salaries at their own rates would give 71,400 - 66,500 = 4,900.
    expect(r.up.differenceMoney).toBeCloseTo(10000 * 0.68, 9);
    // B pays less: the lost 10,000 is taxed at A's 32%.
    expect(r.down.differenceMoney).toBeCloseTo(-10000 * 0.68, 9);
  });

  test('checks fire and clear', async ({ page }) => {
    const r = await page.evaluate(`(() => {
      const W = window.WfhCalculator;
      const s = ${BASE};
      const out = {};
      out.clean = W.validate(s);
      s.jobs[0].tripIn.minutes = 2;
      out.fast = W.validate(s).warnings.map((w) => w.text);
      s.jobs[0].tripIn.minutes = 30;
      s.jobs[0].marginalRatePct = 75;
      out.rate = W.validate(s).errors.map((e) => e.text);
      s.jobs[0].marginalRatePct = 30;
      s.jobs[0].officeDaysPerWeek = 6;
      out.days = W.validate(s).errors.map((e) => e.text);
      s.jobs[0].officeDaysPerWeek = 3;
      s.jobs[0].paidWeeks = 53;
      out.weeks = W.validate(s).errors.map((e) => e.text);
      s.jobs[0].paidWeeks = 52;
      s.jobs[0].tripIn.legs = [{ mode: 'transit', fare: 3 }];
      s.jobs[0].transitPassMonthly = 4;
      out.pass = W.validate(s).warnings.map((w) => w.text);
      s.jobs[0].tripIn.legs = [{ mode: 'car_rate', distance: 20, ratePerDistance: 0.7 }];
      s.jobs[0].transitPassMonthly = '';
      s.person.carDropSavingPerYear = 5000;
      out.twice = W.validate(s).warnings.map((w) => w.text);
      s.person.carDropSavingPerYear = '';
      s.person.workDaysPerWeek = 4.5;
      out.halfDay = W.validate(s).errors.map((e) => e.text);
      s.person.workDaysPerWeek = 5;
      s.jobs[0].marginalRatePct = '';
      out.noTax = W.validate(s).warnings.map((w) => w.text);
      s.jobs[0].marginalRatePct = 30;
      s.person.homeLunch = -4;
      out.negative = W.validate(s).warnings.map((w) => w.text);
      return out;
    })()`);
    expect(r.clean.errors).toEqual([]);
    expect(r.clean.warnings).toEqual([]);
    expect(r.fast.join(' ')).toContain('averages 600 mph');
    expect(r.rate.join(' ')).toContain('between 0 and 60%');
    expect(r.days.join(' ')).toContain('More office days than working days');
    expect(r.weeks.join(' ')).toContain('Paid weeks must be between 0 and 52');
    expect(r.pass.join(' ')).toContain('less than two rides');
    expect(r.twice.join(' ')).toContain('counts them twice');
    expect(r.halfDay.join(' ')).toContain('whole number');
    expect(r.noTax.join(' ')).toContain('No marginal tax rate');
    expect(r.negative.join(' ')).toContain('negative');
  });

  test('every example loads clean and matches its golden totals', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      return W.EXAMPLES.map((e) => {
        const res = W.calculate(e.build());
        return { id: e.id, ok: res.ok, warnings: res.warnings.length, money: res.single.policy.money, total: res.single.policy.total };
      });
    });
    const golden = {
      // Bracket mode, single, 5% state: every example salary sits at 34.65%
      // marginal. Each value equals the earlier hand-checked flat-30% golden
      // with time scaled by 0.6535 / 0.7 and pre-tax savings by 0.3465 / 0.3.
      driver: [4703.018, 8307.247],
      transit: [4576.432, 11166.022],
      mixed: [5804.5, 8875.95],
      parent: [16711.329, 24242.288],
      offers: [692.5, 692.5],
    };
    for (const e of r) {
      expect(e.ok, e.id).toBe(true);
      expect(e.warnings, e.id).toBe(0);
      expect(e.money, e.id).toBeCloseTo(golden[e.id][0], 1);
      expect(e.total, e.id).toBeCloseTo(golden[e.id][1], 1);
    }
  });

  test('imported files keep only known keys and types', async ({ page }) => {
    const s = await page.evaluate(() => {
      const W = window.WfhCalculator;
      return W.sanitizeScenario({
        units: 'furlongs', evil: '<img>', compare: 'yes',
        person: { daysOff: '12', timeValueMode: 'bribe', careLines: [{ label: 'x'.repeat(200), perOfficeDay: 'abc', extra: 1 }] },
        jobs: [{ salary: '1e5', tripIn: { legs: [{ mode: 'teleport', distance: 3 }] } }],
      }, W.blankScenario());
    });
    expect(s.units).toBe('us');
    expect(s.evil).toBeUndefined();
    expect(s.compare).toBe(false);
    // Days off moved to each job; an old file's person-level value is carried over.
    expect(s.person.daysOff).toBeUndefined();
    expect(s.jobs[0].daysOff).toBe(12);
    expect(s.jobs[1].daysOff).toBe(12);
    expect(s.person.timeValueMode).toBe('net');
    expect(s.person.careLines[0].label.length).toBe(60);
    expect(s.person.careLines[0].perOfficeDay).toBe('');
    expect(s.person.careLines[0].extra).toBeUndefined();
    expect(s.jobs[0].salary).toBe(100000);
    expect(s.jobs[0].tripIn.legs[0].mode).toBe('car_fuel');
    expect(s.jobs).toHaveLength(2);
  });

  test('CSV guards text cells against formulas', async ({ page }) => {
    const cells = await page.evaluate(() => [window.WfhCalculator.csvCell('=1+1'), window.WfhCalculator.csvCell('a,b'), window.WfhCalculator.csvCell(-3)]);
    expect(cells).toEqual(["'=1+1", '"a,b"', '-3']);
  });
});

test.describe('2026 tax and cost of living', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('bracket tables reproduce the cumulative amounts printed in Rev. Proc. 2025-32', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const out = {};
      for (const st of ['single', 'joint', 'head']) out[st] = W.TAX_2026.brackets[st].slice(1).map(([start]) => W.federalIncomeTax(start, st));
      return out;
    });
    // The "$X plus N% of the excess" amounts in sections 4.01 Tables 1 to 3.
    expect(r.single).toEqual([1240, 5800, 17966, 41024, 58448, 192979.25].map((x) => expect.closeTo(x, 6)));
    expect(r.joint).toEqual([2480, 11600, 35932, 82048, 116896, 206583.5].map((x) => expect.closeTo(x, 6)));
    expect(r.head).toEqual([1770, 7740, 16155, 39207, 56631, 191171].map((x) => expect.closeTo(x, 6)));
  });

  test('a salary is taxed by hand: $72,000 single at 5% state', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const m = W.taxModel({ filingStatus: 'single' }, { taxMode: 'brackets', stateRatePct: 5 });
      return { tax: m.tax(72000), marginal: m.marginal(72000) };
    });
    // Taxable 55,900: 5,800 + 22% of 5,500 = 7,010. Payroll 7.65% = 5,508. State 3,600.
    expect(r.tax).toBeCloseTo(16118, 6);
    expect(r.marginal).toBeCloseTo(0.3465, 6);
  });

  test('a big jump in pay is taxed at every rate it crosses', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const s = W.blankScenario();
      s.compare = true;
      Object.assign(s.jobs[0], { salary: 95000, hoursPerWeek: 40, paidWeeks: 52, stateRatePct: 5 });
      Object.assign(s.jobs[1], { salary: 210000, hoursPerWeek: 40, paidWeeks: 52, stateRatePct: 5 });
      const exact = W.compareJobs(s);
      s.jobs.forEach((j) => { j.taxMode = 'flat'; j.marginalRatePct = 31.35; });
      return { exact, flat: W.compareJobs(s) };
    });
    // 210,000: taxable 193,900 gives 17,966 + 24% of 88,200 = 39,134; payroll
    // 11,439 + 3,045 + 90 = 14,574; state 10,500; take-home 145,792.
    // 95,000: 12,070 + 7,267.50 + 4,750; take-home 70,912.50.
    expect(r.exact.payGapNet).toBeCloseTo(145792 - 70912.5, 6);
    // One rate at the top (24 + 1.45 + 0.9 + 5) overstates the gap by about $4,000.
    expect(r.flat.payGapNet - r.exact.payGapNet).toBeCloseTo(115000 * 0.6865 - 74879.5, 6);
    expect(r.exact.thresholds.map((t) => [t.label, t.wage])).toEqual([
      ['the 24% federal bracket', 121800],
      ['the Social Security wage base', 184500],
      ['the Additional Medicare threshold', 200000],
    ]);
  });

  test('the equivalent raise and pre-tax savings are exact across a bracket', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const model = W.taxModel({ filingStatus: 'single' }, { taxMode: 'brackets', stateRatePct: 0 });
      const raise = W.grossUp(model, 120000, 20000);
      const s = W.blankScenario();
      const j = s.jobs[0];
      Object.assign(j, { salary: 124000, hoursPerWeek: 40, paidWeeks: 52, officeDaysPerWeek: 5, transitPassMonthly: 400, transitPretax: true });
      j.tripIn = { minutes: 30, legs: [{ mode: 'transit', fare: 20 }] };
      const pol = W.calculate(s).single.policy;
      return { kept: raise - (model.tax(120000 + raise) - model.tax(120000)), raise, pretax: pol.pretaxSaving, expected: model.tax(124000) - model.tax(124000 - 4080) };
    });
    expect(r.kept).toBeCloseTo(20000, 6);
    // From 120,000 the raise starts in the 22% bracket and crosses into 24% at 121,800.
    expect(r.raise).toBeGreaterThan(20000 / (1 - 0.2965));
    expect(r.raise).toBeLessThan(20000 / (1 - 0.3165));
    // 4,080 of pass sheltered from 124,000 straddles the same line.
    expect(r.pretax).toBeCloseTo(r.expected, 6);
    expect(r.pretax).toBeGreaterThan(4080 * 0.2965);
    expect(r.pretax).toBeLessThan(4080 * 0.3165);
  });

  test('bracket-mode break-even equalizes the two offers', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const s = W.EXAMPLES.find((e) => e.id === 'offers').build();
      const c = W.compareJobs(s);
      const t = structuredClone(s);
      t.jobs[1].salary = c.breakEven.annual;
      const u = structuredClone(s);
      u.jobs[1].salary = c.breakEvenMoney.annual;
      return { exact: c.exactTax, time: W.compareJobs(t).difference, money: W.compareJobs(u).differenceMoney };
    });
    expect(r.exact).toBe(true);
    expect(Math.abs(r.time)).toBeLessThan(0.01);
    expect(Math.abs(r.money)).toBeLessThan(0.01);
  });

  test('cost of living restates Job B in Job A prices', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const s = W.EXAMPLES.find((e) => e.id === 'offers').build();
      const c = W.compareJobs(s);
      const flat = structuredClone(s);
      flat.jobs[0].taxMode = 'flat';
      return { col: c.costOfLiving, a: c.a, b: c.b, flat: W.compareJobs(flat).costOfLiving };
    });
    const keptA = r.a.pay.net - r.a.policy.money;
    const keptB = r.b.pay.net - r.b.policy.money;
    expect(r.col.placeA.all).toBe(95.7);
    expect(r.col.placeB.all).toBe(103.6);
    expect(r.col.difference).toBeCloseTo(keptB * 95.7 / 103.6 - keptA, 6);
    expect(r.flat.needsBrackets).toBe(true);
  });

  test('the price table matches the committed BEA extract', async ({ page }) => {
    const fs = require('fs');
    const path = require('path');
    const rows = fs.readFileSync(path.join(__dirname, '../../data/wfh_calculator/bea_rpp_2024.csv'), 'utf8').trim().split('\n').slice(1);
    const parsed = rows.map((line) => {
      const m = line.match(/^(\d{5}),("(?:[^"]|"")*"|[^,]*),(\w+),([\d.]*),([\d.]*)$/);
      return [m[1], m[2].replace(/^"|"$/g, ''), m[3], Number(m[4]), m[5] ? Number(m[5]) : null];
    });
    const fromPage = await page.evaluate(() => [...window.WfhCalculator.RPP_BY_FIPS.values()].map((p) => [p.fips, p.name, p.kind, p.all, p.housing]));
    expect(fromPage).toEqual(parsed);
    const kinds = fromPage.reduce((o, p) => ({ ...o, [p[2]]: (o[p[2]] || 0) + 1 }), {});
    expect(kinds).toEqual({ us: 2, state: 51, metro: 387 });
    const byName = Object.fromEntries(fromPage.map((p) => [p[1], p[3]]));
    expect(byName['United States']).toBe(100);
    expect(byName['San Francisco-Oakland-Fremont, CA']).toBe(115.6);
    expect(byName['Napa, CA']).toBe(112.6);
  });

  test('imports keep old typed rates and drop unknown places', async ({ page }) => {
    const r = await page.evaluate(() => {
      const W = window.WfhCalculator;
      const s = W.sanitizeScenario({ jobs: [{ salary: 80000, marginalRatePct: 28, placeFips: '16980' }, { placeFips: 16980, taxMode: 'bogus' }], person: { filingStatus: 'x' } }, W.blankScenario());
      return { a: s.jobs[0], b: s.jobs[1], status: s.person.filingStatus };
    });
    expect(r.a.taxMode).toBe('flat');
    expect(r.a.placeFips).toBe('16980');
    expect(r.b.taxMode).toBe('brackets');
    expect(r.b.placeFips).toBe('');
    expect(r.status).toBe('single');
  });
});

test.describe('days off and hourly rates', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('pay per hour worked by hand, with and without commute', async ({ page }) => {
    const r = await page.evaluate(`(() => { const W = window.WfhCalculator; return W.calculate(${BASE}).single; })()`);
    // 40 h over 5 days is 8 h a day; 260 - 20 days off = 240 days, 1,920 h.
    expect(r.rates.workedHours).toBeCloseTo(1920, 9);
    expect(r.rates.pure).toBeCloseTo(52000 / 1920, 9);
    expect(r.rates.withCommute).toBeCloseTo(52000 / (1920 + r.policy.hours), 9);
    // Flat mode has no take-home figure.
    expect(r.rates.takeHomeWithCommute).toBeNull();
  });

  test('each job uses its own days off', async ({ page }) => {
    const r = await page.evaluate(`(() => {
      const W = window.WfhCalculator;
      const s = ${BASE};
      s.compare = true;
      s.jobs[1] = structuredClone(s.jobs[0]);
      s.jobs[0].daysOff = 10;
      s.jobs[1].daysOff = 30;
      return W.compareJobs(s);
    })()`);
    expect(r.a.calendar.workingDays).toBe(250);
    expect(r.b.calendar.workingDays).toBe(230);
    // Same office days per week, fewer working days: fewer office days and less cost.
    expect(r.b.policy.officeDays).toBeCloseTo(r.a.policy.officeDays * 230 / 250, 9);
    expect(r.b.policy.money).toBeLessThan(r.a.policy.money);
    expect(r.b.rates.pure).toBeCloseTo(52000 / (8 * 230), 9);
    expect(r.a.rates.pure).toBeCloseTo(52000 / (8 * 250), 9);
  });
});

test.describe('page', () => {
  test('loads cleanly', async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, PAGE);
  });

  test('typing a commute fills the office day tile, table and chart', async ({ page }) => {
    await openTool(page);
    await page.fill('#job0-salary', '52000');
    await page.check('#job0-taxMode-flat');
    await page.fill('#job0-marginalRatePct', '30');
    await page.fill('#job0-hoursPerWeek', '40');
    await page.fill('#job0-paidWeeks', '52');
    await page.fill('#job0-officeDaysPerWeek', '3');
    await page.fill('#job0-tripIn-minutes', '30');
    await page.fill('#job0-tripIn-leg0-distance', '20');
    await page.fill('#job0-tripIn-leg0-efficiency', '25');
    await page.fill('#job0-tripIn-leg0-fuelPrice', '3.5');
    const tile = page.locator('.tile').first();
    await expect(tile).toContainText('$5.60');
    await expect(page.locator('#patternTable tbody tr')).toHaveCount(6);
    await expect(page.locator('#patternTable tr.policy-row')).toHaveCount(1);
    await expect(page.locator('#chartWrap svg .bar')).toHaveCount(6);
  });

  test('tax mode switches its fields and reads out the rate', async ({ page }) => {
    await openTool(page);
    await page.fill('#job0-salary', '72000');
    await page.fill('#job0-stateRatePct', '5');
    await expect(page.locator('[data-tax-readout]').first()).toContainText('22% federal + 7.65% payroll + 5% state = 34.65%');
    await expect(page.locator('#job0-marginalRatePct')).toBeHidden();
    await page.check('#job0-taxMode-flat');
    await expect(page.locator('#job0-marginalRatePct')).toBeVisible();
    await expect(page.locator('#job0-stateRatePct')).toBeHidden();
    await expect(page.locator('[data-tax-readout]').first()).toContainText('never to the whole salary');
  });

  test('places are chosen by state then area, and one missing place says so', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#exampleSelect', 'offers');
    await page.click('#loadExample');
    await expect(page.locator('#job0-placeState')).toHaveValue('IN');
    await expect(page.locator('#job0-placeArea')).toHaveValue('26900');
    await expect(page.locator('#comparison')).toContainText('Adjusted for prices, Remote offer leaves you $5,643');
    await page.selectOption('#job1-placeState', '');
    await expect(page.locator('#job1-placeArea')).toBeDisabled();
    await expect(page.locator('#comparison')).toContainText('Choose where you would live for Hybrid offer too');
    await page.selectOption('#job1-placeState', 'IL');
    await expect(page.locator('#job1-placeArea')).toHaveValue('17000');
    await expect(page.locator('#comparison')).toContainText('Adjusted for prices');
    // Chicago spans Illinois and Indiana, so it is listed under both.
    await expect(page.locator('#job1-placeArea option[value="16980"]')).toHaveCount(1);
    await page.selectOption('#job1-placeArea', '16980');
    await expect(page.locator('#comparison')).toContainText('$5,643');
    await page.selectOption('#job0-placeState', 'IL');
    await expect(page.locator('#job0-placeArea option[value="16980"]')).toHaveCount(1);
    await page.selectOption('#job0-placeArea', '00999');
    await expect(page.locator('#job0-placeState')).toHaveValue('IL');
  });

  test('shared sections show both jobs and say they are shared', async ({ page }) => {
    await openTool(page);
    await expect(page.locator('.shared-note').first()).toBeHidden();
    await page.selectOption('#exampleSelect', 'offers');
    await page.click('#loadExample');
    await expect(page.locator('[data-subtotal="care"]')).toHaveText(/^A \$[\d,]+ · B \$[\d,]+$/);
    await expect(page.locator('.shared-note')).toHaveCount(4);
    await expect(page.locator('.shared-note').first()).toBeVisible();
    await expect(page.locator('#comparison')).toContainText('Pay per hour, counting commute as work');
  });

  test('a source button fills the field and names its source', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#job0-tripIn-leg0-mode', 'car_rate');
    await page.getByRole('button', { name: 'IRS business rate, from Jul 1, 2026' }).click();
    await expect(page.locator('#job0-tripIn-leg0-ratePerDistance')).toHaveValue('0.76');
    await expect(page.locator('#exampleNote')).toContainText('Announcement 2026-11');
  });

  test('the comparison shows both jobs and a break-even salary', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#exampleSelect', 'offers');
    await page.click('#loadExample');
    await expect(page.locator('#comparison')).toBeVisible();
    await expect(page.locator('#tiles')).toBeHidden();
    await expect(page.locator('#comparison')).toContainText('Remote offer');
    await expect(page.locator('#comparison')).toContainText('breaks even');
    await expect(page.locator('#chartWrap svg .bar')).toHaveCount(2);
    await expect(page.locator('#jobsContainer [data-job]')).toHaveCount(2);
  });

  test('switching units converts the inputs, not the answer', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#exampleSelect', 'driver');
    await page.click('#loadExample');
    const before = await page.evaluate(() => window.WfhCalculator.getResult().single.policy.money);
    await page.check('input[name="units"][value="metric"]');
    await expect(page.locator('label[for="job0-tripIn-leg0-efficiency"]')).toHaveText('Liters per 100 km');
    const after = await page.evaluate(() => window.WfhCalculator.getResult().single.policy.money);
    expect(after).toBeCloseTo(before, 1);
  });

  test('an error hides the results and says why', async ({ page }) => {
    await openTool(page);
    await page.check('#job0-taxMode-flat');
    await page.fill('#job0-marginalRatePct', '80');
    await expect(page.locator('#errors')).toContainText('between 0 and 60%');
    await expect(page.locator('#resultsBody')).toBeHidden();
    await expect(page.locator('#job0-marginalRatePct')).toHaveAttribute('aria-invalid', 'true');
    await page.fill('#job0-marginalRatePct', '30');
    await expect(page.locator('#job0-marginalRatePct')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('scenarios save, reopen and survive a reload', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#exampleSelect', 'parent');
    await page.click('#loadExample');
    await expect(page.locator('#saveRow')).toBeHidden();
    await page.click('#saveScenario');
    await expect(page.locator('#saveRow')).toBeVisible();
    await page.fill('#saveName', 'Mine');
    await page.click('#confirmSave');
    await page.click('#resetScenario');
    await expect(page.locator('#job0-salary')).toHaveValue('');
    await page.selectOption('#savedSelect', 'Mine');
    await page.click('#openSaved');
    await expect(page.locator('#job0-salary')).toHaveValue('90000');
    await page.reload();
    await expect(page.locator('#job0-salary')).toHaveValue('90000');
  });

  test('CSV export matches the table, and JSON round trips', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#exampleSelect', 'transit');
    await page.click('#loadExample');
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#exportCsv')]);
    const text = await readDownloadText(csv);
    const lines = text.trim().split(/\r\n/);
    expect(lines).toHaveLength(7);
    expect(lines[0]).toContain('Equivalent pre-tax raise');
    const [json] = await Promise.all([page.waitForEvent('download'), page.click('#exportJson')]);
    const saved = JSON.parse(await readDownloadText(json));
    expect(saved.jobs[0].transitPassMonthly).toBe(90);
    await page.click('#resetScenario');
    await page.setInputFiles('#importJson', { name: 'scenario.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
    await expect(page.locator('#job0-transitPassMonthly')).toHaveValue('90');
  });

  test('the chart has a legend, keyboard tooltip and an SVG export', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#exampleSelect', 'driver');
    await page.click('#loadExample');
    await expect(page.locator('#legend .legend-item')).toHaveCount(6);
    await page.locator('#chartWrap .bar').first().focus();
    await expect(page.locator('#chartTooltip')).toBeVisible();
    await expect(page.locator('#chartTooltip')).toContainText('Getting there');
    const [svg] = await Promise.all([page.waitForEvent('download'), page.click('#exportSvg')]);
    const text = await readDownloadText(svg);
    expect(text).toContain('<svg');
    expect(text).not.toContain('var(--');
    const [png] = await Promise.all([page.waitForEvent('download'), page.click('#exportPng')]);
    const stream = await png.createReadStream();
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.length).toBeGreaterThan(5000);
  });

  test('a fractional policy gets its own bar, in order', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#exampleSelect', 'driver');
    await page.click('#loadExample');
    await page.fill('#job0-officeDaysPerWeek', '2.5');
    await expect(page.locator('#chartWrap svg .bar')).toHaveCount(7);
    const labels = await page.locator('#chartWrap svg .bar').evaluateAll((gs) => gs.map((g) => g.getAttribute('aria-label').split(':')[0]));
    expect(labels[3]).toBe('2.5 days, your policy');
  });

  test('phone width has no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openTool(page);
    await page.selectOption('#exampleSelect', 'offers');
    await page.click('#loadExample');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('info popover opens on hover and focus, pins on click, closes on Escape', async ({ page }) => {
    await openTool(page);
    const tip = page.locator('.info-tip[data-info="daysOff"]');
    const btn = tip.locator('.info-btn');
    const pop = tip.locator('.info-pop');
    await expect(pop).toBeHidden();
    await btn.hover();
    await expect(pop).toBeVisible();
    await expect(pop).toContainText('Vacation, after 1 year');
    await expect(pop).toContainText('11 legal public holidays');
    await page.mouse.move(5, 5);
    await expect(pop).toBeHidden();
    await btn.focus();
    await expect(pop).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await page.locator('#workDaysPerWeek').focus();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.move(5, 5);
    await expect(pop).toBeVisible();
    await page.click('#resultsHeading');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(pop).toBeHidden();
  });

  test('tax and paid-weeks popovers appear once per job, with their own ids and sources', async ({ page }) => {
    await openTool(page);
    await page.check('#compareToggle');
    for (const key of ['marginalRate', 'paidWeeks']) {
      const ids = await page.locator(`.info-tip[data-info="${key}"] .info-pop`).evaluateAll((els) => els.map((e) => e.id));
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
    }
    const tax = page.locator('.info-tip[data-info="marginalRate"]').first();
    await tax.locator('.info-btn').hover();
    for (const s of ['2026', '$12,400', '$50,400', '$100,800', '$640,600', '$768,700', '$16,100', '$184,500']) {
      await expect(tax.locator('.info-pop')).toContainText(s);
    }
    const hrefs = await page.locator('.info-pop a').evaluateAll((as) => as.map((a) => a.href));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(h).toMatch(/^https:\/\//);
  });

  test('popovers stay on screen at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openTool(page);
    for (const key of ['daysOff', 'marginalRate', 'paidWeeks']) {
      const tip = page.locator(`.info-tip[data-info="${key}"]`).first();
      await tip.locator('.info-btn').click();
      const box = await tip.locator('.info-card').boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
      const clipped = await tip.locator('.info-table-wrap').evaluateAll((ws) => ws.some((w) => w.scrollWidth > w.clientWidth));
      expect(clipped).toBe(false);
      await page.click('#inputsHeading');
    }
  });

  for (const width of [1400, 375]) {
    test(`example titles fit their picker at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openTool(page);
      await page.evaluate(() => document.fonts.ready);
      const worst = await page.evaluate(() => {
        const sel = document.getElementById('exampleSelect');
        const cs = getComputedStyle(sel);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const room = sel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return Math.max(...[...sel.options].map((o) => ctx.measureText(o.text).width)) - room;
      });
      expect(worst).toBeLessThanOrEqual(0);
    });
  }
});
