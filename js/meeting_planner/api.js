// Thin fetch wrapper around the Meeting Planner Worker.
// All endpoints, all headers, all error normalization live here. The rest of
// the app should not see Response objects.

import { WORKER_BASE_URL, RETENTION_CONFIRM_HEADER, RETENTION_CONFIRM_VALUE } from "./config.js";

/**
 * Wraps non-2xx responses as structured errors so callers can branch on type
 * without re-parsing JSON. Network failures become `{ kind: "network" }`.
 */
export class ApiError extends Error {
    constructor(kind, { status, body, retryAfter } = {}) {
        super(`${kind}${body?.error ? ": " + body.error : ""}`);
        this.kind = kind;          // "validation" | "rate_limited" | "forbidden" | "not_found" | "read_only" | "server" | "network"
        this.status = status ?? 0;
        this.body = body ?? null;
        this.retryAfter = retryAfter ?? null;
    }
}

function classifyStatus(status, body) {
    if (status === 429) return "rate_limited";
    if (status === 503 && body?.readOnly) return "read_only";
    if (status === 403) return "forbidden";
    if (status === 404) return "not_found";
    if (status === 413) return "validation";
    if (status >= 400 && status < 500) return "validation";
    if (status >= 500) return "server";
    return "server";
}

async function request(path, { method = "GET", body, headers, retentionConfirmed = false } = {}) {
    const url = `${WORKER_BASE_URL}${path}`;
    const reqHeaders = {
        "Accept": "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(headers ?? {}),
    };
    if (retentionConfirmed) reqHeaders[RETENTION_CONFIRM_HEADER] = RETENTION_CONFIRM_VALUE;

    let resp;
    try {
        resp = await fetch(url, {
            method,
            headers: reqHeaders,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            credentials: "omit",
            mode: "cors",
        });
    } catch (err) {
        throw new ApiError("network", { status: 0, body: { error: String(err?.message ?? err) } });
    }
    const raw = await resp.text();
    let data = null;
    if (raw) {
        try { data = JSON.parse(raw); } catch { data = { error: "bad_response", raw }; }
    }
    if (!resp.ok) {
        const retryAfterHeader = resp.headers.get("Retry-After");
        const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : (data?.retryAfter ?? null);
        throw new ApiError(classifyStatus(resp.status, data), {
            status: resp.status,
            body: data,
            retryAfter,
        });
    }
    return data;
}

// ============================================================================
// Endpoints
// ============================================================================

/** POST /events */
export function createEvent(payload, { turnstileToken, retentionConfirmed } = {}) {
    return request("/events", {
        method: "POST",
        body: payload,
        headers: turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {},
        retentionConfirmed,
    });
}

/** GET /events/:id, optionally authenticating as a participant for visibility unlock. */
export function getEvent(eventId, { adminToken, participantId, participantName, participantPwHash } = {}) {
    const headers = {};
    if (adminToken) headers["X-Admin-Token"] = adminToken;
    if (participantName) headers["X-Participant-Name"] = encodeURIComponent(participantName);
    if (participantPwHash) headers["X-Participant-Pw-Hash"] = participantPwHash;
    const qs = participantId ? `?pid=${encodeURIComponent(participantId)}` : "";
    return request(`/events/${encodeURIComponent(eventId)}${qs}`, { headers });
}

/** PUT /events/:id/admin */
export function patchEvent(eventId, patch, { adminToken, retentionConfirmed } = {}) {
    return request(`/events/${encodeURIComponent(eventId)}/admin`, {
        method: "PUT",
        body: patch,
        headers: { "X-Admin-Token": adminToken },
        retentionConfirmed,
    });
}

/** DELETE /events/:id */
export function deleteEvent(eventId, { adminToken } = {}) {
    return request(`/events/${encodeURIComponent(eventId)}`, {
        method: "DELETE",
        headers: { "X-Admin-Token": adminToken },
    });
}

/** PUT /events/:id/slots: upsert one participant's row. */
export function upsertSlots(eventId, body) {
    return request(`/events/${encodeURIComponent(eventId)}/slots`, {
        method: "PUT",
        body,
    });
}

/** DELETE /events/:id/slots/:pid */
export function deleteParticipant(eventId, participantId, { adminToken, participantName, participantPwHash } = {}) {
    const headers = {};
    if (adminToken) headers["X-Admin-Token"] = adminToken;
    if (participantName) headers["X-Participant-Name"] = encodeURIComponent(participantName);
    if (participantPwHash) headers["X-Participant-Pw-Hash"] = participantPwHash;
    return request(`/events/${encodeURIComponent(eventId)}/slots/${encodeURIComponent(participantId)}`, {
        method: "DELETE",
        headers,
    });
}

/** GET /events/:id/slots/:pid/export */
export function exportParticipant(eventId, participantId, { adminToken, participantName, participantPwHash } = {}) {
    const headers = {};
    if (adminToken) headers["X-Admin-Token"] = adminToken;
    if (participantName) headers["X-Participant-Name"] = encodeURIComponent(participantName);
    if (participantPwHash) headers["X-Participant-Pw-Hash"] = participantPwHash;
    return request(`/events/${encodeURIComponent(eventId)}/slots/${encodeURIComponent(participantId)}/export`, {
        headers,
    });
}
