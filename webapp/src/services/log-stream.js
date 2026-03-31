const dockerService = require('./docker');

/**
 * Handle WebSocket log streaming for a server
 */
async function handleLogStream(ws, serverName) {
  let logStream = null;

  try {
    logStream = await dockerService.streamServerLogs(
      serverName,
      (data) => {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(JSON.stringify({ type: 'log', data }));
        }
      },
      (err) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'error', data: err.message }));
        }
      }
    );

    ws.send(JSON.stringify({ type: 'connected', data: `Log stream opened for ${serverName}` }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', data: `Failed to open log stream: ${err.message}` }));
  }

  ws.on('close', () => {
    if (logStream) {
      try { logStream.destroy(); } catch {}
    }
  });
}

module.exports = { handleLogStream };
