// Beta-Alanine Lab (tools/beta-alanine-lab.html): the engine through
// window.BetaAlanine, then the page. Strict CSP, so waits use expect.poll.
// Reference values are worked out here, independently of the engine, or come
// from the archived CSVs and fits.json written by scripts/build-beta-alanine-fits.py.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly, expectContrastAA } = require('./helpers.cjs');

const PAGE = '/tools/beta-alanine-lab.html';
const DATA = path.resolve(__dirname, '..', '..', 'data', 'beta_alanine_lab');
const WET_TO_DRY = 4.3;

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.BetaAlanine && window.BetaAlanine.ready))).toBe(true);
}

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { cells.push(cell); cell = ''; }
      else cell += ch;
    }
    cells.push(cell);
    rows.push(cells);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const csv = (name) => parseCsv(fs.readFileSync(path.join(DATA, name), 'utf8'));

// Fine-step Euler integration of dR/dt = s*D(t) - kd*R, written here rather
// than taken from the engine, so the exact solution is checked independently.
function eulerRise(schedule, slope, kd, lastDay, dt = 0.001) {
  const out = [0];
  let r = 0;
  const steps = Math.round(1 / dt);
  for (let day = 0; day < lastDay; day++) {
    for (let k = 0; k < steps; k++) {
      const t = day + (k + 0.5) * dt;
      const seg = schedule.find(([a, b]) => t >= a && t < b);
      r += ((seg ? seg[2] : 0) * slope - kd * r) * dt;
    }
    out.push(r);
  }
  return out;
}

test.describe('data and fits', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('the generated data module matches the archived CSVs', async ({ page }) => {
    const data = await page.evaluate(() => window.BetaAlanine.data);
    const obs = csv('loading_observations.csv');
    expect(data.LOADING_OBSERVATIONS).toHaveLength(obs.length);
    obs.forEach((row, i) => {
      const o = data.LOADING_OBSERVATIONS[i];
      expect(o.sourceId).toBe(row.source_id);
      expect(o.day).toBe(Number(row.day));
      expect(o.rise).toBe(Number(row.rise_mmol_kg_dm));
      expect(o.role).toBe(row.role);
      expect(o.schedule.map((s) => `${s[0]}-${s[1]}:${s[2]}`).join(';'))
        .toBe(row.schedule.split(';').map((p) => { const [span, d] = p.split(':'); const [a, b] = span.split('-'); return `${Number(a)}-${Number(b)}:${Number(d)}`; }).join(';'));
    });
    const wash = csv('washout_rates.csv');
    expect(data.WASHOUT_RATES.map((w) => [w.sourceId, w.low, w.central, w.high]))
      .toEqual(wash.map((w) => [w.source_id, Number(w.half_life_days_low), Number(w.half_life_days_central), Number(w.half_life_days_high)]));
    const claims = csv('claims.csv');
    expect(Object.keys(data.CLAIMS).sort()).toEqual(claims.map((c) => c.claim_id).sort());
    const baseline = csv('prices.csv').filter((p) => p.role === 'baseline');
    expect(Object.values(data.PRICE_TIERS).flat()).toHaveLength(baseline.length);
    expect(data.WET_TO_DRY).toBe(WET_TO_DRY);
    // Every source named anywhere is in the manifest.
    const manifest = new Set(csv('download_manifest.csv').map((m) => m.source_id));
    for (const id of [...obs.map((o) => o.source_id), ...wash.map((w) => w.source_id), ...claims.map((c) => c.source_id)]) {
      expect(manifest.has(id), id).toBe(true);
    }
  });

  test('the engine refits every slope in fits.json', async ({ page }) => {
    const fits = JSON.parse(fs.readFileSync(path.join(DATA, 'fits.json'), 'utf8')).fits;
    const got = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const out = {};
      for (const p of B.loadingPapers(B.data.LOADING_OBSERVATIONS)) {
        for (const w of B.data.WASHOUT_RATES) {
          for (const key of ['low', 'central', 'high']) out[`${p.sourceId}|${w.sourceId}|${key}`] = B.fitSlope(p.points, B.kdFromHalfLife(w[key]));
        }
      }
      return out;
    });
    let n = 0;
    for (const [paper, perWash] of Object.entries(fits)) {
      for (const [wash, perKey] of Object.entries(perWash)) {
        for (const [key, f] of Object.entries(perKey)) {
          expect(Math.abs(got[`${paper}|${wash}|${key}`] - f.slope), `${paper} ${wash} ${key}`).toBeLessThan(1e-4);
          n++;
        }
      }
    }
    expect(n).toBe(6 * 4 * 3);
  });

  test('each paper reproduces its own points within 2.5 mmol/kg dm RMS, under every reported SD', async ({ page }) => {
    // The smallest SD reported for a fitted point is Hill's 3.7; the tolerance sits below it.
    const rms = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const out = [];
      for (const p of B.loadingPapers(B.data.LOADING_OBSERVATIONS)) {
        for (const w of B.data.WASHOUT_RATES) {
          const kd = B.kdFromHalfLife(w.central);
          const s = B.fitSlope(p.points, kd);
          const e = p.points.map((pt) => pt.rise - s * B.unitRise(pt.schedule, pt.day, kd));
          out.push({ paper: p.sourceId, washout: w.sourceId, rms: Math.sqrt(e.reduce((a, b) => a + b * b, 0) / e.length) });
        }
      }
      return out;
    });
    for (const r of rms) expect(r.rms, `${r.paper} at ${r.washout}`).toBeLessThan(2.5);
  });
});

test.describe('model', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('the exact solution matches a fine-step integration across random protocols', async ({ page }) => {
    let seed = 7;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let trial = 0; trial < 12; trial++) {
      const phases = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => ({
        doseGPerDay: rand() < 0.2 ? 0 : Math.round(rand() * 128) / 10, days: 1 + Math.floor(rand() * 40)
      }));
      const kd = Math.LN2 / (20 + rand() * 50);
      const slope = 0.04 + rand() * 0.1;
      const lastDay = phases.reduce((s, p) => s + p.days, 0) + 20;
      const { schedule, curve, rises } = await page.evaluate(([ph, k, last]) => {
        const B = window.BetaAlanine;
        const sch = B.buildSchedule(ph).schedule;
        return { schedule: sch, curve: Array.from(B.unitCurve(sch, k, last)), rises: Array.from({ length: last + 1 }, (_, d) => B.unitRise(sch, d, k)) };
      }, [phases, kd, lastDay]);
      const reference = eulerRise(schedule, slope, kd, lastDay);
      const peak = Math.max(...reference, 1e-9);
      for (let d = 0; d <= lastDay; d++) {
        expect(Math.abs(curve[d] * slope - reference[d]) / peak, `trial ${trial} day ${d}`).toBeLessThan(2e-3);
        expect(Math.abs(curve[d] - rises[d])).toBeLessThan(1e-9);
      }
    }
  });

  test('a rest phase between doses keeps its gap in the schedule', async ({ page }) => {
    const built = await page.evaluate(() => window.BetaAlanine.buildSchedule([
      { doseGPerDay: 6.4, days: 28 }, { doseGPerDay: 0, days: 14 }, { doseGPerDay: 1.6, days: 28 }
    ]));
    expect(built).toEqual({ schedule: [[0, 28, 6.4], [42, 70, 1.6]], supplementDays: 70 });
  });

  test('a fractional-day schedule falls back to the general solution', async ({ page }) => {
    const diff = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const sch = [[0, 10.5, 6.4], [10.5, 20.25, 1.6]];
      const curve = B.unitCurve(sch, 0.02, 40);
      return Math.max(...Array.from({ length: 41 }, (_, d) => Math.abs(curve[d] - B.unitRise(sch, d, 0.02))));
    });
    expect(diff).toBeLessThan(1e-9);
  });

  test('linear check: Stellingwerff\'s fit reproduces 2.01 mmol/kg ww per 100 g inside its CI', async ({ page }) => {
    const checks = await page.evaluate(() => window.BetaAlanine.computeChecks());
    const [lo, hi] = [1.83, 2.19].map((v) => v * WET_TO_DRY);
    expect(checks.linear).toHaveLength(4);
    for (const l of checks.linear) {
      expect(l.per100, l.washout).toBeGreaterThanOrEqual(lo);
      expect(l.per100, l.washout).toBeLessThanOrEqual(hi);
    }
    const stored = JSON.parse(fs.readFileSync(path.join(DATA, 'fits.json'), 'utf8')).checks.linear_stellingwerff.filter((c) => c.must_pass);
    for (const s of stored) expect(s.passes, s.washout).toBe(true);
  });

  test('Emax shape check: the half-maximum dose at 6.4 g/day overlaps Rezende\'s 210 to 494 g', async ({ page }) => {
    const checks = await page.evaluate(() => window.BetaAlanine.computeChecks());
    // One-compartment half-maximum time is one half-life, so the dose is 6.4 g times it.
    const wash = csv('washout_rates.csv');
    for (const e of checks.emax) {
      const w = wash.find((r) => r.source_id === e.washout);
      expect(e.grams).toBeCloseTo(6.4 * Number(w.half_life_days_central), 6);
      // Each paper's own range overlaps the interval.
      expect(e.high >= 210 && e.low <= 494, e.washout).toBe(true);
    }
    expect(Math.min(...checks.emax.map((e) => e.low))).toBeLessThan(494);
    expect(Math.max(...checks.emax.map((e) => e.high))).toBeGreaterThan(210);
  });

  test('held-out check points fall inside the per-paper model range', async ({ page }) => {
    const checks = await page.evaluate(() => window.BetaAlanine.computeChecks());
    expect(checks.observations.map((o) => o.sourceId).sort()).toEqual(['church2017', 'rezende2020', 'yamaguchi2021']);
    for (const o of checks.observations) {
      expect(o.rise, `${o.sourceId} ${o.arm}`).toBeGreaterThanOrEqual(o.min);
      expect(o.rise, `${o.sourceId} ${o.arm}`).toBeLessThanOrEqual(o.max);
    }
  });

  test('grams of carnosine and the mass balance', async ({ page }) => {
    const r = await page.evaluate(() => {
      const B = window.BetaAlanine;
      return { grams: B.carnosineGrams(22.9, 25.2, 4.3), mmol: B.carnosineGrams(1, 4.3, 4.3) };
    });
    expect(r.grams).toBeCloseTo((22.9 * (25.2 / 4.3) * 226.23) / 1000, 9);
    // 1 mmol/kg dm in 1 kg dry muscle is 1 mmol, 0.22623 g.
    expect(r.mmol).toBeCloseTo(0.22623, 9);
  });
});

test.describe('band', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  const runDefault = (individual) => `(() => {
    const B = window.BetaAlanine;
    const b = B.runBand({ phases: [{ doseGPerDay: 6.4, days: 28 }], washoutDays: 112, observations: B.data.LOADING_OBSERVATIONS,
      washouts: B.data.WASHOUT_RATES, individual: ${individual}, target: 10, normalVariation: 4.1 });
    return { p10: b.p10[28], p50: b.p50[28], p90: b.p90[28], draws: b.draws, factors: b.tags.map((t) => t.factor) };
  })()`;

  test('default protocol at 4 weeks sits within 1 of Rezende\'s measured 14.0', async ({ page }) => {
    const r = await page.evaluate(runDefault(false));
    // 84 draws for each of the 24 pairings.
    expect(r.draws).toBe(2016);
    expect(Math.abs(r.p50 - 14.0)).toBeLessThan(1.0);
    // Goldens from this build. With equal draws per pairing the median holds at
    // 14.81 across seeds; Phase 0's Python run gave 8.3 and 19.1 for the edges.
    expect(r.p50).toBeCloseTo(14.81, 2);
    expect(Math.abs(r.p10 - 8.3)).toBeLessThan(0.2);
    expect(r.p90).toBeCloseTo(19.09, 2);
    expect(r.factors.every((f) => f === 1)).toBe(true);
  });

  test('equal draws per pairing make the median independent of the seed', async ({ page }) => {
    const medians = await page.evaluate(() => {
      const B = window.BetaAlanine;
      return [1, 2, 3, 4, 5].map((seed) => B.runBand({ phases: [{ doseGPerDay: 6.4, days: 28 }], washoutDays: 0,
        observations: B.data.LOADING_OBSERVATIONS, washouts: B.data.WASHOUT_RATES, seed }).p50[28]);
    });
    for (const m of medians) expect(m).toBeCloseTo(medians[0], 6);
  });

  test('muscle sampling and the person-to-person layer leave the paper draws alone', async ({ page }) => {
    const r = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const base = { phases: [{ doseGPerDay: 6.4, days: 28 }], washoutDays: 28, observations: B.data.LOADING_OBSERVATIONS, washouts: B.data.WASHOUT_RATES };
      const a = B.runBand(base);
      const b = B.runBand({ ...base, muscle: { centerKg: 25, uncertainty: 0.12 }, wetToDry: 4.3 });
      const c = B.runBand({ ...base, individual: true });
      return {
        muscle: Array.from(a.values).every((v, i) => v === b.values[i]),
        halfLives: a.tags.every((t, i) => t.halfLife === c.tags[i].halfLife && t.slope === c.tags[i].slope)
      };
    });
    expect(r).toEqual({ muscle: true, halfLives: true });
  });

  test('person-to-person variation widens the band and has mean 1, CV 0.47', async ({ page }) => {
    const off = await page.evaluate(runDefault(false));
    const on = await page.evaluate(runDefault(true));
    expect(on.p90 - on.p10).toBeGreaterThan(off.p90 - off.p10);
    const stats = await page.evaluate(() => {
      const B = window.BetaAlanine;
      let s = 0xC0FFEE;
      const rng = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
      const xs = Array.from({ length: 200000 }, () => B.responseFactor(B.responseCv(), rng));
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
      return { mean, cv: sd / mean, target: B.responseCv() };
    });
    expect(stats.target).toBeCloseTo(6.6 / 14.0, 9);
    expect(Math.abs(stats.mean - 1)).toBeLessThan(0.01);
    expect(Math.abs(stats.cv - stats.target)).toBeLessThan(0.02);
  });

  test('the seeded band is reproducible and the RNG is the Creatine Lab\'s', async ({ page }) => {
    const same = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const opts = (seed) => ({ phases: [{ doseGPerDay: 3.2, days: 42 }], washoutDays: 30, observations: B.data.LOADING_OBSERVATIONS, washouts: B.data.WASHOUT_RATES, seed });
      const a = B.runBand(opts(5));
      const b = B.runBand(opts(5));
      const c = B.runBand(opts(6));
      return { equal: Array.from(a.values).every((v, i) => v === b.values[i]), differs: Array.from(a.values).some((v, i) => v !== c.values[i]) };
    });
    expect(same).toEqual({ equal: true, differs: true });
    // Generated from createSeededRandom in js/creatine_lab/creatine-model.js at
    // commit 5b08780, before it moved to js/supplement_common/seeded-random.js.
    const seq = await page.evaluate(async () => {
      const { createSeededRandom } = await import('../js/supplement_common/seeded-random.js');
      const a = createSeededRandom(1);
      const b = createSeededRandom(20261114);
      const first = Array.from({ length: 6 }, () => a());
      const second = Array.from({ length: 6 }, () => b());
      const c = createSeededRandom(20261114);
      let last;
      for (let i = 0; i < 10000; i++) last = c();
      return { first, second, last };
    });
    expect(seq.first).toEqual([0.00006295018829405308, 0.015747428173199296, 0.6164041024167091, 0.07161863497458398, 0.5584883580449969, 0.17357419803738594]);
    expect(seq.second).toEqual([0.13057560077868402, 0.23469501198269427, 0.7586768150795251, 0.009958042996004224, 0.689054710790515, 0.5558826664928347]);
    expect(seq.last).toBe(0.28375233081169426);
  });

  test('edge shares sum to one and name only papers at 20% or more', async ({ page }) => {
    const edges = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const b = B.runBand({ phases: [{ doseGPerDay: 6.4, days: 28 }], washoutDays: 112, observations: B.data.LOADING_OBSERVATIONS, washouts: B.data.WASHOUT_RATES });
      return [10, 28, 84, 140].flatMap((d) => [B.attributeEdge(b, d, 0.1), B.attributeEdge(b, d, 0.9)]);
    });
    for (const e of edges) {
      for (const key of ['washout', 'loading']) {
        expect(e[key].reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 9);
        expect(e.named[key].every((x) => x.share >= 0.2)).toBe(true);
        expect(e[key].filter((x) => x.share >= 0.2).length).toBe(e.named[key].length);
      }
      // 2.5% of 2016 draws either side of the percentile's rank: 102 draws.
      expect(e.count).toBe(102);
    }
  });

  test('with one paper of each kind the band collapses to that pair and names only it', async ({ page }) => {
    const r = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const loading = B.loadingPapers(B.data.LOADING_OBSERVATIONS).filter((p) => p.sourceId === 'saunders2017');
      const washouts = B.data.WASHOUT_RATES.filter((w) => w.sourceId === 'harris2009');
      const b = B.runBand({ phases: [{ doseGPerDay: 6.4, days: 28 }], washoutDays: 56, loadingPapers: loading, washouts });
      const kd = B.kdFromHalfLife(60);
      const own = B.fitSlope(loading[0].points, kd) * B.unitRise([[0, 28, 6.4]], 28, kd);
      const e = B.attributeEdge(b, 28, 0.1);
      return { p10: b.p10[28], p90: b.p90[28], own, named: e.named };
    });
    // Harris 2009's half-life is fixed, so the band has no width left at all.
    expect(r.p10).toBeCloseTo(r.own, 9);
    expect(r.p90).toBeCloseTo(r.own, 9);
    expect(r.named).toEqual({ washout: [{ sourceId: 'harris2009', share: 1 }], loading: [{ sourceId: 'saunders2017', share: 1 }] });
  });

  test('a washout paper made artificially fast owns the low washout edge', async ({ page }) => {
    const e = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const washouts = B.data.WASHOUT_RATES.map((w) => (w.sourceId === 'stellingwerff2012' ? { ...w, low: 4, central: 5, high: 6 } : w));
      const b = B.runBand({ phases: [{ doseGPerDay: 6.4, days: 28 }], washoutDays: 84, observations: B.data.LOADING_OBSERVATIONS, washouts });
      return B.attributeEdge(b, 70, 0.1);
    });
    expect(e.washout[0]).toEqual({ sourceId: 'stellingwerff2012', share: 1 });
  });

  test('leave-one-paper-out coverage, reported', async ({ page }, testInfo) => {
    const result = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const all = B.loadingPapers(B.data.LOADING_OBSERVATIONS);
      let inside = 0;
      let total = 0;
      const misses = [];
      for (const held of all) {
        const rest = all.filter((p) => p !== held);
        for (const pt of held.points) {
          const phases = [];
          let t = 0;
          for (const [a, b, dose] of pt.schedule) {
            if (a > t) phases.push({ doseGPerDay: 0, days: a - t });
            phases.push({ doseGPerDay: dose, days: b - a });
            t = b;
          }
          const band = B.runBand({ phases, washoutDays: 0, loadingPapers: rest, washouts: B.data.WASHOUT_RATES });
          const d = Math.round(pt.day);
          total++;
          if (pt.rise >= band.p10[d] && pt.rise <= band.p90[d]) inside++;
          else misses.push(`${held.sourceId} day ${pt.day}`);
        }
      }
      return { inside, total, misses };
    });
    testInfo.annotations.push({ type: 'leave-one-paper-out', description: `${result.inside} of ${result.total} held-out points inside P10-P90; misses: ${result.misses.join(', ')}` });
    console.log(`leave-one-paper-out: ${result.inside} of ${result.total} inside; misses ${result.misses.join(', ')}`);
    expect(result.total).toBe(17);
    // Phase 0 found 10 of 17, nearly every miss Saunders. A new paper should raise this, never lower it.
    expect(result.inside).toBeGreaterThanOrEqual(10);
  });
});

test.describe('checks on a protocol', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('tingling bands follow the per-kg and sustained-release sources', async ({ page }) => {
    const bands = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const t = (g, form = 'plain', kg = 70) => B.tinglingBand({ gramsPerServing: g, bodyMassKg: kg, form }).level;
      return {
        just_under_10: t(0.699), at_10: t(0.7), at_20: t(1.4), under_40: t(2.79), at_40: t(2.8),
        sr_16: t(1.6, 'sustained'), sr_4: t(4, 'sustained'), sr_41: t(4.1, 'sustained'), none: t(0),
        heavy: t(0.8, 'plain', 100)
      };
    });
    expect(bands).toEqual({
      just_under_10: 'below-tested', at_10: 'possible', at_20: 'likely', under_40: 'likely', at_40: 'strong',
      sr_16: 'sr-placebo', sr_4: 'sr-tested', sr_41: 'untested', none: 'none', heavy: 'below-tested'
    });
  });

  test('studied-range flags', async ({ page }) => {
    const flags = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const ids = (phases) => B.studiedRangeFlags(phases).map((f) => f.id);
      return {
        normal: ids([{ doseGPerDay: 6.4, days: 28 }]),
        high: ids([{ doseGPerDay: 8, days: 28 }]),
        above: ids([{ doseGPerDay: 12.8, days: 14 }]),
        low: ids([{ doseGPerDay: 1.2, days: 42 }]),
        long: ids([{ doseGPerDay: 6.4, days: 120 }, { doseGPerDay: 3.2, days: 60 }])
      };
    });
    expect(flags).toEqual({ normal: [], high: ['dose-above-fit'], above: ['dose-above-any'], low: ['dose-below-fit'], long: ['duration'] });
  });

  test('evidence horizon: longest study at a comparable dose, then the longest washout', async ({ page }) => {
    const h = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const hz = (phases) => B.evidenceHorizon(phases, B.data.LOADING_OBSERVATIONS, B.data.WASHOUT_RATES);
      const long = hz([{ doseGPerDay: 6.4, days: 210 }]);
      return {
        short: hz([{ doseGPerDay: 6.4, days: 28 }]),
        long,
        longDay: [B.studiesCoveringDay(long, 100), B.studiesCoveringDay(long, 190), B.studiesCoveringDay(long, 300), B.studiesCoveringDay(long, 400)],
        high: hz([{ doseGPerDay: 12, days: 28 }]),
        low: hz([{ doseGPerDay: 1.6, days: 84 }])
      };
    });
    expect(h.short.loadingCoveredUntil).toBe(28);
    expect(h.short.washoutCoveredUntil).toBe(28 + 112);
    expect(h.long.loadingCoveredUntil).toBe(168);
    expect(h.long.loadingStudies[0].sourceId).toBe('saunders2017');
    expect(h.longDay[0]).toEqual({ phase: 'loading', covered: true, sourceIds: ['saunders2017'] });
    expect(h.longDay[1]).toEqual({ phase: 'loading', covered: false, sourceIds: ['saunders2017'] });
    expect(h.longDay[2]).toEqual({ phase: 'washout', covered: true, sourceIds: ['yamaguchi2021'] });
    expect(h.longDay[3].covered).toBe(false);
    // 12 g/day: only Church's 14-day check point is within a factor 1.5.
    expect(h.high.loadingCoveredUntil).toBe(14);
    expect(h.high.loadingStudies.map((s) => s.sourceId)).toEqual(['church2017']);
    // 1.6 g/day: Stellingwerff's 8 weeks.
    expect(h.low.loadingCoveredUntil).toBe(56);
  });

  test('price tiers and protocol cost from prices.csv', async ({ page }) => {
    const r = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const tiers = Object.fromEntries(Object.entries(B.data.PRICE_TIERS).map(([k, rows]) => [k, B.tierPerGram(rows)]));
      return { tiers, cost: B.protocolCost([{ doseGPerDay: 6.4, days: 28 }, { doseGPerDay: 1.6, days: 14 }], 0.05) };
    });
    const rows = csv('prices.csv').filter((p) => p.role === 'baseline');
    for (const [tier, range] of Object.entries(r.tiers)) {
      const perGram = rows.filter((p) => p.tier === tier).map((p) => Number(p.price_usd) / Number(p.grams));
      expect(range.low).toBeCloseTo(Math.min(...perGram), 9);
      expect(range.high).toBeCloseTo(Math.max(...perGram), 9);
    }
    expect(Object.keys(r.tiers).sort()).toEqual(['budget powder', 'carnosyn powder', 'sustained-release tablets']);
    expect(r.cost.perPhase[0].perWeek).toBeCloseTo(6.4 * 7 * 0.05, 9);
    expect(r.cost.total).toBeCloseTo((6.4 * 28 + 1.6 * 14) * 0.05, 9);
    expect(r.cost.grams).toBeCloseTo(201.6, 9);
  });
});

test.describe('page', () => {
  test('loads cleanly with the first-visit default', async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, PAGE);
    await expect.poll(() => page.evaluate(() => Boolean(window.BetaAlanine && window.BetaAlanine.ready))).toBe(true);
    await expect(page.locator('#protocolPreset')).toHaveValue('reference');
    await expect(page.locator('#cards')).toContainText('179.2 g');
    await expect(page.locator('#cards')).toContainText('14.8 mmol/kg dm');
    await expect(page.locator('#chart polygon.band').first()).toBeAttached();
    await expect(page.locator('details.disclaimer-card')).toHaveCount(1);
    await expect(page.locator('p.disclaimer')).toHaveCount(1);
    await expect(page.locator('#individualSwitch')).not.toBeChecked();
  });

  test('a study preset shows its reported schedule and its measured points', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#protocolPreset', 'hill2007');
    await expect(page.locator('#presetReport')).toContainText('1 h (9, 10, 11 and 12 am; 3, 4, 5 and 6 pm)');
    await expect(page.locator('#phaseList fieldset')).toHaveCount(4);
    await expect(page.locator('#chart circle.obs-point')).toHaveCount(2);
    await page.selectOption('#protocolPreset', 'stellingwerff-low');
    await expect(page.locator('#presetReport')).toContainText('Not reported');
    await expect(page.locator('#chart circle.obs-point')).toHaveCount(3);
    // Changing a phase makes it custom, and the points go: they no longer match the protocol.
    await page.fill('#phase0Dose', '2');
    await expect(page.locator('#protocolPreset')).toHaveValue('custom');
    await expect(page.locator('#chart circle.obs-point')).toHaveCount(0);
  });

  test('every study preset with an interval says so or says not reported', async ({ page }) => {
    await openTool(page);
    const presets = await page.evaluate(() => window.BetaAlanine.presets.PROTOCOL_PRESETS);
    for (const p of presets.filter((x) => x.reported)) expect(p.reported.interval.length, p.id).toBeGreaterThan(3);
    expect(presets.some((p) => p.id === 'stegen2014' && p.phases.some((ph) => ph.doseGPerDay <= 1.2))).toBe(true);
    expect(presets.some((p) => p.phases.some((ph) => ph.doseGPerDay > 6.4))).toBe(true);
  });

  test('the chart tooltip names the papers behind each edge, with links, by pointer and keyboard', async ({ page }) => {
    await openTool(page);
    await page.locator('#chart').scrollIntoViewIfNeeded();
    await page.locator('#chart').hover({ position: { x: 300, y: 150 } });
    const tip = page.locator('#chartTip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Low edge');
    await expect(tip).toContainText('High edge');
    await expect(tip.locator('a').first()).toHaveAttribute('href', /^https:/);
    await page.locator('#chart').focus();
    await page.keyboard.press('End');
    await expect(tip).toContainText('day 140');
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
  });

  test('a protocol past Saunders\' 24 weeks is shaded and flagged', async ({ page }) => {
    await openTool(page);
    await page.fill('#phase0Length', '30');
    await expect(page.locator('#flags')).toContainText('longer than the longest study');
    await expect(page.locator('#chart polygon.band-shaded')).toHaveCount(1);
    await expect(page.locator('#chart polyline.median-shaded')).toHaveCount(1);
  });

  test('the edge table covers each phase end and the washout end', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#protocolPreset', 'stellingwerff-high');
    await page.locator('#edgeFold > summary').click();
    const rows = page.locator('#edgeTable tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('End of phase 1');
    await expect(rows.nth(2)).toContainText('End of washout shown');
  });

  test('person-to-person switch, views, units and baseline', async ({ page }) => {
    await openTool(page);
    await page.locator('#individualSwitch').check();
    await expect(page.locator('#chartCaption')).toContainText('person-to-person');
    await page.selectOption('#massUnit', 'lb');
    await expect(page.locator('#bodyMass')).toHaveValue('154.3');
    await page.selectOption('#baselinePreset', 'women');
    await expect(page.locator('#baselineValue')).toHaveValue('17.5');
    await page.selectOption('#chartView', 'percent');
    await expect(page.locator('#chartCaption')).toContainText('percent of the baseline');
    // Tingling uses kg however mass is entered: 1.6 g at 154.3 lb is 22.9 mg/kg.
    await expect(page.locator('#servingTable')).toContainText('22.9');
  });

  test('last state survives a reload; saved protocols open and delete', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#protocolPreset', 'church2017');
    await page.locator('#individualSwitch').check();
    // Wait for the switch's own save: the preset change alone already stores church2017.
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('toolsHub.betaAlanine.last') || '{}')))
      .toMatchObject({ presetId: 'church2017', individual: true });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.BetaAlanine && window.BetaAlanine.ready))).toBe(true);
    await expect(page.locator('#protocolPreset')).toHaveValue('church2017');
    await expect(page.locator('#individualSwitch')).toBeChecked();

    await page.fill('#saveName', 'High dose test');
    await page.locator('#saveProtocol').click();
    await expect(page.locator('#saveStatus')).toContainText('Saved as "High dose test"');
    await page.locator('#resetAll').click();
    await expect(page.locator('#protocolPreset')).toHaveValue('reference');
    await page.locator('#openProtocol').click();
    await expect(page.locator('#protocolPreset')).toHaveValue('church2017');
    await expect(page.locator('#phase0Dose')).toHaveValue('12');
    await page.locator('#deleteProtocol').click();
    await expect(page.locator('#savedList')).toContainText('Nothing saved yet');
  });

  test('four phases survive a save and reload intact', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#protocolPreset', 'hill2007');
    await page.fill('#phase3Dose', '6.25');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('toolsHub.betaAlanine.last') || '')).toContain('6.25');
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.BetaAlanine && window.BetaAlanine.ready))).toBe(true);
    await expect(page.locator('#phaseList fieldset')).toHaveCount(4);
    await expect(page.locator('#phase3Dose')).toHaveValue('6.25');
    await expect(page.locator('#phase0Dose')).toHaveValue('4');
  });

  test('a browser that refuses storage still gets the default page', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
    });
    await openTool(page);
    await expect(page.locator('#cards')).toContainText('179.2 g');
    await page.locator('#saveProtocol').click();
    await expect(page.locator('#saveStatus')).toContainText('refused storage');
  });

  test('result text, links and chart labels clear AA contrast in both themes', async ({ page }) => {
    await openTool(page);
    // Paper lines and a study preset put links in the legend; the cards always carry some.
    await page.selectOption('#protocolPreset', 'stellingwerff-high');
    await page.locator('.legend input').first().check();
    await expect(page.locator('#cards a').first()).toBeAttached();
    await expectContrastAA(page, [
      '.panel a', '.card h3', '.card .value', '.card .range', '.card .sub', '.flag', '.field-note',
      '.legend-item', '.legend-title', '.legend label', '.preset-report', '.data-table th', '.data-table td'
    ].join(', '));
    // SVG text paints with fill, which the shared helper does not read.
    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(800);
      const worst = await page.evaluate(() => {
        const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
        const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
        const bg = lum(rgb(getComputedStyle(document.querySelector('#chartWrap').closest('.panel')).backgroundColor));
        let min = Infinity;
        for (const t of document.querySelectorAll('#chart text')) {
          const l = lum(rgb(getComputedStyle(t).fill));
          min = Math.min(min, (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05));
        }
        return min;
      });
      expect(worst, `${theme} chart text`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('a field outside its limits is used at the limit and named, never changed in silence', async ({ page }) => {
    await openTool(page);
    await page.fill('#bodyMass', '0');
    await expect(page.locator('#flags')).toContainText('Body mass of 0 kg is outside the 20 to 300 kg this page accepts, so 20 kg is used.');
    // 1.6 g per serving on the 20 kg limit, not on 1 kg.
    await expect(page.locator('#servingTable')).toContainText('80.0');
    await page.selectOption('#massUnit', 'lb');
    await expect(page.locator('#bodyMass')).toHaveAttribute('min', '44.1');
    await expect(page.locator('#bodyMass')).toHaveAttribute('max', '661.4');
    await page.fill('#bodyMass', '154.3');
    await expect(page.locator('#flags')).not.toContainText('Body mass');

    await page.fill('#baselineValue', '0');
    await expect(page.locator('#flags')).toContainText('so 1 mmol/kg dm is used');
    await page.fill('#baselineValue', '22.9');

    await page.fill('#phase0Dose', '100');
    await expect(page.locator('#flags')).toContainText('Phase 1 dose of 100 g/day is outside the 0 to 40 g/day');
    await expect(page.locator('#flags')).toContainText('above any dose studied');
    // Nothing within a factor of 1.5 of 40 g/day: the flag with no source must still show.
    await expect(page.locator('#flags')).toContainText('No study used a comparable daily dose');

    await page.fill('#phase0Dose', '0');
    await expect(page.locator('#flags')).toContainText('No beta-alanine is taken in this protocol');
    await expect(page.locator('#flags')).not.toContainText('comparable daily dose');
    await expect(page.locator('#flags')).not.toContainText('()');
  });

  test('the audit trail and sources link every source', async ({ page }) => {
    await openTool(page);
    await page.locator('#auditFold > summary').click();
    await expect(page.locator('#audit')).toContainText('Leave-one-paper-out');
    await expect(page.locator('#audit')).toContainText('inside');
    const ids = await page.evaluate(() => Object.keys(window.BetaAlanine.data.SOURCES));
    await expect(page.locator('#sourceList li')).toHaveCount(ids.length);
    await expect(page.locator('#howTo a[href="creatine-lab.html"]')).toHaveCount(1);
  });
});
