// ============================================
// GRAPH PROCESSING WEB WORKER
// ============================================
// Heavy FFT post-processing off the main thread:
// - Polar spectrum unwrapping
// - Azimuthal angle profile (linear for scoring, display
//   series honoring the Visual Log Scale toggle)
// - Radial frequency falloff (display series)
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
// COMBINED SCAN: azimuthal + radial in one pass
// ============================================
// Accumulates two azimuthal series in the same O(w*h) sweep:
// linear power (scoring must never depend on the log toggle)
// and the display series (log-transformed per pixel when the
// Visual Log Scale toggle is on, matching the main-thread
// fallback path). The radial series is display-only.
// ============================================
function computeMetricsCombined(mag, w, h, useLog) {
    const startTime = performance.now();

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.ceil(Math.sqrt(cx * cx + cy * cy));

    const bins = 360;
    const azSumsLin = new Float32Array(bins);
    const azSumsVis = new Float32Array(bins);
    const azCounts = new Uint32Array(bins);
    const minR = Math.min(w, h) * 0.25;
    const maxRAzimuthal = Math.min(w, h) * 0.45;
    const minRSq = minR * minR;
    const maxRSq = maxRAzimuthal * maxRAzimuthal;

    const radialSums = new Float32Array(maxR);
    const radialCounts = new Uint32Array(maxR);

    const TO_DEG = 57.29577951308232;

    for (let y = 0; y < h; y++) {
        const dy = y - cy;
        const dySq = dy * dy;

        for (let x = 0; x < w; x++) {
            const dx = x - cx;
            const distSq = dx * dx + dySq;
            const v = mag[y * w + x];
            const vis = useLog ? Math.log(1 + v) : v;

            if (distSq >= minRSq && distSq < maxRSq) {
                let angle = Math.atan2(dy, dx) * TO_DEG;
                if (angle < 0) angle += 360;
                const b = Math.floor(angle) % 360;
                azSumsLin[b] += v;
                azSumsVis[b] += vis;
                azCounts[b]++;
            }

            const r = Math.floor(Math.sqrt(distSq));
            if (r < maxR) {
                radialSums[r] += vis;
                radialCounts[r]++;
            }
        }
    }

    const azimuthal = [];
    const azimuthalVis = [];
    for (let i = 0; i < bins; i++) {
        azimuthal.push(azCounts[i] ? azSumsLin[i] / azCounts[i] : 0);
        azimuthalVis.push(azCounts[i] ? azSumsVis[i] / azCounts[i] : 0);
    }

    const radialVis = [];
    for (let r = 1; r < maxR; r++) {
        if (radialCounts[r]) {
            radialVis.push(radialSums[r] / radialCounts[r]);
        }
    }

    const elapsed = performance.now() - startTime;
    console.log(`[WORKER] Combined metrics scan: ${elapsed.toFixed(1)}ms`);

    return {
        azimuthal: azimuthal,
        azimuthalVis: azimuthalVis,
        radialVis: radialVis,
        scanTime: elapsed
    };
}

// ============================================
// POLAR PLOT UNWRAPPING
// ============================================
function computePolarPlot(mag, w, h, outputW, outputH) {
    const startTime = performance.now();

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) / 2;

    // Deterministic strided max for normalization (the old random
    // sampling made the plot differ between runs of the same image).
    let maxVal = 0;
    const stride = Math.max(1, Math.floor(mag.length / 2000));
    for (let i = 0; i < mag.length; i += stride) {
        if (mag[i] > maxVal) maxVal = mag[i];
    }
    if (maxVal === 0) maxVal = 1;

    // Pre-compute trig values for each output column
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
            const px = Math.floor(cx + r * cosTable[x]);
            const py = Math.floor(cy + r * sinTable[x]);

            let val = 0;
            if (px >= 0 && px < w && py >= 0 && py < h) {
                val = mag[py * w + px];
            }

            let t = Math.min(1, val / maxVal);
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
    const { type, mag, w, h, log, outputW, outputH } = e.data;

    try {
        switch (type) {
            case 'computeMetrics': {
                const metrics = computeMetricsCombined(mag, w, h, !!log);
                self.postMessage({
                    type: 'metricsComplete',
                    azimuthal: metrics.azimuthal,
                    radialVis: metrics.radialVis,
                    smoothedAzimuthalVis: smoothAzimuthal(metrics.azimuthalVis),
                    scanTime: metrics.scanTime
                });
                break;
            }

            case 'computePolar': {
                const polar = computePolarPlot(mag, w, h, outputW, outputH);
                self.postMessage({
                    type: 'polarComplete',
                    imageData: polar.imageData,
                    maxVal: polar.maxVal,
                    outputW: outputW,
                    outputH: outputH
                });
                break;
            }

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
