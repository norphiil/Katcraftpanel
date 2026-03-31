// API Client
const API = {
  async request(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    
    if (res.status === 401 && !url.includes('/api/auth/')) {
      App.showLogin();
      throw new Error('Authentication required');
    }
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  // Auth
  login(username, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },
  logout() { return this.request('/api/auth/logout', { method: 'POST' }); },
  authStatus() { return this.request('/api/auth/status'); },

  // Servers
  getServers() { return this.request('/api/servers'); },
  getServer(name) { return this.request(`/api/servers/${name}`); },
  getServerStats(name) { return this.request(`/api/servers/${name}/stats`); },
  createServer(data) { return this.request('/api/servers', { method: 'POST', body: JSON.stringify(data) }); },
  updateServer(name, data) { return this.request(`/api/servers/${name}`, { method: 'PUT', body: JSON.stringify(data) }); },
  deleteServer(name, deleteData) { return this.request(`/api/servers/${name}?deleteData=${deleteData}`, { method: 'DELETE' }); },
  startServer(name) { return this.request(`/api/servers/${name}/start`, { method: 'POST' }); },
  stopServer(name) { return this.request(`/api/servers/${name}/stop`, { method: 'POST' }); },
  restartServer(name) { return this.request(`/api/servers/${name}/restart`, { method: 'POST' }); },
  getServerLogs(name, tail) { return this.request(`/api/servers/${name}/logs?tail=${tail || 200}`); },

  // Files
  getFiles(server, path) { return this.request(`/api/files/${server}?path=${encodeURIComponent(path || '')}`); },
  readFile(server, path) { return this.request(`/api/files/${server}/read?path=${encodeURIComponent(path)}`); },
  writeFile(server, path, content) {
    return this.request(`/api/files/${server}/write`, {
      method: 'PUT',
      body: JSON.stringify({ path, content })
    });
  },
  createDir(server, path) {
    return this.request(`/api/files/${server}/mkdir`, {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  },
  createFile(server, path, content) {
    return this.request(`/api/files/${server}/create-file`, {
      method: 'POST',
      body: JSON.stringify({ path, content: content || '' })
    });
  },
  renameFile(server, oldPath, newPath) {
    return this.request(`/api/files/${server}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ oldPath, newPath })
    });
  },
  deleteFile(server, path) {
    return this.request(`/api/files/${server}?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  },
  downloadFile(server, path) {
    window.open(`/api/files/${server}/download?path=${encodeURIComponent(path)}`, '_blank');
  },
  async uploadFiles(server, files, uploadPath, mode, onProgress) {
    const formData = new FormData();
    formData.append('path', uploadPath || '');
    formData.append('mode', mode || 'normal');
    
    for (const file of files) {
      formData.append('files', file, file.name);
      if (file.webkitRelativePath) {
        formData.append(`relativePath_${file.name}`, file.webkitRelativePath);
      }
    }
    
    const res = await fetch(`/api/files/${server}/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Upload failed');
    }
    
    return res.json();
  },
  checkConflicts(server, files, path) {
    return this.request(`/api/files/${server}/check-conflicts`, {
      method: 'POST',
      body: JSON.stringify({ files, path })
    });
  },

  // RCON
  sendRconCommand(server, command) {
    return this.request(`/api/rcon/${server}`, {
      method: 'POST',
      body: JSON.stringify({ command })
    });
  },

  // Logs
  getLogs(server, tail) { return this.request(`/api/logs/${server}?tail=${tail || 200}`); },

  // MC API
  getMcVersions() { return this.request('/api/mc/versions'); },
  getMcTypes() { return this.request('/api/mc/types'); },
  getMcDifficulties() { return this.request('/api/mc/difficulties'); },
  getMcModes() { return this.request('/api/mc/modes'); },

  // Backups
  getBackupConfig(server) { return this.request(`/api/backups/${server}/config`); },
  updateBackupConfig(server, config) {
    return this.request(`/api/backups/${server}/config`, {
      method: 'PUT',
      body: JSON.stringify(config)
    });
  },
  triggerBackup(server, type) {
    return this.request(`/api/backups/${server}/now`, {
      method: 'POST',
      body: JSON.stringify({ type })
    });
  },
  getBackupHistory(server) { return this.request(`/api/backups/${server}/history`); },

  // Config
  getVelocityConfig() { return this.request('/api/config/velocity'); },
  getAutoServerConfig() { return this.request('/api/config/autoserver'); },
  updateAutoServerConfig(server, data) {
    return this.request(`/api/config/autoserver/${server}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },
};
