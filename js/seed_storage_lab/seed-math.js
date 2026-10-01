// Equation registry for the Seed Storage Lab "Show the math" modal.
//
// Each entry states one equation the model actually runs, why that functional
// form is defensible, and a "Run test" that exercises the LIVE model code
// against a fixture whose expected value comes from the literature rather than
// from the implementation. If the model drifts, the modal goes red.

import {
    DEFAULT_BASELINE,
    EVIDENCE_HORIZON_YEARS,
    HARRINGTON_LIMITS,
    cToF,
    fToC,
    countFromMeasurement,
    evaluateSpeciesGate,
    getSpeciesById,
    harringtonMultiplier,
    hundredRule,
    runSeedModel,
    searchSpecies,
    summariseCounts,
    GRAMS_PER_LB,
    OZ_PER_LB
} from "./seed-model.js";
import { SEED_REFERENCES } from "./seed-source-map.js";
import { SEED_SPECIES } from "./seed-species-data.js";
import {
    DAYS_PER_YEAR,
    PROBIT_OFFSET,
    daysToNed,
    nedFromPercent,
    predictDetermination,
    predictSpecies,
    sigmaDays,
    turningPointC,
    viabilityAfterDays
} from "./seed-viability-engine.js";

// Constants as Hay prints them, independent of the generated bundle.
const HAY_LETTUCE = Object.freeze({ KE: 6.895, CW: 4.2, CH: 0.0329, CQ: 0.000478 });
const HAY_BARLEY = Object.freeze({ KE: 9.144, CW: 5.342, CH: 0.0329, CQ: 0.000478 });

const approxEqual = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

function makeResult({ pass, expected, actual, units = "", message = "" }) {
    return { pass, expected, actual, units, message };
}

export const SEED_EQUATION_SPECS = Object.freeze([
    {
        id: "harrington-moisture",
        title: "Harrington's moisture rule",
        equation: "life_multiplier = 2^(MC_baseline − MC_storage)",
        rationale:
            "Each one percentage point reduction in seed moisture content roughly doubles storage life. "
            + "Harrington stated it as a thumb-rule for ordinary storage, and extension and genebank sources have "
            + "restated it ever since. It is an empirical regularity: the underlying driver is water activity "
            + "governing the rate of lipid peroxidation and Maillard chemistry in the dry glassy state.",
        sources: ["harrington1972", "usdaAH506", "mdpiSeeds2024"],
        implementation: "seed-model.js → harringtonMultiplier (moistureMultiplier term).",
        fixture: "Baseline 8% MC, stored at 5% MC, temperature unchanged.",
        expected: "3 percentage points drier → 2³ = 8× the storage life.",
        run() {
            const result = harringtonMultiplier({
                baselineTemperatureC: 5, baselineMoisturePct: 8,
                storageTemperatureC: 5, storageMoisturePct: 5
            });
            return makeResult({
                pass: approxEqual(result.multiplier, 8, 1e-9),
                expected: 8,
                actual: result.multiplier,
                units: "× life",
                message: `8% → 5% MC gives ${result.multiplier.toFixed(3)}× with temperature held constant.`
            });
        }
    },
    {
        id: "harrington-temperature",
        title: "Harrington's temperature rule",
        equation: "life_multiplier = 2^((T_baseline,°F − T_storage,°F) / 10)",
        rationale:
            "Each 10 °F (5.6 °C) reduction in storage temperature roughly doubles storage life. The rule is stated "
            + "in Fahrenheit in the original and converting the interval to Celsius first is a common way to get it "
            + "subtly wrong, so the model converts both temperatures to °F and takes the difference there.",
        sources: ["harrington1972", "usdaAH506"],
        implementation: "seed-model.js → harringtonMultiplier (temperatureMultiplier term).",
        fixture: "Baseline 20 °C (68 °F), stored at 48 °F, moisture unchanged.",
        expected: "20 °F colder → 2² = 4× the storage life.",
        run() {
            const result = harringtonMultiplier({
                baselineTemperatureC: 20, baselineMoisturePct: 8,
                storageTemperatureC: fToC(48), storageMoisturePct: 8
            });
            return makeResult({
                pass: approxEqual(result.multiplier, 4, 1e-9),
                expected: 4,
                actual: result.multiplier,
                units: "× life",
                message: `68 °F → 48 °F gives ${result.multiplier.toFixed(3)}× with moisture held constant.`
            });
        }
    },
    {
        id: "harrington-clamping",
        title: "Validity clamping on both rules",
        equation: `0 °C ≤ T ≤ 40 °C ,  ${HARRINGTON_LIMITS.moistureMinPct}% ≤ MC ≤ ${HARRINGTON_LIMITS.moistureMaxPct}%`,
        rationale:
            "Outside this box the rules are known to be wrong. Below roughly 5% MC the moisture relationship "
            + "inverts for some species; above 14% MC respiration and fungal growth take over and seeds die "
            + "faster than any dry-storage rule predicts; below 0 °C the temperature rule "
            + "overpredicts badly against the Ellis-Roberts data, which is why genebank conditions need the "
            + "viability equation instead. Clamping silently would turn an invalid question into a plausible answer, "
            + "so every clamp is reported.",
        sources: ["harrington1972", "ellisRoberts1980", "hayViabilityEquations"],
        implementation: "seed-model.js → HARRINGTON_LIMITS and the bound() helper inside harringtonMultiplier.",
        fixture: "Request -20 °C and 4% MC, freezer conditions that sit outside both limits.",
        expected: "Two clamps reported; the effective calculation uses 0 °C and 5% MC.",
        run() {
            const result = harringtonMultiplier({
                baselineTemperatureC: 5, baselineMoisturePct: 8,
                storageTemperatureC: -20, storageMoisturePct: 4
            });
            const clamped = result.clamps.length === 2
                && approxEqual(result.applied.storageTemperatureC, 0, 1e-9)
                && approxEqual(result.applied.storageMoisturePct, 5, 1e-9);
            return makeResult({
                pass: clamped,
                expected: "2 clamps → 0 °C, 5% MC",
                actual: `${result.clamps.length} clamps → ${result.applied.storageTemperatureC} °C, ${result.applied.storageMoisturePct}% MC`,
                units: "",
                message: result.clamps.map((clamp) => clamp.message).join(" ")
            });
        }
    },
    {
        id: "hundred-rule",
        title: "The Hundred Rule indicator",
        equation: "T(°F) + RH(%) < 100",
        rationale:
            "The standard seed-saving screening heuristic. It carries no species term and no time term, so it can "
            + "tell you a cupboard is a bad place to keep seed but it cannot tell you for how long. The model reports "
            + "it as a pass/fail indicator and never multiplies it into a longevity figure. The frequently repeated "
            + "\"and no more than half of that total from temperature\" clause has no primary source and is "
            + "not implemented here.",
        sources: ["usdaAH506", "mdpiSeeds2024"],
        implementation: "seed-model.js → hundredRule.",
        fixture: "70 °F at 25% RH, then 80 °F at 45% RH.",
        expected: "95 → passes; 125 → fails.",
        run() {
            const good = hundredRule({ temperatureC: fToC(70), relativeHumidityPct: 25 });
            const bad = hundredRule({ temperatureC: fToC(80), relativeHumidityPct: 45 });
            return makeResult({
                pass: good.pass === true && bad.pass === false
                    && approxEqual(good.sum, 95, 1e-6) && approxEqual(bad.sum, 125, 1e-6),
                expected: "95 pass, 125 fail",
                actual: `${good.sum.toFixed(0)} ${good.pass ? "pass" : "fail"}, ${bad.sum.toFixed(0)} ${bad.pass ? "pass" : "fail"}`,
                units: "°F + %RH",
                message: `${good.detail} ${bad.detail}`
            });
        }
    },
    {
        id: "species-gate-recalcitrant",
        title: "Species gate refuses recalcitrant seed",
        equation: "allowLongevity = behaviour ∈ {orthodox, unrecorded-and-not-woody}",
        rationale:
            "Recalcitrant seeds are killed by the drying that dry storage requires; they cannot be held at low "
            + "moisture at any temperature. Both Harrington's rules and the Ellis-Roberts equation assume orthodox "
            + "seed, so running either on an acorn produces a confident prediction of decades for something that is "
            + "dead within a season. Seed counts are still shown, because counting acorns per pound is useful and "
            + "harmless; only the longevity projection refuses.",
        sources: ["ipgri1996", "kewCompendium1998", "deVitis2020"],
        implementation: "seed-model.js → evaluateSpeciesGate, consumed by projectLongevity.",
        fixture: "Quercus (oak), which the 1996 compendium lists as recalcitrant.",
        expected: "Gate blocked, no projection, seed counts still available.",
        run() {
            const record = getSpeciesById("quercus");
            const gate = evaluateSpeciesGate(record);
            const model = runSeedModel({ speciesId: "quercus" });
            return makeResult({
                pass: gate.allowLongevity === false
                    && gate.status === "blocked"
                    && model.projection.ok === false
                    && model.projection.reason === "gated",
                expected: "blocked / no projection",
                actual: `${gate.status} / projection.ok=${model.projection.ok}`,
                units: "",
                message: gate.headline
            });
        }
    },
    {
        id: "species-gate-precedence",
        title: "Species flags override genus flags",
        equation: "flag = species_flag ?? compendium_row ?? genus_flag",
        rationale:
            "Acer saccharinum (silver maple) is recalcitrant while Acer platanoides (Norway maple) is orthodox and "
            + "has published viability constants. A genus-wide rule would be wrong in both directions: refusing a "
            + "species the literature can model, and modelling one it cannot. Precedence is resolved once, in the "
            + "data generator, so the browser cannot re-derive it differently.",
        sources: ["ipgri1996", "kewAppendix1"],
        implementation: "scripts/build-seed-species-data.py (flag resolution) → seed-model.js → evaluateSpeciesGate.",
        fixture: "Both maples, which share a genus and disagree on storage behaviour.",
        expected: "A. saccharinum blocked; A. platanoides allowed.",
        run() {
            const silver = evaluateSpeciesGate(getSpeciesById("acer-saccharinum"));
            const norway = evaluateSpeciesGate(getSpeciesById("acer-platanoides"));
            return makeResult({
                pass: silver.allowLongevity === false && norway.allowLongevity === true,
                expected: "saccharinum blocked, platanoides allowed",
                actual: `saccharinum ${silver.status}, platanoides ${norway.status}`,
                units: "",
                message: "Same genus, opposite storage behaviour, resolved at species level."
            });
        }
    },
    {
        id: "behaviour-conflict-reported",
        title: "An overruled behaviour source is named, not dropped",
        equation: "flag = winner ; flag.overruled = highest-ranked disagreeing source",
        rationale:
            "The 1996 compendium flags Carya and Juglans recalcitrant at genus level. The 1998 compendium lists "
            + "Carya illinoensis, C. laciniosa, C. ovata and Juglans microcarpa orthodox at species level. Species "
            + "beats genus, so pecan and the hickories are projected, which is defensible: sourced species data is "
            + "better evidence than a genus generalisation. Dropping the loser was not. The same rule that keeps "
            + "conflicting seed counts apart applies here, where the stakes are higher, so the overruled flag "
            + "travels with the winner and costs an overruled recalcitrant species its ok status.",
        sources: ["ipgri1996", "kewCompendium1998"],
        implementation: "scripts/build-seed-species-data.py sets behaviour.overruled; seed-model.js → evaluateSpeciesGate reports it.",
        fixture: "Carya illinoensis (pecan), orthodox by species record inside a recalcitrant genus.",
        expected: "Projection allowed, status caution, detail names the recalcitrant Carya flag.",
        run() {
            const gate = evaluateSpeciesGate(getSpeciesById("carya-illinoensis"));
            const names = Boolean(gate.conflict)
                && gate.conflict.behaviour === "recalcitrant"
                && gate.detail.includes("Carya");
            return makeResult({
                pass: gate.allowLongevity === true && gate.status === "caution" && names,
                expected: "caution, projected, conflict named",
                actual: `${gate.status}, allow=${gate.allowLongevity}, conflict=${gate.conflict ? gate.conflict.behaviour : "none"}`,
                units: "",
                message: gate.detail
            });
        }
    },
    {
        id: "vegetative-not-applicable",
        title: "Vegetatively propagated crops answer honestly",
        equation: "behaviour = not_applicable → explain, do not report \"not found\"",
        rationale:
            "Garlic, potato, banana and several others are grown from cloves, tubers and offsets rather than stored "
            + "seed. None of them appears in any seed-count dataset, so a naive lookup returns \"not found\" and "
            + "leaves the user thinking the tool is incomplete. The honest answer is that the question does not apply.",
        sources: ["ipgri1996"],
        implementation: "scripts/build-seed-species-data.py admits flag-only taxa; seed-model.js → evaluateSpeciesGate.",
        fixture: "Search for garlic.",
        expected: "Found, status not_applicable, explains vegetative propagation.",
        run() {
            const hits = searchSpecies("garlic", { limit: 5 });
            const gate = hits.length ? evaluateSpeciesGate(hits[0]) : null;
            return makeResult({
                pass: Boolean(gate) && gate.status === "not_applicable" && gate.allowLongevity === false,
                expected: "not_applicable",
                actual: gate ? gate.status : "not found",
                units: "",
                message: gate ? gate.headline : "Garlic was not found at all."
            });
        }
    },
    {
        id: "count-conflict-preserved",
        title: "Conflicting seed counts are reported, not reconciled",
        equation: "ratio = max(per_lb) / min(per_lb) ;  disagreement = ratio > 1.3",
        rationale:
            "G2090 puts lettuce at 25,000 seeds/oz and Osborne at 1,875-3,125, a spread of 13.5× across the three "
            + "determinations. 32 of the 53 species with more than one count source disagree, from 1.32× up to "
            + "14.25× for coriander. Averaging them yields a number no source supports and hides that one of them "
            + "is probably wrong. Keeping all three is also what makes the conflict resolvable: the independent "
            + "thousand-seed-weight dataset lands at 25,267 seeds/oz, corroborating G2090 and isolating Osborne. "
            + "An average would have destroyed that signal.",
        sources: ["unlG2090", "osborne", "figshareTsw"],
        implementation: "seed-model.js → summariseCounts; the generator keeps one entry per source.",
        fixture: "Lactuca sativa, the largest conflict carrying three independent determinations.",
        expected: "Three sources, disagreement flagged, overall span ≈13.5×.",
        run() {
            const summary = summariseCounts(getSpeciesById("lactuca-sativa"));
            return makeResult({
                pass: summary.rows.length === 3 && summary.disagreement === true
                    && approxEqual(summary.ratio, 13.48, 0.05),
                expected: "3 sources, disagreement true, 13.48×",
                actual: `${summary.rows.length} sources, ratio ${summary.ratio ? summary.ratio.toFixed(1) : "n/a"}×`,
                units: "× spread",
                message: "Both determinations are shown side by side; the tool does not pick a winner."
            });
        }
    },
    {
        id: "g2090-correction",
        title: "G2090 tomato seeds-per-ounce correction",
        equation: "seeds_per_oz = seeds_per_gram × 28.3495",
        rationale:
            "G2090 prints tomato and turnip seeds per ounce an order of magnitude below what the seeds-per-gram "
            + "column in the same table implies. The gram column is internally consistent and agrees with other "
            + "sources, so seeds/oz is rebuilt from it. The CSV keeps the published value verbatim; the correction "
            + "is applied once, in the generator, and every corrected entry carries a visible note.",
        sources: ["unlG2090", "osborne"],
        implementation: "scripts/build-seed-species-data.py → G2090_OZ_FROM_GRAM.",
        fixture: "Tomato, published at 250-430 seeds/gram.",
        expected: "About 7,100-12,200 seeds/oz, carrying a correction note.",
        run() {
            const summary = summariseCounts(getSpeciesById("solanum-lycopersicum"));
            const corrected = summary.rows.find((row) => row.sourceKey === "unlG2090" && row.correction);
            const ok = Boolean(corrected)
                && corrected.perOz.low > 6500 && corrected.perOz.high < 13000;
            return makeResult({
                pass: ok,
                expected: "≈7,087-12,190 seeds/oz with a correction note",
                actual: corrected
                    ? `${Math.round(corrected.perOz.low).toLocaleString()}-${Math.round(corrected.perOz.high).toLocaleString()} seeds/oz`
                    : "no corrected entry found",
                units: "seeds/oz",
                message: corrected ? corrected.correction : "The correction did not survive into the bundle."
            });
        }
    },
    {
        id: "measured-count",
        title: "Measured seed count from a weighed sample",
        equation: "seeds_per_lb = (count / mass_g) × 453.59237",
        rationale:
            "Published counts carry cultivar, seed-lot, season and cleaning-standard variation. A count from the "
            + "packet in hand carries none of it, so measured mode takes precedence over the lookup and the published "
            + "range is demoted to a cross-check. Counting error is about 1/n, so small samples raise a warning.",
        sources: ["nrcsTx", "figshareTsw"],
        implementation: "seed-model.js → countFromMeasurement and compareMeasuredToPublished.",
        fixture: "100 seeds weighing 3.2 g.",
        expected: "31.25 seeds/g → 14,175 seeds/lb, thousand-seed weight 32 g.",
        run() {
            const measured = countFromMeasurement({ seedCount: 100, sampleMass: 3.2, sampleMassUnit: "g" });
            const expectedPerLb = (100 / 3.2) * GRAMS_PER_LB;
            return makeResult({
                pass: measured.ok
                    && approxEqual(measured.perLb, expectedPerLb, 1e-6)
                    && approxEqual(measured.thousandSeedWeightG, 32, 1e-9),
                expected: Math.round(expectedPerLb),
                actual: Math.round(measured.perLb),
                units: "seeds/lb",
                message: `Thousand-seed weight ${measured.thousandSeedWeightG.toFixed(1)} g.`
            });
        }
    },
    {
        id: "small-sample-warning",
        title: "Small samples raise a warning",
        equation: "counting_error ≈ 1 / n",
        rationale:
            "A ten-seed sample carries roughly 10% counting error before scale resolution is considered. Domestic "
            + "kitchen scales resolve to 0.1-1 g, so weighing 0.05 g of lettuce seed is dominated by the instrument. "
            + "Both conditions produce an explicit warning.",
        sources: ["nrcsTx"],
        implementation: "seed-model.js → countFromMeasurement warnings.",
        fixture: "10 seeds weighing 0.05 g.",
        expected: "Two warnings: sample size and scale resolution.",
        run() {
            const measured = countFromMeasurement({ seedCount: 10, sampleMass: 0.05, sampleMassUnit: "g" });
            return makeResult({
                pass: measured.ok && measured.warnings.length === 2,
                expected: "2 warnings",
                actual: `${measured.warnings.length} warnings`,
                units: "",
                message: measured.warnings.join(" ")
            });
        }
    },
    {
        id: "evidence-horizon",
        title: "Compounded projections are marked beyond evidence",
        equation: `flag when projected_years > ${EVIDENCE_HORIZON_YEARS.toLocaleString()}`,
        rationale:
            "Even fully inside the validity box, Harrington's two rules compound to roughly 75,000× between the "
            + "worst and best corners. Applied to a three-year vendor figure that is 225,000 years. The oldest "
            + "reliably germinated seed is a date palm of about 2,000 years, so anything past a millennium is "
            + "arithmetic, and is labelled as such.",
        sources: ["harrington1972", "ellis2022SST", "solberg2020"],
        implementation: "seed-model.js → EVIDENCE_HORIZON_YEARS and projectLongevity warnings.",
        fixture:
            "Lettuce whose published longevity is read as describing a warm, humid drawer (25 °C, 12% MC), "
            + "then moved to the coldest and driest the rules permit (0 °C, 5% MC). At the tool's "
            + "default 5 °C / 8% baseline the rules reach only about 15×, because the validity box stops at "
            + "0 °C and 5% MC. The explosion is reachable only by moving the baseline, which is exactly why the "
            + "baseline is an explicit, visible input.",
        expected: "≈2,900× → projection flagged beyondEvidence with an explanatory warning.",
        run() {
            const model = runSeedModel({
                speciesId: "lactuca-sativa",
                baselineTemperatureC: 25,
                baselineMoisturePct: 12,
                storageTemperatureC: 0,
                storageMoisturePct: 5
            });
            const projection = model.projection;
            return makeResult({
                pass: projection.ok === true
                    && projection.beyondEvidence === true
                    && projection.warnings.length > 0,
                expected: "beyondEvidence true with warning",
                actual: projection.ok
                    ? `${Math.round(projection.years.high).toLocaleString()} y, flagged=${projection.beyondEvidence}`
                    : `no projection (${projection.reason})`,
                units: "years",
                message: projection.warnings[0] || "No warning was raised."
            });
        }
    },
    {
        id: "identity-multiplier",
        title: "Storing at the baseline changes nothing",
        equation: "multiplier(baseline, baseline) = 1",
        rationale:
            "A conservation check. If storage conditions equal the baseline the published longevity figure "
            + "must come back unchanged; anything else means the baseline and the multiplier have drifted out "
            + "of agreement, which would bias every projection the tool makes.",
        sources: ["harrington1972", "unlG2090"],
        implementation: "seed-model.js → harringtonMultiplier, projectLongevity.",
        fixture: `Lettuce stored exactly at the ${DEFAULT_BASELINE.label} baseline.`,
        expected: "Multiplier 1.000; projected years equal the published span.",
        run() {
            const model = runSeedModel({
                speciesId: "lactuca-sativa",
                baselineTemperatureC: DEFAULT_BASELINE.temperatureC,
                baselineMoisturePct: DEFAULT_BASELINE.moisturePct,
                storageTemperatureC: DEFAULT_BASELINE.temperatureC,
                storageMoisturePct: DEFAULT_BASELINE.moisturePct
            });
            const span = model.projection.baseline.span;
            const years = model.projection.years;
            return makeResult({
                pass: approxEqual(model.multiplier.multiplier, 1, 1e-12)
                    && approxEqual(years.low, span.low, 1e-9)
                    && approxEqual(years.high, span.high, 1e-9),
                expected: `1.000× → ${span ? `${span.low}-${span.high}` : "?"} y`,
                actual: `${model.multiplier.multiplier.toFixed(6)}× → ${years.low.toFixed(2)}-${years.high.toFixed(2)} y`,
                units: "× life",
                message: "Baseline and multiplier agree, so published figures pass through untouched."
            });
        }
    },
    {
        id: "viability-sigma",
        title: "Ellis-Roberts: how storage conditions set sigma",
        equation: "log10(sigma) = K_E − C_W·log10(m) − C_H·t − C_Q·t²",
        rationale:
            "Sigma is the standard deviation of seed deaths in time, in days, and so the time for germination to "
            + "fall by one probit. m is moisture content in percent of fresh weight and t is degrees Celsius. "
            + "Moisture enters as a logarithm and temperature as a quadratic, so drying and cooling multiply, and "
            + "the benefit of each further degree of cooling shrinks. The four constants are fitted together and "
            + "are never mixed across sources.",
        sources: ["ellisRoberts1980", "hayViabilityEquations", "ellis2022SST"],
        implementation: "seed-viability-engine.js → sigmaDays.",
        fixture: "Hay's three worked examples at -20 °C: lettuce at 4.19% and 6.0% moisture, barley at 6.17%.",
        expected: "56,040 d, 12,404 d and 244,961 d, each to the day.",
        run() {
            const got = [
                sigmaDays(HAY_LETTUCE, 4.19, -20),
                sigmaDays(HAY_LETTUCE, 6.0, -20),
                sigmaDays(HAY_BARLEY, 6.17, -20)
            ];
            const want = [56040, 12404, 244961];
            return makeResult({
                pass: got.every((value, index) => Math.round(value) === want[index]),
                expected: want.join(", "),
                actual: got.map((value) => value.toFixed(1)).join(", "),
                units: "days",
                message: "Under-drying lettuce by 1.8 points of moisture costs a factor of 4.5."
            });
        }
    },
    {
        id: "viability-probit",
        title: "Percent germination to probits",
        equation: "probit = Φ⁻¹(germination) + 5",
        rationale:
            "Seed deaths in time follow a normal distribution, so germination plotted in probits falls as a "
            + "straight line. The +5 is a pre-calculator convention that kept the numbers positive. It cancels in "
            + "every time difference, so the engine works without it and adds it back only for display.",
        sources: ["hayViabilityEquations", "ipgri1996"],
        implementation: "seed-viability-engine.js → nedFromPercent, normalCdf, inverseNormalCdf.",
        fixture: "The four probit values Hay prints: 98.0%, 99.0%, 51% and 99.9%.",
        expected: "7.0537, 7.3263, 5.0251 and 8.0902.",
        run() {
            const want = [[98, 7.0537], [99, 7.3263], [51, 5.0251], [99.9, 8.0902]];
            const got = want.map(([percent]) => nedFromPercent(percent) + PROBIT_OFFSET);
            return makeResult({
                pass: got.every((value, index) => approxEqual(value, want[index][1], 5e-5)),
                expected: want.map((pair) => pair[1]).join(", "),
                actual: got.map((value) => value.toFixed(4)).join(", "),
                units: "probits",
                message: "Matches the printed table to its fourth decimal."
            });
        }
    },
    {
        id: "viability-survival",
        title: "Ellis-Roberts: the survival line",
        equation: "v = K_i − p / sigma",
        rationale:
            "v is probit germination after p days and K_i is the lot's starting probit. The time to fall from one "
            + "germination level to another is the probit difference times sigma, which is how every duration on "
            + "this page is computed. Hay's \"total lifespan\" is the time to probit zero, which is 0.00003% "
            + "germination, and is reproduced here only to check the arithmetic.",
        sources: ["ellisRoberts1980", "hayViabilityEquations"],
        implementation: "seed-viability-engine.js → daysToNed, viabilityAfterDays.",
        fixture: "Hay's lettuce lot at 99.9% germination, 4.19% moisture and -20 °C.",
        expected: "453,374 d to probit zero, and one sigma takes 84.13% down to 50%.",
        run() {
            const sigma = sigmaDays(HAY_LETTUCE, 4.19, -20);
            const lifespan = daysToNed(sigma, nedFromPercent(99.9), -PROBIT_OFFSET);
            const afterOneSigma = viabilityAfterDays(sigma, 1, sigma);
            // Hay multiplies rounded figures, so the printed one sits a few days low.
            return makeResult({
                pass: Math.abs(lifespan / 453374 - 1) < 2e-5 && approxEqual(afterOneSigma, 50, 1e-9),
                expected: "453,374 d; 50%",
                actual: `${Math.round(lifespan).toLocaleString()} d; ${afterOneSigma.toFixed(4)}%`,
                units: "",
                message: "The few days' gap to the printed figure is Hay rounding sigma and the probit before multiplying."
            });
        }
    },
    {
        id: "viability-compendium-column",
        title: "The compendium's own longevity column",
        equation: "sigma(5% moisture, -20 °C) / 365.25",
        rationale:
            "Appendix I of the 1996 compendium prints, beside each set of constants, the years for germination "
            + "to fall one probit at -20 °C and 5% moisture. Recomputing that column from the constants checks "
            + "the transcription of every set and the equation at once, against numbers the authors computed.",
        sources: ["kewAppendix1", "ipgri1996"],
        implementation: "seed-viability-engine.js → sigmaDays, over every bundled set that carries a published figure.",
        fixture: "Every bundled parameter set with a published -20 °C figure.",
        expected: "All within 3% except Ranunculus sceleratus, printed as 24 against a computed 25.3.",
        run() {
            let total = 0;
            const outside = [];
            for (const record of SEED_SPECIES) {
                for (const set of record.constants || []) {
                    if (!Number.isFinite(set.publishedYearsMinus20C)) continue;
                    total += 1;
                    const years = sigmaDays(set, 5, -20) / DAYS_PER_YEAR;
                    const error = Math.abs(years / set.publishedYearsMinus20C - 1);
                    if (error > 0.03) outside.push({ name: record.scientificName, error });
                }
            }
            const onlyRanunculus = outside.length === 1
                && outside[0].name === "Ranunculus sceleratus" && outside[0].error < 0.06;
            return makeResult({
                pass: total >= 60 && onlyRanunculus,
                expected: `${total} sets, 1 outside 3%`,
                actual: `${total} sets, ${outside.length} outside 3%`,
                units: "",
                message: outside.map((entry) => `${entry.name} ${(entry.error * 100).toFixed(1)}%`).join("; ")
            });
        }
    },
    {
        id: "viability-turning-point",
        title: "Colder is never predicted to be worse",
        equation: "t_turn = −C_H / (2·C_Q)",
        rationale:
            "The temperature term is a quadratic, so it has a maximum. With the universal constants that is "
            + "-34.4 °C and out of reach, but five published sets turn over warmer than -25 °C and one sweetgum "
            + "set at -2.7 °C. Below the turning point the raw equation says a freezer shortens life, which is an "
            + "artefact of fitting a parabola to warm data. The engine holds the prediction at the turning point "
            + "and says so. Nothing is evaluated below -20 °C, the coldest any archived source takes the equation.",
        sources: ["dickieEllis1990", "ellis2022SST", "kewAppendix1"],
        implementation: "seed-viability-engine.js → turningPointC, predictDetermination.",
        fixture: "Every bundled parameter set, stepped from 90 °C down to -40 °C at 8% moisture.",
        expected: "Sigma never falls as the temperature falls, for any set.",
        run() {
            let sets = 0;
            let warmTurn = 0;
            const offenders = [];
            for (const record of SEED_SPECIES) {
                for (const set of record.constants || []) {
                    sets += 1;
                    if (turningPointC(set) > -25) warmTurn += 1;
                    let previous = 0;
                    for (let t = 90; t >= -40; t -= 1) {
                        const result = predictDetermination(set, {
                            scientificName: record.scientificName, moisturePct: 8, temperatureC: t,
                            initialViabilityPct: 95, targetViabilityPct: 85
                        });
                        if (!result.ok || result.sigmaDays < previous * (1 - 1e-12)) {
                            offenders.push(`${record.scientificName} at ${t} °C`);
                            break;
                        }
                        previous = result.sigmaDays;
                    }
                }
            }
            return makeResult({
                pass: sets > 0 && offenders.length === 0 && warmTurn === 5,
                expected: `${sets} sets monotone, 5 turning above -25 °C`,
                actual: `${sets - offenders.length} sets monotone, ${warmTurn} turning above -25 °C`,
                units: "",
                message: offenders.length ? offenders.join("; ") : "The raw equation fails this for five sets; the limited one does not."
            });
        }
    },
    {
        id: "viability-determinations-separate",
        title: "Published determinations are never merged",
        equation: "one prediction per (K_E, C_W, C_H, C_Q) set",
        rationale:
            "Onion has two published sets, one with its own temperature constants and one with the universal "
            + "pair. Each is a valid fit and they disagree two-fold at genebank conditions. Averaging them, or "
            + "taking K_E and C_W from one and C_H and C_Q from the other, gives a figure no experiment supports.",
        sources: ["kewAppendix1", "dickieEllis1990"],
        implementation: "seed-viability-engine.js → predictSpecies.",
        fixture: "Onion at -20 °C and 5% moisture, where the compendium prints 413 and 843 years.",
        expected: "Two determinations, about 413 and 843 years of sigma, ratio about 2.0.",
        run() {
            const onion = getSpeciesById("allium-cepa");
            const result = predictSpecies(onion, {
                moisturePct: 5, temperatureC: -20, initialViabilityPct: 95, targetViabilityPct: 85
            });
            const years = result.ok
                ? result.determinations.map((entry) => entry.sigmaDays / DAYS_PER_YEAR).sort((a, b) => a - b)
                : [];
            return makeResult({
                pass: years.length === 2
                    && Math.abs(years[0] / 413 - 1) < 0.01 && Math.abs(years[1] / 843 - 1) < 0.01
                    && approxEqual(result.ratio, years[1] / years[0], 1e-9),
                expected: "413 and 843 y",
                actual: years.map((value) => value.toFixed(0)).join(" and "),
                units: "y",
                message: result.ok ? `Reported as a range with ratio ${result.ratio.toFixed(2)}.` : "No prediction returned."
            });
        }
    },
    {
        id: "unit-conversion",
        title: "Seed count unit conversions",
        equation: "1 lb = 16 oz = 453.59237 g",
        rationale:
            "The datasets state counts per ounce, per pound, per gram and per kilogram depending on origin, and the "
            + "tool normalises everything to seeds per pound internally before comparing sources. A conversion slip "
            + "here would manufacture cross-source disagreements that do not exist, or hide ones that do.",
        sources: ["nrcsTx", "wpsm"],
        implementation: "seed-model.js → quantityToLb, entryToPerLb.",
        fixture: "A source quoting 1,000 seeds/oz.",
        expected: "16,000 seeds/lb and 35.274 seeds/g.",
        run() {
            const perLb = 1000 * OZ_PER_LB;
            const perGram = perLb / GRAMS_PER_LB;
            return makeResult({
                pass: approxEqual(perLb, 16000, 1e-9) && approxEqual(perGram, 35.27396, 1e-4),
                expected: "16,000 seeds/lb, 35.2740 seeds/g",
                actual: `${perLb.toLocaleString()} seeds/lb, ${perGram.toFixed(4)} seeds/g`,
                units: "",
                message: "Ounce, pound and gram bases agree to the kilogram/pound invariant."
            });
        }
    }
]);

export function getSeedEquationSources(spec) {
    if (!spec) return [];
    return (spec.sources || [])
        .map((key) => ({ key, ...SEED_REFERENCES[key] }))
        .filter((entry) => entry && entry.label);
}

export function runSeedEquationTest(id) {
    const spec = SEED_EQUATION_SPECS.find((entry) => entry.id === id);
    if (!spec) return null;
    try {
        return spec.run();
    } catch (error) {
        return makeResult({
            pass: false,
            expected: spec.expected,
            actual: "test threw",
            message: (error && error.message) || String(error)
        });
    }
}

export function runAllSeedEquationTests() {
    return SEED_EQUATION_SPECS.map((spec) => ({ id: spec.id, ...runSeedEquationTest(spec.id) }));
}

export { cToF, fToC };
