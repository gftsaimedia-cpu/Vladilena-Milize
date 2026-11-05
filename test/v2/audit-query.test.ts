import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAuditQuery, vnDayStart } from '../../src/modules/audit/domain/audit-query';

const rejects = (raw: Record<string, unknown>, pattern: RegExp) =>
  assert.throws(
    () => parseAuditQuery(raw),
    (e: any) => e.status === 400 && pattern.test(e.message)
  );

describe('parseAuditQuery', () => {
  it('defaults to 25 rows from the start', () => {
    assert.deepEqual(parseAuditQuery({}), { limit: 25, offset: 0 });
  });

  it('caps limit at 200 and drops empty filters', () => {
    assert.deepEqual(parseAuditQuery({ limit: '500', offset: '50', actor: '', action: 'param.set' }), {
      limit: 200,
      offset: 50,
      action: 'param.set'
    });
  });

  it('turns days into Vietnam-time bounds', () => {
    const both = parseAuditQuery({ from: '2026-11-05', to: '2026-11-05' });
    assert.equal(both.fromAt, '2026-11-04T17:00:00.000Z');
    assert.equal(both.toAt, '2026-11-05T17:00:00.000Z');
    const onlyTo = parseAuditQuery({ to: '2026-12-31' });
    assert.equal(onlyTo.toAt, '2026-12-31T17:00:00.000Z');
    assert.equal('fromAt' in onlyTo, false);
    assert.equal(vnDayStart('2026-03-01'), '2026-02-28T17:00:00.000Z');
    assert.equal(vnDayStart('2026-11-05'), '2026-11-04T17:00:00.000Z');
  });

  it('rejects bad input with a 400', () => {
    rejects({ limit: '0' }, /limit/);
    rejects({ limit: 'abc' }, /limit/);
    rejects({ offset: '-1' }, /offset/);
    rejects({ from: '2026-02-30' }, /Từ ngày/);
    rejects({ to: '05/11/2026' }, /Đến ngày/);
    rejects({ from: '2026-11-06', to: '2026-11-05' }, /Từ ngày phải trước hoặc bằng Đến ngày/);
  });
});
