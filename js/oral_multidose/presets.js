// Preset dosing regimens for the Oral Multi-Dose Simulator.
// Each entry carries PK parameters plus sourced reference links.

export const PRESETS = {
    coffee: {
        name: "Coffee (oral, IR, 1 cup)",
        halfLife: 5,
        halfLifeRange: [1.5, 9.5],
        tmax: 0.5,
        tmaxRange: [0.25, 2],
        bioavailability: 1.0,
        tLag: 0,
        doseForm: "IR",
        paramMode: "B",
        dose: 95,
        tau: 4,
        notes: "Caffeine: rapid oral absorption, F≈1. Half-life varies widely (1.5-9.5h) due to CYP1A2 polymorphisms.",
        refs: [
            { label: "R1", url: "https://www.ncbi.nlm.nih.gov/books/NBK223808/", text: "NCBI Bookshelf" },
            { label: "R2", url: "https://pubmed.ncbi.nlm.nih.gov/6832208/", text: "Blanchard 1983" }
        ],
        isOral: true
    },
    caffeine: {
        name: "Caffeine (oral, IR, standard pill)",
        halfLife: 5,
        halfLifeRange: [1.5, 9.5],
        tmax: 0.5,
        tmaxRange: [0.25, 2],
        bioavailability: 1.0,
        tLag: 0,
        doseForm: "IR",
        paramMode: "B",
        dose: 200,
        tau: 6,
        notes: "Caffeine: rapid oral absorption, F≈1. Half-life varies widely (1.5-9.5h) due to CYP1A2 polymorphisms.",
        refs: [
            { label: "R1", url: "https://www.ncbi.nlm.nih.gov/books/NBK223808/", text: "NCBI Bookshelf" },
            { label: "R2", url: "https://pubmed.ncbi.nlm.nih.gov/6832208/", text: "Blanchard 1983" }
        ],
        isOral: true
    },
    aspirin_ir: {
        name: "Aspirin → Salicylate (IR/Chewable)",
        halfLife: 3,  // Salicylate half-life, not intact ASA
        halfLifeRange: [2, 4],
        tmax: 0.5,  // Approximate for salicylate formation
        tmaxRange: [0.3, 1],
        bioavailability: 0.7,
        tLag: 0,
        doseForm: "IR",
        paramMode: "B",
        dose: 325,
        tau: 4,
        notes: "Models SALICYLATE metabolite (t½≈2-4h). Intact ASA t½≈20min; salicylate is the relevant analyte for accumulation. F≈0.7 accounts for first-pass.",
        refs: [
            { label: "R4", url: "https://www.ahajournals.org/doi/10.1161/01.cir.101.10.1206", text: "Circulation review" },
            { label: "R6", url: "https://pubmed.ncbi.nlm.nih.gov/25402445/", text: "Hobl 2015" }
        ],
        isOral: true,
        analyteNote: "Modeling salicylate, not intact ASA"
    },
    aspirin_ec: {
        name: "Aspirin → Salicylate (Enteric-Coated)",
        halfLife: 3,
        halfLifeRange: [2, 4],
        tmax: 4,
        tmaxRange: [2, 6],
        bioavailability: 0.7,
        tLag: 2,
        doseForm: "Delayed",
        paramMode: "B",
        dose: 325,
        tau: 8,
        notes: "Enteric coating delays absorption variably (1-6h lag). Models SALICYLATE. High inter-individual variability - enable uncertainty mode.",
        refs: [
            { label: "R7", url: "https://jamanetwork.com/journals/jama/fullarticle/656005", text: "JAMA 1965" },
            { label: "R8", url: "https://link.springer.com/article/10.1007/s11239-020-02051-5", text: "Angiolillo 2020" }
        ],
        isOral: true,
        analyteNote: "Modeling salicylate, not intact ASA"
    },
    ibuprofen: {
        name: "Ibuprofen (oral, IR)",
        halfLife: 2,
        halfLifeRange: [1.8, 2.5],
        tmax: 1.5,
        tmaxRange: [0.6, 1.9],
        bioavailability: 0.9,
        tLag: 0,
        doseForm: "IR",
        paramMode: "B",
        dose: 400,
        tau: 6,
        numDoses: 5,
        notes: "Short half-life (~2h) NSAID with rapid, near-complete oral absorption. At q6h dosing the accumulation ratio stays near 1: little carryover between doses.",
        refs: [
            { label: "IBU1", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4355401/", text: "PharmGKB: ibuprofen pathways" },
            { label: "IBU2", url: "https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=ibuprofen", text: "DailyMed label" }
        ],
        isOral: true
    },
    acetaminophen: {
        name: "Acetaminophen / Paracetamol (oral, IR)",
        halfLife: 2.5,
        halfLifeRange: [1.9, 3],
        tmax: 0.75,
        tmaxRange: [0.5, 1.5],
        bioavailability: 0.88,
        tLag: 0,
        doseForm: "IR",
        paramMode: "B",
        dose: 1000,
        tau: 6,
        numDoses: 5,
        notes: "Short half-life (~2-3h) analgesic with rapid oral absorption (peak 30-60 min). Systemic bioavailability is dose-dependent (~70-90%) due to first-pass metabolism; this model uses a single F.",
        refs: [
            { label: "APAP1", url: "https://pubmed.ncbi.nlm.nih.gov/7039926/", text: "Forrest et al 1982, Clinical PK of paracetamol" },
            { label: "APAP2", url: "https://www.ncbi.nlm.nih.gov/books/NBK482369/", text: "StatPearls: Acetaminophen" }
        ],
        isOral: true
    },
    theophylline: {
        name: "Theophylline (oral, IR)",
        halfLife: 8,
        halfLifeRange: [4, 12],
        tmax: 1.5,
        tmaxRange: [1, 2],
        bioavailability: 1.0,
        tLag: 0,
        doseForm: "IR",
        paramMode: "B",
        dose: 300,
        tau: 12,
        numDoses: 6,
        notes: "Classic narrow-therapeutic-window drug with wide half-life variability (3-16h; shorter in smokers). Near-complete oral bioavailability, no measurable first-pass. Switch to the ER dose form to see peak-trough smoothing.",
        refs: [
            { label: "THEO1", url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=02fcc06e-2a81-404f-a7cd-313fcb0d833c", text: "DailyMed: Theophylline" },
            { label: "THEO2", url: "https://pubmed.ncbi.nlm.nih.gov/7361576/", text: "Bioavailability of oral theophylline" }
        ],
        isOral: true
    },
    theophylline_er: {
        name: "Theophylline (oral, Extended-Release)",
        halfLife: 8,
        halfLifeRange: [4, 12],
        tmax: 6,
        tmaxRange: [4, 12],
        bioavailability: 1.0,
        tLag: 0,
        doseForm: "ER",
        tRel: 10,
        paramMode: "C",
        ka: 4,
        dose: 400,
        tau: 12,
        numDoses: 6,
        notes: "Extended-release theophylline: drug is released over ~10-12h, flattening the peak-trough swing versus the IR tablet at the same total daily dose. Compare against the IR preset.",
        refs: [
            { label: "THEO3", url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=04f1d1da-ce61-45b3-acf4-903cc81d16da&type=display", text: "DailyMed: Theophylline ER tablets" },
            { label: "THEO2", url: "https://pubmed.ncbi.nlm.nih.gov/7361576/", text: "Bioavailability of oral theophylline" }
        ],
        isOral: true
    },
    amlodipine: {
        name: "Amlodipine (oral, once-daily)",
        halfLife: 40,
        halfLifeRange: [30, 50],
        tmax: 8,
        tmaxRange: [6, 12],
        bioavailability: 0.64,
        tLag: 0,
        doseForm: "IR",
        paramMode: "B",
        dose: 10,
        tau: 24,
        numDoses: 10,
        notes: "Long terminal half-life (~30-50h) calcium-channel blocker. Steady state is reached only after ~7-8 days of once-daily dosing: a clear picture of slow accumulation toward plateau.",
        refs: [
            { label: "AML1", url: "https://www.ncbi.nlm.nih.gov/books/NBK519508/", text: "StatPearls: Amlodipine" },
            { label: "AML2", url: "https://pubmed.ncbi.nlm.nih.gov/1532771/", text: "Clinical PK of amlodipine" }
        ],
        isOral: true
    },
    digoxin: {
        name: "Digoxin (oral tablet, once-daily)",
        halfLife: 42,
        halfLifeRange: [36, 48],
        tmax: 2,
        tmaxRange: [1, 3],
        bioavailability: 0.7,
        tLag: 0,
        doseForm: "IR",
        paramMode: "B",
        dose: 0.25,
        tau: 24,
        numDoses: 10,
        notes: "Narrow-therapeutic-index cardiac glycoside with a long half-life (~36-48h), which motivates loading doses in practice. Note: digoxin has a pronounced 6-8h tissue-distribution phase (multi-compartment) that this single-compartment model does not capture.",
        refs: [
            { label: "DIG1", url: "https://www.ncbi.nlm.nih.gov/books/NBK556025/", text: "StatPearls: Digoxin" },
            { label: "DIG2", url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=76452d5a-fd30-4185-8bea-6bbff05990b9&type=display", text: "DailyMed: Digoxin Tablets" }
        ],
        isOral: true,
        analyteNote: "Single-compartment approximation; ignores the 6-8h tissue distribution phase"
    },
    metformin: {
        name: "Metformin (oral, IR)",
        halfLife: 5,
        halfLifeRange: [4, 7],
        tmax: 2.5,
        tmaxRange: [2, 3],
        bioavailability: 0.55,
        tLag: 0,
        doseForm: "IR",
        paramMode: "B",
        dose: 1000,
        tau: 12,
        numDoses: 6,
        notes: "Antihyperglycemic with incomplete, transporter-mediated (OCT) oral bioavailability (~55%) and a ~5h plasma half-life. Illustrates how partial F scales the amount reaching the central compartment.",
        refs: [
            { label: "MET1", url: "https://pubmed.ncbi.nlm.nih.gov/21241070/", text: "Graham 2011, Clinical PK of metformin" },
            { label: "MET2", url: "https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=metformin", text: "DailyMed label" }
        ],
        isOral: true
    },
    fluoxetine: {
        name: "Fluoxetine (oral, once-daily)",
        halfLife: 72,
        halfLifeRange: [24, 96],
        tmax: 7,
        tmaxRange: [6, 8],
        bioavailability: 0.8,
        tLag: 0,
        doseForm: "IR",
        paramMode: "B",
        dose: 20,
        tau: 24,
        numDoses: 14,
        notes: "SSRI with a very long parent half-life (1-4 days), so accumulation continues for weeks. Its active metabolite norfluoxetine (half-life 7-15 days) is NOT modeled here, so real steady state takes even longer than this single-compartment view suggests.",
        refs: [
            { label: "FLX1", url: "https://www.ncbi.nlm.nih.gov/books/NBK459223/", text: "StatPearls: Fluoxetine" },
            { label: "FLX2", url: "https://pubmed.ncbi.nlm.nih.gov/8194283/", text: "Clinical PK of fluoxetine" }
        ],
        isOral: true,
        analyteNote: "Parent drug only; active metabolite norfluoxetine (t1/2 7-15 days) not modeled"
    },
    phenytoin: {
        name: "Phenytoin (oral, saturable / Michaelis-Menten)",
        halfLife: 22,
        halfLifeRange: [7, 42],
        tmax: 6,
        tmaxRange: [4, 12],
        bioavailability: 0.9,
        tLag: 0,
        doseForm: "IR",
        paramMode: "C",
        ka: 0.8,
        dose: 300,
        tau: 24,
        numDoses: 14,
        elimMode: "mm",
        Vmax: 20,   // mg/h; adult ~6.9 mg/kg/day x 70 kg / 24
        Km: 290,    // mg (amount); ~6.4 mg/L x Vd ~45 L
        notes: "Classic saturable (Michaelis-Menten) elimination: below ~10 mg/L phenytoin clears first-order (t½≈22h), but the metabolizing enzymes saturate near the therapeutic window, so clearance turns zero-order. The consequence is dramatic nonlinearity: try raising the dose from 300 to 400 mg/day and watch the plateau jump far more than proportionally. Vmax≈20 mg/h and Km≈290 mg (amount) here follow adult population means (Vmax 6.9 mg/kg/day, Km 6.4 mg/L, Vd≈45 L). Set Vd≈45 L for mg/L output.",
        refs: [
            { label: "PHT1", url: "https://www.ncbi.nlm.nih.gov/books/NBK551520/", text: "StatPearls: Phenytoin (first-order below 10 mg/L, zero-order at saturation)" },
            { label: "PHT2", url: "https://pubmed.ncbi.nlm.nih.gov/2714918/", text: "el-Sayed & Islam 1989, adult Vmax 6.91 mg/kg/day, Km 6.44 mg/L" }
        ],
        isOral: true,
        analyteNote: "Saturable elimination; entered half-life is only the low-concentration first-order value, not used by the nonlinear model"
    },
    ethanol: {
        name: "Ethanol (oral, zero-order elimination)",
        halfLife: 4,
        halfLifeRange: [2, 6],
        tmax: 0.6,
        tmaxRange: [0.5, 1.5],
        bioavailability: 0.9,
        tLag: 0,
        doseForm: "IR",
        paramMode: "C",
        ka: 6,
        dose: 14000,   // one US standard drink ~14 g ethanol, in mg
        tau: 1,
        numDoses: 4,
        elimMode: "zero",
        k0: 7000,      // mg/h constant clearance (~7 g/h for a 70 kg adult)
        notes: "The textbook zero-order drug: once the first few grams saturate alcohol dehydrogenase, ethanol leaves at a near-constant ~7 g/h (≈0.15 g/L/h) regardless of how much is on board, so blood levels fall in a straight line, not an exponential. One \"dose\" here is one standard drink (~14 g). Drinking faster than the body clears (q1h) stacks the linear declines into a rising sawtooth. Set Vd≈42 L for a rough BAC in mg/L (divide by 1000 for g/L).",
        refs: [
            { label: "ETH1", url: "https://pubmed.ncbi.nlm.nih.gov/20304569/", text: "Jones 2010, zero-order blood ethanol, 10-35 mg/100mL/h" },
            { label: "ETH2", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3484320/", text: "Cederbaum 2012, ~7 g/h metabolic capacity (70 kg)" }
        ],
        isOral: true,
        analyteNote: "Zero-order (constant-rate) elimination; entered half-life is not used by the model"
    },
    tobacco: {
        name: "Tobacco (Smoke) - Nicotine Comparator",
        halfLife: 2,
        halfLifeRange: [2, 3],
        tmax: 0.05,  // ~3 minutes
        tmaxRange: [0.033, 0.083],
        bioavailability: 1.0,
        tLag: 0,
        doseForm: "IR",
        paramMode: "C",  // Use direct ka since Tmax is so fast
        ka: 120,  // Very fast absorption
        dose: 1,  // ~1mg nicotine per cigarette absorbed
        tau: 1,
        notes: "NOT ORAL - Inhalation comparator only. Shows very fast absorption (Tmax 2-5 min). For educational contrast with oral routes.",
        refs: [
            { label: "R9", url: "https://www.ncbi.nlm.nih.gov/books/NBK222359/", text: "NCBI Bookshelf" },
            { label: "R10", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4749433/", text: "St Helen 2015" }
        ],
        isOral: false,
        bannerText: "NOT ORAL - inhalation comparator only (Tmax 2-5 min)",
        healthWarning: "Tobacco use causes cancer, heart disease, and death. This preset is for educational comparison only."
    },
    iv_bolus: {
        name: "IV Bolus (idealized reference)",
        halfLife: 6,
        halfLifeRange: [3, 12],
        tmax: 0.01,
        tmaxRange: [0.01, 0.05],
        bioavailability: 1.0,
        tLag: 0,
        doseForm: "IR",
        paramMode: "C",
        ka: 100,  // near-instant absorption approximates an IV bolus
        dose: 100,
        tau: 6,
        numDoses: 6,
        notes: "NOT A DRUG: an idealized IV bolus (near-instant absorption, F=1). This is the exact case for the classic accumulation factor R = 1 / (1 - e^(-ke*tau)); use it to check the multi-dose intuition against the closed form.",
        refs: [],
        isOral: false,
        bannerText: "IDEALIZED REFERENCE - near-instant IV bolus, not an oral drug"
    }
};
