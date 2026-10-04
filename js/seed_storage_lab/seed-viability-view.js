// Rendering for the Ellis-Roberts result: four cards, a table with one row
// per published determination, and an inline SVG survival curve with the
// Monte Carlo band behind each line.

import { DAYS_PER_YEAR, defaultHorizonDays, sampleSurvivalCurve } from "./seed-viability-engine.js";
import { SEED_REFERENCES } from "./seed-source-map.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CHART = Object.freeze({ width: 640, height: 300, left: 52, right: 16, top: 14, bottom: 42 });
const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;

const nf = (value, digits = 0) => Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
});

// Days, months or years, whichever reads naturally at this size.
function durationUnit(days) {
    if (days < 90) return { label: "days", divisor: 1, digits: 0 };
    if (days < 2 * DAYS_PER_YEAR) return { label: "months", divisor: DAYS_PER_MONTH, digits: 0 };
    return { label: "y", divisor: DAYS_PER_YEAR, digits: days < 20 * DAYS_PER_YEAR ? 1 : 0 };
}

export function formatDuration(days) {
    if (!Number.isFinite(days)) return "--";
    if (days <= 0) return "0 days";
    const unit = durationUnit(days);
    return `${nf(days / unit.divisor, unit.digits)} ${unit.label}`;
}

// A range shares one unit, picked from its upper end, so it reads "5-8 y".
export function formatDurationSpan(span) {
    if (!span || !Number.isFinite(span.low) || !Number.isFinite(span.high)) return "--";
    if (span.high <= 0) return "0 days";
    const unit = durationUnit(span.high);
    const low = nf(span.low / unit.divisor, unit.digits);
    const high = nf(span.high / unit.divisor, unit.digits);
    return low === high ? `${high} ${unit.label}` : `${low}-${high} ${unit.label}`;
}

function setCard(dom, valueId, metaId, value, meta, blocked = false) {
    if (dom[valueId]) dom[valueId].textContent = value;
    if (dom[metaId]) dom[metaId].textContent = meta;
    const card = dom[valueId] ? dom[valueId].closest(".result-card") : null;
    if (card) card.classList.toggle("is-blocked", Boolean(blocked));
}

function referenceLabel(entry) {
    const reference = SEED_REFERENCES[entry.sourceKey];
    const base = reference ? reference.label : (entry.sourceKey || "Unknown source");
    return entry.reference ? `${base}, citing ${entry.reference}` : base;
}

function renderCards(dom, viability, gate) {
    const ids = [["viabilityValue", "viabilityMeta"], ["halfLifeValue", "halfLifeMeta"], ["sigmaValue", "sigmaMeta"]];

    if (!viability || !viability.ok) {
        const reason = viability ? viability.reason : "no-constants";
        const [value, meta, blocked] = reason === "gated"
            ? ["Not modeled", gate ? gate.headline : "The species gate refuses this seed.", true]
            : reason === "not-applicable"
                ? ["Outside the equation", viability.detail, true]
                : ["--", "No published viability constants are held for this species, so the equation cannot run. "
                    + "The thumb-rule projection above is all this tool can offer.", false];
        for (const [valueId, metaId] of ids) setCard(dom, valueId, metaId, value, meta, blocked);
        return;
    }

    const applied = viability.applied;
    const several = viability.usableCount > 1;
    const spread = several
        ? ` ${viability.usableCount} published determinations, shown as a range because they differ by `
            + `${viability.ratio.toFixed(1)}×. The tool does not average them.`
        : " One published determination.";
    const admitted = viability.admittedByConstants
        ? " No storage-behavior record is held, but these constants were fitted from dry-storage experiments on this species."
        : "";

    setCard(dom, "viabilityValue", "viabilityMeta",
        formatDurationSpan(viability.daysToTarget),
        `Germination falling from ${nf(applied.initialViabilityPct, 1)}% to ${nf(applied.targetViabilityPct, 1)}% at `
        + `${nf(applied.temperatureC, 1)} °C and ${nf(applied.moisturePct, 1)}% moisture, sealed airtight.${spread}${admitted}`);
    setCard(dom, "halfLifeValue", "halfLifeMeta",
        formatDurationSpan(viability.daysToHalf),
        "Until half the seed no longer germinates.");
    setCard(dom, "sigmaValue", "sigmaMeta",
        formatDurationSpan(viability.sigmaDays),
        "Time to lose one probit, for example from 84% down to 50%.");
}

function renderMonteCarloCard(dom, viability, monteCarlo) {
    if (!viability || !viability.ok) {
        setCard(dom, "monteCarloValue", "monteCarloMeta", "--", "Runs when the viability equation does.");
        return;
    }
    if (!monteCarlo || !monteCarlo.ok) {
        setCard(dom, "monteCarloValue", "monteCarloMeta", "--",
            "Every draw fell outside the equation. Narrow the moisture or temperature spread.", true);
        return;
    }
    const several = monteCarlo.usableCount > 1
        ? ` Lowest P10 to highest P90 across ${monteCarlo.usableCount} determinations; each is banded separately on the chart.`
        : "";
    // The refused draws are the wettest, so leaving them out lengthens the range.
    const refused = monteCarlo.refusedDraws
        ? ` ${monteCarlo.refusedDraws} draws fell outside the equation and are left out, so the range is longer than it should be.`
        : "";
    setCard(dom, "monteCarloValue", "monteCarloMeta",
        formatDurationSpan(monteCarlo.daysToTarget),
        `8 in 10 of ${nf(monteCarlo.draws)} draws over your stated uncertainty land in this range. `
        + `Median ${formatDurationSpan(monteCarlo.medianDaysToTarget)}.${several}${refused}`);
}

function renderTable(dom, viability, monteCarlo) {
    const body = dom.viabilityTableBody;
    if (!body) return;
    body.textContent = "";
    const rows = (viability && viability.determinations) || [];
    if (!rows.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.className = "wrap";
        cell.textContent = "No published viability constants are held for this species.";
        row.appendChild(cell);
        body.appendChild(row);
        return;
    }

    // Limit notes get a full-width row of their own under the numbers.
    const addNoteRow = (messages) => {
        const row = document.createElement("tr");
        row.className = "viability-notes";
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.className = "wrap";
        for (const message of messages) {
            const note = document.createElement("span");
            note.className = "row-note";
            note.textContent = message;
            cell.appendChild(note);
        }
        row.appendChild(cell);
        body.appendChild(row);
    };

    rows.forEach((entry, index) => {
        const row = document.createElement("tr");
        row.className = "viability-row";
        const add = (text, className) => {
            const cell = document.createElement("td");
            if (className) cell.className = className;
            cell.textContent = text;
            row.appendChild(cell);
            return cell;
        };

        const source = add(referenceLabel(entry), "wrap");
        const swatch = document.createElement("span");
        swatch.className = `viability-swatch series-${index % 4}`;
        swatch.setAttribute("aria-hidden", "true");
        source.prepend(swatch);

        const set = entry.constants;
        add(set ? `${set.KE} / ${set.CW} / ${set.CH} / ${set.CQ}` : "--", "wrap");
        add(entry.ok ? formatDuration(entry.sigmaDays) : "--");
        add(entry.ok ? formatDuration(entry.daysToTarget) : "--");
        const band = monteCarlo && monteCarlo.ok ? monteCarlo.determinations[index] : null;
        add(band && band.usable ? formatDurationSpan({ low: band.daysToTarget.p10, high: band.daysToTarget.p90 }) : "--");
        add(entry.ok ? formatDuration(entry.daysToHalf) : "--");
        body.appendChild(row);

        if (!entry.ok) addNoteRow([entry.reason || "Not applicable."]);
        else if (entry.flags.length) addNoteRow(entry.flags.map((item) => item.message));
    });
}

function svg(name, attributes = {}, text = null) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text !== null) node.textContent = text;
    return node;
}

function niceStep(span, target) {
    const raw = span / target;
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    const scaled = raw / power;
    return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}

function renderChart(dom, viability, monteCarlo) {
    const host = dom.viabilityChart;
    if (!host) return;
    host.textContent = "";
    const usable = ((viability && viability.ok && viability.determinations) || []).filter((entry) => entry.ok);
    if (!usable.length) {
        host.hidden = true;
        return;
    }
    host.hidden = false;

    const bands = monteCarlo && monteCarlo.ok;
    const horizon = bands ? monteCarlo.horizonDays : Math.max(...usable.map(defaultHorizonDays));
    const unit = durationUnit(horizon);
    const plotW = CHART.width - CHART.left - CHART.right;
    const plotH = CHART.height - CHART.top - CHART.bottom;
    const x = (days) => CHART.left + (days / horizon) * plotW;
    const y = (percent) => CHART.top + (1 - percent / 100) * plotH;

    const target = viability.applied.targetViabilityPct;
    const root = svg("svg", {
        viewBox: `0 0 ${CHART.width} ${CHART.height}`,
        role: "img",
        "aria-label": `Predicted germination against storage time. Germination reaches ${nf(target, 0)}% after `
            + `${formatDurationSpan(viability.daysToTarget)} and 50% after ${formatDurationSpan(viability.daysToHalf)}.`
            + (bands ? ` Shaded bands hold 8 in 10 draws; with your uncertainty, ${nf(target, 0)}% is reached after ${formatDurationSpan(monteCarlo.daysToTarget)}.` : "")
    });

    for (const percent of [0, 25, 50, 75, 100]) {
        root.appendChild(svg("line", { class: "viability-grid", x1: CHART.left, x2: CHART.left + plotW, y1: y(percent), y2: y(percent) }));
        root.appendChild(svg("text", { class: "viability-tick", x: CHART.left - 8, y: y(percent) + 4, "text-anchor": "end" }, `${percent}%`));
    }

    const span = horizon / unit.divisor;
    const step = niceStep(span, 6);
    for (let tick = 0; tick <= span + 1e-9; tick += step) {
        const px = x(tick * unit.divisor);
        root.appendChild(svg("line", { class: "viability-grid", x1: px, x2: px, y1: CHART.top, y2: CHART.top + plotH }));
        root.appendChild(svg("text", { class: "viability-tick", x: px, y: CHART.top + plotH + 16, "text-anchor": "middle" },
            nf(tick, step < 1 ? 1 : 0)));
    }
    root.appendChild(svg("text", { class: "viability-axis", x: CHART.left + plotW / 2, y: CHART.height - 6, "text-anchor": "middle" },
        `Time in sealed storage (${unit.label === "y" ? "years" : unit.label})`));

    root.appendChild(svg("line", { class: "viability-target", x1: CHART.left, x2: CHART.left + plotW, y1: y(target), y2: y(target) }));
    root.appendChild(svg("text", { class: "viability-tick", x: CHART.left + plotW - 4, y: y(target) - 5, "text-anchor": "end" },
        `your floor, ${nf(target, 0)}%`));

    // P10 to P90 band behind each line, from the same draws for every series.
    if (bands) {
        monteCarlo.determinations.forEach((entry, index) => {
            if (!entry.usable) return;
            const upper = entry.band.map((point) => `${x(point.days).toFixed(1)},${y(point.p90).toFixed(1)}`);
            const lower = entry.band.slice().reverse().map((point) => `${x(point.days).toFixed(1)},${y(point.p10).toFixed(1)}`);
            root.appendChild(svg("polygon", { class: `viability-band series-${index % 4}`, points: [...upper, ...lower].join(" ") }));
        });
    }

    // Series are told apart by dash pattern as well as color.
    usable.forEach((entry) => {
        const index = viability.determinations.indexOf(entry);
        const points = sampleSurvivalCurve(entry, { points: 80, horizonDays: horizon })
            .map((point) => `${x(point.days).toFixed(1)},${y(point.percent).toFixed(1)}`)
            .join(" ");
        root.appendChild(svg("polyline", { class: `viability-line series-${index % 4}`, points }));
    });

    host.appendChild(root);
}

/** Flag messages from every determination, each one once. */
export function viabilityWarnings(viability) {
    if (!viability || !viability.ok) return [];
    const seen = new Set();
    const items = [];
    for (const entry of viability.determinations) {
        for (const item of entry.flags || []) {
            if (seen.has(item.message)) continue;
            seen.add(item.message);
            items.push({ text: item.message, kind: "clamp" });
        }
    }
    if (viability.beyondEvidence) {
        items.push({
            text: `The viability equation puts half-life at ${formatDurationSpan(viability.daysToHalf)}. `
                + "No seed lot in storage has been followed for anywhere near that long. "
                + "Read it as \"longer than you will ever need\".",
            kind: "warn"
        });
    }
    return items;
}

export function renderViability(dom, model) {
    renderCards(dom, model.viability, model.gate);
    renderMonteCarloCard(dom, model.viability, model.monteCarlo);
    renderTable(dom, model.viability, model.monteCarlo);
    renderChart(dom, model.viability, model.monteCarlo);
}
