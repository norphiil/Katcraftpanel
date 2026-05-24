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

  // Base configuration template - Corrected for Velocity 2.7 standards
  const config = {
    'config-version': '2.7',
    // Root level properties (No [general] section)
    bind: '0.0.0.0:25565',
    motd: '<#09add3>A Velocity Server',
    'show-max-players': 500,
    'online-mode': true,
    'force-key-authentication': true,
    'prevent-client-proxy-connections': false,
    'player-info-forwarding-mode': 'modern',
    'announce-forge': false,
    'kick-existing-players': false,
    'ping-passthrough': 'DISABLED',
    'enable-player-address-logging': true,
    
    // Servers section
    servers: {
      try: []
    },

    // Optional but recommended sections to prevent warnings
    'forced-hosts': {},
    
    advanced: {
      'compression-threshold': 256,
      'compression-level': -1,
      'login-ratelimit': 3000,
      'connection-timeout': 5000,
      'read-timeout': 30000,
      'haproxy-protocol': false,
      'tcp-fast-open': false,
      'bungee-plugin-message-channel': true,
      'show-ping-requests': false,
      'failover-on-unexpected-server-disconnect': true,
      'announce-proxy-commands': true,
      'log-command-executions': false,
      'log-player-connections': true,
      'accepts-transfers': false
    },

    // Query must be at the root, not inside general
    query: {
      enabled: false,
      port: 25565,
      map: 'Velocity',
      'show-plugins': false
    }
  };

  // Add actual servers from the database/list
  serverList.forEach(server => {
    const serverName = server.name;
    const containerName = server.containerName || `mc-${serverName}`;
    // Use the server's configured port (direct property, from labels, or default to 25565)
    const serverPort = server.serverPort || server.labels?.['katcraftpanel.server-port'] || 25565;
    const containerAddress = `${containerName}:${serverPort}`;

    // Add to servers section
    config.servers[serverName] = containerAddress;

    // Add to try list
    config.servers.try.push(serverName);
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