// Unit tests for the uncertainty-propagation math engine, run against the real
// page via window.UncertaintyEngine.
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/uncertainty-propagation.html';
let smokeServer;

test.beforeAll(async () => {
  smokeServer = await startServer({
    port: Number(process.env.PORT || 4173),
    reuseExisting: !process.env.CI
  });
});

test.afterAll(async () => {
  if (smokeServer) {
    await smokeServer.close();
    smokeServer = null;
  }
});

async function openTool(page) {
  await page.goto(TOOL_PATH);
  await page.waitForFunction(() => window.UncertaintyEngine !== undefined);
}

test.describe('parser and evaluator', () => {
  test('operator precedence and associativity', async ({ page }) => {
    await openTool(page);
    const results = await page.evaluate(() => {
      const E = window.UncertaintyEngine;
      const ev = (src, scope = {}) => E.evaluate(E.parse(src), scope);
      return {
        rightAssocPow: ev('2^3^2'),           // 2^(3^2), not (2^3)^2
        negBindsLooser: ev('-x^2', { x: 3 }), // -(x^2)
        negExponent: ev('x^-2', { x: 2 }),
        mulUnary: ev('a*-b', { a: 3, b: 4 }),
        sciNotation: ev('1.5e-3'),
        constants: ev('pi + e'),
        nested: ev('sqrt(abs(-16)) + ln(exp(2))')
      };
    });
    expect(results.rightAssocPow).toBe(512);
    expect(results.negBindsLooser).toBe(-9);
    expect(results.negExponent).toBe(0.25);
    expect(results.mulUnary).toBe(-12);
    expect(results.sciNotation).toBeCloseTo(0.0015, 12);
    expect(results.constants).toBeCloseTo(Math.PI + Math.E, 12);
    expect(results.nested).toBeCloseTo(6, 12);
  });

  test('collectVars excludes constants and de-duplicates', async ({ page }) => {
    await openTool(page);
    const vars = await page.evaluate(() => {
      const E = window.UncertaintyEngine;
      return E.collectVars(E.parse('pi * r^2 + r * e + T2'));
    });
    expect(vars).toEqual(['r', 'T2']);
  });

  test('clear errors for unknown identifiers and trailing input', async ({ page }) => {
    await openTool(page);
    const errors = await page.evaluate(() => {
      const E = window.UncertaintyEngine;
      const attempt = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
      return {
        unknownVar: attempt(() => E.evaluate(E.parse('x + y'), { x: 1 })),
        unknownFunc: attempt(() => E.evaluate(E.parse('foo(3)'), {})),
        trailing: attempt(() => E.parse('2 x'))
      };
    });
    expect(errors.unknownVar).toContain('y');
    expect(errors.unknownFunc).toContain('foo');
    expect(errors.trailing).toContain('trailing');
  });

  test('malformed numbers are rejected', async ({ page }) => {
    await openTool(page);
    const outcomes = await page.evaluate(() => {
      const E = window.UncertaintyEngine;
      const attempt = (src) => { try { return { value: E.evaluate(E.parse(src), {}) }; } catch (e) { return { error: e.message }; } };
      return { doubleDot: attempt('1.2.3'), twoDots: attempt('1..5 + 2') };
    });
    expect(outcomes.doubleDot.error).toBeTruthy();
    expect(outcomes.twoDots.error).toBeTruthy();
  });
});

test.describe('symbolic differentiation', () => {
  test('derivatives match closed forms', async ({ page }) => {
    await openTool(page);
    const d = await page.evaluate(() => {
      const E = window.UncertaintyEngine;
      const dval = (src, x, scope) => E.evaluate(E.simplify(E.differentiate(E.parse(src), x)), scope);
      return {
        powerRule: dval('x^3', 'x', { x: 2 }),
        chainExp: dval('exp(-x^2)', 'x', { x: 1 }),
        log: dval('ln(x)', 'x', { x: 5 }),
        quotient: dval('m / V', 'V', { m: 250, V: 100 }),
        varExponentBase: dval('x^y', 'x', { x: 2, y: 3 }),
        varExponentExp: dval('x^y', 'y', { x: 2, y: 3 }),
        arrheniusT: dval('A * exp(-Ea / (R * T))', 'T', { A: 1e13, Ea: 75000, R: 8.314, T: 350 }),
        trig: dval('sin(x) * cos(x)', 'x', { x: 0.7 })
      };
    });
    expect(d.powerRule).toBeCloseTo(12, 10);
    expect(d.chainExp).toBeCloseTo(-2 * Math.exp(-1), 10);
    expect(d.log).toBeCloseTo(0.2, 12);
    expect(d.quotient).toBeCloseTo(-250 / 100 ** 2, 12);
    expect(d.varExponentBase).toBeCloseTo(12, 10);
    expect(d.varExponentExp).toBeCloseTo(8 * Math.log(2), 10);
    const kT = 1e13 * Math.exp(-75000 / (8.314 * 350)) * 75000 / (8.314 * 350 * 350);
    expect(Math.abs(d.arrheniusT - kT) / kT).toBeLessThan(1e-9);
    expect(d.trig).toBeCloseTo(Math.cos(1.4), 10); // sin(x)cos(x) = sin(2x)/2
  });
});

test.describe('propagation', () => {
  test('density example matches hand calculation', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const E = window.UncertaintyEngine;
      return E.propagate(E.parse('m / V'), [
        { name: 'm', value: 250, sigma: 0.5 },
        { name: 'V', value: 100, sigma: 0.3 }
      ]);
    });
    expect(r.nominal).toBeCloseTo(2.5, 12);
    const expected = Math.sqrt((0.5 / 100) ** 2 + (250 * 0.3 / 100 ** 2) ** 2);
    expect(r.sigma).toBeCloseTo(expected, 12);
    const pctSum = r.terms.reduce((s, t) => s + t.percent, 0);
    expect(pctSum).toBeCloseTo(100, 6);
  });

  test('exact variables (sigma = 0) contribute nothing', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const E = window.UncertaintyEngine;
      return E.propagate(E.parse('P * V / (R * T)'), [
        { name: 'P', value: 101325, sigma: 150 },
        { name: 'V', value: 0.0224, sigma: 0.0001 },
        { name: 'R', value: 8.314, sigma: 0 },
        { name: 'T', value: 298.15, sigma: 0.5 }
      ]);
    });
    const rTerm = r.terms.find((t) => t.name === 'R');
    expect(Math.abs(rTerm.contrib)).toBe(0); // Math.abs folds -0 to 0
    expect(r.sigma).toBeGreaterThan(0);
  });

  // guards against the numeric central difference (which cancels to 0 here)
  // ever overriding the exact symbolic partial again
  test('partials survive badly scaled sums', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const E = window.UncertaintyEngine;
      return E.propagate(E.parse('x + 1e12'), [{ name: 'x', value: 1, sigma: 0.1 }]);
    });
    expect(r.terms[0].partial).toBeCloseTo(1, 6);
    expect(r.sigma).toBeCloseTo(0.1, 6);
  });
});

test.describe('monte carlo', () => {
  test('recovers sigma for normal and matched uniform sampling', async ({ page }) => {
    await openTool(page);
    const mc = await page.evaluate(() => {
      const E = window.UncertaintyEngine;
      const ast = E.parse('x');
      return {
        normal: E.monteCarlo(ast, [{ name: 'x', value: 0, sigma: 1 }], 200000, 'normal'),
        uniform: E.monteCarlo(ast, [{ name: 'x', value: 0, sigma: 1 }], 200000, 'uniform')
      };
    });
    // sampling error of the sigma estimate at n=200k is ~0.16%, so 2% is safe
    expect(Math.abs(mc.normal.sigma - 1)).toBeLessThan(0.02);
    expect(Math.abs(mc.normal.mean)).toBeLessThan(0.02);
    expect(Math.abs(mc.uniform.sigma - 1)).toBeLessThan(0.02);
  });

  // guards the Welford variance against regressing to the naive one-pass
  // formula, which cancels catastrophically when |mean| >> sigma
  test('variance is stable when |mean| >> sigma', async ({ page }) => {
    await openTool(page);
    const mc = await page.evaluate(() => {
      const E = window.UncertaintyEngine;
      return E.monteCarlo(E.parse('x + 1e12'), [{ name: 'x', value: 0, sigma: 1e-3 }], 100000, 'normal');
    });
    expect(Math.abs(mc.sigma - 1e-3) / 1e-3).toBeLessThan(0.05);
  });
});
