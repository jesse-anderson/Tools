import { ASSUMED_YOGURT_DENSITY_G_PER_ML, findTimeToPh, runYogurtEstimate } from "./yogurt-model.js";
import { getIncubationResidualSummary, getStorageCfuEnvelopeResidualSummary } from "./yogurt-fit-data.js";

const REFERENCE_LINKS = {
    kneifel1993: {
        label: "Kneifel et al. 1993",
        url: "https://pubmed.ncbi.nlm.nih.gov/8494687/"
    },
    dan2023: {
        label: "Dan et al. 2023",
        url: "https://pubmed.ncbi.nlm.nih.gov/36903370/"
    },
    linares2016: {
        label: "Linares et al. 2016",
        url: "https://pubmed.ncbi.nlm.nih.gov/27920772/"
    },
    popovic2020: {
        label: "Popovic et al. 2020",
        url: "https://pubmed.ncbi.nlm.nih.gov/33076224/"
    },
    ge2024: {
        label: "Ge et al. 2024",
        url: "https://pubmed.ncbi.nlm.nih.gov/37641256/"
    },
    gouesbet2002: {
        label: "Gouesbet et al. 2002",
        url: "https://pubmed.ncbi.nlm.nih.gov/11872450/"
    },
    li2011: {
        label: "Li et al. 2011",
        url: "https://pubmed.ncbi.nlm.nih.gov/22022447/"
    },
    li2023: {
        label: "Li et al. 2023",
        url: "https://pubmed.ncbi.nlm.nih.gov/37427487/"
    },
    hamann1984: {
        label: "Hamann and Marth 1984",
        url: "https://doi.org/10.4315/0362-028X-47.10.781"
    },
    anbukkarasi2014: {
        label: "Anbukkarasi et al. 2014",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4152513/"
    },
    ramchandran2009: {
        label: "Ramchandran and Shah 2009",
        url: "https://pubmed.ncbi.nlm.nih.gov/19233782/"
    },
    yamamoto2021: {
        label: "Yamamoto et al. 2021",
        url: "https://pubmed.ncbi.nlm.nih.gov/33309355/"
    }
};

const FIXTURE_BASE_OVERRIDES = Object.freeze({
    starterMode: "manualTotal",
    starterCfuTotal: "1E8",
    starterCfuSt: "5E7",
    starterCfuLb: "5E7",
    substrateMode: "standardMilk",
    milkAmount: "64",
    milkUnit: "fl_oz",
    starterAmount: "1",
    starterUnit: "tsp",
    extraMassG: "0",
    incubationHours: "8",
    storageDays: "0",
    temperatureC: "42"
});

export function evaluateLiteratureChecks(formValues) {
    return [
        evaluatePublishedBackboneResidualCheck(),
        evaluateFreshYogurtRangeCheck(formValues),
        evaluateDanEndpointFloorCheck(formValues),
        evaluateLinaresAcidificationAnchorCheck(formValues),
        evaluatePopovicMixedStarterAnchorCheck(formValues),
        evaluateGeRatioWindowCheck(formValues),
        evaluateGePhWindowCheck(formValues),
        evaluatePopovicStorageCheck(formValues),
        evaluateGeStorageWindowCheck(formValues),
        evaluateHamannStorageRetentionCheck(formValues),
        evaluateStorageCfuEnvelopeResidualCheck(),
        evaluateAnbukkarasiShortStorageCheck(formValues),
        evaluateRamchandranTextureProxyCheck(formValues),
        evaluateGouesbetCollapseAnchorCheck(formValues),
        evaluateThermalKillCheck(formValues),
        evaluateStorageGateCheck(formValues),
        evaluateLiTemperatureTrendCheck(formValues),
        evaluateLiAcidificationTrendCheck(formValues),
        evaluateYamamotoSubstrateCheck(formValues)
    ];
}

function evaluatePublishedBackboneResidualCheck() {
    const residuals = getIncubationResidualSummary();
    const inRange = residuals.inRange;
    const extrapolation = residuals.extrapolation;
    const status = inRange.rmse <= 0.3 && inRange.maxAbsoluteError <= 0.7 ? "pass" : "warn";

    return {
        id: "published-backbone-residual",
        title: "Published 42 C incubation backbone residual check",
        reference: REFERENCE_LINKS.ge2024,
        fixture: "Fixture: Ge 2024 published primary-model anchors at 42 C plus digitized Popovic 1:2 anchor, evaluated against in-range Linares/Ge/Dan holdout curves.",
        note: "This check measures how well the published 42 C Gompertz backbone reproduces held-out incubation pH curves before user-specific temperature, substrate, and thermal corrections are applied. The summary is pooled pointwise across all validation points, not an average of per-paper RMSE values.",
        benchmark: "In-range pooled pointwise RMSE should stay modest enough that the published-ratio backbone is doing real explanatory work rather than just serving as decorative anchor points. This is a broad published-curve alignment check, not proof of batch-specific prediction.",
        model: `In-range pooled RMSE = ${inRange.rmse.toFixed(3)} pH across ${inRange.pointCount} points from ${inRange.datasetCount} datasets; pooled MAE = ${inRange.mae.toFixed(3)} pH; max abs error = ${inRange.maxAbsoluteError.toFixed(3)} pH. Out-of-range St-heavy extrapolation pooled RMSE = ${extrapolation.rmse.toFixed(3)} pH across ${extrapolation.pointCount} points.`,
        status,
        statusLabel: status === "pass" ? "Anchor-aligned" : "Needs tuning"
    };
}

function evaluateFreshYogurtRangeCheck(formValues) {
    const estimate = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "50",
        splitLbPercent: "50",
        incubationHours: "8",
        temperatureC: "42",
        substrateMode: "standardMilk"
    });

    const stFinal = estimate.speciesResults.find((item) => item.key === "st")?.finalCfuPerG ?? 0;
    const lbFinal = estimate.speciesResults.find((item) => item.key === "lb")?.finalCfuPerG ?? 0;
    const stMin = 3.5e7;
    const stMax = 1.2e9;
    const lbMin = 5.5e7;
    const lbMax = 6.5e8;
    const status = inRange(stFinal, cfuPerMlToPerG(stMin), cfuPerMlToPerG(stMax))
        && inRange(lbFinal, cfuPerMlToPerG(lbMin), cfuPerMlToPerG(lbMax))
        ? "pass"
        : "fail";

    return {
        id: "fresh-yogurt-range",
        title: "Fresh yogurt species range anchor",
        reference: REFERENCE_LINKS.kneifel1993,
        fixture: "Fixture: 50:50 St:Lb split, 8 hr, 42 C, standard milk, 1E8 starter CFU/g.",
        note: "Fresh yogurt surveys reported broad but useful endpoint ranges for rods and cocci; this is the best current species-level anchor.",
        benchmark: `S. thermophilus: ${formatScientific(stMin)} to ${formatScientific(stMax)} CFU/mL (~${formatScientific(cfuPerMlToPerG(stMin))} to ${formatScientific(cfuPerMlToPerG(stMax))} CFU/g at ${ASSUMED_YOGURT_DENSITY_G_PER_ML.toFixed(2)} g/mL); L. bulgaricus-type rods: ${formatScientific(lbMin)} to ${formatScientific(lbMax)} CFU/mL (~${formatScientific(cfuPerMlToPerG(lbMin))} to ${formatScientific(cfuPerMlToPerG(lbMax))} CFU/g).`,
        model: `Model gives S. thermophilus = ${formatWithMlEquivalent(stFinal)} and L. bulgaricus = ${formatWithMlEquivalent(lbFinal)}.`,
        status,
        statusLabel: status === "pass" ? "Within range" : "Outside range"
    };
}

function evaluateDanEndpointFloorCheck(formValues) {
    const ratios = [
        { lb: 1, st: 1 },
        { lb: 1, st: 10 },
        { lb: 1, st: 100 },
        { lb: 1, st: 1000 },
        { lb: 1, st: 2000 }
    ];
    const floor = 5.59e7;
    let minModeledTotal = Infinity;

    ratios.forEach((ratio) => {
        const total = ratio.lb + ratio.st;
        const estimate = runFixtureEstimate(formValues, {
            starterMode: "manualTotal",
            starterCfuTotal: "1E8",
            splitStPercent: String((100 * ratio.st) / total),
            splitLbPercent: String((100 * ratio.lb) / total),
            incubationHours: "8",
            temperatureC: "42",
            substrateMode: "standardMilk"
        });
        minModeledTotal = Math.min(minModeledTotal, estimate.finalTotal);
    });

    const status = minModeledTotal >= cfuPerMlToPerG(floor) ? "pass" : "fail";

    return {
        id: "dan-floor",
        title: "End-fermentation total count floor across starter ratios",
        reference: REFERENCE_LINKS.dan2023,
        fixture: "Fixture: ratio sweep across Lb:St = 1:1, 1:10, 1:100, 1:1000, 1:2000 at 8 hr, 42 C, standard milk, 1E8 starter CFU/g.",
        note: "Dan et al. reported all tested L. bulgaricus:S. thermophilus ratios above 5.59 x 10^7 CFU/mL at the end of fermentation.",
        benchmark: `All modeled end-of-fermentation totals for Lb:St ratios 1:1 through 1:2000 should stay above ${formatScientific(floor)} CFU/mL (~${formatScientific(cfuPerMlToPerG(floor))} CFU/g at ${ASSUMED_YOGURT_DENSITY_G_PER_ML.toFixed(2)} g/mL).`,
        model: `Minimum modeled total across the tested ratio sweep = ${formatWithMlEquivalent(minModeledTotal)}.`,
        status,
        statusLabel: status === "pass" ? "Above floor" : "Below floor"
    };
}

function evaluateLinaresAcidificationAnchorCheck(formValues) {
    const fiveHour = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "50",
        splitLbPercent: "50",
        incubationHours: "5",
        temperatureC: "42",
        substrateMode: "standardMilk"
    });
    const eightHour = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "50",
        splitLbPercent: "50",
        incubationHours: "8",
        temperatureC: "42",
        substrateMode: "standardMilk"
    });

    const status = fiveHour.finalPh < 5 && eightHour.finalPh >= 4.3 && eightHour.finalPh <= 4.6
        ? "pass"
        : "warn";

    return {
        id: "linares-acidification-anchor",
        title: "42 C coculture acidification envelope",
        reference: REFERENCE_LINKS.linares2016,
        fixture: "Fixture: 1:1 St:Lb split, compare 5 hr and 8 hr at 42 C, standard milk, 1E8 starter CFU/g.",
        note: "Linares et al. reported a 1:1 coculture at 42 C dropping below pH 5 after 5 hr and reaching pH 4.4 by 8 hr, with a maximal acidification rate near 0.31 to 0.33 pH units per hour.",
        benchmark: "A classical yogurt coculture at 42 C should be below pH 5 by about 5 hr and land near pH 4.4 by about 8 hr.",
        model: `Model gives pH = ${fiveHour.finalPh.toFixed(2)} at 5 hr and pH = ${eightHour.finalPh.toFixed(2)} at 8 hr.`,
        status,
        statusLabel: status === "pass" ? "Within anchor band" : "Needs tuning"
    };
}

function evaluatePopovicMixedStarterAnchorCheck(formValues) {
    const estimate = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "33.3",
        splitLbPercent: "66.7",
        incubationHours: "5",
        temperatureC: "42",
        substrateMode: "standardMilk"
    });
    const targetPh = 4.74;
    const delta = Math.abs(estimate.finalPh - targetPh);
    const status = delta <= 0.2 ? "pass" : "warn";

    return {
        id: "popovic-mixed-starter-anchor",
        title: "1:2 mixed-starter 5 hr pH anchor",
        reference: REFERENCE_LINKS.popovic2020,
        fixture: "Fixture: 1:2 St:Lb split, 5 hr, 42 C, standard milk, 1E8 starter CFU/g.",
        note: "Popovic et al. reported pH 4.74 after 5 hr at 42 C for a 1:2 mixed starter based on S. thermophilus BGKMJ1-36 and L. bulgaricus BGVLJ1-21.",
        benchmark: "A 1:2 mixed-starter benchmark at 42 C should sit close to pH 4.74 after 5 hr, not remain near fresh-milk pH or collapse far below finished-yogurt pH.",
        model: `Model gives pH = ${estimate.finalPh.toFixed(2)} after 5 hr; absolute deviation from the paper anchor = ${delta.toFixed(2)} pH units.`,
        status,
        statusLabel: status === "pass" ? "Near anchor" : "Needs tuning"
    };
}

function evaluateGeRatioWindowCheck(formValues) {
    const ratios = [
        { st: 1, lb: 1, label: "1:1" },
        { st: 2, lb: 1, label: "2:1" },
        { st: 10, lb: 1, label: "10:1" },
        { st: 19, lb: 1, label: "19:1" },
        { st: 50, lb: 1, label: "50:1" },
        { st: 100, lb: 1, label: "100:1" }
    ];
    const sweep = ratios.map((ratio) => {
        const total = ratio.st + ratio.lb;
        const estimate = runFixtureEstimate(formValues, {
            starterMode: "manualTotal",
            starterCfuTotal: "1E8",
            splitStPercent: String((100 * ratio.st) / total),
            splitLbPercent: String((100 * ratio.lb) / total),
            incubationHours: "8",
            temperatureC: "42",
            substrateMode: "standardMilk"
        });
        return {
            ...ratio,
            finalTotal: estimate.finalTotal,
            finalLog10: estimate.finalTotalLog10
        };
    });

    const best = sweep.reduce((top, item) => (item.finalTotal > top.finalTotal ? item : top), sweep[0]);
    const finalLogs = sweep.map((item) => item.finalLog10).filter(Number.isFinite);
    const logSpread = Math.max(...finalLogs) - Math.min(...finalLogs);
    const status = logSpread >= 0.12 && best.label !== "1:1" ? "pass" : "warn";

    return {
        id: "ge-ratio-window",
        title: "Starter-ratio window sensitivity check",
        reference: REFERENCE_LINKS.ge2024,
        fixture: "Fixture: St:Lb ratio sweep at 1:1, 2:1, 10:1, 19:1, 50:1, 100:1; 8 hr, 42 C, standard milk, 1E8 starter CFU/g.",
        note: "Ge et al. reported materially different fermentation behavior across a St-heavy ratio sweep and selected 19:1 as their optimal inoculum ratio for their measured performance criteria.",
        benchmark: "Even before considering refrigerated CFU decay or rheology, a coculture model should not be ratio-flat across this sweep and should place its strongest endpoint totals in a St-heavy window rather than strict 1:1.",
        model: `Best modeled total = ${formatWithMlEquivalent(best.finalTotal)} at ${best.label}; log10 spread across the sweep = ${logSpread.toFixed(2)}.`,
        status,
        statusLabel: status === "pass" ? "Ratio-sensitive" : "Too flat"
    };
}

function evaluatePopovicStorageCheck(formValues) {
    const estimate = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "33.3",
        splitLbPercent: "66.7",
        incubationHours: "5",
        temperatureC: "42",
        substrateMode: "standardMilk",
        storageDays: "28"
    });
    const targetPh = 4.01;
    const delta = Math.abs(estimate.storageFinalPh - targetPh);
    const status = delta <= 0.2 ? "pass" : "warn";

    return {
        id: "popovic-storage",
        title: "1:2 refrigerated storage endpoint check",
        reference: REFERENCE_LINKS.popovic2020,
        fixture: "Fixture: 1:2 St:Lb split, 5 hr at 42 C, then 28 days refrigerated storage in standard milk, 1E8 starter CFU/g.",
        note: "Popovic et al. reported the mixed 1:2 starter drifting down to about pH 4.01 after 28 days of refrigerated storage.",
        benchmark: "The storage layer should keep the 1:2 mixed starter near pH 4.01 after 28 days, not far above fresh yogurt pH or implausibly below the published endpoint.",
        model: `Model gives stored pH = ${estimate.storageFinalPh.toFixed(2)} after 28 days; absolute deviation from the paper anchor = ${delta.toFixed(2)} pH units.`,
        status,
        statusLabel: status === "pass" ? "Near anchor" : "Needs tuning"
    };
}

function evaluateGeStorageWindowCheck(formValues) {
    const estimate = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: String((100 * 19) / 20),
        splitLbPercent: String((100 * 1) / 20),
        incubationHours: "8",
        temperatureC: "42",
        substrateMode: "standardMilk",
        storageDays: "50"
    });
    const status = estimate.storageFinalPh >= 4.2 && estimate.storageFinalPh <= 4.4 ? "pass" : "warn";

    return {
        id: "ge-storage-window",
        title: "19:1 refrigerated pH window check",
        reference: REFERENCE_LINKS.ge2024,
        fixture: "Fixture: 19:1 St:Lb split, 8 hr at 42 C, then 50 days refrigerated storage in standard milk, 1E8 starter CFU/g.",
        note: "Ge et al. reported that the selected 19:1 ratio maintained pH between 4.2 and 4.4 during refrigerated storage and used that low post-acidification behavior as part of the ratio selection.",
        benchmark: "A storage-aware model should keep the 19:1 ratio inside roughly the pH 4.2 to 4.4 window by 50 days rather than letting it acidify as hard as the low-St ratios.",
        model: `Model gives stored pH = ${estimate.storageFinalPh.toFixed(2)} after 50 days; storage delta = ${estimate.storageDeltaPh.toFixed(2)} pH units from the fermentation endpoint.`,
        status,
        statusLabel: status === "pass" ? "Window captured" : "Needs tuning"
    };
}

function evaluateHamannStorageRetentionCheck(formValues) {
    const estimate = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "50",
        splitLbPercent: "50",
        incubationHours: "8",
        temperatureC: "42",
        substrateMode: "standardMilk",
        storageDays: "28"
    });
    const finalPoint = estimate.storageSeries?.[estimate.storageSeries.length - 1];
    const stDelta = finalPoint?.retention?.st?.deltaLog10 ?? NaN;
    const lbDelta = finalPoint?.retention?.lb?.deltaLog10 ?? NaN;
    const status = Number.isFinite(stDelta) && Number.isFinite(lbDelta) && lbDelta < stDelta - 0.35
        ? "pass"
        : "warn";

    return {
        id: "hamann-storage-cfu-retention",
        title: "Refrigerated species-retention check",
        reference: REFERENCE_LINKS.hamann1984,
        fixture: "Fixture: 50:50 St:Lb split, 8 hr at 42 C, then 28 days refrigerated storage in standard milk, 1E8 starter CFU/g.",
        note: "Hamann and Marth reported product-dependent storage survival, but the common qualitative pattern is that L. bulgaricus can lose viability substantially faster than S. thermophilus in several refrigerated yogurts.",
        benchmark: "The empirical CFU retention layer should allow stronger L. bulgaricus loss than S. thermophilus loss over 28 refrigerated days instead of applying one generic total-count decay.",
        model: `Model retention deltas at 28 days: S. thermophilus = ${formatSignedLog(stDelta)} log10; L. bulgaricus = ${formatSignedLog(lbDelta)} log10. Stored total = ${formatWithMlEquivalent(estimate.storedTotal)}.`,
        status,
        statusLabel: status === "pass" ? "Species loss separated" : "Needs retention tuning"
    };
}

function evaluateStorageCfuEnvelopeResidualCheck() {
    const summary = getStorageCfuEnvelopeResidualSummary();
    const status = summary.rmseLog10 <= 0.5 && summary.maeLog10 <= 0.35 && summary.inEnvelopePercent >= 45
        ? "limited"
        : "warn";
    const sourceSummary = summary.sourceStats
        .map((item) => `${item.source}: RMSE ${item.rmseLog10.toFixed(3)} log10 across ${item.pointCount} points`)
        .join("; ");

    return {
        id: "storage-cfu-envelope-residual",
        title: "Published storage CFU envelope residual summary",
        reference: REFERENCE_LINKS.hamann1984,
        fixture: "Fixture: clean Hamann/Marth Figures 1-4 and Anbukkarasi Table 3 storage CFU CSVs, evaluated against the nearest mild/typical/severe storage-retention envelope for the matching species and storage day.",
        note: summary.method,
        benchmark: "For exploratory use, the empirical storage envelope should keep pooled residuals near or below about half a log10 unit while making source-level mismatch visible. This is not a strain-specific refrigerated survival fit.",
        model: `Pooled envelope residual RMSE = ${summary.rmseLog10.toFixed(3)} log10; MAE = ${summary.maeLog10.toFixed(3)} log10; max abs = ${summary.maxAbsoluteErrorLog10.toFixed(3)} log10; in-envelope points = ${summary.inEnvelopeCount}/${summary.pointCount} (${summary.inEnvelopePercent.toFixed(1)}%). ${sourceSummary}.`,
        status,
        statusLabel: status === "limited" ? "Broad envelope" : "Envelope too loose"
    };
}

function evaluateAnbukkarasiShortStorageCheck(formValues) {
    const estimate = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "50",
        splitLbPercent: "50",
        incubationHours: "4",
        temperatureC: "42",
        substrateMode: "standardMilk",
        storageDays: "14"
    });
    const finalPoint = estimate.storageSeries?.[estimate.storageSeries.length - 1];
    const stDelta = finalPoint?.retention?.st?.deltaLog10 ?? NaN;
    const lbDelta = finalPoint?.retention?.lb?.deltaLog10 ?? NaN;
    const endpointUnderAcidified = estimate.finalPh > 5;
    const status = Number.isFinite(stDelta) && Number.isFinite(lbDelta)
        && stDelta <= 0.1
        && stDelta >= -1.6
        && lbDelta <= -0.45
        && lbDelta >= -2.3
        ? "pass"
        : "warn";

    return {
        id: "anbukkarasi-short-storage-cfu",
        title: "14-day refrigerated starter-count envelope",
        reference: REFERENCE_LINKS.anbukkarasi2014,
        fixture: "Fixture: 50:50 St:Lb split, 4 hr at 42 C, then 14 days refrigerated storage in standard milk, 1E8 starter CFU/g.",
        note: "Anbukkarasi et al. Table 3 reports 4 C storage counts for multiple S. thermophilus + L. bulgaricus combinations; by day 14, MRS/pH 5.4 L. bulgaricus-type counts generally decline more than M17 S. thermophilus counts.",
        benchmark: "A short-storage model should keep day-14 S. thermophilus changes in a modest-to-moderate band while allowing roughly half-log to multi-log L. bulgaricus losses depending on acid/product severity. The current fixture also exposes whether the model can reproduce fast 4-hour acidification systems.",
        model: `Model pH after 4 hr = ${estimate.finalPh.toFixed(2)}; retention deltas at 14 days: S. thermophilus = ${formatSignedLog(stDelta)} log10; L. bulgaricus = ${formatSignedLog(lbDelta)} log10.`,
        status,
        statusLabel: status === "pass"
            ? "Within broad envelope"
            : endpointUnderAcidified
                ? "Fast-acidification gap"
                : "Needs retention tuning"
    };
}

function evaluateRamchandranTextureProxyCheck(formValues) {
    const estimate = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "50",
        splitLbPercent: "50",
        incubationHours: "8",
        temperatureC: "42",
        substrateMode: "standardMilk",
        storageDays: "28"
    });
    const texture = estimate.textureProxy;
    const firmness = texture?.firmnessG ?? NaN;
    const whey = texture?.spontaneousWheySeparationPercent ?? NaN;
    const yieldStress = texture?.yieldStressPa ?? NaN;
    const status = inRange(firmness, 45, 105) && inRange(whey, 0.5, 6.5) && inRange(yieldStress, 2, 32)
        ? "limited"
        : "warn";

    return {
        id: "ramchandran-texture-proxy",
        title: "Texture proxy magnitude check",
        reference: REFERENCE_LINKS.ramchandran2009,
        fixture: "Fixture: 50:50 St:Lb split, 8 hr at 42 C, then 28 days refrigerated storage in standard milk, 1E8 starter CFU/g.",
        note: "Ramchandran and Shah measured low-fat yogurts during 4 C storage and reported firmness, spontaneous whey separation, and Herschel-Bulkley yield-stress values; the estimator maps to those as coarse anchors rather than direct rheometer predictions.",
        benchmark: "The coarse texture proxy should remain in the same order of magnitude as the Ramchandran/Shah EY and NEY yogurt anchors, not produce impossible firmness or syneresis values. This is a magnitude sanity check, not a fitted rheology validation.",
        model: `Model gives set score = ${texture?.setScore.toFixed(0) ?? "--"} / 100, firmness = ${formatFinite(firmness, 1)} g, whey separation = ${formatFinite(whey, 1)}%, yield stress = ${formatFinite(yieldStress, 1)} Pa.`,
        status,
        statusLabel: status === "limited" ? "Heuristic anchor" : "Needs texture tuning"
    };
}

function evaluateGePhWindowCheck(formValues) {
    const ratios = [
        { st: 1, lb: 1, label: "1:1" },
        { st: 2, lb: 1, label: "2:1" },
        { st: 10, lb: 1, label: "10:1" },
        { st: 19, lb: 1, label: "19:1" },
        { st: 50, lb: 1, label: "50:1" },
        { st: 100, lb: 1, label: "100:1" }
    ];
    const sweep = ratios.map((ratio) => {
        const total = ratio.st + ratio.lb;
        const estimate = runFixtureEstimate(formValues, {
            starterMode: "manualTotal",
            starterCfuTotal: "1E8",
            splitStPercent: String((100 * ratio.st) / total),
            splitLbPercent: String((100 * ratio.lb) / total),
            incubationHours: "8",
            temperatureC: "42",
            substrateMode: "standardMilk"
        });
        return {
            ...ratio,
            finalPh: estimate.finalPh,
            timeToPh46Hr: findTimeToPh(estimate.series, 4.6)
        };
    });

    const reached = sweep.filter((item) => Number.isFinite(item.timeToPh46Hr));
    const fastest = reached.reduce((best, item) => (!best || item.timeToPh46Hr < best.timeToPh46Hr ? item : best), null);
    const slowest = reached.reduce((best, item) => (!best || item.timeToPh46Hr > best.timeToPh46Hr ? item : best), null);
    const oneToOne = sweep.find((item) => item.label === "1:1");
    const spreadHr = fastest && slowest ? slowest.timeToPh46Hr - fastest.timeToPh46Hr : 0;
    const status = fastest && oneToOne && spreadHr >= 0.25 && fastest.label !== "1:1"
        ? "pass"
        : "warn";

    return {
        id: "ge-ph-window",
        title: "Time-to-pH-4.6 ratio sensitivity check",
        reference: REFERENCE_LINKS.ge2024,
        fixture: "Fixture: St:Lb ratio sweep at 1:1, 2:1, 10:1, 19:1, 50:1, 100:1; 8 hr, 42 C, standard milk, 1E8 starter CFU/g.",
        note: "Ge et al. compared the time to obtain pH 4.6 across six inoculum ratios and selected 19:1 partly because it combined high acidification rate with lower post-acidification during storage.",
        benchmark: "Modeled time to pH 4.6 should vary across the ratio sweep, and at least one St-heavy ratio should acidify faster than a strict 1:1 split.",
        model: fastest && oneToOne
            ? `Fastest modeled time to pH 4.6 = ${formatDurationHr(fastest.timeToPh46Hr)} at ${fastest.label}; 1:1 reaches pH 4.6 at ${formatDurationHr(oneToOne.timeToPh46Hr)}; sweep spread = ${spreadHr.toFixed(2)} hr.`
            : "At least one fixture did not provide a usable time-to-pH-4.6 comparison.",
        status,
        statusLabel: status === "pass" ? "pH-rate match" : "Needs tuning"
    };
}

function evaluateGouesbetCollapseAnchorCheck(formValues) {
    const heated = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "50",
        splitLbPercent: "50",
        incubationHours: String(10 / 60),
        temperatureC: "65",
        substrateMode: "standardMilk"
    });
    const lb = heated.speciesResults.find((item) => item.key === "lb");
    const survivalFraction = (lb?.finalCfuPerG ?? 0) / Math.max(lb?.initialCfuPerG ?? 1, 1e-30);
    const status = survivalFraction >= 1e-5 && survivalFraction <= 1e-3 ? "pass" : "warn";

    return {
        id: "gouesbet-collapse-anchor",
        title: "65 C early-collapse anchor check",
        reference: REFERENCE_LINKS.gouesbet2002,
        fixture: "Fixture: 50:50 St:Lb split, 10 min at 65 C, standard milk, 1E8 starter CFU/g.",
        note: "Gouesbet et al. reported L. bulgaricus survival dropping to about 8 x 10^-5 after 10 min at 65 C before a later transient recovery phase.",
        benchmark: "A reasonable thermal-collapse envelope should place L. bulgaricus survival after 10 min at 65 C on the order of 10^-4, not anywhere near normal fermentation growth.",
        model: `Model gives L. bulgaricus survival fraction = ${formatScientific(survivalFraction)} after 10 min at 65 C.`,
        status,
        statusLabel: status === "pass" ? "Order-of-magnitude match" : "Needs thermal retuning"
    };
}

function evaluateThermalKillCheck(formValues) {
    const overheated = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "50",
        splitLbPercent: "50",
        incubationHours: "8",
        temperatureC: "60",
        substrateMode: "standardMilk"
    });
    const status = overheated.finalTotal < overheated.initialTotal ? "pass" : "fail";

    return {
        id: "thermal-kill",
        title: "Supra-fermentation thermal kill check",
        reference: REFERENCE_LINKS.li2011,
        fixture: "Fixture: 50:50 St:Lb split, 8 hr, 60 C, standard milk, 1E8 starter CFU/g.",
        note: "Li et al. 2011 showed that a shift from 42 C to 50 C places S. thermophilus into a heat-shock response regime rather than ordinary fermentation conditions.",
        benchmark: "At clearly supra-fermentation temperatures, endpoint viable counts should fall below the inoculum rather than grow upward as if normal yogurt fermentation were occurring.",
        model: `Model gives initial total = ${formatWithMlEquivalent(overheated.initialTotal)} and final total = ${formatWithMlEquivalent(overheated.finalTotal)} at 60 C.`,
        status,
        statusLabel: status === "pass" ? "Thermal collapse captured" : "Still too permissive"
    };
}

function evaluateStorageGateCheck(formValues) {
    const overheated = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "50",
        splitLbPercent: "50",
        incubationHours: "8",
        temperatureC: "60",
        substrateMode: "standardMilk",
        storageDays: "28"
    });
    const storageDrift = Math.abs(overheated.storageFinalPh - overheated.finalPh);
    const status = overheated.finalPh > 6 && storageDrift <= 0.02 && overheated.storedTotal <= overheated.finalTotal * 1.01
        ? "pass"
        : "fail";

    return {
        id: "storage-gate",
        title: "Non-fermented storage gate check",
        reference: REFERENCE_LINKS.li2011,
        fixture: "Fixture: 50:50 St:Lb split, 8 hr at 60 C, then 28 days refrigerated storage in standard milk, 1E8 starter CFU/g.",
        note: "Li et al. supports treating supra-fermentation temperatures as heat-stress or heat-injury conditions rather than normal yogurt fermentation. A batch that never reaches an acidified yogurt endpoint should not inherit published yogurt post-acidification curves during storage.",
        benchmark: "If the fermentation endpoint remains near fresh-milk pH after thermal collapse, refrigerated storage should not force the pH down to a yogurt-storage curve and should not inflate collapsed viable counts.",
        model: `Model gives final pH = ${overheated.finalPh.toFixed(2)}, stored pH = ${overheated.storageFinalPh.toFixed(2)}, storage pH drift = ${storageDrift.toFixed(3)}, final total = ${formatWithMlEquivalent(overheated.finalTotal)}, stored total = ${formatWithMlEquivalent(overheated.storedTotal)}.`,
        status,
        statusLabel: status === "pass" ? "Storage gate active" : "Storage gate failed"
    };
}

function evaluateLiTemperatureTrendCheck(formValues) {
    const thirtySeven = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "66.7",
        splitLbPercent: "33.3",
        incubationHours: "8",
        temperatureC: "37",
        substrateMode: "standardMilk"
    });
    const fortyTwo = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "66.7",
        splitLbPercent: "33.3",
        incubationHours: "8",
        temperatureC: "42",
        substrateMode: "standardMilk"
    });
    const status = thirtySeven.finalTotal > fortyTwo.finalTotal ? "pass" : "warn";

    return {
        id: "li-temperature-trend",
        title: "Viable LAB temperature trend check",
        reference: REFERENCE_LINKS.li2023,
        fixture: "Fixture: 2:1 St:Lb split, 8 hr, compare 37 C vs 42 C, standard milk, 1E8 starter CFU/g.",
        note: "Li et al. reported faster acidification at 42 C but higher viable LAB population at 37 C under their tested starter system.",
        benchmark: "A viability-focused model should be able to reproduce 37 C > 42 C for final LAB population under comparable conditions.",
        model: `Model gives 37 C = ${formatWithMlEquivalent(thirtySeven.finalTotal)} and 42 C = ${formatWithMlEquivalent(fortyTwo.finalTotal)}.`,
        status,
        statusLabel: status === "pass" ? "Trend captured" : "Needs tuning"
    };
}

function evaluateLiAcidificationTrendCheck(formValues) {
    const thirtySeven = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "66.7",
        splitLbPercent: "33.3",
        incubationHours: "8",
        temperatureC: "37",
        substrateMode: "standardMilk"
    });
    const fortyTwo = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "66.7",
        splitLbPercent: "33.3",
        incubationHours: "8",
        temperatureC: "42",
        substrateMode: "standardMilk"
    });
    const time37 = findTimeToPh(thirtySeven.series, 4.6);
    const time42 = findTimeToPh(fortyTwo.series, 4.6);
    const fasterAt42 = Number.isFinite(time37) && Number.isFinite(time42)
        ? time42 + 0.1 < time37
        : fortyTwo.finalPh + 0.04 < thirtySeven.finalPh;
    const status = fasterAt42 ? "pass" : "warn";

    return {
        id: "li-acidification-trend",
        title: "Acidification temperature trend check",
        reference: REFERENCE_LINKS.li2023,
        fixture: "Fixture: 2:1 St:Lb split, 8 hr, compare 37 C vs 42 C, standard milk, 1E8 starter CFU/g.",
        note: "Li et al. reported faster acidification at 42 C while the final viable LAB population was higher at 37 C.",
        benchmark: "A pH-aware model should acidify faster at 42 C than at 37 C under the same starter split.",
        model: `Model gives pH at 8 hr: 37 C = ${thirtySeven.finalPh.toFixed(2)}, 42 C = ${fortyTwo.finalPh.toFixed(2)}; time to pH 4.6 = ${formatDurationHr(time37)} vs ${formatDurationHr(time42)}.`,
        status,
        statusLabel: status === "pass" ? "Trend captured" : "Needs tuning"
    };
}

function evaluateYamamotoSubstrateCheck(formValues) {
    const standard = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "50",
        splitLbPercent: "50",
        incubationHours: "8",
        temperatureC: "42",
        substrateMode: "standardMilk"
    });
    const hydrolyzed = runFixtureEstimate(formValues, {
        starterMode: "manualTotal",
        starterCfuTotal: "1E8",
        splitStPercent: "50",
        splitLbPercent: "50",
        incubationHours: "8",
        temperatureC: "42",
        substrateMode: "lactoseHydrolyzed"
    });

    const standardLb = standard.speciesResults.find((item) => item.key === "lb")?.finalCfuPerG ?? 0;
    const hydrolyzedLb = hydrolyzed.speciesResults.find((item) => item.key === "lb")?.finalCfuPerG ?? 0;
    const status = hydrolyzedLb > standardLb ? "limited" : "warn";

    return {
        id: "yamamoto-substrate",
        title: "Hydrolyzed-milk substrate response check",
        reference: REFERENCE_LINKS.yamamoto2021,
        fixture: "Fixture: 50:50 St:Lb split, 8 hr, 42 C, compare standard vs lactose-hydrolyzed milk, 1E8 starter CFU/g.",
        note: "Yamamoto et al. showed that lactose hydrolysis can shift coculture behavior and increase L. bulgaricus cell numbers.",
        benchmark: "A substrate-aware model should increase L. bulgaricus endpoint counts in lactose-hydrolyzed milk relative to standard milk. This check only asserts directionality; it does not validate a carbohydrate mass balance or exact magnitude.",
        model: `Model gives standard milk L. bulgaricus = ${formatWithMlEquivalent(standardLb)} and lactose-hydrolyzed milk L. bulgaricus = ${formatWithMlEquivalent(hydrolyzedLb)}.`,
        status,
        statusLabel: status === "limited" ? "Direction only" : "Needs tuning"
    };
}

function runFixtureEstimate(formValues, overrides) {
    return runYogurtEstimate({
        ...formValues,
        ...FIXTURE_BASE_OVERRIDES,
        ...overrides
    });
}

function inRange(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
}

function formatScientific(value) {
    if (!Number.isFinite(value) || value <= 0) return "0";
    const exponent = Math.floor(Math.log10(value));
    const mantissa = value / Math.pow(10, exponent);
    return `${mantissa.toFixed(2)}E${exponent}`;
}

function cfuPerMlToPerG(valuePerMl) {
    return valuePerMl / ASSUMED_YOGURT_DENSITY_G_PER_ML;
}

function cfuPerGToPerMlEquivalent(valuePerG) {
    return valuePerG * ASSUMED_YOGURT_DENSITY_G_PER_ML;
}

function formatWithMlEquivalent(valuePerG) {
    return `${formatScientific(valuePerG)} CFU/g (~${formatScientific(cfuPerGToPerMlEquivalent(valuePerG))} CFU/mL-eq)`;
}

function formatDurationHr(valueHr) {
    if (!Number.isFinite(valueHr)) return "not reached";
    return `${valueHr.toFixed(2)} hr`;
}

function formatSignedLog(value) {
    if (!Number.isFinite(value)) return "--";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatFinite(value, digits = 1) {
    if (!Number.isFinite(value)) return "--";
    return value.toFixed(digits);
}
