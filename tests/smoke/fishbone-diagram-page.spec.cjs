// Ishikawa Fishbone Diagram (tools/fishbone-diagram.html): the page. The
// outline keys, undo, the guide, the share dialog and the snapshot view,
// exports, solo mode making no outside request, phones, theme and projects.

const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly, readDownloadText } = require('./helpers.cjs');

const PAGE = '/tools/fishbone-diagram.html';
const GUIDE_KEY = 'fishboneDiagram.guideSeen.v1';
const PROJECTS_KEY = 'fishboneDiagram.projects.v1';

async function openTool(page, { guideSeen = true, hash = '' } = {}) {
  if (guideSeen) await page.addInitScript((key) => { try { localStorage.setItem(key, '1'); } catch (e) { /* none */ } }, GUIDE_KEY);
  await page.goto(`${PAGE}${hash}`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.FishboneDiagram) && Boolean(document.querySelector('#diagramHost svg')))).toBe(true);
}

const outlineText = (page) => page.evaluate(() => window.FishboneDiagram.outline.toOutline(window.FishboneDiagram.getBoard()));

async function loadOutline(page, text) {
  await page.click('#importText');
  await page.fill('#textArea', text);
  await page.click('#textNewProject');
  await expect(page.locator('#textDialog')).not.toBeVisible();
}

test('loads cleanly, starts from the 6M example, and keeps its disclaimer closed', async ({ page, baseURL }) => {
  await page.addInitScript((key) => { try { localStorage.setItem(key, '1'); } catch (e) { /* none */ } }, GUIDE_KEY);
  await expectPageToLoadCleanly(page, baseURL, PAGE);
  await expect(page.locator('#tallyLine')).toHaveText('11 causes in 6 categories: 1 verified, 2 ruled out, 2 suspected, 6 not examined. Deepest chain 3 whys.');
  await expect(page.locator('#scopeDisclaimer')).not.toHaveAttribute('open', '');
  await expect(page.locator('p.disclaimer')).toContainText("Statuses are your team's claims");
  await expect(page.locator('#goOnline')).toBeDisabled();
  await expectPageToLoadCleanly(page, baseURL, '/tools/fishbone-diagram-privacy.html');
  await expect(page.locator('h2')).toHaveCount(11);
});

test('each example opens as a project and renders its tally line', async ({ page }) => {
  await openTool(page);
  const tallies = {
    'short-shots': '11 causes in 6 categories',
    'late-pizza': 'Suppliers has nothing listed.',
    'nightly-backup': 'Deepest chain 5 whys.',
    'check-in-wait': '8 causes in 5 categories',
    'late-invoices': '6 causes in 4 categories',
    'support-brainstorm': '7 causes in 0 categories, 7 still unsorted'
  };
  for (const [id, text] of Object.entries(tallies)) {
    if (id === 'short-shots') { await expect(page.locator('#tallyLine')).toContainText(text); continue; }
    await page.selectOption('#exampleSelect', id);
    await page.click('#exampleLoad');
    await expect(page.locator('#tallyLine')).toContainText(text);
  }
  await expect(page.locator('#projectSelect option')).toHaveCount(6);
  await expect(page.locator('#checksList [data-code]')).toHaveCount(0);
  await page.selectOption('#projectSelect', { label: 'Patient wait at check-in' });
  await expect(page.locator('#checksList [data-code="HUMAN_ERROR"]')).toHaveCount(1);
});

test('outline keys: Enter, Tab, Shift+Tab, Ctrl+Enter, move, status, Backspace and Escape', async ({ page }) => {
  await openTool(page);
  await loadOutline(page, 'Methods\n  A\n  B\n');
  const a = page.locator('#outliner input[type="text"]').nth(1);
  await a.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('New');
  await page.keyboard.press('Tab');
  await expect.poll(() => outlineText(page)).toBe('Methods\n  A\n    New\n  B\n');
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => outlineText(page)).toBe('Methods\n  A\n  New\n  B\n');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('Why');
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => outlineText(page)).toBe('Methods\n  A\n  New\n  Why\n  B\n');
  await page.keyboard.press('Control+Shift+ArrowDown');
  await expect.poll(() => outlineText(page)).toBe('Methods\n  A\n  New\n  B\n  Why\n');
  await page.keyboard.press('Control+Shift+Digit2');
  await expect.poll(() => outlineText(page)).toBe('Methods\n  A\n  New\n  B\n  Why [verified]\n');
  await page.keyboard.press('Control+Shift+Digit0');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Control+Shift+Digit1');
  await expect.poll(() => outlineText(page)).toBe('Methods\n  A\n  New\n  B [suspected]\n  Why\n');
  // Backspace on an emptied line deletes it.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect.poll(() => outlineText(page)).toBe('Methods\n  A\n  New\n  B [suspected]\n');
  await page.keyboard.press('Escape');
  await expect(page.locator('#addCategory')).toBeFocused();
});

test('the outline leaves the browser\'s own keys alone, and every listed shortcut is one it binds', async ({ page }) => {
  await openTool(page);
  await page.locator('#outliner input[type="text"]').nth(1).click();
  await page.evaluate(() => {
    window.fbTaken = [];
    document.addEventListener('keydown', (e) => { if (e.defaultPrevented) window.fbTaken.push(`${e.altKey ? 'Alt+' : ''}${e.ctrlKey ? 'Ctrl+' : ''}${e.key}`); });
  });
  for (const key of ['Alt+ArrowLeft', 'Alt+ArrowRight', 'Control+1', 'Control+5', 'Control+9']) await page.keyboard.press(key);
  expect(await page.evaluate(() => window.fbTaken)).toEqual([]);
  const listed = await page.locator('#keyTable tbody tr').evaluateAll((rows) => rows.map((r) => r.dataset.key));
  expect(listed).toEqual(['Enter', 'Tab', 'Ctrl+Enter', 'Ctrl+Shift+ArrowUp', 'Ctrl+Shift+Digit1', 'ArrowUp', 'Backspace', 'Escape', 'Ctrl+Z']);
});

test('undo and redo across adds, moves, deletes and status changes', async ({ page }) => {
  await openTool(page);
  await loadOutline(page, 'M\n  A\n  B\nN\n');
  const start = await outlineText(page);
  const steps = await page.evaluate(() => {
    const F = window.FishboneDiagram;
    const b = F.getBoard();
    const find = (t) => Object.values(b.nodes).find((x) => x.text === t);
    const id = 'QQQQQQQQQQQQ';
    F.apply({ type: 'addNode', id, parentId: find('A').id, after: null, kind: 'cause', text: 'C' });
    F.apply({ type: 'move', nodeId: find('B').id, parentId: find('N').id, after: null });
    F.apply({ type: 'setField', nodeId: find('A').id, field: 'status', value: 'ruledOut' });
    F.apply({ type: 'deleteNode', nodeId: find('A').id });
    return F.outline.toOutline(F.getBoard());
  });
  expect(steps).toBe('M\nN\n  B\n');
  await page.locator('#diagramFrame').click({ position: { x: 2, y: 2 } });
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  await expect.poll(() => outlineText(page)).toBe(start);
  await page.keyboard.press('Control+Shift+Z');
  await page.keyboard.press('Control+y');
  await expect.poll(() => outlineText(page)).toBe('M\n  A\n    C\n  B\nN\n'.replace('  B\nN\n', 'N\n  B\n'));
  await page.click('#redoBtn');
  await page.click('#redoBtn');
  await expect.poll(() => outlineText(page)).toBe(steps);
  await expect(page.locator('#redoBtn')).toBeDisabled();
});

test('the guide opens by itself on a first plain visit only, has all eleven parts, and closes on Escape', async ({ page, context }) => {
  await openTool(page, { guideSeen: false });
  const guide = page.locator('#guideDialog');
  await expect(guide).toBeVisible();
  await expect(guide.locator('[data-guide-part]')).toHaveCount(11);
  await expect(guide.locator('#guide-online')).toContainText('not a password');
  await page.keyboard.press('Escape');
  await expect(guide).not.toBeVisible();
  await expect(page.locator('#howToUse')).toBeFocused();
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(window.FishboneDiagram))).toBe(true);
  await expect(guide).not.toBeVisible();
  await page.click('#howToUse');
  await expect(guide).toBeVisible();
  // While open, the rest of the page is inert.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.getElementById('guideDialog').contains(document.activeElement))).toBe(true);

  // A first visit through a snapshot link does not open it.
  const link = await page.evaluate(async () => {
    const F = window.FishboneDiagram;
    return (await F.link.packLink(F.getBoard(), { baseUrl: location.href, now: 1 })).url;
  });
  const fresh = await context.browser().newPage();
  await fresh.goto(link.replace(/^https?:\/\/[^/]+/, new URL(page.url()).origin));
  await expect.poll(() => fresh.evaluate(() => Boolean(window.FishboneDiagram))).toBe(true);
  await expect(fresh.locator('#snapshotBanner')).toBeVisible();
  await expect(fresh.locator('#guideDialog')).not.toBeVisible();
  await fresh.close();
});

test('share as link: warnings first, Copy only after the tick, and the opened link is read only until saved', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openTool(page);
  await page.click('#shareLink');
  const dialog = page.locator('#shareDialog');
  await expect(dialog).toContainText('Anyone who has this link can read the whole diagram');
  await expect(dialog).toContainText('This is a snapshot of the diagram as it is now');
  await expect(page.locator('#shareCopy')).toBeDisabled();
  await expect(page.locator('#shareUrl')).toHaveValue('');
  await page.check('#shareUnderstand');
  await expect(page.locator('#shareCopy')).toBeEnabled();
  const url = await page.inputValue('#shareUrl');
  expect(url).toContain('#snap=');
  await page.uncheck('#shareUnderstand');
  await expect(page.locator('#shareCopy')).toBeDisabled();
  await page.keyboard.press('Escape');

  const before = await outlineText(page);
  const view = await context.newPage();
  await view.goto(url);
  await expect.poll(() => view.evaluate(() => Boolean(window.FishboneDiagram) && window.FishboneDiagram.isReadOnly())).toBe(true);
  const banner = view.locator('#snapshotBanner');
  await expect(banner).toContainText('Anyone who has this link can read the whole diagram');
  await expect(banner).toContainText('will not update');
  await expect(view.locator('#snapshotTime')).toHaveText(/^\d{4}-\d\d-\d\d \d\d:\d\d UTC$/);
  await expect.poll(() => view.evaluate(() => window.FishboneDiagram.outline.toOutline(window.FishboneDiagram.getBoard()))).toBe(before);
  await expect(view.locator('#addCategory')).toBeDisabled();
  await expect(view.locator('#outliner input[type="text"]').first()).toHaveJSProperty('readOnly', true);
  const refused = await view.evaluate(() => window.FishboneDiagram.apply({ type: 'setBoard', field: 'title', value: 'x' }).ok);
  expect(refused).toBe(false);
  const count = await view.locator('#projectSelect option').count();
  await view.click('#snapshotSave');
  await expect(banner).not.toBeVisible();
  await expect(view.locator('#projectSelect option')).toHaveCount(count + 1);
  expect(await view.evaluate(() => window.FishboneDiagram.isReadOnly())).toBe(false);
  expect(new URL(view.url()).hash).toBe('');
  await view.close();
});

test('a damaged link opens nothing from it and says so', async ({ page }) => {
  await openTool(page, { hash: '#snap=AAAAthis-is-not-a-link' });
  await expect(page.locator('#linkError')).toHaveText('This link is damaged or incomplete. Nothing from it was opened.');
  await expect(page.locator('#snapshotBanner')).not.toBeVisible();
  expect(await page.evaluate(() => window.FishboneDiagram.isReadOnly())).toBe(false);
});

test('the exported SVG is the screen without its live layers, light, with title, tally and date', async ({ page }) => {
  await openTool(page);
  await page.click('[data-theme-toggle="dark"]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportSvg')]);
  expect(download.suggestedFilename()).toBe('short-shots-on-a-molded-part.svg');
  const text = await readDownloadText(download);
  const r = await page.evaluate((svgText) => {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const screen = document.querySelector('#diagramHost svg');
    const texts = (root) => [...root.querySelectorAll('.fb-diagram text')].map((t) => t.textContent);
    return {
      same: JSON.stringify(texts(doc)) === JSON.stringify(texts(screen)),
      live: doc.querySelectorAll('[tabindex], .fb-hit, .is-selected').length,
      screenLive: screen.querySelectorAll('[tabindex]').length,
      bg: doc.querySelector('.fb-bg').getAttribute('fill'),
      screenBg: screen.querySelector('.fb-bg').getAttribute('fill'),
      header: [...doc.querySelectorAll('.fb-header text')].map((t) => t.textContent).join(' | '),
      scripts: doc.querySelectorAll('script, foreignObject').length
    };
  }, text);
  expect(r.same).toBe(true);
  expect(r.live).toBe(0);
  expect(r.screenLive).toBeGreaterThan(0);
  expect(r.bg).toBe('#ffffff');
  expect(r.screenBg).toBe('#0f172a');
  expect(r.header).toMatch(/^Short shots on a molded part \| 11 causes in 6 categories.* \| Exported \d{4}-\d\d-\d\d \d\d:\d\d from Tools Hub/);
  expect(r.scripts).toBe(0);

  for (const [button, name, check] of [
    ['#exportOutline', '.txt', (t) => t.startsWith('effect: Molded housings')],
    ['#exportMermaid', '.mmd', (t) => t.startsWith('ishikawa-beta\n')],
    ['#exportCsv', '.csv', (t) => t.startsWith('Category,Level,Cause,Path,Status,Owner,Evidence,Votes')],
    ['#projectExport', '.fishbone.json', (t) => JSON.parse(t).format === 'fishbone-diagram-project']
  ]) {
    const [d] = await Promise.all([page.waitForEvent('download'), page.click(button)]);
    expect(d.suggestedFilename().endsWith(name)).toBe(true);
    expect(check(await readDownloadText(d))).toBe(true);
  }
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('#exportPng')]);
  expect(png.suggestedFilename()).toBe('short-shots-on-a-molded-part.png');
});

test('solo mode makes no request beyond this site and its fonts, through the guide, exports and a link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const outside = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.host === new URL(page.url() === 'about:blank' ? req.url() : page.url()).host) return;
    if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.host)) return;
    outside.push(req.url());
  });
  await openTool(page, { guideSeen: false });
  await page.keyboard.press('Escape');
  await Promise.all([page.waitForEvent('download'), page.click('#exportSvg')]);
  await Promise.all([page.waitForEvent('download'), page.click('#exportPng')]);
  await page.click('#shareLink');
  await page.check('#shareUnderstand');
  await expect(page.locator('#shareCopy')).toBeEnabled();
  await page.click('#shareCopy');
  await page.keyboard.press('Escape');
  await page.click('#printBtn').catch(() => {});
  expect(outside).toEqual([]);
  expect(await page.evaluate(() => [...document.scripts].map((s) => s.src).filter((s) => /turnstile|cloudflare|fishbone\.jesse/.test(s)))).toEqual([]);
});

test('diagram keys follow the outline order, and Enter edits the cause in the outline', async ({ page }) => {
  await openTool(page);
  await loadOutline(page, 'M\n  A\n    A1\n  B\nN\n  C\n');
  const first = page.locator('#diagramHost [data-node-id][tabindex="0"]');
  await first.focus();
  const seq = [];
  const label = () => page.evaluate(() => document.activeElement.getAttribute('aria-label'));
  seq.push(await label());
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown']) {
    await page.keyboard.press(key);
    seq.push(await label());
  }
  expect(seq).toEqual([
    'Category M', 'M, A, not examined', 'M, A1, not examined', 'M, B, not examined',
    'Category M', 'M, A, not examined', 'M, A1, not examined', 'M, B, not examined', 'Category N'
  ]);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#outliner .ol-row.is-selected input[type="text"]')).toBeFocused();
  await expect(page.locator('#outliner .ol-row.is-selected input[type="text"]')).toHaveValue('C');
});

test('clicking a cause on the diagram selects it in the outline and the panel, and the reverse', async ({ page }) => {
  await openTool(page);
  await page.locator('#diagramHost .fb-item', { hasText: 'Hot runner nozzle 3 partly blocked' }).click();
  await expect(page.locator('#outliner .ol-row.is-selected input[type="text"]')).toHaveValue('Hot runner nozzle 3 partly blocked');
  await expect(page.locator('#itemPanel h3')).toHaveText('Cause: Hot runner nozzle 3 partly blocked');
  await expect(page.locator('#panelEvidence')).toHaveValue('Flow test 2026-10-14: nozzle 3 at 62% of the others');
  await page.evaluate(() => [...document.querySelectorAll('#outliner input[type="text"]')].find((i) => i.value === 'Barrel heater zone 2 drifting').focus());
  await expect(page.locator('#diagramHost .fb-item.is-selected')).toContainText('Barrel heater zone 2 drifting');
  await page.fill('#panelOwner', 'Maintenance lead');
  await page.locator('#panelOwner').press('Tab');
  await expect.poll(() => outlineText(page)).toContain('Barrel heater zone 2 drifting [@Maintenance lead]');
});

test('Edit as text applies with undo, and pasting adds without changing what is there', async ({ page }) => {
  await openTool(page);
  const before = await outlineText(page);
  await page.click('#editText');
  await expect(page.locator('#textArea')).toHaveValue(/^effect: Molded housings/);
  const edited = (await page.inputValue('#textArea')).replace('  Barrel heater zone 2 drifting\n', '').replace('People\n', 'People\n  Agency staff on nights\n');
  await page.fill('#textArea', `${edited}  oops bad indent\n`);
  await page.click('#textApply');
  await expect.poll(() => outlineText(page)).toContain('Agency staff on nights');
  expect(await outlineText(page)).not.toContain('Barrel heater');
  await page.click('#undoBtn');
  await expect.poll(() => outlineText(page)).toBe(before);

  await page.click('#importText');
  await page.fill('#textArea', '- Machines\n  - Pasted cause [?]\n- Brand new\n  - Its cause\n');
  await expect(page.locator('#textFindings li')).toHaveCount(0);
  await page.click('#textApply');
  await expect.poll(() => outlineText(page)).toContain('  Pasted cause [suspected]\n');
  expect(await outlineText(page)).toContain('Brand new\n  Its cause\n');
  expect((await outlineText(page)).startsWith(before.replace(/\n$/, '').split('\nMachines\n')[0])).toBe(true);
});

test('merging a file: differences and added items, and an unrelated file offered as a new project', async ({ page }) => {
  await openTool(page);
  const files = await page.evaluate(() => {
    const F = window.FishboneDiagram;
    const b = F.getBoard();
    const find = (t) => Object.values(b.nodes).find((x) => x.text === t);
    let theirs = F.ops.applyOp(b, { type: 'setField', nodeId: find('Barrel heater zone 2 drifting').id, field: 'status', value: 'verified' }).board;
    theirs = F.ops.applyOp(theirs, { type: 'addNode', id: 'WWWWWWWWWWWW', parentId: find('Machines').id, after: null, kind: 'cause', text: 'From the other copy' }).board;
    const file = (name, state) => JSON.stringify({ format: 'fishbone-diagram-project', version: 1, name, state });
    const other = F.outline.boardFromOutline(F.outline.parseOutline('Unrelated\n  thing\n'), { newId: () => 'XXXXXXXXXXXX' });
    return { theirs: file('Their copy', theirs), other: file('Other project', other) };
  });
  await page.setInputFiles('#mergeFile', { name: 'theirs.fishbone.json', mimeType: 'application/json', buffer: Buffer.from(files.theirs) });
  await expect(page.locator('#mergeSummary')).toHaveText('1 difference to decide, and 1 item only in "Their copy", which will be added.');
  await page.locator('#mergeTable input[value="theirs"]').check();
  await page.click('#mergeApply');
  await expect.poll(() => outlineText(page)).toContain('  From the other copy\n');
  expect(await outlineText(page)).toContain('Barrel heater zone 2 drifting [verified]');
  await page.setInputFiles('#mergeFile', { name: 'other.fishbone.json', mimeType: 'application/json', buffer: Buffer.from(files.other) });
  await expect(page.locator('#mergeSummary')).toContainText('no items in common');
  await expect(page.locator('#mergeApply')).toBeHidden();
  await page.click('#mergeAsNew');
  await expect(page.locator('#projectSelect option:checked')).toHaveText('Other project');
});

test('projects persist across a reload; board settings travel in the file, viewer settings stay in this browser', async ({ page }) => {
  await openTool(page);
  await page.locator('.fb-settings summary').click();
  await page.fill('#angleInput', '50');
  await page.locator('#angleInput').press('Tab');
  await page.check('#showEvidence');
  await page.uncheck('#colorsOn');
  await expect.poll(() => page.evaluate(() => window.FishboneDiagram.getBoard().settings.angle)).toBe(50);
  await page.waitForTimeout(400);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROJECTS_KEY);
  const draft = stored.projects[0].draft;
  expect(draft.settings).toEqual({ angle: 50, wrap: 26, showEmpty: true });
  expect(JSON.stringify(draft)).not.toContain('showEvidence');
  const viewer = await page.evaluate(() => JSON.parse(localStorage.getItem('fishboneDiagram.viewer.v1')));
  expect(viewer).toMatchObject({ showEvidence: true, colors: false });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(window.FishboneDiagram) && window.FishboneDiagram.getBoard().settings.angle)).toBe(50);
  await expect(page.locator('#showEvidence')).toBeChecked();
  await expect(page.locator('#diagramHost .fb-evidence').first()).toBeVisible();
  // Colors off: no accent purple anywhere in the drawing.
  expect(await page.evaluate(() => document.querySelector('#diagramHost svg').outerHTML.includes('#c4b5fd'))).toBe(false);
});

test('the diagram follows the theme', async ({ page }) => {
  await openTool(page);
  const bg = () => page.evaluate(() => document.querySelector('#diagramHost .fb-bg').getAttribute('fill'));
  await page.click('[data-theme-toggle="light"]');
  await expect.poll(bg).toBe('#ffffff');
  await page.click('[data-theme-toggle="dark"]');
  await expect.poll(bg).toBe('#0f172a');
});

for (const width of [375, 768, 1024, 1280, 1600]) {
  test(`no sideways page scroll at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openTool(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    if (width === 375) {
      await expect(page.locator('.fb-desktop-note')).toBeHidden();
      const small = await page.locator('.fb-btn:visible').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.id || e.textContent));
      expect(small).toEqual([]);
      // The frame scrolls on its own; the page does not.
      expect(await page.evaluate(() => { const f = document.getElementById('diagramFrame'); return f.scrollWidth > f.clientWidth; })).toBe(true);
    }
  });
}
