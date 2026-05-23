// Subgroup availability: when no single slot works for everyone, group slots
// by the *set* of participants available at that slot. This makes it obvious
// which subsets of people share free time, so a big meetup can be split into
// smaller meetings at different times.

import { getSlot, SLOT_AVAILABLE, SLOT_PREFERRED } from "./bytes.js";
import { computeSlotStarts, formatForViewer } from "./tz.js";

const MAX_SLOTS_PER_ROW_VISIBLE = 8;     // remaining slots collapsed behind "+N more"
const MAX_GROUPS_RENDERED = 40;          // hard cap on table rows for huge events

/**
 * Compute groups: each entry is one *distinct* set of available participants
 * that shows up at one or more slots. Ranked by:
 *   1. group size desc (largest groups first)
 *   2. number of slots desc (more usable subgroups float up)
 *
 * Subgroups whose only available participant is the viewer themself are
 * skipped because those are not a meeting.
 */
export function computeGroupAvailability(event, participants) {
    const decoded = participants.map((p) => {
        const bin = atob(p.slots);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { p, bytes };
    });
    if (decoded.length < 2) return [];

    const totalSlots = computeSlotStarts(event).length;
    const groups = new Map();   // key: sorted-pid-string to { pids: [], slotIdxs: [] }

    for (let i = 0; i < totalSlots; i++) {
        const free = [];
        for (const { p, bytes } of decoded) {
            const v = getSlot(bytes, i);
            if (v === SLOT_AVAILABLE || v === SLOT_PREFERRED) free.push(p.id);
        }
        if (free.length < 2) continue;
        free.sort();
        const key = free.join("|");
        let g = groups.get(key);
        if (!g) { g = { pids: free, slotIdxs: [] }; groups.set(key, g); }
        g.slotIdxs.push(i);
    }

    return Array.from(groups.values()).sort((a, b) => {
        if (b.pids.length !== a.pids.length) return b.pids.length - a.pids.length;
        return b.slotIdxs.length - a.slotIdxs.length;
    });
}

/**
 * Render the subgroup table into #subgroupBody. Hide the panel when there are
 * no groups to show.
 *
 *   event, participants, viewerTz - passed through from the page state.
 *   ownPid - to highlight the signed-in user's chip in any group containing them.
 *   onSlotClick - called with the slot index when a chip is clicked.
 */
export function renderSubgroupTable({ event, participants, viewerTz, ownPid, onSlotClick }) {
    const panel = document.getElementById("subgroupPanel");
    const body = document.getElementById("subgroupBody");
    const empty = document.getElementById("subgroupEmpty");
    if (!panel || !body) return;

    const groups = computeGroupAvailability(event, participants);
    if (groups.length === 0) {
        panel.hidden = participants.length < 2;
        body.replaceChildren();
        if (empty) empty.hidden = participants.length < 2;
        // When < 2 participants, hide the whole panel; when ≥ 2 but no overlap, show empty hint.
        return;
    }

    panel.hidden = false;
    if (empty) empty.hidden = true;

    const slotStarts = computeSlotStarts(event);
    const idToName = new Map(participants.map((p) => [p.id, p]));

    const rows = groups.slice(0, MAX_GROUPS_RENDERED).map((g) => {
        const tr = document.createElement("tr");

        // People column
        const tdPeople = document.createElement("td");
        tdPeople.className = "col-people";
        const peopleWrap = document.createElement("div");
        peopleWrap.className = "subgroup-people";
        for (const pid of g.pids) {
            const p = idToName.get(pid);
            const chip = document.createElement("span");
            chip.className = "subgroup-person";
            if (pid === ownPid) chip.classList.add("is-self");
            chip.textContent = p?.name && p.name.length ? p.name : "(hidden)";
            peopleWrap.appendChild(chip);
        }
        tdPeople.appendChild(peopleWrap);
        tr.appendChild(tdPeople);

        // Count column
        const tdCount = document.createElement("td");
        tdCount.className = "col-count";
        const pill = document.createElement("span");
        pill.className = "subgroup-count-pill";
        pill.textContent = String(g.pids.length);
        tdCount.appendChild(pill);
        tr.appendChild(tdCount);

        // Slots column
        const tdSlots = document.createElement("td");
        tdSlots.className = "col-slots";
        const chipsWrap = document.createElement("div");
        chipsWrap.className = "subgroup-slot-chips";
        const visibleSlots = g.slotIdxs.slice(0, MAX_SLOTS_PER_ROW_VISIBLE);
        for (const slotIdx of visibleSlots) {
            const fmt = formatForViewer(slotStarts[slotIdx], viewerTz);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "subgroup-slot-chip";
            btn.textContent = `${fmt.dayLabel} ${fmt.timeLabel}`;
            btn.title = `Slot index ${slotIdx}`;
            btn.addEventListener("click", () => onSlotClick?.(slotIdx));
            chipsWrap.appendChild(btn);
        }
        if (g.slotIdxs.length > MAX_SLOTS_PER_ROW_VISIBLE) {
            const more = document.createElement("span");
            more.className = "subgroup-slot-more";
            more.textContent = `+${g.slotIdxs.length - MAX_SLOTS_PER_ROW_VISIBLE} more`;
            chipsWrap.appendChild(more);
        }
        tdSlots.appendChild(chipsWrap);
        tr.appendChild(tdSlots);

        return tr;
    });

    body.replaceChildren(...rows);
}
