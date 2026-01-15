// ============================================
// GRAPH PROCESSING WEB WORKER
// ============================================
// Handles heavy FFT post-processing off the main thread:
// - Polar spectrum unwrapping
// - Azimuthal angle analysis
// - Radial frequency falloff
//
// Math optimizations:
// - Uses squared distance to avoid sqrt where possible
// - Combines azimuthal + radial into single pass
// - Pre-computes trig values for polar plot
// ============================================

// Magma colormap (same as main thread)
function getMagmaColor(t) {
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    let r, g, b;
    if (t < 0.33) {
        const lt = t / 0.33;
        r = lerp(0, 63, lt);
        g = lerp(0, 15, lt);
        b = lerp(0, 114, lt);
    } else if (t < 0.66) {
        const lt = (t - 0.33) / 0.33;
        r = lerp(63, 252, lt);
        g = lerp(15, 103, lt);
        b = lerp(114, 93, lt);
    } else {
        const lt = (t - 0.66) / 0.34;
        r = lerp(252, 252, lt);
        g = lerp(103, 253, lt);
        b = lerp(93, 191, lt);
    }
    return { r, g, b };
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// ============================================
// COMBINED SCAN: Azimuthal + Radial in one pass
// ============================================
// OPTIMIZATION: Single O(w*h) pass instead of two separate passes
// OPTIMIZATION: Uses squared distance to avoid sqrt for comparisons
// ============================================
function computeMetricsCombined(mag, w, h) {
    const startTime = performance.now();

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.ceil(Math.sqrt(cx * cx + cy * cy));

    // Azimuthal setup
    const bins = 360;
    const azimuthalSums = new Float32Array(bins);
    const azimuthalCounts = new Uint32Array(bins);
    const minR = Math.min(w, h) * 0.25;
    const maxRAzimuthal = Math.min(w, h) * 0.45;
    const minRSq = minR * minR;  // Pre-compute squared for comparison
    const maxRSq = maxRAzimuthal * maxRAzimuthal;

    // Radial setup
    const radialSums = new Float32Array(maxR);
    const radialCounts = new Uint32Array(maxR);

    // TO_DEG = 180 / PI, pre-computed
    const TO_DEG = 57.29577951308232;

    // Single pass through all pixels
    for (let y = 0; y < h; y++) {
        const dy = y - cy;
        const dySq = dy * dy;  // Pre-compute Y squared

        for (let x = 0; x < w; x++) {
            const dx = x - cx;
            const dxSq = dx * dx;  // Pre-compute X squared

            // OPTIMIZATION: Use squared distance to avoid sqrt for comparison
            const distSq = dxSq + dySq;

            // ==================== AZIMUTHAL ====================
            // Only process pixels in the annulus (ring)
            if (distSq >= minRSq && distSq < maxRSq) {
                // Only compute sqrt here since we need the actual radius for the angle check
                // Actually, for atan2 we don't need radius - it handles the ratio directly
                let angle = Math.atan2(dy, dx) * TO_DEG;
                if (angle < 0) angle += 360;
                const b = Math.floor(angle) % 360;
                azimuthalSums[b] += mag[y * w + x];
                azimuthalCounts[b]++;
            }

            // ==================== RADIAL ====================
            // OPTIMIZATION: Floor of sqrt is the same as floor(sqrt(distSq))
            // We only compute sqrt once per pixel here
            const r = Math.floor(Math.sqrt(distSq));
            if (r < maxR) {
                radialSums[r] += mag[y * w + x];
                radialCounts[r]++;
            }
        }
    }

    // Process azimuthal data
    const azimuthalData = [];
    for (let i = 0; i < bins; i++) {
        azimuthalData.push(azimuthalCounts[i] ? azimuthalSums[i] / azimuthalCounts[i] : 0);
    }

    // Process radial data
    const radialData = [];
    for (let r = 1; r < maxR; r++) {
        if (radialCounts[r]) {
            radialData.push(radialSums[r] / radialCounts[r]);
        }
    }

    const elapsed = performance.now() - startTime;
    console.log(`[WORKER] Combined metrics scan: ${elapsed.toFixed(1)}ms`);

    return {
        azimuthal: azimuthalData,
        radial: radialData,
        scanTime: elapsed
    };
}

// ============================================
// POLAR PLOT UNWRAPPING
// ============================================
// OPTIMIZATION: Pre-compute all cos/sin values
// ============================================
function computePolarPlot(mag, w, h, outputW, outputH) {
    const startTime = performance.now();

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) / 2;

    // Find max value for normalization
    let maxVal = 0;
    for (let i = 0; i < 1000; i++) {
        const v = mag[Math.floor(Math.random() * mag.length)];
        if (v > maxVal) maxVal = v;
    }
    if (maxVal === 0) maxVal = 1;

    // OPTIMIZATION: Pre-compute trig values for each output pixel
    // This avoids computing cos/sin 120,000 times (for 400x300 output)
    const cosTable = new Float32Array(outputW);
    const sinTable = new Float32Array(outputW);
    for (let x = 0; x < outputW; x++) {
        const theta = (x / outputW) * Math.PI * 2;
        cosTable[x] = Math.cos(theta);
        sinTable[x] = Math.sin(theta);
    }

    const imgData = new Uint8ClampedArray(outputW * outputH * 4);

    for (let y = 0; y < outputH; y++) {
        const r = (y / outputH) * maxR;

        for (let x = 0; x < outputW; x++) {
            // Use pre-computed trig values
            const px = Math.floor(cx + r * cosTable[x]);
            const py = Math.floor(cy + r * sinTable[x]);

            let val = 0;
            if (px >= 0 && px < w && py >= 0 && py < h) {
                val = mag[py * w + px];
            }

            let t = val / maxVal;
            t = Math.pow(t, 0.8);
            const c = getMagmaColor(t);

            const idx = ((outputH - 1 - y) * outputW + x) * 4;
            imgData[idx] = c.r;
            imgData[idx + 1] = c.g;
            imgData[idx + 2] = c.b;
            imgData[idx + 3] = 255;
        }
    }

    const elapsed = performance.now() - startTime;
    console.log(`[WORKER] Polar plot: ${elapsed.toFixed(1)}ms`);

    return {
        imageData: imgData,
        maxVal: maxVal
    };
}

// ============================================
// SMOOTH AZIMUTHAL DATA
// ============================================
function smoothAzimuthal(data) {
    const smoothed = [];
    for (let i = 0; i < 360; i++) {
        let s = 0;
        for (let j = -2; j <= 2; j++) {
            s += data[(i + j + 360) % 360];
        }
        smoothed.push(s / 5);
    }
    return smoothed;
}

// ============================================
// MESSAGE HANDLER
// ============================================
self.onmessage = function(e) {
    const { type, mag, w, h, outputW, outputH } = e.data;

    try {
        switch (type) {
            case 'computeMetrics':
                const metrics = computeMetricsCombined(mag, w, h);
                self.postMessage({
                    type: 'metricsComplete',
                    azimuthal: metrics.azimuthal,
                    radial: metrics.radial,
                    smoothedAzimuthal: smoothAzimuthal(metrics.azimuthal),
                    scanTime: metrics.scanTime
                });
                break;

            case 'computePolar':
                const polar = computePolarPlot(mag, w, h, outputW, outputH);
                self.postMessage({
                    type: 'polarComplete',
                    imageData: polar.imageData,
                    maxVal: polar.maxVal,
                    outputW: outputW,
                    outputH: outputH
                });
                break;

            default:
                console.warn('[WORKER] Unknown message type:', type);
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            error: error.message,
            stack: error.stack
        });
    }
};

console.log('[WORKER] Graph processor worker loaded');
