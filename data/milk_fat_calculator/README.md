# Milk Fat Calculator sources

The figures behind `tools/milk-fat-calculator.html` (they live in
`js/milk_fat_calculator/milk-fat-data.js`, and the spec checks them against
`products.csv`). Documents in `sources/` are local only;
`download_manifest.csv` keeps the SHA-256 of each file that was read.

## What each figure rests on

- **Fat per 100 g and grams per cup** for the eight products: USDA
  FoodData Central, SR Legacy, read through the FDC API. Fat is nutrient 1004
  (total lipid). Cup weights are USDA's "1 cup" portions, rounded by USDA to
  whole grams, so a density from them is good to about 0.2%. They give the
  same density as USDA's fluid ounce and quart portions within that
  rounding. No temperature is stated.
- **Legal fat ranges**: 21 CFR 131 (2024). Milk 131.110, at least 3 1/4
  percent; half-and-half 131.180, at least 10.5 and under 18; light cream
  131.155, at least 18 and under 30; light whipping cream 131.157, at least 30
  and under 36; heavy cream 131.150, at least 36. Part 131 does not say these
  are by weight; the dry-product sections in the same part do. 2%, 1% and skim
  are named under other rules that were not read, so the tool gives them no
  range.
- **Label rounding and label measures**: 21 CFR 101.9 (2024). (c)(2): fat to
  the nearest 0.5 g below 5 g, the nearest gram above, and zero under 0.5 g.
  (b)(5)(viii): a teaspoon is 5 mL, a tablespoon 15 mL, a cup 240 mL, 1 fl oz
  30 mL and 1 oz in weight 28 g.

## Not used

- The FDA rule on how far a product's actual fat may differ from its label
  was not read, so the tool states only the rounding range.
- No density was taken from any source other than the USDA portions. A
  custom fat % gets a density interpolated between them.
