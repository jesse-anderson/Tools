// AI Image Detector engine spec.
//
// Drives the pure math surface exposed on window.AiImageDetector:
// JS Cooley-Tukey FFT correctness against analytic references,
// JS vs Rust/WASM FFT parity, the Laplacian border regression
// (unfiltered borders used to stamp a fake cross on the spectrum
// and inflate every grid score), grid-score behavior on synthetic
// azimuthal profiles, and an end-to-end run through the UI.
//
// The page ships a strict CSP, so waits use expect.poll rather than
// page.waitForFunction (in-page re-polls are eval-blocked), and the
// deterministic PRNG is defined inline in each evaluate callback
// (a nested eval() would also be CSP-blocked). Mulberry32 is used
// because plain LCGs have lattice structure that this tool
// legitimately detects as periodic.

const { test, expect } = require('@playwright/test');
const { expectContrastAA } = require('./helpers.cjs');

const TOOL_PATH = '/tools/ai-image-detector.html';

async function openTool(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto(TOOL_PATH, { waitUntil: 'domcontentloaded' });
  await expect.poll(
    () => page.evaluate(() => typeof window.AiImageDetector === 'object' && window.AiImageDetector !== null),
    { timeout: 15000 }
  ).toBe(true);
  return errors;
}

test.describe('AI Image Detector', () => {
  test('loads clean and exposes the engine handle', async ({ page }) => {
    const errors = await openTool(page);
    const keys = await page.evaluate(() => Object.keys(window.AiImageDetector).sort());
    expect(keys).toEqual(expect.arrayContaining([
      'computeAzimuthal', 'computeGridScore', 'computeRadial', 'fft1D', 'fft2D',
      'jsFftMagnitudesCentered', 'prepareSignal', 'scoreBandLabel', 'smoothCircular'
    ]));
    expect(errors).toEqual([]);
  });

  test('1D FFT: impulse has a flat unit power spectrum', async ({ page }) => {
    await openTool(page);
    const result = await page.evaluate(() => {
      const n = 64;
      const re = new Float32Array(n);
      const im = new Float32Array(n);
      re[0] = 1;
      window.AiImageDetector.fft1D(re, im, n);
      let maxErr = 0;
      for (let i = 0; i < n; i++) {
        maxErr = Math.max(maxErr, Math.abs(re[i] * re[i] + im[i] * im[i] - 1));
      }
      return maxErr;
    });
    expect(result).toBeLessThan(1e-5);
  });

  test('1D FFT: cosine concentrates power at plus and minus its frequency', async ({ page }) => {
    await openTool(page);
    const result = await page.evaluate(() => {
      const n = 64;
      const k = 5;
      const re = new Float32Array(n);
      const im = new Float32Array(n);
      for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * k * i) / n);
      window.AiImageDetector.fft1D(re, im, n);
      const power = [];
      for (let i = 0; i < n; i++) power.push(re[i] * re[i] + im[i] * im[i]);
      const expected = (n / 2) * (n / 2);
      let offPeak = 0;
      for (let i = 0; i < n; i++) {
        if (i !== k && i !== n - k) offPeak = Math.max(offPeak, power[i]);
      }
      return {
        atK: power[k] / expected,
        atNegK: power[n - k] / expected,
        offPeakRel: offPeak / expected
      };
    });
    expect(result.atK).toBeCloseTo(1, 4);
    expect(result.atNegK).toBeCloseTo(1, 4);
    expect(result.offPeakRel).toBeLessThan(1e-6);
  });

  test('2D centered FFT puts the DC of a constant image in the center bin', async ({ page }) => {
    await openTool(page);
    const result = await page.evaluate(() => {
      const n = 32;
      const input = new Float32Array(n * n).fill(2);
      const mag = window.AiImageDetector.jsFftMagnitudesCentered(input, n, n);
      const centerIdx = (n / 2) * n + (n / 2);
      const expectedDc = Math.pow(2 * n * n, 2);
      let offPeak = 0;
      for (let i = 0; i < mag.length; i++) {
        if (i !== centerIdx) offPeak = Math.max(offPeak, mag[i]);
      }
      return { dcRel: mag[centerIdx] / expectedDc, offPeakRel: offPeak / expectedDc };
    });
    expect(result.dcRel).toBeCloseTo(1, 4);
    expect(result.offPeakRel).toBeLessThan(1e-6);
  });

  test('WASM and JS FFT engines agree on random input', async ({ page }) => {
    await openTool(page);
    const result = await page.evaluate(async () => {
      const mulberry32 = (a) => () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const D = window.AiImageDetector;
      await D.wasmReady;
      if (!D.isWasmReady()) return { wasm: false };
      const rnd = mulberry32(42);
      const n = 32;
      const input = new Float32Array(n * n);
      for (let i = 0; i < input.length; i++) input[i] = rnd() * 255 - 127;

      const js = D.jsFftMagnitudesCentered(input, n, n);
      const wasm = D.getWasmApi().compute_fft_2d_centered(new Float32Array(input), n, n);

      let maxAbs = 0;
      for (let i = 0; i < js.length; i++) maxAbs = Math.max(maxAbs, js[i]);
      let maxRelDiff = 0;
      for (let i = 0; i < js.length; i++) {
        maxRelDiff = Math.max(maxRelDiff, Math.abs(js[i] - wasm[i]) / maxAbs);
      }
      return { wasm: true, maxRelDiff };
    });
    expect(result.wasm).toBe(true);
    expect(result.maxRelDiff).toBeLessThan(1e-5);
  });

  test('Laplacian border regression: filtered signal has an all-zero border', async ({ page }) => {
    await openTool(page);
    const result = await page.evaluate(() => {
      const mulberry32 = (a) => () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const D = window.AiImageDetector;
      const n = 64;
      const rnd = mulberry32(3);
      const px = new Uint8ClampedArray(n * n * 4);
      for (let i = 0; i < px.length; i += 4) {
        const v = Math.floor(rnd() * 256);
        px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255;
      }
      const sig = D.prepareSignal(px, n, n, { channel: 'blue', signal: 'laplacian' });

      let borderMax = 0;
      for (let x = 0; x < n; x++) {
        borderMax = Math.max(borderMax, Math.abs(sig[x]), Math.abs(sig[(n - 1) * n + x]));
      }
      for (let y = 0; y < n; y++) {
        borderMax = Math.max(borderMax, Math.abs(sig[y * n]), Math.abs(sig[y * n + n - 1]));
      }

      // A featureless image must produce an all-zero signal (and
      // therefore no usable grid score), not a bright frame.
      const flat = new Uint8ClampedArray(n * n * 4);
      for (let i = 0; i < flat.length; i += 4) {
        flat[i] = 128; flat[i + 1] = 128; flat[i + 2] = 128; flat[i + 3] = 255;
      }
      const flatSig = D.prepareSignal(flat, n, n, { channel: 'blue', signal: 'laplacian' });
      let flatMax = 0;
      for (let i = 0; i < flatSig.length; i++) flatMax = Math.max(flatMax, Math.abs(flatSig[i]));

      return { borderMax, flatMax };
    });
    expect(result.borderMax).toBe(0);
    expect(result.flatMax).toBe(0);
  });

  test('grid score: flat, spiked, and empty azimuthal profiles', async ({ page }) => {
    await openTool(page);
    const result = await page.evaluate(() => {
      const D = window.AiImageDetector;
      const flat = new Array(360).fill(5);
      const spiked = new Array(360).fill(5);
      spiked[90] = 50;
      const zeros = new Array(360).fill(0);
      return {
        flat: D.computeGridScore(flat),
        spiked: D.computeGridScore(spiked),
        zeros: D.computeGridScore(zeros),
        bands: [
          D.scoreBandLabel(0),
          D.scoreBandLabel(1.3),
          D.scoreBandLabel(3),
          D.scoreBandLabel(20)
        ]
      };
    });
    expect(result.flat).toBeCloseTo(1, 6);
    expect(result.spiked).toBeCloseTo(10, 6);
    expect(result.zeros).toBe(0);
    expect(result.bands).toEqual([
      'No usable signal',
      'No periodic grid detected',
      'Weak periodic artifacts',
      'Strong periodic artifacts'
    ]);
  });

  test('pipeline: clean noise scores low, periodic stripes score high', async ({ page }) => {
    await openTool(page);
    const result = await page.evaluate(() => {
      const mulberry32 = (a) => () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const D = window.AiImageDetector;
      const n = 256;
      const scoreOf = (fill) => {
        const px = new Uint8ClampedArray(n * n * 4);
        for (let i = 0; i < px.length; i += 4) {
          const v = fill(i / 4);
          px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255;
        }
        const sig = D.prepareSignal(px, n, n, { channel: 'blue', signal: 'laplacian' });
        const mag = D.jsFftMagnitudesCentered(sig, n, n);
        return D.computeGridScore(D.computeAzimuthal(mag, n, n));
      };

      const r1 = mulberry32(1);
      const noise = scoreOf(() => Math.floor(r1() * 256));

      const r2 = mulberry32(7);
      const stripes = scoreOf((p) => {
        const x = p % n;
        return Math.min(255, Math.floor(r2() * 180) + (x % 3 === 0 ? 60 : 0));
      });

      return { noise, stripes };
    });
    // Pinned with mulberry32 seeds 1 and 7: noise 1.246, stripes 84.98.
    expect(result.noise).toBeGreaterThan(1);
    expect(result.noise).toBeLessThan(1.8);
    expect(result.stripes).toBeGreaterThan(20);
  });

  test('smoothCircular preserves constants and spreads spikes with wraparound', async ({ page }) => {
    await openTool(page);
    const result = await page.evaluate(() => {
      const D = window.AiImageDetector;
      const constant = D.smoothCircular(new Array(360).fill(4), 2);
      const spike = new Array(360).fill(0);
      spike[0] = 10;
      const smoothed = D.smoothCircular(spike, 2);
      return {
        constantOk: constant.every((v) => Math.abs(v - 4) < 1e-9),
        spread: [smoothed[358], smoothed[359], smoothed[0], smoothed[1], smoothed[2], smoothed[3]]
      };
    });
    expect(result.constantOk).toBe(true);
    expect(result.spread).toEqual([2, 2, 2, 2, 2, 0]);
  });

  test('end to end: analyzing an image updates score, band, and image info', async ({ page }) => {
    await openTool(page);
    await page.evaluate(() => {
      const mulberry32 = (a) => () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const n = 256;
      const c = document.createElement('canvas');
      c.width = n; c.height = n;
      const ctx = c.getContext('2d');
      const im = ctx.createImageData(n, n);
      const rnd = mulberry32(11);
      for (let i = 0; i < im.data.length; i += 4) {
        const x = (i / 4) % n;
        const v = Math.min(255, Math.floor(rnd() * 180) + (x % 3 === 0 ? 60 : 0));
        im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v; im.data[i + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
      window.loadTemplate(c.toDataURL('image/png'));
    });

    await expect.poll(
      () => page.locator('#scoreValue').textContent(),
      { timeout: 30000 }
    ).toMatch(/^\d+\.\d\dx$/);

    const band = await page.locator('#scoreBand').textContent();
    expect(band).toBe('Strong periodic artifacts');

    const info = await page.locator('#imgInfo').textContent();
    expect(info).toContain('generated image (256x256)');

    const fftTime = await page.locator('#fftTime').textContent();
    expect(fftTime).toMatch(/ms \((WASM|JS)\)/);
  });

  test('licenses modal opens and closes', async ({ page }) => {
    await openTool(page);
    const modal = page.locator('#attributionsModal');
    await expect(modal).not.toBeVisible();
    await page.click('#viewLicenses');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('RustFFT');
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });
});

// --- scope disclaimer --------------------------------------------------------
// This tool outputs a number a reader can mistake for an accusation about a real
// person's work, so its disclaimer carries a heavier burden than a calculator's.
// The measured fact it has to lead with: on the bundled templates a real
// photograph and the modern diffusion outputs all sit under 2x while a flatbed
// scan scores about 23x, so the highest score in the set belongs to the one
// image that is definitely not AI.

test('the scope disclaimer is above the tool, readable while collapsed, and keyboard operable', async ({ page }) => {
  await page.goto('/tools/ai-image-detector.html', { waitUntil: 'domcontentloaded' });

  const card = page.locator('#scopeDisclaimer');
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => el.tagName)).toBe('DETAILS');
  expect(await card.evaluate((el) => el.open)).toBe(false);

  // The headline has to land without opening anything.
  const summary = card.locator('summary');
  await expect(summary).toContainText('not an AI detector');
  await expect(summary).toContainText('not evidence about a person');

  // Above the tool itself and in the first viewport.
  const cardBox = await card.boundingBox();
  const layoutBox = await page.locator('.calculator-layout').boundingBox();
  expect(cardBox.y).toBeLessThan(layoutBox.y);
  expect(cardBox.y).toBeLessThan(900);

  // 44px touch target on the only control that opens it.
  expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);

  // Native details: keyboard operable with no JavaScript of its own.
  await summary.focus();
  await page.keyboard.press('Enter');
  expect(await card.evaluate((el) => el.open)).toBe(true);
});

test('the disclaimer names the measured limits rather than gesturing at uncertainty', async ({ page }) => {
  await page.goto('/tools/ai-image-detector.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
  const body = page.locator('#scopeDisclaimer .disclaimer-body');

  // The central admission, in numbers rather than adjectives.
  await expect(body).toContainText('1.1x to 1.4x');
  await expect(body).toContainText('23x');
  await expect(body).toContainText('Midjourney v6');

  // The false positives, which are all more common than AI generation.
  for (const cause of ['Flatbed and drum scans', 'screenshot', 'JPEG block', 'moir', 'demosaic', 'brick']) {
    await expect(body).toContainText(cause);
  }

  // What it does not look at, including the mechanism that would actually answer
  // the question the user came here with.
  await expect(body).toContainText('C2PA');
  await expect(body).toContainText('blue channel');

  // Its own history of being confidently wrong.
  await expect(body).toContainText('19,800x');
});

test('the disclaimer forbids the uses that would harm a person', async ({ page }) => {
  await page.goto('/tools/ai-image-detector.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
  const body = page.locator('#scopeDisclaimer .disclaimer-body');

  for (const forbidden of [
    'Academic integrity',
    'Employment, contracting, admissions, grading',
    'Journalism, fact-checking',
    'Legal, forensic, or insurance',
    'Accusing any person of anything',
  ]) {
    await expect(body).toContainText(forbidden);
  }

  await expect(body).toContainText('not a statement about the person who made it');
});

test('the disclaimer carries all five legal elements', async ({ page }) => {
  await page.goto('/tools/ai-image-detector.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
  const footer = page.locator('#scopeDisclaimer .disclaimer-footer');

  await expect(footer).toContainText('No warranty');                    // warranty
  await expect(footer).toContainText('accepts no liability');           // liability
  await expect(footer).toContainText('You assume all risk');            // assumption of risk
  await expect(footer).toContainText('this page is wrong');             // precedence
  await expect(footer).toContainText('Independent verification required');
  await expect(footer).toContainText('reputational harm');
});

test('the score carries a second touchpoint for readers who never open the card', async ({ page }) => {
  await page.goto('/tools/ai-image-detector.html', { waitUntil: 'domcontentloaded' });

  // Visible with the card still collapsed, and beside the number itself.
  expect(await page.locator('#scopeDisclaimer').evaluate((el) => el.open)).toBe(false);
  const touchpoint = page.locator('p.disclaimer');
  await expect(touchpoint).toBeVisible();
  await expect(touchpoint).toContainText('Periodic structure, not AI');
  await expect(touchpoint).toContainText('Never use it to make a claim about a person');

  const scoreBox = await page.locator('#scoreBox').boundingBox();
  const touchBox = await touchpoint.boundingBox();
  expect(Math.abs(touchBox.y - scoreBox.y)).toBeLessThan(300);
});

test('the model-effectiveness note no longer implies the tool can determine AI origin', async ({ page }) => {
  await page.goto('/tools/ai-image-detector.html', { waitUntil: 'domcontentloaded' });
  const html = await page.content();

  // "with certainty" implied it could answer the question less certainly. It
  // cannot answer it at all for modern diffusion, and hedging in that direction
  // is what makes a reader treat the score as weak evidence rather than none.
  expect(html).not.toContain('AI-generated with certainty');
  await expect(page.locator('.info-modal, body')).toContainText(
    'Determining whether an image is AI-generated, at all'
  );
});

test('the disclaimer text clears WCAG AA in both themes', async ({ page }) => {
  await page.goto('/tools/ai-image-detector.html', { waitUntil: 'domcontentloaded' });
  await expectContrastAA(
    page,
    '#scopeDisclaimer .disclaimer-title, #scopeDisclaimer .disclaimer-lead, ' +
      '#scopeDisclaimer .disclaimer-note, #scopeDisclaimer .disclaimer-section h3, ' +
      '#scopeDisclaimer .disclaimer-footer, p.disclaimer'
  );
});
