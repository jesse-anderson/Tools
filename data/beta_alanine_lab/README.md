# Beta-Alanine Lab Source Archive

Local copies of the papers behind the Beta-Alanine Lab's model, presets and
claim audit trail. Plan: `docs/SOW/BETA_ALANINE_LAB_SOW.md`.

Ground truth hierarchy:

1. The original published papers.
2. Direct DOI, PubMed Central or publisher pages.
3. This archive, as a convenience copy for re-checking a figure.

If this folder conflicts with the cited source, the source controls.

## Files

- `download_manifest.csv` - one row per source. Columns: `source_id`,
  `label`, `registry_url`, `expected_filename`, `access_type` (`open_pdf`,
  `open_docx`, `paywalled`, `abstract_only`), `download_status` (`ok`,
  `manual_needed`, `blocked`), `sha256`, `bytes`, `retrieved`, `notes`. The
  manifest is the record of what was attempted and what landed.
- `literature.json` - the reading record: one entry per paper read, wanted
  or known only secondhand, with its DOI, design, what it feeds, findings
  not yet in the claims, caveats, and for a wanted paper what it would
  settle. A `searches` list records each question asked of the literature
  and what was or was not found, so a search is not repeated. Numbers the
  page uses stay in the CSVs. The spec checks this file against the
  manifest and the CSVs.
- `sources/` - PDFs and saved pages. Gitignored.
- `sources/*_abstract.html` - publisher landing pages kept where the full
  text is paywalled. Abstract level only; no model constant is read from one.
- `sources/blocked_downloads/` - empty `.blocked` placeholders named after the
  file that could not be fetched. Gitignored.

## Conventions

- Filename: `<journal>_<year>_<firstauthor>_<topic>.pdf`.
- A paper supplied by hand goes in `sources/` under its `expected_filename`;
  then update its row (status `ok`, hash, bytes, date) and delete its
  placeholder.
- Units: carnosine is fitted in mmol/kg dry muscle from HPLC studies only.
  MRS studies (mmol/kg wet weight) enter as percent changes and washout
  rates, which carry no unit. Rezende's supplementary Table 1 mixes HPLC
  units between studies (values near 25, 8 and 1 all labeled HPLC), so no
  value from it is used without checking the unit in the original paper.
