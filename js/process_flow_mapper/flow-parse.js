// Flow text parser for the process flow mapper. Pure, no DOM.
//
// One step per line: `Lane: Step {touch, wait W} -> label 80%: Target, ...`.
// Every problem carries the line it came from, so the page can point at it.

export const LIMITS = Object.freeze({
    maxLanes: 12,
    maxSteps: 150,
    maxExits: 300,
    maxPhases: 12,
    maxNameLength: 80,
    maxNoteLength: 120
});

// Hours in one of each unit. Days and weeks depend on the working calendar,
// so they are resolved later, against the settings.
export const TIME_UNITS = Object.freeze({
    s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
    m: 'min', min: 'min', mins: 'min', minute: 'min', minutes: 'min',
    h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
    d: 'd', day: 'd', days: 'd',
    w: 'wk', wk: 'wk', wks: 'wk', week: 'wk', weeks: 'wk'
});

const PHASE_LINE = /^==+\s*(.*?)\s*==+$/;
const COLOR_LINE = /^:\s*(.+?)\s+(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})$/;
const NOTE_LINE = /^@\s*(.+?)\s*:\s*(.+)$/;
const LANES_LINE = /^lanes\s*:\s*(.*)$/i;
const ARRIVALS_LINE = /^arrivals\s*:\s*(.*)$/i;
const STAFF_LINE = /^staff\s*:\s*(.*)$/i;
const STAFF = /^(.+?)\s+(\d+\.?\d*|\.\d+)(?:\s*@\s*(\d+\.?\d*|\.\d+)\s*%)?$/;
const STAFF_HELP = 'A staff line reads "staff: Sales 2, Finance 1 @ 25%": people on duty, then the share of their time this process gets';
const ARRIVALS =/^(\d+\.?\d*|\.\d+)\s*(?:\/|per)\s*([a-z]+)$/i;
const TIME = /^(wait\s+)?(\d+\.?\d*|\.\d+)\s*([a-z]+)$/i;
const SHARE = /(\d+\.?\d*|\.\d+)\s*%/;

const clean = (raw) => String(raw).replace(/\s+/g, ' ').trim();

/** A step name as typed, with wrapping double quotes removed. */
function stepName(raw) {
    const text = clean(raw);
    return text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? clean(text.slice(1, -1)) : text;
}

/** Index of the first `needle` that is not inside double quotes or braces, or -1. */
export function findOutside(text, needle, from = 0) {
    let quoted = false;
    let depth = 0;
    for (let i = from; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') quoted = !quoted;
        else if (!quoted && ch === '{') depth += 1;
        else if (!quoted && ch === '}') depth = Math.max(0, depth - 1);
        else if (!quoted && depth === 0 && text.startsWith(needle, i)) return i;
    }
    return -1;
}

/** Split on a separator, ignoring any inside double quotes or braces. */
export function splitOutside(text, separator) {
    const parts = [];
    let start = 0;
    for (;;) {
        const at = findOutside(text, separator, start);
        if (at < 0) break;
        parts.push(text.slice(start, at));
        start = at + separator.length;
    }
    parts.push(text.slice(start));
    return parts;
}

/** Shape of a step from the way its name is written. */
export function stepKind(name) {
    if (name.startsWith('(') && name.endsWith(')')) return 'terminator';
    if (name.endsWith('?')) return 'decision';
    return 'task';
}

/**
 * Read the inside of `{...}`. Returns { ok, touch, wait } with each time as
 * { value, unit } or null, or { ok: false, message }.
 */
export function parseTimes(inside) {
    const out = { ok: true, touch: null, wait: null };
    for (const raw of inside.split(',')) {
        const part = clean(raw);
        if (!part) continue;
        const m = TIME.exec(part);
        const unit = m ? TIME_UNITS[m[3].toLowerCase()] : null;
        if (!m || !unit) {
            return { ok: false, message: `"${part}" is not a time. Write a number and a unit, such as "15 min" or "wait 2 d"` };
        }
        const key = m[1] ? 'wait' : 'touch';
        if (out[key]) return { ok: false, message: `two ${key === 'wait' ? 'waits' : 'touch times'} given for one step` };
        out[key] = { value: Number(m[2]), unit };
    }
    return out;
}

/**
 * Parse the whole text. Returns
 * { lanes, arrivals, phases, steps, exits, notes, colors, errors, warnings }.
 * steps are { name, kind, lane, phase, touch, wait, line } in typing order;
 * exits are { source, target, label, share, line } with share 0..1 or null.
 */
export function parseFlow(text) {
    const lanes = [];
    const phases = [];
    const steps = [];
    const byName = new Map();
    const exits = [];
    const notes = {};
    const colors = {};
    const errors = [];
    const warnings = [];
    let arrivals = null;
    const staff = {};
    let lanesDeclared = false;
    let phase = -1;

    const fail = (line, code, message) => errors.push({ line, code, message });
    const laneIndex = (name) => {
        let at = lanes.indexOf(name);
        if (at < 0) { lanes.push(name); at = lanes.length - 1; }
        return at;
    };

    const lines = String(text == null ? '' : text).split(/\r\n|\r|\n/);
    lines.forEach((rawLine, i) => {
        const lineNo = i + 1;
        const line = rawLine.trim();
        if (line === '' || line.startsWith('//') || line.startsWith('#')) return;

        const phaseLine = PHASE_LINE.exec(line);
        if (phaseLine) {
            const name = clean(phaseLine[1]);
            if (!name) return fail(lineNo, 'PHASE_NOT_UNDERSTOOD', 'a phase line reads "== Phase name =="');
            if (name.length > LIMITS.maxNameLength) return fail(lineNo, 'NAME_TOO_LONG', `a name is limited to ${LIMITS.maxNameLength} characters`);
            phases.push({ name, line: lineNo });
            phase = phases.length - 1;
            return undefined;
        }

        const color = COLOR_LINE.exec(line);
        if (color) { colors[clean(color[1])] = color[2].toLowerCase(); return undefined; }
        if (line.startsWith(':')) return fail(lineNo, 'COLOR_NOT_UNDERSTOOD', 'a colour line reads ": Lane name #rrggbb"');

        if (line.startsWith('@')) {
            const note = NOTE_LINE.exec(line);
            if (!note) return fail(lineNo, 'NOTE_NOT_UNDERSTOOD', 'a note line reads "@ Step name: text"');
            const noteText = clean(note[2]);
            if (noteText.length > LIMITS.maxNoteLength) return fail(lineNo, 'NOTE_TOO_LONG', `a note is limited to ${LIMITS.maxNoteLength} characters`);
            notes[stepName(note[1])] = noteText;
            return undefined;
        }

        const lanesLine = LANES_LINE.exec(line);
        if (lanesLine) {
            const names = lanesLine[1].split(',').map(clean).filter(Boolean);
            if (!names.length) return fail(lineNo, 'LANES_NOT_UNDERSTOOD', 'a lanes line reads "lanes: First, Second, Third"');
            // Declared lanes go first, in the order given, whatever has been seen already.
            const seen = lanes.filter((l) => !names.includes(l));
            lanes.length = 0;
            lanes.push(...new Set(names), ...seen);
            for (const step of steps) step.lane = lanes.indexOf(step.laneName);
            lanesDeclared = true;
            return undefined;
        }

        const arrivalsLine = ARRIVALS_LINE.exec(line);
        if (arrivalsLine) {
            const m = ARRIVALS.exec(clean(arrivalsLine[1]));
            const unit = m ? TIME_UNITS[m[2].toLowerCase()] : null;
            if (!m || !unit) return fail(lineNo, 'ARRIVALS_NOT_UNDERSTOOD', 'an arrivals line reads "arrivals: 30 / wk"');
            arrivals = { count: Number(m[1]), per: unit, line: lineNo };
            return undefined;
        }

        // People on duty in a lane, and the share of their time this process gets.
        const staffLine = STAFF_LINE.exec(line);
        if (staffLine) {
            const entries = staffLine[1].split(',').map(clean).filter(Boolean);
            if (!entries.length) return fail(lineNo, 'STAFF_NOT_UNDERSTOOD', STAFF_HELP);
            for (const entry of entries) {
                const m = STAFF.exec(entry);
                const people = m ? Number(m[2]) : 0;
                const share = m && m[3] !== undefined ? Number(m[3]) / 100 : 1;
                if (!m || !(people > 0) || !(share > 0) || share > 1) return fail(lineNo, 'STAFF_NOT_UNDERSTOOD', `"${entry}" is not a staffing entry. ${STAFF_HELP}`);
                staff[clean(m[1])] = { people, share, line: lineNo };
            }
            return undefined;
        }

        // A step line: lane, then the step, then optionally where it goes.
        const colon = findOutside(line, ':');
        if (colon < 0) return fail(lineNo, 'LINE_NOT_UNDERSTOOD', 'expected "Lane: Step -> Next step". The lane comes first, then a colon');
        const laneName = clean(line.slice(0, colon));
        const rest = line.slice(colon + 1);
        if (!laneName) return fail(lineNo, 'LANE_MISSING', 'a step line starts with the lane that does the step');
        if (laneName.length > LIMITS.maxNameLength) return fail(lineNo, 'NAME_TOO_LONG', `a name is limited to ${LIMITS.maxNameLength} characters`);

        const arrow = findOutside(rest, '->');
        let head = arrow < 0 ? rest : rest.slice(0, arrow);
        const tail = arrow < 0 ? null : rest.slice(arrow + 2);

        let times = { ok: true, touch: null, wait: null };
        // A brace inside a quoted name is part of the name.
        const brace = head.replace(/"[^"]*"/g, '').indexOf('{');
        const quoteAware = head.lastIndexOf('{');
        if (quoteAware >= 0 && head.trim().endsWith('}')) {
            // Braces are found from the right so a quoted name may hold one.
            times = parseTimes(head.slice(quoteAware + 1, head.lastIndexOf('}')));
            if (!times.ok) return fail(lineNo, 'TIME_NOT_UNDERSTOOD', times.message);
            head = head.slice(0, quoteAware);
        } else if (brace >= 0) {
            return fail(lineNo, 'TIME_NOT_UNDERSTOOD', 'times go in braces after the step, such as "Check order {10 min, wait 1 d}"');
        }

        const name = stepName(head);
        if (!name) return fail(lineNo, 'STEP_MISSING', 'a step line needs a step after the lane');
        if (name.length > LIMITS.maxNameLength) return fail(lineNo, 'NAME_TOO_LONG', `a name is limited to ${LIMITS.maxNameLength} characters`);

        let step = byName.get(name);
        if (step && step.laneName !== laneName) {
            return fail(lineNo, 'LANE_CONFLICT', `"${name}" is already in lane "${step.laneName}" (line ${step.line}), and a step has one owner`);
        }
        if (!step) {
            step = { name, kind: stepKind(name), laneName, lane: laneIndex(laneName), phase, touch: null, wait: null, line: lineNo };
            byName.set(name, step);
            steps.push(step);
        }
        for (const key of ['touch', 'wait']) {
            if (!times[key]) continue;
            if (step[key]) return fail(lineNo, 'TIME_REPEATED', `"${name}" was already given a ${key === 'wait' ? 'wait' : 'touch time'} on line ${step.timeLine}`);
            step[key] = times[key];
            step.timeLine = lineNo;
        }

        if (tail === null) return undefined;
        const targets = splitOutside(tail, ',').map((t) => t.trim()).filter(Boolean);
        if (!targets.length) return fail(lineNo, 'EXIT_MISSING', 'nothing follows the arrow. Name the next step, or drop the arrow');
        for (const raw of targets) {
            const at = findOutside(raw, ':');
            const prefix = at < 0 ? '' : raw.slice(0, at);
            const target = stepName(at < 0 ? raw : raw.slice(at + 1));
            if (!target) return fail(lineNo, 'EXIT_MISSING', `"${clean(raw)}" names no step after the colon`);
            if (target.length > LIMITS.maxNameLength) return fail(lineNo, 'NAME_TOO_LONG', `a name is limited to ${LIMITS.maxNameLength} characters`);
            if (target === name) return fail(lineNo, 'SELF_LOOP', `"${name}" exits to itself. Model a retry as a check step that sends the work back`);
            const share = SHARE.exec(prefix);
            const value = share ? Number(share[1]) / 100 : null;
            if (value !== null && value > 1) return fail(lineNo, 'SHARE_OUT_OF_RANGE', `${share[1]}% is more than all of the work leaving "${name}"`);
            exits.push({ source: name, target, label: clean(prefix.replace(SHARE, '')), share: value, line: lineNo });
        }
        return undefined;
    });

    for (const exit of exits) {
        if (!byName.has(exit.target)) {
            fail(exit.line, 'STEP_HAS_NO_LANE', `"${exit.target}" is named as a next step but no line says which lane does it. Add "Lane: ${exit.target}"`);
        }
    }

    if (lanes.length > LIMITS.maxLanes) fail(null, 'TOO_MANY_LANES', `${lanes.length} lanes entered, the limit is ${LIMITS.maxLanes}`);
    if (steps.length > LIMITS.maxSteps) fail(null, 'TOO_MANY_STEPS', `${steps.length} steps entered, the limit is ${LIMITS.maxSteps}`);
    if (exits.length > LIMITS.maxExits) fail(null, 'TOO_MANY_EXITS', `${exits.length} exits entered, the limit is ${LIMITS.maxExits}`);
    if (phases.length > LIMITS.maxPhases) fail(null, 'TOO_MANY_PHASES', `${phases.length} phases entered, the limit is ${LIMITS.maxPhases}`);

    // Names that differ only by case are almost always one thing typed two ways.
    for (const [what, names] of [['steps', steps.map((s) => s.name)], ['lanes', lanes]]) {
        const folded = new Map();
        for (const name of names) {
            const key = name.toLowerCase();
            if (!folded.has(key)) folded.set(key, new Set());
            folded.get(key).add(name);
        }
        for (const set of folded.values()) {
            if (set.size > 1) {
                const list = [...set].map((n) => `"${n}"`).join(' and ');
                warnings.push({ line: null, code: 'CASE_VARIANTS', message: `${list} differ only by capitalisation and are treated as separate ${what}` });
            }
        }
    }

    for (const name of Object.keys(notes)) {
        if (!byName.has(name)) warnings.push({ line: null, code: 'UNKNOWN_STEP', message: `"${name}" has a note but is not a step` });
    }
    for (const name of Object.keys(colors)) {
        if (!lanes.includes(name)) warnings.push({ line: null, code: 'UNKNOWN_LANE', message: `"${name}" has a colour but is not a lane` });
    }
    for (const [name, entry] of Object.entries(staff)) {
        if (!lanes.includes(name)) warnings.push({ line: entry.line, code: 'UNKNOWN_LANE', message: `"${name}" is staffed but is not a lane` });
    }

    return { lanes, lanesDeclared, arrivals, staff, phases, steps, exits, notes, colors, errors, warnings };
}

const DIRECTIVE = /^(==|:|@|\/\/|#|lanes\s*:|arrivals\s*:|staff\s*:)/i;

/** The lane and step a step line declares, with where the lane ends, or null for any other line. */
function readStepLine(rawLine) {
    const line = rawLine.trim();
    if (line === '' || DIRECTIVE.test(line)) return null;
    const colon = findOutside(line, ':');
    if (colon < 0) return null;
    const rest = line.slice(colon + 1);
    const arrow = findOutside(rest, '->');
    let head = arrow < 0 ? rest : rest.slice(0, arrow);
    if (head.trim().endsWith('}') && head.lastIndexOf('{') >= 0) head = head.slice(0, head.lastIndexOf('{'));
    return { lane: clean(line.slice(0, colon)), step: stepName(head), after: line.slice(colon) };
}

/** Return the text with a step moved to another lane: every line that declares it is rewritten. */
export function setStepLane(text, step, lane) {
    return String(text == null ? '' : text).split(/\r\n|\r|\n/).map((raw) => {
        const read = readStepLine(raw);
        if (!read || read.step !== step) return raw;
        return `${raw.slice(0, raw.length - raw.trimStart().length)}${lane}${read.after}`;
    }).join('\n');
}

/** Return the text with the lane order set: the lanes line is replaced, or added at the top. */
export function setLaneOrder(text, lanes) {
    const rows = String(text == null ? '' : text).split(/\r\n|\r|\n/);
    const line = `lanes: ${lanes.join(', ')}`;
    const at = rows.findIndex((raw) => LANES_LINE.test(raw.trim()));
    if (at < 0) return [line, ...rows].join('\n');
    // Any later lanes line would override this one, so only the first is kept.
    return rows.filter((raw, i) => i === at || !LANES_LINE.test(raw.trim())).map((raw, i) => (i === at ? line : raw)).join('\n');
}

const needsQuotes = (name) => /,|:|->/.test(name);
const quoted = (name) => (needsQuotes(name) ? `"${name.replace(/"/g, '')}"` : name);

/**
 * Turn rows pasted from a spreadsheet into step lines. Columns are lane, step,
 * touch time, wait, next. Next holds one exit or several separated by
 * semicolons, each written as it would be after an arrow. Returns
 * { text, rows }, or null when the text is not tab-separated rows.
 */
export function tableToFlow(text) {
    const rows = String(text == null ? '' : text).split(/\r\n|\r|\n/).filter((r) => r.trim() !== '');
    if (rows.length < 2 || !rows.every((r) => r.includes('\t'))) return null;
    const cells = rows.map((r) => r.split('\t').map(clean));
    if (!cells.every((c) => c.length >= 2 && c[0] && c[1])) return null;
    const body = cells[0][0].toLowerCase() === 'lane' ? cells.slice(1) : cells;
    if (!body.length) return null;
    const out = body.map(([lane, step, touch = '', wait = '', next = '']) => {
        const times = [touch, wait ? `wait ${wait.replace(/^wait\s+/i, '')}` : ''].filter(Boolean).join(', ');
        const exits = next.split(';').map(clean).filter(Boolean).map((exit) => {
            const at = exit.lastIndexOf(':');
            return at < 0 ? quoted(exit) : `${exit.slice(0, at).trim()}: ${quoted(exit.slice(at + 1).trim())}`;
        });
        return `${lane}: ${quoted(step)}${times ? ` {${times}}` : ''}${exits.length ? ` -> ${exits.join(', ')}` : ''}`;
    });
    return { text: `${out.join('\n')}\n`, rows: body.length };
}
