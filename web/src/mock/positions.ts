// Dữ liệu giả của hai màn "Chế độ theo loại nhân sự" và "Chức vụ & bậc", cùng dạng GET /api/v2/employees/meta/positions:
// số và ô tick chép từ các dòng gieo position_types, position_type_benefits, position_levels của
// migrations/postgres/schema.sql; riêng TTS làm T2–T7, công chuẩn 26 như mọi người trong dữ liệu giả Admin.
// Thêm một phiên bản Nhân viên từ 12/2026 (Flex 25%) để thử tháng áp dụng. Lưu chỉ ghi lại lời gọi, không đổi số.
import type { LevelRow, TypeRow } from '@/builders/api/catalog';

const BENEFIT_CODES = [
  'ot',
  'makeup',
  'kpi',
  'paidHoliday',
  'paidLeave',
  'isat',
  'absenceDeclarable',
  'approvedLeave',
  'leaveAccount',
  'makeupHours',
  'makeupDay',
  'holidayWork',
  'idorm',
  'breakPay'
];
const ticks = (on: string[]) => Object.fromEntries(BENEFIT_CODES.map(k => [k, on.includes(k)]));
const TICKS: Record<string, Record<string, boolean>> = {
  ctv: ticks(['ot', 'makeup', 'kpi', 'paidHoliday', 'paidLeave', 'absenceDeclarable', 'leaveAccount', 'makeupHours', 'makeupDay', 'breakPay']),
  nv: ticks([
    'ot',
    'makeup',
    'kpi',
    'paidHoliday',
    'paidLeave',
    'isat',
    'absenceDeclarable',
    'approvedLeave',
    'leaveAccount',
    'makeupHours',
    'makeupDay',
    'idorm',
    'breakPay'
  ]),
  tts: ticks(['makeup', 'makeupHours', 'makeupDay'])
};

const level = (type_code: string, level_no: number, name: string, base_salary: number, kpi_max: number | null): LevelRow => ({
  type_code,
  level_no,
  effective_month: '2000-01',
  name,
  base_salary,
  kpi_max,
  night_pct: null,
  rev: 0
});
const LEVELS: LevelRow[] = [
  level('ctv', 1, 'Fresher', 6_000_000, 1_500_000),
  level('ctv', 2, 'Practitioner', 6_000_000, 3_000_000),
  level('ctv', 3, 'Advanced Practitioner', 6_000_000, 4_500_000),
  level('ctv', 4, 'Senior Practitioner', 6_000_000, 6_000_000),
  level('nv', 1, 'Nhân viên', 6_000_000, 6_000_000),
  level('nv', 2, 'Chuyên viên', 6_500_000, 6_500_000),
  level('nv', 3, 'Lead', 7_000_000, 7_000_000),
  level('nv', 4, 'Advisor', 7_500_000, 7_500_000),
  level('tts', 1, 'Explorer', 1_000_000, null),
  level('tts', 2, 'Learner', 1_500_000, null),
  level('tts', 3, 'Trainee', 2_000_000, null),
  level('tts', 4, 'Advanced Trainee', 3_000_000, null),
  level('tts', 5, 'Senior Trainee', 4_000_000, null),
  level('tts', 6, 'Practitioner in Training', 5_000_000, null)
];

type TypeSeed = Omit<TypeRow, 'levels' | 'benefits' | 'regular_dows' | 'rev' | 'effective_month'> &
  Partial<Pick<TypeRow, 'effective_month' | 'rev'>>;
const TYPES: TypeSeed[] = [
  { id: 1, code: 'ctv', name: 'Chuyên trách viên', workdays: 26, flex_pct: 10, night_pct: 30, travel_pct: 0, attendance_pct: 0 },
  { id: 2, code: 'nv', name: 'Nhân viên', workdays: 26, flex_pct: 20, night_pct: 40, travel_pct: 15, attendance_pct: 25 },
  { id: 3, code: 'tts', name: 'Thực tập sinh', workdays: 26, flex_pct: 10, night_pct: 30, travel_pct: 0, attendance_pct: 0 },
  {
    id: 4,
    code: 'nv',
    effective_month: '2026-12',
    name: 'Nhân viên',
    workdays: 26,
    flex_pct: 25,
    night_pct: 40,
    travel_pct: 15,
    attendance_pct: 25
  }
];

/** Mọi phiên bản chức vụ, mỗi phiên bản kèm 14 ô tick và mọi bậc cùng mã (như listPositionCatalog). */
export function mockCatalogRows(): TypeRow[] {
  return TYPES.map(t => ({
    effective_month: '2000-01',
    rev: 0,
    ...t,
    regular_dows: '[1,2,3,4,5,6]',
    benefits: { ...TICKS[t.code] },
    levels: LEVELS.filter(l => l.type_code === t.code).map(l => ({ ...l }))
  }));
}

/** Số người đang làm theo loại trong dữ liệu giả. */
export const MOCK_HEADCOUNT: Record<string, number> = { tts: 4, ctv: 3, nv: 12 };

/** Ghi lại lời gọi lưu vào globalThis.__mockPositionsWrites (cho test đọc), không đổi dữ liệu giả. */
export function mockWrite(method: string, path: string, body: any): { ok: true; effectiveMonth: string; level?: number } {
  const g = globalThis as { __mockPositionsWrites?: Array<{ method: string; path: string; body: any }> };
  if (!g.__mockPositionsWrites) g.__mockPositionsWrites = [];
  g.__mockPositionsWrites.push({ method, path, body: structuredClone(body) });
  return body && body.level != null ? { ok: true, effectiveMonth: body.effectiveMonth, level: body.level } : { ok: true, effectiveMonth: body.effectiveMonth };
}
