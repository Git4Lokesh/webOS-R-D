'use strict';

const http = require('http');
const https = require('https');
const url = require('url');

class TelemetryTransmitter {
  constructor(serverUrl) {
    this._serverUrl = serverUrl;
    this._pendingQueue = [];
  }

  send(payload) {
    if (!this._serverUrl) {
      return Promise.resolve(false);
    }

    return this._doSend(payload).then((success) => {
      if (!success) {
        this._pendingQueue.push(payload);
      }
      return success;
    });
  }

  getPendingCount() {
    return this._pendingQueue.length;
  }

  retryPending() {
    if (this._pendingQueue.length === 0) {
      return Promise.resolve(0);
    }

    const toRetry = this._pendingQueue.slice();
    this._pendingQueue = [];
    let successCount = 0;

    return toRetry.reduce((chain, payload) => {
      return chain.then(() => {
        return this._doSend(payload).then((success) => {
          if (success) {
            successCount++;
          } else {
            this._pendingQueue.push(payload);
          }
        });
      });
    }, Promise.resolve()).then(() => successCount);
  }

  _doSend(payload) {
    return new Promise((resolve) => {
      try {
        const parsed = url.parse(this._serverUrl + '/api/telemetry');
        const transport = parsed.protocol === 'https:' ? https : http;
        const body = JSON.stringify(payload);

        const options = {
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          },
          timeout: 10000
        };

        const req = transport.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(true);
            } else {
              console.error('[TelemetryTransmitter] Server returned:', res.statusCode, data);
              resolve(false);
            }
          });
        });

        req.on('error', (err) => {
          console.error('[TelemetryTransmitter] Request error:', err.message);
          resolve(false);
        });

        req.on('timeout', () => {
          req.destroy();
          console.error('[TelemetryTransmitter] Request timed out');
          resolve(false);
        });

        req.write(body);
        req.end();
      } catch (err) {
        console.error('[TelemetryTransmitter] Send error:', err.message);
        resolve(false);
      }
    });
  }
}

module.exports = TelemetryTransmitter;
