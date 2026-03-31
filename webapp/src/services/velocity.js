const fs = require('fs');
const path = require('path');
const TOML = require('@iarna/toml');

const VELOCITY_DATA_PATH = '/app/velocity_data';

/**
 * Get the path to velocity.toml
 */
function getVelocityTomlPath() {
  return path.join(VELOCITY_DATA_PATH, 'velocity.toml');
}

/**
 * Read and parse velocity.toml
 */
function readVelocityConfig() {
  const filePath = getVelocityTomlPath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return TOML.parse(content);
}

/**
 * Write velocity.toml
 */
function writeVelocityConfig(config) {
  const filePath = getVelocityTomlPath();
  const content = TOML.stringify(config);
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Add a server entry to velocity.toml [servers] section
 * Format: name = "container-name:25565"
 */
function addServerToVelocity(serverName, containerAddress) {
  const config = readVelocityConfig();
  if (!config) {
    console.error('[Velocity] velocity.toml not found');
    return false;
  }

  if (!config.servers) {
    config.servers = {};
  }

  // Add server address
  config.servers[serverName] = containerAddress;

  // Add to try list if not present
  if (!config.servers.try) {
    config.servers.try = [];
  }
  if (Array.isArray(config.servers.try) && !config.servers.try.includes(serverName)) {
    config.servers.try.push(serverName);
  }

  writeVelocityConfig(config);
  return true;
}

/**
 * Remove a server entry from velocity.toml
 */
function removeServerFromVelocity(serverName) {
  const config = readVelocityConfig();
  if (!config || !config.servers) return false;

  delete config.servers[serverName];

  // Remove from try list
  if (Array.isArray(config.servers.try)) {
    config.servers.try = config.servers.try.filter(s => s !== serverName);
  }

  writeVelocityConfig(config);
  return true;
}

/**
 * Get list of servers configured in velocity.toml
 */
function getVelocityServers() {
  const config = readVelocityConfig();
  if (!config || !config.servers) return {};

  const servers = { ...config.servers };
  delete servers.try;
  return servers;
}

module.exports = {
  readVelocityConfig,
  writeVelocityConfig,
  addServerToVelocity,
  removeServerFromVelocity,
  getVelocityServers,
  getVelocityTomlPath,
  VELOCITY_DATA_PATH
};
