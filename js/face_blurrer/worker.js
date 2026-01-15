// WebWorker for pixel-intensive blur operations
// Runs in background thread to avoid blocking UI

// MediaPipe Face Mesh landmark indices (inlined for WebWorker compatibility)
const LEFT_EYE_INDICES = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398];
const RIGHT_EYE_INDICES = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246];
const LEFT_BROW_INDICES = [70,63,105,66,107,55,65,52,53,46];
const RIGHT_BROW_INDICES = [300,293,334,296,336,285,295,282,283,276];
const NOSE_INDICES = [1,2,4,5,6,64,168,197,294];
const MOUTH_INDICES = [61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95,78,191,80,81,82,13,312,311,310,415,267,269,270,409,185,40,39,37,0,183,42];
const FACE_OVAL_INDICES = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];

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
 * - Kakumanu et al. (2007): "A survey of skin-color modeling and detection methods"
 *   Pattern Recognition, Volume 40, Issue 3, Pages 1106-1122
 * - Zarit et al. (1999): "Comparison of five color models in skin pixel classification"
 *   ICCV '99 Proceedings
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
function sampleSkinTones(data, width, height) {
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

// ============================================================================
// BLUR ALGORITHMS
// ============================================================================

// Process mosaic blur
function processMosaic(data, width, height, tileSize) {
    const result = new Uint8ClampedArray(data);

    for (let tileY = 0; tileY < height; tileY += tileSize) {
        for (let tileX = 0; tileX < width; tileX += tileSize) {
            const tileW = Math.min(tileSize, width - tileX);
            const tileH = Math.min(tileSize, height - tileY);

            // Get average color for this tile
            let r = 0, g = 0, b = 0, count = 0;

            for (let py = 0; py < tileH; py++) {
                for (let px = 0; px < tileW; px++) {
                    const idx = ((tileY + py) * width + (tileX + px)) * 4;
                    r += data[idx];
                    g += data[idx + 1];
                    b += data[idx + 2];
                    count++;
                }
            }

            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);

            // Fill tile with average color
            for (let py = 0; py < tileH; py++) {
                for (let px = 0; px < tileW; px++) {
                    const idx = ((tileY + py) * width + (tileX + px)) * 4;
                    result[idx] = r;
                    result[idx + 1] = g;
                    result[idx + 2] = b;
                }
            }
        }
    }

    return result;
}

// Process skin mask blur with YCbCr detection
function processSkinMask(data, width, height, blurRadius) {
    // First pass: sample skin tones for adaptive detection
    const adaptiveRange = sampleSkinTones(data, width, height);

    // Second pass: create skin mask using YCbCr
    const skinMask = new Uint8Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const pixelIndex = i / 4;

        // Use YCbCr-based detection with adaptive sampling
        skinMask[pixelIndex] = isSkinPixelYCbCr(r, g, b, adaptiveRange) ? 1 : 0;
    }

    // Third pass: apply blur to skin pixels
    const result = new Uint8ClampedArray(data);
    const radius = Math.max(1, Math.floor(blurRadius / 2));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            if (skinMask[y * width + x] === 1) {
                // Apply blur to this pixel
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

    return result;
}

// ============================================================================
// INPAINT BLUR (patch-based with optimized O(n) lookup)
// ============================================================================

/**
 * Process inpaint blur using pre-computed sample lookup.
 *
 * Optimization: Instead of O(n×r²) radial search for each pixel,
 * we pre-compute all valid sample positions and use spatial hashing.
 * This reduces complexity from O(width×height×maxRadius) to O(width×height).
 *
 * @param {Uint8ClampedArray} data - Source image data (RGBA flat array)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Uint8ClampedArray} - Processed image data
 */
function processInpaint(data, width, height) {
    // Create oval mask and collect valid sample positions in one pass
    const mask = new Uint8Array(width * height);
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = width / 2;
    const radiusY = height / 2;

    // Pre-compute list of valid sample positions (non-mask pixels)
    // This is the key optimization - O(n) space for O(1) lookup later
    const validSamples = [];

    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            const pixelIndex = py * width + px;
            const dx = (px - centerX) / radiusX;
            const dy = (py - centerY) / radiusY;
            const inOval = dx * dx + dy * dy <= 1;

            if (inOval) {
                mask[pixelIndex] = 1; // Pixel needs inpainting
            } else {
                mask[pixelIndex] = 0; // Valid source pixel
                validSamples.push({ x: px, y: py });
            }
        }
    }

    // If no valid samples, return original
    if (validSamples.length === 0) {
        return new Uint8ClampedArray(data);
    }

    // Build spatial index for faster nearest-neighbor lookup
    // Divide image into grid cells for O(1) proximity lookup
    const gridSize = 20; // 20px grid cells
    const gridCols = Math.ceil(width / gridSize);
    const gridRows = Math.ceil(height / gridSize);
    const grid = new Array(gridCols * gridRows);

    for (let i = 0; i < grid.length; i++) {
        grid[i] = [];
    }

    // Populate grid with sample positions
    for (let i = 0; i < validSamples.length; i++) {
        const sample = validSamples[i];
        const cellX = Math.floor(sample.x / gridSize);
        const cellY = Math.floor(sample.y / gridSize);
        const cellIndex = cellY * gridCols + cellX;
        grid[cellIndex].push(i);
    }

    // Helper: find nearest samples using spatial grid
    function getNearestSamples(targetX, targetY, count) {
        const results = [];
        const targetCellX = Math.floor(targetX / gridSize);
        const targetCellY = Math.floor(targetY / gridSize);
        const maxRadius = Math.max(gridCols, gridRows);

        // Search expanding rings of grid cells
        for (let radius = 0; radius <= maxRadius && results.length < count; radius++) {
            for (let dy = -radius; dy <= radius && results.length < count; dy++) {
                for (let dx = -radius; dx <= radius && results.length < count; dx++) {
                    // Only check perimeter of the search ring
                    if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
                        continue;
                    }

                    const cellX = targetCellX + dx;
                    const cellY = targetCellY + dy;

                    if (cellX < 0 || cellX >= gridCols || cellY < 0 || cellY >= gridRows) {
                        continue;
                    }

                    const cellIndex = cellY * gridCols + cellX;
                    const cellSamples = grid[cellIndex];

                    for (let i = 0; i < cellSamples.length && results.length < count; i++) {
                        const sampleIndex = cellSamples[i];
                        const sample = validSamples[sampleIndex];
                        const distSq = (sample.x - targetX) ** 2 + (sample.y - targetY) ** 2;
                        results.push({ index: sampleIndex, distSq });
                    }
                }
            }
        }

        // Sort by distance and return closest samples
        results.sort((a, b) => a.distSq - b.distSq);
        return results.slice(0, count).map(r => r.index);
    }

    // Patch-based inpainting with O(n) complexity
    const patchSize = 15;
    const resultData = new Uint8ClampedArray(data);

    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            const pixelIndex = py * width + px;

            if (mask[pixelIndex] === 0) continue; // Skip non-mask pixels

            // Get nearest valid samples using spatial lookup
            const nearestIndices = getNearestSamples(px, py, patchSize);

            if (nearestIndices.length === 0) continue;

            // Average the samples
            let samplesR = 0, samplesG = 0, samplesB = 0, samplesA = 0;
            const sampleCount = nearestIndices.length;

            for (let i = 0; i < sampleCount; i++) {
                const sample = validSamples[nearestIndices[i]];
                const sidx = (sample.y * width + sample.x) * 4;
                samplesR += data[sidx];
                samplesG += data[sidx + 1];
                samplesB += data[sidx + 2];
                samplesA += data[sidx + 3];
            }

            const idx = pixelIndex * 4;
            resultData[idx] = Math.round(samplesR / sampleCount);
            resultData[idx + 1] = Math.round(samplesG / sampleCount);
            resultData[idx + 2] = Math.round(samplesB / sampleCount);
            resultData[idx + 3] = Math.round(samplesA / sampleCount);
        }
    }

    // Apply slight blur to smooth the result
    const blurRadius = 3;
    const blurredResult = new Uint8ClampedArray(resultData);

    for (let py = blurRadius; py < height - blurRadius; py++) {
        for (let px = blurRadius; px < width - blurRadius; px++) {
            const pixelIndex = py * width + px;

            if (mask[pixelIndex] === 1) {
                let r = 0, g = 0, b = 0, count = 0;

                for (let by = -blurRadius; by <= blurRadius; by++) {
                    for (let bx = -blurRadius; bx <= blurRadius; bx++) {
                        const nidx = ((py + by) * width + (px + bx)) * 4;
                        r += resultData[nidx];
                        g += resultData[nidx + 1];
                        b += resultData[nidx + 2];
                        count++;
                    }
                }

                const idx = pixelIndex * 4;
                blurredResult[idx] = Math.round(r / count);
                blurredResult[idx + 1] = Math.round(g / count);
                blurredResult[idx + 2] = Math.round(b / count);
            }
        }
    }

    return blurredResult;
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

// Message handler
self.onmessage = function(e) {
    const { id, type, data, width, height, param1 } = e.data;
    let resultArray;

    if (type === 'mosaic') {
        resultArray = processMosaic(data, width, height, param1);
    } else if (type === 'skinmask') {
        resultArray = processSkinMask(data, width, height, param1);
    } else if (type === 'inpaint') {
        resultArray = processInpaint(data, width, height);
    }

    // Transfer the buffer of the result array back to main thread
    self.postMessage({ id, result: resultArray.buffer }, [resultArray.buffer]);
};

// Send ready message
setTimeout(() => self.postMessage({ type: 'ready' }), 0);
