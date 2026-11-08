// DOM controller for the Ishikawa fishbone diagram. The only module here that
// reads the form; everything it calls is pure apart from the outline, the
// diagram view and the panels, which each own their part of the page.
// Solo mode makes no network request apart from the page's own files.

import { LIMITS } from './fishbone-limits.js';
import * as ops from './fishbone-ops.js';
import * as outline from './fishbone-outline.js';
import * as mermaid from './fishbone-mermaid.js';
import * as checks from './fishbone-checks.js';
import * as presets from './fishbone-presets.js';
import * as layoutMod from './fishbone-layout.js';
import * as renderMod from './fishbone-render.js';
import * as schema from './fishbone-schema.js';
import * as link from './fishbone-link.js';
import * as merge from './fishbone-merge.js';
import * as csv from './fishbone-csv.js';
import { createOutliner, outlineOrder } from './fishbone-outliner.js';
import { createView } from './fishbone-view.js';
import { renderItemPanel, renderChecks, renderTable, renderHistory } from './fishbone-panels.js';
import { initGuide } from './fishbone-guide.js';
import { createProjectStore } from '../diagram_common/projects.js';
import {
    serializeSvg, svgToPngBlob, downloadBlob, fileStem as baseStem, PNG_SCALES, loadFontDataUrl, embedFont
} from '../diagram_common/export.js';
import { createTextMeasure, FONT } from '../diagram_common/text-measure.js';

const { applyOp, SOLO_ACTOR, ROOT, BIN_ID, BIN_NAME, live, liveChildren } = ops;
const el = (id) => document.getElementById(id);
const VIEWER_KEY = 'fishboneDiagram.viewer.v1';
const UNDO_LIMIT = 200;
const PERSIST_MS = 300;
const FIELD_MS = 600;

const fileStem = (title) => baseStem(title, 'fishbone-diagram');
// Reading window.localStorage itself throws in some sandboxed and private windows.
const storage = (() => {
    try { return window.localStorage; } catch (e) { return null; }
})();
const memoryStorage = { getItem: () => null, setItem: () => { throw new Error('no storage'); } };
const local = () => storage || memoryStorage;
const newId = () => ops.newId((n) => crypto.getRandomValues(new Uint8Array(n)));
const measure = createTextMeasure(document, FONT);

const projects = createProjectStore({
    storageKey: 'fishboneDiagram.projects.v1',
    fileFormat: 'fishbone-diagram-project',
    label: 'fishbone',
    maxFileBytes: LIMITS.fileBytes,
    cleanState: (raw) => schema.cleanBoard(raw).board || ops.emptyBoard(),
    hasContent: (state) => Boolean(state) && typeof state === 'object' && Boolean(state.nodes) && typeof state.nodes === 'object',
    noContentMessage: 'That project file has no diagram in it'
});

let store = projects.emptyStore();
let storageProblem = null;
let board = ops.emptyBoard();
let undoStack = [];
let redoStack = [];
let selectedId = null;
let readOnly = false;
let snapshot = null;
let tableSort = { key: null, dir: 'asc' };
let lastLayout = null;
let persistTimer = null;
const viewer = loadViewer();

// ---------- Small helpers ----------

function loadViewer() {
    const defaults = { showEvidence: false, colors: true, checks: true, zoom: 1 };
    try {
        const raw = JSON.parse(local().getItem(VIEWER_KEY) || '{}');
        return {
            showEvidence: typeof raw.showEvidence === 'boolean' ? raw.showEvidence : defaults.showEvidence,
            colors: typeof raw.colors === 'boolean' ? raw.colors : defaults.colors,
            checks: typeof raw.checks === 'boolean' ? raw.checks : defaults.checks,
            zoom: Number.isFinite(raw.zoom) ? raw.zoom : defaults.zoom
        };
    } catch (e) {
        return defaults;
    }
}

function saveViewer() {
    try { local().setItem(VIEWER_KEY, JSON.stringify(viewer)); } catch (e) { /* kept for this visit only */ }
}

function say(text, where = 'editStatus') {
    el(where).textContent = text;
    el('announcer').textContent = text;
}

const theme = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
const screenPalette = () => {
    const p = renderMod.PALETTES[theme()];
    return viewer.colors ? p : renderMod.monochrome(p);
};
const exportPalette = () => (viewer.colors ? renderMod.PALETTES.light : renderMod.monochrome(renderMod.PALETTES.light));
const stamp = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

const confirmDialog = (text) => new Promise((resolve) => {
    const dialog = el('confirmDialog');
    el('confirmText').textContent = text;
    const done = (value) => {
        el('confirmYes').onclick = null;
        el('confirmNo').onclick = null;
        dialog.onclose = null;
        if (dialog.open) dialog.close();
        resolve(value);
    };
    el('confirmYes').onclick = () => done(true);
    el('confirmNo').onclick = () => done(false);
    dialog.onclose = () => done(false);
    dialog.showModal();
});

// ---------- Applying changes ----------

/**
 * Apply one op or a list as one undoable step. o: { focus, textOnly,
 * focusPanel }. A refused op leaves the board as it was and says why.
 */
function apply(opOrOps, o = {}) {
    if (readOnly) {
        say('This is a snapshot. Save it as your project to edit it.');
        return { ok: false, reason: 'READ_ONLY' };
    }
    const list = Array.isArray(opOrOps) ? opOrOps : [opOrOps];
    let next = board;
    const inverses = [];
    let undoable = true;
    let last = { ok: true, noop: true };
    let changed = 0;
    for (const op of list) {
        const { board: b, result } = applyOp(next, op, SOLO_ACTOR, Date.now());
        last = result;
        if (!result.ok) {
            say(result.message);
            if (list.length === 1) {
                if (o.textOnly) renderAll({ keepOutlineFocus: true });
                return result;
            }
            continue;
        }
        if (result.noop) continue;
        changed += 1;
        next = b;
        if (result.inverse) inverses.unshift(result.inverse);
        else undoable = false;
        if (result.rescued) say(`The cause went to ${BIN_NAME}: its parent was deleted.`);
    }
    if (!changed) return last;
    pushUndo(undoable ? { ops: inverses } : { snapshot: board });
    board = next;
    if (last.ok) say('');
    afterChange(o);
    return last;
}

function pushUndo(entry) {
    undoStack.push(entry);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
}

/** Replace the whole board as one undoable step, for Edit as text and merges. */
function replaceBoard(next, message) {
    pushUndo({ snapshot: board });
    board = next;
    if (message) say(message);
    afterChange({});
}

/** Run an undo or redo entry. Returns the entry that reverses it, or null if it could not run. */
function runEntry(entry) {
    if (entry.snapshot) {
        const back = { snapshot: board };
        board = entry.snapshot;
        return back;
    }
    let next = board;
    const inverses = [];
    for (const op of entry.ops) {
        const { board: b, result } = applyOp(next, op, SOLO_ACTOR, Date.now());
        if (!result.ok) {
            say(`That step could not be undone: ${result.message}.`);
            return null;
        }
        next = b;
        if (result.inverse) inverses.unshift(result.inverse);
    }
    const back = { ops: inverses };
    board = next;
    return back;
}

function undo() {
    if (readOnly || !undoStack.length) return;
    outliner.commitAll();
    const entry = undoStack.pop();
    const back = runEntry(entry);
    if (back) redoStack.push(back);
    say(back ? 'Undone.' : el('editStatus').textContent);
    afterChange({});
}

function redo() {
    if (readOnly || !redoStack.length) return;
    const entry = redoStack.pop();
    const back = runEntry(entry);
    if (back) undoStack.push(back);
    say(back ? 'Redone.' : el('editStatus').textContent);
    afterChange({});
}

function afterChange(o) {
    if (!readOnly) {
        const active = projects.activeProject(store);
        if (active && projects.setDraft(active, board, Date.now())) schedulePersist();
    }
    if (selectedId && !live(board, selectedId)) selectedId = null;
    if (o.focus && live(board, o.focus)) selectedId = o.focus;
    renderAll(o);
}

function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(writeStore, PERSIST_MS);
}

function writeStore() {
    clearTimeout(persistTimer);
    if (!projects.persistStore(local(), store) && storageProblem !== 'unavailable') storageProblem = 'full';
    renderProjectBar();
}

// ---------- Rendering ----------

function renderAll(o = {}) {
    el('tallyLine').textContent = checks.tallyLine(board);
    lastLayout = layoutMod.layoutBoard(board, { measure, showEvidence: viewer.showEvidence });
    view.draw(board, lastLayout, { palette: screenPalette(), selectedId });
    if (!o.textOnly && !o.keepOutlineFocus) outliner.render(board, { selectedId, readOnly, focus: o.focus || null });
    else if (o.keepOutlineFocus) outliner.render(board, { selectedId, readOnly });
    renderPanel();
    if (viewer.checks) {
        el('checksSection').hidden = false;
        renderChecks(el('checksList'), checks.runChecks(board, { heights: lastLayout.heights }), pick);
    } else {
        el('checksSection').hidden = true;
    }
    renderTable(el('causeTable'), board, tableSort, sortBy, pick);
    renderHistory(el('historyList'), board);
    syncControls();
}

function renderPanel() {
    const panel = el('itemPanel');
    const focused = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.id : null;
    renderItemPanel(panel, board, selectedId, { apply, outliner, confirm: confirmDialog, readOnly });
    if (focused && el(focused)) el(focused).focus();
}

function syncControls() {
    const setIfIdle = (id, value) => {
        const input = el(id);
        if (document.activeElement !== input && input.value !== value) input.value = value;
    };
    setIfIdle('titleInput', board.title);
    setIfIdle('effectInput', board.effect);
    for (const [key, id] of [['what', 'partWhat'], ['where', 'partWhere'], ['when', 'partWhen'], ['extent', 'partExtent']]) {
        setIfIdle(id, board.effectParts[key]);
    }
    el('presetSelect').value = presets.PRESETS_BY_ID[board.preset] ? board.preset : 'none';
    el('kindSelect').value = board.kind;
    showPresetHelp();
    el('kindHelp').textContent = presets.KIND_INFO[board.kind].help;
    setIfIdle('angleInput', String(board.settings.angle));
    setIfIdle('wrapInput', String(board.settings.wrap));
    el('showEmpty').checked = board.settings.showEmpty;
    el('undoBtn').disabled = readOnly || !undoStack.length;
    el('redoBtn').disabled = readOnly || !redoStack.length;
    for (const id of ['titleInput', 'effectInput', 'partWhat', 'partWhere', 'partWhen', 'partExtent']) el(id).readOnly = readOnly;
    for (const id of ['composeEffect', 'presetApply', 'presetSelect', 'kindSelect', 'angleInput', 'wrapInput', 'showEmpty',
        'editText', 'importText', 'addCategory', 'addUnsorted']) el(id).disabled = readOnly;
}

function showPresetHelp() {
    const preset = presets.PRESETS_BY_ID[el('presetSelect').value];
    const parts = [];
    if (preset.source) parts.push(`Source: ${preset.source}. ${preset.standing}.`);
    if (preset.help) parts.push(preset.help);
    if (preset.categories.length) parts.push(presets.SIZE_HELP);
    el('presetHelp').textContent = parts.join(' ');
}

function select(id, { from } = {}) {
    selectedId = id && live(board, id) ? id : null;
    view.markSelected(selectedId);
    for (const row of el('outliner').querySelectorAll('.ol-row.is-selected')) row.classList.remove('is-selected');
    const row = el('outliner').querySelector(`.ol-row[data-id="${selectedId}"]`);
    if (row) row.classList.add('is-selected');
    if (from === 'outline') view.revealItem(selectedId);
    renderPanel();
}

/** Select from a check or the table: show it on the diagram and focus it in the outline. */
function pick(id) {
    if (!live(board, id)) return;
    select(id, { from: 'pick' });
    view.revealItem(id);
    outliner.focusNode(id);
}

function sortBy(key) {
    tableSort = tableSort.key === key ? { key, dir: tableSort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
    renderTable(el('causeTable'), board, tableSort, sortBy, pick);
    const header = [...el('causeTable').querySelectorAll('th button')].find((b) => b.closest('th').getAttribute('aria-sort') !== 'none');
    if (header) header.focus();
}

// ---------- Projects ----------

function renderProjectBar() {
    const select = el('projectSelect');
    const active = projects.activeProject(store);
    select.replaceChildren(...store.projects.map((p) => new Option(p.name, p.id, false, p.id === store.activeId)));
    if (document.activeElement !== el('projectName')) el('projectName').value = active ? active.name : '';
    const dirty = active ? projects.isDirty(active) : false;
    const lock = readOnly;
    for (const id of ['projectSelect', 'projectName', 'projectDelete', 'projectExport', 'projectMerge', 'exampleSelect', 'exampleLoad']) el(id).disabled = lock;
    el('projectNew').disabled = lock || projects.isFull(store);
    el('projectImport').disabled = lock || projects.isFull(store);
    el('projectSave').disabled = lock || !dirty;
    el('projectRevert').disabled = lock || !dirty;
    let message = `${store.projects.length} of ${projects.MAX_PROJECTS} projects in this browser.${dirty ? ' Changes since the last save are kept as a draft; Save marks the point Revert returns to.' : ''}`;
    if (storageProblem === 'full') message = 'The browser refused to store the projects. Changes are not being kept; export a project file.';
    else if (storageProblem === 'unavailable') message = 'This browser is not letting the page store anything, so projects last only while the tab is open.';
    else if (storageProblem === 'corrupt') message = 'The stored projects could not be read and were set aside. Starting fresh.';
    el('projectStatus').textContent = message;
}

function openProject(project) {
    board = project.draft;
    undoStack = [];
    redoStack = [];
    selectedId = null;
    renderProjectBar();
    renderAll({});
}

function boardFromText(text, origin) {
    const parsed = outline.parseOutline(text);
    const keys = outline.resolveKeys(parsed, presets.lookupPreset);
    return { parsed, board: outline.boardFromOutline(parsed, { newId, now: Date.now(), keys, origin }) };
}

function addProjectWith(name, next) {
    if (projects.isFull(store)) {
        say(`${projects.MAX_PROJECTS} projects are already stored. Delete one first.`, 'projectStatus');
        return null;
    }
    outliner.commitAll();
    const project = projects.addProject(store, projects.uniqueName(store, projects.cleanName(name)), next, Date.now());
    writeStore();
    openProject(project);
    return project;
}

function initProjects() {
    let loaded;
    try {
        loaded = projects.loadStore(local());
    } catch (e) {
        loaded = { store: projects.emptyStore(), problem: 'unavailable' };
    }
    store = loaded.store;
    storageProblem = loaded.problem;
    if (!store.projects.length) {
        const first = presets.EXAMPLES[0];
        const { board: start } = boardFromText(first.text, `Started from the example "${first.label}"`);
        start.title = first.label.replace(/ \(.*\)$/, '');
        projects.addProject(store, start.title, start, Date.now());
        projects.persistStore(local(), store);
    }
    board = projects.activeProject(store).draft;
}

function wireProjects() {
    el('projectSelect').addEventListener('change', (event) => {
        // Read the choice first: saving redraws this menu with the old project selected.
        const chosen = event.target.value;
        outliner.commitAll();
        writeStore();
        store.activeId = chosen;
        writeStore();
        openProject(projects.activeProject(store));
    });
    el('projectName').addEventListener('change', (event) => {
        const active = projects.activeProject(store);
        active.name = projects.cleanName(event.target.value);
        event.target.value = active.name;
        writeStore();
    });
    el('projectNew').addEventListener('click', () => {
        const blank = ops.emptyBoard({ now: Date.now() });
        addProjectWith(projects.nextName(store), blank);
        say('New project. Write the problem, then pick a template or add categories.', 'projectStatus');
    });
    el('projectSave').addEventListener('click', () => {
        outliner.commitAll();
        projects.commitProject(projects.activeProject(store), Date.now());
        writeStore();
    });
    el('projectRevert').addEventListener('click', async () => {
        if (!(await confirmDialog('Throw away the changes since the last save?'))) return;
        const active = projects.activeProject(store);
        projects.revertProject(active, Date.now());
        writeStore();
        openProject(active);
    });
    el('projectDelete').addEventListener('click', async () => {
        const active = projects.activeProject(store);
        if (!(await confirmDialog(`Delete the project "${active.name}" from this browser? Export it first if you want a copy.`))) return;
        projects.removeProject(store, active.id);
        if (!store.projects.length) projects.addProject(store, projects.nextName(store), ops.emptyBoard(), Date.now());
        writeStore();
        openProject(projects.activeProject(store));
    });
    el('projectExport').addEventListener('click', () => {
        outliner.commitAll();
        const active = projects.activeProject(store);
        downloadBlob(new Blob([projects.projectToFile(active)], { type: 'application/json' }), `${fileStem(active.name)}.fishbone.json`);
        say(`Exported ${active.name}.`, 'projectStatus');
    });
    el('projectImport').addEventListener('click', () => el('projectFile').click());
    el('projectFile').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        const read = await readProjectFile(file);
        if (!read.ok) { say(read.message, 'projectStatus'); return; }
        if (addProjectWith(read.name, read.state)) say(`Imported "${read.name}" as a project of its own.`, 'projectStatus');
    });
    el('projectMerge').addEventListener('click', () => el('mergeFile').click());
    el('mergeFile').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        const read = await readProjectFile(file);
        if (!read.ok) { say(read.message, 'projectStatus'); return; }
        openMerge(read);
    });
}

async function readProjectFile(file) {
    if (file.size > LIMITS.fileBytes) return { ok: false, message: `That file is ${Math.round(file.size / 1000)} kB; project files are limited to ${LIMITS.fileBytes / 1000} kB.` };
    const text = await file.text();
    try {
        const raw = JSON.parse(text);
        if (raw && raw.state && Number.isInteger(raw.state.schema) && raw.state.schema > ops.SCHEMA) {
            return { ok: false, message: 'That file is from a newer version of this tool and cannot be read' };
        }
    } catch (e) { /* projectFromFile says it is not JSON */ }
    return projects.projectFromFile(text);
}

// ---------- Merge ----------

let pendingMerge = null;

function openMerge(read) {
    outliner.commitAll();
    const theirs = read.state;
    const result = merge.compareBoards(board, theirs);
    pendingMerge = { theirs, name: read.name, result, choices: {} };
    const summary = el('mergeSummary');
    const table = el('mergeTable');
    el('mergeLocks').replaceChildren();
    if (result.unrelated) {
        summary.textContent = `"${read.name}" has no items in common with this project, so it is probably a different project. Open it as a new project instead.`;
        table.replaceChildren();
        el('mergeApply').hidden = true;
        el('mergeAllRow').hidden = true;
    } else {
        summary.textContent = `${result.rows.length} difference${result.rows.length === 1 ? '' : 's'} to decide, and ${result.added.length} item${result.added.length === 1 ? '' : 's'} only in "${read.name}", which will be added.`;
        el('mergeApply').hidden = false;
        el('mergeAllRow').hidden = !result.rows.length;
        renderMergeTable();
        el('mergeLocks').replaceChildren(...result.removedLocks.map((l) => {
            const li = document.createElement('li');
            li.textContent = `The file has no lock on "${l.text}", which is locked here. Taking theirs for that row removes the lock.`;
            return li;
        }));
    }
    el('mergeDialog').showModal();
}

function renderMergeTable() {
    const { result, choices } = pendingMerge;
    const table = el('mergeTable');
    const head = document.createElement('tr');
    for (const h of ['Item', 'What', 'Mine', 'Theirs']) {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = h;
        head.append(th);
    }
    const body = document.createElement('tbody');
    if (!result.rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = 'No differences in shared items.';
        tr.append(td);
        body.append(tr);
    }
    result.rows.forEach((row, i) => {
        const tr = document.createElement('tr');
        const cells = [row.item, row.label];
        for (const text of cells) {
            const td = document.createElement('td');
            td.textContent = text;
            tr.append(td);
        }
        for (const side of ['mine', 'theirs']) {
            const td = document.createElement('td');
            const label = document.createElement('label');
            label.className = 'fb-check';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = `merge${i}`;
            radio.value = side;
            radio.checked = (choices[row.key] || 'mine') === side;
            radio.addEventListener('change', () => { choices[row.key] = side; });
            label.append(radio, document.createTextNode(row[side]));
            td.append(label);
            tr.append(td);
        }
        body.append(tr);
    });
    const thead = document.createElement('thead');
    thead.append(head);
    table.replaceChildren(thead, body);
}

function wireMerge() {
    el('mergeAllMine').addEventListener('click', () => { for (const r of pendingMerge.result.rows) pendingMerge.choices[r.key] = 'mine'; renderMergeTable(); });
    el('mergeAllTheirs').addEventListener('click', () => { for (const r of pendingMerge.result.rows) pendingMerge.choices[r.key] = 'theirs'; renderMergeTable(); });
    el('mergeApply').addEventListener('click', () => {
        const merged = merge.applyMerge(board, pendingMerge.theirs, pendingMerge.choices, { now: Date.now(), by: SOLO_ACTOR.memberId });
        el('mergeDialog').close();
        replaceBoard(merged, `Merged "${pendingMerge.name}". Undo takes the merge back.`);
    });
    el('mergeAsNew').addEventListener('click', () => {
        el('mergeDialog').close();
        if (addProjectWith(pendingMerge.name, pendingMerge.theirs)) say(`Opened "${pendingMerge.name}" as a new project.`, 'projectStatus');
    });
}

// ---------- Text: edit, paste and import ----------

let textMode = 'edit';
let textTimer = null;

function openText(mode) {
    outliner.commitAll();
    textMode = mode;
    const editing = mode === 'edit';
    el('textTitle').textContent = editing ? 'Edit as text' : 'Paste or import';
    el('textHelp').textContent = editing
        ? 'The whole project as outline text. Items are matched by their path, so statuses, evidence, locks and notes on unchanged lines are kept. Anything you remove is deleted, and Undo brings it back.'
        : 'Paste an outline, a bulleted list or Mermaid ishikawa text. "Apply" adds it to this project without changing anything already there; "Open as a new project" starts a project from it.';
    el('textFormatRow').hidden = editing;
    el('textNewProject').hidden = editing;
    el('textApply').textContent = editing ? 'Apply' : 'Add to this project';
    el('textArea').value = editing ? outline.toOutline(board, { presetLabel: presetLabel() }) : '';
    el('textStatus').textContent = '';
    el('textDialog').showModal();
    showFindings();
    el('textArea').focus();
}

const presetLabel = () => (board.preset !== 'none' && presets.PRESETS_BY_ID[board.preset] ? presets.PRESETS_BY_ID[board.preset].label : null);
const textFormat = () => (textMode === 'edit' ? 'outline' : document.querySelector('input[name="textFormat"]:checked').value);

function parseText() {
    const text = el('textArea').value;
    if (textFormat() === 'mermaid') {
        const parsed = mermaid.parseMermaid(text);
        return parsed.ok ? { parsed, keys: {} } : { error: parsed.message };
    }
    const parsed = outline.parseOutline(text);
    return { parsed, keys: outline.resolveKeys(parsed, presets.lookupPreset) };
}

function showFindings() {
    const read = parseText();
    const list = el('textFindings');
    if (read.error) {
        const li = document.createElement('li');
        li.textContent = read.error;
        list.replaceChildren(li);
        return read;
    }
    list.replaceChildren(...read.parsed.findings.map((f) => {
        const li = document.createElement('li');
        li.dataset.code = f.code;
        li.textContent = `Line ${f.line}: ${f.message}`;
        return li;
    }));
    return read;
}

function wireText() {
    el('editText').addEventListener('click', () => openText('edit'));
    el('importText').addEventListener('click', () => openText('import'));
    el('textArea').addEventListener('input', () => {
        clearTimeout(textTimer);
        textTimer = setTimeout(showFindings, 250);
    });
    for (const radio of document.querySelectorAll('input[name="textFormat"]')) radio.addEventListener('change', showFindings);
    el('textFromFile').addEventListener('click', () => el('textFile').click());
    el('textFile').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > LIMITS.fileBytes) { el('textStatus').textContent = 'That file is too large to read.'; return; }
        const text = await file.text();
        el('textArea').value = text;
        if (/^\s*(?:%%.*\n\s*)*ishikawa/i.test(text) || /\.mmd$/i.test(file.name)) document.querySelector('input[name="textFormat"][value="mermaid"]').checked = true;
        showFindings();
    });
    el('textApply').addEventListener('click', () => {
        const read = showFindings();
        if (read.error) { el('textStatus').textContent = read.error; return; }
        if (textMode === 'edit') {
            const next = outline.rebuildFromOutline(board, read.parsed, { newId, now: Date.now(), keys: read.keys });
            el('textDialog').close();
            replaceBoard(next, read.parsed.findings.length ? `Applied, with ${read.parsed.findings.length} line${read.parsed.findings.length === 1 ? '' : 's'} adjusted; reopen Edit as text to see them.` : 'Applied.');
            return;
        }
        const list = outline.pasteOps(board, read.parsed, newId);
        if (read.parsed.effect && !board.effect) list.unshift({ type: 'setBoard', field: 'effect', value: read.parsed.effect });
        if (!list.length) { el('textStatus').textContent = 'There is nothing in that text to add.'; return; }
        const before = ops.countCauses(board);
        const result = apply(list);
        el('textDialog').close();
        const added = ops.countCauses(board) - before;
        say(`Added ${added} cause${added === 1 ? '' : 's'}.${result.ok ? '' : ` Some lines were refused: ${result.message}.`}`);
    });
    el('textNewProject').addEventListener('click', () => {
        const read = showFindings();
        if (read.error) { el('textStatus').textContent = read.error; return; }
        const next = outline.boardFromOutline(read.parsed, { newId, now: Date.now(), keys: read.keys, origin: 'Started from pasted text' });
        el('textDialog').close();
        addProjectWith(next.effect ? next.effect.slice(0, 40) : projects.nextName(store), next);
    });
}

// ---------- Export ----------

function exportSvgElement() {
    const lay = layoutMod.layoutBoard(board, { measure, showEvidence: viewer.showEvidence });
    const header = { title: board.title || '', tally: checks.tallyLine(board), date: `Exported ${stamp()} from Tools Hub, Ishikawa Fishbone Diagram` };
    const svg = renderMod.renderBoard(document, board, lay, { palette: exportPalette(), header, measure, title: board.title || board.effect || 'Fishbone diagram' });
    const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number);
    return { svg, width: w, height: h };
}

function wireExport() {
    el('pngScale').append(...PNG_SCALES.map((s) => new Option(s.label, String(s.scale), s.id === 'standard', s.id === 'standard')));
    const stem = () => fileStem(board.title || board.effect || projects.activeProject(store)?.name);
    el('exportSvg').addEventListener('click', () => {
        outliner.commitAll();
        const { svg } = exportSvgElement();
        downloadBlob(new Blob([serializeSvg(svg)], { type: 'image/svg+xml' }), `${stem()}.svg`);
        say('SVG exported.', 'exportStatus');
    });
    el('exportPng').addEventListener('click', async () => {
        outliner.commitAll();
        const { svg, width, height } = exportSvgElement();
        const scale = Number(el('pngScale').value) || 2;
        try {
            const font = await loadFontDataUrl();
            const blob = await svgToPngBlob(embedFont(serializeSvg(svg), font), width, height, scale);
            downloadBlob(blob, `${stem()}.png`);
            say('PNG exported.', 'exportStatus');
        } catch (e) {
            say(e.message, 'exportStatus');
        }
    });
    el('printBtn').addEventListener('click', () => {
        outliner.commitAll();
        fillPrint();
        window.print();
    });
    window.addEventListener('beforeprint', fillPrint);
    el('exportOutline').addEventListener('click', () => {
        outliner.commitAll();
        downloadBlob(new Blob([outline.toOutline(board, { presetLabel: presetLabel() })], { type: 'text/plain' }), `${stem()}.txt`);
        say('Outline text exported. It keeps structure, statuses, owners, evidence and the problem; not ids, locks, notes or history.', 'exportStatus');
    });
    el('exportMermaid').addEventListener('click', () => {
        outliner.commitAll();
        downloadBlob(new Blob([mermaid.toMermaid(board)], { type: 'text/plain' }), `${stem()}.mmd`);
        say('Mermaid exported. Mermaid has no statuses, so each is written after its cause; evidence is left out.', 'exportStatus');
    });
    el('exportCsv').addEventListener('click', () => {
        outliner.commitAll();
        downloadBlob(new Blob([csv.toCsv(board)], { type: 'text/csv' }), `${stem()}.csv`);
        say('CSV exported.', 'exportStatus');
    });
}

function fillPrint() {
    const { svg } = exportSvgElement();
    el('printArea').replaceChildren(svg);
}

// ---------- Share as link ----------

function wireShare() {
    const dialog = el('shareDialog');
    const reset = () => {
        el('shareUnderstand').checked = false;
        el('shareUrl').value = '';
        el('shareCopy').disabled = true;
        el('shareOpen').hidden = true;
        el('shareStatus').textContent = '';
    };
    el('shareLink').addEventListener('click', () => {
        outliner.commitAll();
        reset();
        if (!link.linkSupported()) {
            el('shareStatus').textContent = 'This browser cannot compress a link (CompressionStream is missing). Export a project file instead.';
            el('shareUnderstand').disabled = true;
        }
        dialog.showModal();
    });
    const make = async () => {
        el('shareCopy').disabled = true;
        el('shareOpen').hidden = true;
        el('shareUrl').value = '';
        if (!el('shareUnderstand').checked) return;
        const active = projects.activeProject(store);
        const result = await link.packLink(board, {
            baseUrl: window.location.href, name: (active && active.name) || board.title, now: Date.now(), dropEvidence: el('shareDropEvidence').checked
        });
        if (!result.ok) { el('shareStatus').textContent = result.message; return; }
        el('shareUrl').value = result.url;
        el('shareCopy').disabled = false;
        el('shareOpen').href = result.url;
        el('shareOpen').hidden = false;
        el('shareStatus').textContent = `Link made, ${result.length.toLocaleString('en-US')} characters.`;
    };
    el('shareUnderstand').addEventListener('change', make);
    el('shareDropEvidence').addEventListener('change', make);
    el('shareCopy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(el('shareUrl').value);
            el('shareStatus').textContent = 'Copied. Open it once before sending it.';
        } catch (e) {
            el('shareUrl').select();
            el('shareStatus').textContent = 'The browser would not copy; the link is selected for you to copy.';
        }
    });
}

async function openSnapshot(packed) {
    const result = await link.unpackLink(packed);
    if (!result.ok) {
        el('linkError').textContent = result.message;
        el('linkError').hidden = false;
        return false;
    }
    snapshot = result;
    readOnly = true;
    board = result.board;
    el('snapshotTime').textContent = result.at ? `${stamp(result.at)} UTC` : 'at an unknown time';
    el('snapshotBanner').hidden = false;
    el('modeDetail').textContent = 'reading a snapshot link, nothing saved yet';
    return true;
}

function wireSnapshot() {
    el('snapshotSave').addEventListener('click', () => {
        if (!snapshot) return;
        if (projects.isFull(store)) {
            el('snapshotStatus').textContent = `${projects.MAX_PROJECTS} projects are already stored. Delete one first; this snapshot stays open.`;
            return;
        }
        readOnly = false;
        const name = snapshot.name || snapshot.board.title || 'Shared snapshot';
        const next = { ...snapshot.board, history: [{ n: 1, seq: 0, at: Date.now(), by: SOLO_ACTOR.memberId, summary: `Saved from a snapshot link made ${stamp(snapshot.at)} UTC` }], historyN: 1 };
        snapshot = null;
        el('snapshotBanner').hidden = true;
        el('modeDetail').textContent = 'in this browser, no server contacted';
        try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* hash stays */ }
        addProjectWith(name, next);
        say(`Saved as the project "${projects.activeProject(store).name}".`, 'projectStatus');
    });
}

// ---------- Controls ----------

function wireControls() {
    el('exampleSelect').append(...presets.EXAMPLES.map((e) => new Option(e.label, e.id)));
    const teach = () => { el('exampleTeaches').textContent = presets.EXAMPLES_BY_ID[el('exampleSelect').value].teaches; };
    el('exampleSelect').addEventListener('change', teach);
    teach();
    el('exampleLoad').addEventListener('click', () => {
        const example = presets.EXAMPLES_BY_ID[el('exampleSelect').value];
        const { board: next } = boardFromText(example.text, `Started from the example "${example.label}"`);
        next.title = example.label.replace(/ \(.*\)$/, '');
        if (addProjectWith(example.label.replace(/ \(.*\)$/, ''), next)) say(`Opened the example as a project of its own. ${example.teaches}`, 'projectStatus');
    });

    el('presetSelect').append(...presets.PRESETS.map((p) => new Option(p.label, p.id)));
    el('presetSelect').addEventListener('change', showPresetHelp);
    el('presetApply').addEventListener('click', () => {
        const preset = presets.PRESETS_BY_ID[el('presetSelect').value];
        const have = new Set(liveChildren(board, ROOT).map((id) => board.nodes[id].text.toLowerCase()));
        const list = [{ type: 'setBoard', field: 'preset', value: preset.id }];
        let after = liveChildren(board, ROOT).filter((id) => board.nodes[id].kind === 'category').pop() || null;
        for (const name of preset.categories) {
            if (have.has(name.toLowerCase())) continue;
            const id = newId();
            list.push({ type: 'addNode', id, parentId: ROOT, after, kind: 'category', text: name });
            after = id;
        }
        const added = list.length - 1;
        const result = apply(list);
        if (result.ok || added) say(added ? `Added ${added} categor${added === 1 ? 'y' : 'ies'} from ${preset.label}.` : `Every ${preset.label} category is already here.`);
    });
    el('kindSelect').append(...Object.entries(presets.KIND_INFO).map(([id, k]) => new Option(k.label, id)));
    el('kindSelect').addEventListener('change', (event) => apply({ type: 'setBoard', field: 'kind', value: event.target.value }));

    const boardField = (id, field) => {
        let timer = null;
        const commit = () => {
            clearTimeout(timer);
            if (el(id).value.trim() !== board[field]) apply({ type: 'setBoard', field, value: el(id).value }, { textOnly: true });
        };
        el(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(commit, FIELD_MS); });
        el(id).addEventListener('change', commit);
    };
    boardField('titleInput', 'title');
    boardField('effectInput', 'effect');
    el('composeEffect').addEventListener('click', () => {
        const parts = { what: el('partWhat').value, where: el('partWhere').value, when: el('partWhen').value, extent: el('partExtent').value };
        const text = Object.values(parts).map((p) => p.trim()).filter(Boolean).join(', ').slice(0, LIMITS.effect);
        if (!text) { say('Fill in at least the What field first.'); return; }
        apply([{ type: 'setBoard', field: 'effectParts', value: parts }, { type: 'setBoard', field: 'effect', value: text }]);
        el('effectInput').value = board.effect;
    });

    const setting = (id, key) => el(id).addEventListener('change', () => {
        const value = Number(el(id).value);
        const [lo, hi] = ops.SETTING_RANGES[key];
        if (!Number.isInteger(value) || value < lo || value > hi) {
            say(`Use a whole number from ${lo} to ${hi}.`);
            el(id).value = String(board.settings[key]);
            return;
        }
        apply({ type: 'setBoard', field: 'settings', value: { [key]: value } });
    });
    setting('angleInput', 'angle');
    setting('wrapInput', 'wrap');
    el('showEmpty').addEventListener('change', (event) => apply({ type: 'setBoard', field: 'settings', value: { showEmpty: event.target.checked } }));

    el('showEvidence').checked = viewer.showEvidence;
    el('colorsOn').checked = viewer.colors;
    el('checksOn').checked = viewer.checks;
    for (const [id, key] of [['showEvidence', 'showEvidence'], ['colorsOn', 'colors'], ['checksOn', 'checks']]) {
        el(id).addEventListener('change', (event) => { viewer[key] = event.target.checked; saveViewer(); renderAll({}); });
    }
    el('zoomIn').addEventListener('click', () => view.zoomIn());
    el('zoomOut').addEventListener('click', () => view.zoomOut());
    el('zoomFit').addEventListener('click', () => view.fit());

    el('undoBtn').addEventListener('click', undo);
    el('redoBtn').addEventListener('click', redo);
    el('addCategory').addEventListener('click', () => {
        const id = newId();
        const last = liveChildren(board, ROOT).filter((x) => board.nodes[x].kind === 'category').pop() || null;
        apply({ type: 'addNode', id, parentId: ROOT, after: last, kind: 'category', text: '' }, { focus: id });
    });
    el('addUnsorted').addEventListener('click', () => {
        const list = [];
        if (!live(board, BIN_ID)) {
            list.push(board.nodes[BIN_ID]
                ? { type: 'restoreNode', nodeId: BIN_ID }
                : { type: 'addNode', id: BIN_ID, parentId: ROOT, after: null, kind: 'unsorted', text: BIN_NAME });
        }
        const id = newId();
        const kids = board.order[BIN_ID] || [];
        list.push({ type: 'addNode', id, parentId: BIN_ID, after: kids.length ? kids[kids.length - 1] : null, kind: 'cause', text: '' });
        apply(list, { focus: id });
    });

    document.addEventListener('keydown', (event) => {
        const mod = event.ctrlKey || event.metaKey;
        if (!mod || event.altKey) return;
        const key = event.key.toLowerCase();
        const isUndo = key === 'z' && !event.shiftKey;
        const isRedo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
        if (!isUndo && !isRedo) return;
        const target = event.target;
        const typing = target && (target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && target.type === 'text'));
        const inOutline = target && el('outliner').contains(target);
        if (typing && (!inOutline || outliner.hasUncommitted())) return;
        if (target && target.closest && target.closest('dialog')) return;
        event.preventDefault();
        if (isUndo) undo();
        else redo();
    });

    for (const button of document.querySelectorAll('dialog [data-close]')) {
        button.addEventListener('click', () => button.closest('dialog').close());
    }
    el('viewLicenses').addEventListener('click', () => el('licenseDialog').showModal());

    new MutationObserver(() => renderAll({ keepOutlineFocus: true })).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

// ---------- Start ----------

const outliner = createOutliner({
    host: el('outliner'),
    getBoard: () => board,
    apply,
    newId,
    select: (id, how) => select(id, how),
    selected: () => selectedId,
    leave: () => el('addCategory').focus(),
    message: (text) => say(text),
    readOnly: () => readOnly
});

const view = createView({
    frame: el('diagramFrame'),
    host: el('diagramHost'),
    getBoard: () => board,
    select: (id, how) => select(id, how),
    edit: (id) => outliner.focusNode(id),
    apply,
    message: (text) => say(text),
    readOnly: () => readOnly,
    onZoom: (zoom) => {
        el('zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
        viewer.zoom = zoom;
        saveViewer();
    }
});

async function start() {
    initProjects();
    wireProjects();
    wireMerge();
    wireText();
    wireExport();
    wireShare();
    wireSnapshot();
    wireControls();
    const packed = link.linkFromHash(window.location.hash);
    if (packed !== null) await openSnapshot(packed);
    initGuide({ dialog: el('guideDialog'), opener: el('howToUse'), storage: local(), arrivedByLink: packed !== null });
    view.setZoom(viewer.zoom);
    renderProjectBar();
    renderAll({});
    // Boxes are sized from measured text, and the web font may arrive after the first draw.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => renderAll({ keepOutlineFocus: true }));
}

window.FishboneDiagram = {
    OPS_VERSION: ops.OPS_VERSION,
    LIMITS,
    ops,
    outline,
    mermaid,
    checks,
    presets,
    layout: layoutMod,
    render: renderMod,
    schema,
    link,
    merge,
    csv,
    projects,
    outlineOrder,
    getBoard: () => board,
    isReadOnly: () => readOnly,
    apply,
    undo,
    redo
};

start();
