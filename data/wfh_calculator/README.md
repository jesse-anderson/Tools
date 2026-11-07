# Work From Home Calculator sources

The sources behind the fill-in buttons and context notes in
`tools/wfh-calculator.html` (figures live in `js/wfh_calculator/wfh-data.js`)
and the SOW at `docs/SOW/WFH_DELTA_CALCULATOR_SOW.md`. Same convention as
`data/fishbone_diagram/`: documents in `sources/` are local only, and
`download_manifest.csv` keeps the SHA-256 of each file that was read.

16 rows, two not obtained:
- IRS Announcement 2026-11 itself (404 at the guessed path). The 76 cent rate
  from July 1, 2026 is taken from KPMG and the Journal of Accountancy, which
  both cite it.
- US DOT's 2016 travel time guidance (403). The 50% of wage convention for
  local personal travel is from search summaries of its versions.

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
- **Home energy range**: Borenstein (Berkeley Haas) and Energy Networks
  Australia. Context only; the tool uses no default.

## Still open

- Read Announcement 2026-11 on irs.gov and the DOT 2016 guidance by hand.
- The claim that some research finds 35% of saved commute time goes back to
  work was not found in any archived source and was dropped.
