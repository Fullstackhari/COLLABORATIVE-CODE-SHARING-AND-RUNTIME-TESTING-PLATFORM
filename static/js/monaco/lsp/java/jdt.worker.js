// Java LSP Worker (JDTLS)
importScripts("/static/js/monaco/lsp/java/jdt.js");

let jdt;

self.onmessage = async (event) => {
    const msg = event.data;

    if (msg.type === "init") {
        jdt = await self.jdtStart({
            wasmBinary: msg.wasmBinary
        });
    } else {
        jdt.send(msg);
    }
};
