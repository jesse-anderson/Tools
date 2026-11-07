// The two checks for one table pair. Pure, no DOM.
//
// A table is { headers: string[], rows: cell[][] } with every row as wide as
// the headers; cells follow diff-values.js. Results hold row and column
// indexes, never copies of the tables; the report maps them to source cells.

import { UNRESOLVED, cellsEqual, rowKey, compareRows } from './diff-values.js';
import { alignHeaders } from './diff-schema.js';

// Growable list of (row, column) index pairs, so two million changed cells
// cost 16 MB rather than two million objects.
class PairList {
    constructor() { this.data = new Uint32Array(1024); this.length = 0; }
    push(a, b) {
        if (this.length * 2 + 2 > this.data.length) {
            const next = new Uint32Array(this.data.length * 2);
            next.set(this.data);
            this.data = next;
        }
        this.data[this.length * 2] = a;
        this.data[this.length * 2 + 1] = b;
        this.length++;
    }
    row(i) { return this.data[i * 2]; }
    col(i) { return this.data[i * 2 + 1]; }
}

function checkShape(table, side) {
    const width = table.headers.length;
    table.rows.forEach((row, i) => {
        if (row.length !== width) {
            throw new Error(`${side} row ${i} has ${row.length} cells for ${width} headers`);
        }
    });
}

function unresolvedCells(table, side) {
    const found = [];
    table.rows.forEach((row, r) => row.forEach((cell, c) => {
        if (cell === UNRESOLVED) found.push({ side, row: r, col: c });
    }));
    return found;
}

const unavailable = { verdict: 'unavailable' };
const incomplete = { verdict: 'incomplete' };

export function compareTables(left, right) {
    const base = { leftRows: left.rows.length, rightRows: right.rows.length, headers: left.headers };
    const schema = alignHeaders(left.headers, right.headers);
    if (schema.status !== 'same') {
        return { ...base, schema, sameOrder: unavailable, sorted: unavailable };
    }
    checkShape(left, 'left');
    checkShape(right, 'right');

    const unresolved = [...unresolvedCells(left, 'left'), ...unresolvedCells(right, 'right')];
    if (unresolved.length) {
        return {
            ...base, schema, sameOrder: incomplete, sorted: incomplete,
            incomplete: { reason: 'unresolved-formula', cells: unresolved },
        };
    }

    const sameOrder = positional(left.rows, right.rows, schema.order);
    const sorted = counted(left.rows, right.rows, schema.order);
    if (sameOrder.verdict === 'match' && sorted.verdict !== 'match') {
        throw new Error('engine defect: rows match in order but not after sorting');
    }
    return { ...base, schema, sameOrder, sorted };
}

function positional(leftRows, rightRows, order) {
    const changed = new PairList();
    const shared = Math.min(leftRows.length, rightRows.length);
    for (let r = 0; r < shared; r++) {
        const a = leftRows[r];
        const b = rightRows[r];
        for (let c = 0; c < order.length; c++) {
            if (!cellsEqual(a[c], b[order[c]])) changed.push(r, c);
        }
    }
    const verdict = changed.length === 0 && leftRows.length === rightRows.length ? 'match' : 'different';
    return {
        verdict,
        changed,
        changedCells: changed.length,
        // Rows past the end of the shorter table: [from, to) on that side.
        extraLeft: [shared, leftRows.length],
        extraRight: [shared, rightRows.length],
    };
}

// Whole-row multiset counts. Rows with equal keys form one group; matched
// copies are the smaller of the two counts and the rest are unmatched.
function counted(leftRows, rightRows, order) {
    const groups = new Map();
    const add = (cells, side, index) => {
        const key = rowKey(cells);
        let g = groups.get(key);
        if (!g) {
            g = { cells, left: [], right: [] };
            groups.set(key, g);
        }
        g[side].push(index);
    };
    leftRows.forEach((row, i) => add(row, 'left', i));
    rightRows.forEach((row, i) => add(order.map((j) => row[j]), 'right', i));

    const leftOnly = [];
    const rightOnly = [];
    let matchedRows = 0;
    for (const g of groups.values()) {
        const m = Math.min(g.left.length, g.right.length);
        matchedRows += m;
        if (g.left.length > m) leftOnly.push({ cells: g.cells, copies: g.left.length - m, rows: g.left });
        if (g.right.length > m) rightOnly.push({ cells: g.cells, copies: g.right.length - m, rows: g.right });
    }
    const byCells = (a, b) => compareRows(a.cells, b.cells);
    leftOnly.sort(byCells);
    rightOnly.sort(byCells);
    const leftOnlyRows = leftRows.length - matchedRows;
    const rightOnlyRows = rightRows.length - matchedRows;
    return {
        verdict: leftOnlyRows === 0 && rightOnlyRows === 0 ? 'match' : 'different',
        matchedRows,
        leftOnlyRows,
        rightOnlyRows,
        leftOnly,
        rightOnly,
    };
}
