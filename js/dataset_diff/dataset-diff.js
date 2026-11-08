// Dataset Diff page: two sources, the pair plan, the run and its results.
// Parsing happens in one worker per side and comparison in a third, so the
// page holds settings and summaries, never the tables.

import './diff-api.js';
import { Runner } from './diff-runner.js';
import { LIMITS } from './diff-limits.js';
import { suggestPairs, validatePlan } from './diff-plan.js';
import { PREVIEW_CAP } from './diff-report.js';
import { el, describeError, verdictBadge, fmt } from './diff-render.js';
import { buildRecipe, parseRecipe } from './diff-recipe.js';

const VERSION = '0.2.0';
const SIDES = ['left', 'right'];
const NAMES = { left: 'Left', right: 'Right' };
const DATA = '../data/dataset_diff/';
const DELIMITERS = [[',', 'comma'], ['\t', 'tab'], [';', 'semicolon'], ['|', 'pipe']];
const DELIM_NAME = Object.fromEntries(DELIMITERS);

const EXAMPLES = [
    { label: 'Parts: rows in a different order (CSV)', left: 'parts-left.csv', right: 'parts-right-RowsSwapped.csv' },
    { label: 'Parts: one quantity changed (XLSX)', left: 'parts-left.xlsx', right: 'parts-right.xlsx', pairs: [['Parts', 'QtyChanged']] },
    { label: 'Parts: identifiers saved as numbers (CSV)', left: 'parts-left.csv', right: 'parts-right-PartAsNumber.csv' },
    { label: 'Three sheet pairs in two workbooks', left: 'three-pairs-left.xlsx', right: 'three-pairs-right.xlsx' },
    { label: 'Equal displays, different stored decimals', left: 'display-left.xlsx', right: 'display-right.xlsx' },
    { label: 'Workbook against a simulated CSV export', left: 'dates-1900.xlsx', right: 'dates-excel-export-simulated.csv', pairs: [['Dates', 'dates-excel-export-simulated.csv']] },
    { label: 'A formula with no stored result', left: 'formulas-left.xlsx', right: 'formulas-right.xlsx' },
];

const $ = (id) => document.getElementById(id);
const runner = new Runner(new URL('./diff-worker.js', import.meta.url).href);

const defaultText = () => ({
    delimiter: null, headerRecord: 1, generatedHeaders: false,
    emptyFields: 'blank', decimal: '.', thousands: '', types: [],
    dateFormat: 'M/D/YYYY', dateSystem: '1900',
});

const state = {
    sources: { left: null, right: null },
    inventory: { left: null, right: null },
    loaded: { left: false, right: false },
    text: { left: defaultText(), right: defaultText() },
    encoding: { left: 'auto', right: 'auto' },
    // Set by Load settings: the next file on that side keeps those settings.
    keepSettings: { left: false, right: false },
    pairs: [],
    nextPair: 1,
    running: false,
    stopping: false,
    hasRun: false,
};

// ---------------------------------------------------------------- sources

function kindOf(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['xlsx', 'xlsm', 'xlsb', 'xls', 'ods'].includes(ext)) return { kind: 'workbook', ext };
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return { kind: 'text', ext };
    return { kind: null, ext };
}

function showErrors(side, message) {
    const box = $(`${side}Errors`);
    box.textContent = message || '';
    box.hidden = !message;
}

function setStatus(side, text) { $(`${side}Status`).textContent = text; }

async function loadSource(side, src) {
    showErrors(side, null);
    const kind = src.text !== undefined ? 'text' : kindOf(src.name).kind;
    if (!kind) {
        showErrors(side, describeError({ kind: 'unsupported-file', ext: `.${kindOf(src.name).ext}` }));
        return false;
    }
    if (src.file && src.file.size > LIMITS.fileBytes) {
        showErrors(side, describeError({ kind: 'limit', limit: 'fileBytes', value: src.file.size, max: LIMITS.fileBytes }));
        return false;
    }
    state.sources[side] = { ...src, kind };
    state.inventory[side] = null;
    state.loaded[side] = false;
    if (state.keepSettings[side]) {
        state.keepSettings[side] = false;
    } else {
        state.text[side] = defaultText();
        state.encoding[side] = 'auto';
        $(`${side}Encoding`).value = 'auto';
    }
    markStale();
    return (await openSource(side)).ok;
}

async function openSource(side) {
    const src = state.sources[side];
    setStatus(side, `Reading ${src.name}...`);
    try {
        const request = { kind: src.kind, name: src.name };
        if (src.text !== undefined) request.text = src.text;
        else request.bytes = await src.file.arrayBuffer();
        if (src.kind === 'text' && state.text[side].delimiter) request.delimiter = state.text[side].delimiter;
        if (src.kind === 'text') request.encoding = state.encoding[side];
        const inv = await runner.open(side, request);
        state.inventory[side] = inv;
        state.loaded[side] = true;
        if (src.kind === 'text') state.text[side].delimiter = inv.delimiter;
        showErrors(side, null);
        renderSource(side);
        syncPairs();
        renderPairs();
        return { ok: true };
    } catch (e) {
        state.loaded[side] = false;
        if (e && e.kind === 'replaced') return { ok: false, error: e };
        if (e && e.kind === 'cancelled') {
            setStatus(side, `${src.name}: reading stopped. It is read again on the next Compare.`);
            return { ok: false, error: e };
        }
        state.inventory[side] = null;
        setStatus(side, `${src.name}: not loaded.`);
        showErrors(side, describeError(e));
        $(`${side}TextOptions`).hidden = true;
        renderPairs();
        return { ok: false, error: e };
    }
}

async function ensureOpen(side) {
    if (state.loaded[side] && runner.hasWorker(side)) return { ok: true };
    state.loaded[side] = false;
    return openSource(side);
}

function renderSource(side) {
    const src = state.sources[side];
    const inv = state.inventory[side];
    if (src.kind === 'workbook') {
        const hidden = inv.sheets.filter((s) => s.hidden).length;
        setStatus(side, `${src.name}: ${inv.format.toUpperCase()}, ${inv.sheets.length} sheet${inv.sheets.length === 1 ? '' : 's'}`
            + `${hidden ? ` (${hidden} hidden)` : ''}, ${inv.dateSystem} date system`
            + `${inv.audit && inv.audit.macros ? ', contains macros, which are never run' : ''}.`);
        $(`${side}TextOptions`).hidden = true;
    } else {
        setStatus(side, `${src.name}: ${inv.encoding}, ${DELIM_NAME[inv.delimiter] || 'custom'}-delimited, ${fmt(inv.records)} record${inv.records === 1 ? '' : 's'}.`);
        renderTextOptions(side);
    }
}

function columnNames(side) {
    const inv = state.inventory[side];
    const o = state.text[side];
    const preview = inv.preview || [];
    if (o.headerRecord > 0 && preview[o.headerRecord - 1]) return preview[o.headerRecord - 1];
    const width = preview[0] ? preview[0].length : 0;
    return Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
}

function select(id, options, value, onChange, label) {
    const s = el('select', { id, onchange: (e) => onChange(e.target.value) },
        options.map(([v, text]) => el('option', { value: v, text, selected: v === value })));
    return el('label', { className: 'dd-field', for: id }, label, s);
}

function renderTextOptions(side) {
    const box = $(`${side}TextOptions`);
    const o = state.text[side];
    const inv = state.inventory[side];
    const changed = (rerender = false) => { markStale(); if (rerender) renderTextOptions(side); };
    // replaceChildren writes null as the text "null", so absent parts are filtered.
    box.replaceChildren(...[
        el('div', { className: 'dd-option-row' },
            select(`${side}Delimiter`, DELIMITERS, o.delimiter, (v) => {
                o.delimiter = v; o.types = []; markStale(); openSource(side);
            }, 'Delimiter'),
            el('label', { className: 'dd-field', for: `${side}HeaderRecord` }, 'Header record',
                el('input', {
                    id: `${side}HeaderRecord`, type: 'number', min: '0', step: '1', value: String(o.headerRecord),
                    onchange: (e) => { o.headerRecord = Math.max(0, Math.floor(Number(e.target.value) || 0)); o.types = []; changed(true); },
                })),
            el('label', { className: 'dd-check', for: `${side}Generated` },
                el('input', { id: `${side}Generated`, type: 'checkbox', checked: o.generatedHeaders, onchange: (e) => { o.generatedHeaders = e.target.checked; changed(); } }),
                ' Generated column names'),
            select(`${side}Empty`, [['blank', 'blank'], ['empty-string', 'empty text']], o.emptyFields, (v) => { o.emptyFields = v; changed(); }, 'Empty fields read as'),
            select(`${side}Decimal`, [['.', 'point (1.5)'], [',', 'comma (1,5)']], o.decimal, (v) => { o.decimal = v; changed(true); }, 'Decimal mark'),
            select(`${side}Thousands`, [['', 'none'], [',', 'comma'], ['.', 'point'], [' ', 'space'], ["'", 'apostrophe']], o.thousands, (v) => { o.thousands = v; changed(true); }, 'Thousands separator'),
            select(`${side}DateFormat`, [['M/D/YYYY', 'M/D/YYYY'], ['D/M/YYYY', 'D/M/YYYY'], ['D.M.YYYY', 'D.M.YYYY'], ['YYYY-MM-DD', 'YYYY-MM-DD']], o.dateFormat, (v) => { o.dateFormat = v; changed(); }, 'Date columns use'),
            select(`${side}DateSystem`, [['1900', '1900 date system'], ['1904', '1904 date system']], o.dateSystem, (v) => { o.dateSystem = v; changed(); }, 'Dates become serials in'),
        ),
        o.thousands && o.thousands === o.decimal
            ? el('p', { className: 'dd-warn', text: 'The decimal mark and thousands separator are the same character. Change one of them.' }) : null,
        el('div', { className: 'dd-columns' },
            el('p', { className: 'dd-note', text: o.headerRecord > (inv.preview || []).length ? 'The header record is past the first 20 records; types apply by column position.' : 'Column types (Auto reads a column as numbers only if every value is a plain number with no leading zero):' }),
            columnNames(side).map((name, i) => select(`${side}Type${i}`,
                [['auto', 'Auto'], ['text', 'Text'], ['number', 'Number'], ['boolean', 'TRUE / FALSE'], ['date', 'Date']],
                o.types[i] || 'auto', (v) => { o.types[i] = v; changed(); }, name === '' ? `Column ${i + 1}` : name))),
        previewTable(inv.preview || []),
    ].filter(Boolean));
    box.hidden = false;
}

function previewTable(records) {
    if (!records.length) return null;
    const shown = records.slice(0, 6);
    const width = Math.max(...shown.map((r) => r.length));
    return el('details', { className: 'dd-preview' },
        el('summary', { text: `First ${shown.length} records as read` }),
        el('div', { className: 'table-scroll' },
            el('table', { className: 'dd-table dd-mini' },
                el('tbody', {}, shown.map((r, i) => el('tr', {},
                    el('th', { scope: 'row', text: String(i + 1) }),
                    Array.from({ length: width }, (_, c) => el('td', { text: r[c] === undefined ? '' : r[c] }))))))));
}

// ---------------------------------------------------------------- pairs

function newPair(left, right) {
    return { id: `p${state.nextPair++}`, include: true, left: { sheet: left, range: null }, right: { sheet: right, range: null } };
}

function defaultPairs(L, R) {
    const named = suggestPairs(L, R).map((p) => newPair(p.left.sheet, p.right.sheet));
    if (named.length) return named;
    if (L.sheets.length === 1 && R.sheets.length === 1) return [newPair(L.sheets[0].name, R.sheets[0].name)];
    // A side with one table (a text file, or a one-sheet workbook) fills itself in.
    const only = (inv) => (inv.sheets.length === 1 ? inv.sheets[0].name : '');
    const first = L.sheets.find((s) => !s.hidden) || L.sheets[0];
    return [newPair(only(L) || (first ? first.name : ''), only(R))];
}

// A text source is one table named after its file, so pairs follow it.
function syncPairs() {
    const L = state.inventory.left;
    const R = state.inventory.right;
    if (L && R && state.pairs.length === 0) state.pairs = defaultPairs(L, R);
    for (const side of SIDES) {
        const inv = state.inventory[side];
        if (inv && inv.kind === 'text') for (const p of state.pairs) p[side].sheet = inv.sheets[0].name;
    }
}

function planNow() {
    const L = state.inventory.left;
    const R = state.inventory.right;
    if (!L || !R) return null;
    return validatePlan(state.pairs, { left: L, right: R });
}

function pairStatus(pair, plan) {
    if (!pair.include) return 'Not included';
    const i = state.pairs.filter((p) => p.include).indexOf(pair);
    const st = plan && plan.status[i];
    const out = [];
    for (const side of SIDES) {
        if (!pair[side].sheet) out.push(`Choose a ${side} sheet`);
        else if (st && st.missing.includes(side)) out.push(`No ${side} sheet "${pair[side].sheet}"`);
    }
    if (plan) {
        for (const e of plan.errors) if (e.kind === 'duplicate-pair' && e.pairs[1] === pair.id) out.push('Same ranges as another pair');
        for (const side of SIDES) if (plan.reuse[side].some((r) => r.sheet === pair[side].sheet)) out.push(`${NAMES[side]} sheet used in more than one pair`);
    }
    if (state.sources.left && state.sources.right && state.sources.left.kind !== state.sources.right.kind) out.push('Mixed formats: see the note in the results');
    return out.length ? out.join('. ') : 'Ready';
}

function sheetSelect(pair, side, index) {
    const inv = state.inventory[side];
    const sheets = inv ? inv.sheets : [];
    const names = sheets.map((s) => s.name);
    const options = [];
    if (!pair[side].sheet) options.push(el('option', { value: '', text: 'Choose...', selected: true }));
    if (pair[side].sheet && !names.includes(pair[side].sheet)) options.push(el('option', { value: pair[side].sheet, text: `${pair[side].sheet} (missing)`, selected: true }));
    for (const s of sheets) options.push(el('option', { value: s.name, text: s.name + (s.hidden ? ' (hidden)' : ''), selected: s.name === pair[side].sheet }));
    return el('select', {
        'aria-label': `Pair ${index + 1} ${side} sheet`,
        disabled: !inv || inv.kind === 'text',
        onchange: (e) => { pair[side].sheet = e.target.value; markStale(); renderPairs(); },
    }, options);
}

function rangeInput(pair, side, index) {
    const inv = state.inventory[side];
    const sheet = inv && inv.sheets.find((s) => s.name === pair[side].sheet);
    const text = inv && inv.kind === 'text';
    return el('input', {
        type: 'text', className: 'dd-range', value: pair[side].range || '',
        placeholder: text ? 'whole file' : (sheet && sheet.valueRange) || 'A1:D20',
        disabled: text, 'aria-label': `Pair ${index + 1} ${side} range`, spellcheck: 'false',
        onchange: (e) => { pair[side].range = e.target.value.trim() || null; markStale(); renderPairStatuses(); },
    });
}

function renderPairs() {
    const body = $('pairsBody');
    body.replaceChildren(...state.pairs.map((pair, i) => el('tr', { dataset: { pair: pair.id } },
        el('td', {}, el('input', {
            type: 'checkbox', checked: pair.include, 'aria-label': `Include pair ${i + 1}`,
            onchange: (e) => { pair.include = e.target.checked; markStale(); renderPairStatuses(); },
        })),
        el('td', {}, sheetSelect(pair, 'left', i)),
        el('td', {}, rangeInput(pair, 'left', i)),
        el('td', {}, sheetSelect(pair, 'right', i)),
        el('td', {}, rangeInput(pair, 'right', i)),
        el('td', { className: 'dd-pair-status' }),
        el('td', {}, el('button', {
            type: 'button', className: 'tool-btn small', 'aria-label': `Remove pair ${i + 1}`, text: 'Remove',
            onclick: () => { state.pairs.splice(state.pairs.indexOf(pair), 1); markStale(); renderPairs(); },
        })),
    )));
    renderPairStatuses();
}

function renderPairStatuses() {
    const plan = planNow();
    for (const row of $('pairsBody').rows) {
        const pair = state.pairs.find((p) => p.id === row.dataset.pair);
        row.querySelector('.dd-pair-status').textContent = pairStatus(pair, plan);
    }
    const ex = plan ? plan.excluded : { left: [], right: [] };
    const list = (side) => ex[side].map((s) => s.name + (s.hidden ? ' (hidden)' : '')).join(', ');
    const parts = SIDES.filter((s) => ex[s].length).map((s) => `${s} ${list(s)}`);
    $('excludedSheets').textContent = parts.length ? `Not compared: ${parts.join('; ')}.` : '';
}

// ---------------------------------------------------------------- run

function progress(text) { $('progress').textContent = text; }

function planError(message) {
    const box = $('planErrors');
    box.textContent = message || '';
    box.hidden = !message;
}

function sideLabel(side, pair) {
    const src = state.sources[side];
    if (src.kind === 'text') return src.name;
    return `${src.name}!${pair[side].sheet}${pair[side].range ? ` ${pair[side].range}` : ''}`;
}

function tableRequest(side, pair) {
    if (state.sources[side].kind === 'workbook') return { sheet: pair[side].sheet, range: pair[side].range, raw: true };
    const o = state.text[side];
    return {
        raw: true,
        options: {
            headerRecord: o.headerRecord, generatedHeaders: o.generatedHeaders, emptyFields: o.emptyFields,
            types: o.types.slice(), decimal: o.decimal, thousands: o.thousands,
            dateFormat: o.dateFormat, dateSystem: o.dateSystem,
        },
    };
}

function reasonText(r) {
    if (!r) return '';
    if (r.kind === 'leading-zero') return `: "${r.value}" in record ${r.record} has a leading zero`;
    if (r.kind === 'not-a-number') return `: "${r.value}" in record ${r.record} is not a plain number`;
    if (r.kind === 'no-values') return ': no values';
    if (r.kind === 'date-format') {
        const first = r.misses[0];
        return `: ${fmt(r.count)} value${r.count === 1 ? '' : 's'} cannot be read as ${r.format} in the ${r.system} date system, such as "${first.value}" in record ${first.record}`;
    }
    return '';
}

const listUpTo = (items) => (items.length > 10 ? `${items.slice(0, 10).join(', ')} and ${items.length - 10} more` : items.join(', '));

function sideNotes(side, res) {
    const S = NAMES[side];
    const out = [];
    if (state.sources[side].kind === 'text') {
        const o = state.text[side];
        const inv = state.inventory[side];
        out.push(`${S} import: ${inv.encoding}, ${DELIM_NAME[inv.delimiter] || 'custom'}-delimited, `
            + `${o.headerRecord ? `header record ${o.headerRecord}` : 'generated column names'}, `
            + `empty fields read as ${o.emptyFields === 'blank' ? 'blank' : 'empty text'}`
            + `${o.decimal === ',' ? ', decimal comma' : ''}${o.thousands ? `, thousands separator "${o.thousands}"` : ''}.`);
        out.push(`${S} column types: ${res.columns.map((c) => `${c.header || '(no header)'} ${c.type}`
            + (c.chosen === 'auto' ? ` (inferred${reasonText(c.reason)})`
                : c.chosen === 'date' && c.type === 'date' ? ` (${c.dateFormat}, ${c.dateSystem} date system)`
                    : c.chosen === 'date' ? ` (chosen as dates${reasonText(c.reason)})` : ' (chosen)')).join('; ')}.`);
    } else {
        const i = res.info;
        out.push(`${S} range ${i.sheet}!${i.range}${i.detected ? ' (the cells holding values'
            + (i.ref && i.ref !== i.range ? `; the sheet's stored range is ${i.ref}` : '') + ')' : ''}.`);
        if (i.hiddenRows.length) out.push(`${S}: hidden rows ${listUpTo(i.hiddenRows)} are inside the range and were compared.`);
        if (i.hiddenColumns.length) out.push(`${S}: hidden columns ${listUpTo(i.hiddenColumns)} are inside the range and were compared.`);
        if (i.formulaCells) out.push(`${S}: ${fmt(i.formulaCells)} formula cell${i.formulaCells === 1 ? '' : 's'} compared by the result Excel stored; nothing was recalculated.`);
    }
    for (const w of res.warnings || []) {
        if (w.kind === 'long-integers') out.push(`${S}: ${fmt(w.count)} number${w.count === 1 ? ' has' : 's have'} more than 15 digits. Excel keeps 15, so identifiers like these may already have been rounded.`);
    }
    return out;
}

function pairNotes(results) {
    const notes = [];
    const [L, R] = SIDES.map((s) => state.sources[s]);
    if (L.kind !== R.kind) {
        notes.push('Mixed formats: one side is a workbook and the other is text. Excel writes displayed text when it saves a CSV or copies cells, so dates, rounded numbers and long decimals will differ from the stored workbook values.');
    }
    for (const side of SIDES) {
        const inv = state.inventory[side];
        if (inv.limitations && inv.limitations.length) {
            notes.push(`${NAMES[side]} is ${inv.format.toUpperCase()}: ${inv.limitations.join('; ')}.`);
        }
    }
    SIDES.forEach((side, k) => {
        const other = SIDES[1 - k];
        const dates = (results[k].columns || []).filter((c) => c.type === 'date');
        const system = state.inventory[other].dateSystem;
        if (dates.length && system && dates[0].dateSystem !== system) {
            notes.push(`${NAMES[side]} dates were converted to the ${dates[0].dateSystem} date system, but the ${other} workbook uses ${system}, so equal dates will differ. Change Dates become serials in.`);
        }
    });
    const [dl, dr] = SIDES.map((s) => state.inventory[s].dateSystem);
    if (dl && dr && dl !== dr) {
        notes.push(`Date systems differ: left ${dl}, right ${dr}. Date serials are compared as stored, so one calendar date has two different serials.`);
    }
    SIDES.forEach((s, k) => notes.push(...sideNotes(s, results[k])));
    return notes;
}

async function addPair(pair) {
    const summary = await runner.request('compare', { type: 'run-pair', pair });
    return { ...summary, label: pair.label, notes: pair.notes };
}

async function compare() {
    if (state.running) return;
    planError(null);
    if (!state.sources.left || !state.sources.right) { planError('Choose a source on both sides first.'); return; }
    for (const side of SIDES) {
        const o = state.text[side];
        if (state.sources[side].kind === 'text' && o.thousands && o.thousands === o.decimal) {
            planError(`${NAMES[side]}: the decimal mark and thousands separator are the same character.`);
            return;
        }
    }
    state.running = true;
    state.stopping = false;
    $('compareBtn').disabled = true;
    $('stopBtn').disabled = false;
    try {
        for (const side of SIDES) {
            if (!state.inventory[side] || !state.loaded[side]) {
                progress(`Reading the ${side} source...`);
                const opened = await ensureOpen(side);
                if (!opened.ok) {
                    if (!state.stopping) planError(`The ${side} source could not be read; see its panel.`);
                    progress(state.stopping ? 'Stopped before anything was compared.' : '');
                    return;
                }
            }
        }
        const plan = planNow();
        if (!plan.ok) {
            planError(plan.errors.map((e) => (e.kind === 'no-pairs'
                ? 'Include at least one pair.' : `Pairs ${e.pairs.join(' and ')} compare the same ranges; remove one.`)).join(' '));
            progress('');
            return;
        }
        const included = state.pairs.filter((p) => p.include);
        const n = included.length;
        await runner.request('compare', { type: 'run-start' });
        const summaries = [];
        const unfinished = [];
        for (let i = 0; i < n; i++) {
            const pair = included[i];
            const label = `${sideLabel('left', pair)} -> ${sideLabel('right', pair)}`;
            const notFinished = async () => {
                unfinished.push(i + 1);
                summaries.push(await addPair({ label, notes: [], incomplete: { reason: 'not-finished' } }));
            };
            if (state.stopping) { await notFinished(); continue; }
            if (!plan.status[i].ready) {
                const missing = plan.status[i].missing.map((s) => `no ${s} sheet "${pair[s].sheet}"`).join(' and ');
                summaries.push(await addPair({ label, notes: [`Missing sheet: ${missing || 'no sheet chosen'}.`], incomplete: { reason: 'missing-sheet' } }));
                continue;
            }
            const reopened = await Promise.all(SIDES.map((s) => ensureOpen(s)));
            if (state.stopping) { await notFinished(); continue; }
            progress(`Pair ${i + 1} of ${n}: reading tables...`);
            const got = reopened.every((r) => r.ok)
                ? await Promise.allSettled(SIDES.map((s) => runner.table(s, tableRequest(s, pair))))
                : reopened.map((r) => (r.ok ? { status: 'rejected', reason: { kind: 'cancelled' } } : { status: 'rejected', reason: r.error }));
            if (state.stopping) { await notFinished(); continue; }
            const failed = got.map((g, k) => (g.status === 'rejected' ? `${NAMES[SIDES[k]]}: ${describeError(g.reason)}` : null)).filter(Boolean);
            if (failed.length) {
                summaries.push(await addPair({ label, notes: failed, incomplete: { reason: 'import-refused' } }));
                continue;
            }
            progress(`Pair ${i + 1} of ${n}: comparing...`);
            const results = got.map((g) => g.value);
            summaries.push(await addPair({ label, notes: pairNotes(results), left: results[0].table, right: results[1].table }));
        }
        progress('Writing the report...');
        const fin = await runner.request('compare', {
            type: 'run-finish', cap: PREVIEW_CAP,
            meta: {
                toolVersion: VERSION, leftLabel: state.sources.left.name, rightLabel: state.sources.right.name,
                excluded: plan.excluded, unfinished,
            },
        });
        renderResults(summaries, fin, plan, unfinished);
        progress(unfinished.length
            ? `Stopped. ${unfinished.length} of ${n} pair${n === 1 ? '' : 's'} did not finish and ${unfinished.length === 1 ? 'is' : 'are'} reported as incomplete.`
            : `Compared ${n} pair${n === 1 ? '' : 's'}.`);
    } catch (e) {
        progress(`The comparison could not finish: ${describeError(e)}`);
    } finally {
        state.running = false;
        state.stopping = false;
        $('compareBtn').disabled = false;
        $('stopBtn').disabled = true;
    }
}

function stop() {
    if (!state.running || state.stopping) return;
    state.stopping = true;
    runner.stopReading();
    state.loaded.left = false;
    state.loaded.right = false;
    $('stopBtn').disabled = true;
    progress('Stopping: reading was cancelled. The report covers the pairs already compared.');
}

// ---------------------------------------------------------------- results

function markStale() {
    if (!state.hasRun) return;
    $('staleNote').hidden = false;
    $('resultsPanel').classList.add('is-stale');
}

function renderResults(summaries, fin, plan, unfinished) {
    state.hasRun = true;
    $('resultsPanel').hidden = false;
    $('resultsPanel').classList.remove('is-stale');
    $('staleNote').hidden = true;
    const a = fin.aggregate;
    const ex = plan.excluded;
    const notCompared = SIDES.filter((s) => ex[s].length).map((s) => `${s} ${ex[s].map((x) => x.name + (x.hidden ? ' (hidden)' : '')).join(', ')}`);
    // replaceChildren writes null as the text "null", so absent parts are filtered.
    $('aggregate').replaceChildren(...[
        el('p', { className: 'dd-agg-line' },
            el('strong', { text: summaries.length === 1 ? 'Selected pair' : `All ${summaries.length} selected pairs` }),
            el('span', { dataset: { check: 'sameOrder' } }, 'Same row order: ', verdictBadge(a.sameOrder)),
            el('span', { dataset: { check: 'sorted' } }, 'Sorted all columns: ', verdictBadge(a.sorted))),
        notCompared.length ? el('p', { className: 'dd-note', text: `Not compared: ${notCompared.join('; ')}.` }) : null,
        unfinished.length ? el('p', { className: 'dd-warn', text: `Stopped before pair${unfinished.length === 1 ? '' : 's'} ${unfinished.join(', ')} finished. An incomplete run never counts as a match.` }) : null,
    ].filter(Boolean));
    $('summaryBody').replaceChildren(...summaries.map((s, i) => el('tr', {},
        el('th', { scope: 'row', text: `${i + 1}. ${s.label}` }),
        el('td', { dataset: { check: 'sameOrder' } }, verdictBadge(s.sameOrder)),
        el('td', { dataset: { check: 'sorted' } }, verdictBadge(s.sorted)),
        el('td', { text: s.leftRows === null ? 'n/a' : `${fmt(s.leftRows)} / ${fmt(s.rightRows)}` }),
        el('td', {},
            el('p', { className: 'dd-headline', text: s.headline }),
            s.notes.length ? el('ul', { className: 'dd-notes' }, s.notes.map((t) => el('li', { text: t }))) : null),
    )));
    const p = fin.preview;
    $('reportBox').value = p.text;
    $('printText').textContent = p.text;
    const prompt = $('truncationPrompt');
    prompt.hidden = !p.truncated;
    prompt.textContent = p.truncated
        ? `The preview shows ${fmt(p.shownCodePoints)} of ${fmt(p.totalCodePoints)} characters. Export the full diff to see every difference; all of them were compared and counted.`
        : '';
    $('exportStatus').textContent = '';
}

function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function exportFull() {
    const status = $('exportStatus');
    status.textContent = 'Preparing the full report...';
    try {
        const { blob, totalCodePoints } = await runner.request('compare', { type: 'run-export' });
        download(blob, 'dataset-diff-report.txt');
        status.textContent = `Saved the full report: ${fmt(totalCodePoints)} characters.`;
    } catch (e) {
        status.textContent = `Export failed and nothing was saved: ${describeError(e)}`;
    }
}

const OTHER_EXPORTS = {
    'positional-csv': ['dataset-diff-positional.csv', 'positional differences'],
    'sorted-csv': ['dataset-diff-one-side-only.csv', 'rows on one side only'],
    json: ['dataset-diff-results.json', 'full results'],
};

async function exportOther(kind) {
    const [name, what] = OTHER_EXPORTS[kind];
    const status = $('exportStatus');
    status.textContent = `Preparing the ${what}...`;
    try {
        const { blob } = await runner.request('compare', { type: 'run-export', kind });
        download(blob, name);
        status.textContent = `Saved the ${what} as ${name}.`;
    } catch (e) {
        status.textContent = `Export failed and nothing was saved: ${describeError(e)}`;
    }
}

async function copyShown() {
    const text = $('reportBox').value;
    try {
        await navigator.clipboard.writeText(text);
        $('exportStatus').textContent = `Copied the ${fmt([...text].length)} characters shown in the preview. Use Export for the full diff.`;
    } catch (e) {
        $('exportStatus').textContent = 'Copy failed. Select the text in the box and copy it by hand.';
    }
}

// ---------------------------------------------------------------- settings files

function recipeStatus(text) { $('recipeStatus').textContent = text; }

function saveRecipe() {
    const kinds = { left: state.sources.left && state.sources.left.kind, right: state.sources.right && state.sources.right.kind };
    const recipe = buildRecipe({ toolVersion: VERSION, pairs: state.pairs, kinds, text: state.text, encoding: state.encoding });
    const blob = new Blob([`${JSON.stringify(recipe, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'dataset-diff-settings.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    recipeStatus(`Saved settings for ${state.pairs.length} pair${state.pairs.length === 1 ? '' : 's'}. The file holds no file names or table values.`);
}

async function loadRecipe(file) {
    const parsed = parseRecipe(await file.text());
    if (!parsed.ok) {
        recipeStatus(`Settings not loaded: ${parsed.errors.slice(0, 5).join(' ')}`);
        return;
    }
    const r = parsed.recipe;
    state.pairs = r.pairs.map((p) => ({
        id: `p${state.nextPair++}`, include: p.include,
        left: { sheet: p.left.sheet || '', range: p.left.range },
        right: { sheet: p.right.sheet || '', range: p.right.range },
    }));
    for (const side of SIDES) {
        state.text[side] = { ...defaultText(), ...r.text[side] };
        state.encoding[side] = r.encoding[side];
        $(`${side}Encoding`).value = r.encoding[side];
        state.keepSettings[side] = true;
    }
    syncPairs();
    renderPairs();
    markStale();
    const reopen = SIDES.filter((s) => state.sources[s] && state.sources[s].kind === 'text');
    for (const side of reopen) {
        state.keepSettings[side] = false;
        await openSource(side);
    }
    recipeStatus(`Loaded settings for ${state.pairs.length} pair${state.pairs.length === 1 ? '' : 's'}.`
        + (state.sources.left && state.sources.right ? ' Check the pairs, then Compare.' : ' Choose the files; the settings apply to them.'));
}

// ---------------------------------------------------------------- examples

async function loadExample(index) {
    const ex = EXAMPLES[index];
    if (!ex || state.running) return;
    progress(`Loading the example "${ex.label}"...`);
    state.pairs = [];
    try {
        const files = await Promise.all([ex.left, ex.right].map(async (name) => {
            const response = await fetch(DATA + name);
            if (!response.ok) throw new Error(`${name} could not be loaded`);
            return new File([await response.blob()], name);
        }));
        const loaded = await Promise.all(SIDES.map((s, k) => loadSource(s, { name: files[k].name, file: files[k] })));
        if (ex.pairs && loaded.every(Boolean)) state.pairs = ex.pairs.map(([l, r]) => newPair(l, r));
        renderPairs();
        progress(`Loaded the example "${ex.label}". Select Compare.`);
    } catch (e) {
        progress(`The example could not be loaded: ${e.message}`);
    }
}

// ---------------------------------------------------------------- wiring

function init() {
    for (const side of SIDES) {
        const input = $(`${side}File`);
        input.addEventListener('change', () => {
            const f = input.files[0];
            if (f) loadSource(side, { name: f.name, file: f });
        });
        $(`${side}PasteUse`).addEventListener('click', () => {
            const text = $(`${side}Paste`).value;
            if (!text) { showErrors(side, 'Paste a table into the box first.'); return; }
            loadSource(side, { name: `Pasted text (${side})`, text });
        });
        const zone = document.querySelector(`.dd-source[data-side="${side}"]`);
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-drop'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('is-drop'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('is-drop');
            const f = e.dataTransfer.files[0];
            if (f) loadSource(side, { name: f.name, file: f });
        });
    }
    const ex = $('exampleSelect');
    EXAMPLES.forEach((x, i) => ex.append(el('option', { value: String(i), text: x.label })));
    ex.addEventListener('change', () => { if (ex.value !== '') loadExample(Number(ex.value)); ex.value = ''; });

    $('addPair').addEventListener('click', () => {
        const L = state.inventory.left;
        const R = state.inventory.right;
        const one = (inv) => (inv && inv.sheets.length === 1 ? inv.sheets[0].name : '');
        state.pairs.push(newPair(one(L), one(R)));
        markStale();
        renderPairs();
    });
    $('suggestPairs').addEventListener('click', () => {
        if (!state.inventory.left || !state.inventory.right) { planError('Load both sources first.'); return; }
        state.pairs = defaultPairs(state.inventory.left, state.inventory.right);
        markStale();
        renderPairs();
    });
    for (const side of SIDES) {
        $(`${side}Encoding`).addEventListener('change', (e) => {
            state.encoding[side] = e.target.value;
            markStale();
            if (state.sources[side] && state.sources[side].kind === 'text') openSource(side);
        });
    }
    $('saveRecipe').addEventListener('click', saveRecipe);
    $('loadRecipe').addEventListener('click', () => $('recipeFile').click());
    $('recipeFile').addEventListener('change', (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        if (f) loadRecipe(f);
    });
    $('compareBtn').addEventListener('click', compare);
    $('stopBtn').addEventListener('click', stop);
    $('exportFull').addEventListener('click', exportFull);
    $('copyShown').addEventListener('click', copyShown);
    $('exportPositional').addEventListener('click', () => exportOther('positional-csv'));
    $('exportSorted').addEventListener('click', () => exportOther('sorted-csv'));
    $('exportJson').addEventListener('click', () => exportOther('json'));
    $('printReport').addEventListener('click', () => window.print());
    $('wrapToggle').addEventListener('change', (e) => {
        $('reportBox').wrap = e.target.checked ? 'soft' : 'off';
        $('reportBox').classList.toggle('is-nowrap', !e.target.checked);
    });
    $('disclaimerLink').addEventListener('click', () => { $('scopeDisclaimer').open = true; });
    const dialog = $('attributionsModal');
    $('viewLicenses').addEventListener('click', () => dialog.showModal());
    $('closeAttributions').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    renderPairs();
    runner.warm();
}

init();
