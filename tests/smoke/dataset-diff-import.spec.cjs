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
                const cell = (c) => (c === null ? null : c[0] === 'n' ? D.numberFromDouble(c[1]) : c);
                return { headers: pad(rows[0]).map((c) => (c === null ? '' : String(c[1]))), rows: rows.slice(1).map((r) => pad(r).map(cell)) };
            },
            text(t, options = {}) { return D.importDelimited(t, { delimiter: ',', ...options }); },
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
