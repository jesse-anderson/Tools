// The plaintext report. Pure, no DOM. One line generator feeds both the
// capped preview and the full export, so they cannot disagree.
//
// A run is { toolVersion, left: { label }, right: { label }, aggregate,
// excluded?, unfinished?, pairs: [{ label, left, right, notes?, result }] },
// where pair.left / pair.right are the compared tables plus optional
// rowRefs, colRefs and refStyle ('a1' for worksheets, 'record' for text).

import { describeCell, quoteText } from './diff-values.js';

export const PREVIEW_CAP = 50000;
export const TRUNCATION_MARK = '[Preview ends here. Export the full diff for everything after this point.]';
const PARTIAL_MARK = ' [line cut]';

// Unicode code points; a surrogate pair counts once.
export function codePointLength(s) {
    let n = s.length;
    for (let i = 0; i < s.length - 1; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF) {
            const d = s.charCodeAt(i + 1);
            if (d >= 0xDC00 && d <= 0xDFFF) { n--; i++; }
        }
    }
    return n;
}

const clean = (s) => quoteText(String(s)).slice(1, -1);
const word = (v) => String(v).toUpperCase();

function rowRef(table, r) { return table.rowRefs ? table.rowRefs[r] : r + 1; }
function colRef(table, c) { return table.colRefs ? table.colRefs[c] : c + 1; }
function cellRef(table, r, c) {
    return table.refStyle === 'a1'
        ? `${colRef(table, c)}${rowRef(table, r)}`
        : `record ${rowRef(table, r)} field ${colRef(table, c)}`;
}
const rowCells = (cells) => `[${cells.map(describeCell).join(', ')}]`;

const REASONS = {
    'unresolved-formula': 'formulas without stored results',
    'missing-sheet': 'a selected sheet is missing',
    'not-finished': 'the run stopped before this pair finished',
};

export function headline(result) {
    const s = result.schema;
    if (s && s.status === 'different') return 'Headers differ; values were not compared';
    if (s && s.status === 'ambiguous') return 'Headers need labels before values can be compared';
    if (result.incomplete) {
        return `Comparison incomplete: ${REASONS[result.incomplete.reason] || result.incomplete.reason}`;
    }
    const a = result.sameOrder.verdict;
    const b = result.sorted.verdict;
    const rows = `(${result.leftRows} data rows)`;
    if (a === 'match' && b === 'match') return `Same selected table values in the same row order ${rows}`;
    if (b === 'match') return `Same selected table values; row order differs ${rows}`;
    return 'Selected table values or row counts differ';
}

function* schemaLines(s) {
    if (s.status === 'different') {
        const list = (hs) => (hs.length ? hs.map(quoteText).join(', ') : 'none');
        yield `[HEADERS] missing on right: ${list(s.missingRight)}; extra on right: ${list(s.extraRight)}`;
        for (const m of s.nearMatches) {
            yield `[HEADERS] ${quoteText(m.left)} and ${quoteText(m.right)} differ only in case or outer spaces`;
        }
    } else {
        for (const p of s.problems) {
            if (p.kind === 'no-columns') yield `[HEADERS] ${p.side}: no columns`;
            else if (p.kind === 'blank-header') yield `[HEADERS] ${p.side}: column ${p.column + 1} has no header`;
            else yield `[HEADERS] ${p.side}: ${quoteText(p.header)} appears in columns ${p.columns.map((c) => c + 1).join(' and ')}`;
        }
    }
}

function* pairLines(pair, n) {
    const r = pair.result;
    yield `Pair ${n}: ${clean(pair.label)}`;
    yield `Same row order: ${word(r.sameOrder.verdict)} | Sorted all columns: ${word(r.sorted.verdict)}`;
    yield `Headline: ${headline(r)}`;
    for (const note of pair.notes || []) yield `Note: ${clean(note)}`;
    if (r.schema && r.schema.status !== 'same') { yield* schemaLines(r.schema); return; }
    if (r.incomplete) {
        for (const c of r.incomplete.cells || []) {
            yield `[UNRESOLVED] ${c.side} ${cellRef(pair[c.side], c.row, c.col)}: formula with no stored result`;
        }
        return;
    }
    const { left, right } = pair;
    const order = r.schema.order;
    if (r.schema.columnOrderChanged) yield '[COLUMNS] Right columns are in a different order; values are aligned by header.';

    const p = r.sameOrder;
    if (p.verdict === 'match') yield 'Same row order: no differences.';
    // Read the pair list's array directly: a result copied from a worker
    // keeps the data but not the class.
    const pairs = p.changed.data;
    for (let i = 0; i < p.changedCells; i++) {
        const row = pairs[i * 2];
        const col = pairs[i * 2 + 1];
        yield `[POSITION] left ${cellRef(left, row, col)} / right ${cellRef(right, row, order[col])}; `
            + `header=${quoteText(r.headers[col])}; `
            + `${describeCell(left.rows[row][col])} -> ${describeCell(right.rows[row][order[col]])}`;
    }
    for (let i = p.extraLeft[0]; i < p.extraLeft[1]; i++) {
        yield `[EXTRA LEFT ROW] left row ${rowRef(left, i)} has no right row at its position; ${rowCells(left.rows[i])}`;
    }
    for (let i = p.extraRight[0]; i < p.extraRight[1]; i++) {
        const cells = order.map((j) => right.rows[i][j]);
        yield `[EXTRA RIGHT ROW] right row ${rowRef(right, i)} has no left row at its position; ${rowCells(cells)}`;
    }

    const s = r.sorted;
    yield `Sorted all columns: matched ${s.matchedRows}, left only ${s.leftOnlyRows}, right only ${s.rightOnlyRows}; `
        + `distinct unmatched rows: left ${s.leftOnly.length}, right ${s.rightOnly.length}`;
    if (p.verdict !== 'match' && s.verdict === 'match') yield 'Sorted all columns: every row matches; only the row order differs.';
    for (const [tag, list, table] of [['LEFT ONLY', s.leftOnly, left], ['RIGHT ONLY', s.rightOnly, right]]) {
        for (const g of list) {
            const copies = g.copies === g.rows.length ? `copies=${g.copies}` : `copies=${g.copies} of ${g.rows.length}`;
            yield `[${tag}] ${copies}; source rows=[${g.rows.map((i) => rowRef(table, i)).join(', ')}]; ${rowCells(g.cells)}`;
        }
    }
}

export function* reportLines(run) {
    yield `Dataset Diff report, tool version ${run.toolVersion}`;
    if (run.unfinished && run.unfinished.length) {
        yield `INCOMPLETE: pairs ${run.unfinished.join(', ')} did not finish. Their differences are not in this report.`;
    }
    yield `Left: ${clean(run.left.label)}`;
    yield `Right: ${clean(run.right.label)}`;
    yield `Scope: ${run.pairs.length} selected pair${run.pairs.length === 1 ? '' : 's'}. Results describe the selected table values only.`;
    for (const side of ['left', 'right']) {
        const ex = run.excluded ? run.excluded[side] : [];
        if (ex.length) yield `Not compared, ${side}: ${ex.map((s) => clean(s.name) + (s.hidden ? ' (hidden)' : '')).join(', ')}`;
    }
    const a = run.aggregate;
    yield `All selected pairs: Same row order: ${word(a.sameOrder)} | Sorted all columns: ${word(a.sorted)}`;
    yield `Rows summed across pair comparisons: left ${a.summedLeftRows}, right ${a.summedRightRows}`;
    for (const [i, pair] of run.pairs.entries()) {
        const r = pair.result;
        yield `Pair ${i + 1}: ${clean(pair.label)} | Same row order: ${word(r.sameOrder.verdict)} | `
            + `Sorted all columns: ${word(r.sorted.verdict)} | rows ${r.leftRows ?? '?'} / ${r.rightRows ?? '?'}`;
    }
    for (const [i, pair] of run.pairs.entries()) {
        yield '';
        yield* pairLines(pair, i + 1);
    }
}

// The text shown in the box: whole lines up to `cap` code points including
// newlines and the truncation mark. One cap for the whole report. If the
// first line alone is too long, a cut part of it is shown and marked.
export function preview(lines, cap = PREVIEW_CAP, { countTotal = true } = {}) {
    const kept = [];
    let used = 0;
    let total = 0;
    let truncated = false;
    let first = null;
    for (const line of lines) {
        if (first === null) first = line;
        const n = codePointLength(line) + 1;
        total += n;
        if (!truncated && used + n <= cap) {
            kept.push(line);
            used += n;
        } else {
            truncated = true;
            if (!countTotal) break;
        }
    }
    if (!truncated) {
        return { text: kept.map((l) => l + '\n').join(''), truncated, shownCodePoints: used, totalCodePoints: total };
    }
    const mark = codePointLength(TRUNCATION_MARK) + 1;
    while (kept.length && used + mark > cap) used -= codePointLength(kept.pop()) + 1;
    if (!kept.length && first !== null) {
        const room = cap - mark - 1 - PARTIAL_MARK.length;
        const cut = Array.from(first).slice(0, Math.max(0, room)).join('') + PARTIAL_MARK;
        kept.push(cut);
        used = codePointLength(cut) + 1;
    }
    const text = kept.map((l) => l + '\n').join('') + TRUNCATION_MARK + '\n';
    return {
        text, truncated,
        shownCodePoints: used + mark,
        totalCodePoints: countTotal ? total : null,
    };
}
