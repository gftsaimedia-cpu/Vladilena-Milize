// Dựng dữ liệu hiển thị cho các màn Cài đặt từ phản hồi của kho cài đặt và danh mục chức vụ. Thuần: chỉ import tương đối.
import { monthShort, num, vnd } from '../../utils/format';
import { inForce, type LevelRow, type TypeRow } from './catalog';
import {
  FIELD_LABEL,
  fieldText,
  isEdited,
  type GroupKey,
  type historyRow,
  type HistoryItem,
  type SettingsResponse,
  type Values
} from './settings';

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
  self: 'Lương KPI',
  weights: 'Lương KPI'
};

// Năm trọng số theo thứ tự hiển thị, ví dụ "40 · 24 · 18 · 12 · 6".
const weightsText = (v: Record<string, unknown>) => Object.keys(KPI_NAMES).map(k => v[k]).join(' · ');

// Dòng lịch sử có id lớn nhất của ba nhóm (id chạy chung nên dòng lớn nhất là dòng mới nhất).
// Dòng `weights` (một lần lưu trọng số KPI) hiện cả năm trọng số mới như dòng Lương KPI của bảng.
function recentChange(history: Partial<Record<GroupKey, HistoryItem[]>>): string {
  const all = [...(history.overtime ?? []), ...(history.attendance ?? []), ...(history.kpiWeights ?? [])];
  if (!all.length) return 'Chưa có thay đổi nào.';
  const last = all.reduce((a, b) => (b.id > a.id ? b : a));
  const from = last.month ? ` từ tháng ${monthShort(last.month)}` : '';
  const what =
    last.field === 'weights'
      ? `Trọng số ${weightsText(last.to)}`
      : `${FIELD_LABEL[last.field] ?? last.field} ${fieldText(last.field, last.to)}`;
  return `Thay đổi gần đây: ${KHOAN_OF_FIELD[last.field] ?? last.field}, ${what}${from}.`;
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
      value: `Trọng số ${weightsText(kpi)}`,
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

// Dạng nhập của từng ô (tiền tố, đơn vị, số nguyên, số lẻ tối đa, tiền): dùng chung cho ngăn kéo và trang Tất cả cài đặt.
const FORMAT: Record<string, Omit<DrawerField, 'field' | 'label'>> = {
  weekdayRate: { prefix: '×', decimals: 2 },
  weekendRate: { prefix: '×', decimals: 2 },
  holidayRate: { prefix: '×', decimals: 2 },
  diligenceLostFromDays: { unit: 'ngày', integer: true },
  lateGraceMinutes: { unit: 'phút', integer: true },
  wework: { unit: '%', integer: true },
  user: { unit: '%', integer: true },
  peer: { unit: '%', integer: true },
  manager: { unit: '%', integer: true },
  self: { unit: '%', integer: true },
  bhxhPct: { unit: '%', decimals: 2 },
  bhytPct: { unit: '%', decimals: 2 },
  bhtnPct: { unit: '%', decimals: 2 },
  personalDeduction: { money: true },
  dependantDeduction: { money: true },
  shortContractPct: { unit: '%', decimals: 2 },
  shortContractThreshold: { money: true },
  payDay: { integer: true }
};
const fld = (field: string, label: string): DrawerField => ({ field, label, ...FORMAT[field] });

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
      fld('weekdayRate', 'Ngày thường'),
      fld('weekendRate', 'Cuối tuần'),
      fld('holidayRate', 'Ngày lễ')
    ]
  },
  'phu-cap': {
    title: 'Phụ cấp',
    sub: 'Phụ cấp theo loại nhân sự và luật chuyên cần',
    group: 'attendance',
    section: 'Chuyên cần',
    fields: [fld('diligenceLostFromDays', 'Mất chuyên cần khi nghỉ từ')]
  },
  'luong-kpi': {
    title: 'Lương KPI',
    sub: 'Trọng số của 5 điểm KPI, cộng lại đủ 100',
    group: 'kpiWeights',
    section: 'Trọng số',
    fields: Object.entries(KPI_NAMES).map(([field, label]) => fld(field, label))
  },
  'khau-tru': {
    title: 'Khấu trừ đi muộn, về sớm',
    sub: 'Ngưỡng đi trễ vẫn tính là đúng giờ',
    group: 'attendance',
    section: 'Khấu trừ',
    fields: [fld('lateGraceMinutes', 'Đi trễ tới … phút vẫn hợp lệ')]
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

// ---------- Tất cả cài đặt ----------

/** Một mục của trang Tất cả cài đặt: các ô nhập, hoặc một dòng chữ chỉ xem, hoặc bảng biểu thuế. */
export type SettingEntry = {
  key: string;
  title: string;
  desc: string;
  fields: DrawerField[];
  readonly?: string;
  brackets?: boolean;
};
/** Một nhóm của trang; `group` là nhóm của máy chủ, null khi nhóm chỉ có chữ. */
export type SettingGroup = { key: string; name: string; group: GroupKey | null; items: SettingEntry[] };

// Mục một ô: nhãn của ô trùng tên mục.
const single = (field: string, title: string, desc: string): SettingEntry => ({
  key: field,
  title,
  desc,
  fields: [fld(field, title)]
});

const OT_DESC = 'Nhân với lương giờ khi làm thêm';
const INSURANCE_DESC = 'Phần người lao động đóng, tính trên lương đóng bảo hiểm';

/** Tám nhóm của trang Tất cả cài đặt, theo thứ tự hiển thị. */
export const ALL_GROUPS: SettingGroup[] = [
  {
    key: 'lam-them',
    name: 'OT',
    group: 'overtime',
    items: [
      single('weekdayRate', 'Hệ số OT ngày thường', `${OT_DESC} ngày thường`),
      single('weekendRate', 'Hệ số OT cuối tuần', `${OT_DESC} cuối tuần`),
      single('holidayRate', 'Hệ số OT ngày lễ', `${OT_DESC} ngày lễ, Tết`)
    ]
  },
  {
    key: 'phu-cap',
    name: 'Phụ cấp',
    group: 'attendance',
    items: [
      single(
        'diligenceLostFromDays',
        'Mất chuyên cần',
        'Nghỉ từ số ngày này trong tháng thì mất phụ cấp chuyên cần'
      )
    ]
  },
  {
    key: 'luong-kpi',
    name: 'KPI',
    group: 'kpiWeights',
    items: Object.entries(KPI_NAMES).map(([field, name]) =>
      single(field, name, 'Trọng số trong tổng điểm KPI, 5 trọng số cộng lại đủ 100')
    )
  },
  {
    key: 'khau-tru',
    name: 'Khấu trừ',
    group: 'attendance',
    items: [single('lateGraceMinutes', 'Đi trễ vẫn hợp lệ', 'Đi trễ tới số phút này vẫn tính là đúng giờ')]
  },
  {
    key: 'tam-ung',
    name: 'Tạm ứng',
    group: null,
    items: [
      { key: 'advance', title: 'Số tiền được ứng', desc: '', fields: [], readonly: TAM_UNG_TEXT }
    ]
  },
  {
    key: 'bao-hiem',
    name: 'Bảo hiểm',
    group: 'insurance',
    items: [
      single('bhxhPct', 'BHXH', INSURANCE_DESC),
      single('bhytPct', 'BHYT', INSURANCE_DESC),
      single('bhtnPct', 'BHTN', INSURANCE_DESC)
    ]
  },
  {
    key: 'thue',
    name: 'Thuế',
    group: 'tax',
    items: [
      single('personalDeduction', 'Giảm trừ bản thân', 'Trừ vào thu nhập trước khi tính thuế, mỗi tháng'),
      single('dependantDeduction', 'Giảm trừ người phụ thuộc', 'Cho mỗi người phụ thuộc, mỗi tháng'),
      {
        key: 'shortContract',
        title: 'Hợp đồng ngắn hạn',
        desc: 'Khấu trừ thẳng trên thu nhập của hợp đồng ngắn hạn',
        fields: [fld('shortContractPct', 'Tỉ lệ khấu trừ'), fld('shortContractThreshold', 'Khi thu nhập từ')]
      },
      {
        key: 'brackets',
        title: 'Biểu thuế',
        desc: 'Lũy tiến từng phần, 5 bậc, theo thu nhập tính thuế mỗi tháng',
        fields: [],
        brackets: true
      }
    ]
  },
  {
    key: 'ky-luong',
    name: 'Kỳ lương',
    group: 'payCalendar',
    items: [single('payDay', 'Ngày trả lương', 'Ngày trong tháng sau, từ 1 đến 28')]
  }
];

/** Chữ thường, bỏ dấu, đ → d, gọn khoảng trắng: để so khớp khi tìm không cần gõ dấu. */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Các mục có tiêu đề, tên nhóm hoặc mô tả chứa `q` (sau khi chuẩn hoá), theo thứ tự nhóm; `q` trống thì không có kết quả. */
export function searchSettings(q: string): { groupKey: string; itemKey: string; title: string; groupName: string }[] {
  const needle = normalizeSearch(q);
  if (!needle) return [];
  return ALL_GROUPS.flatMap(g =>
    g.items
      .filter(i => normalizeSearch(`${i.title} ${g.name} ${i.desc}`).includes(needle))
      .map(i => ({ groupKey: g.key, itemKey: i.key, title: i.title, groupName: g.name }))
  );
}

// ---------- Hoàn tác ----------

/**
 * Các số sẽ gửi khi hoàn tác dòng lịch sử `row`: ô của dòng về số cũ. Dòng `weights` (một lần lưu trọng số KPI)
 * gửi đủ năm trọng số cũ của lần lưu đó (BE §5.1); năm số này vốn đã cộng đủ 100.
 */
export function revertValues(row: HistoryItem): Values {
  return row.field === 'weights' ? { ...row.from } : { [row.field]: row.from };
}

/** Một dòng lịch sử của mục: chữ hiện (historyRow), dòng gốc để hoàn tác, và có hoàn tác được ngay không. */
export type HistoryRowView = ReturnType<typeof historyRow> & { raw: HistoryItem; canRevert: boolean };
