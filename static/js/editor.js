// static/js/editor.js
// OneCompiler-style editor with tabs + Monaco + SocketIO collaboration
const socket = io();


window.MonacoEnvironment = {
  getWorkerUrl: function (_, label) {
    if (label === "json") return "/static/js/monaco/json.worker.js";
    if (label === "css") return "/static/js/monaco/css.worker.js";
    if (label === "html") return "/static/js/monaco/html.worker.js";
    if (label === "javascript") return "/static/js/monaco/js.worker.js";
    if (label === "typescript") return "/static/js/monaco/typescript.worker.js";

    return "/static/js/monaco/editor.worker.js";
  }
};

// load Monaco
require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor/min/vs" } });

let editor; // monaco editor instance
let currentFile = null;
let files = []; // { filename, code }
const project = window.PROJECT;
const language = (window.LANGUAGE || "javascript").toLowerCase();

const tabsBar = document.getElementById("tabsBar");
const preview = document.getElementById("preview");
const outputArea = document.getElementById("outputArea");
const btnRun = document.getElementById("btnRun");
const newFileNameInput = document.getElementById("newFileName");

// -----------------------------
// 📦 PACKAGE MANAGER FRONTEND
// -----------------------------

const ALLOWED_PACKAGES = {
  python: [
    "numpy", "pandas", "matplotlib", "scikit-learn", "tensorflow",
    "torch", "opencv-python", "xgboost", "nltk", "transformers",
    "flask", "django", "fastapi", "sqlalchemy", "pymongo",
    "requests", "beautifulsoup4", "pillow", "cryptography"
  ],
  javascript: [
    "axios", "express", "mongoose", "react", "redux",
    "lodash", "moment", "bcryptjs", "jsonwebtoken", "jest",
    "vite", "webpack", "chart.js"
  ],
  java: [
    "spring-boot-starter-web",
    "spring-boot-starter-data-jpa",
    "mysql-connector-java"
  ],
  c: [
    "glibc", "openssl", "libcurl", "pthread"
  ],
  cpp: [
    "boost", "eigen", "opencv", "fmt", "spdlog"
  ],
  react: [
    "react", "react-dom", "react-router-dom",
    "axios", "redux", "react-query"
  ],
  nosql: [
    "pymongo", "mongoose", "redis", "motor"
  ]
};

const pkgLangSelect = document.getElementById("pkgLang");
const pkgSelect = document.getElementById("pkgSelect");
const installedPkgsList = document.getElementById("installedPkgs");

// Update dropdown when language changes
function updatePackageDropdown() {
  if (!pkgLangSelect || !pkgSelect) return;

  const lang = pkgLangSelect.value.toLowerCase();
  const packages = ALLOWED_PACKAGES[lang] || [];

  pkgSelect.innerHTML = "";
  packages.forEach((pkg) => {
    const opt = document.createElement("option");
    opt.value = pkg;
    opt.textContent = pkg;
    pkgSelect.appendChild(opt);
  });
}

// Load installed packages from backend for selected language
async function refreshInstalledPackages() {
  if (!installedPkgsList || !pkgLangSelect) return;

  const res = await fetch("/api/list_packages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectName: window.PROJECT })
  });

  const data = await res.json();
  installedPkgsList.innerHTML = "";

  const lang = pkgLangSelect.value.toLowerCase();
  const installed = (data.installed && data.installed[lang]) || [];

  installed.forEach((pkg) => {
    const li = document.createElement("li");
    li.textContent = pkg;
    installedPkgsList.appendChild(li);
  });
}

// Install clicked
const btnInstallPkg = document.getElementById("btnInstallPkg");
if (btnInstallPkg) {
  btnInstallPkg.addEventListener("click", async () => {
    if (!pkgLangSelect || !pkgSelect) return;

    const pkgLang = pkgLangSelect.value;
    const pkg = pkgSelect.value;

    if (!pkg) {
      alert("Select a package");
      return;
    }

    const res = await fetch("/api/install_pkg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: window.PROJECT,
        language: pkgLang,
        package: pkg
      })
    });

    const result = await res.json();
    outputArea.textContent = result.output || result.error || "";

    refreshInstalledPackages();
  });
}

// Initialize package manager after DOM ready
document.addEventListener("DOMContentLoaded", () => {
  if (pkgLangSelect) {
    // If current editor language exists in dropdown, select it
    const hasOption = Array.from(pkgLangSelect.options).some(
      (opt) => opt.value.toLowerCase() === language
    );
    if (hasOption) {
      pkgLangSelect.value = language;
    }

    updatePackageDropdown();
    refreshInstalledPackages();
  }
}); 

// ===============================
// 📂 OPEN FILE (VS Code–like)
// ===============================
const openFileBtn = document.getElementById("openFileBtn");
const openFileInput = document.getElementById("openFileInput");

if (openFileBtn && openFileInput) {

  openFileBtn.addEventListener("click", () => {
    openFileInput.click();
  });

  openFileInput.addEventListener("change", (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (!selectedFiles.length) return;

    selectedFiles.forEach(file => {
      const reader = new FileReader();

      reader.onload = () => {
        const code = reader.result;
        const filename = file.name;

        // prevent duplicates
        if (files.some(f => f.filename === filename)) {
          selectFile(filename);
          return;
        }

        // 🔥 Add file locally
        files.push({ filename, code });

        // 🔥 Render tab + select file
        renderTabs();
        selectFile(filename);

        // (optional) broadcast to teammates
        socket.emit("create_file", {
          projectName: project,
          language: language,
          filename: filename,
          code: code
        });
      };

      reader.readAsText(file);
    });

    // reset input
    openFileInput.value = "";
  });
}


// -----------------------------
// AI Inline Completion (Copilot-style)
// -----------------------------

function setModeOptions(lang) {
  // Not needed for Piston run — Monaco mode auto-detects on tab change
}

require(["vs/editor/editor.main"], function () {
  // --- Enable JSX / TSX IntelliSense for React ---
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowSyntheticDefaultImports: true,
    allowJs: true,
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    noEmit: true
  });

  // 🚀 AI Inline Ghost Autocomplete
  let aiDisabled = false;
  let lastCompletion = "";

  monaco.languages.registerInlineCompletionsProvider("javascript", {
    provideInlineCompletions: async (model, position) => {
      if (aiDisabled) return { items: [] };

      const code = model.getValue();
      if (!code.trim()) return { items: [] };

      const prefix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });

      try {
        const res = await fetch("/api/ai_complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, prefix })
        });

        if (!res.ok) {
          aiDisabled = true;
          console.warn("⚠️ AI disabled due to server error");
          return { items: [] };
        }

        const data = await res.json();
        const suggestion = (data.completion || "").trim();

        if (!suggestion || suggestion === lastCompletion) return { items: [] };
        lastCompletion = suggestion;

        return {
          items: [
            {
              text: suggestion,
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
              )
            }
          ]
        };
      } catch (e) {
        aiDisabled = true;
        console.error("AI error:", e);
        return { items: [] };
      }
    },
    handleItemDidShow: () => {},
    freeInlineCompletions: () => {}
  });

  // -------------------------
  // Monaco editor setup
  // -------------------------
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: "",
    language: "javascript",
    theme: "vs-dark",
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: true },
    glyphMargin: true,
    folding: true
  });

  // Disable TS/JS diagnostics (squiggles)
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true
  });

  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true
  });

  if (window.setupJsxIntellisense) {
    window.setupJsxIntellisense(monaco);
  }

  // INIT LSP FOR MODEL (Python, Java, C/C++)
  monaco.editor.onDidCreateModel((model) => {
    window.initLspForModel(model);
  });

  fetch("/static/js/monaco/python-lsp.wasm")
    .then((res) => res.arrayBuffer())
    .then((wasm) => {
      monaco.languages.register({ id: "python" });

      MonacoLanguageClient.create({
        languageId: "python",
        wasmBinary: wasm
      });
    });

  fetch("/static/js/monaco/clangd.wasm")
    .then((r) => r.arrayBuffer())
    .then((wasm) => {
      MonacoLanguageClient.create({
        languageId: "cpp",
        wasmBinary: wasm
      });
    });

  fetch("/static/js/monaco/java-lsp.wasm")
    .then((r) => r.arrayBuffer())
    .then((wasm) => {
      MonacoLanguageClient.create({
        languageId: "java",
        wasmBinary: wasm
      });
    });

  // 🔥 Disable syntax errors for non-JS languages
  monaco.editor.onDidCreateModel((model) => {
    const langId = model.getLanguageId();
    if (langId !== "javascript" && langId !== "typescript") {
      monaco.editor.setModelMarkers(model, "owner", []);
      model.onDidChangeContent(() => {
        monaco.editor.setModelMarkers(model, "owner", []);
      });
    }
  });

  if (language === "react") {
    monaco.editor.setModelLanguage(editor.getModel(), "javascript");
  }

  // join room
  socket.emit("join", { projectName: project, language: language });

  socket.on("file_list", (payload) => {
    files = payload.files || payload;
    renderTabs();
    if (!currentFile && files.length) selectFile(files[0].filename);
  });

  socket.on("code_update", (payload) => {
    if (payload.projectName !== project || payload.language !== language) return;
    if (currentFile === payload.filename && editor.getValue() !== payload.code) {
      const pos = editor.getPosition();
      editor.setValue(payload.code);
      if (pos) editor.setPosition(pos);
    }
    const idx = files.findIndex((f) => f.filename === payload.filename);
    if (idx !== -1) files[idx].code = payload.code;
  });

  let changeTimer = null;
  editor.onDidChangeModelContent(() => {
    if (!currentFile) return;
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      const code = editor.getValue();
      const idx = files.findIndex((f) => f.filename === currentFile);
      if (idx !== -1) files[idx].code = code;
      socket.emit("code_update", {
        projectName: project,
        language: language,
        filename: currentFile,
        code
      });
    }, 250);
  });

  btnRun.addEventListener("click", runCode);
  const btnShare = document.getElementById("btnShare");
  btnShare?.addEventListener("click", shareFile);

  document.getElementById("btnNewFile")?.addEventListener("click", () => {
    const name = newFileNameInput.value.trim();
    if (!name) return alert("Enter a filename (e.g. app.py)");
    if (files.some((f) => f.filename === name)) return alert("File already exists");
    socket.emit("create_file", {
      projectName: project,
      language: language,
      filename: name,
      code: ""
    });
    newFileNameInput.value = "";
  });
});

// join room (safety duplicate)
socket.emit("join", { projectName: project, language: language });

socket.on("file_list", (payload) => {
  files = payload.files || payload;
  renderTabs();

  setTimeout(() => {
    if (!currentFile && files.length > 0) {
      selectFile(files[0].filename);
      editor.layout();
    }
  }, 100);
});

socket.on("code_update", (payload) => {
  if (payload.projectName !== project || payload.language !== language) return;
  if (currentFile === payload.filename && editor.getValue() !== payload.code) {
    const pos = editor.getPosition();
    editor.setValue(payload.code);
    if (pos) editor.setPosition(pos);
  }
  const idx = files.findIndex((f) => f.filename === payload.filename);
  if (idx !== -1) files[idx].code = payload.code;
});

// helper to render tab bar
function renderTabs() {
  while (tabsBar.firstChild) tabsBar.removeChild(tabsBar.firstChild);

  files.forEach((f) => {
    const d = document.createElement("div");
    d.className = "tab";
    d.textContent = f.filename;
    d.dataset.filename = f.filename;
    d.addEventListener("click", () => selectFile(f.filename));

    d.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const newName = prompt("Rename file to:", f.filename);
      if (newName && newName !== f.filename) {
        socket.emit("rename_file", {
          projectName: project,
          language: language,
          oldName: f.filename,
          newName
        });
        f.filename = newName;
        renderTabs();
      }
    });

    tabsBar.appendChild(d);
  });
  // Hidden file input for Open File
// ---------- Open File Input (global, single instance) ----------
const openFileInput = document.createElement("input");
openFileInput.type = "file";
openFileInput.multiple = true;
openFileInput.style.display = "none";
document.body.appendChild(openFileInput);



  const actions = document.createElement("div");
  actions.style.marginLeft = "auto";
  actions.className = "file-actions";

  const input = document.createElement("input");
  input.id = "newFileName";
  input.className = "file-input";
  input.placeholder = "new-file.ext";

  const addBtn = document.createElement("button");
  addBtn.id = "btnNewFile";
  addBtn.className = "btn";
  addBtn.textContent = "Add File";
  addBtn.addEventListener("click", () => {
    const name = input.value.trim();
    if (!name) return alert("Enter a filename");
    if (files.some((f) => f.filename === name)) return alert("File exists");
    socket.emit("create_file", {
      projectName: project,
      language: language,
      filename: name,
      code: ""
    });
    input.value = "";
  });

  const delBtn = document.createElement("button");
  delBtn.className = "btn";
  delBtn.style.background = "#e74c3c";
  delBtn.textContent = "Delete File";
  delBtn.addEventListener("click", () => {
  if (!currentFile) return alert("Select file first");
  if (!confirm("Delete " + currentFile + " ?")) return;

  const deletedFile = currentFile;

  socket.emit("delete_file", {
    projectName: project,
    language: language,
    filename: deletedFile
  });

  // 🔥 REMOVE LOCALLY
  files = files.filter(f => f.filename !== deletedFile);
  currentFile = null;

  // 🔥 CLEAR MONACO EDITOR
  const emptyModel = monaco.editor.createModel("", "plaintext");
  editor.setModel(emptyModel);

  renderTabs();
});


  // ---- OPEN FILE BUTTON ----
const openBtn = document.createElement("button");
openBtn.className = "btn";
openBtn.textContent = "Open File";

openBtn.addEventListener("click", () => {
  openFileInput.click();
});

// ---- HANDLE FILE SELECTION ----
openFileInput.onchange = (e) => {
  const selectedFiles = Array.from(e.target.files);
  if (!selectedFiles.length) return;

  selectedFiles.forEach((file) => {
    const reader = new FileReader();

    reader.onload = () => {
      const content = reader.result;
      const filename = file.name;

      // Prevent duplicates
      if (files.some((f) => f.filename === filename)) {
        selectFile(filename);
        return;
      }

      // Add file locally
      files.push({ filename, code: content });

      // Sync with collaborators
      socket.emit("create_file", {
        projectName: project,
        language: language,
        filename: filename,
        code: content
      });

      renderTabs();
      selectFile(filename);
    };

    reader.readAsText(file);
  });

  openFileInput.value = "";
};

// ---- APPEND ACTIONS ----
actions.appendChild(input);
actions.appendChild(addBtn);
actions.appendChild(openBtn);   // ✅ Open File
actions.appendChild(delBtn);
tabsBar.appendChild(actions);


  Array.from(tabsBar.querySelectorAll(".tab")).forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.filename === currentFile);
  });
}

function selectFile(filename) {
  currentFile = filename;
  const f = files.find((x) => x.filename === filename);
  if (!f) return;

  editor.setValue(f.code || "");

  const mode = detectModeFromFilename(filename);
  monaco.editor.setModelLanguage(editor.getModel(), mode);

  Array.from(tabsBar.querySelectorAll(".tab")).forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.filename === filename);
  });
}

function detectModeFromFilename(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const map = {
    html: "html",
    htm: "html",
    react: "javascript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    java: "java",
    cpp: "cpp",
    c: "c",
    rb: "ruby",
    sql: "sql",
    txt: "plaintext",
    md: "markdown"
  };
  return map[ext] || "plaintext";
}

// -------------------------
// SHARE FILE TO CHATBOT
// -------------------------
async function shareFile() {
  if (!currentFile) {
    alert("Select a file to share");
    return;
  }

  const fileObj = files.find((f) => f.filename === currentFile);
  if (!fileObj) {
    alert("File not found");
    return;
  }

  const payload = {
    projectName: project,
    usn: window.USER,
    filename: fileObj.filename,
    code: fileObj.code
  };

  try {
    const response = await fetch("/api/share_file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.success) {
      alert("Shared to chatbot!");
    } else {
      alert("Share failed: " + (result.error || "unknown error"));
    }
  } catch (err) {
    alert("Error sharing file: " + err.toString());
  }
}

// -------------------------
// RUN CODE
// -------------------------
async function runCode() {
  if (!currentFile) {
    outputArea.textContent = "No file selected";
    return;
  }

  const fileObj = files.find((f) => f.filename === currentFile);
  if (!fileObj) {
    outputArea.textContent = "File object not found";
    return;
  }

  // HTML / React preview
  if (language === "html" || language === "react") {
    const htmlFile = files.find((f) => f.filename === "index.html") || fileObj;
    const cssFile = files.find((f) => f.filename === "styles.css");
    const jsFile =
      files.find((f) => f.filename === "script.js") ||
      files.find((f) => f.filename.endsWith(".js"));

    const fullHtml = `
<!doctype html><html><head>
<meta charset="utf-8">
${cssFile ? `<style>${cssFile.code}</style>` : ""}
</head><body>
${htmlFile.code}
${jsFile ? `<script>${jsFile.code}<\/script>` : ""}
</body></html>`;

    preview.style.display = "block";
    preview.srcdoc = fullHtml;
    outputArea.textContent = "Preview rendered.";
    return;
  }

  outputArea.textContent = "Running...";

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        filename: fileObj.filename,
        code: fileObj.code
      })
    });

    const result = await res.json();

    if (result.error) {
      outputArea.textContent =
        "❌ " + result.error + "\n\n" + (result.detail || "");

      if (result.line) {
        editor.deltaDecorations([], [
          {
            range: new monaco.Range(result.line, 1, result.line, 1),
            options: {
              isWholeLine: true,
              className: "errorLineHighlight"
            }
          }
        ]);
      }

      getAIExplanation(result.error, result.line);
      return;
    }

    const out = result.output || result.result || JSON.stringify(result, null, 2);
    outputArea.textContent = out;
  } catch (err) {
    outputArea.textContent = "Run failed: " + err.toString();
  }

  async function getAIExplanation(errorMessage, line) {
    const box = document.getElementById("aiExplanation");
    box.style.display = "block";
    box.innerHTML = "<b>Analyzing error…</b>";

    const payload = {
      error: errorMessage,
      line: line,
      code: editor.getValue()
    };

    const res = await fetch("/api/explain_error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    box.innerHTML = `
        <b>🔍 Error Explanation:</b><br>${result.explanation}<br><br>
        <b>🛠 Suggested Fix:</b><br>${result.fix}
    `;
  }
}
// 📌 Initialize Package UI after DOM loads
window.addEventListener("load", () => {

  if (!pkgLangSelect || !pkgSelect) {
    console.warn("Package Manager UI not found");
    return;
  }

  // Auto-select project language if exists in dropdown
  const hasOption = Array.from(pkgLangSelect.options)
      .some(opt => opt.value.toLowerCase() === language);
  if (hasOption) pkgLangSelect.value = language;

  updatePackageDropdown();
  refreshInstalledPackages();

  // ensure on-change works
  pkgLangSelect.addEventListener("change", () => {
    updatePackageDropdown();
    refreshInstalledPackages();
  });
});

