// Ishikawa Fishbone Diagram (tools/fishbone-diagram.html): the pure engine
// through window.FishboneDiagram. Strict CSP, so waits use expect.poll.
// There is no calculation to check against a reference: the model is held
// to the role and lock table of the SOW, the layout by invariants, and the
// formats by round trips.

const { test, expect } = require('@playwright/test');

const PAGE = '/tools/fishbone-diagram.html';

async function openTool(page) {
  await page.addInitScript(() => { try { localStorage.setItem('fishboneDiagram.guideSeen.v1', '1'); } catch (e) { /* none */ } });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.FishboneDiagram))).toBe(true);
}

// Installed in the page: a counter id source and a board built from outline text.
function installHelpers() {
  const F = window.FishboneDiagram;
  let n = 0;
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  window.fbId = () => { n += 1; let s = ''; let k = n; for (let i = 0; i < 12; i++) { s += A[k % 32]; k = Math.floor(k / 32); } return s; };
  window.fbBoard = (text) => {
    const parsed = F.outline.parseOutline(text);
    return F.outline.boardFromOutline(parsed, { newId: window.fbId, keys: F.outline.resolveKeys(parsed, F.presets.lookupPreset) });
  };
  window.fbFind = (board, text) => Object.values(board.nodes).find((x) => x.text === text && !x.deleted);
}

test.describe('model and ops', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); await page.evaluate(installHelpers); });

  test('add, edit, move, delete and restore, each undone by its inverse', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const O = F.ops;
      let b = window.fbBoard('Methods\n  A\n  B\nMachines\n  C\n');
      const start = JSON.stringify(F.outline.toOutline(b));
      const a = window.fbFind(b, 'A');
      const c = window.fbFind(b, 'C');
      const steps = [
        { type: 'addNode', id: window.fbId(), parentId: a.id, after: null, kind: 'cause', text: 'why A' },
        { type: 'setField', nodeId: a.id, field: 'status', value: 'verified' },
        { type: 'setField', nodeId: a.id, field: 'text', value: 'A2' },
        { type: 'move', nodeId: c.id, parentId: a.id, after: null },
        { type: 'deleteNode', nodeId: a.id },
        { type: 'lock', nodeId: c.id, mode: 'branch', note: 'done' }
      ];
      const inverses = [];
      const outs = [];
      for (const op of steps) {
        const { board, result } = O.applyOp(b, op, O.SOLO_ACTOR, 1);
        outs.push(result.ok);
        if (result.ok) { inverses.unshift(result.inverse); b = board; }
      }
      const afterDelete = F.outline.toOutline(b);
      for (const inv of inverses) {
        const { board, result } = O.applyOp(b, inv, O.SOLO_ACTOR, 2);
        outs.push(result.ok);
        b = board;
      }
      return { outs, afterDelete, back: JSON.stringify(F.outline.toOutline(b)) === start, tomb: Object.values(b.nodes).filter((x) => x.deleted).length };
    });
    // The lock fails: C sat under A, which was deleted.
    expect(r.outs.slice(0, 6)).toEqual([true, true, true, true, true, false]);
    expect(r.afterDelete).toBe('Methods\n  B\nMachines\n');
    expect(r.outs.slice(6).every(Boolean)).toBe(true);
    expect(r.back).toBe(true);
    // The added "why A" is a tombstone after its add was undone.
    expect(r.tomb).toBe(1);
  });

  test('refusals: cycles, deleted targets, limits, the reserved name, a bad op', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const O = F.ops;
      const b = window.fbBoard('Methods\n  A\n    B\n      C\n');
      const [a, bb, c] = ['A', 'B', 'C'].map((t) => window.fbFind(b, t));
      const run = (op, board = b) => O.applyOp(board, op, O.SOLO_ACTOR, 0).result.reason || 'ok';
      const deleted = O.applyOp(b, { type: 'deleteNode', nodeId: c.id }).board;
      const long = 'x'.repeat(F.LIMITS.causeText + 1);
      let deep = b;
      let parent = c.id;
      for (let i = 0; i < 3; i++) { const id = window.fbId(); deep = O.applyOp(deep, { type: 'addNode', id, parentId: parent, after: null, kind: 'cause', text: `d${i}` }).board; parent = id; }
      return {
        cycle: run({ type: 'move', nodeId: a.id, parentId: c.id, after: null }),
        self: run({ type: 'move', nodeId: a.id, parentId: a.id, after: null }),
        editDeleted: run({ type: 'setField', nodeId: c.id, field: 'text', value: 'x' }, deleted),
        missing: run({ type: 'setField', nodeId: 'ZZZZZZZZZZZZ', field: 'text', value: 'x' }),
        tooLong: run({ type: 'setField', nodeId: a.id, field: 'text', value: long }),
        reserved: run({ type: 'addNode', id: window.fbId(), parentId: 'root', after: null, kind: 'category', text: 'unsorted' }),
        tooDeep: run({ type: 'addNode', id: window.fbId(), parentId: parent, after: null, kind: 'cause', text: 'seventh' }, deep),
        bad: run({ type: 'eval' }),
        proto: run({ type: 'toString' }),
        status: run({ type: 'setField', nodeId: a.id, field: 'status', value: 'probably' }),
        unchanged: O.applyOp(b, { type: 'move', nodeId: a.id, parentId: c.id, after: null }).board === b
      };
    });
    expect(r).toEqual({
      cycle: 'CYCLE', self: 'CYCLE', editDeleted: 'NODE_DELETED', missing: 'NODE_MISSING', tooLong: 'LIMIT_TEXT',
      reserved: 'RESERVED_NAME', tooDeep: 'LIMIT_DEPTH', bad: 'BAD_OP', proto: 'BAD_OP', status: 'BAD_VALUE', unchanged: true
    });
  });

  test('category and cause counts stop at 12 and 300', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const O = F.ops;
      let b = O.emptyBoard();
      let last = null;
      for (let i = 0; i < 13; i++) {
        const id = window.fbId();
        const { board, result } = O.applyOp(b, { type: 'addNode', id, parentId: 'root', after: last, kind: 'category', text: `C${i}` });
        if (result.ok) { b = board; last = id; } else return { at: i, reason: result.reason, causes: null };
      }
      return { at: 13 };
    });
    expect(r).toEqual({ at: 12, reason: 'LIMIT_CATEGORIES', causes: null });
    const c = await page.evaluate(() => {
      const O = window.FishboneDiagram.ops;
      let b = window.fbBoard('One\n');
      const cat = b.order.root[0];
      for (let i = 0; i < 301; i++) {
        const { board, result } = O.applyOp(b, { type: 'addNode', id: window.fbId(), parentId: cat, after: null, kind: 'cause', text: `c${i}` });
        if (!result.ok) return { at: i, reason: result.reason };
        b = board;
      }
      return { at: 301 };
    });
    expect(c).toEqual({ at: 300, reason: 'LIMIT_CAUSES' });
  });

  test('a cause added under a just-deleted parent is rescued to Unsorted, naming the parent', async ({ page }) => {
    const r = await page.evaluate(() => {
      const O = window.FishboneDiagram.ops;
      let b = window.fbBoard('Methods\n  A\n  B\n');
      const a = window.fbFind(b, 'A');
      b = O.applyOp(b, { type: 'deleteNode', nodeId: a.id }).board;
      const id = window.fbId();
      const { board, result } = O.applyOp(b, { type: 'addNode', id, parentId: a.id, after: null, kind: 'cause', text: 'late why' });
      return { ok: result.ok, from: result.rescued && result.rescued.from, parent: board.nodes[id].parentId, note: board.nodes[id].note, binLast: board.order.root[board.order.root.length - 1] };
    });
    expect(r.ok).toBe(true);
    expect(r.from).toBe('A');
    expect(r.parent).toBe('unsorted');
    expect(r.note).toContain('"A"');
    expect(r.binLast).toBe('unsorted');
  });

  test('an insert after a deleted sibling goes after that sibling\'s place', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const O = F.ops;
      let b = window.fbBoard('M\n  A\n  B\n  C\n');
      const bb = window.fbFind(b, 'B');
      b = O.applyOp(b, { type: 'deleteNode', nodeId: bb.id }).board;
      b = O.applyOp(b, { type: 'addNode', id: window.fbId(), parentId: bb.parentId, after: bb.id, kind: 'cause', text: 'N' }).board;
      return F.outline.toOutline(b);
    });
    expect(r).toBe('M\n  A\n  N\n  C\n');
  });

  test('history keeps exactly the last 500 entries and purges tombstones it no longer covers', async ({ page }) => {
    const r = await page.evaluate(() => {
      const O = window.FishboneDiagram.ops;
      let b = window.fbBoard('M\n  gone\n  A\n');
      const gone = window.fbFind(b, 'gone');
      const a = window.fbFind(b, 'A');
      b = O.applyOp(b, { type: 'deleteNode', nodeId: gone.id }).board;
      const tombBefore = Boolean(b.nodes[gone.id]);
      for (let i = 0; i < 520; i++) b = O.applyOp(b, { type: 'setField', nodeId: a.id, field: 'text', value: `A${i}` }).board;
      return { len: b.history.length, last: b.history[b.history.length - 1].summary, tombBefore, tombAfter: Boolean(b.nodes[gone.id]), inOrder: Object.values(b.order).some((l) => l.includes(gone.id)) };
    });
    expect(r.len).toBe(500);
    expect(r.last).toBe('Changed "A518" to "A519"');
    expect(r.tombBefore).toBe(true);
    expect(r.tombAfter).toBe(false);
    expect(r.inOrder).toBe(false);
  });
});

test.describe('roles and locks', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); await page.evaluate(installHelpers); });

  test('every op type against every role and lock, as the SOW table says', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const O = F.ops;
      const make = () => {
        let b = window.fbBoard('Methods\n  Parent\n    Child\n  Other\nMachines\n  M1\n');
        const ch = { memberId: 'champ', role: 'champion' };
        b = O.applyOp(b, { type: 'addMember', memberId: 'champ', name: 'Sam', role: 'champion' }).board;
        b = O.applyOp(b, { type: 'addMember', memberId: 'mem', name: 'Dana', role: 'member' }, ch).board;
        b = O.applyOp(b, { type: 'addMember', memberId: 'view', name: 'Lee', role: 'viewer' }, ch).board;
        return b;
      };
      const base = make();
      const id = (t) => window.fbFind(base, t).id;
      const ops = {
        addCause: () => ({ type: 'addNode', id: window.fbId(), parentId: id('Other'), after: null, kind: 'cause', text: 'new' }),
        addUnderLocked: () => ({ type: 'addNode', id: window.fbId(), parentId: id('Parent'), after: null, kind: 'cause', text: 'new' }),
        addUnderBranchChild: () => ({ type: 'addNode', id: window.fbId(), parentId: id('Child'), after: null, kind: 'cause', text: 'new' }),
        addCategory: () => ({ type: 'addNode', id: window.fbId(), parentId: 'root', after: null, kind: 'category', text: 'New cat' }),
        editText: () => ({ type: 'setField', nodeId: id('Other'), field: 'text', value: 'Other2' }),
        editLocked: () => ({ type: 'setField', nodeId: id('Parent'), field: 'text', value: 'P2' }),
        editInsideBranch: () => ({ type: 'setField', nodeId: id('Child'), field: 'text', value: 'C2' }),
        status: () => ({ type: 'setField', nodeId: id('Other'), field: 'status', value: 'verified' }),
        moveCause: () => ({ type: 'move', nodeId: id('Other'), parentId: id('Machines'), after: null }),
        deleteHolder: () => ({ type: 'deleteNode', nodeId: id('Methods') }),
        renameCategory: () => ({ type: 'setField', nodeId: id('Machines'), field: 'text', value: 'Equipment' }),
        effect: () => ({ type: 'setBoard', field: 'effect', value: 'New problem' }),
        settings: () => ({ type: 'setBoard', field: 'settings', value: { angle: 50 } }),
        lock: () => ({ type: 'lock', nodeId: id('M1'), mode: 'item', note: '' }),
        boardLock: () => ({ type: 'setBoardLock', lock: 'frozen', value: true }),
        propose: () => ({ type: 'propose', nodeId: id('Other'), status: 'verified', evidenceNote: 'log' }),
        proposeLocked: () => ({ type: 'propose', nodeId: id('Parent'), status: 'verified', evidenceNote: '' }),
        setRole: () => ({ type: 'setRole', memberId: 'view', role: 'member' })
      };
      // Parent has an item lock; Child sits under a branch lock set on it.
      const ch = { memberId: 'champ', role: 'champion' };
      let locked = O.applyOp(base, { type: 'lock', nodeId: id('Parent'), mode: 'item', note: 'settled' }, ch).board;
      locked = O.applyOp(locked, { type: 'lock', nodeId: id('Child'), mode: 'branch', note: '' }, ch).board;
      const out = {};
      for (const role of ['champion', 'member', 'viewer']) {
        const actor = { memberId: { champion: 'champ', member: 'mem', viewer: 'view' }[role], role };
        out[role] = {};
        for (const [name, op] of Object.entries(ops)) out[role][name] = O.applyOp(locked, op(), actor, 0).result.reason || 'ok';
      }
      const frozen = O.applyOp(locked, { type: 'setBoardLock', lock: 'frozen', value: true }, ch).board;
      const catLocked = O.applyOp(locked, { type: 'setBoardLock', lock: 'categories', value: true }, ch).board;
      const effLocked = O.applyOp(locked, { type: 'setBoardLock', lock: 'effect', value: true }, ch).board;
      const mem = { memberId: 'mem', role: 'member' };
      out.frozenMember = O.applyOp(frozen, ops.addCause(), mem).result.reason;
      out.frozenChampion = O.applyOp(frozen, ops.addCause(), ch).result.ok;
      out.categoriesLocked = [O.applyOp(catLocked, ops.addCategory(), mem).result.reason, O.applyOp(catLocked, ops.renameCategory(), mem).result.reason, O.applyOp(catLocked, ops.addCause(), mem).result.ok];
      out.effectLocked = O.applyOp(effLocked, ops.effect(), mem).result.reason;
      const statusOff = O.applyOp(locked, { type: 'setBoardLock', lock: 'statuses', value: false }, ch).board;
      out.statusesOff = O.applyOp(statusOff, ops.status(), mem).result.ok;
      // A proposal changes nothing until accepted.
      const proposed = O.applyOp(locked, ops.propose(), mem).board;
      out.proposalStatus = window.fbFind(proposed, 'Other').status;
      const accepted = O.applyOp(proposed, { type: 'decideProposal', nodeId: id('Other'), accept: true }, ch).board;
      out.accepted = [window.fbFind(accepted, 'Other').status, window.fbFind(accepted, 'Other').evidence.map((e) => e.text), window.fbFind(accepted, 'Other').proposal];
      // The last champion cannot step down or be removed.
      out.lastChampion = [O.applyOp(locked, { type: 'setRole', memberId: 'champ', role: 'member' }, ch).result.reason, O.applyOp(locked, { type: 'removeMember', memberId: 'champ' }, ch).result.reason];
      return out;
    });
    expect(r.champion).toEqual(Object.fromEntries(Object.keys(r.champion).map((k) => [k, k === 'proposeLocked' ? 'LOCKED_NO_PROPOSAL' : 'ok'])));
    expect(r.member).toEqual({
      addCause: 'ok', addUnderLocked: 'ok', addUnderBranchChild: 'LOCKED_BY_CHAMPION', addCategory: 'ok', editText: 'ok',
      editLocked: 'LOCKED_BY_CHAMPION', editInsideBranch: 'LOCKED_BY_CHAMPION', status: 'STATUS_LOCKED', moveCause: 'ok',
      deleteHolder: 'LOCK_BELOW', renameCategory: 'ok', effect: 'ok', settings: 'CHAMPION_ONLY', lock: 'CHAMPION_ONLY',
      boardLock: 'CHAMPION_ONLY', propose: 'ok', proposeLocked: 'LOCKED_NO_PROPOSAL', setRole: 'CHAMPION_ONLY'
    });
    expect(Object.values(r.viewer).every((x) => x === 'VIEWER_READ_ONLY')).toBe(true);
    expect(r.frozenMember).toBe('FROZEN');
    expect(r.frozenChampion).toBe(true);
    expect(r.categoriesLocked).toEqual(['CATEGORIES_LOCKED', 'CATEGORIES_LOCKED', true]);
    expect(r.effectLocked).toBe('EFFECT_LOCKED');
    expect(r.statusesOff).toBe(true);
    expect(r.proposalStatus).toBe('');
    expect(r.accepted).toEqual(['verified', ['log'], null]);
    expect(r.lastChampion).toEqual(['LAST_CHAMPION', 'LAST_CHAMPION']);
  });

  test('a branch lock is checked on every descendant, and moving its ancestor is refused', async ({ page }) => {
    const r = await page.evaluate(() => {
      const O = window.FishboneDiagram.ops;
      let b = window.fbBoard('Methods\n  Top\n    Mid\n      Leaf\nMachines\n');
      b = O.applyOp(b, { type: 'addMember', memberId: 'mem', name: 'Dana', role: 'member' }).board;
      const [top, mid, leaf] = ['Top', 'Mid', 'Leaf'].map((t) => window.fbFind(b, t));
      b = O.applyOp(b, { type: 'lock', nodeId: mid.id, mode: 'branch', note: '' }).board;
      const mem = { memberId: 'mem', role: 'member' };
      const machines = window.fbFind(b, 'Machines');
      return [
        O.applyOp(b, { type: 'setField', nodeId: leaf.id, field: 'text', value: 'x' }, mem).result.reason,
        O.applyOp(b, { type: 'deleteNode', nodeId: leaf.id }, mem).result.reason,
        O.applyOp(b, { type: 'move', nodeId: top.id, parentId: machines.id, after: null }, mem).result.reason,
        O.applyOp(b, { type: 'deleteNode', nodeId: top.id }, mem).result.reason,
        O.applyOp(b, { type: 'setField', nodeId: top.id, field: 'text', value: 'ok' }, mem).result.ok
      ];
    });
    expect(r).toEqual(['LOCKED_BY_CHAMPION', 'LOCKED_BY_CHAMPION', 'LOCK_BELOW', 'LOCK_BELOW', true]);
  });

  test('solo is a champion: locks can be set and cleared', async ({ page }) => {
    const r = await page.evaluate(() => {
      const O = window.FishboneDiagram.ops;
      let b = window.fbBoard('M\n  A\n');
      const a = window.fbFind(b, 'A');
      const locked = O.applyOp(b, { type: 'lock', nodeId: a.id, mode: 'item', note: 'n' });
      const unlocked = O.applyOp(locked.board, { type: 'unlock', nodeId: a.id });
      return [O.SOLO_ACTOR.role, locked.result.ok, locked.board.nodes[a.id].lockedBy, unlocked.result.ok, unlocked.board.nodes[a.id].lock];
    });
    expect(r).toEqual(['champion', true, 'you', true, 'none']);
  });

  test('removing a member clears what they owned and withdraws their proposals', async ({ page }) => {
    const r = await page.evaluate(() => {
      const O = window.FishboneDiagram.ops;
      let b = window.fbBoard('M\n  A\n  B\n');
      b = O.applyOp(b, { type: 'addMember', memberId: 'mem', name: 'Dana', role: 'member' }).board;
      const [a, bb] = ['A', 'B'].map((t) => window.fbFind(b, t));
      b = O.applyOp(b, { type: 'setField', nodeId: a.id, field: 'owner', value: 'mem' }).board;
      b = O.applyOp(b, { type: 'propose', nodeId: bb.id, status: 'suspected', evidenceNote: '' }, { memberId: 'mem', role: 'member' }).board;
      const { board, result } = O.applyOp(b, { type: 'removeMember', memberId: 'mem' });
      return [result.clearedOwners.length, board.nodes[a.id].owner, board.nodes[bb.id].proposal, Object.keys(board.members)];
    });
    expect(r).toEqual([1, '', null, []]);
  });
});

test.describe('formats', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); await page.evaluate(installHelpers); });

  test('outline lines: head, keys, tags, owners, evidence, comments, bullets', async ({ page }) => {
    const r = await page.evaluate(() => {
      const O = window.FishboneDiagram.outline;
      const p = O.parseOutline([
        '# Short shots on cavity 3', 'preset: 6M', 'kind: process', '// a comment', '',
        '- Machines', '  * Nozzle blocked [v, @Maintenance lead]', '    > Flow test: 62%', '  + Heater drift [?]',
        '1. Materials', '  a) Moisture [ruled out]', '  • Regrind [x]', '\t◦ Tabbed [suspected]', 'Unsorted', '  Loose idea'
      ].join('\n'));
      return {
        effect: p.effect, preset: p.preset.value, kind: p.kind.value, findings: p.findings,
        cats: p.categories.map((c) => [c.text, c.children.map((x) => [x.text, x.status, x.owner, x.evidence])]),
        tabbed: p.categories[1].children[1].children.map((x) => [x.text, x.status]),
        bin: p.bin.children.map((x) => x.text)
      };
    });
    expect(r.effect).toBe('Short shots on cavity 3');
    expect([r.preset, r.kind]).toEqual(['6M', 'process']);
    expect(r.findings).toEqual([]);
    expect(r.cats).toEqual([
      ['Machines', [['Nozzle blocked', 'verified', 'Maintenance lead', ['Flow test: 62%']], ['Heater drift', 'suspected', '', []]]],
      ['Materials', [['Moisture', 'ruledOut', '', []], ['Regrind', 'ruledOut', '', []]]]
    ]);
    // A tab is four columns, so the tabbed line is deeper than the two-space ones.
    expect(r.tabbed).toEqual([['Tabbed', 'suspected']]);
    expect(r.bin).toEqual(['Loose idea']);
  });

  test('indent coercion, uniform indent, depth, orphans and duplicates are reported with their line', async ({ page }) => {
    const r = await page.evaluate(() => {
      const O = window.FishboneDiagram.outline;
      const coerced = O.parseOutline('Cat\n    A\n        B\n      C\n  D\n');
      const uniform = O.parseOutline('    Cat\n      A\n');
      const deep = O.parseOutline('Cat\n 1\n  2\n   3\n    4\n     5\n      6\n       7\n');
      const orphan = O.parseOutline('  floating\n    > evidence for it\nCat\n> nowhere\n');
      const dup = O.parseOutline('Cat\n  Same\n    x\n  same\n    y\nLater\n# heading\n  ends [bogus]\n');
      const codes = (p) => p.findings.map((f) => `${f.code}:${f.line}`);
      const tree = (items) => items.map((i) => [i.text, tree(i.children)]);
      return {
        coerced: codes(coerced), coercedTree: tree(coerced.categories),
        uniform: [codes(uniform), uniform.categories[0].text, uniform.categories[0].children[0].text],
        deep: codes(deep), deepest: (function walk(items, d) { return items.reduce((m, i) => Math.max(m, walk(i.children, d + 1)), d); })(deep.categories[0].children, 0),
        orphan: codes(orphan), orphanBin: orphan.bin.children.map((x) => [x.text, x.evidence]),
        dup: codes(dup), dupTree: tree(dup.categories), unknownKept: dup.categories[1].children[0].text
      };
    });
    expect(r.coerced).toEqual(['INDENT_COERCED:4', 'INDENT_COERCED:5']);
    expect(r.coercedTree).toEqual([['Cat', [['A', [['B', []], ['C', []]]], ['D', []]]]]);
    expect(r.uniform).toEqual([['UNIFORM_INDENT:1'], 'Cat', 'A']);
    expect(r.deep).toEqual(['TOO_DEEP:8']);
    expect(r.deepest).toBe(6);
    expect(r.orphan).toEqual(['NO_CATEGORY:1', 'EVIDENCE_NO_CAUSE:4']);
    expect(r.orphanBin).toEqual([['floating', ['evidence for it']]]);
    expect(r.dup).toEqual(['DUPLICATE_MERGED:4', 'HASH_LINE:7', 'UNKNOWN_TAG:8']);
    expect(r.dupTree[0]).toEqual(['Cat', [['Same', [['x', []], ['y', []]]]]]);
    expect(r.unknownKept).toBe('ends [bogus]');
  });

  test('outline round trip is exact for every example and for text that looks like syntax', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const O = F.outline;
      const trip = (b) => {
        const text = O.toOutline(b);
        const again = window.fbBoard(text);
        return { same: O.toOutline(again) === text, findings: O.parseOutline(text).findings.length };
      };
      const examples = F.presets.EXAMPLES.map((e) => trip(window.fbBoard(e.text)));
      let b = window.fbBoard('Cat\n  x\n');
      const cat = b.order.root[0];
      const odd = ['> not evidence', '// not a comment', '# not a heading', 'ends in a bracket [x]', 'back\\slash', '- dash first', '1. numbered', 'a) lettered', '[v] leading tag', 'two [a] [b]'];
      for (const text of odd) b = F.ops.applyOp(b, { type: 'addNode', id: window.fbId(), parentId: cat, after: null, kind: 'cause', text }).board;
      for (const text of ['effect: not a key', 'Unsorted again', '\\escaped']) b = F.ops.applyOp(b, { type: 'addNode', id: window.fbId(), parentId: 'root', after: null, kind: 'category', text }).board;
      const back = window.fbBoard(O.toOutline(b));
      const texts = (board) => Object.values(board.nodes).filter((n) => !n.deleted).map((n) => n.text).sort();
      return { examples, oddSame: JSON.stringify(texts(back)) === JSON.stringify(texts(b)), oddFindings: O.parseOutline(O.toOutline(b)).findings };
    });
    expect(r.examples.every((e) => e.same && e.findings === 0)).toBe(true);
    expect(r.oddFindings).toEqual([]);
    expect(r.oddSame).toBe(true);
  });

  test('Edit as text keeps ids, locks and evidence of unchanged lines, and keeps removals undoable', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const O = F.outline;
      let b = window.fbBoard('Methods\n  Keep me [verified]\n    > log\n  Drop me\n    Its child\n');
      const keep = window.fbFind(b, 'Keep me');
      const drop = window.fbFind(b, 'Drop me');
      b = F.ops.applyOp(b, { type: 'lock', nodeId: keep.id, mode: 'item', note: 'n' }).board;
      const next = O.rebuildFromOutline(b, O.parseOutline('Methods\n  Keep me [verified]\n    > log\n  Added\n'), { newId: window.fbId, now: 5 });
      const restored = F.ops.applyOp(next, { type: 'restoreNode', nodeId: drop.id });
      return {
        sameId: next.nodes[keep.id] && next.nodes[keep.id].text === 'Keep me',
        lock: next.nodes[keep.id].lock, evidenceId: next.nodes[keep.id].evidence[0].id === keep.evidence[0].id,
        dropped: next.nodes[drop.id].deleted, last: next.history[next.history.length - 1].summary,
        restored: restored.result.ok && O.toOutline(restored.board).includes('    Its child')
      };
    });
    expect(r).toEqual({ sameId: true, lock: 'item', evidenceId: true, dropped: true, last: 'Edited as text, 2 items removed', restored: true });
  });

  test('pasting adds into matching categories and changes nothing already there', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const O = F.outline;
      let b = window.fbBoard('Methods\n  A\n');
      const ops = O.pasteOps(b, O.parseOutline('methods\n  B\nNew cat\n  C\n'), window.fbId);
      for (const op of ops) b = F.ops.applyOp(b, op).board;
      return O.toOutline(b);
    });
    expect(r).toBe('Methods\n  A\n  B\nNew cat\n  C\n');
  });

  test('Mermaid: the documented example imports to the right tree, and export reads back', async ({ page }) => {
    // The example from the Mermaid Ishikawa page (v11.12.3), archived in data/fishbone_diagram/sources/.
    const DOC = 'ishikawa-beta\n    Blurry Photo\n    Process\n        Out of focus\n        Shutter speed too slow\n        Protective film not removed\n        Beautification filter applied\n    User\n        Shaky hands\n    Equipment\n        LENS\n            Inappropriate lens\n            Damaged lens\n            Dirty lens\n        SENSOR\n            Damaged sensor\n            Dirty sensor\n    Environment\n        Subject moved too quickly\n        Too dark\n';
    const r = await page.evaluate((doc) => {
      const F = window.FishboneDiagram;
      const p = F.mermaid.parseMermaid(doc);
      const tree = (items) => items.map((i) => [i.text, tree(i.children)]);
      const b = F.outline.boardFromOutline(p, { newId: window.fbId });
      const again = F.mermaid.parseMermaid(F.mermaid.toMermaid(b));
      const s = F.ops.applyOp(b, { type: 'setField', nodeId: window.fbFind(b, 'Too dark').id, field: 'status', value: 'verified' }).board;
      return {
        effect: p.effect, tree: tree(p.categories), findings: p.findings,
        exportSame: F.mermaid.toMermaid(b) === doc, againTree: JSON.stringify(tree(again.categories)) === JSON.stringify(tree(p.categories)),
        statusLine: F.mermaid.toMermaid(s).split('\n').find((l) => l.includes('Too dark')),
        notMermaid: F.mermaid.parseMermaid('flowchart LR\n  A --> B').ok,
        comment: F.mermaid.mermaidText('50%% of runs\nfail')
      };
    }, DOC);
    expect(r.effect).toBe('Blurry Photo');
    expect(r.tree).toEqual([
      ['Process', [['Out of focus', []], ['Shutter speed too slow', []], ['Protective film not removed', []], ['Beautification filter applied', []]]],
      ['User', [['Shaky hands', []]]],
      ['Equipment', [['LENS', [['Inappropriate lens', []], ['Damaged lens', []], ['Dirty lens', []]]], ['SENSOR', [['Damaged sensor', []], ['Dirty sensor', []]]]]],
      ['Environment', [['Subject moved too quickly', []], ['Too dark', []]]]
    ]);
    expect(r.findings).toEqual([]);
    expect(r.exportSame).toBe(true);
    expect(r.againTree).toBe(true);
    expect(r.statusLine).toBe('        Too dark (verified)');
    expect(r.notMermaid).toBe(false);
    expect(r.comment).toBe('50% of runs fail');
  });

  test('CSV: formula characters are neutralized and quotes, commas and newlines survive', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      let b = window.fbBoard('M\n');
      const cat = b.order.root[0];
      const texts = ['=SUM(A1)', '+1', '-2', '@x', 'say "hi", then', 'plain'];
      let last = null;
      for (const text of texts) { const id = window.fbId(); b = F.ops.applyOp(b, { type: 'addNode', id, parentId: cat, after: last, kind: 'cause', text }).board; last = id; }
      b = F.ops.applyOp(b, { type: 'setField', nodeId: last, field: 'evidence', value: [{ id: 'e1', text: 'line one' }, { id: 'e2', text: 'line, two' }] }).board;
      const text = F.csv.toCsv(b);
      // RFC 4180 parse.
      const rows = [];
      let row = [];
      let cell = '';
      let q = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
        else if (ch === '"') q = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\r') { /* part of CRLF */ }
        else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
        else cell += ch;
      }
      return { head: rows[0], causes: rows.slice(1).map((x) => x[2]), evidence: rows[rows.length - 1][6] };
    });
    expect(r.head).toEqual(['Category', 'Level', 'Cause', 'Path', 'Status', 'Owner', 'Evidence', 'Votes']);
    expect(r.causes).toEqual(["'=SUM(A1)", "'+1", "'-2", "'@x", 'say "hi", then', 'plain']);
    expect(r.evidence).toBe('line one\nline, two');
  });

  test('stored junk is cleaned: wrong types, orphans, cycles, newer schemas', async ({ page }) => {
    const r = await page.evaluate(() => {
      const S = window.FishboneDiagram.schema;
      const A = 'AAAAAAAAAAAA';
      const B = 'BBBBBBBBBBBB';
      const C = 'CCCCCCCCCCCC';
      const D = 'DDDDDDDDDDDD';
      const junk = {
        schema: 1, title: { evil: true }, effect: 'x'.repeat(500), settings: { angle: 999, wrap: 20, showEmpty: 'yes' },
        nodes: {
          [A]: { kind: 'category', text: '<img src=x onerror=alert(1)>', parentId: 'root' },
          [B]: { kind: 'cause', text: 'orphan', parentId: 'ZZZZZZZZZZZZ', status: 'certainly', evidence: 'nope' },
          [C]: { kind: 'cause', text: 'loop1', parentId: D },
          [D]: { kind: 'cause', text: 'loop2', parentId: C },
          bad: { kind: 'cause', text: 'bad id' }
        },
        order: { root: [A, A, 'ghost'] }
      };
      const { board } = S.cleanBoard(junk);
      return {
        title: board.title, effectLen: board.effect.length, settings: board.settings,
        orphan: [board.nodes[B].parentId, board.nodes[B].status, board.nodes[B].evidence],
        loopFixed: [board.nodes[C].parentId === 'unsorted' || board.nodes[D].parentId === 'unsorted'],
        badDropped: !board.nodes.bad, rootOrder: board.order.root,
        markup: board.nodes[A].text,
        newer: S.cleanBoard({ schema: 99, nodes: {} }).error,
        notBoard: S.cleanBoard('string').error
      };
    });
    expect(r.title).toBe('');
    expect(r.effectLen).toBe(200);
    expect(r.settings).toEqual({ angle: 60, wrap: 20, showEmpty: true });
    expect(r.orphan).toEqual(['unsorted', '', []]);
    expect(r.loopFixed).toEqual([true]);
    expect(r.badDropped).toBe(true);
    expect(r.rootOrder).toEqual(['AAAAAAAAAAAA', 'unsorted']);
    expect(r.markup).toBe('<img src=x onerror=alert(1)>');
    expect(r.newer).toBe('newer');
    expect(r.notBoard).toBe('notBoard');
  });

  test('merge: field rows, added items, removed locks, and unrelated files', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const O = F.ops;
      let mine = window.fbBoard('M\n  A\n  B\n');
      const [a, b] = ['A', 'B'].map((t) => window.fbFind(mine, t));
      mine = O.applyOp(mine, { type: 'lock', nodeId: b.id, mode: 'item', note: '' }).board;
      let theirs = O.applyOp(mine, { type: 'setField', nodeId: a.id, field: 'text', value: 'A theirs' }).board;
      theirs = O.applyOp(theirs, { type: 'unlock', nodeId: b.id }).board;
      theirs = O.applyOp(theirs, { type: 'addNode', id: window.fbId(), parentId: a.id, after: null, kind: 'cause', text: 'their why' }).board;
      const cmp = F.merge.compareBoards(mine, theirs);
      const keepMine = F.merge.applyMerge(mine, theirs, {});
      const takeText = F.merge.applyMerge(mine, theirs, { [`${a.id}:text`]: 'theirs' });
      return {
        rows: cmp.rows.map((x) => x.key.split(':')[1]), added: cmp.added.length, locks: cmp.removedLocks.map((l) => l.text),
        keepMine: F.outline.toOutline(keepMine), takeText: F.outline.toOutline(takeText), lockKept: keepMine.nodes[b.id].lock,
        unrelated: F.merge.compareBoards(mine, window.fbBoard('X\n  y\n')).unrelated
      };
    });
    expect(r.rows.sort()).toEqual(['lock', 'text']);
    expect(r.added).toBe(1);
    expect(r.locks).toEqual(['B']);
    expect(r.keepMine).toBe('M\n  A\n    their why\n  B\n');
    expect(r.takeText).toBe('M\n  A theirs\n    their why\n  B\n');
    expect(r.lockKept).toBe('item');
    expect(r.unrelated).toBe(true);
  });

  test('snapshot links: every example round trips, and damaged, oversized or hostile links open nothing', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const F = window.FishboneDiagram;
      const L = F.link;
      const out = [];
      for (const e of F.presets.EXAMPLES) {
        const b = window.fbBoard(e.text);
        const packed = await L.packLink(b, { baseUrl: 'https://example.test/tools/fishbone-diagram.html', name: e.label, now: 123 });
        const back = await L.unpackLink(L.linkFromHash(`#${packed.url.split('#')[1]}`));
        out.push(packed.ok && back.ok && back.at === 123 && F.outline.toOutline(back.board) === F.outline.toOutline(b));
      }
      // A board too big for a link, and the evidence switch.
      let big = window.fbBoard('Cat\n');
      const cat = big.order.root[0];
      let seed = 7;
      const word = () => { seed = (seed * 48271) % 2147483647; return seed.toString(36); };
      for (let i = 0; i < 120; i++) {
        const id = window.fbId();
        big = F.ops.applyOp(big, { type: 'addNode', id, parentId: cat, after: null, kind: 'cause', text: `${word()} ${word()} ${word()}`, evidence: [{ id: 'e1', text: `${word()} ${word()} ${word()} ${word()} ${word()} ${word()}` }] }).board;
      }
      const tooBig = await L.packLink(big, { baseUrl: 'https://example.test/x.html' });
      const noEvidence = await L.packLink(big, { baseUrl: 'https://example.test/x.html', dropEvidence: true });
      const good = await L.packLink(window.fbBoard(F.presets.EXAMPLES[0].text), { baseUrl: 'https://e.test/x.html' });
      const packed = good.url.split('#snap=')[1];
      const hostile = window.fbBoard('<script>x</script>\n  <img src=x onerror=alert(1)>\n');
      const hostileBack = await L.unpackLink((await L.packLink(hostile, { baseUrl: 'https://e.test/x.html' })).url.split('#snap=')[1]);
      return {
        out,
        tooBig: [tooBig.ok, tooBig.length > F.LIMITS.linkChars, tooBig.message.startsWith('Too large for a link')],
        noEvidence: [noEvidence.ok, noEvidence.length < tooBig.length],
        truncated: (await L.unpackLink(packed.slice(0, packed.length - 20))).ok,
        badChars: (await L.unpackLink(`${packed}!`)).ok,
        oversized: (await L.unpackLink('A'.repeat(F.LIMITS.linkChars + 1))).ok,
        empty: (await L.unpackLink('')).message,
        hostile: hostileBack.ok && Object.values(hostileBack.board.nodes).map((n) => n.text).sort()
      };
    });
    expect(r.out).toEqual([true, true, true, true, true, true]);
    expect(r.tooBig).toEqual([false, true, true]);
    expect(r.noEvidence[1]).toBe(true);
    expect(r.truncated).toBe(false);
    expect(r.badChars).toBe(false);
    expect(r.oversized).toBe(false);
    expect(r.empty).toBe('This link is damaged or incomplete. Nothing from it was opened.');
    expect(r.hostile).toEqual(['<img src=x onerror=alert(1)>', '<script>x</script>']);
  });
});

test.describe('checks and tally', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); await page.evaluate(installHelpers); });

  test('each word list, empty and sparse categories, duplicates and missing evidence', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const b = window.fbBoard([
        'effect: Need a new mold',
        'Methods',
        '  Install a guard', '  Train operators', '  Lack of training', '  Should check daily',
        '  Human error', '  Operator error', '    why it was easy to make',
        '  Same cause', '  same  cause',
        '  Verified with nothing [verified]', '  Ruled out with nothing [ruled out]',
        '    Under ruled out [verified]', '      > a log',
        '  Additive mix varies',
        '  Shared cause',
        'Machines',
        '  Shared cause',
        'Materials'
      ].join('\n'));
      return F.checks.runChecks(b).map((c) => `${c.code}${c.nodeId ? `:${b.nodes[c.nodeId].text}` : ''}`);
    });
    expect(r).toEqual([
      'EFFECT_IS_FIX',
      'SPARSE_CATEGORY:Machines',
      'EMPTY_CATEGORY:Materials',
      'CAUSE_IS_FIX:Install a guard',
      'CAUSE_IS_FIX:Train operators',
      'LACK_OF:Lack of training',
      'CAUSE_IS_FIX:Should check daily',
      'HUMAN_ERROR:Human error',
      'VERIFIED_NO_EVIDENCE:Verified with nothing',
      'RULED_OUT_NO_EVIDENCE:Ruled out with nothing',
      'VERIFIED_UNDER_RULED_OUT:Under ruled out',
      'SAME_IN_CATEGORIES:Shared cause'
    ]);
    // The parser merged "same  cause" into "Same cause"; a typed duplicate is flagged instead.
    const dup = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      let b = window.fbBoard('effect: Late\nM\n  One\n');
      const cat = b.order.root[0];
      b = F.ops.applyOp(b, { type: 'addNode', id: window.fbId(), parentId: cat, after: null, kind: 'cause', text: 'one' }).board;
      return F.checks.runChecks(b).map((c) => c.code);
    });
    expect(dup).toContain('DUPLICATE_SIBLING');
    expect(await page.evaluate(() => window.FishboneDiagram.checks.WORDS.fixStarts)).toEqual(['install', 'add', 'train', 'implement', 'need', 'should']);
  });

  test('the tally line counts every status, the deepest chain and empty categories', async ({ page }) => {
    const r = await page.evaluate(() => {
      const C = window.FishboneDiagram.checks;
      return [
        C.tallyLine(window.fbBoard('A\n  a [v]\n    b [x]\n      c [?]\n  d\nB\nC\nUnsorted\n  e\n  f\n')),
        C.tallyLine(window.fbBoard('Only\n')),
        C.tallyLine(window.fbBoard('One\n  x [verified]\n'))
      ];
    });
    expect(r).toEqual([
      '6 causes in 3 categories, 2 still unsorted: 1 verified, 1 ruled out, 1 suspected, 3 not examined. Deepest chain 3 whys. B and C have nothing listed.',
      '0 causes in 1 category. Only has nothing listed.',
      '1 cause in 1 category: 1 verified. Deepest chain 1 why.'
    ]);
  });

  test('every preset names its source, and examples parse cleanly with the flags they teach', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      return {
        presets: F.presets.PRESETS.map((p) => [p.id, p.categories.length, Boolean(p.source) || p.id === 'none']),
        lookup: ['6m', 'Primary care 5 Ps', 'software', 'nope'].map(F.presets.lookupPreset),
        examples: F.presets.EXAMPLES.map((e) => {
          const p = F.outline.parseOutline(e.text);
          const b = window.fbBoard(e.text);
          return [e.id, p.findings.length, F.checks.runChecks(b).map((c) => c.code).join(',')];
        })
      };
    });
    expect(r.presets).toEqual([['6m', 6, true], ['classic-five', 5, true], ['primary-care-5ps', 5, true], ['8m', 8, true], ['8p', 8, true], ['4s', 4, true], ['software', 7, true], ['none', 0, true]]);
    expect(r.lookup).toEqual(['6m', 'primary-care-5ps', 'software', null]);
    expect(r.examples).toEqual([
      ['short-shots', 0, ''],
      ['late-pizza', 0, 'EMPTY_CATEGORY'],
      ['nightly-backup', 0, ''],
      ['check-in-wait', 0, 'HUMAN_ERROR'],
      ['late-invoices', 0, ''],
      ['support-brainstorm', 0, '']
    ]);
  });
});

test.describe('layout', () => {
  test.beforeEach(async ({ page }) => { await openTool(page); await page.evaluate(installHelpers); });

  // Run in the page: invariants for one board, with the fixed-width measure.
  function invariants() {
    const F = window.FishboneDiagram;
    window.fbCheck = (board) => {
      const L = F.layout;
      const lay = L.layoutBoard(board, { measure: L.fixedMeasure, showEvidence: true });
      const problems = [];
      const boxes = [];
      for (const it of lay.items) {
        for (const l of it.lines) boxes.push({ ...l, id: it.nodeId });
        for (const ev of it.evidence) for (const l of ev.lines) boxes.push({ ...l, id: `${it.nodeId}ev` });
      }
      for (const bone of lay.bones) { boxes.push({ ...bone.label, id: `label${bone.categoryId}` }); if (bone.empty) boxes.push({ ...bone.empty, id: `empty${bone.categoryId}` }); }
      boxes.push({ ...lay.head, id: 'head' });
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const c = boxes[j];
          if (a.x0 < c.x1 - 0.01 && c.x0 < a.x1 - 0.01 && a.y0 < c.y1 - 0.01 && c.y0 < a.y1 - 0.01) problems.push(`overlap ${a.id} ${c.id}`);
        }
      }
      const byId = new Map(lay.items.map((it) => [it.nodeId, it]));
      for (const it of lay.items) {
        if (it.side === 'bin') continue;
        const bone = lay.bones.find((b) => b.categoryId === it.categoryId);
        if (it.depth === 1) {
          // The underline's right end lies on the bone.
          const t = (it.underline.y - bone.y0) / (bone.y1 - bone.y0);
          const x = bone.x0 + t * (bone.x1 - bone.x0);
          if (Math.abs(x - it.underline.x1) > 0.02) problems.push(`off bone ${it.nodeId}`);
        } else {
          const parent = byId.get(board.nodes[it.nodeId].parentId);
          const c = it.connector;
          if (Math.abs(c.y1 - parent.underline.y) > 0.01 || c.x1 < parent.underline.x0 - 0.01 || c.x1 > parent.underline.x1 + 0.01) problems.push(`connector ${it.nodeId}`);
          // Parallel to the bone.
          const boneSlope = (bone.x1 - bone.x0) / (bone.y1 - bone.y0);
          const slope = (c.x1 - c.x0) / (c.y1 - c.y0);
          if (Math.abs(slope - boneSlope) > 0.01) problems.push(`not parallel ${it.nodeId}`);
        }
        // Every corner of every line inside its band.
        const band = bone.band;
        const sign = Math.sign((band[1][0] - band[0][0]) * (band[2][1] - band[0][1]) - (band[1][1] - band[0][1]) * (band[2][0] - band[0][0]));
        for (const l of [...it.lines, ...it.evidence.flatMap((e) => e.lines)]) {
          for (const pt of [[l.x0, l.y0], [l.x1, l.y0], [l.x0, l.y1], [l.x1, l.y1]]) {
            for (let k = 0; k < 4; k++) {
              const a = band[k];
              const b = band[(k + 1) % 4];
              const cross = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]);
              if (cross * sign < -0.05 * Math.hypot(b[0] - a[0], b[1] - a[1])) { problems.push(`out of band ${it.nodeId}`); k = 4; }
            }
          }
        }
      }
      // Bands of different pairs do not overlap: slots are disjoint and each band stays in its slot.
      for (let i = 1; i < lay.slots.length; i++) if (lay.slots[i].x0 < lay.slots[i - 1].x1) problems.push('slots overlap');
      for (const bone of lay.bones) {
        const slot = lay.slots.find((s) => s.boneX === bone.x0);
        const xs = [...bone.band.map((p) => p[0]), bone.label.x0, bone.label.x1];
        if (Math.min(...xs) < slot.x0 - 0.01 || Math.max(...xs) > slot.x1 + 0.01) problems.push(`band leaves slot ${bone.categoryId}`);
      }
      for (const b of boxes) if (b.x0 < 0 || b.y0 < 0 || b.x1 > lay.width || b.y1 > lay.height) problems.push(`outside ${b.id}`);
      return { problems, lay };
    };
    // A seeded random board.
    window.fbRandom = (seed) => {
      let s = seed;
      const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
      const words = ['valve', 'pump', 'shift', 'late', 'operator', 'gauge', 'drift', 'spec', 'supplier', 'humidity', 'calibration', 'training', 'setup', 'sheet', 'nozzle', 'cooling'];
      const phrase = () => Array.from({ length: 1 + Math.floor(rnd() * 9) }, () => words[Math.floor(rnd() * words.length)]).join(' ');
      let b = F.ops.emptyBoard();
      b = F.ops.applyOp(b, { type: 'setBoard', field: 'effect', value: phrase() }).board;
      b = F.ops.applyOp(b, { type: 'setBoard', field: 'settings', value: { angle: 45 + Math.floor(rnd() * 31), wrap: 12 + Math.floor(rnd() * 30) } }).board;
      const cats = 1 + Math.floor(rnd() * 8);
      const nodes = [];
      let after = null;
      for (let i = 0; i < cats; i++) {
        const id = window.fbId();
        b = F.ops.applyOp(b, { type: 'addNode', id, parentId: 'root', after, kind: 'category', text: phrase() }).board;
        after = id;
        nodes.push({ id, depth: 0 });
      }
      const count = Math.floor(rnd() * 40);
      const statuses = ['', 'suspected', 'verified', 'ruledOut'];
      for (let i = 0; i < count; i++) {
        const parent = nodes[Math.floor(rnd() * nodes.length)];
        if (parent.depth >= 6) continue;
        const id = window.fbId();
        const evidence = rnd() < 0.2 ? [{ id: 'e1', text: phrase() }] : undefined;
        const res = F.ops.applyOp(b, { type: 'addNode', id, parentId: parent.id, after: null, kind: 'cause', text: phrase(), status: statuses[Math.floor(rnd() * 4)], evidence });
        b = res.board;
        if (res.result.ok) nodes.push({ id, depth: parent.depth + 1 });
        if (rnd() < 0.05) b = F.ops.applyOp(b, { type: 'lock', nodeId: id, mode: 'item', note: '' }).board;
      }
      return b;
    };
  }

  test('no overlaps, connectors meet their parents, everything stays in its band and frame: examples and 60 random boards', async ({ page }) => {
    await page.evaluate(invariants);
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const out = {};
      for (const e of F.presets.EXAMPLES) out[e.id] = window.fbCheck(window.fbBoard(e.text)).problems;
      const random = [];
      for (let seed = 1; seed <= 60; seed++) {
        const { problems } = window.fbCheck(window.fbRandom(seed * 7919));
        if (problems.length) random.push(`${seed}: ${problems.slice(0, 3).join(', ')}`);
      }
      out.random = random;
      return out;
    });
    for (const [key, problems] of Object.entries(r)) expect(problems, key).toEqual([]);
  });

  test('the below side is the exact mirror of the same category laid out above', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const L = F.layout;
      const text = 'Spacer\n  s\nMirror\n  A long cause that wraps over more than one line of text here\n    Its why\n      And deeper\n  B [verified]\n';
      const two = window.fbBoard(text);
      // The same category alone sits above the spine.
      const one = window.fbBoard(text.replace('Spacer\n  s\n', ''));
      const below = L.layoutBoard(two, { measure: L.fixedMeasure });
      const above = L.layoutBoard(one, { measure: L.fixedMeasure });
      const name = (b, it) => b.nodes[it.nodeId].text;
      const bBone = below.bones[1];
      const aBone = above.bones[0];
      const dx = bBone.x0 - aBone.x0;
      const sy = below.spine.y;
      const ay = above.spine.y;
      const diffs = [];
      for (const it of below.items.filter((x) => x.categoryId === bBone.categoryId)) {
        const twin = above.items.find((x) => name(one, x) === name(two, it));
        const near = (u, v) => Math.abs(u - v) < 0.02;
        // Lines reflect about the spine; text boxes reflect as blocks, so each line keeps its order.
        if (!near(it.underline.y - sy, ay - twin.underline.y) || !near(it.underline.x1 - dx, twin.underline.x1)) diffs.push(`underline ${name(two, it)}`);
        const blockTop = Math.min(...it.lines.map((l) => l.y0));
        const twinBottom = Math.max(...twin.lines.map((l) => l.y1));
        if (!near(blockTop - sy, ay - twinBottom)) diffs.push(`block ${name(two, it)}`);
        it.lines.forEach((l, i) => { if (l.text !== twin.lines[i].text || !near(l.x1 - l.x0, twin.lines[i].x1 - twin.lines[i].x0)) diffs.push(`line ${i}`); });
        if (it.lines.length > 1 && !(it.lines[0].y0 < it.lines[1].y0)) diffs.push('order');
      }
      return { diffs, side: bBone.side, boneMirror: Math.abs((bBone.y1 - sy) + (aBone.y1 - ay)) < 0.02 };
    });
    expect(r.side).toBe('below');
    expect(r.boneMirror).toBe(true);
    expect(r.diffs).toEqual([]);
  });

  test('the same tree gives the same SVG, and editing one pair only slides the others', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const L = F.layout;
      const svg = (b) => new XMLSerializer().serializeToString(F.render.renderBoard(document, b, L.layoutBoard(b, { measure: L.fixedMeasure }), { palette: F.render.PALETTES.light }));
      const b = window.fbBoard(F.presets.EXAMPLES[2].text);
      const same = svg(b) === svg(JSON.parse(JSON.stringify(b)));
      // Lengthen a cause in the first pair.
      const target = window.fbFind(b, 'Job does not retry after a network timeout');
      const edited = F.ops.applyOp(b, { type: 'setField', nodeId: target.id, field: 'text', value: `${target.text} and much longer text that wraps onto more lines` }).board;
      const before = L.layoutBoard(b, { measure: L.fixedMeasure });
      const after = L.layoutBoard(edited, { measure: L.fixedMeasure });
      const shapes = (lay) => lay.bones.slice(2).map((bone) => [bone.x1 - bone.x0, bone.y1 - bone.y0, bone.label.x1 - bone.label.x0]);
      // Coordinates are rounded to 0.01 px, so a shape matches within 0.02.
      const sameShape = shapes(before).every((s, i) => s.every((v, j) => Math.abs(v - shapes(after)[i][j]) < 0.02));
      return { same, firstChanged: before.bones[0].x0 !== after.bones[0].x0 || before.slots[0].x1 !== after.slots[0].x1, othersSameShape: sameShape };
    });
    expect(r.same).toBe(true);
    expect(r.firstChanged).toBe(true);
    expect(r.othersSameShape).toBe(true);
  });

  test('bands are sized by wrapped rows, not by cause count', async ({ page }) => {
    const r = await page.evaluate(() => {
      const L = window.FishboneDiagram.layout;
      const m = L.METRICS;
      const text = (k) => 'word '.repeat(k).trim();
      const h = (b) => L.layoutBoard(b, { measure: L.fixedMeasure }).bones[0].height;
      // Cause text wraps at the wrap width less the room for its status mark.
      const rows = (k) => L.wrapText(text(k), 26 * m.font - m.markW, L.fixedMeasure, m.font).length;
      const one = (k) => window.fbBoard(`C\n  ${text(k)}\n`);
      const three = window.fbBoard('C\n  a\n  b\n  c\n');
      const firstWith = (n) => { let k = 1; while (rows(k) < n) k += 1; return k; };
      const [k2, k3, k4] = [2, 3, 4].map(firstWith);
      return { rows: [rows(k2), rows(k3), rows(k4)], diff: h(one(k4)) - h(one(k2)), threeVsWrapped: h(three) - h(one(k3)), rowH: m.rowH, gap: m.rowGap };
    });
    expect(r.rows).toEqual([2, 3, 4]);
    expect(r.diff).toBe(2 * r.rowH);
    // Three one-row causes against one cause wrapped to three rows: the same rows, so only the gaps differ.
    expect(r.threeVsWrapped).toBe(2 * r.gap);
  });

  test('statuses are never color alone: marks, line styles and text styles survive colors off', async ({ page }) => {
    const r = await page.evaluate(() => {
      const F = window.FishboneDiagram;
      const L = F.layout;
      const b = window.fbBoard('C\n  n\n  s [?]\n  v [v]\n  r [x]\n');
      const svg = F.render.renderBoard(document, b, L.layoutBoard(b, { measure: L.fixedMeasure }), { palette: F.render.monochrome(F.render.PALETTES.light) });
      const out = {};
      for (const g of svg.querySelectorAll('.fb-item')) {
        const line = g.querySelector('.fb-underline');
        out[g.querySelector('text').textContent] = [
          g.querySelector('.fb-mark').getAttribute('data-mark'), g.querySelector('.fb-mark').childElementCount > 0,
          line.getAttribute('stroke-width'), line.getAttribute('stroke-dasharray'), g.querySelector('text').getAttribute('font-weight'),
          Boolean(g.querySelector('.fb-strike'))
        ];
      }
      const colors = new Set([...svg.querySelectorAll('.fb-item [stroke], .fb-item [fill]')].flatMap((e) => [e.getAttribute('stroke'), e.getAttribute('fill')]).filter((c) => c && c !== 'none'));
      return { out, colors: [...colors].sort() };
    });
    expect(r.out).toEqual({
      n: ['none', false, '1.2', null, '400', false],
      s: ['suspected', true, '1.2', '5 3', '400', false],
      v: ['verified', true, '3', null, '700', false],
      r: ['ruledOut', true, '1.2', null, '400', true]
    });
    // Colors off draws in the ink, line and muted grays only.
    expect(r.colors.every((c) => ['#1f2937', '#374151', '#4b5563'].includes(c))).toBe(true);
  });

  test('both diagram palettes give text at least 4.5:1 on their own backgrounds', async ({ page }) => {
    const r = await page.evaluate(() => {
      const P = window.FishboneDiagram.render.PALETTES;
      const lum = (hex) => {
        const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const out = {};
      for (const [name, p] of Object.entries(P)) {
        out[name] = Math.min(ratio(p.ink, p.bg), ratio(p.muted, p.bg), ratio(p.labelText, p.labelFill), ratio(p.headText, p.headFill), ratio(p.ink, p.binFill), ratio(p.muted, p.binFill), ratio(p.accent, p.bg));
      }
      return out;
    });
    expect(r.light).toBeGreaterThanOrEqual(4.5);
    expect(r.dark).toBeGreaterThanOrEqual(4.5);
  });
});
