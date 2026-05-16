# Steam Tables - Vendored Reference Data

These CSV files are the ground truth for `tools/steam-tables.html`. They are vendored from LearnChemE / University of Colorado Boulder and should be treated as third-party data, separate from the GPL-3.0 application code in this repository.

## Provenance

| File | Source URL | Internal version | Downloaded |
|---|---|---|---|
| `saturated_by_T.csv` | https://learncheme.com/wp-content/uploads/2023/07/saturated_by_temperature_V1.5.csv | 1.5 | 2026-05-14 |
| `saturated_by_P.csv` | https://learncheme.com/wp-content/uploads/2022/11/saturated_by_pressure_V1.4.csv | 1.4 | 2026-05-14 |
| `compressed_and_superheated.csv` | https://learncheme.com/wp-content/uploads/2022/04/compressed_liquid_and_superheated_steam_V1.3.csv | 1.2 | 2026-05-14 |

Note: the third file's URL slug contains `V1.3` but its internal `version` field is `1.2`. The internal value is canonical.

Author metadata in the CSV files: Neil Hendren, University of Colorado Boulder.

Source landing page: https://learncheme.com/student-resources/steam-tables/

LearnChemE license and attribution page: https://learncheme.com/contact-us/

Creative Commons license page: https://creativecommons.org/licenses/by-sa/4.0/

## License And Notices

The vendored CSV files carry an MIT-style permissive notice in their metadata headers. Those embedded source-file notices are retained verbatim in the CSV files.

Broader LearnChemE pages identify LearnChemE work as licensed under the Creative Commons Attribution-ShareAlike 4.0 International License. This repository therefore keeps LearnChemE attribution visible in the Steam Tables tool and links to both the source page and the CC BY-SA 4.0 license.

LearnChemE states that its resources were produced by the Department of Chemical and Biological Engineering at the University of Colorado Boulder. LearnChemE identifies NSF support under Award Nos. DUE 0920640, DUE 1322300, DUE 1244183, DUE 2020415, and DUE 2336987, plus additional support from CU, CACHE, Chevron, Shell, and other listed funders. LearnChemE also states that opinions, findings, conclusions, or recommendations are those of the authors and do not necessarily reflect NSF views.

Do not remove the CSV metadata rows when refreshing or redistributing these files. They are the authoritative local record of the CSV-specific MIT-style notice.

Local changes: the CSV files are vendored for browser use. The app parses, interpolates, unit-converts, reverse-solves, tests, and displays the data, but the tabulated values are not edited in place.

## Column Reference

### `saturated_by_T.csv` (375 data rows)

Header layout: 5 lines of CSV-encoded metadata (version, author, copyright, license, date), 1 blank line, column headers on line 7, data from line 8.

| Column | Property | Unit |
|---|---|---|
| 1 | T | deg C |
| 2 | P | MPa |
| 3 | Specific Volume Liquid (v_f) | m^3/kg |
| 4 | Specific Volume Vapor (v_g) | m^3/kg |
| 5 | Internal Energy Liquid (u_f) | kJ/kg |
| 6 | Internal Energy Vapor (u_g) | kJ/kg |
| 7 | Internal Energy of Vaporization (u_fg) | kJ/kg |
| 8 | Enthalpy Liquid (h_f) | kJ/kg |
| 9 | Enthalpy Vapor (h_g) | kJ/kg |
| 10 | Enthalpy of Vaporization (h_fg) | kJ/kg |
| 11 | Entropy Liquid (s_f) | kJ/(kg K) |
| 12 | Entropy Vapor (s_g) | kJ/(kg K) |
| 13 | Entropy of Vaporization (s_fg) | kJ/(kg K) |

T extent: 0.01 deg C (triple point) to the critical point.

### `saturated_by_P.csv` (277 data rows)

Same 13 columns as above with `P (MPa)` as column 1 and `T (deg C)` as column 2. Same header layout.

### `compressed_and_superheated.csv` (9527 data rows)

Long-form table, not a 2D grid. It has 96 unique pressure blocks. Within each block, multiple T rows include explicit saturated-liquid and saturated-vapor rows at T_sat(P) for subcritical pressures.

| Column | Property | Unit |
|---|---|---|
| 1 | Pressure | MPa |
| 2 | Temperature | deg C |
| 3 | Specific Volume (v) | m^3/kg |
| 4 | Density (rho) | kg/m^3 |
| 5 | Specific Internal Energy (u) | kJ/kg |
| 6 | Specific Enthalpy (h) | kJ/kg |
| 7 | Specific Entropy (s) | kJ/(kg K) |
| 8 | Phase | one of: `liquid`, `saturated liquid`, `saturated vapor`, `vapor`, `supercritical fluid` |

P extent: 0.01 MPa to far above critical pressure (22.064 MPa). T extent: 0 deg C to 2000 deg C.

## Refreshing The Data

To re-download:

```bash
curl -sS -o saturated_by_T.csv "https://learncheme.com/wp-content/uploads/2023/07/saturated_by_temperature_V1.5.csv"
curl -sS -o saturated_by_P.csv "https://learncheme.com/wp-content/uploads/2022/11/saturated_by_pressure_V1.4.csv"
curl -sS -o compressed_and_superheated.csv "https://learncheme.com/wp-content/uploads/2022/04/compressed_liquid_and_superheated_steam_V1.3.csv"
```

If LearnChemE publishes new versions, diff against the vendored copies before replacing them. Re-check the current LearnChemE license page, retain all CSV metadata rows, and update the parser/tests if the column layout changes.
