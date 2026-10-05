// OCR Text Extractor: the page. Every file fed to it is built here, so the
// expected text is known: images are drawn on a canvas, and PDFs are written
// by hand with typed pages (text the file holds) and scanned pages (a JPEG).
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly, expectContrastAA, readDownloadText } = require('./helpers.cjs');

const { drawImage, buildPdf, scannedPage } = require('./ocr-fixtures.cjs');

const PAGE = '/tools/ocr-text-extractor.html';

test.describe.configure({ timeout: 120_000 });

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.OcrTool))).toBe(true);
}

function give(page, name, mimeType, buffer) {
  return page.setInputFiles('#fileInput', { name, mimeType, buffer });
}

async function waitForDone(page) {
  await expect(page.locator('#runStatus')).toContainText(/^Done: /, { timeout: 90_000 });
}

const rate = (page, reference) => page.evaluate(
  (ref) => window.OcrTool.characterErrorRate(ref, document.getElementById('textOutput').value), reference
);

const rows = (page) => page.locator('#pagesTable tbody tr').evaluateAll(
  (list) => list.map((tr) => [...tr.cells].map((td) => td.textContent))
);

const TYPED_1 = ['Typed page one holds its own text.', 'Order 7731 ships on 2026-11-02.'];
const TYPED_2 = ['Typed page two is also born digital.', 'Nothing here needs reading from pixels.'];
const SCAN = ['This page is only a picture of text.', 'Meter reading 48213 on 2026-10-04.'];
const ALIKE = ['O0 l1 I| S5 B8 rn m'];

test.describe('OCR text extractor page', () => {
  test('loads cleanly and fetches no engine until a file is given', async ({ page, baseURL }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await expectPageToLoadCleanly(page, baseURL, PAGE);
    await expect(page.locator('h1')).toHaveText('OCR Text Extractor');
    await expect(page.locator('#copyText')).toBeDisabled();
    await expect(page.locator('#downloadText')).toBeDisabled();
    await expect(page.locator('#runBox')).toBeHidden();
    expect(requests.filter((url) => url.includes('/vendor/'))).toEqual([]);
  });

  test('an image is read into the box, with its row, and saved as a .txt', async ({ page }) => {
    await openTool(page);
    await give(page, 'meter photo.png', 'image/png', await drawImage(page, SCAN));
    await waitForDone(page);

    expect(await rate(page, SCAN.join('\n'))).toBeLessThanOrEqual(0.02);
    const table = await rows(page);
    expect(table).toHaveLength(1);
    expect(table[0][0]).toBe('1');
    expect(table[0][1]).toBe('Pixels, 1275 by 1650 px');
    expect(Number(table[0][2])).toBe(SCAN.join(' ').split(' ').length);
    expect(Number(table[0][3])).toBeGreaterThanOrEqual(70);
    await expect(page.locator('#textSummary')).toHaveText('From meter photo.png: 13 words on 1 of 1 pages.');
    await expect(page.locator('#runStatus')).toHaveText('Done: 1 page, 13 words.');
    // One page gets no page marker.
    await expect(page.locator('#textOutput')).not.toHaveValue(/--- Page/);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadText')]);
    expect(download.suggestedFilename()).toBe('meter photo.txt');
    expect(await readDownloadText(download)).toBe(await page.locator('#textOutput').inputValue());
  });

  test('the camera input takes a JPEG the same way, and a pasted image is read', async ({ page }) => {
    await openTool(page);
    await expect(page.locator('#cameraInput')).toHaveAttribute('capture', 'environment');
    await expect(page.locator('#cameraInput')).toHaveAttribute('accept', 'image/*');
    await page.setInputFiles('#cameraInput', { name: 'IMG_0412.jpg', mimeType: 'image/jpeg', buffer: await drawImage(page, SCAN, { type: 'image/jpeg' }) });
    await waitForDone(page);
    expect(await rate(page, SCAN.join('\n'))).toBeLessThanOrEqual(0.02);

    const png = (await drawImage(page, TYPED_1)).toString('base64');
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, png);
    await expect(page.locator('#textSummary')).toContainText('From pasted.png', { timeout: 90_000 });
    await waitForDone(page);
    expect(await rate(page, TYPED_1.join('\n'))).toBeLessThanOrEqual(0.02);
  });

  test('an image over 4000 px is scaled down and the row says so', async ({ page }) => {
    await openTool(page);
    const wide = await drawImage(page, SCAN, { width: 5000, height: 700, font: '120px serif' });
    await give(page, 'wide.png', 'image/png', wide);
    await waitForDone(page);
    expect((await rows(page))[0][1]).toBe('Pixels, scaled down to 4000 by 560 px');
  });

  test('a typed PDF is copied from the file and the engine is never loaded', async ({ page }) => {
    const engine = [];
    page.on('request', (r) => { if (/tesseract|[/]worker[.]min[.]js|traineddata/.test(r.url())) engine.push(r.url()); });
    await openTool(page);
    await give(page, 'typed.pdf', 'application/pdf', buildPdf([{ text: TYPED_1 }, { text: TYPED_2 }]));
    await waitForDone(page);

    // Copied, so exact: no error rate to allow for.
    await expect(page.locator('#textOutput')).toHaveValue(
      `--- Page 1 ---\n${TYPED_1.join('\n')}\n\n--- Page 2 ---\n${TYPED_2.join('\n')}`
    );
    expect(await rows(page)).toEqual([
      ['1', 'The file', '12', 'n/a', 'n/a'],
      ['2', 'The file', '13', 'n/a', 'n/a']
    ]);
    await expect(page.locator('#pageNotes')).toContainText('already held text, which was copied as it is');
    expect(engine).toEqual([]);

    await page.uncheck('#pageSeparators');
    await expect(page.locator('#textOutput')).toHaveValue(`${TYPED_1.join('\n')}\n\n${TYPED_2.join('\n')}`);
  });

  test('a mixed PDF reads only its scanned page from pixels, and the toggle rereads all of it', async ({ page }) => {
    await openTool(page);
    const pdf = buildPdf([{ text: TYPED_1 }, await scannedPage(page, SCAN), { text: TYPED_2 }]);
    await give(page, 'mixed.pdf', 'application/pdf', pdf);
    await waitForDone(page);

    let table = await rows(page);
    expect(table.map((row) => row[1])).toEqual(['The file', 'Pixels, 300 DPI', 'The file']);
    expect(table[0].slice(2)).toEqual(['12', 'n/a', 'n/a']);
    expect(Number(table[1][3])).toBeGreaterThanOrEqual(70);
    const text = await page.locator('#textOutput').inputValue();
    const parts = text.split(/--- Page \d ---\n/).slice(1).map((part) => part.trim());
    expect(parts[0]).toBe(TYPED_1.join('\n'));
    expect(parts[2]).toBe(TYPED_2.join('\n'));
    expect(await page.evaluate(([ref, hyp]) => window.OcrTool.characterErrorRate(ref, hyp), [SCAN.join('\n'), parts[1]])).toBeLessThanOrEqual(0.02);
    await expect(page.locator('#runStatus')).toContainText('Done: 3 pages');

    // Ticking the box reruns the same file with every page drawn and read.
    await page.check('#forceOcr');
    await waitForDone(page);
    await expect.poll(async () => (await rows(page)).map((row) => row[1]))
      .toEqual(['Pixels, 300 DPI', 'Pixels, 300 DPI', 'Pixels, 300 DPI']);
    expect(await rate(page, [
      '--- Page 1 ---', ...TYPED_1, '--- Page 2 ---', ...SCAN, '--- Page 3 ---', ...TYPED_2
    ].join('\n'))).toBeLessThanOrEqual(0.03);
  });

  test('a page under the text threshold is read from pixels even though it holds some text', async ({ page }) => {
    await openTool(page);
    // 19 visible characters of its own, one short of a text page.
    await give(page, 'stub.pdf', 'application/pdf', buildPdf([{ text: ['abcdefghij klmnopqrs'] }]));
    await waitForDone(page);
    expect((await rows(page))[0][1]).toMatch(/^Pixels, 300 DPI/);
    await give(page, 'stub.pdf', 'application/pdf', buildPdf([{ text: ['abcdefghij klmnopqrst'] }]));
    await waitForDone(page);
    await expect.poll(async () => (await rows(page))[0][1]).toBe('The file');
  });

  test('refusals name the limit and read nothing', async ({ page }) => {
    await openTool(page);
    const status = page.locator('#runStatus');

    await give(page, 'long.pdf', 'application/pdf', buildPdf(Array.from({ length: 26 }, (_, i) => ({ text: [`Typed page number ${i + 1} of twenty six.`] }))));
    await expect(status).toHaveText('That PDF has 26 pages. The limit is 25, and no part of it was read.');
    await expect(status).toHaveClass(/error/);
    await expect(page.locator('#pagesTable tbody tr')).toHaveCount(0);
    await expect(page.locator('#textOutput')).toHaveValue('');
    await expect(page.locator('#chooseFile')).toBeEnabled();
    await expect(page.locator('#runBox')).toBeHidden();

    await give(page, 'notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('PK'));
    await expect(status).toHaveText('That file is not a PDF, PNG, JPEG or WebP image.');

    await give(page, 'broken.pdf', 'application/pdf', Buffer.from('this is not a pdf at all'));
    await expect(status).toHaveText('That file could not be opened as a PDF.');

    await give(page, 'broken.png', 'image/png', Buffer.from('this is not an image'));
    await expect(status).toHaveText('That file could not be opened as an image.');

    await give(page, 'empty.pdf', 'application/pdf', Buffer.alloc(0));
    await expect(status).toHaveText('That file is empty.');

    // A refusal does not leave the page stuck: 25 pages are then read.
    await give(page, 'ok.pdf', 'application/pdf', buildPdf(Array.from({ length: 25 }, (_, i) => ({ text: [`Typed page number ${i + 1} of twenty five.`] }))));
    await waitForDone(page);
    await expect(status).not.toHaveClass(/error/);
    await expect(page.locator('#pagesTable tbody tr')).toHaveCount(25);
  });

  test('Stop keeps the pages already read, frees the controls, and the next run works', async ({ page }) => {
    await openTool(page);
    const scans = [];
    for (let i = 1; i <= 6; i++) scans.push(await scannedPage(page, [`Scanned sheet number ${i} of six.`, ...SCAN]));
    // Stop is clicked from inside the page the moment the second row lands, so
    // a fast machine cannot finish the run between two polls from out here.
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
    await give(page, 'six.pdf', 'application/pdf', buildPdf(scans));
    await expect(page.locator('#runBox')).toBeVisible();
    await expect(page.locator('#chooseFile')).toBeDisabled();

    await expect(page.locator('#runStatus')).toHaveText(/^Stopped after [2-5] of 6 pages\. The text below is partial\.$/, { timeout: 90_000 });
    await expect(page.locator('#runBox')).toBeHidden();
    await expect(page.locator('#chooseFile')).toBeEnabled();
    const kept = await page.locator('#pagesTable tbody tr').count();
    expect(kept).toBeGreaterThanOrEqual(2);
    expect(kept).toBeLessThan(6);
    // Pages are read side by side, so the ones kept need not be the first ones.
    const numbers = (await rows(page)).map((row) => Number(row[0]));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    const text = await page.locator('#textOutput').inputValue();
    expect([...text.matchAll(/--- Page (\d) ---\nScanned sheet number (\d) of six\./g)].map((m) => [Number(m[1]), Number(m[2])]))
      .toEqual(numbers.map((n) => [n, n]));
    await expect(page.locator('#copyText')).toBeEnabled();

    // Nothing from the stopped run arrives late.
    await page.waitForTimeout(1500);
    await expect(page.locator('#pagesTable tbody tr')).toHaveCount(kept);

    // The worker was terminated, so this needs a new one.
    await give(page, 'after.png', 'image/png', await drawImage(page, SCAN));
    await waitForDone(page);
    expect(await rate(page, SCAN.join('\n'))).toBeLessThanOrEqual(0.02);
  });

  test('Stop while the image is still being opened reads nothing, then or later', async ({ page }) => {
    await openTool(page);
    // Clicks Stop the moment the run announces itself, before the image is decoded.
    await page.evaluate(() => {
      const status = document.getElementById('runStatus');
      const observer = new MutationObserver(() => {
        if (status.textContent.startsWith('Opening')) {
          observer.disconnect();
          document.getElementById('stopRun').click();
        }
      });
      observer.observe(status, { childList: true });
    });
    await give(page, 'early.png', 'image/png', await drawImage(page, SCAN));
    await expect(page.locator('#runStatus')).toHaveText('Stopped before any page was read.');
    await expect(page.locator('#chooseFile')).toBeEnabled();
    // Long enough for an abandoned run to have loaded the engine and read the page.
    await page.waitForTimeout(4000);
    await expect(page.locator('#pagesTable tbody tr')).toHaveCount(0);
    await expect(page.locator('#textOutput')).toHaveValue('');
    await expect(page.locator('#runStatus')).toHaveText('Stopped before any page was read.');
  });

  test('progress only climbs and each status line is written once', async ({ page }) => {
    await openTool(page);
    // The second worker is held back four seconds, so it is still loading after
    // the first one has begun to read. Its loading messages must not take the status line back.
    let workers = 0;
    await page.route('**/worker.min.js', async (route) => {
      if (++workers > 1) await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.continue();
    });
    await page.evaluate(() => {
      window.__status = [];
      window.__progress = [];
      const status = document.getElementById('runStatus');
      new MutationObserver(() => {
        window.__status.push(status.textContent);
        window.__progress.push(document.getElementById('runProgress').value);
      }).observe(status, { childList: true, characterData: true, subtree: true });
    });
    await give(page, 'two.pdf', 'application/pdf', buildPdf([await scannedPage(page, SCAN), await scannedPage(page, TYPED_1)]));
    await waitForDone(page);

    const seen = await page.evaluate(() => ({ status: window.__status, progress: window.__progress }));
    for (let i = 1; i < seen.status.length; i++) expect(seen.status[i]).not.toBe(seen.status[i - 1]);
    const lanes = await page.evaluate(() => window.OcrTool.workerCount({
      cores: navigator.hardwareConcurrency, memoryGb: navigator.deviceMemory, pages: 2,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches
    }));
    const reading = (done) => `Reading 2 pages${lanes > 1 ? `, ${lanes} at a time` : ''}: ${done} done.`;
    expect(seen.status[0]).toBe('Opening two.pdf.');
    expect(seen.status[1]).toBe('Loading the reading engine. The first run fetches about 7 MB from this site.');
    // Once reading starts the loading line never comes back.
    expect(seen.status.slice(2)).toEqual([reading(0), reading(1), reading(2), expect.stringMatching(/^Done: 2 pages/)]);
    for (let i = 1; i < seen.progress.length; i++) expect(seen.progress[i]).toBeGreaterThanOrEqual(seen.progress[i - 1]);
    expect(await page.locator('#runProgress').evaluate((el) => el.value)).toBe(1);
  });

  test('a blank scan says no words were found instead of showing a confidence', async ({ page }) => {
    await openTool(page);
    await give(page, 'blank.png', 'image/png', await drawImage(page, []));
    await waitForDone(page);
    expect((await rows(page))[0].slice(2)).toEqual(['none found', 'n/a', '0']);
    await expect(page.locator('#textSummary')).toHaveText('No text was found in blank.png.');
    await expect(page.locator('#pageNotes')).toContainText('may be blank, a picture, handwriting, or too faint to read');
    await expect(page.locator('#copyText')).toBeDisabled();
  });

  test('look-alike characters are counted under To check and explained', async ({ page }) => {
    await openTool(page);
    await give(page, 'alike.png', 'image/png', await drawImage(page, ALIKE));
    await waitForDone(page);
    expect(Number((await rows(page))[0][4])).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#pageNotes')).toContainText('The other words were not verified, only not doubted.');
  });

  test('nothing is sent anywhere: every request is a bodiless GET to this site or the font host', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
    await openTool(page);
    const origin = new URL(page.url()).origin;
    await give(page, 'mixed.pdf', 'application/pdf', buildPdf([{ text: TYPED_1 }, await scannedPage(page, SCAN)]));
    await waitForDone(page);
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPdf')]);
    await pdf.cancel();
    await give(page, 'photo.png', 'image/png', await drawImage(page, SCAN));
    await waitForDone(page);
    const [imagePdf] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPdf')]);
    await imagePdf.cancel();

    // The run really did load the engine, so the list is not clean by accident.
    const fetched = requests.map((r) => r.url);
    for (const file of ['worker.min.js', 'tesseract-core-simd-lstm.wasm.js', 'eng.traineddata.gz', 'pdf.min.mjs', 'pdf.worker.min.mjs', 'pdf-lib.esm.min.js']) {
      expect(fetched.some((url) => url === `${origin}/js/vendor/ocr_text_extractor/${file}`), file).toBe(true);
    }
    for (const r of requests) {
      const target = new URL(r.url);
      const allowed = target.origin === origin || target.hostname === 'fonts.googleapis.com' ||
        target.hostname === 'fonts.gstatic.com' || target.protocol === 'data:' || target.protocol === 'blob:';
      expect(allowed, r.url).toBe(true);
      expect(r.method, r.url).toBe('GET');
      expect(r.body, r.url).toBeNull();
    }
    // And nothing was kept: no storage key of this tool's, no database.
    const kept = await page.evaluate(async () => ({
      local: Object.keys(localStorage).filter((key) => /ocr|tess/i.test(key)),
      session: Object.keys(sessionStorage),
      databases: indexedDB.databases ? (await indexedDB.databases()).map((db) => db.name) : []
    }));
    expect(kept).toEqual({ local: [], session: [], databases: [] });
  });

  test('the strict CSP is not violated by anything the tool does', async ({ page }) => {
    const consoleHits = [];
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) consoleHits.push(m.text());
    });

    await openTool(page);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).not.toMatch(/unsafe|blob:|https:\/\/cdn/);

    await give(page, 'mixed.pdf', 'application/pdf', buildPdf([{ text: TYPED_1 }, await scannedPage(page, SCAN)]));
    await waitForDone(page);
    await page.locator('[data-theme-toggle="light"]').click();
    await page.uncheck('#pageSeparators');
    await page.click('#viewLicenses');
    await page.click('#closeAttributions');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadText')]);
    await download.cancel();
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPdf')]);
    await pdf.cancel();
    await expect(page.locator('#copyStatus')).toContainText('Saved mixed-searchable.pdf');

    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(consoleHits).toEqual([]);
  });

  test('the scope disclaimer names what OCR gets wrong, above the inputs', async ({ page }) => {
    await openTool(page);
    const card = page.locator('details.disclaimer-card#scopeDisclaimer');
    await expect(card).toHaveCount(1);
    await expect(card).not.toHaveAttribute('open', '');
    await expect(card.locator('summary .disclaimer-title')).toContainText('Not a verified transcription');
    await expect(card.locator('summary')).toBeVisible();
    const cardBox = await card.boundingBox();
    const dropBox = await page.locator('#dropZone').boundingBox();
    expect(cardBox.y).toBeLessThan(dropBox.y);

    await card.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(card).toHaveAttribute('open', '');
    const body = card.locator('.disclaimer-body');
    for (const claim of [
      '"rn m" came back as "mm" with a confidence of 87',
      'A misread digit is still a number',
      'Table cells lose their rows and columns either way',
      'A word that is not flagged is not a word that is right',
      'Handwriting',
      'Languages other than English',
      'A prescription, a medicine label, a dose',
      'any amount of money',
      'is not sent to this site or to anyone else',
      'a search that finds nothing is not proof the document does not contain it',
      'It is not redaction and not a cleaned copy',
      'A digital signature stops validating',
      'Four repairs can be made before reading, and each is stated in the page',
      'not on photographs',
      'a table without them is usually read down each column',
      'A page tilted more than 30 degrees with "Second engine" set to "Never"',
      'The original document controls'
    ]) {
      await expect(body, claim).toContainText(claim);
    }
    // The second touchpoint sits with the text, for readers who never open the card.
    const beside = page.locator('p.disclaimer');
    await expect(beside).toHaveCount(1);
    await expect(beside).toContainText('A misread digit looks exactly like a correct one');
    await expect(beside).toContainText('Used at your own risk');
  });

  test('controls have names, the licenses dialog opens and closes, and targets are large enough', async ({ page }) => {
    await openTool(page);
    for (const id of ['chooseFile', 'takePhoto', 'copyText', 'downloadText', 'downloadPdf', 'viewLicenses', 'stopRun']) {
      expect((await page.locator(`#${id}`).textContent()).trim().length, id).toBeGreaterThan(0);
    }
    await expect(page.getByRole('checkbox', { name: 'Read every page from pixels' })).toHaveCount(1);
    await expect(page.getByRole('checkbox', { name: 'Mark where each page starts' })).toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Text' })).toHaveAttribute('readonly', '');
    await expect(page.locator('#runStatus')).toHaveAttribute('role', 'status');
    await expect(page.locator('#forceOcr')).toHaveAttribute('aria-describedby', 'forceOcrNote');

    for (const id of ['chooseFile', 'takePhoto', 'copyText', 'downloadText', 'downloadPdf', 'viewLicenses']) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box.height, id).toBeGreaterThanOrEqual(44);
    }

    const dialog = page.locator('#attributionsModal');
    await page.locator('#viewLicenses').focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    for (const name of ['Tesseract.js 7.0.0', 'tesseract.js-core 7.0.0', 'Tesseract English language data', 'pdf-lib 1.17.1', 'pdf.js 4.2.67', 'ONNX Runtime Web 1.30.0', 'esearch-ocr 8.5.2', 'PP-OCR models']) {
      await expect(dialog).toContainText(name);
    }
    await expect(dialog.locator('a[href*="LICENSE"]')).toHaveCount(8);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.click('#viewLicenses');
    await page.click('#closeAttributions');
    await expect(dialog).toBeHidden();
  });

  test('text meets AA contrast in both themes, with results on the page', async ({ page }) => {
    await openTool(page);
    await give(page, 'mixed.pdf', 'application/pdf', buildPdf([{ text: TYPED_1 }, await scannedPage(page, ALIKE)]));
    await waitForDone(page);
    await expectContrastAA(
      page,
      '.panel-header p, .helper-text, .drop-text, .check, .run-status, thead th, tbody td, ' +
        '.page-notes li, .about-list dt, .about-list dd, .tool-btn:not(:disabled), .text-output, #reviewNote'
    );
    await give(page, 'notes.docx', 'application/msword', Buffer.from('x'));
    await expect(page.locator('#runStatus')).toHaveClass(/error/);
    await expectContrastAA(page, '.run-status.error');
  });

  test('no horizontal overflow from desktop down to a phone', async ({ page }) => {
    await openTool(page);
    await give(page, 'mixed.pdf', 'application/pdf', buildPdf([{ text: TYPED_1 }, await scannedPage(page, SCAN)]));
    await waitForDone(page);
    for (const width of [1280, 1100, 900, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `at ${width}px`).toBeLessThanOrEqual(0);
    }
    // Stacked, the text box comes before the page table.
    const text = await page.locator('#textOutput').boundingBox();
    const table = await page.locator('#pagesTable').boundingBox();
    expect(text.y).toBeLessThan(table.y);
  });
});
