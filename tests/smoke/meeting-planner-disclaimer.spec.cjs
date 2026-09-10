// Meeting Planner: the scope disclaimer.
//
// Separate from meeting-planner-smoke.spec.cjs, which is excluded from
// testMatch because it needs a local Worker and a Turnstile bypass. This spec
// runs against the static page with no backend, which is also the point: the
// card sits outside both view sections, so it renders whether or not the
// service is reachable and whether or not an event has loaded.
//
// This is the only tool in the repo with a server, the only one that collects
// other people's data, and its notice scored 0/5 on the legal elements: it was
// an accurate data-flow description with no warranty, liability, risk,
// precedence or verification language anywhere in it.
const { test, expect } = require('@playwright/test');

const PAGE = '/tools/meeting-planner.html';

test('scope disclaimer renders with no backend and before any view is shown', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });

  const card = page.locator('details#scopeDisclaimer.disclaimer-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open', /.*/);

  // Both views carry `hidden` until script decides which to show. The card is
  // outside them on purpose.
  await expect(card).toBeVisible();
  const inAView = await card.evaluate((el) => Boolean(el.closest('.view')));
  expect(inAView).toBe(false);

  await expect(card.locator('.disclaimer-title')).toContainText('Not a private channel');
  // The security model has to read without opening anything.
  await expect(card.locator('.disclaimer-lead')).toContainText('a share link is the only access control');
});

test('scope disclaimer keeps every fact the old privacy notice stated', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('scheduler.jesse-anderson.net');
  await expect(body).toContainText('no accounts, no analytics and no application cookies');
  await expect(body).toContainText('90 days by default');
  await expect(body).toContainText('within 24 hours');
  await expect(body).toContainText('backups age out within 30 days');
  await expect(body).toContainText('under 16, ask a parent or guardian');

  // The privacy page is the authority; the card says so rather than replacing it.
  await expect(body.locator('a[href="meeting-planner-privacy.html"]')).toHaveCount(1);
  await expect(body).toContainText('it governs where this summary is shorter');
});

test('scope disclaimer states the share-link security model plainly', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  await expect(body).toContainText('There is no authentication');
  await expect(body).toContainText('Treat a link posted anywhere public as public');
  await expect(body).toContainText('Nothing here is end-to-end encrypted');
  await expect(body).toContainText('HTTPS protects the data in transit and not at rest');
});

test('scope disclaimer addresses collecting other people data', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const body = card.locator('.disclaimer-body');

  // The obligation this tool creates for the person who sends the link, which
  // no other tool in the repo creates at all.
  await expect(body).toContainText('You are collecting other people');
  await expect(body).toContainText('Tell people what the link is and where the data goes before you send it');
  await expect(body).toContainText('Do not enter someone else');

  // The specific hazard of an availability tool: a name plus a time.
  await expect(body).toContainText('A name plus a time can reveal more than either does alone');
  await expect(body).toContainText('psychiatric or a support group');
  await expect(body).toContainText('system of record under GDPR, HIPAA, FERPA');

  // A hobby server, said out loud.
  await expect(body).toContainText('No availability or durability guarantee');
  await expect(body).toContainText('stored data can be lost without notice or recovery');
});

test('scope disclaimer carries the clauses the old notice had none of', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  const card = page.locator('details#scopeDisclaimer');
  await card.evaluate((el) => { el.open = true; });
  const footer = card.locator('.disclaimer-footer');

  await expect(footer).toContainText('No guarantee of confidentiality, uptime or data retention is made or implied');
  // The indemnity is worded for the one tool where a third party can be the
  // claimant rather than the user.
  await expect(footer).toContainText('including any claim brought by a person whose data you collected through it');
  // A heatmap is not a confirmed meeting.
  await expect(footer).toContainText('A heatmap on this page is not a confirmation');
});

test('the point-of-collection notice is still in the event view', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  // The card does not replace #privacyNotice: that one sits next to the fields
  // a participant types into, which is where a collection notice belongs.
  const notice = page.locator('#privacyNotice');
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText('sent');
  await expect(notice).toContainText('over HTTPS to the Meeting Planner backend');
  const inEventView = await notice.evaluate((el) => el.closest('.view')?.id);
  expect(inEventView).toBe('eventView');
});

test('scope disclaimer opens by keyboard', async ({ page }) => {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  const card = page.locator('details#scopeDisclaimer');
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('open', '');
});
