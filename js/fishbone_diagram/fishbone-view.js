// The diagram frame: draws the SVG, zooms, moves focus between causes with
// the arrow keys in outline order, edits a label in place on double-click,
// and moves a cause by dragging it onto another one or onto a bone.

import { LIMITS } from './fishbone-limits.js';
import { ROOT, BIN_ID, live, liveChildren } from './fishbone-ops.js';
import { renderBoard } from './fishbone-render.js';
import { outlineOrder } from './fishbone-outliner.js';

export const ZOOM = Object.freeze({ min: 0.25, max: 3, step: 1.2 });
const DRAG_PX = 6;

/**
 * opts: { frame, host, getBoard, select(id, how), edit(id), apply(op), message(text),
 * readOnly(), onZoom(zoom) }.
 */
export function createView(opts) {
    const { frame, host } = opts;
    let zoom = 1;
    let layout = null;
    let focusId = null;
    let svg = null;

    function draw(board, lay, { palette, selectedId }) {
        layout = lay;
        const order = outlineOrder(board);
        if (!focusId || !live(board, focusId)) focusId = order[0] || null;
        if (focusId === BIN_ID) focusId = order.find((id) => id !== BIN_ID) || null;
        const hadFocus = svg && svg.contains(document.activeElement);
        svg = renderBoard(document, board, lay, { palette, interactive: true, focusId, selectedId, title: board.title || board.effect || 'Fishbone diagram' });
        applyZoom();
        host.replaceChildren(svg);
        if (hadFocus) focusItem(focusId);
    }

    function applyZoom() {
        if (!svg || !layout) return;
        svg.setAttribute('width', Math.round(layout.width * zoom));
        svg.setAttribute('height', Math.round(Number(svg.getAttribute('viewBox').split(' ')[3]) * zoom));
    }

    function setZoom(value) {
        zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, value));
        applyZoom();
        opts.onZoom(zoom);
    }

    function fit() {
        if (!layout) return;
        const width = frame.clientWidth - 4;
        setZoom(Math.min(1, width / layout.width));
    }

    const itemEl = (id) => (svg ? svg.querySelector(`[data-node-id="${id}"][tabindex]`) : null);

    function focusItem(id) {
        const target = itemEl(id);
        if (!target) return;
        for (const node of svg.querySelectorAll('[tabindex="0"]')) node.setAttribute('tabindex', '-1');
        target.setAttribute('tabindex', '0');
        focusId = id;
        target.focus({ preventScroll: true });
        scrollIntoFrame(target);
    }

    function scrollIntoFrame(target) {
        const box = target.getBoundingClientRect();
        const outer = frame.getBoundingClientRect();
        if (box.left < outer.left) frame.scrollLeft -= outer.left - box.left + 16;
        else if (box.right > outer.right) frame.scrollLeft += box.right - outer.right + 16;
        if (box.top < outer.top) frame.scrollTop -= outer.top - box.top + 16;
        else if (box.bottom > outer.bottom) frame.scrollTop += box.bottom - outer.bottom + 16;
    }

    function markSelected(id) {
        if (!svg) return;
        for (const node of svg.querySelectorAll('.is-selected')) node.classList.remove('is-selected');
        const target = itemEl(id);
        if (target) {
            target.classList.add('is-selected');
            for (const node of svg.querySelectorAll('[tabindex="0"]')) node.setAttribute('tabindex', '-1');
            target.setAttribute('tabindex', '0');
            focusId = id;
        }
    }

    function revealItem(id) {
        const target = itemEl(id);
        if (target) scrollIntoFrame(target);
    }

    // Keyboard: Up and Down follow the outline order; Left goes to the parent, Right to the first child.
    host.addEventListener('keydown', (event) => {
        const target = event.target.closest('[data-node-id][tabindex]');
        if (!target) return;
        const board = opts.getBoard();
        const id = target.dataset.nodeId;
        const order = outlineOrder(board).filter((x) => itemEl(x));
        let next = null;
        if (event.key === 'ArrowDown') next = order[order.indexOf(id) + 1];
        else if (event.key === 'ArrowUp') next = order[order.indexOf(id) - 1];
        else if (event.key === 'ArrowLeft') next = board.nodes[id].parentId !== ROOT ? board.nodes[id].parentId : null;
        else if (event.key === 'ArrowRight') next = liveChildren(board, id)[0];
        else if (event.key === 'Home') next = order[0];
        else if (event.key === 'End') next = order[order.length - 1];
        else if (event.key === 'Enter' || event.key === 'F2') {
            event.preventDefault();
            opts.edit(id);
            return;
        } else return;
        event.preventDefault();
        if (next && itemEl(next)) {
            focusItem(next);
            opts.select(next, { from: 'diagram' });
        }
    });

    host.addEventListener('focusin', (event) => {
        const target = event.target.closest('[data-node-id][tabindex]');
        if (target && target.dataset.nodeId !== focusId) {
            focusId = target.dataset.nodeId;
            opts.select(focusId, { from: 'diagram' });
        }
    });

    // Click selects; double-click edits in place.
    host.addEventListener('click', (event) => {
        if (dragged) { dragged = false; return; }
        const target = event.target.closest('[data-node-id][tabindex]');
        if (!target) return;
        focusItem(target.dataset.nodeId);
        opts.select(target.dataset.nodeId, { from: 'diagram' });
    });
    host.addEventListener('dblclick', (event) => {
        const target = event.target.closest('[data-node-id][tabindex]');
        if (!target || opts.readOnly()) return;
        editInPlace(target.dataset.nodeId);
    });

    function editInPlace(id) {
        const board = opts.getBoard();
        const node = live(board, id);
        const target = itemEl(id);
        if (!node || !target || node.kind === 'unsorted') return;
        const box = target.getBoundingClientRect();
        const outer = frame.getBoundingClientRect();
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fb-inline-edit';
        input.value = node.text;
        input.maxLength = LIMITS.causeText;
        input.setAttribute('aria-label', `Edit ${node.text || 'blank item'}`);
        input.style.left = `${box.left - outer.left + frame.scrollLeft}px`;
        input.style.top = `${box.top - outer.top + frame.scrollTop}px`;
        input.style.width = `${Math.max(box.width, 180)}px`;
        frame.append(input);
        input.focus();
        input.select();
        let done = false;
        const finish = (save) => {
            if (done) return;
            done = true;
            const value = input.value;
            input.remove();
            if (save && value.trim() !== node.text) opts.apply({ type: 'setField', nodeId: id, field: 'text', value });
            focusItem(id);
        };
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); finish(true); }
            else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
        });
        input.addEventListener('blur', () => finish(true));
    }

    // Drag a cause onto another cause, a category or the bin. Mouse and pen only.
    let drag = null;
    let dragged = false;
    host.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'touch' || event.button !== 0 || opts.readOnly()) return;
        const target = event.target.closest('.fb-item[data-node-id]');
        if (!target) return;
        drag = { id: target.dataset.nodeId, x: event.clientX, y: event.clientY, started: false, el: target, over: null };
    });
    window.addEventListener('pointermove', (event) => {
        if (!drag) return;
        if (!drag.started) {
            if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_PX) return;
            drag.started = true;
            drag.el.classList.add('is-dragging');
        }
        const under = document.elementFromPoint(event.clientX, event.clientY);
        const over = under && host.contains(under) ? dropTarget(under) : null;
        if (drag.over && drag.over !== over) drag.over.classList.remove('fb-drop-target');
        if (over && over.dataset.nodeId !== drag.id) over.classList.add('fb-drop-target');
        drag.over = over && over.dataset.nodeId !== drag.id ? over : null;
    });
    window.addEventListener('pointerup', () => {
        if (!drag) return;
        const { id, over, started, el } = drag;
        drag = null;
        el.classList.remove('is-dragging');
        if (over) over.classList.remove('fb-drop-target');
        if (!started) return;
        dragged = true;
        if (!over) return;
        const board = opts.getBoard();
        const parentId = over.dataset.nodeId;
        const kids = board.order[parentId] || [];
        opts.apply({ type: 'move', nodeId: id, parentId, after: kids.length ? kids[kids.length - 1] : null }, { focus: id });
    });

    function dropTarget(node) {
        const item = node.closest('.fb-item[data-node-id], .fb-label[data-node-id]');
        if (item) return item;
        const bone = node.closest('.fb-bone');
        if (bone) return bone.querySelector('.fb-label');
        const bin = node.closest('.fb-bin');
        return bin && live(opts.getBoard(), BIN_ID) ? bin : null;
    }

    // Two fingers pinch the zoom; one finger pans the frame natively.
    const touches = new Map();
    let pinch = null;
    frame.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'touch') return;
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size === 2) {
            const [a, b] = [...touches.values()];
            pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
        }
    });
    frame.addEventListener('pointermove', (event) => {
        if (!touches.has(event.pointerId)) return;
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch && touches.size === 2) {
            const [a, b] = [...touches.values()];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinch.distance > 0) setZoom(pinch.zoom * (distance / pinch.distance));
        }
    });
    const lift = (event) => {
        touches.delete(event.pointerId);
        if (touches.size < 2) pinch = null;
    };
    frame.addEventListener('pointerup', lift);
    frame.addEventListener('pointercancel', lift);

    return {
        draw,
        setZoom,
        fit,
        zoomIn: () => setZoom(zoom * ZOOM.step),
        zoomOut: () => setZoom(zoom / ZOOM.step),
        getZoom: () => zoom,
        focusItem,
        markSelected,
        revealItem,
        editInPlace
    };
}
