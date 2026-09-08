# Control valve coefficient sources

Backing documents for `js/control_valve_sizing/`. Same convention as
`data/beam_deflection_materials/`: the documents themselves live in `sources/`
and are **not committed** (`data/.gitignore` allows only this README and the
CSV/JSON files), while the manifest records what each one was and a SHA-256 of
the exact file that was read, so the sign-off survives losing the PDFs.

`download_manifest.csv` carries one row per source, including the three that
were **not** obtained. Recording what is missing matters as much as recording
what is present: the Reynolds number factor `FR` depends on constants and
expressions that appear only in IEC 60534-2-1, and the manifest is where that
gap is visible instead of inferred from an absent feature.

## What was obtained

**Fisher / Emerson, Control Valve Handbook, Fifth Edition** (D101881X012/Sept19).
Freely published by the manufacturer. It reproduces the ISA-75.01.01 /
IEC 60534-2-1 sizing procedure, the equation constants table, representative
`FL` / `xT` / `Fd` coefficients by valve style, and two fully worked sizing
examples. It is a **secondary source** and is cited as one everywhere it is used.

**IEC 60534-2-1:1998**, the standard itself, in a national-body adoption of the
first edition. This is the primary source the Fisher handbook reproduces. It
supplies four annex worked examples and, more importantly, the **normative
equation structure** that settles a question no secondary source answers cleanly
(see below). It is a scan, so its tables and numbers extract well and its
equations do not. IEC sells the current edition; the manifest row points at the
publisher and is marked `paywalled`, following the convention the beam archive
uses for ASTM and the Aluminum Design Manual.

**Masoneilan Control Valve Sizing Handbook** (Baker Hughes, TS-19540C). A second
manufacturer's independent transcription of the same ISA/IEC tables. Its value
is corroboration: it prints the same `N1`, `N2` and `N6` metric rows the engine
carries, which is the only real check on a transcription short of buying the
standard twice. It also publishes `N4` and confirms the ISA-RP75.23 sigma
definition the tool uses, along with the `sigma_i` / `sigma_c` / `sigma_mr`
family.

**SAMSON L351EN, Cavitation in Control Valves.** Confirms that SAMSON's
`xFZ = (p1 - p2) / (p1 - pV)` is the exact **reciprocal** of the sigma this tool
reports. That is not a curiosity: it is the inverted-convention trap the
cavitation panel warns about, now with a citable source instead of a caution.

## What was not, and what that costs

`N4` is now in hand: the Masoneilan handbook prints **76000** for m3/h, mm and
centistokes (17300 for gpm, inch). `FR` is still not computed, and the reason
has changed. It is no longer a missing constant but a missing *procedure*: the
factor comes off figure 3 or an iteration in clause 8.2, and the obtained copy
of the standard is a scan whose equations did not survive text extraction well
enough to transcribe safely. Reconstructing them from memory is the beam tool's
1/185 error with less excuse.

**What would close it:** a text-layer copy of IEC 60534-2-1 clause 8.2 with
equations 28 and 30 through 33, or ISA-75.01.01. The valve Reynolds number
itself needs only `N4`, `Fd` (already in `valve-styles.js` for most rows) and a
kinematic viscosity input, so `Rev` could be reported before `FR` is.

## Where a published worked example and this engine disagree

IEC annex example 3 (compressible, non-choked, with reducers) prints `Kv = 72.2`
where the engine gives 70.7, about 2%. The example computes `Y` once with `xT`
before the reducers are applied and then reuses that `Y` after `Fp` has changed;
the engine recomputes `Y` with `xTP`.

The standard settles it against itself. Clause 7.1.2.2 equation (17), the
choked-with-fittings form, reads `C = Q / (0.667 N9 Fp p1) sqrt(M T1 Z / (Fy
xTP))`, so at the choke point the standard uses `Y = 0.667` together with
`x = Fy xTP`. The non-choked branch must meet that value **at** the boundary,
because flow does not jump when it chokes, and only `Y` taking `xTP` does:
with `xT` it lands on `1 - xTP/(3 xT)`, which equals 2/3 only when there are no
fittings. Taking `xT` therefore puts a 2.2% step in the flow curve at the choke
point. The engine is on the continuous side and a test sweeps across the
boundary to prove it.

## The one thing to know before reading a value out of the handbook

**The handbook's equation constants are defined for `C` as `Cv`, not `Kv`.**
`N1 = 0.865` for m3/h and bar is exactly the `Kv = 0.865 Cv` factor showing
through: with `Kv` the same row would read 1.0. Every constant transcribed into
`valve-engine.js` is therefore a `Cv` constant, and the engine works in `Cv`
internally so that no constant has to be re-derived. See the header of that file.
