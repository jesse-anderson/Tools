// Sensor reference table: search filtering (including category headers and the
// empty state), the results counter, cost-aware sorting within category groups,
// keyboard-operable sort headers, and the vibration section's data integrity.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const PAGE = '/tools/sensors.html';

const visibleRows = (page) => page.locator('#sensorTable tbody tr:not(.category-row):visible');
const visibleCategories = (page) => page.locator('#sensorTable tbody tr.category-row:visible');

test('sensor table loads every row with no search applied', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  const dataRows = page.locator('#sensorTable tbody tr:not(.category-row)');
  const categoryRows = page.locator('#sensorTable tbody tr.category-row');

  expect(await dataRows.count()).toBeGreaterThanOrEqual(40);
  expect(await categoryRows.count()).toBeGreaterThanOrEqual(5);
  await expect(visibleCategories(page)).toHaveCount(await categoryRows.count());
  await expect(page.locator('#resultsCount')).not.toHaveClass(/visible/);
  await expect(page.locator('#noResults')).toBeHidden();

  // Every data row carries all seven columns
  const cellCounts = await dataRows.evaluateAll((rows) => rows.map((row) => row.cells.length));
  expect(new Set(cellCounts)).toEqual(new Set([7]));
});

test('search hides category headers whose section has no match', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  await page.fill('#searchInput', 'BME280');

  await expect(visibleRows(page)).toHaveCount(1);
  await expect(visibleRows(page).first()).toContainText('BME280');
  // Only the section that still holds a match keeps its header
  await expect(visibleCategories(page)).toHaveCount(1);
  await expect(visibleCategories(page).first()).toContainText('Thermal');
  await expect(page.locator('#noResults')).toBeHidden();
});

test('results counter reports sensors only, excluding category header rows', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  const dataRowCount = await page.locator('#sensorTable tbody tr:not(.category-row)').count();

  await page.fill('#searchInput', 'Sensirion');

  // Let the 150ms debounce settle before comparing the readout to the DOM
  await expect(page.locator('#resultsCount')).toHaveClass(/visible/);
  await expect(page.locator('#resultsCount')).toHaveText(new RegExp(`^[0-9]+ of ${dataRowCount} sensors$`));

  const reported = Number((await page.locator('#resultsCount').textContent()).split(' ')[0]);
  await expect(visibleRows(page)).toHaveCount(reported);
  expect(reported).toBeGreaterThan(0);
  expect(reported).toBeLessThan(dataRowCount);
});

test('a search with no matches shows the empty state and clearing restores the table', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  const categoryCount = await page.locator('#sensorTable tbody tr.category-row').count();

  await page.fill('#searchInput', 'zzzz-no-such-part');

  await expect(visibleRows(page)).toHaveCount(0);
  await expect(visibleCategories(page)).toHaveCount(0);
  await expect(page.locator('#noResults')).toBeVisible();

  await page.click('#clearSearch');

  await expect(page.locator('#searchInput')).toHaveValue('');
  await expect(page.locator('#noResults')).toBeHidden();
  await expect(visibleCategories(page)).toHaveCount(categoryCount);
});

test('sorting orders rows inside each category without moving the headers', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  const headerTextBefore = await page.locator('#sensorTable tbody tr.category-row').allTextContents();

  await page.click('#sensorTable th[data-sort="1"]');
  await expect(page.locator('#sensorTable th[data-sort="1"]')).toHaveAttribute('aria-sort', 'ascending');

  const headerTextAfter = await page.locator('#sensorTable tbody tr.category-row').allTextContents();
  expect(headerTextAfter).toEqual(headerTextBefore);

  // Within a single section the model column is now ascending
  const firstSectionModels = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#sensorTable tbody tr'));
    const start = rows.findIndex((r) => r.classList.contains('category-row'));
    const models = [];
    for (let i = start + 1; i < rows.length; i++) {
      if (rows[i].classList.contains('category-row')) break;
      models.push(rows[i].cells[1].textContent.trim().toLowerCase());
    }
    return models;
  });
  expect(firstSectionModels).toEqual([...firstSectionModels].sort());

  await page.click('#sensorTable th[data-sort="1"]');
  await expect(page.locator('#sensorTable th[data-sort="1"]')).toHaveAttribute('aria-sort', 'descending');
});

test('cost column sorts by band rather than by dollar-sign text', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  await page.click('#sensorTable th[data-sort="2"]');

  const bands = await page.evaluate(() => {
    const order = ['cost-low', 'cost-med', 'cost-high', 'cost-extreme'];
    const rows = Array.from(document.querySelectorAll('#sensorTable tbody tr'));
    const start = rows.findIndex((r) => r.classList.contains('category-row'));
    const ranks = [];
    for (let i = start + 1; i < rows.length; i++) {
      if (rows[i].classList.contains('category-row')) break;
      const tag = rows[i].querySelector('.cost-tag');
      ranks.push(order.findIndex((c) => tag.classList.contains(c)));
    }
    return ranks;
  });
  expect(bands).toEqual([...bands].sort((a, b) => a - b));
});

test('sort headers are keyboard operable and non-sortable headers are not focusable', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  const sortable = page.locator('#sensorTable th[data-sort="0"]');
  await sortable.focus();
  await page.keyboard.press('Enter');
  await expect(sortable).toHaveAttribute('aria-sort', 'ascending');

  await page.keyboard.press(' ');
  await expect(sortable).toHaveAttribute('aria-sort', 'descending');

  const nonSortableTabIndex = await page.locator('#sensorTable thead th:not([data-sort])')
    .evaluateAll((ths) => ths.map((th) => th.tabIndex));
  expect(nonSortableTabIndex.every((i) => i < 0)).toBe(true);
});

test('vibration section is generic to rotating equipment, not one application domain', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  const section = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#sensorTable tbody tr'));
    const start = rows.findIndex((r) => r.classList.contains('category-row') && /vibration/i.test(r.textContent));
    if (start === -1) return null;
    const header = rows[start].textContent.trim();
    const entries = [];
    for (let i = start + 1; i < rows.length; i++) {
      if (rows[i].classList.contains('category-row')) break;
      entries.push({
        reading: rows[i].cells[0].textContent.trim(),
        model: rows[i].cells[1].textContent.trim(),
        vin: rows[i].cells[5].textContent.trim()
      });
    }
    return { header, entries };
  });

  expect(section).not.toBeNull();
  expect(section.header).toBe('Vibration & Condition Monitoring');
  expect(section.entries.length).toBeGreaterThanOrEqual(15);

  // Terms tied to one deployment rather than to rotating equipment in general
  const domainTerms = /broom|curb|street ?sweep|gutter|hopper/i;
  for (const entry of section.entries) {
    expect(entry.reading).not.toMatch(domainTerms);
  }

  // Spot-check specs verified against manufacturer datasheets
  const byModel = (needle) => section.entries.find((e) => e.model.includes(needle));
  expect(byModel('603C01').reading).toContain('0.5–10k Hz');
  expect(byModel('786A').vin).toBe('18V - 30V (2-10mA)');
  expect(byModel('604B31').reading).toContain('0.5–5k Hz');
  expect(byModel('799LF').reading).toContain('0.1–2.5k Hz');
  expect(byModel('ROS-W').vin).toBe('3.3V - 15V');
  expect(byModel('VVB001').reading).toContain('2–10k Hz');
});
