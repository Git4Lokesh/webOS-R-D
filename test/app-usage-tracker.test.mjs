import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const AppUsageTracker = require('../service/src/app-usage-tracker');

function makePollResult(appId, offsetMs) {
  const ts = new Date(Date.now() + (offsetMs || 0)).toISOString();
  return { appId, processId: '1234', windowType: 'card', timestamp: ts, raw: {} };
}

const appIdArb = fc.stringMatching(/^[a-z]{1,5}\.[a-z]{1,5}\.[a-z]{1,8}$/);

describe('AppUsageTracker', () => {
  it('first poll creates no transition', () => {
    const tracker = new AppUsageTracker();
    const result = tracker.recordPoll(makePollResult('com.test.app'));
    expect(result).toBeNull();
    expect(tracker.getBufferSize()).toBe(0);
  });

  it('same app repeated creates no transition', () => {
    const tracker = new AppUsageTracker();
    tracker.recordPoll(makePollResult('com.test.app', 0));
    tracker.recordPoll(makePollResult('com.test.app', 1000));
    tracker.recordPoll(makePollResult('com.test.app', 2000));
    expect(tracker.getBufferSize()).toBe(0);
    expect(tracker.getTotalTransitions()).toBe(0);
  });

  it('app change creates a transition', () => {
    const tracker = new AppUsageTracker();
    tracker.recordPoll(makePollResult('com.app.one', 0));
    const transition = tracker.recordPoll(makePollResult('com.app.two', 3000));
    expect(transition).not.toBeNull();
    expect(transition.previousAppId).toBe('com.app.one');
    expect(transition.newAppId).toBe('com.app.two');
    expect(transition.closedEntry.focusLostAt).not.toBeNull();
    expect(transition.closedEntry.durationMs).toBeGreaterThanOrEqual(0);
    expect(tracker.getBufferSize()).toBe(1);
  });

  it('flushBuffer returns entries and clears', () => {
    const tracker = new AppUsageTracker();
    tracker.recordPoll(makePollResult('com.app.one', 0));
    tracker.recordPoll(makePollResult('com.app.two', 1000));
    tracker.recordPoll(makePollResult('com.app.three', 2000));
    expect(tracker.getBufferSize()).toBe(2);
    const flushed = tracker.flushBuffer();
    expect(flushed.length).toBe(2);
    expect(tracker.getBufferSize()).toBe(0);
  });

  // Property 2: App transition correctness
  it('Property 2: transitions produce correct closed/opened entries', () => {
    fc.assert(
      fc.property(
        fc.array(appIdArb, { minLength: 2, maxLength: 20 }),
        (appIds) => {
          const tracker = new AppUsageTracker();
          let prevId = null;
          for (let i = 0; i < appIds.length; i++) {
            const poll = makePollResult(appIds[i], i * 3000);
            const transition = tracker.recordPoll(poll);
            if (prevId !== null && appIds[i] !== prevId) {
              expect(transition).not.toBeNull();
              expect(transition.closedEntry.focusLostAt).not.toBeNull();
              expect(transition.closedEntry.durationMs).toBeGreaterThanOrEqual(0);
              expect(transition.openedEntry.appId).toBe(appIds[i]);
              expect(transition.openedEntry.focusGainedAt).toBe(poll.timestamp);
            }
            prevId = appIds[i];
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 3: No transition on repeated app
  it('Property 3: repeated same app produces no new buffer entries', () => {
    fc.assert(
      fc.property(
        appIdArb,
        fc.integer({ min: 2, max: 50 }),
        (appId, count) => {
          const tracker = new AppUsageTracker();
          for (let i = 0; i < count; i++) {
            tracker.recordPoll(makePollResult(appId, i * 1000));
          }
          expect(tracker.getBufferSize()).toBe(0);
          expect(tracker.getTotalTransitions()).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
