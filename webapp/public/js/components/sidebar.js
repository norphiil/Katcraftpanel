const Sidebar = {
  async render() {
    const container = document.getElementById('server-quick-list');
    
    try {
      const servers = await API.getServers();
      
      let html = '<div class="quick-list-title">Active Servers</div>';
      
      if (servers.length === 0) {
        html += '<div class="quick-server-item text-muted">No servers</div>';
      } else {
        servers.forEach(s => {
          let statusClass = 'stopped';
          if (s.state === 'running') statusClass = 'running';
          else if (s.state === 'created') statusClass = 'created';
          else if (s.state === 'exited') statusClass = 'exited';

          html += `
            <div class="quick-server-item" onclick="App.navigate('server-detail', { name: '${s.name}' })">
              <div class="server-status-dot ${statusClass}"></div>
              <span>${s.displayName}</span>
            </div>
          `;
        });
      }
      
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = '<div class="quick-server-item text-error">Error loading</div>';
    }
  },

  init() {
    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.onclick = (e) => {
        e.preventDefault();
        const page = link.getAttribute('data-page');
        App.navigate(page);
      };
    });

    // Logout
    document.getElementById('logout-btn').onclick = async () => {
      if (await showConfirm('Logout', 'Are you sure you want to log out?')) {
        try {
          await API.logout();
          App.showLogin();
        } catch (err) {
          showToast('Failed to logout', 'error');
        }
      }
    };
  },
  
  updateActiveNav(page) {
    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.getAttribute('data-page') === page) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Mobile nav close
    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('open');
    }
  }
};
window.Sidebar = Sidebar;
