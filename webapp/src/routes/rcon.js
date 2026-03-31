const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sendCommand } = require('../services/rcon');

router.use(requireAuth);

// Send RCON command
router.post('/:server', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Command is required' });
    
    const response = await sendCommand(req.params.server, command);
    res.json({ response });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
