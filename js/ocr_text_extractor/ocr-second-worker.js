// OCR Text Extractor: the second engine, PP-OCR through ONNX Runtime Web, in
// a worker. Loaded only from js/vendor/ocr_text_extractor/paddle/. Reading a
// line costs most of the time, so a page's lines are shared out among several
// of these, and one of them also finds the lines and orders them.

import * as ort from '../vendor/ocr_text_extractor/paddle/ort.wasm.min.mjs';
import * as ocr from '../vendor/ocr_text_extractor/paddle/esearch-ocr.js';

const at = (file) => new URL('../vendor/ocr_text_extractor/paddle/' + file, import.meta.url).href;

ort.env.wasm.wasmPaths = at('');
// More than one thread needs cross-origin isolation, which this site does not have.
ort.env.wasm.numThreads = 1;

// The library tests its input against these by name and a worker has neither.
self.HTMLImageElement = self.HTMLImageElement || class {};
self.HTMLCanvasElement = self.HTMLCanvasElement || class {};
ocr.setOCREnv({ canvas: (width, height) => new OffscreenCanvas(width, height) });

// Lines are found on a smaller copy of the page and read from the full one.
// At 960 a letter page of 7 point print lost a third of its lines; at 1280
// and above it lost none. The steps are few because each holds a model.
const DETECT_SIDE = 1600;
const DETECT_STEPS = [1, 0.8, 0.65, 0.5, 0.4, 0.33, 0.25];

let recognizer = null;
// The page in hand, kept so that it can be found again turned.
let held = null;
const detectors = new Map();
let job = null;

async function detectorFor(width, height) {
    const wanted = Math.min(1, DETECT_SIDE / Math.max(width, height));
    const ratio = DETECT_STEPS.find((step) => step <= wanted + 1e-9) || DETECT_STEPS[DETECT_STEPS.length - 1];
    if (!detectors.has(ratio)) {
        detectors.set(ratio, await ocr.initDet({ input: at('ch_PP-OCRv4_det_infer.onnx'), ratio, ort }));
    }
    return detectors.get(ratio);
}

// The models are handed over by address and fetched by the runtime, so a
// file that will not load is a failed start.
async function load(message) {
    const response = await fetch(at('ppocrv5_en_dict.txt'));
    if (!response.ok) throw new Error(`the dictionary answered ${response.status}`);
    recognizer = await ocr.initRec({
        input: at('en_PP-OCRv5_mobile_rec.onnx'),
        decodeDic: await response.text(),
        ort,
        on: (index) => {
            if (job !== null) self.postMessage({ id: job, done: index + 1 });
        }
    });
    if (message.finds) await detectorFor(DETECT_SIDE, DETECT_SIDE);
    return {};
}

// The page turned by `angle` radians about its center, on a canvas large
// enough for its corners.
function turned(image, angle) {
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const source = new OffscreenCanvas(image.width, image.height);
    source.getContext('2d').putImageData(image, 0, 0);
    const out = new OffscreenCanvas(Math.ceil(image.width * cos + image.height * sin), Math.ceil(image.width * sin + image.height * cos));
    const context = out.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, out.width, out.height);
    context.translate(out.width / 2, out.height / 2);
    context.rotate(angle);
    context.drawImage(source, -image.width / 2, -image.height / 2);
    return context.getImageData(0, 0, out.width, out.height);
}

// Each line found, as its corners and its own pixels. With `turn` and no
// pixels, the page already in hand is turned and searched again.
async function find(message) {
    if (message.buffer) held = new ImageData(new Uint8ClampedArray(message.buffer), message.width, message.height);
    const image = message.turn ? turned(held, message.turn) : held;
    const detector = await detectorFor(image.width, image.height);
    const found = await detector.det(image);
    const items = found.map((line) => ({
        box: line.box,
        style: line.style,
        width: line.img.width,
        height: line.img.height,
        buffer: line.img.data.buffer
    }));
    return { items, width: image.width, height: image.height, transfer: items.map((item) => item.buffer) };
}

// The characters of each line with their scores, the best guess only. With
// `flip` each line is read turned half way round.
async function readLines(message) {
    const input = message.items.map((item) => {
        // Reversing the pixels in place turns the picture half way round.
        if (message.flip) new Uint32Array(item.buffer).reverse();
        return {
            box: item.box,
            style: item.style,
            img: new ImageData(new Uint8ClampedArray(item.buffer), item.width, item.height)
        };
    });
    const raw = await recognizer.rawRec(input, { topK: 1 });
    return {
        lines: raw.map((line) => line.text.map((options) => options[0])
            .filter((char) => char && char.t !== '')
            .map((char) => ({ t: char.t, mean: char.mean })))
    };
}

// Reading order, as paragraphs of line numbers.
function arrange(message) {
    const layout = ocr.analyzeLayout(message.lines);
    const order = [];
    for (const column of layout.columns) {
        for (const paragraph of column.parragraphs) order.push(paragraph.src.map((line) => line.index));
    }
    return { order };
}

const TASKS = { load, find, read: readLines, arrange };

self.onmessage = async (event) => {
    const message = event.data;
    try {
        job = message.id;
        const { transfer, ...answer } = await TASKS[message.type](message);
        job = null;
        self.postMessage({ id: message.id, ok: true, ...answer }, transfer || []);
    } catch (error) {
        job = null;
        self.postMessage({ id: message.id, ok: false, error: String((error && error.message) || error) });
    }
};
