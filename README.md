
# Collaborative Code Sharing and Runtime Testing Platform

## 📌 Project Overview
The Collaborative Code Sharing and Runtime Testing Platform is a browser-based development environment designed to enable real-time collaborative coding, code execution, and communication among multiple users. The platform eliminates the need for local IDE setup and fragmented tools by providing a unified workspace suitable for academic and remote development environments.

---

## 🎯 Problem Statement
To design and develop a unified browser-based platform that enables real-time collaborative coding, execution, and communication to improve productivity and learning in remote and academic environments.

---

## 🚀 Features
- Real-time collaborative code editing
- Multi-language support (HTML, CSS, JavaScript, Python, Java, C, C++, Ruby, SQL)
- Secure server-side code execution using Piston API
- Monaco Editor with syntax highlighting and LSP support
- File creation, deletion, opening from local system
- Project-based team login system
- Live chatbot for team communication
- File sharing from editor to chatbot
- Package manager for installing dependencies
- Dynamic output panel
- Language switching without reloading
- Browser-based (no local setup required)

---

## 🛠️ Technologies Used

### Frontend
- HTML5
- CSS3
- JavaScript
- Monaco Editor

### Backend
- Python
- Flask
- Flask-SocketIO

### APIs & Tools
- Piston API (for code execution)
- WebSockets (real-time collaboration)
- Language Server Protocol (LSP)

---

## 🗂️ Project Structure
STUDENT_COLLABARATION_PLATFORM/
│
├── app.py
├── README.md
├── templates/
│ ├── index.html
│ ├── dashboard.html
│ ├── editor_home.html
│ └── editor.html
│
├── static/
│ ├── css/
│ │ └── style.css
│ ├── js/
│ │ ├── editor.js
│ │ ├── script.js
│ │ └── monaco/
│
├── uploads/
├── node_modules/
└── .env 


---

## ⚙️ How to Run the Project

1. Clone the repository
2. Navigate to the project directory
3. Create and activate a virtual environment (optional but recommended)
4. Install required Python dependencies
5. Run the Flask application

```bash
python app.py

Open browser and visit:
http://127.0.0.1:5000

# COLLABORATIVE-CODE-SHARING-AND-RUNTIME-TESTING-PLATFORM
Collaborative Code Sharing and Runtime Testing Platform is a browser-based IDE that supports real-time team coding using Socket.IO, chatbot communication with file sharing, and multi-language execution (Python, Java, JS, C/C++, React, SQL) via Piston API. It also includes package management and AI-based code suggestions and error explanations.

