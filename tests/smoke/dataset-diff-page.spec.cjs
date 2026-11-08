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
        await page.setInputFiles('#leftFile', { name: 'old.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
        await expect(page.locator('#leftErrors')).toHaveText('.xls files are not read yet. Save it as .xlsx or .csv.');
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
