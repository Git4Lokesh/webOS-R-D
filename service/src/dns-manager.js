'use strict';

class DnsManager {
  constructor(service) {
    this._service = service;
    this._originalDns = null;
    this._overrideActive = false;
    this._proxyIp = null;
  }

  overrideDns(proxyIp) {
    this._proxyIp = proxyIp;

    return new Promise((resolve, reject) => {
      // First read current DNS
      this._service.call(
        'luna://com.palm.connectionmanager/getStatus',
        {},
        (statusResponse) => {
          if (statusResponse.returnValue === false) {
            console.error('[DnsManager] getStatus failed:', statusResponse.errorText);
            resolve(false);
            return;
          }

          // Store original DNS
          const wifiInfo = statusResponse.wifi || {};
          this._originalDns = wifiInfo.dns1 || null;

          // Override DNS
          this._service.call(
            'luna://com.palm.connectionmanager/setIPv4',
            {
              method: 'manual',
              dns1: proxyIp,
              dns2: '8.8.8.8'
            },
            (setResponse) => {
              if (setResponse.returnValue === false) {
                console.error('[DnsManager] setIPv4 failed:', setResponse.errorCode, setResponse.errorText);
                resolve(false);
                return;
              }

              this._overrideActive = true;
              console.log('[DnsManager] DNS overridden to:', proxyIp);
              resolve(true);
            }
          );
        }
      );
    });
  }

  restoreDns() {
    return new Promise((resolve) => {
      if (!this._overrideActive || !this._originalDns) {
        resolve(true);
        return;
      }

      this._service.call(
        'luna://com.palm.connectionmanager/setIPv4',
        {
          method: 'manual',
          dns1: this._originalDns,
          dns2: '8.8.8.8'
        },
        (response) => {
          if (response.returnValue === false) {
            console.error('[DnsManager] DNS restore failed:', response.errorText);
            console.error('[DnsManager] Original DNS was:', this._originalDns);
            resolve(false);
            return;
          }

          this._overrideActive = false;
          console.log('[DnsManager] DNS restored to:', this._originalDns);
          resolve(true);
        }
      );
    });
  }

  verifyDns() {
    return new Promise((resolve) => {
      this._service.call(
        'luna://com.palm.connectionmanager/getStatus',
        {},
        (response) => {
          if (response.returnValue === false) {
            resolve({ current: null, expected: this._proxyIp, match: false });
            return;
          }

          const wifiInfo = response.wifi || {};
          const current = wifiInfo.dns1 || null;
          resolve({
            current,
            expected: this._proxyIp,
            match: current === this._proxyIp
          });
        }
      );
    });
  }

  getOriginalDns() {
    return this._originalDns;
  }

  isOverrideActive() {
    return this._overrideActive;
  }
}

module.exports = DnsManager;
