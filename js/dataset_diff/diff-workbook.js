// XLSX workbooks to engine tables. Pure: the caller passes the SheetJS
// workbook it read with READ_OPTIONS, so this file needs no SheetJS itself.

import { LIMITS } from './diff-limits.js';
import { fromSheetCell, UNRESOLVED, formatDecimal, isLongInteger } from './diff-values.js';

// dense: rows as arrays. sheetStubs: keep formulas with no stored result,
// which are otherwise dropped and would read as blank. cellStyles: hidden
// rows and columns. cellText and cellHTML off: display text is never used.
export const READ_OPTIONS = Object.freeze({
    type: 'array', dense: true, sheetStubs: true, cellStyles: true,
    cellText: false, cellHTML: false, cellFormula: true, cellDates: false, bookVBA: false,
});

// ---------------------------------------------------------------- container

const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u16 = (b, i) => b[i] | (b[i + 1] << 8);

// Reads the ZIP central directory before any parser expands it. Declared
// sizes can lie, so the worker's time limit still applies afterward.
export function auditContainer(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length > LIMITS.fileBytes) return { ok: false, error: { kind: 'limit', limit: 'fileBytes', value: b.length, max: LIMITS.fileBytes } };
    if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) {
        // An OLE container: a legacy .xls or a password-encrypted workbook.
        return { ok: false, error: { kind: 'ole-container' } };
    }
    if (!(b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04)) {
        return { ok: false, error: { kind: 'not-a-workbook' } };
    }
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
        if (u32(b, i) === 0x06054B50) { eocd = i; break; }
    }
    if (eocd < 0) return { ok: false, error: { kind: 'damaged-zip' } };
    const count = u16(b, eocd + 10);
    let p = u32(b, eocd + 16);
    if (count === 0xFFFF || p === 0xFFFFFFFF) return { ok: false, error: { kind: 'zip64' } };
    let total = 0;
    const names = [];
    for (let k = 0; k < count; k++) {
        if (p + 46 > b.length || u32(b, p) !== 0x02014B50) return { ok: false, error: { kind: 'damaged-zip' } };
        const size = u32(b, p + 24);
        const nameLen = u16(b, p + 28);
        if (size === 0xFFFFFFFF) return { ok: false, error: { kind: 'zip64' } };
        total += size;
        names.push(new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen)));
        p += 46 + nameLen + u16(b, p + 30) + u16(b, p + 32);
    }
    if (total > LIMITS.zipUncompressedBytes) {
        return { ok: false, error: { kind: 'limit', limit: 'zipUncompressedBytes', value: total, max: LIMITS.zipUncompressedBytes } };
    }
    if (!names.includes('xl/workbook.xml')) {
        // XLSB keeps xl/workbook.bin; ODS has no xl/ folder. Both are Phase 6.
        return { ok: false, error: { kind: names.includes('xl/workbook.bin') ? 'xlsb-not-yet' : 'not-xlsx' } };
    }
    return { ok: true, entries: count, uncompressedBytes: total, macros: names.includes('xl/vbaProject.bin') };
}

// ---------------------------------------------------------------- A1 helpers

export function columnName(c) {
    let s = '';
    for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
}

function columnIndex(letters) {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}

export function formatRange(r) {
    return `${columnName(r.s.c)}${r.s.r + 1}:${columnName(r.e.c)}${r.e.r + 1}`;
}

// 'B2:D40' to zero-based corners, or null. Corners may come in either order.
export function parseRange(text) {
    const m = /^\s*([A-Za-z]{1,3})([1-9]\d{0,6})\s*:\s*([A-Za-z]{1,3})([1-9]\d{0,6})\s*$/.exec(text || '');
    if (!m) return null;
    const a = { r: Number(m[2]) - 1, c: columnIndex(m[1].toUpperCase()) };
    const b = { r: Number(m[4]) - 1, c: columnIndex(m[3].toUpperCase()) };
    return { s: { r: Math.min(a.r, b.r), c: Math.min(a.c, b.c) }, e: { r: Math.max(a.r, b.r), c: Math.max(a.c, b.c) } };
}

const overlaps = (a, b) => a.s.r <= b.e.r && b.s.r <= a.e.r && a.s.c <= b.e.c && b.s.c <= a.e.c;

// ---------------------------------------------------------------- sheets

// Bounding box of the cells that hold something: a value, a stored empty
// string, an error, or a formula. Styled empty cells do not count.
export function valueRange(ws) {
    const data = ws['!data'] || [];
    let top = Infinity; let left = Infinity; let bottom = -1; let right = -1;
    for (let r = 0; r < data.length; r++) {
        const row = data[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
            const cell = row[c];
            if (!cell || fromSheetCell(cell) === null) continue;
            if (r < top) top = r;
            if (r > bottom) bottom = r;
            if (c < left) left = c;
            if (c > right) right = c;
        }
    }
    return bottom < 0 ? null : { s: { r: top, c: left }, e: { r: bottom, c: right } };
}

export function inventory(wb) {
    const meta = (wb.Workbook && wb.Workbook.Sheets) || [];
    return {
        dateSystem: wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904 ? '1904' : '1900',
        sheets: wb.SheetNames.map((name, i) => {
            const ws = wb.Sheets[name];
            const range = valueRange(ws);
            return {
                name,
                hidden: !!(meta[i] && meta[i].Hidden),
                veryHidden: !!(meta[i] && meta[i].Hidden === 2),
                ref: ws['!ref'] || null,
                valueRange: range ? formatRange(range) : null,
                merges: (ws['!merges'] || []).map(formatRange),
            };
        }),
    };
}

function headerText(cell) {
    if (cell === null) return '';
    if (cell === UNRESOLVED) return null;
    if (cell[0] === 'n') return formatDecimal(cell[1]);
    if (cell[0] === 'b') return cell[1] ? 'TRUE' : 'FALSE';
    return cell[1];
}

// One sheet rectangle as a table. The first row of the range is the header
// row. rangeText null means the value range.
export function sheetTable(wb, sheetName, rangeText = null) {
    const ws = wb.Sheets[sheetName];
    if (!ws) return { ok: false, errors: [{ kind: 'missing-sheet', sheet: sheetName }] };
    const range = rangeText ? parseRange(rangeText) : valueRange(ws);
    if (!range) return { ok: false, errors: [{ kind: rangeText ? 'bad-range' : 'empty-sheet', sheet: sheetName, range: rangeText }] };

    const errors = [];
    const width = range.e.c - range.s.c + 1;
    const dataRows = range.e.r - range.s.r;
    if (width > LIMITS.columns) errors.push({ kind: 'limit', limit: 'columns', value: width, max: LIMITS.columns });
    if (dataRows > LIMITS.dataRows) errors.push({ kind: 'limit', limit: 'dataRows', value: dataRows, max: LIMITS.dataRows });
    if (width * dataRows > LIMITS.cells) errors.push({ kind: 'limit', limit: 'cells', value: width * dataRows, max: LIMITS.cells });
    const merged = (ws['!merges'] || []).filter((m) => overlaps(m, range)).map(formatRange);
    if (merged.length) errors.push({ kind: 'merged-cells', ranges: merged });
    if (errors.length) return { ok: false, errors };

    const data = ws['!data'] || [];
    const cellAt = (r, c) => fromSheetCell(data[r] && data[r][c]);
    const headers = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
        const h = headerText(cellAt(range.s.r, c));
        if (h === null) errors.push({ kind: 'unresolved-header', cell: `${columnName(c)}${range.s.r + 1}` });
        headers.push(h);
    }
    if (errors.length) return { ok: false, errors };

    const rows = [];
    let formulaCells = 0;
    let longIntegers = 0;
    const unresolved = [];
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const row = new Array(width);
        for (let c = range.s.c; c <= range.e.c; c++) {
            const raw = data[r] && data[r][c];
            const cell = fromSheetCell(raw);
            if (raw && raw.f) formulaCells++;
            if (cell === UNRESOLVED) unresolved.push(`${columnName(c)}${r + 1}`);
            else if (cell && cell[0] === 't' && cell[1].length > LIMITS.textCellChars) {
                errors.push({ kind: 'limit', limit: 'textCellChars', cell: `${columnName(c)}${r + 1}`, max: LIMITS.textCellChars });
            } else if (isLongInteger(cell)) longIntegers++;
            row[c - range.s.c] = cell;
        }
        rows.push(row);
    }
    if (errors.length) return { ok: false, errors };

    const hiddenRows = [];
    (ws['!rows'] || []).forEach((info, r) => {
        if (info && info.hidden && r >= range.s.r && r <= range.e.r) hiddenRows.push(r + 1);
    });
    const hiddenColumns = [];
    (ws['!cols'] || []).forEach((info, c) => {
        if (info && info.hidden && c >= range.s.c && c <= range.e.c) hiddenColumns.push(columnName(c));
    });

    return {
        ok: true,
        table: {
            headers, rows,
            rowRefs: rows.map((_, i) => range.s.r + 2 + i),
            colRefs: headers.map((_, i) => columnName(range.s.c + i)),
            refStyle: 'a1',
        },
        info: {
            sheet: sheetName,
            range: formatRange(range),
            detected: !rangeText,
            ref: ws['!ref'] || null,
            hiddenRows, hiddenColumns, formulaCells, unresolved,
            warnings: longIntegers ? [{ kind: 'long-integers', count: longIntegers }] : [],
        },
    };
}
