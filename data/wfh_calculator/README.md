# Work From Home Calculator sources

The sources behind the fill-in buttons and context notes in
`tools/wfh-calculator.html` (figures live in `js/wfh_calculator/wfh-data.js`)
and the SOW at `docs/SOW/WFH_DELTA_CALCULATOR_SOW.md`. Same convention as
`data/fishbone_diagram/`: documents in `sources/` are local only, and
`download_manifest.csv` keeps the SHA-256 of each file that was read.

24 rows, five not obtained:
- IRS Announcement 2026-11 itself (404 at the guessed path). The 76 cent rate
  from July 1, 2026 is taken from KPMG and the Journal of Accountancy, which
  both cite it.
- US DOT's 2016 travel time guidance (403). The 50% of wage convention for
  local personal travel is from search summaries of its versions.
- Three BLS pages (bls.gov returns 403 to scripts). Their figures were read
  through a page fetch on 2026-11-08 and are quoted in the manifest notes.

## What each figure rests on

- **IRS mileage, 72.5 cents (Jan to Jun 2026)**: IR-2025-128. Primary.
- **IRS mileage, 76 cents (from Jul 1, 2026)**: Announcement 2026-11, read
  through KPMG and the Journal of Accountancy. Secondary.
- **AAA all-in 77 cents, wear 11.04 cents, gas $3.151, EV 16.7 cents/kWh,
  car ownership costs**: AAA 2025 fact sheet. Primary. Secondary sources that
  quote 82.7 cents a mile for 15,000 miles are wrong; the sheet says 77.
- **26.4 minute commute**: Census, 2022 ACS. Primary.
- **$340 a month commuter benefit**: Rev. Proc. 2025-32. Primary.
- **Commuting not deductible, no employee home office deduction**:
  Publications 463 and 587 (2025). Primary.
- **8% and 5% of pay valuations**: quoted in Buckman et al. (2025); Aksoy et
  al. read first-hand. The archived NBER file is misnamed `w28731`; it is the
  2025 "Measuring Work from Home" paper.
- **65 minutes saved a day**: Davis slides, 2022.
- **2026 federal brackets and standard deduction** (tax popover): Rev. Proc.
  2025-32 sections 4.01 and 4.14. Primary, archived.
- **Payroll tax, $184,500 wage base, 0.9% over $200,000** (tax popover): IRS
  Topic 751. Primary, archived.
- **Paid leave averages** (days off and paid weeks popovers): BLS National
  Compensation Survey. Vacation and sick days are March 2026; the 8 paid
  holidays are 2025, the latest average found. Averages count only workers who
  get the leave. Read, not archived.
- **11 federal holidays**: 5 U.S.C. 6103. Primary, archived.
- **Bracket tax model** (`TAX_2026` in `wfh-engine.js`): brackets and
  standard deductions from Rev. Proc. 2025-32; Social Security and Medicare
  from Topic 751; the Additional Medicare thresholds ($200,000, $250,000
  joint) from the IRS Additional Medicare Tax Q&A. All primary, archived. The
  spec rebuilds the Rev. Proc.'s printed cumulative amounts from the tables.
- **Cost of living**: BEA Regional Price Parities, all items and housing,
  2024 (released February 19, 2026, the latest; the next release is due
  December 10, 2026). `bea_rpp_2024.csv` in this folder is committed and is
  generated, with `js/wfh_calculator/wfh-rpp-data.js`, by
  `scripts/build-wfh-rpp-data.py` from the two BEA zips in `sources/`. Rerun
  it when BEA publishes 2025. BEA's February note says it discontinued some
  metro statistics; check that metro RPPs are still published before then.
- **Home energy range**: Borenstein (Berkeley Haas) and Energy Networks
  Australia. Context only; the tool uses no default.

## Still open

- The March 2026 BLS tables ZIP probably carries a 2026 paid holiday
  average; the popover uses the 2025 figure of 8 until someone reads it.

- Read Announcement 2026-11 on irs.gov and the DOT 2016 guidance by hand.
- The claim that some research finds 35% of saved commute time goes back to
  work was not found in any archived source and was dropped.
