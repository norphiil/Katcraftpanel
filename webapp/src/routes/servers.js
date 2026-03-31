const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const dockerService = require('../services/docker');
const velocityService = require('../services/velocity');
const autoserverService = require('../services/autoserver');
const { scheduleBackups } = require('../services/backup');

router.use(requireAuth);

// List all servers
router.get('/', async (req, res) => {
  try {
    const containers = await dockerService.listServers();
    const servers = containers.map(c => ({
      ...c,
      displayName: dockerService.displayName(c.name),
    }));
    res.json(servers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get server details
router.get('/:name', async (req, res) => {
  try {
    const server = await dockerService.getServer(req.params.name);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    res.json(server);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get server stats
router.get('/:name/stats', async (req, res) => {
  try {
    const stats = await dockerService.getServerStats(req.params.name);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new server
router.post('/', async (req, res) => {
  try {
    const { name, type, version, memory, initMemory, difficulty, mode,
            motd, maxPlayers, viewDistance, seed, ops,
            enableCommandBlock, allowFlight, pvp, spawnProtection,
            autostart, rconPassword, customEnv,
            startupDelay, shutdownDelay, autoShutdownDelay,
            timezone, whitelist, enableWhitelist } = req.body;

    if (!name) return res.status(400).json({ error: 'Server name is required' });

    const sanitized = dockerService.sanitizeName(name);
    if (!sanitized) return res.status(400).json({ error: 'Invalid server name' });

    // Check if server already exists
    const existing = await dockerService.getServer(sanitized);
    if (existing) return res.status(409).json({ error: 'Server already exists' });

    // Create server data directory
    const serverDir = path.join('/app/servers', sanitized);
    if (!fs.existsSync(serverDir)) {
      fs.mkdirSync(serverDir, { recursive: true });
    }

    // Create Docker container
    const result = await dockerService.createServer(sanitized, {
      type, version, memory, initMemory, difficulty, mode,
      motd, maxPlayers, viewDistance, seed, ops,
      enableCommandBlock, allowFlight, pvp, spawnProtection,
      autostart, rconPassword, customEnv, timezone,
      whitelist, enableWhitelist
    });

    // Add to velocity config
    const containerAddress = `${result.containerName}:${result.serverPort}`;
    velocityService.addServerToVelocity(sanitized, containerAddress);

    // Add to autoserver config
    autoserverService.addServerToAutoServer(sanitized, {
      startupDelay: startupDelay || 30,
      shutdownDelay: shutdownDelay || 10,
      autoShutdownDelay: autoShutdownDelay || 0
    });

    // Initialize backup schedule
    scheduleBackups(sanitized);

    res.status(201).json({
      ...result,
      message: `Server "${dockerService.displayName(sanitized)}" created successfully`
    });
  } catch (err) {
    console.error('[Servers] Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update server configuration
router.put('/:name', async (req, res) => {
  try {
    const serverName = req.params.name;
    const server = await dockerService.getServer(serverName);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    // Update autoserver settings if provided
    if (req.body.autoserver) {
      autoserverService.updateAutoServerSettings(serverName, req.body.autoserver);
    }

    // Update container labels/env requires recreation
    if (req.body.recreate) {
      // Stop and remove old container
      await dockerService.removeServer(serverName);
      // Recreate with new settings
      const result = await dockerService.createServer(serverName, req.body);
      return res.json({ ...result, message: 'Server recreated with new settings' });
    }

    res.json({ message: 'Server updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete server
router.delete('/:name', async (req, res) => {
  try {
    const serverName = req.params.name;
    const deleteData = req.query.deleteData === 'true';

    // Remove Docker container
    await dockerService.removeServer(serverName);

    // Remove from velocity config
    velocityService.removeServerFromVelocity(serverName);

    // Remove from autoserver config
    autoserverService.removeServerFromAutoServer(serverName);

    // Optionally delete server data
    if (deleteData) {
      const serverDir = path.join('/app/servers', serverName);
      if (fs.existsSync(serverDir)) {
        fs.rmSync(serverDir, { recursive: true, force: true });
      }
    }

    res.json({ message: `Server "${dockerService.displayName(serverName)}" deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
router.post('/:name/start', async (req, res) => {
  try {
    await dockerService.startServer(req.params.name);
    res.json({ message: 'Server starting' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop server
router.post('/:name/stop', async (req, res) => {
  try {
    await dockerService.stopServer(req.params.name);
    res.json({ message: 'Server stopping' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restart server
router.post('/:name/restart', async (req, res) => {
  try {
    await dockerService.restartServer(req.params.name);
    res.json({ message: 'Server restarting' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get server logs
router.get('/:name/logs', async (req, res) => {
  try {
    const tail = parseInt(req.query.tail) || 200;
    const logs = await dockerService.getServerLogs(req.params.name, tail);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
