const { Rcon } = require('rcon-client');
const dockerService = require('./docker');

// Active RCON connections
const rconConnections = new Map();

/**
 * Get or create RCON connection to a server
 */
async function getRconConnection(serverName) {
  if (rconConnections.has(serverName)) {
    const conn = rconConnections.get(serverName);
    if (conn.authenticated) return conn;
    rconConnections.delete(serverName);
  }

  const server = await dockerService.getServer(serverName);
  if (!server || server.state.Status !== 'running') {
    throw new Error(`Server ${serverName} is not running`);
  }

  const rconPort = parseInt(server.config.Labels['katcraftpanel.rcon-port'] || '25575');
  const rconPassword = server.config.Labels['katcraftpanel.rcon-password'] || process.env.DEFAULT_RCON_PASSWORD || 'minecraft';
  const containerHost = dockerService.containerName(serverName);

  const rcon = await Rcon.connect({
    host: containerHost,
    port: rconPort,
    password: rconPassword,
    timeout: 5000
  });

  rconConnections.set(serverName, rcon);

  rcon.on('end', () => {
    rconConnections.delete(serverName);
  });

  return rcon;
}

/**
 * Send a command to server via RCON
 */
async function sendCommand(serverName, command) {
  const rcon = await getRconConnection(serverName);
  const response = await rcon.send(command);
  return response;
}

/**
 * Handle WebSocket RCON session
 */
function handleRconSession(ws, serverName) {
  let rcon = null;

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'command') {
        if (!rcon) {
          rcon = await getRconConnection(serverName);
        }
        const response = await rcon.send(msg.command);
        ws.send(JSON.stringify({ type: 'response', data: response }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', data: err.message }));
    }
  });

  ws.on('close', () => {
    // Don't close the shared RCON connection, just clean up WS
  });

  ws.send(JSON.stringify({ type: 'connected', data: `RCON session opened for ${serverName}` }));
}

/**
 * Close all RCON connections (cleanup)
 */
function closeAllConnections() {
  for (const [name, conn] of rconConnections) {
    try { conn.end(); } catch {}
  }
  rconConnections.clear();
}

module.exports = {
  getRconConnection,
  sendCommand,
  handleRconSession,
  closeAllConnections
};
