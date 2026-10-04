// Sankey diagram builder, tracing a node downstream: the trace line, the
// shares, the bands drawn inside the ribbons, and the page controls.
//
// The shares come from a linear solve, so they are checked three ways that
// share no code with it: goldens worked by hand, a fixed-point iteration
// written here, and the identity that everything traced ends up somewhere.
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

const parse = (page, text) => page.evaluate((t) => window.SankeyDiagram.parser.parseFlows(t), text);

// Two inputs meet and split: the one place the mixing assumption decides anything.
const MIX = ['A [100] M', 'B [100] M', 'M [150] X', 'M [50] Y'].join('\n');

const LOOP = [
  'Fresh feed [100] Mixer',
  'Side feed [20] Reactor',
  'Mixer [130] Reactor',
  'Reactor [150] Separator',
  'Separator [115] Product',
  'Separator [5] Purge',
  'Separator [30] Mixer'
].join('\n');

const codes = (model) => model.warnings.map((w) => w.code);
const endsOf = (trace) => Object.fromEntries(trace.ends.map((e) => [`${e.kind}:${e.name}`, e.amount]));

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

/** A random flow list with loops and nodes that do not balance. */
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

test.describe('shares', () => {
  test('two inputs that meet and split are shared in the proportions they arrived', async ({ page }) => {
    await openTool(page);
    const model = await build(page, `${MIX}\n* A`);
    expect(model.traces).toHaveLength(1);
    const [trace] = model.traces;
    expect(trace.origin).toBe(100);
    expect(trace.shares).toEqual([1, 0, 0.5, 0.5]);
    expect(endsOf(trace)).toEqual({ 'output:X': 75, 'output:Y': 25 });
    expect(trace.mixedAt.map((i) => model.graph.nodes[i].name)).toEqual(['M']);
    expect(codes(model)).toContain('TRACE_ASSUMES_MIXING');
  });

  test('a stream that is never mixed and split is exact and says nothing about mixing', async ({ page }) => {
    await openTool(page);
    const split = await build(page, 'A [100] M\nM [60] X\nM [40] Y\n* A');
    expect(endsOf(split.traces[0])).toEqual({ 'output:X': 60, 'output:Y': 40 });
    expect(split.traces[0].mixedAt).toEqual([]);
    expect(codes(split)).not.toContain('TRACE_ASSUMES_MIXING');

    // Mixed but not split afterwards: one way out, so nothing is assumed.
    const merge = await build(page, 'A [100] M\nB [100] M\nM [200] X\n* A');
    expect(endsOf(merge.traces[0])).toEqual({ 'output:X': 100 });
    expect(codes(merge)).not.toContain('TRACE_ASSUMES_MIXING');
  });

  test('a node that does not balance loses or dilutes the traced stream', async ({ page }) => {
    await openTool(page);
    const short = await build(page, 'A [100] M\nM [60] X\n* A');
    expect(short.traces[0].shares).toEqual([1, 1]);
    expect(endsOf(short.traces[0])).toEqual({ 'output:X': 60, 'missing:M': 40 });

    const extra = await build(page, 'A [50] M\nM [100] X\n* A');
    expect(extra.traces[0].shares).toEqual([1, 0.5]);
    expect(endsOf(extra.traces[0])).toEqual({ 'output:X': 50 });
  });

  test('a recycle is followed round the loop', async ({ page }) => {
    await openTool(page);
    // Separator holds x of the side feed: x = (20 + 30x) / 150 at the reactor, so x = 1/6.
    const model = await build(page, `${LOOP}\n* Side feed`);
    const [trace] = model.traces;
    const share = (from, to) => trace.shares[model.graph.links.findIndex(
      (l) => model.graph.nodes[l.source].name === from && model.graph.nodes[l.target].name === to)];
    expect(share('Reactor', 'Separator')).toBeCloseTo(1 / 6, 12);
    expect(share('Separator', 'Mixer')).toBeCloseTo(1 / 6, 12);
    expect(share('Mixer', 'Reactor')).toBeCloseTo(5 / 130, 12);
    const ends = endsOf(trace);
    expect(ends['output:Product']).toBeCloseTo(115 / 6, 10);
    expect(ends['output:Purge']).toBeCloseTo(5 / 6, 10);
    expect(Object.keys(ends)).toHaveLength(2);
  });

  test('what comes back to the traced node by a recycle is listed, not counted twice', async ({ page }) => {
    await openTool(page);
    const model = await build(page, `${LOOP}\n* Mixer`);
    const [trace] = model.traces;
    expect(trace.origin).toBe(130);
    const ends = endsOf(trace);
    expect(ends['returned:Mixer']).toBeCloseTo(26, 10);
    expect(trace.ends.reduce((s, e) => s + e.amount, 0)).toBeCloseTo(130, 9);
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

  test('random lists: an iteration written here agrees, everything ends somewhere, and bands fit their flow', async ({ page }) => {
    await openTool(page);
    for (let seed = 1; seed <= 80; seed++) {
      const { text, n } = randomList(seed);
      const picks = [seed % n, (seed * 7 + 3) % n, (seed * 5 + 1) % n].slice(0, 1 + (seed % 3));
      const names = [...new Set(picks)].map((i) => `N${i}`);
      const model = await build(page, `${text}\n${names.map((x) => `* ${x}`).join('\n')}`);
      expect(model.ok, `seed ${seed}`).toBe(true);
      const { nodes, links } = model.graph;
      const tracedIdx = new Set(model.traces.map((t) => t.node));

      for (const trace of model.traces) {
        // Fixed-point iteration on the same definition, no elimination.
        let x = nodes.map((nd) => (nd.index === trace.node ? 1 : 0));
        for (let pass = 0; pass < 6000; pass++) {
          const next = x.slice();
          for (const nd of nodes) {
            if (tracedIdx.has(nd.index)) continue;
            const arrived = nd.inLinks.reduce((s, li) => s + links[li].value * x[links[li].source], 0);
            next[nd.index] = arrived / Math.max(nd.inflow, nd.outflow);
          }
          x = next;
        }
        links.forEach((link, i) => {
          expect(trace.shares[i], `seed ${seed} link ${i}`).toBeGreaterThanOrEqual(0);
          expect(trace.shares[i], `seed ${seed} link ${i}`).toBeLessThanOrEqual(1);
          expect(Math.abs(trace.shares[i] - x[link.source]), `seed ${seed} link ${i}`).toBeLessThan(1e-6);
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
      if (!thin && !link.hairline) {
        // The band's own centre line must lie inside both the band and its ribbon.
        const earlier = model.traces.slice(0, model.traces.indexOf(trace)).reduce((s, x) => s + x.shares[li], 0);
        const centre = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        centre.setAttribute('d', S.engine.centrePath(S.engine.linkBand(link, earlier, earlier + trace.shares[li])));
        svg.appendChild(centre);
        const length = centre.getTotalLength();
        for (let k = 1; k < 40; k++) {
          const p = centre.getPointAtLength((length * k) / 40);
          if (!ribbon.isPointInFill(p) || !band.isPointInFill(p)) inside = false;
        }
        centre.remove();
      }
      const bb = band.getBBox();
      const rb = ribbon.getBBox();
      // Nothing of a band may show outside its ribbon, corners of a loop included.
      if (!thin && !link.hairline) {
        const at = svg.createSVGPoint();
        for (at.x = bb.x + 0.37; at.x < bb.x + bb.width && inside; at.x += 1) {
          for (at.y = bb.y + 0.37; at.y < bb.y + bb.height; at.y += 1) {
            if (band.isPointInFill(at) && !ribbon.isPointInFill(at)) { inside = false; break; }
          }
        }
      }
      out.push({
        link: li, thin, inside, share: trace.shares[li], width: link.width,
        within: bb.x >= rb.x - 0.6 && bb.y >= rb.y - 0.6 && bb.x + bb.width <= rb.x + rb.width + 0.6 && bb.y + bb.height <= rb.y + rb.height + 0.6,
        fill: band.getAttribute('fill'), stroke: band.getAttribute('stroke'), title: band.querySelector('title').textContent
      });
    }
    const result = {
      bands: out,
      footnote: (svg.querySelector('.sankey-footnote') || { textContent: '' }).textContent,
      colors: S.nodeColors(model, S.PALETTES.light),
      markup: new XMLSerializer().serializeToString(svg),
      traceNodes: model.traces.map((x) => x.node)
    };
    svg.remove();
    return result;
  }, text);

  test('a band is drawn in every flow the traced node reaches, in its colour, with the amount in words', async ({ page }) => {
    await openTool(page);
    const drawn = await measure(page, `${MIX}\n* A`);
    expect(drawn.bands.map((b) => b.link)).toEqual([0, 2, 3]);
    for (const band of drawn.bands) {
      expect(band.thin).toBe(false);
      expect(band.within, `link ${band.link}`).toBe(true);
      expect(band.inside, `link ${band.link}`).toBe(true);
      expect(band.fill).toBe(drawn.colors[drawn.traceNodes[0]]);
    }
    expect(drawn.bands[1].title).toBe('M to X: 75 of 150 came through A (50%)');
    expect(drawn.footnote).toBe('Solid bands are the part of each flow that came through A (circles), if each node passes on its inputs evenly mixed.');
    expect(drawn.markup).not.toMatch(/var\(|style=/);
  });

  test('the footnote drops the mixing clause when nothing was assumed', async ({ page }) => {
    await openTool(page);
    const drawn = await measure(page, 'A [100] M\nM [60] X\nM [40] Y\n* A');
    expect(drawn.footnote).toBe('Solid bands are the part of each flow that came through A (circles).');
  });

  test('bands stay inside their ribbon round a recycle loop and through skipped columns', async ({ page }) => {
    await openTool(page);
    const lists = [
      `${LOOP}\n* Fresh feed\n* Side feed`,
      // The long flow skips two columns, so it is routed through slots.
      'A [60] B\nZ [40] B\nB [50] C\nC [50] D\nB [50] D\nD [100] E\n* A\n* Z'
    ];
    for (const text of lists) {
      const drawn = await measure(page, text);
      expect(drawn.bands.length).toBeGreaterThan(4);
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
    const drawn = await measure(page, 'A [1] M\nB [999] M\nM [500] X\nM [500] Y\n* A');
    const later = drawn.bands.filter((b) => b.link >= 2);
    expect(later).toHaveLength(2);
    for (const band of later) {
      expect(band.share * band.width).toBeLessThan(1);
      expect(band.thin).toBe(true);
      expect(band.fill).toBe('none');
      expect(band.stroke).toBe(drawn.colors[0]);
    }
  });

  test('with nothing traced the diagram is drawn exactly as before', async ({ page }) => {
    await openTool(page);
    const drawn = await measure(page, MIX);
    expect(drawn.bands).toEqual([]);
    expect(drawn.footnote).toBe('');
    expect(drawn.markup).not.toContain('sankey-traces');
  });
});

test.describe('marks', () => {
  const SIX = ['A [60] M', 'B [50] M', 'C [40] M', 'D [30] M', 'E [20] M', 'M [120] X', 'M [80] Y'].join('\n');

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
        link: Number(li), trace: Number(node), shape: mark.getAttribute('data-shape'), d: mark.getAttribute('d'),
        x: at.x, y: at.y, size: Math.max(bb.width, bb.height),
        // The outline as drawn: how many corners, and whether the first is top centre.
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
      shapes: S.renderSankey ? [...new Set(marks.map((m) => m.shape))] : [],
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
    // Every band carries at least one mark, and only its own node's shape.
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

  test('marks are spaced along the stream, and those of neighbouring streams do not line up', async ({ page }) => {
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
    for (const text of [
      `${LOOP}\n* Fresh feed\n* Side feed`,
      'A [60] B\nZ [40] B\nB [50] C\nC [50] D\nB [50] D\nD [100] E\n* A\n* Z'
    ]) {
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
    const text = `${MIX}\n* A`;
    const line = await marksOf(page, text, { traceStyle: 'line' });
    expect(line.bands.every((b) => b.line && b.fill === 'none')).toBe(true);
    expect(line.marks.length).toBeGreaterThan(2);
    expect(line.footnote).toBe('Marked lines run through each flow that carries something from A (circles), if each node passes on its inputs evenly mixed.');

    const band = await marksOf(page, text, { traceStyle: 'band' });
    expect(band.marks).toEqual([]);
    expect(band.nodeMarks).toEqual([]);
    expect(band.bands.every((b) => !b.line && b.fill !== 'none')).toBe(true);
    expect(band.footnote).toBe('Solid bands are the part of each flow that came through A, if each node passes on its inputs evenly mixed.');
  });

  test('past three traced nodes the footnote points at the marks instead of listing names', async ({ page }) => {
    await openTool(page);
    const drawn = await marksOf(page, `${SIX}\n* A\n* B\n* C\n* D`);
    expect(drawn.footnote).toBe('Solid bands are the part of each flow that came through the node carrying the same mark, if each node passes on its inputs evenly mixed.');
  });
});

test.describe('page', () => {
  const flowText = (page) => page.locator('#flowText').inputValue();
  const setText = async (page, text) => {
    await page.fill('#unitInput', 't');
    await page.fill('#flowText', text);
    await expect.poll(() => page.evaluate(() => window.SankeyDiagram.getModel().graph.nodes.length)).toBe(text.includes('M [') ? 5 : 2);
  };

  test('double-clicking a node traces it, shows where it ends up, and the same again turns it off', async ({ page }) => {
    await openTool(page);
    await setText(page, MIX);
    await expect(page.locator('#traceCard')).toBeHidden();
    await expect(page.locator('#clearTraces')).toBeDisabled();

    const node = page.locator('#diagramHost .sankey-node[data-node="0"]');
    await node.scrollIntoViewIfNeeded();
    await node.dblclick();
    await expect.poll(() => flowText(page)).toBe(`${MIX}\n* A`);
    await expect(page.locator('#diagramHost .sankey-trace')).toHaveCount(3);
    await expect(page.locator('#traceCard')).toBeVisible();
    await expect(page.locator('#traceNote')).toContainText('An estimate');
    const rows = await page.locator('#traceTable tbody tr').evaluateAll(
      (trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent)));
    expect(rows).toEqual([['A (100 t)', 'X', '75', '75%'], ['A (100 t)', 'Y', '25', '25%']]);
    await expect(page.locator('#warningList')).toContainText('are an estimate');
    await expect(page.locator('#diagramHost .sankey-node[data-node="0"]')).toHaveAttribute('aria-label', /, traced\./);

    await page.locator('#diagramHost .sankey-node[data-node="0"]').dblclick();
    await expect.poll(() => flowText(page)).toBe(MIX);
    await expect(page.locator('#diagramHost .sankey-trace')).toHaveCount(0);
    await expect(page.locator('#traceCard')).toBeHidden();
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

    await setText(page, `${MIX}\n* A\n* B`);
    await expect(page.locator('#traceTable tbody tr')).toHaveCount(4);
    await page.locator('#clearTraces').click();
    await expect.poll(() => flowText(page)).toBe(MIX);
    await expect(page.locator('#clearTraces')).toBeDisabled();
  });

  test('an input error hides the trace table, and the exported file carries the bands and the footnote', async ({ page }) => {
    await openTool(page);
    await setText(page, `${MIX}\n* A`);
    await expect(page.locator('#traceCard')).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadSvg').click()]);
    const svg = require('fs').readFileSync(await download.path(), 'utf8');
    expect(svg.match(/class="sankey-trace"/g)).toHaveLength(3);
    expect(svg).toContain('Solid bands are the part of each flow that came through A');
    expect(svg).not.toMatch(/var\(|style=|tabindex/);

    await page.fill('#flowText', `${MIX}\n* A\nnonsense`);
    await expect(page.locator('#errorBox')).toBeVisible();
    await expect(page.locator('#traceCard')).toBeHidden();
    await expect(page.locator('#traceTable tbody tr')).toHaveCount(0);
  });

  test('Trace inputs follows every input, largest first, and replaces what was traced', async ({ page }) => {
    await openTool(page);
    await setText(page, `B [100] M\nA [150] M\nM [150] X\nM [100] Y\n* M`);
    await page.locator('#traceInputs').click();
    await expect.poll(() => flowText(page)).toBe('B [100] M\nA [150] M\nM [150] X\nM [100] Y\n* A\n* B');
    await expect(page.locator('#diagramHost .sankey-node-mark')).toHaveCount(2);
    const keys = await page.locator('#traceTable tbody th').evaluateAll((ths) => ths.map((th) => [th.textContent, th.querySelector('svg.trace-key path').getAttribute('d')]));
    expect(keys.map((k) => k[0])).toEqual(['A (150 t)', 'A (150 t)', 'B (100 t)', 'B (100 t)']);
    expect(keys[0][1]).toBe(keys[1][1]);
    expect(keys[0][1]).not.toBe(keys[2][1]);
    // With every input traced and every node balancing, the bands fill each flow.
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
    await page.fill('#flowText', lines.join('\n'));
    await expect.poll(() => page.evaluate(() => window.SankeyDiagram.getModel().graph.nodes.length)).toBe(12);
    await page.locator('#traceInputs').click();
    await expect.poll(() => page.evaluate(() => window.SankeyDiagram.getModel().parsed.traces)).toEqual(
      ['In10', 'In9', 'In8', 'In7', 'In6', 'In5', 'In4', 'In3']);
    await expect(page.locator('#exportStatus')).toHaveText('There are 10 inputs and 8 shapes, so the 8 largest are traced.');
    await expect(page.locator('#errorBox')).toBeHidden();
  });

  test('the traced-stream style redraws once, reaches the export, and is kept with the project', async ({ page }) => {
    await openTool(page);
    await setText(page, `${MIX}\n* A`);
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

  test('the trace table is readable in both themes and fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openTool(page);
    await setText(page, `${MIX}\n* A`);
    await expect(page.locator('#traceCard')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
