// Human Equivalent Dose scope disclaimer.
//
// The tool had no spec at all before September 2026, and it is the highest
// clinical stakes in the repo: it scales an animal no-effect dose to a human
// figure. The old sidebar waiver was real but set at 0.7rem, below the inputs,
// not collapsible, and scored 2 of 5 legal elements. It is now the shared card
// above the calculator.
const { test, expect } = require('@playwright/test');
const { expectContrastAA } = require('./helpers.cjs');

// --- scope disclaimer --------------------------------------------------------
// See the file header.

test('hed-calculator scope disclaimer sits above the tool and reads while collapsed', async ({ page }) => {
  await page.goto('/tools/hed-calculator.html', { waitUntil: 'domcontentloaded' });

  const card = page.locator('#scopeDisclaimer');
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => el.tagName)).toBe('DETAILS');
  expect(await card.evaluate((el) => el.open)).toBe(false);

  const summary = card.locator('summary');
  await expect(summary).toContainText('Never a dose for a person');
  expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);

  // In the first viewport, and spanning the layout rather than sitting in one
  // column of it. Several of these tools use a CSS grid as their layout root,
  // where a card without grid-column: 1 / -1 becomes a sidebar.
  const cardBox = await card.boundingBox();
  expect(cardBox.y).toBeLessThan(900);
  const layoutBox = await page.locator('main').boundingBox();
  expect(cardBox.width).toBeGreaterThan(layoutBox.width * 0.9);

  await summary.focus();
  await page.keyboard.press('Enter');
  expect(await card.evaluate((el) => el.open)).toBe(true);
});

test('hed-calculator disclaimer names its specific omissions', async ({ page }) => {
  await page.goto('/tools/hed-calculator.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
  const body = page.locator('#scopeDisclaimer .disclaimer-body');

  for (const phrase of ['Anything pharmacokinetic', 'Species metabolism', 'Route and formulation', 'biologics', 'TGN1412', 'GLP toxicology package', 'biohacking']) {
    await expect(body).toContainText(phrase);
  }
});

test('hed-calculator disclaimer carries the five legal elements', async ({ page }) => {
  await page.goto('/tools/hed-calculator.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
  const footer = page.locator('#scopeDisclaimer .disclaimer-footer');

  await expect(footer).toContainText('No warranty');
  await expect(footer).toContainText('accepts no liability');
  await expect(footer).toContainText('You assume all risk');
  await expect(footer).toContainText('this page is wrong');
  await expect(footer).toContainText('Independent verification required');
});

test('hed-calculator carries a second touchpoint beside the output', async ({ page }) => {
  await page.goto('/tools/hed-calculator.html', { waitUntil: 'domcontentloaded' });
  const touchpoint = page.locator('p.disclaimer');
  await expect(touchpoint).toHaveCount(1);
  await expect(touchpoint).toContainText('Preclinical arithmetic, never a dose');
  await expect(touchpoint).toBeVisible();
});

test('hed-calculator disclaimer text clears WCAG AA in both themes', async ({ page }) => {
  await page.goto('/tools/hed-calculator.html', { waitUntil: 'domcontentloaded' });
  await expectContrastAA(
    page,
    '#scopeDisclaimer .disclaimer-title, #scopeDisclaimer .disclaimer-lead, ' +
      '#scopeDisclaimer .disclaimer-note, #scopeDisclaimer .disclaimer-section h3, ' +
      '#scopeDisclaimer .disclaimer-footer'
  );
});

test('hed-calculator disclaimer keeps the clauses the old block carried', async ({ page }) => {
  await page.goto('/tools/hed-calculator.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
  const footer = page.locator('#scopeDisclaimer .disclaimer-footer');

  // Enumerated damages plus the "even if advised" tail, which the pre-rebuild
  // oral-multidose block had and the first version of this card lost.
  await expect(footer).toContainText('Consequential damages excluded');
  await expect(footer).toContainText('even if advised of the possibility');
  await expect(footer).toContainText('strict liability or tort including negligence');

  // Indemnity, which the pre-rebuild toxicology block had and which had
  // disappeared from every page in the repo.
  await expect(footer).toContainText('indemnify and hold');

  // Medical tools additionally disclaim any professional relationship.
  await expect(footer).toContainText('does not create a');
  await expect(footer).toContainText('nothing on it is medical, clinical, toxicological or professional advice');
});
