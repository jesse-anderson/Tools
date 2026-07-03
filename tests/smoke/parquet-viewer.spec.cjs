// Tests the parquet viewer's data-export serialization via window.ParquetViewer.
// Guards the CSV export against re-truncating strings or byte arrays and against
// unescaped commas/quotes/newlines in cells or header names.
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/parquet-viewer.html';
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
