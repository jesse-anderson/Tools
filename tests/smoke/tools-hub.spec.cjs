// Catalog integrity for tools.html: category placement, per-tool status and
// tags, on-disk existence of every linked page, plus the hub page load and its
// expandable statistics panel.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  repoRoot,
  toolsIndexMarkup,
  toolPaths,
  getSectionMarkup,
  extractToolNamesFromSection,
  extractToolHrefsFromSection,
  expectPageToLoadCleanly
} = require('./helpers.cjs');

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
