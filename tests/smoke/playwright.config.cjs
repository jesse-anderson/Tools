const { defineConfig } = require('@playwright/test');

const PORT = Number(process.env.PORT || 4173);

module.exports = defineConfig({
  testDir: '.',
  // `meeting-planner-smoke.spec.cjs` is intentionally excluded: it requires
  // the dev-mode flips described at the top of that file (local wrangler dev,
  // local-worker URL in config.js, CSP relaxed). Add it back to this array
  // before running it.
  testMatch: [
    'tools-hub.spec.cjs',
    'tool-pages-load.spec.cjs',
    'creatine-lab.spec.cjs',
    'stoichiometry-calculator.spec.cjs',
    'graph-paper-generator.spec.cjs',
    'battery-capacity.spec.cjs',
    'visual-integration.spec.cjs',
    'workweek-planner.spec.cjs',
    'excel-formula-extractor.spec.cjs',
    'hormone-data.spec.cjs',
    'uncertainty-engine.spec.cjs',
    'psychrometric.spec.cjs',
    'steam-tables.spec.cjs',
    'parquet-viewer.spec.cjs',
    'species-doubling.spec.cjs',
    'excel-engine.spec.cjs',
    'moody-chart.spec.cjs',
    'csv-profiler.spec.cjs',
    'encoding.spec.cjs',
    'scientific-graph-digitizer.spec.cjs',
    'markdown-exporter.spec.cjs',
    'lamport-timestamps.spec.cjs',
    'pdf-diff.spec.cjs',
    'ai-image-detector.spec.cjs',
    'toxicology-body-burden.spec.cjs',
    'oral-multidose.spec.cjs',
    'simple-unit-converter.spec.cjs',
    'ohms-law.spec.cjs'
  ],
  timeout: 60_000,
  // The specs are independent (each navigates its own page or drives a pure
  // window.* engine), so run every test in parallel across workers. The static
  // file server is owned once by `webServer` below instead of per-spec, so
  // workers share it and no longer collide on the fixed port.
  //
  // Default to 8 workers locally (the full suite runs in ~75s here) and one
  // worker per core on CI to avoid oversubscribing the runner on the heavier
  // WASM/DOCX specs. Override anywhere with PW_WORKERS.
  fullyParallel: true,
  workers: process.env.PW_WORKERS
    ? Number(process.env.PW_WORKERS)
    : (process.env.CI ? 4 : 8),
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  // One static server for the whole run. Locally it reuses an already-running
  // server on the port; in CI it always starts a fresh one and tears it down.
  webServer: {
    command: 'node server.cjs',
    url: `http://127.0.0.1:${PORT}/tools.html`,
    cwd: __dirname,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  }
});
