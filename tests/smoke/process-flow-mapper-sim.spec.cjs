// Process flow mapper, Phase 3 pure layers: times given as ranges, waits on
// the way between steps, work done at the same time, and the seeded
// simulation behind the spread of lead time. Driven through
// window.ProcessFlowMapper.
//
// Checked against figures done by hand, closed forms (a geometric number of
// passes, a uniform and a triangular time, the slowest of two geometric
// branches), and a fork and join walk written here that shares no code with
// the solve or with the simulation.
//
// The page runs script-src 'self' with no unsafe-eval, so page.waitForFunction
// is CSP-blocked and expect.poll is used instead.

const { test, expect } = require('@playwright/test');

const PAGE = '/tools/process-flow-mapper.html';

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.ProcessFlowMapper && window.ProcessFlowMapper.getModel()))).toBe(true);
}

const parse = (page, text) => page.evaluate((t) => window.ProcessFlowMapper.parser.parseFlow(t), text);
const build = (page, text, settings = {}) => page.evaluate(([t, s]) => window.ProcessFlowMapper.buildModel(t, s), [text, settings]);
const preset = (page, id) => page.evaluate((i) => window.ProcessFlowMapper.PRESETS.find((p) => p.id === i).text, id);
const codes = (list) => list.map((e) => e.code);
const stepOf = (m, name) => m.result.perStep[m.graph.nodes.findIndex((n) => n.name === name)];
const text = (...rows) => rows.join('\n');

const ON_THE_WAY = text(
  'A: (Start) -> Do',
  'A: Do {30 min, wait 1 h} -> ok 80% {2 h}: Ship, redo 20% {wait 30 min}: Fix',
  'A: Fix {15 min} -> Do',
  'B: Ship {10 min} -> {wait 1 d}: (Done)',
  'B: (Done)'
);

const SPLIT = text(
  'A: (Start) -> Split',
  'A: Split {1 h} => Left, Right',
  'A: Left {2 h} -> Join',
  'B: Right {3 h, wait 1 h} -> Join',
  'A: Join {1 h} -> (End)',
  'A: (End)'
);

test.beforeEach(async ({ page }) => { await openTool(page); });

test.describe('parser, Phase 3 forms', () => {
  test('a time can be a range or three points, its value is the average, and a plain time is unchanged', async ({ page }) => {
    const out = await parse(page, 'A: Do {5-15 min, wait 1-2-9 h} -> Next\nA: Next {2 to 4 d, wait 3 h}');
    expect(out.errors).toEqual([]);
    expect(out.steps[0].touch).toEqual({ value: 10, unit: 'min', spread: { low: 5, mode: null, high: 15 } });
    expect(out.steps[0].wait).toEqual({ value: 4, unit: 'h', spread: { low: 1, mode: 2, high: 9 } });
    expect(out.steps[1].touch).toEqual({ value: 3, unit: 'd', spread: { low: 2, mode: null, high: 4 } });
    expect(out.steps[1].wait).toEqual({ value: 3, unit: 'h' });

    for (const bad of ['{3-1 h}', '{1-5-2 d}', '{1-2-3-4 h}', '{1- h}']) {
      const err = await parse(page, `A: Do\nA: Other ${bad}`);
      expect(err.errors.map((e) => [e.line, e.code]), bad).toEqual([[2, 'TIME_NOT_UNDERSTOOD']]);
    }
    expect((await parse(page, 'A: Do {3-1 h}')).errors[0].message).toContain('lowest first');
  });

  test('a wait on the way goes before the colon, with or without a label and a share', async ({ page }) => {
    const out = await parse(page, `${ON_THE_WAY}\nA: Extra -> {5-10 min}: Do`);
    expect(out.errors).toEqual([]);
    const exits = Object.fromEntries(out.exits.map((e) => [`${e.source}>${e.target}`, e]));
    expect(exits['Do>Ship']).toMatchObject({ label: 'ok', share: 0.8, wait: { value: 2, unit: 'h' }, parallel: false });
    expect(exits['Do>Fix']).toMatchObject({ label: 'redo', share: 0.2, wait: { value: 30, unit: 'min' } });
    expect(exits['Ship>(Done)']).toMatchObject({ label: '', share: null, wait: { value: 1, unit: 'd' } });
    expect(exits['Fix>Do'].wait).toBeNull();
    expect(exits['Extra>Do'].wait).toEqual({ value: 7.5, unit: 'min', spread: { low: 5, mode: null, high: 10 } });

    const bad = {
      'A: Do -> {2 h} Next\nA: Next': 'TIME_NOT_UNDERSTOOD',
      'A: Do -> ok {10 min, wait 2 h}: Next\nA: Next': 'TIME_NOT_UNDERSTOOD',
      'A: Do -> ok {soon}: Next\nA: Next': 'TIME_NOT_UNDERSTOOD',
      'A: Do -> ok 2 h}: Next\nA: Next': 'TIME_NOT_UNDERSTOOD'
    };
    for (const [input, code] of Object.entries(bad)) {
      const err = await parse(page, input);
      expect(err.errors.map((e) => [e.line, e.code]), input).toEqual([[1, code]]);
    }
  });

  test('=> is all of these at once: no shares, never mixed with ->, and still all of these with one target per line', async ({ page }) => {
    const out = await parse(page, 'A: Split => left: L, R, "Odd => name"\nA: L\nA: R\nA: "Odd => name"\nA: Single => L');
    expect(out.errors).toEqual([]);
    expect(out.exits.map((e) => [e.source, e.target, e.label, e.parallel])).toEqual([
      ['Split', 'L', 'left', true], ['Split', 'R', '', true], ['Split', 'Odd => name', '', true], ['Single', 'L', '', true]
    ]);
    // Written one target to a line, the branches are still done at the same time, never split evenly.
    const lines = await build(page, 'A: Start {1 h} => Left\nA: Start => Right\nA: Left {2 h} -> Join\nA: Right {5 h} -> Join\nA: Join {1 h} -> (Done)\nA: (Done)');
    expect(codes(lines.warnings)).not.toContain('SHARE_ASSUMED');
    expect(lines.result.lead).toBeCloseTo(7, 10);
    expect(codes((await parse(page, 'A: S => X\nA: S -> Y\nA: X\nA: Y')).errors)).toEqual(['MIXED_EXITS']);
    expect(codes((await parse(page, 'A: S => a 50%: X, Y\nA: X\nA: Y')).errors)).toEqual(['SHARE_ON_PARALLEL']);
    const mixed = await parse(page, 'A: S => X, Y\nA: X\nA: Y\nA: Z\nA: S -> Z');
    expect(mixed.errors.map((e) => [e.line, e.code])).toEqual([[5, 'MIXED_EXITS']]);
    expect(codes((await parse(page, 'A: S -> X => Y\nA: X\nA: Y')).errors)).toEqual(['LINE_NOT_UNDERSTOOD']);
    // Moving a step still finds the line when its arrow is the double one.
    const moved = await page.evaluate(() => window.ProcessFlowMapper.parser.setStepLane('A: S {1 h} => X, Y', 'S', 'B'));
    expect(moved).toBe('B: S {1 h} => X, Y');
  });

  test('in and out lines belong to the phase they sit under, and say who from and who to', async ({ page }) => {
    const out = await parse(page, text(
      'in: Brief from Client',
      '== Make ==',
      'in: Parts from Supplier, Drawing',
      'OUT: Widget to Customer, Report to Head of quality to sign',
      'A: Build -> (Done)',
      'A: (Done)'
    ));
    expect(out.errors).toEqual([]);
    expect(out.sipoc.map((e) => [e.phase, e.kind, e.item, e.party, e.line])).toEqual([
      [-1, 'in', 'Brief', 'Client', 1],
      [0, 'in', 'Parts', 'Supplier', 3],
      [0, 'in', 'Drawing', '', 3],
      [0, 'out', 'Widget', 'Customer', 4],
      // The last "to" divides, so a thing may have one in its name.
      [0, 'out', 'Report to Head of quality', 'sign', 4]
    ]);
    expect(out.lanes).toEqual(['A']);
    // Quotes keep a comma, "from" or "to" inside one thing, and are taken off.
    const quoted = await parse(page, 'in: "Parts, kit" from Supplier, Drawing from "Design to cost", Kit from "Bits from Bob"\nout: "Letter to sign" to Head of quality\nA: Do');
    expect(quoted.errors).toEqual([]);
    expect(quoted.sipoc.map((e) => [e.item, e.party])).toEqual([
      ['Parts, kit', 'Supplier'], ['Drawing', 'Design to cost'], ['Kit', 'Bits from Bob'], ['Letter to sign', 'Head of quality']
    ]);
    expect((await parse(page, 'in:\nA: Do')).errors.map((e) => [e.line, e.code])).toEqual([[1, 'SIPOC_NOT_UNDERSTOOD']]);
    expect((await parse(page, 'out: to Customer\nA: Do')).errors.map((e) => [e.line, e.code])).toEqual([[1, 'SIPOC_NOT_UNDERSTOOD']]);
    const many = `${Array.from({ length: 81 }, (_, i) => `in: Thing ${i}`).join('\n')}\nA: Do`;
    expect(codes((await parse(page, many)).errors)).toEqual(['TOO_MANY_SIPOC']);
  });
});

test.describe('waits on the way and ranges in the solve', () => {
  test('a wait on an exit counts once for every time the exit is taken, and sits with the step it leads to', async ({ page }) => {
    const m = await build(page, ON_THE_WAY);
    const r = m.result;
    // Do is passed 1.25 times. Touch: 1.25 x 0.5 + 0.25 x 0.25 + 1/6.
    expect(r.touch).toBeCloseTo(0.625 + 0.0625 + 1 / 6, 10);
    // Waits: Do 1.25, on the way to Ship 1.25 x 0.8 x 2, to Fix 1.25 x 0.2 x 0.5, to Done 8.
    expect(r.wait).toBeCloseTo(1.25 + 2 + 0.125 + 8, 10);
    expect(r.lead).toBeCloseTo(12.2291666667, 8);
    expect(stepOf(m, 'Ship').wait).toBeCloseTo(2, 10);
    expect(stepOf(m, 'Fix').wait).toBeCloseTo(0.125, 10);
    expect(stepOf(m, '(Done)').lead).toBeCloseTo(8, 10);
    expect(stepOf(m, 'Do').wait).toBeCloseTo(1.25, 10);
    expect(r.perStep.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 10);
    expect(r.perStep.reduce((s, p) => s + p.lead, 0)).toBeCloseTo(r.lead, 10);
    // With the rework exit never taken: 1.5 + 2 + 1/6 + 8.
    expect(r.leadNoRework).toBeCloseTo(11.6666666667, 8);
    expect(r.reworkCost).toBeCloseTo(0.5625, 8);
    expect(r.yield).toBeCloseTo(0.8, 10);
    expect(m.labels).toEqual(['', 'ok 80% · 2 h', 'redo 20% · 30 min', '', 'wait 1 d']);
    // The day follows the working calendar here as everywhere.
    const long = await build(page, ON_THE_WAY, { hoursPerDay: 24 });
    expect(long.result.lead - m.result.lead).toBeCloseTo(16, 8);
  });

  test('a range is solved at its average, drawn with a mark, and converted on the working day', async ({ page }) => {
    const ranged = await build(page, 'A: (Start) -> Do\nA: Do {10-30 min, wait 1-2-9 h} -> {1-3 d}: (End)\nA: (End)', { hoursPerDay: 10 });
    const fixed = await build(page, 'A: (Start) -> Do\nA: Do {20 min, wait 4 h} -> {2 d}: (End)\nA: (End)', { hoursPerDay: 10 });
    expect(ranged.result.lead).toBeCloseTo(fixed.result.lead, 10);
    expect(ranged.result.lead).toBeCloseTo(1 / 3 + 4 + 20, 10);
    const node = ranged.graph.nodes[1];
    expect(node.touchSpread).toEqual({ low: 1 / 6, mode: null, high: 0.5 });
    expect(node.waitSpread).toEqual({ low: 1, mode: 2, high: 9 });
    expect(ranged.graph.links[1].waitSpread).toEqual({ low: 10, mode: null, high: 30 });
    expect(fixed.graph.nodes[1].waitSpread).toBeNull();
    expect(ranged.layout.steps[1].info[0]).toBe('~20 min + wait ~4 h');
    expect(ranged.labels[1]).toBe('wait ~2 d');
    expect(fixed.layout.steps[1].info[0]).toBe('20 min + wait 4 h');
  });
});

test.describe('work done at the same time', () => {
  const blocks = (page, links, count) => page.evaluate(([l, c]) => window.ProcessFlowMapper.parallel.findBlocks(c, l), [links, count]);
  const L = (source, target, parallel = false) => ({ source, target, parallel });

  test('findBlocks pairs each split with the nearest step where its branches meet', async ({ page }) => {
    // 0 splits to 1 and 2, which meet at 3.
    const simple = await blocks(page, [L(0, 1, true), L(0, 2, true), L(1, 3), L(2, 3), L(3, 4)], 5);
    expect(simple.problems).toEqual([]);
    expect(simple.blocks).toEqual([{
      split: 0, join: 3, size: 2,
      branches: [{ link: 0, head: 1, nodes: [1], links: [0, 2] }, { link: 1, head: 2, nodes: [2], links: [1, 3] }]
    }]);

    // A split inside a branch, both meeting at the same step: the inner block comes first.
    const nested = await blocks(page, [L(0, 1, true), L(0, 2, true), L(1, 3, true), L(1, 4, true), L(3, 5), L(4, 5), L(2, 5), L(5, 6)], 7);
    expect(nested.problems).toEqual([]);
    expect(nested.blocks.map((b) => [b.split, b.join, b.size, b.branches.map((br) => br.nodes)])).toEqual([
      [1, 5, 2, [[3], [4]]],
      [0, 5, 4, [[1, 3, 4], [2]]]
    ]);

    // A loop inside a branch stays in the branch, and a way round the whole block is fine.
    const looped = await blocks(page, [L(0, 1), L(0, 5), L(1, 2, true), L(1, 3, true), L(2, 5), L(3, 4), L(4, 3), L(4, 5), L(5, 6)], 7);
    expect(looped.problems).toEqual([]);
    expect(looped.blocks.map((b) => [b.split, b.join, b.branches.map((br) => br.nodes)])).toEqual([[1, 5, [[2], [3, 4]]]]);

    // Exits that are not taken together make no block.
    expect((await blocks(page, [L(0, 1), L(0, 2), L(1, 3), L(2, 3)], 4)).blocks).toEqual([]);
  });

  test('findBlocks refuses branches that never meet, leak, are entered from outside or go back to the split', async ({ page }) => {
    const cases = {
      'never meet': [[L(0, 1, true), L(0, 2, true), L(1, 3), L(2, 4)], 5, { code: 'PARALLEL_NO_JOIN' }],
      'a way in from outside': [[L(6, 0), L(6, 1), L(0, 1, true), L(0, 2, true), L(1, 3), L(2, 3), L(3, 4)], 7, { code: 'PARALLEL_LEAKS' }],
      'a branch goes back to the split': [[L(0, 1, true), L(0, 2, true), L(1, 3), L(1, 0), L(2, 3), L(3, 4)], 5, { code: 'PARALLEL_LEAKS' }],
      'a branch skips a step the other has': [[L(0, 1, true), L(0, 2, true), L(1, 3), L(3, 4), L(2, 3), L(2, 4), L(4, 5)], 6, { code: 'PARALLEL_LEAKS' }]
    };
    for (const [name, [links, count, problem]] of Object.entries(cases)) {
      const out = await blocks(page, links, count);
      expect(out.blocks, name).toEqual([]);
      expect(out.problems, name).toEqual([{ split: 0, ...problem }]);
    }
  });

  test('a rejection inside a branch stops the work there, counted once, against figures done by hand', async ({ page }) => {
    // X passes 80%, Y 50%, and both always run to the end. The work goes on only
    // if both pass: 0.4. Stopped by X: 0.2. Stopped by Y with X passing: 0.5 x 0.8
    // = 0.4. A unit both stop is X's, the branch written first, so the three add to 1.
    const m = await build(page, text(
      'A: (Start) -> S',
      'A: S {1 h} => X, Y',
      'A: X {2 h} -> ok 80%: J, no 20%: (No X)',
      'A: Y {4 h} -> ok 50%: J, no 50%: (No Y)',
      'A: J {1 h} -> (Done)',
      'A: (Done)',
      'A: (No X)',
      'A: (No Y)'
    ));
    expect(m.graph.parallel.problems).toEqual([]);
    const r = m.result;
    const byName = Object.fromEntries(r.ends.map((e) => [m.graph.nodes[e.index].name, Math.round(e.share * 1e9) / 1e9]));
    expect(byName).toEqual({ '(Done)': 0.4, '(No X)': 0.2, '(No Y)': 0.4 });
    expect(r.passes[m.graph.nodes.findIndex((n) => n.name === 'J')]).toBeCloseTo(0.4, 10);
    // Lead: 1 h, then the slower branch's 4 h, then the join's hour for the 40% that get there.
    expect(r.lead).toBeCloseTo(5.4, 10);
    // Touch counts both branches in full, since neither is called back.
    expect(r.touch).toBeCloseTo(7.4, 10);
    expect(r.yield).toBeCloseTo(1, 10);
    expect(r.perStep[m.graph.nodes.findIndex((n) => n.name === 'X')].slack).toBeCloseTo(2, 10);
    // Fixed times and one slower branch: the simulation lands on the same lead, and the same ends.
    expect(m.spread.mean).toBeCloseTo(5.4, 1);
    const sim = Object.fromEntries(m.spread.ends.map((e) => [m.graph.nodes[e.index].name, e.share]));
    for (const [name, share] of Object.entries(byName)) expect(Math.abs(sim[name] - share), name).toBeLessThan(0.015);
    // With rework in a branch, a unit is clean only if no branch sent anything back.
    const rework = await build(page, text(
      'A: (Start) -> S',
      'A: S => X, Y',
      'A: X -> X ok?',
      'A: X ok? -> ok 60%: J, again 30%: X, no 10%: (No X)',
      'A: Y -> ok 50%: J, no 50%: (No Y)',
      'A: J -> (Done)',
      'A: (Done)', 'A: (No X)', 'A: (No Y)'
    ));
    // X reaches the join or its end with no return 70% of the time; Y always. 0.7 x 1.
    expect(rework.result.yield).toBeCloseTo(0.7, 10);
  });

  test('a branch straight to the join is a wait on its own, solved by hand and walked', async ({ page }) => {
    // Parts take 3 d in transit while Prep takes 4 h, so the block is the 24 h wait.
    const transit = text(
      'A: Order parts {1 h} => {wait 3 d}: Assemble, Prep',
      'A: Prep {4 h} -> Assemble',
      'A: Assemble {2 h} -> (Done)',
      'A: (Done)'
    );
    const found = await blocks(page, [L(0, 1, true), L(0, 2, true), L(2, 1), L(1, 3)], 4);
    expect(found.problems).toEqual([]);
    expect(found.blocks[0]).toMatchObject({ split: 0, join: 1, branches: [{ link: 0, head: 1, nodes: [], links: [0] }, { link: 1, head: 2, nodes: [2], links: [1, 2] }] });
    const m = await build(page, transit);
    expect(codes(m.warnings)).not.toContain('WITHHELD_PARALLEL');
    const r = m.result;
    expect(r.lead).toBeCloseTo(27, 10);
    expect(r.touch).toBeCloseTo(7, 10);
    expect(r.touchPath).toBeCloseTo(3, 10);
    expect(r.passes.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 1, 1, 1]);
    expect(r.yield).toBeCloseTo(1, 10);
    expect(r.perStep[1].slack).toBeCloseTo(20, 10);
    expect(r.perStep[1].critical).toBe(false);
    expect(m.spread.min).toBeCloseTo(27, 10);
    expect(m.spread.max).toBeCloseTo(27, 10);
    // The wait is counted with the step it leads to, and only once.
    expect(r.perStep[2].wait).toBeCloseTo(24, 10);
    expect(r.perStep.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 10);
  });

  test('a block takes as long as its slowest branch, the work adds up, and the faster branch has slack', async ({ page }) => {
    const m = await build(page, SPLIT);
    const r = m.result;
    expect(r.lead).toBeCloseTo(6, 10);
    expect(r.touch).toBeCloseTo(7, 10);
    expect(r.touchPath).toBeCloseTo(5, 10);
    expect(r.wait).toBeCloseTo(1, 10);
    expect(r.efficiency).toBeCloseTo(5 / 6, 10);
    expect(r.yield).toBe(1);
    expect(r.passes).toEqual([1, 1, 1, 1, 1, 1]);
    expect(r.blocks).toEqual([{ split: 1, join: 4, spans: [2, 4], longest: 1 }]);
    expect(stepOf(m, 'Left')).toMatchObject({ critical: false, slack: 2, share: 0, lead: 2 });
    expect(stepOf(m, 'Right')).toMatchObject({ critical: true, slack: 0 });
    expect(stepOf(m, 'Right').share).toBeCloseTo(4 / 6, 10);
    expect(r.perStep.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 10);
    expect(m.totals.lanes.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 10);
    expect(m.totals.lanes.map((l) => l.touch)).toEqual([4, 3]);
    expect(r.handoffsPerUnit).toBeCloseTo(2, 10);
    expect(r.ends).toEqual([{ index: 5, share: 1 }]);

    // What the map and the words say about it.
    expect(m.labels).toEqual(['', '+', '+', '', '', '']);
    expect(m.layout.steps[2].info).toEqual(['2 h', '2 h slack']);
    const S = await page.evaluate((t) => {
      const P = window.ProcessFlowMapper;
      const model = P.buildModel(t);
      return { sentence: P.summarySentence(model), touch: P.headline(model).find((h) => h.key === 'touch') };
    }, SPLIT);
    expect(S.sentence).toContain('takes 6 h on average along its slowest path, of which 5 h is work and 1 h is waiting');
    expect(S.sentence).toContain('Work done at the same time brings the work to 7 h in all');
    expect(S.touch).toMatchObject({ value: '7 h', hint: 'all the work, on every branch' });
    expect(codes(m.warnings)).toEqual([]);

    // A wait on the way out of the faster branch uses up slack and adds nothing to lead time.
    const way = await build(page, SPLIT.replace('A: Left {2 h} -> Join', 'A: Left {2 h} -> {1 h}: Join'));
    expect(way.result.blocks[0].spans).toEqual([3, 4]);
    expect(way.result.lead).toBeCloseTo(6, 10);
    expect(stepOf(way, 'Left').slack).toBeCloseTo(1, 10);
    expect(stepOf(way, 'Join').share).toBeCloseTo(1 / 6, 10);
    expect(way.result.perStep.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 10);
  });

  test('yield through a block is the product of its branches, and a loop in a branch stretches only that branch', async ({ page }) => {
    const m = await build(page, text(
      'A: (Start) -> Split',
      'A: Split {1 h} => Left, Right',
      'A: Left {2 h} -> Left ok?',
      'A: Left ok? -> yes 90%: Join, no 10%: Left',
      'B: Right {3 h} -> Right ok?',
      'B: Right ok? -> yes 80%: Join, no 20%: Right',
      'A: Join {1 h} -> (End)',
      'A: (End)'
    ));
    const r = m.result;
    expect(r.yield).toBeCloseTo(0.72, 10);
    expect(stepOf(m, 'Left').passes).toBeCloseTo(1 / 0.9, 10);
    expect(stepOf(m, 'Right').passes).toBeCloseTo(1.25, 10);
    expect(stepOf(m, 'Join').passes).toBeCloseTo(1, 10);
    expect(r.blocks[0].spans[0]).toBeCloseTo(2 / 0.9, 10);
    expect(r.blocks[0].spans[1]).toBeCloseTo(3.75, 10);
    expect(r.lead).toBeCloseTo(5.75, 10);
    expect(r.touch).toBeCloseTo(2 + 2 / 0.9 + 3.75, 10);
    // With no rework the slower branch is 3 h, so rework costs 45 minutes of lead time.
    expect(r.leadNoRework).toBeCloseTo(5, 10);
    expect(r.reworkCost).toBeCloseTo(0.75, 10);
    expect(stepOf(m, 'Left').slack).toBeCloseTo(3.75 - 2 / 0.9, 10);
  });

  test('blocks nest, sit inside loops and can be passed by, each against figures done by hand', async ({ page }) => {
    const nested = await build(page, text(
      'A: (Start) -> S',
      'A: S => A1, B1',
      'A: A1 {1 h} => C1, D1',
      'A: C1 {2 h} -> J',
      'A: D1 {5 h} -> J',
      'B: B1 {4 h} -> J',
      'A: J -> (End)',
      'A: (End)'
    ));
    expect(nested.result.blocks).toEqual([
      { split: 2, join: 6, spans: [2, 5], longest: 1 },
      { split: 1, join: 6, spans: [6, 4], longest: 0 }
    ]);
    expect(nested.result.lead).toBeCloseTo(6, 10);
    expect(nested.result.touch).toBeCloseTo(12, 10);
    expect(stepOf(nested, 'J').passes).toBeCloseTo(1, 10);
    expect(stepOf(nested, 'C1').slack).toBeCloseTo(3, 10);
    expect(stepOf(nested, 'B1').slack).toBeCloseTo(2, 10);
    expect(stepOf(nested, 'D1').critical).toBe(true);

    // Half the work goes round again, so the whole block is done twice.
    const looped = await build(page, text(
      'A: (Start) -> Split',
      'A: Split {1 h} => L, R',
      'A: L {2 h} -> Good?',
      'A: R {4 h} -> Good?',
      'A: Good? {1 h} -> ok 50%: (End), again 50%: Split',
      'A: (End)'
    ));
    expect(looped.result.passes.slice(1, 5).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([2, 2, 2, 2]);
    expect(looped.result.lead).toBeCloseTo(12, 10);
    expect(looped.result.touch).toBeCloseTo(16, 10);
    expect(looped.result.yield).toBeCloseTo(0.5, 10);
    expect(looped.result.blocks[0].spans).toEqual([2, 4]);
    expect(looped.result.leadNoRework).toBeCloseTo(6, 10);

    // Six in ten skip the block and go straight to the step where it meets.
    const bypass = await build(page, text(
      'A: (Start) -> Need both?',
      'A: Need both? -> yes 40%: Split, no 60%: Join',
      'A: Split => L, R',
      'A: L {2 h} -> Join',
      'A: R {4 h} -> Join',
      'A: Join {1 h} -> (End)',
      'A: (End)'
    ));
    expect(stepOf(bypass, 'Join').passes).toBeCloseTo(1, 10);
    expect(stepOf(bypass, 'L').passes).toBeCloseTo(0.4, 10);
    expect(bypass.result.lead).toBeCloseTo(0.4 * 4 + 1, 10);
    expect(bypass.result.touch).toBeCloseTo(0.4 * 6 + 1, 10);
    expect(bypass.result.blocks[0].spans.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([2, 4]);
  });

  test('branches that do not come back together give no figures, say why, and are still drawn', async ({ page }) => {
    const never = await build(page, 'A: (Start) -> S\nA: S => X, Y\nA: X {1 h} -> (End X)\nA: Y {1 h} -> (End Y)\nA: (End X)\nA: (End Y)');
    expect(never.ok).toBe(true);
    expect(never.result).toMatchObject({ ok: false, code: 'PARALLEL', nodes: [1] });
    expect(codes(never.warnings)).toEqual(expect.arrayContaining(['WITHHELD_PARALLEL', 'PARALLEL_NO_JOIN']));
    expect(never.warnings.find((w) => w.code === 'PARALLEL_NO_JOIN')).toMatchObject({ line: 2 });
    expect(never.warnings.find((w) => w.code === 'PARALLEL_NO_JOIN').message).toContain('"S"');
    expect(never.layout.steps).toHaveLength(6);
    expect(never.spread).toBeNull();
    expect(never.totals).toBeNull();

    // A rejection inside a branch is not a leak: the branch ends there.
    const reject = await build(page, 'A: (Start) -> S\nA: S => X, Y\nA: X -> J\nA: Y -> ok 50%: J, no 50%: (Dropped)\nA: (Dropped)\nA: J -> (End)\nA: (End)');
    expect(reject.result.ok).toBe(true);
    expect(codes(reject.warnings)).not.toContain('WITHHELD_PARALLEL');
    // Several exits with no share are still read as one of these, and the note now points at the double arrow.
    const even = await build(page, 'A: (Start) -> S\nA: S -> X, Y\nA: X -> (End)\nA: Y -> (End)\nA: (End)');
    expect(even.warnings.find((w) => w.code === 'SHARE_ASSUMED').message).toContain('write the arrow as =>');
    expect(even.graph.parallel.blocks).toEqual([]);
  });
});

test.describe('the simulation', () => {
  test('sampleTime, quantile and histogram do what their closed forms say', async ({ page }) => {
    const out = await page.evaluate(() => {
      const { sampleTime, quantile, histogram, mulberry32 } = window.ProcessFlowMapper.simulator;
      const at = (u, spread, fixed = 7) => sampleTime(fixed, spread, () => u);
      const rng = mulberry32(42);
      const draws = Array.from({ length: 5 }, () => rng());
      const again = mulberry32(42);
      return {
        fixed: at(0.3, null),
        even: [0, 0.25, 0.999].map((u) => at(u, { low: 2, mode: null, high: 6 })),
        // A triangle from 0 to 10 peaking at 2: a fifth of the draws fall below the peak.
        peak: [0, 0.2, 0.5, 0.95, 1].map((u) => at(u, { low: 0, mode: 2, high: 10 })),
        flat: at(0.4, { low: 3, mode: 3, high: 3 }),
        quantiles: [0.01, 0.5, 0.8, 0.95, 1].map((p) => quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], p)),
        empty: Number.isNaN(quantile([], 0.5)),
        histogram: histogram([0, 0, 1, 2, 2, 2, 3, 4, 9, 50], 4),
        same: histogram([5, 5, 5], 4),
        repeat: draws.every((d) => d === again()),
        inRange: draws.every((d) => d >= 0 && d < 1)
      };
    });
    expect(out.fixed).toBe(7);
    expect(out.even[0]).toBe(2);
    expect(out.even[1]).toBe(3);
    expect(out.even[2]).toBeCloseTo(5.996, 10);
    expect(out.peak[0]).toBe(0);
    expect(out.peak[1]).toBeCloseTo(2, 10);
    expect(out.peak[2]).toBeCloseTo(10 - Math.sqrt(40), 10);
    expect(out.peak[3]).toBeCloseTo(8, 10);
    expect(out.peak[4]).toBe(10);
    expect(out.flat).toBe(3);
    // Nearest rank: always a value that occurred.
    expect(out.quantiles).toEqual([1, 5, 8, 10, 10]);
    expect(out.empty).toBe(true);
    // From the lowest to the value 99 in 100 are within, here the largest, in four bins.
    expect(out.histogram).toEqual({ from: 0, to: 50, counts: [9, 0, 0, 1] });
    expect(out.same).toBeNull();
    expect(out.repeat).toBe(true);
    expect(out.inRange).toBe(true);
  });

  test('one loop gives a geometric number of passes, so the percentiles are known exactly', async ({ page }) => {
    // 30% goes round again: 70% take one pass, 91% two or fewer, 97.3% three or fewer.
    const m = await build(page, 'A: (Start) -> Work\nA: Work {1 h} -> ok 70%: (Done), again 30%: Redo\nA: Redo -> Work\nA: (Done)');
    const s = m.spread;
    expect(s.units).toBe(20000);
    expect(s.seed).toBe(1);
    expect(s.cut).toBe(false);
    expect([s.p50, s.p80, s.p95]).toEqual([1, 2, 3]);
    expect(s.min).toBe(1);
    expect(s.max).toBeGreaterThanOrEqual(5);
    expect(Math.abs(s.mean - 1 / 0.7)).toBeLessThan(4 * s.error);
    expect(s.error).toBeGreaterThan(0.003);
    expect(s.error).toBeLessThan(0.008);
    expect(s.varies).toBe(true);
    expect(s.ranges).toBe(false);
    expect(s.histogram.counts.reduce((a, b) => a + b, 0)).toBe(20000);
    expect(s.ends).toEqual([{ index: 3, share: 1, p50: 1, p90: 2 }]);
  });

  test('a time given as a range is drawn from it: even between two numbers, a triangle around three', async ({ page }) => {
    const even = (await build(page, 'A: (Start) -> Work\nA: Work {wait 0-10 h} -> (Done)\nA: (Done)')).spread;
    expect(even.ranges).toBe(true);
    expect(Math.abs(even.mean - 5)).toBeLessThan(4 * even.error);
    expect(even.p50).toBeCloseTo(5, 0);
    expect(Math.abs(even.p80 - 8)).toBeLessThan(0.15);
    expect(Math.abs(even.p95 - 9.5)).toBeLessThan(0.1);
    expect(even.min).toBeGreaterThanOrEqual(0);
    expect(even.max).toBeLessThanOrEqual(10);

    const peak = (await build(page, 'A: (Start) -> Work\nA: Work {wait 0-2-10 h} -> (Done)\nA: (Done)')).spread;
    expect(Math.abs(peak.mean - 4)).toBeLessThan(4 * peak.error);
    expect(Math.abs(peak.p50 - (10 - Math.sqrt(40)))).toBeLessThan(0.12);
    expect(Math.abs(peak.p95 - 8)).toBeLessThan(0.15);

    // A wait on the way is drawn too.
    const way = (await build(page, 'A: (Start) -> Work\nA: Work {1 h} -> {0-4 h}: (Done)\nA: (Done)')).spread;
    expect(way.min).toBeGreaterThanOrEqual(1);
    expect(way.max).toBeLessThanOrEqual(5);
    expect(Math.abs(way.mean - 3)).toBeLessThan(4 * way.error);
  });

  test('fixed times and no branching leave nothing to spread, and no times leave nothing to simulate', async ({ page }) => {
    const chain = await build(page, 'A: (Start) -> Work\nA: Work {1 h, wait 2 h} -> (Done)\nA: (Done)');
    expect(chain.spread).toMatchObject({ varies: false, p50: 3, p95: 3, mean: 3, histogram: null });
    expect((await build(page, 'A: (Start) -> Work\nA: Work -> (Done)\nA: (Done)')).spread).toBeNull();
    expect((await build(page, 'A: Work {1 h} -> Back\nA: Back -> Work')).spread).toBeNull();
  });

  test('the seed decides the run, and a map that loops heavily is walked for fewer units', async ({ page }) => {
    const loop = 'A: (Start) -> Work\nA: Work {wait 1-5 h} -> ok 60%: (Done), again 40%: Redo\nA: Redo {1 h} -> Work\nA: (Done)';
    const a = (await build(page, loop, { seed: 7 })).spread;
    const b = (await build(page, loop, { seed: 7 })).spread;
    const c = (await build(page, loop, { seed: 8 })).spread;
    expect(a).toEqual(b);
    expect(c.seed).toBe(8);
    expect(c.mean).not.toBe(a.mean);
    expect(Math.abs(c.mean - a.mean)).toBeLessThan(6 * a.error);

    // 99.5% goes round again: 400 steps a unit, so an eighth of the usual units fit the budget.
    const heavy = await build(page, 'A: (Start) -> Work\nA: Work {1 min} -> ok 0.5%: (Done), again 99.5%: Redo\nA: Redo -> Work\nA: (Done)');
    expect(heavy.spread.units).toBe(2500);
    expect(heavy.spread.cut).toBe(false);
    // At 99.95% even the fewest units allowed do not fit, and the run says it stopped early.
    const heavier = await build(page, 'A: (Start) -> Work\nA: Work {1 min} -> ok 0.05%: (Done), again 99.95%: Redo\nA: Redo -> Work\nA: (Done)');
    expect(heavier.spread.cut).toBe(true);
    expect(heavier.spread.units).toBeLessThan(2000);
    expect(heavier.spread.units).toBeGreaterThan(500);
    const cut = await page.evaluate(() => window.ProcessFlowMapper.simulator.simulate({
      count: 2, links: [{ source: 0, target: 1, share: 1 }], touch: [1, 1], wait: [0, 0], starts: [0]
    }, { units: 100, maxVisits: 41 }));
    expect(cut).toMatchObject({ ok: true, units: 20, cut: true, mean: 2 });
  });

  test('the slowest of two branches that vary takes longer than the slowest average, and the tool says so', async ({ page }) => {
    // Each branch is 4 h repeated a geometric number of times with p = 1/2, 8 h on average.
    // The larger of two such counts averages 8/3, so the block averages 32/3 h.
    const map = text(
      'A: (Start) -> Split',
      'A: Split => L, R',
      'A: L {4 h} -> L ok?',
      'A: L ok? -> yes 50%: Join, no 50%: L',
      'A: R {4 h} -> R ok?',
      'A: R ok? -> yes 50%: Join, no 50%: R',
      'A: Join -> (End)',
      'A: (End)'
    );
    const m = await build(page, map);
    expect(m.result.lead).toBeCloseTo(8, 10);
    expect(m.result.yield).toBeCloseTo(0.25, 10);
    expect(Math.abs(m.spread.mean - 32 / 3)).toBeLessThan(4 * m.spread.error);
    const note = m.warnings.find((w) => w.code === 'PARALLEL_AVERAGE');
    expect(note.message).toContain('Simulation puts the lead time at');
    expect(note.message).toContain('against the 1 d shown');
    // The lead time card and the sentence carry the simulated figure too, not only the warning list.
    const said = await page.evaluate((t) => {
      const P = window.ProcessFlowMapper;
      const [withBlocks, fixed] = [P.buildModel(t[0]), P.buildModel(t[1])];
      return {
        mean: withBlocks.parallelMean, about: P.formatDuration(withBlocks.parallelMean, withBlocks.graph.calendar),
        hint: P.headline(withBlocks)[0].hint, sentence: P.summarySentence(withBlocks),
        fixedMean: fixed.parallelMean, fixedHint: P.headline(fixed)[0].hint
      };
    }, [map, SPLIT]);
    expect(said.mean).toBe(m.spread.mean);
    expect(said.hint).toBe(`slowest path on average; about ${said.about} waiting for every branch`);
    expect(said.sentence).toContain(`waiting for whichever is slowest makes it about ${said.about}.`);
    // Branches with fixed times have nothing to disagree about.
    expect(codes((await build(page, SPLIT)).warnings)).not.toContain('PARALLEL_AVERAGE');
    expect((await build(page, SPLIT)).spread).toMatchObject({ varies: false, mean: 6 });
    expect(said.fixedMean).toBeNull();
    expect(said.fixedHint).toBe('start to finish, per unit of work');
  });

  test('a fork and join walk written here agrees with the solve and with the simulation on built maps, rejections inside branches included', async ({ page }) => {
    test.setTimeout(120000);
    const result = await page.evaluate(() => {
      const S = window.ProcessFlowMapper;
      let seed = 20261003;
      const rnd = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };

      // Maps are built from the end backwards, so every split knows the step its branches meet at.
      const makeMap = () => {
        const lines = [];
        const joinOf = {};
        let id = 0;
        const times = () => `{${1 + Math.floor(rnd() * 50)} min, wait ${Math.floor(rnd() * 5)} h}`;
        const lane = () => `Lane ${Math.floor(rnd() * 3)}`;
        const item = (next, depth) => {
          id += 1;
          const r = rnd();
          if (depth < 2 && r < 0.3) {
            const split = `P${id}`;
            const count = rnd() < 0.3 ? 3 : 2;
            const heads = [];
            for (let b = 0; b < count; b++) heads.push(seq(1 + Math.floor(rnd() * 2), next, depth + 1));
            lines.push(`${lane()}: ${split} ${times()} => ${heads.join(', ')}`);
            joinOf[split] = next;
            return split;
          }
          // Inside a branch, a check may stop the work there: a rejection.
          if (depth > 0 && r < 0.45) {
            const pass = 70 + Math.floor(rnd() * 25);
            lines.push(`${lane()}: C${id}? ${times()} -> ok ${pass}%: ${next}, out ${100 - pass}%: (Out ${id})`);
            lines.push(`Lane 0: (Out ${id})`);
            return `C${id}?`;
          }
          if (r < 0.6) {
            const pass = 55 + Math.floor(rnd() * 40);
            const way = rnd() < 0.5 ? ` {${1 + Math.floor(rnd() * 3)} h}` : '';
            lines.push(`${lane()}: C${id}? ${times()} -> ok ${pass}%${way}: ${next}, no ${100 - pass}%: S${id}`);
            lines.push(`${lane()}: S${id} ${times()} -> C${id}?`);
            return `S${id}`;
          }
          lines.push(`${lane()}: S${id} ${times()} -> ${next}`);
          return `S${id}`;
        };
        const seq = (length, next, depth) => {
          let target = next;
          for (let i = 0; i < length; i++) target = item(target, depth);
          return target;
        };
        lines.push('Lane 0: (End)');
        const first = seq(3 + Math.floor(rnd() * 4), '(End)', 0);
        lines.push(`Lane 0: (Start) -> ${first}`);
        return { text: lines.reverse().join('\n'), joinOf };
      };

      const maps = [{ name: 'onboarding', text: S.PRESETS.find((p) => p.id === 'onboarding').text, joinOf: { 'Open starter record': 'Confirm start date' } }];
      for (let g = 0; g < 14; g++) maps.push({ name: `built${g}`, ...makeMap() });

      const UNITS = 40000;
      const problems = [];
      let splits = 0;
      let slowerThanAverage = 0;
      let rejections = 0;
      for (const map of maps) {
        const m = S.buildModel(map.text);
        if (!m.ok || !m.result.ok) { problems.push(`${map.name}: did not solve`); continue; }
        const { nodes, links } = m.graph;
        splits += m.graph.parallel.blocks.length;
        const index = new Map(nodes.map((n) => [n.name, n.index]));
        const visits = new Array(nodes.length).fill(0);
        const endedHere = new Array(nodes.length).fill(0);
        let touch = 0;
        let clean = true;
        let endedAt = -1;

        // Walk from a step until the work ends or reaches stopAt, returning the time it took.
        const walk = (from, stopAt) => {
          let at = from;
          let time = 0;
          for (;;) {
            if (at === stopAt) return time;
            const node = nodes[at];
            visits[at] += 1;
            touch += node.touch;
            time += node.touch + node.wait;
            if (!node.outLinks.length) { endedAt = at; return time; }
            if (links[node.outLinks[0]].parallel) {
              // Every branch runs; a branch that ends stops the unit, counted at the first such branch.
              const join = index.get(map.joinOf[node.name]);
              let slowest = 0;
              let stopped = -1;
              for (const li of node.outLinks) {
                endedAt = -1;
                slowest = Math.max(slowest, links[li].wait + walk(links[li].target, join));
                if (endedAt >= 0 && stopped < 0) stopped = endedAt;
              }
              time += slowest;
              if (stopped >= 0) { endedAt = stopped; return time; }
              at = join;
              continue;
            }
            let u = rnd();
            let taken = links[node.outLinks[node.outLinks.length - 1]];
            for (const li of node.outLinks) {
              u -= links[li].share;
              if (u < 0) { taken = links[li]; break; }
            }
            if (taken.rework) clean = false;
            time += taken.wait;
            at = taken.target;
          }
        };

        let lead = 0;
        let cleanUnits = 0;
        for (let k = 0; k < UNITS; k++) {
          clean = true;
          endedAt = -1;
          lead += walk(m.graph.starts[0], -1);
          endedHere[endedAt] += 1;
          if (clean) cleanUnits += 1;
        }
        // Each unit ends once, so the shares add to one and match the walk.
        for (const end of m.result.ends) {
          const walked = endedHere[end.index] / UNITS;
          if (Math.abs(walked - end.share) > 0.012) problems.push(`${map.name}: ${nodes[end.index].name} ends ${end.share.toFixed(4)} but the walk gave ${walked.toFixed(4)}`);
          if (/^\(Out /.test(nodes[end.index].name) && end.share > 0) rejections += 1;
        }
        const total = m.result.ends.reduce((t, e) => t + e.share, 0);
        if (Math.abs(total - 1) > 1e-9) problems.push(`${map.name}: end shares add to ${total}`);
        nodes.forEach((node, i) => {
          const walked = visits[i] / UNITS;
          const exact = m.result.passes[i];
          if (Math.abs(walked - exact) > 0.02 * exact + 0.01) problems.push(`${map.name}: ${node.name} passes ${exact.toFixed(4)} but the walk gave ${walked.toFixed(4)}`);
        });
        const walkedTouch = touch / UNITS;
        if (Math.abs(walkedTouch - m.result.touch) > 0.02 * m.result.touch) problems.push(`${map.name}: touch ${m.result.touch.toFixed(3)} but the walk gave ${walkedTouch.toFixed(3)}`);
        if (Math.abs(cleanUnits / UNITS - m.result.yield) > 0.012) problems.push(`${map.name}: yield ${m.result.yield.toFixed(4)} but the walk gave ${(cleanUnits / UNITS).toFixed(4)}`);
        // The simulation in the tool and the walk here are two samples of the same thing.
        const walkedLead = lead / UNITS;
        if (Math.abs(walkedLead - m.spread.mean) > 0.02 * walkedLead) problems.push(`${map.name}: simulated lead ${m.spread.mean.toFixed(3)} but the walk gave ${walkedLead.toFixed(3)}`);
        // The solve takes the slowest branch on average, which can only be at or below the truth.
        if (m.result.lead > walkedLead * 1.015) problems.push(`${map.name}: solved lead ${m.result.lead.toFixed(3)} is above the walk's ${walkedLead.toFixed(3)}`);
        if (walkedLead > m.result.lead * 1.03) slowerThanAverage += 1;
        if (!m.graph.parallel.blocks.length && Math.abs(walkedLead - m.result.lead) > 0.02 * walkedLead) problems.push(`${map.name}: no split, yet lead ${m.result.lead.toFixed(3)} differs from the walk's ${walkedLead.toFixed(3)}`);
      }
      return { problems, maps: maps.length, splits, slowerThanAverage, rejections };
    });
    expect(result.maps).toBe(15);
    expect(result.splits).toBeGreaterThan(8);
    // The sweep includes maps where branches vary enough for the difference to show.
    expect(result.slowerThanAverage).toBeGreaterThan(0);
    expect(result.rejections).toBeGreaterThan(5);
    expect(result.problems).toEqual([]);
  });
});

test.describe('the Phase 3 examples and the SIPOC rows', () => {
  test('new starter: lead time follows the checks, the other two branches have slack, and work adds across all three', async ({ page }) => {
    const m = await build(page, await preset(page, 'onboarding'));
    const r = m.result;
    // Checks: (0.5 + 40) / 0.9 for the loop, plus 10 min / 0.9 for the decision.
    const checks = 40.5 / 0.9 + (1 / 6) / 0.9;
    const laptop = 0.25 + 24 + 1.5 + 4;
    const desk = 1 / 6 + 8;
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].longest).toBe(0);
    expect(r.blocks[0].spans[0]).toBeCloseTo(checks, 9);
    expect(r.blocks[0].spans[1]).toBeCloseTo(laptop, 9);
    expect(r.blocks[0].spans[2]).toBeCloseTo(desk, 9);
    expect(r.lead).toBeCloseTo(1 / 3 + 4 + checks + 1 / 6 + 2, 9);
    expect(r.touch * 60).toBeCloseTo(20 + 40 / 0.9 + 15 + 90 + 10 + 10, 8);
    expect(r.yield).toBeCloseTo(0.9, 10);
    expect(stepOf(m, 'Order laptop').slack).toBeCloseTo(checks - laptop, 9);
    expect(stepOf(m, 'Book desk').slack).toBeCloseTo(checks - desk, 9);
    expect(m.layout.steps.find((s) => s.name === 'Book desk').info[1]).toBe('4.63 d slack');
    expect(m.layout.steps.find((s) => s.name === 'Order laptop').info[1]).toBe('1.93 d slack');
    expect(codes(m.warnings)).toEqual(['REWORK']);

    expect(m.sipoc).toEqual([
      { index: 0, name: 'Prepare', steps: 2, suppliers: ['New starter', 'Hiring manager'], inputs: ['Signed offer', 'Role details'], outputs: ['Starter record'], customers: ['IT', 'Facilities'] },
      { index: 1, name: 'Get ready', steps: 5, suppliers: ['Referees', 'Supplier'], inputs: ['References', 'Laptop'], outputs: ['Cleared checks', 'Laptop and account', 'Desk'], customers: ['Hiring manager', 'New starter'] },
      { index: 2, name: 'Start', steps: 2, suppliers: ['HR'], inputs: ['Cleared checks'], outputs: ['Start date'], customers: ['New starter'] }
    ]);
  });

  test('insurance claim: the average by hand, and a spread whose median sits under it', async ({ page }) => {
    const m = await build(page, await preset(page, 'claim'));
    const day = 8;
    const chase = 3 / 7;
    const lead = (0.25 + 10)
      + (1 / 6) / 0.7
      + chase * ((14 / 3) * day + 1 / 6)
      + (0.75 + 3 * day)
      + 0.4 * (2 + (23 / 3) * day)
      + (0.25 + 5)
      + 0.85 * (1 / 6 + 2 * day);
    expect(m.result.lead).toBeCloseTo(lead, 8);
    expect(m.result.yield).toBeCloseTo(0.7, 10);
    const s = m.spread;
    expect(s.ranges).toBe(true);
    expect(Math.abs(s.mean - lead)).toBeLessThan(4 * s.error);
    expect(s.p50).toBeLessThan(s.mean);
    expect(s.p80).toBeGreaterThan(s.mean);
    expect(s.p95).toBeGreaterThan(s.p80);
    // What the lesson says: under 11 days for half, over four weeks for one in twenty.
    expect(s.p50 / day).toBeGreaterThan(10);
    expect(s.p50 / day).toBeLessThan(11);
    expect(s.p95 / day).toBeGreaterThan(20);
    const paid = s.ends.find((e) => m.graph.nodes[e.index].name === '(Claim paid)');
    const declined = s.ends.find((e) => m.graph.nodes[e.index].name === '(Claim declined)');
    expect(Math.abs(paid.share - 0.85)).toBeLessThan(0.01);
    // A paid claim waits for finance on top of everything a declined one goes through.
    expect(paid.p50).toBeGreaterThan(declined.p50);
  });

  test('SIPOC rows follow the phases, lines before the first phase get a row of their own, and a phase with a side missing is listed', async ({ page }) => {
    const m = await build(page, text(
      'in: Brief from Client',
      '== Plan ==',
      'out: Plan to Builder',
      'A: (Start) -> Plan work',
      'A: Plan work -> Build',
      '== Build ==',
      'in: Plan from Planner, Plan from Planner, Parts',
      'B: Build -> (Done)',
      'B: (Done)'
    ));
    expect(m.sipoc).toEqual([
      { index: -1, name: 'Whole process', steps: 4, suppliers: ['Client'], inputs: ['Brief'], outputs: [], customers: [] },
      { index: 0, name: 'Plan', steps: 2, suppliers: [], inputs: [], outputs: ['Plan'], customers: ['Builder'] },
      { index: 1, name: 'Build', steps: 2, suppliers: ['Planner'], inputs: ['Plan', 'Parts'], outputs: [], customers: [] }
    ]);
    // The whole-process row may name one side only; the phases are listed.
    expect(m.warnings.find((w) => w.code === 'SIPOC_GAP').message).toBe('The SIPOC table has no inputs or no outputs for: Plan, Build');
    expect((await build(page, SPLIT)).sipoc).toBeNull();
    const whole = await build(page, 'in: Order from Customer\nout: Parcel to Customer\nA: (Start) -> Pack\nA: Pack -> (Done)\nA: (Done)');
    expect(whole.sipoc).toEqual([{ index: 0, name: 'Whole process', steps: 3, suppliers: ['Customer'], inputs: ['Order'], outputs: ['Parcel'], customers: ['Customer'] }]);
    expect(codes(whole.warnings)).not.toContain('SIPOC_GAP');
  });

  test('the small print under the map names only what the map has', async ({ page }) => {
    const notes = await page.evaluate(([plain, split, way]) => {
      const P = window.ProcessFlowMapper;
      return [plain, split, way, 'A: (Start) -> Do\nA: Do {wait 1-3 h} -> (End)\nA: (End)'].map((t) => P.footnoteText(P.buildModel(t)));
    }, ['A: (Start) -> Do\nA: Do {1 h} -> (End)\nA: (End)', SPLIT, ON_THE_WAY]);
    expect(notes[0]).toBe('Averages per unit of work. A day is 8 h, a week 5 d.');
    expect(notes[1]).toBe('Averages per unit of work. A day is 8 h, a week 5 d. + is work done at the same time.');
    expect(notes[2]).toBe('Averages per unit of work. A day is 8 h, a week 5 d. Dashed connectors are rework.');
    expect(notes[3]).toBe('Averages per unit of work. A day is 8 h, a week 5 d. ~ is the average of a range.');
  });
});
