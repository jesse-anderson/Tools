// Delimited text (CSV, TSV, TXT, paste) to an engine table. Pure, no DOM.
//
// Three steps the page shows separately: decodeBytes (encoding), parseRecords
// (syntax, with record numbers and physical line spans), buildTable (header
// row, column types, empty fields). Nothing is padded, trimmed or skipped:
// a problem is reported with its location and the import is refused.

import { LIMITS } from './diff-limits.js';
import { canonicalDecimal, textCell, boolCell, isLongInteger } from './diff-values.js';

const QUOTE = 34;
const LF = 10;
const CR = 13;

// UTF-8 with or without a BOM. UTF-16 and Windows-1252 come in Phase 5, so
// they are refused by name rather than decoded into replacement characters.
export function decodeBytes(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF)) {
        return { ok: false, error: { kind: 'unsupported-encoding', encoding: 'UTF-16' } };
    }
    const bom = b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bom ? b.subarray(3) : b);
        return { ok: true, text, encoding: bom ? 'UTF-8 BOM' : 'UTF-8' };
    } catch (e) {
        return { ok: false, error: { kind: 'invalid-utf8' } };
    }
}

function newlinesIn(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c === LF) n++;
        else if (c === CR) { n++; if (s.charCodeAt(i + 1) === LF) i++; }
    }
    return n;
}

// RFC 4180 records. A field is quoted only when its first character is a
// quote; "" inside quotes is one quote; line breaks inside quotes are kept
// exactly. A quote later in an unquoted field is literal text (12" pipe).
// Line ends are CRLF, LF or CR. A final line end ends the last record; a
// blank line elsewhere is a record with one empty field.
export function parseRecords(text, delimiter) {
    if (delimiter.length !== 1) throw new Error('delimiter must be one character');
    const d = delimiter.charCodeAt(0);
    const n = text.length;
    const records = [];
    const errors = [];
    let i = 0;
    let line = 1;
    while (i < n) {
        const record = records.length + 1;
        const startLine = line;
        const fields = [];
        const quoted = [];
        let endLine = line;
        for (;;) {
            if (text.charCodeAt(i) === QUOTE) {
                let value = '';
                let j = i + 1;
                let closed = false;
                while (j <= n) {
                    const q = text.indexOf('"', j);
                    if (q < 0) { value += text.slice(j); j = n; break; }
                    if (text.charCodeAt(q + 1) === QUOTE) { value += text.slice(j, q + 1); j = q + 2; continue; }
                    value += text.slice(j, q);
                    j = q + 1;
                    closed = true;
                    break;
                }
                line += newlinesIn(value);
                endLine = line;
                if (!closed) {
                    errors.push({ kind: 'unterminated-quote', record, line: startLine });
                    fields.push(value);
                    quoted.push(true);
                    i = n;
                    break;
                }
                i = j;
                // After the closing quote: a delimiter, a line end or the end of text.
                let k = i;
                while (k < n) { const c = text.charCodeAt(k); if (c === d || c === LF || c === CR) break; k++; }
                if (k > i) {
                    errors.push({ kind: 'text-after-quote', record, line, text: text.slice(i, Math.min(k, i + 20)) });
                    value += text.slice(i, k);
                    i = k;
                }
                fields.push(value);
                quoted.push(true);
            } else {
                let j = i;
                while (j < n) { const c = text.charCodeAt(j); if (c === d || c === LF || c === CR) break; j++; }
                fields.push(text.slice(i, j));
                quoted.push(false);
                i = j;
            }
            if (i >= n) break;
            const c = text.charCodeAt(i);
            if (c === d) { i++; continue; }
            i += c === CR && text.charCodeAt(i + 1) === LF ? 2 : 1;
            line++;
            break;
        }
        records.push({ record, fields, quoted, lines: [startLine, endLine] });
    }
    return { records, errors };
}

const CANDIDATES = [',', '\t', ';', '|'];

// A suggestion only: the delimiter giving the most records with the same
// field count (more than one field) in the first 64 KiB. Comma on a tie.
export function suggestDelimiter(text) {
    let sample = text.slice(0, 65536);
    if (sample.length < text.length) sample = sample.slice(0, Math.max(sample.lastIndexOf('\n'), 1));
    let best = { delimiter: ',', score: -1 };
    for (const delimiter of CANDIDATES) {
        const { records } = parseRecords(sample, delimiter);
        const counts = new Map();
        for (const r of records.slice(0, 200)) {
            if (r.fields.length > 1) counts.set(r.fields.length, (counts.get(r.fields.length) || 0) + 1);
        }
        const score = Math.max(0, ...counts.values());
        if (score > best.score) best = { delimiter, score };
    }
    return best.delimiter;
}

const THOUSANDS = { ',': /,/g, '.': /\./g, ' ': / /g, "'": /'/g };

// A field as a canonical decimal under the declared separators, or a reason
// it is not one. Grouping must be in threes: '1,000' with ',' declared is
// 1000, '1,00' is not a number.
export function readNumber(field, { decimal = '.', thousands = '', leadingZeros = false } = {}) {
    if (thousands && thousands === decimal) throw new Error('decimal and thousands separators must differ');
    let s = field;
    if (thousands) {
        const sep = thousands === '.' ? '\\.' : thousands;
        const dec = decimal === '.' ? '\\.' : decimal;
        const grouped = new RegExp(`^-?\\d{1,3}(${sep}\\d{3})+(${dec}\\d+)?$`);
        if (grouped.test(s)) s = s.replace(THOUSANDS[thousands], '');
    }
    if (decimal === ',') {
        if (s.includes('.')) return { ok: false, reason: 'not-a-number' };
        s = s.replace(',', '.');
    }
    if (/^-?0\d/.test(s) && canonicalDecimal(s) !== null) {
        // Chosen as Number on purpose, 00123 is 123; inferred, it stays text.
        if (!leadingZeros) return { ok: false, reason: 'leading-zero' };
        s = s.replace(/^(-?)0+(?=\d)/, '$1');
    }
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d{1,9})?$/.test(s)) return { ok: false, reason: 'not-a-number' };
    return { ok: true, value: ['n', canonicalDecimal(s)] };
}

function readBoolean(field) {
    const u = field.toUpperCase();
    if (u === 'TRUE') return { ok: true, value: boolCell(true) };
    if (u === 'FALSE') return { ok: true, value: boolCell(false) };
    return { ok: false, reason: 'not-a-boolean' };
}

// Records to { headers, rows } for the engine, plus what the preview shows.
// options: headerRecord (1-based; 0 for no header row, which needs
// generatedHeaders), emptyFields 'blank' | 'empty-string', types per column
// 'auto' | 'text' | 'number' | 'boolean', decimal, thousands.
export function buildTable(records, options = {}) {
    const {
        headerRecord = 1, generatedHeaders = false, emptyFields = 'blank',
        types = [], decimal = '.', thousands = '',
    } = options;
    const errors = [];
    let omitted = 0;
    const fail = () => ({ ok: false, errors, omittedErrors: omitted });
    const report = (e) => { if (errors.length < 500) errors.push(e); else omitted++; };

    if (headerRecord === 0 && !generatedHeaders) {
        errors.push({ kind: 'no-header-choice' });
        return fail();
    }
    if (headerRecord > records.length) {
        errors.push({ kind: 'no-header-record', headerRecord });
        return fail();
    }
    const head = headerRecord ? records[headerRecord - 1] : null;
    const data = records.slice(headerRecord);
    const width = head ? head.fields.length : Math.max(0, ...data.map((r) => r.fields.length));
    const headers = head ? head.fields.slice() : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);

    if (width > LIMITS.columns) errors.push({ kind: 'limit', limit: 'columns', value: width, max: LIMITS.columns });
    if (data.length > LIMITS.dataRows) errors.push({ kind: 'limit', limit: 'dataRows', value: data.length, max: LIMITS.dataRows });
    if (width * data.length > LIMITS.cells) errors.push({ kind: 'limit', limit: 'cells', value: width * data.length, max: LIMITS.cells });
    if (errors.length) return fail();

    // A blank line is a blank row; any other record must have every field.
    const blankRecord = (r) => r.fields.length === 1 && r.fields[0] === '' && !r.quoted[0];
    for (const r of data) {
        if (r.fields.length !== width && !(blankRecord(r) && width > 1)) {
            report({ kind: 'ragged', record: r.record, lines: r.lines, fields: r.fields.length, expected: width });
        }
        for (let c = 0; c < r.fields.length; c++) {
            if (r.fields[c].length > LIMITS.textCellChars) {
                report({ kind: 'limit', limit: 'textCellChars', record: r.record, column: c + 1, max: LIMITS.textCellChars });
            }
        }
    }
    if (errors.length) return fail();

    const fieldAt = (r, c) => (blankRecord(r) ? '' : r.fields[c]);
    const sep = { decimal, thousands };
    const chosenSep = { decimal, thousands, leadingZeros: true };
    const columns = [];
    for (let c = 0; c < width; c++) {
        const chosen = types[c] || 'auto';
        let type = chosen;
        let reason = null;
        if (chosen === 'auto') {
            type = 'number';
            let seen = 0;
            for (const r of data) {
                const f = fieldAt(r, c);
                if (f === '') continue;
                seen++;
                const read = readNumber(f, sep);
                if (!read.ok) { type = 'text'; reason = { kind: read.reason, record: r.record, value: f.slice(0, 40) }; break; }
            }
            if (seen === 0) { type = 'text'; reason = { kind: 'no-values' }; }
        }
        columns.push({ header: headers[c], chosen, type, reason });
    }

    const rows = [];
    let longIntegers = 0;
    for (const r of data) {
        const row = new Array(width).fill(null);
        if (blankRecord(r) && width > 1) { rows.push(row); continue; }
        for (let c = 0; c < width; c++) {
            const f = fieldAt(r, c);
            if (f === '') { row[c] = emptyFields === 'empty-string' ? textCell('') : null; continue; }
            const type = columns[c].type;
            if (type === 'text') { row[c] = textCell(f); continue; }
            const read = type === 'boolean' ? readBoolean(f)
                : readNumber(f, columns[c].chosen === 'number' ? chosenSep : sep);
            if (!read.ok) {
                report({ kind: 'type', type, record: r.record, column: c + 1, header: headers[c], value: f.slice(0, 40), reason: read.reason });
                row[c] = null;
            } else {
                row[c] = read.value;
                if (isLongInteger(read.value)) longIntegers++;
            }
        }
        rows.push(row);
    }
    if (errors.length) return fail();

    return {
        ok: true,
        table: {
            headers, rows,
            rowRefs: data.map((r) => r.record),
            colRefs: headers.map((_, i) => i + 1),
            lineSpans: data.map((r) => r.lines),
            refStyle: 'record',
        },
        columns,
        warnings: longIntegers ? [{ kind: 'long-integers', count: longIntegers }] : [],
    };
}

// The whole path for one text source, for callers that need no preview stops.
export function importDelimited(text, options = {}) {
    const delimiter = options.delimiter || suggestDelimiter(text);
    const parsed = parseRecords(text, delimiter);
    if (parsed.errors.length) return { ok: false, delimiter, errors: parsed.errors };
    return { delimiter, records: parsed.records.length, ...buildTable(parsed.records, options) };
}
