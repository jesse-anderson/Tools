const { chromium } = require('@playwright/test');
const { startServer } = require('./server.cjs');
const fs = require('fs');
const path = require('path');

// Manual Steam Tables chart diagnostic. This is intentionally not part of the
// GitHub smoke suite; run it only when investigating chart rendering locally.
if (process.env.STEAM_CHART_DEBUG !== '1') {
  console.log('Skipped manual Steam Tables chart diagnostic.');
  console.log('Run with STEAM_CHART_DEBUG=1 node tests/smoke/_check-steam.cjs');
  process.exit(0);
}

(async () => {
  const server = await startServer({ port: 4173, reuseExisting: true });
  const baseURL = `http://${server.host}:${server.port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  const outputDir = path.join(__dirname, 'test-results', 'steam-chart-debug');
  fs.mkdirSync(outputDir, { recursive: true });

  page.on('pageerror', (err) => errors.push(`pageerror: ${err.stack || err.message}`));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(`console.error: ${msg.text()}`));

  try {
    await page.goto(`${baseURL}/tools/steam-tables.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#chartPanel svg.steam-chart', { timeout: 10000 });
    await page.waitForTimeout(500);

    const blocks = await page.$$('.chart-block');
    for (let i = 0; i < blocks.length; i++) {
      await blocks[i].scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const headerText = await blocks[i].$eval('.chart-header strong', (el) => el.textContent.trim());
      const safe = headerText.replace(/[^a-z0-9]+/gi, '_');
      await blocks[i].screenshot({ path: path.join(outputDir, `_shot_${i}_${safe}.png`) });
    }
    // Also capture the chart-stack footnote.
    const footnote = await page.$('.chart-stack-footnote');
    if (footnote) {
      await footnote.scrollIntoViewIfNeeded();
      await footnote.screenshot({ path: path.join(outputDir, '_shot_footnote.png') });
    }
    console.log(`shots saved to ${outputDir}`);
  } catch (err) {
    errors.push(`assertion: ${err.message}`);
  }

  await browser.close();
  await server.close();
  if (errors.length) { console.error('FAIL\n' + errors.join('\n')); process.exit(1); }
  process.exit(0);
})();
