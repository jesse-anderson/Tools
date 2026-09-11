// Shared helpers for the tools smoke suite. Not a spec itself (excluded from
// testMatch); imported by the per-tool spec files that navigate pages.
//
// Holds the tools.html catalog parsing, the page-diagnostics collector used to
// assert a page loaded without errors, and small download/formatting utilities.
// Tool-specific helpers (lamport event builders, visual-integration canvas
// probes, planner stat readers) live inline in their own spec files.
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..', '..');
const toolsIndexPath = path.join(repoRoot, 'tools.html');
const toolsIndexMarkup = fs.readFileSync(toolsIndexPath, 'utf8');

function extractToolPaths(markup) {
  const toolPaths = new Set();
  const anchorTags = markup.match(/<a\b[^>]*>/gi) || [];

  for (const tag of anchorTags) {
    const hrefMatch = tag.match(/\bhref\s*=\s*"([^"]+)"/i);
    const classMatch = tag.match(/\bclass\s*=\s*"([^"]+)"/i);

    if (!hrefMatch || !classMatch) {
      continue;
    }

    const classNames = classMatch[1].split(/\s+/);
    const href = hrefMatch[1].trim();

    if (!classNames.includes('tool-card')) {
      continue;
    }

    if (!href.startsWith('tools/') || !href.endsWith('.html')) {
      continue;
    }

    toolPaths.add(`/${href.replace(/\\/g, '/')}`);
  }

  return Array.from(toolPaths).sort();
}

function getSectionMarkup(markup, sectionTitle) {
  const sections = markup.match(/<section class="category-section">[\s\S]*?<\/section>/g) || [];
  return sections.find((section) => section.includes(`<h2 class="category-title">${sectionTitle}</h2>`)) || '';
}

function extractToolNamesFromSection(sectionMarkup) {
  return Array.from(sectionMarkup.matchAll(/<h3 class="tool-name">([^<]+)<\/h3>/g), (match) => match[1].trim());
}

function extractToolHrefsFromSection(sectionMarkup) {
  return Array.from(sectionMarkup.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*class="[^"]*\btool-card\b[^"]*"/g), (match) => match[1].trim());
}

const toolPaths = extractToolPaths(toolsIndexMarkup);

// Tool pages excluded from the aggregate page-load check. Empty as of September
// 2026; all 54 linked pages load clean. Add a path only with a comment saying
// why and what removes it.
const KNOWN_FAILING_TOOL_PATHS = new Set([]);

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function shouldIgnoreConsoleError(message) {
  const ignoredPatterns = [
    /favicon\.ico/i
  ];

  return ignoredPatterns.some((pattern) => pattern.test(message));
}

function isCriticalFailedRequest(request, baseURL) {
  const url = request.url();
  const failure = request.failure();

  if (!failure || !/^https?:/i.test(url)) {
    return false;
  }

  const resourceType = request.resourceType();
  const baseOrigin = new URL(baseURL).origin;
  const sameOrigin = url.startsWith(baseOrigin);

  if (sameOrigin && ['document', 'script', 'stylesheet', 'worker'].includes(resourceType)) {
    return true;
  }

  if (['script', 'worker'].includes(resourceType)) {
    return true;
  }

  return /\.wasm(?:[?#]|$)/i.test(url);
}

function attachDiagnostics(page, baseURL) {
  const diagnostics = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: []
  };

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(normalizeText(error.stack || error.message));
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }

    const text = normalizeText(message.text());
    if (shouldIgnoreConsoleError(text)) {
      return;
    }

    diagnostics.consoleErrors.push(text);
  });

  page.on('requestfailed', (request) => {
    if (!isCriticalFailedRequest(request, baseURL)) {
      return;
    }

    const failure = request.failure();
    diagnostics.failedRequests.push(
      `${request.resourceType().toUpperCase()} ${request.url()} :: ${failure ? failure.errorText : 'request failed'}`
    );
  });

  return diagnostics;
}

function formatDiagnostics(urlPath, diagnostics) {
  const sections = [];

  if (diagnostics.pageErrors.length) {
    sections.push(`Page errors:\n- ${diagnostics.pageErrors.join('\n- ')}`);
  }

  if (diagnostics.consoleErrors.length) {
    sections.push(`Console errors:\n- ${diagnostics.consoleErrors.join('\n- ')}`);
  }

  if (diagnostics.failedRequests.length) {
    sections.push(`Failed critical requests:\n- ${diagnostics.failedRequests.join('\n- ')}`);
  }

  return [`Smoke check failed for ${urlPath}`, ...sections].join('\n\n');
}

async function expectPageToLoadCleanly(page, baseURL, urlPath) {
  const diagnostics = attachDiagnostics(page, baseURL);
  const response = await page.goto(urlPath, { waitUntil: 'load' });

  expect(response, `No response received for ${urlPath}`).not.toBeNull();
  expect(response.ok(), `${urlPath} returned HTTP ${response.status()}`).toBeTruthy();

  await page.waitForTimeout(1200);

  expect(
    diagnostics.pageErrors.length + diagnostics.consoleErrors.length + diagnostics.failedRequests.length,
    formatDiagnostics(urlPath, diagnostics)
  ).toBe(0);
}

async function readDownloadText(download) {
  const stream = await download.createReadStream();
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Measure WCAG contrast for elements, in a chosen theme, from the rendered page.
 *
 * Three corrections, each of which returns a confidently wrong number if missed:
 *
 *  1. getComputedStyle returns color-mix() as `color(srgb 0-1 ...)`, not
 *     `rgb(0-255)`. Misparsing makes a mid amber measure 20.96:1, not 2.56:1.
 *  2. The tinted cards are translucent, so composite up the ancestor chain.
 *  3. shared.css transitions background-color, so a read straight after a theme
 *     switch returns the mid-animation colour. Hence the wait.
 *
 * Every `details` is opened first: innerText on a collapsed one returns only the
 * summary.
 *
 * Returns one entry per matched element: { text, cls, ratio, px, weight, need,
 * pass }, where `need` is 3 for WCAG large text (24px and up, or 18.66px and up
 * at weight 700+) and 4.5 otherwise.
 */
async function measureContrast(page, selector, theme = 'light') {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    for (const d of document.querySelectorAll('details')) d.open = true;
  }, theme);
  await page.waitForTimeout(800);

  return page.evaluate((sel) => {
    function parse(c) {
      let m = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
      if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]];
      m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
      if (c === 'transparent') return [0, 0, 0, 0];
      return null;
    }
    const lum = (r, g, b) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    function bgOf(el) {
      const stack = [];
      for (let n = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c[3] > 0) stack.push(c);
      }
      stack.push([255, 255, 255, 1]);
      let out = stack[stack.length - 1].slice(0, 3);
      for (let i = stack.length - 2; i >= 0; i--) {
        const [r, g, b, a] = stack[i];
        out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)];
      }
      return out;
    }
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const text = (el.innerText || '').trim();
      if (!text) continue;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = bgOf(el);
      const comp = [
        fg[0] * fg[3] + bg[0] * (1 - fg[3]),
        fg[1] * fg[3] + bg[1] * (1 - fg[3]),
        fg[2] * fg[3] + bg[2] * (1 - fg[3]),
      ];
      const l1 = lum(comp[0], comp[1], comp[2]);
      const l2 = lum(bg[0], bg[1], bg[2]);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const px = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = px >= 24 || (px >= 18.66 && weight >= 700);
      out.push({
        text: text.slice(0, 60),
        cls: String(el.className || el.tagName),
        ratio: Math.round(ratio * 100) / 100,
        px: Math.round(px * 10) / 10,
        weight,
        need: large ? 3 : 4.5,
        pass: ratio >= (large ? 3 : 4.5),
      });
    }
    return out;
  }, selector);
}

/**
 * Assert every element matching `selector` clears WCAG AA in both themes.
 * Fails with the measured ratio and the element text, so a regression names
 * itself instead of just going red.
 */
async function expectContrastAA(page, selector) {
  for (const theme of ['dark', 'light']) {
    const measured = await measureContrast(page, selector, theme);
    expect(measured.length, `no elements matched ${selector} in ${theme} theme`).toBeGreaterThan(0);
    for (const m of measured) {
      expect(
        m.pass,
        `${theme} theme: "${m.text}" (${m.cls}) measures ${m.ratio}:1, needs ${m.need}:1 at ${m.px}px/${m.weight}`
      ).toBe(true);
    }
  }
}

module.exports = {
  repoRoot,
  toolsIndexMarkup,
  extractToolPaths,
  getSectionMarkup,
  extractToolNamesFromSection,
  extractToolHrefsFromSection,
  toolPaths,
  KNOWN_FAILING_TOOL_PATHS,
  normalizeText,
  shouldIgnoreConsoleError,
  isCriticalFailedRequest,
  attachDiagnostics,
  formatDiagnostics,
  expectPageToLoadCleanly,
  readDownloadText,
  measureContrast,
  expectContrastAA
};
