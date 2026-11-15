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

  test('the maintenance dose, taken after loading, holds the rise flat', async ({ page }) => {
    const r = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const loading = B.loadingPapers(B.data.LOADING_OBSERVATIONS).filter((p) => p.sourceId === 'saunders2017');
      const washouts = B.data.WASHOUT_RATES.filter((w) => w.sourceId === 'harris2009');
      const opts = { washoutDays: 0, loadingPapers: loading, washouts };
      const load = B.runBand({ ...opts, phases: [{ doseGPerDay: 6.4, days: 28 }] });
      const m = load.summary.maintenanceAtStop.p50;
      const held = B.runBand({ ...opts, phases: [{ doseGPerDay: 6.4, days: 28 }, { doseGPerDay: m, days: 84 }] });
      const level = held.p50[28];
      let worst = 0;
      for (let d = 28; d <= 112; d++) worst = Math.max(worst, Math.abs(held.p50[d] - level) / level);
      return { m, level, stop: load.p50[28], worst };
    });
    expect(r.level).toBeCloseTo(r.stop, 9);
    expect(r.worst).toBeLessThan(1e-9);
    expect(r.m).toBeGreaterThan(0);
  });

  test('the maintenance dose depends on the washout rate only, not the loading paper or the person', async ({ page }) => {
    const r = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const base = { phases: [{ doseGPerDay: 6.4, days: 28 }], washoutDays: 0, observations: B.data.LOADING_OBSERVATIONS, washouts: B.data.WASHOUT_RATES };
      const off = B.runBand(base);
      const on = B.runBand({ ...base, individual: true });
      // Each draw's dose is kd times the unit curve, whatever its slope or factor.
      let worst = 0;
      on.tags.forEach((t, i) => {
        const kd = B.kdFromHalfLife(t.halfLife);
        const got = B.maintenanceDose(on.values[i * (on.lastDay + 1) + 28], t.slope * t.factor, kd);
        worst = Math.max(worst, Math.abs(got - kd * B.unitRise([[0, 28, 6.4]], 28, kd)));
      });
      return { off: off.summary.maintenanceAtStop, on: on.summary.maintenanceAtStop, worst };
    });
    expect(r.on).toEqual(r.off);
    expect(r.worst).toBeLessThan(1e-9);
    // Golden from this build: 2.3 g/day holds the reference load, 1.8 to 3.0.
    expect(r.off.p50).toBeCloseTo(2.28, 1);
    expect(r.off.p10).toBeGreaterThan(1.6);
    expect(r.off.p90).toBeLessThan(3.2);
  });

  test('Stegen 2014: 1.2 g/day after loading ends 30 to 50% above Stegen\'s own baseline, as reported', async ({ page }) => {
    const r = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const preset = B.presets.PROTOCOL_PRESETS.find((p) => p.id === 'stegen2014');
      const b = B.runBand({ phases: preset.phases.map((p) => ({ doseGPerDay: p.doseGPerDay, days: p.days })), washoutDays: 0,
        observations: B.data.LOADING_OBSERVATIONS, washouts: B.data.WASHOUT_RATES });
      const c = B.data.CLAIMS;
      return { pct: (100 * b.p50[b.stopDay]) / c.stegen_baseline_12.value, kept: b.p50[88] / b.p50[46],
        keep08: c.maintenance_keep_08.value, keep12: c.maintenance_keep_12.value };
    });
    // Baseline of Stegen's 1.2 g/day group, Table 1: 4.47 mM by MRS, 19.2 mmol/kg dm.
    expect(r.pct).toBeGreaterThanOrEqual(30);
    expect(r.pct).toBeLessThanOrEqual(50);
    // The model keeps less of the gain on 1.2 g/day than Stegen measured (103%), though
    // more than their 0.8 g/day group (77%): it holds low doses less well than measured.
    expect(r.kept).toBeGreaterThan(r.keep08);
    expect(r.kept).toBeLessThan(r.keep12);
  });

  test('a goal dose is the goal over each draw\'s rise at 1 g/day, and taking it lands on the goal', async ({ page }) => {
    const r = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const common = { observations: B.data.LOADING_OBSERVATIONS, washouts: B.data.WASHOUT_RATES };
      const g = B.doseForGoal({ ...common, goal: 10, days: 28 });
      const at = (dose) => B.runBand({ ...common, phases: [{ doseGPerDay: dose, days: 28 }], washoutDays: 0 });
      return { g, mid: at(g.p50).p50[28], high: at(g.p10).p90[28], low: at(g.p90).p10[28],
        none: B.doseForGoal({ ...common, goal: 0, days: 28 }) };
    });
    // The median of goal/v is goal over the median of v, up to the two middle draws.
    expect(r.mid).toBeCloseTo(10, 1);
    expect(r.high).toBeCloseTo(10, 1);
    expect(r.low).toBeCloseTo(10, 1);
    expect(r.g.p10).toBeLessThan(r.g.p50);
    expect(r.g.p50).toBeLessThan(r.g.p90);
    expect(r.g.p50).toBeCloseTo(6.4 * 10 / 14.81, 1);
    expect(r.none).toBeNull();
  });

  test('a goal dose is given only inside the fitted doses, and servings stay under 20 mg/kg', async ({ page }) => {
    const r = await page.evaluate(() => {
      const B = window.BetaAlanine;
      return { inside: B.goalDoseUsable({ p50: 4 }), low: B.goalDoseUsable({ p50: 1.59 }), high: B.goalDoseUsable({ p50: 6.41 }),
        edges: [B.goalDoseUsable({ p50: 1.6 }), B.goalDoseUsable({ p50: 6.4 })], none: B.goalDoseUsable(null),
        s64: B.servingsUnderLikely(6.4, 70), s43: B.servingsUnderLikely(4.3, 70), cap: B.servingsUnderLikely(40, 20), zero: B.servingsUnderLikely(0, 70) };
    });
    expect(r).toEqual({ inside: true, low: false, high: false, edges: [true, true], none: false, s64: 5, s43: 4, cap: 24, zero: 1 });
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
        sr_16: t(1.6, 'sustained'), sr_4: t(4, 'sustained'), sr_41: t(4.1, 'sustained'), sr_5: t(5, 'sustained'),
        sr_51: t(5.1, 'sustained'), sr_8: t(8, 'sustained'), sr_81: t(8.1, 'sustained'), none: t(0),
        heavy: t(0.8, 'plain', 100)
      };
    });
    expect(bands).toEqual({
      just_under_10: 'below-tested', at_10: 'possible', at_20: 'likely', under_40: 'likely', at_40: 'strong',
      sr_16: 'sr-placebo', sr_4: 'sr-tested', sr_41: 'sr-mild', sr_5: 'sr-mild', sr_51: 'sr-likely', sr_8: 'sr-likely',
      sr_81: 'untested', none: 'none', heavy: 'below-tested'
    });
  });

  test('a plain phase in the likely band gets a split that brings each serving under 20 mg/kg', async ({ page }) => {
    const r = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const s = (doseGPerDay, servings, form = 'plain', bodyMassKg = 70) => B.lowerTinglingSplit({ doseGPerDay, servings, form, bodyMassKg });
      return { reference: s(6.4, 4), possible: s(3.2, 4), sustained: s(6.4, 4, 'sustained'), none: s(0, 4),
        edge: s(2.8, 2), big: s(40, 1, 'plain', 20), five: s(5, 2) };
    });
    // 6.4 g at 70 kg: 4 servings are 22.9 mg/kg, 5 are 18.3.
    expect(r.reference.servings).toBe(5);
    expect(r.reference.gramsPerServing).toBeCloseTo(1.28, 9);
    expect(r.reference.mgPerKg).toBeLessThan(20);
    expect(r.reference.srServings).toBe(4);
    expect(r.possible).toBeNull();
    expect(r.sustained).toBeNull();
    expect(r.none).toBeNull();
    // Exactly 20 mg/kg is in the likely band, so it needs one more serving.
    expect(r.edge.servings).toBe(3);
    expect(r.big.servings).toBe(101);
    // 5 g in sustained-release servings of 1.6 g or less takes 4, not the 3 rounding would give.
    expect(r.five.srServings).toBe(4);
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

// Read the chart back through its own axis ticks: every median point and band
// corner is mapped to a day and a value and compared with the band in the view
// on screen. Returns the worst error as a share of the axis top.
const chartAgreement = () => {
  const svg = document.getElementById('chart');
  const band = window.BetaAlanine.lastBand;
  const view = document.getElementById('chartView').value;
  const base = Number(document.getElementById('baselineValue').value);
  const to = { rise: (v) => v, total: (v) => base + v, percent: (v) => (100 * v) / base }[view];
  const fit = (pairs) => {
    const [a, b] = [pairs[0], pairs[pairs.length - 1]];
    const m = (b[1] - a[1]) / (b[0] - a[0]);
    return { from: (px) => a[0] + (px - a[1]) / m, top: Math.max(a[0], b[0]) };
  };
  const Y = fit([...svg.querySelectorAll('g.axis text[text-anchor="end"]')].map((t) => [Number(t.textContent), Number(t.getAttribute('y')) - 4]));
  const X = fit([...svg.querySelectorAll('g.axis text[text-anchor="middle"]')].map((t) => [Number(t.textContent) * 7, Number(t.getAttribute('x'))]));
  const pts = (node) => node.getAttribute('points').trim().split(/\s+/).map((p) => p.split(',').map(Number));
  let worst = 0;
  const days = new Set();
  for (const line of svg.querySelectorAll('polyline.median')) {
    for (const [px, py] of pts(line)) {
      const day = Math.round(X.from(px));
      days.add(day);
      worst = Math.max(worst, Math.abs(Y.from(py) - to(band.p50[day])) / Y.top);
    }
  }
  const edges = new Map();
  for (const poly of svg.querySelectorAll('polygon.band')) {
    for (const [px, py] of pts(poly)) {
      const day = Math.round(X.from(px));
      const e = edges.get(day) || [];
      e.push(Y.from(py));
      edges.set(day, e);
    }
  }
  for (const [day, vals] of edges) {
    worst = Math.max(worst, Math.abs(Math.max(...vals) - to(band.p90[day])) / Y.top, Math.abs(Math.min(...vals) - to(band.p10[day])) / Y.top);
  }
  // Against the plot frame, not the ticks: day 0 and the last day sit on the
  // grid's ends, and nothing is drawn above the top line or below the bottom.
  const grid = [...svg.querySelectorAll('g.grid line')];
  const left = Number(grid[0].getAttribute('x1'));
  const right = Number(grid[0].getAttribute('x2'));
  const ys = grid.map((g) => Number(g.getAttribute('y1')));
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
  const all = [...svg.querySelectorAll('polygon.band, polyline.median')].flatMap(pts);
  const xs = all.map(([px]) => px);
  const frame = Math.max(Math.abs(Math.min(...xs) - left), Math.abs(Math.max(...xs) - right));
  const outside = all.filter(([, py]) => py < top - 0.5 || py > bottom + 0.5).length;
  return { worst, days: days.size, lastDay: band.lastDay, frame, outside };
};

// Value at an SVG y coordinate, read from the y-axis ticks.
const Y_FROM = `(() => {
  const ticks = [...document.querySelectorAll('#chart g.axis text[text-anchor="end"]')].map((t) => [Number(t.textContent), Number(t.getAttribute('y')) - 4]);
  const [a, b] = [ticks[0], ticks[ticks.length - 1]];
  return (py) => a[0] + ((py - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
})()`;

test.describe('literature anchors', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('every anchor gives the verdict this model version states', async ({ page }) => {
    const anchors = await page.evaluate(() => window.BetaAlanine.anchors.map((a) => ({ id: a.id, verdict: a.verdict, expected: a.expected })));
    expect(anchors.map((a) => a.id)).toEqual(['rezende_4wk', 'saunders_wk4', 'saunders_wk12', 'saunders_wk24', 'delfavero_older', 'stegen_12', 'incorporation']);
    for (const a of anchors) expect(a.verdict, a.id).toBe(a.expected);
    // The one known miss: past week 12 the model runs above the only 24-week study.
    expect(anchors.filter((a) => a.verdict !== 'inside').map((a) => a.id)).toEqual(['saunders_wk24']);
  });

  test('anchor measurements are the archived figures, not numbers typed into the module', async ({ page }) => {
    const r = await page.evaluate(() => Object.fromEntries(window.BetaAlanine.anchors.map((a) => [a.id, a.measured])));
    const obs = csv('loading_observations.csv').filter((o) => o.source_id === 'saunders2017');
    const rise = (day) => Number(obs.find((o) => Number(o.day) === day).rise_mmol_kg_dm);
    expect(r.saunders_wk4).toBeCloseTo(rise(28), 6);
    expect(r.saunders_wk12).toBeCloseTo(rise(84), 6);
    expect(r.saunders_wk24).toBeCloseTo(rise(168), 6);
    // Saunders 2017 abstract: +11.37, +16.95 and +20.15 mmol/kg dm.
    expect([rise(28), rise(84), rise(168)]).toEqual([11.37, 16.95, 20.15]);
    const claims = Object.fromEntries(csv('claims.csv').map((c) => [c.claim_id, c]));
    expect(r.delfavero_older).toBeCloseTo(Number(claims.elderly_rise.value) * 100, 6);
    expect(r.incorporation).toBeCloseTo(Number(claims.incorporation_yamaguchi.value) * 100, 6);
    expect(claims.response_sd.claim).toContain('14.0 (10.1-18.1)');
    expect(r.rezende_4wk).toBe(14.0);
  });

  test('the anchor protocols are run as the papers describe them', async ({ page }) => {
    const r = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const common = { observations: B.data.LOADING_OBSERVATIONS, washouts: B.data.WASHOUT_RATES, washoutDays: 0 };
      const a = Object.fromEntries(B.anchors.map((x) => [x.id, x.model]));
      const df = B.runBand({ ...common, phases: [{ doseGPerDay: 3.2, days: 84 }] });
      const older = B.presets.BASELINE_PRESETS.find((p) => p.id === 'older').value;
      return { a, ref28: B.lastBand.p50[28], df84: df.p50[84], older, ageDrop: B.data.CLAIMS.age_drop.value };
    });
    // 4 weeks at 6.4 g/day is the band golden.
    expect(r.a.rezende_4wk.p50).toBeCloseTo(14.81, 2);
    // del Favero: 3.2 g/day for 12 weeks over the older-adult baseline, 22.9 less 15%.
    expect(r.older).toBe(19.5);
    expect(r.older).toBeCloseTo(22.9 * (1 - r.ageDrop), 1);
    expect(r.a.delfavero_older.p50).toBeCloseTo((100 * r.df84) / 19.5, 6);
    // Incorporation worked out here: rise x dry muscle (40% of 70 kg, wet to dry 4.3) over mmol taken.
    const share = (14.81 * (70 * 0.4 / WET_TO_DRY)) / ((6.4 * 28 / 89.09) * 1000) * 100;
    expect(r.a.incorporation.p50).toBeCloseTo(share, 1);
    expect(r.a.incorporation.p50).toBeGreaterThan(3);
    expect(r.a.incorporation.p50).toBeLessThan(6);
  });

  test('the audit trail prints each anchor with its verdict', async ({ page }) => {
    await page.locator('#auditFold > summary').click();
    const rows = page.locator('#anchorTable tbody tr');
    await expect(rows).toHaveCount(7);
    const verdicts = await rows.evaluateAll((tr) => tr.map((r) => [r.dataset.anchor, r.dataset.verdict]));
    const want = await page.evaluate(() => window.BetaAlanine.anchors.map((a) => [a.id, a.expected]));
    expect(verdicts).toEqual(want);
    await expect(page.locator('#anchorTable tr[data-anchor="saunders_wk24"]')).toContainText('Model above');
    await expect(page.locator('#anchorTable tr[data-anchor="saunders_wk24"]')).toContainText('+20.15 mmol/kg dm');
    await expect(page.locator('#anchorTable tr[data-anchor="delfavero_older"]')).toContainText('+85.4% (gastrocnemius)');
  });

  test('new claims carry the figures in the papers', async () => {
    const c = Object.fromEntries(csv('claims.csv').map((x) => [x.claim_id, x]));
    const v = (id) => Number(c[id].value);
    expect([v('urine_cc'), v('urine_tt'), v('plasma_half_life'), v('fate_incorporation')]).toEqual([0.018, 0.036, 0.75, 0.06]);
    expect([v('tingle_sr_5g'), v('tingle_sr_8g'), v('age_drop'), v('elderly_rise')]).toEqual([5, 8, 0.15, 0.854]);
    expect([v('taurine_24wk'), v('taurine_meta'), v('taurine_rodent'), v('side_effects_meta')]).toEqual([35.42, 0.156, 38, 8.9]);
    expect(c.urine_cc.claim).toContain('25 +/- 10 mg');
    expect(c.urine_tt.claim).toContain('50 +/- 19 mg');
    expect(c.taurine_24wk.claim).toContain('33.67, 35.93 and 35.42');
    expect(c.fate_transaminases.claim).toContain('GABA-T and AGXT2');
    expect(c.breakfast_profile.claim).toContain('7 of 60');
    // Every claim's source is archived, with its PDF hash in the manifest.
    const manifest = Object.fromEntries(csv('download_manifest.csv').map((m) => [m.source_id, m]));
    for (const id of ['urine_cc', 'fate_transaminases', 'plasma_half_life', 'plasma_half_life_sr8', 'tau_t_down', 'taurine_24wk', 'taurine_meta',
      'breakfast_profile', 'tingle_sr_5g', 'tingle_sr_8g', 'age_drop', 'elderly_rise']) {
      expect(manifest[c[id].source_id], id).toBeTruthy();
    }
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
    // Five plain servings of 1.28 g: under 20 mg/kg at 70 kg, so no split is suggested.
    await expect(page.locator('#phase0Servings')).toHaveValue('5');
    await expect(page.locator('#servingTable')).toContainText('Possible, usually mild');
    await expect(page.locator('#servingTable .split-hint')).toHaveCount(0);
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
    // Tingling uses kg however mass is entered: 1.28 g at 154.3 lb is 18.3 mg/kg.
    await expect(page.locator('#servingTable')).toContainText('18.3');
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
      '.legend-item', '.legend-title', '.legend label', '.preset-report', '.data-table th', '.data-table td', '.fate h3', '.fate > p'
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
    // 1.28 g per serving on the 20 kg limit, not on 1 kg.
    await expect(page.locator('#servingTable')).toContainText('64.0');
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

  test('the maintenance card and the split suggestion', async ({ page }) => {
    await openTool(page);
    await expect(page.locator('#cards')).toContainText('Daily dose to hold that level');
    await expect(page.locator('#cards')).toContainText('2.3 g/day');
    await page.fill('#phase0Servings', '4');
    await expect(page.locator('#servingTable .split-hint')).toContainText('5 plain servings of 1.28 g (18.3 mg/kg each, under 20)');
    await expect(page.locator('#servingTable .split-hint')).toContainText('4 sustained-release servings of 1.60 g');
    await page.selectOption('#phase0Form', 'sustained');
    await expect(page.locator('#servingTable .split-hint')).toHaveCount(0);
    await page.selectOption('#protocolPreset', 'stegen2014');
    // The model's figure is about 1.4 g/day, under the fitted 1.6: no number, the measured results instead.
    const hold = page.locator('#cards .card', { hasText: 'Daily dose to hold that level' });
    await expect(hold).toHaveClass(/card-refused/);
    await expect(hold).toContainText('No estimate');
    await expect(hold).toContainText('below 1.6 g/day');
    await expect(hold).not.toContainText('1.4 g/day');
    await expect(hold).toContainText('1.2 g/day kept 103% of the gain, 0.8 g/day 77% and 0.4 g/day 59%');
    await expect(hold).toContainText('about 18 mg/kg a day (1.26 g/day at your body mass)');
    await page.fill('#bodyMass', '60');
    await expect(hold).toContainText('(1.08 g/day at your body mass)');
    await page.fill('#bodyMass', '70');
    await page.fill('#phase0Dose', '0');
    await page.fill('#phase1Dose', '0');
    await expect(page.locator('#cards')).not.toContainText('Daily dose to hold that level');
  });

  test('the chart draws the median and band where the numbers are, in every view', async ({ page }) => {
    await openTool(page);
    for (const view of ['rise', 'total', 'percent']) {
      await page.selectOption('#chartView', view);
      const r = await page.evaluate(`(${chartAgreement.toString()})()`);
      expect(r.days, view).toBe(r.lastDay + 1);
      expect(r.worst, view).toBeLessThan(0.003);
      expect(r.frame, view).toBeLessThan(0.11);
      expect(r.outside, view).toBe(0);
    }
    // A shaded stretch is drawn in its own runs; together they still cover every day.
    await page.selectOption('#chartView', 'rise');
    await page.fill('#washoutWeeks', '30');
    await expect(page.locator('#chart polygon.band-shaded')).toHaveCount(1);
    const r = await page.evaluate(`(${chartAgreement.toString()})()`);
    expect(r.days).toBe(r.lastDay + 1);
    expect(r.worst).toBeLessThan(0.003);
  });

  test('a washout past the longest follow-up is hatched from that day and the hover names it', async ({ page }) => {
    await openTool(page);
    await page.fill('#washoutWeeks', '30');
    const hatch = page.locator('#chart rect.beyond');
    await expect(hatch).toHaveCount(1);
    // Hatching starts at day 28 + 112, the end of Yamaguchi's 16-week follow-up.
    const at = await page.evaluate(() => {
      const ticks = [...document.querySelectorAll('#chart g.axis text[text-anchor="middle"]')].map((t) => [Number(t.textContent) * 7, Number(t.getAttribute('x'))]);
      const [a, b] = [ticks[0], ticks[ticks.length - 1]];
      return a[1] + ((b[1] - a[1]) / (b[0] - a[0])) * (140 - a[0]);
    });
    expect(Number(await hatch.getAttribute('x'))).toBeCloseTo(at, 0);
    // The lighter band starts on that same day, not a day either side.
    const shadedFrom = await page.evaluate(() => Math.min(...document.querySelector('#chart polygon.band-shaded')
      .getAttribute('points').trim().split(/\s+/).map((p) => Number(p.split(',')[0]))));
    expect(shadedFrom).toBeCloseTo(at, 0);
    await page.locator('#chart').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#chartTip')).toContainText('No washout study followed people this long');
    await expect(page.locator('#chartTip')).toContainText('Yamaguchi');
    await page.keyboard.press('Home');
    await expect(page.locator('#chartTip')).toContainText('(day 0)');
  });

  test('pointer position maps to the day under it', async ({ page }) => {
    await openTool(page);
    const chart = page.locator('#chart');
    await chart.scrollIntoViewIfNeeded();
    const pos = await page.evaluate(() => {
      const svg = document.getElementById('chart');
      const t = [...svg.querySelectorAll('g.axis text[text-anchor="middle"]')].find((n) => n.textContent === '4');
      const box = svg.getBoundingClientRect();
      return { x: (Number(t.getAttribute('x')) / svg.viewBox.baseVal.width) * box.width, y: box.height / 2 };
    });
    await chart.hover({ position: pos });
    await expect(page.locator('#chartTip')).toContainText('(day 28)');
  });

  test('measured points leave in the percent view and come back at baseline plus rise', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#protocolPreset', 'hill2007');
    await expect(page.locator('#chart circle.obs-point')).toHaveCount(2);
    await page.selectOption('#chartView', 'percent');
    await expect(page.locator('#chart circle.obs-point')).toHaveCount(0);
    await page.selectOption('#chartView', 'total');
    await expect(page.locator('#chart circle.obs-point')).toHaveCount(2);
    const r = await page.evaluate(`(() => {
      const from = ${Y_FROM};
      const base = Number(document.getElementById('baselineValue').value);
      const obs = window.BetaAlanine.data.LOADING_OBSERVATIONS.filter((o) => o.sourceId === 'hill2007').sort((a, b) => a.day - b.day);
      const circles = [...document.querySelectorAll('#chart circle.obs-point')]
        .map((c) => ({ cx: Number(c.getAttribute('cx')), v: from(Number(c.getAttribute('cy'))) })).sort((a, b) => a.cx - b.cx);
      return circles.map((c, i) => [c.v, base + obs[i].rise]);
    })()`);
    for (const [drawn, want] of r) expect(drawn).toBeCloseTo(want, 1);
  });

  test('paper lines draw that paper\'s own median, dashed for washout, and stay on after a reload', async ({ page }) => {
    await openTool(page);
    await page.locator('#line-loading-saunders2017').check();
    await page.locator('#line-washout-baguet2009').check();
    const lines = page.locator('#chart polyline.paper-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toHaveAttribute('stroke-dasharray', 'none');
    await expect(lines.nth(1)).toHaveAttribute('stroke-dasharray', '5 3');
    const r = await page.evaluate(`(() => {
      const from = ${Y_FROM};
      const B = window.BetaAlanine;
      const want = B.paperMedian(B.lastBand, 'loading', 'saunders2017');
      const ys = document.querySelector('#chart polyline.paper-line').getAttribute('points').trim().split(/\\s+/).map((p) => Number(p.split(',')[1]));
      return { count: ys.length, last: B.lastBand.lastDay, worst: Math.max(...ys.map((py, d) => Math.abs(from(py) - want[d]))) };
    })()`);
    expect(r.count).toBe(r.last + 1);
    expect(r.worst).toBeLessThan(0.1);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('toolsHub.betaAlanine.last') || '{}').paperLines))
      .toBe('loading:saunders2017,washout:baguet2009');
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.BetaAlanine && window.BetaAlanine.ready))).toBe(true);
    await expect(page.locator('#line-loading-saunders2017')).toBeChecked();
    await expect(lines).toHaveCount(2);
    await page.locator('#line-loading-saunders2017').uncheck();
    await expect(lines).toHaveCount(1);
  });

  test('your own price gives cost per gram, per week, in total and per unit of rise', async ({ page }) => {
    await openTool(page);
    await expect(page.locator('#costCards .card')).toHaveCount(3);
    await page.fill('#ownPrice', '30');
    await page.fill('#ownGrams', '500');
    const own = page.locator('#costCards .card').first();
    await expect(own).toContainText('Your price');
    // $0.06 a gram: 179.2 g is $10.75, 6.4 g/day is $2.69 a week, and over a 14.81 rise $0.73.
    await expect(own).toContainText('$0.060 per gram');
    await expect(own).toContainText('phase 1 $2.69 a week');
    await expect(own).toContainText('$11 total');
    await expect(own).toContainText('$0.73 per mmol/kg dm');
    await page.fill('#ownGrams', '');
    await expect(page.locator('#costCards')).not.toContainText('Your price');
    await expect(page.locator('#costCards .card')).toHaveCount(3);
  });

  test('no sideways scroll on a phone, and the chart redraws at its container\'s width', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openTool(page);
    await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
    await page.locator('.legend input').first().check();
    const narrow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      vb: document.getElementById('chart').viewBox.baseVal.width,
      vh: document.getElementById('chart').viewBox.baseVal.height
    }));
    expect(narrow.scroll).toBe(0);
    expect(narrow.vb).toBeLessThan(600);
    expect(narrow.vh).toBe(300);
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect.poll(() => page.evaluate(() => document.getElementById('chart').viewBox.baseVal.height)).toBe(380);
    const wide = await page.evaluate(() => ({ vb: document.getElementById('chart').viewBox.baseVal.width, box: document.getElementById('chartWrap').clientWidth }));
    expect(Math.abs(wide.vb - Math.min(1100, wide.box))).toBeLessThanOrEqual(1);
  });

  test('the cards and the edge table print the band summary they were given', async ({ page }) => {
    await openTool(page);
    // The default protocol is covered by studies, so no flag at all.
    await expect(page.locator('#flags .flag')).toHaveCount(0);
    const want = await page.evaluate(() => {
      const b = window.BetaAlanine.lastBand;
      const s = b.summary;
      return {
        target: `${s.daysToTarget.p50.toFixed(0)} days`,
        normal: `${(s.daysToNormal.p50 / 7).toFixed(1)} weeks`,
        stop: [b.p10[b.stopDay], b.p50[b.stopDay], b.p90[b.stopDay]].map((v) => v.toFixed(1))
      };
    });
    await expect(page.locator('#cards')).toContainText(`Days to a rise of 10.0${want.target}`);
    await expect(page.locator('#cards')).toContainText(`Back within normal variation after stopping${want.normal}`);
    // Baseline grams: 22.9 mmol/kg dm over the muscle mass the card names, wet to dry 4.3.
    const grams = page.locator('#cards .card', { hasText: 'Carnosine in muscle' });
    const kg = Number((await grams.innerText()).match(/in ([\d.]+) kg of skeletal muscle/)[1]);
    await expect(grams).toContainText(`on about ${((22.9 * (kg / 4.3) * 226.23) / 1000).toFixed(0)} g at baseline`);
    await page.locator('#edgeFold > summary').click();
    const row = page.locator('#edgeTable tbody tr', { hasText: 'End of dosing' });
    const cells = await row.locator('td.num').allInnerTexts();
    expect(cells).toEqual(want.stop);
  });

  test('the tooltip prints the day\'s band and edge shares, and arrows step a day or a week', async ({ page }) => {
    await openTool(page);
    await page.locator('#chart').focus();
    const tip = page.locator('#chartTip');
    // Focus opens on the end of dosing.
    await expect(tip).toContainText('(day 28)');
    const want = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const b = B.lastBand;
      const named = (e) => e.named.washout.concat(e.named.loading).map((n) => `${Math.round(n.share * 100)}%`);
      return {
        band: `middle ${b.p50[28].toFixed(1)} mmol/kg dm, 10th to 90th percentile ${b.p10[28].toFixed(1)} to ${b.p90[28].toFixed(1)}.`,
        low: named(B.attributeEdge(b, 28, 0.1)),
        high: named(B.attributeEdge(b, 28, 0.9))
      };
    });
    await expect(tip).toContainText(want.band);
    const [low, high] = await tip.locator('p').nth(1).innerText().then(async (l) => [l, await tip.locator('p').nth(2).innerText()]);
    for (const pct of want.low) expect(low).toContain(pct);
    for (const pct of want.high) expect(high).toContain(pct);
    await page.keyboard.press('ArrowRight');
    await expect(tip).toContainText('(day 29)');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(tip).toContainText('(day 36)');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(tip).toContainText('(day 28)');
  });

  test('the normal-variation strip sits on zero in the rise view and around baseline in the total view', async ({ page }) => {
    await openTool(page);
    const strip = async () => page.evaluate(`(() => {
      const from = ${Y_FROM};
      const r = document.querySelector('#chart rect.normal-strip');
      const y = Number(r.getAttribute('y'));
      return [from(y + Number(r.getAttribute('height'))), from(y)];
    })()`);
    const [lo, hi] = await strip();
    expect(lo).toBeCloseTo(0, 1);
    expect(hi).toBeCloseTo(4.1, 1);
    await page.selectOption('#chartView', 'total');
    await expect(page.locator('#chartCaption')).toContainText('Baseline plus the rise');
    const [tlo, thi] = await strip();
    expect(tlo).toBeCloseTo(22.9 - 4.1, 1);
    expect(thi).toBeCloseTo(22.9 + 4.1, 1);
  });

  test('crowded phase boundaries keep their lines but not overlapping labels', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#protocolPreset', 'hill2007');
    for (const i of [0, 1, 2]) {
      await page.selectOption(`#phase${i}Unit`, 'days');
      await page.fill(`#phase${i}Length`, '2');
    }
    await expect(page.locator('#chart line.phase-line')).toHaveCount(4);
    const xs = await page.locator('#chart text.phase-label').evaluateAll((ts) => ts.map((t) => Number(t.getAttribute('x'))));
    expect(xs.length).toBeLessThan(4);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(64);
    // A zero-length phase puts two boundaries on one day; only one gets a label.
    await page.selectOption('#protocolPreset', 'hill2007');
    await page.fill('#phase1Length', '0');
    await page.fill('#phase2Length', '8');
    await expect(page.locator('#chart line.phase-line')).toHaveCount(4);
    await expect(page.locator('#chart text.phase-label').first()).toHaveText('Phase 2');
    const same = await page.locator('#chart text.phase-label').evaluateAll((ts) => ts.map((t) => Number(t.getAttribute('x'))));
    for (let i = 1; i < same.length; i++) expect(same[i] - same[i - 1]).toBeGreaterThanOrEqual(64);
  });

  test('a phase entered in days comes back in days after a reload', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#phase0Unit', 'days');
    await page.fill('#phase0Length', '10');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('toolsHub.betaAlanine.last') || '{}').phases)).toBe('6.4|5|p|10|d');
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.BetaAlanine && window.BetaAlanine.ready))).toBe(true);
    await expect(page.locator('#phase0Unit')).toHaveValue('days');
    await expect(page.locator('#phase0Length')).toHaveValue('10');
    await expect(page.locator('#cards')).toContainText('Beta-alanine taken64.0 g');
  });

  test('dose for a goal: a figure in range, none outside it, the long-study note, and use as protocol', async ({ page }) => {
    await openTool(page);
    const card = page.locator('#goalResult .card');
    const button = page.locator('#useGoalDose');
    await expect(card).toContainText('Daily dose for a rise of 10.0 by week 4');
    await expect(card).toContainText('4.3 g/day');
    await expect(button).toBeEnabled();
    await page.fill('#goalRise', '40');
    await expect(card).toContainText('No estimate');
    await expect(card).toContainText('more than 6.4 g/day');
    await expect(card).toHaveClass(/card-refused/);
    await expect(button).toBeDisabled();
    await page.fill('#goalRise', '2');
    await page.fill('#goalWeeks', '12');
    await expect(card).toContainText('less than 1.6 g/day');
    await page.fill('#goalRise', '20');
    await expect(card).toContainText('where Saunders measured +16.9 by week 12');
    await page.fill('#goalWeeks', '30');
    await expect(page.locator('#flags')).toContainText('Goal week of 30 weeks is outside the 1 to 24 weeks');
    await page.fill('#goalWeeks', '4');
    await page.fill('#goalRise', '10');
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.locator('#protocolPreset')).toHaveValue('custom');
    await expect(page.locator('#phaseList fieldset')).toHaveCount(1);
    await expect(page.locator('#phase0Dose')).toHaveValue('4.3');
    await expect(page.locator('#phase0Servings')).toHaveValue('4');
    await expect(page.locator('#phase0Length')).toHaveValue('4');
    // Servings follow body mass: 4.3 g at 100 kg is under 20 mg/kg in 3 servings.
    await page.fill('#bodyMass', '100');
    await button.click();
    await expect(page.locator('#phase0Servings')).toHaveValue('3');
    await page.fill('#bodyMass', '70');
    await expect(page.locator('#cards .card').first()).toContainText('10.0 mmol/kg dm');
    // The goal survives a reload.
    await page.fill('#goalRise', '12');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('toolsHub.betaAlanine.last') || '{}').goalRise)).toBe('12');
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.BetaAlanine && window.BetaAlanine.ready))).toBe(true);
    await expect(page.locator('#goalRise')).toHaveValue('12');
  });

  test('where it goes: stored, urine and broken down add to 100% and follow the protocol', async ({ page }) => {
    await openTool(page);
    const fate = page.locator('#fate');
    const want = await page.evaluate(() => {
      const B = window.BetaAlanine;
      const b = B.lastBand;
      return { rise: b.summary.riseAtStop.p50 };
    });
    const stored = page.locator('#fate .card', { hasText: 'Stored as muscle carnosine' });
    const kg = Number((await page.locator('#cards .card', { hasText: 'Carnosine in muscle' }).innerText()).match(/in ([\d.]+) kg of skeletal muscle/)[1]);
    const inc = (want.rise * (kg / WET_TO_DRY)) / ((179.2 / 89.09) * 1000) * 100;
    await expect(stored).toContainText(`${inc.toFixed(1)}%`);
    await expect(stored).toContainText(`about ${(179.2 * inc / 100).toFixed(1)} g of the 179.2 g taken`);
    await expect(page.locator('#fate .card', { hasText: 'Lost in urine' })).toContainText('1.8 to 3.6%');
    // 1.8% and 3.6% of 179.2 g.
    await expect(page.locator('#fate .card', { hasText: 'Lost in urine' })).toContainText('about 3.2 to 6.5 g');
    await expect(page.locator('#fate .card', { hasText: 'Broken down' })).toContainText(`about ${(100 - inc - 3.6).toFixed(0)} to ${(100 - inc - 1.8).toFixed(0)}%`);
    await expect(fate).toContainText('GABA-T and AGXT2');
    await expect(fate).toContainText('either enzyme can cover for the other');
    await expect(fate.locator('a', { hasText: 'Blancquaert' }).first()).toHaveAttribute('href', /10\.1113\/JP272050/);
    // The slowdown paragraph prints the week 24 anchor, not a typed number.
    const s24 = await page.evaluate(() => window.BetaAlanine.anchors.find((a) => a.id === 'saunders_wk24').model.p50);
    await expect(fate).toContainText(`its middle line is +${s24.toFixed(1)} against the +20.15 measured`);
    await expect(fate).toContainText('not a proven ceiling');
    await expect(fate).toContainText('33.7 at the start, 35.4 at week 24');
    await page.fill('#phase0Dose', '0');
    await expect(page.locator('#fate .card')).toHaveCount(1);
    await expect(fate).toContainText('No beta-alanine taken');
  });

  test('the food note, safety sentence and sustained-release bands cite the new studies', async ({ page }) => {
    await openTool(page);
    const food = page.locator('#foodNote');
    await expect(food).toContainText('10 minutes after a small breakfast');
    await expect(food).toContainText('7 of 60 doses');
    await expect(food).toContainText('Sipping it in water through the day has not been studied');
    await expect(food.locator('a', { hasText: 'Stautemas' })).toHaveAttribute('href', /10\.3390\/nu11122869/);
    await expect(page.locator('#safetySentence')).toContainText('8.9 times the odds of placebo');
    await expect(page.locator('#safetySentence a', { hasText: 'Dolan' })).toHaveCount(1);
    await page.selectOption('#phase0Form', 'sustained');
    await page.fill('#phase0Dose', '15');
    await page.fill('#phase0Servings', '3');
    await expect(page.locator('#servingTable')).toContainText('Likely, usually mild');
    await expect(page.locator('#servingTable a', { hasText: 'Maestre' })).toHaveCount(1);
    await page.fill('#phase0Servings', '2');
    await expect(page.locator('#servingTable')).toContainText('Likely');
    await expect(page.locator('#servingTable a', { hasText: 'de Salazar' })).toHaveCount(1);
    await page.fill('#phase0Servings', '1');
    await expect(page.locator('#servingTable')).toContainText('Above any sustained-release serving tested');
  });

  test('the older-adult baseline is the study average less Baguet\'s 15%', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#baselinePreset', 'older');
    await expect(page.locator('#baselineValue')).toHaveValue('19.5');
    await expect(page.locator('#baselineNote')).toContainText('lowered by 15%');
    await expect(page.locator('#baselineNote a', { hasText: 'Baguet' })).toHaveAttribute('href', /10\.1007\/s00726-011-1197-3/);
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
