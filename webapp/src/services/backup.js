const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const cron = require('node-cron');
const { google } = require('googleapis');

const SERVERS_PATH = '/app/servers';
const BACKUP_CONFIG_FILE = '.katcraft-backup.json';

// Active cron jobs
const cronJobs = new Map();

/**
 * Default backup configuration
 */
function defaultBackupConfig() {
  return {
    enabled: false,
    daily: { enabled: false, time: '03:00', retention: 1 },
    weekly: { enabled: false, dayOfWeek: 0, time: '03:00', retention: 4 },
    monthly: { enabled: false, dayOfMonth: 1, time: '03:00', retention: 3 },
    excludePatterns: ['logs/**', 'crash-reports/**', '.katcraft-backup.json']
  };
}

/**
 * Read backup config for a server
 */
function readBackupConfig(serverName) {
  const configPath = path.join(SERVERS_PATH, serverName, BACKUP_CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return defaultBackupConfig();
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return defaultBackupConfig();
  }
}

/**
 * Write backup config for a server
 */
function writeBackupConfig(serverName, config) {
  const configPath = path.join(SERVERS_PATH, serverName, BACKUP_CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Get Google Drive service instance
 */
function getDriveService() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyPath || !fs.existsSync(keyPath)) {
    throw new Error('Google Service Account key file not found');
  }

  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const auth = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/drive.file']
  );

  return google.drive({ version: 'v3', auth });
}

/**
 * Ensure a folder exists in Google Drive
 */
async function ensureDriveFolder(drive, parentId, folderName) {
  // Search for existing folder
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)'
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // Create folder
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id'
  });

  return folder.data.id;
}

/**
 * Create a compressed archive of a server directory
 */
async function createArchive(serverName, excludePatterns = []) {
  const serverPath = path.join(SERVERS_PATH, serverName);
  const archivePath = path.join('/tmp', `${serverName}-${Date.now()}.tar.gz`);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });

    output.on('close', () => resolve(archivePath));
    archive.on('error', reject);

    archive.pipe(output);
    archive.glob('**/*', {
      cwd: serverPath,
      ignore: excludePatterns,
      dot: true
    });
    archive.finalize();
  });
}

/**
 * Upload a file to Google Drive, replacing if exists
 */
async function uploadToDrive(drive, folderId, fileName, filePath) {
  // Check if file already exists
  const existing = await drive.files.list({
    q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
    fields: 'files(id, name)'
  });

  const media = {
    mimeType: 'application/gzip',
    body: fs.createReadStream(filePath)
  };

  if (existing.data.files.length > 0) {
    // Update existing file
    await drive.files.update({
      fileId: existing.data.files[0].id,
      media
    });
    return existing.data.files[0].id;
  } else {
    // Create new file
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media,
      fields: 'id'
    });
    return res.data.id;
  }
}

/**
 * Perform a backup for a server
 */
async function performBackup(serverName, type = 'manual') {
  console.log(`[Backup] Starting ${type} backup for ${serverName}`);
  
  const config = readBackupConfig(serverName);
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  
  if (!rootFolderId) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');
  }

  const drive = getDriveService();
  
  // Ensure folder structure: KatCraftPanel/<serverName>/<type>/
  const panelFolderId = await ensureDriveFolder(drive, rootFolderId, 'KatCraftPanel');
  const serverFolderId = await ensureDriveFolder(drive, panelFolderId, serverName);
  const typeFolderId = await ensureDriveFolder(drive, serverFolderId, type);

  // Create archive
  const archivePath = await createArchive(serverName, config.excludePatterns || []);

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${serverName}-${type}-${timestamp}.tar.gz`;

    if (type === 'daily') {
      // Daily: overwrite single file
      await uploadToDrive(drive, typeFolderId, `${serverName}-daily-latest.tar.gz`, archivePath);
    } else {
      // Weekly/Monthly: keep multiple, manage retention
      await uploadToDrive(drive, typeFolderId, fileName, archivePath);
      
      // Clean old backups based on retention
      const retention = type === 'weekly' ? (config.weekly?.retention || 4) : (config.monthly?.retention || 3);
      await cleanOldBackups(drive, typeFolderId, retention);
    }

    console.log(`[Backup] ${type} backup completed for ${serverName}`);
    return { success: true, type, serverName, timestamp: new Date().toISOString() };
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(archivePath); } catch {}
  }
}

/**
 * Clean old backups, keeping only the most recent N
 */
async function cleanOldBackups(drive, folderId, retention) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc'
  });

  const files = res.data.files;
  if (files.length > retention) {
    const toDelete = files.slice(retention);
    for (const file of toDelete) {
      await drive.files.delete({ fileId: file.id });
    }
  }
}

/**
 * List backups for a server from Google Drive
 */
async function listBackups(serverName) {
  try {
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!rootFolderId) return { daily: [], weekly: [], monthly: [] };

    const drive = getDriveService();
    const result = { daily: [], weekly: [], monthly: [] };

    for (const type of ['daily', 'weekly', 'monthly']) {
      try {
        const panelFolderId = await ensureDriveFolder(drive, rootFolderId, 'KatCraftPanel');
        const serverFolderId = await ensureDriveFolder(drive, panelFolderId, serverName);
        const typeFolderId = await ensureDriveFolder(drive, serverFolderId, type);

        const res = await drive.files.list({
          q: `'${typeFolderId}' in parents and trashed=false`,
          fields: 'files(id, name, size, createdTime, modifiedTime)',
          orderBy: 'createdTime desc'
        });

        result[type] = res.data.files;
      } catch {
        // Folder might not exist yet
      }
    }

    return result;
  } catch (err) {
    console.error('[Backup] Failed to list backups:', err.message);
    return { daily: [], weekly: [], monthly: [] };
  }
}

/**
 * Initialize backup scheduler for all servers
 */
async function initBackupScheduler() {
  const serversDir = SERVERS_PATH;
  if (!fs.existsSync(serversDir)) {
    fs.mkdirSync(serversDir, { recursive: true });
    return;
  }

  const dirs = fs.readdirSync(serversDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const serverName of dirs) {
    scheduleBackups(serverName);
  }

  console.log(`[Backup] Scheduler initialized for ${dirs.length} servers`);
}

/**
 * Schedule backups for a specific server
 */
function scheduleBackups(serverName) {
  // Clear existing jobs
  clearBackupSchedule(serverName);

  const config = readBackupConfig(serverName);
  if (!config.enabled) return;

  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootFolderId) {
    console.warn(`[Backup] Google Drive not configured, skipping ${serverName}`);
    return;
  }

  const jobs = [];

  // Daily backup
  if (config.daily?.enabled) {
    const [hour, minute] = (config.daily.time || '03:00').split(':');
    const cronExpr = `${minute} ${hour} * * *`;
    const job = cron.schedule(cronExpr, () => {
      performBackup(serverName, 'daily').catch(err => {
        console.error(`[Backup] Daily backup failed for ${serverName}:`, err.message);
      });
    });
    jobs.push(job);
  }

  // Weekly backup
  if (config.weekly?.enabled) {
    const [hour, minute] = (config.weekly.time || '03:00').split(':');
    const dayOfWeek = config.weekly.dayOfWeek || 0;
    const cronExpr = `${minute} ${hour} * * ${dayOfWeek}`;
    const job = cron.schedule(cronExpr, () => {
      performBackup(serverName, 'weekly').catch(err => {
        console.error(`[Backup] Weekly backup failed for ${serverName}:`, err.message);
      });
    });
    jobs.push(job);
  }

  // Monthly backup
  if (config.monthly?.enabled) {
    const [hour, minute] = (config.monthly.time || '03:00').split(':');
    const dayOfMonth = config.monthly.dayOfMonth || 1;
    const cronExpr = `${minute} ${hour} ${dayOfMonth} * *`;
    const job = cron.schedule(cronExpr, () => {
      performBackup(serverName, 'monthly').catch(err => {
        console.error(`[Backup] Monthly backup failed for ${serverName}:`, err.message);
      });
    });
    jobs.push(job);
  }

  if (jobs.length > 0) {
    cronJobs.set(serverName, jobs);
    console.log(`[Backup] Scheduled ${jobs.length} backup job(s) for ${serverName}`);
  }
}

/**
 * Clear backup schedule for a server
 */
function clearBackupSchedule(serverName) {
  const jobs = cronJobs.get(serverName);
  if (jobs) {
    jobs.forEach(j => j.stop());
    cronJobs.delete(serverName);
  }
}

module.exports = {
  readBackupConfig,
  writeBackupConfig,
  defaultBackupConfig,
  performBackup,
  listBackups,
  initBackupScheduler,
  scheduleBackups,
  clearBackupSchedule
};
