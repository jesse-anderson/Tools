// Ohm's Law calculator spec, driving the pure engine on window.OhmsLaw plus a
// DOM pass over the page.
//
// The engine solves the remaining two of V/I/R/P from any known pair, with
// Symbol sentinels for divergent (INFINITY: open/short circuit) and
// unsolvable (INVALID: 0/0, contradictory inputs, sqrt of a negative)
// results. Sentinels cannot cross page.evaluate, so tests encode them to
// strings inside the browser.
const { test, expect } = require('@playwright/test');

const TOOL_PATH = '/tools/ohms-law.html';

async function openTool(page) {
  await page.goto(TOOL_PATH, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => typeof window.OhmsLaw), { timeout: 10000 })
    .toBe('object');
}

// Run calculateFromTwo in the page and encode sentinel Symbols as strings.
function solve(page, param1, val1, param2, val2) {
  return page.evaluate(([p1, v1, p2, v2]) => {
    const OL = window.OhmsLaw;
    const enc = (v) => v === OL.INFINITY ? 'INFINITY' : v === OL.INVALID ? 'INVALID' : v;
    const r = OL.calculateFromTwo(p1, v1, p2, v2);
    return {
      voltage: enc(r.voltage),
      current: enc(r.current),
      resistance: enc(r.resistance),
      power: enc(r.power)
    };
  }, [param1, val1, param2, val2]);
}

test.describe('OhmsLaw engine — reference solutions', () => {
  test('all six pairs reproduce the 12 V / 2 A / 6 Ω / 24 W quadruple', async ({ page }) => {
    await openTool(page);

    const vi = await solve(page, 'voltage', 12, 'current', 2);
    expect(vi.resistance).toBeCloseTo(6, 12);
    expect(vi.power).toBeCloseTo(24, 12);

    const vr = await solve(page, 'voltage', 12, 'resistance', 6);
    expect(vr.current).toBeCloseTo(2, 12);
    expect(vr.power).toBeCloseTo(24, 12);

    const vp = await solve(page, 'voltage', 12, 'power', 24);
    expect(vp.current).toBeCloseTo(2, 12);
    expect(vp.resistance).toBeCloseTo(6, 12);

    const ir = await solve(page, 'current', 2, 'resistance', 6);
    expect(ir.voltage).toBeCloseTo(12, 12);
    expect(ir.power).toBeCloseTo(24, 12);

    const ip = await solve(page, 'current', 2, 'power', 24);
    expect(ip.voltage).toBeCloseTo(12, 12);
    expect(ip.resistance).toBeCloseTo(6, 12);

    const pr = await solve(page, 'power', 24, 'resistance', 6);
    expect(pr.voltage).toBeCloseTo(12, 12);
    expect(pr.current).toBeCloseTo(2, 12);
  });

  test('argument order does not matter', async ({ page }) => {
    await openTool(page);
    const a = await solve(page, 'voltage', 12, 'current', 2);
    const b = await solve(page, 'current', 2, 'voltage', 12);
    expect(b).toEqual(a);
  });

  test('divergent, indeterminate, and contradictory edge cases', async ({ page }) => {
    await openTool(page);

    // Open circuit: current is zero with voltage present.
    const open = await solve(page, 'voltage', 5, 'current', 0);
    expect(open.resistance).toBe('INFINITY');
    expect(open.power).toBe(0);

    // Short circuit: resistance is zero with voltage present.
    const short = await solve(page, 'voltage', 5, 'resistance', 0);
    expect(short.current).toBe('INFINITY');
    expect(short.power).toBe('INFINITY');

    // 0/0 is indeterminate, not infinite.
    const zz = await solve(page, 'voltage', 0, 'current', 0);
    expect(zz.resistance).toBe('INVALID');
    expect(zz.power).toBe(0);

    // Nonzero power with zero voltage (or zero current) is contradictory.
    const vp = await solve(page, 'voltage', 0, 'power', 5);
    expect(vp.current).toBe('INVALID');
    expect(vp.resistance).toBe('INVALID');
    const ip = await solve(page, 'current', 0, 'power', 0);
    expect(ip.voltage).toBe('INVALID');
    expect(ip.resistance).toBe('INVALID');

    // Zero power with voltage present is a plain open circuit.
    const zeroP = await solve(page, 'voltage', 5, 'power', 0);
    expect(zeroP.current).toBe(0);
    expect(zeroP.resistance).toBe('INFINITY');

    // V = sqrt(P*R) with a negative product must flag, not silently NaN.
    const neg = await solve(page, 'power', -5, 'resistance', 10);
    expect(neg.voltage).toBe('INVALID');
    expect(neg.current).toBe('INVALID');
  });

  test('formatNumber applies SI prefixes and guards', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const f = window.OhmsLaw.formatNumber;
      return {
        kilo: f(4700),
        giga: f(1e10),
        unit: f(12),
        milli: f(0.0022),
        nano: f(1.5e-8),
        tiny: f(1e-10),
        zero: f(0),
        nan: f(NaN)
      };
    });
    expect(r.kilo).toBe('4.700 k');
    expect(r.giga).toBe('10.00 G');
    expect(r.unit).toBe('12.0000');
    expect(r.milli).toBe('2.200 m');
    expect(r.nano).toBe('15.00 n');
    expect(r.tiny).toContain('e-');
    expect(r.zero).toBe('0');
    expect(r.nan).toBe('—');
  });

  test('isUsableValue admits only finite numbers', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const OL = window.OhmsLaw;
      return {
        number: OL.isUsableValue(5),
        zero: OL.isUsableValue(0),
        negative: OL.isUsableValue(-3),
        nul: OL.isUsableValue(null),
        nan: OL.isUsableValue(NaN),
        inf: OL.isUsableValue(Infinity),
        sentinel: OL.isUsableValue(OL.INFINITY)
      };
    });
    expect(r.number).toBe(true);
    expect(r.zero).toBe(true);
    expect(r.negative).toBe(true);
    expect(r.nul).toBe(false);
    expect(r.nan).toBe(false);
    expect(r.inf).toBe(false);
    expect(r.sentinel).toBe(false);
  });
});

test.describe('Ohm\'s Law DOM', () => {
  test('entering two values solves and highlights the other two', async ({ page }) => {
    await openTool(page);
    // Back-to-back fills land within the 300ms debounce window; per-param
    // timers must commit both (a single shared timer used to drop the first).
    await page.fill('#voltage', '12');
    await page.fill('#current', '2');

    await expect(page.locator('#resistance')).toHaveValue('6');
    await expect(page.locator('#power')).toHaveValue('24');
    await expect(page.locator('.input-card[data-param="resistance"]')).toHaveClass(/calculated/);
    await expect(page.locator('.input-card[data-param="power"]')).toHaveClass(/calculated/);

    await expect(page.locator('#formula-vir')).toHaveClass(/active/);
    await expect(page.locator('#result-vir')).toHaveText('12.0000 V');
    await expect(page.locator('#formula-pi2r')).toHaveClass(/active/);
    await expect(page.locator('#result-pi2r')).toHaveText('24.0000 W');
  });

  test('clearing an anchor drops derived values and formula highlights', async ({ page }) => {
    await openTool(page);
    await page.fill('#voltage', '12');
    await page.fill('#current', '2');
    await expect(page.locator('#resistance')).toHaveValue('6');

    await page.fill('#current', '');
    await expect(page.locator('#resistance')).toHaveValue('');
    await expect(page.locator('#power')).toHaveValue('');
    // Regression: the P = I²R row previously never lost its highlight
    // because the inactive branch targeted the wrong element.
    await expect(page.locator('#formula-pi2r')).not.toHaveClass(/active/);
    await expect(page.locator('#result-pi2r')).toHaveText('—');
    await expect(page.locator('.input-card[data-param="resistance"]')).not.toHaveClass(/calculated/);
  });

  test('an infinite result cannot be locked and never crashes the page', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openTool(page);

    // Open circuit: R becomes ∞.
    await page.fill('#voltage', '5');
    await page.fill('#current', '0');
    await expect(page.locator('.input-card[data-param="resistance"]')).toHaveClass(/error/);
    await expect(page.locator('#resistance')).toHaveAttribute('placeholder', '∞ (infinite)');

    // Locking the ∞ value is refused (arithmetic on the sentinel would throw).
    await page.locator('.lock-btn[data-lock="resistance"]').click();
    await expect(page.locator('.lock-btn[data-lock="resistance"]')).toHaveAttribute('aria-pressed', 'false');

    // Editing another field recalculates without touching the sentinel.
    await page.fill('#power', '10');
    await expect(page.locator('.input-card[data-param="voltage"]')).toHaveClass(/error/);
    expect(errors).toEqual([]);
  });

  test('a locked value unlocks when its field is cleared', async ({ page }) => {
    await openTool(page);
    await page.fill('#voltage', '5');
    // Wait past the 300ms debounce so the value is committed before locking.
    await page.waitForTimeout(400);

    await page.locator('.lock-btn[data-lock="voltage"]').click();
    await expect(page.locator('.lock-btn[data-lock="voltage"]')).toHaveAttribute('aria-pressed', 'true');

    await page.fill('#voltage', '');
    await expect(page.locator('.lock-btn[data-lock="voltage"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('typed text is never rewritten under the user', async ({ page }) => {
    await openTool(page);
    await page.fill('#resistance', '0.123456789');
    await page.waitForTimeout(700);
    await expect(page.locator('#resistance')).toHaveValue('0.123456789');
  });

  test('unit rescale keeps the user unit when no larger unit fits', async ({ page }) => {
    await openTool(page);
    await page.fill('#voltage', '1500');
    await page.waitForTimeout(400);
    // Reinterpret 1500 as μV; the conservative rescaler previously fell back
    // to the base unit and rewrote the field to "0.0015" V.
    await page.selectOption('#voltageUnit', '1e-6');
    await page.waitForTimeout(700);
    await expect(page.locator('#voltage')).toHaveValue('1500');
    await expect(page.locator('#voltageUnit')).toHaveValue('1e-6');
  });

  test('quick values and wheel segments work from the keyboard', async ({ page }) => {
    await openTool(page);

    await page.locator('.quick-value[data-voltage="5"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#voltage')).toHaveValue('5');
    await expect(page.locator('#voltageUnit')).toHaveValue('1');

    await page.locator('.wheel-segment.current').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#current')).toBeFocused();
  });
});
