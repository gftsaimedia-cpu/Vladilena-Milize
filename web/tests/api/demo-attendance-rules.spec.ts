// Chấm công trên BE thật, chỉ gọi API (không mở giao diện): mỗi ngày đã seed (scripts/demo/people/attendance.ts) so với luật
// đã chốt (memory attendance-day-rules-confirmed, spec 2026-11-05-attendance-core-design.md mục 2), cùng các route lỗi.
// Chạy qua `npm run demo -- test attendance`. Tài liệu và danh sách lỗi: docs/demo-db/attendance.md.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN, apiAs, demoMonths, demoReadyFor } from './fixtures/demo';
import { attendancePlan, type DayCase } from '../../../scripts/demo/people/attendance';

test.skip(!demoReadyFor('attendance'), 'Chạy qua npm run demo -- test attendance');

const plan = attendancePlan(demoMonths());
const { m0, m1, today } = plan.months;
const json = { 'Content-Type': 'application/json' };
const CORE = 'phiên attendance-core đang làm (spec 2026-11-05-attendance-core-design.md)';
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Ngày đầu tiên của `who` thuộc tình huống `c` (theo kế hoạch seed). */
function plannedDay(who: string, c: DayCase): string {
  const found = plan.days.find(d => d.username === who && d.case === c);
  if (!found) throw new Error(`Kế hoạch không có ${who} / ${c}`);
  return found.date;
}

async function uuidOf(request: APIRequestContext, username: string): Promise<string> {
  const res = await request.get(`/api/v2/employees/${username}`);
  expect(res.ok(), `GET /employees/${username}`).toBeTruthy();
  return (await res.json()).employee.profile.uuid;
}

/** Dòng công của một người một ngày, Admin đọc (GET /attendance/timesheets/:uuid/:date). */
async function timesheetOf(request: APIRequestContext, username: string, date: string): Promise<any> {
  return apiAs(request, ADMIN, async () => {
    const res = await request.get(`/api/v2/attendance/timesheets/${await uuidOf(request, username)}/${date}`);
    expect(res.status(), `bảng công ${username} ${date}`).toBe(200);
    return (await res.json()).timesheet;
  });
}

/** /me/attendance của chính người đó cho tháng `month`. */
async function myMonth(request: APIRequestContext, username: string, month: string): Promise<any> {
  return apiAs(request, username, async () => {
    const res = await request.get(`/api/v2/me/attendance?month=${month}`);
    expect(res.status(), `/me/attendance ${username} ${month}`).toBe(200);
    return res.json();
  });
}
const dayIn = (m: any, date: string) => m.days.find((d: any) => d.date === date);

// ---------------------------------------------------------------- một ngày chấm công so với luật (a)

type Expect = { checkIn?: string; checkOut?: string; day?: string; late?: number; early?: number };
const RULES: Array<{ who: string; c: DayCase; title: string; expect: Expect; bug?: string }> = [
  { who: 'cc-dung-gio', c: 'on-time', title: 'vào 07:55, ra 17:05 ca 08–17 là ngày hợp lệ', expect: { checkIn: 'VALID', checkOut: 'VALID', day: 'VALID', late: 0, early: 0 } },
  { who: 'cc-tre', c: 'late-15', title: 'vào trễ đúng 15 phút không phải giải trình, không tính phút trễ', expect: { checkIn: 'VALID', day: 'VALID', late: 0 } },
  { who: 'cc-tre', c: 'late-16', title: 'vào trễ 16 phút phải giải trình, trễ 16 phút', expect: { checkIn: 'LATE', day: 'NEEDS_EXPLANATION', late: 16 } },
  { who: 'cc-tre', c: 'late-40', title: 'vào 08:40 ca 08–17: trễ 40 phút, phải giải trình', expect: { checkIn: 'LATE', checkOut: 'VALID', day: 'NEEDS_EXPLANATION', late: 40 } },
  {
    who: 'cc-tre',
    c: 'late-4h',
    title: 'vào 12:00 ca 08–17: trễ 240 phút, ra 17:00 đúng giờ',
    expect: { checkIn: 'LATE', checkOut: 'VALID', day: 'NEEDS_EXPLANATION', late: 240, early: 0 },
    bug: 'BUG-attendance-1: giờ ca bị hiểu theo UTC khi lần chấm cách giờ vào ca hơn 3,5 tiếng (vào 12:00 thành "vào sớm", ra 17:00 thành về sớm 420 phút)'
  },
  { who: 'cc-tre', c: 'early-out-1', title: 'về sớm 1 phút vẫn phải giải trình', expect: { checkIn: 'VALID', checkOut: 'EARLY', day: 'NEEDS_EXPLANATION', early: 1 } },
  { who: 'cc-tre', c: 'early-out-30', title: 'về 16:30: sớm 30 phút, phải giải trình', expect: { checkOut: 'EARLY', day: 'NEEDS_EXPLANATION', early: 30 } },
  { who: 'cc-tre', c: 'late-early', title: 'vào 08:20 ra 16:40: trễ 20 và sớm 20 cùng ngày', expect: { checkIn: 'LATE', checkOut: 'EARLY', day: 'NEEDS_EXPLANATION', late: 20, early: 20 } },
  { who: 'cc-tre', c: 'early-in-20', title: 'vào 07:40 (sớm hơn 15 phút) phải giải trình', expect: { checkIn: 'EARLY', day: 'NEEDS_EXPLANATION' } },
  {
    who: 'cc-tre',
    c: 'late-out-20',
    title: 'ra 17:20 không có OT (muộn hơn 15 phút) phải giải trình',
    expect: { day: 'NEEDS_EXPLANATION' },
    bug: `BUG-attendance-2: ra muộn 16–30 phút vẫn là hợp lệ (code dùng ngưỡng 30, luật là 15) — ${CORE}`
  },
  { who: 'cc-tre', c: 'late-out-45', title: 'ra 17:45 (muộn hơn 30 phút, quên check-out) phải giải trình', expect: { checkOut: 'LATE_WITHOUT_OT', day: 'NEEDS_EXPLANATION' } },
  { who: 'cc-thieu', c: 'missing-out', title: 'có giờ vào, thiếu giờ ra ở ngày đã qua: phải giải trình', expect: { checkIn: 'VALID', checkOut: 'MISSED', day: 'NEEDS_EXPLANATION' } },
  {
    who: 'cc-thieu',
    c: 'missing-in',
    title: 'thiếu giờ vào, ra 17:00: phải giải trình vì thiếu giờ vào, giờ ra vẫn đúng giờ',
    expect: { checkIn: 'MISSED', checkOut: 'VALID', day: 'NEEDS_EXPLANATION', early: 0 },
    bug: 'BUG-attendance-1: giờ ca bị hiểu theo UTC khi chỉ có giờ ra (ra 17:00 thành về sớm 420 phút)'
  },
  {
    who: 'cc-thieu',
    c: 'out-and-back',
    title: 'ra 10:00 rồi vào lại 10:30, ra 17:00: lần ra trong ca là về sớm, phải giải trình',
    expect: { checkOut: 'EARLY', day: 'NEEDS_EXPLANATION' },
    bug: 'BUG-attendance-3: chỉ đọc lần vào đầu và lần ra cuối, bỏ qua lần ra giữa ca (luật 04/11: ra giữa ca rồi vào lại không được phép) — spec 2 có firstOutInShift'
  },
  { who: 'cc-flex', c: 'on-time', title: 'ca Flex 13–22: vào 12:58 ra 22:00 hợp lệ', expect: { checkIn: 'VALID', checkOut: 'VALID', day: 'VALID' } },
  { who: 'cc-flex', c: 'late-40', title: 'ca Flex 13–22: vào 13:40 trễ 40 phút', expect: { checkIn: 'LATE', day: 'NEEDS_EXPLANATION', late: 40 } },
  { who: 'cc-flex', c: 'early-out-30', title: 'ca Flex 13–22: ra 21:30 sớm 30 phút', expect: { checkOut: 'EARLY', day: 'NEEDS_EXPLANATION', early: 30 } },
  { who: 'cc-dem', c: 'on-time', title: 'ca Night 22–07: vào 21:55, ra 07:00 sáng hôm sau là một ngày hợp lệ', expect: { checkIn: 'VALID', checkOut: 'VALID', day: 'VALID' } },
  { who: 'cc-dem', c: 'late-40', title: 'ca Night 22–07: vào 22:40 trễ 40 phút', expect: { checkIn: 'LATE', checkOut: 'VALID', day: 'NEEDS_EXPLANATION', late: 40 } },
  { who: 'cc-dem', c: 'early-out-30', title: 'ca Night 22–07: ra 06:30 sáng hôm sau sớm 30 phút', expect: { checkOut: 'EARLY', day: 'NEEDS_EXPLANATION', early: 30 } },
  { who: 'cc-dem', c: 'missing-out', title: 'ca Night 22–07: thiếu giờ ra phải giải trình', expect: { checkOut: 'MISSED', day: 'NEEDS_EXPLANATION' } }
];

for (const r of RULES) {
  test(`${r.who}: ${r.title}`, async ({ request }) => {
    if (r.bug) test.fail(true, r.bug);
    const date = plannedDay(r.who, r.c);
    const ts = await timesheetOf(request, r.who, date);
    const got: Expect = {};
    if (r.expect.checkIn !== undefined) got.checkIn = ts.checkInStatus;
    if (r.expect.checkOut !== undefined) got.checkOut = ts.checkOutStatus;
    if (r.expect.day !== undefined) got.day = ts.dayStatus;
    if (r.expect.late !== undefined) got.late = ts.metrics.lateMinutes;
    if (r.expect.early !== undefined) got.early = ts.metrics.earlyMinutes;
    expect(got, `${r.who} ${date}`).toEqual(r.expect);
  });
}

test('ca Night: cả hai lần chấm (21:55 và 07:00 sáng hôm sau) nằm trong ngày công bắt đầu ca', async ({ request }) => {
  const date = plannedDay('cc-dem', 'on-time');
  await apiAs(request, ADMIN, async () => {
    const uuid = await uuidOf(request, 'cc-dem');
    const res = await request.get(`/api/v2/attendance/punches?employeeId=${uuid}&workDate=${date}`);
    expect(res.status()).toBe(200);
    const { punches } = await res.json();
    expect(punches.map((p: any) => p.type)).toEqual(['IN', 'OUT']);
  });
  const me = await myMonth(request, 'cc-dem', date.slice(0, 7));
  expect(dayIn(me, date)).toMatchObject({ kind: 'work', in: '21:55', out: '07:00' });
});

test('tính lại một ngày đã có (POST /attendance/recalculate) cho cùng kết quả', async ({ request }) => {
  const date = plannedDay('cc-tre', 'late-40');
  const before = await timesheetOf(request, 'cc-tre', date);
  const after = await apiAs(request, ADMIN, async () => {
    const res = await request.post('/api/v2/attendance/recalculate', { headers: json, data: { employeeId: await uuidOf(request, 'cc-tre'), workDate: date } });
    expect(res.status()).toBe(201);
    return (await res.json()).timesheet;
  });
  for (const k of ['checkInStatus', 'checkOutStatus', 'dayStatus', 'status', 'actualCheckIn', 'actualCheckOut'] as const) expect(after[k], k).toBe(before[k]);
  expect(after.metrics).toEqual(before.metrics);
});

// ---------------------------------------------------------------- loại ngày trên app nhân viên (/me) (a)

test('nv vắng một thứ Bảy (không chấm gì) là ngày vắng', async ({ request }) => {
  const sat = plan.days.find(d => d.username === 'cc-thieu' && d.case === 'absent' && dow(d.date) === 6)!.date;
  expect(dayIn(await myMonth(request, 'cc-thieu', m1), sat).kind).toBe('absent');
});

test('nv vắng một ngày thường là ngày vắng', async ({ request }) => {
  const d = plan.days.find(x => x.username === 'cc-thieu' && x.case === 'absent' && dow(x.date) !== 6)!.date;
  expect(dayIn(await myMonth(request, 'cc-thieu', m1), d).kind).toBe('absent');
});

test('ngày lễ công ty trên ngày làm hiện là nghỉ lễ, không phải vắng', async ({ request }) => {
  test.fail(true, `BUG-attendance-5: lịch lễ công ty không vào bảng công, ngày lễ hiện "vắng" — ${CORE}`);
  const day = dayIn(await myMonth(request, 'cc-dung-gio', m1), plan.holiday.date);
  expect(day).toMatchObject({ kind: 'leave', leave: 'holiday' });
});

test('thứ Bảy của thực tập sinh (tuần thứ Hai – thứ Sáu) không phải ngày vắng', async ({ request }) => {
  test.fail(true, `BUG-attendance-7: /me coi thứ Bảy là ngày làm của mọi loại nhân sự — ${CORE}`);
  const me = await myMonth(request, 'cc-tts', m1);
  const saturdays = me.days.filter((d: any) => dow(d.date) === 6);
  expect(saturdays.length).toBeGreaterThan(0);
  expect(saturdays.filter((d: any) => d.kind === 'absent').map((d: any) => d.date)).toEqual([]);
});

test('Chủ nhật có giờ chấm không được tính là ngày công', async ({ request }) => {
  test.fail(true, `BUG-attendance-4: dòng công Chủ nhật (lịch Normal tự tạo) được đếm là ngày đi làm — ${CORE}`);
  const sunday = plannedDay('cc-chu-nhat', 'sunday-worked');
  const workdays = plan.days.filter(d => d.username === 'cc-chu-nhat' && d.case === 'on-time' && d.date.startsWith(m1)).length;
  const me = await myMonth(request, 'cc-chu-nhat', m1);
  expect(dayIn(me, sunday).kind, 'Chủ nhật không phải ngày đi làm').not.toMatch(/^(work|late)$/);
  expect(me.totals.workDays).toBe(workdays);
});

test('người vào làm giữa tháng: các ngày trước ngày vào làm không phải ngày vắng', async ({ request }) => {
  test.fail(true, `BUG-attendance-6: ngày ngoài thời gian làm (trước ngày vào làm) hiện "vắng" — ${CORE}`);
  const me = await myMonth(request, 'cc-giua-thang', m1);
  const before = me.days.filter((d: any) => d.date < plan.joinDate && dow(d.date) !== 0);
  expect(before.length).toBeGreaterThan(0);
  expect(before.filter((d: any) => d.kind === 'absent').map((d: any) => d.date)).toEqual([]);
});

test('người nghỉ việc: các ngày sau ngày nghỉ việc không phải ngày vắng', async ({ request }) => {
  test.fail(true, `BUG-attendance-6: ngày ngoài thời gian làm (sau ngày nghỉ việc) hiện "vắng" — ${CORE}`);
  const me = await myMonth(request, 'cc-nghi-viec', m1);
  const after = me.days.filter((d: any) => d.date > plan.resignDate && dow(d.date) !== 0);
  expect(after.length).toBeGreaterThan(0);
  expect(after.filter((d: any) => d.kind === 'absent').map((d: any) => d.date)).toEqual([]);
  expect(dayIn(me, plan.resignDate).kind, 'chính ngày nghỉ việc vẫn là ngày làm').toBe('work');
});

test('ca Night chưa bắt đầu (hôm nay) không phải ngày vắng', async ({ request }) => {
  test.fail(true, `BUG-attendance-8: /me hiện "vắng" cho hôm nay khi chưa chấm, kể cả khi ca chưa bắt đầu — ${CORE}`);
  const me = await myMonth(request, 'cc-dem', m0);
  expect(dayIn(me, today).kind).not.toBe('absent');
});

// ---------------------------------------------------------------- route không trả 500 (b)

test('ngày không có thật trong đường dẫn hay tham số trả 4xx, không phải 500', async ({ request }) => {
  test.fail(true, 'BUG-attendance-10: ngày sai định dạng (2026-02-30, abc) đi thẳng xuống PostgreSQL và trả 500');
  const statuses = await apiAs(request, ADMIN, async () => {
    const uuid = await uuidOf(request, 'cc-tre');
    return {
      timesheet: (await request.get(`/api/v2/attendance/timesheets/${uuid}/2026-02-30`)).status(),
      list: (await request.get('/api/v2/attendance/timesheets?startDate=abc')).status(),
      punches: (await request.get(`/api/v2/attendance/punches?employeeId=${uuid}&workDate=abc`)).status()
    };
  });
  const me = await apiAs(request, 'cc-tre', async () => (await request.get('/api/v2/me/attendance/2026-02-30')).status());
  for (const [k, s] of Object.entries({ ...statuses, me })) expect(s, k).toBeLessThan(500);
});

test('tính lại một ngày chưa có lịch làm việc trả 4xx, không phải 500', async ({ request }) => {
  test.fail(true, 'BUG-attendance-11: POST /attendance/recalculate ném Error thường khi chưa có lịch, controller không bắt → 500');
  const status = await apiAs(request, ADMIN, async () => {
    const res = await request.post('/api/v2/attendance/recalculate', {
      headers: json,
      data: { employeeId: await uuidOf(request, 'cc-hom-nay'), workDate: `${m1}-01` }
    });
    return res.status();
  });
  expect(status).toBeLessThan(500);
  expect(status).toBeGreaterThanOrEqual(400);
});

test('thiếu tham số hay sai loại chấm công trả 400', async ({ request }) => {
  await apiAs(request, ADMIN, async () => {
    expect((await request.get('/api/v2/attendance/punches')).status()).toBe(400);
    expect((await request.post('/api/v2/attendance/punches', { headers: json, data: { type: 'IN' } })).status()).toBe(400);
    const uuid = await uuidOf(request, 'cc-hom-nay');
    expect((await request.post('/api/v2/attendance/punches', { headers: json, data: { employeeId: uuid, type: 'X' } })).status()).toBe(400);
    expect((await request.get(`/api/v2/attendance/timesheets/${uuid}/${m1}-01`)).status(), 'ngày chưa có dòng công').toBe(404);
  });
  await apiAs(request, 'cc-hom-nay', async () => {
    expect((await request.post('/api/v2/me/punches', { headers: json, data: {} })).status()).toBe(400);
    expect((await request.get('/api/v2/me/attendance?month=2026-1')).status()).toBe(400);
  });
});

test('nhân viên không gọi được route chấm công, chốt công và lịch lễ của Admin', async ({ request }) => {
  await apiAs(request, 'cc-hom-nay', async () => {
    expect((await request.get(`/api/v2/attendance/timesheets?startDate=${m1}-01`)).status()).toBe(403);
    expect((await request.post('/api/v2/attendance/punches', { headers: json, data: { type: 'IN' } })).status()).toBe(403);
    expect((await request.post('/api/v2/attendance/recalculate', { headers: json, data: {} })).status()).toBe(403);
    expect((await request.post(`/api/v2/system/periods/${m1}/lock`, { headers: json, data: {} })).status()).toBe(403);
    expect((await request.post('/api/v2/holidays', { headers: json, data: { date: `${m1}-02`, name: 'x' } })).status()).toBe(403);
    expect((await request.delete(`/api/v2/holidays/${plan.holiday.date}`, { headers: json, data: {} })).status()).toBe(403);
  });
});
