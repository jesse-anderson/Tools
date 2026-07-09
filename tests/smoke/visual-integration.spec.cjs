// Visual integration tool: example-data AUC, scientific-pair import + CSV
// export, visual point calibration, image upload without createImageBitmap,
// and PDF page-control clamping.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly, readDownloadText } = require('./helpers.cjs');

async function getVisualIntegrationResultValue(page, seriesName) {
  return page.evaluate((wantedSeriesName) => {
    const results = Array.from(document.querySelectorAll('#resultsContainer .result-item'));
    const match = results.find((result) => {
      const label = result.querySelector('.result-name span')?.textContent?.trim();
      return label === wantedSeriesName;
    });

    return match?.querySelector('.result-value')?.textContent?.trim() || null;
  }, seriesName);
}

async function clickVisualIntegrationCanvasAt(page, nX, nY) {
  const canvas = page.locator('#integrationCanvas');
  const box = await canvas.boundingBox();
  expect(box, 'Expected the visual integration canvas to be visible.').not.toBeNull();

  await canvas.click({
    position: {
      x: Math.max(1, Math.min(box.width - 1, box.width * nX)),
      y: Math.max(1, Math.min(box.height - 1, box.height * nY))
    }
  });
}

async function getVisualIntegrationDrawnPixelCount(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('integrationCanvas');
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const stride = 64;
    let drawn = 0;

    for (let index = 3; index < pixels.length; index += stride * 4) {
      if (pixels[index] > 0) {
        drawn++;
      }
    }

    return drawn;
  });
}

const tinyPngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);
const fakePdfBuffer = Buffer.from('%PDF-1.4\n% visual integration smoke\n', 'utf8');

test('visual integration loads example data and calculates expected AUC', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/visual-integration.html');

  await page.click('#loadExampleBtn');

  await expect(page.locator('#xMinVal')).toHaveValue('0');
  await expect(page.locator('#xMaxVal')).toHaveValue('10');
  await expect(page.locator('#yMinVal')).toHaveValue('-2');
  await expect(page.locator('#yMaxVal')).toHaveValue('12');
  await expect(page.locator('#baselineVal')).toHaveValue('0');

  await expect.poll(
    () => getVisualIntegrationResultValue(page, 'y = x^2 / 10'),
    { message: 'Expected the example data to calculate the trapezoidal AUC.' }
  ).toBe('33.375');

  await expect.poll(
    () => getVisualIntegrationDrawnPixelCount(page),
    { message: 'Expected the visual integration canvas to render grid/series pixels.' }
  ).toBeGreaterThan(0);
});

test('visual integration imports scientific numeric pairs and exports CSV results', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/visual-integration.html');

  await page.fill('#xMaxVal', '3');
  await page.fill('#yMinVal', '0');
  await page.fill('#yMaxVal', '10');
  await page.fill('#csvDataInput', '0,0\n1E0,1\n2,4\n3,9');
  await page.click('#importDataBtn');

  await expect.poll(
    () => getVisualIntegrationResultValue(page, 'Series 1'),
    { message: 'Expected imported points to calculate a trapezoidal AUC.' }
  ).toBe('9.5');

  const downloadPromise = page.waitForEvent('download');
  await page.click('#exportResultsBtn');
  const download = await downloadPromise;
  const csv = await readDownloadText(download);

  expect(download.suggestedFilename()).toBe('visual_integration_results.csv');
  expect(csv).toContain('summary,Series 1');
  expect(csv).toContain('point,Series 1');
  expect(csv).toContain(',1,1,');
  expect(csv).toContain(',3,9,');
});

test('visual integration adds visual points using the active calibration', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/visual-integration.html');

  await page.fill('#xMaxVal', '1');
  await page.fill('#yMinVal', '0');
  await page.fill('#yMaxVal', '1');

  await clickVisualIntegrationCanvasAt(page, 0.25, 0.75);
  await clickVisualIntegrationCanvasAt(page, 0.75, 0.25);

  await expect.poll(
    () => getVisualIntegrationResultValue(page, 'Series 1'),
    { message: 'Expected visual point placement to map through calibration and calculate AUC.' }
  ).toBe('0.25');
});

test('visual integration image upload works without createImageBitmap', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    try {
      delete window.createImageBitmap;
    } catch (error) {}

    try {
      Object.defineProperty(window, 'createImageBitmap', {
        value: undefined,
        configurable: true
      });
    } catch (error) {
      window.createImageBitmap = undefined;
    }
  });

  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/visual-integration.html');

  await page.setInputFiles('#bgUpload', {
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: tinyPngBuffer
  });

  await expect(page.locator('#clearBgBtn')).toBeVisible();
  await expect(page.locator('#btnSelectRoi')).toBeVisible();
  await expect(page.locator('#canvasOverlayText')).toHaveText('Image loaded. Calibrate axes before tracing visual points.');
  expect(dialogs).toEqual([]);
});

test('visual integration clamps PDF page controls while rendering uploads', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    window.pdfjsLib = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
          getPage: async (pageNum) => ({
            getViewport: ({ scale }) => ({
              width: 20 * scale,
              height: 12 * scale
            }),
            render: ({ canvasContext, viewport }) => {
              canvasContext.fillStyle = pageNum === 1 ? '#2563eb' : '#dc2626';
              canvasContext.fillRect(0, 0, viewport.width, viewport.height);
              return { promise: Promise.resolve() };
            }
          })
        })
      })
    };
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/visual-integration.html');

  await page.setInputFiles('#bgUpload', {
    name: 'mock.pdf',
    mimeType: 'application/pdf',
    buffer: fakePdfBuffer
  });

  await expect(page.locator('#pdfControls')).toBeVisible();
  await expect(page.locator('#pdfPage')).toHaveValue('1');
  await expect(page.locator('#pdfPageMeta')).toHaveText('1 / 2');
  await expect(page.locator('#btnPdfPrev')).toBeDisabled();
  await expect(page.locator('#btnPdfNext')).toBeEnabled();

  await page.fill('#pdfPage', '99');
  await page.dispatchEvent('#pdfPage', 'change');
  await expect(page.locator('#pdfPage')).toHaveValue('2');
  await expect(page.locator('#pdfPageMeta')).toHaveText('2 / 2');

  await page.fill('#pdfPage', '');
  await page.click('#btnPdfPrev');
  await expect(page.locator('#pdfPage')).toHaveValue('1');
  await expect(page.locator('#pdfPageMeta')).toHaveText('1 / 2');
});
