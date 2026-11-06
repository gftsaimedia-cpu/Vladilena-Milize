import { businessDateText } from '../../../common/business-date';
import { staffStatusOf } from '../../departments/domain';
import type { EmployeeDTO } from './employee';

// Số liệu màn Nhân sự và Chế độ theo loại: BE tính, FE chỉ hiện. Mọi ngày theo giờ Việt Nam (YYYY-MM-DD).

export type WorkStatus = 'ok' | 'try' | 'off' | 'out';

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  ok: 'Chính thức',
  try: 'Thử việc',
  off: 'Tạm nghỉ',
  out: 'Đã nghỉ việc'
};

export interface WorkInfo {
  /** Đang làm vào ngày tính (`summary.asOf`). */
  active: boolean;
  status: WorkStatus;
  statusLabel: string;
  /** Ngày vào làm: ngày hiệu lực hợp đồng, thiếu thì ngày tạo tài khoản (giờ VN). */
  joinedOn: string;
  /** Thâm niên đến ngày tính ("2 năm 8 tháng", "12 ngày"); rỗng khi đã nghỉ việc hoặc chưa tới ngày vào làm. */
  tenure: string;
}

export interface Delta {
  dir: 'up' | 'down';
  value: number;
}
export interface Metric {
  value: number;
  prev: number;
  delta: Delta;
}

export interface StaffSummary {
  month: string;
  /** Ngày tính: hôm nay nếu `month` là tháng này, ngược lại cuối tháng `month`. */
  asOf: string;
  prevMonth: string;
  /** Năm so sánh thâm niên: cuối năm trước năm của `asOf`. */
  compareYear: number;
  total: number;
  active: Metric;
  joined: Metric;
  left: Metric;
  /** Thâm niên trung bình (năm, 1 chữ số thập phân) của người đang làm. */
  tenure: Metric;
  /** Tài khoản chưa kích hoạt (đang bị khoá) trong mọi hồ sơ. */
  inactiveAccounts: number;
  byType: Record<string, number>;
  byLevel: Record<string, Record<string, number>>;
  byTerm: { long: number; short: number; unset: number };
  byStatus: Record<WorkStatus, number>;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const round1 = (n: number) => Math.round(n * 10) / 10;

export const monthEnd = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
export const prevMonthOf = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
};

export const joinedOn = (e: EmployeeDTO): string =>
  e.contract.effectiveFrom || businessDateText(new Date(e.account.createdAt));

/** Đang làm vào `date`: đã vào làm và chưa nghỉ việc (nghỉ việc không ghi ngày thì coi như đã nghỉ). */
export function isActiveOn(e: EmployeeDTO, date: string): boolean {
  if (joinedOn(e) > date) return false;
  if (e.contract.resignedOn) return e.contract.resignedOn > date;
  return e.contract.status !== 'nghiviec';
}

const WORK_STATUS_OF = { working: 'ok', probation: 'try', on_leave: 'off', resigned: 'out' } as const;

/** Trạng thái nhân sự hôm nay (`today`): cùng luật với `staffStatus` của GET /employees (nghỉ việc, tạm nghỉ theo ngày, thử việc). */
export function workStatus(e: EmployeeDTO, today: string): WorkStatus {
  const { status, onLeaveFrom, onLeaveTo } = e.contract as EmployeeDTO['contract'] & { onLeaveFrom?: string | null; onLeaveTo?: string | null };
  return WORK_STATUS_OF[staffStatusOf({ contractStatus: status, onLeaveFrom: onLeaveFrom ?? null, onLeaveTo: onLeaveTo ?? null }, today)];
}

/** Thâm niên dạng chữ giữa hai ngày; `to` sớm hơn `from` thì rỗng. */
export function tenureText(from: string, to: string): string {
  if (Date.parse(to) < Date.parse(from)) return '';
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 1) return `${Math.round((Date.parse(to) - Date.parse(from)) / 86400000)} ngày`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years && `${years} năm`, rest && `${rest} tháng`].filter(Boolean).join(' ');
}

/** Ngày tính của tháng `month`: hôm nay nếu là tháng này, ngược lại ngày cuối tháng. */
export const asOfFor = (month: string, today: string): string => (month === today.slice(0, 7) ? today : monthEnd(month));

export function workOf(e: EmployeeDTO, asOf: string, today: string = asOf): WorkInfo {
  const status = workStatus(e, today);
  const joined = joinedOn(e);
  return {
    active: isActiveOn(e, asOf),
    status,
    statusLabel: WORK_STATUS_LABEL[status],
    joinedOn: joined,
    tenure: status === 'out' ? '' : tenureText(joined, asOf)
  };
}

const yearsBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / (365.25 * 86400000);

function avgTenure(list: EmployeeDTO[], date: string): number {
  const active = list.filter(e => isActiveOn(e, date));
  if (!active.length) return 0;
  return active.reduce((n, e) => n + yearsBetween(joinedOn(e), date), 0) / active.length;
}

function metric(value: number, prev: number, round = (n: number) => n): Metric {
  return { value: round(value), prev: round(prev), delta: { dir: value >= prev ? 'up' : 'down', value: round(Math.abs(value - prev)) } };
}

/** Tóm tắt toàn bộ nhân sự (không theo bộ lọc) cho tháng `month` ('YYYY-MM'). */
export function summarizeStaff(list: EmployeeDTO[], month: string, today: string): StaffSummary {
  const asOf = asOfFor(month, today);
  const prevMonth = prevMonthOf(month);
  const compareYear = Number(asOf.slice(0, 4)) - 1;
  const inMonth = (d: string | null, ym: string) => !!d && d.startsWith(ym);
  const activeOnDate = (d: string) => list.filter(e => isActiveOn(e, d)).length;
  const joined = (ym: string) => list.filter(e => inMonth(joinedOn(e), ym)).length;
  const left = (ym: string) => list.filter(e => inMonth(e.contract.resignedOn, ym)).length;

  const byType: Record<string, number> = {};
  const byLevel: Record<string, Record<string, number>> = {};
  const byTerm = { long: 0, short: 0, unset: 0 };
  const byStatus: Record<WorkStatus, number> = { ok: 0, try: 0, off: 0, out: 0 };
  let inactiveAccounts = 0;
  for (const e of list) {
    if (e.account.isLocked) inactiveAccounts++;
    if (!isActiveOn(e, asOf)) continue;
    const { type, level } = e.contract.position;
    byType[type] = (byType[type] ?? 0) + 1;
    const lv = (byLevel[type] ??= {});
    lv[String(level)] = (lv[String(level)] ?? 0) + 1;
    byTerm[e.contract.term ?? 'unset']++;
    byStatus[workStatus(e, today)]++;
  }

  return {
    month,
    asOf,
    prevMonth,
    compareYear,
    total: list.length,
    active: metric(activeOnDate(asOf), activeOnDate(monthEnd(prevMonth))),
    joined: metric(joined(month), joined(prevMonth)),
    left: metric(left(month), left(prevMonth)),
    tenure: metric(avgTenure(list, asOf), avgTenure(list, `${compareYear}-12-31`), round1),
    inactiveAccounts,
    byType,
    byLevel,
    byTerm,
    byStatus
  };
}
