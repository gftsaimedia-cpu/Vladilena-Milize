import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  attendanceViewOf,
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
    assert.deepEqual([cancelled.title, cancelled.status, cancelled.statusText], ['Giải trình 27/10', 'rej', 'Đã huỷ']);
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

  it('builds the income view from an estimate', () => {
    const v = incomeViewOf({
      month: '2026-11',
      state: 'estimate',
      payslip: {
        netIncome: 14_278_183, grossIncome: 15_538_183, insuranceDeduction: 1_260_000, personalIncomeTax: 0, advanceDeduction: 0,
        baseSalaryActual: 11_076_923, paidLeavePay: 923_076, isatPay: 0, holidayPay: 0, totalAllowanceActual: 2_215_384,
        kpiActualPay: 1_322_800, kpiProposedAmount: 2_000_000, kpiMaxSalary: 3_000_000, kpiTotalScorePct: 66.14,
        kpiScores: { wework: 62, user: 70, peer: 68, manager: 65, self: 75 }
      }
    } as any);
    assert.equal(v.state, 'Tạm tính');
    assert.equal(v.label, 'Tháng 11/2026');
    assert.equal(v.net, '14.278.183');
    assert.equal(v.total, '14.278.183 ₫');
    assert.equal(v.deduction, '1.260.000');
    assert.equal(v.kpi.percent, '66,14%');
    assert.equal(v.kpi.ratio, 0.6614);
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
});
