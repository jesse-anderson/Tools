// Repo-wide guard for the boilerplate legal clauses.
//
// September 2026: rebuilding the toxicology and oral-multidose disclaimers
// silently dropped indemnification and the enumerated consequential-damages
// clause. Those two pages held the only instances in the repo, so the concepts
// disappeared entirely and every individual page still looked fine. This spec is
// the check that would have caught it.
//
// Scope is deliberate. P3 tools are not listed: a word counter carrying an
// indemnity clause trains readers to skip the cards that matter.
const { test, expect } = require('@playwright/test');

const CLAUSE_PAGES = [
  '/tools.html',
  '/tools/ai-image-detector.html',
  '/tools/ohms-law.html',
  '/tools/unit-converter.html',
  '/tools/pid-playground.html',
  '/tools/face-blur.html',
  '/tools/scientific-graph-digitizer.html',
  '/tools/pdf-diff.html',
  '/tools/steam-tables.html',
  '/tools/hed-calculator.html',
  '/tools/toxicology-and-body-burden.html',
  '/tools/oral-multidose.html',
  '/tools/beam-deflection.html',
  '/tools/control-valve-sizing.html',
  '/tools/moody-chart.html',
  '/tools/psychrometric-calculator.html',
  '/tools/linear-thermal-expansion.html',
  '/tools/sensors.html',
  '/tools/battery-capacity.html',
  '/tools/stoichiometry-calculator.html',
  '/tools/uncertainty-propagation.html',
  '/tools/visual-integration.html',
  '/tools/esp32-pinout.html',
  '/tools/rpi-pinout.html',
  '/tools/yogurt-cfu-estimator.html',
  '/tools/linear-regression.html',
  '/tools/crypto-lab.html',
  '/tools/meeting-planner.html',
  '/tools/sqlite-viewer.html',
  '/tools/duckdb-playground.html',
  '/tools/parquet-viewer.html',
  '/tools/csv-profiler.html',
  '/tools/excel-formula-extractor.html',
  '/tools/screenshot-tool.html',
  '/tools/markdown-exporter.html',
  '/tools/dbscan-visualizer.html',
  '/tools/local-llm-opex.html',
  '/tools/creatine-lab.html',
  '/tools/seed-storage-lab.html',
  '/tools/species-doubling-reference.html',
];

const REQUIRED = [
  ['warranty', 'No warranty'],
  ['liability', 'accepts no liability'],
  ['assumption of risk', 'You assume all risk'],
  ['consequential damages', 'Consequential damages excluded'],
  ['even-if-advised tail', 'even if advised of the possibility'],
  ['indemnity', 'indemnify and hold'],
  ['severability', 'Severability'],
  ['independent verification', 'Independent verification required'],
];

for (const path of CLAUSE_PAGES) {
  test(`${path} carries every required legal clause`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const card = page.locator('details.disclaimer-card').first();
    await card.evaluate((el) => { el.open = true; });
    const footer = card.locator('.disclaimer-footer');
    await expect(footer, `${path} has no .disclaimer-footer`).toHaveCount(1);
    for (const [name, phrase] of REQUIRED) {
      await expect(footer, `${path} is missing the ${name} clause`).toContainText(phrase);
    }
  });
}

// The medical tools carry one more, because a reader can mistake a dosing or
// exposure figure for advice in a way they cannot mistake a beam deflection.
for (const path of [
  '/tools/hed-calculator.html',
  '/tools/toxicology-and-body-burden.html',
  '/tools/oral-multidose.html',
]) {
  test(`${path} disclaims any professional relationship`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
    const footer = page.locator('#scopeDisclaimer .disclaimer-footer');
    await expect(footer).toContainText('does not create a');
    await expect(footer).toContainText('nothing on it is medical, clinical, toxicological or professional advice');
  });
}
