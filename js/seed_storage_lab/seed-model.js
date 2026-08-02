// Seed Storage Lab model: species lookup, seed counts, the species gate,
// Harrington's rules, and the Hundred Rule indicator.
//
// Two principles run through the whole module and explain most of its shape:
//
//   1. Nothing is averaged across sources. Where two references disagree, both
//      are carried and the disagreement is reported. Averaging the 13.5x
//      lettuce conflict produces a number no source supports. This applies to
//      storage behaviour as well as to counts: where the species-level record
//      overrules a genus flag, the gate names what it overruled.
//   2. The longevity math refuses to run on seeds it cannot legitimately model.
//      Recalcitrant seeds die on drying; predicting decades for an acorn is the
//      single most harmful thing this tool could do.

import { SEED_SPECIES, SEED_SPECIES_BY_ID } from "./seed-species-data.js";
import { SEED_REFERENCES } from "./seed-source-map.js";

export const GRAMS_PER_OZ = 28.349523125;
export const GRAMS_PER_LB = 453.59237;
export const OZ_PER_LB = 16;

// Published "cool, dry" longevity tables never state the conditions they
// assume, so the baseline has to be pinned somewhere and made visible. 5 C sits
// inside the FAO medium-term band (5-10 C); 8% MC is inside Harrington's valid
// range and is roughly what a domestic fridge with fresh desiccant delivers.
// Every projected multiplier is relative to this point, so it is a UI input.
export const DEFAULT_BASELINE = Object.freeze({
    temperatureC: 5,
    moisturePct: 8,
    label: "cool, dry (5 °C, 8% moisture content)"
});

// Harrington stated both rules as thumb-rules over ordinary storage. Outside
// this box they are known to be wrong: below about 5% MC the moisture
// relationship inverts for some species, above 14% MC respiration and fungal
// growth dominate, and below 0 °C the temperature rule overpredicts badly
// against the Ellis-Roberts data.
export const HARRINGTON_LIMITS = Object.freeze({
    temperatureMinC: 0,
    temperatureMaxC: 40,
    moistureMinPct: 5,
    moistureMaxPct: 14
});

// Even fully inside the valid box, Harrington compounds to about 75,000x
// between the worst and best corners. Applied to a 3-year vendor figure that is
// 225,000 years, which no evidence supports: the oldest reliably germinated
// seed is a ~2,000-year-old date palm. Projections past this horizon are still
// computed and reported, but flagged as beyond anything measured.
export const EVIDENCE_HORIZON_YEARS = 1000;

// Above this ratio, two sources disagree; below it, the gap is ordinary
// lot-to-lot scatter. 1.3x is loose enough to absorb rounding and cultivar
// differences, tight enough to catch every conflict the audit found: 32 of the
// 53 species with more than one count source, spanning 1.32x to 14.25x.
const COUNT_DISAGREEMENT_RATIO = 1.3;

export const cToF = (c) => (c * 9) / 5 + 32;
export const fToC = (f) => ((f - 32) * 5) / 9;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

// ---------------------------------------------------------------------------
// Species lookup
// ---------------------------------------------------------------------------

function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

// Tie-break weight: a species with numbers outranks a bare behaviour flag.
function payloadScore(record) {
    return (record.counts ? 3 : 0) + (record.longevity ? 2 : 0) + (record.constants ? 2 : 0);
}

const SEARCH_ENTRIES = SEED_SPECIES.map((record) => {
    const names = [record.scientificName, ...(record.commonNames || [])];
    return {
        record,
        names,
        lowerNames: names.map((name) => name.toLowerCase()),
        tokens: names.flatMap(tokenize)
    };
});

/**
 * Search species by common or scientific name.
 *
 * Matching is on word boundaries with a prefix allowance. A substring match
 * for "pine" would return every Lupinus and make the lookup table
 * untrustworthy. "let" still finds lettuce.
 */
export function searchSpecies(query, { limit = 25 } = {}) {
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return [];
    const needle = queryTokens.join(" ");

    const scored = [];
    for (const entry of SEARCH_ENTRIES) {
        let score = 0;

        for (let i = 0; i < entry.lowerNames.length; i += 1) {
            const name = entry.lowerNames[i];
            const isScientific = i === 0;
            if (name === needle) {
                score = Math.max(score, isScientific ? 95 : 100);
            } else if (name.startsWith(`${needle} `) || name.startsWith(`${needle},`)) {
                score = Math.max(score, isScientific ? 75 : 80);
            }
        }

        if (score === 0) {
            const everyTokenMatches = queryTokens.every((token) =>
                entry.tokens.some((candidate) => candidate.startsWith(token))
            );
            if (everyTokenMatches) score = 50;
        }

        if (score > 0) {
            // Break ties toward species that can answer a question.
            scored.push({ record: entry.record, score: score + payloadScore(entry.record) });
        }
    }

    scored.sort((a, b) => b.score - a.score
        || a.record.scientificName.localeCompare(b.record.scientificName));
    return scored.slice(0, limit).map((item) => item.record);
}

export function getSpeciesById(id) {
    return SEED_SPECIES_BY_ID[id] || null;
}

/**
 * How many species inside a genus carry seed counts.
 *
 * Genus-rank records exist so that a search for "oak" can answer the storage
 * question, but they hold no numbers of their own. Without this the counts
 * table would report "none held" for Quercus while 34 Quercus species sit in
 * the dataset one click away.
 */
export function speciesWithCountsInGenus(genus) {
    if (!genus) return 0;
    const prefix = `${genus} `;
    return SEED_SPECIES.filter((record) =>
        record.scientificName.startsWith(prefix) && record.counts && record.counts.length).length;
}

export function speciesDisplayName(record) {
    if (!record) return "";
    const common = (record.commonNames || [])[0];
    return common ? `${common} (${record.scientificName})` : record.scientificName;
}

// ---------------------------------------------------------------------------
// Species gate
// ---------------------------------------------------------------------------

// Genera the Woody Plant Seed Manual covers anywhere in the dataset. Used to
// decide whether an unflagged species is a tree or shrub, which is where
// recalcitrance is common enough to withhold a projection.
//
// Testing the species' own counts for a WPSM source is not enough: a woody
// species whose only count came from the figshare dataset would test as
// herbaceous and be handed a projection. That let Ulmus, Lonicera, Rubus and
// Pinus through. Matching on genus is derived from the data instead of from a
// hand-written list of trees, so it cannot drift from what WPSM actually covers.
const WPSM_GENERA = new Set(
    SEED_SPECIES
        .filter((record) => (record.counts || []).some((entry) => entry.sourceKey === "wpsm"))
        .map((record) => record.scientificName.split(" ")[0])
);

function isWoodyTaxon(record) {
    if (!record) return false;
    if ((record.counts || []).some((entry) => entry.sourceKey === "wpsm")) return true;
    return WPSM_GENERA.has(record.scientificName.split(" ")[0]);
}

// The gate resolves species flag, then compendium row, then genus flag. Where
// the loser disagreed it used to be dropped, so 37 taxa moved from a
// desiccation-sensitive genus flag to orthodox with nothing on screen to say a
// source had been overruled. Pecan, shagbark and shellbark hickory and little
// walnut all leave a recalcitrant Carya or Juglans flag behind this way. The
// species-level record still wins, because sourced species data beats a genus
// generalisation, but the reader is told what it beat.
function overruledNote(flag) {
    const other = flag && flag.overruled;
    if (!other) return "";
    const source = SEED_REFERENCES[other.sourceKey];
    const rank = other.matchedRank === "genus" ? " at genus level" : "";
    const cite = source ? ` (${source.label})` : "";
    return ` A second source disagrees: ${other.matchedTaxon} is listed ${other.behaviour}`
        + `${rank}${cite}. The species-level record is used here.`;
}

export const GATE_STATUS = Object.freeze({
    OK: "ok",
    ASSUMED: "assumed",
    CAUTION: "caution",
    BLOCKED: "blocked",
    NOT_APPLICABLE: "not_applicable"
});

/**
 * Decide whether the longevity model may run for this species.
 *
 * Seed counts are always allowed: knowing how many acorns are in a pound is
 * useful and harmless. Only the storage-life projection refuses.
 */
export function evaluateSpeciesGate(record) {
    if (!record) {
        return {
            status: GATE_STATUS.ASSUMED,
            allowLongevity: false,
            headline: "No species selected",
            detail: "Pick a species, or switch to measured mode to work from a sample you counted yourself.",
            reference: null,
            conflict: null
        };
    }

    const flag = record.behaviour || null;
    const behaviour = flag ? flag.behaviour : null;
    const reference = flag ? SEED_REFERENCES[flag.sourceKey] || null : null;
    const via = flag && flag.matchedRank === "genus"
        ? ` (matched at genus level: ${flag.matchedTaxon})`
        : "";
    const overruled = overruledNote(flag);
    const conflict = (flag && flag.overruled) || null;

    if (behaviour === "not_applicable") {
        // The curated note already names the propagation route ("Propagated
        // from cloves"), so prefixing it with the raw field value produced
        // "Propagated vegetative. Propagated from cloves." The note leads.
        const how = flag.propagation === "vegetative" ? "vegetatively" : "from seed";
        return {
            status: GATE_STATUS.NOT_APPLICABLE,
            allowLongevity: false,
            behaviour,
            headline: `${speciesDisplayName(record)} is not grown from stored seed`,
            detail: `${flag.note || `Propagated ${how}.`}${via}${overruled}`.trim(),
            reference,
            conflict
        };
    }

    if (behaviour === "recalcitrant") {
        return {
            status: GATE_STATUS.BLOCKED,
            allowLongevity: false,
            behaviour,
            headline: `${speciesDisplayName(record)} has recalcitrant seed: drying kills it`,
            detail: (`Recalcitrant seed cannot be dried to storage moisture and cannot be stored cold${via}. `
                + "Harrington's rules and the viability equation both assume orthodox seed, so no storage life is projected here. "
                + "Sow fresh, or store moist and cool for weeks to months at most. "
                + (flag.note || "") + overruled).trim(),
            reference,
            conflict
        };
    }

    if (behaviour === "intermediate") {
        return {
            status: GATE_STATUS.CAUTION,
            allowLongevity: false,
            behaviour,
            headline: `${speciesDisplayName(record)} has intermediate seed`,
            detail: (`Tolerates partial drying but is damaged by cold storage once dry${via}. `
                + "The dry-storage model does not apply; treat published longevity as months to a few years, not decades. "
                + (flag.note || "") + overruled).trim(),
            reference,
            conflict
        };
    }

    if (behaviour === "orthodox") {
        // Grape, strawberry, rhubarb and date palm are orthodox and their seed
        // does store, but nobody grows them from it. Saying only "dry, cold
        // storage applies" would answer a question the user did not ask.
        const vegetative = flag.propagation === "vegetative"
            ? " In practice this crop is grown from cuttings, runners or offsets, so seed storage matters "
              + "for breeding and conservation rather than for replanting."
            : "";
        return {
            // An overruled recalcitrant flag is the one disagreement that can
            // hurt someone, so it costs the species its clean bill of health
            // even though the projection still runs.
            status: conflict && conflict.behaviour === "recalcitrant"
                ? GATE_STATUS.CAUTION
                : GATE_STATUS.OK,
            allowLongevity: true,
            behaviour,
            headline: "Orthodox seed: dry, cold storage applies",
            detail: `Storage behaviour is recorded${via}, so the drying and chilling model is appropriate.`
                + `${vegetative}${overruled}`,
            reference,
            conflict
        };
    }

    // No record. Nearly all annual vegetable, grain and herb seed is orthodox,
    // and the missing entries are a known gap (the 1998 compendium volume
    // covering Gramineae, Cruciferae and Compositae was never obtained). Woody
    // species are the dangerous case, so they get a stronger warning.
    const isWoody = isWoodyTaxon(record);
    return {
        status: isWoody ? GATE_STATUS.CAUTION : GATE_STATUS.ASSUMED,
        allowLongevity: !isWoody,
        behaviour: null,
        headline: isWoody
            ? "Storage behaviour unrecorded for this woody species"
            : "Storage behaviour unrecorded, treated as orthodox",
        detail: isWoody
            ? "No orthodox/intermediate/recalcitrant record is held, and tree and shrub seed is where recalcitrance is common. "
              + "Seed counts are shown; storage life is withheld until the behaviour is confirmed."
            : "No storage-behaviour record is held for this species. Nearly all annual vegetable, grain and herb seed is orthodox, "
              + "so the model runs on that assumption. Confirm it against a source before relying on the result.",
        reference: null,
        conflict: null
    };
}

// ---------------------------------------------------------------------------
// Seed counts
// ---------------------------------------------------------------------------

function quantityToLb(quantity, unit) {
    if (!quantity) return null;
    const scale = unit === "perOz" ? OZ_PER_LB
        : unit === "perGram" ? GRAMS_PER_LB
        : unit === "perKg" ? GRAMS_PER_LB / 1000
        : 1;
    const convert = (value) => (isNumber(value) ? value * scale : null);
    if (isNumber(quantity.value)) {
        const value = convert(quantity.value);
        return value === null ? null : { low: value, high: value };
    }
    const low = convert(quantity.low);
    const high = convert(quantity.high);
    if (low === null || high === null) return null;
    return { low, high };
}

function entryToPerLb(entry) {
    // Preference order is by how directly the source states a weight basis.
    // perLbRange is last: it is supplementary to perLb where both exist, but it
    // is the only figure some Woody Plant Seed Manual rows carry.
    return quantityToLb(entry.perLb, "perLb")
        || quantityToLb(entry.perOz, "perOz")
        || quantityToLb(entry.perGram, "perGram")
        || quantityToLb(entry.perKg, "perKg")
        || quantityToLb(entry.perLbRange, "perLb");
}

/**
 * Count entries the model cannot resolve to a weight basis.
 *
 * A count that no accessor reads disappears from the UI with no error, which
 * is how 34 oak seed counts went missing once. This is asserted in the checks
 * panel so the failure mode cannot come back quietly.
 */
export function findUnreadableCountEntries() {
    const orphans = [];
    for (const record of SEED_SPECIES) {
        for (const entry of record.counts || []) {
            if (!entryToPerLb(entry)) {
                orphans.push({ species: record.scientificName, sourceKey: entry.sourceKey });
            }
        }
    }
    return orphans;
}

/**
 * Collect every published seed count for a species without reconciling them.
 *
 * Returns one row per source plus the overall spread. `disagreement` is true
 * when the extremes differ by more than 1.3x, which is the tool's cue to show
 * a range and refuse to imply a single authoritative count.
 */
export function summariseCounts(record) {
    const entries = (record && record.counts) || [];
    const rows = [];

    for (const entry of entries) {
        const perLb = entryToPerLb(entry);
        if (!perLb) continue;
        rows.push({
            sourceKey: entry.sourceKey,
            reference: SEED_REFERENCES[entry.sourceKey] || null,
            cropLabel: entry.cropLabel || (record ? record.scientificName : ""),
            perLb,
            perOz: { low: perLb.low / OZ_PER_LB, high: perLb.high / OZ_PER_LB },
            perGram: { low: perLb.low / GRAMS_PER_LB, high: perLb.high / GRAMS_PER_LB },
            isRange: perLb.low !== perLb.high,
            correction: entry.correction || null,
            material: entry.material || null,
            basis: entry.basis || null,
            thousandSeedWeightG: entry.thousandSeedWeightG || null
        });
    }

    if (!rows.length) {
        return { rows: [], span: null, disagreement: false, ratio: null };
    }

    const low = Math.min(...rows.map((row) => row.perLb.low));
    const high = Math.max(...rows.map((row) => row.perLb.high));
    const ratio = low > 0 ? high / low : null;

    return {
        rows,
        span: { perLb: { low, high }, perOz: { low: low / OZ_PER_LB, high: high / OZ_PER_LB } },
        ratio,
        disagreement: isNumber(ratio) && ratio > COUNT_DISAGREEMENT_RATIO
    };
}

/**
 * Convert a hand-counted sample into seeds per gram / ounce / pound.
 *
 * A count from the packet in hand beats any table: published counts carry
 * cultivar, seed-lot, season and cleaning-standard variation that a direct
 * measurement does not carry.
 */
export function countFromMeasurement({ seedCount, sampleMass, sampleMassUnit = "g" } = {}) {
    if (!isNumber(seedCount) || seedCount <= 0) {
        return { ok: false, reason: "Enter how many seeds you counted." };
    }
    if (!isNumber(sampleMass) || sampleMass <= 0) {
        return { ok: false, reason: "Enter the mass of the seeds you counted." };
    }

    const grams = sampleMassUnit === "oz" ? sampleMass * GRAMS_PER_OZ
        : sampleMassUnit === "lb" ? sampleMass * GRAMS_PER_LB
        : sampleMass;

    const perGram = seedCount / grams;
    const result = {
        ok: true,
        perGram,
        perOz: perGram * GRAMS_PER_OZ,
        perLb: perGram * GRAMS_PER_LB,
        thousandSeedWeightG: 1000 / perGram,
        sampleGrams: grams,
        seedCount,
        warnings: []
    };

    // Counting error is roughly 1/n of the result, so a 10-seed sample carries
    // 10% error before the scale is considered at all.
    if (seedCount < 25) {
        result.warnings.push(
            `A ${seedCount}-seed sample carries about ${(100 / seedCount).toFixed(0)}% counting error. `
            + "Count at least 100 seeds for a reliable figure."
        );
    }
    if (grams < 0.1) {
        result.warnings.push(
            "Under 0.1 g, kitchen scale resolution (usually 0.1-1 g) dominates the result. "
            + "Weigh a larger sample or use a 0.001 g jeweller's scale."
        );
    }
    return result;
}

/** Cross-check a measured count against the published span for the species. */
export function compareMeasuredToPublished(measured, countSummary) {
    if (!measured || !measured.ok || !countSummary || !countSummary.span) return null;
    const { low, high } = countSummary.span.perLb;
    const value = measured.perLb;
    const inside = value >= low && value <= high;
    const ratio = inside ? 1 : value < low ? low / value : value / high;
    return {
        inside,
        ratio,
        publishedPerLb: countSummary.span.perLb,
        measuredPerLb: value,
        note: inside
            ? "Measured count sits inside the published range."
            : `Measured count is ${ratio.toFixed(1)}x outside the published range. `
              + "Check the scale units and confirm you weighed clean seed with the chaff removed. Then trust your own count."
    };
}

// ---------------------------------------------------------------------------
// Harrington's rules
// ---------------------------------------------------------------------------

/**
 * life_multiplier = 2^(dMC%) x 2^(dT_F / 10)
 *
 * Both factors are relative to the baseline the published longevity figure is
 * assumed to describe. Inputs are clamped into the validity box and every clamp
 * is reported, because a silently clamped input produces a plausible-looking
 * number from an invalid question.
 */
export function harringtonMultiplier({
    baselineTemperatureC = DEFAULT_BASELINE.temperatureC,
    baselineMoisturePct = DEFAULT_BASELINE.moisturePct,
    storageTemperatureC,
    storageMoisturePct
} = {}) {
    const clamps = [];

    function bound(value, min, max, label, unit) {
        if (!isNumber(value)) return null;
        const bounded = clamp(value, min, max);
        if (bounded !== value) {
            clamps.push({
                label,
                requested: value,
                applied: bounded,
                unit,
                message: `${label} ${value}${unit} is outside Harrington's validity range `
                    + `(${min}-${max}${unit}); clamped to ${bounded}${unit}.`
            });
        }
        return bounded;
    }

    const baseT = bound(baselineTemperatureC, HARRINGTON_LIMITS.temperatureMinC,
        HARRINGTON_LIMITS.temperatureMaxC, "Baseline temperature", " °C");
    const baseM = bound(baselineMoisturePct, HARRINGTON_LIMITS.moistureMinPct,
        HARRINGTON_LIMITS.moistureMaxPct, "Baseline moisture", "%");
    const storeT = bound(storageTemperatureC, HARRINGTON_LIMITS.temperatureMinC,
        HARRINGTON_LIMITS.temperatureMaxC, "Storage temperature", " °C");
    const storeM = bound(storageMoisturePct, HARRINGTON_LIMITS.moistureMinPct,
        HARRINGTON_LIMITS.moistureMaxPct, "Storage moisture", "%");

    if ([baseT, baseM, storeT, storeM].some((value) => value === null)) {
        return { ok: false, clamps, reason: "Baseline and storage temperature and moisture are all required." };
    }

    // Drier and colder than baseline both lengthen life, so the deltas are
    // baseline minus storage.
    const moistureDelta = baseM - storeM;
    const temperatureDeltaF = cToF(baseT) - cToF(storeT);

    const moistureMultiplier = Math.pow(2, moistureDelta);
    const temperatureMultiplier = Math.pow(2, temperatureDeltaF / 10);

    return {
        ok: true,
        clamps,
        moistureDelta,
        temperatureDeltaF,
        moistureMultiplier,
        temperatureMultiplier,
        multiplier: moistureMultiplier * temperatureMultiplier,
        applied: { baselineTemperatureC: baseT, baselineMoisturePct: baseM,
            storageTemperatureC: storeT, storageMoisturePct: storeM }
    };
}

// ---------------------------------------------------------------------------
// Hundred Rule
// ---------------------------------------------------------------------------

/**
 * Temperature in F plus relative humidity in percent should stay under 100.
 *
 * A screening heuristic with no species term and no time term, so it is
 * reported as an indicator and never multiplied into a longevity figure. The
 * frequently repeated "and no more than half from temperature" clause has no
 * primary source and is not implemented.
 */
export function hundredRule({ temperatureC, relativeHumidityPct } = {}) {
    if (!isNumber(temperatureC) || !isNumber(relativeHumidityPct)) return null;
    const temperatureF = cToF(temperatureC);
    const sum = temperatureF + relativeHumidityPct;
    return {
        temperatureF,
        relativeHumidityPct,
        sum,
        pass: sum < 100,
        margin: 100 - sum,
        detail: sum < 100
            ? `${temperatureF.toFixed(0)} °F + ${relativeHumidityPct.toFixed(0)}% RH = ${sum.toFixed(0)}, under 100.`
            : `${temperatureF.toFixed(0)} °F + ${relativeHumidityPct.toFixed(0)}% RH = ${sum.toFixed(0)}, over 100. `
              + "Drop the temperature, the humidity, or both."
    };
}

// ---------------------------------------------------------------------------
// Longevity projection
// ---------------------------------------------------------------------------

/** Published baseline longevity across sources, kept as a span. */
export function summariseLongevity(record) {
    const entries = (record && record.longevity) || [];
    const rows = entries.map((entry) => ({
        sourceKey: entry.sourceKey,
        reference: SEED_REFERENCES[entry.sourceKey] || null,
        cropLabel: entry.cropLabel || (record ? record.scientificName : ""),
        years: entry.years,
        condition: entry.condition || null,
        low: isNumber(entry.years.value) ? entry.years.value : entry.years.low,
        high: isNumber(entry.years.value) ? entry.years.value : entry.years.high
    })).filter((row) => isNumber(row.low) && isNumber(row.high));

    if (!rows.length) return { rows: [], span: null };
    return {
        rows,
        span: {
            low: Math.min(...rows.map((row) => row.low)),
            high: Math.max(...rows.map((row) => row.high))
        }
    };
}

/**
 * Apply the Harrington multiplier to the published baseline longevity span.
 *
 * The result is a band because the inputs are a band. Anything
 * past the evidence horizon is still reported but explicitly marked as an
 * extrapolation beyond any measurement.
 */
export function projectLongevity({ record, multiplier, gate }) {
    const baseline = summariseLongevity(record);
    if (!gate || !gate.allowLongevity) {
        return { ok: false, reason: "gated", baseline, gate };
    }
    if (!baseline.span) {
        return { ok: false, reason: "no-baseline", baseline, gate };
    }
    if (!multiplier || !multiplier.ok) {
        return { ok: false, reason: "no-multiplier", baseline, gate };
    }

    const low = baseline.span.low * multiplier.multiplier;
    const high = baseline.span.high * multiplier.multiplier;
    const warnings = [];

    if (high > EVIDENCE_HORIZON_YEARS) {
        warnings.push(
            `Projection reaches ${Math.round(high).toLocaleString()} years. Nothing in the literature supports `
            + `storage life beyond roughly ${EVIDENCE_HORIZON_YEARS.toLocaleString()} years. The oldest reliably `
            + "germinated seed is a date palm of about 2,000 years. Read anything past this as "
            + "\"longer than you will ever need\", not as a forecast."
        );
    }
    if (multiplier.multiplier > 1000) {
        warnings.push(
            `Harrington's rules compound to ${Math.round(multiplier.multiplier).toLocaleString()}x here. `
            + "They are thumb-rules calibrated over ordinary storage, and no source validates them across "
            + "their whole range. The Ellis-Roberts viability equation is the right tool at genebank conditions."
        );
    }

    return {
        ok: true,
        baseline,
        gate,
        multiplier,
        years: { low, high },
        beyondEvidence: high > EVIDENCE_HORIZON_YEARS,
        warnings
    };
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

export const DEFAULT_INPUTS = Object.freeze({
    speciesId: "lactuca-sativa",
    baselineTemperatureC: DEFAULT_BASELINE.temperatureC,
    baselineMoisturePct: DEFAULT_BASELINE.moisturePct,
    storageTemperatureC: 5,
    storageMoisturePct: 6,
    storageRelativeHumidityPct: 30,
    measuredSeedCount: null,
    measuredSampleMass: null,
    measuredSampleMassUnit: "g",
    packetMass: null,
    packetMassUnit: "g"
});

export function runSeedModel(rawInputs = {}) {
    const inputs = { ...DEFAULT_INPUTS, ...rawInputs };
    const record = getSpeciesById(inputs.speciesId);
    const gate = evaluateSpeciesGate(record);
    const counts = summariseCounts(record);

    const measured = (isNumber(inputs.measuredSeedCount) && isNumber(inputs.measuredSampleMass))
        ? countFromMeasurement({
            seedCount: inputs.measuredSeedCount,
            sampleMass: inputs.measuredSampleMass,
            sampleMassUnit: inputs.measuredSampleMassUnit
        })
        : null;

    const multiplier = harringtonMultiplier({
        baselineTemperatureC: inputs.baselineTemperatureC,
        baselineMoisturePct: inputs.baselineMoisturePct,
        storageTemperatureC: inputs.storageTemperatureC,
        storageMoisturePct: inputs.storageMoisturePct
    });

    const projection = projectLongevity({ record, multiplier, gate });
    const rule = hundredRule({
        temperatureC: inputs.storageTemperatureC,
        relativeHumidityPct: inputs.storageRelativeHumidityPct
    });

    // Measured beats published, always.
    const activePerLb = measured && measured.ok
        ? { low: measured.perLb, high: measured.perLb, basis: "measured" }
        : counts.span
            ? { ...counts.span.perLb, basis: "published" }
            : null;

    let packet = null;
    if (activePerLb && isNumber(inputs.packetMass) && inputs.packetMass > 0) {
        const grams = inputs.packetMassUnit === "oz" ? inputs.packetMass * GRAMS_PER_OZ
            : inputs.packetMassUnit === "lb" ? inputs.packetMass * GRAMS_PER_LB
            : inputs.packetMass;
        packet = {
            grams,
            basis: activePerLb.basis,
            seeds: {
                low: (activePerLb.low / GRAMS_PER_LB) * grams,
                high: (activePerLb.high / GRAMS_PER_LB) * grams
            }
        };
    }

    return {
        inputs,
        record,
        gate,
        counts,
        measured,
        measuredVsPublished: compareMeasuredToPublished(measured, counts),
        multiplier,
        projection,
        hundredRule: rule,
        packet
    };
}
