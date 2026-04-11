/**
 * Visual Integration Tool - State Management
 */

export const POINT_SOURCE = Object.freeze({
    DATA: 'data',
    VISUAL: 'visual'
});

export const POINT_LIMITS = Object.freeze({
    maxPointsPerSeries: 25000,
    maxImportLines: 50000,
    maxImportPointsPerBatch: 10000
});

export const state = {
    calibration: {
        xMinVal: 0,
        xMaxVal: 10,
        yMinVal: -5,
        yMaxVal: 10,
        baselineVal: 0,

        // Calibration anchors are normalized 0..1 positions within the active image or canvas.
        xMinNorm: null,
        xMaxNorm: null,
        yMinNorm: null,
        yMaxNorm: null
    },
    seriesList: [],
    activeSeriesId: null,
    settings: {
        showGrid: true,
        showAuc: true
    },
    activeTool: 'add-point',
    draggedPoint: null,
    backgroundImage: null,
    originalImage: null,
    roiDraft: null,
    pdfDoc: null,
    viewport: {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        drawWidth: 0,
        drawHeight: 0
    }
};

const NUMERIC_CALIBRATION_KEYS = new Set([
    'xMinVal',
    'xMaxVal',
    'yMinVal',
    'yMaxVal',
    'baselineVal'
]);

function getRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 50%)`;
}

function generateId() {
    return Math.random().toString(36).slice(2, 11);
}

export function createDataPoint(x, y) {
    return {
        source: POINT_SOURCE.DATA,
        x,
        y
    };
}

export function createVisualPoint(nX, nY) {
    return {
        source: POINT_SOURCE.VISUAL,
        nX,
        nY
    };
}

export function isVisualPoint(point) {
    return Boolean(point && (
        point.source === POINT_SOURCE.VISUAL ||
        (Number.isFinite(point.nX) && Number.isFinite(point.nY))
    ));
}

export function parseScientificNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;

    const normalized = String(value ?? '')
        .trim()
        .replace(/,/g, '')
        .replace(/\s+/g, '')
        .replace(/\u00d7/g, 'x');
    if (!normalized) return NaN;

    const powerMatch = normalized.match(/^10\^([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i);
    if (powerMatch) {
        return Math.pow(10, Number(powerMatch[1]));
    }

    const coefficientPowerMatch = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:x|\*)10\^([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i);
    if (coefficientPowerMatch) {
        return Number(coefficientPowerMatch[1]) * Math.pow(10, Number(coefficientPowerMatch[2]));
    }

    return Number(normalized);
}

export function initSeries() {
    if (state.seriesList.length === 0) {
        addSeries('Series 1');
    }
}

export function loadExampleData() {
    state.seriesList = [];

    Object.assign(state.calibration, {
        xMinVal: 0,
        xMaxVal: 10,
        yMinVal: -2,
        yMaxVal: 12,
        baselineVal: 0
    });
    clearCalibrationAnchors();

    const s1Id = addSeries('y = x^2 / 10');
    const s1 = getSeries(s1Id);
    s1.color = '#3b82f6';
    for (let x = 0; x <= 10; x += 0.5) {
        s1.points.push(createDataPoint(x, (x * x) / 10));
    }

    const s2Id = addSeries('y = 5sin(x) + 5');
    const s2 = getSeries(s2Id);
    s2.color = '#ef4444';
    for (let x = 0; x <= 10; x += 0.5) {
        s2.points.push(createDataPoint(x, 5 * Math.sin(x) + 5));
    }

    state.backgroundImage = null;
    state.originalImage = null;
    state.pdfDoc = null;
    state.roiDraft = null;
    state.activeTool = 'add-point';
}

export function addSeries(name) {
    const id = generateId();
    const newSeries = {
        id,
        name: name || `Series ${state.seriesList.length + 1}`,
        color: getRandomColor(),
        points: []
    };
    state.seriesList.push(newSeries);
    state.activeSeriesId = id;
    return id;
}

export function getSeries(id) {
    return state.seriesList.find(series => series.id === id);
}

export function getActiveSeries() {
    return getSeries(state.activeSeriesId);
}

export function deleteSeries(id) {
    state.seriesList = state.seriesList.filter(series => series.id !== id);
    if (state.activeSeriesId === id) {
        state.activeSeriesId = state.seriesList.length > 0 ? state.seriesList[0].id : null;
    }
}

export function addDataPointToActive(x, y) {
    const series = getActiveSeries();
    if (!series || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (series.points.length >= POINT_LIMITS.maxPointsPerSeries) return false;
    series.points.push(createDataPoint(x, y));
    return true;
}

export function addVisualPointToActive(nX, nY) {
    const series = getActiveSeries();
    if (!series || !Number.isFinite(nX) || !Number.isFinite(nY)) return false;
    if (series.points.length >= POINT_LIMITS.maxPointsPerSeries) return false;
    series.points.push(createVisualPoint(nX, nY));
    return true;
}

export function clearActiveSeriesPoints() {
    const series = getActiveSeries();
    if (series) series.points = [];
}

export function clearCalibrationAnchors() {
    state.calibration.xMinNorm = null;
    state.calibration.xMaxNorm = null;
    state.calibration.yMinNorm = null;
    state.calibration.yMaxNorm = null;
}

export function clearImageDependentMeasurements() {
    clearCalibrationAnchors();
    let removedCount = 0;

    for (const series of state.seriesList) {
        const before = series.points.length;
        series.points = series.points.filter(point => !isVisualPoint(point));
        removedCount += before - series.points.length;
    }

    state.draggedPoint = null;
    state.roiDraft = null;
    return removedCount;
}

export function updateCalibration(key, value) {
    if (!NUMERIC_CALIBRATION_KEYS.has(key)) return false;
    const parsed = parseScientificNumber(value);
    if (!Number.isFinite(parsed)) return false;
    state.calibration[key] = parsed;
    return true;
}

export function updateSetting(key, value) {
    if (key in state.settings) state.settings[key] = value;
}
