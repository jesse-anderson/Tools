// Face Blur Tool - Face Detection and Camera
// MediaPipe initialization, camera handling, face detection results

import { state, dom, Toast, MODEL_LOAD_TIMEOUT_MS } from './face-constants.js';
import { LEFT_EYE_INDICES, RIGHT_EYE_INDICES, LEFT_BROW_INDICES, RIGHT_BROW_INDICES, NOSE_INDICES, MOUTH_INDICES, FACE_OVAL_INDICES } from './landmarks.js';

// ============================================================================
// FACE DETECTION INITIALIZATION
// ============================================================================
export async function initializeFaceDetection() {
    showStatus("Loading MediaPipe Face Detection...", "loading");

    state.modelLoadTimeout = setTimeout(() => {
        if (!state.faceDetectionReady) {
            showStatus("MediaPipe loading timeout. Check your internet connection.", "error");
            Toast.error("Face Detection models failed to load. Please refresh the page.");
        }
    }, MODEL_LOAD_TIMEOUT_MS);

    try {
        state.faceDetection = new FaceDetection({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
        });

        state.faceDetection.setOptions({
            model: "short",
            minDetectionConfidence: state.confidenceThreshold
        });

        state.faceDetection.onResults((results) => {
            if (state.modelLoadTimeout && !state.faceDetectionReady) {
                clearTimeout(state.modelLoadTimeout);
                state.modelLoadTimeout = null;
            }
            state.faceDetectionReady = true;
            onResults(results);
        });

        console.log("MediaPipe Face Detection initialized");
    } catch (error) {
        clearTimeout(state.modelLoadTimeout);
        showStatus("Error loading Face Detection", "error");
        console.error("Face Detection initialization error:", error);
        Toast.error("Failed to initialize Face Detection: " + error.message);
    }
}

export async function initializeFaceMesh() {
    try {
        state.faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        state.faceMesh.setOptions({
            maxNumFaces: 10,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        state.faceMesh.onResults((results) => {
            state.faceMeshReady = true;
            onFaceMeshResults(results);
        });

        console.log("MediaPipe Face Mesh initialized");
    } catch (error) {
        showStatus("Error loading Face Mesh", "error");
        console.error("Face Mesh initialization error:", error);
        Toast.error("Failed to initialize Face Mesh: " + error.message);
    }
}

export async function processWithFaceMesh() {
    if (!state.faceMesh || !state.currentImage) return false;

    state.faceMeshProcessing = true;
    state.faceMeshProcessed = false;

    try {
        await state.faceMesh.send({ image: state.currentImage });
        await new Promise(resolve => setTimeout(resolve, 50));
        state.faceMeshProcessing = false;
        state.faceMeshProcessed = true;
        return true;
    } catch (error) {
        state.faceMeshProcessing = false;
        console.error("Face Mesh processing error:", error);
        return false;
    }
}

// ============================================================================
// CAMERA HANDLING
// ============================================================================
export async function startCamera() {
    try {
        const video = document.getElementById("cameraVideo");
        const cameraContainer = document.getElementById("cameraContainer");

        // Clear previous image state
        state.currentImage = null;
        state.originalImageData = null;
        state.detectedFaces = [];
        state.faceEnabledStates = [];
        state.faceLandmarks = [];
        state.facePreviewThumbnails = [];
        state.manualRegions = [];

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
        state.isCameraRunning = true;

        const camera = new Camera(video, {
            onFrame: async () => {
                await state.faceDetection.send({ image: video });
            },
            width: 640,
            height: 480
        });

        await camera.start();
        state.camera = camera;

        cameraContainer.classList.remove("hidden");
        dom.placeholderContent?.classList.add("hidden");
        dom.outputCanvas?.classList.add("hidden");

        // Clear face count badge
        if (dom.faceCount) dom.faceCount.textContent = "0";
        if (dom.faceCountBadge) dom.faceCountBadge.classList.add("hidden");

        // Update face list (will be empty)
        renderFaceList();

        // Update button states
        const startBtn = document.getElementById("startCameraBtn");
        const stopBtn = document.getElementById("stopCameraBtn");
        const captureBtn = document.getElementById("captureBtn");

        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (captureBtn) captureBtn.disabled = false;

        showStatus("Camera active", "success");
        setTimeout(() => hideStatus(), 2000);

    } catch (error) {
        console.error("Camera error:", error);

        // Provide specific guidance based on error type
        let userMessage = "Camera access failed.";
        let detailedMessage = "";

        switch (error.name) {
            case 'NotAllowedError':
            case 'PermissionDeniedError':
                userMessage = "Camera access denied";
                detailedMessage = "Click the lock/info icon in your address bar and allow camera access, then refresh.";
                break;

            case 'NotFoundError':
            case 'DevicesNotFoundError':
                userMessage = "No camera found";
                detailedMessage = "Please connect a camera and ensure it's not in use by another application.";
                break;

            case 'NotReadableError':
            case 'TrackStartError':
                userMessage = "Camera not available";
                detailedMessage = "Your camera may be in use by another application or browser tab.";
                break;

            case 'OverconstrainedError':
            case 'ConstraintNotSatisfiedError':
                userMessage = "Camera constraints not met";
                detailedMessage = "Your camera doesn't support the required settings.";
                break;

            case 'TypeError':
                userMessage = "Camera not supported";
                detailedMessage = "Your browser may not support camera access. Try using Chrome, Firefox, or Edge.";
                break;

            case 'SecurityError':
                userMessage = "Security restriction";
                detailedMessage = "Camera access is blocked. Ensure you're using HTTPS or localhost.";
                break;

            default:
                detailedMessage = "Error: " + (error.message || "Unknown error");
        }

        showStatus(userMessage, "error");
        if (detailedMessage) {
            Toast.warning(`${userMessage}. ${detailedMessage}`, 8000);
        } else {
            Toast.error(userMessage);
        }
    }
}

export function stopCamera() {
    if (state.camera) {
        state.camera.stop();
        state.camera = null;
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

    state.isCameraRunning = false;

    const cameraContainer = document.getElementById("cameraContainer");
    if (cameraContainer) {
        cameraContainer.classList.add("hidden");
    }

    if (dom.placeholderContent) dom.placeholderContent.classList.remove("hidden");
    if (dom.outputCanvas) dom.outputCanvas.classList.add("hidden");

    // Update button states
    const startBtn = document.getElementById("startCameraBtn");
    const stopBtn = document.getElementById("stopCameraBtn");
    const captureBtn = document.getElementById("captureBtn");

    if (stopBtn) stopBtn.disabled = true;
    if (captureBtn) captureBtn.disabled = true;
    if (startBtn) startBtn.disabled = false;

    hideStatus();
}

export async function captureFrame() {
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
        state.currentImage = img;
        state.hasShownFaceToggleHint = false; // Reset hint for new captured image

        // Set up output canvas with captured image
        dom.outputCanvas.width = img.width;
        dom.outputCanvas.height = img.height;
        dom.outputCtx.drawImage(img, 0, 0);

        // Store original image data
        state.originalImageData = dom.outputCtx.getImageData(0, 0, dom.outputCanvas.width, dom.outputCanvas.height);

        // Show comparison toggle
        document.getElementById('comparisonToggle').classList.remove('hidden');

        // Import and call setComparisonMode
        const { setComparisonMode } = await import('./face-ui.js');
        setComparisonMode('blurred');

        // Switch to image mode view
        dom.placeholderContent?.classList.add("hidden");
        dom.outputCanvas?.classList.remove("hidden");

        // Enable download
        if (dom.downloadBtn) {
            dom.downloadBtn.disabled = false;
        }

        // Import and run processImage
        const { processImage } = await import('./face-blur.js');
        await processImage();

        Toast.success("Frame captured! You can now adjust blur settings.");
    };
    img.onerror = () => {
        showStatus("Error processing captured frame", "error");
    };
    img.src = tempCanvas.toDataURL("image/png");
}

function drawCameraOverlays(results) {
    const video = document.getElementById("cameraVideo");
    const cameraCanvas = document.getElementById("cameraCanvas");

    if (!video || !cameraCanvas) return;

    const cameraCtx = cameraCanvas.getContext("2d");

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
            const expandedW = box.width * cameraCanvas.width * state.regionExpansion;
            const expandedH = box.height * cameraCanvas.height * state.regionExpansion;
            const expandedX = (box.xCenter * cameraCanvas.width) - expandedW / 2;
            const expandedY = (box.yCenter * cameraCanvas.height) - expandedH / 2;

            cameraCtx.strokeStyle = "#f59e0b";
            cameraCtx.lineWidth = 3;
            cameraCtx.strokeRect(expandedX, expandedY, expandedW, expandedH);
        }
    }

    // Update face count badge
    if (results && results.detections) {
        if (dom.faceCount) dom.faceCount.textContent = results.detections.length;
        if (dom.faceCountBadge) {
            dom.faceCountBadge.classList.toggle("hidden", results.detections.length === 0);
        }
    }
}

// ============================================================================
// FACE DETECTION RESULTS
// ============================================================================
export function onResults(results) {
    if (!results || !results.detections) {
        showStatus("No faces detected", "success");
        setTimeout(() => hideStatus(), 2000);
        renderFaceList();
        return;
    }

    state.detectedFaces = results.detections;

    while (state.faceEnabledStates.length < state.detectedFaces.length) {
        state.faceEnabledStates.push(true);
    }
    if (state.faceEnabledStates.length > state.detectedFaces.length) {
        state.faceEnabledStates = state.faceEnabledStates.slice(0, state.detectedFaces.length);
    }

    // Camera mode: skip expensive UI operations, just draw overlays
    if (state.isCameraRunning) {
        drawCameraOverlays(results);
        return;
    }

    // Static image mode: full UI processing
    generateFaceThumbnails();

    if (dom.faceCount) dom.faceCount.textContent = state.detectedFaces.length;
    if (dom.faceCountBadge) {
        dom.faceCountBadge.classList.toggle("hidden", state.detectedFaces.length === 0);
    }

    if (state.detectedFaces.length > 0) {
        const enabledCount = state.faceEnabledStates.filter(s => s).length;
        showStatus(`${state.detectedFaces.length} face(s) detected (${enabledCount} blurred)`, "success");
        setTimeout(() => hideStatus(), 2000);

        // Only show the toggle hint once for static images
        if (!state.hasShownFaceToggleHint) {
            Toast.info("Click on a face in the list or canvas to toggle blur on/off");
            state.hasShownFaceToggleHint = true;
        }
    }

    renderFaceList();

    if (state.currentImage) {
        processWithFaceMesh();
    }

    // Import applyBlurToCanvas from renderer
    import('./face-renderer.js').then(module => {
        module.applyBlurToCanvas();
    });

    if (dom.downloadBtn) {
        dom.downloadBtn.disabled = false;
    }

    // Import updateIdentityScore from UI
    import('./face-ui.js').then(module => {
        module.updateIdentityScore();
    });
}

function onFaceMeshResults(results) {
    if (results && results.multiFaceLandmarks) {
        state.faceLandmarks = results.multiFaceLandmarks;
        console.log(`Face Mesh detected ${state.faceLandmarks.length} face(s) with landmarks`);
        cacheMeshData();
    }
}

function cacheMeshData() {
    state.cachedMeshData = [];

    for (const mesh of state.faceLandmarks) {
        const cached = {
            mesh: mesh,
            bounds: { minX: 1, minY: 1, maxX: 0, maxY: 0 },
            center: { x: 0, y: 0 },
            features: {
                leftEye: [], rightEye: [], leftBrow: [], rightBrow: [],
                nose: [], mouth: [], faceContour: [], lowerFace: []
            }
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

        state.cachedMeshData.push(cached);
    }

    console.log(`Cached ${state.cachedMeshData.length} face mesh data entries`);
}

export function findMatchingFaceMesh(box) {
    if (!state.cachedMeshData || state.cachedMeshData.length === 0) return null;

    const boxCenterX = box.xCenter;
    const boxCenterY = box.yCenter;

    let bestMatch = null;
    let bestDistance = Infinity;

    for (const cached of state.cachedMeshData) {
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

function generateFaceThumbnails() {
    state.facePreviewThumbnails = [];

    if (!state.currentImage || !dom.outputCanvas) return;

    const canvasWidth = dom.outputCanvas.width;
    const canvasHeight = dom.outputCanvas.height;

    for (let i = 0; i < state.detectedFaces.length; i++) {
        const detection = state.detectedFaces[i];
        const box = detection.boundingBox;

        const expandedW = box.width * state.regionExpansion;
        const expandedH = box.height * state.regionExpansion;
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
            const faceData = dom.outputCtx.getImageData(canvasX, canvasY, canvasW, canvasH);
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

        state.facePreviewThumbnails.push(thumbCanvas.toDataURL());
    }
}

// ============================================================================
// FACE LIST UI
// ============================================================================
export function renderFaceList() {
    const panel = document.getElementById('faceListPanel');
    const itemsContainer = document.getElementById('faceListItems');

    if (!state.detectedFaces || state.detectedFaces.length === 0) {
        if (panel) panel.classList.remove('has-faces');
        if (itemsContainer) {
            // Safe: remove all children
            while (itemsContainer.firstChild) {
                itemsContainer.removeChild(itemsContainer.firstChild);
            }
        }
        return;
    }

    if (panel) panel.classList.add('has-faces');

    // Clear existing items safely
    if (itemsContainer) {
        while (itemsContainer.firstChild) {
            itemsContainer.removeChild(itemsContainer.firstChild);
        }

        // Create face list items using DOM methods (no innerHTML)
        for (let i = 0; i < state.detectedFaces.length; i++) {
            const isEnabled = state.faceEnabledStates[i] || false;
            const thumbnail = state.facePreviewThumbnails[i] || '';
            const confidence = Math.round((state.detectedFaces[i].score?.[0] || 0.5) * 100);

            const item = document.createElement('div');
            item.className = `face-list-item ${!isEnabled ? 'disabled' : ''}`;
            item.dataset.index = i;
            item.setAttribute('role', 'checkbox');
            item.setAttribute('aria-checked', isEnabled);
            item.setAttribute('aria-label', `Face ${i + 1}, ${confidence}% confidence, currently ${isEnabled ? 'blurred' : 'visible'}`);

            // Toggle label
            const label = document.createElement('label');
            label.className = 'face-list-toggle';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            if (isEnabled) checkbox.checked = true;
            checkbox.addEventListener('change', () => toggleFaceEnabled(i));

            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'toggle-slider';

            label.appendChild(checkbox);
            label.appendChild(toggleSlider);
            item.appendChild(label);

            // Thumbnail or placeholder
            if (thumbnail) {
                const img = document.createElement('img');
                img.src = thumbnail;
                img.className = 'face-list-preview';
                img.alt = `Face ${i + 1}`;
                item.appendChild(img);
            } else {
                const placeholder = document.createElement('div');
                placeholder.className = 'face-list-preview';
                item.appendChild(placeholder);
            }

            // Label text
            const labelText = document.createElement('span');
            labelText.className = 'face-list-label';
            labelText.textContent = `Face ${i + 1} (${confidence}% confidence)`;
            item.appendChild(labelText);

            itemsContainer.appendChild(item);
        }
    }
}

export function toggleFaceEnabled(index) {
    if (index >= 0 && index < state.faceEnabledStates.length) {
        state.faceEnabledStates[index] = !state.faceEnabledStates[index];
        renderFaceList();

        import('./face-renderer.js').then(module => {
            module.redrawImage();
        });

        import('./face-ui.js').then(module => {
            module.updateIdentityScore();
        });

        const enabledCount = state.faceEnabledStates.filter(s => s).length;
        const status = state.faceEnabledStates[index] ? 'enabled' : 'disabled';
        Toast.info(`Face ${index + 1} ${status} (${enabledCount}/${state.detectedFaces.length} blurred)`);
    }
}

export function selectAllFaces(select) {
    const newState = select;
    state.faceEnabledStates = state.faceEnabledStates.map(() => newState);
    renderFaceList();

    import('./face-renderer.js').then(module => {
        module.redrawImage();
    });

    const enabledCount = state.faceEnabledStates.filter(s => s).length;
    Toast.info(`${newState ? 'Selected' : 'Deselected'} all faces (${enabledCount}/${state.detectedFaces.length} blurred)`);
}

// Note: toggleFaceEnabled is now attached via addEventListener in renderFaceList(),
// no longer exported globally for inline handlers (security improvement)

// ============================================================================
// STATUS HELPERS
// ============================================================================
function showStatus(message, type) {
    if (!dom.statusText || !dom.statusIndicator) return;
    dom.statusText.textContent = message;
    dom.statusIndicator.className = `status-indicator ${type}`;

    const spinner = document.getElementById("statusSpinner");
    if (spinner) {
        spinner.classList.toggle("hidden", type !== "loading");
    }
}

function hideStatus() {
    if (dom.statusIndicator) {
        dom.statusIndicator.className = "status-indicator";
    }
}
