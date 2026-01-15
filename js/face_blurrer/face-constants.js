// Face Blur Tool - Constants and Shared State
// Centralized constants and global state management

// ============================================================================
// CONSTANTS
// ============================================================================
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_IMAGE_DIMENSION = 4096; // 4K pixels
export const MAX_IMAGE_AREA = 16777216; // 256 megapixels
export const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / (1024 * 1024);
export const MAX_DIMENSION_PX = MAX_IMAGE_DIMENSION;
export const MAX_HISTORY = 50; // Maximum number of history states to store
export const DEBOUNCE_DELAY = 150; // ms
export const MODEL_LOAD_TIMEOUT_MS = 30000; // 30 second timeout

// ============================================================================
// GLOBAL STATE
// ============================================================================
export const state = {
    // MediaPipe instances
    faceDetection: null,
    faceMesh: null,

    // Face detection data
    faceLandmarks: [],
    faceMeshProcessing: false,
    faceMeshProcessed: false,

    // Current image
    currentImage: null,
    detectedFaces: [],
    faceEnabledStates: [],
    facePreviewThumbnails: [],

    // Camera
    camera: null,
    isCameraRunning: false,

    // Settings
    inputType: "image",
    blurType: "gaussian",
    blurIntensity: 50,
    regionExpansion: 1.0,
    confidenceThreshold: 0.5,

    // Manual draw mode
    manualDrawMode: false,
    manualRegions: [],
    isDrawing: false,
    drawStart: { x: 0, y: 0 },
    currentDrawRect: null,

    // History (undo/redo)
    manualRegionsHistory: [],
    historyIndex: -1,

    // Comparison mode
    comparisonMode: 'blurred',
    sliderPosition: 50,
    isDraggingSlider: false,

    // Feature blurring
    featureBlurring: {
        eyes: { enabled: true, intensity: 80 },
        eyebrows: { enabled: false, intensity: 0 },
        nose: { enabled: false, intensity: 0 },
        mouth: { enabled: false, intensity: 0 }
    },

    // Timers
    blurIntensityTimer: null,
    expandRegionTimer: null,

    // Model loading
    faceDetectionReady: false,
    faceMeshReady: false,
    modelLoadTimeout: null,

    // Cached data
    cachedMeshData: [],

    // UI hints
    hasShownFaceToggleHint: false,

    // Canvas data
    originalImageData: null
};

// ============================================================================
// DOM ELEMENTS CACHE
// ============================================================================
export const dom = {
    outputCanvas: null,
    outputCtx: null,
    placeholderContent: null,
    faceCountBadge: null,
    faceCount: null,
    statusIndicator: null,
    statusText: null,
    downloadBtn: null,
    uploadZone: null,
    canvasWrapper: null
};

// ============================================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================================
// Helper function to create SVG icon element safely
function createToastIcon(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');

    switch (type) {
        case 'success':
            const checkPolyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            checkPolyline.setAttribute('points', '20 6 9 17 4 12');
            svg.appendChild(checkPolyline);
            break;
        case 'warning':
            const warningPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            warningPath.setAttribute('d', 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z');
            const warningLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            warningLine1.setAttribute('x1', '12');
            warningLine1.setAttribute('y1', '9');
            warningLine1.setAttribute('x2', '12');
            warningLine1.setAttribute('y2', '13');
            const warningLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            warningLine2.setAttribute('x1', '12');
            warningLine2.setAttribute('y1', '17');
            warningLine2.setAttribute('x2', '12.01');
            warningLine2.setAttribute('y2', '17');
            svg.appendChild(warningPath);
            svg.appendChild(warningLine1);
            svg.appendChild(warningLine2);
            break;
        case 'error':
            const errorCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            errorCircle.setAttribute('cx', '12');
            errorCircle.setAttribute('cy', '12');
            errorCircle.setAttribute('r', '10');
            const errorLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            errorLine1.setAttribute('x1', '15');
            errorLine1.setAttribute('y1', '9');
            errorLine1.setAttribute('x2', '9');
            errorLine1.setAttribute('y2', '15');
            const errorLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            errorLine2.setAttribute('x1', '9');
            errorLine2.setAttribute('y1', '9');
            errorLine2.setAttribute('x2', '15');
            errorLine2.setAttribute('y2', '15');
            svg.appendChild(errorCircle);
            svg.appendChild(errorLine1);
            svg.appendChild(errorLine2);
            break;
        default: // info
            const infoCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            infoCircle.setAttribute('cx', '12');
            infoCircle.setAttribute('cy', '12');
            infoCircle.setAttribute('r', '10');
            const infoLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            infoLine1.setAttribute('x1', '12');
            infoLine1.setAttribute('y1', '16');
            infoLine1.setAttribute('x2', '12');
            infoLine1.setAttribute('y2', '12');
            const infoLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            infoLine2.setAttribute('x1', '12');
            infoLine2.setAttribute('y1', '8');
            infoLine2.setAttribute('x2', '12.01');
            infoLine2.setAttribute('y2', '8');
            svg.appendChild(infoCircle);
            svg.appendChild(infoLine1);
            svg.appendChild(infoLine2);
    }
    return svg;
}

export const Toast = {
    show(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        // Safely create icon and message elements
        const icon = createToastIcon(type);
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message; // Safe: uses textContent, not innerHTML

        toast.appendChild(icon);
        toast.appendChild(messageSpan);
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
