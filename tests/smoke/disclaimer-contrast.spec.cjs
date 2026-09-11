// Repo-wide WCAG AA guard for scope-disclaimer headings.
//
// Every tool listed here carries a disclaimer heading in an accent colour on a
// tinted card. In September 2026, 19 of those heading/theme pairs across 17
// tools failed AA, almost all of them in light theme and almost all from the
// same cause: --accent-warning or a hardcoded #ef4444 painted on a light card,
// with no light-theme override. The most important sentence on each page was
// its least readable text.
//
// The fix lives mostly in css/shared.css (--disclaimer-accent, plus
// [data-theme="light"] corrections that outrank a tool's own plain class rule
// on specificity), with per-tool overrides where a tool themes its own brand
// hue. This spec is what stops it coming back.
//
// One test per tool so the ~21 page loads fan out across workers, following
// tool-pages-load.spec.cjs.
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
