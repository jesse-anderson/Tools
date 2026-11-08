// Products, units and legal ranges. Sources in data/milk_fat_calculator/README.md;
// the spec checks PRODUCTS against data/milk_fat_calculator/products.csv.

// USDA FoodData Central, SR Legacy: fat in g per 100 g, and grams in USDA's 1 cup.
export const PRODUCTS = [
    { id: 'whole', name: 'Whole milk', fdcId: 171265, fatPercent: 3.25, cupGrams: 244 },
    { id: 'reduced2', name: '2% milk', fdcId: 171267, fatPercent: 1.98, cupGrams: 244 },
    { id: 'lowfat1', name: '1% milk', fdcId: 170872, fatPercent: 0.97, cupGrams: 244 },
    { id: 'skim', name: 'Skim (nonfat) milk', fdcId: 171269, fatPercent: 0.08, cupGrams: 245 },
    { id: 'halfhalf', name: 'Half-and-half', fdcId: 171255, fatPercent: 11.5, cupGrams: 242 },
    { id: 'light', name: 'Light cream', fdcId: 170857, fatPercent: 19.1, cupGrams: 240 },
    { id: 'lightwhip', name: 'Light whipping cream', fdcId: 170858, fatPercent: 30.91, cupGrams: 239 },
    { id: 'heavy', name: 'Heavy cream', fdcId: 170859, fatPercent: 36.08, cupGrams: 238 },
];

// 21 CFR 131 fat ranges, in percent. `below` is exclusive; null means no upper limit.
export const CFR_RANGES = [
    { name: 'milk', section: '131.110', min: 3.25, below: null },
    { name: 'half-and-half', section: '131.180', min: 10.5, below: 18 },
    { name: 'light cream', section: '131.155', min: 18, below: 30 },
    { name: 'light whipping cream', section: '131.157', min: 30, below: 36 },
    { name: 'heavy cream', section: '131.150', min: 36, below: null },
];

// US customary measures, exact by definition (1 gal = 231 in3, 1 lb = 453.59237 g).
const GALLON_ML = 3785.411784;
export const UNITS = [
    { id: 'floz', label: 'fl oz', kind: 'volume', size: GALLON_ML / 128 },
    { id: 'cup', label: 'cup', kind: 'volume', size: GALLON_ML / 16 },
    { id: 'pint', label: 'pint', kind: 'volume', size: GALLON_ML / 8 },
    { id: 'quart', label: 'quart', kind: 'volume', size: GALLON_ML / 4 },
    { id: 'halfgal', label: 'half gallon', kind: 'volume', size: GALLON_ML / 2 },
    { id: 'gal', label: 'gallon', kind: 'volume', size: GALLON_ML },
    { id: 'tbsp', label: 'tbsp', kind: 'volume', size: GALLON_ML / 256 },
    { id: 'tsp', label: 'tsp', kind: 'volume', size: GALLON_ML / 768 },
    { id: 'ml', label: 'mL', kind: 'volume', size: 1 },
    { id: 'l', label: 'L', kind: 'volume', size: 1000 },
    { id: 'g', label: 'g', kind: 'mass', size: 1 },
    { id: 'kg', label: 'kg', kind: 'mass', size: 1000 },
    { id: 'oz', label: 'oz (weight)', kind: 'mass', size: 28.349523125 },
    { id: 'lb', label: 'lb', kind: 'mass', size: 453.59237 },
];

// Nutrition Facts measures, 21 CFR 101.9(b)(5)(viii). A label cup is 240 mL, not 236.6.
export const LABEL_UNITS = [
    { id: 'ml', label: 'mL', kind: 'volume', size: 1 },
    { id: 'tbsp', label: 'tbsp (15 mL)', kind: 'volume', size: 15 },
    { id: 'tsp', label: 'tsp (5 mL)', kind: 'volume', size: 5 },
    { id: 'floz', label: 'fl oz (30 mL)', kind: 'volume', size: 30 },
    { id: 'cup', label: 'cup (240 mL)', kind: 'volume', size: 240 },
    { id: 'g', label: 'g', kind: 'mass', size: 1 },
    { id: 'oz', label: 'oz (28 g)', kind: 'mass', size: 28 },
];

export const SOURCES = [
    { label: 'USDA FoodData Central, SR Legacy', url: 'https://fdc.nal.usda.gov/' },
    { label: '21 CFR 131, milk and cream', url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-131' },
    { label: '21 CFR 101.9, nutrition labeling', url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9' },
];
