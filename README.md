# LG webOS Measurement POC

Background data collection module for LG webOS smart TVs. Headless Node.js JS Service that polls foreground app usage, persists via Activity Manager, and optionally reroutes DNS traffic through an external proxy for network monitoring.

## Quick Start

```bash
npm install          # install dev dependencies (vitest, fast-check)
npm test             # run all 35 tests locally
```

## Deploy to TV

```bash
# 1. Install CLI tools
npm install -g @webos-tools/cli

# 2. Enable Developer Mode on TV (Home > Apps > "Developer Mode" > log in > toggle ON > restart)

# 3. Download SSH key and register device
# Save http://<TV_IP>:9991/webos_rsa to ~/.ssh/webos_rsa
chmod 600 ~/.ssh/webos_rsa
ares-setup-device -a myTV -i "username=prisoner" -i "privatekey=~/.ssh/webos_rsa" -i "passphrase=<PASSPHRASE>" -i "host=<TV_IP>" -i "port=9922"

# 4. Verify connection
ares-device-info -d myTV

# 5. Package, install, launch
ares-package .
ares-install -d myTV ./com.example.measurement_1.0.0_all.ipk
ares-launch -d myTV com.example.measurement

# 6. Verify service is running
ares-shell -d myTV
luna-send -n 1 luna://com.example.measurement.service/heartbeat '{}'
luna-send -n 1 luna://com.example.measurement.service/getDiagnostics '{}'
```

## Architecture

- **JS Service** (Node.js + webos-service): Headless background process
- **PollingManager**: Subscribes to `getForegroundAppInfo` for push updates, with polling fallback
- **ActivityRegistrar**: Keeps service alive via `service.activityManager.create("keepAlive")`
- **DnsManager**: Overrides TV DNS via Connection Manager to route through external proxy
- **TelemetryTransmitter**: HTTP POST to Collection Server with retry queue
- **Web UI**: On-screen dashboard via `webOSServiceBridge`

## Config

Edit `service/config.json`:

```json
{
  "pollingIntervalMs": 3000,
  "collectionServerUrl": "",
  "dnsProxyIp": "",
  "bufferFlushSize": 50
}
```
