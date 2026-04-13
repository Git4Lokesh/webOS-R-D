import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { load, DEFAULTS } = require('../service/src/config-loader');

describe('ConfigLoader', () => {
  let tmpDir;
  let configPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    configPath = path.join(tmpDir, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns all defaults when file is missing', () => {
    const config = load(path.join(tmpDir, 'nonexistent.json'));
    expect(config).toEqual(DEFAULTS);
  });

  it('returns all defaults when file is malformed JSON', () => {
    fs.writeFileSync(configPath, 'not json!!!');
    const config = load(configPath);
    expect(config).toEqual(DEFAULTS);
  });

  it('merges user values with defaults', () => {
    fs.writeFileSync(configPath, JSON.stringify({ pollingIntervalMs: 5000 }));
    const config = load(configPath);
    expect(config.pollingIntervalMs).toBe(5000);
    expect(config.bufferFlushSize).toBe(DEFAULTS.bufferFlushSize);
  });

  it('clamps pollingIntervalMs below minimum', () => {
    fs.writeFileSync(configPath, JSON.stringify({ pollingIntervalMs: 100 }));
    expect(load(configPath).pollingIntervalMs).toBe(1000);
  });

  it('clamps pollingIntervalMs above maximum', () => {
    fs.writeFileSync(configPath, JSON.stringify({ pollingIntervalMs: 99999 }));
    expect(load(configPath).pollingIntervalMs).toBe(10000);
  });

  // Property 1: Polling interval validation
  it('Property 1: pollingIntervalMs is always within [1000, 10000]', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.double(), fc.constant(NaN), fc.constant(null), fc.constant(undefined)),
        (value) => {
          fs.writeFileSync(configPath, JSON.stringify({ pollingIntervalMs: value }));
          const config = load(configPath);
          expect(config.pollingIntervalMs).toBeGreaterThanOrEqual(1000);
          expect(config.pollingIntervalMs).toBeLessThanOrEqual(10000);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 14: Config parsing with defaults
  it('Property 14: any JSON input produces a valid complete Config', () => {
    const configKeyArb = fc.record({
      pollingIntervalMs: fc.option(fc.oneof(fc.integer(), fc.double()), { nil: undefined }),
      collectionServerUrl: fc.option(fc.string(), { nil: undefined }),
      dnsProxyIp: fc.option(fc.string(), { nil: undefined }),
      bufferFlushSize: fc.option(fc.oneof(fc.integer(), fc.double()), { nil: undefined }),
      activityRetryDelayMs: fc.option(fc.integer(), { nil: undefined }),
      activityMaxRetries: fc.option(fc.integer(), { nil: undefined }),
    });

    fc.assert(
      fc.property(configKeyArb, (partial) => {
        const clean = {};
        for (const [k, v] of Object.entries(partial)) {
          if (v !== undefined) clean[k] = v;
        }
        fs.writeFileSync(configPath, JSON.stringify(clean));
        const config = load(configPath);
        expect(config).toHaveProperty('pollingIntervalMs');
        expect(config).toHaveProperty('collectionServerUrl');
        expect(config).toHaveProperty('dnsProxyIp');
        expect(config).toHaveProperty('bufferFlushSize');
        expect(config).toHaveProperty('activityRetryDelayMs');
        expect(config).toHaveProperty('activityMaxRetries');
        expect(config.pollingIntervalMs).toBeGreaterThanOrEqual(1000);
        expect(config.pollingIntervalMs).toBeLessThanOrEqual(10000);
        expect(config.bufferFlushSize).toBeGreaterThanOrEqual(10);
        expect(config.bufferFlushSize).toBeLessThanOrEqual(500);
      }),
      { numRuns: 100 }
    );
  });
});
