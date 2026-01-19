// Bootstrap for Pyright WASM LSP
export async function startPyright(options) {
    const wasm = options.wasmBinary;

    const server = await pyright.create({
        wasmBinary: wasm,
        onMessage: (msg) => {
            postMessage(msg);
        }
    });

    return server;
}

self.pyright = { start: startPyright, send: (m) => server.send(m) };
