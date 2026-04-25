const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const url = require('url');

// Routes
const authRoutes = require('./src/routes/auth');
const serverRoutes = require('./src/routes/servers');
const fileRoutes = require('./src/routes/files');
const rconRoutes = require('./src/routes/rcon');
const logRoutes = require('./src/routes/logs');
const backupRoutes = require('./src/routes/backups');
const configRoutes = require('./src/routes/config');
const mcApiRoutes = require('./src/routes/mc-api');

// Services
const { initBackupScheduler } = require('./src/services/backup');

// Health sync for configuration consistency
const { initHealthSync } = require('./src/services/health-sync');

const app = express();
const server = http.createServer(app);

// Session config
const sessionParser = session({
  secret: process.env.SESSION_SECRET || 'katcraft-default-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(sessionParser);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/rcon', rconRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/config', configRoutes);
app.use('/api/mc', mcApiRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  sessionParser(request, {}, () => {
    if (!request.session || !request.session.authenticated) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const pathname = url.parse(request.url).pathname;

    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.pathname = pathname;
      wss.emit('connection', ws, request);
    });
  });
});

// WebSocket connections
const { handleLogStream } = require('./src/services/log-stream');
const { handleRconSession } = require('./src/services/rcon');

wss.on('connection', (ws, request) => {
  const pathname = ws.pathname;

  if (pathname.startsWith('/api/ws/logs/')) {
    const serverName = pathname.replace('/api/ws/logs/', '');
    handleLogStream(ws, serverName);
  } else if (pathname.startsWith('/api/ws/rcon/')) {
    const serverName = pathname.replace('/api/ws/rcon/', '');
    handleRconSession(ws, serverName);
  } else {
    ws.close(4000, 'Unknown WebSocket endpoint');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[KatCraftPanel] Server running on port ${PORT}`);
  
  // Initialize backup scheduler
  initBackupScheduler().catch(err => {
    console.error('[KatCraftPanel] Failed to initialize backup scheduler:', err.message);
  });
});
