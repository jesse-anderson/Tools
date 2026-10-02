// Process flow mapper, pure layers: parser, graph and findings, the solve,
// layout and routing. Driven through window.ProcessFlowMapper. Capacity, the baseline comparison and
// the text rewrites behind drag and paste are here too.
//
// The solve is checked three ways that share no code with it: closed forms, a
// seeded random walk written here, and identities. The layout has no external
// reference, so it rests on invariants.
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
const passesOf = (m) => Object.fromEntries(m.graph.nodes.map((n, i) => [n.name, m.result.passes[i]]));

const CHAIN = [
  'Ann: (Start) -> Draft',
  'Ann: Draft {30 min} -> Review',
  'Bob: Review {15 min, wait 2 h} -> (Done)',
  'Bob: (Done)'
].join('\n');

test.describe('parser', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('a step line gives the lane, the step, its times and its exits', async ({ page }) => {
    const out = await parse(page, [
      'lanes: Finance, Sales',
      'arrivals: 30 / wk',
      '== Take order ==',
      'Sales: (Order placed) -> Enter order',
      'Sales: Enter order {10 min, wait 2 h} -> Credit OK?',
      'Finance: Credit OK? {wait 1 d} -> yes 85%: Pick goods, no 15%: (Declined)',
      '== Fulfil ==',
      'Sales: Pick goods {1.5 h}',
      'Sales: (Declined)',
      '@ Credit OK?: limit is 30 days',
      ': Finance #4A3AA7',
      '// a comment',
      '# another'
    ].join('\n'));
    expect(out.errors).toEqual([]);
    expect(out.lanes).toEqual(['Finance', 'Sales']);
    expect(out.arrivals).toEqual({ count: 30, per: 'wk', line: 2 });
    expect(out.phases.map((p) => p.name)).toEqual(['Take order', 'Fulfil']);
    expect(out.steps.map((s) => [s.name, s.kind, s.laneName, s.phase])).toEqual([
      ['(Order placed)', 'terminator', 'Sales', 0],
      ['Enter order', 'task', 'Sales', 0],
      ['Credit OK?', 'decision', 'Finance', 0],
      ['Pick goods', 'task', 'Sales', 1],
      ['(Declined)', 'terminator', 'Sales', 1]
    ]);
    const enter = out.steps[1];
    expect(enter.touch).toEqual({ value: 10, unit: 'min' });
    expect(enter.wait).toEqual({ value: 2, unit: 'h' });
    expect(out.steps[2].touch).toBeNull();
    expect(out.steps[2].wait).toEqual({ value: 1, unit: 'd' });
    expect(out.exits.map((e) => [e.source, e.target, e.label, e.share])).toEqual([
      ['(Order placed)', 'Enter order', '', null],
      ['Enter order', 'Credit OK?', '', null],
      ['Credit OK?', 'Pick goods', 'yes', 0.85],
      ['Credit OK?', '(Declined)', 'no', 0.15]
    ]);
    expect(out.notes).toEqual({ 'Credit OK?': 'limit is 30 days' });
    expect(out.colors).toEqual({ Finance: '#4a3aa7' });
  });

  test('quotes let a name hold a comma, a colon or an arrow, and every time unit is read', async ({ page }) => {
    const out = await parse(page, [
      'Ops: "Check a, b: c -> d" {90 s} -> "Ship, then bill"',
      'Ops: "Ship, then bill" {2 hrs, wait 1 week}',
      'Ops: Third {3 days}',
      'Ops: Fourth {wait 45 mins}'
    ].join('\n'));
    expect(out.errors).toEqual([]);
    expect(out.steps.map((s) => s.name)).toEqual(['Check a, b: c -> d', 'Ship, then bill', 'Third', 'Fourth']);
    expect(out.exits).toHaveLength(1);
    expect(out.exits[0].target).toBe('Ship, then bill');
    expect(out.steps.map((s) => [s.touch, s.wait])).toEqual([
      [{ value: 90, unit: 's' }, null],
      [{ value: 2, unit: 'h' }, { value: 1, unit: 'wk' }],
      [{ value: 3, unit: 'd' }, null],
      [null, { value: 45, unit: 'min' }]
    ]);
  });

  test('every error names its line and says what was expected', async ({ page }) => {
    const cases = [
      ['Just some words', 'LINE_NOT_UNDERSTOOD', 1],
      ['Ann:', 'STEP_MISSING', 1],
      ['Ann: Draft {soon}', 'TIME_NOT_UNDERSTOOD', 1],
      ['Ann: Draft {5 min, 6 min}', 'TIME_NOT_UNDERSTOOD', 1],
      ['Ann: Draft {5 parsecs}', 'TIME_NOT_UNDERSTOOD', 1],
      ['Ann: Draft {5 min} extra -> Review\nAnn: Review', 'TIME_NOT_UNDERSTOOD', 1],
      ['Ann: Draft ->', 'EXIT_MISSING', 1],
      ['Ann: Draft -> yes:', 'EXIT_MISSING', 1],
      ['Ann: Draft -> Draft', 'SELF_LOOP', 1],
      ['Ann: Draft -> 120%: Review\nAnn: Review', 'SHARE_OUT_OF_RANGE', 1],
      ['Ann: Draft -> Review', 'STEP_HAS_NO_LANE', 1],
      ['Ann: Draft\nBob: Draft', 'LANE_CONFLICT', 2],
      ['Ann: Draft {5 min}\nAnn: Draft {6 min}', 'TIME_REPEATED', 2],
      ['== ==', 'PHASE_NOT_UNDERSTOOD', 1],
      ['Ann: Draft\n: Ann red', 'COLOR_NOT_UNDERSTOOD', 2],
      ['Ann: Draft\n@ no colon here', 'NOTE_NOT_UNDERSTOOD', 2],
      ['lanes:', 'LANES_NOT_UNDERSTOOD', 1],
      ['arrivals: lots', 'ARRIVALS_NOT_UNDERSTOOD', 1],
      [`Ann: ${'x'.repeat(81)}`, 'NAME_TOO_LONG', 1]
    ];
    for (const [text, code, line] of cases) {
      const out = await parse(page, text);
      expect(out.errors.map((e) => [e.code, e.line]), text).toEqual([[code, line]]);
      expect(out.errors[0].message.length, text).toBeGreaterThan(15);
    }
    const none = await build(page, '// nothing yet');
    expect(none.ok).toBe(false);
    expect(none.errors[0].code).toBe('NO_STEPS');
  });

  test('limits are refused by name, and near-duplicate names are pointed out', async ({ page }) => {
    const many = Array.from({ length: 151 }, (_, i) => `Ann: Step ${i}`).join('\n');
    expect((await parse(page, many)).errors.map((e) => e.code)).toEqual(['TOO_MANY_STEPS']);
    const lanes = Array.from({ length: 13 }, (_, i) => `Lane ${i}: Step ${i}`).join('\n');
    expect((await parse(page, lanes)).errors.map((e) => e.code)).toEqual(['TOO_MANY_LANES']);

    const out = await parse(page, 'Ann: Draft -> review\nAnn: Review\nAnn: review\n@ Nowhere: a note\n: Nobody #123456');
    expect(out.errors).toEqual([]);
    expect(out.warnings.map((w) => w.code).sort()).toEqual(['CASE_VARIANTS', 'UNKNOWN_LANE', 'UNKNOWN_STEP']);
  });

  test('lanes: sets the order whatever was typed first, and a lane it names with no step is flagged', async ({ page }) => {
    const m = await build(page, 'Bob: Review -> (Done)\nBob: (Done)\nAnn: Draft -> Review\nlanes: Ann, Cara, Bob');
    expect(m.graph.lanes.map((l) => l.name)).toEqual(['Ann', 'Cara', 'Bob']);
    expect(m.graph.nodes.map((n) => m.graph.lanes[n.lane].name)).toEqual(['Bob', 'Bob', 'Ann']);
    expect(m.warnings.map((w) => w.code)).toContain('EMPTY_LANE');
  });
});

test.describe('graph and findings', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('times are converted on the working calendar', async ({ page }) => {
    const text = 'Ann: (Start) -> Work\nAnn: Work {1 d, wait 1 wk} -> (Done)\nAnn: (Done)';
    const hours = async (settings) => {
      const m = await build(page, text, settings);
      const work = m.graph.nodes.find((n) => n.name === 'Work');
      return [work.touch, work.wait, m.graph.calendar];
    };
    expect(await hours({})).toEqual([8, 40, { hoursPerDay: 8, daysPerWeek: 5 }]);
    expect(await hours({ hoursPerDay: 24, daysPerWeek: 7 })).toEqual([24, 168, { hoursPerDay: 24, daysPerWeek: 7 }]);
    expect(await hours({ hoursPerDay: 12, daysPerWeek: 6 })).toEqual([12, 72, { hoursPerDay: 12, daysPerWeek: 6 }]);
    // Out of range is clamped, never passed through.
    expect((await hours({ hoursPerDay: 99, daysPerWeek: 0 }))[2]).toEqual({ hoursPerDay: 24, daysPerWeek: 1 });
    const fine = await build(page, 'Ann: (Start) -> Work\nAnn: Work {90 s, wait 30 min} -> (Done)\nAnn: (Done)');
    expect(fine.graph.nodes[1].touch).toBeCloseTo(0.025, 12);
    expect(fine.graph.nodes[1].wait).toBeCloseTo(0.5, 12);
  });

  test('shares: one exit is all of it, blanks share what is left, and anything else is scaled and said', async ({ page }) => {
    const shares = (m, from) => m.graph.links.filter((l) => m.graph.nodes[l.source].name === from).map((l) => l.share);
    const tail = '\nAnn: A\nAnn: B\nAnn: C';

    const one = await build(page, `Ann: Split -> A${tail}`);
    expect(shares(one, 'Split')).toEqual([1]);
    expect(one.warnings.map((w) => w.code)).not.toContain('SHARE_ASSUMED');

    const even = await build(page, `Ann: Split -> A, B, C${tail}`);
    for (const s of shares(even, 'Split')) expect(s).toBeCloseTo(1 / 3, 12);
    const assumed = even.warnings.find((w) => w.code === 'SHARE_ASSUMED');
    expect(assumed.message).toContain('split evenly');
    expect(assumed.message).toContain('parallel');
    expect(assumed.line).toBe(1);

    const rest = await build(page, `Ann: Split -> 50%: A, B, C${tail}`);
    expect(shares(rest, 'Split')).toEqual([0.5, 0.25, 0.25]);
    expect(rest.warnings.find((w) => w.code === 'SHARE_ASSUMED').message).toContain('remaining 50%');

    const short = await build(page, `Ann: Split -> 60%: A, 30%: B${tail}`);
    expect(shares(short, 'Split')[0]).toBeCloseTo(2 / 3, 12);
    expect(shares(short, 'Split')[1]).toBeCloseTo(1 / 3, 12);
    const scaled = short.warnings.find((w) => w.code === 'SHARE_SCALED');
    expect(scaled.message).toContain('add up to 90%');
    expect(scaled.message).toContain('A 66.7%');

    const over = await build(page, `Ann: Split -> 80%: A, 80%: B${tail}`);
    expect(shares(over, 'Split')).toEqual([0.5, 0.5]);
    expect(over.warnings.map((w) => w.code)).toContain('SHARE_SCALED');

    const exact = await build(page, `Ann: Split -> 70%: A, 30%: B${tail}`);
    expect(exact.warnings.filter((w) => w.code.startsWith('SHARE'))).toEqual([]);
  });

  test('rework is the exit that closes a loop, by typing order, or that leads back a phase', async ({ page }) => {
    const rework = (m) => m.graph.links.filter((l) => l.rework).map((l) => `${m.graph.nodes[l.source].name}>${m.graph.nodes[l.target].name}`);
    const loop = await build(page, 'Ann: A -> B\nAnn: B -> C\nAnn: C -> 50%: A, 50%: (End)\nAnn: (End)');
    expect(rework(loop)).toEqual(['C>A']);
    // Typed the other way round, the same loop is closed by a different exit.
    const other = await build(page, 'Ann: C -> 50%: A, 50%: (End)\nAnn: A -> B\nAnn: B -> C\nAnn: (End)');
    expect(rework(other)).toEqual(['B>C']);
    // An exit to a step in an earlier phase is rework even though it closes no loop.
    const phased = await build(page, '== One ==\nAnn: A -> B\nAnn: Side -> (End)\n== Two ==\nAnn: B -> 50%: Side, 50%: (End)\nAnn: (End)');
    expect(rework(phased)).toEqual(['B>Side']);
    expect(loop.warnings.find((w) => w.code === 'REWORK').message).toContain('C to A');

    // An end is not a step work is sent back to. Typed under an early phase and
    // reached from a later one, it moves to the later phase and yield stays 1.
    const ended = await build(page, '== One ==\nAnn: (Start) -> A\nAnn: A -> B\nAnn: (Stopped)\n== Two ==\nAnn: B -> 50%: (Stopped), 50%: (End)\nAnn: (End)');
    expect(rework(ended)).toEqual([]);
    expect(ended.graph.nodes.find((n) => n.name === '(Stopped)').phase).toBe(1);
    expect(ended.result.yield).toBe(1);
    const stopped = ended.layout.steps.find((x) => x.name === '(Stopped)');
    const band = ended.layout.phases.find((x) => x.name === 'Two');
    expect(stopped.x0).toBeGreaterThanOrEqual(band.x0);

    // Forward exits never loop, whatever is typed.
    for (const m of [loop, other, phased, ended]) {
      const order = [];
      const fwd = m.graph.links.filter((l) => !l.rework);
      const indeg = m.graph.nodes.map((n) => fwd.filter((l) => l.target === n.index).length);
      const queue = m.graph.nodes.filter((n) => indeg[n.index] === 0).map((n) => n.index);
      while (queue.length) {
        const n = queue.shift();
        order.push(n);
        for (const l of fwd.filter((x) => x.source === n)) if (--indeg[l.target] === 0) queue.push(l.target);
      }
      expect(order).toHaveLength(m.graph.nodes.length);
    }
  });

  test('each finding fires on a map built to have it, and a clean map has none', async ({ page }) => {
    const cases = [
      ['NO_START', 'Ann: A -> B\nAnn: B -> A'],
      ['NO_END', 'Ann: A -> B\nAnn: B -> A'],
      ['DEAD_END', 'Ann: (Start) -> A\nAnn: A'],
      ['UNREACHABLE', 'Ann: (Start) -> (End)\nAnn: (End)\nAnn: X -> Y\nAnn: Y -> X'],
      ['DECISION_ONE_EXIT', 'Ann: (Start) -> OK?\nAnn: OK? -> (End)\nAnn: (End)'],
      ['DUPLICATE_LABEL', 'Ann: (Start) -> OK?\nAnn: OK? -> yes 50%: (A), yes 50%: (B)\nAnn: (A)\nAnn: (B)'],
      ['DUPLICATE_EXIT', 'Ann: (Start) -> (End)\nAnn: (Start) -> (End)\nAnn: (End)'],
      ['EMPTY_LANE', 'lanes: Ann, Bob\nAnn: (Start) -> (End)\nAnn: (End)'],
      ['TIME_MISSING', 'Ann: (Start) -> A\nAnn: A {5 min} -> B\nAnn: B -> (End)\nAnn: (End)'],
      ['REWORK', 'Ann: (Start) -> A\nAnn: A -> OK?\nAnn: OK? -> yes 50%: (End), no 50%: A\nAnn: (End)']
    ];
    for (const [code, text] of cases) {
      const m = await build(page, text);
      expect(m.ok, code).toBe(true);
      expect(m.warnings.map((w) => w.code), code).toContain(code);
    }
    const clean = await build(page, CHAIN);
    expect(clean.warnings).toEqual([]);
    // A terminator with nothing leaving it is an end, not a dead end.
    expect(clean.graph.ends).toEqual([3]);
    expect(clean.graph.starts).toEqual([0]);
  });

  test('handoffs are counted lane to lane, against a hand count', async ({ page }) => {
    const m = await build(page, [
      'lanes: Ann, Bob, Cy',
      'Ann: (Start) -> A',
      'Ann: A -> B',
      'Bob: B -> OK?',
      'Cy: OK? -> yes 50%: C, no 50%: A',
      'Bob: C -> (End)',
      'Bob: (End)'
    ].join('\n'));
    // A>B Ann to Bob, B>OK? Bob to Cy, OK?>C Cy to Bob, OK?>A Cy to Ann. Start>A and C>End stay in lane.
    expect(m.graph.counts.handoffs).toBe(4);
    expect(m.graph.counts.handoffMatrix).toEqual([[0, 1, 0], [0, 0, 1], [1, 1, 0]]);
    expect(m.graph.lanes.map((l) => [l.name, l.steps, l.handoffsOut, l.handoffsIn])).toEqual([['Ann', 2, 1, 1], ['Bob', 3, 1, 2], ['Cy', 1, 2, 1]]);
    expect(m.graph.counts.rework).toBe(1);
    expect(m.graph.counts.decisions).toBe(1);
  });
});

test.describe('the solve', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('a straight chain is a sum, and with no times there is no lead time to report', async ({ page }) => {
    const m = await build(page, CHAIN);
    expect(m.result.ok).toBe(true);
    expect(m.result.passes).toEqual([1, 1, 1, 1]);
    expect(m.result.touch).toBeCloseTo(0.75, 12);
    expect(m.result.wait).toBeCloseTo(2, 12);
    expect(m.result.lead).toBeCloseTo(2.75, 12);
    expect(m.result.efficiency).toBeCloseTo(0.75 / 2.75, 12);
    expect(m.result.yield).toBe(1);
    expect(m.result.reworkCost).toBe(0);
    expect(m.result.handoffsPerUnit).toBeCloseTo(1, 12);
    expect(m.result.stepsPerUnit).toBeCloseTo(3, 12);
    expect(m.result.ends).toEqual([{ index: 3, share: 1 }]);

    const bare = await build(page, 'Ann: (Start) -> Draft\nAnn: Draft -> (Done)\nAnn: (Done)');
    expect(bare.result.lead).toBe(0);
    expect(bare.result.efficiency).toBeNull();
    const sentence = await page.evaluate((t) => { const S = window.ProcessFlowMapper; return S.summarySentence(S.buildModel(t, {})); },
      'Ann: (Start) -> Draft\nAnn: Draft -> (Done)\nAnn: (Done)');
    expect(sentence).toContain('No times entered');
  });

  test('one loop with rework share r is passed 1 / (1 - r) times, for a sweep of r', async ({ page }) => {
    for (const r of [0, 0.05, 0.2, 0.5, 0.9, 0.99]) {
      const pct = r * 100;
      const m = await build(page, [
        'Ann: (Start) -> Work',
        'Ann: Work {1 h} -> Check?',
        `Bob: Check? {30 min, wait 2 h} -> pass ${100 - pct}%: (Done), again ${pct}%: Work`,
        'Bob: (Done)'
      ].join('\n'));
      const p = passesOf(m);
      const k = 1 / (1 - r);
      expect(p.Work, `r=${r}`).toBeCloseTo(k, 9);
      expect(p['Check?'], `r=${r}`).toBeCloseTo(k, 9);
      expect(p['(Done)'], `r=${r}`).toBeCloseTo(1, 9);
      expect(m.result.lead, `r=${r}`).toBeCloseTo(3.5 * k, 8);
      expect(m.result.yield, `r=${r}`).toBeCloseTo(1 - r, 9);
      // Rework cost is everything beyond one clean pass.
      expect(m.result.reworkCost, `r=${r}`).toBeCloseTo(3.5 * (k - 1), 8);
      expect(m.result.leadNoRework, `r=${r}`).toBeCloseTo(3.5, 9);
    }
  });

  test('loops in series multiply nothing, a loop inside a loop multiplies', async ({ page }) => {
    // Two separate loops: each keeps its own factor.
    const series = await build(page, [
      'Ann: (Start) -> A',
      'Ann: A {1 h} -> A ok?',
      'Ann: A ok? -> 80%: B, 20%: A',
      'Ann: B {1 h} -> B ok?',
      'Ann: B ok? -> 50%: (Done), 50%: B',
      'Ann: (Done)'
    ].join('\n'));
    const s = passesOf(series);
    expect(s.A).toBeCloseTo(1.25, 9);
    expect(s.B).toBeCloseTo(2, 9);
    expect(series.result.yield).toBeCloseTo(0.4, 9);

    // The inner check sends 25% back to A, the outer one 30% back to A as well.
    // A = 1 + 0.25 A + 0.3 (0.75 A), so A = 1 / (0.75 x 0.7).
    const nested = await build(page, [
      'Ann: (Start) -> A',
      'Ann: A {1 h} -> Inner?',
      'Ann: Inner? -> 75%: B, 25%: A',
      'Ann: B {1 h} -> Outer?',
      'Ann: Outer? -> 70%: (Done), 30%: A',
      'Ann: (Done)'
    ].join('\n'));
    const n = passesOf(nested);
    expect(n.A).toBeCloseTo(1 / (0.75 * 0.7), 9);
    expect(n['Inner?']).toBeCloseTo(1 / (0.75 * 0.7), 9);
    expect(n.B).toBeCloseTo(1 / 0.7, 9);
    expect(nested.result.yield).toBeCloseTo(0.75 * 0.7, 9);
    expect(nested.result.lead).toBeCloseTo(1 / (0.75 * 0.7) + 1 / 0.7, 9);
  });

  test('the worked examples land on figures done by hand', async ({ page }) => {
    const purchase = await build(page, await preset(page, 'purchase'));
    const p = passesOf(purchase);
    expect(p['Fill in request']).toBeCloseTo(1 / 0.85, 9);
    expect(p['(Request declined)']).toBeCloseTo(0.05 / 0.85, 9);
    expect(p['Budget available?']).toBeCloseTo(0.8 / 0.85, 9);
    expect(p['(No budget)']).toBeCloseTo(0.8 / 0.85 * 0.1, 9);
    expect(p['Raise purchase order']).toBeCloseTo(0.8 / 0.85 * 0.9 / 0.92, 9);
    expect(p['(Order placed)']).toBeCloseTo(0.8 / 0.85 * 0.9, 9);
    expect(purchase.result.yield).toBeCloseTo(0.05 + 0.8 * (0.1 + 0.9 * 0.92), 9);

    const lab = await build(page, await preset(page, 'lab'));
    // The analysis loop is 60 min of work and 7 h of waiting at 1.25 passes; the
    // report loop is 20 min and 1.5 h at 1 / 0.95; logging is 5 min after a 20 min wait.
    expect(lab.result.touch).toBeCloseTo((5 + 1.25 * 60 + 20 / 0.95) / 60, 9);
    expect(lab.result.wait).toBeCloseTo(20 / 60 + 1.25 * 7 + 1.5 / 0.95, 9);
    expect(lab.result.yield).toBeCloseTo(0.8 * 0.95, 9);
    expect(lab.result.reworkCost).toBeCloseTo(0.25 * 8 + (1 / 0.95 - 1) * (20 / 60 + 1.5), 9);
    expect(passesOf(lab)['Prepare sample']).toBeCloseTo(1.25, 9);

    const change = await build(page, await preset(page, 'change'));
    expect(passesOf(change)['Draft change']).toBeCloseTo(1 / (0.75 * 0.7), 9);
    expect(passesOf(change)['Review change']).toBeCloseTo(1 / 0.7, 9);
    expect(passesOf(change)['Assess impact']).toBeCloseTo(1, 9);

    const hiring = await build(page, await preset(page, 'hiring'));
    const ends = Object.fromEntries(hiring.result.ends.map((e) => [hiring.graph.nodes[e.index].name, e.share]));
    expect(ends['(Declined at application)']).toBeCloseTo(0.75, 12);
    expect(ends['(Declined after phone screen)']).toBeCloseTo(0.25 * 0.5, 12);
    expect(ends['(Declined after interview)']).toBeCloseTo(0.125 * 0.6 + 0.125 * 0.4 * 0.5, 12);
    expect(ends['(Hired)']).toBeCloseTo(0.25 * 0.5 * 0.4 * 0.5 * 0.8, 12);
    expect(ends['(Offer turned down)']).toBeCloseTo(0.25 * 0.5 * 0.4 * 0.5 * 0.2, 12);
    expect(hiring.result.yield).toBe(1);
    // 60 applications a week, 5% reach a three hour panel.
    expect(hiring.totals.lanes.find((l) => l.name === 'Interview panel').loadPerWeek).toBeCloseTo(60 * 0.05 * 3, 9);

    const order = await build(page, await preset(page, 'order'));
    const loop = 1 / 0.97;
    expect(order.result.touch).toBeCloseTo((6 + 2 + 0.1 * 5 + loop * 37 + 4 + 8) / 60, 9);
    expect(order.result.wait).toBeCloseTo(0.5 + 10 / 60 + 0.1 * 24 + loop * (1 + 20 / 60) + 8 + 2, 9);
    const step = (name) => order.result.perStep[order.graph.nodes.findIndex((n) => n.name === name)];
    // The longest job is not where the time goes.
    expect(step('Pick items').touch).toBeGreaterThan(step('Book carrier').touch);
    expect(step('Book carrier').share).toBeGreaterThan(0.5);
    expect(step('Wait for stock').lead).toBeGreaterThan(step('Pick items').lead);
    // 120 a day on a 5 day week.
    expect(order.totals.arrivalsPerWeek).toBeCloseTo(600, 9);

    const incident = await build(page, await preset(page, 'incident'));
    expect(incident.warnings.map((w) => w.code)).toContain('DEAD_END');
    // Fixed? = 1 + 0.1 Fixed? + 0.08 (0.85 Fixed?), and 5% of that is escalated.
    const fixed = 1 / (1 - 0.1 - 0.85 * 0.08);
    const stuck = incident.result.ends.find((e) => incident.graph.nodes[e.index].name === 'Escalate to vendor');
    expect(stuck.share).toBeCloseTo(0.05 * fixed, 9);
    expect(passesOf(incident)['(Incident closed)']).toBeCloseTo(0.85 * fixed * 0.92, 9);
  });

  test('capacity: a lane carries what its hours allow, the tightest lane limits the process, and busy lanes are said', async ({ page }) => {
    const text = [
      'arrivals: 30 / wk',
      'staff: Ann 1, Bob 2 @ 50%',
      'Ann: (Start) -> Draft',
      'Ann: Draft {1 h} -> Review?',
      'Bob: Review? {30 min} -> ok 80%: (Done), redo 20%: Draft',
      'Bob: (Done)'
    ].join('\n');
    const m = await build(page, text);
    const [ann, bob] = m.totals.lanes;
    // Draft and Review are each passed 1.25 times.
    expect(ann.touch).toBeCloseTo(1.25, 9);
    expect(bob.touch).toBeCloseTo(0.625, 9);
    expect(ann.available).toBeCloseTo(40, 9);
    expect(bob.available).toBeCloseTo(2 * 0.5 * 40, 9);
    expect(ann.canCarry).toBeCloseTo(32, 9);
    expect(bob.canCarry).toBeCloseTo(64, 9);
    expect(ann.busy).toBeCloseTo(30 * 1.25 / 40, 9);
    expect(bob.busy).toBeCloseTo(30 * 0.625 / 40, 9);
    expect(m.totals.capacity).toMatchObject({ lane: 0, unstaffed: [] });
    expect(m.totals.capacity.perWeek).toBeCloseTo(32, 9);
    // 93.75% busy is flagged, and says why it matters.
    const busy = m.warnings.find((w) => w.code === 'BUSY');
    expect(busy.message).toContain('Ann is 94% busy');
    expect(busy.line).toBe(2);
    expect(m.warnings.map((w) => w.code)).not.toContain('OVERLOADED');

    // More work than hours: said plainly, and the lead time is called too low.
    const over = await build(page, text.replace('30 / wk', '40 / wk'));
    const loaded = over.warnings.find((w) => w.code === 'OVERLOADED');
    expect(loaded.message).toContain('Ann cannot keep up: 50 h of work arrives each week and 40 h is available');
    expect(loaded.message).toContain('lead time shown is too low');
    expect(over.totals.lanes[0].busy).toBeCloseTo(1.25, 9);
    // The times themselves do not move: waits are inputs.
    expect(over.result.lead).toBe(m.result.lead);

    // The calendar scales the hours a person has.
    const shifts = await build(page, text, { hoursPerDay: 16, daysPerWeek: 6 });
    expect(shifts.totals.lanes[0].available).toBeCloseTo(96, 9);
    expect(shifts.totals.capacity.perWeek).toBeCloseTo(96 / 1.25, 9);

    // Staff with no arrivals still gives the limit, with no busy figure.
    const quiet = await build(page, text.replace('arrivals: 30 / wk\n', ''));
    expect(quiet.totals.capacity.perWeek).toBeCloseTo(32, 9);
    expect(quiet.totals.capacity.busy).toBeNull();
    expect(quiet.totals.lanes[0].loadPerWeek).toBeNull();
    // Staff for only some lanes is used, and said to be partial.
    const partial = await build(page, text.replace('staff: Ann 1, Bob 2 @ 50%', 'staff: Bob 2 @ 50%'));
    expect(partial.totals.capacity).toMatchObject({ lane: 1, unstaffed: ['Ann'] });
    expect(partial.warnings.find((w) => w.code === 'STAFF_PARTIAL').message).toContain('No staff is given for Ann');
    // No staff line, no capacity.
    const none = await build(page, text.replace('staff: Ann 1, Bob 2 @ 50%\n', ''));
    expect(none.totals.capacity).toBeNull();

    const purchase = await build(page, await preset(page, 'purchase'));
    // One manager with a tenth of a 40 hour week, at 5 minutes a pass and 1 / 0.85 passes.
    expect(purchase.totals.capacity.perWeek).toBeCloseTo(4 / (5 / 60 / 0.85), 9);
    expect(purchase.graph.lanes[purchase.totals.capacity.lane].name).toBe('Manager');
    const orders = await build(page, await preset(page, 'order'));
    expect(orders.graph.lanes[orders.totals.capacity.lane].name).toBe('Warehouse');
    expect(orders.warnings.find((w) => w.code === 'BUSY').message).toContain('Warehouse is 92% busy');
  });

  test('a staff line is read, checked, and refused when it says nothing usable', async ({ page }) => {
    const out = await parse(page, 'staff: Ann 2, Bob 1.5 @ 25%, The night shift 3\nAnn: A\nBob: B\nThe night shift: C');
    expect(out.errors).toEqual([]);
    expect(out.staff).toEqual({ Ann: { people: 2, share: 1, line: 1 }, Bob: { people: 1.5, share: 0.25, line: 1 }, 'The night shift': { people: 3, share: 1, line: 1 } });
    for (const bad of ['staff:', 'staff: Ann', 'staff: Ann two', 'staff: Ann 0', 'staff: Ann 2 @ 0%', 'staff: Ann 2 @ 150%']) {
      const r = await parse(page, `${bad}\nAnn: A`);
      expect(r.errors.map((e) => [e.code, e.line]), bad).toEqual([['STAFF_NOT_UNDERSTOOD', 1]]);
    }
    const stray = await parse(page, 'staff: Nobody 2\nAnn: A');
    expect(stray.warnings.map((w) => [w.code, w.line])).toEqual([['UNKNOWN_LANE', 1]]);
  });

  test('headline figures compare with a baseline, and only when it is the same process', async ({ page }) => {
    const out = await page.evaluate(() => {
      const S = window.ProcessFlowMapper;
      const base = 'staff: Ann 1\nAnn: (Start) -> Work\nAnn: Work {1 h, wait 2 d} -> ok 80%: (Done), redo 20%: Work2\nAnn: Work2 {10 min} -> Work\nAnn: (Done)';
      const a = S.buildModel(base, {});
      const quicker = S.buildModel(base.replace('wait 2 d', 'wait 1 d').replace('ok 80%', 'ok 90%').replace('redo 20%', 'redo 10%'), {});
      const other = S.buildModel('Bob: (Begin) -> Pack {5 min}\nBob: Pack -> (Shipped)\nBob: (Shipped)', {});
      const broken = S.buildModel('Ann: A -> B', {});
      return {
        same: S.headlineChanges(a, a),
        moved: S.headlineChanges(quicker, a),
        other: S.headlineChanges(other, a),
        broken: S.headlineChanges(a, broken),
        none: S.headlineChanges(a, null),
        before: S.headline(a).map((h) => [h.key, h.value]),
        after: S.headline(quicker).map((h) => [h.key, h.value])
      };
    });
    expect(out.same).toEqual([]);
    expect(out.other).toEqual([]);
    expect(out.broken).toEqual([]);
    expect(out.none).toEqual([]);
    const before = Object.fromEntries(out.before);
    const moved = Object.fromEntries(out.moved.map((c) => [c.key, c.text]));
    expect(moved.lead).toBe(`down from ${before.lead}`);
    expect(moved.yield).toBe(`up from ${before.yield}`);
    expect(moved.touch).toBe(`down from ${before.touch}`);
    expect(moved.capacity).toBe(`up from ${before.capacity}`);
    // A figure that reads the same is not listed as changed.
    expect(Object.keys(moved)).not.toContain('handoffs');
  });

  test('moving a step, reordering lanes and pasting spreadsheet rows all rewrite the text and nothing else', async ({ page }) => {
    const out = await page.evaluate(() => {
      const P = window.ProcessFlowMapper.parser;
      const text = [
        '// header', 'lanes: Ann, Bob', '== One ==', '  Ann: Draft {5 min} -> yes: Review, no: "Fix, then retry"',
        'Bob: Review -> (Done)', 'Ann: "Fix, then retry" {1 h} -> Draft', 'Ann: Draft -> Extra', 'Bob: Extra', 'Bob: (Done)', '@ Draft: a note', ': Ann #112233'
      ].join('\n');
      const pasted = ['Lane\tStep\tTouch\tWait\tNext', 'Ann\tDraft, v2\t5 min\t2 h\tyes 80%: Review; no 20%: Fix', 'Bob\tReview\t\t1 d\t(Done)', 'Ann\tFix\t10 min\t\tDraft, v2', 'Bob\t(Done)'].join('\n');
      return {
        moved: P.setStepLane(text, 'Draft', 'Cy').split('\n'),
        quoted: P.setStepLane(text, 'Fix, then retry', 'Bob').split('\n')[5],
        untouched: P.setStepLane(text, 'Nobody', 'Cy') === text,
        order: P.setLaneOrder(text, ['Bob', 'Ann']).split('\n').slice(0, 3),
        added: P.setLaneOrder('Ann: A\nBob: B', ['Bob', 'Ann']),
        twice: P.setLaneOrder('lanes: A, B\nA: x\nlanes: B, A\nB: y', ['B', 'A']),
        table: P.tableToFlow(pasted),
        parsed: P.parseFlow(P.tableToFlow(pasted).text),
        notTable: [P.tableToFlow('Ann: Draft -> Review'), P.tableToFlow('one\ttwo'), P.tableToFlow('a\tb\nno tabs here')]
      };
    });
    // Both lines that declare Draft move, with indentation, times, exits and every other line kept.
    expect(out.moved[3]).toBe('  Cy: Draft {5 min} -> yes: Review, no: "Fix, then retry"');
    expect(out.moved[6]).toBe('Cy: Draft -> Extra');
    expect(out.moved[4]).toBe('Bob: Review -> (Done)');
    expect(out.moved[9]).toBe('@ Draft: a note');
    expect(out.moved).toHaveLength(11);
    expect(out.quoted).toBe('Bob: "Fix, then retry" {1 h} -> Draft');
    expect(out.untouched).toBe(true);
    expect(out.order).toEqual(['// header', 'lanes: Bob, Ann', '== One ==']);
    expect(out.added).toBe('lanes: Bob, Ann\nAnn: A\nBob: B');
    expect(out.twice).toBe('lanes: B, A\nA: x\nB: y');

    expect(out.table.rows).toBe(4);
    expect(out.table.text).toBe([
      'Ann: "Draft, v2" {5 min, wait 2 h} -> yes 80%: Review, no 20%: Fix',
      'Bob: Review {wait 1 d} -> (Done)',
      'Ann: Fix {10 min} -> "Draft, v2"',
      'Bob: (Done)',
      ''
    ].join('\n'));
    expect(out.parsed.errors).toEqual([]);
    expect(out.parsed.steps.map((x) => x.name)).toEqual(['Draft, v2', 'Review', 'Fix', '(Done)']);
    expect(out.parsed.exits).toHaveLength(4);
    expect(out.notTable).toEqual([null, null, null]);
  });

  test('a seeded random walk written here agrees with the solve on every example and on random maps', async ({ page }) => {
    test.setTimeout(120000);
    const result = await page.evaluate(() => {
      const S = window.ProcessFlowMapper;
      let seed = 20261001;
      const rnd = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const maps = S.PRESETS.map((p) => ({ name: p.id, text: p.text }));
      for (let g = 0; g < 12; g++) {
        const n = 4 + Math.floor(rnd() * 8);
        const lines = ['Lane 0: (Start) -> S0'];
        for (let i = 0; i < n; i++) {
          const exits = [i + 1 < n ? `S${i + 1}` : '(End)'];
          if (i + 2 < n && rnd() < 0.4) exits.push(`S${i + 2 + Math.floor(rnd() * (n - i - 2))}`);
          if (i > 0 && rnd() < 0.45) exits.push(`S${Math.floor(rnd() * i)}`);
          lines.push(`Lane ${Math.floor(rnd() * 3)}: S${i} {${1 + Math.floor(rnd() * 50)} min, wait ${Math.floor(rnd() * 6)} h} -> ${exits.join(', ')}`);
        }
        lines.push('Lane 2: (End)');
        maps.push({ name: `random${g}`, text: lines.join('\n') });
      }

      // The independent check: walk units through the map one exit at a time.
      const UNITS = 60000;
      const problems = [];
      for (const map of maps) {
        const m = S.buildModel(map.text, {});
        if (!m.ok || !m.result.ok) { problems.push(`${map.name}: did not solve`); continue; }
        const { nodes, links, starts } = m.graph;
        const out = nodes.map((node) => node.outLinks.map((li) => links[li]));
        const visits = new Array(nodes.length).fill(0);
        let lead = 0;
        let clean = 0;
        for (let u = 0; u < UNITS; u++) {
          let at = starts[Math.floor(rnd() * starts.length)];
          let reworked = false;
          for (let hops = 0; hops < 100000; hops++) {
            visits[at] += 1;
            lead += nodes[at].touch + nodes[at].wait;
            if (!out[at].length) break;
            let roll = rnd();
            let taken = out[at][out[at].length - 1];
            for (const l of out[at]) { if (roll < l.share) { taken = l; break; } roll -= l.share; }
            if (taken.rework) reworked = true;
            at = taken.target;
          }
          if (!reworked) clean += 1;
        }
        nodes.forEach((node, i) => {
          const sim = visits[i] / UNITS;
          const exact = m.result.passes[i];
          if (Math.abs(sim - exact) > 0.02 * exact + 0.01) problems.push(`${map.name}: ${node.name} passes ${exact.toFixed(4)} but the walk gave ${sim.toFixed(4)}`);
        });
        const simLead = lead / UNITS;
        if (Math.abs(simLead - m.result.lead) > 0.02 * m.result.lead + 1e-9) problems.push(`${map.name}: lead ${m.result.lead.toFixed(3)} but the walk gave ${simLead.toFixed(3)}`);
        if (Math.abs(clean / UNITS - m.result.yield) > 0.01) problems.push(`${map.name}: yield ${m.result.yield.toFixed(4)} but the walk gave ${(clean / UNITS).toFixed(4)}`);
      }
      return { problems, maps: maps.length };
    });
    expect(result.maps).toBe(18);
    expect(result.problems).toEqual([]);
  });

  test('identities hold on seeded random maps: conservation, end shares, yield and rework cost', async ({ page }) => {
    const result = await page.evaluate(() => {
      const S = window.ProcessFlowMapper;
      let seed = 99;
      const rnd = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const problems = [];
      let solved = 0;
      let withRework = 0;
      for (let g = 0; g < 80; g++) {
        const n = 3 + Math.floor(rnd() * 14);
        const lines = ['L0: (Start) -> S0'];
        for (let i = 0; i < n; i++) {
          const exits = [i + 1 < n ? `S${i + 1}` : '(End)'];
          for (let j = i + 2; j < n; j++) if (rnd() < 0.15) exits.push(`S${j}`);
          for (let j = 0; j < i; j++) if (g % 4 && rnd() < 0.12) exits.push(`S${j}`);
          if (rnd() < 0.1) exits.push('(Dropped)');
          lines.push(`L${Math.floor(rnd() * 4)}: S${i} {${Math.floor(rnd() * 90)} min, wait ${(rnd() * 9).toFixed(1)} h} -> ${exits.join(', ')}`);
        }
        lines.push('L1: (End)', 'L1: (Dropped)');
        const m = S.buildModel(lines.join('\n'), {});
        const fail = (msg) => problems.push(`random${g}: ${msg}`);
        if (!m.ok) { fail('did not build'); continue; }
        if (!m.result.ok) { fail(`withheld ${m.result.code}`); continue; }
        solved += 1;
        const { nodes, links, starts } = m.graph;
        const r = m.result;
        const EPS = 1e-9;
        if (links.some((l) => l.rework)) withRework += 1;

        const endTotal = r.ends.reduce((s, e) => s + e.share, 0);
        if (Math.abs(endTotal - 1) > EPS) fail(`end shares sum to ${endTotal}`);
        nodes.forEach((node, i) => {
          const entering = (starts.includes(i) ? 1 / starts.length : 0)
            + node.inLinks.reduce((s, li) => s + r.passes[links[li].source] * links[li].share, 0);
          if (Math.abs(entering - r.passes[i]) > 1e-7 * Math.max(1, r.passes[i])) fail(`${node.name} passes ${r.passes[i]} but ${entering} enters it`);
          if (r.passes[i] < -EPS) fail(`${node.name} has negative passes`);
          if (node.reachable && !starts.includes(i) && r.passes[i] <= 0) fail(`${node.name} is reachable but never passed`);
          const leaving = node.outLinks.reduce((s, li) => s + links[li].share, 0);
          if (node.outLinks.length && Math.abs(leaving - 1) > EPS) fail(`${node.name} exits sum to ${leaving}`);
        });
        if (r.yield < -EPS || r.yield > 1 + EPS) fail(`yield ${r.yield}`);
        if (!links.some((l) => l.rework) && Math.abs(r.yield - 1) > EPS) fail('no rework but yield is not 1');
        if (links.some((l) => l.rework) && r.yield > 1 - 1e-6) fail('rework present but yield is 1');
        if (r.reworkCost < 0) fail('rework cost is negative');
        if (Math.abs(r.lead - r.touch - r.wait) > 1e-7 * Math.max(1, r.lead)) fail('lead is not touch plus wait');
        if (Math.abs(r.lead - r.leadNoRework - r.reworkCost) > 1e-7 * Math.max(1, r.lead)) fail('rework cost does not close');
        const shareTotal = r.perStep.reduce((s, p) => s + p.share, 0);
        if (r.lead > 0 && Math.abs(shareTotal - 1) > 1e-7) fail(`lead shares sum to ${shareTotal}`);
        const laneTotal = m.totals.lanes.reduce((s, l) => s + l.lead, 0);
        if (Math.abs(laneTotal - r.lead) > 1e-7 * Math.max(1, r.lead)) fail('lanes do not add up to the lead time');
        const phaseTotal = m.totals.phases.reduce((s, l) => s + l.lead, 0);
        if (Math.abs(phaseTotal - r.lead) > 1e-7 * Math.max(1, r.lead)) fail('phases do not add up to the lead time');
        if (JSON.stringify(S.buildModel(lines.join('\n'), {}).result) !== JSON.stringify(r)) fail('not deterministic');
      }
      return { problems, solved, withRework };
    });
    expect(result.solved).toBeGreaterThan(70);
    expect(result.withRework).toBeGreaterThan(30);
    expect(result.problems).toEqual([]);
  });

  test('no figure is given for work that can never finish, and the map is still drawn', async ({ page }) => {
    const trap = await build(page, 'Ann: (Start) -> A\nAnn: A {1 h} -> 50%: (End), 50%: B\nAnn: B -> C\nAnn: C -> B\nAnn: (End)');
    expect(trap.ok).toBe(true);
    expect(trap.result.ok).toBe(false);
    expect(trap.result.code).toBe('NEVER_ENDS');
    expect(trap.totals).toBeNull();
    expect(trap.layout.steps).toHaveLength(5);
    const why = trap.warnings.find((w) => w.code === 'WITHHELD_NEVER_ENDS').message;
    expect(why).toContain('"B"');
    expect(why).toContain('"C"');

    const noStart = await build(page, 'Ann: A -> B\nAnn: B -> A');
    expect(noStart.result).toMatchObject({ ok: false, code: 'NO_START' });
    const noEnd = await build(page, 'Ann: (Start) -> A\nAnn: A -> B\nAnn: B -> A');
    expect(noEnd.result).toMatchObject({ ok: false, code: 'NO_END' });

    // A closed loop that no start leads to carries no work and spoils nothing.
    const aside = await build(page, `${CHAIN}\nAnn: X -> Y\nAnn: Y -> X`);
    expect(aside.result.ok).toBe(true);
    expect(aside.result.lead).toBeCloseTo(2.75, 12);
    expect(passesOf(aside).X).toBe(0);
    // A loop that only almost never ends still gives a (large) answer.
    const slow = await build(page, 'Ann: (Start) -> A\nAnn: A {1 h} -> 99.9%: A2, 0.1%: (End)\nAnn: A2 -> A\nAnn: (End)');
    expect(slow.result.ok).toBe(true);
    expect(passesOf(slow).A).toBeCloseTo(1000, 6);
  });

  test('solveLinear solves a hand-checked system and reports a singular one', async ({ page }) => {
    const out = await page.evaluate(() => {
      const { solveLinear } = window.ProcessFlowMapper.solver;
      return [solveLinear([[2, 1], [1, 3]], [3, 5]), solveLinear([[0, 2], [3, 1]], [4, 5]), solveLinear([[1, 2], [2, 4]], [1, 2])];
    });
    expect(out[0][0]).toBeCloseTo(0.8, 12);
    expect(out[0][1]).toBeCloseTo(1.4, 12);
    // A zero on the diagonal needs the pivot.
    expect(out[1][0]).toBeCloseTo(1, 12);
    expect(out[1][1]).toBeCloseTo(2, 12);
    expect(out[2]).toBeNull();
  });

  test('durations and percentages read the way a person would write them', async ({ page }) => {
    const out = await page.evaluate(() => {
      const { formatDuration: d, formatPercent: p } = window.ProcessFlowMapper;
      const office = { hoursPerDay: 8, daysPerWeek: 5 };
      const plant = { hoursPerDay: 24, daysPerWeek: 7 };
      return [
        d(0, office), d(0.005, office), d(0.5, office), d(3, office), d(12, office), d(12, plant), d(400, office),
        d(12, office, 'h'), d(12, office, 'min'), d(40, office, 'wk'),
        p(0.5), p(0.034), p(0.0004), p(0), p(1)
      ];
    });
    expect(out).toEqual(['0', '18 s', '30 min', '3 h', '1.5 d', '12 h', '10 wk', '12 h', '720 min', '1 wk', '50%', '3.4%', '<0.1%', '0%', '100%']);
  });
});

test.describe('layout and routing', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('columns follow the order of work, phases take runs of columns, and a lane grows to hold two steps', async ({ page }) => {
    const m = await build(page, await preset(page, 'purchase'));
    const at = Object.fromEntries(m.layout.steps.map((x) => [x.name, [x.col, x.row]]));
    expect(at).toEqual({
      '(Need identified)': [0, 0], 'Fill in request': [1, 0], 'Approve request?': [2, 1], '(Request declined)': [3, 1],
      'Budget available?': [4, 2], '(No budget)': [5, 2], 'Raise purchase order': [6, 3], 'Order correct?': [7, 3],
      'Send to supplier': [8, 3], '(Order placed)': [9, 3]
    });
    expect(m.layout.phases.map((p) => p.name)).toEqual(['Request', 'Funding', 'Order']);
    expect(m.layout.phases[0].x1).toBeCloseTo(m.layout.phases[1].x0, 9);
    expect(m.layout.phases[1].x1).toBeCloseTo(m.layout.phases[2].x0, 9);

    // Two steps of one lane in one column stack, and that lane alone gets the second row.
    const hiring = await build(page, await preset(page, 'hiring'));
    const declined = hiring.layout.steps.find((x) => x.name === '(Declined at application)');
    const phone = hiring.layout.steps.find((x) => x.name === 'Phone screen');
    expect(declined.col).toBe(phone.col);
    expect(phone.row).toBe(declined.row + 1);
    expect(hiring.layout.rows).toBe(5);
  });

  test('assignTracks keeps overlapping runs apart and lets separate ones share', async ({ page }) => {
    const out = await page.evaluate(() => {
      const { assignTracks } = window.ProcessFlowMapper.router;
      return [assignTracks([[0, 4], [5, 9], [2, 6]]), assignTracks([[0, 2], [2, 4]]), assignTracks([])];
    });
    expect(out[0]).toEqual({ track: [0, 0, 1], count: 2 });
    // Touching ends count as overlapping: both would turn at the same point.
    expect(out[1]).toEqual({ track: [0, 1], count: 2 });
    expect(out[2]).toEqual({ track: [], count: 0 });
  });

  test('two connectors that swap rows between neighbouring columns do not lie on each other', async ({ page }) => {
    // A goes down to D while B goes up to C: neither order of two direct tracks works.
    const m = await build(page, 'Top: (S1) -> A\nBot: (S2) -> B\nTop: A -> D\nBot: B -> C\nTop: C\nBot: D');
    const kinds = m.layout.connectors.filter((c) => c.points.length > 2).map((c) => c.kind).sort();
    expect(kinds).toEqual(['direct', 'general']);
  });

  test('invariants hold on the examples and on seeded random maps', async ({ page }) => {
    test.setTimeout(120000);
    const result = await page.evaluate(() => {
      const S = window.ProcessFlowMapper;
      let seed = 4711;
      const rnd = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const maps = S.PRESETS.map((p) => ({ name: p.id, text: p.text }));
      for (let g = 0; g < 70; g++) {
        const n = 3 + Math.floor(rnd() * 16);
        const lanes = 1 + Math.floor(rnd() * 5);
        const lines = [];
        const phased = g % 3 === 0;
        const names = Array.from({ length: n }, (_, i) => `S${i}${rnd() < 0.2 ? '?' : ''}`);
        for (let i = 0; i < n; i++) {
          if (phased && i % 4 === 0) lines.push(`== Phase ${i / 4} ==`);
          const exits = [];
          for (let j = 0; j < n; j++) {
            if (j === i) continue;
            const chance = j === i + 1 ? 0.8 : (j > i ? 0.12 : 0.08);
            if (rnd() >= chance) continue;
            // Some exits carry a label, some a share, some both, some neither.
            const prefix = [rnd() < 0.5 ? 'way' : '', rnd() < 0.5 ? '30%' : ''].filter(Boolean).join(' ');
            exits.push(prefix ? `${prefix}: ${names[j]}` : names[j]);
          }
          lines.push(`Lane ${Math.floor(rnd() * lanes)}: ${names[i]} {${1 + Math.floor(rnd() * 30)} min}${exits.length ? ` -> ${exits.join(', ')}` : ''}`);
        }
        maps.push({ name: `random${g}`, text: lines.join('\n') });
      }

      const EPS = 1e-6;
      const problems = [];
      let connectors = 0;
      let rework = 0;
      let general = 0;
      for (const map of maps) {
        const m = S.buildModel(map.text, { title: 'T' }, S.measure);
        const fail = (msg) => problems.push(`${map.name}: ${msg}`);
        if (!m.ok) { fail(`did not build: ${m.errors.map((e) => e.code).join(',')}`); continue; }
        const { layout, graph } = m;
        const { steps, area } = layout;

        for (let a = 0; a < steps.length; a++) {
          const s = steps[a];
          if (Math.abs((s.x1 - s.x0) - layout.boxWidth) > EPS || Math.abs((s.y1 - s.y0) - layout.boxHeight) > EPS) fail(`${s.name} is not the common size`);
          const lane = layout.lanes[s.lane];
          if (s.y0 < lane.y0 - EPS || s.y1 > lane.y1 + EPS) fail(`${s.name} is outside its lane`);
          if (s.x0 < area.left - EPS || s.x1 > area.right + EPS) fail(`${s.name} is outside the map`);
          const band = layout.phases.find((p) => p.index === s.phase);
          if (band && (s.x0 < band.x0 - EPS || s.x1 > band.x1 + EPS)) fail(`${s.name} is outside its phase`);
          for (let b = a + 1; b < steps.length; b++) {
            const o = steps[b];
            if (s.x0 < o.x1 - EPS && o.x0 < s.x1 - EPS && s.y0 < o.y1 - EPS && o.y0 < s.y1 - EPS) fail(`${s.name} and ${o.name} overlap`);
          }
        }
        for (let i = 1; i < layout.lanes.length; i++) {
          if (Math.abs(layout.lanes[i].y0 - layout.lanes[i - 1].y1) > EPS) fail('lanes do not tile');
        }

        const segments = [];
        for (const c of layout.connectors) {
          connectors += 1;
          if (c.rework) rework += 1;
          if (c.kind === 'general') general += 1;
          const s = steps[c.source];
          const t = steps[c.target];
          const first = c.points[0];
          const last = c.points[c.points.length - 1];
          if (Math.abs(first[0] - s.x1) > EPS || Math.abs(first[1] - (s.y0 + s.y1) / 2) > EPS) fail(`connector ${c.index} does not leave the middle of its source's right side`);
          if (last[0] < t.x0 - EPS || last[0] > t.x0 + 16 + EPS || last[1] < t.y0 - EPS || last[1] > t.y1 + EPS) fail(`connector ${c.index} does not arrive on its target's left side`);
          if (c.rework !== graph.links[c.index].rework) fail(`connector ${c.index} rework flag differs from the graph`);
          for (let k = 1; k < c.points.length; k++) {
            const [x0, y0] = c.points[k - 1];
            const [x1, y1] = c.points[k];
            if (Math.abs(x0 - x1) > EPS && Math.abs(y0 - y1) > EPS) fail(`connector ${c.index} has a diagonal segment`);
            const seg = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), c, horizontal: Math.abs(y0 - y1) <= EPS };
            segments.push(seg);
            // No segment crosses the inside of any step.
            for (const box of steps) {
              if (seg.x1 > box.x0 + 0.5 && seg.x0 < box.x1 - 0.5 && seg.y1 > box.y0 + 0.5 && seg.y0 < box.y1 - 0.5) {
                const own = (box.index === c.target && k === c.points.length - 1);
                if (!own) fail(`connector ${c.index} passes under ${box.name}`);
              }
            }
          }
        }
        // Two connectors may share a stub at a step they both touch. Otherwise no run lies on another.
        for (let a = 0; a < segments.length; a++) {
          for (let b = a + 1; b < segments.length; b++) {
            const p = segments[a];
            const q = segments[b];
            if (p.c === q.c || p.horizontal !== q.horizontal) continue;
            if (p.c.source === q.c.source || p.c.target === q.c.target) continue;
            const same = p.horizontal ? Math.abs(p.y0 - q.y0) < 0.5 : Math.abs(p.x0 - q.x0) < 0.5;
            const overlap = p.horizontal ? Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) : Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
            if (same && overlap > 0.5) fail(`connectors ${p.c.index} and ${q.c.index} lie on each other`);
          }
        }

        // Every exit label has its own room: off the steps, off every line but its own, off other labels.
        const boxes = [];
        for (const c of layout.connectors) {
          if (!c.labelAt) continue;
          const w = S.measure(c.label, layout.options.fontSize - 1, 400);
          const box = { x0: c.labelAt.x, x1: c.labelAt.x + w, y0: c.labelAt.y - (layout.options.fontSize - 1) * 0.8, y1: c.labelAt.y + 2, c };
          for (const s of steps) {
            if (box.x1 > s.x0 + 0.5 && box.x0 < s.x1 - 0.5 && box.y1 > s.y0 + 0.5 && box.y0 < s.y1 - 0.5) fail(`label of connector ${c.index} is on ${s.name}`);
          }
          for (const seg of segments) {
            if (seg.c === c || seg.c.source === c.source) continue;
            if (box.x1 > seg.x0 + 0.5 && box.x0 < seg.x1 - 0.5 && box.y1 > seg.y0 + 0.5 && box.y0 < seg.y1 - 0.5) fail(`label of connector ${c.index} is on connector ${seg.c.index}`);
          }
          for (const other of boxes) {
            if (box.x1 > other.x0 + 0.5 && box.x0 < other.x1 - 0.5 && box.y1 > other.y0 + 0.5 && box.y0 < other.y1 - 0.5) fail(`labels of connectors ${c.index} and ${other.c.index} overlap`);
          }
          boxes.push(box);
        }

        if (JSON.stringify(S.buildModel(map.text, { title: 'T' }, S.measure).layout) !== JSON.stringify(layout)) fail('layout is not deterministic');
      }
      return { problems: problems.slice(0, 25), total: problems.length, maps: maps.length, connectors, rework, general };
    });
    expect(result.maps).toBe(76);
    expect(result.connectors).toBeGreaterThan(400);
    expect(result.rework).toBeGreaterThan(60);
    expect(result.general).toBeGreaterThan(150);
    expect(result.problems).toEqual([]);
  });

  test('long names wrap to three lines and are cut with an ellipsis, never left to overflow', async ({ page }) => {
    const out = await page.evaluate(() => {
      const S = window.ProcessFlowMapper;
      const long = 'Reconcile the supplier statement against goods received and raise every query';
      const m = S.buildModel(`Ann: (Start) -> ${long}\nAnn: ${long} -> Supercalifragilisticexpialidocious\nAnn: Supercalifragilisticexpialidocious`, {}, S.measure);
      return m.layout.steps.map((s) => ({ lines: s.lines, widest: Math.max(...s.lines.map((l) => S.measure(l, 12, 600))), box: m.layout.boxWidth }));
    });
    expect(out[1].lines).toHaveLength(3);
    expect(out[1].lines[2].endsWith('…')).toBe(true);
    for (const step of out) expect(step.widest).toBeLessThanOrEqual(step.box - 2 * 12 + 0.5);
    // One word wider than the box is broken, not left to stick out.
    expect(out[2].lines.length).toBeGreaterThan(1);
  });
});
