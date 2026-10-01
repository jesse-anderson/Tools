// DOM controller for the Sankey diagram builder. The only module here that
// reads the form or touches the page; everything it calls is pure, apart from
// sankey-drag.js, which owns the pointer and key handling on the diagram.

import * as parser from './sankey-parse.js';
import * as engine from './sankey-engine.js';
import * as projects from './sankey-projects.js';
import { buildModel, balanceSummary } from './sankey-model.js';
import { renderSankey, nodeColors, PALETTES } from './sankey-render.js';
import { serializeSvg, svgToPngBlob, downloadBlob, fileStem, pngSize, PNG_SCALES } from './sankey-export.js';
import { PRESETS, PRESETS_BY_ID } from './presets.js';
import { attachDrag } from './sankey-drag.js';

const el = (id) => document.getElementById(id);
const TEXT_DEBOUNCE_MS = 120;
const DELETE_ARM_MS = 4000;

// Everything a project remembers besides the flow list.
const FIELD_IDS = ['titleInput', 'unitInput', 'tolerance', 'showValues', 'showPercent', 'showLinkValues',
    'showMissing', 'diagramWidth', 'diagramHeight', 'nodeWidth', 'nodePadding', 'align', 'order', 'fontSize', 'decimals',
    'nodeColor', 'linkColor', 'linkOpacity', 'pngScale', 'exportTheme', 'exportTransparent'];
const CLAMPED_IDS = ['tolerance', 'diagramWidth', 'diagramHeight', 'nodeWidth', 'nodePadding', 'fontSize', 'linkOpacity'];
const STARTER_TEXT = '// Source [amount] Target\nFeed [100] Process\nProcess [100] Product\n';

let model = null;
let renderCount = 0;
let store = projects.emptyStore();
let storageProblem = null;
let defaultFields = {};
let deleteTimer = null;
let textTimer = null;

/** Read a number field once. Blank or unparseable falls back to the engine default. */
function numberField(id) {
    const raw = el(id).value.trim();
    if (raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
}

function readSettings() {
    const tolerancePct = numberField('tolerance');
    const opacityPct = numberField('linkOpacity');
    const fontSize = numberField('fontSize');
    const decimals = el('decimals').value;
    return {
        layout: {
            title: el('titleInput').value.trim(),
            tolerance: tolerancePct === undefined ? undefined : tolerancePct / 100,
            width: numberField('diagramWidth'),
            height: numberField('diagramHeight'),
            nodeWidth: numberField('nodeWidth'),
            nodePadding: numberField('nodePadding'),
            align: el('align').value,
            order: el('order').value
        },
        view: {
            title: el('titleInput').value.trim(),
            unit: el('unitInput').value.trim(),
            decimals: decimals === 'auto' ? 'auto' : Number(decimals),
            showValues: el('showValues').checked,
            showPercent: el('showPercent').checked,
            showLinkValues: el('showLinkValues').checked,
            showMissing: el('showMissing').checked,
            nodeColor: el('nodeColor').value,
            linkColor: el('linkColor').value,
            linkOpacity: Math.min(1, Math.max(0.1, (opacityPct === undefined ? 45 : opacityPct) / 100)),
            fontSize: Math.min(24, Math.max(8, fontSize === undefined ? 12 : fontSize))
        }
    };
}

const currentPalette = () => (document.documentElement.getAttribute('data-theme') === 'light' ? PALETTES.light : PALETTES.dark);

function fillList(list, items) {
    list.replaceChildren(...items.map((item) => {
        const li = document.createElement('li');
        li.textContent = item.line ? `Line ${item.line}: ${item.message}` : item.message;
        return li;
    }));
}

function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

function fillTables(view) {
    const { graph, balance } = model;
    const unit = view.unit ? ` ${view.unit}` : '';
    const fmt = (v) => engine.formatValue(v, view.decimals);

    const totals = [
        ['Inputs', `${fmt(balance.totalIn)}${unit}`],
        ['Outputs', `${fmt(balance.totalOut)}${unit}`],
        ['Inputs minus outputs', `${fmt(balance.residual)}${unit}`],
        ['Closure', balance.totalIn > 0 ? engine.formatPercent(balance.closure) : 'n/a'],
        ['Tolerance used', engine.formatPercent(balance.tolerance)]
    ];
    el('totals').replaceChildren(...totals.flatMap(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
    }));

    const boundary = { input: 'System input', output: 'System output' };
    el('balanceTable').tBodies[0].replaceChildren(...balance.nodes.map((b) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = b.name;
        const gap = `${fmt(Math.abs(b.residual))}${unit} (${engine.formatPercent(Math.abs(b.relative))})`;
        let status = boundary[b.role];
        if (b.role === 'internal') {
            if (!b.balanced) status = `${b.residual > 0 ? 'Missing outflow' : 'Missing inflow'} ${gap}`;
            else if (b.tolerated) status = `Balances within tolerance, off by ${gap}`;
            else status = 'Balances';
        }
        if (!b.balanced) tr.className = 'unbalanced';
        else if (b.tolerated) tr.className = 'tolerated';
        tr.append(
            th,
            cell(status, 'balance-status'),
            cell(b.role === 'input' ? '' : fmt(b.inflow), 'num'),
            cell(b.role === 'output' ? '' : fmt(b.outflow), 'num'),
            cell(b.role === 'internal' ? fmt(b.residual) : '', 'num')
        );
        return tr;
    }));

    el('flowsTable').tBodies[0].replaceChildren(...graph.links.map((link) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = graph.nodes[link.source].name;
        tr.append(
            th,
            cell(`${graph.nodes[link.target].name}${link.recycle ? ' (recycle)' : ''}`),
            cell(fmt(link.value), 'num'),
            cell(balance.totalIn > 0 ? engine.formatPercent(link.value / balance.totalIn) : 'n/a', 'num')
        );
        return tr;
    }));
}

function clearOutput() {
    el('diagramHost').replaceChildren();
    el('totals').replaceChildren();
    el('balanceTable').tBodies[0].replaceChildren();
    el('flowsTable').tBodies[0].replaceChildren();
    el('resultStatus').textContent = '';
    el('exportStatus').textContent = '';
}

function updatePngNote() {
    const note = el('pngSizeNote');
    if (!model || !model.ok) { note.textContent = ''; return; }
    const { width, height } = model.layout.options;
    const size = pngSize(width, height, Number(el('pngScale').value));
    note.textContent = size.ok
        ? `The PNG will be ${size.width} x ${size.height} px.`
        : `${size.width} x ${size.height} px is larger than a browser canvas can hold. Pick a lower resolution.`;
}

/**
 * Rebuild everything from the form. previewPositions is set only while a node
 * is being dragged: the diagram follows the pointer and nothing else changes.
 */
function render(previewPositions = null) {
    renderCount += 1;
    const settings = readSettings();
    model = buildModel(el('flowText').value, settings.layout, previewPositions);

    if (previewPositions) {
        if (model.ok) {
            el('diagramHost').replaceChildren(renderSankey(document, model, { ...settings.view, interactive: true }, currentPalette()));
        }
        return;
    }

    el('downloadSvg').disabled = !model.ok;
    el('downloadPng').disabled = !model.ok;
    el('resetPositions').disabled = Object.keys(model.parsed.positions).length === 0;

    el('errorBox').hidden = model.ok;
    fillList(el('errorList'), model.errors);
    el('warningBox').hidden = model.warnings.length === 0;
    fillList(el('warningList'), model.warnings);

    // An input error clears everything, so no stale diagram sits beside it.
    if (!model.ok) {
        clearOutput();
    } else {
        el('diagramHost').replaceChildren(renderSankey(document, model, { ...settings.view, interactive: true }, currentPalette()));
        fillTables(settings.view);
        el('resultStatus').textContent = balanceSummary(model.balance, settings.view.unit, settings.view.decimals);
        el('resultStatus').classList.toggle('unbalanced', !model.balance.balanced);
    }
    updatePngNote();
    autosave();
}

// --- export -------------------------------------------------------------

function exportSvgElement() {
    const settings = readSettings();
    const theme = el('exportTheme').value;
    const palette = theme === 'current' ? currentPalette() : PALETTES[theme];
    const view = { ...settings.view, background: !el('exportTransparent').checked, interactive: false };
    return renderSankey(document, model, view, palette);
}

async function exportDiagram(kind) {
    if (!model || !model.ok) return;
    const status = el('exportStatus');
    const stem = fileStem(el('titleInput').value);
    try {
        const svgText = serializeSvg(exportSvgElement());
        if (kind === 'svg') {
            downloadBlob(new Blob([svgText], { type: 'image/svg+xml' }), `${stem}.svg`);
            status.textContent = `Saved ${stem}.svg`;
            return;
        }
        const { width, height } = model.layout.options;
        const scale = Number(el('pngScale').value);
        const blob = await svgToPngBlob(svgText, width, height, scale);
        const size = pngSize(width, height, scale);
        downloadBlob(blob, `${stem}.png`);
        status.textContent = `Saved ${stem}.png at ${size.width} x ${size.height} px`;
    } catch (e) {
        status.textContent = e.message;
    }
}

// --- projects -----------------------------------------------------------

function captureFields() {
    const fields = {};
    for (const id of FIELD_IDS) {
        const input = el(id);
        fields[id] = input.type === 'checkbox' ? input.checked : input.value;
    }
    return fields;
}

const captureState = () => ({ text: el('flowText').value, fields: captureFields() });

function applyState(state) {
    el('flowText').value = state.text;
    for (const id of FIELD_IDS) {
        const input = el(id);
        const value = Object.prototype.hasOwnProperty.call(state.fields, id) ? state.fields[id] : defaultFields[id];
        if (input.type === 'checkbox') input.checked = value === true;
        else input.value = String(value);
        // A stored select value that no longer exists falls back to the default.
        if (input.tagName === 'SELECT' && input.selectedIndex < 0) input.value = defaultFields[id];
    }
}

function writeStore() {
    if (storageProblem === 'unavailable') return;
    if (!projects.persistStore(window.localStorage, store)) storageProblem = 'full';
}

function disarmDelete() {
    clearTimeout(deleteTimer);
    deleteTimer = null;
    const button = el('projectDelete');
    button.textContent = 'Delete';
    button.removeAttribute('data-armed');
}

function updateProjectBar() {
    const active = projects.activeProject(store);
    const select = el('projectSelect');
    select.replaceChildren(...store.projects.map((p) => new Option(p.name, p.id, false, p.id === store.activeId)));
    if (document.activeElement !== el('projectName')) el('projectName').value = active.name;

    const dirty = projects.isDirty(active);
    el('projectSave').disabled = !dirty;
    el('projectRevert').disabled = !dirty;
    el('projectNew').disabled = projects.isFull(store);

    const count = `${store.projects.length} of ${projects.MAX_PROJECTS} projects.`;
    let message = dirty ? 'Unsaved changes, kept automatically. Revert returns to the last save.' : 'Saved.';
    if (storageProblem === 'unavailable') message = 'This browser is not allowing storage, so nothing will be kept once the page closes.';
    if (storageProblem === 'full') message = 'The browser refused to store the projects. Changes are not being kept.';
    if (storageProblem === 'corrupt') message = `Stored projects could not be read and were reset. ${message}`;
    el('projectStatus').textContent = `${message} ${count}`;
}

/** Keep the active project's draft in step with the form. */
function autosave() {
    const active = projects.activeProject(store);
    if (!active) return;
    if (projects.setDraft(active, captureState(), Date.now())) writeStore();
    updateProjectBar();
}

/**
 * Put the form into the active draft now. Typing is debounced, so without this
 * an edit made just before switching project would be left behind.
 */
function flushDraft() {
    clearTimeout(textTimer);
    const active = projects.activeProject(store);
    if (active) projects.setDraft(active, captureState(), Date.now());
}

function openProject(id) {
    disarmDelete();
    clearTimeout(textTimer);
    store.activeId = id;
    applyState(projects.activeProject(store).draft);
    el('presetSelect').value = '';
    writeStore();
    render();
}

function newProject() {
    flushDraft();
    const state = { text: STARTER_TEXT, fields: { ...defaultFields } };
    const project = projects.addProject(store, projects.nextName(store), state, Date.now());
    if (project) openProject(project.id);
}

function deleteProject() {
    const button = el('projectDelete');
    if (!button.hasAttribute('data-armed')) {
        // Two clicks, so a project is never lost to one stray one.
        button.setAttribute('data-armed', '');
        button.textContent = 'Confirm delete';
        deleteTimer = setTimeout(disarmDelete, DELETE_ARM_MS);
        return;
    }
    projects.removeProject(store, store.activeId);
    if (!store.projects.length) {
        projects.addProject(store, projects.nextName(store), { text: STARTER_TEXT, fields: { ...defaultFields } }, Date.now());
    }
    openProject(store.activeId);
}

function loadProjects() {
    let loaded;
    try {
        loaded = projects.loadStore(window.localStorage);
    } catch (e) {
        loaded = { store: projects.emptyStore(), problem: 'unavailable' };
    }
    store = loaded.store;
    storageProblem = loaded.problem;
    if (store.projects.length) return false;

    const first = PRESETS[0];
    const fields = { ...defaultFields, titleInput: first.title, unitInput: first.unit };
    projects.addProject(store, projects.nextName(store), { text: first.text, fields }, Date.now());
    return true;
}

// --- wiring -------------------------------------------------------------

function applyPreset(id) {
    const preset = PRESETS_BY_ID[id];
    if (!preset) return;
    el('flowText').value = preset.text;
    el('titleInput').value = preset.title;
    el('unitInput').value = preset.unit;
    render();
}

function setFlowText(text) {
    el('flowText').value = text;
    el('presetSelect').value = '';
    render();
}

function init() {
    const presetSelect = el('presetSelect');
    presetSelect.append(new Option('Choose an example', ''), ...PRESETS.map((p) => new Option(p.label, p.id)));
    el('pngScale').append(...PNG_SCALES.map((s) => new Option(s.label, String(s.scale), s.id === 'standard', s.id === 'standard')));
    defaultFields = captureFields();

    const fresh = loadProjects();
    applyState(projects.activeProject(store).draft);
    presetSelect.value = fresh ? PRESETS[0].id : '';

    presetSelect.addEventListener('input', () => applyPreset(presetSelect.value));

    el('flowText').addEventListener('input', () => {
        // Typing over an example releases it, so the selector never names text it no longer matches.
        presetSelect.value = '';
        clearTimeout(textTimer);
        textTimer = setTimeout(render, TEXT_DEBOUNCE_MS);
    });

    // A select fires both input and change; listening to input alone renders once.
    const live = FIELD_IDS.filter((id) => !['pngScale', 'exportTheme', 'exportTransparent'].includes(id));
    for (const id of live) el(id).addEventListener('input', () => render());
    el('pngScale').addEventListener('input', () => { updatePngNote(); autosave(); });
    el('exportTheme').addEventListener('input', autosave);
    el('exportTransparent').addEventListener('input', autosave);

    // Out-of-range numbers are clamped by the engine. Writing the clamped value
    // back keeps the field showing the number that was actually used.
    for (const id of CLAMPED_IDS) {
        el(id).addEventListener('change', (event) => {
            const input = event.target;
            const value = Number(input.value);
            if (input.value.trim() === '' || !Number.isFinite(value)) { input.value = input.defaultValue; render(); return; }
            const clamped = Math.min(Number(input.max), Math.max(Number(input.min), value));
            if (clamped !== value) { input.value = String(clamped); render(); }
        });
    }

    el('downloadSvg').addEventListener('click', () => exportDiagram('svg'));
    el('downloadPng').addEventListener('click', () => exportDiagram('png'));
    el('resetPositions').addEventListener('click', () => setFlowText(parser.clearPositionLines(el('flowText').value)));

    el('projectSelect').addEventListener('input', (event) => {
        flushDraft();
        openProject(event.target.value);
    });
    el('projectNew').addEventListener('click', newProject);
    el('projectDelete').addEventListener('click', deleteProject);
    el('projectSave').addEventListener('click', () => {
        flushDraft();
        const active = projects.activeProject(store);
        projects.commitProject(active, Date.now());
        writeStore();
        updateProjectBar();
    });
    el('projectRevert').addEventListener('click', () => {
        projects.revertProject(projects.activeProject(store), Date.now());
        openProject(store.activeId);
    });
    el('projectName').addEventListener('input', (event) => {
        projects.activeProject(store).name = projects.cleanName(event.target.value);
        writeStore();
        updateProjectBar();
    });
    el('projectName').addEventListener('change', (event) => {
        event.target.value = projects.activeProject(store).name;
    });

    attachDrag(el('diagramHost'), {
        getModel: () => model,
        preview: (positions) => render(positions),
        commit: (name, position) => setFlowText(parser.setPositionLine(el('flowText').value, name, position))
    });

    // Closing the tab inside the typing debounce would otherwise drop the last keystrokes.
    window.addEventListener('pagehide', () => { flushDraft(); writeStore(); });

    new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    writeStore();
    render();
}

// Exposed for the Playwright spec, which drives the pure functions directly.
window.SankeyDiagram = {
    parser,
    engine,
    projects,
    buildModel,
    balanceSummary,
    renderSankey,
    nodeColors,
    serializeSvg,
    pngSize,
    fileStem,
    PALETTES,
    PRESETS,
    getModel: () => model,
    getStore: () => store,
    getRenderCount: () => renderCount
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
