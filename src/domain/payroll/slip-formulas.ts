'use strict';
// Công thức hiện dưới từng dòng ở phần "Chi tiết" của phiếu Admin (src/engine/admin/view-phieu.js chỉ in chuỗi này).
// Chạy lúc đọc phiếu, không ghi DB, không tính lại lương: mỗi công thức dựng từ bản chụp của lần tính (dòng ngày, tổng hợp tháng, m.net)
// và bộ tham số CỦA LẦN TÍNH đó, qua đúng các bước nhìn tham số của bộ máy (ngày công chuẩn của tháng, lịch của loại nhân sự, quyền lợi theo bậc).
// Mỗi mảnh công thức mang cả chữ lẫn giá trị; công thức chỉ được giữ khi giá trị của nó bằng số tự tính của dòng (lệch không quá 1 đồng
// mỗi bước làm tròn), không khớp thì dòng đó không có công thức, không bao giờ chỉnh cho khớp.
// Số kiểu vi-VN (6.000.000; 1,5; 25%), phép tính × ÷ + −. Mỗi số đi kèm tên hoặc đơn vị ngắn ngay sau nó (6.000.000 đ, 23 ngày công,
// 28.846,15 đ/giờ); tỷ lệ (30%) và hệ số nhân (× 1,5) đứng một mình; nhóm cộng trừ nằm trong ngoặc. Dòng đếm (ngày, giờ) chỉ liệt kê ngày được đếm.
const Params = require('../../engine/payroll-params');
const WorkSchedule = require('../../engine/work-schedule');
const PayOptions = require('../../engine/pay-options-calc');
const PayTailCalc = require('../../engine/pay-tail-calc');
const PayEntriesCalc = require('../../engine/pay-entries-calc');
const PayBlocksCalc = require('../../engine/pay-blocks-calc');

const num = (v?) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const EPS = 1e-6;
const ALLOWANCE_KEYS = ['attendance', 'travel', 'flexPay', 'breakPay', 'nightPay'];
const ALLOWANCE_NAMES = {
  attendance: 'chuyên cần',
  travel: 'đi lại',
  flexPay: 'linh hoạt',
  breakPay: 'nghỉ đêm',
  nightPay: 'ca đêm'
};
const INCOME_NAMES = {
  workBase: 'lương ngày công',
  leavePay: 'nghỉ phép',
  settlePay: 'phép dư',
  isatPay: 'iSAT',
  holidayPay: 'nghỉ lễ',
  otPay: 'làm thêm',
  allowance: 'phụ cấp',
  kpiPay: 'lương KPI'
};
const INCOME_KEYS = ['workBase', 'leavePay', 'settlePay', 'isatPay', 'holidayPay', 'otPay', 'allowance', 'kpiPay'];

/* ---------- mảnh công thức: { t: chữ, v: giá trị, k: a (số đơn) | p (tích, thương) | s (tổng, hiệu) } ---------- */
const fmt = (v?, digits = 0) => Number(v).toLocaleString('vi-VN', { maximumFractionDigits: digits }).replace('-', '−');
// Khoảng trắng không ngắt dòng: số và tên (đơn vị) của nó nằm chung một mảnh, xuống dòng chỉ xảy ra ở chỗ có phép tính
const NBSP = '\u00a0';
const nb = (text?) => String(text).replace(/ /g, NBSP);
// Số kèm tên: "23 ngày công", "6.000.000 đ"
const lit = (v?, digits = 0, name = '') => ({ t: name ? nb(`${fmt(v, digits)} ${name}`) : fmt(v, digits), v, k: 'a' });
const vnd = (v?, name = '') => lit(v, 0, name ? `đ ${name}` : 'đ');
// Đơn giá (đ/giờ, đ/ngày): err = sai số làm tròn của số hiện, fine = cùng giá trị ghi thêm hai chữ số thập phân
const priced = (v?, digits?, unit?) => ({
  ...lit(v, digits, unit),
  err: 0.5 * 10 ** -digits,
  fine: lit(v, digits + 2, unit)
});
const pct = (ratio?, digits = 2) => ({ t: `${fmt(ratio * 100, digits)}%`, v: ratio, k: 'a' });
const wrap = (f?, need?) => (need ? `(${f.t})` : f.t);
// Đơn giá ghi làm tròn; nhân với tích các số còn lại đủ lớn để làm tròn đó lệch hơn 0,25 đồng thì ghi thêm hai chữ số thập phân
const mul = (...xs) => {
  const shown = xs.map(x => {
    const scale = xs.reduce((s, y) => (y === x ? s : s * Math.abs(y.v)), 1);
    return x.err && scale * x.err > 0.25 ? x.fine : x;
  });
  return { t: shown.map(x => wrap(x, x.k === 's')).join(' × '), v: xs.reduce((s, x) => s * x.v, 1), k: 'p' };
};
const div = (a?, b?) => ({ t: `${wrap(a, a.k === 's')} ÷ ${wrap(b, b.k !== 'a')}`, v: a.v / b.v, k: 'p' });
const plus = (...xs) => ({ t: xs.map(x => x.t).join(' + '), v: xs.reduce((s, x) => s + x.v, 0), k: 's' });
const minus = (a, ...xs) => ({
  t: [a.t, ...xs.map(x => wrap(x, x.k === 's'))].join(' − '),
  v: xs.reduce((s, x) => s - x.v, a.v),
  k: 's'
});
// Số giờ kèm tên: đủ trong hai chữ số thập phân thì ghi số thập phân; giờ lẻ (10 phút, 56/9 giờ...) ghi phân số p/q để cộng lại đúng từng đồng
const hrs = (h?, name = '') => {
  const whole = (v?, eps = 1e-9) => Math.abs(v - Math.round(v)) < eps;
  if (whole(h * 100)) return lit(h, 2, name);
  for (let q = 3; q <= 120; q += 1)
    if (whole(h * q)) return { t: nb(`${Math.round(h * q)}/${q}${name ? ` ${name}` : ''}`), v: h, k: 'p' };
  return lit(h, 6, name);
};
const group = (f?) => ({ ...f, t: `(${f.t})`, k: 'a' });
// Mảnh cộng/trừ có số lượng (giờ hoặc ngày): các mảnh cùng khoá (cùng đơn giá, cùng hệ số) gộp thành một mảnh có số lượng ròng
// (cộng trừ theo dấu), mảnh ròng bằng 0 bỏ đi. Thứ tự giữ như lúc dựng; mảnh đầu phải dương, nếu không thì đưa mảnh dương đầu tiên lên trước.
// Tên của mảnh gộp: các mảnh có số lượng khác 0 cùng tên thì giữ tên đó, khác tên thì dùng tên chung `net` (sharedName); các mảnh
// cùng tên chung và cùng đơn giá, hệ số thì gộp được với nhau.
const hourTerm = (sign, hours, unit, label, ...mults) => ({
  sign,
  qty: hours,
  label,
  key: `h|${unit.v}|${mults.map(x => x.v).join('|')}`,
  build: (q?, name?) => mul(hrs(q, name), unit, ...mults)
});
const sharedName = (term?, net?) => Object.assign(term, { net, key: `${term.key}|${net}` });
const dayTerm = (sign?, days?, daily?, label?) => ({
  sign,
  qty: days,
  label,
  key: `d|${daily.v}`,
  build: (q?, name?) => mul(daily, lit(q, 0, name))
});
const fixedTerm = (sign?, f?) => ({ sign, raw: f });
function netSum(terms?) {
  const merged: any[] = [];
  for (const t of terms) {
    if (t.raw) merged.push({ sign: t.sign, f: t.raw });
    else if (Math.abs(t.qty) > EPS) {
      const same = merged.find(x => x.key === t.key);
      if (same) {
        same.qty += t.sign * t.qty;
        if (same.label !== t.label) same.label = same.net || t.net || same.label;
      } else merged.push({ key: t.key, build: t.build, qty: t.sign * t.qty, label: t.label, net: t.net });
    }
  }
  const items: any[] = [];
  for (const x of merged) {
    if (x.f) {
      items.push(x);
      continue;
    }
    const q = Math.round(x.qty * 1e9) / 1e9;
    if (Math.abs(q) > EPS) items.push({ sign: q > 0 ? 1 : -1, f: x.build(Math.abs(q), x.label) });
  }
  const first = items.findIndex(x => x.sign > 0);
  // triệt tiêu hết: giữ mảnh đầu với số lượng 0, như dòng không có ngày/giờ nào
  if (first < 0)
    return !items.length && terms[0] && terms[0].build && terms[0].sign > 0 ? terms[0].build(0, terms[0].label) : null;
  items.unshift(...items.splice(first, 1));
  if (items.length === 1) return items[0].f;
  return {
    t: items
      .map((x, i) => (i === 0 ? x.f.t : `${x.sign > 0 ? '+' : '−'} ${wrap(x.f, x.sign < 0 && x.f.k === 's')}`))
      .join(' '),
    v: items.reduce((s, x) => s + x.sign * x.f.v, 0),
    k: 's'
  };
}
const SYMBOL = { gt: '>', gte: '≥', lt: '<', lte: '≤' };
const INVERSE = { gt: 'lte', gte: 'lt', lt: 'gte', lte: 'gt' };
const holds = (op?, a?, b?) => ({ gt: a > b, gte: a >= b, lt: a < b, lte: a <= b })[op];

/* ---------- ngày được đếm ---------- */
const dm = (date?) => `${date.slice(8)}/${date.slice(5, 7)}`;
// Ngày liền nhau từ ba ngày trở lên gộp thành khoảng: 01–03/10, 06/10
function datesText(dates?) {
  const list = [...new Set<any>(dates)].sort();
  const parts: any[] = [];
  for (let i = 0; i < list.length;) {
    let j = i;
    while (j + 1 < list.length && Date.parse(list[j + 1]) - Date.parse(list[j]) === 86400000) j += 1;
    parts.push(
      j - i >= 2
        ? `${list[i].slice(8)}–${dm(list[j])}`
        : list
            .slice(i, j + 1)
            .map(dm)
            .join(', ')
    );
    i = j + 1;
  }
  return parts.join(', ');
}
const hoursText = (items?) => items.map(({ date, h }: any) => `${dm(date)} (${nb(`${fmt(h, 2)} giờ`)})`).join(', ');

/* ---------- ngữ cảnh của một phiếu ---------- */
// Bộ tham số của người này trong tháng, đúng các bước của src/engine/payroll-engine.ts → prepare
function paramsOf(params?, staff?, month?) {
  const monthly = WorkSchedule.create(Params.fillLate(params)).monthView(month);
  const person = WorkSchedule.create(monthly).forPerson(staff, month);
  return PayOptions.levelView(person.params, staff);
}
function contextOf(snapshot?, staff?, params?, month?) {
  const P = paramsOf(params, staff, month);
  const base = P[`level.${staff.type}.${staff.level}.base`];
  const std = P[`type.${staff.type}.workdays`];
  const hours = P['time.workHoursPerDay'];
  if (![base, std, hours].every(v => typeof v === 'number' && v > 0)) return null;
  const hourly = base / std / hours;
  return {
    P,
    type: staff.type,
    staff,
    m: snapshot,
    n: snapshot.net,
    rows: Array.isArray(snapshot.rows) ? snapshot.rows : [],
    base,
    std,
    hours,
    hourly,
    derived: Params.derive(P),
    daily: div(vnd(base), lit(std, 2, 'ngày chuẩn')),
    dayPrice: priced(base / std, 0, 'đ/ngày'),
    hour: priced(hourly, 2, 'đ/giờ')
  };
}
const kindRows = (c, ...kinds) => c.rows.filter(r => kinds.includes(r.kind));
const sumOf = (rows?, key?) => rows.reduce((s, r) => s + num(r[key]), 0);

/* ---------- dòng đếm: ngày hoặc giờ được đếm ---------- */
function countLines(c?, cells?, out?) {
  const worked = c.rows.filter(r => (r.kind === 'work' && !r.extraOnly) || (r.kind === 'holiday' && num(r.hours) > 0));
  const lists = {
    workDays: worked,
    unpaidDays: kindRows(c, 'unpaid', 'approved', 'noshow'),
    leaveDays: kindRows(c, 'leave'),
    isatDays: kindRows(c, 'isat').filter(r => r.paidOff),
    holidayDays: kindRows(c, 'holiday').filter(r => num(r.holBase) > 0)
  };
  for (const [key, rows] of Object.entries<any>(lists))
    if (rows.length && Math.abs(rows.length - num(cells[key])) < EPS) out[key] = datesText(rows.map(r => r.date));
  // giờ OT theo loại: ngày thường (ot.rate), cuối tuần ngoài lịch (ot.weekendRate), ngày lễ; giờ làm bù
  const hoursBy = {
    ot15H: (r?) => num(r.otH) - num(r.otWeekendH),
    ot20H: (r?) => num(r.otWeekendH),
    ot30H: (r?) => num(r.holWorkH),
    makeupHours: (r?) => num(r.makeupH)
  };
  const target = { ...cells, makeupHours: num(c.m.makeupHours) };
  for (const [key, pick] of Object.entries<any>(hoursBy)) {
    const items = c.rows.filter(r => pick(r) > EPS).map(r => ({ date: r.date, h: pick(r) }));
    const total = items.reduce((s, x) => s + x.h, 0);
    if (items.length && Math.abs(total - num(target[key])) < 0.01) out[key] = hoursText(items);
  }
  // giờ thiếu chưa bù = giờ thiếu của các ngày đi làm + một công cho mỗi ngày "Nghỉ, sẽ làm bù" − giờ làm bù đã trả; số hạng cùng tên cộng gộp thành một
  const shortHours = kindRows(c, 'work')
    .filter(r => !r.extraOnly)
    .reduce((s, r) => s + (num(r.short) > EPS ? r.short : 0), 0);
  const willmakeupDays = kindRows(c, 'willmakeup').length;
  const owed = [
    ...(shortHours > EPS ? [hrs(shortHours, 'giờ thiếu')] : []),
    ...(willmakeupDays ? [hrs(willmakeupDays * c.hours, 'giờ ca nghỉ làm bù')] : [])
  ];
  if (owed.length) {
    const made = num(c.m.makeupHours);
    const f = made > EPS ? minus(plus(...owed), hrs(made, 'giờ làm bù')) : plus(...owed);
    if (Math.abs(f.v - num(cells.debtH)) < 0.01) out.debtH = f.t;
  }
}

/* ---------- dòng tiền ngày công, nghỉ, lễ ---------- */
// Lương ngày × số ngày đi làm, trừ giờ ca chính rơi vào ngày lễ (trả ở dòng lễ), cộng giờ thường của ngày lễ có đi làm
function workBaseOf(c?) {
  const days = kindRows(c, 'work').filter(r => !r.extraOnly);
  const overlap = days.reduce((s, r) => s + num(r.holMainH) - num(r.holMainBreakH), 0);
  const holidayHours = sumOf(
    kindRows(c, 'holiday').filter(r => num(r.hours) > 0),
    'normalWorkH'
  );
  return netSum([
    dayTerm(1, days.length, c.daily, 'ngày công'),
    sharedName(
      hourTerm(1, holidayHours > EPS ? holidayHours : 0, c.hour, 'giờ thường của ca ngày lễ'),
      'giờ chênh ngày lễ'
    ),
    sharedName(hourTerm(-1, overlap > EPS ? overlap : 0, c.hour, 'giờ trùng ngày lễ'), 'giờ chênh ngày lễ')
  ]);
}
// Lương ngày × số ngày có tiền của loại ngày đó (nghỉ phép, iSAT hưởng lương, nghỉ lễ)
const paidDaysOf = (c?, kind?, key?, only?, name?) =>
  mul(c.daily, lit(kindRows(c, kind).filter(r => num(r[key]) > 0 && (!only || r[only])).length, 0, name));

/* ---------- làm thêm giờ ---------- */
// Mỗi nhóm = giờ × lương giờ × hệ số: giờ làm bù ×1, OT ngày thường, OT cuối tuần, giờ làm ngày lễ và phần đêm của giờ lễ;
// nhóm cùng hệ số gộp giờ lại (tên chung "giờ làm thêm")
function overtimeOf(c?) {
  const { P, m, hour } = c;
  const rate = (tail?) => Params.entitlement(P, c.type, tail);
  const weekdayH = num(m.otHours) - num(m.otWeekendHours);
  const ot = (hours?, label?, rateValue?) =>
    sharedName(hourTerm(1, hours, hour, label, lit(rateValue, 2)), 'giờ làm thêm');
  const parts = [
    ...(num(m.makeupHours) > EPS
      ? [
          ot(num(m.makeupHours), 'giờ làm bù', 1),
          ...(num(m.makeupHolPremium) > 0.5 ? [fixedTerm(1, vnd(m.makeupHolPremium, 'phụ trội làm bù ngày lễ'))] : [])
        ]
      : []),
    ...(weekdayH > EPS ? [ot(weekdayH, 'giờ OT', rate('ot.rate'))] : []),
    ...(num(m.otWeekendHours) > EPS ? [ot(num(m.otWeekendHours), 'giờ OT cuối tuần', rate('ot.weekendRate'))] : []),
    ...(num(m.holWorkHours) > EPS ? [ot(num(m.holWorkHours), 'giờ lễ', P['ot.holidayRate'])] : []),
    ...(num(m.holNightHours) > EPS ? [ot(num(m.holNightHours), 'giờ đêm lễ', c.derived.holidayNightRate)] : [])
  ];
  return parts.length ? netSum(parts) : null;
}

/* ---------- phụ cấp ---------- */
// Chuyên cần, đi lại: lương cơ bản × tỷ lệ × ngày đi làm ÷ ngày công chuẩn; chuyên cần mất thì ghi số quyết định (ngày nghỉ, giờ vượt)
function lostReason(c?) {
  const { P, m, type } = c;
  const absentOp = P['attendance.absentCompare'];
  const hoursOp = P['attendance.overLimitCompare'];
  const maxAbsent = P[`type.${type}.maxAbsent`];
  const overLimit =
    (P[`type.${type}.overLimitHours`] ?? P['attendance.overLimitHours']) + P['attendance.overLimitTolerance'];
  if (holds(absentOp, num(m.absent), maxAbsent))
    return `${nb(`${fmt(m.absent, 2)} ngày nghỉ`)} ${SYMBOL[absentOp]} ${nb(`${fmt(maxAbsent)} ngày tối đa`)}`;
  if (holds(hoursOp, num(m.overHours), overLimit))
    return `${nb(`${fmt(m.overHours, 2)} giờ vượt`)} ${SYMBOL[hoursOp]} ${nb(`${fmt(overLimit, 2)} giờ cho phép`)}`;
  return null;
}
function allowanceOf(c?, key?) {
  const rate = c.P[`type.${c.type}.${key}`];
  if (!(rate > 0)) return null;
  if (key === 'attendance' && c.m.attendOk === false) return lostReason(c);
  return div(mul(vnd(c.base), pct(rate), lit(num(c.m.count), 2, 'ngày đi làm')), lit(c.std, 2, 'ngày chuẩn'));
}
// Phụ cấp linh hoạt: giờ được phụ cấp × lương giờ × tỷ lệ
function flexOf(c?) {
  const rate = c.P[`type.${c.type}.flexBonus`] ?? c.P['shift.flex.bonus'];
  const rows = c.rows.filter(r => r.shift === 'flex' && num(r.bonus) > 0);
  if (!rows.length || !(rate > 0)) return null;
  return mul(hrs(sumOf(rows, 'bonus') / (rate * c.hourly), 'giờ linh hoạt'), c.hour, pct(rate));
}
// Thưởng ca đêm: số ca × lương ngày × tỷ lệ; ca qua ngày lễ chỉ có phần sàn: giờ đêm × lương giờ × phụ trội đêm
function nightOf(c?) {
  const rows = c.rows.filter(r => r.shift === 'night' && num(r.bonus) > 0);
  if (!rows.length) return null;
  const byRate = new Map<any, any>();
  const floors: any[] = [];
  for (const r of rows) {
    const ratio = Math.round((r.bonus / r.daily) * 1e6) / 1e6;
    const floor = num(r.nightH) * r.hourly * c.P['night.breakPremium'];
    if (Math.abs(r.bonus - r.daily * ratio) < 0.01 && Math.abs(r.bonus - floor) > 0.01)
      byRate.set(ratio, (byRate.get(ratio) || 0) + 1);
    else floors.push(r);
  }
  const parts = [...byRate].map(([ratio, count]: any) => mul(lit(count, 0, 'ca đêm'), c.dayPrice, pct(ratio)));
  if (floors.length) parts.push(mul(hrs(sumOf(floors, 'nightH'), 'giờ đêm'), c.hour, pct(c.P['night.breakPremium'])));
  return plus(...parts);
}
// Off Paid: giờ nghỉ trong khung đêm × lương giờ × (1 + phụ trội)
const breakOf = (c?) =>
  num(c.m.breakHours) > EPS
    ? mul(hrs(c.m.breakHours, 'giờ nghỉ đêm'), c.hour, lit(1 + c.P['night.breakPremium'], 2))
    : null;
// Trừ đi muộn, về sớm: giờ thiếu của các ngày đi làm × lương giờ
const lateCutOf = (c?) => (num(c.m.cut) > 0.5 ? mul(hrs(c.m.short, 'giờ thiếu'), c.hour) : null);
// Khối phụ cấp do C&B thêm: theo cách tính của khối (cố định, % lương cơ bản, theo bậc), nhân tỷ lệ ngày đi làm khi khối tính theo ngày
function blockOf(c?, b?) {
  const def = c.P[`${PayBlocksCalc.DEF_PREFIX}${b.code}`];
  if (!def || b.lost) return null;
  const at = (tail?) => c.P[`type.${c.type}.block.${b.code}.${tail}`];
  let f;
  if (def.method === 'fixed') f = vnd(at('amount'), 'cố định');
  else if (def.method === 'pctBase') f = mul(vnd(c.base), pct(at('pct')));
  else if (def.method === 'byLevel') f = vnd(at(`byLevel.${c.staff.level}`), 'theo bậc');
  else return null;
  return def.scalesWithDays ? div(mul(f, lit(num(c.m.count), 2, 'ngày đi làm')), lit(c.std, 2, 'ngày chuẩn')) : f;
}

/* ---------- KPI ---------- */
// Tổng điểm = trọng số × điểm từng thành phần; lương KPI = mức KPI × tổng điểm × hệ số ngày; không đạt thì ghi điểm so với mốc
const KPI_NAMES = {
  wework: 'Base Wework',
  user: 'người dùng',
  peer: 'đồng nghiệp',
  manager: 'quản lý',
  self: 'tự đánh giá'
};
function kpiTotalOf(c?) {
  const { m, P } = c;
  const parts = m.kpiParts && typeof m.kpiParts === 'object' ? m.kpiParts : null;
  if (m.kpiMethod !== 'five' || !parts || m.kpiPct == null) return null;
  const keys = ['wework', 'user', 'peer', 'manager', 'self'];
  if (!keys.every(k => typeof parts[k] === 'number')) return null;
  return plus(...keys.map(k => mul(pct(P[`kpi.weight.${k}`] / 100), lit(parts[k], 2, `điểm ${KPI_NAMES[k]}`))));
}
function kpiPayOf(c?) {
  const { m, P } = c;
  if (m.kpiPct == null || !(num(m.kpiAmt) > 0)) return null;
  if (m.kpiPass === false) {
    if (m.kpiReason === 'wework')
      return `${nb(`${fmt(m.kpiParts && m.kpiParts.wework, 2)} điểm Base Wework`)} < ${nb(`${fmt(P['kpi.weworkMin'])} điểm tối thiểu`)}`;
    return `${nb(`${fmt(m.kpiPct, 2)}% tổng điểm`)} ${SYMBOL[INVERSE[P['kpi.passCompare']]]} ${nb(`${fmt(P[`type.${c.type}.kpiPass`])}% mức đạt`)}`;
  }
  const ratio = num(m.trace && m.trace.heSoNgayKpi);
  const paid = mul(vnd(m.kpiAmt, 'lương KPI tối đa'), pct(m.kpiPct / 100, 4));
  if (Math.abs(ratio - 1) < EPS) return paid;
  return div(
    mul(vnd(m.kpiAmt, 'lương KPI tối đa'), pct(m.kpiPct / 100, 4), lit(num(m.count), 2, 'ngày đi làm')),
    lit(c.std, 2, 'ngày chuẩn')
  );
}

/* ---------- bảo hiểm, miễn thuế, thuế, tạm ứng ---------- */
// Bảo hiểm: nền đóng × tổng tỷ lệ (nền mỗi loại bị chặn ở trần của loại đó); không đóng thì ghi ngày công chuẩn trừ số ngày có lương
// (n.noPayDays = chuẩn − ngày có lương, không âm; tháng không đóng luôn dương nên ngày có lương = chuẩn − n.noPayDays) so với ngưỡng
function insuranceOf(c?) {
  const { P, n, m } = c;
  if (!n.insured) return null;
  if (!n.insuredMonth) {
    const std = typeof m.workdaysStd === 'number' ? m.workdaysStd : c.std;
    return `${nb(`${fmt(std, 2)} ngày chuẩn`)} − ${nb(`${fmt(std - n.noPayDays, 2)} ngày có lương`)} = ${nb(`${fmt(n.noPayDays, 2)} ngày không lương`)} ${SYMBOL[P['tax.insurance.skipCompare']]} ${nb(`${fmt(P['tax.insurance.skipDays'])} ngày`)}`;
  }
  const flagged =
    P['insurance.base'] === 'withFlaggedAllowances'
      ? PayEntriesCalc.sumsOf(m, P).insuranceBase + PayBlocksCalc.sumsOf(m, P).insuranceBase
      : 0;
  const base = PayTailCalc.insuranceBase(P, { levelBase: c.base, flagged, type: c.type, level: c.staff.level }, Params);
  const byBase = new Map<any, any>();
  for (const k of ['bhxh', 'bhyt', 'bhtn']) {
    const used = Math.min(base, c.derived.insuranceCap[k]);
    byBase.set(used, (byBase.get(used) || 0) + P[`tax.insurance.employee.${k}`]);
  }
  return plus(...[...byBase].map(([used, rate]: any) => mul(vnd(used, 'lương đóng bảo hiểm'), pct(rate))));
}
// Miễn thuế: chỉ phần trả cao hơn lương giờ thường của cùng số giờ (Thông tư 111/2013 Điều 3.1.i).
// Giờ đêm: mỗi ngày lấy số nhỏ hơn của (giờ đêm ngoài lễ × lương giờ × phụ trội đêm theo luật) và phụ cấp ca đã trả của ngày đó; ngày có phụ cấp nhỏ hơn
// thì cộng số phụ cấp đã trả, ngày không có phụ cấp ca không được miễn. Bản chụp không có dòng ngày thì lấy tổng giờ đêm × lương giờ × phụ trội.
// OT và làm lễ mỗi nhóm giờ: một nhóm trong ngoặc (tiền đã trả, hoặc mức miễn của luật nếu tiền trả vượt mức đó) − giờ của nhóm × lương giờ thường
function exemptNightOf(c?) {
  const { P, m, hour } = c;
  const premium = pct(P['tax.exempt.nightPremium']);
  if (!Array.isArray(m.rows))
    return num(m.nightHours) > EPS ? [hourTerm(1, m.nightHours, hour, 'giờ đêm', premium)] : [];
  const byHourly = new Map<any, any>();
  let capped = 0;
  for (const r of c.rows) {
    const hours = Math.max(0, num(r.nightH) - num(r.holMainNightH));
    if (hours <= EPS) continue;
    const rowHourly = r.hourly ?? c.hourly;
    if (hours * rowHourly * P['tax.exempt.nightPremium'] <= num(r.bonus))
      byHourly.set(rowHourly, (byHourly.get(rowHourly) || 0) + hours);
    else capped += num(r.bonus);
  }
  const parts: any[] = [...byHourly].map(([rowHourly, hours]: any) =>
    hourTerm(1, hours, rowHourly === c.hourly ? hour : priced(rowHourly, 2, 'đ/giờ'), 'giờ đêm', premium)
  );
  if (capped > 0.5) parts.push(fixedTerm(1, vnd(capped, 'phụ cấp ca đêm')));
  return parts;
}
function exemptOvertimeOf(c?) {
  const { P, m, hour, derived } = c;
  const parts: any[] = [];
  const above = (pay?, hours?, rate?, payName?, hourName?, nightHours = 0) => {
    if (!(hours > EPS)) return;
    const cap = [hourTerm(1, hours, hour, hourName, lit(rate, 2))];
    if (nightHours > EPS) cap.push(hourTerm(1, nightHours, hour, 'giờ đêm lễ', lit(derived.holidayNightAdd, 2)));
    const capV = netSum(cap).v;
    const items = [
      ...(pay <= capV + 0.5 ? [fixedTerm(1, vnd(pay, payName))] : cap),
      hourTerm(-1, hours, hour, hourName)
    ];
    const f = netSum(items);
    if (f && f.v > 0) parts.push(fixedTerm(1, group(f)));
  };
  const holHours = num(m.otHolHours);
  const weekendHours = num(m.otWeekendHours);
  above(
    num(m.otPay) - num(m.otHolPay) - num(m.otWeekendPay),
    num(m.otHours) - holHours - weekendHours,
    P['tax.exempt.otRate'],
    'OT',
    'giờ OT'
  );
  above(num(m.otWeekendPay), weekendHours, P['tax.exempt.weekendRate'], 'OT cuối tuần', 'giờ OT cuối tuần');
  above(num(m.otHolPay), holHours, P['tax.exempt.holidayRate'], 'OT lễ', 'giờ OT lễ', num(m.otHolNightHours));
  above(num(m.holWorkPay), num(m.holWorkHours), P['tax.exempt.holidayRate'], 'làm lễ', 'giờ lễ', num(m.holNightHours));
  return parts;
}
function exemptOf(c?) {
  const { n } = c;
  const parts = [...exemptNightOf(c), ...exemptOvertimeOf(c)];
  const entries = n.exempt - n.exemptNight - n.exemptOt;
  if (entries > 0.5) parts.push(fixedTerm(1, vnd(entries, 'khoản miễn thuế khác')));
  if (!parts.length) return null;
  const sum = netSum(parts);
  if (!sum) return null;
  return sum.v > n.exempt + 1.5 && n.exempt === n.gross ? vnd(n.gross, 'tổng thu nhập') : sum;
}
// Thuế lũy tiến: (chịu thuế − bảo hiểm − giảm trừ) áp từng bậc; không phát sinh thì ghi số so với ngưỡng
function taxOf(c?) {
  const { P, n } = c;
  const method = PayTailCalc.taxMethodOf(P, n.contract);
  if (method === 'flat') {
    const op = P['tax.casual.thresholdCompare'];
    if (!n.taxOn) return null;
    if (!holds(op, n.gross, P['tax.casual.threshold']))
      return `${nb(`${fmt(n.gross)} đ thu nhập`)} ${SYMBOL[INVERSE[op]]} ${nb(`${fmt(P['tax.casual.threshold'])} đ ngưỡng`)}`;
    return mul(vnd(n.gross, 'thu nhập'), pct(P['tax.casual.rate']));
  }
  if (method !== 'progressive') return null;
  const personal = P['tax.deduction.personal'];
  const dependant = P['tax.deduction.dependant'];
  const income = [vnd(n.taxable, 'thu nhập chịu thuế'), vnd(n.insurance, 'bảo hiểm')];
  if (!n.taxDue) {
    const threshold = PayTailCalc.ariseThreshold(P, personal);
    return `${(minus as any)(...income).t} ${SYMBOL[INVERSE[P['tax.personalCompare']]]} ${nb(`${fmt(threshold)} đ ngưỡng phát sinh thuế`)}`;
  }
  const deduct: any[] = [];
  const dependants = Math.round((n.deduction - personal) / dependant);
  if (n.deduction > personal && dependants > 0 && n.deduction === personal + dependants * dependant)
    deduct.push(
      vnd(personal, 'giảm trừ bản thân'),
      mul(lit(dependants, 0, 'người phụ thuộc'), lit(dependant, 0, 'đ/người'))
    );
  else if (n.deduction > 0) deduct.push(vnd(n.deduction, 'giảm trừ'));
  if (Math.max(0, n.taxable - n.insurance - n.deduction) <= 0)
    return `${(minus as any)(...income, ...deduct).t} ≤${NBSP}0${NBSP}đ`;
  const assessable = n.taxable - n.insurance - n.deduction;
  const terms: any[] = [];
  let lower = 0;
  for (const [cap, rate] of P['tax.brackets']) {
    if (assessable <= lower) break;
    const upper = cap === null ? Infinity : cap;
    const chunk =
      assessable <= upper
        ? group((minus as any)(...income, ...deduct, ...(lower > 0 ? [vnd(lower, 'cận dưới bậc')] : [])))
        : vnd(upper - lower, 'trong bậc');
    terms.push(mul(chunk, pct(rate)));
    lower = upper;
  }
  return plus(...terms);
}
// Tạm ứng đã duyệt: tỷ lệ × lương cơ bản thực nhận của ngày đi làm từ ngày 1 đến ngày advance.untilDay (lương ngày × số ngày, trừ tiền thiếu giờ);
// ngày lễ có đi làm thật góp lương ngày lễ (bằng lương ngày), OT ngày lễ không vào
function advanceOf(c?) {
  const { P, n, rows } = c;
  if (!(n.advance > 0)) return null;
  const rate = Params.overlay(P, c.type)['advance.rate'];
  if (P['advance.basis'] === 'fixedPctByLevel') return mul(pct(rate), vnd(c.base, 'lương cơ bản'));
  const days = rows.filter(
    r =>
      Number(r.date.slice(8)) <= P['advance.untilDay'] &&
      ((r.kind === 'work' && !r.extraOnly) || (r.kind === 'holiday' && num(r.hours) > 0 && num(r.holBase) > 0))
  );
  const cut = sumOf(days, 'cut');
  const worked = mul(c.daily, lit(days.length, 0, 'ngày công'));
  return mul(pct(rate), group(cut > 0.5 ? minus(worked, vnd(cut, 'trừ thiếu giờ')) : worked));
}

/* ---------- đầu vào, đầu ra ---------- */
// snapshot: bản chụp hiện trên phiếu (đã tính lại theo ô ghim nếu có); original: bản chụp gốc (dòng đếm lấy ở đây); cells: số tự tính từng ô
// (src/domain/payroll/slip-paid.ts → cellsOf). Trả { <khoá ô>: chữ, 'block:<mã>': chữ, allowanceTotal, gross, taxable, afterInsurance, net }.
function formulasOf({ snapshot, original = snapshot, staffTerms, params, month, cells }: any) {
  const out: Record<string, any> = {};
  if (!snapshot || !snapshot.net || !cells || !staffTerms || !params) return out;
  let c;
  try {
    c = contextOf(snapshot, staffTerms, params, month);
  } catch {
    return out;
  }
  if (!c) return out;
  const cell = (key?) => num(cells[key]);
  // f: mảnh công thức (giữ khi giá trị khớp mục tiêu), chuỗi (ghi số quyết định, giữ nguyên) hoặc null
  const put = (key?, build?, target?, tolerance = 1) => {
    let f: any = null;
    try {
      f = build(c);
    } catch {
      f = null;
    }
    if (typeof f === 'string') out[key] = f;
    else if (f && Math.abs(f.v - target) <= tolerance && !(Math.abs(f.v) < 0.5 && Math.abs(target) < 0.5))
      out[key] = f.t; // dòng bằng 0 (số lượng 0) không có công thức "× 0"
  };
  try {
    countLines({ ...c, m: original, rows: Array.isArray(original.rows) ? original.rows : [] }, cells, out);
  } catch {
    // dòng đếm không dựng được thì bỏ, không ảnh hưởng dòng tiền
  }
  put('workBase', workBaseOf, cell('workBase'));
  put('leavePay', k => paidDaysOf(k, 'leave', 'total', null, 'ngày phép'), cell('leavePay'));
  put('isatPay', k => paidDaysOf(k, 'isat', 'total', 'paidOff', 'ngày iSAT'), cell('isatPay'));
  put('holidayPay', k => paidDaysOf(k, 'holiday', 'holBase', null, 'ngày lễ'), cell('holidayPay'));
  if (num(c.m.settleDays) > 0)
    put('settlePay', k => mul(k.daily, lit(k.m.settleDays, 2, 'ngày phép dư')), cell('settlePay'));
  put('otPay', overtimeOf, cell('otPay'));
  put('attendance', k => allowanceOf(k, 'attendance'), cell('attendance'));
  put('travel', k => allowanceOf(k, 'travel'), cell('travel'));
  put('flexPay', flexOf, cell('flexPay'));
  put('breakPay', breakOf, cell('breakPay'));
  put('nightPay', nightOf, cell('nightPay'));
  put('lateCut', lateCutOf, cell('lateCut'));
  const blocks = Array.isArray(c.m.blocks) ? c.m.blocks : [];
  for (const b of blocks) put(`block:${b.code}`, k => blockOf(k, b), num(b.amount));
  put('kpiPct', kpiTotalOf, num(c.m.kpiPct), 0.01);
  put('kpiPay', kpiPayOf, cell('kpiPay'));
  /* Tổng phụ cấp = cộng các dòng phụ cấp hiện ra; Tổng thu nhập = cộng các dòng tiền (phụ cấp gộp thành Tổng phụ cấp), trừ tiền trừ đi muộn */
  const shown = (key?) => Math.round(cell(key));
  const allowanceParts = [
    ...ALLOWANCE_KEYS.map(key => [shown(key), ALLOWANCE_NAMES[key]]),
    ...blocks.map(b => [Math.round(num(b.amount)), b.label || b.code])
  ].filter(([v]: any) => v > 0);
  const allowanceSum = allowanceParts.reduce((s, [v]: any) => s + v, 0); // tổng phụ cấp = cộng các dòng phụ cấp nguyên đồng
  if (allowanceParts.length) out.allowanceTotal = plus(...allowanceParts.map(([v, name]: any) => lit(v, 0, name))).t;
  const income = INCOME_KEYS.map(key => [key === 'allowance' ? allowanceSum : shown(key), INCOME_NAMES[key]]).filter(
    ([v]: any) => v > 0
  );
  const entriesAdd = num(c.n.entriesAdd);
  const terms = [...income, ...(entriesAdd > 0 ? [[entriesAdd, 'khoản cộng thêm']] : [])].map(([v, name]: any) =>
    lit(v, 0, name)
  );
  if (terms.length) {
    const sum = plus(...terms);
    const gross = shown('lateCut') > 0 ? minus(sum, lit(shown('lateCut'), 0, 'đi muộn về sớm')) : sum;
    if (Math.abs(gross.v - c.n.gross) <= (snapshot.lines ? 0 : terms.length)) out.gross = gross.t; // bản chụp có dòng nguyên đồng: tổng các dòng đúng bằng tổng thu nhập
  }
  put('exempt', exemptOf, c.n.exempt, 2);
  put('insurance', insuranceOf, c.n.insurance, 2);
  put('tax', taxOf, c.n.tax, 1);
  put('advance', advanceOf, c.n.advance, 1);
  out.taxable = minus(lit(c.n.gross, 0, 'tổng thu nhập'), lit(c.n.exempt, 0, 'miễn thuế')).t;
  out.afterInsurance = minus(lit(c.n.gross, 0, 'tổng thu nhập'), lit(c.n.insurance, 0, 'bảo hiểm')).t;
  out.net = minus(
    lit(c.n.gross, 0, 'tổng thu nhập'),
    lit(c.n.insurance, 0, 'bảo hiểm'),
    lit(c.n.tax, 0, 'thuế'),
    lit(c.n.advance, 0, 'tạm ứng'),
    ...(num(c.n.entriesDeduct) > 0 ? [lit(c.n.entriesDeduct, 0, 'khoản trừ khác')] : [])
  ).t;
  return out;
}

export = { formulasOf, _test: { netSum, hourTerm, sharedName } };
