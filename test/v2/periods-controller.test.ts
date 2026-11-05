import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PeriodsController } from '../../src/modules/periods/periods.controller';

const user: any = { username: 'admin' };

function setup() {
  const calls: Array<[string, unknown[]]> = [];
  const result = { month: '2026-10', status: 'attendance_locked' };
  const service: any = {
    list: async () => [{ month: '2026-10' }],
    view: async (...a: unknown[]) => (calls.push(['view', a]), result),
    lock: async (...a: unknown[]) => (calls.push(['lock', a]), result),
    unlock: async (...a: unknown[]) => (calls.push(['unlock', a]), result)
  };
  return { ctl: new PeriodsController(service), calls, result };
}

const invalid = (e: any) => e.status === 400 && e.details?.code === 'INVALID_MONTH';

describe('PeriodsController', () => {
  it('rejects a malformed month on every route that takes one', async () => {
    const { ctl } = setup();
    for (const month of ['2026-13', 'abc', '2026-1', '2026-00', '']) {
      await assert.rejects(async () => ctl.getPeriod(month), invalid, `getPeriod ${month}`);
      await assert.rejects(async () => ctl.lockPeriod(month, user), invalid, `lockPeriod ${month}`);
      await assert.rejects(async () => ctl.unlockPeriod(month, { reason: 'x' }, user), invalid, `unlockPeriod ${month}`);
    }
  });

  it('lists periods under a periods key', async () => {
    const { ctl } = setup();
    assert.deepEqual(await ctl.listPeriods(), { periods: [{ month: '2026-10' }] });
  });

  it('getPeriod returns the view', async () => {
    const { ctl, calls, result } = setup();
    assert.equal(await ctl.getPeriod('2026-10'), result);
    assert.deepEqual(calls, [['view', ['2026-10']]]);
  });

  it('lockPeriod passes the session user and returns the view untouched', async () => {
    const { ctl, calls, result } = setup();
    assert.equal(await ctl.lockPeriod('2026-10', user), result);
    assert.deepEqual(calls, [['lock', ['2026-10', 'admin']]]);
  });

  it('unlockPeriod passes body.reason through, even when it is missing', async () => {
    const { ctl, calls, result } = setup();
    assert.equal(await ctl.unlockPeriod('2026-10', { reason: 'Chấm thay' }, user), result);
    await ctl.unlockPeriod('2026-10', undefined as any, user);
    assert.deepEqual(calls, [
      ['unlock', ['2026-10', 'admin', 'Chấm thay']],
      ['unlock', ['2026-10', 'admin', undefined]]
    ]);
  });
});
