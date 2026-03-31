const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');

const SERVERS_PATH = '/app/servers';

router.use(requireAuth);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const serverName = req.params.server;
    const uploadPath = req.body.path || '';
    const fullPath = path.join(SERVERS_PATH, serverName, uploadPath);
    
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    // Preserve original filename including relative path for folder uploads
    const relativePath = file.originalname;
    cb(null, path.basename(relativePath));
  }
});

const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB limit

// Helper: safe path join that prevents directory traversal
function safePath(serverName, filePath) {
  const base = path.join(SERVERS_PATH, serverName);
  const resolved = path.resolve(base, filePath || '');
  if (!resolved.startsWith(base)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

// List files in a directory
router.get('/:server', async (req, res) => {
  try {
    const dirPath = safePath(req.params.server, req.query.path || '');
    
    if (!fs.existsSync(dirPath)) {
      return res.json({ files: [], path: req.query.path || '/' });
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries.map(entry => {
      const fullPath = path.join(dirPath, entry.name);
      const stats = fs.statSync(fullPath);
      return {
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modified: stats.mtime,
        path: path.join(req.query.path || '', entry.name)
      };
    });

    // Sort: directories first, then alphabetically
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ files, path: req.query.path || '/' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read file content
router.get('/:server/read', async (req, res) => {
  try {
    const filePath = safePath(req.params.server, req.query.path);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Cannot read directory' });
    }

    // Check if file is likely text (< 10MB)
    if (stats.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large to edit (>10MB)' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content, path: req.query.path, size: stats.size });
  } catch (err) {
    if (err.code === 'ERR_INVALID_ARG_VALUE' || err.message.includes('encoding')) {
      return res.status(400).json({ error: 'Binary file cannot be read as text' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Save file content
router.put('/:server/write', async (req, res) => {
  try {
    const filePath = safePath(req.params.server, req.body.path);
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, req.body.content, 'utf8');
    res.json({ message: 'File saved', path: req.body.path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload files
router.post('/:server/upload', upload.array('files', 100), async (req, res) => {
  try {
    const uploadPath = req.body.path || '';
    const mode = req.body.mode || 'normal'; // normal, overwrite, rename
    const results = [];

    for (const file of req.files) {
      const relativePath = req.body[`relativePath_${file.originalname}`] || '';
      let targetDir = safePath(req.params.server, path.join(uploadPath, path.dirname(relativePath)));
      let targetPath = path.join(targetDir, file.originalname);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Handle conflict
      if (fs.existsSync(targetPath) && mode !== 'overwrite') {
        if (mode === 'rename') {
          const ext = path.extname(file.originalname);
          const base = path.basename(file.originalname, ext);
          let counter = 1;
          while (fs.existsSync(targetPath)) {
            targetPath = path.join(targetDir, `${base}_${counter}${ext}`);
            counter++;
          }
        } else {
          results.push({ name: file.originalname, status: 'conflict' });
          continue;
        }
      }

      // Move uploaded file to target
      if (file.path !== targetPath) {
        fs.renameSync(file.path, targetPath);
      }
      results.push({ name: path.basename(targetPath), status: 'uploaded', path: targetPath });
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if files exist (for conflict detection before upload)
router.post('/:server/check-conflicts', async (req, res) => {
  try {
    const { files, path: uploadPath } = req.body;
    const conflicts = [];

    for (const fileName of files) {
      const filePath = safePath(req.params.server, path.join(uploadPath || '', fileName));
      if (fs.existsSync(filePath)) {
        conflicts.push(fileName);
      }
    }

    res.json({ conflicts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create directory
router.post('/:server/mkdir', async (req, res) => {
  try {
    const dirPath = safePath(req.params.server, req.body.path);
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ message: 'Directory created', path: req.body.path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new file
router.post('/:server/create-file', async (req, res) => {
  try {
    const filePath = safePath(req.params.server, req.body.path);
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(filePath)) {
      return res.status(409).json({ error: 'File already exists' });
    }

    fs.writeFileSync(filePath, req.body.content || '', 'utf8');
    res.json({ message: 'File created', path: req.body.path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename file/directory
router.put('/:server/rename', async (req, res) => {
  try {
    const oldPath = safePath(req.params.server, req.body.oldPath);
    const newPath = safePath(req.params.server, req.body.newPath);

    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({ error: 'Source not found' });
    }

    if (fs.existsSync(newPath)) {
      return res.status(409).json({ error: 'Destination already exists' });
    }

    fs.renameSync(oldPath, newPath);
    res.json({ message: 'Renamed', oldPath: req.body.oldPath, newPath: req.body.newPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete file/directory
router.delete('/:server', async (req, res) => {
  try {
    const targetPath = safePath(req.params.server, req.query.path);

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const stats = fs.statSync(targetPath);
    if (stats.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetPath);
    }

    res.json({ message: 'Deleted', path: req.query.path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download file
router.get('/:server/download', async (req, res) => {
  try {
    const filePath = safePath(req.params.server, req.query.path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
