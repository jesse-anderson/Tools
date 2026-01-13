// Face Blur Tool - Main Application Logic
// Handles DOM manipulation, event handlers, MediaPipe integration

// ============================================================================
// CONSTANTS
// ============================================================================
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_DIMENSION = 4096; // 4K pixels
const MAX_IMAGE_AREA = 16777216; // 256 megapixels
const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / (1024 * 1024);
const MAX_DIMENSION_PX = MAX_IMAGE_DIMENSION;
const MAX_HISTORY = 50; // Maximum number of history states to store
const DEBOUNCE_DELAY = 150; // ms
const MODEL_LOAD_TIMEOUT_MS = 30000; // 30 second timeout

// ============================================================================
// GLOBAL STATE
// ============================================================================
let faceDetection = null;
let faceMesh = null;
let faceLandmarks = [];
let faceMeshProcessing = false;
let faceMeshProcessed = false;
let currentImage = null;
let detectedFaces = [];
let faceEnabledStates = [];
let facePreviewThumbnails = [];
let camera = null;
let isCameraRunning = false;
let inputType = "image";
let blurType = "gaussian";
let blurIntensity = 50;
let regionExpansion = 1.0;
let confidenceThreshold = 0.5;
let manualDrawMode = false;
let manualRegions = [];
let isDrawing = false;
let drawStart = { x: 0, y: 0 };
let originalImageData = null;
let manualRegionsHistory = [];
let historyIndex = -1;
let comparisonMode = 'blurred';
let sliderPosition = 50;
let isDraggingSlider = false;
let featureBlurring = { eyes: { enabled: true, intensity: 80 }, eyebrows: { enabled: false, intensity: 0 }, nose: { enabled: false, intensity: 0 }, mouth: { enabled: false, intensity: 0 } };
let blurIntensityTimer = null;
let expandRegionTimer = null;
let faceDetectionReady = false;
let faceMeshReady = false;
let modelLoadTimeout = null;
let cachedMeshData = [];
let currentDrawRect = null;
let hasShownFaceToggleHint = false;

// ============================================================================
// DOM ELEMENTS
// ============================================================================
let outputCanvas, outputCtx, placeholderContent, faceCountBadge, faceCount, statusIndicator, statusText, downloadBtn, uploadZone, canvasWrapper;

// ============================================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================================
const Toast = {
    show(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let icon = '';
        switch (type) {
            case 'success': icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'; break;
            case 'warning': icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'; break;
            case 'error': icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'; break;
            default: icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        }

        toast.innerHTML = `${icon}<span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastSlideUp 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    success(message, duration) { this.show(message, 'success', duration); },
    warning(message, duration) { this.show(message, 'warning', duration); },
    error(message, duration) { this.show(message, 'error', duration); },
    info(message, duration) { this.show(message, 'info', duration); }
};

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
    // Get DOM elements
    outputCanvas = document.getElementById("outputCanvas");
    if (outputCanvas) {
        outputCtx = outputCanvas.getContext("2d");
    }
    placeholderContent = document.getElementById("placeholderContent");
    faceCountBadge = document.getElementById("faceCountBadge");
    faceCount = document.getElementById("faceCount");
    statusIndicator = document.getElementById("statusIndicator");
    statusText = document.getElementById("statusText");
    downloadBtn = document.getElementById("downloadBtn");
    uploadZone = document.getElementById("uploadZone");
    canvasWrapper = document.getElementById("canvasWrapper");

    initializeFaceDetection();
    initializeFaceMesh();
    setupDragAndDrop();
    setupCanvasInteraction();
    setupKeyboardShortcuts();
    setupComparisonSlider();
});

async function initializeFaceDetection() {
    showStatus("Loading MediaPipe Face Detection...", "loading");

    modelLoadTimeout = setTimeout(() => {
        if (!faceDetectionReady) {
            showStatus("MediaPipe loading timeout. Check your internet connection.", "error");
            Toast.error("Face Detection models failed to load. Please refresh the page.");
        }
    }, MODEL_LOAD_TIMEOUT_MS);

    try {
        faceDetection = new FaceDetection({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
        });

        faceDetection.setOptions({
            model: "short",
            minDetectionConfidence: confidenceThreshold
        });

        faceDetection.onResults((results) => {
            if (modelLoadTimeout && !faceDetectionReady) {
                clearTimeout(modelLoadTimeout);
                modelLoadTimeout = null;
            }
            faceDetectionReady = true;
            onResults(results);
        });

        console.log("MediaPipe Face Detection initialized");
    } catch (error) {
        clearTimeout(modelLoadTimeout);
        showStatus("Error loading Face Detection", "error");
        console.error("Face Detection initialization error:", error);
        Toast.error("Failed to initialize Face Detection: " + error.message);
    }
}

async function initializeFaceMesh() {
    try {
        faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
            maxNumFaces: 10,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        faceMesh.onResults((results) => {
            faceMeshReady = true;
            onFaceMeshResults(results);
        });

        console.log("MediaPipe Face Mesh initialized");
    } catch (error) {
        showStatus("Error loading Face Mesh", "error");
        console.error("Face Mesh initialization error:", error);
        Toast.error("Failed to initialize Face Mesh: " + error.message);
    }
}

async function processWithFaceMesh() {
    if (!faceMesh || !currentImage) return false;

    faceMeshProcessing = true;
    faceMeshProcessed = false;

    try {
        await faceMesh.send({ image: currentImage });
        await new Promise(resolve => setTimeout(resolve, 50));
        faceMeshProcessing = false;
        faceMeshProcessed = true;
        return true;
    } catch (error) {
        faceMeshProcessing = false;
        console.error("Face Mesh processing error:", error);
        return false;
    }
}

function onFaceMeshResults(results) {
    if (results && results.multiFaceLandmarks) {
        faceLandmarks = results.multiFaceLandmarks;
        console.log(`Face Mesh detected ${faceLandmarks.length} face(s) with landmarks`);
        cacheMeshData();
    }
}

function cacheMeshData() {
    cachedMeshData = [];

    for (const mesh of faceLandmarks) {
        const cached = {
            mesh: mesh,
            bounds: { minX: 1, minY: 1, maxX: 0, maxY: 0 },
            center: { x: 0, y: 0 },
            features: { leftEye: [], rightEye: [], leftBrow: [], rightBrow: [], nose: [], mouth: [], faceContour: [], lowerFace: [] }
        };

        for (let i = 0; i < mesh.length; i++) {
            const pt = mesh[i];

            cached.bounds.minX = Math.min(cached.bounds.minX, pt.x);
            cached.bounds.minY = Math.min(cached.bounds.minY, pt.y);
            cached.bounds.maxX = Math.max(cached.bounds.maxX, pt.x);
            cached.bounds.maxY = Math.max(cached.bounds.maxY, pt.y);

            if (LEFT_EYE_INDICES.includes(i)) cached.features.leftEye.push(pt);
            if (RIGHT_EYE_INDICES.includes(i)) cached.features.rightEye.push(pt);
            if (LEFT_BROW_INDICES.includes(i)) cached.features.leftBrow.push(pt);
            if (RIGHT_BROW_INDICES.includes(i)) cached.features.rightBrow.push(pt);
            if (NOSE_INDICES.includes(i)) cached.features.nose.push(pt);
            if (MOUTH_INDICES.includes(i)) cached.features.mouth.push(pt);
            if (FACE_OVAL_INDICES.includes(i)) cached.features.faceContour.push(pt);

            if (pt.y > 0.5) cached.features.lowerFace.push(pt);
        }

        cached.center.x = (cached.bounds.minX + cached.bounds.maxX) / 2;
        cached.center.y = (cached.bounds.minY + cached.bounds.maxY) / 2;

        cachedMeshData.push(cached);
    }

    console.log(`Cached ${cachedMeshData.length} face mesh data entries`);
}

// ============================================================================
// INPUT HANDLING
// ============================================================================
function setInputType(type) {
    inputType = type;

    document.querySelectorAll(".input-type-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.type === type);
    });

    const uploadSection = document.getElementById("uploadSection");
    const cameraSection = document.getElementById("cameraSection");

    if (type === "image") {
        uploadSection.style.display = "flex";
        cameraSection.style.display = "none";
        stopCamera();
    } else {
        uploadSection.style.display = "none";
        cameraSection.style.display = "flex";
        clearCanvas();
    }
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.match("image.*")) {
        Toast.error("Please select an image file (JPG, PNG, WebP)");
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        Toast.error(`File too large! Maximum size is ${MAX_FILE_SIZE_MB}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            if (img.width > MAX_IMAGE_DIMENSION || img.height > MAX_IMAGE_DIMENSION) {
                Toast.error(`Image too large! Maximum dimension is ${MAX_DIMENSION_PX}px. Your image is ${img.width}x${img.height}px.`);
                return;
            }
            const pixelArea = img.width * img.height;
            if (pixelArea > MAX_IMAGE_AREA) {
                Toast.error(`Image has too many pixels! Maximum is 256 megapixels. Your image has ${(pixelArea / 1000000).toFixed(1)} megapixels.`);
                return;
            }
            loadImage(e.target.result);
        };
        img.onerror = () => {
            Toast.error("Failed to load image. Please try a different file.");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function setupDragAndDrop() {
    if (!uploadZone) return;

    uploadZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadZone.classList.add("dragover");
    });

    uploadZone.addEventListener("dragleave", () => {
        uploadZone.classList.remove("dragover");
    });

    uploadZone.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadZone.classList.remove("dragover");

        const file = e.dataTransfer.files[0];
        if (file && file.type.match("image.*")) {
            if (file.size > MAX_FILE_SIZE) {
                Toast.error(`File too large! Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    if (img.width > MAX_IMAGE_DIMENSION || img.height > MAX_IMAGE_DIMENSION) {
                        Toast.error(`Image too large! Maximum dimension is ${MAX_DIMENSION_PX}px.`);
                        return;
                    }
                    const pixelArea = img.width * img.height;
                    if (pixelArea > MAX_IMAGE_AREA) {
                        Toast.error(`Image has too many pixels! Maximum is 256 megapixels.`);
                        return;
                    }
                    loadImage(e.target.result);
                };
                img.onerror = () => {
                    Toast.error("Failed to load image. Please try a different file.");
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            Toast.error("Please drop an image file (JPG, PNG, WebP)");
        }
    });
}

function loadImage(imageSrc) {
    const img = new Image();
    img.onload = () => {
        currentImage = img;
        hasShownFaceToggleHint = false; // Reset hint flag for new image

        outputCanvas.width = img.width;
        outputCanvas.height = img.height;

        outputCtx.drawImage(img, 0, 0);

        originalImageData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);

        placeholderContent.style.display = "none";
        outputCanvas.style.display = "block";

        document.getElementById('comparisonToggle').style.display = 'flex';
        setComparisonMode('blurred');

        processImage();
    };
    img.onerror = () => {
        showStatus("Error loading image", "error");
        setTimeout(() => hideStatus(), 3000);
    };
    img.src = imageSrc;
}

async function processImage() {
    if (!faceDetection || !currentImage) return;

    showStatus("Detecting faces...", "loading");

    try {
        await faceDetection.send({ image: currentImage });
    } catch (error) {
        showStatus("Error detecting faces", "error");
        console.error("Face detection error:", error);
    }
}

// ============================================================================
// CAMERA HANDLING
// ============================================================================
async function startCamera() {
    try {
        const video = document.getElementById("cameraVideo");
        const cameraContainer = document.getElementById("cameraContainer");

        // Clear previous image state
        currentImage = null;
        originalImageData = null;
        detectedFaces = [];
        faceEnabledStates = [];
        faceLandmarks = [];
        facePreviewThumbnails = [];
        manualRegions = [];

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" }
        });

        // Wait for video to be ready
        video.srcObject = stream;
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });

        // Set camera running flag BEFORE starting camera (so first frame is handled correctly)
        isCameraRunning = true;

        camera = new Camera(video, {
            onFrame: async () => {
                await faceDetection.send({ image: video });
            },
            width: 640,
            height: 480
        });

        await camera.start();

        cameraContainer.style.display = "block";
        placeholderContent.style.display = "none";
        outputCanvas.style.display = "none";

        // Clear face count badge
        faceCount.textContent = "0";
        faceCountBadge.style.display = "none";
        renderFaceList();

        const startBtn = document.getElementById("startCameraBtn");
        const stopBtn = document.getElementById("stopCameraBtn");
        const captureBtn = document.getElementById("captureBtn");

        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (captureBtn) captureBtn.disabled = false;

        showStatus("Camera active", "success");
        setTimeout(() => hideStatus(), 2000);

    } catch (error) {
        showStatus("Camera access denied", "error");
        console.error("Camera error:", error);
    }
}

function stopCamera() {
    if (camera) {
        camera.stop();
        camera = null;
    }

    const video = document.getElementById("cameraVideo");
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach((track) => {
            if (track.stop) {
                track.stop();
            }
        });
        video.srcObject = null;
    }

    isCameraRunning = false;

    const cameraContainer = document.getElementById("cameraContainer");
    if (cameraContainer) {
        cameraContainer.style.display = "none";
    }

    placeholderContent.style.display = "flex";
    outputCanvas.style.display = "none";

    const startBtn = document.getElementById("startCameraBtn");
    const stopBtn = document.getElementById("stopCameraBtn");
    const captureBtn = document.getElementById("captureBtn");

    if (stopBtn) stopBtn.disabled = true;
    if (captureBtn) captureBtn.disabled = true;
    if (startBtn) startBtn.disabled = false;

    hideStatus();
}

async function captureFrame() {
    const video = document.getElementById("cameraVideo");
    const cameraCanvas = document.getElementById("cameraCanvas");

    if (!video || video.readyState !== 4) {
        showStatus("Camera not ready", "error");
        return;
    }

    if (!cameraCanvas || cameraCanvas.width === 0) {
        showStatus("No frame to capture", "error");
        return;
    }

    showStatus("Processing captured frame...", "loading");

    // Capture the raw video frame
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(video, 0, 0);

    const img = new Image();
    img.onload = async () => {
        // Stop camera and clear camera state
        stopCamera();

        // Set the captured image as current
        currentImage = img;
        hasShownFaceToggleHint = false; // Reset hint for new captured image

        // Set up output canvas with captured image
        outputCanvas.width = img.width;
        outputCanvas.height = img.height;
        outputCtx.drawImage(img, 0, 0);

        // Store original image data
        originalImageData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);

        // Show comparison toggle
        document.getElementById('comparisonToggle').style.display = 'flex';
        setComparisonMode('blurred');

        // Switch to image mode view
        placeholderContent.style.display = "none";
        outputCanvas.style.display = "block";

        // Enable download
        if (downloadBtn) {
            downloadBtn.disabled = false;
        }

        // Run face detection on the captured image and apply blur
        await processImage();

        Toast.success("Frame captured! You can now adjust blur settings.");
    };
    img.onerror = () => {
        showStatus("Error processing captured frame", "error");
    };
    img.src = tempCanvas.toDataURL("image/png");
}

async function drawCameraOverlays(results) {
    const video = document.getElementById("cameraVideo");
    const cameraCanvas = document.getElementById("cameraCanvas");
    const cameraCtx = cameraCanvas.getContext("2d");

    if (!video || !cameraCanvas) return;

    // Set canvas size to match video
    if (cameraCanvas.width !== video.videoWidth || cameraCanvas.height !== video.videoHeight) {
        cameraCanvas.width = video.videoWidth;
        cameraCanvas.height = video.videoHeight;
    }

    // Draw the raw video feed (no blur - user can see what they're capturing)
    cameraCtx.drawImage(video, 0, 0);

    // Optionally show face detection boxes (without blur)
    if (results && results.detections && document.getElementById("showFaceBoxes").checked) {
        for (const detection of results.detections) {
            const box = detection.boundingBox;
            const expandedW = box.width * cameraCanvas.width * regionExpansion;
            const expandedH = box.height * cameraCanvas.height * regionExpansion;
            const expandedX = (box.xCenter * cameraCanvas.width) - expandedW / 2;
            const expandedY = (box.yCenter * cameraCanvas.height) - expandedH / 2;

            cameraCtx.strokeStyle = "#f59e0b";
            cameraCtx.lineWidth = 3;
            cameraCtx.strokeRect(expandedX, expandedY, expandedW, expandedH);
        }
    }

    // Update face count badge
    if (results && results.detections) {
        faceCount.textContent = results.detections.length;
        faceCountBadge.style.display = results.detections.length > 0 ? "flex" : "none";
    }
}

// ============================================================================
// FACE DETECTION RESULTS
// ============================================================================
async function onResults(results) {
    if (!results || !results.detections) {
        showStatus("No faces detected", "success");
        setTimeout(() => hideStatus(), 2000);
        renderFaceList();
        return;
    }

    detectedFaces = results.detections;

    while (faceEnabledStates.length < detectedFaces.length) {
        faceEnabledStates.push(true);
    }
    if (faceEnabledStates.length > detectedFaces.length) {
        faceEnabledStates = faceEnabledStates.slice(0, detectedFaces.length);
    }

    // Camera mode: skip expensive UI operations, just draw overlays
    if (isCameraRunning) {
        drawCameraOverlays(results);
        return;
    }

    // Static image mode: full UI processing
    generateFaceThumbnails();

    faceCount.textContent = detectedFaces.length;
    faceCountBadge.style.display = detectedFaces.length > 0 ? "flex" : "none";

    if (detectedFaces.length > 0) {
        const enabledCount = faceEnabledStates.filter(s => s).length;
        showStatus(`${detectedFaces.length} face(s) detected (${enabledCount} blurred)`, "success");
        setTimeout(() => hideStatus(), 2000);

        // Only show the toggle hint once for static images
        if (!hasShownFaceToggleHint) {
            Toast.info("Click on a face in the list or canvas to toggle blur on/off");
            hasShownFaceToggleHint = true;
        }
    }

    renderFaceList();

    if (currentImage) {
        await processWithFaceMesh();
    }

    applyBlurToCanvas();

    if (downloadBtn) {
        downloadBtn.disabled = false;
    }

    updateIdentityScore();
}

function generateFaceThumbnails() {
    facePreviewThumbnails = [];

    if (!currentImage || !outputCanvas) return;

    const canvasWidth = outputCanvas.width;
    const canvasHeight = outputCanvas.height;

    for (let i = 0; i < detectedFaces.length; i++) {
        const detection = detectedFaces[i];
        const box = detection.boundingBox;

        const expandedW = box.width * regionExpansion;
        const expandedH = box.height * regionExpansion;
        const expandedX = box.xCenter - expandedW / 2;
        const expandedY = box.yCenter - expandedH / 2;

        const canvasX = Math.max(0, expandedX * canvasWidth);
        const canvasY = Math.max(0, expandedY * canvasHeight);
        const canvasW = Math.min(canvasWidth - canvasX, expandedW * canvasWidth);
        const canvasH = Math.min(canvasHeight - canvasY, expandedH * canvasHeight);

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 64;
        thumbCanvas.height = 64;
        const thumbCtx = thumbCanvas.getContext('2d');

        try {
            const faceData = outputCtx.getImageData(canvasX, canvasY, canvasW, canvasH);
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasW;
            tempCanvas.height = canvasH;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(faceData, 0, 0);

            thumbCtx.imageSmoothingEnabled = true;
            thumbCtx.drawImage(tempCanvas, 0, 0, 64, 64);
        } catch (e) {
            thumbCtx.fillStyle = '#333';
            thumbCtx.fillRect(0, 0, 64, 64);
        }

        facePreviewThumbnails.push(thumbCanvas.toDataURL());
    }
}

function renderFaceList() {
    const panel = document.getElementById('faceListPanel');
    const itemsContainer = document.getElementById('faceListItems');

    if (!detectedFaces || detectedFaces.length === 0) {
        panel.classList.remove('has-faces');
        itemsContainer.innerHTML = '';
        return;
    }

    panel.classList.add('has-faces');

    let html = '';
    for (let i = 0; i < detectedFaces.length; i++) {
        const isEnabled = faceEnabledStates[i] || false;
        const thumbnail = facePreviewThumbnails[i] || '';
        const confidence = Math.round((detectedFaces[i].score?.[0] || 0.5) * 100);

        html += `
            <div class="face-list-item ${!isEnabled ? 'disabled' : ''}" data-index="${i}">
                <label class="face-list-toggle">
                    <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleFaceEnabled(${i})">
                    <span class="toggle-slider"></span>
                </label>
                ${thumbnail ? `<img src="${thumbnail}" class="face-list-preview" alt="Face ${i + 1}">` : '<div class="face-list-preview"></div>'}
                <span class="face-list-label">Face ${i + 1} (${confidence}% confidence)</span>
            </div>
        `;
    }

    itemsContainer.innerHTML = html;
}

function toggleFaceEnabled(index) {
    if (index >= 0 && index < faceEnabledStates.length) {
        faceEnabledStates[index] = !faceEnabledStates[index];
        renderFaceList();
        redrawImage();
        updateIdentityScore();

        const enabledCount = faceEnabledStates.filter(s => s).length;
        const status = faceEnabledStates[index] ? 'enabled' : 'disabled';
        Toast.info(`Face ${index + 1} ${status} (${enabledCount}/${detectedFaces.length} blurred)`);
    }
}

function selectAllFaces(select) {
    const newState = select;
    faceEnabledStates = faceEnabledStates.map(() => newState);
    renderFaceList();
    redrawImage();

    const enabledCount = faceEnabledStates.filter(s => s).length;
    Toast.info(`${newState ? 'Selected' : 'Deselected'} all faces (${enabledCount}/${detectedFaces.length} blurred)`);
}

// ============================================================================
// BLUR APPLICATION (Main Canvas)
// ============================================================================
async function applyBlurToCanvas() {
    if (!currentImage) {
        outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        return;
    }

    const canvasWidth = outputCanvas.width;
    const canvasHeight = outputCanvas.height;

    if (originalImageData) {
        outputCtx.putImageData(originalImageData, 0, 0);
    } else {
        outputCtx.drawImage(currentImage, 0, 0);
    }

    for (let i = 0; i < detectedFaces.length; i++) {
        if (!faceEnabledStates[i]) continue;

        const detection = detectedFaces[i];
        const box = detection.boundingBox;

        const mesh = findMatchingFaceMesh(box, canvasWidth, canvasHeight);

        if (mesh) {
            if (blurType === "eyes") {
                const intensity = blurIntensity / 100;
                blurEyeUsingLandmarks(outputCtx, mesh, canvasWidth, canvasHeight, intensity);
            } else if (blurType === "features") {
                await applyFeaturesBlurWithMesh(outputCtx, mesh, canvasWidth, canvasHeight, featureBlurring);
            } else {
                await applyOvalBlurToFace(outputCtx, mesh, canvasWidth, canvasHeight, i);
            }
        } else {
            const x = box.xCenter - box.width / 2;
            const y = box.yCenter - box.height / 2;

            const expandedW = box.width * regionExpansion;
            const expandedH = box.height * regionExpansion;
            const expandedX = box.xCenter - expandedW / 2;
            const expandedY = box.yCenter - expandedH / 2;

            const canvasX = expandedX * canvasWidth;
            const canvasY = expandedY * canvasHeight;
            const canvasW = expandedW * canvasWidth;
            const canvasH = expandedH * canvasHeight;

            const clampedX = Math.max(0, canvasX);
            const clampedY = Math.max(0, canvasY);
            const clampedW = Math.min(canvasWidth - clampedX, canvasW);
            const clampedH = Math.min(canvasHeight - clampedY, canvasH);

            await applyBlurToRegion(outputCtx, clampedX, clampedY, clampedW, clampedH, detection, blurType, blurIntensity, regionExpansion, outputCanvas, faceLandmarks, featureBlurring);
        }
    }

    // Draw face boxes for detected faces if enabled
    const showBoxes = document.getElementById("showFaceBoxes");
    if (showBoxes && showBoxes.checked) {
        for (let i = 0; i < detectedFaces.length; i++) {
            const detection = detectedFaces[i];
            const box = detection.boundingBox;

            const expandedW = box.width * regionExpansion;
            const expandedH = box.height * regionExpansion;
            const expandedX = box.xCenter - expandedW / 2;
            const expandedY = box.yCenter - expandedH / 2;

            const canvasX = expandedX * canvasWidth;
            const canvasY = expandedY * canvasHeight;
            const canvasW = expandedW * canvasWidth;
            const canvasH = expandedH * canvasHeight;

            // Use green for enabled faces, red for disabled
            const isEnabled = faceEnabledStates[i] !== false;
            outputCtx.strokeStyle = isEnabled ? "#22c55e" : "#ef4444";
            outputCtx.lineWidth = 2;
            outputCtx.setLineDash([]);
            outputCtx.strokeRect(canvasX, canvasY, canvasW, canvasH);
        }
    }

    for (const region of manualRegions) {
        const canvasX = region.x * canvasWidth;
        const canvasY = region.y * canvasHeight;
        const canvasW = region.width * canvasWidth;
        const canvasH = region.height * canvasHeight;

        await applyBlurToRegion(outputCtx, canvasX, canvasY, canvasW, canvasH, null, blurType, blurIntensity, regionExpansion, outputCanvas, faceLandmarks, featureBlurring);

        const showBoxes = document.getElementById("showFaceBoxes");
        if (showBoxes && showBoxes.checked) {
            outputCtx.strokeStyle = "#06b6d4";
            outputCtx.lineWidth = 3;
            outputCtx.setLineDash([2, 2]);
            outputCtx.strokeRect(canvasX, canvasY, canvasW, canvasH);
            outputCtx.setLineDash([]);
        }
    }

    drawFaceMeshLandmarks(outputCtx, canvasWidth, canvasHeight);
}

function findMatchingFaceMesh(box, canvasWidth, canvasHeight) {
    if (!cachedMeshData || cachedMeshData.length === 0) return null;

    const boxCenterX = box.xCenter;
    const boxCenterY = box.yCenter;

    let bestMatch = null;
    let bestDistance = Infinity;

    for (const cached of cachedMeshData) {
        const distance = Math.sqrt(
            Math.pow(cached.center.x - boxCenterX, 2) +
            Math.pow(cached.center.y - boxCenterY, 2)
        );

        if (distance < bestDistance && distance < 0.15) {
            bestDistance = distance;
            bestMatch = cached.mesh;
        }
    }

    return bestMatch;
}

async function applyOvalBlurToFace(ctx, mesh, canvasWidth, canvasHeight, faceIndex) {
    const cachedMesh = cachedMeshData.find(c => c.mesh === mesh);

    if (!cachedMesh) {
        await applyOvalBlurToFaceFallback(ctx, mesh, canvasWidth, canvasHeight, faceIndex);
        return;
    }

    let minX = 1, minY = 1, maxX = 0, maxY = 0;

    for (const pt of cachedMesh.features.faceContour) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
    }

    for (const pt of cachedMesh.features.lowerFace) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = (maxX - minX) * regionExpansion;
    const height = (maxY - minY) * regionExpansion;

    const ovalX = centerX * canvasWidth;
    const ovalY = centerY * canvasHeight;
    const ovalRx = (width / 2) * canvasWidth;
    const ovalRy = (height / 2) * canvasHeight;

    const rectX = Math.max(0, Math.round(ovalX - ovalRx));
    const rectY = Math.max(0, Math.round(ovalY - ovalRy));
    const rectW = Math.min(canvasWidth - rectX, Math.round(ovalRx * 2));
    const rectH = Math.min(canvasHeight - rectY, Math.round(ovalRy * 2));

    const tempCanvas = canvasPool.resize('medium', rectW, rectH);
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.drawImage(ctx.canvas,
        rectX, rectY, rectW, rectH,
        0, 0, rectW, rectH
    );

    const localOvalX = ovalX - rectX;
    const localOvalY = ovalY - rectY;

    tempCtx.save();
    tempCtx.beginPath();
    tempCtx.ellipse(localOvalX, localOvalY, ovalRx, ovalRy, 0, 0, 2 * Math.PI);
    tempCtx.clip();

    const imageData = tempCtx.getImageData(0, 0, rectW, rectH);

    await applyBlurToImageData(tempCtx, imageData, 0, 0, rectW, rectH, blurType, blurIntensity);

    tempCtx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ovalX, ovalY, ovalRx, ovalRy, 0, 0, 2 * Math.PI);
    ctx.clip();
    ctx.drawImage(tempCanvas, rectX, rectY);
    ctx.restore();

    const showBoxes = document.getElementById("showFaceBoxes");
    if (showBoxes && showBoxes.checked) {
        ctx.strokeStyle = faceEnabledStates[faceIndex] ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.ellipse(ovalX, ovalY, ovalRx, ovalRy, 0, 0, 2 * Math.PI);
        ctx.stroke();
    }
}

async function applyOvalBlurToFaceFallback(ctx, mesh, canvasWidth, canvasHeight, faceIndex) {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;

    const faceContourIndices = FACE_OVAL_INDICES;

    for (const idx of faceContourIndices) {
        if (mesh[idx]) {
            const pt = mesh[idx];
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
    }

    for (let i = 0; i < mesh.length; i++) {
        const pt = mesh[i];
        if (pt.y > 0.5) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = (maxX - minX) * regionExpansion;
    const height = (maxY - minY) * regionExpansion;

    const ovalX = centerX * canvasWidth;
    const ovalY = centerY * canvasHeight;
    const ovalRx = (width / 2) * canvasWidth;
    const ovalRy = (height / 2) * canvasHeight;

    const tempCanvas = canvasPool.resize('medium', canvasWidth, canvasHeight);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(ctx.canvas, 0, 0);

    tempCtx.save();
    tempCtx.beginPath();
    tempCtx.ellipse(ovalX, ovalY, ovalRx, ovalRy, 0, 0, 2 * Math.PI);
    tempCtx.clip();

    const rectX = Math.max(0, Math.round(ovalX - ovalRx));
    const rectY = Math.max(0, Math.round(ovalY - ovalRy));
    const rectW = Math.min(canvasWidth - rectX, Math.round(ovalRx * 2));
    const rectH = Math.min(canvasHeight - rectY, Math.round(ovalRy * 2));

    const imageData = tempCtx.getImageData(rectX, rectY, rectW, rectH);
    await applyBlurToImageData(tempCtx, imageData, rectX, rectY, rectW, rectH, blurType, blurIntensity);

    tempCtx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ovalX, ovalY, ovalRx, ovalRy, 0, 0, 2 * Math.PI);
    ctx.clip();
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();

    const showBoxes = document.getElementById("showFaceBoxes");
    if (showBoxes && showBoxes.checked) {
        ctx.strokeStyle = faceEnabledStates[faceIndex] ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.ellipse(ovalX, ovalY, ovalRx, ovalRy, 0, 0, 2 * Math.PI);
        ctx.stroke();
    }
}

// Draw Face Mesh landmarks visualization
function drawFaceMeshLandmarks(ctx, canvasWidth, canvasHeight) {
    if (!faceLandmarks || faceLandmarks.length === 0) return;

    const showMeshCheckbox = document.getElementById("showFaceMesh");
    if (!showMeshCheckbox || !showMeshCheckbox.checked) return;

    const colors = {
        contour: '#22c55e',
        eyes: '#3b82f6',
        eyebrows: '#8b5cf6',
        nose: '#f59e0b',
        mouth: '#ef4444',
        mesh: 'rgba(255,255,255,0.15)'
    };

    ctx.save();

    for (const mesh of faceLandmarks) {
        ctx.fillStyle = colors.mesh;
        for (const landmark of mesh) {
            const x = landmark.x * canvasWidth;
            const y = landmark.y * canvasHeight;
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, 2 * Math.PI);
            ctx.fill();
        }

        ctx.strokeStyle = colors.contour;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < FACE_OVAL_INDICES.length; i++) {
            const idx = FACE_OVAL_INDICES[i];
            if (mesh[idx]) {
                const x = mesh[idx].x * canvasWidth;
                const y = mesh[idx].y * canvasHeight;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
        }
        ctx.closePath();
        ctx.stroke();

        ctx.strokeStyle = colors.eyes;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < LEFT_EYE_INDICES.length; i++) {
            const idx = LEFT_EYE_INDICES[i];
            if (mesh[idx]) {
                const x = mesh[idx].x * canvasWidth;
                const y = mesh[idx].y * canvasHeight;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i < RIGHT_EYE_INDICES.length; i++) {
            const idx = RIGHT_EYE_INDICES[i];
            if (mesh[idx]) {
                const x = mesh[idx].x * canvasWidth;
                const y = mesh[idx].y * canvasHeight;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();

        ctx.strokeStyle = colors.eyebrows;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < LEFT_BROW_INDICES.length; i++) {
            const idx = LEFT_BROW_INDICES[i];
            if (mesh[idx]) {
                const x = mesh[idx].x * canvasWidth;
                const y = mesh[idx].y * canvasHeight;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i < RIGHT_BROW_INDICES.length; i++) {
            const idx = RIGHT_BROW_INDICES[i];
            if (mesh[idx]) {
                const x = mesh[idx].x * canvasWidth;
                const y = mesh[idx].y * canvasHeight;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        ctx.strokeStyle = colors.nose;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < NOSE_INDICES.length; i++) {
            const idx = NOSE_INDICES[i];
            if (mesh[idx]) {
                const x = mesh[idx].x * canvasWidth;
                const y = mesh[idx].y * canvasHeight;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        ctx.strokeStyle = colors.mouth;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < MOUTH_INDICES.length; i++) {
            const idx = MOUTH_INDICES[i];
            if (mesh[idx]) {
                const x = mesh[idx].x * canvasWidth;
                const y = mesh[idx].y * canvasHeight;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();
    }

    ctx.restore();
}

// ============================================================================
// SETTINGS & PRESETS
// ============================================================================
function updateBlurIntensity(value) {
    blurIntensity = parseInt(value);
    updateBlurIntensityDisplay(value);

    clearTimeout(blurIntensityTimer);
    blurIntensityTimer = setTimeout(() => {
        redrawImage();
        updateIdentityScore();
    }, DEBOUNCE_DELAY);
}

function updateExpandRegion(value) {
    regionExpansion = parseInt(value) / 100;
    updateExpandDisplay(value);

    clearTimeout(expandRegionTimer);
    expandRegionTimer = setTimeout(() => {
        redrawImage();
        updateIdentityScore();
    }, DEBOUNCE_DELAY);
}

function updateConfidence(value) {
    confidenceThreshold = parseInt(value) / 100;
    document.getElementById("confidenceValueDisplay").textContent = `${value}%`;

    if (faceDetection) {
        faceDetection.setOptions({
            model: "short",
            minDetectionConfidence: confidenceThreshold
        });

        if (currentImage && !isCameraRunning) {
            processImage();
        }
    }
}

function updateBlurIntensityDisplay(value) {
    const el = document.getElementById('blurValueDisplay');
    if (el) el.textContent = value + '%';
}

function updateExpandDisplay(value) {
    const el = document.getElementById('expandValueDisplay');
    if (el) el.textContent = value + '%';
}

async function setBlurType(type) {
    blurType = type;

    document.querySelectorAll(".blur-type-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.type === type);
    });

    const featureSection = document.getElementById("featureBlurringSection");
    if (type === "features") {
        featureSection.style.display = "flex";
    } else {
        featureSection.style.display = "none";
    }

    if (type === "skinmask") {
        Toast.warning("Skin Mask mode works best on light/medium skin tones. May miss darker skin or blur non-skin areas.", 6000);
    }

    if ((type === "eyes" || type === "features" || type === "inpaint") && currentImage && !isCameraRunning) {
        await processWithFaceMesh();
    }

    redrawImage();
    updateIdentityScore();
}

function applyPreset(preset) {
    switch (preset) {
        case 'journalist':
            setBlurType('pixelate');
            blurIntensity = 100;
            regionExpansion = 1.2;
            document.getElementById('blurIntensity').value = 100;
            document.getElementById('expandRegion').value = 120;
            updateBlurIntensityDisplay(100);
            updateExpandDisplay(120);
            break;
        case 'legal':
            setBlurType('box');
            blurIntensity = 100;
            regionExpansion = 1.1;
            document.getElementById('blurIntensity').value = 100;
            document.getElementById('expandRegion').value = 110;
            updateBlurIntensityDisplay(100);
            updateExpandDisplay(110);
            break;
        case 'social':
            setBlurType('gaussian');
            blurIntensity = 70;
            regionExpansion = 1.0;
            document.getElementById('blurIntensity').value = 70;
            document.getElementById('expandRegion').value = 100;
            updateBlurIntensityDisplay(70);
            updateExpandDisplay(100);
            break;
        case 'maximum':
            setBlurType('mosaic');
            blurIntensity = 100;
            regionExpansion = 1.5;
            document.getElementById('blurIntensity').value = 100;
            document.getElementById('expandRegion').value = 150;
            updateBlurIntensityDisplay(100);
            updateExpandDisplay(150);
            break;
        case 'inpaint':
            setBlurType('inpaint');
            blurIntensity = 100;
            regionExpansion = 1.0;
            document.getElementById('blurIntensity').value = 100;
            document.getElementById('expandRegion').value = 100;
            updateBlurIntensityDisplay(100);
            updateExpandDisplay(100);
            break;
    }
    Toast.info(`Applied ${preset.charAt(0).toUpperCase() + preset.slice(1)} preset`);
    updateIdentityScore();
}

function updateFeatureBlurring() {
    featureBlurring.eyes = { enabled: document.getElementById('blurEyes').checked, intensity: 100 };
    featureBlurring.eyebrows = { enabled: document.getElementById('blurEyebrows').checked, intensity: 100 };
    featureBlurring.nose = { enabled: document.getElementById('blurNose').checked, intensity: 100 };
    featureBlurring.mouth = { enabled: document.getElementById('blurMouth').checked, intensity: 100 };

    if (blurType === "features") {
        redrawImage();
    }
    updateIdentityScore();
}

// ============================================================================
// IDENTITY PROTECTION SCORE
// ============================================================================
function updateIdentityScore() {
    const scoreValueEl = document.getElementById('identityScoreValue');
    const scoreFillEl = document.getElementById('identityScoreFill');
    const scoreBreakdownEl = document.getElementById('identityScoreBreakdown');

    if (!currentImage) {
        scoreValueEl.textContent = '--';
        scoreValueEl.className = 'identity-score-value';
        scoreFillEl.style.width = '0%';
        scoreBreakdownEl.innerHTML = '<span class="score-breakdown-item">Upload an image to analyze</span>';
        return;
    }

    const hasManualRegions = manualRegions.length > 0;
    const hasDetectedFaces = detectedFaces.length > 0;

    if (!hasDetectedFaces && !hasManualRegions) {
        scoreValueEl.textContent = '--';
        scoreValueEl.className = 'identity-score-value';
        scoreFillEl.style.width = '0%';
        scoreBreakdownEl.innerHTML = '<span class="score-breakdown-item">No faces detected</span>';
        return;
    }

    let score = 0;
    let breakdown = [];

    const blurScore = Math.min(30, (blurIntensity / 100) * 30);
    score += blurScore;
    breakdown.push(`Blur: ${Math.round(blurScore)}/30`);

    let typeScore = 0;
    switch (blurType) {
        case 'inpaint': typeScore = 25; break;
        case 'box': typeScore = 25; break;
        case 'mosaic': typeScore = 22; break;
        case 'pixelate': typeScore = 19; break;
        case 'features': typeScore = 21; break;
        case 'motion': typeScore = 15; break;
        case 'eyes': typeScore = 13; break;
        case 'skinmask': typeScore = 9; break;
        default: typeScore = 16;
    }
    score += typeScore;
    const typeNames = { gaussian: 'Gaussian', pixelate: 'Pixelate', mosaic: 'Mosaic', box: 'Black Box', motion: 'Motion', eyes: 'Eyes Only', skinmask: 'Skin Mask', inpaint: 'Inpaint', features: 'Feature Destroyer' };
    breakdown.push(`${typeNames[blurType] || blurType}: ${typeScore}/25`);

    let coverageScore = 0;
    let coverageLabel = '';

    if (hasDetectedFaces) {
        const enabledCount = faceEnabledStates.filter(s => s).length;
        const totalFaces = detectedFaces.length;
        const faceCoverageRatio = enabledCount / totalFaces;
        coverageScore = faceCoverageRatio * 20;
        const manualBonus = Math.min(5, manualRegions.length * 1.5);
        coverageScore += manualBonus;
        coverageLabel = hasManualRegions ? `Faces: ${enabledCount}/${totalFaces} + ${manualRegions.length} manual` : `Faces: ${enabledCount}/${totalFaces}`;
    } else {
        coverageScore = Math.min(25, manualRegions.length * 5);
        coverageLabel = `Manual: ${manualRegions.length} region${manualRegions.length !== 1 ? 's' : ''}`;
    }
    score += coverageScore;
    breakdown.push(coverageLabel);

    let contextScore = 0;
    if (hasDetectedFaces) {
        const canvasWidth = outputCanvas.width;
        const canvasHeight = outputCanvas.height;
        const imageArea = canvasWidth * canvasHeight;

        let maxFaceProminence = 0;
        for (const detection of detectedFaces) {
            const box = detection.boundingBox;
            const faceWidth = box.width * canvasWidth;
            const faceHeight = box.height * canvasHeight;
            const faceArea = faceWidth * faceHeight;
            const faceAreaRatio = faceArea / imageArea;

            const centerX = box.xCenter;
            const centerY = box.yCenter;
            const distFromCenter = 1 - Math.sqrt(Math.pow(centerX - 0.5, 2) + Math.pow(centerY - 0.5, 2)) / Math.sqrt(0.5);

            const prominence = (faceAreaRatio * 100) * (0.7 + distFromCenter * 0.3);
            maxFaceProminence = Math.max(maxFaceProminence, prominence);
        }

        const enabledCount = faceEnabledStates.filter(s => s).length;
        if (enabledCount > 0 && maxFaceProminence > 1) {
            contextScore = Math.min(5, maxFaceProminence * 0.5);
        }
    }
    score += contextScore;
    if (contextScore > 0) {
        breakdown.push(`Prominence: +${Math.round(contextScore)}`);
    }

    const expansionScore = Math.min(15, Math.max(0, (regionExpansion - 0.5) * 30));
    score += expansionScore;
    breakdown.push(`Expansion: ${Math.round(regionExpansion * 100)}%`);

    if (blurType === 'features') {
        const enabledFeatures = Object.values(featureBlurring).filter(f => f.enabled);
        const featureCount = enabledFeatures.length;

        if (featureCount > 0) {
            const totalIntensity = enabledFeatures.reduce((sum, f) => sum + f.intensity, 0);
            const avgIntensity = totalIntensity / featureCount;
            const countBonus = (featureCount / 4) * 3;
            const intensityBonus = (avgIntensity / 100) * 3;
            const featureBonus = Math.min(6, countBonus + intensityBonus);

            score += featureBonus;
            breakdown.push(`Features: ${featureCount}/4 (${Math.round(avgIntensity)}% avg)`);
        }
    }

    if (hasManualRegions && hasDetectedFaces) {
        const enabledCount = faceEnabledStates.filter(s => s).length;
        const allFacesCovered = enabledCount === detectedFaces.length;
        if (allFacesCovered) {
            score += 2;
            breakdown.push(`Thoroughness: +2`);
        } else {
            score += Math.min(2, manualRegions.length);
            breakdown.push(`Manual regions: +${Math.min(2, manualRegions.length)}`);
        }
    }

    score = Math.min(100, Math.round(score));

    scoreValueEl.textContent = score + '%';
    scoreFillEl.style.width = score + '%';

    scoreValueEl.className = 'identity-score-value';
    if (score >= 80) scoreValueEl.classList.add('excellent');
    else if (score >= 60) scoreValueEl.classList.add('good');
    else if (score >= 40) scoreValueEl.classList.add('fair');
    else scoreValueEl.classList.add('poor');

    scoreBreakdownEl.innerHTML = breakdown.map(item => `<span class="score-breakdown-item">${item}</span>`).join('');
}

// ============================================================================
// COMPARISON MODE
// ============================================================================
function setComparisonMode(mode) {
    comparisonMode = mode;

    document.getElementById('showBlurredBtn').classList.toggle('active', mode === 'blurred');
    document.getElementById('showSliderBtn').classList.toggle('active', mode === 'slider');
    document.getElementById('showOriginalBtn').classList.toggle('active', mode === 'original');

    const outputCanvas = document.getElementById('outputCanvas');
    const comparisonCanvas = document.getElementById('comparisonCanvas');
    const comparisonSlider = document.getElementById('comparisonSlider');

    if (mode === 'slider') {
        outputCanvas.style.display = 'none';
        comparisonCanvas.style.display = 'block';
        comparisonSlider.style.display = 'block';
        updateComparisonCanvas();
    } else if (mode === 'original') {
        outputCanvas.style.display = 'none';
        comparisonCanvas.style.display = 'none';
        comparisonSlider.style.display = 'none';
        if (currentImage && originalImageData) {
            outputCanvas.style.display = 'block';
            outputCtx.putImageData(originalImageData, 0, 0);
        }
    } else {
        outputCanvas.style.display = 'block';
        comparisonCanvas.style.display = 'none';
        comparisonSlider.style.display = 'none';
        redrawImage();
    }
}

function updateComparisonCanvas() {
    if (!currentImage || comparisonMode !== 'slider') return;

    const comparisonCanvas = document.getElementById('comparisonCanvas');
    const comparisonCtx = comparisonCanvas.getContext('2d');
    const sliderHandle = document.getElementById('comparisonHandle');

    comparisonCanvas.width = outputCanvas.width;
    comparisonCanvas.height = outputCanvas.height;

    const splitX = (sliderPosition / 100) * comparisonCanvas.width;

    if (originalImageData) {
        comparisonCtx.putImageData(originalImageData, 0, 0);
        comparisonCtx.save();
        comparisonCtx.beginPath();
        comparisonCtx.rect(splitX, 0, comparisonCanvas.width - splitX, comparisonCanvas.height);
        comparisonCtx.clip();
        comparisonCtx.drawImage(outputCanvas, 0, 0);
        comparisonCtx.restore();
    }

    // Position handle relative to the actual canvas display size
    const canvasRect = comparisonCanvas.getBoundingClientRect();
    const wrapperRect = document.getElementById('canvasWrapper').getBoundingClientRect();

    // Calculate the actual position of the canvas within the wrapper
    const canvasLeftInWrapper = canvasRect.left - wrapperRect.left;
    const canvasTopInWrapper = canvasRect.top - wrapperRect.top;
    const handleLeft = canvasLeftInWrapper + splitX;

    sliderHandle.style.left = handleLeft + 'px';
    sliderHandle.style.top = canvasTopInWrapper + 'px';
    sliderHandle.style.height = canvasRect.height + 'px';
}

function setupComparisonSlider() {
    const slider = document.getElementById('comparisonSlider');
    const handle = document.getElementById('comparisonHandle');
    const canvasWrapper = document.getElementById('canvasWrapper');

    // Helper to get position relative to the actual canvas
    function getPositionFromEvent(clientX) {
        const comparisonCanvas = document.getElementById('comparisonCanvas');
        const canvasRect = comparisonCanvas.getBoundingClientRect();
        const wrapperRect = canvasWrapper.getBoundingClientRect();

        // Calculate canvas position within wrapper
        const canvasLeft = canvasRect.left - wrapperRect.left;

        // Convert mouse position to position within canvas
        let xPos = clientX - canvasRect.left;
        return Math.max(0, Math.min(canvasRect.width, xPos));
    }

    handle.addEventListener('mousedown', (e) => {
        isDraggingSlider = true;
        e.preventDefault();
    });

    handle.addEventListener('touchstart', (e) => {
        isDraggingSlider = true;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingSlider) return;

        const comparisonCanvas = document.getElementById('comparisonCanvas');
        if (!comparisonCanvas || comparisonCanvas.style.display === 'none') return;

        const xPos = getPositionFromEvent(e.clientX);
        const canvasWidth = comparisonCanvas.width;
        const displayWidth = comparisonCanvas.getBoundingClientRect().width;
        const scaleX = canvasWidth / displayWidth;

        let newPercent = ((xPos * scaleX) / canvasWidth) * 100;
        sliderPosition = Math.max(0, Math.min(100, newPercent));
        updateComparisonCanvas();
    });

    document.addEventListener('touchmove', (e) => {
        if (!isDraggingSlider) return;

        const comparisonCanvas = document.getElementById('comparisonCanvas');
        if (!comparisonCanvas || comparisonCanvas.style.display === 'none') return;

        const xPos = getPositionFromEvent(e.touches[0].clientX);
        const canvasWidth = comparisonCanvas.width;
        const displayWidth = comparisonCanvas.getBoundingClientRect().width;
        const scaleX = canvasWidth / displayWidth;

        let newPercent = ((xPos * scaleX) / canvasWidth) * 100;
        sliderPosition = Math.max(0, Math.min(100, newPercent));
        updateComparisonCanvas();
    });

    document.addEventListener('mouseup', () => {
        isDraggingSlider = false;
    });

    document.addEventListener('touchend', () => {
        isDraggingSlider = false;
    });

    slider.addEventListener('click', (e) => {
        if (e.target !== handle) {
            const comparisonCanvas = document.getElementById('comparisonCanvas');
            if (!comparisonCanvas || comparisonCanvas.style.display === 'none') return;

            const xPos = getPositionFromEvent(e.clientX);
            const canvasWidth = comparisonCanvas.width;
            const displayWidth = comparisonCanvas.getBoundingClientRect().width;
            const scaleX = canvasWidth / displayWidth;

            let newPercent = ((xPos * scaleX) / canvasWidth) * 100;
            sliderPosition = Math.max(0, Math.min(100, newPercent));
            updateComparisonCanvas();
        }
    });
}

// ============================================================================
// MANUAL DRAW & UNDO/REDO
// ============================================================================
function toggleManualDraw() {
    manualDrawMode = document.getElementById("manualDrawMode").checked;
    const clearBtn = document.getElementById("clearManualBtn");
    const undoRedoContainer = document.getElementById("undoRedoContainer");

    if (clearBtn) {
        clearBtn.style.display = manualDrawMode ? "flex" : "none";
    }
    if (undoRedoContainer) {
        undoRedoContainer.style.display = manualDrawMode ? "flex" : "none";
    }

    if (!manualDrawMode) {
        canvasWrapper.style.cursor = "default";
    } else {
        canvasWrapper.style.cursor = "crosshair";
    }

    redrawImage();
}

function clearManualRegions() {
    saveToHistory();
    manualRegions = [];
    updateUndoRedoButtons();
    redrawImage();
    Toast.info("All manual regions cleared");
}

function saveToHistory() {
    if (historyIndex < manualRegionsHistory.length - 1) {
        manualRegionsHistory = manualRegionsHistory.slice(0, historyIndex + 1);
    }

    const stateCopy = JSON.parse(JSON.stringify(manualRegions));
    manualRegionsHistory.push(stateCopy);

    if (manualRegionsHistory.length > MAX_HISTORY) {
        manualRegionsHistory.shift();
    } else {
        historyIndex++;
    }

    updateUndoRedoButtons();
}

function undoManualRegion() {
    if (historyIndex > 0) {
        historyIndex--;
        manualRegions = JSON.parse(JSON.stringify(manualRegionsHistory[historyIndex]));
        updateUndoRedoButtons();
        redrawImage();
        Toast.info(`Undo (Step ${historyIndex}/${manualRegionsHistory.length - 1})`);
    } else if (historyIndex === 0) {
        historyIndex = -1;
        manualRegions = [];
        updateUndoRedoButtons();
        redrawImage();
        Toast.info("Undo (no regions)");
    }
}

function redoManualRegion() {
    if (historyIndex < manualRegionsHistory.length - 1) {
        historyIndex++;
        manualRegions = JSON.parse(JSON.stringify(manualRegionsHistory[historyIndex]));
        updateUndoRedoButtons();
        redrawImage();
        Toast.info(`Redo (Step ${historyIndex}/${manualRegionsHistory.length - 1})`);
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");

    if (undoBtn) {
        undoBtn.disabled = historyIndex < 0;
    }
    if (redoBtn) {
        redoBtn.disabled = historyIndex >= manualRegionsHistory.length - 1;
    }
}

function setupCanvasInteraction() {
    if (!outputCanvas || !canvasWrapper) return;

    let isMouseDown = false;

    outputCanvas.addEventListener("mousedown", (e) => {
        if (!manualDrawMode) {
            // Check if clicking on a face
            const rect = outputCanvas.getBoundingClientRect();
            const scaleX = outputCanvas.width / rect.width;
            const scaleY = outputCanvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;
            handleFaceClick(canvasX, canvasY);
            return;
        }

        isMouseDown = true;
        const rect = outputCanvas.getBoundingClientRect();
        const scaleX = outputCanvas.width / rect.width;
        const scaleY = outputCanvas.height / rect.height;
        drawStart = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    });

    outputCanvas.addEventListener("mousemove", (e) => {
        if (!isMouseDown || !manualDrawMode) return;

        const rect = outputCanvas.getBoundingClientRect();
        const scaleX = outputCanvas.width / rect.width;
        const scaleY = outputCanvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        redrawImage();

        const width = canvasX - drawStart.x;
        const height = canvasY - drawStart.y;

        outputCtx.strokeStyle = "#06b6d4";
        outputCtx.lineWidth = 2;
        outputCtx.setLineDash([5, 5]);
        outputCtx.strokeRect(
            width > 0 ? drawStart.x : canvasX,
            height > 0 ? drawStart.y : canvasY,
            Math.abs(width),
            Math.abs(height)
        );
        outputCtx.setLineDash([]);

        currentDrawRect = {
            x: width > 0 ? drawStart.x : canvasX,
            y: height > 0 ? drawStart.y : canvasY,
            width: Math.abs(width),
            height: Math.abs(height)
        };
    });

    outputCanvas.addEventListener("mouseup", (e) => {
        if (!isMouseDown) return;
        isMouseDown = false;

        if (manualDrawMode && currentDrawRect && currentDrawRect.width > 10 && currentDrawRect.height > 10) {
            saveToHistory();

            const region = {
                x: currentDrawRect.x / outputCanvas.width,
                y: currentDrawRect.y / outputCanvas.height,
                width: currentDrawRect.width / outputCanvas.width,
                height: currentDrawRect.height / outputCanvas.height
            };
            manualRegions.push(region);
            redrawImage();
            Toast.info(`Region added (${manualRegions.length} total)`);
        }
        currentDrawRect = null;
    });

    outputCanvas.addEventListener("mouseleave", () => {
        if (isMouseDown && manualDrawMode) {
            isMouseDown = false;
            currentDrawRect = null;
            redrawImage();
        }
    });
}

function handleFaceClick(canvasX, canvasY) {
    const canvasWidth = outputCanvas.width;
    const canvasHeight = outputCanvas.height;

    for (let i = 0; i < detectedFaces.length; i++) {
        const detection = detectedFaces[i];
        const box = detection.boundingBox;

        const expandedW = box.width * regionExpansion;
        const expandedH = box.height * regionExpansion;
        const expandedX = box.xCenter - expandedW / 2;
        const expandedY = box.yCenter - expandedH / 2;

        const faceX = expandedX * canvasWidth;
        const faceY = expandedY * canvasHeight;
        const faceW = expandedW * canvasWidth;
        const faceH = expandedH * canvasHeight;

        if (canvasX >= faceX && canvasX <= faceX + faceW &&
            canvasY >= faceY && canvasY <= faceY + faceH) {
            faceEnabledStates[i] = !faceEnabledStates[i];
            redrawImage();
            renderFaceList();

            const enabledCount = faceEnabledStates.filter(s => s).length;
            const status = faceEnabledStates[i] ? "enabled" : "disabled";
            showStatus(`Face ${i + 1} ${status} (${enabledCount}/${detectedFaces.length} blurred)`, "success");
            setTimeout(() => hideStatus(), 2000);
            return;
        }
    }
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================
function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
        if (e.code === "Space" && !e.repeat && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            showOriginal();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "o") {
            e.preventDefault();
            const imageInput = document.getElementById("imageInput");
            if (imageInput) {
                imageInput.click();
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            downloadImage();
        }

        if (e.key === "Escape") {
            resetTool();
        }

        if (e.key === "d" && !e.ctrlKey && !e.metaKey) {
            const toggle = document.getElementById("manualDrawMode");
            if (toggle) {
                toggle.checked = !toggle.checked;
                toggleManualDraw();
            }
        }

        if (e.key === "b" && !e.ctrlKey && !e.metaKey) {
            const types = ["gaussian", "pixelate", "mosaic", "box", "motion", "eyes", "skinmask"];
            const currentIndex = types.indexOf(blurType);
            const nextIndex = (currentIndex + 1) % types.length;
            setBlurType(types[nextIndex]);
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
            e.preventDefault();
            if (manualDrawMode || manualRegions.length > 0) {
                undoManualRegion();
            }
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
            e.preventDefault();
            if (manualDrawMode || manualRegions.length > 0) {
                redoManualRegion();
            }
        }
    });

    document.addEventListener("keyup", (e) => {
        if (e.code === "Space") {
            e.preventDefault();
            hideOriginal();
        }
    });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function showStatus(message, type) {
    if (!statusText || !statusIndicator) return;
    statusText.textContent = message;
    statusIndicator.className = `status-indicator ${type}`;
    statusIndicator.style.display = "flex";

    const spinner = document.getElementById("statusSpinner");
    if (spinner) {
        spinner.style.display = type === "loading" ? "block" : "none";
    }
}

function hideStatus() {
    if (statusIndicator) {
        statusIndicator.style.display = "none";
    }
}

function showOriginal() {
    if (!currentImage || !originalImageData) return;
    outputCtx.putImageData(originalImageData, 0, 0);
}

function hideOriginal() {
    if (!currentImage) return;
    applyBlurToCanvas();
}

function downloadImage() {
    if (!currentImage) {
        Toast.warning("Please upload an image first");
        return;
    }

    const link = document.createElement("a");
    link.download = "blurred-image.png";
    link.href = outputCanvas.toDataURL("image/png");
    link.click();
    Toast.success("Image downloaded successfully!");
}

function resetTool() {
    detectedFaces = [];
    faceEnabledStates = [];
    faceLandmarks = [];
    facePreviewThumbnails = [];
    manualRegions = [];
    hasShownFaceToggleHint = false; // Reset hint flag

    manualRegionsHistory = [];
    historyIndex = -1;
    updateUndoRedoButtons();

    renderFaceList();

    if (currentImage) {
        outputCanvas.width = currentImage.width;
        outputCanvas.height = currentImage.height;
        outputCtx.drawImage(currentImage, 0, 0);

        processImage();
    } else {
        clearCanvas();
    }

    faceCountBadge.style.display = "none";
    if (downloadBtn) {
        downloadBtn.disabled = true;
    }

    hideStatus();
}

function clearCanvas() {
    outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    outputCanvas.style.display = "none";
    placeholderContent.style.display = "flex";

    const cameraContainer = document.getElementById("cameraContainer");
    if (cameraContainer) {
        cameraContainer.style.display = "none";
    }
}

function redrawImage() {
    if (currentImage && detectedFaces.length > 0) {
        applyBlurToCanvas();
    }
}

function toggleWarningDetails() {
    const warning = document.getElementById('reversibilityWarning');
    warning.classList.toggle('collapsed');
}
