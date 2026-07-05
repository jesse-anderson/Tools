// Engine + UI tests for the Toxicology Body Burden tool via window.ToxBurden:
// concentration unit normalization (mass + molar, MW-aware), volume-of-distribution
// modes, first-order kinetic back-calculation and clearance-time heuristics, input
// guards, and an end-to-end DOM check of the rendered result box and ledger.
//
// Reference values are computed independently (by hand / basic PK identities), not
// scraped from the tool, so this spec is an actual correctness check.
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/toxicology-and-body-burden.html';
let smokeServer;

test.beforeAll(async () => {
  smokeServer = await startServer({
    port: Number(process.env.PORT || 4173),
    reuseExisting: !process.env.CI
  });
});

test.afterAll(async () => {
  if (smokeServer) {
    await smokeServer.close();
    smokeServer = null;
  }
});

async function openTool(page) {
  await page.goto(TOOL_PATH);
  // Strict CSP on this page blocks waitForFunction re-polling; expect.poll drives
  // repeated page.evaluate calls (CDP-exempt) instead.
  await expect.poll(() => page.evaluate(() => typeof window.ToxBurden), { timeout: 10000 })
    .toBe('object');
}

test.describe('engine handle', () => {
  test('exposes the pure functions', async ({ page }) => {
    await openTool(page);
    const shape = await page.evaluate(() => {
      const T = window.ToxBurden;
      return {
        computeBodyBurden: typeof T.computeBodyBurden,
        normalizeToMgL: typeof T.normalizeToMgL,
        computeKinetics: typeof T.computeKinetics,
        computeVd: typeof T.computeVd,
        species: Array.isArray(T.SPECIES_DB) ? T.SPECIES_DB.length : -1,
      };
    });
    expect(shape.computeBodyBurden).toBe('function');
    expect(shape.normalizeToMgL).toBe('function');
    expect(shape.computeKinetics).toBe('function');
    expect(shape.computeVd).toBe('function');
    expect(shape.species).toBe(19);
  });
});

test.describe('unit normalization', () => {
  test('mass units convert to mg/L (per 1 input unit)', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => {
      const n = (u) => window.ToxBurden.normalizeToMgL(1, u, NaN).mgL;
      return {
        g_l: n('g_l'), g_dl: n('g_dl'), mg_l: n('mg_l'), mg_dl: n('mg_dl'),
        ug_ml: n('ug_ml'), ug_l: n('ug_l'), ng_ml: n('ng_ml'),
        ng_l: n('ng_l'), pg_ml: n('pg_ml'),
      };
    });
    expect(got.g_l).toBeCloseTo(1000, 6);
    expect(got.g_dl).toBeCloseTo(10000, 6);
    expect(got.mg_l).toBeCloseTo(1, 6);
    expect(got.mg_dl).toBeCloseTo(10, 6);
    expect(got.ug_ml).toBeCloseTo(1, 6);
    expect(got.ug_l).toBeCloseTo(0.001, 9);
    expect(got.ng_ml).toBeCloseTo(0.001, 9);
    expect(got.ng_l).toBeCloseTo(1e-6, 12);
    expect(got.pg_ml).toBeCloseTo(1e-6, 12);
  });

  test('molar units convert to mg/L using MW', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => {
      const n = (u) => window.ToxBurden.normalizeToMgL(1, u, 100).mgL;
      return { mol: n('mol'), mmol: n('mmol'), umol: n('umol'), nmol: n('nmol'), pmol: n('pmol') };
    });
    expect(got.mol).toBeCloseTo(100000, 3);
    expect(got.mmol).toBeCloseTo(100, 6);
    expect(got.umol).toBeCloseTo(0.1, 9);
    expect(got.nmol).toBeCloseTo(1e-4, 12);
    expect(got.pmol).toBeCloseTo(1e-7, 14);
  });

  test('molar units require MW > 0', async ({ page }) => {
    await openTool(page);
    const res = await page.evaluate(() => ({
      missing: window.ToxBurden.normalizeToMgL(5, 'umol', NaN),
      zero: window.ToxBurden.normalizeToMgL(5, 'umol', 0),
      negative: window.ToxBurden.normalizeToMgL(5, 'umol', -10),
      ok: window.ToxBurden.normalizeToMgL(5, 'umol', 300),
    }));
    expect(res.missing.ok).toBe(false);
    expect(res.missing.error).toMatch(/Molecular Weight/i);
    expect(res.zero.ok).toBe(false);
    expect(res.negative.ok).toBe(false);
    expect(res.ok.ok).toBe(true);
    expect(res.ok.mgL).toBeCloseTo(1.5, 9); // 5 umol/L * 300 g/mol
  });

  test('unknown unit is an error, not a silent 0', async ({ page }) => {
    await openTool(page);
    const res = await page.evaluate(() => window.ToxBurden.normalizeToMgL(5, 'furlongs', NaN));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Unknown/i);
  });
});

test.describe('volume of distribution', () => {
  test('Mode A blood volume and amount', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => window.ToxBurden.computeBodyBurden({
      rawConc: 10, unit: 'mg_l', mw: NaN, speciesId: 'human', weight: 70,
      loss: 0, mode: 'modeA', vdCoeff: 1, kinetics: { enabled: false }
    }));
    expect(r.ok).toBe(true);
    expect(r.Vd).toBeCloseTo(4.9, 9);   // 70 kg * 70 mL/kg / 1000
    expect(r.At).toBeCloseTo(49, 9);    // 10 mg/L * 4.9 L
    expect(r.Astar).toBeCloseTo(49, 9);
    expect(r.aBasis).toBe('At');
  });

  test('Mode B total body water and amount', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => window.ToxBurden.computeBodyBurden({
      rawConc: 10, unit: 'mg_l', mw: NaN, speciesId: 'human', weight: 70,
      loss: 0, mode: 'modeB', vdCoeff: 1, kinetics: { enabled: false }
    }));
    expect(r.Vd).toBeCloseTo(38.5, 9);  // 70 kg * 0.55
    expect(r.At).toBeCloseTo(385, 9);
  });

  test('Mode C custom Vd/kg and amount', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => window.ToxBurden.computeBodyBurden({
      rawConc: 0.001, unit: 'mg_l', mw: NaN, speciesId: 'human', weight: 70,
      loss: 0, mode: 'modeC', vdCoeff: 4.0, kinetics: { enabled: false }
    }));
    expect(r.Vd).toBeCloseTo(280, 9);   // 70 kg * 4 L/kg (digoxin-like)
    expect(r.At).toBeCloseTo(0.28, 9);
  });

  test('fluid loss reduces Modes A/B but never below zero', async ({ page }) => {
    await openTool(page);
    const res = await page.evaluate(() => ({
      partial: window.ToxBurden.computeVd('modeA', { weight: 70, bv: 70, tbw: 0.55, loss: 1 }),
      floored: window.ToxBurden.computeVd('modeA', { weight: 70, bv: 70, tbw: 0.55, loss: 100 }),
      ignoredInC: window.ToxBurden.computeVd('modeC', { weight: 70, loss: 100, vdCoeff: 4 }),
    }));
    expect(res.partial.Vd).toBeCloseTo(3.9, 9); // 4.9 - 1
    expect(res.floored.Vd).toBe(0);             // max(0, 4.9 - 100)
    expect(res.ignoredInC.Vd).toBeCloseTo(280, 9); // loss ignored in Mode C
  });
});

test.describe('first-order kinetics', () => {
  test('back-calculates C0 from a later Ct', async ({ page }) => {
    await openTool(page);
    // Ct=2 mg/L, t=8 hr, t1/2=4 hr => 2 half-lives => C0 = 2 * 2^2 = 8
    const k = await page.evaluate(() => window.ToxBurden.computeKinetics(2, 8, 4, 0));
    expect(k.ok).toBe(true);
    expect(k.C0).toBeCloseTo(8, 6);
    expect(k.k).toBeCloseTo(Math.LN2 / 4, 9);
    expect(k.t97).toBeCloseTo(20, 9); // 5 * t1/2
  });

  test('clearance time to a remaining fraction', async ({ page }) => {
    await openTool(page);
    const res = await page.evaluate(() => ({
      onePct: window.ToxBurden.computeKinetics(1, 0, 4, 1).t99,
      zeroPct: window.ToxBurden.computeKinetics(1, 0, 4, 0).t99,
      tenPct: window.ToxBurden.computeKinetics(1, 0, 4, 10).t99,
    }));
    expect(res.onePct).toBeCloseTo(26.5754, 3); // 4 * log2(100)
    expect(res.zeroPct).toBe(Infinity);         // 0% remaining is asymptotic
    expect(res.tenPct).toBeCloseTo(13.2877, 3); // 4 * log2(10)
  });

  test('guards invalid time and half-life', async ({ page }) => {
    await openTool(page);
    const res = await page.evaluate(() => ({
      negTime: window.ToxBurden.computeKinetics(1, -1, 4, 0).ok,
      zeroHalf: window.ToxBurden.computeKinetics(1, 1, 0, 0).ok,
      negHalf: window.ToxBurden.computeKinetics(1, 1, -4, 0).ok,
    }));
    expect(res.negTime).toBe(false);
    expect(res.zeroHalf).toBe(false);
    expect(res.negHalf).toBe(false);
  });

  test('kinetics-enabled body burden uses A0 as the basis', async ({ page }) => {
    await openTool(page);
    // Ct=10 mg/L, t=8, t1/2=4 => C0=40; Mode A human Vd=4.9 => A0=196
    const r = await page.evaluate(() => window.ToxBurden.computeBodyBurden({
      rawConc: 10, unit: 'mg_l', mw: NaN, speciesId: 'human', weight: 70,
      loss: 0, mode: 'modeA', vdCoeff: 1,
      kinetics: { enabled: true, time: 8, halflife: 4, targetPct: 0 }
    }));
    expect(r.C0).toBeCloseTo(40, 6);
    expect(r.A0).toBeCloseTo(196, 5);
    expect(r.Astar).toBeCloseTo(196, 5);
    expect(r.aBasis).toBe('A0');
    expect(r.t99).toBe(Infinity);
  });
});

test.describe('input guards', () => {
  test('missing concentration/weight yields a neutral pending state', async ({ page }) => {
    await openTool(page);
    const res = await page.evaluate(() => window.ToxBurden.computeBodyBurden({
      rawConc: NaN, unit: 'mg_l', mw: NaN, speciesId: 'human', weight: 70,
      loss: 0, mode: 'modeA', vdCoeff: 1, kinetics: { enabled: false }
    }));
    expect(res.ok).toBe(false);
    expect(res.pending).toBe(true);
  });

  test('negative concentration, non-positive weight, and bad custom coeff error out', async ({ page }) => {
    await openTool(page);
    const res = await page.evaluate(() => {
      const base = { unit: 'mg_l', mw: NaN, speciesId: 'human', loss: 0, vdCoeff: 4, kinetics: { enabled: false } };
      return {
        negConc: window.ToxBurden.computeBodyBurden({ ...base, rawConc: -5, weight: 70, mode: 'modeA' }),
        zeroWeight: window.ToxBurden.computeBodyBurden({ ...base, rawConc: 5, weight: 0, mode: 'modeA' }),
        badCoeff: window.ToxBurden.computeBodyBurden({ ...base, rawConc: 5, weight: 70, mode: 'modeC', vdCoeff: 0 }),
      };
    });
    expect(res.negConc.ok).toBe(false);
    expect(res.negConc.error).toMatch(/non-negative/i);
    expect(res.zeroWeight.ok).toBe(false);
    expect(res.zeroWeight.error).toMatch(/Weight/i);
    expect(res.badCoeff.ok).toBe(false);
    expect(res.badCoeff.error).toMatch(/Custom Vd/i);
  });
});

test.describe('end-to-end DOM', () => {
  test('default human 10 mg/L Mode A renders friendly numbers and ledger', async ({ page }) => {
    await openTool(page);
    await page.fill('#conc', '10');
    await expect(page.locator('#resVd')).toHaveText('4.9');
    await expect(page.locator('#resAt')).toHaveText('49');
    await expect(page.locator('#resTotal')).toHaveText('49');
    await expect(page.locator('#resABasis')).toHaveText('(At)');
    await expect(page.locator('#ledgerText')).toContainText('Mode A (Blood)');
  });

  test('Mode C digoxin preset chip drives Vd and amount', async ({ page }) => {
    await openTool(page);
    await page.fill('#conc', '10');
    await page.click('#card-modeC');
    await expect(page.locator('#customVd')).toHaveClass(/visible/);
    await page.click('[data-coeff="4.0"]');
    await expect(page.locator('#resVd')).toHaveText('280');
    await expect(page.locator('#resAt')).toHaveText('2800');
  });

  test('enabling kinetics reveals inputs, switches basis to A0, and shows clearance', async ({ page }) => {
    await openTool(page);
    await page.fill('#conc', '10');
    await page.check('#kineticToggle');
    await expect(page.locator('#kineticInputs')).toHaveClass(/visible/);
    await page.fill('#time', '8');
    await page.fill('#halflife', '4');
    await expect(page.locator('#resC0')).toHaveText('40');
    await expect(page.locator('#resTotal')).toHaveText('196');
    await expect(page.locator('#resABasis')).toHaveText('(A0)');
    await expect(page.locator('#resT97')).toHaveText('20');
    await expect(page.locator('#resT99')).toHaveText('∞');
  });
});
