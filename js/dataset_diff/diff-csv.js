// Delimited text (CSV, TSV, TXT, paste) to an engine table. Pure, no DOM.
//
// Three steps the page shows separately: decodeBytes (encoding), parseRecords
// (syntax, with record numbers and physical line spans), buildTable (header
// row, column types, empty fields). Nothing is padded, trimmed or skipped:
// a problem is reported with its location and the import is refused.

import { LIMITS } from './diff-limits.js';
import { canonicalDecimal, textCell, boolCell, isLongInteger, numberFromDouble } from './diff-values.js';

const QUOTE = 34;
const LF = 10;
const CR = 13;

// Auto reads UTF-8 (with or without a BOM) and UTF-16 marked by its BOM;
// UTF-16 without a BOM is not guessed. Windows-1252 is used only when chosen,
// because every byte sequence is valid Windows-1252 and nothing could ever be
// refused. Invalid text is refused by name, never replaced with U+FFFD.
export function decodeBytes(bytes, { encoding = 'auto' } = {}) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const decode = (label, view, name) => {
        try {
            return { ok: true, text: new TextDecoder(label, { fatal: true }).decode(view), encoding: name };
        } catch (e) {
            return { ok: false, error: { kind: label === 'utf-8' ? 'invalid-utf8' : 'invalid-utf16', encoding: name } };
        }
    };
    if (encoding === 'windows-1252') {
        return { ok: true, text: new TextDecoder('windows-1252').decode(b), encoding: 'Windows-1252' };
    }
    if (encoding !== 'auto') throw new Error(`unknown encoding ${encoding}`);
    if (b[0] === 0xFF && b[1] === 0xFE) return decode('utf-16le', b.subarray(2), 'UTF-16 LE BOM');
    if (b[0] === 0xFE && b[1] === 0xFF) return decode('utf-16be', b.subarray(2), 'UTF-16 BE BOM');
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return decode('utf-8', b.subarray(3), 'UTF-8 BOM');
    return decode('utf-8', b, 'UTF-8');
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

// ---------------------------------------------------------------- dates

const TIME = '(?:[ T](\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?';
// Each format: its pattern and the positions of year, month and day in it.
export const DATE_FORMATS = Object.freeze({
    'M/D/YYYY': { re: new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{4})${TIME}$`), y: 3, m: 1, d: 2 },
    'D/M/YYYY': { re: new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{4})${TIME}$`), y: 3, m: 2, d: 1 },
    'D.M.YYYY': { re: new RegExp(`^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})${TIME}$`), y: 3, m: 2, d: 1 },
    'YYYY-MM-DD': { re: new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})${TIME}$`), y: 1, m: 2, d: 3 },
});

const DAY_MS = 86400000;
const EPOCH_1900 = Date.UTC(1899, 11, 30);
const EPOCH_1904 = Date.UTC(1904, 0, 1);
const MARCH_1900 = Date.UTC(1900, 2, 1);

// A date (and optional 24-hour time) in a declared format to the serial
// number Excel stores for it, in the 1900 or 1904 date system. Excel's 1900
// system counts a 29 February 1900 that never existed, so it is serial 60 and
// earlier dates sit one lower than a plain day count. Nothing is guessed: a
// value that does not fit the format exactly, or that Excel cannot hold as a
// date, is not a date.
export function readDate(field, format = 'M/D/YYYY', system = '1900') {
    const spec = DATE_FORMATS[format];
    if (!spec) throw new Error(`unknown date format ${format}`);
    const m = spec.re.exec(field);
    if (!m) return { ok: false, reason: 'not-this-date-format' };
    const y = Number(m[spec.y]);
    const mo = Number(m[spec.m]);
    const d = Number(m[spec.d]);
    const [h, mi, s] = [m[4], m[5], m[6]].map((x) => (x === undefined ? 0 : Number(x)));
    if (h > 23 || mi > 59 || s > 59) return { ok: false, reason: 'not-a-time' };
    if (mo < 1 || mo > 12 || d < 1) return { ok: false, reason: 'not-a-date' };
    let days;
    if (system === '1900' && y === 1900 && mo === 2 && d === 29) {
        days = 60;
    } else {
        const t = Date.UTC(y, mo - 1, d);
        const back = new Date(t);
        if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return { ok: false, reason: 'not-a-date' };
        if (system === '1904') {
            if (t < EPOCH_1904) return { ok: false, reason: 'before-1904' };
            days = (t - EPOCH_1904) / DAY_MS;
        } else {
            if (y < 1900) return { ok: false, reason: 'before-1900' };
            days = (t - EPOCH_1900) / DAY_MS - (t < MARCH_1900 ? 1 : 0);
        }
    }
    if (y > 9999) return { ok: false, reason: 'after-9999' };
    return { ok: true, value: numberFromDouble(days + (h * 3600 + mi * 60 + s) / 86400) };
}

// Records to { headers, rows } for the engine, plus what the preview shows.
// options: headerRecord (1-based; 0 for no header row, which needs
// generatedHeaders), emptyFields 'blank' | 'empty-string', types per column
// 'auto' | 'text' | 'number' | 'boolean', decimal, thousands.
export function buildTable(records, options = {}) {
    const {
        headerRecord = 1, generatedHeaders = false, emptyFields = 'blank',
        types = [], decimal = '.', thousands = '', dateFormat = 'M/D/YYYY', dateSystem = '1900',
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
        } else if (chosen === 'date') {
            // A declared format that misses any value leaves the column as text
            // and names the values that missed; it never half-converts a column.
            const misses = [];
            let count = 0;
            for (const r of data) {
                const f = fieldAt(r, c);
                if (f === '') continue;
                const read = readDate(f, dateFormat, dateSystem);
                if (read.ok) continue;
                count++;
                if (misses.length < 5) misses.push({ record: r.record, value: f.slice(0, 40), reason: read.reason });
            }
            if (count) { type = 'text'; reason = { kind: 'date-format', format: dateFormat, system: dateSystem, misses, count }; }
        }
        columns.push({ header: headers[c], chosen, type, reason, ...(chosen === 'date' ? { dateFormat, dateSystem } : {}) });
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
                : type === 'date' ? readDate(f, dateFormat, dateSystem)
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
