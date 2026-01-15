// Face Blur Tool - Core Blur Algorithms
// Main blur effect implementations

import { canvasPool, runInWorker } from './blur-utils.js';
import { applySkinMaskBlur } from './skin-detection.js';

// ============================================================================
// MAIN BLUR DISPATCHER
// ============================================================================

// Apply blur to a rectangular region
export async function applyBlurToRegion(ctx, x, y, width, height, detection, blurType, blurIntensity, regionExpansion, outputCanvas, faceLandmarks, featureBlurring) {
    const intensity = blurIntensity / 100;

    switch (blurType) {
        case "gaussian":
            applyGaussianBlur(ctx, x, y, width, height, intensity);
            break;
        case "pixelate":
            applyPixelate(ctx, x, y, width, height, intensity);
            break;
        case "mosaic":
            await applyMosaic(ctx, x, y, width, height, intensity);
            break;
        case "box":
            applyBlackBox(ctx, x, y, width, height);
            break;
        case "motion":
            applyMotionBlur(ctx, x, y, width, height, intensity);
            break;
        case "eyes":
            applyEyesOnlyBlur(ctx, x, y, width, height, intensity, detection, outputCanvas, faceLandmarks);
            break;
        case "skinmask":
            await applySkinMaskBlur(ctx, x, y, width, height, intensity);
            break;
        case "inpaint":
            await applyInpaintBlur(ctx, x, y, width, height);
            break;
        case "features":
            await applyFeaturesBlur(ctx, x, y, width, height, detection, outputCanvas, faceLandmarks, featureBlurring);
            break;
    }
}

// ============================================================================
// GAUSSIAN BLUR
// ============================================================================

export function applyGaussianBlur(ctx, x, y, width, height, intensity) {
    const blurRadius = Math.round(2 + (intensity * 48));

    const sourceCanvas = canvasPool.resize('small', width, height);
    const sourceCtx = sourceCanvas.getContext('2d');
    const imageData = ctx.getImageData(x, y, width, height);
    sourceCtx.putImageData(imageData, 0, 0);

    const resultCanvas = canvasPool.resize('medium', width, height);
    const resultCtx = resultCanvas.getContext('2d');

    resultCtx.filter = `blur(${blurRadius}px)`;
    resultCtx.drawImage(sourceCanvas, 0, 0);

    const blurredData = resultCtx.getImageData(0, 0, width, height);
    ctx.putImageData(blurredData, x, y);
}

// Gaussian blur for ImageData (used with clipping regions)
export function applyGaussianBlurToImageData(imageData, width, height, intensity) {
    const blurRadius = Math.round(2 + (intensity * 48));

    const sourceCanvas = canvasPool.resize('small', width, height);
    const sourceCtx = sourceCanvas.getContext('2d');
    sourceCtx.putImageData(imageData, 0, 0);

    const resultCanvas = canvasPool.resize('medium', width, height);
    const resultCtx = resultCanvas.getContext('2d');

    resultCtx.filter = `blur(${blurRadius}px)`;
    resultCtx.drawImage(sourceCanvas, 0, 0);

    const resultData = resultCtx.getImageData(0, 0, width, height);
    for (let i = 0; i < imageData.data.length; i++) {
        imageData.data[i] = resultData.data[i];
    }
}

// ============================================================================
// PIXELATE EFFECT
// ============================================================================

export function applyPixelate(ctx, x, y, width, height, intensity) {
    const pixelSize = Math.max(4, Math.round(3 + (intensity * 37)));
    const smallWidth = Math.max(1, Math.floor(width / pixelSize));
    const smallHeight = Math.max(1, Math.floor(height / pixelSize));

    const smallCanvas = canvasPool.resize('small', smallWidth, smallHeight);
    const smallCtx = smallCanvas.getContext('2d');
    smallCtx.imageSmoothingEnabled = false;

    smallCtx.drawImage(ctx.canvas, x, y, width, height, 0, 0, smallWidth, smallHeight);

    const resultCanvas = canvasPool.resize('medium', width, height);
    const resultCtx = resultCanvas.getContext('2d');
    resultCtx.imageSmoothingEnabled = false;
    resultCtx.drawImage(smallCanvas, 0, 0, smallWidth, smallHeight, 0, 0, width, height);

    ctx.putImageData(resultCtx.getImageData(0, 0, width, height), x, y);
}

// Pixelate for ImageData (used with clipping regions)
export function applyPixelateToImageData(imageData, width, height, intensity) {
    const pixelSize = Math.max(4, Math.round(3 + (intensity * 37)));
    const smallWidth = Math.max(1, Math.floor(width / pixelSize));
    const smallHeight = Math.max(1, Math.floor(height / pixelSize));

    const smallCanvas = canvasPool.resize('small', smallWidth, smallHeight);
    const smallCtx = smallCanvas.getContext('2d');
    smallCtx.imageSmoothingEnabled = false;

    const tempCanvas = canvasPool.resize('medium', width, height);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);

    smallCtx.drawImage(tempCanvas, 0, 0, smallWidth, smallHeight);

    const resultCanvas = canvasPool.resize('large', width, height);
    const resultCtx = resultCanvas.getContext('2d');
    resultCtx.imageSmoothingEnabled = false;
    resultCtx.drawImage(smallCanvas, 0, 0, smallWidth, smallHeight, 0, 0, width, height);

    const resultData = resultCtx.getImageData(0, 0, width, height);
    for (let i = 0; i < imageData.data.length; i++) {
        imageData.data[i] = resultData.data[i];
    }
}

// ============================================================================
// MOSAIC BLUR (tile-based)
// ============================================================================

async function applyMosaic(ctx, x, y, width, height, intensity) {
    const tileSize = Math.max(6, Math.round(5 + (intensity * 45)));
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.round(width);
    const ih = Math.round(height);

    const sourceData = ctx.getImageData(ix, iy, iw, ih);

    try {
        const processedData = await runInWorker('mosaic', sourceData, iw, ih, tileSize);
        const resultImageData = new ImageData(processedData, iw, ih);
        ctx.putImageData(resultImageData, ix, iy);
    } catch (workerError) {
        console.warn('Worker processing failed, using fallback:', workerError);
        try {
            applyMosaicFallback(ctx, ix, iy, iw, ih, intensity);
        } catch (fallbackError) {
            console.error('Both worker and fallback failed for mosaic blur:', fallbackError);
            throw new Error(`Mosaic blur processing failed: ${fallbackError.message}`);
        }
    }
}

// Fallback synchronous mosaic processing
export function applyMosaicFallback(ctx, x, y, width, height, intensity) {
    const tileSize = Math.max(6, Math.round(5 + (intensity * 45)));

    for (let tileY = 0; tileY < height; tileY += tileSize) {
        for (let tileX = 0; tileX < width; tileX += tileSize) {
            const tileW = Math.min(tileSize, width - tileX);
            const tileH = Math.min(tileSize, height - tileY);

            const tileData = ctx.getImageData(x + tileX, y + tileY, tileW, tileH);
            const avgColor = getAverageColor(tileData.data);

            ctx.fillStyle = avgColor;
            ctx.fillRect(x + tileX, y + tileY, tileW, tileH);
        }
    }
}

// ============================================================================
// BLACK BOX (solid fill)
// ============================================================================

export function applyBlackBox(ctx, x, y, width, height) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, width, height);
}

// ============================================================================
// MOTION BLUR
// ============================================================================

export function applyMotionBlur(ctx, x, y, width, height, intensity) {
    const blurDistance = Math.round(5 + (intensity * 40));
    const angle = Math.PI / 4;

    const tempCanvas = canvasPool.resize('small', width, height);
    const tempCtx = tempCanvas.getContext('2d');
    const imageData = ctx.getImageData(x, y, width, height);
    tempCtx.putImageData(imageData, 0, 0);

    const resultCanvas = canvasPool.resize('medium', width, height);
    const resultCtx = resultCanvas.getContext('2d');

    const offsetX = Math.cos(angle) * blurDistance;
    const offsetY = Math.sin(angle) * blurDistance;
    const steps = 10;

    for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const shiftX = offsetX * t;
        const shiftY = offsetY * t;
        const alpha = 1 / steps;

        resultCtx.globalAlpha = alpha;
        resultCtx.drawImage(tempCanvas, shiftX, shiftY);
    }

    resultCtx.globalAlpha = 1;
    const resultData = resultCtx.getImageData(0, 0, width, height);
    ctx.putImageData(resultData, x, y);
}

// Motion blur for ImageData
export function applyMotionBlurToImageData(imageData, width, height, intensity) {
    const blurDistance = Math.round(5 + (intensity * 40));
    const angle = Math.PI / 4;

    const result = new Uint8ClampedArray(imageData.data);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const srcIdx = (y * width + x) * 4;

            let r = 0, g = 0, b = 0, count = 0;
            const steps = 10;

            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                const offsetX = Math.round(Math.cos(angle) * blurDistance * t);
                const offsetY = Math.round(Math.sin(angle) * blurDistance * t);

                const srcX = Math.min(width - 1, Math.max(0, x + offsetX));
                const srcY = Math.min(height - 1, Math.max(0, y + offsetY));

                const idx = (srcY * width + srcX) * 4;
                r += imageData.data[idx];
                g += imageData.data[idx + 1];
                b += imageData.data[idx + 2];
                count++;
            }

            result[srcIdx] = r / count;
            result[srcIdx + 1] = g / count;
            result[srcIdx + 2] = b / count;
        }
    }

    for (let i = 0; i < imageData.data.length; i++) {
        imageData.data[i] = result[i];
    }
}

// ============================================================================
// INPAINT BLUR (patch-based - processed in WebWorker)
// ============================================================================

/**
 * Apply inpaint blur using WebWorker for non-blocking processing.
 * The worker uses spatial hashing for O(n) complexity instead of O(n×r²).
 */
export async function applyInpaintBlur(ctx, x, y, width, height) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.round(width);
    const ih = Math.round(height);

    const imageData = ctx.getImageData(ix, iy, iw, ih);

    try {
        // Process in WebWorker using optimized spatial lookup algorithm
        const processedData = await runInWorker('inpaint', imageData, iw, ih);
        const resultImageData = new ImageData(processedData, iw, ih);
        ctx.putImageData(resultImageData, ix, iy);
    } catch (workerError) {
        console.warn('Worker inpaint failed, using fallback:', workerError);
        // Fallback to synchronous processing (may be slow on large regions)
        applyInpaintFallback(ctx, ix, iy, iw, ih);
    }
}

// Fallback synchronous inpaint (only used if worker fails)
export function applyInpaintFallback(ctx, x, y, width, height) {
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;
    const iw = width;
    const ih = height;

    // Simple fallback: use gaussian blur for the oval region
    const mask = new Uint8Array(iw * ih);
    const centerX = iw / 2;
    const centerY = ih / 2;
    const radiusX = iw / 2;
    const radiusY = ih / 2;

    for (let py = 0; py < ih; py++) {
        for (let px = 0; px < iw; px++) {
            const dx = (px - centerX) / radiusX;
            const dy = (py - centerY) / radiusY;
            if (dx * dx + dy * dy <= 1) {
                mask[py * iw + px] = 1;
            }
        }
    }

    // Apply blur to masked region using nearby pixels
    const blurRadius = 10;
    const result = new Uint8ClampedArray(data);

    for (let py = 0; py < ih; py++) {
        for (let px = 0; px < iw; px++) {
            const pixelIndex = py * iw + px;

            if (mask[pixelIndex] === 1) {
                let r = 0, g = 0, b = 0, count = 0;

                // Sample from expanding radius
                for (let radius = 1; radius < blurRadius && count < 15; radius++) {
                    for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
                        const sx = Math.round(px + Math.cos(angle) * radius);
                        const sy = Math.round(py + Math.sin(angle) * radius);

                        if (sx >= 0 && sx < iw && sy >= 0 && sy < ih) {
                            const si = sy * iw + sx;
                            if (mask[si] === 0) {
                                const sidx = si * 4;
                                r += data[sidx];
                                g += data[sidx + 1];
                                b += data[sidx + 2];
                                count++;
                            }
                        }
                        if (count >= 15) break;
                    }
                    if (count >= 15) break;
                }

                if (count > 0) {
                    const idx = pixelIndex * 4;
                    result[idx] = Math.round(r / count);
                    result[idx + 1] = Math.round(g / count);
                    result[idx + 2] = Math.round(b / count);
                }
            }
        }
    }

    ctx.putImageData(new ImageData(result, iw, ih), x, y);
}

// Inpaint for ImageData (used with clipping regions)
// Uses WebWorker for optimized O(n) processing
export async function applyInpaintToImageData(imageData, canvasX, canvasY, width, height) {
    try {
        // Process in WebWorker using optimized spatial lookup algorithm
        const processedData = await runInWorker('inpaint', imageData, width, height);
        // Copy processed data back to original ImageData
        for (let i = 0; i < imageData.data.length; i++) {
            imageData.data[i] = processedData[i];
        }
    } catch (workerError) {
        console.warn('Worker inpaint failed for ImageData, using fallback:', workerError);
        // Fallback to simpler synchronous processing
        const data = imageData.data;
        const iw = width;
        const ih = height;

        // Create oval mask
        const mask = new Uint8Array(iw * ih);
        const centerX = iw / 2;
        const centerY = ih / 2;
        const radiusX = iw / 2;
        const radiusY = ih / 2;

        for (let py = 0; py < ih; py++) {
            for (let px = 0; px < iw; px++) {
                const dx = (px - centerX) / radiusX;
                const dy = (py - centerY) / radiusY;
                if (dx * dx + dy * dy <= 1) {
                    mask[py * iw + px] = 1;
                }
            }
        }

        // Simple blur for masked region
        const blurRadius = 10;
        const resultData = new Uint8ClampedArray(data);

        for (let py = 0; py < ih; py++) {
            for (let px = 0; px < iw; px++) {
                const pixelIndex = py * iw + px;

                if (mask[pixelIndex] === 1) {
                    let r = 0, g = 0, b = 0, count = 0;

                    // Sample from nearby non-mask pixels
                    for (let radius = 1; radius < blurRadius && count < 15; radius++) {
                        for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
                            const sx = Math.round(px + Math.cos(angle) * radius);
                            const sy = Math.round(py + Math.sin(angle) * radius);

                            if (sx >= 0 && sx < iw && sy >= 0 && sy < ih) {
                                const si = sy * iw + sx;
                                if (mask[si] === 0) {
                                    const sidx = si * 4;
                                    r += data[sidx];
                                    g += data[sidx + 1];
                                    b += data[sidx + 2];
                                    count++;
                                }
                            }
                            if (count >= 15) break;
                        }
                        if (count >= 15) break;
                    }

                    if (count > 0) {
                        const idx = pixelIndex * 4;
                        resultData[idx] = Math.round(r / count);
                        resultData[idx + 1] = Math.round(g / count);
                        resultData[idx + 2] = Math.round(b / count);
                    }
                }
            }
        }

        for (let i = 0; i < data.length; i++) {
            data[i] = resultData[i];
        }
    }
}

// ============================================================================
// APPLY BLUR TO IMAGEDATA (for use with clipping regions)
// ============================================================================

export async function applyBlurToImageData(ctx, imageData, x, y, width, height, blurType, blurIntensity) {
    const intensity = blurIntensity / 100;

    switch (blurType) {
        case "gaussian":
            applyGaussianBlurToImageData(imageData, width, height, intensity);
            ctx.putImageData(imageData, x, y);
            break;
        case "pixelate":
            applyPixelateToImageData(imageData, width, height, intensity);
            ctx.putImageData(imageData, x, y);
            break;
        case "mosaic":
            try {
                const mosaicResult = await runInWorker('mosaic', imageData, width, height, Math.max(6, Math.round(5 + (intensity * 45))));
                const mosaicImageData = new ImageData(mosaicResult, width, height);
                ctx.putImageData(mosaicImageData, x, y);
            } catch (workerError) {
                console.warn('Worker mosaic failed, using synchronous fallback:', workerError);
                // Fallback: use pixelate as a simpler alternative
                applyPixelateToImageData(imageData, width, height, intensity);
                ctx.putImageData(imageData, x, y);
            }
            break;
        case "box":
            for (let i = 0; i < imageData.data.length; i += 4) {
                imageData.data[i] = 0;
                imageData.data[i + 1] = 0;
                imageData.data[i + 2] = 0;
            }
            ctx.putImageData(imageData, x, y);
            break;
        case "motion":
            applyMotionBlurToImageData(imageData, width, height, intensity);
            ctx.putImageData(imageData, x, y);
            break;
        case "eyes":
            applyGaussianBlurToImageData(imageData, width, height, intensity);
            ctx.putImageData(imageData, x, y);
            break;
        case "skinmask":
            try {
                const skinResult = await runInWorker('skinmask', imageData, width, height, Math.round(3 + (intensity * 12)));
                const skinImageData = new ImageData(skinResult, width, height);
                ctx.putImageData(skinImageData, x, y);
            } catch (workerError) {
                console.warn('Worker skinmask failed, using gaussian fallback:', workerError);
                // Fallback: use gaussian blur as simpler alternative
                applyGaussianBlurToImageData(imageData, width, height, intensity);
                ctx.putImageData(imageData, x, y);
            }
            break;
        case "inpaint":
            await applyInpaintToImageData(imageData, x, y, width, height);
            ctx.putImageData(imageData, x, y);
            break;
    }
}
