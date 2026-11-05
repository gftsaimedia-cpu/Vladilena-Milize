// Tháng mẫu của phiếu A4 (mock/payslip-a4.ts) và các hàm định dạng của bản in: chạy trong Node, không mở trang.
import { expect, test } from '@playwright/test';
import { payslipSheet } from '../src/mock/payslip-a4';

const sheet = () => {
  const s = payslipSheet('2026-10');
  if (!s) throw new Error('không có tháng mẫu');
  return s;
};

test('only the sample month has a sheet', () => {
  expect(payslipSheet('2026-11')).toBeNull();
  expect(payslipSheet('2026-09')).toBeNull();
});

test('header fields follow the sample month', () => {
  const { days, stats, groups, totals, ...head } = sheet();
  expect(head).toEqual({
    month: '2026-10', name: 'NV thử nghiệm', kind: 'NV', level: 1, contract: 'HĐLĐ từ 3 tháng',
    from: '2026-10-01', to: '2026-10-31', periodNote: 'tạm tính cả tháng, số liệu tới 02/11',
    stdDays: 26, dayRate: 230769, net: 9657922, leaveLeft: 22
  });
});

test('days: one row per day that needs one, plain Sundays skipped', () => {
  const s = sheet();
  expect(s.days.map(d => d.date.slice(8))).toEqual([
    '01', '02', '03', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16',
    '17', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31'
  ]);
  expect(s.days.every(d => !('hasShift' in d))).toBe(true);
  const day = (dd: string) => s.days.find(d => d.date === `2026-10-${dd}`);
  const off = { in: null, out: null, hours: null, ot: null, makeup: null, adjust: null };
  expect(day('09')).toEqual({ date: '2026-10-09', label: 'Normal', mark: 'work', in: '08:00', out: '22:00', hours: 8, ot: 4, makeup: null, note: null, adjust: 173077, total: 403846 });
  expect(day('11')).toEqual({ date: '2026-10-11', label: 'Chủ nhật', mark: 'work', in: '08:00', out: '12:00', hours: null, ot: 4, makeup: null, note: null, adjust: 230769, total: 230769 });
  expect(day('20')).toEqual({ date: '2026-10-20', label: 'Nghỉ có làm bù', mark: 'paid', ...off, note: 'Bù 22/10, 25/10', total: 230769 });
  expect(day('22')).toEqual({ date: '2026-10-22', label: 'Normal', mark: 'work', in: '08:00', out: '22:00', hours: 8, ot: null, makeup: 4, note: null, adjust: null, total: 230769 });
  expect(day('25')).toEqual({ date: '2026-10-25', label: 'Chủ nhật', mark: 'work', in: '08:00', out: '12:00', hours: null, ot: null, makeup: 4, note: null, adjust: null, total: 0 });
  expect(day('26')).toEqual({ date: '2026-10-26', label: 'Normal', mark: 'work', in: '08:40', out: '17:00', hours: 7.33, ot: null, makeup: null, note: 'Muộn 40 phút', adjust: -14423, total: 216346 });
  expect(day('28')).toEqual({ date: '2026-10-28', label: 'Chờ giải trình', mark: 'pending', in: '08:20', out: '17:00', hours: 7.67, ot: null, makeup: null, note: 'Muộn 20 phút', adjust: null, total: 0 });
  expect(day('15')).toEqual({ date: '2026-10-15', label: 'Vắng', mark: 'absent', ...off, note: 'Không chấm công', total: 0 });
  const marks: Record<string, number> = {};
  for (const d of s.days) marks[d.mark] = (marks[d.mark] ?? 0) + 1;
  expect(marks).toEqual({ work: 21, paid: 4, unpaid: 2, absent: 1, pending: 1 });
  expect(s.stats).toEqual({
    workDays: 19, flex: 3, night: 3, paidLeave: 3, isat: 1, unpaid: 2,
    absent: 1, pending: 1, otHours: 10, makeupHours: 8, lateHours: 0.5
  });
});

test('pay lines follow P2 and the totals add up from the rounded lines', () => {
  const s = sheet();
  expect(s.groups.map(g => g.title)).toEqual([
    'Ngày công và lương cơ bản', 'Nghỉ phép và ngày lễ', 'Làm thêm và làm bù',
    'Phụ cấp', 'Lương KPI', 'Đi muộn, về sớm, ra ngoài'
  ]);
  const lines = s.groups.flatMap(g => g.lines);
  expect(lines.map(l => [l.label, l.actual])).toEqual([
    ['Lương cơ bản', 4384615], ['Chờ giải trình', 0], ['Không tính lương', 0],
    ['Nghỉ có lương', 461538], ['Quyết toán phép dư', 0], ['Nghỉ thứ 7 hưởng lương · iSAT', 230769], ['Nghỉ lễ', 0],
    ['OT ngày thường (×1,5)', 173077], ['OT ngày cuối tuần (×2)', 346154], ['OT ngày lễ (×3)', 0],
    ['Làm bù cho ngày nghỉ 20/10', 230769],
    ['Chuyên cần 25%', 0], ['Đi lại 15%', 657692], ['Linh hoạt 20% · ca Flex', 138462],
    ['Off Paid · ca Night', 112500], ['Thưởng ca đêm · ca Night', 276923], ['Tổng phụ cấp', 1185577],
    ['Lương KPI', 5136000], ['Đi muộn 26/10', -14423]
  ]);
  const by = (label: string) => lines.find(l => l.label === label);
  expect(by('Lương cơ bản')).toEqual({ label: 'Lương cơ bản', qty: { n: 19, of: 26, unit: 'ngày' }, rule: 6000000, actual: 4384615, bold: true });
  expect(by('Chờ giải trình')).toEqual({ label: 'Chờ giải trình', hint: '28/10, tạm tính 0 đ tới khi duyệt', flag: 'pending', qty: { n: 1, unit: 'ngày' }, actual: 0 });
  expect(by('Không tính lương')).toEqual({ label: 'Không tính lương', hint: 'vắng, không lương, chế độ BHXH', qty: { n: 3, unit: 'ngày' }, actual: 0 });
  expect(by('Nghỉ có lương')).toEqual({ label: 'Nghỉ có lương', hint: 'phép năm, việc riêng', qty: { n: 2, unit: 'ngày' }, actual: 461538 });
  expect(by('OT ngày cuối tuần (×2)')).toEqual({ label: 'OT ngày cuối tuần (×2)', qty: { n: 6, unit: 'giờ' }, actual: 346154 });
  expect(by('Làm bù cho ngày nghỉ 20/10')).toEqual({ label: 'Làm bù cho ngày nghỉ 20/10', qty: { n: 8, unit: 'giờ' }, actual: 230769 });
  expect(by('Chuyên cần 25%')).toEqual({ label: 'Chuyên cần 25%', hint: 'nghỉ từ 3 ngày nên không hưởng', rule: 1500000, actual: 0 });
  expect(by('Off Paid · ca Night')).toEqual({ label: 'Off Paid · ca Night', qty: { n: 3, unit: 'ca' }, rule: 975000, actual: 112500 });
  expect(by('Tổng phụ cấp')).toEqual({ label: 'Tổng phụ cấp', actual: 1185577, bold: true });
  expect(by('Lương KPI')).toEqual({ label: 'Lương KPI', hint: 'theo tổng điểm', qty: { n: 85.6, unit: '%' }, rule: 6000000, actual: 5136000, bold: true });
  expect(by('Đi muộn 26/10')).toEqual({ label: 'Đi muộn 26/10', hint: 'muộn 40 phút, tính 30 phút', qty: { n: 0.5, unit: 'giờ' }, actual: -14423 });
  expect(lines.filter(l => l.rule != null).map(l => [l.label, l.rule])).toEqual([
    ['Lương cơ bản', 6000000], ['Chuyên cần 25%', 1500000], ['Đi lại 15%', 900000],
    ['Linh hoạt 20% · ca Flex', 1200000], ['Off Paid · ca Night', 975000],
    ['Thưởng ca đêm · ca Night', 2400000], ['Lương KPI', 6000000]
  ]);
  expect(s.groups[4].kpi).toEqual([
    { label: 'Base Wework', weight: 40, score: 85 }, { label: 'Người dùng', weight: 24, score: 90 },
    { label: 'Đồng nghiệp', weight: 18, score: 80 }, { label: 'Quản lý trực tiếp', weight: 12, score: 85 },
    { label: 'Tự đánh giá', weight: 6, score: 90 }
  ]);
  const allowance = by('Tổng phụ cấp');
  expect(lines.filter(l => l !== allowance).reduce((sum, l) => sum + (l.actual ?? 0), 0)).toBe(12134076);
  expect(s.totals).toEqual([
    { label: 'Tổng thu nhập', actual: 12134076, bold: true },
    { label: 'Các khoản miễn thuế', actual: null },
    { label: 'Thu nhập chịu thuế', actual: null },
    { label: 'Bảo hiểm bắt buộc', hint: 'BHXH 8%, BHTN 1%, BHYT 1,5%', qty: { n: 10.5, unit: '%' }, actual: 630000 },
    { label: 'Thu nhập sau bảo hiểm', actual: 11504076, bold: true },
    { label: 'Thuế TNCN', actual: 0 },
    { label: 'Tạm ứng', hint: '80% lương ngày công 01–15/10', qty: { n: 10, unit: 'ngày' }, actual: 1846154 }
  ]);
});
