'use strict';

class AppUsageTracker {
  constructor() {
    this._buffer = [];
    this._currentEntry = null;
    this._currentAppId = null;
    this._totalTransitions = 0;
  }

  recordPoll(pollResult) {
    const { appId, processId, windowType, timestamp } = pollResult;

    // First poll ever — create initial entry
    if (this._currentAppId === null) {
      this._currentAppId = appId;
      this._currentEntry = {
        appId,
        processId,
        windowType,
        focusGainedAt: timestamp,
        focusLostAt: null,
        durationMs: null
      };
      return null;
    }

    // Same app — no transition
    if (appId === this._currentAppId) {
      return null;
    }

    // Transition detected
    this._totalTransitions++;

    // Close previous entry
    const closedEntry = this._currentEntry;
    closedEntry.focusLostAt = timestamp;
    closedEntry.durationMs = new Date(timestamp) - new Date(closedEntry.focusGainedAt);
    this._buffer.push(closedEntry);

    // Open new entry
    const openedEntry = {
      appId,
      processId,
      windowType,
      focusGainedAt: timestamp,
      focusLostAt: null,
      durationMs: null
    };
    this._currentEntry = openedEntry;
    this._currentAppId = appId;

    return {
      previousAppId: closedEntry.appId,
      newAppId: appId,
      transitionTimestamp: timestamp,
      closedEntry,
      openedEntry
    };
  }

  getBuffer() {
    return this._buffer.slice();
  }

  getBufferSize() {
    return this._buffer.length;
  }

  flushBuffer() {
    const entries = this._buffer.slice();
    this._buffer = [];
    return entries;
  }

  getCurrentEntry() {
    return this._currentEntry;
  }

  getTotalTransitions() {
    return this._totalTransitions;
  }
}

module.exports = AppUsageTracker;
