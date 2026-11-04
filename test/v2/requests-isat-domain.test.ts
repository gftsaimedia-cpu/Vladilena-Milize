import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IsatRegistration, ISAT_CONDITIONS, SystemRequest } from '../../src/modules/requests/domain';

const profile = {
  fullName: 'Nguyễn Văn A', positionType: 'nv', positionLevel: 2, levelName: 'Chuyên viên',
  shiftType: 'NORMAL', shiftStartTime: '08:00', shiftEndTime: '17:00'
};
const allPassed = { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true };
const base = { employeeId: 'emp-uuid-1', saturday: '2026-11-07', team: 'VN Pod — Vận hành', profile };
const create = (over: Record<string, unknown> = {}) =>
  SystemRequest.createIsatRequest({ ...base, conditions: allPassed, ...over } as any);

describe('Đơn iSAT - domain', () => {
  it('lists the four conditions in form order', () => {
    assert.deepEqual(ISAT_CONDITIONS.map(c => c.code), ['NO_VIOLATION', 'REPORTS_DONE', 'WORK_COMPLETED', 'OFFICIAL_EMPLOYEE']);
    assert.equal(ISAT_CONDITIONS[3].label, 'Là nhân viên chính thức');
  });

  it('4/4 is PENDING with generated title and reason', () => {
    const req = create();
    assert.equal(req.type, 'ISAT');
    assert.equal(req.status, 'PENDING');
    assert.equal(req.title, 'Đăng ký iSAT Thứ Bảy 07/11/2026');
    assert.equal(req.reason, 'Tự đánh giá đạt 4/4 điều kiện');
    assert.equal(req.reviewedBy, null);
    assert.equal(req.reviewedAt, null);
  });

  it('3/4 is REJECTED at once with a note and no reviewer', () => {
    const req = create({ conditions: { ...allPassed, NO_VIOLATION: false } });
    assert.equal(req.status, 'REJECTED');
    assert.equal(req.reason, 'Tự đánh giá đạt 3/4 điều kiện');
    assert.equal(req.reviewNote, 'Tự đánh giá chưa đạt 4/4 (đạt 3/4)');
    assert.equal(req.reviewedBy, null);
    assert.ok(req.reviewedAt instanceof Date);
  });

  it('counts missing or null conditions as Chưa đạt', () => {
    const req = create({ conditions: { NO_VIOLATION: true, REPORTS_DONE: null } });
    assert.deepEqual(req.isat!.conditions.map(c => c.passed), [true, false, false, false]);
    assert.equal(create({ conditions: undefined }).isat!.passedCount, 0);
    assert.equal(create({ conditions: undefined }).status, 'REJECTED');
  });

  it('accepts only a real Saturday', () => {
    for (const saturday of ['2026-11-06', '2026-02-30', '07/11/2026', undefined]) {
      assert.throws(() => create({ saturday }), /saturday phải là ngày Thứ Bảy dạng YYYY-MM-DD/);
    }
  });

  it('requires a team and trims it', () => {
    assert.throws(() => create({ team: '   ' }), /team \(Bộ phận \/ Team\) không được để trống/);
    assert.equal(create({ team: '  VN Pod  ' }).isat!.team, 'VN Pod');
  });

  it('rejects malformed conditions', () => {
    for (const conditions of [[true, true, true, true], 'all', 4]) {
      assert.throws(() => create({ conditions }), /conditions phải là object/);
    }
    assert.throws(() => create({ conditions: { ...allPassed, EXTRA: true } }), /Mã điều kiện iSAT không hợp lệ: EXTRA/);
    assert.throws(() => create({ conditions: { ...allPassed, NO_VIOLATION: 'true' } }), /Giá trị điều kiện NO_VIOLATION phải là true, false hoặc null/);
  });

  it('exposes the isat block in JSON and null for other types', () => {
    const dto = create({ conditions: { ...allPassed, NO_VIOLATION: false } }).toJSON();
    assert.deepEqual(dto.isat, {
      saturday: '2026-11-07', fullName: 'Nguyễn Văn A', team: 'VN Pod — Vận hành',
      positionType: 'nv', positionLevel: 2, levelName: 'Chuyên viên',
      shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' },
      conditions: ISAT_CONDITIONS.map((c, i) => ({ code: c.code, label: c.label, passed: i !== 0 })),
      passedCount: 3, totalCount: 4
    });
    const leave = SystemRequest.createLeaveRequest({
      employeeId: 'e', title: 't', reason: 'r', leaveType: 'PAID', startDate: '2026-11-10', endDate: '2026-11-10', daysCount: 1
    });
    assert.equal(leave.toJSON().isat, null);
  });

  it('round-trips through table rows', () => {
    const req = create();
    const isat = req.isat!;
    assert.deepEqual(isat.toConditionRows(req.id).map(r => r.sort_order), [1, 2, 3, 4]);
    const back = IsatRegistration.fromRows(isat.toRow(req.id), isat.toConditionRows(req.id).reverse());
    assert.deepEqual(back.toJSON(), isat.toJSON());
    assert.deepEqual(SystemRequest.fromRow(req.toRow(), back).toJSON(), req.toJSON());
  });
});
