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
