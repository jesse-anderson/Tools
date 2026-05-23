const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

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

test('tools.html lists Creatine Lab as experimental under Biochemical Engineering Utilities', () => {
  const biochemicalSection = getSectionMarkup(toolsIndexMarkup, 'Biochemical Engineering Utilities');
  const creatineCard = (biochemicalSection.match(/<a href="tools\/creatine-lab\.html"[\s\S]*?<\/a>/) || [])[0] || '';

  expect(creatineCard).toContain('<h3 class="tool-name">Creatine Lab</h3>');
  expect(creatineCard).toContain('<span class="tool-status coming">Experimental</span>');
  expect(creatineCard).toContain('<span class="tool-tag">creatine</span>');
});

test('tools.html lists Hormone Research Reference as experimental under Biochemical Engineering Utilities', () => {
  const biochemicalSection = getSectionMarkup(toolsIndexMarkup, 'Biochemical Engineering Utilities');
  const hormoneCard = (biochemicalSection.match(/<a href="tools\/hormone-research-reference\.html"[\s\S]*?<\/a>/) || [])[0] || '';

  expect(hormoneCard).toContain('<h3 class="tool-name">Hormone Research Reference</h3>');
  expect(hormoneCard).toContain('<span class="tool-status coming">Experimental</span>');
  expect(hormoneCard).toContain('<span class="tool-tag">hormones</span>');
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

test('tools.html renders expandable page statistics from current tool cards', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools.html');

  const toolCount = await page.locator('.category-section .tool-card').count();
  const categoryCount = await page.locator('.category-section').count();

  await expect(page.locator('#toolsStatsPanel')).toBeVisible();
  await expect(page.locator('#toolsStatsSummary')).toContainText(`${toolCount} tools`);

  await page.locator('#toolsStatsPanel summary').click();

  await expect(page.locator('#toolsStatsOverview')).toContainText('Total Tools');
  await expect(page.locator('#toolsStatsOverview')).toContainText(String(toolCount));
  await expect(page.locator('#toolsStatsOverview')).toContainText('Categories');
  await expect(page.locator('#toolsStatsOverview')).toContainText(String(categoryCount));
  await expect(page.locator('#toolsStatsOverview')).toContainText('Next Audit Target');
  await expect(page.locator('#toolsStatsCategories tbody tr')).toHaveCount(categoryCount);
  await expect(page.locator('#toolsStatsCategories')).toContainText('Engineering Calculators');
  await expect(page.locator('#toolsStatsCategories')).toContainText('Active %');
  await expect(page.locator('#toolsStatsCategories')).toContainText('Non-active');
  await expect(page.locator('#toolsStatsStatuses')).toContainText('Under Review');
  await expect(page.locator('#toolsStatsStatuses')).toContainText('%');
  await expect(page.locator('#toolsStatsTypes')).toContainText('Engineering');
  await expect(page.locator('#toolsStatsTags')).toContainText('battery');
  await expect(page.locator('#toolsStatsAuditNotes')).toContainText('tools are not marked Active');
});

test('creatine lab default bottle and small-glass presets compute solubility', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await expect(page.locator('h1')).toContainText('Creatine Lab');
  await expect(page.locator('#storageMode')).toHaveValue('premixed');
  await expect(page.locator('.scope-warning-block summary')).toContainText('Model Scope / Use At Your Own Risk');
  await expect(page.locator('.scope-warning-block')).not.toHaveAttribute('open', '');
  await page.locator('.scope-warning-block summary').click();
  await expect(page.locator('.scope-warning-block')).toContainText('No warranty. No liability. No suitability claim. You assume all risk.');
  await expect(page.locator('.tutorial-card summary')).toContainText('How To Use This Tool');
  await expect(page.locator('.tutorial-card')).not.toHaveAttribute('open', '');
  await page.locator('.tutorial-card summary').click();
  await expect(page.locator('.tutorial-card')).toHaveAttribute('open', '');
  await expect(page.locator('.tutorial-card')).toContainText('Start with the question');
  await expect(page.locator('.tutorial-card')).toContainText('Use this tool for three separate questions');
  await expect(page.locator('.tutorial-card')).toContainText('degradation rate affects dissolved creatine');
  await expect(page.locator('.tutorial-card')).toContainText('Default bottle is useful');
  await expect(page.locator('.tutorial-card')).toContainText('Suspended powder is not automatically wasted');
  await expect(page.locator('.tutorial-card')).toContainText('Only the premixed solution/suspension mode runs the aqueous degradation-rate calculation');
  await expect(page.locator('.tutorial-card')).toContainText('first estimates the dissolved amount at storage temperature');
  await expect(page.locator('.tutorial-card')).toContainText('recommend a dose');
  const missingInputHelp = await page.locator('.control-panel :is(.input-line, .check-line)').evaluateAll((rows) => rows
    .filter((row) => row.querySelector('input, select') && !row.querySelector('.help-chip'))
    .map((row) => (row.querySelector('span')?.textContent || row.textContent || '').trim()));
  expect(missingInputHelp).toEqual([]);
  const missingResultHelp = await page.locator('.result-grid .result-card').evaluateAll((cards) => cards
    .filter((card) => !card.querySelector('.result-label .help-chip'))
    .map((card) => (card.querySelector('.result-label')?.textContent || '').trim()));
  expect(missingResultHelp).toEqual([]);
  await expect(page.locator('.result-grid .help-chip')).toHaveCount(20);
  await expect(page.locator('#doseG + .unit-suffix')).toHaveText('g');
  await page.locator('[aria-describedby="help-doseG"]').hover();
  await expect(page.locator('#help-doseG')).toBeVisible();
  await expect(page.locator('#help-doseG')).toContainText('Grams of creatine monohydrate');
  await page.locator('#doseG').hover();
  await expect(page.locator('[aria-describedby="help-doseG"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#help-doseG')).toBeHidden();
  await page.locator('[aria-describedby="help-storageLossPercentValue"]').click();
  await expect(page.locator('[aria-describedby="help-storageLossPercentValue"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#help-storageLossPercentValue')).toContainText('dissolved fraction');
  await page.locator('#doseG').fill('5');
  await expect(page.locator('[aria-describedby="help-storageLossPercentValue"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#help-storageLossPercentValue')).toBeHidden();
  await expect(page.locator('#help-doseG')).toBeHidden();
  await page.locator('.advanced-panel summary').click();
  await expect(page.locator('#muscleCreatineGPerKg + .unit-suffix')).toHaveText('g/kg');
  await expect(page.locator('#endogenousGPerDay + .unit-suffix')).toHaveText('g/day');
  await page.locator('[aria-describedby="help-endogenousGPerDay"]').hover();
  await expect(page.locator('#help-endogenousGPerDay')).toBeVisible();
  await page.locator('#endogenousGPerDay').hover();
  await expect(page.locator('[aria-describedby="help-endogenousGPerDay"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#help-endogenousGPerDay')).toBeHidden();
  await expect(page.locator('#mixDissolvedValue')).toContainText('5.00 g');
  await expect(page.locator('#mixUndissolvedValue')).toContainText('0.00 g');

  await page.locator('[data-preset="smallGlass"]').click();
  await expect(page.locator('#storageMode')).toHaveValue('premixed');
  await expect(page.locator('#mixDissolvedValue')).toContainText('3.50 g');
  await expect(page.locator('#mixUndissolvedValue')).toContainText('1.50 g');
});

test('hormone research reference exposes disclaimer and reviewed source rows', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/hormone-research-reference.html');

  await expect(page.locator('h1')).toContainText('Hormone Research Reference');
  await expect(page.locator('#disclaimerSplash')).toBeVisible();
  await expect(page.locator('#disclaimerSplash')).toContainText('Research Reference Use Only');
  await expect(page.locator('#disclaimerSplash')).toContainText('will not use this page to identify, diagnose, rule out, prevent, monitor, manage, treat, or assess');
  await expect(page.locator('#disclaimerContinueBtn')).toBeDisabled();
  await page.locator('#disclaimerAcknowledge').check();
  await expect(page.locator('#disclaimerContinueBtn')).toBeEnabled();
  await page.locator('#disclaimerContinueBtn').click();
  await expect(page.locator('#disclaimerSplash')).toBeHidden();
  await expect(page.locator('.liability-banner')).toContainText('Experimental research reference only. Not medical advice.');
  await expect(page.locator('.liability-banner')).toContainText('ground truth');
  await expect(page.locator('body')).not.toContainText('Lab value');
  await expect(page.locator('body')).not.toContainText('Lab Context Input');
  await expect(page.locator('#referenceFilterForm input')).toHaveCount(0);
  await expect(page.locator('#sourceContext')).toBeEnabled();
  await expect(page.locator('#cyclePhase')).toBeEnabled();
  await expect(page.locator('#assayMethod')).toBeEnabled();
  await expect(page.locator('#referenceView')).toBeEnabled();
  await expect(page.locator('.scope-warning-block summary')).toContainText('Full Disclaimer / Use At Your Own Risk');
  await page.locator('.scope-warning-block summary').click();
  await expect(page.locator('.scope-warning-block')).toContainText('No warranty. No liability. No suitability claim. You assume all risk.');
  await expect(page.locator('.liability-banner')).toContainText('Source-Linked Rows');
  await expect(page.locator('#serumReferenceStatus')).toContainText('/ 294');
  await expect(page.locator('#phaseTableBody')).toContainText('Total testosterone');
  await expect(page.locator('#phaseTableBody')).toContainText('jcem_2017_travison_harmonized_testosterone');
  await expect(page.locator('#phaseTableBody a[href="https://doi.org/10.1210/jc.2016-2935"]').first()).toBeVisible();

  await page.selectOption('#analyteSelect', 'dhea');
  await expect(page.locator('#phaseTableBody')).toContainText('DHEA');
  await expect(page.locator('#phaseTableBody')).toContainText('clinchem_2010_kushnir_androstenedione_dhea_testosterone_lcms');
  await expect(page.locator('#phaseTableBody a[href="https://doi.org/10.1373/clinchem.2010.143222"]').first()).toBeVisible();

  await page.selectOption('#analyteSelect', 'cortisol');
  await expect(page.locator('#phaseTableBody')).toContainText('Cortisol');
  await expect(page.locator('#phaseTableBody')).toContainText('annlabmed_2026_liu_guangxi_reproductive_women_adrenocortical_hormone_reference_intervals');
  await expect(page.locator('#phaseTableBody a[href="https://doi.org/10.3343/alm.2025.0090"]').first()).toBeVisible();

  await page.selectOption('#analyteSelect', 'calculated_free_testosterone');
  await expect(page.locator('#phaseTableBody')).toContainText('Calculated free testosterone');
  await expect(page.locator('#phaseTableBody')).toContainText('jmsacl_2021_holmes_pediatric_testosterone_shbg_free_testosterone_quantile_reference_intervals');
  await expect(page.locator('#analyteWarningBlock')).toContainText('Free and bioavailable testosterone method context');
  await expect(page.locator('#analyteWarningBlock a[href="https://doi.org/10.1210/clinem/dgaf507"]').first()).toBeVisible();
  await expect(page.locator('#analyteWarningBlock a[href="https://doi.org/10.1210/jcem.84.10.6079"]').first()).toBeVisible();
  await expect(page.locator('#analyteWarningBlock a[href="https://www.ncbi.nlm.nih.gov/books/NBK279145/"]').first()).toBeVisible();
  await expect(page.locator('#phaseTableBody a[href="https://doi.org/10.1016/j.jmsacl.2021.10.005"]').first()).toBeVisible();

  await page.selectOption('#analyteSelect', 'estradiol_total');
  await page.selectOption('#referenceView', 'chart');
  await expect(page.locator('[data-view-panel="chart"]')).toBeVisible();
  await expect(page.locator('#cycleProfileChart')).toHaveAttribute('data-source-status', 'loaded');
  await expect(page.locator('#cycleProfileTableBody')).toContainText('156');
  await expect(page.locator('#cycleProfileTableBody')).toContainText('Source-reported cycle-day population percentiles');
  await expect(page.locator('#cycleProfileTableBody a[href="https://doi.org/10.6084/m9.figshare.10084145.v1"]').first()).toBeVisible();

  await page.selectOption('#analyteSelect', 'testosterone_total');
  await page.selectOption('#referenceView', 'production');
  await expect(page.locator('[data-view-panel="production"]')).toBeVisible();
  await expect(page.locator('#productionStatus')).toContainText('/ 26');
  await expect(page.locator('#productionTableBody')).toContainText('Total testosterone');
  await expect(page.locator('#productionTableBody')).toContainText('3 - 10 mg/day');
  await expect(page.locator('#productionTableBody')).toContainText('endotext_androgen_physiology');
  await expect(page.locator('#productionTableBody a[href="https://www.ncbi.nlm.nih.gov/books/NBK279000/"]').first()).toBeVisible();
  await page.selectOption('#analyteSelect', 'progesterone');
  await expect(page.locator('#productionTableBody')).toContainText('0.59 mg/day');
  await expect(page.locator('#productionTableBody')).toContainText('590 ug/day');
  await expect(page.locator('#productionTableBody')).toContainText('urinary pregnanediol-derived male production rates are invalid/discrepant');
  await expect(page.locator('#productionTableBody a[href="https://doi.org/10.1172/JCI105405"]').first()).toBeVisible();
  await expect(page.locator('#sourceAuditBody')).toContainText('Published papers, method documents, lab reports, and qualified clinical care override this page.');
  await expect(page.locator('#sourceAuditBody a[href="https://doi.org/10.6084/m9.figshare.10084145.v1"]').first()).toBeVisible();
  await expect(page.locator('#sourceAuditBody a[href="https://doi.org/10.1172/JCI105405"]').first()).toBeVisible();
});

test('creatine lab reports acidic premixed storage loss anchor', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="store"]').click();
  await page.selectOption('#storageMode', 'premixed');
  await page.fill('#storageTimeValue', '3');
  await page.selectOption('#storageTimeUnit', 'days');
  await page.fill('#storageTemperatureValue', '25');
  await page.selectOption('#phPreset', 'acidic');

  await expect(page.locator('#storageLossPercentValue')).toContainText('12.0%');
  await expect(page.locator('#storageLossPercentMeta')).toContainText('anchored');
  await page.click('#expandStorageChartBtn');
  await expect(page.locator('#chartOverlay')).toBeVisible();
  await expect(page.locator('#chartOverlayTitle')).toContainText('Dissolved Loss Over Storage');
  await expect(page.locator('#chartOverlaySummary')).toContainText('Dissolved loss reaches 12.0%');
  await expect(page.locator('#chartOverlayBody .chart-loss-line')).toHaveCount(1);
  await expect(page.locator('#chartOverlayBody .chart-hover')).toHaveCount(0);
  await page.click('#chartOverlayClose');
  await expect(page.locator('#chartOverlay')).toBeHidden();

  const storageDownloadPromise = page.waitForEvent('download');
  await page.click('#exportStoragePlotBtn');
  const storageDownload = await storageDownloadPromise;
  const storageSvg = await readDownloadText(storageDownload);
  expect(storageDownload.suggestedFilename()).toBe('creatine-lab-dissolved-loss-over-storage.svg');
  expect(storageSvg).toContain('<svg');
  expect(storageSvg).toContain('width="3200"');
  expect(storageSvg).toContain('height="1244"');
  expect(storageSvg).toContain('chart-loss-line');
  expect(storageSvg).toContain('Creatine Lab dissolved loss over storage plot');
});

test('creatine lab renders loading accumulation and Monte Carlo envelope', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await page.selectOption('#protocolPreset', 'load20');
  await page.fill('#simulationDays', '60');

  await expect(page.locator('#bodySaturationValue')).not.toContainText('0.0%');
  await expect(page.locator('#bodySaturationMeta')).toContainText('turnover 2.07 g/day baseline, 2.51 g/day current');
  await expect(page.locator('#bodySaturationMeta')).toContainText('background total 2.07 g/day');
  await expect(page.locator('#wastePressureValue')).toContainText('g/day');
  await expect(page.locator('#wastePressureMeta')).toContainText('10-90% range');
  await expect(page.locator('#monteCarloBandMeta')).toContainText('10-90%');
  await expect(page.locator('#steadyDoseValue')).toContainText('g/day');
  await expect(page.locator('#steadyDoseMeta')).toContainText('extra supplement to hold');
  await expect(page.locator('#creatinineOutputValue')).toContainText('g/day');
  await expect(page.locator('#equilibriumPoolValue')).toContainText('g');
  await expect(page.locator('#retentionEfficiencyValue')).toContainText('%');
  await expect(page.locator('#massBalanceMeta')).toContainText('background in');
  await expect(page.locator('#thresholdBody')).toContainText('90%');
  await expect(page.locator('#storageLossChart .chart-loss-line')).toHaveCount(1);
  await expect(page.locator('#accumulationChart .chart-line')).toHaveCount(1);
  await expect(page.locator('#accumulationChart .chart-steady-line')).toHaveCount(1);
  await expect(page.locator('#accumulationChart .chart-waste-line')).toHaveCount(1);
  // chart-waste-zone is the conditional red overlay above 100% saturation. The
  // calibrated default load20 + 5 g/d scenario peaks at ~96.5% (Hultman-anchored
  // Hill = 2 fit), so the zone correctly does not render here. The dose bump
  // below pushes the scenario past 100% to verify the zone code path.
  await expect(page.locator('#accumulationChart .chart-waste-zone')).toHaveCount(0);
  await expect(page.locator('#creatinineChart .chart-creatinine-line')).toHaveCount(1);
  await expect(page.locator('#fateChart .chart-retained-area')).toHaveCount(1);
  await expect(page.locator('#cumulativeChart .chart-cumulative-dose-line')).toHaveCount(1);
  await expect(page.locator('#chartSummary')).toContainText('Left axis shows saturation and dose pressure');
  await expect(page.locator('#accumulationChart')).toContainText('Left axis: saturation / dose pressure (%)');
  await expect(page.locator('#accumulationChart')).toContainText('Right axis: g/day');
  await expect(page.locator('#accumulationChart')).toContainText('waste pressure');
  await page.locator('#accumulationChart').hover({ position: { x: 360, y: 140 } });
  await expect(page.locator('#accumulationChart .chart-hover')).toHaveCSS('display', 'block');
  await expect(page.locator('#chartOverlay')).toBeHidden();
  await page.click('#expandChartBtn');
  await expect(page.locator('#chartOverlay')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/chart-overlay-open/);
  await expect(page.locator('#chartOverlayTitle')).toContainText('Estimated Saturation And Dose Pressure');
  await expect(page.locator('#chartOverlaySummary')).toContainText('Left axis shows saturation and dose pressure');
  await expect(page.locator('#chartOverlayBody .chart-line')).toHaveCount(1);
  await expect(page.locator('#chartOverlayBody .chart-steady-line')).toHaveCount(1);
  await expect(page.locator('#chartOverlayBody .chart-waste-line')).toHaveCount(1);
  await expect(page.locator('#chartOverlayBody .chart-hover')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#chartOverlay')).toBeHidden();

  await page.locator('[data-theme-toggle="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const plotDownloadPromise = page.waitForEvent('download');
  await page.click('#exportPlotBtn');
  const plotDownload = await plotDownloadPromise;
  const plotSvg = await readDownloadText(plotDownload);
  expect(plotDownload.suggestedFilename()).toBe('creatine-lab-saturation-dose-pressure.svg');
  expect(plotSvg).toContain('<svg');
  expect(plotSvg).toContain('width="3200"');
  expect(plotSvg).toContain('height="1244"');
  expect(plotSvg).toContain('--creatine-soft: #eef5ef;');
  expect(plotSvg).toContain('--creatine-text: #1f2937;');
  expect(plotSvg).toContain('chart-waste-line');
  expect(plotSvg).toContain('Left axis: saturation / dose pressure (%)');
  expect(plotSvg).toContain('Right axis: g/day');

  // Verify the conditional chart-waste-zone renders when saturation pressure
  // actually exceeds 100%. Bumping maintenance dose to 20 g/d after a load20
  // phase pushes the pool past the cap and triggers the red overlay.
  await page.fill('#maintenanceDoseG', '20');
  await expect(page.locator('#accumulationChart .chart-waste-zone')).toHaveCount(1);
});

test('creatine lab no-supplement baseline does not self-load', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await page.selectOption('#bodyPoolBasis', 'manual');
  await page.fill('#baselinePoolG', '100');
  await page.selectOption('#protocolPreset', 'maintenance5');
  await page.fill('#maintenanceDoseG', '0');
  await page.fill('#simulationDays', '60');

  await expect(page.locator('#bodyFinalPoolValue')).toContainText('100 g');
  await expect(page.locator('#bodySaturationValue')).toContainText('75.0%');
  await expect(page.locator('#bodySaturationMeta')).toContainText('supplement gap filled 0.0%');
  await expect(page.locator('#bodySaturationMeta')).toContainText('turnover 1.70 g/day baseline, 1.70 g/day current');
  await expect(page.locator('#wastePressureValue')).toContainText('0.00 g/day');
  await expect(page.locator('#steadyDoseValue')).toContainText('0.00 to 0.00 g/day');
  await expect(page.locator('#warningList')).toContainText('supplementation flows on top of that background');
  await expect(page.locator('#equilibriumPoolValue')).toContainText('100 g');
  await expect(page.locator('#creatinineOutputValue')).toContainText('1.47 g/day');
});

test('creatine lab models body composition and brain compartment', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await expect(page.locator('#bodyCompositionValue')).toContainText('25.2 kg');
  await expect(page.locator('#bodyPoolBasisValue')).toContainText('122 g');
  await expect(page.locator('#brainPoolValue')).toContainText('1.27 g');
  await expect(page.locator('#brainResponseMeta')).toContainText('20 g/day for 4 weeks whole-brain band: 3.5% to 13.3%');
  await expect(page.locator('#brainResponseMeta')).toContainText('14.6% thalamus regional peak shown separately');
  await expect(page.locator('#brainResponseMeta')).toContainText('does not change when protocol changes');

  await page.fill('#bodyMassKg', '100');
  await page.fill('#bodyFatPercent', '10');
  await expect(page.locator('#bodyCompositionValue')).toContainText('40.5 kg');

  await page.selectOption('#bodyPoolBasis', 'manual');
  await expect(page.locator('#manualBaselineLine')).toBeVisible();
  await expect(page.locator('#bodyPoolBasisValue')).toContainText('120 g');
});

test('creatine lab exposes claim-to-source audit trail', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await expect(page.locator('#sourceAuditBody')).toContainText('5 g in 1 L at 20 deg C is fully dissolved at equilibrium');
  await expect(page.locator('#sourceAuditBody')).toContainText('Jager et al. 2011');
  await expect(page.locator('#sourceAuditBody')).toContainText('fitted browser model');
  await expect(page.locator('#sourceAuditBody')).toContainText('Harris et al. 2002');
  await expect(page.locator('#sourceAuditBody')).toContainText('Sagayama et al. 2023');
  await expect(page.locator('#sourceAuditBody')).toContainText('Brain tCr output is separate');
  await expect(page.locator('#sourceAuditBody')).toContainText('does not change when the selected protocol changes');
  await expect(page.locator('#sourceAuditBody')).toContainText('mass-balance ODE');
  await expect(page.locator('#sourceAuditBody')).toContainText('xorshift32');
  await expect(page.locator('#sourceAuditBody')).toContainText('Walker 1979');
  await expect(page.locator('#sourceAuditBody')).toContainText('Burke et al. 2003');
  await expect(page.locator('#sourceAuditBody')).toContainText('Dechent et al. 1999');

  const sanityPanel = page.locator('details.foldable-card').filter({ hasText: 'Model Sanity Checks' });
  const auditPanel = page.locator('details.foldable-card').filter({ hasText: 'Claim Audit Trail' });
  await expect(sanityPanel).not.toHaveAttribute('open', '');
  await expect(auditPanel).not.toHaveAttribute('open', '');
  await sanityPanel.locator('summary').click();
  await auditPanel.locator('summary').click();
  await expect(sanityPanel).toHaveAttribute('open', '');
  await expect(auditPanel).toHaveAttribute('open', '');
});

test('creatine lab vegetarian no-supplement drift surfaces equilibrium', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await page.selectOption('#bodyPoolBasis', 'manual');
  await page.fill('#baselinePoolG', '120');
  await page.selectOption('#protocolPreset', 'maintenance5');
  await page.fill('#maintenanceDoseG', '0');
  await page.fill('#simulationDays', '90');
  await page.selectOption('#dietaryPattern', 'vegetarian');
  await page.uncheck('#calibrateBackground');

  // Vegetarian diet without calibration: equilibrium = (0 + ~1.4) / 0.017 ≈ 82 g.
  await expect(page.locator('#equilibriumPoolValue')).toContainText('82', { timeout: 5000 });
  await expect(page.locator('#equilibriumPoolMeta')).toContainText('Attractor for no-supplement pool');
  const equilibriumText = await page.locator('#equilibriumPoolValue').textContent();
  const equilibriumG = parseFloat((equilibriumText || '').replace(/[^0-9.]/g, ''));
  expect(equilibriumG).toBeGreaterThan(60);
  expect(equilibriumG).toBeLessThan(110);
  // After 90 days the pool should have dropped well below the entered baseline.
  const finalText = await page.locator('#bodyFinalPoolValue').textContent();
  const finalG = parseFloat((finalText || '').replace(/[^0-9.]/g, ''));
  expect(finalG).toBeLessThan(115);
  // Mass-balance residual stays tight.
  await expect(page.locator('#massBalanceMeta')).toContainText('background in');
});

test('creatine lab saves and restores settings via JSON and localStorage', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await page.fill('#bodyMassKg', '83');
  await page.selectOption('#dietaryPattern', 'vegetarian');
  await page.uncheck('#calibrateBackground');

  // Settings exporter downloads JSON.
  const downloadPromise = page.waitForEvent('download');
  await page.click('#saveSettingsBtn');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^creatine-lab-settings-[0-9T:.\-]+\.json$/);
  const settingsText = await readDownloadText(download);
  const payload = JSON.parse(settingsText);
  expect(payload.tool).toBe('creatine-lab');
  expect(payload.schemaVersion).toBe(1);
  expect(payload.inputs.bodyMassKg).toBe('83');
  expect(payload.inputs.dietaryPattern).toBe('vegetarian');
  expect(payload.inputs.calibrateBackground).toBe(false);

  // localStorage auto-persistence: reload and confirm fields restore.
  await page.reload();
  await page.locator('[data-tab-target="accumulate"]').click();
  await expect(page.locator('#bodyMassKg')).toHaveValue('83');
  await expect(page.locator('#dietaryPattern')).toHaveValue('vegetarian');
  await expect(page.locator('#calibrateBackground')).not.toBeChecked();
  await expect(page.locator('#settingsStatus')).toContainText('Restored your saved settings');

  // Reset clears persistence.
  await page.click('#resetBtn');
  await expect(page.locator('#bodyMassKg')).toHaveValue('70');
  await expect(page.locator('#dietaryPattern')).toHaveValue('omnivore');
  await expect(page.locator('#calibrateBackground')).toBeChecked();
  await page.reload();
  await expect(page.locator('#bodyMassKg')).toHaveValue('70');
});

test('creatine lab math modal exercises every equation against its anchor', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await expect(page.locator('#mathModal')).toBeHidden();

  await page.click('#showMathBtn');
  await expect(page.locator('#mathModal')).toBeVisible();
  await expect(page.locator('#mathModalTitle')).toContainText('How The Math Works');
  await expect(page.locator('body')).toHaveClass(/chart-overlay-open/);

  const cardCount = await page.locator('#mathModalBody .math-card').count();
  expect(cardCount).toBeGreaterThanOrEqual(8);
  await expect(page.locator('#mathModalBody')).toContainText('Source:');
  await expect(page.locator('#mathModalBody')).toContainText('Implementation:');
  await expect(page.locator('#mathModalBody')).toContainText('Hultman');
  await expect(page.locator('#mathModalBody')).toContainText('Walker 1979');

  await page.click('button[data-math-run="active-creatine-fraction"]');
  const singleResult = page.locator('[data-math-result="active-creatine-fraction"]');
  await expect(singleResult).toHaveClass(/visible/);
  await expect(singleResult).toContainText('PASS');

  await page.click('#mathModalRunAll');
  await expect(page.locator('#mathModalStatus')).toContainText('equation tests passed');
  await expect(page.locator('#mathModalStatus')).toHaveClass(/success/);
  const passCount = await page.locator('#mathModalBody .math-card-result.pass').count();
  expect(passCount).toBe(cardCount);
  await expect(page.locator('#mathModalBody .math-card-result.fail')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.locator('#mathModal')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/chart-overlay-open/);
});

test('creatine lab renders new mass-balance and creatinine charts', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await page.selectOption('#protocolPreset', 'load20');
  await page.fill('#simulationDays', '45');

  await expect(page.locator('#creatinineChart .chart-creatinine-line')).toHaveCount(1);
  await expect(page.locator('#creatinineChart .chart-creatinine-band')).toHaveCount(1);
  await expect(page.locator('#creatinineChart')).toContainText('creatinine production');
  await expect(page.locator('#fateChart .chart-retained-area')).toHaveCount(1);
  await expect(page.locator('#fateChart .chart-excreted-area')).toHaveCount(1);
  await expect(page.locator('#fateChart')).toContainText('excreted unchanged in urine');
  await expect(page.locator('#cumulativeChart .chart-cumulative-dose-line')).toHaveCount(1);
  await expect(page.locator('#cumulativeChart .chart-cumulative-retained-line')).toHaveCount(1);
  await expect(page.locator('#cumulativeChart .chart-efficiency-line')).toHaveCount(1);

  const creatinineDownloadPromise = page.waitForEvent('download');
  await page.click('#exportCreatininePlotBtn');
  const creatinineDownload = await creatinineDownloadPromise;
  expect(creatinineDownload.suggestedFilename()).toBe('creatine-lab-creatinine-production.svg');

  const fateDownloadPromise = page.waitForEvent('download');
  await page.click('#exportFatePlotBtn');
  const fateDownload = await fateDownloadPromise;
  expect(fateDownload.suggestedFilename()).toBe('creatine-lab-fate-of-dose.svg');

  const cumulativeDownloadPromise = page.waitForEvent('download');
  await page.click('#exportCumulativePlotBtn');
  const cumulativeDownload = await cumulativeDownloadPromise;
  expect(cumulativeDownload.suggestedFilename()).toBe('creatine-lab-cumulative-dose-vs-retained.svg');
});

test('stoichiometry calculator balances charged species without treating charge as atoms', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/stoichiometry-calculator.html');

  await page.fill('#equationInput', 'MnO4- + Fe2+ + H+ -> Mn2+ + Fe3+ + H2O');
  await page.click('#balanceBtn');

  await expect(page.locator('#equationStatus')).toContainText('BALANCED');
  await expect(page.locator('#balancedEquationDisplay')).toContainText('MnO₄⁻ + 5 Fe²⁺ + 8 H⁺');
  await expect(page.locator('#balancedEquationDisplay')).toContainText('Mn²⁺ + 5 Fe³⁺ + 4 H₂O');

  const rows = page.locator('#stoichTableBody tr');
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0).locator('td').nth(1)).toHaveText('1');
  await expect(rows.nth(1).locator('td').nth(1)).toHaveText('5');
  await expect(rows.nth(2).locator('td').nth(1)).toHaveText('8');
  await expect(rows.nth(3).locator('td').nth(1)).toHaveText('1');
  await expect(rows.nth(4).locator('td').nth(1)).toHaveText('5');
  await expect(rows.nth(5).locator('td').nth(1)).toHaveText('4');

  await page.fill('#equationInput', 'Fe2+ -> Fe3+');
  await page.click('#balanceBtn');
  await expect(page.locator('#equationError')).toContainText('Equation cannot be balanced');
});

test('stoichiometry calculator exposes table help as interactive tooltip buttons', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/stoichiometry-calculator.html');

  await page.fill('#equationInput', 'H2 + O2 -> H2O');
  await page.click('#balanceBtn');

  const chips = page.locator('.help-chip');
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toHaveAttribute('aria-describedby', 'tooltip-coef');
  await expect(page.locator('#tooltip-coef')).toHaveAttribute('role', 'tooltip');

  await chips.nth(0).click();
  await expect(chips.nth(0)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(chips.nth(0)).toHaveAttribute('aria-expanded', 'false');
});

test('stoichiometry calculator does not produce yield until every reactant is available', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/stoichiometry-calculator.html');

  await page.fill('#equationInput', 'H2 + O2 -> H2O');
  await page.click('#balanceBtn');

  const moleInputs = page.locator('.input-moles');
  await moleInputs.nth(0).fill('1');

  await expect(moleInputs.nth(2)).toHaveValue('');
  await expect(page.locator('#limitingReactantDisplay')).toHaveText('Awaiting all reactants');
  await expect(page.locator('#totalMassDisplay')).toHaveText('--');

  await moleInputs.nth(1).fill('0.5');
  await expect(moleInputs.nth(2)).toHaveValue('1.0000');
  await expect(page.locator('#limitingReactantDisplay')).toContainText('H₂');
  await expect(page.locator('#totalMassDisplay')).toHaveText('18.02 g');
});

test('stoichiometry calculator marks target-mode reactants as derived', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/stoichiometry-calculator.html');

  await page.fill('#equationInput', 'H2 + O2 -> H2O');
  await page.click('#balanceBtn');

  await page.locator('.input-moles').nth(2).fill('1');

  const rows = page.locator('#stoichTableBody tr');
  await expect(page.locator('#activeModeBadge')).toHaveText('Target Yield Mode');
  await expect(page.locator('#limitingReactantDisplay')).toHaveText('Not applicable');
  await expect(rows.nth(0).locator('.excess-cell')).toHaveText('DERIVED');
  await expect(rows.nth(1).locator('.excess-cell')).toHaveText('DERIVED');
  await expect(rows.nth(0)).not.toHaveClass(/limiting-row/);
});

test('stoichiometry calculator rejects zero-count formulas and parses alternate hydrate dots', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/stoichiometry-calculator.html');

  await page.fill('#equationInput', 'H0');
  await page.click('#balanceBtn');

  await expect(page.locator('#equationError')).toContainText('Element count must be a positive integer.');
  await expect(page.locator('#resultsPanel')).toHaveClass(/hidden/);

  await page.fill('#equationInput', 'CuSO4∙5H2O');
  await page.click('#balanceBtn');

  await expect(page.locator('#equationStatus')).toContainText('FORMULA ANALYZED');
  await expect(page.locator('#equationError')).toHaveClass(/hidden/);
  await expect(page.locator('#stoichTableBody tr').first().locator('td').nth(2)).toHaveText('249.6770');
});

test('psychrometric calculator keeps unit paths and Tdb plus W wet bulb consistent', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/psychrometric-calculator.html');
  await expect(page.locator('#devModal')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Â');
  await expect(page.locator('body')).not.toContainText('Ã');
  await expect(page.locator('body')).not.toContainText('â');
  await expect(page.locator('body')).not.toContainText('deg C');
  await expect(page.locator('#labelUnitTdb')).toContainText('°C');

  await expect(page.locator('#valTwb')).toContainText('17.89');
  await expect(page.locator('#calcW')).toContainText('0.009881');
  await expect(page.locator('#calcW')).toContainText('kg/kg');

  await page.locator('.unit-toggle button[data-unit="ip"]').click();
  await expect(page.locator('#labelUnitTdb')).toContainText('°F');
  await expect(page.locator('body')).not.toContainText('deg F');
  await expect(page.locator('#calcPressure')).toContainText('14.696');
  await expect(page.locator('#calcPressure')).toContainText('psi');
  await expect(page.locator('#valH')).toContainText('21.63');

  const pressureKPa = await page.evaluate(() => getInputPressureKPa());
  expect(pressureKPa).toBeCloseTo(101.325, 2);

  await page.locator('.mode-toggle button[data-mode="tdb_w"]').click();
  await expect(page.locator('#valTwb')).toContainText('64.37');
  await expect(page.locator('#calcW')).toContainText('0.010000');
  await expect(page.locator('#calcW')).toContainText('lb/lb');

  await page.fill('#inputAltitude', '5280');
  await expect(page.locator('#altitudePressureHint')).toContainText('12.');
  await page.click('#applyAltitudeBtn');
  const altitudePressureKPa = await page.evaluate(() => getInputPressureKPa());
  expect(altitudePressureKPa).toBeCloseTo(83.4, 0);
  await expect(page.locator('#calcPressure')).toContainText('12.');

  await page.locator('.unit-toggle button[data-unit="si"]').click();
  await page.click('#resetInputBtn');
  await page.click('#saveStateABtn');
  await page.click('#applyProcessSaveBBtn');
  await expect(page.locator('#valTdb')).toContainText('30.00');
  await expect(page.locator('#processStateASummary')).toContainText('Tdb 25.0 C');
  await expect(page.locator('#processStateBSummary')).toContainText('Tdb 30.0 C');
  await expect(page.locator('#processDeltaSummary')).toContainText('Delta Tdb +5.0 C');
  await expect(page.locator('#processDeltaSummary')).toContainText('Delta h');

  await page.selectOption('#processType', 'cool_dehum');
  await page.fill('#processInput1', '18');
  await page.fill('#processInput2', '90');
  await page.click('#applyProcessBtn');
  await expect(page.locator('#processOutput')).toContainText('Cooling/dehumidification target');
  await expect(page.locator('#valRH')).toContainText('90.0 %');

  await page.selectOption('#processType', 'humidify');
  await page.fill('#processInput1', '2');
  await page.click('#applyProcessBtn');
  await expect(page.locator('#processOutput')).toContainText('Humidification');

  await page.selectOption('#processType', 'mix');
  await page.fill('#processInput1', '50');
  await page.click('#applyProcessBtn');
  await expect(page.locator('#processOutput')).toContainText('Mixed air from State A/B');

  await page.selectOption('#processType', 'coil');
  await page.fill('#processInput1', '10');
  await page.fill('#processInput2', '0.10');
  await page.click('#applyProcessBtn');
  await expect(page.locator('#processOutput')).toContainText('Coil leaving estimate');

  const chartPoint = await page.evaluate(() => ({
    x: CHART.TdbToX(32),
    y: CHART.WToY(12)
  }));
  await page.locator('#psychoCanvas').click({ position: chartPoint });
  await expect(page.locator('#labelInput2')).toContainText('Humidity Ratio');
  const chartState = await page.evaluate(() => ({
    mode: inputMode,
    Tdb: currentState.Tdb,
    W: currentState.W
  }));
  expect(chartState.mode).toBe('tdb_w');
  expect(chartState.Tdb).toBeCloseTo(32, 1);
  expect(chartState.W).toBeCloseTo(0.012, 3);

  const resultsDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Data' }).click();
  const resultsDownload = await resultsDownloadPromise;
  const resultsCsv = fs.readFileSync(await resultsDownload.path(), 'utf8');
  expect(resultsCsv).toContain('Altitude Helper Input,0.00 m');
  expect(resultsCsv).toContain('Standard Pressure From Altitude,101.325 kPa');
  expect(resultsCsv).toContain('Pressure Source,Calculation uses the atmospheric pressure field');
  expect(resultsCsv).toContain('=== PROCESS STATES ===');
  expect(resultsCsv).toContain('=== PROCESS DELTAS ===');

  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('#validationModal')).toContainText('Validation Passed');
  await expect(page.locator('#validationModal')).toContainText('Reference cases are PsychroLib v2.5.0');
  await expect(page.locator('#validationModal')).toContainText('Tdb + Twb');
  await expect(page.locator('#validationModal')).toContainText('Tdb + Tdp');
  await expect(page.locator('#validationModal')).toContainText('Tdb + W');

  const reportDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Report' }).click();
  const reportDownload = await reportDownloadPromise;
  const reportCsv = fs.readFileSync(await reportDownload.path(), 'utf8');
  expect(reportCsv).toContain('Psychrometric Calculator Validation Report');
  expect(reportCsv).toContain('Reference Source: PsychroLib v2.5.0');
  expect(reportCsv).toContain('Tdb + W: Comfort Room Conditions');
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
  await page.locator('details.action-menu').filter({ hasText: 'Export / Share' }).locator('summary').click();

  await page.fill('#field-T', '250');
  await page.click('#computeBtn');
  await page.locator('details.action-menu').filter({ hasText: 'Compare' }).locator('summary').click();
  await page.click('#pinStateBBtn');
  await expect(page.locator('#comparisonPanel')).toContainText('Delta B - A');
  await expect(page.locator('#chartPanel')).toContainText('State B');
  await expect(page.locator('#comparisonPanel')).toContainText('Enthalpy');
  await expect(page.locator('#comparisonPanel')).toContainText('Temperature: 250 deg C');
  await page.click('#swapStatesBtn');
  await expect(page.locator('#statusBanner')).toContainText('Swapped pinned states');
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

test('battery capacity calculator computes the default fixed-regulator estimate', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await expect(page.locator('#runtimeResult')).toHaveText('16 hr 12 min');
  await expect(page.locator('#usableEnergyResult')).toHaveText('6.66 Wh');
  await expect(page.locator('#avgLoadCurrentResult')).toHaveText('100 mA');
  await expect(page.locator('#avgLoadPowerResult')).toHaveText('370 mW');
  await expect(page.locator('#batteryCurrentResult')).toHaveText('111.11 mA');
  await expect(page.locator('#peakBatteryCurrentResult')).toHaveText('111.11 mA');
  await expect(page.locator('#feasibilityResult')).toHaveText('Not evaluated');

  const contributionRows = page.locator('#contributionList .contribution-row');
  await expect(contributionRows).toHaveCount(2);
  await expect(contributionRows.nth(0).locator('.contribution-name')).toHaveText('Average load');
  await expect(contributionRows.nth(0).locator('.contribution-share')).toHaveText('90%');
  await expect(contributionRows.nth(1).locator('.contribution-name')).toHaveText('Converter loss');
  await expect(contributionRows.nth(1).locator('.contribution-share')).toHaveText('10%');
});

test('battery capacity calculator rejects fractional cell topology counts', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.selectOption('#batteryModelMode', 'cellPack');
  await page.fill('#seriesCells', '1.5');
  await page.click('#calculateBtn');

  await expect(page.locator('#calculation-error')).toHaveText('Cells in series must be a whole number of at least 1.');
  await expect(page.locator('#runtimeResult')).toHaveText('--');
  await expect(page.locator('#derivedPackSummary')).toHaveText('Enter valid cell capacity, nominal voltage, and series/parallel counts to derive the pack model.');

  await page.fill('#seriesCells', '2');
  await page.fill('#parallelCells', '2.5');
  await page.click('#calculateBtn');

  await expect(page.locator('#calculation-error')).toHaveText('Cells in parallel must be a whole number of at least 1.');
  await expect(page.locator('#runtimeResult')).toHaveText('--');
});

test('battery capacity direct feed rejects explicit load voltage mismatch', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.selectOption('#regulatorType', 'direct');
  await page.fill('#loadVoltage', '3.75');
  await page.click('#calculateBtn');

  await expect(page.locator('#calculation-error')).toHaveText('Direct battery feed assumes the load voltage matches pack voltage. Leave it blank or match the pack voltage.');
  await expect(page.locator('#runtimeResult')).toHaveText('--');
});

test('battery capacity formats tiny nonzero current and power without rounding to zero', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.fill('#constantCurrent', '0.01');
  await page.selectOption('#constantCurrentUnit', 'uA');
  await page.click('#calculateBtn');

  await expect(page.locator('#avgLoadCurrentResult')).toHaveText('<0.1 uA');
  await expect(page.locator('#avgLoadPowerResult')).toHaveText('<0.1 uW');
  await expect(page.locator('#batteryCurrentResult')).toHaveText('<0.1 uA');
});

test('battery capacity embedded presets reset chemistry-derived defaults', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.fill('#usableFraction', '12');
  await page.selectOption('#embeddedPreset', 'esp32Wifi');
  await page.click('#applyPresetBtn');

  await expect(page.locator('#usableFraction')).toHaveValue('90');
  await expect(page.locator('#modeSelect')).toHaveValue('stateProfile');
  await expect(page.locator('#loadVoltage')).toHaveValue('3.3');
  await expect(page.locator('#profileRowsContainer .profile-row')).toHaveCount(4);
  await expect(page.locator('#profileHelper')).toContainText('4 states entered.');
  await expect(page.locator('#runtimeResult')).not.toHaveText('--');
});

test('battery capacity profile rows keep current and duration controls visible at mid widths', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.selectOption('#embeddedPreset', 'esp32Wifi');
  await page.click('#applyPresetBtn');

  async function expectProfileFieldsToFit() {
    const overflowCount = await page.locator('#profileRowsContainer .profile-row .field-row').evaluateAll((fieldRows) => {
      return fieldRows.filter((fieldRow) => {
        const rowBox = fieldRow.getBoundingClientRect();
        return Array.from(fieldRow.children).some((child) => {
          const childBox = child.getBoundingClientRect();
          return childBox.left < rowBox.left - 0.5 || childBox.right > rowBox.right + 0.5;
        });
      }).length;
    });
    expect(overflowCount).toBe(0);

    const minInputWidth = await page.locator('#profileRowsContainer .profile-current-input, #profileRowsContainer .profile-duration-input').evaluateAll((inputs) => {
      return Math.min(...inputs.map((input) => input.getBoundingClientRect().width));
    });
    expect(minInputWidth).toBeGreaterThan(100);
  }

  await expectProfileFieldsToFit();

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.waitForTimeout(100);
  await expectProfileFieldsToFit();
});

test('battery capacity chemistry presets seed invalid and hidden cell-pack defaults', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.fill('#usableFraction', '');
  await page.selectOption('#chemistryPreset', 'lifepo4');

  await expect(page.locator('#usableFraction')).toHaveValue('92');
  await page.selectOption('#batteryModelMode', 'cellPack');
  await expect(page.locator('#cellNominalVoltage')).toHaveValue('3.2');
  await expect(page.locator('#derivedPackSummary')).toContainText('3.2 V nominal');
});

test('battery capacity preserves the kept-custom usable fraction hint after debounced refresh', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.fill('#usableFraction', '75');
  await page.selectOption('#chemistryPreset', 'lifepo4');

  await expect(page.locator('#usableFraction')).toHaveValue('75');
  await expect(page.locator('#chemistryNote')).toContainText('Kept your custom usable fraction of 75%');

  await page.waitForTimeout(250);
  await expect(page.locator('#chemistryNote')).toContainText('Kept your custom usable fraction of 75%');
});

test('battery capacity state profile peak uses the higher of explicit entry and max state', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.selectOption('#embeddedPreset', 'esp32Wifi');
  await page.click('#applyPresetBtn');

  await page.fill('#peakLoadCurrent', '100');
  await page.selectOption('#peakLoadCurrentUnit', 'mA');
  await page.fill('#regulatorCurrentLimit', '200');
  await page.selectOption('#regulatorCurrentLimitUnit', 'mA');
  await page.click('#calculateBtn');

  await expect(page.locator('#peakBatteryCurrentMeta')).toContainText('Entered peak load current 100 mA is below the highest state (240 mA)');
  await expect(page.locator('#feasibilityResult')).toHaveText('Limit exceeded');
});

test('battery capacity saved scenarios default to the newest sorted option', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    const formState = {
      modeSelect: 'constantCurrent',
      constantCurrent: '100',
      constantCurrentUnit: 'mA'
    };
    const snapshot = {
      mode: 'constantCurrent',
      runtimeHours: 1,
      avgBatteryCurrentA: 0.1,
      peakBatteryCurrentA: 0.1,
      label: 'Constant-current estimate'
    };
    window.localStorage.setItem('batteryCapacitySavedScenarios', JSON.stringify([
      {
        id: 'older-scenario',
        name: 'Older scenario',
        savedAt: '2026-04-28T12:00:00.000Z',
        formState,
        snapshot
      },
      {
        id: 'newer-scenario',
        name: 'Newer scenario',
        savedAt: '2026-04-29T12:00:00.000Z',
        formState,
        snapshot
      }
    ]));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await expect(page.locator('#savedScenarioSelect option').first()).toContainText('Newer scenario');
  await expect(page.locator('#savedScenarioSelect')).toHaveValue('newer-scenario');
});

test('battery capacity saved scenario remains usable when local storage writes fail', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItemWithBatteryFailure(key, value) {
      if (key === 'batteryCapacitySavedScenarios') {
        throw new DOMException('simulated storage denial', 'SecurityError');
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.fill('#scenarioName', 'Memory only test');
  await page.click('#saveScenarioBtn');

  await expect(page.locator('#scenarioStatus')).toHaveText('Could not save to local storage. The scenario is kept only in memory for this session.');
  await expect(page.locator('#savedScenarioSelect')).toContainText('Memory only test');
  await expect(page.locator('#loadScenarioBtn')).toBeEnabled();

  await page.fill('#constantCurrent', '250');
  await page.click('#resetBtn');
  await expect(page.locator('#savedScenarioSelect')).toContainText('Memory only test');
  await expect(page.locator('#loadScenarioBtn')).toBeEnabled();

  await page.fill('#constantCurrent', '250');
  await page.click('#loadScenarioBtn');

  await expect(page.locator('#constantCurrent')).toHaveValue('100');
  await expect(page.locator('#scenarioStatus')).toHaveText('Loaded "Memory only test".');

  await page.click('#deleteScenarioBtn');
  await expect(page.locator('#scenarioStatus')).toHaveText('Deleted "Memory only test" from this session. Local storage could not be updated.');
  await expect(page.locator('#savedScenarioSelect')).toHaveText('No saved scenarios');
  await expect(page.locator('#loadScenarioBtn')).toBeDisabled();
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

test('workweek planner uses days per sheet and keeps sheet days in one row', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await expect(page.locator('#groupingSelect')).toHaveCount(0);
  await page.selectOption('#selectionPreset', 'fullweek');
  await page.selectOption('#daysPerSheetSelect', '7');
  await page.selectOption('#orientationSelect', 'landscape');

  await expect.poll(
    () => getPlannerStatValue(page, 'Printable pages'),
    { message: 'Expected seven selected days with seven days per sheet to produce one page.' }
  ).toBe('1');

  await expect.poll(
    () => page.locator('.planner-day-grid').first().getAttribute('style'),
    { message: 'Expected all seven days to be laid out left to right on the same sheet.' }
  ).toContain('grid-template-columns: repeat(7');

  await expect.poll(
    () => page.locator('.planner-day-grid').first().getAttribute('style'),
    { message: 'Expected days to stay in one row rather than stacking.' }
  ).toContain('grid-template-rows: repeat(1');
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

test('workweek planner restores empty selected days as an invalid configuration', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('workweekPlannerCurrent', JSON.stringify({
      selectionPreset: 'custom',
      selectedDays: [],
      dateMode: 'generic',
      startTime: '08:00',
      endTime: '17:00',
      interval: 15
    }));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await expect(page.locator('#dayGrid input:checked')).toHaveCount(0);
  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected an exported empty day selection to remain invalid instead of restoring the default workweek.' }
  ).toContain('Select at least one day to generate planner sheets.');
});

test('workweek planner sanitizes impossible restored times before generating rows', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('workweekPlannerCurrent', JSON.stringify({
      selectionPreset: 'single',
      selectedDays: ['mon'],
      dateMode: 'generic',
      durationPreset: 'custom',
      startTime: '08:00',
      endTime: '99:00',
      interval: 15
    }));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await expect(page.locator('#endTimeInput')).toHaveValue('17:00');
  await expect.poll(
    () => getPlannerStatValue(page, 'Hours per day'),
    { message: 'Expected the invalid restored end time to fall back before schedule generation.' }
  ).toBe('9h');
});

test('workweek planner rejects impossible restored range dates instead of rolling them forward', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('workweekPlannerCurrent', JSON.stringify({
      selectionPreset: 'custom',
      selectedDays: ['tue'],
      dateMode: 'range',
      rangeStart: '2026-02-31',
      rangeEnd: '2026-02-31',
      startTime: '08:00',
      endTime: '17:00',
      interval: 15
    }));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await expect(page.locator('#rangeStartInput')).toHaveValue('');
  await expect(page.locator('#rangeEndInput')).toHaveValue('');
  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected an impossible stored date to stay invalid rather than becoming March 3.' }
  ).toContain('Set both start and end dates for range mode.');
  await expect.poll(() => getPlannerStatValue(page, 'Planner days')).toBe('0');
});

test('workweek planner rejects impossible restored months instead of rolling into another year', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('workweekPlannerCurrent', JSON.stringify({
      selectionPreset: 'custom',
      selectedDays: ['fri'],
      dateMode: 'month',
      month: '2026-13',
      startTime: '08:00',
      endTime: '17:00',
      interval: 15
    }));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await expect(page.locator('#monthInput')).toHaveValue('');
  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected an impossible stored month to remain invalid instead of becoming January 2027.' }
  ).toContain('Choose a month to generate all selected weekdays in that month.');
  await expect.poll(() => getPlannerStatValue(page, 'Planner days')).toBe('0');

  await page.fill('#titleInput', 'Still needs a month');
  await expect(page.locator('#monthInput')).toHaveValue('');
  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected unrelated edits to preserve the missing-month error.' }
  ).toContain('Choose a month to generate all selected weekdays in that month.');
});

test('workweek planner tolerates malformed saved plan configs', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('workweekPlannerSaved', JSON.stringify([
      {
        id: 'broken-plan',
        name: 'Broken config',
        savedAt: 'not-a-date',
        config: {}
      }
    ]));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  const savedPlan = page.locator('#savedPlansList .saved-plan-item');
  await expect(savedPlan).toHaveCount(1);
  await expect(savedPlan).toContainText('Broken config');
  await expect(savedPlan).toContainText('generic | 08:00-17:00 | MON, TUE, WED, THU, FRI');
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
