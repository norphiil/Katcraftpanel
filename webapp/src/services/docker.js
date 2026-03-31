const Dockerode = require('dockerode');
const path = require('path');

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

const NETWORK_NAME = 'katcraft_net';
const MC_IMAGE = 'itzg/minecraft-server:latest';
const CONTAINER_PREFIX = 'mc-';

/**
 * Sanitize a server name to be safe for Docker container names and config keys.
 * Lowercase, alphanumeric + hyphens only.
 */
function sanitizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Display name: capitalize first letter of each word (separated by hyphens)
 */
function displayName(name) {
  return name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Get container name from server name
 */
function containerName(serverName) {
  return `${CONTAINER_PREFIX}${serverName}`;
}

/**
 * Ensure the katcraft_net network exists
 */
async function ensureNetwork() {
  try {
    const networks = await docker.listNetworks({
      filters: { name: [NETWORK_NAME] }
    });
    
    // Check if our exact network exists
    const existing = networks.find(n => n.Name === NETWORK_NAME);
    if (existing) return existing;

    return await docker.createNetwork({
      Name: NETWORK_NAME,
      Driver: 'bridge',
      CheckDuplicate: true
    });
  } catch (err) {
    console.error('[Docker] Error ensuring network:', err.message);
    throw err;
  }
}

/**
 * List all managed MC server containers
 */
async function listServers() {
  const containers = await docker.listContainers({
    all: true,
    filters: {
      label: ['katcraftpanel.managed=true']
    }
  });

  return containers.map(c => ({
    name: c.Names[0].replace('/' + CONTAINER_PREFIX, ''),
    containerName: c.Names[0].replace('/', ''),
    state: c.State,
    status: c.Status,
    image: c.Image,
    ports: c.Ports,
    labels: c.Labels,
    created: c.Created
  }));
}

/**
 * Get detailed info about a server container
 */
async function getServer(serverName) {
  try {
    const container = docker.getContainer(containerName(serverName));
    const info = await container.inspect();
    return {
      name: serverName,
      displayName: displayName(serverName),
      containerName: containerName(serverName),
      state: info.State,
      config: info.Config,
      hostConfig: info.HostConfig,
      networkSettings: info.NetworkSettings,
      mounts: info.Mounts,
      created: info.Created
    };
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

/**
 * Get container stats (CPU, memory)
 */
async function getServerStats(serverName) {
  try {
    const container = docker.getContainer(containerName(serverName));
    const stats = await container.stats({ stream: false });
    
    // Calculate CPU percentage
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const numCpus = stats.cpu_stats.online_cpus || 1;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

    // Memory
    const memUsage = stats.memory_stats.usage || 0;
    const memLimit = stats.memory_stats.limit || 0;
    const memPercent = memLimit > 0 ? (memUsage / memLimit) * 100 : 0;

    return {
      cpu: Math.round(cpuPercent * 100) / 100,
      memory: {
        usage: memUsage,
        limit: memLimit,
        percent: Math.round(memPercent * 100) / 100
      }
    };
  } catch (err) {
    return { cpu: 0, memory: { usage: 0, limit: 0, percent: 0 } };
  }
}

/**
 * Create a new MC server container
 */
async function createServer(serverName, options = {}) {
  const name = sanitizeName(serverName);
  const cName = containerName(name);

  // Ensure network exists
  await ensureNetwork();

  // Ensure image is available
  try {
    await docker.getImage(MC_IMAGE).inspect();
  } catch {
    console.log(`[Docker] Pulling image ${MC_IMAGE}...`);
    await new Promise((resolve, reject) => {
      docker.pull(MC_IMAGE, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }

  const rconPassword = options.rconPassword || process.env.DEFAULT_RCON_PASSWORD || 'minecraft';
  const rconPort = options.rconPort || 25575;
  const serverPort = 25565;

  // Environment variables
  const env = [
    'EULA=TRUE',
    `TYPE=${options.type || 'PAPER'}`,
    `VERSION=${options.version || 'LATEST'}`,
    `MAX_MEMORY=${options.memory || '2G'}`,
    `INIT_MEMORY=${options.initMemory || '1G'}`,
    'ONLINE_MODE=false',
    `RCON_PASSWORD=${rconPassword}`,
    `RCON_PORT=${rconPort}`,
    'ENABLE_RCON=true',
    `TZ=${options.timezone || 'Europe/Paris'}`,
    `DIFFICULTY=${options.difficulty || '2'}`,
    `MODE=${options.mode || '0'}`,
    `MOTD=${options.motd || `KatCraft - ${displayName(name)}`}`,
    `SERVER_PORT=${serverPort}`,
    'LOG_TIMESTAMP=true',
  ];

  if (options.enableCommandBlock) env.push('ENABLE_COMMAND_BLOCK=true');
  if (options.allowFlight) env.push('ALLOW_FLIGHT=true');
  if (options.maxPlayers) env.push(`MAX_PLAYERS=${options.maxPlayers}`);
  if (options.viewDistance) env.push(`VIEW_DISTANCE=${options.viewDistance}`);
  if (options.seed) env.push(`SEED=${options.seed}`);
  if (options.ops) env.push(`OPS=${options.ops}`);
  if (options.whitelist) env.push(`WHITELIST=${options.whitelist}`);
  if (options.enableWhitelist) env.push('ENABLE_WHITELIST=true');
  if (options.pvp !== undefined) env.push(`PVP=${options.pvp}`);
  if (options.spawnProtection !== undefined) env.push(`SPAWN_PROTECTION=${options.spawnProtection}`);

  // Add custom env vars
  if (options.customEnv && Array.isArray(options.customEnv)) {
    options.customEnv.forEach(e => {
      if (e.key && e.value) env.push(`${e.key}=${e.value}`);
    });
  }

  const serversPath = path.resolve('/app/servers', name);

  let hostServersPath = path.resolve(process.cwd(), 'servers');
  try {
    const os = require('os');
    const myContainerId = os.hostname();
    const myContainer = docker.getContainer(myContainerId);
    const inspect = await myContainer.inspect();
    const serverMount = inspect.Mounts.find(m => m.Destination === '/app/servers');
    if (serverMount) {
      hostServersPath = serverMount.Source;
    }
  } catch (err) {
    console.error('[Docker] Failed to dynamically find host servers path:', err.message);
  }
  const hostServerDataPath = path.resolve(hostServersPath, name);

  const containerConfig = {
    Image: MC_IMAGE,
    name: cName,
    Env: env,
    Labels: {
      'katcraftpanel.managed': 'true',
      'katcraftpanel.server': name,
      'katcraftpanel.type': options.type || 'PAPER',
      'katcraftpanel.version': options.version || 'LATEST',
      'katcraftpanel.rcon-port': String(rconPort),
      'katcraftpanel.rcon-password': rconPassword,
      'katcraftpanel.autostart': String(options.autostart || false),
      'katcraftpanel.memory': options.memory || '2G',
    },
    Tty: true,
    OpenStdin: true,
    HostConfig: {
      Binds: [
        `${hostServerDataPath}:/data`
      ],
      RestartPolicy: { Name: 'no' },
      NetworkMode: NETWORK_NAME
    }
  };

  // Create and return (don't start - AutoServer handles that)
  const container = await docker.createContainer(containerConfig);

  return {
    name,
    displayName: displayName(name),
    containerName: cName,
    containerId: container.id,
    rconPort,
    rconPassword,
    serverPort
  };
}

/**
 * Start a server container
 */
async function startServer(serverName) {
  const container = docker.getContainer(containerName(serverName));
  await container.start();
}

/**
 * Stop a server container
 */
async function stopServer(serverName) {
  const container = docker.getContainer(containerName(serverName));
  await container.stop({ t: 15 });
}

/**
 * Restart a server container
 */
async function restartServer(serverName) {
  const container = docker.getContainer(containerName(serverName));
  await container.restart({ t: 15 });
}

/**
 * Remove a server container
 */
async function removeServer(serverName) {
  try {
    const container = docker.getContainer(containerName(serverName));
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop({ t: 10 });
    }
    await container.remove({ force: true });
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
}

/**
 * Get container logs
 */
async function getServerLogs(serverName, tail = 200) {
  const container = docker.getContainer(containerName(serverName));
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail,
    timestamps: true
  });
  
  // Docker logs contain header bytes, strip them
  return stripDockerHeaders(logs);
}

/**
 * Stream logs from container
 */
async function streamServerLogs(serverName, onData, onError) {
  const container = docker.getContainer(containerName(serverName));
  const logStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 100,
    timestamps: true
  });

  logStream.on('data', (chunk) => {
    const lines = stripDockerHeaders(chunk);
    if (lines) onData(lines);
  });

  logStream.on('error', onError);
  logStream.on('end', () => onData('[Stream ended]\n'));

  return logStream;
}

function stripDockerHeaders(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    buffer = Buffer.from(buffer);
  }
  
  const lines = [];
  let offset = 0;
  
  while (offset < buffer.length) {
    // Docker stream header: 8 bytes (type[1] + padding[3] + size[4])
    if (offset + 8 > buffer.length) {
      // Remaining data without header
      lines.push(buffer.slice(offset).toString('utf8'));
      break;
    }
    
    const size = buffer.readUInt32BE(offset + 4);
    if (size === 0 || offset + 8 + size > buffer.length) {
      lines.push(buffer.slice(offset).toString('utf8'));
      break;
    }
    
    lines.push(buffer.slice(offset + 8, offset + 8 + size).toString('utf8'));
    offset += 8 + size;
  }
  
  return lines.join('');
}

module.exports = {
  docker,
  sanitizeName,
  displayName,
  containerName,
  listServers,
  getServer,
  getServerStats,
  createServer,
  startServer,
  stopServer,
  restartServer,
  removeServer,
  getServerLogs,
  streamServerLogs,
  ensureNetwork,
  NETWORK_NAME,
  CONTAINER_PREFIX
};
