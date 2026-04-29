const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..', '..');
const toolsIndexPath = path.join(repoRoot, 'tools.html');
const toolsIndexMarkup = fs.readFileSync(toolsIndexPath, 'utf8');

function extractToolPaths(markup) {
  const toolPaths = new Set();
  const anchorTags = markup.match(/<a\b[^>]*>/gi) || [];

  for (const tag of anchorTags) {
    const hrefMatch = tag.match(/\bhref\s*=\s*"([^"]+)"/i);
    const classMatch = tag.match(/\bclass\s*=\s*"([^"]+)"/i);

    if (!hrefMatch || !classMatch) {
      continue;
    }

    const classNames = classMatch[1].split(/\s+/);
    const href = hrefMatch[1].trim();

    if (!classNames.includes('tool-card')) {
      continue;
    }

    if (!href.startsWith('tools/') || !href.endsWith('.html')) {
      continue;
    }

    toolPaths.add(`/${href.replace(/\\/g, '/')}`);
  }

  return Array.from(toolPaths).sort();
}

function getSectionMarkup(markup, sectionTitle) {
  const sections = markup.match(/<section class="category-section">[\s\S]*?<\/section>/g) || [];
  return sections.find((section) => section.includes(`<h2 class="category-title">${sectionTitle}</h2>`)) || '';
}

function extractToolNamesFromSection(sectionMarkup) {
  return Array.from(sectionMarkup.matchAll(/<h3 class="tool-name">([^<]+)<\/h3>/g), (match) => match[1].trim());
}

function extractToolHrefsFromSection(sectionMarkup) {
  return Array.from(sectionMarkup.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*class="[^"]*\btool-card\b[^"]*"/g), (match) => match[1].trim());
}

const toolPaths = extractToolPaths(toolsIndexMarkup);

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function shouldIgnoreConsoleError(message) {
  const ignoredPatterns = [
    /favicon\.ico/i
  ];

  return ignoredPatterns.some((pattern) => pattern.test(message));
}

function isCriticalFailedRequest(request, baseURL) {
  const url = request.url();
  const failure = request.failure();

  if (!failure || !/^https?:/i.test(url)) {
    return false;
  }

  const resourceType = request.resourceType();
  const baseOrigin = new URL(baseURL).origin;
  const sameOrigin = url.startsWith(baseOrigin);

  if (sameOrigin && ['document', 'script', 'stylesheet', 'worker'].includes(resourceType)) {
    return true;
  }

  if (['script', 'worker'].includes(resourceType)) {
    return true;
  }

  return /\.wasm(?:[?#]|$)/i.test(url);
}

function attachDiagnostics(page, baseURL) {
  const diagnostics = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: []
  };

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(normalizeText(error.stack || error.message));
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }

    const text = normalizeText(message.text());
    if (shouldIgnoreConsoleError(text)) {
      return;
    }

    diagnostics.consoleErrors.push(text);
  });

  page.on('requestfailed', (request) => {
    if (!isCriticalFailedRequest(request, baseURL)) {
      return;
    }

    const failure = request.failure();
    diagnostics.failedRequests.push(
      `${request.resourceType().toUpperCase()} ${request.url()} :: ${failure ? failure.errorText : 'request failed'}`
    );
  });

  return diagnostics;
}

function formatDiagnostics(urlPath, diagnostics) {
  const sections = [];

  if (diagnostics.pageErrors.length) {
    sections.push(`Page errors:\n- ${diagnostics.pageErrors.join('\n- ')}`);
  }

  if (diagnostics.consoleErrors.length) {
    sections.push(`Console errors:\n- ${diagnostics.consoleErrors.join('\n- ')}`);
  }

  if (diagnostics.failedRequests.length) {
    sections.push(`Failed critical requests:\n- ${diagnostics.failedRequests.join('\n- ')}`);
  }

  return [`Smoke check failed for ${urlPath}`, ...sections].join('\n\n');
}

function countMatchingWeekdays(startIso, endIso, allowedWeekdays) {
  const allowed = new Set(allowedWeekdays);
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  let count = 0;

  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (allowed.has(cursor.getDay())) {
      count += 1;
    }
  }

  return count;
}

async function expectPageToLoadCleanly(page, baseURL, urlPath) {
  const diagnostics = attachDiagnostics(page, baseURL);
  const response = await page.goto(urlPath, { waitUntil: 'load' });

  expect(response, `No response received for ${urlPath}`).not.toBeNull();
  expect(response.ok(), `${urlPath} returned HTTP ${response.status()}`).toBeTruthy();

  await page.waitForTimeout(1200);

  expect(
    diagnostics.pageErrors.length + diagnostics.consoleErrors.length + diagnostics.failedRequests.length,
    formatDiagnostics(urlPath, diagnostics)
  ).toBe(0);
}

async function getPlannerStatValue(page, label) {
  return page.evaluate((wantedLabel) => {
    const cards = Array.from(document.querySelectorAll('#statsGrid .stat-card'));
    const match = cards.find((card) => {
      const cardLabel = card.querySelector('.label')?.textContent?.trim();
      return cardLabel === wantedLabel;
    });

    return match?.querySelector('.value')?.textContent?.trim() || null;
  }, label);
}

async function createLamportEvent(page, { processId, type, counterpartyId = null, messageId = '' }) {
  await page.selectOption('#eventProcessSelect', String(processId));
  await page.locator(`.event-type-btn[data-type="${type}"]`).click();

  if (counterpartyId !== null) {
    await page.selectOption('#counterpartySelect', String(counterpartyId));
  }

  await page.fill('#messageIdInput', messageId);
  await page.click('#addEventBtn');
}

async function getLamportProcessStateText(page, processName) {
  return page.evaluate((wantedProcess) => {
    const cards = Array.from(document.querySelectorAll('#currentState .state-card'));
    const match = cards.find((card) => card.querySelector('.state-process-name')?.textContent?.trim() === wantedProcess);
    return match ? match.textContent.replace(/\s+/g, ' ').trim() : null;
  }, processName);
}

async function getStatusBannerText(page) {
  return page.locator('#statusBanner').textContent();
}

async function getVisualIntegrationResultValue(page, seriesName) {
  return page.evaluate((wantedSeriesName) => {
    const results = Array.from(document.querySelectorAll('#resultsContainer .result-item'));
    const match = results.find((result) => {
      const label = result.querySelector('.result-name span')?.textContent?.trim();
      return label === wantedSeriesName;
    });

    return match?.querySelector('.result-value')?.textContent?.trim() || null;
  }, seriesName);
}

async function clickVisualIntegrationCanvasAt(page, nX, nY) {
  const canvas = page.locator('#integrationCanvas');
  const box = await canvas.boundingBox();
  expect(box, 'Expected the visual integration canvas to be visible.').not.toBeNull();

  await canvas.click({
    position: {
      x: Math.max(1, Math.min(box.width - 1, box.width * nX)),
      y: Math.max(1, Math.min(box.height - 1, box.height * nY))
    }
  });
}

async function getVisualIntegrationDrawnPixelCount(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('integrationCanvas');
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const stride = 64;
    let drawn = 0;

    for (let index = 3; index < pixels.length; index += stride * 4) {
      if (pixels[index] > 0) {
        drawn++;
      }
    }

    return drawn;
  });
}

async function readDownloadText(download) {
  const stream = await download.createReadStream();
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

const tinyPngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);
const fakePdfBuffer = Buffer.from('%PDF-1.4\n% visual integration smoke\n', 'utf8');

test('tools.html contains linked tool pages', () => {
  expect(toolPaths.length).toBeGreaterThan(0);
});

test('tools.html lists Lamport Timestamps under Educational instead of Database Tools', () => {
  const educationalSection = getSectionMarkup(toolsIndexMarkup, 'Educational');
  const databaseSection = getSectionMarkup(toolsIndexMarkup, 'Database Tools');

  expect(educationalSection).toContain('href="tools/lamport-timestamps.html"');
  expect(databaseSection).not.toContain('href="tools/lamport-timestamps.html"');
});

test('tools.html ends Biochemical Engineering Utilities with yogurt, species, then stoichiometry', () => {
  const biochemicalSection = getSectionMarkup(toolsIndexMarkup, 'Biochemical Engineering Utilities');
  const toolNames = extractToolNamesFromSection(biochemicalSection);

  expect(toolNames.slice(-3)).toEqual([
    'Yogurt CFU/g Estimator',
    'Species Doubling Reference',
    'Stoichiometry Calculator'
  ]);
});

test('tools.html places the AI section after Data Science with the expected tools', () => {
  const dataScienceSection = getSectionMarkup(toolsIndexMarkup, 'Data Science');
  const aiSection = getSectionMarkup(toolsIndexMarkup, 'AI');
  const itSection = getSectionMarkup(toolsIndexMarkup, 'IT & Coding Tools');

  expect(toolsIndexMarkup.indexOf('<h2 class="category-title">Data Science</h2>')).toBeLessThan(
    toolsIndexMarkup.indexOf('<h2 class="category-title">AI</h2>')
  );

  expect(extractToolHrefsFromSection(aiSection)).toEqual([
    'tools/ai-image-detector.html',
    'tools/face-blur.html',
    'tools/token-throughput-visualizer.html',
    'tools/local-llm-opex.html'
  ]);

  expect(dataScienceSection).not.toContain('href="tools/local-llm-opex.html"');
  expect(itSection).not.toContain('href="tools/ai-image-detector.html"');
  expect(itSection).not.toContain('href="tools/face-blur.html"');
  expect(itSection).not.toContain('href="tools/token-throughput-visualizer.html"');
});

test('tools.html lists Excel Formula Extractor under IT & Coding Tools', () => {
  const itSection = getSectionMarkup(toolsIndexMarkup, 'IT & Coding Tools');
  expect(itSection).toContain('href="tools/excel-formula-extractor.html"');
});

test('all linked tool pages exist on disk', () => {
  const missingPaths = toolPaths.filter((toolPath) => !fs.existsSync(path.join(repoRoot, toolPath.slice(1))));
  expect(missingPaths, `Missing tool pages referenced by tools.html:\n- ${missingPaths.join('\n- ')}`).toEqual([]);
});

test('tools.html loads without breaking errors', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools.html');
});

test('all linked tool pages load without breaking errors', async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(Math.max(120_000, toolPaths.length * 4_000));
  const failures = [];

  for (const toolPath of toolPaths) {
    const page = await browser.newPage();
    const diagnostics = attachDiagnostics(page, baseURL);

    try {
      await test.step(`${path.basename(toolPath)} loads without breaking errors`, async () => {
        const response = await page.goto(toolPath, { waitUntil: 'load' });

        if (!response) {
          failures.push({
            urlPath: toolPath,
            diagnostics: {
              pageErrors: ['No response received'],
              consoleErrors: diagnostics.consoleErrors.slice(),
              failedRequests: diagnostics.failedRequests.slice()
            }
          });
          return;
        }

        if (!response.ok()) {
          failures.push({
            urlPath: toolPath,
            diagnostics: {
              pageErrors: [`Returned HTTP ${response.status()}`],
              consoleErrors: diagnostics.consoleErrors.slice(),
              failedRequests: diagnostics.failedRequests.slice()
            }
          });
          return;
        }

        await page.waitForTimeout(1200);

        const issueCount =
          diagnostics.pageErrors.length +
          diagnostics.consoleErrors.length +
          diagnostics.failedRequests.length;

        if (issueCount > 0) {
          failures.push({
            urlPath: toolPath,
            diagnostics: {
              pageErrors: diagnostics.pageErrors.slice(),
              consoleErrors: diagnostics.consoleErrors.slice(),
              failedRequests: diagnostics.failedRequests.slice()
            }
          });
        }
      });
    } finally {
      if (!page.isClosed()) {
        try {
          await page.close();
        } catch (error) {
          // Ignore teardown races when Playwright already disposed the context.
        }
      }
    }
  }

  if (failures.length) {
    const failureReport = failures
      .map(({ urlPath, diagnostics }) => formatDiagnostics(urlPath, diagnostics))
      .join('\n\n---\n\n');

    await testInfo.attach('smoke-failures.txt', {
      body: Buffer.from(failureReport, 'utf8'),
      contentType: 'text/plain'
    });
  }

  expect(
    failures,
    failures.length
      ? failures.map(({ urlPath, diagnostics }) => formatDiagnostics(urlPath, diagnostics)).join('\n\n---\n\n')
      : 'All linked tool pages loaded cleanly.'
  ).toEqual([]);
});

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

test('visual integration loads example data and calculates expected AUC', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/visual-integration.html');

  await page.click('#loadExampleBtn');

  await expect(page.locator('#xMinVal')).toHaveValue('0');
  await expect(page.locator('#xMaxVal')).toHaveValue('10');
  await expect(page.locator('#yMinVal')).toHaveValue('-2');
  await expect(page.locator('#yMaxVal')).toHaveValue('12');
  await expect(page.locator('#baselineVal')).toHaveValue('0');

  await expect.poll(
    () => getVisualIntegrationResultValue(page, 'y = x^2 / 10'),
    { message: 'Expected the example data to calculate the trapezoidal AUC.' }
  ).toBe('33.375');

  await expect.poll(
    () => getVisualIntegrationDrawnPixelCount(page),
    { message: 'Expected the visual integration canvas to render grid/series pixels.' }
  ).toBeGreaterThan(0);
});

test('visual integration imports scientific numeric pairs and exports CSV results', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/visual-integration.html');

  await page.fill('#xMaxVal', '3');
  await page.fill('#yMinVal', '0');
  await page.fill('#yMaxVal', '10');
  await page.fill('#csvDataInput', '0,0\n1E0,1\n2,4\n3,9');
  await page.click('#importDataBtn');

  await expect.poll(
    () => getVisualIntegrationResultValue(page, 'Series 1'),
    { message: 'Expected imported points to calculate a trapezoidal AUC.' }
  ).toBe('9.5');

  const downloadPromise = page.waitForEvent('download');
  await page.click('#exportResultsBtn');
  const download = await downloadPromise;
  const csv = await readDownloadText(download);

  expect(download.suggestedFilename()).toBe('visual_integration_results.csv');
  expect(csv).toContain('summary,Series 1');
  expect(csv).toContain('point,Series 1');
  expect(csv).toContain(',1,1,');
  expect(csv).toContain(',3,9,');
});

test('visual integration adds visual points using the active calibration', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/visual-integration.html');

  await page.fill('#xMaxVal', '1');
  await page.fill('#yMinVal', '0');
  await page.fill('#yMaxVal', '1');

  await clickVisualIntegrationCanvasAt(page, 0.25, 0.75);
  await clickVisualIntegrationCanvasAt(page, 0.75, 0.25);

  await expect.poll(
    () => getVisualIntegrationResultValue(page, 'Series 1'),
    { message: 'Expected visual point placement to map through calibration and calculate AUC.' }
  ).toBe('0.25');
});

test('visual integration image upload works without createImageBitmap', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    try {
      delete window.createImageBitmap;
    } catch (error) {}

    try {
      Object.defineProperty(window, 'createImageBitmap', {
        value: undefined,
        configurable: true
      });
    } catch (error) {
      window.createImageBitmap = undefined;
    }
  });

  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/visual-integration.html');

  await page.setInputFiles('#bgUpload', {
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: tinyPngBuffer
  });

  await expect(page.locator('#clearBgBtn')).toBeVisible();
  await expect(page.locator('#btnSelectRoi')).toBeVisible();
  await expect(page.locator('#canvasOverlayText')).toHaveText('Image loaded. Calibrate axes before tracing visual points.');
  expect(dialogs).toEqual([]);
});

test('visual integration clamps PDF page controls while rendering uploads', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    window.pdfjsLib = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
          getPage: async (pageNum) => ({
            getViewport: ({ scale }) => ({
              width: 20 * scale,
              height: 12 * scale
            }),
            render: ({ canvasContext, viewport }) => {
              canvasContext.fillStyle = pageNum === 1 ? '#2563eb' : '#dc2626';
              canvasContext.fillRect(0, 0, viewport.width, viewport.height);
              return { promise: Promise.resolve() };
            }
          })
        })
      })
    };
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/visual-integration.html');

  await page.setInputFiles('#bgUpload', {
    name: 'mock.pdf',
    mimeType: 'application/pdf',
    buffer: fakePdfBuffer
  });

  await expect(page.locator('#pdfControls')).toBeVisible();
  await expect(page.locator('#pdfPage')).toHaveValue('1');
  await expect(page.locator('#pdfPageMeta')).toHaveText('1 / 2');
  await expect(page.locator('#btnPdfPrev')).toBeDisabled();
  await expect(page.locator('#btnPdfNext')).toBeEnabled();

  await page.fill('#pdfPage', '99');
  await page.dispatchEvent('#pdfPage', 'change');
  await expect(page.locator('#pdfPage')).toHaveValue('2');
  await expect(page.locator('#pdfPageMeta')).toHaveText('2 / 2');

  await page.fill('#pdfPage', '');
  await page.click('#btnPdfPrev');
  await expect(page.locator('#pdfPage')).toHaveValue('1');
  await expect(page.locator('#pdfPageMeta')).toHaveText('1 / 2');
});

test('workweek planner counts long date ranges without truncation', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await page.selectOption('#selectionPreset', 'single');
  await page.selectOption('#dateMode', 'range');
  await page.selectOption('#groupingSelect', 'combined');
  await page.selectOption('#daysPerSheetSelect', '7');
  await page.fill('#rangeStartInput', '2026-01-01');
  await page.locator('#rangeStartInput').blur();
  await page.fill('#rangeEndInput', '2027-12-31');
  await page.locator('#rangeEndInput').blur();

  const expectedMondays = countMatchingWeekdays('2026-01-01', '2027-12-31', [1]);

  await expect.poll(
    () => getPlannerStatValue(page, 'Planner days'),
    { message: 'Expected the planner to include every matching Monday in the requested range.' }
  ).toBe(String(expectedMondays));
});

test('workweek planner wraps combined sheets by orientation instead of forcing one row', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await page.selectOption('#selectionPreset', 'fullweek');
  await page.selectOption('#groupingSelect', 'combined');
  await page.selectOption('#daysPerSheetSelect', '7');
  await page.selectOption('#orientationSelect', 'landscape');

  await expect.poll(
    () => page.locator('.planner-day-grid').first().getAttribute('style'),
    { message: 'Expected combined preview sheets to wrap into multiple rows in landscape mode.' }
  ).toContain('grid-template-columns: repeat(4');

  await expect.poll(
    () => page.locator('.planner-day-grid').first().getAttribute('style'),
    { message: 'Expected combined preview sheets to use more than one row when seven days share a sheet.' }
  ).toContain('grid-template-rows: repeat(2');
});

test('lamport vector mode keeps the local vector component distinct from the Lamport scalar clock', async ({ page, baseURL }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await expectPageToLoadCleanly(page, baseURL, '/tools/lamport-timestamps.html');

  await page.click('#clearLogBtn');

  const initialProcessCount = await page.locator('.process-remove').count();
  for (let index = 0; index < initialProcessCount; index += 1) {
    await page.locator('.process-remove').first().click();
  }

  await page.click('#addProcessBtn');
  await page.click('#addProcessBtn');
  await page.locator('.mode-btn[data-mode="vector"]').click();

  for (let index = 0; index < 9; index += 1) {
    await createLamportEvent(page, { processId: 1, type: 'local' });
  }

  await createLamportEvent(page, { processId: 1, type: 'send', counterpartyId: 2 });
  await createLamportEvent(page, { processId: 2, type: 'local' });
  await createLamportEvent(page, { processId: 2, type: 'receive', counterpartyId: 1 });

  await expect.poll(
    () => getLamportProcessStateText(page, 'P2'),
    { message: 'Expected the receive path to increment the vector clock by one, not overwrite it with the Lamport scalar timestamp.' }
  ).toContain('v = [10, 2]');
});

test('lamport event creation controls become usable when processes exist', async ({ page, baseURL }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await expectPageToLoadCleanly(page, baseURL, '/tools/lamport-timestamps.html');

  await expect(page.locator('#eventProcessSelect')).toBeEnabled();
  await expect(page.locator('#addEventBtn')).toBeDisabled();
});

test('lamport clear resets internal process clocks before the next event is created', async ({ page, baseURL }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await expectPageToLoadCleanly(page, baseURL, '/tools/lamport-timestamps.html');

  await page.click('#clearLogBtn');
  await createLamportEvent(page, { processId: 1, type: 'local' });

  await expect.poll(
    () => getLamportProcessStateText(page, 'P1'),
    { message: 'Expected the first event after Clear to restart the process clock at t = 1.' }
  ).toContain('t = 1');
});

test('lamport remove process recomputes surviving clocks before future events', async ({ page, baseURL }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await expectPageToLoadCleanly(page, baseURL, '/tools/lamport-timestamps.html');

  await page.click('#clearLogBtn');
  await page.locator('.process-remove[data-process-id="3"]').click();

  await createLamportEvent(page, { processId: 2, type: 'send', counterpartyId: 1 });
  await page.locator('.process-remove[data-process-id="1"]').click();
  await createLamportEvent(page, { processId: 1, type: 'local' });

  await expect.poll(
    () => getLamportProcessStateText(page, 'P1'),
    { message: 'Expected the first surviving event after deleting the message counterparty to restart from the recomputed clock state.' }
  ).toContain('t = 1');
});

test('workweek planner blocks direct print when the configuration is invalid', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await page.evaluate(() => {
    window.__printCalls = 0;
    window.print = () => {
      window.__printCalls += 1;
    };
  });

  for (const dayId of ['mon', 'tue', 'wed', 'thu', 'fri']) {
    await page.locator(`#dayGrid input[value="${dayId}"]`).uncheck();
  }

  await page.click('#printBtn');

  await expect.poll(
    () => page.evaluate(() => window.__printCalls),
    { message: 'Expected invalid planner settings to block the browser print dialog.' }
  ).toBe(0);

  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected invalid planner settings to surface a print error banner.' }
  ).toContain('Printing is unavailable until the planner configuration is valid.');
});

test('workweek planner does not show a false success message when saved-plan storage fails', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItemWithFailure(key, value) {
      if (key === 'workweekPlannerSaved') {
        throw new Error('simulated quota failure');
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await page.fill('#saveNameInput', 'Release check');
  await page.click('#savePlanBtn');

  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected saved-plan storage failures to keep the error banner visible.' }
  ).toContain('Saving failed. localStorage may be unavailable or full.');

  await expect(page.locator('#savedPlansList .saved-plan-item')).toHaveCount(0);
});

test('excel formula extractor demo surfaces hidden sheets, defined names, and external refs', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  await page.click('#loadDemoWorkbookBtn');

  await expect(page.locator('#fileNameValue')).toHaveText('demo-formulas.xlsx');
  await expect(page.locator('#sheetCountValue')).toHaveText('3');
  await expect(page.locator('#formulaCellsValue')).toHaveText('7');
  await expect(page.locator('#definedNamesValue')).toHaveText('3');
  await expect(page.locator('#hiddenSheetsValue')).toHaveText('1');
  await expect(page.locator('#externalLinksValue')).toHaveText('1');

  await expect(page.locator('#sheetsTable')).toContainText('Archive');
  await expect(page.locator('#sheetsTable')).toContainText('Very Hidden');
  await expect(page.locator('#formulasTable')).toContainText('Pricing.xlsx');
  await expect(page.locator('#definedNamesTable')).toContainText('QuotedRate');
  await expect(page.locator('#externalRefsList')).toContainText('Pricing.xlsx');
  await expect(page.locator('#formulaDump')).toHaveValue(/'Calc'!C2\t='\[Pricing\.xlsx\]Rates'!\$B\$2/);

  await page.selectOption('#sheetFilter', 'Archive');
  await expect(page.locator('#formulaRowsMeta')).toHaveText('1 shown of 1');
  await expect(page.locator('#formulasTable tbody tr')).toHaveCount(1);
  await expect(page.locator('#formulaDump')).toHaveValue("'Archive'!A1\t=Calc!B2*2");
});

test('excel formula extractor exports demo analysis and clears state', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  await page.click('#loadDemoWorkbookBtn');

  const jsonDownloadPromise = page.waitForEvent('download');
  await page.click('#downloadJsonBtn');
  const jsonDownload = await jsonDownloadPromise;
  const analysis = JSON.parse(await readDownloadText(jsonDownload));

  expect(jsonDownload.suggestedFilename()).toBe('demo-formulas-formula-analysis.json');
  expect(analysis.summary.formulaCount).toBe(7);
  expect(analysis.summary.nameCount).toBe(3);
  expect(analysis.externalLinks.map((entry) => entry.workbook)).toEqual(['Pricing.xlsx']);

  const formulaCsvDownloadPromise = page.waitForEvent('download');
  await page.click('#downloadFormulasCsvBtn');
  const formulaCsv = await readDownloadText(await formulaCsvDownloadPromise);
  expect(formulaCsv).toContain('sheet,cell,sheet_visibility,formula');
  // Leading apostrophe is appended by csvEscape to neutralize CSV formula injection (CWE-1236).
  expect(formulaCsv).toContain('Calc,C2,Visible,\'=\'[Pricing.xlsx]Rates\'!$B$2');

  const namesCsvDownloadPromise = page.waitForEvent('download');
  await page.click('#downloadNamesCsvBtn');
  const namesCsv = await readDownloadText(await namesCsvDownloadPromise);
  expect(namesCsv).toContain('name,scope_type,scope_sheet,scope_visibility,ref');
  expect(namesCsv).toContain('QuotedRate,Workbook,,Visible,\'[Pricing.xlsx]Rates\'!$B$2');

  const dumpDownloadPromise = page.waitForEvent('download');
  await page.click('#downloadDumpBtn');
  const dump = await readDownloadText(await dumpDownloadPromise);
  expect(dump).toContain("'Inputs'!C2\t=SUM(A2:B2)");
  expect(dump).toContain("'Calc'!C2\t='[Pricing.xlsx]Rates'!$B$2");

  await page.check('#externalOnlyToggle');
  await expect(page.locator('#formulaRowsMeta')).toHaveText('1 shown of 1');
  await expect(page.locator('#definedNamesMeta')).toHaveText('1 shown of 1');

  await page.click('#clearWorkbookBtn');
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(page.locator('#resultsContent')).toBeHidden();
  await expect(page.locator('#formulaRowsMeta')).toHaveText('0 shown of 0');
  await expect(page.locator('#formulaDump')).toHaveValue('');
  await expect(page.locator('#downloadJsonBtn')).toBeDisabled();
  await expect(page.locator('#statusBanner')).toHaveText('Waiting for a workbook or demo load.');
  await expect(page.locator('#statusBanner')).toHaveClass(/info/);
});

test('excel formula extractor rejects unsupported files and normalizes sheet visibility values', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  await page.click('#loadDemoWorkbookBtn');
  await expect(page.locator('#fileNameValue')).toHaveText('demo-formulas.xlsx');
  await expect(page.locator('#downloadJsonBtn')).toBeEnabled();

  await page.setInputFiles('#fileInput', {
    name: 'not-a-workbook.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('plain text', 'utf8')
  });

  await expect(page.locator('#statusBanner')).toHaveText('Unsupported workbook type: .txt. Use XLSX, XLSM, XLSB, or XLS.');
  await expect(page.locator('#statusBanner')).toHaveClass(/error/);
  await expect(page.locator('#resultsContent')).toBeHidden();
  await expect(page.locator('#fileNameValue')).toHaveText('--');
  await expect(page.locator('#formulaCellsValue')).toHaveText('0');
  await expect(page.locator('#downloadJsonBtn')).toBeDisabled();

  await page.evaluate(() => {
    window.ExcelFormulaExtractor.loadWorkbookForTest(
      {
        SheetNames: ['VisibleSheet', 'HiddenSheet', 'VeryHiddenSheet'],
        Sheets: {
          VisibleSheet: {
            '!ref': 'A1:A1',
            A1: { t: 'n', f: '1+1', v: 2, w: '2' }
          },
          HiddenSheet: {
            '!ref': 'A1:A1',
            A1: { t: 'n', f: 'VisibleSheet!A1*2', v: 4, w: '4' }
          },
          VeryHiddenSheet: {
            '!ref': 'A1:A1',
            A1: { t: 'n', f: 'HiddenSheet!A1*2', v: 8, w: '8' }
          }
        },
        Workbook: {
          Sheets: [
            { name: 'VisibleSheet', Hidden: '0' },
            { name: 'HiddenSheet', Hidden: '1' },
            { name: 'VeryHiddenSheet', Hidden: '2' }
          ],
          Names: []
        }
      },
      {
        name: 'visibility-demo.xlsx',
        source: 'Test Workbook'
      }
    );
  });

  await expect(page.locator('#hiddenSheetsValue')).toHaveText('2');
  await expect(page.locator('#sheetsTable')).toContainText('HiddenSheet');
  await expect(page.locator('#sheetsTable')).toContainText('Hidden');
  await expect(page.locator('#sheetsTable')).toContainText('Very Hidden');
  await expect(page.locator('#sheetFilter')).toContainText('HiddenSheet (Hidden)');
  await expect(page.locator('#sheetFilter')).toContainText('VeryHiddenSheet (Very Hidden)');
});

test('excel formula extractor parses an uploaded xlsx workbook through SheetJS', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  const workbookBytes = await page.evaluate(() => {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS did not load.');
    }

    const workbook = XLSX.utils.book_new();
    const calcSheet = XLSX.utils.aoa_to_sheet([
      ['Input', 'Output'],
      [2, null]
    ]);
    calcSheet.B2 = { t: 'n', f: 'A2*3', v: 6, w: '6' };

    const hiddenSheet = XLSX.utils.aoa_to_sheet([
      ['External'],
      [null]
    ]);
    hiddenSheet.A2 = { t: 'n', f: '\'[Rates.xlsx]Sheet1\'!$A$1', v: 9, w: '9' };

    XLSX.utils.book_append_sheet(workbook, calcSheet, 'Calc');
    XLSX.utils.book_append_sheet(workbook, hiddenSheet, 'HiddenCalc');
    workbook.Workbook = workbook.Workbook || {};
    workbook.Workbook.Sheets = [
      { name: 'Calc', Hidden: 0 },
      { name: 'HiddenCalc', Hidden: 1 }
    ];
    workbook.Workbook.Names = [
      { Name: 'ExternalRate', Ref: '\'[Rates.xlsx]Sheet1\'!$A$1' }
    ];

    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return Array.from(new Uint8Array(arrayBuffer));
  });

  await page.setInputFiles('#fileInput', {
    name: 'generated-formulas.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(workbookBytes)
  });

  await expect(page.locator('#fileNameValue')).toHaveText('generated-formulas.xlsx');
  await expect(page.locator('#sourceValue')).toHaveText('Uploaded Workbook');
  await expect(page.locator('#sheetCountValue')).toHaveText('2');
  await expect(page.locator('#formulaCellsValue')).toHaveText('2');
  await expect(page.locator('#definedNamesValue')).toHaveText('1');
  await expect(page.locator('#hiddenSheetsValue')).toHaveText('1');
  await expect(page.locator('#externalLinksValue')).toHaveText('1');
  await expect(page.locator('#sheetsTable')).toContainText('HiddenCalc');
  await expect(page.locator('#sheetsTable')).toContainText('Hidden');
  await expect(page.locator('#formulasTable')).toContainText('Rates.xlsx');
  await expect(page.locator('#definedNamesTable')).toContainText('ExternalRate');
  await expect(page.locator('#externalRefsList')).toContainText('Rates.xlsx');
});

test('excel formula extractor handles external refs with spaces, scoped names, csv escapes, and quoted dump sheet names', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  const externalCases = await page.evaluate(() => ({
    normal: window.ExcelFormulaExtractor.extractExternalWorkbooks("'[Book.xlsx]Sheet1'!$A$1"),
    sheetWithSpace: window.ExcelFormulaExtractor.extractExternalWorkbooks("'[Budget 2026.xlsx]Rates Sheet'!$A$1"),
    pathWithSpaceSheet: window.ExcelFormulaExtractor.extractExternalWorkbooks("'C:\\Models\\[Budget 2026.xlsx]Rates Sheet'!$A$1"),
    structuredRef: window.ExcelFormulaExtractor.extractExternalWorkbooks('SUM(Table1[Amount])')
  }));
  expect(externalCases).toEqual({
    normal: ['Book.xlsx'],
    sheetWithSpace: ['Budget 2026.xlsx'],
    pathWithSpaceSheet: ['Budget 2026.xlsx'],
    structuredRef: []
  });

  await page.evaluate(() => {
    window.ExcelFormulaExtractor.loadWorkbookForTest(
      {
        SheetNames: ["Bob's Sheet", 'Scoped Sheet'],
        Sheets: {
          "Bob's Sheet": {
            '!ref': 'A1:B1',
            A1: { t: 'n', f: "'[Budget 2026.xlsx]Rates Sheet'!$A$1", v: 7, w: '7' },
            B1: {
              t: 's',
              f: '"cached"',
              v: '\n=HYPERLINK("http://example.test")',
              w: '\n=HYPERLINK("http://example.test")'
            }
          },
          'Scoped Sheet': {
            '!ref': 'A1:A1',
            A1: { t: 'n', f: "'Bob''s Sheet'!A1*2", v: 14, w: '14' }
          }
        },
        Workbook: {
          Sheets: [
            { name: "Bob's Sheet", Hidden: 0 },
            { name: 'Scoped Sheet', Hidden: 1 }
          ],
          Names: [
            { Name: 'ScopedName', Ref: "'Scoped Sheet'!$A$1", Sheet: '1' }
          ]
        }
      },
      {
        name: 'edge-cases.xlsx',
        source: 'Test Workbook'
      }
    );
  });

  await expect(page.locator('#externalLinksValue')).toHaveText('1');
  await expect(page.locator('#formulasTable')).toContainText('Budget 2026.xlsx');
  await expect(page.locator('#externalRefsList')).toContainText('Budget 2026.xlsx');
  await expect(page.locator('#formulaDump')).toHaveValue(/'Bob''s Sheet'!A1\t='\[Budget 2026\.xlsx\]Rates Sheet'!\$A\$1/);

  const scopedName = await page.evaluate(() => (
    window.ExcelFormulaExtractor.getCurrentAnalysis().definedNames.find((row) => row.name === 'ScopedName')
  ));
  expect(scopedName.scopeType).toBe('Sheet');
  expect(scopedName.scopeSheetName).toBe('Scoped Sheet');
  expect(scopedName.scopeVisibility).toBe('Hidden');

  await page.selectOption('#sheetFilter', "Bob's Sheet");
  await expect(page.locator('#definedNamesMeta')).toHaveText('0 shown of 0');
  await page.selectOption('#sheetFilter', 'Scoped Sheet');
  await expect(page.locator('#definedNamesMeta')).toHaveText('1 shown of 1');

  const formulaCsvDownloadPromise = page.waitForEvent('download');
  await page.click('#downloadFormulasCsvBtn');
  const formulaCsv = await readDownloadText(await formulaCsvDownloadPromise);
  expect(formulaCsv).toContain(`"'\n=HYPERLINK(""http://example.test"")"`);
});

test('excel formula extractor limits large output sections to ten rows until expanded', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  await page.evaluate(() => {
    const sheetNames = [];
    const sheets = {};
    const workbookSheets = [];
    const names = [];

    for (let index = 1; index <= 12; index += 1) {
      const sheetName = `Sheet${index}`;
      sheetNames.push(sheetName);
      workbookSheets.push({ name: sheetName, Hidden: 0 });
      sheets[sheetName] = {
        '!ref': 'A1:C2',
        A1: { t: 's', v: `Label ${index}` },
        B1: { t: 'n', f: `'[Book${index}.xlsx]Rates'!$A$1`, v: index, w: String(index) },
        C1: { t: 'n', f: 'SUM(1,1)', v: 2, w: '2' }
      };
    }

    for (let index = 1; index <= 15; index += 1) {
      names.push({
        Name: `Metric${index}`,
        Ref: 'Sheet1!$A$1',
        Comment: `Comment ${index}`
      });
    }

    window.ExcelFormulaExtractor.loadWorkbookForTest(
      {
        SheetNames: sheetNames,
        Sheets: sheets,
        Workbook: {
          Sheets: workbookSheets,
          Names: names
        }
      },
      {
        name: 'large-demo.xlsx',
        source: 'Test Workbook'
      }
    );
  });

  await expect(page.locator('#sheetsMeta')).toHaveText('10 shown of 12');
  await expect(page.locator('#formulaRowsMeta')).toHaveText('10 shown of 24');
  await expect(page.locator('#definedNamesMeta')).toHaveText('10 shown of 15');
  await expect(page.locator('#externalRefsMeta')).toHaveText('10 shown of 12');
  await expect(page.locator('#formulaDumpMeta')).toHaveText('10 shown of 24 lines');

  await expect(page.locator('#sheetsTable tbody tr')).toHaveCount(10);
  await expect(page.locator('#formulasTable tbody tr')).toHaveCount(10);
  await expect(page.locator('#definedNamesTable tbody tr')).toHaveCount(10);
  await expect(page.locator('#externalRefsList .link-item')).toHaveCount(10);

  await expect(page.locator('#showMoreSheetsBtn')).toBeVisible();
  await expect(page.locator('#showMoreFormulasBtn')).toBeVisible();
  await expect(page.locator('#showMoreDefinedNamesBtn')).toBeVisible();
  await expect(page.locator('#showMoreExternalRefsBtn')).toBeVisible();
  await expect(page.locator('#showMoreDumpBtn')).toBeVisible();

  await page.click('#showAllSheetsBtn');
  await expect(page.locator('#sheetsTable tbody tr')).toHaveCount(12);

  await page.click('#showMoreFormulasBtn');
  await expect(page.locator('#formulaRowsMeta')).toHaveText('20 shown of 24');
  await expect(page.locator('#formulasTable tbody tr')).toHaveCount(20);

  await page.click('#showAllDefinedNamesBtn');
  await expect(page.locator('#definedNamesMeta')).toHaveText('15 shown of 15');
  await expect(page.locator('#definedNamesTable tbody tr')).toHaveCount(15);

  await page.click('#showMoreExternalRefsBtn');
  await expect(page.locator('#externalRefsMeta')).toHaveText('12 shown of 12');
  await expect(page.locator('#externalRefsList .link-item')).toHaveCount(12);

  await page.click('#showMoreDumpBtn');
  await expect(page.locator('#formulaDumpMeta')).toHaveText('20 shown of 24 lines');

  await page.click('#showAllFormulasBtn');
  await expect(page.locator('#formulaRowsMeta')).toHaveText('24 shown of 24');
  await expect(page.locator('#formulasTable tbody tr')).toHaveCount(24);

  await page.click('#showAllDumpBtn');
  await expect(page.locator('#formulaDumpMeta')).toHaveText('24 shown of 24 lines');
  await expect.poll(() => page.locator('#formulaDump').inputValue().then((value) => value.split('\n').filter(Boolean).length)).toBe(24);
});
