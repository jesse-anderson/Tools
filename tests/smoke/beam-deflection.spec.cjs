// Engine + UI tests for the Beam Deflection Calculator via window.BeamDeflection.
//
// Three things are being checked here, in order of how much they are worth:
//
//  1. Goldens. Every tabulated closed form against a value computed by hand on
//     a fixed reference beam, so a transcription slip shows up as a number.
//  2. Invariants and limits. A general off-center form must collapse onto the
//     tabulated centre form, deflection must scale as L^3 or L^4, mirroring a
//     load must mirror the answer. These catch the typo that is self-consistent
//     and so invisible to a golden written from the same bad source.
//  3. The two normalization and coefficient defects the SOW was audited for,
//     plus the propped-cantilever end moment, each with a test that fails loudly
//     if a later refactor drops it.
//
// Reference beam, used for every golden below and matching the SOW fixture:
//   L = 3 m, E = 200 GPa, I = 1e-5 m^4, c = 0.1 m, S = 1e-4 m^3,
//   P = 10 kN, w = 5 kN/m,  so EI = 2e6 N*m^2.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const PAGE = '/tools/beam-deflection.html';

const L = 3;
const E = 200e9;
const I = 1e-5;
const P = 10000;
const w = 5000;

async function openTool(page) {
  await page.goto(PAGE);
  // Strict CSP on this page blocks waitForFunction re-polling, which runs through
  // eval; expect.poll drives repeated page.evaluate calls instead.
  await expect.poll(() => page.evaluate(() => typeof window.BeamDeflection), { timeout: 10000 })
    .toBe('object');
}

// Runs solve() in the page and returns the plain-data part of the result.
async function solveIn(page, input) {
  return page.evaluate((arg) => {
    const r = window.BeamDeflection.solve(arg);
    if (!r.ok) return r;
    return {
      ok: true,
      degenerate: r.degenerate,
      deltaMax: r.deltaMax,
      xMax: r.xMax,
      deltaMid: r.deltaMid,
      deltaAtLoad: r.deltaAtLoad,
      MmaxAbs: r.MmaxAbs,
      MmaxAt: r.MmaxAt,
      a: r.a,
      reactions: r.reactions,
      warnings: r.warnings.map((x) => x.id),
      at70: r.deflectionAt(0.7 * arg.L),
    };
  }, input);
}

// Relative comparison. Every "exactly" in the SOW is a floating-point identity
// that will not hold at bit level, so each one gets a stated tolerance.
function expectRel(got, want, rel = 1e-12) {
  expect(Math.abs(got - want) / Math.abs(want)).toBeLessThan(rel);
}

test.describe('engine handle', () => {
  test('exposes the pure surface', async ({ page }) => {
    await openTool(page);
    const shape = await page.evaluate(() => {
      const B = window.BeamDeflection;
      return {
        solve: typeof B.solve,
        closedForm: typeof B.closedForm,
        sectionProperties: typeof B.sectionProperties,
        normalizeOffCenter: typeof B.normalizeOffCenter,
        supports: B.SUPPORTS,
        loadTypes: B.LOAD_TYPES,
      };
    });
    expect(shape.solve).toBe('function');
    expect(shape.closedForm).toBe('object');
    expect(shape.sectionProperties).toBe('function');
    expect(shape.normalizeOffCenter).toBe('function');
    expect(shape.supports).toEqual(['cantilever', 'simple', 'fixed-fixed', 'propped']);
    expect(shape.loadTypes).toEqual(['point-standard', 'point-at', 'udl', 'udl-partial']);
  });
});

test.describe('section 3 goldens', () => {
  // Hand-computed on the reference beam. EI = 2e6.
  const cases = [
    // support, loadType, expected deltaMax (m), expected xMax (m), formula
    ['cantilever', 'point-standard', 0.045, 3, 'P L^3 / (3 E I)'],
    ['cantilever', 'udl', 0.0253125, 3, 'w L^4 / (8 E I)'],
    ['simple', 'point-standard', 2.8125e-3, 1.5, 'P L^3 / (48 E I)'],
    ['simple', 'udl', 2.63671875e-3, 1.5, '5 w L^4 / (384 E I)'],
    ['fixed-fixed', 'point-standard', 7.03125e-4, 1.5, 'P L^3 / (192 E I)'],
    ['fixed-fixed', 'udl', 5.2734375e-4, 1.5, 'w L^4 / (384 E I)'],
    ['propped', 'point-standard', 1.2577882e-3, 1.6583592, 'P L^3 / (48 sqrt5 E I)'],
    ['propped', 'udl', 1.0967646e-3, 1.7353945, 'w L^4 / (184.634 E I)'],
  ];

  for (const [support, loadType, deltaMax, xMax, formula] of cases) {
    test(`${support} / ${loadType} matches ${formula}`, async ({ page }) => {
      await openTool(page);
      const r = await solveIn(page, { support, loadType, L, E, I, P, w });
      expect(r.ok).toBe(true);
      expectRel(r.deltaMax, deltaMax, 1e-7);
      expectRel(r.xMax, xMax, 1e-6);
    });
  }

  test('cantilever point load at a lands its free-end and load-point values', async ({ page }) => {
    await openTool(page);
    // a = 2 m: delta_free = P a^2 (3L - a)/(6EI) = 1e4*4*7/(6*2e6) = 2.3333e-2
    //          delta_load = P a^3/(3EI)          = 1e4*8/(3*2e6)   = 1.3333e-2
    const r = await solveIn(page, { support: 'cantilever', loadType: 'point-at', L, E, I, P, a: 2 });
    expectRel(r.deltaMax, (P * 4 * 7) / (6 * 2e6), 1e-12);
    expectRel(r.deltaAtLoad, (P * 8) / (3 * 2e6), 1e-12);
    expect(r.xMax).toBe(3);
  });

  test('simply supported off-center matches the tabulated form and its midspan value', async ({ page }) => {
    await openTool(page);
    // a = 2.4, b = 0.6 (already normalized, a >= b).
    // delta_max = P b (L^2 - b^2)^1.5 / (9 sqrt3 L EI) = 1.62918e-3 at
    // x = sqrt((L^2 - b^2)/3) = 1.697056
    const r = await solveIn(page, { support: 'simple', loadType: 'point-at', L, E, I, P, a: 2.4 });
    expectRel(r.deltaMax, (P * 0.6 * (9 - 0.36) ** 1.5) / (9 * Math.sqrt(3) * L * 2e6), 1e-12);
    expectRel(r.xMax, Math.sqrt((9 - 0.36) / 3), 1e-12);
    // Midspan, b the shorter distance: P b (3L^2 - 4b^2)/(48 EI)
    expectRel(r.deltaMid, (P * 0.6 * (27 - 4 * 0.36)) / (48 * 2e6), 1e-12);
    expect(r.reactions[0].force).toBeCloseTo((P * 0.6) / L, 9);
    expect(r.reactions[1].force).toBeCloseTo((P * 2.4) / L, 9);
  });

  test('fixed-fixed off-center matches the tabulated form and end moments', async ({ page }) => {
    await openTool(page);
    const a = 2.4;
    const b = 0.6;
    const r = await solveIn(page, { support: 'fixed-fixed', loadType: 'point-at', L, E, I, P, a });
    expectRel(r.deltaMax, (2 * P * a ** 3 * b * b) / (3 * 2e6 * (3 * a + b) ** 2), 1e-12);
    expectRel(r.xMax, (2 * a * L) / (3 * a + b), 1e-12);
    expectRel(r.deltaAtLoad, (P * a ** 3 * b ** 3) / (3 * 2e6 * L ** 3), 1e-12);
    // M_left = P a b^2 / L^2, M_right = P a^2 b / L^2, both hogging.
    expectRel(Math.abs(r.reactions[0].moment), (P * a * b * b) / (L * L), 1e-12);
    expectRel(Math.abs(r.reactions[1].moment), (P * a * a * b) / (L * L), 1e-12);
  });
});

test.describe('invariants and limits', () => {
  test('T1 simply supported off-center at a = b = L/2 collapses onto the centre form', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate((args) => {
      const B = window.BeamDeflection;
      const general = B.solve({ support: 'simple', loadType: 'point-at', a: args.L / 2, ...args });
      return { general: general.deltaMax, tabulated: B.closedForm.simpleCenterPoint(args.P, args.L, args.E, args.I) };
    }, { L, E, I, P });
    expectRel(got.general, got.tabulated, 1e-12);
  });

  test('T2 cantilever point load at a = L collapses onto the tip form', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate((args) => {
      const B = window.BeamDeflection;
      const general = B.solve({ support: 'cantilever', loadType: 'point-at', a: args.L, ...args });
      return { general: general.deltaMax, tabulated: B.closedForm.cantileverTipPoint(args.P, args.L, args.E, args.I) };
    }, { L, E, I, P });
    expectRel(got.general, got.tabulated, 1e-12);
  });

  test('T3 fixed-fixed UDL is one fifth of the simply supported UDL', async ({ page }) => {
    await openTool(page);
    const fixed = await solveIn(page, { support: 'fixed-fixed', loadType: 'udl', L, E, I, w });
    const simple = await solveIn(page, { support: 'simple', loadType: 'udl', L, E, I, w });
    expectRel(fixed.deltaMax / simple.deltaMax, 1 / 5, 1e-12);
  });

  test('T4 maximum is never below midspan across the whole span, both halves', async ({ page }) => {
    await openTool(page);
    const rows = await page.evaluate((args) => {
      const out = [];
      for (const support of ['simple', 'fixed-fixed', 'propped']) {
        for (let i = 1; i < 40; i += 1) {
          const a = (args.L * i) / 40;
          const r = window.BeamDeflection.solve({ support, loadType: 'point-at', a, ...args });
          out.push({ support, a, deltaMax: r.deltaMax, deltaMid: r.deltaMid, xMax: r.xMax });
        }
      }
      return out;
    }, { L, E, I, P });
    expect(rows.length).toBe(117);
    for (const r of rows) {
      // Strictly at or above midspan, to a hair of tolerance for the mirrored path.
      expect(r.deltaMax).toBeGreaterThanOrEqual(r.deltaMid - Math.abs(r.deltaMid) * 1e-12);
    }
  });

  test('T5 maximum location always lands strictly inside the span', async ({ page }) => {
    await openTool(page);
    const bad = await page.evaluate((args) => {
      const out = [];
      for (const support of ['simple', 'fixed-fixed', 'propped']) {
        for (let i = 1; i < 40; i += 1) {
          const a = (args.L * i) / 40;
          const r = window.BeamDeflection.solve({ support, loadType: 'point-at', a, ...args });
          if (!(r.xMax > 0 && r.xMax < args.L)) out.push({ support, a, xMax: r.xMax });
        }
      }
      return out;
    }, { L, E, I, P });
    expect(bad).toEqual([]);
  });

  test('T6 deflection is linear in the load', async ({ page }) => {
    await openTool(page);
    const rows = await page.evaluate((args) => {
      const out = [];
      for (const support of ['cantilever', 'simple', 'fixed-fixed', 'propped']) {
        for (const loadType of ['point-standard', 'point-at', 'udl']) {
          const base = { support, loadType, L: args.L, E: args.E, I: args.I, a: 1.8 };
          const full = window.BeamDeflection.solve({ ...base, P: args.P, w: args.w });
          const half = window.BeamDeflection.solve({ ...base, P: args.P / 2, w: args.w / 2 });
          out.push({ support, loadType, full: full.deltaMax, twiceHalf: 2 * half.deltaMax });
        }
      }
      return out;
    }, { L, E, I, P, w });
    for (const r of rows) expectRel(r.twiceHalf, r.full, 1e-12);
  });

  test('T7 point-load deflection scales as L^3 and UDL as L^4', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate((args) => {
      const B = window.BeamDeflection;
      const at = (Lx, loadType) => B.solve({
        support: 'simple', loadType, L: Lx, E: args.E, I: args.I, P: args.P, w: args.w,
      }).deltaMax;
      return {
        pointRatio: at(2 * args.L, 'point-standard') / at(args.L, 'point-standard'),
        udlRatio: at(2 * args.L, 'udl') / at(args.L, 'udl'),
      };
    }, { L, E, I, P, w });
    expectRel(got.pointRatio, 8, 1e-12);
    expectRel(got.udlRatio, 16, 1e-12);
  });

  test('T8 doubling the modulus halves the deflection', async ({ page }) => {
    await openTool(page);
    const a = await solveIn(page, { support: 'propped', loadType: 'point-at', L, E, I, P, a: 1.9 });
    const b = await solveIn(page, { support: 'propped', loadType: 'point-at', L, E: 2 * E, I, P, a: 1.9 });
    expectRel(b.deltaMax, a.deltaMax / 2, 1e-12);
  });

  test('T9 doubling rectangle depth cuts deflection by exactly eight', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate((args) => {
      const B = window.BeamDeflection;
      const s1 = B.sectionProperties('rect', { b: 0.05, h: 0.1 });
      const s2 = B.sectionProperties('rect', { b: 0.05, h: 0.2 });
      const d = (I) => B.solve({ support: 'simple', loadType: 'point-standard', I, ...args }).deltaMax;
      return { ratio: d(s1.I) / d(s2.I), I1: s1.I, S1: s1.S, c1: s1.c };
    }, { L, E, P });
    expectRel(got.ratio, 8, 1e-12);
    // b h^3/12 with b = 50 mm, h = 100 mm
    expectRel(got.I1, (0.05 * 0.1 ** 3) / 12, 1e-12);
    expectRel(got.S1, got.I1 / 0.05, 1e-12);
  });

  test('T12 invalid inputs return a structured error, never NaN or Infinity', async ({ page }) => {
    await openTool(page);
    const results = await page.evaluate(() => {
      const B = window.BeamDeflection;
      const base = { support: 'simple', loadType: 'point-standard', L: 3, E: 200e9, I: 1e-5, P: 1e4 };
      const variants = [
        { ...base, L: 0 }, { ...base, L: -3 }, { ...base, E: 0 }, { ...base, I: 0 },
        { ...base, I: -1e-5 }, { ...base, E: NaN }, { ...base, P: NaN },
        { ...base, L: Infinity }, { ...base, support: 'nonsense' }, { ...base, loadType: 'nonsense' },
      ];
      return variants.map((v) => {
        const r = B.solve(v);
        return { ok: r.ok, hasError: typeof r.error === 'string' && r.error.length > 0, delta: r.deltaMax };
      });
    });
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.hasError).toBe(true);
      expect(r.delta).toBeUndefined();
    }
  });
});

test.describe('the audited defects', () => {
  test('T17 mirroring the load mirrors the answer', async ({ page }) => {
    await openTool(page);
    const rows = await page.evaluate((args) => {
      const out = [];
      for (const support of ['simple', 'fixed-fixed']) {
        for (const a of [0.3, 0.6, 1.2, 1.35]) {
          const left = window.BeamDeflection.solve({ support, loadType: 'point-at', a, ...args });
          const right = window.BeamDeflection.solve({ support, loadType: 'point-at', a: args.L - a, ...args });
          out.push({
            support, a,
            dLeft: left.deltaMax, dRight: right.deltaMax,
            xLeft: left.xMax, xRightMirrored: args.L - right.xMax,
            midLeft: left.deltaMid, midRight: right.deltaMid,
          });
        }
      }
      return out;
    }, { L, E, I, P });
    for (const r of rows) {
      expectRel(r.dLeft, r.dRight, 1e-12);
      expectRel(r.xLeft, r.xRightMirrored, 1e-12);
      expectRel(r.midLeft, r.midRight, 1e-12);
    }
  });

  test('T18 dropping off-center normalization would change the answer, loudly', async ({ page }) => {
    await openTool(page);
    // At a = 0.6 on L = 3 the un-normalized form under-predicts by 8.14% and
    // reports the maximum on the wrong side of the beam. If a refactor ever
    // drops normalizeOffCenter, the engine result moves onto the naive numbers
    // and this test fails.
    const got = await page.evaluate((args) => {
      const B = window.BeamDeflection;
      const a = 0.6;
      const b = args.L - a;
      const EI = args.E * args.I;
      const naiveDelta = (args.P * b * (args.L ** 2 - b ** 2) ** 1.5) / (9 * Math.sqrt(3) * args.L * EI);
      const naiveX = Math.sqrt((args.L ** 2 - b ** 2) / 3);
      const r = B.solve({ support: 'simple', loadType: 'point-at', a, ...args });
      return { engineDelta: r.deltaMax, engineX: r.xMax, naiveDelta, naiveX };
    }, { L, E, I, P });

    // The tabulated margin from the SOW: naive 1.4965e-3 against correct 1.6292e-3.
    expect(got.naiveDelta).toBeCloseTo(1.4965e-3, 7);
    expect(got.engineDelta).toBeCloseTo(1.6292e-3, 7);
    expect((got.naiveDelta - got.engineDelta) / got.engineDelta).toBeLessThan(-0.08);
    // The reported location is wrong too: 1.0392 m against 1.3029 m, a 20%
    // error in where the worst point on the beam actually is.
    expect(got.naiveX).toBeCloseTo(1.0392, 4);
    expect(got.engineX).toBeCloseTo(1.3029, 4);
    expect(Math.abs(got.naiveX - got.engineX) / got.engineX).toBeGreaterThan(0.2);
  });

  test('T19 propped cantilever UDL uses the exact coefficient, not 1/185', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => ({
      coeff: window.BeamDeflection.PROPPED_UDL_COEFF,
      xRatio: window.BeamDeflection.PROPPED_UDL_X_RATIO,
    }));
    // Exact: the root of 8x^2 - 15Lx + 6L^2 = 0 gives x = L(15 - sqrt33)/16.
    expectRel(got.coeff, 5.4161216e-3, 1e-8);
    expectRel(got.xRatio, 0.5784648345913732, 1e-12);
    // The widely reproduced rounding, which is wrong in the non-conservative
    // direction, must not be what the engine carries.
    expect(Math.abs(got.coeff - 1 / 185) / (1 / 185)).toBeGreaterThan(1.9e-3);
  });

  test('T20 propped off-center curve reproduces the centre case at a = L/2', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate((args) => {
      const B = window.BeamDeflection;
      const general = B.solve({ support: 'propped', loadType: 'point-at', a: args.L / 2, ...args });
      const tabulated = B.solve({ support: 'propped', loadType: 'point-standard', ...args });
      return {
        gd: general.deltaMax, td: tabulated.deltaMax,
        gx: general.xMax, tx: tabulated.xMax,
        gm: general.reactions[0].moment, tm: tabulated.reactions[0].moment,
        closed: B.closedForm.proppedCenterPoint(args.P, args.L, args.E, args.I),
        xRatio: B.PROPPED_CENTER_X_RATIO,
      };
    }, { L, E, I, P });
    expectRel(got.gd, got.td, 1e-9);
    expectRel(got.gd, got.closed, 1e-9);
    expectRel(got.gx, got.tx, 1e-8);
    expectRel(got.gm, got.tm, 1e-12);
    // Fixed-end moment is 3PL/16 for the centre case.
    expectRel(Math.abs(got.gm), (3 * P * L) / 16, 1e-9);
    // Location is L(1 - 1/sqrt5) from the fixed end, not 0.4472L.
    expectRel(got.xRatio, 0.5527864045000421, 1e-12);
  });

  test('T20b propped fixed-end moment is right away from midspan too', async ({ page }) => {
    await openTool(page);
    // The a = L/2 check in T20 cannot see this: at midspan the correct moment
    // and the transcription that swaps a for b happen to coincide. Away from
    // midspan they differ by a factor of four, so the sweep is the real test.
    // Reference: M_fixed = P b (L^2 - b^2) / (2 L^2), which is also what
    // equilibrium about the fixed end gives, M = P a - Rp L.
    const rows = await page.evaluate((args) => {
      const out = [];
      for (const frac of [0.15, 0.25, 0.4, 0.5, 0.6, 0.75, 0.85]) {
        const a = frac * args.L;
        const b = args.L - a;
        const r = window.BeamDeflection.solve({ support: 'propped', loadType: 'point-at', a, ...args });
        out.push({
          frac,
          engine: Math.abs(r.reactions[0].moment),
          reference: (args.P * b * (args.L ** 2 - b ** 2)) / (2 * args.L ** 2),
          // The reading that swaps the two distances, kept so the difference is
          // explicit rather than implied.
          swapped: Math.abs((args.P * a * a * (3 * args.L - a)) / (2 * args.L ** 3) * args.L - args.P * b),
          reactionSum: r.reactions[0].force + r.reactions[1].force,
        });
      }
      return out;
    }, { L, E, I, P });

    for (const r of rows) {
      expectRel(r.engine, r.reference, 1e-12);
      // Vertical equilibrium, as a second check on the reactions.
      expectRel(r.reactionSum, P, 1e-12);
      if (r.frac !== 0.5) expect(Math.abs(r.engine - r.swapped) / r.engine).toBeGreaterThan(0.5);
    }
  });

  test('T21 a load on a support returns the zero-deflection limit, never NaN', async ({ page }) => {
    await openTool(page);
    const rows = await page.evaluate((args) => {
      const out = [];
      for (const support of ['cantilever', 'simple', 'fixed-fixed', 'propped']) {
        for (const a of [0, args.L]) {
          const r = window.BeamDeflection.solve({ support, loadType: 'point-at', a, ...args });
          out.push({
            support, a, ok: r.ok, degenerate: r.degenerate,
            deltaMax: r.deltaMax, xMax: r.xMax,
            finite: Number.isFinite(r.deltaMax),
            reactionTotal: r.reactions.reduce((s, x) => s + x.force, 0),
          });
        }
      }
      return out;
    }, { L, E, I, P });

    for (const r of rows) {
      expect(r.ok).toBe(true);
      expect(r.finite).toBe(true);
      expect(r.reactionTotal).toBeCloseTo(P, 6);
      if (r.support === 'cantilever' && r.a === L) {
        // Not degenerate: this is the standard tip-load case.
        expect(r.degenerate).toBe(false);
        expect(r.deltaMax).toBeGreaterThan(0);
      } else {
        expect(r.degenerate).toBe(true);
        expect(r.deltaMax).toBe(0);
      }
    }
  });
});

test.describe('page', () => {
  test('loads cleanly and renders the four support diagrams', async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, PAGE);
    await expect(page.locator('.support-card')).toHaveCount(4);
    await expect(page.locator('.support-card svg.bd-diagram')).toHaveCount(4);
    // Each card carries a text alternative naming its boundary condition.
    const labels = await page.locator('.support-card svg.bd-diagram').evaluateAll(
      (nodes) => nodes.map((n) => n.getAttribute('aria-label')),
    );
    expect(labels.every((l) => l && l.length > 20)).toBe(true);
    // Real radios, so the selector is keyboard and screen-reader operable.
    await expect(page.locator('.support-card input[type="radio"]')).toHaveCount(4);
    await expect(page.locator('.disclaimer')).toContainText('must not be used to size or verify a load-bearing member');
    // The scope warning is on the page from the first paint, with no dismissal
    // step in the way of it or of the calculator.
    await expect(page.locator('.disclaimer-card')).toBeVisible();
  });

  test('default case computes and matches the engine', async ({ page }) => {
    await openTool(page);
    // Defaults: simply supported, 10 kN at midspan, L = 3 m, E = 200 GPa,
    // 50 x 100 mm rectangle. I = 4.1667e-6 m^4, so delta = PL^3/48EI.
    const results = page.locator('#results');
    await expect(results).toContainText('Maximum deflection');
    const shown = await results.textContent();
    const expected = (P * L ** 3) / (48 * E * ((0.05 * 0.1 ** 3) / 12)) * 1e3;
    expect(expected).toBeCloseTo(6.75, 2);
    expect(shown).toContain('6.75');
    await expect(page.locator('#sectionProps')).toContainText('4166666.7');
  });

  test('changing the support case changes the answer by the expected factor', async ({ page }) => {
    await openTool(page);
    const read = async () => (await page.locator('#results .result-box.primary').textContent());

    await page.locator('#loadType').selectOption('udl');
    const simple = await read();

    await page.locator('.support-card[data-support="fixed-fixed"] input').check();
    const fixed = await read();

    // Same load, both ends supported, and 5x apart. This is what the diagrams
    // exist to show.
    const num = (t) => Number(t.match(/([\d.]+) mm/)[1]);
    expect(num(simple) / num(fixed)).toBeCloseTo(5, 2);
  });

  test('the position input appears only for the off-center case', async ({ page }) => {
    await openTool(page);
    await expect(page.locator('#loadPosGroup')).toBeHidden();
    await page.locator('#loadType').selectOption('point-at');
    await expect(page.locator('#loadPosGroup')).toBeVisible();
    await page.locator('#loadType').selectOption('udl');
    await expect(page.locator('#loadPosGroup')).toBeHidden();
  });

  test('invalid input shows an inline error, not an alert', async ({ page }) => {
    await openTool(page);
    let alerted = false;
    page.on('dialog', async (d) => { alerted = true; await d.dismiss(); });

    await page.fill('#span', '0');
    await expect(page.locator('#errorBanner')).toBeVisible();
    await expect(page.locator('#errorBanner')).toContainText('positive span');
    await expect(page.locator('#results')).toBeHidden();

    await page.fill('#span', '3');
    await expect(page.locator('#errorBanner')).toBeHidden();
    await expect(page.locator('#results')).toBeVisible();
    expect(alerted).toBe(false);
  });

  test('off-center load reports maximum and midspan as different points', async ({ page }) => {
    await openTool(page);
    await page.locator('#loadType').selectOption('point-at');
    await page.fill('#loadPos', '0.6');
    const box = page.locator('#results .result-box.primary');
    await expect(box).toContainText('Maximum deflection');
    await expect(box).toContainText('Deflection at midspan');
    await expect(box).toContainText('not the maximum for this case');
    // Maximum is left of midspan for a load left of midspan.
    const text = await box.textContent();
    const x = Number(text.match(/at x = ([\d.]+) m/)[1]);
    expect(x).toBeLessThan(1.5);
  });
});


test.describe('sections', () => {
  test('T10 a round tube with a zero bore equals the solid round', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => {
      const B = window.BeamDeflection;
      const solid = B.sectionProperties('round', { d: 0.05 });
      const tube = B.sectionProperties('tubeRound', { do: 0.05, di: 0 });
      return { solidI: solid.I, tubeI: tube.I, solidA: solid.A, tubeA: tube.A, solidS: solid.S, tubeS: tube.S };
    });
    expectRel(got.tubeI, got.solidI, 1e-15);
    expectRel(got.tubeA, got.solidA, 1e-15);
    expectRel(got.tubeS, got.solidS, 1e-15);
    // And the value itself is pi d^4 / 64.
    expectRel(got.solidI, (Math.PI * 0.05 ** 4) / 64, 1e-15);
  });

  test('a rectangular tube approaches the solid rectangle as the wall fills it', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => {
      const B = window.BeamDeflection;
      const solid = B.sectionProperties('rect', { b: 0.05, h: 0.1 });
      // Just inside the guard: 2t one micron short of the smaller dimension.
      const nearly = B.sectionProperties('tubeRect', { b: 0.05, h: 0.1, t: 0.025 - 1e-6 });
      return { solidI: solid.I, nearlyI: nearly.I, ok: nearly.ok };
    });
    expect(got.ok).toBe(true);
    expect(Math.abs(got.nearlyI - got.solidI) / got.solidI).toBeLessThan(1e-3);
  });

  test('I-beam properties match the rectangle-minus-voids construction', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => window.BeamDeflection.sectionProperties(
      'ibeam', { bf: 0.1, d: 0.2, tf: 0.01, tw: 0.006 },
    ));
    const hw = 0.2 - 2 * 0.01;
    expectRel(got.I, (0.1 * 0.2 ** 3 - (0.1 - 0.006) * hw ** 3) / 12, 1e-14);
    expectRel(got.A, 2 * 0.1 * 0.01 + 0.006 * hw, 1e-14);
    expectRel(got.c, 0.1, 1e-15);
    expectRel(got.S, got.I / 0.1, 1e-15);
  });

  test('T13 geometry guards reject rather than returning a negative second moment', async ({ page }) => {
    await openTool(page);
    const results = await page.evaluate(() => {
      const B = window.BeamDeflection;
      return [
        ['tube bore larger than outside', B.sectionProperties('tubeRound', { do: 40e-3, di: 50e-3 })],
        ['tube bore equal to outside', B.sectionProperties('tubeRound', { do: 40e-3, di: 40e-3 })],
        ['tube negative bore', B.sectionProperties('tubeRound', { do: 40e-3, di: -1e-3 })],
        ['wall thicker than half', B.sectionProperties('tubeRect', { b: 0.05, h: 0.1, t: 0.03 })],
        ['wall exactly half', B.sectionProperties('tubeRect', { b: 0.05, h: 0.1, t: 0.025 })],
        ['flanges fill the depth', B.sectionProperties('ibeam', { bf: 0.1, d: 0.02, tf: 0.01, tw: 0.006 })],
        ['web wider than flange', B.sectionProperties('ibeam', { bf: 0.006, d: 0.2, tf: 0.01, tw: 0.006 })],
        ['negative dimension', B.sectionProperties('rect', { b: -0.05, h: 0.1 })],
        ['zero dimension', B.sectionProperties('rect', { b: 0, h: 0.1 })],
      ].map(([label, r]) => ({ label, ok: r.ok, hasError: typeof r.error === 'string', I: r.I }));
    });
    for (const r of results) {
      expect(r.ok, r.label).toBe(false);
      expect(r.hasError, r.label).toBe(true);
      // A negative I would flip the deflection sign and read as an upward
      // deflection rather than as the input error it is.
      expect(r.I, r.label).toBeUndefined();
    }
  });
});

test.describe('units', () => {
  test('T11 the same physical beam agrees in SI and US customary', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => {
      const B = window.BeamDeflection;
      // 10 ft span, 1000 lbf at midspan, 29000 ksi, 2 x 6 in rectangle.
      const L_ft = 10;
      const P_lbf = 1000;
      const E_ksi = 29000;
      const b_in = 2;
      const h_in = 6;

      const si = {
        L: B.toSI(L_ft, 'span', 'us'),
        P: B.toSI(P_lbf, 'pointLoad', 'us'),
        E: B.toSI(E_ksi, 'modulus', 'us'),
        b: B.toSI(b_in, 'sectionDim', 'us'),
        h: B.toSI(h_in, 'sectionDim', 'us'),
      };
      const sec = B.sectionProperties('rect', { b: si.b, h: si.h });
      const r = B.solve({ support: 'simple', loadType: 'point-standard', L: si.L, E: si.E, I: sec.I, P: si.P });

      return {
        deflectionIn: B.fromSI(r.deltaMax, 'deflection', 'us'),
        deflectionMm: B.fromSI(r.deltaMax, 'deflection', 'si'),
        I_in4: B.fromSI(sec.I, 'secondMoment', 'us'),
        momentLbfFt: B.fromSI(Math.abs(r.MmaxAbs), 'moment', 'us'),
        spanFt: B.fromSI(r.L, 'span', 'us'),
        // Round trip every quantity through both directions.
        roundTrips: ['span', 'deflection', 'sectionDim', 'pointLoad', 'distLoad', 'modulus',
          'strength', 'stress', 'moment', 'reaction', 'secondMoment', 'sectionModulus',
          'area', 'density'].map((q) => {
          const si1 = B.toSI(7.3, q, 'us');
          return Math.abs(B.fromSI(si1, q, 'us') - 7.3);
        }),
      };
    });

    // I = b h^3 / 12 = 2 * 216 / 12 = 36 in^4, exactly.
    expect(got.I_in4).toBeCloseTo(36, 9);
    // M = P L / 4 = 1000 * 10 / 4 = 2500 lbf*ft.
    expect(got.momentLbfFt).toBeCloseTo(2500, 6);
    expect(got.spanFt).toBeCloseTo(10, 9);
    // delta = P L^3 / 48 E I with L = 120 in: 1000 * 120^3 / (48 * 29e6 * 36).
    const expectedIn = (1000 * 120 ** 3) / (48 * 29e6 * 36);
    expect(got.deflectionIn).toBeCloseTo(expectedIn, 9);
    // The metric view of the same beam is the same physical deflection.
    expect(got.deflectionMm).toBeCloseTo(expectedIn * 25.4, 9);
    for (const err of got.roundTrips) expect(err).toBeLessThan(1e-12);
  });

  test('switching the unit selector keeps the physical beam unchanged', async ({ page }) => {
    await openTool(page);
    const readDeflectionMM = async () => {
      const text = await page.locator('#results .result-box.primary').textContent();
      return Number(text.match(/([\d.]+) mm/)[1]);
    };
    const before = await readDeflectionMM();

    await page.locator('#unitSystem').selectOption('us');
    await expect(page.locator('#spanLabel')).toContainText('(ft)');
    const usText = await page.locator('#results .result-box.primary').textContent();
    const inches = Number(usText.match(/([\d.]+) in/)[1]);
    // Compared at display precision: both panels round before rendering, so this
    // asserts the rendered views agree, not the physics. Exact equivalence of the
    // two unit systems is T11, which works on the raw engine values.
    expect(inches * 25.4).toBeCloseTo(before, 2);

    // And back again, with the span input still describing the same beam.
    await page.locator('#unitSystem').selectOption('si');
    expect(await readDeflectionMM()).toBeCloseTo(before, 3);
    expect(Number(await page.locator('#span').inputValue())).toBeCloseTo(3, 6);
  });
});

test.describe('stress and limits', () => {
  test('T14 stress follows M / S for the reference beam', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate((args) => {
      const B = window.BeamDeflection;
      const r = B.solve({ support: 'simple', loadType: 'point-standard', ...args });
      const check = B.stressCheck({
        MmaxAbs: r.MmaxAbs,
        S: 1e-4,
        strength: { kind: 'yield', value: 250e6 },
        safetyFactor: 1,
      });
      return { M: r.MmaxAbs, sigma: check.sigma, util: check.utilization, pass: check.pass, bar: check.showUtilizationBar };
    }, { L, E, I, P });
    // M = P L / 4 = 7500 N*m, so sigma = 7500 / 1e-4 = 75 MPa.
    expectRel(got.M, (P * L) / 4, 1e-12);
    expectRel(got.sigma, 75e6, 1e-12);
    expectRel(got.util, 75e6 / 250e6, 1e-12);
    expect(got.pass).toBe(true);
    expect(got.bar).toBe(true);
  });

  test('the safety factor divides the allowable, not the stress', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => {
      const B = window.BeamDeflection;
      const base = { MmaxAbs: 7500, S: 1e-4, strength: { kind: 'yield', value: 250e6 } };
      const one = B.stressCheck({ ...base, safetyFactor: 1 });
      const two = B.stressCheck({ ...base, safetyFactor: 2 });
      return { s1: one.sigma, s2: two.sigma, u1: one.utilization, u2: two.utilization, a2: two.allowable };
    });
    expect(got.s1).toBe(got.s2);
    expectRel(got.u2, 2 * got.u1, 1e-12);
    expectRel(got.a2, 125e6, 1e-12);
  });

  test('exceeding strength is a hard warning that invalidates the elastic result', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => {
      const B = window.BeamDeflection;
      const ductile = B.stressCheck({ MmaxAbs: 1e5, S: 1e-4, strength: { kind: 'yield', value: 250e6 } });
      const brittle = B.stressCheck({ MmaxAbs: 1e5, S: 1e-4, strength: { kind: 'rupture', value: 250e6 } });
      return {
        dPass: ductile.pass,
        dIds: ductile.warnings.map((w) => w.id),
        bIds: brittle.warnings.map((w) => w.id),
        dText: ductile.warnings.map((w) => w.text).join(' '),
      };
    });
    expect(got.dPass).toBe(false);
    expect(got.dIds).toContain('yield-exceeded');
    expect(got.bIds).toContain('rupture-exceeded');
    expect(got.dText).toContain('no longer elastic');
  });

  test('T15 the deflection limit flips across its boundary, not at float equality', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => {
      const B = window.BeamDeflection;
      const L = 3;
      const atLimit = L / 360;
      const eps = atLimit * 1e-6;
      return {
        justUnder: B.deflectionRatio(atLimit - eps, L, 360),
        exactly: B.deflectionRatio(atLimit, L, 360),
        justOver: B.deflectionRatio(atLimit + eps, L, 360),
        noLimit: B.deflectionRatio(atLimit, L, null),
      };
    });
    expect(got.justUnder.pass).toBe(true);
    expect(got.justOver.pass).toBe(false);
    // At the boundary the span-over-deflection ratio equals the limit, which the
    // check treats as passing; asserted here so the convention is pinned rather
    // than left to whichever way a float lands.
    expect(got.exactly.pass).toBe(true);
    expect(got.noLimit.pass).toBe(null);
    expect(got.noLimit.ratio).toBeCloseTo(360, 6);
  });

  test('T22 a material with no yield strength skips the ductile check and says why', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => {
      const B = window.BeamDeflection;
      const args = { MmaxAbs: 5000, S: 1e-4 };
      const none = B.stressCheck({ ...args, strength: { kind: 'none', value: null } });
      // Rupture strength above the applied stress, so this row passes and the
      // brittle caveat is what shows; the exceeded case is covered separately.
      const brittle = B.stressCheck({ ...args, strength: { kind: 'rupture', value: 100e6 } });
      const ductile = B.stressCheck({ ...args, strength: { kind: 'yield', value: 250e6 } });
      return {
        none: { skipped: none.skipped, util: none.utilization, sigma: none.sigma, reason: none.reason, pass: none.pass },
        brittle: { skipped: brittle.skipped, bar: brittle.showUtilizationBar, ids: brittle.warnings.map((w) => w.id) },
        ductile: { bar: ductile.showUtilizationBar },
      };
    });
    // No strength: the stress is still reported, the comparison is not invented.
    expect(got.none.skipped).toBe(true);
    expect(got.none.utilization ?? null).toBe(null);
    expect(got.none.pass).toBe(null);
    expect(got.none.sigma).toBeCloseTo(5e7, 3);
    expect(got.none.reason).toContain('no single strength value');
    // Brittle: checked, but no ductile utilization bar and a fracture caveat.
    expect(got.brittle.skipped).toBe(false);
    expect(got.brittle.bar).toBe(false);
    expect(got.brittle.ids).toContain('brittle-check');
    expect(got.ductile.bar).toBe(true);
  });

  test('self-weight is rho A g, and is offered only where it is valid', async ({ page }) => {
    await openTool(page);
    const w = await page.evaluate(() => window.BeamDeflection.selfWeightUDL(7850, 0.005));
    expectRel(w, 7850 * 0.005 * 9.80665, 1e-12);
    // Guards: no density, no area, nonsense input all give zero rather than NaN.
    const guards = await page.evaluate(() => {
      const f = window.BeamDeflection.selfWeightUDL;
      return [f(0, 0.005), f(7850, 0), f(NaN, 0.005), f(7850, null)];
    });
    for (const g of guards) expect(g).toBe(0);

    // Disabled on point loads, because combining it would need superposition.
    await expect(page.locator('#selfWeight')).toBeDisabled();
    await expect(page.locator('#selfWeightNote')).toContainText('superposition');
    await page.locator('#loadType').selectOption('udl');
    await expect(page.locator('#selfWeight')).toBeEnabled();
    // And disabled again on a custom section, which supplies no area.
    await page.locator('#sectionType').selectOption('custom');
    await expect(page.locator('#selfWeight')).toBeDisabled();
    await expect(page.locator('#selfWeightNote')).toContainText('cross-sectional area');
  });
});

test.describe('materials', () => {
  test('every row carries a source, a usable modulus, and a valid strength kind', async ({ page }) => {
    await openTool(page);
    const rows = await page.evaluate(() => window.BeamDeflection.MATERIALS.map((m) => ({
      id: m.id,
      cat: m.cat,
      E: m.E,
      rho: m.rho,
      kind: m.strength.kind,
      value: m.strength.value,
      source: m.source,
      gated: !!m.gated,
      rangeOk: !m.E_range || (m.E_range[0] <= m.E && m.E <= m.E_range[1]),
    })));
    expect(rows.length).toBeGreaterThanOrEqual(20);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of rows) {
      expect(r.E, r.id).toBeGreaterThan(0);
      expect(r.rho, r.id).toBeGreaterThan(0);
      expect(['yield', 'rupture', 'none'], r.id).toContain(r.kind);
      // No value ships unsourced, and "web" is not a source.
      expect(r.source, r.id).toBeTruthy();
      expect(r.source.length, r.id).toBeGreaterThan(10);
      expect(r.rangeOk, r.id).toBe(true);
      if (r.kind === 'none') expect(r.value, r.id).toBe(null);
      else expect(r.value, r.id).toBeGreaterThan(0);
    }
    // Brittle materials must not be typed as yielding.
    const brittle = rows.filter((r) => r.cat === 'Brittle');
    expect(brittle.length).toBeGreaterThan(0);
    for (const r of brittle) expect(r.kind, r.id).toBe('rupture');
  });

  test('T16 concrete is gated with an explanation instead of a number', async ({ page }) => {
    await openTool(page);
    const row = await page.evaluate(() => {
      const m = window.BeamDeflection.MATERIALS_BY_ID['concrete-plain'];
      return { gated: !!m.gated, kind: m.strength.kind, reason: m.gateReason };
    });
    expect(row.gated).toBe(true);
    expect(row.kind).toBe('none');
    expect(row.reason).toContain('reinforced');

    await page.locator('#material').selectOption('concrete-plain');
    const gate = page.locator('.gate-box');
    await expect(gate).toBeVisible();
    await expect(gate).toContainText('not computed here');
    await expect(gate).toContainText('reinforced-section problem');
    // No deflection number is offered alongside the refusal.
    await expect(page.locator('#results .result-box.primary')).toHaveCount(0);
  });

  test('selecting a material drives the modulus and shows its provenance', async ({ page }) => {
    await openTool(page);
    await page.locator('#material').selectOption('alu-6061-t6');
    expect(Number(await page.locator('#modulus').inputValue())).toBeCloseTo(68.9, 6);
    await expect(page.locator('#materialFacts')).toContainText('Yield strength');
    await expect(page.locator('#materialFacts')).toContainText('Source:');

    // A brittle row is labelled as rupture, not as yield.
    await page.locator('#material').selectOption('glass-soda-lime');
    await expect(page.locator('#materialFacts')).toContainText('Modulus of rupture');
    await expect(page.locator('#results')).toContainText('fails by fracture');
  });

  test('plastics raise the creep warning and wood the duration-of-load warning', async ({ page }) => {
    await openTool(page);
    await page.locator('#material').selectOption('hdpe');
    await expect(page.locator('#results')).toContainText('keeps deflecting');
    await page.locator('#material').selectOption('wood-dfl-no2');
    await expect(page.locator('#results')).toContainText('species, grade, moisture');
  });
});

test.describe('independent numerical cross-check', () => {
  test('every closed form agrees with the finite-element solve across a position sweep', async ({ page }) => {
    test.setTimeout(60000);
    await openTool(page);
    const report = await page.evaluate(() => {
      const r = window.BeamDeflection.verifyAll();
      return {
        total: r.total,
        pass: r.pass,
        worst: r.worstDeltaError,
        worstLabel: r.worstLabel,
        elements: r.elements,
        failed: r.failed.map((f) => ({ s: f.support, lt: f.loadType, a: f.a, e: f.deltaError })),
      };
    });
    expect(report.failed).toEqual([]);
    expect(report.pass).toBe(true);
    // Four support cases x (two standard load types + seven swept positions).
    // 4 supports x (1 standard + 1 full-span UDL + 7 positions + 6 partial bands).
    expect(report.total).toBe(60);
    expect(report.elements).toBe(200);
    // Agreement is far tighter than any real coefficient error would be.
    expect(report.worst).toBeLessThan(1e-6);
  });

  test('the solve is independent enough to catch a deliberately corrupted coefficient', async ({ page }) => {
    await openTool(page);
    // The point of layer 3 is that it fails when a closed form is wrong. Feed the
    // comparison the widely reproduced 1/185 rounding for the propped UDL case
    // and confirm the numerical solve rejects it, which is what makes a passing
    // run meaningful rather than circular.
    const got = await page.evaluate(() => {
      const B = window.BeamDeflection;
      const L = 3, E = 200e9, I = 1e-5, w = 5000;
      const fe = B.feSolveBeam({ support: 'propped', loadType: 'udl', L, E, I, w });
      const exact = B.PROPPED_UDL_COEFF * w * L ** 4 / (E * I);
      const rounded = (w * L ** 4) / (185 * E * I);
      return {
        feDelta: fe.dMax,
        exactError: Math.abs(exact - fe.dMax) / fe.dMax,
        roundedError: Math.abs(rounded - fe.dMax) / fe.dMax,
      };
    });
    expect(got.exactError).toBeLessThan(1e-7);
    // The rounding is off by about 0.198%, which is thousands of times the noise
    // floor of the check, so a regression to 1/185 could not slip through.
    expect(got.roundedError).toBeGreaterThan(1.9e-3);
    expect(got.roundedError / got.exactError).toBeGreaterThan(1000);
  });

  test('published table values, pinned as literals', async ({ page }) => {
    await openTool(page);
    // Third anchor beyond the closed forms and the numerical solve: constants as
    // they appear in AISC's beam diagrams and formulas tables. The closed form,
    // the finite-element solve, and an outside source all have to agree.
    const got = await page.evaluate((args) => {
      const B = window.BeamDeflection;
      const { L, E, I, P, w } = args;
      const EI = E * I;
      return {
        // AISC case 1, simple beam, uniformly distributed: 5wl^4 / 384EI
        simpleUDL: B.solve({ support: 'simple', loadType: 'udl', L, E, I, w }).deltaMax,
        simpleUDLBook: (5 * w * L ** 4) / (384 * EI),
        // AISC case 7, simple beam, concentrated load at centre: Pl^3 / 48EI
        simpleCentre: B.solve({ support: 'simple', loadType: 'point-standard', L, E, I, P }).deltaMax,
        simpleCentreBook: (P * L ** 3) / (48 * EI),
        // AISC case 15, beam fixed at both ends, uniformly distributed:
        // wl^4 / 384EI
        fixedUDL: B.solve({ support: 'fixed-fixed', loadType: 'udl', L, E, I, w }).deltaMax,
        fixedUDLBook: (w * L ** 4) / (384 * EI),
        // AISC case 12, beam fixed one end supported at other, uniformly
        // distributed: the table locates the maximum at 0.4215l from the propped
        // end, which is 0.5785l from the fixed end where this tool measures.
        proppedX: B.solve({ support: 'propped', loadType: 'udl', L, E, I, w }).xMax / L,
        proppedXBook: 1 - 0.4215,
      };
    }, { L, E, I, P, w });

    expectRel(got.simpleUDL, got.simpleUDLBook, 1e-12);
    expectRel(got.simpleCentre, got.simpleCentreBook, 1e-12);
    expectRel(got.fixedUDL, got.fixedUDLBook, 1e-12);
    // The published location is quoted to four figures, so it pins ours to that.
    expect(got.proppedX).toBeCloseTo(got.proppedXBook, 4);
  });

  test('the verification button reports its result and its element count', async ({ page }) => {
    await openTool(page);
    await page.locator('#verifyBtn').click();
    const out = page.locator('#verifyOutput');
    await expect(out).toBeVisible();
    await expect(out.locator('.verify-result')).toHaveClass(/pass/);
    await expect(out).toContainText('60 closed forms agree');
    await expect(out).toContainText('200 Hermitian beam elements');
    // The known limit of the method is stated rather than left implied.
    await expect(out).toContainText('shear deformation');
  });
});

test.describe('page, phase 2', () => {
  test('each support card shows that case for the beam currently entered', async ({ page }) => {
    await openTool(page);
    await page.locator('#loadType').selectOption('udl');
    const values = await page.locator('[data-support-value]').allTextContents();
    expect(values.filter((v) => v.trim().length > 0)).toHaveLength(4);

    const num = (t) => Number(t.match(/([\d.]+)/)[1]);
    const byCase = {};
    for (const support of ['cantilever', 'simple', 'fixed-fixed', 'propped']) {
      byCase[support] = num(await page.locator(`[data-support-value="${support}"]`).textContent());
    }
    // The comparison the tool exists to make: same load, both ends supported,
    // five times apart.
    expect(byCase.simple / byCase['fixed-fixed']).toBeCloseTo(5, 2);
    // And a cantilever under the same load is far worse than either.
    expect(byCase.cantilever).toBeGreaterThan(byCase.simple * 9);
  });

  test('the comparison block ranks all four boundary conditions', async ({ page }) => {
    await openTool(page);
    const block = page.locator('#results .result-box', { hasText: 'Same beam, other boundary conditions' });
    await expect(block).toContainText('Cantilever');
    await expect(block).toContainText('Simply supported');
    await expect(block).toContainText('Fixed-fixed');
    await expect(block).toContainText('Propped cantilever');
    await expect(block.locator('.compare-row.current')).toHaveCount(1);
  });

  test('the deflection limit shows a pass or fail against the selected ratio', async ({ page }) => {
    await openTool(page);
    const primary = page.locator('#results .result-box.primary');
    await expect(primary).toContainText('Span / deflection');
    await expect(primary).toContainText('L / 360');

    // Default beam: 3 m, 10 kN at midspan, 50 x 100 mm steel gives L/444, a pass.
    await expect(primary.locator('.badge-pass')).toHaveCount(1);

    // Triple the load and the same beam fails the same limit.
    await page.fill('#loadMagnitude', '30');
    await expect(primary.locator('.badge-fail')).toHaveCount(1);

    await page.locator('#limitSelect').selectOption('custom');
    await expect(page.locator('#customLimitGroup')).toBeVisible();
  });

  test('stress and utilization render for the selected material', async ({ page }) => {
    await openTool(page);
    const stress = page.locator('#results .result-box', { hasText: 'Bending stress' });
    await expect(stress).toContainText('Maximum bending stress');
    await expect(stress).toContainText('Utilization');
    await expect(stress.locator('.util-bar')).toHaveCount(1);

    // Glass is brittle: checked against rupture, and with no ductile bar.
    await page.locator('#material').selectOption('glass-soda-lime');
    await expect(stress).toContainText('rupture');
    await expect(stress.locator('.util-bar')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 3: material sign-off, accessibility, responsive, themes, CSP.
//
// The material pins below exist because the September 2026 review moved seven
// values, and five of those moves were the same mistake: a typical measured
// property standing in for a specified minimum. Typical values are the larger
// number, so that mistake always overstates capacity, and it is invisible in a
// result, because every piece of arithmetic downstream of it is correct.
// Nothing else in this file would notice it coming back.
// ---------------------------------------------------------------------------

test.describe('material data, signed off', () => {
  test('every row is reviewed and names a source that was actually read', async ({ page }) => {
    await openTool(page);
    const rows = await page.evaluate(() => window.BeamDeflection.MATERIALS.map((m) => ({
      id: m.id, reviewed: m.reviewed, source: m.source,
    })));
    for (const r of rows) expect(r.reviewed, r.id).toBe(true);

    // The handbooks several rows once cited were never opened. A citation
    // nobody checked reads as authority it has not earned.
    for (const r of rows) {
      expect(r.source, r.id).not.toMatch(/ASM Engineered Materials Handbook/);
    }

    // With nothing outstanding, the provisional warning must be gone.
    await expect(page.locator('#results')).not.toContainText('provisional');
  });

  test('the reviewed values are pinned against a regression to typical figures', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => {
      const by = window.BeamDeflection.MATERIALS_BY_ID;
      const pick = (id) => ({
        E: by[id].E, kind: by[id].strength.kind, value: by[id].strength.value, rho: by[id].rho,
      });
      return {
        s304: pick('stainless-304'),
        s316: pick('stainless-316'),
        a6061: pick('alu-6061-t6'),
        a6063: pick('alu-6063-t5'),
        nylon: pick('nylon-66'),
        glass: pick('glass-soda-lime'),
        alumina: pick('alumina-99'),
        iron: by['cast-iron-gray-30'].E_range,
      };
    });

    // ASTM A240 specifies the same 205 MPa minimum for both grades. The old 304
    // row carried the 215 MPa typical value, so the category mixed two bases.
    expect(got.s304.value).toBe(205e6);
    expect(got.s316.value).toBe(205e6);

    // Aluminum Design Manual minimums, not the 276 / 145 MPa typical values.
    expect(got.a6061.value).toBe(241e6);
    expect(got.a6063.value).toBe(110e6);

    // Zytel 101 dry as moulded, a matched pair. The old row paired a dry-ish
    // modulus with a conditioned-ish strength, which describes no real state.
    expect(got.nylon.E).toBe(3.1e9);
    expect(got.nylon.value).toBe(82e6);

    // National Glass Association FM05-12.
    expect(got.glass.E).toBe(71.7e9);
    expect(got.glass.value).toBe(41e6);
    expect(got.glass.rho).toBe(2530);
    expect(got.glass.kind).toBe('rupture');

    // CoorsTek AD-995 4-point flexural, not the higher 3-point figure.
    expect(got.alumina.value).toBe(300e6);

    // Class 30 specifically, not the span of every gray iron class.
    expect(got.iron).toEqual([90e9, 113e9]);
  });

  test('the wood rows still match NDS Table 4A to the printed psi', async ({ page }) => {
    await openTool(page);
    // Fb and E as printed in Table 4A. The conversion is done here rather than
    // trusted from the data, so a slip on either side of it shows up.
    const PSI = 6894.757293168361;
    const table = {
      'wood-dfl-ss': { Fb: 1500, E: 1.9e6 },
      'wood-dfl-no2': { Fb: 900, E: 1.6e6 },
      'wood-hf-no2': { Fb: 850, E: 1.3e6 },
      'wood-spf-no2': { Fb: 875, E: 1.4e6 },
      'wood-glulam-24f': { Fb: 2400, E: 1.8e6 },
    };
    const rows = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
      const m = window.BeamDeflection.MATERIALS_BY_ID[id];
      return [id, { E: m.E, value: m.strength.value, kind: m.strength.kind, name: m.name }];
    })), Object.keys(table));

    for (const [id, want] of Object.entries(table)) {
      // Shipped values are rounded to three significant figures, so the check
      // is that they round-trip to the printed psi, not to the bit.
      // Stored to six significant figures, so these round-trip to the psi.
      expect(rows[id].value / PSI, `${id} Fb`).toBeCloseTo(want.Fb, 1);
      expect(rows[id].E / PSI, `${id} E`).toBeCloseTo(want.E, -2);
      // Wood fails by fracture; a ductile utilization bar would be a lie.
      expect(rows[id].kind, id).toBe('rupture');
    }

    // Table 4A has no standalone No. 2 row for this species group.
    expect(rows['wood-spf-no2'].name).toContain('No. 1/No. 2');
  });
});

test.describe('worked examples', () => {
  test('every preset applies cleanly and produces a result', async ({ page }) => {
    await openTool(page);
    const presets = await page.evaluate(() => window.BeamDeflection.PRESETS.map((p) => p.id));
    expect(presets.length).toBeGreaterThanOrEqual(5);

    for (const id of presets) {
      await page.locator(`[data-preset="${id}"]`).click();
      await expect(page.locator('#errorBanner'), id).toBeHidden();
      await expect(page.locator('#results .result-box.primary'), id).toBeVisible();
      await expect(page.locator('#results'), id).toContainText('Maximum deflection');
      // Each example says what it demonstrates.
      await expect(page.locator('#presetNote'), id).not.toBeEmpty();
      await expect(page.locator(`[data-preset="${id}"]`), id).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('a preset lands on the deflection it exists to demonstrate', async ({ page }) => {
    await openTool(page);

    // 50 x 100 mm steel bar, 3 m, 5 kN/m simply supported.
    // I = 4.1666667e-6 m^4, delta = 5wL^4/384EI = 6.328125 mm exactly.
    await page.locator('[data-preset="fixed-vs-simple"]').click();
    const primary = page.locator('#results .result-box.primary');
    await expect(primary).toContainText('6.3281 mm');

    // That example exists to show fixed-fixed is 5x stiffer under a UDL.
    await expect(page.locator('.support-card', { hasText: 'Fixed-fixed' })).toContainText('1.266 mm');

    // 20 x 6 mm PLA bar, 80 mm cantilever, 20 N: PL^3/3EI = 2.708995 mm.
    await page.locator('[data-preset="printed-bracket"]').click();
    await expect(primary).toContainText('2.709 mm');
    // The stress check passes and the part is still useless.
    await expect(page.locator('#results')).toContainText('keeps deflecting');
  });

  test('the US customary preset stays in US units end to end', async ({ page }) => {
    await openTool(page);
    await page.locator('[data-preset="joist-2x10"]').click();

    await expect(page.locator('#unitSystem')).toHaveValue('us');
    await expect(page.locator('#spanLabel')).toContainText('(ft)');
    await expect(page.locator('#span')).toHaveValue('12');
    await expect(page.locator('#sec-h')).toHaveValue('9.25');

    // 2x10 DF-L No.2 at 16 in centres over 12 ft: about 0.21 in, comfortably
    // inside L/360 = 0.4 in, which is the point the example makes.
    const primary = page.locator('#results .result-box.primary');
    await expect(primary).toContainText(' in');
    await expect(primary.locator('.badge-pass')).toHaveCount(1);
    const text = await primary.textContent();
    const deflection = Number(text.match(/([\d.]+) in/)[1]);
    expect(deflection).toBeGreaterThan(0.15);
    expect(deflection).toBeLessThan(0.25);
  });

  test('editing any input releases the active example', async ({ page }) => {
    await openTool(page);
    const btn = page.locator('[data-preset="glass-shelf"]');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');

    // The form no longer matches the example, so it must stop claiming to.
    await page.fill('#span', '1.2');
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#presetNote')).toBeEmpty();
  });

  test('the glass example is checked against rupture with no ductile bar', async ({ page }) => {
    await openTool(page);
    await page.locator('[data-preset="glass-shelf"]').click();
    const stress = page.locator('#results .result-box', { hasText: 'Bending stress' });
    await expect(stress).toContainText('rupture');
    await expect(stress.locator('.util-bar')).toHaveCount(0);
    await expect(page.locator('#results')).toContainText('fails by fracture');
  });
});

test.describe('accessibility', () => {
  test('every form control has an accessible name', async ({ page }) => {
    await openTool(page);
    const unnamed = await page.evaluate(() => {
      const bad = [];
      for (const node of document.querySelectorAll('input, select, textarea, button')) {
        if (node.type === 'hidden') continue;
        const byLabel = node.id && document.querySelector(`label[for="${CSS.escape(node.id)}"]`);
        const named = node.getAttribute('aria-label')
          || node.getAttribute('aria-labelledby')
          || node.getAttribute('title')
          || byLabel
          || node.closest('label')
          || (node.tagName === 'BUTTON' && node.textContent.trim().length > 0);
        if (!named) bad.push(node.id || node.outerHTML.slice(0, 80));
      }
      return bad;
    });
    expect(unnamed).toEqual([]);
  });

  test('explanatory notes are wired to their control, not left floating nearby', async ({ page }) => {
    await openTool(page);
    const links = await page.evaluate(() => {
      const out = {};
      for (const id of ['loadType', 'selfWeight', 'material', 'sectionType', 'limitSelect', 'safetyFactor']) {
        const node = document.getElementById(id);
        const target = node && node.getAttribute('aria-describedby');
        out[id] = target ? !!document.getElementById(target) : false;
      }
      return out;
    });
    for (const [id, ok] of Object.entries(links)) expect(ok, id).toBe(true);
  });

  test('a change to the beam is announced as one line, not the whole panel', async ({ page }) => {
    await openTool(page);
    const status = page.locator('#resultsStatus');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toContainText('Maximum deflection');

    // It tracks the result rather than being written once at load.
    const before = await status.textContent();
    await page.fill('#loadMagnitude', '40');
    await expect(status).not.toHaveText(before);
    await expect(status).toContainText('span over deflection');

    // Marking #results itself live would re-read every reaction, warning and
    // comparison row on each keystroke, so it must not be a live region.
    const resultsIsLive = await page.evaluate(() => {
      const r = document.getElementById('results');
      return r.getAttribute('aria-live') || r.getAttribute('role');
    });
    expect(resultsIsLive).toBeNull();
  });

  test('an invalid input is announced as an alert and clears the stale summary', async ({ page }) => {
    await openTool(page);
    await page.fill('#span', '-1');
    await expect(page.locator('#errorBanner')).toBeVisible();
    await expect(page.locator('#errorBanner')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#resultsStatus')).toBeEmpty();
  });

  test('the diagrams carry text alternatives, and do not repeat them inside the cards', async ({ page }) => {
    await openTool(page);
    const svgs = await page.evaluate(() => [...document.querySelectorAll('.bd-diagram')].map((s) => ({
      role: s.getAttribute('role'),
      label: s.getAttribute('aria-label'),
      title: s.querySelector('title') ? s.querySelector('title').textContent : null,
      hiddenInCard: !!s.closest('[aria-hidden="true"]'),
    })));
    expect(svgs.length).toBe(4);
    for (const s of svgs) {
      expect(s.role).toBe('img');
      expect(s.label).toBeTruthy();
      expect(s.title).toBe(s.label);
      // Inside the card the radio's own label already names the case, so one
      // announcement is enough and three is noise.
      expect(s.hiddenInCard).toBe(true);
    }

    // The card itself still names the case in text.
    await expect(page.locator('.support-card').first()).toContainText('Cantilever');
  });

  test('the case selector is operable from the keyboard alone', async ({ page }) => {
    await openTool(page);
    await page.locator('.support-card input[value="cantilever"]').focus();
    await page.keyboard.press('ArrowRight');
    const checked = await page.evaluate(() => document.querySelector('input[name="support"]:checked').value);
    expect(checked).not.toBe('cantilever');
    // Arrowing between radios must recompute the beam as well as move the dot.
    await expect(page.locator('#results')).toContainText('Maximum deflection');
  });

  test('text meets WCAG AA contrast in both themes', async ({ page }) => {
    await openTool(page);
    const measure = async (theme) => {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      // .support-card transitions its background, and getComputedStyle during a
      // running transition returns the interpolated value, so measuring straight
      // after the swap reads the outgoing theme's colour and reports a false
      // contrast failure. Wait the 150ms transition out.
      await page.waitForTimeout(300);
      return page.evaluate(() => {
      const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lin = (v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const ratio = (a, b) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      // Walk up for the first painted background, the way a reader sees it.
      const bgOf = (node) => {
        for (let n = node; n; n = n.parentElement) {
          const c = getComputedStyle(n).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return parse(c);
        }
        return parse(getComputedStyle(document.body).backgroundColor);
      };
      const out = {};
      for (const sel of ['.field-note', '.support-sub', '.section-title', '.material-source', '.preset-summary']) {
        const node = document.querySelector(sel);
        if (!node) continue;
        out[sel] = ratio(parse(getComputedStyle(node).color), bgOf(node));
      }
      return out;
      });
    };

    for (const theme of ['dark', 'light']) {
      const ratios = await measure(theme);
      expect(Object.keys(ratios).length, theme).toBeGreaterThan(2);
      for (const [sel, r] of Object.entries(ratios)) {
        // 4.5:1 is the AA threshold for body text. --text-muted, which this
        // tool deliberately does not use, measures 2.6:1 light and 3.7:1 dark.
        expect(r, `${theme} ${sel} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

test.describe('responsive, themes, and CSP', () => {
  for (const width of [1280, 900, 768, 375]) {
    test(`nothing overflows horizontally at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openTool(page);
      await page.locator('[data-preset="joist-2x10"]').click();

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const wide = [];
        for (const node of document.querySelectorAll('body *')) {
          const r = node.getBoundingClientRect();
          if (r.width > 0 && r.right > doc.clientWidth + 1) {
            wide.push(`${node.tagName}.${node.className}`.slice(0, 60));
          }
        }
        return { scrolls: doc.scrollWidth > doc.clientWidth + 1, wide: wide.slice(0, 5) };
      });
      expect(overflow.wide).toEqual([]);
      expect(overflow.scrolls).toBe(false);
    });
  }

  test('the case selector reflows at its two breakpoints', async ({ page }) => {
    await openTool(page);
    const columns = () => page.evaluate(() => {
      const tops = [...document.querySelectorAll('.support-card')].map((c) => Math.round(c.getBoundingClientRect().top));
      return tops.filter((t) => t === tops[0]).length;
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    expect(await columns()).toBe(4);
    // Four diagrams shrunk to illegibility help nobody, so they drop to two
    // across and then to one rather than scaling down indefinitely.
    await page.setViewportSize({ width: 880, height: 900 });
    expect(await columns()).toBe(2);
    await page.setViewportSize({ width: 700, height: 900 });
    expect(await columns()).toBe(1);
  });

  test('both themes render the results and the diagrams', async ({ page }) => {
    await openTool(page);
    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await expect(page.locator('#results .result-box.primary'), theme).toBeVisible();
      await expect(page.locator('.bd-diagram'), theme).toHaveCount(4);
      // Diagrams theme through currentColor and CSS variables with no JS, so a
      // theme swap must not need a redraw to stay legible.
      const painted = await page.evaluate(() => {
        const node = document.querySelector('.bd-beam');
        const c = getComputedStyle(node);
        return { stroke: c.stroke, color: c.color };
      });
      expect(painted.stroke || painted.color, theme).toBeTruthy();
      expect(painted.stroke, theme).not.toBe('none');
    }
  });

  test('the strict CSP is not violated by anything the tool does', async ({ page }) => {
    const consoleHits = [];
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) consoleHits.push(m.text());
    });

    await openTool(page);
    // Exercise the paths that build DOM and run the numerical solve, since a
    // CSP break is likelier there than at first load.
    await page.locator('[data-preset="off-centre-rail"]').click();
    await page.locator('#unitSystem').selectOption('us');
    await page.locator('#sectionType').selectOption('ibeam');
    await page.locator('#verifyBtn').click();
    await expect(page.locator('#verifyOutput')).toContainText('agree');

    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(consoleHits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Partial distributed load.
//
// The Macaulay skeleton behind this is shared by all four support cases, so a
// mistake in it is a mistake everywhere at once. Three independent things pin
// it: the full-span limit must reproduce the four tabulated closed forms, a
// band shrinking onto a point must reproduce the point-load solution, and the
// finite-element sweep must agree on bands that touch neither end.
// ---------------------------------------------------------------------------

test.describe('partial distributed load', () => {
  test('the full-span band collapses onto the tabulated full-span forms', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate((arg) => {
      const out = {};
      for (const support of ['cantilever', 'simple', 'fixed-fixed', 'propped']) {
        const partial = window.BeamDeflection.solve({
          support, loadType: 'udl-partial', a: 0, c: arg.L, ...arg,
        });
        const full = window.BeamDeflection.solve({ support, loadType: 'udl', ...arg });
        out[support] = {
          partial: partial.deltaMax,
          full: full.deltaMax,
          xPartial: partial.xMax,
          xFull: full.xMax,
          mPartial: partial.MmaxAbs,
          mFull: full.MmaxAbs,
        };
      }
      return out;
    }, { L, E, I, w });

    for (const [support, r] of Object.entries(got)) {
      // Two independently derived routes to the same number, so this is tight.
      expectRel(r.partial, r.full, 1e-12);
      expect(Math.abs(r.xPartial - r.xFull), `${support} location`).toBeLessThan(L * 1e-6);
      expectRel(r.mPartial, r.mFull, 1e-12);
    }
  });

  test('a band shrinking onto a point reproduces the point load', async ({ page }) => {
    await openTool(page);
    // Total load held at P while the band narrows around a = 1.2 m.
    const got = await page.evaluate((arg) => {
      const at = 1.2;
      const point = window.BeamDeflection.solve({
        support: 'simple', loadType: 'point-at', a: at, P: arg.P, ...arg,
      }).deltaMax;
      const bands = [0.4, 0.1, 0.02, 0.004].map((c) => window.BeamDeflection.solve({
        support: 'simple', loadType: 'udl-partial', a: at - c / 2, c, w: arg.P / c, ...arg,
      }).deltaMax);
      return { point, bands };
    }, { L, E, I, P });

    const errors = got.bands.map((d) => Math.abs(d - got.point) / got.point);
    // Each halving of the band must shrink the gap, and the tightest band has
    // to land on the point-load answer.
    for (let i = 1; i < errors.length; i += 1) {
      expect(errors[i], `band ${i} vs ${i - 1}`).toBeLessThan(errors[i - 1]);
    }
    expect(errors[errors.length - 1]).toBeLessThan(1e-5);
  });

  test('a golden partial band, computed by hand', async ({ page }) => {
    await openTool(page);
    // Simply supported, L = 3, EI = 2e6, w = 5 kN/m over [1, 2].
    // W = 5000 N centred on midspan, so R0 = 2500 N and the maximum is at 1.5.
    //   Q2(1.5) = -(w/24)(0.5)^4              = -13.020833...
    //   Q2(3)   = -(w/24)(2^4 - 1^4)          = -3125
    //   C1      = (R0 L^3/6 + Q2(3)) / L      = 2708.3333...
    //   EI*delta(1.5) = -R0*1.5^3/6 - Q2(1.5) + C1*1.5 = 2669.270833...
    const r = await solveIn(page, { support: 'simple', loadType: 'udl-partial', a: 1, c: 1, w, L, E, I });
    expectRel(r.deltaMax, 2669.2708333333335 / 2e6, 1e-12);
    // The location is held to a looser tolerance than the value on purpose.
    // Around a smooth peak the deflection varies quadratically, so comparing
    // function values pins x only to about sqrt(machine epsilon), near 1.5e-8
    // relative, however many refinement steps are taken. The value itself is
    // still good to 1e-16.
    expectRel(r.xMax, 1.5, 1e-6);
    // Symmetric band, so the reactions split evenly.
    expectRel(r.reactions[0].force, 2500, 1e-12);
    expectRel(r.reactions[1].force, 2500, 1e-12);
  });

  test('the band position moves the answer, and the ends are the awkward cases', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate((arg) => {
      const run = (a, c) => window.BeamDeflection.solve({
        support: 'simple', loadType: 'udl-partial', a, c, ...arg,
      });
      return {
        // Same load, mirrored about midspan, must mirror the answer.
        left: run(0.4, 1).deltaMax,
        right: run(arg.L - 1.4, 1).deltaMax,
        xLeft: run(0.4, 1).xMax,
        xRight: run(arg.L - 1.4, 1).xMax,
        // A band hard against each end, where a Macaulay term drops out.
        atStart: run(0, 1).deltaMax,
        atEnd: run(arg.L - 1, 1).deltaMax,
      };
    }, { L, E, I, w });

    expectRel(got.left, got.right, 1e-12);
    // Location, so the sqrt(machine epsilon) floor described above applies.
    expectRel(got.xLeft, L - got.xRight, 1e-6);
    // A band at either end of a symmetric beam is the same problem mirrored.
    expectRel(got.atStart, got.atEnd, 1e-12);
  });

  test('the geometry guards reject a band that will not fit', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate((arg) => {
      const run = (a, c) => {
        const r = window.BeamDeflection.solve({ support: 'simple', loadType: 'udl-partial', a, c, ...arg });
        return r.ok ? 'accepted' : r.error;
      };
      return {
        past: run(2.5, 1),
        negativeStart: run(-0.5, 1),
        zeroLength: run(1, 0),
        negativeLength: run(1, -1),
        exact: run(2, 1),
      };
    }, { L, E, I, w });

    expect(got.past).toMatch(/past the right end/);
    expect(got.negativeStart).toMatch(/at or after the left end/);
    expect(got.zeroLength).toMatch(/greater than zero/);
    expect(got.negativeLength).toMatch(/greater than zero/);
    // A band that exactly reaches the far end is legal, not a rounding failure.
    expect(got.exact).toBe('accepted');
  });

  test('both fixed ends hog, in every load case', async ({ page }) => {
    await openTool(page);
    // A downward load bends a fixed-fixed beam so that both ends hog. Reporting
    // the right end with a positive moment renders it as "sagging", which had
    // been the case for every fixed-fixed result before this was pinned.
    const got = await page.evaluate((arg) => {
      const cases = [
        { loadType: 'udl', w: arg.w },
        { loadType: 'point-standard', P: arg.P },
        { loadType: 'point-at', a: 0.9, P: arg.P },
        { loadType: 'udl-partial', a: 0.5, c: 1.5, w: arg.w },
      ];
      return cases.map((c) => {
        const r = window.BeamDeflection.solve({ support: 'fixed-fixed', L: arg.L, E: arg.E, I: arg.I, ...c });
        return {
          loadType: c.loadType,
          moments: r.reactions.map((x) => x.moment),
          internal: [r.momentAt(0), r.momentAt(arg.L)],
        };
      });
    }, { L, E, I, w, P });

    for (const c of got) {
      for (const m of c.moments) expect(m, `${c.loadType} reaction moment`).toBeLessThan(0);
      for (const m of c.internal) expect(m, `${c.loadType} internal moment`).toBeLessThan(0);
    }
  });

  test('the page drives a partial band and draws it', async ({ page }) => {
    await openTool(page);
    await page.locator('#loadType').selectOption('udl-partial');

    await expect(page.locator('#loadPosGroup')).toBeVisible();
    await expect(page.locator('#loadLengthGroup')).toBeVisible();
    await expect(page.locator('#loadPosLabel')).toContainText('Load starts at');
    await expect(page.locator('#loadMagnitudeLabel')).toContainText('kN/m');

    await page.fill('#span', '3');
    await page.fill('#loadPos', '1');
    await page.fill('#loadLength', '1');
    await page.fill('#loadMagnitude', '5');

    // Default 50 x 100 steel section: I = 4.1666667e-6, so EI = 8.3333333e5 and
    // the hand-computed 2669.2708 / EI is 3.2031 mm.
    await expect(page.locator('#results .result-box.primary')).toContainText('3.2031 mm');

    // The drawing has to follow the input, not stay on the full-span glyph.
    const band = await page.evaluate(() => {
      const svg = document.querySelector('.support-card svg.bd-diagram').outerHTML;
      return { hasBandDim: svg.includes('>c<'), arrows: (svg.match(/<path d="M /g) || []).length };
    });
    expect(band.hasBandDim).toBe(true);
    expect(band.arrows).toBeGreaterThan(1);
    expect(band.arrows).toBeLessThan(9);

    // Self-weight spans the whole beam, so it cannot be added to a partial load.
    await expect(page.locator('#selfWeight')).toBeDisabled();
    await expect(page.locator('#selfWeightNote')).toContainText('whole span');
  });

  test('the loaded band survives a unit switch unchanged', async ({ page }) => {
    await openTool(page);
    await page.locator('#loadType').selectOption('udl-partial');
    await page.fill('#span', '3');
    await page.fill('#loadPos', '1');
    await page.fill('#loadLength', '1');
    await page.fill('#loadMagnitude', '5');
    const before = await page.locator('#results .result-box.primary').textContent();

    await page.locator('#unitSystem').selectOption('us');
    await expect(page.locator('#loadLengthLabel')).toContainText('(ft)');
    // 1 m is 3.28084 ft; the physical beam must not have moved.
    expect(Number(await page.locator('#loadLength').inputValue())).toBeCloseTo(3.28084, 4);

    await page.locator('#unitSystem').selectOption('si');
    const after = await page.locator('#results .result-box.primary').textContent();
    expect(after.replace(/\s+/g, ' ')).toBe(before.replace(/\s+/g, ' '));
  });

  test('the connection fixity note is present and says bolted is usually pinned', async ({ page }) => {
    await openTool(page);
    const note = page.locator('.fixity-note');
    await expect(note).toBeVisible();
    // Collapsed by default so it does not push the selector off the screen.
    expect(await note.evaluate((n) => n.open)).toBe(false);
    await note.locator('summary').click();
    await expect(note).toContainText('Almost always pinned');
    await expect(note).toContainText('both flanges');
    await expect(note).toContainText('bracket it');
  });
});

// ---------------------------------------------------------------------------
// Physics invariants, swept over every support case and every load type.
//
// Everything above this point compares the engine against a formula, a table,
// or a second solver. These check it against physics instead: equilibrium, the
// governing differential equation, and the boundary conditions each support is
// supposed to impose. They hold for load cases nobody has tabulated, so they
// keep covering the engine as load types are added, and they catch a class of
// mistake that a golden on one configuration cannot see.
//
// Each probe is inlined into its own page.evaluate rather than passed in as a
// source string, because rebuilding a function inside the page would need
// new Function, which the strict CSP on this page blocks.
// ---------------------------------------------------------------------------

// Every load type, including bands that touch each end and one that spans the
// whole beam, since those are where a Macaulay term can silently drop out.
const SWEEP = {
  supports: ['cantilever', 'simple', 'fixed-fixed', 'propped'],
  loads: [
    ['point-standard', {}],
    ['point-at', { a: 0.9 }],
    ['point-at', { a: 2.1 }],
    ['udl', {}],
    ['udl-partial', { a: 0, c: 1.2 }],
    ['udl-partial', { a: 0.7, c: 1.1 }],
    ['udl-partial', { a: 1.8, c: 1.2 }],
    ['udl-partial', { a: 0, c: 3 }],
  ],
};
const SWEEP_ARG = { ...SWEEP, beam: { L, E, I, P, w } };
const SWEEP_SIZE = SWEEP.supports.length * SWEEP.loads.length;

// Shared preamble used inside each page.evaluate: rebuilds one solve input.
function expectAllUnder(rows, limit) {
  expect(rows.length).toBe(SWEEP_SIZE);
  for (const row of rows) {
    expect(row.value, `${row.label}${row.error ? ` (${row.error})` : ''}`).toBeLessThan(limit);
  }
}

test.describe('physics invariants over every case', () => {
  test('the reactions carry exactly the load that was applied', async ({ page }) => {
    await openTool(page);
    const rows = await page.evaluate(({ supports, loads, beam }) => {
      const out = [];
      for (const support of supports) {
        for (const [loadType, extra] of loads) {
          const distributed = loadType === 'udl' || loadType === 'udl-partial';
          const r = window.BeamDeflection.solve({
            support, loadType, ...beam, ...(distributed ? { w: beam.w } : { P: beam.P }), ...extra,
          });
          const label = `${support}/${loadType} ${JSON.stringify(extra)}`;
          if (!r.ok) { out.push({ label, value: 1, error: r.error }); continue; }
          const total = loadType === 'udl' ? beam.w * beam.L
            : loadType === 'udl-partial' ? beam.w * extra.c : beam.P;
          const sum = r.reactions.reduce((s, x) => s + x.force, 0);
          out.push({ label, value: Math.abs(sum - total) / total });
        }
      }
      return out;
    }, SWEEP_ARG);
    // Vertical equilibrium is exact arithmetic, so this needs no slack.
    expectAllUnder(rows, 1e-12);
  });

  test('the deflection curve satisfies EI y.. = -M(x) everywhere', async ({ page }) => {
    await openTool(page);
    // The deflection curve and the moment function are written separately in
    // the engine. If either is wrong, they stop agreeing here.
    const rows = await page.evaluate(({ supports, loads, beam }) => {
      const EI = beam.E * beam.I;
      const out = [];
      for (const support of supports) {
        for (const [loadType, extra] of loads) {
          const distributed = loadType === 'udl' || loadType === 'udl-partial';
          const r = window.BeamDeflection.solve({
            support, loadType, ...beam, ...(distributed ? { w: beam.w } : { P: beam.P }), ...extra,
          });
          const label = `${support}/${loadType} ${JSON.stringify(extra)}`;
          if (!r.ok) { out.push({ label, value: 1, error: r.error }); continue; }

          const edges = [0, beam.L];
          if (loadType === 'point-at') edges.push(extra.a);
          if (loadType === 'point-standard') edges.push(0.5 * beam.L, beam.L);
          if (loadType === 'udl-partial') edges.push(extra.a, extra.a + extra.c);

          // Curvature is compared against the beam's own characteristic
          // curvature. Scaling by the local value would divide by zero on the
          // straight run of a cantilever beyond its load.
          const scale = Math.abs(r.MmaxAbs) / EI;
          const h = beam.L * 2e-4;
          let worst = 0;
          for (let i = 1; i < 40; i += 1) {
            const x = (beam.L * i) / 40;
            if (!edges.every((e) => Math.abs(x - e) > 0.08 * beam.L)) continue;
            const d2 = (r.deflectionAt(x + h) - 2 * r.deflectionAt(x) + r.deflectionAt(x - h)) / (h * h);
            worst = Math.max(worst, Math.abs(d2 + r.momentAt(x) / EI) / scale);
          }
          out.push({ label, value: worst });
        }
      }
      return out;
    }, SWEEP_ARG);
    // Limited by the second difference, not by the engine: 1e-6 sits well above
    // the 8.7e-8 actually achieved and far below any real formula error.
    expectAllUnder(rows, 1e-6);
  });

  test('every support holds its end of the beam where it claims to', async ({ page }) => {
    await openTool(page);
    const rows = await page.evaluate(({ supports, loads, beam }) => {
      const out = [];
      for (const support of supports) {
        for (const [loadType, extra] of loads) {
          const distributed = loadType === 'udl' || loadType === 'udl-partial';
          const r = window.BeamDeflection.solve({
            support, loadType, ...beam, ...(distributed ? { w: beam.w } : { P: beam.P }), ...extra,
          });
          const label = `${support}/${loadType} ${JSON.stringify(extra)}`;
          if (!r.ok) { out.push({ label, value: 1, error: r.error }); continue; }
          const scale = r.deltaMax || 1;
          let worst = Math.abs(r.deflectionAt(0)) / scale;
          if (support !== 'cantilever') worst = Math.max(worst, Math.abs(r.deflectionAt(beam.L)) / scale);
          out.push({ label, value: worst });
        }
      }
      return out;
    }, SWEEP_ARG);
    expectAllUnder(rows, 1e-10);
  });

  test('a free, pinned or roller end carries no moment', async ({ page }) => {
    await openTool(page);
    const rows = await page.evaluate(({ supports, loads, beam }) => {
      const out = [];
      for (const support of supports) {
        for (const [loadType, extra] of loads) {
          const distributed = loadType === 'udl' || loadType === 'udl-partial';
          const r = window.BeamDeflection.solve({
            support, loadType, ...beam, ...(distributed ? { w: beam.w } : { P: beam.P }), ...extra,
          });
          const label = `${support}/${loadType} ${JSON.stringify(extra)}`;
          if (!r.ok) { out.push({ label, value: 1, error: r.error }); continue; }
          const scale = Math.abs(r.MmaxAbs) || 1;
          let worst = 0;
          if (support === 'simple') worst = Math.abs(r.momentAt(0)) / scale;
          // Free end of a cantilever, pin of a propped cantilever, roller of a
          // simply supported beam: all moment-free by definition.
          if (support !== 'fixed-fixed') worst = Math.max(worst, Math.abs(r.momentAt(beam.L)) / scale);
          out.push({ label, value: worst });
        }
      }
      return out;
    }, SWEEP_ARG);
    expectAllUnder(rows, 1e-12);
  });

  test('a built-in end has zero slope and a pinned end does not', async ({ page }) => {
    await openTool(page);
    // Stated so no step size can fudge it. Approaching a built-in end the curve
    // grows as x^2, so delta(d)/delta(2d) tends to 1/4; approaching a pinned end
    // it grows as x and the same ratio tends to 1/2. This is the zero end slope
    // the diagrams exist to show, written as a number.
    const rows = await page.evaluate(({ supports, loads, beam }) => {
      const out = [];
      for (const support of supports) {
        for (const [loadType, extra] of loads) {
          const distributed = loadType === 'udl' || loadType === 'udl-partial';
          const r = window.BeamDeflection.solve({
            support, loadType, ...beam, ...(distributed ? { w: beam.w } : { P: beam.P }), ...extra,
          });
          const label = `${support}/${loadType} ${JSON.stringify(extra)}`;
          if (!r.ok) { out.push({ label, value: 1, error: r.error }); continue; }
          const d = beam.L * 1e-3;
          const near0 = r.deflectionAt(d) / r.deflectionAt(2 * d);
          const nearL = r.deflectionAt(beam.L - d) / r.deflectionAt(beam.L - 2 * d);
          const clamped = [];
          const pinned = [];
          (support === 'simple' ? pinned : clamped).push(near0);
          if (support === 'fixed-fixed') clamped.push(nearL);
          if (support === 'simple' || support === 'propped') pinned.push(nearL);
          let worst = 0;
          for (const v of clamped) worst = Math.max(worst, Math.abs(v - 0.25));
          for (const v of pinned) worst = Math.max(worst, Math.abs(v - 0.5));
          out.push({ label, value: worst });
        }
      }
      return out;
    }, SWEEP_ARG);
    expectAllUnder(rows, 5e-3);
  });

  test('doubling the load doubles the answer, on every case', async ({ page }) => {
    await openTool(page);
    const rows = await page.evaluate(({ supports, loads, beam }) => {
      const out = [];
      for (const support of supports) {
        for (const [loadType, extra] of loads) {
          const distributed = loadType === 'udl' || loadType === 'udl-partial';
          const base = { support, loadType, L: beam.L, E: beam.E, I: beam.I, ...extra };
          const one = window.BeamDeflection.solve({ ...base, ...(distributed ? { w: beam.w } : { P: beam.P }) });
          const two = window.BeamDeflection.solve({ ...base, ...(distributed ? { w: beam.w * 2 } : { P: beam.P * 2 }) });
          const label = `${support}/${loadType} ${JSON.stringify(extra)}`;
          if (!one.ok || !two.ok) { out.push({ label, value: 1, error: one.error || two.error }); continue; }
          out.push({ label, value: Math.abs(two.deltaMax - 2 * one.deltaMax) / (2 * one.deltaMax) });
        }
      }
      return out;
    }, SWEEP_ARG);
    // Linear elasticity, so this is exact rather than merely close.
    expectAllUnder(rows, 1e-12);
  });
});

test.describe('more partial-load coverage', () => {
  test('a cantilever partial band, computed by hand', async ({ page }) => {
    await openTool(page);
    // Fixed at x = 0, w = 5 kN/m over [1, 2], L = 3, EI = 2e6.
    // W = 5000 at xbar = 1.5, so M0 = -7500 and R0 = 5000.
    //   Q2(3) = -(w/24)(2^4 - 1^4) = -3125
    //   EI*delta(3) = 7500*9/2 - 5000*27/6 + 3125 = 14375
    const r = await solveIn(page, { support: 'cantilever', loadType: 'udl-partial', a: 1, c: 1, w, L, E, I });
    expectRel(r.deltaMax, 14375 / 2e6, 1e-12);
    expectRel(r.xMax, L, 1e-9);
    // The wall carries the whole load and the moment of its centroid.
    expectRel(r.reactions[0].force, 5000, 1e-12);
    expectRel(r.reactions[0].moment, -7500, 1e-12);
  });

  test('the moment peaks where the shear crosses zero', async ({ page }) => {
    await openTool(page);
    // Inside the loaded band the shear falls linearly from R0, reaching zero at
    // a + R0/w. That is where the bending moment turns over.
    const got = await page.evaluate((arg) => {
      const out = [];
      for (const [a, c] of [[1, 1], [0.5, 1.5], [0.2, 2.4]]) {
        const r = window.BeamDeflection.solve({ support: 'simple', loadType: 'udl-partial', a, c, ...arg });
        out.push({ a, c, predicted: a + r.reactions[0].force / arg.w, reported: r.MmaxAt, moment: Math.abs(r.MmaxAbs) });
      }
      return out;
    }, { L, E, I, w });

    for (const g of got) {
      expect(Math.abs(g.predicted - g.reported), `band a=${g.a} c=${g.c}`).toBeLessThan(1e-9);
      expect(g.moment, `band a=${g.a} c=${g.c}`).toBeGreaterThan(0);
    }
  });

  test('span scaling holds for a band that keeps its proportions', async ({ page }) => {
    await openTool(page);
    // A distributed load scales as L^4 at fixed w, so a beam twice as long with
    // the band in the same relative place deflects sixteen times as far.
    const got = await page.evaluate((arg) => {
      const run = (span) => window.BeamDeflection.solve({
        support: 'propped', loadType: 'udl-partial',
        a: 0.25 * span, c: 0.5 * span, L: span, E: arg.E, I: arg.I, w: arg.w,
      }).deltaMax;
      return { base: run(arg.L), doubled: run(2 * arg.L) };
    }, { L, E, I, w });
    expectRel(got.doubled / got.base, 16, 1e-12);
  });

  test('mirroring a band mirrors the answer, except where the beam is not symmetric', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate((arg) => {
      const run = (support, a) => window.BeamDeflection.solve({
        support, loadType: 'udl-partial', a, c: 0.8, ...arg,
      });
      const out = {};
      for (const support of ['simple', 'fixed-fixed', 'propped']) {
        const left = run(support, 0.4);
        const right = run(support, arg.L - 1.2);
        out[support] = { ratio: left.deltaMax / right.deltaMax, xSum: left.xMax + right.xMax };
      }
      return out;
    }, { L, E, I, w });

    expectRel(got.simple.ratio, 1, 1e-12);
    expectRel(got['fixed-fixed'].ratio, 1, 1e-12);
    expectRel(got.simple.xSum, L, 1e-6);
    expectRel(got['fixed-fixed'].xSum, L, 1e-6);
    // A propped cantilever is built in at one end only, so the same band near
    // the wall and near the prop are genuinely different problems.
    expect(Math.abs(got.propped.ratio - 1)).toBeGreaterThan(0.1);
  });
});

test.describe('diagram and preset data integrity', () => {
  test('every support and load combination draws a usable diagram', async ({ page }) => {
    await openTool(page);
    const bad = await page.evaluate(() => {
      const out = [];
      const cards = document.querySelectorAll('.support-card');
      const select = document.getElementById('loadType');
      for (const lt of ['point-standard', 'point-at', 'udl', 'udl-partial']) {
        select.value = lt;
        select.dispatchEvent(new Event('change'));
        for (const card of cards) {
          const tag = `${lt}/${card.dataset.support}`;
          const svg = card.querySelector('svg.bd-diagram');
          if (!svg) { out.push(`${tag}: no svg`); continue; }
          const markup = svg.outerHTML;
          if (/NaN|undefined|Infinity/.test(markup)) out.push(`${tag}: bad number in markup`);
          const path = svg.querySelector('.bd-deflected');
          if (!path || (path.getAttribute('d') || '').length < 20) out.push(`${tag}: empty deflected shape`);
          if (!svg.querySelector('title')) out.push(`${tag}: no title`);
        }
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('every preset describes a beam the engine will accept', async ({ page }) => {
    await openTool(page);
    const problems = await page.evaluate(() => {
      const B = window.BeamDeflection;
      const out = [];
      for (const p of B.PRESETS) {
        const bad = (msg) => out.push(`${p.id}: ${msg}`);
        if (!B.SUPPORTS.includes(p.state.support)) bad('unknown support');
        if (!B.LOAD_TYPES.includes(p.state.loadType)) bad('unknown load type');
        if (!B.MATERIALS_BY_ID[p.state.materialId]) bad('unknown material');
        if (!B.SECTIONS[p.state.sectionType]) bad('unknown section');
        if (!['si', 'us'].includes(p.units)) bad('unknown unit system');
        if (!B.DEFLECTION_LIMITS.some((l) => l.id === p.state.limitId)) bad('unknown limit');
        if (p.state.limitId === 'custom' && !(p.fields.customLimit > 0)) bad('custom limit without a ratio');

        const section = B.SECTIONS[p.state.sectionType];
        if (section) {
          for (const f of section.fields) {
            if (!f.optional && !(p.section[f.key] > 0)) bad(`missing section field ${f.key}`);
          }
          for (const key of Object.keys(p.section)) {
            if (!section.fields.some((f) => f.key === key)) bad(`stray section field ${key}`);
          }
        }

        if (!(p.fields.span > 0)) bad('non-positive span');
        if (p.state.loadType === 'point-at' && !(p.fields.loadPos >= 0 && p.fields.loadPos <= p.fields.span)) {
          bad('load position outside the span');
        }
        if (p.state.loadType === 'udl-partial') {
          const { loadPos, loadLength, span } = p.fields;
          if (!(loadLength > 0)) bad('non-positive loaded length');
          if (!(loadPos >= 0)) bad('band starts before the beam');
          if (loadPos + loadLength > span * (1 + 1e-12)) bad('band runs past the end');
        }
        // Self-weight is offered on the full-span distributed case only.
        if (p.state.selfWeight && p.state.loadType !== 'udl') bad('self-weight on a case that cannot take it');
        if (!p.teaches || p.teaches.length < 40) bad('no explanation of what it demonstrates');
      }
      return out;
    });
    expect(problems).toEqual([]);
  });

  test('sampleCurve returns a usable curve for every case', async ({ page }) => {
    await openTool(page);
    const bad = await page.evaluate((arg) => {
      const out = [];
      for (const support of ['cantilever', 'simple', 'fixed-fixed', 'propped']) {
        for (const [loadType, extra] of [['udl', {}], ['udl-partial', { a: 0.6, c: 1.2 }], ['point-at', { a: 1.1 }]]) {
          const distributed = loadType !== 'point-at';
          const r = window.BeamDeflection.solve({
            support, loadType, L: arg.L, E: arg.E, I: arg.I,
            ...(distributed ? { w: arg.w } : { P: arg.P }), ...extra,
          });
          const pts = window.BeamDeflection.sampleCurve(r, 40);
          const tag = `${support}/${loadType}`;
          if (pts.length !== 41) out.push(`${tag}: ${pts.length} points`);
          if (pts[0].x !== 0) out.push(`${tag}: does not start at 0`);
          if (Math.abs(pts[pts.length - 1].x - arg.L) > 1e-12) out.push(`${tag}: does not end at L`);
          for (let i = 1; i < pts.length; i += 1) {
            if (!(pts[i].x > pts[i - 1].x)) out.push(`${tag}: x not increasing at ${i}`);
            if (!Number.isFinite(pts[i].y)) out.push(`${tag}: non-finite y at ${i}`);
          }
          // A sampled point cannot exceed the reported maximum.
          const peak = Math.max(...pts.map((q) => Math.abs(q.y)));
          if (peak > r.deltaMax * (1 + 1e-9)) out.push(`${tag}: sample exceeds deltaMax`);
        }
      }
      return out;
    }, { L, E, I, P, w });
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The scope disclaimer.
//
// A beam calculator reads like a design tool to anyone who does not already
// know the difference, so the warning sits above the inputs rather than in a
// footnote. It is deliberately not a modal: a dialog every visitor has to
// dismiss is a tax on every visit and gets clicked through without reading.
// These tests check that it is visible without any interaction, that it comes
// before the inputs, and that it names specifics rather than waving at risk.
// ---------------------------------------------------------------------------

test.describe('scope disclaimer', () => {
  test('the warning is visible immediately, with nothing to dismiss', async ({ page }) => {
    await openTool(page);

    // The headline warning lives in the summary, so it reads without opening
    // anything and without a second box stacked above it.
    const card = page.locator('.disclaimer-card');
    await expect(card).toBeVisible();
    await expect(page.locator('.disclaimer-title')).toContainText('Not a structural design tool');
    await expect(page.locator('.disclaimer-lead')).toContainText('load-bearing member');
    expect(await card.evaluate((n) => n.open)).toBe(false);

    // No modal, no overlay, no acknowledgement step.
    await expect(page.locator('#disclaimerSplash')).toHaveCount(0);
    await expect(page.locator('.liability-banner')).toHaveCount(0);

    // The calculator is usable on arrival rather than gated behind a click.
    await expect(page.locator('#results .result-box.primary')).toBeVisible();
    const inert = await page.evaluate(() =>
      [...document.querySelectorAll('[inert]')].length);
    expect(inert).toBe(0);
  });

  test('the disclaimer sits above the inputs and reads as a caution', async ({ page }) => {
    await openTool(page);
    const tops = await page.evaluate(() => {
      const top = (sel) => document.querySelector(sel).getBoundingClientRect().top;
      return { card: top('.disclaimer-card'), panel: top('.calculator-panel'), results: top('.sidebar') };
    });
    expect(tops.card).toBeLessThan(tops.panel);
    expect(tops.card).toBeLessThan(tops.results);

    // Near enough to the top of the page that it is on screen without scrolling.
    await expect(page.locator('.disclaimer-card summary')).toBeInViewport();

    // Styled as a caution in the theme warning colour, tinted rather than
    // painted on as a solid error slab. A hard red block here reads as a
    // failure state and was what made the first attempt look harsh.
    const paint = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const head = getComputedStyle(document.querySelector('.disclaimer-header'));
      const title = getComputedStyle(document.querySelector('.disclaimer-title'));
      const parse = (c) => (c.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
      return {
        warning: root.getPropertyValue('--accent-warning').trim(),
        titleColor: title.color,
        headerBg: parse(head.backgroundColor),
      };
    });
    // The heading takes the warning colour, not the error colour.
    expect(paint.titleColor).not.toBe('rgb(239, 68, 68)');
    // A tint, so the header background is nowhere near fully saturated.
    expect(paint.headerBg.length).toBeGreaterThanOrEqual(3);
  });

  test('the foldable opens, and is keyboard operable without script', async ({ page }) => {
    await openTool(page);
    const card = page.locator('.disclaimer-card');
    // Collapsed by default so it does not push the calculator down the page.
    expect(await card.evaluate((n) => n.open)).toBe(false);

    // Native details/summary, so Enter on the focused summary is enough.
    await card.locator('summary').focus();
    await page.keyboard.press('Enter');
    expect(await card.evaluate((n) => n.open)).toBe(true);
    await page.keyboard.press('Enter');
    expect(await card.evaluate((n) => n.open)).toBe(false);
  });

  test('the disclaimer names specifics rather than waving at risk', async ({ page }) => {
    await openTool(page);
    const card = page.locator('.disclaimer-card');
    await card.locator('summary').click();

    for (const phrase of [
      'lateral-torsional', 'web crippling', 'fatigue', 'load combinations',
      'professional engineer', 'No warranty', 'assume all risk',
      'Independent verification', 'still be unsafe',
    ]) {
      await expect(card, phrase).toContainText(phrase);
    }
    // The material caveats that the numbers themselves cannot carry.
    await expect(card).toContainText('NDS adjustment factors are not applied');
    await expect(card).toContainText('breaks half the time');

    const text = await card.textContent();
    expect(text.length).toBeGreaterThan(2500);
  });

  test('the disclaimer renders in both themes and at a phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openTool(page);
    await page.locator('.disclaimer-card summary').click();

    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await expect(page.locator('.disclaimer-card'), theme).toBeVisible();
      await expect(page.locator('.disclaimer-title'), theme).toBeVisible();
    }

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  });

  test('the sidebar note still backs up the warning at the point of the result', async ({ page }) => {
    await openTool(page);
    const note = page.locator('.disclaimer');
    await expect(note).toContainText('must not be used to size or verify a load-bearing member');
    await expect(note).toContainText('full disclaimer at the top');
  });
});

// ---------------------------------------------------------------------------
// Entering a load as a mass.
//
// People know what the thing on the beam weighs, not what it pushes with, and
// in SI those are different numbers. The conversion is a display convenience:
// it happens in units.js like every other unit, and the engine still receives
// newtons. These tests pin that the beam does not change when only the way of
// describing its load changes.
// ---------------------------------------------------------------------------

test.describe('load entered as mass', () => {
  test('mass and force are the same conversion path as every other unit', async ({ page }) => {
    await openTool(page);
    const got = await page.evaluate(() => {
      const { toSI, fromSI, unitLabel } = window.BeamDeflection;
      return {
        kg: toSI(10, 'pointMass', 'si'),
        lb: toSI(10, 'pointMass', 'us'),
        lbf: toSI(10, 'pointLoad', 'us'),
        kgPerM: toSI(5, 'distMass', 'si'),
        lbPerFt: toSI(5, 'distMass', 'us'),
        lbfPerFt: toSI(5, 'distLoad', 'us'),
        labels: [unitLabel('pointMass', 'si'), unitLabel('pointMass', 'us'),
          unitLabel('distMass', 'si'), unitLabel('distMass', 'us')],
        roundTrip: fromSI(toSI(12.5, 'pointMass', 'si'), 'pointMass', 'si'),
      };
    });

    // 10 kg weighs 98.0665 N at standard gravity.
    expectRel(got.kg, 10 * 9.80665, 1e-12);
    expectRel(got.kgPerM, 5 * 9.80665, 1e-12);
    // A pound mass weighs a pound force, so the US pair share a factor exactly.
    expect(got.lb).toBe(got.lbf);
    expect(got.lbPerFt).toBe(got.lbfPerFt);
    expect(got.labels).toEqual(['kg', 'lb', 'kg/m', 'lb/ft']);
    expectRel(got.roundTrip, 12.5, 1e-12);
  });

  test('a mass and its equivalent force give the same beam', async ({ page }) => {
    await openTool(page);
    // 100 kg is 980.665 N, so the two must agree to the bit.
    const got = await page.evaluate((arg) => {
      const B = window.BeamDeflection;
      const beam = { support: 'simple', loadType: 'point-standard', ...arg };
      return {
        byForce: B.solve({ ...beam, P: 100 * 9.80665 }).deltaMax,
        byMass: B.solve({ ...beam, P: B.toSI(100, 'pointMass', 'si') }).deltaMax,
      };
    }, { L, E, I });
    expectRel(got.byMass, got.byForce, 1e-15);
  });

  test('switching to mass restates the load without moving the beam', async ({ page }) => {
    await openTool(page);
    await page.fill('#loadMagnitude', '10');
    const before = await page.locator('#results .result-box.primary').textContent();

    await page.locator('#loadEntry').selectOption('mass');
    await expect(page.locator('#loadMagnitudeLabel')).toContainText('mass (kg)');
    // 10 kN is 1019.72 kg.
    expect(Number(await page.locator('#loadMagnitude').inputValue())).toBeCloseTo(1019.72, 2);
    const after = await page.locator('#results .result-box.primary').textContent();
    expect(after.replace(/\s+/g, ' ')).toBe(before.replace(/\s+/g, ' '));

    // And back again, with no drift from the round trip.
    await page.locator('#loadEntry').selectOption('force');
    expect(Number(await page.locator('#loadMagnitude').inputValue())).toBeCloseTo(10, 6);
    await expect(page.locator('#loadMagnitudeLabel')).toContainText('P (kN)');
  });

  test('a mass entry survives a unit switch as the same mass', async ({ page }) => {
    await openTool(page);
    await page.locator('#loadEntry').selectOption('mass');
    await page.fill('#loadMagnitude', '10');
    const before = await page.locator('#results .result-box.primary').textContent();

    await page.locator('#unitSystem').selectOption('us');
    await expect(page.locator('#loadMagnitudeLabel')).toContainText('mass (lb)');
    // 10 kg is 22.0462 lb, the same lump of metal described differently.
    expect(Number(await page.locator('#loadMagnitude').inputValue())).toBeCloseTo(22.0462, 3);

    await page.locator('#unitSystem').selectOption('si');
    expect(Number(await page.locator('#loadMagnitude').inputValue())).toBeCloseTo(10, 4);
    const after = await page.locator('#results .result-box.primary').textContent();
    expect(after.replace(/\s+/g, ' ')).toBe(before.replace(/\s+/g, ' '));
  });

  test('a distributed load can be entered as mass per length', async ({ page }) => {
    await openTool(page);
    await page.locator('#loadType').selectOption('udl');
    await page.locator('#loadEntry').selectOption('mass');
    await expect(page.locator('#loadMagnitudeLabel')).toContainText('mass (kg/m)');

    await page.fill('#span', '3');
    await page.fill('#loadMagnitude', '100');
    // 100 kg/m is 980.665 N/m. Default 50 x 100 steel: I = 4.1666667e-6,
    // EI = 8.3333333e5, so 5wL^4/384EI = 1.2409 mm.
    const want = (5 * 100 * 9.80665 * 3 ** 4) / (384 * 200e9 * 4.1666666666666667e-6);
    const text = await page.locator('#results .result-box.primary').textContent();
    expect(Number(text.match(/([\d.]+) mm/)[1])).toBeCloseTo(want * 1000, 3);
  });

  test('mass mode says how it converts, and only while it is on', async ({ page }) => {
    await openTool(page);
    const note = page.locator('#massNote');
    await expect(note).toBeHidden();

    await page.locator('#loadEntry').selectOption('mass');
    await expect(note).toBeVisible();
    await expect(note).toContainText('standard gravity');
    await expect(note).toContainText('9.8066');

    // In US units the number does not change, and the note says so rather than
    // implying a conversion the reader will not see.
    await page.locator('#unitSystem').selectOption('us');
    await expect(note).toContainText('pound mass weighs a pound force');

    await page.locator('#loadEntry').selectOption('force');
    await expect(note).toBeHidden();
  });

  test('the load entry control is labelled and clears the active example', async ({ page }) => {
    await openTool(page);
    const label = await page.evaluate(() =>
      document.querySelector('label[for="loadEntry"]').textContent.trim());
    expect(label.toLowerCase()).toContain('enter load as');

    await page.locator('[data-preset="fixed-vs-simple"]').click();
    await expect(page.locator('[data-preset="fixed-vs-simple"]')).toHaveAttribute('aria-pressed', 'true');
    // Restating the load is an edit, so the form no longer matches the example.
    await page.locator('#loadEntry').selectOption('mass');
    await expect(page.locator('[data-preset="fixed-vs-simple"]')).toHaveAttribute('aria-pressed', 'false');
  });
});

// ---------------------------------------------------------------------------
// Foldable result sections.
//
// The deflection is the answer most people came for, so it stays open and the
// supporting numbers fold away beneath it. These tests use visibility rather
// than text content on purpose: toContainText reads a collapsed details element
// perfectly happily, so a test written that way passes whether the fold works
// or not.
// ---------------------------------------------------------------------------

test.describe('foldable result sections', () => {
  const FOLDS = [
    'Maximum bending moment and reactions',
    'Bending stress',
    'Same beam, other boundary conditions',
  ];

  test('the deflection is open and everything else is folded away', async ({ page }) => {
    await openTool(page);

    // The headline answer is not behind a click.
    const primary = page.locator('#results .result-box.primary');
    await expect(primary).toBeVisible();
    await expect(primary).toContainText('Maximum deflection');
    expect(await primary.evaluate((n) => n.tagName)).toBe('DIV');

    const folds = page.locator('#results .result-fold');
    await expect(folds).toHaveCount(3);
    const state = await folds.evaluateAll((nodes) => nodes.map((n) => ({
      title: n.querySelector('summary').textContent.trim(),
      open: n.open,
    })));
    expect(state.map((f) => f.title)).toEqual(FOLDS);
    for (const f of state) expect(f.open, f.title).toBe(false);
  });

  test('each fold hides its numbers until it is opened', async ({ page }) => {
    await openTool(page);
    for (const title of FOLDS) {
      const fold = page.locator('#results .result-fold', { hasText: title });
      const body = fold.locator('.result-fold-body');
      // Present in the DOM but not shown, which is what a plain text assertion
      // would miss entirely.
      await expect(body, title).toBeHidden();
      await fold.locator('summary').click();
      await expect(body, title).toBeVisible();
    }

    // The numbers each fold was hiding are now on screen.
    await expect(page.locator('#results')).toContainText('Left pin');
    await expect(page.locator('#results .util-bar')).toHaveCount(1);
    await expect(page.locator('#results .compare-row')).toHaveCount(4);
  });

  test('the folds are keyboard operable and stay open across a recompute', async ({ page }) => {
    await openTool(page);
    const stress = page.locator('#results .result-fold', { hasText: 'Bending stress' });

    await stress.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(stress.locator('.result-fold-body')).toBeVisible();

    // The results panel is rebuilt on every keystroke, so a fold that resets
    // itself would slam shut while the user was reading it.
    await page.fill('#loadMagnitude', '12');
    await expect(page.locator('#results .result-box.primary')).toContainText('8.1 mm');
    await expect(
      page.locator('#results .result-fold', { hasText: 'Bending stress' }).locator('.result-fold-body'),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// The correctness pass.
//
// Four defects found by driving the finished tool rather than by reading it.
// Each of these produced a plausible-looking screen rather than an obvious
// failure, which is why they survived the build: an upward load reported a
// negative deflection and then passed its own limit check, a negative safety
// factor divided by one while labelling itself zero, the per-case numbers on
// the selector cards stayed on screen next to an input error, and the propped
// cantilever's two ends were named differently depending on the load type.
// ---------------------------------------------------------------------------

test.describe('correctness pass', () => {
  test('an upward load is rejected rather than deflecting the beam upward', async ({ page }) => {
    await openTool(page);

    // The engine refuses it, so a caller using the public handle cannot get a
    // negative deflection out of it either.
    const engine = await page.evaluate((arg) => {
      const B = window.BeamDeflection;
      const cases = [
        ['point-standard', { P: -1e4 }],
        ['point-at', { P: -1e4, a: 1.1 }],
        ['udl', { w: -1e4 }],
        ['udl-partial', { w: -1e4, a: 0.5, c: 1.5 }],
      ];
      return {
        rejected: cases.map(([loadType, extra]) => {
          const r = B.solve({ ...arg, support: 'simple', loadType, ...extra });
          return { loadType, ok: r.ok, error: r.error || null };
        }),
        // Zero is a real answer, not an error: an unloaded beam does not deflect.
        zero: B.solve({ ...arg, support: 'simple', loadType: 'udl', w: 0 }),
      };
    }, { L, E, I });

    for (const r of engine.rejected) {
      expect(r.ok, r.loadType).toBe(false);
      expect(r.error, r.loadType).toMatch(/must not be negative/);
    }
    expect(engine.zero.ok).toBe(true);
    expect(engine.zero.deltaMax).toBe(0);

    // And the page says so in terms of the field the user is looking at,
    // instead of reporting a negative deflection that passes its limit check.
    await page.fill('#loadMagnitude', '-10');
    const banner = page.locator('#errorBanner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('must not be negative');
    await expect(page.locator('#results')).toBeHidden();

    await page.fill('#loadMagnitude', '10');
    await expect(banner).toBeHidden();
    await expect(page.locator('#results .result-box.primary')).toContainText('6.75 mm');
  });

  test('the safety factor that is used is the safety factor that is shown', async ({ page }) => {
    await openTool(page);
    const stress = page.locator('#results .result-fold', { hasText: 'Bending stress' });
    await stress.locator('summary').click();

    // A36 steel, 250 MPa yield. At safety factor 2 the allowable halves.
    await page.fill('#safetyFactor', '2');
    await expect(stress).toContainText('125 MPa');
    await expect(stress).toContainText('safety factor 2');

    // Blank, zero and negative all mean "no factor given". Each has to divide
    // by one AND say one: the two used to be computed separately, so -2 gave
    // the full 250 MPa allowable under the label "safety factor 0".
    for (const entry of ['', '0', '-2']) {
      await page.fill('#safetyFactor', entry);
      await expect(stress, `entry ${JSON.stringify(entry)}`).toContainText('250 MPa');
      await expect(stress, `entry ${JSON.stringify(entry)}`).toContainText('safety factor 1');
      await expect(stress, `entry ${JSON.stringify(entry)}`).not.toContainText('safety factor 0');
    }
  });

  test('an input error clears the per-case numbers on the selector cards', async ({ page }) => {
    await openTool(page);
    const cards = page.locator('[data-support-value]');
    const before = await cards.allTextContents();
    expect(before.every((t) => t.trim().length > 0)).toBe(true);

    // The cards are not inside #results, so hiding the results panel does not
    // hide them. They used to keep showing the last valid beam's deflections
    // alongside a message saying the input was rejected.
    await page.fill('#span', '');
    await expect(page.locator('#errorBanner')).toContainText('positive span');
    expect((await cards.allTextContents()).every((t) => t.trim() === '')).toBe(true);

    await page.fill('#span', '3');
    await expect(page.locator('#errorBanner')).toBeHidden();
    expect(await cards.allTextContents()).toEqual(before);
  });

  test('each support names its reactions the same way whatever the load type', async ({ page }) => {
    await openTool(page);
    const bySupport = await page.evaluate((arg) => {
      const B = window.BeamDeflection;
      const cases = [
        ['point-standard', { P: 1e4 }],
        ['point-at', { P: 1e4, a: 1.1 }],
        ['udl', { w: 1e4 }],
        ['udl-partial', { w: 1e4, a: 0.5, c: 1.5 }],
      ];
      const out = {};
      for (const support of B.SUPPORTS) {
        out[support] = cases.map(([loadType, extra]) =>
          B.solve({ ...arg, support, loadType, ...extra }).reactions.map((r) => r.label).join(' | '));
      }
      // A load sitting on a support takes a different code path again, and it
      // used to fall back to a generic "Left support" / "Right support".
      out.degenerate = B.solve({ ...arg, support: 'propped', loadType: 'point-at', P: 1e4, a: 0 })
        .reactions.map((r) => r.label).join(' | ');
      return out;
    }, { L, E, I });

    // The propped cantilever is the one that diverged: the tabulated solver
    // called its ends "Fixed end" and "Prop (pin)", the partial-load solver
    // called them "Left fixed end" and "Right pin".
    expect(bySupport.propped).toEqual(Array(4).fill('Fixed end | Prop (pin)'));
    expect(bySupport.cantilever).toEqual(Array(4).fill('Fixed end'));
    expect(bySupport.simple).toEqual(Array(4).fill('Left pin | Right roller'));
    expect(bySupport['fixed-fixed']).toEqual(Array(4).fill('Left fixed end | Right fixed end'));
    expect(bySupport.degenerate).toBe('Fixed end | Prop (pin)');
  });

  test('no comparison bar paints outside its own track', async ({ page }) => {
    await openTool(page);
    await page.locator('#results .result-fold', { hasText: 'Same beam, other boundary conditions' })
      .locator('summary').click();
    const overflow = await page.evaluate(() => [...document.querySelectorAll('#results .compare-row')]
      .map((row) => {
        const track = row.querySelector('.compare-bar').getBoundingClientRect();
        const fill = row.querySelector('.compare-fill').getBoundingClientRect();
        return fill.width - track.width;
      }));
    for (const over of overflow) expect(over).toBeLessThanOrEqual(0.5);
  });
});

// ---------------------------------------------------------------------------
// The performance pass.
//
// Measured rather than assumed, because the answer decided whether to add a
// debounce and a diagram cache at all. A keystroke runs nine closed-form solves
// (the beam, four boundary conditions for the comparison, four for the selector
// cards) and rebuilds four SVG schematics and the whole results panel, and it
// still lands near a millisecond. The budget below is deliberately loose enough
// to survive a slow CI runner while still catching an order-of-magnitude
// regression, which is the only kind worth failing a build over.
// ---------------------------------------------------------------------------

test.describe('performance', () => {
  test('a keystroke stays well inside a frame, on the slowest load type', async ({ page }) => {
    await openTool(page);
    const perKeystroke = await page.evaluate(() => {
      const span = document.getElementById('span');
      const fire = (v) => {
        span.value = String(v);
        span.dispatchEvent(new Event('input', { bubbles: true }));
      };
      // The partial band is the expensive one: its maximum has no closed form,
      // so every solve scans and then refines instead of evaluating a formula.
      const type = document.getElementById('loadType');
      type.value = 'udl-partial';
      type.dispatchEvent(new Event('change', { bubbles: true }));
      for (let i = 0; i < 10; i += 1) fire(3);   // warm
      const t0 = performance.now();
      for (let i = 0; i < 50; i += 1) fire(3 + i * 0.01);
      return (performance.now() - t0) / 50;
    });
    expect(perKeystroke).toBeLessThan(16);
  });

  test('the verification sweep is fast enough to run on the main thread', async ({ page }) => {
    await openTool(page);
    const ms = await page.evaluate(() => {
      window.BeamDeflection.verifyAll();   // warm
      const t0 = performance.now();
      window.BeamDeflection.verifyAll();
      return performance.now() - t0;
    });
    // 60 cases, each a banded Hermitian solve over 200 elements. It runs on a
    // click with no spinner, so it has to stay short enough not to need one.
    expect(ms).toBeLessThan(1500);
  });
});
