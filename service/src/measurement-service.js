'use strict';

const path = require('path');
const { v4: uuidv4 } = require('./uuid');
const ConfigLoader = require('./config-loader');
const PollingManager = require('./polling-manager');
const AppUsageTracker = require('./app-usage-tracker');
const PersistenceManager = require('./persistence-manager');
const ActivityRegistrar = require('./activity-registrar');
const DnsManager = require('./dns-manager');
const TelemetryTransmitter = require('./telemetry-transmitter');

const SERVICE_VERSION = '1.0.0';

class MeasurementService {
  constructor(service) {
    this._service = service;
    this._startTime = Date.now();
    this._sessionId = uuidv4();
    this._config = null;
    this._pollingManager = null;
    this._tracker = null;
    this._persistence = null;
    this._activityRegistrar = null;
    this._dnsManager = null;
    this._telemetry = null;
  }

  init() {
    // Load config
    const configPath = path.join(__dirname, '..', 'config.json');
    this._config = ConfigLoader.load(configPath);
    console.log('[MeasurementService] Config loaded:', JSON.stringify(this._config));

    // Init tracker
    this._tracker = new AppUsageTracker();

    // Init persistence
    const dataDir = path.join(__dirname, '..', '..', 'data');
    this._persistence = new PersistenceManager(dataDir);

    // Init polling
    this._pollingManager = new PollingManager(this._service, (pollResult) => {
      this._onPollResult(pollResult);
    });

    // Init Activity Manager persistence
    this._activityRegistrar = new ActivityRegistrar(this._service, this._config);
    this._activityRegistrar.register().catch((err) => {
      console.error('[MeasurementService] Activity registration failed:', err.message);
    });

    // Init DNS manager (only if configured)
    if (this._config.dnsProxyIp) {
      this._dnsManager = new DnsManager(this._service);
      this._dnsManager.overrideDns(this._config.dnsProxyIp).then((success) => {
        if (success) {
          this._dnsManager.verifyDns().then((result) => {
            console.log('[MeasurementService] DNS verify:', JSON.stringify(result));
          });
        }
      });
    }

    // Init telemetry (only if configured)
    if (this._config.collectionServerUrl) {
      this._telemetry = new TelemetryTransmitter(this._config.collectionServerUrl);
    }

    // Start polling
    this._pollingManager.start(this._config.pollingIntervalMs);
    console.log('[MeasurementService] Started polling at', this._config.pollingIntervalMs, 'ms');

    // Register Luna Bus methods
    this._registerMethods();
  }

  _onPollResult(pollResult) {
    const transition = this._tracker.recordPoll(pollResult);

    if (transition) {
      console.log('[MeasurementService] App transition:', transition.previousAppId, '->', transition.newAppId);
    }

    // Check if buffer needs flushing
    if (this._tracker.getBufferSize() >= this._config.bufferFlushSize) {
      this._flushBuffer();
    }
  }

  _flushBuffer() {
    const entries = this._tracker.flushBuffer();
    if (entries.length === 0) return;

    console.log('[MeasurementService] Flushing', entries.length, 'entries');

    // Persist to disk
    try {
      this._persistence.flush(entries);
    } catch (err) {
      console.error('[MeasurementService] Persistence flush failed:', err.message);
      // Re-add entries to buffer — they're lost from tracker but we log the error
    }

    // Send telemetry
    if (this._telemetry) {
      const payload = this._buildTelemetryPayload(entries);
      this._telemetry.send(payload).then((success) => {
        if (success) {
          console.log('[MeasurementService] Telemetry sent successfully');
        }
        // Retry pending
        return this._telemetry.retryPending();
      }).then((retried) => {
        if (retried > 0) {
          console.log('[MeasurementService] Retried', retried, 'pending payloads');
        }
      });
    }
  }

  _buildTelemetryPayload(entries) {
    return {
      deviceModel: 'unknown',
      webosVersion: 'unknown',
      serviceVersion: SERVICE_VERSION,
      sessionId: this._sessionId,
      collectedAt: new Date().toISOString(),
      entries: entries
    };
  }

  _registerMethods() {
    const self = this;

    this._service.register('heartbeat', (message) => {
      message.respond({
        returnValue: true,
        running: true,
        uptime: Date.now() - self._startTime,
        timestamp: new Date().toISOString()
      });
    });

    this._service.register('getDiagnostics', (message) => {
      message.respond({
        returnValue: true,
        running: true,
        uptimeMs: Date.now() - self._startTime,
        totalPolls: self._pollingManager ? self._pollingManager.getTotalPolls() : 0,
        totalTransitions: self._tracker ? self._tracker.getTotalTransitions() : 0,
        lastPollTimestamp: self._pollingManager ? self._pollingManager.getLastPollTimestamp() : null,
        memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100,
        pendingPayloads: self._telemetry ? self._telemetry.getPendingCount() : 0,
        bufferSize: self._tracker ? self._tracker.getBufferSize() : 0,
        activityRegistered: self._activityRegistrar ? self._activityRegistrar.isRegistered() : false,
        dnsOverrideActive: self._dnsManager ? self._dnsManager.isOverrideActive() : false
      });
    });

    this._service.register('getConfig', (message) => {
      message.respond({
        returnValue: true,
        config: self._config
      });
    });
  }

  handleRelaunch() {
    console.log('[MeasurementService] Relaunch event received');
    // Idempotent — start() does nothing if already running
    if (this._pollingManager) {
      this._pollingManager.start(this._config.pollingIntervalMs);
    }
  }

  shutdown() {
    console.log('[MeasurementService] Shutting down...');

    // Stop polling
    if (this._pollingManager) {
      this._pollingManager.stop();
    }

    // Flush remaining buffer
    if (this._tracker && this._tracker.getBufferSize() > 0) {
      this._flushBuffer();
    }

    // Also flush current (unclosed) entry if exists
    const currentEntry = this._tracker ? this._tracker.getCurrentEntry() : null;
    if (currentEntry) {
      currentEntry.focusLostAt = new Date().toISOString();
      currentEntry.durationMs = new Date(currentEntry.focusLostAt) - new Date(currentEntry.focusGainedAt);
      try {
        this._persistence.flush([currentEntry]);
      } catch (err) {
        console.error('[MeasurementService] Failed to flush current entry:', err.message);
      }
    }

    // Restore DNS
    if (this._dnsManager) {
      this._dnsManager.restoreDns().then(() => {
        console.log('[MeasurementService] DNS restored');
      });
    }

    // Deregister activity
    if (this._activityRegistrar) {
      this._activityRegistrar.deregister().then(() => {
        console.log('[MeasurementService] Activity deregistered');
      });
    }
  }
}

module.exports = MeasurementService;
