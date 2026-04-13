'use strict';

class ActivityRegistrar {
  constructor(service, config) {
    this._service = service;
    this._retryDelayMs = config.activityRetryDelayMs || 30000;
    this._maxRetries = config.activityMaxRetries || 5;
    this._activityId = null;
    this._registered = false;
    this._attempts = 0;
    this._retryTimer = null;
  }

  register() {
    return new Promise((resolve, reject) => {
      this._attempts++;

      // Primary: use the simple service.activityManager.create pattern
      // from the official LG JS Service FAQ — this is a public API
      if (this._service.activityManager) {
        try {
          this._service.activityManager.create('com.example.measurement.keepalive', (activity) => {
            this._activityId = activity;
            this._registered = true;
            console.log('[ActivityRegistrar] Registered keepAlive activity (simple API)');
            resolve({ activityId: activity });
          });
          return;
        } catch (err) {
          console.warn('[ActivityRegistrar] Simple API failed, trying Luna Bus fallback:', err.message);
        }
      }

      // Fallback: raw Luna Bus call with persist/explicit flags (may need Partner privileges)
      var activitySpec = {
        activity: {
          name: 'com.example.measurement.keepalive',
          description: 'Measurement POC background persistence',
          type: {
            persist: true,
            explicit: true,
            foreground: true
          },
          schedule: {
            interval: '5m',
            local: true
          },
          callback: {
            method: 'luna://com.example.measurement.service/heartbeat'
          }
        },
        start: true,
        replace: true
      };

      this._service.call(
        'luna://com.webos.activitymanager/create',
        activitySpec,
        (response) => {
          if (response.returnValue === false || response.errorCode) {
            console.error('[ActivityRegistrar] Registration rejected:', response.errorText || response.errorCode);

            if (this._attempts <= this._maxRetries) {
              console.log(`[ActivityRegistrar] Retrying in ${this._retryDelayMs}ms (attempt ${this._attempts}/${this._maxRetries + 1})`);
              this._retryTimer = setTimeout(() => {
                this.register().then(resolve).catch(reject);
              }, this._retryDelayMs);
            } else {
              console.error('[ActivityRegistrar] Max retries exhausted');
              reject(new Error('Activity registration failed after max retries'));
            }
            return;
          }

          this._activityId = response.activityId;
          this._registered = true;
          console.log('[ActivityRegistrar] Registered activity:', this._activityId);
          resolve({ activityId: this._activityId });
        }
      );
    });
  }

  deregister() {
    return new Promise((resolve) => {
      if (this._retryTimer) {
        clearTimeout(this._retryTimer);
        this._retryTimer = null;
      }

      if (!this._registered || !this._activityId) {
        resolve();
        return;
      }

      this._service.call(
        'luna://com.webos.activitymanager/complete',
        { activityId: this._activityId },
        (response) => {
          if (response.returnValue === false) {
            console.error('[ActivityRegistrar] Deregister failed:', response.errorText);
          } else {
            console.log('[ActivityRegistrar] Deregistered activity:', this._activityId);
          }
          this._registered = false;
          this._activityId = null;
          resolve();
        }
      );
    });
  }

  isRegistered() {
    return this._registered;
  }

  getActivityId() {
    return this._activityId;
  }

  getAttempts() {
    return this._attempts;
  }
}

module.exports = ActivityRegistrar;
