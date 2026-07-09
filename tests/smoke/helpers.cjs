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

// Temporarily excluded from the aggregate page-load check. linear-regression.html
// references tools/WASM_Example_linreg-core/* (styles.css, logic.js) which is parked
// in historical/ pending a linreg-core rework, so those requests 404 by design.
// Remove this entry once linreg-core is reworked and re-vendored.
const KNOWN_FAILING_TOOL_PATHS = new Set([
  '/tools/linear-regression.html'
]);

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
  readDownloadText
};
