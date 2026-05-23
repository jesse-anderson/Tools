# Creatine Lab Source Archive

Local copies of papers cited in `js/creatine_lab/creatine-source-map.js`. Used
for ground-truth verification of model anchors, equation rationales, and chart
info tooltips. Never committed: the `sources/` subtree is gitignored.

Ground truth hierarchy:

1. The original published papers and method documents.
2. Direct DOI / PubMed Central / publisher pages.
3. This archive, only as a convenience copy for re-checking citations.
4. The `creatine-source-map.js` registry, which must always point at a real,
   resolvable URL for the cited paper.

If this folder conflicts with the cited source, the source controls.

## Files

- `download_manifest.csv` - one row per source_id in the registry. Columns:
  `source_id`, `label`, `registry_url`, `expected_filename`, `access_type`
  (`open_pdf` / `open_html` / `paywalled` / `abstract_only` / `broken_pmid`),
  `download_status` (`pending` / `ok` / `blocked` / `manual_needed`),
  `notes`. The manifest is the only canonical record of what was attempted
  and what landed.
- `sources/` - actual PDFs and saved HTML. Gitignored.
- `sources/blocked_downloads/` - placeholder files marking attempts that
  failed (paywalled, cloudflare-blocked, 404, etc.). Filenames mirror
  `expected_filename` with a trailing extension like `.blocked`, `.empty`,
  `.cloudflare.html`. Gitignored.

## Conventions

- **Filename:** `<journal_or_publisher>_<year>_<firstauthor>_<topic>.pdf` for
  primary sources, `<publisher>_<id>_<topic>.html` for institutional pages
  (NCBI Bookshelf, FDA, etc.).
- **Re-verification:** when registry data is shown to be wrong (e.g. a PMID
  resolving to the wrong paper), update both the manifest and
  `creatine-source-map.js`. The manifest's `notes` column should explain.
- **Adding a source:** add the row to the manifest first, attempt the
  download, then add the registry entry. The other order risks a broken
  URL going live before verification.
