// WebSocket utility
class WS {
  constructor(path, onMessage, onClose) {
    this.path = path;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.ws = null;
    this.reconnectTimeout = null;
    this.shouldReconnect = true;
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}${this.path}`);

    this.ws.onopen = () => {
      console.log(`[WS] Connected to ${this.path}`);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log(`[WS] Disconnected from ${this.path}`);
      if (this.onClose) this.onClose();
      
      if (this.shouldReconnect) {
        this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
      }
    };

    this.ws.onerror = (err) => {
      console.error(`[WS] Error on ${this.path}:`, err);
    };
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
