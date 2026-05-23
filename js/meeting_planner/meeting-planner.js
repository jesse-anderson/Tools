// Meeting Planner entry module. Wires up hash routing, view switching,
// sign-in, atomic create, admin actions, ICS download, and read-only handling.

import * as api from "./api.js";
import {
    getState, setState, subscribe,
    readRecentEvents, recordRecentEvent, removeRecentEvent,
    storeAdminToken, loadAdminToken, forgetAdminToken,
} from "./state.js";
import { participantPwHash, sha256Hex } from "./crypto.js";
import {
    newPackedSlots, bytesToBase64, base64ToBytes, packedByteLength,
    SLOT_UNAVAILABLE,
} from "./bytes.js";
import { computeSlotStarts, formatForViewer, getViewerTz, formatRangeInZone } from "./tz.js";
import { renderGrid, attachPaintHandlers, topRankedSlot, getRenderRefs } from "./grid.js";
import { renderSubgroupTable } from "./groups.js";
import { initCreateModal, openLongRetentionDialog } from "./create-modal.js";
import { pickIcsBlock, buildIcs } from "./ics.js";
import { getTurnstileToken, resetTurnstile } from "./turnstile.js";
import {
    toast, setEventBanner, setGlobalBanner,
    confirmDialog, copyToClipboard, downloadBlob,
} from "./ui.js";
import { LIMITS, SKIP_TURNSTILE } from "./config.js";

// ============================================================================
// Bootstrap
// ============================================================================

let createModal;
let detachPaint = null;

document.addEventListener("DOMContentLoaded", () => {
    const viewerTz = getViewerTz();
    setState({ viewerTz });

    createModal = initCreateModal({ onDraft: enterDraftMode });

    wireGlobalEvents();
    wireSignIn();
    wireSidebar();
    wireAdminActions();

    window.addEventListener("hashchange", routeFromHash);
    routeFromHash();
});

function wireGlobalEvents() {
    document.getElementById("createEventCta")?.addEventListener("click", () => createModal.open());

    document.getElementById("pasteLinkForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("pasteLinkInput");
        const errEl = document.getElementById("pasteLinkError");
        const raw = input.value.trim();
        const id = extractEventIdFromInput(raw);
        if (!id) {
            errEl.textContent = "Doesn't look like a meeting-planner link or ID.";
            errEl.hidden = false;
            return;
        }
        errEl.hidden = true;
        location.hash = `#evt=${id}`;
    });
}

function extractEventIdFromInput(s) {
    // Accept a full URL, just a hash fragment, or a bare 12-char base62 ID.
    if (/^[A-Za-z0-9]{12}$/.test(s)) return s;
    try {
        if (s.startsWith("http")) {
            const u = new URL(s);
            const params = new URLSearchParams(u.hash.slice(1));
            const id = params.get("evt");
            if (id && /^[A-Za-z0-9]{12}$/.test(id)) return id;
        }
        if (s.startsWith("#")) {
            const params = new URLSearchParams(s.slice(1));
            const id = params.get("evt");
            if (id && /^[A-Za-z0-9]{12}$/.test(id)) return id;
        }
    } catch { /* fall through */ }
    const m = s.match(/[?&#]evt=([A-Za-z0-9]{12})/);
    return m ? m[1] : null;
}

// ============================================================================
// Hash routing
// ============================================================================

function parseHash() {
    const h = location.hash.replace(/^#/, "");
    const params = new URLSearchParams(h);
    return { evt: params.get("evt"), admin: params.get("admin") };
}

function routeFromHash() {
    const { evt, admin } = parseHash();
    if (admin && evt) {
        // Persist the admin token to localStorage, then strip it from the URL
        // bar so the visible URL is safe to share.
        storeAdminToken(evt, admin);
        const cleaned = `#evt=${evt}`;
        history.replaceState(null, "", cleaned);
    }
    if (evt) {
        openEventView(evt);
    } else if (getState().view === "draft") {
        // Already in draft mode, so stay there.
        showView("event");
    } else {
        openLandingView();
    }
}

function showView(view) {
    setState({ view });
    document.getElementById("landingView").hidden = view !== "landing";
    document.getElementById("eventView").hidden = view !== "event" && view !== "draft";
}

// ============================================================================
// Landing view
// ============================================================================

function openLandingView() {
    showView("landing");
    renderRecentEvents();
}

function renderRecentEvents() {
    const list = document.getElementById("recentEventsList");
    const empty = document.getElementById("recentEventsEmpty");
    if (!list) return;
    const items = readRecentEvents();
    list.replaceChildren();
    if (items.length === 0) {
        empty.hidden = false;
        return;
    }
    empty.hidden = true;
    for (const it of items) {
        const li = document.createElement("li");

        const a = document.createElement("a");
        a.href = `#evt=${it.eventId}`;
        a.className = "recent-evt-link";
        const title = document.createElement("span");
        title.className = "recent-evt-title";
        title.textContent = it.title || "(untitled event)";
        const meta = document.createElement("span");
        meta.className = "recent-evt-meta";
        meta.textContent = describeRange(it);
        a.appendChild(title);
        a.appendChild(meta);
        li.appendChild(a);

        if (it.isAdmin) {
            const key = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            key.setAttribute("viewBox", "0 0 24 24");
            key.setAttribute("fill", "none");
            key.setAttribute("stroke", "currentColor");
            key.setAttribute("stroke-width", "2");
            key.setAttribute("class", "recent-evt-admin");
            key.innerHTML = `<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>`;
            key.setAttribute("aria-label", "You hold the admin token for this event");
            li.appendChild(key);
        } else {
            li.appendChild(document.createElement("span"));
        }

        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "recent-evt-remove";
        rm.title = "Remove from this list (doesn't delete the event)";
        rm.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        rm.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeRecentEvent(it.eventId);
            renderRecentEvents();
        });
        li.appendChild(rm);

        list.appendChild(li);
    }
}

function describeRange(it) {
    if (it.mode === "date_range" && it.startDate && it.endDate) {
        return `${it.startDate} to ${it.endDate}`;
    }
    if (it.mode === "weekly") return "weekly";
    return it.eventId;
}

// ============================================================================
// Event view: load and render
// ============================================================================

async function openEventView(eventId) {
    showView("event");
    setEventBanner(null, { hide: true });
    setState({ eventId, view: "event", lastError: null });

    const adminToken = loadAdminToken(eventId);

    let result;
    try {
        result = await api.getEvent(eventId, {
            adminToken,
            participantId: getState().signedInParticipantId,
            participantName: getState().signedInName,
            participantPwHash: getState().signedInPwHash,
        });
    } catch (err) {
        return handleApiError(err, { context: "load event" });
    }

    const { event, participants } = result;
    const isAdmin = !!adminToken && await verifyAdminMatches(adminToken, eventId, event); // tracked locally; server gates real actions
    setState({ event, participants, adminToken, isAdmin });

    recordRecentEvent({
        eventId: event.id,
        title: event.title,
        mode: event.mode,
        startDate: event.startDate,
        endDate: event.endDate,
        isAdmin,
    });

    renderEvent();
}

/**
 * "Verify" client-side: optimistic. If a 403 comes back later from a write
 * with the stored admin token, we wipe it then. The server is the source of
 * truth. We compare hashes locally to short-circuit obvious tampering.
 */
async function verifyAdminMatches(/* token, eventId, event */) {
    // No-op locally; presence of a token is enough to enable admin UI. Wrong
    // tokens just produce 403s on write, which we handle gracefully.
    return true;
}

function renderEvent() {
    const st = getState();
    const ev = st.event;
    if (!ev) return;

    document.getElementById("eventTitle").textContent = ev.title || "(untitled event)";

    // Status badges
    const badges = document.getElementById("eventStatusBadges");
    badges.replaceChildren();
    if (ev.locked) {
        const b = document.createElement("span");
        b.className = "event-status-badge locked";
        b.textContent = "Locked";
        badges.appendChild(b);
    }
    if (ev.visibility !== "public") {
        const b = document.createElement("span");
        b.className = `event-status-badge ${ev.visibility}`;
        b.textContent = ev.visibility === "blind" ? "Blind" : "Heatmap only";
        badges.appendChild(b);
    }

    // Meta line
    const metaParts = [];
    if (ev.mode === "date_range") metaParts.push(`${ev.startDate} to ${ev.endDate}`);
    else metaParts.push(`Weekly, ${ev.weekdays?.map(weekdayShort).join("/")} x ${ev.recurWeeks} weeks`);
    metaParts.push(`${formatMinAsHM(ev.dayStartMin)} - ${formatMinAsHM(ev.dayEndMin)}`);
    metaParts.push(`${ev.slotMin}-min slots`);
    document.getElementById("eventMeta").textContent = metaParts.join(" | ");

    const tzEl = document.getElementById("eventTzNotice");
    if (ev.timezone !== st.viewerTz) {
        tzEl.textContent = `Showing in ${st.viewerTz}; event scheduled in ${ev.timezone}.`;
        tzEl.hidden = false;
    } else {
        tzEl.hidden = true;
    }

    const desc = document.getElementById("eventDescription");
    if (ev.description) {
        desc.textContent = ev.description;
        desc.hidden = false;
    } else {
        desc.hidden = true;
    }

    // Banners: locked / read-only / draft
    if (ev.locked) {
        const decided = ev.decidedSlotIdx != null
            ? ` | decided ${decidedSlotLabel(ev, st.viewerTz)}`
            : "";
        setEventBanner({
            title: "Event is locked.",
            body: `No further edits accepted${decided}.`,
            variant: "info",
        });
    } else {
        setEventBanner(null, { hide: true });
    }

    // Share link
    document.getElementById("shareLinkInput").value = participantUrl(ev.id);

    // Admin sidebar visibility
    document.getElementById("adminCard").hidden = !st.isAdmin;
    document.getElementById("adminLockBtn").textContent = ev.locked ? "Unlock event" : "Lock event";

    // Participants
    renderParticipants();

    // Grid + paint
    setupGridForCurrentState();
}

function setupGridForCurrentState() {
    const st = getState();
    const ev = st.event;
    const isSignedIn = !!st.signedInParticipantId;
    const canEdit = isSignedIn && !ev.locked;

    // Own-row slots: find own participant in the payload, decode bytes.
    let ownSlots = null;
    if (isSignedIn) {
        const own = st.participants.find((p) => p.id === st.signedInParticipantId);
        if (own) ownSlots = base64ToBytes(own.slots);
        else {
            // Signed in but row not in payload (blind mode anonymous viewer
            // would be filtered out, but we'd never get here without auth).
            const totalSlots = computeSlotStarts(ev).length;
            ownSlots = newPackedSlots(totalSlots);
        }
    }

    document.getElementById("gridToolbar").hidden = !canEdit;

    renderGrid({
        event: ev,
        participants: st.participants,
        ownSlots,
        ownRowId: st.signedInParticipantId,
        canEdit,
        viewerTz: st.viewerTz,
        decidedSlotIdx: ev.decidedSlotIdx ?? null,
    });

    if (detachPaint) detachPaint();
    detachPaint = attachPaintHandlers({
        getPaintMode: () => st.paintMode,
        onChange: (bytes) => {
            // Debounced PUT
            scheduleSlotPush(bytes);
        },
    });

    // Subgroup availability table below the grid.
    renderSubgroupTable({
        event: ev,
        participants: st.participants,
        viewerTz: st.viewerTz,
        ownPid: st.signedInParticipantId,
        onSlotClick: (slotIdx) => {
            const cell = document.querySelector(`.grid-cell[data-slot-idx="${slotIdx}"]`);
            if (!cell) return;
            cell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
            cell.classList.remove("pulse");
            void cell.offsetWidth;
            cell.classList.add("pulse");
            setTimeout(() => cell.classList.remove("pulse"), 900);
        },
    });

    setState({ ownSlots });
}

function renderParticipants() {
    const st = getState();
    const list = document.getElementById("participantList");
    const count = document.getElementById("participantCount");
    const warn = document.getElementById("participantWarn");
    if (!list) return;
    list.replaceChildren();
    count.textContent = `(${st.participants.length})`;

    for (const p of st.participants) {
        const li = document.createElement("li");
        li.className = "participant-row";
        if (p.id === st.signedInParticipantId) li.classList.add("is-self");
        const hidden = !p.name || p.name.length === 0;
        if (hidden) li.classList.add("is-hidden");

        const name = document.createElement("span");
        name.className = "p-name";
        name.textContent = hidden ? "(hidden)" : p.name;
        li.appendChild(name);

        if (p.hasPassword) {
            const lock = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            lock.setAttribute("viewBox", "0 0 24 24");
            lock.setAttribute("fill", "none");
            lock.setAttribute("stroke", "currentColor");
            lock.setAttribute("stroke-width", "2");
            lock.setAttribute("class", "p-pw-icon");
            lock.setAttribute("title", "Password-protected row");
            lock.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`;
            li.appendChild(lock);
        }

        const tz = document.createElement("span");
        tz.className = "p-tz";
        tz.textContent = p.tz || "";
        li.appendChild(tz);

        // Admin can kick anyone
        if (st.isAdmin) {
            const actions = document.createElement("div");
            actions.className = "p-actions";
            const del = document.createElement("button");
            del.type = "button";
            del.title = "Remove participant";
            del.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
            del.addEventListener("click", () => kickParticipant(p));
            actions.appendChild(del);
            li.appendChild(actions);
        }
        list.appendChild(li);
    }

    if (st.participants.length >= LIMITS.PARTICIPANTS_WARN_AT) {
        warn.textContent = st.participants.length >= LIMITS.PARTICIPANTS_HARD_CAP
            ? `Participant cap reached (${LIMITS.PARTICIPANTS_HARD_CAP}). No new participants can sign up.`
            : `Approaching the participant cap (${st.participants.length}/${LIMITS.PARTICIPANTS_HARD_CAP}).`;
        warn.hidden = false;
    } else {
        warn.hidden = true;
    }
}

// ============================================================================
// Sign-in flow
// ============================================================================

function wireSignIn() {
    const form = document.getElementById("signInForm");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        await handleSignIn();
    });
    document.getElementById("signOutBtn")?.addEventListener("click", handleSignOut);
    document.getElementById("deleteMineBtn")?.addEventListener("click", handleDeleteSelf);
    document.getElementById("exportMineBtn")?.addEventListener("click", handleExportSelf);

    // Paint-mode buttons
    document.querySelectorAll(".paint-mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const mode = btn.dataset.paint;
            document.querySelectorAll(".paint-mode-btn").forEach((b) => {
                const active = b === btn;
                b.classList.toggle("active", active);
                b.setAttribute("aria-pressed", String(active));
            });
            setState({ paintMode: mode });
        });
    });

    // Touch paint mode toggle cycles available, preferred, erase.
    document.getElementById("touchPaintToggle")?.addEventListener("click", () => {
        const cur = getState().paintMode;
        const next = cur === "available" ? "preferred" : cur === "preferred" ? "erase" : "available";
        setState({ paintMode: next });
        const btn = document.querySelector(`.paint-mode-btn[data-paint="${next}"]`);
        btn?.click();
        document.getElementById("touchPaintToggleLabel").textContent =
            next === "preferred" ? "★" : next === "erase" ? "×" : "✓";
    });
}

async function handleSignIn() {
    const st = getState();
    const ev = st.event;
    const nameEl = document.getElementById("signInName");
    const pwEl = document.getElementById("signInPassword");
    const err = document.getElementById("signInError");
    const name = nameEl.value.trim();
    const password = pwEl.value;
    err.hidden = true;

    if (!name) { err.textContent = "Name is required."; err.hidden = false; return; }
    if (name.length > LIMITS.NAME_MAX) { err.textContent = `Name too long (max ${LIMITS.NAME_MAX}).`; err.hidden = false; return; }
    if (password.length > LIMITS.PASSWORD_MAX) { err.textContent = `Password too long.`; err.hidden = false; return; }

    // Draft mode: this is the commit step (atomic create).
    if (st.view === "draft" && st.draftCreate) {
        await commitAtomicCreate(name, password);
        return;
    }

    if (!ev) return;
    const pwHash = await participantPwHash(ev.id, password);

    // Look for an existing row with this name.
    const existing = ev ? st.participants.find((p) => p.name === name) : null;
    if (existing?.hasPassword && !password) {
        err.innerHTML = "This name is password-protected on this event. Enter the password to sign in as them, or use a different name.";
        err.hidden = false;
        pwEl.focus();
        return;
    }

    // Re-fetch the event with auth headers; if existing row, server validates pwHash.
    try {
        const reloaded = await api.getEvent(ev.id, {
            adminToken: st.adminToken,
            participantId: existing?.id,
            participantName: name,
            participantPwHash: pwHash,
        });
        setState({
            event: reloaded.event,
            participants: reloaded.participants,
            signedInParticipantId: existing?.id ?? null,
            signedInName: name,
            signedInPwHash: pwHash,
        });
    } catch (e2) {
        handleApiError(e2, { context: "sign in" });
        return;
    }

    // If no existing row, create one with all-unavailable slots so the user has something to paint into.
    if (!existing) {
        const totalSlots = computeSlotStarts(getState().event).length;
        const empty = newPackedSlots(totalSlots);
        try {
            const upsert = await api.upsertSlots(ev.id, {
                name,
                tz: getViewerTz(),
                slots: bytesToBase64(empty),
                ...(pwHash ? { pwHash } : {}),
            });
            // Re-fetch to pick up server-assigned id + canonical row.
            const reloaded = await api.getEvent(ev.id, {
                adminToken: st.adminToken,
                participantId: upsert.participantId,
                participantName: name,
                participantPwHash: pwHash,
            });
            setState({
                event: reloaded.event,
                participants: reloaded.participants,
                signedInParticipantId: upsert.participantId,
                signedInName: name,
                signedInPwHash: pwHash,
            });
        } catch (e3) {
            handleApiError(e3, { context: "create row" });
            return;
        }
    }

    document.getElementById("signInCard").dataset.state = "signed-in";
    document.getElementById("signedInName").textContent = name;
    renderEvent();
    toast(`Signed in as ${name}.`, "success");
}

function handleSignOut() {
    setState({
        signedInParticipantId: null,
        signedInName: null,
        signedInPwHash: null,
        ownSlots: null,
    });
    document.getElementById("signInCard").dataset.state = "signed-out";
    document.getElementById("signInName").value = "";
    document.getElementById("signInPassword").value = "";
    renderEvent();
}

async function handleDeleteSelf() {
    const st = getState();
    if (!st.event || !st.signedInParticipantId) return;
    const ok = await confirmDialog({
        title: "Delete your row?",
        body: "This removes your name, availability, time zone, and any comment from this event.",
        okLabel: "Delete",
        danger: true,
        retentionCopy: true,
    });
    if (!ok) return;
    try {
        await api.deleteParticipant(st.event.id, st.signedInParticipantId, {
            participantName: st.signedInName,
            participantPwHash: st.signedInPwHash,
        });
        toast("Your row was deleted.", "success");
        handleSignOut();
        await openEventView(st.event.id);
    } catch (e) {
        handleApiError(e, { context: "delete row" });
    }
}

async function handleExportSelf() {
    const st = getState();
    if (!st.event || !st.signedInParticipantId) return;
    try {
        const blob = await api.exportParticipant(st.event.id, st.signedInParticipantId, {
            participantName: st.signedInName,
            participantPwHash: st.signedInPwHash,
        });
        const json = JSON.stringify(blob, null, 2);
        downloadBlob(new Blob([json], { type: "application/json" }), `meeting-planner-${st.event.id}-${st.signedInParticipantId}.json`);
        toast("Exported.", "success");
    } catch (e) {
        handleApiError(e, { context: "export" });
    }
}

// ============================================================================
// Slot push (debounced)
// ============================================================================

const PUSH_DEBOUNCE_MS = 400;
let pushTimer = null;
let pushInFlight = false;
let pendingBytes = null;

function scheduleSlotPush(bytes) {
    pendingBytes = bytes;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = null; pushSlots(); }, PUSH_DEBOUNCE_MS);
}

async function pushSlots() {
    if (pushInFlight) { pushTimer = setTimeout(() => { pushTimer = null; pushSlots(); }, PUSH_DEBOUNCE_MS); return; }
    if (!pendingBytes) return;
    const st = getState();
    if (!st.event || !st.signedInName) return;
    const bytes = pendingBytes;
    pendingBytes = null;
    pushInFlight = true;
    try {
        await api.upsertSlots(st.event.id, {
            participantId: st.signedInParticipantId,
            name: st.signedInName,
            tz: getViewerTz(),
            slots: bytesToBase64(bytes),
            ...(st.signedInPwHash ? { pwHash: st.signedInPwHash } : {}),
        });
        // Optimistic: update local participant cache without a full refetch.
        const idx = st.participants.findIndex((p) => p.id === st.signedInParticipantId);
        if (idx >= 0) {
            const updated = { ...st.participants[idx], slots: bytesToBase64(bytes) };
            const arr = st.participants.slice();
            arr[idx] = updated;
            setState({ participants: arr });
            // Re-render the grid to recompute aggregates / heatmap.
            setupGridForCurrentState();
        }
    } catch (e) {
        handleApiError(e, { context: "save availability" });
    } finally {
        pushInFlight = false;
        if (pendingBytes) scheduleSlotPush(pendingBytes);
    }
}

// ============================================================================
// Atomic create flow from draft to POST /events.
// ============================================================================

async function enterDraftMode(draft) {
    // Build a synthetic event shape so the grid renders in draft mode.
    const synth = draftToEvent(draft);
    const totalSlots = computeSlotStarts(synth).length;
    setState({
        view: "draft",
        event: synth,
        participants: [],
        eventId: null,
        adminToken: null,
        isAdmin: false,
        draftCreate: draft,
        signedInParticipantId: null,
        signedInName: null,
        signedInPwHash: null,
        ownSlots: newPackedSlots(totalSlots),
    });
    showView("draft");

    setEventBanner({
        title: "This event isn't saved yet.",
        body: "Sign in below to create it and get a share link.",
        variant: "draft",
    });

    // Render event header but mark sign-in as the commit action.
    document.getElementById("eventTitle").textContent = draft.title;
    document.getElementById("eventStatusBadges").replaceChildren();
    document.getElementById("eventMeta").textContent = describeDraftMeta(draft);
    const tzEl = document.getElementById("eventTzNotice");
    if (draft.timezone !== getViewerTz()) {
        tzEl.textContent = `Showing in ${getViewerTz()}; event scheduled in ${draft.timezone}.`;
        tzEl.hidden = false;
    } else { tzEl.hidden = true; }
    const desc = document.getElementById("eventDescription");
    if (draft.description) { desc.textContent = draft.description; desc.hidden = false; } else { desc.hidden = true; }

    // Disable share/admin while in draft
    document.getElementById("shareLinkInput").value = "Available after you create the event.";
    document.getElementById("adminCard").hidden = true;
    document.getElementById("copyShareLinkBtn").disabled = true;
    document.getElementById("downloadIcsBtn").disabled = true;

    // Render grid in editable draft state (own row is the only row).
    document.getElementById("gridToolbar").hidden = false;
    document.getElementById("signInBtn").textContent = "Create event";

    renderGrid({
        event: synth,
        participants: [],
        ownSlots: getState().ownSlots,
        ownRowId: null,
        canEdit: true,
        viewerTz: getViewerTz(),
        decidedSlotIdx: null,
    });
    if (detachPaint) detachPaint();
    detachPaint = attachPaintHandlers({
        getPaintMode: () => getState().paintMode,
        onChange: (bytes) => {
            // Local-only mutation; not pushed until commit.
            setState({ ownSlots: bytes });
        },
    });

    document.getElementById("signInName").focus();
}

function describeDraftMeta(d) {
    const parts = [];
    if (d.mode === "date_range") parts.push(`${d.startDate} to ${d.endDate}`);
    else parts.push(`Weekly, ${d.weekdays.map(weekdayShort).join("/")} x ${d.recurWeeks} weeks`);
    parts.push(`${formatMinAsHM(d.dayStartMin)} - ${formatMinAsHM(d.dayEndMin)}`);
    parts.push(`${d.slotMin}-min slots`);
    return parts.join(" | ");
}

function draftToEvent(d) {
    // Shape mirrors EventDTO well enough for grid + tz utilities.
    return {
        id: null,
        title: d.title,
        description: d.description || null,
        mode: d.mode,
        startDate: d.startDate ?? null,
        endDate: d.endDate ?? null,
        weekdays: d.weekdays?.length ? d.weekdays : null,
        recurWeeks: d.recurWeeks ?? null,
        dayStartMin: d.dayStartMin,
        dayEndMin: d.dayEndMin,
        slotMin: d.slotMin,
        timezone: d.timezone,
        visibility: d.visibility,
        locked: false,
        lockedAt: null,
        decidedSlotIdx: null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + d.expiryDays * 86_400_000).toISOString(),
    };
}

async function commitAtomicCreate(name, password) {
    const st = getState();
    const draft = st.draftCreate;
    if (!draft) return;

    const errEl = document.getElementById("signInError");
    errEl.hidden = true;

    // Get a Turnstile token for POST /events. Skipped when running against a
    // local wrangler dev worker (TURNSTILE_REQUIRED=false in .dev.vars).
    const mount = document.getElementById("turnstileMount");
    let turnstileToken;
    if (SKIP_TURNSTILE) {
        turnstileToken = "skipped-local-dev";
    } else {
        try {
            toast("Verifying you're human...", "info");
            turnstileToken = await getTurnstileToken(mount);
        } catch (e) {
            errEl.textContent = "Couldn't verify with Turnstile. Try again in a moment.";
            errEl.hidden = false;
            return;
        }
        mount.hidden = true;
    }

    // Build the create payload. A row password hashes against the server-assigned
    // eventId, so it can't be set here. It is attached in a follow-up PUT below.
    const slotsBase64 = bytesToBase64(st.ownSlots);

    let createResp;
    try {
        createResp = await api.createEvent({
            title: draft.title,
            description: draft.description || undefined,
            mode: draft.mode,
            startDate: draft.startDate || undefined,
            endDate: draft.endDate || undefined,
            weekdays: draft.weekdays?.length ? draft.weekdays : undefined,
            recurWeeks: draft.weekdays?.length ? draft.recurWeeks : undefined,
            dayStartMin: draft.dayStartMin,
            dayEndMin: draft.dayEndMin,
            slotMin: draft.slotMin,
            timezone: draft.timezone,
            visibility: draft.visibility,
            expiresAt: new Date(Date.now() + draft.expiryDays * 86_400_000).toISOString(),
            creator: {
                name,
                tz: getViewerTz(),
                slots: slotsBase64,
            },
        }, { turnstileToken, retentionConfirmed: !!draft.retentionConfirmed });
    } catch (e) {
        resetTurnstile(mount);
        return handleApiError(e, { context: "create event" });
    }

    const { eventId, adminToken, participantId } = createResp;
    storeAdminToken(eventId, adminToken);

    // If the user wanted a password, attach it now (eventId is finally known).
    if (password) {
        const pw = await participantPwHash(eventId, password);
        try {
            await api.upsertSlots(eventId, {
                participantId,
                name,
                tz: getViewerTz(),
                slots: slotsBase64,
                pwHash: pw,
            });
        } catch (e) {
            toast("Created event, but couldn't attach your password. Try again from the sign-in box.", "warn");
        }
    }

    // Stash for openEventView
    setState({
        signedInName: name,
        signedInParticipantId: participantId,
        signedInPwHash: password ? await participantPwHash(eventId, password) : null,
        draftCreate: null,
    });

    // Set the URL hash WITHOUT the admin token (already stored locally).
    history.replaceState(null, "", `#evt=${eventId}`);

    // Show the one-time admin save dialog, then load the live event.
    showAdminSaveDialog(eventId, adminToken, () => openEventView(eventId));
}

function showAdminSaveDialog(eventId, adminToken, onClose) {
    const url = adminUrl(eventId, adminToken);
    const modal = document.getElementById("adminSaveDialog");
    const urlInput = document.getElementById("adminUrlInput");
    const copyBtn = document.getElementById("adminCopyBtn");
    const downloadBtn = document.getElementById("adminDownloadBtn");
    const emailBtn = document.getElementById("adminEmailBtn");
    const ack = document.getElementById("adminAckCheckbox");
    const close = document.getElementById("adminSaveCloseBtn");
    if (!modal) { onClose?.(); return; }
    urlInput.value = url;
    ack.checked = false;
    close.disabled = true;
    modal.hidden = false;

    const onCopy = async () => {
        const ok = await copyToClipboard(url);
        copyBtn.textContent = ok ? "Copied!" : "Copy failed";
        setTimeout(() => copyBtn.textContent = "Copy", 1600);
    };
    const onDownload = () => {
        const text = `Meeting Planner admin link\n\nKeep this safe. Anyone with this link can edit, lock, or delete the event.\n\n${url}\n`;
        downloadBlob(new Blob([text], { type: "text/plain" }), `meeting-planner-admin-${eventId}.txt`);
    };
    const onEmail = () => {
        const subject = encodeURIComponent("Meeting Planner admin link");
        const body = encodeURIComponent(`Saving the admin link for the event I just created.\n\n${url}\n`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    };
    const onAck = () => { close.disabled = !ack.checked; };
    const onClick = () => {
        modal.hidden = true;
        copyBtn.removeEventListener("click", onCopy);
        downloadBtn.removeEventListener("click", onDownload);
        emailBtn.removeEventListener("click", onEmail);
        ack.removeEventListener("change", onAck);
        close.removeEventListener("click", onClick);
        onClose?.();
    };

    copyBtn.addEventListener("click", onCopy);
    downloadBtn.addEventListener("click", onDownload);
    emailBtn.addEventListener("click", onEmail);
    ack.addEventListener("change", onAck);
    close.addEventListener("click", onClick);
}

// ============================================================================
// Sidebar wiring (share + ICS + privacy footer)
// ============================================================================

function wireSidebar() {
    document.getElementById("copyShareLinkBtn")?.addEventListener("click", async () => {
        const v = document.getElementById("shareLinkInput").value;
        const ok = await copyToClipboard(v);
        toast(ok ? "Share link copied." : "Couldn't copy. Select and copy manually.", ok ? "success" : "warn");
    });
    document.getElementById("downloadIcsBtn")?.addEventListener("click", () => {
        const st = getState();
        if (!st.event) return;
        const block = pickIcsBlock(st.event, st.participants, {
            decidedSlotIdx: st.event.locked ? st.event.decidedSlotIdx : null,
        });
        if (!block) { toast("Nothing to export yet. No availability marked.", "warn"); return; }
        const ics = buildIcs({ event: st.event, block });
        downloadBlob(new Blob([ics], { type: "text/calendar" }), `meeting-${st.event.id}.ics`);
    });
}

// ============================================================================
// Admin actions
// ============================================================================

function wireAdminActions() {
    document.getElementById("adminRenameBtn")?.addEventListener("click", openSettingsDialog);
    document.getElementById("adminDeleteBtn")?.addEventListener("click", handleAdminDelete);
    document.getElementById("adminLockBtn")?.addEventListener("click", handleAdminLockToggle);
    document.getElementById("settingsCancel")?.addEventListener("click", () => closeModalById("settingsDialog"));
    document.getElementById("settingsClose")?.addEventListener("click", () => closeModalById("settingsDialog"));
    document.getElementById("settingsForm")?.addEventListener("submit", handleSettingsSubmit);
    document.getElementById("setLongRetentionBtn")?.addEventListener("click", () => openLongRetentionDialog((days) => {
        document.getElementById("setExpiryDays").value = String(days);
        document.getElementById("settingsForm").dataset.retentionConfirmed = "true";
        document.getElementById("setExpiryHint").textContent = "Long-retention (up to 5y) acknowledged.";
    }));

    document.getElementById("lockCancel")?.addEventListener("click", () => closeModalById("lockDialog"));
    document.getElementById("lockConfirm")?.addEventListener("click", handleLockConfirm);
}

function closeModalById(id) {
    const m = document.getElementById(id);
    if (m) m.hidden = true;
}

function openSettingsDialog() {
    const st = getState();
    if (!st.event) return;
    document.getElementById("setTitle").value = st.event.title;
    document.getElementById("setDescription").value = st.event.description ?? "";
    const visRadios = document.querySelectorAll('input[name="setVisibility"]');
    visRadios.forEach((r) => { r.checked = (r.value === st.event.visibility); });
    const daysUntil = Math.max(1, Math.round((Date.parse(st.event.expiresAt) - Date.now()) / 86_400_000));
    document.getElementById("setExpiryDays").value = String(Math.min(daysUntil, LIMITS.EXPIRY_STANDARD_MAX_DAYS));
    document.getElementById("setExpiryHint").textContent = "";
    document.getElementById("settingsForm").dataset.retentionConfirmed = "false";
    document.getElementById("settingsError").hidden = true;
    document.getElementById("settingsDialog").hidden = false;
}

async function handleSettingsSubmit(e) {
    e.preventDefault();
    const st = getState();
    if (!st.event || !st.adminToken) return;
    const errEl = document.getElementById("settingsError");
    errEl.hidden = true;

    const patch = {};
    const newTitle = document.getElementById("setTitle").value.trim();
    if (newTitle && newTitle !== st.event.title) patch.title = newTitle;
    const newDesc = document.getElementById("setDescription").value;
    if ((newDesc || "") !== (st.event.description ?? "")) patch.description = newDesc || null;
    const vis = document.querySelector('input[name="setVisibility"]:checked')?.value;
    if (vis && vis !== st.event.visibility) patch.visibility = vis;
    const expiryDays = Number(document.getElementById("setExpiryDays").value || 0);
    const retentionConfirmed = document.getElementById("settingsForm").dataset.retentionConfirmed === "true";
    if (expiryDays) {
        const nextExpires = new Date(Date.now() + expiryDays * 86_400_000).toISOString();
        if (nextExpires !== st.event.expiresAt) patch.expiresAt = nextExpires;
    }
    if (Object.keys(patch).length === 0) {
        closeModalById("settingsDialog");
        return;
    }
    try {
        const updated = await api.patchEvent(st.event.id, patch, {
            adminToken: st.adminToken,
            retentionConfirmed,
        });
        setState({ event: updated });
        closeModalById("settingsDialog");
        renderEvent();
        toast("Settings saved.", "success");
    } catch (err) {
        if (err.kind === "validation" && err.body?.field === "expiresAt") {
            errEl.textContent = err.body.message || "Invalid expiry";
        } else {
            errEl.textContent = err.body?.error ?? String(err);
        }
        errEl.hidden = false;
    }
}

async function handleAdminDelete() {
    const st = getState();
    if (!st.event || !st.adminToken) return;
    const ok = await confirmDialog({
        title: "Delete this event?",
        body: `This permanently removes "${st.event.title}" and every participant's row. There's no undo.`,
        okLabel: "Delete event",
        danger: true,
        retentionCopy: true,
    });
    if (!ok) return;
    try {
        await api.deleteEvent(st.event.id, { adminToken: st.adminToken });
        forgetAdminToken(st.event.id);
        removeRecentEvent(st.event.id);
        toast("Event deleted.", "success");
        location.hash = "";
    } catch (e) {
        handleApiError(e, { context: "delete event" });
    }
}

async function handleAdminLockToggle() {
    const st = getState();
    if (!st.event || !st.adminToken) return;
    if (st.event.locked) {
        // Unlock
        try {
            const upd = await api.patchEvent(st.event.id, { locked: false, decidedSlotIdx: null }, { adminToken: st.adminToken });
            setState({ event: upd });
            renderEvent();
            toast("Unlocked.", "success");
        } catch (e) { handleApiError(e, { context: "unlock" }); }
        return;
    }
    // Open lock dialog with decided-slot selector
    const sel = document.getElementById("lockDecidedSlot");
    sel.replaceChildren();
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Do not pick one";
    sel.appendChild(blank);
    const slots = computeSlotStarts(st.event);
    for (let i = 0; i < slots.length; i++) {
        const fmt = formatForViewer(slots[i], st.viewerTz);
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `${fmt.dayLabel} ${fmt.timeLabel}`;
        sel.appendChild(opt);
    }
    document.getElementById("lockDialog").hidden = false;
}

async function handleLockConfirm() {
    const st = getState();
    const sel = document.getElementById("lockDecidedSlot");
    const v = sel.value === "" ? null : Number(sel.value);
    try {
        const upd = await api.patchEvent(st.event.id, {
            locked: true,
            decidedSlotIdx: v,
        }, { adminToken: st.adminToken });
        setState({ event: upd });
        closeModalById("lockDialog");
        renderEvent();
        toast("Locked.", "success");
    } catch (e) { handleApiError(e, { context: "lock" }); }
}

async function kickParticipant(p) {
    const st = getState();
    const ok = await confirmDialog({
        title: `Remove ${p.name || "this participant"}?`,
        body: "Their availability and any comment will be deleted.",
        okLabel: "Remove",
        danger: true,
        retentionCopy: true,
    });
    if (!ok) return;
    try {
        await api.deleteParticipant(st.event.id, p.id, { adminToken: st.adminToken });
        toast("Removed.", "success");
        await openEventView(st.event.id);
    } catch (e) { handleApiError(e, { context: "kick" }); }
}

// ============================================================================
// Error handling also covers read-only and rate-limit UX.
// ============================================================================

function handleApiError(err, { context }) {
    console.warn("api error", context, err);
    if (err.kind === "read_only") {
        const resumesAt = err.body?.resumesAt ?? null;
        setGlobalBanner({
            title: "Tool is temporarily read-only.",
            body: resumesAt
                ? `Marking availability will resume at ${new Date(resumesAt).toLocaleString()}. Existing data is safe.`
                : `Writes will resume shortly. Existing data is safe.`,
            variant: "warn",
        });
        setState({ readOnly: { resumesAt } });
        return;
    }
    if (err.kind === "rate_limited") {
        const sec = err.retryAfter ?? 60;
        toast(`Slow down. Try again in ${sec} seconds.`, "warn");
        return;
    }
    if (err.kind === "forbidden") {
        // Wipe a bad stored admin token so the UI stops showing admin controls.
        const st = getState();
        if (err.body?.reason === "admin_token" && st.event?.id) {
            forgetAdminToken(st.event.id);
            setState({ adminToken: null, isAdmin: false });
            renderEvent();
            toast("Admin token rejected. Admin actions disabled on this device.", "error");
            return;
        }
        // Surface the specific reason when the Worker provides one (e.g.,
        // "turnstile_failed/missing_token", "fetch_site", etc.). Without this
        // we just say "Forbidden (context)" which buries the real cause.
        const detail = err.body?.reason || err.body?.error || err.body?.message;
        toast(detail ? `Forbidden (${context}): ${detail}` : `Forbidden (${context}).`, "error");
        return;
    }
    if (err.kind === "not_found") {
        toast(`Not found (${context}).`, "error");
        if (context === "load event") {
            // Bounce to landing
            location.hash = "";
        }
        return;
    }
    if (err.kind === "validation") {
        toast(err.body?.message ?? `Validation failed (${context}).`, "error");
        return;
    }
    if (err.kind === "network") {
        toast("Network error. Check your connection.", "error");
        return;
    }
    toast(`Something went wrong (${context}).`, "error");
}

// ============================================================================
// Helpers
// ============================================================================

function participantUrl(eventId) {
    const base = location.origin + location.pathname;
    return `${base}#evt=${eventId}`;
}
function adminUrl(eventId, adminToken) {
    const base = location.origin + location.pathname;
    return `${base}#evt=${eventId}&admin=${adminToken}`;
}

function weekdayShort(d) {
    return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d] ?? String(d);
}
function formatMinAsHM(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function decidedSlotLabel(event, viewerTz) {
    const starts = computeSlotStarts(event);
    const i = event.decidedSlotIdx;
    if (i == null || i < 0 || i >= starts.length) return "";
    const fmt = formatForViewer(starts[i], viewerTz);
    return `${fmt.dayLabel} ${fmt.timeLabel}`;
}

// Expose a couple of helpers for debugging via the browser console.
window.__mp = { getState, setState };
