const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const mcApi = require('../services/minecraft-api');

router.use(requireAuth);

// Get Minecraft versions
router.get('/versions', async (req, res) => {
  try {
    const versions = await mcApi.fetchMinecraftVersions();
    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get server types
router.get('/types', (req, res) => {
  res.json(mcApi.getServerTypes());
});

// Get difficulties
router.get('/difficulties', (req, res) => {
  res.json(mcApi.getDifficulties());
});

// Get game modes
router.get('/modes', (req, res) => {
  res.json(mcApi.getGameModes());
});

module.exports = router;
