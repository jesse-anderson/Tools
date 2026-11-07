# Dataset Diff fixtures

Test files and downloadable examples for the planned Dataset Diff and
Reconciliation tool (`docs/SOW/DATASET_DIFF_RECONCILIATION_SOW.md`). Every
file here is written by `scripts/build-dataset-diff-fixtures.py`; edit the
script and rerun it rather than editing a file:

    python -I scripts/build-dataset-diff-fixtures.py

A rerun is byte-identical. `fixtures.json` lists each comparison case with
its expected verdicts and counts, written by hand in the script, plus import
checks and the typed value of every workbook cell.

Workbooks come from openpyxl 3.1.5, which shares no code with SheetJS, the
reader the tool uses. openpyxl cannot write everything the cases need, so
the script patches the saved XML and then checks the result:

- It writes floats to 16 significant digits, so `0.1 + 0.2` would be saved
  as `0.3`. Float cells are rewritten with their exact value.
- It writes formulas with an empty cached result. Cached results are
  injected; `formulas-left.xlsx!Unresolved!B2` is left with none.
- It writes a stored empty string as a cell with no string. One is added.
- It uses inline strings. All workbooks but `layout.xlsx` are converted to a
  shared string table, as Excel writes them.

openpyxl reads serial 60 (Excel's fictional 29 February 1900) back as 59,
so that cell is checked in the raw XML.

`dates-excel-export-simulated.csv` imitates what Excel writes when it saves
`dates-1900.xlsx` as CSV: the displayed text, not the stored serials. It is
written by hand, not produced by Excel.

## Files

| Files | What they test |
|---|---|
| `parts-left.*`, `parts-right.xlsx`, `parts-right-*.csv` | The seven worked examples in SOW section 6, as XLSX and as CSV |
| `three-pairs-*.xlsx` | A three-pair plan (match, order only, changed value), an excluded and a hidden sheet, a missing sheet |
| `display-*.xlsx` | Equal displays hiding different stored decimals, one value shown two ways |
| `dates-1900.xlsx`, `dates-1904.xlsx` | Equal serials under different date systems, equal calendar dates with different serials, serial 60 |
| `formulas-*.xlsx` | Cached formula results against literals, different formulas with one result, an unresolved formula |
| `blanks-*.xlsx` | Blank against stored empty string, text `TRUE` against boolean, error against text, whitespace, negative zero, an all-blank row, a styled empty cell outside the values |
| `layout.xlsx` | Hidden rows and columns, a merged header, a header-only sheet, inline strings |
| `quoted-newlines.csv`, `header-only.csv`, `ragged.csv`, `bom-utf8.csv`, `literals.csv` | CSV parsing: multiline quoted fields, no data rows, ragged rows, a BOM, `NULL`/`N/A`/`NaN` as text |
