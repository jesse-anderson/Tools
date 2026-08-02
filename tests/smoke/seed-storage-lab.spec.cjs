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

  await expect(page.locator('.scope-warning-block summary')).toContainText('Model Scope / Use At Your Own Risk');
  await expect(page.locator('.scope-warning-block')).not.toHaveAttribute('open', '');
  await page.locator('.scope-warning-block summary').click();
  await expect(page.locator('.scope-warning-block')).toContainText('No warranty. No liability. No suitability claim. You assume all risk.');
  await expect(page.locator('.scope-warning-block')).toContainText('germination test');

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
