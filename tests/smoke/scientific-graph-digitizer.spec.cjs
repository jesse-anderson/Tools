// Engine tests for the Scientific Graph Digitizer (compare workflow) via
// window.ScientificGraphCompare: pixel->data axis calibration (linear and
// log10, X and Y), numeric input parsing (scientific / power notation),
// percent-difference, series-order normalization, and ROI rect normalization.
// The calibration transforms are the tool's correctness core (a miscalibrated
// axis silently yields wrong extracted data) and previously had no coverage.
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/scientific-graph-digitizer.html';
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
  await page.waitForFunction(() => window.ScientificGraphCompare
    && window.ScientificGraphCompare.measure
    && window.ScientificGraphCompare.helpers);
}

test.describe('Y-axis calibration (pixel -> data value)', () => {
  test('linear maps baseline/tick pixels to values and extrapolates', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { calibrateYForPoint } = window.ScientificGraphCompare.measure;
      // baseline value 0 at py=500, tick value 10 at py=100 (y grows downward).
      const cal = {
        canCalibrate: true,
        baselineLine: { y: 500 },
        spanPx: 500 - 100,
        baselineValue: 0,
        axisTickValue: 10,
        scaleMode: 'linear'
      };
      const at = (y) => calibrateYForPoint({ x: 0, y }, cal);
      return { atBaseline: at(500), atTick: at(100), atMid: at(300), belowBaseline: at(700) };
    });
    expect(out.atBaseline).toBeCloseTo(0, 10);
    expect(out.atTick).toBeCloseTo(10, 10);
    expect(out.atMid).toBeCloseTo(5, 10);       // pixel midpoint -> value midpoint
    expect(out.belowBaseline).toBeCloseTo(-5, 10); // extrapolation below baseline
  });

  test('log10 interpolates geometrically (midpoint is the geometric mean)', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { calibrateYForPoint } = window.ScientificGraphCompare.measure;
      // value 1 at py=1000, value 100 at py=0.
      const cal = {
        canCalibrate: true,
        baselineLine: { y: 1000 },
        spanPx: 1000,
        baselineValue: 1,
        axisTickValue: 100,
        scaleMode: 'log10'
      };
      const at = (y) => calibrateYForPoint({ x: 0, y }, cal);
      return { atBaseline: at(1000), atTick: at(0), atMid: at(500) };
    });
    expect(out.atBaseline).toBeCloseTo(1, 9);
    expect(out.atTick).toBeCloseTo(100, 6);
    expect(out.atMid).toBeCloseTo(10, 9); // sqrt(1*100)
  });

  test('log10 rejects non-positive endpoints', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { calibrateYForPoint } = window.ScientificGraphCompare.measure;
      const cal = {
        canCalibrate: true,
        baselineLine: { y: 1000 },
        spanPx: 1000,
        baselineValue: 0,       // invalid on a log axis
        axisTickValue: 100,
        scaleMode: 'log10'
      };
      return calibrateYForPoint({ x: 0, y: 500 }, cal);
    });
    expect(out).toBeNull();
  });
});

test.describe('X-axis calibration (pixel -> data value)', () => {
  test('linear and log10 map along the X pixel span', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { calibrateXForPoint } = window.ScientificGraphCompare.measure;
      const lin = {
        canCalibrate: true,
        xOriginPoint: { x: 50 },
        spanPx: 250 - 50,
        xOriginValue: 0,
        xTickValue: 100,
        scaleMode: 'linear'
      };
      const log = {
        canCalibrate: true,
        xOriginPoint: { x: 0 },
        spanPx: 300,
        xOriginValue: 1,
        xTickValue: 1000,
        scaleMode: 'log10'
      };
      return {
        linMid: calibrateXForPoint({ x: 150, y: 0 }, lin),
        logThird: calibrateXForPoint({ x: 100, y: 0 }, log),
        logTwoThird: calibrateXForPoint({ x: 200, y: 0 }, log)
      };
    });
    expect(out.linMid).toBeCloseTo(50, 10);
    expect(out.logThird).toBeCloseTo(10, 9);      // 10^1
    expect(out.logTwoThird).toBeCloseTo(100, 8);  // 10^2
  });

  test('returns null when calibration is not ready', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { calibrateXForPoint } = window.ScientificGraphCompare.measure;
      const cal = { canCalibrate: false, xOriginPoint: { x: 0 }, spanPx: 100, xOriginValue: 0, xTickValue: 10, scaleMode: 'linear' };
      return calibrateXForPoint({ x: 50, y: 0 }, cal);
    });
    expect(out).toBeNull();
  });
});

test.describe('numeric input parsing', () => {
  test('parses plain, grouped, scientific, and power-of-ten notations', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { parseNumericInput } = window.ScientificGraphCompare.helpers;
      const p = (value) => parseNumericInput({ value });
      return {
        empty: p(''),
        plain: p('42'),
        grouped: p('1,000'),
        decimal: p('3.14'),
        sciUpper: p('1E5'),
        powerOfTen: p('10^3'),
        coeffX: p('3x10^8'),
        coeffTimes: p('3×10^8'),
        negExp: p('2*10^-3'),
        junk: p('abc')
      };
    });
    expect(out.empty).toBeNull();
    expect(out.plain).toBe(42);
    expect(out.grouped).toBe(1000);
    expect(out.decimal).toBeCloseTo(3.14, 10);
    expect(out.sciUpper).toBe(100000);
    expect(out.powerOfTen).toBeCloseTo(1000, 6);
    expect(out.coeffX).toBeCloseTo(3e8, 0);
    expect(out.coeffTimes).toBeCloseTo(3e8, 0);
    expect(out.negExp).toBeCloseTo(0.002, 10);
    expect(out.junk).toBeNull();
  });
});

test.describe('helpers: percent, series order, rect', () => {
  test('deltaPercent handles zero and non-finite references', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { deltaPercent } = window.ScientificGraphCompare.helpers;
      return {
        up: deltaPercent(150, 100),
        down: deltaPercent(50, 100),
        zeroRef: deltaPercent(5, 0),
        nan: deltaPercent(Number.NaN, 100)
      };
    });
    expect(out.up).toBeCloseTo(50, 10);
    expect(out.down).toBeCloseTo(-50, 10);
    expect(out.zeroRef).toBeNull();
    expect(out.nan).toBeNull();
  });

  test('normalizeSeriesOrder keeps control first, dedupes, and fills minimum', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { normalizeSeriesOrder, indexToLetters } = window.ScientificGraphCompare.series;
      return {
        empty: normalizeSeriesOrder([]),
        dup: normalizeSeriesOrder(['a', 'a', 'control']),
        letters: [indexToLetters(0), indexToLetters(25), indexToLetters(26)]
      };
    });
    expect(out.empty).toEqual(['control', 'a', 'b']);
    expect(out.dup).toEqual(['control', 'a', 'b']);
    expect(out.letters).toEqual(['a', 'z', 'aa']);
  });

  test('normalizeRect orders corners and enforces a minimum size', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { normalizeRect } = window.ScientificGraphCompare.helpers;
      return {
        unordered: normalizeRect({ x1: 250, y1: 400, x2: 50, y2: 100 }),
        degenerate: normalizeRect({ x1: 10, y1: 10, x2: 10, y2: 10 })
      };
    });
    expect(out.unordered).toEqual({ x: 50, y: 100, w: 200, h: 300 });
    expect(out.degenerate).toEqual({ x: 10, y: 10, w: 1, h: 1 });
  });
});
