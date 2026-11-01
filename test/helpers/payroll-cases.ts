'use strict';
// Bộ sinh ca tính lương có hạt giống.
// Sinh trong bộ nhớ, thuần: không đọc đồng hồ, không đọc DB, không đọc dữ liệu thật. Cùng (seed, index) luôn ra đúng một ca.
// Chỉ có người bịa (qa_gen_NNNN), lịch bịa (persona, ca, ngày lễ); không import dữ liệu demo.
//
// Một "ca" là đầu vào của chuỗi lương đầy đủ (computeMonth):
//   { staff, days, approvals, sessions, kpi, holidays, month, upTo, asOf }
//   days       lịch ước tính { 'YYYY-MM-DD': ngày } (dạng cleanDays của máy chủ)
//   approvals  hàng duyệt { 'YYYY-MM-DD': { item, fingerprint, status } } (đầu vào của ApprovalView.payView)
//   sessions   lượt Check-in/out [{ id, state, date, entry }] (đầu vào của ActualHours.apply)
//   kpi        { pct, amt, admPct, admAmt } hoặc { method: 'five', parts, ... } hoặc số
// Chạy trực tiếp để (tạo lại) file vàng:  node test/helpers/payroll-cases.ts --golden   (xem cuối file)
const PunchRules = require('../../src/engine/punch');
const ApprovalView = require('../../src/engine/approval-view');
const { declaredPunches } = require('./declared-punches');

const GENERATOR_VERSION = 2;
const MONTHS = ['2026-09', '2026-10', '2026-11', '2026-12'];
const SCHEDULE = { tts: [1, 2, 3, 4, 5], ctv: [1, 2, 3, 4, 5, 6], nv: [1, 2, 3, 4, 5, 6] };
const MAX_LEVEL = { tts: 6, ctv: 4, nv: 4 };
const KPI_MAX = { ctv: [1500000, 3000000, 4500000, 6000000], nv: [6000000, 6500000, 7000000, 7500000] };
const PRESETS = ['n1', 'n2', 'f1', 'f2', 'g1', 'g2'];

/* ---------- số ngẫu nhiên có hạt ---------- */
function mulberry32(seed?) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Hạt riêng cho từng ca: thêm hay bớt ca ở cuối không làm đổi các ca trước
const caseSeed = (seed?, index?) =>
  (Math.imul(seed >>> 0, 2654435761) ^ Math.imul(index + 1, 40503) ^ 0x9e3779b9) >>> 0;
function makeRng(seed?) {
  const next = mulberry32(seed);
  const rng = {
    next,
    int: (lo?, hi?) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p?) => next() < p,
    pick: (list?) => list[Math.floor(next() * list.length)],
    weighted(pairs?) {
      const total = pairs.reduce((sum, [, w]: any) => sum + w, 0);
      let x = next() * total;
      for (const [value, w] of pairs) {
        x -= w;
        if (x < 0) return value;
      }
      return pairs[pairs.length - 1][0];
    }
  };
  return rng;
}

/* ---------- ngày giờ ---------- */
const pad = (n?) => String(n).padStart(2, '0');
const dowOf = (date?) => new Date(date + 'T00:00:00Z').getUTCDay();
const addDays = (date?, n?) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const daysInMonth = (month?) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const datesOf = (month?) => Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${pad(i + 1)}`);
const toMin = (t?) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m?) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
};
const isNightMinute = (m?) => {
  const x = ((m % 1440) + 1440) % 1440;
  return x >= 1320 || x < 360;
};
// đoạn a -> b (phút, qua nửa đêm được) có chạm khung 22h-6h không
function touchesNight(a?, b?) {
  let end = b;
  if (end <= a) end += 1440;
  for (let t = a; t < end; t++) if (isNightMinute(t)) return true;
  return false;
}
const shiftOf = (tin?, tout?) => {
  const a = toMin(tin),
    b = toMin(tout);
  if (touchesNight(a, b)) return 'night';
  if (a < 420 || b >= 1320) return 'flex';
  return 'normal';
};
const isoAt = (date?, hm?) => new Date(`${date}T${hm}:00+07:00`).toISOString();

/* ---------- các tình huống bắt buộc xoay vòng (mỗi ca số i ép tình huống i mod N) ---------- */
// Mỗi mục sửa `spec` (bản mô tả ca) trước khi dựng lịch; cả bộ vàng lẫn bộ 5.000 ca dùng chung
const FOCUS = [
  [
    'night',
    (s, r) => ((s.type = s.type === 'tts' ? 'nv' : s.type), (s.shiftCode = r.pick(['g1', 'g2'])), (s.fill = 0.9))
  ],
  ['night-flex-free', (s, r) => ((s.type = 'nv'), (s.shiftCode = null), (s.freeNight = true))],
  ['ot', (s, r) => ((s.type = r.pick(['ctv', 'nv'])), (s.wantOt = 0.5))],
  ['makeup-hours', (s, r) => ((s.type = r.pick(['tts', 'ctv', 'nv'])), (s.wantMakeupHours = 0.5), (s.wantShort = 0.4))],
  ['makeup-day', (s, r) => ((s.type = r.pick(['tts', 'tts', 'ctv', 'nv'])), (s.wantMakeupDay = 0.5))],
  ['holiday-work', (s, r) => ((s.wantHolidayWork = 0.9), (s.holidayCount = r.int(1, 3)))],
  [
    'holiday-ot',
    (s, r) => ((s.type = 'nv'), (s.wantHolidayWork = 0.9), (s.wantOt = 0.8), (s.holidayCount = r.int(1, 3)))
  ],
  ['leave', (s, r) => ((s.type = r.pick(['ctv', 'nv'])), (s.wantLeave = 0.2))],
  ['isat', (s, r) => ((s.type = 'nv'), (s.wantIsat = 0.25))],
  ['unpaid', (s, r) => ((s.type = r.pick(['ctv', 'nv'])), (s.wantUnpaid = 0.2))],
  ['willmakeup', (s, r) => ((s.type = r.pick(['ctv', 'nv'])), (s.wantWillmakeup = 0.2), (s.wantMakeupHours = 0.3))],
  ['approved-leave', (s, r) => ((s.type = r.pick(['ctv', 'nv'])), (s.wantApproved = 0.2))],
  ['kpi-five', (s, r) => ((s.type = r.pick(['ctv', 'nv'])), (s.kpiMode = 'five'))],
  ['kpi-legacy', (s, r) => ((s.type = r.pick(['ctv', 'nv'])), (s.kpiMode = 'legacy'))],
  [
    'over-limit',
    (s, r) => ((s.type = r.pick(['ctv', 'nv'])), (s.wantUnpaid = 0.12), (s.wantShort = 0.5), (s.wantLeave = 0.08))
  ],
  ['short-day', (s, r) => (s.wantShort = 0.6)],
  ['break-min', (s, r) => (s.wantBreak = 0.5)],
  ['mid-month-start', (s, r) => ((s.type = r.pick(['ctv', 'nv'])), (s.startMode = 'mid'))],
  ['idorm', (s, r) => ((s.type = 'nv'), (s.idorm = true))],
  [
    'casual-contract',
    (s, r) => (
      (s.contract = 'short'),
      (s.insured = r.pick([true, false, undefined])),
      (s.taxOn = r.pick([true, false, undefined]))
    )
  ],
  ['dependants', (s, r) => ((s.contract = 'long'), (s.dependants = r.int(1, 5)))],
  ['switches-off', (s, r) => ((s.deductOn = false), (s.advanceOn = false))],
  ['upto', (s, r) => (s.useUpTo = true)],
  [
    'actual-late',
    (s, r) => ((s.actual = true), (s.shiftCode = r.pick(['n1', 'n2', 'f1', 'f2'])), (s.scenarioBias = 'late'))
  ],
  [
    'actual-early',
    (s, r) => ((s.actual = true), (s.shiftCode = r.pick(['n1', 'n2', 'f1', 'f2'])), (s.scenarioBias = 'early'))
  ],
  ['actual-forgot', (s, r) => ((s.actual = true), (s.shiftCode = r.pick(PRESETS)), (s.scenarioBias = 'forgot'))],
  ['actual-absent', (s, r) => ((s.actual = true), (s.shiftCode = r.pick(PRESETS)), (s.scenarioBias = 'absent'))],
  ['actual-night', (s, r) => ((s.actual = true), (s.type = 'nv'), (s.shiftCode = r.pick(['g1', 'g2'])))],
  [
    'actual-extra',
    (s, r) => (
      (s.actual = true),
      (s.type = r.pick(['ctv', 'nv'])),
      (s.shiftCode = r.pick(['n1', 'n2'])),
      (s.wantOt = 0.5),
      (s.wantMakeupHours = 0.3),
      (s.scenarioBias = 'extra')
    )
  ],
  ['tts-saturday', (s, r) => ((s.type = 'tts'), (s.wantMakeupDay = 0.6))],
  ['month-boundary', (s, r) => ((s.boundaryHolidays = true), (s.wantHolidayWork = 0.5))],
  ['random', () => {}]
];

function newSpec(rng?) {
  const type = rng.weighted([
    ['tts', 2],
    ['ctv', 2],
    ['nv', 4]
  ]);
  return {
    type,
    month: rng.pick(MONTHS),
    fill: rng.pick([0.4, 0.7, 0.85, 1, 1, 1]),
    shiftCode: rng.chance(0.75) ? rng.pick(PRESETS) : null,
    startMode: rng.weighted([
      ['early', 6],
      ['none', 2],
      ['mid', 1]
    ]),
    contract: rng.weighted([
      [undefined, 5],
      ['long', 3],
      ['short', 2]
    ]),
    insured: rng.weighted([
      [undefined, 7],
      [true, 1],
      [false, 1]
    ]),
    dependants: rng.weighted([
      [undefined, 6],
      [0, 2],
      [1, 1],
      [2, 1]
    ]),
    taxOn: rng.weighted([
      [undefined, 8],
      [false, 1]
    ]),
    deductOn: rng.weighted([
      [undefined, 8],
      [false, 1]
    ]),
    advanceOn: rng.weighted([
      [undefined, 8],
      [false, 1]
    ]),
    idorm: rng.chance(0.15),
    holidayCount: rng.weighted([
      [0, 4],
      [1, 3],
      [2, 2],
      [3, 1]
    ]),
    boundaryHolidays: rng.chance(0.15),
    wantOt: rng.chance(0.3) ? 0.2 : 0,
    wantMakeupHours: rng.chance(0.25) ? 0.2 : 0,
    wantMakeupDay: rng.chance(0.2) ? 0.2 : 0,
    wantHolidayWork: rng.chance(0.3) ? 0.5 : 0,
    wantLeave: rng.chance(0.3) ? 0.05 : 0,
    wantUnpaid: rng.chance(0.3) ? 0.05 : 0,
    wantWillmakeup: rng.chance(0.2) ? 0.05 : 0,
    wantApproved: rng.chance(0.2) ? 0.05 : 0,
    wantIsat: rng.chance(0.25) ? 0.1 : 0,
    wantNoshow: rng.chance(0.05) ? 0.03 : 0,
    wantShort: rng.chance(0.3) ? 0.15 : 0,
    wantBreak: rng.chance(0.15) ? 0.2 : 0,
    kpiMode: rng.weighted([
      ['auto', 6],
      ['number', 1],
      ['none', 1]
    ]),
    useUpTo: rng.chance(0.25),
    actual: rng.chance(0.3),
    scenarioBias: null
  };
}

/* ---------- dựng ngày ---------- */
function freeHours(rng?, spec?) {
  if (spec.freeNight)
    return rng.pick([
      ['22:00', '07:00'],
      ['21:00', '06:00'],
      ['23:00', '08:00']
    ]);
  const tin = rng.pick(['06:00', '07:00', '08:00', '08:30', '09:00', '10:00', '12:00', '13:00']);
  return [tin, fromMin(toMin(tin) + 540)];
}
function baseDay(rng?, spec?) {
  const [tin, tout] = spec.shiftCode ? PunchRules.SHIFT[spec.shiftCode] : freeHours(rng, spec);
  // Gọn: chỉ các trường mà công thức đọc (calcDay tự suy ra ca từ giờ vào - ra); trường làm thêm và nghỉ chỉ có khi dùng
  return { kind: 'work', in: tin, out: tout };
}
// Đoạn làm thêm: không chạm khung 22h-6h (luật của giao diện và máy chủ); không dựng được thì bỏ
function addExtra(rng?, day?, kind?) {
  const a = toMin(day.in),
    b = toMin(day.out);
  if (rng.chance(0.2)) {
    const lead = rng.int(1, 6) * 30;
    if (!touchesNight(a - lead, a)) return { ...day, extraKind: kind, extraIn: fromMin(a - lead) };
  }
  const tail = rng.int(1, kind === 'ot' ? 8 : 12) * 30;
  if (!touchesNight(b, b + tail)) return { ...day, extraKind: kind, extraOut: fromMin(b + tail) };
  return day;
}
function buildWorkDay(rng?, spec?, flags: any = {}) {
  let day: any = baseDay(rng, spec);
  if (rng.chance(spec.wantShort)) {
    const minutes = rng.pick([15, 30, 45, 90, 240, 300, 375, 420, 450, 495]);
    day = { ...day, out: fromMin(toMin(day.in) + minutes) };
  }
  if (rng.chance(spec.wantBreak)) day.breakMin = rng.pick([15, 30, 60]);
  if (!flags.noExtra) {
    if (rng.chance(spec.wantOt)) day = addExtra(rng, day, 'ot');
    else if (rng.chance(spec.wantMakeupHours)) day = addExtra(rng, day, 'makeup');
  }
  return day;
}
function buildMakeupDay(rng?) {
  const tin = rng.pick(['08:00', '09:00', '13:00']),
    hours = rng.pick([2, 4, 5, 6, 8, 9]);
  const tout = fromMin(toMin(tin) + hours * 60);
  return { kind: 'makeup', in: tin, out: tout };
}

function holidaysOf(rng?, spec?) {
  const dates = datesOf(spec.month);
  const list = new Set<any>();
  for (let k = 0; k < spec.holidayCount; k++) list.add(rng.pick(dates));
  if (spec.boundaryHolidays) {
    list.add(addDays(dates[dates.length - 1], 1));
    list.add(addDays(dates[0], -1));
    list.add(dates[dates.length - 1]);
  }
  return [...list].sort();
}

function buildDays(rng?, spec?, holidays?) {
  const days: Record<string, any> = {};
  const sched = SCHEDULE[spec.type];
  const hol = new Set<any>(holidays);
  for (const date of datesOf(spec.month)) {
    const dow = dowOf(date);
    const scheduled = sched.includes(dow);
    if (hol.has(date)) {
      if (rng.chance(spec.wantHolidayWork)) days[date] = buildWorkDay(rng, spec);
      continue;
    }
    if (!scheduled) {
      if (rng.chance(spec.wantMakeupDay)) days[date] = buildMakeupDay(rng);
      else if (rng.chance(0.01)) days[date] = baseDay(rng, spec); // ngày ngoài lịch bị bỏ qua khi tính
      continue;
    }
    if (rng.chance(spec.wantIsat) && (dow === 6 || rng.chance(0.3))) {
      days[date] = { kind: 'isat' };
      continue;
    }
    const x = rng.next();
    let acc = 0;
    const take = (p?) => (x < (acc += p) ? true : false);
    if (take(spec.wantLeave)) days[date] = { kind: 'leave' };
    else if (take(spec.wantUnpaid)) days[date] = { kind: 'unpaid' };
    else if (take(spec.wantWillmakeup)) days[date] = { kind: 'willmakeup' };
    else if (take(spec.wantApproved)) days[date] = { kind: 'approved' };
    else if (take(spec.wantNoshow)) days[date] = { kind: 'noshow' };
    else if (rng.chance(spec.fill)) days[date] = buildWorkDay(rng, spec);
  }
  return days;
}

/* ---------- hàng duyệt ---------- */
function buildApprovals(rng?, spec?, days?, holidays?) {
  const rows: Record<string, any> = {};
  for (const [date, day] of Object.entries<any>(days)) {
    const found = ApprovalView.itemOf(day, { date, holidays, staffType: spec.type });
    // "Nghỉ, sẽ làm bù" thành khoản cần duyệt nhưng ca vàng không có hàng duyệt cho nó: bỏ qua để dãy ca và đầu vào không đổi
    if (!found || found.item === 'willmakeup') continue;
    const roll = rng.next();
    if (roll < 0.2) continue; // chưa có hàng duyệt = chờ duyệt
    const base = { item: found.item, fingerprint: found.fingerprint, rev: 1 };
    if (roll < 0.62) rows[date] = { ...base, status: 'approved' };
    else if (roll < 0.72)
      rows[date] = { ...base, status: 'approved', fingerprint: found.fingerprint + '|cu' }; // dấu vân tay lệch với khoản hiện tại
    else if (roll < 0.88) rows[date] = { ...base, status: 'rejected' };
    else rows[date] = { ...base, status: 'pending' };
  }
  return rows;
}

/* ---------- KPI ---------- */
function buildKpi(rng?, spec?, fiveParts?) {
  if (spec.kpiMode === 'none') return null;
  const top = KPI_MAX[spec.type === 'tts' ? 'nv' : spec.type][Math.max(0, Math.min(3, spec.level - 1))];
  const amount = () => rng.pick([null, null, top, Math.round(top / 2), 0, 1234567, top + 500000]);
  const pct = () => rng.pick([null, 100, 100, 90, 85, 80, 75, 74.99, 60, 0, 99.5, 120]);
  const score = () => rng.pick([null, 100, 95, 90.5, 85, 80, 75, 74, 70, 60.25, 50, 0]);
  if (spec.kpiMode === 'number') return rng.pick([100, 80, 75, 74, 0, null]);
  if (fiveParts) {
    const complete = rng.chance(0.75);
    const parts = Object.fromEntries(
      ['wework', 'user', 'peer', 'manager', 'self'].map(key => [key, complete ? (score() ?? 80) : score()])
    );
    return { method: 'five', parts, pct: pct(), amt: amount(), admPct: null, admAmt: amount() };
  }
  return {
    pct: pct(),
    amt: amount(),
    admPct: rng.chance(0.4) ? pct() : null,
    admAmt: rng.chance(0.4) ? amount() : null
  };
}

/* ---------- Check-in/out ---------- */
function buildSessions(rng?, spec?, staff?, days?, holidays?, from?, today?) {
  const sessions: any[] = [];
  let id = 0;
  const plans = { shiftCode: staff.shiftCode, sched: SCHEDULE[staff.type] };
  if (!staff.shiftCode) return sessions;
  const hol = new Set<any>(holidays);
  const add = (state?, plan?, entry?) =>
    sessions.push({ id: ++id, username: staff.username, date: plan.date, state, entry });
  const closed = (plan?, inMinus?, outPlus?) => {
    const start = Date.parse(plan.startIso) + inMinus * 60000,
      end = Date.parse(plan.endIso) + outPlus * 60000;
    if (end <= start) return;
    const built = PunchRules.buildDay(plans, new Date(start).toISOString(), new Date(end).toISOString(), 'punch', {
      plannedShift: plan,
      approveIncomplete: true
    });
    add('closed', plan, built.entry);
  };
  for (const date of datesOf(spec.month)) {
    if (date < from || date > today) continue;
    const plan = PunchRules.planShift(plans, date);
    if (!plan) continue;
    const declared = days[date];
    const offDay = !SCHEDULE[staff.type].includes(dowOf(date));
    const leaveLike = declared && ['leave', 'unpaid', 'isat', 'approved', 'willmakeup'].includes(declared.kind);
    if ((offDay || hol.has(date) || leaveLike) && !rng.chance(0.06)) continue;
    const bias = spec.scenarioBias;
    const scenario = rng.weighted([
      ['ok', bias ? 3 : 14],
      ['grace', bias ? 1 : 3],
      ['late', bias === 'late' ? 8 : 2],
      ['early', bias === 'early' ? 8 : 2],
      ['late-early', bias === 'late' || bias === 'early' ? 4 : 1],
      ['extra', bias === 'extra' ? 10 : 2],
      ['absent', bias === 'absent' ? 8 : 1],
      ['forgot-out', bias === 'forgot' ? 6 : 1],
      ['forgot-in', bias === 'forgot' ? 6 : 1],
      ['off-shift', 1],
      ['double', 1],
      ['review', 1]
    ]);
    if (scenario === 'absent') continue;
    if (scenario === 'ok') closed(plan, -rng.int(0, 10), rng.int(0, 15));
    else if (scenario === 'grace') closed(plan, rng.int(1, 14), -rng.int(0, 14));
    else if (scenario === 'late') closed(plan, rng.int(15, 100), rng.int(0, 10));
    else if (scenario === 'early') closed(plan, 0, -rng.int(15, 100));
    else if (scenario === 'late-early') closed(plan, rng.int(15, 70), -rng.int(15, 70));
    else if (scenario === 'extra') {
      // có mặt đến hết đoạn làm thêm đã khai (nếu có), để OT / làm bù đã duyệt được trả
      let before = 0,
        after = 0;
      if (declared && declared.extraOut) after = (toMin(declared.extraOut) - toMin(declared.out) + 1440) % 1440 || 0;
      if (declared && declared.extraIn) before = (toMin(declared.in) - toMin(declared.extraIn) + 1440) % 1440 || 0;
      closed(plan, -before - rng.int(0, 5), after + rng.int(0, 5));
    } else if (scenario === 'forgot-out')
      add('closed', plan, {
        kind: 'pending',
        reason: 'forgot-out',
        src: 'punch',
        presIn: new Date(Date.parse(plan.startIso) - rng.int(0, 10) * 60000).toISOString(),
        plannedShift: plan
      });
    else if (scenario === 'forgot-in')
      add('closed', plan, {
        kind: 'pending',
        reason: 'forgot-in',
        src: 'punch',
        presOut: new Date(Date.parse(plan.endIso) + rng.int(0, 10) * 60000).toISOString(),
        plannedShift: plan
      });
    else if (scenario === 'off-shift') {
      const start = Date.parse(plan.startIso) + 20 * 3600000;
      add('closed', plan, {
        kind: 'pending',
        reason: 'off-shift',
        src: 'punch',
        presIn: new Date(start).toISOString(),
        presOut: new Date(start + 3600000).toISOString(),
        plannedShift: plan
      });
    } else if (scenario === 'double') {
      const span = Date.parse(plan.endIso) - Date.parse(plan.startIso);
      const cut = Math.floor(span / 2 / 60000);
      closed(plan, 0, -(Math.floor(span / 60000) - cut));
      closed(plan, cut + rng.int(0, 30), 0);
    } else if (scenario === 'review')
      add('closed', plan, {
        kind: 'pending',
        reason: 'needs-review',
        src: 'admin',
        presIn: plan.startIso,
        presOut: plan.endIso,
        plannedShift: plan
      });
  }
  // lượt đang mở của ngày hôm nay
  if (today.startsWith(spec.month) && rng.chance(0.08)) {
    const plan = PunchRules.planShift(plans, today);
    if (plan && !sessions.some(s => s.date === today))
      add('open', plan, { kind: 'pending', reason: 'open', src: 'punch', presIn: plan.startIso, plannedShift: plan });
  }
  return sessions;
}

/* ---------- một ca ---------- */
function generateCase(seed?, index?) {
  const rng = makeRng(caseSeed(seed, index));
  const spec: any = newSpec(rng);
  const [focusName, focus]: any = FOCUS[index % FOCUS.length];
  focus(spec, rng);
  spec.level = rng.int(1, MAX_LEVEL[spec.type]);
  if (spec.type === 'tts') Object.assign(spec, { kpiMode: 'none' });

  const month = spec.month;
  const holidays = holidaysOf(rng, spec);
  const staff: Record<string, any> = {
    username: 'qa_gen_' + String(index).padStart(4, '0'),
    type: spec.type,
    level: spec.level
  };
  if (spec.type === 'nv') staff.nightPct = rng.pick([40, 60]);
  if (spec.idorm) staff.idorm = true;
  if (spec.shiftCode) staff.shiftCode = spec.shiftCode;
  if (spec.startMode === 'early') staff.startDate = rng.pick(['2025-03-03', '2026-01-05', '2026-06-15', '2026-08-31']);
  else if (spec.startMode === 'mid') staff.startDate = `${month}-${pad(rng.int(2, 20))}`;
  for (const key of ['contract', 'insured', 'dependants', 'taxOn', 'deductOn', 'advanceOn'])
    if (spec[key] !== undefined) staff[key] = spec[key];

  const days = buildDays(rng, spec, holidays);
  const approvals = buildApprovals(rng, spec, days, holidays);

  // kpiMode 'five' / 'legacy' ép dạng đầu vào KPI; còn lại để ngẫu nhiên
  const fiveParts = spec.kpiMode === 'five' ? true : spec.kpiMode === 'legacy' ? false : rng.chance(0.6);
  const kpi = buildKpi(rng, spec, fiveParts);

  const upTo = spec.useUpTo ? rng.pick(datesOf(month).slice(3, -1)) : null;

  let asOf = isoAt(addDays(`${month}-${pad(daysInMonth(month))}`, 3), '09:00'),
    sessions: any[] = [];
  if (spec.actual) {
    // Người chấm công lệch lịch khai: lượt bấm sinh ngẫu nhiên từ một ngày trong tháng đến "hôm nay"
    const sessionsFrom = rng.pick([`${month}-01`, `${month}-${pad(rng.int(2, 15))}`]);
    const today = rng.pick([
      `${month}-${pad(rng.int(8, daysInMonth(month)))}`,
      addDays(`${month}-${pad(daysInMonth(month))}`, 3)
    ]);
    asOf = isoAt(today, rng.pick(['08:30', '12:00', '18:00', '23:30']));
    sessions = buildSessions(rng, spec, staff, days, holidays, sessionsFrom, today);
  } else {
    // Người bấm đúng như lịch đã khai
    sessions = declaredPunches(staff, days);
  }

  const tags = [focusName, spec.type];
  const has = (fn?) => Object.values<any>(days).some(fn);
  if (has(d => d.kind === 'work' && d.in && shiftOf(d.in, d.out) === 'night')) tags.push('night-day');
  if (has(d => d.extraKind === 'ot')) tags.push('ot-day');
  if (has(d => d.extraKind === 'makeup')) tags.push('makeup-hours-day');
  if (has(d => d.kind === 'makeup')) tags.push('makeup-day');
  if (holidays.some(h => days[h] && days[h].kind === 'work')) tags.push('holiday-work-day');
  if (holidays.length) tags.push('holidays');
  for (const kind of ['leave', 'unpaid', 'willmakeup', 'approved', 'isat', 'noshow'])
    if (has(d => d.kind === kind)) tags.push(kind + '-day');
  if (Object.keys(approvals).length) tags.push('approvals');
  if (kpi && kpi.method === 'five') tags.push('kpi-five');
  else if (kpi && typeof kpi === 'object') tags.push('kpi-legacy');
  if (spec.actual) tags.push('actual-hours');
  if (sessions.length) tags.push('sessions');
  if (upTo) tags.push('upto');

  return {
    id: `s${seed}-${String(index).padStart(5, '0')}`,
    tags: [...new Set<any>(tags)],
    input: JSON.parse(
      JSON.stringify({
        staff,
        days,
        approvals,
        sessions,
        kpi,
        holidays,
        month,
        upTo,
        asOf
      })
    )
  };
}

function generateCases(seed?, count?, start = 0) {
  return Array.from({ length: count }, (_, i) => generateCase(seed, start + i));
}

/* ---------- ca có tên: số tiền đã biết, người bịa ---------- */
const NV1 = { username: 'qa_known_nv1', type: 'nv', level: 1, nightPct: 40, startDate: '2026-01-05' };
const oneWorkDay = { '2026-10-06': { kind: 'work', in: '08:00', out: '17:00' } };
// Người chỉ có lịch đúng các thứ của những ngày đã khai, vào làm từ ngày khai đầu tiên và chấm tới hết ngày khai cuối:
// mọi ngày trong lịch đều có lượt Check-in/out, không có ngày vắng nào ngoài các ngày kind 'unpaid' đã khai.
// Đặt lịch, ngày vào làm, lượt bấm và giờ tính của một ca theo đúng các ngày đã khai trong input.days (sửa tại chỗ)
function attendDeclaredDays(input?) {
  const dates = Object.keys(input.days).sort();
  input.staff = {
    ...input.staff,
    sched: [...new Set<any>(dates.map(d => new Date(`${d}T00:00:00Z`).getUTCDay()))].sort(),
    startDate: dates[0]
  };
  input.sessions = declaredPunches(input.staff, input.days);
  input.asOf = `${dates[dates.length - 1]}T23:00:00+07:00`;
  return input;
}
const knownInput = (kpi?, { staff = NV1, ...over }: any = {}) =>
  attendDeclaredDays({
    staff,
    days: oneWorkDay,
    approvals: {},
    kpi,
    holidays: [],
    month: '2026-10',
    upTo: null,
    ...over
  });
const five = (wework?, user?, peer?, manager?, self?) => ({
  method: 'five',
  parts: { wework, user, peer, manager, self },
  pct: null,
  amt: null,
  admPct: null,
  admAmt: null
});
// Giờ vượt ngưỡng = 2 ngày nghỉ không lương × 8 + giờ thiếu chưa bù. Ngày A đi làm 15 phút (thiếu 7,75 giờ), ngày B thiếu 0 hoặc 0,5 giờ.
const t65Days = (lastOut?) => ({
  '2026-10-01': { kind: 'unpaid' },
  '2026-10-02': { kind: 'unpaid' },
  '2026-10-05': { kind: 'work', in: '08:00', out: '08:15' },
  '2026-10-06': { kind: 'work', in: '08:00', out: lastOut }
});
const t65Kpi: Record<string, any> = { pct: 100, amt: 6000000, admPct: null, admAmt: null };
// Cả tháng 10/2026: mọi ngày thứ Hai–Bảy đi làm đúng ca 08–17, không có ngày vắng nào
const octoberWorkDays = () => {
  const days: Record<string, any> = {};
  for (let d = 1; d <= 31; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 0) days[date] = { kind: 'work', in: '08:00', out: '17:00' };
  }
  return days;
};
const SHORT_NV2 = {
  username: 'qa_known_short2',
  type: 'nv',
  level: 2,
  nightPct: 40,
  contract: 'short',
  insured: true,
  advanceOn: false
};
const NV4 = { username: 'qa_known_nv4', type: 'nv', level: 4, nightPct: 40 };
const KNOWN = [
  [
    'known-short-nv2-full-month',
    'NV bậc 2, hợp đồng ngắn, không tạm ứng, đi làm đủ cả tháng 10, không KPI',
    knownInput(null, { staff: SHORT_NV2, days: octoberWorkDays() })
  ],
  [
    'known-nv4-short-4h',
    'NV bậc 4, một ngày đi làm 08:00–12:00 (thiếu 4 giờ so với ca 08–17)',
    knownInput(null, { staff: NV4, days: { '2026-10-06': { kind: 'work', in: '08:00', out: '12:00' } } })
  ],
  [
    'known-kpi-five-100-90-80-85-100',
    'NV level 1, KPI 6.000.000, 100/90/80/85/100 = 92,2% → 5.532.000',
    knownInput(five(100, 90, 80, 85, 100))
  ],
  ['known-kpi-five-80-70-70-70-70', 'tổng 74% dưới mốc 75% → 0', knownInput(five(80, 70, 70, 70, 70))],
  [
    'known-kpi-five-wework-74',
    'Base Wework 74 dưới 75 → 0 dù bốn thành phần kia 100',
    knownInput(five(74, 100, 100, 100, 100))
  ],
  ['known-kpi-five-75x5', 'đúng mốc 75 là đạt → 4.500.000', knownInput(five(75, 75, 75, 75, 75))],
  [
    'known-t65-over-limit-23.75h',
    'T6-5: 23,75 giờ vượt ngưỡng, KPI không nhân tỷ lệ',
    knownInput(t65Kpi, { days: t65Days('17:00') })
  ],
  [
    'known-t65-over-limit-24.25h',
    'T6-5: 24,25 giờ vượt ngưỡng, KPI nhân 2/26',
    knownInput(t65Kpi, { days: t65Days('16:30') })
  ]
].map(([id, note, input]: any) => ({ id, tags: ['known'], note, input: JSON.parse(JSON.stringify(input)) }));

module.exports = {
  GENERATOR_VERSION,
  FOCUS_NAMES: FOCUS.map(f => f[0]),
  KNOWN_CASES: KNOWN,
  attendDeclaredDays,
  generateCase,
  generateCases,
  makeRng,
  mulberry32
};
