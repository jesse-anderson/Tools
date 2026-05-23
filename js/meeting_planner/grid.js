// Grid renderer + paint interactions + heatmap + tooltip + best-slots bar.
//
// The grid is "column-major" against the event TZ: column d x slot-of-day s
// maps to canonical slot index d*slotsPerDay + s. Headers show viewer-local
// dates; the time column shows viewer-local times based on column 0 (across
// mid-event DST the later columns may shift by +/-1h. Acceptable for v1.

import {
    SLOT_UNAVAILABLE, SLOT_AVAILABLE, SLOT_PREFERRED,
    getSlot, setSlot,
} from "./bytes.js";
import { computeSlotStarts, formatForViewer, getViewerTz } from "./tz.js";

// Preference weight in the heatmap and best-slot ranking.
const PREFER_WEIGHT_HEATMAP = 1.5;
const PREFER_WEIGHT_ICS     = 0.5;

let lastRenderRefs = null; // cached DOM refs for hover/paint handlers

/**
 * Render or re-render the grid into #gridRoot.
 *   args.event        - EventDTO
 *   args.participants - ParticipantDTO[] (visibility-filtered)
 *   args.ownSlots     - Uint8Array | null (signed-in user's row, editable)
 *   args.ownRowId     - participant id or null
 *   args.canEdit      - whether the user can paint
 *   args.viewerTz     - IANA tz string
 *   args.decidedSlotIdx - int | null
 */
export function renderGrid(args) {
    const root = document.getElementById("gridRoot");
    if (!root) return;
    const { event, participants, ownSlots, ownRowId, canEdit, viewerTz, decidedSlotIdx } = args;

    const slotStarts = computeSlotStarts(event);
    const slotsPerDay = Math.ceil((event.dayEndMin - event.dayStartMin) / event.slotMin);
    const totalSlots = slotStarts.length;
    if (totalSlots === 0) {
        root.replaceChildren();
        return;
    }
    const numDays = totalSlots / slotsPerDay;

    // Decode all participants once; compute per-slot aggregates.
    const decoded = participants.map((p) => {
        const bytes = base64ToBytesLocal(p.slots);
        return { p, bytes };
    });
    const aggregates = computeAggregates(decoded, totalSlots);

    // Build the grid in a document fragment for one DOM write.
    const cols = numDays + 1; // +1 for time labels
    root.style.setProperty("--col-count", String(cols));
    root.style.gridTemplateColumns = `auto repeat(${numDays}, minmax(56px, 1fr))`;

    const frag = document.createDocumentFragment();

    // Header row: blank corner cell + one day header per event day.
    {
        const corner = document.createElement("div");
        corner.className = "grid-header-cell";
        corner.textContent = "";
        frag.appendChild(corner);
        for (let d = 0; d < numDays; d++) {
            const startIdx = d * slotsPerDay;
            const labelDate = slotStarts[startIdx];
            const fmt = formatForViewer(labelDate, viewerTz);
            const header = document.createElement("div");
            header.className = "grid-header-cell day-header";
            const strong = document.createElement("strong");
            strong.textContent = fmt.dayLabel;
            header.appendChild(strong);
            const subdate = document.createElement("span");
            subdate.textContent = fmt.dayKey;
            header.appendChild(subdate);
            frag.appendChild(header);
        }
    }

    // Body rows: for each within-day slot, one time label + one cell per day.
    for (let s = 0; s < slotsPerDay; s++) {
        const refDate = slotStarts[s]; // first day's slot for the time label
        const fmt = formatForViewer(refDate, viewerTz);
        const timeCell = document.createElement("div");
        timeCell.className = "grid-time-cell";
        timeCell.textContent = fmt.timeLabel;
        frag.appendChild(timeCell);

        for (let d = 0; d < numDays; d++) {
            const slotIdx = d * slotsPerDay + s;
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "grid-cell";
            cell.dataset.slotIdx = String(slotIdx);
            const agg = aggregates[slotIdx];
            cell.dataset.k = String(agg.k);
            cell.dataset.n = String(decoded.length);
            cell.dataset.preferred = String(agg.preferred);

            // Heatmap background
            const styling = heatmapStyleFor(agg.weight, decoded.length || 1);
            cell.style.background = styling.bg;
            if (styling.darkText) cell.classList.add("dark-text");

            // Numeric overlay
            const label = document.createElement("span");
            label.className = "cell-label";
            label.textContent = `${agg.k}/${decoded.length}`;
            cell.appendChild(label);
            if (agg.preferred > 0) {
                const star = document.createElement("span");
                star.className = "cell-star";
                star.textContent = "★";
                cell.appendChild(star);
            }

            // Own-row paint indicator
            if (ownSlots) {
                const v = getSlot(ownSlots, slotIdx);
                if (v === SLOT_AVAILABLE) cell.classList.add("own-paint-1");
                else if (v === SLOT_PREFERRED) cell.classList.add("own-paint-2");
                if (canEdit) cell.classList.add("own-row");
            }
            if (!canEdit) cell.classList.add("disabled");
            if (decidedSlotIdx === slotIdx) cell.classList.add("locked-decided");

            frag.appendChild(cell);
        }
    }

    root.replaceChildren(frag);

    lastRenderRefs = {
        root, event, participants, decoded, aggregates,
        ownSlots, ownRowId, canEdit, viewerTz, slotsPerDay, numDays, totalSlots, slotStarts,
    };

    renderBestSlots(aggregates, slotStarts, viewerTz);
}

/**
 * Per-slot aggregates: k (count available + preferred), preferred count,
 * weight (k + 0.5 x preferred for heatmap), preferredNames/availableNames/etc
 * computed lazily on hover to keep render fast.
 */
function computeAggregates(decoded, totalSlots) {
    const out = new Array(totalSlots);
    for (let i = 0; i < totalSlots; i++) {
        let k = 0, preferred = 0;
        for (const { bytes } of decoded) {
            const v = getSlot(bytes, i);
            if (v === SLOT_AVAILABLE) k++;
            else if (v === SLOT_PREFERRED) { k++; preferred++; }
        }
        // Heatmap weight: available counts 1, preferred counts 1.5.
        const weight = (k - preferred) + preferred * PREFER_WEIGHT_HEATMAP;
        out[i] = { k, preferred, weight };
    }
    return out;
}

/**
 * Map a weight to a background color via an OKLCH ramp from bg-secondary
 * toward the purple accent. Returns { bg, darkText } where darkText is true
 * once the gradient gets bright enough that white-on-purple would lose
 * contrast.
 */
function heatmapStyleFor(weight, n) {
    if (n <= 0 || weight <= 0) {
        return { bg: "var(--bg-secondary)", darkText: false };
    }
    const peak = n * PREFER_WEIGHT_HEATMAP;       // theoretical max when everyone picks "preferred"
    const t = Math.max(0, Math.min(1, weight / peak));
    // OKLCH ramp: from background (L≈0.25 C≈0.02) to accent purple (L≈0.62 C≈0.20 H≈290).
    // Intentionally use OKLCH so the perceived brightness ramp is smooth.
    const L = 0.18 + t * 0.50;
    const C = 0.02 + t * 0.20;
    const H = 290;
    const bg = `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H} / 0.96)`;
    return { bg, darkText: t > 0.55 };
}

// Decode helper kept local so we don't need to import the whole bytes module
// twice in this file. Calls into the shared decoder.
function base64ToBytesLocal(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// ============================================================================
// Best-slots bar
// ============================================================================

function renderBestSlots(aggregates, slotStarts, viewerTz) {
    const bar = document.getElementById("bestSlotsBar");
    const chips = document.getElementById("bestSlotsChips");
    if (!bar || !chips) return;
    const ranked = aggregates
        .map((a, i) => ({ i, w: a.weight, k: a.k, preferred: a.preferred }))
        .filter((x) => x.w > 0)
        .sort((a, b) => b.w - a.w)
        .slice(0, 3);
    if (ranked.length === 0) {
        bar.hidden = true;
        chips.replaceChildren();
        return;
    }
    bar.hidden = false;
    chips.replaceChildren();
    for (const r of ranked) {
        const fmt = formatForViewer(slotStarts[r.i], viewerTz);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "best-slot-chip";
        chip.dataset.slotIdx = String(r.i);
        chip.title = `Slot ${r.i}`;
        const label = document.createElement("span");
        label.textContent = `${fmt.dayLabel} ${fmt.timeLabel}`;
        const count = document.createElement("span");
        count.className = "count";
        count.textContent = `${r.k}${r.preferred ? "★" : ""}`;
        chip.appendChild(label);
        chip.appendChild(count);
        chip.addEventListener("click", () => scrollAndPulseSlot(r.i));
        chips.appendChild(chip);
    }
}

function scrollAndPulseSlot(slotIdx) {
    const cell = document.querySelector(`.grid-cell[data-slot-idx="${slotIdx}"]`);
    if (!cell) return;
    cell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    cell.classList.remove("pulse");
    // Re-trigger animation
    void cell.offsetWidth;
    cell.classList.add("pulse");
    setTimeout(() => cell.classList.remove("pulse"), 900);
}

// ============================================================================
// Paint interactions
// ============================================================================

let paintActive = false;
let paintTargetState = null;    // value being applied to swept cells
let paintHoldStart = null;
let onPaintCommit = null;       // callback set by attachPaintHandlers

/**
 * Hook up click+drag, shift/alt modifiers, keyboard reticle, and touch.
 *   onChange - called with the mutated ownSlots after every committed paint.
 *   getPaintMode - returns the current paint mode ("available"|"preferred"|"erase").
 */
export function attachPaintHandlers({ onChange, getPaintMode }) {
    const root = document.getElementById("gridRoot");
    if (!root) return () => {};
    onPaintCommit = onChange;

    let focusedIdx = -1;

    function paintAt(idx, modeOverride) {
        if (!lastRenderRefs || !lastRenderRefs.ownSlots || !lastRenderRefs.canEdit) return;
        const mode = modeOverride ?? getPaintMode();
        const own = lastRenderRefs.ownSlots;
        const prev = getSlot(own, idx);

        let nextValue;
        if (paintTargetState !== null) {
            // Continuing a drag: apply the same state we committed to the first cell.
            nextValue = paintTargetState;
        } else {
            // First cell in a gesture: infer add/remove from current value.
            if (mode === "erase") {
                nextValue = SLOT_UNAVAILABLE;
            } else if (mode === "preferred") {
                nextValue = prev === SLOT_PREFERRED ? SLOT_AVAILABLE : SLOT_PREFERRED;
            } else {
                // available
                nextValue = prev === SLOT_AVAILABLE ? SLOT_UNAVAILABLE : SLOT_AVAILABLE;
            }
            paintTargetState = nextValue;
        }
        if (prev === nextValue) return;
        setSlot(own, idx, nextValue);
        // Update cell visual immediately without a full re-render.
        const cell = root.querySelector(`.grid-cell[data-slot-idx="${idx}"]`);
        if (cell) {
            cell.classList.remove("own-paint-1", "own-paint-2");
            if (nextValue === SLOT_AVAILABLE) cell.classList.add("own-paint-1");
            else if (nextValue === SLOT_PREFERRED) cell.classList.add("own-paint-2");
        }
    }

    function endPaint() {
        if (paintActive) {
            paintActive = false;
            paintTargetState = null;
            const indicator = document.getElementById("paintCursorIndicator");
            if (indicator) indicator.hidden = true;
            if (onPaintCommit) onPaintCommit(lastRenderRefs.ownSlots);
        }
    }

    function showIndicator(mode, x, y) {
        const el = document.getElementById("paintCursorIndicator");
        if (!el) return;
        el.hidden = false;
        el.textContent = labelForMode(mode);
        el.style.left = `${x + 14}px`;
        el.style.top = `${y + 14}px`;
    }

    function modeForEvent(e) {
        if (e.altKey) return "erase";
        if (e.shiftKey) return "preferred";
        return getPaintMode();
    }

    function onPointerDown(e) {
        const cell = e.target.closest?.(".grid-cell");
        if (!cell) return;
        if (!lastRenderRefs?.canEdit) {
            // Allow pinning tooltip
            return;
        }
        e.preventDefault();
        cell.focus?.();
        const idx = Number(cell.dataset.slotIdx);
        focusedIdx = idx;
        paintActive = true;
        paintTargetState = null;
        const mode = modeForEvent(e);
        paintAt(idx, mode);
        showIndicator(mode, e.clientX ?? 0, e.clientY ?? 0);
    }

    function onPointerMove(e) {
        if (!paintActive) return;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const cell = target?.closest?.(".grid-cell");
        if (!cell) return;
        const idx = Number(cell.dataset.slotIdx);
        focusedIdx = idx;
        paintAt(idx, modeForEvent(e));
        showIndicator(modeForEvent(e), e.clientX, e.clientY);
    }

    function onPointerUp() { endPaint(); }
    function onPointerLeave() { /* still active if pointer re-enters */ }

    // Keyboard reticle
    function moveFocus(delta) {
        if (!lastRenderRefs) return;
        const { slotsPerDay, numDays, totalSlots } = lastRenderRefs;
        let idx = focusedIdx;
        if (idx < 0) idx = 0;
        let d = Math.floor(idx / slotsPerDay);
        let s = idx % slotsPerDay;
        if (delta === "up")    s = Math.max(0, s - 1);
        if (delta === "down")  s = Math.min(slotsPerDay - 1, s + 1);
        if (delta === "left")  d = Math.max(0, d - 1);
        if (delta === "right") d = Math.min(numDays - 1, d + 1);
        const nextIdx = d * slotsPerDay + s;
        if (nextIdx < 0 || nextIdx >= totalSlots) return;
        focusedIdx = nextIdx;
        const cells = root.querySelectorAll(".grid-cell");
        cells.forEach((c) => c.classList.remove("focused"));
        const cell = root.querySelector(`.grid-cell[data-slot-idx="${nextIdx}"]`);
        if (cell) {
            cell.classList.add("focused");
            cell.focus?.();
        }
    }

    function onKeyDown(e) {
        if (!lastRenderRefs?.canEdit) return;
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            const dir = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }[e.key];
            moveFocus(dir);
        } else if (e.key === " " || e.key === "Spacebar") {
            e.preventDefault();
            if (focusedIdx < 0) return;
            paintActive = true; paintTargetState = null;
            paintAt(focusedIdx, e.shiftKey ? "preferred" : "available");
            endPaint();
        } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            if (focusedIdx < 0) return;
            paintActive = true; paintTargetState = null;
            paintAt(focusedIdx, "erase");
            endPaint();
        }
    }

    // Touch long-press marks preferred.
    let touchTimer = null;
    function onTouchStart(e) {
        if (!lastRenderRefs?.canEdit) return;
        const t = e.touches[0];
        const cell = document.elementFromPoint(t.clientX, t.clientY)?.closest?.(".grid-cell");
        if (!cell) return;
        const idx = Number(cell.dataset.slotIdx);
        paintHoldStart = Date.now();
        touchTimer = setTimeout(() => {
            paintActive = true; paintTargetState = null;
            paintAt(idx, "preferred");
        }, 380);
    }
    function onTouchEnd() {
        if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
        endPaint();
        paintHoldStart = null;
    }

    root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointerleave", onPointerLeave);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchend", onTouchEnd);

    // Tooltip handlers
    attachTooltipHandlers(root);

    return () => {
        root.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        root.removeEventListener("pointerleave", onPointerLeave);
        root.removeEventListener("keydown", onKeyDown);
        root.removeEventListener("touchstart", onTouchStart);
        root.removeEventListener("touchend", onTouchEnd);
    };
}

function labelForMode(mode) {
    if (mode === "preferred") return "★ Preferred";
    if (mode === "erase") return "Erase";
    return "Available";
}

// ============================================================================
// Tooltip
// ============================================================================

let tooltipPinned = false;

function attachTooltipHandlers(root) {
    const tt = document.getElementById("gridTooltip");
    if (!tt) return;

    function show(cell, evt) {
        if (!lastRenderRefs) return;
        const idx = Number(cell.dataset.slotIdx);
        const { decoded, slotStarts, viewerTz, event } = lastRenderRefs;
        const fmt = formatForViewer(slotStarts[idx], viewerTz);
        const buckets = { preferred: [], available: [], unavailable: [] };
        for (const { p, bytes } of decoded) {
            const v = getSlot(bytes, idx);
            if (v === SLOT_PREFERRED) buckets.preferred.push(p);
            else if (v === SLOT_AVAILABLE) buckets.available.push(p);
            else buckets.unavailable.push(p);
        }
        const total = decoded.length;
        const k = buckets.preferred.length + buckets.available.length;

        tt.replaceChildren();
        const head = document.createElement("div");
        head.className = "tt-header";
        const slotEl = document.createElement("div");
        slotEl.className = "tt-slot";
        slotEl.textContent = `${fmt.dayLabel} ${fmt.timeLabel}`;
        const countEl = document.createElement("div");
        countEl.className = "tt-count";
        countEl.textContent = `${k}/${total}${buckets.preferred.length ? " ★" : ""}`;
        head.appendChild(slotEl);
        head.appendChild(countEl);
        tt.appendChild(head);

        const cols = document.createElement("div");
        cols.className = "tt-columns";
        cols.appendChild(buildTtCol("preferred", "Preferred", buckets.preferred));
        cols.appendChild(buildTtCol("available", "Available", buckets.available));
        cols.appendChild(buildTtCol("unavailable", "Unavailable", buckets.unavailable));
        tt.appendChild(cols);

        // Event TZ note when zones differ
        if (event.timezone !== viewerTz) {
            const note = document.createElement("div");
            note.className = "form-hint";
            note.textContent = `(${event.timezone}: ${formatForViewer(slotStarts[idx], event.timezone).timeLabel})`;
            tt.appendChild(note);
        }

        positionTooltip(tt, evt);
        tt.hidden = false;
    }

    function buildTtCol(cls, title, list) {
        const col = document.createElement("div");
        col.className = `tt-col ${cls}`;
        const h = document.createElement("h4");
        h.textContent = `${title} (${list.length})`;
        col.appendChild(h);
        const ul = document.createElement("ul");
        for (const p of list) {
            const li = document.createElement("li");
            li.textContent = p.name && p.name.length ? p.name : "(hidden)";
            if (p.comment) {
                li.title = p.comment;
                const note = document.createElement("span");
                note.style.opacity = "0.7";
                note.style.marginLeft = "4px";
                note.textContent = "-";
                li.appendChild(note);
            }
            ul.appendChild(li);
        }
        col.appendChild(ul);
        return col;
    }

    function positionTooltip(tt, evt) {
        const x = (evt.clientX ?? 0) + 14;
        const y = (evt.clientY ?? 0) + 14;
        tt.style.left = `${x}px`;
        tt.style.top = `${y}px`;
    }

    function onMove(e) {
        if (tooltipPinned) return;
        const cell = e.target?.closest?.(".grid-cell");
        if (!cell) { tt.hidden = true; return; }
        show(cell, e);
    }
    function onClick(e) {
        const cell = e.target?.closest?.(".grid-cell");
        if (!cell) return;
        // Pin only if not paint-eligible; otherwise paint wins.
        if (!lastRenderRefs?.canEdit) {
            tooltipPinned = !tooltipPinned;
            if (tooltipPinned) { tt.classList.add("pinned"); show(cell, e); }
            else { tt.classList.remove("pinned"); tt.hidden = true; }
        }
    }
    function onLeave() {
        if (!tooltipPinned) tt.hidden = true;
    }

    root.addEventListener("pointermove", onMove);
    root.addEventListener("click", onClick);
    root.addEventListener("pointerleave", onLeave);
}

/** Helpers for ICS / best-slot picking from outside. */
export function topRankedSlot() {
    if (!lastRenderRefs) return null;
    const { aggregates } = lastRenderRefs;
    let best = -1, bestW = 0;
    for (let i = 0; i < aggregates.length; i++) {
        if (aggregates[i].weight > bestW) { bestW = aggregates[i].weight; best = i; }
    }
    return best >= 0 ? { idx: best, agg: aggregates[best], start: lastRenderRefs.slotStarts[best] } : null;
}

export function getRenderRefs() { return lastRenderRefs; }
export { PREFER_WEIGHT_ICS };
