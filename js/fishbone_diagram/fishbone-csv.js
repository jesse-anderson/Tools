// CSV export of the cause table. Pure. A cell that a spreadsheet would run
// as a formula is prefixed with an apostrophe.

import { ROOT, BIN_NAME, STATUS_LABELS, liveChildren } from './fishbone-ops.js';

export const CSV_COLUMNS = Object.freeze(['Category', 'Level', 'Cause', 'Path', 'Status', 'Owner', 'Evidence', 'Votes']);

/** One CSV cell: formula characters neutralized, then quoted when needed. */
export function csvCell(value) {
    let text = String(value == null ? '' : value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The rows of the cause table, in outline order. */
export function causeRows(board) {
    const rows = [];
    const walk = (id, category, path) => {
        for (const kid of liveChildren(board, id)) {
            const node = board.nodes[kid];
            const chain = [...path, node.text];
            rows.push({
                nodeId: kid,
                category,
                level: chain.length,
                cause: node.text,
                path: chain.join(' > '),
                status: STATUS_LABELS[node.status],
                proposal: node.proposal ? STATUS_LABELS[node.proposal.status] : '',
                owner: node.owner,
                evidence: node.evidence.map((e) => e.text),
                votes: board.voteTotals[kid] || 0,
                lock: node.lock,
                lockNote: node.lockNote
            });
            walk(kid, category, chain);
        }
    };
    for (const id of liveChildren(board, ROOT)) {
        const node = board.nodes[id];
        walk(id, node.kind === 'unsorted' ? BIN_NAME : node.text, []);
    }
    return rows;
}

export function toCsv(board) {
    const lines = [CSV_COLUMNS.map(csvCell).join(',')];
    for (const r of causeRows(board)) {
        lines.push([r.category, r.level, r.cause, r.path, r.status, r.owner, r.evidence.join('\n'), r.votes].map(csvCell).join(','));
    }
    return `${lines.join('\r\n')}\r\n`;
}
