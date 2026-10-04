// Process flow mapper: the simulation off the page's thread, the histogram as
// a table, and a rejection inside a branch as the page shows it.
//
// A big map is walked in a worker so typing is not held up, and the page
// draws again when the run for the map on screen comes back. The run is the
// same code and seed either way, so the figures must match a run on the page.
//
// The page runs script-src 'self' with no unsafe-eval, so page.waitForFunction
// is CSP-blocked and expect.poll is used instead.

const { test, expect } = require('@playwright/test');

const PAGE = '/tools/process-flow-mapper.html';

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.ProcessFlowMapper && window.ProcessFlowMapper.getModel()))).toBe(true);
  // The page redraws when the web font arrives; wait it out so it never lands inside a test.
  await page.evaluate(async () => { await document.fonts.ready; });
}

// Typing is debounced, so wait for the redraw the new text causes.
async function type(page, text) {
  const before = await page.evaluate(() => window.ProcessFlowMapper.getRenderCount());
  await page.fill('#flowText', text);
  await expect.poll(() => page.evaluate(() => window.ProcessFlowMapper.getRenderCount())).toBeGreaterThan(before);
}

// 120 steps in six lanes, every fifth sending 30% back three steps, every time a range: a slow walk.
function bigMap(extra = '') {
  const lines = [];
  for (let i = 0; i < 120; i++) {
    const next = i % 5 === 4 ? ` -> no 30%: S${i - 3}, yes 70%: S${i + 1}` : ` -> S${i + 1}`;
    lines.push(`L${i % 6}: S${i} {10-20-60 min, wait 1-3 h}${next}`);
  }
  lines.push(`L0: S120 ${extra}-> (End)`, 'L0: (End)');
  return lines.join('\n');
}

test.describe('the simulation off the page', () => {
  test('a big map is walked in a worker, the card says so meanwhile, and the result is the one a run on the page gives', async ({ page }) => {
    await openTool(page);
    const before = await page.evaluate(() => ({ ...window.ProcessFlowMapper.runSpread.stats }));
    await type(page, bigMap());
    // The redraw for the new text did not wait for the walk.
    await expect(page.locator('#spreadCard')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.ProcessFlowMapper.getModel().spread !== null)).toBe(true);
    await expect(page.locator('#spreadStats .stat')).toHaveCount(3);
    const out = await page.evaluate((text) => {
      const P = window.ProcessFlowMapper;
      const shown = P.getModel();
      const here = P.buildModel(text, { seed: shown.spread.seed });
      return { shown: shown.spread, here: here.spread, stats: { ...P.runSpread.stats } };
    }, bigMap());
    expect(out.stats.worker - before.worker).toBe(1);
    expect(out.stats.here - before.here).toBe(0);
    expect(out.shown).toEqual(out.here);
  });

  test('while a run is out the card says it is working, and a newer map drops the older run', async ({ page }) => {
    await openTool(page);
    const pending = await page.evaluate((text) => {
      const P = window.ProcessFlowMapper;
      // A runner whose worker never answers shows what the page draws meanwhile.
      const stalled = (job) => (job.visits > 0 ? { pending: true } : null);
      const m = P.buildModel(text, {}, undefined, stalled);
      return { pending: m.spreadPending, spread: m.spread, parallelMean: m.parallelMean };
    }, bigMap());
    expect(pending).toEqual({ pending: true, spread: null, parallelMean: null });

    // A stand-in worker that never answers: a second map drops the run still out for the first.
    const dropped = await page.evaluate(() => {
      const real = window.Worker;
      const made = [];
      window.Worker = class {
        constructor() { this.posted = []; this.ended = false; made.push(this); }
        addEventListener() {}
        postMessage(m) { this.posted.push(m.key); }
        terminate() { this.ended = true; }
      };
      try {
        const run = window.ProcessFlowMapper.createSpreadRunner(() => {}, { workerUrl: 'x.js', syncVisits: 0 });
        const job = (key) => ({ key, input: null, options: null, ranges: false, visits: 10 });
        const first = run(job('a'));
        const again = run(job('a'));
        const second = run(job('b'));
        return { first, again, second, stats: run.stats, workers: made.map((w) => ({ posted: w.posted, ended: w.ended })) };
      } finally {
        window.Worker = real;
      }
    });
    expect(dropped.first).toEqual({ pending: true });
    // Asking again for the map already out sends nothing new.
    expect(dropped.again).toEqual({ pending: true });
    expect(dropped.second).toEqual({ pending: true });
    expect(dropped.stats).toEqual({ here: 0, worker: 2, canceled: 1 });
    expect(dropped.workers).toEqual([{ posted: ['a'], ended: true }, { posted: ['b'], ended: false }]);

    // On the page, the card says it is working until the run comes back.
    await page.fill('#flowText', bigMap());
    await expect(page.locator('#spreadNote')).toHaveText('Working out how lead time is spread…');
    await type(page, bigMap('{1 h} '));
    await expect(page.locator('#spreadStats .stat')).toHaveCount(3);
    // What settles on screen is the spread for the text on screen, not the map typed first.
    // The first map's run can come back between the two typings and draw once more, so this waits for the page to settle.
    await expect.poll(() => page.evaluate(() => {
      const P = window.ProcessFlowMapper;
      const shown = P.getModel();
      return shown.spread !== null && JSON.stringify(shown.spread) === JSON.stringify(P.buildModel(document.getElementById('flowText').value).spread);
    })).toBe(true);
    // And the card says what the model holds, in the unit the card chose.
    const card = await page.locator('#spreadStats [data-stat="p50"] .stat-value').textContent();
    const p50 = await page.evaluate((unit) => {
      const P = window.ProcessFlowMapper;
      const m = P.getModel();
      return P.formatDuration(m.spread.p50, m.graph.calendar, unit);
    }, card.split(' ').pop());
    expect(card).toBe(p50);
  });

  test('with no worker, or one that cannot load, the walk runs on the page and the card still fills', async ({ page, context }) => {
    // No Worker at all, as in an old browser.
    await page.addInitScript(() => { window.Worker = undefined; });
    await openTool(page);
    await type(page, bigMap());
    await expect(page.locator('#spreadStats .stat')).toHaveCount(3);
    expect(await page.evaluate(() => window.ProcessFlowMapper.runSpread.stats.worker)).toBe(0);

    // A worker whose script fails to load is given up on, and the page runs the walk itself.
    const second = await context.newPage();
    await second.route('**/flow-sim-worker.js', (route) => route.abort());
    await openTool(second);
    await type(second, bigMap());
    await expect(second.locator('#spreadStats .stat')).toHaveCount(3);
    const stats = await second.evaluate(() => window.ProcessFlowMapper.runSpread.stats);
    expect(stats.worker).toBe(1);
    expect(stats.here).toBeGreaterThanOrEqual(1);
  });

  test('a small map is walked on the page at once, with no wait and no worker', async ({ page }) => {
    await openTool(page);
    const before = await page.evaluate(() => ({ ...window.ProcessFlowMapper.runSpread.stats }));
    await page.selectOption('#presetSelect', 'claim');
    // Filled in the same redraw, so it is there the moment the example is.
    expect(await page.evaluate(() => window.ProcessFlowMapper.getModel().spreadPending)).toBe(false);
    await expect(page.locator('#spreadStats .stat')).toHaveCount(3);
    const after = await page.evaluate(() => ({ ...window.ProcessFlowMapper.runSpread.stats }));
    expect(after.worker).toBe(before.worker);
  });

  test('the worker breaks no rule of the strict CSP', async ({ page }) => {
    const hits = [];
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) hits.push(m.text()); });
    await openTool(page);
    await type(page, bigMap());
    await expect(page.locator('#spreadStats .stat')).toHaveCount(3);
    expect(await page.evaluate(() => window.ProcessFlowMapper.runSpread.stats.worker)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(hits).toEqual([]);
  });
});

test.describe('the histogram as a table, and a rejection in a branch', () => {
  test('every bar is a row with its range, count and share, and the rows add up to the run', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'claim');
    const box = page.locator('#spreadTableBox');
    await expect(box).toBeVisible();
    await expect(box.locator('table')).toBeHidden();
    await box.locator('summary').click();
    const rows = page.locator('#spreadTable tbody tr');
    await expect(rows).toHaveCount(24);
    const counts = await page.locator('#spreadChart .spread-bar').evaluateAll((bars) => bars.map((b) => Number(b.getAttribute('data-count'))));
    const cells = await rows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent)));
    expect(cells.map((c) => Number(c[1].replace(/,/g, '')))).toEqual(counts);
    const units = await page.evaluate(() => window.ProcessFlowMapper.getModel().spread.units);
    expect(counts.reduce((s, c) => s + c, 0)).toBe(units);
    expect(cells[0][0]).toMatch(/ d to .* d$/);
    expect(cells[23][0]).toMatch(/ d and over$/);
    // Each row starts where the one before it stops, from the lowest time to the 99th percentile.
    const edges = await page.evaluate(() => {
      const P = window.ProcessFlowMapper;
      const m = P.getModel();
      const { from, to, counts } = m.spread.histogram;
      const w = (to - from) / counts.length;
      return counts.map((_, i) => P.formatDuration(from + i * w, m.graph.calendar, 'd'));
    });
    cells.forEach((c, i) => expect(c[0].startsWith(`${edges[i]} `), c[0]).toBe(true));
    cells.slice(0, 23).forEach((c, i) => expect(c[0].endsWith(` to ${edges[i + 1]}`), c[0]).toBe(true));
    // The row headers name what each row is about.
    await expect(page.locator('#spreadTable tbody th')).toHaveCount(24);
    // A map with no spread has no table either.
    await page.click('#projectNew');
    await expect(box).toBeHidden();
  });

  test('a rejection inside a branch is solved, drawn and listed, with each unit counted once', async ({ page }) => {
    await openTool(page);
    await type(page, [
      'A: (Start) -> S',
      'A: S {1 h} => X, Y',
      'A: X {2 h} -> ok 80%: J, no 20%: (No X)',
      'A: Y {4 h} -> ok 50%: J, no 50%: (No Y)',
      'A: J {1 h} -> (Done)',
      'A: (Done)', 'A: (No X)', 'A: (No Y)'
    ].join('\n'));
    await expect(page.locator('#headline [data-stat="lead"] .stat-value')).toHaveText('5.4 h');
    await expect(page.locator('#warningList')).not.toContainText('no figures');
    const ends = await page.locator('#endTable tbody tr').evaluateAll((trs) => trs.map((tr) => [tr.cells[0].textContent, tr.cells[1].textContent]));
    expect(ends).toEqual([['(Done)', '40%'], ['(No Y)', '40%'], ['(No X)', '20%']]);
    await expect(page.locator('#diagramHost .flow-step', { hasText: '(No Y)' })).toContainText('40% end here');
  });
});
