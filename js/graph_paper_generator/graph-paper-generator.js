(function () {
    'use strict';

    const INCH_TO_PT = 72;
    const SQRT_THREE = Math.sqrt(3);
    const PAPER_SIZES = {
        letter: { width: 8.5 * INCH_TO_PT, height: 11 * INCH_TO_PT, label: 'Letter', shortLabel: '8.5 x 11 in' },
        legal: { width: 8.5 * INCH_TO_PT, height: 14 * INCH_TO_PT, label: 'Legal', shortLabel: '8.5 x 14 in' },
        a4: { width: 595.276, height: 841.89, label: 'A4', shortLabel: '210 x 297 mm' }
    };

    const PALETTES = {
        graphite: {
            minor: [0.72, 0.72, 0.76],
            major: [0.46, 0.47, 0.52],
            axis: [0.14, 0.15, 0.18],
            dot: [0.26, 0.28, 0.32],
            border: [0.2, 0.22, 0.26]
        },
        engineerBlue: {
            minor: [0.74, 0.84, 0.97],
            major: [0.41, 0.62, 0.93],
            axis: [0.14, 0.33, 0.65],
            dot: [0.2, 0.44, 0.82],
            border: [0.19, 0.39, 0.73]
        },
        forest: {
            minor: [0.8, 0.89, 0.82],
            major: [0.42, 0.65, 0.47],
            axis: [0.16, 0.39, 0.21],
            dot: [0.18, 0.48, 0.26],
            border: [0.16, 0.39, 0.21]
        },
        amber: {
            minor: [0.94, 0.87, 0.72],
            major: [0.88, 0.63, 0.18],
            axis: [0.56, 0.34, 0.03],
            dot: [0.72, 0.45, 0.06],
            border: [0.56, 0.34, 0.03]
        }
    };

    const TEMPLATE_META = {
        cartesian: {
            label: 'Cartesian grid',
            description: 'Full-page cartesian grid with heavier major guides every fifth interval.'
        },
        cornerAxes: {
            label: 'First-quadrant XY grid',
            description: 'Grid paper with heavier left and bottom axes plus major tick marks for first-quadrant plotting.'
        },
        centerAxes: {
            label: 'Centered XY grid',
            description: 'Four-quadrant grid with centered axes aligned to the nearest grid intersection.'
        },
        dotGrid: {
            label: 'Dot grid',
            description: 'Plain dot paper using a uniform point lattice across the printable area.'
        },
        boxedDots: {
            label: 'Boxed dot grid',
            description: 'Dot paper with a bounding box around the printable field.'
        },
        isometricDots: {
            label: 'Isometric dot grid',
            description: 'Triangular point lattice for isometric sketching and quick layout work.'
        }
    };

    const DEFAULT_STATE = {
        template: 'cartesian',
        paperSize: 'letter',
        orientation: 'portrait',
        palette: 'engineerBlue',
        minorSpacingIn: 0.2,
        majorEvery: 5,
        marginIn: 0.4,
        dotRadiusPt: 1.2,
        useCustomColors: false,
        minorRed: 189,
        minorGreen: 214,
        minorBlue: 247,
        majorRed: 105,
        majorGreen: 158,
        majorBlue: 237,
        accentRed: 36,
        accentGreen: 84,
        accentBlue: 166,
        minorOpacity: 0.6,
        majorOpacity: 0.85,
        headerText: '',
        headerAlign: 'center',
        footerText: '',
        footerAlign: 'center',
        includeScaleNote: false,
        scaleValue: 1,
        scaleUnit: 'in',
        xMin: 0,
        xMax: 10,
        yMin: 0,
        yMax: 10
    };

    const SAVED_TEMPLATE_KEY = 'graphPaperGenerator.savedTemplate';

    const elements = {};
    let lastScene = null;

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        bindElements();
        bindEvents();
        applyState(DEFAULT_STATE);
    }

    // Debounce utility to prevent excessive re-renders
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    const debouncedHandleInput = debounce(handleFormInput, 50);

    function bindElements() {
        elements.templateSelect = document.getElementById('templateSelect');
        elements.paperSizeSelect = document.getElementById('paperSizeSelect');
        elements.orientationSelect = document.getElementById('orientationSelect');
        elements.paletteSelect = document.getElementById('paletteSelect');
        elements.minorSpacingInput = document.getElementById('minorSpacingInput');
        elements.majorEveryInput = document.getElementById('majorEveryInput');
        elements.marginInput = document.getElementById('marginInput');
        elements.dotRadiusInput = document.getElementById('dotRadiusInput');
        elements.templateSummary = document.getElementById('templateSummary');
        elements.printableAreaStat = document.getElementById('printableAreaStat');
        elements.pitchStat = document.getElementById('pitchStat');
        elements.countStat = document.getElementById('countStat');
        elements.scaleStat = document.getElementById('scaleStat');
        elements.templateBadge = document.getElementById('templateBadge');
        elements.paperBadge = document.getElementById('paperBadge');
        elements.statusLine = document.getElementById('statusLine');
        elements.paperPreview = document.getElementById('paperPreview');
        elements.saveTemplateBtn = document.getElementById('saveTemplateBtn');
        elements.loadTemplateBtn = document.getElementById('loadTemplateBtn');
        elements.exportSettingsBtn = document.getElementById('exportSettingsBtn');
        elements.importSettingsInput = document.getElementById('importSettingsInput');
        elements.downloadPdfBtn = document.getElementById('downloadPdfBtn');
        elements.resetBtn = document.getElementById('resetBtn');
        elements.gridOnly = Array.from(document.querySelectorAll('.grid-only'));
        elements.dotOnly = Array.from(document.querySelectorAll('.dot-only'));
        elements.axisOnly = Array.from(document.querySelectorAll('.axis-only'));
        elements.useCustomColorsCheck = document.getElementById('useCustomColorsCheck');
        elements.customColorFieldset = document.getElementById('customColorFieldset');
        elements.minorRedInput = document.getElementById('minorRedInput');
        elements.minorGreenInput = document.getElementById('minorGreenInput');
        elements.minorBlueInput = document.getElementById('minorBlueInput');
        elements.majorRedInput = document.getElementById('majorRedInput');
        elements.majorGreenInput = document.getElementById('majorGreenInput');
        elements.majorBlueInput = document.getElementById('majorBlueInput');
        elements.accentRedInput = document.getElementById('accentRedInput');
        elements.accentGreenInput = document.getElementById('accentGreenInput');
        elements.accentBlueInput = document.getElementById('accentBlueInput');
        elements.minorRedValue = document.getElementById('minorRedValue');
        elements.minorGreenValue = document.getElementById('minorGreenValue');
        elements.minorBlueValue = document.getElementById('minorBlueValue');
        elements.majorRedValue = document.getElementById('majorRedValue');
        elements.majorGreenValue = document.getElementById('majorGreenValue');
        elements.majorBlueValue = document.getElementById('majorBlueValue');
        elements.accentRedValue = document.getElementById('accentRedValue');
        elements.accentGreenValue = document.getElementById('accentGreenValue');
        elements.accentBlueValue = document.getElementById('accentBlueValue');
        elements.minorOpacityInput = document.getElementById('minorOpacityInput');
        elements.majorOpacityInput = document.getElementById('majorOpacityInput');
        elements.minorOpacityValue = document.getElementById('minorOpacityValue');
        elements.majorOpacityValue = document.getElementById('majorOpacityValue');
        elements.headerTextInput = document.getElementById('headerTextInput');
        elements.headerAlignSelect = document.getElementById('headerAlignSelect');
        elements.footerTextInput = document.getElementById('footerTextInput');
        elements.footerAlignSelect = document.getElementById('footerAlignSelect');
        elements.includeScaleNoteCheck = document.getElementById('includeScaleNoteCheck');
        elements.scaleValueInput = document.getElementById('scaleValueInput');
        elements.scaleUnitSelect = document.getElementById('scaleUnitSelect');
        elements.xMinInput = document.getElementById('xMinInput');
        elements.xMaxInput = document.getElementById('xMaxInput');
        elements.yMinInput = document.getElementById('yMinInput');
        elements.yMaxInput = document.getElementById('yMaxInput');
    }

    function bindEvents() {
        [
            elements.templateSelect,
            elements.paperSizeSelect,
            elements.orientationSelect,
            elements.paletteSelect,
            elements.minorSpacingInput,
            elements.majorEveryInput,
            elements.marginInput,
            elements.dotRadiusInput,
            elements.useCustomColorsCheck,
            elements.minorRedInput,
            elements.minorGreenInput,
            elements.minorBlueInput,
            elements.majorRedInput,
            elements.majorGreenInput,
            elements.majorBlueInput,
            elements.accentRedInput,
            elements.accentGreenInput,
            elements.accentBlueInput,
            elements.minorOpacityInput,
            elements.majorOpacityInput,
            elements.headerTextInput,
            elements.headerAlignSelect,
            elements.footerTextInput,
            elements.footerAlignSelect,
            elements.includeScaleNoteCheck,
            elements.scaleValueInput,
            elements.scaleUnitSelect,
            elements.xMinInput,
            elements.xMaxInput,
            elements.yMinInput,
            elements.yMaxInput
        ].forEach((input) => {
            input.addEventListener('input', debouncedHandleInput);
            input.addEventListener('change', handleFormCommit);
        });

        elements.saveTemplateBtn.addEventListener('click', saveTemplate);
        elements.loadTemplateBtn.addEventListener('click', loadTemplate);
        elements.exportSettingsBtn.addEventListener('click', exportSettings);
        elements.importSettingsInput.addEventListener('change', importSettings);
        elements.downloadPdfBtn.addEventListener('click', downloadPdf);
        elements.resetBtn.addEventListener('click', () => {
            applyState(DEFAULT_STATE);
            setStatus('Reset to default graph paper settings.');
        });
    }

    function handleFormInput() {
        render(false);
    }

    function handleFormCommit() {
        render(true);
    }

    function applyState(state) {
        elements.templateSelect.value = state.template;
        elements.paperSizeSelect.value = state.paperSize;
        elements.orientationSelect.value = state.orientation;
        elements.paletteSelect.value = state.palette;
        elements.minorSpacingInput.value = String(state.minorSpacingIn);
        elements.majorEveryInput.value = String(state.majorEvery);
        elements.marginInput.value = String(state.marginIn);
        elements.dotRadiusInput.value = String(state.dotRadiusPt);
        elements.useCustomColorsCheck.checked = state.useCustomColors;
        elements.minorRedInput.value = String(state.minorRed);
        elements.minorGreenInput.value = String(state.minorGreen);
        elements.minorBlueInput.value = String(state.minorBlue);
        elements.majorRedInput.value = String(state.majorRed);
        elements.majorGreenInput.value = String(state.majorGreen);
        elements.majorBlueInput.value = String(state.majorBlue);
        elements.accentRedInput.value = String(state.accentRed);
        elements.accentGreenInput.value = String(state.accentGreen);
        elements.accentBlueInput.value = String(state.accentBlue);
        elements.minorOpacityInput.value = String(state.minorOpacity);
        elements.majorOpacityInput.value = String(state.majorOpacity);
        elements.headerTextInput.value = state.headerText;
        elements.headerAlignSelect.value = state.headerAlign;
        elements.footerTextInput.value = state.footerText;
        elements.footerAlignSelect.value = state.footerAlign;
        elements.includeScaleNoteCheck.checked = state.includeScaleNote;
        elements.scaleValueInput.value = String(state.scaleValue);
        elements.scaleUnitSelect.value = state.scaleUnit;
        elements.xMinInput.value = String(state.xMin);
        elements.xMaxInput.value = String(state.xMax);
        elements.yMinInput.value = String(state.yMin);
        elements.yMaxInput.value = String(state.yMax);
        render(true);
    }

    function getState() {
        const template = TEMPLATE_META[elements.templateSelect.value] ? elements.templateSelect.value : DEFAULT_STATE.template;
        const paperSize = PAPER_SIZES[elements.paperSizeSelect.value] ? elements.paperSizeSelect.value : DEFAULT_STATE.paperSize;
        const orientation = elements.orientationSelect.value === 'landscape' ? 'landscape' : 'portrait';
        const palette = PALETTES[elements.paletteSelect.value] ? elements.paletteSelect.value : DEFAULT_STATE.palette;

        return normalizeStateForTemplate({
            template,
            paperSize,
            orientation,
            palette,
            minorSpacingIn: clamp(parseNumber(elements.minorSpacingInput.value, DEFAULT_STATE.minorSpacingIn), 0.1, 1),
            majorEvery: clampInt(parseNumber(elements.majorEveryInput.value, DEFAULT_STATE.majorEvery), 2, 10),
            marginIn: clamp(parseNumber(elements.marginInput.value, DEFAULT_STATE.marginIn), 0.2, 1.5),
            dotRadiusPt: clamp(parseNumber(elements.dotRadiusInput.value, DEFAULT_STATE.dotRadiusPt), 0.5, 4),
            useCustomColors: elements.useCustomColorsCheck.checked,
            minorRed: clampInt(parseNumber(elements.minorRedInput.value, DEFAULT_STATE.minorRed), 0, 255),
            minorGreen: clampInt(parseNumber(elements.minorGreenInput.value, DEFAULT_STATE.minorGreen), 0, 255),
            minorBlue: clampInt(parseNumber(elements.minorBlueInput.value, DEFAULT_STATE.minorBlue), 0, 255),
            majorRed: clampInt(parseNumber(elements.majorRedInput.value, DEFAULT_STATE.majorRed), 0, 255),
            majorGreen: clampInt(parseNumber(elements.majorGreenInput.value, DEFAULT_STATE.majorGreen), 0, 255),
            majorBlue: clampInt(parseNumber(elements.majorBlueInput.value, DEFAULT_STATE.majorBlue), 0, 255),
            accentRed: clampInt(parseNumber(elements.accentRedInput.value, DEFAULT_STATE.accentRed), 0, 255),
            accentGreen: clampInt(parseNumber(elements.accentGreenInput.value, DEFAULT_STATE.accentGreen), 0, 255),
            accentBlue: clampInt(parseNumber(elements.accentBlueInput.value, DEFAULT_STATE.accentBlue), 0, 255),
            minorOpacity: clamp(parseNumber(elements.minorOpacityInput.value, DEFAULT_STATE.minorOpacity), 0.05, 1),
            majorOpacity: clamp(parseNumber(elements.majorOpacityInput.value, DEFAULT_STATE.majorOpacity), 0.05, 1),
            headerText: normalizeMultilineText(elements.headerTextInput.value, 2),
            headerAlign: normalizeTextAlign(elements.headerAlignSelect.value),
            footerText: normalizeMultilineText(elements.footerTextInput.value, 2),
            footerAlign: normalizeTextAlign(elements.footerAlignSelect.value),
            includeScaleNote: elements.includeScaleNoteCheck.checked,
            scaleValue: clamp(parseNumber(elements.scaleValueInput.value, DEFAULT_STATE.scaleValue), 0.001, 1e9),
            scaleUnit: normalizeScaleUnit(elements.scaleUnitSelect.value),
            xMin: parseNumber(elements.xMinInput.value, DEFAULT_STATE.xMin),
            xMax: parseNumber(elements.xMaxInput.value, DEFAULT_STATE.xMax),
            yMin: parseNumber(elements.yMinInput.value, DEFAULT_STATE.yMin),
            yMax: parseNumber(elements.yMaxInput.value, DEFAULT_STATE.yMax)
        });
    }

    function render(normalizeInputs) {
        const state = getState();
        syncInputs(state, normalizeInputs !== false);
        updateColorHexDisplays(state);
        syncControlVisibility(state);

        const page = getPageDimensions(state.paperSize, state.orientation);
        const scene = buildScene(state, page);
        lastScene = scene;

        renderPreview(scene);
        updateReadout(scene, state);
        setStatus(buildStatusText(scene, state));
    }

    function syncInputs(state, normalizeInputs) {
        const activeColors = getActivePalette(state);

        if (normalizeInputs) {
            elements.minorSpacingInput.value = formatFixed(state.minorSpacingIn, 2);
            elements.majorEveryInput.value = String(state.majorEvery);
            elements.marginInput.value = formatFixed(state.marginIn, 2);
            elements.dotRadiusInput.value = formatFixed(state.dotRadiusPt, 1);
            elements.minorOpacityInput.value = formatFixed(state.minorOpacity, 2);
            elements.majorOpacityInput.value = formatFixed(state.majorOpacity, 2);
            elements.headerTextInput.value = state.headerText;
            elements.headerAlignSelect.value = state.headerAlign;
            elements.footerTextInput.value = state.footerText;
            elements.footerAlignSelect.value = state.footerAlign;
            elements.scaleValueInput.value = formatAxisInput(state.scaleValue);
            elements.scaleUnitSelect.value = state.scaleUnit;
            elements.xMinInput.value = formatAxisInput(state.xMin);
            elements.xMaxInput.value = formatAxisInput(state.xMax);
            elements.yMinInput.value = formatAxisInput(state.yMin);
            elements.yMaxInput.value = formatAxisInput(state.yMax);
        }

        syncColorSlider(elements.minorRedInput, elements.minorRedValue, activeColors.minor.rgb[0]);
        syncColorSlider(elements.minorGreenInput, elements.minorGreenValue, activeColors.minor.rgb[1]);
        syncColorSlider(elements.minorBlueInput, elements.minorBlueValue, activeColors.minor.rgb[2]);
        syncColorSlider(elements.majorRedInput, elements.majorRedValue, activeColors.major.rgb[0]);
        syncColorSlider(elements.majorGreenInput, elements.majorGreenValue, activeColors.major.rgb[1]);
        syncColorSlider(elements.majorBlueInput, elements.majorBlueValue, activeColors.major.rgb[2]);
        syncColorSlider(elements.accentRedInput, elements.accentRedValue, activeColors.axis.rgb[0]);
        syncColorSlider(elements.accentGreenInput, elements.accentGreenValue, activeColors.axis.rgb[1]);
        syncColorSlider(elements.accentBlueInput, elements.accentBlueValue, activeColors.axis.rgb[2]);
        updateColorHexDisplays(state);
        elements.minorOpacityValue.textContent = formatFixed(state.minorOpacity, 2);
        elements.majorOpacityValue.textContent = formatFixed(state.majorOpacity, 2);
        elements.customColorFieldset.disabled = !state.useCustomColors;
        elements.templateSummary.textContent = TEMPLATE_META[state.template].description;
    }

    function syncControlVisibility(state) {
        const gridTemplate = isGridTemplate(state.template);
        const dotTemplate = isDotTemplate(state.template);
        const axisTemplate = isAxisTemplate(state.template);
        toggleGroup(elements.gridOnly, gridTemplate);
        toggleGroup(elements.dotOnly, dotTemplate);
        toggleGroup(elements.axisOnly, axisTemplate);
    }

    function buildScene(state, page) {
        const marginPt = state.marginIn * INCH_TO_PT;
        const spacingPt = state.minorSpacingIn * INCH_TO_PT;
        const inner = {
            x: marginPt,
            y: marginPt,
            width: Math.max(0, page.width - (marginPt * 2)),
            height: Math.max(0, page.height - (marginPt * 2))
        };
        inner.right = inner.x + inner.width;
        inner.bottom = inner.y + inner.height;

        const palette = getActivePalette(state);
        const scene = {
            page,
            inner,
            palette,
            state,
            spacingPt,
            primitives: [],
            overlay: [],
            metrics: {
                printableWidthIn: inner.width / INCH_TO_PT,
                printableHeightIn: inner.height / INCH_TO_PT,
                countText: '--',
                countLabel: '--'
            }
        };

        addPreviewGuides(scene);

        if (inner.width <= 0 || inner.height <= 0) {
            return scene;
        }

        switch (state.template) {
            case 'cartesian':
                scene.grid = buildOrthogonalField(inner, spacingPt, {
                    mode: 'center',
                    columnMultiple: state.majorEvery,
                    rowMultiple: state.majorEvery
                });
                addCartesianGrid(scene);
                break;
            case 'cornerAxes':
                scene.grid = buildOrthogonalField(inner, spacingPt, {
                    mode: 'cornerBottomLeft',
                    columnMultiple: state.majorEvery,
                    rowMultiple: state.majorEvery
                });
                addCartesianGrid(scene);
                addCornerAxes(scene);
                addAxisLabels(scene);
                break;
            case 'centerAxes':
                scene.grid = buildOrthogonalField(inner, spacingPt, {
                    mode: 'center',
                    evenColumns: true,
                    evenRows: true,
                    columnMultiple: state.majorEvery * 2,
                    rowMultiple: state.majorEvery * 2
                });
                addCartesianGrid(scene);
                addCenteredAxes(scene);
                addAxisLabels(scene);
                break;
            case 'dotGrid':
                scene.grid = buildOrthogonalField(inner, spacingPt, { mode: 'center' });
                addDotGrid(scene, false);
                break;
            case 'boxedDots':
                scene.grid = buildOrthogonalField(inner, spacingPt, { mode: 'center' });
                addDotGrid(scene, true);
                break;
            case 'isometricDots':
                scene.grid = buildIsometricField(inner, spacingPt, { mode: 'center' });
                addIsometricDots(scene);
                break;
            default:
                scene.grid = buildOrthogonalField(inner, spacingPt, { mode: 'center' });
                addCartesianGrid(scene);
                break;
        }

        addPageAnnotations(scene);

        return scene;
    }

    function addPreviewGuides(scene) {
        scene.overlay.push({
            type: 'rect',
            x: 0.5,
            y: 0.5,
            width: scene.page.width - 1,
            height: scene.page.height - 1,
            className: 'preview-outline'
        });

        scene.overlay.push({
            type: 'rect',
            x: scene.inner.x,
            y: scene.inner.y,
            width: scene.inner.width,
            height: scene.inner.height,
            className: 'preview-margin-guide'
        });
    }

    function addCartesianGrid(scene) {
        const { grid, inner, palette, state } = scene;
        const spacing = scene.spacingPt;
        const axisColumn = grid.axisColumn;
        const axisRow = grid.axisRow;

        for (let index = 0; index <= grid.columns; index += 1) {
            const x = grid.x + (index * spacing);
            const isMajor = axisColumn == null
                ? index % state.majorEvery === 0
                : Math.abs(index - axisColumn) % state.majorEvery === 0;
            addLine(scene, x, inner.y, x, inner.bottom, isMajor ? palette.major : palette.minor, isMajor ? 0.9 : 0.35);
        }

        for (let index = 0; index <= grid.rows; index += 1) {
            const y = grid.y + (index * spacing);
            const isMajor = axisRow == null
                ? (state.template === 'cornerAxes'
                    ? (grid.rows - index) % state.majorEvery === 0
                    : index % state.majorEvery === 0)
                : Math.abs(index - axisRow) % state.majorEvery === 0;
            addLine(scene, inner.x, y, inner.right, y, isMajor ? palette.major : palette.minor, isMajor ? 0.9 : 0.35);
        }

        scene.metrics.countText = `${grid.columns + 1} cols x ${grid.rows + 1} rows`;
        scene.metrics.countLabel = `${grid.columns + 1} by ${grid.rows + 1} grid intersections`;
    }

    function addCornerAxes(scene) {
        const { grid, inner, palette, state } = scene;
        const spacing = scene.spacingPt;
        const tickLength = Math.min(8, spacing * 0.35);

        addLine(scene, inner.x, inner.bottom, inner.right, inner.bottom, palette.axis, 1.7);
        addLine(scene, inner.x, inner.y, inner.x, inner.bottom, palette.axis, 1.7);

        for (let index = 0; index <= grid.columns; index += state.majorEvery) {
            const x = grid.x + (index * spacing);
            addLine(scene, x, inner.bottom, x, inner.bottom - tickLength, palette.axis, 1.1);
        }

        for (let index = 0; index <= grid.rows; index += state.majorEvery) {
            const y = grid.bottom - (index * spacing);
            addLine(scene, inner.x, y, inner.x + tickLength, y, palette.axis, 1.1);
        }
    }

    function addCenteredAxes(scene) {
        const { grid, inner, palette, state } = scene;
        const spacing = scene.spacingPt;
        const tickLength = Math.min(8, spacing * 0.35);
        const xIndex = grid.axisColumn;
        const yIndex = grid.axisRow;
        const xAxis = grid.x + (xIndex * spacing);
        const yAxis = grid.y + (yIndex * spacing);

        addLine(scene, xAxis, inner.y, xAxis, inner.bottom, palette.axis, 1.6);
        addLine(scene, inner.x, yAxis, inner.right, yAxis, palette.axis, 1.6);

        for (let index = 0; index <= grid.columns; index += 1) {
            if (Math.abs(index - xIndex) % state.majorEvery !== 0) {
                continue;
            }
            const x = grid.x + (index * spacing);
            addLine(scene, x, yAxis - tickLength, x, yAxis + tickLength, palette.axis, 1);
        }

        for (let index = 0; index <= grid.rows; index += 1) {
            if (Math.abs(index - yIndex) % state.majorEvery !== 0) {
                continue;
            }
            const y = grid.y + (index * spacing);
            addLine(scene, xAxis - tickLength, y, xAxis + tickLength, y, palette.axis, 1);
        }
    }

    function addAxisLabels(scene) {
        const { grid, palette, state, page } = scene;
        if (!isFinite(state.xMin) || !isFinite(state.xMax) || !isFinite(state.yMin) || !isFinite(state.yMax)) {
            return;
        }

        const xStep = grid.columns > 0 ? (state.xMax - state.xMin) / grid.columns : 0;
        const yStep = grid.rows > 0 ? (state.yMax - state.yMin) / grid.rows : 0;
        const fontSize = 8;
        const verticalRoom = page.height - grid.bottom;
        const horizontalRoom = grid.x;
        const xLabelYCorner = verticalRoom >= 14
            ? grid.bottom + (verticalRoom * 0.55)
            : grid.bottom - 6;
        const yLabelOutside = horizontalRoom >= 24;
        const yLabelXCorner = yLabelOutside ? grid.x - 6 : grid.x + 6;
        const yAnchorCorner = yLabelOutside ? 'end' : 'start';

        if (state.template === 'cornerAxes') {
            for (let index = 0; index <= grid.columns; index += state.majorEvery) {
                const x = grid.x + (index * scene.spacingPt);
                const value = state.xMin + (index * xStep);
                const isOriginLabel = index === 0 && nearlyZero(value);
                addText(scene, isOriginLabel ? x + 5 : x, xLabelYCorner, formatAxisValue(value, xStep), fontSize, palette.text, isOriginLabel ? 'start' : 'middle', {
                    baseline: verticalRoom >= 14 ? 'alphabetic' : 'middle'
                });
            }

            for (let index = 0; index <= grid.rows; index += state.majorEvery) {
                const y = grid.bottom - (index * scene.spacingPt);
                const value = state.yMin + (index * yStep);
                addText(scene, yLabelXCorner, y + 2, formatAxisValue(value, yStep), fontSize, palette.text, yAnchorCorner, {
                    baseline: 'middle'
                });
            }
            return;
        }

        const xAxisY = grid.y + (grid.axisRow * scene.spacingPt);
        const yAxisX = grid.x + (grid.axisColumn * scene.spacingPt);
        const xLabelY = xAxisY + 12 <= grid.bottom - 2 ? xAxisY + 12 : xAxisY - 6;
        const xLabelBaseline = xAxisY + 12 <= grid.bottom - 2 ? 'alphabetic' : 'middle';
        const yLabelX = yAxisX >= grid.x + 24 ? yAxisX - 6 : yAxisX + 6;
        const yAnchor = yAxisX >= grid.x + 24 ? 'end' : 'start';

        for (let index = 0; index <= grid.columns; index += 1) {
            if (Math.abs(index - grid.axisColumn) % state.majorEvery !== 0) {
                continue;
            }
            const x = grid.x + (index * scene.spacingPt);
            const value = state.xMin + (index * xStep);
            const isOriginLabel = index === grid.axisColumn && nearlyZero(value);
            addText(scene, isOriginLabel ? x + 5 : x, xLabelY, formatAxisValue(value, xStep), fontSize, palette.text, isOriginLabel ? 'start' : 'middle', {
                baseline: xLabelBaseline
            });
        }

        for (let index = 0; index <= grid.rows; index += 1) {
            if (Math.abs(index - grid.axisRow) % state.majorEvery !== 0 || index === grid.axisRow) {
                continue;
            }
            const y = grid.y + (index * scene.spacingPt);
            const value = state.yMax - (index * yStep);
            addText(scene, yLabelX, y + 2, formatAxisValue(value, yStep), fontSize, palette.text, yAnchor, {
                baseline: 'middle'
            });
        }
    }

    function addPageAnnotations(scene) {
        const { page, inner, palette, state } = scene;
        const headerLines = normalizeMultilineText(state.headerText, 2).split('\n').filter(Boolean);
        const footerLines = normalizeMultilineText(state.footerText, 2).split('\n').filter(Boolean);
        const lineHeight = 12;
        const scaleNote = state.includeScaleNote ? buildScaleNoteText(state) : '';

        if (headerLines.length > 0) {
            const topBand = Math.max(14, inner.y * 0.6);
            const startY = topBand;
            headerLines.forEach((line, index) => {
                addText(scene, alignedX(page, inner, state.headerAlign), startY + (index * lineHeight), line, 11, palette.text, anchorForAlign(state.headerAlign), {
                    baseline: 'middle',
                    weight: index === 0 ? 'bold' : 'normal'
                });
            });
        }

        const totalFooterLines = footerLines.length + (scaleNote ? 1 : 0);
        if (totalFooterLines > 0) {
            const bottomGap = Math.max(12, (page.height - inner.bottom) * 0.55);
            const startY = page.height - bottomGap - ((totalFooterLines - 1) * lineHeight);
            footerLines.forEach((line, index) => {
                addText(scene, alignedX(page, inner, state.footerAlign), startY + (index * lineHeight), line, 10, palette.text, anchorForAlign(state.footerAlign), {
                    baseline: 'middle'
                });
            });

            if (scaleNote) {
                const scaleY = startY + (footerLines.length * lineHeight);
                addText(scene, inner.x, scaleY, scaleNote, 9, palette.text, 'start', {
                    baseline: 'middle'
                });
            }
        }
    }

    function addDotGrid(scene, boxed) {
        const { grid, palette, state } = scene;
        const spacing = scene.spacingPt;

        for (let row = 0; row <= grid.rows; row += 1) {
            const y = grid.y + (row * spacing);
            for (let col = 0; col <= grid.columns; col += 1) {
                const x = grid.x + (col * spacing);
                addDot(scene, x, y, state.dotRadiusPt, palette.dot);
            }
        }

        if (boxed) {
            addRect(scene, grid.x, grid.y, grid.width, grid.height, palette.border, 1.2);
        }

        scene.metrics.countText = `${grid.columns + 1} cols x ${grid.rows + 1} rows`;
        scene.metrics.countLabel = `${((grid.columns + 1) * (grid.rows + 1)).toLocaleString()} dots`;
    }

    function addIsometricDots(scene) {
        const { grid, palette, state } = scene;
        const spacing = scene.spacingPt;
        let count = 0;
        let maxCols = 0;

        for (let row = 0; row <= grid.rows; row += 1) {
            const y = grid.y + (row * grid.rowStep);
            const offset = row % 2 === 0 ? 0 : spacing / 2;
            let cols = 0;

            for (let x = grid.x + offset; x <= grid.right + 0.001; x += spacing) {
                addDot(scene, x, y, state.dotRadiusPt, palette.dot);
                cols += 1;
                count += 1;
            }

            maxCols = Math.max(maxCols, cols);
        }

        scene.metrics.countText = `${maxCols} cols x ${grid.rows + 1} rows`;
        scene.metrics.countLabel = `${count.toLocaleString()} dots`;
    }

    function addLine(scene, x1, y1, x2, y2, color, width) {
        scene.primitives.push({
            type: 'line',
            x1,
            y1,
            x2,
            y2,
            color: color.rgb,
            opacity: color.opacity,
            width
        });
    }

    function addRect(scene, x, y, width, height, color, strokeWidth) {
        scene.primitives.push({
            type: 'rect',
            x,
            y,
            width,
            height,
            color: color.rgb,
            opacity: color.opacity,
            strokeWidth
        });
    }

    function addDot(scene, cx, cy, radius, color) {
        scene.primitives.push({
            type: 'circle',
            cx,
            cy,
            radius,
            color: color.rgb,
            opacity: color.opacity
        });
    }

    function addText(scene, x, y, text, size, color, anchor, options) {
        scene.primitives.push({
            type: 'text',
            x,
            y,
            text,
            size,
            color: color.rgb,
            opacity: color.opacity,
            anchor: anchor || 'start',
            baseline: options && options.baseline ? options.baseline : 'alphabetic',
            weight: options && options.weight ? options.weight : 'normal'
        });
    }

    function renderPreview(scene) {
        const svg = elements.paperPreview;
        svg.setAttribute('viewBox', `0 0 ${formatNumber(scene.page.width)} ${formatNumber(scene.page.height)}`);
        svg.textContent = '';

        const background = svgElement('rect', {
            x: 0,
            y: 0,
            width: scene.page.width,
            height: scene.page.height,
            class: 'preview-sheet'
        });
        svg.appendChild(background);

        scene.primitives.forEach((primitive) => {
            svg.appendChild(renderPreviewPrimitive(primitive));
        });

        scene.overlay.forEach((primitive) => {
            svg.appendChild(renderOverlayPrimitive(primitive));
        });
    }

    function renderPreviewPrimitive(primitive) {
        if (primitive.type === 'line') {
            return svgElement('line', {
                x1: primitive.x1,
                y1: primitive.y1,
                x2: primitive.x2,
                y2: primitive.y2,
                stroke: rgbCss(primitive.color),
                'stroke-opacity': primitive.opacity,
                'stroke-width': primitive.width,
                'stroke-linecap': 'round'
            });
        }

        if (primitive.type === 'rect') {
            return svgElement('rect', {
                x: primitive.x,
                y: primitive.y,
                width: primitive.width,
                height: primitive.height,
                fill: 'none',
                stroke: rgbCss(primitive.color),
                'stroke-opacity': primitive.opacity,
                'stroke-width': primitive.strokeWidth
            });
        }

        if (primitive.type === 'text') {
            const node = svgElement('text', {
                x: primitive.x,
                y: primitive.y,
                fill: rgbCss(primitive.color),
                'fill-opacity': primitive.opacity,
                'font-size': primitive.size,
                'font-family': primitive.weight === 'bold' ? 'Space Grotesk, sans-serif' : 'JetBrains Mono, monospace',
                'font-weight': primitive.weight === 'bold' ? '700' : '500',
                'text-anchor': mapSvgAnchor(primitive.anchor),
                'dominant-baseline': mapSvgBaseline(primitive.baseline)
            });
            node.textContent = primitive.text;
            return node;
        }

        return svgElement('circle', {
            cx: primitive.cx,
            cy: primitive.cy,
            r: primitive.radius,
            fill: rgbCss(primitive.color),
            'fill-opacity': primitive.opacity
        });
    }

    function renderOverlayPrimitive(primitive) {
        return svgElement('rect', {
            x: primitive.x,
            y: primitive.y,
            width: primitive.width,
            height: primitive.height,
            class: primitive.className
        });
    }

    function updateReadout(scene, state) {
        const templateMeta = TEMPLATE_META[state.template];
        const size = PAPER_SIZES[state.paperSize];
        const scaleSummary = buildScaleSummary(state);

        elements.templateBadge.textContent = templateMeta.label;
        elements.paperBadge.textContent = `${size.label} ${state.orientation}`;
        elements.printableAreaStat.textContent = `${formatFixed(scene.metrics.printableWidthIn, 2)} x ${formatFixed(scene.metrics.printableHeightIn, 2)} in`;
        elements.pitchStat.textContent = `${formatFixed(state.minorSpacingIn, 2)} in / ${formatFixed(state.minorSpacingIn * INCH_TO_PT, 1)} pt`;
        elements.countStat.textContent = scene.metrics.countText;
        elements.countStat.title = scene.metrics.countLabel;
        elements.scaleStat.textContent = scaleSummary.primary;
        elements.scaleStat.title = scaleSummary.detail;
    }

    function buildStatusText(scene, state) {
        const size = PAPER_SIZES[state.paperSize];
        const majorText = isGridTemplate(state.template)
            ? ` Major guides every ${state.majorEvery} intervals.`
            : '';
        const scaleText = ` ${buildScaleSummary(state).primary}.`;
        return `${TEMPLATE_META[state.template].label} on ${size.label} ${state.orientation}. Printable area ${formatFixed(scene.metrics.printableWidthIn, 2)} x ${formatFixed(scene.metrics.printableHeightIn, 2)} in.${majorText}${scaleText}`;
    }

    function saveTemplate() {
        const state = getState();
        try {
            localStorage.setItem(SAVED_TEMPLATE_KEY, JSON.stringify(state));
            setStatus('Saved the current graph paper settings locally.');
        } catch (error) {
            console.error('Failed to save graph paper template:', error);
            setStatus('Could not save locally. Browser storage may be unavailable or full.');
        }
    }

    function loadTemplate() {
        const raw = localStorage.getItem(SAVED_TEMPLATE_KEY);
        if (!raw) {
            setStatus('No saved local template was found.');
            return;
        }

        try {
            applyState(normalizeImportedState(JSON.parse(raw)));
            setStatus('Loaded the saved local template.');
        } catch (error) {
            console.error('Failed to load saved graph paper template:', error);
            setStatus('Saved template could not be loaded.');
        }
    }

    function exportSettings() {
        const state = getState();
        const payload = {
            tool: 'graph-paper-generator',
            version: 1,
            exportedAt: new Date().toISOString(),
            settings: state
        };
        const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
        triggerDownload(blob, `graph-paper-settings-${state.template}.json`);
        setStatus('Exported graph paper settings as JSON.');
    }

    async function importSettings(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }

        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const importedState = normalizeImportedState(parsed.settings || parsed);
            applyState(importedState);
            setStatus(`Imported settings from ${file.name}.`);
        } catch (error) {
            console.error('Failed to import graph paper settings:', error);
            setStatus('Settings import failed. Use a JSON file exported by this tool.');
        } finally {
            elements.importSettingsInput.value = '';
        }
    }

    function downloadPdf() {
        try {
            const state = getState();
            const scene = lastScene || buildScene(state, getPageDimensions(state.paperSize, state.orientation));
            const blob = new Blob([buildPdf(scene)], { type: 'application/pdf' });
            const filename = buildFilename(scene.state);
            triggerDownload(blob, filename);
            setStatus(`Downloaded ${filename}. Print at 100% scale for the intended spacing.`);
        } catch (error) {
            console.error('PDF generation failed:', error);
            setStatus('PDF generation failed. Check your settings and try again.');
        }
    }

    function buildPdf(scene) {
        const alphaMap = buildAlphaStateMap(scene.primitives);
        const content = buildPdfContent(scene, alphaMap);
        const extStateEntries = Array.from(alphaMap.entries())
            .map(([key, value]) => ({ key, ...value }))
            .sort((left, right) => left.objectNumber - right.objectNumber);
        const extStateResource = extStateEntries.length > 0
            ? ` /ExtGState << ${extStateEntries.map((entry) => `/${entry.name} ${entry.objectNumber} 0 R`).join(' ')} >>`
            : '';
        const objects = [
            '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
            '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n',
            `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(scene.page.width)} ${formatNumber(scene.page.height)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${extStateResource} >> /Contents 4 0 R >>\nendobj\n`,
            `4 0 obj\n<< /Length ${byteLength(content)} >>\nstream\n${content}endstream\nendobj\n`,
            '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
            '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n'
        ];

        extStateEntries.forEach((entry) => {
            objects.push(`${entry.objectNumber} 0 obj\n<< /Type /ExtGState /ca ${entry.alpha.toFixed(3)} /CA ${entry.alpha.toFixed(3)} >>\nendobj\n`);
        });

        const header = '%PDF-1.4\n%1234\n';
        const offsets = [0];
        let body = '';
        let runningLength = byteLength(header);

        objects.forEach((objectString) => {
            offsets.push(runningLength);
            body += objectString;
            runningLength += byteLength(objectString);
        });

        const xrefOffset = runningLength;
        let xref = `xref\n0 ${objects.length + 1}\n`;
        xref += '0000000000 65535 f \n';
        for (let index = 1; index < offsets.length; index += 1) {
            xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
        }

        const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
        return `${header}${body}${xref}${trailer}`;
    }

    function buildPdfContent(scene, alphaMap) {
        const commands = ['1 J', '1 j'];

        scene.primitives.forEach((primitive) => {
            commands.push(`/${getAlphaStateName(alphaMap, primitive.opacity)} gs`);

            if (primitive.type === 'line') {
                commands.push(`${primitive.width.toFixed(3)} w`);
                commands.push(`${pdfColor(primitive.color)} RG`);
                commands.push(`${formatNumber(primitive.x1)} ${formatNumber(toPdfY(scene.page.height, primitive.y1))} m`);
                commands.push(`${formatNumber(primitive.x2)} ${formatNumber(toPdfY(scene.page.height, primitive.y2))} l`);
                commands.push('S');
                return;
            }

            if (primitive.type === 'rect') {
                commands.push(`${primitive.strokeWidth.toFixed(3)} w`);
                commands.push(`${pdfColor(primitive.color)} RG`);
                commands.push(`${formatNumber(primitive.x)} ${formatNumber(toPdfY(scene.page.height, primitive.y + primitive.height))} ${formatNumber(primitive.width)} ${formatNumber(primitive.height)} re`);
                commands.push('S');
                return;
            }

            if (primitive.type === 'text') {
                const textWidth = measureTextWidth(primitive.text, primitive.size, primitive.weight);
                const anchorOffset = primitive.anchor === 'middle'
                    ? textWidth / 2
                    : primitive.anchor === 'end'
                        ? textWidth
                        : 0;
                const baselineOffset = primitive.baseline === 'middle'
                    ? primitive.size * 0.32
                    : primitive.baseline === 'hanging'
                        ? primitive.size * 0.85
                        : 0;
                const x = primitive.x - anchorOffset;
                const y = toPdfY(scene.page.height, primitive.y) - baselineOffset;
                commands.push('BT');
                commands.push(`${primitive.weight === 'bold' ? '/F2' : '/F1'} ${primitive.size.toFixed(2)} Tf`);
                commands.push(`${pdfColor(primitive.color)} rg`);
                commands.push(`1 0 0 1 ${formatNumber(x)} ${formatNumber(y)} Tm`);
                commands.push(`(${escapePdfText(primitive.text)}) Tj`);
                commands.push('ET');
                return;
            }

            commands.push(`${pdfColor(primitive.color)} rg`);
            commands.push(circlePath(primitive.cx, toPdfY(scene.page.height, primitive.cy), primitive.radius));
            commands.push('f');
        });

        return `${commands.join('\n')}\n`;
    }

    function circlePath(cx, cy, radius) {
        const k = 0.552284749831 * radius;
        const x0 = cx - radius;
        const x1 = cx - k;
        const x2 = cx + k;
        const x3 = cx + radius;
        const y0 = cy - radius;
        const y1 = cy - k;
        const y2 = cy + k;
        const y3 = cy + radius;

        return [
            `${formatNumber(cx)} ${formatNumber(y3)} m`,
            `${formatNumber(x2)} ${formatNumber(y3)} ${formatNumber(x3)} ${formatNumber(y2)} ${formatNumber(x3)} ${formatNumber(cy)} c`,
            `${formatNumber(x3)} ${formatNumber(y1)} ${formatNumber(x2)} ${formatNumber(y0)} ${formatNumber(cx)} ${formatNumber(y0)} c`,
            `${formatNumber(x1)} ${formatNumber(y0)} ${formatNumber(x0)} ${formatNumber(y1)} ${formatNumber(x0)} ${formatNumber(cy)} c`,
            `${formatNumber(x0)} ${formatNumber(y2)} ${formatNumber(x1)} ${formatNumber(y3)} ${formatNumber(cx)} ${formatNumber(y3)} c`
        ].join('\n');
    }

    function buildFilename(state) {
        return `graph-paper-${state.template}-${state.paperSize}-${state.orientation}.pdf`;
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function getPageDimensions(sizeKey, orientation) {
        const size = PAPER_SIZES[sizeKey] || PAPER_SIZES.letter;
        if (orientation === 'landscape') {
            return {
                width: size.height,
                height: size.width
            };
        }

        return {
            width: size.width,
            height: size.height
        };
    }

    function buildOrthogonalField(inner, spacing, options) {
        let columns = fitGridCount(Math.max(1, Math.floor(inner.width / spacing)), {
            multiple: options.columnMultiple || 1,
            even: options.evenColumns
        });
        let rows = fitGridCount(Math.max(1, Math.floor(inner.height / spacing)), {
            multiple: options.rowMultiple || 1,
            even: options.evenRows
        });

        const width = columns * spacing;
        const height = rows * spacing;
        let x = inner.x;
        let y = inner.y;

        if (options.mode === 'center') {
            x = inner.x + ((inner.width - width) / 2);
            y = inner.y + ((inner.height - height) / 2);
        } else if (options.mode === 'cornerBottomLeft') {
            y = inner.bottom - height;
        }

        return {
            x,
            y,
            width,
            height,
            right: x + width,
            bottom: y + height,
            columns,
            rows,
            axisColumn: options.evenColumns ? columns / 2 : null,
            axisRow: options.evenRows ? rows / 2 : null
        };
    }

    function buildIsometricField(inner, spacing, options) {
        const rowStep = spacing * (SQRT_THREE / 2);
        const columns = Math.max(1, Math.floor(inner.width / spacing));
        const rows = Math.max(1, Math.floor(inner.height / rowStep));
        const width = columns * spacing;
        const height = rows * rowStep;
        let x = inner.x;
        let y = inner.y;

        if (options.mode === 'center') {
            x = inner.x + ((inner.width - width) / 2);
            y = inner.y + ((inner.height - height) / 2);
        }

        return {
            x,
            y,
            width,
            height,
            right: x + width,
            bottom: y + height,
            columns,
            rows,
            rowStep
        };
    }

    function fitGridCount(available, options) {
        const requiredMultiple = Math.max(1, options.multiple || 1);
        let count = available;

        if (count >= requiredMultiple) {
            count = Math.floor(count / requiredMultiple) * requiredMultiple;
        }

        if (options.even && count % 2 !== 0 && count > 1) {
            count -= 1;
        }

        if (count < 1) {
            count = available;
        }

        if (options.even && count % 2 !== 0 && count > 1) {
            count -= 1;
        }

        return Math.max(1, count);
    }

    function getActivePalette(state) {
        const base = PALETTES[state.palette] || PALETTES.engineerBlue;
        const minorRgb = state.useCustomColors
            ? rgb255(state.minorRed, state.minorGreen, state.minorBlue)
            : base.minor;
        const majorRgb = state.useCustomColors
            ? rgb255(state.majorRed, state.majorGreen, state.majorBlue)
            : base.major;
        const accentRgb = state.useCustomColors
            ? rgb255(state.accentRed, state.accentGreen, state.accentBlue)
            : base.axis;

        return {
            minor: { rgb: minorRgb, opacity: state.minorOpacity },
            major: { rgb: majorRgb, opacity: state.majorOpacity },
            axis: { rgb: accentRgb, opacity: 1 },
            dot: state.useCustomColors
                ? { rgb: majorRgb, opacity: state.majorOpacity }
                : { rgb: base.dot, opacity: state.majorOpacity },
            border: state.useCustomColors
                ? { rgb: accentRgb, opacity: 1 }
                : { rgb: base.border, opacity: 1 },
            text: { rgb: accentRgb, opacity: 1 }
        };
    }

    function buildAlphaStateMap(primitives) {
        const map = new Map();
        let nextObjectNumber = 7;

        primitives.forEach((primitive) => {
            const key = clamp(primitive.opacity == null ? 1 : primitive.opacity, 0.05, 1).toFixed(3);
            if (!map.has(key)) {
                map.set(key, {
                    alpha: Number.parseFloat(key),
                    name: `GS${map.size + 1}`,
                    objectNumber: nextObjectNumber
                });
                nextObjectNumber += 1;
            }
        });

        if (!map.has('1.000')) {
            map.set('1.000', {
                alpha: 1,
                name: `GS${map.size + 1}`,
                objectNumber: nextObjectNumber
            });
        }

        return map;
    }

    function getAlphaStateName(alphaMap, opacity) {
        const key = clamp(opacity == null ? 1 : opacity, 0.05, 1).toFixed(3);
        return alphaMap.get(key).name;
    }

    function setStatus(message) {
        elements.statusLine.textContent = message;
    }

    function isGridTemplate(template) {
        return template === 'cartesian' || template === 'cornerAxes' || template === 'centerAxes';
    }

    function isDotTemplate(template) {
        return template === 'dotGrid' || template === 'boxedDots' || template === 'isometricDots';
    }

    function isAxisTemplate(template) {
        return template === 'cornerAxes' || template === 'centerAxes';
    }

    function isOrthogonalTemplate(template) {
        return template === 'cartesian'
            || template === 'cornerAxes'
            || template === 'centerAxes'
            || template === 'dotGrid'
            || template === 'boxedDots';
    }

    function toggleGroup(group, visible) {
        group.forEach((element) => {
            element.classList.toggle('hidden', !visible);
        });
    }

    function svgElement(tagName, attributes) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tagName);
        Object.entries(attributes).forEach(([key, value]) => {
            node.setAttribute(key, String(value));
        });
        return node;
    }

    function rgbCss(color) {
        return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
    }

    function pdfColor(color) {
        return color.map((channel) => channel.toFixed(3)).join(' ');
    }

    function rgb255(red, green, blue) {
        return [red / 255, green / 255, blue / 255];
    }

    function syncColorSlider(input, output, normalizedChannel) {
        const value = Math.round(normalizedChannel * 255);
        if (elements.useCustomColorsCheck.checked) {
            output.textContent = input.value;
            return;
        }
        output.textContent = String(value);
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map((x) => {
            const hex = Math.round(x).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('').toUpperCase();
    }

    function updateColorHexDisplays(state) {
        const activeColors = getActivePalette(state);
        const r = Math.round(activeColors.minor.rgb[0] * 255);
        const g = Math.round(activeColors.minor.rgb[1] * 255);
        const b = Math.round(activeColors.minor.rgb[2] * 255);
        const hex = rgbToHex(r, g, b);
        if (elements.minorRedHex) elements.minorRedHex.textContent = hex;
        if (elements.minorGreenHex) elements.minorGreenHex.textContent = hex;
        if (elements.minorBlueHex) elements.minorBlueHex.textContent = hex;

        const mr = Math.round(activeColors.major.rgb[0] * 255);
        const mg = Math.round(activeColors.major.rgb[1] * 255);
        const mb = Math.round(activeColors.major.rgb[2] * 255);
        const mhex = rgbToHex(mr, mg, mb);
        if (elements.majorRedHex) elements.majorRedHex.textContent = mhex;
        if (elements.majorGreenHex) elements.majorGreenHex.textContent = mhex;
        if (elements.majorBlueHex) elements.majorBlueHex.textContent = mhex;

        const ar = Math.round(activeColors.axis.rgb[0] * 255);
        const ag = Math.round(activeColors.axis.rgb[1] * 255);
        const ab = Math.round(activeColors.axis.rgb[2] * 255);
        const ahex = rgbToHex(ar, ag, ab);
        if (elements.accentRedHex) elements.accentRedHex.textContent = ahex;
        if (elements.accentGreenHex) elements.accentGreenHex.textContent = ahex;
        if (elements.accentBlueHex) elements.accentBlueHex.textContent = ahex;
    }

    function mapSvgAnchor(anchor) {
        if (anchor === 'middle') {
            return 'middle';
        }
        if (anchor === 'end') {
            return 'end';
        }
        return 'start';
    }

    function mapSvgBaseline(baseline) {
        if (baseline === 'middle') {
            return 'middle';
        }
        if (baseline === 'hanging') {
            return 'hanging';
        }
        return 'alphabetic';
    }

    function toPdfY(pageHeight, y) {
        return pageHeight - y;
    }

    function parseNumber(value, fallback) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizeScaleUnit(value) {
        const validUnits = new Set(['in', 'ft', 'yd', 'mm', 'cm', 'm']);
        return validUnits.has(value) ? value : DEFAULT_STATE.scaleUnit;
    }

    function normalizeTextAlign(value) {
        if (value === 'left' || value === 'right') {
            return value;
        }
        return 'center';
    }

    function normalizeImportedState(raw) {
        const merged = {
            ...DEFAULT_STATE,
            ...(raw && typeof raw === 'object' ? raw : {})
        };

        return normalizeStateForTemplate({
            ...merged,
            useCustomColors: Boolean(merged.useCustomColors),
            includeScaleNote: Boolean(merged.includeScaleNote),
            headerText: normalizeMultilineText(String(merged.headerText || ''), 2),
            headerAlign: normalizeTextAlign(merged.headerAlign),
            footerText: normalizeMultilineText(String(merged.footerText || ''), 2),
            footerAlign: normalizeTextAlign(merged.footerAlign),
            scaleUnit: normalizeScaleUnit(merged.scaleUnit),
            template: TEMPLATE_META[merged.template] ? merged.template : DEFAULT_STATE.template,
            paperSize: PAPER_SIZES[merged.paperSize] ? merged.paperSize : DEFAULT_STATE.paperSize,
            orientation: merged.orientation === 'landscape' ? 'landscape' : 'portrait',
            palette: PALETTES[merged.palette] ? merged.palette : DEFAULT_STATE.palette
        });
    }

    function normalizeStateForTemplate(state) {
        const normalized = { ...state };

        if (normalized.template === 'centerAxes') {
            const xExtent = Math.max(Math.abs(normalized.xMin), Math.abs(normalized.xMax));
            const yExtent = Math.max(Math.abs(normalized.yMin), Math.abs(normalized.yMax));
            normalized.xMin = -xExtent;
            normalized.xMax = xExtent;
            normalized.yMin = -yExtent;
            normalized.yMax = yExtent;
        }

        return normalized;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function clampInt(value, min, max) {
        return Math.round(clamp(value, min, max));
    }

    function formatAxisInput(value) {
        if (!Number.isFinite(value)) {
            return '0';
        }
        return value.toString();
    }

    function buildScaleSummary(state) {
        const valueText = formatAxisValue(state.scaleValue, state.scaleValue / 10 || 0.1);
        const primaryLabel = isDotTemplate(state.template) ? '1 dot interval' : '1 interval';
        if (!isOrthogonalTemplate(state.template)) {
            return {
                primary: `${primaryLabel} = ${valueText} ${state.scaleUnit}`,
                detail: `${primaryLabel} = ${valueText} ${state.scaleUnit}`
            };
        }

        const areaValue = state.scaleValue * state.scaleValue;
        const areaText = formatAxisValue(areaValue, areaValue / 10 || 0.1);
        const areaLabel = isDotTemplate(state.template) ? '1 dot box' : '1 box';
        return {
            primary: `${primaryLabel} = ${valueText} ${state.scaleUnit}`,
            detail: `${primaryLabel} = ${valueText} ${state.scaleUnit}; ${areaLabel} = ${areaText} ${state.scaleUnit}^2`
        };
    }

    function buildScaleNoteText(state) {
        const summary = buildScaleSummary(state);
        if (!summary || !summary.detail) {
            return '';
        }

        return `Scale: ${summary.detail}`;
    }

    function formatAxisValue(value, step) {
        if (!Number.isFinite(value)) {
            return '--';
        }

        const absStep = Math.abs(step);
        if (absStep === 0) {
            if (Number.isInteger(value)) {
                return value.toString();
            }
            return trimTrailingZeros(value.toFixed(Math.abs(value) < 1 ? 4 : 2));
        }

        if ((Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) && absStep !== 0) {
            return value.toExponential(2);
        }

        let decimals = 0;
        if (absStep > 0 && absStep < 1) {
            decimals = Math.min(4, Math.max(1, Math.ceil(-Math.log10(absStep)) + 1));
        }

        return trimTrailingZeros(value.toFixed(decimals));
    }

    function formatFixed(value, decimals) {
        return value.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    }

    function trimTrailingZeros(text) {
        return text.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    }

    function alignedX(page, inner, align) {
        if (align === 'left') {
            return inner.x;
        }
        if (align === 'right') {
            return inner.right;
        }
        return page.width / 2;
    }

    function anchorForAlign(align) {
        if (align === 'left') {
            return 'start';
        }
        if (align === 'right') {
            return 'end';
        }
        return 'middle';
    }

    function nearlyZero(value) {
        return Math.abs(value) <= 1e-9;
    }

    function formatNumber(value) {
        return Number.parseFloat(value.toFixed(3)).toString();
    }

    function normalizeMultilineText(value, maxLines) {
        return sanitizePdfCompatibleText(value)
            .replace(/\r\n/g, '\n')
            .split('\n')
            .slice(0, maxLines)
            .map((line) => line.trim())
            .filter((line, index, lines) => line.length > 0 || (index < lines.length - 1 && lines.slice(index + 1).some(Boolean)))
            .join('\n');
    }

    function sanitizePdfCompatibleText(value) {
        return value
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, '\'')
            .replace(/[–—]/g, '-')
            .replace(/…/g, '...')
            .replace(/\u00A0/g, ' ')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\x20-\x7E\n]/g, '');
    }

    function measureTextWidth(text, fontSize, weight) {
        if (typeof document === 'undefined') {
            return text.length * fontSize * 0.56;
        }

        if (!measureTextWidth.canvas) {
            measureTextWidth.canvas = document.createElement('canvas');
            measureTextWidth.context = measureTextWidth.canvas.getContext('2d');
        }

        const context = measureTextWidth.context;
        if (!context) {
            return text.length * fontSize * 0.56;
        }

        context.font = weight === 'bold'
            ? `${fontSize}px Helvetica, Arial, sans-serif`
            : `${fontSize}px "Courier New", Courier, monospace`;
        return context.measureText(text).width;
    }

    function escapePdfText(text) {
        return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    }

    function byteLength(text) {
        return new TextEncoder().encode(text).length;
    }
})();
