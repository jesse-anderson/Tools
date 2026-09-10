// Tests the parquet viewer's data-export serialization via window.ParquetViewer.
// Guards the CSV export against re-truncating strings or byte arrays and against
// unescaped commas/quotes/newlines in cells or header names.
const { test, expect } = require('@playwright/test');

const TOOL_PATH = '/tools/parquet-viewer.html';

async function openTool(page) {
  await page.goto(TOOL_PATH);
  await page.waitForFunction(() => window.ParquetViewer !== undefined);
}

test.describe('CSV value serialization', () => {
  test('raw values are not truncated the way the preview truncates them', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { csvValue } = window.ParquetViewer;
      const longString = 'x'.repeat(200);
      const bytes = new Uint8Array(20).map((_, i) => (i * 13) % 256);
      return {
        longString: csvValue(longString),
        longLen: csvValue(longString).length,
        bytesHex: csvValue(bytes),
        bytesLen: csvValue(bytes).length,
        bigint: csvValue(9007199254740993n),
        nul: csvValue(null),
        undef: csvValue(undefined),
        bool: csvValue(false),
        num: csvValue(12345.678)
      };
    });
    expect(out.longLen).toBe(200);
    expect(out.longString).toBe('x'.repeat(200));
    expect(out.bytesLen).toBe(40); // 2 hex chars per byte, all 20 bytes
    expect(out.bigint).toBe('9007199254740993');
    expect(out.nul).toBe('');
    expect(out.undef).toBe('');
    expect(out.bool).toBe('false');
    expect(out.num).toBe('12345.678');
  });
});

test.describe('CSV row assembly', () => {
  test('quotes cells and headers containing commas, quotes, and newlines', async ({ page }) => {
    await openTool(page);
    const csv = await page.evaluate(() => {
      const { rowsToCsv } = window.ParquetViewer;
      const headers = ['plain', 'has,comma', 'has"quote'];
      const rows = [
        { plain: 'a', 'has,comma': 'b,c', 'has"quote': 'd"e' },
        { plain: 'line1\r\nline2', 'has,comma': 1n, 'has"quote': null }
      ];
      return rowsToCsv(rows, headers);
    });
    const lines = csv.split('\n');
    // header: plain, "has,comma", "has""quote"
    expect(lines[0]).toBe('plain,"has,comma","has""quote"');
    // row 1: a,"b,c","d""e"
    expect(lines[1]).toBe('a,"b,c","d""e"');
    // row 2 opens a quoted CRLF field, so the record spans two physical lines
    expect(csv).toContain('"line1\r\nline2",1,');
  });

  test('round trips a simple table with no special characters unquoted', async ({ page }) => {
    await openTool(page);
    const csv = await page.evaluate(() => {
      const { rowsToCsv } = window.ParquetViewer;
      return rowsToCsv([{ a: 1n, b: 'x' }, { a: 2n, b: 'y' }], ['a', 'b']);
    });
    expect(csv).toBe('a,b\n1,x\n2,y');
  });
});

test.describe('byte formatting', () => {
  test('fmtBytes scales units', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { fmtBytes } = window.ParquetViewer;
      return [fmtBytes(0), fmtBytes(512), fmtBytes(1024), fmtBytes(1536), fmtBytes(5 * 1024 * 1024)];
    });
    expect(out[0]).toBe('0 B');
    expect(out[1]).toBe('512 B');
    expect(out[2]).toBe('1.00 KB');
    expect(out[3]).toBe('1.50 KB');
    expect(out[4]).toBe('5.00 MB');
  });
});

test.describe('column aggregation across row groups', () => {
  test('null count is exact only when every chunk reports it', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { aggregateColumns } = window.ParquetViewer;
      const chunk = (path, stats) => ({ meta_data: {
        path_in_schema: [path], type: 'INT64', codec: 'SNAPPY', encodings: ['PLAIN'],
        total_compressed_size: 100, total_uncompressed_size: 200, num_values: 10, statistics: stats
      }});
      const cols = aggregateColumns({ row_groups: [
        { columns: [chunk('a', { null_count: 2 }), chunk('b', { null_count: 1 })] },
        { columns: [chunk('a', { null_count: 3 }), chunk('b', {})] } // b: no null_count in group 2
      ] });
      const by = Object.fromEntries(cols.map((c) => [c.name, c]));
      return { a: { nulls: by.a.nulls, hasNullStat: by.a.hasNullStat }, b: { nulls: by.b.nulls, hasNullStat: by.b.hasNullStat } };
    });
    // a: reported in both groups -> exact total
    expect(out.a).toEqual({ nulls: 5, hasNullStat: true });
    // b: reported in only one group -> not exact (would otherwise undercount)
    expect(out.b.hasNullStat).toBe(false);
  });

  test('min/max reduce across groups and codecs/encodings union', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { aggregateColumns } = window.ParquetViewer;
      const chunk = (opts) => ({ meta_data: {
        path_in_schema: ['x'], type: 'INT64', codec: opts.codec, encodings: opts.enc,
        total_compressed_size: 10, total_uncompressed_size: 20, num_values: 5,
        statistics: { min_value: opts.min, max_value: opts.max }
      }});
      const cols = aggregateColumns({ row_groups: [
        { columns: [chunk({ codec: 'SNAPPY', enc: ['PLAIN'], min: 5, max: 40 })] },
        { columns: [chunk({ codec: 'ZSTD', enc: ['RLE'], min: 1, max: 55 })] }
      ] });
      const c = cols[0];
      return { min: c.min, max: c.max, codecs: [...c.codecs].sort(), encodings: [...c.encodings].sort() };
    });
    expect(out.min).toBe(1);
    expect(out.max).toBe(55);
    expect(out.codecs).toEqual(['SNAPPY', 'ZSTD']);
    expect(out.encodings).toEqual(['PLAIN', 'RLE']);
  });

  test('reduceExtreme keeps the first value when types are not comparable', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { reduceExtreme } = window.ParquetViewer;
      return {
        typeMismatch: reduceExtreme(5, 'apple', -1),   // number vs string -> keep current
        bigintMax: reduceExtreme(10n, 40n, 1),
        stringMin: reduceExtreme('mango', 'apple', -1),
        firstSeen: reduceExtreme(undefined, 7, -1),
        nullCandidate: reduceExtreme(3, null, -1)
      };
    });
    expect(out.typeMismatch).toBe(5);
    expect(out.bigintMax).toBe(40n); // Playwright returns BigInt as-is
    expect(out.stringMin).toBe('apple');
    expect(out.firstSeen).toBe(7);
    expect(out.nullCandidate).toBe(3);
  });
});

// --- scope disclaimer -----------------------------------------------------
// The page carried an 18-word green box in the sidebar reading "Local only.
// Parsing happens entirely in your browser. Files and their contents are never
// sent to any server." True of a dropped file, and not of the URL loader
// sitting on the same screen: pasting a URL is a network fetch the remote host
// sees, along with your IP and anything embedded in the URL.

const DISCLAIMER_PAGE = '/tools/parquet-viewer.html';

test('scope disclaimer is visible, closed, and above the panel', async ({ page }) => {
  await page.goto(DISCLAIMER_PAGE, { waitUntil: 'domcontentloaded' });
  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  const box = await card.boundingBox();
  const panel = await page.locator('.pv-panel').boundingBox();
  expect(box.y).toBeLessThan(panel.y);

  await expect(card.locator('.disclaimer-title')).toContainText('Not a query engine');
  // Both halves of the correction have to read without opening the card.
  await expect(card.locator('.disclaimer-lead')).toContainText('not measured from your data');
  await expect(card.locator('.disclaimer-lead')).toContainText('a pasted URL is fetched from that host');
});

test('scope disclaimer says footer statistics are the writer claims', async ({ page }) => {
  await page.goto(DISCLAIMER_PAGE, { waitUntil: 'domcontentloaded' });
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('This tool repeats it; it does not verify it');
  // The specific wrong conclusion the Columns tab invites.
  await expect(body).toContainText('An absent null count is not a null count of zero');
  await expect(body).toContainText('collation and can be truncated');
});

test('scope disclaimer separates the drop path from the URL path', async ({ page }) => {
  await page.goto(DISCLAIMER_PAGE, { waitUntil: 'domcontentloaded' });

  // Both loaders are on the page, which is why the card distinguishes them.
  await expect(page.locator('#dropZone')).toHaveCount(1);
  await expect(page.locator('#urlInput')).toHaveCount(1);

  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('Dropped files stay put');
  await expect(body).toContainText('file contents are never sent to any server');
  await expect(body).toContainText('A pasted URL is different');
  await expect(body).toContainText('your IP address and the full URL, including any token embedded in it');
  await expect(body).toContainText('hyparquet and its compressors are loaded from a CDN');
  await expect(body).toContainText('Loading a URL that carries a credential or a signed token');
});

test('scope disclaimer names what the reader does not do', async ({ page }) => {
  await page.goto(DISCLAIMER_PAGE, { waitUntil: 'domcontentloaded' });
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('No queries, filters, joins or aggregation');
  await expect(body).toContainText('no checksum or page-level integrity verification');
  await expect(body).toContainText('the first rows of the file, not a random sample');
  await expect(body).toContainText('Where the footer and a full scan disagree, the scan is right');
});

test('scope disclaimer opens by keyboard and carries a touchpoint by the summary bar', async ({ page }) => {
  await page.goto(DISCLAIMER_PAGE, { waitUntil: 'domcontentloaded' });
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');

  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toContainText('Footer metadata, repeated not verified');
  await expect(touch).toContainText('an absent null count is not zero');
  // It lives in #results, which is hidden until a file loads, so it appears
  // with the metadata it qualifies.
  const inResults = await touch.evaluate((el) => Boolean(el.closest('#results')));
  expect(inResults).toBe(true);
});
