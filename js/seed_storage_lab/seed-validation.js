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
import { SPECIES_MOISTURE_LIMITS, predictDetermination, sigmaDays } from "./seed-viability-engine.js";
import { AIR_OXYGEN_PCT, evaluateStorage, oxygenMultiplier } from "./seed-storage-tiers.js";
import { runViabilityMonteCarlo } from "./seed-monte-carlo.js";

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
        reference: SEED_REFERENCES.usdaAH506,
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
        reference: SEED_REFERENCES.usdaAH506,
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
        reference: SEED_REFERENCES.usdaAH506,
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
        reference: SEED_REFERENCES.usdaAH506,
        fixture: `Fixture: the best conditions the rules allow (${HARRINGTON_LIMITS.temperatureMinC} °C, ${HARRINGTON_LIMITS.moistureMinPct}% MC) from the default baseline.`,
        benchmark: "Under about 20×. Harrington compounds to over 260,000× across the whole validity box, but only a warm, damp baseline can reach that. The baseline is therefore an explicit input.",
        pass: ceiling.range.high < 20,
        detail: `Ceiling from the default baseline is ${ceiling.range.low.toFixed(1)}-${ceiling.range.high.toFixed(1)}×.`
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

    // ---- Viability equation ------------------------------------------------

    const refusedBehaviours = new Set(["recalcitrant", "intermediate", "unconfirmed", "not_applicable"]);
    const withConstants = SEED_SPECIES.filter((record) => record.constants && record.constants.length);
    const leaked = withConstants.filter((record) =>
        record.behaviour && refusedBehaviours.has(record.behaviour.behaviour)
        && runSeedModel({ speciesId: record.id }).viability.ok);
    const refusedWithConstants = withConstants.filter((record) =>
        record.behaviour && refusedBehaviours.has(record.behaviour.behaviour));
    checks.push(check({
        id: "viability-respects-gate",
        title: "Published constants do not override a refusal",
        reference: SEED_REFERENCES.ipgri1996,
        fixture: `Fixture: the ${refusedWithConstants.length} species that carry viability constants and a recalcitrant, intermediate or not-applicable flag (${refusedWithConstants.map((record) => record.scientificName).join(", ") || "none"}).`,
        benchmark: "Constants fitted over a narrow moisture range do not make an intermediate seed safe to dry and freeze.",
        pass: leaked.length === 0,
        detail: leaked.length
            ? `${leaked.map((record) => record.scientificName).join(", ")} received a viability prediction.`
            : "None receives a viability prediction."
    }));

    // With the limits applied, sigma must fall or hold as moisture rises.
    let setsSwept = 0;
    const moistureOffenders = [];
    for (const record of withConstants) {
        for (const set of record.constants) {
            setsSwept += 1;
            let previous = Infinity;
            for (let m = 1; m <= 28; m += 0.5) {
                const result = predictDetermination(set, {
                    scientificName: record.scientificName, moisturePct: m, temperatureC: 5,
                    initialViabilityPct: 95, targetViabilityPct: 85
                });
                if (!result.ok) break;
                if (result.sigmaDays > previous * (1 + 1e-12)) {
                    moistureOffenders.push(`${record.scientificName} at ${m}%`);
                    break;
                }
                previous = result.sigmaDays;
            }
        }
    }
    checks.push(check({
        id: "viability-moisture-monotone",
        title: "Wetter seed is never predicted to last longer",
        reference: SEED_REFERENCES.ipgri1996,
        fixture: `Fixture: all ${setsSwept} published parameter sets, stepped from 1% to 28% moisture at 5 °C.`,
        benchmark: "Inside its limits the equation falls steadily with moisture; below the low-moisture limit it must plateau.",
        pass: setsSwept > 0 && moistureOffenders.length === 0,
        detail: moistureOffenders.length
            ? `Rises with moisture for ${moistureOffenders.join("; ")}.`
            : `All ${setsSwept} sets fall or hold as moisture rises.`
    }));

    const pea = getSpeciesById("pisum-sativum");
    const peaLimit = SPECIES_MOISTURE_LIMITS["Pisum sativum"].lowerPct;
    const peaSet = pea.constants[0];
    const peaArgs = { scientificName: pea.scientificName, temperatureC: 5, initialViabilityPct: 95, targetViabilityPct: 85 };
    const peaAtLimit = predictDetermination(peaSet, { ...peaArgs, moisturePct: peaLimit });
    const peaBelow = predictDetermination(peaSet, { ...peaArgs, moisturePct: peaLimit - 2 });
    checks.push(check({
        id: "viability-low-moisture-plateau",
        title: "Over-drying earns no extra life",
        reference: SEED_REFERENCES.ipgri1996,
        fixture: `Fixture: pea at ${peaLimit}% and at ${peaLimit - 2}% moisture, 5 °C. The compendium puts pea's low-moisture limit at about ${peaLimit}%.`,
        benchmark: `Below the limit, further drying no longer increases longevity in hermetic storage. Left unlimited, the equation would credit those two points of drying with a ${(sigmaDays(peaSet, peaLimit - 2, 5) / sigmaDays(peaSet, peaLimit, 5)).toFixed(1)}-fold gain.`,
        pass: peaAtLimit.ok && peaBelow.ok
            && peaBelow.sigmaDays === peaAtLimit.sigmaDays
            && peaBelow.flags.some((item) => item.code === "low-moisture-plateau"),
        detail: peaAtLimit.ok && peaBelow.ok
            ? `Both give ${Math.round(peaAtLimit.sigmaDays).toLocaleString()} days per probit, and the drier one is flagged.`
            : "A pea prediction failed to run."
    }));

    // ---- Storage tiers ----------------------------------------------------

    const halved = oxygenMultiplier(AIR_OXYGEN_PCT / 2, { rhPct: 30 });
    const anoxic = oxygenMultiplier(1, { rhPct: 30 });
    checks.push(check({
        id: "oxygen-rule",
        title: "Groot's two oxygen figures come from one exponent",
        reference: SEED_REFERENCES.groot2025Oxygen,
        fixture: "Fixture: oxygen halved from air, and reduced from 20.9% to 1%, at 30% RH.",
        benchmark: "1.72× per halving and about 11× at 1%, both as published.",
        pass: Math.abs(halved - 1.72) < 1e-9 && Math.abs(anoxic - 10.8) < 0.1,
        detail: `${halved.toFixed(3)}× per halving, ${anoxic.toFixed(2)}× at 1%.`
    }));

    const damp = oxygenMultiplier(1, { rhPct: 60 });
    checks.push(check({
        id: "oxygen-humidity-interaction",
        title: "No oxygen credit for damp seed",
        reference: SEED_REFERENCES.groot2025Oxygen,
        fixture: "Fixture: 1% oxygen at 60% RH.",
        benchmark: "1×. Groot found hardly any oxygen effect at 60% eRH and none at 30 °C.",
        pass: damp === 1,
        detail: `${damp.toFixed(2)}× at 60% RH against ${anoxic.toFixed(2)}× at 30% RH.`
    }));

    const absorbed = { container: "gasket", absorber: true, desiccant: true, containerMl: 500, seedMassG: 50,
        absorberCapacityMl: 200, rhPct: 30, moisturePct: 6 };
    const cool = evaluateStorage({ ...absorbed, temperatureC: 5 });
    const warm = evaluateStorage({ ...absorbed, temperatureC: 30 });
    checks.push(check({
        id: "oxygen-separable",
        title: "The oxygen factor does not depend on temperature",
        reference: SEED_REFERENCES.groot2025Oxygen,
        fixture: "Fixture: the same jar with an absorber and desiccant at 5 °C and at 30 °C.",
        benchmark: "Identical factors. Over 16-33% eRH Groot found the oxygen effect independent of temperature from 5 to 30 °C.",
        pass: cool.oxygen.multiplier === warm.oxygen.multiplier && cool.oxygen.multiplier > 10,
        detail: `${cool.oxygen.multiplier.toFixed(2)}× at 5 °C and ${warm.oxygen.multiplier.toFixed(2)}× at 30 °C.`
    }));

    const okraDry = runSeedModel({ speciesId: "abelmoschus-esculentus", storageTemperatureC: 25, storageMoisturePct: 8,
        storageRelativeHumidityPct: 40, container: "gasket", desiccant: false });
    const okraWet = runSeedModel({ speciesId: "abelmoschus-esculentus", storageTemperatureC: 25, storageMoisturePct: 14,
        storageRelativeHumidityPct: 40, container: "gasket", desiccant: false });
    checks.push(check({
        id: "okra-anchor",
        title: "Sealed wet seed is blocked and scores worse than sealed dry seed",
        reference: SEED_REFERENCES.bakhtavar2023Okra,
        fixture: "Fixture: okra in a sealed jar at 25 °C with seed at 8% and at 14% moisture.",
        benchmark: "Okra in hermetic bags held germination for a year at 8% and lost all of it within six months at 14%.",
        pass: !okraDry.storage.blocked && okraWet.storage.blocked
            && okraDry.projection.ok && okraWet.projection.ok
            && okraWet.projection.years.high < okraDry.projection.years.high,
        detail: okraDry.projection.ok && okraWet.projection.ok
            ? `14% is blocked, and its projection is ${(okraDry.projection.years.high / okraWet.projection.years.high).toFixed(0)}× shorter.`
            : "A projection failed to run."
    }));

    const pelleted = runSeedModel({ speciesId: "lactuca-sativa", seedTreatment: "pelleted", oxygenAbsorber: true,
        storageTemperatureC: 0, storageMoisturePct: 5 });
    checks.push(check({
        id: "pelleted-override",
        title: "Pelleted seed is capped at one year whatever the storage",
        reference: SEED_REFERENCES.johnnys,
        fixture: "Fixture: pelleted lettuce at 0 °C and 5% moisture with an absorber and desiccant.",
        benchmark: "Johnny's: pelleted seed should be used within one year.",
        pass: pelleted.projection.ok && pelleted.projection.years.high <= 1 && pelleted.projection.years.low <= 1,
        detail: pelleted.projection.ok
            ? `Projection ${pelleted.projection.years.low.toFixed(1)}-${pelleted.projection.years.high.toFixed(1)} y.`
            : "No projection returned."
    }));

    const absorberOnly = runSeedModel({ speciesId: "lactuca-sativa", oxygenAbsorber: true, desiccant: false });
    checks.push(check({
        id: "absorber-needs-desiccant",
        title: "An absorber without a desiccant gets no projection",
        reference: SEED_REFERENCES.groot2015Anoxia,
        fixture: "Fixture: lettuce in a sealed jar with an oxygen absorber and no desiccant.",
        benchmark: "RH reached 88% within two days in Groot's jar with an absorber alone.",
        pass: !absorberOnly.projection.ok && absorberOnly.projection.reason === "absorber-only"
            && !absorberOnly.viability.ok && absorberOnly.storage.blocked,
        detail: `Projection ${absorberOnly.projection.ok ? "returned" : "withheld"}, viability equation ${absorberOnly.viability.ok ? "ran" : "withheld"}.`
    }));

    const genebank = runSeedModel({ speciesId: "lactuca-sativa", baselineTemperatureC: 30, baselineMoisturePct: 14,
        storageTemperatureC: -18, storageMoisturePct: 5, oxygenAbsorber: true, desiccant: true });
    checks.push(check({
        id: "compounding-with-oxygen",
        title: "Moisture, temperature and oxygen together hit the range warning",
        reference: SEED_REFERENCES.groot2025Oxygen,
        fixture: "Fixture: a 30 °C, 14% moisture baseline moved to -18 °C, 5% moisture, absorber and desiccant.",
        benchmark: "The temperature clamp and the compounding warning both fire; the multipliers are never quietly multiplied out to millions.",
        pass: genebank.multiplier.clamps.length > 0
            && genebank.projection.warnings.some((text) => text.includes("compound")),
        detail: `${genebank.multiplier.clamps.length} clamp(s), combined factor ${Math.round(genebank.multiplier.multiplier * genebank.storage.oxygen.multiplier).toLocaleString()}×, warned.`
    }));

    // ---- Monte Carlo -------------------------------------------------------

    const lettuceRecord = getSpeciesById("lactuca-sativa");
    const mcInputs = { moisturePct: 6, moistureSpreadPct: 1, temperatureC: 5, temperatureSpreadC: 2,
        initialViabilityPct: 95, testSeeds: 100, targetViabilityPct: 85, draws: 500, seed: 3 };
    const mcA = runViabilityMonteCarlo(lettuceRecord, mcInputs);
    const mcB = runViabilityMonteCarlo(lettuceRecord, mcInputs);
    checks.push(check({
        id: "monte-carlo-range",
        title: "The uncertainty result is a range, reproducible from its seed",
        reference: SEED_REFERENCES.hayViabilityEquations,
        fixture: "Fixture: lettuce at 5 ± 2 °C and 6 ± 1% moisture, 95% from a 100-seed test, 500 draws, run twice.",
        benchmark: "P10 below the median below P90 for each determination, and the same seed giving the same numbers.",
        pass: mcA.ok && mcA.determinations.every((entry) => entry.daysToTarget.p10 < entry.daysToTarget.median
            && entry.daysToTarget.median < entry.daysToTarget.p90)
            && JSON.stringify(mcA.daysToTarget) === JSON.stringify(mcB.daysToTarget),
        detail: mcA.ok
            ? `P10 to P90 ${mcA.determinations.map((entry) => `${(entry.daysToTarget.p10 / 365.25).toFixed(1)}-${(entry.daysToTarget.p90 / 365.25).toFixed(1)} y`).join(" and ")}, identical on the second run.`
            : "No band returned."
    }));

    const wetBand = runViabilityMonteCarlo(lettuceRecord, { ...mcInputs, moisturePct: 14.5, moistureSpreadPct: 1 });
    checks.push(check({
        id: "monte-carlo-refusals-counted",
        title: "Draws outside the equation are counted and reported",
        reference: SEED_REFERENCES.ipgri1996,
        fixture: "Fixture: lettuce at 14.5 ± 1% moisture, where the equation stops at about 15%.",
        benchmark: "About a quarter of the draws land above 15% and are reported as refused.",
        pass: wetBand.ok && wetBand.refusedDraws > 0.15 * wetBand.draws && wetBand.refusedDraws < 0.35 * wetBand.draws,
        detail: wetBand.ok ? `${wetBand.refusedDraws} of ${wetBand.draws} draws refused.` : "No band returned."
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
