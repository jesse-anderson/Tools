// Engine-level tests for the Excel formula extractor via window.ExcelFormulaExtractor.
// These cover parsing edge cases the UI-focused tools-smoke tests do not:
// external-reference extraction, formula-error mapping, and defined-name scoping.
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/excel-formula-extractor.html';
let smokeServer;

test.beforeAll(async () => {
  smokeServer = await startServer({
    port: Number(process.env.PORT || 4173),
    reuseExisting: !process.env.CI
  });
});

test.afterAll(async () => {
  if (smokeServer) {
    await smokeServer.close();
    smokeServer = null;
  }
});

async function openTool(page) {
  await page.goto(TOOL_PATH);
  await page.waitForFunction(() => window.ExcelFormulaExtractor !== undefined);
}

test.describe('external workbook extraction', () => {
  test('detects quoted, unquoted, and path-qualified links but not structured refs', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const ext = window.ExcelFormulaExtractor.extractExternalWorkbooks;
      return {
        quotedWithSpaces: ext("'[Book.xlsx]Rates Sheet'!A1"),
        unquoted: ext('[Budget.xlsx]Sheet1!A1'),
        pathQualified: ext("'C:\\Models\\[Q3.xlsx]Data'!$A$1"),
        structuredRef: ext('Table1[Column]'),
        plain: ext('SUM(A1:A5)'),
        deduped: ext('[Book.xlsx]S1!A1 + [Book.xlsx]S2!B2')
      };
    });
    expect(out.quotedWithSpaces).toEqual(['Book.xlsx']);
    expect(out.unquoted).toEqual(['Budget.xlsx']);
    expect(out.pathQualified).toEqual(['Q3.xlsx']);
    expect(out.structuredRef).toEqual([]); // Table1[Column] is not an external workbook
    expect(out.plain).toEqual([]);
    expect(out.deduped).toEqual(['Book.xlsx']); // same workbook referenced twice -> one entry
  });
});

test.describe('formula error codes and cached values', () => {
  test('maps known error codes and falls back for unknown ones', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const wb = {
        SheetNames: ['S'],
        Sheets: { S: {
          '!ref': 'A1:A3',
          A1: { t: 'e', v: 7, f: 'A2/0' },   // #DIV/0!
          A2: { t: 'e', v: 42, f: 'VLOOKUP()' }, // #N/A
          A3: { t: 'e', v: 99, f: 'FOO()' }  // unknown -> fallback
        } },
        Workbook: { Sheets: [{ name: 'S', Hidden: 0 }], Names: [] }
      };
      const a = window.ExcelFormulaExtractor.analyzeWorkbook(wb, { name: 't.xlsx' });
      return Object.fromEntries(a.formulas.map((r) => [r.address, r.cachedValue]));
    });
    expect(out.A1).toBe('#DIV/0!');
    expect(out.A2).toBe('#N/A');
    expect(out.A3).toBe('#ERR99');
  });
});

test.describe('defined name scoping', () => {
  test('resolves numeric-string sheet scope and rejects out-of-range scope', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const wb = {
        SheetNames: ['Main', 'Data'],
        Sheets: { Main: { '!ref': 'A1:A1', A1: { t: 'n', v: 1 } }, Data: { '!ref': 'A1:A1', A1: { t: 'n', v: 2 } } },
        Workbook: {
          Sheets: [{ name: 'Main', Hidden: 0 }, { name: 'Data', Hidden: 1 }],
          Names: [
            { Name: 'ScopedByNumericString', Ref: 'Data!$A$1', Sheet: '1' },
            { Name: 'WorkbookScoped', Ref: 'Main!$A$1' },
            { Name: 'OutOfRange', Ref: 'Main!$A$1', Sheet: 99 }
          ]
        }
      };
      const a = window.ExcelFormulaExtractor.analyzeWorkbook(wb, { name: 't.xlsx' });
      const by = Object.fromEntries(a.definedNames.map((r) => [r.name, r]));
      return {
        numericString: { scope: by.ScopedByNumericString.scopeType, sheet: by.ScopedByNumericString.scopeSheetName },
        workbook: by.WorkbookScoped.scopeType,
        outOfRange: by.OutOfRange.scopeType,
        hiddenCount: a.summary.hiddenSheetCount
      };
    });
    expect(out.numericString).toEqual({ scope: 'Sheet', sheet: 'Data' });
    expect(out.workbook).toBe('Workbook');
    expect(out.outOfRange).toBe('Workbook'); // sheets[99] is undefined -> workbook scope
    expect(out.hiddenCount).toBe(1);
  });
});

test.describe('CSV formula-injection defense', () => {
  test('exported cells with a leading formula operator are neutralized', async ({ page }) => {
    await openTool(page);
    // buildCsv is internal, but the exported formulas CSV runs values through it.
    // Load a workbook whose cached value begins with '=' and confirm the download escapes it.
    await page.evaluate(() => {
      const wb = {
        SheetNames: ['S'],
        Sheets: { S: { '!ref': 'A1:A1', A1: { t: 's', v: '=cmd()', f: 'CONCAT("=cmd()")' } } },
        Workbook: { Sheets: [{ name: 'S', Hidden: 0 }], Names: [] }
      };
      window.ExcelFormulaExtractor.loadWorkbookForTest(wb, { name: 'inj.xlsx' });
    });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadFormulasCsvBtn')
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    const csv = Buffer.concat(chunks).toString('utf8');
    // the cached value =cmd() must be neutralized with a leading apostrophe
    expect(csv).toContain("'=cmd()");
    // and the raw, unescaped =cmd() must not appear at the start of a field
    expect(csv).not.toMatch(/(^|,)=cmd\(\)/m);
  });
});
