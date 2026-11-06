export interface RequestDates {
  leaveStartDate?: string | null;
  leaveEndDate?: string | null;
  otDate?: string | null;
  explanationDate?: string | null;
  changeStartDate?: string | null;
  changeEndDate?: string | null;
  advancePeriod?: string | null;
  makeupDates?: string[];
  isatSaturday?: string | null;
}

function monthIndex(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + (m - 1);
}

function monthFromIndex(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Mọi tháng (YYYY-MM) mà đơn chạm tới, không trùng, tăng dần. Khoảng ngày lấy cả các tháng ở giữa. */
export function requestMonths(r: RequestDates): string[] {
  const indexes = new Set<number>();
  const addRange = (from?: string | null, to?: string | null) => {
    const ends = [from, to].filter((d): d is string => !!d).map(d => monthIndex(d.slice(0, 7)));
    if (!ends.length) return;
    for (let i = Math.min(...ends); i <= Math.max(...ends); i++) indexes.add(i);
  };
  addRange(r.leaveStartDate, r.leaveEndDate);
  addRange(r.changeStartDate, r.changeEndDate);
  for (const d of [r.otDate, r.explanationDate, r.advancePeriod, r.isatSaturday, ...(r.makeupDates ?? [])]) addRange(d);
  return [...indexes].sort((a, b) => a - b).map(monthFromIndex);
}
