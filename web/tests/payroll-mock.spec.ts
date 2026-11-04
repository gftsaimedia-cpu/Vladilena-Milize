import { expect, test } from '@playwright/test';
import { kpiScore, recomputeSlip } from '../src/mock/payroll-calc';
import { decidePayslip, payrollView, payslipView, setKpiScore } from '../src/mock/payroll';

// Chạy phía Node, không mở trang. Test cuối sửa trạng thái trong bộ nhớ nên cả file chạy tuần tự.
test.describe.configure({ mode: 'serial' });

// [mã, Tiền ngày công, Tổng điểm, Lương KPI, Phụ cấp, Làm thêm, Trừ giờ, Tổng thu nhập, Bảo hiểm, Thuế, Tạm ứng, Thực nhận]
const BOARD: [string, ...number[]][] = [
  ['GFT-0101', 16615385, 86.76, 2602800, 2800000, 461538, 0, 22479723, 1680000, 0, 0, 20799723],
  ['GFT-0108', 24923077, 89.08, 4454000, 3365384, 1961538, 57692, 34646307, 2520000, 170931, 0, 31955376],
  ['GFT-0142', 11999999, 66.14, 1322800, 2215384, 0, 0, 15538183, 1260000, 0, 0, 14278183],
  ['GFT-0117', 14538462, 80.72, 2018000, 2200000, 0, 0, 18756462, 1470000, 0, 0, 17286462],
  ['GFT-0123', 20000001, 83.62, 3344800, 3115384, 0, 0, 26460185, 2100000, 133009, 0, 24227176],
  ['GFT-0156', 12000000, 72.16, 1443200, 1692308, 0, 125000, 15010508, 1365000, 0, 0, 13645508],
  ['GFT-0063', 10576923, 74.06, 1481200, 2717308, 634615, 0, 15410046, 1155000, 0, 2000000, 12255046],
  ['GFT-0171', 9500000, 77.82, 1167300, 2815385, 411058, 0, 13893743, 997500, 0, 0, 12896243],
  ['GFT-0172', 9865385, 80.74, 1211100, 1692308, 365385, 0, 13134178, 997500, 0, 0, 12136678],
  ['GFT-0175', 9865385, 76.08, 1141200, 2264423, 205529, 0, 13476537, 997500, 0, 0, 12479037]
];

test('each sample slip matches board G', () => {
  for (const [id, ...want] of BOARD) {
    const s = payslipView('2026-10', id)!;
    const c = s.calc;
    expect([c.workPay, c.kpiPercent, c.kpiPay, c.allowanceTotal, s.ot.pay, s.late.cut, c.gross, c.insurance, c.tax, s.advance, c.net], id).toEqual(want);
  }
  expect(payslipView('2026-10', 'GFT-0063')!.calc.kpiMissing).toEqual(['self']);
  const nam = payslipView('2026-10', 'GFT-0142')!;
  expect(nam.days).toEqual({ work: 24, leave: 1, isat: 1, pending: 1, unpaid: 0, standard: 26 });
  expect(nam.calendar).toHaveLength(31);
  expect([nam.calendar[3], nam.calendar[11], nam.calendar[16], nam.calendar[26], nam.calendar[28]]).toEqual(['sunday', 'leave', 'isat', 'pending', 'future']);
  expect(nam.pendingDates).toEqual(['27/10']);
  expect(nam.kpi.history.map(h => `${h.date} · ${h.text} · ${h.by}`)).toEqual([
    '27/10 · Quản lý trực tiếp 60 → 65 · Trưởng phòng Kinh doanh',
    '25/10 · Đồng nghiệp 72 → 68 · Quản trị viên',
    '20/10 · Base Wework nhập 62 · Quản trị viên'
  ]);
});

test('period counts and totals match the board tiles', () => {
  const v = payrollView('2026-10');
  if (v.empty) throw new Error('tháng 10 phải có dữ liệu');
  expect(v.lines.map(l => l.id)).toEqual(BOARD.map(b => b[0]));
  expect(v.counts).toEqual({ all: 128, draft: 12, pending: 29, done: 86, rejected: 1 });
  expect(v.totals).toEqual({ gross: 2480805872, insurance: 260042500, tax: 90003940, advance: 20000000, deductions: 370046440, net: 2110759432, netShare: 85 });
  expect(v.lines.reduce((a, l) => a + l.net, 0)).toBe(171959432);
  expect(v.depts).toEqual(['Tài chính', 'Kỹ thuật', 'Kinh doanh', 'Nhân sự', 'Marketing', 'Sản xuất']);
  expect(payrollView('2026-09')).toEqual({ month: '2026-09', empty: true });
  expect(payslipView('2026-09', 'GFT-0142')).toBeNull();
  expect(payslipView('2026-10', 'GFT-9999')).toBeNull();
});

test('what-if scores recompute KPI, tax and net', () => {
  const withScore = (id: string, part: string, value: number | null) => {
    const s = payslipView('2026-10', id)!;
    return recomputeSlip({ ...s, kpi: { ...s.kpi, scores: { ...s.kpi.scores, [part]: value } } }).calc;
  };
  const up = withScore('GFT-0142', 'wework', 100);
  expect([up.kpiPercent, up.kpiPay, up.net]).toEqual([81.34, 1626800, 14582183]);
  const cleared = withScore('GFT-0142', 'wework', null);
  expect([cleared.kpiPercent, cleared.kpiPay, cleared.net, cleared.kpiMissing]).toEqual([41.34, 826800, 13782183, ['wework']]);
  const thinh = withScore('GFT-0123', 'self', 100);
  expect([thinh.kpiPercent, thinh.kpiPay, thinh.tax, thinh.net]).toEqual([84.52, 3380800, 134809, 24261376]);
  const huy = withScore('GFT-0063', 'self', 80);
  expect([huy.kpiPercent, huy.kpiPay, huy.net, huy.kpiMissing]).toEqual([78.86, 1577200, 12351046, []]);
  expect(kpiScore({ wework: null, user: null, peer: null, manager: null, self: null })).toEqual({ percent: 0, missing: ['wework', 'user', 'peer', 'manager', 'self'] });
});

test('editing scores writes history and deciding changes the counts', () => {
  const t = setKpiScore('2026-10', 'GFT-0123', 'self', 100)!;
  expect(t.kpi.history[0]).toEqual({ date: '28/10', text: 'Tự đánh giá 85 → 100', by: 'Quản trị viên' });
  expect(t.calc.net).toBe(24261376);
  expect(setKpiScore('2026-10', 'GFT-0123', 'self', 100)!.kpi.history).toHaveLength(1);
  expect(setKpiScore('2026-10', 'GFT-0123', 'self', null)!.kpi.history[0].text).toBe('Tự đánh giá xoá điểm 100');
  expect(setKpiScore('2026-10', 'GFT-0063', 'self', 80)!.kpi.history[0].text).toBe('Tự đánh giá nhập 80');
  expect(decidePayslip('2026-10', 'GFT-0142', 'approve')!.status).toBe('done');
  expect(decidePayslip('2026-10', 'GFT-0171', 'reject')!.status).toBe('rejected');
  const v = payrollView('2026-10');
  if (v.empty) throw new Error('tháng 10 phải có dữ liệu');
  expect(v.counts).toEqual({ all: 128, draft: 12, pending: 27, done: 87, rejected: 2 });
});

test('saved scores are clamped to 0-100 and rounded; empty means missing, not 0', () => {
  const scores = (v: number | null) => setKpiScore('2026-10', 'GFT-0156', 'self', v)!.kpi.scores.self;
  expect(scores(150)).toBe(100);
  expect(scores(-5)).toBe(0);
  expect(scores(72.6)).toBe(73);
  expect(scores(Number.NaN)).toBeNull();
  const empty = setKpiScore('2026-10', 'GFT-0156', 'self', null)!;
  expect(empty.kpi.scores.self).toBeNull();
  expect(empty.calc.kpiMissing).toEqual(['self']);
  // 150 và 100 là cùng một điểm sau khi kẹp: không thêm dòng lịch sử.
  scores(100);
  const n = payslipView('2026-10', 'GFT-0156')!.kpi.history.length;
  expect(scores(150)).toBe(100);
  expect(payslipView('2026-10', 'GFT-0156')!.kpi.history).toHaveLength(n);
  expect(payslipView('2026-10', 'GFT-0156')!.kpi.history[0].text).toMatch(/ 100$/);
});
