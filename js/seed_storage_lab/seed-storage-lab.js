// Seed Storage Lab UI wiring: species search, unit handling, rendering, the
// math modal, and browser persistence. All numbers come from seed-model.js;
// this file formats them and nothing more.

import {
    DEFAULT_BASELINE,
    GRAMS_PER_OZ,
    HARRINGTON_LIMITS,
    cToF,
    fToC,
    runSeedModel,
    searchSpecies,
    getSpeciesById,
    speciesDisplayName,
    speciesWithCountsInGenus
} from "./seed-model.js";
import { SEED_REFERENCES } from "./seed-source-map.js";
import { SEED_EQUATION_SPECS, getSeedEquationSources, runSeedEquationTest, runAllSeedEquationTests } from "./seed-math.js";
import { evaluateSeedChecks, summariseSeedChecks } from "./seed-validation.js";

const STORAGE_KEY = "seed-storage-lab-settings-v1";

const INPUT_IDS = [
    "speciesSearch",
    "measuredSeedCount", "measuredSampleMass", "measuredSampleMassUnit",
    "packetMass", "packetMassUnit",
    "baselineTemperature", "baselineTemperatureUnit", "baselineMoisture",
    "storageTemperature", "storageTemperatureUnit", "storageMoisture",
    "storageRelativeHumidity"
];

const OUTPUT_IDS = [
    "countPerOzValue", "countPerOzMeta",
    "countPerLbValue", "countPerLbMeta",
    "packetSeedsValue", "packetSeedsMeta",
    "tswValue", "tswMeta",
    "longevityValue", "longevityMeta",
    "multiplierValue", "multiplierMeta",
    "moistureFactorValue", "moistureFactorMeta",
    "temperatureFactorValue", "temperatureFactorMeta",
    "hundredRuleValue", "hundredRuleMeta",
    "behaviourValue", "behaviourMeta",
    "germinationValue", "germinationMeta",
    "coverageValue", "coverageMeta"
];

const OTHER_IDS = [
    "speciesResults", "gateBanner", "gateHeadline", "gateDetail",
    "countsTableBody", "warningList", "sourcesTableBody",
    "checksCard", "checksSummary", "checksBody",
    "statusLine", "settingsStatus", "resetBtn",
    "showMathBtn", "mathModal", "mathModalClose", "mathModalRunAll",
    "mathModalBody", "mathModalStatus"
];

const INPUT_HELP_TEXT = Object.freeze({
    speciesSearch: "Type a common name (lettuce, oak, sweet corn) or a scientific name. Matching is on whole words, so \"pine\" does not return every Lupinus.",
    measuredSeedCount: "How many seeds you physically counted. Counting error is roughly 1/n, so 100 seeds gives about 1% error and 10 seeds gives about 10%.",
    measuredSampleMass: "What those counted seeds weigh. Most kitchen scales resolve to 0.1-1 g, which dominates the result below about 0.1 g of seed.",
    measuredSampleMassUnit: "Unit for the sample weight. Grams give the best resolution on a domestic scale.",
    packetMass: "Weight of the packet or lot you want a seed count for. Uses your measured count when you supply one, otherwise the published range.",
    packetMassUnit: "Unit for the packet weight.",
    baselineTemperature: `Temperature the published longevity figure is assumed to describe. Published tables say "cool, dry" without defining it, so it is pinned here at ${DEFAULT_BASELINE.temperatureC} °C and left editable.`,
    baselineTemperatureUnit: "Unit for the baseline temperature. Harrington's rule is stated in Fahrenheit intervals; the tool converts for you.",
    baselineMoisture: `Seed moisture content the published figure is assumed to describe, pinned at ${DEFAULT_BASELINE.moisturePct}%. Every multiplier is relative to this, so changing it moves every projection.`,
    storageTemperature: `Your actual storage temperature. Harrington's rule is only valid from ${HARRINGTON_LIMITS.temperatureMinC} to ${HARRINGTON_LIMITS.temperatureMaxC} °C; colder inputs are clamped and reported.`,
    storageTemperatureUnit: "Unit for your storage temperature.",
    storageMoisture: `Water as a percentage of seed weight. Relative humidity is a separate input below. Valid from ${HARRINGTON_LIMITS.moistureMinPct} to ${HARRINGTON_LIMITS.moistureMaxPct}%; below that the relationship inverts for some species.`,
    storageRelativeHumidity: "Humidity of the air around the seed. Used only by the Hundred Rule indicator, which is a separate heuristic from Harrington's moisture rule."
});

const RESULT_HELP_TEXT = Object.freeze({
    countPerOzValue: "Seeds per ounce. A range means the sources disagree, and the tool shows the full spread with each source cited in the Count tab.",
    countPerLbValue: "Seeds per pound, the same figure on a larger basis. Useful for field seeding rates.",
    packetSeedsValue: "Estimated seeds in your packet. Uses your measured count if you entered one, otherwise the published range.",
    tswValue: "Thousand-seed weight, the standard agronomic measure. Computed from your counted sample, or read from the thousand-seed-weight dataset where available.",
    longevityValue: "Published storage life multiplied by the Harrington factor for your conditions. A projection from thumb-rules. Run a germination test to learn the true state of a seed lot.",
    multiplierValue: "How much longer seed keeps at your conditions than at the baseline. The product of the moisture and temperature factors.",
    moistureFactorValue: "2 raised to the drop in moisture content. Each percentage point drier roughly doubles storage life.",
    temperatureFactorValue: "2 raised to the temperature drop divided by 10 °F. Each 10 °F cooler roughly doubles storage life.",
    hundredRuleValue: "Storage temperature in °F plus relative humidity in percent. Under 100 is the seed-saving rule of thumb. It screens conditions; it does not predict years.",
    behaviourValue: "Whether the species tolerates drying and cold. Orthodox seed can be stored dry; recalcitrant seed dies on drying and is refused by the model.",
    germinationValue: "Optimum germination temperature and expected days, where the source supplies them. Use these for the germination test, not for storage.",
    coverageValue: "Which categories of data this tool holds for the selected species. Absence means no source in the dataset covers it, not that the value is zero."
});

const PRESETS = Object.freeze({
    pantry: { storageTemperature: 21, storageTemperatureUnit: "C", storageMoisture: 10, storageRelativeHumidity: 55 },
    basement: { storageTemperature: 13, storageTemperatureUnit: "C", storageMoisture: 8, storageRelativeHumidity: 45 },
    fridge: { storageTemperature: 5, storageTemperatureUnit: "C", storageMoisture: 6, storageRelativeHumidity: 30 },
    freezer: { storageTemperature: -18, storageTemperatureUnit: "C", storageMoisture: 5, storageRelativeHumidity: 20 }
});

const dom = {};
let selectedSpeciesId = "lactuca-sativa";
let recomputeHandle = null;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const nf = (value, digits = 0) => Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
});

function formatCount(value) {
    if (!Number.isFinite(value)) return "--";
    if (value >= 1000) return nf(Math.round(value));
    if (value >= 10) return nf(value, 0);
    return nf(value, 1);
}

function formatSpan(span, formatter = formatCount) {
    if (!span) return "--";
    if (Math.abs(span.high - span.low) < 1e-9) return formatter(span.low);
    return `${formatter(span.low)}-${formatter(span.high)}`;
}

function formatYears(value) {
    if (!Number.isFinite(value)) return "--";
    if (value >= 10000) return `${nf(Math.round(value))}`;
    if (value >= 100) return nf(Math.round(value));
    if (value >= 10) return nf(value, 0);
    return nf(value, 1);
}

function formatMultiplier(value) {
    if (!Number.isFinite(value)) return "--";
    if (value >= 1000) return `${nf(Math.round(value))}×`;
    if (value >= 10) return `${nf(value, 0)}×`;
    return `${nf(value, 2)}×`;
}

// ---------------------------------------------------------------------------
// Input reading
// ---------------------------------------------------------------------------

function numberOrNull(element) {
    if (!element) return null;
    const raw = element.value;
    if (raw === "" || raw === null || raw === undefined) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

function temperatureC(valueElement, unitElement) {
    const value = numberOrNull(valueElement);
    if (value === null) return null;
    return (unitElement && unitElement.value === "F") ? fToC(value) : value;
}

function readInputs() {
    return {
        speciesId: selectedSpeciesId,
        baselineTemperatureC: temperatureC(dom.baselineTemperature, dom.baselineTemperatureUnit),
        baselineMoisturePct: numberOrNull(dom.baselineMoisture),
        storageTemperatureC: temperatureC(dom.storageTemperature, dom.storageTemperatureUnit),
        storageMoisturePct: numberOrNull(dom.storageMoisture),
        storageRelativeHumidityPct: numberOrNull(dom.storageRelativeHumidity),
        measuredSeedCount: numberOrNull(dom.measuredSeedCount),
        measuredSampleMass: numberOrNull(dom.measuredSampleMass),
        measuredSampleMassUnit: dom.measuredSampleMassUnit ? dom.measuredSampleMassUnit.value : "g",
        packetMass: numberOrNull(dom.packetMass),
        packetMassUnit: dom.packetMassUnit ? dom.packetMassUnit.value : "g"
    };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function setCard(valueId, metaId, value, meta, blocked = false) {
    if (dom[valueId]) dom[valueId].textContent = value;
    if (dom[metaId]) dom[metaId].textContent = meta;
    const card = dom[valueId] ? dom[valueId].closest(".result-card") : null;
    if (card) card.classList.toggle("is-blocked", Boolean(blocked));
}

function renderGate(gate) {
    if (!dom.gateBanner) return;
    dom.gateBanner.dataset.status = gate.status;
    dom.gateHeadline.textContent = gate.headline;
    dom.gateDetail.textContent = gate.detail;
}

// A genus record answers the storage question but holds no numbers, so an
// empty counts table has to point at the species that do.
function genusHint(record) {
    if (!record || record.rank !== "genus") return null;
    const withCounts = speciesWithCountsInGenus(record.scientificName);
    if (!withCounts) return null;
    return `${record.scientificName} is a genus record and carries no counts of its own, but `
        + `${withCounts} ${record.scientificName} species in this dataset do. Search for one by name.`;
}

function renderCounts(model) {
    const { counts, measured, measuredVsPublished } = model;
    // Computed once: genusHint scans the full species list, and this runs on
    // every keystroke.
    const emptyNote = genusHint(model.record) || "No seed-count source covers this species.";

    if (measured && measured.ok) {
        setCard("countPerOzValue", "countPerOzMeta",
            formatCount(measured.perOz),
            `From your sample of ${nf(measured.seedCount)} seeds at ${nf(measured.sampleGrams, 2)} g.`);
        setCard("countPerLbValue", "countPerLbMeta",
            formatCount(measured.perLb),
            measuredVsPublished ? measuredVsPublished.note : "No published range to compare against.");
        setCard("tswValue", "tswMeta",
            `${nf(measured.thousandSeedWeightG, 2)} g`,
            "Thousand-seed weight from your own sample.");
    } else if (counts.span) {
        const sourceCount = counts.rows.length;
        setCard("countPerOzValue", "countPerOzMeta",
            formatSpan(counts.span.perOz),
            counts.disagreement
                ? `${sourceCount} sources spanning ${counts.ratio.toFixed(1)}×. Shown as a range because they disagree; the tool does not average them.`
                : `${sourceCount} source${sourceCount === 1 ? "" : "s"} in agreement.`);
        setCard("countPerLbValue", "countPerLbMeta",
            formatSpan(counts.span.perLb),
            "Published values. Count a sample of your own for a figure without lot-to-lot variation.");
        const tswRow = counts.rows.find((row) => row.thousandSeedWeightG);
        setCard("tswValue", "tswMeta",
            tswRow ? `${nf(tswRow.thousandSeedWeightG, 2)} g` : "--",
            tswRow ? `Published, ${tswRow.material || "seed"}.` : "Not held for this species. Count a sample to measure it.");
    } else {
        setCard("countPerOzValue", "countPerOzMeta", "--", emptyNote);
        setCard("countPerLbValue", "countPerLbMeta", "--", emptyNote);
        setCard("tswValue", "tswMeta", "--", "Count a sample to measure this.");
    }

    if (model.packet) {
        setCard("packetSeedsValue", "packetSeedsMeta",
            formatSpan(model.packet.seeds),
            `${nf(model.packet.grams, 2)} g on the ${model.packet.basis} basis.`);
    } else {
        setCard("packetSeedsValue", "packetSeedsMeta", "--",
            model.counts.span ? "Enter a packet weight." : "Needs a seed count first.");
    }

    // Per-source table
    if (dom.countsTableBody) {
        dom.countsTableBody.innerHTML = "";
        if (!counts.rows.length) {
            const row = document.createElement("tr");
            row.innerHTML = `<td colspan="4" class="wrap">${emptyNote}</td>`;
            dom.countsTableBody.appendChild(row);
        }
        for (const entry of counts.rows) {
            const row = document.createElement("tr");
            const reference = entry.reference;
            const sourceCell = reference && reference.url
                ? `<a href="${reference.url}" target="_blank" rel="noopener noreferrer">${reference.label}</a>`
                : (reference ? reference.label : entry.sourceKey);
            row.innerHTML = `
                <td class="wrap">${sourceCell}${entry.correction ? `<span class="row-note">${entry.correction}</span>` : ""}</td>
                <td class="wrap">${entry.cropLabel}</td>
                <td>${formatSpan(entry.perOz)}</td>
                <td>${formatSpan(entry.perLb)}</td>`;
            dom.countsTableBody.appendChild(row);
        }
    }
}

function renderStorage(model) {
    const { multiplier, projection, hundredRule, gate } = model;

    if (multiplier && multiplier.ok) {
        setCard("multiplierValue", "multiplierMeta", formatMultiplier(multiplier.multiplier),
            `Relative to ${nf(multiplier.applied.baselineTemperatureC, 1)} °C at ${nf(multiplier.applied.baselineMoisturePct, 1)}% MC.`);
        setCard("moistureFactorValue", "moistureFactorMeta", formatMultiplier(multiplier.moistureMultiplier),
            `${multiplier.moistureDelta >= 0 ? "Drier" : "Wetter"} by ${nf(Math.abs(multiplier.moistureDelta), 1)} percentage points.`);
        setCard("temperatureFactorValue", "temperatureFactorMeta", formatMultiplier(multiplier.temperatureMultiplier),
            `${multiplier.temperatureDeltaF >= 0 ? "Cooler" : "Warmer"} by ${nf(Math.abs(multiplier.temperatureDeltaF), 1)} °F.`);
    } else {
        setCard("multiplierValue", "multiplierMeta", "--", multiplier ? multiplier.reason : "Waiting for input.");
        setCard("moistureFactorValue", "moistureFactorMeta", "--", "Waiting for input.");
        setCard("temperatureFactorValue", "temperatureFactorMeta", "--", "Waiting for input.");
    }

    if (projection.ok) {
        const years = projection.years;
        const label = Math.abs(years.high - years.low) < 1e-9
            ? `${formatYears(years.low)} y`
            : `${formatYears(years.low)}-${formatYears(years.high)} y`;
        setCard("longevityValue", "longevityMeta", label,
            `Published baseline ${formatYears(projection.baseline.span.low)}-${formatYears(projection.baseline.span.high)} y `
            + `× ${formatMultiplier(multiplier.multiplier)}. Run a germination test before trusting it.`);
    } else if (projection.reason === "gated") {
        setCard("longevityValue", "longevityMeta", "Not modelled", gate.headline, true);
    } else if (projection.reason === "no-baseline") {
        setCard("longevityValue", "longevityMeta", "--",
            "No published storage life held for this species, so there is nothing to scale.");
    } else {
        setCard("longevityValue", "longevityMeta", "--", "Enter baseline and storage conditions.");
    }

    if (hundredRule) {
        setCard("hundredRuleValue", "hundredRuleMeta",
            `${nf(hundredRule.sum, 0)} ${hundredRule.pass ? "✓" : "✗"}`,
            hundredRule.detail);
    } else {
        setCard("hundredRuleValue", "hundredRuleMeta", "--", "Needs temperature and relative humidity.");
    }
}

function renderSpeciesFacts(model) {
    const record = model.record;
    const gate = model.gate;

    const behaviourLabel = gate.behaviour
        ? gate.behaviour.replace(/_/g, " ")
        : "unrecorded";
    setCard("behaviourValue", "behaviourMeta", behaviourLabel,
        gate.reference ? `Source: ${gate.reference.label}.` : gate.detail,
        gate.status === "blocked" || gate.status === "not_applicable");

    // G2090 prints a minimum germination percentage for watermelon and no
    // temperatures at all. Formatting the missing fields put "NaN °C" on the
    // card, so each part is now written only if its number survived.
    const germination = record && record.germination && record.germination[0];
    const hasOpt = germination && Number.isFinite(germination.tempOptC);
    if (germination) {
        const parts = [];
        if (hasOpt) {
            const range = Number.isFinite(germination.tempMinC) && Number.isFinite(germination.tempMaxC)
                ? ` (range ${nf(germination.tempMinC, 0)}-${nf(germination.tempMaxC, 0)} °C)`
                : "";
            parts.push(`Optimum ${nf(germination.tempOptC, 0)} °C${range}`);
        }
        if (Number.isFinite(germination.daysToGerminate)) {
            parts.push(`${nf(germination.daysToGerminate, 0)} days`);
        }
        if (Number.isFinite(germination.minPercent)) {
            parts.push(`minimum ${nf(germination.minPercent, 0)}% germination`);
        }
        setCard("germinationValue", "germinationMeta",
            hasOpt ? `${nf(germination.tempOptC, 0)} °C` : "--",
            parts.length
                ? `${parts.join(", ")}.`
                : "The source covers this species but supplies no germination figures.");
    } else {
        setCard("germinationValue", "germinationMeta", "--", "No germination-condition source covers this species.");
    }

    if (record) {
        const held = [];
        if (record.counts) held.push("counts");
        if (record.longevity) held.push("longevity");
        if (record.constants) held.push("viability constants");
        if (record.germination) held.push("germination");
        setCard("coverageValue", "coverageMeta",
            `${held.length}/4`,
            held.length ? `Held: ${held.join(", ")}.` : "No numeric data held; storage behaviour only.");
    } else {
        setCard("coverageValue", "coverageMeta", "--", "Waiting for a species.");
    }
}

function renderWarnings(model) {
    if (!dom.warningList) return;
    dom.warningList.innerHTML = "";
    const items = [];

    for (const clamp of (model.multiplier && model.multiplier.clamps) || []) {
        items.push({ text: clamp.message, kind: "clamp" });
    }
    for (const warning of (model.projection && model.projection.warnings) || []) {
        items.push({ text: warning, kind: "warn" });
    }
    for (const warning of (model.measured && model.measured.warnings) || []) {
        items.push({ text: warning, kind: "warn" });
    }
    if (model.counts && model.counts.disagreement) {
        items.push({
            text: `Seed-count sources disagree by ${model.counts.ratio.toFixed(1)}× for this species. `
                + "Both are shown in the Count tab with their citations; the tool does not average them.",
            kind: "warn"
        });
    }
    for (const note of (model.record && model.record.notes) || []) {
        items.push({ text: note, kind: "warn" });
    }

    for (const item of items) {
        const li = document.createElement("li");
        if (item.kind === "clamp") li.className = "clamp";
        li.textContent = item.text;
        dom.warningList.appendChild(li);
    }
}

function renderSources(model) {
    if (!dom.sourcesTableBody) return;
    dom.sourcesTableBody.innerHTML = "";
    const record = model.record;
    if (!record) return;

    const rows = [];
    const push = (datum, key) => {
        const reference = SEED_REFERENCES[key];
        if (reference) rows.push({ datum, reference });
    };

    for (const entry of record.counts || []) push("Seed count", entry.sourceKey);
    for (const entry of record.longevity || []) push("Storage life", entry.sourceKey);
    for (const entry of record.germination || []) push("Germination", entry.sourceKey);
    for (const entry of record.constants || []) {
        push("Viability constants", entry.sourceKey);
        // Merged duplicates keep their citation: two sources publishing the
        // same fit is corroboration, and dropping the second would lose it.
        for (const key of entry.corroboratedBy || []) push("Viability constants", key);
    }
    if (record.behaviour) {
        push("Storage behaviour", record.behaviour.sourceKey);
        if (record.behaviour.overruled) push("Storage behaviour (overruled)", record.behaviour.overruled.sourceKey);
    }

    const seen = new Set();
    for (const row of rows) {
        const key = `${row.datum}|${row.reference.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="wrap">${row.datum}</td>`
            + `<td class="wrap"><a href="${row.reference.url}" target="_blank" rel="noopener noreferrer">${row.reference.label}</a></td>`;
        dom.sourcesTableBody.appendChild(tr);
    }
}

function renderChecks() {
    if (!dom.checksBody) return;
    const checks = evaluateSeedChecks();
    const summary = summariseSeedChecks(checks);
    if (dom.checksSummary) {
        dom.checksSummary.textContent = `${summary.passed}/${summary.total} passing`;
    }
    dom.checksBody.innerHTML = "";
    for (const check of checks) {
        const item = document.createElement("div");
        item.className = "check-item";
        item.innerHTML = `
            <div class="check-head">
                <span class="check-status ${check.status}">${check.status}</span>
                <span>${check.title}</span>
            </div>
            <p class="fixture">${check.fixture}</p>
            <p>${check.benchmark}</p>
            <p>${check.detail}</p>`;
        dom.checksBody.appendChild(item);
    }
}

function render() {
    const model = runSeedModel(readInputs());
    renderGate(model.gate);
    renderCounts(model);
    renderStorage(model);
    renderSpeciesFacts(model);
    renderWarnings(model);
    renderSources(model);
    if (dom.statusLine) {
        dom.statusLine.textContent = model.record
            ? `Showing ${speciesDisplayName(model.record)}.`
            : "No species selected.";
    }
    return model;
}

// ---------------------------------------------------------------------------
// Species search
// ---------------------------------------------------------------------------

function renderSearchResults(query) {
    if (!dom.speciesResults) return;
    dom.speciesResults.innerHTML = "";
    const trimmed = (query || "").trim();
    if (trimmed.length < 2) return;

    const hits = searchSpecies(trimmed, { limit: 20 });
    if (!hits.length) {
        const li = document.createElement("li");
        li.innerHTML = '<button type="button" disabled>No match. Try a shorter word, or a scientific name.</button>';
        dom.speciesResults.appendChild(li);
        return;
    }

    for (const record of hits) {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.speciesId = record.id;
        const common = (record.commonNames || [])[0] || record.scientificName;
        const badges = [
            ["count", Boolean(record.counts)],
            ["years", Boolean(record.longevity)],
            ["constants", Boolean(record.constants)]
        ].map(([label, on]) => `<span class="badge${on ? " on" : ""}">${label}</span>`).join("");
        button.innerHTML = `${common}<span class="badges">${badges}</span>`
            + `<span class="sci">${record.scientificName}</span>`;
        li.appendChild(button);
        dom.speciesResults.appendChild(li);
    }
}

function selectSpecies(id) {
    const record = getSpeciesById(id);
    if (!record) return;
    selectedSpeciesId = id;
    if (dom.speciesSearch) {
        dom.speciesSearch.value = (record.commonNames || [])[0] || record.scientificName;
    }
    if (dom.speciesResults) dom.speciesResults.innerHTML = "";
    persist();
    render();
}

// ---------------------------------------------------------------------------
// Math modal
// ---------------------------------------------------------------------------

function renderMathModal() {
    if (!dom.mathModalBody) return;
    dom.mathModalBody.innerHTML = "";
    for (const spec of SEED_EQUATION_SPECS) {
        const sources = getSeedEquationSources(spec)
            .map((source) => `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.label}</a>`)
            .join(", ");
        const block = document.createElement("article");
        block.className = "equation-block";
        block.innerHTML = `
            <h3>${spec.title}</h3>
            <pre>${spec.equation}</pre>
            <p>${spec.rationale}</p>
            <p class="equation-meta"><strong>Implementation:</strong> ${spec.implementation}</p>
            <p class="equation-meta"><strong>Fixture:</strong> ${spec.fixture} <strong>Expected:</strong> ${spec.expected}</p>
            <p class="equation-meta"><strong>Sources:</strong> ${sources || "n/a"}</p>
            <button class="tool-btn secondary" type="button" data-math-run="${spec.id}">Run test</button>
            <div class="equation-result" id="math-result-${spec.id}" hidden></div>`;
        dom.mathModalBody.appendChild(block);
    }
}

function showMathResult(id, result) {
    const target = document.getElementById(`math-result-${id}`);
    if (!target || !result) return;
    target.hidden = false;
    target.className = `equation-result ${result.pass ? "pass" : "fail"}`;
    target.textContent = `${result.pass ? "PASS" : "FAIL"}: expected ${result.expected}, got ${result.actual} ${result.units}. ${result.message}`;
}

function openMathModal() {
    if (!dom.mathModal) return;
    dom.mathModal.hidden = false;
}

function closeMathModal() {
    if (!dom.mathModal) return;
    dom.mathModal.hidden = true;
}

function runAllMathTests() {
    const results = runAllSeedEquationTests();
    let failed = 0;
    for (const result of results) {
        showMathResult(result.id, result);
        if (!result.pass) failed += 1;
    }
    if (dom.mathModalStatus) {
        dom.mathModalStatus.textContent = failed === 0
            ? `All ${results.length} equations reproduce their literature anchors.`
            : `${failed} of ${results.length} equations failed. The model and the documented math disagree.`;
    }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function persist() {
    try {
        const payload = { selectedSpeciesId };
        for (const id of INPUT_IDS) {
            if (id === "speciesSearch") continue;
            if (dom[id]) payload[id] = dom[id].value;
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        if (dom.settingsStatus) dom.settingsStatus.textContent = "Settings saved to this browser.";
    } catch (error) {
        if (dom.settingsStatus) dom.settingsStatus.textContent = "Settings could not be saved in this browser.";
    }
}

function restore() {
    let payload = null;
    try {
        payload = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    } catch (error) {
        payload = null;
    }
    if (!payload) return;
    for (const id of INPUT_IDS) {
        if (id === "speciesSearch") continue;
        if (dom[id] && typeof payload[id] === "string") dom[id].value = payload[id];
    }
    if (payload.selectedSpeciesId && getSpeciesById(payload.selectedSpeciesId)) {
        selectedSpeciesId = payload.selectedSpeciesId;
    }
}

function resetAll() {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        /* storage unavailable; the in-memory reset below still applies */
    }
    selectedSpeciesId = "lactuca-sativa";
    applyPreset("fridge");
    if (dom.baselineTemperature) dom.baselineTemperature.value = String(DEFAULT_BASELINE.temperatureC);
    if (dom.baselineTemperatureUnit) dom.baselineTemperatureUnit.value = "C";
    if (dom.baselineMoisture) dom.baselineMoisture.value = String(DEFAULT_BASELINE.moisturePct);
    if (dom.measuredSeedCount) dom.measuredSeedCount.value = "";
    if (dom.measuredSampleMass) dom.measuredSampleMass.value = "";
    if (dom.packetMass) dom.packetMass.value = "2";
    const record = getSpeciesById(selectedSpeciesId);
    if (dom.speciesSearch && record) dom.speciesSearch.value = (record.commonNames || [])[0] || record.scientificName;
    persist();
    render();
}

function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    if (dom.storageTemperatureUnit) dom.storageTemperatureUnit.value = preset.storageTemperatureUnit;
    if (dom.storageTemperature) dom.storageTemperature.value = String(preset.storageTemperature);
    if (dom.storageMoisture) dom.storageMoisture.value = String(preset.storageMoisture);
    if (dom.storageRelativeHumidity) dom.storageRelativeHumidity.value = String(preset.storageRelativeHumidity);
}

// ---------------------------------------------------------------------------
// Help chips
// ---------------------------------------------------------------------------

function appendHelp(target, tooltipId, text) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "help-chip";
    chip.setAttribute("aria-describedby", tooltipId);
    chip.setAttribute("aria-expanded", "false");
    chip.setAttribute("aria-label", `${target.textContent.trim()} help`);
    chip.textContent = "i";
    chip.addEventListener("mouseenter", () => {
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        if (chip.dataset.pinned === "true") return;
        closeHelpTooltips();
        chip.setAttribute("aria-expanded", "true");
    });
    chip.addEventListener("mouseleave", () => {
        if (chip.dataset.pinned === "true") return;
        chip.setAttribute("aria-expanded", "false");
    });

    const tooltip = document.createElement("span");
    tooltip.id = tooltipId;
    tooltip.className = "help-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = text;

    target.append(" ", chip, tooltip);
}

function closeHelpTooltips() {
    document.querySelectorAll(".help-chip").forEach((chip) => {
        delete chip.dataset.pinned;
        chip.setAttribute("aria-expanded", "false");
    });
}

function addHelpTooltips() {
    Object.entries(INPUT_HELP_TEXT).forEach(([id, text]) => {
        const element = dom[id] || document.getElementById(id);
        const container = element && element.closest(".input-line, .check-line");
        if (!container) return;
        const label = Array.from(container.children).find((child) => child.tagName === "SPAN");
        if (!label || label.querySelector(".help-chip")) return;
        label.classList.add("label-with-help");
        appendHelp(label, `help-${id}`, text);
    });

    Object.entries(RESULT_HELP_TEXT).forEach(([id, text]) => {
        const element = dom[id] || document.getElementById(id);
        const card = element && element.closest(".result-card");
        const label = card && card.querySelector(".result-label");
        if (!label || label.querySelector(".help-chip")) return;
        label.classList.add("result-label-with-help");
        appendHelp(label, `help-${id}`, text);
    });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function scheduleRecompute() {
    // Persist immediately, render on a debounce. Rendering is the expensive
    // half; saving is a few hundred bytes, and deferring it loses the user's
    // settings if they close the tab within the debounce window.
    persist();
    window.clearTimeout(recomputeHandle);
    recomputeHandle = window.setTimeout(render, 120);
}

function switchTab(name) {
    document.querySelectorAll("[data-tab-target]").forEach((button) => {
        const active = button.getAttribute("data-tab-target") === name;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
        panel.hidden = panel.getAttribute("data-tab-panel") !== name;
    });
}

function init() {
    for (const id of [...INPUT_IDS, ...OUTPUT_IDS, ...OTHER_IDS]) {
        dom[id] = document.getElementById(id);
    }

    restore();
    addHelpTooltips();
    renderMathModal();
    renderChecks();

    const record = getSpeciesById(selectedSpeciesId);
    if (dom.speciesSearch && record) {
        dom.speciesSearch.value = (record.commonNames || [])[0] || record.scientificName;
    }

    for (const id of INPUT_IDS) {
        if (!dom[id] || id === "speciesSearch") continue;
        dom[id].addEventListener("input", scheduleRecompute);
        dom[id].addEventListener("change", scheduleRecompute);
    }

    if (dom.speciesSearch) {
        dom.speciesSearch.addEventListener("input", (event) => {
            renderSearchResults(event.target.value);
        });
    }

    if (dom.speciesResults) {
        dom.speciesResults.addEventListener("click", (event) => {
            const button = event.target instanceof Element ? event.target.closest("[data-species-id]") : null;
            if (button) selectSpecies(button.dataset.speciesId);
        });
    }

    document.querySelectorAll("[data-tab-target]").forEach((button) => {
        button.addEventListener("click", () => switchTab(button.getAttribute("data-tab-target")));
    });

    document.querySelectorAll("[data-preset]").forEach((button) => {
        button.addEventListener("click", () => {
            applyPreset(button.getAttribute("data-preset"));
            persist();
            render();
        });
    });

    if (dom.resetBtn) dom.resetBtn.addEventListener("click", resetAll);
    if (dom.showMathBtn) dom.showMathBtn.addEventListener("click", openMathModal);
    if (dom.mathModalClose) dom.mathModalClose.addEventListener("click", closeMathModal);
    if (dom.mathModalRunAll) dom.mathModalRunAll.addEventListener("click", runAllMathTests);
    if (dom.mathModal) {
        dom.mathModal.addEventListener("click", (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target && target.closest("[data-math-modal-close]")) closeMathModal();
            const runButton = target && target.closest("[data-math-run]");
            if (runButton) {
                const id = runButton.getAttribute("data-math-run");
                showMathResult(id, runSeedEquationTest(id));
            }
        });
    }

    document.addEventListener("click", (event) => {
        const chip = event.target instanceof Element ? event.target.closest(".help-chip") : null;
        if (chip) {
            event.preventDefault();
            event.stopPropagation();
            const isOpen = chip.dataset.pinned === "true";
            closeHelpTooltips();
            if (!isOpen) {
                chip.dataset.pinned = "true";
                chip.setAttribute("aria-expanded", "true");
            }
            return;
        }
        closeHelpTooltips();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (dom.mathModal && !dom.mathModal.hidden) {
            closeMathModal();
            return;
        }
        closeHelpTooltips();
    });

    render();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

export { cToF, GRAMS_PER_OZ };
