// Sankey diagram builder: inputs and displays that used to give a wrong
// picture or a wrong figure with nothing said. Each case here was found by
// feeding the tool something whose right answer is known.
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
const format = (page, fn, values) => page.evaluate(([f, vs]) => vs.map((v) => window.SankeyDiagram.engine[f](...[].concat(v))), [fn, values]);

const flowsOf = (model) => model.graph.links.map((l) => [model.graph.nodes[l.source].name, model.graph.nodes[l.target].name, l.value]);
const codes = (model) => model.warnings.map((w) => [w.line, w.code]);

test.describe('lines that used to be misread in silence', () => {
  test('a flow whose name starts with "#" is still left out, but no longer without a word', async ({ page }) => {
    await openTool(page);
    const model = await build(page, '#1 fuel oil [50] Boiler\nGas [50] Boiler\nBoiler [100] Steam');
    expect(flowsOf(model)).toEqual([['Gas', 'Boiler', 50], ['Boiler', 'Steam', 100]]);
    expect(codes(model)).toEqual([[1, 'COMMENT_LOOKS_LIKE_FLOW']]);
    expect(model.warnings[0].message).toContain('is not in the diagram or the balance');

    // An ordinary comment, a commented-out flow, and a heading say nothing.
    const quiet = await build(page, '# Boiler house\n# Oil [50] Boiler\n## inputs\n#\n// Oil [50] Boiler\nGas [50] Boiler');
    expect(codes(quiet)).toEqual([]);
    // "#" with no space in front of plain words is not a flow either.
    expect(codes(await build(page, '#todo check the gas meter\nGas [50] Boiler'))).toEqual([]);
  });

  test('a delimited row is a row even when its names hold bracketed numbers', async ({ page }) => {
    await openTool(page);
    const model = await build(page, 'Stage [1],Stage [2],100\nStage [2],Out,100\nStage [2]\tWaste [3]\t5\nA [1],B [2],7,Stage [1]');
    expect(flowsOf(model)).toEqual([
      ['Stage [1]', 'Stage [2]', 100], ['Stage [2]', 'Out', 100], ['Stage [2]', 'Waste [3]', 5], ['A [1]', 'B [2]', 7]
    ]);
    expect(model.graph.links[3].stated).toEqual({ 'Stage [1]': 7 });

    // The bracket form is untouched where the third field is not a number.
    const names = await build(page, 'Smith, John [10] Doe, Jane');
    expect(flowsOf(names)).toEqual([['Smith, John', 'Doe, Jane', 10]]);
    expect(codes(names)).toEqual([]);
    // Where both readings hold, the one typed with brackets is used and the line is flagged.
    const both = await build(page, 'Doe, Jane [10] Out, 2, x');
    expect(flowsOf(both)).toEqual([['Doe, Jane', 'Out, 2, x', 10]]);
    expect(codes(both)).toEqual([[1, 'LINE_AMBIGUOUS']]);
  });

  test('a comment after a flow becomes part of the name, and that is said', async ({ page }) => {
    await openTool(page);
    const model = await build(page, 'A [10] B // main feed\nB [10] C');
    expect(model.graph.nodes.map((n) => n.name)).toEqual(['A', 'B // main feed', 'B', 'C']);
    expect(codes(model)).toEqual([[1, 'NAME_HOLDS_COMMENT']]);
    // A name that only contains slashes or a hash is left alone.
    expect(codes(await build(page, 'http://a [10] Boiler #2\nBoiler #2 [10] km/h'))).toEqual([]);
  });
});

test.describe('figures as printed', () => {
  test('a whole number is never printed with its last digits changed', async ({ page }) => {
    await openTool(page);
    expect(await format(page, 'formatValue', [1234567, 123456789, 1234567.89, 999999, 12345.678, 0.1 + 0.2, 0.000123456789, 0]))
      .toEqual(['1,234,567', '123,456,789', '1,234,568', '999,999', '12,345.7', '0.3', '0.000123457', '0']);
    // A set number of decimals is still honoured.
    expect(await format(page, 'formatValue', [[1234567.891, 2], [0.5, 0]])).toEqual(['1,234,567.89', '1']);
  });

  test('a percentage that is not all or nothing is never printed as 100% or 0%', async ({ page }) => {
    await openTool(page);
    expect(await format(page, 'formatPercent', [1, 0, 0.5, 0.954, 0.046, 0.996, 0.9996, 0.99996, 0.9999999, 1.004, 1.0000001, 0.00004, 0.0000000004]))
      .toEqual(['100%', '0%', '50%', '95%', '4.6%', '99.6%', '99.96%', '99.996%', 'just under 100%', '100.4%', 'just over 100%', '0.004%', 'under 0.0001%']);
    // Float noise in an exact balance still reads as exact.
    expect(await format(page, 'formatPercent', [(0.1 + 0.2) / 0.3, 0.3 / (0.1 + 0.2)])).toEqual(['100%', '100%']);
  });

  test('closure on the page shows the gap the tolerance is covering', async ({ page }) => {
    await openTool(page);
    await page.fill('#flowText', 'A [1000] B\nB [996] C');
    await expect.poll(() => page.evaluate(() => window.SankeyDiagram.getModel().graph.nodes.length)).toBe(3);
    const totals = await page.locator('#totals').evaluate((dl) => Object.fromEntries(
      [...dl.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent])));
    expect(totals.Closure).toBe('99.6%');
    await expect(page.locator('#resultStatus')).toContainText('closes only within the 0.5% tolerance');
  });
});

test.describe('written sources are checked even when nobody traces them', () => {
  test('a source written on a flow it cannot reach is reported, since another trace leans on it', async ({ page }) => {
    await openTool(page);
    const list = 'A [100] M\nB [10] N\nN [10] Z\nC [100] M\nM [60 from B] X\nM [140] Y';
    const model = await build(page, `${list}\n* A`);
    const said = model.warnings.filter((w) => w.code === 'TRACE_OVERSTATED');
    expect(said.map((w) => w.message)).toEqual(['M to X is written as carrying 60 from "B", but nothing from "B" reaches "M"']);
    // Said with nothing traced at all, too.
    expect((await build(page, list)).warnings.map((w) => w.code)).toEqual(['TRACE_OVERSTATED']);
  });

  test('a source written for more than it brings is reported without being traced', async ({ page }) => {
    await openTool(page);
    const model = await build(page, 'A [100] M\nB [10] M\nM [50 from B] X\nM [60] Y\n* A');
    expect(model.warnings.filter((w) => w.code === 'TRACE_OVERSTATED').map((w) => w.message))
      .toEqual(['The list has 50 from "B" leaving "M", but only 10 of it gets there']);
    // A source that is not traced stops nowhere on the page.
    const calm = await build(page, 'A [100] M\nB [100] M\nM [50 from B] X\nM [140] Y\nM [10] Z');
    expect(calm.warnings).toEqual([]);
    expect(calm.traces).toEqual([]);
  });
});

test.describe('a trace through a node in the middle', () => {
  const W = '* Web apply';
  const drawnOn = (model) => model.graph.links.filter((l) => model.traces[0].shares[l.index] > 0)
    .map((l) => `${model.graph.nodes[l.source].name}>${model.graph.nodes[l.target].name}`);

  test('goes on through a node it alone feeds, however many ways leave it', async ({ page }) => {
    await openTool(page);
    const one = await build(page, `Web apply [10] Phone screen\nPhone screen [10] Ghosted\n${W}`);
    expect(drawnOn(one)).toEqual(['Web apply>Phone screen', 'Phone screen>Ghosted']);
    const two = await build(page, `Web apply [10] Phone screen\nPhone screen [6] Ghosted\nPhone screen [4] Interview\nInterview [4] Offer\n${W}`);
    expect(drawnOn(two)).toEqual(['Web apply>Phone screen', 'Phone screen>Ghosted', 'Phone screen>Interview', 'Interview>Offer']);
    expect(two.warnings).toEqual([]);
  });

  test('where it stops, the note names what else feeds the node', async ({ page }) => {
    await openTool(page);
    const model = await build(page, `Web apply [10] Phone screen\nReferral [5] Phone screen\nPhone screen [9] Ghosted\nPhone screen [6] Interview\n${W}`);
    expect(drawnOn(model)).toEqual(['Web apply>Phone screen']);
    expect(model.warnings.map((w) => w.message)).toEqual([
      '"Web apply" is not followed past "Phone screen". "Phone screen" is also fed by "Referral", and the list does not say which way each part leaves, so nothing is drawn rather than guessed. To follow it, write the flows out of "Phone screen" with their source, for example "Phone screen [amount from Web apply] Ghosted"'
    ]);
  });

  test('a node that gives out more than it takes in stops the trace and says that is why', async ({ page }) => {
    await openTool(page);
    const model = await build(page, `Web apply [10] Phone screen\nPhone screen [7] Ghosted\nPhone screen [4] Interview\n${W}`);
    expect(drawnOn(model)).toEqual(['Web apply>Phone screen']);
    const note = model.warnings.find((w) => w.code === 'TRACE_UNSTATED').message;
    expect(note).toContain('"Phone screen" gives out more than it takes in (11 against 10), so part of what leaves it is from a source the list does not show');
    expect(note).not.toContain('also fed by');
  });

  test('a source written with the wrong capitals is not followed, and the note offers the name meant', async ({ page }) => {
    await openTool(page);
    const model = await build(page, `Web apply [10] Phone screen\nReferral [5] Phone screen\nPhone screen [7 from web apply] Ghosted\nPhone screen [2] Ghosted\nPhone screen [6] Interview\n${W}`);
    expect(drawnOn(model)).toEqual(['Web apply>Phone screen']);
    expect(model.warnings.find((w) => w.code === 'ORIGIN_UNKNOWN').message)
      .toBe('a flow is written as coming from "web apply", which appears in no flow, so it is not followed. Names are matched exactly: did you mean "Web apply"?');
  });
});

test.describe('the traced example', () => {
  test('the job search example follows every source to its outcomes, to the unit', async ({ page }) => {
    await openTool(page);
    const text = await page.evaluate(() => window.SankeyDiagram.PRESETS.find((p) => p.id === 'jobsearch').text);
    const model = await build(page, text);
    expect(model.warnings).toEqual([]);
    expect(model.balance.closesExactly).toBe(true);
    const ends = Object.fromEntries(model.traces.map((t) => [t.name, Object.fromEntries(t.ends.map((e) => [`${e.kind}:${e.name}`, e.amount]))]));
    // Worked by hand from the lines. Recruiter is the source left unwritten.
    expect(ends).toEqual({
      'Web apply': { 'output:No reply': 40, 'output:Ghosted': 10, 'output:Rejected': 9, 'output:Offer': 1 },
      Referral: { 'output:No reply': 2, 'output:Ghosted': 2, 'output:Rejected': 6, 'output:Offer': 2 },
      Recruiter: { 'output:Ghosted': 2, 'output:Rejected': 5, 'output:Offer': 1 }
    });
    // Every flow is filled by the three sources between them.
    for (const link of model.graph.links) {
      expect(model.traces.reduce((s, t) => s + t.shares[link.index], 0), `link ${link.index}`).toBeCloseTo(1, 12);
    }
  });

  test('choosing it on the page draws the traces and the table with no note to check', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'jobsearch');
    await expect(page.locator('#diagramHost .sankey-node-mark')).toHaveCount(3);
    await expect(page.locator('#traceNote')).toContainText('Followed all the way');
    await expect(page.locator('#traceTable tbody tr')).toHaveCount(11);
    await expect(page.locator('#warningBox')).toBeHidden();
  });

  test('with the sources taken out of it, every trace stops at the phone screen and says why', async ({ page }) => {
    await openTool(page);
    const text = await page.evaluate(() => window.SankeyDiagram.PRESETS.find((p) => p.id === 'jobsearch').text);
    const model = await build(page, text.split(' from Web apply').join('').split(' from Referral').join(''));
    for (const trace of model.traces) expect(trace.stoppedAt.map((i) => model.graph.nodes[i].name)).toEqual(['Phone screen']);
    expect(model.warnings.filter((w) => w.code === 'TRACE_UNSTATED')).toHaveLength(1);
  });
});

test.describe('traced bands and the ribbon color setting', () => {
  const paints = (page, linkColor, traceStyle = 'both') => page.evaluate(([lc, ts]) => {
    const S = window.SankeyDiagram;
    const model = S.buildModel(S.PRESETS.find((p) => p.id === 'jobsearch').text, {});
    const svg = S.renderSankey(document, model, { linkColor: lc, traceStyle: ts }, S.PALETTES.light);
    const colors = S.nodeColors(model, S.PALETTES.light);
    const out = [...svg.querySelectorAll('.sankey-trace')].map((band) => {
      const paint = band.getAttribute(band.getAttribute('fill') === 'none' ? 'stroke' : 'fill');
      const grad = paint.startsWith('url(') ? svg.querySelector(paint.slice(4, -1)) : null;
      const link = model.graph.links[Number(band.getAttribute('data-link'))];
      return {
        paint,
        stops: grad ? [...grad.querySelectorAll('stop')].map((s) => s.getAttribute('stop-color')) : null,
        from: colors[Number(band.getAttribute('data-trace'))],
        to: colors[link.target]
      };
    });
    return { bands: out, markup: new XMLSerializer().serializeToString(svg) };
  }, [linkColor, traceStyle]);

  test('with "Source to target", each band runs from its traced node\'s color to the color of where the flow goes', async ({ page }) => {
    await openTool(page);
    const drawn = await paints(page, 'gradient');
    expect(drawn.bands.length).toBeGreaterThan(15);
    // The palette repeats, so a band whose two ends share a color stays solid.
    const expectPaint = (band) => (band.from === band.to ? expect(band.paint).toBe(band.from) : expect(band.stops).toEqual([band.from, band.to]));
    drawn.bands.forEach(expectPaint);
    // Each graded band has a gradient of its own, and the file still carries no style.
    const graded = drawn.bands.filter((b) => b.stops);
    expect(graded.length).toBeGreaterThan(12);
    expect(new Set(graded.map((b) => b.paint)).size).toBe(graded.length);
    expect(drawn.markup).not.toMatch(/var\(|style=/);
    // Marked lines take the same gradient on their stroke.
    const lines = await paints(page, 'gradient', 'line');
    lines.bands.forEach(expectPaint);
  });

  test('with any other ribbon setting a band stays the traced node\'s own color', async ({ page }) => {
    await openTool(page);
    for (const setting of ['source', 'target', 'neutral']) {
      const drawn = await paints(page, setting);
      for (const band of drawn.bands) expect(band.paint, setting).toBe(band.from);
    }
  });
});

test.describe('node colors', () => {
  const colorsOf = (page, text) => page.evaluate((t) => {
    const S = window.SankeyDiagram;
    const model = S.buildModel(t, {});
    return {
      colors: S.nodeColors(model, S.PALETTES.light),
      dark: S.nodeColors(model, S.PALETTES.dark),
      series: S.PALETTES.light.series,
      darkSeries: S.PALETTES.dark.series,
      names: model.graph.nodes.map((n) => n.name),
      links: model.graph.links.map((l) => [l.source, l.target]),
      reached: model.traces.map((tr) => [tr.node, model.graph.links.filter((l) => tr.shares[l.index] > 0).map((l) => l.target)])
    };
  }, text);

  test('the two ends of a flow never share a color, on every example and on random lists', async ({ page }) => {
    await openTool(page);
    const lists = await page.evaluate(() => window.SankeyDiagram.PRESETS.map((p) => p.text));
    // Random lists of up to 14 nodes, wrapping the palette, each node joined to a few others.
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let k = 0; k < 40; k++) {
      const n = 6 + Math.floor(rnd() * 9);
      const lines = [];
      for (let i = 1; i < n; i++) lines.push(`N${Math.floor(rnd() * i)} [${1 + Math.floor(rnd() * 50)}] N${i}`);
      for (let j = 0; j < 4; j++) {
        const a = Math.floor(rnd() * (n - 1));
        lines.push(`N${a} [5] N${a + 1 + Math.floor(rnd() * (n - a - 1))}`);
      }
      lists.push(lines.join('\n'));
    }
    for (const text of lists) {
      const drawn = await colorsOf(page, text);
      for (const [a, b] of drawn.links) expect(drawn.colors[a], `${drawn.names[a]} and ${drawn.names[b]}`).not.toBe(drawn.colors[b]);
      // The same slots are chosen in both themes, so a node keeps its place in the palette.
      expect(drawn.dark.map((c) => drawn.darkSeries.indexOf(c))).toEqual(drawn.colors.map((c) => drawn.series.indexOf(c)));
    }
  });

  test('a traced node shares no color with anything its bands run into', async ({ page }) => {
    await openTool(page);
    const text = await page.evaluate(() => window.SankeyDiagram.PRESETS.find((p) => p.id === 'jobsearch').text);
    const drawn = await colorsOf(page, text);
    expect(drawn.reached).toHaveLength(3);
    for (const [origin, targets] of drawn.reached) {
      for (const t of targets) expect(drawn.colors[origin], `${drawn.names[origin]} and ${drawn.names[t]}`).not.toBe(drawn.colors[t]);
    }
    // Offer would have wrapped round to Web apply's blue.
    expect(drawn.colors[drawn.names.indexOf('Offer')]).not.toBe(drawn.colors[drawn.names.indexOf('Web apply')]);
  });

  test('colors stay in order of first appearance wherever nothing clashes, and a typed color wins', async ({ page }) => {
    await openTool(page);
    const chain = await colorsOf(page, 'A [1] B\nB [1] C\nC [1] D\nD [1] E\nE [1] F\nF [1] G\nG [1] H');
    expect(chain.colors).toEqual(chain.series);
    // The ninth node wraps to the first color unless it touches the first node.
    const far = await colorsOf(page, 'A [1] B\nB [1] C\nC [1] D\nD [1] E\nE [1] F\nF [1] G\nG [1] H\nH [1] I');
    expect(far.colors[8]).toBe(far.series[0]);
    const near = await colorsOf(page, 'A [1] B\nB [1] C\nC [1] D\nD [1] E\nE [1] F\nF [1] G\nG [1] H\nA [1] I');
    expect(near.colors[8]).toBe(near.series[1]);
    expect(near.colors.slice(0, 8)).toEqual(near.series);
    const typed = await colorsOf(page, 'A [1] B\nB [1] C\n: B #123456');
    expect(typed.colors).toEqual([typed.series[0], '#123456', typed.series[2]]);
  });
});

test.describe('loading an example never takes work away', () => {
  const MINE = 'Mine [7] Kept\nKept [7] Out';
  const names = (page) => page.locator('#projectSelect option').allTextContents();
  const typeMine = async (page) => {
    await page.fill('#flowText', MINE);
    await expect.poll(() => page.evaluate(() => window.SankeyDiagram.getModel().graph.nodes.map((n) => n.name).join())).toBe('Mine,Kept,Out');
  };

  test('with typed work on screen, an example opens as a project of its own and the work is still there', async ({ page }) => {
    await openTool(page);
    await typeMine(page);
    const before = await names(page);
    await page.selectOption('#presetSelect', 'jobsearch');
    await expect(page.locator('#flowText')).toHaveValue(/Web apply \[40\] No reply/);
    expect(await names(page)).toEqual([...before, 'Job search']);
    await expect(page.locator('#projectFileStatus')).toHaveText(`The example opened as a new project, "Job search". "${before[0]}" is as you left it.`);
    await expect(page.locator('#presetSelect')).toHaveValue('jobsearch');

    // Never saved, and still exactly as typed, through a reload too.
    await page.selectOption('#projectSelect', { label: before[0] });
    await expect(page.locator('#flowText')).toHaveValue(MINE);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.SankeyDiagram && window.SankeyDiagram.getModel()))).toBe(true);
    await expect(page.locator('#flowText')).toHaveValue(MINE);
    expect(await names(page)).toEqual([...before, 'Job search']);
  });

  test('browsing from one untouched example to the next stays in one project', async ({ page }) => {
    await openTool(page);
    const before = await names(page);
    for (const id of ['dryer', 'energy', 'jobsearch', 'budget']) await page.selectOption('#presetSelect', id);
    await expect(page.locator('#flowText')).toHaveValue(/Salary,Income,5200/);
    expect(await names(page)).toEqual(before);
    await expect(page.locator('#projectFileStatus')).toHaveText('');
  });

  test('an example that has been edited counts as work', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'dryer');
    await page.locator('#flowText').press('End');
    await page.locator('#flowText').type('\nDryer [60] Wall');
    await expect.poll(() => page.evaluate(() => window.SankeyDiagram.getModel().graph.nodes.some((n) => n.name === 'Wall'))).toBe(true);
    const before = await names(page);
    await page.selectOption('#presetSelect', 'energy');
    expect(await names(page)).toEqual([...before, 'Boiler house energy']);
    await page.selectOption('#projectSelect', { label: before[0] });
    await expect(page.locator('#flowText')).toHaveValue(/Dryer \[60\] Wall/);
  });

  test('with ten projects stored, the example is refused and nothing is replaced', async ({ page }) => {
    await openTool(page);
    for (let i = 0; i < 9; i++) await page.locator('#projectNew').click();
    expect(await names(page)).toHaveLength(10);
    await typeMine(page);
    await page.selectOption('#presetSelect', 'jobsearch');
    await expect(page.locator('#flowText')).toHaveValue(MINE);
    await expect(page.locator('#presetSelect')).toHaveValue('');
    await expect(page.locator('#projectFileStatus')).toContainText('The example was not loaded');
    expect(await names(page)).toHaveLength(10);
  });
});

test.describe('trace mark size', () => {
  const marks = (page, markSize) => page.evaluate((size) => {
    const S = window.SankeyDiagram;
    const model = S.buildModel(S.PRESETS.find((p) => p.id === 'jobsearch').text, {});
    const svg = S.renderSankey(document, model, size ? { markSize: size } : {}, S.PALETTES.light);
    document.body.appendChild(svg);
    const box = (el) => { const b = el.getBBox(); return Math.max(b.width, b.height); };
    const out = {
      sizes: [...svg.querySelectorAll('.sankey-trace-mark')].map(box),
      nodeSizes: [...svg.querySelectorAll('.sankey-node-mark')].map(box),
      // Marks along the widest flow, to read the spacing off.
      xs: [...svg.querySelectorAll('.sankey-trace-mark[data-link="0"]')].map((m) => m.getBBox().x + m.getBBox().width / 2)
    };
    svg.remove();
    return out;
  }, markSize);

  test('small, medium and large change the marks and their spacing together, and medium is the default', async ({ page }) => {
    await openTool(page);
    const [small, medium, large, unset, junk] = [await marks(page, 'small'), await marks(page, 'medium'), await marks(page, 'large'), await marks(page), await marks(page, 'huge')];
    const most = (list) => Math.max(...list);
    expect(most(small.sizes)).toBeLessThan(7.5);
    expect(most(medium.sizes)).toBeGreaterThan(8.5);
    expect(most(medium.sizes)).toBeLessThan(10.5);
    expect(most(large.sizes)).toBeGreaterThan(11.5);
    // The mark on the node stays a little larger than those on the flows.
    for (const run of [small, medium, large]) expect(Math.min(...run.nodeSizes)).toBeGreaterThan(Math.min(...run.sizes));
    expect(small.xs[1] - small.xs[0]).toBeCloseTo(30, 0);
    expect(medium.xs[1] - medium.xs[0]).toBeCloseTo(44, 0);
    expect(large.xs[1] - large.xs[0]).toBeCloseTo(56, 0);
    expect(small.sizes.length).toBeGreaterThan(medium.sizes.length);
    expect(unset).toEqual(medium);
    expect(junk).toEqual(medium);
  });

  test('the setting redraws once and is kept with the project', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'jobsearch');
    await page.locator('#advancedOptions > summary').click();
    const count = () => page.locator('#diagramHost .sankey-trace-mark').count();
    const medium = await count();
    const before = await page.evaluate(() => window.SankeyDiagram.getRenderCount());
    await page.selectOption('#markSize', 'small');
    expect(await page.evaluate(() => window.SankeyDiagram.getRenderCount())).toBe(before + 1);
    expect(await count()).toBeGreaterThan(medium);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.SankeyDiagram && window.SankeyDiagram.getModel()))).toBe(true);
    await expect(page.locator('#markSize')).toHaveValue('small');
  });
});
