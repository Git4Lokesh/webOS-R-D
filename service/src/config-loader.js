'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  pollingIntervalMs: 3000,
  collectionServerUrl: '',
  dnsProxyIp: '',
  bufferFlushSize: 50,
  activityRetryDelayMs: 30000,
  activityMaxRetries: 5
};

function clamp(value, min, max) {
  if (typeof value !== 'number' || isNaN(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function load(filePath) {
  let userConfig = {};

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    userConfig = JSON.parse(raw);
  } catch (err) {
    console.warn('[ConfigLoader] Could not read config file, using defaults:', err.message);
  }

  const merged = Object.assign({}, DEFAULTS, userConfig);

  merged.pollingIntervalMs = clamp(merged.pollingIntervalMs, 1000, 10000);
  merged.bufferFlushSize = clamp(merged.bufferFlushSize, 10, 500);

  return merged;
}

module.exports = { load, DEFAULTS, clamp };
