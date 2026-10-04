// Seed Storage Lab DOM/e2e coverage: species search and the safety gate,
// published-count conflicts, measured-count mode, Harrington clamping, the
// Hundred Rule indicator, the math modal, and the checks panel.
//
// The gate tests are the important ones. Everything else here is a formatting
// regression; a gate failure means the tool told someone their acorns keep for
// decades.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly, measureContrast } = require('./helpers.cjs');

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
  await expect(page.locator('#gateDetail')).toContainText('dies if dried');
  // Temperate recalcitrant seed keeps moist near freezing (1996 compendium, 4.2).
  await expect(page.locator('#gateDetail')).toContainText('over 3 years at -3 °C');
  await expect(page.locator('#gateDetail')).not.toContainText('cannot be stored cold');
  await expect(page.locator('#longevityValue')).toContainText('Not modeled');
  await expect(page.locator('#behaviorValue')).toContainText('recalcitrant');

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

test('species-level behavior beats the genus for Acer', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await pickSpecies(page, 'Acer saccharinum', 'Acer saccharinum');
  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'blocked');

  await pickSpecies(page, 'Acer platanoides', 'Acer platanoides');
  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'ok');
  await expect(page.locator('#longevityValue')).not.toContainText('Not modeled');
});

test('vegetatively propagated crops explain themselves instead of returning nothing', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  await pickSpecies(page, 'garlic', 'Allium sativum');

  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'not_applicable');
  await expect(page.locator('#gateHeadline')).toContainText('not grown from stored seed');
  // The curated note names the actual propagation route; the gate surfaces
  // that instead of restating the raw field value ("Propagated vegetative.").
  await expect(page.locator('#gateDetail')).toContainText('Propagated from cloves');
  await expect(page.locator('#longevityValue')).toContainText('Not modeled');
});

test('an orthodox but vegetatively grown crop says so', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  // Grape seed is orthodox and does store, so the projection runs. Saying only
  // "dry, cold storage applies" would answer a question nobody asked.
  await pickSpecies(page, 'grape', 'Vitis vinifera');

  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'ok');
  await expect(page.locator('#gateDetail')).toContainText('grown from cuttings, runners or offsets');
  await expect(page.locator('#longevityValue')).not.toContainText('Not modeled');
});

test('unflagged woody species are refused a projection', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/seed-storage-lab.html');

  // Ulmus carpinifolia has no storage-behavior record and its only seed count
  // comes from the figshare dataset, so a WPSM-source test misses it. Woody
  // status is matched on genus for this reason.
  await pickSpecies(page, 'Ulmus carpinifolia', 'Ulmus carpinifolia');

  await expect(page.locator('#gateBanner')).toHaveAttribute('data-status', 'caution');
  await expect(page.locator('#gateHeadline')).toContainText('unrecorded for this woody species');
  await expect(page.locator('#longevityValue')).toContainText('Not modeled');
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
  await expect(page.locator('#longevityValue')).not.toContainText('Not modeled');

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
  await expect(page.locator('#warningList')).toContainText('kitchen scale reading to 0.1 g');
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

  await expect(page.locator('#warningList')).toContainText("outside the range this tool applies Harrington's rules over");
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
    // Relative, so the 3e-7 tail value is held as tightly as the center.
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
  await expect(page.locator('#viabilityCard .viability-note').first()).toContainText('room humidity is a different quantity');
});

test('the freezer preset is answered by the equation and flagged as extrapolation', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();
  await page.locator('[data-preset="freezer"]').click();

  // Harrington still clamps to 0 C; the equation runs at -18 C as entered.
  await expect(page.locator('#warningList')).toContainText("outside the range this tool applies Harrington's rules over");
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
  await expect(page.locator('#viabilityValue')).toHaveText('Not modeled');
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
  await expect(page.locator('#longevityValue')).toHaveText('Not modeled');
  await expect(page.locator('#viabilityValue')).not.toHaveText('Not modeled');
  await expect(page.locator('#viabilityValue')).not.toHaveText('--');
  await expect(page.locator('#viabilityMeta')).toContainText('fitted from dry-storage experiments');

  // One of its two sets turns over at -8.2 C, so the freezer holds it there.
  await page.locator('[data-tab-target="storage"]').click();
  await page.locator('[data-preset="freezer"]').click();
  await expect(page.locator('#warningList')).toContainText('turns over at -8.2 °C');
});

test('the viability detail card does not overflow a phone and its controls are labeled', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openSeedLab(page, baseURL);
  await page.locator('#viabilityCard summary').click();
  await expect(page.locator('#viabilityChart svg')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const chartWidth = await page.locator('#viabilityChart svg').evaluate((node) => node.getBoundingClientRect().width);
  expect(chartWidth).toBeLessThanOrEqual(375);

  for (const id of ['initialGermination', 'targetGermination']) {
    const labeled = await page.locator(`#${id}`).evaluate((node) => Boolean(node.closest('label')));
    expect(labeled, id).toBe(true);
    await expect(page.locator(`[aria-describedby="help-${id}"]`)).toHaveCount(1);
  }
});

// ---------------------------------------------------------------------------
// Storage tiers and headspace oxygen. The literals below are the published
// figures, typed from Groot et al. 2015 and 2025, so a changed engine constant
// fails here even if the math modal agrees with itself.
// ---------------------------------------------------------------------------

test('one oxygen exponent reproduces both of Groot 2025 published figures', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const result = await page.evaluate(() => {
    const T = window.SeedStorageTiers;
    return {
      exponent: T.OXYGEN_EXPONENT,
      half: T.oxygenMultiplier(10.45, { rhPct: 30 }),
      twice: T.oxygenMultiplier(20.9 / 4, { rhPct: 30 }),
      floor: T.oxygenMultiplier(1, { rhPct: 30 }),
      below: T.oxygenMultiplier(0.05, { rhPct: 30 }),
      air: T.oxygenMultiplier(20.9, { rhPct: 30 }),
      at43: T.oxygenMultiplier(1, { rhPct: 43 }),
      at51: T.oxygenMultiplier(1, { rhPct: 51.5 }),
      at60: T.oxygenMultiplier(1, { rhPct: 60 }),
      at75: T.oxygenMultiplier(1, { rhPct: 75 })
    };
  });
  // "each halving ... increased seed longevity by around 72%"
  expect(result.half).toBeCloseTo(1.72, 12);
  // "Halving it twice ... 1.72^2 = 3.0 times"
  expect(result.twice).toBeCloseTo(3.0, 1);
  // "1.72^4.39 = 10.8 times longer shelf life" at 1% oxygen
  expect(Math.abs(result.floor - 10.8)).toBeLessThan(0.05);
  expect(result.below).toBe(result.floor);
  expect(result.air).toBe(1);
  expect(result.exponent).toBeCloseTo(0.7824, 4);
  // Full effect to 43% eRH, none at 60%, straight-line exponent between.
  expect(result.at43).toBe(result.floor);
  expect(result.at51).toBeCloseTo(Math.sqrt(result.floor), 12);
  expect(result.at60).toBe(1);
  expect(result.at75).toBe(1);
});

test('the lettuce jar decay reproduces both Groot accounts of it', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const result = await page.evaluate(() => {
    const T = window.SeedStorageTiers;
    const k = T.decayPerDay({ seedMassG: 10, gasMl: 47 - 18 });
    return {
      anchor: T.LETTUCE_UPTAKE,
      year: T.oxygenAtDays(20.9, k, 365) / 20.9,
      points: [112, 250, 450].map((days) => T.oxygenAtDays(20.9, k, days)),
      // Twice the seed in the same gas halves the time; the starting level does not change the rate.
      ratio: T.decayPerDay({ seedMassG: 20, gasMl: 29 }) / k,
      startFree: T.daysToOxygen(10, k, 5) === T.daysToOxygen(20, k, 10)
    };
  });
  // Groot 2015 methods: 10 g of lettuce, 18 mL, in a 47 mL jam jar, 20 C, 39% RH.
  expect(result.anchor).toMatchObject({ jarMl: 47, seedVolumeMl: 18, seedMassG: 10, rhPct: 39, temperatureC: 20 });
  // "dropped to approximately one-third of the initial value within 1 year"
  expect(result.year).toBeCloseTo(1 / 3, 12);
  // Groot 2025: "21% to around 15% in 112 days, to 10% in 250 days and to slightly above 5% in 450 days"
  expect(Math.abs(result.points[0] - 15)).toBeLessThan(0.5);
  expect(Math.abs(result.points[1] - 10)).toBeLessThan(0.5);
  expect(result.points[2]).toBeGreaterThan(5);
  expect(result.points[2]).toBeLessThan(5.5);
  expect(result.ratio).toBeCloseTo(2, 12);
  expect(result.startFree).toBe(true);
});

test('the container, vacuum and absorber set the starting oxygen', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const cases = await page.evaluate(() => {
    const T = window.SeedStorageTiers;
    const base = { containerMl: 500, seedMassG: 50, rhPct: 30, moisturePct: 6, temperatureC: 5, horizonYears: 5 };
    const run = (extra) => {
      const r = T.evaluateStorage({ ...base, ...extra });
      return { tier: r.tier, ok: r.ok, blocked: r.blocked, start: r.oxygen.startPct, m: r.oxygen.multiplier,
        codes: r.notes.map((n) => n.code), decay: Boolean(r.decay), gas: r.headspace && r.headspace.gasMl };
    };
    return {
      open: run({ container: 'open', vacuumResidualPct: 30 }),
      screw: run({ container: 'screw', vacuumResidualPct: 30 }),
      jar: run({ container: 'gasket' }),
      vacuum: run({ container: 'gasket', vacuumResidualPct: 33 }),
      foil: run({ container: 'foil' }),
      foilRead: run({ container: 'foil', vacuumResidualPct: 5 }),
      absorberNoVolume: run({ container: 'gasket', absorber: true, desiccant: true, absorberCapacityMl: 5, containerMl: null }),
      fullVacuum: run({ container: 'gasket', vacuumResidualPct: 1 }),
      absorbed: run({ container: 'gasket', absorber: true, desiccant: true, absorberCapacityMl: 100 }),
      shortAbsorber: run({ container: 'gasket', absorber: true, desiccant: true, absorberCapacityMl: 50 }),
      tooBig: run({ container: 'gasket', containerMl: 50, seedMassG: 50 }),
      ownVolume: run({ container: 'gasket', seedVolumeMl: 40 })
    };
  });
  const b = Math.log2(1.72);
  expect(cases.open).toMatchObject({ tier: 'open', start: 20.9, m: 1 });
  expect(cases.screw).toMatchObject({ tier: 'leaky-closure', start: 20.9, m: 1 });
  expect(cases.screw.codes).toContain('screw-cap');
  expect(cases.jar).toMatchObject({ tier: 'hermetic', start: 20.9, m: 1, decay: true, gas: 500 - 90 });
  expect(cases.vacuum.start).toBeCloseTo(20.9 * 0.33, 12);
  expect(cases.vacuum.m).toBeCloseTo(Math.pow(1 / 0.33, b), 12);
  // A foil bag earns nothing until the vacuum is read off a gauge.
  expect(cases.foil).toMatchObject({ tier: 'foil-vacuum', start: 20.9, m: 1, decay: false });
  expect(cases.foil.codes).toEqual(expect.arrayContaining(['foil-fragile', 'foil-no-reading']));
  expect(cases.foilRead.start).toBeCloseTo(1.045, 12);
  expect(cases.foilRead.codes).not.toContain('foil-no-reading');
  // An absorber that cannot be sized against the jar says so.
  expect(cases.absorberNoVolume.codes).toContain('absorber-unchecked');
  // At the 1% floor there is nothing left to decay toward.
  expect(cases.fullVacuum).toMatchObject({ start: 20.9 * 0.01, decay: false });
  expect(cases.absorbed).toMatchObject({ tier: 'absorber-desiccant', start: 1, decay: false });
  expect(cases.absorbed.m).toBeCloseTo(Math.pow(20.9, b), 12);
  // 410 mL of gas holds 85.69 mL of oxygen; a 50 mL absorber leaves 35.69 mL.
  expect(cases.shortAbsorber.start).toBeCloseTo((410 * 0.209 - 50) / 410 * 100, 9);
  expect(cases.shortAbsorber.codes).toContain('absorber-small');
  expect(cases.tooBig).toMatchObject({ ok: false, blocked: true });
  expect(cases.ownVolume.gas).toBe(460);
});

test('sealing wet seed, an absorber alone and treated seed are each stopped', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();
  await expect(page.locator('#containerValue')).toHaveText('Sealed with desiccant');

  // Wet seed in a sealed jar: the block leads the warning list.
  await page.fill('#storageMoisture', '14');
  await expect(page.locator('#warningList li').first()).toHaveClass(/block/);
  await expect(page.locator('#warningList li').first()).toContainText('Dry the seed first');
  await expect(page.locator('#containerValue').locator('xpath=ancestor::article')).toHaveClass(/is-blocked/);
  await page.fill('#storageRelativeHumidity', '55');
  await page.fill('#storageMoisture', '6');
  await expect(page.locator('#warningList li.block')).toContainText('above the 50% eRH');
  await page.fill('#storageRelativeHumidity', '30');
  await expect(page.locator('#warningList li.block')).toHaveCount(0);

  // Absorber with no desiccant: no projection, no equation.
  const before = await page.locator('#longevityValue').textContent();
  await page.locator('#oxygenAbsorber').check();
  await page.locator('#desiccant').uncheck();
  await expect(page.locator('#longevityValue')).toHaveText('Not modeled');
  await expect(page.locator('#viabilityValue')).toHaveText('Outside the equation');
  await expect(page.locator('#warningList li.block')).toContainText('88% within 2 days');

  // Desiccant back in: only the upper end moves, by the full oxygen factor.
  await page.locator('#desiccant').check();
  await expect(page.locator('#oxygenValue')).toHaveText('10.79×');
  await expect(page.locator('#longevityMeta')).toContainText('also multiplied by 10.79× for oxygen');
  const after = await page.locator('#longevityValue').textContent();
  const [lowBefore, highBefore] = before.replace(' y', '').split('-').map(Number);
  const [lowAfter, highAfter] = after.replace(' y', '').split('-').map(Number);
  expect(lowAfter).toBe(lowBefore);
  expect(highAfter / highBefore).toBeCloseTo(10.79, 1);
  await expect(page.locator('#warningList')).toContainText('not applied to the viability equation');

  await page.selectOption('#seedTreatment', 'pelleted');
  await expect(page.locator('#longevityValue')).toHaveText('1.0 y');
  await expect(page.locator('#longevityMeta')).toContainText('Capped at one year');
  await expect(page.locator('#viabilityValue')).toHaveText('Outside the equation');
  await page.selectOption('#seedTreatment', 'primed');
  await expect(page.locator('#longevityValue')).toHaveText('Not modeled');
  await expect(page.locator('#warningList')).toContainText('within weeks');
});

test('presets carry a container, and an open packet warns the equation off', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();

  await page.locator('[data-preset="pantry"]').click();
  await expect(page.locator('#containerType')).toHaveValue('open');
  await expect(page.locator('#desiccant')).not.toBeChecked();
  await expect(page.locator('#containerValue')).toHaveText('Open packet');
  await expect(page.locator('#oxygenValue')).toHaveText('1.00×');
  await expect(page.locator('#warningList')).toContainText('The viability equation assumes sealed storage');

  await page.locator('[data-preset="fridge"]').click();
  await expect(page.locator('#containerType')).toHaveValue('gasket');
  await expect(page.locator('#desiccant')).toBeChecked();
  await expect(page.locator('#warningList')).not.toContainText('The viability equation assumes sealed storage');
});

test('oxygen control on a short horizon is called unlikely to show', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();
  await page.fill('#vacuumResidual', '40');
  // Yildirim 2021: three of four cultivars differed only at the 48-month sampling.
  await page.fill('#storageHorizon', '3.5');
  await expect(page.locator('#warningList')).toContainText('no better than open storage at 12, 24 or 36 months');
  await expect(page.locator('#warningList')).toContainText('clearly better only at 48');
  await page.fill('#storageHorizon', '4');
  await expect(page.locator('#warningList')).not.toContainText('at 12, 24 or 36 months');
});

test('a cold sealed container carries the retrieval warning, and each missing decay says why', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();
  await expect(page.locator('#warningList')).toContainText('reach room temperature before opening it');
  await page.locator('[data-preset="pantry"]').click();
  await expect(page.locator('#warningList')).not.toContainText('reach room temperature');

  const reasons = await page.evaluate(() => {
    const T = window.SeedStorageTiers;
    const base = { rhPct: 30, moisturePct: 6, temperatureC: 20 };
    const codes = (extra) => T.evaluateStorage({ ...base, ...extra });
    return {
      warmJar: codes({ container: 'gasket', containerMl: 500, seedMassG: 50 }).notes.map((n) => n.code),
      noVolume: codes({ container: 'gasket' }).decay,
      foil: codes({ container: 'foil', containerMl: 500, seedMassG: 50 }).decay
    };
  });
  expect(reasons.warmJar).not.toContain('retrieval');
  expect(reasons.noVolume).toBeNull();
  expect(reasons.foil).toBeNull();

  await page.locator('[data-preset="fridge"]').click();
  await page.fill('#containerVolume', '');
  await page.locator('#oxygenCard summary').click();
  await expect(page.locator('#oxygenDecayNote')).toHaveText('No decay is drawn: enter the container volume and seed weight to draw it.');
  await page.selectOption('#containerType', 'foil');
  await expect(page.locator('#oxygenDecayNote')).toHaveText('No decay is drawn: the gas left in a sealed bag is not known.');
  await page.selectOption('#containerType', 'open');
  await expect(page.locator('#oxygenDecayNote')).toHaveText('No decay is drawn: this container does not hold its oxygen level.');
});

test('the oxygen chart falls, the settings persist, and a phone does not overflow', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();
  await page.fill('#vacuumResidual', '40');
  await page.locator('#oxygenCard summary').click();

  const chart = page.locator('#oxygenChart svg');
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('aria-label', /falls from 8\.4% to half that in/);
  await expect(page.locator('#oxygenDecayNote')).toContainText('mL of gas around the seed');
  const ys = await page.locator('#oxygenChart polyline').evaluate((node) => node.getAttribute('points')
    .split(' ').map((pair) => Number(pair.split(',')[1])));
  // SVG y grows downward, so falling oxygen means rising y.
  expect(ys[ys.length - 1]).toBeGreaterThan(ys[0]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.locator('#oxygenAbsorber').check();
  await page.selectOption('#containerType', 'foil');
  await page.reload();
  await page.locator('[data-tab-target="storage"]').click();
  await expect(page.locator('#oxygenAbsorber')).toBeChecked();
  await expect(page.locator('#containerType')).toHaveValue('foil');
  await expect(page.locator('#vacuumResidual')).toHaveValue('40');

  await page.click('#resetBtn');
  await expect(page.locator('#oxygenAbsorber')).not.toBeChecked();
  await expect(page.locator('#containerType')).toHaveValue('gasket');
  await expect(page.locator('#vacuumResidual')).toHaveValue('100');

  for (const id of ['containerType', 'vacuumResidual', 'oxygenAbsorber', 'desiccant', 'containerVolume', 'seedMass', 'seedVolume', 'storageHorizon', 'seedTreatment']) {
    const labeled = await page.locator(`#${id}`).evaluate((node) => Boolean(node.closest('label')));
    expect(labeled, id).toBe(true);
    await expect(page.locator(`[aria-describedby="help-${id}"]`), id).toHaveCount(1);
  }
});

// ---------------------------------------------------------------------------
// Monte Carlo. The RNG is checked against the Creatine Lab source it was copied
// from, read in Node, and the Beta draws against Beta(95.5, 5.5) quantiles
// computed outside the tool.
// ---------------------------------------------------------------------------

test('the Monte Carlo RNG draws the same sequence as the Creatine Lab original', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'js', 'creatine_lab', 'creatine-model.js'), 'utf8');
  const body = source.slice(source.indexOf('function createSeededRandom'), source.indexOf('function clamp'));
  // eslint-disable-next-line no-new-func
  const original = new Function(`${body}; return createSeededRandom;`)();
  for (const seed of [1, 42, 20261003, 0]) {
    const reference = original(seed);
    const expected = Array.from({ length: 2000 }, () => reference());
    const actual = await page.evaluate(([s]) => {
      const rng = window.SeedMonteCarlo.createSeededRandom(s);
      return Array.from({ length: 2000 }, () => rng());
    }, [seed]);
    expect(actual, `seed ${seed}`).toEqual(expected);
  }
});

test('Gamma and Beta draws match their distributions', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const stats = await page.evaluate(() => {
    const MC = window.SeedMonteCarlo;
    const rng = MC.createSeededRandom(5);
    const moments = (draw, n) => {
      let s = 0; let s2 = 0;
      for (let i = 0; i < n; i += 1) { const x = draw(); s += x; s2 += x * x; }
      return { mean: s / n, variance: s2 / n - (s / n) ** 2 };
    };
    const germination = Array.from({ length: 40000 }, () => MC.germinationPosterior(rng, 95, 100));
    return {
      gammaHalf: moments(() => MC.sampleGamma(rng, 0.5), 100000),
      gammaThree: moments(() => MC.sampleGamma(rng, 3), 100000),
      low: MC.percentile(germination, 0.025),
      high: MC.percentile(germination, 0.975),
      median: MC.percentile(germination, 0.5)
    };
  });
  // Gamma(k, 1) has mean and variance k.
  expect(Math.abs(stats.gammaHalf.mean - 0.5)).toBeLessThan(0.01);
  expect(Math.abs(stats.gammaHalf.variance - 0.5)).toBeLessThan(0.02);
  expect(Math.abs(stats.gammaThree.mean - 3)).toBeLessThan(0.03);
  expect(Math.abs(stats.gammaThree.variance - 3)).toBeLessThan(0.1);
  // scipy.stats.beta(95.5, 5.5): ppf(0.025) 0.89390, ppf(0.975) 0.98067.
  expect(Math.abs(stats.low - 89.390)).toBeLessThan(0.2);
  expect(Math.abs(stats.high - 98.067)).toBeLessThan(0.1);
  expect(stats.median).toBeGreaterThan(94.5);
  expect(stats.median).toBeLessThan(95.0);
});

test('the band closes onto the point estimate and widens with each source of doubt', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const result = await page.evaluate(() => {
    const MC = window.SeedMonteCarlo;
    const record = { scientificName: 'Lactuca sativa', constants: [{ KE: 6.895, CW: 4.2, CH: 0.0329, CQ: 0.000478 }] };
    const base = { moisturePct: 6, temperatureC: 5, initialViabilityPct: 95, targetViabilityPct: 85, draws: 400, seed: 9 };
    const width = (extra) => {
      const r = MC.runViabilityMonteCarlo(record, { ...base, ...extra });
      return { p10: r.determinations[0].daysToTarget.p10, p90: r.determinations[0].daysToTarget.p90, band: r.determinations[0].band };
    };
    const point = window.SeedViability.predictDetermination(record.constants[0], { ...base, scientificName: 'Lactuca sativa' });
    return {
      point: point.daysToTarget,
      none: width({}),
      moisture: width({ moistureSpreadPct: 1 }),
      both: width({ moistureSpreadPct: 1, temperatureSpreadC: 3 }),
      all: width({ moistureSpreadPct: 1, temperatureSpreadC: 3, testSeeds: 100 }),
      bigTest: width({ testSeeds: 10000 }),
      smallTest: width({ testSeeds: 50 })
    };
  });
  expect(result.none.p10).toBe(result.point);
  expect(result.none.p90).toBe(result.point);
  const span = (w) => w.p90 - w.p10;
  expect(span(result.moisture)).toBeGreaterThan(0);
  expect(span(result.both)).toBeGreaterThan(span(result.moisture));
  expect(span(result.all)).toBeGreaterThan(span(result.both));
  // A bigger test pins the lot down; a smaller one leaves it looser.
  expect(span(result.bigTest)).toBeLessThan(span(result.smallTest) / 5);
  // The band contains the median curve everywhere.
  for (const point of result.all.band) {
    expect(point.p10).toBeLessThanOrEqual(point.median + 1e-9);
    expect(point.median).toBeLessThanOrEqual(point.p90 + 1e-9);
  }
});

test('the probit-scale band agrees with percentiles taken on germination itself', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const worst = await page.evaluate(() => {
    const MC = window.SeedMonteCarlo;
    const V = window.SeedViability;
    const constants = { KE: 6.895, CW: 4.2, CH: 0.0329, CQ: 0.000478 };
    const options = { moisturePct: 6, moistureSpreadPct: 1, temperatureC: 5, temperatureSpreadC: 2,
      initialViabilityPct: 95, testSeeds: 100, targetViabilityPct: 85, draws: 600, seed: 4, curvePoints: 25 };
    const band = MC.runViabilityMonteCarlo({ scientificName: 'Lactuca sativa', constants: [constants] }, options).determinations[0].band;
    // Brute force: the same draws, every curve evaluated in percent, then percentiles.
    const draws = MC.drawInputs({ ...options });
    const runs = draws.map((draw) => V.predictDetermination(constants, { ...draw, targetViabilityPct: 85, scientificName: 'Lactuca sativa' }));
    let max = 0;
    for (const point of band) {
      const percents = runs.map((run) => V.viabilityAfterDays(run.sigmaDays, run.initialNed, point.days));
      max = Math.max(max,
        Math.abs(MC.percentile(percents, 0.1) - point.p10),
        Math.abs(MC.percentile(percents, 0.5) - point.median),
        Math.abs(MC.percentile(percents, 0.9) - point.p90));
    }
    return max;
  });
  // The two differ only where interpolation falls between two draws.
  expect(worst).toBeLessThan(0.5);
});

test('the page shows the band, the table column and a reproducible range', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const first = await page.locator('#monteCarloValue').textContent();
  expect(first).toMatch(/^[\d.]+-[\d.]+ y$/);
  await expect(page.locator('#monteCarloMeta')).toContainText('8 in 10 of 500 draws');
  await expect(page.locator('#monteCarloMeta')).toContainText('across 2 determinations');

  await page.locator('#viabilityCard summary').click();
  await expect(page.locator('#viabilityChart polygon.viability-band')).toHaveCount(2);
  await expect(page.locator('#viabilityTable thead')).toContainText('P10-P90');
  const cells = await page.locator('#viabilityTableBody tr.viability-row').evaluateAll((rows) =>
    rows.map((row) => row.children[4].textContent));
  expect(cells.every((text) => /-/.test(text))).toBe(true);

  // Same seed, same band; another seed moves it a little.
  await page.locator('[data-tab-target="storage"]').click();
  await page.fill('#monteCarloSeed', '7');
  await expect(page.locator('#monteCarloValue')).not.toHaveText(first);
  await page.fill('#monteCarloSeed', '20261003');
  await expect(page.locator('#monteCarloValue')).toHaveText(first);

  // No doubt at all: the range is the point estimate.
  await page.fill('#moistureSpread', '0');
  await page.fill('#temperatureSpread', '0');
  await page.fill('#testSeeds', '');
  await expect(page.locator('#monteCarloValue')).toHaveText(await page.locator('#viabilityValue').textContent());

  // Draws are held between 100 and 2,000.
  await page.fill('#monteCarloDraws', '50000');
  await expect(page.locator('#monteCarloMeta')).toContainText('of 2,000 draws');
  await page.fill('#monteCarloDraws', '3');
  await expect(page.locator('#monteCarloMeta')).toContainText('of 100 draws');

  await page.reload();
  await page.locator('[data-tab-target="storage"]').click();
  await expect(page.locator('#monteCarloDraws')).toHaveValue('3');
  await page.click('#resetBtn');
  await expect(page.locator('#monteCarloDraws')).toHaveValue('500');
  await expect(page.locator('#moistureSpread')).toHaveValue('1');
  await expect(page.locator('#monteCarloValue')).toHaveText(first);
});

test('draws past the equation are counted on the card', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();
  await page.fill('#storageMoisture', '14.5');
  await expect(page.locator('#monteCarloMeta')).toContainText('draws fell outside the equation and are left out');
  await page.fill('#moistureSpread', '0');
  await expect(page.locator('#monteCarloMeta')).not.toContainText('fell outside');

  // Where the point estimate is refused, the band says so instead of guessing.
  await page.fill('#storageMoisture', '16');
  await expect(page.locator('#monteCarloValue')).toHaveText('--');
});

test('audit regressions: the humidity input, presets and refused draws', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();

  // The humidity is the seed's, so its label and help say what to enter for a sealed jar.
  await expect(page.locator('#storageRelativeHumidity').locator('xpath=ancestor::label')).toContainText('Humidity the seed is in balance with');
  await expect(page.locator('#help-storageRelativeHumidity')).toContainText('does not count');

  // A preset resets a vacuum left over from earlier.
  await page.fill('#vacuumResidual', '40');
  await page.locator('[data-preset="fridge"]').click();
  await expect(page.locator('#vacuumResidual')).toHaveValue('100');
  await expect(page.locator('#oxygenValue')).toHaveText('1.00×');

  // Refused draws are the wettest ones, and the card says which way that leans.
  await page.fill('#storageMoisture', '14.5');
  await expect(page.locator('#monteCarloMeta')).toContainText('the range is longer than it should be');

  // The chart's spoken summary includes the band.
  await page.fill('#storageMoisture', '6');
  await page.locator('#viabilityCard summary').click();
  await expect(page.locator('#viabilityChart svg')).toHaveAttribute('aria-label', /Shaded bands hold 8 in 10 draws/);
});

// ---------------------------------------------------------------------------
// Third audit. Each test holds one defect the pass found.
// ---------------------------------------------------------------------------

test('a nursery grouping is not reported as intermediate seed', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const result = await page.evaluate(async () => {
    const M = { ...(await import('../js/seed_storage_lab/seed-model.js')), ...(await import('../js/seed_storage_lab/seed-species-data.js')) };
    const gate = (id) => M.evaluateSpeciesGate(M.getSpeciesById(id));
    const shown = M.SEED_SPECIES
      .map((record) => ({ record, gate: M.evaluateSpeciesGate(record) }))
      .filter(({ gate: g }) => g.status !== 'ok' && g.status !== 'assumed');
    return {
      cherry: gate('prunus-americana'),
      hawthorn: gate('crataegus'),
      names: M.getSpeciesById('prunus-americana').commonNames,
      // Notes are read by the user, so none may carry curation shorthand.
      internal: shown.filter(({ gate: g }) => /WE HOLD|must NOT|Same compendium|held from WPSM/.test(g.detail))
        .map(({ record }) => record.scientificName),
      cutMidFigure: shown.filter(({ gate: g }) => /[=,(]\s*$/.test(g.detail)).map(({ record }) => record.scientificName),
      leadingConjunction: M.SEED_SPECIES.filter((record) => (record.commonNames || []).some((name) => /^(and|or)\s/.test(name)))
        .map((record) => record.scientificName)
    };
  });
  // Holmes & Buszewicz 1958 group 2 is "moist briefly or dry for long", which
  // Roberts' scheme calls orthodox; the species records agree 33 of 34.
  for (const g of [result.cherry, result.hawthorn]) {
    expect(g.behavior).toBe('unconfirmed');
    expect(g.status).toBe('caution');
    expect(g.allowLongevity).toBe(false);
    expect(g.detail).toContain('Holmes & Buszewicz 1958');
    expect(g.detail).not.toMatch(/intermediate seed/);
  }
  expect(result.cherry.headline).toContain('plum (Prunus americana)');
  expect(result.names).toContain('plum');
  expect(result.internal).toEqual([]);
  expect(result.cutMidFigure).toEqual([]);
  expect(result.leadingConjunction).toEqual([]);
});

test('the Hundred Rule never rounds onto its own line', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const rule = await page.evaluate(async () => {
    const M = await import('../js/seed_storage_lab/seed-model.js');
    return [58.6, 59, 59.4, 30].map((rh) => M.hundredRule({ temperatureC: 5, relativeHumidityPct: rh }));
  });
  expect(rule[0].pass).toBe(true);
  expect(rule[0].detail).toContain('= 99.6, under 100');
  expect(rule[1].pass).toBe(false);
  expect(rule[1].detail).toContain('= 100.0, not under 100');
  expect(rule[2].detail).toContain('= 100.4, over 100');
  expect(rule[3].detail).toContain('41 °F + 30% RH = 71, under 100');

  await page.locator('[data-tab-target="storage"]').click();
  await page.fill('#storageTemperature', '5');
  await page.fill('#storageRelativeHumidity', '58.6');
  await expect(page.locator('#hundredRuleValue')).toHaveText('99.6 ✓');
});

test('a Fahrenheit entry is rounded in the clamp warning', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();
  await page.selectOption('#storageTemperatureUnit', 'F');
  await page.fill('#storageTemperature', '0');
  await expect(page.locator('#warningList')).toContainText('Storage temperature -17.8 °C is outside');
  await expect(page.locator('#warningList')).not.toContainText('-17.777');
});

test('the weighing warning follows the rounding of a 0.1 g scale', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const warnings = await page.evaluate(async () => {
    const M = await import('../js/seed_storage_lab/seed-model.js');
    return [0.05, 0.08, 0.6, 4.9, 5].map((grams) =>
      M.countFromMeasurement({ seedCount: 100, sampleMass: grams }).warnings.join(' '));
  });
  expect(warnings[0]).toContain('cannot tell 0.05 g from nothing');
  // 100 lettuce seeds weigh about 0.08 g; half a 0.1 g step is 63% of that.
  expect(warnings[1]).toContain('a 0.08 g reading up to 63% out');
  expect(warnings[1]).not.toContain('ten times');
  expect(warnings[2]).toContain('a 0.6 g reading up to 8.3% out');
  expect(warnings[2]).toContain('ten times that on a scale reading to 1 g');
  expect(warnings[3]).toContain('a 4.9 g reading up to 1.0% out');
  expect(warnings[4]).toBe('');
});

test('the longevity warnings do not cite a seed older than the horizon they set', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();
  await page.fill('#baselineTemperature', '25');
  await page.fill('#baselineMoisture', '12');
  await page.fill('#storageTemperature', '0');
  await page.fill('#storageMoisture', '5');
  await expect(page.locator('#warningList')).toContainText('No seed lot in storage has been followed');
  await expect(page.locator('#warningList')).not.toContainText('date palm');
});

test('three disagreeing count sources are not called both', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await expect(page.locator('#warningList')).toContainText('Each is shown in the Count tab');
  await expect(page.locator('#warningList')).not.toContainText('Both are shown');
});

test('the page runs under a strict CSP and the maths dialog manages focus', async ({ page, baseURL }) => {
  const violations = [];
  page.on('console', (message) => { if (/Content Security Policy/i.test(message.text())) violations.push(message.text()); });
  await openSeedLab(page, baseURL);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');

  // Tabs are toggle buttons, so the row is a group; a tablist with no tabs is announced empty.
  await expect(page.locator('.tab-row')).toHaveAttribute('role', 'group');

  await page.locator('#showMathBtn').click();
  await expect(page.locator('#mathModalClose')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mathModal')).toBeHidden();
  await expect(page.locator('#showMathBtn')).toBeFocused();

  await page.locator('[data-tab-target="storage"]').click();
  await page.locator('#viabilityCard summary').click();
  await page.fill('#monteCarloDraws', '2000');
  await expect(page.locator('#monteCarloMeta')).toContainText('of 2,000 draws');
  expect(violations).toEqual([]);
});

// ---------------------------------------------------------------------------
// Measured rather than assumed: contrast, overflow, targets and speed.
// ---------------------------------------------------------------------------

const TEXT_SELECTOR = 'header p, header h1, main p, main li, main td, main th, main label > span, main summary, main h2, main h3, '
  + 'main button, main .result-card div, main .result-card span, main legend';

test('every text style on every tab clears AA in both themes', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const failures = [];
  let measured = 0;
  for (const tab of ['species', 'count', 'storage']) {
    await page.locator(`[data-tab-target="${tab}"]`).click();
    for (const theme of ['dark', 'light']) {
      const results = await measureContrast(page, TEXT_SELECTOR, theme);
      measured += results.length;
      failures.push(...results.filter((m) => !m.pass).map((m) => `${tab} ${theme}: "${m.text}" (${m.cls}) ${m.ratio}:1`));
      // Chart text is painted by fill, which the shared helper does not read.
      const ticks = await page.evaluate(() => {
        const parse = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        const card = (el) => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return parse(c); } return [255, 255, 255]; };
        return [...document.querySelectorAll('svg text')].filter((t) => t.getBoundingClientRect().width > 0).map((t) => {
          const a = lum(parse(getComputedStyle(t).fill)); const b = lum(card(t.closest('svg')));
          return { text: t.textContent, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
        });
      });
      measured += ticks.length;
      failures.push(...ticks.filter((t) => t.ratio < 4.5).map((t) => `${tab} ${theme} chart: "${t.text}" ${t.ratio.toFixed(2)}:1`));
    }
  }
  expect(measured).toBeGreaterThan(300);
  expect(failures).toEqual([]);
});

for (const width of [1280, 900, 768, 375]) {
  test(`nothing overflows horizontally at ${width}px on any tab`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await openSeedLab(page, baseURL);
    for (const tab of ['species', 'count', 'storage']) {
      await page.locator(`[data-tab-target="${tab}"]`).click();
      await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const wide = [];
        for (const node of document.querySelectorAll('body *')) {
          const r = node.getBoundingClientRect();
          if (r.width === 0 || r.right <= doc.clientWidth + 1) continue;
          // A table that scrolls inside its own wrapper is the intended layout.
          let scroller = node.parentElement;
          while (scroller && !/auto|scroll|hidden/.test(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
          if (!scroller) wide.push(`${node.tagName}.${node.className}`.slice(0, 60));
        }
        return { scrolls: doc.scrollWidth > doc.clientWidth + 1, wide: wide.slice(0, 5) };
      });
      expect(overflow.wide, tab).toEqual([]);
      expect(overflow.scrolls, tab).toBe(false);
    }
  });
}

test('the help chips take a 24 px pointer target', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const misses = await page.evaluate(() => [...document.querySelectorAll('.help-chip')]
    .filter((chip) => chip.getBoundingClientRect().width > 0)
    .flatMap((chip) => {
      // elementFromPoint only sees what is on screen.
      chip.scrollIntoView({ block: 'center' });
      const r = chip.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return [[-11, 0], [11, 0], [0, -11], [0, 11]]
        .filter(([dx, dy]) => document.elementFromPoint(cx + dx, cy + dy) !== chip)
        .map(([dx, dy]) => `${chip.closest('[id]') ? chip.closest('[id]').id : '?'} ${dx},${dy}`);
    }));
  expect(misses).toEqual([]);
});

test('the Monte Carlo is reused while its own inputs are unchanged', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const result = await page.evaluate(async () => {
    const M = await import('../js/seed_storage_lab/seed-model.js');
    const base = { speciesId: 'oryza-sativa', storageMoisturePct: 11, monteCarloDraws: 2000 };
    const first = M.runSeedModel(base);
    let start = performance.now();
    const unrelated = M.runSeedModel({ ...base, packetMass: 7, horizonYears: 9 });
    const reused = performance.now() - start;
    const moved = M.runSeedModel({ ...base, storageMoisturePct: 11.5 });
    return { same: first.monteCarlo === unrelated.monteCarlo, rerun: moved.monteCarlo !== first.monteCarlo,
      differs: moved.monteCarlo.daysToTarget.low !== first.monteCarlo.daysToTarget.low, reused };
  });
  expect(result.same).toBe(true);
  expect(result.rerun).toBe(true);
  expect(result.differs).toBe(true);
  // 2,000 draws on rice cost about 230 ms; a reused result is a fraction of one.
  expect(result.reused).toBeLessThan(50);
});

test('every reference names its archived copy, and every claim rests on one', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const { SEED_REFERENCES, SEED_CLAIM_AUDIT, SEED_EQUATION_SPECS } = await page.evaluate(async () => {
    const map = await import('../js/seed_storage_lab/seed-source-map.js');
    const math = await import('../js/seed_storage_lab/seed-math.js');
    return {
      SEED_REFERENCES: map.SEED_REFERENCES,
      SEED_CLAIM_AUDIT: map.SEED_CLAIM_AUDIT,
      SEED_EQUATION_SPECS: math.SEED_EQUATION_SPECS.map((spec) => ({ id: spec.id, sources: spec.sources }))
    };
  });
  const sources = path.resolve(__dirname, '..', '..', 'data', 'seed_storage_lab', 'sources');
  // The archive is local only (gitignored), so files are checked where it exists.
  const haveArchive = fs.existsSync(sources);
  const problems = [];
  for (const [key, reference] of Object.entries(SEED_REFERENCES)) {
    if (reference.archive === null) {
      if (!reference.notArchived) problems.push(`${key}: no archive and no reason`);
    } else if (typeof reference.archive !== 'string') {
      problems.push(`${key}: archive field missing`);
    } else if (haveArchive && !fs.existsSync(path.join(sources, reference.archive))) {
      problems.push(`${key}: ${reference.archive} not on disk`);
    }
  }
  const archived = (key) => SEED_REFERENCES[key] && SEED_REFERENCES[key].archive;
  for (const row of SEED_CLAIM_AUDIT) {
    for (const key of row.sourceKeys) if (!SEED_REFERENCES[key]) problems.push(`claim cites unknown ${key}`);
    if (!row.sourceKeys.some(archived)) problems.push(`claim "${row.claim.slice(0, 50)}" rests on nothing archived`);
  }
  for (const spec of SEED_EQUATION_SPECS) {
    if (!(spec.sources || []).some(archived)) problems.push(`equation ${spec.id} rests on nothing archived`);
  }
  expect(problems).toEqual([]);
  expect(Object.values(SEED_REFERENCES).filter((r) => r.archive === null).length).toBe(2);
});

// ---------------------------------------------------------------------------
// Temperature as a span: two readings of Harrington and the measured curve.
// ---------------------------------------------------------------------------

test('the temperature factor spans both Harrington readings and the measured curve', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  const result = await page.evaluate(async () => {
    const M = await import('../js/seed_storage_lab/seed-model.js');
    const at = (storageC) => M.temperatureFactors(5, storageC);
    return {
      cold: at(0), warm: at(20), hot: at(45),
      model: M.runSeedModel({ speciesId: 'lactuca-sativa', storageTemperatureC: 20, storageMoisturePct: 6 })
    };
  });
  // Values computed in Python from CH 0.0329 and CQ 0.000478.
  expect(result.warm.methods.ellisRoberts).toBeCloseTo(0.212450, 5);
  expect(result.warm.methods.fahrenheit10).toBeCloseTo(0.153893, 5);
  expect(result.warm.methods.celsius5).toBeCloseTo(0.125, 12);
  expect([result.warm.lowMethod, result.warm.highMethod]).toEqual(['celsius5', 'ellisRoberts']);
  // Cooling below the baseline: the measured curve gains least.
  expect(result.cold.methods.ellisRoberts).toBeCloseTo(1.501240, 5);
  expect([result.cold.lowMethod, result.cold.highMethod]).toEqual(['ellisRoberts', 'celsius5']);
  // Above about 38 °C the measured curve falls between the two rules.
  expect(result.hot.lowMethod).toBe('celsius5');
  expect(result.hot.highMethod).toBe('fahrenheit10');

  // The projection takes each end of the span, never a blend.
  const { multiplier, projection } = result.model;
  expect(multiplier.range.low).toBeCloseTo(multiplier.moistureMultiplier * result.warm.low, 12);
  expect(multiplier.range.high).toBeCloseTo(multiplier.moistureMultiplier * result.warm.high, 12);
  expect(projection.years.low).toBeCloseTo(projection.baseline.span.low * multiplier.range.low, 9);
  expect(projection.years.high).toBeCloseTo(projection.baseline.span.high * multiplier.range.high, 9);

  await page.locator('[data-tab-target="storage"]').click();
  await page.fill('#storageTemperature', '20');
  await expect(page.locator('#temperatureFactorValue')).toHaveText('0.13-0.21×');
  await expect(page.locator('#temperatureFactorMeta')).toContainText('Ellis-Roberts temperature terms 0.21×');
  await expect(page.locator('#temperatureFactorMeta')).toContainText('per 10 °F 0.15×');
  await expect(page.locator('#longevityMeta')).toContainText('the short end from Harrington, halving per 5 °C');
  await expect(page.locator('#longevityMeta')).toContainText('the long end from Ellis-Roberts temperature terms');
});

test('Harrington is applied up to his own 50 °C', async ({ page, baseURL }) => {
  await openSeedLab(page, baseURL);
  await page.locator('[data-tab-target="storage"]').click();
  await page.fill('#storageTemperature', '45');
  await expect(page.locator('#warningList')).not.toContainText('Storage temperature');
  await page.fill('#storageTemperature', '55');
  await expect(page.locator('#warningList')).toContainText('Storage temperature 55 °C is outside');
  await expect(page.locator('#warningList')).toContainText('(0-50 °C); clamped to 50 °C');
});
