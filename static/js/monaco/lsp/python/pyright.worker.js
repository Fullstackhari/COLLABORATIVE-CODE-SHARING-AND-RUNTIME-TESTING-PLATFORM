// Python LSP Worker (Pyright)
importScripts("/static/js/monaco/lsp/python/pyright.js");

self.onmessage = async (event) => {
    const msg = event.data;
    if (msg.type === "init") {
        await self.pyright.start({
            wasmBinary: msg.wasmBinary
        });
    } else {
        self.pyright.send(msg);
    }
};
