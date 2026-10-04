// Citation registry for the Seed Storage Lab.
//
// Every sourceKey emitted by scripts/build-seed-species-data.py must resolve
// here, and seed-validation.js asserts that. A dataset that loses its citation
// is a defect: the whole point of the tool is that a user can trace any number
// back to the page it came from.

export const SEED_REFERENCES = Object.freeze({
    // ---- Seed count and longevity datasets -------------------------------
    unlG2090: {
        label: "Lindgren & Browning, Nebraska Extension G2090",
        url: "https://extensionpubs.unl.edu/publication/g2090/2011/html/view",
        archive: "unl_g2090_vegetable_seed_storage_germination.html",
        kind: "extension"
    },
    osborne: {
        label: "Osborne Quality Seeds seed count chart",
        url: "https://www.osborneseed.com/pages/seed-count-chart",
        archive: "osborne_seed_count_chart.html",
        kind: "vendor"
    },
    johnnys: {
        label: "Johnny's Selected Seeds storage guidelines",
        url: "https://www.johnnyseeds.com/growers-library/reference-documents/seed-storage-guidelines.html",
        archive: "johnnys_seed_storage_guidelines.html",
        kind: "vendor"
    },
    wpsm: {
        label: "Woody Plant Seed Manual (USDA FS Agriculture Handbook 727)",
        url: "https://rngr.net/publications/wpsm",
        archive: "wpsm",
        kind: "handbook"
    },
    nrcsTx: {
        label: "NRCS Texas Technical Note TX-PM-12-02",
        url: "https://www.nrcs.usda.gov/plantmaterials/etpmctn10736.pdf",
        archive: "nrcs_tx_pm_12_02_seeds_per_pound_conservation_species.pdf",
        kind: "agency"
    },
    figshareTsw: {
        label: "Toro-Szijgyarto et al. 2022, thousand-seed weight dataset (Central Europe)",
        url: "https://doi.org/10.6084/m9.figshare.19391184",
        archive: "figshare_2022_thousand_seed_weight_central_europe.xlsx",
        kind: "dataset"
    },

    // ---- Viability equation constants ------------------------------------
    kewAppendix1: {
        label: "Hong, Linington & Ellis 1996, Compendium Appendix I",
        url: "https://cgspace.cgiar.org/items/9148afd5-2def-4ae8-bb01-567eaff5c538",
        archive: "ipgri_1996_hong_seed_storage_behaviour_compendium.pdf",
        kind: "handbook"
    },
    dickieEllis1990: {
        label: "Dickie & Ellis 1990, Ann. Bot. 65:197-204",
        url: "https://doi.org/10.1093/oxfordjournals.aob.a087924",
        archive: "annbot_1990_dickie_ellis_temperature_seed_longevity.pdf",
        kind: "paper"
    },
    demir2009Pepper: {
        label: "Demir et al. 2009, HortScience 44:1679-1682",
        url: "https://doi.org/10.21273/HORTSCI.44.6.1679",
        archive: "hortscience_2009_demir_pepper_viability_constants.pdf",
        kind: "paper"
    },
    demir2011Cucurbits: {
        label: "Demir et al. 2011, Seed Sci. Technol. 39:527-532",
        url: "https://doi.org/10.15258/sst.2011.39.2.23",
        archive: "sst_2011_demir_watermelon_melon_cucumber_constants.pdf",
        kind: "paper"
    },
    ellisBaumLentil: {
        label: "Whitehouse & Norton 2022, Seed Sci. Technol. 50:103-115",
        url: "https://doi.org/10.15258/sst.2022.50.1.09",
        archive: "sst_2022_whitehouse_norton_lentil_viability_constants.pdf",
        kind: "paper"
    },
    ellisRoberts1980: {
        label: "Ellis & Roberts 1980, Ann. Bot. 45:13-30",
        url: "https://doi.org/10.1093/oxfordjournals.aob.a085797",
        archive: null,
        notArchived: "Annals of Botany returned HTTP 403. The equation and constants are reproduced in Hay and in the 1996 compendium, both archived.",
        kind: "paper"
    },
    hayViabilityEquations: {
        label: "Hay, The Seed Viability Equations (RBG Kew)",
        url: "http://data.kew.org/sid/viability/SeedViabilityEquationsFHDec04.pdf",
        archive: "SeedViabilityEquationsFHDec04.pdf",
        kind: "handbook"
    },
    ellis2022SST: {
        label: "Ellis 2022, Seed Sci. Technol. 50(Suppl.1):1-20",
        url: "https://doi.org/10.15258/sst.2022.50.1.s.01",
        archive: "1_sst.2022.50.1.s_1-20.pdf",
        kind: "paper"
    },

    // ---- Storage behaviour -----------------------------------------------
    ipgri1996: {
        label: "Hong, Linington & Ellis 1996, Seed Storage Behaviour: a Compendium",
        url: "https://cgspace.cgiar.org/items/9148afd5-2def-4ae8-bb01-567eaff5c538",
        archive: "ipgri_1996_hong_seed_storage_behaviour_compendium.pdf",
        kind: "handbook"
    },
    kewCompendium1998: {
        label: "Hong, Linington & Ellis 1998, Compendium of information on seed storage behaviour, Vol. 2 (I-Z)",
        url: "https://cgspace.cgiar.org/items/843236ec-eb72-4cca-ba41-90845f23333f",
        archive: "kew_1998_hong_compendium_seed_storage_behaviour_vol2_I-Z.pdf",
        kind: "handbook"
    },

    // ---- Storage conditions and the multiplier model ----------------------
    harrington1972: {
        label: "Harrington 1972, Seed Storage and Longevity, in Seed Biology Vol. 3",
        url: "https://doi.org/10.1016/B978-0-12-424303-3.50007-1",
        archive: null,
        notArchived: "Book chapter, not online. Justice & Bass 1978 (usdaAH506, archived) restates both rules and their limits.",
        kind: "book chapter"
    },
    fao2014Standards: {
        label: "FAO 2014, Genebank Standards for Plant Genetic Resources for Food and Agriculture",
        url: "https://www.fao.org/4/i3704e/i3704e.pdf",
        archive: "fao_2014_genebank_standards_pgrfa.pdf",
        kind: "standard"
    },
    groot2015Anoxia: {
        label: "Groot et al. 2015, Plant Genet. Resour. 13:18-26",
        url: "https://doi.org/10.1017/S1479262114000586",
        archive: "pgr_2015_groot_anoxia_seed_longevity.html",
        kind: "paper"
    },
    groot2025Oxygen: {
        label: "Groot et al. 2025, Plant J. (oxygen effect on seed longevity)",
        url: "https://doi.org/10.1111/tpj.70066",
        archive: "tpj_2025_groot_modelling_oxygen_ageing_primed_celery.html",
        kind: "paper"
    },
    deVitis2020: {
        label: "De Vitis et al. 2020, Restor. Ecol. 28:S249-S255",
        url: "https://doi.org/10.1111/rec.13174",
        archive: "restecol_2020_devitis_seed_storage_viability_vigor.pdf",
        kind: "paper"
    },
    solberg2020: {
        label: "Solberg et al. 2020, Front. Plant Sci. 11:1007",
        url: "https://doi.org/10.3389/fpls.2020.01007",
        archive: "frontiers_2020_longterm_storage_longevity_orthodox_review.html",
        kind: "paper"
    },
    whitehouse2018: {
        label: "Whitehouse et al. 2018, Biopreserv. Biobank. 16:327-336",
        url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6204563/",
        archive: "pmc6204563_genebank_drying_standards_may_not_be_optimal.html",
        kind: "paper"
    },
    mdpiSeeds2024: {
        label: "Seeds 2024, 3(1):5 - storage conditions, deterioration and longevity",
        url: "https://doi.org/10.3390/seeds3010005",
        archive: "mdpi_seeds_2024_storage_conditions_deterioration_ageing_review.pdf",
        kind: "paper"
    },
    cpcSeedTypes: {
        label: "Center for Plant Conservation, The difference between orthodox, intermediate and recalcitrant seed",
        url: "https://saveplants.org/best-practices/difference-between-orthodox-intermediate-and-recalcitrant-seed/",
        archive: "cpc_orthodox_intermediate_recalcitrant_seed.html",
        kind: "extension"
    },
    usdaAH506: {
        label: "Justice & Bass 1978, Principles and Practices of Seed Storage (USDA AH-506)",
        url: "https://www.govinfo.gov/content/pkg/GOVPUB-A-PURL-gpo28758/pdf/GOVPUB-A-PURL-gpo28758.pdf",
        archive: "usda_ah506_1978_justice_bass_seed_storage.pdf",
        kind: "handbook"
    },
    yildirim2021Vacuum: {
        label: "Yildirim, Ozturk & Demir 2021, Hortic. Stud. 38:71-76",
        url: "https://doi.org/10.16882/HortiS.998078",
        archive: "hortis_pepper_vacuum_vs_open_air_storage.pdf",
        kind: "paper"
    },
    bakhtavar2023Okra: {
        label: "Bakhtavar et al. 2023, PLoS ONE 18:e0287476 (hermetic storage of okra seed)",
        url: "https://doi.org/10.1371/journal.pone.0287476",
        archive: "plosone_2023_okra_hermetic_storage_longevity.html",
        kind: "paper"
    }
});

// Claims the tool makes, what supports them, and where they are implemented.
// Written so that a reader who disagrees with a number can find both the
// citation and the line of code without reading the whole model.
export const SEED_CLAIM_AUDIT = Object.freeze([
    {
        area: "Scope",
        claim: "The longevity model runs only for seeds with orthodox storage behaviour.",
        support: "Recalcitrant seeds die on drying and are kept moist: about -3 to 5 C for temperate species (oak over 3 years at -3 C) and 7-17 C for tropical ones (1996 compendium, section 4.2). Intermediate seeds tolerate drying to about 7-12% moisture and keep worse below that; tropical ones also keep worse below about 10 C (section 5). Applying Harrington or Ellis-Roberts to dried acorns predicts decades of life for seed that drying has killed.",
        sourceKeys: ["ipgri1996", "kewCompendium1998", "deVitis2020"],
        implementation: "seed-model.js -> evaluateSpeciesGate. Seed counts still display for gated species; only the longevity math refuses."
    },
    {
        area: "Scope",
        claim: "The species gate resolves at species level first and only then falls back to genus.",
        support: "Acer saccharinum is recalcitrant while Acer platanoides is orthodox with published viability constants, so a genus-wide rule is wrong in both directions.",
        sourceKeys: ["ipgri1996", "kewCompendium1998"],
        implementation: "scripts/build-seed-species-data.py resolves species flag, then vol-2 row, then genus flag. seed-model.js reads the resolved flag and reports which rank matched."
    },
    {
        area: "Harrington",
        claim: "Each 1% drop in seed moisture content doubles storage life, and each 5.6 C (10 F) drop in temperature doubles it.",
        support: "Harrington's two rules of thumb. The moisture rule is stated identically by Justice & Bass 1978 and the CPC. The temperature rule is given as 10 F (5.6 C) by Groot et al. 2025 and the CPC, but as 5 C by Justice & Bass 1978, quoting Harrington 1972; a 5 C rule compounds faster, 16x against 12x over 20 C. The tool uses 10 F. Harrington 1972 itself is not archived.",
        sourceKeys: ["harrington1972", "usdaAH506", "cpcSeedTypes", "groot2025Oxygen"],
        implementation: "seed-model.js -> harringtonMultiplier. Moisture 2^(dMC); temperature is the span below."
    },
    {
        area: "Harrington",
        claim: "The temperature effect is a range across the two published readings of Harrington's rule and the Ellis-Roberts temperature terms.",
        support: "The universal CH and CQ (Dickie & Ellis 1990) are fitted on measured survival across species. From a 5 C baseline they give 4.7x at 20 C against 6.5x (10 F) and 8x (5 C), so below about 35 C the measured effect is smaller than either rule; above about 38 C it falls between them. The three are spanned, never averaged.",
        sourceKeys: ["dickieEllis1990", "hayViabilityEquations", "usdaAH506", "groot2025Oxygen"],
        implementation: "seed-model.js -> temperatureFactors. projectLongevity takes the low end of the span for years.low and the high end for years.high."
    },
    {
        area: "Harrington",
        claim: "The rules are only applied between 0-50 C and 5-14% moisture content.",
        support: "Justice & Bass 1978 report Harrington limiting the moisture rule to 5-14% MC and the temperature rule to 0-50 C. Below 0 C the rule overpredicts against the Ellis-Roberts data.",
        sourceKeys: ["usdaAH506", "harrington1972", "hayViabilityEquations"],
        implementation: "seed-model.js -> HARRINGTON_LIMITS. Inputs outside the box are clamped and the result carries an out-of-range warning that names the binding limit."
    },
    {
        area: "Hundred Rule",
        claim: "Storage temperature in F plus relative humidity in percent should total under 100.",
        support: "Harrington 1960, as the CPC states it: storage temperature in F and relative humidity in percent should add up to less than 100. A screening heuristic with no species term and no time term.",
        sourceKeys: ["cpcSeedTypes"],
        implementation: "seed-model.js -> hundredRule. Reported as an indicator with its sum, never used to scale longevity."
    },
    {
        area: "Hundred Rule",
        claim: "The commonly repeated 'and no more than half of that from temperature' clause is not carried.",
        support: "No archived source states it, including the CPC's statement of the rule. Adding an unsourced constraint to a heuristic would give it false precision.",
        sourceKeys: ["cpcSeedTypes"],
        implementation: "Absent from hundredRule by choice. Documented here so the omission reads as a decision."
    },
    {
        area: "Baseline",
        claim: "Published 'cool, dry' longevity figures are anchored to 5 C and 8% moisture content, and that anchor is a user input.",
        support: "G2090 and the vendor tables never define the conditions their year counts assume, yet every multiplier scales off that undefined baseline. 5 C / 8% MC sits inside the FAO medium-term band (5-10 C) and inside Harrington's valid moisture range, and is close to a domestic refrigerator with desiccant.",
        sourceKeys: ["unlG2090", "fao2014Standards", "harrington1972"],
        implementation: "seed-model.js -> DEFAULT_BASELINE. Exposed in the UI as editable baseline temperature and moisture so a user who disagrees can move it and watch every derived number move with it."
    },
    {
        area: "Seed counts",
        claim: "Where sources disagree on seed count, the tool shows every determination instead of averaging.",
        support: "32 of the 53 species with more than one count source disagree, from 1.32x up to 14.25x for coriander; lettuce spans 13.5x across three determinations. Averaging a transcription error with a correct value produces a number that is wrong and looks authoritative.",
        sourceKeys: ["unlG2090", "osborne", "johnnys"],
        implementation: "Generated data keeps one entry per source with its crop label. seed-model.js -> summariseCounts reports the spread and flags disagreement above 1.3x."
    },
    {
        area: "Scope",
        claim: "Where the resolved storage behaviour contradicts a lower-precedence source, the gate names the source it overruled.",
        support: "42 taxa resolve against a source that disagrees. Four leave a recalcitrant Carya or Juglans genus flag for an orthodox species record in the 1998 compendium and still receive a projection: pecan, shagbark hickory, shellbark hickory and little walnut. Species-level sourced data is the better evidence and stands, but discarding the loser hid a desiccation-sensitivity warning behind a clean result.",
        sourceKeys: ["ipgri1996", "kewCompendium1998"],
        implementation: "scripts/build-seed-species-data.py attaches the losing flag as behaviour.overruled. seed-model.js -> evaluateSpeciesGate appends it to the detail and drops an overruled recalcitrant flag from ok to caution."
    },
    {
        area: "Seed counts",
        claim: "Two G2090 seeds-per-ounce values are corrected before they reach the browser.",
        support: "Tomato and turnip seeds/oz are internally inconsistent with the seeds/gram column in the same table by a factor of ten. The seeds/gram column is self-consistent and matches other sources.",
        sourceKeys: ["unlG2090", "osborne"],
        implementation: "scripts/build-seed-species-data.py -> G2090_OZ_FROM_GRAM rebuilds seeds/oz from seeds/gram and stamps the entry with a visible correction note."
    },
    {
        area: "Viability constants",
        claim: "K_E, C_W, C_H and C_Q are bound together as one parameter set and never mixed across sources.",
        support: "Barley has two valid published parameterisations whose predictions differ by 3.66x. Taking K_E and C_W from one and C_H and C_Q from the other produces a third answer supported by nobody.",
        sourceKeys: ["ellisRoberts1980", "dickieEllis1990", "hayViabilityEquations"],
        implementation: "Each constants entry in the generated data carries all four values plus its own source. The engine takes a whole entry or none."
    },
    {
        area: "Viability constants",
        claim: "Lettuce K_E is corrected to 6.895 from the 6-985 printed in the scanned source.",
        support: "An OCR artefact in the Dickie & Ellis scan. Hay's worked examples reproduce 56,040 d and 12,404 d only with 6.895, and the 1996 compendium appendix independently prints 6.895.",
        sourceKeys: ["dickieEllis1990", "hayViabilityEquations", "kewAppendix1"],
        implementation: "scripts/build-seed-species-data.py -> KE_OVERRIDES. The CSV keeps the scan verbatim; only the bundle is corrected."
    },
    {
        area: "Viability equation",
        claim: "Germination against time comes from v = Ki - p/sigma with log10(sigma) = KE - CW log10(m) - CH t - CQ t^2.",
        support: "The improved viability equation of Ellis & Roberts 1980. m is moisture content in percent of fresh weight, t is degrees Celsius, p and sigma are days. Hay's three worked examples reproduce to the day and 65 of the 66 figures in the compendium's own longevity column reproduce within 3%.",
        sourceKeys: ["ellisRoberts1980", "hayViabilityEquations", "kewAppendix1", "ellis2022SST"],
        implementation: "seed-viability-engine.js -> sigmaDays, daysToNed, viabilityAfterDays. The engine works in normal equivalent deviates; the published probits are those plus 5."
    },
    {
        area: "Viability equation",
        claim: "Nothing is evaluated below -20 C, anything below -13 C is flagged as an extrapolation, and a set is held at its own turning point where that is warmer.",
        support: "Dickie et al. 1990 fitted the temperature term from -13 to 90 C, and Ellis 2022 states there is no evidence for extrapolating to the quadratic's optimum. The compendium and Hay both print values at -20 C, which is the coldest any archived source takes it. Five published sets have a turning point warmer than -25 C, below which the raw equation predicts that cooling shortens life.",
        sourceKeys: ["dickieEllis1990", "ellis2022SST", "kewAppendix1", "hayViabilityEquations"],
        implementation: "seed-viability-engine.js -> VIABILITY_LIMITS, turningPointC, resolveTemperature."
    },
    {
        area: "Viability equation",
        claim: "The moisture term is limited at both ends: a plateau below the low-moisture limit and a refusal above the upper one.",
        support: "The 1996 compendium, section 3.3: below a limit of about 2 to 6% moisture, further drying no longer increases longevity in hermetic storage (about 6% for pea and mung bean, 4.5% for rice and tef, 2% for sunflower, measured at 65 C); above about 15 to 28%, the equation no longer applies (15% lettuce, 18% onion, 22% elm and niger, 24 to 28% tef). Where a species limit is not recorded the tool flags the band.",
        sourceKeys: ["ipgri1996", "ellis2022SST"],
        implementation: "seed-viability-engine.js -> SPECIES_MOISTURE_LIMITS, resolveMoisture."
    },
    {
        area: "Viability equation",
        claim: "The equation is presented as a prediction for airtight storage only.",
        support: "It was developed from observations in hermetic storage and does not account for oxygen. Ellis 2022 reports that at low moisture contents longevity is far less in open than in hermetic storage.",
        sourceKeys: ["ellis2022SST", "ipgri1996"],
        implementation: "Stated on the result card, in the detail card and in the scope disclaimer. No open-storage correction is applied because none is published as an equation."
    },
    {
        area: "Scope",
        claim: "A woody species with no storage-behaviour record is withheld a Harrington projection but still runs the viability equation if constants exist.",
        support: "Published constants are fitted from experiments in which the seed was dried and stored, which is direct evidence it tolerates drying over the tested range. A recalcitrant, intermediate or not-applicable flag still refuses both models.",
        sourceKeys: ["kewAppendix1", "ipgri1996"],
        implementation: "seed-model.js -> evaluateViability. The result carries admittedByConstants and the card says so."
    },
    {
        area: "Storage tier",
        claim: "Lowering oxygen multiplies storage life by (20.9 / O2%)^0.782, held at 1% oxygen.",
        support: "Groot et al. 2025: each halving of oxygen extended the shelf life of primed celery 1.72-fold over 16 to 43% eRH and 5 to 30 C, and dropping to 1% gave about 11-fold. log2(1.72) = 0.782 reproduces both. Below 1% the oxygen meter's 1% error made the level uncertain, so nothing lower was modelled.",
        sourceKeys: ["groot2025Oxygen"],
        implementation: "seed-storage-tiers.js -> OXYGEN_EXPONENT, oxygenMultiplier."
    },
    {
        area: "Storage tier",
        claim: "The oxygen factor raises only the upper end of a projection, and is never applied to the viability equation.",
        support: "The effect was sized on one species. Groot et al. 2025 also report lettuce stored at 2% oxygen gaining only about 20% (Schwember & Bradford 2011), and some studies found no effect. The viability equation's constants come from sealed packets with an unmeasured amount of air.",
        sourceKeys: ["groot2025Oxygen"],
        implementation: "seed-model.js -> projectLongevity multiplies only years.high by storage.oxygen.multiplier."
    },
    {
        area: "Storage tier",
        claim: "The oxygen effect is full up to 43% RH, absent from 60%, and scaled in a straight line between.",
        support: "Groot et al. 2025 found the effect at 16, 33 and 43% eRH and hardly any at 60% eRH, none at 30 C. Nothing was measured between 43 and 60%; the straight line is the tool's assumption and is flagged when used.",
        sourceKeys: ["groot2025Oxygen"],
        implementation: "seed-storage-tiers.js -> OXYGEN_LIMITS, oxygenExponent."
    },
    {
        area: "Storage tier",
        claim: "Only a rubber ring, a lined twist-off lid or a vacuum foil bag is credited with holding its oxygen level.",
        support: "Groot et al. 2015 flushed jars with nitrogen and watched oxygen for three months. Kilner and jam jars held it; glass bottles and vessels with polypropylene or polybutylene terephthalate screw caps let it back in, with large variation. Silica gel stayed dry in all of them. Vacuum foil bags in a genebank had held their vacuum for at least 20 years.",
        sourceKeys: ["groot2015Anoxia"],
        implementation: "seed-storage-tiers.js -> CONTAINERS."
    },
    {
        area: "Storage tier",
        claim: "A sealed jar's oxygen falls exponentially at a rate scaled from 10 g of lettuce in a 47 mL jar, and no storage life is credited for it.",
        support: "Groot et al. 2015: oxygen fell to about a third in a year, exponentially, at 20 C and 39% RH. Their 2025 paper retells the same jar as 74 mL; the 2015 methods give 47 mL and an 18 mL seed volume, and the 2015 figure reproduces the 2025 time points. The seed spends its antioxidants using the oxygen, which Groot et al. 2015 name as a cost.",
        sourceKeys: ["groot2015Anoxia", "groot2025Oxygen"],
        implementation: "seed-storage-tiers.js -> LETTUCE_UPTAKE, uptakeConstant, decayPerDay. The curve is drawn; projectLongevity uses only the starting level."
    },
    {
        area: "Storage tier",
        claim: "An oxygen absorber without a desiccant is refused, and sealing seed above 50% RH or at 12% moisture or more is blocked.",
        support: "In a jar with an absorber and no desiccant RH reached 88% within two days, and primed celery with an absorber alone did no better than without one (Groot et al. 2015, 17 days at 35 C, an accelerated-ageing test). Okra sealed at 14% moisture lost all germination in six months and 12% was not recommended (Bakhtavar et al. 2023). Groot et al. 2025 advise drying below about 50% eRH before sealing.",
        sourceKeys: ["groot2015Anoxia", "bakhtavar2023Okra", "groot2025Oxygen"],
        implementation: "seed-storage-tiers.js -> SEALING_LIMITS and the absorber-only tier. seed-model.js withholds the projection and the viability equation for absorber-only."
    },
    {
        area: "Storage tier",
        claim: "Pelleted seed is capped at one year and primed seed gets no storage-life projection.",
        support: "Johnny's: pelleted seed of any variety should be used within one year, and its storage figures are for raw seed. Primed seed ages faster, and primed celery can lose commercial quality within weeks at room conditions (Groot et al. 2025); no published figure gives a primed storage life.",
        sourceKeys: ["johnnys", "groot2025Oxygen"],
        implementation: "seed-storage-tiers.js -> evaluateStorage override. seed-model.js -> projectLongevity and evaluateViability."
    },
    {
        area: "Storage tier",
        claim: "For storage under four years the tool says oxygen control may not show.",
        support: "Yildirim et al. 2021: pepper vacuum-sealed or in perforated cheesecloth at 13 C and 35% RH for 48 months. Vacuum was significantly better for all four cultivars at 48 months; for three of them the difference was not significant at 12, 24 or 36 months, and Yaglik separated from 24 months.",
        sourceKeys: ["yildirim2021Vacuum"],
        implementation: "seed-storage-tiers.js -> VACUUM_PAYOFF_MONTHS, the short-horizon note."
    },
    {
        area: "Monte Carlo",
        claim: "The viability result is given as P10 to P90 over the user's own uncertainty, per determination, never as one date.",
        support: "Moisture and temperature are drawn evenly from the range the user states, and the lot's true germination from the Jeffreys posterior for a test of the stated size. The same draws feed every determination, so they differ only by their constants, and their bands are drawn separately. With every spread at zero the band closes onto the point estimate.",
        sourceKeys: ["hayViabilityEquations", "kewAppendix1"],
        implementation: "seed-monte-carlo.js -> runViabilityMonteCarlo, drawInputs, germinationPosterior."
    },
    {
        area: "Monte Carlo",
        claim: "The published constants' standard errors are not sampled.",
        support: "Standard errors are published for some sets, but K_E and C_W are the intercept and slope of one regression of log sigma on log moisture, so they are strongly correlated and the covariance is not published. Sampling them independently would widen the band with variation the data do not contain. Differences between determinations are shown as separate bands instead.",
        sourceKeys: ["kewAppendix1", "ellisRoberts1980"],
        implementation: "Absent from seed-monte-carlo.js by choice; stated in the viability detail card."
    },
    {
        area: "Monte Carlo",
        claim: "The random number generator is a seeded xorshift32, copied from the Creatine Lab.",
        support: "Deterministic for a given seed, so a band can be reproduced and tested. It is a copy, so the two tools stay independent; the spec checks the copy draws the same sequence as the original.",
        sourceKeys: ["hayViabilityEquations"],
        implementation: "seed-monte-carlo.js -> createSeededRandom, percentile."
    },
    {
        area: "Measured mode",
        claim: "A user-counted sample beats any lookup table.",
        support: "Published seed counts vary with cultivar, seed lot, growing season and cleaning standard. A count from the packet in hand has none of that error.",
        sourceKeys: ["nrcsTx", "figshareTsw"],
        implementation: "seed-model.js -> countFromMeasurement. When a measured count is supplied it takes precedence, and the lookup value is shown alongside as a cross-check with the ratio between them."
    }
]);

export function getSeedReference(key) {
    return SEED_REFERENCES[key] || null;
}

export function getSeedAuditRows() {
    return SEED_CLAIM_AUDIT.map((claim) => ({
        ...claim,
        sources: claim.sourceKeys.map((key) => SEED_REFERENCES[key]).filter(Boolean)
    }));
}
