const App = {
  activeScreen: null,
  activeComponent: null,

  async init() {
    document.getElementById('app').style.display = 'block';
    await this.checkAuth();
    
    // Bind global styles for utility classes
    const style = document.createElement('style');
    style.innerHTML = `
      .capitalize { text-transform: capitalize; }
      .ml-8 { margin-left: 8px; }
      .pt-10 { padding-top: 40px; }
      .py-10 { padding-top: 40px; padding-bottom: 40px; }
      .font-medium { font-weight: 500; }
      .font-mono { font-family: var(--font-mono); }
      .text-sm { font-size: 0.85rem; }
      .border-error { border: 1px solid rgba(255, 59, 92, 0.4); }
      .bg-error-dim { background: rgba(255, 59, 92, 0.05); }
      .text-error-hover:hover { color: var(--error); background: rgba(255, 59, 92, 0.1); }
      .text-info { color: var(--info); }
    `;
    document.head.appendChild(style);
  },

  async checkAuth() {
    try {
      await API.authStatus();
      this.showMainApp();
    } catch (err) {
      this.showLogin();
    }
  },

  showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    Login.init();
  },

  showMainApp() {
    document.getElementById('login-screen').style.display = 'none';
    
    const mainApp = document.getElementById('main-app');
    mainApp.style.display = 'flex';
    
    Sidebar.init();
    
    // Check initial hash route
    const hash = window.location.hash.substring(1) || 'dashboard';
    this.navigateFromHash(hash);
    
    // Handle browser back/forward
    window.onpopstate = () => {
      const h = window.location.hash.substring(1) || 'dashboard';
      this.navigateFromHash(h, false);
    };
  },

  navigateFromHash(hash, pushState = true) {
    const parts = hash.split('/');
    const page = parts[0];
    const params = parts.length > 1 ? { name: parts[1] } : {};
    this.navigate(page, params, pushState);
  },

  async navigate(page, params = {}, pushState = true) {
    if (this.activeComponent?.cleanup) {
      this.activeComponent.cleanup();
    }

    const contentArea = document.getElementById('page-content');
    Sidebar.updateActiveNav(page);

    let hashRoute = page;
    if (params.name) hashRoute += '/' + params.name;
    
    if (pushState && window.location.hash !== '#' + hashRoute) {
      window.history.pushState(null, '', '#' + hashRoute);
    }

    try {
      switch (page) {
        case 'dashboard':
          contentArea.innerHTML = await Dashboard.render();
          this.activeComponent = Dashboard;
          await Dashboard.init(contentArea);
          break;
        case 'servers':
          contentArea.innerHTML = await ServerList.render();
          this.activeComponent = ServerList;
          await ServerList.init(contentArea);
          break;
        case 'create':
          contentArea.innerHTML = await ServerCreate.render();
          this.activeComponent = ServerCreate;
          await ServerCreate.init(contentArea);
          break;
        case 'server-detail':
          contentArea.innerHTML = await ServerDetail.render(params);
          this.activeComponent = ServerDetail;
          await ServerDetail.init(contentArea, params);
          break;
        default:
          this.navigate('dashboard');
      }
    } catch (err) {
      console.error(err);
      contentArea.innerHTML = `<div class="p-8 text-error">Navigation error: ${err.message}</div>`;
    }
  }
};

window.onload = () => App.init();
