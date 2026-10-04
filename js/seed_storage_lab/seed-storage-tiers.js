// Storage method model: container tier, headspace oxygen, and the interlocks
// that stop a sealed container from making wet or treated seed worse.
// Pure, no imports. Oxygen is in percent by volume at atmospheric pressure.

export const AIR_OXYGEN_PCT = 20.9;
export const DAYS_PER_YEAR = 365.25;

// Groot et al. 2025, combined model over 16, 33 and 43% eRH: each halving of
// oxygen extends shelf life 1.72-fold, so ageing rate goes as O2^log2(1.72).
export const OXYGEN_HALVING_FACTOR = 1.72;
export const OXYGEN_EXPONENT = Math.log2(OXYGEN_HALVING_FACTOR);

export const OXYGEN_LIMITS = Object.freeze({
    // Lowest level Groot modelled; the meter read 0.1 to 1% with a 1% error.
    floorPct: 1,
    // Full effect through 43% eRH, hardly any at 60%; nothing measured between.
    fullEffectMaxRhPct: 43,
    noEffectRhPct: 60,
    testedMinRhPct: 16,
    temperatureMinC: 5,
    temperatureMaxC: 30
});

// Groot et al. 2015: 10 g of lettuce (18 mL) in a 47 mL jam jar at 20 C and
// 39% RH used the oxygen down to about one third of its start within a year.
export const LETTUCE_UPTAKE = Object.freeze({
    jarMl: 47,
    seedVolumeMl: 18,
    seedMassG: 10,
    rhPct: 39,
    temperatureC: 20,
    days: 365,
    remainingFraction: 1 / 3,
    observedDays: 450
});

// Groot et al. 2025 retells the same jar as 15% at 112 days, 10% at 250 and
// slightly above 5% at 450. Used only as a cross-check of the decay constant.
export const LETTUCE_UPTAKE_RECOUNT = Object.freeze([
    { days: 112, oxygenPct: 15 },
    { days: 250, oxygenPct: 10 },
    { days: 450, oxygenPct: 5 }
]);

export const DEFAULT_SEED_VOLUME_ML_PER_G = LETTUCE_UPTAKE.seedVolumeMl / LETTUCE_UPTAKE.seedMassG;

// Sealing wet seed: Groot 2025 says dry below about 50% eRH and preferably to
// 20-30%; okra sealed at 12 and 14% moisture lost viability (Bakhtavar 2023).
export const SEALING_LIMITS = Object.freeze({
    blockAboveRhPct: 50,
    preferredMaxRhPct: 30,
    blockAtMoisturePct: 12
});

export const PELLETED_LIFE_YEARS = 1;

// Yildirim et al. 2021: vacuum beat cheesecloth for pepper at 48 months. Three
// of four cultivars showed no significant difference at 12, 24 or 36.
export const VACUUM_PAYOFF_MONTHS = 48;

// Retrieval advice applies to a sealed container kept colder than this.
export const COLD_STORAGE_BELOW_C = 15;

export const CONTAINERS = Object.freeze({
    open: { label: "Paper, cloth or jute packet", holdsMoisture: false, holdsOxygen: false },
    screw: { label: "Plastic screw cap with no gasket", holdsMoisture: true, holdsOxygen: false },
    gasket: { label: "Jar with a rubber ring or lined lid", holdsMoisture: true, holdsOxygen: true },
    foil: { label: "Laminated foil bag, vacuum sealed", holdsMoisture: true, holdsOxygen: true }
});

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

/** Oxygen exponent at a given eRH, with the regime it falls in. */
export function oxygenExponent(rhPct) {
    const { fullEffectMaxRhPct, noEffectRhPct } = OXYGEN_LIMITS;
    if (!isNumber(rhPct) || rhPct <= fullEffectMaxRhPct) return { exponent: OXYGEN_EXPONENT, regime: "full" };
    if (rhPct >= noEffectRhPct) return { exponent: 0, regime: "none" };
    const share = (noEffectRhPct - rhPct) / (noEffectRhPct - fullEffectMaxRhPct);
    return { exponent: OXYGEN_EXPONENT * share, regime: "taper" };
}

/** Life multiplier relative to air: (20.9 / O2)^b, with O2 held at the floor. */
export function oxygenMultiplier(oxygenPct, { rhPct = null } = {}) {
    if (!isNumber(oxygenPct) || oxygenPct < 0) return null;
    const level = Math.min(Math.max(oxygenPct, OXYGEN_LIMITS.floorPct), AIR_OXYGEN_PCT);
    return Math.pow(AIR_OXYGEN_PCT / level, oxygenExponent(rhPct).exponent);
}

/** Uptake constant in mL of gas per g of seed per day, from the lettuce jar. */
export function uptakeConstant(anchor = LETTUCE_UPTAKE) {
    const perDay = Math.log(1 / anchor.remainingFraction) / anchor.days;
    return perDay * (anchor.jarMl - anchor.seedVolumeMl) / anchor.seedMassG;
}

/**
 * First-order decay constant per day for a sealed container. Uptake goes as
 * the oxygen level, so the constant does not depend on the starting pressure.
 */
export function decayPerDay({ seedMassG, gasMl }) {
    if (!isNumber(seedMassG) || !isNumber(gasMl) || seedMassG <= 0 || gasMl <= 0) return null;
    return uptakeConstant() * seedMassG / gasMl;
}

export function oxygenAtDays(startPct, perDay, days) {
    return startPct * Math.exp(-perDay * days);
}

/** Days for a sealed container to fall from startPct to targetPct. */
export function daysToOxygen(startPct, perDay, targetPct) {
    if (targetPct >= startPct) return 0;
    if (!(perDay > 0) || !(targetPct > 0)) return null;
    return Math.log(startPct / targetPct) / perDay;
}

/** What an absorber leaves behind, by volume of oxygen it can take up. */
export function absorberOutcome({ capacityMl, gasMl, startPct }) {
    const oxygenMl = gasMl * startPct / 100;
    if (!isNumber(capacityMl) || capacityMl <= 0) return { oxygenMl, sufficient: false, residualPct: startPct };
    const leftMl = Math.max(0, oxygenMl - capacityMl);
    return {
        oxygenMl,
        sufficient: leftMl === 0,
        residualPct: leftMl === 0 ? OXYGEN_LIMITS.floorPct : Math.max(OXYGEN_LIMITS.floorPct, (leftMl / gasMl) * 100)
    };
}

function headspace({ containerMl, seedMassG, seedVolumeMl }) {
    if (!isNumber(containerMl) || containerMl <= 0 || !isNumber(seedMassG) || seedMassG <= 0) return null;
    const assumedVolume = !isNumber(seedVolumeMl) || seedVolumeMl <= 0;
    const volume = assumedVolume ? seedMassG * DEFAULT_SEED_VOLUME_ML_PER_G : seedVolumeMl;
    return { gasMl: containerMl - volume, seedVolumeMl: volume, assumedVolume };
}

function classify(container, absorber, desiccant) {
    if (container === "open") return "open";
    if (container === "screw") return "leaky-closure";
    if (absorber && !desiccant) return "absorber-only";
    if (absorber && desiccant) return "absorber-desiccant";
    if (container === "foil") return "foil-vacuum";
    if (desiccant) return "desiccant-only";
    return "hermetic";
}

/**
 * Evaluate one storage arrangement. Returns the tier, the starting oxygen
 * level and its multiplier, the decay constant for a sealed jar, and notes
 * graded block, warn or info.
 */
export function evaluateStorage(inputs = {}) {
    const {
        container = "gasket", vacuumResidualPct = 100, absorber = false, absorberCapacityMl = null,
        desiccant = false, containerMl = null, seedMassG = null, seedVolumeMl = null,
        horizonYears = null, seedTreatment = "raw", rhPct = null, moisturePct = null, temperatureC = null
    } = inputs;

    const kind = CONTAINERS[container] ? container : "gasket";
    const spec = CONTAINERS[kind];
    const tier = classify(kind, absorber, desiccant);
    const notes = [];
    const note = (level, code, text) => notes.push({ level, code, text });

    // Sealing seed that is not dry enough is the interlock everything else waits on.
    const wetByRh = isNumber(rhPct) && rhPct > SEALING_LIMITS.blockAboveRhPct;
    const wetByMoisture = isNumber(moisturePct) && moisturePct >= SEALING_LIMITS.blockAtMoisturePct;
    const sealedWet = spec.holdsMoisture && (wetByRh || wetByMoisture);
    if (sealedWet) {
        note("block", "sealed-wet",
            `Sealing does not dry seed; it locks in whatever moisture the seed holds. ${wetByRh ? `Seed in balance with ${rhPct}% RH is above the 50% eRH Groot et al. 2025 give as the most a sealed seed should hold.` : ""}`
            + `${wetByMoisture ? ` Okra sealed at 12% and 14% moisture lost viability, the 14% lot completely within six months, while 8% and 10% kept germination for a year (Bakhtavar et al. 2023).` : ""}`
            + " Dry the seed first, then seal it.");
    } else if (spec.holdsMoisture && isNumber(rhPct) && rhPct > SEALING_LIMITS.preferredMaxRhPct) {
        note("warn", "sealed-damp",
            `Seed in balance with ${rhPct}% RH is under the 50% limit but above the 20-30% eRH Groot et al. 2025 recommend before sealing.`);
    }

    if (tier === "open") {
        note("info", "open-storage",
            "An unsealed packet lets the seed take up moisture from the room, so the moisture content you entered will drift toward room humidity. "
            + "In the okra trial, seed in paper, cloth, polypropylene and jute bags lost about 70% of its germination in a year, while dry seed (8 and 10% moisture) in a hermetic bag kept nearly all of it.");
    }
    if (tier === "leaky-closure") {
        note("warn", "screw-cap",
            "Groot et al. 2015 found plastic screw caps kept out water vapour for three months but let oxygen back in, with large differences between jars. "
            + "A jar with a rubber ring or a lined twist-off lid held its oxygen level. No oxygen benefit is credited here.");
    }
    if (tier === "absorber-only") {
        note("block", "absorber-only",
            "Most oxygen absorbers contain a moisturiser to speed the iron reaction. In a sealed jar with an absorber and no desiccant, RH rose to 88% within 2 days (Groot et al. 2015), "
            + "and primed celery stored that way did no better than without the absorber. Add a desiccant, or use an absorber sold without a moisturiser.");
    }
    if (tier === "desiccant-only" && seedTreatment !== "raw") {
        note("warn", "desiccant-treated",
            "Primed and pelleted celery stored with zeolite drying beads alone lost viability in Groot et al. 2015; only beads plus an oxygen absorber protected it. "
            + "That was a 17-day test at 35 °C, an accelerated-ageing stress, but it shows over-drying is a hazard of its own for treated seed.");
    }
    if (absorber && !spec.holdsOxygen) {
        note("warn", "absorber-wasted", "An oxygen absorber in a container that lets oxygen in is spent on air leaking in from the room.");
    }
    if (kind === "foil") {
        note("info", "foil-fragile", "Vacuum packing presses the bag hard onto the seed. No archived study measures damage from it, but check small or fragile seed, or use a rigid jar.");
    }

    // Starting oxygen level.
    const space = headspace({ containerMl, seedMassG, seedVolumeMl });
    let startPct = AIR_OXYGEN_PCT;
    let absorberResult = null;
    let source = "air";
    if (spec.holdsOxygen) {
        if (isNumber(vacuumResidualPct) && vacuumResidualPct < 100) {
            startPct = AIR_OXYGEN_PCT * Math.max(0, vacuumResidualPct) / 100;
            source = "vacuum";
        }
        if (kind === "foil" && source === "air" && !absorber) {
            note("warn", "foil-no-reading",
                "No vacuum figure is entered, so the bag is treated as holding air. Genebank foil bags reach below 1% oxygen; "
                + "a kitchen sealer's vacuum is not published. Enter the pressure left if your sealer reports it.");
        }
        if (absorber) {
            if (space && space.gasMl > 0) {
                absorberResult = absorberOutcome({ capacityMl: absorberCapacityMl, gasMl: space.gasMl, startPct });
                startPct = absorberResult.residualPct;
                if (!absorberResult.sufficient) {
                    note("warn", "absorber-small",
                        `The jar holds about ${absorberResult.oxygenMl.toFixed(0)} mL of oxygen and the absorber is rated for ${isNumber(absorberCapacityMl) ? absorberCapacityMl : 0} mL. `
                        + "Use a larger absorber or a smaller jar.");
                }
            } else {
                startPct = OXYGEN_LIMITS.floorPct;
                note("info", "absorber-unchecked",
                    "Without the container volume and seed weight the absorber's size cannot be checked against the oxygen in the jar, so it is assumed to be enough.");
            }
            source = "absorber";
        }
    }

    if (space && space.gasMl <= 0) {
        note("block", "seed-too-big", "The seed as entered takes up more room than the container holds. Check the volume and the seed weight.");
    }

    const exponentInfo = oxygenExponent(rhPct);
    // The absorber-only hazard and wet sealing both void the oxygen credit.
    const creditVoid = sealedWet || tier === "absorber-only" || !spec.holdsOxygen;
    const multiplier = creditVoid ? 1 : oxygenMultiplier(startPct, { rhPct });

    if (!creditVoid && startPct < AIR_OXYGEN_PCT) {
        if (exponentInfo.regime === "taper") {
            note("warn", "oxygen-taper",
                `At ${rhPct}% RH the oxygen effect is fading. Groot et al. 2025 found the full effect through 43% eRH and hardly any at 60%; nothing was measured in between, so the exponent is scaled down in a straight line.`);
        } else if (exponentInfo.regime === "none") {
            note("warn", "oxygen-none", `At ${rhPct}% RH Groot et al. 2025 found little or no benefit from lowering oxygen, so none is credited.`);
        }
        if (isNumber(rhPct) && rhPct < OXYGEN_LIMITS.testedMinRhPct) {
            note("info", "oxygen-dry", `The driest storage Groot et al. 2025 tested was 16% eRH; ${rhPct}% is below it.`);
        }
        if (isNumber(temperatureC) && (temperatureC < OXYGEN_LIMITS.temperatureMinC || temperatureC > OXYGEN_LIMITS.temperatureMaxC)) {
            note("info", "oxygen-temperature",
                `The oxygen effect was measured from 5 to 30 °C, and ${Math.round(temperatureC * 10) / 10} °C is outside that range.`
                + (temperatureC < 0 ? " Lipid oxidation does continue in frozen food, more slowly." : ""));
        }
        note("info", "oxygen-scope",
            "The oxygen factor comes from primed celery. Groot et al. 2025 report preliminary lettuce and onion results of about 1.8-fold per halving, "
            + "but lettuce stored at 2% oxygen and 37 °C gained only about 20% in Schwember & Bradford 2011, as Groot et al. read their figure. The lower end of the projection takes no oxygen benefit.");
        const horizonMonths = isNumber(horizonYears) ? horizonYears * 12 : null;
        if (horizonMonths !== null && horizonMonths < VACUUM_PAYOFF_MONTHS) {
            note("info", "short-horizon",
                `For ${horizonYears} year${horizonYears === 1 ? "" : "s"} of storage, oxygen control may not show. Vacuum-sealed pepper at 13 °C and 35% RH `
                + "was no better than open storage at 12, 24 or 36 months for three of four cultivars, and clearly better only at 48; the fourth separated from 24 months "
                + "(Yildirim et al. 2021). Drying matters more.");
        }
    }

    // Seed in a sealed jar keeps drawing the oxygen down.
    let decay = null;
    if (spec.holdsOxygen && kind !== "foil" && space && space.gasMl > 0 && source !== "absorber"
        && startPct > OXYGEN_LIMITS.floorPct) {
        const perDay = decayPerDay({ seedMassG, gasMl: space.gasMl });
        decay = {
            perDay,
            daysToHalf: daysToOxygen(startPct, perDay, startPct / 2),
            daysToFloor: daysToOxygen(startPct, perDay, OXYGEN_LIMITS.floorPct),
            assumedVolume: space.assumedVolume
        };
        note("info", "decay-scope",
            "The fall in oxygen is scaled from dry lettuce at 20 °C and 39% RH, followed for 450 days. Groot et al. 2025 note the rate changes with temperature, "
            + "moisture and the oxygen level itself, and no other seed or condition has been measured. The seed also spends its own antioxidants doing it, "
            + "so no benefit is credited for oxygen the seed uses up itself.");
    }

    if (spec.holdsMoisture && isNumber(temperatureC) && temperatureC < COLD_STORAGE_BELOW_C) {
        note("warn", "retrieval",
            "When you take the seed out, let the closed container reach room temperature before opening it (Johnny's). "
            + "Opened cold, moist room air condenses on the seed.");
    }

    let override = null;
    if (seedTreatment === "pelleted") {
        override = { kind: "pelleted", capYears: PELLETED_LIFE_YEARS };
        note("warn", "pelleted",
            "Johnny's: pelleted seed of any variety should be used within one year, because pelleting shortens seed life. Projections are capped at one year.");
    } else if (seedTreatment === "primed") {
        override = { kind: "primed", capYears: null };
        note("warn", "primed",
            "Primed seed ages faster than raw seed, and primed celery can lose commercial quality within weeks at room conditions (Groot et al. 2025). "
            + "The published figures here are for raw seed, so no storage life is projected. Test germination before you sow.");
    }

    return {
        ok: !(space && space.gasMl <= 0),
        container: kind,
        containerLabel: spec.label,
        tier,
        holdsMoisture: spec.holdsMoisture,
        holdsOxygen: spec.holdsOxygen,
        sealedWet,
        blocked: notes.some((item) => item.level === "block"),
        oxygen: {
            startPct,
            source,
            exponent: creditVoid ? 0 : exponentInfo.exponent,
            regime: creditVoid ? "void" : exponentInfo.regime,
            multiplier,
            absorber: absorberResult
        },
        headspace: space,
        decay,
        override,
        horizonYears: isNumber(horizonYears) ? horizonYears : null,
        notes
    };
}

/** Points for the oxygen chart, in days and percent. */
export function sampleOxygenCurve(storage, { horizonDays, points = 80 } = {}) {
    const start = storage.oxygen.startPct;
    const out = [];
    for (let i = 0; i <= points; i += 1) {
        const days = (horizonDays * i) / points;
        const level = storage.decay ? oxygenAtDays(start, storage.decay.perDay, days) : start;
        out.push({ days, oxygenPct: level });
    }
    return out;
}
