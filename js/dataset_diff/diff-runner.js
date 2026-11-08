// Page side of the parse workers: one worker per side so both sources parse
// at once. Stop, a replaced input or the time limit terminates that side's
// worker and rejects what was waiting with the reason. A reply already in
// flight finds no waiting request and is dropped, never delivered.

import { LIMITS } from './diff-limits.js';
import { decodeRows } from './diff-values.js';

export class Runner {
    constructor(workerUrl, { timeLimitMs = LIMITS.requestSeconds * 1000 } = {}) {
        this.url = workerUrl;
        this.timeLimitMs = timeLimitMs;
        this.workers = { left: null, right: null, compare: null };
        this.pending = new Map();
        this.nextId = 1;
        this.dropped = 0;
        this.keepWarm = false;
    }

    // Starts the workers and their scripts now, so a file chosen later (even
    // offline) needs no download. Side workers also load SheetJS.
    warm() {
        this.keepWarm = true;
        for (const side of ['left', 'right', 'compare']) this.warmSide(side);
    }

    warmSide(side) {
        this.request(side, { type: 'warm', sheetjs: side !== 'compare' }).catch(() => {});
    }

    worker(side) {
        if (!this.workers[side]) {
            const w = new Worker(this.url);
            w.onmessage = (e) => this.settle(side, e.data);
            w.onerror = (e) => {
                e.preventDefault();
                this.reset(side, { kind: 'worker-failed', message: e.message || 'worker failed to load' });
            };
            this.workers[side] = w;
        }
        return this.workers[side];
    }

    request(side, message, transfer = []) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => this.reset(side, { kind: 'time-limit', seconds: this.timeLimitMs / 1000 }), this.timeLimitMs);
            this.pending.set(id, { side, resolve, reject, timer });
            this.worker(side).postMessage({ ...message, id }, transfer);
        });
    }

    settle(side, data) {
        const p = this.pending.get(data.id);
        if (!p) { this.dropped++; return; }
        clearTimeout(p.timer);
        this.pending.delete(data.id);
        if (data.ok) p.resolve(data.value);
        else p.reject(data.error);
    }

    // Ends everything on one side: the worker, its parsed source and its
    // waiting requests, which reject with `reason`.
    reset(side, reason) {
        if (this.workers[side]) this.workers[side].terminate();
        this.workers[side] = null;
        for (const [id, p] of this.pending) {
            if (p.side !== side) continue;
            clearTimeout(p.timer);
            this.pending.delete(id);
            p.reject(reason);
        }
        // A replaced input opens a new worker at once; after Stop or the time
        // limit, a fresh one is started so the next run does not wait.
        if (this.keepWarm && reason.kind !== 'replaced') this.warmSide(side);
    }

    // A new input replaces the old one on that side. A busy worker is ended so
    // its work cannot land late; an idle one is reused, since opening drops
    // its old source, and reuse keeps the page working offline.
    // bytes is an ArrayBuffer and is transferred; text is for a paste.
    open(side, { kind, bytes, text, name, delimiter, encoding }) {
        if ([...this.pending.values()].some((p) => p.side === side)) this.reset(side, { kind: 'replaced' });
        if (kind === 'workbook') return this.request(side, { type: 'open-workbook', bytes, name }, [bytes]);
        const transfer = bytes ? [bytes] : [];
        return this.request(side, { type: 'open-text', bytes, text, name, delimiter, encoding }, transfer);
    }

    // raw keeps the rows as JSON strings, to pass on to the compare worker.
    async table(side, { sheet, range, options, raw = false } = {}) {
        const value = await this.request(side, { type: 'table', sheet, range, options });
        if (raw) return value;
        const { keys, ...table } = value.table;
        return { ...value, table: { ...table, rows: decodeRows(keys) } };
    }

    hasWorker(side) { return this.workers[side] !== null; }

    // Stops reading both sources. A comparison already running is short and
    // is left to finish, so the pairs done so far stay in the report.
    stopReading() {
        this.reset('left', { kind: 'cancelled' });
        this.reset('right', { kind: 'cancelled' });
    }

    stop() {
        this.stopReading();
        this.reset('compare', { kind: 'cancelled' });
    }
}
