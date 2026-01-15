// Face Blur Tool - Event Handlers Setup
// Sets up all event listeners using addEventListener instead of inline handlers
// Uses dynamic imports to avoid circular dependencies

export function setupEventHandlers() {
    // Warning toggle
    const warningToggleBtn = document.getElementById('warningToggleBtn');
    warningToggleBtn?.addEventListener('click', () => {
        const warning = document.getElementById('reversibilityWarning');
        warning?.classList.toggle('collapsed');
    });

    // Upload zone click
    const uploadZone = document.getElementById('uploadZone');
    const imageInput = document.getElementById('imageInput');
    uploadZone?.addEventListener('click', () => {
        imageInput?.click();
    });

    // Input type buttons
    document.getElementById('inputTypeImageBtn')?.addEventListener('click', () => {
        import('./face-blur.js').then(m => m.setInputType('image'));
    });
    document.getElementById('inputTypeCameraBtn')?.addEventListener('click', () => {
        import('./face-blur.js').then(m => m.setInputType('camera'));
    });

    // Camera buttons
    document.getElementById('startCameraBtn')?.addEventListener('click', () => {
        import('./face-detection.js').then(m => m.startCamera());
    });
    document.getElementById('stopCameraBtn')?.addEventListener('click', () => {
        import('./face-detection.js').then(m => m.stopCamera());
    });
    document.getElementById('captureBtn')?.addEventListener('click', () => {
        import('./face-detection.js').then(m => m.captureFrame());
    });

    // Preset buttons
    const presets = ['journalist', 'legal', 'social', 'maximum', 'inpaint'];
    presets.forEach(preset => {
        const btnId = `preset${preset.charAt(0).toUpperCase() + preset.slice(1)}Btn`;
        document.getElementById(btnId)?.addEventListener('click', () => {
            import('./face-ui.js').then(m => m.applyPreset(preset));
        });
    });

    // Blur type buttons
    const blurTypes = ['gaussian', 'pixelate', 'mosaic', 'box', 'motion', 'eyes', 'inpaint', 'skinmask', 'features'];
    blurTypes.forEach(type => {
        const btnId = `blurType${type.charAt(0).toUpperCase() + type.slice(1)}Btn`;
        document.getElementById(btnId)?.addEventListener('click', () => {
            import('./face-ui.js').then(m => m.setBlurType(type));
        });
    });

    // Feature blurring checkboxes
    ['blurEyes', 'blurEyebrows', 'blurNose', 'blurMouth'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            import('./face-ui.js').then(m => m.updateFeatureBlurring());
        });
    });

    // Range sliders
    document.getElementById('blurIntensity')?.addEventListener('input', (e) => {
        import('./face-ui.js').then(m => m.updateBlurIntensity(e.target.value));
    });
    document.getElementById('expandRegion')?.addEventListener('input', (e) => {
        import('./face-ui.js').then(m => m.updateExpandRegion(e.target.value));
    });
    document.getElementById('confidenceThreshold')?.addEventListener('input', (e) => {
        import('./face-ui.js').then(m => m.updateConfidence(e.target.value));
    });

    // Toggle switches
    document.getElementById('showFaceBoxes')?.addEventListener('change', async () => {
        const { redrawImage } = await import('./face-renderer.js');
        redrawImage();
    });
    document.getElementById('showFaceMesh')?.addEventListener('change', async () => {
        const { redrawImage } = await import('./face-renderer.js');
        redrawImage();
    });
    document.getElementById('manualDrawMode')?.addEventListener('change', () => {
        import('./face-renderer.js').then(m => m.toggleManualDraw());
    });

    // Face list buttons
    document.getElementById('selectAllFacesBtn')?.addEventListener('click', () => {
        import('./face-detection.js').then(m => m.selectAllFaces(true));
    });
    document.getElementById('deselectAllFacesBtn')?.addEventListener('click', () => {
        import('./face-detection.js').then(m => m.selectAllFaces(false));
    });

    // Preview button (mouse and touch events)
    const previewBtn = document.getElementById('previewBtn');
    if (previewBtn) {
        let showOrig, hideOrig;
        import('./face-renderer.js').then(({ showOriginal, hideOriginal }) => {
            showOrig = showOriginal;
            hideOrig = hideOriginal;
            previewBtn.addEventListener('mousedown', showOrig);
            previewBtn.addEventListener('mouseup', hideOrig);
            previewBtn.addEventListener('mouseleave', hideOrig);
            previewBtn.addEventListener('touchstart', (e) => { e.preventDefault(); showOrig(); });
            previewBtn.addEventListener('touchend', hideOrig);
        });
    }

    // Comparison mode buttons
    document.getElementById('showBlurredBtn')?.addEventListener('click', () => {
        import('./face-ui.js').then(m => m.setComparisonMode('blurred'));
    });
    document.getElementById('showSliderBtn')?.addEventListener('click', () => {
        import('./face-ui.js').then(m => m.setComparisonMode('slider'));
    });
    document.getElementById('showOriginalBtn')?.addEventListener('click', () => {
        import('./face-ui.js').then(m => m.setComparisonMode('original'));
    });

    // Action buttons
    document.getElementById('downloadBtn')?.addEventListener('click', () => {
        import('./face-renderer.js').then(m => m.downloadImage());
    });
    document.getElementById('resetBtn')?.addEventListener('click', () => {
        import('./face-renderer.js').then(m => m.resetTool());
    });
    document.getElementById('clearManualBtn')?.addEventListener('click', () => {
        import('./face-renderer.js').then(m => m.clearManualRegions());
    });

    // Undo/Redo buttons
    document.getElementById('undoBtn')?.addEventListener('click', () => {
        import('./face-renderer.js').then(m => m.undoManualRegion());
    });
    document.getElementById('redoBtn')?.addEventListener('click', () => {
        import('./face-renderer.js').then(m => m.redoManualRegion());
    });

    // File input
    imageInput?.addEventListener('change', (e) => {
        import('./face-blur.js').then(m => m.handleImageUpload(e));
    });
}
