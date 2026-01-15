// Face Blur Tool - Main Entry Point
// DOM initialization, file input handling, utility functions

import { state, dom, Toast, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, MAX_IMAGE_DIMENSION, MAX_DIMENSION_PX, MAX_IMAGE_AREA, MODEL_LOAD_TIMEOUT_MS } from './face-constants.js';
import { initializeFaceDetection, initializeFaceMesh, stopCamera } from './face-detection.js';
import { setupComparisonSlider, setComparisonMode, showStatus, hideStatus } from './face-ui.js';
import { setupCanvasInteraction, setupKeyboardShortcuts } from './face-renderer.js';
import { setupEventHandlers } from './event-handlers.js';

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize the tool - handles both module and traditional script loading
function initializeTool() {
    console.log('[FaceBlur] initializeTool called', {
        faceDetection: typeof FaceDetection,
        faceMesh: typeof FaceMesh,
        readyState: document.readyState
    });

    // Wait for MediaPipe libraries to be available
    if (typeof FaceDetection === 'undefined' || typeof FaceMesh === 'undefined') {
        // MediaPipe not loaded yet, retry in a bit
        console.log('[FaceBlur] MediaPipe not ready, retrying...');
        setTimeout(initializeTool, 100);
        return;
    }

    // Cache DOM elements
    dom.outputCanvas = document.getElementById("outputCanvas");
    console.log('[FaceBlur] outputCanvas:', dom.outputCanvas);
    if (dom.outputCanvas) {
        dom.outputCtx = dom.outputCanvas.getContext("2d");
    }
    dom.placeholderContent = document.getElementById("placeholderContent");
    dom.faceCountBadge = document.getElementById("faceCountBadge");
    dom.faceCount = document.getElementById("faceCount");
    dom.statusIndicator = document.getElementById("statusIndicator");
    dom.statusText = document.getElementById("statusText");
    dom.downloadBtn = document.getElementById("downloadBtn");
    dom.uploadZone = document.getElementById("uploadZone");
    dom.canvasWrapper = document.getElementById("canvasWrapper");

    console.log('[FaceBlur] DOM elements cached:', {
        outputCanvas: !!dom.outputCanvas,
        uploadZone: !!dom.uploadZone
    });

    initializeFaceDetection();
    initializeFaceMesh();
    setupDragAndDrop();
    setupCanvasInteraction();
    setupKeyboardShortcuts();
    setupComparisonSlider();
    setupEventHandlers(); // Set up all event listeners (replaces inline handlers)
    console.log('[FaceBlur] Initialization complete');
}

// Check if DOM is already loaded (for deferred modules)
// Modules are deferred, so we need to wait for DOMContentLoaded
document.addEventListener("DOMContentLoaded", initializeTool);

// ============================================================================
// INPUT TYPE SELECTION
// ============================================================================
export function setInputType(type) {
    state.inputType = type;

    document.querySelectorAll(".input-type-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.type === type);
    });

    const uploadSection = document.getElementById("uploadSection");
    const cameraSection = document.getElementById("cameraSection");

    if (type === "image") {
        uploadSection?.classList.remove("hidden");
        cameraSection?.classList.add("hidden");

        stopCamera();
    } else {
        uploadSection?.classList.add("hidden");
        cameraSection?.classList.remove("hidden");
        clearCanvas();
    }
}

// ============================================================================
// FILE UPLOAD HANDLING
// ============================================================================
export function handleImageUpload(event) {
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
        loadImage(e.target.result);
    };
    reader.readAsDataURL(file);
}

function setupDragAndDrop() {
    if (!dom.uploadZone) return;

    dom.uploadZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dom.uploadZone.classList.add("dragover");
    });

    dom.uploadZone.addEventListener("dragleave", () => {
        dom.uploadZone.classList.remove("dragover");
    });

    dom.uploadZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dom.uploadZone.classList.remove("dragover");

        const file = e.dataTransfer.files[0];
        if (file && file.type.match("image.*")) {
            if (file.size > MAX_FILE_SIZE) {
                Toast.error(`File too large! Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                loadImage(e.target.result);
            };
            reader.readAsDataURL(file);
        } else {
            Toast.error("Please drop an image file (JPG, PNG, WebP)");
        }
    });
}

function loadImage(imageSrc) {
    console.log('[FaceBlur] loadImage called with imageSrc length:', imageSrc?.length);
    const img = new Image();
    img.onload = () => {
        console.log('[FaceBlur] Image loaded:', { width: img.width, height: img.height });
        // Validate image dimensions before processing
        if (img.width > MAX_IMAGE_DIMENSION || img.height > MAX_IMAGE_DIMENSION) {
            Toast.error(`Image too large! Maximum dimension is ${MAX_DIMENSION_PX}px. Your image is ${img.width}x${img.height}px.`);
            return;
        }

        // Validate total pixel area to prevent memory issues
        const imageArea = img.width * img.height;
        if (imageArea > MAX_IMAGE_AREA) {
            Toast.error(`Image area too large! Maximum is ${MAX_IMAGE_AREA.toLocaleString()} pixels. Your image has ${imageArea.toLocaleString()} pixels.`);
            return;
        }

        state.currentImage = img;
        state.hasShownFaceToggleHint = false;

        dom.outputCanvas.width = img.width;
        dom.outputCanvas.height = img.height;

        dom.outputCtx.drawImage(img, 0, 0);
        console.log('[FaceBlur] Image drawn to canvas');

        state.originalImageData = dom.outputCtx.getImageData(0, 0, dom.outputCanvas.width, dom.outputCanvas.height);
        console.log('[FaceBlur] Original image data captured');

        dom.placeholderContent?.classList.add("hidden");
        dom.outputCanvas.classList.remove("hidden");
        console.log('[FaceBlur] Canvas displayed, placeholder hidden');

        document.getElementById('comparisonToggle').classList.remove('hidden');

        setComparisonMode('blurred');

        processImage();
    };
    img.onerror = () => {
        console.error('[FaceBlur] Error loading image');
        showStatus("Error loading image", "error");
        setTimeout(() => {
            hideStatus();
        }, 3000);
    };
    img.src = imageSrc;
}

// ============================================================================
// IMAGE PROCESSING
// ============================================================================
export async function processImage() {
    if (!state.faceDetection || !state.currentImage) return;

    showStatus("Detecting faces...", "loading");

    try {
        await state.faceDetection.send({ image: state.currentImage });
    } catch (error) {
        showStatus("Error detecting faces", "error");
        console.error("Face detection error:", error);
    }
}

// Note: processImage is imported directly by face-detection.js

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function clearCanvas() {
    dom.outputCtx.clearRect(0, 0, dom.outputCanvas.width, dom.outputCanvas.height);
    dom.outputCanvas.classList.add("hidden");
    dom.placeholderContent?.classList.remove("hidden");

    const cameraContainer = document.getElementById("cameraContainer");
    if (cameraContainer) {
        cameraContainer.classList.add("hidden");
    }
}
