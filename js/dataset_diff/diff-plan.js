// Worksheet pair plans and their combined verdicts. Pure, no DOM.
//
// An inventory side is { label, sheets: [{ name, hidden }] }; a delimited
// file or a paste is one sheet. A pair is
// { id, include, left: { sheet, range }, right: { sheet, range } }, where a
// null range means the sheet's detected range.

// Exact-name suggestions in left order. Tab position is never a reason to pair.
export function suggestPairs(left, right) {
    const rightNames = new Set(right.sheets.map((s) => s.name));
    return left.sheets
        .filter((s) => rightNames.has(s.name))
        .map((s, i) => ({
            id: `p${i + 1}`, include: true,
            left: { sheet: s.name, range: null }, right: { sheet: s.name, range: null },
        }));
}

const place = (p) => `${p.sheet}\u0000${p.range ?? ''}`;

// Checks a plan before it runs. Errors stop the run; missing sheets make
// their pair incomplete; reuse and excluded sheets are shown, not refused.
export function validatePlan(pairs, inventory) {
    const included = pairs.filter((p) => p.include);
    const errors = [];
    if (included.length === 0) errors.push({ kind: 'no-pairs' });

    const seen = new Map();
    for (const p of included) {
        const key = `${place(p.left)}\u0001${place(p.right)}`;
        if (seen.has(key)) errors.push({ kind: 'duplicate-pair', pairs: [seen.get(key), p.id] });
        else seen.set(key, p.id);
    }

    const names = {
        left: new Set(inventory.left.sheets.map((s) => s.name)),
        right: new Set(inventory.right.sheets.map((s) => s.name)),
    };
    const status = included.map((p) => {
        const missing = ['left', 'right'].filter((side) => !names[side].has(p[side].sheet));
        return { id: p.id, ready: missing.length === 0, missing };
    });

    const reuse = { left: [], right: [] };
    const excluded = { left: [], right: [] };
    for (const side of ['left', 'right']) {
        const uses = new Map();
        for (const p of included) uses.set(p[side].sheet, (uses.get(p[side].sheet) || 0) + 1);
        for (const [sheet, n] of uses) if (n > 1) reuse[side].push({ sheet, pairs: n });
        for (const s of inventory[side].sheets) {
            if (!uses.has(s.name)) excluded[side].push({ name: s.name, hidden: !!s.hidden });
        }
    }
    return { ok: errors.length === 0, errors, status, reuse, excluded };
}

// Stand-in result for a pair that did not produce one.
export function incompletePair(reason, detail = {}) {
    return {
        sameOrder: { verdict: 'incomplete' }, sorted: { verdict: 'incomplete' },
        incomplete: { reason, ...detail },
    };
}

function combine(verdicts) {
    if (verdicts.includes('incomplete')) return 'incomplete';
    if (verdicts.some((v) => v !== 'match')) return 'different';
    return 'match';
}

// Per check: incomplete if any pair is; otherwise different if any pair
// differs or has a schema difference; match only if every pair matches.
// Row totals are summed across pairs, so a reused range counts twice.
export function aggregate(results) {
    if (!results.length) throw new Error('aggregate needs at least one pair');
    const sum = (k) => results.reduce((n, r) => n + (r[k] || 0), 0);
    return {
        sameOrder: combine(results.map((r) => r.sameOrder.verdict)),
        sorted: combine(results.map((r) => r.sorted.verdict)),
        pairs: results.length,
        incompletePairs: results.flatMap((r, i) => (r.sameOrder.verdict === 'incomplete' ? [i + 1] : [])),
        summedLeftRows: sum('leftRows'),
        summedRightRows: sum('rightRows'),
    };
}
