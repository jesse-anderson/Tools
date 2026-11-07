# Fishbone diagram sources

The sources behind `docs/SOW/FISHBONE_DIAGRAM_SOW.md`, mainly section 3 (the
category presets, the kinds of fishbone and the voting rule). This folder
follows the same convention as `data/control_valve_coefficients/`. The
documents live in `sources/` and are not committed: `data/.gitignore` allows
only this README and the CSV. `download_manifest.csv` records each source and
the SHA-256 of the exact file that was read, so the record survives losing
the files.

The manifest has one row per source, 38 in all. That includes the six that
were not obtained:
- ASQ's fishbone page and the Process Excellence Network article both refused
  automated downloads.
- Tague's book is sold, not published.
- Three competitor pages could not be fetched (below).

## Competitors

Files starting `comp_` are the vendor pages behind the "What already exists"
table in section 0.1 of the SOW, saved 2026-11-06. Lucidchart refused the
download, Dapplesoft's host did not resolve, and Pixa's page returned 404;
the manifest lists all three as not obtained. These are marketing pages, so
"not advertised" in the SOW means only that.

## What each preset rests on

- **6M**: Tague's *Quality Toolbox*, 2nd ed. (2004), read in an excerpt that
  credits the book. Primary.
- **Classic five**: IHI's *Patient Safety Essentials Toolkit* (2017).
  Primary.
- **Primary care 5 Ps**: the Alberta Medical Association guide. Primary.
- **8M and 8P**: Bradley (2016). **4S**: Dudbridge (2011). Both were reached
  only through Wikipedia's citations, not the books, so they are secondary
  until the books are checked.
- **Voting**: CMS's QAPI multi-voting tool. Primary.
- **CEDAC layout**: a training course based on Fukuda's book. Secondary.

## Still open

- Tague's own pages on the cause enumeration, time-delay and desired-result
  fishbones (2nd ed., p. 247 onward). No reachable source defines the
  time-delay fishbone.
- Bradley (2016) and Dudbridge (2011), to confirm the 8M, 8P and 4S lists
  first-hand.
- The two Cloudflare pages are snapshots of documentation that changes. The
  SOW's spike re-checks the figures before Phase 2.
