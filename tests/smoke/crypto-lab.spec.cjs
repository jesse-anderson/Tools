// Crypto lab: hash correctness against published test vectors, and the scope
// disclaimer.
//
// The tool had no spec. Its old notice was headed "Engineering & Security
// Notes" and ended with the sentence "No data is transmitted, ensuring
// privacy", which is a security guarantee offered by a page that also exposes
// DES, RC4, MD5 and ECB mode. The rebuild keeps every technical point it made
// and replaces the guarantee with what client-side actually buys you.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

const PAGE = '/tools/crypto-lab.html';

async function openTool(page) {
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.CryptoJS !== 'undefined');
}

// --- hashes against published vectors -------------------------------------
// The page is Active, so the arithmetic gets an external anchor. These are the
// standard "abc" digests from the algorithm specifications.

test('page loads cleanly', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, PAGE);
});

test('hashing "abc" reproduces the published digests', async ({ page }) => {
  await openTool(page);
  await page.click('#tabHash');
  await page.fill('#inputArea', 'abc');

  // RFC 1321 (MD5), RFC 3174 (SHA-1), FIPS 180-4 (SHA-256).
  await expect(page.locator('#resMD5')).toHaveText('900150983cd24fb0d6963f7d28e17f72');
  await expect(page.locator('#resSHA1')).toHaveText('a9993e364706816aba3e25717850c26c9cd0d89d');
  await expect(page.locator('#resSHA256'))
    .toHaveText('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('an emptied input clears the digests rather than showing the empty-string hash', async ({ page }) => {
  await openTool(page);
  await page.click('#tabHash');
  await page.fill('#inputArea', 'abc');
  await expect(page.locator('#resMD5')).toHaveText('900150983cd24fb0d6963f7d28e17f72');

  await page.fill('#inputArea', '');
  // The tool shows a placeholder, and that is the right call: printing
  // d41d8cd9... for an empty box invites a reader to copy the empty-string
  // digest believing it hashed their content. This test pins the choice so a
  // future change to "always compute" is a decision rather than a slip.
  await expect(page.locator('#resMD5')).toHaveText('-');
  await expect(page.locator('#resSHA1')).toHaveText('-');
});

// --- scope disclaimer -----------------------------------------------------

test('scope disclaimer is visible, closed, and above the layout', async ({ page }) => {
  await openTool(page);
  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  const box = await card.boundingBox();
  const layout = await page.locator('.calculator-layout').boundingBox();
  expect(box.width).toBeGreaterThan(layout.width * 0.9);
  expect(box.y).toBeLessThan(layout.y);

  await expect(card.locator('.disclaimer-title')).toContainText('Not a way to protect a real secret');
  // The correction to the old copy has to read without opening the card.
  await expect(card.locator('.disclaimer-lead'))
    .toContainText('Nothing is transmitted, which is not the same thing as being safe');
});

test('scope disclaimer no longer claims client-side means private', async ({ page }) => {
  await openTool(page);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // The sentence that had to go.
  await expect(body).not.toContainText('ensuring privacy');

  // What replaced it: the threat it does cover, and five it does not.
  await expect(body).toContainText('That protects you from one specific threat, a server operator, and from nothing else');
  await expect(body).toContainText('JavaScript strings are immutable, so a key cannot be overwritten or zeroed');
  await expect(body).toContainText('paged to swap');
  await expect(body).toContainText('extensions with host access');
  await expect(body).toContainText('system clipboard');
  await expect(body).toContainText('No constant-time guarantees');
});

test('scope disclaimer keeps the four technical notes the old block made', async ({ page }) => {
  await openTool(page);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // Integrity against authenticity, which is the distinction the matcher
  // invites a reader to collapse.
  await expect(body).toContainText('A match proves integrity, that the data has not changed');
  await expect(body).toContainText('not authenticity, who sent it');
  await expect(body).toContainText('MD5 and SHA-1 are cryptographically broken');
  await expect(body).toContainText('use SHA-256 or SHA-3');
  await expect(body).toContainText('validated by');
  await expect(body).toContainText('byte length');
  await expect(body).toContainText('2 to 4 bytes each');
});

test('scope disclaimer names the traps the algorithm menu offers', async ({ page }) => {
  await openTool(page);

  // Each of these is selectable on the page, which is why the card names it.
  const algos = await page.locator('#encAlgo option').allTextContents();
  expect(algos.join(' ')).toMatch(/DES/);
  expect(algos.join(' ')).toMatch(/RC4/);
  await expect(page.locator('#aesMode option')).toHaveCount(2);

  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('DES and RC4 are obsolete');
  await expect(body).toContainText('ECB mode leaks structure');
  // Passphrase mode is a menu option, and what it does under the hood is the
  // single most misread thing on the page.
  await expect(body).toContainText('OpenSSL EVP_BytesToKey');
  await expect(body).toContainText('None of this is authenticated');
  await expect(body).toContainText('IV reuse breaks confidentiality');
});

test('scope disclaimer names the uses it is not for, and makes no security guarantee', async ({ page }) => {
  await openTool(page);
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('PCI DSS, HIPAA and GDPR');
  await expect(body).toContainText('Passwords need a slow, salted password-hashing function');
  await expect(body).toContainText('chain of custody');
  await expect(body).toContainText('Web Crypto API');

  await expect(card.locator('.disclaimer-footer'))
    .toContainText('No security guarantee of any kind is made or implied');
});

test('scope disclaimer opens by keyboard and carries a touchpoint beside the output', async ({ page }) => {
  await openTool(page);
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');

  const touch = page.locator('p.disclaimer');
  await expect(touch).toHaveCount(1);
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('A teaching bench, not a safe');
  await expect(touch).toContainText('will still decrypt to something');
});
