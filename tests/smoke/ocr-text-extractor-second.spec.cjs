// OCR Text Extractor: the second engine (PP-OCR). When a page goes to it,
// when its reading is kept, what its lines become in the text, the table and
// the saved PDF, and the mode that reads every page with both engines.
const { test, expect } = require('@playwright/test');
const { drawImage, buildPdf, scannedPage, readPdf, LINE_X, lineBaseline } = require('./ocr-fixtures.cjs');

const { OCR_WORKER_CSP } = require('./server.cjs');

const PAGE = '/tools/ocr-text-extractor.html';
const PADDLE = '/js/vendor/ocr_text_extractor/paddle/';

test.describe.configure({ timeout: 180_000 });

const LINES = [
  'Quarterly meter readings from north plant',
  'Invoice 100482 totals 1,274.50 dollars',
  'Signed copies return before Friday'
];
// Three empty rows first, so the print stays on the page when it is tilted.
const LOW = ['', '', '', ...LINES];
// Past the 30 degrees the tool turns a page by itself.
const TILT = 40;
const WIDTH = 1275;
const HEIGHT = 1650;

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.OcrTool))).toBe(true);
}

async function read(page, name, mimeType, buffer) {
  await page.setInputFiles('#fileInput', { name, mimeType, buffer });
  await expect(page.locator('#runStatus')).toContainText(/^Done: /, { timeout: 150_000 });
}

const call = (page, name, ...args) => page.evaluate(([fn, list]) => window.OcrTool[fn](...list), [name, args]);
const rate = (page, reference) => page.evaluate(
  (ref) => window.OcrTool.characterErrorRate(ref, document.getElementById('textOutput').value), reference
);
const detail = (page, row = 0) => page.locator('#pagesTable tbody tr').nth(row).locator('td').nth(1).textContent();
const tilted = (page, options = {}) => drawImage(page, LOW, { skewDeg: TILT, ...options });

// Which of the second engine's files the page asked for.
function watchPaddle(page) {
  const seen = [];
  page.on('request', (request) => {
    const at = request.url().indexOf(PADDLE);
    if (at >= 0) seen.push(request.url().slice(at + PADDLE.length));
  });
  return seen;
}

async function savePdf(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPdf')]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// How each run of text in a saved PDF is painted. 3 is invisible.
function textModes(page, buffer) {
  return page.evaluate(async (base64) => {
    const pdfjs = await import('/js/vendor/ocr_text_extractor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/js/vendor/ocr_text_extractor/pdf.worker.min.mjs';
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    const ops = await (await doc.getPage(doc.numPages)).getOperatorList();
    const modes = [];
    let mode = 0;
    ops.fnArray.forEach((fn, i) => {
      if (fn === pdfjs.OPS.setTextRenderingMode) mode = ops.argsArray[i][0];
      if (fn === pdfjs.OPS.beginText) mode = modes.length ? mode : 0;
      if (fn === pdfjs.OPS.showText) modes.push(mode);
    });
    await doc.destroy();
    return modes;
  }, buffer.toString('base64'));
}

// Puts an image on a canvas the page keeps, for calling an engine directly.
async function holdCanvas(page, buffer) {
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    window.held = canvas;
  }, buffer.toString('base64'));
}

// The hidden text of each line must start where the test drew the line, run
// along it, and be as long as it. The second engine gives one item a line and
// its boxes carry a margin, so the hold is looser than for the first engine.
async function textAlongLines(page, read1, { scale, first = 3, deg = TILT }) {
  const angle = deg * Math.PI / 180;
  const widths = await page.evaluate((rows) => {
    const g = document.createElement('canvas').getContext('2d');
    g.font = '44px serif';
    return rows.map((row) => g.measureText(row).width);
  }, LINES);
  for (let i = 0; i < LINES.length; i++) {
    const item = read1.items.find((entry) => entry.str.startsWith(LINES[i].split(' ')[0]));
    expect(item, `line ${i + 1} has hidden text`).toBeTruthy();
    const dx = LINE_X - WIDTH / 2;
    const dy = lineBaseline(first + i) - HEIGHT / 2;
    const x = (WIDTH / 2 + dx * Math.cos(angle) - dy * Math.sin(angle)) * scale;
    const y = (HEIGHT / 2 + dx * Math.sin(angle) + dy * Math.cos(angle)) * scale;
    expect(Math.hypot(item.x - x, item.y - y), `line ${i + 1} starts at ${item.x}, ${item.y} against ${x}, ${y}`).toBeLessThanOrEqual(16 * scale);
    expect(item.dx).toBeCloseTo(Math.cos(angle), 1);
    expect(item.dy).toBeCloseTo(Math.sin(angle), 1);
    expect(Math.abs(item.width - widths[i] * scale) / (widths[i] * scale), `line ${i + 1} length`).toBeLessThan(0.06);
  }
}

test.describe('the rules', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('a page goes to the second engine under 70, or when it holds print and nothing was read', async ({ page }) => {
    const words = 'Some words here';
    expect(await call(page, 'needsSecond', { text: words, confidence: 69.9 }, true)).toBe(true);
    expect(await call(page, 'needsSecond', { text: words, confidence: 70 }, true)).toBe(false);
    expect(await call(page, 'needsSecond', { text: words, confidence: 95 }, false)).toBe(false);
    // Nothing read: only a page that measured as holding print is worth a second look.
    expect(await call(page, 'needsSecond', { text: ' \n', confidence: 0 }, true)).toBe(true);
    expect(await call(page, 'needsSecond', { text: '', confidence: 95 }, false)).toBe(false);
  });

  test('the second reading is kept at 90 on its own scale with at least half as much text', async ({ page }) => {
    const first = { text: 'abcdefghij', confidence: 40 };
    expect(await call(page, 'secondWins', first, { text: 'abcde', confidence: 90 })).toBe(true);
    expect(await call(page, 'secondWins', first, { text: 'abcde', confidence: 89.9 })).toBe(false);
    expect(await call(page, 'secondWins', first, { text: 'ab cd', confidence: 99 })).toBe(false);
    expect(await call(page, 'secondWins', first, { text: '  ', confidence: 99 })).toBe(false);
    // The first engine's own score plays no part: the scales differ.
    expect(await call(page, 'secondWins', { text: 'abcdefghij', confidence: 99 }, { text: 'abcdefghij', confidence: 90 })).toBe(true);
    expect(await call(page, 'secondWins', { text: '', confidence: 0 }, { text: 'a', confidence: 95 })).toBe(true);
    // A reading that lost more than a quarter of the lines it found is partial.
    expect(await call(page, 'secondWins', first, { text: 'abcdefghij', confidence: 99, found: 8, lost: 2 })).toBe(true);
    expect(await call(page, 'secondWins', first, { text: 'abcdefghij', confidence: 99, found: 8, lost: 3 })).toBe(false);
  });

  test('lines become text in reading order, a word scoring as its least certain character', async ({ page }) => {
    const chars = (text, means) => [...text].map((t, i) => ({ t, mean: means[i] ?? 1 }));
    const box = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const lines = [
      { box: box(100, 300, 400, 40), chars: chars('second line', [1, 1, 1, 1, 1, 1, 1, 0.9, 0.4, 0.8, 1]) },
      { box: box(100, 100, 300, 40), chars: chars(' top  row ', [1, 0.9, 0.7, 0.8, 1, 1, 0.5, 0.6, 1, 1]) },
      { box: box(100, 500, 200, 40), chars: chars('   ', []) },
      { box: box(100, 700, 200, 40), chars: chars('last', [0.99, 0.98, 0.97, 0.96]) }
    ];
    const reading = await call(page, 'readingFromLines', lines, [[1, 0], [2], [3]]);
    expect(reading.text).toBe('top row\nsecond line\n\nlast');
    expect(reading.words.map((word) => word.text)).toEqual(['top', 'row', 'second', 'line', 'last']);
    expect(reading.words.map((word) => Math.round(word.confidence))).toEqual([70, 50, 100, 40, 96]);
    expect(reading.confidence).toBeCloseTo((70 + 50 + 100 + 40 + 96) / 5, 6);
    // "top" is characters 1 to 4 of the ten in its line, which is 300 px long.
    expect(reading.words[0].bbox).toEqual({ x0: 130, y0: 100, x1: 220, y1: 140 });
    // "line" is characters 7 to 11 of eleven, on a line 400 px long.
    const line = reading.words[3].bbox;
    expect(line.x0).toBeCloseTo(100 + 400 * 7 / 11, 6);
    expect(line.x1).toBeCloseTo(500, 6);
    expect(reading.lines).toEqual([
      { text: 'top row', box: lines[1].box },
      { text: 'second line', box: lines[0].box },
      { text: 'last', box: lines[3].box }
    ]);
    // Four lines were found and one of them held nothing.
    expect([reading.found, reading.lost]).toEqual([4, 1]);
    expect(await call(page, 'readingFromLines', [], [])).toEqual({ text: '', confidence: 0, words: [], lines: [], found: 0, lost: 0 });
  });

  test('part of a tilted line is boxed by its corners, and a doubted word is one under 85', async ({ page }) => {
    // A line climbing 100 px over its 200 px length, 20 px tall.
    const quad = [[0, 100], [200, 0], [200, 20], [0, 120]];
    expect(await call(page, 'partOfLine', quad, 0.25, 0.5)).toEqual({ x0: 50, y0: 50, x1: 100, y1: 95 });
    const words = [{ confidence: 84.9 }, { confidence: 85 }, { confidence: 20 }];
    expect((await call(page, 'doubtedBySecond', words)).map((word) => word.confidence)).toEqual([84.9, 20]);
  });

  test('a line of hidden text is stretched to its box and laid along its slope', async ({ page }) => {
    // Level: 300 px long and 40 tall, its foot 200 px down a page 1000 tall.
    const level = await call(page, 'textLinePlacement', [[100, 160], [400, 160], [400, 200], [100, 200]], 1000, 5);
    expect(level.size).toBe(40);
    // Five units wide at size 1 is 200 at size 40, so it is stretched by 1.5.
    expect(level.matrix.map((value) => +value.toFixed(6) + 0)).toEqual([1.5, 0, 0, 1, 100, 808]);
    // Running straight up the page: the image's bottom-left corner is where it starts.
    const up = await call(page, 'textLinePlacement', [[100, 500], [100, 200], [140, 200], [140, 500]], 1000, 5);
    expect(up.size).toBeCloseTo(40, 6);
    expect(up.matrix.map((value) => +value.toFixed(6) + 0)).toEqual([0, 1.5, -1, 0, 132, 500]);
    expect(await call(page, 'textLinePlacement', [[5, 5], [5, 5], [5, 5], [5, 5]], 1000, 5)).toBeNull();
    expect(await call(page, 'textLinePlacement', [[0, 0], [10, 0], [10, 10], [0, 10]], 1000, 0)).toBeNull();
  });

  test('two readings are lined up word by word, and what they share is counted', async ({ page }) => {
    const diff = await call(page, 'diffWords', 'the quick brown fox\njumps over', 'the quiet brown fox jumped over it');
    expect(diff.left.filter((word) => !word.same).map((word) => word.text)).toEqual(['quick', 'jumps']);
    expect(diff.right.filter((word) => !word.same).map((word) => word.text)).toEqual(['quiet', 'jumped', 'it']);
    // Four shared words of six and seven.
    expect(diff.agreement).toBeCloseTo(8 / 13, 9);
    expect((await call(page, 'diffWords', 'same words', ' same\n\nwords ')).agreement).toBe(1);
    expect(await call(page, 'diffWords', '', '  ')).toEqual({ left: [], right: [], agreement: 1 });
    expect((await call(page, 'diffWords', 'only here', '')).agreement).toBe(0);
    // Order counts: the same words the other way round share one.
    expect((await call(page, 'diffWords', 'a b', 'b a')).agreement).toBe(0.5);
    expect(await call(page, 'diffWords', 'a b c', 'a b c', { maxDiffCells: 8 })).toBeNull();
  });

  test('the slope of a page is read from its line boxes, whichever way their corners are listed', async ({ page }) => {
    // A box 300 long and 30 tall, its long side at `deg` from level.
    const box = (deg, x = 500, y = 500, long = 300, tall = 30) => {
      const a = deg * Math.PI / 180;
      const u = [Math.cos(a), Math.sin(a)];
      const v = [-Math.sin(a), Math.cos(a)];
      return [[x, y], [x + u[0] * long, y + u[1] * long], [x + u[0] * long + v[0] * tall, y + u[1] * long + v[1] * tall], [x + v[0] * tall, y + v[1] * tall]];
    };
    const degrees = async (boxes) => (await call(page, 'lineAngle', boxes)) * 180 / Math.PI;
    expect(await degrees([])).toBe(0);
    expect(await degrees([box(0), box(0, 100, 900)])).toBeCloseTo(0, 6);
    expect(await degrees([box(40), box(40, 100, 900)])).toBeCloseTo(40, 6);
    expect(await degrees([box(-60)])).toBeCloseTo(-60, 6);
    // The same slope listed from the other end.
    expect(await degrees([box(220)])).toBeCloseTo(40, 6);
    // Listed with the short side first, as the engine does for upright boxes.
    const upright = box(70);
    expect(await degrees([[upright[1], upright[2], upright[3], upright[0]]])).toBeCloseTo(70, 6);
    // 89 and -89 are two degrees apart, not 178.
    expect(Math.abs(await degrees([box(89), box(-89)]))).toBeCloseTo(90, 6);
    // A long line outvotes a short one, and a square says nothing.
    expect(await degrees([box(10, 0, 0, 900), box(50, 0, 0, 90, 30)])).toBeLessThan(15);
    expect(await degrees([box(45, 0, 0, 30, 30)])).toBe(0);

    const rad = (deg) => deg * Math.PI / 180;
    expect(await call(page, 'isSteep', rad(30))).toBe(false);
    expect(await call(page, 'isSteep', rad(30.5))).toBe(true);
    expect(await call(page, 'isSteep', rad(-31))).toBe(true);
    expect(await call(page, 'longestLines', [box(0, 0, 0, 100), box(0, 0, 0, 300), box(90, 0, 0, 200), box(0, 0, 0, 300)], 3)).toEqual([1, 3, 2]);
  });

  test('a box found on a turned page is put back where it lies on the page as it came', async ({ page }) => {
    const round = (box) => box.map((point) => point.map((value) => Math.round(value * 1000) / 1000 + 0));
    // A page 400 by 200 turned a quarter clockwise fills a canvas 200 by 400.
    // Its top left corner is then at the top right.
    const quarter = Math.PI / 2;
    const back = await call(page, 'turnBack', [[200, 0], [200, 400], [0, 400], [0, 0]], quarter, { width: 200, height: 400 }, { width: 400, height: 200 });
    expect(round(back)).toEqual([[0, 0], [400, 0], [400, 200], [0, 200]]);
    // No turn and the same canvas leaves a box alone.
    const same = [[10, 20], [110, 20], [110, 50], [10, 50]];
    expect(round(await call(page, 'turnBack', same, 0, { width: 300, height: 300 }, { width: 300, height: 300 }))).toEqual(same);
    // Turned half way round, a box keeps its place and lists its corners from the other end.
    expect(await call(page, 'turnedOver', same, 300, 300)).toEqual([[190, 250], [290, 250], [290, 280], [190, 280]]);
    expect(await call(page, 'turnedOver', await call(page, 'turnedOver', same, 300, 300), 300, 300)).toEqual(same);
  });

  test('lines are dealt out in turn among the workers', async ({ page }) => {
    expect(await call(page, 'shareOut', 7, 3)).toEqual([[0, 3, 6], [1, 4], [2, 5]]);
    expect(await call(page, 'shareOut', 2, 4)).toEqual([[0], [1], [], []]);
    expect(await call(page, 'shareOut', 3, 1)).toEqual([[0, 1, 2]]);
    expect(await call(page, 'shareOut', 0, 2)).toEqual([[], []]);
  });

  test('a row says which engine its text came from, and why', async ({ page }) => {
    const first = { text: 'some text', confidence: 43.7 };
    const second = { text: 'some text', confidence: 97 };
    const say = (record) => call(page, 'describeEngine', record);
    expect(await say({ engine: 'first', readings: { first } })).toBe('');
    expect(await say({ source: 'file' })).toBe('');
    expect(await say({ engine: 'second', readings: { first, second } })).toBe(', read by the second engine (the first scored 43)');
    expect(await say({ engine: 'second', readings: { first: { text: ' ', confidence: 0 }, second } })).toBe(', read by the second engine (the first found nothing)');
    expect(await say({ engine: 'first', readings: { first, second } })).toBe(', second engine tried and not kept');
    expect(await say({ engine: 'first', compared: true, readings: { first, second } })).toBe('');
    expect(await say({ engine: 'first', secondFailed: true, readings: { first } })).toBe(', second engine failed');
    expect(await say({ engine: 'second', picked: true, compared: true, readings: { first, second } })).toBe(', second engine reading, picked by hand');
    expect(await say({ engine: 'first', picked: true, compared: true, readings: { first, second } })).toBe(', first engine reading, picked by hand');
  });

  test('a page read by the second engine brings its own counts to its row', async ({ page }) => {
    const words = [{ confidence: 99 }, { confidence: 70 }, { confidence: 30 }];
    const base = { number: 1, source: 'image', text: 'a b c', words, confidence: 85 };
    const own = await call(page, 'summarizePage', base);
    expect([own.lowCount, own.weak]).toEqual([1, false]);
    const brought = await call(page, 'summarizePage', { ...base, doubted: 2, weak: true });
    expect([brought.lowCount, brought.weak]).toEqual([2, true]);
  });
});

test.describe('the second engine', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('reads a level page, and a page tilted 40 degrees that the first engine cannot', async ({ page }) => {
    const truth = LINES.join('\n');
    await holdCanvas(page, await drawImage(page, LINES));
    const level = await page.evaluate(() => window.OcrTool.readCanvasSecond(window.held));
    expect(await call(page, 'characterErrorRate', truth, level.text)).toBeLessThan(0.03);
    expect(level.confidence).toBeGreaterThanOrEqual(90);
    expect(level.words.length).toBeGreaterThanOrEqual(14);
    expect(level.lines.length).toBe(3);

    await holdCanvas(page, await tilted(page));
    const [first, second] = await page.evaluate(async () => [
      await window.OcrTool.readCanvas(window.held), await window.OcrTool.readCanvasSecond(window.held)
    ].map((reading) => ({ text: reading.text, confidence: reading.confidence })));
    expect(await call(page, 'characterErrorRate', truth, first.text)).toBeGreaterThan(0.5);
    expect(await call(page, 'characterErrorRate', truth, second.text)).toBeLessThan(0.03);
    expect(second.confidence).toBeGreaterThanOrEqual(90);
  });

  test('a page read by three workers comes out the same as by one', async ({ page }) => {
    const rows = Array.from({ length: 4 }, (_, i) => LINES.map((line) => `${line} ${i}`)).flat().slice(0, 11);
    await holdCanvas(page, await drawImage(page, rows));
    const one = await page.evaluate(() => window.OcrTool.readCanvasSecond(window.held));
    expect(await call(page, 'secondWorkers')).toBe(1);
    await call(page, 'setSecondWorkers', 3);
    const three = await page.evaluate(() => window.OcrTool.readCanvasSecond(window.held));
    expect(await call(page, 'secondWorkers')).toBe(3);
    expect(three.text).toBe(one.text);
    expect(three.lines.length).toBe(11);
    expect(three.words.map((word) => word.confidence)).toEqual(one.words.map((word) => word.confidence));
    expect(await call(page, 'characterErrorRate', rows.join('\n'), three.text)).toBeLessThan(0.03);
  });
});

test.describe('a page the first engine reads badly', () => {
  test('is read by the second engine, which the row and a note say, and the workers are let go', async ({ page }) => {
    const seen = watchPaddle(page);
    await openTool(page);
    // Every status line, since the loading one is gone by the time the run ends.
    await page.evaluate(() => {
      window.statusLines = [];
      const status = document.getElementById('runStatus');
      new MutationObserver(() => window.statusLines.push(status.textContent)).observe(status, { childList: true, characterData: true, subtree: true });
    });
    expect(seen).toEqual([]);
    await read(page, 'tilted.png', 'image/png', await tilted(page));

    expect(await rate(page, LINES.join('\n'))).toBeLessThan(0.03);
    expect(await detail(page)).toMatch(/^Pixels, 1275 by 1650 px, read by the second engine \(the first (found nothing|scored \d+)\)$/);
    await expect(page.locator('#pageNotes')).toContainText('"Read by the second engine" means the first engine (Tesseract) scored the page under 70 or found nothing on it');
    for (const file of ['ort.wasm.min.mjs', 'esearch-ocr.js', 'ort-wasm-simd-threaded.wasm', 'ch_PP-OCRv4_det_infer.onnx', 'en_PP-OCRv5_mobile_rec.onnx', 'ppocrv5_en_dict.txt']) {
      expect(seen, file).toContain(file);
    }
    expect(await page.evaluate(() => window.statusLines)).toContain('Loading the second reading engine. The first use fetches about 27 MB from this site.');

    const [record] = await call(page, 'pages');
    expect(record.engine).toBe('second');
    expect(record.readings.second.text).toBe(record.text);
    expect(record.confidence).toBeGreaterThanOrEqual(90);
    // The second engine holds its models in memory only while a run needs it.
    expect(await call(page, 'secondWorkers')).toBe(0);
    // The words in the table are the second engine's.
    await expect(page.locator('#pagesTable tbody tr td').nth(2)).toHaveText(String(record.words.length));
  });

  test('a page that reads well never fetches the second engine', async ({ page }) => {
    const seen = watchPaddle(page);
    await openTool(page);
    await read(page, 'level.png', 'image/png', await drawImage(page, LINES));
    expect(await detail(page)).toBe('Pixels, 1275 by 1650 px');
    expect(seen).toEqual([]);
    const [record] = await call(page, 'pages');
    expect(Object.keys(record.readings)).toEqual(['first']);
    await expect(page.locator('#compareCard')).toBeHidden();
  });

  test('a blank page is not sent to it, and set to Never nothing is', async ({ page }) => {
    const seen = watchPaddle(page);
    await openTool(page);
    await read(page, 'blank.png', 'image/png', await drawImage(page, []));
    expect(await detail(page)).toBe('Pixels, 1275 by 1650 px');

    // A fresh page, since changing the setting reads the loaded file again.
    await openTool(page);
    await page.selectOption('#engineMode', 'off');
    await read(page, 'tilted.png', 'image/png', await tilted(page));
    await expect(page.locator('#textSummary')).toContainText('tilted.png');
    expect(await detail(page)).toBe('Pixels, 1275 by 1650 px');
    expect(await rate(page, LINES.join('\n'))).toBeGreaterThan(0.5);
    expect(seen).toEqual([]);
  });

  test('marks nobody can read are tried by it, not kept, and said so', async ({ page }) => {
    await openTool(page);
    // Rows of zigzag, which measure as lines of print and say nothing.
    const scribble = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1275;
      canvas.height = 900;
      const g = canvas.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.strokeStyle = '#111111';
      g.lineWidth = 3;
      let seed = 7;
      const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let row = 0; row < 6; row++) {
        g.beginPath();
        let x = 110;
        const y = 150 + row * 110;
        g.moveTo(x, y);
        while (x < 1100) { x += 6 + random() * 14; g.lineTo(x, y - 40 * random()); }
        g.stroke();
      }
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await read(page, 'scribble.png', 'image/png', Buffer.from(scribble, 'base64'));
    const [record] = await call(page, 'pages');
    expect(record.engine).toBe('first');
    expect(Object.keys(record.readings)).toEqual(['first', 'second']);
    expect(await detail(page)).toBe('Pixels, 1275 by 900 px, second engine tried and not kept');
    await expect(page.locator('#pageNotes')).toContainText('"Second engine tried and not kept" means the first engine scored the page under 70');
    await expect(page.locator('#compareCard')).toBeHidden();
  });

  test('a second engine that cannot load leaves the first reading standing and says so', async ({ page }) => {
    await page.route('**/paddle/en_PP-OCRv5_mobile_rec.onnx', (route) => route.abort());
    await openTool(page);
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await read(page, 'tilted.png', 'image/png', await tilted(page));
    expect(await detail(page)).toBe('Pixels, 1275 by 1650 px, second engine failed');
    await expect(page.locator('#pageNotes')).toContainText('"Second engine failed" means the second engine could not be loaded');
    await expect(page.locator('#chooseFile')).toBeEnabled();
    expect(errors).toEqual([]);
    expect(await call(page, 'secondWorkers')).toBe(0);
  });

  test('its text is laid along the print in the saved PDF, from an image and from a scanned page', async ({ page }) => {
    await openTool(page);
    await read(page, 'tilted.png', 'image/png', await tilted(page));
    const bytes = await savePdf(page);
    // One run of text a line, none of it painted.
    expect(await textModes(page, bytes)).toEqual([3, 3, 3]);
    const fromImage = await readPdf(page, bytes);
    expect(fromImage.length).toBe(1);
    expect(fromImage[0].images).toBe(1);
    // An image's page is sized as if scanned at 300 DPI.
    await textAlongLines(page, fromImage[0], { scale: 72 / 300 });
    await expect(page.locator('#copyStatus')).toContainText('1 of 1 pages given a text layer');

    const scan = await scannedPage(page, LOW, { skewDeg: TILT });
    await read(page, 'scan.pdf', 'application/pdf', buildPdf([{ text: ['A typed page that already holds its own text.'] }, scan]));
    expect(await detail(page, 0)).toBe('The file');
    expect(await detail(page, 1)).toMatch(/read by the second engine/);
    const fromPdf = await readPdf(page, await savePdf(page));
    expect(fromPdf.length).toBe(2);
    // The scan fills a letter page 612 points wide.
    await textAlongLines(page, fromPdf[1], { scale: 612 / WIDTH });
  });

  for (const deg of [60, 120]) {
    test(`a page tilted ${deg} degrees is turned level for it, the right way up, and its PDF text lies on the print`, async ({ page }) => {
      await openTool(page);
      await read(page, 'steep.png', 'image/png', await drawImage(page, LOW, { skewDeg: deg }));
      expect(await detail(page)).toMatch(/read by the second engine \(the first/);
      expect(await rate(page, LINES.join('\n'))).toBeLessThan(0.03);
      const [record] = await call(page, 'pages');
      expect(record.lines.length).toBe(3);
      expect(record.readings.second.lost).toBe(0);
      const saved = await readPdf(page, await savePdf(page));
      await textAlongLines(page, saved[0], { scale: 72 / 300, deg });
    });
  }

  test('faint print the first engine finds nothing in still goes to the second', async ({ page }) => {
    await openTool(page);
    await read(page, 'faint.png', 'image/png', await tilted(page, { ink: '#d8d8d8' }));
    expect(await detail(page)).toBe('Pixels, 1275 by 1650 px, read by the second engine (the first found nothing)');
    expect(await rate(page, LINES.join('\n'))).toBeLessThan(0.03);
  });

  test('what stands out from the paper is measured, so a blank page is told from a faint one', async ({ page }) => {
    await openTool(page);
    const shares = await page.evaluate(async () => {
      const { markedShare, PREPARE } = await import('/js/ocr_text_extractor/ocr-prepare.js');
      const flat = new Uint8Array(10000).fill(250);
      const speck = flat.slice();
      for (let i = 0; i < 4; i++) speck[i] = 0;
      const faint = flat.slice();
      for (let i = 0; i < 5; i++) faint[i] = 225;
      const near = flat.slice();
      for (let i = 0; i < 500; i++) near[i] = 226;
      return [markedShare(flat), markedShare(speck), markedShare(faint), markedShare(near), PREPARE.markShare, PREPARE.markDistance];
    });
    expect(shares).toEqual([0, 0.0004, 0.0005, 0, 0.0005, 24]);
  });

  test('its doubted words are listed with pixels from their own line', async ({ page }) => {
    await openTool(page);
    // Small print, which the second engine reads with less certainty.
    await read(page, 'tilted.png', 'image/png', await tilted(page, { font: '16px serif' }));
    const [record] = await call(page, 'pages');
    expect(record.engine).toBe('second');
    expect(record.doubted).toBeGreaterThan(0);
    await expect(page.locator('#reviewCard')).toBeVisible();
    await expect(page.locator('#reviewNote')).toContainText('an engine doubted (the first under 60, the second under 85 on its own scale)');
    await expect(page.locator('#reviewTable tbody tr')).toHaveCount(record.doubted);
    await expect(page.locator('#pagesTable tbody tr td').nth(4)).toHaveText(String(record.doubted));
    // Each crop holds print: some pixel well darker than the paper.
    const darkest = await page.evaluate(() => [...document.querySelectorAll('#reviewTable canvas')].map((canvas) => {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let low = 255;
      for (let i = 0; i < data.length; i += 4) low = Math.min(low, data[i]);
      return low;
    }));
    for (const value of darkest) expect(value).toBeLessThan(128);
  });

  test('Stop while the second engine is loading ends the run, and the next one works', async ({ page }) => {
    await openTool(page);
    await page.evaluate(() => {
      const status = document.getElementById('runStatus');
      const observer = new MutationObserver(() => {
        if (status.textContent.startsWith('Loading the second reading engine')) {
          observer.disconnect();
          document.getElementById('stopRun').click();
        }
      });
      observer.observe(status, { childList: true, characterData: true, subtree: true });
    });
    await page.setInputFiles('#fileInput', { name: 'tilted.png', mimeType: 'image/png', buffer: await tilted(page) });
    await expect(page.locator('#runStatus')).toHaveText('Stopped before any page was read.', { timeout: 90_000 });
    await expect(page.locator('#chooseFile')).toBeEnabled();
    await expect(page.locator('#engineMode')).toBeEnabled();
    expect(await call(page, 'secondWorkers')).toBe(0);
    await read(page, 'tilted.png', 'image/png', await tilted(page));
    expect(await detail(page)).toMatch(/read by the second engine/);
  });
});

test.describe('comparing both engines', () => {
  const ALIKE = 'O0 l1 I| S5 B8 rn m';
  const PAGE_LINES = [LINES[0], ALIKE, LINES[2]];

  async function chooseBoth(page) {
    await page.selectOption('#engineMode', 'both');
    await expect(page.locator('#compareConfirm')).toBeVisible();
    await page.click('#compareYes');
    await expect(page.locator('#compareConfirm')).toBeHidden();
  }

  test('choosing it asks first, and No or Escape puts the setting back with nothing fetched', async ({ page }) => {
    const seen = watchPaddle(page);
    await openTool(page);
    const dialog = page.locator('#compareConfirm');
    await page.selectOption('#engineMode', 'both');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Read every page with both engines?');
    await expect(dialog).toContainText('about 27 MB');
    await expect(dialog).toContainText('the browser may close the page part way through');
    await page.click('#compareNo');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#engineMode')).toHaveValue('auto');
    expect(await call(page, 'mode')).toBe('auto');

    await page.selectOption('#engineMode', 'off');
    await page.selectOption('#engineMode', 'both');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#engineMode')).toHaveValue('off');
    expect(await call(page, 'mode')).toBe('off');

    await chooseBoth(page);
    expect(await call(page, 'mode')).toBe('both');
    await expect(page.locator('#engineMode')).toHaveValue('both');
    expect(seen).toEqual([]);
  });

  test('saying yes with a file loaded reads it again with both, side by side, differences marked', async ({ page }) => {
    await openTool(page);
    await read(page, 'alike.png', 'image/png', await drawImage(page, PAGE_LINES));
    await expect(page.locator('#compareCard')).toBeHidden();
    const before = await page.inputValue('#textOutput');

    await chooseBoth(page);
    await expect(page.locator('#compareCard')).toBeVisible({ timeout: 150_000 });
    await expect(page.locator('#runStatus')).toContainText(/^Done: /, { timeout: 150_000 });
    const [record] = await call(page, 'pages');
    expect(Object.keys(record.readings)).toEqual(['first', 'second']);
    // The first engine read the page well, so it stays in use.
    expect(record.engine).toBe('first');
    expect(await page.inputValue('#textOutput')).toBe(before);
    expect(await detail(page)).toBe('Pixels, 1275 by 1650 px');

    const diff = await call(page, 'diffWords', record.readings.first.text, record.readings.second.text);
    const percent = Math.floor(diff.agreement * 100);
    const entry = page.locator('#compareList details');
    await expect(entry).toHaveCount(1);
    await expect(entry.locator('summary')).toHaveText(`Page 1: the two readings share ${percent}% of their words. Using the first engine.`);
    await expect(page.locator('#compareNote')).toContainText(`Over 1 page they share ${percent}% of their words.`);
    await expect(page.locator('#compareNote')).toContainText('Where they agree, both can still be wrong.');

    await entry.locator('summary').click();
    const columns = entry.locator('.compare-column');
    await expect(columns).toHaveCount(2);
    await expect(columns.nth(0).locator('h3')).toHaveText('First engine (Tesseract)');
    await expect(columns.nth(1).locator('h3')).toHaveText('Second engine (PP-OCR)');
    await expect(columns.nth(0).locator('button')).toHaveText('In use');
    await expect(columns.nth(0).locator('button')).toHaveAttribute('aria-pressed', 'true');
    await expect(columns.nth(1).locator('button')).toHaveText('Use this reading');
    // The marked words are exactly the ones the other reading lacks.
    const marked = (at) => columns.nth(at).locator('mark').allTextContents();
    expect(await marked(0)).toEqual(diff.left.filter((word) => !word.same).map((word) => word.text));
    expect(await marked(1)).toEqual(diff.right.filter((word) => !word.same).map((word) => word.text));
    // The look-alike line is where two readers part company.
    expect((await marked(0)).length + (await marked(1)).length).toBeGreaterThan(0);
    // Every word of each reading is there, marked or not, line by line.
    const shown = (at) => columns.nth(at).locator('.compare-line').evaluateAll((rows) => rows.map((row) => row.textContent.trim()).join('\n'));
    expect(await shown(0)).toBe(record.readings.first.text.split('\n').map((row) => row.trim().replace(/\s+/g, ' ')).join('\n').trim());
    expect(await shown(1)).toBe(record.readings.second.text);
    await expect(columns.nth(1).locator('.helper-text')).toHaveText(/^Confidence \d+ on its own scale, \d+ words, \d+\.\d s\.$/);
  });

  test('a reading picked by hand becomes the text, the row, the count and the PDF, and can be put back', async ({ page }) => {
    await openTool(page);
    await chooseBoth(page);
    await read(page, 'tilted.png', 'image/png', await tilted(page));
    let [record] = await call(page, 'pages');
    // The first engine cannot read this page, so the second is in use unasked.
    expect(record.engine).toBe('second');
    expect(await detail(page)).toMatch(/read by the second engine \(the first/);
    const entry = page.locator('#compareList details');
    await expect(entry.locator('summary')).toContainText('Using the second engine.');
    await entry.locator('summary').click();

    await entry.locator('button[data-engine="first"]').click();
    [record] = await call(page, 'pages');
    expect(record.engine).toBe('first');
    expect(await page.inputValue('#textOutput')).toBe(record.readings.first.text.replace(/\s+$/, ''));
    expect(await detail(page)).toBe('Pixels, 1275 by 1650 px, first engine reading, picked by hand');
    // The comparison stays open across the redraw.
    await expect(entry).toHaveAttribute('open', '');
    await expect(entry.locator('summary')).toContainText('Using the first engine.');
    await expect(entry.locator('button[data-engine="first"]')).toHaveText('In use');

    await entry.locator('button[data-engine="second"]').click();
    [record] = await call(page, 'pages');
    expect(record.engine).toBe('second');
    expect(await rate(page, LINES.join('\n'))).toBeLessThan(0.03);
    expect(await detail(page)).toBe('Pixels, 1275 by 1650 px, second engine reading, picked by hand');
    await expect(page.locator('#pagesTable tbody tr td').nth(2)).toHaveText(String(record.readings.second.words.length));
    const saved = await readPdf(page, await savePdf(page));
    await textAlongLines(page, saved[0], { scale: 72 / 300 });
  });

  test('a second reading under 90 that is picked by hand is marked low in its row', async ({ page }) => {
    await openTool(page);
    await chooseBoth(page);
    // Print too small for either engine to read well.
    await read(page, 'tiny.png', 'image/png', await drawImage(page, LINES, { width: 700, height: 500, font: '8px serif' }));
    let [record] = await call(page, 'pages');
    const score = record.readings.second.confidence;
    // Between the two engines' own lines, which is what tells them apart.
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThan(90);
    expect(record.engine).toBe('first');
    await page.locator('#compareList details summary').click();
    await page.locator('#compareList button[data-engine="second"]').click();
    await expect(page.locator('#pagesTable tbody tr td').nth(3)).toHaveText(`${Math.floor(score)}, low`);
    await expect(page.locator('#pagesTable tbody tr')).toHaveClass(/weak/);
  });

  test('only pages read from pixels are compared, two at a time at most', async ({ page }) => {
    await openTool(page);
    await chooseBoth(page);
    const scans = [];
    for (let i = 1; i <= 3; i++) scans.push(await scannedPage(page, [`Scanned sheet number ${i} of three`, ...LINES]));
    await page.evaluate(() => {
      window.mostWorkers = 0;
      window.watch = setInterval(() => { window.mostWorkers = Math.max(window.mostWorkers, window.OcrTool.workers()); }, 50);
    });
    await read(page, 'mixed.pdf', 'application/pdf', buildPdf([{ text: ['A typed page that already holds its own text.'] }, ...scans]));
    expect(await page.evaluate(() => { clearInterval(window.watch); return window.mostWorkers; })).toBeLessThanOrEqual(2);
    await expect(page.locator('#compareList details')).toHaveCount(3);
    await expect(page.locator('#compareList details summary')).toHaveText([/^Page 2: /, /^Page 3: /, /^Page 4: /]);
    await expect(page.locator('#compareNote')).toContainText('Over 3 pages they share');
    const records = await call(page, 'pages');
    expect(records.map((record) => record.number)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i <= 3; i++) {
      expect(await call(page, 'characterErrorRate', [`Scanned sheet number ${i} of three`, ...LINES].join('\n'), records[i].readings.second.text)).toBeLessThan(0.03);
    }
    // Back to one reader, and the comparison is gone with the next run.
    await page.selectOption('#engineMode', 'auto');
    await expect(page.locator('#runStatus')).toContainText(/^Done: /, { timeout: 150_000 });
    await expect(page.locator('#compareCard')).toBeHidden();
  });
});

test.describe('the page with a second engine on it', () => {
  test('still sends nothing anywhere, stores nothing, and breaks no content policy', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
    const consoleHits = [];
    page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) consoleHits.push(m.text()); });
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    await openTool(page);
    const origin = new URL(page.url()).origin;
    await read(page, 'tilted.png', 'image/png', await tilted(page));
    await page.selectOption('#engineMode', 'both');
    await page.click('#compareYes');
    await expect(page.locator('#compareCard')).toBeVisible({ timeout: 150_000 });
    await expect(page.locator('#runStatus')).toContainText(/^Done: /, { timeout: 150_000 });
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPdf')]);
    await pdf.cancel();

    expect(requests.some((r) => r.url === `${origin}${PADDLE}ort-wasm-simd-threaded.wasm`)).toBe(true);
    for (const r of requests) {
      const target = new URL(r.url);
      const allowed = target.origin === origin || target.hostname === 'fonts.googleapis.com' ||
        target.hostname === 'fonts.gstatic.com' || target.protocol === 'data:' || target.protocol === 'blob:';
      expect(allowed, r.url).toBe(true);
      expect(r.method, r.url).toBe('GET');
      expect(r.body, r.url).toBeNull();
    }
    const kept = await page.evaluate(async () => ({
      local: Object.keys(localStorage).filter((key) => /ocr|tess|ort|onnx|paddle/i.test(key)),
      session: Object.keys(sessionStorage),
      databases: indexedDB.databases ? (await indexedDB.databases()).map((db) => db.name) : [],
      caches: window.caches ? await caches.keys() : []
    }));
    expect(kept).toEqual({ local: [], session: [], databases: [], caches: [] });
    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(consoleHits).toEqual([]);
  });

  test('names its controls, says what the second engine is, and fits a phone with the comparison open', async ({ page }) => {
    await openTool(page);
    await expect(page.getByRole('combobox', { name: 'Second engine' })).toHaveValue('auto');
    await expect(page.locator('#engineMode')).toHaveAttribute('aria-describedby', 'engineModeNote');
    await expect(page.locator('#engineMode option')).toHaveText(['Only for a page that reads badly', 'Never', 'Compare both on every page']);
    expect((await page.locator('#engineMode').boundingBox()).height).toBeGreaterThanOrEqual(44);
    const card = page.locator('#scopeDisclaimer');
    for (const claim of [
      'A second engine reads a page the first one read badly.',
      'scores 90 or more on its own scale and found at least half as much text',
      'Two engines agreeing is not proof.',
      'their figures are never compared with each other',
      'Both reading engines, their language data and the PDF library are served from this site'
    ]) {
      await expect(card).toContainText(claim);
    }
    await page.selectOption('#engineMode', 'both');
    const dialog = page.locator('#compareConfirm');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'compareTitle');
    await expect(dialog.getByRole('button', { name: 'Yes, compare both' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'No, go back' })).toBeVisible();
    await page.click('#compareYes');
    await read(page, 'alike.png', 'image/png', await drawImage(page, LINES));
    await page.locator('#compareList details summary').click();
    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `width ${width}`).toBeLessThanOrEqual(1);
    }
    // On a phone the two readings sit one above the other.
    const boxes = await page.locator('.compare-column').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
    expect(boxes[1]).toBeGreaterThan(boxes[0] + 50);
  });
});

test.describe('the policy the workers run under', () => {
  const WORKERS = [
    '/js/vendor/ocr_text_extractor/worker.min.js',
    '/js/vendor/ocr_text_extractor/pdf.worker.min.mjs',
    '/js/ocr_text_extractor/ocr-second-worker.js'
  ];

  test('each worker script is served with it, and it lets a worker reach this site and nowhere else', async ({ page }) => {
    expect(OCR_WORKER_CSP).toBe("default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'");
    for (const path of WORKERS) {
      const response = await page.request.get(path);
      expect(response.headers()['content-security-policy'], path).toBe(OCR_WORKER_CSP);
    }
    // A page's own policy does not reach its workers, so an ordinary script here has none.
    expect((await page.request.get('/js/shared.js')).headers()['content-security-policy']).toBeUndefined();

    const asked = [];
    page.on('request', (request) => asked.push(request.url()));
    await openTool(page);
    const origin = new URL(page.url()).origin;
    const elsewhere = 'https://elsewhere.invalid/collect';
    const outcome = await page.evaluate(([here, there]) => new Promise((resolve, reject) => {
      const worker = new Worker('/tests/smoke/ocr-worker-probe.js');
      worker.onmessage = (event) => { worker.terminate(); resolve(event.data); };
      worker.onerror = () => reject(new Error('the probe did not load'));
      worker.postMessage([here, there]);
    }), [`${origin}/robots.txt`, elsewhere]);
    expect(outcome).toEqual({ [`${origin}/robots.txt`]: 'sent', [elsewhere]: 'refused' });
    // Refused by the browser before anything was sent, not by a failed lookup.
    expect(asked).toContain(`${origin}/robots.txt`);
    expect(asked.filter((url) => url.startsWith('https://elsewhere.invalid'))).toEqual([]);
  });
});
