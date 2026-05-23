// Meeting Planner end-to-end smoke spec (SOW §12.2).
//
// This spec is OFF BY DEFAULT — `playwright.config.cjs` excludes it from
// `testMatch`. Production config.js + HTML CSP point at the live Worker and
// require real Turnstile, neither of which works under headless Chromium. To
// run this spec:
//
//   1. In `js/meeting_planner/config.js`, swap the production exports for the
//      dev-only block commented below them (sets WORKER_BASE_URL to a local
//      worker on 127.0.0.1:8787 and turns on SKIP_TURNSTILE for loopback).
//   2. In `tools/meeting-planner.html`, add
//      `http://localhost:8787 http://127.0.0.1:8787` back into the CSP
//      `connect-src` directive.
//   3. In the Worker's `.dev.vars`, set TURNSTILE_REQUIRED=false and include
//      `http://127.0.0.1:4173` in ALLOWED_ORIGINS.
//   4. Add `'meeting-planner-smoke.spec.cjs'` back to `testMatch` in
//      `playwright.config.cjs`.
//   5. Run `npx playwright test meeting-planner-smoke.spec.cjs`.
//
// `beforeAll` auto-starts `wrangler dev`; `afterAll` shuts it down.
//
// Coverage:
//   1. Atomic create flow (modal → draft → sign-in commit → admin save dialog)
//   2. Two synthetic participants in two browser contexts, overlap reads 2/2
//   3. Tooltip lists both names
//   4. Subgroup availability table populates a row when two people overlap
//   5. ICS export downloads a structurally valid file
//   6. Admin lock flow freezes participant edits

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { test, expect } = require("@playwright/test");
const { startServer } = require("./server.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const workerRepoRoot = path.resolve(repoRoot, "..", "Meeting_Planner_Worker");
const PAGE_PATH = "/tools/meeting-planner.html";
const WORKER_PORT = 8787;
const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;
const OVERLAP_SLOT_IDX = 4;

let smokeServer;
let workerProc;
let pageOrigin;

async function waitForWorker(timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const r = await fetch(`${WORKER_URL}/events/notfoundtest`, { method: "GET" });
            // any response (404 included) means the worker is up
            if (r.status > 0) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("wrangler dev did not become ready within timeout");
}

async function startWorker() {
    // Don't spawn if something else is already listening on the port; assume
    // the developer has wrangler dev running by hand.
    try {
        const r = await fetch(`${WORKER_URL}/events/notfoundtest`);
        if (r.status > 0) { return { external: true }; }
    } catch { /* not running */ }
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const proc = spawn(npxCmd, ["wrangler", "dev", "--ip", "127.0.0.1", "--port", String(WORKER_PORT)], {
        cwd: workerRepoRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "0" },
    });
    proc.stdout?.on("data", (d) => process.stdout.write(`[worker] ${d}`));
    proc.stderr?.on("data", (d) => process.stderr.write(`[worker:err] ${d}`));
    await waitForWorker();
    return { proc, external: false };
}

async function dismissAdminDialog(page) {
    const ack = page.locator("#adminAckCheckbox");
    await ack.waitFor({ state: "visible", timeout: 20_000 });
    await ack.check();
    await page.locator("#adminSaveCloseBtn").click();
}

async function paintCell(page, slotIdx) {
    const cell = page.locator(`.grid-cell[data-slot-idx="${slotIdx}"]`);
    await cell.waitFor({ state: "visible" });
    await cell.click();
    // PUT /slots is debounced 400ms; allow buffer for the round-trip.
    await page.waitForTimeout(900);
}

async function createEventAs(page, name) {
    await page.locator("#createEventCta").click();
    await page.locator("#cfTitle").fill(`Smoke test ${Date.now()}`);
    await page.locator("#createModalSubmit").click();
    await page.locator("#signInName").fill(name);
    await page.locator("#signInBtn").click();
    await dismissAdminDialog(page);
    await expect.poll(() => page.url()).toMatch(/#evt=[A-Za-z0-9]{12}/);
}

test.beforeAll(async () => {
    smokeServer = await startServer({
        port: Number(process.env.PORT || 4173),
        reuseExisting: !process.env.CI,
    });
    pageOrigin = `http://127.0.0.1:${smokeServer.port}`;
    const w = await startWorker();
    workerProc = w.proc;
});

test.afterAll(async () => {
    if (workerProc) { workerProc.kill(); workerProc = null; }
    if (smokeServer) { await smokeServer.close(); smokeServer = null; }
});

test("create + overlap + tooltip + subgroup + ICS", async ({ browser }) => {
    // -------- Creator context (Alice) --------
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    pageA.on("pageerror", (err) => { throw err; });

    await pageA.goto(`${pageOrigin}${PAGE_PATH}`);
    await createEventAs(pageA, "Alice");
    await paintCell(pageA, OVERLAP_SLOT_IDX);
    const eventUrl = pageA.url();

    // -------- Participant context (Bob) --------
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    pageB.on("pageerror", (err) => { throw err; });

    const participantUrl = eventUrl.replace(/&admin=[A-Za-z0-9]+/, "");
    await pageB.goto(participantUrl);
    await pageB.locator("#signInName").fill("Bob");
    await pageB.locator("#signInBtn").click();
    await paintCell(pageB, OVERLAP_SLOT_IDX);

    await pageB.waitForTimeout(500);

    // Bob's cell reads 2/2
    const bobCell = pageB.locator(`.grid-cell[data-slot-idx="${OVERLAP_SLOT_IDX}"]`);
    await expect(bobCell).toHaveAttribute("data-k", "2");
    await expect(bobCell).toHaveAttribute("data-n", "2");

    // Alice reload picks up Bob's row
    await pageA.reload();
    const aliceCell = pageA.locator(`.grid-cell[data-slot-idx="${OVERLAP_SLOT_IDX}"]`);
    await aliceCell.waitFor({ state: "visible" });
    await expect(aliceCell).toHaveAttribute("data-k", "2");
    await expect(aliceCell).toHaveAttribute("data-n", "2");

    // Tooltip lists both names. Use force + a manual mouse move because the
    // grid root sits on top of the cells in Playwright's actionability check.
    const box = await aliceCell.boundingBox();
    if (box) await pageA.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const tt = pageA.locator("#gridTooltip");
    await tt.waitFor({ state: "visible" });
    const ttText = await tt.textContent();
    expect(ttText).toContain("Alice");
    expect(ttText).toContain("Bob");

    // Subgroup table has a row for {Alice, Bob}
    const subgroupRows = pageA.locator("#subgroupBody tr");
    await expect(subgroupRows).toHaveCount(1);
    const firstRowText = await subgroupRows.first().textContent();
    expect(firstRowText).toContain("Alice");
    expect(firstRowText).toContain("Bob");

    // ICS export downloads a valid file
    const [download] = await Promise.all([
        pageA.waitForEvent("download"),
        pageA.locator("#downloadIcsBtn").click(),
    ]);
    const filePath = await download.path();
    const ics = fs.readFileSync(filePath, "utf8");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z/);

    await ctxA.close();
    await ctxB.close();
});

test("admin lock freezes participant edits", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    pageA.on("pageerror", (err) => { throw err; });

    await pageA.goto(`${pageOrigin}${PAGE_PATH}`);
    await createEventAs(pageA, "AdminUser");
    await paintCell(pageA, 0);
    const eventUrl = pageA.url();

    // Lock from the admin sidebar.
    await pageA.locator("#adminLockBtn").click();
    await pageA.locator("#lockConfirm").click();

    // Banner reflects locked state.
    const banner = pageA.locator("#eventBanner");
    await expect(banner).toContainText("locked");

    // A new participant tries to sign in — sign-in works (read still OK), but
    // upsert is rejected. The simplest assertion: the participant's row is
    // never created in the participants list.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    pageB.on("pageerror", (err) => { throw err; });

    const participantUrl = eventUrl.replace(/&admin=[A-Za-z0-9]+/, "");
    await pageB.goto(participantUrl);
    await pageB.locator("#signInName").fill("LateBob");
    await pageB.locator("#signInBtn").click();
    // Expect an error toast for the locked event.
    await pageB.waitForTimeout(1500);
    const toastText = await pageB.locator("#toastContainer").textContent();
    expect(toastText.toLowerCase()).toContain("locked");

    await ctxA.close();
    await ctxB.close();
});
