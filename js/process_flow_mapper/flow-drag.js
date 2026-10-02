// Moving steps between lanes, and lanes past each other, for the process flow
// mapper. By pointer or by Alt and an arrow key.
//
// The SVG is rebuilt on every render, so listeners live on the host element
// that outlives it. Nothing is moved here: the caller rewrites the text.

const DRAG_THRESHOLD_PX = 4;

/**
 * api: getModel(), moveStep(stepIndex, laneIndex), moveLane(laneIndex, toIndex).
 * Returns nothing. A drag that ends where it began, or off every lane, does nothing.
 */
export function attachDrag(host, api) {
    let drag = null;

    const grabbed = (event) => {
        if (!(event.target instanceof Element)) return null;
        const step = event.target.closest('.flow-step');
        if (step) return { kind: 'step', index: Number(step.getAttribute('data-node')) };
        const lane = event.target.closest('.flow-lane-label');
        if (lane) return { kind: 'lane', index: Number(lane.getAttribute('data-lane')) };
        return null;
    };

    // Which lane a point on the screen is over. The SVG may be shown smaller
    // than it is drawn, and lanes are rows or columns depending on the setting.
    const laneAt = (clientX, clientY) => {
        const svg = host.querySelector('svg');
        const model = api.getModel();
        if (!svg || !model || !model.ok) return null;
        const rect = svg.getBoundingClientRect();
        if (!(rect.height > 0) || !(rect.width > 0)) return null;
        const x = (clientX - rect.left) * (model.layout.width / rect.width);
        const y = (clientY - rect.top) * (model.layout.height / rect.height);
        const down = model.layout.direction === 'down';
        const lane = model.layout.lanes.find((l) => (down ? x >= l.x0 && x < l.x1 : y >= l.y0 && y < l.y1));
        return lane ? lane.index : null;
    };

    const mark = (laneIndex) => {
        for (const rect of host.querySelectorAll('.flow-lane')) {
            rect.classList.toggle('drop-target', laneIndex !== null && Number(rect.getAttribute('data-lane')) === laneIndex);
        }
    };

    host.addEventListener('pointerdown', (event) => {
        const what = grabbed(event);
        const model = api.getModel();
        if (!what || event.button !== 0 || !model || !model.ok) return;
        drag = { ...what, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, lane: null };
    });

    host.addEventListener('pointermove', (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (!drag.moved) {
            if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
            drag.moved = true;
            // Captured only once it is a drag, so a plain click still reaches the step.
            host.setPointerCapture(event.pointerId);
            host.classList.add('dragging');
        }
        drag.lane = laneAt(event.clientX, event.clientY);
        mark(drag.lane);
    });

    const finish = (event, keep) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const done = drag;
        drag = null;
        host.classList.remove('dragging');
        mark(null);
        if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
        // A captured pointer sends its click to the host, so a drag never also picks a step.
        if (!done.moved || !keep || done.lane === null) return;
        if (done.kind === 'step') api.moveStep(done.index, done.lane);
        else api.moveLane(done.index, done.lane);
    };
    host.addEventListener('pointerup', (event) => finish(event, true));
    host.addEventListener('pointercancel', (event) => finish(event, false));

    host.addEventListener('keydown', (event) => {
        // Up and left are the lane before, down and right the lane after, whichever way lanes run.
        const delta = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
        if (!event.altKey || !delta) return;
        const what = grabbed(event);
        const model = api.getModel();
        if (!what || !model || !model.ok) return;
        event.preventDefault();
        const count = model.graph.lanes.length;
        if (what.kind === 'step') {
            const to = model.graph.nodes[what.index].lane + delta;
            if (to >= 0 && to < count) api.moveStep(what.index, to);
        } else {
            const to = what.index + delta;
            if (to >= 0 && to < count) api.moveLane(what.index, to);
        }
    });
}
