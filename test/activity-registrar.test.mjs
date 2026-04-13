import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const MockService = require('./mocks/webos-service-mock');
const ActivityRegistrar = require('../service/src/activity-registrar');

describe('ActivityRegistrar', () => {
  let mockService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockService = new MockService('com.example.measurement.service');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers successfully on first attempt', async () => {
    mockService.mockCallResponse('luna://com.webos.activitymanager/create', {
      returnValue: true, activityId: 42
    });
    const reg = new ActivityRegistrar(mockService, { activityRetryDelayMs: 1000, activityMaxRetries: 3 });
    const result = await reg.register();
    expect(result.activityId).toBe(42);
    expect(reg.isRegistered()).toBe(true);
  });

  it('deregisters successfully', async () => {
    mockService.mockCallResponse('luna://com.webos.activitymanager/create', {
      returnValue: true, activityId: 42
    });
    mockService.mockCallResponse('luna://com.webos.activitymanager/complete', {
      returnValue: true
    });
    const reg = new ActivityRegistrar(mockService, { activityRetryDelayMs: 1000, activityMaxRetries: 3 });
    await reg.register();
    await reg.deregister();
    expect(reg.isRegistered()).toBe(false);
    expect(reg.getActivityId()).toBeNull();
  });

  it('retries on rejection and eventually fails', async () => {
    mockService.mockCallResponse('luna://com.webos.activitymanager/create', {
      returnValue: false, errorText: 'Permission denied'
    });
    const maxRetries = 2;
    const reg = new ActivityRegistrar(mockService, { activityRetryDelayMs: 100, activityMaxRetries: maxRetries });
    const promise = reg.register();
    for (let i = 0; i < maxRetries; i++) {
      await vi.advanceTimersByTimeAsync(200);
    }
    await expect(promise).rejects.toThrow('Activity registration failed after max retries');
    expect(reg.getAttempts()).toBe(maxRetries + 1);
  });

  // Property 7: Activity registration retry with bounded attempts
  it('Property 7: total attempts never exceed maxRetries + 1', async () => {
    // Test maxRetries=3 specifically — the registrar tracks attempts internally
    const ms = new MockService('test');
    ms.mockCallResponse('luna://com.webos.activitymanager/create', () => {
      return { returnValue: false, errorText: 'Rejected' };
    });
    const maxRetries = 3;
    const reg = new ActivityRegistrar(ms, { activityRetryDelayMs: 10, activityMaxRetries: maxRetries });
    const promise = reg.register();
    for (let i = 0; i < maxRetries + 1; i++) {
      await vi.advanceTimersByTimeAsync(50);
    }
    try { await promise; } catch (e) { /* expected rejection */ }
    // Initial attempt + maxRetries retries = maxRetries + 1 total
    expect(reg.getAttempts()).toBe(maxRetries + 1);
  });
});
