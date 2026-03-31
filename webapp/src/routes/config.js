const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const velocityService = require('../services/velocity');
const autoserverService = require('../services/autoserver');

router.use(requireAuth);

// Get velocity config
router.get('/velocity', (req, res) => {
  try {
    const config = velocityService.readVelocityConfig();
    res.json(config || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get autoserver config
router.get('/autoserver', (req, res) => {
  try {
    const config = autoserverService.readAutoServerConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update autoserver server settings
router.put('/autoserver/:server', (req, res) => {
  try {
    autoserverService.updateAutoServerSettings(req.params.server, req.body);
    res.json({ message: 'AutoServer config updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
