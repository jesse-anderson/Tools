// PDF Diff Checker: pure engine tests via window.PdfDiffEngine plus an
// end-to-end multi-page comparison using tiny PDFs generated in-test.
// Covers the July 2026 expansion: vendored diff-match-patch (Diff objects
// are index-accessed, not destructured), region-count stats (the old UI
// halved modification counts), space-preserving extraction, word/char
// granularity, ignore-case and page-break options, change navigation,
// visual pixel diff, and TXT/JSON export.
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/pdf-diff.html';
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

// ============================================
// Minimal PDF fixture builder (Helvetica text, correct xref)
// ============================================

function buildPdf(pages) {
  const objects = [];
  const add = (buf) => { objects.push(buf); return objects.length; };

  const nPages = pages.length;
  const fontNum = 3 + 2 * nPages;
  const pageNums = [];
  const contentNums = [];
  for (let i = 0; i < nPages; i++) {
    pageNums.push(3 + 2 * i);
    contentNums.push(4 + 2 * i);
  }
  const kids = pageNums.map((n) => `${n} 0 R`).join(' ');

  add(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'));
  add(Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${nPages} >>`));

  for (let i = 0; i < nPages; i++) {
    add(Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fontNum} 0 R >> >> /Contents ${contentNums[i]} 0 R >>`
    ));
    const ops = pages[i].map(([x, y, size, text]) => {
      const safe = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      return `BT /F1 ${size} Tf ${x} ${y} Td (${safe}) Tj ET`;
    }).join('\n');
    const stream = Buffer.from(ops);
    add(Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),
      stream,
      Buffer.from('\nendstream')
    ]));
  }

  add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));

  const chunks = [Buffer.from('%PDF-1.4\n')];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((obj, index) => {
    offsets.push(offset);
    const wrapped = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`), obj, Buffer.from('\nendobj\n')
    ]);
    chunks.push(wrapped);
    offset += wrapped.length;
  });
  const xrefPos = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}

const FIXTURE_A = buildPdf([
  [
    [72, 720, 14, 'Project Report Alpha'],
    [72, 690, 11, 'The quick brown fox jumps over the lazy dog.'],
    [72, 670, 11, 'Line two stays identical on both documents.']
  ],
  [
    [72, 720, 14, 'Second Page Heading'],
    [72, 690, 11, 'Page two content line one.'],
    [72, 670, 11, 'This sentence will be removed in version B.']
  ]
]);

const FIXTURE_B = buildPdf([
  [
    [72, 720, 14, 'Project Report Alpha'],
    [72, 690, 11, 'The quick orange fox jumps over the lazy dog.'],
    [72, 670, 11, 'Line two stays identical on both documents.']
  ],
  [
    [72, 720, 14, 'Second Page Heading'],
    [72, 690, 11, 'Page two content line one.'],
    [72, 650, 11, 'Brand new closing line only in B.']
  ]
]);

// The page ships a strict CSP (no 'unsafe-eval'), which blocks
// waitForFunction's in-page polling. expect.poll drives repeated
// page.evaluate calls from Node instead, which the CSP allows.
async function openTool(page) {
  await page.goto(TOOL_PATH);
  await expect.poll(
    () => page.evaluate(() => Boolean(window.PdfDiffEngine) && typeof window.diff_match_patch !== 'undefined'),
    { timeout: 30000 }
  ).toBe(true);
}

// ============================================
// Pure engine tests
// ============================================

test('diff stats count regions and chars without halving', async ({ page }) => {
  await openTool(page);
  // Hand-built op list pins the counting semantics exactly: one
  // delete+insert pair = ONE modification (the old UI halved this),
  // plus one standalone insertion and one standalone deletion.
  const stats = await page.evaluate(() => {
    const E = window.PdfDiffEngine;
    const ops = [
      [0, 'same '],
      [-1, 'old'],
      [1, 'new'],
      [0, ' mid '],
      [1, 'added'],
      [0, ' tail '],
      [-1, 'gone']
    ];
    return E.getDiffStats(ops);
  });
  expect(stats.modifications).toBe(1);
  expect(stats.insertions).toBe(1);
  expect(stats.deletions).toBe(1);
  expect(stats.modifiedChars).toBe(3);
  expect(stats.insertedChars).toBe(5);
  expect(stats.deletedChars).toBe(4);
  expect(stats.unchanged).toBe('same '.length + ' mid '.length + ' tail '.length);
});

test('prepareDiffText preserves length for ignore-case and page-break options', async ({ page }) => {
  await openTool(page);
  const result = await page.evaluate(() => {
    const E = window.PdfDiffEngine;
    const source = 'AbC\fDeF';
    return {
      ic: E.prepareDiffText(source, { ignoreCase: true }),
      pb: E.prepareDiffText(source, { pageBreaksAsSpaces: true }),
      both: E.prepareDiffText(source, { ignoreCase: true, pageBreaksAsSpaces: true })
    };
  });
  expect(result.ic).toBe('abc\fdef');
  expect(result.pb).toBe('AbC DeF');
  expect(result.both).toBe('abc def');
});

test('ignore-case option removes case-only differences', async ({ page }) => {
  await openTool(page);
  const counts = await page.evaluate(() => {
    const E = window.PdfDiffEngine;
    const noOption = E.computeDiff('Hello World', 'hello world');
    const withOption = E.computeDiff('Hello World', 'hello world', { ignoreCase: true });
    return {
      noOption: noOption.filter((d) => d[0] !== 0).length,
      withOption: withOption.filter((d) => d[0] !== 0).length
    };
  });
  expect(counts.noOption).toBeGreaterThan(0);
  expect(counts.withOption).toBe(0);
});

test('word granularity yields whole-word ops that reassemble both texts', async ({ page }) => {
  await openTool(page);
  const result = await page.evaluate(() => {
    const E = window.PdfDiffEngine;
    const textA = 'alpha beta gamma delta';
    const textB = 'alpha BETA gamma epsilon';
    const diffs = E.computeDiff(textA, textB, { granularity: 'word' });
    let rebuiltA = '';
    let rebuiltB = '';
    for (const d of diffs) {
      if (d[0] !== 1) rebuiltA += d[1];
      if (d[0] !== -1) rebuiltB += d[1];
    }
    return { rebuiltA, rebuiltB, ops: diffs.map((d) => [d[0], d[1]]) };
  });
  expect(result.rebuiltA).toBe('alpha beta gamma delta');
  expect(result.rebuiltB).toBe('alpha BETA gamma epsilon');
  // The unchanged first word must be inside an equal op
  expect(result.ops[0][0]).toBe(0);
  expect(result.ops[0][1]).toContain('alpha');
});

test('token range mapping skips space and page-break tokens', async ({ page }) => {
  await openTool(page);
  const result = await page.evaluate(() => {
    const E = window.PdfDiffEngine;
    const mkTok = (text, extras = {}) => ({
      text, pageIndex: 0, x: 10, y: 10, width: 5, height: 10, ...extras
    });
    const sequence = [
      mkTok('a'),
      mkTok(' ', { isSpace: true }),
      mkTok('b'),
      mkTok('\f', { isPageBreak: true, x: null, y: null, width: null, height: null }),
      mkTok('c', { pageIndex: 1 })
    ];
    // Range covering everything: only a, b, c should come back
    const tokens = E.getTokensInRange(sequence, 0, 5);
    return tokens.map((t) => ({ text: t.text, page: t.pageIndex }));
  });
  expect(result).toEqual([
    { text: 'a', page: 0 },
    { text: 'b', page: 0 },
    { text: 'c', page: 1 }
  ]);
});

test('document sequence orders pages, rows, and same-row items left to right', async ({ page }) => {
  await openTool(page);
  const text = await page.evaluate(() => {
    const E = window.PdfDiffEngine;
    const tok = (text, pageIndex, itemIndex, x, y) => ({
      text, pageIndex, itemIndex, x, y, width: 5, height: 10, sourcePdf: 'A'
    });
    // Page 1 listed before page 0; same-row items given out of x order
    const items = [
      tok('2', 1, 0, 10, 700),
      tok('B', 0, 2, 60, 700),
      tok('A', 0, 1, 10, 700),
      tok('z', 0, 3, 10, 650)
    ];
    const seq = E.buildDocumentTextSequence(items);
    return E.sequenceToPlainText(seq);
  });
  // Page 0 first: A then B (same row, x order), then z (lower row), page break,
  // then page 1 content and its page break
  expect(text.replace(/ +/g, ' ')).toBe('A B z \f2 \f');
});

test('bbox conversion flips Y and scales; pixel diff counts changed pixels', async ({ page }) => {
  await openTool(page);
  const result = await page.evaluate(() => {
    const E = window.PdfDiffEngine;
    const bbox = E.bboxToCanvasSpace({ x: 10, y: 700, width: 50, height: 12 }, 2, 792);
    const white = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
    const mixed = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const pd = E.computePixelDiff(white, mixed, 30);
    return { bbox, changed: pd.changedPixels, total: pd.totalPixels };
  });
  // Canvas y = (pageHeight - y - height) * scale = (792 - 700 - 12) * 2
  expect(result.bbox).toEqual({ x: 20, y: 160, width: 100, height: 24 });
  expect(result.changed).toBe(1);
  expect(result.total).toBe(2);
});

// ============================================
// End-to-end multi-page comparison
// ============================================

test('multi-page compare: diffs on both pages, change navigation, exports', async ({ page }) => {
  test.setTimeout(90_000);
  await openTool(page);

  await page.setInputFiles('#pdfAInput', {
    name: 'fixture-a.pdf', mimeType: 'application/pdf', buffer: FIXTURE_A
  });
  await page.setInputFiles('#pdfBInput', {
    name: 'fixture-b.pdf', mimeType: 'application/pdf', buffer: FIXTURE_B
  });
  await expect.poll(
    () => page.evaluate(() => !document.getElementById('compareBtn').disabled),
    { timeout: 20000 }
  ).toBe(true);
  await page.click('#compareBtn');
  await expect.poll(
    () => page.evaluate(() => document.getElementById('summarySection').style.display !== 'none'),
    { timeout: 30000 }
  ).toBe(true);

  const state = await page.evaluate(() => {
    const s = window.pdfDiffState;
    return {
      seqText: s.sequenceA.map((t) => t.text).join(''),
      pagesWithDiffsA: Object.keys(s.pageDiffsA),
      pagesWithDiffsB: Object.keys(s.pageDiffsB),
      changeCount: s.changes.length,
      overlayRects: document.getElementById('overlayA').querySelectorAll('rect').length
    };
  });

  // Extraction preserves intra-item spaces (regression: spaces were dropped)
  expect(state.seqText).toContain('The quick brown fox');
  // Both pages carry diffs
  expect(state.pagesWithDiffsA).toEqual(['0', '1']);
  expect(state.pagesWithDiffsB).toEqual(['0', '1']);
  expect(state.changeCount).toBeGreaterThanOrEqual(2);
  expect(state.overlayRects).toBeGreaterThan(0);

  // Change navigation reaches page 2 on both panes
  await page.click('#nextChangeBtn'); // change 1 (page 1)
  await page.click('#nextChangeBtn'); // change 2 (page 2)
  await expect(page.locator('#pageIndicatorA')).toHaveText('Page 2 of 2', { timeout: 15000 });
  await expect(page.locator('#pageIndicatorB')).toHaveText('Page 2 of 2');
  const focusedRects = await page.locator('.highlight-rect.focused').count();
  expect(focusedRects).toBeGreaterThan(0);

  // Visual pixel diff renders and reports a nonzero difference
  await page.click('#visualDiffBtn');
  await expect.poll(
    () => page.evaluate(() => document.getElementById('visualDiffInfo').textContent.includes('%')),
    { timeout: 30000 }
  ).toBe(true);
  const visualInfo = await page.locator('#visualDiffInfo').textContent();
  expect(visualInfo).toMatch(/[0-9.]+% of pixels differ/);
  expect(visualInfo).not.toMatch(/^0\.00%/);

  // JSON export carries options and non-halved region counts
  const downloadPromise = page.waitForEvent('download');
  await page.click('#exportJsonBtn');
  const download = await downloadPromise;
  const fs = require('fs');
  const body = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(body.metadata.options).toHaveProperty('granularity');
  expect(body.summary.modifications).toBeGreaterThanOrEqual(1);
  expect(body.summary).toHaveProperty('insertedChars');
  expect(body.changes.pdfA.length + body.changes.pdfB.length).toBeGreaterThan(0);
});
