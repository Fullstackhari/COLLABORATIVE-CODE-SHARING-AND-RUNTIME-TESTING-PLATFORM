// C/C++ LSP Worker (Clangd)
importScripts("/static/js/monaco/lsp/cpp/clangd.js");

let clangd;

self.onmessage = async (event) => {
    const msg = event.data;

    if (msg.type === "init") {
        clangd = await self.clangdStart({
            wasmBinary: msg.wasmBinary
        });
    } else {
        clangd.send(msg);
    }
};
