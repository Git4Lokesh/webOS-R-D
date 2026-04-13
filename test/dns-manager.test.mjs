import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const MockService = require('./mocks/webos-service-mock');
const DnsManager = require('../service/src/dns-manager');

const ipv4Arb = fc.tuple(
  fc.integer({ min: 1, max: 254 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 1, max: 254 })
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

function createMockWithDns(currentDns) {
  const ms = new MockService('test');
  let activeDns = currentDns;
  ms.mockCallResponse('luna://com.palm.connectionmanager/getStatus', () => ({
    returnValue: true, wifi: { dns1: activeDns }
  }));
  ms.mockCallResponse('luna://com.palm.connectionmanager/setIPv4', (params) => {
    activeDns = params.dns1;
    return { returnValue: true };
  });
  return ms;
}

describe('DnsManager', () => {
  it('overrides DNS and stores original', async () => {
    const ms = createMockWithDns('8.8.8.8');
    const dm = new DnsManager(ms);
    const result = await dm.overrideDns('192.168.1.100');
    expect(result).toBe(true);
    expect(dm.getOriginalDns()).toBe('8.8.8.8');
    expect(dm.isOverrideActive()).toBe(true);
  });

  it('restores original DNS', async () => {
    const ms = createMockWithDns('8.8.8.8');
    const dm = new DnsManager(ms);
    await dm.overrideDns('192.168.1.100');
    expect(await dm.restoreDns()).toBe(true);
    expect(dm.isOverrideActive()).toBe(false);
  });

  // Property 8: DNS override verify round-trip
  it('Property 8: after overrideDns, verifyDns returns match: true', async () => {
    await fc.assert(
      fc.asyncProperty(ipv4Arb, async (proxyIp) => {
        const ms = createMockWithDns('8.8.8.8');
        const dm = new DnsManager(ms);
        await dm.overrideDns(proxyIp);
        const verify = await dm.verifyDns();
        expect(verify.match).toBe(true);
        expect(verify.current).toBe(proxyIp);
      }),
      { numRuns: 100 }
    );
  });

  // Property 9: DNS restore round-trip
  it('Property 9: after override + restore, DNS equals original', async () => {
    await fc.assert(
      fc.asyncProperty(ipv4Arb, ipv4Arb, async (originalDns, proxyIp) => {
        const ms = createMockWithDns(originalDns);
        const dm = new DnsManager(ms);
        await dm.overrideDns(proxyIp);
        await dm.restoreDns();
        const verify = await dm.verifyDns();
        expect(verify.current).toBe(originalDns);
      }),
      { numRuns: 100 }
    );
  });
});
