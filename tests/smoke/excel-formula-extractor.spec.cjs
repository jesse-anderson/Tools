// Excel Formula Extractor DOM/e2e coverage: demo workbook analysis, exports and
// clear, unsupported-file rejection, an uploaded SheetJS-built workbook,
// external-ref/scoped-name/CSV-escape edge cases, and output row limiting.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly, readDownloadText } = require('./helpers.cjs');

test('excel formula extractor demo surfaces hidden sheets, defined names, and external refs', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  await page.click('#loadDemoWorkbookBtn');

  await expect(page.locator('#fileNameValue')).toHaveText('demo-formulas.xlsx');
  await expect(page.locator('#sheetCountValue')).toHaveText('3');
  await expect(page.locator('#formulaCellsValue')).toHaveText('7');
  await expect(page.locator('#definedNamesValue')).toHaveText('3');
  await expect(page.locator('#hiddenSheetsValue')).toHaveText('1');
  await expect(page.locator('#externalLinksValue')).toHaveText('1');

  await expect(page.locator('#sheetsTable')).toContainText('Archive');
  await expect(page.locator('#sheetsTable')).toContainText('Very Hidden');
  await expect(page.locator('#formulasTable')).toContainText('Pricing.xlsx');
  await expect(page.locator('#definedNamesTable')).toContainText('QuotedRate');
  await expect(page.locator('#externalRefsList')).toContainText('Pricing.xlsx');
  await expect(page.locator('#formulaDump')).toHaveValue(/'Calc'!C2\t='\[Pricing\.xlsx\]Rates'!\$B\$2/);

  await page.selectOption('#sheetFilter', 'Archive');
  await expect(page.locator('#formulaRowsMeta')).toHaveText('1 shown of 1');
  await expect(page.locator('#formulasTable tbody tr')).toHaveCount(1);
  await expect(page.locator('#formulaDump')).toHaveValue("'Archive'!A1\t=Calc!B2*2");
});

test('excel formula extractor exports demo analysis and clears state', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  await page.click('#loadDemoWorkbookBtn');

  const jsonDownloadPromise = page.waitForEvent('download');
  await page.click('#downloadJsonBtn');
  const jsonDownload = await jsonDownloadPromise;
  const analysis = JSON.parse(await readDownloadText(jsonDownload));

  expect(jsonDownload.suggestedFilename()).toBe('demo-formulas-formula-analysis.json');
  expect(analysis.summary.formulaCount).toBe(7);
  expect(analysis.summary.nameCount).toBe(3);
  expect(analysis.externalLinks.map((entry) => entry.workbook)).toEqual(['Pricing.xlsx']);

  const formulaCsvDownloadPromise = page.waitForEvent('download');
  await page.click('#downloadFormulasCsvBtn');
  const formulaCsv = await readDownloadText(await formulaCsvDownloadPromise);
  expect(formulaCsv).toContain('sheet,cell,sheet_visibility,formula');
  // Leading apostrophe is appended by csvEscape to neutralize CSV formula injection (CWE-1236).
  expect(formulaCsv).toContain('Calc,C2,Visible,\'=\'[Pricing.xlsx]Rates\'!$B$2');

  const namesCsvDownloadPromise = page.waitForEvent('download');
  await page.click('#downloadNamesCsvBtn');
  const namesCsv = await readDownloadText(await namesCsvDownloadPromise);
  expect(namesCsv).toContain('name,scope_type,scope_sheet,scope_visibility,ref');
  expect(namesCsv).toContain('QuotedRate,Workbook,,Visible,\'[Pricing.xlsx]Rates\'!$B$2');

  const dumpDownloadPromise = page.waitForEvent('download');
  await page.click('#downloadDumpBtn');
  const dump = await readDownloadText(await dumpDownloadPromise);
  expect(dump).toContain("'Inputs'!C2\t=SUM(A2:B2)");
  expect(dump).toContain("'Calc'!C2\t='[Pricing.xlsx]Rates'!$B$2");

  await page.check('#externalOnlyToggle');
  await expect(page.locator('#formulaRowsMeta')).toHaveText('1 shown of 1');
  await expect(page.locator('#definedNamesMeta')).toHaveText('1 shown of 1');

  await page.click('#clearWorkbookBtn');
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(page.locator('#resultsContent')).toBeHidden();
  await expect(page.locator('#formulaRowsMeta')).toHaveText('0 shown of 0');
  await expect(page.locator('#formulaDump')).toHaveValue('');
  await expect(page.locator('#downloadJsonBtn')).toBeDisabled();
  await expect(page.locator('#statusBanner')).toHaveText('Waiting for a workbook or demo load.');
  await expect(page.locator('#statusBanner')).toHaveClass(/info/);
});

test('excel formula extractor rejects unsupported files and normalizes sheet visibility values', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  await page.click('#loadDemoWorkbookBtn');
  await expect(page.locator('#fileNameValue')).toHaveText('demo-formulas.xlsx');
  await expect(page.locator('#downloadJsonBtn')).toBeEnabled();

  await page.setInputFiles('#fileInput', {
    name: 'not-a-workbook.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('plain text', 'utf8')
  });

  await expect(page.locator('#statusBanner')).toHaveText('Unsupported workbook type: .txt. Use XLSX, XLSM, XLSB, or XLS.');
  await expect(page.locator('#statusBanner')).toHaveClass(/error/);
  await expect(page.locator('#resultsContent')).toBeHidden();
  await expect(page.locator('#fileNameValue')).toHaveText('--');
  await expect(page.locator('#formulaCellsValue')).toHaveText('0');
  await expect(page.locator('#downloadJsonBtn')).toBeDisabled();

  await page.evaluate(() => {
    window.ExcelFormulaExtractor.loadWorkbookForTest(
      {
        SheetNames: ['VisibleSheet', 'HiddenSheet', 'VeryHiddenSheet'],
        Sheets: {
          VisibleSheet: {
            '!ref': 'A1:A1',
            A1: { t: 'n', f: '1+1', v: 2, w: '2' }
          },
          HiddenSheet: {
            '!ref': 'A1:A1',
            A1: { t: 'n', f: 'VisibleSheet!A1*2', v: 4, w: '4' }
          },
          VeryHiddenSheet: {
            '!ref': 'A1:A1',
            A1: { t: 'n', f: 'HiddenSheet!A1*2', v: 8, w: '8' }
          }
        },
        Workbook: {
          Sheets: [
            { name: 'VisibleSheet', Hidden: '0' },
            { name: 'HiddenSheet', Hidden: '1' },
            { name: 'VeryHiddenSheet', Hidden: '2' }
          ],
          Names: []
        }
      },
      {
        name: 'visibility-demo.xlsx',
        source: 'Test Workbook'
      }
    );
  });

  await expect(page.locator('#hiddenSheetsValue')).toHaveText('2');
  await expect(page.locator('#sheetsTable')).toContainText('HiddenSheet');
  await expect(page.locator('#sheetsTable')).toContainText('Hidden');
  await expect(page.locator('#sheetsTable')).toContainText('Very Hidden');
  await expect(page.locator('#sheetFilter')).toContainText('HiddenSheet (Hidden)');
  await expect(page.locator('#sheetFilter')).toContainText('VeryHiddenSheet (Very Hidden)');
});

test('excel formula extractor parses an uploaded xlsx workbook through SheetJS', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  const workbookBytes = await page.evaluate(() => {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS did not load.');
    }

    const workbook = XLSX.utils.book_new();
    const calcSheet = XLSX.utils.aoa_to_sheet([
      ['Input', 'Output'],
      [2, null]
    ]);
    calcSheet.B2 = { t: 'n', f: 'A2*3', v: 6, w: '6' };

    const hiddenSheet = XLSX.utils.aoa_to_sheet([
      ['External'],
      [null]
    ]);
    hiddenSheet.A2 = { t: 'n', f: '\'[Rates.xlsx]Sheet1\'!$A$1', v: 9, w: '9' };

    XLSX.utils.book_append_sheet(workbook, calcSheet, 'Calc');
    XLSX.utils.book_append_sheet(workbook, hiddenSheet, 'HiddenCalc');
    workbook.Workbook = workbook.Workbook || {};
    workbook.Workbook.Sheets = [
      { name: 'Calc', Hidden: 0 },
      { name: 'HiddenCalc', Hidden: 1 }
    ];
    workbook.Workbook.Names = [
      { Name: 'ExternalRate', Ref: '\'[Rates.xlsx]Sheet1\'!$A$1' }
    ];

    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return Array.from(new Uint8Array(arrayBuffer));
  });

  await page.setInputFiles('#fileInput', {
    name: 'generated-formulas.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(workbookBytes)
  });

  await expect(page.locator('#fileNameValue')).toHaveText('generated-formulas.xlsx');
  await expect(page.locator('#sourceValue')).toHaveText('Uploaded Workbook');
  await expect(page.locator('#sheetCountValue')).toHaveText('2');
  await expect(page.locator('#formulaCellsValue')).toHaveText('2');
  await expect(page.locator('#definedNamesValue')).toHaveText('1');
  await expect(page.locator('#hiddenSheetsValue')).toHaveText('1');
  await expect(page.locator('#externalLinksValue')).toHaveText('1');
  await expect(page.locator('#sheetsTable')).toContainText('HiddenCalc');
  await expect(page.locator('#sheetsTable')).toContainText('Hidden');
  await expect(page.locator('#formulasTable')).toContainText('Rates.xlsx');
  await expect(page.locator('#definedNamesTable')).toContainText('ExternalRate');
  await expect(page.locator('#externalRefsList')).toContainText('Rates.xlsx');
});

test('excel formula extractor handles external refs with spaces, scoped names, csv escapes, and quoted dump sheet names', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  const externalCases = await page.evaluate(() => ({
    normal: window.ExcelFormulaExtractor.extractExternalWorkbooks("'[Book.xlsx]Sheet1'!$A$1"),
    sheetWithSpace: window.ExcelFormulaExtractor.extractExternalWorkbooks("'[Budget 2026.xlsx]Rates Sheet'!$A$1"),
    pathWithSpaceSheet: window.ExcelFormulaExtractor.extractExternalWorkbooks("'C:\\Models\\[Budget 2026.xlsx]Rates Sheet'!$A$1"),
    structuredRef: window.ExcelFormulaExtractor.extractExternalWorkbooks('SUM(Table1[Amount])')
  }));
  expect(externalCases).toEqual({
    normal: ['Book.xlsx'],
    sheetWithSpace: ['Budget 2026.xlsx'],
    pathWithSpaceSheet: ['Budget 2026.xlsx'],
    structuredRef: []
  });

  await page.evaluate(() => {
    window.ExcelFormulaExtractor.loadWorkbookForTest(
      {
        SheetNames: ["Bob's Sheet", 'Scoped Sheet'],
        Sheets: {
          "Bob's Sheet": {
            '!ref': 'A1:B1',
            A1: { t: 'n', f: "'[Budget 2026.xlsx]Rates Sheet'!$A$1", v: 7, w: '7' },
            B1: {
              t: 's',
              f: '"cached"',
              v: '\n=HYPERLINK("http://example.test")',
              w: '\n=HYPERLINK("http://example.test")'
            }
          },
          'Scoped Sheet': {
            '!ref': 'A1:A1',
            A1: { t: 'n', f: "'Bob''s Sheet'!A1*2", v: 14, w: '14' }
          }
        },
        Workbook: {
          Sheets: [
            { name: "Bob's Sheet", Hidden: 0 },
            { name: 'Scoped Sheet', Hidden: 1 }
          ],
          Names: [
            { Name: 'ScopedName', Ref: "'Scoped Sheet'!$A$1", Sheet: '1' }
          ]
        }
      },
      {
        name: 'edge-cases.xlsx',
        source: 'Test Workbook'
      }
    );
  });

  await expect(page.locator('#externalLinksValue')).toHaveText('1');
  await expect(page.locator('#formulasTable')).toContainText('Budget 2026.xlsx');
  await expect(page.locator('#externalRefsList')).toContainText('Budget 2026.xlsx');
  await expect(page.locator('#formulaDump')).toHaveValue(/'Bob''s Sheet'!A1\t='\[Budget 2026\.xlsx\]Rates Sheet'!\$A\$1/);

  const scopedName = await page.evaluate(() => (
    window.ExcelFormulaExtractor.getCurrentAnalysis().definedNames.find((row) => row.name === 'ScopedName')
  ));
  expect(scopedName.scopeType).toBe('Sheet');
  expect(scopedName.scopeSheetName).toBe('Scoped Sheet');
  expect(scopedName.scopeVisibility).toBe('Hidden');

  await page.selectOption('#sheetFilter', "Bob's Sheet");
  await expect(page.locator('#definedNamesMeta')).toHaveText('0 shown of 0');
  await page.selectOption('#sheetFilter', 'Scoped Sheet');
  await expect(page.locator('#definedNamesMeta')).toHaveText('1 shown of 1');

  const formulaCsvDownloadPromise = page.waitForEvent('download');
  await page.click('#downloadFormulasCsvBtn');
  const formulaCsv = await readDownloadText(await formulaCsvDownloadPromise);
  expect(formulaCsv).toContain(`"'\n=HYPERLINK(""http://example.test"")"`);
});

test('excel formula extractor limits large output sections to ten rows until expanded', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/excel-formula-extractor.html');

  await page.evaluate(() => {
    const sheetNames = [];
    const sheets = {};
    const workbookSheets = [];
    const names = [];

    for (let index = 1; index <= 12; index += 1) {
      const sheetName = `Sheet${index}`;
      sheetNames.push(sheetName);
      workbookSheets.push({ name: sheetName, Hidden: 0 });
      sheets[sheetName] = {
        '!ref': 'A1:C2',
        A1: { t: 's', v: `Label ${index}` },
        B1: { t: 'n', f: `'[Book${index}.xlsx]Rates'!$A$1`, v: index, w: String(index) },
        C1: { t: 'n', f: 'SUM(1,1)', v: 2, w: '2' }
      };
    }

    for (let index = 1; index <= 15; index += 1) {
      names.push({
        Name: `Metric${index}`,
        Ref: 'Sheet1!$A$1',
        Comment: `Comment ${index}`
      });
    }

    window.ExcelFormulaExtractor.loadWorkbookForTest(
      {
        SheetNames: sheetNames,
        Sheets: sheets,
        Workbook: {
          Sheets: workbookSheets,
          Names: names
        }
      },
      {
        name: 'large-demo.xlsx',
        source: 'Test Workbook'
      }
    );
  });

  await expect(page.locator('#sheetsMeta')).toHaveText('10 shown of 12');
  await expect(page.locator('#formulaRowsMeta')).toHaveText('10 shown of 24');
  await expect(page.locator('#definedNamesMeta')).toHaveText('10 shown of 15');
  await expect(page.locator('#externalRefsMeta')).toHaveText('10 shown of 12');
  await expect(page.locator('#formulaDumpMeta')).toHaveText('10 shown of 24 lines');

  await expect(page.locator('#sheetsTable tbody tr')).toHaveCount(10);
  await expect(page.locator('#formulasTable tbody tr')).toHaveCount(10);
  await expect(page.locator('#definedNamesTable tbody tr')).toHaveCount(10);
  await expect(page.locator('#externalRefsList .link-item')).toHaveCount(10);

  await expect(page.locator('#showMoreSheetsBtn')).toBeVisible();
  await expect(page.locator('#showMoreFormulasBtn')).toBeVisible();
  await expect(page.locator('#showMoreDefinedNamesBtn')).toBeVisible();
  await expect(page.locator('#showMoreExternalRefsBtn')).toBeVisible();
  await expect(page.locator('#showMoreDumpBtn')).toBeVisible();

  await page.click('#showAllSheetsBtn');
  await expect(page.locator('#sheetsTable tbody tr')).toHaveCount(12);

  await page.click('#showMoreFormulasBtn');
  await expect(page.locator('#formulaRowsMeta')).toHaveText('20 shown of 24');
  await expect(page.locator('#formulasTable tbody tr')).toHaveCount(20);

  await page.click('#showAllDefinedNamesBtn');
  await expect(page.locator('#definedNamesMeta')).toHaveText('15 shown of 15');
  await expect(page.locator('#definedNamesTable tbody tr')).toHaveCount(15);

  await page.click('#showMoreExternalRefsBtn');
  await expect(page.locator('#externalRefsMeta')).toHaveText('12 shown of 12');
  await expect(page.locator('#externalRefsList .link-item')).toHaveCount(12);

  await page.click('#showMoreDumpBtn');
  await expect(page.locator('#formulaDumpMeta')).toHaveText('20 shown of 24 lines');

  await page.click('#showAllFormulasBtn');
  await expect(page.locator('#formulaRowsMeta')).toHaveText('24 shown of 24');
  await expect(page.locator('#formulasTable tbody tr')).toHaveCount(24);

  await page.click('#showAllDumpBtn');
  await expect(page.locator('#formulaDumpMeta')).toHaveText('24 shown of 24 lines');
  await expect.poll(() => page.locator('#formulaDump').inputValue().then((value) => value.split('\n').filter(Boolean).length)).toBe(24);
});
