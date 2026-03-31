const https = require('https');

// Cache for MC versions (refreshed every hour)
let versionCache = null;
let lastFetch = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Available server types for itzg/minecraft-server
 */
const SERVER_TYPES = [
  { id: 'VANILLA', name: 'Vanilla', description: 'Official Minecraft server' },
  { id: 'PAPER', name: 'Paper', description: 'High-performance Spigot fork' },
  { id: 'SPIGOT', name: 'Spigot', description: 'Modified Bukkit server' },
  { id: 'BUKKIT', name: 'Bukkit', description: 'Plugin-compatible server' },
  { id: 'PURPUR', name: 'Purpur', description: 'Paper fork with extra features' },
  { id: 'FABRIC', name: 'Fabric', description: 'Lightweight modding framework' },
  { id: 'FORGE', name: 'Forge', description: 'Popular modding platform' },
  { id: 'NEOFORGE', name: 'NeoForge', description: 'Modern Forge continuation' },
  { id: 'QUILT', name: 'Quilt', description: 'Fabric-compatible mod loader' },
  { id: 'MOHIST', name: 'Mohist', description: 'Forge + Bukkit hybrid' },
  { id: 'ARCLIGHT', name: 'Arclight', description: 'Forge + Bukkit hybrid' },
  { id: 'MAGMA', name: 'Magma', description: 'Forge + Spigot hybrid' },
  { id: 'PUFFERFISH', name: 'Pufferfish', description: 'Paper fork, better performance' },
  { id: 'FOLIA', name: 'Folia', description: 'Paper fork, regionized multithreading' },
];

/**
 * Fetch Minecraft versions from Mojang API
 */
async function fetchMinecraftVersions() {
  const now = Date.now();
  if (versionCache && (now - lastFetch) < CACHE_TTL) {
    return versionCache;
  }

  return new Promise((resolve, reject) => {
    https.get('https://launchermeta.mojang.com/mc/game/version_manifest.json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const manifest = JSON.parse(data);
          const versions = manifest.versions
            .filter(v => v.type === 'release')
            .map(v => ({
              id: v.id,
              type: v.type,
              releaseTime: v.releaseTime
            }));

          versionCache = {
            latest: manifest.latest,
            versions
          };
          lastFetch = now;
          resolve(versionCache);
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Get available server types
 */
function getServerTypes() {
  return SERVER_TYPES;
}

/**
 * Get difficulty options
 */
function getDifficulties() {
  return [
    { id: '0', name: 'Peaceful' },
    { id: '1', name: 'Easy' },
    { id: '2', name: 'Normal' },
    { id: '3', name: 'Hard' },
  ];
}

/**
 * Get game mode options
 */
function getGameModes() {
  return [
    { id: '0', name: 'Survival' },
    { id: '1', name: 'Creative' },
    { id: '2', name: 'Adventure' },
    { id: '3', name: 'Spectator' },
  ];
}

module.exports = {
  fetchMinecraftVersions,
  getServerTypes,
  getDifficulties,
  getGameModes
};
