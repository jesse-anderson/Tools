/**
 * Visual Integration Tool - Math and Coordinate Logic
 */
import { state, isVisualPoint } from './state.js';

const EPSILON = 1e-6;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function isFinitePoint(point) {
    return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function getCalibrationMetrics() {
    const cal = state.calibration;

    const xMinPx = cal.xMinNorm !== null ? cal.xMinNorm.x : 0;
    const xMaxPx = cal.xMaxNorm !== null ? cal.xMaxNorm.x : 1;
    const yMinPx = cal.yMinNorm !== null ? cal.yMinNorm.y : 1;
    const yMaxPx = cal.yMaxNorm !== null ? cal.yMaxNorm.y : 0;

    const xPxRange = xMaxPx - xMinPx;
    const yPxRange = yMaxPx - yMinPx;
    const xValRange = cal.xMaxVal - cal.xMinVal;
    const yValRange = cal.yMaxVal - cal.yMinVal;

    return {
        xMinPx,
        xMaxPx,
        yMinPx,
        yMaxPx,
        xPxRange,
        yPxRange,
        xValRange,
        yValRange
    };
}

export function getCalibrationStatus() {
    const metrics = getCalibrationMetrics();
    const issues = [];

    if (!Number.isFinite(state.calibration.xMinVal) || !Number.isFinite(state.calibration.xMaxVal)) {
        issues.push('X calibration values must be finite numbers.');
    }
    if (!Number.isFinite(state.calibration.yMinVal) || !Number.isFinite(state.calibration.yMaxVal)) {
        issues.push('Y calibration values must be finite numbers.');
    }
    if (!Number.isFinite(state.calibration.baselineVal)) {
        issues.push('Baseline must be a finite number.');
    }
    if (Math.abs(metrics.xValRange) <= EPSILON) {
        issues.push('X Min and X Max must be different.');
    }
    if (Math.abs(metrics.yValRange) <= EPSILON) {
        issues.push('Y Min and Y Max must be different.');
    }
    if (Math.abs(metrics.xPxRange) <= EPSILON) {
        issues.push('X calibration anchors must not overlap horizontally.');
    }
    if (Math.abs(metrics.yPxRange) <= EPSILON) {
        issues.push('Y calibration anchors must not overlap vertically.');
    }

    return {
        valid: issues.length === 0,
        issues
    };
}

export function normToData(nX, nY) {
    const cal = state.calibration;
    const metrics = getCalibrationMetrics();

    let dataX = cal.xMinVal;
    if (Math.abs(metrics.xPxRange) > EPSILON) {
        dataX = cal.xMinVal + ((nX - metrics.xMinPx) / metrics.xPxRange) * metrics.xValRange;
    }

    let dataY = cal.yMinVal;
    if (Math.abs(metrics.yPxRange) > EPSILON) {
        dataY = cal.yMinVal + ((nY - metrics.yMinPx) / metrics.yPxRange) * metrics.yValRange;
    }

    return { x: dataX, y: dataY };
}

export function dataToNorm(dataX, dataY) {
    const cal = state.calibration;
    const metrics = getCalibrationMetrics();

    let nX = 0;
    if (Math.abs(metrics.xValRange) > EPSILON) {
        nX = metrics.xMinPx + ((dataX - cal.xMinVal) / metrics.xValRange) * metrics.xPxRange;
    }

    let nY = 1;
    if (Math.abs(metrics.yValRange) > EPSILON) {
        nY = metrics.yMinPx + ((dataY - cal.yMinVal) / metrics.yValRange) * metrics.yPxRange;
    }

    return { x: nX, y: nY };
}

export function isInsideViewport(pxX, pxY) {
    const vp = state.viewport;
    return (
        vp.drawWidth > 0 &&
        vp.drawHeight > 0 &&
        pxX >= vp.offsetX &&
        pxX <= vp.offsetX + vp.drawWidth &&
        pxY >= vp.offsetY &&
        pxY <= vp.offsetY + vp.drawHeight
    );
}

export function screenToNorm(pxX, pxY) {
    const vp = state.viewport;
    if (vp.drawWidth === 0 || vp.drawHeight === 0) return { x: 0, y: 0 };

    return {
        x: (pxX - vp.offsetX) / vp.drawWidth,
        y: (pxY - vp.offsetY) / vp.drawHeight
    };
}

export function screenToNormIfInside(pxX, pxY) {
    if (!isInsideViewport(pxX, pxY)) return null;
    return screenToNorm(pxX, pxY);
}

export function screenToNormClamped(pxX, pxY) {
    const norm = screenToNorm(pxX, pxY);
    return {
        x: clamp(norm.x, 0, 1),
        y: clamp(norm.y, 0, 1)
    };
}

export function normToScreen(nX, nY) {
    const vp = state.viewport;
    return {
        x: vp.offsetX + (nX * vp.drawWidth),
        y: vp.offsetY + (nY * vp.drawHeight)
    };
}

export function dataToScreen(dataX, dataY) {
    const norm = dataToNorm(dataX, dataY);
    return normToScreen(norm.x, norm.y);
}

export function screenToImage(pxX, pxY) {
    const vp = state.viewport;
    if (vp.scale === 0) return null;
    return {
        x: (pxX - vp.offsetX) / vp.scale,
        y: (pxY - vp.offsetY) / vp.scale
    };
}

export function screenToImageIfInside(pxX, pxY) {
    if (!state.backgroundImage || !isInsideViewport(pxX, pxY)) return null;
    return screenToImage(pxX, pxY);
}

export function screenToImageClamped(pxX, pxY) {
    if (!state.backgroundImage) return null;
    const point = screenToImage(pxX, pxY);
    return {
        x: clamp(point.x, 0, state.backgroundImage.width),
        y: clamp(point.y, 0, state.backgroundImage.height)
    };
}

export function imageToScreen(imgX, imgY) {
    const vp = state.viewport;
    return {
        x: vp.offsetX + (imgX * vp.scale),
        y: vp.offsetY + (imgY * vp.scale)
    };
}

export function cropCanvas(sourceCanvas, rect) {
    const canvas = document.createElement('canvas');
    canvas.width = rect.w;
    canvas.height = rect.h;
    canvas.getContext('2d').drawImage(sourceCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    return canvas;
}

export function normalizeRect(rect) {
    return {
        x: Math.min(rect.x1, rect.x2),
        y: Math.min(rect.y1, rect.y2),
        w: Math.abs(rect.x2 - rect.x1),
        h: Math.abs(rect.y2 - rect.y1)
    };
}

export function pointToNorm(point) {
    if (isVisualPoint(point)) {
        return { x: point.nX, y: point.nY };
    }
    return dataToNorm(point.x, point.y);
}

export function pointToData(point) {
    if (isVisualPoint(point)) {
        return normToData(point.nX, point.nY);
    }
    return { x: point.x, y: point.y };
}

export function pointToScreen(point) {
    const norm = pointToNorm(point);
    return normToScreen(norm.x, norm.y);
}

export function updatePointFromNorm(point, norm) {
    if (isVisualPoint(point)) {
        point.nX = norm.x;
        point.nY = norm.y;
        return;
    }

    const data = normToData(norm.x, norm.y);
    point.x = data.x;
    point.y = data.y;
}

export function getRenderablePoints(series) {
    if (!series || !Array.isArray(series.points)) return [];
    if (!getCalibrationStatus().valid) return [];

    return series.points
        .map((point, index) => ({
            point,
            index,
            data: pointToData(point),
            screen: pointToScreen(point)
        }))
        .filter(item => isFinitePoint(item.data) && isFinitePoint(item.screen))
        .sort((a, b) => a.data.x - b.data.x);
}

export function calculateAUC(series) {
    if (!getCalibrationStatus().valid) return null;
    const points = getRenderablePoints(series).map(item => item.data);
    if (points.length < 2) return 0;

    let area = 0;
    const baseline = state.calibration.baselineVal;
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const dx = p2.x - p1.x;
        const h1 = p1.y - baseline;
        const h2 = p2.y - baseline;
        area += ((h1 + h2) / 2) * dx;
    }
    return area;
}

export function findPointNearScreen(pxX, pxY, threshold = 10) {
    if (!getCalibrationStatus().valid) return null;
    for (const series of state.seriesList) {
        for (let i = 0; i < series.points.length; i++) {
            const point = series.points[i];
            const screenPoint = pointToScreen(point);
            const dx = screenPoint.x - pxX;
            const dy = screenPoint.y - pxY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= threshold) {
                return { seriesId: series.id, pointIndex: i };
            }
        }
    }
    return null;
}
