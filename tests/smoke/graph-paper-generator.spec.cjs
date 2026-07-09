// Graph paper generator: default geometry + vector PDF export, imported-setting
// normalization, template controls with sanitized annotation text, and
// save/load resilience when local storage is unavailable.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly, readDownloadText } = require('./helpers.cjs');

test('graph paper generator renders default geometry and exports vector PDF', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/graph-paper-generator.html');

  await expect(page.locator('#templateBadge')).toHaveText('Cartesian grid');
  await expect(page.locator('#paperBadge')).toHaveText('Letter portrait');
  await expect(page.locator('#printableAreaStat')).toHaveText('7.7 x 10.2 in');
  await expect(page.locator('#pitchStat')).toHaveText('0.2 in / 14.4 pt');
  await expect(page.locator('#countStat')).toHaveText('36 cols x 51 rows');
  await expect(page.locator('#paperPreview')).toHaveAttribute('viewBox', '0 0 612 792');
  await expect(page.locator('#paperPreview line')).toHaveCount(87);

  await page.selectOption('#orientationSelect', 'landscape');
  await expect(page.locator('#paperPreview')).toHaveAttribute('viewBox', '0 0 792 612');

  const downloadPromise = page.waitForEvent('download');
  await page.click('#downloadPdfBtn');
  const download = await downloadPromise;
  const pdf = await readDownloadText(download);

  expect(download.suggestedFilename()).toBe('graph-paper-cartesian-letter-landscape.pdf');
  expect(pdf.startsWith('%PDF-1.4')).toBeTruthy();
  expect(pdf).toContain('/MediaBox [0 0 792 612]');
  expect(pdf).toContain('xref');
  expect(pdf.trimEnd().endsWith('%%EOF')).toBeTruthy();
});

test('graph paper generator normalizes imported settings and axis ranges', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/graph-paper-generator.html');

  const importedSettings = {
    tool: 'graph-paper-generator',
    version: 1,
    settings: {
      template: 'centerAxes',
      paperSize: 'a4',
      orientation: 'landscape',
      palette: 'forest',
      minorSpacingIn: 9,
      majorEvery: 99,
      marginIn: -1,
      useCustomColors: 'false',
      includeScaleNote: 'false',
      xMin: 0,
      xMax: 0,
      yMin: 0,
      yMax: 0
    }
  };

  await page.setInputFiles('#importSettingsInput', {
    name: 'graph-paper-settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedSettings), 'utf8')
  });

  await expect(page.locator('#templateSelect')).toHaveValue('centerAxes');
  await expect(page.locator('#paperSizeSelect')).toHaveValue('a4');
  await expect(page.locator('#orientationSelect')).toHaveValue('landscape');
  await expect(page.locator('#minorSpacingInput')).toHaveValue('1');
  await expect(page.locator('#majorEveryInput')).toHaveValue('10');
  await expect(page.locator('#marginInput')).toHaveValue('0.2');
  await expect(page.locator('#useCustomColorsCheck')).not.toBeChecked();
  await expect(page.locator('#includeScaleNoteCheck')).not.toBeChecked();
  await expect(page.locator('#xMinInput')).toHaveValue('-10');
  await expect(page.locator('#xMaxInput')).toHaveValue('10');
  await expect(page.locator('#yMinInput')).toHaveValue('-10');
  await expect(page.locator('#yMaxInput')).toHaveValue('10');
  await expect(page.locator('#statusLine')).toContainText('Imported settings from graph-paper-settings.json.');
});

test('graph paper generator switches template controls and sanitizes PDF annotation text', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/graph-paper-generator.html');

  await page.selectOption('#templateSelect', 'dotGrid');
  await expect(page.locator('.grid-only').first()).toBeHidden();
  await expect(page.locator('.dot-only').first()).toBeVisible();
  await expect(page.locator('#countStat')).toContainText('cols x');
  await expect(page.locator('#countStat')).toHaveAttribute('title', /dots/);

  await page.locator('.advanced-panel summary').click();
  await page.fill('#headerTextInput', '“Flow”—test…\nΔ pressure');
  await page.locator('#headerTextInput').blur();
  await expect(page.locator('#headerTextInput')).toHaveValue('"Flow"-test...\npressure');

  const downloadPromise = page.waitForEvent('download');
  await page.click('#downloadPdfBtn');
  const download = await downloadPromise;
  const pdf = await readDownloadText(download);

  expect(pdf).toContain('("Flow"-test...) Tj');
  expect(pdf).toContain('(pressure) Tj');
});

test('graph paper generator save/load survives unavailable local storage reads', async ({ page, baseURL }) => {
  await page.addInitScript(() => window.localStorage.clear());
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await expectPageToLoadCleanly(page, baseURL, '/tools/graph-paper-generator.html');

  await page.selectOption('#templateSelect', 'isometricDots');
  await page.selectOption('#paperSizeSelect', 'legal');
  await page.click('#saveTemplateBtn');
  await page.click('#resetBtn');
  await expect(page.locator('#templateSelect')).toHaveValue('cartesian');

  await page.click('#loadTemplateBtn');
  await expect(page.locator('#templateSelect')).toHaveValue('isometricDots');
  await expect(page.locator('#paperSizeSelect')).toHaveValue('legal');

  await page.evaluate(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItemWithFailure(key) {
      if (key === 'graphPaperGenerator.savedTemplate') {
        throw new Error('simulated storage read failure');
      }
      return originalGetItem.call(this, key);
    };
  });

  await page.click('#loadTemplateBtn');
  await expect(page.locator('#statusLine')).toHaveText('Saved template could not be loaded.');
  expect(pageErrors).toEqual([]);
});
