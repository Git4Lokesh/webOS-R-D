import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const MockService = require('./mocks/webos-service-mock');
const PollingManager = require('../service/src/polling-manager');

describe('PollingManager', () => {
  let mockService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockService = new MockService('com.example.measurement.service');
    mockService.mockCallResponse(
      'luna://com.webos.applicationManager/getForegroundAppInfo',
      { returnValue: true, appId: 'com.test.app', processId: 100, windowType: 'card' }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts polling and delivers results', () => {
    const results = [];
    const pm = new PollingManager(mockService, (r) => results.push(r));
    pm.start(3000);
    expect(results.length).toBe(1);
    expect(results[0].appId).toBe('com.test.app');
    vi.advanceTimersByTime(3000);
    expect(results.length).toBe(2);
    pm.stop();
  });

  it('stop prevents further polls', () => {
    const results = [];
    const pm = new PollingManager(mockService, (r) => results.push(r));
    pm.start(1000);
    pm.stop();
    vi.advanceTimersByTime(5000);
    expect(results.length).toBe(1);
  });

  it('tracks total polls and last timestamp', () => {
    const pm = new PollingManager(mockService, () => {});
    pm.start(1000);
    vi.advanceTimersByTime(3000);
    expect(pm.getTotalPolls()).toBeGreaterThanOrEqual(2);
    expect(pm.getLastPollTimestamp()).not.toBeNull();
    pm.stop();
  });

  it('handles Luna Bus errors gracefully', () => {
    mockService.mockCallResponse(
      'luna://com.webos.applicationManager/getForegroundAppInfo',
      { errorCode: -1, errorText: 'Service not found' }
    );
    const results = [];
    const pm = new PollingManager(mockService, (r) => results.push(r));
    pm.start(1000);
    // With errors, subscribe warns and polling fallback also gets errors
    // No results should be delivered (errors are filtered)
    expect(results.length).toBe(0);
    pm.stop();
  });

  // Property 6: Relaunch idempotence
  it('Property 6: multiple start() calls result in exactly one timer', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (startCalls) => {
          const results = [];
          const pm = new PollingManager(mockService, (r) => results.push(r));
          for (let i = 0; i < startCalls; i++) {
            pm.start(1000);
          }
          expect(results.length).toBe(1);
          vi.advanceTimersByTime(1000);
          expect(results.length).toBe(2);
          pm.stop();
          results.length = 0;
        }
      ),
      { numRuns: 50 }
    );
  });
});
