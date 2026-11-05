// Danh mục 6 nhóm con số tính lương có phiên bản theo tháng: tên ô, cột SQL, mặc định, giới hạn, và kiểm giá trị.
import type { Values } from '../../../common/version-chain';
import { SettingsInputError } from '../settings.errors';

export type GroupKey = 'overtime' | 'attendance' | 'kpi-weights' | 'insurance' | 'tax' | 'pay-calendar';

export const GROUP_KEYS: readonly GroupKey[] = ['overtime', 'attendance', 'kpi-weights', 'insurance', 'tax', 'pay-calendar'];

export interface Bracket {
  upTo: number | null;
  ratePct: number;
}

export type GroupValues = Record<string, number | Bracket[]>;

export interface NumberLimit {
  min: number;
  max: number;
  step: number;
}

export interface BracketLimit {
  minRows: 1;
  maxRows: 10;
  upTo: NumberLimit;
  ratePct: NumberLimit;
}

export interface FieldSpec {
  name: string;
  column: string;
  kind: 'rate' | 'pct' | 'int' | 'money' | 'brackets';
  default: number | Bracket[];
  limit: NumberLimit | BracketLimit;
}

export interface GroupSpec {
  key: GroupKey;
  responseKey: 'overtime' | 'attendance' | 'kpiWeights' | 'insurance' | 'tax' | 'payCalendar';
  table: string;
  fields: FieldSpec[];
  sum?: number;
}

const MONEY_MAX = 1_000_000_000;

const rate = (name: string, column: string, def: number, min: number): FieldSpec => ({
  name,
  column,
  kind: 'rate',
  default: def,
  limit: { min, max: 5, step: 0.01 }
});
const pct = (name: string, column: string, def: number): FieldSpec => ({
  name,
  column,
  kind: 'pct',
  default: def,
  limit: { min: 0, max: 100, step: 0.01 }
});
const int = (name: string, column: string, def: number, min: number, max: number): FieldSpec => ({
  name,
  column,
  kind: 'int',
  default: def,
  limit: { min, max, step: 1 }
});
const money = (name: string, column: string, def: number): FieldSpec => ({
  name,
  column,
  kind: 'money',
  default: def,
  limit: { min: 0, max: MONEY_MAX, step: 1 }
});

const BRACKET_LIMIT: BracketLimit = {
  minRows: 1,
  maxRows: 10,
  upTo: { min: 1, max: MONEY_MAX, step: 1 },
  ratePct: { min: 0, max: 100, step: 0.01 }
};

const DEFAULT_BRACKETS: Bracket[] = [
  { upTo: 10_000_000, ratePct: 5 },
  { upTo: 30_000_000, ratePct: 10 },
  { upTo: 60_000_000, ratePct: 20 },
  { upTo: 100_000_000, ratePct: 30 },
  { upTo: null, ratePct: 35 }
];

export const SETTING_GROUPS: Record<GroupKey, GroupSpec> = {
  overtime: {
    key: 'overtime',
    responseKey: 'overtime',
    table: 'overtime_rules',
    fields: [
      rate('weekdayRate', 'weekday_rate', 1.5, 1.5),
      rate('weekendRate', 'weekend_rate', 2, 2),
      rate('holidayRate', 'holiday_rate', 3, 3)
    ]
  },
  attendance: {
    key: 'attendance',
    responseKey: 'attendance',
    table: 'attendance_rules',
    fields: [
      int('lateGraceMinutes', 'late_grace_minutes', 15, 0, 60),
      int('diligenceLostFromDays', 'diligence_lost_from_days', 3, 1, 31)
    ]
  },
  'kpi-weights': {
    key: 'kpi-weights',
    responseKey: 'kpiWeights',
    table: 'kpi_weights',
    fields: [
      int('wework', 'wework', 40, 0, 100),
      int('user', 'user_score', 24, 0, 100),
      int('peer', 'peer', 18, 0, 100),
      int('manager', 'manager', 12, 0, 100),
      int('self', 'self_score', 6, 0, 100)
    ],
    sum: 100
  },
  insurance: {
    key: 'insurance',
    responseKey: 'insurance',
    table: 'insurance_rates',
    fields: [pct('bhxhPct', 'bhxh_pct', 8), pct('bhytPct', 'bhyt_pct', 1.5), pct('bhtnPct', 'bhtn_pct', 1)]
  },
  tax: {
    key: 'tax',
    responseKey: 'tax',
    table: 'tax_rules',
    fields: [
      money('personalDeduction', 'personal_deduction', 15_500_000),
      money('dependantDeduction', 'dependant_deduction', 6_200_000),
      pct('shortContractPct', 'short_contract_pct', 10),
      money('shortContractThreshold', 'short_contract_threshold', 5_000_000),
      { name: 'brackets', column: 'tax_brackets', kind: 'brackets', default: DEFAULT_BRACKETS, limit: BRACKET_LIMIT }
    ]
  },
  'pay-calendar': {
    key: 'pay-calendar',
    responseKey: 'payCalendar',
    table: 'pay_calendar',
    fields: [int('payDay', 'pay_day', 10, 1, 28)]
  }
};

export function isGroupKey(v: unknown): v is GroupKey {
  return typeof v === 'string' && (GROUP_KEYS as readonly string[]).includes(v);
}

const cloneBrackets = (b: Bracket[]): Bracket[] => b.map(r => ({ upTo: r.upTo, ratePct: r.ratePct }));

export function defaultsOf(g: GroupKey): GroupValues {
  const out: GroupValues = {};
  for (const f of SETTING_GROUPS[g].fields) out[f.name] = f.kind === 'brackets' ? cloneBrackets(f.default as Bracket[]) : (f.default as number);
  return out;
}

export function limitsOf(g: GroupKey): Record<string, NumberLimit | BracketLimit> {
  const out: Record<string, NumberLimit | BracketLimit> = {};
  for (const f of SETTING_GROUPS[g].fields) out[f.name] = f.kind === 'brackets' ? { ...(f.limit as BracketLimit), upTo: { ...(f.limit as BracketLimit).upTo }, ratePct: { ...(f.limit as BracketLimit).ratePct } } : { ...(f.limit as NumberLimit) };
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const onGrid = (v: number, step: number) => Math.abs(Math.round(v / step) * step - v) <= 1e-9;

const fmt = (n: number) => String(n).replace('.', ',');

/** Kiểm một số theo giới hạn; ném lỗi gắn với `field`. whole = bắt buộc nguyên. */
function checkNumber(v: unknown, limit: NumberLimit, whole: boolean, field: string, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SettingsInputError(`${label} phải là một số`, field);
  if (v < limit.min || v > limit.max) throw new SettingsInputError(`${label} phải từ ${fmt(limit.min)} đến ${fmt(limit.max)}`, field);
  if (whole && !Number.isInteger(v)) throw new SettingsInputError(`${label} phải là số nguyên`, field);
  if (!onGrid(v, limit.step)) throw new SettingsInputError(`${label} phải theo bước ${fmt(limit.step)}`, field);
  return v;
}

function checkBrackets(v: unknown): Bracket[] {
  const field = 'brackets';
  const lim = BRACKET_LIMIT;
  if (!Array.isArray(v)) throw new SettingsInputError('Biểu thuế phải là một danh sách bậc', field);
  if (v.length < lim.minRows || v.length > lim.maxRows)
    throw new SettingsInputError(`Biểu thuế phải có từ ${lim.minRows} đến ${lim.maxRows} bậc`, field);
  const out: Bracket[] = [];
  v.forEach((row, i) => {
    const n = i + 1;
    if (!isRecord(row)) throw new SettingsInputError(`Bậc ${n} của biểu thuế không hợp lệ`, field);
    const last = i === v.length - 1;
    let upTo: number | null;
    if (row.upTo === null) {
      if (!last) throw new SettingsInputError(`Bậc ${n} của biểu thuế: chỉ bậc cuối được để trống mốc trên`, field);
      upTo = null;
    } else {
      if (last) throw new SettingsInputError(`Bậc cuối của biểu thuế phải để trống mốc trên`, field);
      upTo = checkNumber(row.upTo, lim.upTo, true, field, `Mốc trên của bậc ${n}`);
      const prev = out[i - 1]?.upTo;
      if (typeof prev === 'number' && upTo <= prev) throw new SettingsInputError(`Mốc trên của bậc ${n} phải lớn hơn bậc trước`, field);
    }
    const ratePct = checkNumber(row.ratePct, lim.ratePct, false, field, `Thuế suất của bậc ${n}`);
    out.push({ upTo, ratePct });
  });
  return out;
}

/** Kiểm các ô gửi lên của một nhóm; trả các ô đã kiểm (chuẩn hoá), sai thì ném SettingsInputError. */
export function validateGroupChange(g: GroupKey, values: unknown): GroupValues {
  const spec = SETTING_GROUPS[g];
  if (!isRecord(values) || !Object.keys(values).length) throw new SettingsInputError('Cần gửi ít nhất một ô để lưu', 'values');
  for (const key of Object.keys(values)) {
    if (!spec.fields.some(f => f.name === key)) throw new SettingsInputError(`Ô "${key}" không có trong nhóm này`, key);
  }
  if (spec.sum !== undefined) {
    const missing = spec.fields.find(f => !(f.name in values));
    if (missing) throw new SettingsInputError(`Thiếu ô "${missing.name}": nhóm này phải gửi đủ ${spec.fields.length} ô`, missing.name);
  }
  const out: GroupValues = {};
  for (const f of spec.fields) {
    if (!(f.name in values)) continue;
    const v = values[f.name];
    out[f.name] =
      f.kind === 'brackets'
        ? checkBrackets(v)
        : checkNumber(v, f.limit as NumberLimit, f.kind === 'int' || f.kind === 'money', f.name, `Ô "${f.name}"`);
  }
  if (spec.sum !== undefined) {
    const total = spec.fields.reduce((s, f) => s + (out[f.name] as number), 0);
    if (total !== spec.sum) throw new SettingsInputError(`Tổng các trọng số phải bằng ${spec.sum}, hiện là ${total}`, 'sum');
  }
  return out;
}

/** Dạng lưu trong chuỗi phiên bản: ô số giữ nguyên, brackets thành JSON của mảng đã chuẩn hoá. */
export function encodeValues(v: GroupValues): Values {
  const out: Values = {};
  for (const [k, x] of Object.entries(v)) {
    out[k] = Array.isArray(x) ? JSON.stringify(x.map(r => ({ upTo: r.upTo, ratePct: r.ratePct }))) : x;
  }
  return out;
}

export function decodeValues(g: GroupKey, v: Values): GroupValues {
  const out: GroupValues = {};
  for (const f of SETTING_GROUPS[g].fields) {
    if (!(f.name in v)) continue;
    const x = v[f.name];
    out[f.name] = f.kind === 'brackets' ? (JSON.parse(String(x)) as Bracket[]) : (x as number);
  }
  return out;
}
