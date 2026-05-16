let modulePromise = null;

export async function runSimulation(config) {
    const wasm = await loadWasm();
    const envelope = JSON.parse(wasm.simulate_pid_json(JSON.stringify(config)));

    if (!envelope.ok) {
        throw new Error(envelope.error || "WASM simulation failed.");
    }

    return envelope.result;
}

export async function getWasmVersion() {
    const wasm = await loadWasm();
    return wasm.pid_playground_version();
}

async function loadWasm() {
    if (!modulePromise) {
        modulePromise = import("./pkg/pid_playground_wasm.js").then(async (module) => {
            await module.default();
            return module;
        });
    }

    return modulePromise;
}
