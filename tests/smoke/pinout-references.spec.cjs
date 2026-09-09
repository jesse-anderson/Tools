// The two GPIO pinout references, esp32-pinout and rpi-pinout.
//
// One spec for both because they are the same tool with different data: same
// layout, same sidebar, same board grid, and until September 2026 the same
// 53-word dashed grey disclaimer box at the bottom of the sidebar. Neither had
// a spec of any kind. The shared parts are parameterised and the board-specific
// warnings are asserted per tool, since those are the whole point of the
// rebuild: a pin map that does not mention 5 V tolerance or strapping pins is
// the kind of reference that costs someone a board.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const TOOLS = [
  { slug: 'esp32-pinout', name: 'ESP32' },
  { slug: 'rpi-pinout', name: 'Raspberry Pi' },
];

for (const { slug, name } of TOOLS) {
  const PAGE = `/tools/${slug}.html`;

  test(`${name} pinout page loads cleanly and lists boards`, async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, PAGE);
    await expect(page.locator('#pinoutsGrid')).toBeVisible();
    // The grid is populated by script; an empty reference is a broken one.
    await expect.poll(() => page.locator('#pinoutsGrid').evaluate((el) => el.children.length))
      .toBeGreaterThan(0);
  });

  test(`${name} scope disclaimer is visible, closed, and above the layout`, async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, PAGE);
    const card = page.locator('details#scopeDisclaimer.disclaimer-card');
    await expect(card).toBeVisible();
    await expect(card).not.toHaveAttribute('open', /.*/);

    const box = await card.boundingBox();
    const layout = await page.locator('.pinouts-layout').boundingBox();
    expect(box.width).toBeGreaterThan(layout.width * 0.9);
    expect(box.y).toBeLessThan(layout.y);

    await expect(card.locator('.disclaimer-title')).toContainText('not a guarantee of correctness');
    // The voltage limit has to read without opening anything: it is the one
    // that destroys hardware rather than wasting an afternoon.
    await expect(card.locator('.disclaimer-lead')).toContainText('3.3 V and not 5 V tolerant');
  });

  test(`${name} scope disclaimer keeps the three original cautions`, async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, PAGE);
    const card = page.locator('details#scopeDisclaimer');
    await card.evaluate((el) => { el.open = true; });
    const body = card.locator('.disclaimer-body');

    await expect(body).toContainText('simplified, out-of-date, or board-variant-specific');
    await expect(body).toContainText('as the source of truth');
    await expect(body).toContainText('Always verify your exact PCB');
    await expect(body).toContainText('It is not a guarantee of correctness');
  });

  test(`${name} scope disclaimer opens by keyboard and carries a touchpoint above the grid`, async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, PAGE);
    const card = page.locator('details#scopeDisclaimer');
    await card.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(card).toHaveAttribute('open', '');

    const touch = page.locator('p.disclaimer');
    await expect(touch).toHaveCount(1);
    await expect(touch).toBeVisible();
    await expect(touch).toContainText('3.3 V logic, not 5 V tolerant');
    const grid = await page.locator('#pinoutsGrid').boundingBox();
    const box = await touch.boundingBox();
    expect(box.y).toBeLessThan(grid.y);
  });
}

// --- board-specific hazards -----------------------------------------------

test('ESP32 disclaimer names the pins that stop a board booting', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/esp32-pinout.html');
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // Each of these is a specific pin range with a specific consequence, not a
  // general "check the datasheet".
  await expect(body).toContainText('GPIO0, 2, 4, 5, 12 and 15 are sampled at reset');
  await expect(body).toContainText('GPIO6 to GPIO11');
  await expect(body).toContainText('GPIO34 to GPIO39 are input only');
  await expect(body).toContainText('ADC2 is unavailable while Wi-Fi is active');

  // The family point: a diagram for one variant is wrong for another.
  await expect(body).toContainText('S2, S3, C3, C6 and H2 have different cores');
});

test('Raspberry Pi disclaimer names the numbering trap and the fixed I2C pull-ups', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/rpi-pinout.html');
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // Physical against BCM numbering is the most common wiring error on this
  // platform, so the card carries a worked instance of it.
  await expect(body).toContainText('Physical or BOARD numbering');
  await expect(body).toContainText('Pin 3 is GPIO2');
  await expect(body).toContainText('board-mounted pull-ups to 3.3 V');
  await expect(body).toContainText('16 mA per pin');

  // On a Compute Module the header is the carrier's, not the module's.
  await expect(body).toContainText('the header belongs to the carrier board');
});
