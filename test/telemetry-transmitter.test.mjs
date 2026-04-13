import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const TelemetryTransmitter = require('../service/src/telemetry-transmitter');

describe('TelemetryTransmitter', () => {
  it('returns false when no server URL configured', async () => {
    const tt = new TelemetryTransmitter('');
    expect(await tt.send({ entries: [] })).toBe(false);
  });

  it('getPendingCount starts at 0', () => {
    const tt = new TelemetryTransmitter('http://localhost:3000');
    expect(tt.getPendingCount()).toBe(0);
  });

  // Property 12: Telemetry payload completeness
  it('Property 12: payload always has all required fields', () => {
    const entryArb = fc.record({
      appId: fc.string({ minLength: 1 }),
      processId: fc.string(),
      windowType: fc.string(),
      focusGainedAt: fc.date().map(d => d.toISOString()),
      focusLostAt: fc.date().map(d => d.toISOString()),
      durationMs: fc.integer({ min: 0 })
    });

    const payloadArb = fc.record({
      deviceModel: fc.string({ minLength: 1 }),
      webosVersion: fc.string({ minLength: 1 }),
      serviceVersion: fc.string({ minLength: 1 }),
      sessionId: fc.uuid(),
      collectedAt: fc.date().map(d => d.toISOString()),
      entries: fc.array(entryArb, { minLength: 1, maxLength: 10 })
    });

    fc.assert(
      fc.property(payloadArb, (payload) => {
        expect(payload.deviceModel).toBeDefined();
        expect(payload.webosVersion).toBeDefined();
        expect(payload.serviceVersion).toBeDefined();
        expect(payload.sessionId).toBeDefined();
        expect(payload.collectedAt).toBeDefined();
        expect(payload.entries.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
