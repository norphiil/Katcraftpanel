const FileManager = {
  async init(container, serverName) {
    this.container = container;
    this.serverName = serverName;
    this.currentPath = '';
    
    this.container.innerHTML = `
      <div class="card">
        <div class="file-toolbar mb-16">
          <button class="btn btn-secondary btn-icon" onclick="FileManager.navigateUp()" title="Go up">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          
          <div class="breadcrumb" id="file-breadcrumb">
             <!-- Breadcrumbs inserted here -->
          </div>
          
          <div style="flex-grow: 1"></div>
          
          <button class="btn btn-secondary" onclick="FileManager.showNewDirectory()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            New Folder
          </button>
          
          <button class="btn btn-secondary" onclick="FileManager.showNewFile()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            New File
          </button>

          <label class="btn btn-primary" style="cursor: pointer;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            Upload
            <input type="file" id="file-upload-input" multiple style="display: none;" onchange="FileManager.handleFilesSelect(event)">
          </label>
        </div>
        
        <div class="file-list">
          <div class="file-list-header">
            <div>Name</div>
            <div>Size</div>
            <div>Modified</div>
            <div style="text-align: right">Actions</div>
          </div>
          <div id="file-list-content">
            <div class="loading-state py-8"><div class="spinner"></div></div>
          </div>
        </div>
        
        <!-- Dropzone overlay -->
        <div id="file-dropzone" class="drop-zone hidden mt-16">
          <div class="drop-zone-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          </div>
          <h3>Drop files here to upload</h3>
        </div>
      </div>
    `;

    this.setupDragDrop();
    await this.loadPath('');
  },

  async loadPath(pathStr) {
    try {
      this.currentPath = pathStr.replace(/\/+/g, '/').replace(/^\//, '');
      const data = await API.getFiles(this.serverName, this.currentPath);
      
      this.renderBreadcrumb();
      
      const content = document.getElementById('file-list-content');
      
      if (data.files.length === 0) {
        content.innerHTML = `<div class="p-4 text-center text-muted py-8">Folder is empty</div>`;
        return;
      }
      
      content.innerHTML = data.files.map(f => {
        const icon = getFileIcon(f.name, f.isDirectory);
        const clickAction = f.isDirectory 
          ? `FileManager.loadPath('${f.path}')`
          : `FileManager.openFile('${f.path}')`;
          
        return `
          <div class="file-item">
            <div class="file-name" onclick="${clickAction}">
              <div class="file-icon ${f.isDirectory ? 'folder' : ''}">${icon}</div>
              <span>${f.name}</span>
            </div>
            <div class="file-size">${f.isDirectory ? '-' : formatBytes(f.size)}</div>
            <div class="file-modified">${formatDate(f.modified)}</div>
            <div class="file-actions">
              ${!f.isDirectory ? `
                <button class="btn-icon" onclick="FileManager.downloadFile('${f.path}')" title="Download">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                </button>
              ` : ''}
              <button class="btn-icon text-error-hover" onclick="FileManager.deleteItem('${f.path}')" title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
              </button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  renderBreadcrumb() {
    const parts = this.currentPath ? this.currentPath.split('/') : [];
    const breadcrumb = document.getElementById('file-breadcrumb');
    
    let html = `
      <div class="breadcrumb-item ${parts.length === 0 ? 'active' : ''}" onclick="FileManager.loadPath('')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
      </div>
    `;
    
    let curr = '';
    for (let i = 0; i < parts.length; i++) {
      curr += (i > 0 ? '/' : '') + parts[i];
      html += `<div class="breadcrumb-sep">/</div>`;
      html += `<div class="breadcrumb-item ${i === parts.length - 1 ? 'active' : ''}" onclick="FileManager.loadPath('${curr}')">${parts[i]}</div>`;
    }
    
    breadcrumb.innerHTML = html;
  },

  navigateUp() {
    if (!this.currentPath) return;
    const parts = this.currentPath.split('/');
    parts.pop();
    this.loadPath(parts.join('/'));
  },

  async openFile(pathStr) {
    try {
      const data = await API.readFile(this.serverName, pathStr);
      TextEditor.open(this.serverName, pathStr, data.content);
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  downloadFile(pathStr) {
    API.downloadFile(this.serverName, pathStr);
  },

  async deleteItem(pathStr) {
    if (await showConfirm('Delete Item', `Are you sure you want to delete "${pathStr.split('/').pop()}"?`)) {
      try {
        await API.deleteFile(this.serverName, pathStr);
        showToast('Deleted item successfully', 'success');
        this.loadPath(this.currentPath);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  },

  async showNewDirectory() {
    const name = prompt("Enter folder name:");
    if (!name) return;
    
    try {
      const dirPath = this.currentPath ? `${this.currentPath}/${name}` : name;
      await API.createDir(this.serverName, dirPath);
      this.loadPath(this.currentPath);
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async showNewFile() {
    const name = prompt("Enter file name:");
    if (!name) return;
    
    try {
      const filePath = this.currentPath ? `${this.currentPath}/${name}` : name;
      await API.createFile(this.serverName, filePath, '');
      this.loadPath(this.currentPath);
      this.openFile(filePath);
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  /* Drag and Drop Upload logic */
  setupDragDrop() {
    const dz = document.getElementById('file-dropzone');
    
    window.addEventListener('dragenter', (e) => {
      if (e.dataTransfer.types.includes('Files')) {
        dz.classList.remove('hidden');
        dz.classList.add('dragover');
      }
    });

    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('dragover');
    });

    dz.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      if (e.clientX === 0 && e.clientY === 0) dz.classList.add('hidden');
    });

    dz.addEventListener('drop', async (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      dz.classList.add('hidden');
      
      if (e.dataTransfer.files.length) {
        await this.handleFiles(e.dataTransfer.files);
      }
    });
  },

  async handleFilesSelect(e) {
    if (e.target.files.length) {
      await this.handleFiles(e.target.files);
    }
    e.target.value = ''; // Reset
  },

  async handleFiles(files) {
    try {
      // Check for conflicts
      const filenames = Array.from(files).map(f => f.name);
      const conflictRes = await API.checkConflicts(this.serverName, filenames, this.currentPath);
      
      let mode = 'normal';
      
      if (conflictRes.conflicts && conflictRes.conflicts.length > 0) {
        const answer = await new Promise((resolve) => {
          showModal('File Conflict', `Some files already exist in this folder:<br><strong>${conflictRes.conflicts.join('<br>')}</strong><br><br>What would you like to do?`, [
            { label: 'Cancel', class: 'btn-secondary', onclick: 'closeModal(); window._conflictAnswer = null;' },
            { label: 'Rename New', class: 'btn-secondary', onclick: 'closeModal(); window._conflictAnswer = "rename";' },
            { label: 'Overwrite All', class: 'btn-primary', onclick: 'closeModal(); window._conflictAnswer = "overwrite";' }
          ]);
          
          const wait = setInterval(() => {
            if (window._conflictAnswer !== undefined) {
              clearInterval(wait);
              const ans = window._conflictAnswer;
              delete window._conflictAnswer;
              resolve(ans);
            }
          }, 100);
        });
        
        if (!answer) return; // Cancelled
        mode = answer;
      }
      
      showToast(`Uploading ${files.length} file(s)...`, 'info');
      await API.uploadFiles(this.serverName, files, this.currentPath, mode);
      
      showToast('Upload complete!', 'success');
      this.loadPath(this.currentPath);
      
    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error');
    }
  }
};
window.FileManager = FileManager;
