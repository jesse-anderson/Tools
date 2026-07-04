// Runs the steam tables tool's built-in consistency checks (the "Run Tests"
// button, js/steam_tables/self-tests.js) in CI, plus chart and action-menu
// regressions from the July 2026 review: full-range log-axis tick labels,
// phase-region tint boundaries (Pc isobar / Tc isotherm), and menus that
// close after picking an item.
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/steam-tables.html';
let smokeServer;

test.beforeAll(async () => {
  smokeServer = await startServer({
    port: Number(process.env.PORT || 4173),
    reuseExisting: !process.env.CI
  });
});

test.afterAll(async () => {
  if (smokeServer) {
    await smokeServer.close();
    smokeServer = null;
  }
});

test('built-in self-test suite passes', async ({ page }) => {
  await page.goto(TOOL_PATH);

  // engine is ready once the loading banner is replaced
  await page.waitForFunction(() =>
    !document.getElementById('statusBanner').textContent.includes('Loading steam tables'),
    { timeout: 30000 });

  await page.click('details.action-menu:has(#runTestsBtn) summary');
  await page.click('#runTestsBtn');
  await page.waitForSelector('#testPanel .test-summary', { timeout: 60000 });

  const report = await page.evaluate(() => {
    const summary = document.querySelector('#testPanel .test-summary');
    const passed = parseInt(summary.querySelector('strong').textContent, 10);
    const failed = parseInt(summary.querySelector('span').textContent, 10);
    const failures = [...document.querySelectorAll('#testPanel .test-row.fail summary strong')]
      .map((el) => el.textContent.trim());
    return { passed, failed, failures, banner: document.getElementById('statusBanner').textContent };
  });

  expect(report.failures).toEqual([]);
  expect(report.failed).toBe(0);
  expect(report.passed).toBeGreaterThan(30);
  expect(report.banner).toMatch(/internal tests passed/);
});

async function openAndCompute(page) {
  await page.goto(TOOL_PATH);
  await page.evaluate(() => localStorage.clear());
  await page.goto(TOOL_PATH);
  await page.waitForFunction(() =>
    !document.getElementById('statusBanner').textContent.includes('Loading steam tables'),
    { timeout: 30000 });
  await page.selectOption('#lookupMode', 'mixT');
  await page.fill('#field-T', '150');
  await page.fill('#field-x', '0.5');
  await page.click('#computeBtn');
  await page.waitForSelector('#chartPanel .chart-block');
}

test('all four context charts render with full-range log ticks and region tints', async ({ page }) => {
  await openAndCompute(page);

  const charts = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll('#chartPanel .chart-block')];
    const pvBlock = blocks.find((block) => block.textContent.includes('P-v Saturation Dome'));
    const pvTicks = pvBlock
      ? [...pvBlock.querySelectorAll('.chart-axis text')].map((el) => el.textContent.trim())
      : [];
    return {
      blockCount: blocks.length,
      titles: blocks.map((block) => block.querySelector('.chart-header strong')?.textContent || ''),
      pvTicks,
      regionGroups: document.querySelectorAll('#chartPanel .chart-phase-regions').length
    };
  });

  expect(charts.blockCount).toBe(4);
  expect(charts.titles).toEqual([
    'T-s Context',
    'Mollier h-s Context',
    'P-v Saturation Dome',
    'P-T Saturation Curve'
  ]);
  // The old log-tick truncation dropped every decade above 10^4 kPa on P-v,
  // leaving the top of the chart unlabeled. The capped isotherms reach
  // 100 MPa, so a 100000 kPa tick must exist.
  expect(charts.pvTicks).toContain('100000');
  // Every chart paints its phase-region tint group.
  expect(charts.regionGroups).toBe(4);
});

test('phase-region boundaries: supercritical tint is bounded by the Pc isobar and Tc isotherm', async ({ page }) => {
  await openAndCompute(page);

  const geometry = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll('#chartPanel .chart-block')];
    const tsBlock = blocks.find((block) => block.textContent.includes('T-s Context'));
    const tsRegionPaths = [...tsBlock.querySelectorAll('.chart-phase-regions path')];
    // Region paths render in order: compressed liquid, superheated, supercritical.
    const supercriticalD = tsRegionPaths[2]?.getAttribute('d') || '';
    // A boundary-following polygon has many line segments; the legacy
    // full-width band had exactly 4 corner points.
    const segmentCount = (supercriticalD.match(/L /g) || []).length;
    return { tsRegionPathCount: tsRegionPaths.length, segmentCount };
  });

  expect(geometry.tsRegionPathCount).toBe(3);
  expect(geometry.segmentCount).toBeGreaterThan(10);
});

test('action menus close after picking an item, on outside click, and on Escape', async ({ page }) => {
  await openAndCompute(page);

  const menuFor = (buttonId) => `details.action-menu:has(#${buttonId})`;

  // Picking a menu item closes the menu.
  await page.click(`${menuFor('pinStateABtn')} summary`);
  await expect(page.locator(menuFor('pinStateABtn'))).toHaveAttribute('open', '');
  await page.click('#pinStateABtn');
  await expect(page.locator(menuFor('pinStateABtn'))).not.toHaveAttribute('open', '');

  // Clicking outside closes the menu.
  await page.click(`${menuFor('pinStateABtn')} summary`);
  await expect(page.locator(menuFor('pinStateABtn'))).toHaveAttribute('open', '');
  await page.click('h1');
  await expect(page.locator(menuFor('pinStateABtn'))).not.toHaveAttribute('open', '');

  // Escape closes the menu.
  await page.click(`${menuFor('pinStateABtn')} summary`);
  await expect(page.locator(menuFor('pinStateABtn'))).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(page.locator(menuFor('pinStateABtn'))).not.toHaveAttribute('open', '');
});
