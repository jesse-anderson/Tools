#!/usr/bin/env python3
"""Generate js/seed_storage_lab/seed-species-data.js from data/seed_storage_lab/*.csv.

The CSVs reproduce their sources verbatim, errors included; the corrections
live in numeric_audit.csv. This script is the single place those corrections
are applied, so the browser bundle never carries a hand-patched number.

Run from the repo root:  python scripts/build-seed-species-data.py

Joins
-----
species_index.csv is the spine. Its `common_names` column already holds the
lower-cased crop labels used by the common-name datasets (G2090, Osborne,
Johnny's), so those datasets resolve by lower-casing their crop label and
looking it up. Binomial datasets (WPSM, NRCS, figshare, Kew) resolve directly.

One scientific name can legitimately collect several rows from the same
dataset. Brassica rapa is both "Chinese cabbage" and "turnip", so every
count/longevity entry keeps the crop label it came from. Nothing is averaged
across sources; conflicts are carried as separate entries and surfaced.
"""
import csv
import io
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "data", "seed_storage_lab")
OUT = os.path.join(REPO, "js", "seed_storage_lab", "seed-species-data.js")

GRAMS_PER_OZ = 28.349523125


def load(name):
    with io.open(os.path.join(DATA, name), encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def repair_scan_text(text):
    """Restore characters the compendium extraction lost to a decode error.

    884 cells in the volume 2 evidence column carry U+FFFD where a degree sign
    or a plus/minus stood, and that text is the note the species gate shows, so
    115 taxa displayed "hermetic storage at -18<?>C" to the reader. The original
    byte is gone but the context recovers it: between a figure and a percentage
    it is a tolerance, and everywhere else in this column it is a degree.
    """
    if "�" not in text:
        return text
    text = re.sub(r"(?<=[\d%])�(?=\s*\d{1,2}\s*%)", "±", text)
    text = text.replace("�", "°")
    # "1<deg>_3<deg>C" is a range whose dash went with the degree sign.
    return text.replace("°_", "°-")


def clean(value):
    return repair_scan_text((value or "").strip())


def parse_number(text):
    """'1,200' -> 1200.0 ; '' -> None. Rejects anything with a range dash."""
    text = clean(text).replace(",", "")
    if not text:
        return None
    match = re.fullmatch(r"-?\d+(?:\.\d+)?", text)
    return float(match.group(0)) if match else None


def parse_quantity(text):
    """Parse a point value or a range into {value|low,high}.

    '1,200'            -> {"value": 1200}
    '25-75'            -> {"low": 25, "high": 75}
    '1-4 years'        -> {"low": 1, "high": 4}
    Ranges never collapse to a midpoint; the spread is the finding.
    """
    text = clean(text)
    if not text:
        return None
    stripped = re.sub(r"(?i)\s*years?\s*$", "", text).replace(",", "").strip()
    point = parse_number(stripped)
    if point is not None:
        return {"value": point}
    span = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)", stripped)
    if span:
        low, high = float(span.group(1)), float(span.group(2))
        return {"low": min(low, high), "high": max(low, high)}
    match = re.search(r"\d+(?:\.\d+)?", stripped)
    if match:
        return {"value": float(match.group(0)), "approximate": True}
    return None


def strip_authority(name):
    """'Acer saccharinum L.' -> 'Acer saccharinum'. figshare carries authorities."""
    tokens = clean(name).split()
    if len(tokens) >= 2 and re.fullmatch(r"[a-z][a-z\-]+", tokens[1]):
        return f"{tokens[0]} {tokens[1]}"
    return clean(name)


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", clean(name).lower()).strip("-")


# --------------------------------------------------------------------------
# Spine + name resolution
# --------------------------------------------------------------------------

index_rows = load("species_index.csv")

species = {}
by_common = {}
by_scientific = {}

for row in index_rows:
    name = clean(row["scientific_name"])
    if not name:
        continue
    commons = [c.strip() for c in clean(row["common_names"]).split(";") if c.strip()]
    species[name] = {
        "id": slugify(name),
        "scientificName": name,
        "rank": clean(row["rank"]),
        "commonNames": commons,
        "counts": [],
        "longevity": [],
        "germination": [],
        "constants": [],
        "behaviour": None,
        "notes": [],
    }
    by_scientific[name.lower()] = name
    for common in commons:
        by_common.setdefault(common.lower(), set()).add(name)

unresolved = []

# species_index.csv carries a handful of rows keyed by a bare common name
# because the source dataset never supplied a binomial ("Corn", "Muskmelon").
# Those rows collide with the real species that lists the same word as a common
# name. Each alias below is an unambiguous botanical identity, so the data is
# merged onto the binomial and the bare row falls out for want of payload.
# Absent: "Sage" and "Larkspur", where the vendor label does not pin a species
# (four Salvia and two Delphinium candidates respectively).
LABEL_ALIASES = {
    "muskmelon": "Cucumis melo",
    "coriander": "Coriandrum sativum",
    "gourd": "Cucurbita pepo",
    "radicchio": "Cichorium intybus",
    "corn": "Zea mays",
    "corn, supersweet": "Zea mays",
}

BINOMIAL = re.compile(r"[A-Z][a-z\-]+ [a-z][a-z\-]+")


def resolve_common(label, dataset):
    """Map a dataset crop label onto a scientific name, or record the miss."""
    key = clean(label).lower()
    alias = LABEL_ALIASES.get(key)
    if alias and alias in species:
        return alias
    hits = by_common.get(key)
    if not hits:
        unresolved.append((dataset, label))
        return None
    if len(hits) > 1:
        # The usual cause is a bare-common-name row shadowing the real species.
        # If exactly one candidate is a binomial, that is the answer; anything
        # else is genuinely ambiguous and gets skipped.
        binomials = [h for h in hits if BINOMIAL.fullmatch(h)]
        if len(binomials) == 1:
            return binomials[0]
        unresolved.append((dataset, f"{label} (ambiguous: {sorted(hits)})"))
        return None
    return next(iter(hits))


def resolve_binomial(name, dataset):
    key = strip_authority(name).lower()
    hit = by_scientific.get(key)
    if not hit:
        unresolved.append((dataset, name))
    return hit


def add(name, bucket, entry):
    if name and name in species:
        species[name][bucket].append(entry)


QUANTITY_KEYS = ("perOz", "perLb", "perGram", "perKg", "perLbRange")
skipped_counts = []
skipped_germination = []


def add_count(name, entry):
    """Add a seed-count entry, refusing ones that carry no usable number.

    Some sources print a word where a number belongs. Osborne lists gourd as
    "VARIABLE", which is true and useless. Such an entry would reach the
    browser as a row the model cannot resolve, so it is dropped here and
    reported.
    """
    def usable(quantity):
        return isinstance(quantity, dict) and any(
            isinstance(value, (int, float)) for value in quantity.values())

    if not any(usable(entry.get(key)) for key in QUANTITY_KEYS):
        skipped_counts.append((name or "?", entry.get("sourceKey"), entry.get("cropLabel")))
        return
    add(name, "counts", entry)


# --------------------------------------------------------------------------
# Seed counts
# --------------------------------------------------------------------------

# numeric_audit.csv, status FAIL, check internal_oz_vs_gram: G2090 prints
# tomato and turnip seeds/oz an order of magnitude low. The seeds/gram column
# in the same table is self-consistent, so seeds/oz is rebuilt from it.
G2090_OZ_FROM_GRAM = {"Tomato", "Turnip"}

for row in load("unl_g2090_seed_counts_longevity.csv"):
    crop = clean(row["crop"])
    name = resolve_common(crop, "unl_g2090")
    if not name:
        continue
    per_gram = parse_quantity(row["seeds_per_gram"])
    per_oz = parse_quantity(row["seeds_per_oz"])
    note = ""
    if crop in G2090_OZ_FROM_GRAM and per_gram:
        scaled = {}
        for key, value in per_gram.items():
            scaled[key] = round(value * GRAMS_PER_OZ) if isinstance(value, float) else value
        note = (
            "Published seeds/oz is a 10x transcription error (numeric_audit.csv, "
            "internal_oz_vs_gram). Rebuilt from the seeds/gram column."
        )
        per_oz = scaled
    entry = {
        "cropLabel": crop,
        "sourceKey": "unlG2090",
        "perOz": per_oz,
        "perGram": per_gram,
    }
    if note:
        entry["correction"] = note
    add_count(name, entry)

    years = parse_quantity(row["longevity_years_cool_dry"])
    if years:
        add(name, "longevity", {
            "cropLabel": crop,
            "sourceKey": "unlG2090",
            "years": years,
            "condition": "cool, dry (unspecified baseline)",
        })

for row in load("osborne_seed_counts.csv"):
    crop = clean(row["crop"])
    name = resolve_common(crop, "osborne_counts")
    if not name:
        continue
    add_count(name, {
        "cropLabel": crop,
        "sourceKey": "osborne",
        "perOz": parse_quantity(row["seeds_per_oz"]),
        "perLb": parse_quantity(row["seeds_per_lb"]),
    })

for row in load("osborne_seed_viability_years.csv"):
    crop = clean(row["crop"])
    name = resolve_common(crop, "osborne_viability")
    years = parse_quantity(row["viability_years"])
    if name and years:
        add(name, "longevity", {
            "cropLabel": crop,
            "sourceKey": "osborne",
            "years": years,
        })

for row in load("johnnys_storage_life_years.csv"):
    crop = clean(row["crop"])
    name = resolve_common(crop, "johnnys")
    years = parse_quantity(row["avg_storage_life_years"])
    if name and years:
        add(name, "longevity", {
            "cropLabel": crop,
            "sourceKey": "johnnys",
            "years": years,
            "group": clean(row["category"]),
        })

for row in load("wpsm_woody_seeds_per_weight.csv"):
    name = resolve_binomial(row["species"], "wpsm")
    if not name:
        continue
    entry = {"cropLabel": clean(row["species"]), "sourceKey": "wpsm"}
    avg_lb = parse_number(row["seeds_per_lb_avg"])
    avg_kg = parse_number(row["seeds_per_kg_avg"])
    low = parse_number(row["seeds_per_lb_low"])
    high = parse_number(row["seeds_per_lb_high"])

    # Some WPSM chapters give only an observed low-high range with no average.
    # Those rows have to land in perLb as a span, not in a side field: a count
    # the model cannot read is a count deleted.
    if avg_lb:
        entry["perLb"] = {"value": avg_lb}
        if low and high:
            entry["perLbRange"] = {"low": low, "high": high}
    elif low and high:
        entry["perLb"] = {"low": low, "high": high}
    if avg_kg:
        entry["perKg"] = {"value": avg_kg}
    add_count(name, entry)

for row in load("nrcs_tx_seeds_per_pound.csv"):
    name = resolve_binomial(row["scientific_name"], "nrcs_tx")
    value = parse_number(row["seeds_per_lb_pure_seed"])
    if name and value:
        add_count(name, {
            "cropLabel": clean(row["common_name"]),
            "sourceKey": "nrcsTx",
            "perLb": {"value": value},
            "basis": "pure seed",
        })

for row in load("figshare_thousand_seed_weight_counts.csv"):
    name = resolve_binomial(row["species"], "figshare")
    if not name:
        continue
    add_count(name, {
        "cropLabel": strip_authority(row["species"]),
        "sourceKey": "figshareTsw",
        "perOz": {"value": parse_number(row["seeds_per_oz"])},
        "perLb": {"value": parse_number(row["seeds_per_lb"])},
        "perGram": {"value": parse_number(row["seeds_per_gram"])},
        "thousandSeedWeightG": parse_number(row["thousand_seed_weight_g"]),
        "material": clean(row["material"]),
    })

# --------------------------------------------------------------------------
# Germination conditions
# --------------------------------------------------------------------------

"""G2090 prints seeded and seedless watermelon as one row carrying two values in
every numeric cell ("70 85", "21 30", "4-5 5-6"). Flattened, not one field
parsed, so the entry reached the browser holding a germination percentage and
nothing else and the card rendered "NaN C". The two columns are recoverable, so
the row is split back into the two crops the table actually prints."""
# Seedless watermelon is the triploid, which is the label Osborne already uses
# for its seed count, so the split lands both crops in the groups that exist.
G2090_SPLIT_GERMINATION = {
    "Watermelon Seeded Seedless": ("Watermelon", "Watermelon (Triploid)"),
}

GERMINATION_NUMERIC = ("min_percent_germination", "temp_min_c", "temp_opt_c",
                       "temp_max_c", "days_to_germinate")


def split_germination_row(row, crop):
    """Yield (crop_label, row) pairs, splitting a two-column row if needed."""
    labels = G2090_SPLIT_GERMINATION.get(crop)
    if not labels:
        yield crop, row
        return
    for index, label in enumerate(labels):
        variant = dict(row)
        for column in GERMINATION_NUMERIC:
            parts = clean(row[column]).split()
            # A cell holding one value applies to both crops.
            variant[column] = parts[index] if len(parts) > index else (parts[0] if parts else "")
        yield label, variant


for row in load("unl_g2090_germination_conditions.csv"):
    for crop, values in split_germination_row(row, clean(row["crop"])):
        name = resolve_common(crop, "unl_g2090_germination")
        if not name:
            continue
        entry = {
            "cropLabel": crop,
            "sourceKey": "unlG2090",
            "minPercent": parse_number(values["min_percent_germination"]),
            "tempMinC": parse_number(values["temp_min_c"]),
            "tempOptC": parse_number(values["temp_opt_c"]),
            "tempMaxC": parse_number(values["temp_max_c"]),
            # parse_number dropped every range here, so cucumber, eggplant,
            # lettuce, muskmelon, onion and watermelon showed no days at all.
            "daysToGerminate": parse_quantity(values["days_to_germinate"]),
        }
        # A germination row with no temperature is not a germination row. It
        # would show as a crop the user can select and then answer nothing.
        if entry["tempOptC"] is None:
            skipped_germination.append((name, crop))
            continue
        add(name, "germination", entry)

# --------------------------------------------------------------------------
# Viability constants. K_E, C_W, C_H and C_Q travel together or not at all.
# --------------------------------------------------------------------------

def constant_set(ke, cw, ch, cq):
    values = [parse_number(ke), parse_number(cw), parse_number(ch), parse_number(cq)]
    if any(v is None for v in values):
        return None
    return {"KE": values[0], "CW": values[1], "CH": values[2], "CQ": values[3]}


def dedupe_constants(record):
    """Fold parameter sets that are numerically identical into one entry.

    Barley, Terminalia brassii and Ulmus carpinifolia each carried the same
    four constants twice under different source keys. Two identical rows read
    as two independent determinations, which is the opposite of what they are:
    the appendix and the standard-error table publish the same fit. They merge,
    the surviving entry gains whatever fields only the duplicate held, and the
    second citation is kept as corroboration.
    """
    entries = record.get("constants") or []
    if len(entries) < 2:
        return
    kept = []
    for entry in entries:
        signature = (entry["KE"], entry["CW"], entry["CH"], entry["CQ"])
        match = next(
            (k for k in kept if (k["KE"], k["CW"], k["CH"], k["CQ"]) == signature), None
        )
        if not match:
            kept.append(entry)
            continue
        for key, value in entry.items():
            if key != "sourceKey" and value not in (None, ""):
                match.setdefault(key, value)
        match.setdefault("corroboratedBy", []).append(entry["sourceKey"])
    record["constants"] = kept


# numeric_audit.csv, status FAIL, check KE_transcription_conflict: the Dickie &
# Ellis scan OCRs lettuce K_E as "6-985". Hay's worked examples reproduce
# 56,040 d and 12,404 d only with 6.895, and the 1996 compendium appendix
# agrees. The CSV keeps the scan; the bundle gets the correct value.
# Keyed by DOI so a reworded citation string cannot repoint a source.
# These keys must exist in js/seed_storage_lab/seed-source-map.js.
SUPPLEMENTARY_SOURCE_KEYS = {
    "10.15258/sst.2011.39.2.23": "demir2011Cucurbits",
    "10.21273/HORTSCI.44.6.1679": "demir2009Pepper",
    "10.15258/sst.2022.50.1.09": "ellisBaumLentil",
}

KE_OVERRIDES = {
    ("Lactuca sativa", "dickieEllis1990"): (
        6.895,
        "Source scan OCRs K_E as 6-985; corrected to 6.895 per numeric_audit.csv "
        "(KE_transcription_conflict).",
    ),
}

for row in load("kew_viability_constants_appendix1.csv"):
    name = resolve_binomial(row["species"], "kew_appendix1")
    values = constant_set(row["KE"], row["CW"], row["CH"], row["CQ"])
    if not name or not values:
        continue
    entry = dict(values)
    entry.update({
        "sourceKey": "kewAppendix1",
        "reference": clean(row["reference"]),
        "verification": "published_appendix",
        "publishedYearsMinus20C": parse_number(row["years_minus20c_5pct"]),
        "publishedYears15C15RH": parse_number(row["years_15c_15rh"]),
        "note": clean(row["notes"]),
    })
    add(name, "constants", entry)

for row in load("supplementary_viability_constants.csv"):
    name = resolve_binomial(row["species"], "supplementary_constants")
    values = constant_set(row["KE"], row["CW"], row["CH"], row["CQ"])
    if not name or not values:
        continue
    entry = dict(values)
    entry.update({
        "sourceKey": SUPPLEMENTARY_SOURCE_KEYS[clean(row["source_doi"])],
        "reference": clean(row["source"]),
        "doi": clean(row["source_doi"]),
        "verification": clean(row["verification_status"]),
        "cultivar": clean(row["cultivar"]),
        "moistureRangeTestedPct": clean(row["moisture_range_tested_pct"]),
        "temperatureTestedC": parse_number(row["temperature_tested_c"]),
        "note": clean(row["notes"]),
    })
    add(name, "constants", entry)

for row in load("ellis_roberts_viability_constants.csv"):
    name = resolve_binomial(row["species"], "dickie_ellis_se")
    values = constant_set(row["KE"], row["CW"], "0.0329", "0.000478")
    if not name or not values:
        continue
    entry = dict(values)
    override = KE_OVERRIDES.get((name, "dickieEllis1990"))
    if override:
        entry["KE"] = override[0]
        entry["correction"] = override[1]
    entry.update({
        "sourceKey": "dickieEllis1990",
        "reference": clean(row["primary_source"]),
        "verification": "published_with_standard_errors",
        "KE_se": parse_number(row["KE_se"]),
        "CW_se": parse_number(row["CW_se"]),
        "CH_se": 0.00171,
        "CQ_se": 0.0000204,
        "seedSurvivalCurves": parse_number(row["seed_survival_curves"]),
        "note": clean(row["notes"]),
    })
    add(name, "constants", entry)

for record in species.values():
    dedupe_constants(record)

# --------------------------------------------------------------------------
# Storage behaviour: the safety gate
# --------------------------------------------------------------------------

# Curated flags win over the bulk vol-2 extraction, and a species-level flag
# always wins over its genus. Acer saccharinum is recalcitrant while
# A. platanoides is orthodox with published constants, so a genus-wide gate
# would be wrong in both directions.
genus_flags = {}
species_flags = {}

behaviour_rows = load("storage_behaviour_flags.csv")

# 39 of the curated flag taxa never appear in species_index.csv, because the
# index is built from datasets that carry numbers and these taxa have none: garlic, potato and banana are grown vegetatively, mango and
# avocado are recalcitrant. They still have to be searchable, or the tool
# answers "not found" to "garlic" when the honest answer is "grown from
# cloves, not seed". Each one is admitted as its own record.
for row in behaviour_rows:
    taxon = clean(row["taxon"])
    if not taxon or taxon in species:
        continue
    commons = [c.strip() for c in clean(row["common_names"]).split(";") if c.strip()]
    species[taxon] = {
        "id": slugify(taxon),
        "scientificName": taxon,
        "rank": clean(row["rank"]),
        "commonNames": commons,
        "counts": [],
        "longevity": [],
        "germination": [],
        "constants": [],
        "behaviour": None,
        "notes": [],
    }
    by_scientific[taxon.lower()] = taxon
    for common in commons:
        by_common.setdefault(common.lower(), set()).add(taxon)

for row in behaviour_rows:
    taxon = clean(row["taxon"])
    # in_scope is an editorial verdict the gate re-derives from `behaviour` and
    # `propagation`, so it stays in the CSV and out of the bundle. Shipping a
    # field nothing reads invites a future reader to trust it.
    record = {
        "behaviour": clean(row["behaviour"]),
        "propagation": clean(row["propagation"]),
        "matchedRank": clean(row["rank"]),
        "matchedTaxon": taxon,
        "note": clean(row["notes"])[:220],
        "sourceKey": "ipgri1996",
    }
    if clean(row["rank"]) == "genus":
        genus_flags[taxon] = record
    else:
        species_flags[taxon] = record

vol2 = {}
for row in load("kew_1998_storage_behaviour_vol2.csv"):
    vol2[clean(row["species"])] = {
        "behaviour": clean(row["behaviour"]),
        "uncertain": clean(row["uncertain"]) == "yes",
        "provisional": clean(row["provisional"]) == "yes",
        "matchedRank": "species",
        "matchedTaxon": clean(row["species"]),
        "note": clean(row["evidence"])[:110],
        "sourceKey": "kewCompendium1998",
    }

# Precedence is right, but resolving it silently was not. A vol-2 species row
# outranks a curated genus flag, and 37 taxa move from a desiccation-sensitive
# genus flag to orthodox that way: Carya illinoensis, C. laciniosa, C. ovata
# and Juglans microcarpa all leave a recalcitrant genus flag behind and collect
# a full storage-life projection. Sourced species data does beat a genus
# generalisation, so the winner stands. But the tool's rule is that disagreeing
# sources are both carried and the disagreement reported, and that rule was
# being applied to seed counts while the higher-stakes field discarded the
# loser. The overruled flag now travels with the winner.
for name, record in species.items():
    genus = name.split()[0]
    ranked = [species_flags.get(name), vol2.get(name), genus_flags.get(genus)]
    flag = next((candidate for candidate in ranked if candidate), None)
    if not flag:
        continue
    record["behaviour"] = dict(flag)
    # not_applicable answers a different question from the other three. Potato
    # true seed is orthodox and potatoes are still grown from tubers, so vol 2
    # calling Solanum tuberosum orthodox does not contradict the curated flag
    # and must not be reported as a disagreement.
    overruled = next(
        (candidate for candidate in ranked
         if candidate is not None
         and candidate is not flag
         and candidate["behaviour"] != flag["behaviour"]
         and "not_applicable" not in (candidate["behaviour"], flag["behaviour"])),
        None,
    )
    if overruled:
        record["behaviour"]["overruled"] = {
            "behaviour": overruled["behaviour"],
            "matchedRank": overruled["matchedRank"],
            "matchedTaxon": overruled["matchedTaxon"],
            "sourceKey": overruled["sourceKey"],
        }

# --------------------------------------------------------------------------
# Cross-source conflicts surfaced to the user
# --------------------------------------------------------------------------

CONFLICT_NOTES = {
    "Lactuca sativa": "Three seed-count determinations spanning 13.5x. G2090 gives 25,000/oz "
                      "and the thousand-seed-weight data 25,267/oz; Osborne gives 1,875-3,125/oz. "
                      "Two independent sources agree, so Osborne is the outlier. Do not average.",
    "Cucumis melo": "Two published viability parameterisations differ by roughly 3x "
                    "in predicted longevity. Both are shown; they are not interchangeable.",
    "Hordeum vulgare": "One parameter set is held here (K_E 9.144, C_W 5.342, universal C_H/C_Q). "
                       "Ellis & Roberts 1980b publish a second, non-interchangeable set whose "
                       "predictions differ 3.66x; see numeric_audit.csv. Never mix K_E/C_W from "
                       "one with C_H/C_Q from the other.",
    "Allium cepa": "Two independent determinations in the same appendix give 413 y and "
                   "843 y at -20 C / 5% MC.",
}

for name, note in CONFLICT_NOTES.items():
    if name in species:
        species[name]["notes"].append(note)

# --------------------------------------------------------------------------
# Emit
# --------------------------------------------------------------------------

def prune(value):
    """Drop empty strings, empty containers and Nones so the bundle stays small."""
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            pruned = prune(item)
            if pruned not in (None, "", [], {}):
                out[key] = pruned
        return out
    if isinstance(value, list):
        return [prune(item) for item in value if prune(item) not in (None, "", [], {})]
    return value


records = []
for name in sorted(species):
    record = prune(species[name])
    if not any(record.get(key) for key in ("counts", "longevity", "constants", "germination")):
        # A behaviour flag alone still matters: it is how the gate refuses.
        if not record.get("behaviour"):
            continue
    # Redundancy trimmed on the way out: "species" is the default rank, and a
    # crop label that repeats the binomial carries nothing. The UI restores
    # both. The has* flags are derived at load time.
    if record.get("rank") == "species":
        record.pop("rank", None)
    for entry in record.get("counts", []) + record.get("longevity", []):
        if entry.get("cropLabel") == name:
            entry.pop("cropLabel", None)
    records.append(record)

lines = [
    "// GENERATED FILE - DO NOT EDIT BY HAND.",
    "//",
    "// Source: data/seed_storage_lab/*.csv",
    "// Regenerate: python scripts/build-seed-species-data.py",
    "//",
    "// The CSVs reproduce their sources verbatim, transcription errors included;",
    "// numeric_audit.csv records the findings and the generator is the single",
    "// place they are corrected. Entries carry a `correction` field wherever a",
    "// published number was overridden.",
    "//",
    "// Nothing here is averaged across sources. Where sources disagree, every",
    "// determination is kept as its own entry and the species carries a note.",
    "",
    f"export const SEED_SPECIES_COUNT = {len(records)};",
    "",
    "export const SEED_SPECIES = Object.freeze([",
]
for record in records:
    lines.append("    " + json.dumps(record, ensure_ascii=False, sort_keys=False) + ",")
lines.append("]);")
lines.append("")
lines.append("export const SEED_SPECIES_BY_ID = Object.freeze(")
lines.append("    SEED_SPECIES.reduce((acc, entry) => { acc[entry.id] = entry; return acc; }, {})")
lines.append(");")
lines.append("")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with io.open(OUT, "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n".join(lines))

# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

counts_n = sum(1 for r in records if r.get("counts"))
long_n = sum(1 for r in records if r.get("longevity"))
const_n = sum(1 for r in records if r.get("constants"))
germ_n = sum(1 for r in records if r.get("germination"))
gated = [r for r in records if (r.get("behaviour") or {}).get("behaviour") == "recalcitrant"]
gated_with_counts = [r for r in gated if r.get("counts")]

print(f"wrote {OUT}")
print(f"  species          {len(records)}")
print(f"  with counts      {counts_n}")
print(f"  with longevity   {long_n}")
print(f"  with constants   {const_n}")
print(f"  with germination {germ_n}")
print(f"  recalcitrant     {len(gated)} ({len(gated_with_counts)} of them carry seed counts)")
print(f"  bytes            {os.path.getsize(OUT):,}")

if skipped_germination:
    print(f"\n  germination rows with no usable temperature ({len(skipped_germination)}):")
    for taxon, label in skipped_germination:
        print(f"    {taxon}: {label}")

if skipped_counts:
    print(f"\n  count entries with no usable number ({len(skipped_counts)}):")
    for taxon, source, label in skipped_counts:
        print(f"    {taxon}: {source} lists \"{label}\" without a figure")

if unresolved:
    print(f"\n  UNRESOLVED LABELS ({len(unresolved)}):", file=sys.stderr)
    for dataset, label in unresolved[:40]:
        print(f"    {dataset:26s} {label}", file=sys.stderr)
    if len(unresolved) > 40:
        print(f"    ... and {len(unresolved) - 40} more", file=sys.stderr)
