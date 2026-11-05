// Hàm chuyển dữ liệu BE v2 sang dạng màn hình của FE (web/src/builders/api). Hàm thuần, chạy được bằng node:test.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { staffListFromEmployees, staffProfileFromEmployee } from '../../web/src/builders/api/staff';
import { calendarFromHolidays } from '../../web/src/builders/api/calendar';
import { inboxFromDue, inboxFromRequests } from '../../web/src/builders/api/inbox';

function employee(over: { username: string; name?: string; status?: string; from?: string | null; resigned?: string | null; locked?: boolean; job?: string | null }) {
  return {
    profile: { uuid: `u-${over.username}`, familyName: '', givenName: '', fullName: over.name ?? over.username, birthday: null, dependants: 1 },
    account: { username: over.username, roles: ['staff'], primaryRole: 'staff', isLocked: !!over.locked, lockedAt: null, lockedBy: null, createdAt: '2020-01-01T00:00:00Z' },
    contract: {
      position: { type: 'nv', level: 2, jobTitle: over.job ?? null },
      shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00', allowancePct: 0, isOvernight: false },
      leave: { totalDays: 12, usedDays: 1, remainingDays: 11 },
      status: over.status ?? 'nv',
      term: 'long',
      effectiveFrom: over.from === undefined ? '2024-03-04' : over.from,
      resignedOn: over.resigned ?? null,
      hasInsurance: true,
      isUnionMember: false,
      hasTax: true,
      canAdvance: true,
      isDormResident: false
    }
  };
}

const TODAY = '2026-11-05';

describe('Nhân sự từ /employees', () => {
  const list = [
    employee({ username: 'nam', name: 'Lê Hoàng Nam', job: 'Nhân viên kinh doanh' }),
    employee({ username: 'linh', name: 'Đỗ Mai Linh', status: 'thuviec', from: '2026-11-02' }),
    employee({ username: 'mai', name: 'Hoàng Thị Mai', locked: true }),
    employee({ username: 'quan', name: 'Trần Minh Quân', status: 'nghiviec', resigned: '2026-11-03' })
  ];

  it('maps each employee to a row with status from the contract', () => {
    const view = staffListFromEmployees(list as any, TODAY);
    assert.equal(view.total, 4);
    const by = Object.fromEntries(view.rows.map(r => [r.id, r]));
    assert.equal(by.nam.name, 'Lê Hoàng Nam');
    assert.equal(by.nam.initials, 'HN');
    assert.equal(by.nam.title, 'Nhân viên kinh doanh');
    assert.equal(by.nam.status, 'ok');
    assert.equal(by.nam.statusLabel, 'Chính thức');
    assert.equal(by.nam.joined, '2024-03-04');
    assert.equal(by.linh.status, 'try');
    assert.equal(by.mai.status, 'off');
    assert.equal(by.mai.activated, false);
    assert.equal(by.quan.status, 'out');
    assert.equal(by.nam.dept, '—');
  });

  it('counts the four stats for the current month', () => {
    const stats = Object.fromEntries(staffListFromEmployees(list as any, TODAY).stats.map(s => [s.key, s]));
    assert.equal(stats.active.value, '3'); // nam, linh, mai (khoá vẫn còn hợp đồng)
    assert.equal(stats.active.label, 'Nhân sự đang làm');
    assert.equal(stats.active.dark, true);
    assert.equal(stats.joined.label, 'Vào làm tháng 11');
    assert.equal(stats.joined.value, '1');
    assert.equal(stats.left.value, '1');
    // Cuối tháng 10 đang làm: nam, mai, quân = 3; hôm nay: nam, linh, mai = 3.
    assert.deepEqual(stats.active.delta, { dir: 'up', text: '0' });
    assert.equal(stats.active.note, 'so với tháng 10');
  });

  it('builds the profile drawer from one employee', () => {
    const p = staffProfileFromEmployee(employee({ username: 'nam', name: 'Lê Hoàng Nam', job: 'Kinh doanh' }) as any, TODAY);
    assert.equal(p.id, 'nam');
    assert.deepEqual(
      p.groups.map(g => g.title),
      ['Công việc', 'Hợp đồng', 'Tài khoản']
    );
    const facts = Object.fromEntries(p.groups.flatMap(g => g.facts.map(f => [f.label, f.value])));
    assert.equal(facts['Loại · bậc'], 'NV · Bậc 2');
    assert.equal(facts['Ca làm'], 'Hành chính · 08:00–17:00');
    assert.equal(facts['Ngày vào làm'], '04/03/2024 · 2 năm 8 tháng');
    assert.equal(facts['Loại hợp đồng'], 'HĐLĐ từ 3 tháng');
    assert.equal(facts['Đóng bảo hiểm'], 'Có');
    assert.equal(facts['Người phụ thuộc'], '1');
    assert.equal(facts['Tên đăng nhập'], 'nam');
    assert.equal(facts['Kích hoạt'], 'Đã kích hoạt');
  });
});

describe('Lịch nghỉ lễ từ /holidays', () => {
  it('joins consecutive days with the same name into one range', () => {
    const cal = calendarFromHolidays(
      [
        { date: '2026-04-30', name: 'Giải phóng miền Nam' },
        { date: '2026-05-01', name: 'Quốc tế Lao động' },
        { date: '2026-09-01', name: 'Quốc khánh' },
        { date: '2026-09-02', name: 'Quốc khánh' }
      ],
      2026
    );
    assert.equal(cal.year, 2026);
    assert.equal(cal.payDay, null);
    assert.deepEqual(cal.holidays, [
      { id: '2026-04-30', from: '2026-04-30', to: '2026-04-30', name: 'Giải phóng miền Nam' },
      { id: '2026-05-01', from: '2026-05-01', to: '2026-05-01', name: 'Quốc tế Lao động' },
      { id: '2026-09-01', from: '2026-09-01', to: '2026-09-02', name: 'Quốc khánh' }
    ]);
    assert.equal(cal.holidayDays, 4);
  });
});

describe('Việc chờ duyệt từ /requests', () => {
  const NOW = Date.parse('2026-11-05T03:00:00Z');
  const names = new Map([['nam', { name: 'Lê Hoàng Nam', title: 'Kinh doanh' }]]);
  const base = { status: 'PENDING', reason: 'Việc nhà', createdAt: '2026-11-05T00:00:00Z', employeeId: 'nam' };

  it('maps a leave request to a decide item in the leave group', () => {
    const [item] = inboxFromRequests(
      [{ ...base, id: 'r1', type: 'LEAVE', leaveType: 'ANNUAL', leaveStartDate: '2026-11-09', leaveEndDate: '2026-11-10', leaveDaysCount: 2 }] as any,
      names,
      NOW
    );
    assert.equal(item.id, 'r1');
    assert.equal(item.group, 'leave');
    assert.equal(item.groupLabel, 'Đơn nghỉ');
    assert.equal(item.action, 'decide');
    assert.equal(item.name, 'Lê Hoàng Nam');
    assert.equal(item.initials, 'HN');
    assert.equal(item.role, 'Kinh doanh');
    assert.equal(item.when, '09–10/11');
    assert.equal(item.age, '3 giờ');
    assert.deepEqual(item.days, ['2026-11-09', '2026-11-10']);
    assert.ok(item.facts.some(([k, v]) => k === 'Lý do' && v === '“Việc nhà”'));
  });

  it('groups overtime, explanation and advance requests and skips other statuses', () => {
    const items = inboxFromRequests(
      [
        { ...base, id: 'o', type: 'OVERTIME', otDate: '2026-11-04', otStartTime: '18:00', otEndTime: '20:00', otHours: 2 },
        { ...base, id: 'e', type: 'EXPLANATION', explanationDate: '2026-11-03', actualCheckIn: '08:10', actualCheckOut: null, explanationCases: [] },
        { ...base, id: 'a', type: 'ADVANCE', advanceAmount: 1500000, advancePeriod: '2026-11' },
        { ...base, id: 'x', type: 'LEAVE', status: 'APPROVED', leaveStartDate: '2026-11-01', leaveEndDate: '2026-11-01' }
      ] as any,
      new Map(),
      NOW
    );
    assert.deepEqual(items.map(i => [i.id, i.group]), [['o', 'ot'], ['e', 'exp'], ['a', 'adv']]);
    assert.equal(items[2].name, 'nam'); // không có hồ sơ thì dùng tên đăng nhập
    assert.equal(items[2].head, 'Tạm ứng · 1.500.000 ₫');
  });
});

import { payrollScreenFromPayslips } from '../../web/src/builders/api/payroll';

describe('Bảng lương từ /payroll/:month', () => {
  const details = (over: Record<string, unknown> = {}) => ({
    employeeId: 'u-nam', username: 'nam', fullName: 'Lê Hoàng Nam', positionLevelText: 'NV bậc 2', standardWorkdays: 26,
    actualWorkDays: 24, baseSalaryPolicy: 8_000_000, baseSalaryActual: 7_384_615, kpiApplicable: true,
    kpiScores: { wework: 80, user: null, peer: 70, manager: 90, self: null }, kpiActualPay: 1_000_000,
    totalAllowanceActual: 500_000, otPayTotal: 300_000, lateEarlyDeductionAmount: 50_000, grossIncome: 9_134_615,
    insuranceDeduction: 840_000, personalIncomeTax: 0, advanceDeduction: 1_000_000, netIncome: 7_294_615, ...over
  });
  const record = (over: Record<string, unknown> = {}, d: Record<string, unknown> = {}) => ({
    id: 1, runId: 3, username: 'nam', status: 'draft', gross: 9_134_615, insurance: 840_000, tax: 0, advance: 1_000_000,
    net: 7_294_615, warnings: [], details: details(d), ...over
  });

  it('is empty when the month has no payslip', () => {
    assert.deepEqual(payrollScreenFromPayslips([], '2026-10'), { month: '2026-10', empty: true });
  });

  it('maps lines, counts and totals', () => {
    const screen: any = payrollScreenFromPayslips(
      [record(), record({ id: 2, username: 'ha', status: 'final', gross: 1_000_000, insurance: 0, tax: 0, advance: 0, net: 1_000_000 }, { username: 'ha', fullName: 'Nguyễn Thu Hà', kpiApplicable: false })],
      '2026-10'
    );
    assert.equal(screen.empty, false);
    assert.equal(screen.range, '01–31/10');
    const nam = screen.lines.find((l: any) => l.id === 'nam');
    assert.deepEqual(
      { name: nam.name, initials: nam.initials, title: nam.title, base: nam.base, days: nam.days, standard: nam.standard, workPay: nam.workPay, kpiPay: nam.kpiPay, allowance: nam.allowance, ot: nam.ot, lateCut: nam.lateCut, net: nam.net, status: nam.status },
      { name: 'Lê Hoàng Nam', initials: 'HN', title: 'NV bậc 2', base: 8_000_000, days: 24, standard: 26, workPay: 7_384_615, kpiPay: 1_000_000, allowance: 500_000, ot: 300_000, lateCut: 50_000, net: 7_294_615, status: 'draft' }
    );
    assert.deepEqual(nam.kpiMissing, ['Người dùng', 'Tự đánh giá']);
    assert.deepEqual(screen.lines.find((l: any) => l.id === 'ha').kpiMissing, []);
    assert.equal(screen.lines.find((l: any) => l.id === 'ha').status, 'done');
    const decided: any = payrollScreenFromPayslips([record({ status: 'approved' }), record({ id: 3, username: 'x', status: 'rejected' }, { username: 'x' })], '2026-10');
    assert.deepEqual(decided.lines.map((l: any) => l.status).sort(), ['done', 'rejected']);
    assert.deepEqual(screen.counts, { all: 2, draft: 1, pending: 0, done: 1, rejected: 0 });
    assert.deepEqual(screen.totals, { gross: 10_134_615, insurance: 840_000, tax: 0, advance: 1_000_000, deductions: 1_840_000, net: 8_294_615, netShare: 82 });
  });
});

import { periodStripFromPeriod } from '../../web/src/builders/api/period';

describe('Thanh kỳ lương từ /system/periods', () => {
  it('a month without a period row is still in attendance', () => {
    assert.deepEqual(periodStripFromPeriod(null, '2026-11'), {
      month: 'Tháng 11/2026',
      state: 'Đang chấm công',
      stateCls: 'draft',
      steps: [['cur', 'Chấm công'], ['', 'Chốt công'], ['', 'Chấm KPI'], ['', 'Tính lương'], ['', 'Phê duyệt'], ['', 'Trả lương']]
    });
  });

  it('marks finished steps from the period timestamps', () => {
    const strip = periodStripFromPeriod(
      { month: '2026-10', status: 'calculated', attendance_locked_at: 'a', calculated_at: 'b', approved_at: null, paid_at: null } as any,
      '2026-10'
    );
    assert.equal(strip.state, 'Chờ phê duyệt');
    assert.deepEqual(strip.steps.map(s => s[0]), ['done', 'done', 'done', 'done', 'cur', '']);
  });

  it('a paid month is all done', () => {
    const strip = periodStripFromPeriod(
      { month: '2026-09', status: 'paid', attendance_locked_at: 'a', calculated_at: 'b', approved_at: 'c', paid_at: 'd' } as any,
      '2026-09'
    );
    assert.equal(strip.state, 'Đã trả lương');
    assert.equal(strip.stateCls, 'ok');
    assert.ok(strip.steps.every(s => s[0] === 'done'));
  });
});

import { payslipFromRecord } from '../../web/src/builders/api/payroll';

describe('Phiếu lương chi tiết từ /payroll/:month/:username', () => {
  const line = (date: string, shiftCode: string, workHours = 8) => ({ date, shiftCode, workHours });
  const rec = {
    id: 9, username: 'nam', status: 'draft', gross: 9_000_000, insurance: 840_000, tax: 10_000, advance: 0, net: 8_150_000,
    details: {
      fullName: 'Lê Hoàng Nam', positionLevelText: 'NV bậc 2', contractStatusText: 'Chính thức', month: '2026-11',
      standardWorkdays: 26, actualWorkDays: 3, paidLeaveDays: 1, holidayPaidDays: 0, isatDays: 0, unpaidLeaveDays: 1,
      baseSalaryPolicy: 8_000_000, baseSalaryActual: 923_077, paidLeavePay: 307_692, holidayPay: 0, leaveSettlementPay: 0, isatPay: 0,
      ot15Hours: 2, ot20Hours: 0, ot30Hours: 0, otPayTotal: 138_462, lateEarlyHours: 0.5, lateEarlyDeductionAmount: 19_231,
      attendanceAllowancePolicy: 500_000, attendanceAllowanceActual: 0, travelAllowancePolicy: 300_000, travelAllowanceActual: 300_000,
      flexAllowancePolicy: 0, flexAllowanceActual: 0, offPaidNightPolicy: 0, offPaidNightActual: 0, nightAllowancePolicy: 0, nightAllowanceActual: 0,
      totalAllowanceActual: 300_000, kpiApplicable: true, kpiScores: { wework: 80, user: null, peer: 70, manager: 90, self: 60 },
      kpiTotalScorePct: 64.4, kpiProposedAmount: 2_000_000, kpiMaxSalary: 3_000_000, kpiActualPay: 1_288_000,
      grossIncome: 9_000_000, taxExemptIncome: 0, taxableIncome: 8_000_000, insuranceDeduction: 840_000, incomeAfterInsurance: 8_160_000,
      personalIncomeTax: 10_000, advanceDeduction: 0, netIncome: 8_150_000, dependants: 1, remainingAnnualLeaveDays: 11,
      dailyLines: [line('2026-11-02', 'NORMAL'), line('2026-11-03', 'FLEX'), line('2026-11-04', 'LEAVE', 0), line('2026-11-05', 'UNPAID', 0)]
    }
  };

  it('maps the money and the KPI from the stored payslip', () => {
    const s: any = payslipFromRecord(rec as any, '2026-11-05');
    assert.equal(s.id, 'nam');
    assert.equal(s.name, 'Lê Hoàng Nam');
    assert.equal(s.contract, 'Chính thức');
    assert.equal(s.status, 'draft');
    assert.deepEqual(s.days, { work: 3, leave: 1, isat: 0, pending: 0, unpaid: 1, standard: 26 });
    assert.deepEqual(s.ot, { hours: [2, 0, 0], pay: 138_462 });
    assert.deepEqual(s.late, { minutes: [], hours: 0.5, cut: 19_231 });
    assert.deepEqual(s.allowances.map((a: any) => [a.label, a.rule, a.actual]).slice(0, 2), [['Chuyên cần', 500_000, 0], ['Đi lại', 300_000, 300_000]]);
    assert.deepEqual(s.kpi.scores, { wework: 80, user: null, peer: 70, manager: 90, self: 60 });
    assert.equal(s.kpi.proposal, 2_000_000);
    assert.deepEqual(s.calc.kpiMissing, ['user']);
    assert.equal(s.calc.gross, 9_000_000);
    assert.equal(s.calc.net, 8_150_000);
    assert.equal(s.calc.workPay, 923_077 + 307_692);
    assert.equal(s.leaveLeft, 11);
  });

  it('builds one calendar cell per day of the month', () => {
    const s: any = payslipFromRecord(rec as any, '2026-11-05');
    assert.equal(s.calendar.length, 30);
    assert.deepEqual(s.calendar.slice(0, 7), ['sunday', 'work', 'work', 'leave', 'unpaid', 'future', 'future']);
  });
});

import { attendanceFromTimesheets, gridFromOf } from '../../web/src/builders/api/attendance';

describe('Chấm công Admin từ /attendance/timesheets', () => {
  const emp = employee({ username: 'nam', name: 'Lê Hoàng Nam', job: 'Kinh doanh' });
  const ts = (workDate: string, over: Record<string, unknown> = {}) => ({
    employeeId: 'u-nam', workDate, shiftType: 'NORMAL', shiftStartTime: '08:00', shiftEndTime: '17:00',
    actualCheckIn: '07:55', actualCheckOut: '17:05', status: 'PRESENT', checkInStatus: 'ON_TIME', checkOutStatus: 'ON_TIME',
    metrics: { lateMinutes: 0, earlyLeaveMinutes: 0, otHours: 0, workHours: 8 }, ...over
  });

  it('starts the grid on the Monday two weeks before today', () => {
    assert.equal(gridFromOf('2026-11-05'), '2026-10-19');
  });

  it('builds cells from timesheets and marks pending items as todo', () => {
    const view: any = attendanceFromTimesheets({
      month: '2026-11',
      today: '2026-11-05',
      employees: [emp] as any,
      timesheets: [
        ts('2026-11-02'),
        ts('2026-11-03', { actualCheckIn: '08:20', checkInStatus: 'LATE', metrics: { lateMinutes: 20, otHours: 0 } }),
        ts('2026-11-04', { status: 'LEAVE_PAID', actualCheckIn: null, actualCheckOut: null }),
        ts('2026-11-05', { actualCheckOut: null, status: 'ABSENT' })
      ] as any,
      pending: [{ id: 'r1', personId: 'nam', days: ['2026-11-03'], group: 'exp', what: 'Giải trình' }] as any
    });
    assert.equal(view.days.length, 28);
    assert.equal(view.days[0].iso, '2026-10-19');
    const row = view.rows[0];
    assert.equal(row.person.name, 'Lê Hoàng Nam');
    const at = (d: string) => row.cells.find((c: any) => c.date === d);
    assert.equal(at('2026-11-02').kind, 'work');
    assert.equal(at('2026-11-02').text, '07:55–17:05');
    assert.equal(at('2026-11-03').base, 'late');
    assert.equal(at('2026-11-03').kind, 'todo');
    assert.equal(at('2026-11-03').itemId, 'r1');
    assert.equal(at('2026-11-04').kind, 'leave');
    assert.equal(at('2026-11-05').kind, 'work');
    assert.equal(at('2026-11-05').live, true);
    assert.equal(at('2026-11-06').kind, 'fu');
    assert.equal(at('2026-11-01').kind, 'off'); // Chủ nhật
    assert.equal(at('2026-10-30').kind, 'absent');
    assert.equal(view.pending.length, 1);
    assert.equal(view.total, 1);
    assert.equal(row.person.lateCount, 1);
  });

  // BUG-requests-9: việc chờ duyệt từ /requests mang personId = uuid (employeeId của đơn), còn người trên lưới khoá theo
  // tên đăng nhập. Hai bên phải khớp, nếu không Cần xử lý luôn trống và lưới không tô ô "cần xử lý".
  it('matches pending items keyed by the employee uuid', () => {
    const view: any = attendanceFromTimesheets({
      month: '2026-11',
      today: '2026-11-05',
      employees: [emp] as any,
      timesheets: [ts('2026-11-03', { actualCheckIn: '08:20', checkInStatus: 'LATE', metrics: { lateMinutes: 20, otHours: 0 } })] as any,
      pending: [{ id: 'r1', personId: emp.profile.uuid, days: ['2026-11-03'], group: 'exp', what: 'Giải trình' }] as any
    });
    assert.equal(emp.profile.uuid, 'u-nam');
    assert.equal(view.pending.length, 1);
    assert.equal(view.pending[0].person.name, 'Lê Hoàng Nam');
    assert.equal(view.total, 1);
    const cell = view.rows[0].cells.find((c: any) => c.date === '2026-11-03');
    assert.equal(cell.kind, 'todo');
    assert.equal(cell.itemId, 'r1');
  });

  // Như mock: ô Cần xử lý đếm mọi ngày có việc, ghi chú tách ngày chưa giải trình (Admin nhắc) khỏi yêu cầu chờ duyệt.
  it('splits days to explain from requests to decide in the Cần xử lý tile', () => {
    const view: any = attendanceFromTimesheets({
      month: '2026-11',
      today: '2026-11-05',
      employees: [emp] as any,
      timesheets: [ts('2026-11-02'), ts('2026-11-03')] as any,
      pending: [
        { id: 'r1', personId: 'u-nam', days: ['2026-11-03'], group: 'exp', action: 'decide', what: 'Giải trình' },
        { id: 'due:u-nam:2026-11-02', personId: 'u-nam', days: ['2026-11-02'], group: 'att', action: 'remind', what: 'Đi muộn' }
      ] as any
    });
    const todo = view.tiles.find((t: any) => t.key === 'todo');
    assert.equal(todo.value, '2');
    assert.equal(todo.note, '1 chưa giải trình · 1 yêu cầu chờ duyệt');
  });
});

import { positionsResponseFromCatalog } from '../../web/src/builders/api/catalog';

describe('Chức vụ và bậc từ /employees/meta/positions', () => {
  const type = (over: Record<string, unknown>) => ({
    id: 1, code: 'nv', effective_month: '2000-01', name: 'Nhân viên', workdays: 26, flex_pct: 20, night_pct: 40, travel_pct: 5,
    attendance_pct: 5, regular_dows: '[1,2,3,4,5,6]', makeup_dows: '[0]', rev: 1, levels: [], ...over
  });
  const level = (level_no: number, effective_month: string, base_salary: number) => ({
    type_code: 'nv', level_no, effective_month, name: `Bậc ${level_no}`, base_salary, kpi_max: 3_000_000, night_pct: null, rev: 1
  });

  it('keeps the row in force for the month, for types and levels', () => {
    const res = positionsResponseFromCatalog(
      [
        type({ levels: [level(1, '2000-01', 6_000_000), level(1, '2026-12', 7_000_000), level(2, '2000-01', 8_000_000)] }),
        type({ id: 2, effective_month: '2026-12', workdays: 24 })
      ],
      '2026-11'
    );
    assert.equal(res.month, '2026-11');
    assert.equal(res.positions.length, 1);
    const p = res.positions[0];
    assert.equal(p.workdays, 26);
    assert.equal(p.flexPct, 20);
    assert.deepEqual(p.regularDows, [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(p.levels.map((l: any) => [l.level, l.baseSalary]), [[1, 6_000_000], [2, 8_000_000]]);
  });

  it('passes the six benefit keys and the ticks of each type', () => {
    const res = positionsResponseFromCatalog([type({ benefits: { makeup: true } })], '2026-11');
    assert.deepEqual(res.benefits, ['kpi', 'idorm', 'leaveAccount', 'isat', 'ot', 'makeup']);
    assert.equal((res.positions[0].benefits as Record<string, boolean>).makeup, true);
  });
});

import {
  benefitChanges,
  benefitsViewFromCatalog,
  headcountFromEmployees,
  mergeStale,
  type BenefitsView
} from '../../web/src/builders/api/benefits';

describe('Chế độ theo loại từ /employees/meta/positions', () => {
  const row = (code: string, name: string, over: Record<string, unknown> = {}) => ({
    id: 0, code, effective_month: '2000-01', name, workdays: 26, flex_pct: 10, night_pct: 30, travel_pct: 0, attendance_pct: 0,
    regular_dows: '[1,2,3,4,5,6]', rev: 0, levels: [], benefits: {}, ...over
  });
  const NV = { id: 2, flex_pct: 20, night_pct: 40, travel_pct: 15, attendance_pct: 25, rev: 3, benefits: { makeup: true, idorm: true } };
  const rows: any[] = [
    row('tts', 'Thực tập sinh', { id: 3, workdays: 22 }),
    row('ctv', 'Chuyên trách viên', { id: 1 }),
    row('nv', 'Nhân viên', NV),
    row('nv', 'Nhân viên', { ...NV, id: 4, effective_month: '2026-12', flex_pct: 25, rev: 0 })
  ];
  const headcount = { tts: 4, ctv: 3, nv: 12 };
  const nvOf = (v: BenefitsView) => v.types.find(t => t.code === 'nv')!;
  const withNv = (v: BenefitsView, patch: (t: BenefitsView['types'][number]) => void) => {
    const copy = structuredClone(v);
    patch(nvOf(copy));
    return copy;
  };
  const base = () => benefitsViewFromCatalog(rows, '2026-11', headcount);

  it('builds one row per type', () => {
    const view = base();
    assert.deepEqual(view.types.map(t => [t.code, t.count]), [['tts', 4], ['ctv', 3], ['nv', 12]]);
    assert.deepEqual(view.types.map(t => t.key), ['thuc-tap-sinh', 'chuyen-trach', 'nhan-vien']);
    assert.equal(nvOf(view).name, 'Nhân viên');
    assert.equal(nvOf(view).values.flexPct, 20);
    assert.equal(nvOf(view).values.idorm, true);
    assert.equal(nvOf(view).values.kpi, false);
    assert.equal(nvOf(view).req.makeup, true);
    assert.equal(nvOf(view).nightByPerson, true);
    assert.equal(view.types[0].nightByPerson, false);
    assert.deepEqual(view.columns.map(c => c.key), ['travelPct', 'attendancePct', 'flexPct', 'nightPct', 'kpi', 'idorm']);
    assert.deepEqual(view.requests.map(r => r.label), ['Nghỉ phép năm', 'iSAT', 'OT', 'Làm bù']);
  });

  it('lists a change against the chosen month', () => {
    const draft = withNv(base(), t => {
      t.values.flexPct = 25;
    });
    assert.deepEqual(benefitChanges(rows, '2026-11', base(), draft), {
      items: [{ code: 'nv', expectedRev: 3, changes: { flexPct: 25 } }],
      lines: ['Nhân viên · Phụ cấp Flex: 20% → 25% · 12 người']
    });
    assert.deepEqual(benefitChanges(rows, '2026-12', base(), draft), { items: [], lines: [] });
  });

  it('lists a tick change', () => {
    const draft = withNv(base(), t => {
      t.req.makeup = false;
    });
    assert.deepEqual(benefitChanges(rows, '2026-11', base(), draft), {
      items: [{ code: 'nv', expectedRev: 3, changes: { benefits: { makeup: false } } }],
      lines: ['Nhân viên · Làm bù: Bật → Tắt · 12 người']
    });
  });

  it('never sends the NV night cell, which is set per person', () => {
    const draft = withNv(base(), t => {
      t.values.nightPct = 60;
    });
    assert.deepEqual(benefitChanges(rows, '2026-11', base(), draft), { items: [], lines: [] });
  });

  it('keeps edited cells when fresh numbers arrive', () => {
    const oldBase = base();
    const draft = withNv(oldBase, t => {
      t.values.flexPct = 25;
    });
    const fresh = withNv(oldBase, t => {
      t.values.flexPct = 22;
      t.values.travelPct = 16;
    });
    const merged = mergeStale(oldBase, draft, fresh);
    assert.equal(nvOf(merged).values.flexPct, 25);
    assert.equal(nvOf(merged).values.travelPct, 16);
  });

  it('counts people still working by type', () => {
    const asType = (e: ReturnType<typeof employee>, type: string) => ({
      ...e,
      contract: { ...e.contract, position: { ...e.contract.position, type } }
    });
    const list = [
      employee({ username: 'a' }),
      employee({ username: 'b' }),
      employee({ username: 'c', status: 'nghiviec' }),
      asType(employee({ username: 'd', from: '2026-12-01' }), 'tts')
    ];
    assert.deepEqual(headcountFromEmployees(list as any, '2026-11-05'), { nv: 2 });
  });
});

import { accountSourcesFromApi } from '../../web/src/builders/api/accounts';

describe('Tài khoản từ /roles và /employees', () => {
  it('builds the roles and staff responses the accounts builder reads', () => {
    const admin = employee({ username: 'admin', name: 'Quản trị' });
    (admin.account as any).roles = ['admin'];
    const nam = employee({ username: 'nam', name: 'Lê Hoàng Nam', locked: true });
    const src = accountSourcesFromApi(
      [
        { code: 'admin', label: 'Quản trị viên (Admin)', isDefault: true },
        { code: 'staff', label: 'Nhân viên (Staff)', isDefault: true }
      ],
      [admin, nam] as any
    );
    assert.deepEqual(src.rolesRes.roles.map((r: any) => r.code), ['admin', 'staff']);
    assert.deepEqual(src.rolesRes.staff.map((s: any) => [s.username, s.roles, s.locked]), [['admin', ['admin'], false], ['nam', ['staff'], true]]);
    assert.deepEqual(src.staffRes.staff.find((s: any) => s.username === 'nam'), { username: 'nam', type: 'nv', level: 2, levelName: 'Bậc 2', payrollSubject: true, rev: 0 });
    assert.equal(src.staffRes.staff.find((s: any) => s.username === 'admin')!.payrollSubject, false);
  });
});

import { overviewFrom } from '../../web/src/builders/api/overview';

describe('Tổng quan ghép từ các API có sẵn', () => {
  it('builds kpis, attendance rate, period and payroll rows', () => {
    const emps = [employee({ username: 'nam', name: 'Lê Hoàng Nam' }), employee({ username: 'ha', name: 'Nguyễn Thu Hà' }), employee({ username: 'quan', status: 'nghiviec', resigned: '2026-10-01' })];
    const tsIn = (u: string, d: string) => ({ employeeId: `u-${u}`, workDate: d, actualCheckIn: '07:55', actualCheckOut: null, status: 'PRESENT' });
    const board = payrollScreenFromPayslips([], '2026-11');
    const v: any = overviewFrom({
      month: '2026-11',
      today: '2026-11-05',
      now: '09:40',
      payroll: board,
      employees: emps as any,
      timesheets: [tsIn('nam', '2026-11-05'), tsIn('nam', '2026-11-04'), tsIn('ha', '2026-11-04')] as any,
      approvals: [{ id: 'r1', action: 'decide' }, { id: 'r2', action: 'decide' }] as any,
      periodState: 'Đang chấm công'
    });
    assert.deepEqual(v.headline, { blocking: 2, closeOn: '30/11', daysLeft: 25 });
    const k = Object.fromEntries(v.kpis.map((x: any) => [x.key, x]));
    assert.equal(k.staff.value, '2');
    assert.equal(k.present.value, '1');
    assert.equal(k.present.of, '2');
    assert.equal(k.requests.value, '2');
    assert.equal(k.payroll.value, '0,00');
    assert.equal(v.attendance.todayRate, 50);
    assert.deepEqual(v.attendance.days.at(-1), { dow: 'Hôm nay', date: '05/11', rate: 50, today: true });
    assert.deepEqual(v.attendance.days.at(-2), { dow: 'T4', date: '04/11', rate: 100, today: false });
    assert.equal(v.attendance.days.length, 6);
    assert.equal(v.period.statusLabel, 'Đang chấm công');
    assert.deepEqual(v.period.slips, { done: 0, pending: 0, draft: 0, rejected: 0, total: 0 });
    assert.equal(v.payroll.rows.length, 0);
  });

  // Như mock: thẻ Việc cần duyệt hiện đủ danh sách của chuông, chỉ số "Yêu cầu chờ duyệt" chỉ đếm việc cần quyết định.
  // Dòng "Còn N việc phải xong trước khi chốt lương" đếm cả ngày chưa giải trình.
  it('counts only requests to decide in the Yêu cầu chờ duyệt KPI', () => {
    const v: any = overviewFrom({
      month: '2026-11',
      today: '2026-11-05',
      now: '09:40',
      payroll: payrollScreenFromPayslips([], '2026-11'),
      employees: [] as any,
      timesheets: [] as any,
      approvals: [{ id: 'r1', action: 'decide' }, { id: 'due:u1:2026-11-02', action: 'remind' }] as any,
      periodState: 'Đang chấm công'
    });
    const k = Object.fromEntries(v.kpis.map((x: any) => [x.key, x]));
    assert.equal(k.requests.value, '1');
    assert.equal(v.headline.blocking, 2);
    assert.equal(v.approvals.length, 2);
  });
});

describe('Việc nhắc giải trình từ /requests/explanations-due', () => {
  // 28/10/2026 09:40 giờ Việt Nam.
  const NOW = Date.parse('2026-10-28T02:40:00Z');
  const people = new Map([['u1', { name: 'Trịnh Văn Long', title: 'Công nhân vận hành' }]]);
  const due = (over: Record<string, unknown> = {}) => ({
    employeeId: 'u1', name: 'Long', date: '2026-10-27', cases: ['MISSING_CHECK_IN', 'MISSING_CHECK_OUT'],
    needs: { checkIn: true, checkOut: true }, remindedAt: null, ...over
  });

  it('maps a day missing both punches to a remind item in the attendance group', () => {
    const [item] = inboxFromDue([due()] as any, people, NOW);
    assert.equal(item.id, 'due:u1:2026-10-27');
    assert.equal(item.group, 'att');
    assert.equal(item.groupLabel, 'Chấm công');
    assert.equal(item.action, 'remind');
    assert.equal(item.personId, 'u1');
    assert.equal(item.name, 'Trịnh Văn Long');
    assert.equal(item.initials, 'VL');
    assert.equal(item.role, 'Công nhân vận hành');
    assert.equal(item.what, 'Quên chấm công');
    assert.equal(item.head, 'Quên chấm công');
    assert.equal(item.when, '27/10');
    assert.equal(item.sub, 'Thứ Ba 27/10');
    assert.equal(item.age, '1 ngày');
    assert.deepEqual(item.days, ['2026-10-27']);
    assert.deepEqual(item.facts, [['Giờ vào', 'Chưa có'], ['Giờ ra', 'Chưa có'], ['Giải trình', 'Chưa gửi']]);
    assert.equal(item.remindedAt, undefined);
  });

  it('keeps remindedAt, names the cases, and falls back to the server name without a profile', () => {
    const [item] = inboxFromDue(
      [due({ employeeId: 'u9', name: 'Ngô Gia Bảo', cases: ['MISSING_CHECK_OUT'], needs: { checkIn: false, checkOut: true }, remindedAt: '2026-10-27T02:40:00.000Z' })] as any,
      people,
      NOW
    );
    assert.equal(item.what, 'Thiếu giờ ra');
    assert.equal(item.name, 'Ngô Gia Bảo');
    assert.equal(item.role, '—');
    assert.equal(item.remindedAt, '2026-10-27T02:40:00.000Z');
    // Giờ đã có thì máy chủ không gửi giá trị: dòng đó không hiện, thay vì ghi sai.
    assert.deepEqual(item.facts, [['Giờ ra', 'Chưa có'], ['Giải trình', 'Chưa gửi']]);
  });

  it('keeps the server order and gives two days of the same person two ids', () => {
    const items = inboxFromDue([due(), due({ date: '2026-10-26' })] as any, people, NOW);
    assert.deepEqual(items.map(i => i.id), ['due:u1:2026-10-27', 'due:u1:2026-10-26']);
    assert.equal(items[1].age, '2 ngày');
  });
});
