"""Fit the Beta-Alanine Lab carnosine model to each loading paper.

Model (Spelnikov and Harris 2019), rise above baseline in mmol/kg dry muscle:
    dR/dt = s * D(t) - kd * R
D is the daily dose in g/day, s the synthesis slope (mmol/kg dm/day per g/day),
kd the decay constant (1/day). R is linear in s, so for a fixed kd the least
squares s has a closed form. Each loading paper is fitted against each washout
paper's half-life; nothing is pooled across papers.

Reads data/beta_alanine_lab/loading_observations.csv and washout_rates.csv,
writes data/beta_alanine_lab/fits.json. Standard library only.
"""

import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "beta_alanine_lab"
WET_TO_DRY = 4.3  # Bergstrom 1962, as used by Spelnikov and Harris 2019


def parse_schedule(text):
    """'0-7:4.0;7-70:6.4' -> [(0, 7, 4.0), (7, 70, 6.4)]"""
    out = []
    for part in text.split(";"):
        span, dose = part.split(":")
        a, b = span.split("-")
        out.append((float(a), float(b), float(dose)))
    return out


def unit_rise(schedule, day, kd):
    """Rise at `day` for s = 1, exact piecewise solution, zero dose after the schedule."""
    r, t = 0.0, 0.0
    for a, b, dose in schedule:
        if a > t:  # gap with no dose
            end = min(a, day)
            r *= math.exp(-kd * (end - t))
            t = end
        if t >= day:
            return r
        end = min(b, day)
        eq = dose / kd
        r = eq + (r - eq) * math.exp(-kd * (end - a))
        t = end
        if t >= day:
            return r
    return r * math.exp(-kd * (day - t))


def kd_from_half_life(days):
    return math.log(2) / days


def fit_slope(points, kd):
    num = sum(y * unit_rise(sch, d, kd) for sch, d, y in points)
    den = sum(unit_rise(sch, d, kd) ** 2 for sch, d, y in points)
    return num / den


def main():
    obs = list(csv.DictReader(open(DATA / "loading_observations.csv", encoding="utf-8")))
    wash = list(csv.DictReader(open(DATA / "washout_rates.csv", encoding="utf-8")))

    by_paper = {}
    for row in obs:
        if row["role"] != "fit":
            continue
        by_paper.setdefault(row["source_id"], []).append(
            (parse_schedule(row["schedule"]), float(row["day"]), float(row["rise_mmol_kg_dm"])))

    fits = {}
    for w in wash:
        for key in ("low", "central", "high"):
            hl = float(w[f"half_life_days_{key}"])
            kd = kd_from_half_life(hl)
            for paper, points in by_paper.items():
                s = fit_slope(points, kd)
                resid = [y - s * unit_rise(sch, d, kd) for sch, d, y in points]
                rms = math.sqrt(sum(e * e for e in resid) / len(resid))
                fits.setdefault(paper, {}).setdefault(w["source_id"], {})[key] = {
                    "half_life_days": hl, "kd_per_day": round(kd, 6),
                    "slope": round(s, 5), "rms_mmol_kg_dm": round(rms, 3)}

    # Checks behind the curve. Each uses the central half-life of every washout paper.
    checks = {"linear_stellingwerff": [], "emax_half_dose_6_4": [], "observations": []}
    # Stellingwerff 2012: 2.01 mmol/kg ww per 100 g (95% CI 1.83-2.19), a regression of rise on
    # total grams over its own arms and weeks. Their fit must reproduce it; other papers need not.
    lin_points = [([(0, 56, 1.6)], 14), ([(0, 56, 1.6)], 28), ([(0, 56, 1.6)], 56),
                  ([(0, 28, 3.2)], 14), ([(0, 28, 3.2)], 28)]
    lin_target = [round(v * WET_TO_DRY, 3) for v in (1.83, 2.01, 2.19)]
    for paper, per_wash in fits.items():
        for wid, f in per_wash.items():
            c = f["central"]
            kd, s = c["kd_per_day"], c["slope"]
            xs = [sch[0][2] * d for sch, d in lin_points]
            ys = [s * unit_rise(sch, d, kd) for sch, d in lin_points]
            per100 = sum(x * y for x, y in zip(xs, ys)) / sum(x * x for x in xs) * 100
            checks["linear_stellingwerff"].append({
                "loading": paper, "washout": wid, "rise_per_100g": round(per100, 3),
                "target_low_central_high": lin_target,
                "must_pass": paper == "stellingwerff2012",
                "passes": lin_target[0] <= per100 <= lin_target[2]})
            # Emax shape check: cumulative dose at half the maximum rise, at 6.4 g/d.
            checks["emax_half_dose_6_4"].append({
                "loading": paper, "washout": wid,
                "grams": round(6.4 * math.log(2) / kd, 1), "rezende_50pct_cri": [210, 494]})
    for row in obs:
        if row["role"] != "check":
            continue
        sch, d, y = parse_schedule(row["schedule"]), float(row["day"]), float(row["rise_mmol_kg_dm"])
        preds = [fits[p][w]["central"]["slope"] * unit_rise(sch, d, fits[p][w]["central"]["kd_per_day"])
                 for p in fits for w in fits[p]]
        checks["observations"].append({
            "source_id": row["source_id"], "arm": row["arm"], "observed": y,
            "model_min": round(min(preds), 2), "model_max": round(max(preds), 2)})

    out = {"model": "dR/dt = slope * dose - kd * R, R in mmol/kg dry muscle, dose in g/day",
           "wet_to_dry": WET_TO_DRY, "fits": fits, "checks": checks}
    (DATA / "fits.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    return out


if __name__ == "__main__":
    result = main()
    for paper, per_wash in result["fits"].items():
        row = "  ".join(f"{w}:{f['central']['slope']:.4f}(rms {f['central']['rms_mmol_kg_dm']})" for w, f in per_wash.items())
        print(f"{paper:18} {row}")
