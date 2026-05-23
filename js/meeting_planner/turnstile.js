// Loads the Cloudflare Turnstile widget on demand and yields a token.

import { TURNSTILE_SITE_KEY } from "./config.js";

let scriptLoading = null;

function loadScript() {
    if (scriptLoading) return scriptLoading;
    scriptLoading = new Promise((resolve, reject) => {
        if (window.turnstile) { resolve(window.turnstile); return; }
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.defer = true;
        s.onload = () => {
            if (window.turnstile) resolve(window.turnstile);
            else reject(new Error("turnstile not present after script load"));
        };
        s.onerror = () => reject(new Error("turnstile script failed to load"));
        document.head.appendChild(s);
    });
    return scriptLoading;
}

/**
 * Render the widget into `mountEl` and resolve with a token when the user
 * (or the always-passes test key) completes the challenge.
 * Rejects if Turnstile fails or expires before a token is produced.
 */
export async function getTurnstileToken(mountEl) {
    const turnstile = await loadScript();
    mountEl.replaceChildren();
    mountEl.hidden = false;
    return new Promise((resolve, reject) => {
        let resolved = false;
        const widgetId = turnstile.render(mountEl, {
            sitekey: TURNSTILE_SITE_KEY,
            theme: "auto",
            callback: (token) => { resolved = true; resolve(token); },
            "error-callback": () => { if (!resolved) reject(new Error("turnstile error")); },
            "expired-callback": () => { if (!resolved) reject(new Error("turnstile expired")); },
        });
        // Stash widget id on the element so the caller can reset later if needed.
        mountEl.dataset.tsWidget = widgetId;
    });
}

/** Reset / re-issue the widget so a new token can be requested. */
export function resetTurnstile(mountEl) {
    if (!window.turnstile || !mountEl?.dataset.tsWidget) return;
    try { window.turnstile.reset(mountEl.dataset.tsWidget); } catch { /* ignore */ }
}
