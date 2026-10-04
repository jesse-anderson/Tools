// Moving nodes by pointer or keyboard for the Sankey diagram builder.
//
// The SVG is rebuilt on every render, so listeners and pointer capture live on
// the host element that outlives it, and nodes are found again by data-node.

import { positionFromPoint } from './sankey-engine.js';

const DRAG_THRESHOLD_PX = 3;
// Two clicks on a node this close together toggle its trace.
const DOUBLE_CLICK_MS = 400;
const KEY_STEP = 2;
const KEY_STEP_LARGE = 10;
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * api: getModel(), preview(positions or null), commit(name, position or null),
 * toggleTrace(name). preview redraws without touching the text; commit writes
 * the position line; toggleTrace adds or removes the node's trace line.
 */
export function attachDrag(host, api) {
    let drag = null;
    let frame = 0;
    let lastClick = null;

    const nodeOf = (event) => {
        // A thin node is a poor target, so its padded hit area and its label grab it too.
        const el = event.target instanceof Element ? event.target.closest('.sankey-node, .sankey-node-hit, .sankey-label') : null;
        return el ? Number(el.getAttribute('data-node')) : null;
    };

    // Client pixels to diagram units: the SVG is scaled to fit its container.
    const scale = () => {
        const svg = host.querySelector('svg');
        const model = api.getModel();
        if (!svg || !model || !model.ok) return 1;
        const rect = svg.getBoundingClientRect();
        return rect.width > 0 ? model.layout.options.width / rect.width : 1;
    };

    const focusNode = (index) => {
        const el = host.querySelector(`.sankey-node[data-node="${index}"]`);
        if (el) el.focus({ preventScroll: true });
    };

    host.addEventListener('pointerdown', (event) => {
        const index = nodeOf(event);
        const model = api.getModel();
        if (index === null || event.button !== 0 || !model || !model.ok) return;
        const node = model.layout.nodes[index];
        drag = {
            index,
            name: node.name,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            x0: node.x0,
            y0: node.y0,
            layout: model.layout,
            positions: { ...model.parsed.positions },
            scale: scale(),
            moved: false,
            position: null
        };
        host.setPointerCapture(event.pointerId);
    });

    host.addEventListener('pointermove', (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        host.classList.add('dragging');
        // Measured against the layout the drag started on, so the node tracks
        // the pointer and does not chase its own previews.
        drag.position = positionFromPoint(drag.layout, drag.index, drag.x0 + dx * drag.scale, drag.y0 + dy * drag.scale);
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (drag && drag.position) api.preview({ ...drag.positions, [drag.name]: drag.position });
        });
    });

    const finish = (event, keep) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const done = drag;
        drag = null;
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        host.classList.remove('dragging');
        if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
        if (!done.moved) {
            // Counted here, not from dblclick: a captured pointer sends its clicks to the host.
            const now = event.timeStamp;
            if (keep && lastClick && lastClick.name === done.name && now - lastClick.at <= DOUBLE_CLICK_MS) {
                lastClick = null;
                api.toggleTrace(done.name);
                focusNode(done.index);
            } else {
                lastClick = keep ? { name: done.name, at: now } : null;
            }
            return;
        }
        lastClick = null;
        if (keep && done.position) {
            api.commit(done.name, done.position);
            focusNode(done.index);
        } else {
            api.preview(null);
        }
    };
    host.addEventListener('pointerup', (event) => finish(event, true));
    host.addEventListener('pointercancel', (event) => finish(event, false));

    host.addEventListener('keydown', (event) => {
        const index = nodeOf(event);
        const model = api.getModel();
        if (index === null || !model || !model.ok) return;
        const node = model.layout.nodes[index];

        if ((event.key === 'Delete' || event.key === 'Backspace') && node.pinned) {
            event.preventDefault();
            api.commit(node.name, null);
            focusNode(index);
            return;
        }
        if ((event.key === 't' || event.key === 'T') && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            api.toggleTrace(node.name);
            focusNode(index);
            return;
        }
        const move = ARROWS[event.key];
        if (!move) return;
        event.preventDefault();
        const from = model.parsed.positions[node.name] || positionFromPoint(model.layout, index, node.x0, node.y0);
        const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
        const clamp = (v) => Math.min(100, Math.max(0, v));
        api.commit(node.name, { x: clamp(from.x + move[0] * step), y: clamp(from.y + move[1] * step) });
        focusNode(index);
    });
}
