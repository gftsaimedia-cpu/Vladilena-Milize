// Bản in phiếu lương A4 từ phiếu BE v2 (GET /api/v2/payroll/:month/:id, và GET /api/v2/payroll/:month cho In tất cả).
// BE tính sẵn mọi số; ở đây chỉ ghép ô theo docs/fe-yeu-cau/in-phieu-luong-a4--noi-api-v2.md. Phiếu lưu trước khi BE có
// trường mới (loại, bậc, giờ vào/ra, OT theo hệ số, lương ngày) để ô đó trống hay "—", không báo lỗi.
// Không có nguồn ở v2 nên không in: Vắng, Chờ giải trình, Làm bù (ô tổng hợp in "—"), cột Làm bù và Ghi chú.
import type { A4Day, A4Group, A4Line, A4Sheet, DayMark } from '../../mock/payslip-a4';
import { KPI_LABELS, KPI_WEIGHTS, employeeTypeLabel, employmentStatusLabel } from '../../constants/labels';
import type { KpiPart } from '../../mock/payroll-calc';
import { statusOf } from './payroll';

type DailyLineDTO = {
  date: string;
  shiftCode: string;
  shiftLabel?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workHours: number;
  flexAllowancePay?: number;
  nightAllowancePay?: number;
  offPaidPay?: number;
  otHours?: number;
  otPay?: number;
  deductionAmount?: number;
  dailyTotal: number;
};

// Các trường của `details` mà bản in đọc. Trường đánh dấu ? có thể thiếu ở phiếu lưu trước khi BE thêm chúng.
export type A4DetailDTO = {
  fullName: string;
  contractStatusText?: string;
  employeeType?: string | null;
  level?: number;
  employmentStatus?: string | null;
  month: string;
  standardWorkdays: number;
  actualWorkDays: number;
  flexShiftCount: number;
  nightShiftCount: number;
  paidLeaveDays: number;
  isatDays: number;
  unpaidLeaveDays: number;
  holidayPaidDays: number;
  totalOtHours: number;
  lateEarlyHours: number;
  baseSalaryPolicy: number;
  baseSalaryActual: number;
  paidLeavePay: number;
  leaveSettlementPay: number;
  isatPay: number;
  holidayPay: number;
  ot15Hours: number;
  ot20Hours: number;
  ot30Hours: number;
  ot15Pay?: number;
  ot20Pay?: number;
  ot30Pay?: number;
  otPayTotal: number;
  dayRate?: number;
  attendanceAllowancePolicy: number;
  attendanceAllowanceActual: number;
  travelAllowancePolicy: number;
  travelAllowanceActual: number;
  flexAllowancePolicy: number;
  flexAllowanceActual: number;
  offPaidNightPolicy: number;
  offPaidNightActual: number;
  nightAllowancePolicy: number;
  nightAllowanceActual: number;
  totalAllowanceActual: number;
  kpiApplicable: boolean;
  kpiScores?: Partial<Record<KpiPart, number | null>>;
  kpiTotalScorePct: number;
  kpiAppliedAmount: number;
  kpiActualPay: number;
  lateEarlyDeductionAmount: number;
  grossIncome: number;
  taxExemptIncome: number;
  taxableIncome: number;
  insuranceDeduction: number;
  incomeAfterInsurance: number;
  personalIncomeTax: number;
  advanceDeduction: number;
  netIncome: number;
  remainingAnnualLeaveDays?: number | null;
  dailyLines?: DailyLineDTO[];
};

export type A4RecordDTO = { username: string; status: string; net: number; details: A4DetailDTO };

// Loại ngày của BE → chấm màu của bản in; mã lạ: có giờ làm là đi làm, không thì không lương.
const MARKS: Record<string, DayMark> = {
  NORMAL: 'work',
  FLEX: 'work',
  NIGHT: 'work',
  LEAVE: 'paid',
  PAID_LEAVE: 'paid',
  ISAT: 'paid',
  HOLIDAY: 'paid',
  UNPAID: 'unpaid',
  UNPAID_LEAVE: 'unpaid'
};

function dayOf(l: DailyLineDTO): A4Day {
  const mark = MARKS[l.shiftCode?.toUpperCase()] ?? (l.workHours > 0 ? 'work' : 'unpaid');
  const adjust =
    (l.flexAllowancePay ?? 0) + (l.nightAllowancePay ?? 0) + (l.offPaidPay ?? 0) + (l.otPay ?? 0) - (l.deductionAmount ?? 0);
  return {
    date: l.date,
    label: l.shiftLabel || l.shiftCode,
    mark,
    in: l.checkIn ?? null,
    out: l.checkOut ?? null,
    hours: mark === 'work' ? l.workHours : null,
    ot: l.otHours || null,
    makeup: null,
    note: null,
    adjust: adjust || null,
    total: l.dailyTotal
  };
}

// Nhóm OT: ba dòng theo hệ số; phiếu cũ chưa tách theo hệ số thì một dòng bằng tổng OT đã lưu (để trang 2 vẫn cộng đúng).
function otLines(d: A4DetailDTO): A4Line[] {
  if (d.ot15Pay == null) return [{ label: 'Làm thêm giờ', qty: { n: d.totalOtHours, unit: 'giờ' }, actual: d.otPayTotal }];
  return [
    { label: 'OT ngày thường (×1,5)', qty: { n: d.ot15Hours, unit: 'giờ' }, actual: d.ot15Pay },
    { label: 'OT ngày cuối tuần (×2)', qty: { n: d.ot20Hours, unit: 'giờ' }, actual: d.ot20Pay ?? 0 },
    { label: 'OT ngày lễ (×3)', qty: { n: d.ot30Hours, unit: 'giờ' }, actual: d.ot30Pay ?? 0 }
  ];
}

function groupsOf(d: A4DetailDTO): A4Group[] {
  const parts = Object.keys(KPI_LABELS) as KpiPart[];
  const kpi: A4Group[] = d.kpiApplicable
    ? [
        {
          title: 'Lương KPI',
          kpi: parts.map(p => ({ label: KPI_LABELS[p], weight: KPI_WEIGHTS[p], score: d.kpiScores?.[p] ?? null })),
          lines: [
            {
              label: 'Lương KPI',
              hint: 'theo tổng điểm',
              qty: { n: d.kpiTotalScorePct, unit: '%' },
              rule: d.kpiAppliedAmount,
              actual: d.kpiActualPay,
              bold: true
            }
          ]
        }
      ]
    : [];
  return [
    {
      title: 'Ngày công và lương cơ bản',
      lines: [
        {
          label: 'Lương cơ bản',
          qty: { n: d.actualWorkDays, of: d.standardWorkdays, unit: 'ngày' },
          rule: d.baseSalaryPolicy,
          actual: d.baseSalaryActual,
          bold: true
        }
      ]
    },
    {
      title: 'Nghỉ phép và ngày lễ',
      lines: [
        { label: 'Nghỉ có lương', qty: { n: d.paidLeaveDays, unit: 'ngày' }, actual: d.paidLeavePay },
        { label: 'Quyết toán phép dư', actual: d.leaveSettlementPay },
        { label: 'Nghỉ thứ 7 hưởng lương · iSAT', qty: { n: d.isatDays, unit: 'ngày' }, actual: d.isatPay },
        { label: 'Nghỉ lễ', qty: { n: d.holidayPaidDays, unit: 'ngày' }, actual: d.holidayPay }
      ]
    },
    { title: 'Làm thêm giờ', lines: otLines(d) },
    {
      title: 'Phụ cấp',
      lines: [
        { label: 'Chuyên cần', rule: d.attendanceAllowancePolicy, actual: d.attendanceAllowanceActual },
        { label: 'Đi lại', qty: { n: d.actualWorkDays, unit: 'ngày' }, rule: d.travelAllowancePolicy, actual: d.travelAllowanceActual },
        { label: 'Linh hoạt · ca Flex', qty: { n: d.flexShiftCount, unit: 'ca' }, rule: d.flexAllowancePolicy, actual: d.flexAllowanceActual },
        { label: 'Off Paid · ca Night', qty: { n: d.nightShiftCount, unit: 'ca' }, rule: d.offPaidNightPolicy, actual: d.offPaidNightActual },
        {
          label: 'Thưởng ca đêm · ca Night',
          qty: { n: d.nightShiftCount, unit: 'ca' },
          rule: d.nightAllowancePolicy,
          actual: d.nightAllowanceActual
        },
        { label: 'Tổng phụ cấp', actual: d.totalAllowanceActual, bold: true }
      ]
    },
    ...kpi,
    {
      title: 'Đi muộn, về sớm, ra ngoài',
      lines: [{ label: 'Đi muộn, về sớm', qty: { n: d.lateEarlyHours, unit: 'giờ' }, actual: d.lateEarlyDeductionAmount }]
    }
  ];
}

function totalsOf(d: A4DetailDTO): A4Line[] {
  return [
    { label: 'Tổng thu nhập', actual: d.grossIncome, bold: true },
    { label: 'Các khoản miễn thuế', actual: d.taxExemptIncome },
    { label: 'Thu nhập chịu thuế', actual: d.taxableIncome },
    { label: 'Bảo hiểm bắt buộc', actual: d.insuranceDeduction },
    { label: 'Thu nhập sau bảo hiểm', actual: d.incomeAfterInsurance, bold: true },
    { label: 'Thuế TNCN', actual: d.personalIncomeTax },
    { label: 'Tạm ứng', actual: d.advanceDeduction }
  ];
}

/** Bản in A4 của một phiếu BE v2. Mọi số lấy nguyên của BE. */
export function sheetFromRecord(r: A4RecordDTO): A4Sheet {
  const d = r.details;
  const [y, m] = d.month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    month: d.month,
    name: d.fullName || r.username,
    kind: employeeTypeLabel(d.employeeType),
    level: d.level ?? null,
    employmentStatus: employmentStatusLabel(d.employmentStatus),
    contract: d.contractStatusText || '—',
    from: `${d.month}-01`,
    to: `${d.month}-${String(last).padStart(2, '0')}`,
    periodNote: '',
    stdDays: d.standardWorkdays,
    dayRate: d.dayRate ?? null,
    days: (d.dailyLines ?? []).map(dayOf),
    stats: {
      workDays: d.actualWorkDays,
      flex: d.flexShiftCount,
      night: d.nightShiftCount,
      paidLeave: d.paidLeaveDays,
      isat: d.isatDays,
      unpaid: d.unpaidLeaveDays,
      absent: null,
      pending: null,
      otHours: d.totalOtHours,
      makeupHours: null,
      lateHours: d.lateEarlyHours
    },
    groups: groupsOf(d),
    totals: totalsOf(d),
    net: d.netIncome ?? r.net,
    leaveLeft: d.remainingAnnualLeaveDays ?? null,
    slipStatus: statusOf(r.status)
  };
}

/** In tất cả: các phiếu đã duyệt của kỳ, xếp theo tên như Bảng lương. */
export function approvedSheetsFromRecords(items: A4RecordDTO[]): A4Sheet[] {
  return items
    .filter(r => r.status === 'approved')
    .map(sheetFromRecord)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
