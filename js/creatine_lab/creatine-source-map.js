export const CREATINE_REFERENCES = Object.freeze({
    jager2011: {
        label: "Jager et al. 2011",
        url: "https://link.springer.com/article/10.1007/s00726-011-0874-6"
    },
    fdaGras931: {
        label: "FDA GRN 931",
        url: "https://www.fda.gov/media/143525/download?attachment="
    },
    ganguly2003: {
        label: "Ganguly et al. 2003",
        url: "https://link.springer.com/article/10.1208/pt040225"
    },
    uzzan2009: {
        label: "Uzzan et al. 2009",
        url: "https://doi.org/10.1080/03639040902755197"
    },
    harris2002: {
        label: "Harris et al. 2002",
        url: "https://www.unboundmedicine.com/medline/citation/11811571/Absorption_of_creatine_supplied_as_a_drink_in_meat_or_in_solid_form_"
    },
    hultman1996: {
        label: "Hultman et al. 1996",
        url: "https://www.paulogentil.com/pdf/Muscle%20creatine%20loading%20in%20men.pdf"
    },
    cooper2012: {
        label: "Cooper et al. 2012",
        url: "https://link.springer.com/article/10.1186/1550-2783-9-33"
    },
    ncbiCreatine: {
        label: "NCBI Bookshelf",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK209321/"
    },
    sagayama2023: {
        label: "Sagayama et al. 2023",
        url: "https://doi.org/10.1038/s41430-022-01237-9"
    },
    clark2014: {
        label: "Clark et al. 2014",
        url: "https://doi.org/10.1152/japplphysiol.00045.2014"
    },
    pagano2024: {
        label: "Pagano et al. 2024",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10959434/"
    },
    wang1996: {
        label: "Wang et al. 1996",
        url: "https://pubmed.ncbi.nlm.nih.gov/8886329/"
    },
    dechent1999: {
        label: "Dechent et al. 1999",
        url: "https://pubmed.ncbi.nlm.nih.gov/10484486/"
    },
    ohtsuki2002: {
        label: "Ohtsuki et al. 2002",
        url: "https://journals.sagepub.com/doi/10.1097/01.WCB.0000033966.83623.7D"
    },
    forbes2022: {
        label: "Forbes et al. 2022",
        url: "https://www.mdpi.com/2072-6643/14/5/921"
    },
    issn2017: {
        label: "ISSN position stand 2017",
        url: "https://link.springer.com/article/10.1186/s12970-017-0173-z"
    },
    burke2003: {
        label: "Burke et al. 2003",
        url: "https://pubmed.ncbi.nlm.nih.gov/14600563/"
    },
    lukaszuk2002: {
        label: "Lukaszuk et al. 2002",
        url: "https://pubmed.ncbi.nlm.nih.gov/12432177/"
    },
    solis2017: {
        label: "Solis et al. 2017",
        url: "https://pubmed.ncbi.nlm.nih.gov/28572496/"
    },
    // Slug kept as brosnan2011 for legacy compatibility; paper is actually 2007.
    brosnan2011: {
        label: "Brosnan & Brosnan 2007",
        url: "https://pubmed.ncbi.nlm.nih.gov/17430086/"
    },
    walker1979: {
        label: "Walker 1979",
        url: "https://pubmed.ncbi.nlm.nih.gov/386719/"
    },
    heymsfield1983: {
        label: "Heymsfield et al. 1983",
        url: "https://pubmed.ncbi.nlm.nih.gov/6829490/"
    },
    marsaglia2003: {
        label: "Marsaglia 2003 (xorshift)",
        url: "https://www.jstatsoft.org/article/view/v008i14"
    },
    harris1992: {
        label: "Harris, Soderlund, Hultman 1992",
        url: "https://pubmed.ncbi.nlm.nih.gov/1327657/"
    },
    greenhaff1994: {
        label: "Greenhaff et al. 1994",
        url: "https://pubmed.ncbi.nlm.nih.gov/8203511/"
    },
    persky2001: {
        label: "Persky & Brazeau 2001",
        url: "https://pubmed.ncbi.nlm.nih.gov/11356982/"
    },
    persky2003: {
        label: "Persky, Brazeau, Hochhaus 2003",
        url: "https://pubmed.ncbi.nlm.nih.gov/12793840/"
    },
    vandenberghe1997: {
        label: "Vandenberghe et al. 1997",
        url: "https://pubmed.ncbi.nlm.nih.gov/9390981/"
    },
    schedel1999: {
        label: "Schedel et al. 1999",
        url: "https://pubmed.ncbi.nlm.nih.gov/10622230/"
    }
});

export const CREATINE_CLAIM_AUDIT = Object.freeze([
    {
        area: "Scope",
        claim: "V1 models creatine monohydrate only.",
        support: "Direct scope decision supported by the larger evidence base for creatine monohydrate.",
        sourceKeys: ["jager2011", "cooper2012"],
        implementation: "The UI, conversions, solubility table, and body-pool dose inputs all use creatine monohydrate grams."
    },
    {
        area: "Unit basis",
        claim: "Creatine monohydrate is treated as 87.9% active creatine equivalent.",
        support: "Direct literature value.",
        sourceKeys: ["jager2011"],
        implementation: "ACTIVE_CREATINE_FRACTION = 0.879."
    },
    {
        area: "Solubility",
        claim: "5 g in 1 L at 20 deg C is fully dissolved at equilibrium by the model.",
        support: "Calculated from the 14 g/L at 20 deg C solubility anchor.",
        sourceKeys: ["jager2011"],
        implementation: "Default bottle preset and sanity check."
    },
    {
        area: "Solubility",
        claim: "5 g in 250 mL at 20 deg C leaves about 1.5 g suspended.",
        support: "Calculated from the same 14 g/L at 20 deg C solubility anchor.",
        sourceKeys: ["jager2011"],
        implementation: "Small glass preset and smoke test."
    },
    {
        area: "Storage",
        claim: "Dry powder mode should not use the aqueous degradation model.",
        support: "Direct stability distinction: dry creatine monohydrate powder is stable under normal dry storage; aqueous solution can degrade.",
        sourceKeys: ["jager2011", "fdaGras931"],
        implementation: "Dry powder storage returns zero aqueous loss."
    },
    {
        area: "Storage",
        claim: "Aqueous creatine degradation depends strongly on pH, temperature, and time.",
        support: "Direct stability statements from Jager/FDA and kinetic support from Uzzan et al.",
        sourceKeys: ["jager2011", "fdaGras931", "uzzan2009"],
        implementation: "Storage model uses pH anchors and a temperature adjustment."
    },
    {
        area: "Storage",
        claim: "At 25 deg C and 3 days, pH 5.5, 4.5, and 3.5 correspond to about 4%, 12%, and 21% loss.",
        support: "Direct reported anchor values. The model should not extrapolate this trend to stronger acids because very low pH can limit creatine-to-creatinine cyclization.",
        sourceKeys: ["fdaGras931", "jager2011"],
        implementation: "REPORTED_PH_DEGRADATION_ANCHORS and pH 4.5 sanity check; custom pH is limited to 3.5 to 8. Neutral pH uses low qualitative model points, not reported numeric anchors."
    },
    {
        area: "Storage",
        claim: "First-order decay is a reasonable V1 approximation for dissolved creatine loss.",
        support: "Uzzan et al. reported first-order behavior until degradation began to level beyond roughly the first half-life in pH 4.0 buffer/glycerol systems.",
        sourceKeys: ["uzzan2009"],
        implementation: "remaining = initial * exp(-k * days); long storage beyond the 3-day pH anchors is labeled as extrapolated."
    },
    {
        area: "Storage",
        claim: "Q10 temperature adjustment is an engineering approximation, not a direct plain-water fitted parameter.",
        support: "Uzzan et al. support Arrhenius temperature dependence in their studied system; Q10 = 2 is a conservative UI simplification.",
        sourceKeys: ["uzzan2009"],
        implementation: "k_T = k_25C * Q10 ^ ((T - 25) / 10), with extrapolation labels."
    },
    {
        area: "Storage",
        claim: "Long storage of premixed effervescent/acidic creatine solutions can cause large losses.",
        support: "Ganguly et al. observed large 45-day losses in effervescent di-creatine citrate solutions at 25 and 4 deg C; this is not plain neutral creatine monohydrate water.",
        sourceKeys: ["ganguly2003"],
        implementation: "Long-storage warning context only; not used as the neutral-water or plain creatine monohydrate rate fit."
    },
    {
        area: "Absorption caveat",
        claim: "Undissolved or suspended creatine is not automatically wasted if consumed promptly.",
        support: "Harris et al. found solid or suspension creatine was still readily absorbed, though with lower peak and AUC than solution.",
        sourceKeys: ["harris2002"],
        implementation: "Mix result labels suspended powder as grit/suspension, not unavailable dose."
    },
    {
        area: "Body pool",
        claim: "The manual 120 g baseline fallback is a conservative centerline for a 70 kg male context.",
        support: "Cooper et al. report about 120 to 140 g for an average 70 kg young male.",
        sourceKeys: ["cooper2012"],
        implementation: "Manual baseline fallback = 120 g; default UI basis estimates baseline from body composition."
    },
    {
        area: "Body pool",
        claim: "Most creatine is in skeletal muscle.",
        support: "Cooper reports 95%; NCBI Bookshelf says more than 90%.",
        sourceKeys: ["cooper2012", "ncbiCreatine"],
        implementation: "Used to convert skeletal-muscle creatine pool into a total-body pool estimate."
    },
    {
        area: "Body composition",
        claim: "Body-composition defaults expose two literature population centerlines rather than committing to one as 'the' baseline.",
        support: "General-adult literature (Cooper 2012, ISSN 2017) reports a 70 kg male pool around 120-140 g with FFM-to-SMM ~0.45 and ~4.6 g creatine per kg wet SMM. D3-creatine studies in active young males (Clark 2014, Sagayama 2023) measured larger pools (~160 g) with higher SMM/FFM (~0.53) and higher Cr per kg SMM (5.0-5.1). Both populations are real; they differ by training status, age, sex, and body composition, and one default cannot honestly serve both.",
        sourceKeys: ["cooper2012", "issn2017", "clark2014", "sagayama2023"],
        implementation: "BODY_COMPOSITION_PRESETS exposes 'general_adult' (ffmToSmmFraction 0.45, muscleCreatineGPerKg 4.6) and 'athletic_young_male' (0.53, 5.0). The default is general_adult so existing baselines do not silently shift. Users can either pick a preset or edit FFM-to-SMM and Cr per kg SMM directly. Monte Carlo continues to sample the wider 3.8-5.4 g/kg envelope around whichever centerline is in effect."
    },
    {
        area: "Body composition",
        claim: "A larger skeletal muscle mass implies a larger baseline creatine pool.",
        support: "D3-creatine dilution (Clark 2014 method, refined by Sagayama 2023) estimates total creatine pool size and converts it to skeletal muscle mass; Wang et al. also tied creatinine excretion to CT-measured skeletal muscle under controlled diet conditions.",
        sourceKeys: ["clark2014", "pagano2024", "sagayama2023", "wang1996"],
        implementation: "Body-composition mode estimates SMM, then computes muscle creatine pool as SMM kg times creatine g/kg."
    },
    {
        area: "Body composition",
        claim: "Body fat percentage is used only to estimate fat-free mass, not because fat mass materially expands the creatine pool.",
        support: "The D3-creatine method (Clark 2014, refined by Sagayama 2023) is grounded in skeletal muscle holding the dominant body creatine pool; FFM is used to estimate SMM when direct SMM is unavailable. The FFM-to-SMM multiplier is an explicit model choice and can vary by sex, age, diet, and training status.",
        sourceKeys: ["clark2014", "pagano2024", "sagayama2023"],
        implementation: "body_mass * (1 - body_fat_fraction) estimates FFM; FFM times an editable fraction estimates SMM."
    },
    {
        area: "Body composition",
        claim: "Creatine per kg wet skeletal muscle is modeled as a configurable centerline with a widened 3.8 to 5.4 g/kg uncertainty range.",
        support: "Clark 2014 introduced the D3-creatine dilution method and reported the foundational SMM-to-creatine relationship; D3 literature commonly uses 4.3 g/kg; Sagayama et al. found about 5.0 to 5.1 g/kg better fit MRI-measured SMM in active young males; review literature notes broader observed variation.",
        sourceKeys: ["clark2014", "pagano2024", "sagayama2023"],
        implementation: "Default muscleCreatineGPerKg = 4.6, with Monte Carlo sampling from 3.8 to 5.4 g/kg; this is a rough body-composition estimate, not a direct measurement."
    },
    {
        area: "Body pool",
        claim: "Daily loss defaults to 1.7% of the total body pool and is the full turnover term in the accumulation ODE, not just the part above baseline turnover.",
        support: "Direct NCBI Bookshelf value; mass-balance correctness requires the full turnover, not the excess.",
        sourceKeys: ["ncbiCreatine"],
        implementation: "turnoverFractionPerDay = 0.017, editable; dailyLossG = currentPoolG * turnoverFractionPerDay. The full term enters the daily mass balance so that diet and synthesis matter even when total turnover sits near baseline turnover. Without supplementation the pool drifts toward (diet + endogenous) / turnover, not the entered baseline."
    },
    {
        area: "Body pool",
        claim: "Normal-diet baseline stores are modeled as already partly saturated, not 0% saturated.",
        support: "ISSN 2017 describes normal-diet muscle creatine stores as roughly 60-80% saturated.",
        sourceKeys: ["issn2017"],
        implementation: "baselineSaturationFraction defaults to 0.75; Monte Carlo samples 0.60 to 0.80."
    },
    {
        area: "Body pool",
        claim: "Endogenous synthesis and dietary creatine flow into the body pool through a mass-balance ODE.",
        support: "Direct Cooper review values for diet (~1 g/day omnivore) and endogenous (~1 g/day); Brosnan review for endogenous synthesis from glycine-arginine-methionine.",
        sourceKeys: ["cooper2012", "brosnan2011"],
        implementation: "Per-day update: nextPool = prev + retainedSupplement + (diet + endogenous) - prev * turnoverFraction, lower clamp at 0 and upper at poolCap. The pool drifts toward equilibriumPool = (diet + endogenous) / turnoverFraction when supplementation is below steady-state need."
    },
    {
        area: "Body pool",
        claim: "Vegetarian and low-meat baselines are lower than omnivore baselines, with synthesis partially compensating for missing dietary creatine.",
        support: "Burke et al. 2003 reported lower resting muscle total creatine in vegetarians than omnivores (~9-14 mmol/kg dry difference); Lukaszuk et al. 2002 showed vegetarians had lower habitual muscle creatine but responded strongly to supplementation. Synthesis ramps modestly in vegetarian populations.",
        sourceKeys: ["burke2003", "lukaszuk2002", "solis2017"],
        implementation: "DIETARY_MUSCLE_CREATINE_FACTOR (1.00 omnivore, 0.97 low_meat, 0.92 vegetarian) scales muscleCreatineGPerKg in the body-composition baseline. LITERATURE_ENDOGENOUS_G_PER_DAY (1.0/1.1/1.4 g/day) supplies the diet-pattern endogenous centerline when calibration mode is off."
    },
    {
        area: "Body pool",
        claim: "Background calibration lets the entered baseline stay put without supplementation while dietary pattern still meaningfully shifts the pool through body-composition factors.",
        support: "Engineering choice: under calibration, endogenous synthesis is treated as the residual the chosen diet does not cover, consistent with how individuals are typically observed at a personal steady state.",
        sourceKeys: ["cooper2012", "brosnan2011"],
        implementation: "calibrateBackground (default true) pins endogenous to (baselineTurnoverG - dietaryGPerDay). Toggle off to use the literature value and watch the pool drift to the implied equilibrium."
    },
    {
        area: "Body pool",
        claim: "Additional steady-state supplemental dose equals current turnover minus diet plus endogenous, never negative.",
        support: "Mass-balance derivation from NCBI turnover and Cooper background context; no source directly supplies this browser steady-dose equation.",
        sourceKeys: ["ncbiCreatine", "cooper2012"],
        implementation: "steadyStateDoseCrMG = max(pool * turnoverFraction - (diet + endogenous), 0) / 0.879. The result card now labels this 'Additional steady dose' to make the role of background context explicit."
    },
    {
        area: "Body pool",
        claim: "Daily urinary creatinine output is modeled as pool times turnover fraction times the creatinine/creatine mass ratio.",
        support: "Walker reviewed creatinine as the non-enzymatic dehydration product of creatine, with daily output proportional to muscle mass; Heymsfield used 24-h urinary creatinine to estimate skeletal muscle mass on that same proportionality.",
        sourceKeys: ["walker1979", "heymsfield1983", "ncbiCreatine"],
        implementation: "creatinineProducedG = dailyLossG * (113.12 / 131.13). Plotted as Daily Creatinine Production over the simulation window with a Monte Carlo band; baseline dashed line marks the no-supplement turnover."
    },
    {
        area: "Body pool",
        claim: "The fate of each day's supplemental creatine is split between pool retention and unchanged urinary excretion, with retention efficiency declining as the pool approaches the modeled cap.",
        support: "Engineering model fitted to Hultman loading retention drop-off and to ISSN 60-80% saturation context. No paper directly supplies the daily split; this is browser model output, not a measurement.",
        sourceKeys: ["hultman1996", "issn2017"],
        implementation: "excretedSupplementG = activeSupplementG - retainedSupplementG; cumulativeRetainedG / cumulativeActiveSupplementG is plotted as retention efficiency on the Cumulative Dose Vs Retained chart's secondary axis."
    },
    {
        area: "Body pool",
        claim: "Daily muscle uptake of supplemental creatine follows a saturable Michaelis-Menten dose response with a Hill-shaped pool-gap attenuation, not an ad-hoc multiplicative curve.",
        support: "SLC6A8 (CreaT) is a Na+/Cl--dependent active transporter (Persky & Brazeau 2001 review). Daily uptake reflects renal-clearance vs transporter-uptake competition. Schedel 1999 (full paper) reports an acute serum Cr peak at ~2.5 h after 20 g ingestion followed by a slow decline, but does not compute a formal plasma t1/2 (measurement window is 6 h max). Km in the model is therefore a Hultman-anchored engineering fit, not a Schedel-derived plasma kinetic constant. Hultman 1996 group 1 retained ~17% of CrM ingested over 6 days at 20 g/day. Harris 1992 (full paper Table I) gives per-subject day-by-day urinary retention at 20 g/d (subjects 1, 2, 5) and 30 g/d + single-leg exercise (subjects 13-15); Harris confirms saturation kinetics and ~10-30% pool rise with substantial responder spread.",
        sourceKeys: ["persky2001", "persky2003", "schedel1999", "hultman1996", "harris1992", "greenhaff1994"],
        implementation: "computeMuscleUptakeG returns Vmax × gapFraction^Hill × active / (Km + active), capped at the active dose. Defaults: Vmax = 8 g/day, Km = 6 g, Hill = 2.0. Hill was raised from 1.0 to 2.0 in the May 2026 audit pass to match Hultman group-1 6-day cumulative retention (~17% of CrM ingested) instead of overshooting at ~22%. Day-1 retention (~6 g) is unchanged because it is gated by Vmax. Monte Carlo samples Vmax +/-25% and Km +/-25-40% to span responder/non-responder spread reported by Harris and Greenhaff. Harris Subject 5 (20 g/d, no exercise) retained 13.6 g of 88 g active over 5 days (15.5%), which sits just below the model's MC P10 envelope (P10 ~15.8 g) — an example of the individual outlier behavior already called out in the 'responder spread is irreducible' warning. Harris subjects 13-15 (30 g/d + single-leg exercise) show substantially higher retention than the model can produce at any setting, because exercise-augmented muscle uptake is not modeled in V1."
    },
    {
        area: "Body pool",
        claim: "Daily turnover uses an exponential closed-form integration of the linear ODE, not forward Euler.",
        support: "Engineering correctness: with a constant input rate over each day, the analytical solution to dPool/dt = inputRate - k*pool is pool(t+1) = pool(t)*exp(-k) + (inputRate/k)*(1-exp(-k)). This eliminates forward-Euler step error that accumulated over long simulations and lets mass balance close to floating-point precision.",
        sourceKeys: ["ncbiCreatine"],
        implementation: "Per-day pool update uses the closed-form exponential. dailyLossG is derived from the analytical change in pool, so cumulative turnover and cumulative inputs balance exactly. checkMassBalance now reports residuals at machine epsilon."
    },
    {
        area: "Body pool",
        claim: "Post-loading washout in the model is slower than Hultman/Vandenberghe-style observed return-to-baseline (~28 days).",
        support: "Linear single-pool turnover at 1.7%/day produces an excess-pool half-life of ~41 days. Hultman 1996 and Vandenberghe 1997 report return to baseline by ~28-30 days post-stop. The discrepancy likely reflects intramuscular regulation, fast plasma efflux of supplemented surface, or training-status effects that a single-compartment model cannot capture.",
        sourceKeys: ["hultman1996", "vandenberghe1997"],
        implementation: "Surfaced as a model warning; users wanting faster washout can raise turnoverFractionPerDay above 0.017, but that also raises predicted baseline creatinine output, so the parameter is an audit trade-off rather than a free fit."
    },
    {
        area: "Body pool",
        claim: "Responder/non-responder spread is irreducible: muscle-uptake Vmax and Km vary widely across people.",
        support: "Harris 1992 and Greenhaff 1994 reported substantial inter-individual variability in muscle TCr rise to identical loading protocols, with low responders gaining ~10% and high responders ~30%. Sex, age, fiber-type composition, training status, and insulin sensitivity are known modifiers but are not modeled here.",
        sourceKeys: ["harris1992", "greenhaff1994", "vandenberghe1997"],
        implementation: "Monte Carlo samples muscleUptakeMaxGPerDay ±25% and muscleUptakeKmActiveG ±25-40% to span the responder band visually. The accumulation chart band and steady-dose band reflect this spread; a single-individual response can still fall outside the modeled envelope."
    },
    {
        area: "Body pool",
        claim: "20 g/day for 6 days rapidly loads skeletal muscle creatine.",
        support: "Direct Hultman et al. protocol and conclusion.",
        sourceKeys: ["hultman1996"],
        implementation: "20 g/day loading preset and sanity fixture."
    },
    {
        area: "Body pool",
        claim: "The default UI protocol is 5 g/day daily without a loading phase; 5 g/day is also used as the post-loading maintenance dose in loading presets.",
        support: "Hultman maintained elevated stores at 2 g/day; Cooper describes common maintenance protocols of 3 to 5 g/day.",
        sourceKeys: ["hultman1996", "cooper2012"],
        implementation: "The standalone option is labeled as a no-loading daily protocol. Loading presets transition to 5 g/day; Hultman 2 g/day is retained in docs as a validation reference."
    },
    {
        area: "Body pool",
        claim: "3 g/day for 28 days is a slow-loading sanity target.",
        support: "Direct Hultman et al. result.",
        sourceKeys: ["hultman1996"],
        implementation: "Research sanity target used to tune the sublinear, dose-scaled retention curve; not a primary UI preset."
    },
    {
        area: "Body pool",
        claim: "The loading curve and Monte Carlo ranges are fitted model choices.",
        support: "Anchored to Hultman loading behavior, Cooper pool sizes, NCBI turnover, and ISSN's normal-diet 60-80% saturation context; no paper directly supplies this exact browser model.",
        sourceKeys: ["hultman1996", "cooper2012", "ncbiCreatine", "issn2017"],
        implementation: "This loading curve is a fitted browser model, not an equation taken from one paper. No-supplement scenarios remain at baseline saturation."
    },
    {
        area: "Brain compartment",
        claim: "The brain tCr estimate should be shown separately from skeletal-muscle saturation rather than as simple spillover.",
        support: "Ohtsuki et al. support carrier-mediated blood-brain-barrier transport; Forbes et al. note brain creatine synthesis and smaller brain response versus muscle.",
        sourceKeys: ["ohtsuki2002", "forbes2022"],
        implementation: "Brain tCr output is separate and is not added to the body-pool saturation curve."
    },
    {
        area: "Brain compartment",
        claim: "Baseline brain total creatine is estimated from MRS concentration and brain mass, with the volume conversion treated as an explicit approximation.",
        support: "Dechent et al. reported MRS mean brain total creatine increasing by 8.7% (corresponding to 0.6 mM) when averaged across brain regions and subjects. Converting that mM concentration to whole-brain grams requires assuming what volume the mM is reported in: per liter brain tissue (~1.04 g/mL density) gives ~1.22 g; per liter brain water (~78% of tissue) gives ~0.99 g; treating 1 kg ~ 1 L gives ~1.27 g. MRS reporting conventions vary across studies, so the brain creatine pool in grams carries ~+/-20% interpretation uncertainty even before individual response variability is layered on top.",
        sourceKeys: ["dechent1999"],
        implementation: "Default brain tCr = 6.9 mM, derived from Dechent's 0.6 mM / 8.7% = 6.9 mM whole-brain baseline. Converted to grams via mM x brainMassKg x (creatine MW / 1000), which implicitly treats 1 kg ~ 1 L brain tissue. The brain pool is informational only; it does not feed into the skeletal-muscle body mass balance, so this interpretation drift does not propagate into the body-pool ODE."
    },
    {
        area: "Brain compartment",
        claim: "Brain reference response to creatine monohydrate is generally smaller and more variable than skeletal muscle loading, and the high anchor is the maximum individual whole-brain response, not the maximum regional response.",
        support: "Dechent et al. observed (a) whole-brain mean response 8.7%, (b) intersubject variability of whole-brain responses 3.5 to 13.3%, and (c) regional analysis averaged across subjects with thalamus highest at 14.6% (1.0 mM). The 14.6% thalamus value is a regional peak, not an individual's whole-brain response; an exceptional whole-brain responder gained 13.3%. Forbes et al. summarize broader heterogeneity across protocols and populations.",
        sourceKeys: ["dechent1999", "forbes2022"],
        implementation: "Displayed as a Dechent-style 20 g/day for 4 weeks reference band: 3.5% (Dechent low) to 13.3% (Dechent intersubject high), with 8.7% as the centerline. The 14.6% thalamus regional peak is exposed separately as a regional reference, not as part of the whole-brain response band. Band does not change when the selected protocol changes."
    },
    {
        area: "Numerical",
        claim: "Monte Carlo bands use a seeded xorshift32 pseudo-random generator and are display-only.",
        support: "Marsaglia 2003 xorshift family provides better visual distribution than linear-congruential generators while remaining deterministic for smoke tests.",
        sourceKeys: ["marsaglia2003"],
        implementation: "createSeededRandom uses xorshift32. The model output explicitly warns that the band is for visual uncertainty, not statistical inference."
    },
    {
        area: "Numerical",
        claim: "A closed-form mass-balance residual is reported on every simulation as an internal consistency check.",
        support: "Engineering check: with a first-order forward Euler step at 1-day cadence, discretization error grows with simulation length and turnover fraction. Tracking the residual makes large drifts visible.",
        sourceKeys: ["ncbiCreatine"],
        implementation: "checkMassBalance compares the simulated final pool to baseline + cumulativeRetained + cumulativeBackground - cumulativeTurnover. Surfaced on the Mass-balance residual card and validated as a sanity check."
    },
    {
        area: "Storage",
        claim: "Solubility anchors span 4 to 60 deg C, matching Jager's directly measured values, with no extrapolation beyond that range.",
        support: "Direct neutral-water solubility values from Jager et al. 2011: 6 g/L at 4 deg C, 14 g/L at 20 deg C, 34 g/L at 50 deg C, 45 g/L at 60 deg C. Earlier versions extended to 0 deg C and 80 deg C using engineering extrapolation; those anchors were removed because (a) 0 deg C is at the freezing boundary and (b) no Jager value is available above 60 deg C.",
        sourceKeys: ["jager2011"],
        implementation: "SOLUBILITY_ANCHORS = {4:6, 20:14, 50:34, 60:45} g/L with piecewise-linear interpolation. Temperatures below 4 deg C clamp to 6 g/L; temperatures above 60 deg C clamp to 45 g/L. Both clamps surface a warning. pH-driven solubility changes are not modeled."
    }
]);

export function getAuditRows() {
    return CREATINE_CLAIM_AUDIT.map((claim) => ({
        ...claim,
        sources: claim.sourceKeys.map((key) => CREATINE_REFERENCES[key]).filter(Boolean)
    }));
}
