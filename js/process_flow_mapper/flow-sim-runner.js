// Runs the lead time simulation for the page. A quick run happens here; a big
// one goes to a worker so typing is not held up while it walks, and the page
// draws again when it is done. Runs are kept by what they were run on.

import { simulate, summarize } from './flow-simulate.js';

// About 15 ms of walking on an ordinary machine. Above it, the worker.
export const SYNC_VISITS = 250000;
const KEEP = 8;

/**
 * onReady(key) is called when a worker run finishes, or with null when the
 * worker failed and the page should draw again to run it here instead.
 * options: { workerUrl, syncVisits }. Returns run(job) for buildModel, with
 * run.stats counting where runs happened.
 */
export function createSpreadRunner(onReady, options = {}) {
    const syncVisits = Number.isFinite(options.syncVisits) ? options.syncVisits : SYNC_VISITS;
    const kept = new Map();
    let worker = null;
    let waiting = null;
    let broken = !options.workerUrl || typeof Worker !== 'function';
    const stats = { here: 0, worker: 0, canceled: 0 };

    const keep = (key, spread) => {
        kept.set(key, spread);
        if (kept.size > KEEP) kept.delete(kept.keys().next().value);
    };

    const stop = () => {
        if (worker) worker.terminate();
        worker = null;
        waiting = null;
    };

    const start = () => {
        if (worker || broken) return worker;
        try {
            worker = new Worker(options.workerUrl, { type: 'module' });
        } catch (e) {
            broken = true;
            return null;
        }
        worker.addEventListener('message', (event) => {
            const { key, spread } = event.data;
            if (key !== waiting) return;
            waiting = null;
            keep(key, spread);
            onReady(key);
        });
        // A worker that cannot load or run is given up on, and the page runs the walk itself.
        worker.addEventListener('error', () => {
            broken = true;
            stop();
            onReady(null);
        });
        return worker;
    };

    const run = (job) => {
        if (kept.has(job.key)) return { spread: kept.get(job.key) };
        if (job.visits > syncVisits && !broken) {
            if (waiting === job.key) return { pending: true };
            // Only the newest map matters: a run still going for an older one is dropped.
            if (waiting !== null) { stop(); stats.canceled += 1; }
            if (start()) {
                waiting = job.key;
                stats.worker += 1;
                worker.postMessage({ key: job.key, input: job.input, options: job.options, ranges: job.ranges });
                return { pending: true };
            }
        }
        stats.here += 1;
        const spread = summarize(simulate(job.input, job.options), job.ranges);
        keep(job.key, spread);
        return { spread };
    };
    run.stats = stats;
    return run;
}
