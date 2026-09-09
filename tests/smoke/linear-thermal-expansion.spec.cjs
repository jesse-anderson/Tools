// Linear thermal expansion: the arithmetic through the DOM, and the scope
// disclaimer.
//
// The tool was marked Active with no spec of any kind. "Active" means the maths
// is tested against a reference, so the first three tests here are that
// reference: dL = alpha * L0 * dT, hand-computed, plus the unit paths and the
// sign convention on cooling.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const TOOL_PATH = '/tools/linear-thermal-expansion.html';

async function openTool(page) {
  await page.goto(TOOL_PATH);
  await page.waitForFunction(() => document.getElementById('resDeltaL').textContent.trim().length > 0);
}

// Drive the inputs the way a person does and read the rendered answer.
async function compute(page, { cte, length, lengthUnit, t0, t1, tempUnit }) {
  return page.evaluate(({ cte, length, lengthUnit, t0, t1, tempUnit }) => {
    const set = (id, value) => {
      const el = document.getElementById(id);
      el.value = String(value);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    };
    if (cte !== undefined) {
      set('materialSelect', 'custom');
      set('cteInput', cte);
    }
    if (lengthUnit) set('lengthUnit', lengthUnit);
    if (tempUnit) set('tempUnit', tempUnit);
    set('lengthInput', length);
    set('tempInitial', t0);
    set('tempFinal', t1);
    return {
      deltaL: document.getElementById('resDeltaL').textContent.trim(),
      deltaLUnit: document.getElementById('resDeltaLUnit').textContent.trim(),
      finalL: document.getElementById('resFinalL').textContent.trim(),
      deltaT: document.getElementById('resDeltaT').textContent.trim(),
      percent: document.getElementById('resPercent').textContent.trim(),
    };
  }, { cte, length, lengthUnit, t0, t1, tempUnit });
}

const num = (s) => parseFloat(String(s).replace(/[^\d.eE+-]/g, ''));

test('page loads cleanly', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, TOOL_PATH);
});

test('golden: 100 m of CTE 11.75 over 100 C expands 0.1175 m', async ({ page }) => {
  await openTool(page);
  // dL = 11.75e-6 * 100 m * 100 K = 0.1175 m exactly.
  const out = await compute(page, { cte: 11.75, length: 100, lengthUnit: 'm', t0: 20, t1: 120, tempUnit: 'C' });
  expect(num(out.deltaL)).toBeCloseTo(0.1175, 6);
  expect(out.deltaLUnit).toBe('m');
  expect(num(out.finalL)).toBeCloseTo(100.1175, 6);
  expect(num(out.deltaT)).toBeCloseTo(100, 6);
  expect(num(out.percent)).toBeCloseTo(0.1175, 6);
});

test('cooling contracts, and the sign follows the temperature change', async ({ page }) => {
  await openTool(page);
  const out = await compute(page, { cte: 11.75, length: 100, lengthUnit: 'm', t0: 120, t1: 20, tempUnit: 'C' });
  expect(num(out.deltaL)).toBeCloseTo(-0.1175, 6);
  expect(out.deltaL.startsWith('-')).toBe(true);
  expect(num(out.finalL)).toBeCloseTo(99.8825, 6);
});

test('a Fahrenheit range gives 5/9 of the Celsius expansion', async ({ page }) => {
  await openTool(page);
  // A 100 F change is 100/1.8 = 55.5556 K, so dL = 11.75e-6 * 100 m * 55.5556.
  const out = await compute(page, { cte: 11.75, length: 100, lengthUnit: 'm', t0: 68, t1: 168, tempUnit: 'F' });
  expect(num(out.deltaL)).toBeCloseTo(11.75e-6 * 100 * (100 / 1.8), 6);
  expect(num(out.deltaL)).toBeCloseTo(0.0652778, 5);
});

// --- scope disclaimer -----------------------------------------------------
// This tool's collapsible card was the pattern beam-deflection copied, and its
// content was already the strongest in the repo on scope. What it did not
// carry was the boilerplate: no warranty disclaimer, no assumption of risk, no
// enumerated damages, no indemnity, no severability. The rebuild moves it onto
// the shared component, out of the sidebar and above the inputs, and keeps
// every limitation it already named.

test('scope disclaimer is visible, closed, and spans the layout', async ({ page }) => {
  await openTool(page);
  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  const box = await card.boundingBox();
  const layout = await page.locator('.calculator-layout').boundingBox();
  expect(box.width).toBeGreaterThan(layout.width * 0.9);
  expect(box.y).toBeLessThan(layout.y);

  await expect(card.locator('.disclaimer-title')).toContainText('Not a thermal stress analysis');
  await expect(card.locator('.disclaimer-lead')).toContainText('a constrained part does not expand, it loads');
});

test('scope disclaimer keeps every limitation the old card named', async ({ page }) => {
  await openTool(page);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // The seven factors the previous card enumerated, each still named.
  for (const factor of [
    'Non-linearity',
    'Material variance',
    'Anisotropy',
    'Thermal hysteresis',
    'Constraint effects',
    'Moisture and environment',
    'Time-dependent effects',
  ]) {
    await expect(body, `lost the ${factor} limitation`).toContainText(factor);
  }

  // Anisotropy was the one with a worked sub-list; a generic mention is not
  // the same warning.
  await expect(body).toContainText('radial against tangential against longitudinal grain');
  await expect(body).toContainText('layer adhesion direction effects');

  // Application cases and the codes behind them.
  await expect(body).toContainText('ASME Boiler and Pressure Vessel Code');
  await expect(body).toContainText('tolerance stack-up');
  await expect(body).toContainText('bimetallic');
  await expect(body).toContainText('cryogenic');

  // The formula callout survived the move to the shared component.
  await expect(body.locator('.formula')).toBeVisible();
});

test('scope disclaimer opens by keyboard and carries a second touchpoint', async ({ page }) => {
  await openTool(page);
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');

  const touch = page.locator('p.disclaimer');
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('A free length change, not a design allowance');
});
