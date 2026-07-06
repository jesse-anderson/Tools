// DOM controller for the Oral Multi-Dose Simulator.
// Owns all UI wiring, rendering, and the plot; delegates every numeric step to
// the pure engine. Theme is handled by shared.js ThemeManager.

import { PRESETS } from './presets.js';
import {
    kaFromBucket, solveKaFromTmax, propagate, propagateSaturable, buildSchedule, buildBaselineSchedule,
    simulate, computeIntervalAUC, findIntervalExtrema,
    computeMetrics, computePercentileBands, runMonteCarlo, mulberry32
} from './oral-pk-engine.js';

function getTheme() { return document.documentElement.getAttribute('data-theme') || 'dark'; }

// ============================================
// STATE
// ============================================
let currentDoseForm = "IR";
let currentParamMode = "A";
let currentElimMode = "firstorder";
let scheduleEvents = [];
let simulationData = null;

// ============================================
// TIME FORMATTING HELPER
// ============================================
function formatTime(hours) {
    if (hours === null || hours === undefined || !isFinite(hours)) {
        return '-';
    }
    
    if (hours < 72) {
        return hours.toFixed(1) + ' hr';
    } else {
        const days = hours / 24;
        if (days < 7) {
            return hours.toFixed(0) + ' hr (' + days.toFixed(1) + ' days)';
        } else {
            const weeks = days / 7;
            return days.toFixed(1) + ' days (' + weeks.toFixed(1) + ' wk)';
        }
    }
}

function formatTimeShort(hours) {
    if (hours === null || hours === undefined || !isFinite(hours)) {
        return '-';
    }
    
    if (hours < 72) {
        return hours.toFixed(1) + ' hr';
    } else {
        const days = hours / 24;
        return days.toFixed(1) + ' d';
    }
}

// ============================================
// UI HELPERS
// ============================================
function setDoseForm(form) {
    currentDoseForm = form;
    document.querySelectorAll('.doseform-container .mode-card').forEach(c => c.classList.remove('active'));
    document.getElementById('card-' + form).classList.add('active');
    
    document.getElementById('delayedOptions').style.display = (form === 'Delayed') ? 'block' : 'none';
    document.getElementById('erOptions').style.display = (form === 'ER') ? 'block' : 'none';
}

function setParamMode(mode) {
    currentParamMode = mode;
    document.querySelectorAll('.mode-container .mode-card').forEach(c => c.classList.remove('active'));
    document.getElementById('card-mode' + mode).classList.add('active');
    
    document.getElementById('modeAInputs').style.display = (mode === 'A') ? 'block' : 'none';
    document.getElementById('modeBInputs').style.display = (mode === 'B') ? 'block' : 'none';
    document.getElementById('modeCInputs').style.display = (mode === 'C') ? 'block' : 'none';
}

function setElimMode(mode) {
    currentElimMode = mode;
    document.getElementById('elimMode').value = mode;
    document.getElementById('mmInputs').style.display = (mode === 'mm') ? 'block' : 'none';
    document.getElementById('zeroInputs').style.display = (mode === 'zero') ? 'block' : 'none';
}

function toggleCollapsible(id, header) {
    const content = document.getElementById(id);
    const isOpen = content.classList.toggle('open');
    header.classList.toggle('open', isOpen);
    header.setAttribute('aria-expanded', String(isOpen));
}

function toggleDropdown(id, header) {
    const content = document.getElementById(id);
    const isOpen = content.classList.toggle('open');
    if (header) header.setAttribute('aria-expanded', String(isOpen));
}

// ============================================
// PRESET LOADING
// ============================================
function loadPreset() {
    const presetKey = document.getElementById('presetSelect').value;
    const banner = document.getElementById('nonOralBanner');
    const presetInfo = document.getElementById('presetInfo');
    
    if (presetKey === 'custom') {
        banner.classList.remove('visible');
        presetInfo.innerHTML = '';
        return;
    }
    
    const preset = PRESETS[presetKey];
    if (!preset) return;
    
    // Show/hide non-oral banner (with a preset-specific message)
    if (!preset.isOral) {
        banner.textContent = preset.bannerText || 'NOT ORAL - shown for educational contrast only';
        banner.classList.add('visible');
    } else {
        banner.classList.remove('visible');
    }

    // Populate fields
    document.getElementById('dose').value = preset.dose;
    document.getElementById('tau').value = preset.tau;
    document.getElementById('numDoses').value = preset.numDoses || 3;
    document.getElementById('halfLife').value = preset.halfLife;
    document.getElementById('bioavailability').value = preset.bioavailability;
    document.getElementById('tLag').value = preset.tLag || 0;
    if (preset.tRel) document.getElementById('tRel').value = preset.tRel;

    // Set dose form
    setDoseForm(preset.doseForm);

    // Set param mode
    setParamMode(preset.paramMode);

    // Set elimination kinetics (first-order unless the preset is saturable)
    const elimMode = preset.elimMode || 'firstorder';
    setElimMode(elimMode);
    if (elimMode === 'mm') {
        if (preset.Vmax) document.getElementById('vmaxInput').value = preset.Vmax;
        if (preset.Km) document.getElementById('kmInput').value = preset.Km;
    } else if (elimMode === 'zero') {
        if (preset.k0) document.getElementById('k0Input').value = preset.k0;
    }

    // Mode-specific values
    if (preset.paramMode === 'B' && preset.tmax) {
        document.getElementById('tmax').value = preset.tmax;
    }
    if (preset.paramMode === 'C' && preset.ka) {
        document.getElementById('kaInput').value = preset.ka;
    }
    
    // Update uncertainty ranges if available
    if (preset.halfLifeRange) {
        document.getElementById('halfLifeMin').value = preset.halfLifeRange[0];
        document.getElementById('halfLifeMax').value = preset.halfLifeRange[1];
    }
    
    // Build info text
    let infoHtml = preset.notes;
    if (preset.refs && preset.refs.length > 0) {
        infoHtml += ' ';
        preset.refs.forEach(ref => {
            infoHtml += `<a href="${ref.url}" target="_blank" rel="noopener" class="preset-ref">[${ref.label}]</a> `;
        });
    }
    if (preset.analyteNote) {
        infoHtml = `<strong>${preset.analyteNote}.</strong> ` + infoHtml;
    }
    if (preset.healthWarning) {
        infoHtml += `<br><span style="color: var(--accent-error);">⚠️ ${preset.healthWarning}</span>`;
    }
    presetInfo.innerHTML = infoHtml;
}

// ============================================
// EVENT EDITOR
// ============================================
function addEvent() {
    const doseNum = parseInt(document.getElementById('eventDoseNum').value);
    const eventType = document.getElementById('eventType').value;
    const shift = parseFloat(document.getElementById('eventShift').value) || 0;
    const customDose = parseFloat(document.getElementById('eventCustomDose').value) || 0;
    
    if (doseNum < 1) return;
    
    // Check for duplicate
    const exists = scheduleEvents.find(e => e.doseNum === doseNum);
    if (exists) {
        showError(`Dose #${doseNum} already has a disruption. Remove it first.`);
        return;
    }
    clearError();
    
    const event = { doseNum, eventType, shift };
    if (eventType === 'custom') {
        event.customDose = customDose;
    }
    
    scheduleEvents.push(event);
    renderEventList();
}

function removeEvent(index) {
    scheduleEvents.splice(index, 1);
    renderEventList();
}

function renderEventList() {
    const list = document.getElementById('eventList');
    if (scheduleEvents.length === 0) {
        list.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.75rem; text-align: center;">No disruptions added</div>';
        return;
    }
    
    list.innerHTML = scheduleEvents.map((e, i) => {
        let desc = `Dose #${e.doseNum}: `;
        switch (e.eventType) {
            case 'missed': desc += 'MISSED'; break;
            case 'late': desc += `Late by ${e.shift}h`; break;
            case 'early': desc += `Early by ${e.shift}h`; break;
            case 'double': desc += 'DOUBLED'; break;
            case 'custom': desc += `${e.customDose}mg`; break;
        }
        return `
            <div class="event-item">
                <span><span class="event-type ${e.eventType}">${e.eventType.toUpperCase()}</span> ${desc}</span>
                <button class="event-remove" data-remove="${i}" aria-label="Remove disruption">✕</button>
            </div>
        `;
    }).join('');
}

function toggleEventInputs() {
    const eventType = document.getElementById('eventType').value;
    const shiftGroup = document.getElementById('eventShiftGroup');
    const customDoseGroup = document.getElementById('eventCustomDoseGroup');
    
    if (eventType === 'custom') {
        shiftGroup.style.display = 'none';
        customDoseGroup.style.display = 'block';
    } else if (eventType === 'late' || eventType === 'early') {
        shiftGroup.style.display = 'block';
        customDoseGroup.style.display = 'none';
    } else {
        // missed or double - hide both optional inputs
        shiftGroup.style.display = 'none';
        customDoseGroup.style.display = 'none';
    }
}

// ============================================
// UNCERTAINTY TOGGLE
// ============================================
document.getElementById('uncertaintyEnabled').addEventListener('change', function() {
    document.getElementById('uncertaintyInputs').style.display = this.checked ? 'block' : 'none';
});

// ============================================
// REAL TIME AXIS TOGGLE
// ============================================
document.getElementById('showRealTime').addEventListener('change', function() {
    document.getElementById('realTimeOptions').style.display = this.checked ? 'block' : 'none';
    // Re-render plot if we have data
    if (simulationData) {
        const Vd = parseFloat(document.getElementById('vd').value) || null;
        renderPlot(simulationData.result, simulationData.mcBands || null, Vd);
    }
});

function initializeDateTimeInput() {
    const now = new Date();
    // Format as YYYY-MM-DDTHH:MM for datetime-local input
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('firstDoseTime').value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getFirstDoseDate() {
    const input = document.getElementById('firstDoseTime').value;
    if (!input) return null;
    return new Date(input);
}

function formatRealTime(hoursFromStart) {
    const firstDose = getFirstDoseDate();
    if (!firstDose) return null;
    
    const msOffset = hoursFromStart * 60 * 60 * 1000;
    const realTime = new Date(firstDose.getTime() + msOffset);
    
    // Format nicely
    const options = { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };
    return realTime.toLocaleDateString('en-US', options);
}

function formatRealTimeShort(hoursFromStart) {
    const firstDose = getFirstDoseDate();
    if (!firstDose) return null;
    
    const msOffset = hoursFromStart * 60 * 60 * 1000;
    const realTime = new Date(firstDose.getTime() + msOffset);
    
    const month = String(realTime.getMonth() + 1).padStart(2, '0');
    const day = String(realTime.getDate()).padStart(2, '0');
    const hours = realTime.getHours();
    const minutes = String(realTime.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    
    // Return object with date and time on separate lines
    return {
        date: `${month}/${day}`,
        time: `${h12}:${minutes}${ampm}`
    };
}


// ============================================
// PLOTTING
// ============================================
let plotChart = null;

function renderPlot(simResult, mcBands = null, Vd = null) {
    const canvas = document.getElementById('pkPlot');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    // const container = canvas.parentElement;
    // canvas.width = container.clientWidth;
    // canvas.height = container.clientHeight;
    //set canvas internal size to match its displayed size (CSS pixels)
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    
    const { times, Ac_values } = simResult;
    
    // Determine if showing concentration or amount
    const showConc = Vd && Vd > 0;
    const yValues = showConc ? Ac_values.map(a => a / Vd) : Ac_values;
    const yLabel = showConc ? 'Model Concentration (mg/L)' : 'Amount Ac(t) (mg)';
    
    // Find data range
    let yMax = Math.max(...yValues) * 1.1;
    let yMin = 0;
    
    if (mcBands) {
        const band90 = showConc ? mcBands.bands[90].map(v => v / Vd) : mcBands.bands[90];
        yMax = Math.max(yMax, Math.max(...band90) * 1.1);
    }
    
    const xMax = times[times.length - 1];
    const showDays = xMax > 72; // Show days if duration > 72 hours
    const showRealTimeForPadding = document.getElementById('showRealTime').checked;
    
    // Mobile detection based on canvas width
    const isMobile = canvas.width < 500;
    const isNarrow = canvas.width < 700;

    // Responsive font sizes
    const fontSize = {
        axis: isMobile ? 9 : 12,
        secondary: isMobile ? 8 : 10,
        realTime: isMobile ? 7 : 9
    };

    // Calculate bottom padding based on what we're showing
    // let bottomPadding = 50;
    // if (showDays) bottomPadding = 65;
    // if (showRealTimeForPadding) bottomPadding += 18;
    
    // Plotting area
    // const padding = { top: 30, right: 30, bottom: bottomPadding, left: 70 };

    let bottomPadding = isMobile ? 40 : 50;
    if (showDays) bottomPadding = isMobile ? 50 : 65;
    if (showRealTimeForPadding) bottomPadding += isMobile ? 24 : 32;

    const padding = { top: 30, right: isMobile ? 15 : 30, bottom: bottomPadding, left: isMobile ? 50 : 70 };
    const plotWidth = canvas.width - padding.left - padding.right;
    const plotHeight = canvas.height - padding.top - padding.bottom;
    
    // Scale functions
    const scaleX = (t) => padding.left + (t / xMax) * plotWidth;
    const scaleY = (y) => padding.top + plotHeight - (y / yMax) * plotHeight;
    
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Get theme colors
    const isDark = getTheme() === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const textColor = isDark ? '#a1a1aa' : '#475569';
    const textMutedColor = isDark ? '#71717a' : '#94a3b8';
    const lineColor = '#10b981';
    const bandColor = 'rgba(16, 185, 129, 0.2)';
    
    // Draw grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    
    // Y grid
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
        const y = padding.top + (i / yTicks) * plotHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
        ctx.stroke();
    }
    
    // X grid - adaptive tick spacing
    let xTicks, xTickInterval;
    const maxXTicks = isMobile ? 5 : (isNarrow ? 7 : 10);
    if (showDays) {
        // For long durations, use day-based ticks
        const totalDays = xMax / 24;
        if (totalDays <= 14) {
            xTickInterval = isMobile ? 48 : 24; // Every day or every 2 days on mobile
        } else if (totalDays <= 60) {
            xTickInterval = isMobile ? 24 * 14 : 24 * 7; // Every 2 weeks or 1 week
        } else {
            xTickInterval = 24 * 7; // Every week
        }
        xTicks = Math.min(maxXTicks, Math.ceil(xMax / xTickInterval));
    } else {
        xTicks = Math.min(maxXTicks, Math.ceil(xMax / 6));
        xTickInterval = xMax / xTicks;
    }
    
    for (let i = 0; i <= xTicks; i++) {
        const t = showDays ? i * xTickInterval : (i / xTicks) * xMax;
        if (t > xMax) break;
        const x = scaleX(t);
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, canvas.height - padding.bottom);
        ctx.stroke();
    }
    
    // Draw uncertainty band if present
    if (mcBands) {
        const band10 = showConc ? mcBands.bands[10].map(v => v / Vd) : mcBands.bands[10];
        const band90 = showConc ? mcBands.bands[90].map(v => v / Vd) : mcBands.bands[90];
        
        ctx.fillStyle = bandColor;
        ctx.beginPath();
        ctx.moveTo(scaleX(mcBands.times[0]), scaleY(band10[0]));
        
        // Upper edge
        for (let i = 0; i < mcBands.times.length; i++) {
            ctx.lineTo(scaleX(mcBands.times[i]), scaleY(band90[i]));
        }
        
        // Lower edge (reverse)
        for (let i = mcBands.times.length - 1; i >= 0; i--) {
            ctx.lineTo(scaleX(mcBands.times[i]), scaleY(band10[i]));
        }
        
        ctx.closePath();
        ctx.fill();
    }
    
    // Draw main curve
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleX(times[0]), scaleY(yValues[0]));
    
    for (let i = 1; i < times.length; i++) {
        ctx.lineTo(scaleX(times[i]), scaleY(yValues[i]));
    }
    ctx.stroke();
    
    // Draw axes labels
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize.axis}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    
    // X axis labels
    const showRealTime = document.getElementById('showRealTime').checked;
    
    for (let i = 0; i <= xTicks; i++) {
        const t = showDays ? i * xTickInterval : (i / xTicks) * xMax;
        if (t > xMax) break;
        const x = scaleX(t);
        
        if (showDays) {
            // Show hours on first line
            ctx.fillStyle = textColor;
            ctx.font = `${fontSize.axis}px "JetBrains Mono", monospace`;
            ctx.fillText(t.toFixed(0) + 'h', x, canvas.height - padding.bottom + (isMobile ? 12 : 18));
            // Show days on second line
            ctx.fillStyle = textMutedColor;
            ctx.font = `${fontSize.secondary}px "JetBrains Mono", monospace`;
            ctx.fillText('(' + (t/24).toFixed(1) + 'd)', x, canvas.height - padding.bottom + (isMobile ? 22 : 32));
            ctx.font = `${fontSize.axis}px "JetBrains Mono", monospace`;
        } else {
            ctx.fillStyle = textColor;
            ctx.fillText(t.toFixed(1), x, canvas.height - padding.bottom + (isMobile ? 12 : 18));
        }
        
        // Show real time if enabled (date and time on separate lines)
        if (showRealTime) {
            const realTimeData = formatRealTimeShort(t);
            if (realTimeData) {
                ctx.fillStyle = isDark ? '#06b6d4' : '#0891b2'; // accent-info color
                ctx.font = `${fontSize.realTime}px "JetBrains Mono", monospace`;
                const yOffsetDate = showDays ? (isMobile ? 32 : 46) : (isMobile ? 22 : 32);
                const yOffsetTime = yOffsetDate + (isMobile ? 9 : 11); // Line spacing
                ctx.fillText(realTimeData.date, x, canvas.height - padding.bottom + yOffsetDate);
                ctx.fillText(realTimeData.time, x, canvas.height - padding.bottom + yOffsetTime);
                ctx.font = `${fontSize.axis}px "JetBrains Mono", monospace`;
            }
        }
    }
    
    // X axis title
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize.axis}px "JetBrains Mono", monospace`;
    let xAxisLabel = showDays ? 'Time (hours / days)' : 'Time (hours)';
    if (showRealTime) {
        xAxisLabel += isMobile ? '' : ' (real time in blue)';
    }
    ctx.fillText(xAxisLabel, canvas.width / 2, canvas.height - 6);
    
    // Y axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= yTicks; i++) {
        const val = yMax * (1 - i / yTicks);
        const y = padding.top + (i / yTicks) * plotHeight;
        ctx.fillText(val.toFixed(isMobile ? 0 : 1), padding.left - (isMobile ? 5 : 10), y + 4);
    }
    
    // Y axis title
    ctx.save();
    ctx.translate(isMobile ? 10 : 15, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = `${fontSize.axis}px "JetBrains Mono", monospace`;
    ctx.fillText(isMobile ? (showConc ? 'Conc (mg/L)' : 'Amount (mg)') : yLabel, 0, 0);
    ctx.restore();
    
    // Update legend
    const legend = document.getElementById('plotLegend');
    if (showConc) {
        legend.innerHTML = `
            <div class="legend-item">
                <div class="legend-color" style="background: ${lineColor};"></div>
                <span>C(t): Model Concentration (mg/L)</span>
            </div>
            ${mcBands ? `
            <div class="legend-item">
                <div class="legend-color" style="background: ${bandColor}; height: 10px;"></div>
                <span>10-90% Uncertainty Band</span>
            </div>
            ` : ''}
        `;
    } else {
        legend.innerHTML = `
            <div class="legend-item">
                <div class="legend-color" style="background: ${lineColor};"></div>
                <span>A<sub>c</sub>(t): Amount (mg)</span>
            </div>
            ${mcBands ? `
            <div class="legend-item">
                <div class="legend-color" style="background: ${bandColor}; height: 10px;"></div>
                <span>10-90% Uncertainty Band</span>
            </div>
            ` : ''}
        `;
    }
    
    // Store plot state for hover interactions
    currentPlotState = {
        times,
        yValues,
        mcBands,
        Vd,
        showConc,
        xMax,
        yMax,
        padding,
        plotWidth,
        plotHeight,
        showDays
    };
    
    // Save the rendered plot for efficient hover interactions
    saveCanvasState();
}

// ============================================
// PLOT HOVER INTERACTION
// ============================================
let currentPlotState = null;
let isHovering = false;
let savedPlotImage = null;

function setupPlotHover() {
    const canvas = document.getElementById('pkPlot');
    const tooltip = document.getElementById('plotTooltip');
    const container = canvas.parentElement;
    
    canvas.addEventListener('mousemove', handlePlotHover);
    canvas.addEventListener('mouseleave', handlePlotLeave);
    canvas.addEventListener('mouseenter', () => { isHovering = true; });
}

function saveCanvasState() {
    const canvas = document.getElementById('pkPlot');
    const ctx = canvas.getContext('2d');
    savedPlotImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function restoreCanvasState() {
    if (!savedPlotImage) return;
    const canvas = document.getElementById('pkPlot');
    const ctx = canvas.getContext('2d');
    ctx.putImageData(savedPlotImage, 0, 0);
}

function handlePlotHover(e) {
    if (!currentPlotState) return;
    
    const canvas = document.getElementById('pkPlot');
    const tooltip = document.getElementById('plotTooltip');
    const rect = canvas.getBoundingClientRect();
    
    // const mouseX = e.clientX - rect.left;
    // const mouseY = e.clientY - rect.top;
    //map CSS pixels -> canvas internal pixels (prevents hover offset)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const { times, yValues, mcBands, Vd, showConc, xMax, yMax, padding, plotWidth, plotHeight } = currentPlotState;
    
    // Check if mouse is in plot area
    if (mouseX < padding.left || mouseX > padding.left + plotWidth ||
        mouseY < padding.top || mouseY > padding.top + plotHeight) {
        tooltip.classList.remove('visible');
        restoreCanvasState();
        return;
    }
    
    // Convert mouse position to time
    const t = ((mouseX - padding.left) / plotWidth) * xMax;
    
    // Find nearest data point using binary search for efficiency
    let nearestIdx = 0;
    let lo = 0, hi = times.length - 1;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (times[mid] < t) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    // Check if lo or lo-1 is closer
    if (lo > 0 && Math.abs(times[lo-1] - t) < Math.abs(times[lo] - t)) {
        nearestIdx = lo - 1;
    } else {
        nearestIdx = lo;
    }
    
    const time = times[nearestIdx];
    const value = yValues[nearestIdx];
    
    // Update tooltip content
    const showRealTime = document.getElementById('showRealTime').checked;
    
    // Time display
    let timeStr = formatTimeShort(time);
    document.getElementById('tooltipTime').textContent = timeStr;
    
    // Amount/concentration display
    const label = showConc ? 'Conc:' : 'Amount:';
    const unit = showConc ? ' mg/L' : ' mg';
    document.getElementById('tooltipAmountLabel').textContent = label;
    document.getElementById('tooltipAmount').textContent = value.toFixed(2) + unit;
    
    // Uncertainty range if available
    const rangeEl = document.getElementById('tooltipRange');
    if (mcBands && mcBands.bands) {
        const band10 = showConc ? mcBands.bands[10][nearestIdx] / Vd : mcBands.bands[10][nearestIdx];
        const band90 = showConc ? mcBands.bands[90][nearestIdx] / Vd : mcBands.bands[90][nearestIdx];
        document.getElementById('tooltipRangeValues').textContent = 
            band10.toFixed(2) + ' to ' + band90.toFixed(2) + unit;
        rangeEl.style.display = 'block';
    } else {
        rangeEl.style.display = 'none';
    }
    
    // Real time display
    const datetimeEl = document.getElementById('tooltipDatetime');
    if (showRealTime) {
        const realTimeStr = formatRealTime(time);
        if (realTimeStr) {
            document.getElementById('tooltipDatetimeValue').textContent = realTimeStr;
            datetimeEl.style.display = 'block';
        } else {
            datetimeEl.style.display = 'none';
        }
    } else {
        datetimeEl.style.display = 'none';
    }
    
    // Position tooltip - shift based on which half of chart we're in
    const container = canvas.parentElement;
    const chartCenterX = padding.left + plotWidth / 2;
    const isRightHalf = mouseX > chartCenterX;
    
    const tooltipWidth = 200;
    const tooltipHeight = 100;
    
    // Scale mouse position back to CSS pixels for tooltip positioning
    const cssMouseX = mouseX / scaleX;
    const cssMouseY = mouseY / scaleY;
    
    let tooltipX, tooltipY;
    
    // On right half, show tooltip to the left of cursor; on left half, show to the right
    if (isRightHalf) {
        tooltipX = cssMouseX - tooltipWidth - 15;
    } else {
        tooltipX = cssMouseX + 15;
    }
    
    tooltipY = cssMouseY - 10;
    
    // Keep tooltip in vertical bounds
    if (tooltipY + tooltipHeight > container.clientHeight - 10) {
        tooltipY = container.clientHeight - tooltipHeight - 10;
    }
    if (tooltipY < 10) tooltipY = 10;
    
    // Final horizontal bounds check (fallback)
    if (tooltipX < 10) tooltipX = 10;
    if (tooltipX + tooltipWidth > container.clientWidth - 10) {
        tooltipX = container.clientWidth - tooltipWidth - 10;
    }
    
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
    tooltip.classList.add('visible');
    
    // Draw crosshair (restore base plot first)
    restoreCanvasState();
    drawCrosshair(nearestIdx);
}

function handlePlotLeave() {
    const tooltip = document.getElementById('plotTooltip');
    tooltip.classList.remove('visible');
    isHovering = false;
    
    // Restore plot without crosshair
    restoreCanvasState();
}

function drawCrosshair(highlightIdx) {
    if (!currentPlotState || highlightIdx === null) return;
    
    const canvas = document.getElementById('pkPlot');
    const ctx = canvas.getContext('2d');
    
    const { times, yValues, xMax, yMax, padding, plotWidth, plotHeight } = currentPlotState;
    
    // Get theme colors
    const isDark = getTheme() === 'dark';
    const crosshairColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
    const dotColor = '#10b981';
    
    // Scale functions
    const scaleX = (t) => padding.left + (t / xMax) * plotWidth;
    const scaleY = (y) => padding.top + plotHeight - (y / yMax) * plotHeight;
    
    const x = scaleX(times[highlightIdx]);
    const y = scaleY(yValues[highlightIdx]);
    
    // Draw vertical crosshair line
    ctx.strokeStyle = crosshairColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + plotHeight);
    ctx.stroke();
    
    // Draw horizontal line to y-axis
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw highlight dot
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw white border on dot
    ctx.strokeStyle = isDark ? '#fafafa' : '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
}

// ============================================
// MAIN SIMULATION RUNNER
// ============================================
function runSimulation() {
    try {
        // Gather inputs
        const dose = parseFloat(document.getElementById('dose').value);
        const tau = parseFloat(document.getElementById('tau').value);
        const numDoses = parseInt(document.getElementById('numDoses').value);
        const halfLife = parseFloat(document.getElementById('halfLife').value);
        const F = parseFloat(document.getElementById('bioavailability').value);
        const Vd = parseFloat(document.getElementById('vd').value) || null;
        const tLag = parseFloat(document.getElementById('tLag').value) || 0;
        const tRel = parseFloat(document.getElementById('tRel').value) || 8;
        const extendElimination = document.getElementById('extendElimination').checked;

        // Elimination kinetics (first-order default; saturable modes use RK4)
        const elimMode = currentElimMode;
        let Vmax = 0, Km = 0;
        if (elimMode === 'mm') {
            Vmax = parseFloat(document.getElementById('vmaxInput').value);
            Km = parseFloat(document.getElementById('kmInput').value);
        } else if (elimMode === 'zero') {
            Vmax = parseFloat(document.getElementById('k0Input').value); // zero-order = Km -> 0
            Km = 0;
        }

        // Validate
        clearError();
        if (!dose || dose <= 0) { showError('Dose must be > 0'); return; }
        if (!tau || tau <= 0) { showError('Interval tau must be > 0'); return; }
        if (!numDoses || numDoses < 1) { showError('Number of doses must be >= 1'); return; }
        if (!halfLife || halfLife <= 0) { showError('Half-life must be > 0'); return; }
        if (F < 0 || F > 1) { showError('Bioavailability must be 0-1'); return; }
        if (elimMode === 'mm' && (!(Vmax > 0) || !(Km > 0))) { showError('Michaelis-Menten needs Vmax > 0 and Km > 0.'); return; }
        if (elimMode === 'zero' && !(Vmax > 0)) { showError('Zero-order needs k0 > 0.'); return; }

        // Compute ke (elimination rate; only used by the first-order model)
        const ke = Math.LN2 / halfLife;
        
        // Compute ka based on mode
        let ka;
        if (currentParamMode === 'A') {
            const bucket = parseFloat(document.getElementById('absorptionBucket').value);
            ka = kaFromBucket(bucket);
        } else if (currentParamMode === 'B') {
            let tmax = parseFloat(document.getElementById('tmax').value);
            const tmaxBasis = document.getElementById('tmaxBasis').value;
            
            // Adjust Tmax for lag if measuring from ingestion
            if (tmaxBasis === 'ingestion' && currentDoseForm === 'Delayed') {
                tmax = tmax - tLag;
            }
            
            if (tmax <= 0) {
                showError('Tmax (after lag adjustment) must be > 0. Reduce lag time or increase Tmax.');
                return;
            }

            ka = solveKaFromTmax(ke, tmax);
            if (!ka) {
                showError('Could not solve for ka. Tmax may be too large or inconsistent with half-life. Try reducing Tmax or switching to Mode A/C.');
                return;
            }
        } else {
            ka = parseFloat(document.getElementById('kaInput').value);
        }

        if (!ka || ka <= 0) {
            showError('ka must be > 0.');
            return;
        }
        if (elimMode === 'firstorder' && ka <= ke) {
            showError('ka must be > ke for valid 1-compartment extravascular model.');
            return;
        }
        
        // Calculate elimination time milestones
        const t5hl = 5 * halfLife;  // ~97% eliminated
        const t7hl = 7 * halfLife;  // ~99% eliminated
        
        // Simulation duration
        let duration = parseFloat(document.getElementById('simDuration').value);
        if (!duration || duration <= 0) {
            duration = numDoses * tau + tau; // Extra interval after last dose
        }
        
        // If extend elimination is checked, extend to 7 half-lives after last dose
        if (extendElimination) {
            const lastDoseTime = (numDoses - 1) * tau;
            const extendedDuration = lastDoseTime + t7hl;
            duration = Math.max(duration, extendedDuration);
        }
        
        // Build schedule
        const schedule = buildSchedule(numDoses, tau, scheduleEvents, dose, currentDoseForm, tLag, tRel);
        
        // Build baseline (no disruptions) for comparison
        const baselineSchedule = buildBaselineSchedule(numDoses, tau, dose, currentDoseForm, tLag, tRel);

        const samplesPlot = 240;     // smooth plot, base was 60
        const samplesMetrics = 1200; // very accurate AUC/metrics, base used to be 60

        const simParams = {
            ka, ke, F,
            schedule,
            duration,
            samplesPerHour: samplesPlot,
            elimMode, Vmax, Km
        };

        // new
        const simParamsMetrics = {
            ka, ke, F, schedule, duration,
            samplesPerHour: samplesMetrics,
            elimMode, Vmax, Km
        };

        // Run main simulation
        // const result = simulate(simParams);

        // Run baseline if there are disruptions
        // let baseline = null;
        // if (scheduleEvents.length > 0) {
        //     baseline = simulate({ ...simParams, schedule: baselineSchedule });
        // }

        // run two sims (plot vs metrics)
        const resultPlot = simulate(simParams);
        const resultMetrics = simulate(simParamsMetrics);

        // Keep existing downstream code working (anything that expects `result`)
        const result = resultPlot;

        //baseline for metrics (only if disruptions exist)
        let baselineMetrics = null;
        if (scheduleEvents.length > 0) {
            baselineMetrics = simulate({ ...simParamsMetrics, schedule: baselineSchedule });
        }

        // Monte Carlo if enabled
        let mcBands = null;
        if (document.getElementById('uncertaintyEnabled').checked) {
            const nSamples = parseInt(document.getElementById('mcSamples').value) || 300;
            const mcOpts = {
                halfLifeMin: parseFloat(document.getElementById('halfLifeMin').value),
                halfLifeMax: parseFloat(document.getElementById('halfLifeMax').value),
                paramMode: currentParamMode,
                tmax: parseFloat(document.getElementById('tmax').value),
                tmaxBasis: document.getElementById('tmaxBasis').value,
                doseForm: currentDoseForm,
                tLag,
            };
            const mcResults = runMonteCarlo(simParams, Math.min(nSamples, 2000), mcOpts);
            mcBands = computePercentileBands(mcResults);
        }

        // Compute metrics
        // const metrics = computeMetrics(result, { tau, numDoses }, baseline);

        // Render plot
        // renderPlot(result, mcBands, Vd);

        // Compute metrics using the high-resolution result
        const metrics = computeMetrics(resultMetrics, { tau, numDoses }, baselineMetrics, scheduleEvents);

        // Render plot using the plot-resolution result
        renderPlot(resultPlot, mcBands, Vd);

        
        // Update metrics display with proper time formatting
        document.getElementById('metricAmax').innerHTML = metrics.Amax.toFixed(2) + '<span class="metric-unit">mg</span>';
        document.getElementById('metricAmin').innerHTML = metrics.Amin.toFixed(2) + '<span class="metric-unit">mg</span>';
        document.getElementById('metricTmax').innerHTML = formatTimeShort(metrics.Tmax);
        document.getElementById('metricAccum').innerHTML = metrics.accumRatio.toFixed(2);
        document.getElementById('metricRecovery').innerHTML = metrics.recoveryTime !== null 
            ? formatTime(metrics.recoveryTime)
            : '-';
        document.getElementById('metricSteady').innerHTML = metrics.steadyState ? 'Yes' : 'No';
        
        // Update elimination time metrics. Half-life is only constant under
        // first-order kinetics; saturable modes have no fixed half-life.
        if (elimMode === 'firstorder') {
            document.getElementById('metricT5hl').innerHTML = formatTime(t5hl);
            document.getElementById('metricT7hl').innerHTML = formatTime(t7hl);
        } else {
            document.getElementById('metricT5hl').innerHTML = 'n/a';
            document.getElementById('metricT7hl').innerHTML = 'n/a';
        }

        // Update derived parameters
        const keLine = document.getElementById('derivedKeLine');
        const satLine = document.getElementById('derivedSatLine');
        document.getElementById('derivedKa').textContent = ka.toFixed(4);
        document.getElementById('derivedF').textContent = F.toFixed(2);
        if (elimMode === 'firstorder') {
            document.getElementById('derivedKe').textContent = ke.toFixed(4);
            keLine.style.display = 'block';
            satLine.style.display = 'none';
        } else {
            keLine.style.display = 'none';
            satLine.style.display = 'block';
            document.getElementById('derivedSat').innerHTML = (elimMode === 'mm')
                ? `Vmax = ${Vmax} mg/h, Km = ${Km} mg (Michaelis-Menten)`
                : `k0 = ${Vmax} mg/h (zero-order)`;
        }
        
        if (Vd) {
            document.getElementById('derivedVdLine').style.display = 'block';
            document.getElementById('derivedVd').textContent = Vd.toFixed(1);
        } else {
            document.getElementById('derivedVdLine').style.display = 'none';
        }
        
        // Store for potential export and hover interactions
        simulationData = { result, metrics, params: simParams, halfLife, t5hl, t7hl, mcBands };
        
    } catch (err) {
        console.error('Simulation error:', err);
        showError('Simulation error: ' + err.message);
    }
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Theme is initialized by shared.js ThemeManager.
    wireEvents();
    initializeDateTimeInput();
    setupPlotHover();
    loadPreset(); // Load default preset (coffee)

    // Initial simulation
    setTimeout(() => {
        runSimulation();
    }, 100);
});

// Handle window resize
window.addEventListener('resize', () => {
    if (simulationData) {
        const Vd = parseFloat(document.getElementById('vd').value) || null;
        renderPlot(simulationData.result, simulationData.mcBands || null, Vd);
    }
});

// ============================================
// EVENT WIRING (replaces inline on* handlers)
// ============================================
function wireEvents() {
    document.getElementById('presetSelect').addEventListener('change', loadPreset);

    document.querySelectorAll('.doseform-container .mode-card').forEach(card => {
        card.addEventListener('click', () => setDoseForm(card.querySelector('input').value));
    });
    document.querySelectorAll('.mode-container .mode-card').forEach(card => {
        card.addEventListener('click', () => setParamMode(card.querySelector('input').value));
    });
    document.getElementById('elimMode').addEventListener('change', (e) => setElimMode(e.target.value));

    const onActivate = (header, fn) => {
        header.addEventListener('click', fn);
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
        });
    };
    document.querySelectorAll('[data-collapsible]').forEach(header => {
        onActivate(header, () => toggleCollapsible(header.dataset.collapsible, header));
    });
    document.querySelectorAll('[data-dropdown]').forEach(header => {
        onActivate(header, () => toggleDropdown(header.dataset.dropdown, header));
    });

    document.getElementById('eventType').addEventListener('change', toggleEventInputs);
    document.getElementById('addEventBtn').addEventListener('click', addEvent);
    document.getElementById('runBtn').addEventListener('click', runSimulation);

    // Delegated remove-disruption clicks (buttons are re-rendered dynamically).
    document.getElementById('eventList').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove]');
        if (btn) removeEvent(parseInt(btn.dataset.remove, 10));
    });
}

// ============================================
// INLINE ERROR DISPLAY (replaces alert())
// ============================================
function showError(message) {
    const el = document.getElementById('simError');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
}

function clearError() {
    const el = document.getElementById('simError');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
}

// Expose the pure engine for tests and programmatic use.
window.OralMultiDose = {
    PRESETS,
    kaFromBucket, solveKaFromTmax, propagate, propagateSaturable, buildSchedule, buildBaselineSchedule,
    simulate, computeIntervalAUC, findIntervalExtrema,
    computeMetrics, computePercentileBands, runMonteCarlo, mulberry32,
};
