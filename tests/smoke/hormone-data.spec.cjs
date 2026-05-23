const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

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
