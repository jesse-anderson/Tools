const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const dataRoot = path.join(repoRoot, 'data', 'hormone_research_reference');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(field);
      if (row.some((value) => value !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value !== '')) {
      rows.push(row);
    }
  }

  const [header, ...body] = rows;
  return body.map((values, index) => {
    if (values.length !== header.length) {
      throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${header.length}`);
    }
    return Object.fromEntries(header.map((name, colIndex) => [name, values[colIndex]]));
  });
}

function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(dataRoot, name), 'utf8'));
}

test('hormone reference data rows resolve sources and display gates', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(dataRoot, 'source_registry.json'), 'utf8'));
  const sourceIds = new Set(registry.map((source) => source.source_id));

  expect(sourceIds.size).toBe(registry.length);

  for (const source of registry) {
    expect(source.source_id, 'registry source_id').toBeTruthy();
    expect(source.source_locator, `registry ${source.source_id} source_locator`).toBeTruthy();
    expect(source.source_role, `registry ${source.source_id} source_role`).toBeTruthy();
    expect(source.use, `registry ${source.source_id} use`).toBeTruthy();
    expect(source.source_url, `registry ${source.source_id} source_url`).toBeTruthy();

    let parsed;
    expect(() => { parsed = new URL(source.source_url); }, `registry ${source.source_id} source_url is parseable`).not.toThrow();
    expect(['http:', 'https:']).toContain(parsed.protocol);
  }
  [
    'jcem_2017_travison_harmonized_testosterone',
    'cca_2019_verdonk_estradiol_lcms',
    'clinbiochem_2019_vanderveen_five_steroids',
    'jcem_2020_frederiksen_estrogen_lcms_supplement',
    'jcem_2018_bhasin_testosterone_guideline',
    'ejendo_2024_adriaansen_pediatric_11oxygenated_androgens',
    'jei_2026_pettersen_fit_futures_11oxygenated_androgens',
    'jcem_2026_walravens_measured_free_testosterone',
    'scandjclinlabinvest_2009_bjerner_male_shbg_norip',
    'jcem_2012_haring_female_testosterone_androstenedione_lcms',
    'annlabmed_2026_liu_guangxi_reproductive_women_adrenocortical_hormone_reference_intervals',
    'jmsacl_2021_holmes_pediatric_testosterone_shbg_free_testosterone_quantile_reference_intervals'
  ].forEach((sourceId) => expect(sourceIds.has(sourceId)).toBe(true));

  const csvFiles = [
    'production_rates_female_cycle.csv',
    'production_rates_male.csv',
    'serum_reference_review_only.csv',
    'serum_reference_phase_table.csv',
    'serum_cycle_profile.csv',
    'source_splits_and_pathway_notes.csv',
    'assay_notes.csv'
  ];

  for (const file of csvFiles) {
    for (const row of readCsv(file)) {
      if (row.source_id) {
        expect(sourceIds.has(row.source_id), `${file} source_id ${row.source_id}`).toBe(true);
      }

      if (row.display_allowed === 'true') {
        expect(row.source_id, `${file} display row source_id`).not.toBe('');
        expect(row.source_locator, `${file} display row source_locator`).not.toBe('');
        expect(row.source_role, `${file} display row source_role`).not.toBe('');
        expect(row.confidence, `${file} display row confidence`).not.toBe('');
        expect(row.caveat, `${file} display row caveat`).not.toBe('');
        if ('source_unit' in row) {
          expect(row.source_unit, `${file} display row source_unit`).not.toBe('');
        }
        if ('normalized_unit' in row) {
          expect(row.normalized_unit, `${file} display row normalized_unit`).not.toBe('');
        }
        if ('unit_kind' in row) {
          expect(row.unit_kind, `${file} display row unit_kind`).not.toBe('');
        }
      }
    }
  }

  const femaleProduction = readCsv('production_rates_female_cycle.csv');
  expect(femaleProduction).toHaveLength(21);
  expect(femaleProduction.filter((row) => row.analyte_id === 'dhea')).toHaveLength(3);
  expect(femaleProduction.filter((row) => row.cycle_context === 'all_cycle_phases')).toHaveLength(0);

  const phaseRows = readCsv('serum_reference_phase_table.csv');
  expect(phaseRows.length).toBeGreaterThanOrEqual(80);
  expect(phaseRows.some((row) => row.source_id === 'cca_2019_verdonk_estradiol_lcms' && row.display_allowed === 'true')).toBe(true);
  expect(phaseRows.some((row) => row.source_id === 'jcem_2017_travison_harmonized_testosterone' && row.display_allowed === 'true')).toBe(true);
  expect(phaseRows.some((row) => row.analyte_id === 'estrone' && row.source_id === 'jcem_2020_frederiksen_estrogen_lcms_supplement')).toBe(true);
  expect(phaseRows.some((row) => row.analyte_id === 'ketotestosterone_11' && row.source_id === 'ejendo_2024_adriaansen_pediatric_11oxygenated_androgens')).toBe(true);
  expect(phaseRows.some((row) => row.analyte_id === 'ketotestosterone_11' && row.source_id === 'jei_2026_pettersen_fit_futures_11oxygenated_androgens')).toBe(true);
  expect(phaseRows.some((row) => row.analyte_id === 'free_testosterone' && row.source_id === 'jcem_2026_walravens_measured_free_testosterone')).toBe(true);
  expect(phaseRows.some((row) => row.analyte_id === 'shbg' && row.source_id === 'scandjclinlabinvest_2009_bjerner_male_shbg_norip')).toBe(true);
  expect(phaseRows.some((row) => row.analyte_id === 'testosterone_total' && row.source_id === 'jcem_2012_haring_female_testosterone_androstenedione_lcms')).toBe(true);
  expect(phaseRows.filter((row) => row.source_id === 'annlabmed_2026_liu_guangxi_reproductive_women_adrenocortical_hormone_reference_intervals')).toHaveLength(24);
  expect(phaseRows.filter((row) => row.source_id === 'jmsacl_2021_holmes_pediatric_testosterone_shbg_free_testosterone_quantile_reference_intervals')).toHaveLength(160);
  expect(phaseRows.some((row) => row.analyte_id === 'cortisol' && row.value_low === '115.13' && row.value_high === '552.70')).toBe(true);
  expect(phaseRows.some((row) => row.analyte_id === 'calculated_free_testosterone' && row.sex_context === 'male' && row.age_context === 'pediatric_14_to_under_15' && row.value_median === '142.45')).toBe(true);

  const cycleRows = readCsv('serum_cycle_profile.csv');
  expect(cycleRows).toHaveLength(32);
  expect(new Set(cycleRows.map((row) => row.analyte_id)).size).toBe(8);
  expect(cycleRows.every((row) => row.source_id === 'jcem_2020_frederiksen_estrogen_lcms_supplement')).toBe(true);
  expect(cycleRows.find((row) => row.analyte_id === 'estrone' && row.phase_context === 'cycle_days_8_to_14').value_median).toBe('437');
  expect(cycleRows.find((row) => row.analyte_id === 'progesterone' && row.phase_context === 'cycle_days_15_plus_ovulation_confirmed').value_p025).toBe('10.8');

  for (const row of readCsv('reference_gap_status.csv')) {
    for (const field of ['accepted_display_source_ids', 'non_display_source_ids']) {
      const ids = row[field].split(';').map((sourceId) => sourceId.trim()).filter(Boolean);
      ids.forEach((sourceId) => expect(sourceIds.has(sourceId), `gap status source_id ${sourceId}`).toBe(true));
    }
    expect(row.current_status, `gap status ${row.analyte_id}`).not.toBe('');
    expect(row.next_action, `gap next_action ${row.analyte_id}`).not.toBe('');
  }
});

test('hormone research reference exposes disclaimer and reviewed source rows', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/hormone-research-reference.html');

  await expect(page.locator('h1')).toContainText('Hormone Research Reference');
  await expect(page.locator('#disclaimerSplash')).toBeVisible();
  await expect(page.locator('#disclaimerSplash')).toContainText('Research Reference Use Only');
  await expect(page.locator('#disclaimerSplash')).toContainText('will not use this page to identify, diagnose, rule out, prevent, monitor, manage, treat, or assess');
  await expect(page.locator('#disclaimerContinueBtn')).toBeDisabled();
  await page.locator('#disclaimerAcknowledge').check();
  await expect(page.locator('#disclaimerContinueBtn')).toBeEnabled();
  await page.locator('#disclaimerContinueBtn').click();
  await expect(page.locator('#disclaimerSplash')).toBeHidden();
  await expect(page.locator('.liability-banner')).toContainText('Experimental research reference only. Not medical advice.');
  await expect(page.locator('.liability-banner')).toContainText('ground truth');
  await expect(page.locator('body')).not.toContainText('Lab value');
  await expect(page.locator('body')).not.toContainText('Lab Context Input');
  await expect(page.locator('#referenceFilterForm input')).toHaveCount(0);
  await expect(page.locator('#sourceContext')).toBeEnabled();
  await expect(page.locator('#cyclePhase')).toBeEnabled();
  await expect(page.locator('#assayMethod')).toBeEnabled();
  await expect(page.locator('#referenceView')).toBeEnabled();
  await expect(page.locator('.scope-warning-block summary')).toContainText('Full Disclaimer / Use At Your Own Risk');
  await page.locator('.scope-warning-block summary').click();
  await expect(page.locator('.scope-warning-block')).toContainText('No warranty. No liability. No suitability claim. You assume all risk.');
  await expect(page.locator('.liability-banner')).toContainText('Source-Linked Rows');
  await expect(page.locator('#serumReferenceStatus')).toContainText('/ 294');
  await expect(page.locator('#phaseTableBody')).toContainText('Total testosterone');
  await expect(page.locator('#phaseTableBody')).toContainText('jcem_2017_travison_harmonized_testosterone');
  await expect(page.locator('#phaseTableBody a[href="https://doi.org/10.1210/jc.2016-2935"]').first()).toBeVisible();

  await page.selectOption('#analyteSelect', 'dhea');
  await expect(page.locator('#phaseTableBody')).toContainText('DHEA');
  await expect(page.locator('#phaseTableBody')).toContainText('clinchem_2010_kushnir_androstenedione_dhea_testosterone_lcms');
  await expect(page.locator('#phaseTableBody a[href="https://doi.org/10.1373/clinchem.2010.143222"]').first()).toBeVisible();

  await page.selectOption('#analyteSelect', 'cortisol');
  await expect(page.locator('#phaseTableBody')).toContainText('Cortisol');
  await expect(page.locator('#phaseTableBody')).toContainText('annlabmed_2026_liu_guangxi_reproductive_women_adrenocortical_hormone_reference_intervals');
  await expect(page.locator('#phaseTableBody a[href="https://doi.org/10.3343/alm.2025.0090"]').first()).toBeVisible();

  await page.selectOption('#analyteSelect', 'calculated_free_testosterone');
  await expect(page.locator('#phaseTableBody')).toContainText('Calculated free testosterone');
  await expect(page.locator('#phaseTableBody')).toContainText('jmsacl_2021_holmes_pediatric_testosterone_shbg_free_testosterone_quantile_reference_intervals');
  await expect(page.locator('#analyteWarningBlock')).toContainText('Free and bioavailable testosterone method context');
  await expect(page.locator('#analyteWarningBlock a[href="https://doi.org/10.1210/clinem/dgaf507"]').first()).toBeVisible();
  await expect(page.locator('#analyteWarningBlock a[href="https://doi.org/10.1210/jcem.84.10.6079"]').first()).toBeVisible();
  await expect(page.locator('#analyteWarningBlock a[href="https://www.ncbi.nlm.nih.gov/books/NBK279145/"]').first()).toBeVisible();
  await expect(page.locator('#phaseTableBody a[href="https://doi.org/10.1016/j.jmsacl.2021.10.005"]').first()).toBeVisible();

  await page.selectOption('#analyteSelect', 'estradiol_total');
  await page.selectOption('#referenceView', 'chart');
  await expect(page.locator('[data-view-panel="chart"]')).toBeVisible();
  await expect(page.locator('#cycleProfileChart')).toHaveAttribute('data-source-status', 'loaded');
  await expect(page.locator('#cycleProfileTableBody')).toContainText('156');
  await expect(page.locator('#cycleProfileTableBody')).toContainText('Source-reported cycle-day population percentiles');
  await expect(page.locator('#cycleProfileTableBody a[href="https://doi.org/10.6084/m9.figshare.10084145.v1"]').first()).toBeVisible();

  await page.selectOption('#analyteSelect', 'testosterone_total');
  await page.selectOption('#referenceView', 'production');
  await expect(page.locator('[data-view-panel="production"]')).toBeVisible();
  await expect(page.locator('#productionStatus')).toContainText('/ 26');
  await expect(page.locator('#productionTableBody')).toContainText('Total testosterone');
  await expect(page.locator('#productionTableBody')).toContainText('3 - 10 mg/day');
  await expect(page.locator('#productionTableBody')).toContainText('endotext_androgen_physiology');
  await expect(page.locator('#productionTableBody a[href="https://www.ncbi.nlm.nih.gov/books/NBK279000/"]').first()).toBeVisible();
  await page.selectOption('#analyteSelect', 'progesterone');
  await expect(page.locator('#productionTableBody')).toContainText('0.59 mg/day');
  await expect(page.locator('#productionTableBody')).toContainText('590 ug/day');
  await expect(page.locator('#productionTableBody')).toContainText('urinary pregnanediol-derived male production rates are invalid/discrepant');
  await expect(page.locator('#productionTableBody a[href="https://doi.org/10.1172/JCI105405"]').first()).toBeVisible();
  await expect(page.locator('#sourceAuditBody')).toContainText('Published papers, method documents, lab reports, and qualified clinical care override this page.');
  await expect(page.locator('#sourceAuditBody a[href="https://doi.org/10.6084/m9.figshare.10084145.v1"]').first()).toBeVisible();
  await expect(page.locator('#sourceAuditBody a[href="https://doi.org/10.1172/JCI105405"]').first()).toBeVisible();
});
