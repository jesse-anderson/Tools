// Face Blur Tool - Blur Utilities
// Canvas pool, WebWorker management, and helper functions

// ============================================================================
// CANVAS POOL (performance optimization)
// ============================================================================
export const canvasPool = {
    small: null, medium: null, large: null,
    get(size) {
        if (!this[size]) {
            this[size] = document.createElement('canvas');
            this[size].id = `pool-canvas-${size}`;
        }
        return this[size];
    },
    resize(size, width, height) {
        const canvas = this.get(size);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        return canvas;
    }
};

// ============================================================================
// WEBWORKER FOR PIXEL-INTENSIVE OPERATIONS
// ============================================================================
let pixelWorker = null;
let workerUrl = null;
let workerCallbacks = new Map(); // Maps id -> { resolve, reject }
let workerCallbackId = 0;
let workerReady = false;
let pendingWorkerMessages = [];

// Initialize the WebWorker
function initPixelWorker() {
    if (pixelWorker) return;

    // Load worker from external file - resolve URL relative to this module
    workerUrl = new URL('./worker.js', import.meta.url).href;
    pixelWorker = new Worker(workerUrl);

    pixelWorker.onmessage = function(e) {
        const { type, id, result } = e.data;

        if (type === 'ready') {
            workerReady = true;
            while (pendingWorkerMessages.length > 0) {
                const msg = pendingWorkerMessages.shift();
                pixelWorker.postMessage(msg.data, msg.transfer);
            }
            return;
        }

        const callback = workerCallbacks.get(id);
        if (callback) {
            callback.resolve(new Uint8ClampedArray(result));
            workerCallbacks.delete(id);
        }
    };

    pixelWorker.onerror = function(error) {
        console.error('Worker error:', error);

        // Reject all pending promises with the error
        for (const [id, callback] of workerCallbacks.entries()) {
            callback.reject(new Error(`Worker processing failed: ${error.message || 'Unknown error'}`));
        }
        workerCallbacks.clear();

        // Show user-facing error notification
        if (typeof Toast !== 'undefined') {
            Toast.error('Image processing error occurred. Please try again.');
        }

        // Terminate and reset the worker so it can be reinitialized on next call
        if (pixelWorker) {
            pixelWorker.terminate();
            pixelWorker = null;
        }
        workerReady = false;
    };
}

// Cleanup worker resources
function cleanupWorker() {
    if (pixelWorker) {
        pixelWorker.terminate();
        pixelWorker = null;
    }
    if (workerUrl) {
        // Don't revoke external URL
        workerUrl = null;
    }
    workerReady = false;
    workerCallbacks.clear();
}

// Run a task in the worker and return a promise
export function runInWorker(type, imageData, width, height, param1) {
    return new Promise((resolve, reject) => {
        if (!pixelWorker) {
            initPixelWorker();
        }

        const id = ++workerCallbackId;
        // Store both resolve and reject for proper error handling
        workerCallbacks.set(id, { resolve, reject });

        // Create a copy of the data to avoid transferring (which detaches the original)
        const dataCopy = new Uint8ClampedArray(imageData.data);
        const messageData = { id, type, data: dataCopy, width, height, param1 };
        const transferList = [dataCopy.buffer];

        if (workerReady) {
            pixelWorker.postMessage(messageData, transferList);
        } else {
            pendingWorkerMessages.push({ data: messageData, transfer: transferList });
        }
    });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Get average color from pixel data
export function getAverageColor(data) {
    let r = 0, g = 0, b = 0, count = 0;

    for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
    }

    r = Math.floor(r / count);
    g = Math.floor(g / count);
    b = Math.floor(b / count);

    return `rgb(${r}, ${g}, ${b})`;
}
