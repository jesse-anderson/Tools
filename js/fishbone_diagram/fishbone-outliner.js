// The outline editor. Every change goes through the controller's apply(),
// which runs applyOp, so the outline can never do what the model refuses.
// Keys avoid the browser's own: Alt+arrows and Ctrl+1 to 9 are left alone,
// and Escape always leaves the outline so Tab cannot trap a keyboard user.

import { LIMITS } from './fishbone-limits.js';
import { ROOT, BIN_ID, BIN_NAME, STATUS_LABELS, live, liveChildren, depthOf } from './fishbone-ops.js';

export const COMMIT_MS = 600;

/** Live nodes in outline order: each category with its causes, then the bin. */
export function outlineOrder(board) {
    const out = [];
    const walk = (id) => {
        out.push(id);
        for (const kid of liveChildren(board, id)) walk(kid);
    };
    for (const id of liveChildren(board, ROOT)) walk(id);
    return out;
}

const STATUS_KEYS = { Digit1: 'suspected', Digit2: 'verified', Digit3: 'ruledOut', Digit0: '' };

/**
 * The outline. opts: { host, getBoard, apply(op) -> result, newId, select(id),
 * selected(), leave(), message(text), readOnly() }.
 */
export function createOutliner(opts) {
    const { host } = opts;
    const timers = new Map();
    let rendering = false;

    const inputFor = (id) => host.querySelector(`.ol-row[data-id="${id}"] input[type="text"]`);
    const rowFor = (id) => host.querySelector(`.ol-row[data-id="${id}"]`);

    function focusNode(id, caret = 'end') {
        const input = inputFor(id);
        const row = rowFor(id);
        const target = input || (row && row.querySelector('.ol-bin-name'));
        if (!target) return;
        target.focus();
        if (input) {
            const at = caret === 'start' ? 0 : input.value.length;
            try { input.setSelectionRange(at, at); } catch (e) { /* not a text input */ }
        }
    }

    function commit(id) {
        clearTimeout(timers.get(id));
        timers.delete(id);
        const input = inputFor(id);
        const board = opts.getBoard();
        const node = live(board, id);
        if (!input || !node || input.value.trim() === node.text) return true;
        const result = opts.apply({ type: 'setField', nodeId: id, field: 'text', value: input.value }, { textOnly: true });
        return result.ok;
    }

    /** True while the focused line holds typing not yet committed, so Ctrl+Z belongs to the text field. */
    function hasUncommitted() {
        const el = document.activeElement;
        if (!el || !host.contains(el) || el.type !== 'text') return false;
        const row = el.closest('.ol-row');
        const node = row && live(opts.getBoard(), row.dataset.id);
        return Boolean(node) && el.value.trim() !== node.text;
    }

    function commitAll() {
        for (const id of [...timers.keys()]) commit(id);
    }

    function lastChild(board, id) {
        const kids = board.order[id] || [];
        return kids.length ? kids[kids.length - 1] : null;
    }

    function addAfter(id) {
        const board = opts.getBoard();
        const node = board.nodes[id];
        const newId = opts.newId();
        let op;
        if (node.kind === 'category') op = { type: 'addNode', id: newId, parentId: ROOT, after: id, kind: 'category', text: '' };
        else if (node.kind === 'unsorted') op = { type: 'addNode', id: newId, parentId: BIN_ID, after: null, kind: 'cause', text: '' };
        else op = { type: 'addNode', id: newId, parentId: node.parentId, after: id, kind: 'cause', text: '' };
        const result = opts.apply(op, { focus: newId });
        return result.ok ? newId : null;
    }

    function addChild(id) {
        const board = opts.getBoard();
        const newId = opts.newId();
        const result = opts.apply({ type: 'addNode', id: newId, parentId: id, after: lastChild(board, id), kind: 'cause', text: '' }, { focus: newId });
        return result.ok ? newId : null;
    }

    function indent(id) {
        const board = opts.getBoard();
        const node = board.nodes[id];
        if (node.kind !== 'cause') { opts.message('A category cannot be indented. Its causes can.'); return; }
        const siblings = liveChildren(board, node.parentId);
        const at = siblings.indexOf(id);
        if (at <= 0) { opts.message('There is nothing above this line at the same level to put it under.'); return; }
        const target = siblings[at - 1];
        opts.apply({ type: 'move', nodeId: id, parentId: target, after: lastChild(board, target) }, { focus: id });
    }

    function outdent(id) {
        const board = opts.getBoard();
        const node = board.nodes[id];
        if (node.kind !== 'cause') return;
        const parent = board.nodes[node.parentId];
        if (!parent || parent.kind !== 'cause') {
            opts.message('A cause cannot become a category. Drag it onto another bone, or use Edit as text.');
            return;
        }
        opts.apply({ type: 'move', nodeId: id, parentId: parent.parentId, after: parent.id }, { focus: id });
    }

    function shift(id, step) {
        const board = opts.getBoard();
        const node = board.nodes[id];
        if (node.kind === 'unsorted') return;
        const siblings = liveChildren(board, node.parentId).filter((x) => board.nodes[x].kind !== 'unsorted');
        const at = siblings.indexOf(id);
        const to = at + step;
        if (to < 0 || to >= siblings.length) return;
        const after = step < 0 ? (to === 0 ? null : siblings[to - 1]) : siblings[to];
        opts.apply({ type: 'move', nodeId: id, parentId: node.parentId, after }, { focus: id });
    }

    function remove(id) {
        const board = opts.getBoard();
        const order = outlineOrder(board);
        const prev = order[order.indexOf(id) - 1] || null;
        const result = opts.apply({ type: 'deleteNode', nodeId: id }, { focus: prev });
        return result.ok;
    }

    function setStatus(id, status) {
        const board = opts.getBoard();
        const node = board.nodes[id];
        if (!node || node.kind !== 'cause') return;
        opts.apply({ type: 'setField', nodeId: id, field: 'status', value: status }, { focus: id });
    }

    function onKey(event) {
        const row = event.target.closest('.ol-row');
        if (!row) return;
        const id = row.dataset.id;
        const mod = event.ctrlKey || event.metaKey;
        if (event.key === 'Escape') {
            event.preventDefault();
            commit(id);
            opts.leave();
            return;
        }
        if (opts.readOnly()) return;
        if (event.target.tagName === 'SELECT') {
            if (event.key === 'Tab' && !event.shiftKey && !mod) return;
        }
        if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            if (!commit(id)) return;
            if (mod) addChild(id);
            else addAfter(id);
            return;
        }
        if (event.key === 'Tab' && !mod && !event.altKey) {
            event.preventDefault();
            if (!commit(id)) return;
            if (event.shiftKey) outdent(id);
            else indent(id);
            return;
        }
        if (mod && event.shiftKey && !event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault();
            if (!commit(id)) return;
            shift(id, event.key === 'ArrowUp' ? -1 : 1);
            return;
        }
        if (mod && event.shiftKey && !event.altKey && Object.prototype.hasOwnProperty.call(STATUS_KEYS, event.code)) {
            event.preventDefault();
            setStatus(id, STATUS_KEYS[event.code]);
            return;
        }
        if (!mod && !event.altKey && !event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.target.type === 'text') {
            const order = outlineOrder(opts.getBoard());
            const next = order[order.indexOf(id) + (event.key === 'ArrowUp' ? -1 : 1)];
            if (next) {
                event.preventDefault();
                commit(id);
                focusNode(next);
            }
            return;
        }
        if (event.key === 'Backspace' && !mod && event.target.type === 'text' && event.target.value === '') {
            const board = opts.getBoard();
            const node = board.nodes[id];
            if (node && node.kind !== 'unsorted' && !liveChildren(board, id).length) {
                event.preventDefault();
                remove(id);
            }
        }
    }

    function onInput(event) {
        const row = event.target.closest('.ol-row');
        if (!row || event.target.type !== 'text') return;
        const id = row.dataset.id;
        clearTimeout(timers.get(id));
        timers.set(id, setTimeout(() => commit(id), COMMIT_MS));
    }

    function onChange(event) {
        const row = event.target.closest('.ol-row');
        if (!row || event.target.tagName !== 'SELECT') return;
        setStatus(row.dataset.id, event.target.value);
    }

    function onFocus(event) {
        if (rendering) return;
        const row = event.target.closest('.ol-row');
        if (row && row.dataset.id !== opts.selected()) opts.select(row.dataset.id, { from: 'outline' });
    }

    function onBlur(event) {
        if (rendering) return;
        const row = event.target.closest('.ol-row');
        if (row && event.target.type === 'text') commit(row.dataset.id);
    }

    host.addEventListener('keydown', onKey);
    host.addEventListener('input', onInput);
    host.addEventListener('change', onChange);
    host.addEventListener('focusin', onFocus);
    host.addEventListener('focusout', onBlur);

    function makeRow(board, id, selectedId, readOnly) {
        const node = board.nodes[id];
        const depth = node.kind === 'cause' ? depthOf(board, id) : 0;
        const row = document.createElement('div');
        row.className = `ol-row ol-d${Math.min(depth, LIMITS.depth)}`;
        row.dataset.id = id;
        if (id === selectedId) row.classList.add('is-selected');
        if (node.kind === 'unsorted') {
            row.classList.add('is-bin');
            const name = document.createElement('span');
            name.className = 'ol-bin-name';
            name.tabIndex = 0;
            name.textContent = `${BIN_NAME} (not yet sorted)`;
            row.append(name);
            return row;
        }
        if (node.kind === 'category') row.classList.add('is-category');
        if (node.kind === 'cause') {
            const status = document.createElement('select');
            status.setAttribute('aria-label', `Status of ${node.text || 'this cause'}`);
            for (const [value, label] of Object.entries(STATUS_LABELS)) status.append(new Option(label, value, false, node.status === value));
            status.disabled = readOnly;
            row.append(status);
        }
        const input = document.createElement('input');
        input.type = 'text';
        input.value = node.text;
        input.maxLength = LIMITS.causeText;
        input.readOnly = readOnly;
        input.spellcheck = true;
        input.setAttribute('aria-keyshortcuts', 'Enter Tab Shift+Tab Control+Enter Escape');
        if (node.kind === 'category') {
            input.setAttribute('aria-label', `Category ${node.text || '(blank)'}`);
            input.placeholder = 'Category name';
        } else {
            const parent = board.nodes[node.parentId];
            input.setAttribute('aria-label', `Cause, level ${depth}, under ${parent.kind === 'unsorted' ? BIN_NAME : parent.text || '(blank)'}`);
            input.placeholder = depth > 1 ? 'Why?' : 'Cause';
        }
        row.append(input);
        const flags = [];
        if (node.lock !== 'none') flags.push(node.lock === 'branch' ? 'branch locked' : 'locked');
        if (node.proposal) flags.push(`proposed ${STATUS_LABELS[node.proposal.status]}`);
        if (node.evidence && node.evidence.length) flags.push(`${node.evidence.length} evidence`);
        if (flags.length) {
            const flag = document.createElement('span');
            flag.className = 'ol-flag';
            flag.textContent = flags.join(', ');
            row.append(flag);
        }
        return row;
    }

    /** Rebuild the outline, keeping focus and caret where they were. */
    function render(board, { selectedId = null, readOnly = false, focus = null } = {}) {
        const active = document.activeElement;
        const activeRow = active && host.contains(active) ? active.closest('.ol-row') : null;
        const keep = activeRow ? { id: activeRow.dataset.id, caret: active.selectionStart, isSelect: active.tagName === 'SELECT' } : null;
        rendering = true;
        const order = outlineOrder(board);
        const rows = order.map((id) => makeRow(board, id, selectedId, readOnly));
        if (!rows.length) {
            const empty = document.createElement('p');
            empty.className = 'ol-empty';
            empty.textContent = 'Nothing yet. Add a category, or open an example.';
            rows.push(empty);
        }
        host.replaceChildren(...rows);
        const target = focus || (keep && keep.id);
        if (target && rowFor(target)) {
            if (keep && keep.isSelect && target === keep.id) {
                const sel = rowFor(target).querySelector('select');
                if (sel) sel.focus();
            } else {
                focusNode(target);
                const input = inputFor(target);
                if (input && !focus && keep && Number.isInteger(keep.caret)) {
                    try { input.setSelectionRange(keep.caret, keep.caret); } catch (e) { /* ignore */ }
                }
            }
        }
        rendering = false;
    }

    return { render, focusNode, commitAll, hasUncommitted, addAfter, addChild, indent, outdent, shift, remove, setStatus };
}
