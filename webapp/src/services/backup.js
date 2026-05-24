const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const cron = require('node-cron');

const SERVERS_PATH = '/app/servers';
const BACKUP_CONFIG_FILE = '.katcraft-backup.json';
const GLOBAL_CONFIG_FILE = '.katcraft-git-backup.json';
const HISTORY_FILE = '.katcraft-backup-history.json';

let cronJob = null;
let backupRunning = false;
let backupProgress = null;

function globalConfigPath() {
  return path.join(SERVERS_PATH, GLOBAL_CONFIG_FILE);
}

function historyPath() {
  return path.join(SERVERS_PATH, HISTORY_FILE);
}

function defaultGlobalConfig() {
  return {
    enabled: false,
    schedule: process.env.BACKUP_SCHEDULE || '0 0,13 * * *',
    excludePatterns: ['logs/**', 'crash-reports/**']
  };
}

function readGlobalConfig() {
  const p = globalConfigPath();
  if (!fs.existsSync(p)) return defaultGlobalConfig();
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return defaultGlobalConfig();
  }
}

function writeGlobalConfig(config) {
  fs.writeFileSync(globalConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

function readHistory() {
  const p = historyPath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  const p = historyPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const trimmed = entries.slice(-200);
  fs.writeFileSync(p, JSON.stringify(trimmed, null, 2), 'utf8');
}

function addHistoryEntry(entry) {
  const history = readHistory();
  history.push(entry);
  writeHistory(history);
}

function defaultBackupConfig() {
  return { excludePatterns: [] };
}

function readBackupConfig(serverName) {
  const configPath = path.join(SERVERS_PATH, serverName, BACKUP_CONFIG_FILE);
  if (!fs.existsSync(configPath)) return defaultBackupConfig();
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return defaultBackupConfig();
  }
}

function writeBackupConfig(serverName, config) {
  const configPath = path.join(SERVERS_PATH, serverName, BACKUP_CONFIG_FILE);
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Run a git command asynchronously, returns stdout trimmed
 */
function gitExec(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    exec(`git ${args}`, {
      cwd: SERVERS_PATH,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024
    }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr.trim() || err.message || 'Unknown git error';
        console.error(`[Backup] git ${args.split(' ')[0]} failed: ${msg}`);
        reject(new Error(msg));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Run a git command synchronously (only for quick operations like config)
 */
function gitExecSync(args) {
  const { execSync } = require('child_process');
  try {
    return execSync(`git ${args}`, {
      cwd: SERVERS_PATH,
      encoding: 'utf8',
      timeout: 30000,
      stdio: 'pipe'
    }).trim();
  } catch {
    return '';
  }
}

async function ensureGitRepo() {
  const gitDir = path.join(SERVERS_PATH, '.git');
  if (!fs.existsSync(gitDir)) {
    console.log('[Backup] Initializing git repository in', SERVERS_PATH);
    gitExecSync('init');
  }

  const remoteUrl = process.env.GIT_BACKUP_REPO;
  if (remoteUrl) {
    const token = process.env.GIT_BACKUP_TOKEN;
    const finalUrl = token ? remoteUrl.replace('https://', `https://${token}@`) : remoteUrl;
    const remotes = gitExecSync('remote');
    if (remotes.includes('origin')) {
      gitExecSync(`remote set-url origin ${finalUrl}`);
    } else {
      gitExecSync(`remote add origin ${finalUrl}`);
    }
  }

  const gitignore = path.join(SERVERS_PATH, '.gitignore');
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(gitignore, [
      '.katcraft-backup-history.json',
      '.katcraft-git-backup.json'
    ].join('\n') + '\n', 'utf8');
  }

  // Git config
  gitExecSync(`config user.name "${process.env.BACKUP_GIT_USER || 'KatCraftPanel'}"`);
  gitExecSync(`config user.email "${process.env.BACKUP_GIT_EMAIL || 'katcraft@localhost'}"`);

  // Large push settings (for HTTPS)
  const isHttps = remoteUrl && remoteUrl.startsWith('https://');
  if (isHttps) {
    gitExecSync('config http.postBuffer 524288000');
    gitExecSync('config http.lowSpeedLimit 0');
    gitExecSync('config http.lowSpeedTime 999999');
  }
  // Compression settings to reduce pack size
  gitExecSync('config pack.windowMemory 256m');
  gitExecSync('config pack.packSizeLimit 512m');
  gitExecSync('config pack.deltaCacheSize 256m');

  const branch = process.env.GIT_BACKUP_BRANCH || 'main';
  gitExecSync(`checkout -B ${branch}`);
}

function getServerNames() {
  if (!fs.existsSync(SERVERS_PATH)) return [];
  return fs.readdirSync(SERVERS_PATH, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);
}

async function performBackup(type = 'manual') {
  if (backupRunning) {
    return { success: false, error: 'A backup is already in progress' };
  }

  const config = readGlobalConfig();
  if (!config.enabled && type !== 'manual') {
    console.log('[Backup] Skipping disabled backup');
    return { success: false, error: 'Backups are disabled' };
  }

  const serverNames = getServerNames();
  if (serverNames.length === 0) {
    console.log('[Backup] No servers to backup');
    return { success: false, error: 'No servers found' };
  }

  backupRunning = true;
  backupProgress = { step: 'init', serverNames };

  try {
    console.log(`[Backup] Starting ${type} backup for: ${serverNames.join(', ')}`);
    await ensureGitRepo();

    backupProgress = { step: 'add' };
    await gitExec('add -A');

    const now = new Date();
    const timestamp = now.toISOString();
    const dateStr = now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    const serverList = serverNames.join(', ');

    let message;
    if (type === 'manual') {
      message = `Backup manuel — Serveurs: ${serverList} — ${dateStr}`;
    } else {
      message = `Backup automatique (${type}) — Serveurs: ${serverList} — ${dateStr}`;
    }

    backupProgress = { step: 'status' };
    const statusOutput = await gitExec('status --porcelain');
    if (!statusOutput) {
      console.log('[Backup] No changes to commit');
      addHistoryEntry({
        timestamp, type, success: true,
        note: 'no changes', servers: serverNames
      });
      backupRunning = false;
      backupProgress = null;
      return { success: true, note: 'no changes', timestamp };
    }

    backupProgress = { step: 'commit' };
    console.log('[Backup] Changes detected, committing...');
    await gitExec(`commit -m "${message.replace(/"/g, '\\"')}"`);

    const commitHash = await gitExec('rev-parse HEAD');
    console.log(`[Backup] Committed: ${commitHash.substring(0, 7)}`);

    // Push
    const remoteUrl = process.env.GIT_BACKUP_REPO;
    if (remoteUrl) {
      backupProgress = { step: 'gc' };
      console.log('[Backup] Optimizing pack before push...');
      await gitExec('gc --auto --quiet', 60000).catch(() => {});

      backupProgress = { step: 'push' };
      console.log('[Backup] Pushing to remote...');
      const branch = process.env.GIT_BACKUP_BRANCH || 'main';
      await gitExec(`push -u origin ${branch}`, 600000);
      console.log(`[Backup] Pushed — ${commitHash.substring(0, 7)}`);
    } else {
      console.log(`[Backup] Committed locally — ${commitHash.substring(0, 7)} (no remote)`);
    }

    addHistoryEntry({
      timestamp, type, success: true,
      commitHash, message, servers: serverNames
    });

    backupRunning = false;
    backupProgress = null;
    return { success: true, timestamp, commitHash, servers: serverNames };
  } catch (err) {
    console.error('[Backup] Backup failed:', err.message);
    addHistoryEntry({
      timestamp: new Date().toISOString(), type,
      success: false, error: err.message, servers: serverNames
    });
    backupRunning = false;
    backupProgress = null;
    return { success: false, error: err.message };
  }
}

function computeNextCronTime(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const now = new Date();
  const candidates = [];

  const hours = parts[1].split(',');
  for (const hourStr of hours) {
    const minute = parseInt(parts[0]);
    const hour = parseInt(hourStr);
    if (isNaN(minute) || isNaN(hour)) continue;

    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setMinutes(minute);
    next.setHours(hour);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    candidates.push(next);
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a - b);
  return candidates[0].toISOString();
}

function getBackupStatus() {
  const history = readHistory();
  const lastBackup = history.length > 0 ? history[history.length - 1] : null;
  const lastSuccess = history.filter(h => h.success).slice(-1)[0] || null;

  let lastCommit = null;
  try {
    if (fs.existsSync(path.join(SERVERS_PATH, '.git'))) {
      lastCommit = gitExecSync('log -1 --format="%H %s %ai"');
    }
  } catch {
    // Git repo might not be initialized yet
  }

  let nextBackup = null;
  try {
    const config = readGlobalConfig();
    if (config.enabled && config.schedule && process.env.GIT_BACKUP_REPO) {
      nextBackup = computeNextCronTime(config.schedule);
    }
  } catch {
    // Invalid schedule
  }

  return {
    lastBackup,
    lastSuccess,
    lastCommit,
    nextBackup,
    running: backupRunning,
    progress: backupProgress,
    config: readGlobalConfig()
  };
}

function getBackupHistory(limit = 50) {
  const history = readHistory();
  return history.slice(-limit).reverse();
}

function initGitBackupScheduler() {
  if (!fs.existsSync(SERVERS_PATH)) {
    fs.mkdirSync(SERVERS_PATH, { recursive: true });
  }

  ensureGitRepo();

  const config = readGlobalConfig();

  if (!config.enabled) {
    console.log('[Backup] Git backups are disabled');
    return;
  }

  const repoUrl = process.env.GIT_BACKUP_REPO;
  if (!repoUrl) {
    console.warn('[Backup] GIT_BACKUP_REPO not configured, scheduler disabled');
    return;
  }

  if (cronJob) cronJob.stop();

  const schedule = config.schedule || '0 0,13 * * *';
  cronJob = cron.schedule(schedule, () => {
    performBackup('scheduled').catch(err => {
      console.error('[Backup] Scheduled backup failed:', err.message);
    });
  });

  console.log(`[Backup] Git backup scheduler started with schedule: ${schedule}`);
}

function scheduleBackups(serverName) {
  console.log(`[Backup] Global backup covers server: ${serverName}`);
}

function clearBackupSchedule(serverName) {
  // No-op: global cron handles all servers.
}

module.exports = {
  readBackupConfig,
  writeBackupConfig,
  defaultBackupConfig,
  performBackup,
  getBackupStatus,
  getBackupHistory,
  initGitBackupScheduler,
  scheduleBackups,
  clearBackupSchedule,
  readGlobalConfig,
  writeGlobalConfig
};
