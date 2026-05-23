// Local state store. The whole app reads from a single object and subscribes
// to changes via a tiny pub/sub. State is intentionally flat to keep the
// render loop simple.

import { LS_KEYS } from "./config.js";

const listeners = new Set();

const state = {
    view: "loading",            // "landing" | "event" | "draft" | "loading"
    eventId: null,              // server eventId (null in draft mode)
    adminToken: null,           // raw admin token in URL or recalled from localStorage
    isAdmin: false,
    event: null,                // EventDTO from server (or draft data in draft mode)
    participants: [],           // ParticipantDTO[] from server
    slotStarts: [],             // Date[], computed once per event payload
    viewerTz: null,
    signedInParticipantId: null,
    signedInName: null,
    signedInPwHash: null,       // string|null
    ownSlots: null,             // Uint8Array, the signed-in user's own bitfield (mutable while editing)
    draftCreate: null,          // create-modal output staged for atomic create
    paintMode: "available",     // "available" | "preferred" | "erase"
    readOnly: null,             // { resumesAt: string|null } | null
    lastError: null,
};

export function getState() {
    return state;
}

/** Patch state shallowly and notify subscribers. */
export function setState(patch) {
    Object.assign(state, patch);
    for (const fn of listeners) {
        try { fn(state); } catch (err) { console.error("state subscriber threw", err); }
    }
}

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

// ============================================================================
// localStorage helpers
// ============================================================================

/** Read the persisted recent-events list. Always returns an array. */
export function readRecentEvents() {
    try {
        const raw = localStorage.getItem(LS_KEYS.RECENT);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Record an event in the recent list. Newest first; capped at 20 entries. */
export function recordRecentEvent({ eventId, title, mode, startDate, endDate, isAdmin }) {
    const list = readRecentEvents().filter((e) => e.eventId !== eventId);
    list.unshift({
        eventId,
        title,
        mode,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        isAdmin: !!isAdmin,
        lastSeenAt: new Date().toISOString(),
    });
    while (list.length > 20) list.pop();
    try { localStorage.setItem(LS_KEYS.RECENT, JSON.stringify(list)); } catch { /* quota */ }
}

/** Remove an entry from the recent-events list. */
export function removeRecentEvent(eventId) {
    const list = readRecentEvents().filter((e) => e.eventId !== eventId);
    try { localStorage.setItem(LS_KEYS.RECENT, JSON.stringify(list)); } catch { /* */ }
}

/** Stash an admin token for the event on this browser. */
export function storeAdminToken(eventId, token) {
    try { localStorage.setItem(LS_KEYS.ADMIN_PREFIX + eventId, token); } catch { /* */ }
}

export function loadAdminToken(eventId) {
    try { return localStorage.getItem(LS_KEYS.ADMIN_PREFIX + eventId); } catch { return null; }
}

export function forgetAdminToken(eventId) {
    try { localStorage.removeItem(LS_KEYS.ADMIN_PREFIX + eventId); } catch { /* */ }
}
