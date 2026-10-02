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
    await expect(page.locator('#diagramHost .flow-step')).toHaveCount(10);
    await expect(stat(page, 'lead')).toHaveText('4.09 d');
    await expect(stat(page, 'touch')).toHaveText('1 h');
    await expect(stat(page, 'efficiency')).toHaveText('3.1%');
    await expect(stat(page, 'yield')).toHaveText('79%');
    await expect(stat(page, 'handoffs')).toHaveText('3.14');
    await expect(stat(page, 'capacity')).toHaveText('40.8 / wk');
    await expect(page.locator('#resultStatus')).toHaveText(
      'A unit of work takes 4.09 d on average, of which 1 h is work and 3.97 d is waiting. Rework adds 3.21 h. 79% of work gets through with no rework. The process can carry about 40.8 a week, limited by Manager. A day is 8 h and a week 5 d.'
    );
    await expect(page.locator('#errorBox')).toBeHidden();
    await expect(page.locator('#warningList li')).toHaveCount(1);
    await expect(page.locator('#warningList')).toContainText('2 exits send work back');
    // Nothing has changed since the save, so nothing is compared.
    await expect(page.locator('#headline .stat-change')).toHaveCount(0);
    await expect(page.locator('#compareNote')).toBeHidden();
  });

  test('every example loads, names what to look at, and shows the figure its lesson is about', async ({ page }) => {
    await openTool(page);
    const expected = {
      purchase: ['efficiency', '3.1%'],
      lab: ['yield', '76%'],
      change: ['yield', '52%'],
      hiring: ['handoffs', '1.23'],
      order: ['capacity', '650 / wk'],
      incident: ['yield', '83%']
    };
    for (const [id, [key, value]] of Object.entries(expected)) {
      await page.selectOption('#presetSelect', id);
      await expect(stat(page, key), id).toHaveText(value);
      await expect(page.locator('#presetLesson'), id).toBeVisible();
      expect((await page.locator('#presetLesson').innerText()).length, id).toBeGreaterThan(60);
      await expect(page.locator('#errorBox'), id).toBeHidden();
      // An example replaces the process, so it is not compared with the last save.
      await expect(page.locator('#headline .stat-change'), id).toHaveCount(0);
      // The line under the title in the picture carries the same figures as the cards.
      const line = await page.locator('#diagramHost .flow-summary').textContent();
      for (const card of await page.locator('#headline .stat-value').allTextContents()) expect(line, id).toContain(card);
    }
    // The lab lesson says 1.25 passes, and the map says it on the steps inside the loop.
    await page.selectOption('#presetSelect', 'lab');
    await expect(page.locator('#diagramHost .flow-badge')).toHaveCount(5);
    await expect(page.locator('#diagramHost .flow-step', { hasText: 'Prepare sample' })).toContainText('x1.25');
    await expect(page.locator('#resultStatus')).toContainText('Rework adds 2.1 h');
    // The change lesson says drafting is done 1.9 times.
    await page.selectOption('#presetSelect', 'change');
    await expect(page.locator('#diagramHost .flow-step', { hasText: 'Draft change' })).toContainText('x1.9');
    // The hiring lesson says three in four stop at the first screen and two in a hundred are hired.
    await page.selectOption('#presetSelect', 'hiring');
    await expect(page.locator('#endTable tbody tr').first()).toHaveText(/\(Declined at application\)\s*75%\s*Recruiter/);
    await expect(page.locator('#endTable tbody tr', { hasText: '(Hired)' })).toContainText('2%');
    await expect(page.locator('#laneTable tbody tr', { hasText: 'Interview panel' })).toContainText('9 h');
    // The incident example's dead end is listed and shown as a place work stops.
    await page.selectOption('#presetSelect', 'incident');
    await expect(page.locator('#warningList')).toContainText('"Escalate to vendor" leads nowhere');
    await expect(page.locator('#endTable tbody tr.flagged')).toContainText('Escalate to vendor');
    await expect(page.locator('#endTable tbody tr.flagged')).toContainText('6%');
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
    await expect(bars).toHaveCount(8);
    await expect(bars.first()).toContainText('Book carrier');
    await expect(bars.first()).toContainText('52%');
    await expect(bars.first()).toContainText('1 d waiting');
    await expect(bars.first()).toContainText('4 min working');
    // The order in ten that waits for stock outranks picking, as the lesson says.
    await expect(bars.nth(1)).toContainText('Wait for stock');
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
    await expect(page.locator('#diagramHost .flow-step', { hasText: 'Book carrier' })).toContainText('52% of lead time');
    await expect(page.locator('#diagramHost .flow-legend')).toContainText('Share of lead time: less');
    await expect(page.locator('#stepTable tbody tr', { hasText: 'Book carrier' })).toContainText('52%');
  });

  test('the working day is a setting: preset hours, a custom figure, and both named in the result', async ({ page }) => {
    await openTool(page);
    await page.selectOption('#presetSelect', 'order');
    await expect(stat(page, 'lead')).toHaveText('1.93 d');
    await expect(stat(page, 'capacity')).toHaveText('650 / wk');
    await expect(page.locator('#hoursCustomGroup')).toBeHidden();

    // A day is now 24 hours: "wait 1 d" is three times as long, and people on duty have three times the hours.
    await page.selectOption('#hoursPreset', '24');
    await expect(stat(page, 'lead')).toHaveText('1.51 d');
    await expect(stat(page, 'capacity')).toHaveText('1,950 / wk');
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
    await expect(stat(page, 'lead')).toHaveText('15.4 h');
    await page.selectOption('#unit', 'min');
    await expect(stat(page, 'touch')).toHaveText('58.6 min');
  });

  test('tables: staffing and weekly work by lane, phases only when there are some, and who hands to whom', async ({ page }) => {
    await openTool(page);
    await expect(page.locator('#laneTable thead th')).toHaveText(
      ['Lane', 'Steps', 'Touch', 'Wait', 'Share of lead', 'Hands on', 'Receives', 'Work per week', 'Staff', 'Hours per week', 'Can carry', 'Busy']
    );
    const manager = page.locator('#laneTable tbody tr', { hasText: 'Manager' });
    await expect(manager).toContainText('2.94 h');
    await expect(manager).toContainText('1 @ 10%');
    await expect(manager).toContainText('4 h');
    await expect(manager).toContainText('40.8 / wk');
    await expect(manager).toContainText('74%');
    // The lane that limits the process is marked in the table and named on the card.
    await expect(manager).toHaveClass(/limit/);
    await expect(page.locator('#laneTable tbody tr.limit')).toHaveCount(1);
    await expect(page.locator('#headline [data-stat="capacity"] .stat-hint')).toHaveText('limited by Manager, 74% busy');
    await expect(page.locator('#diagramHost .flow-lane-label[data-lane="1"]')).toContainText('74% busy');

    await expect(page.locator('#phaseBlock')).toBeVisible();
    await expect(page.locator('#phaseTable tbody tr')).toHaveCount(3);
    await expect(page.locator('#exitTable tbody tr.flagged')).toHaveCount(2);
    await expect(page.locator('#exitTable tbody tr.flagged').first()).toContainText('rework');

    // Requester hands to Manager twice over one connector, Manager back once: rows hand on, columns receive.
    await expect(page.locator('#handoffTable thead th')).toHaveText(['Hands on to', 'Requester', 'Manager', 'Finance', 'Purchasing']);
    await expect(page.locator('#handoffTable tbody tr').first()).toHaveText(/^Requester\s*1\s*$/);
    await expect(page.locator('#handoffTable tbody tr').nth(1)).toHaveText(/^Manager\s*1\s*1\s*$/);

    // No staff line: no staffing columns and no capacity card. No phases: no phase table.
    await type(page, LOOP);
    await expect(page.locator('#laneTable thead th')).toHaveCount(7);
    await expect(page.locator('#headline .stat')).toHaveCount(5);
    await expect(page.locator('#phaseBlock')).toBeHidden();
    await expect(page.locator('#endTable tbody tr')).toHaveText([/\(Done\)\s*100%\s*Bob/]);
    await expect(page.locator('#diagramHost .flow-lane-busy')).toHaveCount(0);
    // A map inside one lane hands nothing on, so there is no handoff table to show.
    await type(page, 'Ann: (Start) -> Work\nAnn: Work -> (Done)\nAnn: (Done)');
    await expect(page.locator('#handoffBlock')).toBeHidden();
  });

  test('a lane with more work than hours is flagged on the map, in the table and in words', async ({ page }) => {
    await openTool(page);
    await type(page, (await page.inputValue('#flowText')).replace('arrivals: 30 / wk', 'arrivals: 60 / wk'));
    await expect(page.locator('#warningList')).toContainText('Manager cannot keep up: 5.88 h of work arrives each week and 4 h is available');
    await expect(page.locator('#warningList')).toContainText('lead time shown is too low');
    await expect(page.locator('#laneTable tbody tr.flagged')).toContainText('Manager');
    await expect(page.locator('#laneTable tbody tr.flagged')).toContainText('147%');
    await expect(page.locator('#diagramHost .flow-lane-label[data-lane="1"]')).toContainText('147%, over');
    // Capacity does not move with arrivals, and the lead time does not either: waits are inputs.
    await expect(stat(page, 'capacity')).toHaveText('40.8 / wk');
    await expect(stat(page, 'lead')).toHaveText('4.09 d');

    await page.selectOption('#presetSelect', 'order');
    await expect(page.locator('#warningList')).toContainText('Warehouse is 92% busy');
    await expect(page.locator('#laneTable tbody tr.flagged')).toHaveCount(0);
  });

  test('every headline figure is compared with the last save until it is saved or reverted', async ({ page }) => {
    await openTool(page);
    const original = await page.inputValue('#flowText');
    await type(page, original.replace('wait 2 d', 'wait 1 d').replace('Manager 1 @ 10%', 'Manager 2 @ 10%'));
    await expect(stat(page, 'lead')).toHaveText('2.92 d');
    await expect(page.locator('#headline [data-stat="lead"] .stat-change')).toHaveText('down from 4.09 d');
    await expect(page.locator('#headline [data-stat="efficiency"] .stat-change')).toHaveText('up from 3.1%');
    await expect(page.locator('#headline [data-stat="capacity"] .stat-change')).toHaveText('up from 40.8 / wk');
    // A figure that did not move says nothing.
    await expect(page.locator('#headline [data-stat="yield"] .stat-change')).toHaveCount(0);
    await expect(page.locator('#compareNote')).toBeVisible();

    await page.click('#projectSave');
    await expect(page.locator('#headline .stat-change')).toHaveCount(0);
    await expect(page.locator('#compareNote')).toBeHidden();

    await type(page, original);
    await expect(page.locator('#headline [data-stat="lead"] .stat-change')).toHaveText('up from 2.92 d');
    await page.click('#projectRevert');
    await expect(stat(page, 'lead')).toHaveText('2.92 d');
    await expect(page.locator('#headline .stat-change')).toHaveCount(0);

    // A setting counts as a change too.
    await page.selectOption('#hoursPreset', '24');
    await expect(page.locator('#headline [data-stat="capacity"] .stat-change')).toContainText('up from');
  });
});

test.describe('map and export', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); });

  test('shapes, rework and labels are drawn as the text says', async ({ page }) => {
    const host = page.locator('#diagramHost');
    await expect(host.locator('.flow-step polygon')).toHaveCount(3);
    await expect(host.locator('.flow-lane')).toHaveCount(4);
    await expect(host.locator('.flow-phase-label')).toHaveText([/^Request\s+·\s+59%$/, /^Funding\s+·\s+23%$/, /^Order\s+·\s+18%$/]);
    await expect(host.locator('path.flow-link')).toHaveCount(11);
    await expect(host.locator('path.flow-rework')).toHaveCount(2);
    await expect(host.locator('path.flow-rework').first()).toHaveAttribute('stroke-dasharray', '6 3');
    await expect(host.locator('.flow-link-label')).toHaveText(['yes 80%', 'no 5%', 'fix 15%', 'yes 90%', 'no 10%', 'yes 92%', 'no 8%']);
    await expect(host.locator('svg')).toHaveAttribute('role', 'group');
    await expect(host.locator('.flow-step').first()).toHaveAttribute('tabindex', '0');
    expect(await host.locator('svg desc').textContent()).toContain('10 steps in 4 lanes');
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
    for (const id of ['purchase', 'lab', 'change', 'hiring', 'order', 'incident']) {
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

    // A long process at 8x is wider than a canvas allows: the note says so before, and the export after.
    await page.selectOption('#presetSelect', 'change');
    await page.selectOption('#pngScale', '8');
    await expect(page.locator('#pngSizeNote')).toContainText('larger than a browser canvas can hold');
    await page.click('#downloadPng');
    await expect(page.locator('#exportStatus')).toContainText('larger than a browser canvas can hold');
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
    const label = await page.locator('#diagramHost .flow-step', { hasText: 'Approve request?' }).getAttribute('aria-label');
    expect(label).toContain('Approve request?, Manager');
    expect(label).toContain('hold Alt and press the up or down arrow');
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
    for (const id of ['lab', 'change', 'hiring', 'order', 'incident']) await page.selectOption('#presetSelect', id);
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
    await page.check('#wide');
    await Promise.all([page.waitForEvent('download'), page.locator('.csv-btn').first().click()]);
    await page.locator('#diagramHost .flow-step').nth(1).focus();
    await page.keyboard.press('Alt+ArrowDown');
    await Promise.all([page.waitForEvent('download'), page.click('#downloadSvg')]);
    await Promise.all([page.waitForEvent('download'), page.click('#downloadPng')]);

    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(consoleHits).toEqual([]);
  });
});

test.describe('moving, pasting and saving tables', () => {
  const lineOf = async (page, step) => (await page.inputValue('#flowText')).split('\n').filter((l) => l.replace(/^[^:]+: /, '').startsWith(step));
  const laneOf = (page, step) => page.evaluate((name) => {
    const m = window.ProcessFlowMapper.getModel();
    const node = m.graph.nodes.find((n) => n.name === name);
    return m.graph.lanes[node.lane].name;
  }, step);

  test('dragging a step onto another lane rewrites its line, and a plain click still only picks it', async ({ page }) => {
    await openTool(page);
    const index = await page.evaluate(() => window.ProcessFlowMapper.getModel().graph.nodes.findIndex((n) => n.name === 'Budget available?'));
    const step = page.locator(`#diagramHost .flow-step[data-node="${index}"]`);
    // The mouse works in viewport coordinates, so the step has to be on screen.
    await step.scrollIntoViewIfNeeded();
    const before = await page.inputValue('#flowText');

    await step.click();
    await expect(step).toHaveClass(/picked/);
    expect(await page.inputValue('#flowText')).toBe(before);

    const from = await step.boundingBox();
    const lane = await page.locator('#diagramHost .flow-lane[data-lane="1"]').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, lane.y + lane.height / 2, { steps: 8 });
    // While it is held over a lane, that lane is marked as where it will land.
    await expect(page.locator('#diagramHost .flow-lane.drop-target')).toHaveAttribute('data-lane', '1');
    await page.mouse.up();

    expect(await laneOf(page, 'Budget available?')).toBe('Manager');
    expect(await lineOf(page, 'Budget available?')).toEqual(['Manager: Budget available? {10 min, wait 1 d} -> yes 90%: Raise purchase order, no 10%: (No budget)']);
    await expect(page.locator('#diagramHost .flow-lane.drop-target')).toHaveCount(0);
    // The move is an edit like any other: the example is released and the project keeps it.
    await expect(page.locator('#presetSelect')).toHaveValue('');
    expect((await stored(page)).projects[0].draft.text).toContain('Manager: Budget available?');
    // Finance now has only its end left, and the manager has more to do.
    await expect(page.locator('#headline [data-stat="capacity"] .stat-change')).toContainText('down from 40.8 / wk');
    // Letting go outside every lane changes nothing.
    const moved = await page.inputValue('#flowText');
    const again = await page.locator(`#diagramHost .flow-step[data-node="${index}"]`).boundingBox();
    await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
    await page.mouse.down();
    await page.mouse.move(again.x + again.width / 2, again.y - 400, { steps: 6 });
    await page.mouse.up();
    expect(await page.inputValue('#flowText')).toBe(moved);
  });

  test('Alt and an arrow moves a focused step to the next lane and a focused lane up or down, and focus stays', async ({ page }) => {
    await openTool(page);
    const index = await page.evaluate(() => window.ProcessFlowMapper.getModel().graph.nodes.findIndex((n) => n.name === 'Fill in request'));
    await page.locator(`#diagramHost .flow-step[data-node="${index}"]`).focus();
    await page.keyboard.press('Alt+ArrowDown');
    expect(await laneOf(page, 'Fill in request')).toBe('Manager');
    expect(await page.evaluate(() => document.activeElement.getAttribute('data-node'))).toBe(String(index));
    await page.keyboard.press('Alt+ArrowDown');
    expect(await laneOf(page, 'Fill in request')).toBe('Finance');
    await page.keyboard.press('Alt+ArrowUp');
    await page.keyboard.press('Alt+ArrowUp');
    expect(await laneOf(page, 'Fill in request')).toBe('Requester');
    // Already in the top lane: nothing to do, and nothing breaks.
    const top = await page.inputValue('#flowText');
    await page.keyboard.press('Alt+ArrowUp');
    expect(await page.inputValue('#flowText')).toBe(top);
    // A plain arrow is not a move.
    await page.keyboard.press('ArrowDown');
    expect(await page.inputValue('#flowText')).toBe(top);

    await page.locator('#diagramHost .flow-lane-label[data-lane="0"]').focus();
    await page.keyboard.press('Alt+ArrowDown');
    expect((await page.inputValue('#flowText')).split('\n')[0]).toBe('lanes: Manager, Requester, Finance, Purchasing');
    expect(await page.evaluate(() => window.ProcessFlowMapper.getModel().graph.lanes.map((l) => l.name))).toEqual(['Manager', 'Requester', 'Finance', 'Purchasing']);
    expect(await page.evaluate(() => document.activeElement.getAttribute('data-lane'))).toBe('1');
    // Staff follows the lane by name, so the manager is still the limit.
    await expect(page.locator('#headline [data-stat="capacity"] .stat-hint')).toContainText('limited by Manager');
  });

  test('a lane name dragged past another lane reorders them', async ({ page }) => {
    await openTool(page);
    const label = page.locator('#diagramHost .flow-lane-label[data-lane="3"]');
    await label.scrollIntoViewIfNeeded();
    const from = await label.boundingBox();
    const target = await page.locator('#diagramHost .flow-lane[data-lane="0"]').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, target.y + target.height / 2, { steps: 8 });
    await page.mouse.up();
    expect((await page.inputValue('#flowText')).split('\n')[0]).toBe('lanes: Purchasing, Requester, Manager, Finance');
  });

  test('rows pasted from a spreadsheet become step lines, and ordinary text pastes as it is', async ({ page }) => {
    await openTool(page);
    await page.fill('#flowText', '');
    const paste = (text) => page.evaluate((t) => {
      const data = new DataTransfer();
      data.setData('text/plain', t);
      const box = document.getElementById('flowText');
      box.focus();
      return box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, text);
    const rows = ['Lane\tStep\tTouch\tWait\tNext', 'Ann\t(Start)\t\t\tDraft', 'Ann\tDraft\t30 min\t\tOK?', 'Bob\tOK?\t10 min\t1 d\tyes 75%: (Done); no 25%: Draft', 'Bob\t(Done)'].join('\n');
    // The page handled it, so the browser's own paste is cancelled.
    expect(await paste(rows)).toBe(false);
    expect(await page.inputValue('#flowText')).toBe('Ann: (Start) -> Draft\nAnn: Draft {30 min} -> OK?\nBob: OK? {10 min, wait 1 d} -> yes 75%: (Done), no 25%: Draft\nBob: (Done)\n');
    await expect(page.locator('#pasteStatus')).toHaveText('Turned 4 spreadsheet rows into step lines.');
    await expect(page.locator('#diagramHost .flow-step')).toHaveCount(4);
    await expect(stat(page, 'yield')).toHaveText('75%');
    // Plain text is left to the browser.
    expect(await paste('Cy: Another step')).toBe(true);
  });

  test('each table saves as CSV, named for the diagram, with awkward cells quoted', async ({ page }) => {
    await openTool(page);
    const [lanes] = await Promise.all([page.waitForEvent('download'), page.locator('.csv-btn[data-table="laneTable"]').click()]);
    expect(lanes.suggestedFilename()).toBe('purchase-request-lanes.csv');
    const rows = (await readDownloadText(lanes)).split('\r\n');
    expect(rows[0]).toBe('Lane,Steps,Touch,Wait,Share of lead,Hands on,Receives,Work per week,Staff,Hours per week,Can carry,Busy');
    expect(rows).toHaveLength(5);
    expect(rows[2].startsWith('Manager,2,5.88 min,')).toBe(true);
    await expect(page.locator('#exportStatus')).toHaveText('Saved purchase-request-lanes.csv');
    await expect(page.locator('.csv-btn')).toHaveCount(7);

    await type(page, 'Ann: (Start) -> "Check a, b"\nAnn: "Check a, b" {5 min} -> (Done)\nAnn: (Done)');
    const csv = await page.evaluate(() => window.ProcessFlowMapper.tableToCsv(document.getElementById('stepTable')));
    expect(csv.split('\r\n')[2].startsWith('"Check a, b",Ann,')).toBe(true);
  });

  test('the result can take the full width with the editor below, and that is kept', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    await openTool(page);
    const width = async () => (await page.locator('.diagram-panel').boundingBox()).width;
    const narrow = await width();
    await page.check('#wide');
    await expect(page.locator('#flowLayout')).toHaveClass(/wide/);
    expect(await width()).toBeGreaterThan(narrow + 250);
    const panel = await page.locator('.diagram-panel').boundingBox();
    const editor = await page.locator('#flowText').boundingBox();
    expect(panel.y).toBeLessThan(editor.y);
    // The fitted map uses the room it has been given.
    const shown = await page.evaluate(() => Number(document.querySelector('#diagramHost svg').getAttribute('width')));
    expect(shown).toBeGreaterThan(narrow);
    await page.reload();
    await expect(page.locator('#wide')).toBeChecked();
    await expect(page.locator('#flowLayout')).toHaveClass(/wide/);
  });
});

test.describe('scope disclaimer', () => {
  test('is the shared card, above the tool, and reads while collapsed', async ({ page }) => {
    await openTool(page);
    const card = page.locator('details.disclaimer-card#scopeDisclaimer');
    await expect(card).toHaveCount(1);
    await expect(card).not.toHaveAttribute('open', '');
    const summary = card.locator('summary');
    await expect(summary).toContainText('Not a forecast, a staffing plan or a promise date');
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
      'Work done at the same time, beyond the simple case',
      'Capacity is a ceiling, not a queue',
      'Queues, batching and priorities',
      'Variation you did not type',
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
    await expect(second).toContainText('it is only as wide as the ranges you gave');
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
    await expect(page.locator('#diagramHost .flow-step')).toHaveCount(10);

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
