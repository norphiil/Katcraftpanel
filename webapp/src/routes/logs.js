const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const dockerService = require('../services/docker');

router.use(requireAuth);

// Get recent logs for a server
router.get('/:server', async (req, res) => {
  try {
    const tail = parseInt(req.query.tail) || 200;
    const logs = await dockerService.getServerLogs(req.params.server, tail);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
