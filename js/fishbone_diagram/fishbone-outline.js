// Outline text: the import, export and "Edit as text" format. Pure.
//
// Lines that break a rule are coerced and reported, never silently dropped:
// each finding has a code and the line it came from.

import { LIMITS } from './fishbone-limits.js';
import {
    ROOT, BIN_ID, BIN_NAME, STATUS_LABELS, SOLO_ACTOR, applyOp, emptyBoard, liveChildren, live
} from './fishbone-ops.js';

const TAB = 4;
const BULLET = /^(?:[-*+•◦▪]|\d{1,3}[.)]|[A-Za-z][.)])\s+/;
const KEY = /^(effect|preset|kind)\s*:\s*(.*)$/i;

const STATUS_TAGS = Object.freeze({
    suspected: 'suspected', '?': 'suspected',
    verified: 'verified', v: 'verified',
    'ruled out': 'ruledOut', ruledout: 'ruledOut', x: 'ruledOut',
    'not examined': ''
});

export const KIND_NAMES = Object.freeze({ standard: 'standard', process: 'process', enumeration: 'cause enumeration' });

const FINDINGS = Object.freeze({
    UNIFORM_INDENT: 'Every line was indented by the same amount; that indent was removed',
    INDENT_COERCED: 'This line steps back to an indent no earlier line used; it was placed under the nearest shallower line',
    TOO_DEEP: `Causes go at most ${LIMITS.depth} levels below a category; this one was placed at the deepest level`,
    NO_CATEGORY: `This cause comes before any category, so it went to ${BIN_NAME}`,
    EVIDENCE_NO_CAUSE: 'Evidence (a line starting with >) has to sit under a cause; this one was dropped',
    HASH_LINE: 'Only the first line can be "# problem statement"; this line was skipped',
    UNKNOWN_TAG: 'The brackets at the end hold something that is not a status or @owner, so they were kept as text',
    DUPLICATE_MERGED: 'The same item appears twice under one parent; the two were merged',
    TEXT_TRUNCATED: 'This text was longer than the limit and was cut short',
    UNKNOWN_KEY: 'This preset or kind is not one the tool knows; the line was skipped',
    LIMIT_CATEGORIES: `A board holds at most ${LIMITS.categories} categories; this one and the rest were left out`,
    LIMIT_CAUSES: `A board holds at most ${LIMITS.causes} causes; this one and the rest were left out`,
    LIMIT_EVIDENCE: `A cause holds at most ${LIMITS.evidencePerCause} evidence lines; the rest were left out`
});

const finding = (code, line) => ({ code, line, message: FINDINGS[code] });
const norm = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** Columns of leading whitespace, with a tab as four. */
function indentOf(raw) {
    let cols = 0;
    let i = 0;
    for (; i < raw.length; i++) {
        if (raw[i] === ' ' || raw[i] === ' ') cols += 1;
        else if (raw[i] === '\t') cols += TAB;
        else break;
    }
    return { cols, body: raw.slice(i).trimEnd() };
}

const unescape = (text) => text.replace(/\\(.)/g, '$1');

/** True when the character at i is escaped by an odd run of backslashes. */
function escapedAt(text, i) {
    let n = 0;
    for (let j = i - 1; j >= 0 && text[j] === '\\'; j--) n++;
    return n % 2 === 1;
}

/** Split trailing [tags] off a cause. tags is null when there are none. */
export function splitTags(body) {
    const end = body.length - 1;
    if (body[end] !== ']' || escapedAt(body, end)) return { text: body, tags: null };
    let open = -1;
    for (let i = end - 1; i >= 0; i--) {
        if (body[i] === '[' && !escapedAt(body, i)) { open = i; break; }
    }
    if (open < 0) return { text: body, tags: null };
    const tokens = body.slice(open + 1, end).split(',').map((t) => t.trim()).filter(Boolean);
    const tags = { status: null, owner: null };
    for (const token of tokens) {
        const lower = token.toLowerCase().replace(/\s+/g, ' ');
        if (Object.prototype.hasOwnProperty.call(STATUS_TAGS, lower) && tags.status === null) tags.status = STATUS_TAGS[lower];
        else if (token.startsWith('@') && token.length > 1 && tags.owner === null) tags.owner = token.slice(1).trim();
        else return { text: body, tags: null, unknown: true };
    }
    if (!tokens.length) return { text: body, tags: null, unknown: true };
    return { text: body.slice(0, open).trimEnd(), tags };
}

function clip(text, max, line, findings) {
    if (text.length <= max) return text;
    findings.push(finding('TEXT_TRUNCATED', line));
    return text.slice(0, max).trimEnd();
}

/**
 * Parse outline text. Returns { effect, preset, kind, categories, bin, findings }
 * where effect, preset and kind are null when not given, and each item is
 * { text, line, children } with causes also carrying status, owner, evidence.
 */
export function parseOutline(input) {
    const findings = [];
    const out = { effect: null, preset: null, kind: null, categories: [], bin: null, findings };
    const lines = String(input == null ? '' : input).replace(/\r\n?/g, '\n').split('\n');
    const content = [];
    lines.forEach((raw, i) => {
        const { cols, body } = indentOf(raw);
        if (!body || (body.startsWith('//'))) return;
        content.push({ line: i + 1, cols, body });
    });
    if (!content.length) return out;

    // A first line "# text" is the head.
    if (/^#(?!#)/.test(content[0].body) && content[0].cols === 0) {
        out.effect = clip(unescape(content[0].body.replace(/^#\s*/, '')), LIMITS.effect, content[0].line, findings);
        content.shift();
    }
    const least = content.length ? Math.min(...content.map((c) => c.cols)) : 0;
    if (least > 0) {
        findings.push(finding('UNIFORM_INDENT', content[0].line));
        for (const c of content) c.cols -= least;
    }

    let stack = [];
    const binItem = () => {
        if (!out.bin) out.bin = { text: BIN_NAME, line: 0, children: [], isBin: true };
        return out.bin;
    };
    // Add a child, merging it into an earlier sibling with the same text.
    const attach = (list, item, line) => {
        const same = list.find((x) => norm(x.text) === norm(item.text));
        if (!same) { list.push(item); return item; }
        findings.push(finding('DUPLICATE_MERGED', line));
        if (item.status && !same.status) same.status = item.status;
        if (item.owner && !same.owner) same.owner = item.owner;
        if (item.evidence) for (const e of item.evidence) if (!same.evidence.includes(e)) same.evidence.push(e);
        return same;
    };

    for (const { line, cols, body } of content) {
        if (cols === 0) {
            if (body.startsWith('#')) { findings.push(finding('HASH_LINE', line)); continue; }
            if (body.startsWith('>')) { findings.push(finding('EVIDENCE_NO_CAUSE', line)); continue; }
            const key = KEY.exec(body);
            if (key) {
                const name = key[1].toLowerCase();
                const value = unescape(key[2]).trim();
                if (name === 'effect') out.effect = clip(value, LIMITS.effect, line, findings);
                else out[name] = { value, line };
                continue;
            }
            const text = clip(unescape(body.replace(BULLET, '')).trim(), LIMITS.causeText, line, findings);
            const item = norm(text) === norm(BIN_NAME)
                ? binItem()
                : attach(out.categories, { text, line, children: [] }, line);
            if (item.isBin && !item.line) item.line = line;
            stack = [{ cols: 0, item, depth: 0 }];
            continue;
        }

        const stripped = body.replace(BULLET, '');
        if (stripped.startsWith('>')) {
            const owner = [...stack].reverse().find((s) => s.cols < cols);
            if (!owner || owner.depth === 0) { findings.push(finding('EVIDENCE_NO_CAUSE', line)); continue; }
            const text = clip(stripped.slice(1).trim(), LIMITS.evidenceText, line, findings);
            if (!text) continue;
            if (owner.item.evidence.length >= LIMITS.evidencePerCause) { findings.push(finding('LIMIT_EVIDENCE', line)); continue; }
            if (!owner.item.evidence.includes(text)) owner.item.evidence.push(text);
            continue;
        }

        if (!stack.length) {
            findings.push(finding('NO_CATEGORY', line));
            stack = [{ cols: 0, item: binItem(), depth: 0 }];
        }
        let popped = false;
        let matched = false;
        while (stack.length > 1 && stack[stack.length - 1].cols >= cols) {
            if (stack[stack.length - 1].cols === cols) matched = true;
            stack.pop();
            popped = true;
        }
        if (popped && !matched) findings.push(finding('INDENT_COERCED', line));
        let parent = stack[stack.length - 1];
        if (parent.depth + 1 > LIMITS.depth) {
            findings.push(finding('TOO_DEEP', line));
            parent = stack[LIMITS.depth - 1];
        }
        const split = splitTags(stripped);
        if (split.unknown) findings.push(finding('UNKNOWN_TAG', line));
        const item = {
            text: clip(unescape(split.text).trim(), LIMITS.causeText, line, findings),
            line,
            status: split.tags && split.tags.status ? split.tags.status : '',
            owner: split.tags && split.tags.owner ? split.tags.owner.slice(0, LIMITS.owner) : '',
            evidence: [],
            children: []
        };
        const placed = attach(parent.item.children, item, line);
        stack = stack.slice(0, stack.indexOf(parent) + 1);
        stack.push({ cols, item: placed, depth: parent.depth + 1 });
    }
    return out;
}

// ---------- Writing ----------

const LEADING_SYNTAX = /^(?:[>#\\]|\/\/|[-*+•◦▪]\s|\d{1,3}[.)]\s|[A-Za-z][.)]\s)/;

/** Escape text so it reads back as itself. */
export function escapeItem(text, { category = false } = {}) {
    let out = String(text).replace(/\\/g, '\\\\').replace(/\[/g, '\\[');
    if (LEADING_SYNTAX.test(text) || (category && (KEY.test(text) || norm(text) === norm(BIN_NAME)))) out = `\\${out}`;
    return out;
}

function tagText(node) {
    const tags = [];
    if (node.status) tags.push(STATUS_LABELS[node.status]);
    if (node.owner) tags.push(`@${node.owner}`);
    return tags.length ? ` [${tags.join(', ')}]` : '';
}

/** The board as outline text. Drops ids, locks, proposals, notes, history and votes. */
export function toOutline(board, { presetLabel = null } = {}) {
    const lines = [];
    if (board.effect) lines.push(`effect: ${board.effect}`);
    if (presetLabel) lines.push(`preset: ${presetLabel}`);
    if (board.kind && board.kind !== 'standard') lines.push(`kind: ${KIND_NAMES[board.kind]}`);
    if (lines.length) lines.push('');
    const walk = (id, depth) => {
        const node = board.nodes[id];
        const pad = '  '.repeat(depth);
        lines.push(`${pad}${escapeItem(node.text, { category: depth === 0 && node.kind === 'category' })}${node.kind === 'cause' ? tagText(node) : ''}`);
        if (node.kind === 'cause') for (const e of node.evidence) lines.push(`${pad}  > ${e.text}`);
        for (const kid of liveChildren(board, id)) walk(kid, depth + 1);
    };
    for (const id of liveChildren(board, ROOT)) {
        const node = board.nodes[id];
        if (node.kind === 'unsorted') lines.push(BIN_NAME);
        else walk(id, 0);
        if (node.kind === 'unsorted') for (const kid of liveChildren(board, id)) walk(kid, 1);
    }
    return `${lines.join('\n')}\n`;
}

// ---------- Into a board ----------

/** Resolve the parsed preset and kind lines. lookupPreset(text) returns an id or null. */
export function resolveKeys(parsed, lookupPreset) {
    const out = { preset: null, kind: null };
    if (parsed.preset) {
        const id = lookupPreset(parsed.preset.value);
        if (id) out.preset = id;
        else parsed.findings.push(finding('UNKNOWN_KEY', parsed.preset.line));
    }
    if (parsed.kind) {
        const value = norm(parsed.kind.value).replace(/ fishbone$/, '');
        const kind = Object.keys(KIND_NAMES).find((k) => k === value || KIND_NAMES[k] === value);
        if (kind) out.kind = kind;
        else parsed.findings.push(finding('UNKNOWN_KEY', parsed.kind.line));
    }
    return out;
}

const evidenceList = (texts) => texts.map((text, i) => ({ id: `e${i + 1}`, text }));

/**
 * A new board from parsed outline text. Everything goes through applyOp, so
 * the limits hold; the history becomes one line saying where it came from.
 */
export function boardFromOutline(parsed, { newId, now = 0, keys = {}, title = '', origin = 'Started from outline text' } = {}) {
    let board = emptyBoard({ title, now });
    const apply = (op) => {
        const { board: next, result } = applyOp(board, op, SOLO_ACTOR, now);
        board = next;
        return result;
    };
    if (parsed.effect) apply({ type: 'setBoard', field: 'effect', value: parsed.effect });
    if (keys.kind) apply({ type: 'setBoard', field: 'kind', value: keys.kind });
    if (keys.preset) apply({ type: 'setBoard', field: 'preset', value: keys.preset });
    addItems(parsed, (op, line) => {
        const result = apply(op);
        if (!result.ok && (result.reason === 'LIMIT_CATEGORIES' || result.reason === 'LIMIT_CAUSES')) {
            parsed.findings.push(finding(result.reason, line));
        }
        return result.ok;
    }, newId, () => board);
    board.history = [{ n: 1, seq: 0, at: now, by: SOLO_ACTOR.memberId, summary: origin }];
    board.historyN = 1;
    return board;
}

/** Feed addNode ops for every parsed item to add(op, line). Stops a branch whose parent failed. */
function addItems(parsed, add, newId, getBoard, findCategory = () => null) {
    const addCauses = (parentId, items) => {
        let after = null;
        for (const item of items) {
            const id = newId();
            const ok = add({
                type: 'addNode', id, parentId, after, kind: 'cause', text: item.text,
                status: item.status || undefined, owner: item.owner || undefined,
                evidence: item.evidence.length ? evidenceList(item.evidence) : undefined
            }, item.line);
            if (!ok) continue;
            after = id;
            addCauses(id, item.children);
        }
    };
    let after = null;
    for (const cat of parsed.categories) {
        const existing = findCategory(cat.text);
        let id = existing;
        if (!id) {
            id = newId();
            if (!add({ type: 'addNode', id, parentId: ROOT, after, kind: 'category', text: cat.text }, cat.line)) continue;
            after = id;
        }
        addCauses(id, cat.children);
    }
    if (parsed.bin) {
        const board = getBoard();
        if (!board.nodes[BIN_ID] || board.nodes[BIN_ID].deleted) {
            const ok = add({ type: 'addNode', id: BIN_ID, parentId: ROOT, after: lastOf(board, ROOT), kind: 'unsorted', text: BIN_NAME }, parsed.bin.line);
            if (!ok && !live(getBoard(), BIN_ID)) return;
        }
        addCauses(BIN_ID, parsed.bin.children);
    }
}

function lastOf(board, parentId) {
    const list = board.order[parentId] || [];
    return list.length ? list[list.length - 1] : null;
}

/**
 * Ops that add a pasted outline to a board without changing anything already
 * there. Categories are matched by name; causes are added at the end.
 */
export function pasteOps(board, parsed, newId) {
    const ops = [];
    const categories = liveChildren(board, ROOT).filter((id) => board.nodes[id].kind === 'category');
    const findCategory = (text) => categories.find((id) => norm(board.nodes[id].text) === norm(text)) || null;
    const lastKnown = new Map();
    const tail = (parentId) => (lastKnown.has(parentId) ? lastKnown.get(parentId) : lastOf(board, parentId));
    addItems(parsed, (op) => {
        op.after = tail(op.parentId);
        lastKnown.set(op.parentId, op.id);
        ops.push(op);
        return true;
    }, newId, () => board, findCategory);
    return ops;
}

/**
 * "Edit as text" for a solo project. Items are matched to the board by their
 * path of texts, so ids, locks, notes and proposals survive; anything no
 * longer in the text becomes a deleted item that undo can bring back.
 */
export function rebuildFromOutline(board, parsed, { newId, now = 0, keys = {} } = {}) {
    const byPath = new Map();
    const walk = (id, path) => {
        const node = board.nodes[id];
        const key = `${path}/${norm(node.kind === 'unsorted' ? BIN_NAME : node.text)}`;
        if (!byPath.has(key)) byPath.set(key, node);
        for (const kid of liveChildren(board, id)) walk(kid, key);
    };
    for (const id of liveChildren(board, ROOT)) walk(id, '');

    const next = emptyBoard();
    Object.assign(next, {
        ...board,
        nodes: {},
        order: { [ROOT]: [] },
        effectParts: { ...board.effectParts },
        settings: { ...board.settings },
        boardLocks: { ...board.boardLocks },
        members: { ...board.members },
        history: board.history.slice()
    });
    if (parsed.effect !== null) next.effect = parsed.effect;
    if (keys.kind) next.kind = keys.kind;
    if (keys.preset) next.preset = keys.preset;
    const used = new Set();
    let causes = 0;
    let categoryCount = 0;

    const place = (item, parentId, path, kind, depth) => {
        const key = `${path}/${norm(item.text)}`;
        const old = byPath.get(key);
        const reuse = old && !used.has(old.id) && old.kind === kind ? old : null;
        if (kind === 'cause' && causes >= LIMITS.causes) { parsed.findings.push(finding('LIMIT_CAUSES', item.line)); return; }
        if (kind === 'category' && categoryCount >= LIMITS.categories) { parsed.findings.push(finding('LIMIT_CATEGORIES', item.line)); return; }
        const id = kind === 'unsorted' ? BIN_ID : (reuse ? reuse.id : newId());
        used.add(id);
        const base = reuse ? { ...reuse } : {
            id, parentId, kind, text: '', status: '', owner: '', note: '', proposal: null, evidence: [],
            lock: 'none', lockedBy: '', lockedAt: 0, lockNote: '', deleted: false, deletedRoot: '', deletedN: 0,
            createdBy: SOLO_ACTOR.memberId, createdAt: now, updatedBy: SOLO_ACTOR.memberId, updatedAt: now
        };
        const node = { ...base, parentId, kind, text: kind === 'unsorted' ? BIN_NAME : item.text, deleted: false, deletedRoot: '', deletedN: 0 };
        if (kind === 'cause') {
            causes += 1;
            node.status = item.status || '';
            node.owner = item.owner || '';
            const oldEvidence = reuse ? reuse.evidence : [];
            node.evidence = item.evidence.map((text, i) => {
                const same = oldEvidence.find((e) => e.text === text);
                return { id: same ? same.id : `n${i + 1}`, text };
            });
            const ids = new Set();
            node.evidence.forEach((e, i) => { if (ids.has(e.id)) e.id = `n${i + 1}x`; ids.add(e.id); });
        }
        if (kind === 'category') categoryCount += 1;
        if (!reuse || JSON.stringify([reuse.text, reuse.status, reuse.owner, reuse.evidence, reuse.parentId]) !==
            JSON.stringify([node.text, node.status, node.owner, node.evidence, node.parentId])) {
            node.updatedAt = now;
            node.updatedBy = SOLO_ACTOR.memberId;
        }
        next.nodes[id] = node;
        next.order[id] = [];
        next.order[parentId].push(id);
        if (depth < LIMITS.depth) for (const kid of item.children) place(kid, id, key, 'cause', depth + 1);
    };
    for (const cat of parsed.categories) place(cat, ROOT, '', 'category', 0);
    if (parsed.bin) place({ ...parsed.bin, text: BIN_NAME }, ROOT, '', 'unsorted', 0);

    // Whatever the text no longer holds stays as a deleted item.
    const n = next.historyN + 1;
    let removed = 0;
    for (const node of Object.values(board.nodes)) {
        if (used.has(node.id)) continue;
        const parentGone = !used.has(node.parentId) && node.parentId !== ROOT;
        const tomb = node.deleted ? { ...node } : { ...node, deleted: true, deletedRoot: node.id, deletedN: n };
        if (!node.deleted) removed += 1;
        if (!node.deleted && parentGone && board.nodes[node.parentId] && !board.nodes[node.parentId].deleted) {
            tomb.deletedRoot = topRemoved(board, node, used);
        }
        next.nodes[node.id] = tomb;
        if (!next.order[node.id]) next.order[node.id] = [];
        if (next.order[tomb.parentId]) next.order[tomb.parentId].push(node.id);
        else next.order[tomb.parentId] = [node.id];
    }
    for (const id of Object.keys(next.order)) if (id !== ROOT && !next.nodes[id]) delete next.order[id];
    next.historyN = n;
    next.history.push({ n, seq: next.seq, at: now, by: SOLO_ACTOR.memberId, summary: `Edited as text${removed ? `, ${removed} item${removed === 1 ? '' : 's'} removed` : ''}` });
    if (next.history.length > LIMITS.history) next.history.splice(0, next.history.length - LIMITS.history);
    const top = next.order[ROOT];
    if (top.includes(BIN_ID)) { top.splice(top.indexOf(BIN_ID), 1); top.push(BIN_ID); }
    return next;
}

function topRemoved(board, node, used) {
    let top = node;
    let at = board.nodes[node.parentId];
    while (at && !used.has(at.id) && !at.deleted) {
        top = at;
        at = board.nodes[at.parentId];
    }
    return top.id;
}
