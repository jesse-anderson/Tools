// Typed cell values for Dataset Diff. Pure, no imports, no DOM.
//
// A cell is null (blank) or a two-item array [type, value]:
//   ['t', string]   text, compared code unit for code unit
//   ['n', string]   number, as a canonical decimal (see canonicalDecimal)
//   ['b', boolean]  boolean
//   ['e', string]   workbook error code such as '#N/A'
// Two cells are equal exactly when their JSON text is equal, so a row's key
// is JSON.stringify of its cells and no separator can make two rows collide.

export const UNRESOLVED = Object.freeze({ unresolved: true });

const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d{1,9}))?$/;
const PLAIN_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d{1,9})?$/;
const LEADING_ZERO = /^-?0\d/;

// Exact decimal value of a numeric string as sign, significant digits with no
// leading or trailing zeros, and a power of ten: '0.10' and '1e-1' both give
// '1e-1', '1200' gives '12e2', and zero of either sign gives '0'. No rounding.
export function canonicalDecimal(token) {
    const m = DECIMAL.exec(token);
    if (!m) return null;
    const [, sign, whole = '', frac = '', exp = '0'] = m;
    if (whole === '' && frac === '') return null;
    let digits = (whole + frac).replace(/^0+/, '');
    if (digits === '') return '0';
    let power = Number(exp) - frac.length;
    const trimmed = digits.replace(/0+$/, '');
    power += digits.length - trimmed.length;
    digits = trimmed;
    return `${sign === '-' ? '-' : ''}${digits}e${power}`;
}

// A workbook stores binary doubles. String(n) is the shortest decimal that
// reads back as the same double, so distinct stored values stay distinct.
export function numberFromDouble(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
        throw new RangeError(`not a finite number: ${n}`);
    }
    return ['n', canonicalDecimal(String(n))];
}

// How a delimited-text field would be read as a number: 'number', 'leading-zero'
// (identifier-like, stays text), or null when it is not a plain numeric token.
export function numericTokenKind(token) {
    if (PLAIN_NUMBER.test(token)) return 'number';
    if (LEADING_ZERO.test(token) && canonicalDecimal(token) !== null) return 'leading-zero';
    return null;
}

export function textCell(s) { return ['t', String(s)]; }
export function numberCell(token) {
    const c = canonicalDecimal(token);
    if (c === null) throw new RangeError(`not a decimal: ${token}`);
    return ['n', c];
}
export function boolCell(b) { return ['b', b === true]; }
export function errorCell(code) { return ['e', String(code)]; }

const ERROR_CODES = {
    0x00: '#NULL!', 0x07: '#DIV/0!', 0x0F: '#VALUE!', 0x17: '#REF!',
    0x1D: '#NAME?', 0x24: '#NUM!', 0x2A: '#N/A', 0x2B: '#GETTING_DATA',
};

// One SheetJS cell (read with sheetStubs and without cellDates) to a typed
// cell, null, or UNRESOLVED. A stub ('z') carries v = 0 even when it is a
// formula with no stored result, so a stub's value is never read.
export function fromSheetCell(cell) {
    if (!cell) return null;
    const hasFormula = typeof cell.f === 'string' && cell.f !== '';
    if (cell.t === 'z') return hasFormula ? UNRESOLVED : null;
    if (hasFormula && cell.v === undefined) return UNRESOLVED;
    switch (cell.t) {
        case 's': return textCell(cell.v);
        case 'n': return numberFromDouble(cell.v);
        case 'b': return boolCell(cell.v);
        case 'e': return errorCell(cell.w || ERROR_CODES[cell.v] || `#ERR${cell.v}`);
        default: throw new TypeError(`unsupported cell type '${cell.t}'`);
    }
}

export function rowKey(cells) { return JSON.stringify(cells); }

// Same answer as comparing JSON text, without building it: every value is a
// string or a boolean, so two fields decide it.
export function cellsEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    return a[0] === b[0] && a[1] === b[1];
}

// Tables cross between threads as one JSON string per row, which copies far
// faster than nested arrays. UNRESOLVED travels as ['u'].
export function encodeRows(rows) {
    return rows.map((row) => JSON.stringify(row.map((c) => (c === UNRESOLVED ? ['u'] : c))));
}

export function decodeRows(keys) {
    return keys.map((k) => JSON.parse(k).map((c) => (c !== null && c[0] === 'u' ? UNRESOLVED : c)));
}

// Integers with more than 15 significant digits: Excel keeps 15, so a value
// like this was probably an identifier that has already been rounded.
export function isLongInteger(cell) {
    if (!cell || cell[0] !== 'n' || cell[1] === '0') return false;
    const [, digits, power] = /^-?(\d+)e(-?\d+)$/.exec(cell[1]);
    return Number(power) >= 0 && digits.length + Number(power) > 15;
}

function parseCanonical(c) {
    if (c === '0') return { sign: 0, digits: '', power: 0 };
    const [, neg, digits, power] = /^(-?)(\d+)e(-?\d+)$/.exec(c);
    return { sign: neg ? -1 : 1, digits, power: Number(power) };
}

// Order of two canonical decimals by value: -1, 0 or 1.
export function compareDecimal(a, b) {
    const x = parseCanonical(a);
    const y = parseCanonical(b);
    if (x.sign !== y.sign) return x.sign < y.sign ? -1 : 1;
    if (x.sign === 0) return 0;
    const xTop = x.digits.length + x.power;
    const yTop = y.digits.length + y.power;
    let mag;
    if (xTop !== yTop) {
        mag = xTop < yTop ? -1 : 1;
    } else {
        const len = Math.max(x.digits.length, y.digits.length);
        const xd = x.digits.padEnd(len, '0');
        const yd = y.digits.padEnd(len, '0');
        mag = xd === yd ? 0 : (xd < yd ? -1 : 1);
    }
    return mag * x.sign;
}

const TYPE_RANK = { b: 1, n: 2, e: 3, t: 4 };

// Display order only; it never decides equality. Blank, boolean, number,
// error, text; text by UTF-16 code units, never by locale.
export function compareCells(a, b) {
    const ra = a ? TYPE_RANK[a[0]] : 0;
    const rb = b ? TYPE_RANK[b[0]] : 0;
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (!a) return 0;
    if (a[0] === 'n') return compareDecimal(a[1], b[1]);
    if (a[0] === 'b') return a[1] === b[1] ? 0 : (a[1] ? 1 : -1);
    return a[1] === b[1] ? 0 : (a[1] < b[1] ? -1 : 1);
}

export function compareRows(a, b) {
    for (let i = 0; i < a.length; i++) {
        const c = compareCells(a[i], b[i]);
        if (c !== 0) return c;
    }
    return 0;
}

// Canonical decimal to ordinary notation for reports: '1234e-3' -> '1.234'.
// Scientific notation beyond 21 places either side, never rounded.
export function formatDecimal(c) {
    const { sign, digits, power } = parseCanonical(c);
    if (sign === 0) return '0';
    const neg = sign < 0 ? '-' : '';
    const top = digits.length + power;
    if (top > 21 || top < -20) {
        const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
        return `${neg}${mant}e${top - 1}`;
    }
    if (power >= 0) return neg + digits + '0'.repeat(power);
    if (top > 0) return `${neg}${digits.slice(0, top)}.${digits.slice(top)}`;
    return `${neg}0.${'0'.repeat(-top)}${digits}`;
}

// A cell as report text: blank, text:"...", number:1.234, boolean:TRUE, error:#N/A.
// Control characters, quotes and backslashes in text are escaped so a value
// cannot pass for a report line.
export function describeCell(cell) {
    if (cell === null) return 'blank';
    if (cell === UNRESOLVED) return 'unresolved-formula';
    switch (cell[0]) {
        case 't': return `text:${quoteText(cell[1])}`;
        case 'n': return `number:${formatDecimal(cell[1])}`;
        case 'b': return `boolean:${cell[1] ? 'TRUE' : 'FALSE'}`;
        default: return `error:${cell[1]}`;
    }
}

export function quoteText(s) {
    let out = '"';
    for (const ch of s) {
        const code = ch.codePointAt(0);
        if (ch === '"' || ch === '\\') out += '\\' + ch;
        else if (ch === '\n') out += '\\n';
        else if (ch === '\r') out += '\\r';
        else if (ch === '\t') out += '\\t';
        else if (code < 0x20 || (code >= 0x7F && code < 0xA0) || code === 0x2028 || code === 0x2029) {
            out += `\\u${code.toString(16).padStart(4, '0')}`;
        } else out += ch;
    }
    return out + '"';
}
