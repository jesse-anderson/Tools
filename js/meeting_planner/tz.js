// Time-zone helpers. The grid is rendered in the viewer's local zone but slot
// indices are canonical against the event's timezone.
//
// The hard problem: convert "calendar date D in event TZ + dayStartMin minutes
// + slotIndex x slotMin" to a UTC Date that round-trips through DST correctly.
// We use Intl.DateTimeFormat to discover the UTC offset of a given local
// wall-clock instant inside an IANA zone, then apply that offset.

const MIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MIN_MS;

/**
 * Given an IANA zone and a UTC Date, return the wall-clock parts that zone
 * shows for that instant. Used as a building block; not exported.
 */
function partsInZone(date, tz) {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = fmt.formatToParts(date);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    let hour = get("hour");
    // Intl returns 24 in some runtimes for midnight; normalize.
    if (hour === 24) hour = 0;
    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        hour,
        minute: get("minute"),
        second: get("second"),
    };
}

/**
 * Convert a wall-clock moment in `tz` to a UTC Date. Implementation: take the
 * naive UTC of those parts, then iteratively correct using the discovered
 * offset in `tz`. Two passes handle DST transitions cleanly.
 */
export function zonedWallTimeToUtc(tz, year, month, day, hour, minute) {
    // Initial guess: pretend the wall-time IS UTC.
    let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    for (let i = 0; i < 2; i++) {
        const p = partsInZone(new Date(utcMs), tz);
        const seenUtcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
        const wantedUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
        const drift = seenUtcMs - wantedUtcMs;
        if (drift === 0) break;
        utcMs -= drift;
    }
    return new Date(utcMs);
}

/**
 * Compute the canonical slot list for an event. Returns one Date (UTC) per slot
 * representing the start of that slot, in canonical order.
 *
 * Modes:
 *  - date_range: every day from startDate to endDate (inclusive), each with
 *    slotsPerDay slots starting at dayStartMin in the event TZ.
 *  - weekly: for each of recurWeeks weeks (week 0 = the calendar week of
 *    `today`'s anchor in the event TZ), iterate `weekdays` (0..6, Sun-based),
 *    each day with slotsPerDay slots.
 *
 * The arrangement is column-major (day, then slot-of-day) so the on-disk slot
 * indices match the column-then-row visual reading order. Importantly the
 * Worker enforces nothing about ordering. It just stores the bytes. The
 * client decides.
 */
export function computeSlotStarts(event) {
    const slotsPerDay = Math.ceil((event.dayEndMin - event.dayStartMin) / event.slotMin);
    const out = [];
    if (event.mode === "date_range") {
        // Iterate calendar dates in the event TZ.
        const [sy, sm, sd] = event.startDate.split("-").map(Number);
        const [ey, em, ed] = event.endDate.split("-").map(Number);
        // Convert start/end midnight in event TZ to UTC and step a day at a time.
        let dayUtc = zonedWallTimeToUtc(event.timezone, sy, sm, sd, 0, 0).getTime();
        const endUtc = zonedWallTimeToUtc(event.timezone, ey, em, ed, 0, 0).getTime();
        // Use a safety counter to avoid runaway loops on bad input.
        let safety = LIMITS_SAFETY_DAYS;
        while (dayUtc <= endUtc && safety-- > 0) {
            const p = partsInZone(new Date(dayUtc), event.timezone);
            for (let s = 0; s < slotsPerDay; s++) {
                const mins = event.dayStartMin + s * event.slotMin;
                const hour = Math.floor(mins / 60);
                const minute = mins % 60;
                const utc = zonedWallTimeToUtc(event.timezone, p.year, p.month, p.day, hour, minute);
                out.push(utc);
            }
            // Step by 25 hours then normalize back to local midnight to survive DST jumps.
            const stepDate = new Date(dayUtc + DAY_MS + 60 * MIN_MS);
            const sp = partsInZone(stepDate, event.timezone);
            dayUtc = zonedWallTimeToUtc(event.timezone, sp.year, sp.month, sp.day, 0, 0).getTime();
        }
    } else {
        // weekly
        // Anchor week 0 to today's Sunday (in event TZ).
        const todayParts = partsInZone(new Date(), event.timezone);
        const todayUtc = zonedWallTimeToUtc(event.timezone, todayParts.year, todayParts.month, todayParts.day, 0, 0);
        const todayWeekday = (new Date(todayUtc)).getUTCDay(); // 0..6 Sun..Sat in the *event* local sense, since the UTC of midnight-in-event-TZ has the same weekday
        const sundayUtcMs = todayUtc.getTime() - todayWeekday * DAY_MS;
        for (let w = 0; w < event.recurWeeks; w++) {
            for (const wd of event.weekdays) {
                const baseUtc = sundayUtcMs + (w * 7 + wd) * DAY_MS;
                const p = partsInZone(new Date(baseUtc + 12 * 60 * MIN_MS), event.timezone); // noon to be safe across DST
                for (let s = 0; s < slotsPerDay; s++) {
                    const mins = event.dayStartMin + s * event.slotMin;
                    const hour = Math.floor(mins / 60);
                    const minute = mins % 60;
                    const utc = zonedWallTimeToUtc(event.timezone, p.year, p.month, p.day, hour, minute);
                    out.push(utc);
                }
            }
        }
    }
    return out;
}

// Hard upper bound mirrors LIMITS.SLOT_COUNT_MAX / slotsPerDay; defensive guard.
const LIMITS_SAFETY_DAYS = 3000;

/**
 * Format a Date in `viewerTz` for grid headers. Returns { dayKey, dayLabel, timeLabel }.
 *   dayKey   - "YYYY-MM-DD" in viewer tz
 *   dayLabel - e.g. "Wed, Jun 3"
 *   timeLabel - e.g. "9:00 AM"
 */
export function formatForViewer(date, viewerTz) {
    const p = partsInZone(date, viewerTz);
    const dayKey = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    const dayLabel = new Intl.DateTimeFormat(undefined, {
        timeZone: viewerTz,
        weekday: "short",
        month: "short",
        day: "numeric",
    }).format(date);
    const timeLabel = new Intl.DateTimeFormat(undefined, {
        timeZone: viewerTz,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(date);
    return { dayKey, dayLabel, timeLabel };
}

/** Format a date in two zones for the comparison banner. */
export function formatRangeInZone(date, tz, opts = {}) {
    return new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        weekday: opts.weekday ?? "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(date);
}

/** Viewer's IANA zone, with a safe fallback. */
export function getViewerTz() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
}

/** A short, sorted list of common IANA zones for the picker. Always includes the viewer's zone first. */
export function listCommonTimezones() {
    let all;
    try {
        all = Intl.supportedValuesOf?.("timeZone");
    } catch {
        all = null;
    }
    if (!all || !all.length) {
        // Conservative fallback list.
        all = [
            "UTC",
            "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
            "America/Anchorage", "Pacific/Honolulu",
            "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Amsterdam",
            "Europe/Madrid", "Europe/Rome", "Europe/Helsinki", "Europe/Moscow",
            "Africa/Cairo", "Africa/Johannesburg",
            "Asia/Dubai", "Asia/Kolkata", "Asia/Karachi", "Asia/Singapore",
            "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai", "Asia/Hong_Kong",
            "Australia/Sydney", "Australia/Perth",
            "Pacific/Auckland",
        ];
    }
    const viewer = getViewerTz();
    const set = new Set(all);
    set.delete(viewer);
    return [viewer, ...Array.from(set).sort()];
}
