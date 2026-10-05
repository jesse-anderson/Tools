// OCR Text Extractor: the searchable PDF and the list of doubted words.
// A saved PDF is read back with pdf.js and every line of hidden text has to
// start where the test drew it, which is what holds the overlay to the page
// through a rotated page, a moved page box, a crooked scan and an image.
const { test, expect } = require('@playwright/test');
const { drawImage, buildPdf, scannedPage, readPdf, textOnLines } = require('./ocr-fixtures.cjs');

const PAGE = '/tools/ocr-text-extractor.html';

test.describe.configure({ timeout: 120_000 });

const LINES = [
  'Quarterly meter readings from north plant',
  'Invoice 100482 totals 1,274.50 dollars',
  'Signed copies return before Friday'
];
const TYPED = ['Typed page one holds its own text.', 'Order 7731 ships on 2026-11-02.'];
const ALIKE = 'O0 l1 I| S5 B8 rn m';
const WIDTH = 1275;

const expectTextOnLines = (page, read1, options) => textOnLines(page, read1, LINES, options);

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.OcrTool))).toBe(true);
}

async function read(page, name, mimeType, buffer) {
  await page.setInputFiles('#fileInput', { name, mimeType, buffer });
  await expect(page.locator('#runStatus')).toContainText(/^Done: /, { timeout: 90_000 });
}

async function savePdf(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPdf')]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  return { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

function call(page, name, ...args) {
  return page.evaluate(([fn, list]) => {
    try {
      return { value: window.OcrTool[fn](...list) };
    } catch (error) {
      return { code: error.code };
    }
  }, [name, args]);
}

const errorRate = (page, reference, text) => page.evaluate(
  ([ref, hyp]) => window.OcrTool.characterErrorRate(ref, hyp), [reference, text]
);

// A JPEG with an EXIF block saying how the stored pixels must be turned.
function withOrientation(jpeg, orientation) {
  const exif = Buffer.from([
    0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
}

test.describe('overlay maths', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  const apply = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f];

  test('the text page is stretched onto the page box, never placed at its own size', async ({ page }) => {
    // The spike's case: a 1600 by 500 px image came back as a text page of
    // 1645.71 by 514.29 points, because the engine assumed 70 DPI.
    const { matrix } = (await call(page, 'overlayMatrix', {
      box: { x: 0, y: 0, width: 384, height: 120 }, rotation: 0, textWidth: 1645.71, textHeight: 514.29
    })).value;
    expect(apply(matrix, 0, 0)).toEqual([0, 0]);
    const corner = apply(matrix, 1645.71, 514.29);
    expect(corner[0]).toBeCloseTo(384, 9);
    expect(corner[1]).toBeCloseTo(120, 9);
    expect(matrix[0]).toBeCloseTo(384 / 1645.71, 12);
    expect(matrix[3]).toBeCloseTo(120 / 514.29, 12);
  });

  test('each page rotation sends the corners of the text page to the right corners of the box', async ({ page }) => {
    // A box away from the origin, so a dropped offset shows. The text page is
    // the page as displayed: 200 by 100 upright, 100 by 200 when turned.
    const box = { x: 10, y: 20, width: 200, height: 100 };
    const cases = {
      // rotation: [text size, where its bottom left goes, where its bottom right goes, where its top left goes]
      0: [[400, 200], [10, 20], [210, 20], [10, 120]],
      90: [[200, 400], [210, 20], [210, 120], [10, 20]],
      180: [[400, 200], [210, 120], [10, 120], [210, 20]],
      270: [[200, 400], [10, 120], [10, 20], [210, 120]]
    };
    for (const [rotation, [[tw, th], origin, right, top]] of Object.entries(cases)) {
      const result = (await call(page, 'overlayMatrix', { box, rotation: Number(rotation), textWidth: tw, textHeight: th })).value;
      expect(result.turn).toBe(Number(rotation));
      expect(result.sideways).toBe(rotation === '90' || rotation === '270');
      const got = [apply(result.matrix, 0, 0), apply(result.matrix, tw, 0), apply(result.matrix, 0, th)];
      [origin, right, top].forEach((want, i) => {
        expect(got[i][0], `rotation ${rotation} corner ${i} x`).toBeCloseTo(want[0], 9);
        expect(got[i][1], `rotation ${rotation} corner ${i} y`).toBeCloseTo(want[1], 9);
      });
    }
    // Rotations outside 0 to 270 are the same page.
    const wrapped = (await call(page, 'overlayMatrix', { box, rotation: -90, textWidth: 200, textHeight: 400 })).value;
    expect(wrapped.turn).toBe(270);
    expect((await call(page, 'overlayMatrix', { box, rotation: 450, textWidth: 200, textHeight: 400 })).value.turn).toBe(90);
  });

  test('a skew is undone about the center, and a page with no size is refused', async ({ page }) => {
    const box = { x: 0, y: 0, width: 400, height: 200 };
    const skew = 0.05;
    const { matrix } = (await call(page, 'overlayMatrix', { box, rotation: 0, textWidth: 400, textHeight: 200, skewRadians: skew })).value;
    const center = apply(matrix, 200, 100);
    expect(center[0]).toBeCloseTo(200, 9);
    expect(center[1]).toBeCloseTo(100, 9);
    // A point 100 right of center turns counterclockwise by the angle.
    const point = apply(matrix, 300, 100);
    expect(point[0]).toBeCloseTo(200 + 100 * Math.cos(skew), 9);
    expect(point[1]).toBeCloseTo(100 + 100 * Math.sin(skew), 9);

    for (const bad of [{ textWidth: 0 }, { textHeight: NaN }, { box: { x: 0, y: 0, width: 0, height: 10 } }]) {
      expect((await call(page, 'overlayMatrix', { box, rotation: 0, textWidth: 10, textHeight: 10, ...bad })).code).toBe('BAD_OVERLAY');
    }
  });

  test('an image page assumes 300 DPI and the saved file is named after the source', async ({ page }) => {
    expect((await call(page, 'imagePageSize', 2550, 3300)).value).toEqual({ width: 612, height: 792 });
    expect((await call(page, 'imagePageSize', 1275, 1650)).value).toEqual({ width: 306, height: 396 });
    expect((await call(page, 'pdfFileName', 'March scan.pdf')).value).toBe('March scan-searchable.pdf');
    expect((await call(page, 'pdfFileName', 'IMG_0412.JPG')).value).toBe('IMG_0412-searchable.pdf');
    expect((await call(page, 'pdfFileName', '')).value).toBe('ocr-text-searchable.pdf');
  });

  test('the list of doubted words stops at 200 and counts what it leaves out', async ({ page }) => {
    expect((await call(page, 'takeReview', 0, 7)).value).toEqual({ take: 7, hidden: 0 });
    expect((await call(page, 'takeReview', 195, 5)).value).toEqual({ take: 5, hidden: 0 });
    expect((await call(page, 'takeReview', 195, 9)).value).toEqual({ take: 5, hidden: 4 });
    expect((await call(page, 'takeReview', 200, 3)).value).toEqual({ take: 0, hidden: 3 });
    expect((await call(page, 'takeReview', 0, 0)).value).toEqual({ take: 0, hidden: 0 });
  });

  test('the EXIF orientation of a JPEG is read in either byte order, and absent means upright', async ({ page }) => {
    const orientation = (bytes) => page.evaluate((list) => window.OcrTool.jpegOrientation(new Uint8Array(list)), [...bytes]);
    const jpeg = await drawImage(page, ['x'], { type: 'image/jpeg', width: 200, height: 100 });
    expect(await orientation(jpeg)).toBe(1);
    for (const value of [1, 3, 6, 8]) expect(await orientation(withOrientation(jpeg, value))).toBe(value);
    expect(await orientation(withOrientation(jpeg, 9))).toBe(1);

    // The same block in big-endian order, after another segment.
    const big = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00,
      0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08,
      0x00, 0x01,
      0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x02
    ]);
    expect(await orientation(big)).toBe(8);
    expect(await orientation(await drawImage(page, ['x'], { width: 200, height: 100 }))).toBe(1);
    expect(await orientation(Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, 0x00]))).toBe(1);
    expect(await orientation(Buffer.alloc(0))).toBe(1);
  });
});

test.describe('searchable PDF from a PDF', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('a scan keeps its page and gains hidden text exactly over the print', async ({ page }) => {
    const source = buildPdf([await scannedPage(page, LINES)]);
    await read(page, 'March scan.pdf', 'application/pdf', source);
    const saved = await savePdf(page);
    expect(saved.name).toBe('March scan-searchable.pdf');
    await expect(page.locator('#copyStatus')).toHaveText(
      'Saved March scan-searchable.pdf: 1 of 1 pages given a text layer. The hidden text is the reading above, mistakes included.'
    );

    const [before] = await readPdf(page, source);
    expect(before.text.trim()).toBe('');
    const pages = await readPdf(page, saved.bytes);
    expect(pages).toHaveLength(1);
    expect([pages[0].width, pages[0].height, pages[0].rotation, pages[0].images]).toEqual([612, 792, 0, 1]);
    expect(await errorRate(page, LINES.join('\n'), pages[0].text)).toBeLessThanOrEqual(0.03);
    await expectTextOnLines(page, pages[0], { scale: 612 / WIDTH });
    // The scan itself was carried over, not drawn again: the file grew by the text only.
    expect(saved.bytes.length - source.length).toBeLessThan(12_000);
    expect(saved.bytes.length).toBeGreaterThan(source.length);
  });

  for (const rotate of [90, 180, 270]) {
    test(`a page stored turned ${rotate} degrees gets its text the right way up`, async ({ page }) => {
      await read(page, 'turned.pdf', 'application/pdf', buildPdf([await scannedPage(page, LINES, { rotate })]));
      const [saved] = await readPdf(page, (await savePdf(page)).bytes);
      expect([saved.width, saved.height, saved.rotation]).toEqual([612, 792, rotate]);
      expect(await errorRate(page, LINES.join('\n'), saved.text)).toBeLessThanOrEqual(0.03);
      await expectTextOnLines(page, saved, { scale: 612 / WIDTH });
    });
  }

  test('a page box away from the origin, drawn without restoring its coordinates, is still hit', async ({ page }) => {
    // Simple scanner output often scales the page and never undoes it. Text
    // drawn after that would be blown up by the same factor.
    const source = buildPdf([await scannedPage(page, LINES, { origin: [50, 100], unbalanced: true })]);
    await read(page, 'scanner.pdf', 'application/pdf', source);
    const [saved] = await readPdf(page, (await savePdf(page)).bytes);
    expect([saved.width, saved.height]).toEqual([612, 792]);
    await expectTextOnLines(page, saved, { scale: 612 / WIDTH });
  });

  for (const skewDeg of [3, -3]) {
    test(`a scan crooked by ${skewDeg} degrees gets text that follows the crooked print`, async ({ page }) => {
      await read(page, 'crooked.pdf', 'application/pdf', buildPdf([await scannedPage(page, LINES, { skewDeg })]));
      const turned = await page.evaluate(() => window.OcrTool.pages()[0].skew);
      // The engine straightened the page by about the angle it was drawn at.
      expect(Math.abs(turned)).toBeGreaterThan(0.03);
      const [saved] = await readPdf(page, (await savePdf(page)).bytes);
      expect(await errorRate(page, LINES.join('\n'), saved.text)).toBeLessThanOrEqual(0.03);
      await expectTextOnLines(page, saved, { scale: 612 / WIDTH, skewDeg, tolerance: 4 });
    });
  }

  test('typed pages are left exactly as they were and only the scan is given text', async ({ page }) => {
    const source = buildPdf([{ text: TYPED }, await scannedPage(page, LINES), { text: TYPED }]);
    await read(page, 'mixed.pdf', 'application/pdf', source);
    const saved = await savePdf(page);
    await expect(page.locator('#copyStatus')).toContainText('1 of 3 pages given a text layer, 2 left as they were.');

    const before = await readPdf(page, source);
    const after = await readPdf(page, saved.bytes);
    expect(after).toHaveLength(3);
    for (const index of [0, 2]) {
      expect(after[index].text).toBe(before[index].text);
      expect(after[index].items).toEqual(before[index].items);
      expect(after[index].text).toBe(TYPED.join('\n'));
    }
    await expectTextOnLines(page, after[1], { scale: 612 / WIDTH });
  });

  test('a file with nothing to add is not offered, and says why', async ({ page }) => {
    const button = page.locator('#downloadPdf');
    await expect(button).toBeDisabled();
    await expect(page.locator('#pdfNote')).toHaveText('');

    await read(page, 'typed.pdf', 'application/pdf', buildPdf([{ text: TYPED }]));
    await expect(button).toBeDisabled();
    await expect(page.locator('#pdfNote')).toHaveText(
      'No searchable PDF to save: every page read already holds its own text, so the file would come out unchanged.'
    );

    await read(page, 'blank.png', 'image/png', await drawImage(page, []));
    await expect(button).toBeDisabled();
    await expect(page.locator('#pdfNote')).toHaveText('No searchable PDF to save: no words were found to put in it.');

    await read(page, 'scan.pdf', 'application/pdf', buildPdf([await scannedPage(page, LINES)]));
    await expect(button).toBeEnabled();
    await expect(page.locator('#pdfNote')).toHaveText('');
  });

  test('a stopped run saves the whole file with text on the pages it reached', async ({ page }) => {
    const scans = [];
    for (let i = 0; i < 5; i++) scans.push(await scannedPage(page, LINES));
    await page.evaluate(() => {
      const body = document.querySelector('#pagesTable tbody');
      const observer = new MutationObserver(() => {
        if (body.rows.length >= 2) {
          observer.disconnect();
          document.getElementById('stopRun').click();
        }
      });
      observer.observe(body, { childList: true });
    });
    await page.setInputFiles('#fileInput', { name: 'five.pdf', mimeType: 'application/pdf', buffer: buildPdf(scans) });
    await expect(page.locator('#runStatus')).toContainText('Stopped after', { timeout: 90_000 });
    const reached = await page.locator('#pagesTable tbody tr').count();
    expect(reached).toBeLessThan(5);

    const saved = await readPdf(page, (await savePdf(page)).bytes);
    expect(saved).toHaveLength(5);
    await expect(page.locator('#copyStatus')).toContainText(`${reached} of 5 pages given a text layer, ${5 - reached} left as they were.`);
    // Pages are read side by side, so the ones reached need not be the first ones.
    const numbers = (await page.locator('#pagesTable tbody tr td:first-child').allTextContents()).map(Number);
    saved.forEach((one, index) => {
      expect(one.images).toBe(1);
      expect(one.text.trim() !== '', `page ${index + 1}`).toBe(numbers.includes(index + 1));
    });
  });

  test('a built file that does not reopen with the right page count is refused', async ({ page }) => {
    const source = buildPdf([{ text: TYPED }, { text: TYPED }]);
    const check = (bytes, count) => page.evaluate(async ([base64, pages]) => {
      const out = await import('/js/ocr_text_extractor/ocr-pdf-out.js');
      try {
        await out.checkPdf(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), pages);
        return 'ok';
      } catch (error) {
        return `${error.code}: ${error.message}`;
      }
    }, [bytes.toString('base64'), count]);
    expect(await check(source, 2)).toBe('ok');
    expect(await check(source, 3)).toBe('PDF_CHECK: The PDF that was built has 2 pages where 3 were expected, so it was not saved.');
    expect(await check(Buffer.from('not a pdf'), 1)).toBe('PDF_CHECK: The PDF that was built did not open again, so it was not saved.');
  });
});

test.describe('searchable PDF from an image', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('a PNG becomes one page its own size with the text over the print', async ({ page }) => {
    await read(page, 'sheet.png', 'image/png', await drawImage(page, LINES));
    const saved = await savePdf(page);
    expect(saved.name).toBe('sheet-searchable.pdf');
    const pages = await readPdf(page, saved.bytes);
    expect(pages).toHaveLength(1);
    // 1275 by 1650 px at 300 DPI.
    expect([pages[0].width, pages[0].height, pages[0].images]).toEqual([306, 396, 1]);
    expect(await errorRate(page, LINES.join('\n'), pages[0].text)).toBeLessThanOrEqual(0.03);
    await expectTextOnLines(page, pages[0], { scale: 72 / 300 });
  });

  test('a crooked photo gets text that follows the crooked print', async ({ page }) => {
    await read(page, 'crooked.png', 'image/png', await drawImage(page, LINES, { skewDeg: 3 }));
    expect(Math.abs(await page.evaluate(() => window.OcrTool.pages()[0].skew))).toBeGreaterThan(0.03);
    const [saved] = await readPdf(page, (await savePdf(page)).bytes);
    await expectTextOnLines(page, saved, { scale: 72 / 300, skewDeg: 3, tolerance: 2 });
  });

  test('a phone photo stored sideways with an EXIF turn comes out upright with its text', async ({ page }) => {
    // Orientation 6: the stored pixels are turned a quarter turn clockwise to
    // display. Embedding them as stored would put the print on its side under
    // text that is upright.
    const stored = await drawImage(page, LINES, { type: 'image/jpeg', turn: 90 });
    await read(page, 'IMG_0412.jpg', 'image/jpeg', withOrientation(stored, 6));
    expect(await page.locator('#pagesTable tbody tr td').nth(1).textContent()).toBe('Pixels, 1275 by 1650 px');
    const [saved] = await readPdf(page, (await savePdf(page)).bytes);
    expect([saved.width, saved.height, saved.images]).toEqual([306, 396, 1]);
    await expectTextOnLines(page, saved, { scale: 72 / 300 });
  });

  test('an upright JPEG is put in byte for byte, and a WebP is redrawn as a JPEG', async ({ page }) => {
    const jpeg = await drawImage(page, LINES, { type: 'image/jpeg' });
    await read(page, 'scan.jpg', 'image/jpeg', jpeg);
    const fromJpeg = await savePdf(page);
    expect(fromJpeg.bytes.includes(jpeg)).toBe(true);
    await expectTextOnLines(page, (await readPdf(page, fromJpeg.bytes))[0], { scale: 72 / 300 });

    await read(page, 'scan.webp', 'image/webp', await drawImage(page, LINES, { type: 'image/webp' }));
    const [fromWebp] = await readPdf(page, (await savePdf(page)).bytes);
    expect([fromWebp.width, fromWebp.height, fromWebp.images]).toEqual([306, 396, 1]);
    await expectTextOnLines(page, fromWebp, { scale: 72 / 300 });
  });
});

test.describe('check these', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('the card is hidden until the engine doubts a word', async ({ page }) => {
    await expect(page.locator('#reviewCard')).toBeHidden();
    await read(page, 'clean.png', 'image/png', await drawImage(page, LINES));
    await expect(page.locator('#reviewCard')).toBeHidden();
    expect(await page.evaluate(() => window.OcrTool.review())).toEqual([]);
  });

  for (const skewDeg of [0, 3, -3]) {
    test(`each doubted word sits beside its own pixels on a scan turned ${skewDeg} degrees`, async ({ page }) => {
      // Only the look-alike line is red, with black print a line above and below,
      // so a crop cut from the wrong place holds no red.
      const lines = [LINES[0], ALIKE, LINES[2]];
      const image = await drawImage(page, lines, { skewDeg, red: ALIKE.split(' ') });
      await read(page, 'alike.png', 'image/png', image);

      const card = page.locator('#reviewCard');
      await expect(card).toBeVisible();
      const entries = await page.evaluate(() => window.OcrTool.review().map((entry) => {
        const pixels = entry.crop.getContext('2d').getImageData(0, 0, entry.crop.width, entry.crop.height).data;
        let red = 0;
        let dark = 0;
        let redRows = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 150 && pixels[i + 1] < 110 && pixels[i + 2] < 110) {
            red++;
            redRows += Math.floor(i / 4 / entry.crop.width);
          } else if (pixels[i] < 110 && pixels[i + 1] < 110 && pixels[i + 2] < 110) dark++;
        }
        const total = pixels.length / 4;
        return {
          page: entry.page, text: entry.text, confidence: entry.confidence,
          width: entry.crop.width, height: entry.crop.height, red: red / total, dark: dark / total,
          // Where the red print sits down the crop, 0 at the top and 1 at the bottom.
          middle: red ? redRows / red / entry.crop.height : -1
        };
      }));
      expect(entries.length).toBeGreaterThanOrEqual(1);
      for (const entry of entries) {
        expect(entry.page).toBe(1);
        expect(entry.confidence).toBeLessThan(60);
        expect(entry.red, `"${entry.text}" crop holds its own red print`).toBeGreaterThan(0.03);
        expect(entry.dark, `"${entry.text}" crop holds none of the black lines`).toBeLessThan(0.005);
        // The word is in the middle of its crop, not sliding out of one edge.
        expect(Math.abs(entry.middle - 0.5), `"${entry.text}" sits at ${entry.middle}`).toBeLessThan(0.15);
        expect(entry.height).toBeLessThanOrEqual(56);
        expect(entry.width).toBeLessThanOrEqual(420);
      }

      // The table shows the same entries, and agrees with the page row.
      const rows = page.locator('#reviewTable tbody tr');
      await expect(rows).toHaveCount(entries.length);
      expect(Number(await page.locator('#pagesTable tbody tr td').nth(4).textContent())).toBe(entries.length);
      for (let i = 0; i < entries.length; i++) {
        const cells = rows.nth(i).locator('td');
        await expect(cells.nth(0)).toHaveText('1');
        await expect(cells.nth(1).locator('canvas')).toHaveAttribute('aria-label', `The pixels read as ${entries[i].text}`);
        await expect(cells.nth(1).locator('canvas')).toHaveAttribute('role', 'img');
        await expect(cells.nth(2)).toHaveText(entries[i].text);
        await expect(cells.nth(3)).toHaveText(String(Math.round(entries[i].confidence)));
      }
      await expect(page.locator('#reviewNote')).toContainText(
        `${entries.length} ${entries.length === 1 ? 'word' : 'words'} the engine scored under 60, in page order, each beside the pixels it was read from.`
      );
      await expect(page.locator('#reviewNote')).toContainText('was not doubted, which is not the same as right');
    });
  }

  test('doubted words carry their page number across a PDF and are cleared by the next file', async ({ page }) => {
    const pdf = buildPdf([
      await scannedPage(page, LINES), await scannedPage(page, [ALIKE]), { text: TYPED }, await scannedPage(page, [LINES[0], ALIKE])
    ]);
    await read(page, 'four.pdf', 'application/pdf', pdf);
    const pagesListed = await page.locator('#reviewTable tbody tr td:first-child').allTextContents();
    expect(pagesListed.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(pagesListed)]).toEqual(['2', '4']);
    // In page order.
    expect(pagesListed).toEqual([...pagesListed].sort());

    await read(page, 'clean.png', 'image/png', await drawImage(page, LINES));
    await expect(page.locator('#reviewCard')).toBeHidden();
    await expect(page.locator('#reviewTable tbody tr')).toHaveCount(0);
  });

  test('the card fits a phone and its crops never overflow their column', async ({ page }) => {
    await read(page, 'alike.png', 'image/png', await drawImage(page, [ALIKE, ALIKE, LINES[0]]));
    await expect(page.locator('#reviewCard')).toBeVisible();
    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
});
