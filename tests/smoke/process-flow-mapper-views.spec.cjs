// Process flow mapper, Phase 3 on the page: lanes running down, the spread of
// lead time, work done at the same time, the SIPOC table, Mermaid text and
// the one-page print layout. The pure layers behind them are in
// process-flow-mapper-sim.spec.cjs.
//
// The page runs script-src 'self' with no unsafe-eval, so page.waitForFunction
// is CSP-blocked and expect.poll is used instead.

const { test, expect } = require('@playwright/test');
const { expectContrastAA, readDownloadText } = require('./helpers.cjs');

const PAGE = '/tools/process-flow-mapper.html';
const STORAGE_KEY = 'processFlowMapper.projects.v1';

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.ProcessFlowMapper && window.ProcessFlowMapper.getModel()))).toBe(true);
}

// Typing is debounced, so wait for the redraw the new text causes.
async function type(page, text) {
  const before = await page.evaluate(() => window.ProcessFlowMapper.getRenderCount());
  await page.fill('#flowText', text);
  await expect.poll(() => page.evaluate(() => window.ProcessFlowMapper.getRenderCount())).toBeGreaterThan(before);
}

const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const layoutOf = (page) => page.evaluate(() => {
  const { layout } = window.ProcessFlowMapper.getModel();
  return { direction: layout.direction, width: layout.width, height: layout.height };
});
const laneOf = (page, step) => page.evaluate((name) => {
  const m = window.ProcessFlowMapper.getModel();
  return m.graph.lanes[m.graph.nodes.find((n) => n.name === name).lane].name;
}, step);
const spreadStat = (page, key) => page.locator(`#spreadStats [data-stat="${key}"] .stat-value`);

// Overlaps between what is drawn, read from the real elements.
const clashes = (page) => page.evaluate(async () => {
  await document.fonts.ready;
  const svg = document.querySelector('#diagramHost svg');
  const box = (el) => { const b = el.getBBox(); return { x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height, name: el.textContent.slice(0, 24) }; };
  const hit = (a, b) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
  const width = svg.viewBox.baseVal.width;
  const labels = [...svg.querySelectorAll('.flow-link-label')].map(box);
  const shapes = [...svg.querySelectorAll('.flow-step-shape')].map(box);
  const heads = [...svg.querySelectorAll('.flow-lane-label, .flow-phase-label')].map(box);
  const out = [];
  labels.forEach((l, i) => {
    for (const s of shapes) if (hit(l, s)) out.push(`label "${l.name}" on a step`);
    for (const h of heads) if (hit(l, h)) out.push(`label "${l.name}" on the heading "${h.name}"`);
    for (let j = i + 1; j < labels.length; j++) if (hit(l, labels[j])) out.push(`labels "${l.name}" and "${labels[j].name}"`);
    if (l.x0 < 0 || l.x1 > width) out.push(`label "${l.name}" off the map`);
  });
  for (const h of heads) {
    for (const s of shapes) if (hit(h, s)) out.push(`heading "${h.name}" on a step`);
    if (h.x0 < 0 || h.x1 > width) out.push(`heading "${h.name}" off the map`);
  }
  for (const g of svg.querySelectorAll('.flow-step')) {
    const t = box(g.querySelector('.flow-step-label'));
    const s = box(g.querySelector('.flow-step-shape'));
    if (t.x0 < s.x0 - 0.5 || t.x1 > s.x1 + 0.5 || t.y0 < s.y0 - 0.5 || t.y1 > s.y1 + 0.5) out.push(`text of "${t.name}" spills out of its step`);
  }
  for (const cls of ['.flow-title', '.flow-summary', '.flow-footnote', '.flow-legend']) {
    const el = svg.querySelector(cls);
    if (el && box(el).x1 > width + 0.5) out.push(`${cls} runs off the map`);
  }
  return out;
});

const SPLIT = [
  'A: (Start) -> Split',
  'A: Split {1 h} => Left, Right',
  'A: Left {2 h} -> Join',
  'B: Right {3 h, wait 1 h} -> Join',
  'A: Join {1 h} -> (End)',
  'A: (End)'
].join('\n');

test.describe('lanes running down the page', () => {
  test('the layout invariants hold with lanes down, on the examples and on seeded random maps', async ({ page }) => {
    test.setTimeout(120000);
    await openTool(page);
    const result = await page.evaluate(() => {
      const S = window.ProcessFlowMapper;
      let seed = 8128;
      const rnd = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const maps = S.PRESETS.map((p) => ({ name: p.id, text: p.text }));
      for (let g = 0; g < 60; g++) {
        const n = 3 + Math.floor(rnd() * 16);
        const lanes = 1 + Math.floor(rnd() * 5);
        const lines = [];
        const phased = g % 3 === 0;
        const names = Array.from({ length: n }, (_, i) => `S${i}${rnd() < 0.2 ? '?' : ''}${rnd() < 0.1 ? ' with a longer name to wrap' : ''}`);
        for (let i = 0; i < n; i++) {
          if (phased && i % 4 === 0) lines.push(`== Phase ${i / 4} ==`);
          const exits = [];
          for (let j = 0; j < n; j++) {
            if (j === i) continue;
            const chance = j === i + 1 ? 0.8 : (j > i ? 0.12 : 0.08);
            if (rnd() >= chance) continue;
            const prefix = [rnd() < 0.5 ? (rnd() < 0.3 ? 'a much longer label' : 'way') : '', rnd() < 0.5 ? '30%' : '', rnd() < 0.2 ? '{2 h}' : ''].filter(Boolean).join(' ');
            exits.push(prefix ? `${prefix}: ${names[j]}` : names[j]);
          }
          lines.push(`Lane ${Math.floor(rnd() * lanes)}: ${names[i]} {${1 + Math.floor(rnd() * 30)} min}${exits.length ? ` -> ${exits.join(', ')}` : ''}`);
        }
        maps.push({ name: `random${g}`, text: lines.join('\n') });
      }

      const EPS = 1e-6;
      const problems = [];
      let connectors = 0;
      let labelsSeen = 0;
      let clipped = 0;
      let narrower = 0;
      for (const map of maps) {
        const m = S.buildModel(map.text, { title: 'T', direction: 'down' }, S.measure);
        const fail = (msg) => problems.push(`${map.name}: ${msg}`);
        if (!m.ok) { fail(`did not build: ${m.errors.map((e) => e.code).join(',')}`); continue; }
        const { layout, graph } = m;
        const { steps, area } = layout;
        if (layout.direction !== 'down') fail('is not laid out downwards');
        const flat = S.buildModel(map.text, { title: 'T' }, S.measure).layout;
        if (layout.width < flat.width) narrower += 1;
        // The grid is the same one, turned.
        steps.forEach((s, i) => { if (s.col !== flat.steps[i].col || s.row !== flat.steps[i].row) fail(`${s.name} changed cell`); });

        for (let a = 0; a < steps.length; a++) {
          const s = steps[a];
          if (Math.abs((s.x1 - s.x0) - layout.boxWidth) > EPS || Math.abs((s.y1 - s.y0) - layout.boxHeight) > EPS) fail(`${s.name} is not the common size`);
          const lane = layout.lanes[s.lane];
          if (s.x0 < lane.x0 - EPS || s.x1 > lane.x1 + EPS) fail(`${s.name} is outside its lane`);
          if (s.y0 < area.top - EPS || s.y1 > area.bottom + EPS) fail(`${s.name} is outside the map`);
          const band = layout.phases.find((p) => p.index === s.phase);
          if (band && (s.y0 < band.y0 - EPS || s.y1 > band.y1 + EPS)) fail(`${s.name} is outside its phase`);
          for (let b = a + 1; b < steps.length; b++) {
            const o = steps[b];
            if (s.x0 < o.x1 - EPS && o.x0 < s.x1 - EPS && s.y0 < o.y1 - EPS && o.y0 < s.y1 - EPS) fail(`${s.name} and ${o.name} overlap`);
            // Work flows down: a later column is lower on the page.
            if (o.col > s.col && o.y0 < s.y1 - EPS) fail(`${o.name} is not below ${s.name}`);
          }
        }
        for (let i = 1; i < layout.lanes.length; i++) {
          if (Math.abs(layout.lanes[i].x0 - layout.lanes[i - 1].x1) > EPS) fail('lanes do not tile');
        }
        if (layout.width < area.right - EPS) fail('the map is wider than its picture');

        const segments = [];
        for (const c of layout.connectors) {
          connectors += 1;
          const s = steps[c.source];
          const t = steps[c.target];
          const first = c.points[0];
          const last = c.points[c.points.length - 1];
          if (Math.abs(first[1] - s.y1) > EPS || Math.abs(first[0] - (s.x0 + s.x1) / 2) > EPS) fail(`connector ${c.index} does not leave the middle of its source's underside`);
          if (last[1] < t.y0 - EPS || last[1] > (t.y0 + t.y1) / 2 + EPS || last[0] < t.x0 - EPS || last[0] > t.x1 + EPS) fail(`connector ${c.index} does not arrive on its target's top side`);
          if (Math.abs(last[1] - S.layouts.topEdge(t, last[0])) > EPS) fail(`connector ${c.index} does not end on its target's outline`);
          if (c.rework !== graph.links[c.index].rework) fail(`connector ${c.index} rework flag differs from the graph`);
          for (let k = 1; k < c.points.length; k++) {
            const [x0, y0] = c.points[k - 1];
            const [x1, y1] = c.points[k];
            if (Math.abs(x0 - x1) > EPS && Math.abs(y0 - y1) > EPS) fail(`connector ${c.index} has a diagonal segment`);
            const seg = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), c, horizontal: Math.abs(y0 - y1) <= EPS };
            segments.push(seg);
            for (const box of steps) {
              if (seg.x1 > box.x0 + 0.5 && seg.x0 < box.x1 - 0.5 && seg.y1 > box.y0 + 0.5 && seg.y0 < box.y1 - 0.5) {
                const own = (box.index === c.target && k === c.points.length - 1);
                if (!own) fail(`connector ${c.index} passes under ${box.name}`);
              }
            }
          }
        }
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

        // Every exit label has its own room: off the steps, off every line, its own included, and off other labels.
        const boxes = [];
        const size = layout.options.fontSize - 1;
        for (const c of layout.connectors) {
          if (!c.labelAt) continue;
          labelsSeen += 1;
          if (c.label !== m.labels[c.index]) {
            clipped += 1;
            if (!c.label.endsWith('…') || !m.labels[c.index].startsWith(c.label.slice(0, -1).trimEnd())) fail(`label of connector ${c.index} was changed, not cut`);
          }
          const w = S.measure(c.label, size, 400);
          const x0 = c.labelAt.anchor === 'end' ? c.labelAt.x - w : c.labelAt.x;
          const box = { x0, x1: x0 + w, y0: c.labelAt.y - size * 0.8, y1: c.labelAt.y + 2, c };
          if (box.x0 < 0 || box.x1 > layout.width) fail(`label of connector ${c.index} is off the map`);
          for (const s of steps) {
            if (box.x1 > s.x0 + 0.5 && box.x0 < s.x1 - 0.5 && box.y1 > s.y0 + 0.5 && box.y0 < s.y1 - 0.5) fail(`label of connector ${c.index} is on ${s.name}`);
          }
          for (const seg of segments) {
            if (box.x1 > seg.x0 + 0.5 && box.x0 < seg.x1 - 0.5 && box.y1 > seg.y0 + 0.5 && box.y0 < seg.y1 - 0.5) fail(`label of connector ${c.index} is on connector ${seg.c.index}`);
          }
          for (const other of boxes) {
            if (box.x1 > other.x0 + 0.5 && box.x0 < other.x1 - 0.5 && box.y1 > other.y0 + 0.5 && box.y0 < other.y1 - 0.5) fail(`labels of connectors ${c.index} and ${other.c.index} overlap`);
          }
          boxes.push(box);
        }

        if (JSON.stringify(S.buildModel(map.text, { title: 'T', direction: 'down' }, S.measure).layout) !== JSON.stringify(layout)) fail('layout is not deterministic');
      }
      return { problems: problems.slice(0, 25), total: problems.length, maps: maps.length, connectors, labelsSeen, clipped, narrower };
    });
    expect(result.maps).toBe(68);
    expect(result.connectors).toBeGreaterThan(400);
    expect(result.labelsSeen).toBeGreaterThan(250);
    // The sweep includes labels too long for their column, which are cut and never spill.
    expect(result.clipped).toBeGreaterThan(10);
    expect(result.narrower).toBeGreaterThan(40);
    expect(result.problems).toEqual([]);
  });

  test('work arriving from above meets the outline of a box, a rounded end and a six-sided decision', async ({ page }) => {
    await openTool(page);
    const edge = await page.evaluate(() => {
      const { topEdge } = window.ProcessFlowMapper.layouts;
      const at = (kind, x) => topEdge({ kind, x0: 0, x1: 100, y0: 0, y1: 60 }, x);
      return {
        task: [at('task', 5), at('task', 50)],
        // A pill: flat between the two end circles of radius 30, then round.
        terminator: [at('terminator', 50), at('terminator', 30), at('terminator', 5), at('terminator', 95), at('terminator', 0)],
        // Six sides: flat between the cuts 16 in from each end, then a slope down to the point.
        decision: [at('decision', 50), at('decision', 16), at('decision', 5), at('decision', 100)]
      };
    });
    expect(edge.task).toEqual([0, 0]);
    expect(edge.terminator[0]).toBe(0);
    expect(edge.terminator[1]).toBe(0);
    expect(edge.terminator[2]).toBeCloseTo(30 - Math.sqrt(900 - 625), 10);
    expect(edge.terminator[3]).toBeCloseTo(30 - Math.sqrt(900 - 625), 10);
    expect(edge.terminator[4]).toBeCloseTo(30, 10);
    expect(edge.decision[0]).toBe(0);
    expect(edge.decision[1]).toBe(0);
    expect(edge.decision[2]).toBeCloseTo(30 * 11 / 16, 10);
    expect(edge.decision[3]).toBeCloseTo(30, 10);
  });

  test('the setting turns the map, makes a long process narrow, and is kept with the project', async ({ page }) => {
    await openTool(page);
    const across = await layoutOf(page);
    expect(across.direction).toBe('across');
    await page.selectOption('#direction', 'down');
    const down = await layoutOf(page);
    expect(down.direction).toBe('down');
    expect(down.width).toBeLessThan(across.width * 0.6);
    expect(down.height).toBeGreaterThan(across.height);

    // Lane names run along the top, phase names down the left.
    const heads = await page.evaluate(() => {
      const box = (el) => { const b = el.getBBox(); return { x: b.x, y: b.y, right: b.x + b.width }; };
      return {
        lanes: [...document.querySelectorAll('#diagramHost .flow-lane-label')].map(box),
        phases: [...document.querySelectorAll('#diagramHost .flow-phase-label')].map(box),
        firstStep: box(document.querySelector('#diagramHost .flow-step-shape'))
      };
    });
    const spreadOf = (values) => Math.max(...values) - Math.min(...values);
    expect(spreadOf(heads.lanes.map((l) => l.y))).toBeLessThan(2);
    expect(heads.lanes.map((l) => l.x)).toEqual([...heads.lanes.map((l) => l.x)].sort((a, b) => a - b));
    expect(heads.lanes[0].y).toBeLessThan(heads.firstStep.y);
    expect(spreadOf(heads.phases.map((p) => p.x))).toBeLessThan(2);
    expect(heads.phases.map((p) => p.y)).toEqual([...heads.phases.map((p) => p.y)].sort((a, b) => a - b));
    for (const p of heads.phases) expect(p.right).toBeLessThan(heads.firstStep.x);
    // The share of lead time and how busy a lane is are still printed.
    await expect(page.locator('#diagramHost .flow-phase-label').first()).toContainText('59%');
    await expect(page.locator('#diagramHost .flow-lane-busy').nth(1)).toHaveText('74% busy');

    // The figures do not depend on which way the map is drawn.
    await expect(page.locator('#headline [data-stat="lead"] .stat-value')).toHaveText('4.09 d');
    expect((await stored(page)).projects[0].draft.fields.direction).toBe('down');
    await page.reload();
    await expect.poll(() => layoutOf(page).then((l) => l.direction)).toBe('down');
    await expect(page.locator('#direction')).toHaveValue('down');
  });

  test('drawn labels, headings and step text keep clear of each other with lanes down, on every example', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#direction', 'down');
    await page.locator('#advancedOptions').evaluate((d) => { d.open = true; });
    await page.selectOption('#zoom', '100');
    let leftward = 0;
    for (const id of ['purchase', 'lab', 'change', 'hiring', 'order', 'incident', 'onboarding', 'claim']) {
      await page.selectOption('#presetSelect', id);
      expect(await clashes(page), id).toEqual([]);
      // A label on a line that heads left ends at its stub instead of starting there.
      const ends = await page.evaluate(() => window.ProcessFlowMapper.getModel().layout.connectors
        .filter((c) => c.labelAt && c.labelAt.anchor === 'end')
        .map((c) => {
          const b = document.querySelector(`#diagramHost .flow-link-label[data-link="${c.index}"]`).getBBox();
          return { right: b.x + b.width, at: c.labelAt.x };
        }));
      for (const end of ends) expect(end.right, id).toBeLessThanOrEqual(end.at + 2);
      leftward += ends.length;
    }
    expect(leftward).toBeGreaterThan(5);
    // The same check with lanes across, for the two examples the page spec does not cover.
    await page.selectOption('#direction', 'across');
    for (const id of ['onboarding', 'claim']) {
      await page.selectOption('#presetSelect', id);
      expect(await clashes(page), id).toEqual([]);
    }
  });

  test('a map narrower than its own title and figures is widened to hold them', async ({ page }) => {
    await openTool(page);
    await page.click('#projectNew');
    await type(page, 'A: (Start) -> Do\nA: Do {1 h, wait 2 d} -> ok 80%: (End), again 20%: Redo\nA: Redo {5 min} -> Do\nA: (End)');
    await page.fill('#titleInput', 'A title long enough to be wider than a map of four small steps in one lane');
    await page.selectOption('#direction', 'down');
    expect(await clashes(page)).toEqual([]);
    const sizes = await page.evaluate(() => {
      const { layout } = window.ProcessFlowMapper.getModel();
      return { width: layout.width, right: layout.area.right };
    });
    expect(sizes.width).toBeGreaterThan(sizes.right + 100);
    await page.selectOption('#direction', 'across');
    expect(await clashes(page)).toEqual([]);
  });

  test('a step is dragged sideways to another lane, and Alt with left or right moves steps and lanes', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#direction', 'down');
    const index = await page.evaluate(() => window.ProcessFlowMapper.getModel().graph.nodes.findIndex((n) => n.name === 'Fill in request'));
    const step = page.locator(`#diagramHost .flow-step[data-node="${index}"]`);
    await step.scrollIntoViewIfNeeded();
    const from = await step.boundingBox();
    const lane = await page.locator('#diagramHost .flow-lane[data-lane="2"]').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(lane.x + lane.width / 2, from.y + from.height / 2, { steps: 8 });
    await expect(page.locator('#diagramHost .flow-lane.drop-target')).toHaveAttribute('data-lane', '2');
    await page.mouse.up();
    expect(await laneOf(page, 'Fill in request')).toBe('Finance');

    await page.locator(`#diagramHost .flow-step[data-node="${index}"]`).focus();
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await laneOf(page, 'Fill in request')).toBe('Manager');
    expect(await page.evaluate(() => document.activeElement.getAttribute('data-node'))).toBe(String(index));
    await page.keyboard.press('Alt+ArrowRight');
    await page.keyboard.press('Alt+ArrowRight');
    expect(await laneOf(page, 'Fill in request')).toBe('Purchasing');
    expect(await page.locator(`#diagramHost .flow-step[data-node="${index}"]`).getAttribute('aria-label')).toContain('hold Alt and press the left or right arrow');

    await page.locator('#diagramHost .flow-lane-label[data-lane="0"]').focus();
    await page.keyboard.press('Alt+ArrowRight');
    expect((await page.inputValue('#flowText')).split('\n')[0]).toBe('lanes: Manager, Requester, Finance, Purchasing');
    // The page did not go back in its history, which is what Alt and left does by default.
    expect(page.url()).toContain('process-flow-mapper.html');
  });
});

test.describe('how long it takes', () => {
  test('the claim example shows a median under the average, a figure to quote, and the histogram behind them', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'claim');
    await expect(page.locator('#spreadCard')).toBeVisible();
    const spread = await page.evaluate(() => window.ProcessFlowMapper.getModel().spread);
    const shown = await page.evaluate(() => {
      const P = window.ProcessFlowMapper;
      const m = P.getModel();
      return ['p50', 'p80', 'p95', 'mean'].map((k) => P.formatDuration(m.spread[k], m.graph.calendar, m.unit));
    });
    await expect(spreadStat(page, 'p50')).toHaveText(shown[0]);
    await expect(spreadStat(page, 'p80')).toHaveText(shown[1]);
    await expect(spreadStat(page, 'p95')).toHaveText(shown[2]);
    await expect(page.locator('#spreadStats .stat-label')).toHaveText(['Half finish within', '8 in 10 within', '19 in 20 within']);
    expect(spread.p50).toBeLessThan(spread.p80);
    expect(spread.p80).toBeLessThan(spread.p95);
    // The headline is the average, 12 days, and the lesson's figures are the ones on the card.
    await expect(page.locator('#headline [data-stat="lead"] .stat-value')).toHaveText('12 d');
    await expect(page.locator('#presetLesson')).toContainText('The average is 12 days, but half of claims are done in under 11');
    expect(shown[0]).toMatch(/^10\.\d d$/);
    expect(shown[2]).toMatch(/^4\.\d+ wk$/);

    const bars = page.locator('#spreadChart .spread-bar');
    await expect(bars).toHaveCount(24);
    const counts = await bars.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-count'))));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(20000);
    const heights = await bars.evaluateAll((els) => els.map((e) => Number(e.getAttribute('height'))));
    expect(Math.max(...heights)).toBe(40);
    expect(heights[counts.indexOf(Math.max(...counts))]).toBe(40);
    await expect(page.locator('#spreadChart svg')).toHaveAttribute('aria-label', /Histogram of lead time from .* to .*\. The last bar holds everything slower\./);
    await expect(page.locator('#spreadNote')).toContainText(`From 20,000 simulated units of work, seed 1. The average is ${shown[3]}.`);
    await expect(page.locator('#spreadNote')).toContainText('A time given as a range is drawn from that range');

    // Where the work ended decides how long it took.
    const head = await page.locator('#endTable thead th').allTextContents();
    expect(head).toEqual(['Ends at', 'Share of work', 'Lane', 'Half within', '9 in 10 within']);
    await expect(page.locator('#endTable tbody tr', { hasText: '(Claim paid)' }).locator('td').nth(2)).toHaveText(/\d d$/);
    // The rework figure counts the chase for documents, and nothing that only rework leads to.
    await expect(page.locator('#resultStatus')).toContainText('Rework adds 2.02 d');
  });

  test('the seed changes the run by a little, is clamped, and is kept with the project', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'claim');
    const first = await page.evaluate(() => window.ProcessFlowMapper.getModel().spread);
    await page.locator('#advancedOptions').evaluate((d) => { d.open = true; });
    await page.fill('#seed', '2');
    await expect.poll(() => page.evaluate(() => window.ProcessFlowMapper.getModel().spread.seed)).toBe(2);
    const second = await page.evaluate(() => window.ProcessFlowMapper.getModel().spread);
    expect(second.mean).not.toBe(first.mean);
    expect(Math.abs(second.mean - first.mean)).toBeLessThan(6 * first.error);
    await expect(page.locator('#spreadNote')).toContainText('seed 2');
    // The average on the headline is solved, not simulated, so it does not move.
    await expect(page.locator('#headline [data-stat="lead"] .stat-value')).toHaveText('12 d');
    expect((await stored(page)).projects[0].draft.fields.seed).toBe('2');
    await page.fill('#seed', '0');
    await page.locator('#seed').blur();
    await expect(page.locator('#seed')).toHaveValue('1');
  });

  test('fixed times with rework say what the spread rests on, a plain chain has none, and no times hide the card', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'lab');
    await expect(page.locator('#spreadCard')).toBeVisible();
    await expect(page.locator('#spreadNote')).toContainText('Every time here is one fixed number, so this is the spread that branching and rework cause on their own');
    await expect(page.locator('#spreadStats .stat')).toHaveCount(3);

    await page.click('#projectNew');
    await type(page, 'A: (Start) -> Work\nA: Work {1 h, wait 2 h} -> (Done)\nA: (Done)');
    await expect(page.locator('#spreadCard')).toBeVisible();
    await expect(page.locator('#spreadStats .stat')).toHaveCount(0);
    await expect(page.locator('#spreadChart svg')).toHaveCount(0);
    await expect(page.locator('#spreadNote')).toContainText('Every unit of work takes 3 h: nothing branches and no time is given as a range');

    await type(page, 'A: (Start) -> Work\nA: Work -> (Done)\nA: (Done)');
    await expect(page.locator('#spreadCard')).toBeHidden();
    // An input error clears it with everything else.
    await type(page, 'A: (Start) -> Work\nA: Work {1 h} -> ok 70%: (Done), again 30%: Redo\nA: Redo -> Work\nA: (Done)');
    await expect(spreadStat(page, 'p80')).toHaveText('2 h');
    await type(page, 'nonsense');
    await expect(page.locator('#spreadCard')).toBeHidden();
    await expect(page.locator('#copyMermaid')).toBeDisabled();
    await expect(page.locator('#printPage')).toBeDisabled();
  });
});

test.describe('work at the same time, SIPOC and waits on the way, on the page', () => {
  test('the new starter example marks its three branches, shows the slack, and fills the SIPOC table', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'onboarding');
    await expect(page.locator('#headline [data-stat="lead"] .stat-value')).toHaveText('6.46 d');
    await expect(page.locator('#headline [data-stat="touch"] .stat-value')).toHaveText('3.16 h');
    await expect(page.locator('#headline [data-stat="touch"] .stat-hint')).toHaveText('all the work, on every branch');
    await expect(page.locator('#resultStatus')).toContainText('along its slowest path, of which 1.24 h is work');
    await expect(page.locator('#resultStatus')).toContainText('Work done at the same time brings the work to 3.16 h in all');

    const plus = page.locator('#diagramHost .flow-link-label', { hasText: /^\+$/ });
    await expect(plus).toHaveCount(3);
    await expect(page.locator('#diagramHost .flow-footnote')).toContainText('+ is work done at the same time.');
    await expect(page.locator('#diagramHost .flow-step', { hasText: 'Book desk' })).toContainText('4.63 d slack');
    await expect(page.locator('#diagramHost .flow-step', { hasText: 'Order laptop' })).toContainText('1.93 d slack');
    await expect(page.locator('#diagramHost .flow-step', { hasText: 'Run checks' })).toContainText('87% of lead time');
    // A step with slack takes none of the lead time, so it is not tinted as if it did.
    const fills = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#diagramHost .flow-step')]
      .map((g) => [g.querySelector('tspan').textContent, g.querySelector('.flow-step-shape').getAttribute('fill')])));
    expect(fills['Run checks']).not.toBe(fills['(First day)']);
    const title = await page.locator('#diagramHost .flow-link[data-link="1"] title').textContent();
    expect(title).toContain('taken together with the other exits of this step');

    await expect(page.locator('#bars .bar-button', { hasText: 'Order laptop' })).toContainText('1.93 d slack, not on the slowest path');
    expect(await page.locator('#stepTable thead th').allTextContents()).toContain('Slack');
    await expect(page.locator('#stepTable tbody tr', { hasText: 'Book desk' }).locator('td').last()).toHaveText('4.63 d');
    await expect(page.locator('#stepTable tbody tr', { hasText: 'Run checks' }).locator('td').last()).toHaveText('');
    await expect(page.locator('#exitTable tbody tr', { hasText: 'Book desk' }).first()).toContainText('all');
    await expect(page.locator('#exitTable tbody tr', { hasText: 'Book desk' }).first()).toContainText('at the same time');

    await expect(page.locator('#sipocBlock')).toBeVisible();
    expect(await page.locator('#sipocTable thead th').allTextContents()).toEqual(['Suppliers', 'Inputs', 'Process', 'Outputs', 'Customers']);
    const rows = page.locator('#sipocTable tbody tr');
    await expect(rows).toHaveCount(3);
    expect(await rows.nth(1).locator('th, td').allTextContents()).toEqual([
      'Referees, Supplier', 'References, Laptop', 'Get ready', 'Cleared checks, Laptop and account, Desk', 'Hiring manager, New starter'
    ]);
    // The phase is the row header, wherever it sits in the row.
    await expect(rows.nth(1).locator('th')).toHaveText('Get ready');
    await expect(rows.nth(1).locator('th')).toHaveAttribute('scope', 'row');

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('.csv-btn[data-table="sipocTable"]')]);
    expect(download.suggestedFilename()).toBe('new-starter-offer-to-first-day-sipoc.csv');
    const csv = await readDownloadText(download);
    expect(csv.split('\r\n')[0]).toBe('Suppliers,Inputs,Process,Outputs,Customers');
    expect(csv.split('\r\n')[3]).toBe('HR,Cleared checks,Start,Start date,New starter');

    // Every example carries its inputs and outputs, with no phase left with a side missing.
    for (const id of ['purchase', 'lab', 'change', 'hiring', 'order', 'incident', 'claim']) {
      await page.selectOption('#presetSelect', id);
      await expect(page.locator('#sipocBlock'), id).toBeVisible();
      const cells = await page.locator('#sipocTable tbody th, #sipocTable tbody td').allTextContents();
      expect(cells.length, id).toBeGreaterThanOrEqual(15);
      expect(cells.filter((c) => c.trim() === ''), id).toEqual([]);
      await expect(page.locator('#warningList'), id).not.toContainText('SIPOC');
    }
    expect(await page.locator('#stepTable thead th').allTextContents()).not.toContain('Slack');
    // No in or out lines, no table.
    await page.click('#projectNew');
    await expect(page.locator('#sipocBlock')).toBeHidden();
    await expect(page.locator('#sipocTable tbody tr')).toHaveCount(0);
  });

  test('branches that never meet draw the map, give no figures and say which step to look at', async ({ page }) => {
    await openTool(page);
    await page.click('#projectNew');
    await type(page, 'A: (Start) -> Split\nA: Split => X, Y\nA: X {1 h} -> (End X)\nA: Y {1 h} -> (End Y)\nA: (End X)\nA: (End Y)');
    await expect(page.locator('#diagramHost .flow-step')).toHaveCount(6);
    await expect(page.locator('#headline .stat')).toHaveCount(0);
    await expect(page.locator('#spreadCard')).toBeHidden();
    await expect(page.locator('#resultStatus')).toHaveText('No figures: work done at the same time does not come back together');
    await expect(page.locator('#warningList')).toContainText('Line 2: The branches leaving "Split" (=>) never meet again at one step');
    // Giving them a step to meet at brings the figures back.
    await type(page, SPLIT);
    await expect(page.locator('#headline [data-stat="lead"] .stat-value')).toHaveText('6 h');
    await expect(page.locator('#headline [data-stat="efficiency"] .stat-value')).toHaveText('83%');
  });

  test('a wait on the way is printed on its connector, listed with the exit, and counted', async ({ page }) => {
    await openTool(page);
    await page.click('#projectNew');
    await type(page, 'A: (Start) -> Pack\nA: Pack {10 min} -> post 75% {1-3 d}: (Delivered), collect 25%: (Collected)\nA: (Delivered)\nA: (Collected)');
    await expect(page.locator('#diagramHost .flow-link-label', { hasText: 'post 75%' })).toHaveText('post 75% · ~2 d');
    await expect(page.locator('#diagramHost .flow-footnote')).toContainText('~ is the average of a range.');
    expect(await page.locator('#exitTable thead th').allTextContents()).toContain('Wait on the way');
    await expect(page.locator('#exitTable tbody tr', { hasText: '(Delivered)' })).toContainText('2 d');
    // 10 minutes of work and three quarters of two days on the way.
    await expect(page.locator('#headline [data-stat="lead"] .stat-value')).toHaveText('1.52 d');
    const title = await page.locator('#diagramHost .flow-link[data-link="1"] title').textContent();
    expect(title).toContain('2 d on the way');
    await expect(page.locator('#syntaxHelp')).toContainText('A wait on the way to the next step');
  });
});

test.describe('Mermaid and printing', () => {
  test('toMermaid writes lanes as subgraphs, shapes by kind, and arrows by what the exit is', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate((text) => {
      const P = window.ProcessFlowMapper;
      const withLoop = `${text}\nB: Odd "name" <b> #1 {5 min} -> yes 60%: (End), no 40%: Split`;
      return {
        split: P.toMermaid(P.buildModel(text), 'My  process'),
        down: P.toMermaid(P.buildModel(text, { direction: 'down' })).split('\n')[0],
        odd: P.toMermaid(P.buildModel(withLoop.replace('A: Join {1 h} -> (End)', 'A: Join {1 h} -> Odd "name" <b> #1')))
      };
    }, SPLIT);
    expect(out.split).toBe([
      '%% My process',
      'flowchart LR',
      '    subgraph lane0["A"]',
      '        s0(["Start"])',
      '        s1["Split<br/>1 h"]',
      '        s2["Left<br/>2 h"]',
      '        s4["Join<br/>1 h"]',
      '        s5(["End"])',
      '    end',
      '    subgraph lane1["B"]',
      '        s3["Right<br/>3 h + wait 1 h"]',
      '    end',
      '    s0 --> s1',
      '    s1 ==>|"+"| s2',
      '    s1 ==>|"+"| s3',
      '    s2 --> s4',
      '    s3 --> s4',
      '    s4 --> s5',
      ''
    ].join('\n'));
    expect(out.down).toBe('flowchart TB');
    // Quotes, angle brackets and the hash would end the label or be read as markup.
    expect(out.odd).toContain('s6["Odd #quot;name#quot; #lt;b#gt; #35;1<br/>5 min"]');
    expect(out.odd).toContain('s6 -->|"yes 60%"| s5');
    expect(out.odd).toContain('s6 -.->|"no 40%"| s1');
    expect(out.odd).not.toMatch(/"[^"\n]*"[^"\n]*"[^\]\n|]*"\]/);
  });

  test('Copy Mermaid puts the text on the clipboard, and saves a file when the clipboard is refused', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openTool(page);
    await page.click('#copyMermaid');
    await expect(page.locator('#exportStatus')).toContainText('Copied the map as Mermaid text');
    // The system clipboard may hand the text back with its own line endings.
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).split('\n').map((line) => line.trimEnd()).join('\n');
    expect(copied.split('\n').slice(0, 3)).toEqual(['%% Purchase request', 'flowchart LR', '    subgraph lane0["Requester"]']);
    expect(copied).toContain('{{"Approve request?<br/>5 min + wait 2 d"}}');
    expect(copied).toContain('-.->|"fix 15%"|');

    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('refused')); });
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#copyMermaid')]);
    expect(download.suggestedFilename()).toBe('purchase-request.mmd');
    expect(await readDownloadText(download)).toBe(copied);
    await expect(page.locator('#exportStatus')).toContainText('saved as purchase-request.mmd');
  });

  test('printing shows the result without the editor, in the light colours, and puts the theme back', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'onboarding');
    await page.locator('[data-theme-toggle="dark"]').click();
    await expect(page.locator('#diagramHost rect.flow-bg')).toHaveAttribute('fill', '#18181b');

    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
    await page.click('#printPage');
    expect(await page.evaluate(() => window.__printed)).toBe(1);

    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('#diagramHost rect.flow-bg')).toHaveAttribute('fill', '#ffffff');
    await page.emulateMedia({ media: 'print' });
    for (const hidden of ['.editor-panel', '#scopeDisclaimer', '#downloadPng', '#printPage', '.csv-btn', 'footer']) {
      await expect(page.locator(hidden).first(), hidden).toBeHidden();
    }
    for (const shown of ['#headline', '#resultStatus', '#diagramHost svg', '#spreadCard', '#sipocTable', '#laneTable', '.diagram-panel p.disclaimer']) {
      await expect(page.locator(shown).first(), shown).toBeVisible();
    }
    // The whole map is on the page, not cut off by a scrolling box.
    const fit = await page.evaluate(() => {
      const svg = document.querySelector('#diagramHost svg').getBoundingClientRect();
      return { right: svg.right, page: document.documentElement.clientWidth, overflow: getComputedStyle(document.getElementById('diagramScroll')).overflowX };
    });
    expect(fit.right).toBeLessThanOrEqual(fit.page + 1);
    expect(fit.overflow).toBe('visible');

    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#diagramHost rect.flow-bg')).toHaveAttribute('fill', '#18181b');
    // A second afterprint with nothing to restore changes nothing.
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('page checks for the Phase 3 parts', () => {
  test('new controls are named, the new text clears AA in both themes, and nothing overflows down to a phone', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'onboarding');
    await page.selectOption('#direction', 'down');
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('main input, main select, main textarea, main button')]
      .filter((el) => !(el.labels && el.labels.length) && !el.getAttribute('aria-label') && !el.textContent.trim())
      .map((el) => el.id || el.outerHTML.slice(0, 60)));
    expect(unnamed).toEqual([]);
    for (const id of ['#copyMermaid', '#printPage']) {
      expect((await page.locator(id).boundingBox()).height, id).toBeGreaterThanOrEqual(44);
    }
    await expectContrastAA(page, '#spreadCard h3, #spreadStats .stat-label, #spreadStats .stat-value, #spreadStats .stat-hint, .spread-axis span, #spreadNote, #sipocTable th, #sipocTable td, #directionHelp');
    for (const width of [1280, 1100, 900, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test('a select renders once, and the strict CSP is not violated by anything Phase 3 does', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const consoleHits = [];
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) consoleHits.push(m.text());
    });
    await openTool(page);
    const before = await page.evaluate(() => window.ProcessFlowMapper.getRenderCount());
    await page.selectOption('#direction', 'down');
    expect(await page.evaluate(() => window.ProcessFlowMapper.getRenderCount()) - before).toBe(1);

    for (const id of ['onboarding', 'claim']) await page.selectOption('#presetSelect', id);
    await page.locator('#advancedOptions > summary').click();
    await page.fill('#seed', '5');
    await page.click('#copyMermaid');
    await page.locator('#diagramHost .flow-step').nth(1).focus();
    await page.keyboard.press('Alt+ArrowRight');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await Promise.all([page.waitForEvent('download'), page.click('#downloadSvg')]);
    await Promise.all([page.waitForEvent('download'), page.click('#downloadPng')]);
    await page.selectOption('#presetSelect', 'onboarding');
    await Promise.all([page.waitForEvent('download'), page.click('.csv-btn[data-table="sipocTable"]')]);

    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(consoleHits).toEqual([]);
  });

  test('the exported file with lanes down still carries no CSS variable, style attribute or focus stop', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'onboarding');
    await page.selectOption('#direction', 'down');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadSvg')]);
    const svg = await readDownloadText(download);
    expect(svg).not.toMatch(/var\(--|style=|tabindex|<script/);
    expect(svg).toContain('text-anchor="end"');
    expect(svg).toContain('+ is work done at the same time.');
    const size = await layoutOf(page);
    expect(svg).toContain(`width="${Math.round(size.width * 100) / 100}"`);
  });
});
