'use strict';

class PollingManager {
  constructor(service, onPollResult) {
    this._service = service;
    this._onPollResult = onPollResult;
    this._intervalId = null;
    this._running = false;
    this._totalPolls = 0;
    this._lastPollTimestamp = null;
  }

  start(intervalMs) {
    if (this._running) return; // idempotent
    this._running = true;

    // Try subscription first (more efficient, less CPU)
    this._trySubscribe();

    // Fallback: poll on interval if subscribe doesn't deliver
    this._intervalId = setInterval(() => {
      this._poll();
    }, intervalMs);
  }

  stop() {
    this._running = false;
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  isRunning() {
    return this._running;
  }

  _trySubscribe() {
    // getForegroundAppInfo supports {"subscribe": true} for push updates
    this._service.call(
      'luna://com.webos.applicationManager/getForegroundAppInfo',
      { subscribe: true },
      (response) => {
        if (!response || response.errorCode) {
          console.warn('[PollingManager] Subscribe failed, relying on polling fallback');
          return;
        }

        const timestamp = new Date().toISOString();
        this._totalPolls++;
        this._lastPollTimestamp = timestamp;

        const pollResult = {
          appId: response.appId || '',
          processId: String(response.processId || ''),
          windowType: response.windowType || '',
          timestamp: timestamp,
          raw: response
        };

        if (this._onPollResult) {
          this._onPollResult(pollResult);
        }
      }
    );
  }

  getTotalPolls() {
    return this._totalPolls;
  }

  getLastPollTimestamp() {
    return this._lastPollTimestamp;
  }

  _poll() {
    const timestamp = new Date().toISOString();
    this._totalPolls++;
    this._lastPollTimestamp = timestamp;

    this._service.call(
      'luna://com.webos.applicationManager/getForegroundAppInfo',
      {},
      (response) => {
        if (!response || response.errorCode) {
          console.error('[PollingManager] getForegroundAppInfo error:', response);
          return;
        }

        const pollResult = {
          appId: response.appId || '',
          processId: String(response.processId || ''),
          windowType: response.windowType || '',
          timestamp: timestamp,
          raw: response
        };

        if (this._onPollResult) {
          this._onPollResult(pollResult);
        }
      }
    );
  }
}

module.exports = PollingManager;
