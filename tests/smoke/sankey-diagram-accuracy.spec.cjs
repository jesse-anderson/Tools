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
