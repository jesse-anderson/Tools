// Local LLM opex: the scope disclaimer. The point that matters is that the cloud
// prices are defaults captured when the page was written, so the comparison is
// between a measured number and a remembered one.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const PAGE = '/tools/local-llm-opex.html';

test('page loads cleanly', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
});

test('scope disclaimer is visible, closed, and spans the layout', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  // .calculator-layout on this page is a FLEX row above 900px, not a grid, so
  // the shared `grid-column: 1 / -1` does nothing and a card placed inside it
  // becomes a third flex item beside the panel and the sidebar. The card sits
  // before <main> instead. flex-basis is not a fix in shared.css here: this
  // layout is flex-column at narrow widths, where 100% would set the height.
  const box = await card.boundingBox();
  const layout = await page.locator('main.calculator-layout').boundingBox();
  expect(box.width).toBeGreaterThan(layout.width * 0.9);
  expect(box.y).toBeLessThan(layout.y);
  const insideLayout = await card.evaluate((el) => Boolean(el.closest('main.calculator-layout')));
  expect(insideLayout).toBe(false);

  await expect(card.locator('.disclaimer-title')).toContainText('Not a quote, not a budget');
  await expect(card.locator('.disclaimer-lead')).toContainText('captured when it was written, and they have already moved');
});

test('scope disclaimer keeps every unmodelled cost the old block listed', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  for (const cost of [
    'time-of-use',
    'demand charges',
    'Hardware depreciation curves',
    'Cooling overhead',
    'software licensing',
    'Regulatory and compliance costs',
    'downtime',
    'opportunity cost of operator time',
  ]) {
    await expect(body, `lost the ${cost} exclusion`).toContainText(cost);
  }

  // The one the old text listed flatly and this one ranks, because on a
  // self-hosted deployment it usually dominates.
  await expect(body).toContainText('usually the largest line item and never appears on this page');
  await expect(body).toContainText('Model quality, latency variance, cooling, networking, setup time, support burden');
});

test('scope disclaimer says the cloud comparison is against remembered prices', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('illustrative defaults captured at the time of authoring');
  await expect(body).toContainText('Published prices, model availability, rate limits and streaming speeds change frequently');
  await expect(body).toContainText('Treat the cloud defaults as placeholders');
  // The landing sentence.
  await expect(body).toContainText('A comparison between a number you measured and a number this page remembered is not a comparison');
});

test('scope disclaimer names the decisions it is not for', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('A purchase, a lease or a contract commitment');
  await expect(body).toContainText('Board, investor or customer material');
  await expect(body).toContainText('Vendor selection or negotiation');
  // Measured at the wall, not a datasheet TDP, is the one specific correction
  // that changes the electricity line.
  await expect(body).toContainText('measured power draw at the wall rather than a datasheet TDP');
  await expect(body).toContainText('at the quantisation, context length and concurrency you would actually use');
});

test('scope disclaimer opens by keyboard and carries a touchpoint by the results', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');

  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('Estimates only, used at your own risk');
  const inResults = await touch.evaluate((el) => Boolean(el.closest('.results-section')));
  expect(inResults).toBe(true);
});
