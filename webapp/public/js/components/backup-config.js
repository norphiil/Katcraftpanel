const BackupConfig = {
  async init(container, serverName) {
    this.container = container;
    this.serverName = serverName;
    
    this.container.innerHTML = `
      <div class="loading-state"><div class="spinner"></div>Loading backup configuration...</div>
    `;
    
    try {
      this.config = await API.getBackupConfig(serverName);
      this.history = await API.getBackupHistory(serverName);
      this.render();
    } catch (err) {
      this.container.innerHTML = `<div class="form-error">Could not load backups: ${err.message}</div>`;
    }
  },

  render() {
    const c = this.config;
    
    let historyHtml = '';
    ['daily', 'weekly', 'monthly'].forEach(type => {
      if (this.history[type] && this.history[type].length > 0) {
        historyHtml += `<h4 class="mt-16 mb-8 text-secondary capitalize">${type} Backups</h4>
        <div class="file-list mb-16">`;
        
        this.history[type].forEach(file => {
          historyHtml += `
            <div class="file-item" style="grid-template-columns: 1fr 100px 160px; padding: 6px 16px;">
              <div class="file-name">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span class="ml-8">${file.name}</span>
              </div>
              <div class="file-size">${formatBytes(file.size)}</div>
              <div class="file-modified">${formatDate(file.createdTime)}</div>
            </div>
          `;
        });
        historyHtml += `</div>`;
      }
    });
    
    if (!historyHtml) {
      historyHtml = `<div class="p-4 text-center text-muted">No backup history available.</div>`;
    }

    const html = `
      <div class="card mb-24">
        <div class="card-header pb-16" style="border-bottom: 1px solid var(--border)">
          <div>
            <h3 class="card-title">Automated Google Drive Backups</h3>
            <div class="card-subtitle">Require a valid service account JSON configured via .env</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="backup-enabled" ${c.enabled ? 'checked' : ''} onchange="BackupConfig.handleToggleMain(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        
        <div id="backup-settings" style="${c.enabled ? '' : 'opacity:0.5; pointer-events:none'}">
          <form id="backup-form">
            <div class="backup-schedule mt-16">
              
              <!-- Daily -->
              <div class="backup-schedule-item">
                <div class="backup-schedule-header">
                  <div class="backup-schedule-title">Daily Snapshot</div>
                  <label class="toggle">
                    <input type="checkbox" name="daily_enabled" ${c.daily?.enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="form-row">
                  <div class="form-group mb-0">
                    <label>Run Time</label>
                    <input type="time" name="daily_time" value="${c.daily?.time || '03:00'}">
                  </div>
                  <div class="form-group mb-0">
                    <label>Retention (Keeps 1 latest snapshot limit)</label>
                    <input type="number" name="daily_retention" value="1" disabled>
                  </div>
                </div>
              </div>

              <!-- Weekly -->
              <div class="backup-schedule-item">
                <div class="backup-schedule-header">
                  <div class="backup-schedule-title">Weekly Archive</div>
                  <label class="toggle">
                    <input type="checkbox" name="weekly_enabled" ${c.weekly?.enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="form-row-3">
                  <div class="form-group mb-0">
                    <label>Day of Week</label>
                    <select name="weekly_dayOfWeek">
                      <option value="0" ${c.weekly?.dayOfWeek == 0 ? 'selected' : ''}>Sunday</option>
                      <option value="1" ${c.weekly?.dayOfWeek == 1 ? 'selected' : ''}>Monday</option>
                      <option value="5" ${c.weekly?.dayOfWeek == 5 ? 'selected' : ''}>Friday</option>
                      <option value="6" ${c.weekly?.dayOfWeek == 6 ? 'selected' : ''}>Saturday</option>
                    </select>
                  </div>
                  <div class="form-group mb-0">
                    <label>Run Time</label>
                    <input type="time" name="weekly_time" value="${c.weekly?.time || '03:00'}">
                  </div>
                  <div class="form-group mb-0">
                    <label>Retention (copies to keep)</label>
                    <input type="number" name="weekly_retention" value="${c.weekly?.retention || 4}" min="1">
                  </div>
                </div>
              </div>

              <!-- Monthly -->
              <div class="backup-schedule-item">
                <div class="backup-schedule-header">
                  <div class="backup-schedule-title">Monthly Archive</div>
                  <label class="toggle">
                    <input type="checkbox" name="monthly_enabled" ${c.monthly?.enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="form-row-3">
                  <div class="form-group mb-0">
                    <label>Day of Month</label>
                    <input type="number" name="monthly_dayOfMonth" value="${c.monthly?.dayOfMonth || 1}" min="1" max="28">
                  </div>
                  <div class="form-group mb-0">
                    <label>Run Time</label>
                    <input type="time" name="monthly_time" value="${c.monthly?.time || '03:00'}">
                  </div>
                  <div class="form-group mb-0">
                    <label>Retention</label>
                    <input type="number" name="monthly_retention" value="${c.monthly?.retention || 3}" min="1">
                  </div>
                </div>
              </div>

            </div>
            
            <div class="form-group mt-16">
              <label>Exclude Patterns (Glob)</label>
              <input type="text" name="excludePatterns" value="${(c.excludePatterns || []).join(', ')}" placeholder="logs/**, crash-reports/**">
              <div class="form-help">Comma separated file/folder globs to exclude from the backup tar.gz</div>
            </div>

            <div class="mt-24 text-right">
              <button type="button" class="btn btn-primary" onclick="BackupConfig.save()">Save Configuration</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-header pb-16" style="border-bottom: 1px solid var(--border)">
          <h3 class="card-title">Backup History</h3>
          <button class="btn btn-secondary btn-sm" onclick="BackupConfig.triggerManual()" id="btn-manual-backup">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Trigger Manual Backup
          </button>
        </div>
        <div class="mt-16">
          ${historyHtml}
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  },

  handleToggleMain(isEnabled) {
    const settings = document.getElementById('backup-settings');
    if (isEnabled) {
      settings.style.opacity = '1';
      settings.style.pointerEvents = 'all';
    } else {
      settings.style.opacity = '0.5';
      settings.style.pointerEvents = 'none';
      this.save(); // auto-save on disable
    }
  },

  async save() {
    const form = document.getElementById('backup-form');
    const fd = new FormData(form);
    
    const config = {
      enabled: document.getElementById('backup-enabled').checked,
      daily: {
        enabled: fd.get('daily_enabled') === 'on',
        time: fd.get('daily_time'),
        retention: 1
      },
      weekly: {
        enabled: fd.get('weekly_enabled') === 'on',
        dayOfWeek: parseInt(fd.get('weekly_dayOfWeek')),
        time: fd.get('weekly_time'),
        retention: parseInt(fd.get('weekly_retention'))
      },
      monthly: {
        enabled: fd.get('monthly_enabled') === 'on',
        dayOfMonth: parseInt(fd.get('monthly_dayOfMonth')),
        time: fd.get('monthly_time'),
        retention: parseInt(fd.get('monthly_retention'))
      },
      excludePatterns: fd.get('excludePatterns').split(',').map(s => s.trim()).filter(Boolean)
    };

    try {
      await API.updateBackupConfig(this.serverName, config);
      showToast('Backup configuration updated', 'success');
      this.config = config;
    } catch (err) {
      showToast(`Error saving config: ${err.message}`, 'error');
    }
  },

  async triggerManual() {
    const btn = document.getElementById('btn-manual-backup');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:1px"></div> Running...';
    
    try {
      showToast('Starting manual backup. This may take a while depending on server size.', 'info');
      await API.triggerBackup(this.serverName, 'manual');
      showToast('Manual backup completed successfully!', 'success');
      await this.init(this.container, this.serverName); // refresh
    } catch (err) {
      showToast(`Backup failed: ${err.message}`, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Trigger Manual Backup';
    }
  }
};
window.BackupConfig = BackupConfig;
