// Process flow mapper: renderer, result panels, the page, projects and export.
// The pure layers are in process-flow-mapper.spec.cjs.
//
// The page runs script-src 'self' with no unsafe-eval, so page.waitForFunction
// is CSP-blocked and expect.poll is used instead.

const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { expectPageToLoadCleanly, expectContrastAA, readDownloadText } = require('./helpers.cjs');

const PAGE = '/tools/process-flow-mapper.html';
const STORAGE_KEY = 'processFlowMapper.projects.v1';

async function openTool(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.ProcessFlowMapper && window.ProcessFlowMapper.getModel()))).toBe(true);
}

const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const stat = (page, key) => page.locator(`#headline [data-stat="${key}"] .stat-value`);
const steps = (page) => page.evaluate(() => window.ProcessFlowMapper.getModel().graph.nodes.length);

const LOOP = [
  'Ann: (Start) -> Work',
  'Ann: Work {1 h} -> Check?',
  'Bob: Check? {30 min, wait 2 h} -> pass 80%: (Done), again 20%: Work',
  'Bob: (Done)'
].join('\n');

// Typing is debounced, so wait for the redraw the new text causes.
async function type(page, text) {
  const before = await page.evaluate(() => window.ProcessFlowMapper.getRenderCount());
  await page.fill('#flowText', text);
  await expect.poll(() => page.evaluate(() => window.ProcessFlowMapper.getRenderCount())).toBeGreaterThan(before);
}

test.describe('result', () => {
  test('loads cleanly on the first example, with its lesson and its figures', async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, PAGE);
    await expect(page.locator('#presetSelect')).toHaveValue('purchase');
    await expect(page.locator('#presetLesson')).toContainText('Look at Efficiency');
    await expect(page.locator('#diagramHost .flow-step')).toHaveCount(8);
    await expect(stat(page, 'lead')).toHaveText('4.05 d');
    await expect(stat(page, 'touch')).toHaveText('59.6 min');
    await expect(stat(page, 'efficiency')).toHaveText('3.1%');
    await expect(stat(page, 'yield')).toHaveText('77%');
    await expect(stat(page, 'handoffs')).toHaveText('4.39');
    await expect(page.locator('#resultStatus')).toHaveText(
      'A unit of work takes 4.05 d on average, of which 59.6 min is work and 3.92 d is waiting. Rework adds 4.19 h. 77% of work gets through with no rework. A day is 8 h and a week 5 d.'
    );
    await expect(page.locator('#errorBox')).toBeHidden();
    await expect(page.locator('#warningList li')).toHaveCount(1);
    await expect(page.locator('#warningList')).toContainText('2 exits send work back');
  });

  test('every example loads, names what to look at, and shows the figure its lesson is about', async ({ page }) => {
    await openTool(page);
    const expected = {
      purchase: ['lead', '4.05 d'],
      lab: ['yield', '80%'],
      change: ['yield', '52%'],
      jobs: ['handoffs', '1'],
      order: ['efficiency', '6.9%'],
      incident: ['yield', '90%']
    };
    for (const [id, [key, value]] of Object.entries(expected)) {
      await page.selectOption('#presetSelect', id);
      await expect(stat(page, key), id).toHaveText(value);
      await expect(page.locator('#presetLesson'), id).toBeVisible();
      expect((await page.locator('#presetLesson').innerText()).length, id).toBeGreaterThan(60);
      await expect(page.locator('#errorBox'), id).toBeHidden();
      // The line under the title in the picture carries the same figures as the cards.
      const line = await page.locator('#diagramHost .flow-summary').textContent();
      for (const card of await page.locator('#headline .stat-value').allTextContents()) expect(line, id).toContain(card);
    }
    // The lab lesson says 1.25 passes, and the map says it on the steps inside the loop.
    await page.selectOption('#presetSelect', 'lab');
    await expect(page.locator('#diagramHost .flow-badge')).toHaveCount(3);
    await expect(page.locator('#diagramHost .flow-step', { hasText: 'Prepare sample' })).toContainText('x1.25');
    // The incident example's dead end is listed and shown as a place work stops.
    await page.selectOption('#presetSelect', 'incident');
    await expect(page.locator('#warningList')).toContainText('"Escalate to vendor" leads nowhere');
    await expect(page.locator('#endTable tbody tr.flagged')).toContainText('Escalate to vendor');
    await expect(page.locator('#endTable tbody tr.flagged')).toContainText('5.6%');
  });

  test('typing over an example releases it, and an input error clears the whole result', async ({ page }) => {
    await openTool(page);
    await type(page, LOOP);
    await expect(page.locator('#presetSelect')).toHaveValue('');
    await expect(page.locator('#presetLesson')).toBeHidden();
    await expect(stat(page, 'lead')).toHaveText('4.38 h');
    await expect(page.locator('#diagramHost .flow-step')).toHaveCount(4);

    await type(page, `${LOOP}\nBob: Check? -> Nowhere`);
    await expect(page.locator('#errorBox')).toBeVisible();
    await expect(page.locator('#errorList li')).toHaveText(/^Line 5: "Nowhere" is named as a next step but no line says which lane does it/);
    await expect(page.locator('#diagramHost svg')).toHaveCount(0);
    await expect(page.locator('#headline .stat')).toHaveCount(0);
    await expect(page.locator('#bars li')).toHaveCount(0);
    await expect(page.locator('#stepTable tbody tr')).toHaveCount(0);
    await expect(page.locator('#resultStatus')).toHaveText('');
    await expect(page.locator('#downloadSvg')).toBeDisabled();
    await expect(page.locator('#downloadPng')).toBeDisabled();

    await type(page, LOOP);
    await expect(page.locator('#errorBox')).toBeHidden();
    await expect(page.locator('#diagramHost .flow-step')).toHaveCount(4);
    await expect(page.locator('#downloadSvg')).toBeEnabled();
  });

  test('work that can never finish is drawn with no figures, and says why', async ({ page }) => {
    await openTool(page);
    await type(page, 'Ann: (Start) -> A\nAnn: A {1 h} -> 50%: (End), 50%: B\nAnn: B -> C\nAnn: C -> B\nAnn: (End)');
    await expect(page.locator('#diagramHost .flow-step')).toHaveCount(5);
    await expect(page.locator('#headline .stat')).toHaveCount(0);
    await expect(page.locator('#bars li')).toHaveCount(0);
    await expect(page.locator('#resultStatus')).toHaveText('No figures: some work can never finish');
    await expect(page.locator('#resultStatus')).toHaveClass(/withheld/);
    await expect(page.locator('#warningList li').first()).toContainText('once it reaches "B", "C" there is no way on to any end');
    await expect(page.locator('#diagramHost .flow-summary')).toHaveCount(0);
    await expect(page.locator('#diagramHost .flow-badge')).toHaveCount(0);
    // The steps are still listed, with the times as entered.
    await expect(page.locator('#stepTable tbody tr')).toHaveCount(5);
  });

  test('the bars rank steps by lead time and split waiting from working', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'order');
    const bars = page.locator('#bars .bar-button');
    await expect(bars).toHaveCount(5);
    await expect(bars.first()).toContainText('Book carrier');
    await expect(bars.first()).toContainText('63%');
    await expect(bars.first()).toContainText('1 d waiting');
    await expect(bars.first()).toContainText('4 min working');
    const widths = await page.evaluate(() => [...document.querySelectorAll('#bars .bar-row')].map((row) => ({
      wait: Number(row.querySelector('.bar-wait').getAttribute('width')),
      touch: Number(row.querySelector('.bar-touch').getAttribute('width')),
      touchX: Number(row.querySelector('.bar-touch').getAttribute('x'))
    })));
    // The largest fills the track, the rest are in proportion, and working starts where waiting ends.
    expect(widths[0].wait + widths[0].touch).toBeCloseTo(100, 6);
    for (const w of widths) expect(w.touchX).toBeCloseTo(w.wait, 9);
    for (let i = 1; i < widths.length; i++) expect(widths[i].wait + widths[i].touch).toBeLessThanOrEqual(widths[i - 1].wait + widths[i - 1].touch + 1e-9);
    expect(widths[0].touch / widths[0].wait).toBeCloseTo((4 / 60) / 8, 6);

    // With no times there is nothing to rank, and the panel says what to add.
    await type(page, 'Ann: (Start) -> Work\nAnn: Work -> (Done)\nAnn: (Done)');
    await expect(bars).toHaveCount(0);
    await expect(page.locator('#barsEmpty')).toBeVisible();
  });

  test('a bar finds its step on the map, and a step on the map marks its bar', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'order');
    const book = await page.evaluate(() => window.ProcessFlowMapper.getModel().graph.nodes.findIndex((n) => n.name === 'Book carrier'));
    const bar = page.locator(`#bars .bar-button[data-node="${book}"]`);
    const step = page.locator(`#diagramHost .flow-step[data-node="${book}"]`);
    await expect(bar).toHaveAttribute('aria-pressed', 'false');

    await bar.click();
    await expect(bar).toHaveAttribute('aria-pressed', 'true');
    await expect(step).toHaveClass(/picked/);
    await expect(page.locator('#diagramHost .flow-step.picked')).toHaveCount(1);
    // It stays picked across a redraw, and a second click lets go.
    await page.selectOption('#tint', 'touch');
    await expect(page.locator(`#diagramHost .flow-step[data-node="${book}"]`)).toHaveClass(/picked/);
    await bar.click();
    await expect(page.locator('#diagramHost .flow-step.picked')).toHaveCount(0);

    const pick = await page.evaluate(() => window.ProcessFlowMapper.getModel().graph.nodes.findIndex((n) => n.name === 'Pick items'));
    await page.locator(`#diagramHost .flow-step[data-node="${pick}"]`).click();
    await expect(page.locator(`#bars .bar-button[data-node="${pick}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(bar).toHaveAttribute('aria-pressed', 'false');
  });

  test('the tint follows the setting, and is never the only place the figure appears', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'order');
    const fills = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#diagramHost .flow-step')]
      .map((g) => [g.querySelector('.flow-step-label tspan').textContent, g.querySelector('.flow-step-shape').getAttribute('fill')])));
    const byLead = await fills();
    // Booking the carrier waits a day, so it is the darkest; picking is the longest job.
    expect(new Set(Object.values(byLead)).size).toBeGreaterThan(3);
    await page.selectOption('#tint', 'touch');
    const byTouch = await fills();
    expect(byTouch['Book carrier']).not.toBe(byLead['Book carrier']);
    const palette = await page.evaluate(() => {
      const S = window.ProcessFlowMapper;
      const p = S.PALETTES[document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'];
      return { box: p.box, full: S.mix(p.box, p.heat, p.heatMax) };
    });
    expect(byLead['Book carrier']).toBe(palette.full);
    expect(byTouch['Pick items']).toBe(palette.full);
    await page.selectOption('#tint', 'none');
    expect(new Set(Object.values(await fills()))).toEqual(new Set([palette.box]));
    await expect(page.locator('#diagramHost .flow-legend')).toHaveCount(0);

    // Whatever the tint, the share is printed on the step and in the table.
    await page.selectOption('#tint', 'lead');
    await expect(page.locator('#diagramHost .flow-step', { hasText: 'Book carrier' })).toContainText('63% of lead time');
    await expect(page.locator('#diagramHost .flow-legend')).toContainText('Share of lead time: less');
    await expect(page.locator('#stepTable tbody tr', { hasText: 'Book carrier' })).toContainText('63%');
  });

  test('the working day is a setting: preset hours, a custom figure, and both named in the result', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'order');
    await expect(stat(page, 'lead')).toHaveText('1.59 d');
    await expect(page.locator('#hoursCustomGroup')).toBeHidden();

    // "Wait 1 d" becomes 24 hours, so the same list is a longer wait in hours and under a day in days.
    await page.selectOption('#hoursPreset', '24');
    await expect(stat(page, 'lead')).toHaveText('1.2 d');
    await expect(page.locator('#resultStatus')).toContainText('A day is 24 h and a week 5 d.');
    await expect(page.locator('#diagramHost .flow-footnote')).toContainText('A day is 24 h, a week 5 d.');

    await page.selectOption('#hoursPreset', 'custom');
    await expect(page.locator('#hoursCustomGroup')).toBeVisible();
    await page.fill('#hoursCustom', '7.5');
    await expect(page.locator('#resultStatus')).toContainText('A day is 7.5 h');
    // Out of range is clamped and written back.
    await page.fill('#hoursCustom', '40');
    await page.locator('#hoursCustom').blur();
    await expect(page.locator('#hoursCustom')).toHaveValue('24');
    await page.fill('#daysPerWeek', '9');
    await page.locator('#daysPerWeek').blur();
    await expect(page.locator('#daysPerWeek')).toHaveValue('7');
    await expect(page.locator('#resultStatus')).toContainText('A day is 24 h and a week 7 d.');

    // The display unit changes how figures are written, not what they are.
    await page.selectOption('#hoursPreset', '8');
    await page.fill('#daysPerWeek', '5');
    await page.selectOption('#unit', 'h');
    await expect(stat(page, 'lead')).toHaveText('12.7 h');
    await page.selectOption('#unit', 'min');
    await expect(stat(page, 'touch')).toHaveText('53 min');
  });

  test('tables: lanes carry weekly work when arrivals are given, and phases appear only when there are some', async ({ page }) => {
    await openTool(page);
    await expect(page.locator('#laneTable thead th')).toHaveText(['Lane', 'Steps', 'Touch', 'Wait', 'Share of lead', 'Hands on', 'Receives', 'Work per week']);
    await expect(page.locator('#laneTable tbody tr', { hasText: 'Manager' })).toContainText('2.94 h');
    await expect(page.locator('#phaseBlock')).toBeVisible();
    await expect(page.locator('#phaseTable tbody tr')).toHaveCount(2);
    await expect(page.locator('#exitTable tbody tr.flagged')).toHaveCount(2);
    await expect(page.locator('#exitTable tbody tr.flagged').first()).toContainText('rework');

    await page.selectOption('#presetSelect', 'lab');
    await expect(page.locator('#laneTable thead th')).toHaveCount(7);
    await expect(page.locator('#phaseBlock')).toBeHidden();
    await expect(page.locator('#endTable tbody tr')).toHaveText([/\(Report issued\)\s*Reception\s*100%/]);
  });
});

test.describe('map and export', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('shapes, rework and labels are drawn as the text says', async ({ page }) => {
    const host = page.locator('#diagramHost');
    await expect(host.locator('.flow-step polygon')).toHaveCount(1);
    await expect(host.locator('.flow-lane')).toHaveCount(4);
    await expect(host.locator('.flow-phase-label')).toHaveText([/^Request\s+·\s+59%$/, /^Order\s+·\s+41%$/]);
    await expect(host.locator('path.flow-link')).toHaveCount(9);
    await expect(host.locator('path.flow-rework')).toHaveCount(2);
    await expect(host.locator('path.flow-rework').first()).toHaveAttribute('stroke-dasharray', '6 3');
    await expect(host.locator('.flow-link-label')).toHaveText(['yes 80%', 'no 5%', 'fix 15%', 'pass 90%', 'fail 10%']);
    await expect(host.locator('svg')).toHaveAttribute('role', 'group');
    await expect(host.locator('.flow-step').first()).toHaveAttribute('tabindex', '0');
    expect(await host.locator('svg desc').textContent()).toContain('8 steps in 4 lanes');
    // A note travels as the step's tooltip.
    await type(page, `${LOOP}\n@ Check?: second reviewer on Fridays`);
    expect(await host.locator('.flow-step', { hasText: 'Check?' }).locator('title').textContent()).toContain('second reviewer on Fridays');
  });

  test('exit labels can be switched off, which also gives their room back', async ({ page }) => {
    const width = () => page.evaluate(() => window.ProcessFlowMapper.getModel().layout.width);
    const before = await width();
    await page.uncheck('#showShares');
    await expect(page.locator('#diagramHost .flow-link-label')).toHaveCount(0);
    expect(await width()).toBeLessThan(before - 100);
    await page.uncheck('#showBadges');
    await expect(page.locator('#diagramHost .flow-badge')).toHaveCount(0);
  });

  test('drawn labels and step text keep clear of each other, measured on the real elements', async ({ page }) => {
    for (const id of ['purchase', 'lab', 'change', 'jobs', 'order', 'incident']) {
      await page.selectOption('#presetSelect', id);
      await page.locator('#advancedOptions').evaluate((d) => { d.open = true; });
      await page.selectOption('#zoom', '100');
      const clashes = await page.evaluate(async () => {
        await document.fonts.ready;
        const svg = document.querySelector('#diagramHost svg');
        const box = (el) => { const b = el.getBBox(); return { x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height, name: el.textContent.slice(0, 20) }; };
        const hit = (a, b) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
        const labels = [...svg.querySelectorAll('.flow-link-label')].map(box);
        const shapes = [...svg.querySelectorAll('.flow-step-shape')].map(box);
        const texts = [...svg.querySelectorAll('.flow-step')].map((g) => ({ text: box(g.querySelector('.flow-step-label')), shape: box(g.querySelector('.flow-step-shape')) }));
        const out = [];
        labels.forEach((l, i) => {
          for (const s of shapes) if (hit(l, s)) out.push(`label "${l.name}" on a step`);
          for (let j = i + 1; j < labels.length; j++) if (hit(l, labels[j])) out.push(`labels "${l.name}" and "${labels[j].name}"`);
          if (l.x0 < 0 || l.x1 > svg.viewBox.baseVal.width) out.push(`label "${l.name}" off the map`);
        });
        // Step text fits inside its own box.
        for (const t of texts) {
          if (t.text.x0 < t.shape.x0 - 0.5 || t.text.x1 > t.shape.x1 + 0.5 || t.text.y0 < t.shape.y0 - 0.5 || t.text.y1 > t.shape.y1 + 0.5) out.push(`text of "${t.text.name}" spills out of its step`);
        }
        return out;
      });
      expect(clashes, id).toEqual([]);
    }
  });

  test('the map is fitted to the panel down to a floor, or shown at a chosen size', async ({ page }) => {
    await page.selectOption('#presetSelect', 'change');
    const sizes = () => page.evaluate(() => {
      const svg = document.querySelector('#diagramHost svg');
      return {
        shown: Number(svg.getAttribute('width')), natural: window.ProcessFlowMapper.getModel().layout.width,
        room: document.getElementById('diagramScroll').clientWidth
      };
    });
    await expect(page.locator('#zoom')).toHaveValue('fit');
    const fit = await sizes();
    expect(fit.natural).toBeGreaterThan(fit.room);
    // Either it fits the panel exactly, or it stopped at 60% and the panel scrolls.
    const factor = fit.shown / fit.natural;
    expect(factor).toBeGreaterThanOrEqual(0.6 - 0.001);
    expect(fit.shown <= fit.room || Math.abs(factor - 0.6) < 0.002).toBe(true);

    await page.locator('#advancedOptions > summary').click();
    await page.selectOption('#zoom', '100');
    const full = await sizes();
    expect(full.shown).toBe(Math.floor(full.natural));
    await page.selectOption('#zoom', '50');
    expect((await sizes()).shown).toBe(Math.floor(full.natural * 0.5));
    // A zoom is not a redraw.
    const count = await page.evaluate(() => window.ProcessFlowMapper.getRenderCount());
    await page.selectOption('#zoom', '75');
    expect(await page.evaluate(() => window.ProcessFlowMapper.getRenderCount())).toBe(count);
  });

  test('the exported file carries no CSS variable, style attribute, script or focus stop, and a name stays text', async ({ page }) => {
    await type(page, 'Ann: (Start) -> <b>bold</b> & "quoted"\nAnn: <b>bold</b> & "quoted" {5 min} -> (Done)\nAnn: (Done)');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadSvg')]);
    expect(download.suggestedFilename()).toBe('purchase-request.svg');
    const text = await readDownloadText(download);
    expect(text.startsWith('<?xml')).toBe(true);
    expect(text).not.toContain('var(--');
    expect(text).not.toMatch(/\sstyle=/);
    expect(text).not.toContain('<script');
    expect(text).not.toContain('tabindex');
    expect(text).toContain('role="img"');
    expect(text).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(text).not.toContain('<b>');
    await expect(page.locator('#diagramHost b')).toHaveCount(0);
    // The numbers travel with the picture.
    expect(text).toContain('Lead time 5 min');
  });

  test('PNG comes out at the resolution chosen, and an export too large for a canvas says so', async ({ page }) => {
    const natural = await page.evaluate(() => { const l = window.ProcessFlowMapper.getModel().layout; return [l.width, l.height]; });
    await page.locator('#advancedOptions > summary').click();
    for (const scale of [1, 2]) {
      await page.selectOption('#pngScale', String(scale));
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPng')]);
      const bytes = fs.readFileSync(await download.path());
      expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect(bytes.readUInt32BE(16)).toBe(Math.round(natural[0] * scale));
      expect(bytes.readUInt32BE(20)).toBe(Math.round(natural[1] * scale));
    }
    await expect(page.locator('#exportStatus')).toContainText('Saved purchase-request.png');
    await expect(page.locator('#pngSizeNote')).toContainText('so the PNG will be');

    await page.selectOption('#presetSelect', 'change');
    await page.selectOption('#pngScale', '8');
    await expect(page.locator('#pngSizeNote')).toContainText('The map is');
    const size = await page.evaluate(() => { const S = window.ProcessFlowMapper; const l = S.getModel().layout; return S.pngSize(l.width, l.height, 12); });
    expect(size.ok).toBe(false);
  });

  test('ink clears AA on each surface and on the darkest tint, since map text never reaches the CSS', async ({ page }) => {
    const ratios = await page.evaluate(() => {
      const S = window.ProcessFlowMapper;
      const lum = (hex) => {
        const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      return Object.values(S.PALETTES).flatMap((p) => [
        [`${p.name} ink on surface`, ratio(p.ink, p.surface)],
        [`${p.name} ink on band`, ratio(p.ink, p.band)],
        [`${p.name} ink on a plain step`, ratio(p.ink, p.box)],
        [`${p.name} ink on the darkest step`, ratio(p.ink, S.mix(p.box, p.heat, p.heatMax))],
        [`${p.name} secondary ink on surface`, ratio(p.inkSecondary, p.surface)],
        [`${p.name} rework label on surface`, ratio(p.rework, p.surface)],
        [`${p.name} rework label on band`, ratio(p.rework, p.band)],
        [`${p.name} badge`, ratio(p.surface, p.ink)]
      ]);
    });
    for (const [name, value] of ratios) expect(value, name).toBeGreaterThanOrEqual(4.5);
  });

  test('the map follows the theme', async ({ page }) => {
    await page.locator('[data-theme-toggle="light"]').click();
    await expect(page.locator('#diagramHost rect.flow-bg')).toHaveAttribute('fill', '#ffffff');
    await page.locator('[data-theme-toggle="dark"]').click();
    await expect(page.locator('#diagramHost rect.flow-bg')).toHaveAttribute('fill', '#18181b');
  });
});

test.describe('page', () => {
  test('every control has an accessible name, live regions are in place, and targets are big enough', async ({ page }) => {
    await openTool(page);
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('main input, main select, main textarea, main button')]
      .filter((el) => !(el.labels && el.labels.length) && !el.getAttribute('aria-label') && !el.textContent.trim())
      .map((el) => el.id || el.outerHTML.slice(0, 60)));
    expect(unnamed).toEqual([]);

    await expect(page.locator('#fontSize')).toBeHidden();
    await page.locator('#advancedOptions > summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#fontSize')).toBeVisible();
    await expect(page.locator('#resultStatus')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#projectStatus')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#diagramScroll')).toHaveAttribute('tabindex', '0');
    for (const id of ['#downloadSvg', '#downloadPng', '#projectNew', '#projectDelete', '#bars .bar-button']) {
      expect((await page.locator(id).first().boundingBox()).height, id).toBeGreaterThanOrEqual(44);
    }
    // A step can be reached and read from the keyboard.
    const label = await page.locator('#diagramHost .flow-step', { hasText: 'Approve?' }).getAttribute('aria-label');
    expect(label).toContain('Approve?, Manager');
    expect(label).toContain('of lead time');
  });

  test('a select renders once, not once for input and again for change', async ({ page }) => {
    await openTool(page);
    for (const [selector, value] of [['#tint', 'wait'], ['#unit', 'h'], ['#hoursPreset', '12'], ['#presetSelect', 'lab']]) {
      const before = await page.evaluate(() => window.ProcessFlowMapper.getRenderCount());
      await page.selectOption(selector, value);
      expect(await page.evaluate(() => window.ProcessFlowMapper.getRenderCount()) - before, selector).toBe(1);
    }
  });

  test('page text clears WCAG AA in both themes', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'incident');
    await expectContrastAA(
      page,
      '.panel-header p, .result-status, .helper-text, .input-group label, .check, thead th, tbody td, tbody th, .lesson, ' +
        '.stat-label, .stat-value, .stat-hint, .bar-name, .bar-share, .bar-detail, .syntax-list dd, .warning-box li, ' +
        '.tool-btn:not(:disabled), .project-bar legend'
    );
  });

  test('no horizontal overflow from desktop down to a phone, and the result leads once the columns stack', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'change');
    for (const width of [1280, 1100, 900, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `at ${width}px`).toBeLessThanOrEqual(0);
    }
    const card = await page.locator('#scopeDisclaimer').boundingBox();
    const headline = await page.locator('#headline').boundingBox();
    const editor = await page.locator('#flowText').boundingBox();
    expect(card.y).toBeLessThan(headline.y);
    expect(headline.y).toBeLessThan(editor.y);
    // All five figures are on the phone screen's width.
    for (const box of await page.locator('#headline .stat').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right))) expect(box).toBeLessThanOrEqual(375);
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
    for (const id of ['lab', 'change', 'jobs', 'order', 'incident']) await page.selectOption('#presetSelect', id);
    await page.locator('#advancedOptions > summary').click();
    await page.selectOption('#tint', 'passes');
    await page.selectOption('#zoom', '75');
    await page.selectOption('#hoursPreset', 'custom');
    await page.locator('[data-theme-toggle="light"]').click();
    await page.locator('#bars .bar-button').first().click();
    await page.locator('#diagramHost .flow-step').first().focus();
    await page.click('#projectNew');
    await type(page, LOOP);
    await page.click('#projectSave');
    await Promise.all([page.waitForEvent('download'), page.click('#projectExport')]);
    await Promise.all([page.waitForEvent('download'), page.click('#downloadSvg')]);
    await Promise.all([page.waitForEvent('download'), page.click('#downloadPng')]);

    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(consoleHits).toEqual([]);
  });
});

test.describe('scope disclaimer', () => {
  test('is the shared card, above the tool, and reads while collapsed', async ({ page }) => {
    await openTool(page);
    const card = page.locator('details.disclaimer-card#scopeDisclaimer');
    await expect(card).toHaveCount(1);
    await expect(card).not.toHaveAttribute('open', '');
    const summary = card.locator('summary');
    await expect(summary).toContainText('Averages only, not a forecast, a staffing plan or a promise date');
    await expect(summary).toContainText('Used at your own risk');
    const cardBox = await card.boundingBox();
    const editor = await page.locator('#flowText').boundingBox();
    expect(cardBox.y).toBeLessThan(editor.y);

    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(card).toHaveAttribute('open', '');
    await expect(card.locator('.disclaimer-footer')).toBeVisible();
  });

  test('names what is not modelled and what it must not be used for, with a second touchpoint by the result', async ({ page }) => {
    await openTool(page);
    const body = page.locator('#scopeDisclaimer .disclaimer-body');
    for (const phrase of [
      'A wait is an input',
      'Work done in parallel',
      'Capacity',
      'Queues, batching and priorities',
      'no percentiles',
      'Rework is chosen by typing order',
      'The tint is relative',
      'A delivery date, service level or turnaround',
      'Deciding how many people to hire',
      'not a backup',
      'Measure the waits instead of estimating them'
    ]) {
      expect(await body.textContent(), phrase).toContain(phrase);
    }
    const second = page.locator('.diagram-panel p.disclaimer');
    await expect(second).toHaveCount(1);
    await expect(second).toContainText('averages worked out from the times and percentages you typed');
    await expect(second).toContainText('work done in parallel is not modelled');
    await expect(second).toContainText('Used at your own risk');
  });
});

test.describe('projects', () => {
  test('edits survive a reload, Save and Revert mark and return, and switching keeps each project apart', async ({ page }) => {
    await openTool(page);
    await type(page, LOOP);
    await page.fill('#titleInput', 'Review loop');
    await page.selectOption('#hoursPreset', '12');
    await expect(page.locator('#projectStatus')).toContainText('Unsaved changes');
    await page.click('#projectSave');
    await expect(page.locator('#projectStatus')).toContainText('Saved.');
    await expect(page.locator('#projectSave')).toBeDisabled();

    await page.reload();
    await expect.poll(() => steps(page)).toBe(4);
    expect(await page.inputValue('#flowText')).toBe(LOOP);
    await expect(page.locator('#titleInput')).toHaveValue('Review loop');
    await expect(page.locator('#hoursPreset')).toHaveValue('12');
    await expect(page.locator('#presetSelect')).toHaveValue('');

    await type(page, `${LOOP}\nBob: Extra`);
    await expect(page.locator('#projectRevert')).toBeEnabled();
    await page.click('#projectRevert');
    expect(await page.inputValue('#flowText')).toBe(LOOP);

    await page.click('#projectNew');
    await expect(page.locator('#projectSelect option')).toHaveCount(2);
    await expect.poll(() => steps(page)).toBe(3);
    await expect(page.locator('#hoursPreset')).toHaveValue('8');
    // An edit made just before switching is not left behind by the typing debounce.
    await page.fill('#flowText', 'Ann: Solo');
    await page.selectOption('#projectSelect', 'p1');
    expect(await page.inputValue('#flowText')).toBe(LOOP);
    expect((await stored(page)).projects[1].draft.text).toBe('Ann: Solo');
  });

  test('Export file saves the project and Import file adds it back beside the original', async ({ page }) => {
    await openTool(page);
    await page.fill('#projectName', 'Review loop');
    await type(page, LOOP);
    await page.selectOption('#tint', 'passes');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#projectExport')]);
    expect(download.suggestedFilename()).toBe('review-loop.flowmap.json');
    const text = await readDownloadText(download);
    const file = JSON.parse(text);
    expect(file.format).toBe('process-flow-project');
    expect(file.state.text).toBe(LOOP);
    expect(file.state.fields.tint).toBe('passes');

    await type(page, 'Ann: Solo');
    await page.setInputFiles('#projectFile', { name: 'review-loop.flowmap.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.locator('#projectFileStatus')).toContainText('Imported "Review loop (2)"');
    expect(await page.inputValue('#flowText')).toBe(LOOP);
    await expect(page.locator('#tint')).toHaveValue('passes');
    const store = await stored(page);
    expect(store.projects.map((p) => p.name)).toEqual(['Review loop', 'Review loop (2)']);
    expect(store.projects[0].draft.text).toBe('Ann: Solo');

    // A Sankey project, or anything else, is refused and changes nothing.
    const sankey = JSON.stringify({ format: 'sankey-diagram-project', version: 1, name: 'x', state: { text: 'A [1] B', fields: {} } });
    await page.setInputFiles('#projectFile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(sankey) });
    await expect(page.locator('#projectFileStatus')).toContainText('not a process flow project');
    expect((await stored(page)).projects).toHaveLength(2);
  });

  test('stored junk is rejected, ten projects is the cap, and delete takes two clicks', async ({ page }) => {
    await page.addInitScript((key) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, '{"projects": "nope"}'); sessionStorage.setItem('seeded', '1'); } }, STORAGE_KEY);
    await openTool(page);
    await expect(page.locator('#projectStatus')).toContainText('could not be read and were reset');
    await expect(page.locator('#diagramHost .flow-step')).toHaveCount(8);

    for (let i = 0; i < 9; i++) await page.click('#projectNew');
    await expect(page.locator('#projectNew')).toBeDisabled();
    await expect(page.locator('#projectImport')).toBeDisabled();
    await expect(page.locator('#projectStatus')).toContainText('10 of 10 projects');

    await page.click('#projectDelete');
    await expect(page.locator('#projectDelete')).toHaveText('Confirm delete');
    await expect(page.locator('#projectSelect option')).toHaveCount(10);
    await page.click('#projectDelete');
    await expect(page.locator('#projectSelect option')).toHaveCount(9);
    await expect(page.locator('#projectNew')).toBeEnabled();
  });
});
