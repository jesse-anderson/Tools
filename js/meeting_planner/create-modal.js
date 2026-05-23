// Create-event modal: Quick + Advanced tabs, weekday picker, long-retention
// confirmation, client-side validation matching the Worker's caps.
//
// This module never POSTs. It produces a "draft" object that the entry script
// hands to the atomic-create flow once the user signs in.

import { LIMITS } from "./config.js";
import { getViewerTz, listCommonTimezones } from "./tz.js";

const DEFAULTS = {
    title: "",
    mode: "date_range",
    startDate: null,
    endDate: null,
    weekdays: [],
    recurWeeks: 4,
    dayStartMin: 9 * 60,
    dayEndMin: 18 * 60,
    slotMin: 30,
    timezone: null,
    visibility: "public",
    expiryDays: LIMITS.EXPIRY_DEFAULT_DAYS,
    description: "",
    retentionConfirmed: false,
};

let onSubmitted = null;

/** Wire up the create modal. Returns { open(), close() }. */
export function initCreateModal({ onDraft }) {
    onSubmitted = onDraft;
    const modal = document.getElementById("createModal");
    if (!modal) return { open() {}, close() {} };

    const tabs = modal.querySelectorAll(".modal-tab");
    const advancedBlocks = modal.querySelectorAll(".advanced-only");
    const dateRangeBlocks = modal.querySelectorAll('[data-only-mode="date_range"]');
    const weeklyBlocks = modal.querySelectorAll('[data-only-mode="weekly"]');

    const form = document.getElementById("createForm");
    const titleInput = document.getElementById("cfTitle");
    const startDate = document.getElementById("cfStartDate");
    const endDate = document.getElementById("cfEndDate");
    const dayStart = document.getElementById("cfDayStart");
    const dayEnd = document.getElementById("cfDayEnd");
    const tzSelect = document.getElementById("cfTimezone");
    const expiryDays = document.getElementById("cfExpiryDays");
    const description = document.getElementById("cfDescription");
    const errorEl = document.getElementById("cfError");
    const slotWarn = document.getElementById("cfSlotWarn");
    const longRetentionBtn = document.getElementById("cfLongRetentionBtn");
    const longRetentionMsg = document.getElementById("cfRetentionConfirmed");
    const recurWeeks = document.getElementById("cfRecurWeeks");
    const weekdayChips = modal.querySelectorAll(".weekday-chip");
    const cancelBtn = document.getElementById("createModalCancel");
    const closeBtn = document.getElementById("createModalClose");

    let state = { ...DEFAULTS, timezone: getViewerTz() };

    // Populate TZ select once.
    if (tzSelect && tzSelect.options.length === 0) {
        for (const tz of listCommonTimezones()) {
            const opt = document.createElement("option");
            opt.value = tz;
            opt.textContent = tz;
            tzSelect.appendChild(opt);
        }
        tzSelect.value = state.timezone;
    }

    // Default date range: today to today+6 in viewer-local YYYY-MM-DD.
    const today = new Date();
    const wkAhead = new Date(today.getTime() + 6 * 86_400_000);
    startDate.value = ymd(today);
    endDate.value = ymd(wkAhead);
    state.startDate = startDate.value;
    state.endDate = endDate.value;

    // Tab switching
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.toggle("active", t === tab));
            tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
            const advanced = tab.dataset.tab === "advanced";
            advancedBlocks.forEach((b) => { b.hidden = !advanced; });
        });
    });

    // Mode toggle (advanced)
    form.addEventListener("change", (e) => {
        if (e.target.name === "mode") {
            state.mode = e.target.value;
            applyModeVisibility();
        }
        if (e.target.name === "slotMin") {
            state.slotMin = Number(e.target.value);
            if (slotWarn) slotWarn.hidden = !(state.slotMin === 15 && isPhoneish());
        }
        if (e.target.name === "visibility") {
            state.visibility = e.target.value;
        }
        if (e.target.name === "timezone") {
            state.timezone = e.target.value;
        }
    });

    function applyModeVisibility() {
        const isRange = state.mode === "date_range";
        dateRangeBlocks.forEach((b) => { b.hidden = !isRange; });
        weeklyBlocks.forEach((b) => { b.hidden = isRange; });
    }
    applyModeVisibility();

    // Weekday chips (advanced/weekly mode)
    weekdayChips.forEach((chip) => {
        chip.addEventListener("click", () => {
            const day = Number(chip.dataset.day);
            const idx = state.weekdays.indexOf(day);
            if (idx >= 0) state.weekdays.splice(idx, 1);
            else state.weekdays.push(day);
            chip.classList.toggle("active");
        });
    });

    // Long-retention dialog flow
    longRetentionBtn?.addEventListener("click", () => openLongRetentionDialog((days) => {
        if (days) {
            state.expiryDays = days;
            state.retentionConfirmed = true;
            expiryDays.value = String(days);
            longRetentionMsg.hidden = false;
        }
    }));

    // Close handlers
    cancelBtn.addEventListener("click", close);
    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    // Submit
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const draft = buildDraftFromForm({
            state, titleInput, startDate, endDate, dayStart, dayEnd,
            tzSelect, expiryDays, description, recurWeeks,
        });
        if (draft.error) {
            errorEl.textContent = draft.error;
            errorEl.hidden = false;
            return;
        }
        errorEl.hidden = true;
        modal.hidden = true;
        if (onSubmitted) onSubmitted(draft.value);
    });

    function open() {
        // Reset transient state but keep last picks.
        errorEl.hidden = true;
        modal.hidden = false;
        titleInput.focus();
    }
    function close() {
        modal.hidden = true;
    }
    return { open, close };
}

// ============================================================================
// Long-retention dialog
// ============================================================================

export function openLongRetentionDialog(onConfirm) {
    const modal = document.getElementById("longRetentionDialog");
    const input = document.getElementById("longRetentionConfirmInput");
    const ok = document.getElementById("longRetentionConfirm");
    const cancel = document.getElementById("longRetentionCancel");
    if (!modal) return;
    input.value = "";
    ok.disabled = true;
    modal.hidden = false;
    input.focus();

    const onInput = () => { ok.disabled = input.value.trim().toLowerCase() !== "5y"; };
    const close = (confirmed) => {
        modal.hidden = true;
        input.removeEventListener("input", onInput);
        ok.removeEventListener("click", onOk);
        cancel.removeEventListener("click", onCancel);
        if (confirmed) onConfirm(LIMITS.EXPIRY_LONG_MAX_DAYS);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    input.addEventListener("input", onInput);
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
}

// ============================================================================
// Build draft from form state
// ============================================================================

function buildDraftFromForm({ state, titleInput, startDate, endDate, dayStart, dayEnd, tzSelect, expiryDays, description, recurWeeks }) {
    const v = { ...state };
    v.title = titleInput.value.trim();
    if (!v.title) return { error: "Title is required." };
    if (v.title.length > LIMITS.TITLE_MAX) return { error: `Title is too long (max ${LIMITS.TITLE_MAX}).` };

    v.timezone = tzSelect.value || v.timezone || getViewerTz();
    v.dayStartMin = parseHM(dayStart.value);
    v.dayEndMin = parseHM(dayEnd.value);
    if (v.dayEndMin <= v.dayStartMin) return { error: "Day end must be after day start." };
    if (v.dayStartMin % v.slotMin !== 0 || v.dayEndMin % v.slotMin !== 0) {
        return { error: `Day hours must be multiples of the slot length (${v.slotMin} min).` };
    }

    if (v.mode === "date_range") {
        v.startDate = startDate.value;
        v.endDate = endDate.value;
        if (!v.startDate || !v.endDate) return { error: "Pick a start and end date." };
        const span = Math.round((Date.parse(v.endDate + "T00:00:00Z") - Date.parse(v.startDate + "T00:00:00Z")) / 86_400_000);
        if (span < 0) return { error: "End date must be on or after start date." };
        if (span > LIMITS.DATE_RANGE_DAYS_MAX) return { error: `Date range cannot exceed ${LIMITS.DATE_RANGE_DAYS_MAX} days.` };
    } else {
        v.weekdays = state.weekdays.slice().sort((a, b) => a - b);
        if (v.weekdays.length === 0) return { error: "Pick at least one weekday." };
        v.recurWeeks = Number(recurWeeks.value || 1);
        if (!Number.isInteger(v.recurWeeks) || v.recurWeeks < 1 || v.recurWeeks > LIMITS.RECUR_WEEKS_MAX) {
            return { error: `Recurrence must be 1..${LIMITS.RECUR_WEEKS_MAX} weeks.` };
        }
    }

    const expiry = Number(expiryDays.value || LIMITS.EXPIRY_DEFAULT_DAYS);
    if (!Number.isInteger(expiry) || expiry < 1 || expiry > LIMITS.EXPIRY_LONG_MAX_DAYS) {
        return { error: `Expiry must be 1..${LIMITS.EXPIRY_LONG_MAX_DAYS} days.` };
    }
    if (expiry > LIMITS.EXPIRY_STANDARD_MAX_DAYS && !v.retentionConfirmed) {
        return { error: `Expiry over ${LIMITS.EXPIRY_STANDARD_MAX_DAYS} days requires the long-retention confirmation.` };
    }
    v.expiryDays = expiry;

    v.description = description.value.trim();
    if (v.description.length > LIMITS.DESCRIPTION_MAX) return { error: `Description too long.` };

    // Total slot count check
    const slotsPerDay = Math.ceil((v.dayEndMin - v.dayStartMin) / v.slotMin);
    const days = v.mode === "date_range"
        ? Math.round((Date.parse(v.endDate + "T00:00:00Z") - Date.parse(v.startDate + "T00:00:00Z")) / 86_400_000) + 1
        : v.weekdays.length * v.recurWeeks;
    const totalSlots = slotsPerDay * days;
    if (totalSlots > LIMITS.SLOT_COUNT_MAX) {
        return { error: `This event would have ${totalSlots} slots. Max is ${LIMITS.SLOT_COUNT_MAX}. Use coarser slots or a smaller range.` };
    }

    return { value: v };
}

function parseHM(hm) {
    const [h, m] = (hm || "00:00").split(":").map(Number);
    return (h * 60 + (m || 0)) | 0;
}

function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}

function isPhoneish() {
    return matchMedia("(max-width: 600px)").matches;
}
