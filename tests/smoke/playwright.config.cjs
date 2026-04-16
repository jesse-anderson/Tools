const { defineConfig } = require('@playwright/test');

const PORT = Number(process.env.PORT || 4173);

module.exports = defineConfig({
  testDir: '.',
  testMatch: ['tools-smoke.spec.cjs'],
  timeout: 30_000,
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
  },
  webServer: {
    command: 'node server.cjs',
    url: `http://127.0.0.1:${PORT}/tools.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
