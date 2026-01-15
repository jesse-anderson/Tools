// Face Blur Tool - Skin Detection
// YCbCr color space skin detection with adaptive sampling

import { runInWorker } from './blur-utils.js';

// ============================================================================
// YCBCR COLOR SPACE - SKIN DETECTION
// ============================================================================

/**
 * Convert RGB to YCbCr color space
 * Y: Luminance, Cb: Blue chrominance, Cr: Red chrominance
 *
 * Reference: ITU-R BT.601 (also known as CCIR 601)
 * Standard for digital video color space conversion
 */
function rgbToYCbCr(r, g, b) {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    return { y, cb, cr };
}

/**
 * Detect skin pixel using YCbCr color space.
 * This approach is more reliable across different skin tones than RGB-based methods.
 *
 * References:
 * - Chai & Ngan (1999): "Face segmentation using skin-color map in videophone applications"
 *   IEEE Transactions on Circuits and Systems for Video Technology, Vol. 9, No. 4, pp. 551-564
 *   https://www.researchgate.net/publication/3308029_Face_segmentation_using_skin-color_map_in_videophone_applications
 * - Kakumanu et al. (2007): "A survey of skin-color modeling and detection methods"
 *   Pattern Recognition, Volume 40, Issue 3, Pages 1106-1122
 *   DOI: 10.1016/j.patcog.2006.06.010
 *   https://www.sciencedirect.com/science/article/abs/pii/S0031320306002767
 * - Zarit et al. (1999): "Comparison of five color models in skin pixel classification"
 *   ICCV '99 Proceedings
 *   https://www.researchgate.net/publication/3823455_Comparison_of_five_color_models_in_skin_pixel_classification
 *
 * Ranges based on research covering Fitzpatrick scale types I-VI:
 * - Very light to very dark skin tones
 * - Various lighting conditions
 */
function isSkinPixelYCbCr(r, g, b, adaptiveRange = null) {
    const { y, cb, cr } = rgbToYCbCr(r, g, b);

    // Adaptive range from image sampling (more accurate)
    if (adaptiveRange) {
        const { minCb, maxCb, minCr, maxCr, minY, maxY } = adaptiveRange;
        // Use slightly expanded range from sampled values
        const cbTolerance = 25;
        const crTolerance = 20;
        return (
            cb >= minCb - cbTolerance && cb <= maxCb + cbTolerance &&
            cr >= minCr - crTolerance && cr <= maxCr + crTolerance &&
            y >= Math.max(0, minY - 40) && y <= Math.min(255, maxY + 40)
        );
    }

    // Fallback: Universal YCbCr skin detection ranges
    // These ranges encompass all Fitzpatrick skin types (I-VI)
    // References:
    // - Chai & Ngan (2004): Face detection using YCbCr
    // - Kakumanu et al. (2007): Survey of skin color modeling
    // - Zarit et al. (1999): Comparative study of skin color models

    // Core skin chrominance range (covers most skin tones)
    const cbInRange = cb >= 77 && cb <= 127;
    const crInRange = cr >= 133 && cr <= 173;

    // Extended range for very light skin (Fitzpatrick I-II)
    const cbLight = cb >= 80 && cb <= 125;
    const crLight = cr >= 130 && cr <= 168;

    // Extended range for very dark skin (Fitzpatrick V-VI)
    const cbDark = cb >= 70 && cb <= 130;
    const crDark = cr >= 130 && cr <= 180;

    // Luminance check - skin isn't extremely dark or bright
    const yValid = y >= 40 && y <= 230;

    // Additional hue-based check using RGB ratios
    // Skin typically has R as the dominant channel, but G and B can be close
    // especially for darker skin tones (Fitzpatrick V-VI)
    // Relaxed check: R must be dominant, but G and B relationship is flexible
    const rgbValid = r > g && (r - g) >= 3;

    return yValid && ((cbInRange && crInRange) || (cbLight && crLight) || (cbDark && crDark)) && rgbValid;
}

/**
 * Sample skin tones from center of face region to adapt to image lighting
 * This improves detection accuracy across different lighting conditions
 */
function sampleSkinTones(imageData, width, height) {
    const data = imageData.data;
    const samples = [];

    // Sample from center 40% of the face region (likely contains skin)
    const marginX = Math.floor(width * 0.3);
    const marginY = Math.floor(height * 0.3);
    const sampleWidth = width - 2 * marginX;
    const sampleHeight = height - 2 * marginY;

    // Collect sample pixels
    for (let y = marginY; y < height - marginY && samples.length < 500; y += 2) {
        for (let x = marginX; x < width - marginX && samples.length < 500; x += 2) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // Use universal detection to find candidate skin pixels
            if (isSkinPixelYCbCr(r, g, b, null)) {
                const { y, cb, cr } = rgbToYCbCr(r, g, b);
                samples.push({ y, cb, cr });
            }
        }
    }

    // If we found enough skin samples, calculate adaptive range
    if (samples.length >= 50) {
        // Use percentiles to handle outliers
        const cbValues = samples.map(s => s.cb).sort((a, b) => a - b);
        const crValues = samples.map(s => s.cr).sort((a, b) => a - b);
        const yValues = samples.map(s => s.y).sort((a, b) => a - b);

        const p10 = Math.floor(samples.length * 0.1);
        const p90 = Math.floor(samples.length * 0.9);

        return {
            minCb: cbValues[p10],
            maxCb: cbValues[p90],
            minCr: crValues[p10],
            maxCr: crValues[p90],
            minY: yValues[p10],
            maxY: yValues[p90]
        };
    }

    return null; // Not enough samples detected
}

// Skin mask blur (main function)
export async function applySkinMaskBlur(ctx, x, y, width, height, intensity) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.round(width);
    const ih = Math.round(height);

    const imageData = ctx.getImageData(ix, iy, iw, ih);
    const blurRadius = Math.round(3 + (intensity * 12));

    try {
        const processedData = await runInWorker('skinmask', imageData, iw, ih, blurRadius);
        const resultImageData = new ImageData(processedData, iw, ih);
        ctx.putImageData(resultImageData, ix, iy);
    } catch (workerError) {
        console.warn('Worker processing failed, using fallback:', workerError);
        try {
            applySkinMaskBlurFallback(ctx, ix, iy, iw, ih, intensity);
        } catch (fallbackError) {
            console.error('Both worker and fallback failed for skin mask blur:', fallbackError);
            throw new Error(`Skin mask blur processing failed: ${fallbackError.message}`);
        }
    }
}

// Fallback synchronous skin mask blur with improved algorithm
function applySkinMaskBlurFallback(ctx, x, y, width, height, intensity) {
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    // Sample skin tones from this specific image for adaptive detection
    const adaptiveRange = sampleSkinTones(imageData, width, height);

    const skinMask = new Uint8Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const pixelIndex = i / 4;

        // Use improved YCbCr-based detection
        skinMask[pixelIndex] = isSkinPixelYCbCr(r, g, b, adaptiveRange) ? 1 : 0;
    }

    const result = new Uint8ClampedArray(data);
    const radius = Math.max(1, Math.floor((3 + (intensity * 12)) / 2));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            if (skinMask[y * width + x] === 1) {
                let r = 0, g = 0, b = 0, count = 0;

                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const ny = y + dy;
                        const nx = x + dx;

                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            const nidx = (ny * width + nx) * 4;
                            r += data[nidx];
                            g += data[nidx + 1];
                            b += data[nidx + 2];
                            count++;
                        }
                    }
                }

                result[idx] = Math.floor(r / count);
                result[idx + 1] = Math.floor(g / count);
                result[idx + 2] = Math.floor(b / count);
            }
        }
    }

    ctx.putImageData(new ImageData(result, width, height), x, y);
}
