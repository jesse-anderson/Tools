const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

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

const toolPaths = extractToolPaths(toolsIndexMarkup);

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

test('tools.html contains linked tool pages', () => {
  expect(toolPaths.length).toBeGreaterThan(0);
});

test('all linked tool pages exist on disk', () => {
  const missingPaths = toolPaths.filter((toolPath) => !fs.existsSync(path.join(repoRoot, toolPath.slice(1))));
  expect(missingPaths, `Missing tool pages referenced by tools.html:\n- ${missingPaths.join('\n- ')}`).toEqual([]);
});

test('tools.html loads without breaking errors', async ({ page, baseURL }) => {
  await expectPageToLoadCleanly(page, baseURL, '/tools.html');
});

test('all linked tool pages load without breaking errors', async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(Math.max(120_000, toolPaths.length * 4_000));
  const failures = [];

  for (const toolPath of toolPaths) {
    const page = await browser.newPage();
    const diagnostics = attachDiagnostics(page, baseURL);

    try {
      await test.step(`${path.basename(toolPath)} loads without breaking errors`, async () => {
        const response = await page.goto(toolPath, { waitUntil: 'load' });

        if (!response) {
          failures.push({
            urlPath: toolPath,
            diagnostics: {
              pageErrors: ['No response received'],
              consoleErrors: diagnostics.consoleErrors.slice(),
              failedRequests: diagnostics.failedRequests.slice()
            }
          });
          return;
        }

        if (!response.ok()) {
          failures.push({
            urlPath: toolPath,
            diagnostics: {
              pageErrors: [`Returned HTTP ${response.status()}`],
              consoleErrors: diagnostics.consoleErrors.slice(),
              failedRequests: diagnostics.failedRequests.slice()
            }
          });
          return;
        }

        await page.waitForTimeout(1200);

        const issueCount =
          diagnostics.pageErrors.length +
          diagnostics.consoleErrors.length +
          diagnostics.failedRequests.length;

        if (issueCount > 0) {
          failures.push({
            urlPath: toolPath,
            diagnostics: {
              pageErrors: diagnostics.pageErrors.slice(),
              consoleErrors: diagnostics.consoleErrors.slice(),
              failedRequests: diagnostics.failedRequests.slice()
            }
          });
        }
      });
    } finally {
      if (!page.isClosed()) {
        try {
          await page.close();
        } catch (error) {
          // Ignore teardown races when Playwright already disposed the context.
        }
      }
    }
  }

  if (failures.length) {
    const failureReport = failures
      .map(({ urlPath, diagnostics }) => formatDiagnostics(urlPath, diagnostics))
      .join('\n\n---\n\n');

    await testInfo.attach('smoke-failures.txt', {
      body: Buffer.from(failureReport, 'utf8'),
      contentType: 'text/plain'
    });
  }

  expect(
    failures,
    failures.length
      ? failures.map(({ urlPath, diagnostics }) => formatDiagnostics(urlPath, diagnostics)).join('\n\n---\n\n')
      : 'All linked tool pages loaded cleanly.'
  ).toEqual([]);
});
