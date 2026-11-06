// Page wiring for the graph paper generator. Geometry, labels and scale text
// live in graph-paper-engine.js and the PDF writer in graph-paper-pdf.js; both
// are exposed on window.GraphPaperEngine for specs.
import * as Engine from './graph-paper-engine.js';
import { buildPdf } from './graph-paper-pdf.js';

const {
    DEFAULT_STATE,
    INCH_TO_PT,
    PAPER_SIZES,
    TEMPLATE_META,
    buildScene,
    buildScaleSummary,
    formatFixed,
    getActivePalette,
    isAxisTemplate,
    isDotTemplate,
    isGridTemplate,
    normalizeState
} = Engine;

window.GraphPaperEngine = Object.freeze({ ...Engine, buildPdf });

const SAVED_TEMPLATE_KEY = 'graphPaperGenerator.savedTemplate';
const SVG_NS = 'http://www.w3.org/2000/svg';
const PREVIEW_FONTS = {
    mono: '"Courier New", Courier, monospace',
    bold: 'Helvetica, Arial, sans-serif'
};

// State key -> input id. Checkboxes and selects are told apart by element type.
const FIELD_IDS = {
    template: 'templateSelect',
    paperSize: 'paperSizeSelect',
    orientation: 'orientationSelect',
    palette: 'paletteSelect',
    minorSpacingIn: 'minorSpacingInput',
    majorEvery: 'majorEveryInput',
    marginIn: 'marginInput',
    dotRadiusPt: 'dotRadiusInput',
    useCustomColors: 'useCustomColorsCheck',
    minorRed: 'minorRedInput',
    minorGreen: 'minorGreenInput',
    minorBlue: 'minorBlueInput',
    majorRed: 'majorRedInput',
    majorGreen: 'majorGreenInput',
    majorBlue: 'majorBlueInput',
    accentRed: 'accentRedInput',
    accentGreen: 'accentGreenInput',
    accentBlue: 'accentBlueInput',
    minorOpacity: 'minorOpacityInput',
    majorOpacity: 'majorOpacityInput',
    headerText: 'headerTextInput',
    headerAlign: 'headerAlignSelect',
    footerText: 'footerTextInput',
    footerAlign: 'footerAlignSelect',
    includeScaleNote: 'includeScaleNoteCheck',
    scaleValue: 'scaleValueInput',
    scaleUnit: 'scaleUnitSelect',
    xMin: 'xMinInput',
    xMax: 'xMaxInput',
    yMin: 'yMinInput',
    yMax: 'yMaxInput'
};

// How each normalized value is written back to its input on commit.
const DISPLAY_FORMAT = {
    minorSpacingIn: (v) => formatFixed(v, 2),
    marginIn: (v) => formatFixed(v, 2),
    dotRadiusPt: (v) => formatFixed(v, 1),
    minorOpacity: (v) => formatFixed(v, 2),
    majorOpacity: (v) => formatFixed(v, 2)
};

const fields = {};
const el = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
    Object.entries(FIELD_IDS).forEach(([key, id]) => {
        fields[key] = document.getElementById(id);
    });
    [
        'templateSummary', 'printableAreaStat', 'pitchStat', 'countStat', 'scaleStat',
        'templateBadge', 'paperBadge', 'statusLine', 'paperPreview', 'saveTemplateBtn',
        'loadTemplateBtn', 'exportSettingsBtn', 'importSettingsInput', 'downloadPdfBtn',
        'resetBtn', 'customColorFieldset', 'minorOpacityValue', 'majorOpacityValue'
    ].forEach((id) => {
        el[id] = document.getElementById(id);
    });
    el.gridOnly = Array.from(document.querySelectorAll('.grid-only'));
    el.dotOnly = Array.from(document.querySelectorAll('.dot-only'));
    el.axisOnly = Array.from(document.querySelectorAll('.axis-only'));

    const debouncedRender = debounce(() => render(false), 50);
    Object.values(fields).forEach((input) => {
        input.addEventListener('input', debouncedRender);
        input.addEventListener('change', () => render(true));
    });

    el.saveTemplateBtn.addEventListener('click', saveTemplate);
    el.loadTemplateBtn.addEventListener('click', loadTemplate);
    el.exportSettingsBtn.addEventListener('click', exportSettings);
    el.importSettingsInput.addEventListener('change', importSettings);
    el.downloadPdfBtn.addEventListener('click', downloadPdf);
    el.resetBtn.addEventListener('click', () => {
        applyState(DEFAULT_STATE);
        setStatus('Reset to default graph paper settings.');
    });

    applyState(DEFAULT_STATE);
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function readFormState() {
    const raw = {};
    Object.entries(fields).forEach(([key, input]) => {
        raw[key] = input.type === 'checkbox' ? input.checked : input.value;
    });
    return normalizeState(raw);
}

function writeField(key, value) {
    const input = fields[key];
    if (input.type === 'checkbox') {
        input.checked = Boolean(value);
    } else {
        input.value = DISPLAY_FORMAT[key] ? DISPLAY_FORMAT[key](value) : String(value);
    }
}

function applyState(state) {
    const normalized = normalizeState(state);
    Object.keys(FIELD_IDS).forEach((key) => writeField(key, normalized[key]));
    render(true);
}

function render(commitInputs) {
    const state = readFormState();
    if (commitInputs) {
        // Color sliders keep their custom values while a preset palette is shown.
        Object.keys(FIELD_IDS)
            .filter((key) => !/(Red|Green|Blue)$/.test(key))
            .forEach((key) => writeField(key, state[key]));
    }

    syncControls(state);
    const scene = buildScene(state);
    renderPreview(scene);
    updateReadout(scene, state);
    setStatus(buildStatusText(scene, state));
}

function syncControls(state) {
    const palette = getActivePalette(state);
    const groups = { minor: palette.minor.rgb, major: palette.major.rgb, accent: palette.axis.rgb };

    Object.entries(groups).forEach(([group, rgb]) => {
        const shown = ['Red', 'Green', 'Blue'].map((channel, index) => (
            state.useCustomColors ? state[`${group}${channel}`] : Math.round(rgb[index] * 255)
        ));
        const hex = `#${shown.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
        ['Red', 'Green', 'Blue'].forEach((channel, index) => {
            document.getElementById(`${group}${channel}Value`).textContent = String(shown[index]);
            document.getElementById(`${group}${channel}Hex`).textContent = hex;
        });
    });

    el.minorOpacityValue.textContent = formatFixed(state.minorOpacity, 2);
    el.majorOpacityValue.textContent = formatFixed(state.majorOpacity, 2);
    el.customColorFieldset.disabled = !state.useCustomColors;
    fields.scaleValue.disabled = !state.includeScaleNote;
    fields.scaleUnit.disabled = !state.includeScaleNote;
    el.templateSummary.textContent = TEMPLATE_META[state.template].description;

    toggleGroup(el.gridOnly, isGridTemplate(state.template));
    toggleGroup(el.dotOnly, isDotTemplate(state.template));
    toggleGroup(el.axisOnly, isAxisTemplate(state.template));
}

function toggleGroup(group, visible) {
    group.forEach((element) => element.classList.toggle('hidden', !visible));
}

function renderPreview(scene) {
    const svg = el.paperPreview;
    svg.setAttribute('viewBox', `0 0 ${round3(scene.page.width)} ${round3(scene.page.height)}`);
    svg.textContent = '';
    svg.appendChild(svgElement('rect', { x: 0, y: 0, width: scene.page.width, height: scene.page.height, class: 'preview-sheet' }));
    scene.primitives.forEach((primitive) => svg.appendChild(renderPrimitive(primitive)));
    scene.overlay.forEach((primitive) => svg.appendChild(svgElement('rect', {
        x: primitive.x,
        y: primitive.y,
        width: primitive.width,
        height: primitive.height,
        class: primitive.className
    })));
}

function renderPrimitive(primitive) {
    const color = rgbCss(primitive.color);
    if (primitive.type === 'line') {
        return svgElement('line', {
            x1: primitive.x1,
            y1: primitive.y1,
            x2: primitive.x2,
            y2: primitive.y2,
            stroke: color,
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
            stroke: color,
            'stroke-opacity': primitive.opacity,
            'stroke-width': primitive.strokeWidth
        });
    }
    if (primitive.type === 'fill') {
        return svgElement('rect', {
            x: primitive.x,
            y: primitive.y,
            width: primitive.width,
            height: primitive.height,
            fill: color,
            'fill-opacity': primitive.opacity
        });
    }
    if (primitive.type === 'text') {
        const node = svgElement('text', {
            x: primitive.x,
            y: primitive.y,
            fill: color,
            'fill-opacity': primitive.opacity,
            'font-size': primitive.size,
            'font-family': PREVIEW_FONTS[primitive.font],
            'font-weight': primitive.font === 'bold' ? '700' : '400',
            'text-anchor': primitive.anchor
        });
        node.textContent = primitive.text;
        return node;
    }
    return svgElement('circle', {
        cx: primitive.cx,
        cy: primitive.cy,
        r: primitive.radius,
        fill: color,
        'fill-opacity': primitive.opacity
    });
}

function svgElement(tagName, attributes) {
    const node = document.createElementNS(SVG_NS, tagName);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
}

function updateReadout(scene, state) {
    const scale = buildScaleSummary(state);
    el.templateBadge.textContent = TEMPLATE_META[state.template].label;
    el.paperBadge.textContent = `${PAPER_SIZES[state.paperSize].label} ${state.orientation}`;
    el.printableAreaStat.textContent = `${formatFixed(scene.metrics.printableWidthIn, 2)} x ${formatFixed(scene.metrics.printableHeightIn, 2)} in`;
    el.pitchStat.textContent = `${formatFixed(state.minorSpacingIn, 2)} in / ${formatFixed(state.minorSpacingIn * INCH_TO_PT, 1)} pt`;
    el.countStat.textContent = scene.metrics.countText;
    el.countStat.title = scene.metrics.countLabel;
    el.scaleStat.textContent = scale.primary;
    el.scaleStat.title = scale.detail;
}

function buildStatusText(scene, state) {
    const size = PAPER_SIZES[state.paperSize];
    const majorText = isGridTemplate(state.template) ? ` Major guides every ${state.majorEvery} intervals.` : '';
    const warningText = scene.warnings.length ? ` Check: ${scene.warnings.join(' ')}` : '';
    return `${TEMPLATE_META[state.template].label} on ${size.label} ${state.orientation}. Printable area ${formatFixed(scene.metrics.printableWidthIn, 2)} x ${formatFixed(scene.metrics.printableHeightIn, 2)} in.${majorText} ${buildScaleSummary(state).primary}.${warningText}`;
}

function setStatus(message) {
    el.statusLine.textContent = message;
}

function saveTemplate() {
    try {
        localStorage.setItem(SAVED_TEMPLATE_KEY, JSON.stringify(readFormState()));
        setStatus('Saved the current graph paper settings locally.');
    } catch (error) {
        console.error('Failed to save graph paper template:', error);
        setStatus('Could not save locally. Browser storage may be unavailable or full.');
    }
}

function loadTemplate() {
    try {
        const raw = localStorage.getItem(SAVED_TEMPLATE_KEY);
        if (!raw) {
            setStatus('No saved local template was found.');
            return;
        }
        applyState(JSON.parse(raw));
        setStatus('Loaded the saved local template.');
    } catch (error) {
        console.error('Failed to load saved graph paper template:', error);
        setStatus('Saved template could not be loaded.');
    }
}

function exportSettings() {
    const state = readFormState();
    const payload = { tool: 'graph-paper-generator', version: 1, exportedAt: new Date().toISOString(), settings: state };
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
        const parsed = JSON.parse(await file.text());
        applyState(parsed && parsed.settings ? parsed.settings : parsed);
        setStatus(`Imported settings from ${file.name}.`);
    } catch (error) {
        console.error('Failed to import graph paper settings:', error);
        setStatus('Settings import failed. Use a JSON file exported by this tool.');
    } finally {
        el.importSettingsInput.value = '';
    }
}

// Built from the form at click time, so a click inside the input debounce
// still exports what is on screen.
function downloadPdf() {
    try {
        const state = readFormState();
        const blob = new Blob([buildPdf(buildScene(state))], { type: 'application/pdf' });
        const filename = `graph-paper-${state.template}-${state.paperSize}-${state.orientation}.pdf`;
        triggerDownload(blob, filename);
        setStatus(`Downloaded ${filename}. Print at 100% scale for the intended spacing.`);
    } catch (error) {
        console.error('PDF generation failed:', error);
        setStatus('PDF generation failed. Check your settings and try again.');
    }
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rgbCss(color) {
    return `rgb(${color.map((channel) => Math.round(channel * 255)).join(', ')})`;
}

function round3(value) {
    return Number.parseFloat(value.toFixed(3));
}
