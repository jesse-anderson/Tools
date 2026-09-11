// PID Playground scope disclaimer. FOPDT is a caricature of a real process, and
// the omissions that matter make a loop oscillate in service while behaving
// perfectly here, stiction above all. The notice names them; these tests pin them.
const { test, expect } = require('@playwright/test');
const { expectContrastAA } = require('./helpers.cjs');

// --- scope disclaimer --------------------------------------------------------
// See the file header.

test('pid-playground scope disclaimer sits above the tool and reads while collapsed', async ({ page }) => {
  await page.goto('/tools/pid-playground.html', { waitUntil: 'domcontentloaded' });

  const card = page.locator('#scopeDisclaimer');
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => el.tagName)).toBe('DETAILS');
  expect(await card.evaluate((el) => el.open)).toBe(false);

  const summary = card.locator('summary');
  await expect(summary).toContainText('unstable on the plant');
  expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);

  // In the first viewport, and spanning the layout rather than sitting in one
  // column of it. Several of these tools use a CSS grid as their layout root,
  // where a card without grid-column: 1 / -1 becomes a sidebar.
  const cardBox = await card.boundingBox();
  expect(cardBox.y).toBeLessThan(900);
  const layoutBox = await page.locator('.pid-workbench').boundingBox();
  expect(cardBox.width).toBeGreaterThan(layoutBox.width * 0.9);

  await summary.focus();
  await page.keyboard.press('Enter');
  expect(await card.evaluate((el) => el.open)).toBe(true);
});

test('pid-playground disclaimer names its specific omissions', async ({ page }) => {
  await page.goto('/tools/pid-playground.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
  const body = page.locator('#scopeDisclaimer .disclaimer-body');

  for (const phrase of ['Stiction, backlash, dead band', 'Actuator limits', 'Measurement reality', 'aliasing', 'Interaction', 'IEC 61511', 'management of change', 'Ziegler-Nichols in particular is deliberately aggressive']) {
    await expect(body).toContainText(phrase);
  }
});

test('pid-playground disclaimer carries the five legal elements', async ({ page }) => {
  await page.goto('/tools/pid-playground.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
  const footer = page.locator('#scopeDisclaimer .disclaimer-footer');

  await expect(footer).toContainText('No warranty');
  await expect(footer).toContainText('accepts no liability');
  await expect(footer).toContainText('You assume all risk');
  await expect(footer).toContainText('this page is wrong');
  await expect(footer).toContainText('Independent verification required');
});

test('pid-playground carries a second touchpoint beside the output', async ({ page }) => {
  await page.goto('/tools/pid-playground.html', { waitUntil: 'domcontentloaded' });
  const touchpoint = page.locator('p.disclaimer');
  await expect(touchpoint).toHaveCount(1);
  await expect(touchpoint).toContainText('Ideal FOPDT model');
  await expect(touchpoint).toBeVisible();
});

test('pid-playground disclaimer text clears WCAG AA in both themes', async ({ page }) => {
  await page.goto('/tools/pid-playground.html', { waitUntil: 'domcontentloaded' });
  await expectContrastAA(
    page,
    '#scopeDisclaimer .disclaimer-title, #scopeDisclaimer .disclaimer-lead, ' +
      '#scopeDisclaimer .disclaimer-note, #scopeDisclaimer .disclaimer-section h3, ' +
      '#scopeDisclaimer .disclaimer-footer'
  );
});
