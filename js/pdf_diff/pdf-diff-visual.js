// ============================================
// PDF Diff Checker - Visual (Pixel) Diff
// ============================================

/**
 * Renders the current page pair to offscreen canvases at a shared scale and
 * paints a per-pixel difference image: unchanged pixels are dimmed grayscale,
 * differing pixels are magenta. This catches changes the text diff cannot
 * see (images, drawings, scanned pages).
 */

import { state } from './pdf-diff-state.js';

/**
 * Pure pixel comparison. Compares two same-size RGBA buffers.
 * @param {Uint8ClampedArray} dataA - RGBA pixels of render A
 * @param {Uint8ClampedArray} dataB - RGBA pixels of render B
 * @param {number} threshold - Max summed |R|+|G|+|B| delta considered equal
 * @returns {Object} { out: Uint8ClampedArray, changedPixels, totalPixels }
 */
function computePixelDiff(dataA, dataB, threshold = 30) {
    const length = Math.min(dataA.length, dataB.length);
    const out = new Uint8ClampedArray(length);
    let changedPixels = 0;

    for (let i = 0; i < length; i += 4) {
        const dr = Math.abs(dataA[i] - dataB[i]);
        const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
        const db = Math.abs(dataA[i + 2] - dataB[i + 2]);

        if (dr + dg + db > threshold) {
            // Differing pixel: magenta
            out[i] = 236;
            out[i + 1] = 64;
            out[i + 2] = 189;
            out[i + 3] = 255;
            changedPixels++;
        } else {
            // Unchanged: dimmed grayscale of A
            const gray = 255 - Math.round((255 - (dataA[i] * 0.299 + dataA[i + 1] * 0.587 + dataA[i + 2] * 0.114)) * 0.35);
            out[i] = gray;
            out[i + 1] = gray;
            out[i + 2] = gray;
            out[i + 3] = 255;
        }
    }

    return { out, changedPixels, totalPixels: length / 4 };
}

/**
 * Render one PDF page to an offscreen canvas at a fixed scale.
 * @returns {Promise<ImageData>} RGBA pixels
 */
async function renderPageToImageData(pdfDoc, pageNumber, scale) {
    const page = await pdfDoc.getPage(pageNumber + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    // White base so transparent regions compare consistently
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return {
        imageData: context.getImageData(0, 0, canvas.width, canvas.height),
        width: canvas.width,
        height: canvas.height
    };
}

/**
 * Render the visual diff for the currently displayed page pair into the
 * given canvas. Pages may differ in size; comparison covers the shared
 * top-left region and a note reports any size mismatch.
 *
 * @param {HTMLCanvasElement} targetCanvas - Destination canvas
 * @returns {Promise<Object>} { changedPixels, totalPixels, changedPercent, sizeMismatch }
 */
async function renderVisualDiff(targetCanvas) {
    if (!state.pdfA || !state.pdfB) {
        throw new Error('Load and compare both PDFs first.');
    }

    const scale = 1.5; // Fixed scale keeps A/B renders comparable
    const a = await renderPageToImageData(state.pdfA, state.currentPageA, scale);
    const b = await renderPageToImageData(state.pdfB, state.currentPageB, scale);

    const width = Math.min(a.width, b.width);
    const height = Math.min(a.height, b.height);
    const sizeMismatch = a.width !== b.width || a.height !== b.height;

    // Crop both to the shared region by re-reading row slices
    const cropped = (source) => {
        const rows = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            const sourceStart = (y * source.width) * 4;
            rows.set(source.imageData.data.subarray(sourceStart, sourceStart + width * 4), y * width * 4);
        }
        return rows;
    };

    const result = computePixelDiff(cropped(a), cropped(b));

    targetCanvas.width = width;
    targetCanvas.height = height;
    const context = targetCanvas.getContext('2d');
    context.putImageData(new ImageData(result.out, width, height), 0, 0);

    return {
        changedPixels: result.changedPixels,
        totalPixels: result.totalPixels,
        changedPercent: result.totalPixels ? (100 * result.changedPixels / result.totalPixels) : 0,
        sizeMismatch
    };
}

export {
    computePixelDiff,
    renderVisualDiff
};
