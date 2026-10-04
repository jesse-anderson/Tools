// Flow text parser for the Sankey diagram builder. Pure, no DOM.
//
// Accepts one flow per line as `Source [amount] Target` or as three delimited
// fields `source,target,amount` (comma or tab). A flow can name the node its
// amount came through, as `Source [amount from Node] Target` or a fourth field. Every problem carries the line
// it came from, so the page can point at it.

export const LIMITS = Object.freeze({
    maxFlows: 500,
    maxNameLength: 80,
    maxNoteLength: 120,
    maxColumn: 40,
    maxTraces: 8
});

const FLOW_LINE = /^(.+?)\s*\[([^\]]*)\]\s*(.+)$/;
const COLOR_LINE = /^:\s*(.+?)\s+(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})$/;
const NOTE_LINE = /^@\s*([^:]+?)\s*:\s*(.+)$/;
const POSITION_LINE = /^~\s*([^:]+?)\s*:\s*(-?\d+\.?\d*)\s*%?\s*,\s*(-?\d+\.?\d*)\s*%?$/;
const COLUMN_LINE = /^>\s*([^:]+?)\s*:\s*(\d+)$/;
const AMOUNT =/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const GROUPED = /^[+-]?\d{1,3}([.,]\d{3})+$/;
// The amount of a flow that came through a named node: "12 from Referral".
const STATED = /^(.*\S)\s+from\s+(\S.*)$/i;
// A fourth field that is still part of a number, as in 1,234.
const NUMBER_PART = /^[0-9\s.,+eE-]*$/;
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
    const delimiter = line.includes('\t') ? '\t' : (line.includes(',') ? ',' : null);
    const fields = delimiter ? splitDelimited(line, delimiter) : [];
    const withOrigin = fields.length === 4 && !NUMBER_PART.test(fields[3]);
    // Delimited fields with a number third are a row, even when a name holds
    // brackets: "Stage [1],Stage [2],100" is not a flow of 1 out of "Stage".
    const isRow = (fields.length === 3 || withOrigin) && parseAmount(fields[2]).ok;

    let bracket = FLOW_LINE.exec(line);
    if (bracket && isRow) {
        // Both readings hold. A target that starts with the delimiter is a row
        // cut in the wrong place; anything else is read as typed and flagged.
        const after = line.slice(line.indexOf(']', bracket[1].length) + 1).replace(/^ */, '');
        const sound = parseAmount(bracket[2].replace(STATED, '$1')).ok && !after.startsWith(delimiter);
        if (!sound) bracket = null;
        else return { source: bracket[1], amount: bracket[2], target: bracket[3], ambiguous: true };
    }
    if (bracket) return { source: bracket[1], amount: bracket[2], target: bracket[3] };

    if (!delimiter) return null;
    if (withOrigin) {
        return { source: fields[0], target: fields[1], amount: fields[2], origin: fields[3], delimited: true };
    }
    if (fields.length !== 3) return { fieldCount: fields.length, delimiter };
    return { source: fields[0], target: fields[1], amount: fields[2], delimited: true };
}

/**
 * Parse the whole text.
 * Returns { flows, colors, notes, positions, columns, traces, errors, warnings }. flows are
 * { source, target, value, line }; errors and warnings are { line, code, message }.
 */
export function parseFlows(text) {
    const flows = [];
    const colors = {};
    const notes = {};
    const positions = {};
    const columns = {};
    const traces = [];
    const errors = [];
    const warnings = [];
    const lines = String(text == null ? '' : text).split(/\r\n|\r|\n/);
    let seenData = false;

    lines.forEach((rawLine, i) => {
        const lineNo = i + 1;
        const line = rawLine.trim();
        if (line === '' || line.startsWith('//')) return;
        if (line.startsWith('#')) {
            // "#1 fuel oil [50] Boiler" is a flow someone meant, dropped without a word.
            const hidden = /^#[^\s#]/.test(line) ? readFlowLine(line) : null;
            if (hidden && hidden.fieldCount === undefined) {
                warnings.push({
                    line: lineNo,
                    code: 'COMMENT_LOOKS_LIKE_FLOW',
                    message: 'starts with "#", so it is ignored as a comment and is not in the diagram or the balance. A node name cannot start with "#". If this is a comment, put a space after the "#" and this note goes away'
                });
            }
            return;
        }

        const color = COLOR_LINE.exec(line);
        if (color) {
            colors[cleanName(color[1])] = color[2].toLowerCase();
            return;
        }
        if (line.startsWith(':')) {
            errors.push({ line: lineNo, code: 'COLOR_NOT_UNDERSTOOD', message: 'a color line reads ": Node name #rrggbb"' });
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

        // A column asked for by hand, counted from 1 at the left.
        const column = COLUMN_LINE.exec(line);
        if (column) {
            const n = Number(column[2]);
            if (n < 1 || n > LIMITS.maxColumn) {
                errors.push({ line: lineNo, code: 'COLUMN_OUT_OF_RANGE', message: `a column is a whole number from 1 to ${LIMITS.maxColumn}` });
                return;
            }
            columns[cleanName(column[1])] = n;
            return;
        }

        const parts = readFlowLine(line);
        // A node to follow downstream. A flow whose source name starts with "*" is still a flow.
        if (line.startsWith('*') && (!parts || parts.fieldCount !== undefined)) {
            const name = cleanName(line.slice(1));
            if (!name) {
                errors.push({ line: lineNo, code: 'TRACE_NOT_UNDERSTOOD', message: 'a trace line reads "* Node name"' });
                return;
            }
            if (!traces.includes(name)) traces.push(name);
            return;
        }
        // A flow whose source name starts with ">" is still a flow.
        if (!parts && line.startsWith('>')) {
            errors.push({ line: lineNo, code: 'COLUMN_NOT_UNDERSTOOD', message: 'a column line reads "> Node name: 3"' });
            return;
        }
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
        if (parts.ambiguous) {
            warnings.push({
                line: lineNo,
                code: 'LINE_AMBIGUOUS',
                message: `could be a flow written with brackets or a row of fields. It is read as "${source}" to "${target}"`
            });
        }
        for (const name of [source, target]) {
            if (/\s\/\//.test(name)) {
                warnings.push({
                    line: lineNo,
                    code: 'NAME_HOLDS_COMMENT',
                    message: `"${name}" is read as one node name, "//" and all. A comment has to be on a line of its own`
                });
            }
        }
        if (source === target) {
            errors.push({ line: lineNo, code: 'SELF_LOOP', message: `"${source}" flows into itself, which a Sankey diagram cannot draw` });
            return;
        }

        // Where this amount came from, when the line says.
        let amountText = parts.amount;
        let origin = parts.origin === undefined ? '' : cleanName(parts.origin);
        const stated = parts.delimited ? null : STATED.exec(amountText);
        if (stated) {
            amountText = stated[1];
            origin = cleanName(stated[2]);
        }
        if (origin.length > LIMITS.maxNameLength) {
            errors.push({ line: lineNo, code: 'NAME_TOO_LONG', message: `a node name is limited to ${LIMITS.maxNameLength} characters` });
            return;
        }

        const amount = parseAmount(amountText);
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
        const flow = { source, target, value: amount.value, line: lineNo };
        if (origin) flow.origin = origin;
        flows.push(flow);
    });

    if (flows.length > LIMITS.maxFlows) {
        errors.push({ line: null, code: 'TOO_MANY_FLOWS', message: `${flows.length} flows entered, the limit is ${LIMITS.maxFlows}` });
    }

    if (traces.length > LIMITS.maxTraces) {
        errors.push({ line: null, code: 'TOO_MANY_TRACES', message: `${traces.length} nodes are set to be traced, the limit is ${LIMITS.maxTraces}` });
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
            warnings.push({ line: null, code: 'CASE_VARIANTS', message: `${list} differ only by capitalization and are drawn as separate nodes` });
        }
    }

    const known = new Set(flows.flatMap((f) => [f.source, f.target]));
    for (const name of new Set([...Object.keys(colors), ...Object.keys(notes), ...Object.keys(positions), ...Object.keys(columns), ...traces])) {
        if (!known.has(name)) {
            warnings.push({ line: null, code: 'UNKNOWN_NODE', message: `"${name}" has a color, note, position, column or trace but appears in no flow` });
        }
    }

    for (const name of new Set(flows.filter((f) => f.origin && !known.has(f.origin)).map((f) => f.origin))) {
        // Names are matched exactly, so a slip of capitals is the usual cause.
        const near = [...known].filter((k) => k.toLowerCase() === name.toLowerCase());
        const hint = near.length ? `. Names are matched exactly: did you mean "${near[0]}"?` : '';
        warnings.push({ line: null, code: 'ORIGIN_UNKNOWN', message: `a flow is written as coming from "${name}", which appears in no flow, so it is not followed${hint}` });
    }

    return { flows, colors, notes, positions, columns, traces, errors, warnings };
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

/** Whether a line is the trace line for a node. A flow starting with "*" is not. */
function isTraceLine(raw, name) {
    const line = raw.trim();
    if (!line.startsWith('*')) return false;
    const parts = readFlowLine(line);
    if (parts && parts.fieldCount === undefined) return false;
    return cleanName(line.slice(1)) === name;
}

/** Return the text with a node's trace line added or removed. */
export function setTraceLine(text, name, on) {
    const kept = String(text == null ? '' : text).split(/\r\n|\r|\n/).filter((raw) => !isTraceLine(raw, name));
    if (on) {
        while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
        kept.push(`* ${name}`);
    }
    return kept.join('\n');
}
