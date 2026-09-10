// Engine tests for the CSV Profiler via window.CsvProfilerEngine: scalar type
// classification, delimiter detection, quote-aware parsing, and end-to-end
// type/SQL inference. This tool previously had no automated coverage.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const TOOL_PATH = '/tools/csv-profiler.html';

async function openTool(page) {
  await page.goto(TOOL_PATH);
  await page.waitForFunction(() => window.CsvProfilerEngine !== undefined);
}

test.describe('scalar classification', () => {
  test('classifies numbers, booleans, dates, and text', async ({ page }) => {
    await openTool(page);
    const kinds = await page.evaluate(() => {
      const { classifyScalar } = window.CsvProfilerEngine;
      const k = (v) => classifyScalar(v).kind;
      return {
        int: k('42'), negInt: k('-42'), zero: k('0'),
        float: k('3.14'), sci: k('1e6'), leadingDot: k('.5'),
        boolTrue: k('true'), boolYes: k('YES'), boolNo: k('no'),
        isoDate: k('2024-01-15'), isoDateTime: k('2024-01-15T10:30:00'),
        text: k('hello'), version: k('1.2.3'), phone: k('555-1234'), nan: k('NaN')
      };
    });
    expect(kinds.int).toBe('integer');
    expect(kinds.negInt).toBe('integer');
    expect(kinds.zero).toBe('integer');
    expect(kinds.float).toBe('number');
    expect(kinds.sci).toBe('number');
    expect(kinds.leadingDot).toBe('number');
    expect(kinds.boolTrue).toBe('boolean');
    expect(kinds.boolYes).toBe('boolean');
    expect(kinds.boolNo).toBe('boolean');
    expect(kinds.isoDate).toBe('datetime');
    expect(kinds.isoDateTime).toBe('datetime');
    expect(kinds.text).toBe('text');
    expect(kinds.version).toBe('text');
    expect(kinds.phone).toBe('text');
    expect(kinds.nan).toBe('text');
  });

  test('leading-zero numerics are text, not numbers (no data loss)', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { classifyScalar } = window.CsvProfilerEngine;
      const k = (v) => classifyScalar(v).kind;
      return {
        zip: k('00501'), padded: k('007'), doubleZero: k('00'), negPadded: k('-01'),
        // leading zero in the integer part of a float is an identifier too
        leadingZeroFloat: k('01.5'), doubleZeroFloat: k('00.5'), negLeadingZeroFloat: k('-00.9'),
        // real numbers with a bare zero are unaffected
        singleZero: k('0'), zeroFloat: k('0.0'), normalFloat: k('0.5'), leadingDot: k('.5'),
        normalInt: k('10001')
      };
    });
    expect(out.zip).toBe('text');
    expect(out.padded).toBe('text');
    expect(out.doubleZero).toBe('text');
    expect(out.negPadded).toBe('text');
    expect(out.leadingZeroFloat).toBe('text');
    expect(out.doubleZeroFloat).toBe('text');
    expect(out.negLeadingZeroFloat).toBe('text');
    expect(out.singleZero).toBe('integer');
    expect(out.zeroFloat).toBe('number');
    expect(out.normalFloat).toBe('number');
    expect(out.leadingDot).toBe('number');
    expect(out.normalInt).toBe('integer');
  });
});

test.describe('delimiter detection', () => {
  test('detects comma, semicolon, tab, and pipe', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { detectDelimiter } = window.CsvProfilerEngine;
      return {
        comma: detectDelimiter('a,b,c\n1,2,3\n4,5,6').character,
        semicolon: detectDelimiter('a;b;c\n1;2;3').character,
        tab: detectDelimiter('a\tb\tc\n1\t2\t3').character,
        pipe: detectDelimiter('a|b|c\n1|2|3').character
      };
    });
    expect(out.comma).toBe(',');
    expect(out.semicolon).toBe(';');
    expect(out.tab).toBe('\t');
    expect(out.pipe).toBe('|');
  });
});

test.describe('quote-aware parsing', () => {
  test('handles embedded delimiters, newlines, and escaped quotes', async ({ page }) => {
    await openTool(page);
    const rows = await page.evaluate(async () => {
      const { parseCsvText } = window.CsvProfilerEngine;
      const collect = async (text) => {
        const out = [];
        await parseCsvText(text, ',', { onRow: (r) => { out.push(r.slice()); return true; } });
        return out;
      };
      return {
        embeddedComma: await collect('a,"b,c",d'),
        embeddedNewline: await collect('a,"line1\nline2",c\nx,y,z'),
        escapedQuote: await collect('a,"she said ""hi""",c')
      };
    });
    expect(rows.embeddedComma).toEqual([['a', 'b,c', 'd']]);
    expect(rows.embeddedNewline).toEqual([['a', 'line1\nline2', 'c'], ['x', 'y', 'z']]);
    expect(rows.escapedQuote).toEqual([['a', 'she said "hi"', 'c']]);
  });
});

test.describe('end-to-end profiling', () => {
  test('infers column types and safe SQL types', async ({ page }) => {
    await openTool(page);
    const cols = await page.evaluate(async () => {
      const { profileCsvFile } = window.CsvProfilerEngine;
      const csv = [
        'id,zip,price,active,joined,note',
        '1,00501,9.99,true,2024-01-15,hello',
        '2,00502,19.5,false,2024-02-20,world',
        '3,00503,29,yes,2024-03-01,x'
      ].join('\n');
      const r = await profileCsvFile({ text: csv, delimiterMode: 'auto', headerMode: 'auto', maxRows: 1000, fileName: 't.csv' });
      return { headerPresent: r.headerPresent, columns: r.columns.map((c) => ({ name: c.name, type: c.inferredType, sql: c.sqlType })) };
    });
    expect(cols.headerPresent).toBe(true);
    const by = Object.fromEntries(cols.columns.map((c) => [c.name, c]));
    expect(by.id).toMatchObject({ type: 'integer', sql: 'INTEGER' });
    // all-leading-zero column is text/VARCHAR, never INTEGER
    expect(by.zip.type).toBe('text');
    expect(by.zip.sql).toBe('VARCHAR');
    expect(by.price).toMatchObject({ type: 'number', sql: 'DOUBLE' });
    expect(by.active).toMatchObject({ type: 'boolean', sql: 'BOOLEAN' });
    expect(by.joined).toMatchObject({ type: 'date', sql: 'DATE' });
    expect(by.note.type).toBe('text');
  });
});

// --- scope disclaimer -----------------------------------------------------
// The old block was five good paragraphs in a red sidebar box whose heading
// measured 3.76:1 on the light card. It scored 4 of 5 legal elements, missing
// only precedence, and it never named the hard limits that turn a partial
// profile into one that looks complete.

const DISCLAIMER_PAGE = '/tools/csv-profiler.html';

test('scope disclaimer is visible, closed, and above the layout', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, DISCLAIMER_PAGE);
  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  const box = await card.boundingBox();
  const layout = await page.locator('.calculator-layout').boundingBox();
  expect(box.width).toBeGreaterThan(layout.width * 0.9);
  expect(box.y).toBeLessThan(layout.y);

  await expect(card.locator('.disclaimer-title')).toContainText('Not ETL validation');
  await expect(card.locator('.disclaimer-lead')).toContainText('least reliable on exactly the files worth profiling');
});

test('scope disclaimer keeps all five paragraphs of the old block', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, DISCLAIMER_PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('not a substitute for database administration, ETL validation, compliance review, backup verification, or production data quality controls');
  await expect(body).toContainText('malformed, encoded, truncated, very wide or domain-specific files');
  await expect(body).toContainText('not intentionally uploaded by this page');
  await expect(body).toContainText('Browser extensions, local policies, crashes, memory pressure');
  await expect(body).toContainText('validate the source data, schema, row counts, encodings, delimiters and generated SQL');

  // Every heuristic named individually, as the old block did.
  for (const h of ['Type inference', 'delimiter detection', 'duplicate counts', 'histograms', 'schema output', 'quality notes']) {
    await expect(body, `lost the ${h} heuristic`).toContainText(h);
  }
});

test('scope disclaimer names the limits that truncate a profile', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, DISCLAIMER_PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // These figures also appear in the sidebar limits panel; the card exists to
  // say what they mean, which is that a partial profile looks complete.
  await expect(body).toContainText('20 MB');
  await expect(body).toContainText('200,000 data rows');
  await expect(body).toContainText('20,000 values per column');
  await expect(body).toContainText('turns a full profile into a partial one that looks identical');

  // The two readings this tool most invites.
  await expect(body).toContainText('Generated SQL is a starting point to read and edit, not DDL to run');
  await expect(body).toContainText('The absence of a warning means no heuristic fired');
});

test('scope disclaimer names the uses it is not for', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, DISCLAIMER_PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('Data quality attestation');
  await expect(body).toContainText('HIPAA');
  await expect(body).toContainText('PCI DSS');
  await expect(body).toContainText('GDPR');
  await expect(body).toContainText('Local is about transmission, not permission');
});

test('scope disclaimer opens by keyboard and carries a touchpoint above the tabs', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, DISCLAIMER_PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');

  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toContainText('Heuristics, and a profile that may have stopped early');
  await expect(touch).toContainText('A missing warning means no heuristic fired, not that the file is clean');
  const inAnalysis = await touch.evaluate((el) => Boolean(el.closest('#analysisContent')));
  expect(inAnalysis).toBe(true);
});
