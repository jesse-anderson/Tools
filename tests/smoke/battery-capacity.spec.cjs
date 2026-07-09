// Battery capacity calculator: regulator estimates, topology validation,
// chemistry presets, tiny-value formatting, state profiles, and saved
// scenarios (including local-storage failure paths).
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

test('battery capacity calculator computes the default fixed-regulator estimate', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await expect(page.locator('#runtimeResult')).toHaveText('16 hr 12 min');
  await expect(page.locator('#usableEnergyResult')).toHaveText('6.66 Wh');
  await expect(page.locator('#avgLoadCurrentResult')).toHaveText('100 mA');
  await expect(page.locator('#avgLoadPowerResult')).toHaveText('370 mW');
  await expect(page.locator('#batteryCurrentResult')).toHaveText('111.11 mA');
  await expect(page.locator('#peakBatteryCurrentResult')).toHaveText('111.11 mA');
  await expect(page.locator('#feasibilityResult')).toHaveText('Not evaluated');

  const contributionRows = page.locator('#contributionList .contribution-row');
  await expect(contributionRows).toHaveCount(2);
  await expect(contributionRows.nth(0).locator('.contribution-name')).toHaveText('Average load');
  await expect(contributionRows.nth(0).locator('.contribution-share')).toHaveText('90%');
  await expect(contributionRows.nth(1).locator('.contribution-name')).toHaveText('Converter loss');
  await expect(contributionRows.nth(1).locator('.contribution-share')).toHaveText('10%');
});

test('battery capacity calculator rejects fractional cell topology counts', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.selectOption('#batteryModelMode', 'cellPack');
  await page.fill('#seriesCells', '1.5');
  await page.click('#calculateBtn');

  await expect(page.locator('#calculation-error')).toHaveText('Cells in series must be a whole number of at least 1.');
  await expect(page.locator('#runtimeResult')).toHaveText('--');
  await expect(page.locator('#derivedPackSummary')).toHaveText('Enter valid cell capacity, nominal voltage, and series/parallel counts to derive the pack model.');

  await page.fill('#seriesCells', '2');
  await page.fill('#parallelCells', '2.5');
  await page.click('#calculateBtn');

  await expect(page.locator('#calculation-error')).toHaveText('Cells in parallel must be a whole number of at least 1.');
  await expect(page.locator('#runtimeResult')).toHaveText('--');
});

test('battery capacity direct feed rejects explicit load voltage mismatch', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.selectOption('#regulatorType', 'direct');
  await page.fill('#loadVoltage', '3.75');
  await page.click('#calculateBtn');

  await expect(page.locator('#calculation-error')).toHaveText('Direct battery feed assumes the load voltage matches pack voltage. Leave it blank or match the pack voltage.');
  await expect(page.locator('#runtimeResult')).toHaveText('--');
});

test('battery capacity formats tiny nonzero current and power without rounding to zero', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.fill('#constantCurrent', '0.01');
  await page.selectOption('#constantCurrentUnit', 'uA');
  await page.click('#calculateBtn');

  await expect(page.locator('#avgLoadCurrentResult')).toHaveText('<0.1 uA');
  await expect(page.locator('#avgLoadPowerResult')).toHaveText('<0.1 uW');
  await expect(page.locator('#batteryCurrentResult')).toHaveText('<0.1 uA');
});

test('battery capacity embedded presets reset chemistry-derived defaults', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.fill('#usableFraction', '12');
  await page.selectOption('#embeddedPreset', 'esp32Wifi');
  await page.click('#applyPresetBtn');

  await expect(page.locator('#usableFraction')).toHaveValue('90');
  await expect(page.locator('#modeSelect')).toHaveValue('stateProfile');
  await expect(page.locator('#loadVoltage')).toHaveValue('3.3');
  await expect(page.locator('#profileRowsContainer .profile-row')).toHaveCount(4);
  await expect(page.locator('#profileHelper')).toContainText('4 states entered.');
  await expect(page.locator('#runtimeResult')).not.toHaveText('--');
});

test('battery capacity profile rows keep current and duration controls visible at mid widths', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.selectOption('#embeddedPreset', 'esp32Wifi');
  await page.click('#applyPresetBtn');

  async function expectProfileFieldsToFit() {
    const overflowCount = await page.locator('#profileRowsContainer .profile-row .field-row').evaluateAll((fieldRows) => {
      return fieldRows.filter((fieldRow) => {
        const rowBox = fieldRow.getBoundingClientRect();
        return Array.from(fieldRow.children).some((child) => {
          const childBox = child.getBoundingClientRect();
          return childBox.left < rowBox.left - 0.5 || childBox.right > rowBox.right + 0.5;
        });
      }).length;
    });
    expect(overflowCount).toBe(0);

    const minInputWidth = await page.locator('#profileRowsContainer .profile-current-input, #profileRowsContainer .profile-duration-input').evaluateAll((inputs) => {
      return Math.min(...inputs.map((input) => input.getBoundingClientRect().width));
    });
    expect(minInputWidth).toBeGreaterThan(100);
  }

  await expectProfileFieldsToFit();

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.waitForTimeout(100);
  await expectProfileFieldsToFit();
});

test('battery capacity chemistry presets seed invalid and hidden cell-pack defaults', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.fill('#usableFraction', '');
  await page.selectOption('#chemistryPreset', 'lifepo4');

  await expect(page.locator('#usableFraction')).toHaveValue('92');
  await page.selectOption('#batteryModelMode', 'cellPack');
  await expect(page.locator('#cellNominalVoltage')).toHaveValue('3.2');
  await expect(page.locator('#derivedPackSummary')).toContainText('3.2 V nominal');
});

test('battery capacity preserves the kept-custom usable fraction hint after debounced refresh', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.fill('#usableFraction', '75');
  await page.selectOption('#chemistryPreset', 'lifepo4');

  await expect(page.locator('#usableFraction')).toHaveValue('75');
  await expect(page.locator('#chemistryNote')).toContainText('Kept your custom usable fraction of 75%');

  await page.waitForTimeout(250);
  await expect(page.locator('#chemistryNote')).toContainText('Kept your custom usable fraction of 75%');
});

test('battery capacity state profile peak uses the higher of explicit entry and max state', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.selectOption('#embeddedPreset', 'esp32Wifi');
  await page.click('#applyPresetBtn');

  await page.fill('#peakLoadCurrent', '100');
  await page.selectOption('#peakLoadCurrentUnit', 'mA');
  await page.fill('#regulatorCurrentLimit', '200');
  await page.selectOption('#regulatorCurrentLimitUnit', 'mA');
  await page.click('#calculateBtn');

  await expect(page.locator('#peakBatteryCurrentMeta')).toContainText('Entered peak load current 100 mA is below the highest state (240 mA)');
  await expect(page.locator('#feasibilityResult')).toHaveText('Limit exceeded');
});

test('battery capacity saved scenarios default to the newest sorted option', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    const formState = {
      modeSelect: 'constantCurrent',
      constantCurrent: '100',
      constantCurrentUnit: 'mA'
    };
    const snapshot = {
      mode: 'constantCurrent',
      runtimeHours: 1,
      avgBatteryCurrentA: 0.1,
      peakBatteryCurrentA: 0.1,
      label: 'Constant-current estimate'
    };
    window.localStorage.setItem('batteryCapacitySavedScenarios', JSON.stringify([
      {
        id: 'older-scenario',
        name: 'Older scenario',
        savedAt: '2026-04-28T12:00:00.000Z',
        formState,
        snapshot
      },
      {
        id: 'newer-scenario',
        name: 'Newer scenario',
        savedAt: '2026-04-29T12:00:00.000Z',
        formState,
        snapshot
      }
    ]));
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await expect(page.locator('#savedScenarioSelect option').first()).toContainText('Newer scenario');
  await expect(page.locator('#savedScenarioSelect')).toHaveValue('newer-scenario');
});

test('battery capacity saved scenario remains usable when local storage writes fail', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItemWithBatteryFailure(key, value) {
      if (key === 'batteryCapacitySavedScenarios') {
        throw new DOMException('simulated storage denial', 'SecurityError');
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await expectPageToLoadCleanly(page, baseURL, '/tools/battery-capacity.html');

  await page.fill('#scenarioName', 'Memory only test');
  await page.click('#saveScenarioBtn');

  await expect(page.locator('#scenarioStatus')).toHaveText('Could not save to local storage. The scenario is kept only in memory for this session.');
  await expect(page.locator('#savedScenarioSelect')).toContainText('Memory only test');
  await expect(page.locator('#loadScenarioBtn')).toBeEnabled();

  await page.fill('#constantCurrent', '250');
  await page.click('#resetBtn');
  await expect(page.locator('#savedScenarioSelect')).toContainText('Memory only test');
  await expect(page.locator('#loadScenarioBtn')).toBeEnabled();

  await page.fill('#constantCurrent', '250');
  await page.click('#loadScenarioBtn');

  await expect(page.locator('#constantCurrent')).toHaveValue('100');
  await expect(page.locator('#scenarioStatus')).toHaveText('Loaded "Memory only test".');

  await page.click('#deleteScenarioBtn');
  await expect(page.locator('#scenarioStatus')).toHaveText('Deleted "Memory only test" from this session. Local storage could not be updated.');
  await expect(page.locator('#savedScenarioSelect')).toHaveText('No saved scenarios');
  await expect(page.locator('#loadScenarioBtn')).toBeDisabled();
});
