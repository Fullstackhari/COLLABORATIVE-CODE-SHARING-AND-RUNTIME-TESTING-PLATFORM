// static/js/script.js
document.addEventListener('DOMContentLoaded', () => {
  const messagesContainer = document.querySelector('.messages');

  function scrollToBottom() {
    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Helper to build DOM for a message (used by live socket append)
  window.appendMessage = function(msg, currentUser) {
    // check if message already rendered (avoid duplicates)
    if (document.querySelector(`.message-wrapper[data-id='${msg._id}']`)) {
      return;
    }

    const div = document.createElement('div');
    div.className = "message-wrapper " + (msg.sender === currentUser ? "sent-wrapper" : "received-wrapper");
    div.dataset.id = msg._id;
    div.dataset.sender = msg.sender;
    div.dataset.filename = msg.filename || '';

    const sender = document.createElement('div');
    sender.className = 'sender-usn';
    sender.textContent = msg.sender;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    // If soft-deleted already
    if (msg.deleted) {
      bubble.innerHTML = `<div class="text-row"><div class="text-message">(This message was deleted)</div></div>`;
    } else if (msg.filename && msg.filename !== '(message only)') {
      // File message
      const hasUrl = !!msg.file_url;
      const fileRow = document.createElement('div');
      fileRow.className = 'file-row';
      const nameDiv = document.createElement('div');
      nameDiv.className = 'file-name';
      nameDiv.textContent = msg.filename;

      const actions = document.createElement('div');
      actions.className = 'msg-actions';

      if (hasUrl) {
        // download for everyone
        const a = document.createElement('a');
        a.className = 'action-icon';
        a.href = msg.file_url;
        a.download = msg.filename || '';
        a.title = 'Download';
        const imgD = document.createElement('img');
        imgD.src = 'https://cdn-icons-png.flaticon.com/128/4208/4208397.png';
        imgD.alt = 'download';
        a.appendChild(imgD);
        actions.appendChild(a);
      }

      // delete button only for owner
      if (msg.sender === currentUser) {
        const delBtn = document.createElement('button');
        delBtn.className = 'action-icon action-delete';
        delBtn.dataset.id = msg._id;
        delBtn.title = 'Delete';
        const imgDel = document.createElement('img');
        imgDel.src = 'https://cdn-icons-png.flaticon.com/128/15015/15015989.png';
        imgDel.alt = 'delete';
        delBtn.appendChild(imgDel);
        actions.appendChild(delBtn);
      }

      fileRow.appendChild(nameDiv);
      fileRow.appendChild(actions);
      bubble.appendChild(fileRow);

    } else {
      // Text message
      const textRow = document.createElement('div');
      textRow.className = 'text-row';
      const textDiv = document.createElement('div');
      textDiv.className = 'text-message';
      textDiv.textContent = msg.code || '';

      const actions = document.createElement('div');
      actions.className = 'msg-actions';

      if (msg.sender === currentUser) {
        const delBtn = document.createElement('button');
        delBtn.className = 'action-icon action-delete';
        delBtn.dataset.id = msg._id;
        delBtn.title = 'Delete';
        const imgDel = document.createElement('img');
        imgDel.src = 'https://cdn-icons-png.flaticon.com/128/15015/15015989.png';
        imgDel.alt = 'delete';
        delBtn.appendChild(imgDel);
        actions.appendChild(delBtn);
      }

      textRow.appendChild(textDiv);
      textRow.appendChild(actions);
      bubble.appendChild(textRow);
    }

    div.appendChild(sender);
    div.appendChild(bubble);
    messagesContainer.appendChild(div);
    scrollToBottom();
  };

  // small utility escape (used if rendering from user-supplied strings elsewhere)
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/[&<>"']/g, function(m) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
    });
  }

  // Click handlers for delete (delegated) - uses fetch POST to /delete_message
  messagesContainer.addEventListener('click', function(e) {
    const btn = e.target.closest('.action-delete');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (!confirm('Delete this message?')) return;

    // send delete request (owner-only enforced server-side)
    fetch('/delete_message', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ message_id: id, usn: document.querySelector('input[name="usn"]').value })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        // server will emit message_deleted; but update optimistically too
        const el = document.querySelector(`.message-wrapper[data-id='${id}']`);
        if (el) {
          const bubble = el.querySelector('.chat-bubble');
          if (bubble) {
            bubble.innerHTML = '<div class="text-row"><div class="text-message">(This message was deleted)</div></div>';
          }
        }
      } else {
        alert(res.error || 'Unable to delete message');
      }
    }).catch(err => {
      console.error('Delete error', err);
      alert('Delete failed');
    });
  });

  // copy helper for "copy text" elements if you still use them
  window.copyToClipboard = function(element) {
    const code = element.getAttribute('data-code');
    navigator.clipboard.writeText(code).then(() => {
      alert("Code copied!");
    }).catch(err => {
      console.error("Failed to copy text: ", err);
      alert("Failed to copy code.");
    });
  };

  // file input UI helpers
  window.handleFileSelection = function(event) {
    const fileInput = event.target;
    const messageBox = document.getElementById('messageBox');
    if (fileInput.files.length > 0) {
      messageBox.value = fileInput.files[0].name + " attached. ";
    } else {
      messageBox.value = "";
    }
  };

  window.handleSend = function(event) {
    const fileInput = document.getElementById('fileInput');
    const messageBox = document.getElementById('messageBox');
    if (fileInput.files.length === 0 && messageBox.value.trim() === "") {
      alert("Please enter a message or select a file to send.");
      event.preventDefault();
      return;
    }
    // allow form to submit (server handles file saving)
  };

  // auto scroll on load
  scrollToBottom();

  // Listen for delete events from server (real-time update)
const socket = io();

socket.on("message_deleted", data => {
    const id = data._id;
    const el = document.querySelector(`.message-wrapper[data-id='${id}']`);
    if (!el) return;

    const bubble = el.querySelector('.chat-bubble');
    if (bubble) {
        bubble.innerHTML = '<div class="text-row"><div class="text-message">(This message was deleted)</div></div>';
    }

    // Hide delete/download icons after deletion
    const actions = el.querySelector('.msg-actions');
    if (actions) actions.style.display = "none";
});

});
