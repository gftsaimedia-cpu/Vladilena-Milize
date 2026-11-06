// Bản in phiếu lương A4 từ phiếu BE v2 (GET /api/v2/payroll/:month/:id, và GET /api/v2/payroll/:month cho In tất cả).
// BE tính sẵn mọi số; ở đây chỉ ghép ô theo docs/fe-yeu-cau/in-phieu-luong-a4--noi-api-v2.md. Phiếu lưu trước khi BE có
// trường mới (loại, bậc, giờ vào/ra, OT theo hệ số, lương ngày) để ô đó trống hay "—", không báo lỗi.
// Không có nguồn ở v2 nên không in: Vắng, Chờ giải trình, Làm bù (ô tổng hợp in "—"). Cột Làm bù và Ghi chú của dòng ngày
// chỉ có ở ngày nghỉ giữa ca ("Nửa ca") và ngày có giờ làm thêm bù nợ nghỉ giữa ca (repaidMinutes).
import type { A4Day, A4Group, A4Line, A4Sheet, DayMark } from '../../mock/payslip-a4';
import { KPI_LABELS, employeeTypeLabel, employmentStatusLabel } from '../../constants/labels';
import { num } from '../../utils/format';
import type { SlipRates } from '../../mock/payroll';
import type { KpiPart } from '../../mock/payroll-calc';
import { halfShiftNote, halfShiftPayOf, type HalfShiftPayDTO } from './half-shift-pay';

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
  halfShift?: 'FIRST' | 'SECOND' | null; // ngày nghỉ giữa ca
  repaidMinutes?: number; // phút làm thêm của ngày dùng để bù nợ nghỉ giữa ca
};

// Các trường của `details` mà bản in đọc. Trường đánh dấu ? có thể thiếu ở phiếu lưu trước khi BE thêm chúng.
export type A4DetailDTO = HalfShiftPayDTO & {
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
  rates?: SlipRates; // tỉ lệ BE áp cho kỳ; thiếu ở phiếu lưu trước khi BE thêm: không in tỉ lệ
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
    // Giờ làm thêm dùng để bù nghỉ giữa ca vào cột Làm bù; ngày nghỉ giữa ca ghi "Nửa ca".
    makeup: l.repaidMinutes ? l.repaidMinutes / 60 : null,
    note: l.halfShift ? 'Nửa ca' : null,
    adjust: adjust || null,
    total: l.dailyTotal
  };
}

// Nhóm OT: ba dòng theo hệ số; phiếu cũ chưa tách theo hệ số thì một dòng bằng tổng OT đã lưu (để trang 2 vẫn cộng đúng).
function otLines(d: A4DetailDTO): A4Line[] {
  if (d.ot15Pay == null) return [{ label: 'Làm thêm giờ', qty: { n: d.totalOtHours, unit: 'giờ' }, actual: d.otPayTotal }];
  // Hệ số lấy từ cài đặt BE áp cho kỳ; phiếu cũ chưa có thì nhãn không ghi hệ số.
  const m = d.rates?.otMultipliers;
  const tag = (rate?: number) => (rate == null ? '' : ` (×${num(rate)})`);
  return [
    { label: `OT ngày thường${tag(m?.weekday)}`, qty: { n: d.ot15Hours, unit: 'giờ' }, actual: d.ot15Pay },
    { label: `OT ngày cuối tuần${tag(m?.weekend)}`, qty: { n: d.ot20Hours, unit: 'giờ' }, actual: d.ot20Pay ?? 0 },
    { label: `OT ngày lễ${tag(m?.holiday)}`, qty: { n: d.ot30Hours, unit: 'giờ' }, actual: d.ot30Pay ?? 0 }
  ];
}

// Bù nghỉ giữa ca: khoản riêng của BE (×1, không phụ cấp), chỉ khi tháng có nợ.
function halfShiftLines(d: A4DetailDTO): A4Line[] {
  const h = halfShiftPayOf(d);
  return h ? [{ label: 'Bù nghỉ giữa ca', hint: halfShiftNote(h), actual: h.pay }] : [];
}

function groupsOf(d: A4DetailDTO): A4Group[] {
  const parts = Object.keys(KPI_LABELS) as KpiPart[];
  const kpi: A4Group[] = d.kpiApplicable
    ? [
        {
          title: 'Lương KPI',
          kpi: parts.map(p => ({ label: KPI_LABELS[p], weight: d.rates?.kpiWeights?.[p] ?? null, score: d.kpiScores?.[p] ?? null })),
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
    { title: 'Làm thêm giờ', lines: [...otLines(d), ...halfShiftLines(d)] },
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
    otRates: d.rates?.otMultipliers ?? null
  };
}

/** In tất cả: các phiếu đã duyệt của kỳ, xếp theo tên như Bảng lương. */
export function approvedSheetsFromRecords(items: A4RecordDTO[]): A4Sheet[] {
  return items
    .filter(r => r.status === 'approved')
    .map(sheetFromRecord)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
