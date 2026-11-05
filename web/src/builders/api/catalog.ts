// Danh mục chức vụ và bậc từ GET /api/v2/employees/meta/positions (dòng thô của position_types kèm position_levels),
// đổi về dạng mà builders/admin-catalog/positions đọc. Mỗi chức vụ / bậc lấy dòng có hiệu lực mới nhất không sau
// tháng đang xem. Mỗi dòng chức vụ kèm ô tick quyền lợi (position_type_benefits) của chính phiên bản đó.
export type LevelRow = { type_code: string; level_no: number; effective_month: string; name: string; base_salary: number; kpi_max: number | null; night_pct: number | null; rev: number };
export type TypeRow = {
  id: number;
  code: string;
  effective_month: string;
  name: string;
  workdays: number;
  flex_pct: number;
  night_pct: number;
  travel_pct: number;
  attendance_pct: number;
  regular_dows: string;
  rev: number;
  levels: LevelRow[];
  benefits?: Record<string, boolean>;
};

// Sáu ô tick quyền lợi của mỗi loại nhân sự, cùng khoá với BE (src/modules/positions/domain/position-input.ts).
export const BENEFIT_KEYS = ['kpi', 'idorm', 'leaveAccount', 'isat', 'ot', 'makeup'];

const parseDows = (s: string): number[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

// Dòng có hiệu lực ở `month` của mỗi khoá: effective_month lớn nhất mà không sau month.
export function inForce<T extends { effective_month: string }>(rows: T[], keyOf: (r: T) => string, month: string): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    if (r.effective_month > month) continue;
    const cur = best.get(keyOf(r));
    if (!cur || r.effective_month > cur.effective_month) best.set(keyOf(r), r);
  }
  return [...best.values()];
}

export function positionsResponseFromCatalog(rows: TypeRow[], month: string) {
  const types = inForce(rows, r => r.code, month).sort((a, b) => a.code.localeCompare(b.code));
  const allLevels = rows.flatMap(r => r.levels || []);
  return {
    month,
    baseMonth: '2000-01',
    benefits: [...BENEFIT_KEYS],
    positions: types.map(t => ({
      code: t.code,
      name: t.name,
      effectiveMonth: t.effective_month,
      workdays: t.workdays,
      flexPct: t.flex_pct,
      nightPct: t.night_pct,
      travelPct: t.travel_pct,
      attendancePct: t.attendance_pct,
      regularDows: parseDows(t.regular_dows),
      benefits: t.benefits || {},
      rev: t.rev,
      levels: inForce(allLevels.filter(l => l.type_code === t.code), l => String(l.level_no), month)
        .sort((a, b) => a.level_no - b.level_no)
        .map(l => ({ level: l.level_no, name: l.name, baseSalary: l.base_salary, kpiMax: l.kpi_max, nightPct: l.night_pct, rev: l.rev }))
    }))
  };
}
