// Bootstrap for Clangd WASM LSP
export async function clangdStart(options) {
    const wasm = options.wasmBinary;

    const server = await clangd.create({
        wasmBinary: wasm,
        onMessage: (msg) => {
            postMessage(msg);
        }
    });

    return server;
}

self.clangdStart = clangdStart;
