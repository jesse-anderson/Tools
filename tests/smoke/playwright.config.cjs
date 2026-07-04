const { defineConfig } = require('@playwright/test');

const PORT = Number(process.env.PORT || 4173);

module.exports = defineConfig({
  testDir: '.',
  // `meeting-planner-smoke.spec.cjs` is intentionally excluded: it requires
  // the dev-mode flips described at the top of that file (local wrangler dev,
  // local-worker URL in config.js, CSP relaxed). Add it back to this array
  // before running it.
  testMatch: [
    'tools-smoke.spec.cjs',
    'hormone-data.spec.cjs',
    'uncertainty-engine.spec.cjs',
    'psychrometric.spec.cjs',
    'steam-tables.spec.cjs',
    'parquet-viewer.spec.cjs',
    'species-doubling.spec.cjs',
    'excel-engine.spec.cjs',
    'moody-chart.spec.cjs',
    'csv-profiler.spec.cjs',
    'scientific-graph-digitizer.spec.cjs',
    'markdown-exporter.spec.cjs',
    'lamport-timestamps.spec.cjs'
  ],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  }
});
