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
 * Rebuild velocity.toml from scratch based on actual server list
 * This ensures no stale data (like example.com domains) remains
 */
function rebuildVelocityConfig(serverList) {
  console.log('[Velocity] Rebuilding velocity.toml from scratch...');

  // Base configuration template
  const config = {
    'config-version': '2.7',
    general: {
      bind: '0.0.0.0:25577',
      motd: '<#09add3>A Velocity Server',
      show_max_players: 500,
      online_mode: true,
      force_key_authentication: true,
      prevent_client_proxy_connections: false,
      player_info_forwarding_mode: 'NONE',
      show_motd: true,
      announce_forge: false,
      kick_existing_players: false,
      ping_passthrough: 'DISABLED',
      enable_player_address_logging: true,
      forward_remote_address: false,
      forced_hosts: {},
      query: {
        enabled: false,
        port: 25577,
        version: '1.21.10'
      }
    },
    servers: {},
    servers_try: []
  };

  // Add actual servers from the database/list
  serverList.forEach(server => {
    const serverName = server.name;
    const containerAddress = `${server.containerName || `mc-${serverName}`}:25565`;

    // Add to servers section
    config.servers[serverName] = containerAddress;

    // Add to try list
    config.servers_try.push(serverName);
  });

  // Write the rebuilt configuration
  writeVelocityConfig(config);
  console.log(`[Velocity] velocity.toml rebuilt with ${serverList.length} servers`);

  return true;
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
  rebuildVelocityConfig,
  addServerToVelocity,
  removeServerFromVelocity,
  getVelocityServers,
  getVelocityTomlPath,
  VELOCITY_DATA_PATH
};
