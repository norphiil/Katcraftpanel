const Login = {
  render() {
    return ``; // Empty because Login is rendered statically in index.html to be shown/hidden
  },

  init() {
    const form = document.getElementById('login-form');
    const errorMsg = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    form.onsubmit = async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';
      btn.innerHTML = '<div class="spinner"></div>';
      btn.disabled = true;

      try {
        const username = form.username.value;
        const password = form.password.value;
        
        await API.login(username, password);
        await App.checkAuth();
      } catch (err) {
        errorMsg.textContent = err.message || 'Login failed';
        errorMsg.style.display = 'block';
        btn.innerHTML = '<span>Sign In</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
        btn.disabled = false;
      }
    };
  }
};
window.Login = Login;
