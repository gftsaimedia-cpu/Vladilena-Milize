// Kho cài đặt giả trong bộ nhớ, theo hợp đồng BE v2 §5: nhóm cài đặt có phiên bản theo tháng, tuần làm việc riêng từng
// người, vùng chấm công, ngày lễ và ngày trả lương. File thuần (chạy được trong Node), trạng thái nằm trong biến module.
// Luật lưu từ tháng M giống planChange của BE (src/modules/positions/domain/version-chain.ts).
import { ApiError } from '../services/http';
import { MOCK_MONTH, MOCK_NOW } from './clock';
import {
  GROUP_PATH,
  type GroupKey,
  type GroupPath,
  type HistoryItem,
  type PayDayItem,
  type SaveBody,
  type SaveResult,
  type SettingsResponse,
  type ShiftRow,
  type Values,
  type WorkWeek,
  type WorkWeekBody,
  type Zone,
} from '../builders/api/settings';

// ---------- Hằng số ----------

const BASE_MONTH = '2000-01';
const ACTOR = 'admin';
const TYPE_WEEKDAYS = [1, 2, 3, 4, 5, 6];
const TYPE_STANDARD_WORKDAYS = 26;
const INITIAL_ZONE: Zone = { lat: 10.7769, lng: 106.7009, radiusM: 150 };

// 6 ca cố định (D7, spec BE §3.5), thứ tự Normal1, Normal2, Flex1, Flex2, Night1, Night2.
export const MOCK_SHIFTS: ShiftRow[] = [
  { code: 'NORMAL_1', name: 'Normal 1', kind: 'normal', startTime: '08:00', endTime: '17:00' },
  { code: 'NORMAL_2', name: 'Normal 2', kind: 'normal', startTime: '10:00', endTime: '19:00' },
  { code: 'FLEX_1', name: 'Flex 1', kind: 'flex', startTime: '06:00', endTime: '15:00' },
  { code: 'FLEX_2', name: 'Flex 2', kind: 'flex', startTime: '13:00', endTime: '22:00' },
  { code: 'NIGHT_1', name: 'Night 1', kind: 'night', startTime: '22:00', endTime: '07:00' },
  { code: 'NIGHT_2', name: 'Night 2', kind: 'night', startTime: '21:00', endTime: '06:00' },
];

const range = (min: number, max: number, step: number) => ({ min, max, step });
const money = range(0, 1000000000, 1);
const pct = range(0, 100, 0.01);

const GROUPS: Record<GroupKey, { defaults: Values; limits: Record<string, any>; sum?: number }> = {
  overtime: {
    defaults: { weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 },
    limits: { weekdayRate: range(1.5, 5, 0.01), weekendRate: range(2, 5, 0.01), holidayRate: range(3, 5, 0.01) },
  },
  attendance: {
    defaults: { lateGraceMinutes: 15, diligenceLostFromDays: 3 },
    limits: { lateGraceMinutes: range(0, 60, 1), diligenceLostFromDays: range(1, 31, 1) },
  },
  kpiWeights: {
    defaults: { wework: 40, user: 24, peer: 18, manager: 12, self: 6 },
    limits: {
      wework: range(0, 100, 1),
      user: range(0, 100, 1),
      peer: range(0, 100, 1),
      manager: range(0, 100, 1),
      self: range(0, 100, 1),
    },
    sum: 100,
  },
  insurance: {
    defaults: { bhxhPct: 8, bhytPct: 1.5, bhtnPct: 1 },
    limits: { bhxhPct: pct, bhytPct: pct, bhtnPct: pct },
  },
  tax: {
    defaults: {
      personalDeduction: 15500000,
      dependantDeduction: 6200000,
      shortContractPct: 10,
      shortContractThreshold: 5000000,
      brackets: [
        { upTo: 10000000, ratePct: 5 },
        { upTo: 30000000, ratePct: 10 },
        { upTo: 60000000, ratePct: 20 },
        { upTo: 100000000, ratePct: 30 },
        { upTo: null, ratePct: 35 },
      ],
    },
    limits: {
      personalDeduction: money,
      dependantDeduction: money,
      shortContractPct: pct,
      shortContractThreshold: money,
      brackets: { minRows: 1, maxRows: 10, upTo: range(1, 1000000000, 1), ratePct: pct },
    },
  },
  payCalendar: { defaults: { payDay: 10 }, limits: { payDay: range(1, 28, 1) } },
};
const GROUP_KEYS = Object.keys(GROUPS) as GroupKey[];

const FIXED_HOLIDAYS: { md: string; name: string }[] = [
  { md: '01-01', name: 'Tết Dương lịch' },
  { md: '04-30', name: 'Giải phóng miền Nam' },
  { md: '05-01', name: 'Quốc tế Lao động' },
  { md: '09-02', name: 'Quốc khánh' },
];

const HOLIDAYS_2026: [string, string][] = [
  ['2026-01-01', 'Tết Dương lịch'],
  ...['16', '17', '18', '19', '20'].map((d): [string, string] => [`2026-02-${d}`, 'Tết Nguyên đán']),
  ['2026-04-27', 'Giỗ Tổ Hùng Vương (nghỉ bù)'],
  ['2026-04-30', 'Giải phóng miền Nam'],
  ['2026-05-01', 'Quốc tế Lao động'],
  ['2026-09-01', 'Quốc khánh'],
  ['2026-09-02', 'Quốc khánh'],
];

// ---------- Chuỗi phiên bản dùng chung (nhóm cài đặt và tuần làm việc) ----------

type Version = { month: string; values: Record<string, any> };
// Một kho = chuỗi phiên bản + lịch sử. Stamp của kho là id lớn nhất trong lịch sử, 0 khi chưa có.
type Store = { chain: Version[]; history: HistoryItem[] };

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function versionAt(chain: Version[], month: string): Version {
  let best = chain[0];
  for (const v of chain) if (v.month <= month && v.month >= best.month) best = v;
  return best;
}

const HISTORY_CAP = 200;
// Lịch sử trả về mới nhất trước, tối đa 200 dòng (như BE).
const newestFirst = (history: HistoryItem[]) => clone([...history].reverse().slice(0, HISTORY_CAP));

const stampOf = (history: HistoryItem[]) => (history.length ? history[history.length - 1].id : 0);

// Áp thay đổi từ tháng M: sửa thẳng phiên bản M hoặc chép phiên bản đang hiệu lực sang M, rồi chép số mới sang từng
// phiên bản sau M cho tới phiên bản đầu tiên mang số khác số cũ. Trả các ô thực sự đổi (kèm số cũ ở M).
function applyChange(chain: Version[], month: string, changes: Record<string, any>) {
  const cur = versionAt(chain, month);
  const changed: { field: string; from: any; to: any }[] = [];
  for (const [field, to] of Object.entries(changes)) {
    if (!same(cur.values[field], to)) changed.push({ field, from: clone(cur.values[field]), to: clone(to) });
  }
  if (!changed.length) return changed;

  let target = chain.find(v => v.month === month);
  if (!target) {
    target = { month, values: clone(cur.values) };
    chain.push(target);
    chain.sort((a, b) => a.month.localeCompare(b.month));
  }
  const later = chain.filter(v => v.month > month);
  for (const { field, from, to } of changed) {
    target.values[field] = clone(to);
    for (const v of later) {
      if (!same(v.values[field], from)) break;
      v.values[field] = clone(to);
    }
  }
  return changed;
}

// ---------- Trạng thái ----------

let nextId = 1;
let saveCount = 0;
let groups: Record<GroupKey, Store>;
let weeks: Map<string, Store>;
let zone: Zone;
let zoneLog: HistoryItem[];
let holidays: Map<string, string>;

export function resetSettingsMock(): void {
  nextId = 1;
  saveCount = 0;
  groups = {} as Record<GroupKey, Store>;
  for (const key of GROUP_KEYS) {
    groups[key] = { chain: [{ month: BASE_MONTH, values: clone(GROUPS[key].defaults) }], history: [] };
  }
  weeks = new Map();
  zone = clone(INITIAL_ZONE);
  zoneLog = [];
  holidays = new Map(HOLIDAYS_2026);
}
resetSettingsMock();

// Giờ ghi của một lần lưu (quyết định R1): MOCK_NOW cộng số lần đã lưu, mỗi lần một giây. Mọi dòng của một lần lưu chung giờ.
function logRows(
  into: HistoryItem[],
  rows: { field: string; from: any; to: any }[],
  month: string | null,
  reason: string | null,
) {
  const at = new Date(Date.parse(MOCK_NOW) + saveCount * 1000).toISOString();
  saveCount += 1;
  for (const r of rows) {
    into.push({ id: nextId++, field: r.field, month, from: clone(r.from), to: clone(r.to), by: ACTOR, at, reason });
  }
}

const bad = (field: string) => new ApiError(400, 'Dữ liệu cài đặt không hợp lệ', { code: 'BAD_SETTINGS_INPUT', field });

function checkStamp(history: HistoryItem[], stamp: number) {
  const current = stampOf(history);
  if (stamp !== current) throw new ApiError(409, 'Có người vừa lưu trước', { code: 'SETTINGS_STALE', stamp: current });
}

function checkMonth(month: string) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < MOCK_MONTH) throw bad('effectiveMonth');
}

const reasonOf = (reason: string | null) => (reason && reason.trim() ? reason : null);

// ---------- Nhóm cài đặt ----------

function groupKeyOf(path: string): GroupKey {
  const key = GROUP_KEYS.find(k => GROUP_PATH[k] === (path as GroupPath));
  if (!key) throw new ApiError(404, 'Không có nhóm cài đặt này', { code: 'SETTINGS_GROUP_NOT_FOUND' });
  return key;
}

function groupView(key: GroupKey, month: string) {
  const def = GROUPS[key];
  const store = groups[key];
  const ver = versionAt(store.chain, month);
  const state: SettingsResponse['groups'][GroupKey] = {
    from: ver.month,
    stamp: stampOf(store.history),
    values: clone(ver.values) as Values,
    defaults: clone(def.defaults),
    limits: clone(def.limits),
  };
  if (def.sum !== undefined) state.sum = def.sum;
  return state;
}

export function settingsAt(month: string = MOCK_MONTH): SettingsResponse {
  const out = {} as SettingsResponse['groups'];
  for (const key of GROUP_KEYS) out[key] = groupView(key, month);
  return { month, minMonth: MOCK_MONTH, groups: out };
}

export function saveGroup(path: string, body: SaveBody): SaveResult {
  const key = groupKeyOf(path);
  const store = groups[key];
  checkStamp(store.history, body.stamp);
  checkMonth(body.effectiveMonth);

  const fields = Object.keys(GROUPS[key].defaults);
  for (const f of Object.keys(body.values)) if (!fields.includes(f)) throw bad(f);
  // Giữ thứ tự ô của nhóm để dòng lịch sử ổn định.
  const changes: Record<string, any> = {};
  for (const f of fields) if (f in body.values) changes[f] = body.values[f];

  if (key === 'kpiWeights') {
    const merged = { ...versionAt(store.chain, body.effectiveMonth).values, ...changes };
    const total = fields.reduce((s, f) => s + Number(merged[f]), 0);
    if (Math.abs(total - (GROUPS.kpiWeights.sum as number)) > 1e-9) throw bad('kpiWeights');
  }

  const before = clone(versionAt(store.chain, body.effectiveMonth).values);
  const changed = applyChange(store.chain, body.effectiveMonth, changes);
  if (changed.length) {
    // Trọng số KPI (BE §5.1): một lần lưu là một dòng field 'weights', from/to là cả năm trọng số ở tháng áp dụng.
    const pick = (v: Record<string, any>) => Object.fromEntries(fields.map(f => [f, v[f]]));
    const rows = key === 'kpiWeights' ? [{ field: 'weights', from: pick(before), to: pick({ ...before, ...changes }) }] : changed;
    logRows(store.history, rows, body.effectiveMonth, reasonOf(body.reason));
  }
  return { ok: true, effectiveMonth: body.effectiveMonth, changed: changed.map(c => c.field), stamp: stampOf(store.history) };
}

export function groupHistory(path: string): { items: HistoryItem[] } {
  return { items: newestFirst(groups[groupKeyOf(path)].history) };
}

// ---------- Ngày trả lương ----------

const pad = (n: number) => String(n).padStart(2, '0');
const payDayAt = (month: string) => versionAt(groups.payCalendar.chain, month).values.payDay as number;

// Ngày trả của tháng M là ngày payDay (số đang hiệu lực ở M) của tháng M+1, không dời ngày.
export function payDateOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const day = pad(payDayAt(month));
  return m === 12 ? `${y + 1}-01-${day}` : `${y}-${pad(m + 1)}-${day}`;
}

export function payDaysOf(year: number): { year: number; items: PayDayItem[] } {
  const items: PayDayItem[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${pad(m)}`;
    items.push({ month, payDay: payDayAt(month), payDate: payDateOf(month) });
  }
  return { year, items };
}

// ---------- Tuần làm việc theo người ----------

// Người chưa có tuần riêng: chuỗi chỉ có phiên bản gốc weekdays = null (theo loại nhân sự).
function weekStore(username: string): Store {
  return weeks.get(username) ?? { chain: [{ month: BASE_MONTH, values: { weekdays: null } }], history: [] };
}

const standardOf = (weekdays: number[]) => Math.round((weekdays.length * 52) / 12);

export function workWeekOf(username: string, month: string = MOCK_MONTH): WorkWeek {
  const store = weekStore(username);
  const ver = versionAt(store.chain, month);
  const own: number[] | null = ver.values.weekdays;
  return {
    username,
    month,
    minMonth: MOCK_MONTH,
    weekdays: own ? [...own] : [...TYPE_WEEKDAYS],
    source: own ? 'own' : 'type',
    from: own ? ver.month : null,
    standardWorkdays: own ? standardOf(own) : TYPE_STANDARD_WORKDAYS,
    typeWeekdays: [...TYPE_WEEKDAYS],
    typeStandardWorkdays: TYPE_STANDARD_WORKDAYS,
    stamp: stampOf(store.history),
  };
}

// GET /settings/work-weeks?month=. BE §5.3 trả mọi người (tuần riêng nếu có, không thì tuần của loại), trừ người có loại không
// có tuần làm. Mock không có danh sách nhân sự nên chỉ trả người có tuần riêng đang hiệu lực ở tháng đó; người vắng mặt coi như
// tuần của loại (T2–T7), nên kết quả trên màn như nhau.
export function workWeeksAt(month: string): { month: string; weekdays: Record<string, number[]> } {
  const weekdays: Record<string, number[]> = {};
  for (const [username, store] of weeks) {
    const own: number[] | null = versionAt(store.chain, month).values.weekdays;
    if (own) weekdays[username] = [...own];
  }
  return { month, weekdays };
}

export function saveWorkWeekOf(username: string, body: WorkWeekBody) {
  const store = weekStore(username);
  checkStamp(store.history, body.stamp);
  checkMonth(body.effectiveMonth);
  let weekdays: number[] | null = null;
  if (body.weekdays !== null) {
    weekdays = [...new Set(body.weekdays)].sort((a, b) => a - b);
    if (!weekdays.length || weekdays.some(d => !Number.isInteger(d) || d < 1 || d > 6)) throw bad('weekdays');
  }

  const changed = applyChange(store.chain, body.effectiveMonth, { weekdays });
  if (changed.length) {
    weeks.set(username, store);
    logRows(store.history, changed, body.effectiveMonth, reasonOf(body.reason));
  }
  const now = workWeekOf(username, body.effectiveMonth);
  return { ok: true as const, weekdays: now.weekdays, source: now.source, standardWorkdays: now.standardWorkdays, stamp: now.stamp };
}

export function workWeekHistory(username: string): { items: HistoryItem[] } {
  return { items: newestFirst(weekStore(username).history) };
}

// ---------- Vùng chấm công (có hiệu lực ngay, không theo tháng; mỗi lần lưu một dòng lịch sử field 'zone') ----------

export function zoneOf(): { zone: Zone | null; stamp: number } {
  return { zone: clone(zone), stamp: stampOf(zoneLog) };
}

export function saveZoneOf(body: Zone & { reason: string | null; stamp: number }) {
  checkStamp(zoneLog, body.stamp);
  const next: Zone = { lat: body.lat, lng: body.lng, radiusM: body.radiusM };
  if (!same(zone, next)) {
    // Một lần lưu = một dòng lịch sử, field 'zone', from/to là cả vùng.
    logRows(zoneLog, [{ field: 'zone', from: zone, to: next }], null, reasonOf(body.reason));
    zone = next;
  }
  return { ok: true as const, zone: clone(zone), stamp: stampOf(zoneLog) };
}

export function zoneHistory(): { items: HistoryItem[] } {
  return { items: newestFirst(zoneLog) };
}

// ---------- Ngày lễ ----------

export function holidaysOf(year: number): { items: { date: string; name: string }[] } {
  const items = [...holidays]
    .filter(([date]) => date.startsWith(`${year}-`))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, name]) => ({ date, name }));
  return { items };
}

export function addHolidays(dates: string[], name: string): void {
  for (const d of dates) holidays.set(d, name);
}

export function removeHolidays(dates: string[]): void {
  for (const d of dates) holidays.delete(d);
}

// Thêm 4 ngày lễ cố định của năm (01-01, 30-04, 01-05, 02-09) nếu chưa có.
export function quickAddFixed(year: number): { added: string[] } {
  const added: string[] = [];
  for (const { md, name } of FIXED_HOLIDAYS) {
    const date = `${year}-${md}`;
    if (holidays.has(date)) continue;
    holidays.set(date, name);
    added.push(date);
  }
  return { added };
}
