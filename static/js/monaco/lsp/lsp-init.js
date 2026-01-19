import * as vscode from "../lsp-client/vscode-languageserver-protocol.js";
import { MonacoLanguageClient } from "../lsp-client/monaco-languageclient.js";

window.initLspForModel = async function (model) {
    const lang = model.getLanguageId();

    if (lang === "python") loadPyright(model);
    if (lang === "cpp") loadClangd(model);
    if (lang === "java") loadJavaLsp(model);
};

// ---------- PYTHON (Pyright WASM) ----------
async function loadPyright(model) {
    const wasm = await fetch("/static/js/monaco/lsp/python/pyright.wasm").then(r => r.arrayBuffer());
    const { createPyrightClient } = await import("/static/js/monaco/lsp/python/pyright.js");

    createPyrightClient(monaco, MonacoLanguageClient, model, wasm);
}

// ---------- C/C++ (Clangd WASM) ----------
async function loadClangd(model) {
    const wasm = await fetch("/static/js/monaco/lsp/cpp/clangd.wasm").then(r => r.arrayBuffer());
    const { createClangdClient } = await import("/static/js/monaco/lsp/cpp/clangd.js");

    createClangdClient(monaco, MonacoLanguageClient, model, wasm);
}

// ---------- JAVA (JDTLS WASM) ----------
async function loadJavaLsp(model) {
    const wasm = await fetch("/static/js/monaco/lsp/java/jdtls.wasm").then(r => r.arrayBuffer());
    const { createJdtClient } = await import("/static/js/monaco/lsp/java/jdt.js");

    createJdtClient(monaco, MonacoLanguageClient, model, wasm);
}
