// Secondary exports of a finished run: a CSV of positional differences, a CSV
// of rows found on one side only, and a lossless JSON report. Pure, no DOM.
// Every export is built from the result records, never from the preview, as
// text chunks so a large run never needs one giant string.

import { UNRESOLVED, formatDecimal, describeCell } from './diff-values.js';
import { rowRef, cellRef, headline } from './diff-report.js';

const CHUNK = 1 << 20;

function chunker() {
    const chunks = [];
    let parts = [];
    let size = 0;
    return {
        push(s) {
            parts.push(s);
            size += s.length;
            if (size >= CHUNK) { chunks.push(parts.join('')); parts = []; size = 0; }
        },
        done() { if (parts.length) chunks.push(parts.join('')); return chunks; },
    };
}

// ---------------------------------------------------------------- CSV

// Text a spreadsheet would run as a formula starts with one of these. Such a
// value is written with a leading apostrophe and its row says so; the JSON
// export keeps the value as it was.
const FORMULA_START = /^[=+\-@\t\r]/;

function csvField(s) {
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// [type, value, escaped] for one cell.
function csvCell(cell) {
    if (cell === null || cell === undefined) return ['blank', '', false];
    if (cell === UNRESOLVED) return ['unresolved-formula', '', false];
    switch (cell[0]) {
        case 'n': return ['number', formatDecimal(cell[1]), false];
        case 'b': return ['boolean', cell[1] ? 'TRUE' : 'FALSE', false];
        case 'e': return ['error', cell[1], false];
        default: return FORMULA_START.test(cell[1]) ? ['text', `'${cell[1]}`, true] : ['text', cell[1], false];
    }
}

function safeText(s) {
    const text = String(s);
    return FORMULA_START.test(text) ? [`'${text}`, true] : [text, false];
}

function csvRow(fields) { return `${fields.map((f) => csvField(String(f))).join(',')}\r\n`; }

const POSITIONAL_HEAD = ['pair', 'pair_label', 'kind', 'left_ref', 'right_ref', 'header',
    'left_type', 'left_value', 'right_type', 'right_value', 'detail', 'formula_escaped'];

// One row per changed cell, one per cell of a row past the end of the other
// table, and one per pair that was not compared cell by cell.
export function positionalCsv(run) {
    const out = chunker();
    out.push(csvRow(POSITIONAL_HEAD));
    run.pairs.forEach((pair, i) => {
        const n = i + 1;
        const r = pair.result;
        const [label, labelEscaped] = safeText(pair.label);
        if (r.incomplete || (r.schema && r.schema.status !== 'same')) {
            const [detail, detailEscaped] = safeText(headline(r));
            out.push(csvRow([n, label, r.incomplete ? 'incomplete' : 'schema', '', '', '', '', '', '', '', detail,
                labelEscaped || detailEscaped ? 'yes' : 'no']));
            return;
        }
        const { left, right } = pair;
        const order = r.schema.order;
        const pairs = r.sameOrder.changed.data;
        const line = (kind, lref, rref, header, a, b) => {
            const [lt, lv, le] = a ? csvCell(a.cell) : ['', '', false];
            const [rt, rv, re] = b ? csvCell(b.cell) : ['', '', false];
            const [h, he] = safeText(header);
            out.push(csvRow([n, label, kind, lref, rref, h, lt, lv, rt, rv, '', labelEscaped || he || le || re ? 'yes' : 'no']));
        };
        for (let k = 0; k < r.sameOrder.changedCells; k++) {
            const row = pairs[k * 2];
            const col = pairs[k * 2 + 1];
            line('changed', cellRef(left, row, col), cellRef(right, row, order[col]), r.headers[col],
                { cell: left.rows[row][col] }, { cell: right.rows[row][order[col]] });
        }
        const [l0, l1] = r.sameOrder.extraLeft;
        for (let row = l0; row < l1; row++) {
            r.headers.forEach((h, col) => line('extra-left-row', cellRef(left, row, col), '', h, { cell: left.rows[row][col] }, null));
        }
        const [r0, r1] = r.sameOrder.extraRight;
        for (let row = r0; row < r1; row++) {
            r.headers.forEach((h, col) => line('extra-right-row', '', cellRef(right, row, order[col]), h, null, { cell: right.rows[row][order[col]] }));
        }
    });
    return out.done();
}

const SORTED_HEAD = ['pair', 'pair_label', 'side', 'copies', 'occurrences', 'source_rows', 'row', 'formula_escaped'];

// One row per distinct unmatched row pattern, with every source row holding it.
export function sortedCsv(run) {
    const out = chunker();
    out.push(csvRow(SORTED_HEAD));
    run.pairs.forEach((pair, i) => {
        const r = pair.result;
        if (!r.sorted || !r.sorted.leftOnly) return;
        const [label, labelEscaped] = safeText(pair.label);
        for (const [side, list, table] of [['left', r.sorted.leftOnly, pair.left], ['right', r.sorted.rightOnly, pair.right]]) {
            for (const g of list) {
                const row = `[${g.cells.map(describeCell).join(', ')}]`;
                out.push(csvRow([i + 1, label, side, g.copies, g.rows.length,
                    g.rows.map((x) => rowRef(table, x)).join(';'), row, labelEscaped ? 'yes' : 'no']));
            }
        }
    });
    return out.done();
}

// ---------------------------------------------------------------- JSON

const jsonCell = (c) => (c === UNRESOLVED ? ['u'] : c);

// Lossless: typed cells with canonical decimals as strings, every reference,
// every count. Written pair by pair and difference by difference.
export function jsonReport(run) {
    const out = chunker();
    const J = (v) => JSON.stringify(v);
    out.push(`{"format":"dataset-diff-report","version":1,"toolVersion":${J(run.toolVersion)},`);
    out.push(`"left":${J(run.left.label)},"right":${J(run.right.label)},`);
    out.push(`"excluded":${J(run.excluded)},"unfinished":${J(run.unfinished)},"aggregate":${J(run.aggregate)},"pairs":[`);
    run.pairs.forEach((pair, i) => {
        const r = pair.result;
        if (i) out.push(',');
        out.push(`{"pair":${i + 1},"label":${J(pair.label)},"notes":${J(pair.notes)},"headline":${J(headline(r))},`);
        out.push(`"leftRows":${J(r.leftRows ?? null)},"rightRows":${J(r.rightRows ?? null)},`);
        out.push(`"schema":${J(r.schema || null)},"incomplete":${J(r.incomplete || null)},"headers":${J(r.headers || null)},`);
        if (r.incomplete || !r.schema || r.schema.status !== 'same') {
            out.push(`"sameOrder":${J({ verdict: r.sameOrder.verdict })},"sorted":${J({ verdict: r.sorted.verdict })}}`);
            return;
        }
        const { left, right } = pair;
        const order = r.schema.order;
        const p = r.sameOrder;
        out.push(`"sameOrder":{"verdict":${J(p.verdict)},"changedCells":${p.changedCells},"changes":[`);
        for (let k = 0; k < p.changedCells; k++) {
            const row = p.changed.data[k * 2];
            const col = p.changed.data[k * 2 + 1];
            out.push(`${k ? ',' : ''}${J({
                leftRef: cellRef(left, row, col), rightRef: cellRef(right, row, order[col]), header: r.headers[col],
                left: jsonCell(left.rows[row][col]), right: jsonCell(right.rows[row][order[col]]),
            })}`);
        }
        const extra = (table, [a, b], project) => {
            const rows = [];
            for (let row = a; row < b; row++) rows.push({ sourceRow: rowRef(table, row), cells: project(table.rows[row]).map(jsonCell) });
            return rows;
        };
        out.push(`],"extraLeftRows":${J(extra(left, p.extraLeft, (cells) => cells))},`);
        out.push(`"extraRightRows":${J(extra(right, p.extraRight, (cells) => order.map((j) => cells[j])))}},`);
        const s = r.sorted;
        const groups = (list, table) => list.map((g) => ({ copies: g.copies, occurrences: g.rows.length, sourceRows: g.rows.map((x) => rowRef(table, x)), cells: g.cells.map(jsonCell) }));
        out.push(`"sorted":{"verdict":${J(s.verdict)},"matchedRows":${s.matchedRows},"leftOnlyRows":${s.leftOnlyRows},"rightOnlyRows":${s.rightOnlyRows},`);
        out.push(`"leftOnly":${J(groups(s.leftOnly, left))},"rightOnly":${J(groups(s.rightOnly, right))}}}`);
    });
    out.push(']}\n');
    return out.done();
}
