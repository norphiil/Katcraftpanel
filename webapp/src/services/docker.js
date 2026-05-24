const Dockerode = require('dockerode');
const path = require('path');
const fs = require('fs');

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

const NETWORK_NAME = 'katcraft_net';
const MC_IMAGE = 'itzg/minecraft-server:java21';
const CONTAINER_PREFIX = 'mc-';
const SERVERS_PATH = '/app/servers';
const SERVER_META_FILE = '.katcraft-server.json';

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
 * List all managed MC server containers, enriched with filesystem servers
 */
async function listServers() {
  const containers = await docker.listContainers({
    all: true,
    filters: {
      label: ['katcraftpanel.managed=true']
    }
  });

  const dockerServerMap = new Map();
  containers.forEach(c => {
    const name = c.Names[0].replace('/' + CONTAINER_PREFIX, '');
    dockerServerMap.set(name, {
      name,
      containerName: c.Names[0].replace('/', ''),
      state: c.State,
      status: c.Status,
      image: c.Image,
      ports: c.Ports,
      labels: c.Labels,
      created: c.Created
    });
  });

  // Start with filesystem servers as base
  const fsServers = scanFilesystemServers();
  const fsServerMap = new Map();
  fsServers.forEach(s => fsServerMap.set(s.name, s));

  const merged = [];

  // Add filesystem servers, merging with Docker state
  for (const [name, fsInfo] of fsServerMap) {
    const dockerInfo = dockerServerMap.get(name);
    const base = {
      name,
      displayName: displayName(name),
      containerName: fsInfo.containerName || containerName(name),
      type: fsInfo.type || 'CUSTOM',
      version: fsInfo.version || 'LATEST',
      memory: fsInfo.memory || '2G',
      serverPort: fsInfo.serverPort || fsInfo.labels?.['katcraftpanel.server-port'] || 25565,
      rconPort: fsInfo.rconPort || 25575,
      autostart: fsInfo.autostart || false,
      labels: {
        'katcraftpanel.managed': 'true',
        'katcraftpanel.server': name,
        'katcraftpanel.type': fsInfo.type || 'CUSTOM',
        'katcraftpanel.version': fsInfo.version || 'LATEST',
        'katcraftpanel.rcon-port': String(fsInfo.rconPort || 25575),
        'katcraftpanel.server-port': String(fsInfo.serverPort || 25565),
        'katcraftpanel.autostart': String(fsInfo.autostart || false),
        'katcraftpanel.memory': fsInfo.memory || '2G'
      },
      _source: 'filesystem'
    };
    if (dockerInfo) {
      Object.assign(base, {
        state: dockerInfo.state,
        status: dockerInfo.status,
        image: dockerInfo.image,
        ports: dockerInfo.ports,
        created: dockerInfo.created,
        _source: 'both'
      });
    } else {
      base.state = 'absent';
      base.status = 'No container';
      base.image = MC_IMAGE;
      base.ports = [];
      base.created = null;
    }
    merged.push(base);
  }

  // Add Docker-only servers (container exists but no filesystem directory)
  for (const [name, dockerInfo] of dockerServerMap) {
    if (!fsServerMap.has(name)) {
      merged.push({
        ...dockerInfo,
        displayName: displayName(name),
        serverPort: dockerInfo.labels?.['katcraftpanel.server-port'] || 25565,
        rconPort: dockerInfo.labels?.['katcraftpanel.rcon-port'] || 25575,
        type: dockerInfo.labels?.['katcraftpanel.type'] || 'PAPER',
        version: dockerInfo.labels?.['katcraftpanel.version'] || 'LATEST',
        memory: readMemoryFromJvmArgs(name) || dockerInfo.labels?.['katcraftpanel.memory'] || '4G',
        autostart: dockerInfo.labels?.['katcraftpanel.autostart'] === 'true',
        _source: 'docker'
      });
    }
  }

  return merged;
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
  const serverPort = options.serverPort || 25565;

  // Environment variables
  const env = [
    'EULA=TRUE',
    `TYPE=${options.type || 'PAPER'}`,
    `VERSION=${options.version || 'LATEST'}`,
    // Memory: use MEMORY for simple mode, INIT_MEMORY/MAX_MEMORY for advanced
    ...(options.initMemory || options.maxMemory
      ? [
          ...(options.initMemory ? [`INIT_MEMORY=${options.initMemory}`] : []),
          ...(options.maxMemory ? [`MAX_MEMORY=${options.maxMemory}`] : [])
        ]
      : [`MEMORY=${options.memory || '4G'}`]
    ),
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
    // JVM Options
    ...(options.jvmOpts ? [`JVM_OPTS=${options.jvmOpts}`] : []),
    ...(options.jvmXxOpts ? [`JVM_XX_OPTS=${options.jvmXxOpts}`] : []),
    ...(options.jvmDdOpts ? [`JVM_DD_OPTS=${options.jvmDdOpts}`] : []),
    // Optimization flags
    ...(options.useAikarFlags ? ['USE_AIKAR_FLAGS=true'] : []),
    ...(options.useMeowiceFlags ? ['USE_MEOWICE_FLAGS=true'] : []),
    // JMX
    ...(options.enableJmx ? [
      'ENABLE_JMX=true',
      `JMX_HOST=${options.jmxHost || ''}`,
      `JMX_PORT=${options.jmxPort || '7091'}`
    ] : []),
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
      'katcraftpanel.server-port': String(serverPort),
      'katcraftpanel.autostart': String(options.autostart || false),
      'katcraftpanel.memory': options.memory || '2G',
    },
    Tty: true,
    OpenStdin: true,
    HostConfig: {
      Binds: [
        `${hostServerDataPath}:/data`
      ],
      RestartPolicy: { Name: 'no' }
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [NETWORK_NAME]: {}
      }
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
  // Ensure network exists before starting
  await ensureNetwork();
  
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
  // Ensure network exists before restarting
  await ensureNetwork();
  
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

/**
 * Scan the servers directory and read .katcraft-server.json for each server
 */
function scanFilesystemServers() {
  if (!fs.existsSync(SERVERS_PATH)) return [];

  const entries = fs.readdirSync(SERVERS_PATH, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'));

  return entries.map(e => {
    const meta = readServerMeta(e.name);
    const memory = readMemoryFromJvmArgs(e.name) || '4G';
    return {
      name: e.name,
      displayName: displayName(e.name),
      containerName: containerName(e.name),
      memory,
      ...meta,
      _source: 'filesystem'
    };
  });
}

/**
 * Read server metadata from .katcraft-server.json
 */
function readServerMeta(serverName) {
  const metaPath = path.join(SERVERS_PATH, serverName, SERVER_META_FILE);
  if (!fs.existsSync(metaPath)) return defaultServerMeta(serverName);
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return defaultServerMeta(serverName);
  }
}

/**
 * Write server metadata to .katcraft-server.json
 */
function writeServerMeta(serverName, meta) {
  const serverDir = path.join(SERVERS_PATH, serverName);
  if (!fs.existsSync(serverDir)) fs.mkdirSync(serverDir, { recursive: true });
  const metaPath = path.join(serverDir, SERVER_META_FILE);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

/**
 * Default metadata for a server without an explicit config file
 * Memory is read from user_jvm_args.txt, not stored here.
 */
function defaultServerMeta(serverName) {
  return {
    name: serverName,
    type: 'CUSTOM',
    version: 'LATEST',
    serverPort: 25565,
    rconPort: 25575,
    rconPassword: process.env.DEFAULT_RCON_PASSWORD || 'minecraft',
    autostart: false,
    difficulty: '2',
    mode: '0'
  };
}

const DEFAULT_JVM_ARGS = [
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+UseG1GC',
  '-XX:G1NewSizePercent=20',
  '-XX:G1ReservePercent=20',
  '-XX:MaxGCPauseMillis=50',
  '-XX:G1HeapRegionSize=16M',
  '-XX:+UseZGC',
  '-XX:+ZGenerational'
];

/**
 * Read memory allocated from user_jvm_args.txt (-Xmx value)
 */
function readMemoryFromJvmArgs(serverName) {
  try {
    const filePath = path.join(SERVERS_PATH, serverName, 'user_jvm_args.txt');
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/-Xmx(\d+G)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Write user_jvm_args.txt, updating -Xms/-Xmx or creating with defaults.
 * Xms and Xmx are always kept equal.
 */
function writeUserJvmArgs(serverName, memoryGb) {
  const serverDir = path.join(SERVERS_PATH, serverName);
  if (!fs.existsSync(serverDir)) fs.mkdirSync(serverDir, { recursive: true });
  const filePath = path.join(serverDir, 'user_jvm_args.txt');

  const mem = memoryGb.replace(/[^0-9]/g, '');
  const xmsLine = `-Xms${mem}G`;
  const xmxLine = `-Xmx${mem}G`;

  let lines;
  if (fs.existsSync(filePath)) {
    lines = fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
  } else {
    lines = [];
  }

  // Update or add Xms/Xmx (always same value)
  const xmsIdx = lines.findIndex(l => l.startsWith('-Xms'));
  const xmxIdx = lines.findIndex(l => l.startsWith('-Xmx'));

  if (xmsIdx >= 0) lines[xmsIdx] = xmsLine;
  else lines.unshift(xmsLine);

  if (xmxIdx >= 0) lines[xmxIdx] = xmxLine;
  else {
    // Insert after Xms
    const insertAt = lines.findIndex(l => l.startsWith('-Xms'));
    lines.splice(insertAt + 1, 0, xmxLine);
  }

  // Ensure default GC args are present if missing
  for (const arg of DEFAULT_JVM_ARGS) {
    const base = arg.split('=')[0];
    if (!lines.some(l => l.startsWith(base))) {
      lines.push(arg);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
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
  scanFilesystemServers,
  readServerMeta,
  writeServerMeta,
  defaultServerMeta,
  readMemoryFromJvmArgs,
  writeUserJvmArgs,
  NETWORK_NAME,
  CONTAINER_PREFIX
};
