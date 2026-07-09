// Runs the Moody chart tool's built-in physics verification suite (window.TEST)
// in CI, checks the friction-factor solver against reference values, and
// exercises the two input helpers (compute Re, estimate ε/D from material).
const { test, expect } = require('@playwright/test');

const TOOL_PATH = '/tools/moody-chart.html';

async function openTool(page) {
  await page.goto(TOOL_PATH);
  await page.waitForFunction(() => window.TEST !== undefined && window.SOLVER !== undefined);
}

test('built-in physics verification suite passes', async ({ page }) => {
  await openTool(page);
  const report = await page.evaluate(() => window.TEST.run());
  expect(report.failed).toBe(0);
  expect(report.passed).toBeGreaterThan(20);
});

test('friction-factor solver matches reference values', async ({ page }) => {
  await openTool(page);
  const out = await page.evaluate(() => {
    const S = window.SOLVER;
    return {
      laminar: S.getFrictionFactor(1000, 0.001).f,          // 64/1000 = 0.064
      colebrook: S.getFrictionFactor(1e5, 0.001).f,          // ≈ 0.0221
      fullyRough: S.fullyRough(0.01).f,                       // ≈ 0.0380
      inferBack: S.inferRelRoughness(1e5, S.getFrictionFactor(1e5, 0.002).f).relRoughness
    };
  });
  expect(out.laminar).toBeCloseTo(0.064, 6);
  expect(Math.abs(out.colebrook - 0.0221) / 0.0221).toBeLessThan(0.02);
  expect(Math.abs(out.fullyRough - 0.0380) / 0.0380).toBeLessThan(0.02);
  // round trip: infer ε/D from (Re, f) recovers the input roughness
  expect(Math.abs(out.inferBack - 0.002) / 0.002).toBeLessThan(0.02);
});

test('Reynolds helper fills Re from flow parameters', async ({ page }) => {
  await openTool(page);
  // kinematic: Re = V·D/ν = 2·0.05/0.001 = 100
  const kin = await page.evaluate(() => {
    document.getElementById('reViscType').value = 'kinematic';
    document.getElementById('reViscType').dispatchEvent(new Event('change'));
    document.getElementById('reV').value = '2';
    document.getElementById('reD').value = '0.05';
    document.getElementById('reVisc').value = '0.001';
    document.getElementById('reComputeBtn').click();
    return document.getElementById('inputRe').value;
  });
  expect(parseFloat(kin)).toBeCloseTo(100, 6);

  // dynamic: Re = ρ·V·D/μ = 998·2·0.05/0.001 = 99800
  const dyn = await page.evaluate(() => {
    document.getElementById('reViscType').value = 'dynamic';
    document.getElementById('reViscType').dispatchEvent(new Event('change'));
    document.getElementById('reRho').value = '998';
    document.getElementById('reV').value = '2';
    document.getElementById('reD').value = '0.05';
    document.getElementById('reVisc').value = '0.001';
    document.getElementById('reComputeBtn').click();
    return document.getElementById('inputRe').value;
  });
  expect(parseFloat(dyn)).toBeCloseTo(99800, 0);
});

test('material helper fills ε/D from roughness and diameter', async ({ page }) => {
  await openTool(page);
  const out = await page.evaluate(() => {
    // commercial steel ε = 0.045 mm, D = 50 mm -> ε/D = 0.0009
    document.getElementById('roughEps').value = '0.045';
    document.getElementById('roughD').value = '50';
    document.getElementById('roughApplyBtn').click();
    const filled = document.getElementById('inputRelRough').value;
    // the material dropdown carries a real roughness for a known preset
    const matSelect = document.getElementById('roughMaterial');
    const steel = [...matSelect.options].find((o) => /commercial steel/i.test(o.textContent));
    return { filled, hasSteelPreset: Boolean(steel && /0\.045/.test(steel.textContent)) };
  });
  expect(parseFloat(out.filled)).toBeCloseTo(0.0009, 8);
  expect(out.hasSteelPreset).toBe(true);
});
