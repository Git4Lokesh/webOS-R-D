import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PersistenceManager = require('../service/src/persistence-manager');

const entryArb = fc.record({
  appId: fc.stringMatching(/^[a-z]{1,5}\.[a-z]{1,5}\.[a-z]{1,8}$/),
  processId: fc.stringMatching(/^[0-9]{1,5}$/),
  windowType: fc.constantFrom('card', 'overlay', 'popup'),
  focusGainedAt: fc.date().map(d => d.toISOString()),
  focusLostAt: fc.date().map(d => d.toISOString()),
  durationMs: fc.integer({ min: 0, max: 3600000 })
});

describe('PersistenceManager', () => {
  let tmpDir, pm;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-test-'));
    pm = new PersistenceManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates file on first flush', () => {
    pm.flush([{ appId: 'test' }]);
    expect(fs.existsSync(pm.getFilePath())).toBe(true);
  });

  it('readAll returns empty array when no file', () => {
    const newPm = new PersistenceManager(path.join(tmpDir, 'empty'));
    expect(newPm.readAll()).toEqual([]);
  });

  it('flush then readAll returns same entries', () => {
    const entries = [{ appId: 'com.app.one' }, { appId: 'com.app.two' }];
    pm.flush(entries);
    expect(pm.readAll()).toEqual(entries);
  });

  it('multiple flushes append data', () => {
    pm.flush([{ appId: 'first' }]);
    pm.flush([{ appId: 'second' }]);
    const all = pm.readAll();
    expect(all.length).toBe(2);
    expect(all[0].appId).toBe('first');
    expect(all[1].appId).toBe('second');
  });

  it('empty flush does nothing', () => {
    pm.flush([]);
    expect(fs.existsSync(pm.getFilePath())).toBe(false);
  });

  // Property 5: Flush append preserves all data
  it('Property 5: multiple flushes preserve all entries in order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(entryArb, { minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 5 }),
        (flushBatches) => {
          const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prop5-'));
          const testPm = new PersistenceManager(testDir);
          const allEntries = [];
          for (const batch of flushBatches) {
            testPm.flush(batch);
            allEntries.push(...batch);
          }
          const read = testPm.readAll();
          expect(read.length).toBe(allEntries.length);
          for (let i = 0; i < allEntries.length; i++) {
            expect(read[i].appId).toBe(allEntries[i].appId);
          }
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      ),
      { numRuns: 50 }
    );
  });
});
