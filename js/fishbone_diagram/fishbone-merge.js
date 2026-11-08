// Merge a project file into the open project. Pure.
//
// Nodes are matched by id. Where both copies hold a node and a field
// differs, the user picks a side per row; nodes only in the file are added.
// Two files with no ids in common are probably different projects.

import { ROOT, BIN_ID, STATUS_LABELS, live } from './fishbone-ops.js';
import { cleanBoard } from './fishbone-schema.js';

const FIELDS = Object.freeze([
    ['text', 'Text'], ['status', 'Status'], ['owner', 'Owner'], ['note', 'Note'],
    ['evidence', 'Evidence'], ['lock', 'Lock'], ['deleted', 'Deleted'], ['parentId', 'Place']
]);
const BOARD_FIELDS = Object.freeze([['effect', 'Problem statement'], ['title', 'Title'], ['kind', 'Kind'], ['preset', 'Template']]);

function show(board, field, node) {
    if (field === 'status') return STATUS_LABELS[node.status];
    if (field === 'evidence') return node.evidence.map((e) => e.text).join('\n') || '(none)';
    if (field === 'lock') return node.lock === 'none' ? 'not locked' : `${node.lock} lock${node.lockNote ? `: ${node.lockNote}` : ''}`;
    if (field === 'deleted') return node.deleted ? 'deleted' : 'present';
    if (field === 'parentId') {
        const parent = board.nodes[node.parentId];
        return node.parentId === ROOT ? 'top level' : `under "${parent ? parent.text : '?'}"`;
    }
    return node[field] || '(blank)';
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fieldValue = (node, field) => (field === 'evidence' ? node.evidence.map((e) => e.text) : field === 'lock' ? [node.lock, node.lockNote] : node[field]);

/**
 * Compare the open board with a file's. Returns { unrelated, rows, added, removedLocks }.
 * Each row is { key, nodeId, field, label, item, mine, theirs }.
 */
export function compareBoards(mine, theirs) {
    const shared = Object.keys(theirs.nodes).filter((id) => id !== BIN_ID && mine.nodes[id]);
    const rows = [];
    for (const [field, label] of BOARD_FIELDS) {
        if (!same(mine[field], theirs[field])) {
            rows.push({ key: `board:${field}`, nodeId: null, field, label, item: 'Board', mine: String(mine[field] || '(blank)'), theirs: String(theirs[field] || '(blank)') });
        }
    }
    if (!shared.length) return { unrelated: true, rows, added: [], removedLocks: [] };
    const removedLocks = [];
    for (const id of shared) {
        const a = mine.nodes[id];
        const b = theirs.nodes[id];
        if (a.deleted && b.deleted) continue;
        for (const [field, label] of FIELDS) {
            if (same(fieldValue(a, field), fieldValue(b, field))) continue;
            rows.push({ key: `${id}:${field}`, nodeId: id, field, label, item: a.text || b.text || '(blank)', mine: show(mine, field, a), theirs: show(theirs, field, b) });
        }
        if (a.lock !== 'none' && b.lock === 'none') removedLocks.push({ nodeId: id, text: a.text, by: a.lockedBy });
    }
    const added = Object.values(theirs.nodes).filter((n) => !n.deleted && !mine.nodes[n.id] && n.id !== BIN_ID).map((n) => n.id);
    return { unrelated: false, rows, added, removedLocks };
}

/**
 * Apply a merge. choices maps a row key to 'mine' or 'theirs'; a row with no
 * choice keeps mine. Added nodes keep their place in the file's order where
 * they can. The result goes through cleanBoard, so a choice that would break
 * the tree is repaired rather than trusted.
 */
export function applyMerge(mine, theirs, choices = {}, { now = 0, by = 'you' } = {}) {
    const out = JSON.parse(JSON.stringify(mine));
    const compare = compareBoards(mine, theirs);
    let taken = 0;
    for (const row of compare.rows) {
        if (choices[row.key] !== 'theirs') continue;
        taken += 1;
        if (!row.nodeId) { out[row.field] = theirs[row.field]; continue; }
        const node = out.nodes[row.nodeId];
        const src = theirs.nodes[row.nodeId];
        if (row.field === 'lock') Object.assign(node, { lock: src.lock, lockedBy: src.lockedBy, lockedAt: src.lockedAt, lockNote: src.lockNote });
        else if (row.field === 'deleted') Object.assign(node, { deleted: src.deleted, deletedRoot: src.deletedRoot || node.id, deletedN: src.deletedN });
        else if (row.field === 'parentId') {
            const list = out.order[node.parentId] || [];
            if (list.includes(node.id)) list.splice(list.indexOf(node.id), 1);
            node.parentId = src.parentId;
            out.order[src.parentId] = out.order[src.parentId] || [];
            out.order[src.parentId].push(node.id);
        } else node[row.field] = JSON.parse(JSON.stringify(src[row.field]));
    }
    // Added nodes, parents first so each finds its parent.
    const added = new Set(compare.added);
    const addOne = (id) => {
        if (!added.has(id)) return;
        added.delete(id);
        const src = theirs.nodes[id];
        if (src.parentId !== ROOT && added.has(src.parentId)) addOne(src.parentId);
        const node = JSON.parse(JSON.stringify(src));
        if (node.parentId !== ROOT && !live(out, node.parentId)) node.parentId = BIN_ID;
        if (node.parentId === BIN_ID && !out.nodes[BIN_ID]) {
            out.nodes[BIN_ID] = JSON.parse(JSON.stringify(theirs.nodes[BIN_ID] || { id: BIN_ID, parentId: ROOT, kind: 'unsorted', text: 'Unsorted', evidence: [], lock: 'none' }));
            out.nodes[BIN_ID].deleted = false;
            out.order[ROOT].push(BIN_ID);
        }
        out.nodes[id] = node;
        out.order[id] = [];
        const list = out.order[node.parentId] = out.order[node.parentId] || [];
        const theirList = theirs.order[src.parentId] || [];
        const before = theirList.slice(0, theirList.indexOf(id)).reverse().find((x) => list.includes(x));
        list.splice(before ? list.indexOf(before) + 1 : list.length, 0, id);
    };
    for (const id of compare.added) addOne(id);
    const n = out.historyN + 1;
    out.historyN = n;
    out.history.push({ n, seq: out.seq, at: now, by, summary: `Merged a file: ${taken} change${taken === 1 ? '' : 's'} taken from it, ${compare.added.length} item${compare.added.length === 1 ? '' : 's'} added` });
    const cleaned = cleanBoard(out);
    return cleaned.board || mine;
}
