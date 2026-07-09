// Workweek planner: date-range counting, per-sheet day layout, print gating on
// invalid configs, and restoration/sanitization of malformed saved plans.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

function countMatchingWeekdays(startIso, endIso, allowedWeekdays) {
  const allowed = new Set(allowedWeekdays);
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  let count = 0;

  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (allowed.has(cursor.getDay())) {
      count += 1;
    }
  }

  return count;
}

async function getPlannerStatValue(page, label) {
  return page.evaluate((wantedLabel) => {
    const cards = Array.from(document.querySelectorAll('#statsGrid .stat-card'));
    const match = cards.find((card) => {
      const cardLabel = card.querySelector('.label')?.textContent?.trim();
      return cardLabel === wantedLabel;
    });

    return match?.querySelector('.value')?.textContent?.trim() || null;
  }, label);
}

async function getStatusBannerText(page) {
  return page.locator('#statusBanner').textContent();
}

test('workweek planner counts long date ranges without truncation', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await page.selectOption('#selectionPreset', 'single');
  await page.selectOption('#dateMode', 'range');
  await page.selectOption('#daysPerSheetSelect', '7');
  await page.fill('#rangeStartInput', '2026-01-01');
  await page.locator('#rangeStartInput').blur();
  await page.fill('#rangeEndInput', '2027-12-31');
  await page.locator('#rangeEndInput').blur();

  const expectedMondays = countMatchingWeekdays('2026-01-01', '2027-12-31', [1]);

  await expect.poll(
    () => getPlannerStatValue(page, 'Planner days'),
    { message: 'Expected the planner to include every matching Monday in the requested range.' }
  ).toBe(String(expectedMondays));
});

test('workweek planner uses days per sheet and keeps sheet days in one row', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await expect(page.locator('#groupingSelect')).toHaveCount(0);
  await page.selectOption('#selectionPreset', 'fullweek');
  await page.selectOption('#daysPerSheetSelect', '7');
  await page.selectOption('#orientationSelect', 'landscape');

  await expect.poll(
    () => getPlannerStatValue(page, 'Printable pages'),
    { message: 'Expected seven selected days with seven days per sheet to produce one page.' }
  ).toBe('1');

  await expect.poll(
    () => page.locator('.planner-day-grid').first().getAttribute('style'),
    { message: 'Expected all seven days to be laid out left to right on the same sheet.' }
  ).toContain('grid-template-columns: repeat(7');

  await expect.poll(
    () => page.locator('.planner-day-grid').first().getAttribute('style'),
    { message: 'Expected days to stay in one row rather than stacking.' }
  ).toContain('grid-template-rows: repeat(1');
});

test('workweek planner blocks direct print when the configuration is invalid', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await page.evaluate(() => {
    window.__printCalls = 0;
    window.print = () => {
      window.__printCalls += 1;
    };
  });

  for (const dayId of ['mon', 'tue', 'wed', 'thu', 'fri']) {
    await page.locator(`#dayGrid input[value="${dayId}"]`).uncheck();
  }

  await page.click('#printBtn');

  await expect.poll(
    () => page.evaluate(() => window.__printCalls),
    { message: 'Expected invalid planner settings to block the browser print dialog.' }
  ).toBe(0);

  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected invalid planner settings to surface a print error banner.' }
  ).toContain('Printing is unavailable until the planner configuration is valid.');
});

test('workweek planner does not show a false success message when saved-plan storage fails', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItemWithFailure(key, value) {
      if (key === 'workweekPlannerSaved') {
        throw new Error('simulated quota failure');
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await page.fill('#saveNameInput', 'Release check');
  await page.click('#savePlanBtn');

  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected saved-plan storage failures to keep the error banner visible.' }
  ).toContain('Saving failed. localStorage may be unavailable or full.');

  await expect(page.locator('#savedPlansList .saved-plan-item')).toHaveCount(0);
});

test('workweek planner restores empty selected days as an invalid configuration', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('workweekPlannerCurrent', JSON.stringify({
      selectionPreset: 'custom',
      selectedDays: [],
      dateMode: 'generic',
      startTime: '08:00',
      endTime: '17:00',
      interval: 15
    }));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await expect(page.locator('#dayGrid input:checked')).toHaveCount(0);
  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected an exported empty day selection to remain invalid instead of restoring the default workweek.' }
  ).toContain('Select at least one day to generate planner sheets.');
});

test('workweek planner sanitizes impossible restored times before generating rows', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('workweekPlannerCurrent', JSON.stringify({
      selectionPreset: 'single',
      selectedDays: ['mon'],
      dateMode: 'generic',
      durationPreset: 'custom',
      startTime: '08:00',
      endTime: '99:00',
      interval: 15
    }));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await expect(page.locator('#endTimeInput')).toHaveValue('17:00');
  await expect.poll(
    () => getPlannerStatValue(page, 'Hours per day'),
    { message: 'Expected the invalid restored end time to fall back before schedule generation.' }
  ).toBe('9h');
});

test('workweek planner rejects impossible restored range dates instead of rolling them forward', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('workweekPlannerCurrent', JSON.stringify({
      selectionPreset: 'custom',
      selectedDays: ['tue'],
      dateMode: 'range',
      rangeStart: '2026-02-31',
      rangeEnd: '2026-02-31',
      startTime: '08:00',
      endTime: '17:00',
      interval: 15
    }));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await expect(page.locator('#rangeStartInput')).toHaveValue('');
  await expect(page.locator('#rangeEndInput')).toHaveValue('');
  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected an impossible stored date to stay invalid rather than becoming March 3.' }
  ).toContain('Set both start and end dates for range mode.');
  await expect.poll(() => getPlannerStatValue(page, 'Planner days')).toBe('0');
});

test('workweek planner rejects impossible restored months instead of rolling into another year', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('workweekPlannerCurrent', JSON.stringify({
      selectionPreset: 'custom',
      selectedDays: ['fri'],
      dateMode: 'month',
      month: '2026-13',
      startTime: '08:00',
      endTime: '17:00',
      interval: 15
    }));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  await expect(page.locator('#monthInput')).toHaveValue('');
  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected an impossible stored month to remain invalid instead of becoming January 2027.' }
  ).toContain('Choose a month to generate all selected weekdays in that month.');
  await expect.poll(() => getPlannerStatValue(page, 'Planner days')).toBe('0');

  await page.fill('#titleInput', 'Still needs a month');
  await expect(page.locator('#monthInput')).toHaveValue('');
  await expect.poll(
    () => getStatusBannerText(page),
    { message: 'Expected unrelated edits to preserve the missing-month error.' }
  ).toContain('Choose a month to generate all selected weekdays in that month.');
});

test('workweek planner tolerates malformed saved plan configs', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('workweekPlannerSaved', JSON.stringify([
      {
        id: 'broken-plan',
        name: 'Broken config',
        savedAt: 'not-a-date',
        config: {}
      }
    ]));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/workweek-planner.html');

  const savedPlan = page.locator('#savedPlansList .saved-plan-item');
  await expect(savedPlan).toHaveCount(1);
  await expect(savedPlan).toContainText('Broken config');
  await expect(savedPlan).toContainText('generic | 08:00-17:00 | MON, TUE, WED, THU, FRI');
});
