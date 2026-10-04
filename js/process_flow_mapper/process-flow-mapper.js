// DOM controller for the process flow mapper. The only module here that reads
// the form or touches the page, apart from flow-panels.js, which builds the
// result panels it is handed.

import * as parser from './flow-parse.js';
import * as graphs from './flow-graph.js';
import * as solver from './flow-solve.js';
import * as simulator from './flow-simulate.js';
import * as parallel from './flow-parallel.js';
import * as router from './flow-route.js';
import * as layouts from './flow-layout.js';
import * as projects from './flow-projects.js';
import { buildModel, headline, headlineChanges, summarySentence, summaryLine, footnoteText, formatDuration, formatPercent } from './flow-model.js';
import { renderFlow, tintLevels, mix, stepOrder, PALETTES } from './flow-render.js';
import { fillHeadline, fillBars, fillTables, fillSpread, tableToCsv } from './flow-panels.js';
import { attachDrag } from './flow-drag.js';
import { toMermaid } from './flow-mermaid.js';
import { createSpreadRunner } from './flow-sim-runner.js';
import {
    serializeSvg, svgToPngBlob, downloadBlob, fileStem, pngSize, PNG_SCALES, loadFontDataUrl, embedFont
} from './flow-export.js';
import { PRESETS, PRESETS_BY_ID } from './presets.js';

const el = (id) => document.getElementById(id);
const TEXT_DEBOUNCE_MS = 120;
const DELETE_ARM_MS = 4000;
const FONT = "'Space Grotesk', system-ui, 'Segoe UI', Arial, sans-serif";

// Everything a project remembers besides the step list.
const FIELD_IDS = ['titleInput', 'hoursPreset', 'hoursCustom', 'daysPerWeek', 'tint', 'unit', 'direction', 'showShares', 'showBadges', 'wide',
    'fontSize', 'zoom', 'seed', 'pngScale', 'exportTheme', 'exportTransparent'];
const CLAMPED_IDS = ['hoursCustom', 'daysPerWeek', 'fontSize', 'seed'];
const QUIET_IDS = ['pngScale', 'exportTheme', 'exportTransparent', 'zoom', 'wide'];
const STARTER_TEXT = '// Lane: Step {touch, wait} -> Next step\nTeam: (Start) -> Do the work\nTeam: Do the work {30 min, wait 1 h} -> (Done)\nTeam: (Done)\n';

let model = null;
let renderCount = 0;
let store = projects.emptyStore();
let storageProblem = null;
let defaultFields = {};
let deleteTimer = null;
let textTimer = null;
let picked = null;
// The step that is the map's one tab stop.
let rovingStep = null;
// The model of the last save, kept until the save changes, for "since last save".
let baseline = { key: null, model: null };

// Big maps are walked in a worker; the page draws again when the spread for the map on screen is ready.
const runSpread = createSpreadRunner((key) => {
    if (key === null || (model && model.spreadKey === key)) render();
}, { workerUrl: new URL('./flow-sim-worker.js', import.meta.url) });

// Text is measured on a canvas, so boxes and labels fit what is actually drawn.
const ruler = document.createElement('canvas').getContext('2d');
function measure(text, size, weight = 400) {
    if (!ruler) return text.length * size * 0.6;
    ruler.font = `${weight} ${size}px ${FONT}`;
    return ruler.measureText(text).width;
}

/** Read a number field once. Blank or unparseable falls back to the engine default. */
function numberField(id) {
    const raw = el(id).value.trim();
    if (raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
}

/** Settings from a set of field values: the form's, or a saved project's. */
function settingsFromFields(fields) {
    const number = (id) => {
        const raw = String(fields[id] == null ? '' : fields[id]).trim();
        return raw === '' || !Number.isFinite(Number(raw)) ? undefined : Number(raw);
    };
    const title = String(fields.titleInput || '').trim();
    return {
        model: {
            title,
            hoursPerDay: fields.hoursPreset === 'custom' ? number('hoursCustom') : Number(fields.hoursPreset),
            daysPerWeek: number('daysPerWeek'),
            unit: fields.unit,
            fontSize: number('fontSize'),
            showShares: fields.showShares !== false,
            direction: fields.direction === 'down' ? 'down' : 'across',
            seed: number('seed')
        },
        view: {
            title,
            tint: fields.tint,
            showBadges: fields.showBadges !== false
        }
    };
}

const readSettings = () => settingsFromFields(captureFields());

const currentPalette = () => (document.documentElement.getAttribute('data-theme') === 'light' ? PALETTES.light : PALETTES.dark);

/** Set text only when it changes, so a live region is not read out again on every redraw. */
function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
}

function fillList(list, items) {
    const lines = items.map((item) => (item.line ? `Line ${item.line}: ${item.message}` : item.message));
    if (lines.join('\n') === [...list.children].map((li) => li.textContent).join('\n')) return;
    list.replaceChildren(...lines.map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
    }));
}

const tables = () => ({
    lanes: el('laneTable'), phases: el('phaseTable'), ends: el('endTable'), steps: el('stepTable'), exits: el('exitTable'),
    handoffs: el('handoffTable'), sipoc: el('sipocTable')
});

const spreadParts = () => ({ stats: el('spreadStats'), chart: el('spreadChart'), note: el('spreadNote'), table: el('spreadTable'), tableBox: el('spreadTableBox') });

function clearOutput() {
    el('diagramHost').replaceChildren();
    el('headline').replaceChildren();
    el('bars').replaceChildren();
    el('barsEmpty').hidden = true;
    for (const table of Object.values(tables())) {
        table.tHead.replaceChildren();
        table.tBodies[0].replaceChildren();
    }
    setText(el('resultStatus'), '');
    setText(el('exportStatus'), '');
    el('compareNote').hidden = true;
    el('spreadCard').hidden = true;
    el('sipocBlock').hidden = true;
}

/** The last save as a model, rebuilt only when the save itself changes. Null when the form matches it. */
function savedModel() {
    const active = projects.activeProject(store);
    if (!active) return null;
    const saved = JSON.stringify(projects.cleanState(active.saved));
    if (saved === JSON.stringify(projects.cleanState(captureState()))) return null;
    if (baseline.key !== saved) {
        const fields = { ...defaultFields, ...active.saved.fields };
        // Only the saved headline is compared, so the saved copy is not simulated.
        baseline = { key: saved, model: buildModel(active.saved.text, settingsFromFields(fields).model, measure, false) };
    }
    return baseline.model;
}

function updatePngNote() {
    const note = el('pngSizeNote');
    if (!model || !model.ok) { note.textContent = ''; return; }
    const size = pngSize(model.layout.width, model.layout.height, Number(el('pngScale').value));
    note.textContent = size.ok
        ? `The map is ${Math.round(model.layout.width)} x ${Math.round(model.layout.height)} px, so the PNG will be ${size.width} x ${size.height} px.`
        : `${size.width} x ${size.height} px is larger than a browser canvas can hold. Pick a lower resolution.`;
}

// Fitting never shrinks the map below this, so its text stays readable; past it the panel scrolls.
const FIT_FLOOR = 0.6;

/** Show the map at the chosen size. Sizes are attributes: a style attribute is not allowed here. */
function applyZoom() {
    el('flowLayout').classList.toggle('wide', el('wide').checked);
    const svg = el('diagramHost').querySelector('svg');
    if (!svg || !model || !model.ok) return;
    const zoom = el('zoom').value;
    let factor = (Number(zoom) || 100) / 100;
    if (zoom === 'fit') {
        const room = el('diagramScroll').clientWidth;
        factor = Math.min(1, Math.max(FIT_FLOOR, room > 0 ? room / model.layout.width : 1));
    }
    svg.setAttribute('width', String(Math.floor(model.layout.width * factor)));
    svg.setAttribute('height', String(Math.floor(model.layout.height * factor)));
}

/** Ring one step on the map and mark its bar. Picking it again, or null, clears it. */
function pick(index, reveal = true) {
    picked = index === picked ? null : index;
    const host = el('diagramHost');
    for (const g of host.querySelectorAll('.flow-step')) {
        g.classList.toggle('picked', picked !== null && Number(g.getAttribute('data-node')) === picked);
    }
    for (const button of el('bars').querySelectorAll('.bar-button')) {
        button.setAttribute('aria-pressed', String(picked !== null && Number(button.getAttribute('data-node')) === picked));
    }
    if (picked !== null && reveal) {
        const g = host.querySelector(`.flow-step[data-node="${picked}"]`);
        if (g) g.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
}

function render() {
    renderCount += 1;
    const settings = readSettings();
    el('hoursCustomGroup').hidden = el('hoursPreset').value !== 'custom';
    model = buildModel(el('flowText').value, settings.model, measure, runSpread);

    for (const id of ['downloadSvg', 'downloadPng', 'copyMermaid']) el(id).disabled = !model.ok;
    el('errorBox').hidden = model.ok;
    fillList(el('errorList'), model.errors);
    el('warningBox').hidden = model.warnings.length === 0;
    fillList(el('warningList'), model.warnings);

    // An input error clears everything, so no stale result sits beside it.
    if (!model.ok) {
        clearOutput();
    } else {
        el('diagramHost').replaceChildren(renderFlow(document, model, { ...settings.view, interactive: true, focusStep: rovingStep }, currentPalette(), measure));
        const changes = headlineChanges(model, savedModel());
        fillHeadline(el('headline'), model, changes);
        el('compareNote').hidden = changes.length === 0;
        el('spreadCard').hidden = !fillSpread(spreadParts(), model);
        const bars = fillBars(el('bars'), model, (index) => pick(index));
        el('barsEmpty').hidden = bars > 0;
        fillTables(tables(), model);
        el('phaseBlock').hidden = model.layout.phases.length === 0;
        el('handoffBlock').hidden = model.graph.counts.handoffs === 0;
        el('sipocBlock').hidden = !model.sipoc;
        setText(el('resultStatus'), summarySentence(model));
        el('resultStatus').classList.toggle('withheld', !model.result.ok);
        applyZoom();
        // The picked step survives a redraw while it still exists.
        const keep = picked !== null && picked < model.graph.nodes.length ? picked : null;
        picked = null;
        if (keep !== null) pick(keep, false);
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
    return renderFlow(document, model, view, palette, measure);
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
        const { width, height } = model.layout;
        const scale = Number(el('pngScale').value);
        const font = await loadFontDataUrl();
        const blob = await svgToPngBlob(embedFont(svgText, font), width, height, scale);
        const size = pngSize(width, height, scale);
        downloadBlob(blob, `${stem}.png`);
        const fallback = font ? '' : '. The page font could not be read, so the text is in your system font';
        status.textContent = `Saved ${stem}.png at ${size.width} x ${size.height} px${fallback}`;
    } catch (e) {
        status.textContent = e.message;
    }
}

/** Put the map on the clipboard as Mermaid text, or save it as a file when the clipboard is refused. */
async function copyMermaid() {
    if (!model || !model.ok) return;
    const status = el('exportStatus');
    const text = toMermaid(model, el('titleInput').value.trim());
    try {
        await navigator.clipboard.writeText(text);
        status.textContent = 'Copied the map as Mermaid text. Mermaid draws it its own way, so lanes become boxes around their steps.';
    } catch (e) {
        const name = `${fileStem(el('titleInput').value)}.mmd`;
        downloadBlob(new Blob([text], { type: 'text/plain' }), name);
        status.textContent = `The clipboard was not available, so the Mermaid text was saved as ${name}`;
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
    el('projectImport').disabled = projects.isFull(store);

    const count = `${store.projects.length} of ${projects.MAX_PROJECTS} projects.`;
    let message = dirty ? 'Unsaved changes, kept automatically. Revert returns to the last save.' : 'Saved.';
    if (storageProblem === 'unavailable') message = 'This browser is not allowing storage, so nothing will be kept once the page closes.';
    if (storageProblem === 'full') message = 'The browser refused to store the projects. Changes are not being kept.';
    if (storageProblem === 'corrupt') message = `Stored projects could not be read and were reset. ${message}`;
    setText(el('projectStatus'), `${message} ${count}`);
}

/** Keep the active project's draft in step with the form. */
function autosave() {
    const active = projects.activeProject(store);
    if (!active) return;
    if (projects.setDraft(active, captureState(), Date.now())) writeStore();
    updateProjectBar();
}

/** Put the form into the active draft now, so an edit inside the typing debounce is not left behind. */
function flushDraft() {
    clearTimeout(textTimer);
    const active = projects.activeProject(store);
    if (active) projects.setDraft(active, captureState(), Date.now());
}

function showLesson(id) {
    const preset = PRESETS_BY_ID[id];
    el('presetSelect').value = preset ? id : '';
    el('presetLesson').hidden = !preset;
    el('presetLesson').textContent = preset ? preset.lesson : '';
}

function openProject(id) {
    disarmDelete();
    clearTimeout(textTimer);
    store.activeId = id;
    applyState(projects.activeProject(store).draft);
    showLesson('');
    picked = null;
    rovingStep = null;
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

function exportProject() {
    flushDraft();
    const active = projects.activeProject(store);
    const name = `${fileStem(active.name)}.flowmap.json`;
    downloadBlob(new Blob([projects.projectToFile(active)], { type: 'application/json' }), name);
    el('projectFileStatus').textContent = `Saved ${name}. It holds this project as it is on screen now.`;
}

async function importProject(file) {
    const status = el('projectFileStatus');
    if (!file) return;
    if (file.size > projects.MAX_FILE_BYTES) {
        status.textContent = 'That file is too large to be a process flow project.';
        return;
    }
    let read;
    try {
        read = projects.projectFromFile(await file.text());
    } catch (e) {
        read = { ok: false, message: 'That file could not be read' };
    }
    if (!read.ok) {
        status.textContent = `${read.message}.`;
        return;
    }
    flushDraft();
    const project = projects.addProject(store, projects.uniqueName(store, read.name), read.state, Date.now());
    if (!project) {
        status.textContent = `${projects.MAX_PROJECTS} projects are already stored. Delete one to import another.`;
        return;
    }
    openProject(project.id);
    status.textContent = `Imported "${project.name}" as a new project.`;
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
    projects.addProject(store, projects.nextName(store), { text: first.text, fields: { ...defaultFields, titleInput: first.title } }, Date.now());
    return true;
}

// --- wiring -------------------------------------------------------------

function applyPreset(id) {
    const preset = PRESETS_BY_ID[id];
    if (!preset) { showLesson(''); return; }
    el('flowText').value = preset.text;
    el('titleInput').value = preset.title;
    picked = null;
    rovingStep = null;
    showLesson(id);
    render();
}

function init() {
    const presetSelect = el('presetSelect');
    presetSelect.append(new Option('Choose an example', ''), ...PRESETS.map((p) => new Option(p.label, p.id)));
    el('pngScale').append(...PNG_SCALES.map((s) => new Option(s.label, String(s.scale), s.id === 'standard', s.id === 'standard')));
    defaultFields = captureFields();

    const fresh = loadProjects();
    applyState(projects.activeProject(store).draft);
    showLesson(fresh ? PRESETS[0].id : '');

    presetSelect.addEventListener('input', () => applyPreset(presetSelect.value));

    el('flowText').addEventListener('input', () => {
        // Typing over an example releases it, so the lesson never describes text it no longer matches.
        showLesson('');
        clearTimeout(textTimer);
        textTimer = setTimeout(render, TEXT_DEBOUNCE_MS);
    });

    // A select fires both input and change; listening to input alone renders once.
    for (const id of FIELD_IDS.filter((f) => !QUIET_IDS.includes(f))) el(id).addEventListener('input', () => render());
    el('pngScale').addEventListener('input', () => { updatePngNote(); autosave(); });
    el('zoom').addEventListener('input', () => { applyZoom(); autosave(); });
    el('wide').addEventListener('input', () => { applyZoom(); autosave(); });
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

    // Each table saves as CSV from the button in its card.
    document.querySelector('.diagram-panel').addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('.csv-btn') : null;
        if (!button) return;
        const name = `${fileStem(el('titleInput').value)}-${button.getAttribute('data-name')}.csv`;
        downloadBlob(new Blob([tableToCsv(el(button.getAttribute('data-table')))], { type: 'text/csv' }), name);
        el('exportStatus').textContent = `Saved ${name}`;
    });

    // Rows pasted from a spreadsheet are turned into step lines on the way in.
    el('flowText').addEventListener('paste', (event) => {
        const pasted = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
        const converted = parser.tableToFlow(pasted);
        if (!converted) return;
        event.preventDefault();
        const box = el('flowText');
        box.focus();
        // insertText keeps the paste on the undo stack; setRangeText is the fallback where it is missing.
        const inserted = typeof document.execCommand === 'function' && document.execCommand('insertText', false, converted.text);
        if (!inserted) box.setRangeText(converted.text, box.selectionStart, box.selectionEnd, 'end');
        clearTimeout(textTimer);
        el('pasteStatus').textContent = `Turned ${converted.rows} spreadsheet row${converted.rows === 1 ? '' : 's'} into step lines.`;
        showLesson('');
        render();
    });

    // Moving a step to another lane, or a lane up or down, rewrites the text.
    const refocus = (selector) => {
        const target = el('diagramHost').querySelector(selector);
        if (target) target.focus({ preventScroll: true });
    };
    const setFlow = (text) => {
        el('flowText').value = text;
        showLesson('');
        render();
    };
    attachDrag(el('diagramHost'), {
        getModel: () => model,
        moveStep: (stepIndex, laneIndex) => {
            const step = model.graph.nodes[stepIndex];
            if (step.lane === laneIndex) return;
            setFlow(parser.setStepLane(el('flowText').value, step.name, model.graph.lanes[laneIndex].name));
            refocus(`.flow-step[data-node="${stepIndex}"]`);
        },
        moveLane: (laneIndex, toIndex) => {
            if (laneIndex === toIndex) return;
            const order = model.graph.lanes.map((l) => l.name);
            order.splice(toIndex, 0, order.splice(laneIndex, 1)[0]);
            setFlow(parser.setLaneOrder(el('flowText').value, order));
            refocus(`.flow-lane-label[data-lane="${toIndex}"]`);
        },
        focusStep: (index) => refocus(`.flow-step[data-node="${index}"]`)
    });

    // Whichever step has focus becomes the tab stop, however it got there.
    el('diagramHost').addEventListener('focusin', (event) => {
        const g = event.target instanceof Element ? event.target.closest('.flow-step') : null;
        if (!g) return;
        rovingStep = Number(g.getAttribute('data-node'));
        for (const other of el('diagramHost').querySelectorAll('.flow-step')) other.setAttribute('tabindex', other === g ? '0' : '-1');
    });

    el('downloadSvg').addEventListener('click', () => exportDiagram('svg'));
    el('downloadPng').addEventListener('click', () => exportDiagram('png'));
    el('copyMermaid').addEventListener('click', copyMermaid);

    // A step clicked on the map marks its bar, and the other way round.
    el('diagramHost').addEventListener('click', (event) => {
        const g = event.target instanceof Element ? event.target.closest('.flow-step') : null;
        if (g) pick(Number(g.getAttribute('data-node')), false);
    });

    el('projectSelect').addEventListener('input', (event) => {
        flushDraft();
        openProject(event.target.value);
    });
    el('projectNew').addEventListener('click', newProject);
    el('projectDelete').addEventListener('click', deleteProject);
    el('projectExport').addEventListener('click', exportProject);
    el('projectImport').addEventListener('click', () => el('projectFile').click());
    el('projectFile').addEventListener('change', (event) => {
        const input = event.target;
        // Cleared afterwards so choosing the same file twice still fires.
        importProject(input.files[0]).finally(() => { input.value = ''; });
    });
    el('projectSave').addEventListener('click', () => {
        flushDraft();
        projects.commitProject(projects.activeProject(store), Date.now());
        writeStore();
        // The comparison is against the save, so saving clears it.
        render();
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

    // A fitted map follows the panel when the window changes size.
    new ResizeObserver(() => applyZoom()).observe(el('diagramScroll'));

    // Closing the tab inside the typing debounce would otherwise drop the last keystrokes.
    window.addEventListener('pagehide', () => { flushDraft(); writeStore(); });

    new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Boxes are sized from measured text, and the web font may arrive after the first draw.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render());

    writeStore();
    render();
}

// Exposed for the Playwright spec, which drives the pure functions directly.
window.ProcessFlowMapper = {
    parser,
    graphs,
    solver,
    simulator,
    parallel,
    toMermaid,
    runSpread,
    createSpreadRunner,
    router,
    layouts,
    projects,
    buildModel,
    headline,
    headlineChanges,
    tableToCsv,
    summarySentence,
    summaryLine,
    footnoteText,
    formatDuration,
    formatPercent,
    renderFlow,
    tintLevels,
    stepOrder,
    mix,
    serializeSvg,
    svgToPngBlob,
    pngSize,
    fileStem,
    measure,
    PALETTES,
    PRESETS,
    getModel: () => model,
    getStore: () => store,
    getRenderCount: () => renderCount
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
