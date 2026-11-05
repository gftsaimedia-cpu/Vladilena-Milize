import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { workDateOfPunch } from '../../src/modules/attendance/domain';

// L21: lần ra sáng hôm sau của ca đêm thuộc ngày bắt đầu ca. Giờ so với 12:00 là giờ Việt Nam (UTC+7).
const NIGHT_OPEN = { crossesMidnight: true, hasInWithoutOut: true };

describe('workDateOfPunch (L21)', () => {
  it('OUT 07:05 sáng 04/11, ngày trước qua nửa đêm và có vào chưa ra → ngày 03/11', () => {
    const at = new Date('2026-11-04T07:05:00+07:00');
    assert.equal(workDateOfPunch({ at, type: 'OUT', previousDay: NIGHT_OPEN }), '2026-11-03');
  });

  it('OUT đúng 12:00 giờ Việt Nam → ngày 04/11 (mốc 12:00 thuộc ngày D)', () => {
    const at = new Date('2026-11-04T12:00:00+07:00');
    assert.equal(workDateOfPunch({ at, type: 'OUT', previousDay: NIGHT_OPEN }), '2026-11-04');
  });

  it('OUT 11:59 vẫn thuộc ngày trước', () => {
    const at = new Date('2026-11-04T11:59:00+07:00');
    assert.equal(workDateOfPunch({ at, type: 'OUT', previousDay: NIGHT_OPEN }), '2026-11-03');
  });

  it('IN 07:05 sáng 04/11 → ngày 04/11', () => {
    const at = new Date('2026-11-04T07:05:00+07:00');
    assert.equal(workDateOfPunch({ at, type: 'IN', previousDay: NIGHT_OPEN }), '2026-11-04');
  });

  it('ngày trước không qua nửa đêm → ngày 04/11', () => {
    const at = new Date('2026-11-04T07:05:00+07:00');
    assert.equal(
      workDateOfPunch({ at, type: 'OUT', previousDay: { crossesMidnight: false, hasInWithoutOut: true } }),
      '2026-11-04'
    );
  });

  it('ngày trước đã có lần ra → ngày 04/11', () => {
    const at = new Date('2026-11-04T07:05:00+07:00');
    assert.equal(
      workDateOfPunch({ at, type: 'OUT', previousDay: { crossesMidnight: true, hasInWithoutOut: false } }),
      '2026-11-04'
    );
  });

  it('ngày D theo giờ Việt Nam, không theo UTC: 00:30 giờ VN ngày 04/11 là 17:30 UTC ngày 03/11', () => {
    const at = new Date('2026-11-03T17:30:00Z');
    assert.equal(
      workDateOfPunch({ at, type: 'OUT', previousDay: { crossesMidnight: false, hasInWithoutOut: false } }),
      '2026-11-04'
    );
    assert.equal(workDateOfPunch({ at, type: 'OUT', previousDay: NIGHT_OPEN }), '2026-11-03');
  });

  it('lùi qua đầu tháng: OUT 07:05 sáng 01/12 → ngày 30/11', () => {
    const at = new Date('2026-12-01T07:05:00+07:00');
    assert.equal(workDateOfPunch({ at, type: 'OUT', previousDay: NIGHT_OPEN }), '2026-11-30');
  });
});
