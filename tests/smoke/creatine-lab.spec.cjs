// Creatine Lab DOM/e2e coverage: solubility presets, storage-loss anchors,
// accumulation and Monte Carlo charts, settings persistence, the math modal,
// and the mass-balance / creatinine plots.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly, readDownloadText } = require('./helpers.cjs');

test('creatine lab default bottle and small-glass presets compute solubility', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await expect(page.locator('h1')).toContainText('Creatine Lab');
  await expect(page.locator('#storageMode')).toHaveValue('premixed');
  await expect(page.locator('.scope-warning-block summary')).toContainText('Model Scope / Use At Your Own Risk');
  await expect(page.locator('.scope-warning-block')).not.toHaveAttribute('open', '');
  await page.locator('.scope-warning-block summary').click();
  await expect(page.locator('.scope-warning-block')).toContainText('No warranty. No liability. No suitability claim. You assume all risk.');
  await expect(page.locator('.tutorial-card summary')).toContainText('How To Use This Tool');
  await expect(page.locator('.tutorial-card')).not.toHaveAttribute('open', '');
  await page.locator('.tutorial-card summary').click();
  await expect(page.locator('.tutorial-card')).toHaveAttribute('open', '');
  await expect(page.locator('.tutorial-card')).toContainText('Start with the question');
  await expect(page.locator('.tutorial-card')).toContainText('Use this tool for three separate questions');
  await expect(page.locator('.tutorial-card')).toContainText('degradation rate affects dissolved creatine');
  await expect(page.locator('.tutorial-card')).toContainText('Default bottle is useful');
  await expect(page.locator('.tutorial-card')).toContainText('Suspended powder is not automatically wasted');
  await expect(page.locator('.tutorial-card')).toContainText('Only the premixed solution/suspension mode runs the aqueous degradation-rate calculation');
  await expect(page.locator('.tutorial-card')).toContainText('first estimates the dissolved amount at storage temperature');
  await expect(page.locator('.tutorial-card')).toContainText('recommend a dose');
  const missingInputHelp = await page.locator('.control-panel :is(.input-line, .check-line)').evaluateAll((rows) => rows
    .filter((row) => row.querySelector('input, select') && !row.querySelector('.help-chip'))
    .map((row) => (row.querySelector('span')?.textContent || row.textContent || '').trim()));
  expect(missingInputHelp).toEqual([]);
  const missingResultHelp = await page.locator('.result-grid .result-card').evaluateAll((cards) => cards
    .filter((card) => !card.querySelector('.result-label .help-chip'))
    .map((card) => (card.querySelector('.result-label')?.textContent || '').trim()));
  expect(missingResultHelp).toEqual([]);
  await expect(page.locator('.result-grid .help-chip')).toHaveCount(20);
  await expect(page.locator('#doseG + .unit-suffix')).toHaveText('g');
  await page.locator('[aria-describedby="help-doseG"]').hover();
  await expect(page.locator('#help-doseG')).toBeVisible();
  await expect(page.locator('#help-doseG')).toContainText('Grams of creatine monohydrate');
  await page.locator('#doseG').hover();
  await expect(page.locator('[aria-describedby="help-doseG"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#help-doseG')).toBeHidden();
  await page.locator('[aria-describedby="help-storageLossPercentValue"]').click();
  await expect(page.locator('[aria-describedby="help-storageLossPercentValue"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#help-storageLossPercentValue')).toContainText('dissolved fraction');
  await page.locator('#doseG').fill('5');
  await expect(page.locator('[aria-describedby="help-storageLossPercentValue"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#help-storageLossPercentValue')).toBeHidden();
  await expect(page.locator('#help-doseG')).toBeHidden();
  await page.locator('.advanced-panel summary').click();
  await expect(page.locator('#muscleCreatineGPerKg + .unit-suffix')).toHaveText('g/kg');
  await expect(page.locator('#endogenousGPerDay + .unit-suffix')).toHaveText('g/day');
  await page.locator('[aria-describedby="help-endogenousGPerDay"]').hover();
  await expect(page.locator('#help-endogenousGPerDay')).toBeVisible();
  await page.locator('#endogenousGPerDay').hover();
  await expect(page.locator('[aria-describedby="help-endogenousGPerDay"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#help-endogenousGPerDay')).toBeHidden();
  await expect(page.locator('#mixDissolvedValue')).toContainText('5.00 g');
  await expect(page.locator('#mixUndissolvedValue')).toContainText('0.00 g');

  await page.locator('[data-preset="smallGlass"]').click();
  await expect(page.locator('#storageMode')).toHaveValue('premixed');
  await expect(page.locator('#mixDissolvedValue')).toContainText('3.50 g');
  await expect(page.locator('#mixUndissolvedValue')).toContainText('1.50 g');
});

test('creatine lab reports acidic premixed storage loss anchor', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="store"]').click();
  await page.selectOption('#storageMode', 'premixed');
  await page.fill('#storageTimeValue', '3');
  await page.selectOption('#storageTimeUnit', 'days');
  await page.fill('#storageTemperatureValue', '25');
  await page.selectOption('#phPreset', 'acidic');

  await expect(page.locator('#storageLossPercentValue')).toContainText('12.0%');
  await expect(page.locator('#storageLossPercentMeta')).toContainText('anchored');
  await page.click('#expandStorageChartBtn');
  await expect(page.locator('#chartOverlay')).toBeVisible();
  await expect(page.locator('#chartOverlayTitle')).toContainText('Dissolved Loss Over Storage');
  await expect(page.locator('#chartOverlaySummary')).toContainText('Dissolved loss reaches 12.0%');
  await expect(page.locator('#chartOverlayBody .chart-loss-line')).toHaveCount(1);
  await expect(page.locator('#chartOverlayBody .chart-hover')).toHaveCount(0);
  await page.click('#chartOverlayClose');
  await expect(page.locator('#chartOverlay')).toBeHidden();

  const storageDownloadPromise = page.waitForEvent('download');
  await page.click('#exportStoragePlotBtn');
  const storageDownload = await storageDownloadPromise;
  const storageSvg = await readDownloadText(storageDownload);
  expect(storageDownload.suggestedFilename()).toBe('creatine-lab-dissolved-loss-over-storage.svg');
  expect(storageSvg).toContain('<svg');
  expect(storageSvg).toContain('width="3200"');
  expect(storageSvg).toContain('height="1244"');
  expect(storageSvg).toContain('chart-loss-line');
  expect(storageSvg).toContain('Creatine Lab dissolved loss over storage plot');
});

test('creatine lab renders loading accumulation and Monte Carlo envelope', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await page.selectOption('#protocolPreset', 'load20');
  await page.fill('#simulationDays', '60');

  await expect(page.locator('#bodySaturationValue')).not.toContainText('0.0%');
  await expect(page.locator('#bodySaturationMeta')).toContainText('turnover 2.07 g/day baseline, 2.51 g/day current');
  await expect(page.locator('#bodySaturationMeta')).toContainText('background total 2.07 g/day');
  await expect(page.locator('#wastePressureValue')).toContainText('g/day');
  await expect(page.locator('#wastePressureMeta')).toContainText('10-90% range');
  await expect(page.locator('#monteCarloBandMeta')).toContainText('10-90%');
  await expect(page.locator('#steadyDoseValue')).toContainText('g/day');
  await expect(page.locator('#steadyDoseMeta')).toContainText('extra supplement to hold');
  await expect(page.locator('#creatinineOutputValue')).toContainText('g/day');
  await expect(page.locator('#equilibriumPoolValue')).toContainText('g');
  await expect(page.locator('#retentionEfficiencyValue')).toContainText('%');
  await expect(page.locator('#massBalanceMeta')).toContainText('background in');
  await expect(page.locator('#thresholdBody')).toContainText('90%');
  await expect(page.locator('#storageLossChart .chart-loss-line')).toHaveCount(1);
  await expect(page.locator('#accumulationChart .chart-line')).toHaveCount(1);
  await expect(page.locator('#accumulationChart .chart-steady-line')).toHaveCount(1);
  await expect(page.locator('#accumulationChart .chart-waste-line')).toHaveCount(1);
  // chart-waste-zone is the conditional red overlay above 100% saturation. The
  // calibrated default load20 + 5 g/d scenario peaks at ~96.5% (Hultman-anchored
  // Hill = 2 fit), so the zone correctly does not render here. The dose bump
  // below pushes the scenario past 100% to verify the zone code path.
  await expect(page.locator('#accumulationChart .chart-waste-zone')).toHaveCount(0);
  await expect(page.locator('#creatinineChart .chart-creatinine-line')).toHaveCount(1);
  await expect(page.locator('#fateChart .chart-retained-area')).toHaveCount(1);
  await expect(page.locator('#cumulativeChart .chart-cumulative-dose-line')).toHaveCount(1);
  await expect(page.locator('#chartSummary')).toContainText('Left axis shows saturation and dose pressure');
  await expect(page.locator('#accumulationChart')).toContainText('Left axis: saturation / dose pressure (%)');
  await expect(page.locator('#accumulationChart')).toContainText('Right axis: g/day');
  await expect(page.locator('#accumulationChart')).toContainText('waste pressure');
  await page.locator('#accumulationChart').hover({ position: { x: 360, y: 140 } });
  await expect(page.locator('#accumulationChart .chart-hover')).toHaveCSS('display', 'block');
  await expect(page.locator('#chartOverlay')).toBeHidden();
  await page.click('#expandChartBtn');
  await expect(page.locator('#chartOverlay')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/chart-overlay-open/);
  await expect(page.locator('#chartOverlayTitle')).toContainText('Estimated Saturation And Dose Pressure');
  await expect(page.locator('#chartOverlaySummary')).toContainText('Left axis shows saturation and dose pressure');
  await expect(page.locator('#chartOverlayBody .chart-line')).toHaveCount(1);
  await expect(page.locator('#chartOverlayBody .chart-steady-line')).toHaveCount(1);
  await expect(page.locator('#chartOverlayBody .chart-waste-line')).toHaveCount(1);
  await expect(page.locator('#chartOverlayBody .chart-hover')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#chartOverlay')).toBeHidden();

  await page.locator('[data-theme-toggle="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const plotDownloadPromise = page.waitForEvent('download');
  await page.click('#exportPlotBtn');
  const plotDownload = await plotDownloadPromise;
  const plotSvg = await readDownloadText(plotDownload);
  expect(plotDownload.suggestedFilename()).toBe('creatine-lab-saturation-dose-pressure.svg');
  expect(plotSvg).toContain('<svg');
  expect(plotSvg).toContain('width="3200"');
  expect(plotSvg).toContain('height="1244"');
  expect(plotSvg).toContain('--creatine-soft: #eef5ef;');
  expect(plotSvg).toContain('--creatine-text: #1f2937;');
  expect(plotSvg).toContain('chart-waste-line');
  expect(plotSvg).toContain('Left axis: saturation / dose pressure (%)');
  expect(plotSvg).toContain('Right axis: g/day');

  // Verify the conditional chart-waste-zone renders when saturation pressure
  // actually exceeds 100%. Bumping maintenance dose to 20 g/d after a load20
  // phase pushes the pool past the cap and triggers the red overlay.
  await page.fill('#maintenanceDoseG', '20');
  await expect(page.locator('#accumulationChart .chart-waste-zone')).toHaveCount(1);
});

test('creatine lab no-supplement baseline does not self-load', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await page.selectOption('#bodyPoolBasis', 'manual');
  await page.fill('#baselinePoolG', '100');
  await page.selectOption('#protocolPreset', 'maintenance5');
  await page.fill('#maintenanceDoseG', '0');
  await page.fill('#simulationDays', '60');

  await expect(page.locator('#bodyFinalPoolValue')).toContainText('100 g');
  await expect(page.locator('#bodySaturationValue')).toContainText('75.0%');
  await expect(page.locator('#bodySaturationMeta')).toContainText('supplement gap filled 0.0%');
  await expect(page.locator('#bodySaturationMeta')).toContainText('turnover 1.70 g/day baseline, 1.70 g/day current');
  await expect(page.locator('#wastePressureValue')).toContainText('0.00 g/day');
  await expect(page.locator('#steadyDoseValue')).toContainText('0.00 to 0.00 g/day');
  await expect(page.locator('#warningList')).toContainText('supplementation flows on top of that background');
  await expect(page.locator('#equilibriumPoolValue')).toContainText('100 g');
  await expect(page.locator('#creatinineOutputValue')).toContainText('1.47 g/day');
});

test('creatine lab models body composition and brain compartment', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await expect(page.locator('#bodyCompositionValue')).toContainText('25.2 kg');
  await expect(page.locator('#bodyPoolBasisValue')).toContainText('122 g');
  await expect(page.locator('#brainPoolValue')).toContainText('1.27 g');
  await expect(page.locator('#brainResponseMeta')).toContainText('20 g/day for 4 weeks whole-brain band: 3.5% to 13.3%');
  await expect(page.locator('#brainResponseMeta')).toContainText('14.6% thalamus regional peak shown separately');
  await expect(page.locator('#brainResponseMeta')).toContainText('does not change when protocol changes');

  await page.fill('#bodyMassKg', '100');
  await page.fill('#bodyFatPercent', '10');
  await expect(page.locator('#bodyCompositionValue')).toContainText('40.5 kg');

  await page.selectOption('#bodyPoolBasis', 'manual');
  await expect(page.locator('#manualBaselineLine')).toBeVisible();
  await expect(page.locator('#bodyPoolBasisValue')).toContainText('120 g');
});

test('creatine lab exposes claim-to-source audit trail', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await expect(page.locator('#sourceAuditBody')).toContainText('5 g in 1 L at 20 deg C is fully dissolved at equilibrium');
  await expect(page.locator('#sourceAuditBody')).toContainText('Jager et al. 2011');
  await expect(page.locator('#sourceAuditBody')).toContainText('fitted browser model');
  await expect(page.locator('#sourceAuditBody')).toContainText('Harris et al. 2002');
  await expect(page.locator('#sourceAuditBody')).toContainText('Sagayama et al. 2023');
  await expect(page.locator('#sourceAuditBody')).toContainText('Brain tCr output is separate');
  await expect(page.locator('#sourceAuditBody')).toContainText('does not change when the selected protocol changes');
  await expect(page.locator('#sourceAuditBody')).toContainText('mass-balance ODE');
  await expect(page.locator('#sourceAuditBody')).toContainText('xorshift32');
  await expect(page.locator('#sourceAuditBody')).toContainText('Walker 1979');
  await expect(page.locator('#sourceAuditBody')).toContainText('Burke et al. 2003');
  await expect(page.locator('#sourceAuditBody')).toContainText('Dechent et al. 1999');

  const sanityPanel = page.locator('details.foldable-card').filter({ hasText: 'Model Sanity Checks' });
  const auditPanel = page.locator('details.foldable-card').filter({ hasText: 'Claim Audit Trail' });
  await expect(sanityPanel).not.toHaveAttribute('open', '');
  await expect(auditPanel).not.toHaveAttribute('open', '');
  await sanityPanel.locator('summary').click();
  await auditPanel.locator('summary').click();
  await expect(sanityPanel).toHaveAttribute('open', '');
  await expect(auditPanel).toHaveAttribute('open', '');
});

test('creatine lab ships no failing model sanity checks', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  // Rows render at init even though the panel starts collapsed, so we can count
  // statuses without expanding it. Guards against literature-anchor drift between
  // the model and its own validation thresholds shipping a red check to users.
  const statuses = page.locator('#validationBody .check-status');
  const total = await statuses.count();
  expect(total).toBeGreaterThanOrEqual(22);
  await expect(page.locator('#validationBody .check-status.fail')).toHaveCount(0);
  await expect(page.locator('#validationBody .check-status.pass')).toHaveCount(total);
});

test('creatine lab vegetarian no-supplement drift surfaces equilibrium', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await page.selectOption('#bodyPoolBasis', 'manual');
  await page.fill('#baselinePoolG', '120');
  await page.selectOption('#protocolPreset', 'maintenance5');
  await page.fill('#maintenanceDoseG', '0');
  await page.fill('#simulationDays', '90');
  await page.selectOption('#dietaryPattern', 'vegetarian');
  await page.uncheck('#calibrateBackground');

  // Vegetarian diet without calibration: equilibrium = (0 + ~1.4) / 0.017 ≈ 82 g.
  await expect(page.locator('#equilibriumPoolValue')).toContainText('82', { timeout: 5000 });
  await expect(page.locator('#equilibriumPoolMeta')).toContainText('Attractor for no-supplement pool');
  const equilibriumText = await page.locator('#equilibriumPoolValue').textContent();
  const equilibriumG = parseFloat((equilibriumText || '').replace(/[^0-9.]/g, ''));
  expect(equilibriumG).toBeGreaterThan(60);
  expect(equilibriumG).toBeLessThan(110);
  // After 90 days the pool should have dropped well below the entered baseline.
  const finalText = await page.locator('#bodyFinalPoolValue').textContent();
  const finalG = parseFloat((finalText || '').replace(/[^0-9.]/g, ''));
  expect(finalG).toBeLessThan(115);
  // Mass-balance residual stays tight.
  await expect(page.locator('#massBalanceMeta')).toContainText('background in');
});

test('creatine lab saves and restores settings via JSON and localStorage', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await page.fill('#bodyMassKg', '83');
  await page.selectOption('#dietaryPattern', 'vegetarian');
  await page.uncheck('#calibrateBackground');

  // Settings exporter downloads JSON.
  const downloadPromise = page.waitForEvent('download');
  await page.click('#saveSettingsBtn');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^creatine-lab-settings-[0-9T:.\-]+\.json$/);
  const settingsText = await readDownloadText(download);
  const payload = JSON.parse(settingsText);
  expect(payload.tool).toBe('creatine-lab');
  expect(payload.schemaVersion).toBe(1);
  expect(payload.inputs.bodyMassKg).toBe('83');
  expect(payload.inputs.dietaryPattern).toBe('vegetarian');
  expect(payload.inputs.calibrateBackground).toBe(false);

  // localStorage auto-persistence: reload and confirm fields restore.
  await page.reload();
  await page.locator('[data-tab-target="accumulate"]').click();
  await expect(page.locator('#bodyMassKg')).toHaveValue('83');
  await expect(page.locator('#dietaryPattern')).toHaveValue('vegetarian');
  await expect(page.locator('#calibrateBackground')).not.toBeChecked();
  await expect(page.locator('#settingsStatus')).toContainText('Restored your saved settings');

  // Reset clears persistence.
  await page.click('#resetBtn');
  await expect(page.locator('#bodyMassKg')).toHaveValue('70');
  await expect(page.locator('#dietaryPattern')).toHaveValue('omnivore');
  await expect(page.locator('#calibrateBackground')).toBeChecked();
  await page.reload();
  await expect(page.locator('#bodyMassKg')).toHaveValue('70');
});

test('creatine lab math modal exercises every equation against its anchor', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await expect(page.locator('#mathModal')).toBeHidden();

  await page.click('#showMathBtn');
  await expect(page.locator('#mathModal')).toBeVisible();
  await expect(page.locator('#mathModalTitle')).toContainText('How The Math Works');
  await expect(page.locator('body')).toHaveClass(/chart-overlay-open/);

  const cardCount = await page.locator('#mathModalBody .math-card').count();
  expect(cardCount).toBeGreaterThanOrEqual(8);
  await expect(page.locator('#mathModalBody')).toContainText('Source:');
  await expect(page.locator('#mathModalBody')).toContainText('Implementation:');
  await expect(page.locator('#mathModalBody')).toContainText('Hultman');
  await expect(page.locator('#mathModalBody')).toContainText('Walker 1979');

  await page.click('button[data-math-run="active-creatine-fraction"]');
  const singleResult = page.locator('[data-math-result="active-creatine-fraction"]');
  await expect(singleResult).toHaveClass(/visible/);
  await expect(singleResult).toContainText('PASS');

  await page.click('#mathModalRunAll');
  await expect(page.locator('#mathModalStatus')).toContainText('equation tests passed');
  await expect(page.locator('#mathModalStatus')).toHaveClass(/success/);
  const passCount = await page.locator('#mathModalBody .math-card-result.pass').count();
  expect(passCount).toBe(cardCount);
  await expect(page.locator('#mathModalBody .math-card-result.fail')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.locator('#mathModal')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/chart-overlay-open/);
});

test('creatine lab renders new mass-balance and creatinine charts', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/creatine-lab.html');

  await page.locator('[data-tab-target="accumulate"]').click();
  await page.selectOption('#protocolPreset', 'load20');
  await page.fill('#simulationDays', '45');

  await expect(page.locator('#creatinineChart .chart-creatinine-line')).toHaveCount(1);
  await expect(page.locator('#creatinineChart .chart-creatinine-band')).toHaveCount(1);
  await expect(page.locator('#creatinineChart')).toContainText('creatinine production');
  await expect(page.locator('#fateChart .chart-retained-area')).toHaveCount(1);
  await expect(page.locator('#fateChart .chart-excreted-area')).toHaveCount(1);
  await expect(page.locator('#fateChart')).toContainText('excreted unchanged in urine');
  await expect(page.locator('#cumulativeChart .chart-cumulative-dose-line')).toHaveCount(1);
  await expect(page.locator('#cumulativeChart .chart-cumulative-retained-line')).toHaveCount(1);
  await expect(page.locator('#cumulativeChart .chart-efficiency-line')).toHaveCount(1);

  const creatinineDownloadPromise = page.waitForEvent('download');
  await page.click('#exportCreatininePlotBtn');
  const creatinineDownload = await creatinineDownloadPromise;
  expect(creatinineDownload.suggestedFilename()).toBe('creatine-lab-creatinine-production.svg');

  const fateDownloadPromise = page.waitForEvent('download');
  await page.click('#exportFatePlotBtn');
  const fateDownload = await fateDownloadPromise;
  expect(fateDownload.suggestedFilename()).toBe('creatine-lab-fate-of-dose.svg');

  const cumulativeDownloadPromise = page.waitForEvent('download');
  await page.click('#exportCumulativePlotBtn');
  const cumulativeDownload = await cumulativeDownloadPromise;
  expect(cumulativeDownload.suggestedFilename()).toBe('creatine-lab-cumulative-dose-vs-retained.svg');
});
