// Tests the species doubling reference via window.SpeciesDoublingReference:
// integrity of the vendored SPECIES_DATA and the pure doubling/normalized-share
// math used by the comparison plot.
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/species-doubling-reference.html';
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
  await page.waitForFunction(() => window.SpeciesDoublingReference !== undefined);
}

test.describe('reference data integrity', () => {
  test('every species and behavior is well formed with a positive doubling time', async ({ page }) => {
    await openTool(page);
    const problems = await page.evaluate(() => {
      const { SPECIES_DATA } = window.SpeciesDoublingReference;
      const issues = [];
      const speciesIds = new Set();
      for (const species of SPECIES_DATA) {
        if (!species.id) issues.push(`species missing id: ${species.name}`);
        if (speciesIds.has(species.id)) issues.push(`duplicate species id: ${species.id}`);
        speciesIds.add(species.id);
        if (!species.name) issues.push(`species ${species.id} missing name`);
        if (!Array.isArray(species.behaviors) || species.behaviors.length === 0) {
          issues.push(`species ${species.id} has no behaviors`);
          continue;
        }
        const behaviorIds = new Set();
        for (const b of species.behaviors) {
          if (!b.id) issues.push(`behavior in ${species.id} missing id`);
          if (behaviorIds.has(b.id)) issues.push(`duplicate behavior id ${b.id} in ${species.id}`);
          behaviorIds.add(b.id);
          if (!(typeof b.tdMin === 'number' && Number.isFinite(b.tdMin) && b.tdMin > 0)) {
            issues.push(`behavior ${b.id} has non-positive tdMin: ${b.tdMin}`);
          }
        }
      }
      return issues;
    });
    expect(problems).toEqual([]);
  });
});

test.describe('duration conversion', () => {
  test('converts units to minutes and falls back on unknown units', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { durationToMinutes } = window.SpeciesDoublingReference;
      return {
        minutes: durationToMinutes(30, 'minutes'),
        hours: durationToMinutes(12, 'hours'),
        days: durationToMinutes(2, 'days'),
        unknown: durationToMinutes(3, 'fortnights') // -> default unit (hours)
      };
    });
    expect(out.minutes).toBe(30);
    expect(out.hours).toBe(720);
    expect(out.days).toBe(2880);
    expect(out.unknown).toBe(180);
  });
});

test.describe('doubling and normalized-share math', () => {
  test('doublings equal elapsed / doubling time', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const { computeComparisonResults } = window.SpeciesDoublingReference;
      // 12 hours = 720 minutes; td 15 and 60 min
      const results = computeComparisonResults(
        [{ behavior: { tdMin: 15 } }, { behavior: { tdMin: 60 } }],
        720
      );
      return results.map((e) => ({ doublings: e.doublings, share: e.normalizedSharePercent }));
    });
    expect(r[0].doublings).toBeCloseTo(48, 10);
    expect(r[1].doublings).toBeCloseTo(12, 10);
    // faster grower dominates; shares sum to 100
    expect(r[0].share + r[1].share).toBeCloseTo(100, 8);
    expect(r[0].share).toBeGreaterThan(99.9);
  });

  test('equal doubling times split the share evenly', async ({ page }) => {
    await openTool(page);
    const shares = await page.evaluate(() => {
      const { computeComparisonResults } = window.SpeciesDoublingReference;
      return computeComparisonResults(
        [{ behavior: { tdMin: 20 } }, { behavior: { tdMin: 20 } }, { behavior: { tdMin: 20 } }],
        600
      ).map((e) => e.normalizedSharePercent);
    });
    for (const s of shares) expect(s).toBeCloseTo(100 / 3, 8);
  });

  test('normalization stays finite for very long durations (no overflow)', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const { computeComparisonResults, durationToMinutes } = window.SpeciesDoublingReference;
      // 60 days at td 15 min is ~5760 doublings; 2^5760 overflows a double, so
      // the max-subtracted exponent is what keeps the share finite.
      const results = computeComparisonResults(
        [{ behavior: { tdMin: 15 } }, { behavior: { tdMin: 90 } }],
        durationToMinutes(60, 'days')
      );
      const total = results.reduce((s, e) => s + e.normalizedSharePercent, 0);
      return {
        allFinite: results.every((e) => Number.isFinite(e.normalizedSharePercent)),
        total,
        dominantShare: results[0].normalizedSharePercent
      };
    });
    expect(r.allFinite).toBe(true);
    expect(r.total).toBeCloseTo(100, 6);
    expect(r.dominantShare).toBeCloseTo(100, 6);
  });
});
