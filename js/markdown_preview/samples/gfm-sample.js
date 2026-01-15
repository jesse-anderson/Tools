/**
 * GitHub Flavored Markdown (GFM) 0.29 Sample Content
 * Demonstrates GFM extensions (tables, task lists, strikethrough, autolinks)
 */
export const GFM_SAMPLE = `# 1,3-Propanediol (1,3-PDO) Production via *Lactobacillus reuteri* CH53 (Fed-Batch Fermentation)

A process description for producing **1,3-propanediol (1,3-PDO)** from **crude glycerol** using an anaerobic, fed-batch fermentation train with downstream **biomass removal**, **water removal**, and **multi-column distillation** to reach ~**99.5%** product purity.

## Overview

This chosen route produces 1,3-PDO by **microbial glycerol fermentation** using *Lactobacillus reuteri* CH53 under **anaerobic conditions**. The end-to-end process has four major steps:

1. **Preparation** (media blending + sterilization + splitting to seed fermentors)
2. **Fermentation** (seed train -> product fermentor)
3. **Biomass separation** (hydrocyclones -> ultrafiltration)
4. **Distillation** (after reverse osmosis water removal)

> Key idea: fermentation broth is clarified (remove cells), concentrated (remove water), then fractionated (distillation) to isolate 1,3-PDO and co-products.

---

## Feedstocks & Utilities

### Required Inputs

| Category | Material | Purpose / Notes |
|---|---|---|
| Carbon | Crude glycerol | Primary substrate for 1,3-PDO formation |
| Carbon | Glucose (sugar solution) | Co-substrate / electron acceptor (co-fermentation) |
| Nitrogen + nutrients | Corn steep liquor (CSL) | Nitrogen source + nutrients (incl. vitamin B12 in the media context) |
| Utilities | Water (fresh + recycle) | Media prep; significant recycle from water removal |
| Utilities | Nitrogen gas (N₂) | Maintain anaerobic conditions; purge dissolved O₂ |
| pH control | NaOH / H₂SO₄ | Split-range pH control around setpoint |
| (Optional upstream) Enzymes | Cellulase + β-glucosidase | Used if producing glucose from corn stover (on-demand option) |

### Quality Control Checklist

- [x] Confirm sterilization cycle completed for media streams (CSL + carbon mix)
- [x] Verify **pH probe** calibrated; setpoint **pH = 5.5**
- [x] Verify **dissolved O₂** sensor functional (target near 0% O₂)
- [x] Confirm N₂ sparge available at target flow (e.g., vvm basis)
- [ ] Verify seed inoculum viability and **OD₆₀₀** trending toward target
- [ ] Confirm recycle water routing/valving to blending tanks is enabled

---

## Process Steps

## 1) Preparation (Media Blending + Sterilization + Split)

**Goal:** prepare two sterile media streams (CSL solution; glycerol+glucose solution), then split into staged seed fermentors and the product fermentor.

**High-level sequence:**

\`\`\`
1. Blend CSL + water (ambient)
2. Heat-sterilize CSL stream (high temperature) and cool to fermentation temperature
3. Blend glycerol + glucose + water (note: much water may come from recycle)
4. Heat-sterilize carbon stream and transfer to storage
5. Split sterile media into 4 streams: 90 : 9 : 0.9 : 0.1
   - 0.1% -> Seed 1
   - 0.9% -> Seed 2
   - 9%   -> Seed 3
   - 90%  -> Product fermentor
\`\`\`

**Notes**
- The split is typically implemented with flow measurement + ratio control to maintain the target proportions.
- Sterility is a major risk driver; contamination can ruin a batch.

---

## 2) Fermentation (Seed Train -> Product Fermentor)

**Goal:** scale inoculum through multiple seed fermentors, then run production fermentation in the main fermentor.

### Operating Targets (typical)

| Unit | Mode | Temperature | Pressure | pH | Agitation | Duration |
|---|---|---:|---:|---:|---:|---:|
| Seed fermentors | Fed-batch | 98.6 °F | 14.7 psia | 5.5 | 100 rpm | ~9 hr each |
| Product fermentor | Fed-batch | 98.6 °F | 14.7 psia | 5.5 | (scale-dependent) | ~24 hr |

### Substrate ratio

Maintain a **molar ratio (glucose : glycerol) = 0.5** for the mixed feed stream.

### Anaerobic control

During incubation, sparge **N₂** to maintain anaerobic conditions and strip dissolved oxygen.

\`\`\`
If dissolved O₂ rises:
  - Increase N₂ purge flow
  - Check foaming / agitation / seal integrity
  - Verify O₂ sensor (Clark electrode) response
\`\`\`

---

## 3) Biomass Separation (Hydrocyclones -> Ultrafiltration)

**Goal:** remove biomass (cells) from the fermentation broth before downstream concentration and distillation.

### 3A) Hydrocyclones

- Broth is pumped to hydrocyclones to stabilize **inlet flowrate/pressure**.
- Typical feed stream water content can be ~70%.
- Underflow biomass slurry can be routed for disposal or reuse (e.g., drying for fuel stock / feed).

**Hydrocyclone power heuristic (as used in the write-up):**

\`\`\`
Power Output ≈ Flowrate * Pressure Drop
\`\`\`

### 3B) Ultrafiltration

- Removes remaining biomass particles not captured by hydrocyclones.
- Key controls: pressure across the filter (manage ∆P), and crossflow velocity (tradeoff: purity vs flux).

---

## 4) Water Removal (Reverse Osmosis)

**Goal:** remove most remaining water to reduce distillation load and improve economics.

Key monitored variables typically include:
- inlet flowrate & pressure (protect membrane)
- pH (limit precipitation/fouling)
- recovery rate (targeting very high water removal)
- permeate flowrate

**Recycle:** permeate water is routed back to the blending tanks as a recycle stream.

---

## 5) Distillation Train (3 Columns)

**Goal:** reach high product purity for 1,3-PDO and recover co-products.

### Column Operating Conditions

| Column | Pressure | Top Temp | Bottom Temp | Top Product | Bottom Product |
|---|---:|---:|---:|---|---|
| Column 1 | 2.18 psia | 164 °F | 323 °F | Light products (ethanol + acetic acid) | Heavy (lactic acid + 1,3-PDO) |
| Column 2 | 2.18 psia | 97.7 °F | 148.9 °F | Ethanol | Acetic acid |
| Column 3 | 2.18 psia | 286.3 °F | 310.7 °F | 1,3-PDO | Lactic acid |

### Example Product Purities (targets/outcomes)

- **1,3-PDO:** ~99.54% (Column 3 top)
- **Lactic acid:** ~98.16% (Column 3 bottom)
- **Ethanol:** ~99.9999% (Column 2 top)
- **Acetic acid:** ~99.16% (Column 2 bottom)

---

## Expected Results

Typical performance targets for the chosen fermentation route include:

- Conversion/yield basis example: **0.82 g 1,3-PDO / g glycerol**
- Broth concentration example: **~68 g/L 1,3-PDO**
- Productivity example: **~1.27 g/L/hr**
- Final product purity target: **~99.5% 1,3-PDO** via distillation

Validate by:
- compositional analysis of distillate streams (GC/HPLC as appropriate)
- mass balance closure across RO + distillation
- fermentation KPIs (OD₆₀₀(Optical Density) trends, substrate consumption, byproduct profile)

---

## Risks & Operational Notes

- **Contamination risk**: sterilization and closed handling are critical.
- **Strain drift/mutation**: maintain consistent cell banking and seed management.
- **Membrane fouling**: ultrafiltration/RO performance is sensitive to solids, pH, and precipitation.
- **Control complexity**: pH, temperature, anaerobic conditions, and flow splitting all require robust instrumentation.

---

*Example derived from a UIC Chemical Engineering process description (Report #4).*
*Draft format intended for Markdown preview tooling and documentation demos.*`;
