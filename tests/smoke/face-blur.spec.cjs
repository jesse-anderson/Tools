// Face Blur scope disclaimer. The tool's whole purpose is a privacy claim, so the
// notice disclaims the claim rather than an answer: blur is reversible by
// reconstruction, a missed face is never reported, and a face is not the only
// identifier in a photograph.
const { test, expect } = require('@playwright/test');
const { expectContrastAA } = require('./helpers.cjs');

// --- scope disclaimer --------------------------------------------------------
// See the file header.

test('face-blur scope disclaimer sits above the tool and reads while collapsed', async ({ page }) => {
  await page.goto('/tools/face-blur.html', { waitUntil: 'domcontentloaded' });

  const card = page.locator('#scopeDisclaimer');
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => el.tagName)).toBe('DETAILS');
  expect(await card.evaluate((el) => el.open)).toBe(false);

  const summary = card.locator('summary');
  await expect(summary).toContainText('Blur is not redaction');
  expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);

  // In the first viewport, and spanning the layout rather than sitting in one
  // column of it. Several of these tools use a CSS grid as their layout root,
  // where a card without grid-column: 1 / -1 becomes a sidebar.
  const cardBox = await card.boundingBox();
  expect(cardBox.y).toBeLessThan(900);
  const layoutBox = await page.locator('.calculator-layout').boundingBox();
  expect(cardBox.width).toBeGreaterThan(layoutBox.width * 0.9);

  await summary.focus();
  await page.keyboard.press('Enter');
  expect(await card.evaluate((el) => el.open)).toBe(true);
});

test('face-blur disclaimer names its specific omissions', async ({ page }) => {
  await page.goto('/tools/face-blur.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
  const body = page.locator('#scopeDisclaimer .disclaimer-body');

  for (const phrase of ['reversible', 'solid box', 'does not tell you', 'Tattoos', 'EXIF', 'not uniformly accurate across skin tones', 'HIPAA']) {
    await expect(body).toContainText(phrase);
  }
});

test('face-blur disclaimer carries the five legal elements', async ({ page }) => {
  await page.goto('/tools/face-blur.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
  const footer = page.locator('#scopeDisclaimer .disclaimer-footer');

  await expect(footer).toContainText('No warranty');
  await expect(footer).toContainText('accepts no liability');
  await expect(footer).toContainText('You assume all risk');
  await expect(footer).toContainText('this page is wrong');
  await expect(footer).toContainText('Independent verification required');
});

test('face-blur carries a second touchpoint beside the output', async ({ page }) => {
  await page.goto('/tools/face-blur.html', { waitUntil: 'domcontentloaded' });
  const touchpoint = page.locator('p.disclaimer');
  await expect(touchpoint).toHaveCount(1);
  await expect(touchpoint).toContainText('Blur is reversible and missed faces are not reported');
  await expect(touchpoint).toBeVisible();
});

test('face-blur disclaimer text clears WCAG AA in both themes', async ({ page }) => {
  await page.goto('/tools/face-blur.html', { waitUntil: 'domcontentloaded' });
  await expectContrastAA(
    page,
    '#scopeDisclaimer .disclaimer-title, #scopeDisclaimer .disclaimer-lead, ' +
      '#scopeDisclaimer .disclaimer-note, #scopeDisclaimer .disclaimer-section h3, ' +
      '#scopeDisclaimer .disclaimer-footer'
  );
});
