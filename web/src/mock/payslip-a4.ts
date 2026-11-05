// Dữ liệu giả của phiếu lương A4: các kiểu của hợp đồng `A4Sheet` và tháng mẫu 10/2026 (mọi người thấy cùng một tháng).
// Chỉ đọc; không gọi /api. Bốn số tổng được cộng từ các dòng đã làm tròn.
// personSheet / approvedSheets: tháng mẫu đè người (tên, loại · bậc, hợp đồng) và trạng thái của phiếu giả ở Bảng lương
// (mock/payroll.ts); tiền và ngày công vẫn là tháng mẫu, không bịa số theo người.
import { MOCK_MONTH } from './clock';
import { payrollView, payslipView, type PayrollStatus } from './payroll';

export type DayMark = 'work' | 'paid' | 'unpaid' | 'absent' | 'pending';

export type A4Day = {
  date: string; // 'YYYY-MM-DD'
  label: string; // Loại ngày: 'Normal', 'Flex', 'Night', 'Chủ nhật', 'Phép năm', …
  mark: DayMark;
  in: string | null; // 'HH:MM', giờ vào thực tế
  out: string | null; // 'HH:MM', giờ ra thực tế
  hours: number | null; // giờ làm trong ca; ngày không ca để null
  ot: number | null; // giờ OT
  makeup: number | null; // giờ làm bù
  note: string | null; // ngắn, khoảng 18 ký tự
  adjust: number | null; // đồng, có dấu: phụ cấp ca + tiền OT − trừ giờ
  total: number; // thành tiền của ngày, đồng
};

export type A4Qty = { n: number; of?: number; unit: 'ngày' | 'giờ' | 'ca' | '%' };

export type A4Line = {
  label: string;
  hint?: string; // phần chữ xám sau " · "
  flag?: 'pending'; // chấm cam rỗng trước nhãn
  qty?: A4Qty; // cột Số lượng
  rule?: number; // cột Theo quy chế, đồng
  actual: number | null; // cột Thực tế, đồng; null chỉ có ở dữ liệu giả, in "BE tính" (R8)
  bold?: boolean;
};

export type A4KpiPart = { label: string; weight: number; score: number | null };

export type A4Group = { title: string; kpi?: A4KpiPart[]; lines: A4Line[] };

export type A4Stats = {
  workDays: number;
  flex: number;
  night: number;
  paidLeave: number;
  isat: number;
  unpaid: number;
  absent: number;
  pending: number;
  otHours: number;
  makeupHours: number;
  lateHours: number;
};

export type A4Sheet = {
  month: string; // 'YYYY-MM'
  name: string;
  kind: string; // 'NV'
  level: number;
  contract: string; // 'HĐLĐ từ 3 tháng'
  from: string;
  to: string; // 'YYYY-MM-DD'
  periodNote: string; // 'tạm tính cả tháng, số liệu tới 02/11'
  stdDays: number; // 26
  dayRate: number; // 230769
  days: A4Day[]; // chỉ các ngày cần in, theo thứ tự ngày
  stats: A4Stats;
  groups: A4Group[];
  totals: A4Line[];
  net: number;
  leaveLeft: number; // ngày phép năm còn lại
  slipStatus: PayrollStatus; // trạng thái phiếu: tiêu đề "chính thức" / "tạm tính", ô Tình trạng, dòng bản nháp
};

// Ngày trong mock khai cho cả tháng; cờ hasShift chỉ dùng ở đây, không đưa ra ngoài.
type MockDay = A4Day & { hasShift: boolean };

const day = (dd: string, label: string, mark: DayMark, over: Partial<A4Day> = {}, hasShift = true): MockDay => ({
  date: `2026-10-${dd}`,
  label,
  mark,
  in: null,
  out: null,
  hours: null,
  ot: null,
  makeup: null,
  note: null,
  adjust: null,
  total: 0,
  ...over,
  hasShift
});

// Ngày Normal mặc định 08:00–17:00, 8 giờ, 230.769.
const normal = (dd: string, over: Partial<A4Day> = {}): MockDay =>
  day(dd, 'Normal', 'work', { in: '08:00', out: '17:00', hours: 8, total: 230769, ...over });
const flex = (dd: string): MockDay =>
  day(dd, 'Flex', 'work', { in: '06:00', out: '15:00', hours: 8, adjust: 46154, total: 276923 });
const night = (dd: string): MockDay =>
  day(dd, 'Night', 'work', { in: '22:00', out: '07:00', hours: 8, adjust: 129808, total: 360577 });
const paid = (dd: string, label: string, note: string | null = null): MockDay =>
  day(dd, label, 'paid', { note, total: 230769 });
const sundayOff = (dd: string): MockDay => day(dd, 'Chủ nhật', 'work', {}, false);

const MOCK_DAYS: MockDay[] = [
  normal('01'),
  normal('02'),
  normal('03'),
  sundayOff('04'),
  paid('05', 'Phép năm'),
  flex('06'),
  normal('07'),
  night('08'),
  normal('09', { out: '22:00', ot: 4, adjust: 173077, total: 403846 }),
  day('10', 'Không lương', 'unpaid'),
  day('11', 'Chủ nhật', 'work', { in: '08:00', out: '12:00', ot: 4, adjust: 230769, total: 230769 }, false),
  flex('12'),
  normal('13'),
  normal('14', { in: '08:15', hours: 7.75, note: 'Muộn 15 phút' }),
  day('15', 'Vắng', 'absent', { note: 'Không chấm công' }),
  night('16'),
  paid('17', 'iSAT'),
  sundayOff('18'),
  day('19', 'Chế độ BHXH', 'unpaid', { note: 'BHXH chi trả' }),
  paid('20', 'Nghỉ có làm bù', 'Bù 22/10, 25/10'),
  paid('21', 'Việc riêng có lương'),
  normal('22', { out: '22:00', makeup: 4 }),
  flex('23'),
  normal('24', { out: '20:00', ot: 2, adjust: 115385, total: 346154 }),
  day('25', 'Chủ nhật', 'work', { in: '08:00', out: '12:00', makeup: 4 }, false),
  normal('26', { in: '08:40', hours: 7.33, note: 'Muộn 40 phút', adjust: -14423, total: 216346 }),
  normal('27'),
  day('28', 'Chờ giải trình', 'pending', { in: '08:20', out: '17:00', hours: 7.67, note: 'Muộn 20 phút' }),
  night('29'),
  normal('30'),
  normal('31')
];

const printable = (d: MockDay) => d.hasShift || d.in != null || (d.ot ?? 0) > 0 || (d.makeup ?? 0) > 0;

const sum = (lines: A4Line[]) => lines.reduce((s, l) => s + (l.actual ?? 0), 0);

function buildSheet(): A4Sheet {
  const days: A4Day[] = MOCK_DAYS.filter(printable).map(({ hasShift: _hasShift, ...d }) => d);

  const allowances: A4Line[] = [
    { label: 'Chuyên cần 25%', hint: 'nghỉ từ 3 ngày nên không hưởng', rule: 1500000, actual: 0 },
    { label: 'Đi lại 15%', qty: { n: 19, unit: 'ngày' }, rule: 900000, actual: 657692 },
    { label: 'Linh hoạt 20% · ca Flex', qty: { n: 3, unit: 'ca' }, rule: 1200000, actual: 138462 },
    { label: 'Off Paid · ca Night', qty: { n: 3, unit: 'ca' }, rule: 975000, actual: 112500 },
    { label: 'Thưởng ca đêm · ca Night', qty: { n: 3, unit: 'ca' }, rule: 2400000, actual: 276923 }
  ];

  const groups: A4Group[] = [
    {
      title: 'Ngày công và lương cơ bản',
      lines: [
        { label: 'Lương cơ bản', qty: { n: 19, of: 26, unit: 'ngày' }, rule: 6000000, actual: 4384615, bold: true },
        { label: 'Chờ giải trình', hint: '28/10, tạm tính 0 đ tới khi duyệt', flag: 'pending', qty: { n: 1, unit: 'ngày' }, actual: 0 },
        { label: 'Không tính lương', hint: 'vắng, không lương, chế độ BHXH', qty: { n: 3, unit: 'ngày' }, actual: 0 }
      ]
    },
    {
      title: 'Nghỉ phép và ngày lễ',
      lines: [
        { label: 'Nghỉ có lương', hint: 'phép năm, việc riêng', qty: { n: 2, unit: 'ngày' }, actual: 461538 },
        { label: 'Quyết toán phép dư', qty: { n: 0, unit: 'ngày' }, actual: 0 },
        { label: 'Nghỉ thứ 7 hưởng lương · iSAT', qty: { n: 1, unit: 'ngày' }, actual: 230769 },
        { label: 'Nghỉ lễ', qty: { n: 0, unit: 'ngày' }, actual: 0 }
      ]
    },
    {
      title: 'Làm thêm và làm bù',
      lines: [
        { label: 'OT ngày thường (×1,5)', qty: { n: 4, unit: 'giờ' }, actual: 173077 },
        { label: 'OT ngày cuối tuần (×2)', qty: { n: 6, unit: 'giờ' }, actual: 346154 },
        { label: 'OT ngày lễ (×3)', qty: { n: 0, unit: 'giờ' }, actual: 0 },
        { label: 'Làm bù cho ngày nghỉ 20/10', qty: { n: 8, unit: 'giờ' }, actual: 230769 }
      ]
    },
    {
      title: 'Phụ cấp',
      lines: [...allowances, { label: 'Tổng phụ cấp', actual: sum(allowances), bold: true }]
    },
    {
      title: 'Lương KPI',
      kpi: [
        { label: 'Base Wework', weight: 40, score: 85 },
        { label: 'Người dùng', weight: 24, score: 90 },
        { label: 'Đồng nghiệp', weight: 18, score: 80 },
        { label: 'Quản lý trực tiếp', weight: 12, score: 85 },
        { label: 'Tự đánh giá', weight: 6, score: 90 }
      ],
      lines: [
        { label: 'Lương KPI', hint: 'theo tổng điểm', qty: { n: 85.6, unit: '%' }, rule: 6000000, actual: 5136000, bold: true }
      ]
    },
    {
      title: 'Đi muộn, về sớm, ra ngoài',
      lines: [
        { label: 'Đi muộn 26/10', hint: 'muộn 40 phút, tính 30 phút', qty: { n: 0.5, unit: 'giờ' }, actual: -14423 }
      ]
    }
  ];

  // R6: các dòng tổng cộng từ các dòng đã làm tròn; Tổng phụ cấp chỉ là dòng con nên không cộng hai lần.
  const gross = sum(groups.flatMap(g => g.lines).filter(l => l.label !== 'Tổng phụ cấp'));
  const insurance = 630000;
  const afterInsurance = gross - insurance;
  const tax = 0;
  const advance = 1846154;

  const totals: A4Line[] = [
    { label: 'Tổng thu nhập', actual: gross, bold: true },
    { label: 'Các khoản miễn thuế', actual: null },
    { label: 'Thu nhập chịu thuế', actual: null },
    { label: 'Bảo hiểm bắt buộc', hint: 'BHXH 8%, BHTN 1%, BHYT 1,5%', qty: { n: 10.5, unit: '%' }, actual: insurance },
    { label: 'Thu nhập sau bảo hiểm', actual: afterInsurance, bold: true },
    { label: 'Thuế TNCN', actual: tax },
    { label: 'Tạm ứng', hint: '80% lương ngày công 01–15/10', qty: { n: 10, unit: 'ngày' }, actual: advance }
  ];

  return {
    month: MOCK_MONTH,
    name: 'NV thử nghiệm',
    kind: 'NV',
    level: 1,
    contract: 'HĐLĐ từ 3 tháng',
    from: '2026-10-01',
    to: '2026-10-31',
    periodNote: 'tạm tính cả tháng, số liệu tới 02/11',
    stdDays: 26,
    dayRate: 230769,
    days,
    stats: {
      workDays: 19,
      flex: 3,
      night: 3,
      paidLeave: 3,
      isat: 1,
      unpaid: 2,
      absent: 1,
      pending: 1,
      otHours: 10,
      makeupHours: 8,
      lateHours: 0.5
    },
    groups,
    totals,
    net: afterInsurance - tax - advance,
    leaveLeft: 22,
    slipStatus: 'draft'
  };
}

// Chỉ tháng mẫu có phiếu; tháng khác trả null.
export function payslipSheet(month: string): A4Sheet | null {
  return month === MOCK_MONTH ? buildSheet() : null;
}

/** Phiếu A4 của một mã ở Bảng lương giả: tháng mẫu với người và trạng thái của phiếu đó; tháng hay mã lạ trả null. */
export function personSheet(month: string, id: string): A4Sheet | null {
  const sheet = payslipSheet(month);
  const slip = payslipView(month, id);
  if (!sheet || !slip) return null;
  return { ...sheet, name: slip.name, kind: slip.kind, level: slip.level, contract: slip.contract, slipStatus: slip.status };
}

/** Phiếu A4 của các phiếu đã duyệt, theo thứ tự Bảng lương; tháng không có dữ liệu giả trả null. */
export function approvedSheets(month: string): A4Sheet[] | null {
  const view = payrollView(month);
  if (view.empty || !payslipSheet(month)) return null;
  return view.lines.filter(l => l.status === 'done').flatMap(l => personSheet(month, l.id) ?? []);
}
