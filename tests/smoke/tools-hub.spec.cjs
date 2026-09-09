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
  expectPageToLoadCleanly,
  expectContrastAA
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

// --- site-wide scope and liability notice -----------------------------------
// The hub notice is the baseline every per-tool disclaimer builds on. It is
// deliberately a passive notice and not an acceptance gate: tools here are
// reached by direct link far more often than through this page, so a gate on
// the catalog would guard the one door almost nobody uses. See
// docs/SOW/disclaimer_rework_sow.md.

test('tools.html carries the site-wide notice above the tool list, readable while collapsed', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools.html');

  const card = page.locator('#siteDisclaimer');
  await expect(card).toBeVisible();

  // Native details, so it is keyboard operable with nothing to dismiss.
  expect(await card.evaluate((el) => el.tagName)).toBe('DETAILS');
  expect(await card.evaluate((el) => el.open)).toBe(false);

  // The headline has to read without opening anything, which is the whole
  // reason it lives in the summary rather than the body.
  const summary = card.locator('summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('substitute for professional judgement');
  await expect(summary).toContainText('none of it is certified, validated or independently reviewed software');

  // Above the first tool card and inside the first viewport.
  const box = await card.boundingBox();
  const firstTool = await page.locator('.category-section .tool-card').first().boundingBox();
  expect(box.y).toBeLessThan(firstTool.y);
  expect(box.y).toBeLessThan(900);

  // 44px touch target on the only control that opens it.
  const summaryBox = await summary.boundingBox();
  expect(summaryBox.height).toBeGreaterThanOrEqual(44);
});

test('tools.html notice names specific prohibited uses and carries the five legal elements', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools.html');
  await page.locator('#siteDisclaimer').evaluate((el) => { el.open = true; });

  const body = page.locator('#siteDisclaimer .disclaimer-body');

  // Specific prohibited uses, not an adjective. Deleting one of these fails.
  for (const forbidden of [
    'safety instrumented function',
    'Clinical diagnosis, treatment, or dosing',
    'Relief, blowdown, overpressure',
    'requiring a professional stamp',
    'academic-integrity',
  ]) {
    await expect(body).toContainText(forbidden);
  }

  // The catalog status labels mean something, and the notice says so.
  await expect(body).toContainText('Under Review');
  await expect(body).toContainText('Experimental');

  const footer = page.locator('#siteDisclaimer .disclaimer-footer');
  await expect(footer).toContainText('No warranty');            // warranty
  await expect(footer).toContainText('accepts no liability');   // liability
  await expect(footer).toContainText('You assume all risk');    // assumption of risk
  await expect(footer).toContainText('the page is wrong');      // precedence
  await expect(footer).toContainText('Independent verification required');

  // A per-tool card may narrow this one; it may not widen it.
  await expect(footer).toContainText('narrower limit applies');
});

test('tools.html notice is not an acceptance gate and stores nothing', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools.html');

  // Nothing overlays the page and nothing has to be clicked to reach a tool.
  await expect(page.locator('.category-section .tool-card').first()).toBeVisible();
  const blocking = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 40);
    return el ? el.closest('#siteDisclaimer') !== null : false;
  });
  expect(blocking).toBe(false);

  // No acceptance token is written anywhere. If this ever becomes a gate, this
  // test is the reminder that the decision was deliberate.
  const stored = await page.evaluate(() => ({
    local: Object.keys(localStorage).filter((k) => /accept|consent|disclaim|agree/i.test(k)),
    session: Object.keys(sessionStorage).filter((k) => /accept|consent|disclaim|agree/i.test(k)),
    cookie: document.cookie,
  }));
  expect(stored.local).toEqual([]);
  expect(stored.session).toEqual([]);
  expect(stored.cookie).toBe('');
});

test('tools.html notice does not interfere with search or the tool grid', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools.html');

  const total = await page.locator('.category-section .tool-card').count();
  expect(total).toBeGreaterThan(40);

  await page.fill('#toolSearch', 'valve');
  await expect
    .poll(async () => page.locator('.category-section .tool-card:visible').count())
    .toBeLessThan(total);
  await expect(page.locator('.category-section .tool-card:visible')).toContainText([/Control Valve/i]);

  await page.fill('#toolSearch', '');
  await expect.poll(async () => page.locator('.category-section .tool-card:visible').count()).toBe(total);
});

test('tools.html notice text clears WCAG AA in both themes', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools.html');
  await expectContrastAA(
    page,
    '#siteDisclaimer .disclaimer-title, #siteDisclaimer .disclaimer-lead, ' +
      '#siteDisclaimer .disclaimer-note, #siteDisclaimer .disclaimer-section h3, ' +
      '#siteDisclaimer .disclaimer-footer'
  );
});

test('tools.html notice carries the damages and indemnity clauses', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools.html');
  await page.locator('#siteDisclaimer').evaluate((el) => { el.open = true; });
  const footer = page.locator('#siteDisclaimer .disclaimer-footer');
  await expect(footer).toContainText('Consequential damages excluded');
  await expect(footer).toContainText('even if advised of the possibility');
  await expect(footer).toContainText('indemnify and hold');
});
