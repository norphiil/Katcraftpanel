const Terminal = {
  init(container, serverName) {
    this.container = container;
    this.serverName = serverName;
    this.wsRcon = null;
    this.wsLogs = null;
    
    this.container.innerHTML = `
      <div class="card terminal-wrapper">
        <div class="terminal">
          <div class="terminal-header">
            <div class="terminal-title">
              <div class="terminal-dot" id="term-status"></div>
              <span>${serverName} &mdash; Server Console</span>
            </div>
            <button class="btn btn-ghost btn-icon" onclick="Terminal.clear()" title="Clear console">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
            </button>
          </div>
          <div class="terminal-output" id="term-output"></div>
          <div class="terminal-input-area">
            <div class="terminal-prompt">&gt;</div>
            <input type="text" id="term-input" class="terminal-input" placeholder="Type a command... (e.g. time set day)" autocomplete="off">
          </div>
        </div>
        <div class="form-help mt-8 text-right">Press <kbd>&uarr;</kbd> for command history</div>
      </div>
    `;

    this.output = document.getElementById('term-output');
    this.input = document.getElementById('term-input');
    this.statusDot = document.getElementById('term-status');
    
    this.history = [];
    this.historyIndex = -1;

    this.setupWebSockets();
    this.setupInput();
  },

  setupWebSockets() {
    // RCON WS
    this.wsRcon = new WS(`/api/ws/rcon/${this.serverName}`, 
      (msg) => {
        if (msg.type === 'response' && msg.data) {
          this.appendLog(msg.data, 'rcon');
        } else if (msg.type === 'error') {
          this.appendLog(`[RCON Error] ${msg.data}`, 'error');
        }
      },
      () => {
        if (this.statusDot) this.statusDot.style.background = 'var(--text-muted)';
      }
    );
    this.wsRcon.connect();

    // Logs WS
    this.wsLogs = new WS(`/api/ws/logs/${this.serverName}`,
      (msg) => {
        if (msg.type === 'log') {
          this.appendLog(msg.data, 'log');
        } else if (msg.type === 'error') {
          this.appendLog(`[Log Error] ${msg.data}`, 'error');
        }
      }
    );
    this.wsLogs.connect();
    
    // Auto-scroll logic observer
    this.observer = new MutationObserver(() => {
      if (this.autoScroll) {
        this.output.scrollTop = this.output.scrollHeight;
      }
    });
    this.observer.observe(this.output, { childList: true });
    
    this.output.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.output;
      this.autoScroll = scrollHeight - scrollTop - clientHeight < 50;
    });
    this.autoScroll = true;
  },

  setupInput() {
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = this.input.value.trim();
        if (!cmd) return;
        
        this.history.push(cmd);
        this.historyIndex = this.history.length;
        
        this.appendLog(`> ${cmd}`, 'cmd');
        this.wsRcon.send({ type: 'command', command: cmd });
        this.input.value = '';
      } 
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.historyIndex > 0) {
          this.historyIndex--;
          this.input.value = this.history[this.historyIndex];
        }
      }
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          this.input.value = this.history[this.historyIndex];
        } else {
          this.historyIndex = this.history.length;
          this.input.value = '';
        }
      }
    });
  },

  appendLog(text, type) {
    if (!this.output || !text.trim()) return;
    
    const div = document.createElement('div');
    
    // Parse ANSI codes roughly to HTML for Minecraft logs
    let formatted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\\x1b\[[0-9;]*m/g, '') // strip ANSI temporary
      .replace(/\x1b\[[0-9;]*m/g, ''); 

    if (type === 'cmd') {
      formatted = `<span class="text-secondary">${formatted}</span>`;
    } else if (type === 'rcon') {
      formatted = `<span class="text-info">${formatted}</span>`;
    } else if (formatted.includes('WARN')) {
      formatted = `<span class="log-warn">${formatted}</span>`;
    } else if (formatted.includes('ERROR') || formatted.includes('Exception') || type === 'error') {
      formatted = `<span class="log-error">${formatted}</span>`;
    }

    div.innerHTML = formatted;
    this.output.appendChild(div);
    
    // Keep max 1000 lines
    while (this.output.children.length > 1000) {
      this.output.removeChild(this.output.firstChild);
    }
  },

  clear() {
    if (this.output) this.output.innerHTML = '';
  },

  cleanup() {
    if (this.wsRcon) this.wsRcon.disconnect();
    if (this.wsLogs) this.wsLogs.disconnect();
    if (this.observer) this.observer.disconnect();
  }
};
window.Terminal = Terminal;
