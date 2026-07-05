// ============================================
// AI Image Detector
// ============================================
// FFT noise-frequency analysis for spotting periodic
// upsampling artifacts in generated images.
//
// Theme handling comes from js/shared.js (ThemeManager);
// this module only owns the analysis pipeline and canvases.
// Pure math helpers are exposed on window.AiImageDetector
// for the Playwright spec.
// ============================================

// Largest dimension fed to the FFT. Bigger inputs are downscaled
// (WASM path) or padded up to at most this power of two (JS path)
// to keep peak memory in the hundreds of MB, not GB.
const MAX_ANALYSIS_DIM = 4096;
const LIMIT_BYTES = 10 * 1024 * 1024;

const UI = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    fftLoader: document.getElementById('fftLoader'),
    progressBar: document.getElementById('progressBar'),
    statusText: document.getElementById('statusText'),
    imgInfo: document.getElementById('imgInfo'),
    sourceCanvas: document.getElementById('sourceCanvas'),
    fftCanvas: document.getElementById('fftCanvas'),
    polarCanvas: document.getElementById('polarCanvas'),
    azimuthalCanvas: document.getElementById('azimuthalCanvas'),
    radialCanvas: document.getElementById('radialCanvas'),
    signalSelect: document.getElementById('signalSelect'),
    channelSelect: document.getElementById('channelSelect'),
    fftSizeSelect: document.getElementById('fftSizeSelect'),
    fftEngineSelect: document.getElementById('fftEngineSelect'),
    windowCheck: document.getElementById('windowCheck'),
    logScaleCheck: document.getElementById('logScaleCheck'),
    sourceContainer: document.getElementById('sourceContainer'),
    fftContainer: document.getElementById('fftContainer'),
    engineStatus: document.getElementById('engineStatus'),
    statusDot: null,
    statusTextEl: null,
    fftTime: document.getElementById('fftTime'),
    scoreValue: document.getElementById('scoreValue'),
    scoreBand: document.getElementById('scoreBand')
};

UI.statusDot = UI.engineStatus?.querySelector('.status-dot');
UI.statusTextEl = UI.engineStatus?.querySelector('.status-text');

const CTX = {
    src: UI.sourceCanvas.getContext('2d'),
    fft: UI.fftCanvas.getContext('2d'),
    polar: UI.polarCanvas.getContext('2d'),
    azimuthal: UI.azimuthalCanvas.getContext('2d'),
    radial: UI.radialCanvas.getContext('2d')
};

let currentImage = null;
let currentName = '';

let config = {
    fftSize: 0, // 0 = native
    signal: 'laplacian',
    channel: 'blue',
    window: false,
    log: false,
    fftEngine: 'auto'
};

// Last analysis results, kept so resize and worker-failure
// fallbacks can redraw without recomputing the FFT.
const cache = {
    magVis: null,
    magLinear: null,
    w: 0,
    h: 0,
    azimuthalVis: null,
    radial: null
};

// ================= WASM FFT Engine =================

let wasmApi = null;
let wasmAvailable = false;

async function initWasmFft() {
    if (wasmApi) return wasmApi;

    const startTime = performance.now();
    try {
        const baseUrl = new URL('.', import.meta.url).href;
        const wrapperUrl = new URL('WASM/ai_image_detection_fft_wasm.js', baseUrl);
        const wasmBinUrl = new URL('WASM/ai_image_detection_fft_wasm_bg.wasm', baseUrl);

        const mod = await import(wrapperUrl.toString());
        const init = mod.default;

        const resp = await fetch(wasmBinUrl.toString());
        if (!resp.ok) throw new Error(`Failed to fetch WASM: ${resp.status}`);

        const bytes = await resp.arrayBuffer();
        await init({ module_or_path: bytes });

        wasmApi = mod;
        wasmAvailable = true;
        console.log(`WASM FFT loaded in ${(performance.now() - startTime).toFixed(0)}ms`);
        updateEngineStatus(getEffectiveEngine());
        return mod;
    } catch (e) {
        wasmAvailable = false;
        console.warn('WASM FFT not available:', e.message);
        updateEngineStatus('js');
        return null;
    }
}

function updateEngineStatus(engine) {
    if (!UI.statusDot || !UI.statusTextEl) return;
    UI.statusDot.className = 'status-dot';
    if (engine === 'wasm') {
        UI.statusDot.classList.add('active-wasm');
        UI.statusTextEl.textContent = 'Rust/WASM';
    } else if (engine === 'js') {
        UI.statusDot.classList.add('active-js');
        UI.statusTextEl.textContent = 'JavaScript';
    } else {
        UI.statusTextEl.textContent = 'Initializing...';
    }
}

function getEffectiveEngine() {
    const selection = UI.fftEngineSelect?.value || 'auto';
    if (selection === 'wasm' && wasmAvailable) return 'wasm';
    if (selection === 'auto' && wasmAvailable) return 'wasm';
    return 'js';
}

async function performFft(inputData, width, height) {
    const engine = getEffectiveEngine();
    const startTime = performance.now();
    updateEngineStatus(engine);

    let result;
    if (engine === 'wasm' && wasmApi) {
        const output = wasmApi.compute_fft_2d_centered(new Float32Array(inputData), width, height);
        result = new Float32Array(output);
    } else {
        result = jsFftMagnitudesCentered(inputData, width, height);
    }

    const fftTime = performance.now() - startTime;
    if (UI.fftTime) {
        UI.fftTime.textContent = `${fftTime.toFixed(0)}ms (${engine.toUpperCase()})`;
    }
    console.log(`[FFT] ${engine.toUpperCase()} ${width}x${height}: ${fftTime.toFixed(1)}ms`);
    return result;
}

// ================= Graph worker =================

let graphWorker = null;

function initGraphWorker() {
    if (graphWorker) return;
    try {
        const workerUrl = new URL('graph-processor-worker.js', new URL('.', import.meta.url)).toString();
        graphWorker = new Worker(workerUrl);
        graphWorker.onmessage = handleWorkerMessage;
        graphWorker.onerror = (e) => {
            console.error('[WORKER] Error, falling back to main thread:', e.message);
            graphWorker = null;
            mainThreadMetrics();
            mainThreadPolar();
        };
    } catch (e) {
        console.warn('[WORKER] Failed to initialize worker:', e.message);
        graphWorker = null;
    }
}

function handleWorkerMessage(e) {
    const { type, imageData, azimuthal, radialVis, smoothedAzimuthalVis, scanTime, error, outputW, outputH } = e.data;

    switch (type) {
        case 'metricsComplete':
            console.log(`[WORKER] Metrics computed in ${scanTime.toFixed(1)}ms`);
            cache.azimuthalVis = smoothedAzimuthalVis;
            cache.radial = radialVis;
            drawAzimuthalGraph(smoothedAzimuthalVis);
            drawRadialGraph(radialVis);
            updateScore(computeGridScore(azimuthal));
            break;

        case 'polarComplete':
            if (outputW && outputH) {
                const canvas = UI.polarCanvas;
                if (canvas.width !== outputW || canvas.height !== outputH) {
                    canvas.width = outputW;
                    canvas.height = outputH;
                }
                CTX.polar.putImageData(new ImageData(imageData, outputW, outputH), 0, 0);
            }
            break;

        case 'error':
            console.error('[WORKER] Worker error, recomputing on main thread:', error);
            mainThreadMetrics();
            break;
    }
}

// Recompute graphs and score from cached FFT output when the worker dies.
function mainThreadMetrics() {
    if (!cache.magLinear) return;
    const azLinear = computeAzimuthal(cache.magLinear, cache.w, cache.h);
    const azVis = computeAzimuthal(cache.magVis, cache.w, cache.h);
    cache.azimuthalVis = smoothCircular(azVis, 2);
    cache.radial = computeRadial(cache.magVis, cache.w, cache.h);
    drawAzimuthalGraph(cache.azimuthalVis);
    drawRadialGraph(cache.radial);
    updateScore(computeGridScore(azLinear));
}

function mainThreadPolar() {
    if (!cache.magVis) return;
    drawPolarPlotMain(cache.magVis, cache.w, cache.h);
}

// ================= Init =================

async function init() {
    bindEvents();
    setupViewport(UI.sourceContainer, UI.sourceCanvas);
    resizeGraphs();
    window.addEventListener('resize', () => {
        resizeGraphs();
        viewport.redraw?.();
    });

    window.AiImageDetector.wasmReady = initWasmFft();
    initGraphWorker();
}

function bindEvents() {
    UI.dropZone.addEventListener('click', () => UI.fileInput.click());
    UI.dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            UI.fileInput.click();
        }
    });
    UI.fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

    UI.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); UI.dropZone.classList.add('dragover'); });
    UI.dropZone.addEventListener('dragleave', () => UI.dropZone.classList.remove('dragover'));
    UI.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        UI.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    const refresh = () => { if (currentImage) runAnalysis(); };

    UI.signalSelect.addEventListener('change', (e) => { config.signal = e.target.value; refresh(); });
    UI.channelSelect.addEventListener('change', (e) => { config.channel = e.target.value; refresh(); });
    UI.fftSizeSelect.addEventListener('change', (e) => {
        config.fftSize = e.target.value === 'native' ? 0 : parseInt(e.target.value);
        refresh();
    });
    UI.windowCheck.addEventListener('change', (e) => { config.window = e.target.checked; refresh(); });
    UI.logScaleCheck.addEventListener('change', (e) => { config.log = e.target.checked; refresh(); });
    UI.fftEngineSelect?.addEventListener('change', (e) => {
        config.fftEngine = e.target.value;
        updateEngineStatus(getEffectiveEngine());
        refresh();
    });

    document.querySelectorAll('.template-btn[data-template]').forEach(btn => {
        btn.addEventListener('click', () => loadTemplate(btn.dataset.template));
    });

    const viewLicensesBtn = document.getElementById('viewLicenses');
    const attributionsModal = document.getElementById('attributionsModal');
    const closeAttributions = document.getElementById('closeAttributions');
    if (viewLicensesBtn && attributionsModal && closeAttributions) {
        viewLicensesBtn.addEventListener('click', () => attributionsModal.classList.add('active'));
        closeAttributions.addEventListener('click', () => attributionsModal.classList.remove('active'));
        attributionsModal.addEventListener('click', (e) => {
            if (e.target === attributionsModal) attributionsModal.classList.remove('active');
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') attributionsModal.classList.remove('active');
        });
    }
}

function resizeGraphs() {
    [UI.polarCanvas, UI.azimuthalCanvas, UI.radialCanvas].forEach(c => {
        if (c.parentElement) {
            c.width = c.parentElement.offsetWidth;
            c.height = c.parentElement.offsetHeight;
        }
    });
    if (!currentImage || !cache.magVis) return;

    if (graphWorker) {
        graphWorker.postMessage({
            type: 'computePolar',
            mag: cache.magVis,
            w: cache.w,
            h: cache.h,
            outputW: UI.polarCanvas.width,
            outputH: UI.polarCanvas.height
        });
    } else {
        mainThreadPolar();
    }
    if (cache.azimuthalVis) drawAzimuthalGraph(cache.azimuthalVis);
    if (cache.radial) drawRadialGraph(cache.radial);
}

// ================= File Handling =================

function showError(msg) {
    console.error(msg);
    UI.fftLoader.style.display = 'none';
    UI.imgInfo.textContent = msg;
}

function handleFile(file) {
    if (!file) return;
    if (file.size > LIMIT_BYTES) {
        showError(`File too large: ${(file.size / (1024 * 1024)).toFixed(1)}MB (limit ${LIMIT_BYTES / (1024 * 1024)}MB)`);
        return;
    }
    const reader = new FileReader();
    UI.fftLoader.style.display = 'flex';
    UI.statusText.textContent = 'LOADING...';
    reader.onload = (e) => processImage(e.target.result, file.name);
    reader.readAsDataURL(file);
}

function loadTemplate(path) {
    const name = path.startsWith('data:') ? 'generated image' : path.split('/').pop();
    UI.fftLoader.style.display = 'flex';
    UI.statusText.textContent = 'DOWNLOADING...';
    processImage(path, name);
}
// Kept on window for scripted use (specs, console experiments).
window.loadTemplate = loadTemplate;

function processImage(src, name) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
        currentImage = img;
        currentName = name;
        UI.imgInfo.textContent = `${name} (${img.width}x${img.height})`;
        viewport.reset();
        runAnalysis();
    };
    img.onerror = () => showError(`Failed to load image: ${name}`);
    img.src = src;
}

// ================= Analysis Logic =================

function isPow2(n) {
    return n > 0 && (n & (n - 1)) === 0;
}

// Pick FFT dimensions for the current image, engine, and size setting.
function analysisDims(engine) {
    if (config.fftSize !== 0) return { w: config.fftSize, h: config.fftSize };
    if (engine === 'wasm') {
        // rustfft takes arbitrary sizes; only downscale to bound memory.
        const scale = Math.min(1, MAX_ANALYSIS_DIM / Math.max(currentImage.width, currentImage.height));
        return {
            w: Math.max(2, Math.round(currentImage.width * scale)),
            h: Math.max(2, Math.round(currentImage.height * scale))
        };
    }
    // The JS Cooley-Tukey path needs powers of two; use a square.
    const maxDim = Math.max(currentImage.width, currentImage.height);
    let p2 = 512;
    while (p2 < maxDim && p2 < MAX_ANALYSIS_DIM) p2 *= 2;
    return { w: p2, h: p2 };
}

async function runAnalysis() {
    if (!currentImage) return;

    const engine = getEffectiveEngine();
    const { w, h } = analysisDims(engine);

    const native = `${currentImage.width}x${currentImage.height}`;
    const analyzed = `${w}x${h}`;
    UI.imgInfo.textContent = `${currentName} (${native})` + (analyzed !== native ? `, analyzed at ${analyzed}` : '');

    UI.statusText.textContent = `PROCESSING (${analyzed})...`;
    UI.progressBar.value = 20;
    UI.fftLoader.style.display = 'flex';

    // Let the loader paint before the heavy synchronous work starts.
    setTimeout(async () => {
        try {
            const data = extractData(w, h);
            UI.progressBar.value = 50;

            const magLinear = await performFft(data, w, h);
            UI.progressBar.value = 70;

            const magVis = new Float32Array(magLinear.length);
            for (let i = 0; i < magLinear.length; i++) {
                magVis[i] = config.log ? Math.log(1 + magLinear[i]) : magLinear[i];
            }

            cache.magVis = magVis;
            cache.magLinear = magLinear;
            cache.w = w;
            cache.h = h;

            drawSpectrogram(magVis, w, h);

            if (graphWorker) {
                graphWorker.postMessage({
                    type: 'computePolar',
                    mag: magVis,
                    w, h,
                    outputW: UI.polarCanvas.parentElement.offsetWidth,
                    outputH: UI.polarCanvas.parentElement.offsetHeight
                });
                graphWorker.postMessage({
                    type: 'computeMetrics',
                    mag: magLinear,
                    w, h,
                    log: config.log
                });
            } else {
                mainThreadPolar();
                mainThreadMetrics();
            }

            UI.progressBar.value = 100;
        } catch (e) {
            console.error(e);
            showError('Analysis failed: ' + e.message);
        } finally {
            setTimeout(() => UI.fftLoader.style.display = 'none', 100);
        }
    }, 50);
}

function extractData(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(currentImage, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    return prepareSignal(pixels, w, h, config);
}

// Channel extraction, optional Laplacian high-pass, optional Hanning window.
// Pure: takes RGBA pixel data, returns the Float32Array fed to the FFT.
function prepareSignal(pixels, w, h, opts = {}) {
    const channel = opts.channel || 'blue';
    const signal = opts.signal || 'laplacian';
    const useWindow = !!opts.window;
    const input = new Float32Array(w * h);

    let cIdx = 2;
    if (channel === 'red') cIdx = 0;
    if (channel === 'green') cIdx = 1;
    const useLuma = channel === 'luma';

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            input[y * w + x] = useLuma
                ? (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114)
                : pixels[i + cIdx];
        }
    }

    if (signal === 'laplacian') {
        const temp = new Float32Array(input);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = y * w + x;
                const surround = temp[idx - 1] + temp[idx + 1] + temp[idx - w] + temp[idx + w] +
                                 temp[idx - w - 1] + temp[idx - w + 1] + temp[idx + w - 1] + temp[idx + w + 1];
                input[idx] = temp[idx] * 8 - surround;
            }
        }
        // The kernel cannot reach the border, so those pixels would keep
        // their raw 0..255 intensities next to a zero-centered interior.
        // That bright frame puts a huge fake cross on the FFT axes, which
        // is exactly where the grid score looks. Zero it out.
        for (let x = 0; x < w; x++) {
            input[x] = 0;
            input[(h - 1) * w + x] = 0;
        }
        for (let y = 0; y < h; y++) {
            input[y * w] = 0;
            input[y * w + w - 1] = 0;
        }
    }

    if (useWindow) {
        for (let y = 0; y < h; y++) {
            const wy = 0.5 * (1 - Math.cos((2 * Math.PI * y) / (h - 1)));
            for (let x = 0; x < w; x++) {
                const wx = 0.5 * (1 - Math.cos((2 * Math.PI * x) / (w - 1)));
                input[y * w + x] *= wx * wy;
            }
        }
    }
    return input;
}

// ================= Visualization =================

// Deterministic sample of up to ~10k values, used for percentile
// normalization without sorting the full array.
function sampleValues(arr, count = 10000) {
    const stride = Math.max(1, Math.floor(arr.length / count));
    const sample = [];
    for (let i = 0; i < arr.length; i += stride) sample.push(arr[i]);
    sample.sort((a, b) => a - b);
    return sample;
}

function drawSpectrogram(mag, w, h) {
    const sample = sampleValues(mag);
    const min = sample[0];
    const p99 = sample[Math.floor(sample.length * 0.99)] || 1;

    UI.fftCanvas.width = w;
    UI.fftCanvas.height = h;
    const imgData = CTX.fft.createImageData(w, h);
    const d = imgData.data;

    const range = (p99 - min) || 1;
    for (let i = 0; i < mag.length; i++) {
        let t = (mag[i] - min) / range;
        if (t > 1) t = 1;
        if (t < 0) t = 0;
        const c = getMagmaColor(t);
        d[i * 4] = c.r; d[i * 4 + 1] = c.g; d[i * 4 + 2] = c.b; d[i * 4 + 3] = 255;
    }
    CTX.fft.putImageData(imgData, 0, 0);

    CTX.fft.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    CTX.fft.lineWidth = 1;
    CTX.fft.strokeRect(0, 0, w, h);
}

function drawPolarPlotMain(mag, w, h) {
    const canvas = UI.polarCanvas;
    const targetW = canvas.parentElement.offsetWidth;
    const targetH = canvas.parentElement.offsetHeight;
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }

    const outputW = canvas.width;
    const outputH = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) / 2;

    const sample = sampleValues(mag, 2000);
    const maxVal = sample[sample.length - 1] || 1;

    const imgData = CTX.polar.createImageData(outputW, outputH);
    const d = imgData.data;

    for (let y = 0; y < outputH; y++) {
        const r = (y / outputH) * maxR;
        for (let x = 0; x < outputW; x++) {
            const theta = (x / outputW) * Math.PI * 2;
            const px = Math.floor(cx + r * Math.cos(theta));
            const py = Math.floor(cy + r * Math.sin(theta));

            let val = 0;
            if (px >= 0 && px < w && py >= 0 && py < h) val = mag[py * w + px];

            const t = Math.pow(Math.min(1, val / maxVal), 0.8);
            const c = getMagmaColor(t);
            const idx = ((outputH - 1 - y) * outputW + x) * 4;
            d[idx] = c.r; d[idx + 1] = c.g; d[idx + 2] = c.b; d[idx + 3] = 255;
        }
    }
    CTX.polar.putImageData(imgData, 0, 0);
}

// Mean power per whole degree over the mid-frequency annulus
// (0.25 to 0.45 of the half-size). Pure.
function computeAzimuthal(mag, w, h) {
    const bins = 360;
    const sums = new Float32Array(bins);
    const counts = new Uint32Array(bins);
    const cx = w / 2;
    const cy = h / 2;
    const minRSq = Math.pow(Math.min(w, h) * 0.25, 2);
    const maxRSq = Math.pow(Math.min(w, h) * 0.45, 2);

    for (let y = 0; y < h; y++) {
        const dy = y - cy;
        for (let x = 0; x < w; x++) {
            const dx = x - cx;
            const distSq = dx * dx + dy * dy;
            if (distSq >= minRSq && distSq < maxRSq) {
                let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                if (angle < 0) angle += 360;
                const b = Math.floor(angle) % 360;
                sums[b] += mag[y * w + x];
                counts[b]++;
            }
        }
    }

    const data = [];
    for (let i = 0; i < bins; i++) data.push(counts[i] ? sums[i] / counts[i] : 0);
    return data;
}

// Mean power per integer radius from the spectrum center. Pure.
function computeRadial(mag, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.ceil(Math.sqrt(cx * cx + cy * cy));
    const sums = new Float32Array(maxR);
    const counts = new Uint32Array(maxR);

    for (let y = 0; y < h; y++) {
        const dy = y - cy;
        for (let x = 0; x < w; x++) {
            const dx = x - cx;
            const r = Math.floor(Math.sqrt(dx * dx + dy * dy));
            if (r < maxR) {
                sums[r] += mag[y * w + x];
                counts[r]++;
            }
        }
    }

    const profile = [];
    for (let r = 1; r < maxR; r++) {
        if (counts[r]) profile.push(sums[r] / counts[r]);
    }
    return profile;
}

function smoothCircular(data, radius) {
    const n = data.length;
    const out = [];
    const span = radius * 2 + 1;
    for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = -radius; j <= radius; j++) s += data[(i + j + n) % n];
        out.push(s / span);
    }
    return out;
}

const GRAPH_FONT = 'bold 11px JetBrains Mono';

function graphPadLeft(ctx, labels) {
    ctx.font = GRAPH_FONT;
    let widest = 0;
    for (const l of labels) widest = Math.max(widest, ctx.measureText(l).width);
    return Math.ceil(widest) + 14;
}

function drawAzimuthalGraph(data) {
    const ctx = CTX.azimuthal;
    const canvas = UI.azimuthalCanvas;
    const targetW = canvas.parentElement.offsetWidth;
    const targetH = canvas.parentElement.offsetHeight;
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const maxLabel = formatNumber(max);
    const minLabel = formatNumber(min);
    const padTop = 25;
    const padBottom = 25;
    const padLeft = graphPadLeft(ctx, [maxLabel, minLabel]);
    const graphWidth = w - padLeft - 10;
    const graphHeight = h - padTop - padBottom;

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#f59e0b';
    ctx.font = GRAPH_FONT;
    ctx.textAlign = 'center';
    [0, 90, 180, 270].forEach(d => {
        const x = padLeft + (d / 360) * graphWidth;
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, h - padBottom);
        ctx.stroke();
        ctx.fillText(d + '°', x, h - 8);
    });

    ctx.textAlign = 'right';
    ctx.fillText(maxLabel, padLeft - 8, padTop + 5);
    ctx.fillText(minLabel, padLeft - 8, h - padBottom + 5);

    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    for (let i = 0; i < 360; i++) {
        const x = padLeft + (i / 360) * graphWidth;
        const y = padTop + (1 - (data[i] - min) / range) * graphHeight;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function drawRadialGraph(data) {
    const ctx = CTX.radial;
    const canvas = UI.radialCanvas;
    const targetW = canvas.parentElement.offsetWidth;
    const targetH = canvas.parentElement.offsetHeight;
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!data.length) return;

    const maxLogR = Math.log(data.length);
    const minV = Math.min(...data);
    const maxV = Math.max(...data);
    const range = maxV - minV || 1;
    const maxLabel = formatNumber(maxV);
    const minLabel = formatNumber(minV);

    const padTop = 30;
    const padBottom = 35;
    const padLeft = graphPadLeft(ctx, [maxLabel, minLabel]);
    const graphHeight = h - padTop - padBottom;
    const graphWidth = w - padLeft - 10;

    ctx.fillStyle = '#f59e0b';
    ctx.font = GRAPH_FONT;
    ctx.textAlign = 'right';
    ctx.fillText(maxLabel, padLeft - 8, padTop + 5);
    ctx.fillText(minLabel, padLeft - 8, h - padBottom + 5);
    ctx.textAlign = 'left';
    ctx.fillText('1px', padLeft, h - 10);
    ctx.textAlign = 'right';
    ctx.fillText(formatNumber(data.length) + 'px', w - 4, h - 10);

    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    for (let i = 0; i < data.length; i++) {
        const x = padLeft + (Math.log(i + 1) / maxLogR) * graphWidth;
        const y = (h - padBottom) - ((data[i] - minV) / range) * graphHeight;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toFixed(1);
}

// ================= Grid score =================

// Ratio of the sharpest cardinal-angle peak to its local baseline in the
// azimuthal profile. Returns 0 when there is no usable baseline. Pure.
function computeGridScore(data) {
    const getPeak = (deg) => {
        let p = 0;
        for (let i = -2; i <= 2; i++) {
            const idx = (deg + i + 360) % 360;
            if (data[idx] > p) p = data[idx];
        }
        return p;
    };
    const getLocalAvg = (deg) => {
        let sum = 0;
        let c = 0;
        for (let i = -15; i <= 15; i++) {
            if (Math.abs(i) < 4) continue;
            const idx = (deg + i + 360) % 360;
            sum += data[idx];
            c++;
        }
        return sum / c;
    };

    let ratio = 0;
    for (const deg of [0, 90, 180, 270]) {
        const base = getLocalAvg(deg);
        if (base > 0) ratio = Math.max(ratio, getPeak(deg) / base);
    }
    return isFinite(ratio) ? ratio : 0;
}

// Bands calibrated after the border fix: true noise and the bundled
// photo/AI templates sit at 1.1 to 1.4, while genuinely periodic
// content scores far higher (flatbed scan template ~23x, synthetic
// 3px stripes ~96x). Periodic does not mean AI: scanners, halftone
// print, and resampling all trip this too. Heuristic only.
function scoreBandLabel(ratio) {
    if (ratio <= 0) return 'No usable signal';
    if (ratio < 2) return 'No periodic grid detected';
    if (ratio < 4) return 'Weak periodic artifacts';
    return 'Strong periodic artifacts';
}

function updateScore(ratio) {
    console.log('Grid Prominence Score: ' + ratio.toFixed(2) + 'x');
    if (!UI.scoreValue || !UI.scoreBand) return;
    if (ratio <= 0) {
        UI.scoreValue.textContent = '--';
        UI.scoreBand.textContent = scoreBandLabel(ratio);
        return;
    }
    UI.scoreValue.textContent = ratio.toFixed(2) + 'x';
    UI.scoreBand.textContent = scoreBandLabel(ratio);
}

// ================= Source viewport =================

const viewport = {
    zoom: 1,
    panX: 0,
    panY: 0,
    redraw: null,
    reset: null
};

function setupViewport(container, canvas) {
    const ctx = canvas.getContext('2d');
    const redraw = () => {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!currentImage) return;
        const scale = Math.min(canvas.width / currentImage.width, canvas.height / currentImage.height);
        const w = currentImage.width * scale * viewport.zoom;
        const h = currentImage.height * scale * viewport.zoom;
        ctx.drawImage(currentImage, (canvas.width - w) / 2 + viewport.panX, (canvas.height - h) / 2 + viewport.panY, w, h);
    };
    viewport.redraw = redraw;
    viewport.reset = () => {
        viewport.zoom = 1;
        viewport.panX = 0;
        viewport.panY = 0;
        redraw();
    };

    let isDrag = false;
    let lx = 0;
    let ly = 0;
    container.addEventListener('mousedown', e => { isDrag = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', () => isDrag = false);
    window.addEventListener('mousemove', e => {
        if (!isDrag) return;
        viewport.panX += e.clientX - lx;
        viewport.panY += e.clientY - ly;
        lx = e.clientX;
        ly = e.clientY;
        redraw();
    });
    container.addEventListener('wheel', e => {
        e.preventDefault();
        viewport.zoom += e.deltaY > 0 ? -0.1 : 0.1;
        if (viewport.zoom < 0.1) viewport.zoom = 0.1;
        redraw();
    }, { passive: false });
}

function getMagmaColor(t) {
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    let r, g, b;
    if (t < 0.33) { const lt = t / 0.33; r = lerp(0, 63, lt); g = lerp(0, 15, lt); b = lerp(0, 114, lt); }
    else if (t < 0.66) { const lt = (t - 0.33) / 0.33; r = lerp(63, 252, lt); g = lerp(15, 103, lt); b = lerp(114, 93, lt); }
    else { const lt = (t - 0.66) / 0.34; r = lerp(252, 252, lt); g = lerp(103, 253, lt); b = lerp(93, 191, lt); }
    return { r, g, b };
}
function lerp(a, b, t) { return a + (b - a) * t; }

// ============================================
// FFT: Cooley-Tukey, power-of-2 sizes only
// ============================================

/**
 * 2D FFT as two passes of 1D FFTs (rows, then columns).
 * @param {Float32Array} re - real part, modified in place
 * @param {Float32Array} im - imaginary part, modified in place
 * @param {number} w - width, power of 2
 * @param {number} h - height, power of 2
 */
function fft2D(re, im, w, h) {
    for (let y = 0; y < h; y++) {
        const rowR = new Float32Array(w), rowI = new Float32Array(w);
        for (let x = 0; x < w; x++) { rowR[x] = re[y * w + x]; rowI[x] = im[y * w + x]; }
        fft1D(rowR, rowI, w);
        for (let x = 0; x < w; x++) { re[y * w + x] = rowR[x]; im[y * w + x] = rowI[x]; }
    }
    for (let x = 0; x < w; x++) {
        const colR = new Float32Array(h), colI = new Float32Array(h);
        for (let y = 0; y < h; y++) { colR[y] = re[y * w + x]; colI[y] = im[y * w + x]; }
        fft1D(colR, colI, h);
        for (let y = 0; y < h; y++) { re[y * w + x] = colR[y]; im[y * w + x] = colI[y]; }
    }
}

/**
 * 1D in-place Cooley-Tukey FFT (decimation in time).
 * Bit-reversal permutation first, then log2(n) butterfly stages.
 * @param {Float32Array} re - real part, modified in place
 * @param {Float32Array} im - imaginary part, modified in place
 * @param {number} n - transform length, power of 2
 */
function fft1D(re, im, n) {
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            let t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
        let k = n / 2;
        while (k <= j) { j -= k; k /= 2; }
        j += k;
    }

    let step = 1;
    while (step < n) {
        const jump = step * 2;
        const dt = -Math.PI / step;
        let wr = 1, wi = 0;
        const wsr = Math.cos(dt), wsi = Math.sin(dt);
        for (let s = 0; s < step; s++) {
            for (let i = s; i < n; i += jump) {
                const j2 = i + step;
                const tr = wr * re[j2] - wi * im[j2];
                const ti = wr * im[j2] + wi * re[j2];
                re[j2] = re[i] - tr; im[j2] = im[i] - ti;
                re[i] += tr; im[i] += ti;
            }
            const twr = wr * wsr - wi * wsi;
            wi = wr * wsi + wi * wsr;
            wr = twr;
        }
        step = jump;
    }
}

// Full JS pipeline: 2D FFT then centered linear power spectrum.
// Mirrors the WASM compute_fft_2d_centered output. Pure.
function jsFftMagnitudesCentered(input, w, h) {
    if (!isPow2(w) || !isPow2(h)) {
        throw new Error(`JS FFT requires power-of-2 dimensions, got ${w}x${h}`);
    }
    const len = w * h;
    const real = new Float32Array(input);
    const imag = new Float32Array(len);
    fft2D(real, imag, w, h);

    const magnitude = new Float32Array(len);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const sx = (x + w / 2) % w;
            const sy = (y + h / 2) % h;
            magnitude[sy * w + sx] = real[i] * real[i] + imag[i] * imag[i];
        }
    }
    return magnitude;
}

// ================= Test surface =================

window.AiImageDetector = {
    fft1D,
    fft2D,
    jsFftMagnitudesCentered,
    prepareSignal,
    computeAzimuthal,
    computeRadial,
    computeGridScore,
    smoothCircular,
    scoreBandLabel,
    getMagmaColor,
    formatNumber,
    isWasmReady: () => wasmAvailable,
    getWasmApi: () => wasmApi,
    wasmReady: null
};

init();
