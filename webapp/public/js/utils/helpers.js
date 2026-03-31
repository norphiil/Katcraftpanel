// Utility helpers

/**
 * Display name: capitalize first letter of each word (split by hyphens)
 */
function displayName(name) {
  if (!name) return '';
  return name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Sanitize name for server keys
 */
function sanitizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format date to relative or absolute
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format date with time
 */
function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleString('en', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = '300ms ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Show modal dialog
 */
function showModal(title, content, actions = []) {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal-content');
  
  let actionsHtml = '';
  if (actions.length) {
    actionsHtml = `<div class="modal-actions">${actions.map(a => 
      `<button class="btn ${a.class || 'btn-secondary'}" onclick="${a.onclick}">${a.label}</button>`
    ).join('')}</div>`;
  }
  
  modal.innerHTML = `
    <h3 class="modal-title">${title}</h3>
    <div class="modal-text">${content}</div>
    ${actionsHtml}
  `;
  
  overlay.style.display = 'flex';
  
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal();
  };
}

/**
 * Close modal
 */
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

/**
 * Show confirm dialog
 */
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal-content');
    
    modal.innerHTML = `
      <h3 class="modal-title">${title}</h3>
      <div class="modal-text">${message}</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-confirm">Confirm</button>
      </div>
    `;
    
    overlay.style.display = 'flex';
    
    document.getElementById('modal-cancel').onclick = () => {
      overlay.style.display = 'none';
      resolve(false);
    };
    
    document.getElementById('modal-confirm').onclick = () => {
      overlay.style.display = 'none';
      resolve(true);
    };
    
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.style.display = 'none';
        resolve(false);
      }
    };
  });
}

/**
 * Get file icon SVG based on extension
 */
function getFileIcon(name, isDirectory) {
  if (isDirectory) {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
  }
  
  const ext = name.split('.').pop().toLowerCase();
  const configExts = ['yml', 'yaml', 'toml', 'json', 'properties', 'cfg', 'conf', 'ini'];
  const codeExts = ['js', 'ts', 'java', 'py', 'sh', 'bat', 'cmd'];
  const textExts = ['txt', 'md', 'log', 'csv'];
  const archiveExts = ['zip', 'tar', 'gz', 'rar', '7z'];
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp'];
  
  if (configExts.includes(ext)) {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2a 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
  }
  
  if (archiveExts.includes(ext)) {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>';
  }
  
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
}

/**
 * Debounce function
 */
function debounce(fn, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}
