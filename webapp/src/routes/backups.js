const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const backupService = require('../services/backup');

router.use(requireAuth);

// Get backup config for a server
router.get('/:server/config', (req, res) => {
  try {
    const config = backupService.readBackupConfig(req.params.server);
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update backup config
router.put('/:server/config', (req, res) => {
  try {
    backupService.writeBackupConfig(req.params.server, req.body);
    backupService.scheduleBackups(req.params.server);
    res.json({ message: 'Backup config updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger manual backup
router.post('/:server/now', async (req, res) => {
  try {
    const type = req.body.type || 'manual';
    const result = await backupService.performBackup(req.params.server, type);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List backups
router.get('/:server/history', async (req, res) => {
  try {
    const backups = await backupService.listBackups(req.params.server);
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
