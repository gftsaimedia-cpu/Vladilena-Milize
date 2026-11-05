// Màn "Chế độ theo loại nhân sự" từ GET /api/v2/employees/meta/positions: một dòng mỗi loại (TTS, CTV, NV) theo
// phiên bản có hiệu lực ở tháng đang xem. Khi lưu, chỉ gửi ô đã sửa và khác phiên bản đang hiệu lực ở tháng áp dụng.
// Import tương đối để chạy được bằng node:test.
import { inForce, type TypeRow } from './catalog';
import { activeOn, type EmployeeDTO } from './staff';

export type BenefitCell = { key: string; label: string; kind: 'pct' | 'check' };
export type BenefitType = {
  key: 'thuc-tap-sinh' | 'chuyen-trach' | 'nhan-vien';
  code: 'tts' | 'ctv' | 'nv';
  name: string;
  count: number;
  nightByPerson: boolean; // NV chọn ca đêm 40% hay 60% theo từng người, không sửa ở màn này
  values: Record<string, number | boolean>;
  req: Record<string, boolean>;
};
export type BenefitsView = { columns: BenefitCell[]; requests: BenefitCell[]; types: BenefitType[] };
export type BenefitSaveItem = { code: string; expectedRev: number; changes: Record<string, unknown> };

const COLUMNS: BenefitCell[] = [
  { key: 'travelPct', label: 'Phụ cấp đi lại', kind: 'pct' },
  { key: 'attendancePct', label: 'Phụ cấp chuyên cần', kind: 'pct' },
  { key: 'flexPct', label: 'Phụ cấp Flex', kind: 'pct' },
  { key: 'nightPct', label: 'Phụ cấp ca đêm', kind: 'pct' },
  { key: 'kpi', label: 'Lương KPI', kind: 'check' },
  { key: 'idorm', label: 'iDorm', kind: 'check' }
];
const REQUESTS: BenefitCell[] = [
  { key: 'leaveAccount', label: 'Nghỉ phép năm', kind: 'check' },
  { key: 'isat', label: 'iSAT', kind: 'check' },
  { key: 'ot', label: 'OT', kind: 'check' },
  { key: 'makeup', label: 'Làm bù', kind: 'check' }
];
const TYPES: Array<Pick<BenefitType, 'code' | 'key'>> = [
  { code: 'tts', key: 'thuc-tap-sinh' },
  { code: 'ctv', key: 'chuyen-trach' },
  { code: 'nv', key: 'nhan-vien' }
];
const PCT_COLUMN: Record<string, 'travel_pct' | 'attendance_pct' | 'flex_pct' | 'night_pct'> = {
  travelPct: 'travel_pct',
  attendancePct: 'attendance_pct',
  flexPct: 'flex_pct',
  nightPct: 'night_pct'
};

const valueOf = (row: TypeRow, cell: BenefitCell): number | boolean =>
  cell.kind === 'pct' ? Number(row[PCT_COLUMN[cell.key]]) : row.benefits?.[cell.key] === true;

const shown = (cell: BenefitCell, v: number | boolean) =>
  cell.kind === 'pct' ? `${String(v).replace('.', ',')}%` : v ? 'Bật' : 'Tắt';

const inForceByCode = (rows: TypeRow[], month: string) => new Map(inForce(rows, r => r.code, month).map(r => [r.code, r]));

export function benefitsViewFromCatalog(rows: TypeRow[], month: string, headcount: Record<string, number>): BenefitsView {
  const current = inForceByCode(rows, month);
  const types: BenefitType[] = [];
  for (const t of TYPES) {
    const row = current.get(t.code);
    if (!row) continue;
    types.push({
      ...t,
      name: row.name,
      count: headcount[t.code] ?? 0,
      nightByPerson: t.code === 'nv',
      values: Object.fromEntries(COLUMNS.map(c => [c.key, valueOf(row, c)])),
      req: Object.fromEntries(REQUESTS.map(c => [c.key, valueOf(row, c) === true]))
    });
  }
  return { columns: COLUMNS.map(c => ({ ...c })), requests: REQUESTS.map(c => ({ ...c })), types };
}

// Ô đã sửa là ô mà bản nháp khác bản gốc; số cũ so với phiên bản đang hiệu lực ở tháng áp dụng `month`, bằng thì bỏ.
export function benefitChanges(
  rows: TypeRow[],
  month: string,
  base: BenefitsView,
  draft: BenefitsView
): { items: BenefitSaveItem[]; lines: string[] } {
  const current = inForceByCode(rows, month);
  const items: BenefitSaveItem[] = [];
  const lines: string[] = [];
  for (const t of draft.types) {
    const before = base.types.find(b => b.code === t.code);
    const row = current.get(t.code);
    if (!before || !row) continue;
    const changes: Record<string, unknown> = {};
    const ticks: Record<string, boolean> = {};
    const visit = (cell: BenefitCell, now: number | boolean, then: number | boolean) => {
      if (now === then) return;
      if (cell.key === 'nightPct' && t.nightByPerson) return;
      const old = valueOf(row, cell);
      if (old === now) return;
      if (cell.kind === 'pct') changes[cell.key] = now;
      else ticks[cell.key] = now === true;
      lines.push(`${t.name} · ${cell.label}: ${shown(cell, old)} → ${shown(cell, now)} · ${t.count} người`);
    };
    for (const c of COLUMNS) visit(c, t.values[c.key], before.values[c.key]);
    for (const c of REQUESTS) visit(c, t.req[c.key], before.req[c.key]);
    if (Object.keys(ticks).length) changes.benefits = ticks;
    if (Object.keys(changes).length) items.push({ code: t.code, expectedRev: row.rev, changes });
  }
  return { items, lines };
}

// Người khác vừa lưu: ô mình đã sửa giữ số của mình, các ô còn lại lấy số mới.
export function mergeStale(oldBase: BenefitsView, draft: BenefitsView, fresh: BenefitsView): BenefitsView {
  const merged = structuredClone(fresh);
  for (const t of merged.types) {
    const was = oldBase.types.find(x => x.code === t.code);
    const mine = draft.types.find(x => x.code === t.code);
    if (!was || !mine) continue;
    for (const k of Object.keys(t.values)) if (mine.values[k] !== was.values[k]) t.values[k] = mine.values[k];
    for (const k of Object.keys(t.req)) if (mine.req[k] !== was.req[k]) t.req[k] = mine.req[k];
  }
  return merged;
}

export function headcountFromEmployees(list: EmployeeDTO[], today: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of list) {
    if (!activeOn(e, today)) continue;
    const code = e.contract.position.type;
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}
