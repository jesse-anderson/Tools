// SQLite viewer: the scope disclaimer. The page claims "100% Local" in three
// places. That holds for the database file and is narrower than it reads: the
// WebAssembly doing the work is fetched from a CDN.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const PAGE = '/tools/sqlite-viewer.html';

test('page loads cleanly', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
});

test('scope disclaimer is visible, closed, and above the layout', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  const box = await card.boundingBox();
  const layout = await page.locator('.calculator-layout').boundingBox();
  expect(box.width).toBeGreaterThan(layout.width * 0.9);
  expect(box.y).toBeLessThan(layout.y);

  await expect(card.locator('.disclaimer-title')).toContainText('Not a database administration tool');
  // The qualification of the page's own headline claim has to read without
  // opening the card, because the claim itself is in the header.
  await expect(card.locator('.disclaimer-lead')).toContainText('narrower than "private"');
});

test('scope disclaimer qualifies the local-only claim the page makes elsewhere', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  // The claim, still on the page in the header and the sidebar shield.
  await expect(page.locator('.privacy-badge.local-only')).toContainText('100% Local');
  await expect(page.locator('.privacy-shield')).toContainText('No data sent to any server');

  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // Kept verbatim in substance: the claim is accurate about the file.
  await expect(body).toContainText('Your database files are never uploaded to any server');

  // And the five things it does not cover.
  await expect(body).toContainText('The code is not local');
  await expect(body).toContainText('fetched over the network from a CDN');
  await expect(body).toContainText('Extensions with host access');
  await expect(body).toContainText('lands unencrypted in your downloads folder');
  await expect(body).toContainText('session restore');
  await expect(body).toContainText('Local is about transmission, not authorisation');
});

test('the CDN caveat matches how the page actually loads sql.js', async ({ page, baseURL }) => {
  // The card claims the WebAssembly comes from a CDN. If that ever stops being
  // true, the card is the thing that is wrong, so pin it to reality.
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  await page.waitForTimeout(500);

  const external = requests.filter((u) => /sql-wasm|sql\.js/i.test(u));
  expect(external.length, 'no sql.js request observed').toBeGreaterThan(0);
  expect(external.some((u) => /cdnjs\.cloudflare\.com/.test(u)),
    `sql.js no longer comes from cdnjs: ${external.join(', ')}`).toBe(true);
});

test('scope disclaimer keeps the data-safety and production limits', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('No warranty for data loss');
  await expect(body).toContainText('Always maintain backups of important databases');
  await expect(body).toContainText('never point it at your only copy');
  await expect(body).toContainText('not a replacement for proper database administration tools');
  await expect(body).toContainText('above roughly 100 MB');
  await expect(body).toContainText('DB Browser for SQLite');
});

test('scope disclaimer names the uses it is not for', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('HIPAA');
  await expect(body).toContainText('PCI DSS');
  await expect(body).toContainText('GDPR');
  // Forensics is the use where "I opened it in a browser viewer" destroys the
  // thing it was trying to establish.
  await expect(body).toContainText('no write blocking, no hashing and no chain of custody');
  await expect(body).toContainText('Opening a file you are not authorised to read');
});

test('scope disclaimer opens by keyboard and carries a touchpoint by the upload panel', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');

  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('Inspection only, and always on a copy');
  await expect(touch).toContainText('fetched from a CDN');
});
