# Server Configuration Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Configuration" tab to the server detail page allowing users to edit all Docker environment variables (JVM, memory, ports, game rules, flags) for itzg/minecraft-server containers, with deferred apply on restart.

**Architecture:** New backend routes for reading/writing config to `.katcraft-server.json` metadata and recreating containers. New frontend accordion component with 6 collapsible sections. Container recreation reads metadata as single source of truth for env vars.

**Tech Stack:** Node.js/Express, Dockerode, vanilla JS (no framework), itzg/minecraft-server Docker image

---

### Task 1: Extend `createServer()` with full JVM/flag env var mappings

**Files:**
- Modify: `webapp/src/services/docker.js:250-266` (the env array in createServer)

- [ ] **Step 1: Update the env-var construction in `createServer()`**

Replace the current memory env vars and add all new mappings. In `createServer()`, find the `const env = [` block (around line 250) and replace from `MAX_MEMORY`/`INIT_MEMORY` lines through the end of the env array with the new logic.

Locate these lines in `webapp/src/services/docker.js`:
```javascript
      `MAX_MEMORY=${options.memory || '4G'}`,
      `INIT_MEMORY=${options.memory || '4G'}`,
```

Replace those two lines with the memory logic block, and add the new JVM/flag env vars after the `LOG_TIMESTAMP=true` line. Full replacement for the env section:

```javascript
      // Memory: use MEMORY for simple mode, INIT_MEMORY/MAX_MEMORY for advanced
      ...(options.initMemory || options.maxMemory
        ? [
            ...(options.initMemory ? [`INIT_MEMORY=${options.initMemory}`] : []),
            ...(options.maxMemory ? [`MAX_MEMORY=${options.maxMemory}`] : [])
          ]
        : [`MEMORY=${options.memory || '4G'}`]
      ),
      'ONLINE_MODE=false',
      `RCON_PASSWORD=${rconPassword}`,
      `RCON_PORT=${rconPort}`,
      'ENABLE_RCON=true',
      `TZ=${options.timezone || 'Europe/Paris'}`,
      `DIFFICULTY=${options.difficulty || '2'}`,
      `MODE=${options.mode || '0'}`,
      `MOTD=${options.motd || `KatCraft - ${displayName(name)}`}`,
      `SERVER_PORT=${serverPort}`,
      'LOG_TIMESTAMP=true',
      // JVM Options
      ...(options.jvmOpts ? [`JVM_OPTS=${options.jvmOpts}`] : []),
      ...(options.jvmXxOpts ? [`JVM_XX_OPTS=${options.jvmXxOpts}`] : []),
      ...(options.jvmDdOpts ? [`JVM_DD_OPTS=${options.jvmDdOpts}`] : []),
      // Optimization flags
      ...(options.useAikarFlags ? ['USE_AIKAR_FLAGS=true'] : []),
      ...(options.useMeowiceFlags ? ['USE_MEOWICE_FLAGS=true'] : []),
      // JMX
      ...(options.enableJmx ? [
        'ENABLE_JMX=true',
        `JMX_HOST=${options.jmxHost || ''}`,
        `JMX_PORT=${options.jmxPort || '7091'}`
      ] : []),
```

- [ ] **Step 2: Verify syntax with Node.js dry-run**

Run: `cd /var/home/norphiil/Services/GameServer/Minecraft/webapp && node -c src/services/docker.js`
Expected: No output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add webapp/src/services/docker.js
git commit -m "feat: extend createServer() with JVM, flags, and JMX env var mappings

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Add GET/PUT config routes and POST apply-config route

**Files:**
- Modify: `webapp/src/routes/servers.js` (add 3 routes before `module.exports`)

- [ ] **Step 1: Add the three new routes to servers.js**

Insert before the `module.exports = router;` line at the end of `webapp/src/routes/servers.js`:

```javascript
// Get server configuration from metadata
router.get('/:name/config', (req, res) => {
  try {
    const config = dockerService.readServerMeta(req.params.name);
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update server configuration (save only, no restart)
router.put('/:name/config', (req, res) => {
  try {
    const serverName = req.params.name;
    const config = req.body;

    // Validate ports
    if (config.serverPort !== undefined) {
      const port = parseInt(config.serverPort);
      if (isNaN(port) || port < 1024 || port > 65535) {
        return res.status(400).json({ error: 'Server port must be between 1024 and 65535' });
      }
    }
    if (config.rconPort !== undefined) {
      const port = parseInt(config.rconPort);
      if (isNaN(port) || port < 1024 || port > 65535) {
        return res.status(400).json({ error: 'RCON port must be between 1024 and 65535' });
      }
    }

    dockerService.writeServerMeta(serverName, config);
    const saved = dockerService.readServerMeta(serverName);
    res.json(saved);
  } catch (err) {
    console.error('[Servers] Error saving config:', err);
    res.status(500).json({ error: err.message });
  }
});

// Apply saved configuration by recreating the container
router.post('/:name/apply-config', async (req, res) => {
  try {
    const serverName = req.params.name;
    const meta = dockerService.readServerMeta(serverName);

    // Stop and remove existing container
    try {
      const container = dockerService.docker.getContainer(dockerService.containerName(serverName));
      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop({ t: 15 });
      }
      await container.remove({ force: true });
    } catch (err) {
      if (err.statusCode !== 404) throw err;
    }

    // Recreate with metadata as options
    const result = await dockerService.createServer(serverName, meta);

    // Start the new container
    await dockerService.startServer(serverName);

    // Rebuild velocity and autoserver configs
    const allServers = await dockerService.listServers();
    velocityService.rebuildVelocityConfig(allServers);
    autoserverService.rebuildAutoServerConfig(
      allServers.map(s => ({
        name: s.name,
        startupDelay: 30,
        shutdownDelay: 10,
        autoShutdownDelay: 0
      }))
    );

    res.json({
      message: 'Server restarted with new configuration',
      ...result
    });
  } catch (err) {
    console.error('[Servers] Error applying config:', err);
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Verify syntax**

Run: `cd /var/home/norphiil/Services/GameServer/Minecraft/webapp && node -c src/routes/servers.js`
Expected: No output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add webapp/src/routes/servers.js
git commit -m "feat: add GET/PUT config and POST apply-config routes for servers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Add config API methods to frontend client

**Files:**
- Modify: `webapp/public/js/api.js` (add after existing server methods)

- [ ] **Step 1: Add three new API methods**

Insert after the `getServerLogs` line in `webapp/public/js/api.js`:

```javascript
  getServerConfig(name) { return this.request(`/api/servers/${name}/config`); },
  updateServerConfig(name, config) {
    return this.request(`/api/servers/${name}/config`, {
      method: 'PUT',
      body: JSON.stringify(config)
    });
  },
  applyServerConfig(name) {
    return this.request(`/api/servers/${name}/apply-config`, { method: 'POST' });
  },
```

- [ ] **Step 2: Commit**

```bash
git add webapp/public/js/api.js
git commit -m "feat: add getServerConfig, updateServerConfig, applyServerConfig API methods

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Create the server-config.js accordion component

**Files:**
- Create: `webapp/public/js/components/server-config.js`

- [ ] **Step 1: Write the component file**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add webapp/public/js/components/server-config.js
git commit -m "feat: add server-config.js accordion component with 6 sections

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Integrate Configuration tab into server-detail.js

**Files:**
- Modify: `webapp/public/js/components/server-detail.js:87-92` (tabs) and `setupTabs():155-168`

- [ ] **Step 1: Add the Configuration tab button**

In `renderComplete()`, find the tabs section (line 87-93):
```javascript
        <button class="tab" data-tab="overview">Overview</button>
        <button class="tab" data-tab="console">Console</button>
        <button class="tab" data-tab="files">File Manager</button>
        <button class="tab" data-tab="backups">Backups</button>
        <button class="tab text-error" data-tab="danger">Danger Zone</button>
```

Insert the Configuration tab between Backups and Danger Zone:
```javascript
        <button class="tab" data-tab="overview">Overview</button>
        <button class="tab" data-tab="console">Console</button>
        <button class="tab" data-tab="files">File Manager</button>
        <button class="tab" data-tab="backups">Backups</button>
        <button class="tab" data-tab="configuration">Configuration</button>
        <button class="tab text-error" data-tab="danger">Danger Zone</button>
```

- [ ] **Step 2: Add the tab content div**

After the backups tab-content div (line 117):
```javascript
      <div class="tab-content" id="tab-backups"></div>
```

Add:
```javascript
      <div class="tab-content" id="tab-configuration"></div>
```

- [ ] **Step 3: Add lazy-load entry in setupTabs()**

In `setupTabs()`, after the backups lazy-load block (around line 165-167):
```javascript
        else if (tab.getAttribute('data-tab') === 'backups' && !this.backupsLoaded) {
          this.backupsLoaded = true;
          BackupConfig.init(target, this.serverName);
        }
```

Add:
```javascript
        else if (tab.getAttribute('data-tab') === 'configuration' && !this.configLoaded) {
          this.configLoaded = true;
          ServerConfig.init(target, this.serverName);
        }
```

- [ ] **Step 4: Commit**

```bash
git add webapp/public/js/components/server-detail.js
git commit -m "feat: add Configuration tab to server detail page

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Add CSS styles for accordion sections and config layout

**Files:**
- Modify: `webapp/public/css/style.css` (append at end)

- [ ] **Step 1: Add the config component styles**

Append to `webapp/public/css/style.css`:

```css
/* ========================================
   Server Configuration Accordion
   ======================================== */

.config-container {
  max-width: 900px;
}

.config-section {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 12px;
  overflow: hidden;
  background: var(--bg-card);
  transition: border-color var(--transition);
}

.config-section.open {
  border-color: var(--border-active);
}

.config-section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  cursor: pointer;
  user-select: none;
  transition: background var(--transition);
}

.config-section-header:hover {
  background: var(--bg-hover);
}

.config-section-icon {
  font-size: 16px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.config-section-title {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
  color: var(--text-primary);
}

.config-section-chevron {
  flex-shrink: 0;
  transition: transform var(--transition);
  color: var(--text-secondary);
}

.config-section.open .config-section-chevron {
  transform: rotate(180deg);
}

.config-section-body {
  display: none;
  padding: 0 18px 18px 18px;
  border-top: 1px solid var(--border);
  padding-top: 18px;
}

.config-section.open .config-section-body {
  display: block;
}

/* Toggle switch */
.config-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 6px 0;
  position: relative;
}

.config-toggle input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.config-toggle-slider {
  width: 40px;
  height: 22px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 11px;
  position: relative;
  transition: all var(--transition);
  flex-shrink: 0;
}

.config-toggle-slider::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-secondary);
  top: 2px;
  left: 2px;
  transition: all var(--transition);
}

.config-toggle input:checked + .config-toggle-slider {
  background: var(--accent-dim);
  border-color: var(--accent);
}

.config-toggle input:checked + .config-toggle-slider::after {
  background: white;
  left: 20px;
}

.config-toggle-label {
  font-size: 13px;
  color: var(--text-primary);
}

/* Toggle grid (for game rules checkboxes) */
.config-toggle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 4px 16px;
}

/* Radio button group (memory mode) */
.config-toggle-group {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.config-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: all var(--transition);
}

.config-radio:has(input:checked) {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-glow);
}

.config-radio input[type="radio"] {
  accent-color: var(--accent);
}

/* Config actions footer */
.config-actions {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Help text offset for toggle */
.ml-40 {
  margin-left: 52px;
}
```

- [ ] **Step 2: Commit**

```bash
git add webapp/public/css/style.css
git commit -m "feat: add accordion and toggle styles for server config component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Add script tag for server-config.js in index.html

**Files:**
- Modify: `webapp/public/index.html:127` (script tags section)

- [ ] **Step 1: Add the script tag**

After the backup-config.js script tag (line 127):
```html
  <script src="/js/components/backup-config.js"></script>
```

Add:
```html
  <script src="/js/components/server-config.js"></script>
```

- [ ] **Step 2: Commit**

```bash
git add webapp/public/index.html
git commit -m "feat: load server-config.js in index.html

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end verification

- [ ] **Step 1: Syntax check all modified files**

Run: `cd /var/home/norphiil/Services/GameServer/Minecraft/webapp && node -c src/services/docker.js && node -c src/routes/servers.js && echo "All syntax OK"`
Expected: "All syntax OK"

- [ ] **Step 2: Review the git log for the feature**

Run: `cd /var/home/norphiil/Services/GameServer/Minecraft && git log --oneline -7`
Expected: 6 commits (one per task, excluding this verification) with clear messages

- [ ] **Step 3: Manual verification checklist**

To test in the browser:
1. Navigate to a server detail page
2. Click "Configuration" tab — should see 6 accordion sections
3. Expand "JVM & Memory" (should be open by default) — verify Memory field, JVM textareas
4. Toggle memory mode between Simple/Advanced — advanced fields should show/hide
5. Expand "Optimization Flags" — verify toggles for Aikar/MeowIce
6. Expand "JMX / Profiling" — toggle Enable JMX, verify host/port fields appear
7. Check "Network & Ports" section — port fields present
8. Check "Game Rules" section — toggles and fields, enable whitelist shows players field
9. Expand "Advanced" — type select, version, etc.
10. Click "Save Configuration" → should show success toast + restart popup
11. Click "Later" → popup closes
12. Click "Save Configuration" again → click "Restart Now" → should restart container
