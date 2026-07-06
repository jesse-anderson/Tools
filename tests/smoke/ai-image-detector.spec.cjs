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
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/ai-image-detector.html';
let smokeServer;

// Own the static server like every other page-navigating spec. Without this the
// spec relied on a server already listening on 4173, which held locally but not
// in CI, where this file runs first alphabetically with nothing started yet
// (net::ERR_CONNECTION_REFUSED).
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
