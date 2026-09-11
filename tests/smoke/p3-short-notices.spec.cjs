// The P3 band: 14 tools that carry a short scope notice and deliberately do NOT
// carry a sectioned disclaimer card.
//
// This spec exists to pin a decision that is easy to undo by accident. Phases 2
// to 4 gave 40 tools a sectioned `.disclaimer-card` with eight legal clauses in
// its footer, and the obvious next move is to finish the job by giving the other
// 14 the same treatment. That would be wrong. A word counter carrying an
// indemnity clause teaches readers that the cards are decoration, which is what
// costs the beam-deflection and control-valve-sizing cards their credibility on
// the pages where the warning is load-bearing. So these pages get one paragraph
// naming the one thing the tool genuinely does not do, and reach the warranty,
// liability and indemnity clauses by link to the site-wide notice on tools.html.
//
// Three things are asserted for every tool: exactly one notice, the risk
// sentence, and the working link. Then one claim per tool, so the notice cannot
// decay into "this tool has limitations", which is worth nothing.
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly } = require('./helpers.cjs');

// slug -> a phrase from that tool's specific claim. Each is a fact about the
// implementation that a reader could not guess, not a genre sentence.
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

    // The decision this spec exists to hold. A card appearing here means someone
    // finished the rollout past where it was supposed to stop.
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

test('the link target exists on tools.html and opens itself when followed', async ({ page, baseURL }) => {
  // A link to a fragment that is a closed <details> only scrolls to it, so the
  // reader lands on a summary line and has to click again. tools.html opens it
  // from the hash. If that handler is removed, these 14 links quietly degrade.
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
