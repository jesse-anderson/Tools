// Engine + UI tests for the Oral Multi-Dose Simulator via window.OralMultiDose.
//
// The one-compartment extravascular PK math is checked against the analytic
// Bateman equation and against golden values captured from the pre-refactor
// tool (so the modular split is proven non-degrading), plus an end-to-end DOM
// run of the default coffee preset.
const { test, expect } = require('@playwright/test');

const TOOL_PATH = '/tools/oral-multidose.html';

async function openTool(page) {
  await page.goto(TOOL_PATH);
  // Strict CSP blocks waitForFunction polling; expect.poll drives page.evaluate.
  await expect.poll(() => page.evaluate(() => typeof window.OralMultiDose), { timeout: 10000 })
    .toBe('object');
}

test.describe('engine handle', () => {
  test('exposes the pure PK functions and presets', async ({ page }) => {
    await openTool(page);
    const shape = await page.evaluate(() => {
      const O = window.OralMultiDose;
      return {
        propagate: typeof O.propagate,
        simulate: typeof O.simulate,
        computeMetrics: typeof O.computeMetrics,
        solveKaFromTmax: typeof O.solveKaFromTmax,
        kaFromBucket: typeof O.kaFromBucket,
        runMonteCarlo: typeof O.runMonteCarlo,
        mulberry32: typeof O.mulberry32,
        presets: O.PRESETS && typeof O.PRESETS.coffee === 'object',
      };
    });
    expect(shape.propagate).toBe('function');
    expect(shape.simulate).toBe('function');
    expect(shape.computeMetrics).toBe('function');
    expect(shape.solveKaFromTmax).toBe('function');
    expect(shape.kaFromBucket).toBe('function');
    expect(shape.runMonteCarlo).toBe('function');
    expect(shape.mulberry32).toBe('function');
    expect(shape.presets).toBe(true);
  });
});

test.describe('analytic PK references', () => {
  test('propagate reproduces the Bateman single-dose curve', async ({ page }) => {
    await openTool(page);
    // D=100, F=1, ka=1.0, ke=0.1: analytic peak at Tmax=ln(10)/0.9=2.5584 -> Ac=77.4264
    const r = await page.evaluate(() => {
      const O = window.OralMultiDose;
      const tmax = Math.log(1.0 / 0.1) / (1.0 - 0.1);
      const [Ag, Ac] = O.propagate(100, 0, 1.0, 0.1, 1, tmax);
      // Independent Bateman closed form
      const bateman = 1 * 1.0 * 100 / (0.1 - 1.0) * (Math.exp(-1.0 * tmax) - Math.exp(-0.1 * tmax));
      return { Ag, Ac, bateman, tmax };
    });
    expect(r.tmax).toBeCloseTo(2.5584, 3);
    expect(r.Ac).toBeCloseTo(77.4264, 3);
    expect(r.Ac).toBeCloseTo(r.bateman, 6);
    expect(r.Ag).toBeCloseTo(100 * Math.exp(-1.0 * r.tmax), 6); // Ag0 * e^(-ka*dt)
  });

  test('propagate handles the ka == ke limit', async ({ page }) => {
    await openTool(page);
    // Ac(t) = F*k*D*t*e^(-k t); k=0.3, D=100, t=2 -> 32.9287
    const r = await page.evaluate(() => window.OralMultiDose.propagate(100, 0, 0.3, 0.3, 1, 2.0));
    expect(r[1]).toBeCloseTo(0.3 * 100 * 2 * Math.exp(-0.6), 5);
    expect(r[1]).toBeCloseTo(32.928698, 4);
  });

  test('kaFromBucket and solveKaFromTmax', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const O = window.OralMultiDose;
      return {
        b05: O.kaFromBucket(0.5),
        b1: O.kaFromBucket(1),
        solveRoundTrip: O.solveKaFromTmax(0.1, 2.5584),   // -> ~1.0
        solveTooLarge: O.solveKaFromTmax(0.1, 100),        // Tmax >= 1/ke -> null
      };
    });
    expect(r.b05).toBeCloseTo(Math.log(10) / 0.5, 6);   // ln(10)/X
    expect(r.b1).toBeCloseTo(Math.log(10), 6);
    expect(r.solveRoundTrip).toBeCloseTo(1.0, 3);
    expect(r.solveTooLarge).toBeNull();
  });

  test('computeIntervalAUC trapezoid', async ({ page }) => {
    await openTool(page);
    // triangle-ish: (0,0)-(1,10)-(2,10)-(3,0) -> 5 + 10 + 5 = 20
    const auc = await page.evaluate(() => window.OralMultiDose.computeIntervalAUC([0, 1, 2, 3], [0, 10, 10, 0], 0, 3));
    expect(auc).toBeCloseTo(20, 6);
  });
});

test.describe('multi-dose accumulation (golden scenario)', () => {
  // dose=200, tau=6, t1/2=5, F=1, 5 doses, IR, ka from 0.5h bucket
  async function runScenario(page) {
    return page.evaluate(() => {
      const O = window.OralMultiDose;
      const ke = Math.LN2 / 5;
      const ka = O.kaFromBucket(0.5);
      const schedule = O.buildSchedule(5, 6, [], 200, 'IR', 0, 8);
      const sim = O.simulate({ ka, ke, F: 1, schedule, duration: 36, samplesPerHour: 1200 });
      const m = O.computeMetrics(sim, { tau: 6, numDoses: 5 });
      return { Amax: m.Amax, Amin: m.Amin, Tmax: m.Tmax, accumRatio: m.accumRatio, steadyState: m.steadyState };
    });
  }

  test('metrics match the captured pre-refactor golden', async ({ page }) => {
    await openTool(page);
    const m = await runScenario(page);
    expect(m.Amax).toBeCloseTo(318.144153, 3);
    expect(m.Amin).toBeCloseTo(153.233987, 3);
    expect(m.Tmax).toBeCloseTo(24.66, 2);
    expect(m.accumRatio).toBeCloseTo(1.784948, 4);
    expect(m.steadyState).toBe(false);
  });

  test('accumulation ratio grows toward the classic bound with more doses', async ({ page }) => {
    await openTool(page);
    // For rapid absorption, R approaches 1/(1 - e^(-ke*tau))
    const r = await page.evaluate(() => {
      const O = window.OralMultiDose;
      const ke = Math.LN2 / 5, tau = 6, ka = O.kaFromBucket(0.25);
      const sched = O.buildSchedule(20, tau, [], 200, 'IR', 0, 8);
      const sim = O.simulate({ ka, ke, F: 1, schedule: sched, duration: 20 * tau + tau, samplesPerHour: 600 });
      const m = O.computeMetrics(sim, { tau, numDoses: 20 });
      const classic = 1 / (1 - Math.exp(-ke * tau));
      return { accum: m.accumRatio, classic, steady: m.steadyState };
    });
    expect(r.accum).toBeGreaterThan(1.5);
    expect(r.accum).toBeLessThan(r.classic + 0.1);
    expect(r.steady).toBe(true); // 20 doses over ~4 half-lives-per-6h reaches SS plateau
  });
});

test.describe('Monte Carlo determinism', () => {
  test('a seeded RNG makes the band reproducible', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const O = window.OralMultiDose;
      const ke = Math.LN2 / 5, ka = O.kaFromBucket(0.5);
      const base = { ka, ke, F: 1, schedule: O.buildSchedule(4, 6, [], 200, 'IR', 0, 8), duration: 30, samplesPerHour: 240 };
      const opts = () => ({ halfLifeMin: 3, halfLifeMax: 7, paramMode: 'A', rng: O.mulberry32(42) });
      const a = O.runMonteCarlo(base, 40, opts());
      const b = O.runMonteCarlo(base, 40, opts());
      // Same seed -> identical sampled trajectories
      const idx = Math.floor(a[0].times.length / 2);
      const sameSeed = a[10].Ac_values[idx] === b[10].Ac_values[idx];
      // Different seed -> different sample
      const c = O.runMonteCarlo(base, 40, { halfLifeMin: 3, halfLifeMax: 7, paramMode: 'A', rng: O.mulberry32(999) });
      const diffSeed = a[10].Ac_values[idx] !== c[10].Ac_values[idx];
      return { sameSeed, diffSeed, n: a.length };
    });
    expect(r.n).toBe(40);
    expect(r.sameSeed).toBe(true);
    expect(r.diffSeed).toBe(true);
  });
});

test.describe('presets', () => {
  test('all presets are present and well-formed', async ({ page }) => {
    await openTool(page);
    const info = await page.evaluate(() => {
      const P = window.OralMultiDose.PRESETS;
      const keys = Object.keys(P);
      const malformed = keys.filter(k => {
        const p = P[k];
        return !(p.halfLife > 0 && p.dose > 0 && p.tau > 0 && ['A', 'B', 'C'].includes(p.paramMode) && Array.isArray(p.refs));
      });
      return { keys, malformed };
    });
    // 5 original + 9 first-order additions + 2 saturable (phenytoin, ethanol)
    expect(info.keys.length).toBe(16);
    for (const k of ['ibuprofen', 'acetaminophen', 'theophylline', 'theophylline_er',
      'amlodipine', 'digoxin', 'metformin', 'fluoxetine', 'iv_bolus',
      'phenytoin', 'ethanol']) {
      expect(info.keys).toContain(k);
    }
    expect(info.malformed).toEqual([]);
  });

  test('long half-life presets accumulate more than short ones', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const O = window.OralMultiDose;
      const run = (key, n) => {
        const p = O.PRESETS[key];
        const ke = Math.LN2 / p.halfLife;
        const ka = p.paramMode === 'C' ? p.ka : O.kaFromBucket(0.5);
        const sched = O.buildSchedule(n, p.tau, [], p.dose, p.doseForm, p.tLag || 0, p.tRel || 8);
        const sim = O.simulate({ ka, ke, F: p.bioavailability, schedule: sched, duration: n * p.tau + p.tau, samplesPerHour: 300 });
        return O.computeMetrics(sim, { tau: p.tau, numDoses: n }).accumRatio;
      };
      return { ibuprofen: run('ibuprofen', 8), fluoxetine: run('fluoxetine', 14) };
    });
    expect(r.ibuprofen).toBeLessThan(1.3);   // short t1/2, near-no accumulation
    expect(r.fluoxetine).toBeGreaterThan(3); // very long t1/2, strong accumulation
  });

  test('IV bolus preset matches the classic accumulation factor', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const O = window.OralMultiDose;
      const p = O.PRESETS.iv_bolus;
      const ke = Math.LN2 / p.halfLife;
      const sched = O.buildSchedule(12, p.tau, [], p.dose, 'IR', 0, 8);
      const sim = O.simulate({ ka: p.ka, ke, F: 1, schedule: sched, duration: 12 * p.tau + p.tau, samplesPerHour: 600 });
      const accum = O.computeMetrics(sim, { tau: p.tau, numDoses: 12 }).accumRatio;
      return { accum, classic: 1 / (1 - Math.exp(-ke * p.tau)) };
    });
    expect(r.accum).toBeCloseTo(r.classic, 1); // near-instant absorption -> exact IV-bolus formula
  });
});

test.describe('saturable elimination', () => {
  test('zero-order elimination clears at a constant rate and floors at zero', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const O = window.OralMultiDose;
      // No absorption input (Ag=0): Km=0 -> constant Vmax removal.
      const decline = O.propagateSaturable(0, 1000, 1, 1, 100, 0, 1)[1]; // 1000 - 100*1
      const floored = O.propagateSaturable(0, 50, 1, 1, 100, 0, 1)[1];   // cannot go below 0
      return { decline, floored };
    });
    expect(r.decline).toBeCloseTo(900, 6);
    expect(r.floored).toBeCloseTo(0, 6);
  });

  test('Michaelis-Menten step satisfies the implicit no-input solution', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const O = window.OralMultiDose;
      // dAc/dt = -Vmax*Ac/(Km+Ac); implicit: Km*ln(Ac0/Ac) + (Ac0-Ac) = Vmax*dt
      const Vmax = 50, Km = 100, Ac0 = 500, dt = 2;
      const Ac = O.propagateSaturable(0, Ac0, 1, 1, Vmax, Km, dt)[1];
      const invariant = Km * Math.log(Ac0 / Ac) + (Ac0 - Ac);
      return { invariant, target: Vmax * dt, Ac };
    });
    expect(r.Ac).toBeLessThan(500);
    expect(r.invariant).toBeCloseTo(r.target, 3); // RK4 matches the exact implicit relation
  });

  test('Michaelis-Menten reduces to first-order when Km >> amount', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      // Km=1e6 >> Ac -> elim ~ (Vmax/Km)*Ac, keff = 1e-5 over dt=5
      const Ac = window.OralMultiDose.propagateSaturable(0, 10, 1, 1, 10, 1e6, 5)[1];
      return { Ac, firstOrder: 10 * Math.exp(-1e-5 * 5) };
    });
    expect(r.Ac).toBeCloseTo(r.firstOrder, 5);
  });

  test('zero-order simulate: near-instant dose then a straight-line decline', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const O = window.OralMultiDose;
      const sched = O.buildSchedule(1, 24, [], 1000, 'IR', 0, 8);
      const sim = O.simulate({
        ka: 50, ke: 0, F: 1, schedule: sched, duration: 20,
        samplesPerHour: 240, elimMode: 'zero', Vmax: 100, Km: 0,
      });
      const at = (t) => {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < sim.times.length; i++) {
          const d = Math.abs(sim.times[i] - t);
          if (d < bd) { bd = d; bi = i; }
        }
        return sim.Ac_values[bi];
      };
      const amax = Math.max(...sim.Ac_values);
      const slope = (at(7) - at(4)) / 3; // mg/h on the descending limb
      return { amax, slope, last: sim.Ac_values[sim.Ac_values.length - 1] };
    });
    expect(r.amax).toBeGreaterThan(900); // ~full dose reaches the compartment
    expect(r.amax).toBeLessThanOrEqual(1000);
    expect(r.slope).toBeCloseTo(-100, 0); // constant clearance ~ -k0
    expect(r.last).toBeLessThan(1);        // fully cleared within 20h
  });
});

test.describe('end-to-end DOM', () => {
  test('default coffee preset renders the golden metrics', async ({ page }) => {
    await openTool(page);
    // Auto-runs on load; poll until metrics populate.
    await expect.poll(() => page.locator('#metricAmax').textContent(), { timeout: 5000 })
      .not.toContain('-');
    await expect(page.locator('#metricAmax')).toHaveText('170.64mg');
    await expect(page.locator('#metricAmin')).toHaveText('87.36mg');
    await expect(page.locator('#metricTmax')).toHaveText('8.4 hr');
    await expect(page.locator('#metricAccum')).toHaveText('1.94');
    await expect(page.locator('#metricSteady')).toHaveText('No');
    await expect(page.locator('#derivedKe')).toHaveText('0.1386');
    await expect(page.locator('#derivedKa')).toHaveText('8.3303');
  });

  test('ethanol preset drives the zero-order UI path', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'ethanol');
    await page.click('#runBtn');
    // Zero-order inputs revealed, elimination timeline marked n/a, derived shows k0.
    await expect(page.locator('#zeroInputs')).toBeVisible();
    await expect(page.locator('#metricT5hl')).toHaveText('n/a');
    await expect(page.locator('#derivedSatLine')).toBeVisible();
    await expect(page.locator('#derivedSat')).toContainText('zero-order');
    await expect(page.locator('#derivedKeLine')).toBeHidden();
    // A finite peak was produced (no NaN / error banner).
    await expect(page.locator('#simError')).toBeHidden();
    await expect(page.locator('#metricAmax')).not.toHaveText('-mg');
  });

  test('phenytoin preset drives the Michaelis-Menten UI path', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'phenytoin');
    await page.click('#runBtn');
    await expect(page.locator('#mmInputs')).toBeVisible();
    await expect(page.locator('#metricT7hl')).toHaveText('n/a');
    await expect(page.locator('#derivedSat')).toContainText('Michaelis-Menten');
    await expect(page.locator('#simError')).toBeHidden();
  });

  test('invalid input surfaces an inline error (not alert)', async ({ page }) => {
    await openTool(page);
    await page.fill('#dose', '0');
    await page.click('#runBtn');
    await expect(page.locator('#simError')).toBeVisible();
    await expect(page.locator('#simError')).toContainText('Dose must be > 0');
    // Valid input clears it
    await page.fill('#dose', '95');
    await page.click('#runBtn');
    await expect(page.locator('#simError')).toBeHidden();
  });
});
