const ServerCreate = {
  async render() {
    return `<div class="loading-state"><div class="spinner"></div>Loading configuration...</div>`;
  },

  async init(container) {
    this.container = container;
    await this.loadData();
    this.setupListeners();
  },

  async loadData() {
    try {
      this.types = await API.getMcTypes();
      this.versions = await API.getMcVersions();
      this.difficulties = await API.getMcDifficulties();
      this.modes = await API.getMcModes();

      const html = `
        <div class="page-header">
          <h1 class="page-title">Create New Server</h1>
          <button class="btn btn-secondary" onclick="App.navigate('servers')">Cancel</button>
        </div>
        
        <div class="card">
          <form id="create-server-form" onsubmit="return false;">
            <div class="form-row">
              <div class="form-group">
                <label for="server-name">Server Name</label>
                <input type="text" id="server-name" name="name" required placeholder="survival-1" pattern="[a-zA-Z0-9-]+" title="Letters, numbers and hyphens only">
                <div class="form-help">Lower case letters, numbers, and hyphens only. Example: lobby, survival-1</div>
              </div>
              
              <div class="form-group">
                <label for="server-motd">Message of the Day (MOTD)</label>
                <input type="text" id="server-motd" name="motd" placeholder="A KatCraft Server">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="server-type">Software Type</label>
                <select id="server-type" name="type" required>
                  ${this.types.map(t => `<option value="${t.id}">${t.name} - ${t.description}</option>`).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label for="server-version">Minecraft Version</label>
                <select id="server-version" name="version" required>
                  <option value="LATEST">Latest Release (${this.versions.latest.release})</option>
                  ${this.versions.versions.slice(0, 20).map(v => `<option value="${v.id}">${v.id}</option>`).join('')}
                </select>
              </div>
            </div>

            <h3 class="card-title mt-16 mb-16">Network & Ports</h3>
            
            <div class="form-row">
              <div class="form-group">
                <label for="server-game-port">Game Port</label>
                <input type="number" id="server-game-port" name="serverPort" value="25565" min="1024" max="65535">
                <div class="form-help">Port for Minecraft client connections (default: 25565)</div>
              </div>
              
              <div class="form-group">
                <label for="server-rcon-port">RCON Port</label>
                <input type="number" id="server-rcon-port" name="rconPort" value="25575" min="1024" max="65535">
                <div class="form-help">Port for remote console access (default: 25575)</div>
              </div>
            </div>

            <h3 class="card-title mt-16 mb-16">Resources & AutoServer</h3>
            
            <div class="form-row">
              <div class="form-group">
                <label for="server-memory">Max Memory</label>
                <input type="text" id="server-memory" name="memory" value="2G" required>
              </div>
              
              <div class="form-group">
                <label for="server-autoShutdown">Auto Shutdown Delay (seconds)</label>
                <input type="number" id="server-autoShutdown" name="autoShutdownDelay" value="600" min="0">
                <div class="form-help">Time idle before AutoServer stops it. 0 to disable. Default: 10 mins (600s).</div>
              </div>
            </div>

            <h3 class="card-title mt-16 mb-16">Game Rules</h3>

            <div class="form-row-3">
              <div class="form-group">
                <label for="server-difficulty">Difficulty</label>
                <select id="server-difficulty" name="difficulty">
                  ${this.difficulties.map(d => `<option value="${d.id}" ${d.id === '2' ? 'selected' : ''}>${d.name}</option>`).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label for="server-mode">Game Mode</label>
                <select id="server-mode" name="mode">
                  ${this.modes.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label for="server-maxPlayers">Max Players</label>
                <input type="number" id="server-maxPlayers" name="maxPlayers" value="20" min="1">
              </div>
            </div>

            <div class="form-row-3">
              <div class="form-group">
                <label class="flex items-center gap-8">
                  <input type="checkbox" name="pvp" checked>
                  Enable PvP
                </label>
              </div>
              <div class="form-group">
                <label class="flex items-center gap-8">
                  <input type="checkbox" name="enableCommandBlock">
                  Enable Command Blocks
                </label>
              </div>
              <div class="form-group">
                <label class="flex items-center gap-8">
                  <input type="checkbox" name="allowFlight">
                  Allow Flight
                </label>
              </div>
            </div>

            <div class="wizard-actions">
              <button type="button" class="btn btn-secondary" onclick="App.navigate('servers')">Cancel</button>
              <button type="button" class="btn btn-primary" id="btn-create-server">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Create Server
              </button>
            </div>
            
            <div id="create-error" class="form-error mt-16" style="display:none"></div>
          </form>
        </div>
      `;

      this.container.innerHTML = html;
      this.setupListeners();
    } catch (err) {
      this.container.innerHTML = `<div class="form-error">Could not load configuration form: ${err.message}</div>`;
    }
  },

  setupListeners() {
    const btn = document.getElementById('btn-create-server');
    const errBox = document.getElementById('create-error');
    const form = document.getElementById('create-server-form');

    if (!btn || !form) return;

    btn.onclick = async () => {
      if (!form.reportValidity()) return;

      errBox.style.display = 'none';
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Creating...';

      try {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Handle checkboxes (if unchecked, they don't appear in formData)
        data.pvp = form.pvp.checked ? 'true' : 'false';
        data.serverPort = parseInt(data.serverPort);
        data.rconPort = parseInt(data.rconPort);
        data.enableCommandBlock = form.enableCommandBlock.checked;
        data.allowFlight = form.allowFlight.checked;
        
        // Parse numbers
        if (data.autoShutdownDelay) data.autoShutdownDelay = parseInt(data.autoShutdownDelay);
        if (data.maxPlayers) data.maxPlayers = parseInt(data.maxPlayers);

        const res = await API.createServer(data);
        showToast(res.message || 'Server created successfully', 'success');
        
        Sidebar.render();
        App.navigate('server-detail', { name: res.name });
      } catch (err) {
        errBox.textContent = err.message || 'Failed to create server';
        errBox.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Create Server';
      }
    };
  }
};
window.ServerCreate = ServerCreate;
