// Seed Storage Lab model: species lookup, seed counts, the species gate,
// Harrington's rules, the Hundred Rule indicator, and the hand-off to the
// Ellis-Roberts viability equation and the storage tier model.
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
import { defaultHorizonDays, predictSpecies } from "./seed-viability-engine.js";
import { MONTE_CARLO_LIMITS, runViabilityMonteCarlo } from "./seed-monte-carlo.js";
import { evaluateStorage } from "./seed-storage-tiers.js";

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
// against the Ellis-Roberts data. Harrington gave 5-14% MC and 0-50 °C
// (Justice & Bass 1978).
export const HARRINGTON_LIMITS = Object.freeze({
    temperatureMinC: 0,
    temperatureMaxC: 50,
    moistureMinPct: 5,
    moistureMaxPct: 14
});

// Even fully inside the valid box, Harrington compounds to 262,000-524,000x
// between the worst and best corners. Applied to a 3-year vendor figure that is
// up to 1.6 million years, which no evidence supports. Projections past this horizon
// are still computed and reported, but flagged as beyond anything measured.
export const EVIDENCE_HORIZON_YEARS = 1000;

// Above this ratio, two sources disagree; below it, the gap is ordinary
// lot-to-lot scatter. 1.3x is loose enough to absorb rounding and cultivar
// differences, tight enough to catch every conflict the audit found: 32 of the
// 53 species with more than one count source, spanning 1.32x to 14.25x.
const COUNT_DISAGREEMENT_RATIO = 1.3;

// Under this, rounding on a 0.1 g kitchen scale is worth more than 1%.
const SMALL_SAMPLE_GRAMS = 5;

export const cToF = (c) => (c * 9) / 5 + 32;
export const fToC = (f) => ((f - 32) * 5) / 9;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
// Up to three significant figures, for numbers that go into sentences.
const nfPlain = (value) => String(Number(value.toPrecision(3)));
const round1 = (value) => Math.round(value * 10) / 10;

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
            detail: (`Recalcitrant seed dies if dried to storage moisture${via}. `
                + "Harrington's rules and the viability equation both assume dry orthodox seed, so no storage life is projected here. "
                + "Keep it moist. The 1996 compendium gives about -3 to 5 °C for species from temperate climates, with oak keeping over 3 years at -3 °C, "
                + "and 7-17 °C for tropical species, many of which are injured by chilling and keep weeks to months. "
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
            detail: (`Tolerates drying only part of the way and keeps worse if dried further${via}. `
                + "The 1996 compendium puts that point at about 7-12% moisture for the species it describes, and tropical species such as coffee and papaya also keep worse below about 10 °C. "
                + "The dry-storage model does not apply; treat published longevity as months to a few years, not decades. "
                + (flag.note || "") + overruled).trim(),
            reference,
            conflict
        };
    }

    // A genus grouped by nursery practice, which is none of the three
    // categories. Its species are refused until a species record settles them.
    if (behaviour === "unconfirmed") {
        return {
            status: GATE_STATUS.CAUTION,
            allowLongevity: false,
            behaviour,
            headline: `Storage behaviour not confirmed for ${speciesDisplayName(record)}`,
            detail: (`${flag.note || ""}${via} Storage life is withheld until a species-level record confirms the seed is orthodox.`
                + overruled).trim(),
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
// Crop groups
// ---------------------------------------------------------------------------

// One species is often several vegetables. Brassica oleracea is broccoli,
// cabbage, cauliflower, kale, kohlrabi and brussels sprouts at once; Beta
// vulgaris is beetroot and chard; Brassica rapa is turnip and chinese cabbage.
// Every source row already names its crop, and pooling them produced two
// visible defects: a search for kale answered "broccoli", and the min/max
// across seven vegetables was reported as sources disagreeing 2.04x when the
// sources agree and the crops differ. Rows are grouped by crop, and a row that
// names no crop is a species-level measurement that belongs to all of them.

// "Brussels Sprouts" and "Brussel Sprouts" are one crop; "Cabbage" and
// "Cabbage, Napa" are two. Sorting the tokens folds "Sweet Corn" into
// "Corn, Sweet", and singularising folds the plurals, without merging crops
// that genuinely differ by a qualifier.
function singularise(word) {
    // "Tomatoes" needs the es; "peas" is only four letters; "grass" must not
    // become "gras". Getting any of the three wrong splits a crop in two.
    if (word.length > 4 && /(?:o|s|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
    return word;
}

export function cropGroupKey(label) {
    return String(label || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map(singularise)
        .sort()
        .join(" ");
}

const CROP_BUCKETS = ["counts", "longevity", "germination"];

// Vendors publish one figure for two crops: "Cilantro/Coriander" (the same
// plant twice), "Celery & Celeriac", "Endive/Escarole", "Squash & Gourds".
// Treated as a crop of its own, the row splits a crop in half and hides the
// figure that should sit beside its neighbour. It belongs to each crop it
// names instead, and forms no group of its own.
function combinedLabelParts(label) {
    const parts = String(label || "").split(/\s*(?:\/|&|\+| and )\s*/i)
        .map((part) => part.trim())
        .filter(Boolean);
    return parts.length > 1 ? parts : null;
}

function entryCropKeys(entry) {
    const label = (entry.cropLabel || "").trim();
    if (!label) return [];
    const parts = combinedLabelParts(label);
    if (!parts) return [cropGroupKey(label)];
    return parts.map(cropGroupKey).filter(Boolean);
}

/**
 * The distinct crops a species record covers, in display order.
 *
 * Returns [] when every row is species-level, which is the common case: only
 * 30 of 1,047 taxa carry rows for more than one crop.
 */
export function cropGroups(record) {
    if (!record) return [];
    const groups = new Map();
    const combined = [];
    for (const bucket of CROP_BUCKETS) {
        for (const entry of record[bucket] || []) {
            const label = (entry.cropLabel || "").trim();
            if (!label) continue;
            if (combinedLabelParts(label)) {
                combined.push(entry);
                continue;
            }
            const key = cropGroupKey(label);
            if (!key) continue;
            const group = groups.get(key) || { key, label, rows: 0 };
            // Prefer the shortest spelling as the display label, so the list
            // reads "Kale" rather than whichever source happened to come first.
            if (label.length < group.label.length) group.label = label;
            group.rows += 1;
            groups.set(key, group);
        }
    }

    // A combined row whose crops are all absent is the only evidence held, so
    // it becomes a group rather than vanishing. Cucurbita pepo's
    // "Squash & Gourds" names neither Pumpkin nor Summer Squash.
    for (const entry of combined) {
        const keys = entryCropKeys(entry);
        if (keys.some((key) => groups.has(key))) {
            for (const key of keys) {
                if (groups.has(key)) groups.get(key).rows += 1;
            }
            continue;
        }
        const label = entry.cropLabel.trim();
        const key = cropGroupKey(label);
        const group = groups.get(key) || { key, label, rows: 0 };
        group.rows += 1;
        groups.set(key, group);
    }

    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** True when a row applies to the species as a whole rather than one crop. */
function isSpeciesLevel(entry) {
    return !((entry.cropLabel || "").trim());
}

function matchesCrop(entry, cropKey) {
    if (!cropKey) return true;
    if (isSpeciesLevel(entry)) return true;
    const keys = entryCropKeys(entry);
    if (keys.includes(cropKey)) return true;
    // A combined row that names no crop the species holds applies to all of
    // them, which is the reading that loses no data.
    return keys.length > 1 && cropGroupKey(entry.cropLabel) === cropKey;
}

/**
 * Pick the crop a search term meant, falling back to the first one held.
 *
 * Typing "kale" has to land on kale, not on whichever crop happens to be
 * alphabetically first inside Brassica oleracea.
 */
export function resolveCropGroup(record, hint) {
    const groups = cropGroups(record);
    if (!groups.length) return null;
    const tokens = tokenize(hint);
    if (tokens.length) {
        const exact = groups.find((group) => group.key === cropGroupKey(tokens.join(" ")));
        if (exact) return exact;
        const partial = groups.find((group) => {
            const words = group.key.split(" ");
            return tokens.every((token) => words.some((word) => word.startsWith(token)));
        });
        if (partial) return partial;
    }
    return groups[0];
}

/** The name to show for a record once the crop is known. */
export function cropDisplayName(record, cropKey) {
    if (!record) return "";
    const group = cropGroups(record).find((entry) => entry.key === cropKey);
    if (!group) return speciesDisplayName(record);
    return `${group.label} (${record.scientificName})`;
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
export function summariseCounts(record, { cropKey = null } = {}) {
    const entries = ((record && record.counts) || []).filter((entry) => matchesCrop(entry, cropKey));
    const rows = [];

    for (const entry of entries) {
        const perLb = entryToPerLb(entry);
        if (!perLb) continue;
        rows.push({
            sourceKey: entry.sourceKey,
            reference: SEED_REFERENCES[entry.sourceKey] || null,
            cropLabel: entry.cropLabel || (record ? record.scientificName : ""),
            speciesLevel: isSpeciesLevel(entry),
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
        return { rows: [], span: null, disagreement: false, ratio: null, speciesLevelRows: 0 };
    }

    const low = Math.min(...rows.map((row) => row.perLb.low));
    const high = Math.max(...rows.map((row) => row.perLb.high));
    const ratio = low > 0 ? high / low : null;

    return {
        rows,
        span: { perLb: { low, high }, perOz: { low: low / OZ_PER_LB, high: high / OZ_PER_LB } },
        ratio,
        disagreement: isNumber(ratio) && ratio > COUNT_DISAGREEMENT_RATIO,
        speciesLevelRows: rows.filter((row) => row.speciesLevel).length
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

    // One seed miscounted is 1/n of the result.
    if (seedCount < 25) {
        result.warnings.push(
            `In a ${seedCount}-seed sample each seed miscounted is a ${(100 / seedCount).toFixed(0)}% counting error, `
            + "and too few seeds average out differences in size. Count at least 100 seeds for a reliable figure."
        );
    }
    // A scale rounds to half its step, so a 0.1 g scale can be 0.05 g out.
    if (grams < SMALL_SAMPLE_GRAMS) {
        const error = (0.05 / grams) * 100;
        const size = error >= 100
            ? `A kitchen scale reading to 0.1 g cannot tell ${nfPlain(grams)} g from nothing.`
            : `On a kitchen scale reading to 0.1 g, rounding alone can put a ${nfPlain(grams)} g reading up to `
              + `${error >= 10 ? error.toFixed(0) : error.toFixed(1)}% out${error < 10 ? ", and ten times that on a scale reading to 1 g" : ""}.`;
        result.warnings.push(`${size} Weigh a larger sample or use a 0.001 g jeweller's scale.`);
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

// The universal temperature terms of the viability equation (Dickie & Ellis
// 1990), shared by every species, so they give a measured temperature curve.
export const UNIVERSAL_CH = 0.0329;
export const UNIVERSAL_CQ = 0.000478;

export const TEMPERATURE_METHODS = Object.freeze({
    fahrenheit10: "Harrington, halving per 10 °F",
    celsius5: "Harrington, halving per 5 °C",
    ellisRoberts: "Ellis-Roberts temperature terms"
});

/**
 * Life at the storage temperature relative to the baseline, three ways. The
 * sources state Harrington's rule as 10 °F or as 5 °C, and the measured curve
 * falls outside both below about 35 °C, so the span of all three is reported.
 */
export function temperatureFactors(baselineC, storageC) {
    const methods = {
        fahrenheit10: Math.pow(2, (cToF(baselineC) - cToF(storageC)) / 10),
        celsius5: Math.pow(2, (baselineC - storageC) / 5),
        ellisRoberts: Math.pow(10, UNIVERSAL_CH * (baselineC - storageC)
            + UNIVERSAL_CQ * (baselineC * baselineC - storageC * storageC))
    };
    const entries = Object.entries(methods);
    const [lowMethod, low] = entries.reduce((best, entry) => (entry[1] < best[1] ? entry : best));
    const [highMethod, high] = entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
    return { methods, low, high, lowMethod, highMethod };
}

/**
 * life_multiplier = 2^(dMC%) x temperature factor
 *
 * Both factors are relative to the baseline the published longevity figure is
 * assumed to describe. The temperature factor is a span across three methods;
 * `multiplier` keeps the 10 °F form for the checks that test that rule alone.
 * Inputs are clamped into the validity box and every clamp is reported,
 * because a silently clamped input produces a plausible-looking number from an
 * invalid question.
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
                message: `${label} ${round1(value)}${unit} is outside the range this tool applies Harrington's rules over `
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
    const temperature = temperatureFactors(baseT, storeT);
    const temperatureMultiplier = temperature.methods.fahrenheit10;

    return {
        ok: true,
        clamps,
        moistureDelta,
        temperatureDeltaF,
        temperatureDeltaC: baseT - storeT,
        moistureMultiplier,
        temperatureMultiplier,
        temperature,
        multiplier: moistureMultiplier * temperatureMultiplier,
        range: { low: moistureMultiplier * temperature.low, high: moistureMultiplier * temperature.high },
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
    // Within half a point of 100 a whole number would round onto the line.
    const digits = Math.abs(sum - 100) < 0.5 ? 1 : 0;
    const shown = (value) => value.toFixed(digits);
    return {
        temperatureF,
        relativeHumidityPct,
        sum,
        pass: sum < 100,
        margin: 100 - sum,
        shownSum: shown(sum),
        detail: sum < 100
            ? `${shown(temperatureF)} °F + ${shown(relativeHumidityPct)}% RH = ${shown(sum)}, under 100.`
            : `${shown(temperatureF)} °F + ${shown(relativeHumidityPct)}% RH = ${shown(sum)}, ${sum === 100 ? "not under" : "over"} 100. `
              + "Drop the temperature, the humidity, or both."
    };
}

// ---------------------------------------------------------------------------
// Longevity projection
// ---------------------------------------------------------------------------

/** Published baseline longevity across sources, kept as a span. */
export function summariseLongevity(record, { cropKey = null } = {}) {
    const entries = ((record && record.longevity) || []).filter((entry) => matchesCrop(entry, cropKey));
    const rows = entries.map((entry) => ({
        sourceKey: entry.sourceKey,
        reference: SEED_REFERENCES[entry.sourceKey] || null,
        cropLabel: entry.cropLabel || (record ? record.scientificName : ""),
        speciesLevel: isSpeciesLevel(entry),
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
export function projectLongevity({ record, multiplier, gate, cropKey = null, storage = null }) {
    const baseline = summariseLongevity(record, { cropKey });
    if (!gate || !gate.allowLongevity) {
        return { ok: false, reason: "gated", baseline, gate };
    }
    if (storage && storage.override && storage.override.kind === "primed") {
        return { ok: false, reason: "primed", baseline, gate };
    }
    if (storage && storage.tier === "absorber-only") {
        return { ok: false, reason: "absorber-only", baseline, gate };
    }
    if (!baseline.span) {
        return { ok: false, reason: "no-baseline", baseline, gate };
    }
    if (!multiplier || !multiplier.ok) {
        return { ok: false, reason: "no-multiplier", baseline, gate };
    }

    // Oxygen lifts only the upper end: the size of the effect is measured on
    // one species, and some studies found none.
    const oxygenFactor = storage ? storage.oxygen.multiplier : 1;
    let low = baseline.span.low * multiplier.range.low;
    let high = baseline.span.high * multiplier.range.high * oxygenFactor;
    const capYears = storage && storage.override ? storage.override.capYears : null;
    if (capYears !== null) {
        low = Math.min(low, capYears);
        high = Math.min(high, capYears);
    }
    const warnings = [];

    if (high > EVIDENCE_HORIZON_YEARS) {
        warnings.push(
            `Projection reaches ${Math.round(high).toLocaleString()} years. No seed lot in storage has been followed `
            + `for anywhere near ${EVIDENCE_HORIZON_YEARS.toLocaleString()} years. Read anything past that as `
            + "\"longer than you will ever need\", not as a forecast."
        );
    }
    const combined = multiplier.range.high * oxygenFactor;
    if (combined > 1000) {
        warnings.push(
            `Harrington's rules${oxygenFactor > 1 ? " and the oxygen factor" : ""} compound to ${Math.round(combined).toLocaleString()}x here. `
            + "They are thumb-rules calibrated over ordinary storage, and no source validates them across "
            + "their whole range. The Ellis-Roberts viability equation is the right tool at genebank conditions."
        );
    }

    return {
        ok: true,
        baseline,
        gate,
        multiplier,
        oxygenFactor,
        capYears,
        years: { low, high },
        beyondEvidence: high > EVIDENCE_HORIZON_YEARS,
        warnings
    };
}

// ---------------------------------------------------------------------------
// Viability equation
// ---------------------------------------------------------------------------

/**
 * Run the Ellis-Roberts equation where constants exist and the gate allows.
 * A woody species with no behaviour record still runs: published constants
 * are evidence the seed survives drying.
 */
export function evaluateViability({ record, gate, storageMoisturePct, storageTemperatureC,
    initialGerminationPct, targetGerminationPct, storage = null }) {
    const hasConstants = Boolean(record && record.constants && record.constants.length);
    if (!hasConstants) return { ok: false, reason: "no-constants" };
    if (storage && storage.override) {
        return { ok: false, reason: "not-applicable",
            detail: `The constants were fitted on raw seed, and ${storage.override.kind} seed ages faster.` };
    }
    if (storage && storage.tier === "absorber-only") {
        return { ok: false, reason: "not-applicable",
            detail: "An absorber without a desiccant can raise the humidity in the jar, so the moisture content entered no longer holds." };
    }

    const unrecorded = Boolean(gate) && !gate.behaviour;
    if (!gate || (!gate.allowLongevity && !unrecorded)) {
        return { ok: false, reason: "gated", gate };
    }

    const result = predictSpecies(record, {
        moisturePct: storageMoisturePct,
        temperatureC: storageTemperatureC,
        initialViabilityPct: initialGerminationPct,
        targetViabilityPct: targetGerminationPct
    });
    if (!result.ok) return { ok: false, reason: "not-applicable", detail: result.reason, determinations: result.determinations };

    const longestYears = result.daysToHalf.high / 365.25;
    return {
        ...result,
        // True when the Harrington gate refused and the constants let it through.
        admittedByConstants: !gate.allowLongevity,
        beyondEvidence: longestYears > EVIDENCE_HORIZON_YEARS
    };
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

export const DEFAULT_INPUTS = Object.freeze({
    speciesId: "lactuca-sativa",
    cropKey: null,
    baselineTemperatureC: DEFAULT_BASELINE.temperatureC,
    baselineMoisturePct: DEFAULT_BASELINE.moisturePct,
    storageTemperatureC: 5,
    storageMoisturePct: 6,
    storageRelativeHumidityPct: 30,
    // 85% is the usual genebank regeneration standard.
    initialGerminationPct: 95,
    targetGerminationPct: 85,
    container: "gasket",
    vacuumResidualPct: 100,
    oxygenAbsorber: false,
    absorberCapacityMl: 100,
    desiccant: true,
    containerMl: 500,
    seedMassG: 50,
    seedVolumeMl: null,
    horizonYears: 5,
    seedTreatment: "raw",
    // Placeholders for how well the user knows their own inputs.
    moistureSpreadPct: 1,
    temperatureSpreadC: 2,
    testSeeds: 100,
    monteCarloDraws: MONTE_CARLO_LIMITS.drawsDefault,
    monteCarloSeed: MONTE_CARLO_LIMITS.seedDefault,
    measuredSeedCount: null,
    measuredSampleMass: null,
    measuredSampleMassUnit: "g",
    packetMass: null,
    packetMassUnit: "g"
});

// The Monte Carlo is the slow step, so its last result is kept and reused
// while none of its own inputs change.
let lastMonteCarlo = { key: null, result: null };

function cachedMonteCarlo(record, options) {
    const key = JSON.stringify([record.id, options]);
    if (lastMonteCarlo.key !== key) lastMonteCarlo = { key, result: runViabilityMonteCarlo(record, options) };
    return lastMonteCarlo.result;
}

export function runSeedModel(rawInputs = {}) {
    const inputs = { ...DEFAULT_INPUTS, ...rawInputs };
    const record = getSpeciesById(inputs.speciesId);
    const gate = evaluateSpeciesGate(record);

    // A species covering several crops must resolve to one before any number is
    // reported, or the answer is a blend of vegetables. Absent a choice, the
    // first crop held wins, which keeps single-crop species behaving as before.
    const groups = cropGroups(record);
    const activeGroup = groups.find((group) => group.key === inputs.cropKey)
        || (groups.length ? groups[0] : null);
    const cropKey = activeGroup ? activeGroup.key : null;

    const counts = summariseCounts(record, { cropKey });

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

    const storage = evaluateStorage({
        container: inputs.container,
        vacuumResidualPct: inputs.vacuumResidualPct,
        absorber: inputs.oxygenAbsorber,
        absorberCapacityMl: inputs.absorberCapacityMl,
        desiccant: inputs.desiccant,
        containerMl: inputs.containerMl,
        seedMassG: inputs.seedMassG,
        seedVolumeMl: inputs.seedVolumeMl,
        horizonYears: inputs.horizonYears,
        seedTreatment: inputs.seedTreatment,
        rhPct: inputs.storageRelativeHumidityPct,
        moisturePct: inputs.storageMoisturePct,
        temperatureC: inputs.storageTemperatureC
    });
    const projection = projectLongevity({ record, multiplier, gate, cropKey, storage });
    const viability = evaluateViability({
        record,
        gate,
        storageMoisturePct: inputs.storageMoisturePct,
        storageTemperatureC: inputs.storageTemperatureC,
        initialGerminationPct: inputs.initialGerminationPct,
        targetGerminationPct: inputs.targetGerminationPct,
        storage
    });
    const monteCarlo = viability.ok
        ? cachedMonteCarlo(record, {
            moisturePct: inputs.storageMoisturePct,
            moistureSpreadPct: inputs.moistureSpreadPct,
            temperatureC: inputs.storageTemperatureC,
            temperatureSpreadC: inputs.temperatureSpreadC,
            initialViabilityPct: inputs.initialGerminationPct,
            testSeeds: inputs.testSeeds,
            targetViabilityPct: inputs.targetGerminationPct,
            draws: inputs.monteCarloDraws,
            seed: inputs.monteCarloSeed,
            minHorizonDays: Math.max(...viability.determinations.filter((entry) => entry.ok).map(defaultHorizonDays))
        })
        : null;
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
        cropGroups: groups,
        cropGroup: activeGroup,
        cropKey,
        germination: ((record && record.germination) || []).filter((entry) => matchesCrop(entry, cropKey)),
        displayName: activeGroup ? cropDisplayName(record, cropKey) : speciesDisplayName(record),
        gate,
        counts,
        measured,
        measuredVsPublished: compareMeasuredToPublished(measured, counts),
        multiplier,
        projection,
        viability,
        monteCarlo,
        storage,
        hundredRule: rule,
        packet
    };
}
