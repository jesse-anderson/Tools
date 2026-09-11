// Screenshot tool: the scope disclaimer. What a screenshot tool is risky for is
// that the frame contains whatever was on screen, and there is no redaction
// feature on the page.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const PAGE = '/tools/screenshot-tool.html';

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

  await expect(card.locator('.disclaimer-title')).toContainText('not a redaction tool, and not evidence');
  // The instruction that prevents the accident has to read without opening.
  await expect(card.locator('.disclaimer-lead')).toContainText('Look at the frame before you send it');
});

test('scope disclaimer names what ends up in a frame by accident', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('The capture is whatever the browser handed over, not what you were looking at');
  await expect(body).toContainText('A notification or toast that arrived during the capture');
  await expect(body).toContainText('File paths, usernames, machine names and account names in title bars');
  await expect(body).toContainText('including a second monitor, if you shared a screen rather than a window or a tab');

  // The page has no blur or pixelation, so the card says so rather than
  // leaving a reader to assume cropping is redaction.
  await expect(body).toContainText('there is no blur, pixelation or redaction feature on this page');
  await expect(body).toContainText('Anything inside it is exported exactly as captured');
});

test('scope disclaimer keeps the three things the old block said it does not do', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('No perspective correction, no calibration, no curve digitization');
  await expect(body).toContainText('Always validate any downstream measurements');
  // Why pixel coordinates are not a unit, which the old text asserted without
  // explaining.
  await expect(body).toContainText('affected by device pixel ratio, browser zoom');
  await expect(body).toContainText('JPEG and WebP exports are lossy');
  // And the 20 MP hint, kept.
  await expect(body).toContainText('above roughly 20 megapixels');
});

test('scope disclaimer says a screenshot is not evidence', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('no authenticated timestamp, no provenance, no hash and no chain of custody');
  await expect(body).toContainText('does not establish that anything appeared on any screen at any time');
  await expect(body).toContainText('Evidence in legal, forensic, HR, disciplinary or investigatory proceedings');
  await expect(body).toContainText('Redacting sensitive information before publication');
});

test('scope disclaimer opens by keyboard and carries a touchpoint by the export buttons', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');

  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('Look at the export before you send it');
  // Beside the export controls, which is the last moment it can help.
  const exportBtn = await page.locator('#btnExportFull').boundingBox();
  const box = await touch.boundingBox();
  expect(box.y).toBeGreaterThan(exportBtn.y);
});
