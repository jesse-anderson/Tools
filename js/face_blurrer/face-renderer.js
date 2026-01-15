// Face Blur Tool - Canvas Rendering and Interaction
// Blur application, canvas drawing, manual draw mode, undo/redo, keyboard shortcuts

import { state, dom, Toast, MAX_HISTORY } from './face-constants.js';
import { LEFT_EYE_INDICES, RIGHT_EYE_INDICES, LEFT_BROW_INDICES, RIGHT_BROW_INDICES, NOSE_INDICES, MOUTH_INDICES, FACE_OVAL_INDICES } from './landmarks.js';

// ============================================================================
// BLUR APPLICATION (Main Canvas)
// ============================================================================
export async function applyBlurToCanvas() {
    if (!state.currentImage) {
        dom.outputCtx.clearRect(0, 0, dom.outputCanvas.width, dom.outputCanvas.height);
        return;
    }

    const canvasWidth = dom.outputCanvas.width;
    const canvasHeight = dom.outputCanvas.height;

    if (state.originalImageData) {
        dom.outputCtx.putImageData(state.originalImageData, 0, 0);
    } else {
        dom.outputCtx.drawImage(state.currentImage, 0, 0);
    }

    // Import blur algorithms
    const { applyBlurToRegion } = await import('./blur-algorithms.js');
    const { applyEyesOnlyBlur, applyFeaturesBlur } = await import('./feature-blur.js');

    for (let i = 0; i < state.detectedFaces.length; i++) {
        if (!state.faceEnabledStates[i]) continue;

        const detection = state.detectedFaces[i];
        const box = detection.boundingBox;

        const { findMatchingFaceMesh } = await import('./face-detection.js');
        const mesh = findMatchingFaceMesh(box);

        if (mesh) {
            if (state.blurType === "eyes") {
                const intensity = state.blurIntensity / 100;
                applyEyesOnlyBlur(dom.outputCtx, mesh, canvasWidth, canvasHeight, intensity);
            } else if (state.blurType === "features") {
                await applyFeaturesBlur(dom.outputCtx, 0, 0, canvasWidth, canvasHeight, detection, dom.outputCanvas, state.faceLandmarks, state.featureBlurring);
            } else {
                await applyOvalBlurToFace(dom.outputCtx, mesh, canvasWidth, canvasHeight, i);
            }
        } else {
            const x = box.xCenter - box.width / 2;
            const y = box.yCenter - box.height / 2;

            const expandedW = box.width * state.regionExpansion;
            const expandedH = box.height * state.regionExpansion;
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

            await applyBlurToRegion(dom.outputCtx, clampedX, clampedY, clampedW, clampedH, detection, state.blurType, state.blurIntensity, state.regionExpansion, dom.outputCanvas, state.faceLandmarks, state.featureBlurring);
        }
    }

    // Draw face boxes for detected faces if enabled
    const showBoxes = document.getElementById("showFaceBoxes");
    if (showBoxes && showBoxes.checked) {
        for (let i = 0; i < state.detectedFaces.length; i++) {
            const detection = state.detectedFaces[i];
            const box = detection.boundingBox;

            const expandedW = box.width * state.regionExpansion;
            const expandedH = box.height * state.regionExpansion;
            const expandedX = box.xCenter - expandedW / 2;
            const expandedY = box.yCenter - expandedH / 2;

            const canvasX = expandedX * canvasWidth;
            const canvasY = expandedY * canvasHeight;
            const canvasW = expandedW * canvasWidth;
            const canvasH = expandedH * canvasHeight;

            const isEnabled = state.faceEnabledStates[i] !== false;
            dom.outputCtx.strokeStyle = isEnabled ? "#22c55e" : "#ef4444";
            dom.outputCtx.lineWidth = 2;
            dom.outputCtx.setLineDash([]);
            dom.outputCtx.strokeRect(canvasX, canvasY, canvasW, canvasH);
        }
    }

    // Apply blur to manual regions (applyBlurToRegion already imported above)
    for (const region of state.manualRegions) {
        const canvasX = region.x * canvasWidth;
        const canvasY = region.y * canvasHeight;
        const canvasW = region.width * canvasWidth;
        const canvasH = region.height * canvasHeight;

        await applyBlurToRegion(dom.outputCtx, canvasX, canvasY, canvasW, canvasH, null, state.blurType, state.blurIntensity, state.regionExpansion, dom.outputCanvas, state.faceLandmarks, state.featureBlurring);

        if (showBoxes && showBoxes.checked) {
            dom.outputCtx.strokeStyle = "#06b6d4";
            dom.outputCtx.lineWidth = 3;
            dom.outputCtx.setLineDash([2, 2]);
            dom.outputCtx.strokeRect(canvasX, canvasY, canvasW, canvasH);
            dom.outputCtx.setLineDash([]);
        }
    }

    drawFaceMeshLandmarks(dom.outputCtx, canvasWidth, canvasHeight);
}

async function applyOvalBlurToFace(ctx, mesh, canvasWidth, canvasHeight, faceIndex) {
    const cachedMesh = state.cachedMeshData.find(c => c.mesh === mesh);

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
    const width = (maxX - minX) * state.regionExpansion;
    const height = (maxY - minY) * state.regionExpansion;

    const ovalX = centerX * canvasWidth;
    const ovalY = centerY * canvasHeight;
    const ovalRx = (width / 2) * canvasWidth;
    const ovalRy = (height / 2) * canvasHeight;

    const rectX = Math.max(0, Math.round(ovalX - ovalRx));
    const rectY = Math.max(0, Math.round(ovalY - ovalRy));
    const rectW = Math.min(canvasWidth - rectX, Math.round(ovalRx * 2));
    const rectH = Math.min(canvasHeight - rectY, Math.round(ovalRy * 2));

    const { canvasPool } = await import('./blur-utils.js');
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

    const { applyBlurToImageData } = await import('./blur-algorithms.js');
    await applyBlurToImageData(tempCtx, imageData, 0, 0, rectW, rectH, state.blurType, state.blurIntensity);

    tempCtx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ovalX, ovalY, ovalRx, ovalRy, 0, 0, 2 * Math.PI);
    ctx.clip();
    ctx.drawImage(tempCanvas, rectX, rectY);
    ctx.restore();

    const showBoxes = document.getElementById("showFaceBoxes");
    if (showBoxes && showBoxes.checked) {
        ctx.strokeStyle = state.faceEnabledStates[faceIndex] ? "#22c55e" : "#ef4444";
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
    const width = (maxX - minX) * state.regionExpansion;
    const height = (maxY - minY) * state.regionExpansion;

    const ovalX = centerX * canvasWidth;
    const ovalY = centerY * canvasHeight;
    const ovalRx = (width / 2) * canvasWidth;
    const ovalRy = (height / 2) * canvasHeight;

    const { canvasPool } = await import('./blur-utils.js');
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
    const { applyBlurToImageData } = await import('./blur-algorithms.js');
    await applyBlurToImageData(tempCtx, imageData, rectX, rectY, rectW, rectH, state.blurType, state.blurIntensity);

    tempCtx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ovalX, ovalY, ovalRx, ovalRy, 0, 0, 2 * Math.PI);
    ctx.clip();
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();

    const showBoxes = document.getElementById("showFaceBoxes");
    if (showBoxes && showBoxes.checked) {
        ctx.strokeStyle = state.faceEnabledStates[faceIndex] ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.ellipse(ovalX, ovalY, ovalRx, ovalRy, 0, 0, 2 * Math.PI);
        ctx.stroke();
    }
}

// Draw Face Mesh landmarks visualization
function drawFaceMeshLandmarks(ctx, canvasWidth, canvasHeight) {
    if (!state.faceLandmarks || state.faceLandmarks.length === 0) return;

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

    for (const mesh of state.faceLandmarks) {
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
// REDRAW WRAPPER
// ============================================================================
export function redrawImage() {
    if (state.currentImage && state.detectedFaces.length > 0) {
        applyBlurToCanvas();
    }
}

// ============================================================================
// PREVIEW CONTROLS
// ============================================================================
export function showOriginal() {
    if (!state.currentImage || !state.originalImageData) return;
    dom.outputCtx.putImageData(state.originalImageData, 0, 0);
}

export function hideOriginal() {
    if (!state.currentImage) return;
    applyBlurToCanvas();
}

// ============================================================================
// MANUAL DRAW & UNDO/REDO
// ============================================================================
export function toggleManualDraw() {
    state.manualDrawMode = document.getElementById("manualDrawMode").checked;
    const clearBtn = document.getElementById("clearManualBtn");
    const undoRedoContainer = document.getElementById("undoRedoContainer");

    if (clearBtn) {
        clearBtn.classList.toggle("hidden", !state.manualDrawMode);
    }
    if (undoRedoContainer) {
        undoRedoContainer.classList.toggle("hidden", !state.manualDrawMode);
    }

    // Update cursor if canvas wrapper exists
    if (dom.canvasWrapper) {
        dom.canvasWrapper.style.cursor = state.manualDrawMode ? "crosshair" : "default";
    }

    redrawImage();
}

export function clearManualRegions() {
    saveToHistory();
    state.manualRegions = [];
    updateUndoRedoButtons();
    redrawImage();
    Toast.info("All manual regions cleared");
}

function saveToHistory() {
    if (state.historyIndex < state.manualRegionsHistory.length - 1) {
        state.manualRegionsHistory = state.manualRegionsHistory.slice(0, state.historyIndex + 1);
    }

    const stateCopy = JSON.parse(JSON.stringify(state.manualRegions));
    state.manualRegionsHistory.push(stateCopy);

    if (state.manualRegionsHistory.length > MAX_HISTORY) {
        state.manualRegionsHistory.shift();
    } else {
        state.historyIndex++;
    }

    updateUndoRedoButtons();
}

export function undoManualRegion() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        state.manualRegions = JSON.parse(JSON.stringify(state.manualRegionsHistory[state.historyIndex]));
        updateUndoRedoButtons();
        redrawImage();
        Toast.info(`Undo (Step ${state.historyIndex}/${state.manualRegionsHistory.length - 1})`);
    } else if (state.historyIndex === 0) {
        state.historyIndex = -1;
        state.manualRegions = [];
        updateUndoRedoButtons();
        redrawImage();
        Toast.info("Undo (no regions)");
    }
}

export function redoManualRegion() {
    if (state.historyIndex < state.manualRegionsHistory.length - 1) {
        state.historyIndex++;
        state.manualRegions = JSON.parse(JSON.stringify(state.manualRegionsHistory[state.historyIndex]));
        updateUndoRedoButtons();
        redrawImage();
        Toast.info(`Redo (Step ${state.historyIndex}/${state.manualRegionsHistory.length - 1})`);
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");

    if (undoBtn) {
        undoBtn.disabled = state.historyIndex < 0;
    }
    if (redoBtn) {
        redoBtn.disabled = state.historyIndex >= state.manualRegionsHistory.length - 1;
    }
}

// ============================================================================
// CANVAS INTERACTION
// ============================================================================
export function setupCanvasInteraction() {
    if (!dom.outputCanvas || !dom.canvasWrapper) return;

    let isMouseDown = false;

    // Helper to get canvas coordinates from event (mouse or touch)
    const getCanvasCoords = (e) => {
        const rect = dom.outputCanvas.getBoundingClientRect();
        const scaleX = dom.outputCanvas.width / rect.width;
        const scaleY = dom.outputCanvas.height / rect.height;

        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    // Handle start of interaction (mouse or touch)
    const handleStart = (e) => {
        const coords = getCanvasCoords(e);

        if (!state.manualDrawMode) {
            handleFaceClick(coords.x, coords.y);
            return;
        }

        isMouseDown = true;
        state.drawStart = coords;

        // Prevent scrolling on touch devices when in manual draw mode
        if (e.type === 'touchstart') {
            e.preventDefault();
        }
    };

    // Handle movement during interaction (mouse or touch)
    const handleMove = (e) => {
        if (!isMouseDown || !state.manualDrawMode) return;

        const coords = getCanvasCoords(e);

        redrawImage();

        const width = coords.x - state.drawStart.x;
        const height = coords.y - state.drawStart.y;

        dom.outputCtx.strokeStyle = "#06b6d4";
        dom.outputCtx.lineWidth = 2;
        dom.outputCtx.setLineDash([5, 5]);
        dom.outputCtx.strokeRect(
            width > 0 ? state.drawStart.x : coords.x,
            height > 0 ? state.drawStart.y : coords.y,
            Math.abs(width),
            Math.abs(height)
        );
        dom.outputCtx.setLineDash([]);

        state.currentDrawRect = {
            x: width > 0 ? state.drawStart.x : coords.x,
            y: height > 0 ? state.drawStart.y : coords.y,
            width: Math.abs(width),
            height: Math.abs(height)
        };

        // Prevent scrolling on touch devices when drawing
        if (e.type === 'touchmove') {
            e.preventDefault();
        }
    };

    // Handle end of interaction (mouse or touch)
    const handleEnd = () => {
        if (!isMouseDown) return;
        isMouseDown = false;

        if (state.manualDrawMode && state.currentDrawRect && state.currentDrawRect.width > 10 && state.currentDrawRect.height > 10) {
            saveToHistory();

            const region = {
                x: state.currentDrawRect.x / dom.outputCanvas.width,
                y: state.currentDrawRect.y / dom.outputCanvas.height,
                width: state.currentDrawRect.width / dom.outputCanvas.width,
                height: state.currentDrawRect.height / dom.outputCanvas.height
            };
            state.manualRegions.push(region);
            redrawImage();
            Toast.info(`Region added (${state.manualRegions.length} total)`);
        }
        state.currentDrawRect = null;
    };

    // Mouse events
    dom.outputCanvas.addEventListener("mousedown", handleStart);
    dom.outputCanvas.addEventListener("mousemove", handleMove);
    dom.outputCanvas.addEventListener("mouseup", handleEnd);
    dom.outputCanvas.addEventListener("mouseleave", () => {
        if (isMouseDown && state.manualDrawMode) {
            isMouseDown = false;
            state.currentDrawRect = null;
            redrawImage();
        }
    });

    // Touch events (mobile support)
    dom.outputCanvas.addEventListener("touchstart", handleStart, { passive: false });
    dom.outputCanvas.addEventListener("touchmove", handleMove, { passive: false });
    dom.outputCanvas.addEventListener("touchend", handleEnd);
}

async function handleFaceClick(canvasX, canvasY) {
    // Guard against null/undefined states
    if (!dom.outputCanvas || !state.detectedFaces || state.detectedFaces.length === 0) {
        return;
    }

    const canvasWidth = dom.outputCanvas.width;
    const canvasHeight = dom.outputCanvas.height;

    for (let i = 0; i < state.detectedFaces.length; i++) {
        const detection = state.detectedFaces[i];
        if (!detection || !detection.boundingBox) continue;

        const box = detection.boundingBox;

        const expandedW = box.width * state.regionExpansion;
        const expandedH = box.height * state.regionExpansion;
        const expandedX = box.xCenter - expandedW / 2;
        const expandedY = box.yCenter - expandedH / 2;

        const faceX = expandedX * canvasWidth;
        const faceY = expandedY * canvasHeight;
        const faceW = expandedW * canvasWidth;
        const faceH = expandedH * canvasHeight;

        if (canvasX >= faceX && canvasX <= faceX + faceW &&
            canvasY >= faceY && canvasY <= faceY + faceH) {
            // Ensure faceEnabledStates array is in sync
            if (i >= state.faceEnabledStates.length) {
                state.faceEnabledStates.push(true);
            }
            state.faceEnabledStates[i] = !state.faceEnabledStates[i];
            redrawImage();

            const { renderFaceList } = await import('./face-detection.js');
            renderFaceList();

            const { updateIdentityScore, showStatus, hideStatus } = await import('./face-ui.js');
            updateIdentityScore();

            const enabledCount = state.faceEnabledStates.filter(s => s).length;
            const status = state.faceEnabledStates[i] ? "enabled" : "disabled";
            showStatus(`Face ${i + 1} ${status} (${enabledCount}/${state.detectedFaces.length} blurred)`, "success");
            setTimeout(() => hideStatus(), 2000);
            return;
        }
    }
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================
export function setupKeyboardShortcuts() {
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
            const currentIndex = types.indexOf(state.blurType);
            const nextIndex = (currentIndex + 1) % types.length;

            import('./face-ui.js').then(module => {
                module.setBlurType(types[nextIndex]);
            });
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
            e.preventDefault();
            if (state.manualDrawMode || state.manualRegions.length > 0) {
                undoManualRegion();
            }
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
            e.preventDefault();
            if (state.manualDrawMode || state.manualRegions.length > 0) {
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
export function downloadImage() {
    if (!state.currentImage) {
        Toast.warning("Please upload an image first");
        return;
    }

    const link = document.createElement("a");
    link.download = "blurred-image.png";
    link.href = dom.outputCanvas.toDataURL("image/png");
    link.click();
    Toast.success("Image downloaded successfully!");
}

async function resetTool() {
    state.detectedFaces = [];
    state.faceEnabledStates = [];
    state.faceLandmarks = [];
    state.facePreviewThumbnails = [];
    state.manualRegions = [];
    state.hasShownFaceToggleHint = false;

    state.manualRegionsHistory = [];
    state.historyIndex = -1;
    updateUndoRedoButtons();

    const { renderFaceList } = await import('./face-detection.js');
    renderFaceList();

    if (state.currentImage) {
        dom.outputCanvas.width = state.currentImage.width;
        dom.outputCanvas.height = state.currentImage.height;
        dom.outputCtx.drawImage(state.currentImage, 0, 0);

        const { processImage } = await import('./face-blur.js');
        await processImage();
    } else {
        clearCanvas();
    }

    if (dom.faceCountBadge) dom.faceCountBadge.classList.add("hidden");
    if (dom.downloadBtn) dom.downloadBtn.disabled = true;

    const { hideStatus } = await import('./face-ui.js');
    hideStatus();
}

function clearCanvas() {
    dom.outputCtx.clearRect(0, 0, dom.outputCanvas.width, dom.outputCanvas.height);
    dom.outputCanvas.classList.add("hidden");
    dom.placeholderContent?.classList.remove("hidden");

    const cameraContainer = document.getElementById("cameraContainer");
    if (cameraContainer) {
        cameraContainer.classList.add("hidden");
    }
}
