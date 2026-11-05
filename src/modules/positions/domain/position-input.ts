// Đọc và kiểm số trong body của ba API ghi chức vụ và bậc (spec mục 3.4). Màn hình đã chặn trước các số sai;
// đây là lưới an toàn khi gọi API trực tiếp. Sai thì ném PositionInputError kèm đường dẫn tới ô sai.
import { PositionInputError } from '../positions.errors';
import type { Values } from './version-chain';

export const TYPE_CODES = ['tts', 'ctv', 'nv'] as const;
export type TypeCode = (typeof TYPE_CODES)[number];

/** Sáu ô tick màn Chế độ sửa được. */
export const BENEFIT_KEYS = ['kpi', 'idorm', 'leaveAccount', 'isat', 'ot', 'makeup'] as const;

export interface SavePositionsInput {
  effectiveMonth: string;
  reason: string | null;
  /** changes đã làm phẳng: benefits.makeup thành khoá 'benefit.makeup'. */
  items: Array<{ code: TypeCode; expectedRev: number; changes: Values }>;
}

export interface SaveLevelInput {
  code: TypeCode;
  level: number;
  effectiveMonth: string;
  reason: string | null;
  expectedRev: number;
  changes: Values;
}

export interface AddLevelInput {
  code: TypeCode;
  level: number;
  effectiveMonth: string;
  reason: string | null;
  values: { name: string; baseSalary: number; kpiMax: number | null; nightPct: number | null };
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const NAME_MAX = 60;
const REASON_MAX = 300;
const LEVEL_FIELDS = ['name', 'baseSalary', 'kpiMax', 'nightPct'] as const;
const NV_NIGHT = 'Ca đêm Nhân viên theo từng người, không sửa ở đây';

function fail(field: string, message: string): never {
  throw new PositionInputError(message, field);
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

function month(v: unknown, currentMonth: string): string {
  if (typeof v !== 'string' || !MONTH.test(v)) fail('effectiveMonth', 'Tháng áp dụng phải có dạng YYYY-MM');
  if (v < currentMonth) {
    fail('effectiveMonth', `Tháng áp dụng phải từ ${currentMonth.slice(5)}/${currentMonth.slice(0, 4)} trở đi`);
  }
  return v;
}

function reason(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') fail('reason', 'Lý do phải là chữ');
  const text = v.trim();
  if (text.length > REASON_MAX) fail('reason', `Lý do tối đa ${REASON_MAX} ký tự`);
  return text || null;
}

function typeCode(v: unknown, field: string): TypeCode {
  if (!TYPE_CODES.includes(v as TypeCode)) fail(field, `Không có chức vụ ${String(v)}`);
  return v as TypeCode;
}

function rev(v: unknown, field: string): number {
  if (!Number.isInteger(v) || (v as number) < 0) fail(field, 'Số phiên bản không hợp lệ');
  return v as number;
}

function levelNo(v: unknown, field: string): number {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  if (!Number.isInteger(n) || (n as number) < 1) fail(field, 'Bậc phải là số nguyên từ 1');
  return n as number;
}

function name(v: unknown, field: string): string {
  const text = typeof v === 'string' ? v.trim() : '';
  if (text.length < 1 || text.length > NAME_MAX) fail(field, `Tên dài 1–${NAME_MAX} ký tự`);
  return text;
}

function workdays(v: unknown, field: string): number {
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 31) fail(field, 'Ngày công chuẩn là số nguyên 1–31');
  return v as number;
}

function pct(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) fail(field, 'Phần trăm phải từ 0 đến 100');
  return v;
}

/** Số tiền: số nguyên không âm, không quá số nguyên an toàn của JS (cột BIGINT, vượt thì PostgreSQL báo tràn số). */
function money(v: unknown, field: string): number {
  if (!Number.isSafeInteger(v) || (v as number) < 0) fail(field, 'Số tiền là số nguyên không âm, tối đa 9.007.199.254.740.991');
  return v as number;
}

/** % đêm: chức vụ không nhận null; bậc nhận null (theo chức vụ). Nhân viên chỉ nhận null ở bậc (P9). */
function night(code: TypeCode, v: unknown, field: string, nullable: boolean): number | null {
  if (v === null && nullable) return null;
  if (code === 'nv') fail(field, NV_NIGHT);
  return pct(v, field);
}

function typeChanges(code: TypeCode, raw: unknown, field: string): Values {
  if (!isObject(raw)) fail(field, 'Thiếu các ô thay đổi');
  const out: Values = {};
  for (const [key, v] of Object.entries(raw)) {
    const f = `${field}.${key}`;
    if (key === 'name') out.name = name(v, f);
    else if (key === 'workdays') out.workdays = workdays(v, f);
    else if (key === 'flexPct' || key === 'travelPct' || key === 'attendancePct') out[key] = pct(v, f);
    else if (key === 'nightPct') out.nightPct = night(code, v, f, false);
    else if (key === 'benefits') {
      if (!isObject(v)) fail(f, 'Ô tick phải là một nhóm khoá');
      for (const [benefit, on] of Object.entries(v)) {
        const bf = `${f}.${benefit}`;
        if (!BENEFIT_KEYS.includes(benefit as (typeof BENEFIT_KEYS)[number])) fail(bf, `Không nhận ô ${benefit}`);
        if (typeof on !== 'boolean') fail(bf, 'Ô tick phải là true hoặc false');
        out[`benefit.${benefit}`] = on;
      }
    } else fail(f, `Không nhận ô ${key}`);
  }
  return out;
}

function levelChanges(code: TypeCode, raw: unknown, field: string): Values {
  if (!isObject(raw)) fail(field, 'Thiếu các ô thay đổi');
  const out: Values = {};
  for (const [key, v] of Object.entries(raw)) {
    const f = `${field}.${key}`;
    if (key === 'name') out.name = name(v, f);
    else if (key === 'baseSalary') out.baseSalary = money(v, f);
    else if (key === 'kpiMax') out.kpiMax = v === null ? null : money(v, f);
    else if (key === 'nightPct') out.nightPct = night(code, v, f, true);
    else fail(f, `Không nhận ô ${key}`);
  }
  return out;
}

export function parseSavePositions(body: unknown, currentMonth: string): SavePositionsInput {
  const b = isObject(body) ? body : {};
  const effectiveMonth = month(b.effectiveMonth, currentMonth);
  const why = reason(b.reason);
  if (!Array.isArray(b.items) || b.items.length < 1) fail('items', 'Cần ít nhất một chức vụ');
  const seen = new Set<string>();
  const items = b.items.map((raw: unknown, i: number) => {
    const it = isObject(raw) ? raw : {};
    const code = typeCode(it.code, `items[${i}].code`);
    if (seen.has(code)) fail(`items[${i}].code`, `Chức vụ ${code} có hai lần`);
    seen.add(code);
    return {
      code,
      expectedRev: rev(it.expectedRev, `items[${i}].expectedRev`),
      changes: typeChanges(code, it.changes, `items[${i}].changes`)
    };
  });
  return { effectiveMonth, reason: why, items };
}

export function parseSaveLevel(code: unknown, level: unknown, body: unknown, currentMonth: string): SaveLevelInput {
  const c = typeCode(code, 'code');
  const lv = levelNo(level, 'level');
  const b = isObject(body) ? body : {};
  return {
    code: c,
    level: lv,
    effectiveMonth: month(b.effectiveMonth, currentMonth),
    reason: reason(b.reason),
    expectedRev: rev(b.expectedRev, 'expectedRev'),
    changes: levelChanges(c, b.changes, 'changes')
  };
}

export function parseAddLevel(code: unknown, body: unknown, currentMonth: string): AddLevelInput {
  const c = typeCode(code, 'code');
  const b = isObject(body) ? body : {};
  const effectiveMonth = month(b.effectiveMonth, currentMonth);
  const why = reason(b.reason);
  const lv = levelNo(b.level, 'level');
  const raw = isObject(b.values) ? b.values : {};
  for (const key of LEVEL_FIELDS) if (!(key in raw)) fail(`values.${key}`, `Thiếu ô ${key}`);
  const v = levelChanges(c, raw, 'values');
  return {
    code: c,
    level: lv,
    effectiveMonth,
    reason: why,
    values: {
      name: v.name as string,
      baseSalary: v.baseSalary as number,
      kpiMax: v.kpiMax as number | null,
      nightPct: v.nightPct as number | null
    }
  };
}
