// Sankey diagram builder, pure layers: parser, graph, balance, layout.
// The renderer, export and page are in sankey-diagram-page.spec.cjs.
//
// Driven through the browser on window.SankeyDiagram. The page runs script-src
// 'self' with no unsafe-eval, so page.waitForFunction is CSP-blocked and
// expect.poll is used instead.
//
// There is no external reference for a layout, so the layout layer is held by
// invariants (one scale, no overlap, flow conserved at every node edge) swept
// over the shipped examples and seeded random graphs, and the balance layer by
// hand-computed goldens plus one identity that must hold for any graph.

const { test, expect } = require('@playwright/test');

const PAGE = '/tools/sankey-diagram.html';

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.SankeyDiagram && window.SankeyDiagram.getModel()))).toBe(true);
}

/** buildModel inside the page, returned as plain JSON. */
const build = (page, text, settings = {}) => page.evaluate(
  ([t, s]) => JSON.parse(JSON.stringify(window.SankeyDiagram.buildModel(t, s))),
  [text, settings]
);

const parse = (page, text) => page.evaluate((t) => window.SankeyDiagram.parser.parseFlows(t), text);

const DRYER = [
  'Slurry [500] Dryer',
  'Hot air [800] Dryer',
  'Dryer [210] Powder',
  'Dryer [1030] Exhaust',
  'Exhaust [1018] Stack',
  'Exhaust [12] Cyclone fines'
].join('\n');

// A reactor loop that balances exactly: 100 in, 30 recycled, 100 out.
const LOOP = [
  'Fresh feed [100] Mixer',
  'Mixer [130] Reactor',
  'Reactor [130] Separator',
  'Separator [95] Product',
  'Separator [5] Purge',
  'Separator [30] Mixer'
].join('\n');

test.describe('flow parser', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('reads the bracket form, CSV and TSV to the same flows', async ({ page }) => {
    const want = [{ source: 'Feed', target: 'Reactor', value: 100 }, { source: 'Reactor', target: 'Product', value: 62.5 }];
    for (const text of [
      'Feed [100] Reactor\nReactor [62.5] Product',
      'Feed,Reactor,100\nReactor,Product,62.5',
      'Feed\tReactor\t100\nReactor\tProduct\t62.5',
      'source,target,amount\nFeed,Reactor,100\nReactor,Product,62.5',
      '// a comment\n# another\n\n  Feed   [ 100 ]   Reactor  \nReactor [6.25e1] Product'
    ]) {
      const out = await parse(page, text);
      expect(out.errors, text).toEqual([]);
      expect(out.warnings, text).toEqual([]);
      expect(out.flows.map(({ source, target, value }) => ({ source, target, value })), text).toEqual(want);
    }
  });

  test('keeps a quoted CSV field that contains the delimiter', async ({ page }) => {
    const out = await parse(page, '"Feed, fresh",Reactor,10');
    expect(out.errors).toEqual([]);
    expect(out.flows[0].source).toBe('Feed, fresh');
  });

  test('a header row is skipped only before any data', async ({ page }) => {
    const out = await parse(page, 'A,B,5\nsource,target,amount');
    expect(out.flows).toHaveLength(1);
    expect(out.errors.map((e) => [e.line, e.code])).toEqual([[2, 'AMOUNT_NOT_A_NUMBER']]);
  });

  test('an amount with separators is coerced, and the reading is stated', async ({ page }) => {
    // Each of these draws a clean diagram either way, so the reading has to be visible.
    const cases = [
      ['1,5', 1.5, 'the comma taken as a decimal point'],
      ['0,25', 0.25, 'the comma taken as a decimal point'],
      ['0,250', 0.25, 'the comma taken as a decimal point'],
      ['1,2345', 1.2345, 'the comma taken as a decimal point'],
      // One comma is a decimal point even before three digits: a slipped key, not a grouping.
      ['1,234', 1.234, 'the comma taken as a decimal point'],
      ['12,345', 12.345, 'the comma taken as a decimal point'],
      ['12,345,678', 12345678, '"," taken as a thousands separator'],
      ['1.234.567', 1234567, '"." taken as a thousands separator'],
      ['1,234.5', 1234.5, '"." taken as the decimal point and "," as a thousands separator'],
      ['1.234,5', 1234.5, '"," taken as the decimal point and "." as a thousands separator']
    ];
    for (const [typed, value, reading] of cases) {
      const out = await parse(page, `A [${typed}] B`);
      expect(out.errors, typed).toEqual([]);
      expect(out.flows[0].value, typed).toBe(value);
      expect(out.warnings, typed).toHaveLength(1);
      expect(out.warnings[0]).toMatchObject({ line: 1, code: 'AMOUNT_COERCED' });
      expect(out.warnings[0].message, typed).toBe(`read "${typed}" as ${value} (${reading})`);
    }
  });

  test('a plain number is not flagged, and a grouping with no defensible reading is refused', async ({ page }) => {
    for (const typed of ['1234.5', '1.234', '1e3', '.5', '7']) {
      const out = await parse(page, `A [${typed}] B`);
      expect(out.warnings, typed).toEqual([]);
      expect(out.flows, typed).toHaveLength(1);
    }
    for (const typed of ['1,23,4', '1.2.3', '1,234.56.7', '12,34,567.8', '1234.567,8']) {
      const out = await parse(page, `A [${typed}] B`);
      expect(out.flows, typed).toEqual([]);
      expect(out.errors[0].code, typed).toBe('AMOUNT_NOT_A_NUMBER');
    }
  });

  test('a comma amount in comma CSV says how to write it', async ({ page }) => {
    const out = await parse(page, 'A,B,1,234');
    expect(out.errors[0].code).toBe('FIELD_COUNT');
    expect(out.errors[0].message).toContain('put it in double quotes');
    const quoted = await parse(page, 'A,B,"1,234"');
    expect(quoted.flows[0].value).toBe(1.234);
    expect(quoted.warnings[0].code).toBe('AMOUNT_COERCED');
  });

  test('names each bad line with its number and a specific code', async ({ page }) => {
    const out = await parse(page, [
      'A [10] B',
      'B [-4] C',
      'B [lots] C',
      'B [] C',
      'D [3] D',
      'no amount here',
      'A,B',
      ': B notacolour',
      '@ dangling note',
      '~ B: 400, 2',
      '~ B somewhere'
    ].join('\n'));
    expect(out.errors.map((e) => [e.line, e.code])).toEqual([
      [2, 'AMOUNT_NEGATIVE'],
      [3, 'AMOUNT_NOT_A_NUMBER'],
      [4, 'AMOUNT_MISSING'],
      [5, 'SELF_LOOP'],
      [6, 'LINE_NOT_UNDERSTOOD'],
      [7, 'FIELD_COUNT'],
      [8, 'COLOR_NOT_UNDERSTOOD'],
      [9, 'NOTE_NOT_UNDERSTOOD'],
      [10, 'POSITION_OUT_OF_RANGE'],
      [11, 'POSITION_NOT_UNDERSTOOD']
    ]);
    expect(out.flows).toHaveLength(1);
  });

  test('rejects Infinity, hex and trailing junk as amounts', async ({ page }) => {
    for (const amount of ['Infinity', '0x10', '12kg', '1e999', 'NaN', '1 000']) {
      const out = await parse(page, `A [${amount}] B`);
      expect(out.flows, amount).toEqual([]);
      expect(out.errors[0].code, amount).toBe('AMOUNT_NOT_A_NUMBER');
    }
  });

  test('a zero flow is dropped with a warning, not drawn and not an error', async ({ page }) => {
    const out = await parse(page, 'A [10] B\nB [0] C\nB [10] D');
    expect(out.errors).toEqual([]);
    expect(out.flows).toHaveLength(2);
    expect(out.warnings.map((w) => [w.line, w.code])).toEqual([[2, 'ZERO_FLOW']]);
  });

  test('warns when two names differ only by capitalization', async ({ page }) => {
    const out = await parse(page, 'Feed [10] Steam\nsteam [10] Vent');
    expect(out.warnings.map((w) => w.code)).toContain('CASE_VARIANTS');
    expect(out.warnings.find((w) => w.code === 'CASE_VARIANTS').message).toContain('"Steam" and "steam"');
  });

  test('reads notes, colors and positions, and flags one that names no node', async ({ page }) => {
    const out = await parse(page, 'A [10] B\n@ B: runs hot\n: A #4A3AA7\n~ B: 40%, 25.5\n: Ghost #fff');
    expect(out.errors).toEqual([]);
    expect(out.notes).toEqual({ B: 'runs hot' });
    expect(out.colors).toEqual({ A: '#4a3aa7', Ghost: '#fff' });
    expect(out.positions).toEqual({ B: { x: 40, y: 25.5 } });
    expect(out.warnings.map((w) => w.code)).toEqual(['UNKNOWN_NODE']);
  });

  test('position lines are set, replaced, removed and cleared without touching the flows', async ({ page }) => {
    const out = await page.evaluate(() => {
      const P = window.SankeyDiagram.parser;
      const base = 'A [1] B\nB [1] C\n';
      const one = P.setPositionLine(base, 'B', { x: 33.333, y: 120 });
      const two = P.setPositionLine(one, 'B', { x: 10, y: 20 });
      const both = P.setPositionLine(two, 'C', { x: 90, y: -5 });
      return { one, two, both, removed: P.setPositionLine(both, 'B', null), cleared: P.clearPositionLines(both) };
    });
    // Rounded to one decimal and clamped into range.
    expect(out.one).toBe('A [1] B\nB [1] C\n~ B: 33.3, 100');
    expect(out.two).toBe('A [1] B\nB [1] C\n~ B: 10, 20');
    expect(out.both).toBe('A [1] B\nB [1] C\n~ B: 10, 20\n~ C: 90, 0');
    expect(out.removed).toBe('A [1] B\nB [1] C\n~ C: 90, 0');
    expect(out.cleared).toBe('A [1] B\nB [1] C');
  });
});

test.describe('graph', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('repeated source and target pairs are summed and reported', async ({ page }) => {
    const m = await build(page, 'A [10] B\nB [10] C\nA [5] B\nB [5] C');
    expect(m.ok).toBe(true);
    expect(m.graph.links.map((l) => l.value)).toEqual([15, 15]);
    const dup = m.warnings.filter((w) => w.code === 'DUPLICATE_SUMMED');
    expect(dup).toHaveLength(2);
    expect(dup[0].message).toContain('lines 1, 3');
  });

  test('the line that closes a loop becomes the recycle, and is reported', async ({ page }) => {
    const m = await build(page, LOOP);
    expect(m.ok).toBe(true);
    const names = (l) => `${m.graph.nodes[l.source].name}>${m.graph.nodes[l.target].name}`;
    expect(m.graph.links.filter((l) => l.recycle).map(names)).toEqual(['Separator>Mixer']);
    const note = m.warnings.filter((w) => w.code === 'RECYCLE');
    expect(note).toHaveLength(1);
    expect(note[0].line).toBe(6);
    expect(note[0].message).toContain('Separator to Mixer closes a loop');
  });

  test('typing order decides which flow is the return', async ({ page }) => {
    // The same three flows around a loop, with each one typed last in turn.
    const flows = ['A [10] B', 'B [10] C', 'C [10] A'];
    const recycle = async (order) => {
      const m = await build(page, order.map((i) => flows[i]).join('\n'));
      return m.graph.links.filter((l) => l.recycle).map((l) => `${m.graph.nodes[l.source].name}>${m.graph.nodes[l.target].name}`);
    };
    expect(await recycle([0, 1, 2])).toEqual(['C>A']);
    expect(await recycle([1, 2, 0])).toEqual(['A>B']);
    expect(await recycle([2, 0, 1])).toEqual(['B>C']);
  });

  test('forward links alone never contain a loop, on seeded random graphs', async ({ page }) => {
    const bad = await page.evaluate(() => {
      const S = window.SankeyDiagram;
      let seed = 4242;
      const rnd = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const bad = [];
      let recycles = 0;
      for (let g = 0; g < 80; g++) {
        const n = 3 + Math.floor(rnd() * 10);
        const lines = [];
        for (let k = 0; k < n * 2; k++) {
          const a = Math.floor(rnd() * n);
          const b = Math.floor(rnd() * n);
          if (a !== b) lines.push(`N${a} [${1 + Math.floor(rnd() * 50)}] N${b}`);
        }
        if (!lines.length) continue;
        const m = S.buildModel(lines.join('\n'));
        if (!m.ok) { bad.push(`graph ${g} did not build`); continue; }
        recycles += m.layout.recycles.length;
        // Every forward link must advance a column, which is impossible if they loop.
        for (const l of m.layout.links) {
          if (!l.recycle && m.layout.nodes[l.target].layer <= m.layout.nodes[l.source].layer) bad.push(`graph ${g} link ${l.index}`);
          if (l.recycle && m.layout.nodes[l.target].layer >= m.layout.nodes[l.source].layer) bad.push(`graph ${g} recycle ${l.index} runs forward`);
        }
      }
      return { bad, recycles };
    });
    expect(bad.recycles).toBeGreaterThan(50);
    expect(bad.bad).toEqual([]);
  });

  test('a system that is all loop still draws, and says it has no input', async ({ page }) => {
    const m = await build(page, 'A [10] B\nB [10] A');
    expect(m.ok).toBe(true);
    expect(m.balance.totalIn).toBe(0);
    expect(m.balance.balanced).toBe(true);
    expect(m.warnings.map((w) => w.code)).toEqual(['RECYCLE', 'NO_INPUT']);
  });

  test('empty input is an error with an example, not a blank diagram', async ({ page }) => {
    const m = await build(page, '// nothing yet\n');
    expect(m.ok).toBe(false);
    expect(m.errors[0].code).toBe('NO_FLOWS');
  });
});

test.describe('balance', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  const summary = (page, text, settings = {}, unit = 'kg') => page.evaluate(([t, s, u]) => {
    const S = window.SankeyDiagram;
    return S.balanceSummary(S.buildModel(t, s).balance, u);
  }, [text, settings, unit]);

  test('golden: the dryer is short by 60 on one node and overall', async ({ page }) => {
    const { balance } = await build(page, DRYER);
    expect(balance.totalIn).toBe(1300);
    expect(balance.totalOut).toBe(1240);
    expect(balance.residual).toBe(60);
    expect(balance.closure).toBeCloseTo(1240 / 1300, 12);
    expect(balance.balanced).toBe(false);
    expect(balance.unbalanced.map((n) => n.name)).toEqual(['Dryer']);

    const dryer = balance.nodes.find((n) => n.name === 'Dryer');
    expect(dryer).toMatchObject({ role: 'internal', inflow: 1300, outflow: 1240, residual: 60, balanced: false, tolerated: false });
    expect(dryer.relative).toBeCloseTo(60 / 1300, 12);

    const roles = Object.fromEntries(balance.nodes.map((n) => [n.name, n.role]));
    expect(roles).toEqual({
      Slurry: 'input', 'Hot air': 'input', Dryer: 'internal', Exhaust: 'internal',
      Powder: 'output', Stack: 'output', 'Cyclone fines': 'output'
    });
  });

  test('golden: a recycle counts at both ends and leaves the boundary alone', async ({ page }) => {
    const { balance } = await build(page, LOOP);
    expect(balance.totalIn).toBe(100);
    expect(balance.totalOut).toBe(100);
    expect(balance.balanced).toBe(true);
    const by = Object.fromEntries(balance.nodes.map((n) => [n.name, n]));
    // The mixer sees the fresh feed plus the 30 coming back.
    expect(by.Mixer).toMatchObject({ role: 'internal', inflow: 130, outflow: 130, residual: 0 });
    expect(by.Separator).toMatchObject({ inflow: 130, outflow: 130 });
    expect(by['Fresh feed'].role).toBe('input');
  });

  test('the tolerance decides, flips exactly where it should, and a pass by tolerance is flagged', async ({ page }) => {
    // The dryer is out by 60/1300 = 4.615%.
    const tight = await build(page, DRYER, { tolerance: 0.046 });
    const loose = await build(page, DRYER, { tolerance: 0.047 });
    expect(tight.balance.balanced).toBe(false);
    expect(loose.balance.balanced).toBe(true);
    expect(loose.layout.stubs).toEqual([]);
    // It balances, and the result says it only does so by leaning on the tolerance.
    expect(loose.balance.tolerated.map((n) => n.name)).toEqual(['Dryer']);
    expect(loose.balance.closesExactly).toBe(false);
    expect(await summary(page, DRYER, { tolerance: 0.047 })).toBe(
      'Inputs 1,300 kg, outputs 1,240 kg. The balance closes only within the 4.7% tolerance: the largest gap is 4.6%.'
    );
  });

  test('every summary names the tolerance it was judged at', async ({ page }) => {
    expect(await summary(page, LOOP)).toBe('Inputs 100 kg, outputs 100 kg. The balance closes exactly (tolerance 0.5%).');
    expect(await summary(page, DRYER)).toBe(
      'Inputs 1,300 kg, outputs 1,240 kg. 60 kg more enters than leaves (4.6%), and 1 node does not balance at a 0.5% tolerance.'
    );
    expect(await summary(page, 'A [10] B\nB [12] A')).toBe(
      'No system input or output: every flow is part of a loop. 2 nodes do not balance at a 0.5% tolerance.'
    );
  });

  test('float noise does not read as an imbalance at zero tolerance', async ({ page }) => {
    const m = await build(page, 'A [0.1] X\nB [0.2] X\nX [0.3] C', { tolerance: 0 });
    expect(m.balance.balanced).toBe(true);
    expect(m.balance.tolerated).toEqual([]);
    const off = await build(page, 'A [0.1] X\nB [0.2] X\nX [0.3001] C', { tolerance: 0 });
    expect(off.balance.balanced).toBe(false);
  });

  test('offsetting errors are reported even though the totals agree', async ({ page }) => {
    // X loses 10 and Y gains 10, so inputs equal outputs and the overall check alone would pass.
    const text = 'A [100] X\nX [90] Y\nY [100] Z';
    const m = await build(page, text);
    expect(m.balance.totalIn).toBe(100);
    expect(m.balance.totalOut).toBe(100);
    expect(m.balance.closes).toBe(true);
    expect(m.balance.balanced).toBe(false);
    expect(m.balance.unbalanced.map((n) => [n.name, n.residual])).toEqual([['X', 10], ['Y', -10]]);
    expect(m.layout.stubs.map((s) => s.side)).toEqual(['out', 'in']);

    const text2 = await summary(page, text);
    expect(text2).toContain('totals agree');
    expect(text2).toContain('2 nodes do not balance');
  });

  test('inputs minus outputs equals the sum of the node residuals on any graph, loops included', async ({ page }) => {
    // The identity that makes the per-node table and the overall line agree.
    const worst = await page.evaluate(() => {
      const S = window.SankeyDiagram;
      let seed = 12345;
      const rnd = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      let worst = 0;
      let graphs = 0;
      for (let g = 0; g < 80; g++) {
        const n = 3 + Math.floor(rnd() * 14);
        const lines = [];
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            // Odd graphs allow backward flows, so the identity is tested with recycles too.
            const allowed = g % 2 ? i !== j : j > i;
            if (allowed && rnd() < 0.2) lines.push(`N${i} [${(rnd() * 500 + 0.01).toFixed(3)}] N${j}`);
          }
        }
        if (!lines.length) continue;
        const m = S.buildModel(lines.join('\n'));
        if (!m.ok) throw new Error(JSON.stringify(m.errors));
        graphs += 1;
        const b = m.balance;
        worst = Math.max(worst, Math.abs(b.residual - b.internalResidual) / Math.max(1, b.totalIn, b.totalOut));
      }
      return { worst, graphs };
    });
    expect(worst.graphs).toBeGreaterThan(60);
    expect(worst.worst).toBeLessThan(1e-12);
  });

  test('every shipped example parses, and balances or not as its label says', async ({ page }) => {
    const results = await page.evaluate(() => window.SankeyDiagram.PRESETS.map((p) => {
      const m = window.SankeyDiagram.buildModel(p.text, { title: p.title });
      return {
        id: p.id, ok: m.ok, balanced: m.ok && m.balance.balanced,
        hairlines: m.ok ? m.layout.hairlines.length : -1, recycles: m.ok ? m.layout.recycles.length : -1
      };
    }));
    expect(results).toEqual([
      { id: 'evaporator', ok: true, balanced: true, hairlines: 0, recycles: 0 },
      { id: 'dryer', ok: true, balanced: false, hairlines: 0, recycles: 0 },
      { id: 'energy', ok: true, balanced: true, hairlines: 1, recycles: 0 },
      { id: 'recycle', ok: true, balanced: true, hairlines: 0, recycles: 1 },
      { id: 'budget', ok: true, balanced: true, hairlines: 0, recycles: 0 },
      { id: 'jobsearch', ok: true, balanced: true, hairlines: 0, recycles: 0 }
    ]);
  });
});

test.describe('layout', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('columns are the longest path from an input, with outputs lined up or not', async ({ page }) => {
    const text = await page.evaluate(() => window.SankeyDiagram.PRESETS[0].text);
    const layers = (m) => Object.fromEntries(m.layout.nodes.map((n) => [n.name, n.layer]));
    expect(layers(await build(page, text, { align: 'justify' }))).toEqual({
      'Dilute feed': 0, 'Effect 1': 1, 'Vapor 1': 2, 'Effect 2': 2, 'Vapor 2': 3, Concentrate: 4, Condensate: 4
    });
    expect(layers(await build(page, text, { align: 'left' })).Concentrate).toBe(3);
  });

  test('a recycle does not change the columns its loop sits in', async ({ page }) => {
    const m = await build(page, LOOP);
    expect(Object.fromEntries(m.layout.nodes.map((n) => [n.name, n.layer]))).toEqual({
      'Fresh feed': 0, Mixer: 1, Reactor: 2, Separator: 3, Product: 4, Purge: 4
    });
  });

  test('invariants hold on the examples and on seeded random graphs, with loops and moved nodes', async ({ page }) => {
    const result = await page.evaluate(() => {
      const S = window.SankeyDiagram;
      const problems = [];
      let seed = 987;
      const rnd = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const cases = S.PRESETS.map((p) => ({ name: p.id, text: p.text, settings: { title: p.title } }));
      for (let g = 0; g < 60; g++) {
        const n = 3 + Math.floor(rnd() * 16);
        const lines = [];
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            // Every third graph allows backward flows, which become recycles.
            const allowed = g % 3 === 0 ? i !== j : j > i;
            if (allowed && rnd() < (g % 3 === 0 ? 0.12 : 0.25)) lines.push(`N${i} [${(rnd() * 900 + 0.5).toFixed(2)}] N${j}`);
          }
        }
        if (!lines.length) continue;
        // Every fourth graph has two nodes moved by hand.
        if (g % 4 === 1) lines.push(`~ N0: ${(rnd() * 100).toFixed(1)}, ${(rnd() * 100).toFixed(1)}`, '~ N1: 100, 0');
        cases.push({
          name: `random${g}`,
          text: lines.join('\n'),
          settings: { align: g % 2 ? 'left' : 'justify', width: 500 + g * 30, height: 300 + g * 20, nodePadding: 4 + (g % 30) }
        });
      }

      const EPS = 1e-6;
      let recycles = 0;
      let pinned = 0;
      let slots = 0;
      for (const c of cases) {
        const m = S.buildModel(c.text, c.settings);
        const fail = (msg) => problems.push(`${c.name}: ${msg}`);
        if (!m.ok) { fail('did not build'); continue; }
        const { layout, graph } = m;
        const { ky, bounds, area, padding } = layout;
        if (!(ky > 0)) fail(`ky ${ky}`);
        recycles += layout.recycles.length;

        for (const node of layout.nodes) {
          const g = graph.nodes[node.index];
          if (node.pinned) pinned += 1;
          if (Math.abs(node.height - Math.max(g.inflow, g.outflow) * ky) > EPS) fail(`${node.name} height is off the shared scale`);
          if (node.y0 < area.top - EPS || node.y1 > area.bottom + EPS) fail(`${node.name} outside the node area`);
          if (node.x0 < bounds.left - EPS || node.x1 > bounds.right + EPS) fail(`${node.name} outside the horizontal bounds`);

          // Ribbons stack from the node top with no gap, and stay inside the node.
          const out = g.outLinks.map((i) => layout.links[i]).sort((a, b) => a.sy0 - b.sy0);
          let y = node.y0;
          for (const l of out) { if (Math.abs(l.sy0 - y) > EPS) fail(`${node.name} outgoing ribbons gap or overlap`); y = l.sy1; }
          if (Math.abs((y - node.y0) - g.outflow * ky) > EPS) fail(`${node.name} outgoing widths do not sum to its outflow`);
          if (y > node.y1 + EPS) fail(`${node.name} outgoing ribbons overrun the node`);

          const inn = g.inLinks.map((i) => layout.links[i]).sort((a, b) => a.ty0 - b.ty0);
          y = node.y0;
          for (const l of inn) { if (Math.abs(l.ty0 - y) > EPS) fail(`${node.name} incoming ribbons gap or overlap`); y = l.ty1; }
          if (Math.abs((y - node.y0) - g.inflow * ky) > EPS) fail(`${node.name} incoming widths do not sum to its inflow`);
        }

        const lanes = [];
        for (const l of layout.links) {
          if (Math.abs(l.width - l.value * ky) > EPS) fail(`link ${l.index} width is off the shared scale`);
          if (Math.abs((l.sy1 - l.sy0) - (l.ty1 - l.ty0)) > EPS) fail(`link ${l.index} changes width along its length`);
          if (l.hairline !== (l.width < 1)) fail(`link ${l.index} hairline flag is wrong`);
          const s = layout.nodes[l.source];
          const t = layout.nodes[l.target];
          if (l.recycle) {
            const { laneTop, laneBottom, sourceBottom, targetBottom } = l.loop;
            if (Math.abs((laneBottom - laneTop) - l.width) > EPS) fail(`recycle ${l.index} lane is off the shared scale`);
            if (laneBottom > bounds.bottom + EPS) fail(`recycle ${l.index} lane runs below the diagram`);
            if (laneTop < area.bottom - EPS) fail(`recycle ${l.index} lane is inside the node area`);
            // The turn out of a node needs its full radius above the lane.
            if (laneTop - 8 < Math.max(sourceBottom, targetBottom) + 8 - EPS) fail(`recycle ${l.index} has no room to turn`);
            lanes.push([laneTop, laneBottom]);
          } else if (!s.pinned && !t.pinned) {
            if (!(l.x1 > l.x0)) fail(`link ${l.index} does not run left to right`);
          }
        }
        lanes.sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < lanes.length; i++) {
          if (lanes[i][0] < lanes[i - 1][1] - EPS) fail('two recycle lanes overlap');
        }

        // A column holds its free nodes and a slot for every ribbon passing through it.
        const byColumn = new Map();
        const occupy = (x0, y0, y1, name) => {
          const key = x0.toFixed(4);
          if (!byColumn.has(key)) byColumn.set(key, []);
          byColumn.get(key).push({ y0, y1, name });
        };
        for (const node of layout.nodes) {
          if (!node.pinned) occupy(node.x0, node.y0, node.y1, node.name);
        }
        for (const l of layout.links) {
          if (l.recycle) continue;
          const s = layout.nodes[l.source];
          const t = layout.nodes[l.target];
          if (!s.pinned && !t.pinned) {
            slots += l.waypoints.length;
            if (l.waypoints.length !== t.layer - s.layer - 1) fail(`link ${l.index} skips a column without a slot in it`);
          }
          let reach = l.x0;
          for (const w of l.waypoints) {
            if (Math.abs((w.y1 - w.y0) - l.width) > EPS) fail(`link ${l.index} changes width at a slot`);
            if (w.y0 < area.top - EPS || w.y1 > area.bottom + EPS) fail(`link ${l.index} slot is outside the node area`);
            if (!(w.x0 > reach && w.x1 < l.x1)) fail(`link ${l.index} doubles back through a slot`);
            reach = w.x1;
            if (!s.pinned && !t.pinned) occupy(w.x0, w.y0, w.y1, `link ${l.index}`);
          }
        }
        for (const column of byColumn.values()) {
          column.sort((a, b) => a.y0 - b.y0);
          for (let i = 1; i < column.length; i++) {
            if (column[i].y0 - column[i - 1].y1 < padding - EPS) fail(`${column[i - 1].name} and ${column[i].name} are closer than the padding`);
          }
        }

        for (const stub of layout.stubs) {
          const node = layout.nodes[stub.node];
          if (Math.abs((stub.y1 - stub.y0) - stub.value * ky) > EPS) fail(`${node.name} stub is off the shared scale`);
          if (Math.abs(stub.y1 - node.y1) > EPS) fail(`${node.name} stub does not end at the node bottom`);
        }

        const again = S.buildModel(c.text, c.settings);
        if (JSON.stringify(again.layout) !== JSON.stringify(layout)) fail('layout is not deterministic');
      }
      return { problems, count: cases.length, recycles, pinned, slots };
    });
    expect(result.slots).toBeGreaterThan(100);
    expect(result.count).toBeGreaterThan(50);
    expect(result.recycles).toBeGreaterThan(10);
    expect(result.pinned).toBeGreaterThan(10);
    expect(result.problems).toEqual([]);
  });

  test('a flow that skips columns is routed past the nodes between, not over them', async ({ page }) => {
    const run = (order) => page.evaluate((o) => {
      const S = window.SankeyDiagram;
      const m = S.buildModel([
        'Web Apply [993] Ghosted',
        'Web Apply [10] Phone Screen',
        'Phone Screen [2] Scam',
        'Phone Screen [7] Ghosted',
        'Phone Screen [1] Light Technical',
        'Light Technical [1] Fumbled SQL'
      ].join('\n'), { order: o });
      const big = m.layout.links[0];
      const node = (name) => m.layout.nodes.find((n) => n.name === name);
      // Flow crossed between any two ribbons, read off their ends and slots.
      const tracks = m.layout.links.map((l) => [
        (l.sy0 + l.sy1) / 2, ...l.waypoints.map((w) => (w.y0 + w.y1) / 2), (l.ty0 + l.ty1) / 2
      ]);
      return {
        via: big.waypoints, padding: m.layout.padding, width: big.width,
        screen: node('Phone Screen'), technical: node('Light Technical'),
        curves: (S.engine.ribbonPath(big).match(/C/g) || []).length,
        tracks, ky: m.layout.ky, order: m.layout.options.order
      };
    }, order);

    const scales = [];
    // Smaller flows fall below the main one by default, rise above it on request.
    for (const [order, used, side] of [[undefined, 'down', 1], ['up', 'up', -1], ['sideways', 'down', 1]]) {
      const out = await run(order);
      expect(out.order).toBe(used);
      expect(out.via.length).toBe(2);
      expect(out.curves).toBe(6);
      for (const [slot, node] of [[out.via[0], out.screen], [out.via[1], out.technical]]) {
        expect(slot.x0).toBeCloseTo(node.x0, 9);
        expect(slot.y1 - slot.y0).toBeCloseTo(out.width, 9);
        expect(side * (node.y0 - slot.y1)).toBeGreaterThanOrEqual(side > 0 ? out.padding - 1e-9 : slot.y1 - slot.y0);
        expect(Math.max(slot.y0 - node.y1, node.y0 - slot.y1)).toBeGreaterThanOrEqual(out.padding - 1e-9);
      }
      // Every other flow stays on one side of the 993 ribbon from end to end: nothing crosses it.
      const [bigTrack, ...rest] = out.tracks;
      for (const track of rest) {
        if (side > 0) expect(Math.min(...track)).toBeGreaterThan(Math.max(...bigTrack));
        else expect(Math.max(...track)).toBeLessThan(Math.min(...bigTrack));
      }
      scales.push(out.ky);
    }
    // The order moves things around and never changes the scale.
    expect(new Set(scales).size).toBe(1);
  });

  test('moving a node never changes the scale or any other node', async ({ page }) => {
    const base = await build(page, DRYER);
    const moved = await build(page, `${DRYER}\n~ Powder: 55, 10`);
    expect(moved.layout.ky).toBe(base.layout.ky);
    const powder = moved.layout.nodes.find((n) => n.name === 'Powder');
    expect(powder.pinned).toBe(true);
    const { area } = moved.layout;
    expect(powder.x0).toBeCloseTo(area.xMin + (area.xMax - area.xMin) * 0.55, 9);
    expect(powder.y0).toBeCloseTo(area.top + (area.bottom - area.top - powder.height) * 0.10, 9);
    for (const name of ['Slurry', 'Hot air', 'Dryer', 'Exhaust']) {
      const a = base.layout.nodes.find((n) => n.name === name);
      const b = moved.layout.nodes.find((n) => n.name === name);
      expect([b.x0, b.height], name).toEqual([a.x0, a.height]);
    }
  });

  test('a position round-trips through positionFromPoint at every corner', async ({ page }) => {
    const worst = await page.evaluate((text) => {
      const S = window.SankeyDiagram;
      let worst = 0;
      for (const [x, y] of [[0, 0], [100, 100], [0, 100], [100, 0], [37.5, 62.5], [50, 50]]) {
        const m = S.buildModel(`${text}\n~ Exhaust: ${x}, ${y}`);
        const node = m.layout.nodes.find((n) => n.name === 'Exhaust');
        const back = S.engine.positionFromPoint(m.layout, node.index, node.x0, node.y0);
        worst = Math.max(worst, Math.abs(back.x - x), Math.abs(back.y - y));
      }
      return worst;
    }, DRYER);
    // Positions are stored to one decimal, so that is the round-trip resolution.
    expect(worst).toBeLessThanOrEqual(0.05);
  });

  test('the missing flow is drawn at the size of the gap, on the side that is short', async ({ page }) => {
    const m = await build(page, DRYER);
    expect(m.layout.stubs).toHaveLength(1);
    const stub = m.layout.stubs[0];
    const dryer = m.layout.nodes.find((n) => n.name === 'Dryer');
    expect(stub.side).toBe('out');
    expect(stub.value).toBe(60);
    expect(stub.x).toBe(dryer.x1);
    expect(stub.y1 - stub.y0).toBeCloseTo(60 * m.layout.ky, 9);
    // The node is as tall as the larger side, so the gap exists to be drawn.
    expect(dryer.height).toBeCloseTo(1300 * m.layout.ky, 9);
  });

  test('a recycle loop is a closed ribbon of constant width that stays on the diagram', async ({ page }) => {
    const out = await page.evaluate((text) => {
      const S = window.SankeyDiagram;
      const m = S.buildModel(text);
      const link = m.layout.links.find((l) => l.recycle);
      const d = S.engine.ribbonPath(link);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
      document.body.appendChild(svg);
      const box = path.getBBox();
      const center = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      center.setAttribute('d', S.engine.centerPath(link));
      svg.appendChild(center);
      // The center line stays strictly inside the ribbon the whole way round.
      let inside = 0;
      const total = center.getTotalLength();
      for (let i = 1; i < 100; i++) {
        const p = center.getPointAtLength((total * i) / 100);
        if (path.isPointInFill(new DOMPoint(p.x, p.y))) inside += 1;
      }
      svg.remove();
      return {
        d, inside, width: link.width, ky: m.layout.ky,
        box: { top: box.y, bottom: box.y + box.height, left: box.x, right: box.x + box.width },
        loop: link.loop, bounds: m.layout.bounds, x0: link.x0, x1: link.x1, sy0: link.sy0
      };
    }, LOOP);
    expect(out.width).toBeCloseTo(30 * out.ky, 9);
    expect(out.d.startsWith('M')).toBe(true);
    expect(out.d.endsWith('Z')).toBe(true);
    // Four turns, each an outer and an inner arc.
    expect((out.d.match(/A/g) || []).length).toBe(8);
    expect(out.inside).toBe(99);
    expect(out.box.bottom).toBeCloseTo(out.loop.laneBottom, 1);
    expect(out.box.top).toBeCloseTo(out.sy0, 1);
    expect(out.box.bottom).toBeLessThanOrEqual(out.bounds.bottom + 0.01);
    // It leaves to the right of its source and returns from the left of its target.
    expect(out.box.right).toBeGreaterThan(out.x0);
    expect(out.box.left).toBeLessThan(out.x1);
    expect(out.box.left).toBeGreaterThanOrEqual(out.bounds.left - 0.01);
  });

  test('loops from one node nest: the longer loop takes the outer lane', async ({ page }) => {
    const m = await build(page, 'Feed [100] A\nA [140] B\nB [150] C\nC [100] Out\nC [40] A\nC [10] B');
    const loop = (to) => m.layout.links.find((l) => l.recycle && m.graph.nodes[l.target].name === to);
    const toA = loop('A');
    const toB = loop('B');
    expect(toB.loop.laneBottom).toBeLessThanOrEqual(toA.loop.laneTop);
    // And at the node they share, the longer loop leaves from higher up.
    expect(toA.sy0).toBeLessThan(toB.sy0);
  });

  test('a recycle into the first column gets room for its leg', async ({ page }) => {
    const plain = await build(page, 'A [10] B\nB [10] C');
    const looped = await build(page, 'A [10] B\nB [10] C\nC [4] A');
    const first = (m) => m.layout.nodes.find((n) => n.name === 'A').x0;
    expect(first(plain)).toBe(plain.layout.bounds.left);
    expect(first(looped)).toBeGreaterThan(looped.layout.bounds.left + 12);
  });

  test('a flow under one pixel is flagged and named, not silently thickened', async ({ page }) => {
    const text = await page.evaluate(() => window.SankeyDiagram.PRESETS.find((p) => p.id === 'energy').text);
    const m = await build(page, text);
    expect(m.layout.hairlines).toHaveLength(1);
    const link = m.layout.links[m.layout.hairlines[0]];
    expect(link.value).toBe(0.4);
    expect(link.width).toBeLessThan(1);
    expect(link.width).toBeCloseTo(0.4 * m.layout.ky, 9);
    const warning = m.warnings.find((w) => w.code === 'HAIRLINE');
    expect(warning.message).toContain('Blowdown to Flash recovery');
    // Room for the footnote that explains the dashes is reserved.
    expect(m.layout.options.footnoteHeight).toBeGreaterThan(0);
  });

  test('options outside their limits are clamped, never passed through', async ({ page }) => {
    const m = await build(page, 'A [1] B', { width: 99999, height: -5, nodeWidth: 0, nodePadding: 1e6, tolerance: 9 });
    expect(m.layout.options).toMatchObject({ width: 2400, height: 200, nodeWidth: 4, nodePadding: 80 });
    expect(m.balance.tolerance).toBe(0.25);
    const blank = await build(page, 'A [1] B', { width: '', height: null, nodeWidth: 'wide' });
    expect(blank.layout.options).toMatchObject({ width: 960, height: 540, nodeWidth: 16 });
  });

  test('a crowded column shrinks its spacing instead of going negative', async ({ page }) => {
    const lines = Array.from({ length: 60 }, (_, i) => `Source [${i + 1}] Sink ${i}`).join('\n');
    const m = await build(page, lines, { height: 300, nodePadding: 40 });
    expect(m.layout.ky).toBeGreaterThan(0);
    expect(m.layout.padding).toBeLessThan(40);
    for (const n of m.layout.nodes) expect(n.height).toBeGreaterThan(0);
  });

  test('many recycles on a short diagram still leave a positive scale', async ({ page }) => {
    const lines = ['In [50] N0'];
    for (let i = 0; i < 12; i++) lines.push(`N${i} [50] N${i + 1}`);
    for (let i = 1; i <= 12; i++) lines.push(`N${i} [3] N0`);
    const m = await build(page, lines.join('\n'), { height: 200 });
    expect(m.layout.recycles).toHaveLength(12);
    expect(m.layout.ky).toBeGreaterThan(0);
    for (const l of m.layout.links.filter((x) => x.recycle)) {
      expect(l.loop.laneBottom).toBeLessThanOrEqual(m.layout.bounds.bottom + 1e-6);
    }
  });

  test('the largest allowed input lays out well inside a second', async ({ page }) => {
    const ms = await page.evaluate(() => {
      const lines = [];
      for (let i = 0; i < 500; i++) lines.push(`N${i % 40} [${1 + (i % 17)}] M${40 + (i * 7) % 90}`);
      const t0 = performance.now();
      const m = window.SankeyDiagram.buildModel(lines.join('\n'));
      const t = performance.now() - t0;
      if (!m.ok) throw new Error(JSON.stringify(m.errors));
      return t;
    });
    // Loose on purpose: catches a ten-fold regression without failing a slow runner.
    expect(ms).toBeLessThan(1000);
  });

  test('more than 500 flows is refused by name', async ({ page }) => {
    const lines = Array.from({ length: 501 }, (_, i) => `A${i} [1] B${i}`).join('\n');
    const m = await build(page, lines);
    expect(m.ok).toBe(false);
    expect(m.errors[0].code).toBe('TOO_MANY_FLOWS');
  });
});

test.describe('column set by hand', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  const CHAIN = ['Feed [10] Mill', 'Mill [6] Screen', 'Mill [4] Waste', 'Screen [6] Product'].join('\n');
  const layers = (m) => Object.fromEntries(m.layout.nodes.map((n) => [n.name, n.layer + 1]));

  test('a column line is parsed, range checked, and never mistaken for a flow', async ({ page }) => {
    const ok = await parse(page, `${CHAIN}\n> Waste: 2\n>   Screen :  4`);
    expect(ok.errors).toEqual([]);
    expect(ok.columns).toEqual({ Waste: 2, Screen: 4 });

    for (const [line, code] of [['> Waste: 0', 'COLUMN_OUT_OF_RANGE'], ['> Waste: 41', 'COLUMN_OUT_OF_RANGE'],
      ['> Waste: two', 'COLUMN_NOT_UNDERSTOOD'], ['> Waste 2', 'COLUMN_NOT_UNDERSTOOD'], ['> Waste: 2.5', 'COLUMN_NOT_UNDERSTOOD']]) {
      const out = await parse(page, `${CHAIN}\n${line}`);
      expect(out.errors.map((e) => [e.line, e.code])).toEqual([[5, code]]);
    }

    // A source whose name starts with the same character is still a flow.
    const flow = await parse(page, '>5 mm [3] Crusher\n>5 mm,Stockpile,2');
    expect(flow.errors).toEqual([]);
    expect(flow.flows.map((f) => [f.source, f.target, f.value])).toEqual([['>5 mm', 'Crusher', 3], ['>5 mm', 'Stockpile', 2]]);

    const stray = await parse(page, `${CHAIN}\n> Nowhere: 3`);
    expect(stray.warnings.map((w) => w.code)).toEqual(['UNKNOWN_NODE']);
  });

  test('a column pushes its node and everything after it right, and holds an output in place', async ({ page }) => {
    expect(layers(await build(page, CHAIN))).toEqual({ Feed: 1, Mill: 2, Screen: 3, Waste: 4, Product: 4 });

    // Waste is an output, which would otherwise be lined up on the right.
    const held = await build(page, `${CHAIN}\n> Waste: 3`);
    expect(layers(held)).toEqual({ Feed: 1, Mill: 2, Screen: 3, Waste: 3, Product: 4 });
    expect(held.warnings.map((w) => w.code)).not.toContain('COLUMN_DISPLACED');

    const pushed = await build(page, `${CHAIN}\n> Mill: 4`);
    expect(layers(pushed)).toEqual({ Feed: 1, Mill: 4, Screen: 5, Waste: 6, Product: 6 });
    // The flow from Feed now skips two columns and is routed through both.
    expect(pushed.layout.links[0].waypoints.length).toBe(2);

    // An input can be started further right, beside what it joins.
    const late = await build(page, `${CHAIN}\nMake-up [2] Screen\n> Make-up: 2`);
    expect(layers(late)['Make-up']).toBe(2);
  });

  test('a column left of what feeds the node is refused out loud, not obeyed', async ({ page }) => {
    const m = await build(page, `${CHAIN}\n> Screen: 1`);
    expect(m.ok).toBe(true);
    expect(layers(m).Screen).toBe(3);
    const warning = m.warnings.find((w) => w.code === 'COLUMN_DISPLACED');
    expect(warning.message).toContain('"Screen" is set to column 1');
    expect(warning.message).toContain('drawn in column 3');
    for (const l of m.layout.links) expect(l.x1).toBeGreaterThan(l.x0);
  });
});

test.describe('recycle loops beside each other', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  const LOOPS = [
    'A [100] B', 'A [60] C', 'B [100] D', 'C [60] E', 'D [80] F', 'E [50] G',
    'D [20] B', 'E [10] C', 'F [15] A', 'G [8] A'
  ].join('\n');

  const legs = (page, text, settings = {}) => page.evaluate(([t, s]) => {
    const S = window.SankeyDiagram;
    const m = S.buildModel(t, s);
    return m.layout.links.filter((l) => l.recycle).map((l) => ({
      name: `${m.graph.nodes[l.source].name}>${m.graph.nodes[l.target].name}`,
      legs: S.engine.loopLegs(l), lane: l.loop.laneTop, width: l.width,
      sourceX: m.layout.nodes[l.source].x0, targetX: m.layout.nodes[l.target].x0,
      sourceRun: l.loop.sourceRun, targetRun: l.loop.targetRun
    }));
  }, [text, settings]);

  test('loops from different nodes of one column turn on their own tracks, inner lane innermost', async ({ page }) => {
    const out = await legs(page, LOOPS);
    const by = Object.fromEntries(out.map((l) => [l.name, l]));
    expect(out.map((l) => l.name).sort()).toEqual(['D>B', 'E>C', 'F>A', 'G>A']);

    // D and E share a column, as do B and C: the loop from the lower pair is the inner one.
    expect(by['E>C'].lane).toBeLessThan(by['D>B'].lane);
    expect(by['E>C'].sourceRun).toBe(4);
    expect(by['D>B'].sourceRun).toBeGreaterThan(4);
    // Out legs run left to right as [inner, outer]; in legs as [outer, inner].
    expect(by['D>B'].legs.out[0]).toBeGreaterThanOrEqual(by['E>C'].legs.out[1] + 4 - 1e-9);
    expect(by['D>B'].legs.in[1]).toBeLessThanOrEqual(by['E>C'].legs.in[0] - 4 + 1e-9);
    // Two loops arriving at the one node A stay touching, as loops at one node always did.
    expect(by['F>A'].legs.in[1]).toBeCloseTo(by['G>A'].legs.in[0], 9);
  });

  test('on seeded random graphs no two legs beside a column overlap, and the outer leg has the lower lane', async ({ page }) => {
    const result = await page.evaluate(() => {
      const S = window.SankeyDiagram;
      let seed = 4242;
      const rnd = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const problems = [];
      let pairs = 0;
      for (let g = 0; g < 80; g++) {
        const n = 4 + Math.floor(rnd() * 10);
        const lines = [];
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            if (i !== j && rnd() < 0.16) lines.push(`N${i} [${(rnd() * 90 + 1).toFixed(1)}] N${j}`);
          }
        }
        if (!lines.length) continue;
        if (g % 3 === 1) lines.push(`> N${Math.floor(rnd() * n)}: ${2 + Math.floor(rnd() * 4)}`);
        const m = S.buildModel(lines.join('\n'), { width: 700 + g * 20, height: 420 + g * 10 });
        if (!m.ok) { problems.push(`random${g}: did not build`); continue; }
        for (const l of m.layout.links) {
          if (!l.recycle && !(l.x1 > l.x0)) problems.push(`random${g}: link ${l.index} does not run left to right`);
        }
        const loops = m.layout.links.filter((l) => l.recycle);
        for (const side of ['out', 'in']) {
          for (let a = 0; a < loops.length; a++) {
            for (let b = a + 1; b < loops.length; b++) {
              const end = side === 'out' ? 'source' : 'target';
              if (m.layout.nodes[loops[a][end]].x0 !== m.layout.nodes[loops[b][end]].x0) continue;
              pairs += 1;
              const A = S.engine.loopLegs(loops[a])[side];
              const B = S.engine.loopLegs(loops[b])[side];
              if (Math.min(A[1], B[1]) - Math.max(A[0], B[0]) > 1e-6) problems.push(`random${g}: ${side} legs of ${loops[a].index} and ${loops[b].index} overlap`);
              // Further from the column means a lower lane, or the leg would cut the other's lane.
              const outerA = side === 'out' ? A[0] > B[0] : A[1] < B[1];
              if (outerA !== (loops[a].loop.laneTop > loops[b].loop.laneTop)) problems.push(`random${g}: ${side} legs of ${loops[a].index} and ${loops[b].index} are out of lane order`);
            }
          }
        }
      }
      return { problems, pairs };
    });
    expect(result.pairs).toBeGreaterThan(50);
    expect(result.problems).toEqual([]);
  });
});

test.describe('widths not to scale', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  const SKEWED = ['Web Apply [9900] Ghosted', 'Web Apply [100] Phone Screen', 'Phone Screen [1] Offer', 'Phone Screen [99] Ghosted'].join('\n');

  test('to scale is untouched by the new settings when they are off', async ({ page }) => {
    const same = await page.evaluate((t) => {
      const S = window.SankeyDiagram;
      const plain = S.buildModel(t, {});
      const explicit = S.buildModel(t, { widthMode: 'scale', minLinkWidth: 0 });
      const junk = S.buildModel(t, { widthMode: 'sideways', minLinkWidth: -3 });
      return [JSON.stringify(plain.layout) === JSON.stringify(explicit.layout), JSON.stringify(plain.layout) === JSON.stringify(junk.layout),
        plain.layout.widthMode, plain.layout.widened.length];
    }, SKEWED);
    expect(same).toEqual([true, true, 'scale', 0]);
  });

  test('equal draws every flow the same, square root compresses, and a floor lifts only what is under it', async ({ page }) => {
    const out = await page.evaluate((t) => {
      const S = window.SankeyDiagram;
      const pick = (settings) => {
        const m = S.buildModel(t, settings);
        return {
          widths: m.layout.links.map((l) => l.width), widened: m.layout.widened, ky: m.layout.ky,
          floor: m.layout.minLinkWidth, codes: m.warnings.map((w) => w.code),
          heights: Object.fromEntries(m.layout.nodes.map((n) => [n.name, n.height])),
          balance: JSON.stringify(m.balance)
        };
      };
      return { scale: pick({}), equal: pick({ widthMode: 'equal' }), root: pick({ widthMode: 'root' }), floor: pick({ minLinkWidth: 2 }) };
    }, SKEWED);

    const [w] = out.equal.widths;
    for (const width of out.equal.widths) expect(width).toBeCloseTo(w, 9);
    // A node is as tall as the busier of its two sides: two ribbons each here.
    expect(out.equal.heights['Web Apply']).toBeCloseTo(2 * w, 9);
    expect(out.equal.heights['Phone Screen']).toBeCloseTo(2 * w, 9);
    expect(out.equal.heights.Offer).toBeCloseTo(w, 9);
    expect(out.equal.codes).toEqual(['NOT_TO_SCALE']);

    expect(out.root.widths[0] / out.root.widths[2]).toBeCloseTo(Math.sqrt(9900), 6);
    expect(out.root.widths[1] / out.root.widths[2]).toBeCloseTo(10, 6);
    expect(out.root.codes).toEqual(['NOT_TO_SCALE']);

    // 9900 and 100 and 99 stay in proportion; only the flow of 1 is lifted to the floor.
    expect(out.floor.widened).toEqual([2]);
    expect(out.floor.widths[2]).toBe(2);
    expect(out.floor.widths[0] / out.floor.widths[1]).toBeCloseTo(99, 6);
    expect(out.floor.widths[3]).toBeCloseTo(99 * out.floor.ky, 9);
    expect(out.floor.ky).toBeLessThan(out.scale.ky);
    expect(out.floor.codes).toEqual(['WIDENED']);

    // None of it touches the arithmetic.
    for (const mode of ['equal', 'root', 'floor']) expect(out[mode].balance).toBe(out.scale.balance);
  });

  test('a floor too thick to fit is thinned, and says what was used', async ({ page }) => {
    const lines = Array.from({ length: 40 }, (_, i) => `Source [${i + 1}] Sink ${i}`).join('\n');
    const m = await build(page, lines, { minLinkWidth: 12, height: 300 });
    expect(m.ok).toBe(true);
    expect(m.layout.minLinkWidth).toBeLessThan(12);
    expect(m.layout.minLinkWidth).toBeGreaterThan(0);
    for (const n of m.layout.nodes) {
      expect(n.y0).toBeGreaterThanOrEqual(m.layout.area.top - 1e-6);
      expect(n.y1).toBeLessThanOrEqual(m.layout.area.bottom + 1e-6);
    }
    const used = String(Math.round(m.layout.minLinkWidth * 10) / 10);
    expect(m.warnings.find((w) => w.code === 'WIDENED').message).toContain(`${used} px minimum`);
  });

  test('a missing flow is still drawn on its node in every mode', async ({ page }) => {
    for (const settings of [{ widthMode: 'equal' }, { widthMode: 'root' }, { minLinkWidth: 6 }]) {
      const m = await build(page, 'Feed [1000] Dryer\nDryer [900] Product\nDryer [1] Dust', settings);
      expect(m.layout.stubs).toHaveLength(1);
      const [stub] = m.layout.stubs;
      const dryer = m.layout.nodes.find((n) => n.name === 'Dryer');
      expect(stub.side).toBe('out');
      expect(stub.value).toBe(99);
      expect(stub.y1 - stub.y0).toBeGreaterThanOrEqual(1);
      expect(stub.y0).toBeGreaterThanOrEqual(dryer.y0 - 1e-6);
      expect(stub.y1).toBeLessThanOrEqual(dryer.y1 + 1e-6);
      // The stub starts where the last ribbon out of the node ends.
      const lowest = Math.max(...m.layout.links.filter((l) => l.source === dryer.index).map((l) => l.sy1));
      expect(stub.y0).toBeCloseTo(lowest, 6);
    }
  });

  test('invariants hold in every mode on seeded random graphs with loops', async ({ page }) => {
    const result = await page.evaluate(() => {
      const S = window.SankeyDiagram;
      let seed = 777;
      const rnd = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const EPS = 1e-6;
      const problems = [];
      let built = 0;
      for (let g = 0; g < 60; g++) {
        const n = 3 + Math.floor(rnd() * 12);
        const lines = [];
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const allowed = g % 3 === 0 ? i !== j : j > i;
            // Amounts span five orders of magnitude, which is what these modes are for.
            if (allowed && rnd() < 0.2) lines.push(`N${i} [${Math.pow(10, rnd() * 5).toFixed(2)}] N${j}`);
          }
        }
        if (!lines.length) continue;
        const settings = [{ widthMode: 'equal' }, { widthMode: 'root' }, { minLinkWidth: 1 + (g % 8) }, { widthMode: 'root', minLinkWidth: 3 }][g % 4];
        const m = S.buildModel(lines.join('\n'), { ...settings, width: 700 + g * 20, height: 400 + g * 15 });
        const fail = (msg) => problems.push(`random${g} ${JSON.stringify(settings)}: ${msg}`);
        if (!m.ok) { fail('did not build'); continue; }
        built += 1;
        const { layout, graph } = m;
        const { area, bounds, padding } = layout;
        if (!(layout.ky > 0)) fail(`ky ${layout.ky}`);
        const floor = layout.minLinkWidth;
        for (const l of layout.links) {
          if (floor > 0 && l.width < floor - EPS) fail(`link ${l.index} is under the floor`);
          if (l.widened !== (floor > 0 && Math.abs(l.width - floor) < EPS && l.widened)) fail(`link ${l.index} widened flag is inconsistent`);
          if (Math.abs((l.sy1 - l.sy0) - l.width) > EPS || Math.abs((l.ty1 - l.ty0) - l.width) > EPS) fail(`link ${l.index} changes width`);
          for (const w of l.waypoints) if (Math.abs((w.y1 - w.y0) - l.width) > EPS) fail(`link ${l.index} changes width at a slot`);
          if (l.recycle && l.loop.laneBottom > bounds.bottom + EPS) fail(`recycle ${l.index} lane runs below the diagram`);
        }
        if (settings.widthMode === 'equal' && !floor) {
          const first = layout.links[0].width;
          if (layout.links.some((l) => Math.abs(l.width - first) > EPS)) fail('equal widths differ');
        }
        const columns = new Map();
        for (const node of layout.nodes) {
          const gn = graph.nodes[node.index];
          if (node.y0 < area.top - EPS || node.y1 > area.bottom + EPS) fail(`${node.name} outside the node area`);
          for (const [list, a, b] of [['outLinks', 'sy0', 'sy1'], ['inLinks', 'ty0', 'ty1']]) {
            const ribbons = gn[list].map((i) => layout.links[i]).sort((p, q) => p[a] - q[a]);
            let y = node.y0;
            for (const l of ribbons) { if (Math.abs(l[a] - y) > EPS) fail(`${node.name} ribbons gap or overlap`); y = l[b]; }
            if (y > node.y1 + EPS) fail(`${node.name} ribbons overrun the node`);
          }
          const key = node.x0.toFixed(4);
          if (!columns.has(key)) columns.set(key, []);
          columns.get(key).push(node);
        }
        for (const column of columns.values()) {
          column.sort((p, q) => p.y0 - q.y0);
          for (let i = 1; i < column.length; i++) {
            if (column[i].y0 - column[i - 1].y1 < padding - EPS) fail(`${column[i - 1].name} and ${column[i].name} are closer than the padding`);
          }
        }
        for (const stub of layout.stubs) {
          const node = layout.nodes[stub.node];
          if (stub.y0 < node.y0 - EPS || stub.y1 > node.y1 + EPS) fail(`${node.name} stub is outside its node`);
        }
        if (JSON.stringify(S.buildModel(lines.join('\n'), { ...settings, width: 700 + g * 20, height: 400 + g * 15 }).layout) !== JSON.stringify(layout)) fail('not deterministic');
      }
      return { problems, built };
    });
    expect(result.built).toBeGreaterThan(40);
    expect(result.problems).toEqual([]);
  });
});
