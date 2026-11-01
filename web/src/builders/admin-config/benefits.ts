// Dựng màn "Chế độ theo loại nhân sự" từ tham số tính lương. Máy chủ lưu phụ cấp và quyền lợi theo LOẠI nhân sự;
// mỗi bậc của loại hiện cùng một mức, sửa ở bậc nào thì áp cho cả loại.
import { TYPE_NAME, TYPE_ORDER, fromPct, toPct, valueOf } from './params';

// Khoá cột bảng "Phụ cấp và lương KPI". pct: tỉ lệ lưu 0.15 hiện 15; list: mức đầu của danh sách mức ca đêm
const MONEY_COLS = [
  { key: 'di-lai', label: 'Phụ cấp đi lại', kind: 'pct', param: (t?) => `type.${t}.travel` },
  { key: 'chuyen-can', label: 'Phụ cấp chuyên cần', kind: 'pct', param: (t?) => `type.${t}.attendance` },
  { key: 'flex', label: 'Phụ cấp Flex', kind: 'pct', param: (t?) => `type.${t}.flexBonus` },
  {
    key: 'ca-dem',
    label: 'Phụ cấp ca đêm',
    kind: 'pct',
    param: (t?) => (t === 'nv' ? 'type.nv.nightOptions' : 'shift.night.bonus'),
    list: (t?) => t === 'nv'
  },
  { key: 'kpi', label: 'Lương KPI', kind: 'check', param: (t?) => `type.${t}.benefit.kpi` },
  { key: 'idorm', label: 'iDorm', kind: 'check', param: (t?) => `type.${t}.benefit.idorm` }
];
// Cờ quyền lợi theo loại cho bảng "Được gửi yêu cầu"
const REQ_COLS = [
  { key: 'phep-nam', label: 'Nghỉ phép năm', param: (t?) => `type.${t}.benefit.leaveAccount` },
  { key: 'isat', label: 'iSAT', param: (t?) => `type.${t}.benefit.isat` },
  { key: 'nghi-duoc-duyet', label: 'Nghỉ được duyệt', param: (t?) => `type.${t}.benefit.approvedLeave` },
  { key: 'ot', label: 'OT', param: (t?) => `type.${t}.benefit.ot` },
  { key: 'lam-bu-gio', label: 'Làm bù theo giờ', param: (t?) => `type.${t}.benefit.makeupHours` }
];

const TYPE_KEY = { tts: 'thuc-tap-sinh', ctv: 'chuyen-trach', nv: 'nhan-vien' };
export const TYPE_BY_KEY = Object.fromEntries(Object.entries(TYPE_KEY).map(([t, k]: any) => [k, t]));

function readMoney(idx?, col?, t?) {
  const v = valueOf(idx, col.param(t));
  if (col.kind === 'check') return !!v;
  if (col.list && col.list(t)) return Array.isArray(v) ? (v.length ? v[0] : 0) : 0;
  return toPct(v == null ? 0 : v);
}

export function buildBenefits(idx?, headcount?) {
  const levelRows: Record<string, any> = {};
  for (const entry of idx.entries) {
    if (entry.id !== 'level.<type>.<level>' || !Array.isArray(entry.value)) continue;
    for (const row of entry.value) (levelRows[row.type] = levelRows[row.type] || []).push(row);
  }
  const types = TYPE_ORDER.filter(t => levelRows[t]).map(t => ({
    key: TYPE_KEY[t],
    name: TYPE_NAME[t],
    count: headcount[t] || 0,
    levels: levelRows[t]
      .slice()
      .sort((a: any, b: any) => a.level - b.level)
      .map(row => ({
        name: row.name,
        values: Object.fromEntries(MONEY_COLS.map(c => [c.key, readMoney(idx, c, t)])),
        req: Object.fromEntries(REQ_COLS.map(c => [c.key, !!valueOf(idx, c.param(t))]))
      }))
  }));
  return {
    columns: MONEY_COLS.map(({ key, label, kind }: any) => ({ key, label, kind })),
    requests: REQ_COLS.map(({ key, label }: any) => ({ key, label })),
    types
  };
}

/** Danh sách [khoá, giá trị] mà bản nháp muốn đặt, so với bản đã tải (base). */
export function benefitsWanted(idx?, base?, draft?) {
  const wanted = new Map<any, any>();
  for (const type of draft.types) {
    const t = TYPE_BY_KEY[type.key];
    const before = base.types.find(x => x.key === type.key);
    if (!t || !before) continue;
    const pick = (read?, key?) => {
      const changed = type.levels.find((lv, i) => JSON.stringify(read(lv)) !== JSON.stringify(read(before.levels[i])));
      return changed ? read(changed) : undefined;
    };
    for (const col of MONEY_COLS) {
      const next = pick(lv => lv.values[col.key], col.key);
      if (next === undefined) continue;
      const key = col.param(t);
      if (col.kind === 'check') wanted.set(key, !!next);
      else if (col.list && col.list(t)) {
        const list = valueOf(idx, key);
        wanted.set(key, [Number(next), ...(Array.isArray(list) ? list.slice(1) : [])]);
      } else wanted.set(key, fromPct(next));
    }
    for (const col of REQ_COLS) {
      const next = pick(lv => lv.req[col.key], col.key);
      if (next !== undefined) wanted.set(col.param(t), !!next);
    }
  }
  return wanted;
}
