// Pure milk fat arithmetic. Fat percents are grams of fat per 100 g; volumes are
// turned into grams with USDA cup weights. No DOM access.

import { PRODUCTS, CFR_RANGES, UNITS, LABEL_UNITS } from './milk-fat-data.js';

export const US_CUP_ML = 3785.411784 / 16;

// Density points (fat %, g/mL) from USDA cup weights, sorted by fat.
const DENSITY_POINTS = PRODUCTS
    .map((p) => [p.fatPercent, p.cupGrams / US_CUP_ML])
    .sort((a, b) => a[0] - b[0]);

export function findUnit(id, list = UNITS) {
    const unit = list.find((u) => u.id === id);
    if (!unit) throw new Error(`Unknown unit: ${id}`);
    return unit;
}

// Density at a fat %, interpolated between USDA products. Outside their span
// the nearest product's density is held and `held` says which end.
export function densityAt(fatPercent) {
    const first = DENSITY_POINTS[0];
    const last = DENSITY_POINTS[DENSITY_POINTS.length - 1];
    if (fatPercent < first[0]) return { gPerMl: first[1], held: 'below' };
    if (fatPercent > last[0]) return { gPerMl: last[1], held: 'above' };
    for (let i = 1; i < DENSITY_POINTS.length; i++) {
        const [x1, y1] = DENSITY_POINTS[i];
        if (fatPercent <= x1) {
            const [x0, y0] = DENSITY_POINTS[i - 1];
            const t = x1 === x0 ? 0 : (fatPercent - x0) / (x1 - x0);
            return { gPerMl: y0 + t * (y1 - y0), held: null };
        }
    }
    return { gPerMl: last[1], held: null };
}

function checkFat(fatPercent, what) {
    if (!Number.isFinite(fatPercent) || fatPercent < 0 || fatPercent > 100) {
        throw new RangeError(`${what}: fat must be a number from 0 to 100%.`);
    }
}

function checkAmount(amount, what) {
    if (!Number.isFinite(amount) || amount < 0) {
        throw new RangeError(`${what}: amount must be a number of zero or more.`);
    }
}

// Grams and milliliters of an amount of product at a fat %.
export function measure(amount, unitId, fatPercent) {
    const unit = findUnit(unitId);
    const density = densityAt(fatPercent);
    if (unit.kind === 'mass') {
        const grams = amount * unit.size;
        return { grams, ml: grams / density.gPerMl, density };
    }
    const ml = amount * unit.size;
    return { grams: ml * density.gPerMl, ml, density };
}

// Express grams of a product at a fat % in a unit.
export function inUnit(grams, unitId, fatPercent) {
    const unit = findUnit(unitId);
    if (unit.kind === 'mass') return grams / unit.size;
    return grams / densityAt(fatPercent).gPerMl / unit.size;
}

// The true fat a rounded label value can stand for, 21 CFR 101.9(c)(2):
// nearest 0.5 g below 5 g, nearest gram above, zero under 0.5 g.
// Returns null when the value is not one a label could print.
export function labelFatRange(declaredGrams) {
    const x = declaredGrams;
    if (!Number.isFinite(x) || x < 0) return null;
    if (x === 0) return { low: 0, high: 0.5 };
    if (x < 5) return Number.isInteger(x * 2) ? { low: x - 0.25, high: x + 0.25 } : null;
    if (x === 5) return { low: 4.75, high: 5.5 };
    return Number.isInteger(x) ? { low: x - 0.5, high: x + 0.5 } : null;
}

// Fat % from grams of fat in a serving. A volume serving needs the density,
// which depends on the fat %, so the two are solved together.
function percentFromServing(fatGrams, serving) {
    if (serving.kind === 'mass') return (100 * fatGrams) / serving.grams;
    let pct = (100 * fatGrams) / (serving.ml * densityAt(0).gPerMl);
    for (let i = 0; i < 60; i++) {
        const next = (100 * fatGrams) / (serving.ml * densityAt(pct).gPerMl);
        if (Math.abs(next - pct) < 1e-13) return next;
        pct = next;
    }
    return pct;
}

// Fat % from a Nutrition Facts panel: fat grams per serving of a label measure.
export function fatFromLabel({ fatGrams, servingAmount, servingUnitId }) {
    if (!Number.isFinite(fatGrams) || fatGrams < 0) {
        throw new RangeError('Label: fat grams must be a number of zero or more.');
    }
    if (!Number.isFinite(servingAmount) || servingAmount <= 0) {
        throw new RangeError('Label: serving size must be more than zero.');
    }
    const unit = findUnit(servingUnitId, LABEL_UNITS);
    const serving = unit.kind === 'mass'
        ? { kind: 'mass', grams: servingAmount * unit.size }
        : { kind: 'volume', ml: servingAmount * unit.size };
    const fatPercent = percentFromServing(fatGrams, serving);
    if (fatPercent > 100) {
        throw new RangeError('Label: that much fat cannot fit in that serving.');
    }
    const range = labelFatRange(fatGrams);
    return {
        fatPercent,
        range: range && {
            low: percentFromServing(range.low, serving),
            high: Math.min(100, percentFromServing(range.high, serving)),
        },
    };
}

// Combine ingredients. Each is { fatPercent, amount, unitId }. Volumes are
// assumed to add, so total volume is the sum of the parts.
export function mix(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new RangeError('Add at least one ingredient.');
    }
    const parts = items.map((item, i) => {
        const what = item.name || `Ingredient ${i + 1}`;
        checkFat(item.fatPercent, what);
        checkAmount(item.amount, what);
        const m = measure(item.amount, item.unitId, item.fatPercent);
        return {
            name: what,
            fatPercent: item.fatPercent,
            grams: m.grams,
            ml: m.ml,
            fatGrams: (m.grams * item.fatPercent) / 100,
            densityHeld: m.density.held,
        };
    });
    const grams = parts.reduce((s, p) => s + p.grams, 0);
    const ml = parts.reduce((s, p) => s + p.ml, 0);
    const fatGrams = parts.reduce((s, p) => s + p.fatGrams, 0);
    return {
        parts,
        grams,
        ml,
        fatGrams,
        fatPercent: grams > 0 ? (100 * fatGrams) / grams : null,
    };
}

// Which 21 CFR 131 fat range a percent falls in. Fat only: a legal name also
// needs other conditions this tool does not check.
export function classify(fatPercent) {
    const pct = Math.round(fatPercent * 1e9) / 1e9;
    const creams = CFR_RANGES.filter((r) => r.name !== 'milk');
    const cream = creams.find((r) => pct >= r.min && (r.below === null || pct < r.below));
    if (cream) return cream;
    const milk = CFR_RANGES.find((r) => r.name === 'milk');
    if (pct >= milk.min) return milk;
    return null;
}

function targetCheck(fats, target) {
    checkFat(target, 'Target');
    const lo = Math.min(...fats);
    const hi = Math.max(...fats);
    if (target < lo || target > hi) return { status: 'unreachable', lo, hi };
    return null;
}

// How much of an add-in brings a base to a target fat %. Mass balance:
// added = base * (base% - target) / (target - add%).
export function solveAddition({ base, addFatPercent, targetPercent, outUnitId }) {
    checkFat(base.fatPercent, 'Base');
    checkFat(addFatPercent, 'Add-in');
    checkAmount(base.amount, 'Base');
    const b = measure(base.amount, base.unitId, base.fatPercent);
    if (base.amount === 0) throw new RangeError('Base: amount must be more than zero.');
    const bad = targetCheck([base.fatPercent, addFatPercent], targetPercent);
    if (bad) return bad;
    if (Math.abs(targetPercent - base.fatPercent) < 1e-12) {
        return { status: 'ok', addGrams: 0, addAmount: 0, total: mixOf(b.grams, base.fatPercent, 0, addFatPercent) };
    }
    if (Math.abs(targetPercent - addFatPercent) < 1e-12) return { status: 'never' };
    const addGrams = (b.grams * (base.fatPercent - targetPercent)) / (targetPercent - addFatPercent);
    return {
        status: 'ok',
        addGrams,
        addAmount: inUnit(addGrams, outUnitId, addFatPercent),
        total: mixOf(b.grams, base.fatPercent, addGrams, addFatPercent),
    };
}

// A batch of a given size at a target %, from two products (Pearson square by mass).
export function solveBatch({ aFatPercent, bFatPercent, targetPercent, amount, unitId, outUnitId }) {
    checkFat(aFatPercent, 'First product');
    checkFat(bFatPercent, 'Second product');
    checkAmount(amount, 'Batch');
    if (amount === 0) throw new RangeError('Batch: amount must be more than zero.');
    const bad = targetCheck([aFatPercent, bFatPercent], targetPercent);
    if (bad) return bad;
    const xa = aFatPercent === bFatPercent ? 1 : (targetPercent - bFatPercent) / (aFatPercent - bFatPercent);
    const xb = 1 - xa;
    const unit = findUnit(unitId);
    let grams;
    if (unit.kind === 'mass') {
        grams = amount * unit.size;
    } else {
        const mlPerGram = xa / densityAt(aFatPercent).gPerMl + xb / densityAt(bFatPercent).gPerMl;
        grams = (amount * unit.size) / mlPerGram;
    }
    const aGrams = xa * grams;
    const bGrams = xb * grams;
    return {
        status: 'ok',
        aGrams,
        bGrams,
        aAmount: inUnit(aGrams, outUnitId, aFatPercent),
        bAmount: inUnit(bGrams, outUnitId, bFatPercent),
        total: mixOf(aGrams, aFatPercent, bGrams, bFatPercent),
    };
}

function mixOf(aGrams, aFat, bGrams, bFat) {
    return mix([
        { fatPercent: aFat, amount: aGrams, unitId: 'g' },
        { fatPercent: bFat, amount: bGrams, unitId: 'g' },
    ]);
}
