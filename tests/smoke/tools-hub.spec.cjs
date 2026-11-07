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
// docs/SOW/completed/disclaimer_rework_sow.md.

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
  await expect(summary).toContainText('substitute for professional judgment');
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

// Separate *.jesse-anderson.net apps. They have no link back to the hub, so
// a click shows a notice to use Back and opens them in the same tab.
const EXTERNAL = {
  'Engineering Calculators': ['https://vibes.jesse-anderson.net/', 'https://pipetool.jesse-anderson.net/'],
  'Biochemical Engineering Utilities': ['https://bioreactor-mpc.jesse-anderson.net/'],
  Educational: ['https://nback.jesse-anderson.net/'],
  Demos: ['https://opcrime.jesse-anderson.net/', 'https://opcrimeds.jesse-anderson.net/', 'https://sensors.jesse-anderson.net/public/'],
};

test('separate-site apps sit in their categories, and Demos is the last section', () => {
  for (const [section, hrefs] of Object.entries(EXTERNAL)) {
    const markup = getSectionMarkup(toolsIndexMarkup, section);
    for (const href of hrefs) expect(markup, `${href} in ${section}`).toContain(`href="${href}"`);
  }
  const titles = [...toolsIndexMarkup.matchAll(/<h2 class="category-title">([^<]+)<\/h2>/g)].map((m) => m[1]);
  expect(titles[titles.length - 1]).toBe('Demos');
});

test('every off-site card is marked external, with a status, a host line and the arrow', () => {
  const cards = toolsIndexMarkup.match(/<a href="https:[^"]+" class="tool-card[^"]*"[^>]*>[\s\S]*?<\/a>/g) || [];
  expect(cards).toHaveLength(Object.values(EXTERNAL).flat().length);
  for (const c of cards) {
    expect(c).toContain('data-external');
    expect(c).toMatch(/href="https:\/\/[a-z-]+\.jesse-anderson\.net\//);
    expect(c).toContain('class="tool-status');
    expect(c).toContain('class="tool-host"');
    expect(c).toContain('(separate site)');
    expect(c).not.toContain('target=');
  }
});

test.describe('leaving-the-hub notice', () => {
  test.beforeEach(async ({ page }) => {
    // Never touch the real sites from the suite.
    await page.route(/https:\/\/[a-z-]+\.jesse-anderson\.net\/.*/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }));
    await page.goto('/tools.html', { waitUntil: 'domcontentloaded' });
  });

  test('a click shows the notice, and Stay here keeps the hub', async ({ page }) => {
    await page.locator('a[href="https://vibes.jesse-anderson.net/"]').click();
    const dialog = page.locator('#externalNotice');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Bearing Vibration Diagnosis');
    await expect(dialog).toContainText("use your browser's Back button");
    await expect(dialog).toContainText('disclaimer does not cover it');
    await expect(dialog).toContainText('analytics');
    await expect(page.locator('.external-notice-go')).toBeFocused();
    // The page reset once stripped the dialog's centering margin.
    const box = await dialog.boundingBox();
    const width = page.viewportSize().width;
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(4);
    await page.getByRole('button', { name: 'Stay here' }).click();
    await expect(dialog).toBeHidden();
    expect(new URL(page.url()).pathname).toBe('/tools.html');
  });

  test('Continue opens the site in this tab, and Back returns to the hub', async ({ page }) => {
    await page.locator('a[href="https://nback.jesse-anderson.net/"]').click();
    await page.getByRole('button', { name: 'Continue to nback.jesse-anderson.net' }).click();
    await expect(page).toHaveURL('https://nback.jesse-anderson.net/');
    await page.goBack();
    await expect(page).toHaveURL(/\/tools\.html$/);
  });

  test("Don't show this again skips the notice next time", async ({ page }) => {
    await page.locator('a[href="https://opcrime.jesse-anderson.net/"]').click();
    await page.locator('#externalNoticeSkip').check();
    await page.locator('.external-notice-go').click();
    await expect(page).toHaveURL('https://opcrime.jesse-anderson.net/');
    await page.goBack();
    await page.locator('a[href="https://opcrimeds.jesse-anderson.net/"]').click();
    await expect(page).toHaveURL('https://opcrimeds.jesse-anderson.net/');
  });

  test('Escape closes the notice, and a modified click is not intercepted', async ({ page }) => {
    await page.locator('a[href="https://pipetool.jesse-anderson.net/"]').click();
    await expect(page.locator('#externalNotice')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#externalNotice')).toBeHidden();
    const intercepted = await page.evaluate(() => {
      const a = document.querySelector('a[href="https://pipetool.jesse-anderson.net/"]');
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
      // Stop the navigation itself; the notice handler runs on the document first or not at all.
      a.addEventListener('click', (e) => e.preventDefault(), { once: true });
      a.dispatchEvent(ev);
      return document.getElementById('externalNotice').open;
    });
    expect(intercepted).toBe(false);
  });
});
