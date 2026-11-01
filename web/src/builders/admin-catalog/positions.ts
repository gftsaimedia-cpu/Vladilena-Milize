// Dựng màn Chức vụ và bậc từ GET /catalog/positions và so ô đã sửa với dòng đang hiệu lực để chỉ gửi trường khác.
import { monthLabel, vndc } from '@/utils/format';

const BENEFIT_LABEL = {
  ot: 'OT',
  makeup: 'Làm bù',
  kpi: 'Lương KPI',
  paidHoliday: 'Lễ hưởng lương',
  paidLeave: 'Nghỉ phép năm',
  isat: 'iSAT',
  absenceDeclarable: 'Khai nghỉ',
  approvedLeave: 'Nghỉ được duyệt',
  leaveAccount: 'Quỹ phép',
  makeupHours: 'Làm bù theo giờ',
  idorm: 'iDorm',
  breakPay: 'Off Paid (ca đêm)'
};
const HIDDEN_BENEFITS = ['makeupDay'];

// Thứ trong tuần theo thứ tự Thứ 2 đến Chủ nhật (0 = Chủ nhật)
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_NAME = { 0: 'CN', 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7' };

export const PCT_FIELDS = [
  ['flexPct', 'Phụ cấp Flex'],
  ['nightPct', 'Phụ cấp Night'],
  ['travelPct', 'Phụ cấp đi lại'],
  ['attendancePct', 'Phụ cấp chuyên cần']
];

const pct = (v?) => (v == null ? '—' : `${String(v).replace('.', ',')} %`);
const dows = (list?) =>
  DOW_ORDER.filter(d => (list || []).includes(d))
    .map(d => DOW_NAME[d])
    .join(', ') || '—';

export function buildPositions(res?) {
  const benefitCodes = (res.benefits || []).filter(b => !HIDDEN_BENEFITS.includes(b));
  const positions = (res.positions || []).map(p => ({
    code: p.code,
    name: p.name,
    since:
      p.effectiveMonth && p.effectiveMonth !== res.baseMonth ? `Từ ${monthLabel(p.effectiveMonth).toLowerCase()}` : '',
    facts: [
      { label: 'Ngày công chuẩn', value: String(p.workdays) },
      ...PCT_FIELDS.map(([key, label]: any) => ({ label, value: pct(p[key]) })),
      { label: 'Ngày làm việc', value: dows(p.regularDows) }
    ],
    benefits: benefitCodes.filter(b => p.benefits && p.benefits[b] === true).map(b => BENEFIT_LABEL[b] || b),
    levels: (p.levels || []).map(l => ({
      level: l.level,
      name: l.name,
      base: vndc(l.baseSalary),
      kpi: l.kpiMax == null ? '' : vndc(l.kpiMax),
      night: l.nightPct == null ? '' : pct(l.nightPct)
    })),
    raw: p
  }));
  return {
    month: res.month,
    positions,
    positionCount: positions.length,
    levelCount: positions.reduce((n, p) => n + p.levels.length, 0)
  };
}

/** Chỉ các trường của chức vụ khác dòng đang hiệu lực. */
export function positionChanges(cur?, typed?) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(typed)) if (value !== cur[key]) out[key] = value;
  return out;
}

/** Sửa bậc: chỉ trường khác dòng bậc đang hiệu lực; thêm bậc (không có dòng): gửi đủ. */
export function levelChanges(row?, typed?) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(typed)) if (!row || value !== row[key]) out[key] = value;
  return out;
}
