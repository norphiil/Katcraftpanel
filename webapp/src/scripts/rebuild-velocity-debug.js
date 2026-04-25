const fs = require('fs');
const path = require('path');
const TOML = require('@iarna/toml');

const VELOCITY_DATA_PATH = '/app/velocity_data';

const dockerService = require('../services/docker');

dockerService.listServers().then(servers => {
  console.log('[Velocity] Rebuilding velocity.toml from scratch...');

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

  servers.forEach(server => {
    const serverName = server.name;
    const containerName = server.containerName || 'mc-' + server.name;
    const serverPort = server.labels?.['katcraftpanel.server-port'] || 25565;
    const containerAddress = containerName + ':' + serverPort;

    console.log('Server:', serverName);
    console.log('  Container:', containerName);
    console.log('  Port from labels:', server.labels?.['katcraftpanel.server-port']);
    console.log('  Extracted port:', serverPort);
    console.log('  Container address:', containerAddress);

    config.servers[serverName] = containerAddress;
    config.servers_try.push(serverName);
  });

  const content = TOML.stringify(config);
  console.log('\n=== TOML Output ===');
  console.log(content);
  console.log('=== End ===');

  const filePath = path.join(VELOCITY_DATA_PATH, 'velocity.toml');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('\nWrote to:', filePath);
});
