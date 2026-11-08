// The panels around the diagram: the selected item's details, Check these,
// the cause table and the history. Text is only ever set with textContent.

import { LIMITS } from './fishbone-limits.js';
import { BIN_NAME, STATUS_LABELS, SOLO_ACTOR, live, liveChildren } from './fishbone-ops.js';
import { causeRows } from './fishbone-csv.js';

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k in node && typeof v !== 'string') node[k] = v;
        else node.setAttribute(k, v === true ? '' : v);
    }
    for (const child of children) if (child !== null && child !== undefined) node.append(child);
    return node;
}

/** A member id as a name: "You" in solo, the board's name for a member, or the id. */
export function whoName(board, id) {
    if (!id) return 'Someone';
    if (id === SOLO_ACTOR.memberId) return 'You';
    if (id === 'site-owner') return 'Site owner';
    const member = board.members && board.members[id];
    return member ? member.name : id;
}

const when = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '');

/**
 * The panel under the outline for the selected item. actions: { apply(op),
 * outliner, confirm(text) -> Promise<boolean>, readOnly }.
 */
export function renderItemPanel(panel, board, id, actions) {
    const node = id ? live(board, id) : null;
    if (!node) { panel.hidden = true; panel.replaceChildren(); return; }
    panel.hidden = false;
    const ro = actions.readOnly;
    const kindName = node.kind === 'cause' ? 'Cause' : node.kind === 'category' ? 'Category' : BIN_NAME;
    const parts = [el('h3', { text: node.kind === 'unsorted' ? `${BIN_NAME}: ideas not yet sorted onto a bone` : `${kindName}: ${node.text || '(blank)'}` })];
    const apply = (op) => actions.apply(op, { focusPanel: true });

    if (node.kind === 'cause') {
        const status = el('select', { id: 'panelStatus', disabled: ro });
        for (const [value, label] of Object.entries(STATUS_LABELS)) status.append(new Option(label, value, false, node.status === value));
        status.addEventListener('change', () => apply({ type: 'setField', nodeId: id, field: 'status', value: status.value }));
        parts.push(el('label', { class: 'fb-label', for: 'panelStatus', text: 'Status' }), status);

        const owner = el('input', { type: 'text', id: 'panelOwner', value: node.owner, maxLength: LIMITS.owner, readOnly: ro, placeholder: 'A role, such as Maintenance lead' });
        owner.addEventListener('change', () => apply({ type: 'setField', nodeId: id, field: 'owner', value: owner.value }));
        parts.push(el('label', { class: 'fb-label', for: 'panelOwner', text: 'Owner' }), owner);

        const evidence = el('textarea', { id: 'panelEvidence', rows: 3, readOnly: ro, placeholder: 'One line each: what was checked, when, and the result' });
        evidence.value = node.evidence.map((e) => e.text).join('\n');
        evidence.addEventListener('change', () => {
            const texts = evidence.value.split('\n').map((t) => t.trim()).filter(Boolean);
            const used = new Set();
            const list = texts.map((text, i) => {
                const same = node.evidence.find((e) => e.text === text && !used.has(e.id));
                const eid = same ? same.id : `e${Date.now().toString(36).slice(-6)}${i}`;
                used.add(eid);
                return { id: eid.slice(0, 16), text };
            });
            apply({ type: 'setField', nodeId: id, field: 'evidence', value: list });
        });
        parts.push(el('label', { class: 'fb-label', for: 'panelEvidence', text: `Evidence (up to ${LIMITS.evidencePerCause} lines)` }), evidence);
        if (node.note) parts.push(el('p', { class: 'fb-hint', text: `Note: ${node.note}` }));
        if (node.proposal) {
            const p = node.proposal;
            parts.push(el('p', { class: 'fb-hint', text: `${whoName(board, p.by)} proposes: ${STATUS_LABELS[p.status]}${p.evidenceNote ? `. ${p.evidenceNote}` : ''}` }));
            if (!ro) {
                parts.push(el('div', { class: 'fb-row' },
                    button('Accept', () => apply({ type: 'decideProposal', nodeId: id, accept: true })),
                    button('Decline', () => apply({ type: 'decideProposal', nodeId: id, accept: false }))));
            }
        }
    }

    if (!ro && node.kind !== 'unsorted') {
        const lockLine = node.lock === 'none'
            ? 'Not locked.'
            : `${node.lock === 'branch' ? 'Branch locked' : 'Locked'} by ${whoName(board, node.lockedBy)}${node.lockedAt ? ` on ${when(node.lockedAt)}` : ''}${node.lockNote ? `: ${node.lockNote}` : ''}.`;
        const note = el('input', { type: 'text', id: 'panelLockNote', maxLength: LIMITS.note, placeholder: 'Optional note, such as "Verified by flow test"' });
        parts.push(el('label', { class: 'fb-label', for: 'panelLockNote', text: 'Lock' }), el('p', { class: 'fb-hint', text: `${lockLine} In solo mode a lock is a label: it travels in the project file and anyone can remove it.` }));
        if (node.lock === 'none') {
            parts.push(note, el('div', { class: 'fb-row' },
                button('Lock item', () => apply({ type: 'lock', nodeId: id, mode: 'item', note: note.value })),
                button('Lock branch', () => apply({ type: 'lock', nodeId: id, mode: 'branch', note: note.value }))));
        } else {
            parts.push(el('div', { class: 'fb-row' }, button('Unlock', async () => {
                if (node.lockedBy && node.lockedBy !== SOLO_ACTOR.memberId) {
                    const ok = await actions.confirm(`This lock was set by ${whoName(board, node.lockedBy)}. Remove it anyway?`);
                    if (!ok) return;
                }
                apply({ type: 'unlock', nodeId: id });
            })));
        }
    }

    if (!ro) {
        const o = actions.outliner;
        const row = el('div', { class: 'fb-row', role: 'group', 'aria-label': 'Change this item' });
        if (node.kind === 'cause') {
            row.append(button('Add a why', () => o.addChild(id)), button('Add below', () => o.addAfter(id)),
                button('Indent', () => o.indent(id)), button('Outdent', () => o.outdent(id)),
                button('Move up', () => o.shift(id, -1)), button('Move down', () => o.shift(id, 1)), button('Delete', () => o.remove(id)));
        } else if (node.kind === 'category') {
            row.append(button('Add a cause', () => o.addChild(id)), button('Add category below', () => o.addAfter(id)),
                button('Move up', () => o.shift(id, -1)), button('Move down', () => o.shift(id, 1)), button('Delete', () => o.remove(id)));
        } else {
            row.append(button('Add an idea', () => o.addChild(id)));
            if (!liveChildren(board, id).length) row.append(button('Delete', () => o.remove(id)));
        }
        parts.push(row);
    }
    panel.replaceChildren(...parts);
}

function button(text, onClick) {
    const b = el('button', { type: 'button', class: 'fb-btn small', text });
    b.addEventListener('click', onClick);
    return b;
}

/** Check these. Each note has a Show button that selects its item. */
export function renderChecks(list, checks, onPick) {
    if (!checks.length) {
        list.replaceChildren(el('li', { text: 'Nothing to flag. That says only that the wording and structure pass these checks, not that the causes are right.' }));
        return;
    }
    list.replaceChildren(...checks.map((c) => {
        const li = el('li', { 'data-code': c.code, text: c.message });
        if (c.nodeId) li.append(button('Show', () => onPick(c.nodeId)));
        return li;
    }));
}

const COLUMNS = [
    { key: 'category', label: 'Category' },
    { key: 'path', label: 'Path of whys' },
    { key: 'status', label: 'Status' },
    { key: 'owner', label: 'Owner' },
    { key: 'evidence', label: 'Evidence' },
    { key: 'votes', label: 'Votes' }
];

/** The cause table, the accessible equivalent of the diagram. sort is { key, dir }. */
export function renderTable(table, board, sort, onSort, onPick) {
    const rows = causeRows(board);
    const withVotes = rows.some((r) => r.votes);
    const cols = COLUMNS.filter((c) => c.key !== 'votes' || withVotes);
    if (sort && sort.key) {
        const dir = sort.dir === 'desc' ? -1 : 1;
        const value = (r) => (sort.key === 'evidence' ? r.evidence.length : r[sort.key]);
        rows.sort((a, b) => {
            const x = value(a);
            const y = value(b);
            return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
        });
    }
    const head = el('tr');
    for (const c of cols) {
        const th = el('th', { scope: 'col' });
        th.setAttribute('aria-sort', sort && sort.key === c.key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none');
        const b = el('button', { type: 'button', text: c.label });
        b.addEventListener('click', () => onSort(c.key));
        th.append(b);
        head.append(th);
    }
    const body = el('tbody');
    if (!rows.length) body.append(el('tr', {}, el('td', { colSpan: cols.length, text: 'No causes yet.' })));
    for (const r of rows) {
        const tr = el('tr', { 'data-node-id': r.nodeId });
        for (const c of cols) {
            const td = el('td');
            if (c.key === 'path') {
                const b = el('button', { type: 'button', class: 'fb-btn small', text: r.path || '(blank)' });
                b.setAttribute('aria-label', `Show ${r.cause || 'blank cause'} on the diagram`);
                b.addEventListener('click', () => onPick(r.nodeId));
                td.append(b);
                if (r.status === STATUS_LABELS.ruledOut) td.classList.add('ruled');
            } else if (c.key === 'status') {
                const bits = [r.status];
                if (r.proposal) bits.push(`proposed ${r.proposal}`);
                if (r.lock !== 'none') bits.push(`${r.lock === 'branch' ? 'branch locked' : 'locked'}${r.lockNote ? `: ${r.lockNote}` : ''}`);
                td.textContent = bits.join('; ');
            } else if (c.key === 'evidence') {
                if (r.evidence.length) td.append(el('ul', {}, ...r.evidence.map((e) => el('li', { text: e }))));
            } else {
                td.textContent = String(r[c.key]);
            }
            tr.append(td);
        }
        body.append(tr);
    }
    table.replaceChildren(el('thead', {}, head), body);
}

export function renderHistory(list, board) {
    const items = board.history.slice().reverse().map((h) => el('li', {},
        el('time', { text: when(h.at) }),
        `${whoName(board, h.by)}: ${h.summary}`));
    if (!items.length) items.push(el('li', { text: 'No changes yet.' }));
    list.replaceChildren(...items);
}
