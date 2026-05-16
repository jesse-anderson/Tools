let wasm = null;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

export default async function init(input = new URL("pid_playground_wasm_bg.wasm", import.meta.url)) {
    if (wasm) {
        return wasm;
    }

    const imports = {};

    if (typeof input === "string" || input instanceof URL || input instanceof Request) {
        const response = await fetch(input);
        if (!response.ok) {
            throw new Error(`WASM request failed with HTTP ${response.status}`);
        }

        if (WebAssembly.instantiateStreaming && response.headers.get("content-type") === "application/wasm") {
            const loaded = await WebAssembly.instantiateStreaming(response, imports);
            wasm = loaded.instance.exports;
            return wasm;
        }

        const bytes = await response.arrayBuffer();
        const loaded = await WebAssembly.instantiate(bytes, imports);
        wasm = loaded.instance.exports;
        return wasm;
    }

    const loaded = await WebAssembly.instantiate(input, imports);
    wasm = loaded.instance.exports || loaded.exports;
    return wasm;
}

export function simulate_pid_json(configJson) {
    ensureInitialized();
    const inputBytes = encoder.encode(configJson);
    const pointer = wasm.alloc(inputBytes.length);
    new Uint8Array(wasm.memory.buffer, pointer, inputBytes.length).set(inputBytes);
    const resultPointer = wasm.simulate_pid_json(pointer, inputBytes.length);
    wasm.dealloc(pointer, inputBytes.length);
    const resultLength = wasm.last_result_len();
    const result = decoder.decode(new Uint8Array(wasm.memory.buffer, resultPointer, resultLength));
    wasm.free_last_result();
    return result;
}

export function pid_playground_version() {
    ensureInitialized();
    const pointer = wasm.pid_playground_version_ptr();
    const length = wasm.pid_playground_version_len();
    return decoder.decode(new Uint8Array(wasm.memory.buffer, pointer, length));
}

function ensureInitialized() {
    if (!wasm) {
        throw new Error("PID Playground WASM module has not been initialized.");
    }
}
