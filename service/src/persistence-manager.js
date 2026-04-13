'use strict';

const fs = require('fs');
const path = require('path');

class PersistenceManager {
  constructor(dataDir) {
    this._filePath = path.join(dataDir, 'app_usage_log.json');
    this._ensureDir(dataDir);
  }

  _ensureDir(dir) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.error('[PersistenceManager] Failed to create data dir:', err.message);
    }
  }

  flush(entries) {
    if (!entries || entries.length === 0) return;

    let existing = [];
    try {
      if (fs.existsSync(this._filePath)) {
        const raw = fs.readFileSync(this._filePath, 'utf8');
        existing = JSON.parse(raw);
        if (!Array.isArray(existing)) existing = [];
      }
    } catch (err) {
      console.warn('[PersistenceManager] Could not read existing log, starting fresh:', err.message);
      existing = [];
    }

    const merged = existing.concat(entries);
    fs.writeFileSync(this._filePath, JSON.stringify(merged, null, 2), 'utf8');
  }

  readAll() {
    try {
      if (!fs.existsSync(this._filePath)) return [];
      const raw = fs.readFileSync(this._filePath, 'utf8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('[PersistenceManager] Failed to read log:', err.message);
      return [];
    }
  }

  getFilePath() {
    return this._filePath;
  }
}

module.exports = PersistenceManager;
