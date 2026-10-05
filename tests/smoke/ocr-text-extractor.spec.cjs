// OCR Text Extractor: the pure layer and the reading engine, through
// window.OcrTool on tools/ocr-text-extractor.html. Text drawn here is the
// ground truth, so recognition is held to an error rate, not to a golden:
// a different core build may read one glyph differently.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { repoRoot } = require('./helpers.cjs');

const PAGE = '/tools/ocr-text-extractor.html';
const VENDOR = path.join(repoRoot, 'js', 'vendor', 'ocr_text_extractor');

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.OcrTool))).toBe(true);
}

// Runs a pure function and returns its value, or the code of the error it threw.
function call(page, name, ...args) {
  return page.evaluate(([fn, list]) => {
    try {
      return { value: window.OcrTool[fn](...list) };
    } catch (error) {
      return { code: error.code, message: error.message };
    }
  }, [name, args]);
}

function drawAndRead(page, lines, font) {
  return page.evaluate(async ([rows, face]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 140 + rows.length * 110;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#000000';
    g.font = face;
    rows.forEach((row, i) => g.fillText(row, 50, 120 + i * 110));
    const result = await window.OcrTool.readCanvas(canvas);
    return {
      text: result.text,
      confidence: result.confidence,
      words: result.words,
      low: window.OcrTool.lowConfidenceWords(result.words).map((w) => w.text),
      rate: window.OcrTool.characterErrorRate(rows.join('\n'), result.text)
    };
  }, [lines, font]);
}

// SHA-256 of every vendored file the tool runs, as copied in.
const VENDORED = {
  'eng.traineddata.gz': '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91',
  'pdf-lib.esm.min.js': '72c052d97b4d5d9fa6cdbdcb7ad709f03d4ddb1122390cb3afeba4d88651d969',
  'pdf.min.mjs': 'c3caae2cf1fe9d6e25588d0d239d02454422778ed5897314981496a4656eab82',
  'pdf.worker.min.mjs': 'ee61de6dd3effd826b7083739409e50bae43c2e41a896f27ea8dd2d77e2f349b',
  'tesseract-core-simd-lstm.wasm.js': 'c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38',
  'tesseract.min.js': '000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e',
  'worker.min.js': '576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d',
  'paddle/ch_PP-OCRv4_det_infer.onnx': '30a86f5731181461d08021402766601e4302a9b9b9666be8aff402696339cdff',
  'paddle/en_PP-OCRv5_mobile_rec.onnx': '4e16deb22c4da6468bdca539b2cd3c8687825538b67109177c47d359ab994cd7',
  'paddle/esearch-ocr.js': 'b59bbf338bd8b313ba2962f70197cb25bf28b4f2c57798ce02cff0a31ce2409d',
  'paddle/ort-wasm-simd-threaded.mjs': 'e13f7f94fc51b4ca72b12faeb1ee95f4ace6dfbc8939bc718aabdc0a27c4299b',
  'paddle/ort-wasm-simd-threaded.wasm': '3398c10d07d229bd91b364548e130e0e51a8e5704b88c7c083ebbeb78842dee2',
  'paddle/ort.wasm.min.mjs': '219e6a1fc8a9938268d18efca3c91d310bd2f4a59bbd13744df5b2b7fc6cee3b',
  'paddle/ppocrv5_en_dict.txt': 'e025a66d31f327ba0c232e03f407ae8d105e1e709e7ccb3f408aa778c24e70d6'
};

test.describe('vendored files', () => {
  test('every file the tool runs is the one that was copied in, and no other is there', () => {
    for (const [file, hash] of Object.entries(VENDORED)) {
      const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(VENDOR, file))).digest('hex');
      expect(actual, file).toBe(hash);
    }
    // Anything else in the folder is a license text.
    const found = [];
    for (const folder of ['', 'paddle/']) {
      for (const entry of fs.readdirSync(path.join(VENDOR, folder), { withFileTypes: true })) {
        if (entry.isFile() && !/LICENSE/.test(entry.name)) found.push(folder + entry.name);
      }
    }
    expect(found.sort()).toEqual(Object.keys(VENDORED).sort());
  });
});

test.describe('limits and sizing', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('a file is sorted by type and refused by name at each limit', async ({ page }) => {
    const MB = 1024 * 1024;
    expect((await call(page, 'checkFile', { name: 'a.pdf', type: 'application/pdf', size: 10 })).value).toBe('pdf');
    expect((await call(page, 'checkFile', { name: 'a.PNG', type: 'image/png', size: 10 })).value).toBe('image');
    expect((await call(page, 'checkFile', { name: 'a.jpg', type: 'image/jpeg', size: 10 })).value).toBe('image');
    expect((await call(page, 'checkFile', { name: 'a.webp', type: 'image/webp', size: 10 })).value).toBe('image');
    // A drop from some file managers carries no type, so the extension decides.
    expect((await call(page, 'checkFile', { name: 'scan.PDF', type: '', size: 10 })).value).toBe('pdf');
    expect((await call(page, 'checkFile', { name: 'photo.jpeg', type: '', size: 10 })).value).toBe('image');

    expect((await call(page, 'checkFile', { name: 'a.pdf', type: 'application/pdf', size: 50 * MB })).value).toBe('pdf');
    const big = await call(page, 'checkFile', { name: 'a.pdf', type: 'application/pdf', size: 50 * MB + 1 });
    expect(big.code).toBe('FILE_TOO_LARGE');
    expect(big.message).toContain('50.0 MB');

    expect((await call(page, 'checkFile', { name: 'a.pdf', type: 'application/pdf', size: 0 })).code).toBe('EMPTY_FILE');
    for (const [name, type] of [['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['a.gif', 'image/gif'], ['a.tiff', 'image/tiff'], ['a.svg', 'image/svg+xml'], ['a', ''], ['a.txt', 'text/plain']]) {
      expect((await call(page, 'checkFile', { name, type, size: 10 })).code, name).toBe('UNSUPPORTED_TYPE');
    }
    // The type wins over a misleading extension.
    expect((await call(page, 'checkFile', { name: 'a.pdf', type: 'text/html', size: 10 })).code).toBe('UNSUPPORTED_TYPE');
  });

  test('25 pages are read and 26 are refused whole', async ({ page }) => {
    expect((await call(page, 'checkPageCount', 1)).value).toBe(1);
    expect((await call(page, 'checkPageCount', 25)).value).toBe(25);
    const over = await call(page, 'checkPageCount', 26);
    expect(over.code).toBe('TOO_MANY_PAGES');
    expect(over.message).toContain('26 pages');
    expect(over.message).toContain('limit is 25');
    expect((await call(page, 'checkPageCount', 0)).code).toBe('NO_PAGES');
  });

  test('a page is drawn at 300 DPI until that would pass 12 megapixels', async ({ page }) => {
    // US Letter: 2550 by 3300 px, 8.4 MP, under the cap.
    const letter = (await call(page, 'renderScale', 612, 792)).value;
    expect(letter.scale).toBeCloseTo(300 / 72, 12);
    expect(letter.dpi).toBeCloseTo(300, 9);
    expect(letter.reduced).toBe(false);

    // A2 at 300 DPI would be 34.8 MP.
    const a2 = (await call(page, 'renderScale', 1190.55, 1683.78)).value;
    expect(a2.reduced).toBe(true);
    expect(a2.scale * a2.scale * 1190.55 * 1683.78).toBeCloseTo(12_000_000, 3);
    expect(a2.dpi).toBeCloseTo(72 * Math.sqrt(12_000_000 / (1190.55 * 1683.78)), 9);

    // A square page that is exactly 12 MP at 300 DPI sits on the boundary.
    const edge = Math.sqrt(12_000_000) / (300 / 72);
    expect((await call(page, 'renderScale', edge, edge)).value.dpi).toBeCloseTo(300, 9);
    expect((await call(page, 'renderScale', edge * 1.01, edge)).value.reduced).toBe(true);

    expect((await call(page, 'renderScale', 0, 792)).code).toBe('BAD_PAGE_SIZE');
    expect((await call(page, 'renderScale', 612, NaN)).code).toBe('BAD_PAGE_SIZE');
  });

  test('an image is scaled down to 4000 px on its longest side and never up', async ({ page }) => {
    expect((await call(page, 'fitImage', 4000, 3000)).value).toEqual({ scale: 1, width: 4000, height: 3000, reduced: false });
    expect((await call(page, 'fitImage', 8000, 6000)).value).toEqual({ scale: 0.5, width: 4000, height: 3000, reduced: true });
    expect((await call(page, 'fitImage', 3000, 12000)).value).toEqual({ scale: 1 / 3, width: 1000, height: 4000, reduced: true });
    expect((await call(page, 'fitImage', 200, 100)).value).toEqual({ scale: 1, width: 200, height: 100, reduced: false });
    expect((await call(page, 'fitImage', 0, 100)).code).toBe('BAD_IMAGE_SIZE');
  });

  test('a page counts as text at 20 visible characters, not 19', async ({ page }) => {
    expect((await call(page, 'isTextPage', 'a'.repeat(19))).value).toBe(false);
    expect((await call(page, 'isTextPage', 'a'.repeat(20))).value).toBe(true);
    // Spaces and line breaks are not text.
    expect((await call(page, 'isTextPage', `${'a b '.repeat(9)}a \n\n   `)).value).toBe(false);
    expect((await call(page, 'isTextPage', 'a b '.repeat(10))).value).toBe(true);
    expect((await call(page, 'isTextPage', '')).value).toBe(false);
    expect((await call(page, 'isTextPage', null)).value).toBe(false);
  });
});

test.describe('text assembly and page rows', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('pages are joined with a marker each, and one page gets none', async ({ page }) => {
    const pages = [{ number: 1, text: 'first\n\n' }, { number: 2, text: 'second  \n' }];
    expect((await call(page, 'assembleText', pages)).value).toBe('--- Page 1 ---\nfirst\n\n--- Page 2 ---\nsecond');
    expect((await call(page, 'assembleText', pages, { separators: false })).value).toBe('first\n\nsecond');
    expect((await call(page, 'assembleText', [pages[0]])).value).toBe('first');
    expect((await call(page, 'assembleText', [])).value).toBe('');
    // A stopped run keeps the real page numbers.
    expect((await call(page, 'assembleText', [{ number: 3, text: 'c' }, { number: 4, text: 'd' }])).value)
      .toBe('--- Page 3 ---\nc\n\n--- Page 4 ---\nd');
  });

  test('a row reports words, confidence and what to check for its kind of page', async ({ page }) => {
    const words = [
      { text: 'Total', confidence: 96 }, { text: '1,274.50', confidence: 60 },
      { text: 'O0111', confidence: 59.9 }, { text: 'mm', confidence: 32 }
    ];
    expect((await call(page, 'lowConfidenceWords', words)).value.map((w) => w.text)).toEqual(['O0111', 'mm']);

    const read = (await call(page, 'summarizePage', { number: 2, source: 'image', text: 'Total 1,274.50 O0111 mm', confidence: 69.9, words })).value;
    expect(read).toEqual({ number: 2, source: 'image', words: 4, confidence: 69.9, lowCount: 2, weak: true, empty: false });
    const good = (await call(page, 'summarizePage', { number: 1, source: 'image', text: 'Total', confidence: 70, words: [words[0]] })).value;
    expect(good.weak).toBe(false);

    // Text copied from the file has no confidence and nothing flagged.
    const copied = (await call(page, 'summarizePage', { number: 3, source: 'file', text: 'one two\nthree' })).value;
    expect(copied).toEqual({ number: 3, source: 'file', words: 3, confidence: null, lowCount: 0, weak: false, empty: false });

    const blank = (await call(page, 'summarizePage', { number: 4, source: 'image', text: ' \n', confidence: 0, words: [] })).value;
    expect(blank.empty).toBe(true);
    expect(blank.words).toBe(0);
  });

  test('the error rate is edit distance over the reference length', async ({ page }) => {
    expect((await call(page, 'characterErrorRate', 'abc', 'abc')).value).toBe(0);
    // kitten to sitting: two substitutions and one insertion.
    expect((await call(page, 'characterErrorRate', 'kitten', 'sitting')).value).toBeCloseTo(3 / 6, 12);
    expect((await call(page, 'characterErrorRate', 'abcd', '')).value).toBe(1);
    expect((await call(page, 'characterErrorRate', 'rn m', 'mm')).value).toBeCloseTo(3 / 4, 12);
    // Line breaks and runs of spaces are one space.
    expect((await call(page, 'characterErrorRate', 'a b\nc', ' a  b c\n')).value).toBe(0);
    expect((await call(page, 'characterErrorRate', '', '')).value).toBe(0);
    expect((await call(page, 'characterErrorRate', '', 'x')).value).toBe(1);
  });

  test('the saved file is named after the source with unsafe characters removed', async ({ page }) => {
    expect((await call(page, 'textFileName', 'Invoice 12.pdf')).value).toBe('Invoice 12.txt');
    expect((await call(page, 'textFileName', 'scan.final.JPEG')).value).toBe('scan.final.txt');
    expect((await call(page, 'textFileName', 'a/b:c*?.png')).value).toBe('a_b_c_.txt');
    expect((await call(page, 'textFileName', '')).value).toBe('ocr-text.txt');
    expect((await call(page, 'textFileName', undefined)).value).toBe('ocr-text.txt');
  });
});

test.describe('recognition against text drawn in the test', () => {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ page }) => { await openTool(page); });

  const LINES = [
    'The quick brown fox jumps over the lazy dog.',
    'Invoice 100482 total 1,274.50 due 2026-10-04'
  ];

  test('this browser has the WebAssembly SIMD the single vendored core needs', async ({ page }) => {
    expect(await page.evaluate(() => window.OcrTool.hasWasmSimd())).toBe(true);
  });

  test('large serif print is read exactly, with every word and its box', async ({ page }) => {
    const result = await drawAndRead(page, LINES, '48px serif');
    expect(result.rate).toBe(0);
    expect(result.confidence).toBeGreaterThanOrEqual(85);
    expect(result.words.map((w) => w.text)).toEqual(LINES.join(' ').split(' '));
    expect(result.low).toEqual([]);
    // Boxes run left to right along the first line and sit inside the canvas.
    const first = result.words.slice(0, 9);
    for (let i = 1; i < first.length; i++) expect(first[i].bbox.x0).toBeGreaterThan(first[i - 1].bbox.x0);
    for (const word of result.words) {
      expect(word.bbox.x0).toBeGreaterThanOrEqual(0);
      expect(word.bbox.x1).toBeLessThanOrEqual(1800);
      expect(word.bbox.x1).toBeGreaterThan(word.bbox.x0);
      expect(word.bbox.y1).toBeGreaterThan(word.bbox.y0);
    }
  });

  for (const font of ['32px serif', '24px serif', '48px sans-serif', '32px sans-serif', '24px sans-serif']) {
    test(`${font} print stays under a 2% character error rate`, async ({ page }) => {
      const result = await drawAndRead(page, LINES, font);
      expect(result.rate, result.text).toBeLessThanOrEqual(0.02);
    });
  }

  test('look-alike characters are misread, and the engine doubts at least one of them', async ({ page }) => {
    // The reason the page says an unflagged word is not a verified one.
    const result = await drawAndRead(page, ['O0 l1 I| S5 B8 rn m'], '48px serif');
    expect(result.rate).toBeGreaterThan(0);
    expect(result.low.length).toBeGreaterThanOrEqual(1);
  });

  test('a blank page reads as nothing', async ({ page }) => {
    const result = await drawAndRead(page, [], '48px serif');
    expect(result.text.trim()).toBe('');
    expect(result.words).toEqual([]);
  });
});
