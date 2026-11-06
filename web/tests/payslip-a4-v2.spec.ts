// Bản in A4 dựng từ phiếu BE v2 (GET /api/v2/payroll/:month/:id và /:month): chạy trong Node, không mở trang.
// Ánh xạ trường theo docs/fe-yeu-cau/in-phieu-luong-a4--noi-api-v2.md; FE chỉ ghép ô, mọi số lấy nguyên của BE.
import { expect, test } from '@playwright/test';
import { approvedSheetsFromRecords, sheetFromRecord } from '../src/builders/api/payslip-a4';
import { actualText, periodLine, statCells, staffLine, titleLine } from '../src/views/print/parts/a4-format';

// Phiếu nv bậc 1 tháng 10/2026, hai dòng ngày: thứ Tư 07/10 có OT 18:00–20:00 (ra 19:20), thứ Năm 08/10 nghỉ phép năm.
const details = (over: Record<string, unknown> = {}) => ({
  fullName: 'Lê Hoàng Nam',
  positionLevelText: 'Nhân viên · Bậc 1',
  contractStatusText: 'HĐLĐ từ 3 tháng',
  employeeType: 'nv',
  level: 1,
  employmentStatus: 'official',
  month: '2026-10',
  standardWorkdays: 26,
  actualWorkDays: 1,
  flexShiftCount: 0,
  nightShiftCount: 0,
  paidLeaveDays: 1,
  isatDays: 0,
  unpaidLeaveDays: 0,
  holidayPaidDays: 0,
  totalOtHours: 1.3333333333333333,
  lateEarlyHours: 0.5,
  baseSalaryPolicy: 6000000,
  baseSalaryActual: 230769,
  paidLeavePay: 230769,
  leaveSettlementPay: 0,
  isatPay: 0,
  holidayPay: 0,
  ot15Hours: 1.3333333333333333,
  ot20Hours: 0,
  ot30Hours: 0,
  ot15Pay: 57692,
  ot20Pay: 0,
  ot30Pay: 0,
  otPayTotal: 57692,
  dayRate: 230769,
  attendanceAllowancePolicy: 1500000,
  attendanceAllowanceActual: 0,
  travelAllowancePolicy: 900000,
  travelAllowanceActual: 34615,
  flexAllowancePolicy: 1200000,
  flexAllowanceActual: 0,
  offPaidNightPolicy: 975000,
  offPaidNightActual: 0,
  nightAllowancePolicy: 2400000,
  nightAllowanceActual: 0,
  totalAllowanceActual: 34615,
  kpiApplicable: true,
  kpiScores: { wework: 80, user: 90, peer: null, manager: 70, self: 60 },
  rates: {
    kpiWeights: { wework: 40, user: 24, peer: 18, manager: 12, self: 6 },
    insurancePct: { bhxh: 8, bhyt: 1.5, bhtn: 1, total: 10.5 },
    otMultipliers: { weekday: 1.5, weekend: 2, holiday: 3 },
    lateGraceMinutes: 15
  },
  kpiTotalScorePct: 64.6,
  kpiProposedAmount: 6000000,
  kpiAppliedAmount: 6000000,
  kpiMaxSalary: 6000000,
  kpiActualPay: 3876000,
  lateEarlyDeductionAmount: -14423,
  grossIncome: 4415422,
  taxExemptIncome: 19231,
  taxableIncome: 4396191,
  insuranceDeduction: 630000,
  insuranceBreakdown: { bhxh: 480000, bhyt: 90000, bhtn: 60000 },
  incomeAfterInsurance: 3785422,
  personalIncomeTax: 0,
  advanceDeduction: 100000,
  netIncome: 3685422,
  dependants: 0,
  remainingAnnualLeaveDays: 10,
  dailyLines: [
    {
      date: '2026-10-07', dayOfWeekText: 'Thứ 4', shiftCode: 'NORMAL', shiftLabel: 'Normal', inOutText: '08:00–19:20',
      checkIn: '08:00', checkOut: '19:20', workHours: 8, daySalary: 230769, flexAllowancePay: 0, nightAllowancePay: 0,
      offPaidPay: 0, otHours: 1.3333333333333333, otPay: 57692, deductionHours: 0.5, deductionAmount: 14423, dailyTotal: 274038
    },
    {
      date: '2026-10-08', dayOfWeekText: 'Thứ 5', shiftCode: 'LEAVE', shiftLabel: 'Nghỉ phép', inOutText: 'Hưởng lương ngày',
      checkIn: null, checkOut: null, workHours: 8, daySalary: 230769, flexAllowancePay: 0, nightAllowancePay: 0,
      offPaidPay: 0, otHours: 0, otPay: 0, deductionHours: 0, deductionAmount: 0, dailyTotal: 230769
    }
  ],
  ...over
});
const record = (over: Record<string, unknown> = {}, d: Record<string, unknown> = {}) => ({
  id: 7, username: 'lg-nam', status: 'approved', gross: 4415422, insurance: 630000, tax: 0, advance: 100000, net: 3685422,
  note: null, decidedBy: 'admin', decidedAt: '2026-11-03T02:00:00.000Z',
  details: details(d),
  ...over
});

test('header: person, position and staff status come from the record', () => {
  const s = sheetFromRecord(record() as any);
  expect({
    month: s.month, name: s.name, kind: s.kind, level: s.level, employmentStatus: s.employmentStatus, contract: s.contract,
    from: s.from, to: s.to, stdDays: s.stdDays, dayRate: s.dayRate, net: s.net, leaveLeft: s.leaveLeft
  }).toEqual({
    month: '2026-10', name: 'Lê Hoàng Nam', kind: 'NV', level: 1, employmentStatus: 'Chính thức', contract: 'HĐLĐ từ 3 tháng',
    from: '2026-10-01', to: '2026-10-31', stdDays: 26, dayRate: 230769, net: 3685422, leaveLeft: 10
  });
  expect(sheetFromRecord(record({}, { employeeType: 'ctv', level: 2, employmentStatus: 'probation' }) as any)).toMatchObject({
    kind: 'CTV', level: 2, employmentStatus: 'Thử việc'
  });
});

// D11 (06/11): bản in không ghi trạng thái phiếu; phiếu nháp, bị từ chối hay đã duyệt in cùng tiêu đề và dòng phụ.
test('D11: every slip status prints the same title and period line, with no status on the sheet', () => {
  for (const status of ['approved', 'draft', 'rejected', 'pending', 'error']) {
    const s = sheetFromRecord(record({ status }) as any);
    expect(['slipStatus' in s, 'periodNote' in s]).toEqual([false, false]);
    expect(titleLine(s)).toBe('Phiếu lương tháng 10/2026');
    expect(periodLine(s)).toBe('Từ 01/10 đến 31/10/2026 · công chuẩn theo quy chế: 26 ngày');
  }
});

// D12 (06/11): OT đã duyệt mà ra 0 đ chỉ hiện 0, không thêm cờ hay chú thích.
test('D12: an OT line that pays 0 reads 0, with no flag or hint', () => {
  const s = sheetFromRecord(record({}, { ot15Pay: 0, otPayTotal: 0 }) as any);
  const line = s.groups.find(g => g.title === 'Làm thêm giờ')!.lines[0];
  expect(line).toEqual({ label: 'OT ngày thường (×1,5)', qty: { n: 1.3333333333333333, unit: 'giờ' }, actual: 0 });
  expect(actualText(line.actual)).toBe('0');
});

test('days: every daily line, real in/out times, OT in the day amount, leave days marked paid', () => {
  const s = sheetFromRecord(record() as any);
  expect(s.days).toEqual([
    {
      date: '2026-10-07', label: 'Normal', mark: 'work', in: '08:00', out: '19:20', hours: 8, ot: 1.3333333333333333,
      makeup: null, note: null, adjust: 57692 - 14423, total: 274038
    },
    {
      date: '2026-10-08', label: 'Nghỉ phép', mark: 'paid', in: null, out: null, hours: null, ot: null,
      makeup: null, note: null, adjust: null, total: 230769
    }
  ]);
  const mark = (shiftCode: string, workHours = 8) =>
    sheetFromRecord(record({}, { dailyLines: [{ ...details().dailyLines[0], shiftCode, workHours }] }) as any).days[0].mark;
  expect(['FLEX', 'NIGHT', 'ISAT', 'HOLIDAY', 'UNPAID'].map(c => mark(c))).toEqual(['work', 'work', 'paid', 'paid', 'unpaid']);
});

test('stats: counts from the record; absent, pending and make-up hours have no v2 source', () => {
  const s = sheetFromRecord(record() as any);
  expect(s.stats).toEqual({
    workDays: 1, flex: 0, night: 0, paidLeave: 1, isat: 0, unpaid: 0, absent: null, pending: null,
    otHours: 1.3333333333333333, makeupHours: null, lateHours: 0.5
  });
  expect(statCells(s.stats)).toEqual([
    ['Ngày công', '1 ngày'], ['Ca Flex · Night', '0 · 0 ca'], ['Nghỉ có lương', '1 ngày'], ['iSAT', '0 ngày'],
    ['Không lương, BHXH', '0 ngày'], ['Vắng', '—'], ['Chờ giải trình', '—'], ['OT', '1,33 giờ'],
    ['Làm bù', '—'], ['Trừ giờ đi muộn', '0,5 giờ']
  ]);
});

test('page 2: pay lines and totals are the record amounts, KPI grid from the five scores', () => {
  const s = sheetFromRecord(record() as any);
  expect(s.groups.map(g => [g.title, g.lines.map(l => [l.label, l.actual])])).toEqual([
    ['Ngày công và lương cơ bản', [['Lương cơ bản', 230769]]],
    ['Nghỉ phép và ngày lễ', [['Nghỉ có lương', 230769], ['Quyết toán phép dư', 0], ['Nghỉ thứ 7 hưởng lương · iSAT', 0], ['Nghỉ lễ', 0]]],
    ['Làm thêm giờ', [['OT ngày thường (×1,5)', 57692], ['OT ngày cuối tuần (×2)', 0], ['OT ngày lễ (×3)', 0]]],
    ['Phụ cấp', [
      ['Chuyên cần', 0], ['Đi lại', 34615], ['Linh hoạt · ca Flex', 0], ['Off Paid · ca Night', 0],
      ['Thưởng ca đêm · ca Night', 0], ['Tổng phụ cấp', 34615]
    ]],
    ['Lương KPI', [['Lương KPI', 3876000]]],
    ['Đi muộn, về sớm, ra ngoài', [['Đi muộn, về sớm', -14423]]]
  ]);
  const by = (label: string) => s.groups.flatMap(g => g.lines).find(l => l.label === label);
  expect(by('Lương cơ bản')).toEqual({ label: 'Lương cơ bản', qty: { n: 1, of: 26, unit: 'ngày' }, rule: 6000000, actual: 230769, bold: true });
  expect(by('OT ngày thường (×1,5)')).toEqual({ label: 'OT ngày thường (×1,5)', qty: { n: 1.3333333333333333, unit: 'giờ' }, actual: 57692 });
  expect(by('Đi lại')).toEqual({ label: 'Đi lại', qty: { n: 1, unit: 'ngày' }, rule: 900000, actual: 34615 });
  expect(by('Lương KPI')).toEqual({ label: 'Lương KPI', hint: 'theo tổng điểm', qty: { n: 64.6, unit: '%' }, rule: 6000000, actual: 3876000, bold: true });
  expect(by('Đi muộn, về sớm')).toEqual({ label: 'Đi muộn, về sớm', qty: { n: 0.5, unit: 'giờ' }, actual: -14423 });
  expect(s.groups[4].kpi).toEqual([
    { label: 'Base Wework', weight: 40, score: 80 }, { label: 'Người dùng', weight: 24, score: 90 },
    { label: 'Đồng nghiệp', weight: 18, score: null }, { label: 'Quản lý trực tiếp', weight: 12, score: 70 },
    { label: 'Tự đánh giá', weight: 6, score: 60 }
  ]);
  expect(s.totals).toEqual([
    { label: 'Tổng thu nhập', actual: 4415422, bold: true },
    { label: 'Các khoản miễn thuế', actual: 19231 },
    { label: 'Thu nhập chịu thuế', actual: 4396191 },
    { label: 'Bảo hiểm bắt buộc', actual: 630000 },
    { label: 'Thu nhập sau bảo hiểm', actual: 3785422, bold: true },
    { label: 'Thuế TNCN', actual: 0 },
    { label: 'Tạm ứng', actual: 100000 }
  ]);
});

test('a tts slip: no position type, no leave account, no staff status and no KPI group', () => {
  const s = sheetFromRecord(
    record({}, { employeeType: null, employmentStatus: null, remainingAnnualLeaveDays: null, kpiApplicable: false }) as any
  );
  expect([s.kind, s.level, s.employmentStatus, s.leaveLeft]).toEqual(['—', 1, null, null]);
  expect(s.groups.map(g => g.title)).not.toContain('Lương KPI');
});

test('a slip saved before the new BE fields: blanks, and one OT line with the stored OT total', () => {
  const old = details();
  for (const k of ['employeeType', 'level', 'employmentStatus', 'ot15Pay', 'ot20Pay', 'ot30Pay', 'dayRate']) delete (old as any)[k];
  old.dailyLines = old.dailyLines.map(({ checkIn: _i, checkOut: _o, ...l }) => l) as any;
  const s = sheetFromRecord({ ...record(), details: old } as any);
  expect([s.kind, s.level, s.employmentStatus, s.dayRate]).toEqual(['—', null, null, null]);
  expect(s.days.map(d => [d.in, d.out])).toEqual([[null, null], [null, null]]);
  expect(s.groups.find(g => g.title === 'Làm thêm giờ')?.lines).toEqual([
    { label: 'Làm thêm giờ', qty: { n: 1.3333333333333333, unit: 'giờ' }, actual: 57692 }
  ]);
  expect(staffLine(s)).toBe('— · HĐLĐ từ 3 tháng · từ 01/10 đến 31/10/2026');
});

test('the staff line of page 2 names type · level, contract and period', () => {
  const s = sheetFromRecord(record({ status: 'draft' }) as any);
  expect(staffLine(s)).toBe('NV · Bậc 1 · HĐLĐ từ 3 tháng · từ 01/10 đến 31/10/2026');
});

test('In tất cả keeps only approved records, sorted by name like Bảng lương', () => {
  const list = approvedSheetsFromRecords([
    record({ username: 'lg-c', status: 'approved' }, { fullName: 'Lương Văn Dũng' }),
    record({ username: 'lg-b', status: 'draft' }, { fullName: 'Lương Thị Bình' }),
    record({ username: 'lg-a', status: 'approved' }, { fullName: 'Lương Văn An' }),
    record({ username: 'lg-d', status: 'rejected' }, { fullName: 'Lương Minh' })
  ] as any);
  expect(list.map(s => s.name)).toEqual(['Lương Văn An', 'Lương Văn Dũng']);
  expect(approvedSheetsFromRecords([])).toEqual([]);
});

test('OT labels and KPI weights follow the rates of the payslip; a payslip without rates prints none', () => {
  const custom = sheetFromRecord(
    record({}, { rates: { kpiWeights: { wework: 50, user: 20, peer: 15, manager: 10, self: 5 }, otMultipliers: { weekday: 1.8, weekend: 2.5, holiday: 3 } } }) as any
  );
  const ot = custom.groups.find(g => g.title === 'Làm thêm giờ')!.lines.map(l => l.label);
  expect(ot).toEqual(['OT ngày thường (×1,8)', 'OT ngày cuối tuần (×2,5)', 'OT ngày lễ (×3)']);
  expect(custom.groups.find(g => g.kpi)!.kpi!.map(k => k.weight)).toEqual([50, 20, 15, 10, 5]);
  expect(custom.otRates).toEqual({ weekday: 1.8, weekend: 2.5, holiday: 3 });

  const old = sheetFromRecord(record({}, { rates: undefined }) as any);
  expect(old.groups.find(g => g.title === 'Làm thêm giờ')!.lines.map(l => l.label)).toEqual(['OT ngày thường', 'OT ngày cuối tuần', 'OT ngày lễ']);
  expect(old.groups.find(g => g.kpi)!.kpi!.map(k => k.weight)).toEqual([null, null, null, null, null]);
  expect(old.otRates).toBeNull();
});
