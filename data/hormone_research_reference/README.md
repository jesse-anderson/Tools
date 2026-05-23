# Hormone Research Reference Data

Status: source-linked reference data for the Hormone Research Reference tool.
Rows selected for display have source locators, units, methods, and caveats.
Rows not selected for display remain available for review and comparison.

Ground truth hierarchy:

1. Published papers and method documents.
2. Lab reports and their own method-specific reference intervals.
3. Qualified clinical care and current professional guidance.
4. This data folder, only as a convenience copy of reviewed source rows.

Current files:

- `source_registry.json`: source IDs, URLs, locator requirements, and intended use.
- `reference_gap_status.csv`: per-analyte acceptance status and remaining hardening target.
- `production_rates_female_cycle.csv`: Endotext female cycle production anchors in long form, one row per analyte and phase.
- `production_rates_male.csv`: male testosterone, estradiol, progesterone, and DHT production anchors promoted to active display rows after source review.
- `serum_reference_review_only.csv`: CDC/NHANES literature normal ranges stored as review-only rows.
- `serum_reference_phase_table.csv`: reviewed serum/plasma interval rows with sex, age, phase, specimen, method, source locator, and caveat context.
- Adult DHEA-S and broad progesterone serum rows from Bae 2019 are age-banded; they should not be collapsed into one universal adult range.
- Frederiksen 2020 supplement rows are calendar cycle-day buckets for women age 24.7-43.9; they are not LH-peak aligned.
- Frederiksen 2024 CCA is captured with its supplementary PDF. It is currently a source-specific cross-check/method-caveat source because the numeric age-sex reference intervals are presented as modeled profile figures, not a clean extractable table.
- Haring 2012 female total testosterone and androstenedione rows are source-specific age bands; keep them visible beside other female testosterone sources instead of replacing them.
- Adriaansen 2024 and Fit Futures 2026 provide pediatric and young-adult 11-oxygenated androgen intervals; Zeidler 2026 remains a useful missing target for continuous all-age age/sex curves.
- Walravens 2026 measured free testosterone rows are direct equilibrium-dialysis plus LC-MS/MS rows; calculated free testosterone and analog free testosterone must remain separate method categories.
- Holmes 2021 adds pediatric quantile-regression point-estimate rows for total testosterone, SHBG, calculated free testosterone, and calculated bioavailable testosterone. Keep calculated FT/BAT method-labeled and separate from measured equilibrium-dialysis free testosterone.
- SHBG rows are binding-protein context rows, not steroid concentration rows. Their immunoassay ranges should be method-labeled and source-specific.
- Kushnir 2010 adds source-specific LC-MS/MS serum DHEA intervals for adult age and menopausal-status groups; DHEA remains age-dependent and diurnal.
- Liu 2026 Ann Lab Med adds Guangxi reproductive-age female serum HPLC-MS/MS intervals for corticosterone, cortisone, cortisol, 18-OH cortisol, androstenedione, 11-beta hydroxyandrostenedione, DHEA, and DHEA-S. Treat these as population-specific adrenal-steroid rows.
- Little/Tait 1966 adds a low-confidence male progesterone plasma production estimate derived from metabolic clearance and plasma concentration; keep it separate from urinary pregnanediol-derived estimates because the source flags those as invalid/discrepant in men.
- Fabregat 2019 and Liu 2026 add advanced androgen-metabolism rows for 3-alpha androstanediol glucuronide, androsterone, unconjugated 3-alpha androstanediol, and source-specific DHT. Keep glucuronide and unconjugated 3-alpha-diol rows distinct.
- `serum_cycle_profile.csv`: Frederiksen 2020 Supplementary Table 8 cycle-day percentile rows for estradiol, estrone, progesterone, estrone sulfate, 17-OHP, androstenedione, testosterone, and DHEA-S.
- `source_splits_and_pathway_notes.csv`: source split and pathway notes.
- `assay_notes.csv`: assay reliability notes.
- `unit_conversions.json`: unit conversion constants for later tests.

Rules:

- No row should be shown in the UI until it has been selected for display.
- Every displayable row needs a source ID and precise source locator.
- Serum concentration, production rate, source percent, relative potency, and pathway rows must stay separate.
- Cycle-profile bands should be labeled as source-reported population spread, not personal prediction.
- Rendered source mentions should link back to the DOI, NCBI Bookshelf, PubMed Central, registry, or comparable URL tracked in `source_registry.json` whenever available.
- If this folder conflicts with a cited source, the source controls.
