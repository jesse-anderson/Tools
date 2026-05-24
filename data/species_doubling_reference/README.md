# Species Doubling Reference Source Archive

Local source cache for papers cited by `tools/species-doubling-reference.html`
and `js/species_doubling_reference/species-doubling-reference.js`.

Ground truth hierarchy:

1. Published papers and publisher / PubMed Central pages.
2. Direct DOI, PubMed, PubMed Central, or publisher landing pages.
3. This archive, only as a convenience copy for re-checking citation claims.
4. The visible Species Doubling Reference page and comparison data.

If this folder conflicts with the cited source, the source controls.

## Files

- `download_manifest.csv` - one row per unique cited source. Columns:
  `source_id`, `label`, `registry_url`, `expected_filename`, `access_type`,
  `download_status`, `notes`.
- `numeric_audit.csv` - claim-by-claim check of the displayed growth-rate,
  doubling-time, temperature, and derivation claims.
- `sources/` - actual downloaded PDFs or saved HTML. Gitignored.
- `sources/blocked_downloads/` - placeholder notes for failed, paywalled, or
  institution-access-needed attempts. Gitignored.

## Rules

- Keep source files out of git. Only metadata should be tracked.
- Prefer direct PDF copies for open-access papers.
- If only an abstract or landing page is available, save that as HTML and mark
  the manifest accordingly.
- If access is blocked or paywalled, record it in the manifest and keep the
  source on the manual-access list.
