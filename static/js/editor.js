// static/js/editor.js
// OneCompiler-style editor with tabs + Monaco + SocketIO collaboration

// ✅ Force websocket for faster communication (prevents slow polling on cloud)
const socket = io({ transports: ["websocket"] });

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

// ✅ Open file elements (already in editor.html)
const openFileBtn = document.getElementById("openFileBtn");
const openFileInput = document.getElementById("openFileInput");


// ✅ Monaco workers config
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

// ✅ Match Monaco version with editor.html (0.43.0)
require.config({
  paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs" }
});


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
  c: ["glibc", "openssl", "libcurl", "pthread"],
  cpp: ["boost", "eigen", "opencv", "fmt", "spdlog"],
  react: ["react", "react-dom", "react-router-dom", "axios", "redux", "react-query"],
  nosql: ["pymongo", "mongoose", "redis", "motor"]
};

const pkgLangSelect = document.getElementById("pkgLang");
const pkgSelect = document.getElementById("pkgSelect");
const installedPkgsList = document.getElementById("installedPkgs");
const btnInstallPkg = document.getElementById("btnInstallPkg");

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

async function refreshInstalledPackages() {
  if (!installedPkgsList || !pkgLangSelect) return;

  const res = await fetch("/api/list_packages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectName: project })
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

if (btnInstallPkg) {
  btnInstallPkg.addEventListener("click", async () => {
    if (!pkgLangSelect || !pkgSelect) return;

    const pkgLang = pkgLangSelect.value;
    const pkg = pkgSelect.value;

    if (!pkg) return alert("Select a package");

    const res = await fetch("/api/install_pkg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: project,
        language: pkgLang,
        package: pkg
      })
    });

    const result = await res.json();
    outputArea.textContent = result.output || result.error || "";
    refreshInstalledPackages();
  });
}

window.addEventListener("load", () => {
  if (pkgLangSelect) {
    const hasOption = Array.from(pkgLangSelect.options).some(
      (opt) => opt.value.toLowerCase() === language
    );
    if (hasOption) pkgLangSelect.value = language;

    updatePackageDropdown();
    refreshInstalledPackages();

    pkgLangSelect.addEventListener("change", () => {
      updatePackageDropdown();
      refreshInstalledPackages();
    });
  }
});


// ===============================
// 📂 OPEN FILE (VS Code–like)
// ===============================
if (openFileBtn && openFileInput) {
  openFileBtn.addEventListener("click", () => {
    openFileInput.click();
  });

  openFileInput.addEventListener("change", (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (!selectedFiles.length) return;

    selectedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const code = reader.result;
        const filename = file.name;

        // Prevent duplicates
        if (files.some((f) => f.filename === filename)) {
          selectFile(filename);
          return;
        }

        // Add file locally
        files.push({ filename, code });

        // Sync with collaborators
        socket.emit("create_file", {
          projectName: project,
          language: language,
          filename: filename,
          code: code
        });

        renderTabs();
        selectFile(filename);
      };
      reader.readAsText(file);
    });

    openFileInput.value = "";
  });
}


// -----------------------------
// Monaco setup
// -----------------------------
require(["vs/editor/editor.main"], function () {
  // React JSX support
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowSyntheticDefaultImports: true,
    allowJs: true,
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    noEmit: true
  });

  editor = monaco.editor.create(document.getElementById("editor"), {
    value: "",
    language: "javascript",
    theme: "vs-dark",
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: true },
    folding: true
  });

  // disable heavy squiggle diagnostics
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true
  });

  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true
  });

  // ✅ JOIN ROOM ONLY ONCE (FIX)
  socket.emit("join", { projectName: project, language: language });

  // ✅ file list only once (FIX)
  socket.on("file_list", (payload) => {
    files = payload.files || payload || [];
    renderTabs();
    if (!currentFile && files.length) selectFile(files[0].filename);
  });

  // ✅ code update only once (FIX)
  socket.on("code_update", (payload) => {
    if (payload.projectName !== project || payload.language !== language) return;

    // Update editor view only for current file
    if (currentFile === payload.filename && editor.getValue() !== payload.code) {
      const pos = editor.getPosition();
      editor.setValue(payload.code);
      if (pos) editor.setPosition(pos);
    }

    // Update local file cache
    const idx = files.findIndex((f) => f.filename === payload.filename);
    if (idx !== -1) files[idx].code = payload.code;
  });

  // Debounced content sync
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

  btnRun?.addEventListener("click", runCode);
  document.getElementById("btnShare")?.addEventListener("click", shareFile);

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

  // ✅ Delete button from editor.html
  document.getElementById("btnDeleteFile")?.addEventListener("click", () => {
    if (!currentFile) return alert("Select file first");
    if (!confirm("Delete " + currentFile + " ?")) return;

    const deletedFile = currentFile;

    socket.emit("delete_file", {
      projectName: project,
      language: language,
      filename: deletedFile
    });

    files = files.filter((f) => f.filename !== deletedFile);
    currentFile = null;

    // Clear editor
    const emptyModel = monaco.editor.createModel("", "plaintext");
    editor.setModel(emptyModel);

    renderTabs();
  });
});


// -----------------------------
// Tabs rendering
// -----------------------------
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
      return;
    }

    const out = result.output || result.result || JSON.stringify(result, null, 2);
    outputArea.textContent = out;
  } catch (err) {
    outputArea.textContent = "Run failed: " + err.toString();
  }
}
