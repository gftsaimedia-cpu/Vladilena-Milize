// Đổi phản hồi của máy chủ (GET /staff, /positions, /catalog/shifts, /settings/shifts, /staff/:u/schedule) về hình dạng
// các màn Nhân sự đọc, và đổi biểu mẫu về thân PUT /staff/:u, PUT /staff/shift-bulk. Thuần: không gọi mạng.
export const PAGE_SIZE = 20;

export const CONTRACT_TO_V2 = Object.freeze({ long: '3m', short: 'u3' });
export const CONTRACT_TO_BE = Object.freeze({ '3m': 'long', u3: 'short' });
export const CONTRACT_OPTIONS = [
  { value: '3m', label: 'HĐLĐ từ 3 tháng' },
  { value: 'u3', label: 'Dưới 3 tháng' }
];
export const INSURANCE_OPTIONS = [
  { value: 'default', label: 'Theo mặc định của hợp đồng' },
  { value: 'yes', label: 'Có' },
  { value: 'no', label: 'Không' }
];
export const CONTRACT_STATUS_OPTIONS = [
  { value: '', label: 'Chưa xác định' },
  { value: 'probation', label: 'Thử việc' },
  { value: 'official', label: 'Chính thức' }
];
const NO_SHIFT = 'Chưa có ca';

/** Bỏ dấu, hạ chữ thường để tìm không phân biệt dấu. */
export const fold = (s?) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

const listOf = (res?) => (res && Array.isArray(res.positions) ? res.positions : null);
const hoursOf = (settingsShiftsRes?) => {
  const map = new Map<any, any>();
  for (const s of (settingsShiftsRes && settingsShiftsRes.shifts) || []) map.set(s.code, `${s.in}–${s.out}`);
  return map;
};

/** Tên đăng nhập chuẩn: cắt khoảng trắng, chữ thường. */
export const normalizeUsername = (u?) =>
  String(u || '')
    .trim()
    .toLowerCase();

/** Lựa chọn của biểu mẫu: loại, bậc theo loại, ca (value là mã ngắn n1..g2), hợp đồng, bảo hiểm. */
export function buildStaffOptions(positionsRes?, catalogRes?, settingsShiftsRes?) {
  const positions = (listOf(positionsRes) || []).filter(p => !p.deprecated);
  const hours = hoursOf(settingsShiftsRes);
  const levels: Record<string, any> = {};
  for (const p of positions)
    levels[p.code] = (p.levels || []).map(l => ({ value: String(l.level), label: l.name || `Bậc ${l.level}` }));
  const shifts = ((catalogRes && catalogRes.shifts) || [])
    .filter(s => !s.deprecated)
    .map(s => ({ value: s.preset, label: hours.has(s.code) ? `${s.name} · ${hours.get(s.code)}` : s.name }));
  return {
    types: positions.map(p => ({ value: p.code, label: p.label })),
    levels,
    shifts: [{ value: '', label: NO_SHIFT }, ...shifts],
    contracts: CONTRACT_OPTIONS,
    insurance: INSURANCE_OPTIONS
  };
}

const insuranceLine = (insured?, dependants?) => {
  if (!insured) return 'Không đóng bảo hiểm';
  return dependants > 0 ? `Đóng bảo hiểm · ${dependants} người phụ thuộc` : 'Đóng bảo hiểm';
};

/** Một dòng hồ sơ của máy chủ thành dòng danh sách. positions/catalog/settingsShifts có thể là null (người xem không có quyền đọc). */
function rowOf(raw?, ctx?) {
  const pos = ctx.posByCode.get(raw.type) || null;
  const lvl = pos && (pos.levels || []).find(l => l.level === raw.level);
  const catalogShift = raw.shiftCode ? ctx.shiftByCode.get(raw.shiftCode) || null : null;
  const typeBad = !!ctx.posByCode.size && !pos;
  const shift = catalogShift ? catalogShift.preset : raw.shiftCode || '';
  const locked = !!raw.locked;
  const needsStart = pos ? pos.startDateRequired === true : true;
  const start = raw.startDate || null;
  return {
    username: raw.username,
    name: raw.name,
    type: raw.type,
    typeLabel: typeBad ? `Loại "${raw.type}" không hợp lệ` : pos ? pos.label : raw.type,
    typeBad,
    level: raw.levelName || (lvl && lvl.name) || String(raw.level),
    shift,
    shiftName: raw.shiftCode ? (catalogShift ? catalogShift.name : raw.shiftCode) : NO_SHIFT,
    shiftHours: raw.shiftCode ? ctx.hours.get(raw.shiftCode) || '—' : '—',
    start,
    needsStart,
    contract: CONTRACT_TO_V2[raw.contract] || '',
    contractLabel: (CONTRACT_OPTIONS.find(c => c.value === CONTRACT_TO_V2[raw.contract]) || {}).label || '',
    insuranceLabel: insuranceLine(raw.insured, raw.dependants || 0),
    issue: typeBad ? 'Sửa loại nhân sự' : !locked && !shift ? 'Gán ca' : null,
    locked,
    ver: { rev: raw.rev }
  };
}

function contextOf(positionsRes?, catalogRes?, settingsShiftsRes?) {
  const positions = listOf(positionsRes) || [];
  return {
    positions,
    posByCode: new Map<any, any>(positions.map(p => [p.code, p])),
    shiftByCode: new Map<any, any>(((catalogRes && catalogRes.shifts) || []).map(s => [s.code, s])),
    hours: hoursOf(settingsShiftsRes)
  };
}

/** Danh sách nhân sự có lương: dòng, số đếm theo chip, tóm tắt. Xếp theo loại (thứ tự chức vụ) rồi theo tên. */
export function buildStaffRows(staffRes?, positionsRes?, catalogRes?, settingsShiftsRes?) {
  const ctx = contextOf(positionsRes, catalogRes, settingsShiftsRes);
  const order = new Map<any, any>(ctx.positions.map((p, i) => [p.code, i]));
  const rank = (type?) => (order.has(type) ? order.get(type) : order.size);
  const rows = ((staffRes && staffRes.staff) || [])
    .filter(s => s.payrollSubject === true)
    .map(s => rowOf(s, ctx))
    .sort((a: any, b: any) => rank(a.type) - rank(b.type) || a.name.localeCompare(b.name, 'vi'));
  const counts = { all: rows.length };
  for (const p of ctx.positions) counts[p.code] = rows.filter(r => r.type === p.code).length;
  if (!ctx.positions.length) for (const r of rows) counts[r.type] = (counts[r.type] || 0) + 1;
  for (const key of ['tts', 'ctv', 'nv']) counts[key] = counts[key] || 0;
  counts['chua-co-ca'] = rows.filter(r => !r.shift).length;
  counts['thieu-ngay'] = rows.filter(r => !r.start && r.needsStart).length;
  counts['da-khoa'] = rows.filter(r => r.locked).length;
  return {
    rows,
    counts,
    summary: {
      total: rows.length,
      active: rows.filter(r => !r.locked).length,
      noShift: counts['chua-co-ca'],
      noStart: counts['thieu-ngay']
    }
  };
}

const FILTERS = {
  'chua-co-ca': (r?) => !r.shift,
  'thieu-ngay': (r?) => !r.start && r.needsStart,
  'da-khoa': (r?) => r.locked
};

/** Lọc theo chip và ô tìm, rồi chia trang (trang kẹp trong [1, pages]). */
export function filterStaffRows(rows?, { loc = 'all', q = '', page = 1 }: any = {}, pageSize = PAGE_SIZE) {
  const byLoc = loc === 'all' ? rows : rows.filter(FILTERS[loc] || (r => r.type === loc));
  const needle = fold(q);
  const found = needle ? byLoc.filter(r => fold(r.name).includes(needle) || fold(r.username).includes(needle)) : byLoc;
  const pages = Math.max(1, Math.ceil(found.length / pageSize));
  const at = Math.min(Math.max(1, Number(page) || 1), pages);
  const lockedNames = loc === 'chua-co-ca' ? found.filter(r => r.locked).map(r => r.name) : [];
  return {
    rows: found.slice((at - 1) * pageSize, at * pageSize),
    total: found.length,
    page: at,
    pages,
    lockedNote: lockedNames.length ? `${lockedNames.join(', ')} đã khoá tài khoản` : ''
  };
}

// ---------- Hồ sơ ----------

const DOW_LABEL = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
/** "theo loại nhân sự, T2 – T7": lịch theo loại nhân sự rồi dải thứ làm việc (Chủ nhật xếp cuối; dải liền từ 3 ngày viết gọn). */
export function scheduleText(scheduleRes?) {
  const dows = scheduleRes && scheduleRes.schedule && scheduleRes.schedule.pattern && scheduleRes.schedule.pattern.dows;
  if (!Array.isArray(dows) || !dows.length) return '—';
  const days = [...new Set<any>(dows)].sort((a: any, b: any) => (a || 7) - (b || 7));
  const run = days.every((d, i) => i === 0 || (d || 7) === (days[i - 1] || 7) + 1);
  const range =
    run && days.length >= 3
      ? `${DOW_LABEL[days[0]]} – ${DOW_LABEL[days[days.length - 1]]}`
      : days.map(d => DOW_LABEL[d]).join(', ');
  return `theo loại nhân sự, ${range}`;
}

const pad2 = (n?) => String(n).padStart(2, '0');
/** "08:00 04/08/2025" theo giờ Việt Nam (UTC+7) từ mốc ISO. */
export function vnStamp(iso?) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t + 7 * 3600000);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} ${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** Hồ sơ đầy đủ của một người (ngăn kéo Sửa hồ sơ). raw: một phần tử của GET /staff. null nếu không có. */
export function buildProfile(raw?, positionsRes?, catalogRes?, scheduleRes?) {
  if (!raw) return null;
  const ctx = contextOf(positionsRes, catalogRes, null);
  const pos = ctx.posByCode.get(raw.type) || null;
  const lvl = pos && (pos.levels || []).find(l => l.level === raw.level);
  const levelName = raw.levelName || (lvl && lvl.name) || String(raw.level);
  const typeLabel = pos ? pos.label : raw.type;
  const catalogShift = raw.shiftCode ? ctx.shiftByCode.get(raw.shiftCode) || null : null;
  const leave = raw.leave && Number.isFinite(raw.leave.balance) ? raw.leave.balance : null;
  return {
    username: raw.username,
    name: raw.name,
    title: raw.jobTitle || '',
    type: raw.type,
    level: String(raw.level),
    subtitle: [typeLabel, levelName].join(' · '),
    shift: catalogShift ? catalogShift.preset : raw.shiftCode || '',
    shiftCode: raw.shiftCode || null,
    start: raw.startDate || null,
    birth: raw.birthday || null,
    birthHidden: !Object.hasOwn(raw, 'birthday'),
    iDorm: !!raw.idorm,
    scheduleText: scheduleText(scheduleRes),
    contract: CONTRACT_TO_V2[raw.contract] || '',
    contractStatus: Object.hasOwn(raw, 'contractStatus') ? raw.contractStatus : undefined,
    dependents: raw.dependants || 0,
    insurance: raw.insuredExplicit ? (raw.insured ? 'yes' : 'no') : 'default',
    taxDeduct: raw.taxOn !== false,
    familyDeduct: raw.deductOn !== false,
    advance: raw.advanceOn !== false,
    payHidden: !Object.hasOwn(raw, 'contract'),
    accountState: raw.locked ? 'Đã khoá' : 'Đang dùng',
    createdAt: vnStamp(raw.createdAt),
    leave,
    locked: !!raw.locked,
    role: raw.role,
    payrollSubject: raw.payrollSubject,
    ver: { rev: raw.rev }
  };
}

/** Khoá đồng thời của một mục: ném lỗi lập trình khi view không giữ phiên bản. */
export function requireRev(ver?, what = 'hồ sơ') {
  if (!ver || typeof ver.rev !== 'string' || !ver.rev) throw new Error(`Thiếu số phiên bản (rev) của ${what}`);
  return ver.rev;
}

const orNull = (v?) => (v === '' || v === undefined ? null : v);

/** Thân PUT /staff/:u từ biểu mẫu hồ sơ. shifts: catalog ca [{ code, preset }] để đổi mã ngắn về mã ca. Trường người xem không thấy thì bỏ khỏi thân (máy chủ giữ giá trị cũ). */
export function toStaffPutBody(draft?, ver?, shifts: any[] = []) {
  const catalogCode = draft.shift ? (shifts.find(s => s.preset === draft.shift) || {}).code : null;
  const body: Record<string, any> = {
    expectedRev: requireRev(ver),
    name: String(draft.name || '').trim(),
    role: draft.role === 'admin' ? 'admin' : 'staff',
    type: draft.type,
    level: Number(draft.level),
    shiftCode: draft.shift ? catalogCode || draft.shiftCode || null : null,
    startDate: orNull(draft.start),
    idorm: !!draft.iDorm
  };
  if (Object.hasOwn(draft, 'title')) body.jobTitle = draft.title || '';
  if (Object.hasOwn(draft, 'leaveAdjust')) body.leaveAdjust = Number(draft.leaveAdjust) || 0;
  if (Object.hasOwn(draft, 'contractStatus') && draft.contractStatus !== undefined)
    body.contractStatus = draft.contractStatus || null;
  if (!draft.birthHidden) body.birthday = orNull(draft.birth);
  if (typeof draft.payrollSubject === 'boolean') body.payrollSubject = draft.payrollSubject;
  if (!draft.payHidden) {
    body.dependants = Number(draft.dependents) || 0;
    body.taxOn = !!draft.taxDeduct;
    body.deductOn = !!draft.familyDeduct;
    body.advanceOn = !!draft.advance;
    body.contract = CONTRACT_TO_BE[draft.contract] || null;
    body.insured = draft.insurance === 'yes' ? true : draft.insurance === 'no' ? false : null;
  }
  return body;
}

/** Thân tạo nhân sự mới (POST /staff; thông tin đăng nhập do máy chủ tạo). */
export function toNewStaffBody(form?, shifts: any[] = []) {
  const catalogCode = form.shift ? (shifts.find(s => s.preset === form.shift) || {}).code : null;
  return {
    name: String(form.name || '').trim(),
    role: 'staff',
    type: form.type,
    level: Number(form.level),
    shiftCode: form.shift ? catalogCode || null : null,
    startDate: orNull(form.start),
    birthday: orNull(form.birth),
    jobTitle: form.title || '',
    contractStatus: form.contractStatus || null
  };
}

/** Thân PUT /staff/shift-bulk: ca theo mã ngắn (n1..g2), hiệu lực ngay (không gửi ngày). */
export const toShiftBulkBody = (usernames?, preset?) => ({ usernames: [...usernames], preset });

// ---------- Phép năm còn lại ----------

const LEAVE_FILTERS = {
  neg: (r?) => r.left < 0,
  zero: (r?) => r.left === 0,
  adj: (r?) => r.adjust !== 0
};

/** Bảng phép năm tới hôm nay: người có sổ phép (GET /staff → leave). Được cộng = tổng trừ điều chỉnh; còn lại = số dư. */
export function buildLeaveBalances(
  staffRes?,
  positionsRes?,
  asOf?,
  { filter = 'all', q = '', page = 1 }: any = {},
  pageSize = PAGE_SIZE
) {
  const shortOf = new Map<any, any>((listOf(positionsRes) || []).map(p => [p.code, p.short || p.code.toUpperCase()]));
  const all = ((staffRes && staffRes.staff) || [])
    .filter(s => s.payrollSubject === true && s.leave)
    .map(s => ({
      id: s.username,
      name: s.name,
      sub: shortOf.get(s.type) || String(s.type).toUpperCase(),
      granted: s.leave.total - s.leave.adjust,
      used: s.leave.used,
      adjust: s.leave.adjust,
      left: s.leave.balance,
      tag: s.leave.balance < 0 ? 'neg' : s.leave.balance === 0 ? 'zero' : s.leave.adjust !== 0 ? 'adj' : null
    }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name, 'vi'));
  const needle = fold(q);
  const byFilter = LEAVE_FILTERS[filter] ? all.filter(LEAVE_FILTERS[filter]) : all;
  const found = needle ? byFilter.filter(r => fold(r.name).includes(needle) || fold(r.id).includes(needle)) : byFilter;
  const total = filter === 'all' && !needle ? all.length : found.length;
  const pages = Math.max(1, Math.ceil(found.length / pageSize));
  const at = Math.min(Math.max(1, Number(page) || 1), pages);
  return {
    asOf,
    counts: {
      all: all.length,
      neg: all.filter(LEAVE_FILTERS.neg).length,
      zero: all.filter(LEAVE_FILTERS.zero).length,
      adj: all.filter(LEAVE_FILTERS.adj).length
    },
    rows: found.slice((at - 1) * pageSize, at * pageSize),
    total,
    page: at,
    pages
  };
}

/** Ngày hôm nay theo giờ Việt Nam từ mốc ISO của máy chủ (GET /me → serverNow). */
export const vnDate = (iso?) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t + 7 * 3600000).toISOString().slice(0, 10);
};
