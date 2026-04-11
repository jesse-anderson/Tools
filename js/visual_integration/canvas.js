/**
 * Visual Integration Tool - Canvas Rendering
 */
import { state } from './state.js';
import { dataToScreen, getCalibrationStatus, getRenderablePoints, normToScreen, imageToScreen } from './math.js';

let canvas, ctx;
let dpr = 1;

export function initCanvas(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

export function resizeCanvas() {
    if (!canvas) return;
    
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    ctx.scale(dpr, dpr);
    
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    updateViewport(rect.width, rect.height);
    draw();
}

function updateViewport(cssWidth, cssHeight) {
    const vp = state.viewport;
    if (state.backgroundImage) {
        const img = state.backgroundImage;
        const scale = Math.min(cssWidth / img.width, cssHeight / img.height);
        vp.scale = scale;
        vp.drawWidth = img.width * scale;
        vp.drawHeight = img.height * scale;
        vp.offsetX = (cssWidth - vp.drawWidth) / 2;
        vp.offsetY = (cssHeight - vp.drawHeight) / 2;
    } else {
        // No image: viewport covers entire canvas
        vp.scale = 1;
        vp.drawWidth = cssWidth;
        vp.drawHeight = cssHeight;
        vp.offsetX = 0;
        vp.offsetY = 0;
    }
}

export function draw() {
    if (!ctx || !canvas) return;

    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.clearRect(0, 0, width, height);
    
    // Draw checkerboard for letterbox areas if image is loaded
    if (state.backgroundImage) {
        ctx.fillStyle = '#111'; // Dark background
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(state.backgroundImage, state.viewport.offsetX, state.viewport.offsetY, state.viewport.drawWidth, state.viewport.drawHeight);
    }

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const axisColor = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';
    const textColor = isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
    const engineeringColor = getCssColor('--accent-engineering', '#f59e0b');
    const itColor = getCssColor('--accent-it', '#06b6d4');
    const calibrationStatus = getCalibrationStatus();

    // Clip to viewport to prevent drawing outside the image area
    ctx.save();
    ctx.beginPath();
    ctx.rect(state.viewport.offsetX, state.viewport.offsetY, state.viewport.drawWidth, state.viewport.drawHeight);
    ctx.clip();

    if (calibrationStatus.valid && state.settings.showGrid) {
        drawGrid(gridColor, axisColor, textColor);
    }

    if (calibrationStatus.valid) {
        drawBaseline(axisColor);
    }

    // Draw AUC and Series
    if (calibrationStatus.valid) {
        for (const series of state.seriesList) {
            const renderablePoints = getRenderablePoints(series);
            if (renderablePoints.length === 0) continue;

            if (state.settings.showAuc && renderablePoints.length >= 2) {
                drawAUC(series, renderablePoints);
            }
        
            drawSeriesLines(series, renderablePoints);
            drawSeriesPoints(series, renderablePoints);
        }
    } else {
        drawCalibrationWarning(calibrationStatus.issues, engineeringColor);
    }
    
    // Draw Calibration anchors if defined
    drawCalibrationAnchors(engineeringColor, itColor);
    drawRoiDraft(engineeringColor);

    ctx.restore();
}

export function canvasToPngBlob() {
    if (!canvas) return Promise.resolve(null);
    draw();
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function formatAxisNumber(num) {
    if (num === 0) return "0";
    const abs = Math.abs(num);
    if (abs >= 1000 || abs < 0.001) {
        // e.g. 1.2e+3 -> 1.2E3
        return num.toExponential(2).replace(/\.?0+e/, 'e').replace('e+', 'E').replace('e-', 'E-');
    }
    return Number(num.toFixed(2)).toString();
}

function drawGrid(gridColor, axisColor, textColor) {
    const cal = state.calibration;
    ctx.font = '10px "JetBrains Mono"';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const xSteps = 10;
    for (let i = 0; i <= xSteps; i++) {
        const dataX = cal.xMinVal + (cal.xMaxVal - cal.xMinVal) * (i / xSteps);
        const p = dataToScreen(dataX, 0);
        
        ctx.beginPath();
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.moveTo(p.x, state.viewport.offsetY);
        ctx.lineTo(p.x, state.viewport.offsetY + state.viewport.drawHeight);
        ctx.stroke();

        if (i > 0 && i < xSteps) {
            ctx.fillText(formatAxisNumber(dataX), p.x, state.viewport.offsetY + state.viewport.drawHeight - 15);
        }
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const ySteps = 10;
    for (let i = 0; i <= ySteps; i++) {
        const dataY = cal.yMinVal + (cal.yMaxVal - cal.yMinVal) * (i / ySteps);
        const p = dataToScreen(0, dataY);
        
        ctx.beginPath();
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.moveTo(state.viewport.offsetX, p.y);
        ctx.lineTo(state.viewport.offsetX + state.viewport.drawWidth, p.y);
        ctx.stroke();

        if (i > 0 && i < ySteps) {
            ctx.fillText(formatAxisNumber(dataY), state.viewport.offsetX + 35, p.y);
        }
    }
}

function drawBaseline(axisColor) {
    const p = dataToScreen(0, state.calibration.baselineVal);
    
    ctx.beginPath();
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.moveTo(state.viewport.offsetX, p.y);
    ctx.lineTo(state.viewport.offsetX + state.viewport.drawWidth, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawAUC(series, renderablePoints) {
    const baseline = state.calibration.baselineVal;
    
    ctx.beginPath();
    const firstBase = dataToScreen(renderablePoints[0].data.x, baseline);
    ctx.moveTo(firstBase.x, firstBase.y);

    for (const item of renderablePoints) {
        ctx.lineTo(item.screen.x, item.screen.y);
    }

    const lastBase = dataToScreen(renderablePoints[renderablePoints.length - 1].data.x, baseline);
    ctx.lineTo(lastBase.x, lastBase.y);
    
    ctx.closePath();
    ctx.fillStyle = getRgbaFromHslOrHex(series.color, 0.2);
    ctx.fill();
}

function drawSeriesLines(series, renderablePoints) {
    ctx.beginPath();
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 2;
    
    for (let i = 0; i < renderablePoints.length; i++) {
        const p = renderablePoints[i].screen;
        if (i === 0) {
            ctx.moveTo(p.x, p.y);
        } else {
            ctx.lineTo(p.x, p.y);
        }
    }
    ctx.stroke();
}

function drawSeriesPoints(series, renderablePoints) {
    const isActive = series.id === state.activeSeriesId;
    
    ctx.fillStyle = series.color;
    for (const item of renderablePoints) {
        const p = item.screen;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isActive ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
        
        if (isActive) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}

function drawCalibrationAnchors(engineeringColor, itColor) {
    const drawAnchor = (nX, nY, color, label) => {
        if (nX === null || nY === null) return;
        const p = normToScreen(nX, nY);
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        // Draw crosshair
        ctx.moveTo(p.x - 10, p.y); ctx.lineTo(p.x + 10, p.y);
        ctx.moveTo(p.x, p.y - 10); ctx.lineTo(p.x, p.y + 10);
        ctx.stroke();
        
        ctx.fillStyle = color;
        ctx.font = '12px "JetBrains Mono"';
        ctx.fillText(label, p.x + 12, p.y - 12);
    };

    const c = state.calibration;
    // We visually represent the min/max defining lines if they exist
    if (c.xMinNorm !== null) drawAnchor(c.xMinNorm.x, c.xMinNorm.y, engineeringColor, 'X Min');
    if (c.xMaxNorm !== null) drawAnchor(c.xMaxNorm.x, c.xMaxNorm.y, engineeringColor, 'X Max');
    if (c.yMinNorm !== null) drawAnchor(c.yMinNorm.x, c.yMinNorm.y, itColor, 'Y Min');
    if (c.yMaxNorm !== null) drawAnchor(c.yMaxNorm.x, c.yMaxNorm.y, itColor, 'Y Max');
}

function drawRoiDraft(color) {
    if (!state.roiDraft) return;

    const start = imageToScreen(state.roiDraft.start.x, state.roiDraft.start.y);
    const end = imageToScreen(state.roiDraft.end.x, state.roiDraft.end.y);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    ctx.save();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
}

function drawCalibrationWarning(issues, color) {
    const vp = state.viewport;
    const message = issues[0] || 'Calibration is invalid.';
    const x = vp.offsetX + 16;
    const y = vp.offsetY + 16;
    const width = Math.min(440, Math.max(220, vp.drawWidth - 32));

    ctx.save();
    ctx.fillStyle = 'rgba(17, 17, 17, 0.82)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, width, 56);
    ctx.strokeRect(x, y, width, 56);
    ctx.fillStyle = '#fff';
    ctx.font = '12px "JetBrains Mono"';
    ctx.textBaseline = 'top';
    ctx.fillText('Invalid calibration', x + 12, y + 10);
    ctx.fillText(message.slice(0, 54), x + 12, y + 30);
    ctx.restore();
}

function getCssColor(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

function getRgbaFromHslOrHex(colorStr, alpha) {
    if (colorStr.startsWith('hsl')) return colorStr.replace('hsl', 'hsla').replace(')', `, ${alpha})`);
    if (colorStr.startsWith('#')) {
        let r = parseInt(colorStr.slice(1, 3), 16),
            g = parseInt(colorStr.slice(3, 5), 16),
            b = parseInt(colorStr.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return colorStr;
}
