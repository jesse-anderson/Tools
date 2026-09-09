// Stoichiometry calculator: equation balancing (including charged species),
// tooltip help wiring, limiting-reactant vs target-yield modes, and formula
// parsing edge cases.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

test('stoichiometry calculator balances charged species without treating charge as atoms', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/stoichiometry-calculator.html');

  await page.fill('#equationInput', 'MnO4- + Fe2+ + H+ -> Mn2+ + Fe3+ + H2O');
  await page.click('#balanceBtn');

  await expect(page.locator('#equationStatus')).toContainText('BALANCED');
  await expect(page.locator('#balancedEquationDisplay')).toContainText('MnO₄⁻ + 5 Fe²⁺ + 8 H⁺');
  await expect(page.locator('#balancedEquationDisplay')).toContainText('Mn²⁺ + 5 Fe³⁺ + 4 H₂O');

  const rows = page.locator('#stoichTableBody tr');
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0).locator('td').nth(1)).toHaveText('1');
  await expect(rows.nth(1).locator('td').nth(1)).toHaveText('5');
  await expect(rows.nth(2).locator('td').nth(1)).toHaveText('8');
  await expect(rows.nth(3).locator('td').nth(1)).toHaveText('1');
  await expect(rows.nth(4).locator('td').nth(1)).toHaveText('5');
  await expect(rows.nth(5).locator('td').nth(1)).toHaveText('4');

  await page.fill('#equationInput', 'Fe2+ -> Fe3+');
  await page.click('#balanceBtn');
  await expect(page.locator('#equationError')).toContainText('Equation cannot be balanced');
});

test('stoichiometry calculator exposes table help as interactive tooltip buttons', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/stoichiometry-calculator.html');

  await page.fill('#equationInput', 'H2 + O2 -> H2O');
  await page.click('#balanceBtn');

  const chips = page.locator('.help-chip');
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toHaveAttribute('aria-describedby', 'tooltip-coef');
  await expect(page.locator('#tooltip-coef')).toHaveAttribute('role', 'tooltip');

  await chips.nth(0).click();
  await expect(chips.nth(0)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(chips.nth(0)).toHaveAttribute('aria-expanded', 'false');
});

test('stoichiometry calculator does not produce yield until every reactant is available', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/stoichiometry-calculator.html');

  await page.fill('#equationInput', 'H2 + O2 -> H2O');
  await page.click('#balanceBtn');

  const moleInputs = page.locator('.input-moles');
  await moleInputs.nth(0).fill('1');

  await expect(moleInputs.nth(2)).toHaveValue('');
  await expect(page.locator('#limitingReactantDisplay')).toHaveText('Awaiting all reactants');
  await expect(page.locator('#totalMassDisplay')).toHaveText('--');

  await moleInputs.nth(1).fill('0.5');
  await expect(moleInputs.nth(2)).toHaveValue('1.0000');
  await expect(page.locator('#limitingReactantDisplay')).toContainText('H₂');
  await expect(page.locator('#totalMassDisplay')).toHaveText('18.02 g');
});

test('stoichiometry calculator marks target-mode reactants as derived', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/stoichiometry-calculator.html');

  await page.fill('#equationInput', 'H2 + O2 -> H2O');
  await page.click('#balanceBtn');

  await page.locator('.input-moles').nth(2).fill('1');

  const rows = page.locator('#stoichTableBody tr');
  await expect(page.locator('#activeModeBadge')).toHaveText('Target Yield Mode');
  await expect(page.locator('#limitingReactantDisplay')).toHaveText('Not applicable');
  await expect(rows.nth(0).locator('.excess-cell')).toHaveText('DERIVED');
  await expect(rows.nth(1).locator('.excess-cell')).toHaveText('DERIVED');
  await expect(rows.nth(0)).not.toHaveClass(/limiting-row/);
});

test('stoichiometry calculator rejects zero-count formulas and parses alternate hydrate dots', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/stoichiometry-calculator.html');

  await page.fill('#equationInput', 'H0');
  await page.click('#balanceBtn');

  await expect(page.locator('#equationError')).toContainText('Element count must be a positive integer.');
  await expect(page.locator('#resultsPanel')).toHaveClass(/hidden/);

  await page.fill('#equationInput', 'CuSO4∙5H2O');
  await page.click('#balanceBtn');

  await expect(page.locator('#equationStatus')).toContainText('FORMULA ANALYZED');
  await expect(page.locator('#equationError')).toHaveClass(/hidden/);
  await expect(page.locator('#stoichTableBody tr').first().locator('td').nth(2)).toHaveText('249.6770');
});

// --- scope disclaimer -----------------------------------------------------
// The old block had two defects beyond its wording. Its heading measured
// 2.49:1 on the light card, and it lived inside #sidebarPanel, which carries
// .hidden until a balance succeeds: the scope limits were invisible to anyone
// who had not already used the tool. Both tests below exist for that.

const PAGE = '/tools/stoichiometry-calculator.html';

test('scope disclaimer is visible before any equation is entered', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);

  // The sidebar that used to hold the disclaimer is still hidden at this point.
  await expect(page.locator('#sidebarPanel')).toHaveClass(/hidden/);

  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  const box = await card.boundingBox();
  const layout = await page.locator('main.main-layout').boundingBox();
  const panel = await page.locator('.calculator-panel').boundingBox();
  expect(box.width).toBeGreaterThan(layout.width * 0.9);
  expect(box.y).toBeLessThan(panel.y);

  await expect(card.locator('.disclaimer-title')).toContainText('Not a procedure');
  await expect(card.locator('.disclaimer-lead')).toContainText('to completion');
});

test('scope disclaimer keeps every chemistry caveat the old block named', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  for (const caveat of [
    'purity',
    'hydration state',
    'Solvent effects',
    'side reactions',
    'Catalyst requirements',
    'thermodynamic feasibility',
    'kinetics',
    'Waste disposal',
    'Analytical measurement uncertainty',
  ]) {
    await expect(body, `lost the ${caveat} caveat`).toContainText(caveat);
  }

  // The two caveats about the balance itself, which are the ones a chemist
  // would notice missing.
  await expect(body).toContainText('null-space solution is mathematically valid and may not be the chemically preferred pathway');
  await expect(body).toContainText('infinitely many valid balances');

  // The line the whole card exists to land.
  await expect(body).toContainText('A balanced equation is a bookkeeping statement about atoms');
});

test('scope disclaimer opens by keyboard, and the touchpoint appears with the results', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');

  // The touchpoint lives in the results panel, so it is hidden until there is
  // an answer to sit beside, and visible whenever there is one.
  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toBeHidden();

  await page.fill('#equationInput', 'C3H8 + O2 -> CO2 + H2O');
  await page.click('#balanceBtn');
  await expect(page.locator('#resultsPanel')).toBeVisible();
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('A balance is not a reaction');
  await expect(touch).toContainText('Safety Data Sheet');
});
