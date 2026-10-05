// OCR Text Extractor: pages the first 82 tests never fed it, each of which an
// audit found the tool reading wrongly with nothing said: two columns, ruled
// tables, a page on its side or upside down, a dark-mode screenshot and small
// screenshot print. Also the smaller fixes from the same audit.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { repoRoot } = require('./helpers.cjs');
const { buildPdf, readPdf } = require('./ocr-fixtures.cjs');

const PAGE = '/tools/ocr-text-extractor.html';

test.describe.configure({ timeout: 120_000 });

const T = [
  'Maintenance log for the north plant, week 41.',
  'Unit 4 inlet pressure read 482.13 kPa at 06:15 and',
  'held within two percent until the noon check.',
  'The spare gasket, part number 7731-B, arrived on',
  '2026-10-04 and was fitted the same afternoon.',
  'Total cost came to 1,274.50 dollars before tax.'
];
const LEFT = ['The valve was shut at nine and', 'opened again before noon. A', 'second crew took the readings', 'and wrote them in the log.', 'Pressure held at 482 kPa.'];
const RIGHT = ['Costs for the month came to', '1,274.50 dollars, of which the', 'gasket was 207.00. Returns', 'are due within thirty days.', 'Call 5508 with questions.'];
const CELLS = [['Item', 'Qty', 'Price'], ['Gasket 7731-B', '4', '18.25'], ['Valve seat', '12', '207.00'], ['Flange bolt', '48', '1.15'], ['Total', '64', '2,612.20']];
const TABLE = CELLS.map((row) => row.join(' ')).join('\n');

// Drawing helpers, sent to the page as source text with each fixture.
const KIT = `
  const T = ${JSON.stringify(T)}, LEFT = ${JSON.stringify(LEFT)}, RIGHT = ${JSON.stringify(RIGHT)}, CELLS = ${JSON.stringify(CELLS)};
  const blank = (w, h, paper = '#ffffff') => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = paper; g.fillRect(0, 0, w, h); g.fillStyle = '#111111';
    return [c, g];
  };
  const sheet = (paper = '#ffffff', ink = '#111111') => {
    const [c, g] = blank(1500, 900, paper); g.fillStyle = ink; g.font = '34px Georgia, serif';
    T.forEach((row, i) => g.fillText(row, 110, 150 + i * 86));
    return c;
  };
  const quarterTurns = (source, turns) => {
    const c = document.createElement('canvas');
    c.width = turns % 2 ? source.height : source.width; c.height = turns % 2 ? source.width : source.height;
    const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(turns * Math.PI / 2);
    g.drawImage(source, -source.width / 2, -source.height / 2);
    return c;
  };
  const table = (rules, thick = 2) => {
    const [c, g] = blank(1200, 700); g.strokeStyle = '#111111'; g.lineWidth = thick; g.font = '32px Georgia, serif';
    const xs = [80, 560, 800, 1120];
    CELLS.forEach((row, i) => row.forEach((text, j) => g.fillText(text, xs[j] + 20, 150 + i * 100)));
    if (rules !== 'none') for (let i = 0; i <= 5; i++) { g.beginPath(); g.moveTo(80, 90 + i * 100); g.lineTo(1120, 90 + i * 100); g.stroke(); }
    if (rules === 'full') for (const x of xs) { g.beginPath(); g.moveTo(x, 90); g.lineTo(x, 590); g.stroke(); }
    return c;
  };
  const screenshot = (px, dark) => {
    const [c, g] = blank(900, 400, dark ? '#1e1e1e' : '#ffffff'); g.fillStyle = dark ? '#d4d4d4' : '#111111'; g.font = px + 'px Arial, sans-serif';
    T.forEach((row, i) => g.fillText(row, 40, 60 + i * px * 1.8));
    return c;
  };
`;

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.OcrTool))).toBe(true);
}

// `make` is an expression, using the kit, that gives a canvas.
async function png(page, make) {
  return Buffer.from(await page.evaluate(`(() => { ${KIT} return (${make}).toDataURL('image/png').split(',')[1]; })()`), 'base64');
}

async function read(page, name, mimeType, buffer) {
  await page.setInputFiles('#fileInput', { name, mimeType, buffer });
  await expect(page.locator('#runStatus')).toContainText(/^Done: /, { timeout: 90_000 });
}

async function readDrawn(page, make) {
  await read(page, 'drawn.png', 'image/png', await png(page, make));
  return {
    detail: await page.locator('#pagesTable tbody tr td').nth(1).textContent(),
    text: await page.locator('#textOutput').inputValue()
  };
}

const rate = (page, reference, text) => page.evaluate(([ref, hyp]) => window.OcrTool.characterErrorRate(ref, hyp), [reference, text]);
const call = (page, name, ...args) => page.evaluate(([fn, list]) => window.OcrTool[fn](...list), [name, args]);

async function savedPdf(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPdf')]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  return readPdf(page, Buffer.concat(chunks));
}

function inPrepare(page, body) {
  return page.evaluate(`(async () => {
    ${KIT}
    const prep = await import('/js/ocr_text_extractor/ocr-prepare.js');
    const lumOf = (canvas) => prep.luminance(
      canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, canvas.width * canvas.height
    );
    return (${body.toString()})(prep, lumOf);
  })()`);
}

test.describe('page layout', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('two columns are read one after the other, not straight across', async ({ page }) => {
    const { detail, text } = await readDrawn(page, `(() => {
      const [c, g] = blank(1500, 700); g.font = '32px Georgia, serif';
      LEFT.forEach((row, i) => g.fillText(row, 80, 150 + i * 80));
      RIGHT.forEach((row, i) => g.fillText(row, 820, 150 + i * 80));
      return c;
    })()`);
    expect(detail).toBe('Pixels, 1500 by 700 px');
    expect(await rate(page, LEFT.concat(RIGHT).join('\n'), text)).toBeLessThanOrEqual(0.01);
    // Read as one block, the first line of the right column follows the first of the left.
    expect(text).not.toContain('nine and Costs');
    expect(text.indexOf('Pressure held')).toBeLessThan(text.indexOf('Costs for the month'));
  });

  for (const rules of ['full', 'rows']) {
    test(`a table ruled ${rules === 'full' ? 'in both directions' : 'between its rows'} is read row by row`, async ({ page }) => {
      const { detail, text } = await readDrawn(page, `table('${rules}')`);
      // The rules are not mistaken for small print.
      expect(detail).toBe('Pixels, 1200 by 700 px');
      expect(await rate(page, TABLE, text)).toBeLessThanOrEqual(0.01);
    });
  }

  test('white print on a dark band is read with the rest of the page', async ({ page }) => {
    const { text } = await readDrawn(page, `(() => {
      const c = sheet(); const g = c.getContext('2d');
      g.fillStyle = '#16233f'; g.fillRect(0, 100, 1500, 80);
      g.fillStyle = '#ffffff'; g.font = '34px Georgia, serif'; g.fillText(T[0], 110, 150);
      return c;
    })()`);
    expect(await rate(page, T.join('\n'), text)).toBeLessThanOrEqual(0.01);
    expect(text).toContain('Maintenance log');
  });
});

test.describe('which way up', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('a page on its side is read either way round', async ({ page }) => {
    const right = await readDrawn(page, 'quarterTurns(sheet(), 1)');
    expect(await rate(page, T.join('\n'), right.text)).toBeLessThanOrEqual(0.01);
    const left = await readDrawn(page, 'quarterTurns(sheet(), 3)');
    expect(await rate(page, T.join('\n'), left.text)).toBeLessThanOrEqual(0.01);
    // One of the two the engine reads by itself; the other needs the second look.
    expect([right.detail, left.detail].sort()).toEqual([
      'Pixels, 900 by 1500 px', 'Pixels, 900 by 1500 px, turned the right way up'
    ]);
  });

  test('an upside-down page is read again the right way up, said so, and its PDF text sits on the print', async ({ page }) => {
    const { detail, text } = await readDrawn(page, 'quarterTurns(sheet(), 2)');
    expect(detail).toBe('Pixels, 1500 by 900 px, turned the right way up');
    expect(await rate(page, T.join('\n'), text)).toBeLessThanOrEqual(0.01);
    await expect(page.locator('#pageNotes')).toContainText('"Turned the right way up" means the page read as nonsense');

    // The saved page is still upside down, so its hidden text must be too:
    // the first line starts at the far corner and runs right to left.
    const [saved] = await savedPdf(page);
    expect([saved.width, saved.height]).toEqual([360, 216]);
    const first = saved.items.find((item) => item.str.startsWith('Maintenance'));
    expect(first, 'the first line is in the PDF').toBeTruthy();
    expect(Math.abs(first.x - (1500 - 110) * 0.24)).toBeLessThanOrEqual(3);
    expect(Math.abs(first.y - (900 - 150) * 0.24)).toBeLessThanOrEqual(3);
    expect(first.dx).toBeCloseTo(-1, 2);
    expect(first.dy).toBeCloseTo(0, 2);
  });

  test('a second look is taken only at a page that read badly, and kept only when clearly better', async ({ page }) => {
    const words = (n) => Array.from({ length: n }, () => ({}));
    expect(await call(page, 'shouldRetryFlipped', { confidence: 49.9, words: words(3) })).toBe(true);
    expect(await call(page, 'shouldRetryFlipped', { confidence: 50, words: words(40) })).toBe(false);
    // A blank page or a stray mark is not read twice.
    expect(await call(page, 'shouldRetryFlipped', { confidence: 10, words: words(2) })).toBe(false);
    expect(await call(page, 'shouldRetryFlipped', { confidence: 0, words: [] })).toBe(false);
    expect(await call(page, 'betterReading', { confidence: 33 }, { confidence: 95 })).toBe(true);
    expect(await call(page, 'betterReading', { confidence: 45 }, { confidence: 60 })).toBe(true);
    expect(await call(page, 'betterReading', { confidence: 45.1 }, { confidence: 60 })).toBe(false);
    // Better, but still not a fair reading: nonsense both ways up.
    expect(await call(page, 'betterReading', { confidence: 20 }, { confidence: 59.9 })).toBe(false);
    expect(await call(page, 'betterReading', { confidence: 33 }, { confidence: 20 })).toBe(false);
  });

  test('a page that reads badly both ways keeps its first reading and is not said to be turned', async ({ page }) => {
    // Loops, not letters: nonsense whichever way up.
    const { detail } = await readDrawn(page, `(() => {
      const [c, g] = blank(1400, 700); g.font = '60px Georgia, serif';
      const marks = '|/~^_=';
      for (let r = 0; r < 4; r++) for (let i = 0; i < 26; i++) g.fillText(marks[(i * 3 + r) % marks.length], 80 + i * 48, 140 + r * 150);
      return c;
    })()`);
    expect(detail).not.toContain('turned the right way up');
  });
});

test.describe('screenshots', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('light print on a dark ground is read as it is, with its light left alone', async ({ page }) => {
    const { detail, text } = await readDrawn(page, `sheet('#1e1e1e', '#e6e6e6')`);
    expect(detail).toBe('Pixels, 1500 by 900 px');
    expect(await rate(page, T.join('\n'), text)).toBe(0);
  });

  for (const [px, dark, times, bound] of [[16, false, 2, 0.005], [13, false, 2, 0.005], [13, true, 2, 0.005], [9, false, 3, 0.02]]) {
    test(`${px}px ${dark ? 'dark-mode' : 'screenshot'} print is enlarged ${times}x before reading`, async ({ page }) => {
      const { detail, text } = await readDrawn(page, `screenshot(${px}, ${dark})`);
      expect(detail).toBe(`Pixels, 900 by 400 px, enlarged ${times}x`);
      // Read at its own size, 13px print gets about 3% of characters wrong and 9px a quarter.
      expect(await rate(page, T.join('\n'), text)).toBeLessThanOrEqual(bound);
      await expect(page.locator('#pageNotes')).toContainText('"Enlarged" means the print was small');
    });
  }

  test('an enlarged page keeps its own size in the PDF, with the text on the print', async ({ page }) => {
    await readDrawn(page, 'screenshot(13, false)');
    const [saved] = await savedPdf(page);
    // 900 by 400 px at 300 DPI, not three times that.
    expect([saved.width, saved.height]).toEqual([216, 96]);
    const first = saved.items.find((item) => item.str.startsWith('Maintenance'));
    expect(Math.abs(first.x - 40 * 0.24)).toBeLessThanOrEqual(1);
    expect(Math.abs(first.y - 60 * 0.24)).toBeLessThanOrEqual(1);
    expect(first.dx).toBeCloseTo(1, 2);
  });

  test('line height is measured from the print, whichever is the darker, and rules do not count', async ({ page }) => {
    const found = await inPrepare(page, (prep, lumOf) => {
      const measure = (canvas) => prep.lineHeight(lumOf(canvas), canvas.width, canvas.height);
      const empty = blank(400, 300)[0];
      return {
        big: measure(sheet()),
        bigDark: measure(sheet('#1e1e1e', '#e6e6e6')),
        small: measure(screenshot(13, false)),
        smallDark: measure(screenshot(13, true)),
        tiny: measure(screenshot(9, false)),
        ruled: measure(table('full')),
        rowRuled: measure(table('rows')),
        unruled: measure(table('none')),
        // Rules heavy enough to be several rows deep even on the small copy that is measured.
        thickRuled: measure(table('rows', 12)),
        // The same sheet with short hairlines between its lines, as a form has.
        hairlines: measure((() => {
          const c = sheet(); const g = c.getContext('2d'); g.fillStyle = '#111111';
          for (let i = 0; i < 12; i++) g.fillRect(110, 172 + i * 43, 260, 3);
          return c;
        })()),
        empty: measure(empty),
        medians: [prep.medianLuminance(lumOf(sheet())), prep.medianLuminance(lumOf(sheet('#1e1e1e', '#e6e6e6')))]
      };
    });
    // 34px Georgia is about 32 px from the top of a tall letter to the bottom of a low one.
    expect(found.big).toBeGreaterThanOrEqual(28);
    expect(found.big).toBeLessThanOrEqual(36);
    expect(Math.abs(found.bigDark - found.big)).toBeLessThanOrEqual(2);
    expect(found.small).toBeGreaterThanOrEqual(10);
    expect(found.small).toBeLessThanOrEqual(15);
    expect(Math.abs(found.smallDark - found.small)).toBeLessThanOrEqual(2);
    expect(found.tiny).toBeGreaterThanOrEqual(6);
    expect(found.tiny).toBeLessThan(10);
    // The same print with and without rules round it measures the same.
    expect(Math.abs(found.ruled - found.unruled)).toBeLessThanOrEqual(2);
    expect(Math.abs(found.rowRuled - found.unruled)).toBeLessThanOrEqual(2);
    expect(Math.abs(found.thickRuled - found.unruled)).toBeLessThanOrEqual(2);
    // Twelve hairlines against six lines of print would otherwise be the middle run.
    expect(Math.abs(found.hairlines - found.big)).toBeLessThanOrEqual(3);
    expect(found.unruled).toBeGreaterThanOrEqual(24);
    expect(found.empty).toBe(0);
    expect(found.medians[0]).toBeGreaterThan(240);
    expect(found.medians[1]).toBeLessThan(60);
  });

  test('print is enlarged twice under 20 px, three times under 10, and never past the pixel limit', async ({ page }) => {
    const result = await inPrepare(page, (prep) => {
      const by = [0, 6, 9.9, 10, 15, 19.9, 20, 34].map((h) => prep.enlargeBy(h));
      const free = prep.prepare(screenshot(13, false));
      // Room for twice but not three times, then for neither.
      const tiny = screenshot(9, false);
      const twice = prep.prepare(tiny, undefined, 900 * 400 * 4);
      const none = prep.prepare(screenshot(9, false), undefined, 900 * 400 * 3);
      const dark = prep.prepare(sheet('#1e1e1e', '#e6e6e6'));
      return {
        by,
        free: [free.enlarged, free.canvas.width, free.canvas.height, free.frame],
        twice: [twice.enlarged, twice.canvas.width],
        none: [none.enlarged, none.canvas.width],
        dark: [dark.evened, dark.enlarged, dark.turnDegrees]
      };
    });
    expect(result.by).toEqual([1, 3, 3, 2, 2, 2, 1, 1]);
    // Enlarging covers the same page with more pixels, so the frame is unchanged.
    expect(result.free).toEqual([2, 1800, 800, { x: 1, y: 1 }]);
    expect(result.twice).toEqual([2, 1800]);
    expect(result.none).toEqual([1, 900]);
    expect(result.dark).toEqual([false, 1, 0]);
  });
});

test.describe('smaller fixes', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('the word count above the text is the one in the status line', async ({ page }) => {
    const typed = (n) => ({ text: [`page ${n} one two three four five six seven eight`] });
    await read(page, 'typed.pdf', 'application/pdf', buildPdf([typed(1), typed(2), typed(3)]));
    await expect(page.locator('#runStatus')).toHaveText('Done: 3 pages, 30 words.');
    // Counting the text box would add four for each page marker.
    await expect(page.locator('#textSummary')).toHaveText('From typed.pdf: 30 words on 3 of 3 pages.');
    expect(await call(page, 'totalWords', [
      { number: 1, source: 'file', text: 'a b c' }, { number: 2, source: 'image', text: 'x', words: [{}, {}] }
    ])).toBe(5);
  });

  test('a confidence is shown rounded down, so a page under a limit never displays as on it', async ({ page }) => {
    expect(await call(page, 'showConfidence', 69.5)).toBe('69');
    expect(await call(page, 'showConfidence', 69.99)).toBe('69');
    expect(await call(page, 'showConfidence', 70)).toBe('70');
    expect(await call(page, 'showConfidence', 59.6)).toBe('59');
  });

  test('what was done to a page is described from its record', async ({ page }) => {
    expect(await call(page, 'describeRepairs', { evened: false, turnDegrees: 0, enlarged: 1, flipped: false })).toBe('');
    expect(await call(page, 'describeRepairs', { evened: true, turnDegrees: -12.1, enlarged: 2, flipped: true }))
      .toBe(', lighting evened, turned 12.1 degrees, turned the right way up, enlarged 2x');
    expect(await call(page, 'describeRepairs', { evened: false, turnDegrees: 0, enlarged: 3, flipped: false })).toBe(', enlarged 3x');
  });

  test('crops are cut only for as many words as the list could still show', async ({ page }) => {
    const pages = [{ number: 1, review: new Array(150) }, { number: 3, review: new Array(30) }, { number: 5, source: 'file' }];
    expect(await call(page, 'reviewRoom', [], 1)).toBe(200);
    expect(await call(page, 'reviewRoom', pages, 2)).toBe(50);
    expect(await call(page, 'reviewRoom', pages, 4)).toBe(20);
    // A page's own entry, or a later one, does not use up its room.
    expect(await call(page, 'reviewRoom', pages, 3)).toBe(50);
    expect(await call(page, 'reviewRoom', [{ number: 1, review: new Array(260) }], 2)).toBe(0);
  });

  test('a file name in any script keeps its letters, and only characters a file system refuses are replaced', async ({ page }) => {
    expect(await call(page, 'textFileName', 'résumé final.pdf')).toBe('résumé final.txt');
    expect(await call(page, 'textFileName', '見積書.pdf')).toBe('見積書.txt');
    expect(await call(page, 'pdfFileName', 'Счёт №5.png')).toBe('Счёт №5-searchable.pdf');
    expect(await call(page, 'textFileName', 'a/b\\c:d*e?f"g<h>i|j.png')).toBe('a_b_c_d_e_f_g_h_i_j.txt');
    expect(await call(page, 'textFileName', `${'n'.repeat(300)}.pdf`)).toBe(`${'n'.repeat(120)}.txt`);
  });

  test('ticking the PDF-only box with an image loaded does not read the image again', async ({ page }) => {
    await read(page, 'photo.png', 'image/png', await png(page, 'sheet()'));
    await page.evaluate(() => {
      window.__rows = 0;
      new MutationObserver(() => { window.__rows++; }).observe(document.querySelector('#pagesTable tbody'), { childList: true });
    });
    await page.check('#forceOcr');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => [window.OcrTool.isRunning(), window.__rows])).toEqual([false, 0]);
    await expect(page.locator('#runStatus')).toHaveText(/^Done: 1 page/);

    // With a PDF loaded it still does.
    await page.uncheck('#forceOcr');
    await read(page, 'typed.pdf', 'application/pdf', buildPdf([{ text: ['A typed page with enough text to count as text.'] }]));
    await page.check('#forceOcr');
    await expect.poll(async () => page.locator('#pagesTable tbody tr td').nth(1).textContent(), { timeout: 60_000 }).toBe('Pixels, 300 DPI');
  });

  test('a file given while another is being read is named and refused, not dropped in silence', async ({ page }) => {
    const note = page.locator('#busyNote');
    await expect(note).toHaveText('');
    await expect(note).toHaveAttribute('role', 'status');
    // Stop holds the run open: the second file arrives from inside the page while the first is opening.
    const first = await png(page, 'sheet()');
    await page.evaluate(() => {
      const status = document.getElementById('runStatus');
      const observer = new MutationObserver(() => {
        if (!status.textContent.startsWith('Opening')) return;
        observer.disconnect();
        const data = new DataTransfer();
        data.items.add(new File(['x'], 'second.png', { type: 'image/png' }));
        document.getElementById('dropZone').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
      });
      observer.observe(status, { childList: true });
    });
    await page.setInputFiles('#fileInput', { name: 'first.png', mimeType: 'image/png', buffer: first });
    await expect(note).toHaveText('second.png was not read: another file is still being read. Wait for it, or press Stop, then choose it again.');
    await expect(page.locator('#runStatus')).toContainText(/^Done: 1 page/, { timeout: 90_000 });
    await expect(page.locator('#textSummary')).toContainText('From first.png');
    // The next file clears the note.
    await read(page, 'third.png', 'image/png', first);
    await expect(note).toHaveText('');
  });

  test('the text box keeps its place and its selection when its text changes', async ({ page }) => {
    const pages = Array.from({ length: 12 }, (_, i) => ({ text: Array.from({ length: 12 }, (__, j) => `Typed page ${i + 1} line ${j + 1} of some text.`) }));
    await read(page, 'long.pdf', 'application/pdf', buildPdf(pages));
    const box = page.locator('#textOutput');
    // Selecting scrolls the box, so the place is set after it.
    await box.evaluate((el) => { el.focus(); el.setSelectionRange(1200, 1260); el.scrollTop = 700; });
    const place = () => box.evaluate((el) => [el.scrollTop, el.selectionStart, el.selectionEnd]);
    expect(await place()).toEqual([700, 1200, 1260]);
    // The text is rewritten without the page markers while the box keeps the
    // focus, as it does when a page arrives while someone is selecting.
    const setMarkers = (on) => page.evaluate((checked) => {
      const input = document.getElementById('pageSeparators');
      input.checked = checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, on);
    await setMarkers(false);
    await expect(box).not.toHaveValue(/--- Page/);
    expect(await place()).toEqual([700, 1200, 1260]);
    await setMarkers(true);
    await expect(box).toHaveValue(/--- Page 12 ---/);
    expect(await place()).toEqual([700, 1200, 1260]);
  });

  test('every PDF is opened with function building off, in a pdf.js that has the fix', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'js', 'ocr_text_extractor', 'ocr-pdf-in.js'), 'utf8');
    const opens = source.match(/getDocument\(([^)]*)\)/g);
    expect(opens).toHaveLength(1);
    expect(opens[0]).toContain('isEvalSupported: false');
    // The version the page declares, which the hash test ties to the file.
    const declared = fs.readFileSync(path.join(repoRoot, 'tools', 'ocr-text-extractor.html'), 'utf8');
    const version = declared.match(/- pdf\.js: (\d+)\.(\d+)\.(\d+) /).slice(1).map(Number);
    // CVE-2024-4367 is fixed from 4.2.67.
    expect(version[0] > 4 || (version[0] === 4 && (version[1] > 2 || (version[1] === 2 && version[2] >= 67)))).toBe(true);
  });
});
