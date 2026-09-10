// DuckDB playground: the scope disclaimer.
//
// The tool is Active, had no spec, and had no user-visible caveat of any kind:
// 0 words, 0 of 5 legal elements. It invites you to load a file and query it,
// which makes the two things worth saying specific rather than generic: what
// "runs in your browser" covers, and that column types were guessed from a
// sample before you wrote a single query.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const PAGE = '/tools/duckdb-playground.html';

test('scope disclaimer is visible, closed, and spans above the layout', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  const box = await card.boundingBox();
  const layout = await page.locator('.main-layout').boundingBox();
  expect(box.width).toBeGreaterThan(layout.width * 0.9);
  expect(box.y).toBeLessThan(layout.y);

  await expect(card.locator('.disclaimer-title')).toContainText('Not an analytics platform');
  await expect(card.locator('.disclaimer-lead')).toContainText('third-party CDNs');
});

test('scope disclaimer states what browser-local does and does not cover', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('Files you add are parsed in the browser');
  await expect(body).toContainText('The code arrives over the network');
  await expect(body).toContainText('Extensions with host access');
  await expect(body).toContainText('lands unencrypted in your downloads folder');
  await expect(body).toContainText('Local is about transmission, not permission');
});

test('the CDN caveat names the libraries the page actually loads', async ({ page, baseURL }) => {
  // The card names four libraries by name. If the page stops loading one from a
  // CDN, or starts loading another, the card is what needs updating.
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  await page.waitForTimeout(500);

  const external = requests.filter((u) => /^https?:\/\/(cdn\.|.*jsdelivr)/.test(u));
  expect(external.length, 'no CDN request observed').toBeGreaterThan(0);

  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');
  for (const lib of ['DuckDB', 'Chart.js', 'SheetJS', 'fflate']) {
    await expect(body, `card does not name ${lib}`).toContainText(lib);
  }
});

test('scope disclaimer names the data traps rather than waving at accuracy', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // Type inference is the one that corrupts data before any query runs.
  await expect(body).toContainText('Type inference is a guess');
  await expect(body).toContainText('leading-zero identifier read as a number');
  await expect(body).toContainText('Large integers and high-precision decimals');
  await expect(body).toContainText('the literal text "NULL" are three different things');
  await expect(body).toContainText('Silent truncation');
  await expect(body).toContainText('Memory limits');

  // The landing sentence.
  await expect(body).toContainText('A query that runs is not a query that is correct');
});

test('scope disclaimer names the uses it is not for', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('HIPAA');
  await expect(body).toContainText('PCI DSS');
  await expect(body).toContainText('GDPR');
  await expect(body).toContainText('reconciliation, tax, audit');
  await expect(body).toContainText('Everything here is gone when the tab closes');
});

test('scope disclaimer opens by keyboard and carries a touchpoint in the results panel', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');

  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('Exploratory results');
  await expect(touch).toContainText('inferred from a sample');

  // Above the results content, so it reads before the numbers do.
  const content = await page.locator('#resultsContent').boundingBox();
  const box = await touch.boundingBox();
  expect(box.y).toBeLessThan(content.y);
});
