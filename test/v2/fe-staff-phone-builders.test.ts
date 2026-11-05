import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  attendanceViewOf,
  dayDetailOf,
  homeViewOf,
  incomeViewOf,
  profileViewOf,
  requestDetailOf,
  requestRowOf,
  workedText
} from '../../web/src/builders/api/staff-phone';

const req = (over: Record<string, unknown>) => ({ id: 'r1', status: 'PENDING', createdAt: '2026-11-03T13:14:00Z', reviewedAt: null, reason: 'Việc nhà', ...over });

describe('App nhân viên từ /me', () => {
  it('formats worked minutes', () => {
    assert.equal(workedText(101), '1g 41p');
    assert.equal(workedText(0), '0g 0p');
  });

  it('maps a request to its row', () => {
    assert.deepEqual(requestRowOf(req({ type: 'LEAVE', leaveType: 'ANNUAL', leaveStartDate: '2026-10-12' }) as any), {
      id: 'r1', icon: 'leave', title: 'Phép năm 12/10', status: 'pend', statusText: 'Chờ duyệt', month: '2026-10'
    });
    const adv = requestRowOf(req({ type: 'ADVANCE', status: 'APPROVED', advanceAmount: 1_500_000, advancePeriod: '2026-09' }) as any);
    assert.equal(adv.title, 'Tạm ứng 1.500.000 ₫');
    assert.equal(adv.icon, 'coin');
    assert.equal(adv.status, 'done');
    const cancelled = requestRowOf(req({ type: 'EXPLANATION', status: 'CANCELLED', explanationDate: '2026-10-27' }) as any);
    assert.deepEqual([cancelled.title, cancelled.status, cancelled.statusText], ['Giải trình 27/10', 'cancel', 'Đã huỷ']);
  });

  it('builds the request detail with steps in Vietnam time', () => {
    const d = requestDetailOf(
      req({ type: 'EXPLANATION', explanationDate: '2026-10-27', actualCheckOut: '17:30' }) as any,
      [{ label: 'Đã gửi', at: '2026-11-03T13:14:00Z', state: 'done' }, { label: 'Chờ duyệt', at: null, state: 'pend' }]
    );
    assert.equal(d.kindLabel, 'Giải trình');
    assert.deepEqual(d.steps[0], { label: 'Đã gửi', at: '03/11 20:14', state: 'done' });
    assert.ok(d.facts.some(([k, v]) => k === 'Giờ ra khai' && v === '17:30'));
    assert.ok(d.facts.some(([k, v]) => k === 'Lý do' && v === '“Việc nhà”'));
  });

  // BUG-requests-12: hộp từ chối của Admin hứa "Nhân viên xem được ghi chú trong chi tiết yêu cầu"; /me trả reviewNote.
  it('shows the Admin note on the reviewed step', () => {
    const sent = { label: 'Đã gửi', at: '2026-11-03T13:14:00Z', state: 'done' as const };
    const rejected = requestDetailOf(
      req({ type: 'LEAVE', status: 'REJECTED', leaveType: 'ANNUAL', leaveStartDate: '2026-11-12', reviewNote: ' Tuần này đang chốt dự án ', reviewedAt: '2026-11-04T02:00:00Z' }) as any,
      [sent, { label: 'Đã từ chối', at: '2026-11-04T02:00:00Z', state: 'rej' }]
    );
    assert.deepEqual(rejected.steps[1].note, { label: 'Lý do từ chối', text: '“Tuần này đang chốt dự án”' });
    assert.equal(rejected.steps[0].note, undefined);

    const approved = requestDetailOf(
      req({ type: 'OVERTIME', status: 'APPROVED', otDate: '2026-11-12', reviewNote: 'Nhớ chấm công ra', reviewedAt: '2026-11-04T02:00:00Z' }) as any,
      [sent, { label: 'Đã duyệt', at: '2026-11-04T02:00:00Z', state: 'done' }]
    );
    assert.deepEqual(approved.steps[1].note, { label: 'Ghi chú', text: '“Nhớ chấm công ra”' });

    const noNote = requestDetailOf(
      req({ type: 'LEAVE', status: 'REJECTED', leaveType: 'ANNUAL', leaveStartDate: '2026-11-12', reviewNote: '  ' }) as any,
      [sent, { label: 'Đã từ chối', at: null, state: 'rej' }]
    );
    assert.equal(noNote.steps[1].note, undefined);
  });

  const slip = {
    grossIncome: 15_538_183, baseSalaryActual: 11_076_923, paidLeavePay: 923_076, isatPay: 0, holidayPay: 0, totalAllowanceActual: 2_215_384,
    kpiActualPay: 1_322_800, kpiProposedAmount: 2_000_000, kpiMaxSalary: 3_000_000, kpiTotalScorePct: 66.14,
    kpiScores: { wework: 62, user: 70, peer: 68, manager: 65, self: 75 }
  };

  it('builds the income view from an estimate without insurance or tax lines', () => {
    // /me/income tạm tính: BE đã bỏ bảo hiểm và thuế, chỉ trừ tạm ứng đã duyệt.
    const v = incomeViewOf({
      month: '2026-11',
      state: 'estimate',
      payslip: { ...slip, insuranceDeduction: 0, personalIncomeTax: 0, advanceDeduction: 500_000, netIncome: 15_038_183 }
    } as any);
    assert.equal(v.state, 'Tạm tính');
    assert.equal(v.label, 'Tháng 11/2026');
    assert.equal(v.net, '15.038.183');
    assert.equal(v.total, '15.038.183 ₫');
    assert.equal(v.deduction, '500.000');
    assert.equal(v.kpi.percent, '66,14%');
    assert.equal(v.kpi.ratio, 0.6614);
    // BUG-payroll-13: tạm ứng đã duyệt là một dòng âm, để các khoản cộng lại ra đúng Thực nhận.
    assert.deepEqual(v.lines.map(l => l.label), ['Lương ngày công', 'Nghỉ phép, iSAT', 'Phụ cấp', 'Lương KPI', 'Tạm ứng']);
    assert.equal(v.lines.find(l => l.label === 'Tạm ứng')?.value, '−500.000');
  });

  it('an official payslip keeps the insurance and tax lines', () => {
    const v = incomeViewOf({
      month: '2026-10',
      state: 'official',
      payslip: { ...slip, insuranceDeduction: 1_260_000, personalIncomeTax: 0, advanceDeduction: 0, netIncome: 14_278_183 }
    } as any);
    assert.equal(v.state, 'Chính thức');
    assert.equal(v.deduction, '1.260.000');
    assert.deepEqual(v.lines.find(l => l.label === 'Bảo hiểm bắt buộc'), { icon: 'shield', label: 'Bảo hiểm bắt buộc', value: '−1.260.000', zero: false });
    assert.deepEqual(v.lines.find(l => l.label === 'Thuế TNCN'), { icon: 'coin', label: 'Thuế TNCN', value: '0', zero: true });
  });

  it('shows an unavailable income without numbers', () => {
    const v = incomeViewOf({ month: '2026-11', state: 'unavailable', payslip: null, reason: 'Thiếu cấu hình' } as any);
    assert.equal(v.net, '—');
    assert.equal(v.review, 'Thiếu cấu hình');
  });

  it('builds the profile', () => {
    const p = profileViewOf({
      name: 'Lê Hoàng Nam', username: 'nam', dependants: 0,
      contract: { status: 'nv', term: 'long', effectiveFrom: '2024-03-04' },
      position: { type: 'nv', level: 2, jobTitle: 'Nhân viên kinh doanh' },
      shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' },
      leave: { totalDays: 12, usedDays: 1, remainingDays: 11 }
    } as any);
    assert.equal(p.initials, 'HN');
    assert.equal(p.contract, 'Chính thức');
    assert.ok(!('email' in p), 'BE không có email: màn Tôi không có dòng email');
    assert.deepEqual(Object.fromEntries(p.facts), {
      'Tên đăng nhập': 'nam', 'Chức danh': 'Nhân viên kinh doanh', 'Loại · bậc': 'NV · Bậc 2',
      'Ca làm': 'HC 08:00–17:00', 'Ngày vào làm': '04/03/2024', 'Phép năm còn lại': '11 ngày'
    });
  });

  it('builds the month grid with leading blanks', () => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const date = `2026-11-${String(i + 1).padStart(2, '0')}`;
      return { date, kind: i === 1 ? 'work' : i === 0 ? 'off' : 'future', in: i === 1 ? '07:55' : null, out: i === 1 ? '17:05' : null, lateMinutes: 0 };
    });
    const v = attendanceViewOf({ month: '2026-11', totals: { workDays: 1, standardDays: 25, lateCount: 0, paidLeaveDays: 0 }, days } as any, 'HC 08:00–17:00', '2026-11-05');
    assert.equal(v.label, 'Tháng 11/2026');
    assert.equal(v.cells.filter(c => c === null).length, 6); // 01/11/2026 là Chủ nhật
    assert.deepEqual(v.tiles[0], { value: '1', of: '25', label: 'Ngày công' });
    assert.equal(v.recent.length, 1);
    assert.equal(v.recent[0].times, '07:55 – 17:05');
  });

  // Máy chủ cũ chưa gửi reminders / due / explanation: màn nhận giá trị rỗng, không có dòng nhắc, không có nút.
  it('gives no reminders and no due day when the server sends none', () => {
    const day = (date: string) => ({ date, kind: 'work' as const, in: '07:59', out: null, lateMinutes: 0 });
    const week = ['26', '27', '28', '29', '30', '31'].map(d => day(`2026-10-${d}`)).concat(day('2026-11-01'));
    const profile = {
      name: 'Lê Hoàng Nam', username: 'nam', dependants: 0,
      contract: { status: 'nv', term: 'long', effectiveFrom: '2024-03-04' },
      position: { type: 'nv', level: 2, jobTitle: null },
      shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' },
      leave: { totalDays: 12, usedDays: 1, remainingDays: 11 }
    };
    const today = { date: '2026-10-28', shift: null, punches: { in: '07:59', out: null }, workedMinutes: 101, week, alert: null };
    assert.deepEqual(homeViewOf(today, profile, null, [], '09:40').reminders, []);
    const d = dayDetailOf({ ...day('2026-10-27'), shift: null }, { start: '08:00', end: '17:00' }, '2026-10-28', '09:40');
    assert.equal(d?.due, null);
  });

  describe('nhắc giải trình, ngày cần giải trình và đơn chờ duyệt từ máy chủ', () => {
    const day = (date: string) => ({ date, kind: 'work' as const, in: '07:59', out: null, lateMinutes: 0 });
    const week = ['26', '27', '28', '29', '30', '31'].map(d => day(`2026-10-${d}`)).concat(day('2026-11-01'));
    const profile = {
      name: 'Lê Hoàng Nam', username: 'nam', dependants: 0,
      contract: { status: 'nv', term: 'long', effectiveFrom: '2024-03-04' },
      position: { type: 'nv', level: 2, jobTitle: null },
      shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' },
      leave: { totalDays: 12, usedDays: 1, remainingDays: 11 }
    };
    const today = { date: '2026-10-28', shift: null, punches: { in: '07:59', out: null }, workedMinutes: 101, week, alert: null };
    const detail = (over: Record<string, unknown>, date = '2026-10-27') =>
      dayDetailOf({ ...day(date), shift: null, ...over } as any, { start: '08:00', end: '17:00' }, '2026-10-28', '09:40')!;

    it('turns /me/today reminders into one line per day, newest first as the server sends them', () => {
      const reminders = [
        { date: '2026-10-24', remindedAt: '2026-10-27T02:40:00.000Z' },
        { date: '2026-10-22', remindedAt: '2026-10-26T02:40:00.000Z' }
      ];
      assert.deepEqual(homeViewOf({ ...today, reminders } as any, profile, null, [], '09:40').reminders, [
        { date: '2026-10-24', text: 'Admin nhắc giải trình 24/10' },
        { date: '2026-10-22', text: 'Admin nhắc giải trình 22/10' }
      ]);
    });

    it('keeps the due object of /me/attendance/:date as it is, and null when the day needs no explanation', () => {
      const due = { cases: ['MISSING_CHECK_OUT'], needs: { checkIn: false, checkOut: true }, remindedAt: null };
      assert.deepEqual(detail({ due }).due, due);
      assert.equal(detail({ due: null }).due, null);
    });

    it('fills the claim only while the explanation is pending', () => {
      const explanation = (over: Record<string, unknown>) => ({
        id: 'e1', status: 'PENDING', sentAt: '2026-10-27T13:14:00.000Z', cases: ['MISSING_CHECK_OUT'],
        actualCheckIn: null, actualCheckOut: '17:30', ...over
      });
      // Gửi ngay trong ngày (giờ Việt Nam 20:14 ngày 27/10): chỉ giờ.
      assert.deepEqual(detail({ explanation: explanation({}) }).claim, { sentAt: '20:14', outClaim: '17:30' });
      // Gửi ngày khác (09:40 ngày 28/10 cho ngày 27/10): thêm ngày gửi.
      assert.deepEqual(detail({ explanation: explanation({ sentAt: '2026-10-28T02:40:00.000Z', actualCheckOut: null }) }).claim, {
        sentAt: '09:40 28/10',
        outClaim: null
      });
      // Gửi sau nửa đêm giờ Việt Nam nhưng còn là ngày hôm trước theo UTC: ngày gửi tính theo giờ Việt Nam.
      assert.equal(detail({ explanation: explanation({ sentAt: '2026-10-27T17:30:00.000Z' }) }).claim?.sentAt, '00:30 28/10');
      assert.equal(detail({ explanation: explanation({ status: 'APPROVED' }) }).claim, null);
      assert.equal(detail({ explanation: explanation({ status: 'REJECTED' }) }).claim, null);
      assert.equal(detail({ explanation: null }).claim, null);
    });
  });

  // Tháng 11/2026: 01/11 là Chủ nhật; ngày 02, 03, 04 là ba loại nghỉ của bảng công.
  const novDays = () =>
    Array.from({ length: 30 }, (_, i) => {
      const date = `2026-11-${String(i + 1).padStart(2, '0')}`;
      const leave = ({ 1: 'paid', 2: 'unpaid', 3: 'holiday' } as Record<number, string>)[i];
      return { date, kind: i === 0 ? 'off' : leave ? 'leave' : 'future', ...(leave ? { leave } : {}), in: null, out: null, lateMinutes: 0 };
    });
  const nov = (over: Record<string, unknown> = {}) =>
    ({ month: '2026-11', periodState: 'open', range: { from: '2024-03', to: '2026-11' }, totals: { workDays: 0, standardDays: 25, lateCount: 0, paidLeaveDays: 2 }, days: novDays(), ...over }) as any;

  it('names each kind of leave instead of calling every leave paid', () => {
    const v = attendanceViewOf(nov(), 'HC 08:00–17:00', '2026-11-05');
    const label = (date: string) => v.cells.find(c => c && c.date === date)!.label;
    assert.equal(label('2026-11-02'), 'Thứ Hai 02/11: nghỉ có lương');
    assert.equal(label('2026-11-03'), 'Thứ Ba 03/11: nghỉ không lương');
    assert.equal(label('2026-11-04'), 'Thứ Tư 04/11: nghỉ lễ');
    const unpaid = dayDetailOf({ ...novDays()[2], shift: null } as any, { start: '08:00', end: '17:00' }, '2026-11-05', '10:00')!;
    assert.deepEqual([unpaid.statusText, unpaid.leave?.type], ['Nghỉ không lương', 'Nghỉ không lương']);
    const holiday = dayDetailOf({ ...novDays()[3], shift: null } as any, { start: '08:00', end: '17:00' }, '2026-11-05', '10:00')!;
    assert.deepEqual([holiday.statusText, holiday.leave?.type], ['Nghỉ lễ', 'Nghỉ lễ']);
  });

  it('shows whether the month is still open', () => {
    assert.equal(attendanceViewOf(nov(), '', '2026-11-05').state, 'Kỳ công đang mở');
    assert.equal(attendanceViewOf(nov({ periodState: 'locked' }), '', '2026-11-05').state, 'Kỳ công đã chốt');
  });

  it('offers only the months inside the range', () => {
    const at = (month: string) => {
      const v = attendanceViewOf(nov({ month }), '', '2026-11-05');
      return [v.month, v.prev, v.next];
    };
    assert.deepEqual(at('2026-11'), ['2026-11', '2026-10', null]);
    assert.deepEqual(at('2024-03'), ['2024-03', null, '2024-04']);
    assert.deepEqual(at('2025-01'), ['2025-01', '2024-12', '2025-02']);
    const one = attendanceViewOf(nov({ range: { from: '2026-11', to: '2026-11' } }), '', '2026-11-05');
    assert.deepEqual([one.prev, one.next], [null, null]);

    const income = incomeViewOf({ month: '2026-10', state: 'unavailable', payslip: null, range: { from: '2024-03', to: '2026-11' } } as any);
    assert.deepEqual([income.month, income.prev, income.next], ['2026-10', '2026-09', '2026-11']);
  });

  it('today has no location line while the server sends no location', () => {
    const week = Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 2}`, kind: 'future', in: null, out: null, lateMinutes: 0 }));
    const h = homeViewOf(
      { date: '2026-11-05', shift: null, punches: { in: '07:59', out: null }, workedMinutes: 0, week, alert: null } as any,
      { name: 'Lê Hoàng Nam', shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' } } as any,
      null,
      [],
      '09:40'
    );
    assert.equal(h.location, null);
    assert.equal(h.checkIn, '07:59');
  });
});
