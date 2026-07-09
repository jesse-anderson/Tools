// Runs the steam tables tool's built-in consistency checks (the "Run Tests"
// button, js/steam_tables/self-tests.js) in CI, plus chart and action-menu
// regressions from the July 2026 review: full-range log-axis tick labels,
// phase-region tint boundaries (Pc isobar / Tc isotherm), and menus that
// close after picking an item.
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const TOOL_PATH = '/tools/steam-tables.html';

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

test('steam tables lookup computes states and passes internal consistency checks', async ({ page, baseURL }) => {
  test.setTimeout(45_000);
  await expectPageToLoadCleanly(page, baseURL, '/tools/steam-tables.html');

  await expect(page.locator('#statusBanner')).toContainText('Computed');
  await expect(page.locator('#resultPanel')).toContainText('Computed State');
  await expect(page.locator('#resultPanel')).toContainText('Pressure');
  await expect(page.locator('#resultPanel')).toContainText('101.42 kPa');
  await expect(page.locator('#phaseContextPanel')).toContainText('Saturation-region state');
  const headerPositions = await page.evaluate(() => {
    const back = document.querySelector('.steam-header-content .back-link').getBoundingClientRect();
    const toggle = document.querySelector('.steam-header-content .theme-toggle').getBoundingClientRect();
    const header = document.querySelector('.steam-header-content').getBoundingClientRect();
    return {
      backTop: back.top,
      backRight: back.right,
      toggleTop: toggle.top,
      toggleLeft: toggle.left,
      toggleRight: toggle.right,
      headerRight: header.right
    };
  });
  expect(headerPositions.toggleLeft).toBeGreaterThan(headerPositions.backRight);
  expect(Math.abs(headerPositions.toggleTop - headerPositions.backTop)).toBeLessThan(12);
  expect(headerPositions.headerRight - headerPositions.toggleRight).toBeLessThan(4);
  await expect(page.locator('#chartPanel')).toContainText('T-s Context');
  await expect(page.locator('#chartPanel')).toContainText('Mollier h-s Context');
  await expect(page.locator('#chartPanel')).toContainText('P-v Saturation Dome');
  await expect(page.locator('#chartPanel')).toContainText('P-T Saturation Curve');
  await expect(page.locator('#chartPanel svg.steam-chart')).toHaveCount(4);
  await expect(page.locator('#chartPanel')).toContainText('Current');
  await expect(page.locator('#chartPanel .chart-dome-line.liquid').first()).toHaveAttribute('d', /M /);
  await expect(page.locator('#chartPanel .chart-saturation-line')).toHaveAttribute('d', /M /);
  await expect(page.locator('#chartPanel .chart-isobar-line').first()).toHaveAttribute('d', /M /);
  const firstChart = page.locator('#chartPanel .chart-block').first();
  await expect(firstChart.locator('.chart-isobar-button')).toHaveCount(4);
  await firstChart.locator('.chart-isobar-button').first().click();
  await expect(firstChart.locator('.chart-isobar-line.selected')).toHaveCount(1);
  await expect(firstChart.locator('.chart-isobar-button.selected')).toHaveCount(1);
  await expect(firstChart.locator('.chart-detail')).toContainText('isobar');
  const isobarPointCount = await firstChart.locator('.chart-hover-point.isobar-0[data-chart-kind="point"]').count();
  expect(isobarPointCount).toBeGreaterThan(0);
  const firstIsobarPoint = firstChart.locator('.chart-hover-point.isobar-0[data-chart-kind="point"]').last();
  await firstIsobarPoint.scrollIntoViewIfNeeded();
  const firstIsobarPointBox = await firstIsobarPoint.boundingBox();
  expect(firstIsobarPointBox).not.toBeNull();
  await page.mouse.move(firstIsobarPointBox.x + firstIsobarPointBox.width / 2, firstIsobarPointBox.y + firstIsobarPointBox.height / 2);
  await expect(firstIsobarPoint).toHaveClass(/hovered/);
  await expect(firstChart.locator('.chart-isobar-line.isobar-0')).toHaveClass(/hovered/);
  await expect(firstChart.locator('.chart-isobar-button.isobar-0')).toHaveClass(/hovered/);
  await expect(firstChart.locator('.chart-detail')).toContainText('point');
  await expect(page.locator('#chartPanel .chart-marker.current').first()).toBeVisible();
  await expect(page.locator('#lookupMode optgroup[label="Reverse at fixed pressure"] option')).toHaveCount(4);

  await page.selectOption('#examplePreset', 'steam-1atm-200c');
  await expect(page.locator('#lookupMode')).toHaveValue('pt');
  await expect(page.locator('#resultPanel')).toContainText('Superheated Vapor');
  await expect(page.locator('#phaseContextPanel')).toContainText('Superheated above Tsat');
  const superheatedMarker = page.locator('#chartPanel .chart-marker.superheated-vapor').first();
  await expect(superheatedMarker).toBeVisible();
  await superheatedMarker.click();
  await expect(page.locator('#chartPanel .chart-marker.superheated-vapor.selected').first()).toBeVisible();
  await expect(firstChart.locator('.chart-detail')).toContainText('Superheated Vapor');
  await expect(page).toHaveURL(/mode=pt/);

  await page.selectOption('#lookupMode', 'satP');
  await expect(page.locator('#field-P')).toHaveValue('101.325');
  await page.selectOption('#pressureUnit', 'MPa');
  await expect(page.locator('#field-P')).toHaveValue('0.101325');
  await expect(page.locator('#resultPanel')).toContainText('0.101325 MPa');
  await page.selectOption('#pressureUnit', 'bar');
  await expect(page.locator('#field-P')).toHaveValue('1.01325');
  await expect(page.locator('#resultPanel')).toContainText('1.01325 bar');
  await page.selectOption('#pressureUnit', 'atm');
  await expect(page.locator('#field-P')).toHaveValue('1');
  await expect(page.locator('#resultPanel')).toContainText('1 atm');
  await page.selectOption('#pressureUnit', 'kPa');

  await page.selectOption('#lookupMode', 'pt');
  await page.fill('#field-T', '');
  await page.click('#computeBtn');
  await expect(page.locator('#statusBanner')).toContainText('Temperature is required');

  await page.fill('#field-P', '101.325');
  await page.fill('#field-T', '200');
  await page.click('#computeBtn');

  await expect(page.locator('#resultPanel')).toContainText('Superheated Vapor');
  await expect(page.locator('#tracePanel')).toContainText('Ragged P,T interpolation');
  await expect(page.locator('#tracePanel')).toContainText('Final h pressure blend');

  await page.locator('details.action-menu').filter({ hasText: 'Compare' }).locator('summary').click();
  await page.click('#pinStateABtn');
  await expect(page.locator('#comparisonPanel')).toContainText('State A');
  await expect(page.locator('#chartPanel')).toContainText('State A');
  await page.locator('details.action-menu').filter({ hasText: 'Export / Share' }).locator('summary').click();
  const csvDownloadPromise = page.waitForEvent('download');
  await page.click('#exportCsvBtn');
  const csvDownload = await csvDownloadPromise;
  const steamCsv = fs.readFileSync(await csvDownload.path(), 'utf8');
  expect(steamCsv).toContain('Steam Tables Lookup');
  expect(steamCsv).toContain('Enthalpy');
  // Menus now close themselves after an item is picked (July 2026 UX fix),
  // so each menu action below reopens its menu first.
  await expect(page.locator('details.action-menu').filter({ hasText: 'Export / Share' })).not.toHaveAttribute('open', '');

  await page.fill('#field-T', '250');
  await page.click('#computeBtn');
  await page.locator('details.action-menu').filter({ hasText: 'Compare' }).locator('summary').click();
  await page.click('#pinStateBBtn');
  await expect(page.locator('#comparisonPanel')).toContainText('Delta B - A');
  await expect(page.locator('#chartPanel')).toContainText('State B');
  await expect(page.locator('#comparisonPanel')).toContainText('Enthalpy');
  await expect(page.locator('#comparisonPanel')).toContainText('Temperature: 250 deg C');
  await page.locator('details.action-menu').filter({ hasText: 'Compare' }).locator('summary').click();
  await page.click('#swapStatesBtn');
  await expect(page.locator('#statusBanner')).toContainText('Swapped pinned states');
  await page.locator('details.action-menu').filter({ hasText: 'Compare' }).locator('summary').click();
  await page.click('#clearStatesBtn');
  await expect(page.locator('#comparisonPanel')).toContainText('Pin State A and State B');

  await page.selectOption('#unitSystem', 'us');
  await expect(page.locator('#pressureUnit')).toHaveValue('psia');
  await expect(page.locator('#pressureUnit option[value="atm"]')).toHaveCount(1);
  await page.selectOption('#lookupMode', 'pt');
  await page.selectOption('#pressureUnit', 'atm');
  await page.fill('#field-P', '1');
  await page.fill('#field-T', '500');
  await page.click('#computeBtn');
  await expect(page.locator('#resultPanel')).toContainText('1 atm');
  await page.selectOption('#pressureUnit', 'psia');
  await page.fill('#field-P', '200000');
  await page.fill('#field-T', '500');
  await page.click('#computeBtn');
  await expect(page.locator('#resultPanel')).toContainText('Pressure was clamped from');
  await expect(page.locator('#resultPanel')).toContainText('psia');
  await expect(page.locator('#resultPanel')).not.toContainText('MPa to');
  await page.fill('#field-P', '101526.416411');
  await page.fill('#field-T', '32');
  await page.click('#computeBtn');
  await expect(page.locator('#resultPanel')).toContainText('Table gap');
  await expect(page.locator('#resultPanel')).toContainText('T=32 deg F');
  await expect(page.locator('#resultPanel')).toContainText('P=101526.4 psia');
  await expect(page.locator('#resultPanel')).not.toContainText('deg C');
  await expect(page.locator('#resultPanel')).not.toContainText('MPa');
  await page.selectOption('#unitSystem', 'si');
  await page.selectOption('#pressureUnit', 'kPa');

  await page.selectOption('#lookupMode', 'revTh');
  await page.fill('#field-T', '200');
  await page.fill('#field-target', '1500');
  await page.click('#computeBtn');

  await expect(page.locator('#statusBanner')).toContainText('Computed');
  await expect(page.locator('#resultPanel')).toContainText('Two-Phase');
  await expect(page.locator('#resultPanel')).toContainText('Quality');
  await expect(page.locator('#tracePanel')).toContainText('Reverse two-phase bounds');
  await expect(page.locator('#tracePanel')).toContainText('x =');

  await page.selectOption('#lookupMode', 'revPu');
  await page.fill('#field-P', '101.325');
  await page.fill('#field-target', '2000');
  await page.click('#computeBtn');

  await expect(page.locator('#statusBanner')).toContainText('Computed');
  await expect(page.locator('#resultPanel')).toContainText('Internal energy');

  await page.selectOption('#lookupMode', 'revTu');
  await page.fill('#field-T', '200');
  await page.fill('#field-target', '2000');
  await page.click('#computeBtn');

  await expect(page.locator('#statusBanner')).toContainText('Computed');
  await expect(page.locator('#resultPanel')).toContainText('Internal energy');

  await page.selectOption('#lookupMode', 'pt');
  await page.fill('#field-P', '700000');
  await page.fill('#field-T', '0');
  await page.click('#computeBtn');

  await expect(page.locator('#resultPanel')).toContainText('Table gap');
  await expect(page.locator('#resultPanel')).toContainText('0 deg C');

  await page.locator('details.action-menu').filter({ hasText: 'Checks' }).locator('summary').click();
  await page.click('#runTestsBtn');
  await expect(page.locator('#testPanel .test-summary'), 'Steam internal tests should complete').toContainText('0 failed', { timeout: 15000 });
  await page.locator('#testPanel .test-row').first().click();
  await expect(page.locator('#testPanel .test-row').first()).toContainText('Confirms the parser loaded');
  await expect(page.locator('details.foldable-card').filter({ hasText: 'Engineering Disclaimer' })).toHaveCount(1);
});
