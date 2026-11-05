// Dựng dữ liệu hiển thị cho các màn Cài đặt từ phản hồi của kho cài đặt và danh mục chức vụ. Thuần: chỉ import tương đối.
import { monthShort, num, vnd } from '../../utils/format';
import { inForce, type LevelRow, type TypeRow } from './catalog';
import { FIELD_LABEL, fieldText, isEdited, type GroupKey, type HistoryItem, type SettingsResponse } from './settings';

/** Tên năm thành phần KPI theo thứ tự hiển thị. */
export const KPI_NAMES: Record<string, string> = {
  wework: 'Base Wework',
  user: 'Người dùng',
  peer: 'Đồng nghiệp',
  manager: 'Quản lý',
  self: 'Tự đánh giá'
};

/** Năm trọng số KPI đang hiệu lực và tổng của chúng. */
export function kpiRulesView(s: SettingsResponse): { weights: { label: string; percent: number }[]; total: number } {
  const values = s.groups.kpiWeights.values;
  const weights = Object.entries(KPI_NAMES).map(([key, label]) => ({ label, percent: Number(values[key]) }));
  return { weights, total: weights.reduce((n, w) => n + w.percent, 0) };
}

// ---------- Cách tính lương ----------

const money = (n: number) => `${vnd(n)} đ`;
const percent = (n: number) => `${num(n, 2)}%`;

export type PayRow = {
  key: string;
  op: '+' | '−';
  name: string;
  value: string;
  edited: boolean;
  drawer: string;
  action: 'Sửa' | 'Xem';
};

// Khoản của công thức lương mà mỗi ô cài đặt thuộc về (để viết dòng "Thay đổi gần đây").
const KHOAN_OF_FIELD: Record<string, string> = {
  weekdayRate: 'Tiền làm thêm giờ',
  weekendRate: 'Tiền làm thêm giờ',
  holidayRate: 'Tiền làm thêm giờ',
  diligenceLostFromDays: 'Phụ cấp',
  lateGraceMinutes: 'Khấu trừ đi muộn',
  wework: 'Lương KPI',
  user: 'Lương KPI',
  peer: 'Lương KPI',
  manager: 'Lương KPI',
  self: 'Lương KPI'
};

// Dòng lịch sử có id lớn nhất của ba nhóm (id chạy chung nên dòng lớn nhất là dòng mới nhất).
function recentChange(history: Partial<Record<GroupKey, HistoryItem[]>>): string {
  const all = [...(history.overtime ?? []), ...(history.attendance ?? []), ...(history.kpiWeights ?? [])];
  if (!all.length) return 'Chưa có thay đổi nào.';
  const last = all.reduce((a, b) => (b.id > a.id ? b : a));
  const from = last.month ? ` từ tháng ${monthShort(last.month)}` : '';
  const label = FIELD_LABEL[last.field] ?? last.field;
  return `Thay đổi gần đây: ${KHOAN_OF_FIELD[last.field] ?? last.field}, ${label} ${fieldText(last.field, last.to)}${from}.`;
}

/** Sáu khoản của công thức lương ở tháng của phản hồi, số khoản đã chỉnh và dòng thay đổi gần đây. */
export function payFormulaView(
  s: SettingsResponse,
  history: Partial<Record<GroupKey, HistoryItem[]>>
): { editedCount: number; rows: PayRow[]; recent: string } {
  const g = s.groups;
  const ot = g.overtime.values;
  const at = g.attendance.values;
  const kpi = g.kpiWeights.values;
  const rows: PayRow[] = [
    {
      key: 'luong-ngay-cong',
      op: '+',
      name: 'Lương theo ngày công',
      value: 'Công chuẩn 22 (T2–T6) · 26 (T2–T7)',
      edited: false,
      drawer: 'luong-ngay-cong',
      action: 'Xem'
    },
    {
      key: 'lam-them',
      op: '+',
      name: 'Tiền làm thêm giờ',
      value: `Ngày thường ${fieldText('weekdayRate', ot.weekdayRate as number)} · cuối tuần ${fieldText('weekendRate', ot.weekendRate as number)} · ngày lễ ${fieldText('holidayRate', ot.holidayRate as number)}`,
      edited: isEdited(g.overtime),
      drawer: 'lam-them',
      action: 'Sửa'
    },
    {
      key: 'phu-cap',
      op: '+',
      name: 'Phụ cấp',
      value: `${FIELD_LABEL.diligenceLostFromDays} ${fieldText('diligenceLostFromDays', at.diligenceLostFromDays as number)}`,
      edited: isEdited(g.attendance, ['diligenceLostFromDays']),
      drawer: 'phu-cap',
      action: 'Sửa'
    },
    {
      key: 'luong-kpi',
      op: '+',
      name: 'Lương KPI',
      value: `Trọng số ${Object.keys(KPI_NAMES)
        .map(k => kpi[k])
        .join(' · ')}`,
      edited: isEdited(g.kpiWeights),
      drawer: 'luong-kpi',
      action: 'Sửa'
    },
    {
      key: 'khau-tru',
      op: '−',
      name: 'Khấu trừ đi muộn',
      value: `Đi trễ tới ${at.lateGraceMinutes} phút vẫn hợp lệ`,
      edited: isEdited(g.attendance, ['lateGraceMinutes']),
      drawer: 'khau-tru',
      action: 'Sửa'
    },
    {
      key: 'tam-ung',
      op: '−',
      name: 'Tạm ứng',
      value: '80% lương của ngày công 01–15',
      edited: false,
      drawer: 'tam-ung',
      action: 'Xem'
    }
  ];
  return { editedCount: rows.filter(r => r.edited).length, rows, recent: recentChange(history) };
}

export type DrawerField = {
  field: string;
  label: string;
  prefix?: string;
  unit?: string;
  integer?: boolean;
  decimals?: number;
  money?: boolean;
};
export type ReadonlySection = { title: string; rows: { label: string; value: string }[] };

type DrawerDef = { title: string; sub: string; group: GroupKey | null; section: string; fields: DrawerField[] };

const TAM_UNG_TEXT = '80% lương của ngày công 01–15';

const DRAWER_DEFS: Record<string, DrawerDef> = {
  'luong-ngay-cong': {
    title: 'Lương theo ngày công',
    sub: 'Lương tháng chia công chuẩn, nhân số ngày công',
    group: null,
    section: '',
    fields: []
  },
  'lam-them': {
    title: 'Tiền làm thêm giờ',
    sub: 'Hệ số nhân với lương giờ khi làm thêm',
    group: 'overtime',
    section: 'Hệ số',
    fields: [
      { field: 'weekdayRate', label: 'Ngày thường', prefix: '×', decimals: 2 },
      { field: 'weekendRate', label: 'Cuối tuần', prefix: '×', decimals: 2 },
      { field: 'holidayRate', label: 'Ngày lễ', prefix: '×', decimals: 2 }
    ]
  },
  'phu-cap': {
    title: 'Phụ cấp',
    sub: 'Phụ cấp theo loại nhân sự và luật chuyên cần',
    group: 'attendance',
    section: 'Chuyên cần',
    fields: [{ field: 'diligenceLostFromDays', label: 'Mất chuyên cần khi nghỉ từ', unit: 'ngày', integer: true }]
  },
  'luong-kpi': {
    title: 'Lương KPI',
    sub: 'Trọng số của 5 điểm KPI, cộng lại đủ 100',
    group: 'kpiWeights',
    section: 'Trọng số',
    fields: Object.entries(KPI_NAMES).map(([field, label]) => ({ field, label, unit: '%', integer: true }))
  },
  'khau-tru': {
    title: 'Khấu trừ đi muộn, về sớm',
    sub: 'Ngưỡng đi trễ vẫn tính là đúng giờ',
    group: 'attendance',
    section: 'Khấu trừ',
    fields: [{ field: 'lateGraceMinutes', label: 'Đi trễ tới … phút vẫn hợp lệ', unit: 'phút', integer: true }]
  },
  'tam-ung': { title: 'Tạm ứng', sub: 'Số tiền được ứng giữa tháng', group: null, section: '', fields: [] }
};

// Loại nhân sự (sắp theo mã) kèm các bậc của loại đó, mỗi loại và mỗi bậc lấy bản đang hiệu lực ở `month`.
function typesAt(catalog: TypeRow[], month: string): { type: TypeRow; levels: LevelRow[] }[] {
  const allLevels = catalog.flatMap(r => r.levels || []);
  return inForce(catalog, r => r.code, month)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(type => ({
      type,
      levels: inForce(
        allLevels.filter(l => l.type_code === type.code),
        l => String(l.level_no),
        month
      ).sort((a, b) => a.level_no - b.level_no)
    }));
}

function readonlySections(key: string, catalog: TypeRow[], month: string): ReadonlySection[] {
  const types = typesAt(catalog, month);
  if (key === 'luong-ngay-cong') {
    return types.map(({ type, levels }) => ({
      title: type.name,
      rows: [
        { label: 'Công chuẩn', value: `${type.workdays} ngày` },
        ...levels.map(l => ({ label: l.name, value: money(l.base_salary) }))
      ]
    }));
  }
  if (key === 'phu-cap') {
    return types.map(({ type }) => ({
      title: type.name,
      rows: [
        { label: 'Đi lại', value: percent(type.travel_pct) },
        { label: 'Chuyên cần', value: percent(type.attendance_pct) },
        { label: 'Ca Flex', value: percent(type.flex_pct) },
        { label: 'Ca Night', value: percent(type.night_pct) }
      ]
    }));
  }
  if (key === 'luong-kpi') {
    const rows = types
      .filter(({ type }) => type.code === 'ctv' || type.code === 'nv')
      .flatMap(({ type, levels }) =>
        levels
          .filter(l => l.kpi_max != null)
          .map(l => ({ label: `${type.name} · ${l.name}`, value: money(l.kpi_max as number) }))
      );
    return [{ title: 'KPI tối đa theo bậc', rows }];
  }
  return [];
}

/** Nội dung ngăn kéo của một khoản: chữ đầu, nhóm và ô sửa được; phần chỉ xem lấy từ danh mục chức vụ ở `month`. */
export function payDrawerView(
  key: string,
  catalog: TypeRow[],
  month: string
): {
  title: string;
  sub: string;
  group: GroupKey | null;
  section: string;
  fields: DrawerField[];
  readonly: ReadonlySection[];
  link: boolean;
  text: string | null;
} {
  const def = DRAWER_DEFS[key];
  if (!def) throw new Error(`Không có ngăn kéo "${key}"`);
  return {
    ...def,
    readonly: readonlySections(key, catalog, month),
    link: key === 'luong-ngay-cong' || key === 'phu-cap' || key === 'luong-kpi',
    text: key === 'tam-ung' ? TAM_UNG_TEXT : null
  };
}
