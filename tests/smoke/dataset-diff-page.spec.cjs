// Dataset Diff page, tools/dataset-diff.html: examples, uploads, pairing,
// results, the capped preview with full export, Stop and narrow screens.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PAGE = '/tools/dataset-diff.html';
const DATA = path.join(__dirname, '..', '..', 'data', 'dataset_diff');

async function openPage(page) {
    await page.goto(PAGE);
    await expect(page.locator('#exampleSelect option')).toHaveCount(8);
}

async function loadExample(page, label) {
    await page.selectOption('#exampleSelect', { label });
    await expect(page.locator('#progress')).toContainText('Loaded the example');
}

async function compare(page) {
    await page.click('#compareBtn');
    await expect(page.locator('#progress')).toHaveText(/^(Compared|Stopped)/, { timeout: 60_000 });
}

const aggregate = (page) => page.locator('#aggregate .dd-agg-line');

// The combined verdicts as [same row order, sorted all columns].
async function verdicts(page, scope = '#aggregate') {
    const read = (check) => page.locator(`${scope} [data-check="${check}"] [data-verdict]`).first().getAttribute('data-verdict');
    return [await read('sameOrder'), await read('sorted')];
}
const summaryRows = (page) => page.locator('#summaryBody tr');

test.describe('examples', () => {
    test('rows in a different order: the sorted check explains the first', async ({ page }) => {
        await openPage(page);
        await loadExample(page, 'Parts: rows in a different order (CSV)');
        await expect(page.locator('#leftStatus')).toContainText('parts-left.csv: UTF-8, comma-delimited, 4 records.');
        await expect(page.locator('#leftTextOptions')).not.toContainText('null');
        await compare(page);
        expect(await verdicts(page)).toEqual(['different', 'match']);
        await expect(summaryRows(page)).toHaveCount(1);
        await expect(summaryRows(page).first()).toContainText('Same selected table values; row order differs (3 data rows)');
        await expect(page.locator('#reportBox')).toHaveValue(/Sorted all columns: every row matches; only the row order differs\./);
        await expect(page.locator('#truncationPrompt')).toBeHidden();
        await expect(page.locator('#summaryBody')).not.toContainText('Mixed formats');
        // An absent note once rendered as the text "nullnull".
        await expect(page.locator('#aggregate')).not.toContainText('null');
        expect(await page.locator('#aggregate > *').count()).toBe(1);
    });

    test('one changed quantity in a workbook, with its source cell', async ({ page }) => {
        await openPage(page);
        await loadExample(page, 'Parts: one quantity changed (XLSX)');
        await expect(page.locator('#pairsBody tr')).toHaveCount(1);
        await expect(page.getByLabel('Pair 1 right sheet')).toHaveValue('QtyChanged');
        await compare(page);
        expect(await verdicts(page)).toEqual(['different', 'different']);
        const report = await page.locator('#reportBox').inputValue();
        expect(report).toContain('[POSITION] left C3 / right C3; header="Qty"; number:20 -> number:21');
        expect(report).toContain('[LEFT ONLY] copies=1; source rows=[3]; [text:"00456", text:"South", number:20]');
        expect(report).toContain('[RIGHT ONLY] copies=1; source rows=[3]; [text:"00456", text:"South", number:21]');
    });

    test('three sheet pairs, excluded and hidden sheets named', async ({ page }) => {
        await openPage(page);
        await loadExample(page, 'Three sheet pairs in two workbooks');
        await expect(page.locator('#pairsBody tr')).toHaveCount(3);
        await expect(page.locator('#excludedSheets')).toHaveText('Not compared: left Archive, Notes (hidden); right Summary.');
        await expect(page.locator('#leftStatus')).toContainText('5 sheets (1 hidden), 1900 date system');
        await compare(page);
        await expect(aggregate(page)).toContainText('All 3 selected pairs');
        expect((await verdicts(page))[0]).toBe('different');
        const rows = summaryRows(page);
        await expect(rows.nth(0)).toContainText('Same selected table values in the same row order (3 data rows)');
        await expect(rows.nth(1)).toContainText('row order differs (4 data rows)');
        await expect(rows.nth(2)).toContainText('Selected table values or row counts differ');
        await expect(page.locator('#aggregate')).toContainText('Not compared: left Archive, Notes (hidden); right Summary.');
    });

    test('a workbook against a CSV export carries the mixed-format warning', async ({ page }) => {
        await openPage(page);
        await loadExample(page, 'Workbook against a simulated CSV export');
        await expect(page.locator('.dd-pair-status').first()).toContainText('Mixed formats');
        await compare(page);
        await expect(summaryRows(page).first()).toContainText('Mixed formats: one side is a workbook and the other is text.');
        expect((await verdicts(page))[1]).toBe('different');
        await expect(page.locator('#reportBox')).toHaveValue(/Note: Mixed formats/);
    });

    test('a formula with no stored result makes the run incomplete, never a match', async ({ page }) => {
        await openPage(page);
        await loadExample(page, 'A formula with no stored result');
        await compare(page);
        expect(await verdicts(page)).toEqual(['incomplete', 'incomplete']);
        await expect(summaryRows(page).nth(0)).toContainText('Same selected table values in the same row order');
        await expect(summaryRows(page).nth(0)).toContainText('3 formula cells compared by the result Excel stored; nothing was recalculated.');
        await expect(summaryRows(page).nth(1)).toContainText('Comparison incomplete: formulas without stored results');
        await expect(page.locator('#reportBox')).toHaveValue(/\[UNRESOLVED\] left B2: formula with no stored result/);
    });
});

test.describe('uploads and settings', () => {
    test('a column type change marks results stale and changes the verdict', async ({ page }) => {
        await openPage(page);
        await page.setInputFiles('#leftFile', path.join(DATA, 'parts-left.csv'));
        await page.setInputFiles('#rightFile', path.join(DATA, 'parts-right-PartAsNumber.csv'));
        await expect(page.locator('#rightStatus')).toContainText('4 records');
        await compare(page);
        expect((await verdicts(page))[1]).toBe('different');
        await expect(summaryRows(page).first()).toContainText('Part text (inferred: "00123" in record 2 has a leading zero)');
        await page.selectOption('#leftType0', 'number');
        await expect(page.locator('#staleNote')).toBeVisible();
        await compare(page);
        await expect(page.locator('#staleNote')).toBeHidden();
        expect(await verdicts(page)).toEqual(['match', 'match']);
        await expect(summaryRows(page).first()).toContainText('Part number (chosen)');
    });

    test('a merged header refuses its pair until a range below it is chosen', async ({ page }) => {
        await openPage(page);
        await page.setInputFiles('#leftFile', path.join(DATA, 'layout.xlsx'));
        await page.setInputFiles('#rightFile', path.join(DATA, 'layout.xlsx'));
        await expect(page.locator('#pairsBody tr')).toHaveCount(3);
        await compare(page);
        const merged = summaryRows(page).nth(1);
        await expect(merged).toContainText('Comparison incomplete: a table could not be imported');
        await expect(merged).toContainText('Merged cells A1:B1 touch the range.');
        await expect(summaryRows(page).nth(0)).toContainText('hidden rows 3 are inside the range and were compared');
        await page.getByLabel('Pair 2 left range').fill('A2:B4');
        await page.getByLabel('Pair 2 left range').press('Tab');
        await page.getByLabel('Pair 2 right range').fill('A2:B4');
        await page.getByLabel('Pair 2 right range').press('Tab');
        await compare(page);
        await expect(summaryRows(page).nth(1)).toContainText('Same selected table values in the same row order (2 data rows)');
        await expect(summaryRows(page).nth(2)).toContainText('(0 data rows)');
    });

    test('unsupported files and ragged rows are refused with a reason', async ({ page }) => {
        await openPage(page);
        await page.setInputFiles('#leftFile', { name: 'sheet.numbers', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
        await expect(page.locator('#leftErrors')).toHaveText('.numbers files are not read. Use CSV, TSV, TXT, XLSX, XLSM, XLSB, XLS or ODS.');
        await page.setInputFiles('#leftFile', { name: 'fake.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
        await expect(page.locator('#leftErrors')).toHaveText('This file is not an XLSX, XLSM, XLSB, XLS or ODS workbook.');
        await page.setInputFiles('#leftFile', path.join(DATA, 'excel', 'encrypted', 'parts-left-password.xlsx'));
        await expect(page.locator('#leftErrors')).toContainText('This workbook is password-protected. This page never asks for passwords');
        await page.setInputFiles('#leftFile', path.join(DATA, 'ragged.csv'));
        await page.setInputFiles('#rightFile', path.join(DATA, 'ragged.csv'));
        await expect(page.locator('#rightStatus')).toContainText('ragged.csv');
        await compare(page);
        expect((await verdicts(page))[0]).toBe('incomplete');
        await expect(summaryRows(page).first()).toContainText('Record 3 (line 3) has 3 fields; the header has 2.');
    });
});

test.describe('the preview cap and the full report', () => {
    test('a long diff is capped in the box; Copy takes the preview, Export takes everything', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await openPage(page);
        const rows = (shift) => 'id,value\r\n' + Array.from({ length: 3000 }, (_, i) => `id-${i},${i + shift}`).join('\r\n') + '\r\n';
        await page.setInputFiles('#leftFile', { name: 'long-left.csv', mimeType: 'text/csv', buffer: Buffer.from(rows(0)) });
        await page.setInputFiles('#rightFile', { name: 'long-right.csv', mimeType: 'text/csv', buffer: Buffer.from(rows(1)) });
        await expect(page.locator('#rightStatus')).toContainText('3,001 records');
        await compare(page);
        const prompt = page.locator('#truncationPrompt');
        await expect(prompt).toBeVisible();
        const [, shown, total] = /shows ([\d,]+) of ([\d,]+) characters/.exec(await prompt.textContent());
        const box = await page.locator('#reportBox').inputValue();
        expect([...box].length).toBe(Number(shown.replace(/,/g, '')));
        expect([...box].length).toBeLessThanOrEqual(50000);
        expect(box).not.toContain('record 3001 field 2');

        await page.click('#copyShown');
        await expect(page.locator('#exportStatus')).toContainText('Copied the');
        // Windows writes CRLF to the clipboard.
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied.split('\r\n').join('\n')).toBe(box);

        const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportFull')]);
        expect(download.suggestedFilename()).toBe('dataset-diff-report.txt');
        const full = fs.readFileSync(await download.path(), 'utf8');
        expect([...full].length).toBe(Number(total.replace(/,/g, '')));
        expect(full).toContain('[POSITION] left record 3001 field 2 / right record 3001 field 2; header="value"; number:2999 -> number:3000');
        expect(full.split('\n').filter((l) => l.startsWith('[POSITION]'))).toHaveLength(3000);
        await expect(page.locator('#exportStatus')).toContainText(`Saved the full report: ${total} characters.`);
    });
});

test.describe('stopping a run', () => {
    test('Stop leaves an incomplete result and the next Compare reads the sources again', async ({ page }) => {
        test.setTimeout(180_000);
        await openPage(page);
        await page.addScriptTag({ url: '/js/vendor/dataset_diff/xlsx.full.min.js' });
        await page.evaluate(() => {
            const aoa = [Array.from({ length: 20 }, (_, c) => `c${c}`)];
            for (let i = 0; i < 80000; i++) aoa.push(Array.from({ length: 20 }, (_, c) => (c % 2 ? i * c : `r${i}c${c}`)));
            const bytes = XLSX.write({ SheetNames: ['S'], Sheets: { S: XLSX.utils.aoa_to_sheet(aoa) } }, { type: 'array', bookType: 'xlsx', compression: true });
            for (const side of ['left', 'right']) {
                const dt = new DataTransfer();
                dt.items.add(new File([bytes], `big-${side}.xlsx`));
                const input = document.getElementById(`${side}File`);
                input.files = dt.files;
                input.dispatchEvent(new Event('change'));
            }
        });
        await expect(page.locator('#leftStatus')).toContainText('big-left.xlsx: XLSX', { timeout: 120_000 });
        await expect(page.locator('#rightStatus')).toContainText('big-right.xlsx: XLSX', { timeout: 120_000 });
        await page.click('#compareBtn');
        await expect(page.locator('#progress')).toContainText('reading tables');
        const t0 = Date.now();
        await page.click('#stopBtn');
        // "Stopping" can be replaced by "Stopped." before it is read.
        await expect(page.locator('#progress')).toHaveText(/^Stopp/, { timeout: 1000 });
        expect(Date.now() - t0).toBeLessThan(1000);
        await expect(page.locator('#progress')).toHaveText(/^Stopped\. 1 of 1 pair did not finish/, { timeout: 60_000 });
        expect((await verdicts(page))[0]).toBe('incomplete');
        await expect(page.locator('#aggregate')).toContainText('Stopped before pair 1 finished.');
        await expect(page.locator('#reportBox')).toHaveValue(/^Dataset Diff report[^\n]*\nINCOMPLETE: pairs 1 did not finish\./);
        await compare(page);
        expect((await verdicts(page))[0]).toBe('match');
        await expect(summaryRows(page).first()).toContainText('(80000 data rows)');
    });
});

test.describe('layout and page furniture', () => {
    test('no sideways scrolling at phone width with results showing', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await openPage(page);
        await loadExample(page, 'Three sheet pairs in two workbooks');
        await compare(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
    });

    test('the licenses dialog and the disclaimer link', async ({ page }) => {
        await openPage(page);
        await page.click('#viewLicenses');
        await expect(page.locator('#attributionsModal')).toBeVisible();
        await expect(page.locator('#attributionsModal')).toContainText('SheetJS Community Edition 0.20.3');
        await page.click('#closeAttributions');
        await expect(page.locator('#attributionsModal')).toBeHidden();
        await loadExample(page, 'Parts: rows in a different order (CSV)');
        await compare(page);
        await expect(page.locator('#scopeDisclaimer')).not.toHaveAttribute('open', '');
        await page.click('#disclaimerLink');
        await expect(page.locator('#scopeDisclaimer')).toHaveAttribute('open', '');
    });
});

test.describe('encodings and settings files', () => {
    test('a Windows-1252 file is refused as UTF-8, read when chosen, and matches its UTF-16 twin', async ({ page }) => {
        await openPage(page);
        const text = 'Part,Name\r\nP1,Café\r\nP2,“quoted” €5\r\n';
        const cp1252 = Buffer.from(text.replace('“', '\x93').replace('”', '\x94').replace('€', '\x80'), 'latin1');
        const utf16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(text, 'utf16le')]);
        await page.setInputFiles('#leftFile', { name: 'legacy.csv', mimeType: 'text/csv', buffer: cp1252 });
        await expect(page.locator('#leftErrors')).toContainText('choose Windows-1252 under Text encoding');
        await page.selectOption('#leftEncoding', 'windows-1252');
        await expect(page.locator('#leftStatus')).toHaveText('legacy.csv: Windows-1252, comma-delimited, 3 records.');
        await expect(page.locator('#leftErrors')).toBeHidden();
        await page.setInputFiles('#rightFile', { name: 'unicode.csv', mimeType: 'text/csv', buffer: utf16 });
        await expect(page.locator('#rightStatus')).toHaveText('unicode.csv: UTF-16 LE BOM, comma-delimited, 3 records.');
        await compare(page);
        expect(await verdicts(page)).toEqual(['match', 'match']);
        await expect(page.locator('#reportBox')).toHaveValue(/Note: Left import: Windows-1252, comma-delimited/);
    });

    test('saved settings carry pairs and column types to a fresh page, and a bad file is refused', async ({ page }) => {
        await openPage(page);
        await page.setInputFiles('#leftFile', path.join(DATA, 'parts-left.csv'));
        await page.setInputFiles('#rightFile', path.join(DATA, 'parts-right-PartAsNumber.csv'));
        await expect(page.locator('#rightStatus')).toContainText('4 records');
        await page.selectOption('#leftType0', 'number');
        const [download] = await Promise.all([page.waitForEvent('download'), page.click('#saveRecipe')]);
        const saved = fs.readFileSync(await download.path(), 'utf8');
        expect(saved).not.toContain('parts-left');
        expect(JSON.parse(saved).text.left.types).toEqual(['number']);

        await openPage(page);
        await page.setInputFiles('#recipeFile', { name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
        await expect(page.locator('#recipeStatus')).toContainText('Loaded settings for 1 pair. Choose the files');
        await page.setInputFiles('#leftFile', path.join(DATA, 'parts-left.csv'));
        await page.setInputFiles('#rightFile', path.join(DATA, 'parts-right-PartAsNumber.csv'));
        await expect(page.locator('#rightStatus')).toContainText('4 records');
        await expect(page.locator('#leftType0')).toHaveValue('number');
        await compare(page);
        expect(await verdicts(page)).toEqual(['match', 'match']);

        await page.setInputFiles('#recipeFile', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"dataset-diff-recipe","version":1,"pairs":[]}') });
        await expect(page.locator('#recipeStatus')).toHaveText('Settings not loaded: pairs must list between 1 and 100 pairs.');
        await expect(page.locator('#pairsBody tr')).toHaveCount(1);
    });

    test('a settings file restores a three-pair plan with an excluded pair', async ({ page }) => {
        await openPage(page);
        await loadExample(page, 'Three sheet pairs in two workbooks');
        await page.getByLabel('Include pair 2').uncheck();
        await page.getByLabel('Pair 1 left range').fill('A1:C3');
        await page.getByLabel('Pair 1 left range').press('Tab');
        const [download] = await Promise.all([page.waitForEvent('download'), page.click('#saveRecipe')]);
        const saved = fs.readFileSync(await download.path(), 'utf8');
        await openPage(page);
        await page.setInputFiles('#leftFile', path.join(DATA, 'three-pairs-left.xlsx'));
        await page.setInputFiles('#rightFile', path.join(DATA, 'three-pairs-right.xlsx'));
        await expect(page.locator('#pairsBody tr')).toHaveCount(3);
        await page.setInputFiles('#recipeFile', { name: 'plan.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
        await expect(page.locator('#recipeStatus')).toContainText('Check the pairs, then Compare.');
        await expect(page.getByLabel('Include pair 2')).not.toBeChecked();
        await expect(page.getByLabel('Pair 1 left range')).toHaveValue('A1:C3');
        await compare(page);
        await expect(summaryRows(page)).toHaveCount(2);
        // Only the left range was shortened, so 2 rows meet 3.
        await expect(summaryRows(page).first()).toContainText('Orders A1:C3 -> three-pairs-right.xlsx!Orders');
        await expect(summaryRows(page).first()).toContainText('2 / 3');
    });
});

test.describe('workbook formats on the page', () => {
    test('an ODS side carries its limitations note; XLS and XLSB name their format', async ({ page }) => {
        await openPage(page);
        await page.setInputFiles('#leftFile', path.join(DATA, 'excel', 'ods', 'parts-left.ods'));
        await page.setInputFiles('#rightFile', path.join(DATA, 'excel', 'xls', 'parts-left.xls'));
        await expect(page.locator('#leftStatus')).toContainText('parts-left.ods: ODS, 1 sheet');
        await expect(page.locator('#rightStatus')).toContainText('parts-left.xls: XLS, 1 sheet');
        await compare(page);
        expect(await verdicts(page)).toEqual(['match', 'match']);
        await expect(summaryRows(page).first()).toContainText('Left is ODS: hidden sheets, rows and columns are not detected');
        await page.setInputFiles('#rightFile', path.join(DATA, 'excel', 'xlsb', 'parts-left.xlsb'));
        await expect(page.locator('#rightStatus')).toContainText('parts-left.xlsb: XLSB, 1 sheet');
    });
});

// A small RFC 4180 reader for checking exports; it shares nothing with the tool.
function readCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; } else field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
}

async function saveFrom(page, button) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click(button)]);
    return { name: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8') };
}

test.describe('secondary exports and print', () => {
    test('CSV and JSON exports agree with the report; formula-like text is escaped in CSV only', async ({ page }) => {
        await openPage(page);
        const left = 'id,note\r\na,=1+1\r\nb,"plain, with comma"\r\n';
        const right = 'id,note\r\na,@SUM(A1)\r\nb,"plain, with comma"\r\nc,-extra\r\n';
        await page.setInputFiles('#leftFile', { name: 'notes-left.csv', mimeType: 'text/csv', buffer: Buffer.from(left) });
        await page.setInputFiles('#rightFile', { name: 'notes-right.csv', mimeType: 'text/csv', buffer: Buffer.from(right) });
        await expect(page.locator('#rightStatus')).toContainText('4 records');
        await compare(page);
        const report = await page.locator('#reportBox').inputValue();

        const pos = await saveFrom(page, '#exportPositional');
        expect(pos.name).toBe('dataset-diff-positional.csv');
        expect(pos.text.charCodeAt(0)).toBe(0xFEFF);
        const p = readCsv(pos.text.slice(1));
        expect(p[0]).toEqual(['pair', 'pair_label', 'kind', 'left_ref', 'right_ref', 'header', 'left_type', 'left_value', 'right_type', 'right_value', 'detail', 'formula_escaped']);
        expect(p.slice(1)).toEqual([
            ['1', 'notes-left.csv -> notes-right.csv', 'changed', 'record 2 field 2', 'record 2 field 2', 'note', 'text', "'=1+1", 'text', "'@SUM(A1)", '', 'yes'],
            ['1', 'notes-left.csv -> notes-right.csv', 'extra-right-row', '', 'record 4 field 1', 'id', '', '', 'text', 'c', '', 'no'],
            ['1', 'notes-left.csv -> notes-right.csv', 'extra-right-row', '', 'record 4 field 2', 'note', '', '', 'text', "'-extra", '', 'yes'],
        ]);
        expect(p.filter((r) => r[2] === 'changed')).toHaveLength(report.split('\n').filter((l) => l.startsWith('[POSITION]')).length);

        const sorted = await saveFrom(page, '#exportSorted');
        const s = readCsv(sorted.text.slice(1));
        expect(s.slice(1)).toEqual([
            ['1', 'notes-left.csv -> notes-right.csv', 'left', '1', '1', '2', '[text:"a", text:"=1+1"]', 'no'],
            ['1', 'notes-left.csv -> notes-right.csv', 'right', '1', '1', '2', '[text:"a", text:"@SUM(A1)"]', 'no'],
            ['1', 'notes-left.csv -> notes-right.csv', 'right', '1', '1', '4', '[text:"c", text:"-extra"]', 'no'],
        ]);

        const json = JSON.parse((await saveFrom(page, '#exportJson')).text);
        expect(json.format).toBe('dataset-diff-report');
        expect(json.aggregate).toMatchObject({ sameOrder: 'different', sorted: 'different' });
        const pair = json.pairs[0];
        expect(pair.sameOrder.changes).toEqual([{ leftRef: 'record 2 field 2', rightRef: 'record 2 field 2', header: 'note', left: ['t', '=1+1'], right: ['t', '@SUM(A1)'] }]);
        expect(pair.sameOrder.extraRightRows).toEqual([{ sourceRow: 4, cells: [['t', 'c'], ['t', '-extra']] }]);
        expect(pair.sorted).toMatchObject({ matchedRows: 1, leftOnlyRows: 1, rightOnlyRows: 2 });
        await expect(page.locator('#exportStatus')).toHaveText('Saved the full results as dataset-diff-results.json.');
    });

    test('exports keep exact numbers and every difference past the preview', async ({ page }) => {
        await openPage(page);
        const rows = (shift) => 'id,value\r\n' + Array.from({ length: 1500 }, (_, i) => `id-${i},${(i + shift) / 8}`).join('\r\n') + '\r\n';
        await page.setInputFiles('#leftFile', { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(rows(0)) });
        await page.setInputFiles('#rightFile', { name: 'b.csv', mimeType: 'text/csv', buffer: Buffer.from(rows(1)) });
        await expect(page.locator('#rightStatus')).toContainText('1,501 records');
        await compare(page);
        await expect(page.locator('#truncationPrompt')).toBeVisible();
        const full = (await saveFrom(page, '#exportFull')).text;
        const p = readCsv((await saveFrom(page, '#exportPositional')).text.slice(1));
        const changed = p.filter((r) => r[2] === 'changed');
        expect(changed).toHaveLength(full.split('\n').filter((l) => l.startsWith('[POSITION]')).length);
        expect(changed).toHaveLength(1500);
        expect(changed[1499].slice(7, 10)).toEqual(['187.375', 'number', '187.5']);
        const json = JSON.parse((await saveFrom(page, '#exportJson')).text);
        expect(json.pairs[0].sameOrder.changes[1499]).toMatchObject({ left: ['n', '187375e-3'], right: ['n', '1875e-1'] });
        expect(json.pairs[0].sorted.leftOnly).toHaveLength(1500);
    });

    test('print shows the results and the preview, not the controls', async ({ page }) => {
        await openPage(page);
        await loadExample(page, 'Equal displays, different stored decimals');
        await compare(page);
        await page.emulateMedia({ media: 'print' });
        await expect(page.locator('#printText')).toBeVisible();
        expect(await page.locator('#printText').textContent()).toBe(await page.locator('#reportBox').inputValue());
        await expect(page.locator('#reportBox')).toBeHidden();
        await expect(page.locator('#pairsTable')).toBeHidden();
        await expect(page.locator('#compareBtn')).toBeHidden();
        await expect(page.locator('#summaryTable')).toBeVisible();
        await expect(page.locator('#resultsPanel p.disclaimer')).toBeVisible();
        await page.emulateMedia({ media: 'screen' });
        await expect(page.locator('#printText')).toBeHidden();
    });
});

test.describe('declared dates on the page', () => {
    test('a CSV date column declared M/D/YYYY matches the workbook serials', async ({ page }) => {
        await openPage(page);
        await page.setInputFiles('#leftFile', path.join(DATA, 'dates-1900.xlsx'));
        await page.setInputFiles('#rightFile', path.join(DATA, 'dates-mdy-simulated.csv'));
        await expect(page.locator('#rightStatus')).toContainText('5 records');
        await expect(page.locator('#leftStatus')).toContainText('dates-1900.xlsx: XLSX');
        await page.getByLabel('Pair 1 left sheet').selectOption('Dates');
        await compare(page);
        expect(await verdicts(page)).toEqual(['different', 'different']);
        await page.selectOption('#rightType1', 'date');
        await compare(page);
        expect(await verdicts(page)).toEqual(['match', 'match']);
        await expect(summaryRows(page).first()).toContainText('When date (M/D/YYYY, 1900 date system)');
        // 29 February 1900 exists only in Excel's 1900 system, so the column stays text.
        await page.selectOption('#rightDateSystem', '1904');
        await compare(page);
        expect(await verdicts(page)).toEqual(['different', 'different']);
        await expect(summaryRows(page).first()).toContainText('When text (chosen as dates: 1 value cannot be read as M/D/YYYY in the 1904 date system, such as "2/29/1900" in record 4)');
    });

    test('dates converted for one system against a workbook in the other are flagged', async ({ page }) => {
        await openPage(page);
        await page.setInputFiles('#leftFile', path.join(DATA, 'excel', 'typed', 'dates-typed.xlsx'));
        await page.setInputFiles('#rightFile', path.join(DATA, 'dates-typed-1904.csv'));
        await expect(page.locator('#rightStatus')).toContainText('10 records');
        await expect(page.locator('#leftStatus')).toContainText('dates-typed.xlsx: XLSX');
        await page.selectOption('#rightType1', 'date');
        await page.selectOption('#rightDateSystem', '1904');
        await compare(page);
        expect(await verdicts(page)).toEqual(['different', 'different']);
        await expect(summaryRows(page).first()).toContainText('Right dates were converted to the 1904 date system, but the left workbook uses 1900, so equal dates will differ.');
    });
});

// ---------------------------------------------------------------- release review

const { expectContrastAA } = require('./helpers.cjs');

test.describe('release review', () => {
    test('every control has an accessible name', async ({ page }) => {
        await openPage(page);
        await loadExample(page, 'Parts: identifiers saved as numbers (CSV)');
        await compare(page);
        const unnamed = await page.evaluate(() => {
            const out = [];
            for (const node of document.querySelectorAll('main input, main select, main textarea, main button, dialog button')) {
                if (node.type === 'hidden' || node.hidden) continue;
                const named = (node.labels && node.labels.length) || node.getAttribute('aria-label')
                    || node.getAttribute('aria-labelledby') || (node.tagName === 'BUTTON' && node.textContent.trim());
                if (!named) out.push(node.id || node.outerHTML.slice(0, 80));
            }
            return out;
        });
        expect(unnamed).toEqual([]);
    });

    test('the whole flow works from the keyboard', async ({ page }) => {
        await openPage(page);
        await page.focus('#exampleSelect');
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('#progress')).toContainText('Loaded the example "Parts: rows in a different order (CSV)"');
        await page.focus('#compareBtn');
        await page.keyboard.press('Enter');
        await expect(page.locator('#progress')).toHaveText(/^Compared/);
        expect(await verdicts(page)).toEqual(['different', 'match']);
        await page.focus('#exportFull');
        const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
        expect(download.suggestedFilename()).toBe('dataset-diff-report.txt');
        await page.focus('#viewLicenses');
        await page.keyboard.press('Enter');
        await expect(page.locator('#attributionsModal')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#attributionsModal')).toBeHidden();
    });

    test('page text clears WCAG AA in both themes', async ({ page }) => {
        test.setTimeout(120_000);
        await openPage(page);
        const rows = (shift) => 'id,value\r\n' + Array.from({ length: 800 }, (_, i) => `id-${i},${i + shift}`).join('\r\n') + '\r\n';
        await page.setInputFiles('#leftFile', { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(rows(0)) });
        await page.setInputFiles('#rightFile', { name: 'b.csv', mimeType: 'text/csv', buffer: Buffer.from(rows(1)) });
        await expect(page.locator('#rightStatus')).toContainText('801 records');
        await compare(page);
        await page.selectOption('#leftType0', 'text');
        await page.setInputFiles('#leftFile', { name: 'bad.numbers', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
        await expect(page.locator('#staleNote')).toBeVisible();
        await expect(page.locator('#truncationPrompt')).toBeVisible();
        await expect(page.locator('#leftErrors')).toBeVisible();
        for (const selector of ['.dd-verdict', '.dd-help', '.dd-note', '.dd-status', '.dd-errors', '.dd-stale',
            '.dd-prompt', '.dd-headline', '.dd-notes li', '.dd-table thead th', '.dd-pair-status', '.dd-field']) {
            await expectContrastAA(page, selector);
        }
    });

    test('nothing leaves the page: same-origin requests and fonts only, no data sent', async ({ page }) => {
        const requests = [];
        page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
        await openPage(page);
        await loadExample(page, 'Three sheet pairs in two workbooks');
        await compare(page);
        for (const button of ['#exportFull', '#exportPositional', '#exportJson']) {
            await Promise.all([page.waitForEvent('download'), page.click(button)]);
        }
        const origin = new URL(page.url()).origin;
        const foreign = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('blob:') && !r.url.startsWith('data:')
            && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(r.url));
        expect(foreign).toEqual([]);
        expect(requests.filter((r) => r.method !== 'GET' || r.body)).toEqual([]);
    });

    test('with the network off after load, two runs and an export work; a restarted reader explains itself', async ({ page, context }) => {
        await openPage(page);
        const describe = await page.evaluateHandle(async () => (await import('/js/dataset_diff/diff-render.js')).describeError);
        // Let the warm-up finish: each worker answers once its scripts are in.
        await page.waitForTimeout(1500);
        await context.setOffline(true);
        await page.setInputFiles('#leftFile', path.join(DATA, 'parts-left.xlsx'));
        await page.setInputFiles('#rightFile', path.join(DATA, 'parts-right-QtyChanged.csv'));
        await expect(page.locator('#rightStatus')).toContainText('4 records');
        await expect(page.locator('#leftStatus')).toContainText('parts-left.xlsx: XLSX');
        await compare(page);
        expect(await verdicts(page)).toEqual(['different', 'different']);
        const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportFull')]);
        expect(fs.readFileSync(await download.path(), 'utf8')).toContain('[POSITION] left C3 / right record 3 field 3; header="Qty"; number:20 -> number:21');
        await page.selectOption('#rightType2', 'text');
        await compare(page);
        expect(await verdicts(page)).toEqual(['different', 'different']);
        // A reader started while offline cannot load its modules; the message says why.
        const message = await page.evaluate(async (describeError) => {
            const r = new window.DatasetDiff.Runner(new URL('/js/dataset_diff/diff-worker.js', location.href).href, { timeLimitMs: 10000 });
            const error = await r.open('left', { kind: 'text', text: 'a,b', name: 'x' }).then(() => null, (e) => e);
            r.stop();
            return error && describeError(error);
        }, describe);
        expect(message).toContain('probably because the network is off');
        await context.setOffline(false);
    });
});
