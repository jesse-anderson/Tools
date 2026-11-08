// The fishbone board model and the one function that changes it.
// Pure and imports only the limits, so it can be copied to the worker as is.
// Every permission check lives in applyOp, so the page and the server cannot
// disagree about who may do what.

import { LIMITS } from './fishbone-limits.js';

export const OPS_VERSION = 1;
export const SCHEMA = 1;
export const ROOT = 'root';
export const BIN_ID = 'unsorted';
export const BIN_NAME = 'Unsorted';
export const STATUSES = Object.freeze(['', 'suspected', 'verified', 'ruledOut']);
export const STATUS_LABELS = Object.freeze({ '': 'not examined', suspected: 'suspected', verified: 'verified', ruledOut: 'ruled out' });
export const ROLES = Object.freeze(['champion', 'member', 'viewer']);
export const KINDS = Object.freeze(['standard', 'enumeration', 'process']);
export const BOARD_LOCKS = Object.freeze(['effect', 'categories', 'statuses', 'frozen', 'downloads']);
export const SOLO_ACTOR = Object.freeze({ memberId: 'you', role: 'champion' });
export const DEFAULT_SETTINGS = Object.freeze({ angle: 60, wrap: 26, showEmpty: true });
export const SETTING_RANGES = Object.freeze({ angle: [45, 75], wrap: [12, 60] });

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ID_RE = /^[A-Z2-7]{12}$/;

export const isId = (id) => id === BIN_ID || (typeof id === 'string' && ID_RE.test(id));

/** A 12 character base32 id. randomBytes(n) returns n random bytes. */
export function newId(randomBytes) {
    const bytes = randomBytes(12);
    let id = '';
    for (let i = 0; i < 12; i++) id += ID_ALPHABET[bytes[i] & 31];
    return id;
}

export const REASONS = Object.freeze({
    BAD_OP: 'That change is not understood',
    BAD_VALUE: 'That value is not allowed there',
    VIEWER_READ_ONLY: 'Viewers can read this board but not change it',
    FROZEN: 'The board is frozen for review. Only a champion can change it',
    CHAMPION_ONLY: 'Only a champion can do that',
    LOCKED_BY_CHAMPION: 'That item is locked by a champion',
    LOCK_BELOW: 'Something inside this branch is locked, so it cannot be moved or deleted',
    EFFECT_LOCKED: 'The problem statement is locked',
    CATEGORIES_LOCKED: 'The categories are locked',
    STATUS_LOCKED: 'Statuses are set by a champion. Propose one instead',
    NODE_MISSING: 'That item no longer exists',
    NODE_DELETED: 'That item was deleted',
    PARENT_DELETED: 'The item it belonged under was deleted',
    CYCLE: 'That would put the cause inside itself',
    DUPLICATE_ID: 'That item already exists',
    RESERVED_NAME: `"${BIN_NAME}" is the name of the bin for ideas not yet sorted`,
    LIMIT_CATEGORIES: `A board holds at most ${LIMITS.categories} categories`,
    LIMIT_CAUSES: `A board holds at most ${LIMITS.causes} causes`,
    LIMIT_DEPTH: `Causes go at most ${LIMITS.depth} levels below a category`,
    LIMIT_TEXT: 'That text is longer than the limit',
    LIMIT_EVIDENCE: `A cause holds at most ${LIMITS.evidencePerCause} evidence lines`,
    LIMIT_MEMBERS: `A board holds at most ${LIMITS.members} people`,
    LAST_CHAMPION: 'A board needs a champion. Name another before stepping down',
    NOT_A_MEMBER: 'That person is not on this board',
    ALREADY_MEMBER: 'That person is already on this board',
    LOCKED_NO_PROPOSAL: 'A locked item cannot take new proposals',
    NO_PROPOSAL: 'There is no proposal waiting on that cause',
    NOT_YOURS: 'Only the person who proposed it, or a champion, can withdraw it'
});

export function emptyBoard({ id = '', title = '', now = 0 } = {}) {
    return {
        schema: SCHEMA,
        id,
        title,
        effect: '',
        effectParts: { what: '', where: '', when: '', extent: '' },
        kind: 'standard',
        preset: 'none',
        settings: { ...DEFAULT_SETTINGS },
        nodes: {},
        order: { [ROOT]: [] },
        members: {},
        boardLocks: { effect: false, categories: false, statuses: true, frozen: false, downloads: 'everyone' },
        voteTotals: {},
        expiresAt: 0,
        history: [],
        historyN: 0,
        seq: 0,
        createdAt: now
    };
}

export function makeNode(id, parentId, kind, text, by = '', now = 0) {
    return {
        id, parentId, kind, text,
        status: '', owner: '', note: '', proposal: null, evidence: [],
        lock: 'none', lockedBy: '', lockedAt: 0, lockNote: '',
        deleted: false, deletedRoot: '', deletedN: 0,
        createdBy: by, createdAt: now, updatedBy: by, updatedAt: now
    };
}

// ---------- Reading the tree ----------

export const live = (board, id) => {
    const node = board.nodes[id];
    return node && !node.deleted ? node : null;
};

/** Live child ids in order. */
export function liveChildren(board, parentId) {
    return (board.order[parentId] || []).filter((id) => live(board, id));
}

/** Ancestor nodes from the parent up, stopping before the root. */
export function ancestors(board, id) {
    const out = [];
    const seen = new Set([id]);
    let node = board.nodes[id];
    while (node && node.parentId !== ROOT && !seen.has(node.parentId)) {
        seen.add(node.parentId);
        node = board.nodes[node.parentId];
        if (node) out.push(node);
    }
    return out;
}

/** 0 for a category or the bin, 1 for a cause on a bone, and so on. */
export const depthOf = (board, id) => (board.nodes[id] ? ancestors(board, id).length : 0);

export function categoryOf(board, id) {
    const chain = [board.nodes[id], ...ancestors(board, id)].filter(Boolean);
    return chain[chain.length - 1] || null;
}

/** Ids in a subtree, the root first. Deleted nodes are skipped unless asked for. */
export function subtreeIds(board, id, withDeleted = false) {
    const out = [];
    const stack = [id];
    const seen = new Set();
    while (stack.length) {
        const at = stack.pop();
        if (seen.has(at)) continue;
        seen.add(at);
        const node = board.nodes[at];
        if (!node || (!withDeleted && node.deleted)) continue;
        out.push(at);
        const kids = board.order[at] || [];
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
    return out;
}

/** Levels below a node: 0 for a leaf. */
export function heightBelow(board, id) {
    let best = 0;
    for (const kid of liveChildren(board, id)) best = Math.max(best, 1 + heightBelow(board, kid));
    return best;
}

export const liveNodes = (board) => Object.values(board.nodes).filter((n) => !n.deleted);
export const countCauses = (board) => liveNodes(board).filter((n) => n.kind === 'cause').length;
export const countCategories = (board) => liveNodes(board).filter((n) => n.kind === 'category').length;

export function roleOf(board, actor) {
    const member = actor && board.members && board.members[actor.memberId];
    if (member) return member.role;
    return actor && ROLES.includes(actor.role) ? actor.role : 'viewer';
}

/** The tree as nested objects, live nodes only, bin last. */
export function treeOf(board) {
    const build = (id) => ({ node: board.nodes[id], children: liveChildren(board, id).map(build) });
    const top = liveChildren(board, ROOT).map(build);
    return { categories: top.filter((t) => t.node.kind === 'category'), bin: top.find((t) => t.node.kind === 'unsorted') || null };
}

// ---------- Applying an op ----------

function cloneBoard(board) {
    return {
        ...board,
        effectParts: { ...board.effectParts },
        settings: { ...board.settings },
        nodes: { ...board.nodes },
        order: { ...board.order },
        members: { ...board.members },
        boardLocks: { ...board.boardLocks },
        voteTotals: { ...board.voteTotals },
        history: board.history.slice()
    };
}

const editNode = (d, id) => (d.nodes[id] = { ...d.nodes[id] });
const editOrder = (d, pid) => (d.order[pid] = (d.order[pid] || []).slice());

function insertAfter(list, id, after) {
    const at = after ? list.indexOf(after) : -1;
    list.splice(at + 1, 0, id);
}

/** The bin is drawn apart from the bones, and stays last at the top level. */
function keepBinLast(d) {
    const top = d.order[ROOT];
    const at = top.indexOf(BIN_ID);
    if (at >= 0 && at !== top.length - 1) {
        editOrder(d, ROOT).splice(at, 1);
        d.order[ROOT].push(BIN_ID);
    }
}

const short = (text) => {
    const t = String(text || '').trim() || '(blank)';
    return `"${t.length > 60 ? `${t.slice(0, 57)}...` : t}"`;
};

const refused = (reason) => ({ refused: reason });

/** A member's edit to this node is blocked by a lock on it or a branch lock above. */
function lockedFor(d, id, ctx) {
    if (ctx.champion) return null;
    const node = d.nodes[id];
    if (node && node.lock !== 'none') return 'LOCKED_BY_CHAMPION';
    if (ancestors(d, id).some((a) => a.lock === 'branch')) return 'LOCKED_BY_CHAMPION';
    return null;
}

/** Adding under this node is blocked only by a branch lock on it or above. */
function branchLockedFor(d, id, ctx) {
    if (ctx.champion || id === ROOT) return null;
    const node = d.nodes[id];
    if (node && node.lock === 'branch') return 'LOCKED_BY_CHAMPION';
    if (ancestors(d, id).some((a) => a.lock === 'branch')) return 'LOCKED_BY_CHAMPION';
    return null;
}

function subtreeLocked(d, id) {
    return subtreeIds(d, id).some((x) => d.nodes[x].lock !== 'none');
}

const cleanText = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() : null);
const cleanOwner = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f,[\]]+/g, ' ').replace(/\s+/g, ' ').trim() : null);

/** Evidence lines cleaned, or null when the value is not usable. */
export function cleanEvidence(value) {
    if (!Array.isArray(value)) return null;
    const out = [];
    const seen = new Set();
    for (const item of value) {
        if (!item || typeof item !== 'object') return null;
        const text = cleanText(item.text);
        if (text === null) return null;
        if (!text) continue;
        if (text.length > LIMITS.evidenceText) return 'LIMIT_TEXT';
        const id = typeof item.id === 'string' && /^[A-Za-z0-9]{1,16}$/.test(item.id) && !seen.has(item.id) ? item.id : `e${out.length + 1}`;
        seen.add(id);
        out.push({ id, text });
    }
    return out.length > LIMITS.evidencePerCause ? 'LIMIT_EVIDENCE' : out;
}

const isReserved = (text) => text.toLowerCase() === BIN_NAME.toLowerCase();

const HANDLERS = {
    addNode(d, op, ctx) {
        if (!isId(op.id)) return refused('BAD_OP');
        if (d.nodes[op.id]) return refused('DUPLICATE_ID');
        const kind = op.kind;
        let text = cleanText(op.text == null ? '' : op.text);
        if (text === null || !['category', 'cause', 'unsorted'].includes(kind)) return refused('BAD_OP');
        if (text.length > LIMITS.causeText) return refused('LIMIT_TEXT');
        let parentId = op.parentId;
        const extra = {};
        if (kind === 'unsorted') {
            if (op.id !== BIN_ID || parentId !== ROOT) return refused('BAD_OP');
            text = BIN_NAME;
        } else if (kind === 'category') {
            if (parentId !== ROOT) return refused('BAD_OP');
            if (op.id === BIN_ID) return refused('BAD_OP');
            if (isReserved(text)) return refused('RESERVED_NAME');
            if (d.boardLocks.categories && !ctx.champion) return refused('CATEGORIES_LOCKED');
            if (countCategories(d) >= LIMITS.categories) return refused('LIMIT_CATEGORIES');
        } else {
            if (op.id === BIN_ID || parentId === ROOT) return refused('BAD_OP');
            if (!live(d, parentId)) {
                // The parent went while this was on its way: keep the cause in the bin.
                const lost = d.nodes[parentId];
                extra.rescued = { from: lost ? lost.text : '' };
                parentId = BIN_ID;
                if (!d.nodes[BIN_ID]) {
                    d.nodes[BIN_ID] = makeNode(BIN_ID, ROOT, 'unsorted', BIN_NAME, ctx.actor.memberId, ctx.now);
                    editOrder(d, ROOT).push(BIN_ID);
                } else if (d.nodes[BIN_ID].deleted) {
                    Object.assign(editNode(d, BIN_ID), { deleted: false, deletedRoot: '', deletedN: 0 });
                }
            }
            const blocked = branchLockedFor(d, parentId, ctx);
            if (blocked) return refused(blocked);
            if (depthOf(d, parentId) + 1 > LIMITS.depth) return refused('LIMIT_DEPTH');
            if (countCauses(d) >= LIMITS.causes) return refused('LIMIT_CAUSES');
        }
        const node = makeNode(op.id, parentId, kind, text, ctx.actor.memberId, ctx.now);
        if (kind === 'cause') {
            if (op.status) {
                if (!STATUSES.includes(op.status)) return refused('BAD_VALUE');
                if (d.boardLocks.statuses && !ctx.champion) extra.statusDropped = true;
                else node.status = op.status;
            }
            if (op.owner) {
                const owner = cleanOwner(op.owner);
                if (owner === null || owner.length > LIMITS.owner) return refused('BAD_VALUE');
                node.owner = owner;
            }
            if (op.evidence) {
                const evidence = cleanEvidence(op.evidence);
                if (evidence === null) return refused('BAD_VALUE');
                if (typeof evidence === 'string') return refused(evidence);
                node.evidence = evidence;
            }
            if (extra.rescued) node.note = `Its parent ${short(extra.rescued.from)} was deleted before this arrived`.slice(0, LIMITS.note);
        }
        d.nodes[op.id] = node;
        if (!d.order[op.id]) d.order[op.id] = [];
        insertAfter(editOrder(d, parentId), op.id, extra.rescued ? null : op.after);
        keepBinLast(d);
        const parent = d.nodes[parentId];
        const summary = kind === 'cause'
            ? `Added ${short(text)} under ${short(parent && parent.text)}`
            : `Added category ${short(text)}`;
        return { summary, inverse: { type: 'deleteNode', nodeId: op.id }, extra };
    },

    setField(d, op, ctx) {
        const node = d.nodes[op.nodeId];
        if (!node) return refused('NODE_MISSING');
        if (node.deleted) return refused('NODE_DELETED');
        const field = op.field;
        const blocked = lockedFor(d, node.id, ctx);
        if (blocked) return refused(blocked);
        let value;
        if (field === 'text') {
            if (node.kind === 'unsorted') return refused('BAD_OP');
            value = cleanText(op.value);
            if (value === null) return refused('BAD_VALUE');
            if (value.length > LIMITS.causeText) return refused('LIMIT_TEXT');
            if (node.kind === 'category') {
                if (isReserved(value)) return refused('RESERVED_NAME');
                if (d.boardLocks.categories && !ctx.champion) return refused('CATEGORIES_LOCKED');
            }
        } else if (field === 'status') {
            if (node.kind !== 'cause' || !STATUSES.includes(op.value)) return refused('BAD_VALUE');
            if (d.boardLocks.statuses && !ctx.champion) return refused('STATUS_LOCKED');
            value = op.value;
        } else if (field === 'owner') {
            if (node.kind !== 'cause') return refused('BAD_VALUE');
            value = cleanOwner(op.value);
            if (value === null || value.length > LIMITS.owner) return refused('BAD_VALUE');
        } else if (field === 'note') {
            value = cleanText(op.value);
            if (value === null) return refused('BAD_VALUE');
            if (value.length > LIMITS.note) return refused('LIMIT_TEXT');
        } else if (field === 'evidence') {
            if (node.kind !== 'cause') return refused('BAD_VALUE');
            value = cleanEvidence(op.value);
            if (value === null) return refused('BAD_VALUE');
            if (typeof value === 'string') return refused(value);
        } else {
            return refused('BAD_OP');
        }
        const old = node[field];
        if (JSON.stringify(old) === JSON.stringify(value)) return { noop: true };
        Object.assign(editNode(d, node.id), { [field]: value, updatedBy: ctx.actor.memberId, updatedAt: ctx.now });
        let summary;
        if (field === 'text') summary = `Changed ${short(old)} to ${short(value)}`;
        else if (field === 'status') summary = `Marked ${short(node.text)} ${STATUS_LABELS[value]}`;
        else if (field === 'owner') summary = value ? `Set the owner of ${short(node.text)} to ${value}` : `Cleared the owner of ${short(node.text)}`;
        else if (field === 'note') summary = `Edited the note on ${short(node.text)}`;
        else summary = `Edited the evidence on ${short(node.text)}`;
        return { summary, inverse: { type: 'setField', nodeId: node.id, field, value: old } };
    },

    move(d, op, ctx) {
        const node = live(d, op.nodeId);
        if (!node) return refused(d.nodes[op.nodeId] ? 'NODE_DELETED' : 'NODE_MISSING');
        const target = op.parentId;
        if (node.kind === 'unsorted') return refused('BAD_OP');
        if (node.kind === 'category') {
            if (target !== ROOT) return refused('BAD_OP');
            if (d.boardLocks.categories && !ctx.champion) return refused('CATEGORIES_LOCKED');
        } else {
            if (target === ROOT) return refused('BAD_OP');
            if (!live(d, target)) return refused(d.nodes[target] ? 'PARENT_DELETED' : 'NODE_MISSING');
            if (subtreeIds(d, node.id).includes(target)) return refused('CYCLE');
            if (depthOf(d, target) + 1 + heightBelow(d, node.id) > LIMITS.depth) return refused('LIMIT_DEPTH');
        }
        if (!ctx.champion) {
            const blocked = lockedFor(d, node.id, ctx);
            if (blocked) return refused(blocked);
            if (subtreeLocked(d, node.id)) return refused('LOCK_BELOW');
            const into = branchLockedFor(d, target, ctx);
            if (into) return refused(into);
        }
        const from = node.parentId;
        const oldList = d.order[from] || [];
        const at = oldList.indexOf(node.id);
        const oldAfter = at > 0 ? oldList[at - 1] : null;
        const after = op.after === node.id ? oldAfter : op.after;
        editOrder(d, from).splice(at, 1);
        insertAfter(editOrder(d, target), node.id, after);
        keepBinLast(d);
        Object.assign(editNode(d, node.id), { parentId: target, updatedBy: ctx.actor.memberId, updatedAt: ctx.now });
        const summary = from === target ? `Reordered ${short(node.text)}` : `Moved ${short(node.text)} under ${short(d.nodes[target].text)}`;
        return { summary, inverse: { type: 'move', nodeId: node.id, parentId: from, after: oldAfter } };
    },

    deleteNode(d, op, ctx) {
        const node = live(d, op.nodeId);
        if (!node) return refused(d.nodes[op.nodeId] ? 'NODE_DELETED' : 'NODE_MISSING');
        if (!ctx.champion) {
            if (node.kind === 'category' && d.boardLocks.categories) return refused('CATEGORIES_LOCKED');
            const blocked = lockedFor(d, node.id, ctx);
            if (blocked) return refused(blocked);
            if (subtreeLocked(d, node.id)) return refused('LOCK_BELOW');
        }
        const ids = subtreeIds(d, node.id);
        const n = d.historyN + 1;
        for (const id of ids) Object.assign(editNode(d, id), { deleted: true, deletedRoot: node.id, deletedN: n });
        const below = ids.length - 1;
        const summary = `Deleted ${short(node.text)}${below ? ` and ${below} below it` : ''}`;
        return { summary, inverse: { type: 'restoreNode', nodeId: node.id } };
    },

    restoreNode(d, op, ctx) {
        const node = d.nodes[op.nodeId];
        if (!node) return refused('NODE_MISSING');
        if (!node.deleted || node.deletedRoot !== node.id) return refused('BAD_OP');
        if (node.parentId !== ROOT && !live(d, node.parentId)) return refused('PARENT_DELETED');
        const ids = subtreeIds(d, node.id, true).filter((id) => d.nodes[id].deleted && d.nodes[id].deletedRoot === node.id);
        const causes = ids.filter((id) => d.nodes[id].kind === 'cause').length;
        if (countCauses(d) + causes > LIMITS.causes) return refused('LIMIT_CAUSES');
        if (node.kind === 'category') {
            if (countCategories(d) >= LIMITS.categories) return refused('LIMIT_CATEGORIES');
            if (d.boardLocks.categories && !ctx.champion) return refused('CATEGORIES_LOCKED');
        }
        const blocked = branchLockedFor(d, node.parentId, ctx);
        if (blocked) return refused(blocked);
        for (const id of ids) Object.assign(editNode(d, id), { deleted: false, deletedRoot: '', deletedN: 0 });
        return { summary: `Restored ${short(node.text)}`, inverse: { type: 'deleteNode', nodeId: node.id } };
    },

    setBoard(d, op, ctx) {
        const field = op.field;
        let value;
        if (field === 'title') {
            value = cleanText(op.value);
            if (value === null) return refused('BAD_VALUE');
            if (value.length > LIMITS.title) return refused('LIMIT_TEXT');
        } else if (field === 'effect') {
            if (d.boardLocks.effect && !ctx.champion) return refused('EFFECT_LOCKED');
            value = cleanText(op.value);
            if (value === null) return refused('BAD_VALUE');
            if (value.length > LIMITS.effect) return refused('LIMIT_TEXT');
        } else if (field === 'effectParts') {
            if (d.boardLocks.effect && !ctx.champion) return refused('EFFECT_LOCKED');
            if (!op.value || typeof op.value !== 'object') return refused('BAD_VALUE');
            value = {};
            for (const key of ['what', 'where', 'when', 'extent']) {
                const part = cleanText(op.value[key] == null ? '' : op.value[key]);
                if (part === null) return refused('BAD_VALUE');
                if (part.length > LIMITS.effectPart) return refused('LIMIT_TEXT');
                value[key] = part;
            }
        } else if (field === 'kind' || field === 'preset') {
            if (d.boardLocks.categories && !ctx.champion) return refused('CATEGORIES_LOCKED');
            value = op.value;
            if (field === 'kind' ? !KINDS.includes(value) : (typeof value !== 'string' || !/^[a-z0-9-]{1,40}$/.test(value))) return refused('BAD_VALUE');
        } else if (field === 'settings') {
            if (!ctx.champion) return refused('CHAMPION_ONLY');
            if (!op.value || typeof op.value !== 'object') return refused('BAD_VALUE');
            value = { ...d.settings };
            for (const [key, v] of Object.entries(op.value)) {
                if (key === 'showEmpty') {
                    if (typeof v !== 'boolean') return refused('BAD_VALUE');
                } else if (SETTING_RANGES[key]) {
                    const [lo, hi] = SETTING_RANGES[key];
                    if (!Number.isInteger(v) || v < lo || v > hi) return refused('BAD_VALUE');
                } else {
                    return refused('BAD_VALUE');
                }
                value[key] = v;
            }
        } else {
            return refused('BAD_OP');
        }
        const old = d[field];
        if (JSON.stringify(old) === JSON.stringify(value)) return { noop: true };
        d[field] = value;
        const names = { title: 'the title', effect: 'the problem statement', effectParts: 'the problem statement helper', kind: 'the kind of fishbone', preset: 'the template', settings: 'the board settings' };
        return { summary: `Changed ${names[field]}`, inverse: { type: 'setBoard', field, value: old } };
    },

    lock(d, op, ctx) {
        if (!ctx.champion) return refused('CHAMPION_ONLY');
        const node = live(d, op.nodeId);
        if (!node) return refused(d.nodes[op.nodeId] ? 'NODE_DELETED' : 'NODE_MISSING');
        if (!['item', 'branch'].includes(op.mode)) return refused('BAD_VALUE');
        const note = cleanText(op.note == null ? '' : op.note);
        if (note === null) return refused('BAD_VALUE');
        if (note.length > LIMITS.note) return refused('LIMIT_TEXT');
        const before = { mode: node.lock, note: node.lockNote };
        Object.assign(editNode(d, node.id), { lock: op.mode, lockedBy: ctx.actor.memberId, lockedAt: ctx.now, lockNote: note });
        const inverse = before.mode === 'none'
            ? { type: 'unlock', nodeId: node.id }
            : { type: 'lock', nodeId: node.id, mode: before.mode, note: before.note };
        return { summary: `Locked ${short(node.text)}${op.mode === 'branch' ? ' and everything under it' : ''}`, inverse };
    },

    unlock(d, op, ctx) {
        if (!ctx.champion) return refused('CHAMPION_ONLY');
        const node = live(d, op.nodeId);
        if (!node) return refused(d.nodes[op.nodeId] ? 'NODE_DELETED' : 'NODE_MISSING');
        if (node.lock === 'none') return { noop: true };
        const inverse = { type: 'lock', nodeId: node.id, mode: node.lock, note: node.lockNote };
        Object.assign(editNode(d, node.id), { lock: 'none', lockedBy: '', lockedAt: 0, lockNote: '' });
        return { summary: `Unlocked ${short(node.text)}`, inverse };
    },

    setBoardLock(d, op, ctx) {
        if (!ctx.champion) return refused('CHAMPION_ONLY');
        if (!BOARD_LOCKS.includes(op.lock)) return refused('BAD_OP');
        const ok = op.lock === 'downloads' ? ['everyone', 'champions'].includes(op.value) : typeof op.value === 'boolean';
        if (!ok) return refused('BAD_VALUE');
        const old = d.boardLocks[op.lock];
        if (old === op.value) return { noop: true };
        d.boardLocks[op.lock] = op.value;
        const words = {
            effect: ['Locked the problem statement', 'Unlocked the problem statement'],
            categories: ['Locked the categories', 'Unlocked the categories'],
            statuses: ['Statuses now need a champion', 'Anyone can now set statuses'],
            frozen: ['Froze the board', 'Unfroze the board']
        };
        const summary = op.lock === 'downloads'
            ? (op.value === 'champions' ? 'Limited downloads to champions' : 'Allowed downloads for everyone')
            : words[op.lock][op.value ? 0 : 1];
        return { summary, inverse: { type: 'setBoardLock', lock: op.lock, value: old } };
    },

    setRole(d, op, ctx) {
        if (!ctx.champion) return refused('CHAMPION_ONLY');
        const member = d.members[op.memberId];
        if (!member) return refused('NOT_A_MEMBER');
        if (!ROLES.includes(op.role)) return refused('BAD_VALUE');
        if (member.role === op.role) return { noop: true };
        if (member.role === 'champion' && championCount(d) === 1) return refused('LAST_CHAMPION');
        d.members[op.memberId] = { ...member, role: op.role };
        return { summary: `Made ${member.name} a ${op.role}`, inverse: { type: 'setRole', memberId: op.memberId, role: member.role } };
    },

    addMember(d, op, ctx) {
        if (!ctx.champion) return refused('CHAMPION_ONLY');
        if (typeof op.memberId !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(op.memberId)) return refused('BAD_VALUE');
        if (d.members[op.memberId]) return refused('ALREADY_MEMBER');
        const name = cleanText(op.name);
        if (!name || name.length > LIMITS.memberName || !ROLES.includes(op.role)) return refused('BAD_VALUE');
        if (Object.keys(d.members).length >= LIMITS.members) return refused('LIMIT_MEMBERS');
        d.members[op.memberId] = { name, role: op.role };
        return { summary: `Added ${name} as a ${op.role}`, inverse: { type: 'removeMember', memberId: op.memberId } };
    },

    removeMember(d, op, ctx) {
        if (!ctx.champion) return refused('CHAMPION_ONLY');
        const member = d.members[op.memberId];
        if (!member) return refused('NOT_A_MEMBER');
        if (member.role === 'champion' && championCount(d) === 1) return refused('LAST_CHAMPION');
        delete d.members[op.memberId];
        const cleared = [];
        for (const node of liveNodes(d)) {
            const owned = node.owner === op.memberId;
            const proposed = node.proposal && node.proposal.by === op.memberId;
            if (!owned && !proposed) continue;
            const edit = editNode(d, node.id);
            if (owned) { edit.owner = ''; cleared.push(node.id); }
            if (proposed) edit.proposal = null;
        }
        return { summary: `Removed ${member.name} from the board`, inverse: null, extra: { clearedOwners: cleared } };
    },

    propose(d, op, ctx) {
        const node = live(d, op.nodeId);
        if (!node) return refused(d.nodes[op.nodeId] ? 'NODE_DELETED' : 'NODE_MISSING');
        if (node.kind !== 'cause') return refused('BAD_VALUE');
        const before = node.proposal;
        if (op.status === null) {
            if (!before) return { noop: true };
            if (!ctx.champion && before.by !== ctx.actor.memberId) return refused('NOT_YOURS');
            editNode(d, node.id).proposal = null;
            return {
                summary: `Withdrew the proposal on ${short(node.text)}`,
                inverse: { type: 'propose', nodeId: node.id, status: before.status, evidenceNote: before.evidenceNote }
            };
        }
        if (!STATUSES.includes(op.status)) return refused('BAD_VALUE');
        if (node.lock !== 'none' || ancestors(d, node.id).some((a) => a.lock === 'branch')) return refused('LOCKED_NO_PROPOSAL');
        const note = cleanText(op.evidenceNote == null ? '' : op.evidenceNote);
        if (note === null) return refused('BAD_VALUE');
        if (note.length > LIMITS.note) return refused('LIMIT_TEXT');
        editNode(d, node.id).proposal = { status: op.status, by: ctx.actor.memberId, at: ctx.now, evidenceNote: note };
        const inverse = before
            ? { type: 'propose', nodeId: node.id, status: before.status, evidenceNote: before.evidenceNote }
            : { type: 'propose', nodeId: node.id, status: null };
        return { summary: `Proposed ${short(node.text)} as ${STATUS_LABELS[op.status]}`, inverse };
    },

    decideProposal(d, op, ctx) {
        if (!ctx.champion) return refused('CHAMPION_ONLY');
        const node = live(d, op.nodeId);
        if (!node) return refused(d.nodes[op.nodeId] ? 'NODE_DELETED' : 'NODE_MISSING');
        if (!node.proposal) return refused('NO_PROPOSAL');
        const proposal = node.proposal;
        const edit = editNode(d, node.id);
        edit.proposal = null;
        if (op.accept === true) {
            edit.status = proposal.status;
            if (proposal.evidenceNote && edit.evidence.length < LIMITS.evidencePerCause) {
                const used = new Set(edit.evidence.map((e) => e.id));
                let n = edit.evidence.length + 1;
                while (used.has(`e${n}`)) n++;
                edit.evidence = [...edit.evidence, { id: `e${n}`, text: proposal.evidenceNote.slice(0, LIMITS.evidenceText) }];
            }
            edit.updatedBy = ctx.actor.memberId;
            edit.updatedAt = ctx.now;
        }
        const verb = op.accept === true ? 'Accepted' : 'Declined';
        return { summary: `${verb} the proposal to mark ${short(node.text)} ${STATUS_LABELS[proposal.status]}`, inverse: null };
    },

    extendRetention(d, op, ctx) {
        if (!ctx.champion) return refused('CHAMPION_ONLY');
        if (!Number.isFinite(op.expiresAt) || op.expiresAt <= 0) return refused('BAD_VALUE');
        const old = d.expiresAt;
        d.expiresAt = op.expiresAt;
        return { summary: 'Extended how long the board is kept', inverse: { type: 'extendRetention', expiresAt: old } };
    }
};

export const OP_TYPES = Object.freeze(Object.keys(HANDLERS));

function championCount(d) {
    return Object.values(d.members).filter((m) => m.role === 'champion').length;
}

function pushHistory(d, ctx, summary) {
    d.historyN += 1;
    d.history.push({ n: d.historyN, seq: d.seq, at: ctx.now, by: ctx.actor.memberId, summary });
    if (d.history.length <= LIMITS.history) return;
    d.history.splice(0, d.history.length - LIMITS.history);
    // A tombstone lives until the history entry that deleted it is trimmed.
    const oldest = d.history[0].n;
    for (const node of Object.values(d.nodes)) {
        if (!node.deleted || node.deletedN >= oldest) continue;
        delete d.nodes[node.id];
        if (d.order[node.parentId]) editOrder(d, node.parentId).splice(d.order[node.parentId].indexOf(node.id), 1);
        delete d.order[node.id];
    }
}

/**
 * Apply one op. Returns { board, result }. The board passed in is never
 * changed. result is { ok: true, summary, inverse, ... } or
 * { ok: false, reason, message }, and a refused op leaves the board as it was.
 */
export function applyOp(board, op, actor = SOLO_ACTOR, now = 0) {
    const refuse = (reason) => ({ board, result: { ok: false, reason, message: REASONS[reason] || reason } });
    if (!op || typeof op !== 'object' || !Object.prototype.hasOwnProperty.call(HANDLERS, op.type)) return refuse('BAD_OP');
    const role = roleOf(board, actor);
    if (role === 'viewer') return refuse('VIEWER_READ_ONLY');
    const ctx = { actor, role, now, champion: role === 'champion' };
    if (board.boardLocks.frozen && !ctx.champion) return refuse('FROZEN');
    const draft = cloneBoard(board);
    const out = HANDLERS[op.type](draft, op, ctx);
    if (out.refused) return refuse(out.refused);
    if (out.noop) return { board, result: { ok: true, noop: true, summary: '', inverse: null } };
    pushHistory(draft, ctx, out.summary);
    return { board: draft, result: { ok: true, summary: out.summary, inverse: out.inverse, ...(out.extra || {}) } };
}
