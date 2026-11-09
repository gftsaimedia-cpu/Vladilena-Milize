import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Benefits, ScheduleFacts, ShiftFacts } from '../../src/modules/attendance/domain/attendance-day';
import { Day, tagOf, type DayContext, type DayInput, type DayResult } from '../../src/modules/calendar';
import type { Claim } from '../../src/modules/calendar';

const NORMAL: ShiftFacts = { type: 'NORMAL', start: '08:00', end: '17:00', allowancePct: 0 };
const BENEFITS: Benefits = { paidLeave: true, paidHoliday: true, isat: true };
const NOW = new Date('2026-11-05T12:00:00+07:00'); // Thứ Năm
const ctx: DayContext = { employment: { startDate: '2026-01-05', resignedOn: null }, benefits: BENEFITS, workWeek: [1, 2, 3, 4, 5, 6], defaultShift: NORMAL };
const input = (date: string, over: Partial<DayInput> = {}): DayInput => ({ date, schedule: null, otWindows: [], makeupWindows: [], halfShift: null, isHoliday: false, ...over });
const sched = (over: Partial<ScheduleFacts>): ScheduleFacts => ({
  scheduleType: 'REGULAR', status: 'PLANNED', shiftType: 'NORMAL', start: '08:00', end: '17:00', sourceRequestId: 'r1', requestType: null, leaveType: null, ...over
});
const clean: DayResult = { explanationStatus: 'none', cases: [], worked: true, checkedIn: true };
const late = (explanationStatus: DayResult['explanationStatus']): DayResult => ({ explanationStatus, cases: [{ affectsPay: true }], worked: true, checkedIn: true });
const tag = (i: DayInput, r: DayResult = clean, pending: Claim[] = []) => tagOf(Day.resolve(i, ctx, NOW, pending), r);

describe('tagOf: ngày là gì', () => {
  it('ngày làm có chữ ca', () => {
    const t = tag(input('2026-11-03'));
    assert.equal(t.plan, 'work');
    assert.equal(t.shift, 'HC 08:00–17:00');
  });
  it('ngày lễ, nghỉ có lương, không lương, nghỉ bù, iSAT', () => {
    assert.equal(tag(input('2026-11-03', { isHoliday: true })).plan, 'holiday');
    assert.equal(tag(input('2026-11-03', { schedule: sched({ status: 'ON_LEAVE', requestType: 'LEAVE', leaveType: 'ANNUAL' }) })).plan, 'leave_paid');
    assert.equal(tag(input('2026-11-03', { schedule: sched({ status: 'ON_LEAVE', requestType: 'LEAVE', leaveType: 'UNPAID' }) })).plan, 'leave_unpaid');
    assert.equal(tag(input('2026-11-03', { schedule: sched({ status: 'ON_LEAVE', requestType: 'LEAVE_WITH_MAKEUP', leaveType: 'ANNUAL' }) })).plan, 'leave_makeup');
    assert.equal(tag(input('2026-11-07', { schedule: sched({ scheduleType: 'ISAT', status: 'ON_LEAVE', requestType: 'ISAT' }) })).plan, 'isat');
  });
  it('Chủ nhật có khung OT là ngày OT, có khung bù là ngày làm bù, không có là nghỉ', () => {
    const ot = tag(input('2026-11-08', { otWindows: [{ start: '08:00', end: '12:00' }] }));
    assert.equal(ot.plan, 'ot');
    assert.deepEqual(ot.extras, [{ code: 'ot', text: 'OT 08:00–12:00' }]);
    const mk = tag(input('2026-11-08', { makeupWindows: [{ start: '08:00', end: '12:00' }] }));
    assert.equal(mk.plan, 'makeup');
    assert.equal(mk.extras[0].text, 'Làm bù 08:00–12:00');
    assert.equal(tag(input('2026-11-08')).plan, 'rest');
  });
  it('ngày làm có OT hoặc nửa ca hoặc đổi ca thì thêm nhãn phụ', () => {
    const t = tag(input('2026-11-03', { otWindows: [{ start: '18:00', end: '20:00' }], halfShift: { half: 'FIRST', requestId: 'h', start: '08:00', end: '12:00' } as any }));
    assert.deepEqual(t.extras.map(e => e.code), ['ot', 'half']);
    const sc = tag(input('2026-11-03', { schedule: sched({ scheduleType: 'SHIFT_CHANGE', shiftType: 'NIGHT', start: '22:00', end: '06:00' }) }));
    assert.ok(sc.extras.some(e => e.code === 'shift_change'));
    assert.equal(sc.shift, 'Đêm 22:00–06:00');
  });
  it('đơn đang chờ duyệt chỉ đánh dấu, không đổi loại ngày', () => {
    const pending: Claim = { requestId: 'p', date: '2026-11-03', kind: 'LEAVE', status: 'PENDING', detail: { kind: 'LEAVE', leaveType: null } };
    const t = tag(input('2026-11-03'), clean, [pending]);
    assert.equal(t.plan, 'work');
    assert.equal(t.requestPending, true);
  });
});

describe('tagOf: kết quả chấm công', () => {
  it('ngày đã qua, sạch, có mặt: hợp lệ', () => assert.equal(tag(input('2026-11-03')).review, 'valid'));
  it('ngày chưa tới hoặc không có mặt: chưa xét', () => {
    assert.equal(tag(input('2026-11-09')).review, 'none');
    assert.equal(tag(input('2026-11-03'), { ...clean, worked: false }).review, 'none');
  });
  it('có mã ảnh hưởng tiền: cần giải trình → chờ duyệt → duyệt / từ chối / quá hạn', () => {
    assert.equal(tag(input('2026-11-03'), late('none')).review, 'needs_explanation');
    assert.equal(tag(input('2026-11-03'), late('pending')).review, 'pending');
    assert.equal(tag(input('2026-11-03'), late('approved')).review, 'approved');
    assert.equal(tag(input('2026-11-03'), late('rejected')).review, 'rejected');
    assert.equal(tag(input('2026-11-03'), late('expired')).review, 'expired');
  });
  it('ngày nghỉ và ngày lễ không có kết quả để xét', () => {
    assert.equal(tag(input('2026-11-03', { isHoliday: true })).review, 'none');
    assert.equal(tag(input('2026-11-03', { schedule: sched({ status: 'ON_LEAVE', requestType: 'LEAVE', leaveType: 'ANNUAL' }) }), late('none')).review, 'none');
  });
  it('dòng text gộp đủ ý', () => {
    assert.equal(tag(input('2026-11-03')).text, 'Ngày làm · HC 08:00–17:00 · Hợp lệ');
  });
});

describe('tagOf: đơn chờ, bị từ chối, bị huỷ', () => {
  const claim = (status: Claim['status'], kind: Claim['kind'] = 'LEAVE'): Claim => ({
    requestId: 'r', date: '2026-11-10', kind, status, detail: { kind: 'LEAVE', leaveType: null } as any
  });
  const notYet: DayResult = { explanationStatus: 'none', cases: [], worked: false, checkedIn: false };

  it('đơn chờ duyệt: viền vàng và chữ nói rõ loại đơn', () => {
    const t = tag(input('2026-11-10'), notYet, [claim('PENDING')]);
    assert.equal(t.requestPending, true);
    assert.equal(t.declined, null);
    assert.match(t.text, /Đơn nghỉ chờ duyệt/);
  });
  it('đơn bị từ chối hoặc huỷ, chưa chấm công: ngày vẫn là ngày làm nhưng có dấu đỏ', () => {
    const rej = tag(input('2026-11-10'), notYet, [claim('REJECTED')]);
    assert.equal(rej.plan, 'work');
    assert.deepEqual(rej.declined, { status: 'rejected', text: 'Đơn nghỉ bị từ chối' });
    assert.match(rej.text, /Đơn nghỉ bị từ chối/);
    const can = tag(input('2026-11-10'), notYet, [claim('CANCELLED', 'OT_WINDOW')]);
    assert.deepEqual(can.declined, { status: 'cancelled', text: 'Đơn làm thêm đã huỷ' });
  });
  it('đã chấm công thì nhãn từ chối được thay bằng kết quả đi làm', () => {
    const t = tag(input('2026-11-03'), clean, [{ ...claim('REJECTED'), date: '2026-11-03' }]);
    assert.equal(t.declined, null);
    assert.equal(t.review, 'valid');
  });
  it('ngày đã có đơn mới chờ duyệt hoặc đã duyệt thì đơn cũ bị từ chối không hiện nữa', () => {
    assert.equal(tag(input('2026-11-10'), notYet, [claim('REJECTED'), claim('PENDING')]).declined, null);
    const approved = tag(input('2026-11-10', { schedule: sched({ status: 'ON_LEAVE', requestType: 'LEAVE', leaveType: 'ANNUAL' }) }), notYet, [claim('REJECTED')]);
    assert.equal(approved.declined, null);
    assert.equal(approved.plan, 'leave_paid');
  });
});
