// Yogurt CFU estimator: the scope disclaimer.
//
// The tool is Prototypical and had no spec. Its old .scope-warning-block sat
// inside the control panel between the status line and the recipe inputs, so it
// scrolled out of view as soon as anyone started entering a batch, and it said
// nothing about the specific hazard a home fermentation tool carries: that the
// model represents the starter culture and not the things that make food unsafe.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const PAGE = '/tools/yogurt-cfu-estimator.html';

test('scope disclaimer is visible, closed, and above the inputs', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  const box = await card.boundingBox();
  const layout = await page.locator('main.tool-layout').boundingBox();
  const controls = await page.locator('section.control-panel').boundingBox();
  expect(box.width).toBeGreaterThan(layout.width * 0.9);
  expect(box.y).toBeLessThan(controls.y);

  await expect(card.locator('.disclaimer-title')).toContainText('Not food safety advice');
  await expect(card.locator('.disclaimer-lead')).toContainText('a modelled pH is not a pH reading');
});

test('scope disclaimer keeps the model scope and batch variance the old block named', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  for (const source of [
    'strain',
    'milk treatment',
    'inoculum age',
    'solids',
    'thermal history',
    'refrigerator profile',
  ]) {
    await expect(body, `lost the ${source} variance source`).toContainText(source);
  }

  await expect(body).toContainText('not a pathogen-safety model, regulatory compliance tool, sterilization validator');
});

test('scope disclaimer says what the model does not represent', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // The distinction the whole card exists for: it models the starter, and the
  // things that make food unsafe are not in it.
  await expect(body).toContainText('It models the starter, not the contaminants');
  await expect(body).toContainText('A batch can look perfect on this page and be unsafe');
  await expect(body).toContainText('A modelled pH is not a measured pH');
  await expect(body).toContainText('CFU here is not a plate count');
  await expect(body).toContainText('fermentation does not make it safe');

  // Populations for whom a contaminated batch is worst, named rather than
  // covered by a general "consult a professional".
  await expect(body).toContainText('immunocompromised');
  await expect(body).toContainText('HACCP');
});

test('scope disclaimer disclaims any professional relationship', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const footer = card.locator('.disclaimer-footer');

  // A reader can mistake a CFU figure for a safety clearance in the way they
  // cannot mistake a beam deflection, so this page carries the medical-tool
  // clause as well.
  await expect(footer).toContainText('does not create any professional');
  await expect(footer).toContainText('nothing on it is food-safety, dietary, medical or professional advice');
});

test('scope disclaimer opens by keyboard and carries a touchpoint above the metrics', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');

  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('Modelled trends, not measurements');
  await expect(touch).toContainText('when in doubt about a batch, throw it out');

  const metrics = await page.locator('.metrics-grid').boundingBox();
  const box = await touch.boundingBox();
  expect(box.y).toBeLessThan(metrics.y);
});
