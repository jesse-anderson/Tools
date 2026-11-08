// Project file and storage versions. Anything read from a file, from storage
// or from a link goes through cleanBoard, which rebuilds a valid board and
// never trusts what it was given. Pure.

import { LIMITS } from './fishbone-limits.js';
import {
    SCHEMA, ROOT, BIN_ID, BIN_NAME, STATUSES, ROLES, KINDS, DEFAULT_SETTINGS, SETTING_RANGES,
    isId, emptyBoard, makeNode, cleanEvidence
} from './fishbone-ops.js';

// One function per older schema, each lifting a board one version. None yet.
export const UPGRADES = Object.freeze({});

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '');
const num = (v) => (Number.isFinite(v) ? v : 0);

/** Lift a raw board to the current schema. Returns null when it is from a newer one. */
export function upgradeBoard(raw) {
    let board = raw;
    let schema = Number.isInteger(raw.schema) ? raw.schema : SCHEMA;
    if (schema > SCHEMA) return null;
    while (schema < SCHEMA) {
        const step = UPGRADES[schema];
        if (!step) return null;
        board = step(board);
        schema += 1;
    }
    return board;
}

function cleanNode(raw, id) {
    const kind = ['category', 'cause', 'unsorted'].includes(raw.kind) ? raw.kind : 'cause';
    const node = makeNode(id, typeof raw.parentId === 'string' ? raw.parentId : ROOT, kind, str(raw.text, LIMITS.causeText),
        str(raw.createdBy, 40), num(raw.createdAt));
    if (kind === 'unsorted') node.text = BIN_NAME;
    if (kind === 'cause') {
        node.status = STATUSES.includes(raw.status) ? raw.status : '';
        node.owner = str(raw.owner, LIMITS.owner).replace(/[,[\]]/g, ' ').replace(/\s+/g, ' ').trim();
        const evidence = Array.isArray(raw.evidence)
            ? cleanEvidence(raw.evidence.slice(0, LIMITS.evidencePerCause)
                .filter((e) => e && typeof e === 'object')
                .map((e) => ({ id: e.id, text: str(e.text, LIMITS.evidenceText) })))
            : [];
        node.evidence = Array.isArray(evidence) ? evidence : [];
        const p = raw.proposal;
        if (p && typeof p === 'object' && STATUSES.includes(p.status)) {
            node.proposal = { status: p.status, by: str(p.by, 40), at: num(p.at), evidenceNote: str(p.evidenceNote, LIMITS.note) };
        }
    }
    node.note = str(raw.note, LIMITS.note);
    if (['item', 'branch'].includes(raw.lock)) {
        node.lock = raw.lock;
        node.lockedBy = str(raw.lockedBy, 40);
        node.lockedAt = num(raw.lockedAt);
        node.lockNote = str(raw.lockNote, LIMITS.note);
    }
    if (raw.deleted === true) {
        node.deleted = true;
        node.deletedRoot = isId(raw.deletedRoot) ? raw.deletedRoot : id;
        node.deletedN = num(raw.deletedN);
    }
    node.updatedBy = str(raw.updatedBy, 40);
    node.updatedAt = num(raw.updatedAt);
    return node;
}

/**
 * Rebuild a board from anything. Returns { board } or { error } where error
 * is 'notBoard' or 'newer'. Structure is repaired, not refused: a cause whose
 * parent is missing goes to the bin, and anything past a limit is dropped.
 */
export function cleanBoard(input) {
    if (!input || typeof input !== 'object' || !input.nodes || typeof input.nodes !== 'object') return { error: 'notBoard' };
    const raw = upgradeBoard(input);
    if (!raw) return { error: 'newer' };
    const board = emptyBoard();
    board.id = str(raw.id, 64);
    board.title = str(raw.title, LIMITS.title);
    board.effect = str(raw.effect, LIMITS.effect);
    const parts = raw.effectParts && typeof raw.effectParts === 'object' ? raw.effectParts : {};
    for (const key of Object.keys(board.effectParts)) board.effectParts[key] = str(parts[key], LIMITS.effectPart);
    board.kind = KINDS.includes(raw.kind) ? raw.kind : 'standard';
    board.preset = typeof raw.preset === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.preset) ? raw.preset : 'none';
    const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    for (const [key, [lo, hi]] of Object.entries(SETTING_RANGES)) {
        board.settings[key] = Number.isInteger(settings[key]) && settings[key] >= lo && settings[key] <= hi ? settings[key] : DEFAULT_SETTINGS[key];
    }
    board.settings.showEmpty = typeof settings.showEmpty === 'boolean' ? settings.showEmpty : DEFAULT_SETTINGS.showEmpty;
    const locks = raw.boardLocks && typeof raw.boardLocks === 'object' ? raw.boardLocks : {};
    for (const key of ['effect', 'categories', 'statuses', 'frozen']) {
        if (typeof locks[key] === 'boolean') board.boardLocks[key] = locks[key];
    }
    board.boardLocks.downloads = locks.downloads === 'champions' ? 'champions' : 'everyone';
    if (raw.members && typeof raw.members === 'object') {
        for (const [id, m] of Object.entries(raw.members).slice(0, LIMITS.members)) {
            if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !m || typeof m !== 'object') continue;
            const name = str(m.name, LIMITS.memberName);
            if (name && ROLES.includes(m.role)) board.members[id] = { name, role: m.role };
        }
    }
    board.expiresAt = num(raw.expiresAt);
    board.seq = Number.isInteger(raw.seq) && raw.seq >= 0 ? raw.seq : 0;
    board.createdAt = num(raw.createdAt);
    if (Array.isArray(raw.history)) {
        board.history = raw.history.slice(-LIMITS.history)
            .filter((h) => h && typeof h === 'object' && typeof h.summary === 'string')
            .map((h, i) => ({ n: Number.isInteger(h.n) ? h.n : i + 1, seq: num(h.seq), at: num(h.at), by: str(h.by, 40), summary: str(h.summary, 400) }));
    }
    board.historyN = Math.max(Number.isInteger(raw.historyN) ? raw.historyN : 0, ...board.history.map((h) => h.n), 0);

    // Nodes, each under its own id.
    for (const [id, node] of Object.entries(raw.nodes)) {
        if (!isId(id) || !node || typeof node !== 'object') continue;
        const clean = cleanNode(node, id);
        if (id === BIN_ID) { clean.kind = 'unsorted'; clean.text = BIN_NAME; }
        else if (clean.kind === 'unsorted') continue;
        if (clean.kind !== 'cause') clean.parentId = ROOT;
        board.nodes[id] = clean;
    }
    for (const node of Object.values(board.nodes)) {
        if (node.kind === 'cause' && (node.parentId === ROOT || !board.nodes[node.parentId] || board.nodes[node.parentId] === node)) {
            node.parentId = BIN_ID;
        }
    }
    // Break any cycle by sending its first member found to the bin.
    for (const node of Object.values(board.nodes)) {
        const seen = new Set();
        let at = node;
        while (at && at.parentId !== ROOT) {
            if (seen.has(at.id)) { at.parentId = BIN_ID; break; }
            seen.add(at.id);
            at = board.nodes[at.parentId];
        }
    }
    if (Object.values(board.nodes).some((n) => n.parentId === BIN_ID) && !board.nodes[BIN_ID]) {
        board.nodes[BIN_ID] = makeNode(BIN_ID, ROOT, 'unsorted', BIN_NAME);
    }

    // Order: keep the given order where it agrees with the parents, then append the rest.
    const rawOrder = raw.order && typeof raw.order === 'object' ? raw.order : {};
    board.order = { [ROOT]: [] };
    const placed = new Set();
    for (const id of Object.keys(board.nodes)) board.order[id] = [];
    const parents = [ROOT, ...Object.keys(board.nodes)];
    for (const pid of parents) {
        const list = Array.isArray(rawOrder[pid]) ? rawOrder[pid] : [];
        for (const id of list) {
            const node = board.nodes[id];
            if (node && node.parentId === pid && !placed.has(id)) { board.order[pid].push(id); placed.add(id); }
        }
    }
    for (const node of Object.values(board.nodes)) {
        if (!placed.has(node.id)) { board.order[node.parentId].push(node.id); placed.add(node.id); }
    }
    // The bin always draws last, so keep it last among the top level.
    const top = board.order[ROOT];
    if (top.includes(BIN_ID)) { top.splice(top.indexOf(BIN_ID), 1); top.push(BIN_ID); }

    applyLimits(board);
    return { board };
}

/** Deleted parents take their live children with them; then counts and depth are held to the limits. */
function applyLimits(board) {
    const walk = (id, depth, parentDeleted, parentRoot) => {
        const node = board.nodes[id];
        if (parentDeleted && !node.deleted) { node.deleted = true; node.deletedRoot = parentRoot; }
        for (const kid of board.order[id].slice()) walk(kid, depth + 1, node.deleted, node.deleted ? node.deletedRoot : '');
    };
    for (const id of board.order[ROOT]) walk(id, 0, false, '');

    let categories = 0;
    let causes = 0;
    const drop = (id) => {
        for (const kid of board.order[id]) drop(kid);
        delete board.nodes[id];
        delete board.order[id];
    };
    const prune = (parent, depth) => {
        for (const id of board.order[parent].slice()) {
            const node = board.nodes[id];
            const counts = !node.deleted;
            let keep = true;
            if (node.kind === 'category' && counts) keep = ++categories <= LIMITS.categories;
            if (node.kind === 'cause') keep = depth <= LIMITS.depth && (!counts || ++causes <= LIMITS.causes);
            if (!keep) {
                drop(id);
                board.order[parent].splice(board.order[parent].indexOf(id), 1);
                continue;
            }
            prune(id, depth + 1);
        }
    };
    prune(ROOT, 0);
}

/** Read a project or link payload into a board. */
export function readBoard(input) {
    const result = cleanBoard(input);
    if (result.error === 'newer') return { ok: false, message: 'That file is from a newer version of this tool and cannot be read' };
    if (result.error) return { ok: false, message: 'That is not a fishbone board' };
    return { ok: true, board: result.board };
}

export { SCHEMA };
