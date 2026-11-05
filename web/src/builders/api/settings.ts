// Kiểu dữ liệu của kho cài đặt (BE v2 §5), bảng đổi khoá nhóm ↔ đường dẫn và các hàm dựng chữ hiển thị. File thuần: không import gì của trang.
import { addMonths, monthLabel, monthNo, monthShort, num, vnd } from '../../utils/format';

export type GroupKey = 'overtime' | 'attendance' | 'kpiWeights' | 'insurance' | 'tax' | 'payCalendar';
export type GroupPath = 'overtime' | 'attendance' | 'kpi-weights' | 'insurance' | 'tax' | 'pay-calendar';

export const GROUP_PATH: Record<GroupKey, GroupPath> = {
  overtime: 'overtime',
  attendance: 'attendance',
  kpiWeights: 'kpi-weights',
  insurance: 'insurance',
  tax: 'tax',
  payCalendar: 'pay-calendar',
};

export type Bracket = { upTo: number | null; ratePct: number };
export type Values = Record<string, number | Bracket[]>;
export type GroupState = {
  from: string;
  stamp: number;
  values: Values;
  defaults: Values;
  limits: Record<string, any>;
  sum?: number;
};
export type SettingsResponse = { month: string; minMonth: string; groups: Record<GroupKey, GroupState> };
export type SaveBody = { effectiveMonth: string; values: Values; reason: string | null; stamp: number };
export type SaveResult = { ok: true; effectiveMonth: string; changed: string[]; stamp: number };
// from/to theo field: số; mảng bậc (brackets); { lat, lng, radiusM } (zone); mảng ngày hoặc null (weekdays);
// cả năm trọng số { wework, user, peer, manager, self } (weights: một dòng cho một lần lưu trọng số KPI, BE §5.1).
export type HistoryItem = {
  id: number;
  field: string;
  month: string | null;
  from: any;
  to: any;
  by: string;
  at: string;
  reason: string | null;
};
export type PayDayItem = { month: string; payDay: number; payDate: string };
export type WorkWeek = {
  username: string;
  month: string;
  minMonth: string;
  weekdays: number[];
  source: 'type' | 'own';
  from: string | null;
  standardWorkdays: number;
  typeWeekdays: number[];
  typeStandardWorkdays: number;
  stamp: number;
};
export type WorkWeekBody = { effectiveMonth: string; weekdays: number[] | null; reason: string | null; stamp: number };
export type Zone = { lat: number; lng: number; radiusM: number };
export type ShiftRow = {
  code: string;
  name: string;
  kind: 'normal' | 'flex' | 'night';
  startTime: string;
  endTime: string;
};

// ---------- Nhãn và chữ số ----------

export const FIELD_LABEL: Record<string, string> = {
  weekdayRate: 'OT ngày thường',
  weekendRate: 'OT cuối tuần',
  holidayRate: 'OT ngày lễ',
  lateGraceMinutes: 'Đi trễ vẫn hợp lệ tới',
  diligenceLostFromDays: 'Mất chuyên cần khi nghỉ từ',
  wework: 'Trọng số Base Wework',
  user: 'Trọng số Người dùng',
  peer: 'Trọng số Đồng nghiệp',
  manager: 'Trọng số Quản lý',
  self: 'Trọng số Tự đánh giá',
  weights: 'Trọng số KPI', // dòng lịch sử của cả năm trọng số
  bhxhPct: 'BHXH',
  bhytPct: 'BHYT',
  bhtnPct: 'BHTN',
  personalDeduction: 'Giảm trừ bản thân',
  dependantDeduction: 'Giảm trừ người phụ thuộc',
  shortContractPct: 'Hợp đồng ngắn hạn, tỉ lệ khấu trừ',
  shortContractThreshold: 'Hợp đồng ngắn hạn, khi thu nhập từ',
  payDay: 'Ngày trả lương',
  brackets: 'Biểu thuế',
  // Hai dòng lịch sử không thuộc nhóm cài đặt: vùng chấm công và tuần làm việc.
  zone: 'Vùng chấm công',
  weekdays: 'Tuần làm việc',
};

const RATE_FIELDS = ['weekdayRate', 'weekendRate', 'holidayRate'];
const KPI_FIELDS = ['wework', 'user', 'peer', 'manager', 'self'];
const PCT_FIELDS = ['bhxhPct', 'bhytPct', 'bhtnPct', 'shortContractPct', 'ratePct'];
const MONEY_FIELDS = ['personalDeduction', 'dependantDeduction', 'shortContractThreshold', 'upTo'];

const money = (n: number | null) => (n == null ? '—' : `${vnd(n)} đ`);

/** Chữ số của một ô: ×1.5, 15 phút, 3 ngày, 40%, 1,5%, 15.500.000 đ, 10. */
export function fieldText(field: string, value: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  if (RATE_FIELDS.includes(field)) return `×${value}`;
  if (field === 'lateGraceMinutes') return `${value} phút`;
  if (field === 'diligenceLostFromDays') return `${value} ngày`;
  if (KPI_FIELDS.includes(field)) return `${value}%`;
  if (PCT_FIELDS.includes(field)) return `${num(value, 2)}%`;
  if (MONEY_FIELDS.includes(field)) return money(value);
  return String(value);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const scalarFields = (values: Values) => Object.keys(values).filter(f => f !== 'brackets');

/** Đã sửa so với mặc định trên các ô `fields` (mặc định: mọi ô của nhóm). */
export function isEdited(state: GroupState, fields?: string[]): boolean {
  return (fields ?? Object.keys(state.defaults)).some(f => !same(state.values[f], state.defaults[f]));
}

// ---------- Kiểm tra ----------

const NEED_NUMBER = 'Nhập một số';
const rangeText = (field: string, lim: { min: number; max: number }) =>
  `Từ ${fieldText(field, lim.min)} đến ${fieldText(field, lim.max)}`;

/** Lỗi theo khoá ô; chỉ có khoá khi ô sai, đủ cả thì trả {}. */
export function groupErrors(group: GroupKey, values: Values, state: GroupState): Record<string, string> {
  void group;
  const errors: Record<string, string> = {};
  let empty = false;
  for (const f of scalarFields(state.values)) {
    const v = values[f];
    const lim = state.limits[f];
    if (!isNum(v)) {
      errors[f] = NEED_NUMBER;
      empty = true;
    } else if (lim && (v < lim.min || v > lim.max)) errors[f] = rangeText(f, lim);
  }
  const brackets = values.brackets;
  if (Array.isArray(brackets)) {
    const lim = state.limits.brackets;
    brackets.forEach((b, i) => {
      const isLast = i === brackets.length - 1;
      const prev = i > 0 ? brackets[i - 1].upTo : null;
      if (!isLast) {
        if (!isNum(b.upTo)) errors[`brackets.${i}.upTo`] = NEED_NUMBER;
        else if (lim && (b.upTo < lim.upTo.min || b.upTo > lim.upTo.max)) errors[`brackets.${i}.upTo`] = rangeText('upTo', lim.upTo);
        else if (isNum(prev) && b.upTo <= prev) errors[`brackets.${i}.upTo`] = `Phải lớn hơn ${money(prev)}`;
      }
      if (!isNum(b.ratePct)) errors[`brackets.${i}.ratePct`] = NEED_NUMBER;
      else if (lim && (b.ratePct < lim.ratePct.min || b.ratePct > lim.ratePct.max)) errors[`brackets.${i}.ratePct`] = rangeText('ratePct', lim.ratePct);
    });
  }
  if (state.sum !== undefined && !empty) {
    const sum = Math.round(scalarFields(state.values).reduce((s, f) => s + (values[f] as number), 0) * 100) / 100;
    if (sum !== state.sum) errors._sum = `Tổng ${num(sum, 2)}/${state.sum}`;
  }
  return errors;
}

// ---------- Câu xác nhận ----------

const arrow = (a: string, b: string) => `${a} → ${b}`;
const upToText = (n: number | null) => (n == null ? 'không giới hạn' : money(n));

// Mỗi ô của biểu thuế đổi là một phần: "bậc 2, đến 30.000.000 đ → 35.000.000 đ".
function bracketParts(before: Bracket[], after: Bracket[]): string[] {
  const parts: string[] = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) {
    const a = before[i];
    const b = after[i];
    if (a && b) {
      if (a.upTo !== b.upTo) parts.push(`bậc ${i + 1}, đến ${arrow(upToText(a.upTo), upToText(b.upTo))}`);
      if (a.ratePct !== b.ratePct) parts.push(`bậc ${i + 1}, thuế suất ${arrow(fieldText('ratePct', a.ratePct), fieldText('ratePct', b.ratePct))}`);
    } else if (b) parts.push(`thêm bậc ${i + 1}, đến ${upToText(b.upTo)}, thuế suất ${fieldText('ratePct', b.ratePct)}`);
    else parts.push(`bỏ bậc ${i + 1}`);
  }
  return parts;
}

/** Mỗi ô đổi một dòng: "<nhãn> <cũ> → <mới>, áp dụng từ tháng MM/YYYY". */
export function confirmLines(group: GroupKey, before: Values, after: Values, month: string): string[] {
  void group;
  const tail = `, áp dụng từ tháng ${monthShort(month)}`;
  const lines: string[] = [];
  for (const f of Object.keys(after)) {
    if (same(before[f], after[f])) continue;
    if (f === 'brackets') {
      for (const part of bracketParts(before[f] as Bracket[], after[f] as Bracket[])) lines.push(`Biểu thuế ${part}${tail}`);
    } else {
      lines.push(`${FIELD_LABEL[f] ?? f} ${arrow(fieldText(f, before[f] as number), fieldText(f, after[f] as number))}${tail}`);
    }
  }
  return lines;
}

// ---------- Vùng chấm công ----------

/** Lỗi của vùng: bán kính nguyên 20–5000 m, vĩ độ −90…90, kinh độ −180…180. */
export function zoneErrors(z: { lat: number | null; lng: number | null; radiusM: number | null }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isNum(z.lat)) errors.lat = NEED_NUMBER;
  else if (z.lat < -90 || z.lat > 90) errors.lat = 'Từ -90 đến 90';
  if (!isNum(z.lng)) errors.lng = NEED_NUMBER;
  else if (z.lng < -180 || z.lng > 180) errors.lng = 'Từ -180 đến 180';
  if (!isNum(z.radiusM)) errors.radiusM = NEED_NUMBER;
  else if (!Number.isInteger(z.radiusM) || z.radiusM < 20 || z.radiusM > 5000) errors.radiusM = `Từ 20 đến ${vnd(5000)} m`;
  return errors;
}

const coord = (n: number) => num(n, 6);

// Mỗi ô của vùng đổi là một phần: "Bán kính 150 m → 200 m".
function zoneParts(before: Zone, after: Zone): string[] {
  const parts: string[] = [];
  if (before.lat !== after.lat) parts.push(`Vĩ độ ${arrow(coord(before.lat), coord(after.lat))}`);
  if (before.lng !== after.lng) parts.push(`Kinh độ ${arrow(coord(before.lng), coord(after.lng))}`);
  if (before.radiusM !== after.radiusM) parts.push(`Bán kính ${arrow(`${before.radiusM} m`, `${after.radiusM} m`)}`);
  return parts;
}

const zoneFirst = (z: Zone) => `Vùng chấm công ${coord(z.lat)}, ${coord(z.lng)}, bán kính ${z.radiusM} m`;

export function zoneLines(before: Zone | null, after: Zone): string[] {
  if (!before) return [`${zoneFirst(after)}, áp dụng ngay`];
  return zoneParts(before, after).map(p => `${p}, áp dụng ngay`);
}

// ---------- Tuần làm việc ----------

/** [1..6] → "T2–T7"; từ 3 ngày liền nhau gộp thành Ta–Tb, còn lại nối bằng ", ". */
export function weekdaysText(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const day = (d: number) => `T${d + 1}`;
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) parts.push(`${day(sorted[i])}–${day(sorted[j])}`);
    else for (let k = i; k <= j; k++) parts.push(day(sorted[k]));
    i = j + 1;
  }
  return parts.join(', ');
}

/** Công chuẩn theo số ngày làm trong tuần (D5): làm tròn n × 52 / 12. */
export const standardWorkdays = (n: number): number => Math.round((n * 52) / 12);

export function workWeekLine(ww: WorkWeek, upcoming?: { month: string; weekdays: number[] | null } | null): string {
  const base = `${weekdaysText(ww.weekdays)} · công chuẩn ${ww.standardWorkdays}`;
  let line = ww.source === 'own' ? `${base} · riêng từ ${monthShort(ww.from ?? ww.month)}` : `${base} · theo loại nhân sự`;
  if (upcoming && upcoming.month > ww.month) {
    const next = upcoming.weekdays
      ? `${weekdaysText(upcoming.weekdays)} · công chuẩn ${standardWorkdays(upcoming.weekdays.length)}`
      : 'theo loại nhân sự';
    line += `; từ ${monthShort(upcoming.month)}: ${next}`;
  }
  return line;
}

// ---------- Ngày trả lương ----------

/** Các ngày trả lương rơi vào năm `year`, tăng dần, không trùng. */
export function payDatesIn(year: number, items: PayDayItem[]): string[] {
  const dates = items.map(i => i.payDate).filter(d => d.startsWith(`${year}-`));
  return [...new Set(dates)].sort();
}

export function payDayHint(month: string, payDay: number): string {
  const day = String(payDay).padStart(2, '0');
  const next = addMonths(month, 1).slice(5, 7);
  return `Từ 1 đến 28. Lương tháng ${monthNo(month)} trả ngày ${day}/${next}. Trùng Chủ nhật hoặc ngày lễ vẫn trả đúng ngày này.`;
}

// ---------- Dòng lịch sử ----------

const two = (n: number) => String(n).padStart(2, '0');

// Giờ Việt Nam = UTC+7 cố định, không phụ thuộc múi giờ máy.
function vnTime(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3600 * 1000);
  return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/** Các ô một dòng lịch sử đã đổi: dòng `weights` là các trọng số có số khác nhau giữa from và to; dòng khác là chính ô của nó. */
export function historyFields(item: HistoryItem): string[] {
  if (item.field !== 'weights') return [item.field];
  return KPI_FIELDS.filter(f => !same(item.from?.[f], item.to?.[f]));
}

function changeText(item: HistoryItem): string {
  const { field, from, to } = item;
  if (field === 'weights') {
    return historyFields(item)
      .map(f => `${FIELD_LABEL[f]} ${arrow(fieldText(f, from[f]), fieldText(f, to[f]))}`)
      .join('; ');
  }
  if (field === 'brackets') return bracketParts(from ?? [], to ?? []).join('; ');
  if (field === 'zone') {
    if (!to) return '—';
    return from ? zoneParts(from, to).join('; ') : zoneFirst(to).replace('Vùng chấm công ', '');
  }
  if (field === 'weekdays') {
    const text = (d: number[] | null) => (d ? weekdaysText(d) : 'theo loại nhân sự');
    return arrow(text(from), text(to));
  }
  return arrow(fieldText(field, from), fieldText(field, to));
}

/** Chữ hiện của một dòng lịch sử. `field` là một trọng số: dòng `weights` hiện như dòng của riêng trọng số đó. */
export function historyRow(
  item: HistoryItem,
  field?: string
): {
  id: number;
  field: string;
  label: string;
  month: string;
  change: string;
  reason: string;
  by: string;
  at: string;
} {
  const shown: HistoryItem =
    item.field === 'weights' && field && field !== 'weights'
      ? { ...item, field, from: item.from?.[field], to: item.to?.[field] }
      : item;
  return {
    id: item.id,
    field: shown.field,
    label: FIELD_LABEL[shown.field] ?? shown.field,
    month: item.month ? monthLabel(item.month) : '—',
    change: changeText(shown),
    reason: item.reason && item.reason.trim() ? item.reason : '—',
    by: item.by,
    at: vnTime(item.at),
  };
}
