const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const backupService = require('../services/backup');

router.use(requireAuth);

// Get global backup status
router.get('/status', (req, res) => {
  try {
    const status = backupService.getBackupStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get backup history
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = backupService.getBackupHistory(limit);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get global backup config
router.get('/config', (req, res) => {
  try {
    const config = backupService.readGlobalConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update global backup config
router.put('/config', (req, res) => {
  try {
    backupService.writeGlobalConfig(req.body);
    backupService.initGitBackupScheduler();
    res.json({ message: 'Backup configuration updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger manual backup (runs async, returns immediately)
router.post('/now', async (req, res) => {
  try {
    const type = req.body.type || 'manual';
    // Don't await — launch in background, return immediately
    backupService.performBackup(type).then(result => {
      console.log(`[Backup] Manual backup completed: ${result.success ? (result.commitHash ? result.commitHash.substring(0, 7) : result.note) : `FAILED — ${result.error}`}`);
    }).catch(err => {
      console.error('[Backup] Manual backup error:', err.message);
    });
    res.json({ started: true, message: 'Backup started. Check /api/backups/status for progress.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-server: get backup config (exclude patterns)
router.get('/:server/config', (req, res) => {
  try {
    const config = backupService.readBackupConfig(req.params.server);
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-server: update backup config (exclude patterns)
router.put('/:server/config', (req, res) => {
  try {
    backupService.writeBackupConfig(req.params.server, req.body);
    res.json({ message: 'Server backup config updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-server: trigger manual backup (now triggers global backup, runs in background)
router.post('/:server/now', async (req, res) => {
  try {
    const type = req.body.type || 'manual';
    backupService.performBackup(type).then(result => {
      console.log(`[Backup] Manual backup completed: ${result.success ? (result.commitHash ? result.commitHash.substring(0, 7) : result.note) : `FAILED — ${result.error}`}`);
    }).catch(err => {
      console.error('[Backup] Manual backup error:', err.message);
    });
    res.json({ started: true, message: 'Backup started. Check /api/backups/status for progress.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-server: history (delegated to global)
router.get('/:server/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = backupService.getBackupHistory(limit);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
