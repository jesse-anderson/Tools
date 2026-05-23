// Build-time configuration. Swap WORKER_BASE_URL for a different backend
// without touching the rest of the code.

export const WORKER_BASE_URL = "https://scheduler.jesse-anderson.net";

// Always send a Turnstile token in production. The widget renders inline in
// the sign-in card during draft mode and resolves before the POST /events.
export const SKIP_TURNSTILE = false;

/*
 * --------------------------------------------------------------------------
 * DEV-ONLY: local-worker mode (commented out for production)
 * --------------------------------------------------------------------------
 * To work against a local `wrangler dev` worker (e.g. for the Playwright
 * smoke spec or hand-driven dev), replace the two exports above with the
 * block below. Pair with:
 *   - Run the worker locally:
 *       cd Meeting_Planner_Worker && npx wrangler dev --ip 127.0.0.1 --port 8787
 *   - Worker `.dev.vars` should set TURNSTILE_REQUIRED=false and add the
 *     local page origin (e.g. http://127.0.0.1:4173) to ALLOWED_ORIGINS.
 *   - Re-enable http://localhost:8787 and http://127.0.0.1:8787 in the
 *     meeting-planner.html CSP `connect-src` directive.
 *
 * function resolveWorkerBaseUrl() {
 *     if (typeof location === "undefined") return "https://scheduler.jesse-anderson.net";
 *     const host = location.hostname;
 *     if (host === "127.0.0.1" || host === "localhost") {
 *         return `${location.protocol}//${host}:8787`;
 *     }
 *     return "https://scheduler.jesse-anderson.net";
 * }
 * export const WORKER_BASE_URL = resolveWorkerBaseUrl();
 * export const SKIP_TURNSTILE = (typeof location !== "undefined")
 *     && (location.hostname === "127.0.0.1" || location.hostname === "localhost");
 */


// Public Turnstile site key. Paired with the TURNSTILE_SECRET stored on the
// Worker via `wrangler secret put`.
// Reference: https://developers.cloudflare.com/turnstile/
export const TURNSTILE_SITE_KEY = "0x4AAAAAADTQ_MUhqywGS4Sy";

// Limits mirrored from the Worker for client-side validation.
// Keep these in sync if the server values change.
export const LIMITS = Object.freeze({
    TITLE_MAX: 200,
    DESCRIPTION_MAX: 2000,
    NAME_MAX: 80,
    COMMENT_MAX: 500,
    PASSWORD_MAX: 200,
    DATE_RANGE_DAYS_MAX: 730,
    RECUR_WEEKS_MAX: 104,
    SLOT_COUNT_MAX: 10_000,
    PARTICIPANTS_HARD_CAP: 100,
    PARTICIPANTS_SOFT_CAP: 50,
    PARTICIPANTS_WARN_AT: 30,
    EXPIRY_DEFAULT_DAYS: 90,
    EXPIRY_STANDARD_MAX_DAYS: 730,
    EXPIRY_LONG_MAX_DAYS: 365 * 5,
});

// Header constants, paired with the Worker's validate.ts.
export const RETENTION_CONFIRM_HEADER = "X-Retention-Confirmed";
export const RETENTION_CONFIRM_VALUE = "5y";

// Storage keys
export const LS_KEYS = Object.freeze({
    RECENT: "mp.recentEvents",
    ADMIN_PREFIX: "mp.admin.",      // suffix is eventId
});
