// Runs the steam tables tool's built-in consistency checks (the "Run Tests"
// button, js/steam_tables/self-tests.js) in CI. The engine verifies vendored
// CSV row counts, exact-row and midpoint interpolation, critical point
// constants, reverse round trips, and table gap handling.
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
