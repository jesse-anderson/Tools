// Engine tests for the Lamport Timestamps learning tool via
// window.LamportEngine (js/distributed_systems/lamport-engine.js):
// Lamport clock replay (local/send tick, receive max+1), vector clock replay
// (elementwise merge then own tick), causal comparison, concurrent-pair
// counting, pending-message bookkeeping, process removal renumbering, and
// replay idempotence. Also drives the page UI once to confirm the visualizer
// agrees with a pure replay of the same sequence.
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/lamport-timestamps.html';
let smokeServer;

test.beforeAll(async () => {
  smokeServer = await startServer({
    port: Number(process.env.PORT || 4173),
    reuseExisting: !process.env.CI
  });
});

test.afterAll(async () => {
  if (smokeServer) {
    await smokeServer.close();
    smokeServer = null;
  }
});

async function openTool(page) {
  await page.goto(TOOL_PATH);
  await page.waitForFunction(() => window.LamportEngine
    && window.LamportEngine.replaySequence
    && window.LamportEngine.compareVectors);
}

// The tool's built-in example: three processes, nine events.
// P1: E1, S2(M1 to P2), E3, ...........R8(M3 from P2)
// P2: ...........R6(M1), S7(M3 to P1), R9(M2 from P3)
// P3: E4, S5(M2 to P2)
function exampleEvents() {
  return [
    { id: 1, type: 'local',   processId: 1 },
    { id: 2, type: 'send',    processId: 1, targetProcessId: 2, messageId: 'M1' },
    { id: 3, type: 'local',   processId: 1 },
    { id: 4, type: 'local',   processId: 3 },
    { id: 5, type: 'send',    processId: 3, targetProcessId: 2, messageId: 'M2' },
    { id: 6, type: 'receive', processId: 2, receiveFrom: 1, messageId: 'M1' },
    { id: 7, type: 'send',    processId: 2, targetProcessId: 1, messageId: 'M3' },
    { id: 8, type: 'receive', processId: 1, receiveFrom: 2, messageId: 'M3' },
    { id: 9, type: 'receive', processId: 2, receiveFrom: 3, messageId: 'M2' }
  ];
}

test.describe('Simple Lamport clock replay', () => {
  test('textbook example produces the expected timestamps and final clocks', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate((events) => {
      const result = window.LamportEngine.replaySequence([1, 2, 3], events, 'simple');
      return {
        timestamps: result.events.map((e) => e.timestamp),
        clocks: result.processes.map((p) => p.timestamp),
        vectors: result.events.map((e) => e.vector),
        pending: result.pendingMessages.length
      };
    }, exampleEvents());

    // Local/send tick by one; receive is max(local, message) + 1.
    // R6 = max(0, S2=2) + 1 = 3; S7 = 4; R8 = max(3, 4) + 1 = 5;
    // R9 = max(4, S5=2) + 1 = 5.
    expect(out.timestamps).toEqual([1, 2, 3, 1, 2, 3, 4, 5, 5]);
    expect(out.clocks).toEqual([5, 5, 2]);
    expect(out.vectors.every((v) => v === null || v === undefined)).toBe(true);
    expect(out.pending).toBe(0);
  });

  test('receive uses max(local, message) + 1, not local + 1', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      // P2 races ahead locally before receiving P1's early message.
      const events = [
        { id: 1, type: 'send',    processId: 1, targetProcessId: 2, messageId: 'M1' },
        { id: 2, type: 'local',   processId: 2 },
        { id: 3, type: 'local',   processId: 2 },
        { id: 4, type: 'local',   processId: 2 },
        { id: 5, type: 'receive', processId: 2, receiveFrom: 1, messageId: 'M1' }
      ];
      const result = window.LamportEngine.replaySequence([1, 2], events, 'simple');
      return result.events.map((e) => e.timestamp);
    });
    // Receive: max(3, 1) + 1 = 4 (local side dominates).
    expect(out).toEqual([1, 1, 2, 3, 4]);

    const out2 = await page.evaluate(() => {
      // Mirror case: the message timestamp dominates.
      const events = [
        { id: 1, type: 'local',   processId: 1 },
        { id: 2, type: 'local',   processId: 1 },
        { id: 3, type: 'send',    processId: 1, targetProcessId: 2, messageId: 'M1' },
        { id: 4, type: 'receive', processId: 2, receiveFrom: 1, messageId: 'M1' }
      ];
      const result = window.LamportEngine.replaySequence([1, 2], events, 'simple');
      return result.events.map((e) => e.timestamp);
    });
    // Receive: max(0, 3) + 1 = 4 (message side dominates).
    expect(out2).toEqual([1, 2, 3, 4]);
  });

  test('unmatched sends stay pending; receives pair with their send event', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate((events) => {
      const withExtraSend = events.concat([
        { id: 10, type: 'send', processId: 1, targetProcessId: 3, messageId: 'M4' }
      ]);
      const result = window.LamportEngine.replaySequence([1, 2, 3], withExtraSend, 'simple');
      return {
        pending: result.pendingMessages.map((m) => ({ id: m.id, from: m.from, to: m.to })),
        pairings: result.events
          .filter((e) => e.type === 'receive')
          .map((e) => ({ id: e.id, pairedSendEventId: e.pairedSendEventId }))
      };
    }, exampleEvents());

    expect(out.pending).toEqual([{ id: 'M4', from: 1, to: 3 }]);
    expect(out.pairings).toEqual([
      { id: 6, pairedSendEventId: 2 },
      { id: 8, pairedSendEventId: 7 },
      { id: 9, pairedSendEventId: 5 }
    ]);
  });
});

test.describe('Vector clock replay', () => {
  test('textbook example produces the expected vectors', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate((events) => {
      const result = window.LamportEngine.replaySequence([1, 2, 3], events, 'vector');
      return {
        vectors: result.events.map((e) => e.vector),
        finals: result.processes.map((p) => p.vector)
      };
    }, exampleEvents());

    expect(out.vectors).toEqual([
      [1, 0, 0], // E1
      [2, 0, 0], // S2
      [3, 0, 0], // E3
      [0, 0, 1], // E4
      [0, 0, 2], // S5
      [2, 1, 0], // R6 = merge([0,0,0],[2,0,0]) then tick own
      [2, 2, 0], // S7
      [4, 2, 0], // R8 = merge([3,0,0],[2,2,0]) then tick own
      [2, 3, 2]  // R9 = merge([2,2,0],[0,0,2]) then tick own
    ]);
    expect(out.finals).toEqual([[4, 2, 0], [2, 3, 2], [0, 0, 2]]);
  });

  test('compareVectors classifies before/after/concurrent/equal', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { compareVectors, vectorLeq } = window.LamportEngine;
      return {
        before: compareVectors([1, 0, 0], [2, 1, 0]),
        after: compareVectors([2, 1, 0], [1, 0, 0]),
        concurrent: compareVectors([3, 0, 0], [2, 2, 0]),
        equal: compareVectors([1, 2, 3], [1, 2, 3]),
        leqTrue: vectorLeq([1, 2], [1, 3]),
        leqFalse: vectorLeq([2, 0], [1, 3]),
        lengthMismatch: vectorLeq([1], [1, 0])
      };
    });
    expect(out.before).toBe('before');
    expect(out.after).toBe('after');
    expect(out.concurrent).toBe('concurrent');
    expect(out.equal).toBe('equal');
    expect(out.leqTrue).toBe(true);
    expect(out.leqFalse).toBe(false);
    expect(out.lengthMismatch).toBe(false);
  });

  test('countConcurrentPairs matches a brute-force count on the example', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate((events) => {
      const { replaySequence, countConcurrentPairs, compareVectors } = window.LamportEngine;
      const replayed = replaySequence([1, 2, 3], events, 'vector').events;

      let brute = 0;
      for (let i = 0; i < replayed.length; i++) {
        for (let j = i + 1; j < replayed.length; j++) {
          if (compareVectors(replayed[i].vector, replayed[j].vector) === 'concurrent') brute++;
        }
      }

      return { engine: countConcurrentPairs(replayed), brute };
    }, exampleEvents());

    // Hand count: E1/S2/E3 vs {E4,S5}, E3 vs {R6,S7,R9}, E4 vs {R6,S7,R8},
    // S5 vs {R6,S7,R8}, R8 vs R9 = 16 incomparable pairs.
    expect(out.engine).toBe(16);
    expect(out.brute).toBe(16);
  });
});

test.describe('Sequence editing', () => {
  test('removing a process drops its events and renumbers the rest consistently', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate((events) => {
      const { removeProcessFromEvents, replaySequence } = window.LamportEngine;
      // Remove P1: E1, S2, E3 (on P1), R6 (receives from P1), S7 (sends to
      // P1), and R8 (on P1) all disappear.
      const remaining = removeProcessFromEvents(events, 1);
      const result = replaySequence([1, 2], remaining, 'simple');
      return {
        types: remaining.map((e) => `${e.type}@P${e.processId}`),
        timestamps: result.events.map((e) => e.timestamp),
        clocks: result.processes.map((p) => p.timestamp)
      };
    }, exampleEvents());

    // Survivors: E4@P3, S5@P3, R9@P2 with old P2 -> new P1, old P3 -> new P2.
    expect(out.types).toEqual(['local@P2', 'send@P2', 'receive@P1']);
    expect(out.timestamps).toEqual([1, 2, 3]); // R9 = max(0, S5=2) + 1
    expect(out.clocks).toEqual([3, 2]);
  });

  test('replay is idempotent and does not mutate its inputs', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate((events) => {
      const { replaySequence } = window.LamportEngine;
      const inputCopy = JSON.parse(JSON.stringify(events));
      const first = replaySequence([1, 2, 3], events, 'vector');
      const second = replaySequence([1, 2, 3], first.events, 'vector');
      return {
        inputUntouched: JSON.stringify(events) === JSON.stringify(inputCopy),
        stable: JSON.stringify(first.events) === JSON.stringify(second.events)
      };
    }, exampleEvents());

    expect(out.inputUntouched).toBe(true);
    expect(out.stable).toBe(true);
  });
});

test.describe('Page integration', () => {
  test('loading the example drives the UI to the engine-predicted state', async ({ page }) => {
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await openTool(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.LamportEngine && window.app);

    await expect(page.locator('#statTotalEvents')).toHaveText('9');
    await expect(page.locator('#statMessagesSent')).toHaveText('3');
    await expect(page.locator('#statMessagesReceived')).toHaveText('3');
    await expect(page.locator('#statMaxTimestamp')).toHaveText('5');

    // The visualizer's live state must equal a pure replay of its own events.
    const parity = await page.evaluate(() => {
      const app = window.app;
      const replay = window.LamportEngine.replaySequence(
        app.processes.map((p) => p.id),
        app.events,
        app.currentMode
      );
      return {
        timestamps: app.events.map((e) => e.timestamp),
        replayed: replay.events.map((e) => e.timestamp),
        clocks: app.processes.map((p) => p.timestamp),
        replayedClocks: replay.processes.map((p) => p.timestamp)
      };
    });
    expect(parity.timestamps).toEqual(parity.replayed);
    expect(parity.clocks).toEqual(parity.replayedClocks);

    // Vector mode: the sidebar reports the vector size and stays consistent.
    await page.click('[data-mode="vector"]');
    await expect(page.locator('#statVectorSize')).toHaveText('3');

    expect(errors).toEqual([]);
  });

  test('switching timeline -> overview -> timeline hides the overview canvas', async ({ page }) => {
    await openTool(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.app);

    await page.click('[data-view="diagram"]');
    await page.waitForTimeout(200);
    await page.click('[data-view="timeline"]');
    await page.waitForTimeout(200);

    const state = await page.evaluate(() => ({
      canvasDisplay: getComputedStyle(document.getElementById('diagramCanvas')).display,
      timelineVisible: !document.getElementById('timelineView').classList.contains('hidden'),
      timelineHasContent: document.querySelectorAll('#timelineContainer .timeline-marker').length > 0
    }));

    // The stale radial overview used to stay painted behind the timeline.
    expect(state.canvasDisplay).toBe('none');
    expect(state.timelineVisible).toBe(true);
    expect(state.timelineHasContent).toBe(true);
  });
});
