// Repo-wide WCAG AA guard for scope-disclaimer headings, measured in both themes.
// 19 heading/theme pairs across 17 tools failed AA in September 2026, almost all
// from an accent painted on a light card with no light-theme override. One test
// per tool so the page loads fan out across workers.
const { test, expect } = require('@playwright/test');
const { measureContrast } = require('./helpers.cjs');

// Heading and body styles inside a disclaimer that carry a non-default colour.
// --text-primary and --text-secondary elements are included deliberately:
// linear-thermal-expansion's .disclaimer-note was on --text-muted and failed
// in BOTH themes, which a heading-only selector list would have missed.
const DISCLAIMER_TEXT = [
  '.disclaimer-title',
  '.warning-title',
  '.disclaimer-header',
  '.disclaimer-lead',
  '.disclaimer-note',
  '.disclaimer-card > summary',
  '.scope-warning-block > summary',
  '.disclaimer-box strong',
  '.liability-disclaimer > strong',
  '.privacy-notice strong',
  '.calc-warning strong',
  // Added September 2026 with the P3 band, whose tools carry this and nothing
  // else. It measures on the other 40 tools too, which is free coverage of the
  // second touchpoint beside the results.
  'p.disclaimer',
  'p.disclaimer a',
].join(',');

// Tools known to carry a disclaimer heading. A tool that loses its disclaimer
// fails here rather than silently dropping out of coverage, which is why this
// is an explicit list and not a discovery pass.
const TOOLS_WITH_DISCLAIMER_HEADINGS = [
  'ai-image-detector',
  'base-converter',
  'battery-capacity',
  'beam-deflection',
  'color-picker',
  'control-valve-sizing',
  'creatine-lab',
  'dbscan-visualizer',
  'duckdb-playground',
  'esp32-pinout',
  'crypto-lab',
  'csv-profiler',
  'excel-formula-extractor',
  'face-blur',
  'hed-calculator',
  'hormone-research-reference',
  'json-formatter',
  'linear-regression',
  'linear-thermal-expansion',
  'local-llm-opex',
  'markdown-exporter',
  'meeting-planner',
  'moody-chart',
  'ohms-law',
  'parquet-viewer',
  'pdf-diff',
  'oral-multidose',
  'pid-playground',
  'psychrometric-calculator',
  'regex-tester',
  'rpi-pinout',
  'scientific-graph-digitizer',
  'screenshot-tool',
  'seed-storage-lab',
  'sensors',
  'species-doubling-reference',
  'sqlite-viewer',
  'steam-tables',
  'stoichiometry-calculator',
  'timestamp-converter',
  'uncertainty-propagation',
  'unit-converter',
  'visual-integration',
  'yogurt-cfu-estimator',
  'toxicology-and-body-burden',
  // The P3 band. These carry p.disclaimer and no card, so they were outside
  // this guard entirely until phase 5.
  'case-conversion',
  'encoding',
  'graph-paper-generator',
  'lamport-timestamps',
  'markdown-preview',
  'productivity-timer',
  'token-throughput-visualizer',
  'word-count',
  'workweek-planner',
];

for (const slug of TOOLS_WITH_DISCLAIMER_HEADINGS) {
  test(`${slug} disclaimer text clears WCAG AA in both themes`, async ({ page }) => {
    await page.goto(`/tools/${slug}.html`, { waitUntil: 'domcontentloaded' });

    const seen = [];
    for (const theme of ['dark', 'light']) {
      const measured = await measureContrast(page, DISCLAIMER_TEXT, theme);
      expect(
        measured.length,
        `${slug}: no disclaimer text matched in ${theme} theme. If the disclaimer ` +
          'was removed or renamed, update TOOLS_WITH_DISCLAIMER_HEADINGS.'
      ).toBeGreaterThan(0);

      for (const m of measured) {
        seen.push(`${theme} ${m.ratio}:1`);
        expect(
          m.pass,
          `${slug} ${theme} theme: "${m.text}" (${m.cls}) measures ${m.ratio}:1, ` +
            `needs ${m.need}:1 at ${m.px}px/${m.weight}`
        ).toBe(true);
      }
    }

    // Both themes were actually exercised, not just whichever one loaded.
    expect(seen.some((s) => s.startsWith('dark'))).toBe(true);
    expect(seen.some((s) => s.startsWith('light'))).toBe(true);
  });
}
