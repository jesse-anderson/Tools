const COLORS = {
    setpoint: "#f59e0b",
    pv: "#38bdf8",
    measurement: "#a78bfa",
    output: "#22c55e",
    raw: "#ef4444",
    disturbance: "#94a3b8",
    sensitivity: "#f472b6",
    crossover: "#facc15",
    annotation: "#5eead4",
    grid: "rgba(148, 163, 184, 0.22)",
    text: "#a1a1aa"
};

export function renderProcessChart(canvas, result, axes = {}) {
    renderChart(canvas, result.series, [
        { key: "setpoint", label: "SP", color: COLORS.setpoint, width: 2, dash: [6, 5] },
        { key: "pv", label: "PV", color: COLORS.pv, width: 2.5 },
        { key: "measurement", label: "Meas", color: COLORS.measurement, width: 1.2, alpha: 0.75 }
    ], {
        yLabel: axes.pvAxis || "Process variable",
        xLabel: "Time, s"
    });
}

export function renderOutputChart(canvas, result, axes = {}) {
    renderChart(canvas, result.series, [
        { key: "output", label: "Output", color: COLORS.output, width: 2.3 },
        { key: "output_raw", label: "Raw", color: COLORS.raw, width: 1.4, dash: [4, 4] },
        { key: "disturbance", label: "Load", color: COLORS.disturbance, width: 1.2, dash: [8, 5] }
    ], {
        showSaturation: true,
        yLabel: axes.outputAxis || "Controller output / load",
        xLabel: "Time, s"
    });
}

export function renderBodeMagnitudeChart(canvas, result, plantHints = {}) {
    const samples = result.frequency_response.samples;
    const margins = result.frequency_response.margins;
    const annotations = [];
    if (plantHints.tau && plantHints.tau > 0) {
        annotations.push({
            omega: 1 / plantHints.tau,
            color: COLORS.annotation,
            label: "1/tau"
        });
    }
    renderLogChart(canvas, samples, [
        { key: "magnitude_db", label: "|L|", color: COLORS.pv, width: 2.2 },
        { key: "sensitivity_db", label: "|S|", color: COLORS.sensitivity, width: 1.4, dash: [4, 4] }
    ], {
        yLabel: "Magnitude, dB",
        xLabel: "Frequency, rad/s",
        markerY: 0,
        markerLabel: "0 dB",
        crossoverOmega: margins.gain_crossover_omega,
        crossoverLabel: formatOmegaLabel("wgc", margins.gain_crossover_omega),
        annotations
    });
}

export function renderBodePhaseChart(canvas, result, plantHints = {}) {
    const samples = result.frequency_response.samples;
    const margins = result.frequency_response.margins;
    const annotations = [];
    if (plantHints.deadTime && plantHints.deadTime > 0) {
        // At omega = pi / (2 theta) the dead-time contribution alone gives -90 deg phase.
        annotations.push({
            omega: Math.PI / (2 * plantHints.deadTime),
            color: COLORS.annotation,
            label: "theta phase"
        });
    }
    renderLogChart(canvas, samples, [
        { key: "phase_deg", label: "angle L", color: COLORS.output, width: 2.2 }
    ], {
        yLabel: "Phase, deg",
        xLabel: "Frequency, rad/s",
        markerY: -180,
        markerLabel: "-180 deg",
        crossoverOmega: margins.gain_crossover_omega,
        crossoverLabel: formatOmegaLabel("wgc", margins.gain_crossover_omega),
        secondaryCrossoverOmega: margins.phase_crossover_omega,
        secondaryCrossoverLabel: formatOmegaLabel("wpc", margins.phase_crossover_omega),
        annotations
    });
}

function formatOmegaLabel(prefix, omega) {
    if (omega === null || omega === undefined || !Number.isFinite(omega)) {
        return prefix;
    }
    let formatted;
    if (Math.abs(omega) >= 1000 || (Math.abs(omega) > 0 && Math.abs(omega) < 0.01)) {
        formatted = omega.toExponential(2);
    } else {
        formatted = Number.parseFloat(omega.toFixed(3)).toString();
    }
    return `${prefix} = ${formatted}`;
}

function renderChart(canvas, series, plotSeries, options = {}) {
    const ctx = resizeCanvas(canvas);
    const bounds = canvas.getBoundingClientRect();
    const width = bounds.width;
    const height = bounds.height;
    const pad = { left: 78, right: 18, top: 18, bottom: 46 };
    const chartWidth = Math.max(1, width - pad.left - pad.right);
    const chartHeight = Math.max(1, height - pad.top - pad.bottom);
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue("--bg-primary").trim() || "#0a0a0b";
    const text = css.getPropertyValue("--text-secondary").trim() || COLORS.text;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    if (!series || series.length < 2) {
        drawNoData(ctx, width, height, text);
        return;
    }

    const xMin = series[0].time;
    const xMax = series[series.length - 1].time;
    const values = [];
    plotSeries.forEach((plot) => {
        series.forEach((point) => values.push(point[plot.key]));
    });
    let yMin = Math.min(...values);
    let yMax = Math.max(...values);
    if (Math.abs(yMax - yMin) < 1e-9) {
        yMin -= 1;
        yMax += 1;
    }
    const padding = (yMax - yMin) * 0.08;
    yMin -= padding;
    yMax += padding;

    const xScale = (time) => pad.left + ((time - xMin) / (xMax - xMin || 1)) * chartWidth;
    const yScale = (value) => pad.top + (1 - (value - yMin) / (yMax - yMin || 1)) * chartHeight;

    if (options.showSaturation) {
        drawSaturationBands(ctx, series, xScale, pad.top, chartHeight);
    }

    drawGrid(ctx, pad, chartWidth, chartHeight, xMin, xMax, yMin, yMax, xScale, yScale, text, options);

    plotSeries.forEach((plot) => {
        ctx.save();
        ctx.globalAlpha = plot.alpha || 1;
        ctx.strokeStyle = plot.color;
        ctx.lineWidth = plot.width || 2;
        ctx.setLineDash(plot.dash || []);
        ctx.beginPath();
        series.forEach((point, index) => {
            const x = xScale(point.time);
            const y = yScale(point[plot.key]);
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        ctx.restore();
    });

    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, chartWidth, chartHeight);
}

function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.floor(rect.width * dpr));
    const targetHeight = Math.max(1, Math.floor(rect.height * dpr));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
}

function drawGrid(ctx, pad, chartWidth, chartHeight, xMin, xMax, yMin, yMax, xScale, yScale, textColor, options) {
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillStyle = textColor;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    for (let i = 0; i <= 5; i += 1) {
        const xValue = xMin + ((xMax - xMin) * i) / 5;
        const x = xScale(xValue);
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + chartHeight);
        ctx.stroke();
        ctx.fillText(formatAxis(xValue), x - 12, pad.top + chartHeight + 22);
    }

    for (let i = 0; i <= 4; i += 1) {
        const yValue = yMin + ((yMax - yMin) * i) / 4;
        const y = yScale(yValue);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + chartWidth, y);
        ctx.stroke();
        ctx.fillText(formatAxis(yValue), 30, y + 4);
    }

    ctx.fillText(options.xLabel || "Time, s", pad.left + chartWidth - 44, pad.top + chartHeight + 36);

    if (options.yLabel) {
        ctx.save();
        ctx.translate(14, pad.top + chartHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText(options.yLabel, 0, 0);
        ctx.restore();
        ctx.textAlign = "start";
    }
}

function drawSaturationBands(ctx, series, xScale, top, height) {
    ctx.save();
    ctx.fillStyle = "rgba(239, 68, 68, 0.12)";
    let bandStart = null;

    series.forEach((point, index) => {
        if (point.saturated && bandStart === null) {
            bandStart = point.time;
        }
        if ((!point.saturated || index === series.length - 1) && bandStart !== null) {
            const endTime = point.saturated ? point.time : series[Math.max(0, index - 1)].time;
            const x0 = xScale(bandStart);
            const x1 = xScale(endTime);
            ctx.fillRect(x0, top, Math.max(1, x1 - x0), height);
            bandStart = null;
        }
    });

    ctx.restore();
}

function drawNoData(ctx, width, height, textColor) {
    ctx.fillStyle = textColor;
    ctx.font = "13px Space Grotesk, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No simulation data", width / 2, height / 2);
    ctx.textAlign = "start";
}

function formatAxis(value) {
    if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) {
        return value.toExponential(1);
    }
    return Number.parseFloat(value.toFixed(2)).toString();
}

function renderLogChart(canvas, samples, plotSeries, options = {}) {
    const ctx = resizeCanvas(canvas);
    const bounds = canvas.getBoundingClientRect();
    const width = bounds.width;
    const height = bounds.height;
    const pad = { left: 78, right: 18, top: 18, bottom: 46 };
    const chartWidth = Math.max(1, width - pad.left - pad.right);
    const chartHeight = Math.max(1, height - pad.top - pad.bottom);
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue("--bg-primary").trim() || "#0a0a0b";
    const text = css.getPropertyValue("--text-secondary").trim() || COLORS.text;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    if (!samples || samples.length < 2) {
        drawNoData(ctx, width, height, text);
        return;
    }

    const logXMin = Math.log10(samples[0].omega);
    const logXMax = Math.log10(samples[samples.length - 1].omega);
    const values = [];
    plotSeries.forEach((plot) => {
        samples.forEach((point) => {
            const v = point[plot.key];
            if (Number.isFinite(v)) {
                values.push(v);
            }
        });
    });

    let yMin = Math.min(...values);
    let yMax = Math.max(...values);
    if (typeof options.markerY === "number") {
        yMin = Math.min(yMin, options.markerY);
        yMax = Math.max(yMax, options.markerY);
    }
    if (Math.abs(yMax - yMin) < 1e-9) {
        yMin -= 1;
        yMax += 1;
    }
    const padding = (yMax - yMin) * 0.10;
    yMin -= padding;
    yMax += padding;

    const xScale = (omega) =>
        pad.left + ((Math.log10(omega) - logXMin) / (logXMax - logXMin || 1)) * chartWidth;
    const yScale = (value) => pad.top + (1 - (value - yMin) / (yMax - yMin || 1)) * chartHeight;

    drawLogGrid(ctx, pad, chartWidth, chartHeight, logXMin, logXMax, yMin, yMax, xScale, yScale, text, options);

    if (typeof options.markerY === "number") {
        ctx.save();
        ctx.strokeStyle = "rgba(248, 113, 113, 0.55)";
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1;
        const yMarker = yScale(options.markerY);
        ctx.beginPath();
        ctx.moveTo(pad.left, yMarker);
        ctx.lineTo(pad.left + chartWidth, yMarker);
        ctx.stroke();
        if (options.markerLabel) {
            ctx.fillStyle = "rgba(248, 113, 113, 0.85)";
            ctx.font = "10px JetBrains Mono, monospace";
            ctx.fillText(options.markerLabel, pad.left + chartWidth - 50, yMarker - 4);
        }
        ctx.restore();
    }

    if (Array.isArray(options.annotations)) {
        options.annotations.forEach((annotation) => {
            if (!annotation || !Number.isFinite(annotation.omega)) {
                return;
            }
            const lg = Math.log10(annotation.omega);
            if (lg < logXMin || lg > logXMax) {
                return;
            }
            drawVerticalMarker(
                ctx,
                pad,
                chartHeight,
                xScale(annotation.omega),
                annotation.color || COLORS.annotation,
                annotation.label || "",
                { dash: [2, 4], labelOffsetY: 24 }
            );
        });
    }

    if (options.crossoverOmega !== null && options.crossoverOmega !== undefined && Number.isFinite(options.crossoverOmega)) {
        drawVerticalMarker(
            ctx,
            pad,
            chartHeight,
            xScale(options.crossoverOmega),
            COLORS.crossover,
            options.crossoverLabel || "wgc"
        );
    }
    if (options.secondaryCrossoverOmega !== null && options.secondaryCrossoverOmega !== undefined && Number.isFinite(options.secondaryCrossoverOmega)) {
        drawVerticalMarker(
            ctx,
            pad,
            chartHeight,
            xScale(options.secondaryCrossoverOmega),
            COLORS.disturbance,
            options.secondaryCrossoverLabel || "wpc",
            { labelOffsetY: 38 }
        );
    }

    plotSeries.forEach((plot) => {
        ctx.save();
        ctx.globalAlpha = plot.alpha || 1;
        ctx.strokeStyle = plot.color;
        ctx.lineWidth = plot.width || 2;
        ctx.setLineDash(plot.dash || []);
        ctx.beginPath();
        samples.forEach((point, index) => {
            const x = xScale(point.omega);
            const y = yScale(point[plot.key]);
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        ctx.restore();
    });

    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, chartWidth, chartHeight);
}

function drawLogGrid(ctx, pad, chartWidth, chartHeight, logXMin, logXMax, yMin, yMax, xScale, yScale, textColor, options) {
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillStyle = textColor;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    const firstDecade = Math.ceil(logXMin);
    const lastDecade = Math.floor(logXMax);
    for (let decade = firstDecade; decade <= lastDecade; decade += 1) {
        const omega = 10 ** decade;
        const x = xScale(omega);
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + chartHeight);
        ctx.stroke();
        ctx.fillText(`1e${decade}`, x - 14, pad.top + chartHeight + 22);
    }
    for (let decade = firstDecade - 1; decade <= lastDecade; decade += 1) {
        for (let minor = 2; minor <= 9; minor += 1) {
            const omega = minor * 10 ** decade;
            const lg = Math.log10(omega);
            if (lg < logXMin || lg > logXMax) {
                continue;
            }
            const x = xScale(omega);
            ctx.beginPath();
            ctx.globalAlpha = 0.35;
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, pad.top + chartHeight);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    for (let i = 0; i <= 4; i += 1) {
        const yValue = yMin + ((yMax - yMin) * i) / 4;
        const y = yScale(yValue);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + chartWidth, y);
        ctx.stroke();
        ctx.fillText(formatAxis(yValue), 30, y + 4);
    }

    ctx.fillText(options.xLabel || "Frequency, rad/s", pad.left + chartWidth - 84, pad.top + chartHeight + 36);

    if (options.yLabel) {
        ctx.save();
        ctx.translate(14, pad.top + chartHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText(options.yLabel, 0, 0);
        ctx.restore();
        ctx.textAlign = "start";
    }
}

function drawVerticalMarker(ctx, pad, chartHeight, x, color, label, options = {}) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.setLineDash(options.dash || [5, 4]);
    ctx.lineWidth = options.lineWidth || 1.2;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + chartHeight);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.setLineDash([]);
    ctx.font = "10px JetBrains Mono, monospace";
    const offsetY = options.labelOffsetY || 12;
    ctx.fillText(label, x + 4, pad.top + offsetY);
    ctx.restore();
}
