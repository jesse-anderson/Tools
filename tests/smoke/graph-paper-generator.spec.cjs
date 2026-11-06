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

async function openEngine(page, baseURL) {
  await expectPageToLoadCleanly(page, baseURL, '/tools/graph-paper-generator.html');
  await expect.poll(() => page.evaluate(() => typeof window.GraphPaperEngine)).toBe('object');
}

test('graph paper engine picks round tick steps that cover the requested range', async ({ page, baseURL }) => {
  await openEngine(page, baseURL);
  const result = await page.evaluate(() => {
    const E = window.GraphPaperEngine;
    return {
      steps: [1, 1.11, 0.77, 3.33, 2.4, 0.0123, 7, 12].map((v) => E.niceStep(v)),
      corner: E.buildAxisTicks({ min: 0, max: 10, intervals: 35, majorEvery: 5 }),
      offset: E.buildAxisTicks({ min: 3, max: 10, intervals: 20, majorEvery: 5 }),
      centered: E.buildAxisTicks({ min: -10, max: 10, intervals: 30, majorEvery: 5, centered: true }),
      tooFew: E.buildAxisTicks({ min: -10, max: 10, intervals: 6, majorEvery: 5, centered: true }),
      labels: [[7.5, 2.5], [0.1 + 0.2, 0.1], [-15, 5], [0, 2], [2e6, 1e6], [0.25, 0.05]].map(([v, s]) => E.formatTickValue(v, s))
    };
  });

  expect(result.steps).toEqual([1, 2, 1, 5, 2.5, 0.02, 10, 20]);
  // 0 to 10 over 7 majors needs 1.43 per major; the round step is 2.
  expect(result.corner.step).toBe(2);
  expect(result.corner.ticks.map((t) => t.value)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
  expect(result.corner.ticks.map((t) => t.index)).toEqual([0, 5, 10, 15, 20, 25, 30, 35]);
  expect(result.offset.ticks.map((t) => t.value)).toEqual([3, 5, 7, 9, 11]);
  expect(result.centered.step).toBe(5);
  expect(result.centered.ticks.map((t) => t.value)).toEqual([-15, -10, -5, 0, 5, 10, 15]);
  expect(result.centered.ticks.find((t) => t.value === 0).index).toBe(15);
  expect(result.tooFew).toEqual({ step: null, ticks: [{ index: 3, value: 0 }] });
  expect(result.labels).toEqual(['7.5', '0.3', '-15', '0', '2e+6', '0.25']);
});

for (const template of ['cornerAxes', 'centerAxes']) {
  test(`graph paper engine draws one origin label and centers every label on its tick (${template})`, async ({ page, baseURL }) => {
    await openEngine(page, baseURL);
    const scene = await page.evaluate((t) => {
      const E = window.GraphPaperEngine;
      const s = E.buildScene(E.normalizeState({ template: t }));
      return { axes: s.axes, grid: s.grid, page: s.page, spacing: s.spacingPt, cap: E.capHeight(8, 'mono'), warnings: s.warnings };
    }, template);
    const { axes, grid, cap } = scene;
    const labels = axes.labels;

    expect(scene.warnings).toEqual([]);
    if (template === 'cornerAxes') {
      expect(axes.origin).toEqual({ x: grid.x, y: grid.bottom });
    } else {
      // The origin is a grid intersection within half an interval of page center.
      expect(Math.abs(axes.origin.x - (scene.page.width / 2))).toBeLessThanOrEqual(scene.spacing / 2);
      expect(Math.abs(axes.origin.y - (scene.page.height / 2))).toBeLessThanOrEqual(scene.spacing / 2);
      expect(axes.x.ticks.map((t) => t.value)).toEqual(axes.x.ticks.map((t) => 0 - t.value + 0).reverse());
      expect(axes.y.ticks.map((t) => t.value)).toEqual(axes.y.ticks.map((t) => 0 - t.value + 0).reverse());
    }

    // Exactly one "0", tucked below-left of the origin and clear of both axes.
    expect(labels.filter((l) => l.text === '0')).toHaveLength(1);
    const zero = labels.find((l) => l.axis === 'origin');
    expect(zero.anchor).toBe('end');
    expect(zero.x).toBeLessThan(axes.origin.x);
    expect(zero.y - cap).toBeGreaterThan(axes.origin.y);

    // Every tick value sits on the step grid.
    for (const axis of ['x', 'y']) {
      const first = axes[axis].ticks[0].value;
      for (const tick of axes[axis].ticks) {
        const k = (tick.value - first) / axes[axis].step;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
      }
    }

    const xLabels = labels.filter((l) => l.axis === 'x');
    const yLabels = labels.filter((l) => l.axis === 'y');
    expect(new Set(xLabels.map((l) => l.y)).size).toBe(1);
    expect(xLabels[0].y - cap).toBeGreaterThan(axes.origin.y);
    for (const label of xLabels) {
      const tick = axes.x.ticks.find((t) => t.value === label.value);
      expect(label.anchor).toBe('middle');
      expect(label.x).toBeCloseTo(tick.x, 6);
    }
    for (const label of yLabels) {
      const tick = axes.y.ticks.find((t) => t.value === label.value);
      expect(label.anchor).toBe('end');
      expect(label.x).toBeLessThan(axes.origin.x);
      // Baseline half a cap height below the tick puts the digits' center on it.
      expect(label.y - (cap / 2)).toBeCloseTo(tick.y, 6);
    }
    expect(xLabels.length + yLabels.length + 1).toBe(axes.x.ticks.length + axes.y.ticks.length - 1);
  });
}

test('graph paper engine keeps separate corner labels when the axes do not both start at zero', async ({ page, baseURL }) => {
  await openEngine(page, baseURL);
  const labels = await page.evaluate(() => {
    const E = window.GraphPaperEngine;
    return E.buildScene(E.normalizeState({ template: 'cornerAxes', xMin: 5, xMax: 50, yMin: 0, yMax: 10 })).axes.labels;
  });
  expect(labels.find((l) => l.axis === 'origin')).toBeUndefined();
  expect(labels.find((l) => l.axis === 'x').text).toBe('5');
  expect(labels.find((l) => l.axis === 'y').text).toBe('0');
});

test('graph paper scale summary follows the spacing, with and without a drawing scale', async ({ page, baseURL }) => {
  await openEngine(page, baseURL);
  const summaries = await page.evaluate(() => {
    const E = window.GraphPaperEngine;
    const s = (over) => E.buildScaleSummary(E.normalizeState(over));
    return {
      dot20: s({ template: 'dotGrid' }),
      dot25: s({ template: 'dotGrid', minorSpacingIn: 0.25 }),
      scaled: s({ template: 'dotGrid', minorSpacingIn: 0.25, includeScaleNote: true, scaleValue: 1, scaleUnit: 'in' }),
      enlarged: s({ template: 'cartesian', minorSpacingIn: 0.5, includeScaleNote: true, scaleValue: 2.54, scaleUnit: 'mm' }),
      iso: s({ template: 'isometricDots', includeScaleNote: true, scaleValue: 1, scaleUnit: 'ft' }),
      note: E.buildScaleNoteText(E.normalizeState({ template: 'cartesian', includeScaleNote: true, scaleValue: 1, scaleUnit: 'in' }))
    };
  });

  expect(summaries.dot20.primary).toBe('1 dot interval = 0.2 in');
  expect(summaries.dot25.primary).toBe('1 dot interval = 0.25 in');
  expect(summaries.dot25.detail).toContain('6.35 mm');
  expect(summaries.scaled.primary).toBe('1 dot interval = 1 in (1:4)');
  // 0.5 in drawn for 0.1 in real is a 5x enlargement.
  expect(summaries.enlarged.ratioText).toBe('5:1');
  expect(summaries.iso.ratioText).toBe('1:60');
  expect(summaries.iso.detail).not.toContain('box');
  expect(summaries.note).toBe('Scale 1:5: 1 interval = 1 in; 1 box = 1 in^2. Print at 100%.');
});

test('graph paper scale card updates when dot spacing changes', async ({ page, baseURL }) => {
  await openEngine(page, baseURL);
  await page.selectOption('#templateSelect', 'dotGrid');
  await expect(page.locator('#scaleStat')).toHaveText('1 dot interval = 0.2 in');
  await expect(page.locator('#scaleValueInput')).toBeDisabled();

  await page.fill('#minorSpacingInput', '0.25');
  await page.locator('#minorSpacingInput').blur();
  await expect(page.locator('#scaleStat')).toHaveText('1 dot interval = 0.25 in');

  await page.locator('.advanced-panel summary').click();
  await page.check('#includeScaleNoteCheck');
  await expect(page.locator('#scaleValueInput')).toBeEnabled();
  await expect(page.locator('#scaleStat')).toHaveText('1 dot interval = 1 in (1:4)');

  await page.fill('#minorSpacingInput', '0.5');
  await page.locator('#minorSpacingInput').blur();
  await expect(page.locator('#scaleStat')).toHaveText('1 dot interval = 1 in (1:2)');
});

test('graph paper engine warns about overlapping dots and crowded footers', async ({ page, baseURL }) => {
  await openEngine(page, baseURL);
  const warnings = await page.evaluate(() => {
    const E = window.GraphPaperEngine;
    const w = (over) => E.buildScene(E.normalizeState(over)).warnings;
    return {
      dots: w({ template: 'dotGrid', minorSpacingIn: 0.1, dotRadiusPt: 4 }),
      dotsOk: w({ template: 'dotGrid' }),
      footer: w({ template: 'cornerAxes', marginIn: 0.4, footerText: 'Rev A\nOwner' }),
      footerOk: w({ template: 'cornerAxes', marginIn: 0.8, footerText: 'Rev A\nOwner' }),
      header: w({ template: 'cartesian', marginIn: 0.2, headerText: 'Title\nSubtitle' })
    };
  });
  expect(warnings.dots.join(' ')).toContain('Dots touch or overlap');
  expect(warnings.dotsOk).toEqual([]);
  expect(warnings.footer.join(' ')).toContain('clear the axis labels');
  expect(warnings.footerOk).toEqual([]);
  expect(warnings.header.join(' ')).toContain('Header text needs a larger margin');
});

test('graph paper PDF places label text with the same anchors as the preview', async ({ page, baseURL }) => {
  await openEngine(page, baseURL);
  const result = await page.evaluate(() => {
    const E = window.GraphPaperEngine;
    const scene = E.buildScene(E.normalizeState({ template: 'centerAxes', headerText: "It's `ok`" }));
    const pdf = E.buildPdf(scene);
    const label = scene.axes.labels.find((l) => l.axis === 'x' && l.value === 5);
    const expectedX = Number.parseFloat((label.x - (E.measureText(label.text, 8, 'mono') / 2)).toFixed(3));
    const expectedY = Number.parseFloat((scene.page.height - label.y).toFixed(3));
    return { pdf, expected: `1 0 0 1 ${expectedX} ${expectedY} Tm\n(5) Tj`, bold: E.measureText('Lab 4', 10, 'bold') };
  });
  expect(result.pdf).toContain(result.expected);
  expect(result.pdf).toContain('/BaseFont /Courier /Encoding /WinAnsiEncoding');
  expect(result.pdf).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding');
  expect(result.pdf).toContain("(It's `ok`) Tj");
  // Label knockouts are filled white rectangles.
  expect(result.pdf).toMatch(/1\.000 1\.000 1\.000 rg\n[\d.\s]+ re\nf/);
  // Helvetica-Bold AFM: L 611, a 556, b 611, space 278, 4 556.
  expect(result.bold).toBeCloseTo((611 + 556 + 611 + 278 + 556) / 100, 9);
});
