// Literature-anchored checks panel for the Seed Storage Lab.
//
// These run on every model evaluation and are visible in the UI. They cover
// what would be dangerous or embarrassing to get wrong: the safety gate, the
// corrections, and the citation chain. The math modal covers the equations.

import {
    DEFAULT_BASELINE,
    HARRINGTON_LIMITS,
    countFromMeasurement,
    evaluateSpeciesGate,
    findUnreadableCountEntries,
    getSpeciesById,
    harringtonMultiplier,
    hundredRule,
    runSeedModel,
    searchSpecies,
    summariseCounts,
    cropGroups,
    cropGroupKey,
    cToF
} from "./seed-model.js";
import { SEED_SPECIES } from "./seed-species-data.js";
import { SEED_REFERENCES } from "./seed-source-map.js";

function check({ id, title, reference, fixture, benchmark, pass, detail }) {
    return { id, title, reference: reference || null, fixture, benchmark, status: pass ? "pass" : "fail", detail };
}

export function evaluateSeedChecks() {
    const checks = [];

    // ---- Safety gate ------------------------------------------------------

    const recalcitrant = SEED_SPECIES.filter(
        (record) => record.behaviour && record.behaviour.behaviour === "recalcitrant"
    );
    const recalcitrantWithCounts = recalcitrant.filter((record) => record.counts && record.counts.length);
    const anyProjected = recalcitrantWithCounts.some(
        (record) => runSeedModel({ speciesId: record.id }).projection.ok
    );
    checks.push(check({
        id: "gate-blocks-recalcitrant",
        title: "No recalcitrant species receives a storage-life projection",
        reference: SEED_REFERENCES.ipgri1996,
        fixture: `Fixture: every one of the ${recalcitrantWithCounts.length} recalcitrant species that carries a seed count.`,
        benchmark: "Recalcitrant seed dies on drying, so a dry-storage projection for any of them is a safety defect.",
        pass: !anyProjected,
        detail: anyProjected
            ? "At least one recalcitrant species produced a longevity projection."
            : `All ${recalcitrantWithCounts.length} are blocked, and all still report their seed counts.`
    }));

    const oakCounts = summariseCounts(getSpeciesById("quercus-rubra"));
    checks.push(check({
        id: "gate-keeps-counts",
        title: "Gated species still answer the seed-count question",
        reference: SEED_REFERENCES.wpsm,
        fixture: "Fixture: Quercus rubra (northern red oak), recalcitrant, with a Woody Plant Seed Manual count.",
        benchmark: "Counting acorns per pound is useful and harmless; only the longevity model has to refuse.",
        pass: oakCounts.rows.length > 0,
        detail: oakCounts.rows.length
            ? `${oakCounts.rows.length} count source(s) available while the longevity model stays blocked.`
            : "No seed counts survived the gate, which over-blocks."
    }));

    const silver = evaluateSpeciesGate(getSpeciesById("acer-saccharinum"));
    const norway = evaluateSpeciesGate(getSpeciesById("acer-platanoides"));
    checks.push(check({
        id: "gate-species-over-genus",
        title: "Species-level behaviour overrides the genus",
        reference: SEED_REFERENCES.ipgri1996,
        fixture: "Fixture: Acer saccharinum (recalcitrant) against Acer platanoides (orthodox).",
        benchmark: "A genus-wide rule would be wrong in both directions for Acer.",
        pass: silver.allowLongevity === false && norway.allowLongevity === true,
        detail: `A. saccharinum → ${silver.status}; A. platanoides → ${norway.status}.`
    }));

    const garlic = searchSpecies("garlic", { limit: 3 });
    const garlicGate = garlic.length ? evaluateSpeciesGate(garlic[0]) : null;
    checks.push(check({
        id: "vegetative-answers",
        title: "Vegetatively propagated crops explain themselves",
        reference: SEED_REFERENCES.ipgri1996,
        fixture: "Fixture: search for \"garlic\", which appears in no seed-count dataset.",
        benchmark: "The honest answer explains vegetative propagation instead of reporting no match.",
        pass: Boolean(garlicGate) && garlicGate.status === "not_applicable",
        detail: garlicGate ? garlicGate.headline : "Garlic was not findable at all."
    }));

    const overruled = SEED_SPECIES.filter((record) => record.behaviour && record.behaviour.overruled);
    const silentConflicts = overruled.filter((record) => {
        const gate = evaluateSpeciesGate(record);
        return !gate.conflict || !gate.detail.includes(record.behaviour.overruled.matchedTaxon);
    });
    const downgraded = overruled.filter(
        (record) => record.behaviour.overruled.behaviour === "recalcitrant"
            && record.behaviour.behaviour === "orthodox"
    );
    checks.push(check({
        id: "behaviour-conflicts-reported",
        title: "An overruled storage-behaviour source is named, not discarded",
        reference: SEED_REFERENCES.kewCompendium1998,
        fixture: `Fixture: all ${overruled.length} taxa whose resolved behaviour disagrees with a lower-precedence source.`,
        benchmark: `Every one states what it overruled. ${downgraded.length} taxa leave a recalcitrant genus flag for an orthodox species record and still receive a projection, so the disagreement has to be on screen.`,
        pass: silentConflicts.length === 0,
        detail: silentConflicts.length
            ? `${silentConflicts.length} conflicts resolved without telling the user, starting with ${silentConflicts[0].scientificName}.`
            : `All ${overruled.length} report the overruled source; the ${downgraded.length} downgraded from recalcitrant also drop to caution.`
    }));

    // ---- Harrington -------------------------------------------------------

    const identity = harringtonMultiplier({
        baselineTemperatureC: DEFAULT_BASELINE.temperatureC,
        baselineMoisturePct: DEFAULT_BASELINE.moisturePct,
        storageTemperatureC: DEFAULT_BASELINE.temperatureC,
        storageMoisturePct: DEFAULT_BASELINE.moisturePct
    });
    checks.push(check({
        id: "harrington-identity",
        title: "Storing at the baseline leaves published longevity unchanged",
        reference: SEED_REFERENCES.harrington1972,
        fixture: `Fixture: storage conditions set equal to the ${DEFAULT_BASELINE.label} baseline.`,
        benchmark: "The multiplier must be exactly 1, or every projection carries a hidden bias.",
        pass: Math.abs(identity.multiplier - 1) < 1e-12,
        detail: `Multiplier ${identity.multiplier.toFixed(9)}×.`
    }));

    const doubling = harringtonMultiplier({
        baselineTemperatureC: 20, baselineMoisturePct: 8,
        storageTemperatureC: 20, storageMoisturePct: 7
    });
    checks.push(check({
        id: "harrington-doubling",
        title: "One point of moisture doubles storage life",
        reference: SEED_REFERENCES.harrington1972,
        fixture: "Fixture: 8% → 7% moisture content at constant temperature.",
        benchmark: "Harrington's moisture rule gives exactly 2×.",
        pass: Math.abs(doubling.multiplier - 2) < 1e-9,
        detail: `Multiplier ${doubling.multiplier.toFixed(6)}×.`
    }));

    const clamped = harringtonMultiplier({
        baselineTemperatureC: 5, baselineMoisturePct: 8,
        storageTemperatureC: -18, storageMoisturePct: 3
    });
    checks.push(check({
        id: "harrington-clamps-reported",
        title: "Out-of-range conditions are clamped and said so",
        reference: SEED_REFERENCES.ellisRoberts1980,
        fixture: "Fixture: -18 °C freezer storage at 3% moisture content.",
        benchmark: `Both fall outside Harrington's validity box (${HARRINGTON_LIMITS.temperatureMinC}-${HARRINGTON_LIMITS.temperatureMaxC} °C, ${HARRINGTON_LIMITS.moistureMinPct}-${HARRINGTON_LIMITS.moistureMaxPct}% MC), so both must be clamped with a visible warning. Genebank conditions need the Ellis-Roberts equation instead.`,
        pass: clamped.clamps.length === 2,
        detail: clamped.clamps.length === 2
            ? "Both clamps reported to the user."
            : `${clamped.clamps.length} clamp(s) reported; expected 2.`
    }));

    const ceiling = harringtonMultiplier({
        baselineTemperatureC: DEFAULT_BASELINE.temperatureC,
        baselineMoisturePct: DEFAULT_BASELINE.moisturePct,
        storageTemperatureC: HARRINGTON_LIMITS.temperatureMinC,
        storageMoisturePct: HARRINGTON_LIMITS.moistureMinPct
    });
    checks.push(check({
        id: "baseline-bounds-compounding",
        title: "The default baseline bounds how far the rules can compound",
        reference: SEED_REFERENCES.harrington1972,
        fixture: `Fixture: the best conditions the rules allow (${HARRINGTON_LIMITS.temperatureMinC} °C, ${HARRINGTON_LIMITS.moistureMinPct}% MC) from the default baseline.`,
        benchmark: "Under about 20×. Harrington compounds to ~75,000× across the whole validity box, but only a warm, damp baseline can reach that. The baseline is therefore an explicit input.",
        pass: ceiling.multiplier < 20,
        detail: `Ceiling from the default baseline is ${ceiling.multiplier.toFixed(1)}×.`
    }));

    // ---- Hundred Rule -----------------------------------------------------

    const cupboard = hundredRule({ temperatureC: 21, relativeHumidityPct: 55 });
    const fridge = hundredRule({ temperatureC: 5, relativeHumidityPct: 30 });
    checks.push(check({
        id: "hundred-rule-direction",
        title: "The Hundred Rule separates a cupboard from a fridge",
        reference: SEED_REFERENCES.usdaAH506,
        fixture: "Fixture: 21 °C at 55% RH against 5 °C at 30% RH.",
        benchmark: "70 °F + 55 = 125 fails; 41 °F + 30 = 71 passes.",
        pass: cupboard.pass === false && fridge.pass === true,
        detail: `${cupboard.detail} ${fridge.detail}`
    }));

    // ---- Data integrity ---------------------------------------------------

    const usedKeys = new Set();
    for (const record of SEED_SPECIES) {
        for (const bucket of ["counts", "longevity", "constants", "germination"]) {
            for (const entry of record[bucket] || []) {
                usedKeys.add(entry.sourceKey);
                for (const key of entry.corroboratedBy || []) usedKeys.add(key);
            }
        }
        if (record.behaviour) {
            usedKeys.add(record.behaviour.sourceKey);
            if (record.behaviour.overruled) usedKeys.add(record.behaviour.overruled.sourceKey);
        }
    }
    const orphanKeys = [...usedKeys].filter((key) => !SEED_REFERENCES[key]);
    checks.push(check({
        id: "citations-resolve",
        title: "Every datum resolves to a citation",
        reference: null,
        fixture: `Fixture: all ${usedKeys.size} source keys used anywhere in the generated dataset.`,
        benchmark: "A number the user cannot trace back to a page is not usable evidence.",
        pass: orphanKeys.length === 0,
        detail: orphanKeys.length
            ? `Unresolved source key(s): ${orphanKeys.join(", ")}.`
            : `All ${usedKeys.size} source keys resolve to a reference.`
    }));

    const orphanCounts = findUnreadableCountEntries();
    checks.push(check({
        id: "no-unreadable-counts",
        title: "No seed count is dropped on the way to the screen",
        reference: SEED_REFERENCES.wpsm,
        fixture: "Fixture: every count entry in the generated dataset, resolved to seeds per pound.",
        benchmark: "Zero unresolvable entries. Woody Plant Seed Manual rows that give only an observed low-high range used to land in a field the model never read, which deleted 34 oak counts with no error raised.",
        pass: orphanCounts.length === 0,
        detail: orphanCounts.length
            ? `${orphanCounts.length} count entries cannot be resolved, starting with ${orphanCounts[0].species} (${orphanCounts[0].sourceKey}).`
            : "Every count entry resolves to a weight basis."
    }));

    const tomato = summariseCounts(getSpeciesById("solanum-lycopersicum"));
    const correctedRow = tomato.rows.find((row) => row.sourceKey === "unlG2090" && row.correction);
    checks.push(check({
        id: "g2090-correction-applied",
        title: "The G2090 seeds-per-ounce correction survives into the browser",
        reference: SEED_REFERENCES.unlG2090,
        fixture: "Fixture: tomato, published at 250-430 seeds/gram but ~709-1,219 seeds/oz.",
        benchmark: "Rebuilt from the seeds/gram column to ~7,087-12,190 seeds/oz, carrying a visible note.",
        pass: Boolean(correctedRow) && correctedRow.perOz.low > 6500 && correctedRow.perOz.high < 13000,
        detail: correctedRow
            ? `Corrected to ${Math.round(correctedRow.perOz.low).toLocaleString()}-${Math.round(correctedRow.perOz.high).toLocaleString()} seeds/oz.`
            : "No corrected tomato entry found in the bundle."
    }));

    const multiCrop = SEED_SPECIES.filter((record) => cropGroups(record).length > 1);
    const pooled = multiCrop.filter((record) => {
        const model = runSeedModel({ speciesId: record.id });
        const labels = new Set(model.counts.rows
            .filter((row) => !row.speciesLevel)
            .map((row) => cropGroupKey(row.cropLabel)));
        return labels.size > 1;
    });
    checks.push(check({
        id: "crops-not-pooled",
        title: "A species covering several crops reports one crop at a time",
        reference: SEED_REFERENCES.unlG2090,
        fixture: `Fixture: all ${multiCrop.length} species holding rows for more than one crop.`,
        benchmark: "Brassica oleracea is broccoli, cabbage, cauliflower, kale, kohlrabi and brussels sprouts. Pooling them answered a search for kale with broccoli and reported the spread across seven vegetables as sources disagreeing 2.0x.",
        pass: pooled.length === 0,
        detail: pooled.length
            ? `${pooled.length} species still pool crops, starting with ${pooled[0].scientificName}.`
            : `All ${multiCrop.length} resolve to a single crop before any number is reported.`
    }));

    const lettuce = summariseCounts(getSpeciesById("lactuca-sativa"));
    checks.push(check({
        id: "conflicts-preserved",
        title: "Conflicting sources are kept apart, not averaged",
        reference: SEED_REFERENCES.osborne,
        fixture: "Fixture: lettuce, where Osborne gives 1,875-3,125 seeds/oz against 25,000 from G2090 and 25,267 from the thousand-seed-weight data.",
        benchmark: "Every determination kept separately, disagreement flagged. Two independent sources agree, which is what isolates Osborne as the outlier; an average would have destroyed that signal.",
        pass: lettuce.rows.length >= 3 && lettuce.disagreement === true,
        detail: `${lettuce.rows.length} determinations retained, spread ${lettuce.ratio ? lettuce.ratio.toFixed(1) : "n/a"}×.`
    }));

    // ---- Measured mode ----------------------------------------------------

    const measured = countFromMeasurement({ seedCount: 100, sampleMass: 3.2, sampleMassUnit: "g" });
    const model = runSeedModel({
        speciesId: "lactuca-sativa",
        measuredSeedCount: 100,
        measuredSampleMass: 3.2,
        measuredSampleMassUnit: "g",
        packetMass: 1
    });
    checks.push(check({
        id: "measured-takes-precedence",
        title: "A measured count overrides the lookup table",
        reference: SEED_REFERENCES.figshareTsw,
        fixture: "Fixture: 100 lettuce seeds weighing 3.2 g, with published counts also available.",
        benchmark: "Packet estimates should use the measured basis, with the published range demoted to a cross-check.",
        pass: measured.ok && model.packet !== null && model.packet.basis === "measured",
        detail: model.packet
            ? `Packet estimate uses the ${model.packet.basis} basis (${Math.round(measured.perLb).toLocaleString()} seeds/lb).`
            : "No packet estimate was produced."
    }));

    return checks;
}

export function summariseSeedChecks(checks) {
    const failed = checks.filter((entry) => entry.status === "fail");
    return {
        total: checks.length,
        passed: checks.length - failed.length,
        failed: failed.length,
        ok: failed.length === 0
    };
}

export { cToF };
