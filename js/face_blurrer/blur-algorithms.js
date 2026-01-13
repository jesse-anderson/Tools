// Face Blur Tool - Blur Algorithms
// Contains all blur effect implementations

// Canvas pool for reusing temporary canvases (performance optimization)
const canvasPool = {
    small: null, medium: null, large: null,
    get(size) {
        if (!this[size]) {
            this[size] = document.createElement('canvas');
            this[size].id = `pool-canvas-${size}`;
        }
        return this[size];
    },
    resize(size, width, height) {
        const canvas = this.get(size);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        return canvas;
    }
};

// WebWorker for pixel-intensive operations
let pixelWorker = null;
let workerUrl = null;
let workerCallbacks = new Map();
let workerCallbackId = 0;
let workerReady = false;
let pendingWorkerMessages = [];

// Initialize the WebWorker
function initPixelWorker() {
    if (pixelWorker) return;

    // Load worker from external file
    workerUrl = '../js/face_blurrer/worker.js';
    pixelWorker = new Worker(workerUrl);

    pixelWorker.onmessage = function(e) {
        const { type, id, result } = e.data;

        if (type === 'ready') {
            workerReady = true;
            while (pendingWorkerMessages.length > 0) {
                const msg = pendingWorkerMessages.shift();
                pixelWorker.postMessage(msg.data, msg.transfer);
            }
            return;
        }

        const callback = workerCallbacks.get(id);
        if (callback) {
            callback(new Uint8ClampedArray(result));
            workerCallbacks.delete(id);
        }
    };

    pixelWorker.onerror = function(error) {
        console.error('Worker error:', error);
        if (typeof Toast !== 'undefined') {
            Toast.error('Image processing error occurred');
        }
    };
}

// Cleanup worker resources
function cleanupWorker() {
    if (pixelWorker) {
        pixelWorker.terminate();
        pixelWorker = null;
    }
    if (workerUrl) {
        // Don't revoke external URL
        workerUrl = null;
    }
    workerReady = false;
}

// Run a task in the worker and return a promise
function runInWorker(type, imageData, width, height, param1) {
    return new Promise((resolve) => {
        if (!pixelWorker) {
            initPixelWorker();
        }

        const id = ++workerCallbackId;
        workerCallbacks.set(id, resolve);

        const data = imageData.data;
        const messageData = { id, type, data, width, height, param1 };
        const transferList = [data.buffer];

        if (workerReady) {
            pixelWorker.postMessage(messageData, transferList);
        } else {
            pendingWorkerMessages.push({ data: messageData, transfer: transferList });
        }
    });
}

// ============================================================================
// BLUR ALGORITHMS
// ============================================================================

// Apply blur to a rectangular region
async function applyBlurToRegion(ctx, x, y, width, height, detection, blurType, blurIntensity, regionExpansion, outputCanvas, faceLandmarks, featureBlurring) {
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

// Gaussian blur
function applyGaussianBlur(ctx, x, y, width, height, intensity) {
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
function applyGaussianBlurToImageData(imageData, width, height, intensity) {
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

// Pixelate effect
function applyPixelate(ctx, x, y, width, height, intensity) {
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
function applyPixelateToImageData(imageData, width, height, intensity) {
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

// Mosaic blur (tile-based)
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
    } catch (error) {
        console.warn('Worker processing failed, using fallback:', error);
        applyMosaicFallback(ctx, ix, iy, iw, ih, intensity);
    }
}

// Fallback synchronous mosaic processing
function applyMosaicFallback(ctx, x, y, width, height, intensity) {
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

// Black box (solid fill)
function applyBlackBox(ctx, x, y, width, height) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, width, height);
}

// Motion blur
function applyMotionBlur(ctx, x, y, width, height, intensity) {
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
function applyMotionBlurToImageData(imageData, width, height, intensity) {
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

// Eyes-only blur
function applyEyesOnlyBlur(ctx, faceX, faceY, faceWidth, faceHeight, intensity, detection, outputCanvas, faceLandmarks) {
    const canvasWidth = outputCanvas.width;
    const canvasHeight = outputCanvas.height;

    let landmarks = null;

    if (faceLandmarks && faceLandmarks.length > 0) {
        for (const mesh of faceLandmarks) {
            let minX = 1, minY = 1, maxX = 0, maxY = 0;
            for (const landmark of mesh) {
                minX = Math.min(minX, landmark.x);
                minY = Math.min(minY, landmark.y);
                maxX = Math.max(maxX, landmark.x);
                maxY = Math.max(maxY, landmark.y);
            }

            const meshCenterX = (minX + maxX) / 2;
            const meshCenterY = (minY + maxY) / 2;
            const box = detection.boundingBox;
            const boxCenterX = box.xCenter;
            const boxCenterY = box.yCenter;

            if (Math.abs(meshCenterX - boxCenterX) < 0.1 && Math.abs(meshCenterY - boxCenterY) < 0.1) {
                landmarks = mesh;
                break;
            }
        }
    }

    if (landmarks) {
        blurEyeUsingLandmarks(ctx, landmarks, canvasWidth, canvasHeight, intensity);
    } else {
        blurEyeEstimated(ctx, faceX, faceY, faceWidth, faceHeight, intensity);
    }
}

// Blur eyes using Face Mesh landmarks
function blurEyeUsingLandmarks(ctx, landmarks, canvasWidth, canvasHeight, intensity) {
    const leftEyePoints = LEFT_EYE_INDICES.map(i => landmarks[i]);
    const rightEyePoints = RIGHT_EYE_INDICES.map(i => landmarks[i]);

    const padding = 0.5;

    // Left eye
    let leftMinX = 1, leftMinY = 1, leftMaxX = 0, leftMaxY = 0;
    for (const pt of leftEyePoints) {
        leftMinX = Math.min(leftMinX, pt.x);
        leftMinY = Math.min(leftMinY, pt.y);
        leftMaxX = Math.max(leftMaxX, pt.x);
        leftMaxY = Math.max(leftMaxY, pt.y);
    }

    const leftEyeX = (leftMinX - padding * (leftMaxX - leftMinX)) * canvasWidth;
    const leftEyeY = (leftMinY - padding * (leftMaxY - leftMinY)) * canvasHeight;
    const leftEyeW = ((leftMaxX - leftMinX) * (1 + 2 * padding)) * canvasWidth;
    const leftEyeH = ((leftMaxY - leftMinY) * (1 + 2 * padding)) * canvasHeight;

    // Right eye
    let rightMinX = 1, rightMinY = 1, rightMaxX = 0, rightMaxY = 0;
    for (const pt of rightEyePoints) {
        rightMinX = Math.min(rightMinX, pt.x);
        rightMinY = Math.min(rightMinY, pt.y);
        rightMaxX = Math.max(rightMaxX, pt.x);
        rightMaxY = Math.max(rightMaxY, pt.y);
    }

    const rightEyeX = (rightMinX - padding * (rightMaxX - rightMinX)) * canvasWidth;
    const rightEyeY = (rightMinY - padding * (rightMaxY - rightMinY)) * canvasHeight;
    const rightEyeW = ((rightMaxX - rightMinX) * (1 + 2 * padding)) * canvasWidth;
    const rightEyeH = ((rightMaxY - rightMinY) * (1 + 2 * padding)) * canvasHeight;

    ctx.fillStyle = '#000000';
    ctx.fillRect(leftEyeX, leftEyeY, leftEyeW, leftEyeH);
    ctx.fillRect(rightEyeX, rightEyeY, rightEyeW, rightEyeH);

    // Eyebrows
    const leftBrowPoints = LEFT_BROW_INDICES.map(i => landmarks[i]);
    const rightBrowPoints = RIGHT_BROW_INDICES.map(i => landmarks[i]);

    const browPadding = 0.2;
    let leftBrowMinX = 1, leftBrowMinY = 1, leftBrowMaxX = 0, leftBrowMaxY = 0;
    for (const pt of leftBrowPoints) {
        leftBrowMinX = Math.min(leftBrowMinX, pt.x);
        leftBrowMinY = Math.min(leftBrowMinY, pt.y);
        leftBrowMaxX = Math.max(leftBrowMaxX, pt.x);
        leftBrowMaxY = Math.max(leftBrowMaxY, pt.y);
    }

    ctx.fillRect(
        (leftBrowMinX - browPadding * (leftBrowMaxX - leftBrowMinX)) * canvasWidth,
        (leftBrowMinY - browPadding * (leftBrowMaxY - leftBrowMinY)) * canvasHeight,
        ((leftBrowMaxX - leftBrowMinX) * (1 + 2 * browPadding)) * canvasWidth,
        ((leftBrowMaxY - leftBrowMinY) * (1 + 2 * browPadding)) * canvasHeight
    );

    let rightBrowMinX = 1, rightBrowMinY = 1, rightBrowMaxX = 0, rightBrowMaxY = 0;
    for (const pt of rightBrowPoints) {
        rightBrowMinX = Math.min(rightBrowMinX, pt.x);
        rightBrowMinY = Math.min(rightBrowMinY, pt.y);
        rightBrowMaxX = Math.max(rightBrowMaxX, pt.x);
        rightBrowMaxY = Math.max(rightBrowMaxY, pt.y);
    }

    ctx.fillRect(
        (rightBrowMinX - browPadding * (rightBrowMaxX - rightBrowMinX)) * canvasWidth,
        (rightBrowMinY - browPadding * (rightBrowMaxY - rightBrowMinY)) * canvasHeight,
        ((rightBrowMaxX - rightBrowMinX) * (1 + 2 * browPadding)) * canvasWidth,
        ((rightBrowMaxY - rightBrowMinY) * (1 + 2 * browPadding)) * canvasHeight
    );
}

// Estimated eye blur (fallback)
function blurEyeEstimated(ctx, x, y, width, height, intensity) {
    const eyeRegionY = y + (height * 0.15);
    const eyeRegionHeight = height * 0.25;
    const eyeRegionWidth = width * 0.5;
    const eyeRegionX = x + (width - eyeRegionWidth) / 2;

    const eyeBoxWidth = eyeRegionWidth * 0.4;
    const eyeGap = eyeRegionWidth * 0.2;
    const leftEyeX = eyeRegionX + (eyeRegionWidth - (eyeBoxWidth * 2) - eyeGap) / 2;
    const rightEyeX = leftEyeX + eyeBoxWidth + eyeGap;

    ctx.fillStyle = '#000000';
    ctx.fillRect(leftEyeX, eyeRegionY, eyeBoxWidth, eyeRegionHeight);
    ctx.fillRect(rightEyeX, eyeRegionY, eyeBoxWidth, eyeRegionHeight);

    const foreheadHeight = height * 0.2;
    ctx.fillRect(eyeRegionX, y, eyeRegionWidth, foreheadHeight);
}

// Skin mask blur
async function applySkinMaskBlur(ctx, x, y, width, height, intensity) {
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
    } catch (error) {
        console.warn('Worker processing failed, using fallback:', error);
        applySkinMaskBlurFallback(ctx, ix, iy, iw, ih, intensity);
    }
}

// Fallback synchronous skin mask blur
function applySkinMaskBlurFallback(ctx, x, y, width, height, intensity) {
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    const skinMask = new Uint8Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const pixelIndex = i / 4;

        const isSkin = (
            r > 60 && r < 255 && g > 40 && g < 210 && b > 20 && b < 180 &&
            r > g && g > b && (r - g) > 15 && (r - b) > 30 && (g - b) > 10
        );

        const isDarkSkin = (
            r > 50 && r < 180 && g > 30 && g < 140 && b > 20 && b < 100 &&
            r > g && g >= b && (r - g) > 10
        );

        skinMask[pixelIndex] = (isSkin || isDarkSkin) ? 1 : 0;
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

// Inpaint blur (patch-based)
async function applyInpaintBlur(ctx, x, y, width, height) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.round(width);
    const ih = Math.round(height);

    const data = ctx.getImageData(ix, iy, iw, ih).data;

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

    // Patch-based inpainting
    const patchSize = 15;
    const resultData = new Uint8ClampedArray(data);

    for (let py = 0; py < ih; py++) {
        for (let px = 0; px < iw; px++) {
            const idx = (py * iw + px) * 4;

            if (mask[py * iw + px] === 0) continue;

            let samplesR = 0, samplesG = 0, samplesB = 0, samplesA = 0;
            let sampleCount = 0;

            const maxRadius = Math.max(iw, ih);
            for (let r = 1; r < maxRadius && sampleCount < patchSize; r++) {
                for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
                    const sx = Math.round(px + Math.cos(angle) * r);
                    const sy = Math.round(py + Math.sin(angle) * r);

                    if (sx >= 0 && sx < iw && sy >= 0 && sy < ih) {
                        const sidx = (sy * iw + sx) * 4;
                        if (mask[sy * iw + sx] === 0) {
                            samplesR += data[sidx];
                            samplesG += data[sidx + 1];
                            samplesB += data[sidx + 2];
                            samplesA += data[sidx + 3];
                            sampleCount++;
                        }
                    }
                    if (sampleCount >= patchSize) break;
                }
                if (sampleCount >= patchSize) break;
            }

            if (sampleCount > 0) {
                resultData[idx] = Math.round(samplesR / sampleCount);
                resultData[idx + 1] = Math.round(samplesG / sampleCount);
                resultData[idx + 2] = Math.round(samplesB / sampleCount);
                resultData[idx + 3] = Math.round(samplesA / sampleCount);
            }
        }
    }

    // Apply slight blur to smooth
    const blurredResult = new Uint8ClampedArray(resultData);
    const blurRadius = 3;

    for (let py = blurRadius; py < ih - blurRadius; py++) {
        for (let px = blurRadius; px < iw - blurRadius; px++) {
            const idx = (py * iw + px) * 4;

            if (mask[py * iw + px] === 1) {
                let r = 0, g = 0, b = 0, count = 0;

                for (let by = -blurRadius; by <= blurRadius; by++) {
                    for (let bx = -blurRadius; bx <= blurRadius; bx++) {
                        const nidx = ((py + by) * iw + (px + bx)) * 4;
                        r += resultData[nidx];
                        g += resultData[nidx + 1];
                        b += resultData[nidx + 2];
                        count++;
                    }
                }

                blurredResult[idx] = Math.round(r / count);
                blurredResult[idx + 1] = Math.round(g / count);
                blurredResult[idx + 2] = Math.round(b / count);
                blurredResult[idx + 3] = resultData[idx + 3];
            }
        }
    }

    ctx.putImageData(new ImageData(blurredResult, iw, ih), ix, iy);
}

// Inpaint for ImageData (used with clipping regions)
async function applyInpaintToImageData(imageData, canvasX, canvasY, width, height) {
    const data = imageData.data;
    const iw = width;
    const ih = height;

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

    const patchSize = 15;
    const resultData = new Uint8ClampedArray(data);

    for (let py = 0; py < ih; py++) {
        for (let px = 0; px < iw; px++) {
            const idx = (py * iw + px) * 4;

            if (mask[py * iw + px] === 0) continue;

            let samplesR = 0, samplesG = 0, samplesB = 0, samplesA = 0;
            let sampleCount = 0;

            const maxRadius = Math.max(iw, ih);
            for (let r = 1; r < maxRadius && sampleCount < patchSize; r++) {
                for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
                    const sx = Math.round(px + Math.cos(angle) * r);
                    const sy = Math.round(py + Math.sin(angle) * r);

                    if (sx >= 0 && sx < iw && sy >= 0 && sy < ih) {
                        const sidx = (sy * iw + sx) * 4;
                        if (mask[sy * iw + sx] === 0) {
                            samplesR += data[sidx];
                            samplesG += data[sidx + 1];
                            samplesB += data[sidx + 2];
                            samplesA += data[sidx + 3];
                            sampleCount++;
                        }
                    }
                    if (sampleCount >= patchSize) break;
                }
                if (sampleCount >= patchSize) break;
            }

            if (sampleCount > 0) {
                resultData[idx] = Math.round(samplesR / sampleCount);
                resultData[idx + 1] = Math.round(samplesG / sampleCount);
                resultData[idx + 2] = Math.round(samplesB / sampleCount);
                resultData[idx + 3] = Math.round(samplesA / sampleCount);
            }
        }
    }

    const blurredResult = new Uint8ClampedArray(resultData);
    const blurRadius = 3;

    for (let py = blurRadius; py < ih - blurRadius; py++) {
        for (let px = blurRadius; px < iw - blurRadius; px++) {
            const idx = (py * iw + px) * 4;

            if (mask[py * iw + px] === 1) {
                let r = 0, g = 0, b = 0, count = 0;

                for (let by = -blurRadius; by <= blurRadius; by++) {
                    for (let bx = -blurRadius; bx <= blurRadius; bx++) {
                        const nidx = ((py + by) * iw + (px + bx)) * 4;
                        r += resultData[nidx];
                        g += resultData[nidx + 1];
                        b += resultData[nidx + 2];
                        count++;
                    }
                }

                blurredResult[idx] = Math.round(r / count);
                blurredResult[idx + 1] = Math.round(g / count);
                blurredResult[idx + 2] = Math.round(b / count);
            }
        }
    }

    for (let i = 0; i < data.length; i++) {
        data[i] = blurredResult[i];
    }
}

// Features blur (eyebrows, nose, mouth)
async function applyFeaturesBlur(ctx, x, y, width, height, detection, outputCanvas, faceLandmarks, featureBlurring) {
    const canvasWidth = outputCanvas.width;
    const canvasHeight = outputCanvas.height;

    let landmarks = null;
    if (faceLandmarks && faceLandmarks.length > 0) {
        for (const mesh of faceLandmarks) {
            let minX = 1, minY = 1, maxX = 0, maxY = 0;
            for (const landmark of mesh) {
                minX = Math.min(minX, landmark.x);
                minY = Math.min(minY, landmark.y);
                maxX = Math.max(maxX, landmark.x);
                maxY = Math.max(maxY, landmark.y);
            }

            const meshCenterX = (minX + maxX) / 2;
            const meshCenterY = (minY + maxY) / 2;
            const box = detection.boundingBox;
            const boxCenterX = box.xCenter;
            const boxCenterY = box.yCenter;

            if (Math.abs(meshCenterX - boxCenterX) < 0.1 && Math.abs(meshCenterY - boxCenterY) < 0.1) {
                landmarks = mesh;
                break;
            }
        }
    }

    if (!landmarks) {
        applyBlackBox(ctx, x, y, width, height);
        return;
    }

    ctx.fillStyle = '#000000';

    if (featureBlurring.eyes.enabled && featureBlurring.eyes.intensity > 0) {
        const leftEyePoints = LEFT_EYE_INDICES.map(i => landmarks[i]);
        const rightEyePoints = RIGHT_EYE_INDICES.map(i => landmarks[i]);
        const padding = 0.5;

        // Left eye
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of leftEyePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );

        // Right eye
        minX = 1; minY = 1; maxX = 0; maxY = 0;
        for (const pt of rightEyePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.eyebrows.enabled && featureBlurring.eyebrows.intensity > 0) {
        const leftBrowPoints = LEFT_BROW_INDICES.map(i => landmarks[i]);
        const rightBrowPoints = RIGHT_BROW_INDICES.map(i => landmarks[i]);
        const padding = 0.3;

        // Left eyebrow
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of leftBrowPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );

        // Right eyebrow
        minX = 1; minY = 1; maxX = 0; maxY = 0;
        for (const pt of rightBrowPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.nose.enabled && featureBlurring.nose.intensity > 0) {
        const nosePoints = NOSE_INDICES.map(i => landmarks[i]);
        const padding = 0.2;
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of nosePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.mouth.enabled && featureBlurring.mouth.intensity > 0) {
        const mouthPoints = MOUTH_INDICES.map(i => landmarks[i]);
        const padding = 0.25;
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of mouthPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }
}

// Features blur with pre-found mesh
async function applyFeaturesBlurWithMesh(ctx, mesh, canvasWidth, canvasHeight, featureBlurring) {
    const landmarks = mesh;
    ctx.fillStyle = '#000000';

    if (featureBlurring.eyes.enabled && featureBlurring.eyes.intensity > 0) {
        const leftEyePoints = LEFT_EYE_INDICES.map(i => landmarks[i]);
        const rightEyePoints = RIGHT_EYE_INDICES.map(i => landmarks[i]);
        const padding = 0.5;

        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of leftEyePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );

        minX = 1; minY = 1; maxX = 0; maxY = 0;
        for (const pt of rightEyePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.eyebrows.enabled && featureBlurring.eyebrows.intensity > 0) {
        const leftBrowPoints = LEFT_BROW_INDICES.map(i => landmarks[i]);
        const rightBrowPoints = RIGHT_BROW_INDICES.map(i => landmarks[i]);
        const padding = 0.3;

        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of leftBrowPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );

        minX = 1; minY = 1; maxX = 0; maxY = 0;
        for (const pt of rightBrowPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.nose.enabled && featureBlurring.nose.intensity > 0) {
        const nosePoints = NOSE_INDICES.map(i => landmarks[i]);
        const padding = 0.2;
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of nosePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.mouth.enabled && featureBlurring.mouth.intensity > 0) {
        const mouthPoints = MOUTH_INDICES.map(i => landmarks[i]);
        const padding = 0.25;
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of mouthPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }
}

// Apply blur directly to ImageData (for use with clipping regions)
async function applyBlurToImageData(ctx, imageData, x, y, width, height, blurType, blurIntensity) {
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
            const mosaicResult = await runInWorker('mosaic', imageData, width, height, Math.max(6, Math.round(5 + (intensity * 45))));
            const mosaicImageData = new ImageData(mosaicResult, width, height);
            ctx.putImageData(mosaicImageData, x, y);
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
            const skinResult = await runInWorker('skinmask', imageData, width, height, Math.round(3 + (intensity * 12)));
            const skinImageData = new ImageData(skinResult, width, height);
            ctx.putImageData(skinImageData, x, y);
            break;
        case "inpaint":
            await applyInpaintToImageData(imageData, x, y, width, height);
            ctx.putImageData(imageData, x, y);
            break;
    }
}

// Helper: Get average color from pixel data
function getAverageColor(data) {
    let r = 0, g = 0, b = 0, count = 0;

    for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
    }

    r = Math.floor(r / count);
    g = Math.floor(g / count);
    b = Math.floor(b / count);

    return `rgb(${r}, ${g}, ${b})`;
}
