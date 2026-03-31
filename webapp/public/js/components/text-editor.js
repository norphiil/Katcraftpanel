const TextEditor = {
  open(serverName, pathStr, content) {
    this.serverName = serverName;
    this.path = pathStr;
    const filename = pathStr.split('/').pop();
    
    // Hide main app, show "modal" overlay that takes full screen (cleaner editor)
    const html = `
      <div id="full-editor-overlay" style="position:fixed;inset:0;background:var(--bg-deep);z-index:9000;display:flex;flex-direction:column;">
        <div class="editor-toolbar">
          <div class="editor-filename">
            <span class="text-muted">${serverName} / </span>${pathStr}
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary" onclick="TextEditor.close()">Cancel</button>
            <button class="btn btn-primary" onclick="TextEditor.save()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
              Save File
            </button>
          </div>
        </div>
        <textarea id="main-editor-textarea" class="editor-textarea" style="flex:1;border:none;margin:0;border-radius:0" spellcheck="false"></textarea>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
    const textarea = document.getElementById('main-editor-textarea');
    textarea.value = content;
    
    // Allow tabs
    textarea.addEventListener('keydown', function(e) {
      if (e.key == 'Tab') {
        e.preventDefault();
        var start = this.selectionStart;
        var end = this.selectionEnd;
        this.value = this.value.substring(0, start) + "\t" + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 1;
      }
      
      // Ctrl+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        TextEditor.save();
      }
    });

    textarea.focus();
  },

  close() {
    const el = document.getElementById('full-editor-overlay');
    if (el) el.remove();
  },

  async save() {
    const textarea = document.getElementById('main-editor-textarea');
    const content = textarea.value;
    
    try {
      await API.writeFile(this.serverName, this.path, content);
      showToast('File saved successfully', 'success');
      this.close();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
};
window.TextEditor = TextEditor;
