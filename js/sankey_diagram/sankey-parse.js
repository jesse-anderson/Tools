// Flow text parser for the Sankey diagram builder. Pure, no DOM.
//
// Accepts one flow per line as `Source [amount] Target` or as three delimited
// fields `source,target,amount` (comma or tab). Every problem carries the line
// it came from, so the page can point at it.

export const LIMITS = Object.freeze({
    maxFlows: 500,
    maxNameLength: 80,
    maxNoteLength: 120
});

const FLOW_LINE = /^(.+?)\s*\[([^\]]*)\]\s*(.+)$/;
const COLOR_LINE = /^:\s*(.+?)\s+(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})$/;
const NOTE_LINE = /^@\s*([^:]+?)\s*:\s*(.+)$/;
const POSITION_LINE = /^~\s*([^:]+?)\s*:\s*(-?\d+\.?\d*)\s*%?\s*,\s*(-?\d+\.?\d*)\s*%?$/;
const AMOUNT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const GROUPED = /^[+-]?\d{1,3}([.,]\d{3})+$/;
const HEADER_WORDS = new Set(['value', 'amount', 'flow', 'weight', 'qty', 'quantity', 'mass']);

const cleanName = (raw) => String(raw).replace(/\s+/g, ' ').trim();

/**
 * Rewrite an amount that uses separators into a plain number string, and say
 * how it was read. With both separators present the last one is the decimal
 * point. A single comma on its own is a decimal point. The same separator
 * repeated, in groups of exactly three digits, is thousands.
 * Returns null when no reading is defensible.
 */
export function normalizeAmount(text) {
    const commas = (text.match(/,/g) || []).length;
    const dots = (text.match(/\./g) || []).length;
    if (commas === 0 && dots <= 1) return { text, reading: null };

    if (commas > 0 && dots > 0) {
        const decimal = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
        const thousands = decimal === ',' ? '.' : ',';
        const parts = text.split(decimal);
        if (parts.length !== 2) return null;
        const [whole, fraction] = parts;
        if (!GROUPED.test(whole)) return null;
        return {
            text: `${whole.split(thousands).join('')}.${fraction}`,
            reading: `"${decimal}" taken as the decimal point and "${thousands}" as a thousands separator`
        };
    }

    // One comma is always a decimal point, "1,234" included: a comma typed for
    // a point is likelier than a thousands separator on a four-digit flow.
    if (commas === 1) {
        return { text: text.replace(',', '.'), reading: 'the comma taken as a decimal point' };
    }
    // Two or more of the same separator can only be grouping.
    const sep = commas > 0 ? ',' : '.';
    const leadingZero = /^[+-]?0[.,]/.test(text);
    if (GROUPED.test(text) && !leadingZero) {
        return { text: text.split(sep).join(''), reading: `"${sep}" taken as a thousands separator` };
    }
    return null;
}

/**
 * Parse one amount. Separators are coerced, never silently: the result says
 * how the text was read so the caller can show it.
 */
export function parseAmount(raw) {
    const original = String(raw).trim();
    if (original === '') return { ok: false, code: 'AMOUNT_MISSING', message: 'the amount is empty' };

    const normal = normalizeAmount(original);
    if (!normal || !AMOUNT.test(normal.text)) {
        return { ok: false, code: 'AMOUNT_NOT_A_NUMBER', message: `"${original}" is not a number` };
    }
    const value = Number(normal.text);
    if (!Number.isFinite(value)) {
        return { ok: false, code: 'AMOUNT_NOT_A_NUMBER', message: `"${original}" is not a finite number` };
    }
    if (value < 0) {
        return {
            ok: false,
            code: 'AMOUNT_NEGATIVE',
            message: `${original} is negative. Reverse the flow instead of signing it`
        };
    }
    return { ok: true, value, coerced: normal.reading ? { from: original, reading: normal.reading } : null };
}

/** Split a delimited line, honouring double quotes around a field. */
export function splitDelimited(line, delimiter) {
    const fields = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
            else if (ch === '"') quoted = false;
            else field += ch;
        } else if (ch === '"' && field.trim() === '') {
            field = '';
            quoted = true;
        } else if (ch === delimiter) {
            fields.push(field);
            field = '';
        } else {
            field += ch;
        }
    }
    fields.push(field);
    return fields.map((f) => f.trim());
}

function readFlowLine(line) {
    const bracket = FLOW_LINE.exec(line);
    if (bracket) return { source: bracket[1], amount: bracket[2], target: bracket[3] };

    const delimiter = line.includes('\t') ? '\t' : (line.includes(',') ? ',' : null);
    if (!delimiter) return null;
    const fields = splitDelimited(line, delimiter);
    if (fields.length !== 3) return { fieldCount: fields.length, delimiter };
    return { source: fields[0], target: fields[1], amount: fields[2], delimited: true };
}

/**
 * Parse the whole text.
 * Returns { flows, colors, notes, positions, errors, warnings }. flows are
 * { source, target, value, line }; errors and warnings are { line, code, message }.
 */
export function parseFlows(text) {
    const flows = [];
    const colors = {};
    const notes = {};
    const positions = {};
    const errors = [];
    const warnings = [];
    const lines = String(text == null ? '' : text).split(/\r\n|\r|\n/);
    let seenData = false;

    lines.forEach((rawLine, i) => {
        const lineNo = i + 1;
        const line = rawLine.trim();
        if (line === '' || line.startsWith('//') || line.startsWith('#')) return;

        const color = COLOR_LINE.exec(line);
        if (color) {
            colors[cleanName(color[1])] = color[2].toLowerCase();
            return;
        }
        if (line.startsWith(':')) {
            errors.push({ line: lineNo, code: 'COLOR_NOT_UNDERSTOOD', message: 'a colour line reads ": Node name #rrggbb"' });
            return;
        }

        const note = NOTE_LINE.exec(line);
        if (note) {
            const noteText = cleanName(note[2]);
            if (noteText.length > LIMITS.maxNoteLength) {
                errors.push({ line: lineNo, code: 'NOTE_TOO_LONG', message: `a note is limited to ${LIMITS.maxNoteLength} characters` });
                return;
            }
            notes[cleanName(note[1])] = noteText;
            return;
        }
        if (line.startsWith('@')) {
            errors.push({ line: lineNo, code: 'NOTE_NOT_UNDERSTOOD', message: 'a note line reads "@ Node name: text"' });
            return;
        }

        // A dragged node writes its place here: percent across, percent down.
        const position = POSITION_LINE.exec(line);
        if (position) {
            const x = Number(position[2]);
            const y = Number(position[3]);
            if (x < 0 || x > 100 || y < 0 || y > 100) {
                errors.push({ line: lineNo, code: 'POSITION_OUT_OF_RANGE', message: 'a position is two percentages from 0 to 100, across then down' });
                return;
            }
            positions[cleanName(position[1])] = { x, y };
            return;
        }
        if (line.startsWith('~')) {
            errors.push({ line: lineNo, code: 'POSITION_NOT_UNDERSTOOD', message: 'a position line reads "~ Node name: 40, 25"' });
            return;
        }

        const parts = readFlowLine(line);
        if (!parts) {
            errors.push({ line: lineNo, code: 'LINE_NOT_UNDERSTOOD', message: 'expected "Source [amount] Target" or "source,target,amount"' });
            return;
        }
        if (parts.fieldCount !== undefined) {
            // The usual cause of a fourth field is a comma inside the amount.
            const hint = parts.delimiter === ',' && parts.fieldCount === 4
                ? '. If the amount contains a comma, put it in double quotes or use the "Source [amount] Target" form'
                : '';
            errors.push({ line: lineNo, code: 'FIELD_COUNT', message: `expected 3 fields (source, target, amount) and found ${parts.fieldCount}${hint}` });
            return;
        }

        // A header row is only skipped where a header can be: before any data.
        if (parts.delimited && !seenData && HEADER_WORDS.has(parts.amount.toLowerCase())) return;
        seenData = true;

        const source = cleanName(parts.source);
        const target = cleanName(parts.target);
        if (!source || !target) {
            errors.push({ line: lineNo, code: 'NAME_MISSING', message: 'a flow needs a name on both sides of the amount' });
            return;
        }
        if (source.length > LIMITS.maxNameLength || target.length > LIMITS.maxNameLength) {
            errors.push({ line: lineNo, code: 'NAME_TOO_LONG', message: `a node name is limited to ${LIMITS.maxNameLength} characters` });
            return;
        }
        if (source === target) {
            errors.push({ line: lineNo, code: 'SELF_LOOP', message: `"${source}" flows into itself, which a Sankey diagram cannot draw` });
            return;
        }

        const amount = parseAmount(parts.amount);
        if (!amount.ok) {
            errors.push({ line: lineNo, code: amount.code, message: amount.message });
            return;
        }
        if (amount.coerced) {
            warnings.push({
                line: lineNo,
                code: 'AMOUNT_COERCED',
                message: `read "${amount.coerced.from}" as ${amount.value} (${amount.coerced.reading})`
            });
        }
        if (amount.value === 0) {
            warnings.push({ line: lineNo, code: 'ZERO_FLOW', message: `${source} to ${target} is zero and is not drawn` });
            return;
        }
        flows.push({ source, target, value: amount.value, line: lineNo });
    });

    if (flows.length > LIMITS.maxFlows) {
        errors.push({ line: null, code: 'TOO_MANY_FLOWS', message: `${flows.length} flows entered, the limit is ${LIMITS.maxFlows}` });
    }

    // Names that differ only by case are almost always one node typed two ways.
    const byFolded = new Map();
    for (const flow of flows) {
        for (const name of [flow.source, flow.target]) {
            const key = name.toLowerCase();
            if (!byFolded.has(key)) byFolded.set(key, new Set());
            byFolded.get(key).add(name);
        }
    }
    for (const names of byFolded.values()) {
        if (names.size > 1) {
            const list = [...names].map((n) => `"${n}"`).join(' and ');
            warnings.push({ line: null, code: 'CASE_VARIANTS', message: `${list} differ only by capitalisation and are drawn as separate nodes` });
        }
    }

    const known = new Set(flows.flatMap((f) => [f.source, f.target]));
    for (const name of new Set([...Object.keys(colors), ...Object.keys(notes), ...Object.keys(positions)])) {
        if (!known.has(name)) {
            warnings.push({ line: null, code: 'UNKNOWN_NODE', message: `"${name}" has a colour, note or position but appears in no flow` });
        }
    }

    return { flows, colors, notes, positions, errors, warnings };
}

/**
 * Return the text with a node's position line set, replaced or removed.
 * position is { x, y } in percent, or null to remove it.
 */
export function setPositionLine(text, name, position) {
    const lines = String(text == null ? '' : text).split(/\r\n|\r|\n/);
    const kept = lines.filter((raw) => {
        const m = POSITION_LINE.exec(raw.trim());
        return !(m && cleanName(m[1]) === name);
    });
    if (position) {
        const fmt = (v) => String(Math.round(Math.min(100, Math.max(0, v)) * 10) / 10);
        while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
        kept.push(`~ ${name}: ${fmt(position.x)}, ${fmt(position.y)}`);
    }
    return kept.join('\n');
}

/** Return the text with every position line removed. */
export function clearPositionLines(text) {
    return String(text == null ? '' : text).split(/\r\n|\r|\n/)
        .filter((raw) => !POSITION_LINE.exec(raw.trim()))
        .join('\n').replace(/\n+$/, '\n');
}
