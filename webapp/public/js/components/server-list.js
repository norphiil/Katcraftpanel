const ServerList = {
  async render() {
    return `<div class="loading-state"><div class="spinner"></div>Loading servers...</div>`;
  },

  async init(container) {
    this.container = container;
    await this.loadData();
  },

  async loadData() {
    try {
      const servers = await API.getServers();
      
      let html = `
        <div class="page-header">
          <h1 class="page-title">Servers</h1>
          <button class="btn btn-primary" onclick="App.navigate('create')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            New Server
          </button>
        </div>
      `;

      if (servers.length === 0) {
        html += `
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
            <h3>No servers found</h3>
            <p>You haven't created any Minecraft servers yet.</p>
            <button class="btn btn-primary" onclick="App.navigate('create')">Create Your First Server</button>
          </div>
        `;
      } else {
        html += `<div class="server-grid">`;
        
        servers.forEach(s => {
          const type = s.labels?.['katcraftpanel.type'] || 'Unknown';
          const version = s.labels?.['katcraftpanel.version'] || 'Latest';
          
          let statusBadge = '';
          if (s.state === 'running') {
            statusBadge = `<span class="badge badge-running">Running</span>`;
          } else if (s.state === 'created') {
            statusBadge = `<span class="badge badge-created">Created</span>`;
          } else {
            statusBadge = `<span class="badge badge-stopped">Offline</span>`;
          }

          html += `
            <div class="server-card" onclick="App.navigate('server-detail', { name: '${s.name}' })">
              <div class="server-card-header">
                <div class="server-card-name">${s.displayName}</div>
                <div class="server-card-badges">
                  <span class="badge badge-type">${type}</span>
                  ${statusBadge}
                </div>
              </div>
              <div class="server-card-info">
                <div class="server-card-info-item">Version: <span>${version}</span></div>
                <div class="server-card-info-item">Port: <span>${s.ports.find(p => p.PrivatePort === 25565)?.PublicPort || 'None'}</span></div>
              </div>
            </div>
          `;
        });
        
        html += `</div>`;
      }
      
      this.container.innerHTML = html;
      Sidebar.render();
    } catch (err) {
      this.container.innerHTML = `<div class="form-error">Failed to load servers: ${err.message}</div>`;
    }
  }
};
window.ServerList = ServerList;
