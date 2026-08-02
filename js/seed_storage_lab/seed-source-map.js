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
        kind: "extension"
    },
    osborne: {
        label: "Osborne Quality Seeds seed count chart",
        url: "https://www.osborneseed.com/pages/seed-count-chart",
        kind: "vendor"
    },
    johnnys: {
        label: "Johnny's Selected Seeds storage guidelines",
        url: "https://www.johnnyseeds.com/growers-library/reference-documents/seed-storage-guidelines.html",
        kind: "vendor"
    },
    wpsm: {
        label: "Woody Plant Seed Manual (USDA FS Agriculture Handbook 727)",
        url: "https://rngr.net/publications/wpsm",
        kind: "handbook"
    },
    nrcsTx: {
        label: "NRCS Texas Technical Note TX-PM-12-02",
        url: "https://www.nrcs.usda.gov/plantmaterials/etpmctn10736.pdf",
        kind: "agency"
    },
    figshareTsw: {
        label: "Toro-Szijgyarto et al. 2022, thousand-seed weight dataset (Central Europe)",
        url: "https://doi.org/10.6084/m9.figshare.19391184",
        kind: "dataset"
    },

    // ---- Viability equation constants ------------------------------------
    kewAppendix1: {
        label: "Hong, Linington & Ellis 1996, Compendium Appendix I",
        url: "https://cgspace.cgiar.org/items/9148afd5-2def-4ae8-bb01-567eaff5c538",
        kind: "handbook"
    },
    dickieEllis1990: {
        label: "Dickie & Ellis 1990, Ann. Bot. 65:197-204",
        url: "https://doi.org/10.1093/oxfordjournals.aob.a087924",
        kind: "paper"
    },
    demir2009Pepper: {
        label: "Demir et al. 2009, HortScience 44:1679-1682",
        url: "https://doi.org/10.21273/HORTSCI.44.6.1679",
        kind: "paper"
    },
    demir2011Cucurbits: {
        label: "Demir et al. 2011, Seed Sci. Technol. 39:527-532",
        url: "https://doi.org/10.15258/sst.2011.39.2.23",
        kind: "paper"
    },
    ellisBaumLentil: {
        label: "Whitehouse & Norton 2022, Seed Sci. Technol. 50:103-115",
        url: "https://doi.org/10.15258/sst.2022.50.1.09",
        kind: "paper"
    },
    ellisRoberts1980: {
        label: "Ellis & Roberts 1980, Ann. Bot. 45:13-30",
        url: "https://doi.org/10.1093/oxfordjournals.aob.a085797",
        kind: "paper"
    },
    hayViabilityEquations: {
        label: "Hay, The Seed Viability Equations (RBG Kew)",
        url: "http://data.kew.org/sid/viability/SeedViabilityEquationsFHDec04.pdf",
        kind: "handbook"
    },
    ellis2022SST: {
        label: "Ellis 2022, Seed Sci. Technol. 50(Suppl.1):1-20",
        url: "https://doi.org/10.15258/sst.2022.50.1.s.01",
        kind: "paper"
    },

    // ---- Storage behaviour -----------------------------------------------
    ipgri1996: {
        label: "Hong, Linington & Ellis 1996, Seed Storage Behaviour: a Compendium",
        url: "https://cgspace.cgiar.org/items/9148afd5-2def-4ae8-bb01-567eaff5c538",
        kind: "handbook"
    },
    kewCompendium1998: {
        label: "Hong, Linington & Ellis 1998, Compendium of information on seed storage behaviour, Vol. 2 (I-Z)",
        url: "https://cgspace.cgiar.org/items/843236ec-eb72-4cca-ba41-90845f23333f",
        kind: "handbook"
    },

    // ---- Storage conditions and the multiplier model ----------------------
    harrington1972: {
        label: "Harrington 1972, Seed Storage and Longevity, in Seed Biology Vol. 3",
        url: "https://doi.org/10.1016/B978-0-12-424303-3.50007-1",
        kind: "book chapter"
    },
    fao2014Standards: {
        label: "FAO 2014, Genebank Standards for Plant Genetic Resources for Food and Agriculture",
        url: "https://www.fao.org/4/i3704e/i3704e.pdf",
        kind: "standard"
    },
    groot2015Anoxia: {
        label: "Groot et al. 2015, Plant Genet. Resour. 13:18-26",
        url: "https://doi.org/10.1017/S1479262114000586",
        kind: "paper"
    },
    groot2025Oxygen: {
        label: "Groot et al. 2025, Plant J. (oxygen effect on seed longevity)",
        url: "https://doi.org/10.1111/tpj.70066",
        kind: "paper"
    },
    deVitis2020: {
        label: "De Vitis et al. 2020, Restor. Ecol. 28:S249-S255",
        url: "https://doi.org/10.1111/rec.13174",
        kind: "paper"
    },
    solberg2020: {
        label: "Solberg et al. 2020, Front. Plant Sci. 11:1007",
        url: "https://doi.org/10.3389/fpls.2020.01007",
        kind: "paper"
    },
    whitehouse2018: {
        label: "Whitehouse et al. 2018, Plant Cell Environ. 41:2543-2553",
        url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6204563/",
        kind: "paper"
    },
    mdpiSeeds2024: {
        label: "Seeds 2024, 3(1):5 - storage conditions, deterioration and longevity",
        url: "https://doi.org/10.3390/seeds3010005",
        kind: "paper"
    },
    usdaAH506: {
        label: "Justice & Bass 1978, Principles and Practices of Seed Storage (USDA AH-506)",
        url: "https://www.govinfo.gov/content/pkg/GOVPUB-A-PURL-gpo28758/pdf/GOVPUB-A-PURL-gpo28758.pdf",
        kind: "handbook"
    },
    yildirim2021Vacuum: {
        label: "Yildirim, Ozturk & Demir 2021, Hortic. Stud. 38:71-76",
        url: "https://doi.org/10.16882/HortiS.998078",
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
        support: "Recalcitrant seeds die on drying and cannot be stored dry at all; intermediate seeds tolerate partial drying but not cold. Applying Harrington or Ellis-Roberts to them predicts decades of life for an acorn that is dead in a season.",
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
        support: "Harrington's two rules of thumb, restated by extension and genebank sources ever since.",
        sourceKeys: ["harrington1972", "usdaAH506", "mdpiSeeds2024"],
        implementation: "seed-model.js -> harringtonMultiplier. life = 2^(dMC) x 2^(dT_F/10)."
    },
    {
        area: "Harrington",
        claim: "The rules are only applied between 0-40 C and 5-14% moisture content.",
        support: "Harrington stated the rules as thumb-rules over ordinary storage conditions. Below about 5% MC the relationship inverts for some species and above 14% respiration and fungi dominate; below 0 C the rule overpredicts badly against the Ellis-Roberts data.",
        sourceKeys: ["harrington1972", "ellisRoberts1980", "hayViabilityEquations"],
        implementation: "seed-model.js -> HARRINGTON_LIMITS. Inputs outside the box are clamped and the result carries an out-of-range warning that names the binding limit."
    },
    {
        area: "Hundred Rule",
        claim: "Storage temperature in F plus relative humidity in percent should total under 100.",
        support: "The standard seed-saving rule of thumb. It is a screening heuristic with no species term and no time term.",
        sourceKeys: ["usdaAH506", "mdpiSeeds2024"],
        implementation: "seed-model.js -> hundredRule. Reported as an indicator with its sum, never used to scale longevity."
    },
    {
        area: "Hundred Rule",
        claim: "The commonly repeated 'and no more than half of that from temperature' clause is not carried.",
        support: "No primary source states it. It appears only in secondary garden writing, and adding an unsourced constraint to a heuristic would give it false precision.",
        sourceKeys: ["usdaAH506"],
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
