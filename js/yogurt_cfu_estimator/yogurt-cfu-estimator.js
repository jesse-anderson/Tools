import { DEFAULT_EXAMPLE, STARTER_PRESETS } from "./yogurt-presets.js";
import { buildCsv, buildUncertaintyBands, PH_MODEL_COEFFICIENTS, runYogurtEstimate, STORAGE_PHASE_COEFFICIENTS } from "./yogurt-model.js";
import { STORAGE_RETENTION_COEFFICIENTS, TEXTURE_PROXY_COEFFICIENTS } from "./yogurt-fit-data.js";
import { evaluateLiteratureChecks } from "./yogurt-validation.js";

const dom = {
    loadExampleBtn: document.getElementById("loadExampleBtn"),
    downloadCsvBtn: document.getElementById("downloadCsvBtn"),
    resetBtn: document.getElementById("resetBtn"),
    statusLine: document.getElementById("statusLine"),
    starterMode: document.getElementById("starterMode"),
    totalStarterLine: document.getElementById("totalStarterLine"),
    starterStLine: document.getElementById("starterStLine"),
    starterLbLine: document.getElementById("starterLbLine"),
    splitStLine: document.getElementById("splitStLine"),
    splitLbLine: document.getElementById("splitLbLine"),
    chartShell: document.getElementById("chartShell"),
    chart: document.getElementById("growthChart"),
    phChart: document.getElementById("phChart"),
    substrateChart: document.getElementById("substrateChart"),
    storageChart: document.getElementById("storageChart"),
    storageCfuChart: document.getElementById("storageCfuChart"),
    chartTooltip: document.getElementById("chartTooltip"),
    initialTotalValue: document.getElementById("initialTotalValue"),
    initialTotalLog: document.getElementById("initialTotalLog"),
    finalTotalValue: document.getElementById("finalTotalValue"),
    finalTotalLog: document.getElementById("finalTotalLog"),
    storedTotalValue: document.getElementById("storedTotalValue"),
    storedTotalLog: document.getElementById("storedTotalLog"),
    finalBandValue: document.getElementById("finalBandValue"),
    finalBandMeta: document.getElementById("finalBandMeta"),
    finalPhValue: document.getElementById("finalPhValue"),
    finalPhMeta: document.getElementById("finalPhMeta"),
    storedPhValue: document.getElementById("storedPhValue"),
    storedPhMeta: document.getElementById("storedPhMeta"),
    storageDeltaValue: document.getElementById("storageDeltaValue"),
    storageDeltaMeta: document.getElementById("storageDeltaMeta"),
    storageCfuShiftValue: document.getElementById("storageCfuShiftValue"),
    storageCfuShiftMeta: document.getElementById("storageCfuShiftMeta"),
    setProxyValue: document.getElementById("setProxyValue"),
    setProxyMeta: document.getElementById("setProxyMeta"),
    syneresisProxyValue: document.getElementById("syneresisProxyValue"),
    syneresisProxyMeta: document.getElementById("syneresisProxyMeta"),
    uncertaintyBandNote: document.getElementById("uncertaintyBandNote"),
    batchMassValue: document.getElementById("batchMassValue"),
    starterLoadingValue: document.getElementById("starterLoadingValue"),
    starterLoadingMeta: document.getElementById("starterLoadingMeta"),
    dominantSpeciesValue: document.getElementById("dominantSpeciesValue"),
    dominantSpeciesMeta: document.getElementById("dominantSpeciesMeta"),
    speciesTableBody: document.getElementById("speciesTableBody"),
    textureProxyBody: document.getElementById("textureProxyBody"),
    storageModelBody: document.getElementById("storageModelBody"),
    textureCoefficientBody: document.getElementById("textureCoefficientBody"),
    phModelParameterBody: document.getElementById("phModelParameterBody"),
    phModelDriverBody: document.getElementById("phModelDriverBody"),
    warningList: document.getElementById("warningList"),
    literatureChecksBody: document.getElementById("literatureChecksBody")
};

const inputIds = [
    "milkAmount", "milkUnit", "starterAmount", "starterUnit", "starterMode", "substrateMode",
    "starterCfuTotal", "starterCfuSt", "starterCfuLb", "splitStPercent", "splitLbPercent",
    "extraMassG", "incubationHours", "storageDays", "temperatureC", "temperatureF",
    "stLagHr", "stMuOpt", "stLmax", "stOptimumC", "stOptimumF",
    "lbLagHr", "lbMuOpt", "lbLmax", "lbOptimumC", "lbOptimumF"
];

const temperaturePairs = [
    { cId: "temperatureC", fId: "temperatureF" },
    { cId: "stOptimumC", fId: "stOptimumF" },
    { cId: "lbOptimumC", fId: "lbOptimumF" }
];

const ADVANCED_PARAMETER_TOOLTIPS = [
    {
        id: "stLagHr",
        label: "S. thermophilus lag",
        unit: "hr"
    },
    {
        id: "stMuOpt",
        label: "S. thermophilus max slope",
        unit: "log10/hr"
    },
    {
        id: "stLmax",
        label: "S. thermophilus plateau",
        unit: "log10 CFU/g"
    },
    {
        id: "lbLagHr",
        label: "L. bulgaricus lag",
        unit: "hr"
    },
    {
        id: "lbMuOpt",
        label: "L. bulgaricus max slope",
        unit: "log10/hr"
    },
    {
        id: "lbLmax",
        label: "L. bulgaricus plateau",
        unit: "log10 CFU/g"
    }
];

const state = {
    estimate: null,
    uncertainty: null,
    chartGeometry: null,
    defaultValues: null
};

document.addEventListener("DOMContentLoaded", () => {
    state.defaultValues = readFormValues();
    bindEvents();
    syncAllTemperaturePairsFromC();
    updateAdvancedParameterTooltips();
    updateModeVisibility();
    recompute();
});

function bindEvents() {
    inputIds.forEach((id) => {
        const element = document.getElementById(id);
        if (!element) return;
        element.addEventListener("input", handleInputChange);
        element.addEventListener("change", handleInputChange);
    });

    dom.loadExampleBtn.addEventListener("click", () => {
        applyFormValues(DEFAULT_EXAMPLE);
        updateModeVisibility();
        recompute();
        setStatus("Loaded bundled example batch.", "success");
    });

    dom.resetBtn.addEventListener("click", () => {
        applyFormValues(state.defaultValues || readFormValues());
        updateModeVisibility();
        recompute();
        setStatus("Reset to default inputs.");
    });

    dom.downloadCsvBtn.addEventListener("click", downloadCsv);
    dom.chartShell.addEventListener("mousemove", handleChartHover);
    dom.chartShell.addEventListener("mouseleave", hideChartHover);
}

function handleInputChange(event) {
    syncTemperaturePairFromField(event.target);
    if (event.target === dom.starterMode) {
        hydratePresetMode(dom.starterMode.value);
        updateModeVisibility();
    }
    updateAdvancedParameterTooltips();
    recompute();
}

function hydratePresetMode(modeKey) {
    const preset = STARTER_PRESETS[modeKey];
    if (!preset) return;

    if (preset.mode === "total" && Number.isFinite(preset.starterCfuPerG)) {
        document.getElementById("starterCfuTotal").value = toScientificLiteral(preset.starterCfuPerG);
    }
    if (preset.mode === "species" && preset.speciesCfuPerG) {
        document.getElementById("starterCfuSt").value = toScientificLiteral(preset.speciesCfuPerG.st);
        document.getElementById("starterCfuLb").value = toScientificLiteral(preset.speciesCfuPerG.lb);
    }
    if (preset.split) {
        document.getElementById("splitStPercent").value = String(Math.round((preset.split.st || 0) * 100));
        document.getElementById("splitLbPercent").value = String(Math.round((preset.split.lb || 0) * 100));
    }
}

function updateModeVisibility() {
    const preset = STARTER_PRESETS[dom.starterMode.value] || STARTER_PRESETS.storeYogurt;
    const isSpeciesMode = preset.mode === "species";

    dom.totalStarterLine.classList.toggle("hidden", isSpeciesMode);
    dom.starterStLine.classList.toggle("hidden", !isSpeciesMode);
    dom.starterLbLine.classList.toggle("hidden", !isSpeciesMode);
    dom.splitStLine.classList.toggle("hidden", isSpeciesMode);
    dom.splitLbLine.classList.toggle("hidden", isSpeciesMode);
}

function recompute() {
    try {
        const formValues = readFormValues();
        const estimate = runYogurtEstimate(formValues);
        const uncertainty = buildUncertaintyBands(formValues, estimate);
        state.estimate = estimate;
        state.uncertainty = uncertainty;
        renderEstimate(estimate, uncertainty, formValues);
        setStatus("Estimate updated.");
    } catch (error) {
        state.estimate = null;
        state.uncertainty = null;
        renderFailure();
        setStatus(error.message || "Estimate failed.", "error");
    }
}

function renderEstimate(estimate, uncertainty, formValues) {
    dom.initialTotalValue.textContent = `${formatCfu(estimate.initialTotal)} CFU/g`;
    dom.initialTotalLog.textContent = `log10 = ${estimate.initialTotalLog10.toFixed(2)}`;
    dom.finalTotalValue.textContent = `${formatCfu(estimate.finalTotal)} CFU/g`;
    dom.finalTotalLog.textContent = `log10 = ${estimate.finalTotalLog10.toFixed(2)}`;
    dom.storedTotalValue.textContent = `${formatCfu(estimate.storedTotal)} CFU/g`;
    dom.storedTotalLog.textContent = estimate.storageDays > 0
        ? `log10 = ${estimate.storedTotalLog10.toFixed(2)}`
        : "Matches the incubated endpoint when storage is 0 d";
    dom.finalBandValue.textContent = `${formatCfu(uncertainty.finalTotal.low)} -> ${formatCfu(uncertainty.finalTotal.high)}`;
    dom.finalBandMeta.textContent = `Likely = ${formatCfu(uncertainty.finalTotal.likely)} CFU/g`;
    dom.finalPhValue.textContent = estimate.finalPh.toFixed(2);
    dom.finalPhMeta.textContent = estimate.timeToPh46Hr != null
        ? `Reached pH 4.6 at ${formatTime(estimate.timeToPh46Hr)}`
        : "Did not reach pH 4.6 within the modeled incubation window";
    dom.storedPhValue.textContent = estimate.storageFinalPh.toFixed(2);
    dom.storedPhMeta.textContent = estimate.storageDays > 0
        ? `After ${formatStorageDay(estimate.storageDays)} refrigerated storage`
        : "No refrigerated storage applied";
    dom.storageDeltaValue.textContent = formatSigned(estimate.storageDeltaPh, 2);
    dom.storageDeltaMeta.textContent = estimate.storageDays > 0
        ? "Negative means additional acidification during storage"
        : "Storage phase disabled";
    dom.storageCfuShiftValue.textContent = `${formatSigned(estimate.storageLogDelta, 2)} log10`;
    dom.storageCfuShiftMeta.textContent = estimate.storageDays > 0
        ? "Empirical retention vs incubated endpoint"
        : "No refrigerated CFU decay applied";
    const texture = estimate.textureProxy;
    dom.setProxyValue.textContent = texture?.setClass?.label ?? "--";
    dom.setProxyMeta.textContent = texture
        ? `Score ${texture.setScore.toFixed(0)} / 100; firmness ${texture.firmnessG.toFixed(0)} g`
        : "--";
    dom.syneresisProxyValue.textContent = texture?.syneresisRisk?.label ?? "--";
    dom.syneresisProxyMeta.textContent = texture
        ? `${texture.spontaneousWheySeparationPercent.toFixed(1)}% whey separation proxy`
        : "--";
    dom.uncertaintyBandNote.textContent = uncertainty.note;
    dom.batchMassValue.textContent = formatMass(estimate.batchMassG);
    dom.starterLoadingValue.textContent = formatPercentFraction(estimate.starterG / Math.max(estimate.milkG, 1e-9), 2);
    dom.starterLoadingMeta.textContent = `Starter:milk = ${formatStarterToMilkRatio(estimate.starterG, estimate.milkG)} by mass`;
    dom.dominantSpeciesValue.textContent = estimate.displayedDominantSpecies.label;
    dom.dominantSpeciesMeta.textContent = `${((estimate.displayedDominantSpecies.finalCfuPerG / Math.max(estimate.storedTotal, 1e-30)) * 100 || 0).toFixed(1)}% of displayed endpoint CFU/g`;

    renderSpeciesTable(estimate, uncertainty);
    renderPhModelDetails(estimate);
    renderStorageModelDetails(estimate);
    renderTextureProxy(estimate);
    renderTextureCoefficientDetails(estimate);
    renderWarnings(estimate.warnings);
    renderLiteratureChecks(formValues);
    renderChart(estimate);
    renderPhChart(estimate);
    renderSubstrateChart(estimate);
    renderStorageChart(estimate);
    renderStorageCfuChart(estimate);
}

function renderFailure() {
    dom.initialTotalValue.textContent = "--";
    dom.initialTotalLog.textContent = "--";
    dom.finalTotalValue.textContent = "--";
    dom.finalTotalLog.textContent = "--";
    dom.storedTotalValue.textContent = "--";
    dom.storedTotalLog.textContent = "--";
    dom.finalBandValue.textContent = "--";
    dom.finalBandMeta.textContent = "--";
    dom.finalPhValue.textContent = "--";
    dom.finalPhMeta.textContent = "--";
    dom.storedPhValue.textContent = "--";
    dom.storedPhMeta.textContent = "--";
    dom.storageDeltaValue.textContent = "--";
    dom.storageDeltaMeta.textContent = "--";
    dom.storageCfuShiftValue.textContent = "--";
    dom.storageCfuShiftMeta.textContent = "--";
    dom.setProxyValue.textContent = "--";
    dom.setProxyMeta.textContent = "--";
    dom.syneresisProxyValue.textContent = "--";
    dom.syneresisProxyMeta.textContent = "--";
    dom.batchMassValue.textContent = "--";
    dom.starterLoadingValue.textContent = "--";
    dom.starterLoadingMeta.textContent = "--";
    dom.dominantSpeciesValue.textContent = "--";
    dom.dominantSpeciesMeta.textContent = "--";
    dom.uncertaintyBandNote.textContent = "Low/high bands are deterministic scenario bounds. The plotted curves remain the likely scenario.";
    dom.speciesTableBody.innerHTML = "<tr><td colspan=\"6\">No estimate available.</td></tr>";
    if (dom.textureProxyBody) {
        dom.textureProxyBody.innerHTML = "<tr><td colspan=\"3\">No texture proxy available yet.</td></tr>";
    }
    if (dom.storageModelBody) {
        dom.storageModelBody.innerHTML = "<tr><td colspan=\"3\">No storage model values available yet.</td></tr>";
    }
    if (dom.textureCoefficientBody) {
        dom.textureCoefficientBody.innerHTML = "<tr><td colspan=\"3\">No texture coefficient values available yet.</td></tr>";
    }
    if (dom.phModelParameterBody) {
        dom.phModelParameterBody.innerHTML = "<tr><td colspan=\"3\">No pH model values available yet.</td></tr>";
    }
    if (dom.phModelDriverBody) {
        dom.phModelDriverBody.innerHTML = "<tr><td colspan=\"3\">No driver terms available yet.</td></tr>";
    }
    dom.warningList.innerHTML = "<li>Estimate failed.</li>";
    dom.literatureChecksBody.innerHTML = "<tr><td colspan=\"4\">Literature back-checks unavailable.</td></tr>";
    dom.chart.innerHTML = "";
    if (dom.phChart) dom.phChart.innerHTML = "";
    if (dom.substrateChart) dom.substrateChart.innerHTML = "";
    if (dom.storageChart) dom.storageChart.innerHTML = "";
    if (dom.storageCfuChart) dom.storageCfuChart.innerHTML = "";
    state.chartGeometry = null;
    hideChartHover();
}

function renderSpeciesTable(estimate, uncertainty) {
    dom.speciesTableBody.innerHTML = estimate.speciesResults.map((species) => {
        const band = uncertainty.species.find((item) => item.key === species.key)?.finalBand;
        const storedSpecies = estimate.storedSpeciesResults?.find((item) => item.key === species.key);
        const displayedEndpointCfu = storedSpecies?.finalCfuPerG ?? species.finalCfuPerG;
        const displayedEndpointShare = storedSpecies?.endpointShare ?? species.endpointShare;
        return `
        <tr>
            <td><span class="species-chip" style="--chip-color:${species.color}">${species.label}</span></td>
            <td>${formatCfu(species.initialCfuPerG)}</td>
            <td>${formatCfu(species.finalCfuPerG)}</td>
            <td>${formatCfu(displayedEndpointCfu)}</td>
            <td>${band ? `${formatCfu(band.low)} -> ${formatCfu(band.high)}` : "--"}</td>
            <td>${(displayedEndpointShare * 100).toFixed(1)}%</td>
        </tr>
    `;
    }).join("");
}

function renderPhModelDetails(estimate) {
    if (!dom.phModelParameterBody || !dom.phModelDriverBody) return;

    const phModel = estimate.assumptions?.pHModel;
    const derivation = phModel?.derivation;
    if (!phModel || !derivation) {
        dom.phModelParameterBody.innerHTML = "<tr><td colspan=\"3\">No pH model values available yet.</td></tr>";
        dom.phModelDriverBody.innerHTML = "<tr><td colspan=\"3\">No driver terms available yet.</td></tr>";
        return;
    }

    const split = derivation.split || { st: 0, lb: 0 };
    const literatureBackbone = derivation.literatureBackbone || {};
    const lowerAnchor = literatureBackbone.lowerAnchor || null;
    const upperAnchor = literatureBackbone.upperAnchor || null;
    const fitResiduals = derivation.fitResiduals || {};
    const substrateLabel = estimate.substrateLabel || "Displayed substrate mode";
    const hydroModeNote = derivation.substrateMode === "lactoseHydrolyzed"
        ? "Hydrolyzed-milk adjustments are active for the displayed formulation."
        : "Standard-milk adjustments are active for the displayed formulation.";
    const phCoefficients = PH_MODEL_COEFFICIENTS;
    const inoculumCoefficients = phCoefficients.inoculumLift;

    const parameterRows = [
        {
            term: "pH0",
            value: formatFixed(phModel.initialPh, 3),
            detail: `${substrateLabel} baseline. Standard milk starts at ${formatFixed(phCoefficients.standardInitialPh, 2)}; lactose-hydrolyzed milk starts at ${formatFixed(phCoefficients.hydrolyzedInitialPh, 2)}.`
        },
        {
            term: "pH_inf",
            value: formatFixed(phModel.terminalPh, 3),
            detail: `Start from the published 42 C terminal pH anchor ${formatFixed(literatureBackbone.terminalPh42C, 3)}, apply temperature/inoculum/substrate shifts, then blend it back toward pH0 by thermal factor ${formatFixed(derivation.thermalFactor, 3)}.`
        },
        {
            term: "A",
            value: formatFixed(phModel.amplitude, 3),
            detail: `Computed directly as pH0 - pH_inf = ${formatFixed(phModel.initialPh, 3)} - ${formatFixed(phModel.terminalPh, 3)}.`
        },
        {
            term: "mu",
            value: `${formatFixed(phModel.maxAcidificationRate, 3)} pH/hr`,
            detail: `(literature mu at 42 C x temperature rate factor + inoculum lift + hydro bonus) x thermal factor, then clamped into [${formatFixed(phCoefficients.maxAcidificationRateClamp.min, 2)}, ${formatFixed(phCoefficients.maxAcidificationRateClamp.max, 2)}].`
        },
        {
            term: "lambda",
            value: `${formatFixed(phModel.lagHr, 3)} hr`,
            detail: `literature lag at 42 C + temperature lag offset + inoculum lag contribution + hydro lag shift, then clamped into [${formatFixed(phCoefficients.lagClampHr.min, 2)}, ${formatFixed(phCoefficients.lagClampHr.max, 1)}] hr.`
        },
        {
            term: "Reference target",
            value: `pH ${formatFixed(phModel.referenceTargetPh, 2)}`,
            detail: "Fixed literature-facing threshold used for the time-to-pH-4.6 summary and validation rows."
        },
        {
            term: "In-range pooled RMSE",
            value: `${formatFixed(fitResiduals.inRange?.rmse ?? 0, 3)} pH`,
            detail: `Pooled pointwise RMSE against the in-range incubation validation curves (${fitResiduals.inRange?.pointCount ?? 0} points across ${fitResiduals.inRange?.datasetCount ?? 0} datasets).`
        }
    ];

    const driverRows = [
        {
            term: "Starter split",
            value: `St ${formatPercent(split.st)} / Lb ${formatPercent(split.lb)}`,
            detail: "Normalized from the starter CFU contributions before fermentation begins."
        },
        {
            term: "log10(St/Lb)",
            value: formatSigned(derivation.ratioLog, 3),
            detail: "Ratio coordinate used to interpolate between published incubation anchors at 42 C."
        },
        {
            term: "Lower literature anchor",
            value: lowerAnchor ? `${lowerAnchor.label} (${lowerAnchor.source})` : "--",
            detail: lowerAnchor ? `Anchor below or at the displayed ratio. 42 C base values: terminal pH ${formatFixed(lowerAnchor.terminalPh42C, 3)}, mu ${formatFixed(lowerAnchor.maxAcidificationRate42C, 3)} pH/hr, lag ${formatFixed(lowerAnchor.lagHr42C, 3)} hr.` : "No lower anchor available."
        },
        {
            term: "Upper literature anchor",
            value: upperAnchor ? `${upperAnchor.label} (${upperAnchor.source})` : "--",
            detail: upperAnchor ? `Anchor above or at the displayed ratio. 42 C base values: terminal pH ${formatFixed(upperAnchor.terminalPh42C, 3)}, mu ${formatFixed(upperAnchor.maxAcidificationRate42C, 3)} pH/hr, lag ${formatFixed(upperAnchor.lagHr42C, 3)} hr.` : "No upper anchor available."
        },
        {
            term: "Backbone blend fraction",
            value: formatFixed(literatureBackbone.fraction, 3),
            detail: "Linear interpolation fraction on the log-ratio axis between the lower and upper incubation anchors."
        },
        {
            term: "Interpolated 42 C terminal pH",
            value: formatFixed(literatureBackbone.terminalPh42C, 3),
            detail: "Published/digitized 42 C terminal pH backbone before temperature, inoculum, substrate, and thermal corrections."
        },
        {
            term: "Interpolated 42 C mu",
            value: `${formatFixed(literatureBackbone.maxAcidificationRate42C, 3)} pH/hr`,
            detail: "Published/digitized 42 C maximum acidification rate before secondary adjustments."
        },
        {
            term: "Interpolated 42 C lag",
            value: `${formatFixed(literatureBackbone.lagHr42C, 3)} hr`,
            detail: "Published/digitized 42 C lag period before secondary adjustments."
        },
        {
            term: "Temperature rate factor",
            value: formatFixed(derivation.temperatureRateFactor, 3),
            detail: "Secondary temperature correction applied multiplicatively to the literature 42 C acidification rate."
        },
        {
            term: "Temperature lag offset",
            value: `${formatSigned(derivation.temperatureLagOffsetHr, 3)} hr`,
            detail: "Secondary temperature correction applied additively to the literature 42 C lag period."
        },
        {
            term: "Temperature terminal shift",
            value: `${formatSigned(derivation.temperatureTerminalShift, 3)} pH`,
            detail: "Secondary temperature correction applied to the published terminal-pH floor."
        },
        {
            term: "Initial inoculum",
            value: `${formatCfu(derivation.initialTotalCfuPerG)} CFU/g`,
            detail: "Mass-balance starting inoculum in the mixed batch before modeled growth begins."
        },
        {
            term: "Inoculum lift",
            value: formatSigned(derivation.inoculumLift, 3),
            detail: `clamp((log10(initial inoculum) - ${formatFixed(inoculumCoefficients.centerLog10, 2)}) / ${formatFixed(inoculumCoefficients.spanLog10, 1)}, ${formatSigned(inoculumCoefficients.min, 2)}, ${formatSigned(inoculumCoefficients.max, 2)}). Higher inoculum shortens lag and modestly raises rate.`
        },
        {
            term: "Hydro shift",
            value: `${formatSigned(derivation.hydroShift, 3)} pH`,
            detail: `Terminal-pH shift from substrate mode. ${hydroModeNote}`
        },
        {
            term: "Hydro rate bonus",
            value: `${formatSigned(derivation.hydroRateBonus, 3)} pH/hr`,
            detail: "Added only in lactose-hydrolyzed mode to reflect faster acidification accessibility."
        },
        {
            term: "Hydro lag shift",
            value: `${formatSigned(derivation.hydroLagShift, 3)} hr`,
            detail: "Negative values shorten apparent acidification lag in lactose-hydrolyzed mode."
        },
        {
            term: "Thermal factor",
            value: formatFixed(derivation.thermalFactor, 3),
            detail: "Fermentation allowance above 45 C. It equals 1.000 at or below 45 C and collapses toward zero at supra-fermentation temperatures."
        },
        {
            term: "Unconstrained pH floor",
            value: formatFixed(derivation.unconstrainedTerminalPh, 3),
            detail: "Terminal pH before the thermal factor blends the floor back toward pH0."
        },
        {
            term: "Extrapolation pooled RMSE",
            value: `${formatFixed(fitResiduals.extrapolation?.rmse ?? 0, 3)} pH`,
            detail: `Pooled pointwise RMSE against out-of-range literature curves such as the very St-heavy Dan ratio sweep (${fitResiduals.extrapolation?.pointCount ?? 0} points).`
        }
    ];

    dom.phModelParameterBody.innerHTML = parameterRows.map((row) => `
        <tr>
            <td><code>${escapeHtml(row.term)}</code></td>
            <td>${escapeHtml(row.value)}</td>
            <td>${escapeHtml(row.detail)}</td>
        </tr>
    `).join("");

    dom.phModelDriverBody.innerHTML = driverRows.map((row) => `
        <tr>
            <td>${escapeHtml(row.term)}</td>
            <td>${escapeHtml(row.value)}</td>
            <td>${escapeHtml(row.detail)}</td>
        </tr>
    `).join("");
}

function renderStorageModelDetails(estimate) {
    if (!dom.storageModelBody) return;

    const series = Array.isArray(estimate.storageSeries) ? estimate.storageSeries : [];
    if (!series.length) {
        dom.storageModelBody.innerHTML = "<tr><td colspan=\"3\">Storage phase disabled; no storage coefficients are active.</td></tr>";
        return;
    }

    const point = series[series.length - 1];
    const stRetention = point.retention?.st || {};
    const lbRetention = point.retention?.lb || {};
    const storageCoefficients = STORAGE_PHASE_COEFFICIENTS;
    const eligibilityCoefficients = storageCoefficients.fermentationEligibility;
    const carryoverCoefficients = storageCoefficients.endpointCarryover;
    const retentionCoefficients = STORAGE_RETENTION_COEFFICIENTS;
    const retentionBlendThreshold = retentionCoefficients.profileBlend.mildToTypicalMax;
    const pHCompletion = estimate.finalPh <= eligibilityCoefficients.fullyAcidifiedPh
        ? 1
        : clamp(
            (eligibilityCoefficients.upperAcidifiedPh - estimate.finalPh) / (eligibilityCoefficients.upperAcidifiedPh - eligibilityCoefficients.fullyAcidifiedPh),
            0,
            1
        );
    const viableCompletion = clamp(
        (estimate.finalTotalLog10 - eligibilityCoefficients.viableLog10Floor) / eligibilityCoefficients.viableLog10Span,
        0,
        1
    );
    const rows = [
        {
            term: "Storage pH eligibility",
            value: formatFixed(point.fermentationEligibility, 3),
            detail: `min(pH completion ${formatFixed(pHCompletion, 3)}, viable completion ${formatFixed(viableCompletion, 3)}). pH completion = 1 when final pH <= ${formatFixed(eligibilityCoefficients.fullyAcidifiedPh, 2)}, else clamp((upper acidified pH - final pH) / pH span, 0, 1). Viable completion = clamp((final log10 CFU/g - ${formatFixed(eligibilityCoefficients.viableLog10Floor, 2)}) / ${formatFixed(eligibilityCoefficients.viableLog10Span, 2)}, 0, 1).`
        },
        {
            term: "Storage pH carryover",
            value: formatFixed(point.endpointCarryover, 3),
            detail: `lerp(${formatFixed(carryoverCoefficients.initialResidualWeight, 2)}, ${formatFixed(carryoverCoefficients.residualWeightAfterTransition, 2)}, clamp(storage day / ${formatFixed(carryoverCoefficients.transitionDays, 0)}, 0, 1)). This prevents the incubation endpoint residual from carrying into storage one-for-one.`
        },
        {
            term: "Storage pH blend",
            value: `${formatSigned(point.deltaPh, 3)} pH`,
            detail: `reference pH ${formatFixed(point.referencePh, 3)} plus endpoint residual carryover, then multiplied by storage pH eligibility. Published reference delta at this day = ${formatSigned(point.referenceDeltaPh, 3)} pH.`
        },
        {
            term: "St retention severity",
            value: formatFixed(stRetention.severity, 3),
            detail: `clamp01(${formatFixed(retentionCoefficients.severityWeights.acid, 2)} x acidSeverity x ${formatFixed(retentionCoefficients.speciesWeights.st.acid, 2)} + ${formatFixed(retentionCoefficients.severityWeights.postAcidification, 2)} x postAcidificationSeverity ${formatSigned(retentionCoefficients.speciesWeights.st.ratio, 2)} x lbHeavySeverity ${formatSigned(retentionCoefficients.severityWeights.stHeavyProtection, 2)} x stHeavyProtection). Current acidSeverity ${formatFixed(stRetention.acidSeverity, 3)}, post-acidification ${formatFixed(stRetention.postAcidificationSeverity, 3)}.`
        },
        {
            term: "Lb retention severity",
            value: formatFixed(lbRetention.severity, 3),
            detail: `clamp01(${formatFixed(retentionCoefficients.severityWeights.acid, 2)} x acidSeverity x ${formatFixed(retentionCoefficients.speciesWeights.lb.acid, 2)} + ${formatFixed(retentionCoefficients.severityWeights.postAcidification, 2)} x postAcidificationSeverity + ${formatFixed(retentionCoefficients.speciesWeights.lb.ratio, 2)} x lbHeavySeverity ${formatSigned(retentionCoefficients.severityWeights.stHeavyProtection, 2)} x stHeavyProtection). Current acidSeverity ${formatFixed(lbRetention.acidSeverity, 3)}, post-acidification ${formatFixed(lbRetention.postAcidificationSeverity, 3)}.`
        },
        {
            term: "Envelope blend",
            value: `${stRetention.profileLow || "--"} -> ${stRetention.profileHigh || "--"}`,
            detail: `severity <= ${formatFixed(retentionBlendThreshold, 2)} blends mild-to-typical storage envelopes; severity > ${formatFixed(retentionBlendThreshold, 2)} blends typical-to-severe envelopes. Envelopes are empirical Hamann/Anbukkarasi delta-log curves.`
        },
        {
            term: "Endpoint CFU retention",
            value: `St ${formatSigned(stRetention.deltaLog10, 3)} log10; Lb ${formatSigned(lbRetention.deltaLog10, 3)} log10`,
            detail: "Stored species CFU/g = incubated endpoint CFU/g x 10^(species storage delta log10)."
        }
    ];

    dom.storageModelBody.innerHTML = rows.map((row) => `
        <tr>
            <td><code>${escapeHtml(row.term)}</code></td>
            <td>${escapeHtml(row.value)}</td>
            <td>${escapeHtml(row.detail)}</td>
        </tr>
    `).join("");
}

function renderTextureProxy(estimate) {
    if (!dom.textureProxyBody) return;

    const texture = estimate.textureProxy;
    if (!texture) {
        dom.textureProxyBody.innerHTML = "<tr><td colspan=\"3\">No texture proxy available yet.</td></tr>";
        return;
    }

    const drivers = texture.drivers || {};
    const firmnessRange = texture.firmnessRangeG || {};
    const wheyRange = texture.wheySeparationRangePercent || {};
    const yieldRange = texture.yieldStressRangePa || {};
    const sourceList = Array.isArray(texture.sources) ? texture.sources.join("; ") : "Ramchandran and Shah 2009";
    const referenceDay = Number.isFinite(texture.referenceDay) ? texture.referenceDay.toFixed(0) : "--";
    const driverSummary = [
        `acid-set ${formatPercent(drivers.acidSetProgress ?? 0, 0)}`,
        `gel maturation ${formatPercent(drivers.gelMaturationProgress ?? 0, 0)}`,
        `storage maturation ${formatPercent(drivers.storageMaturation ?? 0, 0)}`,
        `over-acidification ${formatPercent(drivers.overAcidification ?? 0, 0)}`,
        `solids boost ${formatPercent(drivers.solidsBoost ?? 0, 0)}`,
        `starter balance ${formatPercent(drivers.balanceFactor ?? 0, 0)}`
    ].join("; ");

    const rows = [
        {
            output: "Set score",
            value: `${texture.setScore.toFixed(0)} / 100`,
            interpretation: `${texture.setClass?.label ?? "Unclassified"}. Higher values indicate a stronger acid-set/matured gel proxy.`
        },
        {
            output: "Firmness proxy",
            value: `${texture.firmnessG.toFixed(1)} g`,
            interpretation: `Ramchandran/Shah-anchored range ${formatRange(firmnessRange.low, firmnessRange.high, 1, "g")} at reference day ${referenceDay}.`
        },
        {
            output: "Spontaneous whey separation proxy",
            value: `${texture.spontaneousWheySeparationPercent.toFixed(1)}%`,
            interpretation: `${texture.syneresisRisk?.label ?? "Unclassified"} syneresis risk; reference range ${formatRange(wheyRange.low, wheyRange.high, 1, "%")}.`
        },
        {
            output: "Yield-stress proxy",
            value: `${texture.yieldStressPa.toFixed(1)} Pa`,
            interpretation: `Herschel-Bulkley yield-stress anchor range ${formatRange(yieldRange.low, yieldRange.high, 1, "Pa")}.`
        },
        {
            output: "Drivers",
            value: driverSummary,
            interpretation: "Internal normalized terms used to scale the published low-fat yogurt texture anchors."
        },
        {
            output: "Scope",
            value: texture.modelName,
            interpretation: `${texture.scopeNote} Sources: ${sourceList}.`
        }
    ];

    dom.textureProxyBody.innerHTML = rows.map((row) => `
        <tr>
            <td>${escapeHtml(row.output)}</td>
            <td>${escapeHtml(row.value)}</td>
            <td>${escapeHtml(row.interpretation)}</td>
        </tr>
    `).join("");
}

function renderTextureCoefficientDetails(estimate) {
    if (!dom.textureCoefficientBody) return;

    const texture = estimate.textureProxy;
    if (!texture) {
        dom.textureCoefficientBody.innerHTML = "<tr><td colspan=\"3\">No texture coefficient values available yet.</td></tr>";
        return;
    }

    const drivers = texture.drivers || {};
    const textureCoefficients = TEXTURE_PROXY_COEFFICIENTS;
    const rows = [
        {
            term: "Set score",
            value: `${texture.setScore.toFixed(0)} / 100`,
            detail: `100 x clamp(${formatFixed(textureCoefficients.acidSet.weight, 2)} x acidSet + ${formatFixed(textureCoefficients.gelMaturation.weight, 2)} x gelMaturation + ${formatFixed(textureCoefficients.storageMaturation.weight, 2)} x storageMaturation + ${formatFixed(textureCoefficients.solidsBoost.weight, 2)} x solidsBoost + ${formatFixed(textureCoefficients.balanceFactor.weight, 2)} x starterBalance ${formatSigned(textureCoefficients.overAcidification.weight, 2)} x overAcidification - St-heavy penalty, 0, 1).`
        },
        {
            term: "Driver values",
            value: `acid ${formatPercent(drivers.acidSetProgress ?? 0, 0)}; gel ${formatPercent(drivers.gelMaturationProgress ?? 0, 0)}; storage ${formatPercent(drivers.storageMaturation ?? 0, 0)}`,
            detail: `over-acid ${formatPercent(drivers.overAcidification ?? 0, 0)}, solids ${formatPercent(drivers.solidsBoost ?? 0, 0)}, starter balance ${formatPercent(drivers.balanceFactor ?? 0, 0)}.`
        },
        {
            term: "Set scale",
            value: formatFixed(clamp(texture.setScore / textureCoefficients.setScale.divisor, textureCoefficients.setScale.min, textureCoefficients.setScale.max), 3),
            detail: `clamp(set score / ${formatFixed(textureCoefficients.setScale.divisor, 0)}, ${formatFixed(textureCoefficients.setScale.min, 2)}, ${formatFixed(textureCoefficients.setScale.max, 2)}). This scales Ramchandran/Shah firmness and yield-stress anchors.`
        },
        {
            term: "Firmness / yield scaling",
            value: `firmness ${texture.firmnessG.toFixed(1)} g; yield ${texture.yieldStressPa.toFixed(1)} Pa`,
            detail: `Published EY/NEY texture anchors x setScale x (1 ${formatSigned(textureCoefficients.overAcidification.weight, 2)} x overAcidification) x (1 + ${formatFixed(textureCoefficients.solidsBoost.firmnessScaleWeight, 2)} x solidsBoost), then reported as the midpoint-weighted proxy.`
        },
        {
            term: "Whey separation",
            value: `${texture.spontaneousWheySeparationPercent.toFixed(1)}%`,
            detail: `EY anchor + ${formatFixed(textureCoefficients.wheySeparation.lowUnderSetWeight, 1)} x underSet + ${formatFixed(textureCoefficients.wheySeparation.lowOverAcidWeight, 1)} x overAcidification ${formatSigned(textureCoefficients.solidsBoost.lowWheyWeight, 2)} x solidsBoost; NEY anchor + ${formatFixed(textureCoefficients.wheySeparation.highUnderSetWeight, 1)} x underSet + ${formatFixed(textureCoefficients.wheySeparation.highOverAcidWeight, 1)} x overAcidification ${formatSigned(textureCoefficients.solidsBoost.highWheyWeight, 2)} x solidsBoost; likely value is the midpoint-weighted proxy.`
        },
        {
            term: "Class thresholds",
            value: texture.setClass?.label ?? "--",
            detail: `set score <${formatFixed(textureCoefficients.classThresholds.weakMax, 0)} = not set/weak gel; <${formatFixed(textureCoefficients.classThresholds.softMax, 0)} = soft set; <${formatFixed(textureCoefficients.classThresholds.setMax, 0)} = set; >=${formatFixed(textureCoefficients.classThresholds.setMax, 0)} = firm set unless stored pH <${formatFixed(textureCoefficients.classThresholds.firmButAcidicPh, 2)}, which is labeled firm but acidic.`
        }
    ];

    dom.textureCoefficientBody.innerHTML = rows.map((row) => `
        <tr>
            <td><code>${escapeHtml(row.term)}</code></td>
            <td>${escapeHtml(row.value)}</td>
            <td>${escapeHtml(row.detail)}</td>
        </tr>
    `).join("");
}

function renderWarnings(warnings) {
    if (!warnings.length) {
        dom.warningList.innerHTML = "<li class=\"ok\">No warnings.</li>";
        return;
    }
    dom.warningList.innerHTML = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
}

function renderLiteratureChecks(formValues) {
    const checks = evaluateLiteratureChecks(formValues);
    dom.literatureChecksBody.innerHTML = checks.map((check) => `
        <tr>
            <td>
                <span class="validation-check-title">${escapeHtml(check.title)}</span>
                <a class="validation-check-ref" href="${escapeAttribute(check.reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(check.reference.label)}</a>
                <span class="validation-check-fixture">${escapeHtml(check.fixture)}</span>
                <span class="validation-check-note">${escapeHtml(check.note)}</span>
            </td>
            <td><span class="validation-cell-copy">${escapeHtml(check.benchmark)}</span></td>
            <td><span class="validation-cell-copy">${escapeHtml(check.model)}</span></td>
            <td><span class="validation-status ${escapeAttribute(check.status)}">${escapeHtml(check.statusLabel)}</span></td>
        </tr>
    `).join("");
}

function renderChart(estimate) {
    const svg = dom.chart;
    const width = 900;
    const height = 480;
    const padding = { top: 28, right: 26, bottom: 52, left: 74 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const positiveValues = estimate.series
        .flatMap((point) => [point.totalLog10, safeLog10(point.species.st), safeLog10(point.species.lb)])
        .filter((value) => Number.isFinite(value) && value > 0);

    const yMin = Math.max(0, Math.floor(Math.min(...positiveValues, 4)) - 1);
    const yMax = Math.max(yMin + 2, Math.ceil(Math.max(...positiveValues, 8.5)) + 0.5);
    const xMax = Math.max(estimate.incubationHours, 1);

    const xToPx = (value) => padding.left + (value / xMax) * plotWidth;
    const yToPx = (value) => padding.top + ((yMax - value) / (yMax - yMin)) * plotHeight;

    const yTicks = [];
    for (let tick = Math.ceil(yMin); tick <= Math.floor(yMax); tick += 1) yTicks.push(tick);

    const totalPath = buildPath(estimate.series, (point) => xToPx(point.timeHr), (point) => yToPx(point.totalLog10));
    const stPath = buildPath(estimate.series, (point) => xToPx(point.timeHr), (point) => yToPx(safeLog10(point.species.st)));
    const lbPath = buildPath(estimate.series, (point) => xToPx(point.timeHr), (point) => yToPx(safeLog10(point.species.lb)));
    const lastPoint = estimate.series[estimate.series.length - 1];

    svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
        ${yTicks.map((tick) => `
            <g>
                <line class="chart-grid-line" x1="${padding.left}" y1="${yToPx(tick)}" x2="${width - padding.right}" y2="${yToPx(tick)}"></line>
                <text class="chart-tick-label" x="${padding.left - 12}" y="${yToPx(tick) + 4}" text-anchor="end">${tick.toFixed(0)}</text>
            </g>
        `).join("")}
        ${Array.from({ length: 7 }, (_, index) => {
            const tick = (xMax * index) / 6;
            return `
                <g>
                    <line class="chart-grid-line" x1="${xToPx(tick)}" y1="${padding.top}" x2="${xToPx(tick)}" y2="${height - padding.bottom}"></line>
                    <text class="chart-tick-label" x="${xToPx(tick)}" y="${height - padding.bottom + 22}" text-anchor="middle">${tick.toFixed(1)}</text>
                </g>
            `;
        }).join("")}
        <line class="chart-axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
        <line class="chart-axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
        <path class="chart-total-line" d="${totalPath}"></path>
        <path class="chart-st-line" d="${stPath}"></path>
        <path class="chart-lb-line" d="${lbPath}"></path>
        <circle class="chart-point" cx="${xToPx(lastPoint.timeHr)}" cy="${yToPx(lastPoint.totalLog10)}" r="5" fill="var(--accent-primary)"></circle>
        <g id="chartHoverGroup" visibility="hidden">
            <line id="chartHoverLine" class="chart-hover-line" x1="0" y1="${padding.top}" x2="0" y2="${height - padding.bottom}"></line>
            <circle id="chartHoverTotal" class="chart-hover-circle" cx="0" cy="0" r="5" fill="var(--accent-primary)"></circle>
            <circle id="chartHoverSt" class="chart-hover-circle" cx="0" cy="0" r="4.5" fill="var(--accent-secondary)"></circle>
            <circle id="chartHoverLb" class="chart-hover-circle" cx="0" cy="0" r="4.5" fill="var(--accent-tertiary)"></circle>
        </g>
        <text class="chart-axis-label" x="${padding.left + plotWidth / 2}" y="${height - 10}" text-anchor="middle">Incubation Time (hr)</text>
        <text class="chart-axis-label" transform="translate(20 ${padding.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">log10 CFU/g</text>
    `;

    state.chartGeometry = {
        estimate,
        width,
        padding,
        plotWidth,
        xMax,
        xToPx,
        yToPx
    };
    hideChartHover();
}

function renderPhChart(estimate) {
    if (!dom.phChart) return;
    const svg = dom.phChart;
    const width = 900;
    const height = 320;
    const padding = { top: 24, right: 26, bottom: 52, left: 74 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xMax = Math.max(estimate.incubationHours, 1);
    const xToPx = (value) => padding.left + (value / xMax) * plotWidth;
    const phValues = estimate.series.map((point) => point.modeledPh).filter(Number.isFinite);
    const yMin = Math.max(3.8, Math.floor((Math.min(...phValues, 4.2) - 0.2) * 5) / 5);
    const yMax = Math.min(6.8, Math.ceil((Math.max(...phValues, 6.6) + 0.1) * 5) / 5);
    const yToPx = (value) => padding.top + ((yMax - value) / Math.max(1e-9, yMax - yMin)) * plotHeight;
    const yTicks = [];

    for (let tick = Math.floor(yMin * 2) / 2; tick <= yMax + 1e-9; tick += 0.5) {
        yTicks.push(Number(tick.toFixed(1)));
    }

    const phPath = buildPath(estimate.series, (point) => xToPx(point.timeHr), (point) => yToPx(point.modeledPh));
    const targetY = yToPx(estimate.phReferenceTarget);

    svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
        ${yTicks.map((tick) => `
            <g>
                <line class="chart-grid-line" x1="${padding.left}" y1="${yToPx(tick)}" x2="${width - padding.right}" y2="${yToPx(tick)}"></line>
                <text class="chart-tick-label" x="${padding.left - 12}" y="${yToPx(tick) + 4}" text-anchor="end">${tick.toFixed(1)}</text>
            </g>
        `).join("")}
        ${Array.from({ length: 7 }, (_, index) => {
            const tick = (xMax * index) / 6;
            return `
                <g>
                    <line class="chart-grid-line" x1="${xToPx(tick)}" y1="${padding.top}" x2="${xToPx(tick)}" y2="${height - padding.bottom}"></line>
                    <text class="chart-tick-label" x="${xToPx(tick)}" y="${height - padding.bottom + 22}" text-anchor="middle">${tick.toFixed(1)}</text>
                </g>
            `;
        }).join("")}
        <line class="chart-axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
        <line class="chart-axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
        <line class="chart-threshold-line" x1="${padding.left}" y1="${targetY}" x2="${width - padding.right}" y2="${targetY}"></line>
        <text class="chart-threshold-label" x="${width - padding.right}" y="${targetY - 8}" text-anchor="end">pH 4.6 guide</text>
        <path class="chart-ph-line" d="${phPath}"></path>
        <text class="chart-axis-label" x="${padding.left + plotWidth / 2}" y="${height - 10}" text-anchor="middle">Incubation Time (hr)</text>
        <text class="chart-axis-label" transform="translate(20 ${padding.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">Modeled pH</text>
    `;
}

function renderSubstrateChart(estimate) {
    if (!dom.substrateChart) return;
    const svg = dom.substrateChart;
    const width = 900;
    const height = 320;
    const padding = { top: 24, right: 26, bottom: 52, left: 74 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xMax = Math.max(estimate.incubationHours, 1);
    const xToPx = (value) => padding.left + (value / xMax) * plotWidth;
    const yToPx = (value) => padding.top + ((100 - value) / 100) * plotHeight;

    const substratePath = buildPath(estimate.series, (point) => xToPx(point.timeHr), (point) => yToPx(point.substrateRemainingPct));
    const driverPath = buildPath(estimate.series, (point) => xToPx(point.timeHr), (point) => yToPx(point.driverMultiplier * 100));
    const yTicks = [0, 20, 40, 60, 80, 100];

    svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
        ${yTicks.map((tick) => `
            <g>
                <line class="chart-grid-line" x1="${padding.left}" y1="${yToPx(tick)}" x2="${width - padding.right}" y2="${yToPx(tick)}"></line>
                <text class="chart-tick-label" x="${padding.left - 12}" y="${yToPx(tick) + 4}" text-anchor="end">${tick}</text>
            </g>
        `).join("")}
        ${Array.from({ length: 7 }, (_, index) => {
            const tick = (xMax * index) / 6;
            return `
                <g>
                    <line class="chart-grid-line" x1="${xToPx(tick)}" y1="${padding.top}" x2="${xToPx(tick)}" y2="${height - padding.bottom}"></line>
                    <text class="chart-tick-label" x="${xToPx(tick)}" y="${height - padding.bottom + 22}" text-anchor="middle">${tick.toFixed(1)}</text>
                </g>
            `;
        }).join("")}
        <line class="chart-axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
        <line class="chart-axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
        <path class="chart-substrate-line" d="${substratePath}"></path>
        <path class="chart-driver-line" d="${driverPath}"></path>
        <text class="chart-axis-label" x="${padding.left + plotWidth / 2}" y="${height - 10}" text-anchor="middle">Incubation Time (hr)</text>
        <text class="chart-axis-label" transform="translate(20 ${padding.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">Percent / Multiplier (%)</text>
        <text class="chart-tick-label" x="${width - padding.right}" y="${padding.top + 6}" text-anchor="end">${escapeSvgText(estimate.substrateLabel)} mode</text>
    `;
}

function renderStorageChart(estimate) {
    if (!dom.storageChart) return;
    const svg = dom.storageChart;
    const series = Array.isArray(estimate.storageSeries) ? estimate.storageSeries : [];

    if (!series.length) {
        svg.innerHTML = `
            <rect x="0" y="0" width="900" height="320" fill="transparent"></rect>
            <text class="chart-axis-label" x="450" y="164" text-anchor="middle">No refrigerated storage applied for the displayed formulation.</text>
        `;
        return;
    }

    const width = 900;
    const height = 320;
    const padding = { top: 24, right: 26, bottom: 52, left: 74 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xMax = Math.max(estimate.storageDays, 1);
    const xToPx = (value) => padding.left + (value / xMax) * plotWidth;
    const values = [estimate.finalPh, ...series.map((point) => point.modeledPh)].filter(Number.isFinite);
    const yMin = Math.max(3.6, Math.floor((Math.min(...values) - 0.08) * 10) / 10);
    const yMax = Math.min(5.1, Math.ceil((Math.max(...values) + 0.08) * 10) / 10);
    const yToPx = (value) => padding.top + ((yMax - value) / Math.max(1e-9, yMax - yMin)) * plotHeight;
    const yTicks = [];
    for (let tick = Math.floor(yMin * 5) / 5; tick <= yMax + 1e-9; tick += 0.2) {
        yTicks.push(Number(tick.toFixed(1)));
    }
    const path = buildPath(series, (point) => xToPx(point.storageDay), (point) => yToPx(point.modeledPh));
    const lastPoint = series[series.length - 1];

    svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
        ${yTicks.map((tick) => `
            <g>
                <line class="chart-grid-line" x1="${padding.left}" y1="${yToPx(tick)}" x2="${width - padding.right}" y2="${yToPx(tick)}"></line>
                <text class="chart-tick-label" x="${padding.left - 12}" y="${yToPx(tick) + 4}" text-anchor="end">${tick.toFixed(1)}</text>
            </g>
        `).join("")}
        ${Array.from({ length: 6 }, (_, index) => {
            const tick = (xMax * index) / 5;
            return `
                <g>
                    <line class="chart-grid-line" x1="${xToPx(tick)}" y1="${padding.top}" x2="${xToPx(tick)}" y2="${height - padding.bottom}"></line>
                    <text class="chart-tick-label" x="${xToPx(tick)}" y="${height - padding.bottom + 22}" text-anchor="middle">${tick.toFixed(0)}</text>
                </g>
            `;
        }).join("")}
        <line class="chart-axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
        <line class="chart-axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
        <path class="chart-storage-line" d="${path}"></path>
        <circle class="chart-point" cx="${xToPx(0)}" cy="${yToPx(estimate.finalPh)}" r="4.5" fill="#60a5fa"></circle>
        <circle class="chart-point" cx="${xToPx(lastPoint.storageDay)}" cy="${yToPx(lastPoint.modeledPh)}" r="5" fill="#60a5fa"></circle>
        <text class="chart-axis-label" x="${padding.left + plotWidth / 2}" y="${height - 10}" text-anchor="middle">Refrigerated Storage (day)</text>
        <text class="chart-axis-label" transform="translate(20 ${padding.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">Modeled pH</text>
        <text class="chart-tick-label" x="${width - padding.right}" y="${padding.top + 6}" text-anchor="end">Storage starts from fermentation endpoint pH ${estimate.finalPh.toFixed(2)}</text>
    `;
}

function renderStorageCfuChart(estimate) {
    if (!dom.storageCfuChart) return;
    const svg = dom.storageCfuChart;
    const series = Array.isArray(estimate.storageSeries) ? estimate.storageSeries : [];

    if (!series.length) {
        svg.innerHTML = `
            <rect x="0" y="0" width="900" height="320" fill="transparent"></rect>
            <text class="chart-axis-label" x="450" y="164" text-anchor="middle">No refrigerated storage CFU retention applied for the displayed formulation.</text>
        `;
        return;
    }

    const width = 900;
    const height = 320;
    const padding = { top: 24, right: 26, bottom: 52, left: 74 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xMax = Math.max(estimate.storageDays, 1);
    const xToPx = (value) => padding.left + (value / xMax) * plotWidth;
    const values = series
        .flatMap((point) => [point.totalLog10, safeLog10(point.species.st), safeLog10(point.species.lb)])
        .filter((value) => Number.isFinite(value) && value > 0);
    const minValue = values.length ? Math.min(...values) : estimate.finalTotalLog10;
    const maxValue = values.length ? Math.max(...values) : estimate.finalTotalLog10;
    const yMin = Math.max(0, Math.floor(minValue - 0.35));
    const yMax = Math.max(yMin + 1.5, Math.ceil(maxValue + 0.25));
    const yToPx = (value) => padding.top + ((yMax - value) / Math.max(1e-9, yMax - yMin)) * plotHeight;
    const yTicks = [];
    for (let tick = Math.ceil(yMin); tick <= Math.floor(yMax); tick += 1) yTicks.push(tick);

    const totalPath = buildPath(series, (point) => xToPx(point.storageDay), (point) => yToPx(point.totalLog10));
    const stPath = buildPath(series, (point) => xToPx(point.storageDay), (point) => yToPx(safeLog10(point.species.st)));
    const lbPath = buildPath(series, (point) => xToPx(point.storageDay), (point) => yToPx(safeLog10(point.species.lb)));
    const lastPoint = series[series.length - 1];
    const finalRetention = lastPoint?.retention || {};
    const retentionLabel = [
        `St ${formatSigned(finalRetention.st?.deltaLog10 ?? 0, 2)} log10`,
        `Lb ${formatSigned(finalRetention.lb?.deltaLog10 ?? 0, 2)} log10`
    ].join("; ");

    svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
        ${yTicks.map((tick) => `
            <g>
                <line class="chart-grid-line" x1="${padding.left}" y1="${yToPx(tick)}" x2="${width - padding.right}" y2="${yToPx(tick)}"></line>
                <text class="chart-tick-label" x="${padding.left - 12}" y="${yToPx(tick) + 4}" text-anchor="end">${tick.toFixed(0)}</text>
            </g>
        `).join("")}
        ${Array.from({ length: 6 }, (_, index) => {
            const tick = (xMax * index) / 5;
            return `
                <g>
                    <line class="chart-grid-line" x1="${xToPx(tick)}" y1="${padding.top}" x2="${xToPx(tick)}" y2="${height - padding.bottom}"></line>
                    <text class="chart-tick-label" x="${xToPx(tick)}" y="${height - padding.bottom + 22}" text-anchor="middle">${tick.toFixed(0)}</text>
                </g>
            `;
        }).join("")}
        <line class="chart-axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
        <line class="chart-axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
        <path class="chart-total-line" d="${totalPath}"></path>
        <path class="chart-st-line" d="${stPath}"></path>
        <path class="chart-lb-line" d="${lbPath}"></path>
        <circle class="chart-point" cx="${xToPx(lastPoint.storageDay)}" cy="${yToPx(lastPoint.totalLog10)}" r="5" fill="var(--accent-primary)"></circle>
        <text class="chart-axis-label" x="${padding.left + plotWidth / 2}" y="${height - 10}" text-anchor="middle">Refrigerated Storage (day)</text>
        <text class="chart-axis-label" transform="translate(20 ${padding.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">log10 CFU/g</text>
        <text class="chart-tick-label" x="${width - padding.right}" y="${padding.top + 6}" text-anchor="end">${escapeSvgText(retentionLabel)}</text>
    `;
}

function handleChartHover(event) {
    if (!state.chartGeometry || !state.estimate) return;

    const { width, padding, plotWidth, xMax, estimate, xToPx, yToPx } = state.chartGeometry;
    const rect = dom.chart.getBoundingClientRect();
    if (rect.width <= 0) return;
    const mouseX = clamp(event.clientX - rect.left, 0, rect.width);
    const svgX = (mouseX / rect.width) * width;
    const relativeX = clamp(svgX, padding.left, padding.left + plotWidth);
    const xRatio = plotWidth <= 0 ? 0 : (relativeX - padding.left) / plotWidth;
    const unsnappedTime = xRatio * xMax;
    const snappedTime = Math.round(unsnappedTime * 4) / 4;
    const hoverPoint = nearestSeriesPoint(estimate.series, snappedTime);
    if (!hoverPoint) return;

    const hoverGroup = document.getElementById("chartHoverGroup");
    const hoverLine = document.getElementById("chartHoverLine");
    const hoverTotal = document.getElementById("chartHoverTotal");
    const hoverSt = document.getElementById("chartHoverSt");
    const hoverLb = document.getElementById("chartHoverLb");
    if (!hoverGroup || !hoverLine || !hoverTotal || !hoverSt || !hoverLb) return;

    const x = xToPx(hoverPoint.timeHr);
    hoverGroup.setAttribute("visibility", "visible");
    hoverLine.setAttribute("x1", x.toFixed(2));
    hoverLine.setAttribute("x2", x.toFixed(2));
    hoverTotal.setAttribute("cx", x.toFixed(2));
    hoverTotal.setAttribute("cy", yToPx(hoverPoint.totalLog10).toFixed(2));
    hoverSt.setAttribute("cx", x.toFixed(2));
    hoverSt.setAttribute("cy", yToPx(safeLog10(hoverPoint.species.st)).toFixed(2));
    hoverLb.setAttribute("cx", x.toFixed(2));
    hoverLb.setAttribute("cy", yToPx(safeLog10(hoverPoint.species.lb)).toFixed(2));

    dom.chartTooltip.classList.remove("hidden");
    dom.chartTooltip.innerHTML = `
        <span class="chart-tooltip-time">${formatTime(hoverPoint.timeHr)}</span>
        <div class="chart-tooltip-row"><span class="chart-tooltip-label">Modeled pH</span><strong>${hoverPoint.modeledPh.toFixed(2)}</strong></div>
        <div class="chart-tooltip-row"><span class="chart-tooltip-label">Total</span><strong>${formatCfu(hoverPoint.totalCfuPerG)}</strong></div>
        <div class="chart-tooltip-row"><span class="chart-tooltip-label">S. thermophilus</span><strong>${formatCfu(hoverPoint.species.st)}</strong></div>
        <div class="chart-tooltip-row"><span class="chart-tooltip-label">L. bulgaricus</span><strong>${formatCfu(hoverPoint.species.lb)}</strong></div>
    `;

    const shellRect = dom.chartShell.getBoundingClientRect();
    const tooltipRect = dom.chartTooltip.getBoundingClientRect();
    let tooltipLeft = event.clientX - shellRect.left + 12;
    let tooltipTop = event.clientY - shellRect.top + 12;
    if (tooltipLeft + tooltipRect.width > shellRect.width - 8) {
        tooltipLeft = Math.max(8, event.clientX - shellRect.left - tooltipRect.width - 12);
    }
    if (tooltipTop + tooltipRect.height > shellRect.height - 8) {
        tooltipTop = Math.max(8, event.clientY - shellRect.top - tooltipRect.height - 12);
    }
    dom.chartTooltip.style.left = `${tooltipLeft}px`;
    dom.chartTooltip.style.top = `${tooltipTop}px`;
}

function hideChartHover() {
    const hoverGroup = document.getElementById("chartHoverGroup");
    if (hoverGroup) {
        hoverGroup.setAttribute("visibility", "hidden");
    }
    dom.chartTooltip.classList.add("hidden");
}

function downloadCsv() {
    if (!state.estimate) {
        setStatus("No estimate available for CSV export.", "error");
        return;
    }
    const csv = buildCsv(state.estimate);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "yogurt-cfu-estimate.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus("CSV downloaded.", "success");
}

function readFormValues() {
    return Object.fromEntries(inputIds.map((id) => {
        const element = document.getElementById(id);
        return [id, element?.value ?? ""];
    }));
}

function applyFormValues(values) {
    Object.entries(values).forEach(([key, value]) => {
        const element = document.getElementById(key);
        if (!element) return;
        element.value = String(value);
    });
    syncAllTemperaturePairsFromC();
    updateAdvancedParameterTooltips();
}

function updateAdvancedParameterTooltips() {
    ADVANCED_PARAMETER_TOOLTIPS.forEach((item) => {
        const input = document.getElementById(item.id);
        if (!input) return;
        const normalizedValue = formatAdvancedTooltipValue(input.value);
        const title = `${item.label}: ${normalizedValue}${item.unit ? ` ${item.unit}` : ""}`;
        input.title = title;
        const container = input.closest(".input-line, .temperature-mini-field");
        if (container) container.title = title;
    });

    setTemperaturePairTooltip("stOptimumC", "stOptimumF", "S. thermophilus optimum temperature");
    setTemperaturePairTooltip("lbOptimumC", "lbOptimumF", "L. bulgaricus optimum temperature");
}

function setTemperaturePairTooltip(cId, fId, label) {
    const cInput = document.getElementById(cId);
    const fInput = document.getElementById(fId);
    if (!cInput || !fInput) return;

    const cValue = formatAdvancedTooltipValue(cInput.value);
    const fValue = formatAdvancedTooltipValue(fInput.value);
    const title = `${label}: ${cValue} °C / ${fValue} °F`;
    cInput.title = title;
    fInput.title = title;

    const cContainer = cInput.closest(".temperature-mini-field");
    const fContainer = fInput.closest(".temperature-mini-field");
    if (cContainer) cContainer.title = title;
    if (fContainer) fContainer.title = title;

    const pairContainer = cInput.closest(".temperature-pair-line");
    if (pairContainer) pairContainer.title = title;
}

function setStatus(message, type = "") {
    dom.statusLine.textContent = message;
    dom.statusLine.className = "status-line";
    if (type) dom.statusLine.classList.add(type);
}

function formatCfu(value) {
    if (!Number.isFinite(value) || value <= 0) return "0";
    const exponent = Math.floor(Math.log10(value));
    if (exponent >= 2 || exponent <= -2) {
        const mantissa = value / Math.pow(10, exponent);
        return `${mantissa.toFixed(2)}E${exponent}`;
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMass(valueG) {
    if (!Number.isFinite(valueG)) return "--";
    return valueG >= 1000 ? `${(valueG / 1000).toFixed(3)} kg` : `${valueG.toFixed(1)} g`;
}

function formatFixed(value, digits = 3) {
    if (!Number.isFinite(value)) return "--";
    return value.toFixed(digits);
}

function formatSigned(value, digits = 3) {
    if (!Number.isFinite(value)) return "--";
    return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatPercent(value, digits = 1) {
    if (!Number.isFinite(value)) return "--";
    return `${(value * 100).toFixed(digits)}%`;
}

function formatPercentFraction(value, digits = 1) {
    if (!Number.isFinite(value) || value < 0) return "--";
    return `${(value * 100).toFixed(digits)}%`;
}

function formatRange(low, high, digits = 1, unit = "") {
    if (!Number.isFinite(low) || !Number.isFinite(high)) return "--";
    const suffix = unit ? `${unit === "%" ? "" : " "}${unit}` : "";
    return `${low.toFixed(digits)}-${high.toFixed(digits)}${suffix}`;
}

function buildPath(series, xAccessor, yAccessor) {
    return series.map((point, index) => `${index === 0 ? "M" : "L"} ${xAccessor(point).toFixed(2)} ${yAccessor(point).toFixed(2)}`).join(" ");
}

function nearestSeriesPoint(series, targetTimeHr) {
    let best = null;
    let bestDistance = Infinity;
    series.forEach((point) => {
        const distance = Math.abs(point.timeHr - targetTimeHr);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = point;
        }
    });
    return best;
}

function safeLog10(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.log10(value);
}

function formatTime(valueHr) {
    const totalMinutes = Math.round(valueHr * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours} hr ${String(minutes).padStart(2, "0")} min`;
}

function formatStorageDay(valueDay) {
    if (!Number.isFinite(valueDay)) return "--";
    if (Number.isInteger(valueDay)) return `${valueDay} day${valueDay === 1 ? "" : "s"}`;
    return `${valueDay.toFixed(1)} days`;
}

function formatStarterToMilkRatio(starterG, milkG) {
    if (!Number.isFinite(starterG) || !Number.isFinite(milkG) || starterG <= 0 || milkG <= 0) return "--";
    const milkPerStarter = milkG / starterG;
    if (milkPerStarter >= 1) return `1:${milkPerStarter.toFixed(1)}`;
    return `${(starterG / milkG).toFixed(2)}:1`;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function syncAllTemperaturePairsFromC() {
    temperaturePairs.forEach(({ cId }) => {
        const cInput = document.getElementById(cId);
        if (cInput) syncTemperaturePairFromField(cInput);
    });
}

function syncTemperaturePairFromField(target) {
    if (!target?.id) return;
    const pair = temperaturePairs.find(({ cId, fId }) => target.id === cId || target.id === fId);
    if (!pair) return;

    const cInput = document.getElementById(pair.cId);
    const fInput = document.getElementById(pair.fId);
    if (!cInput || !fInput) return;

    const rawValue = Number(target.value);
    if (target.value === "") {
        if (target.id === pair.cId) fInput.value = "";
        else cInput.value = "";
        return;
    }
    if (!Number.isFinite(rawValue)) return;

    if (target.id === pair.cId) {
        fInput.value = formatTemperatureInput(celsiusToFahrenheit(rawValue));
    } else {
        cInput.value = formatTemperatureInput(fahrenheitToCelsius(rawValue));
    }
}

function celsiusToFahrenheit(valueC) {
    return (valueC * 9) / 5 + 32;
}

function fahrenheitToCelsius(valueF) {
    return ((valueF - 32) * 5) / 9;
}

function formatTemperatureInput(value) {
    return Number.isFinite(value) ? String(Number(value.toFixed(1))) : "";
}

function formatAdvancedTooltipValue(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? String(numericValue) : String(value || "--");
}

function toScientificLiteral(value) {
    if (!Number.isFinite(value) || value === 0) return "0";
    const exponent = Math.floor(Math.log10(Math.abs(value)));
    const mantissa = value / Math.pow(10, exponent);
    return `${mantissa.toFixed(2).replace(/\.00$/, "")}E${exponent}`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
}

function escapeSvgText(value) {
    return escapeHtml(value);
}
