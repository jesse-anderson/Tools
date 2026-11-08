// Milk Fat Calculator (tools/milk-fat-calculator.html): the engine through
// window.MilkFat, then the page. Strict CSP, so waits use expect.poll.
// Reference values are worked out here from the sources, not from the engine.

const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const PAGE = '/tools/milk-fat-calculator.html';
const US_CUP_ML = 3785.411784 / 16;
const FL_OZ_ML = 3785.411784 / 128;

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.MilkFat))).toBe(true);
}

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { cells.push(cell); cell = ''; }
      else cell += ch;
    }
    cells.push(cell);
    rows.push(cells);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

test.describe('engine', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('presets and legal ranges match the archived products.csv', async ({ page, request }) => {
    const csv = parseCsv(await (await request.get('/data/milk_fat_calculator/products.csv')).text());
    const data = await page.evaluate(() => ({ products: window.MilkFat.PRODUCTS, ranges: window.MilkFat.CFR_RANGES }));
    expect(data.products.map((p) => p.id)).toEqual(csv.map((r) => r.id));
    for (const row of csv) {
      const p = data.products.find((x) => x.id === row.id);
      expect(p.fdcId).toBe(Number(row.fdc_id));
      expect(p.fatPercent).toBe(Number(row.fat_g_per_100g));
      expect(p.cupGrams).toBe(Number(row.cup_grams));
      if (row.cfr_section) {
        const r = data.ranges.find((x) => x.section === row.cfr_section);
        expect(r.min).toBe(Number(row.cfr_min_percent));
        expect(r.below).toBe(row.cfr_below_percent ? Number(row.cfr_below_percent) : null);
      }
    }
  });

  test('units are exact US customary and metric measures', async ({ page }) => {
    const u = await page.evaluate(() => Object.fromEntries(window.MilkFat.UNITS.map((x) => [x.id, x.size])));
    expect(u.gal / u.floz).toBeCloseTo(128, 12);
    expect(u.cup / u.tbsp).toBeCloseTo(16, 12);
    expect(u.tbsp / u.tsp).toBeCloseTo(3, 12);
    expect(u.quart * 4).toBeCloseTo(u.gal, 9);
    expect(u.floz).toBeCloseTo(29.5735295625, 10);
    expect(u.lb).toBe(453.59237);
    expect(u.lb / u.oz).toBeCloseTo(16, 12);
    const label = await page.evaluate(() => Object.fromEntries(window.MilkFat.LABEL_UNITS.map((x) => [x.id, x.size])));
    expect(label).toEqual({ ml: 1, tbsp: 15, tsp: 5, floz: 30, cup: 240, g: 1, oz: 28 });
  });

  test('density reproduces each USDA cup weight and holds past the ends', async ({ page }) => {
    const r = await page.evaluate(() => {
      const M = window.MilkFat;
      return {
        presets: M.PRODUCTS.map((p) => [p.cupGrams, M.densityAt(p.fatPercent).gPerMl * M.US_CUP_ML]),
        mid: M.densityAt((11.5 + 19.1) / 2),
        above: M.densityAt(40),
        below: M.densityAt(0),
      };
    });
    for (const [grams, got] of r.presets) expect(got).toBeCloseTo(grams, 9);
    expect(r.mid.gPerMl * US_CUP_ML).toBeCloseTo(241, 9);
    expect(r.mid.held).toBeNull();
    expect(r.above).toEqual({ gPerMl: 238 / US_CUP_ML, held: 'above' });
    expect(r.below.held).toBe('below');
  });

  test('16 fl oz half-and-half into 64 fl oz whole milk', async ({ page }) => {
    const r = await page.evaluate(() => window.MilkFat.mix([
      { fatPercent: 11.5, amount: 16, unitId: 'floz' },
      { fatPercent: 3.25, amount: 64, unitId: 'floz' },
    ]));
    const hh = 16 * FL_OZ_ML * (242 / US_CUP_ML);
    const whole = 64 * FL_OZ_ML * (244 / US_CUP_ML);
    const fat = 0.115 * hh + 0.0325 * whole;
    expect(r.grams).toBeCloseTo(hh + whole, 9);
    expect(r.fatGrams).toBeCloseTo(fat, 9);
    expect(r.fatPercent).toBeCloseTo((100 * fat) / (hh + whole), 12);
    expect(r.fatPercent).toBeCloseTo(4.8892, 4);
    expect(r.ml).toBeCloseTo(80 * FL_OZ_ML, 9);
  });

  test('by weight the mix is the plain weighted average', async ({ page }) => {
    const r = await page.evaluate(() => window.MilkFat.mix([
      { fatPercent: 36.08, amount: 100, unitId: 'g' },
      { fatPercent: 3.25, amount: 1, unitId: 'kg' },
      { fatPercent: 0.08, amount: 1, unitId: 'lb' },
    ]));
    const grams = 100 + 1000 + 453.59237;
    expect(r.grams).toBeCloseTo(grams, 9);
    expect(r.fatPercent).toBeCloseTo((36.08 * 100 + 3.25 * 1000 + 0.08 * 453.59237) / grams, 12);
  });

  test('label rounding ranges follow 21 CFR 101.9(c)(2)', async ({ page }) => {
    const r = await page.evaluate(() => [0, 0.5, 1, 4.5, 5, 6, 13, 2.3, 5.5, -1].map((x) => window.MilkFat.labelFatRange(x)));
    expect(r).toEqual([
      { low: 0, high: 0.5 },
      { low: 0.25, high: 0.75 },
      { low: 0.75, high: 1.25 },
      { low: 4.25, high: 4.75 },
      { low: 4.75, high: 5.5 },
      { low: 5.5, high: 6.5 },
      { low: 12.5, high: 13.5 },
      null,
      null,
      null,
    ]);
  });

  test('label fat by weight is exact and by volume is self-consistent', async ({ page }) => {
    const r = await page.evaluate(() => {
      const M = window.MilkFat;
      const byWeight = M.fatFromLabel({ fatGrams: 3, servingAmount: 30, servingUnitId: 'g' });
      const byVolume = M.fatFromLabel({ fatGrams: 5, servingAmount: 1, servingUnitId: 'tbsp' });
      const check = (byVolume.fatPercent / 100) * 15 * M.densityAt(byVolume.fatPercent).gPerMl;
      const lowCheck = (byVolume.range.low / 100) * 15 * M.densityAt(byVolume.range.low).gPerMl;
      let tooMuch = null;
      try { M.fatFromLabel({ fatGrams: 20, servingAmount: 15, servingUnitId: 'g' }); } catch (e) { tooMuch = e.message; }
      return { byWeight, byVolume, check, lowCheck, tooMuch };
    });
    expect(r.byWeight.fatPercent).toBeCloseTo(10, 12);
    expect(r.byWeight.range.low).toBeCloseTo((2.75 / 30) * 100, 12);
    expect(r.byWeight.range.high).toBeCloseTo((3.25 / 30) * 100, 12);
    expect(r.check).toBeCloseTo(5, 10);
    expect(r.lowCheck).toBeCloseTo(4.75, 10);
    // A heavy cream label of 5 g per tablespoon cannot tell 32% from 36%.
    expect(r.byVolume.range.low).toBeLessThan(32);
    expect(r.byVolume.range.high).toBeGreaterThan(36);
    expect(r.tooMuch).toMatch(/cannot fit/);
  });

  test('legal fat ranges at their boundaries', async ({ page }) => {
    const r = await page.evaluate(() => [3.2499, 3.25, 10.49, 10.5, 17.999, 18, 29.99, 30, 35.99, 36, 40]
      .map((x) => { const c = window.MilkFat.classify(x); return c && c.name; }));
    expect(r).toEqual([null, 'milk', 'milk', 'half-and-half', 'half-and-half', 'light cream', 'light cream',
      'light whipping cream', 'light whipping cream', 'heavy cream', 'heavy cream']);
  });

  test('the amount to add brings the mix to the target', async ({ page }) => {
    const r = await page.evaluate(() => {
      const M = window.MilkFat;
      const base = { fatPercent: 3.25, amount: 1, unitId: 'gal' };
      const add = M.solveAddition({ base, addFatPercent: 36.08, targetPercent: 10.5, outUnitId: 'cup' });
      const check = M.mix([base, { fatPercent: 36.08, amount: add.addAmount, unitId: 'cup' }]);
      const down = M.solveAddition({ base: { fatPercent: 36.08, amount: 500, unitId: 'g' }, addFatPercent: 0.08, targetPercent: 18, outUnitId: 'g' });
      return {
        add, check,
        down,
        same: M.solveAddition({ base, addFatPercent: 11.5, targetPercent: 3.25, outUnitId: 'cup' }),
        out: M.solveAddition({ base, addFatPercent: 11.5, targetPercent: 12, outUnitId: 'cup' }),
        never: M.solveAddition({ base, addFatPercent: 11.5, targetPercent: 11.5, outUnitId: 'cup' }),
      };
    });
    expect(r.add.status).toBe('ok');
    expect(r.check.fatPercent).toBeCloseTo(10.5, 10);
    expect(r.add.total.fatPercent).toBeCloseTo(10.5, 10);
    // 500 g at 36.08% down to 18% with skim: 500 * 18.08 / 17.92 g.
    expect(r.down.addAmount).toBeCloseTo((500 * 18.08) / 17.92, 9);
    expect(r.same.addAmount).toBe(0);
    expect(r.out).toEqual({ status: 'unreachable', lo: 3.25, hi: 11.5 });
    expect(r.never).toEqual({ status: 'never' });
  });

  test('a batch fills the asked volume at the target', async ({ page }) => {
    const r = await page.evaluate(() => window.MilkFat.solveBatch({
      aFatPercent: 36.08, bFatPercent: 3.25, targetPercent: 18, amount: 1, unitId: 'quart', outUnitId: 'cup',
    }));
    expect(r.status).toBe('ok');
    expect(r.total.fatPercent).toBeCloseTo(18, 10);
    expect(r.total.ml).toBeCloseTo(US_CUP_ML * 4, 8);
    expect(r.aAmount + r.bAmount).toBeCloseTo(4, 10);
    // Mass shares from the Pearson square: (18 - 3.25) / (36.08 - 3.25) is heavy cream.
    expect(r.aGrams / (r.aGrams + r.bGrams)).toBeCloseTo(14.75 / 32.83, 12);
  });

  test('bad input is refused with the field named', async ({ page }) => {
    const r = await page.evaluate(() => {
      const M = window.MilkFat;
      const errs = [];
      for (const f of [
        () => M.mix([]),
        () => M.mix([{ name: 'Cream', fatPercent: 120, amount: 1, unitId: 'cup' }]),
        () => M.mix([{ fatPercent: 3.25, amount: -1, unitId: 'cup' }]),
        () => M.mix([{ fatPercent: 3.25, amount: NaN, unitId: 'cup' }]),
        () => M.solveBatch({ aFatPercent: 36, bFatPercent: 3.25, targetPercent: 10, amount: 0, unitId: 'cup', outUnitId: 'cup' }),
      ]) {
        try { f(); errs.push(null); } catch (e) { errs.push(e.message); }
      }
      return errs;
    });
    expect(r[0]).toMatch(/at least one/);
    expect(r[1]).toMatch(/^Cream: fat/);
    expect(r[2]).toMatch(/Ingredient 1: amount/);
    expect(r[3]).toMatch(/Ingredient 1: amount/);
    expect(r[4]).toMatch(/Batch/);
  });
});

test.describe('page', () => {
  test('loads cleanly', async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, PAGE);
  });

  test('opens on the half-and-half example and updates as amounts change', async ({ page }) => {
    await openTool(page);
    await expect(page.locator('#mixPercent')).toHaveText('4.89% fat');
    await expect(page.locator('#mixResult')).toContainText('milk range');
    await expect(page.locator('#mixResult tbody tr')).toHaveCount(2);
    const items = page.locator('#mixList fieldset.ingredient');
    await items.nth(1).getByLabel('Amount').fill('0');
    await expect(page.locator('#mixPercent')).toHaveText('11.50% fat');
    await expect(page.locator('#mixResult')).toContainText('half-and-half range');
  });

  test('ingredients can be added, changed and removed', async ({ page }) => {
    await openTool(page);
    await page.click('#addIngredient');
    const items = page.locator('#mixList fieldset.ingredient');
    await expect(items).toHaveCount(3);
    await expect(items.nth(2).locator('legend')).toHaveText('Ingredient 3');
    await items.nth(2).getByLabel('Product').selectOption('heavy');
    await expect(items.nth(2).getByLabel('Fat % (by weight)')).toHaveValue('36.08');
    await items.nth(0).getByRole('button', { name: 'Remove Ingredient 1' }).click();
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).locator('legend')).toHaveText('Ingredient 1');
    const expected = await page.evaluate(() => window.MilkFat.mix([
      { fatPercent: 3.25, amount: 64, unitId: 'floz' },
      { fatPercent: 36.08, amount: 1, unitId: 'cup' },
    ]).fatPercent.toFixed(2));
    await expect(page.locator('#mixPercent')).toHaveText(`${expected}% fat`);
    await items.nth(0).getByLabel('Amount').fill('');
    await expect(page.locator('#mixResult [role="alert"]')).toContainText("Whole milk: amount");
  });

  test('a label example shows the rounding range for the mix', async ({ page }) => {
    await openTool(page);
    await page.click('#exampleLabel');
    const first = page.locator('#mixList fieldset.ingredient').nth(0);
    await expect(first.getByLabel('Total fat (g)')).toBeVisible();
    await expect(first.getByLabel('Fat % (by weight)')).toBeHidden();
    await expect(first.locator('.hint')).toContainText('Its rounding allows');
    await expect(page.locator('#mixResult')).toContainText('Label rounding allows');
  });

  test('the target section answers, refuses the unreachable and makes batches', async ({ page }) => {
    await openTool(page);
    const expected = await page.evaluate(() => window.MilkFat.solveAddition({
      base: { fatPercent: 3.25, amount: 1, unitId: 'gal' }, addFatPercent: 36.08, targetPercent: 10.5, outUnitId: 'cup',
    }).addAmount.toLocaleString('en-US', { maximumFractionDigits: 2 }));
    await expect(page.locator('#targetAnswer')).toHaveText(`Add ${expected} cups of heavy cream.`);
    await page.fill('#targetPercent', '40');
    await expect(page.locator('#targetResult [role="alert"]')).toContainText('out of reach');
    await page.fill('#targetPercent', '18');
    await page.selectOption('#targetMode', 'batch');
    await expect(page.locator('#batchFields')).toBeVisible();
    await expect(page.locator('#targetList fieldset.ingredient').nth(0).getByLabel('Amount')).toBeHidden();
    await expect(page.locator('#targetAnswer')).toContainText('of whole milk and');
    await expect(page.locator('#targetResult')).toContainText('1 quart at 18.00% fat');
  });

  test('the disclaimer link opens the card, and a phone width does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openTool(page);
    await page.click('#exampleLabel');
    await page.selectOption('#targetMode', 'batch');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.locator('.disclaimer-link').first().click();
    await expect(page.locator('#scopeDisclaimer')).toHaveAttribute('open', '');
  });
});
