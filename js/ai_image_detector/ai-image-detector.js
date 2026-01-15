// ============================================
// Theme Manager (Inline Fallback)
// ============================================
function initTheme() {
    const btns = document.querySelectorAll('[data-theme-toggle]');
    const html = document.documentElement;

    // Check stored preference
    const stored = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', stored);

    // Initialize aria-pressed state based on current theme
    btns.forEach(btn => {
        const mode = btn.dataset.themeToggle;
        btn.setAttribute('aria-pressed', mode === stored ? 'true' : 'false');

        btn.addEventListener('click', () => {
            const newMode = btn.dataset.themeToggle;
            html.setAttribute('data-theme', newMode);
            localStorage.setItem('theme', newMode);

            // Update aria-pressed for all buttons
            btns.forEach(b => {
                b.setAttribute('aria-pressed', b.dataset.themeToggle === newMode ? 'true' : 'false');
            });

            // Trigger redraw of canvases if needed (colors might change)
            if(typeof runAnalysis === 'function' && window.currentImage) {
                runAnalysis();
            }
        });
    });
}

// ============================================
// GRAPH PROCESSING WORKER
// ============================================
// Offloads heavy FFT post-processing to background thread
// Prevents UI blocking during graph generation
// ============================================
let graphWorker = null;

function initGraphWorker() {
    if (graphWorker) return; // Already initialized

    try {
        // Get base URL for worker resolution
        let baseUrl;
        try {
            baseUrl = new URL(".", import.meta.url).href;
        } catch (e) {
            const scriptPath = document.currentScript?.src ||
                               document.querySelector('script[src*="ai-image-detector"]')?.src ||
                               window.location.href;
            baseUrl = new URL(".", scriptPath).href;
        }

        const workerUrl = new URL("graph-processor-worker.js", baseUrl).toString();
        graphWorker = new Worker(workerUrl);

        graphWorker.onmessage = handleWorkerMessage;
        graphWorker.onerror = (e) => {
            console.error('[WORKER] Error:', e.message, e);
            // Fallback to main thread processing on worker error
            graphWorker = null;
        };

        console.log('[WORKER] Graph processor worker initialized');
    } catch (e) {
        console.warn('[WORKER] Failed to initialize worker:', e.message);
        graphWorker = null;
    }
}

function handleWorkerMessage(e) {
    const { type, imageData, azimuthal, radial, smoothedAzimuthal, maxVal, scanTime, error, outputW, outputH } = e.data;

    switch (type) {
        case 'metricsComplete':
            console.log(`[WORKER] Metrics computed in ${scanTime.toFixed(1)}ms`);
            // Cache the data for resize (no recalculation needed)
            window.lastAzimuthalData = smoothedAzimuthal;
            window.lastRadialData = radial;
            window.lastRawAzimuthalData = azimuthal; // For scoring
            drawAzimuthalGraph(smoothedAzimuthal);
            drawRadialGraph(radial);
            calculateScore(azimuthal);
            break;

        case 'polarComplete':
            // Render the polar plot from worker data
            const ctx = CTX.polar;
            const canvas = UI.polarCanvas;
            // Use the dimensions from worker response (matches canvas at time of request)
            if (outputW && outputH) {
                if (canvas.width !== outputW || canvas.height !== outputH) {
                    canvas.width = outputW;
                    canvas.height = outputH;
                }
                const imgData = new ImageData(imageData, outputW, outputH);
                ctx.putImageData(imgData, 0, 0);
            }
            break;

        case 'error':
            console.error('[WORKER] Worker error:', error);
            break;
    }
}

// ============================================
// AI Image Detector v29 - With WASM FFT Support
// ============================================

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
    statusDot: null, // Set after DOM query
    statusTextEl: null, // Set after DOM query
    fftTime: document.getElementById('fftTime')
};

// Set nested elements
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
// Window FALSE, Log FALSE
let config = {
    fftSize: 0, // 0=Native
    signal: 'laplacian',
    channel: 'blue',
    window: false,
    log: false,
    fftEngine: 'auto' // 'auto', 'wasm', 'js'
};
const LIMIT_BYTES = 5 * 1024 * 1024;

// ================= WASM FFT Engine =================

let wasmModule = null;
let wasmApi = null;
let wasmAvailable = false;
let wasmError = null;

async function initWasmFft() {
    if (wasmApi) return wasmApi; // Already loaded

    const startTime = performance.now();

    try {
        // Get base URL for module resolution
        let baseUrl;
        try {
            baseUrl = new URL(".", import.meta.url).href;
        } catch (e) {
            const scriptPath = document.currentScript?.src ||
                               document.querySelector('script[src*="ai-image-detector"]')?.src ||
                               window.location.href;
            baseUrl = new URL(".", scriptPath).href;
        }

        const wrapperUrl = new URL("WASM/ai_image_detection_fft_wasm.js", baseUrl);
        const wasmBinUrl = new URL("WASM/ai_image_detection_fft_wasm_bg.wasm", baseUrl);

        // Load the JS wrapper
        const mod = await import(wrapperUrl.toString());
        const init = mod.default;

        // Load and instantiate WASM
        const resp = await fetch(wasmBinUrl.toString(), { cache: "no-store" });
        if (!resp.ok) throw new Error(`Failed to fetch WASM: ${resp.status}`);

        const bytes = await resp.arrayBuffer();
        await init({ module_or_path: bytes });

        wasmApi = mod;
        wasmAvailable = true;

        const loadTime = (performance.now() - startTime).toFixed(0);
        console.log(`WASM FFT loaded in ${loadTime}ms`);

        updateEngineStatus('wasm');
        return mod;
    } catch (e) {
        wasmError = e;
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
    if (selection === 'js') return 'js';
    if (selection === 'auto') {
        return wasmAvailable ? 'wasm' : 'js';
    }
    return 'js'; // Fallback
}

async function performFft(inputData, width, height) {
    const engine = getEffectiveEngine();
    const startTime = performance.now();

    updateEngineStatus(engine);

    console.log(`[FFT] Engine: ${engine.toUpperCase()}, Size: ${width}x${height}`);

    let result;
    if (engine === 'wasm' && wasmApi) {
        result = await runWasmFft(inputData, width, height);
    } else {
        result = await runJsFft(inputData, width, height);
    }

    const fftTime = performance.now() - startTime;
    if (UI.fftTime) {
        UI.fftTime.textContent = `${fftTime.toFixed(0)}ms (${engine.toUpperCase()})`;
    }

    console.log(`[FFT] Complete: ${fftTime.toFixed(1)}ms`);
    return result;
}

async function runWasmFft(input, width, height) {
    // Convert regular array to Float32Array for WASM
    const convertStart = performance.now();
    const inputArray = new Float32Array(input);
    const convertTime = performance.now() - convertStart;

    // Call WASM FFT (centered output)
    const wasmStart = performance.now();
    const output = wasmApi.compute_fft_2d_centered(inputArray, width, height);
    const wasmTime = performance.now() - wasmStart;

    // Convert result back to regular array (usually no-op for WASM output)
    const result = new Float32Array(output);

    console.log(`[WASM] Data conversion: ${convertTime.toFixed(1)}ms, FFT computation: ${wasmTime.toFixed(1)}ms`);
    return result;
}

async function runJsFft(input, width, height) {
    const len = width * height;

    // Setup timing
    const setupStart = performance.now();
    const real = new Float32Array(input);
    const imag = new Float32Array(len).fill(0);
    const setupTime = performance.now() - setupStart;

    // FFT timing
    console.log(`[JS] Starting 2D FFT...`);
    const fftStart = performance.now();
    fft2D(real, imag, width, height);
    const fftTime = performance.now() - fftStart;

    // Magnitude + center shift timing
    const magStart = performance.now();
    const magnitude = new Float32Array(len);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            let mag = real[i] * real[i] + imag[i] * imag[i];

            // Center shift
            const sx = (x + width / 2) % width;
            const sy = (y + height / 2) % height;
            magnitude[sy * width + sx] = mag;
        }
    }
    const magTime = performance.now() - magStart;

    console.log(`[JS] Setup: ${setupTime.toFixed(1)}ms, FFT: ${fftTime.toFixed(1)}ms, Magnitude+Shift: ${magTime.toFixed(1)}ms`);
    return magnitude;
}

// ================= Init =================

async function init() {
    initTheme(); // Initialize theme logic
    bindEvents();
    setupViewport(UI.sourceContainer, UI.sourceCanvas);
    resizeGraphs();
    window.addEventListener('resize', resizeGraphs);

    // Initialize WASM FFT in background
    initWasmFft().then(() => {
        console.log('FFT engine ready');
    }).catch(e => {
        console.warn('WASM FFT initialization failed:', e);
        updateEngineStatus('js');
    });

    // Initialize graph processing worker
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
        e.preventDefault(); UI.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    const refresh = () => { if(currentImage) runAnalysis(); };

    UI.signalSelect.addEventListener('change', (e) => { config.signal = e.target.value; refresh(); });
    UI.channelSelect.addEventListener('change', (e) => { config.channel = e.target.value; refresh(); });
    UI.fftSizeSelect.addEventListener('change', (e) => {
        config.fftSize = e.target.value === 'native' ? 0 : parseInt(e.target.value);
        refresh();
    });
    UI.windowCheck.addEventListener('change', (e) => { config.window = e.target.checked; refresh(); });
    UI.logScaleCheck.addEventListener('change', (e) => { config.log = e.target.checked; refresh(); });

    // FFT Engine selector
    if (UI.fftEngineSelect) {
        UI.fftEngineSelect.addEventListener('change', (e) => {
            config.fftEngine = e.target.value;
            refresh();
        });
    }
}

function resizeGraphs() {
    // Use offsetWidth/Height for layout-computed dimensions
    [UI.polarCanvas, UI.azimuthalCanvas, UI.radialCanvas].forEach(c => {
        if(c.parentElement) {
            c.width = c.parentElement.offsetWidth;
            c.height = c.parentElement.offsetHeight;
        }
    });
    // Redraw graphs if we have current data
    if(currentImage && window.lastMagData) {
        const w = window.lastFFTWidth;
        const h = window.lastFFTHeight;
        const magVis = window.lastMagData;

        // Use worker if available
        if (graphWorker) {
            // Only recompute polar plot (resolution-dependent)
            const polarCanvas = UI.polarCanvas;
            graphWorker.postMessage({
                type: 'computePolar',
                mag: magVis,
                w: w,
                h: h,
                outputW: polarCanvas.width,
                outputH: polarCanvas.height
            });
        } else {
            // Fallback to main thread for polar only
            drawPolarPlotMain(magVis, w, h);
        }

        // Azimuthal and Radial data is already computed and cached
        // Just redraw the graphs (no recalculation needed)
        if (window.lastAzimuthalData) {
            drawAzimuthalGraph(window.lastAzimuthalData);
        }
        if (window.lastRadialData) {
            drawRadialGraph(window.lastRadialData);
        }
    }
}

// ================= File Handling =================

function handleFile(file) {
    if (!file) return;

    // Validate file size (5MB limit)
    if (file.size > LIMIT_BYTES) {
        alert(`File too large. Maximum size is ${LIMIT_BYTES / (1024 * 1024)}MB.\nYour file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`);
        return;
    }

    const reader = new FileReader();
    UI.fftLoader.style.display = 'flex';
    UI.statusText.textContent = "LOADING...";
    reader.onload = (e) => processImage(e.target.result, file.name);
    reader.readAsDataURL(file);
}

function loadTemplate(path) {
    const name = path.split('/').pop();
    UI.fftLoader.style.display = 'flex';
    UI.statusText.textContent = "DOWNLOADING...";
    processImage(path, name);
}
// Expose to global scope for inline onclick handlers
window.loadTemplate = loadTemplate;

function processImage(src, name) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
        currentImage = img;
        UI.imgInfo.textContent = `${name} (${img.width}x${img.height})`;
        fitImageToCanvas(img, UI.sourceCanvas, CTX.src);
        runAnalysis();
    };
    img.onerror = () => {
        UI.fftLoader.style.display = 'none';
        alert("Failed to load image");
    };
    img.src = src;
}

function fitImageToCanvas(img, canvas, ctx) {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    const scale = Math.min(canvas.width/img.width, canvas.height/img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (canvas.width - w)/2;
    const y = (canvas.height - h)/2;
    ctx.clearRect(0,0,canvas.width, canvas.height);
    ctx.drawImage(img, x, y, w, h);
}

// ================= Analysis Logic =================

async function runAnalysis() {
    if (!currentImage) return;

    const pipelineStart = performance.now();
    console.log('=== FFT ANALYSIS PIPELINE START ===');

    let w, h;
    if (config.fftSize === 0) {
        // Native size behavior depends on FFT engine
        const engine = getEffectiveEngine();
        if (engine === 'wasm' && wasmAvailable) {
            // WASM FFT can handle any dimensions - use native image size
            w = currentImage.width;
            h = currentImage.height;
        } else {
            // JS FFT requires power-of-2 for Cooley-Tukey algorithm
            // Use square for simplicity (separable 2D FFT works with rectangular too)
            const maxDim = Math.max(currentImage.width, currentImage.height);
            let p2 = 512;
            while (p2 < maxDim && p2 < 8192) p2 *= 2;
            w = h = p2;
        }
    } else { w = h = config.fftSize; }

    console.log(`[SETUP] Input: ${currentImage.width}x${currentImage.height} → FFT: ${w}x${h} (${(w*h).toLocaleString()} pixels)`);
    console.log(`[SETUP] Signal: ${config.signal}, Channel: ${config.channel}, Window: ${config.window}`);

    UI.statusText.textContent = `PROCESSING (${w}x${h})...`;
    UI.progressBar.value = 20;
    UI.fftLoader.style.display = 'flex';

    setTimeout(async () => {
        try {
            // Extract data timing
            const extractStart = performance.now();
            const data = extractData(w, h);
            const extractTime = performance.now() - extractStart;
            console.log(`[EXTRACT] Channel extraction + filtering: ${extractTime.toFixed(1)}ms`);
            UI.progressBar.value = 50;

            // FFT timing
            console.log(`[FFT] Starting ${getEffectiveEngine().toUpperCase()} FFT...`);
            const magLinear = await performFft(data, w, h);
            UI.progressBar.value = 70;

            // Log scaling timing
            const logStart = performance.now();
            const magVis = new Float32Array(magLinear.length);
            for(let i=0; i<magLinear.length; i++) {
                magVis[i] = config.log ? Math.log(1 + magLinear[i]) : magLinear[i];
            }
            const logTime = performance.now() - logStart;
            console.log(`[POST-FFT] Log scaling preparation: ${logTime.toFixed(1)}ms`);

            // Store for resize redraw
            window.lastMagData = magVis;
            window.lastMagLinear = magLinear;
            window.lastFFTWidth = w;
            window.lastFFTHeight = h;

            // Visualization - Spectrogram (still on main thread, it's fast)
            drawSpectrogram(magVis, w, h);

            // Use Web Worker for heavy computations if available
            if (graphWorker) {
                // Send polar plot computation to worker
                const polarCanvas = UI.polarCanvas;
                const targetW = polarCanvas.parentElement.offsetWidth;
                const targetH = polarCanvas.parentElement.offsetHeight;

                graphWorker.postMessage({
                    type: 'computePolar',
                    mag: magVis,
                    w: w,
                    h: h,
                    outputW: targetW,
                    outputH: targetH
                });

                // Send metrics computation to worker (use linear data for scoring)
                graphWorker.postMessage({
                    type: 'computeMetrics',
                    mag: magLinear,
                    w: w,
                    h: h
                });
            } else {
                // Fallback to main thread processing
                console.warn('[MAIN] Worker not available, using main thread');
                drawPolarPlotMain(magVis, w, h);
                const azDataLinear = computeAzimuthalMain(magLinear, w, h, false);
                calculateScore(azDataLinear);
                const azDataVis = computeAzimuthalMain(magVis, w, h, true);
                const radialData = computeRadialMain(magVis, w, h);

                // Cache data for resize (no recalculation needed)
                window.lastRawAzimuthalData = azDataLinear;
                // Compute smoothed version for caching
                const smoothed = [];
                for(let i=0; i<360; i++) {
                    let s=0; for(let j=-2; j<=2; j++) s+=azDataVis[(i+j+360)%360];
                    smoothed.push(s/5);
                }
                window.lastAzimuthalData = smoothed;
                window.lastRadialData = radialData;
            }

            const totalTime = performance.now() - pipelineStart;
            console.log(`[MAIN] Pipeline dispatch complete: ${totalTime.toFixed(1)}ms`);

            UI.progressBar.value = 100;
        } catch (e) {
            console.error(e);
            alert("Analysis failed. Check console.");
        } finally {
            setTimeout(() => UI.fftLoader.style.display = 'none', 100);
        }
    }, 50);
}

function extractData(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(currentImage, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const len = w * h;
    const input = new Float32Array(len);

    let cIdx = 2; // Blue
    if(config.channel === 'red') cIdx = 0;
    if(config.channel === 'green') cIdx = 1;
    const useLuma = config.channel === 'luma';

    const winX = new Float32Array(w);
    const winY = new Float32Array(h);
    if (config.window) {
        for(let i=0; i<w; i++) winX[i] = 0.5 * (1 - Math.cos((2*Math.PI*i)/(w-1)));
        for(let i=0; i<h; i++) winY[i] = 0.5 * (1 - Math.cos((2*Math.PI*i)/(h-1)));
    }

    for(let y=0; y<h; y++) {
        for(let x=0; x<w; x++) {
            const i = (y*w + x) * 4;
            let val = useLuma ? (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114) : d[i+cIdx];
            input[y*w + x] = val;
        }
    }

    if (config.signal === 'laplacian') {
        const temp = new Float32Array(input);
        for(let y=1; y<h-1; y++) {
            for(let x=1; x<w-1; x++) {
                const idx = y*w+x;
                const center = temp[idx] * 8;
                const surround = temp[idx-1] + temp[idx+1] + temp[idx-w] + temp[idx+w] +
                                    temp[idx-w-1] + temp[idx-w+1] + temp[idx+w-1] + temp[idx+w+1];
                input[idx] = center - surround;
            }
        }
    }

    if (config.window) {
        for(let y=0; y<h; y++) {
            for(let x=0; x<w; x++) {
                input[y*w+x] *= (winX[x] * winY[y]);
            }
        }
    }
    return input;
}

function computeFFT(input, w, h) {
    const len = w * h;
    const real = new Float32Array(input);
    const imag = new Float32Array(len).fill(0);

    fft2D(real, imag, w, h);

    const magnitude = new Float32Array(len);
    const centerSkip = 2; 

    for(let y=0; y<h; y++) {
        for(let x=0; x<w; x++) {
            const i = y*w + x;
            // LINEAR POWER: Real^2 + Imag^2
            let mag = real[i]*real[i] + imag[i]*imag[i];
            
            const sy = (y + h/2) % h;
            const sx = (x + w/2) % w;
            
            if (Math.abs(sx - w/2) < centerSkip && Math.abs(sy - h/2) < centerSkip) mag = 0;
            magnitude[sy*w + sx] = mag;
        }
    }
    return magnitude;
}

function drawSpectrogram(mag, w, h) {
    const start = performance.now();

    // OPTIMIZATION: Use sampling to find p99 instead of full sort
    // For 4096², this reduces from ~500ms to ~5ms
    let p99, min;
    if (mag.length > 1_000_000) {
        // For large images, use sampling (much faster)
        const sampleSize = 10000;
        const sample = [];
        for (let i = 0; i < sampleSize; i++) {
            sample.push(mag[Math.floor(Math.random() * mag.length)]);
        }
        sample.sort((a, b) => a - b);
        min = sample[0];
        p99 = sample[Math.floor(sampleSize * 0.99)] || 1;
    } else {
        // For smaller images, use full sort
        let sorted = mag.slice().sort();
        p99 = sorted[Math.floor(sorted.length * 0.99)] || 1;
        min = sorted[0];
    }

    UI.fftCanvas.width = w; UI.fftCanvas.height = h;
    const imgData = CTX.fft.createImageData(w, h);
    const d = imgData.data;

    for(let i=0; i<mag.length; i++) {
        let t = (mag[i] - min) / (p99 - min);
        if(t>1) t=1; if(t<0) t=0;

        const c = getMagmaColor(t);
        d[i*4] = c.r; d[i*4+1] = c.g; d[i*4+2] = c.b; d[i*4+3] = 255;
    }
    CTX.fft.putImageData(imgData, 0, 0);

    // Light Grey Outline
    CTX.fft.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    CTX.fft.lineWidth = 1;
    CTX.fft.strokeRect(0, 0, w, h);

    const elapsed = performance.now() - start;
    console.log(`[SPECTROGRAM] ${w}x${h}: ${elapsed.toFixed(1)}ms (sampling optimization applied)`);
}

function drawPolarPlotMain(mag, w, h) {
    const start = performance.now();

    const ctx = CTX.polar;
    const canvas = UI.polarCanvas;

    // Ensure canvas matches container size
    const targetW = canvas.parentElement.offsetWidth;
    const targetH = canvas.parentElement.offsetHeight;
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }

    const outputW = canvas.width;
    const outputH = canvas.height;
    const cx = w/2; const cy = h/2;
    const maxR = Math.min(w, h)/2;

    const imgData = ctx.createImageData(outputW, outputH);
    const d = imgData.data;

    let maxVal = 0;
    for(let i=0; i<1000; i++) {
        const v = mag[Math.floor(Math.random()*mag.length)];
        if(v > maxVal) maxVal = v;
    }
    if(maxVal === 0) maxVal = 1;

    for(let y=0; y<outputH; y++) {
        const r = (y/outputH) * maxR;
        for(let x=0; x<outputW; x++) {
            const theta = (x/outputW) * Math.PI*2;
            const px = Math.floor(cx + r * Math.cos(theta));
            const py = Math.floor(cy + r * Math.sin(theta));

            let val = 0;
            if(px>=0 && px<w && py>=0 && py<h) val = mag[py*w+px];

            let t = val / maxVal;
            t = Math.pow(t, 0.8);
            const c = getMagmaColor(t);

            const idx = ((outputH - 1 - y) * outputW + x) * 4;
            d[idx] = c.r; d[idx+1] = c.g; d[idx+2] = c.b; d[idx+3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    const elapsed = performance.now() - start;
    console.log(`[POLAR] ${outputW}x${outputH} output from ${w}x${h} FFT: ${elapsed.toFixed(1)}ms`);
}

function computeAzimuthalMain(mag, w, h, draw) {
    const start = performance.now();

    const bins = 360;
    const sums = new Float32Array(bins);
    const counts = new Uint32Array(bins);
    const cx = w/2; const cy = h/2;

    const minR = Math.min(w,h)*0.25;
    const maxR = Math.min(w,h)*0.45;

    // OPTIMIZATION: This is O(w*h) - 16M iterations for 4096²
    for(let y=0; y<h; y++) {
        for(let x=0; x<w; x++) {
            const dx = x-cx; const dy = y-cy;
            const r = Math.sqrt(dx*dx + dy*dy);
            if (r > minR && r < maxR) {
                let angle = Math.atan2(dy, dx) * (180/Math.PI);
                if(angle<0) angle+=360;
                const b = Math.floor(angle)%360;
                sums[b] += mag[y*w+x];
                counts[b]++;
            }
        }
    }

    const scanTime = performance.now() - start;

    const data = [];
    for(let i=0; i<bins; i++) data.push(counts[i] ? sums[i]/counts[i] : 0);

    if(draw) {
        const smoothed = [];
        for(let i=0; i<360; i++) {
            let s=0; for(let j=-2; j<=2; j++) s+=data[(i+j+360)%360];
            smoothed.push(s/5);
        }
        drawAzimuthalGraph(smoothed);
    }

    const totalTime = performance.now() - start;
    console.log(`[AZIMUTHAL] Full scan (${w}x${h}): ${scanTime.toFixed(1)}ms, total: ${totalTime.toFixed(1)}ms`);

    return data;
}

function drawAzimuthalGraph(data) {
    const ctx = CTX.azimuthal;
    const canvas = UI.azimuthalCanvas;

    // Ensure canvas matches container size
    const targetW = canvas.parentElement.offsetWidth;
    const targetH = canvas.parentElement.offsetHeight;
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }

    const w = canvas.width; const h = canvas.height;
    ctx.clearRect(0,0,w,h);

    const min = Math.min(...data); const max = Math.max(...data);
    const range = max - min || 1;
    const padTop = 25;
    const padBottom = 25;
    const padLeft = 50;
    const graphWidth = w - padLeft - 10;
    const graphHeight = h - padTop - padBottom;

    // Draw vertical grid lines and degree labels
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.fillStyle = '#f59e0b'; ctx.font = 'bold 11px JetBrains Mono';
    ctx.textAlign = 'center';
    [0,90,180,270].forEach(d => {
        const x = padLeft + (d/360)*graphWidth;
        ctx.beginPath(); ctx.moveTo(x, padTop); ctx.lineTo(x, h - padBottom); ctx.stroke();
        ctx.fillText(d+'°', x, h - 8);
    });

    // Y-axis labels (power values)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(formatNumber(max), padLeft - 8, padTop + 5);
    ctx.fillText(formatNumber(min), padLeft - 8, h - padBottom + 5);

    // Draw data line
    ctx.beginPath(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
    for(let i=0; i<360; i++) {
        const x = padLeft + (i/360)*graphWidth;
        const y = padTop + (1 - (data[i]-min)/range) * graphHeight;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
}

function computeRadialMain(mag, w, h) {
    const start = performance.now();

    const cx = w/2; const cy = h/2;
    const maxR = Math.ceil(Math.sqrt(cx*cx + cy*cy));
    const sums = new Float32Array(maxR);
    const counts = new Uint32Array(maxR);

    // OPTIMIZATION: This is O(w*h) - 16M iterations for 4096²
    for(let y=0; y<h; y++) {
        for(let x=0; x<w; x++) {
            const dx = x-cx; const dy = y-cy;
            const r = Math.floor(Math.sqrt(dx*dx+dy*dy));
            if(r<maxR) { sums[r]+=mag[y*w+x]; counts[r]++; }
        }
    }
    const scanTime = performance.now() - start;

    const profile = [];
    for(let r=1; r<maxR; r++) { if(counts[r]) profile.push(sums[r]/counts[r]); }

    drawRadialGraph(profile);

    const totalTime = performance.now() - start;
    console.log(`[RADIAL] Full scan (${w}x${h}): ${scanTime.toFixed(1)}ms, total: ${totalTime.toFixed(1)}ms`);

    return profile;
}

function drawRadialGraph(data) {
    const ctx = CTX.radial;
    const canvas = UI.radialCanvas;

    // Ensure canvas matches container size
    const targetW = canvas.parentElement.offsetWidth;
    const targetH = canvas.parentElement.offsetHeight;
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }

    const w = canvas.width; const h = canvas.height;
    ctx.clearRect(0,0,w,h);

    const minLogR = Math.log(1); const maxLogR = Math.log(data.length);
    const minV = Math.min(...data); const maxV = Math.max(...data);
    const range = maxV - minV || 1;

    // Padding to prevent cutoff
    const padTop = 30;
    const padBottom = 35;
    const padLeft = 55;
    const graphHeight = h - padTop - padBottom;
    const graphWidth = w - padLeft - 10;

    // Draw reference diagonal (expected falloff slope)
    ctx.beginPath(); ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)'; ctx.lineWidth = 1; ctx.setLineDash([5,5]);
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft + graphWidth, h - padBottom);
    ctx.stroke(); ctx.setLineDash([]);

    // Draw axis labels
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 11px JetBrains Mono';
    ctx.textAlign = 'right';
    // Y-axis labels (min/max power)
    ctx.fillText(formatNumber(maxV), padLeft - 8, padTop + 5);
    ctx.fillText(formatNumber(minV), padLeft - 8, h - padBottom + 5);
    // X-axis labels (frequency radius)
    ctx.textAlign = 'center';
    ctx.fillText('1px', padLeft, h - 10);
    ctx.fillText(formatNumber(data.length) + 'px', padLeft + graphWidth, h - 10);

    // Draw data line
    ctx.beginPath(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
    for(let i=0; i<data.length; i++) {
        const logR = Math.log(i+1);
        const x = padLeft + ((logR - minLogR)/(maxLogR - minLogR)) * graphWidth;
        const y = (h - padBottom) - ((data[i]-minV)/range) * graphHeight;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
}

function formatNumber(n) {
    if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n/1000).toFixed(1) + 'K';
    return n.toFixed(1);
}

function calculateScore(data) {
    // Logic retained for internal use
    const sorted = [...data].sort((a,b)=>a-b);
    const median = sorted[Math.floor(sorted.length/2)];
    
    const getPeak = (deg) => {
        let p = 0;
        for(let i=-2; i<=2; i++) {
            const idx = (deg+i+360)%360;
            if(data[idx]>p) p=data[idx];
        }
        return p;
    };

    const getLocalAvg = (deg) => {
        let sum = 0; let c = 0;
        for(let i=-15; i<=15; i++) {
            if(Math.abs(i)<4) continue;
            const idx = (deg+i+360)%360;
            sum += data[idx]; c++;
        }
        return sum/c;
    };

    const p0=getPeak(0); const b0=getLocalAvg(0);
    const p90=getPeak(90); const b90=getLocalAvg(90);
    const p180=getPeak(180); const b180=getLocalAvg(180);
    const p270=getPeak(270); const b270=getLocalAvg(270);

    const ratio = Math.max(p0/b0, p90/b90, p180/b180, p270/b270);
    console.log("Grid Prominence Score: " + ratio.toFixed(2) + "x");
}

// ================= Helpers =================
function setupViewport(container, canvas) {
    let zoom = 1.0; let panX = 0; let panY = 0;
    let isDrag = false; let lx=0; let ly=0;
    const redraw = () => {
        const ctx = canvas.getContext('2d');
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        if(!currentImage) return;
        const scale = Math.min(canvas.width/currentImage.width, canvas.height/currentImage.height);
        const w = currentImage.width * scale * zoom;
        const h = currentImage.height * scale * zoom;
        const x = (canvas.width - w)/2 + panX;
        const y = (canvas.height - h)/2 + panY;
        ctx.drawImage(currentImage, x, y, w, h);
    };
    container.addEventListener('mousedown', e => { isDrag=true; lx=e.clientX; ly=e.clientY; });
    window.addEventListener('mouseup', () => isDrag=false);
    window.addEventListener('mousemove', e => {
        if(!isDrag) return;
        panX += e.clientX - lx; panY += e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
        redraw();
    });
    container.addEventListener('wheel', e => {
        e.preventDefault();
        zoom += e.deltaY > 0 ? -0.1 : 0.1;
        if(zoom < 0.1) zoom = 0.1;
        redraw();
    });
    const oldFit = fitImageToCanvas;
    fitImageToCanvas = (img, c, ctx) => { zoom = 1.0; panX = 0; panY = 0; redraw(); };
}

function getMagmaColor(t) {
    if (t<0) t=0; if(t>1) t=1;
    let r, g, b;
    if (t < 0.33) { const lt = t/0.33; r=lerp(0,63,lt); g=lerp(0,15,lt); b=lerp(0,114,lt); }
    else if (t < 0.66) { const lt = (t-0.33)/0.33; r=lerp(63,252,lt); g=lerp(15,103,lt); b=lerp(114,93,lt); }
    else { const lt = (t-0.66)/0.34; r=lerp(252,252,lt); g=lerp(103,253,lt); b=lerp(93,191,lt); }
    return {r,g,b};
}
function lerp(a,b,t){ return a+(b-a)*t; }

// ============================================
// FFT: Fast Fourier Transform (Cooley-Tukey)
// ============================================
// Converts spatial domain data (pixels) to frequency domain data.
// Time complexity: O(n log n) vs O(n²) for naive DFT.
// Input:  re[] - real part array, im[] - imaginary part array (should be zeros)
// Output: re[] and im[] are modified in-place with FFT result
// ============================================

/**
 * 2D FFT - Separable row-column decomposition
 *
 * A 2D FFT can be computed as two passes of 1D FFTs:
 * 1. FFT on each row (horizontal frequencies)
 * 2. FFT on each column (vertical frequencies)
 *
 * This is mathematically equivalent to a full 2D transform but more efficient:
 *   O(n² log n) instead of O(n⁴) for naive approach
 *
 * @param {Float32Array} re - Real part of input image (flattened 2D array)
 * @param {Float32Array} im - Imaginary part (should be all zeros for real input)
 * @param {number} w - Width of image (must be power of 2)
 * @param {number} h - Height of image (must be power of 2)
 */
function fft2D(re, im, w, h) {
    // Pass 1: FFT each row (horizontal frequencies)
    for (let y=0; y<h; y++) {
        const rowR=new Float32Array(w), rowI=new Float32Array(w);
        for(let x=0; x<w; x++) { rowR[x]=re[y*w+x]; rowI[x]=im[y*w+x]; }
        fft1D(rowR, rowI, w);
        for(let x=0; x<w; x++) { re[y*w+x]=rowR[x]; im[y*w+x]=rowI[x]; }
    }
    // Pass 2: FFT each column (vertical frequencies)
    for (let x=0; x<w; x++) {
        const colR=new Float32Array(h), colI=new Float32Array(h);
        for(let y=0; y<h; y++) { colR[y]=re[y*w+x]; colI[y]=im[y*w+x]; }
        fft1D(colR, colI, h);
        for(let y=0; y<h; y++) { re[y*w+x]=colR[y]; im[y*w+x]=colI[y]; }
    }
}

/**
 * 1D FFT - Cooley-Tukey decimation-in-time algorithm
 *
 * This algorithm works by recursively breaking down the DFT into smaller DFTs.
 * It consists of two main phases:
 *
 * PHASE 1: Bit-Reversal Permutation
 * ---------------------------------
 * The FFT output is naturally in bit-reversed order. We pre-scramble the input
 * so the output ends up in correct order.
 *
 * Example for n=8 (indices in binary):
 *   000 (0) → 000 (0)  ✓
 *   001 (1) → 100 (4)  swap
 *   010 (2) → 010 (2)  ✓
 *   011 (3) → 110 (6)  swap
 *   100 (4) → 001 (1)  swap
 *   101 (5) → 101 (5)  ✓
 *   110 (6) → 011 (3)  swap
 *   111 (7) → 111 (7)  ✓
 *
 * PHASE 2: Butterfly Operations
 * ------------------------------
 * Combines pairs of DFTs using "twiddle factors" (complex roots of unity).
 * A "butterfly" takes two inputs (a, b) and produces two outputs:
 *   A = a + W * b
 *   B = a - W * b
 * where W is a complex exponential (twiddle factor).
 *
 * Each stage doubles the DFT size: 2-point → 4-point → 8-point → ... → n-point
 * Total stages: log₂(n)
 *
 * @param {Float32Array} re - Real part (modified in-place)
 * @param {Float32Array} im - Imaginary part (modified in-place)
 * @param {number} n - Length of transform (must be power of 2)
 */
function fft1D(re, im, n) {
    // ========== PHASE 1: Bit-Reversal Permutation ==========
    // Reorders input array so output will be in correct order
    let j=0;  // Bit-reversed index
    for(let i=0; i<n-1; i++){
        // Swap elements if current index is behind bit-reversed index
        if(i<j){
            let t=re[i]; re[i]=re[j]; re[j]=t;
            t=im[i]; im[i]=im[j]; im[j]=t;
        }
        // Generate next bit-reversed index:
        // 1. Find least significant 1-bit in j
        // 2. Change it to 0 and all trailing 0s to 1s
        // 3. Increment
        let k=n/2; while(k<=j){ j-=k; k/=2; } j+=k;
    }

    // ========== PHASE 2: Butterfly Operations ==========
    let step=1;  // Current DFT size (doubles each stage)
    while(step<n){
        const jump=step*2;  // Distance between butterfly pairs
        // Twiddle factor increment: W = e^(-2πi/jump) = cos(dt) + i·sin(dt)
        const dt = -Math.PI/step;
        let wr=1, wi=0;  // Current twiddle factor (starts at W⁰ = 1)
        const wsr=Math.cos(dt), wsi=Math.sin(dt);  // Precompute increment

        // Process all butterflies in current stage
        for(let s=0; s<step; s++){
            for(let i=s; i<n; i+=jump){
                const j=i+step;  // Paired index
                // Apply twiddle factor to upper input: W * (re[j] + i·im[j])
                const tr=wr*re[j]-wi*im[j];
                const ti=wr*im[j]+wi*re[j];
                // Butterfly: a ± W*b
                re[j]=re[i]-tr; im[j]=im[i]-ti;  // Difference
                re[i]+=tr; im[i]+=ti;            // Sum
            }
            // Advance twiddle factor: W ← W × W_increment
            const twr=wr*wsr-wi*wsi;
            wi=wr*wsi+wi*wsr; wr=twr;
        }
        step=jump;  // Double DFT size for next stage
    }
}

init();