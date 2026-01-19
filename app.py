import requests
import mimetypes
from bson.objectid import ObjectId
from flask import Flask, render_template, request, redirect, url_for, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from flask_socketio import SocketIO, join_room, leave_room, emit
from dotenv import load_dotenv
load_dotenv()
from openai import OpenAI
import os

# Load API key from .env
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# -----------------------
# Project Packages Collection + Defaults
# -----------------------
DEFAULT_ALLOWED_PACKAGES = {
    "python": [
        # AI/ML
        "numpy", "pandas", "matplotlib", "scikit-learn", "tensorflow",
        "torch", "opencv-python", "xgboost", "nltk", "transformers",
        # Web/DB
        "flask", "django", "fastapi", "sqlalchemy", "pymongo",
        # Utility
        "requests", "beautifulsoup4", "pillow", "cryptography"
    ],
    "javascript": [
        "axios", "express", "mongoose", "react", "redux",
        "lodash", "moment", "bcryptjs", "jsonwebtoken", "jest",
        "vite", "webpack", "chart.js"
    ],
    "java": [
        "spring-boot-starter-web",
        "spring-boot-starter-data-jpa",
        "mysql-connector-java"
    ]
}


# -----------------------
# JDoodle credentials
# -----------------------
CLIENT_ID = "442fe1723d5731111b7549a825ce3655"
CLIENT_SECRET = "3228b45aeb6447df58a2309d2d630a7b53c6f69f60847e9a728d3b3b3e840583"

# -----------------------
# LANGUAGE ICONS
# -----------------------
ICON_URLS = {
    "html":  "https://cdn-icons-png.flaticon.com/128/1051/1051277.png",
    "react":   "https://cdn-icons-png.flaticon.com/128/3459/3459528.png",
    "javascript": "https://cdn-icons-png.flaticon.com/128/1199/1199124.png",
    "python": "https://cdn-icons-png.flaticon.com/128/5968/5968350.png",
    "java":  "https://cdn-icons-png.flaticon.com/128/5968/5968282.png",
    "cpp":   "https://cdn-icons-png.flaticon.com/128/6132/6132222.png",
    "c":     "https://cdn-icons-png.flaticon.com/128/3665/3665923.png",
    "ruby":  "https://cdn-icons-png.flaticon.com/128/919/919842.png",
    "msql":  "https://cdn-icons-png.flaticon.com/128/15484/15484291.png"
}

# -----------------------
# Config
# -----------------------
UPLOAD_FOLDER = "uploads"
app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# -----------------------
# MongoDB
# -----------------------
from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017/")
db = client["code_collab"]

project_packages_coll = db["project_packages"]
teams_coll = db.teams
messages_coll = db.messages
files_coll = db.files
uploads_coll = db.uploads



# -----------------------
# Default starter files
# -----------------------
def default_files_for_language(language):
    language = (language or "").lower()
    if language == "ruby":
        return [{"filename": "main.rb", "code": "puts 'Hello, Ruby!'"}]
    if language in ("msql", "mysql", "sql"):
        return [{"filename": "query.sql", "code": "SELECT 'Hello from SQL!' AS message;"}]
    if language == "html":
        return [
            {
                "filename": "index.html",
                "code": """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Hello HTML</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<h1>Hello HTML</h1>
<script src="script.js"></script>
</body>
</html>"""
            },
            {"filename": "styles.css", "code": "body { font-family: Arial; }"},
            {"filename": "script.js", "code": "console.log('Hello from HTML JS');"}
        ]
    if language == "css":
        return [{"filename": "styles.css", "code": "body { background:white; }"}]
    if language == "javascript":
        return [{"filename": "index.js", "code": "console.log('Hello JS');"}]
    if language == "python":
        return [{"filename": "main.py", "code": "print('Hello Python')"}]
    if language == "java":
        return [{
            "filename": "Main.java",
            "code": """public class Main {
    public static void main(String[] args){
        System.out.println("Hello Java");
    }
}"""
        }]
    if language == "cpp":
        return [{"filename": "Main.cpp", "code": "#include <iostream>\nint main(){ std::cout << \"Hello C++\"; }"}]
    if language == "c":
        return [{"filename": "main.c", "code": "#include <stdio.h>\nint main(){ printf(\"Hello C\"); }"}]
    if language == "react":
     return [
        {
            "filename": "index.html",
            "code": """<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>React App</title>
<div id="root"></div>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="app.js"></script>
</head>
<body>
</body>
</html>"""
        },
        {
            "filename": "app.js",
            "code": """const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement('h1', null, 'Hello from React!'));
"""
        },
        {
            "filename": "styles.css",
            "code": "body { background:#f8f9fa; font-family:Arial; }"
        }
    ]

    return [{"filename": "file.txt", "code": ""}]

# -----------------------
# Routes
# -----------------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/login", methods=["GET"])
def login_get():
    return redirect("/")

@app.route("/create_team", methods=["POST"])
def create_team():
    projectName = request.form["projectName"].strip()

    # Get list of USNs (remove blanks)
    usns = [u.strip() for u in request.form.getlist("usns") if u.strip()]

    # Validate minimum members
    if len(usns) < 4:
        return render_template("index.html", create_error="At least 4 members required")

    # ❗ CHECK IF PROJECT NAME ALREADY EXISTS
    existing = teams_coll.find_one({"projectName": projectName})
    if existing:
        return render_template("index.html", create_error="Project name already taken")

    # Insert new team
    teams_coll.insert_one({"projectName": projectName, "members": usns})

    return redirect("/")

@app.route("/login", methods=["POST"])
def login_post():
    projectName = request.form["projectName"]
    usn = request.form["usn"]

    team = teams_coll.find_one({"projectName": projectName, "members": usn})

    if not team:
        # return the login page again with error message
        return render_template("index.html", error="Invalid login"), 401

    return redirect(f"/chatbot/{projectName}/{usn}")


@app.route("/chatbot/<projectName>/<usn>")
def chatbot_page(projectName, usn):
    msgs = list(messages_coll.find({"projectName": projectName}))
    for m in msgs:
        m["_id"] = str(m["_id"])
    return render_template("dashboard.html", usn=usn, projectName=projectName, messages=msgs)

@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

@app.route("/send_message", methods=["POST"])
def send_message():
    usn = request.form["usn"]
    projectName = request.form["projectName"]
    message = request.form.get("message", "").strip()
    file = request.files.get("codefile")

    filename = "(message only)"
    code_content = message
    file_url = None
    file_type = None

    if file and file.filename:
        filename = secure_filename(file.filename)
        os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
        path = os.path.join(app.config["UPLOAD_FOLDER"], filename)

        base, ext = os.path.splitext(filename)
        counter = 1
        while os.path.exists(path):
            filename = f"{base}_{counter}{ext}"
            path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            counter += 1

        file.save(path)
        with open(path, "rb") as f:
            file_data = f.read()
        upload_doc = {
            "projectName": projectName,
            "sender": usn,
            "original_name": filename,
            "stored_name": filename,
            "content": file_data,                 # store binary file
            "mimetype": file_type,
            "filesize": os.path.getsize(path)
        }
        file_db_record = uploads_coll.insert_one(upload_doc)
        file_db_id = str(file_db_record.inserted_id)
        file_url = url_for("download_db_file", file_id=file_db_id)
        mimetype = file.mimetype or mimetypes.guess_type(path)[0] or "application/octet-stream"
        file_type = mimetype
        file_url = url_for("uploaded_file", filename=filename)

        text_exts = {'.txt', '.py', '.js', '.html', '.css', '.sql', '.rb', '.md', '.java', '.c', '.cpp'}
        if ext.lower() in text_exts:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    code_content = f.read()
            except:
                code_content = message
        else:
            code_content = message

    doc = {
        "sender": usn,
        "projectName": projectName,
        "filename": filename,
        "code": code_content,
        "file_url": file_url,           # now DB-based URL
        "file_type": file_type,
        "file_db_id": file_db_id if file and file.filename else None,
        "deleted": False
    }

    inserted = messages_coll.insert_one(doc)
    doc["_id"] = str(inserted.inserted_id)
    socketio.emit("new_message", doc, room=f"{projectName}:__chat")
    return redirect(f"/chatbot/{projectName}/{usn}")

# -----------------------
# SOFT DELETE MESSAGE (OWNER ONLY)
# -----------------------
@app.route("/delete_message", methods=["POST"])
def delete_message():
    data = request.get_json(force=True)
    message_id = data.get("message_id")
    requester = data.get("usn")
    if not message_id or not requester:
        return jsonify({"success": False, "error": "Missing parameters"}), 400
    try:
        oid = ObjectId(message_id)
    except:
        return jsonify({"success": False, "error": "Invalid ID"}), 400
    msg = messages_coll.find_one({"_id": oid})
    if not msg:
        return jsonify({"success": False, "error": "Message not found"}), 404
    if msg["sender"] != requester:
        return jsonify({"success": False, "error": "Not allowed"}), 403
    messages_coll.update_one(
        {"_id": oid},
        {"$set": {
            "deleted": True,
            "code": "(This message was deleted)",
            "filename": "(message only)",
            "file_url": None,
            "file_type": None
        }}
    )
    socketio.emit("message_deleted", {"_id": message_id}, room=f"{msg['projectName']}:__chat")
    return jsonify({"success": True})

# -----------------------
# Editor routes
# -----------------------
@app.route("/editor-home/<projectName>/<usn>")
def editor_home(projectName, usn):
    languages = [
        "html", "react", "javascript", "python",
        "java", "cpp", "c",
        "ruby", "msql"
    ]
    return render_template(
        "editor_home.html",
        projectName=projectName,
        usn=usn,
        languages=languages,
        icons=ICON_URLS
    )

@app.route("/editor/<projectName>/<usn>/<language>")
def editor(projectName, usn, language):
    doc = files_coll.find_one({"projectName": projectName, "language": language})
    if not doc:
        files_coll.insert_one({
            "projectName": projectName,
            "language": language,
            "files": default_files_for_language(language)
        })
    return render_template(
        "editor.html",
        projectName=projectName,
        usn=usn,
        language=language
    )

@app.route("/api/files/<projectName>/<language>")
def api_files(projectName, language):
    doc = files_coll.find_one({"projectName": projectName, "language": language})
    if not doc:
        return jsonify({"files": default_files_for_language(language)})
    return jsonify({"files": doc["files"]})

# -----------------------
# PISTON RUN API (Unlimited)
# -----------------------
@app.route("/api/run", methods=["POST"])
def api_run():
    data = request.json
    language = (data.get("language") or "").lower()
    code = data.get("code", "")

    # -------------------------
    # SQL HANDLER (SQLite Engine) — BOX TABLE OUTPUT
    # -------------------------
    if language in ["sql", "mysql", "msql"]:
        import sqlite3
        try:
            db = sqlite3.connect(":memory:")
            cursor = db.cursor()
            cursor.executescript(code)

            statements = [line.strip() for line in code.split(";") if line.strip()]
            last_line = statements[-1].lower() if statements else ""

            if last_line.startswith("select"):
                cursor.execute(statements[-1])
                rows = cursor.fetchall()
                cols = [d[0] for d in cursor.description]

                col_widths = [
                    max(len(str(col)), max((len(str(row[i])) for row in rows), default=0))
                    for i, col in enumerate(cols)
                ]

                sep = "+" + "+".join("-" * (w + 2) for w in col_widths) + "+"
                header = "| " + " | ".join(
                    str(col).ljust(col_widths[i]) for i, col in enumerate(cols)
                ) + " |"
                body = "\n".join(
                    "| " + " | ".join(
                        str(row[i]).ljust(col_widths[i]) for i in range(len(cols))
                    ) + " |"
                    for row in rows
                )
                table = f"{sep}\n{header}\n{sep}\n{body}\n{sep}"

                return jsonify({"output": table})

            return jsonify({"output": "SQL executed successfully."})

        except Exception as e:
            return jsonify({"error": "SQL Error", "detail": str(e)})

    # -------------------------
    # NON-SQL → Piston API
    # -------------------------
    piston_map = {
        "python": "python3",
        "js": "nodejs",
        "javascript": "nodejs",
        "java": "java",
        "c": "c",
        "cpp": "cpp",
        "ruby": "ruby",
        "sql": "mysql",
        "msql": "mysql",
        "mysql": "mysql"
    }

    if language in ["html", "react"]:
        return jsonify({"html_preview": code})

    if language not in piston_map:
        return jsonify({"error": "Language not supported"}), 400

    # Build proper payload including filename — required for JavaScript stdout
    file_ext = "js" if language in ["javascript", "js"] else "py"

    payload = {
    "language": piston_map[language],
    "version": "*",
    "files": [{
        "name": f"main.{file_ext}",
        "content": code
    }],
    "stdin": "",
    "compile_timeout": 30000,
    "run_timeout": 30000,
    "compile_memory_limit": -1,
    "run_memory_limit": -1
}



    try:
        r = requests.post(
            "https://emkc.org/api/v2/piston/execute",
            json=payload,
            timeout=20
        )
        result = r.json()

        # -------------------------
        # OUTPUT NORMALIZER — FIXED
        # -------------------------
        run_data = result.get("run", {})

        stdout = (
           run_data.get("stdout")
           or run_data.get("output")
           or ""
        )

        stderr = run_data.get("stderr", "")

        # 🎯 If JS throws error
        if stderr:
            import re
            match = re.search(r":(\d+):(\d+)", stderr)
            if match:
                line_no = int(match.group(1))
                col_no = int(match.group(2))
                code_lines = code.split("\n")
                if 0 < line_no <= len(code_lines):
                    err_line = code_lines[line_no - 1]
                    pointer = " " * (col_no - 1) + "^"
                    stderr += (
                        f"\n📌 Line {line_no}, Column {col_no}\n"
                        f"➡️ {err_line}\n"
                        f"   {pointer}\n"
                    )
            return jsonify({"output": f"❌ JavaScript Error:\n{stderr}"})

        # 🟢 Correct output printing
        if stdout:
            return jsonify({"output": stdout.strip()})


        # ⚠ If only stderr exists (JS error or runtime issue)
        if stderr:
            return jsonify({"output": stderr})

        # 🟡 Truly no output
        return jsonify({"output": "(no output)"})


    except Exception as e:
        return jsonify({"error": "Piston API error", "detail": str(e)}), 500


@app.route("/api/share_file", methods=["POST"])
def api_share_file():
    data = request.json
    usn = data.get("usn")
    projectName = data.get("projectName")
    filename = data.get("filename")
    code = data.get("code")

    if not all([usn, projectName, filename]):
        return jsonify({"success": False, "error": "Missing fields"}), 400

    # save file to uploads folder
    safe_name = secure_filename(filename)
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    path = os.path.join(app.config["UPLOAD_FOLDER"], safe_name)

    with open(path, "w", encoding="utf-8") as f:
        f.write(code)

    file_url = url_for("uploaded_file", filename=safe_name)

    # prepare message document
    doc = {
        "sender": usn,
        "projectName": projectName,
        "filename": filename,
        "code": code,
        "file_url": file_url,
        "file_type": "text/plain",
        "deleted": False
    }

    inserted = messages_coll.insert_one(doc)
    doc["_id"] = str(inserted.inserted_id)

    socketio.emit("new_message", doc, room=f"{projectName}:__chat")

    return jsonify({"success": True})

from flask import Response

@app.route("/dbfile/<file_id>")
def download_db_file(file_id):
    try:
        oid = ObjectId(file_id)
    except:
        return "Invalid file ID", 400

    file_doc = uploads_coll.find_one({"_id": oid})
    if not file_doc:
        return "File not found", 404

    return Response(
        file_doc["content"],
        mimetype=file_doc["mimetype"],
        headers={
            "Content-Disposition": f"attachment; filename={file_doc['original_name']}"
        }
    )
def extract_error_line(msg):
    import re
    match = re.search(r"line (\d+)", msg)
    return int(match.group(1)) if match else None

@app.route("/api/explain_error", methods=["POST"])
def explain_error():
    data = request.json

    prompt = f"""
    The following code produced this error:

    ERROR: {data['error']}
    LINE: {data['line']}

    CODE:
    {data['code']}

    Explain in simple words:
    1. Why the error happened
    2. What line caused it
    3. How to fix it
    """

    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )

    reply = completion.choices[0].message.content

    return {"explanation": reply, "fix": reply}

@app.route("/api/ai_complete", methods=["POST"])
def ai_complete():
    try:
        data = request.json
        code = data.get("code", "")

        if not code.strip():
            return jsonify({"completion": ""})

        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Updated model
            messages=[{"role": "user", "content": f"Continue:\n{code}"}],
            max_tokens=40,
            temperature=0.4
        )

        suggestion = response.choices[0].message.content.strip()
        return jsonify({"completion": suggestion})

    except Exception as e:
        print("AI Completion Error:", e)  # Debug log
        return jsonify({"error": str(e)}), 500

    
@app.route("/api/install_pkg", methods=["POST"])
def install_package():
    """
    Registers a package for the project (no real installation inside Piston).
    Only preinstalled packages will actually work in the sandbox.
    """

    data = request.json or {}
    language = (data.get("language") or "").lower()
    pkg = (data.get("package") or "").strip()
    project = (data.get("projectName") or "").strip()

    if not project or not language or not pkg:
        return jsonify({"error": "Missing project/language/package"}), 400

    # Normalize JS name
    if language in ["js", "node", "nodejs"]:
        language = "javascript"

    # Supported languages only
    if language not in ["python", "javascript", "java"]:
        return jsonify({"error": "Invalid language"}), 400

    # Ensure project record exists
    project_packages_coll.update_one(
        {"projectName": project},
        {"$setOnInsert": {"allowed": DEFAULT_ALLOWED_PACKAGES, "installed": {}}},
        upsert=True
    )

    # Track package in DB (no sandbox installation)
    project_packages_coll.update_one(
        {"projectName": project},
        {"$addToSet": {f"installed.{language}": pkg}}
    )

    # Message to health-check installation
    msg = (
        f"📦 '{pkg}' added to project dependencies.\n\n"
        "⚠ Note:\n"
        "Piston sandbox does NOT allow installing new packages.\n"
        "This package will work only if it is already preinstalled on Piston."
    )

    return jsonify({
        "output": msg,
        "language": language,
        "package": pkg
    })



@app.route("/api/list_packages", methods=["POST"])
def list_packages():
    """
    Returns allowed + installed packages for a project:
    {
      allowed: { python: [...], javascript: [...], java: [...] },
      installed: { python: [...], javascript: [...], java: [...] }
    }
    """
    data = request.json or {}
    project = (data.get("projectName") or "").strip()

    if not project:
        return jsonify({"error": "Missing projectName"}), 400

    doc = project_packages_coll.find_one({"projectName": project}) or {}

    installed = doc.get("installed", {})
    allowed = doc.get("allowed", DEFAULT_ALLOWED_PACKAGES)

    return jsonify({
        "allowed": allowed,
        "installed": installed
    })



# -----------------------
# Socket.IO Events
# -----------------------
@socketio.on("join")
def on_join(data):
    project = data.get("projectName")
    lang = data.get("language")
    if not project or not lang:
        return
    room = f"{project}:{lang}"
    join_room(room)
    doc = files_coll.find_one({"projectName": project, "language": lang})
    if doc:
        # emit a consistent object (editor.js tolerates both forms but keep it consistent)
        emit("file_list", {"files": doc["files"], "projectName": project, "language": lang})

@socketio.on("code_update")
def on_code_update(data):
    project = data.get("projectName")
    lang = data.get("language")
    filename = data.get("filename")
    code = data.get("code")
    if not project or not lang or not filename:
        return
    files_coll.update_one(
        {"projectName": project, "language": lang, "files.filename": filename},
        {"$set": {"files.$.code": code}}
    )
    emit("code_update", {"projectName": project, "language": lang, "filename": filename, "code": code}, room=f"{project}:{lang}", include_self=False)

# -----------------------
# File actions (CREATE, DELETE, RENAME)
# -----------------------
@socketio.on("create_file")
def create_file(data):
    project = data.get("projectName")
    lang = data.get("language")
    filename = data.get("filename")
    code = data.get("code", "")
    if not project or not lang or not filename:
        return

    # Ensure language doc exists
    doc = files_coll.find_one({"projectName": project, "language": lang})
    if not doc:
        files_coll.insert_one({"projectName": project, "language": lang, "files": default_files_for_language(lang)})
        doc = files_coll.find_one({"projectName": project, "language": lang})

    # Prevent duplicate filenames
    existing = next((f for f in doc["files"] if f["filename"] == filename), None)
    if existing:
        # send current list back (no-op)
        emit("file_list", {"files": doc["files"], "projectName": project, "language": lang}, room=f"{project}:{lang}")
        return

    files_coll.update_one(
        {"projectName": project, "language": lang},
        {"$push": {"files": {"filename": filename, "code": code}}}
    )

    doc = files_coll.find_one({"projectName": project, "language": lang})
    emit("file_list", {"files": doc["files"], "projectName": project, "language": lang}, room=f"{project}:{lang}")

@socketio.on("delete_file")
def delete_file(data):
    project = data.get("projectName")
    lang = data.get("language")
    filename = data.get("filename")
    if not project or not lang or not filename:
        return

    files_coll.update_one(
        {"projectName": project, "language": lang},
        {"$pull": {"files": {"filename": filename}}}
    )

    doc = files_coll.find_one({"projectName": project, "language": lang})
    files = doc["files"] if doc else []
    emit("file_list", {"files": files, "projectName": project, "language": lang}, room=f"{project}:{lang}")

@socketio.on("rename_file")
def rename_file(data):
    project = data.get("projectName")
    lang = data.get("language")
    old = data.get("oldName")
    new = data.get("newName")
    if not project or not lang or not old or not new:
        return

    doc = files_coll.find_one({"projectName": project, "language": lang})
    if not doc:
        return

    # Map files, rename matching entry, write back entire files array (simple and atomic enough for small arrays)
    updated = []
    renamed = False
    for f in doc["files"]:
        if f.get("filename") == old:
            # avoid duplicate name
            if any(x["filename"] == new for x in doc["files"]):
                # name collision — just re-emit current list and return
                emit("file_list", {"files": doc["files"], "projectName": project, "language": lang}, room=f"{project}:{lang}")
                return
            f = {"filename": new, "code": f.get("code", "")}
            renamed = True
        updated.append(f)

    if not renamed:
        # nothing to rename
        emit("file_list", {"files": doc["files"], "projectName": project, "language": lang}, room=f"{project}:{lang}")
        return

    files_coll.update_one(
        {"projectName": project, "language": lang},
        {"$set": {"files": updated}}
    )

    new_doc = files_coll.find_one({"projectName": project, "language": lang})
    emit("file_list", {"files": new_doc["files"], "projectName": project, "language": lang}, room=f"{project}:{lang}")


# -----------------------
# Server Start
# -----------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port)