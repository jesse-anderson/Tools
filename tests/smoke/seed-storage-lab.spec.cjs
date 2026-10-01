// Seed Storage Lab DOM/e2e coverage: species search and the safety gate,
// published-count conflicts, measured-count mode, Harrington clamping, the
// Hundred Rule indicator, the math modal, and the checks panel.
//
// The gate tests are the important ones. Everything else here is a formatting
// regression; a gate failure means the tool told someone their acorns keep for
// decades.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

async function pickSpecies(page, query, scientificName) {
  await page.fill('#speciesSearch', query);
  const option = page.locator(`#speciesResults button[data-species-id]`, { hasText: scientificName });
  await option.first().click();
}

test('seed storage lab loads with disclaimers, tutorial and help chips', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await expect(page.locator('h1')).toContainText('Seed Storage Lab');

  // Repointed at the shared scope disclaimer card in September 2026; the
  // .scope-warning-block it replaced is gone.
  await expect(page.locator('#scopeDisclaimer .disclaimer-title')).toContainText('Not a test of your seed');
  await expect(page.locator('#scopeDisclaimer')).not.toHaveAttribute('open', '');
  await page.locator('#scopeDisclaimer summary').click();
  await expect(page.locator('#scopeDisclaimer')).toContainText('No warranty. No liability. No suitability claim. You assume all risk.');
  await expect(page.locator('#scopeDisclaimer')).toContainText('germination test');

  await expect(page.locator('.tutorial-card summary')).toContainText('How To Use This Tool');
  await page.locator('.tutorial-card summary').click();
  await expect(page.locator('.tutorial-card')).toHaveAttribute('open', '');
  await expect(page.locator('.tutorial-card')).toContainText('Moisture content and relative humidity are different quantities');
  await expect(page.locator('.tutorial-card')).toContainText('Freezer storage is outside these rules');
  await expect(page.locator('.tutorial-card')).toContainText('The tool will refuse some species');

  // Every input row and every result card carries a help chip. Same convention
  // as the Creatine Lab: a control the user cannot interpret is a defect.
  const missingInputHelp = await page.locator('.control-panel :is(.input-line, .check-line)').evaluateAll((rows) => rows
    .filter((row) => row.querySelector('input, select') && !row.querySelector('.help-chip'))
    .map((row) => (row.querySelector('span')?.textContent || row.textContent || '').trim()));
  expect(missingInputHelp).toEqual([]);

  const missingResultHelp = await page.locator('.result-grid .result-card').evaluateAll((cards) => cards
    .filter((card) => !card.querySelector('.result-label .help-chip'))
    .map((card) => (card.querySelector('.result-label')?.textContent || '').trim()));
  expect(missingResultHelp).toEqual([]);

  // The chip exists for every control, but only the visible tab can be hovered.
  await page.locator('[data-tab-target="storage"]').click();
  await page.locator('[aria-describedby="help-storageMoisture"]').hover();
  await expect(page.locator('#help-storageMoisture')).toBeVisible();
  await expect(page.locator('#help-storageMoisture')).toContainText('Relative humidity is a separate input');
});

test('search matches on word boundaries, not substrings', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await page.fill('#speciesSearch', 'pine');
  const names = await page.locator('#speciesResults .sci').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((name) => name.startsWith('Pinus') || /pine/i.test(name))).toBeTruthy();
  expect(names.some((name) => name.startsWith('Lupinus'))).toBeFalsy();
});

test('recalcitrant species are refused a storage life but keep their seed counts', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await pickSpecies(page, 'oak', 'Quercus');

  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'blocked');
  await expect(page.locator('#gateHeadline')).toContainText('recalcitrant');
  await expect(page.locator('#gateDetail')).toContainText('cannot be dried');
  await expect(page.locator('#longevityValue')).toContainText('Not modelled');
  await expect(page.locator('#behaviourValue')).toContainText('recalcitrant');

  // The count question is still answerable and must not be suppressed. WPSM
  // rows that carry only a low-high range once vanished here, taking 34 oak
  // counts with them.
  await page.locator('[data-tab-target="count"]').click();
  await expect(page.locator('#countsTableBody tr').first()).not.toContainText('No published seed counts');
  await expect(page.locator('#countPerLbValue')).not.toContainText('--');
});

test('a genus record points at the species that hold the numbers', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  // Searching the bare genus selects the genus record, which carries the
  // safety flag but no counts of its own. Reporting "none held" would be
  // wrong: 35 Quercus species in the dataset have counts.
  await pickSpecies(page, 'Quercus', 'Quercus');

  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'blocked');
  await page.locator('[data-tab-target="count"]').click();
  await expect(page.locator('#countsTableBody')).toContainText('genus record');
  await expect(page.locator('#countsTableBody')).toContainText('Quercus species in this dataset do');
});

test('species-level behaviour beats the genus for Acer', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await pickSpecies(page, 'Acer saccharinum', 'Acer saccharinum');
  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'blocked');

  await pickSpecies(page, 'Acer platanoides', 'Acer platanoides');
  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'ok');
  await expect(page.locator('#longevityValue')).not.toContainText('Not modelled');
});

test('vegetatively propagated crops explain themselves instead of returning nothing', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await pickSpecies(page, 'garlic', 'Allium sativum');

  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'not_applicable');
  await expect(page.locator('#gateHeadline')).toContainText('not grown from stored seed');
  // The curated note names the actual propagation route; the gate surfaces
  // that instead of restating the raw field value ("Propagated vegetative.").
  await expect(page.locator('#gateDetail')).toContainText('Propagated from cloves');
  await expect(page.locator('#longevityValue')).toContainText('Not modelled');
});

test('an orthodox but vegetatively grown crop says so', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  // Grape seed is orthodox and does store, so the projection runs. Saying only
  // "dry, cold storage applies" would answer a question nobody asked.
  await pickSpecies(page, 'grape', 'Vitis vinifera');

  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'ok');
  await expect(page.locator('#gateDetail')).toContainText('grown from cuttings, runners or offsets');
  await expect(page.locator('#longevityValue')).not.toContainText('Not modelled');
});

test('unflagged woody species are refused a projection', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  // Ulmus carpinifolia has no storage-behaviour record and its only seed count
  // comes from the figshare dataset, so a WPSM-source test misses it. Woody
  // status is matched on genus for this reason.
  await pickSpecies(page, 'Ulmus carpinifolia', 'Ulmus carpinifolia');

  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'caution');
  await expect(page.locator('#gateHeadline')).toContainText('unrecorded for this woody species');
  await expect(page.locator('#longevityValue')).toContainText('Not modelled');
});

test('an overruled recalcitrant flag is named and costs the species its ok status', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  // Pecan is orthodox by its 1998 compendium species row, inside a Carya genus
  // the 1996 compendium flags recalcitrant. The projection runs on the better
  // source, but the reader is told what it beat. Before this the banner read
  // "ok" and the recalcitrant flag left no trace.
  await pickSpecies(page, 'Carya illinoensis', 'Carya illinoensis');

  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'caution');
  await expect(page.locator('#gateDetail')).toContainText('A second source disagrees');
  await expect(page.locator('#gateDetail')).toContainText('Carya is listed recalcitrant at genus level');
  await expect(page.locator('#longevityValue')).not.toContainText('Not modelled');

  // Red oak keeps a plain block: nothing was overruled, so nothing is claimed.
  await pickSpecies(page, 'Quercus rubra', 'Quercus rubra');
  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'blocked');
  await expect(page.locator('#gateDetail')).not.toContainText('A second source disagrees');
});

test('searching a crop selects that crop, not the first name on the species', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  // Brassica oleracea is broccoli, cabbage, cauliflower, kale, kohlrabi and
  // brussels sprouts at once. Searching kale used to answer "broccoli" and
  // pool all seven crops into one span reported as sources disagreeing.
  await pickSpecies(page, 'kale', 'Brassica oleracea');

  await expect(page.locator('#statusLine')).toContainText('Kale (Brassica oleracea)');
  await expect(page.locator('#cropGroupRow')).toBeVisible();
  await expect(page.locator('#cropGroup')).toHaveValue('kale');

  await page.locator('[data-tab-target="count"]').click();
  const labels = await page.locator('#countsTableBody tr td:nth-child(2)').allTextContents();
  expect(labels.every((label) => /kale|Brassica oleracea/i.test(label))).toBeTruthy();
  expect(labels.some((label) => /broccoli|kohlrabi|cabbage/i.test(label))).toBeFalsy();

  // Switching crop moves every number with it. The selector sits in the
  // species tab, so go back to it first.
  await page.locator('[data-tab-target="species"]').click();
  await page.selectOption('#cropGroup', 'kohlrabi');
  await expect(page.locator('#statusLine')).toContainText('Kohlrabi (Brassica oleracea)');
  await page.locator('[data-tab-target="count"]').click();
  const after = await page.locator('#countsTableBody tr td:nth-child(2)').allTextContents();
  expect(after.some((label) => /kohlrabi/i.test(label))).toBeTruthy();
  expect(after.some((label) => /kale/i.test(label))).toBeFalsy();
});

test('a single-crop species shows no crop selector', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await pickSpecies(page, 'lettuce', 'Lactuca sativa');
  await expect(page.locator('#cropGroupRow')).toBeHidden();
  await expect(page.locator('#statusLine')).toContainText('Lettuce (Lactuca sativa)');
});

test('the flattened watermelon germination row is split back into two crops', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  // G2090 prints seeded and seedless watermelon as one row with two values per
  // cell ("21 30", "4-5 5-6"). Flattened, no field parsed and the card read
  // "NaN °C". Split, both crops carry real figures.
  await pickSpecies(page, 'watermelon', 'Citrullus lanatus');
  await page.locator('[data-tab-target="species"]').click();

  await expect(page.locator('#germinationValue')).toContainText('35 °C');
  await expect(page.locator('#germinationMeta')).toContainText('4-5 days');
  await expect(page.locator('body')).not.toContainText('NaN');

  await page.selectOption('#cropGroup', 'triploid watermelon');
  await expect(page.locator('#germinationMeta')).toContainText('5-6 days');
});

test('germination day ranges are not dropped', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  // parse_number silently discarded every ranged value, so lettuce, cucumber,
  // eggplant, muskmelon, onion and watermelon showed no days to germinate.
  await pickSpecies(page, 'lettuce', 'Lactuca sativa');
  await page.locator('[data-tab-target="species"]').click();
  await expect(page.locator('#germinationMeta')).toContainText('2-3 days');
});

test('conflicting seed-count sources are shown as a range with both citations', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await pickSpecies(page, 'lettuce', 'Lactuca sativa');

  await expect(page.locator('#countPerOzMeta')).toContainText('disagree');
  await expect(page.locator('#countPerOzValue')).toContainText('-');
  await expect(page.locator('#warningList')).toContainText('Seed-count sources disagree');

  await page.locator('[data-tab-target="count"]').click();
  await expect(page.locator('#countsTableBody tr')).toHaveCount(3);
});

test('measured count overrides the lookup and reports thousand-seed weight', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await page.locator('[data-tab-target="count"]').click();
  await page.fill('#measuredSeedCount', '100');
  await page.fill('#measuredSampleMass', '3.2');

  await expect(page.locator('#tswValue')).toContainText('32.00 g');
  await expect(page.locator('#countPerOzValue')).toContainText('886');
  await expect(page.locator('#countPerOzMeta')).toContainText('From your sample');
  await expect(page.locator('#packetSeedsMeta')).toContainText('measured basis');
});

test('a ten-seed sample on a coarse scale is warned about', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await page.locator('[data-tab-target="count"]').click();
  await page.fill('#measuredSeedCount', '10');
  await page.fill('#measuredSampleMass', '0.05');

  await expect(page.locator('#warningList')).toContainText('counting error');
  await expect(page.locator('#warningList')).toContainText('scale resolution');
});

test('the tomato seeds-per-ounce correction reaches the UI with its note', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await pickSpecies(page, 'tomato', 'Solanum lycopersicum');
  await page.locator('[data-tab-target="count"]').click();

  const correctedRow = page.locator('#countsTableBody tr', { hasText: 'Nebraska Extension G2090' });
  await expect(correctedRow).toContainText('transcription error');
  await expect(correctedRow).toContainText('7,087');
});

test('freezer conditions clamp to the validity box and say so', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await page.locator('[data-tab-target="storage"]').click();
  await page.locator('[data-preset="freezer"]').click();

  await expect(page.locator('#warningList')).toContainText("outside Harrington's validity range");
  await expect(page.locator('#warningList')).toContainText('clamped to 0 °C');
  await expect(page.locator('#warningList li.clamp').first()).toBeVisible();
});

test('storing at the baseline leaves published longevity untouched', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await page.locator('[data-tab-target="storage"]').click();
  await page.fill('#storageTemperature', '5');
  await page.fill('#storageMoisture', '8');

  await expect(page.locator('#multiplierValue')).toContainText('1.00×');
  await expect(page.locator('#moistureFactorValue')).toContainText('1.00×');
  await expect(page.locator('#temperatureFactorValue')).toContainText('1.00×');
});

test('the Hundred Rule separates a warm pantry from a fridge', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await page.locator('[data-tab-target="storage"]').click();

  await page.locator('[data-preset="pantry"]').click();
  await expect(page.locator('#hundredRuleValue')).toContainText('✗');
  await expect(page.locator('#hundredRuleMeta')).toContainText('over 100');

  await page.locator('[data-preset="fridge"]').click();
  await expect(page.locator('#hundredRuleValue')).toContainText('✓');
  await expect(page.locator('#hundredRuleMeta')).toContainText('under 100');
});

test('every documented equation reproduces its literature anchor', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await page.click('#showMathBtn');
  await expect(page.locator('#mathModal')).toBeVisible();
  await page.click('#mathModalRunAll');

  await expect(page.locator('#mathModalStatus')).toContainText('reproduce their literature anchors');
  await expect(page.locator('.equation-result.fail')).toHaveCount(0);
  const passes = await page.locator('.equation-result.pass').count();
  expect(passes).toBeGreaterThanOrEqual(15);

  await page.click('#mathModalClose');
  await expect(page.locator('#mathModal')).toBeHidden();
});

test('the checks panel passes every literature check', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await page.locator('#checksCard summary').click();
  await expect(page.locator('#checksBody .check-status.fail')).toHaveCount(0);
  const summary = await page.locator('#checksSummary').textContent();
  expect(summary).toMatch(/^(\d+)\/\1 passing$/);
  await expect(page.locator('#checksBody')).toContainText('No recalcitrant species receives a storage-life projection');
});

test('settings survive a reload and reset restores the defaults', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await pickSpecies(page, 'tomato', 'Solanum lycopersicum');
  await page.locator('[data-tab-target="storage"]').click();
  await page.fill('#storageMoisture', '7');

  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#speciesSearch')).toHaveValue('tomato');
  await page.locator('[data-tab-target="storage"]').click();
  await expect(page.locator('#storageMoisture')).toHaveValue('7');

  await page.click('#resetBtn');
  await expect(page.locator('#speciesSearch')).toHaveValue('lettuce');
  await page.locator('[data-tab-target="storage"]').click();
  await expect(page.locator('#storageMoisture')).toHaveValue('6');
});

// --- scope disclaimer -----------------------------------------------------
// The old block was already a native details element with good content, 186
// words and 4 of 5 legal elements. The rebuild moves it onto the shared card,
// adds the missing clauses, and names the variables the model cannot see.

test('scope disclaimer spans the layout and names what the model cannot see', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');
  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();

  const box = await card.boundingBox();
  const layout = await page.locator('main.seed-layout').boundingBox();
  expect(box.width).toBeGreaterThan(layout.width * 0.9);

  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // Kept from the old block.
  await expect(body).toContainText("Harrington's storage rules of thumb");
  await expect(body).toContainText('20 to 100 seeds on damp paper towel');
  await expect(body).toContainText('A refusal is an answer');

  // Added: the variables a thumb-rule projection cannot see.
  await expect(body).toContainText('Starting viability matters more than storage time and is invisible here');
  await expect(body).toContainText('cycling is worse than a steady average at the same mean');
  await expect(body).toContainText('a container that was not actually airtight');
});

test('scope disclaimer carries a touchpoint outside the results header', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');
  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('A projection, not a test');
  // It first landed between the inner and outer divs of .panel-header.
  const inHeader = await touch.evaluate((el) => Boolean(el.closest('.panel-header')));
  expect(inHeader).toBe(false);
  const inResults = await touch.evaluate((el) => Boolean(el.closest('.result-panel')));
  expect(inResults).toBe(true);
});

// ---------------------------------------------------------------------------
// Ellis-Roberts viability equation. Anchors are read in Node from the archived
// CSVs, so a generator slip cannot hide in the bundle.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const SEED_DATA_DIR = path.resolve(__dirname, '..', '..', 'data', 'seed_storage_lab');
const SEED_PAGE = '/tools/seed-storage-lab.html';

function readSeedCsv(name) {
  const text = fs.readFileSync(path.join(SEED_DATA_DIR, name), 'utf8').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((cells) => cells.length > 1)
    .map((cells) => Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ''])));
}

const LOT = { initialViabilityPct: 95, targetViabilityPct: 85 };
const LETTUCE = { KE: 6.895, CW: 4.2, CH: 0.0329, CQ: 0.000478 };

async function openSeedLab(page, baseURL) {
  await expectPageToLoadCleanly(page, baseURL, SEED_PAGE);
  await expect.poll(() => page.evaluate(() => typeof window.SeedViability)).toBe('object');
}

test('Hay worked examples reproduce to the day from the archived anchors', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const anchors = readSeedCsv('viability_equation_anchors.csv').filter((row) => row.expected_sigma_days);
  expect(anchors.map((row) => row.anchor_id)).toEqual(['lettuce-genebank', 'lettuce-underdried', 'barley-genebank']);

  const got = await page.evaluate((rows) => rows.map((row) => window.SeedViability.sigmaDays(
    { KE: Number(row.KE), CW: Number(row.CW), CH: Number(row.CH), CQ: Number(row.CQ) },
    Number(row.moisture_pct), Number(row.temperature_c))), anchors);

  anchors.forEach((row, index) => {
    expect(Math.round(got[index]), row.anchor_id).toBe(Number(row.expected_sigma_days));
  });
  // Pinned as literals too, so an edit to the CSV cannot move the goalposts.
  expect(got.map(Math.round)).toEqual([56040, 12404, 244961]);
});

test('the compendium longevity column reproduces from the raw appendix CSV', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const rows = readSeedCsv('kew_viability_constants_appendix1.csv')
    .filter((row) => [row.KE, row.CW, row.CH, row.CQ, row.years_minus20c_5pct].every((value) => value !== ''));
  expect(rows.length).toBe(66);

  const years = await page.evaluate((sets) => sets.map((row) => window.SeedViability.sigmaDays(
    { KE: Number(row.KE), CW: Number(row.CW), CH: Number(row.CH), CQ: Number(row.CQ) }, 5, -20)
    / window.SeedViability.DAYS_PER_YEAR), rows);

  const outside = rows
    .map((row, index) => ({ species: row.species, error: Math.abs(years[index] / Number(row.years_minus20c_5pct) - 1) }))
    .filter((entry) => entry.error > 0.03);
  // Ranunculus is printed as 24 against a computed 25.3, the only row outside 3%.
  expect(outside.map((entry) => entry.species)).toEqual(['Ranunculus sceleratus']);
  expect(outside[0].error).toBeLessThan(0.06);
});

test('the normal distribution matches independent reference values', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  // Python references: 0.5 * math.erfc(-z / sqrt(2)) and NormalDist.inv_cdf.
  // NormalDist.cdf loses the lower tail to cancellation.
  const cdf = [[1, 0.8413447460685428], [-2, 0.022750131948179216], [-5, 2.8665157187919455e-07],
    [3.0902, 0.998999891216793], [0.25, 0.5987063256829237]];
  const inv = [[0.85, 1.0364333894937894], [0.95, 1.6448536269514715], [0.999, 3.090232306167813],
    [0.01, -2.3263478740408408]];

  const got = await page.evaluate(({ cdfPoints, invPoints }) => ({
    cdf: cdfPoints.map(([z]) => window.SeedViability.normalCdf(z)),
    inv: invPoints.map(([p]) => window.SeedViability.inverseNormalCdf(p)),
    roundTrip: Math.max(...Array.from({ length: 999 }, (_, i) => (i + 1) / 1000)
      .map((p) => Math.abs(window.SeedViability.normalCdf(window.SeedViability.inverseNormalCdf(p)) - p))),
    edges: [0, 1, -0.1, 1.2, NaN].map((p) => window.SeedViability.inverseNormalCdf(p))
  }), { cdfPoints: cdf, invPoints: inv });

  cdf.forEach(([z, want], index) => {
    // Relative, so the 3e-7 tail value is held as tightly as the centre.
    expect(Math.abs(got.cdf[index] / want - 1), `cdf(${z})`).toBeLessThan(1e-11);
  });
  inv.forEach(([p, want], index) => {
    expect(Math.abs(got.inv[index] - want), `inverse(${p})`).toBeLessThan(1e-9);
  });
  expect(got.roundTrip).toBeLessThan(1e-12);
  expect(got.edges.every((value) => Number.isNaN(value))).toBe(true);
});

test('viability durations come from probit differences times sigma', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const result = await page.evaluate(({ set, lot }) => {
    const E = window.SeedViability;
    const p = E.predictDetermination(set, { scientificName: 'Lactuca sativa', moisturePct: 6, temperatureC: 5, ...lot });
    return {
      ok: p.ok, flags: p.flags.map((item) => item.code), sigma: p.sigmaDays,
      toTarget: p.daysToTarget / E.DAYS_PER_YEAR, toHalf: p.daysToHalf / E.DAYS_PER_YEAR,
      atTarget: E.viabilityAfterDays(p.sigmaDays, p.initialNed, p.daysToTarget),
      atHalf: E.viabilityAfterDays(p.sigmaDays, p.initialNed, p.daysToHalf),
      atStart: E.viabilityAfterDays(p.sigmaDays, p.initialNed, 0),
      probit: p.initialProbit
    };
  }, { set: LETTUCE, lot: LOT });

  expect(result.ok).toBe(true);
  expect(result.flags).toEqual([]);
  // Hand-computed outside the engine: sigma 2820.43 d, 4.698 y to 85%, 12.701 y to 50%.
  expect(result.sigma).toBeCloseTo(2820.43, 1);
  expect(result.toTarget).toBeCloseTo(4.698, 2);
  expect(result.toHalf).toBeCloseTo(12.701, 2);
  // The curve passes through the points the durations claim.
  expect(result.atStart).toBeCloseTo(95, 9);
  expect(result.atTarget).toBeCloseTo(85, 9);
  expect(result.atHalf).toBeCloseTo(50, 9);
  expect(result.probit).toBeCloseTo(6.6449, 4);
});

test('a parameter set is held at its turning point, and nothing runs below -20 C', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const out = await page.evaluate(({ universal, lot }) => {
    const E = window.SeedViability;
    // Liquidambar styraciflua as printed in Appendix I: turns over at -2.7 C.
    const sweetgum = { KE: 6.55309, CW: 3.033052, CH: 0.0081, CQ: 0.00151 };
    const run = (set, t) => E.predictDetermination(set, { moisturePct: 8, temperatureC: t, ...lot });
    const codes = (p) => p.flags.map((item) => item.code);
    return {
      turnUniversal: E.turningPointC(universal),
      turnSweetgum: E.turningPointC(sweetgum),
      rawColderIsWorse: E.sigmaDays(sweetgum, 8, -18) < E.sigmaDays(sweetgum, 8, 0),
      sweetgumAtTurn: run(sweetgum, E.turningPointC(sweetgum)).sigmaDays,
      sweetgumFreezer: run(sweetgum, -18).sigmaDays,
      sweetgumFreezerCodes: codes(run(sweetgum, -18)),
      sweetgumAppliedT: run(sweetgum, -18).applied.temperatureC,
      at20: run(universal, -20).sigmaDays,
      at40: run(universal, -40).sigmaDays,
      codes40: codes(run(universal, -40)),
      codes18: codes(run(universal, -18)),
      codes13: codes(run(universal, -13)),
      hot: run(universal, 91)
    };
  }, { universal: LETTUCE, lot: LOT });

  expect(out.turnUniversal).toBeCloseTo(-34.414, 3);
  expect(out.turnSweetgum).toBeCloseTo(-2.682, 3);
  // As published, the equation says a freezer is worse than a fridge for this set.
  expect(out.rawColderIsWorse).toBe(true);
  expect(out.sweetgumFreezer).toBe(out.sweetgumAtTurn);
  expect(out.sweetgumAppliedT).toBeCloseTo(-2.682, 3);
  expect(out.sweetgumFreezerCodes).toContain('turning-point');

  expect(out.at40).toBe(out.at20);
  expect(out.codes40).toEqual(['temperature-floor', 'cold-extrapolation']);
  expect(out.codes18).toEqual(['cold-extrapolation']);
  expect(out.codes13).toEqual([]);
  expect(out.hot.ok).toBe(false);
  expect(out.hot.reason).toContain('90');
});

test('the moisture limits plateau, flag and refuse', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const out = await page.evaluate(({ set, lot }) => {
    const E = window.SeedViability;
    const run = (name, m, constants = set) => E.predictDetermination(constants,
      { scientificName: name, moisturePct: m, temperatureC: 5, ...lot });
    const codes = (p) => (p.flags || []).map((item) => item.code);
    return {
      limits: E.SPECIES_MOISTURE_LIMITS,
      peaAt6: run('Pisum sativum', 6).sigmaDays,
      peaAt4: run('Pisum sativum', 4).sigmaDays,
      peaAt4Codes: codes(run('Pisum sativum', 4)),
      peaAt4Applied: run('Pisum sativum', 4).applied.moisturePct,
      unknownAt4Codes: codes(run('Unknown species', 4)),
      unknownAt4: run('Unknown species', 4).sigmaDays,
      rawAt4: E.sigmaDays(set, 4, 5),
      unknownAt1: run('Unknown species', 1).sigmaDays,
      unknownAt2: run('Unknown species', 2).sigmaDays,
      unknownAt1Codes: codes(run('Unknown species', 1)),
      unknownAt8Codes: codes(run('Unknown species', 8)),
      unknownAt20Codes: codes(run('Unknown species', 20)),
      unknownAt29: run('Unknown species', 29),
      lettuceAt15: run('Lactuca sativa', 15).ok,
      lettuceAt16: run('Lactuca sativa', 16),
      testedRange: codes(run('Capsicum annuum', 6.5, { ...set, moistureRangeTestedPct: '7.0-12.1' })),
      insideTested: codes(run('Capsicum annuum', 8, { ...set, moistureRangeTestedPct: '7.0-12.1' }))
    };
  }, { set: LETTUCE, lot: LOT });

  // The limits as the 1996 compendium states them in section 3.3.
  expect(out.limits['Pisum sativum'].lowerPct).toBe(6);
  expect(out.limits['Vigna radiata'].lowerPct).toBe(6);
  expect(out.limits['Oryza sativa'].lowerPct).toBe(4.5);
  expect(out.limits['Eragrostis tef']).toEqual({ lowerPct: 4.5, upperPct: 24 });
  expect(out.limits['Helianthus annuus'].lowerPct).toBe(2);
  expect(out.limits['Lactuca sativa'].upperPct).toBe(15);
  expect(out.limits['Allium cepa'].upperPct).toBe(18);

  expect(out.peaAt4).toBe(out.peaAt6);
  expect(out.peaAt4Applied).toBe(6);
  expect(out.peaAt4Codes).toEqual(['low-moisture-plateau']);

  // Unrecorded species: computed as entered, but flagged, inside the 2-6% band.
  expect(out.unknownAt4).toBe(out.rawAt4);
  expect(out.unknownAt4Codes).toEqual(['low-limit-possible']);
  expect(out.unknownAt1).toBe(out.unknownAt2);
  expect(out.unknownAt1Codes).toEqual(['low-moisture-floor']);
  expect(out.unknownAt8Codes).toEqual([]);
  expect(out.unknownAt20Codes).toEqual(['upper-limit-possible']);
  expect(out.unknownAt29.ok).toBe(false);

  expect(out.lettuceAt15).toBe(true);
  expect(out.lettuceAt16.ok).toBe(false);
  expect(out.lettuceAt16.reason).toContain('15%');

  expect(out.testedRange).toContain('outside-tested-moisture');
  expect(out.insideTested).toEqual([]);
});

test('inputs no seed lot can have are refused', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const out = await page.evaluate(({ set, lot }) => {
    const E = window.SeedViability;
    const base = { scientificName: 'Lactuca sativa', moisturePct: 6, temperatureC: 5, ...lot };
    const run = (patch, constants = set) => E.predictDetermination(constants, { ...base, ...patch });
    const refused = (p) => p.ok === false && typeof p.reason === 'string' && p.reason.length > 0;
    return {
      refused: {
        zeroMoisture: refused(run({ moisturePct: 0 })),
        negativeMoisture: refused(run({ moisturePct: -3 })),
        nanMoisture: refused(run({ moisturePct: NaN })),
        blankTemperature: refused(run({ temperatureC: null })),
        infiniteTemperature: refused(run({ temperatureC: Infinity })),
        zeroInitial: refused(run({ initialViabilityPct: 0 })),
        negativeInitial: refused(run({ initialViabilityPct: -10 })),
        overInitial: refused(run({ initialViabilityPct: 120 })),
        zeroTarget: refused(run({ targetViabilityPct: 0 })),
        fullTarget: refused(run({ targetViabilityPct: 100 })),
        missingConstant: refused(run({}, { KE: 6.895, CW: 4.2, CH: 0.0329 })),
        stringConstant: refused(run({}, { ...set, CW: '4.2' })),
        noConstants: refused(run({}, null))
      },
      rawBad: [E.sigmaDays(set, 0, 5), E.sigmaDays(set, -1, 5), E.sigmaDays(null, 6, 5), E.sigmaDays(set, 6, NaN)]
        .every((value) => Number.isNaN(value)),
      full: (() => { const p = run({ initialViabilityPct: 100 }); return { ok: p.ok, applied: p.applied.initialViabilityPct, codes: p.flags.map((f) => f.code), finite: Number.isFinite(p.daysToTarget) }; })(),
      spent: (() => { const p = run({ initialViabilityPct: 80 }); return { ok: p.ok, toTarget: p.daysToTarget, toHalf: p.daysToHalf, codes: p.flags.map((f) => f.code) }; })(),
      belowHalf: (() => { const p = run({ initialViabilityPct: 40, targetViabilityPct: 30 }); return { toTarget: p.daysToTarget, toHalf: p.daysToHalf }; })()
    };
  }, { set: LETTUCE, lot: LOT });

  for (const [name, wasRefused] of Object.entries(out.refused)) {
    expect(wasRefused, name).toBe(true);
  }
  expect(out.rawBad).toBe(true);

  // 100% has no probit, so it is taken as 99.9% and flagged.
  expect(out.full).toEqual({ ok: true, applied: 99.9, codes: ['initial-capped'], finite: true });
  // A lot already under the floor has zero time left.
  expect(out.spent.ok).toBe(true);
  expect(out.spent.toTarget).toBe(0);
  expect(out.spent.toHalf).toBeGreaterThan(0);
  expect(out.spent.codes).toContain('already-below-target');
  // A lot that starts below 50% has zero time to half.
  expect(out.belowHalf.toHalf).toBe(0);
  expect(out.belowHalf.toTarget).toBeGreaterThan(0);
});

test('mixing constants across two barley fits is detectably wrong', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const years = await page.evaluate(() => {
    const E = window.SeedViability;
    const universal = { KE: 9.144, CW: 5.342, CH: 0.0329, CQ: 0.000478 };
    const speciesSpecific = { KE: 9.983, CW: 5.896, CH: 0.040, CQ: 0.000428 };
    const mixed = { ...speciesSpecific, CH: universal.CH, CQ: universal.CQ };
    return [universal, speciesSpecific, mixed].map((set) => E.sigmaDays(set, 6.17, -20) / E.DAYS_PER_YEAR);
  });
  // numeric_audit.csv: 671 y, 2453 y, and 1689 y for the mixture nobody published.
  expect(Math.round(years[0])).toBe(671);
  expect(Math.round(years[1])).toBe(2453);
  expect(Math.round(years[2])).toBe(1689);
});

test('every bundled parameter set behaves across the whole accepted range', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const sweep = await page.evaluate(async (lot) => {
    const E = window.SeedViability;
    const { SEED_SPECIES } = await import('../js/seed_storage_lab/seed-species-data.js');
    const problems = [];
    let sets = 0;
    let species = 0;
    for (const record of SEED_SPECIES) {
      if (!record.constants || !record.constants.length) continue;
      species += 1;
      for (const set of record.constants) {
        sets += 1;
        let previous = 0;
        for (let t = 90; t >= -45; t -= 1) {
          const p = E.predictDetermination(set, { scientificName: record.scientificName, moisturePct: 8, temperatureC: t, ...lot });
          if (!p.ok || !Number.isFinite(p.sigmaDays) || p.sigmaDays <= 0 || p.sigmaDays < previous * (1 - 1e-12)) {
            problems.push(`${record.scientificName} temperature ${t}`);
            break;
          }
          previous = p.sigmaDays;
        }
        const curve = E.sampleSurvivalCurve(E.predictDetermination(set,
          { scientificName: record.scientificName, moisturePct: 8, temperatureC: 5, ...lot }), { points: 40 });
        const monotone = curve.every((point, index) => index === 0 || point.percent <= curve[index - 1].percent + 1e-9);
        const bounded = curve.every((point) => point.percent >= 0 && point.percent <= 100 && Number.isFinite(point.days));
        if (curve.length !== 40 || !monotone || !bounded || Math.abs(curve[0].percent - 95) > 1e-9
          || Math.abs(curve[39].percent - 1) > 1e-6) {
          problems.push(`${record.scientificName} curve`);
        }
      }
    }
    return { sets, species, problems };
  }, LOT);

  expect(sweep.problems).toEqual([]);
  expect(sweep.species).toBe(54);
  expect(sweep.sets).toBe(71);
});

test('the default lettuce lot shows a viability range across two determinations', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);

  // 4.698 and 7.904 years, from the two published lettuce fits at 6% and 5 C.
  await expect(page.locator('#viabilityValue')).toHaveText('4.7-7.9 y');
  await expect(page.locator('#viabilityMeta')).toContainText('95.0% to 85.0%');
  await expect(page.locator('#viabilityMeta')).toContainText('sealed airtight');
  await expect(page.locator('#viabilityMeta')).toContainText('2 published determinations');
  await expect(page.locator('#viabilityMeta')).toContainText('does not average');
  await expect(page.locator('#halfLifeValue')).toHaveText('13-21 y');
  await expect(page.locator('#sigmaValue')).toHaveText('7.7-13.0 y');

  await page.locator('#viabilityCard summary').click();
  await expect(page.locator('#viabilityTableBody tr.viability-row')).toHaveCount(2);
  // Nothing is held at a limit for the default lot, so there are no note rows.
  await expect(page.locator('#viabilityTableBody tr.viability-notes')).toHaveCount(0);
  await expect(page.locator('#viabilityTableBody tr').first()).toContainText('6.895 / 4.2 / 0.0329 / 0.000478');
  await expect(page.locator('#viabilityChart svg polyline.viability-line')).toHaveCount(2);
  await expect(page.locator('#viabilityChart svg')).toHaveAttribute('aria-label', /reaches 85% after 4\.7-7\.9 y/);
  await expect(page.locator('#viabilityCard .viability-note')).toContainText('room humidity is a different quantity');
});

test('the freezer preset is answered by the equation and flagged as extrapolation', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();
  await page.locator('[data-preset="freezer"]').click();

  // Harrington still clamps to 0 C; the equation runs at -18 C as entered.
  await expect(page.locator('#warningList')).toContainText("outside Harrington's validity range");
  await expect(page.locator('#viabilityMeta')).toContainText('-18.0 °C');
  await expect(page.locator('#warningList')).toContainText('is an extrapolation');
  await expect(page.locator('#warningList')).toContainText('low-moisture limit lies between 2 and 6%');
  await expect(page.locator('#viabilityValue')).toHaveText('42-85 y');
  await page.locator('#viabilityCard summary').click();
  await expect(page.locator('#viabilityTableBody tr.viability-notes')).toHaveCount(2);
  await expect(page.locator('#viabilityTableBody tr.viability-notes').first()).toContainText('is an extrapolation');

  // Under-drying costs most of it, which is the teaching case in Hay.
  await page.fill('#storageMoisture', '8');
  await expect(page.locator('#viabilityValue')).toHaveText('5.8-7.2 y');
});

test('the seed lot inputs drive the result and survive a reload', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();

  await page.fill('#targetGermination', '50');
  await expect(page.locator('#viabilityValue')).toHaveText('13-21 y');

  await page.fill('#initialGermination', '40');
  await expect(page.locator('#viabilityValue')).toHaveText('0 days');
  await expect(page.locator('#warningList')).toContainText('has no time left');
  await expect(page.locator('#halfLifeValue')).toHaveText('0 days');

  await page.fill('#initialGermination', '100');
  await expect(page.locator('#warningList')).toContainText('Taken as 99.9%');

  await page.fill('#initialGermination', '90');
  await page.fill('#targetGermination', '70');
  await expect(page.locator('#viabilityMeta')).toContainText('90.0% to 70.0%');
  await page.reload();
  await expect(page.locator('#initialGermination')).toHaveValue('90');
  await expect(page.locator('#targetGermination')).toHaveValue('70');
  await expect(page.locator('#viabilityMeta')).toContainText('90.0% to 70.0%');

  await page.click('#resetBtn');
  await expect(page.locator('#initialGermination')).toHaveValue('95');
  await expect(page.locator('#targetGermination')).toHaveValue('85');
  await expect(page.locator('#viabilityValue')).toHaveText('4.7-7.9 y');
});

test('species without constants, and refused species, say so', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);

  await pickSpecies(page, 'tomato', 'Solanum lycopersicum');
  await expect(page.locator('#viabilityValue')).toHaveText('--');
  await expect(page.locator('#viabilityMeta')).toContainText('No published viability constants');
  await page.locator('#viabilityCard summary').click();
  await expect(page.locator('#viabilityChart')).toBeHidden();
  await expect(page.locator('#viabilityTableBody')).toContainText('No published viability constants');

  // Intermediate seed with published constants: the gate still wins.
  await pickSpecies(page, 'Khaya', 'Khaya senegalensis');
  await expect(page.locator('#viabilityValue')).toHaveText('Not modelled');
  await expect(page.locator('#viabilityMeta')).toContainText('intermediate seed');
  await expect(page.locator('#viabilityChart')).toBeHidden();

  // Out of the equation's moisture range for lettuce: refused with the reason.
  await pickSpecies(page, 'lettuce', 'Lactuca sativa');
  await page.locator('[data-tab-target="storage"]').click();
  await page.fill('#storageMoisture', '16');
  await expect(page.locator('#viabilityValue')).toHaveText('Outside the equation');
  await expect(page.locator('#viabilityMeta')).toContainText('Above about 15% moisture');
});

test('an unrecorded woody species runs on its constants and says why', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await pickSpecies(page, 'Pinus occidentalis', 'Pinus occidentalis');

  // Harrington stays withheld; the equation runs because constants exist.
  await expect(page.locator('#longevityValue')).toHaveText('Not modelled');
  await expect(page.locator('#viabilityValue')).not.toHaveText('Not modelled');
  await expect(page.locator('#viabilityValue')).not.toHaveText('--');
  await expect(page.locator('#viabilityMeta')).toContainText('fitted from dry-storage experiments');

  // One of its two sets turns over at -8.2 C, so the freezer holds it there.
  await page.locator('[data-tab-target="storage"]').click();
  await page.locator('[data-preset="freezer"]').click();
  await expect(page.locator('#warningList')).toContainText('turns over at -8.2 °C');
});

test('the viability detail card does not overflow a phone and its controls are labelled', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openSeedLab(page, baseURL);
  await page.locator('#viabilityCard summary').click();
  await expect(page.locator('#viabilityChart svg')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const chartWidth = await page.locator('#viabilityChart svg').evaluate((node) => node.getBoundingClientRect().width);
  expect(chartWidth).toBeLessThanOrEqual(375);

  for (const id of ['initialGermination', 'targetGermination']) {
    const labelled = await page.locator(`#${id}`).evaluate((node) => Boolean(node.closest('label')));
    expect(labelled, id).toBe(true);
    await expect(page.locator(`[aria-describedby="help-${id}"]`)).toHaveCount(1);
  }
});
