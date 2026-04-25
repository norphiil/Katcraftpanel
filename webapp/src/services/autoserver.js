const fs = require('fs');
const path = require('path');
const TOML = require('@iarna/toml');

const VELOCITY_DATA_PATH = '/app/velocity_data';

/**
 * Get the path to autoserver config.toml
 * AutoServer stores it in plugins/autoserver/config.toml within the velocity data
 */
function getAutoServerConfigPath() {
  return path.join(VELOCITY_DATA_PATH, 'plugins', 'autoserver', 'config.toml');
}

/**
 * Read and parse autoserver config.toml
 */
function readAutoServerConfig() {
  const filePath = getAutoServerConfigPath();
  if (!fs.existsSync(filePath)) {
    // Return default config if file doesn't exist yet
    return {
      checkForUpdates: true,
      messages: {
        prefix: '<gray>[<green>KatCraft</green>]</gray> ',
        starting: 'Server is starting up, please wait...',
        failed: 'Server failed to start. Please try again later.',
        notify: 'Server is ready! Connecting you now...'
      },
      servers: {}
    };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return TOML.parse(content);
}

/**
 * Write autoserver config.toml
 */
function writeAutoServerConfig(config) {
  const filePath = getAutoServerConfigPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = TOML.stringify(config);
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Rebuild autoserver config.toml from scratch based on actual server list
 * This ensures no stale data remains
 */
function rebuildAutoServerConfig(serverList, defaultOptions = {}) {
  console.log('[AutoServer] Rebuilding config.toml from scratch...');

  const config = {
    checkForUpdates: true,
    messages: {
      prefix: '<gray>[<green>KatCraft</green>]</gray> ',
      starting: 'Server is starting up, please wait...',
      failed: 'Server failed to start. Please try again later.',
      notify: 'Server is ready! Connecting you now...'
    },
    servers: {}
  };

  // Add actual servers from the database/list
  serverList.forEach(server => {
    const serverName = server.name;
    const containerName = `mc-${serverName}`;

    config.servers[serverName] = {
      start: `docker start ${containerName}`,
      stop: `docker stop ${containerName}`,
      workingDirectory: '/data',
      startupDelay: server.startupDelay || defaultOptions.startupDelay || 30,
      shutdownDelay: server.shutdownDelay || defaultOptions.shutdownDelay || 10,
      autoShutdownDelay: server.autoShutdownDelay || defaultOptions.autoShutdownDelay || 0,
      remote: false
    };
  });

  writeAutoServerConfig(config);
  console.log(`[AutoServer] config.toml rebuilt with ${serverList.length} servers`);

  return true;
}

/**
 * Add a server to AutoServer config
 * Uses docker start/stop commands since MC servers run as Docker containers
 */
function addServerToAutoServer(serverName, options = {}) {
  const config = readAutoServerConfig();

  if (!config.servers) {
    config.servers = {};
  }

  const containerName = `mc-${serverName}`;

  config.servers[serverName] = {
    start: `docker start ${containerName}`,
    stop: `docker stop ${containerName}`,
    workingDirectory: '/data',
    startupDelay: options.startupDelay || 30,
    shutdownDelay: options.shutdownDelay || 10,
    autoShutdownDelay: options.autoShutdownDelay || 0,
    remote: false
  };

  writeAutoServerConfig(config);
  return true;
}

/**
 * Remove a server from AutoServer config
 */
function removeServerFromAutoServer(serverName) {
  const config = readAutoServerConfig();
  if (!config.servers) return false;

  delete config.servers[serverName];
  writeAutoServerConfig(config);
  return true;
}

/**
 * Update AutoServer server settings
 */
function updateAutoServerSettings(serverName, settings) {
  const config = readAutoServerConfig();
  if (!config.servers || !config.servers[serverName]) return false;

  Object.assign(config.servers[serverName], settings);
  writeAutoServerConfig(config);
  return true;
}

/**
 * Get AutoServer config for a specific server
 */
function getAutoServerServerConfig(serverName) {
  const config = readAutoServerConfig();
  if (!config.servers) return null;
  return config.servers[serverName] || null;
}

module.exports = {
  readAutoServerConfig,
  writeAutoServerConfig,
  rebuildAutoServerConfig,
  addServerToAutoServer,
  removeServerFromAutoServer,
  updateAutoServerSettings,
  getAutoServerServerConfig,
  getAutoServerConfigPath
};
