// OCR Text Extractor: the two repairs made to a page before it is read
// (uneven light, and a tilt past what the engine straightens itself) and
// pages read side by side. Each repair is held by a page the engine reads
// badly without it, so switching one off fails here.
const { test, expect } = require('@playwright/test');
const { drawImage, buildPdf, scannedPage, readPdf, textOnLines } = require('./ocr-fixtures.cjs');

const PAGE = '/tools/ocr-text-extractor.html';

test.describe.configure({ timeout: 120_000 });

const LINES = [
  'Quarterly meter readings from north plant',
  'Invoice 100482 totals 1,274.50 dollars',
  'Signed copies return before Friday'
];
const ALIKE = 'O0 l1 I| S5 B8 rn m';
const WIDTH = 1275;

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.OcrTool))).toBe(true);
}

async function read(page, name, mimeType, buffer) {
  await page.setInputFiles('#fileInput', { name, mimeType, buffer });
  await expect(page.locator('#runStatus')).toContainText(/^Done: /, { timeout: 90_000 });
}

const rate = (page, reference) => page.evaluate(
  (ref) => window.OcrTool.characterErrorRate(ref, document.getElementById('textOutput').value), reference
);
const detail = (page, row = 0) => page.locator('#pagesTable tbody tr').nth(row).locator('td').nth(1).textContent();

async function savePdf(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPdf')]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// Print drawn at a tilt, for the repair module. Runs in the page.
function draw(degrees, { width = 700, height = 500, paint = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, width, height);
  g.translate(width / 2, height / 2);
  g.rotate(degrees * Math.PI / 180);
  g.translate(-width / 2, -height / 2);
  g.fillStyle = '#000000';
  // Large enough that the page is not enlarged as small print.
  g.font = '26px serif';
  for (let i = 0; i < 8; i++) g.fillText('The quick brown fox jumps over the lazy dog', 110, 110 + i * 44);
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (paint) paint(g, width, height);
  return canvas;
}

// Runs `body(prep, draw, lumOf)` in the page against the repair module. Sent
// as source text: the page's CSP refuses a function built there from a string,
// and an evaluated expression is not subject to it.
function withPrepare(page, body) {
  return page.evaluate(`(async () => {
    const prep = await import('/js/ocr_text_extractor/ocr-prepare.js');
    const draw = ${draw.toString()};
    const lumOf = (canvas) => prep.luminance(
      canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, canvas.width * canvas.height
    );
    return (${body.toString()})(prep, draw, lumOf);
  })()`);
}

test.describe('repairs, measured on drawn pages', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('the tilt of the print is found to a fifth of a degree from 30 one way to 30 the other', async ({ page }) => {
    const found = await withPrepare(page, (prep, draw, lumOf) => [0, 2, -5, 8, 12, 12.4, -7.5, -20, 30, -30].map((degrees) => {
      const canvas = draw(degrees);
      return { drawn: degrees, ...prep.estimateSkew(lumOf(canvas), canvas.width, canvas.height) };
    }));
    expect(found).toHaveLength(10);
    for (const one of found) {
      expect(Math.abs(one.degrees - one.drawn), `drawn at ${one.drawn}, found ${one.degrees}`).toBeLessThanOrEqual(0.2);
      if (one.drawn === 0) expect(one.strength).toBe(1);
      else expect(one.strength, `strength at ${one.drawn}`).toBeGreaterThan(1.5);
    }
  });

  test('a page with no print, or more ink than paper, is not given a tilt', async ({ page }) => {
    const found = await withPrepare(page, (prep, draw, lumOf) => {
      const blank = document.createElement('canvas');
      blank.width = 400;
      blank.height = 300;
      const g = blank.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 400, 300);
      const empty = prep.estimateSkew(lumOf(blank), 400, 300);
      // A picture: a dark slab over most of the frame, tilted.
      g.translate(200, 150);
      g.rotate(0.3);
      g.fillStyle = '#101010';
      g.fillRect(-170, -130, 300, 240);
      const slab = prep.estimateSkew(lumOf(blank), 400, 300);
      return { empty, slab };
    });
    expect(found.empty).toEqual({ degrees: 0, strength: 0 });
    expect(found.slab).toEqual({ degrees: 0, strength: 0 });
  });

  test('a page is turned only from 6 to 30 degrees and only when the rows clearly line up', async ({ page }) => {
    const turn = (degrees, strength) => page.evaluate(async ([d, s]) => {
      const prep = await import('/js/ocr_text_extractor/ocr-prepare.js');
      return prep.shouldTurn({ degrees: d, strength: s });
    }, [degrees, strength]);
    expect(await turn(5.9, 3)).toBe(false);
    expect(await turn(6, 3)).toBe(true);
    expect(await turn(-6, 3)).toBe(true);
    expect(await turn(30, 3)).toBe(true);
    expect(await turn(30.1, 3)).toBe(false);
    expect(await turn(12, 1.49)).toBe(false);
    expect(await turn(12, 1.5)).toBe(true);
    expect(await turn(0, 1)).toBe(false);
  });

  test('paper brightness is level on a clean page and uneven under a shadow or beside a dark surround', async ({ page }) => {
    const uneven = await withPrepare(page, (prep, draw, lumOf) => {
      const measure = (canvas) => prep.paperMap(lumOf(canvas), canvas.width, canvas.height).uneven;
      const shadow = (g, w, h) => {
        g.globalCompositeOperation = 'multiply';
        const fall = g.createLinearGradient(0, 0, w, h);
        fall.addColorStop(0, '#ffffff');
        fall.addColorStop(1, '#4a4a4a');
        g.fillStyle = fall;
        g.fillRect(0, 0, w, h);
      };
      const surround = (g, w, h) => {
        g.fillStyle = '#303030';
        g.fillRect(0, 0, w, 60);
        g.fillRect(0, h - 60, w, 60);
        g.fillRect(0, 0, 70, h);
        g.fillRect(w - 70, 0, 70, h);
      };
      const faint = (g, w, h) => {
        // Gray print on gray paper: low contrast, but level.
        const image = g.getImageData(0, 0, w, h);
        for (let i = 0; i < image.data.length; i += 4) for (let k = 0; k < 3; k++) image.data[i + k] = 120 + image.data[i + k] * 0.22;
        g.putImageData(image, 0, 0);
      };
      return {
        clean: measure(draw(0)),
        tilted: measure(draw(12)),
        faint: measure(draw(0, { paint: faint })),
        shadow: measure(draw(0, { paint: shadow })),
        surround: measure(draw(0, { paint: surround }))
      };
    });
    expect(uneven.clean).toBeLessThan(0.02);
    expect(uneven.tilted).toBeLessThan(0.02);
    expect(uneven.faint).toBeLessThan(0.02);
    expect(uneven.shadow).toBeGreaterThan(0.4);
    expect(uneven.surround).toBeGreaterThan(0.4);
  });

  test('evening the light turns shaded paper white and keeps the print dark', async ({ page }) => {
    const result = await withPrepare(page, (prep, draw) => {
      const shadow = (g, w, h) => {
        g.globalCompositeOperation = 'multiply';
        const fall = g.createLinearGradient(0, 0, w, h);
        fall.addColorStop(0, '#ffffff');
        fall.addColorStop(1, '#4a4a4a');
        g.fillStyle = fall;
        g.fillRect(0, 0, w, h);
      };
      const source = draw(0, { paint: shadow });
      const cornerBefore = source.getContext('2d').getImageData(680, 480, 1, 1).data[0];
      const out = prep.prepare(source);
      const data = out.canvas.getContext('2d').getImageData(0, 0, out.canvas.width, out.canvas.height).data;
      let paper = 0;
      let ink = 0;
      let between = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] >= 225) paper++;
        else if (data[i] <= 110) ink++;
        else between++;
      }
      const total = data.length / 4;
      return {
        evened: out.evened, turned: out.turnDegrees, same: out.canvas === source, cornerBefore,
        cornerAfter: data[(480 * out.canvas.width + 680) * 4], paper: paper / total, ink: ink / total, between: between / total,
        gray: data[0] === data[1] && data[1] === data[2]
      };
    });
    expect(result.evened).toBe(true);
    expect(result.same).toBe(false);
    expect(result.turned).toBe(0);
    // The darkest corner of the paper was a mid gray and is now white.
    expect(result.cornerBefore).toBeLessThan(110);
    expect(result.cornerAfter).toBeGreaterThanOrEqual(240);
    expect(result.paper).toBeGreaterThan(0.9);
    expect(result.ink).toBeGreaterThan(0.01);
    expect(result.between).toBeLessThan(0.05);
    expect(result.gray).toBe(true);
  });

  test('a dark surround is whitened to within a few pixels of the paper', async ({ page }) => {
    // A photo of a sheet on a dark desk. If bright paper spread into the
    // estimate for the desk beside it, a dark frame would be left round the
    // sheet, and the engine reads a frame as characters.
    const result = await withPrepare(page, (prep, draw) => {
      const surround = (g, w, h) => {
        g.fillStyle = '#303030';
        g.fillRect(0, 0, w, 60);
        g.fillRect(0, h - 60, w, 60);
        g.fillRect(0, 0, 70, h);
        g.fillRect(w - 70, 0, 70, h);
      };
      const out = prep.prepare(draw(0, { paint: surround }));
      const at = (x, y) => out.canvas.getContext('2d').getImageData(x, y, 1, 1).data[0];
      return {
        evened: out.evened,
        // Inside the desk, 20 and 30 px from the edge of the sheet on each side.
        // Nearer than that the estimate is blended across the edge on purpose.
        desk: [at(50, 250), at(40, 250), at(650, 250), at(660, 250), at(350, 40), at(350, 30), at(350, 460), at(350, 470)],
        paper: at(90, 250),
        // 12 px into the desk, inside the blend.
        blend: at(58, 250)
      };
    });
    expect(result.evened).toBe(true);
    expect(result.paper).toBeGreaterThanOrEqual(240);
    // As bright as the limit on amplifying deep shadow lets a desk this dark get.
    for (const value of result.desk) expect(value).toBeGreaterThanOrEqual(185);
    // The estimate is smoothed across the edge. Without that the photo set
    // read worse: a page tilted 5 degrees went from no errors to 1.3%.
    expect(result.blend).toBeGreaterThan(100);
    expect(result.blend).toBeLessThan(170);
  });

  test('a clean page comes back as the same canvas, and a tilted one on a canvas with room for its corners', async ({ page }) => {
    const result = await withPrepare(page, (prep, draw) => {
      const clean = draw(0);
      const kept = prep.prepare(clean);
      const slight = draw(4);
      const left = prep.prepare(slight);
      const tilted = draw(12);
      const turned = prep.prepare(tilted);
      const again = prep.estimateSkew(
        prep.luminance(turned.canvas.getContext('2d').getImageData(0, 0, turned.canvas.width, turned.canvas.height).data, turned.canvas.width * turned.canvas.height),
        turned.canvas.width, turned.canvas.height
      );
      return {
        kept: [kept.canvas === clean, kept.evened, kept.turnDegrees, kept.turnRadians, kept.enlarged, kept.frame],
        left: [left.canvas === slight, left.turnDegrees],
        turned: { degrees: turned.turnDegrees, radians: turned.turnRadians, size: [turned.canvas.width, turned.canvas.height], frame: turned.frame, evened: turned.evened },
        again: again.degrees
      };
    });
    expect(result.kept).toEqual([true, false, 0, 0, 1, { x: 1, y: 1 }]);
    // Four degrees is the engine's to straighten.
    expect(result.left).toEqual([true, 0]);
    expect(Math.abs(result.turned.degrees - 12)).toBeLessThanOrEqual(0.3);
    expect(result.turned.radians).toBeCloseTo(-result.turned.degrees * Math.PI / 180, 12);
    const angle = Math.abs(result.turned.radians);
    expect(result.turned.size).toEqual([
      Math.ceil(700 * Math.cos(angle) + 500 * Math.sin(angle)), Math.ceil(700 * Math.sin(angle) + 500 * Math.cos(angle))
    ]);
    expect(result.turned.frame.x).toBeCloseTo(result.turned.size[0] / 700, 12);
    expect(result.turned.frame.y).toBeCloseTo(result.turned.size[1] / 500, 12);
    expect(result.turned.evened).toBe(false);
    // What is handed to the engine is level.
    expect(Math.abs(result.again)).toBeLessThanOrEqual(0.3);
  });

  test('the overlay allows for a page read on a larger canvas, and workers follow cores, memory and pages', async ({ page }) => {
    const apply = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f];
    const call = (name, arg) => page.evaluate(([fn, value]) => window.OcrTool[fn](value), [name, arg]);
    const box = { x: 0, y: 0, width: 400, height: 200 };
    // The text page is 1.25 by 1.5 times the page, sharing its center.
    const { matrix } = await call('overlayMatrix', { box, rotation: 0, textWidth: 500, textHeight: 300, frame: { x: 1.25, y: 1.5 } });
    const center = apply(matrix, 250, 150);
    expect(center[0]).toBeCloseTo(200, 9);
    expect(center[1]).toBeCloseTo(100, 9);
    // A text point 50 right and 30 up of center is the same distance on the page.
    const off = apply(matrix, 300, 180);
    expect(off[0]).toBeCloseTo(250, 9);
    expect(off[1]).toBeCloseTo(130, 9);
    // The text page's own corner falls outside the page, where the turned canvas had its margin.
    expect(apply(matrix, 0, 0)[0]).toBeCloseTo(-50, 9);
    expect(apply(matrix, 0, 0)[1]).toBeCloseTo(-50, 9);

    const count = (cores, memoryGb, pages, coarsePointer = false) => call('workerCount', { cores, memoryGb, pages, coarsePointer });
    expect(await count(32, 8, 25)).toBe(4);
    expect(await count(8, 8, 25)).toBe(4);
    expect(await count(6, 8, 25)).toBe(3);
    expect(await count(4, 8, 25)).toBe(2);
    expect(await count(2, 8, 25)).toBe(1);
    expect(await count(1, 8, 25)).toBe(1);
    expect(await count(32, 4, 25)).toBe(2);
    expect(await count(32, 2, 25)).toBe(1);
    // Memory not reported, as in Firefox and Safari.
    expect(await count(32, undefined, 25)).toBe(2);
    expect(await count(undefined, undefined, 25)).toBe(1);
    expect(await count(32, 8, 3)).toBe(3);
    expect(await count(32, 8, 1)).toBe(1);
    // A phone or tablet gets one, whatever it reports.
    expect(await count(8, 8, 25, true)).toBe(1);
  });
});

test.describe('repairs, through the page', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('a clean page and a faint one are read as they are, with nothing said', async ({ page }) => {
    await read(page, 'clean.png', 'image/png', await drawImage(page, LINES));
    expect(await detail(page)).toBe('Pixels, 1275 by 1650 px');
    expect(await rate(page, LINES.join('\n'))).toBeLessThanOrEqual(0.02);
    await expect(page.locator('#pageNotes')).not.toContainText('lighting');

    await read(page, 'faint.png', 'image/png', await drawImage(page, LINES, { ink: '#6a6a6a', paper: '#a4a4a4' }));
    expect(await detail(page)).toBe('Pixels, 1275 by 1650 px');
    expect(await rate(page, LINES.join('\n'))).toBeLessThanOrEqual(0.02);
  });

  test('a photo in uneven light is evened first, read, and the row says so', async ({ page }) => {
    await read(page, 'shaded.png', 'image/png', await drawImage(page, LINES, { shadow: true }));
    expect(await detail(page)).toBe('Pixels, 1275 by 1650 px, lighting evened');
    // Read as it is, the engine loses about half of a page like this.
    expect(await rate(page, LINES.join('\n'))).toBeLessThanOrEqual(0.03);
    await expect(page.locator('#pageNotes')).toContainText('"Lighting evened" means the paper was brighter in some places than others');
  });

  // Angles that keep every line of the drawn page on its canvas.
  for (const skewDeg of [12, -7]) {
    test(`a photo tilted ${skewDeg} degrees is turned first, read, and its PDF text lies along the tilted print`, async ({ page }) => {
      await read(page, 'tilted.png', 'image/png', await drawImage(page, LINES, { skewDeg }));
      expect(await detail(page)).toMatch(/^Pixels, 1275 by 1650 px, turned (\d+(\.\d)?) degrees$/);
      const said = Number((await detail(page)).match(/turned ([\d.]+) degrees/)[1]);
      expect(Math.abs(said - Math.abs(skewDeg))).toBeLessThanOrEqual(0.4);
      // Read as it is, the engine gets about a fifth of a page tilted 12 degrees wrong.
      expect(await rate(page, LINES.join('\n'))).toBeLessThanOrEqual(0.03);
      await expect(page.locator('#pageNotes')).toContainText('"Turned" means the print was tilted further than the engine straightens by itself');

      const [saved] = await readPdf(page, await savePdf(page));
      expect([saved.width, saved.height]).toEqual([306, 396]);
      await textOnLines(page, saved, LINES, { scale: 72 / 300, skewDeg, tolerance: 2.5 });
    });
  }

  test('a scanned PDF page that is both shaded and tilted gets both repairs and text in the right place', async ({ page }) => {
    const pdf = buildPdf([await scannedPage(page, LINES, { skewDeg: 10, shadow: true }), await scannedPage(page, LINES)]);
    await read(page, 'both.pdf', 'application/pdf', pdf);
    expect(await detail(page, 0)).toMatch(/^Pixels, 300 DPI, lighting evened, turned (9\.\d|10(\.\d)?) degrees$/);
    expect(await detail(page, 1)).toBe('Pixels, 300 DPI');
    const saved = await readPdf(page, await savePdf(page));
    expect(await page.evaluate(([ref, hyp]) => window.OcrTool.characterErrorRate(ref, hyp), [LINES.join('\n'), saved[0].text])).toBeLessThanOrEqual(0.04);
    await textOnLines(page, saved[0], LINES, { scale: 612 / WIDTH, skewDeg: 10, tolerance: 5 });
    await textOnLines(page, saved[1], LINES, { scale: 612 / WIDTH });
  });

  test('doubted words on a turned page still sit beside their own pixels', async ({ page }) => {
    const lines = [LINES[0], ALIKE, LINES[2]];
    await read(page, 'alike.png', 'image/png', await drawImage(page, lines, { skewDeg: 12, red: ALIKE.split(' ') }));
    expect(await detail(page)).toContain('turned');
    const entries = await page.evaluate(() => window.OcrTool.review().map((entry) => {
      const pixels = entry.crop.getContext('2d').getImageData(0, 0, entry.crop.width, entry.crop.height).data;
      let red = 0;
      let dark = 0;
      let rows = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 150 && pixels[i + 1] < 110 && pixels[i + 2] < 110) {
          red++;
          rows += Math.floor(i / 4 / entry.crop.width);
        } else if (pixels[i] < 110 && pixels[i + 1] < 110 && pixels[i + 2] < 110) dark++;
      }
      const total = pixels.length / 4;
      return { text: entry.text, red: red / total, dark: dark / total, middle: red ? rows / red / entry.crop.height : -1 };
    }));
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const entry of entries) {
      expect(entry.red, `"${entry.text}" crop holds its own red print`).toBeGreaterThan(0.03);
      expect(entry.dark, `"${entry.text}" crop holds none of the black lines`).toBeLessThan(0.005);
      expect(Math.abs(entry.middle - 0.5), `"${entry.text}" sits at ${entry.middle}`).toBeLessThan(0.15);
    }
  });
});

test.describe('pages read side by side', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('a long scan uses as many workers as the machine allows and still comes out in page order', async ({ page }) => {
    const workers = [];
    page.on('request', (request) => { if (request.url().endsWith('/worker.min.js')) workers.push(request.url()); });
    const scans = [];
    for (let i = 1; i <= 8; i++) scans.push(await scannedPage(page, [`Sheet number ${i} of eight`, ...LINES]));
    await read(page, 'eight.pdf', 'application/pdf', buildPdf(scans));

    const lanes = await page.evaluate(() => window.OcrTool.workerCount({
      cores: navigator.hardwareConcurrency, memoryGb: navigator.deviceMemory, pages: 8,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches
    }));
    expect(lanes).toBeGreaterThanOrEqual(1);
    expect(lanes).toBeLessThanOrEqual(4);
    expect(workers).toHaveLength(lanes);
    // Once the run is over all but one are let go.
    expect(await page.evaluate(() => window.OcrTool.workers())).toBe(1);

    expect(await page.locator('#pagesTable tbody tr td:first-child').allTextContents()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    const text = await page.locator('#textOutput').inputValue();
    const order = [...text.matchAll(/--- Page (\d) ---\nSheet number (\d) of eight/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, n]));
    await expect(page.locator('#runStatus')).toHaveText(/^Done: 8 pages, /);

    // The PDF puts each page's text on its own page.
    const saved = await readPdf(page, await savePdf(page));
    saved.forEach((one, index) => expect(one.text).toContain(`Sheet number ${index + 1} of eight`));
  });

  test('one image uses one worker, and the workers of a run are reused by the next', async ({ page }) => {
    const workers = [];
    page.on('request', (request) => { if (request.url().endsWith('/worker.min.js')) workers.push(request.url()); });
    await read(page, 'one.png', 'image/png', await drawImage(page, LINES));
    expect(workers).toHaveLength(1);
    await read(page, 'two.png', 'image/png', await drawImage(page, LINES));
    expect(workers).toHaveLength(1);
    expect(await page.evaluate(() => window.OcrTool.workers())).toBe(1);
  });

  test('an engine that cannot start fails the run once, frees the page, and the next file is read', async ({ page }) => {
    // The language file is refused, so every worker a long scan asks for fails to start.
    await page.route('**/eng.traineddata.gz', (route) => route.abort());
    const scans = [];
    for (let i = 0; i < 4; i++) scans.push(await scannedPage(page, LINES));
    await page.setInputFiles('#fileInput', { name: 'four.pdf', mimeType: 'application/pdf', buffer: buildPdf(scans) });
    const status = page.locator('#runStatus');
    await expect(status).toHaveText('The reading engine could not start. Reload the page and try again.', { timeout: 90_000 });
    await expect(status).toHaveClass(/error/);
    await expect(page.locator('#chooseFile')).toBeEnabled();
    await expect(page.locator('#runBox')).toBeHidden();
    await expect(page.locator('#pagesTable tbody tr')).toHaveCount(0);
    // Nothing from the failed run turns up afterwards.
    await page.waitForTimeout(1500);
    await expect(status).toHaveText('The reading engine could not start. Reload the page and try again.');

    await page.unroute('**/eng.traineddata.gz');
    await read(page, 'after.png', 'image/png', await drawImage(page, LINES));
    expect(await rate(page, LINES.join('\n'))).toBeLessThanOrEqual(0.02);
  });
});
