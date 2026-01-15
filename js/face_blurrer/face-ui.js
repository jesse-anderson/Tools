// Face Blur Tool - UI Components
// Settings, presets, face list, status indicators, identity protection score, comparison mode

import { state, dom, Toast, DEBOUNCE_DELAY } from './face-constants.js';

// ============================================================================
// STATUS INDICATORS
// ============================================================================
export function showStatus(message, type) {
    if (!dom.statusText || !dom.statusIndicator) return;
    dom.statusText.textContent = message;
    dom.statusIndicator.className = `status-indicator ${type}`;

    const spinner = document.getElementById("statusSpinner");
    if (spinner) {
        spinner.classList.toggle("hidden", type !== "loading");
    }
}

export function hideStatus() {
    if (dom.statusIndicator) {
        dom.statusIndicator.className = "status-indicator";
    }
}

// ============================================================================
// SETTINGS CONTROLS
// ============================================================================
export function updateBlurIntensity(value) {
    state.blurIntensity = parseInt(value);
    updateBlurIntensityDisplay(value);

    // Update ARIA value
    const slider = document.getElementById('blurIntensity');
    if (slider) slider.setAttribute('aria-valuenow', value);

    clearTimeout(state.blurIntensityTimer);
    state.blurIntensityTimer = setTimeout(() => {
        import('./face-renderer.js').then(module => {
            module.redrawImage();
        });
        updateIdentityScore();
    }, DEBOUNCE_DELAY);
}

export function updateExpandRegion(value) {
    state.regionExpansion = parseInt(value) / 100;
    updateExpandDisplay(value);

    // Update ARIA value
    const slider = document.getElementById('expandRegion');
    if (slider) slider.setAttribute('aria-valuenow', value);

    clearTimeout(state.expandRegionTimer);
    state.expandRegionTimer = setTimeout(() => {
        import('./face-renderer.js').then(module => {
            module.redrawImage();
        });
        updateIdentityScore();
    }, DEBOUNCE_DELAY);
}

export function updateConfidence(value) {
    state.confidenceThreshold = parseInt(value) / 100;
    document.getElementById("confidenceValueDisplay").textContent = `${value}%`;

    // Update ARIA value
    const slider = document.getElementById('confidenceThreshold');
    if (slider) slider.setAttribute('aria-valuenow', value);

    if (state.faceDetection) {
        state.faceDetection.setOptions({
            model: "short",
            minDetectionConfidence: state.confidenceThreshold
        });

        if (state.currentImage && !state.isCameraRunning) {
            import('./face-detection.js').then(module => {
                // Trigger re-detection by calling processImage
                module.processWithFaceMesh();
            });
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

// ============================================================================
// BLUR TYPE AND PRESETS
// ============================================================================
export async function setBlurType(type) {
    state.blurType = type;

    document.querySelectorAll(".blur-type-btn").forEach((btn) => {
        const isActive = btn.dataset.type === type;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive);
    });

    const featureSection = document.getElementById("featureBlurringSection");
    if (type === "features") {
        featureSection?.classList.remove("hidden");
    } else {
        featureSection?.classList.add("hidden");
    }

    if (type === "skinmask") {
        Toast.warning("Skin Mask mode works best on light/medium skin tones. May miss darker skin or blur non-skin areas.", 6000);
    }

    if ((type === "eyes" || type === "features" || type === "inpaint") && state.currentImage && !state.isCameraRunning) {
        const { processWithFaceMesh } = await import('./face-detection.js');
        await processWithFaceMesh();
    }

    import('./face-renderer.js').then(module => {
        module.redrawImage();
    });

    updateIdentityScore();
}

export function applyPreset(preset) {
    const blurSlider = document.getElementById('blurIntensity');
    const expandSlider = document.getElementById('expandRegion');

    switch (preset) {
        case 'journalist':
            setBlurType('pixelate');
            state.blurIntensity = 100;
            state.regionExpansion = 1.2;
            if (blurSlider) {
                blurSlider.value = 100;
                blurSlider.setAttribute('aria-valuenow', 100);
            }
            if (expandSlider) {
                expandSlider.value = 120;
                expandSlider.setAttribute('aria-valuenow', 120);
            }
            updateBlurIntensityDisplay(100);
            updateExpandDisplay(120);
            break;
        case 'legal':
            setBlurType('box');
            state.blurIntensity = 100;
            state.regionExpansion = 1.1;
            if (blurSlider) {
                blurSlider.value = 100;
                blurSlider.setAttribute('aria-valuenow', 100);
            }
            if (expandSlider) {
                expandSlider.value = 110;
                expandSlider.setAttribute('aria-valuenow', 110);
            }
            updateBlurIntensityDisplay(100);
            updateExpandDisplay(110);
            break;
        case 'social':
            setBlurType('gaussian');
            state.blurIntensity = 70;
            state.regionExpansion = 1.0;
            if (blurSlider) {
                blurSlider.value = 70;
                blurSlider.setAttribute('aria-valuenow', 70);
            }
            if (expandSlider) {
                expandSlider.value = 100;
                expandSlider.setAttribute('aria-valuenow', 100);
            }
            updateBlurIntensityDisplay(70);
            updateExpandDisplay(100);
            break;
        case 'maximum':
            setBlurType('mosaic');
            state.blurIntensity = 100;
            state.regionExpansion = 1.5;
            if (blurSlider) {
                blurSlider.value = 100;
                blurSlider.setAttribute('aria-valuenow', 100);
            }
            if (expandSlider) {
                expandSlider.value = 150;
                expandSlider.setAttribute('aria-valuenow', 150);
            }
            updateBlurIntensityDisplay(100);
            updateExpandDisplay(150);
            break;
        case 'inpaint':
            setBlurType('inpaint');
            state.blurIntensity = 100;
            state.regionExpansion = 1.0;
            if (blurSlider) {
                blurSlider.value = 100;
                blurSlider.setAttribute('aria-valuenow', 100);
            }
            if (expandSlider) {
                expandSlider.value = 100;
                expandSlider.setAttribute('aria-valuenow', 100);
            }
            updateBlurIntensityDisplay(100);
            updateExpandDisplay(100);
            break;
    }
    Toast.info(`Applied ${preset.charAt(0).toUpperCase() + preset.slice(1)} preset`);
    updateIdentityScore();
}

export function updateFeatureBlurring() {
    state.featureBlurring.eyes = { enabled: document.getElementById('blurEyes').checked, intensity: 100 };
    state.featureBlurring.eyebrows = { enabled: document.getElementById('blurEyebrows').checked, intensity: 100 };
    state.featureBlurring.nose = { enabled: document.getElementById('blurNose').checked, intensity: 100 };
    state.featureBlurring.mouth = { enabled: document.getElementById('blurMouth').checked, intensity: 100 };

    if (state.blurType === "features") {
        import('./face-renderer.js').then(module => {
            module.redrawImage();
        });
    }
    updateIdentityScore();
}

// ============================================================================
// IDENTITY PROTECTION SCORE
// ============================================================================
export function updateIdentityScore() {
    const scoreValueEl = document.getElementById('identityScoreValue');
    const scoreFillEl = document.getElementById('identityScoreFill');
    const scoreBreakdownEl = document.getElementById('identityScoreBreakdown');

    if (!state.currentImage) {
        if (scoreValueEl) {
            scoreValueEl.textContent = '--';
            scoreValueEl.className = 'identity-score-value';
        }
        if (scoreFillEl) scoreFillEl.style.width = '0%';
        if (scoreBreakdownEl) scoreBreakdownEl.innerHTML = '<span class="score-breakdown-item">Upload an image to analyze</span>';
        return;
    }

    const hasManualRegions = state.manualRegions.length > 0;
    const hasDetectedFaces = state.detectedFaces.length > 0;

    if (!hasDetectedFaces && !hasManualRegions) {
        if (scoreValueEl) {
            scoreValueEl.textContent = '--';
            scoreValueEl.className = 'identity-score-value';
        }
        if (scoreFillEl) scoreFillEl.style.width = '0%';
        if (scoreBreakdownEl) scoreBreakdownEl.innerHTML = '<span class="score-breakdown-item">No faces detected</span>';
        return;
    }

    let score = 0;
    let breakdown = [];

    // Blur score
    const blurScore = Math.min(30, (state.blurIntensity / 100) * 30);
    score += blurScore;
    breakdown.push(`Blur: ${Math.round(blurScore)}/30`);

    // Type score
    let typeScore = 0;
    switch (state.blurType) {
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
    const typeNames = {
        gaussian: 'Gaussian', pixelate: 'Pixelate', mosaic: 'Mosaic',
        box: 'Black Box', motion: 'Motion', eyes: 'Eyes Only',
        skinmask: 'Skin Mask', inpaint: 'Inpaint', features: 'Feature Destroyer'
    };
    breakdown.push(`${typeNames[state.blurType] || state.blurType}: ${typeScore}/25`);

    // Coverage score
    let coverageScore = 0;
    let coverageLabel = '';

    if (hasDetectedFaces) {
        const enabledCount = state.faceEnabledStates.filter(s => s).length;
        const totalFaces = state.detectedFaces.length;
        const faceCoverageRatio = enabledCount / totalFaces;
        coverageScore = faceCoverageRatio * 20;
        const manualBonus = Math.min(5, state.manualRegions.length * 1.5);
        coverageScore += manualBonus;
        coverageLabel = hasManualRegions
            ? `Faces: ${enabledCount}/${totalFaces} + ${state.manualRegions.length} manual`
            : `Faces: ${enabledCount}/${totalFaces}`;
    } else {
        coverageScore = Math.min(25, state.manualRegions.length * 5);
        coverageLabel = `Manual: ${state.manualRegions.length} region${state.manualRegions.length !== 1 ? 's' : ''}`;
    }
    score += coverageScore;
    breakdown.push(coverageLabel);

    // Context score (face prominence)
    let contextScore = 0;
    if (hasDetectedFaces && dom.outputCanvas) {
        const canvasWidth = dom.outputCanvas.width;
        const canvasHeight = dom.outputCanvas.height;
        const imageArea = canvasWidth * canvasHeight;

        let maxFaceProminence = 0;
        for (const detection of state.detectedFaces) {
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

        const enabledCount = state.faceEnabledStates.filter(s => s).length;
        if (enabledCount > 0 && maxFaceProminence > 1) {
            contextScore = Math.min(5, maxFaceProminence * 0.5);
        }
    }
    score += contextScore;
    if (contextScore > 0) {
        breakdown.push(`Prominence: +${Math.round(contextScore)}`);
    }

    // Expansion score
    const expansionScore = Math.min(15, Math.max(0, (state.regionExpansion - 0.5) * 30));
    score += expansionScore;
    breakdown.push(`Expansion: ${Math.round(state.regionExpansion * 100)}%`);

    // Feature blurring bonus
    if (state.blurType === 'features') {
        const enabledFeatures = Object.values(state.featureBlurring).filter(f => f.enabled);
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

    // Thoroughness bonus
    if (hasManualRegions && hasDetectedFaces) {
        const enabledCount = state.faceEnabledStates.filter(s => s).length;
        const allFacesCovered = enabledCount === state.detectedFaces.length;
        if (allFacesCovered) {
            score += 2;
            breakdown.push(`Thoroughness: +2`);
        } else {
            score += Math.min(2, state.manualRegions.length);
            breakdown.push(`Manual regions: +${Math.min(2, state.manualRegions.length)}`);
        }
    }

    score = Math.min(100, Math.round(score));

    if (scoreValueEl) {
        scoreValueEl.textContent = score + '%';
        scoreValueEl.className = 'identity-score-value';
        if (score >= 80) scoreValueEl.classList.add('excellent');
        else if (score >= 60) scoreValueEl.classList.add('good');
        else if (score >= 40) scoreValueEl.classList.add('fair');
        else scoreValueEl.classList.add('poor');
    }

    if (scoreFillEl) scoreFillEl.style.width = score + '%';

    // Safe: create DOM elements instead of innerHTML
    if (scoreBreakdownEl) {
        while (scoreBreakdownEl.firstChild) {
            scoreBreakdownEl.removeChild(scoreBreakdownEl.firstChild);
        }
        breakdown.forEach(item => {
            const span = document.createElement('span');
            span.className = 'score-breakdown-item';
            span.textContent = item;
            scoreBreakdownEl.appendChild(span);
        });
    }
}

// ============================================================================
// COMPARISON MODE
// ============================================================================
export function setComparisonMode(mode) {
    state.comparisonMode = mode;

    document.getElementById('showBlurredBtn').classList.toggle('active', mode === 'blurred');
    document.getElementById('showSliderBtn').classList.toggle('active', mode === 'slider');
    document.getElementById('showOriginalBtn').classList.toggle('active', mode === 'original');

    const outputCanvas = document.getElementById('outputCanvas');
    const comparisonCanvas = document.getElementById('comparisonCanvas');
    const comparisonSlider = document.getElementById('comparisonSlider');

    if (mode === 'slider') {
        if (outputCanvas) outputCanvas.classList.add('hidden');
        if (comparisonCanvas) comparisonCanvas.classList.remove('hidden');
        if (comparisonSlider) comparisonSlider.classList.remove('hidden');
        updateComparisonCanvas();
    } else if (mode === 'original') {
        if (outputCanvas) outputCanvas.classList.add('hidden');
        if (comparisonCanvas) comparisonCanvas.classList.add('hidden');
        if (comparisonSlider) comparisonSlider.classList.add('hidden');
        if (state.currentImage && state.originalImageData && dom.outputCtx) {
            if (outputCanvas) outputCanvas.classList.remove('hidden');
            dom.outputCtx.putImageData(state.originalImageData, 0, 0);
        }
    } else {
        if (outputCanvas) outputCanvas.classList.remove('hidden');
        if (comparisonCanvas) comparisonCanvas.classList.add('hidden');
        if (comparisonSlider) comparisonSlider.classList.add('hidden');
        import('./face-renderer.js').then(module => {
            module.redrawImage();
        });
    }
}

function updateComparisonCanvas() {
    if (!state.currentImage || state.comparisonMode !== 'slider') return;

    const comparisonCanvas = document.getElementById('comparisonCanvas');
    const sliderHandle = document.getElementById('comparisonHandle');

    if (!comparisonCanvas) return;

    const comparisonCtx = comparisonCanvas.getContext('2d');
    comparisonCanvas.width = dom.outputCanvas.width;
    comparisonCanvas.height = dom.outputCanvas.height;

    const splitX = (state.sliderPosition / 100) * comparisonCanvas.width;

    if (state.originalImageData) {
        comparisonCtx.putImageData(state.originalImageData, 0, 0);
        comparisonCtx.save();
        comparisonCtx.beginPath();
        comparisonCtx.rect(splitX, 0, comparisonCanvas.width - splitX, comparisonCanvas.height);
        comparisonCtx.clip();
        comparisonCtx.drawImage(dom.outputCanvas, 0, 0);
        comparisonCtx.restore();
    }

    // Position handle relative to the actual canvas display size
    const canvasRect = comparisonCanvas.getBoundingClientRect();
    const wrapperRect = document.getElementById('canvasWrapper').getBoundingClientRect();

    const canvasLeftInWrapper = canvasRect.left - wrapperRect.left;
    const canvasTopInWrapper = canvasRect.top - wrapperRect.top;
    const handleLeft = canvasLeftInWrapper + splitX;

    if (sliderHandle) {
        sliderHandle.style.left = handleLeft + 'px';
        sliderHandle.style.top = canvasTopInWrapper + 'px';
        sliderHandle.style.height = canvasRect.height + 'px';
    }
}

export function setupComparisonSlider() {
    const slider = document.getElementById('comparisonSlider');
    const handle = document.getElementById('comparisonHandle');
    const canvasWrapper = document.getElementById('canvasWrapper');

    if (!slider || !handle || !canvasWrapper) return;

    // Helper to get position relative to the actual canvas
    function getPositionFromEvent(clientX) {
        const comparisonCanvas = document.getElementById('comparisonCanvas');
        if (!comparisonCanvas) return 0;

        const canvasRect = comparisonCanvas.getBoundingClientRect();
        const wrapperRect = canvasWrapper.getBoundingClientRect();

        const canvasLeft = canvasRect.left - wrapperRect.left;

        let xPos = clientX - canvasRect.left;
        return Math.max(0, Math.min(canvasRect.width, xPos));
    }

    handle.addEventListener('mousedown', (e) => {
        state.isDraggingSlider = true;
        e.preventDefault();
    });

    handle.addEventListener('touchstart', (e) => {
        state.isDraggingSlider = true;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!state.isDraggingSlider) return;

        const comparisonCanvas = document.getElementById('comparisonCanvas');
        if (!comparisonCanvas || comparisonCanvas.classList.contains('hidden')) return;

        const xPos = getPositionFromEvent(e.clientX);
        const canvasWidth = comparisonCanvas.width;
        const displayWidth = comparisonCanvas.getBoundingClientRect().width;
        const scaleX = canvasWidth / displayWidth;

        let newPercent = ((xPos * scaleX) / canvasWidth) * 100;
        state.sliderPosition = Math.max(0, Math.min(100, newPercent));
        updateComparisonCanvas();
    });

    document.addEventListener('touchmove', (e) => {
        if (!state.isDraggingSlider) return;

        const comparisonCanvas = document.getElementById('comparisonCanvas');
        if (!comparisonCanvas || comparisonCanvas.classList.contains('hidden')) return;

        const xPos = getPositionFromEvent(e.touches[0].clientX);
        const canvasWidth = comparisonCanvas.width;
        const displayWidth = comparisonCanvas.getBoundingClientRect().width;
        const scaleX = canvasWidth / displayWidth;

        let newPercent = ((xPos * scaleX) / canvasWidth) * 100;
        state.sliderPosition = Math.max(0, Math.min(100, newPercent));
        updateComparisonCanvas();
    });

    document.addEventListener('mouseup', () => {
        state.isDraggingSlider = false;
    });

    document.addEventListener('touchend', () => {
        state.isDraggingSlider = false;
    });

    slider.addEventListener('click', (e) => {
        if (e.target !== handle) {
            const comparisonCanvas = document.getElementById('comparisonCanvas');
            if (!comparisonCanvas || comparisonCanvas.classList.contains('hidden')) return;

            const xPos = getPositionFromEvent(e.clientX);
            const canvasWidth = comparisonCanvas.width;
            const displayWidth = comparisonCanvas.getBoundingClientRect().width;
            const scaleX = canvasWidth / displayWidth;

            let newPercent = ((xPos * scaleX) / canvasWidth) * 100;
            state.sliderPosition = Math.max(0, Math.min(100, newPercent));
            updateComparisonCanvas();
        }
    });
}
