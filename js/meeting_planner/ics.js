// iCalendar export. Generates a single VEVENT for the highest-weighted
// contiguous block (or, when the event is locked with a decided slot, that
// slot alone). Weighting:
//
//   weight = available_count + 0.5 x preferred_count
//
// Contiguous block: greedy expansion from the peak slot while the weighted
// count stays within 1.0 of peak.

import { computeSlotStarts } from "./tz.js";
import { getSlot, SLOT_AVAILABLE, SLOT_PREFERRED } from "./bytes.js";

// Re-decode helper (the participants in the payload have base64 slots).
function decodeAll(participants) {
    return participants.map((p) => {
        const bin = atob(p.slots);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { p, bytes };
    });
}

function slotWeight(decoded, slotIdx) {
    let av = 0, pref = 0;
    for (const { bytes } of decoded) {
        const v = getSlot(bytes, slotIdx);
        if (v === SLOT_AVAILABLE) av++;
        else if (v === SLOT_PREFERRED) pref++;
    }
    return { weight: av + 0.5 * pref, avail: av + pref, preferred: pref };
}

/** Find the peak slot and expand contiguously while weight stays within 1.0. */
export function pickIcsBlock(event, participants, opts = {}) {
    const slotStarts = computeSlotStarts(event);
    if (slotStarts.length === 0) return null;
    const slotsPerDay = Math.ceil((event.dayEndMin - event.dayStartMin) / event.slotMin);
    const decoded = decodeAll(participants);

    // Locked + decided slot path: ICS exports the decided slot only.
    if (opts.decidedSlotIdx != null) {
        const i = opts.decidedSlotIdx;
        if (i < 0 || i >= slotStarts.length) return null;
        const w = slotWeight(decoded, i);
        return {
            start: slotStarts[i],
            end: new Date(slotStarts[i].getTime() + event.slotMin * 60_000),
            weight: w.weight, avail: w.avail, preferred: w.preferred,
            decided: true,
        };
    }

    // Find peak weight.
    let peak = -1, peakW = 0;
    for (let i = 0; i < slotStarts.length; i++) {
        const { weight } = slotWeight(decoded, i);
        if (weight > peakW) { peakW = weight; peak = i; }
    }
    if (peak < 0) return null;

    // Greedy expansion. Stay within the same event day (don't bridge a day
    // boundary in the contiguous block; cross-day meetings aren't useful).
    const dayOfPeak = Math.floor(peak / slotsPerDay);
    let lo = peak, hi = peak;
    while (lo - 1 >= dayOfPeak * slotsPerDay) {
        const w = slotWeight(decoded, lo - 1).weight;
        if (peakW - w > 1.0 + 1e-9) break;
        lo--;
    }
    while (hi + 1 < (dayOfPeak + 1) * slotsPerDay) {
        const w = slotWeight(decoded, hi + 1).weight;
        if (peakW - w > 1.0 + 1e-9) break;
        hi++;
    }
    const start = slotStarts[lo];
    const end = new Date(slotStarts[hi].getTime() + event.slotMin * 60_000);
    const peakStats = slotWeight(decoded, peak);
    return {
        start, end,
        weight: peakStats.weight,
        avail: peakStats.avail,
        preferred: peakStats.preferred,
        decided: false,
    };
}

/** Format a Date as iCalendar UTC time: YYYYMMDDTHHMMSSZ. */
function icsTimeUtc(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** Escape iCalendar text per RFC 5545 section 3.3.11. */
function icsEscape(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** 75-octet line folding per RFC 5545 section 3.1. */
function foldLines(lines) {
    const out = [];
    for (const line of lines) {
        if (line.length <= 75) { out.push(line); continue; }
        let i = 0;
        while (i < line.length) {
            const chunk = line.slice(i, i + 75);
            out.push(i === 0 ? chunk : ` ${chunk}`);
            i += 75;
        }
    }
    return out;
}

/** Build a single-VEVENT iCalendar file. Returns a string. */
export function buildIcs({ event, block }) {
    const uid = `mp-${event.id}-${block.start.toISOString()}@meeting-planner.jesse-anderson.net`;
    const dtstamp = icsTimeUtc(new Date());
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//jesse-anderson.net//Meeting Planner//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${icsTimeUtc(block.start)}`,
        `DTEND:${icsTimeUtc(block.end)}`,
        `SUMMARY:${icsEscape(event.title)}`,
        `DESCRIPTION:${icsEscape(buildDescription(event, block))}`,
        "END:VEVENT",
        "END:VCALENDAR",
    ];
    return foldLines(lines).join("\r\n") + "\r\n";
}

function buildDescription(event, block) {
    const parts = [];
    if (block.decided) {
        parts.push("Decided slot for this meeting.");
    } else {
        parts.push(`Top availability block: ${block.avail} available${block.preferred ? `, ${block.preferred} preferred` : ""}.`);
    }
    if (event.description) parts.push(event.description);
    parts.push(`Event TZ: ${event.timezone}`);
    return parts.join("\n");
}
