const Dashboard = {
  async render() {
    return `<div class="loading-state"><div class="spinner"></div>Loading dashboard...</div>`;
  },

  async init(container) {
    this.container = container;
    await this.loadData();
  },

  async loadData() {
    try {
      const servers = await API.getServers();
      const runningCount = servers.filter(s => s.state === 'running').length;
      
      const html = `
        <div class="page-header">
          <h1 class="page-title">Welcome to <span>KatCraftPanel</span></h1>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg>
            </div>
            <div class="stat-info">
              <div class="stat-value">${servers.length}</div>
              <div class="stat-label">Total Servers</div>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg>
            </div>
            <div class="stat-info">
              <div class="stat-value">${runningCount}</div>
              <div class="stat-label">Running Servers</div>
            </div>
          </div>
        </div>
        
        <h2 class="card-title mb-16">Quick Actions</h2>
        <div style="display: flex; gap: 12px; margin-bottom: 32px">
          <button class="btn btn-primary" onclick="App.navigate('create')">Create New Server</button>
          <button class="btn btn-secondary" onclick="App.navigate('servers')">Manage Servers</button>
        </div>
      `;
      
      this.container.innerHTML = html;
      Sidebar.render();
    } catch (err) {
      this.container.innerHTML = `<div class="form-error">Failed to load dashboard: ${err.message}</div>`;
    }
  }
};
window.Dashboard = Dashboard;
