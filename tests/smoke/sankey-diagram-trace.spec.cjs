// Sankey diagram builder, tracing a node downstream: the trace line, flows
// written with their source, the amounts followed, the bands and marks drawn
// inside the ribbons, and the page controls.
//
// A trace is exact or absent: nothing is estimated. That is held by ground
// truth. Units are walked through random maps in this file, the list is built
// from the walks, and the tool must give back, flow by flow, what the walks did.
//
// The page runs script-src 'self', so expect.poll is used, not waitForFunction.

const { test, expect } = require('@playwright/test');

const PAGE = '/tools/sankey-diagram.html';

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.SankeyDiagram && window.SankeyDiagram.getModel()))).toBe(true);
}

const build = (page, text, settings = {}) => page.evaluate(
  ([t, s]) => JSON.parse(JSON.stringify(window.SankeyDiagram.buildModel(t, s))),
  [text, settings]
);

const parse = (page, text) => page.evaluate((t) => JSON.parse(JSON.stringify(window.SankeyDiagram.parser.parseFlows(t))), text);

// Two inputs meet and leave two ways. The totals do not say who went where.
const MIX = ['A [100] M', 'B [100] M', 'M [150] X', 'M [50] Y'].join('\n');
// The same totals with the routes written out.
const MIX_STATED = ['A [100] M', 'B [100] M', 'M [75 from A] X', 'M [75 from B] X', 'M [25 from A] Y', 'M [25 from B] Y'].join('\n');

// One input and a recycle that balances: 100 in, 30 round the loop, 100 out.
const LOOP = [
  'Fresh feed [100] Mixer',
  'Mixer [130] Reactor',
  'Reactor [130] Separator',
  'Separator [95] Product',
  'Separator [5] Purge',
  'Separator [30] Mixer'
].join('\n');

// Two inputs round a recycle, with the separator's exits written out.
const LOOP_STATED = [
  'Fresh feed [100] Mixer',
  'Side feed [20] Reactor',
  'Mixer [130] Reactor',
  'Reactor [150] Separator',
  'Separator [96 from Fresh feed] Product',
  'Separator [19 from Side feed] Product',
  'Separator [4 from Fresh feed] Purge',
  'Separator [1 from Side feed] Purge',
  'Separator [25 from Fresh feed] Mixer',
  'Separator [5 from Side feed] Mixer'
].join('\n');

// B to D skips a column, so that flow is routed through a slot.
const SKIP_STATED = [
  'A [60] B', 'Z [40] B',
  'B [30 from A] C', 'B [20 from Z] C', 'C [50] D',
  'B [30 from A] D', 'B [20 from Z] D', 'D [100] E'
].join('\n');

// The case that showed the fault: three inputs, and one unit that only one of them can be.
const HUNT = ['LinkedIn [120] Applied', 'Referral [30] Applied', 'Recruiter [50] Applied'].join('\n');
const HUNT_TRACES = '* LinkedIn\n* Referral\n* Recruiter';

const codes = (model) => model.warnings.map((w) => w.code);
const endsOf = (trace) => Object.fromEntries(trace.ends.map((e) => [`${e.kind}:${e.name}`, e.amount]));
/** Amount of a traced stream in the flow between two named nodes. */
const carried = (model, trace, from, to) => {
  const i = model.graph.links.findIndex((l) => model.graph.nodes[l.source].name === from && model.graph.nodes[l.target].name === to);
  return trace.shares[i] * model.graph.links[i].value;
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random flow list with loops and nodes that do not balance, no sources written. */
function randomList(seed) {
  const rnd = mulberry32(seed);
  const n = 4 + Math.floor(rnd() * 7);
  const pairs = new Set();
  const lines = [];
  const count = n + Math.floor(rnd() * n * 1.5);
  for (let k = 0; k < count; k++) {
    const a = Math.floor(rnd() * n);
    const b = Math.floor(rnd() * n);
    if (a === b || pairs.has(`${a}>${b}`)) continue;
    pairs.add(`${a}>${b}`);
    lines.push(`N${a} [${1 + Math.floor(rnd() * 100)}] N${b}`);
  }
  return { text: lines.join('\n'), n };
}

/**
 * Ground truth. Whole units leave each input and walk a layered map to an
 * output, each choosing its own way. Returns what every flow carried from
 * every input, which is exactly what a flow list throws away.
 */
function walkUnits(seed) {
  const rnd = mulberry32(seed);
  const inputs = 2 + Math.floor(rnd() * 3);
  const layers = 2 + Math.floor(rnd() * 3);
  const names = [[]];
  for (let i = 0; i < inputs; i++) names[0].push(`In${i}`);
  for (let l = 1; l <= layers; l++) {
    names.push([]);
    const width = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < width; k++) names[l].push(l === layers ? `Out${k}` : `L${l}n${k}`);
  }
  const truth = new Map();
  const outputs = new Map();
  for (let i = 0; i < inputs; i++) {
    const units = 1 + Math.floor(rnd() * 40);
    for (let u = 0; u < units; u++) {
      let here = `In${i}`;
      for (let l = 1; l <= layers; l++) {
        // A unit may skip a layer, so some flows jump columns.
        if (l < layers && rnd() < 0.2) continue;
        const next = names[l][Math.floor(rnd() * names[l].length)];
        const key = `${here}>${next}`;
        if (!truth.has(key)) truth.set(key, new Map());
        truth.get(key).set(`In${i}`, (truth.get(key).get(`In${i}`) || 0) + 1);
        here = next;
      }
      const end = `In${i}>${here}`;
      outputs.set(end, (outputs.get(end) || 0) + 1);
    }
  }
  return { truth, outputs, inputs: names[0] };
}

/** The flow list for a set of walks. Sources are written for every input not in `silent`. */
function listFrom(truth, silent = []) {
  const lines = [];
  for (const [key, per] of truth) {
    const [from, to] = key.split('>');
    let unsaid = 0;
    for (const [origin, count] of per) {
      if (from === origin || silent.includes(origin)) unsaid += count;
      else lines.push(`${from} [${count} from ${origin}] ${to}`);
    }
    if (unsaid) lines.push(`${from} [${unsaid}] ${to}`);
  }
  return lines.join('\n');
}

test.describe('trace line', () => {
  test('a trace line is read, deduplicated, and never mistaken for a flow', async ({ page }) => {
    await openTool(page);
    const parsed = await parse(page, 'A [10] B\n* A\n*A\n*Star [5] B\n*Star,C,2');
    expect(parsed.errors).toEqual([]);
    expect(parsed.traces).toEqual(['A']);
    expect(parsed.flows.map((f) => f.source)).toEqual(['A', '*Star', '*Star']);
  });

  test('a name holding a comma can be traced', async ({ page }) => {
    await openTool(page);
    const parsed = await parse(page, 'Smith, John [10] B\n* Smith, John');
    expect(parsed.errors).toEqual([]);
    expect(parsed.traces).toEqual(['Smith, John']);
  });

  test('an empty trace line, too many, and an unknown node are each reported', async ({ page }) => {
    await openTool(page);
    const empty = await parse(page, 'A [10] B\n*');
    expect(empty.errors.map((e) => [e.line, e.code])).toEqual([[2, 'TRACE_NOT_UNDERSTOOD']]);

    const many = ['A [1] B'];
    for (let i = 0; i < 9; i++) many.push(`* T${i}`);
    expect((await parse(page, many.join('\n'))).errors.map((e) => e.code)).toContain('TOO_MANY_TRACES');

    const unknown = await parse(page, 'A [10] B\n* Nobody');
    expect(unknown.warnings.map((w) => w.code)).toEqual(['UNKNOWN_NODE']);
    const model = await build(page, 'A [10] B\n* Nobody');
    expect(model.traces).toEqual([]);
  });

  test('setTraceLine adds one line, removes it, and leaves a flow starting with a star alone', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { setTraceLine } = window.SankeyDiagram.parser;
      const base = '*A [10] B\nA [5] C\n';
      const on = setTraceLine(base, 'A', true);
      return { on, twice: setTraceLine(on, 'A', true), off: setTraceLine(on, 'A', false) };
    });
    expect(out.on).toBe('*A [10] B\nA [5] C\n* A');
    expect(out.twice).toBe(out.on);
    expect(out.off).toBe('*A [10] B\nA [5] C');
  });
});

test.describe('a flow written with its source', () => {
  test('the source is read from the brackets or a fourth field, and the amount is still an amount', async ({ page }) => {
    await openTool(page);
    const parsed = await parse(page, [
      'A [10] M',
      'M [4 from A] X',
      'M [1,5 FROM  A] Y',
      'M,Z,3,A',
      'Money from home [5] M'
    ].join('\n'));
    expect(parsed.errors).toEqual([]);
    expect(parsed.flows.map((f) => [f.source, f.target, f.value, f.origin])).toEqual([
      ['A', 'M', 10, undefined],
      ['M', 'X', 4, 'A'],
      ['M', 'Y', 1.5, 'A'],
      ['M', 'Z', 3, 'A'],
      ['Money from home', 'M', 5, undefined]
    ]);
    // A fourth field that is part of a number is still the comma-in-amount mistake.
    expect((await parse(page, 'A,B,1,234')).errors[0].code).toBe('FIELD_COUNT');
    expect((await parse(page, 'A [from A] B')).errors[0].code).toBe('AMOUNT_NOT_A_NUMBER');
    expect((await parse(page, 'A [x from A] B')).errors[0].code).toBe('AMOUNT_NOT_A_NUMBER');
  });

  test('lines for one pair add to one flow, and only a repeated source is a duplicate', async ({ page }) => {
    await openTool(page);
    const model = await build(page, MIX_STATED);
    expect(model.graph.links.map((l) => l.value)).toEqual([100, 100, 150, 50]);
    expect(model.graph.links[2].stated).toEqual({ A: 75, B: 75 });
    expect(codes(model)).not.toContain('DUPLICATE_SUMMED');
    expect(model.balance.balanced).toBe(true);

    const twice = await build(page, 'A [10] M\nM [4 from A] X\nM [6 from A] X');
    expect(twice.graph.links[1].stated).toEqual({ A: 10 });
    expect(twice.warnings.filter((w) => w.code === 'DUPLICATE_SUMMED').map((w) => w.line)).toEqual([3]);
    // Unwritten and written lines for one pair are different things, not a repeat.
    expect(codes(await build(page, 'A [10] M\nM [4 from A] X\nM [6] X'))).not.toContain('DUPLICATE_SUMMED');
  });

  test('a source that is not a node, and a name that could be an object built-in, are handled', async ({ page }) => {
    await openTool(page);
    expect(codes(await build(page, 'A [10] M\nM [10 from Nobody] X'))).toContain('ORIGIN_UNKNOWN');
    const odd = await build(page, 'constructor [10] M\nB [10] M\nM [10 from constructor] X\nM [10] Y\n* constructor');
    expect(endsOf(odd.traces[0])).toEqual({ 'output:X': 10 });
  });
});

test.describe('what is followed', () => {
  test('three inputs and one unit: nobody is drawn on it until the list says whose it is', async ({ page }) => {
    await openTool(page);
    const tail = 'Applied [150] No reply\nApplied [49] Rejected';
    const blind = await build(page, `${HUNT}\n${tail}\nApplied [1] Offer\n${HUNT_TRACES}`);
    for (const trace of blind.traces) {
      expect(carried(blind, trace, 'Applied', 'Offer'), trace.name).toBe(0);
      expect(carried(blind, trace, 'Applied', 'No reply'), trace.name).toBe(0);
      expect(endsOf(trace)).toEqual({ 'unstated:Applied': trace.origin });
      expect(trace.stoppedAt.map((i) => blind.graph.nodes[i].name)).toEqual(['Applied']);
    }
    const said = blind.warnings.filter((w) => w.code === 'TRACE_UNSTATED');
    expect(said).toHaveLength(1);
    expect(said[0].message).toContain('"LinkedIn", "Referral", "Recruiter" are not followed past "Applied"');
    expect(said[0].message).toContain('Applied [amount from LinkedIn] No reply');

    const told = await build(page, `${HUNT}\n${tail}\nApplied [1 from Referral] Offer\n${HUNT_TRACES}`);
    expect(told.traces.map((t) => carried(told, t, 'Applied', 'Offer'))).toEqual([0, 1, 0]);
    expect(endsOf(told.traces[1])).toEqual({ 'output:Offer': 1, 'unstated:Applied': 29 });
  });

  test('every share drawn on a flow is whole units when the list is', async ({ page }) => {
    await openTool(page);
    const model = await build(page, [
      HUNT,
      'Applied [100 from LinkedIn] No reply', 'Applied [20 from Referral] No reply', 'Applied [30 from Recruiter] No reply',
      'Applied [20 from LinkedIn] Rejected', 'Applied [9 from Referral] Rejected', 'Applied [20 from Recruiter] Rejected',
      'Applied [1 from Referral] Offer',
      HUNT_TRACES
    ].join('\n'));
    expect(codes(model)).toEqual([]);
    expect(model.traces.map(endsOf)).toEqual([
      { 'output:No reply': 100, 'output:Rejected': 20 },
      { 'output:No reply': 20, 'output:Rejected': 9, 'output:Offer': 1 },
      { 'output:No reply': 30, 'output:Rejected': 20 }
    ]);
    for (const trace of model.traces) expect(trace.stoppedAt).toEqual([]);
  });

  test('the one stream left unwritten takes exactly what is left', async ({ page }) => {
    await openTool(page);
    const model = await build(page, [
      HUNT,
      'Applied [100 from LinkedIn] No reply', 'Applied [20 from Referral] No reply', 'Applied [30] No reply',
      'Applied [20 from LinkedIn] Rejected', 'Applied [9 from Referral] Rejected', 'Applied [20] Rejected',
      'Applied [1 from Referral] Offer',
      HUNT_TRACES
    ].join('\n'));
    expect(endsOf(model.traces[2])).toEqual({ 'output:No reply': 30, 'output:Rejected': 20 });
    expect(codes(model)).toEqual([]);
    // One unit more left over than Recruiter brings, and it is no longer settled.
    const off = await build(page, `${HUNT}\nOther [1] Applied\nApplied [100 from LinkedIn] No reply\nApplied [20 from Referral] No reply\nApplied [31] No reply\nApplied [20 from LinkedIn] Rejected\nApplied [10 from Referral] Rejected\nApplied [20] Rejected\n* Recruiter`);
    expect(endsOf(off.traces[0])).toEqual({ 'unstated:Applied': 50 });
  });

  test('past a stop, an exit written in full is still followed, and one left unsaid is not', async ({ page }) => {
    await openTool(page);
    // M stops A: Y and Z are both unsaid. X is written in full, so what goes on from X is known.
    const model = await build(page, [
      'A [100] M', 'B [100] M',
      'M [50 from A] X', 'M [100] Y', 'M [50] Z',
      'X [50] W', 'Y [100] V',
      '* A'
    ].join('\n'));
    const [trace] = model.traces;
    expect(carried(model, trace, 'M', 'X')).toBe(50);
    expect(carried(model, trace, 'X', 'W')).toBe(50);
    // Y has one way out, but what reaches it is not known, so nothing is drawn on it.
    expect(carried(model, trace, 'Y', 'V')).toBe(0);
    expect(endsOf(trace)).toEqual({ 'output:W': 50, 'unstated:M': 50 });
  });

  test('totals alone settle nothing where two inputs meet and leave two ways', async ({ page }) => {
    await openTool(page);
    const model = await build(page, `${MIX}\n* A`);
    const [trace] = model.traces;
    expect(trace.shares).toEqual([1, 0, 0, 0]);
    expect(endsOf(trace)).toEqual({ 'unstated:M': 100 });
    expect(codes(model)).toEqual(['TRACE_UNSTATED']);

    const stated = await build(page, `${MIX_STATED}\n* A`);
    expect(stated.traces[0].shares).toEqual([1, 0, 0.5, 0.5]);
    expect(endsOf(stated.traces[0])).toEqual({ 'output:X': 75, 'output:Y': 25 });
    expect(codes(stated)).toEqual([]);
  });

  test('a node the list does settle is followed with nothing written', async ({ page }) => {
    await openTool(page);
    // One stream in, split: all of each exit is that stream.
    const split = await build(page, 'A [100] M\nM [60] X\nM [40] Y\n* A');
    expect(endsOf(split.traces[0])).toEqual({ 'output:X': 60, 'output:Y': 40 });
    // Two streams in, one way out: it carries what arrived.
    const merge = await build(page, 'A [100] M\nB [100] M\nM [200] X\nX [200] Z\n* A');
    expect(merge.traces[0].shares).toEqual([1, 0, 0.5, 0.5]);
    expect(endsOf(merge.traces[0])).toEqual({ 'output:Z': 100 });
    // Two ways out but one is spoken for, so the other takes the rest.
    const rest = await build(page, 'A [100] M\nB [100] M\nM [150] X\nM [50 from B] Y\n* A');
    expect(endsOf(rest.traces[0])).toEqual({ 'output:X': 100 });
    for (const m of [split, merge, rest]) expect(codes(m)).toEqual([]);
  });

  test('a node that does not balance loses the stream, or stops it, and never invents any', async ({ page }) => {
    await openTool(page);
    const short = await build(page, 'A [100] M\nM [60] X\n* A');
    expect(short.traces[0].shares).toEqual([1, 1]);
    expect(endsOf(short.traces[0])).toEqual({ 'output:X': 60, 'missing:M': 40 });

    const extra = await build(page, 'A [50] M\nM [100] X\n* A');
    expect(extra.traces[0].shares).toEqual([1, 0.5]);
    expect(endsOf(extra.traces[0])).toEqual({ 'output:X': 50 });

    // Mixed, and short on the way out: a flow and a loss are two ways to leave.
    const both = await build(page, 'A [50] M\nB [50] M\nM [60] X\n* A');
    expect(endsOf(both.traces[0])).toEqual({ 'unstated:M': 50 });
  });

  test('a recycle fed by one input is followed all the way round', async ({ page }) => {
    await openTool(page);
    const model = await build(page, `${LOOP}\n* Fresh feed`);
    expect(model.traces[0].shares).toEqual([1, 1, 1, 1, 1, 1]);
    expect(endsOf(model.traces[0])).toEqual({ 'output:Product': 95, 'output:Purge': 5 });

    const mid = await build(page, `${LOOP}\n* Mixer`);
    expect(mid.traces[0].origin).toBe(130);
    expect(endsOf(mid.traces[0])).toEqual({ 'output:Product': 95, 'returned:Mixer': 30, 'output:Purge': 5 });
  });

  test('two inputs round a recycle are followed once the split is written', async ({ page }) => {
    await openTool(page);
    const model = await build(page, `${LOOP_STATED}\n* Fresh feed\n* Side feed`);
    expect(codes(model).filter((c) => c.startsWith('TRACE'))).toEqual([]);
    const [fresh, side] = model.traces;
    expect(carried(model, fresh, 'Mixer', 'Reactor')).toBeCloseTo(125, 9);
    expect(carried(model, side, 'Mixer', 'Reactor')).toBeCloseTo(5, 9);
    expect(carried(model, side, 'Reactor', 'Separator')).toBeCloseTo(25, 9);
    expect(endsOf(fresh)).toEqual({ 'output:Product': 96, 'output:Purge': 4 });
    expect(endsOf(side)).toEqual({ 'output:Product': 19, 'output:Purge': 1 });

    // Without the split written, both stop at the separator.
    const blind = await build(page, `${LOOP_STATED.replace(/ from [A-Za-z ]+\]/g, ']')}\n* Fresh feed\n* Side feed`);
    expect(blind.traces.map(endsOf)).toEqual([{ 'unstated:Separator': 100 }, { 'unstated:Separator': 20 }]);
  });

  test('amounts written that cannot be true are reported, not drawn as if they were', async ({ page }) => {
    await openTool(page);
    const over = await build(page, `${HUNT}\nApplied [150] No reply\nApplied [9] Rejected\nApplied [41 from Referral] Offer\n* Referral`);
    const said = over.warnings.find((w) => w.code === 'TRACE_OVERSTATED');
    expect(said.message).toBe('The list has 41 from "Referral" leaving "Applied", but only 30 of it gets there');

    const full = await build(page, 'A [100] M\nB [10] M\nM [100 from B] X\nM [10] Y\n* A');
    const crowd = full.warnings.find((w) => w.code === 'TRACE_OVERFULL');
    expect(crowd.message).toContain('M to Y would have to carry 100 from "A", more than the 10 it holds');
    expect(full.traces[0].shares.every((s) => s >= 0 && s <= 1)).toBe(true);
  });

  test('one traced node feeding another hands over, and the page says so', async ({ page }) => {
    await openTool(page);
    const model = await build(page, 'A [100] B\nZ [100] B\nB [200] C\n* A\n* B');
    const [a, b] = model.traces;
    expect(endsOf(a)).toEqual({ 'traced:B': 100 });
    expect(a.shares).toEqual([1, 0, 0]);
    expect(b.shares).toEqual([0, 0, 1]);
    expect(codes(model)).toContain('TRACE_HANDED_ON');
  });

  test('a node with nothing leaving it has nothing to trace', async ({ page }) => {
    await openTool(page);
    const model = await build(page, 'A [100] B\n* B');
    expect(model.traces).toEqual([]);
    expect(codes(model)).toContain('TRACE_NOTHING');
  });

  test('ground truth: units walked here are given back flow by flow when every route is written', async ({ page }) => {
    await openTool(page);
    for (let seed = 1; seed <= 60; seed++) {
      const { truth, outputs, inputs } = walkUnits(seed);
      const text = `${listFrom(truth)}\n${inputs.map((n) => `* ${n}`).join('\n')}`;
      const model = await build(page, text);
      expect(model.ok, `seed ${seed}`).toBe(true);
      expect(codes(model).filter((c) => c.startsWith('TRACE')), `seed ${seed}`).toEqual([]);
      for (const trace of model.traces) {
        for (const link of model.graph.links) {
          const key = `${model.graph.nodes[link.source].name}>${model.graph.nodes[link.target].name}`;
          const want = (truth.get(key) && truth.get(key).get(trace.name)) || 0;
          expect(Math.abs(trace.shares[link.index] * link.value - want), `seed ${seed} ${trace.name} ${key}`).toBeLessThan(1e-9);
        }
        const want = {};
        for (const [key, count] of outputs) {
          const [origin, end] = key.split('>');
          if (origin === trace.name) want[`output:${end}`] = count;
        }
        const got = endsOf(trace);
        expect(Object.keys(got).sort(), `seed ${seed} ${trace.name}`).toEqual(Object.keys(want).sort());
        for (const k of Object.keys(want)) expect(got[k]).toBeCloseTo(want[k], 9);
      }
    }
  });

  test('ground truth: one input left unwritten is recovered from what the others leave over', async ({ page }) => {
    await openTool(page);
    for (let seed = 101; seed <= 140; seed++) {
      const { truth, inputs } = walkUnits(seed);
      const silent = inputs[seed % inputs.length];
      const model = await build(page, `${listFrom(truth, [silent])}\n* ${silent}`);
      const [trace] = model.traces;
      for (const link of model.graph.links) {
        const key = `${model.graph.nodes[link.source].name}>${model.graph.nodes[link.target].name}`;
        const want = (truth.get(key) && truth.get(key).get(silent)) || 0;
        expect(Math.abs(trace.shares[link.index] * link.value - want), `seed ${seed} ${key}`).toBeLessThan(1e-9);
      }
      expect(trace.stoppedAt, `seed ${seed}`).toEqual([]);
    }
  });

  test('ground truth: with no route written, nothing is drawn that the walks could contradict', async ({ page }) => {
    await openTool(page);
    for (let seed = 201; seed <= 260; seed++) {
      const { truth, inputs } = walkUnits(seed);
      const model = await build(page, `${listFrom(truth, inputs)}\n${inputs.map((n) => `* ${n}`).join('\n')}`);
      for (const trace of model.traces) {
        for (const link of model.graph.links) {
          const got = trace.shares[link.index] * link.value;
          if (got === 0) continue;
          // Whatever is drawn must be what really happened, to the unit.
          const key = `${model.graph.nodes[link.source].name}>${model.graph.nodes[link.target].name}`;
          const want = (truth.get(key) && truth.get(key).get(trace.name)) || 0;
          expect(Math.abs(got - want), `seed ${seed} ${trace.name} ${key}`).toBeLessThan(1e-9);
        }
        const total = trace.ends.reduce((s, e) => s + e.amount, 0);
        expect(Math.abs(total - trace.origin), `seed ${seed} ${trace.name}`).toBeLessThan(1e-9);
      }
    }
  });

  test('random lists with loops and gaps: everything traced ends somewhere, and no flow is over-filled', async ({ page }) => {
    await openTool(page);
    for (let seed = 1; seed <= 80; seed++) {
      const { text, n } = randomList(seed);
      const picks = [seed % n, (seed * 7 + 3) % n, (seed * 5 + 1) % n].slice(0, 1 + (seed % 3));
      const names = [...new Set(picks)].map((i) => `N${i}`);
      const model = await build(page, `${text}\n${names.map((x) => `* ${x}`).join('\n')}`);
      expect(model.ok, `seed ${seed}`).toBe(true);
      const { nodes, links } = model.graph;
      for (const trace of model.traces) {
        links.forEach((link, i) => {
          const share = trace.shares[i];
          expect(share >= 0 && share <= 1, `seed ${seed} link ${i}`).toBe(true);
          // A part share is only ever what one way out carries of what arrived.
          if (share > 0 && share < 1) {
            const from = nodes[link.source];
            expect(from.outLinks.length, `seed ${seed} link ${i}`).toBe(1);
            expect(from.inflow <= from.outflow * (1 + 1e-9), `seed ${seed} link ${i}`).toBe(true);
          }
        });
        const total = trace.ends.reduce((s, e) => s + e.amount, 0);
        expect(Math.abs(total - trace.origin) / trace.origin, `seed ${seed} ${trace.name}`).toBeLessThan(1e-9);
      }
      links.forEach((link, i) => {
        const sum = model.traces.reduce((s, t) => s + t.shares[i], 0);
        expect(sum, `seed ${seed} link ${i}`).toBeLessThanOrEqual(1 + 1e-9);
      });
    }
  });

  test('tracing changes neither the balance nor the scale', async ({ page }) => {
    await openTool(page);
    // A thin flow puts the footnote on both, so the height budget is the same.
    const list = `${MIX}\nA [0.001] Y`;
    const plain = await build(page, list);
    const traced = await build(page, `${list}\n* A`);
    expect(traced.balance).toEqual(plain.balance);
    expect(traced.layout.ky).toBe(plain.layout.ky);
    expect(traced.layout.nodes).toEqual(plain.layout.nodes);

    // Writing the routes changes no total either.
    const a = await build(page, MIX);
    const b = await build(page, MIX_STATED);
    expect(b.balance).toEqual(a.balance);
    expect(b.layout.nodes).toEqual(a.layout.nodes);
  });
});

test.describe('bands', () => {
  /** Draw a list and measure each band against the ribbon it sits in. */
  const measure = (page, text) => page.evaluate((t) => {
    const S = window.SankeyDiagram;
    const model = S.buildModel(t, {});
    const svg = S.renderSankey(document, model, {}, S.PALETTES.light);
    document.body.appendChild(svg);
    const out = [];
    for (const band of svg.querySelectorAll('.sankey-trace')) {
      const li = Number(band.getAttribute('data-link'));
      const ribbon = svg.querySelector(`.sankey-link[data-link="${li}"]`);
      const link = model.layout.links[li];
      const trace = model.traces.find((x) => x.node === Number(band.getAttribute('data-trace')));
      const thin = band.classList.contains('sankey-trace-thin');
      let inside = true;
      const bb = band.getBBox();
      const rb = ribbon.getBBox();
      if (!thin && !link.hairline) {
        // The band's own center line must lie inside both the band and its ribbon.
        const earlier = model.traces.slice(0, model.traces.indexOf(trace)).reduce((s, x) => s + x.shares[li], 0);
        const middle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        middle.setAttribute('d', S.engine.centerPath(S.engine.linkBand(link, earlier, earlier + trace.shares[li])));
        svg.appendChild(middle);
        const length = middle.getTotalLength();
        for (let k = 1; k < 40; k++) {
          const p = middle.getPointAtLength((length * k) / 40);
          if (!ribbon.isPointInFill(p) || !band.isPointInFill(p)) inside = false;
        }
        middle.remove();
        // Nothing of a band may show outside its ribbon, corners of a loop included.
        const at = svg.createSVGPoint();
        for (at.x = bb.x + 0.37; at.x < bb.x + bb.width && inside; at.x += 1) {
          for (at.y = bb.y + 0.37; at.y < bb.y + bb.height; at.y += 1) {
            if (band.isPointInFill(at) && !ribbon.isPointInFill(at)) { inside = false; break; }
          }
        }
      }
      out.push({
        link: li, trace: trace.name, thin, inside, share: trace.shares[li], width: link.width,
        within: bb.x >= rb.x - 0.6 && bb.y >= rb.y - 0.6 && bb.x + bb.width <= rb.x + rb.width + 0.6 && bb.y + bb.height <= rb.y + rb.height + 0.6,
        fill: band.getAttribute('fill'), stroke: band.getAttribute('stroke'), title: band.querySelector('title').textContent
      });
    }
    const result = {
      bands: out,
      marks: [...svg.querySelectorAll('.sankey-trace-mark')].map((m) => [Number(m.getAttribute('data-link')), Number(m.getAttribute('data-trace'))]),
      names: model.graph.nodes.map((n) => n.name),
      links: model.graph.links.map((l) => [model.graph.nodes[l.source].name, model.graph.nodes[l.target].name]),
      footnote: (svg.querySelector('.sankey-footnote') || { textContent: '' }).textContent,
      colors: S.nodeColors(model, S.PALETTES.light),
      markup: new XMLSerializer().serializeToString(svg),
      traceNodes: model.traces.map((x) => x.node)
    };
    svg.remove();
    return result;
  }, text);

  test('a band is drawn in every flow the list says the traced node reaches, with the amount in words', async ({ page }) => {
    await openTool(page);
    const drawn = await measure(page, `${MIX_STATED}\n* A`);
    expect(drawn.bands.map((b) => b.link)).toEqual([0, 2, 3]);
    for (const band of drawn.bands) {
      expect(band.thin).toBe(false);
      expect(band.within, `link ${band.link}`).toBe(true);
      expect(band.inside, `link ${band.link}`).toBe(true);
      expect(band.fill).toBe(drawn.colors[drawn.traceNodes[0]]);
    }
    expect(drawn.bands[1].title).toBe('M to X: 75 of 150 came through A (50%)');
    expect(drawn.footnote).toBe('Solid bands are the part of each flow that came through A (circles).');
    expect(drawn.markup).not.toMatch(/var\(|style=/);
  });

  test('where the list does not say, the trace ends on the diagram and the footnote says why', async ({ page }) => {
    await openTool(page);
    const drawn = await measure(page, `${MIX}\n* A`);
    expect(drawn.bands.map((b) => b.link)).toEqual([0]);
    expect(drawn.marks.every(([link]) => link === 0)).toBe(true);
    expect(drawn.footnote).toBe('Solid bands are the part of each flow that came through A (circles). A trace ends where the flow list does not say which way it went.');
  });

  test('one unit carries one mark: the three-input case as drawn', async ({ page }) => {
    await openTool(page);
    const tail = 'Applied [150] No reply\nApplied [49] Rejected';
    const offer = (drawn) => drawn.links.findIndex(([from, to]) => from === 'Applied' && to === 'Offer');

    const blind = await measure(page, `${HUNT}\n${tail}\nApplied [1] Offer\n${HUNT_TRACES}`);
    expect(blind.bands.filter((b) => b.link === offer(blind))).toEqual([]);
    expect(blind.marks.filter(([link]) => link === offer(blind))).toEqual([]);
    // Each input is still drawn up to the node where the list stops saying.
    expect(blind.bands.map((b) => b.link)).toEqual([0, 1, 2]);

    const told = await measure(page, `${HUNT}\n${tail}\nApplied [1 from Referral] Offer\n${HUNT_TRACES}`);
    const onOffer = told.bands.filter((b) => b.link === offer(told));
    expect(onOffer.map((b) => [b.trace, b.share])).toEqual([['Referral', 1]]);
    const whose = [...new Set(told.marks.filter(([link]) => link === offer(told)).map(([, node]) => told.names[node]))];
    expect(whose).toEqual(['Referral']);
  });

  test('bands stay inside their ribbon round a recycle loop and through skipped columns', async ({ page }) => {
    await openTool(page);
    const lists = [`${LOOP_STATED}\n* Fresh feed\n* Side feed`, `${SKIP_STATED}\n* A\n* Z`];
    for (const text of lists) {
      const drawn = await measure(page, text);
      expect(drawn.bands.length).toBeGreaterThan(8);
      for (const band of drawn.bands) {
        expect(band.within, `link ${band.link}`).toBe(true);
        expect(band.inside, `link ${band.link}`).toBe(true);
      }
    }
  });

  test('every example, traced from its first node, keeps each band inside its ribbon', async ({ page }) => {
    await openTool(page);
    const presets = await page.evaluate(() => window.SankeyDiagram.PRESETS.map((p) => p.text));
    for (const text of presets) {
      const first = (await build(page, text)).graph.nodes[0].name;
      const drawn = await measure(page, `${text}\n* ${first}`);
      expect(drawn.bands.length).toBeGreaterThan(0);
      for (const band of drawn.bands) {
        expect(band.within, `${first} link ${band.link}`).toBe(true);
        expect(band.inside, `${first} link ${band.link}`).toBe(true);
      }
    }
  });

  test('a share under a pixel is a dashed line, not a band thickened to be seen', async ({ page }) => {
    await openTool(page);
    const drawn = await measure(page, 'A [1] M\nB [999] M\nM [0.5 from A] X\nM [499.5] X\nM [0.5 from A] Y\nM [499.5] Y\n* A');
    const later = drawn.bands.filter((b) => b.link >= 2);
    expect(later).toHaveLength(2);
    for (const band of later) {
      expect(band.share * band.width).toBeLessThan(1);
      expect(band.thin).toBe(true);
      expect(band.fill).toBe('none');
      expect(band.stroke).toBe(drawn.colors[0]);
    }
  });

  test('with nothing traced the diagram is drawn exactly as before, routes written or not', async ({ page }) => {
    await openTool(page);
    const plain = await measure(page, MIX);
    expect(plain.bands).toEqual([]);
    expect(plain.footnote).toBe('');
    expect(plain.markup).not.toContain('sankey-traces');
    expect((await measure(page, MIX_STATED)).markup).toBe(plain.markup);
  });
});

test.describe('marks', () => {
  // Five inputs into one node, each leaving 60/40, written out.
  const SIX = (() => {
    const amounts = { A: 60, B: 50, C: 40, D: 30, E: 20 };
    const lines = Object.entries(amounts).map(([n, v]) => `${n} [${v}] M`);
    for (const [n, v] of Object.entries(amounts)) lines.push(`M [${v * 0.6} from ${n}] X`, `M [${v * 0.4} from ${n}] Y`);
    return lines.join('\n');
  })();

  /** Draw a list and report every mark with the ribbon and band it belongs to. */
  const marksOf = (page, text, view = {}) => page.evaluate(([t, v]) => {
    const S = window.SankeyDiagram;
    const model = S.buildModel(t, {});
    const svg = S.renderSankey(document, model, v, S.PALETTES.light);
    document.body.appendChild(svg);
    const marks = [...svg.querySelectorAll('.sankey-trace-mark')].map((mark) => {
      const li = mark.getAttribute('data-link');
      const node = mark.getAttribute('data-trace');
      const bb = mark.getBBox();
      const at = svg.createSVGPoint();
      at.x = bb.x + bb.width / 2;
      at.y = bb.y + bb.height / 2;
      const ribbon = svg.querySelector(`.sankey-link[data-link="${li}"]`);
      const band = svg.querySelector(`.sankey-trace[data-link="${li}"][data-trace="${node}"]`);
      return {
        link: Number(li), trace: Number(node), shape: mark.getAttribute('data-shape'),
        x: at.x, y: at.y, size: Math.max(bb.width, bb.height),
        // The outline as drawn: how many corners, and whether the first is at the top.
        corners: mark.getAttribute('d').split('L').length,
        topFirst: Math.abs(Number(mark.getAttribute('d').slice(1).split(',')[0]) - at.x) < 0.2,
        inRibbon: ribbon.classList.contains('sankey-hairline') || ribbon.isPointInFill(at),
        inBand: !band || band.getAttribute('fill') === 'none' || band.isPointInFill(at),
        fill: mark.getAttribute('fill'), stroke: mark.getAttribute('stroke')
      };
    });
    const out = {
      marks,
      bands: [...svg.querySelectorAll('.sankey-trace')].map((b) => ({
        link: Number(b.getAttribute('data-link')), trace: Number(b.getAttribute('data-trace')),
        fill: b.getAttribute('fill'), line: b.classList.contains('sankey-trace-line')
      })),
      nodeMarks: [...svg.querySelectorAll('.sankey-node-mark')].map((m) => [Number(m.getAttribute('data-node')), m.getAttribute('data-shape')]),
      order: model.traces.map((x) => x.node),
      footnote: (svg.querySelector('.sankey-footnote') || { textContent: '' }).textContent,
      markup: new XMLSerializer().serializeToString(svg)
    };
    svg.remove();
    return out;
  }, [text, view]);

  test('each traced node has a shape of its own, on the node and along every flow it reaches', async ({ page }) => {
    await openTool(page);
    const drawn = await marksOf(page, `${SIX}\n* A\n* B\n* C\n* D\n* E`);
    const expected = ['circle', 'triangle', 'square', 'star', 'diamond'];
    const outline = { circle: [24, true], triangle: [3, true], square: [4, false], star: [10, true], diamond: [4, true] };
    expect(drawn.nodeMarks).toEqual(drawn.order.map((node, i) => [node, expected[i]]));
    // Each input reaches its own flow in and both flows out.
    expect(drawn.bands).toHaveLength(15);
    for (const band of drawn.bands) {
      const own = drawn.marks.filter((m) => m.link === band.link && m.trace === band.trace);
      expect(own.length, `link ${band.link} trace ${band.trace}`).toBeGreaterThan(0);
      for (const m of own) {
        expect(m.shape).toBe(expected[drawn.order.indexOf(band.trace)]);
        expect([m.corners, m.topFirst], `${m.shape} on link ${m.link}`).toEqual(outline[m.shape]);
      }
    }
    for (const m of drawn.marks) {
      expect(m.inRibbon, `mark on link ${m.link}`).toBe(true);
      expect(m.inBand, `mark on link ${m.link}`).toBe(true);
      expect(m.fill).toBe('#ffffff');
      expect(m.stroke).toBe('#0f172a');
      expect(m.size).toBeGreaterThan(7);
      expect(m.size).toBeLessThan(13);
    }
    expect(drawn.markup).not.toMatch(/var\(|style=/);
  });

  test('all eight shapes are different outlines of about the same size', async ({ page }) => {
    await openTool(page);
    const shapes = await page.evaluate(() => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      document.body.appendChild(svg);
      const out = [];
      for (let i = 0; i < 8; i++) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', window.SankeyDiagram.traceMarkPath(i, 50, 50));
        svg.appendChild(path);
        const bb = path.getBBox();
        out.push({ d: path.getAttribute('d'), w: bb.width, h: bb.height, cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2, same: window.SankeyDiagram.traceMarkPath(i + 8, 50, 50) === path.getAttribute('d') });
      }
      svg.remove();
      return out;
    });
    expect(new Set(shapes.map((x) => x.d)).size).toBe(8);
    for (const shape of shapes) {
      expect(shape.w).toBeGreaterThan(7);
      expect(shape.w).toBeLessThan(12.5);
      expect(shape.h).toBeGreaterThan(7);
      expect(shape.h).toBeLessThan(12.5);
      expect(Math.abs(shape.cx - 50)).toBeLessThan(1.5);
      expect(Math.abs(shape.cy - 50)).toBeLessThan(1.5);
      expect(shape.same).toBe(true);
    }
  });

  test('marks are spaced along the stream, and those of streams side by side do not line up', async ({ page }) => {
    await openTool(page);
    const drawn = await marksOf(page, 'A [50] M\nB [50] M\nM [100] X\n* A\n* B');
    const onLast = (trace) => drawn.marks.filter((m) => m.link === 2 && m.trace === trace).map((m) => m.x);
    const [a, b] = drawn.order.map(onLast);
    expect(a.length).toBeGreaterThan(2);
    for (let i = 1; i < a.length; i++) expect(a[i] - a[i - 1]).toBeCloseTo(44, 0);
    for (const x of a) for (const y of b) expect(Math.abs(x - y)).toBeGreaterThan(6);
  });

  test('marks follow a recycle loop and a flow routed through skipped columns', async ({ page }) => {
    await openTool(page);
    for (const text of [`${LOOP_STATED}\n* Fresh feed\n* Side feed`, `${SKIP_STATED}\n* A\n* Z`]) {
      const drawn = await marksOf(page, text);
      expect(drawn.marks.length).toBeGreaterThan(10);
      for (const m of drawn.marks) {
        expect(m.inRibbon, `mark on link ${m.link}`).toBe(true);
        expect(m.inBand, `mark on link ${m.link}`).toBe(true);
      }
    }
  });

  test('marked lines replace the bands, bands only drops the marks, and the footnote follows', async ({ page }) => {
    await openTool(page);
    const text = `${MIX_STATED}\n* A`;
    const line = await marksOf(page, text, { traceStyle: 'line' });
    expect(line.bands).toHaveLength(3);
    expect(line.bands.every((b) => b.line && b.fill === 'none')).toBe(true);
    expect(line.marks.length).toBeGreaterThan(6);
    expect(line.footnote).toBe('Marked lines run through each flow that carries something from A (circles).');

    const band = await marksOf(page, text, { traceStyle: 'band' });
    expect(band.marks).toEqual([]);
    expect(band.nodeMarks).toEqual([]);
    expect(band.bands.every((b) => !b.line && b.fill !== 'none')).toBe(true);
    expect(band.footnote).toBe('Solid bands are the part of each flow that came through A.');
  });

  test('past three traced nodes the footnote points at the marks instead of listing names', async ({ page }) => {
    await openTool(page);
    const drawn = await marksOf(page, `${SIX}\n* A\n* B\n* C\n* D`);
    expect(drawn.footnote).toBe('Solid bands are the part of each flow that came through the node carrying the same mark.');
  });
});

test.describe('page', () => {
  const flowText = (page) => page.locator('#flowText').inputValue();
  const setText = async (page, text, nodes = 5) => {
    await page.fill('#unitInput', 't');
    await page.fill('#flowText', text);
    await expect.poll(() => page.evaluate(() => window.SankeyDiagram.getModel().graph.nodes.length)).toBe(nodes);
  };
  const rowsOf = (page) => page.locator('#traceTable tbody tr').evaluateAll(
    (trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent)));

  test('double-clicking a node traces it as far as the list goes, says where it stopped, and the same again turns it off', async ({ page }) => {
    await openTool(page);
    await setText(page, MIX);
    await expect(page.locator('#traceCard')).toBeHidden();
    await expect(page.locator('#clearTraces')).toBeDisabled();

    const node = page.locator('#diagramHost .sankey-node[data-node="0"]');
    await node.scrollIntoViewIfNeeded();
    await node.dblclick();
    await expect.poll(() => flowText(page)).toBe(`${MIX}\n* A`);
    await expect(page.locator('#diagramHost .sankey-trace')).toHaveCount(1);
    await expect(page.locator('#traceCard')).toBeVisible();
    await expect(page.locator('#traceNote')).toContainText('nothing is estimated');
    await expect(page.locator('#traceNote')).toContainText('Applied [12 from Referral] Screen');
    expect(await rowsOf(page)).toEqual([['A (100 t)', 'Reaches M; the list does not say where it goes from there', '100', '100%']]);
    await expect(page.locator('#warningList')).toContainText('"A" is not followed past "M"');
    await expect(page.locator('#warningList')).toContainText('M [amount from A] X');
    await expect(page.locator('#diagramHost .sankey-node[data-node="0"]')).toHaveAttribute('aria-label', /, traced\./);

    await page.locator('#diagramHost .sankey-node[data-node="0"]').dblclick();
    await expect.poll(() => flowText(page)).toBe(MIX);
    await expect(page.locator('#diagramHost .sankey-trace')).toHaveCount(0);
    await expect(page.locator('#traceCard')).toBeHidden();
  });

  test('writing the routes carries the trace through, in the table and on the diagram', async ({ page }) => {
    await openTool(page);
    await setText(page, `${MIX_STATED}\n* A`);
    await expect(page.locator('#diagramHost .sankey-trace')).toHaveCount(3);
    expect(await rowsOf(page)).toEqual([['A (100 t)', 'X', '75', '75%'], ['A (100 t)', 'Y', '25', '25%']]);
    await expect(page.locator('#traceNote')).toContainText('Followed all the way');
    await expect(page.locator('#warningBox')).toBeHidden();
    // The flows table still shows one row per ribbon, with the summed amount.
    const flows = await page.locator('#flowsTable tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.cells].slice(0, 3).map((c) => c.textContent)));
    expect(flows).toEqual([['A', 'M', '100'], ['B', 'M', '100'], ['M', 'X', '150'], ['M', 'Y', '50']]);
  });

  test('one click, or a drag, never traces', async ({ page }) => {
    await openTool(page);
    await setText(page, MIX);
    const node = page.locator('#diagramHost .sankey-node[data-node="0"]');
    await node.scrollIntoViewIfNeeded();
    await node.click();
    await page.waitForTimeout(600);
    await page.locator('#diagramHost .sankey-node[data-node="0"]').click();
    expect(await flowText(page)).toBe(MIX);

    const box = await page.locator('#diagramHost .sankey-node[data-node="0"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 4 });
    await page.mouse.up();
    await expect.poll(() => flowText(page)).toContain('~ A:');
    expect(await flowText(page)).not.toContain('*');
  });

  test('T on a focused node toggles its trace and keeps focus, and Clear traces removes them all', async ({ page }) => {
    await openTool(page);
    await setText(page, MIX);
    await page.locator('#diagramHost .sankey-node[data-node="2"]').focus();
    await page.keyboard.press('t');
    await expect.poll(() => flowText(page)).toBe(`${MIX}\n* B`);
    expect(await page.evaluate(() => document.activeElement.getAttribute('data-node'))).toBe('2');
    await page.keyboard.press('t');
    await expect.poll(() => flowText(page)).toBe(MIX);

    await setText(page, `${MIX_STATED}\n* A\n* B`);
    await expect(page.locator('#traceTable tbody tr')).toHaveCount(4);
    await page.locator('#clearTraces').click();
    await expect.poll(() => flowText(page)).toBe(MIX_STATED);
    await expect(page.locator('#clearTraces')).toBeDisabled();
  });

  test('an input error hides the trace table, and the exported file carries the bands and the footnote', async ({ page }) => {
    await openTool(page);
    await setText(page, `${MIX_STATED}\n* A`);
    await expect(page.locator('#traceCard')).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadSvg').click()]);
    const svg = require('fs').readFileSync(await download.path(), 'utf8');
    expect(svg.match(/class="sankey-trace"/g)).toHaveLength(3);
    expect(svg).toContain('Solid bands are the part of each flow that came through A');
    expect(svg).not.toMatch(/var\(|style=|tabindex/);

    await page.fill('#flowText', `${MIX_STATED}\n* A\nnonsense`);
    await expect(page.locator('#errorBox')).toBeVisible();
    await expect(page.locator('#traceCard')).toBeHidden();
    await expect(page.locator('#traceTable tbody tr')).toHaveCount(0);
  });

  test('Trace inputs follows every input, largest first, and replaces what was traced', async ({ page }) => {
    await openTool(page);
    const list = 'B [100] M\nA [150] M\nM [90 from A] X\nM [60 from B] X\nM [60 from A] Y\nM [40 from B] Y';
    await setText(page, `${list}\n* M`);
    await page.locator('#traceInputs').click();
    await expect.poll(() => flowText(page)).toBe(`${list}\n* A\n* B`);
    await expect(page.locator('#diagramHost .sankey-node-mark')).toHaveCount(2);
    const keys = await page.locator('#traceTable tbody th').evaluateAll((ths) => ths.map((th) => [th.textContent, th.querySelector('svg.trace-key path').getAttribute('d')]));
    expect(keys.map((k) => k[0])).toEqual(['A (150 t)', 'A (150 t)', 'B (100 t)', 'B (100 t)']);
    expect(keys[0][1]).toBe(keys[1][1]);
    expect(keys[0][1]).not.toBe(keys[2][1]);
    // With every input traced and every route written, the bands fill each flow.
    const filled = await page.evaluate(() => {
      const m = window.SankeyDiagram.getModel();
      return m.graph.links.map((_, i) => m.traces.reduce((s, t) => s + t.shares[i], 0));
    });
    for (const sum of filled) expect(sum).toBeCloseTo(1, 12);
  });

  test('more inputs than shapes traces the largest eight and says so', async ({ page }) => {
    await openTool(page);
    const lines = [];
    for (let i = 1; i <= 10; i++) lines.push(`In${i} [${i * 10}] M`);
    lines.push('M [550] X');
    await setText(page, lines.join('\n'), 12);
    await page.locator('#traceInputs').click();
    await expect.poll(() => page.evaluate(() => window.SankeyDiagram.getModel().parsed.traces)).toEqual(
      ['In10', 'In9', 'In8', 'In7', 'In6', 'In5', 'In4', 'In3']);
    await expect(page.locator('#exportStatus')).toHaveText('There are 10 inputs and 8 shapes, so the 8 largest are traced.');
    await expect(page.locator('#errorBox')).toBeHidden();
  });

  test('the traced-stream style redraws once, reaches the export, and is kept with the project', async ({ page }) => {
    await openTool(page);
    await setText(page, `${MIX_STATED}\n* A`);
    await page.locator('#advancedOptions > summary').click();
    const before = await page.evaluate(() => window.SankeyDiagram.getRenderCount());
    await page.selectOption('#traceStyle', 'line');
    expect(await page.evaluate(() => window.SankeyDiagram.getRenderCount())).toBe(before + 1);
    await expect(page.locator('#diagramHost .sankey-trace-line')).toHaveCount(3);
    await expect(page.locator('#traceTable svg.trace-key')).toHaveCount(2);

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadSvg').click()]);
    const svg = require('fs').readFileSync(await download.path(), 'utf8');
    expect(svg).toContain('Marked lines run through each flow');
    expect(svg).toContain('sankey-trace-mark');

    await page.selectOption('#traceStyle', 'band');
    await expect(page.locator('#diagramHost .sankey-trace-mark')).toHaveCount(0);
    await expect(page.locator('#traceTable svg.trace-key')).toHaveCount(0);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.SankeyDiagram && window.SankeyDiagram.getModel()))).toBe(true);
    await expect(page.locator('#traceStyle')).toHaveValue('band');
  });

  test('the trace table fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openTool(page);
    await setText(page, `${MIX}\n* A`);
    await expect(page.locator('#traceCard')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
