// Tiny UI helpers: toasts, modal show/hide, banners.

const TOAST_DURATION_MS = 4200;

/** Show a transient toast in the bottom-right. variant: "info" | "success" | "warn" | "error". */
export function toast(message, variant = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const el = document.createElement("div");
    el.className = `toast ${variant}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
        el.classList.remove("show");
        setTimeout(() => el.remove(), 220);
    }, TOAST_DURATION_MS);
}

/** Render a banner in #eventBanner. Pass null to hide. */
export function setEventBanner(arg, opts = {}) {
    const el = document.getElementById("eventBanner");
    if (!el) return;
    const { title, body, variant = "info" } = arg ?? {};
    if (opts.hide || (!title && !body)) {
        el.hidden = true;
        el.className = "event-banner";
        el.replaceChildren();
        return;
    }
    el.className = `event-banner ${variant}`;
    el.hidden = false;
    el.replaceChildren();
    if (title) {
        const t = document.createElement("strong");
        t.textContent = title;
        el.appendChild(t);
    }
    if (body) {
        const b = document.createElement("span");
        b.textContent = " " + body;
        el.appendChild(b);
    }
}

/** Render the global banner above main. */
export function setGlobalBanner(arg, opts = {}) {
    const el = document.getElementById("globalBanner");
    if (!el) return;
    const { title, body, variant = "info" } = arg ?? {};
    if (opts.hide || (!title && !body)) {
        el.hidden = true;
        el.className = "global-banner";
        el.replaceChildren();
        return;
    }
    el.className = `global-banner ${variant}`;
    el.hidden = false;
    el.replaceChildren();
    if (title) {
        const t = document.createElement("strong");
        t.textContent = title;
        el.appendChild(t);
    }
    if (body) {
        const b = document.createElement("span");
        b.textContent = " " + body;
        el.appendChild(b);
    }
}

/** Show or hide a modal-overlay element. */
export function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.hidden = false;
}
export function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.hidden = true;
}

/**
 * Generic confirm dialog. Returns a Promise that resolves true on confirm,
 * false on cancel.
 */
export function confirmDialog({ title, body, okLabel = "Confirm", danger = false, retentionCopy = false }) {
    return new Promise((resolve) => {
        const titleEl = document.getElementById("confirmTitle");
        const bodyEl = document.getElementById("confirmBody");
        const retEl = document.getElementById("confirmRetentionCopy");
        const cancelBtn = document.getElementById("confirmCancel");
        const okBtn = document.getElementById("confirmOk");
        const modal = document.getElementById("confirmDialog");
        if (!modal) { resolve(false); return; }
        titleEl.textContent = title ?? "Are you sure?";
        bodyEl.textContent = body ?? "";
        retEl.hidden = !retentionCopy;
        okBtn.textContent = okLabel;
        okBtn.classList.toggle("danger", !!danger);
        okBtn.classList.toggle("primary", !danger);
        modal.hidden = false;

        const close = (val) => {
            modal.hidden = true;
            okBtn.removeEventListener("click", onOk);
            cancelBtn.removeEventListener("click", onCancel);
            modal.removeEventListener("click", onBackdrop);
            document.removeEventListener("keydown", onKey);
            resolve(val);
        };
        const onOk = () => close(true);
        const onCancel = () => close(false);
        const onBackdrop = (e) => { if (e.target === modal) close(false); };
        const onKey = (e) => { if (e.key === "Escape") close(false); };
        okBtn.addEventListener("click", onOk);
        cancelBtn.addEventListener("click", onCancel);
        modal.addEventListener("click", onBackdrop);
        document.addEventListener("keydown", onKey);
    });
}

/** Copy a string to clipboard; falls back to a hidden textarea on older browsers. */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            return true;
        } catch {
            return false;
        }
    }
}

/** Trigger a client-side download of a Blob. */
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
