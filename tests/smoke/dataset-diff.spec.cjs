// Dataset Diff engine: the two checks, header alignment, pair plans and the
// plaintext report, through window.DatasetDiff. The page tools/dataset-diff.html
// arrives in Phase 4; until then the modules are imported on a same-origin page.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURES = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', '..', 'data', 'dataset_diff', 'fixtures.json'), 'utf8'));

async function openEngine(page) {
    await page.goto('/data/dataset_diff/fixtures.json');
    await page.evaluate(async () => {
        await import('/js/dataset_diff/diff-api.js');
        const D = window.DatasetDiff;
        const letters = (i) => String.fromCharCode(65 + i);
        window.H = {
            cell(c) {
                if (c === null) return null;
                if (c[0] === 'n') return D.numberFromDouble(c[1]);
                if (c[0] === 'unresolved') return D.UNRESOLVED;
                return c;
            },
            // A fixtures.json sheet listing as an engine table with A1 references.
            table(rows) {
                const width = Math.max(...rows.map((r) => r.length));
                const pad = (r) => Array.from({ length: width }, (_, i) => r[i] ?? null);
                const headers = pad(rows[0]).map((c) => (c === null ? '' : String(c[1])));
                return {
                    headers,
                    rows: rows.slice(1).map((r) => pad(r).map(window.H.cell)),
                    rowRefs: rows.slice(1).map((_, i) => i + 2),
                    colRefs: headers.map((_, i) => letters(i)),
                    refStyle: 'a1',
                };
            },
            // Pool strings shared with the Node oracle: 'n:-0', 't:TRUE', 'blank'.
            poolCell(s) {
                if (s === 'blank') return null;
                const v = s.slice(2);
                switch (s[0]) {
                    case 'n': return D.numberFromDouble(Number(v));
                    case 'b': return D.boolCell(v === 'true');
                    case 'e': return D.errorCell(v);
                    default: return D.textCell(v);
                }
            },
            poolTable(headers, rows) {
                return { headers, rows: rows.map((r) => r.map(window.H.poolCell)) };
            },
            summary(res) {
                const p = res.sameOrder;
                const s = res.sorted;
                return {
                    sameOrder: p.verdict, sorted: s.verdict,
                    leftRows: res.leftRows, rightRows: res.rightRows,
                    matchedRows: s.matchedRows, leftOnlyRows: s.leftOnlyRows, rightOnlyRows: s.rightOnlyRows,
                    changedCells: p.changedCells,
                    leftOnlyPatterns: s.leftOnly ? s.leftOnly.length : undefined,
                    rightOnlyPatterns: s.rightOnly ? s.rightOnly.length : undefined,
                    trailingLeftRows: p.extraLeft ? p.extraLeft[1] - p.extraLeft[0] : undefined,
                    columnOrderChanged: res.schema.columnOrderChanged,
                    schema: res.schema.status === 'same' ? undefined : res.schema.status,
                    missingRight: res.schema.missingRight, extraRight: res.schema.extraRight,
                    reason: res.incomplete ? res.incomplete.reason : undefined,
                };
            },
            run(pairs, labels = ['left', 'right']) {
                const results = pairs.map((p) => p.result);
                return {
                    toolVersion: D.version, left: { label: labels[0] }, right: { label: labels[1] },
                    aggregate: D.aggregate(results), pairs,
                };
            },
            text(run) { return [...D.reportLines(run)].map((l) => l + '\n').join(''); },
        };
    });
}

const ENGINE_KEYS = ['sameOrder', 'sorted', 'leftRows', 'rightRows', 'matchedRows', 'leftOnlyRows',
    'rightOnlyRows', 'changedCells', 'leftOnlyPatterns', 'rightOnlyPatterns', 'trailingLeftRows',
    'columnOrderChanged', 'schema', 'missingRight', 'extraRight', 'reason'];

function expectSubset(id, got, want) {
    for (const k of ENGINE_KEYS) {
        if (k in want) expect.soft(got[k], `${id}: ${k}`).toEqual(want[k]);
    }
}

const sheetRows = (src) => FIXTURES.workbooks[src.file].sheets[src.sheet].rows;

test.describe('fixtures.json cases', () => {
    test('every workbook-to-workbook case gives its hand-written verdicts and counts', async ({ page }) => {
        await openEngine(page);
        const cases = FIXTURES.cases.filter((c) => c.left.file.endsWith('.xlsx') && c.right.file.endsWith('.xlsx'));
        expect(cases.length).toBeGreaterThanOrEqual(13);
        const got = await page.evaluate((pairs) => pairs.map(([l, r]) => {
            const res = window.DatasetDiff.compareTables(window.H.table(l), window.H.table(r));
            const out = window.H.summary(res);
            if (res.incomplete) out.cells = res.incomplete.cells.map((c) => `${c.side} ${String.fromCharCode(65 + c.col)}${c.row + 2}`);
            return out;
        }), cases.map((c) => [sheetRows(c.left), sheetRows(c.right)]));
        cases.forEach((c, i) => {
            expectSubset(c.id, got[i], c.expect);
            if (c.expect.cells) {
                const sheet = c.expect.cells[0].split('!')[0];
                expect(sheet).toBe(c.left.sheet);
                expect(got[i].cells).toEqual(c.expect.cells.map((ref) => `left ${ref.split('!')[1]}`));
            }
        });
    });

    test('three-pair plan and a plan with a missing sheet', async ({ page }) => {
        await openEngine(page);
        for (const plan of FIXTURES.plans) {
            const listing = { left: FIXTURES.workbooks[plan.left], right: FIXTURES.workbooks[plan.right] };
            const out = await page.evaluate(({ plan, listing }) => {
                const D = window.DatasetDiff;
                const inventory = {};
                for (const side of ['left', 'right']) {
                    inventory[side] = {
                        label: plan[side],
                        sheets: Object.entries(listing[side].sheets).map(([name, s]) => ({ name, hidden: s.hidden })),
                    };
                }
                const pairs = plan.pairs.map(([l, r], i) => ({
                    id: `p${i + 1}`, include: true, left: { sheet: l, range: null }, right: { sheet: r, range: null },
                }));
                const checked = D.validatePlan(pairs, inventory);
                const results = pairs.map((p, i) => (checked.status[i].ready
                    ? D.compareTables(window.H.table(listing.left.sheets[p.left.sheet].rows),
                        window.H.table(listing.right.sheets[p.right.sheet].rows))
                    : D.incompletePair('missing-sheet', { missing: checked.status[i].missing })));
                return {
                    ok: checked.ok, excluded: checked.excluded,
                    summaries: results.map((r) => window.H.summary({ schema: { status: 'same' }, ...r })),
                    reasons: results.map((r) => (r.incomplete ? r.incomplete.reason : null)),
                    aggregate: D.aggregate(results),
                };
            }, { plan, listing });
            expect(out.ok, plan.id).toBe(true);
            expect(out.aggregate.sameOrder, plan.id).toBe(plan.expect.aggregate.sameOrder);
            expect(out.aggregate.sorted, plan.id).toBe(plan.expect.aggregate.sorted);
            if (plan.expect.pairs) plan.expect.pairs.forEach((want, i) => expectSubset(`${plan.id} pair ${i + 1}`, out.summaries[i], want));
            if (plan.expect.incompletePairs) {
                expect(out.aggregate.incompletePairs).toEqual(plan.expect.incompletePairs);
                expect(out.reasons[plan.expect.incompletePairs[0] - 1]).toBe(plan.expect.reason);
            }
            if (plan.excludedLeft) {
                expect(out.excluded.left.map((s) => s.name)).toEqual(plan.excludedLeft);
                expect(out.excluded.right.map((s) => s.name)).toEqual(plan.excludedRight);
                expect(out.excluded.left.filter((s) => s.hidden).map((s) => s.name)).toEqual(plan.expect.hiddenSheets.left);
            }
        }
    });
});

// ---------------------------------------------------------------- oracle

// Cells are pool strings. Equal means the same string, with negative zero
// read as zero. Nothing here shares code with the engine.
const POOL = ['blank', 't:', 't:1', 'n:1', 'n:0', 'n:-0', 'b:true', 't:TRUE', 'e:#N/A', 't:#N/A',
    't:a,b', 't:a', 't:b', 't:"],["t","', 'n:0.30000000000000004', 'n:0.3', 't: '];
const same = (a, b) => (a === 'n:-0' ? 'n:0' : a) === (b === 'n:-0' ? 'n:0' : b);
const rowsSame = (x, y) => x.length === y.length && x.every((c, i) => same(c, y[i]));

function rng(seed) {
    let s = seed >>> 0;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function oracle(L, R) {
    const used = new Array(R.length).fill(false);
    let matched = 0;
    for (const row of L) {
        const j = R.findIndex((r, k) => !used[k] && rowsSame(row, r));
        if (j >= 0) { used[j] = true; matched++; }
    }
    let changed = 0;
    for (let i = 0; i < Math.min(L.length, R.length); i++) {
        L[i].forEach((c, k) => { if (!same(c, R[i][k])) changed++; });
    }
    return {
        matchedRows: matched, leftOnlyRows: L.length - matched, rightOnlyRows: R.length - matched,
        changedCells: changed,
        sameOrder: changed === 0 && L.length === R.length ? 'match' : 'different',
        sorted: matched === L.length && matched === R.length ? 'match' : 'different',
    };
}

function trials(count, seed) {
    const r = rng(seed);
    const pick = (n) => Math.floor(r() * n);
    const out = [];
    for (let t = 0; t < count; t++) {
        const cols = 1 + pick(4);
        // A small pool slice so equal rows and duplicates are common.
        const pool = POOL.slice(pick(POOL.length - 3)).slice(0, 2 + pick(4));
        const make = (n) => Array.from({ length: n }, () => Array.from({ length: cols }, () => pool[pick(pool.length)]));
        const L = make(pick(10));
        let R;
        if (r() < 0.4) {
            R = L.map((row) => row.slice()).sort(() => r() - 0.5);
            if (R.length && r() < 0.5) R[pick(R.length)][pick(cols)] = pool[pick(pool.length)];
        } else {
            R = make(pick(10));
        }
        out.push({ cols, L, R });
    }
    return out;
}

test.describe('counting against an independent oracle', () => {
    test('matched and unmatched copies, changed cells and verdicts on 400 random tables', async ({ page }) => {
        await openEngine(page);
        const cases = trials(400, 20261107);
        const got = await page.evaluate((cases) => cases.map(({ cols, L, R }) => {
            const headers = Array.from({ length: cols }, (_, i) => `c${i}`);
            const H = window.H;
            const res = window.DatasetDiff.compareTables(H.poolTable(headers, L), H.poolTable(headers, R));
            const swap = window.DatasetDiff.compareTables(H.poolTable(headers, R), H.poolTable(headers, L));
            return { s: H.summary(res), swap: H.summary(swap) };
        }), cases);
        let duplicates = 0;
        cases.forEach(({ L, R }, i) => {
            const want = oracle(L, R);
            for (const k of Object.keys(want)) expect.soft(got[i].s[k], `trial ${i} ${k}`).toBe(want[k]);
            const s = got[i].s;
            expect.soft(s.leftRows, `trial ${i} left identity`).toBe(s.matchedRows + s.leftOnlyRows);
            expect.soft(s.rightRows, `trial ${i} right identity`).toBe(s.matchedRows + s.rightOnlyRows);
            expect.soft(got[i].swap.matchedRows, `trial ${i} swap`).toBe(s.matchedRows);
            expect.soft(got[i].swap.leftOnlyRows, `trial ${i} swap`).toBe(s.rightOnlyRows);
            if (L.some((row, a) => L.some((other, b) => a !== b && rowsSame(row, other)))) duplicates++;
        });
        expect(duplicates, 'trials with repeated rows').toBeGreaterThan(50);
    });

    test('shuffling rows and columns, headers with them, leaves the sorted check unchanged', async ({ page }) => {
        await openEngine(page);
        const r = rng(7);
        const cases = trials(150, 99).map(({ cols, L, R }) => {
            const perm = Array.from({ length: cols }, (_, i) => i).sort(() => r() - 0.5);
            const rows = R.map((row) => perm.map((j) => row[j])).sort(() => r() - 0.5);
            return { cols, L, R, perm, rows };
        });
        const got = await page.evaluate((cases) => cases.map(({ cols, L, R, perm, rows }) => {
            const H = window.H;
            const D = window.DatasetDiff;
            const headers = Array.from({ length: cols }, (_, i) => `c${i}`);
            const a = D.compareTables(H.poolTable(headers, L), H.poolTable(headers, R)).sorted;
            const b = D.compareTables(H.poolTable(headers, L), H.poolTable(perm.map((j) => headers[j]), rows)).sorted;
            const strip = (s) => ({ v: s.verdict, m: s.matchedRows, l: s.leftOnlyRows, r: s.rightOnlyRows });
            return [strip(a), strip(b)];
        }), cases);
        got.forEach(([a, b], i) => expect.soft(b, `trial ${i}`).toEqual(a));
    });
});

// ---------------------------------------------------------------- values

test.describe('cell equality and row keys', () => {
    test('types, blanks, zero signs and decimal spellings', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const D = window.DatasetDiff;
            const eq = (a, b) => D.compareTables({ headers: ['v'], rows: [[a]] }, { headers: ['v'], rows: [[b]] }).sameOrder.verdict;
            return {
                textVsNumber: eq(D.textCell('1'), D.numberFromDouble(1)),
                textVsBool: eq(D.textCell('TRUE'), D.boolCell(true)),
                errorVsText: eq(D.errorCell('#N/A'), D.textCell('#N/A')),
                blankVsEmpty: eq(null, D.textCell('')),
                spaceVsBlank: eq(D.textCell(' '), null),
                caseDiffers: eq(D.textCell('North'), D.textCell('north')),
                zeroSigns: eq(D.numberFromDouble(0), D.numberFromDouble(-0)),
                tokenVsDouble: eq(D.numberCell('1.0'), D.numberFromDouble(1)),
                bigToken: eq(D.numberCell('1e21'), D.numberFromDouble(1e21)),
                adjacent: eq(D.numberFromDouble(0.1 + 0.2), D.numberFromDouble(0.3)),
                beyondSafe: eq(D.numberCell('12345678901234567890'), D.numberFromDouble(12345678901234567890)),
                longFlag: D.isLongInteger(D.numberFromDouble(12345678901234567890)),
                shortFlag: D.isLongInteger(D.numberFromDouble(123456789012345)),
                joinCollision: D.rowKey([D.textCell('a","b')]) === D.rowKey([D.textCell('a'), D.textCell('b')]),
                nfcNotApplied: eq(D.textCell('café'), D.textCell('café')),
            };
        });
        expect(out).toEqual({
            textVsNumber: 'different', textVsBool: 'different', errorVsText: 'different',
            blankVsEmpty: 'different', spaceVsBlank: 'different', caseDiffers: 'different',
            zeroSigns: 'match', tokenVsDouble: 'match', bigToken: 'match', adjacent: 'different',
            beyondSafe: 'different', longFlag: true, shortFlag: false, joinCollision: false,
            nfcNotApplied: 'different',
        });
    });

    test('cellsEqual, JSON equality and display order agree on every pool pair', async ({ page }) => {
        await openEngine(page);
        const bad = await page.evaluate((pool) => {
            const D = window.DatasetDiff;
            const cells = pool.map(window.H.poolCell);
            const out = [];
            for (const a of cells) for (const b of cells) {
                const json = JSON.stringify(a) === JSON.stringify(b);
                if (D.cellsEqual(a, b) !== json) out.push(['cellsEqual', a, b]);
                if ((D.compareCells(a, b) === 0) !== json) out.push(['compareCells', a, b]);
                if (D.compareCells(a, b) !== -D.compareCells(b, a) && !(json)) out.push(['antisymmetry', a, b]);
            }
            return out;
        }, POOL);
        expect(bad).toEqual([]);
    });
});

// ---------------------------------------------------------------- schema

test.describe('headers', () => {
    test('reordered, missing, extra, near-match, duplicate, blank and empty headers', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const A = window.DatasetDiff.alignHeaders;
            return {
                reordered: A(['Part', 'Location', 'Qty'], ['Qty', 'Part', 'Location']),
                same: A(['a', 'b'], ['a', 'b']),
                renamed: A(['Part', 'Qty'], ['Part', 'Quantity']),
                near: A(['Part', 'Qty'], ['part', 'Qty ']),
                duplicate: A(['Part', 'Part'], ['Part', 'Qty']).problems,
                blank: A(['Part', ''], ['Part', 'Qty']).problems,
                none: A([], []).problems,
            };
        });
        expect(out.reordered).toEqual({ status: 'same', order: [1, 2, 0], columnOrderChanged: true });
        expect(out.same.columnOrderChanged).toBe(false);
        expect(out.renamed).toMatchObject({ status: 'different', missingRight: ['Qty'], extraRight: ['Quantity'], nearMatches: [] });
        expect(out.near.status).toBe('different');
        expect(out.near.nearMatches).toEqual([{ left: 'Part', right: 'part' }, { left: 'Qty', right: 'Qty ' }]);
        expect(out.duplicate).toEqual([{ side: 'left', kind: 'duplicate-header', header: 'Part', columns: [0, 1] }]);
        expect(out.blank).toEqual([{ side: 'left', kind: 'blank-header', column: 1 }]);
        expect(out.none.map((p) => p.kind)).toEqual(['no-columns', 'no-columns']);
    });

    test('values compare by header, not by column position', async ({ page }) => {
        await openEngine(page);
        const v = await page.evaluate(() => {
            const D = window.DatasetDiff;
            const n = D.numberFromDouble;
            const left = { headers: ['a', 'b'], rows: [[n(1), n(2)]] };
            const right = { headers: ['b', 'a'], rows: [[n(2), n(1)]] };
            const swapped = { headers: ['b', 'a'], rows: [[n(1), n(2)]] };
            return [D.compareTables(left, right).sameOrder.verdict, D.compareTables(left, swapped).sameOrder.verdict];
        });
        expect(v).toEqual(['match', 'different']);
    });
});

// ---------------------------------------------------------------- completeness

test.describe('completeness', () => {
    test('empty tables, unresolved formulas, ragged rows and a difference in the last of 5,000 rows', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const D = window.DatasetDiff;
            const empty = D.compareTables({ headers: ['a'], rows: [] }, { headers: ['a'], rows: [] });
            const unresolved = D.compareTables({ headers: ['a'], rows: [[D.UNRESOLVED]] }, { headers: ['a'], rows: [[D.numberFromDouble(2)]] });
            let ragged = null;
            try { D.compareTables({ headers: ['a', 'b'], rows: [[null]] }, { headers: ['a', 'b'], rows: [] }); } catch (e) { ragged = e.message; }
            const rows = Array.from({ length: 5000 }, (_, i) => [D.textCell(`id-${i}`), D.numberFromDouble(i)]);
            const changed = rows.map((r) => r.slice());
            changed[4999][1] = D.numberFromDouble(5000);
            const late = D.compareTables({ headers: ['id', 'n'], rows }, { headers: ['id', 'n'], rows: changed });
            return {
                empty: [empty.sameOrder.verdict, empty.sorted.verdict, D.headline(empty)],
                unresolved: [unresolved.sameOrder.verdict, unresolved.sorted.verdict, unresolved.incomplete.reason],
                ragged,
                late: [late.sameOrder.changedCells, late.sameOrder.changed.row(0), late.sorted.leftOnlyRows, late.sorted.matchedRows],
            };
        });
        expect(out.empty).toEqual(['match', 'match', 'Same selected table values in the same row order (0 data rows)']);
        expect(out.unresolved).toEqual(['incomplete', 'incomplete', 'unresolved-formula']);
        expect(out.ragged).toContain('1 cells for 2 headers');
        expect(out.late).toEqual([1, 4999, 1, 4999]);
    });
});

// ---------------------------------------------------------------- plans

test.describe('pair plans', () => {
    test('suggestions, refusals, reuse, exclusions and combined verdicts', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const D = window.DatasetDiff;
            const inv = {
                left: { sheets: [{ name: 'Orders' }, { name: 'Stock' }, { name: 'Notes', hidden: true }] },
                right: { sheets: [{ name: 'Stock' }, { name: 'Orders 2026' }, { name: 'Orders' }] },
            };
            const pair = (id, l, r, range = null, include = true) => ({ id, include, left: { sheet: l, range }, right: { sheet: r, range: null } });
            const verdicts = (a, b) => ({ sameOrder: { verdict: a }, sorted: { verdict: b } });
            return {
                suggested: D.suggestPairs(inv.left, inv.right).map((p) => [p.left.sheet, p.right.sheet]),
                none: D.validatePlan([pair('p1', 'Orders', 'Orders', null, false)], inv).errors,
                duplicate: D.validatePlan([pair('p1', 'Orders', 'Orders'), pair('p2', 'Orders', 'Orders')], inv).errors,
                reuse: D.validatePlan([pair('p1', 'Orders', 'Orders', 'A1:B5'), pair('p2', 'Orders', 'Orders 2026', 'A7:B9')], inv),
                missing: D.validatePlan([pair('p1', 'Archive', 'Orders')], inv).status,
                all: D.aggregate([verdicts('match', 'match'), verdicts('match', 'match')]),
                order: D.aggregate([verdicts('match', 'match'), verdicts('different', 'match')]),
                schema: D.aggregate([verdicts('match', 'match'), verdicts('unavailable', 'unavailable')]),
                hidden: D.aggregate([verdicts('different', 'different'), D.incompletePair('not-finished')]),
                emptyThrows: (() => { try { D.aggregate([]); return false; } catch (e) { return true; } })(),
            };
        });
        expect(out.suggested).toEqual([['Orders', 'Orders'], ['Stock', 'Stock']]);
        expect(out.none).toEqual([{ kind: 'no-pairs' }]);
        expect(out.duplicate).toEqual([{ kind: 'duplicate-pair', pairs: ['p1', 'p2'] }]);
        expect(out.reuse.ok).toBe(true);
        expect(out.reuse.reuse.left).toEqual([{ sheet: 'Orders', pairs: 2 }]);
        expect(out.reuse.excluded.left).toEqual([{ name: 'Stock', hidden: false }, { name: 'Notes', hidden: true }]);
        expect(out.missing).toEqual([{ id: 'p1', ready: false, missing: ['left'] }]);
        expect([out.all.sameOrder, out.all.sorted]).toEqual(['match', 'match']);
        expect([out.order.sameOrder, out.order.sorted]).toEqual(['different', 'match']);
        expect([out.schema.sameOrder, out.schema.sorted]).toEqual(['different', 'different']);
        expect([out.hidden.sameOrder, out.hidden.sorted, out.hidden.incompletePairs]).toEqual(['incomplete', 'incomplete', [2]]);
        expect(out.emptyThrows).toBe(true);
    });
});

// ---------------------------------------------------------------- report

test.describe('report and the 50,000 code point preview', () => {
    test('cap boundaries, whole lines, astral characters and one oversized line', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const D = window.DatasetDiff;
            const one = (n, ch = 'x') => D.preview([ch.repeat(n - 1)]);
            const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
            const summary = (p) => ({ truncated: p.truncated, shown: p.shownCodePoints, total: p.totalCodePoints, measured: D.codePointLength(p.text) });
            const lines = Array.from({ length: 10 }, (_, i) => String(i).repeat(5999));
            const many = D.preview(lines);
            const emoji = D.preview(['\u{1F600}'.repeat(49999)]);
            const cutEmoji = D.preview(['\u{1F600}'.repeat(60000)]);
            return {
                under: summary(one(49999)), at: summary(one(50000)), over: summary(one(50001)),
                overEndsWithMark: one(50001).text.endsWith(D.TRUNCATION_MARK + '\n'),
                many: summary(many),
                manyWholeLines: many.text.split('\n').slice(0, -2).every((l, i) => l === lines[i]),
                manyKept: many.text.split('\n').length - 2,
                emoji: summary(emoji), emojiUnits: emoji.text.length,
                cutEmoji: summary(cutEmoji), cutEmojiLone: lone.test(cutEmoji.text),
                noTotal: D.preview(lines, D.PREVIEW_CAP, { countTotal: false }).totalCodePoints,
            };
        });
        expect(out.under).toEqual({ truncated: false, shown: 49999, total: 49999, measured: 49999 });
        expect(out.at).toEqual({ truncated: false, shown: 50000, total: 50000, measured: 50000 });
        expect(out.over).toEqual({ truncated: true, shown: 50000, total: 50001, measured: 50000 });
        expect(out.overEndsWithMark).toBe(true);
        expect(out.many).toMatchObject({ truncated: true, total: 60000 });
        expect(out.many.shown).toBe(out.many.measured);
        expect(out.many.shown).toBeLessThanOrEqual(50000);
        expect(out.manyWholeLines).toBe(true);
        expect(out.manyKept).toBe(8);
        expect(out.emoji).toEqual({ truncated: false, shown: 50000, total: 50000, measured: 50000 });
        expect(out.emojiUnits).toBe(99999);
        expect(out.cutEmoji.truncated).toBe(true);
        expect(out.cutEmoji.measured).toBe(50000);
        expect(out.cutEmojiLone).toBe(false);
        expect(out.noTotal).toBeNull();
    });

    test('one cap across pairs, each under the cap alone; the full report keeps every difference past it', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const D = window.DatasetDiff;
            const H = window.H;
            const pairs = [1, 2, 3].map((k) => {
                const left = { headers: ['id', 'v'], rows: [], refStyle: 'a1', colRefs: ['A', 'B'], rowRefs: [] };
                const right = { headers: ['id', 'v'], rows: [], refStyle: 'a1', colRefs: ['A', 'B'], rowRefs: [] };
                // About 22,000 code points per pair: each fits alone, three do not.
                for (let i = 0; i < 100; i++) {
                    left.rows.push([D.textCell(`p${k}-${i}`), D.numberFromDouble(i)]);
                    right.rows.push([D.textCell(`p${k}-${i}`), D.numberFromDouble(i + 0.5)]);
                    left.rowRefs.push(i + 2);
                    right.rowRefs.push(i + 2);
                }
                return { label: `L.xlsx!S${k} -> R.xlsx!S${k}`, left, right, result: D.compareTables(left, right) };
            });
            const run = H.run(pairs);
            const p = D.preview(D.reportLines(run));
            const full = H.text(run);
            return {
                truncated: p.truncated, shown: p.shownCodePoints, total: p.totalCodePoints, fullLength: D.codePointLength(full),
                previewHasPair1: p.text.includes('right B2;'), previewHasPair3Detail: p.text.includes('"p3-99"'),
                pairSizes: pairs.map((pair) => D.codePointLength(H.text(H.run([pair])))),
                summaryShowsAllPairs: p.text.includes('Pair 3: L.xlsx!S3 -> R.xlsx!S3 | Same row order: DIFFERENT'),
                fullHasLast: full.includes('[POSITION] left B101 / right B101; header="v"; number:99 -> number:99.5'),
                fullPositionLines: full.split('\n').filter((l) => l.startsWith('[POSITION]')).length,
            };
        });
        expect(out.truncated).toBe(true);
        expect(out.shown).toBeLessThanOrEqual(50000);
        expect(out.total).toBe(out.fullLength);
        expect(out.total).toBeGreaterThan(60000);
        for (const size of out.pairSizes) expect(size).toBeLessThan(30000);
        expect(out.previewHasPair1).toBe(true);
        expect(out.previewHasPair3Detail).toBe(false);
        expect(out.summaryShowsAllPairs).toBe(true);
        expect(out.fullHasLast).toBe(true);
        expect(out.fullPositionLines).toBe(300);
    });

    test('report lines for the display-hides-decimal case, an order-only pair and hostile text', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(({ left, right, parts, swapped }) => {
            const D = window.DatasetDiff;
            const H = window.H;
            const pair = (label, l, r) => {
                const a = H.table(l);
                const b = H.table(r);
                return { label, left: a, right: b, result: D.compareTables(a, b) };
            };
            const hostile = { headers: ['v'], rows: [[D.textCell('x\n[LEFT ONLY] copies=9; forged')]] };
            const plain = { headers: ['v'], rows: [[D.textCell('x')]] };
            const run = H.run([
                pair('display-left.xlsx!Readings -> display-right.xlsx!Readings', left, right),
                pair('parts-left.xlsx!Parts -> parts-right.xlsx!RowsSwapped', parts, swapped),
                { label: 'hostile', left: hostile, right: plain, result: D.compareTables(hostile, plain) },
            ]);
            return H.text(run).split('\n');
        }, {
            left: sheetRows({ file: 'display-left.xlsx', sheet: 'Readings' }),
            right: sheetRows({ file: 'display-right.xlsx', sheet: 'Readings' }),
            parts: sheetRows({ file: 'parts-left.xlsx', sheet: 'Parts' }),
            swapped: sheetRows({ file: 'parts-right.xlsx', sheet: 'RowsSwapped' }),
        });
        expect(out).toContain('[POSITION] left B2 / right B2; header="Value"; number:1.234 -> number:1.233');
        expect(out).toContain('[POSITION] left B4 / right B4; header="Value"; number:0.30000000000000004 -> number:0.3');
        expect(out).toContain('[LEFT ONLY] copies=1; source rows=[2]; [text:"T1", number:1.234]');
        expect(out).toContain('[RIGHT ONLY] copies=1; source rows=[2]; [text:"T1", number:1.233]');
        expect(out).toContain('Headline: Same selected table values; row order differs (3 data rows)');
        expect(out).toContain('Sorted all columns: every row matches; only the row order differs.');
        expect(out).toContain('All selected pairs: Same row order: DIFFERENT | Sorted all columns: DIFFERENT');
        expect(out.filter((l) => l.startsWith('[LEFT ONLY] copies=9'))).toEqual([]);
        expect(out.some((l) => l.includes('text:"x\\n[LEFT ONLY] copies=9; forged"'))).toBe(true);
    });
});
