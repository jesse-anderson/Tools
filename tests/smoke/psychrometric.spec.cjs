// Runs the psychrometric calculator's pinned PsychroLib v2.5.0 reference cases
// (window.REFERENCE_DATA) through the real solvers in the browser. Replaces the
// one-off validation scripts that lived at the repo root during the engine
// migration (check_psychrolib.py, reproduce_psychro.js, debug_values.*).
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/psychrometric-calculator.html';
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
  await page.waitForFunction(() =>
    window.PSY !== undefined && window.REFERENCE_DATA !== undefined && window.psychrolib !== undefined);
}

test('all pinned reference cases solve within tolerance', async ({ page }) => {
  await openTool(page);
  const failures = await page.evaluate(() => {
    const solve = (testCase) => {
      const input = testCase.input;
      switch (testCase.mode) {
        case 'tdb_rh': return PSY.solve_Tdb_RH(input.Tdb, input.RH, input.Pa);
        case 'tdb_twb': return PSY.solve_Tdb_Twb(input.Tdb, input.Twb, input.Pa);
        case 'tdb_tdp': return PSY.solve_Tdb_Tdp(input.Tdb, input.Tdp, input.Pa);
        case 'tdb_w': return PSY.solve_Tdb_W(input.Tdb, input.W, input.Pa);
        default: throw new Error(`Unsupported mode: ${testCase.mode}`);
      }
    };
    const problems = [];
    for (const testCase of REFERENCE_DATA) {
      const result = solve(testCase);
      const actualValues = {
        Twb: result.Twb, Tdp: result.Tdp, RH: result.RH,
        W: result.W * 1000, h: result.h, v: result.v
      };
      for (const [key, expected] of Object.entries(testCase.expected)) {
        const diff = Math.abs(actualValues[key] - expected);
        if (!(diff <= testCase.tolerance[key])) {
          problems.push(`${testCase.name} ${key}: expected ${expected}, got ${actualValues[key]}`);
        }
      }
      if (result.Twb_converged === false) {
        problems.push(`${testCase.name}: wet bulb solver did not converge`);
      }
    }
    return problems;
  });
  expect(failures).toEqual([]);
});

test('PSY wrapper stays consistent with bundled psychrolib', async ({ page }) => {
  await openTool(page);
  const checks = await page.evaluate(() => {
    // guards the kPa/Pa and kJ/J conversions in the wrapper; a drift here is
    // what the old hand-rolled engine failed on (saturated h at T=17.8894)
    const out = [];
    for (const T of [-10, 5, 17.8894, 35]) {
      const pwsWrapper = PSY.Pws(T);                       // kPa
      const pwsLib = psychrolib.GetSatVapPres(T) / 1000;   // Pa -> kPa
      const W = PSY.W_from_Pw(pwsLib, 101.325);
      const hWrapper = PSY.h(T, W);                                 // kJ/kg
      const hLib = psychrolib.GetMoistAirEnthalpy(T, W) / 1000;     // J -> kJ
      out.push({ T, pwsWrapper, pwsLib, hWrapper, hLib });
    }
    return out;
  });
  for (const c of checks) {
    expect(Math.abs(c.pwsWrapper - c.pwsLib) / c.pwsLib).toBeLessThan(1e-4);
    expect(Math.abs(c.hWrapper - c.hLib)).toBeLessThan(Math.max(1e-6, Math.abs(c.hLib)) * 1e-4);
  }
});

test('saturation edge: at RH 100 the three temperatures coincide', async ({ page }) => {
  await openTool(page);
  const r = await page.evaluate(() => PSY.solve_Tdb_RH(25, 100, 101.325));
  expect(Math.abs(r.Twb - 25)).toBeLessThan(0.05);
  expect(Math.abs(r.Tdp - 25)).toBeLessThan(0.05);
  expect(r.W).toBeGreaterThan(0);
  expect(Number.isFinite(r.h)).toBe(true);
});
