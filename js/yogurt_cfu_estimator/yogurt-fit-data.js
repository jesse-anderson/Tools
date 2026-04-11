const GE_REFERENCE_INITIAL_PH = 6.55;

const LINARES_ST_COCULTURE_POINTS = [
    { timeHr: 0, ph: 6.5625 },
    { timeHr: 2.031603, ph: 6.366307 },
    { timeHr: 2.995486, ph: 6.089329 },
    { timeHr: 3.990971, ph: 5.380096 },
    { timeHr: 5.018059, ph: 4.960432 },
    { timeHr: 5.966141, ph: 4.64988 },
    { timeHr: 6.945825, ph: 4.498801 },
    { timeHr: 7.988715, ph: 4.406475 },
    { timeHr: 8.9842, ph: 4.322542 },
    { timeHr: 24, ph: 3.999369 },
    { timeHr: 48, ph: 3.804924 },
    { timeHr: 72, ph: 3.738636 },
    { timeHr: 96, ph: 3.743056 }
];

const LINARES_CH1_COCULTURE_POINTS = [
    { timeHr: 0, ph: 6.5625 },
    { timeHr: 1.984197, ph: 6.232014 },
    { timeHr: 3.027086, ph: 5.724221 },
    { timeHr: 3.97517, ph: 5.111511 },
    { timeHr: 4.954854, ph: 4.683453 },
    { timeHr: 5.966141, ph: 4.523981 },
    { timeHr: 7.009031, ph: 4.377098 },
    { timeHr: 7.95711, ph: 4.326739 },
    { timeHr: 8.968398, ph: 4.247002 },
    { timeHr: 24, ph: 3.955177 },
    { timeHr: 48, ph: 3.756313 },
    { timeHr: 72, ph: 3.690025 },
    { timeHr: 96, ph: 3.690025 }
];

const GE_19_TO_1_ST_PLUS_LB_POINTS = [
    { timeHr: 0.023781, ph: 6.554093 },
    { timeHr: 1.997622, ph: 6.229213 },
    { timeHr: 4.030916, ph: 5.201605 },
    { timeHr: 6.004757, ph: 4.791974 },
    { timeHr: 6.599287, ph: 4.597753 }
];

const DAN_PH_CURVES = {
    "1:1": [
        { timeHr: 0, ph: 6.516699 },
        { timeHr: 2, ph: 6.481336 },
        { timeHr: 4, ph: 5.320236 },
        { timeHr: 6, ph: 4.548134 },
        { timeHr: 8, ph: 4.459725 }
    ],
    "10:1": [
        { timeHr: 0, ph: 6.646365 },
        { timeHr: 2, ph: 6.534381 },
        { timeHr: 4, ph: 5.579568 },
        { timeHr: 6, ph: 5.037328 },
        { timeHr: 8, ph: 4.54224 }
    ],
    "100:1": [
        { timeHr: 0, ph: 6.664047 },
        { timeHr: 2, ph: 6.634578 },
        { timeHr: 4, ph: 5.59725 },
        { timeHr: 6, ph: 4.996071 },
        { timeHr: 8, ph: 4.51277 }
    ],
    "1000:1": [
        { timeHr: 0, ph: 6.658153 },
        { timeHr: 2, ph: 6.522593 },
        { timeHr: 4, ph: 5.444008 },
        { timeHr: 6, ph: 4.972495 },
        { timeHr: 8, ph: 4.500982 }
    ],
    "2000:1": [
        { timeHr: 0, ph: 6.640472 },
        { timeHr: 2, ph: 6.640472 },
        { timeHr: 4, ph: 6.587426 },
        { timeHr: 6, ph: 5.473477 },
        { timeHr: 8, ph: 4.61886 }
    ]
};

const POPOVIC_FITTED_1_TO_2 = {
    label: "1:2 St:Lb",
    ratioStToLb: 0.5,
    ratioLog: Math.log10(0.5),
    source: "Popovic et al. 2020",
    sourceKind: "digitized_curve_fit",
    sourceInitialPh: 6.371429,
    terminalPh42C: 4.453061,
    amplitude42C: 1.918368,
    maxAcidificationRate42C: 0.99,
    lagHr42C: 3.17,
    fitRmse: 0.116823
};

const LINARES_BLENDED_1_TO_1 = {
    label: "1:1 St:Lb",
    ratioStToLb: 1,
    ratioLog: 0,
    source: "Linares et al. 2016",
    sourceKind: "digitized_curve_fit",
    sourceInitialPh: 6.5625,
    terminalPh42C: 4.272272,
    amplitude42C: 2.290228,
    maxAcidificationRate42C: 0.605,
    lagHr42C: 1.83,
    fitRmse: 0.034942
};

const GE_PRIMARY_MODEL_ANCHORS_42C = [
    { ratioStToLb: 2, amplitude42C: 2.36778, muPerMinute: 0.00913, lambdaMinutes: 61.68377, r2: 0.99318 },
    { ratioStToLb: 10, amplitude42C: 2.1661, muPerMinute: 0.00873, lambdaMinutes: 46.17574, r2: 0.99471 },
    { ratioStToLb: 19, amplitude42C: 2.02954, muPerMinute: 0.00847, lambdaMinutes: 43.41928, r2: 0.99689 },
    { ratioStToLb: 50, amplitude42C: 1.96836, muPerMinute: 0.00819, lambdaMinutes: 41.5656, r2: 0.99711 },
    { ratioStToLb: 100, amplitude42C: 1.9146, muPerMinute: 0.00793, lambdaMinutes: 37.64602, r2: 0.99517 }
].map((anchor) => ({
    label: `${anchor.ratioStToLb}:1 St:Lb`,
    ratioStToLb: anchor.ratioStToLb,
    ratioLog: Math.log10(anchor.ratioStToLb),
    source: "Ge et al. 2024",
    sourceKind: "published_primary_model",
    sourceInitialPh: GE_REFERENCE_INITIAL_PH,
    amplitude42C: anchor.amplitude42C,
    terminalPh42C: GE_REFERENCE_INITIAL_PH - anchor.amplitude42C,
    maxAcidificationRate42C: anchor.muPerMinute * 60,
    lagHr42C: anchor.lambdaMinutes / 60,
    r2: anchor.r2
}));

export const INCUBATION_BACKBONE_ANCHORS_42C = [
    POPOVIC_FITTED_1_TO_2,
    LINARES_BLENDED_1_TO_1,
    ...GE_PRIMARY_MODEL_ANCHORS_42C
].sort((left, right) => left.ratioLog - right.ratioLog);

export const STORAGE_RETENTION_COEFFICIENTS = Object.freeze({
    acidSeverity: Object.freeze({
        centerPh: 4.52,
        spanPh: 0.52
    }),
    postAcidificationSeverity: Object.freeze({
        spanPh: 0.62
    }),
    lbHeavySeverity: Object.freeze({
        centerRatioLog: 0.1,
        spanRatioLog: 0.7
    }),
    stHeavyProtection: Object.freeze({
        startRatioLog: 0.3,
        spanRatioLog: 1.2
    }),
    severityWeights: Object.freeze({
        acid: 0.56,
        postAcidification: 0.32,
        stHeavyProtection: -0.10
    }),
    speciesWeights: Object.freeze({
        st: Object.freeze({
            acid: 0.72,
            ratio: -0.07
        }),
        lb: Object.freeze({
            acid: 1.1,
            ratio: 0.14
        })
    }),
    profileBlend: Object.freeze({
        mildToTypicalMax: 0.55
    })
});

export const TEXTURE_PROXY_COEFFICIENTS = Object.freeze({
    acidSet: Object.freeze({
        centerPh: 5.05,
        spanPh: 0.55,
        weight: 0.68
    }),
    gelMaturation: Object.freeze({
        spanHr: 2.5,
        weight: 0.16
    }),
    storageMaturation: Object.freeze({
        spanDays: 14,
        weight: 0.07
    }),
    overAcidification: Object.freeze({
        centerPh: 4.15,
        spanPh: 0.35,
        weight: -0.12
    }),
    solidsBoost: Object.freeze({
        massFractionSpan: 0.08,
        weight: 0.06,
        firmnessScaleWeight: 0.16,
        lowWheyWeight: -0.45,
        highWheyWeight: -0.65
    }),
    balanceFactor: Object.freeze({
        weight: 0.05
    }),
    stHeavyPenalty: Object.freeze({
        startRatioLog: 1.2,
        spanRatioLog: 1.0,
        weight: 0.08
    }),
    setScale: Object.freeze({
        divisor: 78,
        min: 0.08,
        max: 1.22
    }),
    likelyBlendFraction: 0.55,
    underSetPenalty: Object.freeze({
        centerScore: 62
    }),
    wheySeparation: Object.freeze({
        lowUnderSetWeight: 1.9,
        highUnderSetWeight: 2.7,
        lowOverAcidWeight: 0.8,
        highOverAcidWeight: 1.1,
        maxPercent: 12
    }),
    classThresholds: Object.freeze({
        weakMax: 35,
        softMax: 55,
        setMax: 75,
        firmButAcidicPh: 4.10
    }),
    syneresisRiskThresholds: Object.freeze({
        lowMax: 2.5,
        moderateMax: 4.5
    })
});

export const INCUBATION_VALIDATION_DATASETS = [
    {
        id: "linares-st-coculture",
        label: "Linares 2016 ST coculture trace",
        source: "Linares et al. 2016",
        ratioStToLb: 1,
        role: "holdout_validation",
        points: LINARES_ST_COCULTURE_POINTS
    },
    {
        id: "linares-ch1-coculture",
        label: "Linares 2016 CH1 coculture trace",
        source: "Linares et al. 2016",
        ratioStToLb: 1,
        role: "holdout_validation",
        points: LINARES_CH1_COCULTURE_POINTS
    },
    {
        id: "ge-19to1-st-plus-lb",
        label: "Ge 2024 19:1 coculture trace",
        source: "Ge et al. 2024",
        ratioStToLb: 19,
        role: "near-anchor_validation",
        points: GE_19_TO_1_ST_PLUS_LB_POINTS
    },
    {
        id: "dan-a1",
        label: "Dan 2023 A1 pH curve",
        source: "Dan et al. 2023",
        ratioStToLb: 1,
        role: "external_validation",
        points: DAN_PH_CURVES["1:1"]
    },
    {
        id: "dan-a2",
        label: "Dan 2023 A2 pH curve",
        source: "Dan et al. 2023",
        ratioStToLb: 10,
        role: "external_validation",
        points: DAN_PH_CURVES["10:1"]
    },
    {
        id: "dan-a3",
        label: "Dan 2023 A3 pH curve",
        source: "Dan et al. 2023",
        ratioStToLb: 100,
        role: "external_validation",
        points: DAN_PH_CURVES["100:1"]
    },
    {
        id: "dan-a4",
        label: "Dan 2023 A4 pH curve",
        source: "Dan et al. 2023",
        ratioStToLb: 1000,
        role: "extrapolation_validation",
        points: DAN_PH_CURVES["1000:1"]
    },
    {
        id: "dan-a5",
        label: "Dan 2023 A5 pH curve",
        source: "Dan et al. 2023",
        ratioStToLb: 2000,
        role: "extrapolation_validation",
        points: DAN_PH_CURVES["2000:1"]
    }
];

export const STORAGE_DATASETS = [
    {
        id: "popovic-storage-mixed-1to2",
        label: "Popovic 2020 mixed 1:2 storage pH",
        source: "Popovic et al. 2020",
        ratioStToLb: 0.5,
        points: [
            { stage: "FT", storageDay: 0, ph: 4.689796 },
            { stage: "S1d", storageDay: 1, ph: 4.560669 },
            { stage: "S7d", storageDay: 7, ph: 4.502092 },
            { stage: "S14d", storageDay: 14, ph: 4.179916 },
            { stage: "S21d", storageDay: 21, ph: 4.133891 },
            { stage: "S28d", storageDay: 28, ph: 4.050209 }
        ]
    },
    {
        id: "ge-storage-1to1",
        label: "Ge 2024 1:1 storage pH",
        source: "Ge et al. 2024",
        ratioStToLb: 1,
        points: [
            { stage: "FT", storageDay: 0, ph: 4.602403 },
            { stage: "S10d", storageDay: 10, ph: 4.139556 },
            { stage: "S20d", storageDay: 20, ph: 4.019778 },
            { stage: "S30d", storageDay: 30, ph: 3.948799 },
            { stage: "S40d", storageDay: 40, ph: 3.917745 },
            { stage: "S50d", storageDay: 50, ph: 3.916266 }
        ]
    },
    {
        id: "ge-storage-2to1",
        label: "Ge 2024 2:1 storage pH",
        source: "Ge et al. 2024",
        ratioStToLb: 2,
        points: [
            { stage: "FT", storageDay: 0, ph: 4.599445 },
            { stage: "S10d", storageDay: 10, ph: 4.203142 },
            { stage: "S20d", storageDay: 20, ph: 4.120333 },
            { stage: "S30d", storageDay: 30, ph: 4.049353 },
            { stage: "S40d", storageDay: 40, ph: 4.031608 },
            { stage: "S50d", storageDay: 50, ph: 4.018299 }
        ]
    },
    {
        id: "ge-storage-10to1",
        label: "Ge 2024 10:1 storage pH",
        source: "Ge et al. 2024",
        ratioStToLb: 10,
        points: [
            { stage: "FT", storageDay: 0, ph: 4.597967 },
            { stage: "S10d", storageDay: 10, ph: 4.333272 },
            { stage: "S20d", storageDay: 20, ph: 4.300739 },
            { stage: "S30d", storageDay: 30, ph: 4.250462 },
            { stage: "S40d", storageDay: 40, ph: 4.212015 },
            { stage: "S50d", storageDay: 50, ph: 4.198706 }
        ]
    },
    {
        id: "ge-storage-19to1",
        label: "Ge 2024 19:1 storage pH",
        source: "Ge et al. 2024",
        ratioStToLb: 19,
        points: [
            { stage: "FT", storageDay: 0, ph: 4.595009 },
            { stage: "S10d", storageDay: 10, ph: 4.420518 },
            { stage: "S20d", storageDay: 20, ph: 4.361368 },
            { stage: "S30d", storageDay: 30, ph: 4.330314 },
            { stage: "S40d", storageDay: 40, ph: 4.319963 },
            { stage: "S50d", storageDay: 50, ph: 4.319963 }
        ]
    },
    {
        id: "ge-storage-50to1",
        label: "Ge 2024 50:1 storage pH",
        source: "Ge et al. 2024",
        ratioStToLb: 50,
        points: [
            { stage: "FT", storageDay: 0, ph: 4.595009 },
            { stage: "S10d", storageDay: 10, ph: 4.498891 },
            { stage: "S20d", storageDay: 20, ph: 4.430869 },
            { stage: "S30d", storageDay: 30, ph: 4.411645 },
            { stage: "S40d", storageDay: 40, ph: 4.408688 },
            { stage: "S50d", storageDay: 50, ph: 4.408688 }
        ]
    },
    {
        id: "ge-storage-100to1",
        label: "Ge 2024 100:1 storage pH",
        source: "Ge et al. 2024",
        ratioStToLb: 100,
        points: [
            { stage: "FT", storageDay: 0, ph: 4.592052 },
            { stage: "S10d", storageDay: 10, ph: 4.529945 },
            { stage: "S20d", storageDay: 20, ph: 4.501848 },
            { stage: "S30d", storageDay: 30, ph: 4.492976 },
            { stage: "S40d", storageDay: 40, ph: 4.460444 },
            { stage: "S50d", storageDay: 50, ph: 4.460444 }
        ]
    }
].map((dataset) => ({
    ...dataset,
    ratioLog: Math.log10(dataset.ratioStToLb),
    deltaPoints: dataset.points.map((point) => ({
        storageDay: point.storageDay,
        deltaPh: point.ph - dataset.points[0].ph
    }))
}));

export const STORAGE_CFU_PROFILE_SUMMARY = {
    modelName: "Empirical refrigerated CFU retention",
    storageTemperatureC: 4,
    sources: [
        "Hamann and Marth 1984 absolute storage CFU curves at 5 C and 10 C",
        "Anbukkarasi et al. 2014 Table 3 short-storage log10 CFU/ml values at 4 C",
        "Ramchandran and Shah 2009 Table 2 relative EPS survival evidence"
    ],
    note: "Retention curves are bounded empirical envelopes. They preserve Hamann/Anbukkarasi magnitudes without treating any one product-specific curve as universal."
};

const STORAGE_CFU_REFERENCE_PROFILES = {
    mild: {
        key: "mild",
        label: "Hamann stable-product envelope",
        source: "Hamann and Marth 1984 Figures 1, 2, and 4 stable total-count/S. thermophilus behavior",
        species: {
            st: [
                { storageDay: 0, deltaLog10: 0 },
                { storageDay: 7, deltaLog10: 0.03 },
                { storageDay: 14, deltaLog10: 0.04 },
                { storageDay: 28, deltaLog10: 0.02 },
                { storageDay: 50, deltaLog10: -0.12 }
            ],
            lb: [
                { storageDay: 0, deltaLog10: 0 },
                { storageDay: 7, deltaLog10: 0.02 },
                { storageDay: 14, deltaLog10: -0.05 },
                { storageDay: 28, deltaLog10: -0.20 },
                { storageDay: 50, deltaLog10: -0.55 }
            ]
        }
    },
    typical: {
        key: "typical",
        label: "Mixed literature central envelope",
        source: "Hamann and Marth 1984 plus Anbukkarasi et al. 2014 central short-storage decline",
        species: {
            st: [
                { storageDay: 0, deltaLog10: 0 },
                { storageDay: 7, deltaLog10: -0.05 },
                { storageDay: 14, deltaLog10: -0.32 },
                { storageDay: 28, deltaLog10: -0.55 },
                { storageDay: 50, deltaLog10: -0.90 }
            ],
            lb: [
                { storageDay: 0, deltaLog10: 0 },
                { storageDay: 7, deltaLog10: -0.28 },
                { storageDay: 14, deltaLog10: -1.05 },
                { storageDay: 28, deltaLog10: -1.75 },
                { storageDay: 50, deltaLog10: -2.60 }
            ]
        }
    },
    severe: {
        key: "severe",
        label: "Fragile/acid-stressed envelope",
        source: "Hamann and Marth 1984 stirred/lab decline plus Anbukkarasi high-loss combinations",
        species: {
            st: [
                { storageDay: 0, deltaLog10: 0 },
                { storageDay: 7, deltaLog10: -0.18 },
                { storageDay: 14, deltaLog10: -0.85 },
                { storageDay: 28, deltaLog10: -1.55 },
                { storageDay: 50, deltaLog10: -2.80 }
            ],
            lb: [
                { storageDay: 0, deltaLog10: 0 },
                { storageDay: 7, deltaLog10: -0.60 },
                { storageDay: 14, deltaLog10: -1.85 },
                { storageDay: 28, deltaLog10: -3.20 },
                { storageDay: 50, deltaLog10: -4.60 }
            ]
        }
    }
};

const STORAGE_CFU_ENVELOPE_RESIDUAL_SUMMARY = {
    label: "Published storage CFU envelope residual summary",
    generatedFrom: [
        "data/yogurt_cfu_estimator/refrigerated_CFU_decay/Haman_Marth_1984/clean/figure1_uw_strawberry_hand_coerced/hamann_marth_1984_all_series_log_corrected_hand_coerced.csv",
        "data/yogurt_cfu_estimator/refrigerated_CFU_decay/Haman_Marth_1984/clean/figure2_custard_style/hamann_marth_1984_fig2_custard_style_counts_clean.csv",
        "data/yogurt_cfu_estimator/refrigerated_CFU_decay/Haman_Marth_1984/clean/figure3_stirred_raspberry/hamann_marth_1984_fig3_stirred_raspberry_counts_clean.csv",
        "data/yogurt_cfu_estimator/refrigerated_CFU_decay/Haman_Marth_1984/clean/figure4_lab_whole_milk_37c/hamann_marth_1984_fig4_lab_whole_milk_37c_counts_clean.csv",
        "data/yogurt_cfu_estimator/refrigerated_CFU_decay/Anbukkarasi_2014/clean/anbukkarasi_2014_table3_storage_clean.csv"
    ],
    method: "For each clean storage series, log10 CFU change was computed relative to that series' first captured point. Baseline points were excluded. Each observed delta was compared with the nearest mild/typical/severe empirical envelope value for the same species and storage day.",
    pointCount: 110,
    rmseLog10: 0.403,
    maeLog10: 0.247,
    maxAbsoluteErrorLog10: 1.680,
    inEnvelopeCount: 56,
    inEnvelopePercent: 50.9,
    sourceStats: [
        { source: "Hamann and Marth 1984 Figure 1", pointCount: 26, rmseLog10: 0.193, maeLog10: 0.142, inEnvelopeCount: 13 },
        { source: "Hamann and Marth 1984 Figure 2", pointCount: 20, rmseLog10: 0.336, maeLog10: 0.207, inEnvelopeCount: 9 },
        { source: "Hamann and Marth 1984 Figure 3", pointCount: 22, rmseLog10: 0.358, maeLog10: 0.236, inEnvelopeCount: 20 },
        { source: "Hamann and Marth 1984 Figure 4", pointCount: 18, rmseLog10: 0.264, maeLog10: 0.174, inEnvelopeCount: 9 },
        { source: "Anbukkarasi et al. 2014 Table 3", pointCount: 24, rmseLog10: 0.663, maeLog10: 0.461, inEnvelopeCount: 5 }
    ],
    note: "This is an envelope residual, not a strain-specific fitted survival model. Higher Anbukkarasi residuals reflect strain-to-strain spread and 4-hour endpoints that are faster-acidifying than the default incubation fixture."
};

const RAMCHANDRAN_TEXTURE_REFERENCE = {
    storageTemperatureC: 4,
    sources: [
        "Ramchandran and Shah 2009 Figure 2 firmness",
        "Ramchandran and Shah 2009 Figure 3 spontaneous whey separation",
        "Ramchandran and Shah 2009 Table 4 Herschel-Bulkley yield stress"
    ],
    products: {
        EY: {
            label: "EPS-producing S. thermophilus low-fat yogurt",
            firmnessG: [
                { storageDay: 1, value: 60.882350 },
                { storageDay: 7, value: 67.764709 },
                { storageDay: 14, value: 72.529414 },
                { storageDay: 21, value: 71.470586 },
                { storageDay: 28, value: 72.264712 }
            ],
            wheySeparationPct: [
                { storageDay: 1, value: 2.297753 },
                { storageDay: 7, value: 1.589888 },
                { storageDay: 14, value: 1.786517 },
                { storageDay: 21, value: 1.953651 },
                { storageDay: 28, value: 1.924157 }
            ],
            yieldStressPa: [
                { storageDay: 1, value: 3.80 },
                { storageDay: 7, value: 5.56 },
                { storageDay: 14, value: 5.17 },
                { storageDay: 21, value: 7.69 },
                { storageDay: 28, value: 11.23 }
            ]
        },
        NEY: {
            label: "Non-EPS-producing S. thermophilus low-fat yogurt",
            firmnessG: [
                { storageDay: 1, value: 67.235296 },
                { storageDay: 7, value: 76.235301 },
                { storageDay: 14, value: 77.823532 },
                { storageDay: 21, value: 81.794121 },
                { storageDay: 28, value: 82.323535 }
            ],
            wheySeparationPct: [
                { storageDay: 1, value: 3.910112 },
                { storageDay: 7, value: 2.681180 },
                { storageDay: 14, value: 3.182584 },
                { storageDay: 21, value: 2.769663 },
                { storageDay: 28, value: 3.949438 }
            ],
            yieldStressPa: [
                { storageDay: 1, value: 8.31 },
                { storageDay: 7, value: 9.61 },
                { storageDay: 14, value: 12.75 },
                { storageDay: 21, value: 21.95 },
                { storageDay: 28, value: 23.99 }
            ]
        }
    }
};

const INCUBATION_RESIDUAL_SUMMARY = buildIncubationResidualSummary();

export function interpolateIncubationBackbone(ratioStToLb) {
    const safeRatio = Number.isFinite(ratioStToLb) && ratioStToLb > 0
        ? ratioStToLb
        : 1;
    const ratioLog = Math.log10(safeRatio);
    const anchors = INCUBATION_BACKBONE_ANCHORS_42C;
    const lowerEdge = anchors[0];
    const upperEdge = anchors[anchors.length - 1];

    if (ratioLog <= lowerEdge.ratioLog) {
        return buildBackboneResult(lowerEdge, lowerEdge, 0, safeRatio, ratioLog, true, false);
    }
    if (ratioLog >= upperEdge.ratioLog) {
        return buildBackboneResult(upperEdge, upperEdge, 0, safeRatio, ratioLog, false, true);
    }

    for (let index = 1; index < anchors.length; index += 1) {
        const lower = anchors[index - 1];
        const upper = anchors[index];
        if (ratioLog > upper.ratioLog) continue;
        const span = Math.max(1e-9, upper.ratioLog - lower.ratioLog);
        const fraction = clamp01((ratioLog - lower.ratioLog) / span);
        return buildBackboneResult(lower, upper, fraction, safeRatio, ratioLog, false, false);
    }

    return buildBackboneResult(lowerEdge, lowerEdge, 0, safeRatio, ratioLog, true, false);
}

export function getIncubationResidualSummary() {
    return INCUBATION_RESIDUAL_SUMMARY;
}

export function getIncubationBackboneAnchors() {
    return INCUBATION_BACKBONE_ANCHORS_42C.map((anchor) => ({ ...anchor }));
}

export function getStorageCfuEnvelopeResidualSummary() {
    return {
        ...STORAGE_CFU_ENVELOPE_RESIDUAL_SUMMARY,
        generatedFrom: [...STORAGE_CFU_ENVELOPE_RESIDUAL_SUMMARY.generatedFrom],
        sourceStats: STORAGE_CFU_ENVELOPE_RESIDUAL_SUMMARY.sourceStats.map((item) => ({ ...item }))
    };
}

export function evaluateStorageBackboneDelta(ratioStToLb, storageDay) {
    const safeRatio = Number.isFinite(ratioStToLb) && ratioStToLb > 0 ? ratioStToLb : 1;
    const safeDay = clamp(Number.isFinite(storageDay) ? storageDay : 0, 0, 50);
    const ratioLog = Math.log10(safeRatio);
    const anchors = STORAGE_DATASETS;
    const lowerEdge = anchors[0];
    const upperEdge = anchors[anchors.length - 1];

    if (ratioLog <= lowerEdge.ratioLog) {
        const deltaPh = evaluateStorageDeltaForDataset(lowerEdge, safeDay);
        return {
            ratioStToLb: safeRatio,
            ratioLog,
            storageDay: safeDay,
            lowerAnchor: lowerEdge,
            upperAnchor: lowerEdge,
            fraction: 0,
            isClampedLow: true,
            isClampedHigh: false,
            deltaPh,
            referencePh: evaluateStoragePhForDataset(lowerEdge, safeDay),
            referenceInitialPh: lowerEdge.points[0]?.ph ?? null
        };
    }
    if (ratioLog >= upperEdge.ratioLog) {
        const deltaPh = evaluateStorageDeltaForDataset(upperEdge, safeDay);
        return {
            ratioStToLb: safeRatio,
            ratioLog,
            storageDay: safeDay,
            lowerAnchor: upperEdge,
            upperAnchor: upperEdge,
            fraction: 0,
            isClampedLow: false,
            isClampedHigh: true,
            deltaPh,
            referencePh: evaluateStoragePhForDataset(upperEdge, safeDay),
            referenceInitialPh: upperEdge.points[0]?.ph ?? null
        };
    }

    for (let index = 1; index < anchors.length; index += 1) {
        const lower = anchors[index - 1];
        const upper = anchors[index];
        if (ratioLog > upper.ratioLog) continue;
        const span = Math.max(1e-9, upper.ratioLog - lower.ratioLog);
        const fraction = clamp01((ratioLog - lower.ratioLog) / span);
        const lowerDelta = evaluateStorageDeltaForDataset(lower, safeDay);
        const upperDelta = evaluateStorageDeltaForDataset(upper, safeDay);
        const lowerPh = evaluateStoragePhForDataset(lower, safeDay);
        const upperPh = evaluateStoragePhForDataset(upper, safeDay);
        const lowerInitialPh = lower.points[0]?.ph ?? lowerPh;
        const upperInitialPh = upper.points[0]?.ph ?? upperPh;
        return {
            ratioStToLb: safeRatio,
            ratioLog,
            storageDay: safeDay,
            lowerAnchor: lower,
            upperAnchor: upper,
            fraction,
            isClampedLow: false,
            isClampedHigh: false,
            deltaPh: lerp(lowerDelta, upperDelta, fraction),
            referencePh: lerp(lowerPh, upperPh, fraction),
            referenceInitialPh: lerp(lowerInitialPh, upperInitialPh, fraction)
        };
    }

    return {
        ratioStToLb: safeRatio,
        ratioLog,
        storageDay: safeDay,
        lowerAnchor: lowerEdge,
        upperAnchor: lowerEdge,
        fraction: 0,
        isClampedLow: true,
        isClampedHigh: false,
        deltaPh: evaluateStorageDeltaForDataset(lowerEdge, safeDay),
        referencePh: evaluateStoragePhForDataset(lowerEdge, safeDay),
        referenceInitialPh: lowerEdge.points[0]?.ph ?? null
    };
}

export function buildStorageBackboneSeries(ratioStToLb, maxStorageDay) {
    const safeMaxDay = clamp(Number.isFinite(maxStorageDay) ? maxStorageDay : 0, 0, 50);
    const points = [{ storageDay: 0 }];
    for (let day = 1; day <= Math.floor(safeMaxDay); day += 1) {
        points.push({ storageDay: day });
    }
    if (safeMaxDay > Math.floor(safeMaxDay)) {
        points.push({ storageDay: safeMaxDay });
    }
    if (points[points.length - 1].storageDay !== safeMaxDay) {
        points.push({ storageDay: safeMaxDay });
    }
    return points.map((point) => {
        const evaluated = evaluateStorageBackboneDelta(ratioStToLb, point.storageDay);
        return {
            storageDay: point.storageDay,
            deltaPh: evaluated.deltaPh,
            referencePh: evaluated.referencePh,
            referenceInitialPh: evaluated.referenceInitialPh
        };
    });
}

export function evaluateStorageCfuRetention(speciesKey, storageDay, context = {}) {
    const coefficients = STORAGE_RETENTION_COEFFICIENTS;
    const safeSpecies = speciesKey === "lb" ? "lb" : "st";
    const safeDay = clamp(Number.isFinite(storageDay) ? storageDay : 0, 0, 50);
    const finalPh = Number.isFinite(context.modeledPh)
        ? context.modeledPh
        : Number.isFinite(context.finalPh)
            ? context.finalPh
            : 4.45;
    const deltaPh = Number.isFinite(context.deltaPh) ? context.deltaPh : 0;
    const ratioStToLb = Number.isFinite(context.ratioStToLb) && context.ratioStToLb > 0
        ? context.ratioStToLb
        : 1;
    const ratioLog = Math.log10(ratioStToLb);
    const speciesWeights = coefficients.speciesWeights[safeSpecies];

    const acidSeverity = clamp01((coefficients.acidSeverity.centerPh - finalPh) / coefficients.acidSeverity.spanPh);
    const postAcidificationSeverity = clamp01(Math.max(0, -deltaPh) / coefficients.postAcidificationSeverity.spanPh);
    const lbHeavySeverity = clamp01((coefficients.lbHeavySeverity.centerRatioLog - ratioLog) / coefficients.lbHeavySeverity.spanRatioLog);
    const stHeavyProtection = clamp01((ratioLog - coefficients.stHeavyProtection.startRatioLog) / coefficients.stHeavyProtection.spanRatioLog);
    const rawSeverity = (
        coefficients.severityWeights.acid * acidSeverity * speciesWeights.acid
        + coefficients.severityWeights.postAcidification * postAcidificationSeverity
        + speciesWeights.ratio * lbHeavySeverity
        + coefficients.severityWeights.stHeavyProtection * stHeavyProtection
    );
    const severity = clamp01(rawSeverity);

    const mildDelta = interpolateStorageProfileDelta(STORAGE_CFU_REFERENCE_PROFILES.mild, safeSpecies, safeDay);
    const typicalDelta = interpolateStorageProfileDelta(STORAGE_CFU_REFERENCE_PROFILES.typical, safeSpecies, safeDay);
    const severeDelta = interpolateStorageProfileDelta(STORAGE_CFU_REFERENCE_PROFILES.severe, safeSpecies, safeDay);
    const deltaLog10 = severity <= coefficients.profileBlend.mildToTypicalMax
        ? lerp(mildDelta, typicalDelta, severity / coefficients.profileBlend.mildToTypicalMax)
        : lerp(typicalDelta, severeDelta, (severity - coefficients.profileBlend.mildToTypicalMax) / (1 - coefficients.profileBlend.mildToTypicalMax));

    return {
        speciesKey: safeSpecies,
        storageDay: safeDay,
        deltaLog10,
        retentionFraction: Math.pow(10, deltaLog10),
        severity,
        acidSeverity,
        postAcidificationSeverity,
        profileLow: severity <= coefficients.profileBlend.mildToTypicalMax ? STORAGE_CFU_REFERENCE_PROFILES.mild.label : STORAGE_CFU_REFERENCE_PROFILES.typical.label,
        profileHigh: severity <= coefficients.profileBlend.mildToTypicalMax ? STORAGE_CFU_REFERENCE_PROFILES.typical.label : STORAGE_CFU_REFERENCE_PROFILES.severe.label,
        modelName: STORAGE_CFU_PROFILE_SUMMARY.modelName,
        sources: STORAGE_CFU_PROFILE_SUMMARY.sources
    };
}

export function buildStorageCfuRetentionSeries(speciesKey, maxStorageDay, context = {}) {
    const safeMaxDay = clamp(Number.isFinite(maxStorageDay) ? maxStorageDay : 0, 0, 50);
    const points = [{ storageDay: 0 }];
    for (let day = 1; day <= Math.floor(safeMaxDay); day += 1) {
        points.push({ storageDay: day });
    }
    if (safeMaxDay > Math.floor(safeMaxDay)) {
        points.push({ storageDay: safeMaxDay });
    }
    if (points[points.length - 1].storageDay !== safeMaxDay) {
        points.push({ storageDay: safeMaxDay });
    }
    return points.map((point) => evaluateStorageCfuRetention(speciesKey, point.storageDay, context));
}

export function evaluateTextureProxy(context = {}) {
    const coefficients = TEXTURE_PROXY_COEFFICIENTS;
    const finalPh = Number.isFinite(context.finalPh) ? context.finalPh : 4.7;
    const storageFinalPh = Number.isFinite(context.storageFinalPh) ? context.storageFinalPh : finalPh;
    const storageDay = clamp(Number.isFinite(context.storageDays) ? context.storageDays : 0, 0, 50);
    const incubationHours = Number.isFinite(context.incubationHours) ? context.incubationHours : 0;
    const timeToPh46Hr = Number.isFinite(context.timeToPh46Hr) ? context.timeToPh46Hr : null;
    const milkG = Math.max(1, Number.isFinite(context.milkG) ? context.milkG : 1);
    const extraMassG = Math.max(0, Number.isFinite(context.extraMassG) ? context.extraMassG : 0);
    const ratioStToLb = Number.isFinite(context.ratioStToLb) && context.ratioStToLb > 0 ? context.ratioStToLb : 1;
    const ratioLog = Math.log10(ratioStToLb);

    const acidSetProgress = clamp01((coefficients.acidSet.centerPh - finalPh) / coefficients.acidSet.spanPh);
    const timeAfterPh46 = timeToPh46Hr == null ? 0 : Math.max(0, incubationHours - timeToPh46Hr);
    const gelMaturationProgress = clamp01(timeAfterPh46 / coefficients.gelMaturation.spanHr);
    const storageMaturation = clamp01(storageDay / coefficients.storageMaturation.spanDays);
    const overAcidification = clamp01((coefficients.overAcidification.centerPh - storageFinalPh) / coefficients.overAcidification.spanPh);
    const solidsBoost = clamp01((extraMassG / milkG) / coefficients.solidsBoost.massFractionSpan);
    const balanceFactor = clamp01(4 * (ratioStToLb / Math.pow(1 + ratioStToLb, 2)));
    const stHeavyPenalty = clamp01((ratioLog - coefficients.stHeavyPenalty.startRatioLog) / coefficients.stHeavyPenalty.spanRatioLog) * coefficients.stHeavyPenalty.weight;

    const setScore = clamp(
        100 * (
            coefficients.acidSet.weight * acidSetProgress
            + coefficients.gelMaturation.weight * gelMaturationProgress
            + coefficients.storageMaturation.weight * storageMaturation
            + coefficients.solidsBoost.weight * solidsBoost
            + coefficients.balanceFactor.weight * balanceFactor
            + coefficients.overAcidification.weight * overAcidification
            - stHeavyPenalty
        ),
        0,
        100
    );

    const referenceDay = clamp(storageDay > 0 ? storageDay : 1, 1, 28);
    const textureReference = evaluateRamchandranTextureReference(referenceDay);
    const setScale = clamp(setScore / coefficients.setScale.divisor, coefficients.setScale.min, coefficients.setScale.max);
    const acidFragilityScale = 1 + coefficients.overAcidification.weight * overAcidification;
    const solidsScale = 1 + coefficients.solidsBoost.firmnessScaleWeight * solidsBoost;
    const lowFirmness = textureReference.EY.firmnessG * setScale * acidFragilityScale * solidsScale;
    const highFirmness = textureReference.NEY.firmnessG * setScale * acidFragilityScale * solidsScale;
    const likelyFirmness = lerp(lowFirmness, highFirmness, coefficients.likelyBlendFraction);
    const lowYieldStress = textureReference.EY.yieldStressPa * setScale * acidFragilityScale * solidsScale;
    const highYieldStress = textureReference.NEY.yieldStressPa * setScale * acidFragilityScale * solidsScale;
    const likelyYieldStress = lerp(lowYieldStress, highYieldStress, coefficients.likelyBlendFraction);

    const underSetPenalty = clamp01((coefficients.underSetPenalty.centerScore - setScore) / coefficients.underSetPenalty.centerScore);
    const lowWhey = clamp(
        textureReference.EY.wheySeparationPct
        + coefficients.wheySeparation.lowUnderSetWeight * underSetPenalty
        + coefficients.wheySeparation.lowOverAcidWeight * overAcidification
        + coefficients.solidsBoost.lowWheyWeight * solidsBoost,
        0,
        coefficients.wheySeparation.maxPercent
    );
    const highWhey = clamp(
        textureReference.NEY.wheySeparationPct
        + coefficients.wheySeparation.highUnderSetWeight * underSetPenalty
        + coefficients.wheySeparation.highOverAcidWeight * overAcidification
        + coefficients.solidsBoost.highWheyWeight * solidsBoost,
        0,
        coefficients.wheySeparation.maxPercent
    );
    const likelyWhey = lerp(lowWhey, highWhey, coefficients.likelyBlendFraction);

    return {
        modelName: "Coarse texture/set proxy",
        setScore,
        setClass: classifySetScore(setScore, storageFinalPh),
        firmnessG: likelyFirmness,
        firmnessRangeG: { low: Math.min(lowFirmness, highFirmness), high: Math.max(lowFirmness, highFirmness) },
        spontaneousWheySeparationPercent: likelyWhey,
        wheySeparationRangePercent: { low: Math.min(lowWhey, highWhey), high: Math.max(lowWhey, highWhey) },
        syneresisRisk: classifySyneresisRisk(likelyWhey),
        yieldStressPa: likelyYieldStress,
        yieldStressRangePa: { low: Math.min(lowYieldStress, highYieldStress), high: Math.max(lowYieldStress, highYieldStress) },
        drivers: {
            acidSetProgress,
            gelMaturationProgress,
            storageMaturation,
            overAcidification,
            solidsBoost,
            balanceFactor
        },
        referenceDay,
        reference: textureReference,
        sources: RAMCHANDRAN_TEXTURE_REFERENCE.sources,
        scopeNote: "Coarse proxy only. Ramchandran and Shah measured low-fat yogurts with EPS and non-EPS S. thermophilus strains; the estimator uses those as texture anchors, not as a universal rheometer calibration."
    };
}

function buildBackboneResult(lower, upper, fraction, ratioStToLb, ratioLog, clampedLow, clampedHigh) {
    return {
        ratioStToLb,
        ratioLog,
        lowerAnchor: lower,
        upperAnchor: upper,
        fraction,
        isClampedLow: clampedLow,
        isClampedHigh: clampedHigh,
        sourceKind: lower === upper ? lower.sourceKind : "interpolated_published_backbone",
        sourceInitialPh42C: lerp(lower.sourceInitialPh, upper.sourceInitialPh, fraction),
        amplitude42C: lerp(lower.amplitude42C, upper.amplitude42C, fraction),
        terminalPh42C: lerp(lower.terminalPh42C, upper.terminalPh42C, fraction),
        maxAcidificationRate42C: lerp(lower.maxAcidificationRate42C, upper.maxAcidificationRate42C, fraction),
        lagHr42C: lerp(lower.lagHr42C, upper.lagHr42C, fraction)
    };
}

function buildIncubationResidualSummary() {
    const all = INCUBATION_VALIDATION_DATASETS.map((dataset) => {
        const residual = evaluateDatasetResidual(dataset);
        return {
            ...dataset,
            residual
        };
    });

    const primary = all.filter((item) => item.role !== "extrapolation_validation");
    const extrapolation = all.filter((item) => item.role === "extrapolation_validation");

    return {
        datasets: all,
        inRange: summarizeResidualGroup(primary),
        extrapolation: summarizeResidualGroup(extrapolation)
    };
}

function evaluateStorageDeltaForDataset(dataset, storageDay) {
    const points = dataset.deltaPoints;
    if (!points.length) return 0;
    if (storageDay <= points[0].storageDay) return points[0].deltaPh;
    if (storageDay >= points[points.length - 1].storageDay) return points[points.length - 1].deltaPh;

    for (let index = 1; index < points.length; index += 1) {
        const lower = points[index - 1];
        const upper = points[index];
        if (storageDay > upper.storageDay) continue;
        const span = Math.max(1e-9, upper.storageDay - lower.storageDay);
        const fraction = clamp01((storageDay - lower.storageDay) / span);
        return lerp(lower.deltaPh, upper.deltaPh, fraction);
    }
    return points[points.length - 1].deltaPh;
}

function evaluateStoragePhForDataset(dataset, storageDay) {
    const points = dataset.points;
    if (!points.length) return 0;
    if (storageDay <= points[0].storageDay) return points[0].ph;
    if (storageDay >= points[points.length - 1].storageDay) return points[points.length - 1].ph;

    for (let index = 1; index < points.length; index += 1) {
        const lower = points[index - 1];
        const upper = points[index];
        if (storageDay > upper.storageDay) continue;
        const span = Math.max(1e-9, upper.storageDay - lower.storageDay);
        const fraction = clamp01((storageDay - lower.storageDay) / span);
        return lerp(lower.ph, upper.ph, fraction);
    }
    return points[points.length - 1].ph;
}

function interpolateStorageProfileDelta(profile, speciesKey, storageDay) {
    return interpolatePointSeries(profile.species[speciesKey] || [], storageDay, "deltaLog10");
}

function evaluateRamchandranTextureReference(storageDay) {
    const products = RAMCHANDRAN_TEXTURE_REFERENCE.products;
    return Object.fromEntries(Object.entries(products).map(([key, product]) => [
        key,
        {
            label: product.label,
            firmnessG: interpolatePointSeries(product.firmnessG, storageDay, "value"),
            wheySeparationPct: interpolatePointSeries(product.wheySeparationPct, storageDay, "value"),
            yieldStressPa: interpolatePointSeries(product.yieldStressPa, storageDay, "value")
        }
    ]));
}

function interpolatePointSeries(points, xValue, valueKey) {
    if (!Array.isArray(points) || points.length === 0) return 0;
    const safeX = Number.isFinite(xValue) ? xValue : 0;
    const sorted = [...points].sort((left, right) => left.storageDay - right.storageDay);
    if (safeX <= sorted[0].storageDay) return sorted[0][valueKey];
    if (safeX >= sorted[sorted.length - 1].storageDay) return sorted[sorted.length - 1][valueKey];

    for (let index = 1; index < sorted.length; index += 1) {
        const lower = sorted[index - 1];
        const upper = sorted[index];
        if (safeX > upper.storageDay) continue;
        const span = Math.max(1e-9, upper.storageDay - lower.storageDay);
        const fraction = clamp01((safeX - lower.storageDay) / span);
        return lerp(lower[valueKey], upper[valueKey], fraction);
    }

    return sorted[sorted.length - 1][valueKey];
}

function classifySetScore(score, storageFinalPh) {
    const thresholds = TEXTURE_PROXY_COEFFICIENTS.classThresholds;
    if (score < thresholds.weakMax) return { label: "Not set / weak gel", status: "weak" };
    if (score < thresholds.softMax) return { label: "Soft set", status: "soft" };
    if (score < thresholds.setMax) return { label: "Set", status: "set" };
    if (storageFinalPh < thresholds.firmButAcidicPh) return { label: "Firm but acidic", status: "acidic" };
    return { label: "Firm set", status: "firm" };
}

function classifySyneresisRisk(wheySeparationPercent) {
    const thresholds = TEXTURE_PROXY_COEFFICIENTS.syneresisRiskThresholds;
    if (wheySeparationPercent < thresholds.lowMax) return { label: "Low", status: "low" };
    if (wheySeparationPercent < thresholds.moderateMax) return { label: "Moderate", status: "moderate" };
    return { label: "High", status: "high" };
}

function evaluateDatasetResidual(dataset) {
    const backbone = interpolateIncubationBackbone(dataset.ratioStToLb);
    const initialPh = dataset.points[0]?.ph ?? backbone.sourceInitialPh42C;
    const terminalPh = clamp(
        Math.min(initialPh - 0.03, backbone.terminalPh42C),
        3.6,
        initialPh - 0.03
    );

    let squaredError = 0;
    let absoluteError = 0;
    let maxAbsoluteError = 0;

    dataset.points.forEach((point) => {
        const predicted = gompertzPhAtTime(point.timeHr, {
            initialPh,
            terminalPh,
            amplitude: Math.max(0.05, initialPh - terminalPh),
            maxAcidificationRate: backbone.maxAcidificationRate42C,
            lagHr: backbone.lagHr42C
        });
        const delta = predicted - point.ph;
        const absDelta = Math.abs(delta);
        squaredError += delta * delta;
        absoluteError += absDelta;
        maxAbsoluteError = Math.max(maxAbsoluteError, absDelta);
    });

    const count = Math.max(1, dataset.points.length);
    return {
        pointCount: count,
        squaredError,
        absoluteError,
        rmse: Math.sqrt(squaredError / count),
        mae: absoluteError / count,
        maxAbsoluteError,
        backbone
    };
}

function summarizeResidualGroup(datasets) {
    if (!datasets.length) {
        return {
            datasetCount: 0,
            pointCount: 0,
            pooledSquaredError: 0,
            pooledAbsoluteError: 0,
            rmse: 0,
            mae: 0,
            maxAbsoluteError: 0
        };
    }

    const datasetCount = datasets.length;
    const pointCount = datasets.reduce((sum, item) => sum + (item.residual.pointCount || 0), 0);
    const pooledSquaredError = datasets.reduce((sum, item) => sum + (item.residual.squaredError || 0), 0);
    const pooledAbsoluteError = datasets.reduce((sum, item) => sum + (item.residual.absoluteError || 0), 0);
    const denominator = Math.max(1, pointCount);
    const rmse = Math.sqrt(pooledSquaredError / denominator);
    const mae = pooledAbsoluteError / denominator;
    const maxAbsoluteError = Math.max(...datasets.map((item) => item.residual.maxAbsoluteError));
    return {
        datasetCount,
        pointCount,
        pooledSquaredError,
        pooledAbsoluteError,
        rmse,
        mae,
        maxAbsoluteError
    };
}

function gompertzPhAtTime(timeHr, config) {
    if (timeHr <= 0) return config.initialPh;
    const amplitude = Math.max(0.05, config.amplitude);
    const driver = ((config.maxAcidificationRate * Math.E) / amplitude) * (config.lagHr - timeHr) + 1;
    const drop = amplitude * Math.exp(-Math.exp(driver));
    return clamp(config.initialPh - drop, config.terminalPh, config.initialPh);
}

function lerp(start, end, fraction) {
    return start + (end - start) * fraction;
}

function clamp01(value) {
    return clamp(value, 0, 1);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
