export const SPECIES_ORDER = ["st", "lb"];

export const SPECIES_PRESETS = {
    st: {
        key: "st",
        label: "S. thermophilus",
        color: "#22c55e",
        lagHr: 0.75,
        muOpt: 0.95,
        lMax: 8.9,
        optimumC: 41.0,
        sigmaC: 4.5,
        viabilityOptimumC: 37,
        viabilitySigmaC: 6,
        viabilityFloor: 0.65,
        acidificationWeight: 1.18,
        phSoftStart: 5,
        phHardFloor: 4.15,
        phMinFactor: 0.08,
        storageBaseLogLossPerDay: 0.008,
        storageAcidLogLossPerDay: 0.028,
        storageDriftLogLossPerDay: 0.012,
        storagePhThreshold: 4.45,
        storagePhSpan: 0.75,
        storageDeltaPhSpan: 0.8,
        storageMaxLogLossPerDay: 0.09,
        thermalStressStartC: 47,
        thermalDRefC: 60,
        thermalDRefMin: 3,
        thermalZC: 6,
        validTempMinC: 35,
        validTempMaxC: 47
    },
    lb: {
        key: "lb",
        label: "L. bulgaricus",
        color: "#38bdf8",
        lagHr: 1.25,
        muOpt: 0.75,
        lMax: 8.6,
        optimumC: 43.5,
        sigmaC: 4.5,
        viabilityOptimumC: 37,
        viabilitySigmaC: 6,
        viabilityFloor: 0.77,
        acidificationWeight: 0.92,
        phSoftStart: 4.75,
        phHardFloor: 3.95,
        phMinFactor: 0.14,
        storageBaseLogLossPerDay: 0.006,
        storageAcidLogLossPerDay: 0.02,
        storageDriftLogLossPerDay: 0.009,
        storagePhThreshold: 4.35,
        storagePhSpan: 0.75,
        storageDeltaPhSpan: 0.8,
        storageMaxLogLossPerDay: 0.07,
        thermalStressStartC: 49,
        thermalDRefC: 64,
        thermalDRefMin: 4,
        thermalZC: 6,
        validTempMinC: 35,
        validTempMaxC: 47
    }
};

export const STARTER_PRESETS = {
    storeYogurt: {
        key: "storeYogurt",
        label: "Store Yogurt Starter",
        mode: "total",
        starterCfuPerG: 1e8,
        split: { st: 0.5, lb: 0.5 },
        note: "Reasonable household starter baseline."
    },
    freezeDried: {
        key: "freezeDried",
        label: "Freeze-Dried Starter",
        mode: "total",
        starterCfuPerG: 1e10,
        split: { st: 0.55, lb: 0.45 },
        note: "Higher starter viability and more concentrated inoculum."
    },
    manualTotal: {
        key: "manualTotal",
        label: "Manual Total CFU/g",
        mode: "total",
        starterCfuPerG: 1e8,
        split: { st: 0.5, lb: 0.5 },
        note: "User-specified total starter viability."
    },
    manualSpecies: {
        key: "manualSpecies",
        label: "Manual Per Species",
        mode: "species",
        speciesCfuPerG: { st: 5e7, lb: 5e7 },
        note: "User-specified species-specific starter viability."
    }
};

export const DEFAULT_EXAMPLE = {
    milkAmount: 64,
    milkUnit: "fl_oz",
    starterAmount: 2,
    starterUnit: "tsp",
    starterMode: "storeYogurt",
    substrateMode: "standardMilk",
    starterCfuTotal: "1E8",
    starterCfuSt: "5E7",
    starterCfuLb: "5E7",
    splitStPercent: 50,
    splitLbPercent: 50,
    extraMassG: 0,
    incubationHours: 8,
    storageDays: 10,
    temperatureC: 42,
    stLagHr: SPECIES_PRESETS.st.lagHr,
    stMuOpt: SPECIES_PRESETS.st.muOpt,
    stLmax: SPECIES_PRESETS.st.lMax,
    stOptimumC: SPECIES_PRESETS.st.optimumC,
    lbLagHr: SPECIES_PRESETS.lb.lagHr,
    lbMuOpt: SPECIES_PRESETS.lb.muOpt,
    lbLmax: SPECIES_PRESETS.lb.lMax,
    lbOptimumC: SPECIES_PRESETS.lb.optimumC
};
