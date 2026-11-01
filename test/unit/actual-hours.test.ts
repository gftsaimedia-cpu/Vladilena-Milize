'use strict';
// Giờ công tính từ Check-in/out thực tế: module dùng chung src/engine/actual-hours.ts.
//
// Các quy tắc được kiểm:
//   - Trễ / sớm đến 15 phút không trừ; quá 15 phút làm tròn nửa lên theo bậc 30 phút: 14 → 0, 15 → 0, 16 → 30, 20 → 30,
//     33 → 30, 44 → 30, 45 → 60. Về sớm áp dụng cùng quy tắc.
//   - 1 công là 8 giờ; có mặt quá ca mà không có đề xuất đã duyệt vẫn chỉ trả 8 giờ.
//   - Giờ nghỉ 1 tiếng trong ca 9 tiếng không bao giờ bị tính là trễ, sớm hay khoảng trống.
//   - Công tắc tắt (from trống) thì mọi số cũ giữ nguyên.
// Trường hợp chưa có quy tắc là test.todo. Vì vậy các test dùng ca chỉ trễ HOẶC chỉ sớm (chưa định cách ghép trễ + sớm),
// lượt đã được Admin xác nhận (attendanceApproved) và số phút nguyên (chưa định cách làm tròn giây).
// workOffsets, shiftDay, lateMinutes không được test trực tiếp;
// mặt nạ phút làm việc được kiểm gián tiếp qua apply (xem "đối chiếu từng phút").
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/engine/punch');
const { loadPayroll } = require('../helpers/payroll-vm');

const loadModule = () => require('../../src/engine/actual-hours');

// ---------- công thức tiền (chỉ để đổi phút trừ sang đồng) ----------
const {
  api: { breakSlots, calcDay, calcMonth, workedHours }
} = loadPayroll({ exports: ['breakSlots', 'calcDay', 'calcMonth', 'workedHours'], timeout: 1000 });

const DAILY = 6000000 / 26; // NV L1: 230.769,23 ₫
const HOURLY = DAILY / 8; // 28.846,15 ₫
const dayVnd = (cutMinutes?) => Math.round(DAILY - (cutMinutes / 60) * HOURLY);

// ---------- dữ liệu thử: người giả qa_nv, tháng 10/2026 ----------
const SHIFTS = {
  n1: ['08:00', '17:00'],
  n2: ['10:00', '19:00'],
  f1: ['06:00', '15:00'],
  f2: ['13:00', '22:00'],
  g1: ['21:00', '06:00'],
  g2: ['22:00', '07:00']
};
const minOfDay = (hm?) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const STAFF = { username: 'qa_nv', type: 'nv', level: 1, shiftCode: 'n1' };
const punchStaff = (code?) => ({ shiftCode: code, sched: [1, 2, 3, 4, 5, 6] });
const ASOF = '2026-10-20T12:00:00+07:00'; // sau mọi ngày trong test
// Giờ VN "HH:MM" của ngày date (plus = số ngày cộng thêm cho phần sau 0 giờ) → ISO có múi giờ
const vn = (date?, hm?, plus = 0) => {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + plus * 86400000).toISOString().slice(0, 10);
  return `${d}T${hm}:00+07:00`;
};
// Phút (kể từ 0 giờ ngày date, giờ VN) → ISO
const atMin = (date?, min?) => new Date(Date.parse(date + 'T00:00:00+07:00') + min * 60000).toISOString();

let nextId = 1;
// Lượt đã đóng, dựng bằng chính PunchRules.buildDay như máy chủ; lượt trễ / sớm được Admin xác nhận (approveIncomplete)
async function closedSession(code?, date?, presIn?, presOut?) {
  const planned = P.planShift(await punchStaff(code), date);
  const built = P.buildDay(await punchStaff(code), presIn, presOut, 'admin', {
    plannedShift: planned,
    approveIncomplete: true
  });
  const id = nextId++;
  return {
    id,
    sessionId: id,
    username: STAFF.username,
    date: built.date,
    state: 'closed',
    entry: built.entry,
    version: 1
  };
}
async function openSession(code?, date?, presIn?) {
  const planned = P.planShift(await punchStaff(code), date);
  const built = P.openDay(await punchStaff(code), presIn, planned);
  const id = nextId++;
  return {
    id,
    sessionId: id,
    username: STAFF.username,
    date: built.date,
    state: 'open',
    entry: built.entry,
    version: 1
  };
}
const declaredWork = (code?, extra: any = {}) => ({
  kind: 'work',
  in: SHIFTS[code][0],
  out: SHIFTS[code][1],
  extraKind: '',
  extraIn: '',
  extraOut: '',
  preset: code,
  breakMin: 0,
  ...extra
});
const ctxOf = (over: any = {}) => ({ asOf: ASOF, staff: STAFF, holidays: [], ...over });
const cutSum = (d?) => (d.cutStartMin || 0) + (d.cutEndMin || 0);
const hasPostExtra = (d?) => !!(d.extraKind && d.extraOut && d.extraOut !== d.out);

// Một ngày đi làm có đúng một lượt (presIn, presOut là ISO). Trả { res, day }.
async function runDay({ code = 'n1', date = '2026-10-05', presIn, presOut, extra = {}, more = [], ctx = {} }: any) {
  const days = { [date]: declaredWork(code, extra) };
  const sessions = [await closedSession(code, date, presIn, presOut), ...more];
  const res = loadModule().apply(days, sessions, ctxOf(ctx));
  return { res, day: res.days[date] };
}
const n1 = (inHm?, outHm?) => ({ presIn: vn('2026-10-05', inHm), presOut: vn('2026-10-05', outHm) });

function deepFreeze(o?) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}
function lcg(seed?) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ======================================================================
// 1. cutMin: quy tắc trễ / sớm
// ======================================================================
test('cutMin: RULE khai đúng ba hằng số của quyết định 14/10', () => {
  assert.deepEqual({ ...loadModule().RULE }, { SHIFT_WORK_MIN: 480, GRACE_MIN: 15, STEP_MIN: 30 });
});

for (const [late, cut] of [
  [14, 0],
  [20, 30],
  [33, 30],
  [45, 60]
]) {
  test(`cutMin: ví dụ của chủ dự án (14/10/2026), trễ ${late} phút trừ ${cut} phút`, () => {
    assert.equal(loadModule().cutMin(late), cut);
  });
}

test('cutMin: đến 15 phút không trừ (0 – 15)', () => {
  const { cutMin } = loadModule();
  for (let m = 0; m <= 15; m++) assert.equal(cutMin(m), 0, `${m} phút`);
});

test('cutMin: quá 15 phút làm tròn nửa lên theo bậc 30 phút (16 – 44 → 30, 45 – 74 → 60)', () => {
  const { cutMin } = loadModule();
  for (const m of [16, 20, 29, 30, 31, 33, 44]) assert.equal(cutMin(m), 30, `${m} phút`);
  for (const m of [45, 46, 59, 60, 61, 74]) assert.equal(cutMin(m), 60, `${m} phút`);
});

test('cutMin: nguyên, bội của 30, không giảm khi số phút tăng (0 – 74)', () => {
  const { cutMin } = loadModule();
  let prev = 0;
  for (let m = 0; m <= 74; m++) {
    const c = cutMin(m);
    assert.ok(Number.isInteger(c) && c % 30 === 0, `${m} phút → ${c}`);
    assert.ok(c >= prev, `${m} phút → ${c} nhỏ hơn bậc trước ${prev}`);
    prev = c;
  }
});

test('cutMin: đổi sang tiền ngày NV L1 khớp bảng mục 3.4 (230.769 / 216.346 / 201.923)', () => {
  // Tay: 33 phút → bậc 30 phút = 0,5 giờ × 28.846,15 = 14.423,08; ngày 230.769,23 − 14.423,08 = 216.346,15 → 216.346.
  // 45 phút → 60 phút = 28.846,15; ngày 201.923,08 → 201.923.
  const { cutMin } = loadModule();
  assert.equal(dayVnd(cutMin(14)), 230769);
  assert.equal(dayVnd(cutMin(20)), 216346);
  assert.equal(dayVnd(cutMin(33)), 216346);
  assert.equal(dayVnd(cutMin(45)), 201923);
  assert.equal(Math.round((cutMin(33) / 60) * HOURLY), 14423);
  assert.equal(Math.round((cutMin(45) / 60) * HOURLY), 28846);
});

test.todo('Q13: cutMin(75) = 90 và cutMin(105) = 120 (suy ra, chờ chủ dự án xác nhận bậc nội suy)');
test.todo('Q13: trần 480 phút: cutMin(470) = cutMin(500) = 480');

// ======================================================================
// 2. apply: lớp "ngày hiệu lực"
// ======================================================================
test('apply: trả { days, report, missing } và không sửa đầu vào', async () => {
  const date = '2026-10-05';
  const days = deepFreeze({ [date]: declaredWork('n1') });
  const sessions = deepFreeze([await closedSession('n1', date, vn(date, '08:20'), vn(date, '17:00'))]);
  const ctx = deepFreeze(ctxOf());
  const before = JSON.stringify({ days, sessions, ctx });
  const res = loadModule().apply(days, sessions, ctx);
  assert.equal(typeof res.days, 'object');
  assert.equal(typeof res.report, 'object');
  assert.ok(Array.isArray(res.missing));
  assert.equal(JSON.stringify({ days, sessions, ctx }), before, 'đầu vào bị sửa');
  assert.notEqual(res.days[date], days[date], 'phải trả bản sao, không trả lại chính đối tượng cũ');
});

test('apply: ngày đi làm đúng giờ: ca đã gán, không cắt, không mang src / attendanceConfirmed / presIn / presOut', async () => {
  const { day } = await runDay({ ...n1('07:50', '17:40') });
  assert.equal(day.kind, 'work');
  assert.equal(day.in, '08:00');
  assert.equal(day.out, '17:00');
  assert.equal(day.preset, 'n1');
  assert.equal(cutSum(day), 0);
  assert.equal(day.breakMin || 0, 0);
  for (const key of ['src', 'attendanceConfirmed', 'attendanceApproved', 'presIn', 'presOut'])
    assert.equal(day[key], undefined, `ngày hiệu lực không được mang ${key}`);
});

test('apply: giờ nhân sự gõ trong lịch không còn quyết định tiền (quyết định 1)', async () => {
  // Khai 09:30–16:00, ra ngoài 120 phút; nhưng Check-in thật là cả ca 08:00–17:00 → ngày đủ 8 giờ.
  const { day } = await runDay({
    ...n1('08:00', '17:00'),
    extra: { in: '09:30', out: '16:00', breakMin: 120 }
  });
  assert.equal(day.kind, 'work');
  assert.equal(day.in, '08:00');
  assert.equal(day.out, '17:00');
  assert.equal(cutSum(day), 0);
  assert.equal(day.breakMin || 0, 0);
});

test('apply: có mặt quá ca mà không có đề xuất đã duyệt vẫn chỉ trả 8 giờ (quyết định 3)', async () => {
  const { day } = await runDay({ ...n1('07:00', '19:00') });
  assert.equal(cutSum(day), 0);
  assert.equal(day.breakMin || 0, 0);
  assert.equal(day.in, '08:00');
  assert.equal(day.out, '17:00');
  assert.ok(!day.extraKind && !day.extraOut, 'không có khoản làm thêm nào được tự sinh ra');
});

// Mỗi dòng: [giờ vào, giờ ra, phút trừ]. Ca n1 08:00–17:00. Trễ 20 = vào 08:20; sớm 20 = ra 16:40.
const LATE_ROWS = [
  ['08:00', 0],
  ['08:01', 0],
  ['08:14', 0],
  ['08:15', 0],
  ['08:16', 30],
  ['08:20', 30],
  ['08:29', 30],
  ['08:30', 30],
  ['08:33', 30],
  ['08:44', 30],
  ['08:45', 60],
  ['08:59', 60],
  ['09:00', 60],
  ['09:14', 60]
];
for (const [hm, cut] of LATE_ROWS) {
  test(`apply: vào ${hm} (trễ ${minOfDay(hm) - 480} phút) trừ ${cut} phút`, async () => {
    const { day } = await runDay({ ...n1(hm, '17:00') });
    assert.equal(day.kind, 'work');
    assert.equal(cutSum(day), cut);
    assert.equal(day.breakMin || 0, 0);
  });
}
for (const [hm, cut] of LATE_ROWS) {
  const early = 1020 - (minOfDay(hm) - 480); // phút thiếu ở cuối bằng đúng số phút trễ của dòng
  const out = `${String(Math.floor(early / 60)).padStart(2, '0')}:${String(early % 60).padStart(2, '0')}`;
  test(`apply: ra ${out} (sớm ${minOfDay(hm) - 480} phút) trừ ${cut} phút, cùng quy tắc với đi trễ`, async () => {
    const { day } = await runDay({ ...n1('08:00', out) });
    assert.equal(day.kind, 'work');
    assert.equal(cutSum(day), cut);
    assert.equal(day.breakMin || 0, 0);
  });
}

test('apply: bốn ví dụ của chủ dự án đi qua toàn bộ đường tính (trễ 20 → 30, 33 → 30, 45 → 60, 14 → 0)', async () => {
  const cuts: any[] = [];
  for (const m of [20, 33, 45, 14]) {
    const hm = `08:${String(m).padStart(2, '0')}`;
    cuts.push(cutSum((await runDay({ ...n1(hm, '17:00') })).day));
  }
  assert.deepEqual(cuts, [30, 30, 60, 0]);
});

// Giờ nghỉ 12:00–13:00 của ca n1 không bao giờ là trễ / sớm.
for (const [hm, cut, why] of [
  ['12:00', 240, 'vào đúng đầu giờ nghỉ: đã thiếu trọn 4 giờ buổi sáng'],
  ['12:30', 240, 'vào giữa giờ nghỉ: mất đúng 4 giờ, không phải 4,5 giờ'],
  ['13:00', 240, 'vào đúng hết giờ nghỉ'],
  ['13:20', 270, 'vào 13:20: thiếu 240 + 20 = 260 phút làm việc, bậc 30 phút → 270']
]) {
  test(`apply: giờ nghỉ không tính là trễ: vào ${hm} trừ ${cut} phút (${why})`, async () => {
    const { day } = await runDay({ ...n1(hm, '17:00') });
    assert.equal(day.kind, 'work');
    assert.equal(cutSum(day), cut);
  });
}
for (const [hm, cut, why] of [
  ['12:00', 240, 'ra đúng đầu giờ nghỉ'],
  ['12:30', 240, 'ra giữa giờ nghỉ: mất đúng 4 giờ buổi chiều'],
  ['13:00', 240, 'ra đúng hết giờ nghỉ']
]) {
  test(`apply: giờ nghỉ không tính là sớm: ra ${hm} trừ ${cut} phút (${why})`, async () => {
    const { day } = await runDay({ ...n1('08:00', hm) });
    assert.equal(day.kind, 'work');
    assert.equal(cutSum(day), cut);
  });
}

test('apply: tiền ngày NV L1 theo phút trừ khớp bảng mục 3.5 (4 giờ = 115.385; vào 13:20 = 100.962)', async () => {
  // Tay: ra 12:30 → trừ 240 phút = 4 giờ × 28.846,15 = 115.384,62; ngày 230.769,23 − 115.384,62 = 115.384,62 → 115.385.
  // Vào 13:20 → trừ 270 phút = 4,5 giờ = 129.807,69; ngày 100.961,54 → 100.962.
  assert.equal(dayVnd(cutSum((await runDay({ ...n1('08:00', '12:30') })).day)), 115385);
  assert.equal(dayVnd(cutSum((await runDay({ ...n1('12:30', '17:00') })).day)), 115385);
  assert.equal(dayVnd(cutSum((await runDay({ ...n1('13:20', '17:00') })).day)), 100962);
  assert.equal(dayVnd(cutSum((await runDay({ ...n1('08:20', '17:00') })).day)), 216346);
});

test('apply: hai lượt cùng ca 08:00–12:00 và 13:00–17:00 liền nhau qua giờ nghỉ: không trừ, không có khoảng trống', async () => {
  const date = '2026-10-05';
  const second = await closedSession('n1', date, vn(date, '13:00'), vn(date, '17:00'));
  const { day } = await runDay({ ...n1('08:00', '12:00'), more: [second] });
  assert.equal(day.kind, 'work');
  assert.equal(cutSum(day), 0);
  assert.equal(day.breakMin || 0, 0);
});

// ---------- ca đêm ----------
const g2 = (inHm?, inPlus?, outHm?, outPlus?) => ({
  code: 'g2',
  date: '2026-10-07',
  presIn: vn('2026-10-07', inHm, inPlus),
  presOut: vn('2026-10-07', outHm, outPlus)
});
test('apply: ca đêm g2 22:00–07:00: vào 22:20 trừ 30; ra 06:40 trừ 30; cả hai đều giữ ngày bắt đầu ca', async () => {
  const late = await runDay(g2('22:20', 0, '07:00', 1));
  assert.equal(cutSum(late.day), 30);
  const early = await runDay(g2('22:00', 0, '06:40', 1));
  assert.equal(cutSum(early.day), 30);
  assert.equal(late.day.preset, 'g2');
  assert.equal(late.day.in, '22:00');
  assert.equal(late.day.out, '07:00');
});
test('apply: ca đêm g2: vào 03:30 sáng hôm sau thiếu 240 + 30 = 270 phút làm việc, và mất tiền nghỉ đêm (breakPayOff)', async () => {
  const { day } = await runDay(g2('03:30', 1, '07:00', 1));
  assert.equal(day.kind, 'work');
  assert.equal(cutSum(day), 270);
  assert.equal(day.breakPayOff, true);
});
test('apply: ca đêm g2: vào 02:30 (giữa giờ nghỉ 02:00–03:00) thiếu đúng 240 phút và mất tiền nghỉ đêm', async () => {
  const { day } = await runDay(g2('02:30', 1, '07:00', 1));
  assert.equal(cutSum(day), 240);
  assert.equal(day.breakPayOff, true);
});
test('apply: ca đêm g2: có mặt trọn giờ nghỉ (đủ ca, hoặc vào trễ 22:20) thì không mất tiền nghỉ đêm', async () => {
  assert.ok(!(await runDay(g2('21:50', 0, '07:10', 1))).day.breakPayOff);
  assert.ok(!(await runDay(g2('22:20', 0, '07:00', 1))).day.breakPayOff);
});
test('apply: ca bắt đầu 30/09 22:00 thuộc ngày 30/09, không tràn sang tháng sau', async () => {
  const date = '2026-09-30';
  const days = { [date]: declaredWork('g2') };
  const sessions = [await closedSession('g2', date, vn(date, '22:20'), vn(date, '07:00', 1))];
  const res = loadModule().apply(days, sessions, ctxOf());
  assert.deepEqual(Object.keys(res.days), [date]);
  assert.equal(res.days[date].kind, 'work');
  assert.equal(cutSum(res.days[date]), 30);
});

// ---------- OT / làm bù chỉ trả phần trùng với mặt thật ----------
const ot19 = { extraKind: 'ot', extraOut: '19:00' };
test('apply: OT 17:00–19:00 đã khai, ra 19:00 → giữ nguyên đến 19:00', async () => {
  const { day } = await runDay({ ...n1('08:00', '19:00'), extra: ot19 });
  assert.equal(day.extraKind, 'ot');
  assert.equal(day.extraOut, '19:00');
  assert.equal(cutSum(day), 0);
});
test('apply: OT 17:00–19:00 đã khai, ra 18:30 → chỉ còn đến 18:30 (1,5 giờ)', async () => {
  const { day } = await runDay({ ...n1('08:00', '18:30'), extra: ot19 });
  assert.equal(day.extraKind, 'ot');
  assert.equal(day.extraOut, '18:30');
});
test('apply: OT 17:00–19:00 đã khai, ở lại đến 19:30 → không trả quá giờ đã khai (19:00)', async () => {
  const { day } = await runDay({ ...n1('08:00', '19:30'), extra: ot19 });
  assert.equal(day.extraOut, '19:00');
});
test('apply: OT đã khai nhưng ra sớm 16:50 (sớm 10 phút, không trừ) → không còn OT sau ca', async () => {
  const { day } = await runDay({ ...n1('08:00', '16:50'), extra: ot19 });
  assert.equal(day.kind, 'work');
  assert.equal(cutSum(day), 0);
  assert.equal(hasPostExtra(day), false);
});
test('apply: OT đã khai nhưng hai lượt cách nhau tại giờ ra (ra 17:00, vào lại 17:10) → OT bằng 0', async () => {
  const date = '2026-10-05';
  const again = await closedSession('n1', date, vn(date, '17:10'), vn(date, '19:00'));
  const { day } = await runDay({ ...n1('08:00', '17:00'), extra: ot19, more: [again] });
  assert.equal(hasPostExtra(day), false);
});

// ---------- trạng thái chưa tính ----------
test('apply: lượt đang mở (đang trong ca) → ngày chờ, 0 đồng, không phạt', async () => {
  const date = '2026-10-14';
  const days = { [date]: declaredWork('n1') };
  const sessions = [await openSession('n1', date, vn(date, '08:05'))];
  const res = loadModule().apply(days, sessions, ctxOf({ asOf: '2026-10-14T10:00:00+07:00' }));
  assert.equal(res.days[date].kind, 'pending');
});
test('apply: ngày đi làm khai cho tương lai, chưa có Check-in → chờ, không đóng góp tiền', () => {
  const date = '2026-10-20';
  const days = { [date]: declaredWork('n1') };
  const res = loadModule().apply(days, [], ctxOf({ asOf: '2026-10-14T10:00:00+07:00' }));
  assert.equal(res.days[date].kind, 'pending');
});
test('apply: ngày nghỉ khai trong lịch, không có Check-in nào → giữ nguyên (nghỉ phép, không lương, iSAT, nghỉ lễ)', () => {
  const days = {
    '2026-10-05': { kind: 'leave' },
    '2026-10-06': { kind: 'unpaid' },
    '2026-10-10': { kind: 'isat' },
    '2026-10-12': { kind: 'holiday' }
  };
  const copy = JSON.parse(JSON.stringify(days));
  const res = loadModule().apply(days, [], ctxOf());
  assert.deepEqual(res.days, copy);
});

// ---------- chấm công ngoài lịch: không có đề xuất được duyệt thì không tính tiền ----------
// POLICY.offSchedule = 'unpaid'. Ngoài lịch: Chủ nhật với mọi người, Thứ 7 với TTS, ngày lễ. NV L1: lương giờ 28.846,15 ₫.
const AV = require('../../src/engine/approval-view');
const SUNDAY = '2026-10-11';
const SATURDAY = '2026-10-10';
const TTS = { username: 'qa_tts', type: 'tts', level: 1, shiftCode: 'n1' };
const approvedRow = (day?) => ({ status: 'approved', fingerprint: AV.fingerprint(day) });
const wholeDay = async (date?) => [await closedSession('n1', date, vn(date, '08:00'), vn(date, '17:00'))];

test('ngoài lịch: TTS chấm công đủ ngày Thứ 7, không có đề xuất → 0 giờ, 0 đồng, không là lỗi', async () => {
  const res = loadModule().apply({}, await wholeDay(SATURDAY), ctxOf({ staff: TTS }));
  assert.deepEqual(res.days, {});
  assert.equal(res.report[SATURDAY].state, 'off-schedule');
  assert.match(res.report[SATURDAY].note, /không tính tiền/);
  assert.deepEqual(res.missing, [], 'không đưa vào "Chờ Admin xử lý"');
  assert.deepEqual(res.absent, []);
  assert.equal(calcMonth(TTS, res.days, null, [], '2026-10', null).total, 0);
});

test('ngày loại cũ makeup (TTS Thứ 7) có chấm công: giữ loại đã khai, báo declared-wins, 0 giờ, 0 đồng', async () => {
  const declared = { [SATURDAY]: { kind: 'makeup', in: '08:00', out: '17:00' } };
  const res = loadModule().apply(AV.payView(declared, {}).payDays, await wholeDay(SATURDAY), ctxOf({ staff: TTS }));
  assert.equal(res.days[SATURDAY].kind, 'makeup');
  assert.equal(res.report[SATURDAY].state, 'declared-wins');
  const m = calcMonth(TTS, res.days, null, [], '2026-10', null);
  assert.equal(m.total, 0);
  assert.equal(m.makeupHours, 0);
});

test('ngoài lịch: ai chấm công Chủ nhật mà không có đề xuất → 0 giờ, 0 đồng, không tạo công bù', async () => {
  const res = loadModule().apply({}, await wholeDay(SUNDAY), ctxOf());
  assert.deepEqual(res.days, {});
  assert.equal(res.report[SUNDAY].state, 'off-schedule');
  assert.equal(res.report[SUNDAY].paid, false);
  const m = calcMonth(STAFF, res.days, null, [], '2026-10', null);
  assert.equal(m.total, 0);
  assert.equal(m.makeupHours, 0);
  assert.equal(m.debt, 0);
});

test('ngoài lịch: khai đi làm Chủ nhật không kèm khoản được duyệt → bỏ ngày, 0 đồng', async () => {
  const res = loadModule().apply({ [SUNDAY]: declaredWork('n1') }, await wholeDay(SUNDAY), ctxOf());
  assert.equal(res.days[SUNDAY], undefined);
  assert.equal(res.report[SUNDAY].state, 'off-schedule');
});

test('ngoài lịch: Chủ nhật có OT 17:00–19:00 đã duyệt, có mặt 08:00–18:30 → chỉ trả 1,5 giờ OT = 86.538 ₫', async () => {
  // Tay: 1,5 giờ × 28.846,15 × 2 = 86.538,46. Ca chính 8 giờ không trả (ngoài lịch), nên cả ngày chỉ có tiền OT.
  const declared = { [SUNDAY]: declaredWork('n1', ot19) };
  const pay = AV.payView(declared, { [SUNDAY]: approvedRow(declared[SUNDAY]) }).payDays;
  const sessions = [await closedSession('n1', SUNDAY, vn(SUNDAY, '08:00'), vn(SUNDAY, '18:30'))];
  const day = loadModule().apply(pay, sessions, ctxOf()).days[SUNDAY];
  assert.equal(day.extraKind, 'ot');
  assert.equal(day.extraOut, '18:30');
  const c = calcDay(STAFF, day, false, null, { date: SUNDAY, holidays: [] });
  assert.equal(c.hours, 0, 'giờ ca chính không tính');
  assert.equal(c.otH, 1.5);
  assert.equal(Math.round(c.otPay), 86538);
  assert.equal(Math.round(c.total), 86538);
});

test('ngoài lịch: Chủ nhật có OT đã duyệt nhưng có mặt kéo dài hơn khai → không trả quá giờ đã khai (2 giờ = 115.385 ₫)', async () => {
  const declared = { [SUNDAY]: declaredWork('n1', ot19) };
  const pay = AV.payView(declared, { [SUNDAY]: approvedRow(declared[SUNDAY]) }).payDays;
  const sessions = [await closedSession('n1', SUNDAY, vn(SUNDAY, '07:00'), vn(SUNDAY, '20:00'))];
  const day = loadModule().apply(pay, sessions, ctxOf()).days[SUNDAY];
  const c = calcDay(STAFF, day, false, null, { date: SUNDAY, holidays: [] });
  assert.equal(c.otH, 2);
  assert.equal(Math.round(c.total), 115385);
});

test('ngoài lịch: Chủ nhật có OT đã duyệt nhưng không có chấm công → 0 giờ, 0 đồng', () => {
  const declared = { [SUNDAY]: declaredWork('n1', ot19) };
  const pay = AV.payView(declared, { [SUNDAY]: approvedRow(declared[SUNDAY]) }).payDays;
  const res = loadModule().apply(pay, [], ctxOf());
  assert.equal(res.days[SUNDAY], undefined);
  assert.deepEqual(res.absent, [], 'ngoài lịch không phải ngày vắng');
});

test('ngoài lịch: Chủ nhật có OT đang chờ duyệt hoặc bị từ chối → như không có đề xuất: 0 giờ, 0 đồng', async () => {
  const declared = { [SUNDAY]: declaredWork('n1', ot19) };
  for (const status of ['pending', 'rejected']) {
    const row = status === 'pending' ? {} : { [SUNDAY]: { status, fingerprint: AV.fingerprint(declared[SUNDAY]) } };
    const pay = AV.payView(declared, row).payDays;
    const res = loadModule().apply(pay, await wholeDay(SUNDAY), ctxOf());
    assert.equal(res.days[SUNDAY], undefined, status);
    assert.equal(calcMonth(STAFF, res.days, null, [], '2026-10', null).total, 0, status);
  }
});

// ---------- thiếu chấm công ----------
test('thiếu một đầu: có Check-in mà không có Check-out → chờ Admin, báo "Quên check-out", không là ngày nghỉ', async () => {
  const date = '2026-10-05';
  const forgot = await openSession('n1', date, vn(date, '08:00'));
  forgot.state = 'closed';
  forgot.entry = { ...forgot.entry, reason: 'forgot-out' };
  const res = loadModule().apply({ [date]: declaredWork('n1') }, [forgot], ctxOf());
  assert.equal(res.days[date].kind, 'pending');
  assert.equal(res.report[date].state, 'forgot-out');
  assert.equal(res.report[date].notifyAdmin, true);
  assert.deepEqual(res.missing, [date]);
  assert.deepEqual(res.absent, []);
});

test('thiếu một đầu: có Check-out mà không có Check-in → chờ Admin, báo "Quên check-in"', async () => {
  const date = '2026-10-05';
  const only = await closedSession('n1', date, vn(date, '08:00'), vn(date, '17:00'));
  delete only.entry.presIn;
  const res = loadModule().apply({ [date]: declaredWork('n1') }, [only], ctxOf());
  assert.equal(res.days[date].kind, 'pending');
  assert.equal(res.report[date].state, 'forgot-in');
  assert.equal(res.report[date].notifyAdmin, true);
  assert.deepEqual(res.missing, [date]);
});

test('không có chấm công nào ở ngày khai đi làm đã qua → tính là nghỉ không phép (noshow), vào danh sách absent', () => {
  const date = '2026-10-05';
  const res = loadModule().apply({ [date]: declaredWork('n1') }, [], ctxOf());
  assert.equal(res.days[date].kind, 'noshow');
  assert.equal(res.report[date].state, 'absent');
  assert.deepEqual(res.absent, [date]);
  assert.deepEqual(res.missing, []);
  const m = calcMonth(STAFF, res.days, null, [], '2026-10', null);
  assert.equal(m.noshow, 1);
  assert.equal(m.work, 0);
});

// ---------- đối chiếu từng phút với công thức hiện có ----------
test('mặt nạ phút làm việc trùng breakSlots của khối công thức đóng băng cho cả sáu ca (4 giờ làm + 1 giờ nghỉ, đúng 480 phút làm)', () => {
  for (const [code, [tin, tout]] of Object.entries<any>(SHIFTS)) {
    const a = minOfDay(tin);
    const brk = new Set<any>();
    for (const s of breakSlots({ in: tin, out: tout })) for (let t = s.start; t < s.end; t++) brk.add(t - a);
    const mine = new Set<any>();
    for (let o = 0; o < 540; o++) if (o % 300 >= 240) mine.add(o);
    assert.deepEqual(
      [...brk].sort((x: any, y: any) => x - y),
      [...mine].sort((x: any, y: any) => x - y),
      `${code}: giờ nghỉ lệch`
    );
    assert.equal(540 - mine.size, 480, `${code}: số phút làm việc`);
  }
});

// phút làm việc nằm trước độ lệch o (kể từ giờ bắt đầu ca): o trừ phần giờ nghỉ đã qua
const workBefore = (o?) => o - Math.min(Math.max(o - 240, 0), 60);
const cutMinLazy = (minutes?) => loadModule().cutMin(minutes);

test('đối chiếu từng phút: vào ở mọi phút 0–539 của cả sáu ca, ra đúng giờ → phút trừ = cutMin(phút làm việc đã thiếu)', async () => {
  for (const code of Object.keys(SHIFTS)) {
    const date = '2026-10-05';
    const start = minOfDay(SHIFTS[code][0]);
    for (let o = 0; o < 540; o++) {
      const missed = workBefore(o);
      if (cutMinLazy(missed) >= 480) continue; // không còn giờ tính: ngày không khớp ca, ngoài phạm vi test này
      const { day } = await runDay({
        code,
        date,
        presIn: atMin(date, start + o),
        presOut: atMin(date, start + 540)
      });
      assert.equal(day.kind, 'work', `${code} vào +${o}`);
      assert.equal(cutSum(day), cutMinLazy(missed), `${code} vào +${o} phút (thiếu ${missed})`);
    }
  }
});
test('đối chiếu từng phút: vào đúng giờ, ra ở mọi phút 1–540 của cả sáu ca → phút trừ = cutMin(phút làm việc còn thiếu)', async () => {
  for (const code of Object.keys(SHIFTS)) {
    const date = '2026-10-05';
    const start = minOfDay(SHIFTS[code][0]);
    for (let p = 1; p <= 540; p++) {
      const missed = 480 - workBefore(p);
      if (cutMinLazy(missed) >= 480) continue;
      const { day } = await runDay({ code, date, presIn: atMin(date, start), presOut: atMin(date, start + p) });
      assert.equal(day.kind, 'work', `${code} ra +${p}`);
      assert.equal(cutSum(day), cutMinLazy(missed), `${code} ra +${p} phút (thiếu ${missed})`);
    }
  }
});

// ---------- thuộc tính ngẫu nhiên ----------
test('thuộc tính (3.000 ca ngẫu nhiên): giờ tính ≤ 480, tổng trừ ≤ 480, vào trễ hơn / ra sớm hơn không bao giờ tăng giờ tính', async () => {
  const { cutMin } = loadModule();
  const rnd = lcg(20261015);
  const codes = Object.keys(SHIFTS);
  const date = '2026-10-05';
  const paid = (d?) => (d.kind === 'work' ? 480 - cutSum(d) - (d.breakMin || 0) : 0);
  let checked = 0;
  for (let i = 0; i < 3000; i++) {
    const code = codes[Math.floor(rnd() * codes.length)];
    const start = minOfDay(SHIFTS[code][0]);
    const o = Math.floor(rnd() * 560) - 20; // vào từ trước ca 20 phút đến sát hết ca
    const p = o + 1 + Math.floor(rnd() * Math.max(1, 580 - o)); // ra sau vào ít nhất 1 phút
    if (Math.min(p, 540) <= Math.max(o, 0)) continue; // không chạm ca: là "ngoài ca", chưa có quy tắc
    const run = async (a?, b?) =>
      (await runDay({ code, date, presIn: atMin(date, start + a), presOut: atMin(date, start + b) })).day;
    const base = await run(o, p);
    checked++;
    assert.ok((await paid(base)) <= 480 && cutSum(base) <= 480, `${code} +${o}…+${p}: ${JSON.stringify(base)}`);
    const delay = 1 + Math.floor(rnd() * 40);
    if (o + delay < p)
      assert.ok(
        (await paid(await run(o + delay, p))) <= (await paid(base)),
        `${code} vào +${o + delay} làm tăng giờ tính`
      );
    if (p - delay > o)
      assert.ok(
        (await paid(await run(o, p - delay))) <= (await paid(base)),
        `${code} ra +${p - delay} làm tăng giờ tính`
      );
    // Trễ + sớm cùng ngày: kết quả phải là một trong hai cách ghép (tách hoặc cộng dồn).
    const ms = workBefore(Math.min(Math.max(o, 0), 540)),
      me = 480 - workBefore(Math.min(Math.max(p, 0), 540));
    const split = cutMin(ms) + cutMin(me),
      combined = cutMin(ms + me);
    if (split < 480 && combined < 480 && base.kind === 'work' && (o > 0 || p < 540))
      assert.ok(
        [split, combined].includes(cutSum(base)),
        `${code} +${o}…+${p}: ${cutSum(base)} ∉ {${split}, ${combined}}`
      );
  }
  assert.ok(checked > 2000, `chỉ chạy ${checked} ca`);
});

// ======================================================================
// 3. Trường hợp chưa có quy tắc
// ======================================================================
test.todo(
  'Q1: trễ 20 + sớm 20 cùng ngày: tách (trừ 60 phút) hay cộng dồn (trừ 30 phút); cutStartMin / cutEndMin chia thế nào'
);
test.todo(
  'Q2: ngày khai Đi làm đã qua mà không có Check-in nào / quên Check-out (kind pending, nghỉ không lương hay giữ giờ khai)'
);
test.todo('Q3: ngày để trống nhưng có Check-in; ngày khai nghỉ (phép, không lương, iSAT...) nhưng có Check-in');
test.todo('Q4: lượt ngoài ca / chưa gán ca (off-shift, outsideShift): có tính tiền không');
test.todo('Q5: ngày trước from giữ nguyên giờ khai (phương án A) hay lùi về trước; tháng đã qua');
test.todo('Q6: Admin "Lưu và xác nhận" có còn miễn trễ không (hay thêm nút Miễn trễ)');
test.todo(
  'Q7: khoảng trống giữa hai lượt (08:00–11:00 và 14:00–17:00): gapMin = 120 trừ đúng phút, theo bậc 30 phút, hay bỏ qua'
);
test.todo('Q8: lượt pending / incomplete-shift do chính Check-in tạo ra: tính tự động hay chờ Admin xác nhận');
test.todo(
  'Q13: làm tròn giây (vào 08:14:59 → 0, 08:15:00 → 30; ra 16:45:01 → 0, 16:45:00 → 30; OT kết thúc 18:30:59 → tới 18:30)'
);
test.todo('Q1–Q9: POLICY có đủ ô và mọi ô hợp lệ (làm sau khi chủ dự án trả lời)');

// ======================================================================
// 4. Cắt OT theo khoản đã duyệt, ngày lễ cần duyệt, ngày chưa khai tính là đi làm
// ======================================================================
const dayTotal = (day?, holiday?, date?, holidays: any[] = []) =>
  calcDay(STAFF, day, holiday, null, { date, holidays });

// ---------- OT đã duyệt không vượt quá số giờ đã khai ----------
test('OT đã duyệt khai theo ca 09:00–18:00 (đến 20:00), ca gán 08:00–17:00, có mặt 08:00–20:00 → chỉ trả đúng 2 giờ đã duyệt = 115.385 ₫', async () => {
  // Tay: 2 giờ × 28.846,15 × 2 = 115.384,62; cộng lương ngày 230.769,23 → 346.153,85.
  const date = '2026-10-05';
  const declared = { [date]: declaredWork('n1', { in: '09:00', out: '18:00', extraKind: 'ot', extraOut: '20:00' }) };
  const pay = AV.payView(declared, { [date]: approvedRow(declared[date]) }).payDays;
  const sessions = [await closedSession('n1', date, vn(date, '08:00'), vn(date, '20:00'))];
  const day = loadModule().apply(pay, sessions, ctxOf()).days[date];
  const c = dayTotal(day, false, date);
  assert.equal(c.otH, 2);
  assert.equal(Math.round(c.otPay), 115385);
  assert.equal(Math.round(c.total), 346154);
});

test('OT đã duyệt trước ca: khai 06:00–07:00 (1 giờ) trước ca khai 07:00, ca gán 08:00, có mặt 06:00–17:00 → chỉ trả 1 giờ = 57.692 ₫', async () => {
  const date = '2026-10-05';
  const declared = {
    [date]: declaredWork('n1', { in: '07:00', out: '16:00', extraKind: 'ot', extraIn: '06:00', extraOut: '' })
  };
  const pay = AV.payView(declared, { [date]: approvedRow(declared[date]) }).payDays;
  const sessions = [await closedSession('n1', date, vn(date, '06:00'), vn(date, '17:00'))];
  const day = loadModule().apply(pay, sessions, ctxOf()).days[date];
  assert.equal(day.extraIn, '07:00');
  const c = dayTotal(day, false, date);
  assert.equal(c.otH, 1);
  assert.equal(Math.round(c.otPay), 57692);
});

test('OT đã duyệt: ngày khai không có đoạn sau ca thì ca gán lệch ca khai cũng không sinh OT sau ca', async () => {
  const date = '2026-10-05';
  const declared = { [date]: declaredWork('n1', { in: '09:00', out: '18:00', extraKind: 'ot', extraIn: '08:00' }) };
  const pay = AV.payView(declared, { [date]: approvedRow(declared[date]) }).payDays;
  const sessions = [await closedSession('n1', date, vn(date, '07:00'), vn(date, '20:00'))];
  const day = loadModule().apply(pay, sessions, ctxOf()).days[date];
  assert.equal(day.extraOut || '', '');
});

// ---------- workedHours kẹp số phút cắt như splitMainWork ----------
test('workedHours: phút cắt âm không cộng thêm giờ; cắt quá ca chỉ về 0, không âm', () => {
  const base = { in: '08:00', out: '17:00' };
  assert.equal(workedHours({ ...base, cutStartMin: -60 }), 8);
  assert.equal(workedHours({ ...base, cutStartMin: 600 }), 0);
  assert.equal(workedHours({ ...base, cutStartMin: 300, cutEndMin: 300 }), 0);
  assert.ok(
    Math.abs(workedHours({ ...base, cutStartMin: 200, cutEndMin: 100, breakMin: 10 }) - (480 - 310) / 60) < 1e-9
  );
});

// ---------- 1. Làm việc ngày lễ: khai đi làm ngày lễ còn trong lịch = đã duyệt (hoặc dữ liệu cũ), trả ×3 theo giờ thực ----------
const HOL = '2026-10-20'; // Thứ 3
const holPunch = async (inHm?, outHm?) => [await closedSession('n1', HOL, vn(HOL, inHm), vn(HOL, outHm))];

test('ngày lễ: khai OT ngày lễ 08:00–17:00 (còn trong lịch), có mặt đủ khung → lương lễ 230.769 + 9 giờ × 3 = 1.009.615 ₫', async () => {
  // Tay: lương ngày lễ 230.769,23 + 9 × 28.846,15 × 3 = 778.846,15 → 1.009.615,38 (OT không trừ giờ nghỉ)
  const res = loadModule().apply(
    { [HOL]: declaredWork('n1') },
    await holPunch('08:00', '17:00'),
    ctxOf({ holidays: [HOL] })
  );
  assert.notEqual(res.report[HOL].state, 'off-schedule');
  const c = dayTotal(res.days[HOL], true, HOL, [HOL]);
  assert.equal(Math.round(c.total), 1009615);
});

test('ngày lễ: khai OT ngày lễ và vào trễ 33 phút (trừ 30) → phần ×3 giảm 30 phút: 966.346 ₫', async () => {
  // Tay: 8,5 giờ × 28.846,15 × 3 = 735.576,92 + lương lễ 230.769,23 = 966.346,15
  const res = loadModule().apply(
    { [HOL]: declaredWork('n1') },
    await holPunch('08:33', '17:00'),
    ctxOf({ holidays: [HOL] })
  );
  assert.equal(res.days[HOL].cutStartMin, 30);
  const c = dayTotal(res.days[HOL], true, HOL, [HOL]);
  assert.equal(Math.round(c.total), 966346);
});

test('ngày lễ: không khai đi làm mà có chấm công → ngoài lịch, không tính tiền, chỉ còn lương ngày lễ 230.769 ₫', async () => {
  const res = loadModule().apply({}, await holPunch('08:00', '17:00'), ctxOf({ holidays: [HOL], month: '2026-10' }));
  assert.equal(res.report[HOL].state, 'off-schedule');
  assert.equal(res.days[HOL], undefined);
  const c = dayTotal(res.days[HOL] || {}, true, HOL, [HOL]);
  assert.equal(Math.round(c.total), 230769);
});

// ---------- 2. Ngày trong lịch làm việc mà không có bản ghi nào mặc định là ngày đi làm ----------
const TUE = '2026-10-06';
// người mới vào làm đúng ngày TUE nên các ngày chưa khai trước đó không tính
const monthCtx = (over: any = {}) =>
  ctxOf({ staff: { ...STAFF, startDate: TUE }, month: '2026-10', asOf: vn(TUE, '20:00'), ...over });

test('ngày chưa khai (Thứ 3) có chấm công đủ ca → tính như ngày đi làm theo giờ thực: 230.769 ₫', async () => {
  const res = loadModule().apply({}, [await closedSession('n1', TUE, vn(TUE, '08:00'), vn(TUE, '17:00'))], monthCtx());
  assert.equal(res.days[TUE].kind, 'work');
  assert.equal(res.days[TUE].preset, 'n1');
  assert.equal(Math.round(dayTotal(res.days[TUE], false, TUE).total), 230769);
});

test('ngày chưa khai (Thứ 3) có chấm công, vào trễ 33 phút → 216.346 ₫', async () => {
  const res = loadModule().apply({}, [await closedSession('n1', TUE, vn(TUE, '08:33'), vn(TUE, '17:00'))], monthCtx());
  assert.equal(Math.round(dayTotal(res.days[TUE], false, TUE).total), 216346);
});

test('ngày chưa khai đã qua, ca đã kết thúc và không có chấm công nào → nghỉ không phép (noshow), nằm trong absent', () => {
  const res = loadModule().apply({}, [], monthCtx());
  assert.equal(res.days[TUE].kind, 'noshow');
  assert.deepEqual(res.absent, [TUE]);
  assert.equal(res.report[TUE].state, 'absent');
  assert.equal(dayTotal(res.days[TUE], false, TUE).total, 0);
});

test('ngày chưa khai, thiếu một đầu chấm công → chờ Admin, báo Quên check-out, không là ngày nghỉ', async () => {
  const forgot = await openSession('n1', TUE, vn(TUE, '08:00'));
  forgot.state = 'closed';
  forgot.entry = { ...forgot.entry, reason: 'forgot-out' };
  const res = loadModule().apply({}, [forgot], monthCtx());
  assert.equal(res.days[TUE].kind, 'pending');
  assert.equal(res.report[TUE].state, 'forgot-out');
  assert.deepEqual(res.absent, []);
  assert.deepEqual(res.missing, [TUE]);
});

test('ngày chưa khai ở tương lai, hoặc hôm nay khi ca chưa kết thúc → không có gì trong kết quả', () => {
  const future = loadModule().apply({}, [], monthCtx({ asOf: vn(TUE, '10:00') }));
  assert.equal(future.days['2026-10-07'], undefined, 'ngày mai');
  assert.equal(future.days[TUE], undefined, 'hôm nay, ca 08:00–17:00 chưa kết thúc lúc 10:00');
  assert.deepEqual(future.absent, []);
});

test('ngày chưa khai: Thứ 7 của TTS không thuộc lịch → không có gì; Thứ 7 của NV thì là ngày làm việc', () => {
  const sat = '2026-10-10';
  const ctx = { month: '2026-10', asOf: vn(sat, '20:00') };
  assert.equal(loadModule().apply({}, [], ctxOf({ ...ctx, staff: { ...TTS, startDate: sat } })).days[sat], undefined);
  assert.equal(
    loadModule().apply({}, [], ctxOf({ ...ctx, staff: { ...STAFF, startDate: sat } })).days[sat].kind,
    'noshow'
  );
});

test('ngày chưa khai trước ngày bắt đầu làm việc của nhân sự → không có gì', () => {
  const res = loadModule().apply(
    {},
    [],
    monthCtx({ staff: { ...STAFF, startDate: '2026-10-08' }, asOf: vn('2026-10-09', '20:00') })
  );
  assert.equal(res.days[TUE], undefined);
  assert.equal(res.days['2026-10-07'], undefined);
  assert.equal(res.days['2026-10-08'].kind, 'noshow', 'từ ngày bắt đầu thì tính');
});

test('ngày chưa khai trùng ngày lễ → không mặc định đi làm, không vắng', () => {
  const res = loadModule().apply({}, [], monthCtx({ holidays: [TUE] }));
  assert.equal(res.days[TUE], undefined);
});

test('ngày đã có bản ghi (nghỉ phép, không lương) giữ nguyên, không bị mặc định đi làm', () => {
  const res = loadModule().apply({ [TUE]: { kind: 'leave' } }, [], monthCtx());
  assert.deepEqual(res.days[TUE], { kind: 'leave' });
});

test('bảng ca trong actual-hours.js khớp PunchRules.SHIFT', () => {
  assert.deepEqual(loadModule().SHIFT_TIMES, P.SHIFT);
});

test.todo(
  'Chấm công ngoài lịch có OT được duyệt phát ra cutStartMin = 480: trong calcMonth sẽ ghi nợ 8 giờ làm bù và chặn OT. Hiện không đến được (máy chủ chặn Chủ nhật và OT ngày lễ, calcMonth bỏ qua Chủ nhật); cần cờ riêng cho "ca chính không tính" trước khi mở'
);
