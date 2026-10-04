// Rendering for the storage tier model: two result cards, the oxygen chart,
// and the tier notes for the warning list.

import { AIR_OXYGEN_PCT, DAYS_PER_YEAR, LETTUCE_UPTAKE, OXYGEN_LIMITS, sampleOxygenCurve } from "./seed-storage-tiers.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CHART = Object.freeze({ width: 640, height: 260, left: 52, right: 16, top: 14, bottom: 42 });

export const TIER_LABELS = Object.freeze({
    open: "Open packet",
    "leaky-closure": "Sealed for moisture only",
    hermetic: "Sealed jar",
    "desiccant-only": "Sealed with desiccant",
    "absorber-only": "Absorber without desiccant",
    "absorber-desiccant": "Absorber and desiccant",
    "foil-vacuum": "Vacuum foil bag"
});

const nf = (value, digits = 0) => Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
});

function setCard(dom, valueId, metaId, value, meta, blocked = false) {
    if (dom[valueId]) dom[valueId].textContent = value;
    if (dom[metaId]) dom[metaId].textContent = meta;
    const card = dom[valueId] ? dom[valueId].closest(".result-card") : null;
    if (card) card.classList.toggle("is-blocked", Boolean(blocked));
}

function formatDays(days) {
    if (!Number.isFinite(days)) return "--";
    if (days < 90) return `${nf(days, 0)} days`;
    if (days < 2 * DAYS_PER_YEAR) return `${nf(days / (DAYS_PER_YEAR / 12), 0)} months`;
    return `${nf(days / DAYS_PER_YEAR, 1)} years`;
}

const SOURCE_TEXT = Object.freeze({
    air: "with the air it was sealed with",
    vacuum: "after the vacuum",
    absorber: "after the absorber"
});

function renderCards(dom, storage) {
    if (!storage) return;
    const summary = storage.blocked
        ? "Stopped. The first warning below says why."
        : `${storage.containerLabel}. ${storage.holdsMoisture ? "Holds the seed's moisture." : "Seed moisture follows the room."} `
          + `${storage.holdsOxygen ? "Holds its oxygen level." : "Lets oxygen in."}`;
    setCard(dom, "containerValue", "containerMeta", TIER_LABELS[storage.tier] || storage.tier, summary, storage.blocked);

    const oxygen = storage.oxygen;
    let meta;
    if (oxygen.regime === "void") {
        meta = storage.holdsOxygen
            ? "No oxygen benefit while the seed is too wet or the absorber can raise the humidity."
            : "Open to the air, so oxygen stays at 20.9%.";
    } else if (oxygen.startPct >= AIR_OXYGEN_PCT) {
        meta = "Starts with air. The seed draws it down over time, but that is not credited.";
    } else {
        meta = `Starting at ${nf(oxygen.startPct, 1)}% oxygen ${SOURCE_TEXT[oxygen.source] || ""}. `
            + "Raises only the upper end of the projected storage life.";
    }
    setCard(dom, "oxygenValue", "oxygenMeta", `${nf(oxygen.multiplier, 2)}×`, meta);
}

function svg(name, attributes = {}, text = null) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text !== null) node.textContent = text;
    return node;
}

function renderChart(dom, storage) {
    const host = dom.oxygenChart;
    if (!host) return;
    host.textContent = "";
    if (!storage || !storage.ok) {
        host.hidden = true;
        return;
    }
    host.hidden = false;

    const years = Math.max(1, Math.min(storage.horizonYears || 5, 30));
    const horizonDays = years * DAYS_PER_YEAR;
    const plotW = CHART.width - CHART.left - CHART.right;
    const plotH = CHART.height - CHART.top - CHART.bottom;
    const x = (days) => CHART.left + (days / horizonDays) * plotW;
    const y = (pct) => CHART.top + (1 - pct / 25) * plotH;

    const decay = storage.decay;
    const label = decay
        ? `Oxygen in the container falls from ${nf(storage.oxygen.startPct, 1)}% to half that in ${formatDays(decay.daysToHalf)}.`
        : `Oxygen in the container stays at ${nf(storage.oxygen.startPct, 1)}%.`;
    const root = svg("svg", { viewBox: `0 0 ${CHART.width} ${CHART.height}`, role: "img", "aria-label": label });

    for (const pct of [0, 5, 10, 15, 20, 25]) {
        root.appendChild(svg("line", { class: "viability-grid", x1: CHART.left, x2: CHART.left + plotW, y1: y(pct), y2: y(pct) }));
        root.appendChild(svg("text", { class: "viability-tick", x: CHART.left - 8, y: y(pct) + 4, "text-anchor": "end" }, `${pct}%`));
    }
    const step = years <= 6 ? 1 : years <= 15 ? 2 : 5;
    for (let tick = 0; tick <= years + 1e-9; tick += step) {
        const px = x(tick * DAYS_PER_YEAR);
        root.appendChild(svg("line", { class: "viability-grid", x1: px, x2: px, y1: CHART.top, y2: CHART.top + plotH }));
        root.appendChild(svg("text", { class: "viability-tick", x: px, y: CHART.top + plotH + 16, "text-anchor": "middle" }, nf(tick)));
    }
    root.appendChild(svg("text", { class: "viability-axis", x: CHART.left + plotW / 2, y: CHART.height - 6, "text-anchor": "middle" },
        "Years in storage"));

    root.appendChild(svg("line", { class: "viability-target", x1: CHART.left, x2: CHART.left + plotW,
        y1: y(OXYGEN_LIMITS.floorPct), y2: y(OXYGEN_LIMITS.floorPct) }));
    root.appendChild(svg("text", { class: "viability-tick", x: CHART.left + 6, y: y(OXYGEN_LIMITS.floorPct) - 5, "text-anchor": "start" },
        "1%, lowest level modeled"));

    if (decay) {
        const measured = x(Math.min(LETTUCE_UPTAKE.observedDays, horizonDays));
        root.appendChild(svg("line", { class: "oxygen-measured", x1: measured, x2: measured, y1: CHART.top, y2: CHART.top + plotH }));
        root.appendChild(svg("text", { class: "viability-tick", x: measured + 4, y: CHART.top + 12 }, "measured to here"));
    }

    const points = sampleOxygenCurve(storage, { horizonDays })
        .map((point) => `${x(point.days).toFixed(1)},${y(Math.min(point.oxygenPct, 25)).toFixed(1)}`)
        .join(" ");
    root.appendChild(svg("polyline", { class: "viability-line series-0", points }));
    host.appendChild(root);
}

function noDecayReason(storage) {
    if (!storage || !storage.holdsOxygen) return "this container does not hold its oxygen level.";
    if (storage.oxygen.source === "absorber") return "the absorber sets the oxygen level.";
    if (storage.container === "foil") return "the gas left in a sealed bag is not known.";
    if (!storage.headspace) return "enter the container volume and seed weight to draw it.";
    if (storage.headspace.gasMl <= 0) return "the seed as entered does not fit the container.";
    return "the oxygen is already at the 1% floor.";
}

function renderDecayNote(dom, storage) {
    if (!dom.oxygenDecayNote) return;
    const decay = storage && storage.decay;
    if (!decay) {
        dom.oxygenDecayNote.textContent = `No decay is drawn: ${noDecayReason(storage)}`;
        return;
    }
    const volume = decay.assumedVolume
        ? ` Seed volume taken as ${nf(storage.headspace.seedVolumeMl, 0)} mL from lettuce's 1.8 mL per gram; enter your own for a different seed.`
        : "";
    dom.oxygenDecayNote.textContent = `${nf(storage.headspace.gasMl, 0)} mL of gas around the seed. `
        + `Oxygen halves in ${formatDays(decay.daysToHalf)} and reaches 1% in ${formatDays(decay.daysToFloor)}.${volume}`;
}

/** Tier notes for the warning list, blocking ones first. */
export function storageWarnings(storage) {
    if (!storage) return [];
    const order = { block: 0, warn: 1, info: 2 };
    return storage.notes
        .slice()
        .sort((a, b) => order[a.level] - order[b.level])
        .map((item) => ({ text: item.text, kind: item.level === "block" ? "block" : item.level === "warn" ? "warn" : "clamp" }));
}

export function renderStorageTier(dom, model) {
    renderCards(dom, model.storage);
    renderChart(dom, model.storage);
    renderDecayNote(dom, model.storage);
}
