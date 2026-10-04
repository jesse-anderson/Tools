// Seed Storage Lab UI wiring: species search, unit handling, rendering, the
// math modal, and browser persistence. All numbers come from seed-model.js;
// this file formats them and nothing more.

import {
    DEFAULT_BASELINE,
    GRAMS_PER_OZ,
    HARRINGTON_LIMITS,
    TEMPERATURE_METHODS,
    cToF,
    fToC,
    runSeedModel,
    searchSpecies,
    getSpeciesById,
    speciesDisplayName,
    speciesWithCountsInGenus,
    cropGroups,
    resolveCropGroup
} from "./seed-model.js";
import { SEED_REFERENCES } from "./seed-source-map.js";
import { SEED_EQUATION_SPECS, getSeedEquationSources, runSeedEquationTest, runAllSeedEquationTests } from "./seed-math.js";
import { evaluateSeedChecks, summariseSeedChecks } from "./seed-validation.js";
import * as SeedViabilityEngine from "./seed-viability-engine.js";
import { renderViability, viabilityWarnings } from "./seed-viability-view.js";
import * as SeedStorageTiers from "./seed-storage-tiers.js";
import * as SeedMonteCarlo from "./seed-monte-carlo.js";
import { renderStorageTier, storageWarnings } from "./seed-storage-view.js";

const STORAGE_KEY = "seed-storage-lab-settings-v1";

const INPUT_IDS = [
    "speciesSearch", "cropGroup",
    "measuredSeedCount", "measuredSampleMass", "measuredSampleMassUnit",
    "packetMass", "packetMassUnit",
    "baselineTemperature", "baselineTemperatureUnit", "baselineMoisture",
    "storageTemperature", "storageTemperatureUnit", "storageMoisture",
    "storageRelativeHumidity",
    "containerType", "vacuumResidual", "oxygenAbsorber", "absorberCapacity", "desiccant",
    "containerVolume", "seedMass", "seedVolume", "storageHorizon", "seedTreatment",
    "initialGermination", "targetGermination",
    "moistureSpread", "temperatureSpread", "testSeeds", "monteCarloDraws", "monteCarloSeed"
];

const CHECKBOX_IDS = new Set(["oxygenAbsorber", "desiccant"]);

const OUTPUT_IDS = [
    "countPerOzValue", "countPerOzMeta",
    "countPerLbValue", "countPerLbMeta",
    "packetSeedsValue", "packetSeedsMeta",
    "tswValue", "tswMeta",
    "longevityValue", "longevityMeta",
    "viabilityValue", "viabilityMeta",
    "monteCarloValue", "monteCarloMeta",
    "halfLifeValue", "halfLifeMeta",
    "sigmaValue", "sigmaMeta",
    "multiplierValue", "multiplierMeta",
    "moistureFactorValue", "moistureFactorMeta",
    "temperatureFactorValue", "temperatureFactorMeta",
    "containerValue", "containerMeta",
    "oxygenValue", "oxygenMeta",
    "hundredRuleValue", "hundredRuleMeta",
    "behaviourValue", "behaviourMeta",
    "germinationValue", "germinationMeta",
    "coverageValue", "coverageMeta"
];

const OTHER_IDS = [
    "speciesResults", "cropGroupRow", "gateBanner", "gateHeadline", "gateDetail",
    "countsTableBody", "warningList", "sourcesTableBody",
    "viabilityChart", "viabilityTableBody",
    "oxygenChart", "oxygenDecayNote",
    "checksCard", "checksSummary", "checksBody",
    "statusLine", "settingsStatus", "resetBtn",
    "showMathBtn", "mathModal", "mathModalClose", "mathModalRunAll",
    "mathModalBody", "mathModalStatus"
];

const INPUT_HELP_TEXT = Object.freeze({
    speciesSearch: "Type a common name (lettuce, oak, sweet corn) or a scientific name. Matching is on whole words, so \"pine\" does not return every Lupinus.",
    cropGroup: "One species is often several vegetables. Brassica oleracea covers broccoli, cabbage, cauliflower, kale, kohlrabi and brussels sprouts, and each has its own published seed count. Pick the crop you actually have; searching for it selects it for you.",
    measuredSeedCount: "How many seeds you physically counted. Counting error is roughly 1/n, so 100 seeds gives about 1% error and 10 seeds gives about 10%.",
    measuredSampleMass: "What those counted seeds weigh. Most kitchen scales resolve to 0.1-1 g, which dominates the result below about 0.1 g of seed.",
    measuredSampleMassUnit: "Unit for the sample weight. Grams give the best resolution on a domestic scale.",
    packetMass: "Weight of the packet or lot you want a seed count for. Uses your measured count when you supply one, otherwise the published range.",
    packetMassUnit: "Unit for the packet weight.",
    baselineTemperature: `Temperature the published longevity figure is assumed to describe. Published tables say "cool, dry" without defining it, so it is pinned here at ${DEFAULT_BASELINE.temperatureC} °C and left editable.`,
    baselineTemperatureUnit: "Unit for the baseline temperature. Harrington's rule is stated in Fahrenheit intervals; the tool converts for you.",
    baselineMoisture: `Seed moisture content the published figure is assumed to describe, pinned at ${DEFAULT_BASELINE.moisturePct}%. Every multiplier is relative to this, so changing it moves every projection.`,
    storageTemperature: `Your actual storage temperature. Harrington gave his temperature rule for ${HARRINGTON_LIMITS.temperatureMinC} to ${HARRINGTON_LIMITS.temperatureMaxC} °C; inputs outside that are clamped and reported.`,
    storageTemperatureUnit: "Unit for your storage temperature.",
    storageMoisture: `Water as a percentage of seed weight. Relative humidity is a separate input below. Harrington's rule is valid from ${HARRINGTON_LIMITS.moistureMinPct} to ${HARRINGTON_LIMITS.moistureMaxPct}% and clamps outside that; the viability equation takes the figure as entered and is very sensitive to it.`,
    storageRelativeHumidity: "The humidity the seed is in balance with. For an open packet that is the room's. For a sealed jar it is the humidity the seed was dried to before sealing, which stays put; the air of the fridge or cupboard outside the jar does not count. Used by the Hundred Rule, the check on sealing seed that is not dry, and the oxygen factor.",
    containerType: "What the seed is stored in. Groot et al. 2015 found the closure decides whether oxygen stays out: a rubber ring or a lined twist-off lid held it, plastic screw caps did not. Paper and cloth hold neither oxygen nor moisture.",
    vacuumResidual: "Pressure left in the jar or bag after pumping, as a percentage of atmospheric. 100 means no vacuum. Oxygen falls in proportion. Read it from the pump or sealer's gauge if it has one; the tool assumes no figure for home equipment, foil bags included.",
    oxygenAbsorber: "An iron oxygen absorber sealed in with the seed. Most carry a moisturiser, so pair one with a desiccant or the jar can turn humid.",
    absorberCapacity: "The absorber's rating in mL of oxygen, as printed on the packet. Air is about one fifth oxygen, so a 100 mL absorber clears roughly 480 mL of air.",
    desiccant: "Silica gel or drying beads sealed in with the seed. Johnny's recommends it for a jar in the fridge. Primed and pelleted seed can be harmed by strong drying without an absorber.",
    containerVolume: "Inside volume of the jar. A US pint mason jar holds about 473 mL and a quart about 946 mL.",
    seedMass: "Weight of seed in the container. More seed uses up the oxygen faster.",
    seedVolume: "Space the seed takes up in the jar. Leave blank to use 1.8 mL per gram, measured for lettuce; dense seed such as beans takes up less.",
    storageHorizon: "How long you mean to keep the seed. Oxygen control takes years to show: vacuum-sealed pepper was clearly better than open storage only at 48 months for three of four cultivars.",
    seedTreatment: "Raw, primed or pelleted seed. Johnny's says pelleted seed should be used within a year. Primed seed ages faster and has no published storage figure, so no storage life is projected for it.",
    initialGermination: "What a germination test on this lot shows today. The viability equation starts its curve here. 100% is taken as 99.9%, since no test can tell them apart.",
    moistureSpread: "How far the true moisture content could be from the figure entered, either way. Each draw picks a value evenly from that range. The default of 1 point is a placeholder; a kitchen guess is worse, an oven test better.",
    temperatureSpread: "How far the average storage temperature could be from the figure entered, either way, in °C even when the temperature is entered in °F. It describes how well you know the average; daily swings are a separate matter the equation does not model. The default of 2 °C is a placeholder.",
    testSeeds: "How many seeds your germination test used. A test of 100 that shows 95% is consistent with a true figure from about 89 to 98% (95% interval), and each draw takes one value from that range. Leave blank or 0 to treat the germination figure as exact. A laboratory test under the ISTA rules uses 400 seeds.",
    monteCarloDraws: "How many random draws build the band, from 100 to 2,000. More draws give a steadier band and take longer to compute.",
    monteCarloSeed: "The starting value for the random number generator. The same seed gives the same band every time; change it to see how much the band moves between runs.",
    targetGermination: "The germination percentage below which you would call the lot spent. Genebanks commonly regenerate at 85%. A home gardener sowing thickly can live with far less, and the time to 50% is shown beside it either way."
});

const RESULT_HELP_TEXT = Object.freeze({
    countPerOzValue: "Seeds per ounce. A range means the sources disagree, and the tool shows the full spread with each source cited in the Count tab.",
    countPerLbValue: "Seeds per pound, the same figure on a larger basis. Useful for field seeding rates.",
    packetSeedsValue: "Estimated seeds in your packet. Uses your measured count if you entered one, otherwise the published range.",
    tswValue: "Thousand-seed weight, the standard agronomic measure. Computed from your counted sample, or read from the thousand-seed-weight dataset where available.",
    longevityValue: "Published storage life multiplied by the Harrington factor for your conditions. A projection from thumb-rules. Run a germination test to learn the true state of a seed lot.",
    viabilityValue: "From the Ellis-Roberts viability equation, for species with published constants. Time for germination to fall from the starting figure to your floor, in airtight storage at a constant temperature and seed moisture content.",
    monteCarloValue: "P10 to P90 time to your floor over the uncertainty you set: moisture and temperature anywhere in your stated range, and the lot's true germination given the size of your test. Never a single date, because the width of this range is the answer.",
    halfLifeValue: "Time until half the seed no longer germinates, from the same equation. The usual single-number summary of a seed lot's life.",
    sigmaValue: "Sigma in the viability equation: the time for germination to drop by one probit, such as 97.7% to 84.1% or 84.1% to 50%. It depends only on species, moisture content and temperature, and the published tables quote it.",
    multiplierValue: "How much longer seed keeps at your conditions than at the baseline. The moisture factor times the temperature factor, so it is a range too.",
    moistureFactorValue: "2 raised to the drop in moisture content. Each percentage point drier roughly doubles storage life.",
    temperatureFactorValue: "The range across three ways of reading temperature: Harrington's rule as halving per 10 °F, the same rule as halving per 5 °C (both are published), and the temperature terms of the Ellis-Roberts equation, which are fitted on measured seed survival. Below about 35 °C the measured curve gives the smallest effect.",
    containerValue: "Which storage tier your container and its contents fall in. Each tier fails in its own way, so the card names the one that applies.",
    oxygenValue: "Life multiplier from lowering oxygen: (20.9 / O2%) raised to 0.782, from Groot et al. 2025, where each halving of oxygen gave 1.72 times the shelf life. Held at 1% and faded out between 43% and 60% RH.",
    hundredRuleValue: "Storage temperature in °F plus relative humidity in percent. Under 100 is the seed-saving rule of thumb. It screens conditions; it does not predict years.",
    behaviourValue: "Whether the species tolerates drying and cold. Orthodox seed can be stored dry; recalcitrant seed dies on drying and is refused by the model.",
    germinationValue: "Optimum germination temperature and expected days, where the source supplies them. Use these for the germination test, not for storage.",
    coverageValue: "Which categories of data this tool holds for the selected species. Absence means no source in the dataset covers it, not that the value is zero."
});

const PRESETS = Object.freeze({
    pantry: { storageTemperature: 21, storageTemperatureUnit: "C", storageMoisture: 10, storageRelativeHumidity: 55,
        containerType: "open", oxygenAbsorber: false, desiccant: false, vacuumResidual: 100 },
    basement: { storageTemperature: 13, storageTemperatureUnit: "C", storageMoisture: 8, storageRelativeHumidity: 45,
        containerType: "open", oxygenAbsorber: false, desiccant: false, vacuumResidual: 100 },
    fridge: { storageTemperature: 5, storageTemperatureUnit: "C", storageMoisture: 6, storageRelativeHumidity: 30,
        containerType: "gasket", oxygenAbsorber: false, desiccant: true, vacuumResidual: 100 },
    freezer: { storageTemperature: -18, storageTemperatureUnit: "C", storageMoisture: 5, storageRelativeHumidity: 20,
        containerType: "gasket", oxygenAbsorber: false, desiccant: true, vacuumResidual: 100 }
});

const dom = {};
let selectedSpeciesId = "lactuca-sativa";
let selectedCropKey = null;
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

function formatMultiplierSpan(low, high) {
    const lowText = formatMultiplier(low);
    const highText = formatMultiplier(high);
    return lowText === highText ? lowText : `${lowText.slice(0, -1)}-${highText}`;
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
        cropKey: selectedCropKey,
        baselineTemperatureC: temperatureC(dom.baselineTemperature, dom.baselineTemperatureUnit),
        baselineMoisturePct: numberOrNull(dom.baselineMoisture),
        storageTemperatureC: temperatureC(dom.storageTemperature, dom.storageTemperatureUnit),
        storageMoisturePct: numberOrNull(dom.storageMoisture),
        storageRelativeHumidityPct: numberOrNull(dom.storageRelativeHumidity),
        initialGerminationPct: numberOrNull(dom.initialGermination),
        targetGerminationPct: numberOrNull(dom.targetGermination),
        moistureSpreadPct: numberOrNull(dom.moistureSpread),
        temperatureSpreadC: numberOrNull(dom.temperatureSpread),
        testSeeds: numberOrNull(dom.testSeeds),
        monteCarloDraws: numberOrNull(dom.monteCarloDraws),
        monteCarloSeed: numberOrNull(dom.monteCarloSeed),
        container: dom.containerType ? dom.containerType.value : "gasket",
        vacuumResidualPct: numberOrNull(dom.vacuumResidual),
        oxygenAbsorber: Boolean(dom.oxygenAbsorber && dom.oxygenAbsorber.checked),
        absorberCapacityMl: numberOrNull(dom.absorberCapacity),
        desiccant: Boolean(dom.desiccant && dom.desiccant.checked),
        containerMl: numberOrNull(dom.containerVolume),
        seedMassG: numberOrNull(dom.seedMass),
        seedVolumeMl: numberOrNull(dom.seedVolume),
        horizonYears: numberOrNull(dom.storageHorizon),
        seedTreatment: dom.seedTreatment ? dom.seedTreatment.value : "raw",
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

// The selector only appears for the 30 species that hold more than one crop.
// Everything else would gain a control with a single option.
function renderCropGroups(model) {
    if (!dom.cropGroupRow || !dom.cropGroup) return;
    const groups = model.cropGroups || [];
    if (groups.length < 2) {
        dom.cropGroupRow.hidden = true;
        dom.cropGroup.innerHTML = "";
        return;
    }
    dom.cropGroupRow.hidden = false;
    const current = model.cropKey;
    if (dom.cropGroup.dataset.speciesId !== model.record.id) {
        dom.cropGroup.innerHTML = "";
        for (const group of groups) {
            const option = document.createElement("option");
            option.value = group.key;
            option.textContent = group.label;
            dom.cropGroup.appendChild(option);
        }
        dom.cropGroup.dataset.speciesId = model.record.id;
    }
    dom.cropGroup.value = current;
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
        const crop = model.cropGroup ? ` for ${model.cropGroup.label.toLowerCase()}` : "";
        // A thousand-seed-weight row that names no cultivar group is not a
        // determination of this crop, and saying so is the difference between
        // a real disagreement and one the tool invented.
        const wider = counts.speciesLevelRows
            ? ` ${counts.speciesLevelRows} of them measures ${model.record.scientificName} without naming a crop.`
            : "";
        setCard("countPerOzValue", "countPerOzMeta",
            formatSpan(counts.span.perOz),
            counts.disagreement
                ? `${sourceCount} determinations${crop} spanning ${counts.ratio.toFixed(1)}×. Shown as a range because they disagree; the tool does not average them.${wider}`
                : `${sourceCount} determination${sourceCount === 1 ? "" : "s"}${crop} in agreement.${wider}`);
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
                <td class="wrap">${entry.cropLabel}${entry.speciesLevel ? '<span class="row-note">Species-level; no cultivar group stated.</span>' : ""}</td>
                <td>${formatSpan(entry.perOz)}</td>
                <td>${formatSpan(entry.perLb)}</td>`;
            dom.countsTableBody.appendChild(row);
        }
    }
}

function renderStorage(model) {
    const { multiplier, projection, hundredRule, gate } = model;

    if (multiplier && multiplier.ok) {
        setCard("multiplierValue", "multiplierMeta", formatMultiplierSpan(multiplier.range.low, multiplier.range.high),
            `Relative to ${nf(multiplier.applied.baselineTemperatureC, 1)} °C at ${nf(multiplier.applied.baselineMoisturePct, 1)}% MC.`);
        setCard("moistureFactorValue", "moistureFactorMeta", formatMultiplier(multiplier.moistureMultiplier),
            `${multiplier.moistureDelta >= 0 ? "Drier" : "Wetter"} by ${nf(Math.abs(multiplier.moistureDelta), 1)} percentage points.`);
        const temperature = multiplier.temperature;
        const methods = temperature.methods;
        const shift = multiplier.temperatureDeltaC === 0
            ? "Same as the baseline."
            : `${multiplier.temperatureDeltaC > 0 ? "Cooler" : "Warmer"} by ${nf(Math.abs(multiplier.temperatureDeltaC), 1)} °C. `
              + `Ellis-Roberts temperature terms ${formatMultiplier(methods.ellisRoberts)}, Harrington per 10 °F `
              + `${formatMultiplier(methods.fahrenheit10)}, per 5 °C ${formatMultiplier(methods.celsius5)}.`;
        setCard("temperatureFactorValue", "temperatureFactorMeta",
            formatMultiplierSpan(temperature.low, temperature.high), shift);
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
        const oxygen = projection.oxygenFactor > 1
            ? ` The upper end is also multiplied by ${nf(projection.oxygenFactor, 2)}× for oxygen.`
            : "";
        const cap = projection.capYears !== null ? " Capped at one year for pelleted seed." : "";
        setCard("longevityValue", "longevityMeta", label,
            `Published baseline ${formatYears(projection.baseline.span.low)}-${formatYears(projection.baseline.span.high)} y `
            + `× ${formatMultiplierSpan(multiplier.range.low, multiplier.range.high)}, the short end from `
            + `${TEMPERATURE_METHODS[multiplier.temperature.lowMethod]} and the long end from `
            + `${TEMPERATURE_METHODS[multiplier.temperature.highMethod]}.${oxygen}${cap} Run a germination test before trusting it.`);
    } else if (projection.reason === "primed") {
        setCard("longevityValue", "longevityMeta", "Not modelled",
            "Primed seed has no published storage figure, and it ages faster than the raw seed these figures describe. Test germination before you sow.", true);
    } else if (projection.reason === "absorber-only") {
        setCard("longevityValue", "longevityMeta", "Not modelled",
            "An absorber with no desiccant can turn the jar humid, so the moisture content entered no longer holds. Add a desiccant.", true);
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
            `${hundredRule.shownSum} ${hundredRule.pass ? "✓" : "✗"}`,
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
    const germination = model.germination && model.germination[0];
    const hasOpt = germination && Number.isFinite(germination.tempOptC);
    if (germination) {
        const parts = [];
        if (hasOpt) {
            const range = Number.isFinite(germination.tempMinC) && Number.isFinite(germination.tempMaxC)
                ? ` (range ${nf(germination.tempMinC, 0)}-${nf(germination.tempMaxC, 0)} °C)`
                : "";
            parts.push(`Optimum ${nf(germination.tempOptC, 0)} °C${range}`);
        }
        const days = germination.daysToGerminate;
        if (days && (Number.isFinite(days.value) || Number.isFinite(days.low))) {
            const span = Number.isFinite(days.value) ? { low: days.value, high: days.value } : days;
            // Days to germinate are counted, so they print whole.
            parts.push(`${formatSpan(span, (value) => nf(value, 0))} days`);
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
    const tierItems = storageWarnings(model.storage);
    items.push(...tierItems.filter((item) => item.kind === "block"));

    for (const clamp of (model.multiplier && model.multiplier.clamps) || []) {
        items.push({ text: clamp.message, kind: "clamp" });
    }
    for (const warning of (model.projection && model.projection.warnings) || []) {
        items.push({ text: warning, kind: "warn" });
    }
    for (const warning of (model.measured && model.measured.warnings) || []) {
        items.push({ text: warning, kind: "warn" });
    }
    items.push(...viabilityWarnings(model.viability));
    items.push(...tierItems.filter((item) => item.kind !== "block"));
    if (model.viability && model.viability.ok && model.storage) {
        if (model.storage.tier === "open") {
            items.push({ text: "The viability equation assumes sealed storage. In an open packet the seed moisture follows the room, "
                + "and Ellis 2022 reports far shorter life in open than in sealed storage at low moisture.", kind: "warn" });
        } else if (model.storage.oxygen.multiplier > 1) {
            items.push({ text: "The oxygen factor is not applied to the viability equation. Its constants were fitted on seed sealed "
                + "with an unmeasured amount of air, which Groot et al. 2025 point out varies between experiments.", kind: "clamp" });
        }
    }
    if (model.counts && model.counts.disagreement) {
        items.push({
            text: `Seed-count sources disagree by ${model.counts.ratio.toFixed(1)}× for this species. `
                + `${model.counts.rows.length === 2 ? "Both are" : "Each is"} shown in the Count tab with its citation; the tool does not average them.`,
            kind: "warn"
        });
    }
    for (const note of (model.record && model.record.notes) || []) {
        items.push({ text: note, kind: "warn" });
    }

    for (const item of items) {
        const li = document.createElement("li");
        if (item.kind === "clamp" || item.kind === "block") li.className = item.kind;
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
    // The model resolves the crop when the stored key is stale or absent, so
    // the selector and every downstream card read back from its answer.
    selectedCropKey = model.cropKey;
    renderCropGroups(model);
    renderGate(model.gate);
    renderCounts(model);
    renderStorage(model);
    renderViability(dom, model);
    renderStorageTier(dom, model);
    renderSpeciesFacts(model);
    renderWarnings(model);
    renderSources(model);
    if (dom.statusLine) {
        dom.statusLine.textContent = model.record
            ? `Showing ${model.displayName}.`
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
        // Label the hit with the crop that matched. A search for kale that
        // offers "broccoli" looks like the wrong result even when it is right.
        const group = cropGroups(record).length > 1 ? resolveCropGroup(record, trimmed) : null;
        const common = group
            ? group.label
            : (record.commonNames || [])[0] || record.scientificName;
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

// The search term is the only evidence of which crop was wanted. Typing "kale"
// used to select Brassica oleracea and then label it "broccoli", because the
// record's first common name won regardless of what was asked for.
function selectSpecies(id, query) {
    const record = getSpeciesById(id);
    if (!record) return;
    selectedSpeciesId = id;
    const group = resolveCropGroup(record, query);
    selectedCropKey = group ? group.key : null;
    if (dom.speciesSearch) {
        dom.speciesSearch.value = group
            ? group.label.toLowerCase()
            : (record.commonNames || [])[0] || record.scientificName;
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

// Focus moves into the dialog on open and back to the opener on close.
let mathModalOpener = null;

function openMathModal() {
    if (!dom.mathModal) return;
    mathModalOpener = document.activeElement;
    dom.mathModal.hidden = false;
    if (dom.mathModalClose) dom.mathModalClose.focus();
}

function closeMathModal() {
    if (!dom.mathModal) return;
    dom.mathModal.hidden = true;
    if (mathModalOpener && typeof mathModalOpener.focus === "function") mathModalOpener.focus();
    mathModalOpener = null;
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
        const payload = { selectedSpeciesId, selectedCropKey };
        for (const id of INPUT_IDS) {
            if (id === "speciesSearch" || id === "cropGroup") continue;
            if (dom[id]) payload[id] = CHECKBOX_IDS.has(id) ? String(dom[id].checked) : dom[id].value;
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
        if (id === "speciesSearch" || id === "cropGroup") continue;
        if (!dom[id] || typeof payload[id] !== "string") continue;
        if (CHECKBOX_IDS.has(id)) dom[id].checked = payload[id] === "true";
        else dom[id].value = payload[id];
    }
    if (payload.selectedSpeciesId && getSpeciesById(payload.selectedSpeciesId)) {
        selectedSpeciesId = payload.selectedSpeciesId;
        // A key from an older bundle is discarded by the model, which falls
        // back to the first crop rather than reporting nothing.
        selectedCropKey = typeof payload.selectedCropKey === "string" ? payload.selectedCropKey : null;
    }
}

function resetAll() {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        /* storage unavailable; the in-memory reset below still applies */
    }
    selectedSpeciesId = "lactuca-sativa";
    selectedCropKey = null;
    applyPreset("fridge");
    if (dom.baselineTemperature) dom.baselineTemperature.value = String(DEFAULT_BASELINE.temperatureC);
    if (dom.baselineTemperatureUnit) dom.baselineTemperatureUnit.value = "C";
    if (dom.baselineMoisture) dom.baselineMoisture.value = String(DEFAULT_BASELINE.moisturePct);
    if (dom.measuredSeedCount) dom.measuredSeedCount.value = "";
    if (dom.measuredSampleMass) dom.measuredSampleMass.value = "";
    if (dom.packetMass) dom.packetMass.value = "2";
    if (dom.initialGermination) dom.initialGermination.value = "95";
    if (dom.targetGermination) dom.targetGermination.value = "85";
    if (dom.vacuumResidual) dom.vacuumResidual.value = "100";
    if (dom.absorberCapacity) dom.absorberCapacity.value = "100";
    if (dom.containerVolume) dom.containerVolume.value = "500";
    if (dom.seedMass) dom.seedMass.value = "50";
    if (dom.seedVolume) dom.seedVolume.value = "";
    if (dom.storageHorizon) dom.storageHorizon.value = "5";
    if (dom.seedTreatment) dom.seedTreatment.value = "raw";
    if (dom.moistureSpread) dom.moistureSpread.value = "1";
    if (dom.temperatureSpread) dom.temperatureSpread.value = "2";
    if (dom.testSeeds) dom.testSeeds.value = "100";
    if (dom.monteCarloDraws) dom.monteCarloDraws.value = "500";
    if (dom.monteCarloSeed) dom.monteCarloSeed.value = "20261003";
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
    if (dom.containerType) dom.containerType.value = preset.containerType;
    if (dom.oxygenAbsorber) dom.oxygenAbsorber.checked = preset.oxygenAbsorber;
    if (dom.desiccant) dom.desiccant.checked = preset.desiccant;
    if (dom.vacuumResidual) dom.vacuumResidual.value = String(preset.vacuumResidual);
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
        const group = cropGroups(record).find((entry) => entry.key === selectedCropKey);
        dom.speciesSearch.value = group
            ? group.label.toLowerCase()
            : (record.commonNames || [])[0] || record.scientificName;
    }

    for (const id of INPUT_IDS) {
        if (!dom[id] || id === "speciesSearch" || id === "cropGroup") continue;
        dom[id].addEventListener("input", scheduleRecompute);
        dom[id].addEventListener("change", scheduleRecompute);
    }

    if (dom.cropGroup) {
        // Switching crop changes every number on screen, so it renders at once
        // rather than on the input debounce.
        dom.cropGroup.addEventListener("change", () => {
            selectedCropKey = dom.cropGroup.value;
            if (dom.speciesSearch) {
                const group = cropGroups(getSpeciesById(selectedSpeciesId))
                    .find((entry) => entry.key === selectedCropKey);
                if (group) dom.speciesSearch.value = group.label.toLowerCase();
            }
            persist();
            render();
        });
    }

    if (dom.speciesSearch) {
        dom.speciesSearch.addEventListener("input", (event) => {
            renderSearchResults(event.target.value);
        });
    }

    if (dom.speciesResults) {
        dom.speciesResults.addEventListener("click", (event) => {
            const button = event.target instanceof Element ? event.target.closest("[data-species-id]") : null;
            if (button) selectSpecies(button.dataset.speciesId, dom.speciesSearch ? dom.speciesSearch.value : "");
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

// The pure engines, for the Playwright spec to call directly.
window.SeedViability = SeedViabilityEngine;
window.SeedStorageTiers = SeedStorageTiers;
window.SeedMonteCarlo = SeedMonteCarlo;

export { cToF, GRAMS_PER_OZ };
