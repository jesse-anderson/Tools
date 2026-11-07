// Dataset Diff delimited import (CSV, TSV, paste) through window.DatasetDiff.
// The page tools/dataset-diff.html arrives in Phase 4; until then the
// modules are imported on a same-origin page.
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
        window.H = {
            async csv(file, options = {}) {
                const bytes = new Uint8Array(await (await fetch(`/data/dataset_diff/${file}`)).arrayBuffer());
                const decoded = D.decodeBytes(bytes);
                if (!decoded.ok) return decoded;
                return { encoding: decoded.encoding, ...D.importDelimited(decoded.text, options) };
            },
            listing(rows) {
                const width = Math.max(...rows.map((r) => r.length));
                const pad = (r) => Array.from({ length: width }, (_, i) => r[i] ?? null);
                const cell = (c) => (c === null ? null : c[0] === 'n' ? D.numberFromDouble(c[1])
                    : c[0] === 'unresolved' ? D.UNRESOLVED : c);
                return { headers: pad(rows[0]).map((c) => (c === null ? '' : String(c[1]))), rows: rows.slice(1).map((r) => pad(r).map(cell)) };
            },
            text(t, options = {}) { return D.importDelimited(t, { delimiter: ',', ...options }); },
            async bytes(file) { return (await fetch(`/data/dataset_diff/${file}`)).arrayBuffer(); },
            runner(options) { return new D.Runner('/js/dataset_diff/diff-worker.js', options); },
            async open(runner, side, file) {
                const kind = file.endsWith('.xlsx') ? 'workbook' : 'text';
                return runner.open(side, { kind, bytes: await window.H.bytes(file), name: file });
            },
            summary(res) {
                const p = res.sameOrder;
                const s = res.sorted;
                return {
                    sameOrder: p.verdict, sorted: s.verdict, leftRows: res.leftRows, rightRows: res.rightRows,
                    matchedRows: s.matchedRows, leftOnlyRows: s.leftOnlyRows, rightOnlyRows: s.rightOnlyRows,
                    changedCells: p.changedCells,
                    leftOnlyPatterns: s.leftOnly ? s.leftOnly.length : undefined,
                    rightOnlyPatterns: s.rightOnly ? s.rightOnly.length : undefined,
                    trailingLeftRows: p.extraLeft ? p.extraLeft[1] - p.extraLeft[0] : undefined,
                    columnOrderChanged: res.schema.columnOrderChanged,
                    schema: res.schema.status === 'same' ? undefined : res.schema.status,
                    missingRight: res.schema.missingRight, extraRight: res.schema.extraRight,
                };
            },
        };
    });
}

const ENGINE_KEYS = ['sameOrder', 'sorted', 'leftRows', 'rightRows', 'matchedRows', 'leftOnlyRows',
    'rightOnlyRows', 'changedCells', 'leftOnlyPatterns', 'rightOnlyPatterns', 'trailingLeftRows',
    'columnOrderChanged', 'schema', 'missingRight', 'extraRight'];

test.describe('fixtures.json cases with a delimited side', () => {
    test('CSV against CSV and against workbook listings give the hand-written results', async ({ page }) => {
        await openEngine(page);
        const cases = FIXTURES.cases.filter((c) => c.left.file.endsWith('.csv') || c.right.file.endsWith('.csv'));
        expect(cases.length).toBe(10);
        const sources = cases.map((c) => [c.left, c.right].map((s) => (s.file.endsWith('.csv')
            ? { csv: s.file }
            : { rows: FIXTURES.workbooks[s.file].sheets[s.sheet].rows })));
        const got = await page.evaluate(async (sources) => {
            const out = [];
            for (const pair of sources) {
                const tables = [];
                for (const s of pair) {
                    if (s.csv) {
                        const r = await window.H.csv(s.csv);
                        if (!r.ok) { tables.push(null); continue; }
                        tables.push(r.table);
                    } else tables.push(window.H.listing(s.rows));
                }
                out.push(tables.includes(null) ? { importFailed: true } : window.H.summary(window.DatasetDiff.compareTables(...tables)));
            }
            return out;
        }, sources);
        cases.forEach((c, i) => {
            expect.soft(got[i].importFailed, `${c.id}: import`).toBeUndefined();
            for (const k of ENGINE_KEYS) if (k in c.expect) expect.soft(got[i][k], `${c.id}: ${k}`).toEqual(c.expect[k]);
        });
    });

    test('import checks for the CSV fixtures', async ({ page }) => {
        await openEngine(page);
        const imports = FIXTURES.imports.filter((i) => i.file.endsWith('.csv'));
        const got = await page.evaluate(async (files) => {
            const out = {};
            for (const f of files) {
                const r = await window.H.csv(f);
                out[f] = {
                    ok: r.ok, encoding: r.encoding, errors: r.errors,
                    headers: r.table && r.table.headers,
                    rows: r.table && r.table.rows,
                    rowRefs: r.table && r.table.rowRefs,
                    lineSpans: r.table && r.table.lineSpans,
                    types: r.columns && r.columns.map((c) => c.type),
                };
            }
            return out;
        }, imports.map((i) => i.file));
        for (const imp of imports) {
            const r = got[imp.file];
            if (imp.refused === 'ragged-rows') {
                expect(r.ok, imp.file).toBe(false);
                expect(r.errors.map((e) => ({ record: e.record, fields: e.fields }))).toEqual(imp.errors);
                expect(r.errors.every((e) => e.kind === 'ragged' && e.expected === 2)).toBe(true);
                continue;
            }
            expect(r.ok, imp.file).toBe(true);
            if ('dataRows' in imp) expect(r.rows.length, imp.file).toBe(imp.dataRows);
            if (imp.records) {
                for (const want of imp.records) {
                    const i = r.rowRefs.indexOf(want.record);
                    expect(r.lineSpans[i], `${imp.file} record ${want.record}`).toEqual(want.lines);
                    expect(r.rows[i][r.headers.indexOf('Note')]).toEqual(['t', want.Note]);
                }
            }
            if (imp.encoding) expect(r.encoding).toBe(imp.encoding);
            if (imp.headers) expect(r.headers).toEqual(imp.headers);
            if (imp.columnTypes) expect(r.types).toEqual(Object.values(imp.columnTypes));
            if (imp.values) {
                const col = r.headers.length - 1;
                expect(r.rows.map((row) => (row[col] === null ? null : row[col][1]))).toEqual(imp.values);
            }
        }
    });
});

test.describe('record syntax', () => {
    test('line endings, quoting, escaped quotes, bare quotes, trailing delimiters and spaces', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const D = window.DatasetDiff;
            const fields = (t, d = ',') => D.parseRecords(t, d).records.map((r) => r.fields);
            return {
                crlf: fields('a,b\r\n1,2\r\n'),
                lf: fields('a,b\n1,2\n'),
                cr: fields('a,b\r1,2\r'),
                mixed: D.parseRecords('a\r\nb\nc\rd', ',').records.map((r) => r.lines),
                quoted: fields('"a,b","say ""hi""",c\n'),
                bare: fields('12" pipe,x\n'),
                trailing: fields('a,b,\n,\n'),
                spaces: fields(' North ,  \n'),
                multiline: D.parseRecords('h\n"one\r\ntwo\nthree"\nnext\n', ',').records.map((r) => [r.fields[0], r.lines]),
                afterQuote: D.parseRecords('a,b\n"x"y,2\n', ',').errors,
                unterminated: D.parseRecords('a,b\n1,"open\n2,3\n', ',').errors,
            };
        });
        const want = [['a', 'b'], ['1', '2']];
        expect(out.crlf).toEqual(want);
        expect(out.lf).toEqual(want);
        expect(out.cr).toEqual(want);
        expect(out.mixed).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
        expect(out.quoted).toEqual([['a,b', 'say "hi"', 'c']]);
        expect(out.bare).toEqual([['12" pipe', 'x']]);
        expect(out.trailing).toEqual([['a', 'b', ''], ['', '']]);
        expect(out.spaces).toEqual([[' North ', '  ']]);
        expect(out.multiline).toEqual([['h', [1, 1]], ['one\r\ntwo\nthree', [2, 4]], ['next', [5, 5]]]);
        expect(out.afterQuote).toEqual([{ kind: 'text-after-quote', record: 2, line: 2, text: 'y' }]);
        expect(out.unterminated).toEqual([{ kind: 'unterminated-quote', record: 2, line: 2 }]);
    });

    test('final line end, blank lines and the Empty fields setting', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const H = window.H;
            const rows = (t, o) => H.text(t, o).table.rows;
            return {
                finalEnd: rows('a,b\n1,2\n').length,
                blankKept: rows('a,b\n1,2\n\n3,4\n'),
                trailingBlank: rows('a,b\n1,2\n\n'),
                blankAsBlank: rows('a,b\n1,\n"",2\n'),
                blankAsEmpty: rows('a,b\n1,\n"",2\n', { emptyFields: 'empty-string' }),
                blankLineWithEmptySetting: rows('a,b\n\n', { emptyFields: 'empty-string' }),
                ragged: H.text('a,b\n1\n1,2,3\n').errors.map((e) => [e.kind, e.record, e.fields]),
            };
        });
        expect(out.finalEnd).toBe(1);
        expect(out.blankKept).toEqual([[['n', '1e0'], ['n', '2e0']], [null, null], [['n', '3e0'], ['n', '4e0']]]);
        expect(out.trailingBlank).toEqual([[['n', '1e0'], ['n', '2e0']], [null, null]]);
        expect(out.blankAsBlank).toEqual([[['n', '1e0'], null], [null, ['n', '2e0']]]);
        expect(out.blankAsEmpty).toEqual([[['n', '1e0'], ['t', '']], [['t', ''], ['n', '2e0']]]);
        expect(out.blankLineWithEmptySetting).toEqual([[null, null]]);
        expect(out.ragged).toEqual([['ragged', 2, 1], ['ragged', 3, 3]]);
    });

    test('delimiter suggestions, including an Excel paste', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const D = window.DatasetDiff;
            const paste = 'Part\tNote\r\nP1\t"tab\there\r\nand a line"\r\nP2\tplain\r\n';
            return {
                comma: D.suggestDelimiter('a,b,c\n1,2,3\n'),
                tab: D.suggestDelimiter('a\tb\n1\t2\n'),
                semicolon: D.suggestDelimiter('a;b\n"1,5";"2,5"\n"3,1";4\n'),
                pipe: D.suggestDelimiter('a|b\n1|2\n'),
                single: D.suggestDelimiter('a\n1\n2\n'),
                paste: D.importDelimited(paste),
            };
        });
        expect([out.comma, out.tab, out.semicolon, out.pipe, out.single]).toEqual([',', '\t', ';', '|', ',']);
        expect(out.paste.delimiter).toBe('\t');
        expect(out.paste.table.rows).toEqual([[['t', 'P1'], ['t', 'tab\there\r\nand a line']], [['t', 'P2'], ['t', 'plain']]]);
    });
});

test.describe('column types', () => {
    test('inference, declared separators, chosen types and their errors', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const H = window.H;
            const one = (t, o) => { const r = H.text(t, o); return r.ok ? { type: r.columns[0].type, reason: r.columns[0].reason, values: r.table.rows.map((x) => x[0]) } : r.errors; };
            return {
                spellings: one('v\n1\n1.0\n1e0\n10e-1\n-0\n'),
                grouped: one('v\n1,000\n', { delimiter: ';' }),
                thousands: one('v\n1,000\n12,345.5\n', { delimiter: ';', thousands: ',' }),
                badGroup: one('v\n1,00\n', { delimiter: ';', thousands: ',' }),
                decimalComma: one('v\n1,5\n2\n', { delimiter: ';', decimal: ',' }),
                europe: one('v\n1.234,5\n', { delimiter: ';', decimal: ',', thousands: '.' }),
                leadingZero: one('v\n10\n00123\n'),
                forcedNumber: one('v\n00123\n7\n', { types: ['number'] }),
                forcedText: one('v\n1.0\n2\n', { types: ['text'] }),
                badNumber: one('v\n1\nabc\n', { types: ['number'] }),
                booleans: one('v\nTRUE\nfalse\n', { types: ['boolean'] }),
                badBoolean: one('v\nyes\n', { types: ['boolean'] }),
                autoBoolean: one('v\nTRUE\nFALSE\n'),
                literals: one('v\nNaN\nInfinity\n+5\n.5\n'),
                allBlank: one('v,w\n,1\n,2\n'),
                big: H.text('v\n12345678901234567890\n').warnings,
            };
        });
        expect(out.spellings.type).toBe('number');
        expect(out.spellings.values).toEqual([['n', '1e0'], ['n', '1e0'], ['n', '1e0'], ['n', '1e0'], ['n', '0']]);
        expect(out.grouped).toMatchObject({ type: 'text', reason: { kind: 'not-a-number', record: 2 } });
        expect(out.thousands.values).toEqual([['n', '1e3'], ['n', '123455e-1']]);
        expect(out.badGroup.type).toBe('text');
        expect(out.decimalComma.values).toEqual([['n', '15e-1'], ['n', '2e0']]);
        expect(out.europe.values).toEqual([['n', '12345e-1']]);
        expect(out.leadingZero).toMatchObject({ type: 'text', reason: { kind: 'leading-zero', record: 3, value: '00123' } });
        expect(out.leadingZero.values).toEqual([['t', '10'], ['t', '00123']]);
        expect(out.forcedNumber.values).toEqual([['n', '123e0'], ['n', '7e0']]);
        expect(out.forcedText.values).toEqual([['t', '1.0'], ['t', '2']]);
        expect(out.badNumber).toEqual([{ kind: 'type', type: 'number', record: 3, column: 1, header: 'v', value: 'abc', reason: 'not-a-number' }]);
        expect(out.booleans.values).toEqual([['b', true], ['b', false]]);
        expect(out.badBoolean[0]).toMatchObject({ kind: 'type', type: 'boolean', record: 2, value: 'yes' });
        expect(out.autoBoolean.type).toBe('text');
        expect(out.literals.type).toBe('text');
        expect(out.allBlank).toMatchObject({ type: 'text', reason: { kind: 'no-values' } });
        expect(out.big).toEqual([{ kind: 'long-integers', count: 1 }]);
    });
});

test.describe('headers, encodings and limits', () => {
    test('header record choice and generated headers', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const H = window.H;
            const second = H.text('Inventory export\nPart,Qty\nP1,1\n', { headerRecord: 2 });
            return {
                second: [second.table.headers, second.table.rowRefs],
                generated: H.text('1,2\n3,4\n', { headerRecord: 0, generatedHeaders: true }).table.headers,
                refused: H.text('1,2\n', { headerRecord: 0 }).errors,
                titleRagged: H.text('Inventory export\nPart,Qty\nP1,1\n').errors.map((e) => [e.kind, e.record]),
            };
        });
        expect(out.second).toEqual([['Part', 'Qty'], [3]]);
        expect(out.generated).toEqual(['Column 1', 'Column 2']);
        expect(out.refused).toEqual([{ kind: 'no-header-choice' }]);
        expect(out.titleRagged).toEqual([['ragged', 2], ['ragged', 3]]);
    });

    test('BOM, invalid UTF-8 and UTF-16 are named, never replaced', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const D = window.DatasetDiff;
            return {
                bom: D.decodeBytes(new Uint8Array([0xEF, 0xBB, 0xBF, 0x61])),
                invalid: D.decodeBytes(new Uint8Array([0x50, 0xC3, 0x28])),
                utf16: D.decodeBytes(new Uint8Array([0xFF, 0xFE, 0x61, 0x00])),
            };
        });
        expect(out.bom).toEqual({ ok: true, text: 'a', encoding: 'UTF-8 BOM' });
        expect(out.invalid).toEqual({ ok: false, error: { kind: 'invalid-utf8' } });
        expect(out.utf16).toEqual({ ok: false, error: { kind: 'unsupported-encoding', encoding: 'UTF-16' } });
    });

    test('column, row and text cell limits refuse the source', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(() => {
            const H = window.H;
            const D = window.DatasetDiff;
            const kinds = (r) => r.errors.map((e) => e.limit);
            const wide = Array.from({ length: D.LIMITS.columns + 1 }, (_, i) => `c${i}`).join(',') + '\n';
            const tall = 'v\n' + '1\n'.repeat(D.LIMITS.dataRows + 1);
            const atRows = 'v\n' + '1\n'.repeat(D.LIMITS.dataRows);
            const long = 'v\n' + 'x'.repeat(D.LIMITS.textCellChars + 1) + '\n';
            return { wide: kinds(H.text(wide)), tall: kinds(H.text(tall)), atRows: H.text(atRows).ok, long: kinds(H.text(long)) };
        });
        expect(out.wide).toEqual(['columns']);
        expect(out.tall).toEqual(['dataRows']);
        expect(out.atRows).toBe(true);
        expect(out.long).toEqual(['textCellChars']);
    });
});

// ---------------------------------------------------------------- workbooks

const XLSX_CASES = FIXTURES.cases.filter((c) => c.left.file.endsWith('.xlsx') && c.right.file.endsWith('.xlsx'));

test.describe('workbooks through the parse worker', () => {
    test('every fixture sheet reads to the cells listed in fixtures.json', async ({ page }) => {
        await openEngine(page);
        const problems = await page.evaluate(async (books) => {
            const H = window.H;
            const runner = H.runner();
            const out = [];
            for (const [file, spec] of Object.entries(books)) {
                const inv = await H.open(runner, 'left', file);
                if (inv.dateSystem !== spec.dateSystem) out.push(`${file}: date system ${inv.dateSystem}`);
                const want = Object.entries(spec.sheets).map(([name, s]) => [name, s.hidden]);
                const got = inv.sheets.map((s) => [s.name, s.hidden]);
                if (JSON.stringify(got) !== JSON.stringify(want)) out.push(`${file}: sheets ${JSON.stringify(got)}`);
                for (const [name, s] of Object.entries(spec.sheets)) {
                    if (name === 'MergedHeader') continue;
                    const t = await runner.table('left', { sheet: name });
                    const listed = H.listing(s.rows);
                    if (JSON.stringify(t.table.headers) !== JSON.stringify(listed.headers)) out.push(`${file}!${name}: headers ${JSON.stringify(t.table.headers)}`);
                    if (JSON.stringify(t.table.rows) !== JSON.stringify(listed.rows)) out.push(`${file}!${name}: rows ${JSON.stringify(t.table.rows)}`);
                }
            }
            runner.stop();
            return out;
        }, FIXTURES.workbooks);
        expect(problems).toEqual([]);
    });

    test('value ranges, hidden rows and columns, merged headers and unresolved formulas', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(async () => {
            const H = window.H;
            const runner = H.runner();
            const inv = await H.open(runner, 'left', 'blanks-left.xlsx');
            const cells = inv.sheets[0];
            const blanks = await runner.table('left', { sheet: 'Cells' });
            await H.open(runner, 'left', 'layout.xlsx');
            const hidden = await runner.table('left', { sheet: 'Hidden' });
            const merged = await runner.table('left', { sheet: 'MergedHeader' }).catch((e) => e);
            const below = await runner.table('left', { sheet: 'MergedHeader', range: 'A2:B4' });
            const headerOnly = await runner.table('left', { sheet: 'HeaderOnly' });
            const badRange = await runner.table('left', { sheet: 'Hidden', range: 'A1-C4' }).catch((e) => e);
            const missing = await runner.table('left', { sheet: 'Nope' }).catch((e) => e);
            await H.open(runner, 'left', 'formulas-left.xlsx');
            const unresolved = await runner.table('left', { sheet: 'Unresolved' });
            const totals = await runner.table('left', { sheet: 'Totals' });
            runner.stop();
            return {
                cells: [cells.ref, cells.valueRange], blanksRange: blanks.info.range, blanksRows: blanks.table.rows.length,
                hidden: [hidden.info.hiddenRows, hidden.info.hiddenColumns, hidden.table.rows.length],
                merged, below: [below.table.headers, below.table.rowRefs, below.table.colRefs],
                headerOnly: [headerOnly.table.headers, headerOnly.table.rows.length],
                badRange, missing,
                unresolved: [unresolved.info.unresolved, unresolved.info.formulaCells],
                totals: [totals.info.formulaCells, totals.info.unresolved],
            };
        });
        const want = Object.fromEntries(FIXTURES.imports.filter((i) => i.file.endsWith('.xlsx')).map((i) => [`${i.file}!${i.sheet}`, i]));
        expect(out.cells).toEqual([want['blanks-left.xlsx!Cells'].refRange, want['blanks-left.xlsx!Cells'].valueRange]);
        expect(out.blanksRange).toBe('A1:B8');
        expect(out.blanksRows).toBe(7);
        const h = want['layout.xlsx!Hidden'];
        expect(out.hidden).toEqual([h.hiddenRows, h.hiddenColumns, h.dataRows]);
        expect(out.merged).toEqual({ kind: 'table', errors: [{ kind: 'merged-cells', ranges: want['layout.xlsx!MergedHeader'].mergedRanges }], omittedErrors: 0 });
        expect(want['layout.xlsx!MergedHeader'].acceptedRange).toBe('A2:B4');
        expect(out.below).toEqual([['Tag', 'Value'], [3, 4], ['A', 'B']]);
        expect(out.headerOnly).toEqual([['Part', 'Qty'], want['layout.xlsx!HeaderOnly'].dataRows]);
        expect(out.badRange.errors[0].kind).toBe('bad-range');
        expect(out.missing.errors[0]).toEqual({ kind: 'missing-sheet', sheet: 'Nope' });
        expect(out.unresolved).toEqual([['B2'], 1]);
        expect(out.totals).toEqual([3, []]);
    });

    test('workbook cases and plans from fixtures.json, read by SheetJS', async ({ page }) => {
        await openEngine(page);
        const got = await page.evaluate(async ({ cases, plans }) => {
            const D = window.DatasetDiff;
            const H = window.H;
            const runner = H.runner();
            const summarize = (res) => ({ schema: { status: 'same' }, ...res });
            const caseOut = [];
            for (const c of cases) {
                const [li, ri] = await Promise.all([H.open(runner, 'left', c.left.file), H.open(runner, 'right', c.right.file)]);
                const [l, r] = await Promise.all([runner.table('left', { sheet: c.left.sheet }), runner.table('right', { sheet: c.right.sheet })]);
                const res = D.compareTables(l.table, r.table);
                caseOut.push({
                    ...H.summary(summarize(res)),
                    reason: res.incomplete ? res.incomplete.reason : undefined,
                    dateSystems: [li.dateSystem, ri.dateSystem],
                    leftFormulaCells: l.info.formulaCells, rightFormulaCells: r.info.formulaCells,
                });
            }
            const planOut = [];
            for (const plan of plans) {
                const [li, ri] = await Promise.all([H.open(runner, 'left', plan.left), H.open(runner, 'right', plan.right)]);
                const pairs = plan.pairs.map(([a, b], i) => ({ id: `p${i + 1}`, include: true, left: { sheet: a, range: null }, right: { sheet: b, range: null } }));
                const checked = D.validatePlan(pairs, { left: li, right: ri });
                const results = [];
                for (const [i, p] of pairs.entries()) {
                    if (!checked.status[i].ready) { results.push(D.incompletePair('missing-sheet')); continue; }
                    const [l, r] = await Promise.all([runner.table('left', { sheet: p.left.sheet }), runner.table('right', { sheet: p.right.sheet })]);
                    results.push(D.compareTables(l.table, r.table));
                }
                planOut.push({
                    pairs: results.map((r) => H.summary(summarize(r))),
                    aggregate: D.aggregate(results),
                    hiddenLeft: checked.excluded.left.filter((s) => s.hidden).map((s) => s.name),
                });
            }
            runner.stop();
            return { caseOut, planOut };
        }, { cases: XLSX_CASES, plans: FIXTURES.plans });
        const keys = [...ENGINE_KEYS, 'reason', 'dateSystems', 'leftFormulaCells', 'rightFormulaCells'];
        XLSX_CASES.forEach((c, i) => {
            for (const k of keys) if (k in c.expect) expect.soft(got.caseOut[i][k], `${c.id}: ${k}`).toEqual(c.expect[k]);
        });
        FIXTURES.plans.forEach((plan, i) => {
            const out = got.planOut[i];
            expect(out.aggregate.sameOrder, plan.id).toBe(plan.expect.aggregate.sameOrder);
            expect(out.aggregate.sorted, plan.id).toBe(plan.expect.aggregate.sorted);
            if (plan.expect.pairs) {
                plan.expect.pairs.forEach((want, j) => {
                    for (const k of ENGINE_KEYS) if (k in want) expect.soft(out.pairs[j][k], `${plan.id} pair ${j + 1}: ${k}`).toEqual(want[k]);
                });
                expect(out.hiddenLeft).toEqual(plan.expect.hiddenSheets.left);
            }
            if (plan.expect.incompletePairs) expect(out.aggregate.incompletePairs).toEqual(plan.expect.incompletePairs);
        });
    });

    test('the container is checked before any parser expands it', async ({ page }) => {
        await openEngine(page);
        const out = await page.evaluate(async () => {
            const D = window.DatasetDiff;
            const H = window.H;
            const real = new Uint8Array(await H.bytes('parts-left.xlsx'));
            const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
            // First central directory entry, found from the end-of-directory record.
            let eocd = real.length - 22;
            while (u32(real, eocd) !== 0x06054B50) eocd--;
            const cd = u32(real, eocd + 16);
            const withSize = (size) => { const b = real.slice(); new DataView(b.buffer).setUint32(cd + 24, size, true); return b; };
            const renamed = (to) => {
                const b = real.slice();
                const text = new TextDecoder('latin1').decode(b);
                const at = text.indexOf('xl/workbook.xml', cd);
                b.set(new TextEncoder().encode(to), at);
                return b;
            };
            const kind = (b) => { const r = D.auditContainer(b); return r.ok ? 'ok' : r.error.kind + (r.error.limit ? `:${r.error.limit}` : ''); };
            const runner = H.runner();
            const viaWorker = await runner.open('left', { kind: 'workbook', bytes: new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0, 0, 0, 0]).buffer }).catch((e) => e);
            runner.stop();
            return {
                real: D.auditContainer(real),
                ole: kind(new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])),
                random: kind(new Uint8Array([1, 2, 3, 4, 5])),
                huge: kind(withSize(D.LIMITS.zipUncompressedBytes + 1)),
                zip64: kind(withSize(0xFFFFFFFF)),
                notXlsx: kind(renamed('xl/workbook.xmm')),
                xlsb: kind(renamed('xl/workbook.bin')),
                bigFile: kind(new Uint8Array(D.LIMITS.fileBytes + 1)),
                viaWorker,
            };
        });
        expect(out.real).toMatchObject({ ok: true, macros: false });
        expect(out.ole).toBe('ole-container');
        expect(out.random).toBe('not-a-workbook');
        expect(out.huge).toBe('limit:zipUncompressedBytes');
        expect(out.zip64).toBe('zip64');
        expect(out.notXlsx).toBe('not-xlsx');
        expect(out.xlsb).toBe('xlsb-not-yet');
        expect(out.bigFile).toBe('limit:fileBytes');
        expect(out.viaWorker).toEqual({ kind: 'ole-container' });
    });
});

test.describe('stopping and replacing work', () => {
    test('Stop, a replaced input and the time limit end work and drop late replies', async ({ page }) => {
        test.setTimeout(180_000);
        await openEngine(page);
        await page.addScriptTag({ url: '/js/vendor/dataset_diff/xlsx.full.min.js' });
        const out = await page.evaluate(async () => {
            const H = window.H;
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            const aoa = [Array.from({ length: 20 }, (_, c) => `c${c}`)];
            for (let i = 0; i < 40000; i++) aoa.push(Array.from({ length: 20 }, (_, c) => (c % 2 ? i * c : `r${i}c${c}`)));
            const big = XLSX.write({ SheetNames: ['S'], Sheets: { S: XLSX.utils.aoa_to_sheet(aoa) } }, { type: 'array', bookType: 'xlsx', compression: true });
            const outcome = (p) => p.then(() => 'resolved', (e) => e.kind);
            const runner = H.runner();

            // Stop while a large workbook is being read.
            const reading = outcome(runner.open('left', { kind: 'workbook', bytes: big.slice(0) }));
            await sleep(300);
            const t0 = performance.now();
            runner.stop();
            const stopped = await reading;
            const stopMs = performance.now() - t0;
            const afterStop = (await H.open(runner, 'left', 'parts-left.xlsx')).sheets.map((s) => s.name);

            // A new input on one side replaces the one still being read.
            const old = outcome(runner.open('right', { kind: 'workbook', bytes: big.slice(0) }));
            const fresh = H.open(runner, 'right', 'parts-right.xlsx');
            const [oldOutcome, freshInv] = await Promise.all([old, fresh]);
            const freshTable = await runner.table('right', { sheet: 'Same' });

            // The other side kept its source through the replacement.
            const leftTable = await runner.table('left', { sheet: 'Parts' });

            // A reply that arrives after its request was abandoned is dropped.
            const id = runner.nextId;
            const abandoned = outcome(runner.request('left', { type: 'table', sheet: 'Parts' }));
            runner.reset('left', { kind: 'replaced' });
            runner.settle('left', { id, ok: true, value: 'late' });
            const abandonedOutcome = await abandoned;

            // The time limit terminates the worker; the runner still works after.
            const limited = H.runner({ timeLimitMs: 300 });
            const timed = await limited.open('left', { kind: 'workbook', bytes: big.slice(0) }).catch((e) => e);
            limited.timeLimitMs = 60000;
            const afterLimit = (await H.open(limited, 'left', 'parts-left.xlsx')).sheets.length;
            runner.stop();
            limited.stop();
            return {
                stopped, stopMs, afterStop, oldOutcome, fresh: freshInv.sheets.length, freshRows: freshTable.table.rows.length,
                leftRows: leftTable.table.rows.length, abandonedOutcome, dropped: runner.dropped, timed, afterLimit,
                pending: runner.pending.size + limited.pending.size,
            };
        });
        expect(out.stopped).toBe('cancelled');
        expect(out.stopMs).toBeLessThan(250);
        expect(out.afterStop).toEqual(['Parts']);
        expect(out.oldOutcome).toBe('replaced');
        expect(out.fresh).toBe(7);
        expect(out.freshRows).toBe(3);
        expect(out.leftRows).toBe(3);
        expect(out.abandonedOutcome).toBe('replaced');
        expect(out.dropped).toBeGreaterThanOrEqual(1);
        expect(out.timed).toEqual({ kind: 'time-limit', seconds: 0.3 });
        expect(out.afterLimit).toBe(1);
        expect(out.pending).toBe(0);
    });
});
