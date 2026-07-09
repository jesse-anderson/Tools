// Simple Unit Converter spec, driving the pure engine on window.UnitConverter
// plus a DOM pass over the page.
//
// The engine is a factor-table converter (value * fromFactor / toFactor) with a
// special affine path for temperature. These tests pin known reference
// conversions in every category, prove that every unit round-trips through its
// base unit, exercise the newer categories (angle, frequency, data storage) and
// units (Torr vs conventional mmHg, acre-feet), and check that the DOM wiring
// (unit selects, quick-reference chips, swap button) matches the pure engine.
const { test, expect } = require('@playwright/test');

const TOOL_PATH = '/tools/unit-converter.html';

async function openTool(page) {
  await page.goto(TOOL_PATH, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => typeof window.UnitConverter), { timeout: 10000 })
    .toBe('object');
}

// Run a conversion in the page against the real engine.
function convert(page, category, value, from, to) {
  return page.evaluate(
    ([c, v, f, t]) => window.UnitConverter.convert(c, v, f, t),
    [category, value, from, to]
  );
}

test.describe('UnitConverter engine — reference conversions', () => {
  test('length / mass / volume anchors', async ({ page }) => {
    await openTool(page);
    expect(await convert(page, 'length', 1, 'in', 'mm')).toBeCloseTo(25.4, 9);
    expect(await convert(page, 'length', 1, 'mi', 'km')).toBeCloseTo(1.609344, 9);
    expect(await convert(page, 'length', 1, 'ft', 'm')).toBeCloseTo(0.3048, 12);
    expect(await convert(page, 'mass', 1, 'lb', 'kg')).toBeCloseTo(0.45359237, 12);
    expect(await convert(page, 'mass', 1, 'oz', 'g')).toBeCloseTo(28.349523125, 9);
    expect(await convert(page, 'volume', 1, 'gal', 'L')).toBeCloseTo(3.785411784, 9);
    expect(await convert(page, 'volume', 1, 'dL', 'mL')).toBeCloseTo(100, 9);
  });

  test('pressure / energy / force / velocity / area anchors', async ({ page }) => {
    await openTool(page);
    expect(await convert(page, 'pressure', 1, 'atm', 'psi')).toBeCloseTo(14.6959488, 6);
    expect(await convert(page, 'pressure', 1, 'bar', 'kPa')).toBeCloseTo(100, 9);
    expect(await convert(page, 'pressure', 1, 'atm', 'hPa')).toBeCloseTo(1013.25, 9);
    expect(await convert(page, 'energy', 1, 'kWh', 'MJ')).toBeCloseTo(3.6, 9);
    expect(await convert(page, 'energy', 1, 'BTU', 'J')).toBeCloseTo(1055.05585262, 6);
    expect(await convert(page, 'force', 1, 'lbf', 'N')).toBeCloseTo(4.4482216152605, 9);
    expect(await convert(page, 'velocity', 100, 'km/h', 'mph')).toBeCloseTo(62.1371192, 6);
    expect(await convert(page, 'velocity', 1, 'kn', 'km/h')).toBeCloseTo(1.852, 9);
    expect(await convert(page, 'area', 1, 'acre', 'm²')).toBeCloseTo(4046.8564224, 6);
    expect(await convert(page, 'area', 1, 'mi²', 'acre')).toBeCloseTo(640, 6);
  });

  test('temperature affine conversions (including negatives and °R)', async ({ page }) => {
    await openTool(page);
    expect(await convert(page, 'temperature', 100, '°C', '°F')).toBeCloseTo(212, 9);
    expect(await convert(page, 'temperature', 0, '°C', 'K')).toBeCloseTo(273.15, 9);
    expect(await convert(page, 'temperature', -40, '°C', '°F')).toBeCloseTo(-40, 9); // the crossover
    expect(await convert(page, 'temperature', 0, '°F', '°C')).toBeCloseTo(-17.7777778, 6);
    expect(await convert(page, 'temperature', 0, 'K', '°C')).toBeCloseTo(-273.15, 9);
    expect(await convert(page, 'temperature', 671.67, '°R', '°F')).toBeCloseTo(212, 6);
    expect(await convert(page, 'temperature', 0, 'K', '°R')).toBeCloseTo(0, 9); // both absolute
  });
});

test.describe('UnitConverter engine — newer categories and units', () => {
  test('angle: degrees, revolutions, gradians, arcseconds', async ({ page }) => {
    await openTool(page);
    expect(await convert(page, 'angle', 180, 'deg', 'rad')).toBeCloseTo(Math.PI, 12);
    expect(await convert(page, 'angle', 1, 'rev', 'deg')).toBeCloseTo(360, 9);
    expect(await convert(page, 'angle', 1, 'rev', 'grad')).toBeCloseTo(400, 9);
    expect(await convert(page, 'angle', 1, 'deg', 'arcsec')).toBeCloseTo(3600, 6);
  });

  test('frequency: rpm, rad/s, decade prefixes', async ({ page }) => {
    await openTool(page);
    expect(await convert(page, 'frequency', 60, 'rpm', 'Hz')).toBeCloseTo(1, 9);
    expect(await convert(page, 'frequency', 3600, 'rpm', 'Hz')).toBeCloseTo(60, 9);
    expect(await convert(page, 'frequency', 1, 'Hz', 'rad/s')).toBeCloseTo(2 * Math.PI, 9);
    expect(await convert(page, 'frequency', 1, 'kHz', 'Hz')).toBeCloseTo(1000, 9);
  });

  test('data storage: SI (10^n) vs binary (2^n) prefixes and bits', async ({ page }) => {
    await openTool(page);
    expect(await convert(page, 'data', 1, 'KiB', 'B')).toBeCloseTo(1024, 9);
    expect(await convert(page, 'data', 1, 'MB', 'KB')).toBeCloseTo(1000, 9);
    expect(await convert(page, 'data', 8, 'bit', 'B')).toBeCloseTo(1, 9);
    expect(await convert(page, 'data', 1, 'GiB', 'MiB')).toBeCloseTo(1024, 9);
  });

  test('acre-foot is exactly 43560 cubic feet', async ({ page }) => {
    await openTool(page);
    expect(await convert(page, 'volume', 1, 'acre·ft', 'ft³')).toBeCloseTo(43560, 6);
  });

  test('Torr is exactly atm/760 and distinct from conventional mmHg', async ({ page }) => {
    await openTool(page);
    // 760 Torr is 1 atm by definition, so 1 atm -> Torr is exactly 760.
    const atmToTorr = await convert(page, 'pressure', 1, 'atm', 'Torr');
    expect(atmToTorr).toBeCloseTo(760, 9);
    // The conventional mmHg (133.322387415 Pa) is a hair larger than a Torr, so
    // 1 atm in mmHg is measurably below 760 — the two units must not collapse.
    const atmToMmHg = await convert(page, 'pressure', 1, 'atm', 'mmHg');
    expect(Math.abs(atmToMmHg - 760)).toBeGreaterThan(1e-5);
  });
});

test.describe('UnitConverter engine — invariants and guards', () => {
  test('every unit round-trips through its base unit', async ({ page }) => {
    await openTool(page);
    const worst = await page.evaluate(() => {
      const U = window.UnitConverter;
      const v = 7.5;
      let maxRelErr = 0;
      let offender = null;
      for (const [cat, def] of Object.entries(U.unitData)) {
        const base = def.baseUnit;
        for (const unit of Object.keys(def.units)) {
          const forward = U.convert(cat, v, base, unit);
          const back = U.convert(cat, forward, unit, base);
          const relErr = Math.abs(back - v) / v;
          if (relErr > maxRelErr) { maxRelErr = relErr; offender = `${cat}:${unit}`; }
        }
      }
      return { maxRelErr, offender };
    });
    expect(worst.maxRelErr).toBeLessThan(1e-9);
  });

  test('base-to-base conversion is the identity for every category', async ({ page }) => {
    await openTool(page);
    const allIdentity = await page.evaluate(() => {
      const U = window.UnitConverter;
      return Object.entries(U.unitData).every(([cat, def]) =>
        U.convert(cat, 3.25, def.baseUnit, def.baseUnit) === 3.25
      );
    });
    expect(allIdentity).toBe(true);
  });

  test('unknown category and unknown units throw', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const U = window.UnitConverter;
      const threw = (fn) => { try { fn(); return false; } catch { return true; } };
      return {
        badCategory: threw(() => U.convert('nonsense', 1, 'm', 'm')),
        badFrom: threw(() => U.convert('length', 1, 'furlong', 'm')),
        badTo: threw(() => U.convert('length', 1, 'm', 'furlong')),
        good: U.convert('length', 1, 'm', 'cm'),
      };
    });
    expect(r.badCategory).toBe(true);
    expect(r.badFrom).toBe(true);
    expect(r.badTo).toBe(true);
    expect(r.good).toBeCloseTo(100, 9);
  });

  test('formatNumber: exponential at the extremes, plain in the middle', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const f = window.UnitConverter.formatNumber;
      return { zero: f(0), whole: f(3.28084), tiny: f(1e-6), huge: f(5e10), bad: f(NaN) };
    });
    expect(r.zero).toBe('0');
    expect(r.whole).toBe('3.28084');
    expect(r.tiny).toContain('e-');   // < 1e-4 switches to scientific notation
    expect(r.huge).toContain('e+');   // >= 1e10 switches to scientific notation
    expect(r.bad).toBe('0');
  });
});

test.describe('UnitConverter engine — exact-precision factors', () => {
  // The factor table is built from exact anchors (inch, pound, lbf, BTU, ...)
  // and every derived factor is an expression of them, so no factor is a decimal
  // pre-rounded to 7-10 figures. Reconstruct the anchors here and require the
  // engine's results to match to the last bit; a regression to a rounded literal
  // (e.g. psi = 6894.757293168 or slug = 14.593903) would fail these.
  test('derived imperial factors carry full double precision', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const U = window.UnitConverter;
      const IN = 0.0254, FT = 12 * IN, LB = 0.45359237, G0 = 9.80665, LBF = LB * G0;
      return {
        lbfN: U.convert('force', 1, 'lbf', 'N'),
        lbfExact: LBF,
        btuJ: U.convert('energy', 1, 'BTU', 'J'),
        psiPa: U.convert('pressure', 1, 'psi', 'Pa'),
        psiExact: LBF / (IN * IN),
        slugKg: U.convert('mass', 1, 'slug', 'kg'),
        slugExact: LBF / FT,
        ftlbfJ: U.convert('energy', 1, 'ft·lbf', 'J'),
        ftlbfExact: FT * LBF,
      };
    });
    expect(r.lbfN).toBe(r.lbfExact);            // 4.4482216152605, not 4.44822
    expect(r.btuJ).toBe(1055.05585262);         // full IT BTU, not 1055.05585
    expect(r.psiPa).toBe(r.psiExact);           // not the rounded 6894.757293168
    expect(r.slugKg).toBe(r.slugExact);         // not the rounded 14.593903
    expect(r.ftlbfJ).toBe(r.ftlbfExact);        // not the rounded 1.3558179483
  });
});

test.describe('Unit converter DOM', () => {
  test('length select + value drives the result box and to-field', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#uc-fromUnit', 'ft');
    await page.selectOption('#uc-toUnit', 'm');
    await page.fill('#uc-fromValue', '1');
    await expect(page.locator('#uc-toValue')).toHaveValue('0.3048');
    await expect(page.locator('#uc-resultValue')).toContainText('1 ft = 0.3048 m');
  });

  test('temperature category converts 100 °C to 212 °F', async ({ page }) => {
    await openTool(page);
    await page.locator('.category-item[data-category="temperature"]').click();
    await page.selectOption('#uc-fromUnit', '°C');
    await page.selectOption('#uc-toUnit', '°F');
    await page.fill('#uc-fromValue', '100');
    await expect(page.locator('#uc-toValue')).toHaveValue('212');
    await expect(page.locator('#uc-resultValue')).toContainText('212 °F');
  });

  test('a new category (data storage) is reachable and converts', async ({ page }) => {
    await openTool(page);
    await page.locator('.category-item[data-category="data"]').click();
    await page.selectOption('#uc-fromUnit', 'KiB');
    await page.selectOption('#uc-toUnit', 'B');
    await page.fill('#uc-fromValue', '1');
    await expect(page.locator('#uc-toValue')).toHaveValue('1024');
  });

  test('a quick-reference chip loads its value and unit', async ({ page }) => {
    await openTool(page);
    // Length's first chip is "1 in = 25.4 mm"; clicking sets the from side.
    await page.locator('#uc-referenceGrid .reference-item').first().click();
    await expect(page.locator('#uc-fromValue')).toHaveValue('1');
    await expect(page.locator('#uc-fromUnit')).toHaveValue('in');
  });

  test('swap button exchanges units and reconverts', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#uc-fromUnit', 'ft');
    await page.selectOption('#uc-toUnit', 'm');
    await page.fill('#uc-fromValue', '1');
    await expect(page.locator('#uc-toValue')).toHaveValue('0.3048');

    await page.locator('#uc-swapBtn').click();
    await expect(page.locator('#uc-fromUnit')).toHaveValue('m');
    await expect(page.locator('#uc-toUnit')).toHaveValue('ft');
    // 0.3048 m carried into the from side reads back as 1 ft.
    await expect(page.locator('#uc-fromValue')).toHaveValue('0.3048');
    await expect(page.locator('#uc-toValue')).toHaveValue('1');
  });

  test('clearing the input blanks the result instead of erroring', async ({ page }) => {
    await openTool(page);
    await page.fill('#uc-fromValue', '');
    await expect(page.locator('#uc-toValue')).toHaveValue('');
    await expect(page.locator('#uc-resultValue')).toHaveText('');
  });

  test('quick-reference chips resolve exact and abbreviated unit keys', async ({ page }) => {
    await openTool(page);

    // "1 ton" must select short tons even though "Metric Tons" (tonne)
    // appears earlier in the unit list and contains "ton".
    await page.locator('.category-item[data-category="mass"]').click();
    await page.locator('#uc-referenceGrid .reference-item', { hasText: '0.9072 tonne' }).click();
    await expect(page.locator('#uc-fromUnit')).toHaveValue('ton');
    await expect(page.locator('#uc-fromValue')).toHaveValue('1');

    // "1 P" must select Poise, not Pa·s ("Pascal-seconds" contains "P").
    await page.locator('.category-item[data-category="viscosityDynamic"]').click();
    await page.locator('#uc-referenceGrid .reference-item', { hasText: '100 cP' }).click();
    await expect(page.locator('#uc-fromUnit')).toHaveValue('P');

    // "1 N" resolves through the "(N)" abbreviation in "eq/L (N)" rather
    // than hitting the "n" inside nmol/L; "1 M" likewise lands on mol/L.
    await page.locator('.category-item[data-category="concentration"]').click();
    await page.locator('#uc-referenceGrid .reference-item', { hasText: '1 M (mono)' }).click();
    await expect(page.locator('#uc-fromUnit')).toHaveValue('eq/L');
    await page.locator('#uc-referenceGrid .reference-item', { hasText: '1000 mM' }).click();
    await expect(page.locator('#uc-fromUnit')).toHaveValue('mol/L');
  });

  test('definition and warning notes track the units in play', async ({ page }) => {
    await openTool(page);
    const note = page.locator('#uc-resultNote');

    // No note for plain metric length conversions.
    await expect(note).toBeHidden();

    // Energy BTU-derived units cite the IT BTU...
    await page.locator('.category-item[data-category="energy"]').click();
    await page.selectOption('#uc-fromUnit', 'BTU');
    await page.selectOption('#uc-toUnit', 'J');
    await expect(note).toBeVisible();
    await expect(note).toContainText('International Table (1 BTU = 1055.05585262 J)');

    // ...while energy calories are thermochemical.
    await page.selectOption('#uc-fromUnit', 'kcal');
    await expect(note).toContainText('thermochemical (1 cal = 4.184 J)');

    // Power calories are International Table.
    await page.locator('.category-item[data-category="power"]').click();
    await page.selectOption('#uc-fromUnit', 'cal/s');
    await page.selectOption('#uc-toUnit', 'W');
    await expect(note).toContainText('International Table (1 cal = 4.1868 J)');

    // Conventional mmHg is flagged as distinct from Torr.
    await page.locator('.category-item[data-category="pressure"]').click();
    await page.selectOption('#uc-fromUnit', 'mmHg');
    await page.selectOption('#uc-toUnit', 'kPa');
    await expect(note).toContainText('conventional mmHg');

    // Temperatures below 0 K warn but still convert.
    await page.locator('.category-item[data-category="temperature"]').click();
    await page.selectOption('#uc-fromUnit', '°C');
    await page.selectOption('#uc-toUnit', 'K');
    await page.fill('#uc-fromValue', '-300');
    await expect(note).toContainText('absolute zero');
    await expect(page.locator('#uc-toValue')).toHaveValue('-26.85');

    // Back in range, the warning clears.
    await page.fill('#uc-fromValue', '25');
    await expect(note).toBeHidden();
  });
});
