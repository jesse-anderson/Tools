import { makePinnedState, renderComparisonPanel } from './comparison.js';
import { createSteamEngine } from './lookups.js';
import { EXAMPLES, MODE_GROUPS, MODES, defaultValuesForMode } from './modes.js';
import { renderPhaseContextPanel } from './phase-context.js';
import { renderResult, renderTests, renderTrace } from './render.js';
import { renderChartsPanel } from './charts.js';
import {
    PRESSURE_UNIT_OPTIONS,
    formatNumber,
    inputUnitLabel,
    normalizeUnitSettings,
    propertyFromSI,
    propertyToSI
} from './units.js';
import {
    buildStatePayload,
    copyText,
    downloadStatePayload,
    payloadToText
} from './state-export.js';
import { escapeHtml } from './html.js';

let engine = null;
let lastResult = null;
let activeUnits = null;
let activeValues = null;
const preferredPressureUnits = {
    si: 'kPa',
    us: 'psia'
};
const CHART_POINT_HOVER_DISTANCE_PX = 10;
const CHART_OVERLAYS_STORAGE_KEY = 'steam-tables.chart-overlays.v1';
const DEFAULT_CHART_OVERLAYS = {
    dome: true,
    isobars: true,
    isobarCount: 4,
    markers: true,
    qualityLines: true,
    isotherms: true,
    critPoint: true,
    triplePoint: true,
    grid: true,
    phaseLabels: true
};
let chartOverlays = loadChartOverlays();
let pinnedStateA = null;
let pinnedStateB = null;

function loadChartOverlays() {
    try {
        const raw = window.localStorage?.getItem(CHART_OVERLAYS_STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_CHART_OVERLAYS };
        }
        const parsed = JSON.parse(raw);
        return sanitizeChartOverlays(parsed);
    } catch {
        return { ...DEFAULT_CHART_OVERLAYS };
    }
}

function sanitizeChartOverlays(input) {
    const next = { ...DEFAULT_CHART_OVERLAYS };
    if (!input || typeof input !== 'object') {
        return next;
    }
    for (const key of ['dome', 'isobars', 'markers', 'qualityLines', 'isotherms', 'critPoint', 'triplePoint', 'grid', 'phaseLabels']) {
        if (typeof input[key] === 'boolean') {
            next[key] = input[key];
        }
    }
    if ([2, 3, 4].includes(input.isobarCount)) {
        next.isobarCount = input.isobarCount;
    }
    return next;
}

function persistChartOverlays() {
    try {
        window.localStorage?.setItem(CHART_OVERLAYS_STORAGE_KEY, JSON.stringify(chartOverlays));
    } catch {
        /* localStorage unavailable; ignore */
    }
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
    setupModeSelector();
    setupExampleSelector();
    setupEvents();
    applyUrlState();
    renderInputs();
    renderPhaseContext();
    renderCharts();
    renderComparison();
    setStatus('Loading steam tables...');

    try {
        engine = await createSteamEngine();
        setStatus('Tables loaded. Ready.');
        compute();
    } catch (error) {
        setStatus(`Failed to load tables: ${error.message}`, true);
    }
}

function setupModeSelector() {
    const select = byId('lookupMode');
    select.innerHTML = MODE_GROUPS
        .map((group) => `
            <optgroup label="${escapeHtml(group.label)}">
                ${group.modes.map((value) => `<option value="${value}">${escapeHtml(MODES[value].label)}</option>`).join('')}
            </optgroup>
        `)
        .join('');
    activeUnits = currentUnits();
    activeValues = defaultValuesForMode(MODES[select.value]);
    updatePressureUnitOptions();
}

function setupExampleSelector() {
    const select = byId('examplePreset');
    select.innerHTML = [
        '<option value="">Custom</option>',
        ...EXAMPLES.map((example) => `<option value="${example.id}">${escapeHtml(example.label)}</option>`)
    ].join('');
}

function setupEvents() {
    const closeMenu = (menu) => {
        menu.removeAttribute('open');
        const summary = menu.querySelector('summary');
        if (summary) {
            summary.setAttribute('aria-expanded', 'false');
        }
    };

    document.querySelectorAll('.action-menu').forEach((menu) => {
        menu.addEventListener('toggle', () => {
            const summary = menu.querySelector('summary');
            if (summary) {
                summary.setAttribute('aria-expanded', String(menu.open));
            }
            if (!menu.open) {
                return;
            }
            document.querySelectorAll('.action-menu[open]').forEach((otherMenu) => {
                if (otherMenu !== menu) {
                    closeMenu(otherMenu);
                }
            });
        });
    });

    // Menus behave like menus: choosing an item or clicking outside closes
    // them, and Escape closes any open menu.
    document.addEventListener('click', (event) => {
        document.querySelectorAll('.action-menu[open]').forEach((menu) => {
            const clickedInside = menu.contains(event.target);
            const pickedItem = clickedInside && event.target.closest('.action-menu-panel [role="menuitem"]');
            if (!clickedInside || pickedItem) {
                closeMenu(menu);
            }
        });
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            document.querySelectorAll('.action-menu[open]').forEach(closeMenu);
        }
    });
    byId('lookupMode').addEventListener('change', () => {
        markCustomExample();
        activeValues = defaultValuesForMode(MODES[byId('lookupMode').value]);
        renderInputs();
        compute();
    });
    byId('examplePreset').addEventListener('change', (event) => applyExample(event.target.value));
    byId('unitSystem').addEventListener('change', () => handleUnitChange());
    byId('pressureUnit').addEventListener('change', () => handleUnitChange());
    byId('computeBtn').addEventListener('click', () => compute());
    byId('copyStateBtn').addEventListener('click', (event) => copyState(event.currentTarget));
    byId('copyLinkBtn').addEventListener('click', (event) => copyLink(event.currentTarget));
    byId('exportCsvBtn').addEventListener('click', () => exportState('csv'));
    byId('exportJsonBtn').addEventListener('click', () => exportState('json'));
    byId('pinStateABtn').addEventListener('click', () => pinState('A'));
    byId('pinStateBBtn').addEventListener('click', () => pinState('B'));
    byId('swapStatesBtn').addEventListener('click', () => swapPinnedStates());
    byId('clearStatesBtn').addEventListener('click', () => clearPinnedStates());
    byId('runTestsBtn').addEventListener('click', () => runTests());

    const debouncedCompute = debounce(() => compute(), 150);
    byId('inputFields').addEventListener('input', () => {
        markCustomExample();
        debouncedCompute();
    });
    byId('inputFields').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            markCustomExample();
            compute();
        }
    });
    byId('resultPanel').addEventListener('click', (event) => {
        const button = event.target.closest('[data-copy-value]');
        if (button && typeof Clipboard !== 'undefined') {
            Clipboard.copy(button.dataset.copyValue, button);
        }
    });
    byId('chartPanel').addEventListener('change', handleChartOverlayChange);
    byId('chartPanel').addEventListener('click', (event) => {
        if (event.target.closest('button[data-isobar-count]')) {
            handleChartOverlayChange(event);
            return;
        }
        const target = chartEventTarget(event);
        if (target) {
            selectChartItem(target);
        }
    });
    byId('chartPanel').addEventListener('pointerover', (event) => {
        const target = chartEventTarget(event);
        if (target) {
            previewChartItem(target);
        }
    });
    byId('chartPanel').addEventListener('pointermove', (event) => {
        const target = chartEventTarget(event);
        if (target) {
            previewChartItem(target);
        }
    });
    byId('chartPanel').addEventListener('mousemove', (event) => {
        const target = chartEventTarget(event);
        if (target) {
            previewChartItem(target);
        }
    });
    byId('chartPanel').addEventListener('focusin', (event) => {
        const target = directChartTarget(event);
        if (target) {
            previewChartItem(target);
        }
    });
    byId('chartPanel').addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        const target = event.target.closest('[data-chart-id]');
        if (target) {
            event.preventDefault();
            selectChartItem(target);
        }
    });
    byId('licenseBtn').addEventListener('click', () => byId('licenseModal').showModal());
    byId('closeLicenseBtn').addEventListener('click', () => byId('licenseModal').close());
}

function applyUrlState() {
    const params = new URLSearchParams(window.location.search);
    const unitSystem = params.get('units');
    if (unitSystem === 'si' || unitSystem === 'us') {
        byId('unitSystem').value = unitSystem;
    }

    const pressure = params.get('pressure');
    const system = byId('unitSystem').value;
    if (isPressureUnitAllowed(system, pressure)) {
        preferredPressureUnits[system] = pressure;
    }
    updatePressureUnitOptions();

    const modeKey = params.get('mode');
    if (modeKey && MODES[modeKey]) {
        byId('lookupMode').value = modeKey;
    }

    const mode = MODES[byId('lookupMode').value];
    activeUnits = currentUnits();
    activeValues = defaultValuesForMode(mode);

    for (const field of mode.fields) {
        if (!params.has(field.id)) {
            continue;
        }
        const value = Number(params.get(field.id));
        if (Number.isFinite(value)) {
            activeValues[field.id] = value;
        }
    }
}

function renderInputs() {
    const mode = currentMode();
    const units = currentUnits();
    const values = activeValues || defaultValuesForMode(mode);
    byId('inputFields').innerHTML = mode.fields.map((field) => `
        <label class="input-line">
            <span>${escapeHtml(field.label)} <em>${escapeHtml(inputUnitLabel(field.kind, units))}</em></span>
            <input id="field-${field.id}" class="main-input" type="number" step="any" value="${formatInputValue(field.kind, values[field.id], units)}">
        </label>
    `).join('');
}

function compute() {
    if (!engine) {
        return;
    }

    try {
        const modeKey = byId('lookupMode').value;
        const units = currentUnits();
        const mode = MODES[modeKey];
        const values = readFields(mode, units);
        activeUnits = units;
        activeValues = values;
        lastResult = evaluateMode(modeKey, mode, values);

        renderResult(byId('resultPanel'), lastResult, units);
        renderTrace(byId('tracePanel'), lastResult, units);
        renderPhaseContext();
        renderCharts();
        renderComparison();
        syncUrlState(modeKey, units, values);
        setStatus('Computed.');
    } catch (error) {
        lastResult = null;
        byId('resultPanel').innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
        byId('tracePanel').innerHTML = '<div class="empty-state">Fix the input error to see interpolation details.</div>';
        renderPhaseContext();
        renderCharts();
        setStatus(error.message, true);
    }
}

function evaluateMode(modeKey, mode, values) {
    switch (modeKey) {
        case 'satT':
            return engine.saturationByT(values.T);
        case 'satP':
            return engine.saturationByP(values.P);
        case 'mixT':
            return engine.mixtureByT(values.T, values.x);
        case 'mixP':
            return engine.mixtureByP(values.P, values.x);
        case 'pt':
            return engine.statePT(values.P, values.T);
        default: {
            const [axis, prop] = mode.reverse;
            return engine.reverse(axis, prop, values[axis], values.target);
        }
    }
}

async function runTests() {
    if (!engine) {
        return;
    }
    const button = byId('runTestsBtn');
    button.disabled = true;
    button.textContent = 'Running...';
    byId('testPanel').innerHTML = '<div class="empty-state">Running consistency checks against vendored CSV rows...</div>';

    try {
        const report = await engine.runInternalTests();
        renderTests(byId('testPanel'), report);
        setStatus(report.failed ? `${report.failed} internal tests failed.` : `All ${report.passed} internal tests passed.`, report.failed > 0);
    } catch (error) {
        byId('testPanel').innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
        setStatus(`Internal tests failed to run: ${error.message}`, true);
    } finally {
        button.disabled = false;
        button.textContent = 'Run Tests';
    }
}

function readFields(mode, units) {
    const values = {};
    for (const field of mode.fields) {
        const text = byId(`field-${field.id}`).value.trim();
        if (text === '') {
            throw new Error(`${field.label} is required.`);
        }
        const raw = Number(text);
        if (!Number.isFinite(raw)) {
            throw new Error(`${field.label} must be a finite number.`);
        }
        values[field.id] = field.kind === 'x' ? raw : propertyToSI(field.kind, raw, units);
    }
    return values;
}

function handleUnitChange() {
    markCustomExample();
    const mode = currentMode();
    const previousUnits = activeUnits || currentUnits();
    try {
        activeValues = readFields(mode, previousUnits);
    } catch {
        activeValues = defaultValuesForMode(mode);
    }
    updatePressureUnitOptions();
    activeUnits = currentUnits();
    renderInputs();
    compute();
}

function applyExample(exampleId) {
    const example = EXAMPLES.find((item) => item.id === exampleId);
    if (!example) {
        markCustomExample();
        return;
    }

    byId('lookupMode').value = example.mode;
    byId('unitSystem').value = example.units.system;
    if (isPressureUnitAllowed(example.units.system, example.units.pressure)) {
        preferredPressureUnits[example.units.system] = example.units.pressure;
    }
    updatePressureUnitOptions();
    activeUnits = currentUnits();
    activeValues = {
        ...defaultValuesForMode(MODES[example.mode]),
        ...example.values
    };
    renderInputs();
    compute();
}

function markCustomExample() {
    const select = byId('examplePreset');
    if (select) {
        select.value = '';
    }
}

function updatePressureUnitOptions() {
    const system = byId('unitSystem').value;
    const select = byId('pressureUnit');
    if (isPressureUnitAllowed(system, select.value)) {
        preferredPressureUnits[system] = select.value;
    }

    const options = PRESSURE_UNIT_OPTIONS[system] || PRESSURE_UNIT_OPTIONS.si;
    select.innerHTML = options
        .map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`)
        .join('');
    select.disabled = false;
    select.value = preferredPressureUnits[system] || options[0].value;
}

function currentMode() {
    return MODES[byId('lookupMode').value];
}

function currentUnits() {
    const system = byId('unitSystem').value;
    return normalizeUnitSettings({
        system,
        pressure: byId('pressureUnit').value || preferredPressureUnits[system]
    });
}

function isPressureUnitAllowed(system, pressure) {
    return Boolean(pressure && (PRESSURE_UNIT_OPTIONS[system] || PRESSURE_UNIT_OPTIONS.si).some((option) => option.value === pressure));
}

function formatInputValue(kind, value, units) {
    if (kind === 'x') {
        return formatNumber(value, 8);
    }
    return formatNumber(propertyFromSI(kind, value, units), 8);
}

function syncUrlState(modeKey = byId('lookupMode').value, units = currentUnits(), values = activeValues) {
    if (!values) {
        return;
    }
    const url = new URL(window.location.href);
    const params = new URLSearchParams();
    params.set('mode', modeKey);
    params.set('units', units.system);
    params.set('pressure', units.pressure);

    for (const field of MODES[modeKey].fields) {
        if (Number.isFinite(values[field.id])) {
            params.set(field.id, formatNumber(values[field.id], 12));
        }
    }

    url.search = params.toString();
    window.history.replaceState(null, '', url);
}

function getCurrentPayload() {
    const modeKey = byId('lookupMode').value;
    const payload = buildStatePayload({
        modeKey,
        mode: MODES[modeKey],
        activeValues,
        result: lastResult,
        units: activeUnits || currentUnits()
    });

    if (!payload) {
        setStatus('Compute a state before copying or exporting.', true);
    }

    return payload;
}

async function copyState(button) {
    const payload = getCurrentPayload();
    if (!payload) {
        return;
    }
    const copied = await copyText(payloadToText(payload), button);
    setStatus(copied ? 'State summary copied.' : 'Unable to copy state summary.', !copied);
}

async function copyLink(button) {
    if (!lastResult && engine) {
        compute();
    }
    syncUrlState();
    const copied = await copyText(window.location.href, button);
    setStatus(copied ? 'Share link copied.' : 'Unable to copy share link.', !copied);
}

function exportState(format) {
    const payload = getCurrentPayload();
    if (!payload) {
        return;
    }

    downloadStatePayload(payload, format);
    setStatus(`${format === 'csv' ? 'CSV' : 'JSON'} exported.`);
}

function pinState(slot) {
    const payload = getCurrentPayload();
    if (!payload) {
        return;
    }

    if (slot === 'A') {
        pinnedStateA = makePinnedState(slot, payload, lastResult);
    } else {
        pinnedStateB = makePinnedState(slot, payload, lastResult);
    }

    renderComparison();
    renderCharts();
    setStatus(`Pinned State ${slot}.`);
}

function swapPinnedStates() {
    if (!pinnedStateA && !pinnedStateB) {
        setStatus('No pinned states to swap.', true);
        return;
    }

    [pinnedStateA, pinnedStateB] = [pinnedStateB, pinnedStateA];
    if (pinnedStateA) {
        pinnedStateA.slot = 'A';
    }
    if (pinnedStateB) {
        pinnedStateB.slot = 'B';
    }
    renderComparison();
    renderCharts();
    setStatus('Swapped pinned states.');
}

function clearPinnedStates() {
    pinnedStateA = null;
    pinnedStateB = null;
    renderComparison();
    renderCharts();
    setStatus('Cleared pinned states.');
}

function renderPhaseContext() {
    renderPhaseContextPanel(byId('phaseContextPanel'), lastResult, currentUnits(), engine);
}

function renderCharts() {
    renderChartsPanel(byId('chartPanel'), engine, lastResult, pinnedStateA, pinnedStateB, currentUnits(), chartOverlays);
}

function handleChartOverlayChange(event) {
    const checkbox = event.target.closest('input[type="checkbox"][data-overlay-key]');
    if (checkbox) {
        const key = checkbox.dataset.overlayKey;
        if (key in chartOverlays) {
            chartOverlays = { ...chartOverlays, [key]: checkbox.checked };
            persistChartOverlays();
            renderCharts();
        }
        return;
    }
    const button = event.target.closest('button[data-isobar-count]');
    if (button) {
        const count = Number(button.dataset.isobarCount);
        if ([2, 3, 4].includes(count)) {
            chartOverlays = { ...chartOverlays, isobarCount: count };
            persistChartOverlays();
            renderCharts();
        }
    }
}

function chartEventTarget(event) {
    const directTarget = directChartTarget(event);
    const svg = event.target.closest('svg.steam-chart');
    if (!svg) {
        return directTarget;
    }

    if (directTarget?.classList.contains('chart-marker')) {
        return directTarget;
    }

    return nearestChartPoint(svg, event) || directTarget;
}

function directChartTarget(event) {
    return event.target.closest('[data-chart-id]');
}

function nearestChartPoint(svg, event) {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    if (!rect.width || !rect.height || !viewBox.width || !viewBox.height) {
        return null;
    }

    const eventX = viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width;
    const eventY = viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height;
    const scaleX = rect.width / viewBox.width;
    const scaleY = rect.height / viewBox.height;
    let nearest = null;
    let nearestDistance = Infinity;
    svg.querySelectorAll('.chart-hover-point[data-chart-id]').forEach((point) => {
        const pointX = Number(point.getAttribute('cx'));
        const pointY = Number(point.getAttribute('cy'));
        if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) {
            return;
        }

        const distance = Math.hypot((eventX - pointX) * scaleX, (eventY - pointY) * scaleY);
        if (distance < nearestDistance) {
            nearest = point;
            nearestDistance = distance;
        }
    });

    return nearestDistance <= CHART_POINT_HOVER_DISTANCE_PX ? nearest : null;
}

function selectChartItem(target) {
    applyChartItemState(target, 'selected');
}

function previewChartItem(target) {
    applyChartItemState(target, 'hovered');
}

function applyChartItemState(target, stateClass) {
    const block = target.closest('.chart-block');
    if (!block) {
        return;
    }

    const id = target.dataset.chartId;
    const parentId = target.dataset.chartParentId;
    block.querySelectorAll('[data-chart-id]').forEach((item) => {
        const matchesItem = item.dataset.chartId === id || (parentId ? item.dataset.chartId === parentId : false);
        item.classList.toggle(stateClass, matchesItem);
    });

    updateChartDetail(block, target);
}

function updateChartDetail(block, target) {
    const detail = block.querySelector('[data-chart-detail]');
    if (detail) {
        const title = target.dataset.chartTitle || 'Chart item';
        const text = target.dataset.chartDetailText || '';
        detail.textContent = text ? `${title}: ${text}` : title;
        detail.classList.add('active');
    }
}

function renderComparison() {
    renderComparisonPanel(byId('comparisonPanel'), pinnedStateA, pinnedStateB, currentUnits());
}

function setStatus(message, isError = false) {
    const status = byId('statusBanner');
    status.textContent = message;
    status.classList.toggle('error', isError);
}

function debounce(fn, wait) {
    let timeout = null;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), wait);
    };
}

function byId(id) {
    return document.getElementById(id);
}
