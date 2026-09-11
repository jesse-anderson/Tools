// The P3 band: 14 low-consequence tools that carry a short scope notice and no
// sectioned disclaimer card. The zero-card assertion pins that decision, which is
// easy to undo by accident; the reasoning is in docs/SOW/disclaimer_rework_sow.md.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

// slug -> a phrase from that tool's claim, specific enough that a generic notice fails.
const P3_TOOLS = {
  'word-count': 'Sentences are split on',
  'productivity-timer': 'throttled to',
  'workweek-planner': 'roll off after ten saves',
  'graph-paper-generator': 'only 5 mm if you print it at 100%',
  'lamport-timestamps': 'a smaller timestamp does not mean the event came first',
  'timestamp-converter': 'do not model leap seconds',
  'case-conversion': 'do not round-trip',
  'markdown-preview': 'the rendering that matters is the one on the',
  'color-picker': 'no ink',
  'encoding': 'is not an XSS defence',
  'json-formatter': 'comes back changed rather than rejected',
  'token-throughput-visualizer': 'nothing on screen measures a model',
  'base-converter': 'truncated at the high byte rather than rejected',
  'regex-tester': 'performs no ReDoS check',
};

for (const [slug, claim] of Object.entries(P3_TOOLS)) {
  test(`${slug} carries one short notice, no card, and links to the site-wide terms`, async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, `/tools/${slug}.html`);

    const note = page.locator('p.disclaimer');
    await expect(note, `${slug} should carry exactly one short notice`).toHaveCount(1);
    await expect(note).toBeVisible();

    // A card appearing here means the rollout ran past where it was supposed to stop.
    await expect(
      page.locator('.disclaimer-card'),
      `${slug} is P3 and must NOT grow a sectioned disclaimer card`
    ).toHaveCount(0);

    await expect(note).toContainText('used at your own risk');
    await expect(note, `${slug} lost its specific claim`).toContainText(claim);

    const link = note.locator('a[href="../tools.html#siteDisclaimer"]');
    await expect(link, `${slug} must reach the site-wide clauses by link`).toHaveCount(1);
    await expect(link).toHaveText(/site-wide notice/i);
  });
}


// Unlinked from the catalog, reachable by direct URL from inside another tool.
// Same short-notice shape as the P3 band.
const REACHABLE_SUBPAGES = {
  'figure-rectifier': 'set by where you clicked, not by the maths',
  'meeting-planner-privacy': 'not a contract, a certification, or a compliance statement',
};

for (const [slug, claim] of Object.entries(REACHABLE_SUBPAGES)) {
  test(`${slug} is reachable by URL and carries a short notice`, async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, `/tools/${slug}.html`);
    const note = page.locator('p.disclaimer');
    await expect(note).toHaveCount(1);
    await expect(note).toBeVisible();
    await expect(note).toContainText(claim);
    await expect(note).toContainText('used at your own risk');
    await expect(note.locator('a[href="../tools.html#siteDisclaimer"]')).toHaveCount(1);
  });
}

test('the link target exists on tools.html and opens itself when followed', async ({ page, baseURL }) => {
  // A fragment link to a closed <details> only scrolls to it, so tools.html opens
  // it from the hash. Without this, all 14 links degrade silently.
  await expectPageToLoadCleanly(page, baseURL, '/tools.html');
  const card = page.locator('details#siteDisclaimer');
  await expect(card).toHaveCount(1);
  await expect(card).not.toHaveAttribute('open', /.*/);

  await page.goto(`${baseURL}/tools.html#siteDisclaimer`, { waitUntil: 'domcontentloaded' });
  await expect(card).toHaveAttribute('open', '');
  await expect(card.locator('.disclaimer-footer')).toContainText('indemnify and hold harmless');
});

test('following the notice link from a tool page lands on the open site notice', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools/word-count.html');
  await page.locator('p.disclaimer a').click();
  await page.waitForURL(/tools\.html#siteDisclaimer$/);
  await expect(page.locator('details#siteDisclaimer')).toHaveAttribute('open', '');
});
