const BackupConfig = {
  countdownInterval: null,

  async init(container, serverName) {
    this.container = container;
    this.serverName = serverName;

    this.container.innerHTML = `<div class="loading-state"><div class="spinner"></div>Loading backup configuration...</div>`;

    try {
      const [status, history, config] = await Promise.all([
        API.getBackupStatus(),
        API.getBackupHistory(),
        API.getBackupGlobalConfig()
      ]);
      this.status = status;
      this.history = history;
      this.globalConfig = config;
      this.serverConfig = await API.getBackupConfig(serverName);
      this.render();
    } catch (err) {
      this.container.innerHTML = `<div class="form-error">Could not load backups: ${err.message}</div>`;
    }
  },

  render() {
    const s = this.status;
    const c = this.globalConfig;

    // Last backup status
    const lastBackup = s.lastSuccess;
    let lastBackupHtml = '';

    if (lastBackup) {
      const statusLabel = lastBackup.success === false
        ? '<span style="color:var(--error)">FAILED</span>'
        : '<span style="color:var(--success)">Success</span>';
      const commitStr = lastBackup.commitHash
        ? ` <code style="font-size:11px">${lastBackup.commitHash.substring(0, 7)}</code>`
        : '';
      const note = lastBackup.note === 'no changes' ? ' (no changes)' : '';
      const errorMsg = (!lastBackup.success && lastBackup.error)
        ? `<div style="font-size:11px; color:var(--error); margin-top:2px">${lastBackup.error}</div>`
        : '';
      lastBackupHtml = `
        <div class="backup-status-row">
          <span>Last backup: <strong>${formatDateTime(lastBackup.timestamp)}</strong> — ${formatDate(lastBackup.timestamp)}</span>
          <span>${statusLabel}${note}${commitStr}</span>
        </div>${errorMsg}`;
    } else {
      lastBackupHtml = `<div class="backup-status-row"><span class="text-muted">No backup recorded yet.</span></div>`;
    }

    // Next backup countdown
    let nextBackupHtml = '';
    if (c.enabled && s.nextBackup) {
      nextBackupHtml = `<div class="backup-status-row" id="backup-countdown">
        <span>Next backup: <strong>${formatDateTime(s.nextBackup)}</strong></span>
        <span id="countdown-timer" class="text-info font-medium"></span>
      </div>`;
    } else if (!c.enabled) {
      nextBackupHtml = `<div class="backup-status-row"><span class="text-muted">Backups are disabled.</span></div>`;
    } else {
      nextBackupHtml = `<div class="backup-status-row"><span class="text-muted">Schedule not configured.</span></div>`;
    }

    // Schedule presets
    const currentSchedule = c.schedule || '0 0,13 * * *';
    const presetTimes = [
      { label: '00:00', cron: '0 0 * * *' },
      { label: '06:00', cron: '0 6 * * *' },
      { label: '12:00', cron: '0 12 * * *' },
      { label: '13:00', cron: '0 13 * * *' },
      { label: '18:00', cron: '0 18 * * *' },
      { label: '00:00 + 13:00', cron: '0 0,13 * * *' },
    ];

    let presetHtml = presetTimes.map(p => {
      const active = p.cron === currentSchedule ? 'btn btn-primary btn-xs' : 'btn btn-secondary btn-xs';
      return `<button class="${active}" onclick="BackupConfig.applyPreset('${p.cron}')">${p.label}</button>`;
    }).join(' ');

    // History
    let historyHtml = '';
    if (this.history.length > 0) {
      historyHtml = `
      <div class="file-list">
        <div class="file-item file-item-header" style="grid-template-columns: 150px 90px 1fr 110px 60px">
          <div class="file-name" style="font-weight:600">Date</div>
          <div class="file-size" style="font-weight:600">Type</div>
          <div class="file-size" style="font-weight:600">Details</div>
          <div class="file-size" style="font-weight:600">Commit</div>
          <div class="file-modified" style="font-weight:600">Status</div>
        </div>`;

      this.history.forEach(entry => {
        const statusIcon = entry.success
          ? '<span style="color:var(--success)" title="Success">OK</span>'
          : `<span style="color:var(--error)">ERR</span>`;
        const servers = (entry.servers || []).join(', ');
        const commit = entry.commitHash
          ? `<code style="font-size:11px" title="${entry.commitHash}">${entry.commitHash.substring(0, 7)}</code>`
          : (entry.note || '<span class="text-muted" style="font-size:11px">—</span>');

        // Show error message on failure, servers on success
        let detailsHtml = servers;
        if (!entry.success && entry.error) {
          detailsHtml = `<span style="color:var(--error); font-size:11px; cursor:help" title="${entry.error.replace(/"/g, '&quot;')}">${entry.error.substring(0, 60)}${entry.error.length > 60 ? '...' : ''}</span>`;
        }

        historyHtml += `
          <div class="file-item" style="grid-template-columns: 150px 90px 1fr 110px 60px; padding:6px 16px">
            <div class="file-name" style="font-size:12px">${formatDateTime(entry.timestamp)}</div>
            <div class="file-size"><span class="badge badge-type">${entry.type}</span></div>
            <div class="file-size" style="font-size:12px">${detailsHtml}</div>
            <div class="file-size">${commit}</div>
            <div class="file-modified">${statusIcon}</div>
          </div>`;
      });
      historyHtml += `</div>`;
    } else {
      historyHtml = `<div class="p-8 text-center text-muted">No backup history yet. Trigger a manual backup to get started.</div>`;
    }

    // Git status info
    let gitInfo = '';
    if (s.lastCommit) {
      const parts = s.lastCommit.split(' ');
      const hash = parts[0];
      const msg = parts.slice(1).join(' ');
      gitInfo = `<div class="p-4 text-muted" style="font-size:11px">Git HEAD: <code>${hash ? hash.substring(0, 7) : s.lastCommit.substring(0, 7)}</code> ${msg.substring(0, 80)}</div>`;
    }

    const repoName = (s.config && s.config.gitRemote) || 'norphiil/minecraft-server-save';

    const html = `
      <div class="card mb-24">
        <div class="card-header pb-16" style="border-bottom:1px solid var(--border)">
          <div>
            <h3 class="card-title">GitHub Backup</h3>
            <div class="card-subtitle">Repo: <code>${repoName}</code></div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="backup-enabled" ${c.enabled ? 'checked' : ''} onchange="BackupConfig.handleToggleMain(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="mt-16" style="display:flex; flex-direction:column; gap:8px">
          ${lastBackupHtml}
          ${nextBackupHtml}
          ${gitInfo}
        </div>
      </div>

      <div class="card mb-24" id="backup-settings" style="${c.enabled ? '' : 'opacity:0.5; pointer-events:none'}">
        <div class="card-header pb-12" style="border-bottom:1px solid var(--border)">
          <h3 class="card-title">Schedule</h3>
        </div>
        <form id="backup-form" class="mt-16">
          <div class="form-group mb-8">
            <label>Quick Presets</label>
            <div style="display:flex; gap:6px; flex-wrap:wrap">${presetHtml}</div>
          </div>
          <div class="form-row" style="align-items:end">
            <div class="form-group mb-0" style="flex:1">
              <label>Cron Expression</label>
              <input type="text" name="schedule" id="schedule-input" value="${currentSchedule}" placeholder="0 0,13 * * *">
              <div class="form-help">min hour dom month dow</div>
            </div>
          </div>

          <div class="backup-schedule-item mt-16">
            <div class="form-group mb-0">
              <label>Exclude Patterns (${this.serverName})</label>
              <input type="text" name="excludePatterns" value="${(this.serverConfig.excludePatterns || []).join(', ')}" placeholder="logs/**, crash-reports/**">
              <div class="form-help">Comma-separated glob patterns</div>
            </div>
          </div>

          <div class="mt-16 text-right">
            <button type="button" class="btn btn-primary" onclick="BackupConfig.save()">Save Configuration</button>
          </div>
        </form>
      </div>

      <div class="card mb-24">
        <div class="card-header pb-12" style="border-bottom:1px solid var(--border)">
          <h3 class="card-title">Actions</h3>
        </div>
        <div class="mt-16" style="display:flex; gap:12px">
          <button class="btn btn-primary" onclick="BackupConfig.triggerManual()" id="btn-manual-backup">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Run Backup Now
          </button>
          <button class="btn btn-secondary" onclick="BackupConfig.triggerManual()" id="btn-push-backup" style="display:none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
            Push to GitHub
          </button>
          <span id="backup-running-indicator" style="display:none; align-items:center; gap:8px; color:var(--info)">
            <div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Backup running...
          </span>
        </div>
      </div>

      <div class="card">
        <div class="card-header pb-12" style="border-bottom:1px solid var(--border)">
          <h3 class="card-title">History</h3>
          <span class="text-muted text-sm">${this.history.length} entries</span>
        </div>
        <div class="mt-16">
          ${historyHtml}
        </div>
      </div>
    `;

    this.container.innerHTML = html;

    // Start countdown timer
    if (c.enabled && s.nextBackup) {
      this.startCountdown(s.nextBackup);
    }
  },

  startCountdown(nextBackupIso) {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    const update = () => {
      const el = document.getElementById('countdown-timer');
      if (!el) {
        clearInterval(this.countdownInterval);
        return;
      }
      const now = new Date();
      const next = new Date(nextBackupIso);
      const diff = next - now;

      if (diff <= 0) {
        el.textContent = 'Starting now...';
        clearInterval(this.countdownInterval);
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (hours > 0) {
        el.textContent = `in ${hours}h ${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        el.textContent = `in ${minutes}m ${seconds}s`;
      } else {
        el.textContent = `in ${seconds}s`;
      }
    };

    update();
    this.countdownInterval = setInterval(update, 1000);
  },

  applyPreset(cron) {
    document.getElementById('schedule-input').value = cron;
    // Update button styles
    const btns = document.querySelectorAll('#backup-settings .btn-xs');
    btns.forEach(b => b.className = 'btn btn-secondary btn-xs');
    const clicked = document.querySelector(`#backup-settings .btn-xs[onclick*="${cron}"]`);
    if (clicked) clicked.className = 'btn btn-primary btn-xs';
  },

  handleToggleMain(isEnabled) {
    const settings = document.getElementById('backup-settings');
    if (isEnabled) {
      settings.style.opacity = '1';
      settings.style.pointerEvents = 'all';
    } else {
      settings.style.opacity = '0.5';
      settings.style.pointerEvents = 'none';
      this.save();
    }
  },

  async save() {
    const form = document.getElementById('backup-form');
    const fd = new FormData(form);

    const globalConfig = {
      enabled: document.getElementById('backup-enabled').checked,
      schedule: fd.get('schedule'),
      excludePatterns: ['logs/**', 'crash-reports/**']
    };

    const serverConfig = {
      excludePatterns: fd.get('excludePatterns').split(',').map(s => s.trim()).filter(Boolean)
    };

    try {
      await Promise.all([
        API.updateBackupGlobalConfig(globalConfig),
        API.updateBackupConfig(this.serverName, serverConfig)
      ]);
      showToast('Backup configuration saved', 'success');

      // Refresh to update countdown
      const [status, history, config] = await Promise.all([
        API.getBackupStatus(),
        API.getBackupHistory(),
        API.getBackupGlobalConfig()
      ]);
      this.status = status;
      this.history = history;
      this.globalConfig = config;
      this.render();
    } catch (err) {
      showToast(`Error saving config: ${err.message}`, 'error');
    }
  },

  async triggerManual() {
    const btn = document.getElementById('btn-manual-backup');
    const indicator = document.getElementById('backup-running-indicator');
    btn.disabled = true;
    btn.style.display = 'none';
    if (indicator) indicator.style.display = 'flex';

    try {
      const result = await API.triggerBackupNow('manual');
      if (!result.started) {
        showToast('Backup could not start', 'error');
        btn.disabled = false;
        btn.style.display = '';
        if (indicator) indicator.style.display = 'none';
        return;
      }
      showToast('Backup started...', 'info');

      // Poll for completion
      await this.pollBackupCompletion(btn, indicator);
    } catch (err) {
      showToast(`Backup failed: ${err.message}`, 'error');
      btn.disabled = false;
      btn.style.display = '';
      if (indicator) indicator.style.display = 'none';
    }
  },

  async pollBackupCompletion(btn, indicator) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const status = await API.getBackupStatus();
        if (!status.running) {
          // Backup completed
          if (status.lastBackup && !status.lastBackup.success) {
            showToast(`Backup failed: ${status.lastBackup.error || 'Unknown error'}`, 'error');
          } else if (status.lastBackup && status.lastBackup.note === 'no changes') {
            showToast('Backup: no changes to commit', 'info');
          } else if (status.lastBackup && status.lastBackup.success) {
            const hash = status.lastBackup.commitHash ? status.lastBackup.commitHash.substring(0, 7) : '';
            showToast(`Backup completed! ${hash}`, 'success');
          }
          await this.init(this.container, this.serverName);
          return;
        }
        // Still running, update progress indicator
        if (indicator && status.progress) {
          const stepLabels = { init: 'Initializing...', add: 'Staging changes...', status: 'Checking changes...', commit: 'Committing...', gc: 'Optimizing pack...', push: 'Pushing to GitHub...' };
          indicator.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> ${stepLabels[status.progress.step] || 'Running...'}`;
        }
      } catch {
        // Ignore poll errors
      }
    }
    // Timeout after 2 minutes
    showToast('Backup is taking longer than expected... still running', 'info');
    btn.disabled = false;
    btn.style.display = '';
    if (indicator) indicator.style.display = 'none';
  },

  cleanup() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }
};
window.BackupConfig = BackupConfig;
