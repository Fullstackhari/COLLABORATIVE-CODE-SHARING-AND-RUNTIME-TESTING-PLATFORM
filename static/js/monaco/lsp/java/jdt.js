// Bootstrap for JDTLS WASM LSP
export async function jdtStart(options) {
    const wasm = options.wasmBinary;

    const server = await jdtls.create({
        wasmBinary: wasm,
        onMessage: (msg) => postMessage(msg)
    });

    return server;
}

self.jdtStart = jdtStart;
