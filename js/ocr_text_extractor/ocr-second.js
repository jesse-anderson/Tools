// OCR Text Extractor: the page's side of the second engine. Its workers are
// made on first use. One page is read at a time, its lines shared among them.

import { OcrError } from './ocr-plan.js';
import { readingFromLines, shareOut, lineAngle, isSteep, longestLines, turnedOver, turnBack, SECOND } from './ocr-second-plan.js';

const WORKER_URL = new URL('./ocr-second-worker.js', import.meta.url).href;

// onProgress gets (stage, fraction, key) as the first engine's does.
export function createSecondEngine(onProgress = () => {}) {
    let size = 1;
    let helpers = [];
    let sequence = 0;
    let queue = Promise.resolve();

    // One worker and the calls it has yet to answer.
    function makeHelper(finds) {
        const helper = { worker: null, pending: new Map(), ready: null, dead: false };
        helper.call = (message, transfer = [], onDone = null) => new Promise((resolve, reject) => {
            const id = ++sequence;
            helper.pending.set(id, { resolve, reject, onDone });
            helper.worker.postMessage({ ...message, id }, transfer);
        });
        helper.fail = (error) => {
            helper.dead = true;
            for (const entry of helper.pending.values()) entry.reject(error);
            helper.pending.clear();
        };
        try {
            helper.worker = new Worker(WORKER_URL, { type: 'module' });
        } catch (error) {
            helper.dead = true;
            helper.ready = Promise.reject(error);
            helper.ready.catch(() => {});
            return helper;
        }
        helper.worker.onmessage = (event) => {
            const entry = helper.pending.get(event.data.id);
            if (!entry) return;
            if (event.data.done !== undefined) {
                if (entry.onDone) entry.onDone(event.data.done);
                return;
            }
            helper.pending.delete(event.data.id);
            if (event.data.ok) entry.resolve(event.data);
            else entry.reject(new Error(event.data.error));
        };
        // A worker whose own files fail to load reports it here and nowhere else.
        helper.worker.onerror = (event) => {
            event.preventDefault();
            helper.fail(new Error('the worker failed to load'));
        };
        helper.ready = helper.call({ type: 'load', finds });
        helper.ready.catch(() => { helper.dead = true; });
        return helper;
    }

    function stop() {
        const old = helpers;
        helpers = [];
        queue = Promise.resolve();
        for (const helper of old) {
            if (helper.worker) helper.worker.terminate();
            // A terminated worker never answers, so what waits on it is told here.
            helper.fail(new OcrError('STOPPED', 'Stopped.'));
        }
    }

    async function read(image, key) {
        if (helpers.length === 0) onProgress('loading', 0, key);
        // The first worker finds the lines; the others only read them.
        while (helpers.length < size) helpers.push(makeHelper(helpers.length === 0));
        const mine = helpers;
        const lead = mine[0];
        await lead.ready;
        const page = { width: image.width, height: image.height };
        let found = await lead.call(
            { type: 'find', buffer: image.data.buffer, width: image.width, height: image.height },
            [image.data.buffer]
        );
        // Steeply sloping lines are lost by the reader, so the page is turned
        // level by the slope of the lines found and searched again.
        let turn = 0;
        let flip = false;
        const slope = lineAngle(found.items.map((item) => item.box));
        if (isSteep(slope)) {
            turn = -slope;
            found = await lead.call({ type: 'find', turn });
            // Level is not yet the right way up. A few long lines are read both
            // ways, and the way that reads with more certainty wins.
            const sample = longestLines(found.items.map((item) => item.box), SECOND.wayUpSample)
                .map((index) => found.items[index]);
            const certainty = async (over) => {
                const items = sample.map((item) => ({ ...item, buffer: item.buffer.slice(0) }));
                const answer = await lead.call({ type: 'read', items, flip: over }, items.map((item) => item.buffer));
                return answer.lines.reduce((sum, line) => sum + line.reduce((part, char) => part + char.mean, 0), 0);
            };
            flip = sample.length > 0 && await certainty(true) > await certainty(false);
        }
        // A helper that did not start is left out and the rest carry its share.
        const started = await Promise.all(mine.map((helper) => helper.ready.then(() => helper, () => null)));
        const able = started.filter(Boolean);
        const shares = shareOut(found.items.length, able.length);
        const done = shares.map(() => 0);
        const answers = await Promise.all(shares.map((share, at) => {
            if (share.length === 0) return { lines: [] };
            const items = share.map((index) => found.items[index]);
            return able[at].call({ type: 'read', items, flip }, items.map((item) => item.buffer), (count) => {
                done[at] = count;
                onProgress('reading', done.reduce((sum, value) => sum + value, 0) / found.items.length, key);
            });
        }));
        // Boxes as they lie on the page the right way up, for the reading order.
        const lines = found.items.map((item) => ({
            box: flip ? turnedOver(item.box, found.width, found.height) : item.box,
            chars: []
        }));
        shares.forEach((share, at) => share.forEach((index, k) => { lines[index].chars = answers[at].lines[k]; }));
        const laid = lines.map((line, index) => ({
            index,
            box: line.box,
            style: found.items[index].style,
            text: line.chars.map((char) => char.t).join(''),
            mean: line.chars.reduce((sum, char) => sum + char.mean, 0) / Math.max(1, line.chars.length)
        })).filter((line) => line.text.trim() !== '');
        const { order } = laid.length ? await lead.call({ type: 'arrange', lines: laid }) : { order: [] };
        if (turn !== 0) {
            const whole = turn + (flip ? Math.PI : 0);
            for (const line of lines) line.box = turnBack(line.box, whole, found, page);
        }
        return readingFromLines(lines, order);
    }

    return {
        // How many workers share a page's lines from the next page on.
        setSize(count) {
            size = Math.max(1, Math.floor(count) || 1);
        },

        // Reads a canvas and leaves it intact. The pixels are copied out now,
        // so the caller may release the canvas before this settles.
        recognize(canvas, key = null) {
            const context = canvas.getContext('2d', { willReadFrequently: true });
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const run = async () => {
                try {
                    return await read(image, key);
                } catch (error) {
                    if (error instanceof OcrError) throw error;
                    console.error(error);
                    throw new OcrError('SECOND_FAILED', 'The second reading engine failed on this page.');
                }
            };
            const result = queue.then(run, run);
            queue = result.catch(() => {});
            return result;
        },

        workerCount: () => helpers.length,

        terminate: stop
    };
}
