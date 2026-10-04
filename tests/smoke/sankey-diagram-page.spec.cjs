// Sankey diagram builder: renderer, export, the page, projects and node moving.
// The pure layers are in sankey-diagram.spec.cjs.
//
// The page runs script-src 'self' with no unsafe-eval, so page.waitForFunction
// is CSP-blocked and expect.poll is used instead.

const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly, expectContrastAA, readDownloadText } = require('./helpers.cjs');

const PAGE = '/tools/sankey-diagram.html';
const STORAGE_KEY = 'sankeyDiagram.projects.v1';

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.SankeyDiagram && window.SankeyDiagram.getModel()))).toBe(true);
}

const DRYER = [
  'Slurry [500] Dryer',
  'Hot air [800] Dryer',
  'Dryer [210] Powder',
  'Dryer [1030] Exhaust',
  'Exhaust [1018] Stack',
  'Exhaust [12] Cyclone fines'
].join('\n');

const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);

test.describe('renderer and export', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  const svgFor = (page, text, view = {}, palette = 'light', settings = {}) => page.evaluate(([t, v, p, s]) => {
    const S = window.SankeyDiagram;
    const m = S.buildModel(t, s);
    return S.serializeSvg(S.renderSankey(document, m, v, S.PALETTES[p]));
  }, [text, view, palette, settings]);

  test('one rectangle per node, one path per link, and a text alternative', async ({ page }) => {
    await page.selectOption('#presetSelect', 'dryer');
    const svg = page.locator('#diagramHost svg');
    await expect(svg.locator('rect.sankey-node')).toHaveCount(7);
    await expect(svg.locator('path.sankey-link')).toHaveCount(6);
    await expect(svg.locator('rect.sankey-stub')).toHaveCount(1);
    await expect(svg.locator(':scope > title')).toHaveText('Spray dryer, as measured');
    await expect(svg.locator(':scope > desc')).toContainText('7 nodes and 6 flows');
    await expect(svg.locator(':scope > desc')).toContainText('1 node does not balance');
    // Each mark explains itself on hover.
    await expect(svg.locator('rect.sankey-stub title')).toContainText('Dryer: 60 kg/h entered and is not accounted for leaving');
    await expect(svg.locator('path.sankey-link title').first()).toContainText('Slurry to Dryer: 500 kg/h');
  });

  test('a recycle is drawn as its own marked path and described', async ({ page }) => {
    await page.selectOption('#presetSelect', 'recycle');
    const svg = page.locator('#diagramHost svg');
    await expect(svg.locator('path.sankey-recycle')).toHaveCount(1);
    await expect(svg.locator('path.sankey-recycle title')).toContainText('Separator to Mixer (recycle): 30 kg/h');
    await expect(svg.locator(':scope > desc')).toContainText('1 recycle stream loops under the diagram');
    await expect(page.locator('#flowsTable tbody')).toContainText('Mixer (recycle)');
    await expect(page.locator('#warningList')).toContainText('Line 6: Separator to Mixer closes a loop');
    // The loop sits below every node.
    const lowestNode = await svg.locator('rect.sankey-node').evaluateAll((els) => Math.max(...els.map((e) => e.getBBox().y + e.getBBox().height)));
    const loop = await svg.locator('path.sankey-recycle').evaluate((el) => el.getBBox().y + el.getBBox().height);
    expect(loop).toBeGreaterThan(lowestNode + 20);
  });

  test('the exported file carries no CSS variable, style attribute, script or focus stop', async ({ page }) => {
    // A var() or a style attribute would render on the page and vanish in the file.
    for (const linkColor of ['source', 'target', 'gradient', 'neutral']) {
      const text = await svgFor(page, `${DRYER}\nExhaust [5] Dryer`, { linkColor, title: 'T', showLinkValues: true });
      expect(text.startsWith('<?xml')).toBe(true);
      expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect((text.match(/xmlns=/g) || []).length).toBe(1);
      expect(text).not.toContain('var(');
      expect(/ style=/.test(text)).toBe(false);
      expect(text).not.toContain('<script');
      expect(text).not.toContain('currentColor');
      expect(text).not.toContain('tabindex');
      expect(text).toContain('role="img"');
    }
    const gradient = await svgFor(page, DRYER, { linkColor: 'gradient' });
    expect((gradient.match(/<linearGradient/g) || []).length).toBe(6);
  });

  test('a node name is always text, whatever it contains', async ({ page }) => {
    const hostile = 'A <img src=x onerror=alert(1)> [5] "><script>window.__pwned=1</script>';
    await page.fill('#flowText', hostile);
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(2);
    expect(await page.locator('#diagramHost img, #diagramHost script, #flowsTable img, #balanceTable script').count()).toBe(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    await expect(page.locator('#flowsTable tbody th')).toHaveText('A <img src=x onerror=alert(1)>');
  });

  test('colors come from the palette for the theme, and an override wins', async ({ page }) => {
    const light = await svgFor(page, 'A [1] B\n: B #123456', {}, 'light');
    const dark = await svgFor(page, 'A [1] B\n: B #123456', {}, 'dark');
    expect(light).toContain('class="sankey-bg" width="960" height="540" fill="#ffffff"');
    expect(dark).toContain('fill="#18181b"');
    expect(light).toContain('fill="#2a78d6"');
    expect(dark).toContain('fill="#3987e5"');
    expect(light).toContain('fill="#123456"');

    const transparent = await svgFor(page, 'A [1] B', { background: false });
    expect(transparent).not.toContain('sankey-bg');
  });

  test('a node keeps its color when a flow is added after it', async ({ page }) => {
    const colors = (text) => page.evaluate((t) => {
      const S = window.SankeyDiagram;
      const m = S.buildModel(t);
      return Object.fromEntries(m.graph.nodes.map((n, i) => [n.name, S.nodeColors(m, S.PALETTES.light)[i]]));
    }, text);
    const before = await colors('A [5] B\nB [5] C');
    const after = await colors('A [5] B\nB [5] C\nA [2] D\nD [2] C');
    for (const name of ['A', 'B', 'C']) expect(after[name]).toBe(before[name]);
  });

  test('ink on each surface clears AA, since the diagram text never reaches the CSS', async ({ page }) => {
    const ratios = await page.evaluate(() => {
      const lum = (hex) => {
        const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      return Object.values(window.SankeyDiagram.PALETTES).flatMap((p) => [
        [`${p.name} ink`, ratio(p.ink, p.surface)],
        [`${p.name} secondary ink`, ratio(p.inkSecondary, p.surface)]
      ]);
    });
    for (const [name, value] of ratios) expect(value, name).toBeGreaterThanOrEqual(4.5);
  });

  test('labels in the two middle columns do not face each other', async ({ page }) => {
    // Flipping labels at the midline made neighboring columns write over one another.
    await page.selectOption('#presetSelect', 'recycle');
    const anchors = await page.locator('#diagramHost text.sankey-label').evaluateAll((els) =>
      els.map((e) => [e.querySelector('tspan').textContent, e.getAttribute('text-anchor')]));
    const by = Object.fromEntries(anchors);
    for (const name of ['Fresh feed', 'Mixer', 'Reactor', 'Separator']) expect(by[name], name).toBe('start');
    // Only a label that would run off the right edge flips.
    expect(by.Product).toBe('end');
  });

  test('annotations switch on and off', async ({ page }) => {
    await page.selectOption('#presetSelect', 'dryer');
    const labels = page.locator('#diagramHost g.sankey-labels');
    await expect(labels).toContainText('Missing outflow 60 kg/h');
    await expect(labels).toContainText('wall build-up was not weighed');
    await expect(labels).toContainText('1,300 kg/h');
    await expect(page.locator('#diagramHost g.sankey-link-labels')).toHaveCount(0);

    await page.uncheck('#showMissing');
    await expect(labels).not.toContainText('Missing outflow');
    await expect(page.locator('#diagramHost rect.sankey-stub')).toHaveCount(0);
    // The table still says so: hiding the annotation does not hide the finding.
    await expect(page.locator('#balanceTable tr.unbalanced .balance-status')).toContainText('Missing outflow 60 kg/h');

    await page.uncheck('#showValues');
    await expect(labels).not.toContainText('1,300');
    await page.check('#showPercent');
    await expect(labels).toContainText('100%');
    await page.check('#showLinkValues');
    await expect(page.locator('#diagramHost g.sankey-link-labels text').first()).toBeVisible();
  });

  test('pngSize reports the pixel size and refuses what a canvas cannot hold', async ({ page }) => {
    const sizes = await page.evaluate(() => {
      const S = window.SankeyDiagram;
      return [S.pngSize(960, 540, 1), S.pngSize(960, 540, 4), S.pngSize(2400, 1800, 8), S.pngSize(2400, 1800, 4)];
    });
    expect(sizes[0]).toEqual({ width: 960, height: 540, ok: true });
    expect(sizes[1]).toEqual({ width: 3840, height: 2160, ok: true });
    expect(sizes[2].ok).toBe(false);
    expect(sizes[3]).toEqual({ width: 9600, height: 7200, ok: false });
  });

  test('SVG download is a standalone file named after the title', async ({ page }) => {
    await page.selectOption('#presetSelect', 'dryer');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadSvg')]);
    expect(download.suggestedFilename()).toBe('spray-dryer-as-measured.svg');
    const text = await readDownloadText(download);
    expect(text).toContain('<svg');
    expect(text).toContain('Missing outflow 60 kg/h');
    expect(text).not.toContain('var(');
    expect(text).not.toContain('tabindex');
    await expect(page.locator('#exportStatus')).toHaveText('Saved spray-dryer-as-measured.svg');
  });

  test('PNG download comes out at the resolution chosen', async ({ page }) => {
    await page.locator('#advancedOptions > summary').click();
    const dims = async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPng')]);
      const buf = fs.readFileSync(await download.path());
      expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
      return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    };

    await expect(page.locator('#pngSizeNote')).toHaveText('The PNG will be 1920 x 1080 px.');
    expect(await dims()).toEqual([1920, 1080]);

    await page.selectOption('#pngScale', '1');
    expect(await dims()).toEqual([960, 540]);

    await page.selectOption('#pngScale', '4');
    await expect(page.locator('#pngSizeNote')).toHaveText('The PNG will be 3840 x 2160 px.');
    expect(await dims()).toEqual([3840, 2160]);
    await expect(page.locator('#exportStatus')).toContainText('3840 x 2160 px');
  });

  test('an export too large for a canvas says so instead of saving nothing', async ({ page }) => {
    await page.locator('#advancedOptions > summary').click();
    await page.fill('#diagramWidth', '2400');
    await page.fill('#diagramHeight', '1800');
    await page.selectOption('#pngScale', '8');
    await expect(page.locator('#pngSizeNote')).toContainText('larger than a browser canvas can hold');
    await page.click('#downloadPng');
    await expect(page.locator('#exportStatus')).toContainText('larger than a browser canvas can hold');
  });

  test('a transparent light export has no background and uses light-theme ink', async ({ page }) => {
    await page.locator('#advancedOptions > summary').click();
    await page.selectOption('#exportTheme', 'light');
    await page.check('#exportTransparent');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadSvg')]);
    const text = await readDownloadText(download);
    expect(text).not.toContain('sankey-bg');
    expect(text).toContain('fill="#0f172a"');
  });
});

test.describe('page', () => {
  test('loads cleanly and draws the first example', async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, PAGE);
    await expect(page.locator('#presetSelect')).toHaveValue('evaporator');
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(7);
    await expect(page.locator('#resultStatus')).toHaveText('Inputs 1,000 kg/h, outputs 1,000 kg/h. The balance closes exactly (tolerance 0.5%).');
    await expect(page.locator('#errorBox')).toBeHidden();
    await expect(page.locator('#warningBox')).toBeHidden();
  });

  test('the balance table states the finding in words beside the node name', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'dryer');
    await expect(page.locator('#resultStatus')).toHaveText(
      'Inputs 1,300 kg/h, outputs 1,240 kg/h. 60 kg/h more enters than leaves (4.6%), and 1 node does not balance at a 0.5% tolerance.'
    );
    const rows = page.locator('#balanceTable tbody tr');
    await expect(rows).toHaveCount(7);
    await expect(page.locator('#balanceTable tr.unbalanced')).toHaveCount(1);
    await expect(page.locator('#balanceTable tr.unbalanced')).toContainText('Dryer');
    await expect(page.locator('#balanceTable tr.unbalanced .balance-status')).toHaveText('Missing outflow 60 kg/h (4.6%)');
    await expect(rows.first().locator('.balance-status')).toHaveText('System input');
    await expect(page.locator('#totals')).toContainText('95%');
    await expect(page.locator('#totals')).toContainText('Tolerance used');
    await expect(page.locator('#flowsTable tbody tr')).toHaveCount(6);
  });

  test('the tolerance is on the main form, and a pass that leans on it is flagged', async ({ page }) => {
    await openTool(page);
    // Reachable without opening anything.
    await expect(page.locator('#tolerance')).toBeVisible();
    await expect(page.locator('#tolerance')).toHaveValue('0.5');
    await expect(page.locator('#toleranceHelp')).toContainText('The default is 0.5%');

    await page.selectOption('#presetSelect', 'dryer');
    await page.fill('#tolerance', '5');
    await expect(page.locator('#resultStatus')).toHaveText(
      'Inputs 1,300 kg/h, outputs 1,240 kg/h. The balance closes only within the 5% tolerance: the largest gap is 4.6%.'
    );
    await expect(page.locator('#diagramHost rect.sankey-stub')).toHaveCount(0);
    await expect(page.locator('#balanceTable tr.unbalanced')).toHaveCount(0);
    await expect(page.locator('#balanceTable tr.tolerated .balance-status')).toHaveText('Balances within tolerance, off by 60 kg/h (4.6%)');
    await expect(page.locator('#totals')).toContainText('5%');
  });

  test('a coerced amount is drawn and listed with the reading used', async ({ page }) => {
    await openTool(page);
    await page.fill('#flowText', 'A [1,5] B\nB [1,5] C');
    await expect(page.locator('#errorBox')).toBeHidden();
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(3);
    await expect(page.locator('#warningList li')).toHaveText([
      'Line 1: read "1,5" as 1.5 (the comma taken as a decimal point)',
      'Line 2: read "1,5" as 1.5 (the comma taken as a decimal point)'
    ]);
    await expect(page.locator('#totals')).toContainText('1.5');
  });

  test('an input error clears the diagram and tables, and a fix restores them', async ({ page }) => {
    await openTool(page);
    await page.fill('#flowText', 'A [10] B\nB [lots] C');
    await expect(page.locator('#errorBox')).toBeVisible();
    await expect(page.locator('#errorBox')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#errorList li')).toHaveText('Line 2: "lots" is not a number');
    // Nothing from the last valid diagram is left standing beside the error.
    await expect(page.locator('#diagramHost svg')).toHaveCount(0);
    await expect(page.locator('#balanceTable tbody tr')).toHaveCount(0);
    await expect(page.locator('#flowsTable tbody tr')).toHaveCount(0);
    await expect(page.locator('#totals')).toBeEmpty();
    await expect(page.locator('#resultStatus')).toBeEmpty();
    await expect(page.locator('#downloadSvg')).toBeDisabled();
    await expect(page.locator('#downloadPng')).toBeDisabled();

    await page.fill('#flowText', 'A [10] B\nB [10] C');
    await expect(page.locator('#errorBox')).toBeHidden();
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(3);
    await expect(page.locator('#downloadPng')).toBeEnabled();
  });

  test('warnings are listed without blocking the diagram', async ({ page }) => {
    await openTool(page);
    await page.fill('#flowText', 'A [10] B\nB [0] C\nB [10] D');
    await expect(page.locator('#warningBox')).toBeVisible();
    await expect(page.locator('#warningList')).toContainText('Line 2: B to C is zero and is not drawn');
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(3);
  });

  test('typing over an example releases it, and title and unit reach the diagram', async ({ page }) => {
    await openTool(page);
    await page.locator('#flowText').pressSequentially('\nCondensate [750] Drain');
    await expect(page.locator('#presetSelect')).toHaveValue('');
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(8);

    await page.fill('#titleInput', 'My plant');
    await page.fill('#unitInput', 't/d');
    await expect(page.locator('#diagramHost text.sankey-title')).toHaveText('My plant');
    await expect(page.locator('#diagramHost g.sankey-labels')).toContainText('1,000 t/d');
    await expect(page.locator('#resultStatus')).toContainText('t/d');
  });

  test('a select renders once, not once for input and again for change', async ({ page }) => {
    await openTool(page);
    await page.locator('#advancedOptions > summary').click();
    const count = () => page.evaluate(() => window.SankeyDiagram.getRenderCount());
    for (const [selector, value] of [['#align', 'left'], ['#linkColor', 'gradient'], ['#presetSelect', 'budget'], ['#decimals', '2']]) {
      const before = await count();
      await page.selectOption(selector, value);
      expect(await count() - before, selector).toBe(1);
    }
  });

  test('an out-of-range number is clamped and the field shows what was used', async ({ page }) => {
    await openTool(page);
    await page.locator('#advancedOptions > summary').click();
    await page.fill('#diagramWidth', '99999');
    await page.locator('#diagramWidth').blur();
    await expect(page.locator('#diagramWidth')).toHaveValue('2400');
    expect(await page.evaluate(() => window.SankeyDiagram.getModel().layout.options.width)).toBe(2400);
    await expect(page.locator('#diagramHost svg')).toHaveAttribute('viewBox', '0 0 2400 540');

    await page.fill('#tolerance', '-3');
    await page.locator('#tolerance').blur();
    await expect(page.locator('#tolerance')).toHaveValue('0');
    expect(await page.evaluate(() => window.SankeyDiagram.getModel().balance.tolerance)).toBe(0);

    await page.fill('#nodePadding', '');
    await page.locator('#nodePadding').blur();
    await expect(page.locator('#nodePadding')).toHaveValue('18');
  });

  test('the diagram follows the theme', async ({ page }) => {
    await openTool(page);
    await page.locator('[data-theme-toggle="light"]').click();
    await expect(page.locator('#diagramHost rect.sankey-bg')).toHaveAttribute('fill', '#ffffff');
    await page.locator('[data-theme-toggle="dark"]').click();
    await expect(page.locator('#diagramHost rect.sankey-bg')).toHaveAttribute('fill', '#18181b');
  });

  test('every control has an accessible name and the folds work from the keyboard', async ({ page }) => {
    await openTool(page);
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('main input, main select, main textarea, main button')]
      .filter((el) => !(el.labels && el.labels.length) && !el.getAttribute('aria-label') && !el.textContent.trim())
      .map((el) => el.id || el.outerHTML.slice(0, 60)));
    expect(unnamed).toEqual([]);

    await expect(page.locator('#diagramWidth')).toBeHidden();
    await page.locator('#advancedOptions > summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#diagramWidth')).toBeVisible();

    await expect(page.locator('#resultStatus')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#projectStatus')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#diagramScroll')).toHaveAttribute('tabindex', '0');
    for (const id of ['#downloadSvg', '#downloadPng', '#resetPositions', '#projectNew', '#projectDelete']) {
      expect((await page.locator(id).boundingBox()).height, id).toBeGreaterThanOrEqual(44);
    }
  });

  test('page text clears WCAG AA in both themes', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'energy');
    await expectContrastAA(
      page,
      '.panel-header p, .result-status, .helper-text, .input-group label, .check, thead th, tbody td, ' +
        '.totals dt, .syntax-list dd, .advanced h3, .warning-box li, .tool-btn:not(:disabled), .project-bar legend, .resize-note'
    );
  });

  test('no horizontal overflow from desktop down to a phone', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'dryer');
    for (const width of [1280, 1100, 900, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `at ${width}px`).toBeLessThanOrEqual(0);
    }
    // The status sits beside the node name, so the finding shows without scrolling the table.
    const status = await page.locator('#balanceTable tr.unbalanced .balance-status').boundingBox();
    expect(status.x + 40).toBeLessThan(375);
    // Once the columns stack the scope notice still comes first, then the diagram.
    const card = await page.locator('#scopeDisclaimer').boundingBox();
    const diagram = await page.locator('#diagramHost').boundingBox();
    const editor = await page.locator('#flowText').boundingBox();
    expect(card.y).toBeLessThan(diagram.y);
    expect(diagram.y).toBeLessThan(editor.y);
  });

  test('the strict CSP is not violated by anything the tool does', async ({ page }) => {
    const consoleHits = [];
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) consoleHits.push(m.text());
    });

    await openTool(page);
    for (const id of ['dryer', 'energy', 'recycle', 'budget']) await page.selectOption('#presetSelect', id);
    await page.locator('#advancedOptions > summary').click();
    await page.selectOption('#linkColor', 'gradient');
    await page.check('#showLinkValues');
    await page.locator('[data-theme-toggle="light"]').click();
    await page.locator('#diagramHost .sankey-node').first().focus();
    await page.keyboard.press('ArrowDown');
    await page.click('#projectNew');
    await page.fill('#flowText', 'A [3] B\nB [3] A');
    await page.click('#projectSave');
    await Promise.all([page.waitForEvent('download'), page.click('#downloadSvg')]);
    await Promise.all([page.waitForEvent('download'), page.click('#downloadPng')]);

    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(consoleHits).toEqual([]);
  });
});

test.describe('scope disclaimer', () => {
  test('is the shared card, above the tool, and reads while collapsed', async ({ page }) => {
    await openTool(page);
    const card = page.locator('#scopeDisclaimer');
    expect(await card.evaluate((el) => [el.tagName, el.className, el.open])).toEqual(['DETAILS', 'disclaimer-card', false]);
    const summary = card.locator('summary');
    await expect(summary).toContainText('Not a verified balance of mass, energy or money');
    await expect(summary).toContainText('a diagram that closes is not evidence that the numbers are right');

    const box = await card.boundingBox();
    const editor = await page.locator('#flowText').boundingBox();
    expect(box.y).toBeLessThan(editor.y);
    expect(box.y).toBeLessThan(700);

    // Keyboard operable through native details, with nothing to dismiss.
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(card.locator('.disclaimer-body')).toBeVisible();
  });

  test('names what is not checked and what it must not be used for', async ({ page }) => {
    await openTool(page);
    await page.locator('#scopeDisclaimer').evaluate((el) => { el.open = true; });
    const body = page.locator('#scopeDisclaimer .disclaimer-body');
    for (const phrase of [
      'Every amount is taken to be in the same unit',
      'Volumes and moles are not conserved',
      'A total balance can close while a component balance is badly wrong',
      'The check assumes steady state',
      'No error bars, no data reconciliation',
      'Loosen the tolerance far enough and anything balances',
      'Amounts with separators are coerced',
      'A recycle is chosen by typing order',
      'two wrong numbers can close a balance as neatly as two right ones',
      'Custody transfer, fiscal metering',
      'greenhouse-gas reporting',
      'Relief, flare, vent or containment loads',
      'kept in this browser\'s local storage',
      'not a backup'
    ]) {
      await expect(body, phrase).toContainText(phrase);
    }
  });

  test('a second notice sits beside the result for readers who never open the card', async ({ page }) => {
    await openTool(page);
    const note = page.locator('p.disclaimer');
    await expect(note).toHaveCount(1);
    await expect(note).toBeVisible();
    await expect(note).toContainText('checks only that they add up');
    await expect(note).toContainText('does not check that your amounts share a unit');
    await expect(note).toContainText('See the full disclaimer at the top of the page');
  });
});

test.describe('projects', () => {
  test('the store keeps a draft and a save point, and caps at ten', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const P = window.SankeyDiagram.projects;
      const store = P.emptyStore();
      const a = P.addProject(store, 'First', { text: 'A [1] B', fields: { unitInput: 'kg' } }, 1);
      const log = { dirty0: P.isDirty(a) };
      log.changed = P.setDraft(a, { text: 'A [2] B', fields: { unitInput: 'kg' } }, 2);
      log.same = P.setDraft(a, { text: 'A [2] B', fields: { unitInput: 'kg' } }, 3);
      log.dirty1 = P.isDirty(a);
      P.revertProject(a, 4);
      log.afterRevert = [a.draft.text, P.isDirty(a)];
      P.setDraft(a, { text: 'A [3] B', fields: {} }, 5);
      P.commitProject(a, 6);
      log.afterSave = [a.saved.text, P.isDirty(a)];
      for (let i = 0; i < 20; i++) P.addProject(store, P.nextName(store), { text: '', fields: {} }, 7);
      log.count = store.projects.length;
      log.full = P.isFull(store);
      log.eleventh = P.addProject(store, 'One more', { text: '', fields: {} }, 8);
      log.ids = new Set(store.projects.map((p) => p.id)).size;
      const before = store.activeId;
      P.removeProject(store, before);
      log.afterRemove = [store.projects.length, store.activeId !== before, Boolean(P.activeProject(store))];
      return log;
    });
    expect(out.dirty0).toBe(false);
    expect(out.changed).toBe(true);
    expect(out.same).toBe(false);
    expect(out.dirty1).toBe(true);
    expect(out.afterRevert).toEqual(['A [1] B', false]);
    expect(out.afterSave).toEqual(['A [3] B', false]);
    expect(out.count).toBe(10);
    expect(out.full).toBe(true);
    expect(out.eleventh).toBeNull();
    expect(out.ids).toBe(10);
    expect(out.afterRemove).toEqual([9, true, true]);
  });

  test('a stored value is never trusted: junk is rejected and a real store is trimmed', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const P = window.SankeyDiagram.projects;
      const fake = (value) => ({ getItem: () => value, setItem: () => {} });
      const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
      const many = { activeId: 'p3', projects: [] };
      for (let i = 1; i <= 14; i++) many.projects.push({ id: `p${i}`, name: `N${i}`, draft: { text: `T${i}`, fields: { a: 1, b: 'x', c: true, d: { nested: 1 } } } });
      many.projects.push({ id: 'p2', name: 'duplicate id' }, null, 'string', { name: 'no id' });
      const big = P.loadStore(fake(JSON.stringify(many)));
      return {
        missing: P.loadStore(fake(null)),
        notJson: P.loadStore(fake('{oops')).problem,
        wrongShape: P.loadStore(fake('{"projects":7}')).problem,
        array: P.loadStore(fake('[1,2]')).problem,
        unavailable: P.loadStore(throwing).problem,
        persistFails: P.persistStore(throwing, P.emptyStore()),
        count: big.store.projects.length,
        active: big.store.activeId,
        fields: big.store.projects[0].draft.fields,
        savedFallsBack: big.store.projects[0].saved.text,
        badActive: P.loadStore(fake(JSON.stringify({ activeId: 'nope', projects: [{ id: 'p1', name: '', draft: {} }] }))).store
      };
    });
    expect(out.missing).toEqual({ store: { version: 1, activeId: null, projects: [] }, problem: null });
    expect(out.notJson).toBe('corrupt');
    expect(out.wrongShape).toBe('corrupt');
    expect(out.array).toBe('corrupt');
    expect(out.unavailable).toBe('unavailable');
    expect(out.persistFails).toBe(false);
    expect(out.count).toBe(10);
    expect(out.active).toBe('p3');
    // Only strings and booleans survive as field values.
    expect(out.fields).toEqual({ b: 'x', c: true });
    expect(out.savedFallsBack).toBe('T1');
    expect(out.badActive.activeId).toBe('p1');
    expect(out.badActive.projects[0].name).toBe('Untitled');
  });

  test('edits survive a reload without saving', async ({ page }) => {
    await openTool(page);
    await page.fill('#flowText', 'Ore [80] Mill\nMill [80] Float');
    await page.fill('#titleInput', 'Concentrator');
    await page.fill('#unitInput', 't/h');
    await page.check('#showPercent');
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(3);
    await expect(page.locator('#projectStatus')).toContainText('Unsaved changes, kept automatically');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => Boolean(window.SankeyDiagram && window.SankeyDiagram.getModel()))).toBe(true);
    await expect(page.locator('#flowText')).toHaveValue('Ore [80] Mill\nMill [80] Float');
    await expect(page.locator('#titleInput')).toHaveValue('Concentrator');
    await expect(page.locator('#unitInput')).toHaveValue('t/h');
    await expect(page.locator('#showPercent')).toBeChecked();
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(3);
    // The example selector no longer claims text it did not load.
    await expect(page.locator('#presetSelect')).toHaveValue('');
    // Still unsaved after the reload: the save point is the original example.
    await expect(page.locator('#projectRevert')).toBeEnabled();
  });

  test('Save sets the point that Revert returns to', async ({ page }) => {
    await openTool(page);
    await expect(page.locator('#projectStatus')).toContainText('Saved. 1 of 10 projects.');
    await expect(page.locator('#projectSave')).toBeDisabled();
    await expect(page.locator('#projectRevert')).toBeDisabled();

    await page.fill('#flowText', 'A [10] B');
    await page.fill('#unitInput', 'mol');
    await expect(page.locator('#projectSave')).toBeEnabled();
    await page.click('#projectSave');
    await expect(page.locator('#projectStatus')).toContainText('Saved.');
    await expect(page.locator('#projectRevert')).toBeDisabled();

    await page.fill('#flowText', 'A [10] B\nB [4] C');
    await page.fill('#unitInput', 'kg');
    await page.locator('#advancedOptions > summary').click();
    await page.selectOption('#linkColor', 'neutral');
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(3);
    await expect(page.locator('#projectRevert')).toBeEnabled();

    await page.click('#projectRevert');
    // Text, fields and the diagram all go back together.
    await expect(page.locator('#flowText')).toHaveValue('A [10] B');
    await expect(page.locator('#unitInput')).toHaveValue('mol');
    await expect(page.locator('#linkColor')).toHaveValue('source');
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(2);
    await expect(page.locator('#projectRevert')).toBeDisabled();
    expect((await stored(page)).projects[0].draft.text).toBe('A [10] B');
  });

  test('projects are separate, switch cleanly, and stop at ten', async ({ page }) => {
    await openTool(page);
    await page.click('#projectNew');
    await expect(page.locator('#projectSelect option')).toHaveCount(2);
    await expect(page.locator('#projectName')).toHaveValue('Project 2');
    await expect(page.locator('#flowText')).toHaveValue(/Feed \[100\] Process/);
    await expect(page.locator('#titleInput')).toHaveValue('');
    await page.fill('#flowText', 'X [5] Y');
    await page.fill('#projectName', 'Pilot plant');
    await expect(page.locator('#projectSelect option:checked')).toHaveText('Pilot plant');

    // Back to the first: its own text and title, untouched.
    await page.selectOption('#projectSelect', { label: 'Project 1' });
    await expect(page.locator('#flowText')).toHaveValue(/Dilute feed \[1000\] Effect 1/);
    await expect(page.locator('#titleInput')).toHaveValue('Two-effect evaporator, mass basis');
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(7);
    await page.selectOption('#projectSelect', { label: 'Pilot plant' });
    await expect(page.locator('#flowText')).toHaveValue('X [5] Y');

    for (let i = 0; i < 8; i++) await page.click('#projectNew');
    await expect(page.locator('#projectSelect option')).toHaveCount(10);
    await expect(page.locator('#projectNew')).toBeDisabled();
    await expect(page.locator('#projectStatus')).toContainText('10 of 10 projects.');
    const store = await stored(page);
    expect(store.projects).toHaveLength(10);
    expect(new Set(store.projects.map((p) => p.name)).size).toBe(10);
  });

  test('Delete takes two clicks, and deleting the last project leaves a fresh one', async ({ page }) => {
    await openTool(page);
    await page.click('#projectNew');
    await expect(page.locator('#projectSelect option')).toHaveCount(2);

    await page.click('#projectDelete');
    await expect(page.locator('#projectDelete')).toHaveText('Confirm delete');
    await expect(page.locator('#projectSelect option')).toHaveCount(2);
    // Doing anything else stands the button down.
    await page.selectOption('#projectSelect', { label: 'Project 1' });
    await expect(page.locator('#projectDelete')).toHaveText('Delete');

    await page.click('#projectDelete');
    await page.click('#projectDelete');
    await expect(page.locator('#projectSelect option')).toHaveCount(1);
    await expect(page.locator('#projectName')).toHaveValue('Project 2');

    await page.click('#projectDelete');
    await page.click('#projectDelete');
    await expect(page.locator('#projectSelect option')).toHaveCount(1);
    await expect(page.locator('#flowText')).toHaveValue(/Feed \[100\] Process/);
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(3);
  });

  test('corrupt storage is reset with a message, not a broken page', async ({ page }) => {
    await page.addInitScript((key) => { localStorage.setItem(key, '{"projects": "nope"'); }, STORAGE_KEY);
    await openTool(page);
    await expect(page.locator('#projectStatus')).toContainText('Stored projects could not be read and were reset');
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(7);
    expect((await stored(page)).projects).toHaveLength(1);
  });

  test('with storage blocked the tool still works and says nothing is kept', async ({ page }) => {
    // Only this tool's key is refused. shared.js reads its theme key with no
    // guard, so refusing everything fails in code this spec does not own.
    await page.addInitScript((key) => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      const deny = () => { throw new DOMException('denied', 'SecurityError'); };
      Storage.prototype.getItem = function (k) { return k === key ? deny() : get.call(this, k); };
      Storage.prototype.setItem = function (k, v) { return k === key ? deny() : set.call(this, k, v); };
    }, STORAGE_KEY);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => Boolean(window.SankeyDiagram && window.SankeyDiagram.getModel()))).toBe(true);
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(7);
    await expect(page.locator('#projectStatus')).toContainText('not allowing storage');
    await page.fill('#flowText', 'A [1] B');
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(2);
    await page.click('#projectNew');
    await expect(page.locator('#projectSelect option')).toHaveCount(2);
    expect(errors).toEqual([]);
  });
});

test.describe('moving nodes', () => {
  const nodeBox = (page, name) => page.evaluate((n) => {
    const m = window.SankeyDiagram.getModel();
    const node = m.layout.nodes.find((x) => x.name === n);
    return { index: node.index, x0: node.x0, y0: node.y0, pinned: node.pinned, ky: m.layout.ky };
  }, name);

  test('dragging a node moves it, writes one line into the flow list, and leaves the scale alone', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'dryer');
    const before = await nodeBox(page, 'Powder');
    expect(before.pinned).toBe(false);
    await expect(page.locator('#resetPositions')).toBeDisabled();

    const el = page.locator(`#diagramHost .sankey-node[data-node="${before.index}"]`);
    // The mouse works in viewport coordinates, so the node has to be on screen.
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 150, box.y - 60, { steps: 10 });
    await page.mouse.up();

    const after = await nodeBox(page, 'Powder');
    expect(after.pinned).toBe(true);
    expect(after.x0).toBeLessThan(before.x0 - 100);
    expect(after.y0).toBeLessThan(before.y0 - 30);
    expect(after.ky).toBe(before.ky);

    const text = await page.inputValue('#flowText');
    expect(text.split('\n').filter((l) => l.startsWith('~'))).toHaveLength(1);
    expect(/^~ Powder: [\d.]+, [\d.]+$/m.test(text)).toBe(true);
    await expect(page.locator('#resetPositions')).toBeEnabled();
    // The moved node keeps focus, so the keyboard can carry on from the drag.
    expect(await page.evaluate(() => document.activeElement.getAttribute('data-node'))).toBe(String(before.index));
    // And the move is part of the project.
    expect((await stored(page)).projects[0].draft.text).toContain('~ Powder:');

    await page.click('#resetPositions');
    expect(await page.inputValue('#flowText')).not.toContain('~');
    const reset = await nodeBox(page, 'Powder');
    expect(reset.pinned).toBe(false);
    expect(reset.x0).toBeCloseTo(before.x0, 6);
    expect(reset.y0).toBeCloseTo(before.y0, 6);
  });

  test('a hairline node is grabbed by the area around it and by its label, and neither reaches the export', async ({ page }) => {
    await openTool(page);
    await page.fill('#flowText', 'Web Apply [993] Ghosted\nWeb Apply [10] Phone Screen\nPhone Screen [2] Scam\nPhone Screen [8] Ghosted\n');
    await expect.poll(() => page.evaluate(() => window.SankeyDiagram.getModel().layout.nodes.length)).toBe(4);
    await expect(page.locator('#diagramHost .sankey-node-hit')).toHaveCount(4);

    // Scam is about a pixel tall. The press lands just above it, on nothing visible.
    const scam = await nodeBox(page, 'Scam');
    const el = page.locator(`#diagramHost .sankey-node[data-node="${scam.index}"]`);
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    expect(box.height).toBeLessThan(3);
    await page.mouse.move(box.x + box.width / 2, box.y - 4);
    await page.mouse.down();
    await page.mouse.move(box.x - 120, box.y - 80, { steps: 8 });
    await page.mouse.up();
    expect((await nodeBox(page, 'Scam')).pinned).toBe(true);

    const screen = await nodeBox(page, 'Phone Screen');
    const label = await page.locator(`#diagramHost .sankey-label[data-node="${screen.index}"]`).boundingBox();
    await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2);
    await page.mouse.down();
    await page.mouse.move(label.x + label.width / 2 + 60, label.y - 70, { steps: 8 });
    await page.mouse.up();
    expect((await nodeBox(page, 'Phone Screen')).pinned).toBe(true);
    expect((await page.inputValue('#flowText')).split('\n').filter((l) => l.startsWith('~'))).toHaveLength(2);

    const exported = await page.evaluate(() => {
      const S = window.SankeyDiagram;
      return S.renderSankey(document, S.getModel(), {}, S.PALETTES.light).querySelectorAll('.sankey-node-hit').length;
    });
    expect(exported).toBe(0);
  });

  test('the order of smaller flows is a setting, kept with the project', async ({ page }) => {
    await openTool(page);
    await page.fill('#flowText', 'Web Apply [993] Ghosted\nWeb Apply [10] Phone Screen\nPhone Screen [10] Ghosted\n');
    await expect.poll(() => page.evaluate(() => window.SankeyDiagram.getModel().layout.nodes.length)).toBe(3);
    const gap = () => page.evaluate(() => {
      const m = window.SankeyDiagram.getModel();
      return m.layout.nodes[2].y0 - m.layout.links[0].waypoints[0].y0;
    });
    expect(await gap()).toBeGreaterThan(0);
    await page.locator('#advancedOptions > summary').click();
    await page.selectOption('#order', 'up');
    expect(await gap()).toBeLessThan(0);
    await page.reload();
    await expect(page.locator('#order')).toHaveValue('up');
    await expect.poll(gap).toBeLessThan(0);
  });

  test('a click that does not move is not a drag', async ({ page }) => {
    await openTool(page);
    const el = page.locator('#diagramHost .sankey-node').first();
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2 + 1);
    await page.mouse.up();
    expect(await page.inputValue('#flowText')).not.toContain('~');
  });

  test('arrow keys move a focused node, Shift moves further, and Delete releases it', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'dryer');
    const start = await nodeBox(page, 'Exhaust');
    const el = () => page.locator(`#diagramHost .sankey-node[data-node="${start.index}"]`);
    await expect(el()).toHaveAttribute('aria-label', /Exhaust: in 1,030 kg\/h, out 1,030 kg\/h\. Drag, or use the arrow keys/);
    await el().focus();

    const position = () => page.evaluate(() => window.SankeyDiagram.getModel().parsed.positions.Exhaust);
    await page.keyboard.press('ArrowRight');
    const first = await position();
    await page.keyboard.press('ArrowRight');
    const second = await position();
    expect(second.x - first.x).toBeCloseTo(2, 5);
    expect(second.y).toBeCloseTo(first.y, 5);
    await page.keyboard.press('Shift+ArrowUp');
    const third = await position();
    expect(second.y - third.y).toBeCloseTo(Math.min(10, second.y), 5);
    // Focus follows the node through every redraw.
    expect(await page.evaluate(() => document.activeElement.getAttribute('data-node'))).toBe(String(start.index));
    await expect(el()).toHaveAttribute('aria-label', /Delete returns it to its automatic place/);

    await page.keyboard.press('Delete');
    expect(await page.inputValue('#flowText')).not.toContain('~');
    const end = await nodeBox(page, 'Exhaust');
    expect([end.x0, end.y0]).toEqual([start.x0, start.y0]);
  });

  test('a position typed by hand is honoured, and one out of range is refused by line', async ({ page }) => {
    await openTool(page);
    await page.fill('#flowText', `${DRYER}\n~ Stack: 50, 0`);
    await expect(page.locator('#resetPositions')).toBeEnabled();
    const stack = await nodeBox(page, 'Stack');
    const area = await page.evaluate(() => window.SankeyDiagram.getModel().layout.area);
    expect(stack.pinned).toBe(true);
    expect(stack.y0).toBeCloseTo(area.top, 6);
    expect(stack.x0).toBeCloseTo((area.xMin + area.xMax) / 2, 6);

    await page.fill('#flowText', `${DRYER}\n~ Stack: 150, 0`);
    await expect(page.locator('#errorList li')).toHaveText(/^Line 7: a position is two percentages from 0 to 100/);
  });
});

test.describe('crowded labels', () => {
  const BUSY = [
    'Web Apply [552] Ghosted', 'Web Apply [9] Phone Screen', 'Automated Apply [715] Ghosted',
    'Automated Apply [1] Phone Screen', 'Phone Screen [2] Scam', 'Phone Screen [7] Ghosted',
    'Phone Screen [1] Light Technical', 'Light Technical [1] Fumbled SQL', 'LinkedIn Message [1] Phone Screen',
    'Phone Screen [1] Technical 1', 'Technical 1 [1] Technical 2', 'Technical 2 [1] Panel Interview',
    'Panel Interview [1] Lack Domain Exp.'
  ].join('\n');

  // Draws into the page so the boxes are the real, measured ones.
  const measure = (page, text, view = {}) => page.evaluate(async ([t, v]) => {
    await document.fonts.ready;
    const S = window.SankeyDiagram;
    const m = S.buildModel(t, { title: v.title || '' });
    const svg = S.renderSankey(document, m, { showValues: true, ...v }, S.PALETTES.light);
    document.body.appendChild(svg);
    const box = (el) => { const b = el.getBBox(); return { x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height, node: el.getAttribute('data-node') }; };
    const labels = [...svg.querySelectorAll('.sankey-label')].map(box);
    const nodes = [...svg.querySelectorAll('rect.sankey-node')].map(box);
    const hit = (a, b) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
    const clashes = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) if (hit(labels[i], labels[j])) clashes.push(`labels ${labels[i].node} and ${labels[j].node}`);
      for (const n of nodes) if (n.node !== labels[i].node && hit(labels[i], n)) clashes.push(`label ${labels[i].node} on node ${n.node}`);
      if (labels[i].x0 < 0 || labels[i].x1 > m.layout.options.width || labels[i].y0 < 0 || labels[i].y1 > m.layout.options.height) clashes.push(`label ${labels[i].node} off the diagram`);
    }
    const foot = svg.querySelector('.sankey-footnote');
    const title = svg.querySelector('.sankey-title');
    for (const fixed of [foot, title].filter(Boolean).map(box)) {
      for (const l of labels) if (hit(l, fixed)) clashes.push(`label ${l.node} on the title or footnote`);
    }
    const leaders = svg.querySelectorAll('.sankey-leader').length;
    svg.remove();
    return { clashes, leaders, labels: labels.length };
  }, [text, view]);

  test('labels on a busy diagram never print over each other, a node, the title or the footnote', async ({ page }) => {
    await openTool(page);
    const busy = await measure(page, BUSY, { title: 'Job search', unit: 'applications' });
    expect(busy.labels).toBe(12);
    expect(busy.clashes).toEqual([]);
    // Something had to move off its own row here, and a leader says where it belongs.
    expect(busy.leaders).toBeGreaterThan(0);
  });

  test('an uncrowded diagram keeps every label beside its node, with no leader', async ({ page }) => {
    await openTool(page);
    for (const id of ['evaporator', 'dryer', 'energy', 'budget']) {
      const text = await page.evaluate((i) => window.SankeyDiagram.PRESETS.find((p) => p.id === i).text, id);
      const out = await measure(page, text, { unit: 'kg/h' });
      expect(out.clashes, id).toEqual([]);
      expect(out.leaders, id).toBe(0);
    }
  });
});

test.describe('width modes and the height bar', () => {
  const SKEWED = 'Web Apply [993] Ghosted\nWeb Apply [10] Phone Screen\nPhone Screen [2] Scam\nPhone Screen [8] Ghosted\n';
  const widths = (page) => page.evaluate(() => {
    const m = window.SankeyDiagram.getModel();
    return { widths: m.layout.links.map((l) => l.width), codes: m.warnings.map((w) => w.code), height: m.layout.options.height };
  });

  test('each width setting redraws, says on the diagram that it is not to scale, and is kept', async ({ page }) => {
    await openTool(page);
    await page.fill('#flowText', SKEWED);
    await expect.poll(async () => (await widths(page)).widths.length).toBe(4);
    const footnote = page.locator('#diagramHost .sankey-footnote');
    const scale = await widths(page);
    expect(scale.widths[0] / scale.widths[2]).toBeCloseTo(993 / 2, 6);
    await expect(footnote).toHaveText(/^Dashed lines are flows under 1 px/);

    await page.selectOption('#widthMode', 'equal');
    const equal = await widths(page);
    expect(new Set(equal.widths.map((w) => w.toFixed(6))).size).toBe(1);
    expect(equal.codes).toContain('NOT_TO_SCALE');
    await expect(footnote).toHaveText('Every flow is drawn the same width. Widths are not amounts.');
    await expect(page.locator('#warningList')).toContainText('Every flow is drawn the same width');
    await expect(page.locator('#diagramHost .sankey-hairline')).toHaveCount(0);
    // The numbers on the page are still the real ones.
    await expect(page.locator('#resultStatus')).toContainText('Inputs 1,003');
    await expect(page.locator('#diagramHost .sankey-label[data-node="0"]')).toContainText('1,003');

    await page.selectOption('#widthMode', 'root');
    const root = await widths(page);
    expect(root.widths[0] / root.widths[2]).toBeCloseTo(Math.sqrt(993 / 2), 6);
    await expect(footnote).toHaveText(/^Widths follow the square root of each amount/);

    await page.selectOption('#widthMode', 'scale');
    await page.fill('#minLinkWidth', '4');
    await expect.poll(async () => (await widths(page)).codes.includes('WIDENED')).toBe(true);
    expect(Math.min(...(await widths(page)).widths)).toBeCloseTo(4, 9);
    await expect(footnote).toHaveText('Flows under 4 px are drawn 4 px wide, not to scale.');
    await expect(page.locator('#warningList')).toContainText('2 of 4 flow(s) are drawn at the 4 px minimum');

    // Out of range is clamped and written back, like every other number here.
    await page.fill('#minLinkWidth', '40');
    await page.locator('#minLinkWidth').blur();
    await expect(page.locator('#minLinkWidth')).toHaveValue('12');

    await page.selectOption('#widthMode', 'equal');
    await page.reload();
    await expect(page.locator('#widthMode')).toHaveValue('equal');
    await expect(page.locator('#minLinkWidth')).toHaveValue('12');
  });

  test('the bar under the diagram changes its height by keyboard and by drag', async ({ page }) => {
    await openTool(page);
    const bar = page.locator('#resizeBar');
    await expect(page.locator('#resizeNote')).toHaveText('960 x 540 px');
    await expect(bar).toHaveAttribute('aria-valuenow', '540');

    await bar.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#resizeNote')).toHaveText('960 x 560 px');
    await page.keyboard.press('Shift+ArrowDown');
    expect((await widths(page)).height).toBe(660);
    await page.keyboard.press('ArrowUp');
    await expect(bar).toHaveAttribute('aria-valuenow', '640');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowUp');
    await expect(page.locator('#resizeNote')).toHaveText('960 x 200 px');
    await page.locator('#advancedOptions > summary').click();
    await expect(page.locator('#diagramHeight')).toHaveValue('200');

    // A drag tracks the pointer: the shown diagram grows by what the mouse moved.
    await bar.scrollIntoViewIfNeeded();
    const svgBefore = await page.locator('#diagramHost svg').boundingBox();
    const box = await bar.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 150, { steps: 8 });
    await page.mouse.up();
    const svgAfter = await page.locator('#diagramHost svg').boundingBox();
    expect(Math.abs((svgAfter.height - svgBefore.height) - 150)).toBeLessThan(3);
    const stored1 = await stored(page);
    expect(Number(stored1.projects[0].draft.fields.diagramHeight)).toBeGreaterThan(300);
    expect((await widths(page)).height).toBe(Number(stored1.projects[0].draft.fields.diagramHeight));
  });
});

test.describe('project files', () => {
  test('a project file round-trips, and anything else is refused with a reason', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const P = window.SankeyDiagram.projects;
      const store = P.emptyStore();
      const project = P.addProject(store, 'Boiler house', { text: 'A [1] B', fields: { titleInput: 'Energy', showValues: true } }, 1);
      P.setDraft(project, { text: 'A [2] B', fields: { titleInput: 'Energy', showValues: false } }, 2);
      const file = P.projectToFile(project);
      const refuse = (text) => P.projectFromFile(text);
      return {
        parsed: JSON.parse(file),
        back: P.projectFromFile(file),
        notJson: refuse('A [1] B'),
        wrongFormat: refuse(JSON.stringify({ format: 'something-else', version: 1, state: { text: 'A [1] B' } })),
        newer: refuse(JSON.stringify({ format: P.FILE_FORMAT, version: 2, state: { text: 'A [1] B' } })),
        noText: refuse(JSON.stringify({ format: P.FILE_FORMAT, version: 1, state: { fields: {} } })),
        junk: P.projectFromFile(JSON.stringify({
          format: P.FILE_FORMAT, version: 1, name: { evil: true },
          state: { text: 'A [1] B', fields: { titleInput: 'ok', nested: { a: 1 }, count: 5 }, extra: 'dropped' }
        })),
        unique: [P.uniqueName(store, 'Fresh'), P.uniqueName(store, 'Boiler house')]
      };
    });
    expect(out.parsed.format).toBe('sankey-diagram-project');
    expect(out.parsed.version).toBe(1);
    // The file holds what is on screen, which is the draft, not the last save.
    expect(out.back).toEqual({ ok: true, name: 'Boiler house', state: { text: 'A [2] B', fields: { titleInput: 'Energy', showValues: false } } });
    for (const bad of [out.notJson, out.wrongFormat, out.newer, out.noText]) {
      expect(bad.ok).toBe(false);
      expect(bad.message.length).toBeGreaterThan(10);
    }
    expect(new Set([out.notJson, out.wrongFormat, out.newer, out.noText].map((b) => b.message)).size).toBe(4);
    expect(out.junk.state).toEqual({ text: 'A [1] B', fields: { titleInput: 'ok' } });
    expect(typeof out.junk.name).toBe('string');
    expect(out.unique).toEqual(['Fresh', 'Boiler house (2)']);
  });

  test('Export file saves the project and Import file adds it back as a new one', async ({ page }) => {
    await openTool(page);
    await page.fill('#projectName', 'Dryer trial');
    await page.fill('#flowText', DRYER);
    await page.fill('#titleInput', 'Spray dryer');
    await page.locator('#advancedOptions > summary').click();
    await page.selectOption('#order', 'up');

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#projectExport')]);
    expect(download.suggestedFilename()).toBe('dryer-trial.sankey.json');
    const text = await readDownloadText(download);
    const file = JSON.parse(text);
    expect(file.name).toBe('Dryer trial');
    expect(file.state.text).toBe(DRYER);
    expect(file.state.fields.order).toBe('up');

    // Change the original, then bring the file back: it arrives beside it, not over it.
    await page.fill('#flowText', 'A [1] B');
    await page.setInputFiles('#projectFile', { name: 'dryer-trial.sankey.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.locator('#projectFileStatus')).toContainText('Imported "Dryer trial (2)"');
    expect(await page.inputValue('#flowText')).toBe(DRYER);
    await expect(page.locator('#titleInput')).toHaveValue('Spray dryer');
    await expect(page.locator('#order')).toHaveValue('up');
    await expect(page.locator('#diagramHost rect.sankey-node')).toHaveCount(7);
    const store = await stored(page);
    expect(store.projects.map((p) => p.name)).toEqual(['Dryer trial', 'Dryer trial (2)']);
    expect(store.projects[0].draft.text).toBe('A [1] B');

    // The same file can be chosen again, and a file that is not a project changes nothing.
    await page.setInputFiles('#projectFile', { name: 'dryer-trial.sankey.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.locator('#projectFileStatus')).toContainText('Imported "Dryer trial (3)"');
    await page.setInputFiles('#projectFile', { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') });
    await expect(page.locator('#projectFileStatus')).toContainText('not a Sankey project');
    expect((await stored(page)).projects).toHaveLength(3);
    await page.setInputFiles('#projectFile', { name: 'big.json', mimeType: 'application/json', buffer: Buffer.alloc(400001, 32) });
    await expect(page.locator('#projectFileStatus')).toContainText('too large');
  });

  test('Import is off once ten projects are stored', async ({ page }) => {
    await openTool(page);
    for (let i = 0; i < 9; i++) await page.click('#projectNew');
    await expect(page.locator('#projectNew')).toBeDisabled();
    await expect(page.locator('#projectImport')).toBeDisabled();
    await expect(page.locator('#projectExport')).toBeEnabled();
  });
});

test.describe('font in the PNG', () => {
  test('a font carried inside the SVG is the one the PNG is drawn in', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(async () => {
      const S = window.SankeyDiagram;
      const font = await S.loadFontDataUrl();
      // A family name no machine has, so only the embedded face can change the pixels.
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60" viewBox="0 0 300 60"><defs><pattern id="p"/></defs>'
        + '<rect width="300" height="60" fill="#ffffff"/>'
        + '<text x="6" y="40" font-size="30" font-family="SankeyProbeFace, monospace" fill="#000000">Rag gain 0123</text></svg>';
      const pixels = async (text) => {
        const blob = await S.svgToPngBlob(text, 300, 60, 1);
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = 300; canvas.height = 60;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const data = ctx.getImageData(0, 0, 300, 60).data;
        let ink = 0;
        let hash = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 128) { ink += 1; hash = (hash * 31 + i) | 0; }
        }
        return { ink, hash };
      };
      const embedded = S.embedFont(svg, font, 'SankeyProbeFace');
      return {
        font: font ? font.slice(0, 29) : null,
        length: font ? font.length : 0,
        inDefs: embedded.includes('<defs><style>@font-face{font-family:\'SankeyProbeFace\''),
        untouched: S.embedFont(svg, null) === svg,
        plain: await pixels(svg),
        withFace: await pixels(embedded),
        again: await pixels(embedded)
      };
    });
    expect(out.font).toBe('data:font/woff2;base64,d09GMg');
    expect(out.length).toBeGreaterThan(20000);
    expect(out.inDefs).toBe(true);
    expect(out.untouched).toBe(true);
    expect(out.plain.ink).toBeGreaterThan(200);
    expect(out.withFace.ink).toBeGreaterThan(200);
    // Same text, different glyphs: the face inside the file was used.
    expect(out.withFace.hash).not.toBe(out.plain.hash);
    expect(out.again.hash).toBe(out.withFace.hash);
  });

  test('the vendored font is the file its license note says it is', async () => {
    const dir = require('node:path').join(__dirname, '..', '..', 'js', 'vendor', 'space_grotesk');
    const bytes = fs.readFileSync(require('node:path').join(dir, 'space-grotesk-latin.woff2'));
    const sha = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    expect(sha).toBe('0640890476fc1198ab4de571fb658de443c4d85b66466ec09534a8737ab1ce9d');
    expect(fs.readFileSync(require('node:path').join(dir, 'OFL.txt'), 'utf8')).toContain('SIL Open Font License, Version 1.1');
  });

  test('a PNG export says so when the font could not be read', async ({ page }) => {
    await page.route('**/space-grotesk-latin.woff2', (route) => route.abort());
    await openTool(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPng')]);
    expect(download.suggestedFilename()).toMatch(/[.]png$/);
    await expect(page.locator('#exportStatus')).toContainText('text is in your system font');
  });
});
