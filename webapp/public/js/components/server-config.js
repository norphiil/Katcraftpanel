const ServerConfig = {
  async init(container, serverName) {
    this.container = container;
    this.serverName = serverName;
    await this.loadConfig();
    this.setupListeners();
  },

  async loadConfig() {
    try {
      this.config = await API.getServerConfig(this.serverName);
      this.render();
    } catch (err) {
      this.container.innerHTML = `<div class="form-error">Failed to load configuration: ${err.message}</div>`;
    }
  },

  render() {
    const c = this.config;

    const section = (title, icon, content, open = false) => `
      <div class="config-section ${open ? 'open' : ''}">
        <div class="config-section-header" onclick="this.parentElement.classList.toggle('open')">
          <span class="config-section-icon">${icon}</span>
          <span class="config-section-title">${title}</span>
          <svg class="config-section-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div class="config-section-body">${content}</div>
      </div>
    `;

    const toggle = (label, name, checked) => `
      <label class="config-toggle">
        <input type="checkbox" name="${name}" ${checked ? 'checked' : ''}>
        <span class="config-toggle-slider"></span>
        <span class="config-toggle-label">${label}</span>
      </label>
    `;

    const field = (label, name, value, opts = {}) => {
      const { type = 'text', placeholder = '', help = '', attrs = '' } = opts;
      if (type === 'textarea') {
        return `<div class="form-group">
          <label>${label}</label>
          <textarea name="${name}" class="font-mono text-sm" placeholder="${placeholder}" ${attrs}>${value || ''}</textarea>
          ${help ? `<div class="form-help">${help}</div>` : ''}
        </div>`;
      }
      return `<div class="form-group">
        <label>${label}</label>
        <input type="${type}" name="${name}" value="${value || ''}" placeholder="${placeholder}" ${attrs}>
        ${help ? `<div class="form-help">${help}</div>` : ''}
      </div>`;
    };

    const select = (label, name, value, options) => `
      <div class="form-group">
        <label>${label}</label>
        <select name="${name}">${options.map(o => `<option value="${o.id}" ${value == o.id ? 'selected' : ''}>${o.name}</option>`).join('')}</select>
      </div>
    `;

    const html = `
      <div class="config-container">
        ${section('JVM & Memory', '⚡', `
          <div class="form-row">
            ${field('Memory', 'memory', c.memory, { placeholder: '2G', help: 'Sets both Xms and Xmx. Use format: 2G, 512M, etc.' })}
            <div class="form-group">
              <label>Memory Mode</label>
              <div class="config-toggle-group">
                <label class="config-radio">
                  <input type="radio" name="memoryMode" value="simple" ${!c.initMemory && !c.maxMemory ? 'checked' : ''}>
                  <span>Simple (single value)</span>
                </label>
                <label class="config-radio">
                  <input type="radio" name="memoryMode" value="advanced" ${c.initMemory || c.maxMemory ? 'checked' : ''}>
                  <span>Advanced (init + max)</span>
                </label>
              </div>
            </div>
          </div>
          <div class="form-row config-advanced-memory" style="${!c.initMemory && !c.maxMemory ? 'display:none' : ''}">
            ${field('Init Memory (Xms)', 'initMemory', c.initMemory, { placeholder: '2G' })}
            ${field('Max Memory (Xmx)', 'maxMemory', c.maxMemory, { placeholder: '4G' })}
          </div>
          ${field('JVM Options', 'jvmOpts', c.jvmOpts, { type: 'textarea', placeholder: '-DpropName=value', help: 'Space-delimited JVM arguments passed as JVM_OPTS' })}
          ${field('JVM XX Options', 'jvmXxOpts', c.jvmXxOpts, { type: 'textarea', placeholder: '-XX:+UseG1GC -XX:MaxGCPauseMillis=200', help: '-XX options (space-delimited), passed as JVM_XX_OPTS' })}
          ${field('JVM -D Properties', 'jvmDdOpts', c.jvmDdOpts, { placeholder: 'fml.queryResult=confirm,name=value', help: 'Comma-separated name=value pairs passed as JVM_DD_OPTS' })}
        `, true)}

        ${section('Optimization Flags', '🚀', `
          ${toggle('Use Aikar\'s Flags', 'useAikarFlags', c.useAikarFlags)}
          <div class="form-help ml-40">Research-based JVM flags for optimal GC tuning. Good for servers with many concurrent players.</div>
          ${toggle('Use MeowIce\'s Flags', 'useMeowiceFlags', c.useMeowiceFlags)}
          <div class="form-help ml-40">Updated Aikar flags with Java 17+ optimizations. Mutually exclusive with Aikar flags in practice.</div>
        `)}

        ${section('JMX / Profiling', '📊', `
          ${toggle('Enable Remote JMX', 'enableJmx', c.enableJmx)}
          <div class="config-jmx-fields" style="${!c.enableJmx ? 'display:none' : ''}">
            <div class="form-row mt-12">
              ${field('JMX Host', 'jmxHost', c.jmxHost, { placeholder: 'localhost' })}
              ${field('JMX Port', 'jmxPort', c.jmxPort, { placeholder: '7091' })}
            </div>
          </div>
        `)}

        ${section('Network & Ports', '🌐', `
          <div class="form-row">
            ${field('Server Port', 'serverPort', c.serverPort, { type: 'number', attrs: 'min="1024" max="65535"' })}
            ${field('RCON Port', 'rconPort', c.rconPort, { type: 'number', attrs: 'min="1024" max="65535"' })}
          </div>
          ${field('RCON Password', 'rconPassword', c.rconPassword, { placeholder: 'minecraft' })}
        `)}

        ${section('Game Rules', '🎮', `
          <div class="form-row">
            ${field('MOTD', 'motd', c.motd, { placeholder: 'A KatCraft Server' })}
            ${select('Difficulty', 'difficulty', c.difficulty, [{ id: '0', name: 'Peaceful' }, { id: '1', name: 'Easy' }, { id: '2', name: 'Normal' }, { id: '3', name: 'Hard' }])}
          </div>
          <div class="form-row">
            ${select('Game Mode', 'mode', c.mode, [{ id: '0', name: 'Survival' }, { id: '1', name: 'Creative' }, { id: '2', name: 'Adventure' }, { id: '3', name: 'Spectator' }])}
            ${field('Max Players', 'maxPlayers', c.maxPlayers, { type: 'number', attrs: 'min="1"' })}
          </div>
          <div class="form-row">
            ${field('View Distance', 'viewDistance', c.viewDistance, { type: 'number', attrs: 'min="2" max="32"' })}
            ${field('Seed', 'seed', c.seed, { placeholder: 'Leave empty for random' })}
          </div>
          <div class="config-toggle-grid mt-12">
            ${toggle('PvP', 'pvp', c.pvp !== false)}
            ${toggle('Allow Flight', 'allowFlight', c.allowFlight)}
            ${toggle('Command Blocks', 'enableCommandBlock', c.enableCommandBlock)}
            ${toggle('Online Mode', 'onlineMode', c.onlineMode)}
            ${toggle('Enable Whitelist', 'enableWhitelist', c.enableWhitelist)}
          </div>
          <div class="mt-12" id="whitelist-field" style="${!c.enableWhitelist ? 'display:none' : ''}">
            ${field('Whitelist Players', 'whitelist', c.whitelist, { placeholder: 'player1,player2,player3', help: 'Comma-separated list of player names' })}
          </div>
        `)}

        ${section('Advanced', '⚙️', `
          <div class="form-row">
            ${select('Server Type', 'type', c.type, [
              { id: 'PAPER', name: 'Paper' }, { id: 'PURPUR', name: 'Purpur' },
              { id: 'FABRIC', name: 'Fabric' }, { id: 'FORGE', name: 'Forge' },
              { id: 'NEOFORGE', name: 'NeoForge' }, { id: 'VANILLA', name: 'Vanilla' },
              { id: 'SPIGOT', name: 'Spigot' }, { id: 'CUSTOM', name: 'Custom' }
            ])}
            ${field('Version', 'version', c.version, { placeholder: 'LATEST' })}
          </div>
          <div class="form-row">
            ${field('OPs', 'ops', c.ops, { placeholder: 'player1,player2' })}
            ${field('Timezone', 'timezone', c.timezone, { placeholder: 'Europe/Paris' })}
          </div>
          ${field('Spawn Protection', 'spawnProtection', c.spawnProtection, { type: 'number', attrs: 'min="0"' })}
        `)}

        <div class="config-actions">
          <button class="btn btn-primary" id="btn-save-config">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            Save Configuration
          </button>
          <div id="config-error" class="form-error mt-12" style="display:none"></div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.setupListeners();
  },

  setupListeners() {
    const saveBtn = document.getElementById('btn-save-config');
    const errBox = document.getElementById('config-error');

    if (!saveBtn) return;

    // Memory mode toggle
    document.querySelectorAll('input[name="memoryMode"]').forEach(radio => {
      radio.onchange = () => {
        const advanced = document.querySelector('.config-advanced-memory');
        if (advanced) advanced.style.display = radio.value === 'advanced' ? '' : 'none';
      };
    });

    // JMX conditional fields
    const jmxToggle = document.querySelector('input[name="enableJmx"]');
    if (jmxToggle) {
      jmxToggle.onchange = () => {
        const fields = document.querySelector('.config-jmx-fields');
        if (fields) fields.style.display = jmxToggle.checked ? '' : 'none';
      };
    }

    // Whitelist conditional field
    const whitelistToggle = document.querySelector('input[name="enableWhitelist"]');
    if (whitelistToggle) {
      whitelistToggle.onchange = () => {
        const field = document.getElementById('whitelist-field');
        if (field) field.style.display = whitelistToggle.checked ? '' : 'none';
      };
    }

    // Save button
    saveBtn.onclick = async () => {
      errBox.style.display = 'none';
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<div class="spinner"></div> Saving...';

      try {
        const data = this.collectFormData();
        await API.updateServerConfig(this.serverName, data);
        showToast('Configuration saved', 'success');

        // Ask about restart
        const restart = await showConfirm(
          'Restart Server?',
          'Configuration has been saved. The server must restart for changes to take effect.<br><br>Restart now?'
        );

        if (restart) {
          saveBtn.innerHTML = '<div class="spinner"></div> Applying...';
          try {
            await API.applyServerConfig(this.serverName);
            showToast('Server restarted with new configuration', 'success');
            // Reload parent server detail after a delay
            setTimeout(() => {
              if (window.ServerDetail && window.ServerDetail.loadData) {
                window.ServerDetail.loadData();
              }
            }, 3000);
          } catch (applyErr) {
            showToast('Failed to apply configuration: ' + applyErr.message, 'error');
          }
        }

        saveBtn.disabled = false;
        saveBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save Configuration`;
      } catch (err) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save Configuration`;
      }
    };
  },

  collectFormData() {
    const data = {};

    // Text/number/textarea fields
    this.container.querySelectorAll('input[type="text"], input[type="number"], textarea, select').forEach(el => {
      if (el.name) data[el.name] = el.value;
    });

    // Radio buttons (only save the selected value)
    const memoryMode = this.container.querySelector('input[name="memoryMode"]:checked');
    if (memoryMode && memoryMode.value === 'simple') {
      data.initMemory = '';
      data.maxMemory = '';
    }

    // Checkboxes / toggles
    this.container.querySelectorAll('input[type="checkbox"]').forEach(el => {
      data[el.name] = el.checked;
    });

    // Parse numbers
    if (data.serverPort) data.serverPort = parseInt(data.serverPort);
    if (data.rconPort) data.rconPort = parseInt(data.rconPort);
    if (data.maxPlayers) data.maxPlayers = parseInt(data.maxPlayers);
    if (data.viewDistance) data.viewDistance = parseInt(data.viewDistance);
    if (data.spawnProtection !== undefined && data.spawnProtection !== '') data.spawnProtection = parseInt(data.spawnProtection);

    return data;
  },

  cleanup() {}
};
window.ServerConfig = ServerConfig;
