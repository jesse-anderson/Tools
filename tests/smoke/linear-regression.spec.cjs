// Linear regression: the scope disclaimer. It names the five unchecked
// assumptions and the two misreadings a regression page invites, that a high
// R-squared means the model is right and that a coefficient is a causal effect.
// The old hand-rolled collapsible bound neither Enter nor Space; the card is
// native details/summary.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const PAGE = '/tools/linear-regression.html';

test('scope disclaimer is visible, closed, and above the import panel', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  const box = await card.boundingBox();
  const importPanel = await page.locator('.import-panel').boundingBox();
  expect(box.y).toBeLessThan(importPanel.y);
  expect(box.width).toBeGreaterThan(importPanel.width * 0.9);

  await expect(card.locator('.disclaimer-title')).toContainText('Not a statistician');
  await expect(card.locator('.disclaimer-lead')).toContainText('A high R');
});

test('scope disclaimer uses native details, with no JavaScript toggle left behind', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  // The hand-rolled collapsible and its handler are gone.
  await expect(page.locator('#disclaimerToggle')).toHaveCount(0);
  await expect(page.locator('#disclaimerContent')).toHaveCount(0);

  // Keyboard operable for free, which the old div with role="button" only
  // achieved through a click handler that never bound Enter or Space.
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(card).not.toHaveAttribute('open', /.*/);
});

test('scope disclaimer keeps all five unchecked assumptions', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  for (const assumption of [
    'linearity',
    'normality',
    'homoscedasticity',
    'independence',
    'multicollinearity',
  ]) {
    await expect(body, `lost the ${assumption} assumption`).toContainText(assumption);
  }
  await expect(body).toContainText('may invalidate results');

  // Independence is singled out because breaking it corrupts the standard
  // errors rather than merely widening them.
  await expect(body).toContainText('Time series, repeated measures, clustered or spatially correlated data');
});

test('scope disclaimer addresses the two readings a regression page invites', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText("Anscombe's quartet");
  await expect(body).toContainText('A regression coefficient is not a causal effect');
  await expect(body).toContainText('no correction for multiple comparisons');
  // VIF is shown on this page, so the card has to say what a high one means.
  await expect(body).toContainText('Variance inflation factors flag collinearity, they do not fix it');
});

test('scope disclaimer names the uses it is not for, and keeps the statistician line', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('Consult a statistician for research design, hypothesis testing and interpretation');
  await expect(body).toContainText('Regulatory submissions');
  await expect(body).toContainText('Forensic or legal evidence');
  // A fitted coefficient turned into a rule about people is the case worth
  // naming explicitly rather than leaving to "professional judgement".
  await expect(body).toContainText('hiring, credit, insurance or benefits');
});

test('scope disclaimer carries a touchpoint beside the statistics', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('Fit statistics, not a verdict on the model');
  await expect(touch).toContainText('Read the residual plot before the summary');

  const stats = await page.locator('.stats-grid').boundingBox();
  const box = await touch.boundingBox();
  expect(box.y).toBeLessThan(stats.y);
});
