'use strict';
// Hàm dùng chung của bộ dữ liệu demo: ngày giờ (giờ Việt Nam), dựng ngày trong lịch ước tính, số ngẫu nhiên có hạt giống.
// Không đọc đồng hồ, không đọc DB: chỉ tính toán. Các quy tắc ca, lịch dùng lại src/engine/punch.ts, không viết lại.
const P = require('../../../src/engine/punch');

const SHIFT = P.SHIFT;
const SCHED = Object.freeze({ tts: [1, 2, 3, 4, 5], ctv: [1, 2, 3, 4, 5, 6], nv: [1, 2, 3, 4, 5, 6] });
const pad = (n?) => String(n).padStart(2, '0');
const dowOf = (date?) => new Date(date + 'T00:00:00Z').getUTCDay();
const addDays = (date?, n?) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const daysInMonth = (month?) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const datesOfMonth = (month?) => Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${pad(i + 1)}`);
const nextMonth = (month?) => {
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
};
// Giờ Việt Nam 'YYYY-MM-DD' + 'HH:MM[:SS]' → ISO UTC
const vn = (date?, hm?) => new Date(`${date}T${hm.length === 5 ? hm + ':00' : hm}+07:00`).toISOString();
// 'YYYY-MM-DDTHH:MM' (giờ VN) hoặc ISO có múi giờ → mili giây
const at = (text?) => Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : text + ':00+07:00');

/* ---------- giờ trong ngày ---------- */
const toMin = (t?) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m?) =>
  `${pad(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${pad((((m % 1440) + 1440) % 1440) % 60)}`;
const spanH = (a?, b?) => {
  let d = toMin(b) - toMin(a);
  if (d <= 0) d += 1440;
  return d / 60;
};
function overlapsNight(a?, b?) {
  let e = b;
  if (e <= a) e += 1440;
  for (let t = a; t < e; t++) {
    const x = t % 1440;
    if (x >= 1320 || x < 360) return true;
  }
  return false;
}
// Ca suy ra từ giờ vào - ra, cùng luật với shiftFor của máy chủ
function shiftFor(tin?, tout?) {
  const a = toMin(tin),
    b = toMin(tout);
  if (overlapsNight(a, b)) return 'night';
  if (a < 420 || b >= 1320) return 'flex';
  return 'normal';
}
// Mỗi 4 giờ làm nghỉ 1 giờ (giờ làm thực của đoạn làm thêm), cùng luật blockH của máy chủ
const blockH = (mins?) => (Math.floor(mins / 300) * 240 + Math.min(240, mins % 300)) / 60;

/* ---------- dựng ngày trong lịch ước tính (đúng dạng cleanDays của máy chủ trả ra) ---------- */
function shiftTimes(p?) {
  return p.shiftCode && SHIFT[p.shiftCode] ? SHIFT[p.shiftCode] : p.freeHours || ['08:30', '17:30'];
}
function workDay(p?, patch: any = {}) {
  const [tin, tout] = shiftTimes(p);
  return {
    kind: 'work',
    shift: shiftFor(tin, tout),
    in: tin,
    out: tout,
    extraKind: '',
    extraIn: '',
    extraOut: '',
    preset: p.shiftCode && SHIFT[p.shiftCode] ? p.shiftCode : '',
    breakMin: 0,
    ...patch
  };
}
// Mỗi hàm trong E nhận persona và trả ngày; dùng làm giá trị của `edits`
const E = {
  leave: () => ({ kind: 'leave' }),
  unpaid: () => ({ kind: 'unpaid' }),
  isat: () => ({ kind: 'isat' }),
  approved: () => ({ kind: 'approved' }),
  willmakeup: () => ({ kind: 'willmakeup' }),
  noshow: () => ({ kind: 'noshow' }),
  // làm bù cả ngày (ngày ngoài lịch, ví dụ Thứ 7 của TTS)
  makeupDay:
    (tin = '08:00', tout = '17:00') =>
    () => ({
      kind: 'makeup',
      shift: shiftFor(tin, tout),
      in: tin,
      out: tout,
      extraKind: '',
      extraIn: '',
      extraOut: '',
      preset: '',
      breakMin: 0
    }),
  ot:
    (extraOut?, extraIn = '') =>
    p =>
      workDay(p, { extraKind: 'ot', extraOut, extraIn }),
  makeupHours:
    (extraOut?, extraIn = '') =>
    p =>
      workDay(p, { extraKind: 'makeup', extraOut, extraIn }),
  work:
    (patch: any = {}) =>
    p =>
      workDay(p, patch),
  // giờ tự do (người chưa có ca cố định)
  hours:
    (tin?, tout?, patch: any = {}) =>
    p =>
      workDay({ ...p, shiftCode: null }, { in: tin, out: tout, shift: shiftFor(tin, tout), ...patch }),
  raw: (day?) => () => day
};

// Các ngày làm việc của tháng cho persona: mọi ngày trong lịch (trừ ngày lễ) rồi chồng `edits` lên.
// opts: { from, to, blank (true = chỉ ghi ngoại lệ, ngày trống là đi làm mặc định), edits: { ngày: E.x | null | object } }
function buildMonthDays(p?, month?, holidays?, opts: any = {}) {
  const sched = SCHED[p.type] || SCHED.tts;
  const hol = new Set<any>(holidays);
  const from = opts.from || `${month}-01`;
  const to = opts.to || `${month}-${pad(daysInMonth(month))}`;
  const days: Record<string, any> = {};
  if (!opts.blank)
    for (const date of datesOfMonth(month)) {
      if (date < from || date > to || hol.has(date) || !sched.includes(dowOf(date))) continue;
      if (p.startDate && !p.sheetsBeforeStart && date < p.startDate) continue;
      days[date] = workDay(p);
    }
  for (const [date, make] of Object.entries<any>(opts.edits || {})) {
    if (make === null) delete days[date];
    else days[date] = typeof make === 'function' ? make(p) : make;
  }
  return Object.fromEntries(Object.entries<any>(days).sort(([a]: any, [b]: any) => (a < b ? -1 : 1)));
}

/* ---------- số ngẫu nhiên có hạt giống (mulberry32), đầu ra giống hệt mỗi lần chạy ---------- */
function hashSeed(text?) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seedText?) {
  let a = hashSeed(String(seedText));
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (lo?, hi?) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (list?) => list[Math.floor(next() * list.length)];
  return next;
}

// Mật khẩu băm scrypt với muối cố định: cùng định dạng src/platform/auth.ts (scrypt$muối$băm) nên đăng nhập được, và đầu ra không đổi giữa các lần chạy
function fixedHash(password?, saltHex = 'de3a0c0de3a0c0de3a0c0de3a0c0de3a') {
  const crypto = require('node:crypto');
  return `scrypt$${saltHex}$${crypto.scryptSync(password, saltHex, 64).toString('hex')}`;
}

module.exports = {
  P,
  SHIFT,
  SCHED,
  pad,
  dowOf,
  addDays,
  daysInMonth,
  datesOfMonth,
  nextMonth,
  vn,
  at,
  toMin,
  fromMin,
  spanH,
  overlapsNight,
  shiftFor,
  blockH,
  shiftTimes,
  workDay,
  E,
  buildMonthDays,
  rng,
  hashSeed,
  fixedHash
};
