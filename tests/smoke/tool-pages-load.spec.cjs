// One test per linked tool page: navigate and assert no page errors, console
// errors, or failed critical requests. Split out from the old monolithic
// "all linked tool pages load" loop so the ~50 page loads fan out across
// workers instead of running serially inside a single test.
const path = require('path');
const { test } = require('@playwright/test');
const { toolPaths, KNOWN_FAILING_TOOL_PATHS, expectPageToLoadCleanly } = require('./helpers.cjs');

for (const toolPath of toolPaths) {
  if (KNOWN_FAILING_TOOL_PATHS.has(toolPath)) {
    continue;
  }

  test(`${path.basename(toolPath)} loads without breaking errors`, async ({ page, baseURL }) => {
    await expectPageToLoadCleanly(page, baseURL, toolPath);
  });
}
