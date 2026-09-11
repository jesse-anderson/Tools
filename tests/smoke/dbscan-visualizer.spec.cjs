// DBSCAN visualizer: the scope disclaimer.
//
// The tool is Active, had no spec, and had no user-visible caveat of any kind
// while producing cluster assignments people screenshot into reports. The
// specific problem with a clustering tool is not that the arithmetic might be
// wrong. It is that the arithmetic is right and the output is still not a
// finding: DBSCAN partitions any data at any parameters, and a picture of
// coloured groups is persuasive whether or not the structure exists.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const PAGE = '/tools/dbscan-visualizer.html';

test('scope disclaimer is visible, closed, and above the layout', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  const box = await card.boundingBox();
  const layout = await page.locator('.main-layout').boundingBox();
  expect(box.width).toBeGreaterThan(layout.width * 0.9);
  expect(box.y).toBeLessThan(layout.y);

  await expect(card.locator('.disclaimer-title')).toContainText('not evidence that groups exist');
  await expect(card.locator('.disclaimer-lead')).toContainText('A cluster is a hypothesis, not a discovery');
});

test('scope disclaimer says the answer is mostly the parameters', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('The same points yield one cluster, twenty clusters, or all noise depending on a number you typed');
  await expect(body).toContainText('the largest-range column silently defines the clusters');
  // The failure mode DBSCAN is best known for, named with its alternatives.
  await expect(body).toContainText('A single epsilon cannot serve a dataset with dense and sparse regions');
  await expect(body).toContainText('HDBSCAN and OPTICS');
  await expect(body).toContainText('points become equidistant');
  // The label people most often read as a result.
  await expect(body).toContainText('Noise is a label, not a verdict');
  await expect(body).toContainText('It is not an outlier, an error, or a fraud signal');
});

test('scope disclaimer distinguishes a validated implementation from a valid result', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // The scikit-learn parity check is a real claim and a narrow one, so the
  // card states both halves.
  await expect(body).toContainText('validated against scikit-learn');
  await expect(body).toContainText('It says nothing about whether the algorithm suits your data');
  await expect(body).toContainText('Any algorithm will partition random noise');
  await expect(body).toContainText('no ground truth, no accuracy, no p-value');
});

test('scope disclaimer names the uses it is not for', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('credit, insurance, pricing, hiring, policing or benefits');
  await expect(body).toContainText('A cluster label is not a justification');
  await expect(body).toContainText('Fraud, anomaly or intrusion detection');
  // The screenshot case, which is how output from this tool actually travels.
  await expect(body).toContainText('A screenshot presented as a result');
  await expect(body).toContainText('they belong in the caption');
});

test('the touchpoint is in the visible Results card, not the hidden overlay', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('A partition, not a finding');

  // It first landed inside #overlayStats, which carries display:none until a
  // run completes, so this asserts where it is not as well as where it is.
  const inHiddenOverlay = await touch.evaluate((el) => Boolean(el.closest('#overlayStats')));
  expect(inHiddenOverlay).toBe(false);
  const inSidebarCard = await touch.evaluate((el) => Boolean(el.closest('.sidebar-card')));
  expect(inSidebarCard).toBe(true);
});

test('scope disclaimer opens by keyboard', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');
});
