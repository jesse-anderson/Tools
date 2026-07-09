// Runs the psychrometric calculator's pinned PsychroLib v2.5.0 reference cases
// (window.REFERENCE_DATA) through the real solvers in the browser. Replaces the
// one-off validation scripts that lived at the repo root during the engine
// migration (check_psychrolib.py, reproduce_psychro.js, debug_values.*).
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const TOOL_PATH = '/tools/psychrometric-calculator.html';

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

test('psychrometric calculator keeps unit paths and Tdb plus W wet bulb consistent', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/psychrometric-calculator.html');
  await expect(page.locator('#devModal')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Â');
  await expect(page.locator('body')).not.toContainText('Ã');
  await expect(page.locator('body')).not.toContainText('â');
  await expect(page.locator('body')).not.toContainText('deg C');
  await expect(page.locator('#labelUnitTdb')).toContainText('°C');

  await expect(page.locator('#valTwb')).toContainText('17.89');
  await expect(page.locator('#calcW')).toContainText('0.009881');
  await expect(page.locator('#calcW')).toContainText('kg/kg');

  await page.locator('.unit-toggle button[data-unit="ip"]').click();
  await expect(page.locator('#labelUnitTdb')).toContainText('°F');
  await expect(page.locator('body')).not.toContainText('deg F');
  await expect(page.locator('#calcPressure')).toContainText('14.696');
  await expect(page.locator('#calcPressure')).toContainText('psi');
  await expect(page.locator('#valH')).toContainText('21.63');

  const pressureKPa = await page.evaluate(() => getInputPressureKPa());
  expect(pressureKPa).toBeCloseTo(101.325, 2);

  await page.locator('.mode-toggle button[data-mode="tdb_w"]').click();
  await expect(page.locator('#valTwb')).toContainText('64.37');
  await expect(page.locator('#calcW')).toContainText('0.010000');
  await expect(page.locator('#calcW')).toContainText('lb/lb');

  await page.fill('#inputAltitude', '5280');
  await expect(page.locator('#altitudePressureHint')).toContainText('12.');
  await page.click('#applyAltitudeBtn');
  const altitudePressureKPa = await page.evaluate(() => getInputPressureKPa());
  expect(altitudePressureKPa).toBeCloseTo(83.4, 0);
  await expect(page.locator('#calcPressure')).toContainText('12.');

  await page.locator('.unit-toggle button[data-unit="si"]').click();
  await page.click('#resetInputBtn');
  await page.click('#saveStateABtn');
  await page.click('#applyProcessSaveBBtn');
  await expect(page.locator('#valTdb')).toContainText('30.00');
  await expect(page.locator('#processStateASummary')).toContainText('Tdb 25.0 C');
  await expect(page.locator('#processStateBSummary')).toContainText('Tdb 30.0 C');
  await expect(page.locator('#processDeltaSummary')).toContainText('Delta Tdb +5.0 C');
  await expect(page.locator('#processDeltaSummary')).toContainText('Delta h');

  await page.selectOption('#processType', 'cool_dehum');
  await page.fill('#processInput1', '18');
  await page.fill('#processInput2', '90');
  await page.click('#applyProcessBtn');
  await expect(page.locator('#processOutput')).toContainText('Cooling/dehumidification target');
  await expect(page.locator('#valRH')).toContainText('90.0 %');

  await page.selectOption('#processType', 'humidify');
  await page.fill('#processInput1', '2');
  await page.click('#applyProcessBtn');
  await expect(page.locator('#processOutput')).toContainText('Humidification');

  await page.selectOption('#processType', 'mix');
  await page.fill('#processInput1', '50');
  await page.click('#applyProcessBtn');
  await expect(page.locator('#processOutput')).toContainText('Mixed air from State A/B');

  await page.selectOption('#processType', 'coil');
  await page.fill('#processInput1', '10');
  await page.fill('#processInput2', '0.10');
  await page.click('#applyProcessBtn');
  await expect(page.locator('#processOutput')).toContainText('Coil leaving estimate');

  const chartPoint = await page.evaluate(() => ({
    x: CHART.TdbToX(32),
    y: CHART.WToY(12)
  }));
  await page.locator('#psychoCanvas').click({ position: chartPoint });
  await expect(page.locator('#labelInput2')).toContainText('Humidity Ratio');
  const chartState = await page.evaluate(() => ({
    mode: inputMode,
    Tdb: currentState.Tdb,
    W: currentState.W
  }));
  expect(chartState.mode).toBe('tdb_w');
  expect(chartState.Tdb).toBeCloseTo(32, 1);
  expect(chartState.W).toBeCloseTo(0.012, 3);

  const resultsDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Data' }).click();
  const resultsDownload = await resultsDownloadPromise;
  const resultsCsv = fs.readFileSync(await resultsDownload.path(), 'utf8');
  expect(resultsCsv).toContain('Altitude Helper Input,0.00 m');
  expect(resultsCsv).toContain('Standard Pressure From Altitude,101.325 kPa');
  expect(resultsCsv).toContain('Pressure Source,Calculation uses the atmospheric pressure field');
  expect(resultsCsv).toContain('=== PROCESS STATES ===');
  expect(resultsCsv).toContain('=== PROCESS DELTAS ===');

  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('#validationModal')).toContainText('Validation Passed');
  await expect(page.locator('#validationModal')).toContainText('Reference cases are PsychroLib v2.5.0');
  await expect(page.locator('#validationModal')).toContainText('Tdb + Twb');
  await expect(page.locator('#validationModal')).toContainText('Tdb + Tdp');
  await expect(page.locator('#validationModal')).toContainText('Tdb + W');

  const reportDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Report' }).click();
  const reportDownload = await reportDownloadPromise;
  const reportCsv = fs.readFileSync(await reportDownload.path(), 'utf8');
  expect(reportCsv).toContain('Psychrometric Calculator Validation Report');
  expect(reportCsv).toContain('Reference Source: PsychroLib v2.5.0');
  expect(reportCsv).toContain('Tdb + W: Comfort Room Conditions');
});
