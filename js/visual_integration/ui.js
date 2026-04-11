/**
 * Visual Integration Tool - UI and Interactions
 */
import {
    state,
    POINT_LIMITS,
    addSeries,
    getSeries,
    deleteSeries,
    updateCalibration,
    updateSetting,
    parseScientificNumber,
    addDataPointToActive,
    addVisualPointToActive,
    clearActiveSeriesPoints,
    clearImageDependentMeasurements,
    loadExampleData
} from './state.js';
import { canvasToPngBlob, draw } from './canvas.js';
import {
    calculateAUC,
    getCalibrationStatus,
    getRenderablePoints,
    findPointNearScreen,
    screenToNormIfInside,
    screenToNormClamped,
    screenToImageIfInside,
    screenToImageClamped,
    normalizeRect,
    cropCanvas,
    updatePointFromNorm
} from './math.js';
import { io, IO_LIMITS } from './io.js';

const DEFAULT_OVERLAY_TEXT = 'Click inside the canvas to add points to the active series.';

export function setupUI() {
    setupCalibrationInputs();
    setupSeriesControls();
    setupCanvasInteractions();
    setupDataImport();
    setupExportUtilities();
    setupBackgroundAndExamples();

    updateSeriesListUI();
    updateResultsUI();
}

function syncCalibrationUI() {
    ['xMinVal', 'xMaxVal', 'yMinVal', 'yMaxVal', 'baselineVal'].forEach(id => {
        const input = document.getElementById(id);
        input.value = state.calibration[id];
        input.classList.remove('invalid-input');
    });
}

function setOverlayText(text) {
    document.getElementById('canvasOverlayText').textContent = text;
}

function resetActiveToolUI(message = DEFAULT_OVERLAY_TEXT) {
    state.activeTool = 'add-point';
    setOverlayText(message);
    document.getElementById('integrationCanvas').style.cursor = 'crosshair';
    setRoiButtonActive(false);
}

function setRoiButtonActive(isActive) {
    const btnSelectRoi = document.getElementById('btnSelectRoi');
    btnSelectRoi.classList.toggle('active', isActive);
}

function setHidden(id, isHidden) {
    document.getElementById(id).hidden = isHidden;
}

function setupBackgroundAndExamples() {
    document.getElementById('loadExampleBtn').addEventListener('click', () => {
        loadExampleData();
        syncCalibrationUI();
        updateSeriesListUI();
        document.querySelector('.canvas-container').style.aspectRatio = '4/3';
        setHidden('clearBgBtn', true);
        setHidden('btnSelectRoi', true);
        setHidden('btnResetRoi', true);
        setHidden('pdfControls', true);
        resetActiveToolUI();
        window.dispatchEvent(new Event('resize'));
        updateResultsUI();
    });

    const bgUpload = document.getElementById('bgUpload');
    const clearBgBtn = document.getElementById('clearBgBtn');
    const canvasContainer = document.querySelector('.canvas-container');

    bgUpload.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

        try {
            if (isPdf) {
                const ok = await io.loadPdfJsIfNeeded();
                if (!ok) {
                    alert('PDF.js could not be loaded.');
                    return;
                }

                state.pdfDoc = await io.loadPdfDocument(file);
                setHidden('pdfControls', false);
                document.getElementById('pdfPage').max = state.pdfDoc.numPages;
                document.getElementById('pdfPage').value = 1;
                const rendered = await renderSelectedPdfPage({ clearMeasurements: true });
                if (!rendered) return;
            } else {
                state.pdfDoc = null;
                setHidden('pdfControls', true);
                const canvas = await io.loadImageFile(file);
                setBackgroundImage(canvas, canvas.width, canvas.height, { clearMeasurements: true });
            }
            resetActiveToolUI('Image loaded. Calibrate axes before tracing visual points.');
        } catch (error) {
            console.error(error);
            alert(error.message || 'Failed to load file. Use a valid image or PDF within the size limits.');
        } finally {
            event.target.value = '';
        }
    });

    clearBgBtn.addEventListener('click', () => {
        state.backgroundImage = null;
        state.originalImage = null;
        state.pdfDoc = null;
        clearImageDependentMeasurements();
        canvasContainer.style.aspectRatio = '4/3';
        setHidden('clearBgBtn', true);
        setHidden('btnSelectRoi', true);
        setHidden('btnResetRoi', true);
        setHidden('pdfControls', true);
        resetActiveToolUI('Background cleared. Numeric data points remain.');
        window.dispatchEvent(new Event('resize'));
        updateSeriesListUI();
        updateResultsUI();
    });

    const btnSelectRoi = document.getElementById('btnSelectRoi');
    const btnResetRoi = document.getElementById('btnResetRoi');

    btnSelectRoi.addEventListener('click', () => {
        if (!state.backgroundImage) return;

        state.activeTool = state.activeTool === 'roi' ? 'add-point' : 'roi';
        if (state.activeTool === 'roi') {
            setOverlayText('Drag inside the image to select a region of interest.');
            document.getElementById('integrationCanvas').style.cursor = 'crosshair';
            setRoiButtonActive(true);
        } else {
            resetActiveToolUI();
        }
    });

    btnResetRoi.addEventListener('click', () => {
        if (!state.originalImage) return;
        setBackgroundImage(state.originalImage, state.originalImage.width, state.originalImage.height, {
            clearMeasurements: true
        });
        resetActiveToolUI('ROI reset. Recalibrate before tracing visual points.');
        updateSeriesListUI();
        updateResultsUI();
    });

    setupPdfControls();
}

function setBackgroundImage(source, width, height, options = {}) {
    const { isCrop = false, clearMeasurements = false } = options;

    if (!isCrop) {
        state.originalImage = source;
    }

    state.backgroundImage = source;
    state.roiDraft = null;

    if (clearMeasurements) {
        clearImageDependentMeasurements();
    }

    document.querySelector('.canvas-container').style.aspectRatio = `${width}/${height}`;
    setHidden('clearBgBtn', false);
    setHidden('btnSelectRoi', false);
    setHidden('btnResetRoi', !isCrop);
    window.dispatchEvent(new Event('resize'));
    updateResultsUI();
}

function setupPdfControls() {
    const btnPrev = document.getElementById('btnPdfPrev');
    const btnNext = document.getElementById('btnPdfNext');
    const pdfPage = document.getElementById('pdfPage');
    const pdfScale = document.getElementById('pdfScale');

    pdfScale.max = IO_LIMITS.maxPdfScale;

    btnPrev.addEventListener('click', async () => {
        if (!state.pdfDoc) return;
        pdfPage.value = Math.max(1, Number.parseInt(pdfPage.value, 10) - 1);
        await renderSelectedPdfPage({ clearMeasurements: true });
    });

    btnNext.addEventListener('click', async () => {
        if (!state.pdfDoc) return;
        pdfPage.value = Math.min(state.pdfDoc.numPages, Number.parseInt(pdfPage.value, 10) + 1);
        await renderSelectedPdfPage({ clearMeasurements: true });
    });

    pdfPage.addEventListener('change', async () => {
        if (!state.pdfDoc) return;
        pdfPage.value = Math.max(1, Math.min(state.pdfDoc.numPages, Number.parseInt(pdfPage.value, 10) || 1));
        await renderSelectedPdfPage({ clearMeasurements: true });
    });

    pdfScale.addEventListener('change', async () => {
        if (!state.pdfDoc) return;
        pdfScale.value = Math.max(1, Math.min(IO_LIMITS.maxPdfScale, Number(pdfScale.value) || 4));
        await renderSelectedPdfPage({ clearMeasurements: true });
    });
}

async function renderSelectedPdfPage(options = {}) {
    if (!state.pdfDoc) return false;

    const pageNum = Number.parseInt(document.getElementById('pdfPage').value, 10);
    const scale = Math.max(1, Math.min(IO_LIMITS.maxPdfScale, Number(document.getElementById('pdfScale').value) || 4));

    document.getElementById('pdfPageMeta').textContent = `${pageNum} / ${state.pdfDoc.numPages}`;
    document.getElementById('pdfScale').value = String(scale);
    document.getElementById('btnPdfPrev').disabled = pageNum <= 1;
    document.getElementById('btnPdfNext').disabled = pageNum >= state.pdfDoc.numPages;

    try {
        const canvas = await io.renderPdfPage(state.pdfDoc, pageNum, scale);
        setBackgroundImage(canvas, canvas.width, canvas.height, options);
        return true;
    } catch (error) {
        console.error(error);
        alert(error.message || 'Error rendering PDF page.');
        return false;
    }
}

function setupCalibrationInputs() {
    const inputs = ['xMinVal', 'xMaxVal', 'yMinVal', 'yMaxVal', 'baselineVal'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        input.addEventListener('input', (event) => {
            const ok = updateCalibration(id, event.target.value);
            input.classList.toggle('invalid-input', !ok);
            if (!ok) return;
            draw();
            updateResultsUI();
        });

        input.addEventListener('change', () => {
            if (!input.classList.contains('invalid-input')) return;
            input.value = state.calibration[id];
            input.classList.remove('invalid-input');
        });
    });

    document.querySelectorAll('.cal-anchor-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const anchor = event.target.closest('button').dataset.anchor;
            state.activeTool = `cal-${anchor}`;
            setOverlayText(`Click inside the image or canvas to place ${anchor.replace('Norm', '')}.`);
            document.getElementById('integrationCanvas').style.cursor = 'crosshair';
            setRoiButtonActive(false);
        });
    });

    document.getElementById('showGrid').addEventListener('change', (event) => {
        updateSetting('showGrid', event.target.checked);
        draw();
    });

    document.getElementById('showAuc').addEventListener('change', (event) => {
        updateSetting('showAuc', event.target.checked);
        draw();
    });

    document.getElementById('clearPointsBtn').addEventListener('click', () => {
        clearActiveSeriesPoints();
        draw();
        updateResultsUI();
    });
}

function setupSeriesControls() {
    document.getElementById('addSeriesBtn').addEventListener('click', () => {
        addSeries();
        updateSeriesListUI();
        updateResultsUI();
        draw();
    });
}

export function updateSeriesListUI() {
    const container = document.getElementById('seriesContainer');
    container.replaceChildren();

    if (state.seriesList.length === 0) {
        container.appendChild(createHelpMessage('No series added.'));
        return;
    }

    state.seriesList.forEach(series => {
        const div = document.createElement('div');
        div.className = `series-item ${series.id === state.activeSeriesId ? 'active' : ''}`;

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'series-color-picker';
        colorInput.value = hslToHex(series.color);
        colorInput.title = 'Change color';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'series-name';
        nameInput.value = series.name;
        nameInput.maxLength = 100;
        nameInput.setAttribute('aria-label', 'Series name');

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'series-delete-btn';
        delBtn.title = 'Delete series';
        delBtn.setAttribute('aria-label', `Delete ${series.name || 'series'}`);
        delBtn.textContent = 'x';

        div.append(colorInput, nameInput, delBtn);

        div.addEventListener('click', (event) => {
            if (event.target.closest('input, button')) return;
            state.activeSeriesId = series.id;
            updateSeriesListUI();
            draw();
        });

        colorInput.addEventListener('input', (event) => {
            series.color = event.target.value;
            draw();
            updateResultsUI();
        });

        nameInput.addEventListener('input', (event) => {
            series.name = event.target.value;
            updateResultsUI();
        });

        delBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            deleteSeries(series.id);
            updateSeriesListUI();
            updateResultsUI();
            draw();
        });

        container.appendChild(div);
    });
}

export function updateResultsUI() {
    const container = document.getElementById('resultsContainer');
    container.replaceChildren();
    const calibrationStatus = getCalibrationStatus();

    if (state.seriesList.length === 0) {
        container.appendChild(createHelpMessage('No results.'));
        return;
    }

    if (!calibrationStatus.valid) {
        container.appendChild(createHelpMessage(`Invalid calibration: ${calibrationStatus.issues[0]}`));
    }

    state.seriesList.forEach(series => {
        const auc = calculateAUC(series);
        const div = document.createElement('div');
        div.className = 'result-item';

        const name = document.createElement('div');
        name.className = 'result-name';

        const swatch = document.createElement('div');
        swatch.className = 'result-swatch';
        swatch.style.backgroundColor = series.color;

        const label = document.createElement('span');
        label.textContent = series.name;

        const value = document.createElement('div');
        value.className = 'result-value';
        value.textContent = formatNumber(auc);

        name.append(swatch, label);
        div.append(name, value);
        container.appendChild(div);
    });
}

function createHelpMessage(text) {
    const div = document.createElement('div');
    div.className = 'help-text';
    div.textContent = text;
    return div;
}

function formatNumber(num) {
    if (!Number.isFinite(num)) return 'n/a';
    if (num === 0) return '0';
    const abs = Math.abs(num);
    if (abs >= 1000 || abs < 0.001) {
        return num.toExponential(3).replace(/\.?0+e/, 'e').replace('e+', 'E').replace('e-', 'E-');
    }
    return num.toFixed(4).replace(/\.?0+$/, '');
}

function setupCanvasInteractions() {
    const canvas = document.getElementById('integrationCanvas');

    canvas.addEventListener('pointerdown', (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        try { canvas.setPointerCapture(event.pointerId); } catch (error) {}

        const { pxX, pxY } = getCanvasPointer(event, canvas);

        if (state.activeTool === 'roi') {
            const imgPoint = screenToImageIfInside(pxX, pxY);
            if (!imgPoint) return;
            state.roiDraft = { start: { ...imgPoint }, end: { ...imgPoint } };
            event.preventDefault();
            return;
        }

        if (state.activeTool.startsWith('cal-')) {
            const anchor = state.activeTool.slice(4);
            const norm = screenToNormIfInside(pxX, pxY);
            if (!norm) {
                setOverlayText('Click inside the image or canvas to place the calibration anchor.');
                return;
            }

            state.calibration[anchor] = { x: norm.x, y: norm.y };
            resetActiveToolUI();
            draw();
            updateResultsUI();
            return;
        }

        const hit = findPointNearScreen(pxX, pxY, 10);
        if (hit) {
            state.draggedPoint = hit;
            return;
        }

        if (!state.activeSeriesId) return;
        const norm = screenToNormIfInside(pxX, pxY);
        if (!norm) return;

        addVisualPointToActive(norm.x, norm.y);
        draw();
        updateResultsUI();
    });

    canvas.addEventListener('pointermove', (event) => {
        const { pxX, pxY } = getCanvasPointer(event, canvas);

        if (state.activeTool === 'roi' && state.roiDraft) {
            const imgPoint = screenToImageClamped(pxX, pxY);
            if (!imgPoint) return;
            state.roiDraft.end = imgPoint;
            draw();
            return;
        }

        if (!state.draggedPoint) return;

        const norm = screenToNormClamped(pxX, pxY);
        const series = getSeries(state.draggedPoint.seriesId);
        const point = series?.points[state.draggedPoint.pointIndex];
        if (!point) return;

        updatePointFromNorm(point, norm);
        draw();
        updateResultsUI();
    });

    canvas.addEventListener('pointerup', (event) => {
        try { canvas.releasePointerCapture(event.pointerId); } catch (error) {}

        if (state.activeTool === 'roi' && state.roiDraft && state.backgroundImage) {
            const rect = normalizeRect({
                x1: state.roiDraft.start.x,
                y1: state.roiDraft.start.y,
                x2: state.roiDraft.end.x,
                y2: state.roiDraft.end.y
            });
            const cropRect = clampCropRect(rect, state.backgroundImage);

            if (cropRect.w >= 8 && cropRect.h >= 8) {
                const croppedCanvas = cropCanvas(state.backgroundImage, cropRect);
                setBackgroundImage(croppedCanvas, croppedCanvas.width, croppedCanvas.height, {
                    isCrop: true,
                    clearMeasurements: true
                });
                resetActiveToolUI('ROI applied. Recalibrate before tracing visual points.');
                updateSeriesListUI();
                updateResultsUI();
            }

            state.roiDraft = null;
            draw();
        }

        state.draggedPoint = null;
    });
}

function getCanvasPointer(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
        pxX: event.clientX - rect.left,
        pxY: event.clientY - rect.top
    };
}

function clampCropRect(rect, image) {
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const maxWidth = Math.max(0, image.width - x);
    const maxHeight = Math.max(0, image.height - y);

    return {
        x,
        y,
        w: Math.min(Math.floor(rect.w), maxWidth),
        h: Math.min(Math.floor(rect.h), maxHeight)
    };
}

function setupDataImport() {
    const importBtn = document.getElementById('importDataBtn');
    const textArea = document.getElementById('csvDataInput');

    importBtn.addEventListener('click', () => {
        const text = textArea.value.trim();
        if (!text) return;
        if (!state.activeSeriesId) {
            alert('Please add or select a series first.');
            return;
        }

        const lines = text.split(/\r?\n/);
        if (lines.length > POINT_LIMITS.maxImportLines) {
            alert(`Import is limited to ${POINT_LIMITS.maxImportLines.toLocaleString()} pasted lines.`);
            return;
        }

        const series = getSeries(state.activeSeriesId);
        const remainingSeriesCapacity = POINT_LIMITS.maxPointsPerSeries - (series?.points.length || 0);
        const maxBatchPoints = Math.min(POINT_LIMITS.maxImportPointsPerBatch, remainingSeriesCapacity);
        if (maxBatchPoints <= 0) {
            alert(`The active series already has the maximum of ${POINT_LIMITS.maxPointsPerSeries.toLocaleString()} points.`);
            return;
        }

        let importedCount = 0;
        let stoppedAtCap = false;

        for (const line of lines) {
            const pair = parseDataPairLine(line);
            if (!pair) continue;
            if (importedCount >= maxBatchPoints) {
                stoppedAtCap = true;
                break;
            }
            if (addDataPointToActive(pair.x, pair.y)) {
                importedCount++;
            } else {
                stoppedAtCap = true;
                break;
            }
        }

        if (importedCount > 0) {
            draw();
            updateResultsUI();
            textArea.value = '';
            if (stoppedAtCap) {
                alert(`Imported ${importedCount.toLocaleString()} points. Import stopped at the configured point limit.`);
            }
        } else {
            alert('Could not parse valid x,y pairs from the input.');
        }
    });
}

function parseDataPairLine(line) {
    const trimmed = line.replace(/^\uFEFF/, '').trim();
    if (!trimmed || trimmed.startsWith('#')) return null;

    const hasComma = trimmed.includes(',');
    const hasTab = trimmed.includes('\t');
    if (hasComma === hasTab) return null;

    const parts = trimmed.split(hasComma ? ',' : '\t').map(part => part.trim());
    if (parts.length !== 2 || parts.some(part => part === '')) return null;

    const x = parseScientificNumber(parts[0]);
    const y = parseScientificNumber(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return { x, y };
}

function setupExportUtilities() {
    document.getElementById('copyResultsBtn').addEventListener('click', async () => {
        const text = buildResultsText();
        if (!text) {
            alert('No results to copy.');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            alert('Results copied.');
        } catch (error) {
            downloadTextFile(`${exportStem()}_results.txt`, text, 'text/plain;charset=utf-8');
        }
    });

    document.getElementById('exportResultsBtn').addEventListener('click', () => {
        downloadTextFile(`${exportStem()}_results.csv`, buildResultsCsv(), 'text/csv;charset=utf-8');
    });

    document.getElementById('downloadAnnotatedBtn').addEventListener('click', async () => {
        const blob = await canvasToPngBlob();
        if (!blob) {
            alert('Annotated image could not be created.');
            return;
        }
        downloadBlob(`${exportStem()}_annotated.png`, blob);
    });
}

function buildResultsText() {
    const calibrationStatus = getCalibrationStatus();
    const lines = [
        'Visual Integration Results',
        `Calibration: ${calibrationStatus.valid ? 'valid' : `invalid - ${calibrationStatus.issues.join('; ')}`}`,
        `Baseline: ${state.calibration.baselineVal}`
    ];

    for (const series of state.seriesList) {
        lines.push(`${series.name}: AUC ${formatNumber(calculateAUC(series))}`);
    }

    return lines.join('\n');
}

function buildResultsCsv() {
    const calibrationStatus = getCalibrationStatus();
    const rows = [
        ['row_type', 'series', 'color', 'source', 'point_index', 'x', 'y', 'auc', 'baseline', 'calibration_status']
    ];

    for (const series of state.seriesList) {
        const auc = calibrationStatus.valid ? calculateAUC(series) : '';
        rows.push(['summary', series.name, series.color, '', '', '', '', auc, state.calibration.baselineVal, calibrationStatus.valid ? 'valid' : calibrationStatus.issues.join('; ')]);

        if (calibrationStatus.valid) {
            const points = getRenderablePoints(series);
            points.forEach((item, index) => {
                rows.push(['point', series.name, series.color, item.point.source || 'data', index + 1, item.data.x, item.data.y, '', '', 'valid']);
            });
        }
    }

    return rows.map(row => row.map(escapeCsv).join(',')).join('\n');
}

function escapeCsv(value) {
    const raw = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function exportStem() {
    return 'visual_integration';
}

function downloadTextFile(filename, text, type) {
    downloadBlob(filename, new Blob([text], { type }));
}

function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function hslToHex(hsl) {
    if (hsl.startsWith('#')) return hsl;
    const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!match) return '#000000';

    const h = Number.parseInt(match[1], 10);
    const s = Number.parseInt(match[2], 10) / 100;
    const l = Number.parseInt(match[3], 10) / 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;

    if (0 <= h && h < 60) {
        r = c;
        g = x;
    } else if (60 <= h && h < 120) {
        r = x;
        g = c;
    } else if (120 <= h && h < 180) {
        g = c;
        b = x;
    } else if (180 <= h && h < 240) {
        g = x;
        b = c;
    } else if (240 <= h && h < 300) {
        r = x;
        b = c;
    } else if (300 <= h && h < 360) {
        r = c;
        b = x;
    }

    const red = Math.round((r + m) * 255).toString(16).padStart(2, '0');
    const green = Math.round((g + m) * 255).toString(16).padStart(2, '0');
    const blue = Math.round((b + m) * 255).toString(16).padStart(2, '0');

    return `#${red}${green}${blue}`;
}
