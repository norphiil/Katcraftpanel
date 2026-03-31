const ServerDetail = {
  async render(params) {
    return `<div class="loading-state"><div class="spinner"></div>Loading server details...</div>`;
  },

  async init(container, params) {
    this.container = container;
    this.serverName = params.name;
    await this.loadData();
  },

  async loadData() {
    try {
      this.server = await API.getServer(this.serverName);
      this.renderComplete();
    } catch (err) {
      this.container.innerHTML = `
        <div class="empty-state pt-10">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <h3>Server Not Found</h3>
          <p>The server "${this.serverName}" does not exist or has been deleted.</p>
          <button class="btn btn-primary" onclick="App.navigate('servers')">Back to Servers</button>
        </div>
      `;
    }
  },

  renderComplete() {
    const s = this.server;
    let statusClass = 'badge-stopped';
    let statusText = 'Offline';
    let isRunning = false;
    
    if (s.state.Running) {
      statusClass = 'badge-running';
      statusText = 'Running';
      isRunning = true;
    } else if (s.state.Status === 'created') {
      statusClass = 'badge-created';
      statusText = 'Created';
    }

    const type = s.config.Labels?.['katcraftpanel.type'] || 'Unknown';
    const version = s.config.Labels?.['katcraftpanel.version'] || 'Latest';
    const port = s.networkSettings.Ports?.['25565/tcp']?.[0]?.HostPort || 'Unknown';
    
    // AutoServer status text (since AutoServer wakes it up, 'Offline' on panel means 'Sleeping' to players)
    const displayStatusText = isRunning ? 'Running' : 'Sleeping (Auto-Wake on connect)';

    const html = `
      <div class="page-header">
        <h1 class="page-title"><span style="background: none; -webkit-text-fill-color: initial; color: inherit;">🕹️</span> ${s.displayName}</h1>
        <div class="server-detail-actions">
          ${!isRunning ? 
            `<button class="btn btn-primary" onclick="ServerDetail.startServer()">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
               Wake Up
             </button>` : 
            `<button class="btn btn-danger" onclick="ServerDetail.stopServer()">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
               Stop
             </button>
             <button class="btn btn-secondary" onclick="ServerDetail.restartServer()">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
             </button>`
          }
        </div>
      </div>

      <div class="card mb-24">
        <div style="display: flex; gap: 40px;">
          <div>
            <div class="text-secondary text-sm mb-4">Status</div>
            <div class="badge ${statusClass}">${displayStatusText}</div>
          </div>
          <div>
            <div class="text-secondary text-sm mb-4">Type / Version</div>
            <div class="font-medium">${type} ${version}</div>
          </div>
          <div>
            <div class="text-secondary text-sm mb-4">Container</div>
            <div class="font-medium font-mono text-sm">${s.containerName}</div>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="overview">Overview</button>
        <button class="tab" data-tab="console">Console</button>
        <button class="tab" data-tab="files">File Manager</button>
        <button class="tab" data-tab="backups">Backups</button>
        <button class="tab text-error" data-tab="danger">Danger Zone</button>
      </div>

      <div class="tab-content active" id="tab-overview">
        <div class="stats-grid mb-24" id="server-live-stats" style="${!isRunning ? 'display:none' : ''}">
          <div class="stat-card">
            <div class="stat-icon blue">⚡</div>
            <div class="stat-info">
              <div class="stat-value" id="stat-cpu">0%</div>
              <div class="stat-label">CPU Usage</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">🧠</div>
            <div class="stat-info">
              <div class="stat-value" id="stat-mem">0 B</div>
              <div class="stat-label">Memory</div>
            </div>
          </div>
        </div>
        ${!isRunning ? `<div class="card mb-24 text-center text-muted py-10">Server is currently sleeping. It will automatically start when a player connects.</div>` : ''}
      </div>

      <div class="tab-content" id="tab-console"></div>
      <div class="tab-content" id="tab-files"></div>
      <div class="tab-content" id="tab-backups"></div>
      
      <div class="tab-content" id="tab-danger">
        <div class="card border-error bg-error-dim">
          <h3 class="text-error mb-16">Danger Zone</h3>
          <p class="text-secondary mb-16">Deleting a server removes the container and configuration. This action cannot be easily undone without a backup.</p>
          
          <div class="flex items-center gap-12 mt-24">
            <label class="flex items-center gap-8 text-sm">
              <input type="checkbox" id="delete-data-checkbox">
              Also delete all server data files permanently?
            </label>
            <button class="btn btn-danger" onclick="ServerDetail.deleteServer()">Delete Server</button>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.setupTabs();

    if (isRunning) {
      this.startStatsPoll();
    }
  },

  setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(tab => {
      tab.onclick = () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const target = document.getElementById(`tab-${tab.getAttribute('data-tab')}`);
        target.classList.add('active');

        // Lazy load components
        if (tab.getAttribute('data-tab') === 'console' && !this.consoleLoaded) {
          this.consoleLoaded = true;
          Terminal.init(target, this.serverName);
        }
        else if (tab.getAttribute('data-tab') === 'files' && !this.filesLoaded) {
          this.filesLoaded = true;
          FileManager.init(target, this.serverName);
        }
        else if (tab.getAttribute('data-tab') === 'backups' && !this.backupsLoaded) {
          this.backupsLoaded = true;
          BackupConfig.init(target, this.serverName);
        }
      };
    });
  },

  startStatsPoll() {
    this.stopStatsPoll();
    const updateStats = async () => {
      try {
        const stats = await API.getServerStats(this.serverName);
        const cpuEl = document.getElementById('stat-cpu');
        const memEl = document.getElementById('stat-mem');
        if (cpuEl && memEl) {
          cpuEl.textContent = `${stats.cpu}%`;
          memEl.textContent = `${formatBytes(stats.memory.usage)} / ${formatBytes(stats.memory.limit)}`;
        }
      } catch (err) {}
    };
    updateStats();
    this.statsInterval = setInterval(updateStats, 3000);
  },

  stopStatsPoll() {
    if (this.statsInterval) clearInterval(this.statsInterval);
  },

  async startServer() {
    try {
      showToast('Waking up server...', 'info');
      await API.startServer(this.serverName);
      setTimeout(() => this.loadData(), 2000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async stopServer() {
    try {
      showToast('Stopping server...', 'info');
      await API.stopServer(this.serverName);
      setTimeout(() => this.loadData(), 2000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async restartServer() {
    try {
      showToast('Restarting server...', 'info');
      await API.restartServer(this.serverName);
      setTimeout(() => this.loadData(), 3000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async deleteServer() {
    const delData = document.getElementById('delete-data-checkbox')?.checked;
    
    if (await showConfirm('Delete Server', `Are you absolutely sure you want to delete ${this.serverName}? ${delData ? '<b>ALL DATA FILES WILL BE PERMANENTLY DESTROYED!</b>' : ''}`)) {
      try {
        await API.deleteServer(this.serverName, delData);
        showToast('Server deleted successfully', 'success');
        Sidebar.render();
        App.navigate('servers');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  },

  cleanup() {
    this.stopStatsPoll();
    if (this.consoleLoaded) Terminal.cleanup();
  }
};
window.ServerDetail = ServerDetail;
