// Process flow mapper layout and routing, lanes across, driven through
// window.ProcessFlowMapper. A layout has no external reference, so this rests
// on goldens worked by hand and invariants swept over the examples and seeded
// random maps. Lanes down the page are in process-flow-mapper-views.spec.cjs.
//
// The page runs script-src 'self' with no unsafe-eval, so page.waitForFunction
// is CSP-blocked and expect.poll is used instead.

const { test, expect } = require('@playwright/test');

const PAGE = '/tools/process-flow-mapper.html';

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.ProcessFlowMapper && window.ProcessFlowMapper.getModel()))).toBe(true);
}

const build = (page, text, settings = {}) => page.evaluate(([t, s]) => window.ProcessFlowMapper.buildModel(t, s), [text, settings]);
const preset = (page, id) => page.evaluate((i) => window.ProcessFlowMapper.PRESETS.find((p) => p.id === i).text, id);

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
    expect(result.maps).toBe(78);
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
