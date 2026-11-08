// Small DOM helpers and the plain-language text for every refusal the
// importers and workers can return. All imported text goes in as text.

const n = (x) => Number(x).toLocaleString('en-US');

export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'text') node.textContent = v;
        else if (k === 'className') node.className = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
        if (c === null || c === undefined || c === false) continue;
        node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
}

const LIMIT_NAMES = {
    fileBytes: 'file size', dataRows: 'data row', columns: 'column', cells: 'selected cell',
    textCellChars: 'characters-per-cell', zipUncompressedBytes: 'size-inside-the-workbook',
};

function where(e) {
    if (e.cell) return ` at ${e.cell}`;
    if (e.record) return ` in record ${e.record}${e.column ? `, field ${e.column}` : ''}`;
    return '';
}

function lines(span) {
    return span[0] === span[1] ? `line ${span[0]}` : `lines ${span[0]} to ${span[1]}`;
}

function tableError(x) {
    switch (x.kind) {
        case 'ragged':
            return `Record ${x.record} (${lines(x.lines)}) has ${x.fields} field${x.fields === 1 ? '' : 's'}; the header has ${x.expected}. Fix the file or choose another header record.`;
        case 'type':
            return `Record ${x.record}, field ${x.column} ("${x.header}"): "${x.value}" is not a ${x.type}. Choose Text or Auto for that column.`;
        case 'merged-cells':
            return `Merged cells ${x.ranges.join(', ')} touch the range. Merged cells are not filled in, so choose a range that avoids them, such as the rows below a merged title.`;
        case 'bad-range': return `"${x.range}" is not a range like A1:D20.`;
        case 'empty-sheet': return `Sheet "${x.sheet}" has no cells with values.`;
        case 'missing-sheet': return `There is no sheet named "${x.sheet}".`;
        case 'unresolved-header': return `Header cell ${x.cell} is a formula with no stored result. Open and save the workbook in Excel, or choose a range below it.`;
        case 'no-header-record': return `There is no record ${x.headerRecord} to use as the header.`;
        case 'no-header-choice': return 'With no header record, turn on generated column names.';
        case 'limit': return describeError(x);
        default: return x.kind;
    }
}

function syntaxError(x) {
    if (x.kind === 'unterminated-quote') return `Record ${x.record} (line ${x.line}): a quoted field is never closed.`;
    if (x.kind === 'text-after-quote') return `Record ${x.record} (line ${x.line}): "${x.text}" follows a closing quote.`;
    return x.kind;
}

function listed(items, describe, omitted = 0) {
    const shown = items.slice(0, 8).map(describe);
    const more = items.length - shown.length + omitted;
    if (more > 0) shown.push(`${n(more)} more problem${more === 1 ? '' : 's'} not shown.`);
    return shown.join(' ');
}

export function describeError(e) {
    if (!e || typeof e !== 'object') return String(e);
    switch (e.kind) {
        case 'limit':
            return `Over the ${LIMIT_NAMES[e.limit] || e.limit} limit${where(e)}${e.value !== undefined ? `: ${n(e.value)}, limit ${n(e.max)}` : `, limit ${n(e.max)}`}. Refused, not compared in part.`;
        case 'unsupported-encoding': return 'This file is UTF-16 text, which is not read yet. Save it as UTF-8 and load it again.';
        case 'invalid-utf8': return 'This file is not valid UTF-8 text, so it was not read. If older Windows software wrote it, save it again as UTF-8.';
        case 'ole-container': return 'This is a legacy .xls file or a password-protected workbook. Save it from Excel as .xlsx with no password.';
        case 'not-a-workbook': return 'This file is not an XLSX workbook.';
        case 'not-xlsx': return 'This ZIP file is not an XLSX workbook.';
        case 'xlsb-not-yet': return 'XLSB workbooks are not read yet. Save it as .xlsx.';
        case 'zip64': return 'This workbook is stored as ZIP64, which is refused. Save it again from Excel as .xlsx.';
        case 'damaged-zip': return 'The workbook is damaged: its list of contents could not be read.';
        case 'unsupported-file': return `${e.ext} files are not read yet. Save it as .xlsx or .csv.`;
        case 'syntax': return listed(e.errors, syntaxError);
        case 'table': return listed(e.errors, tableError, e.omittedErrors || 0);
        case 'time-limit': return `Reading took longer than ${e.seconds} seconds and was stopped.`;
        case 'cancelled': return 'Stopped.';
        case 'replaced': return 'Replaced by a newer input.';
        case 'worker-failed': return `The background reader failed: ${e.message}`;
        case 'exception': return `Unexpected error: ${e.message}`;
        default: return e.kind || 'Unknown problem.';
    }
}

const BADGES = {
    match: ['✓', 'Match'],
    different: ['≠', 'Different'],
    incomplete: ['!', 'Incomplete'],
    unavailable: ['○', 'Not compared'],
};

export function verdictBadge(verdict) {
    const [icon, label] = BADGES[verdict] || ['?', verdict];
    return el('span', { className: `dd-verdict dd-v-${verdict}`, dataset: { verdict } },
        el('span', { 'aria-hidden': 'true', text: icon }), ` ${label}`);
}

export const fmt = n;
