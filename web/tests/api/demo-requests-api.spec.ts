// Đơn từ trên BE thật: các route /api/v2/requests và /api/v2/me/requests, luật đã chốt và bất biến.
// Chạy qua `npm run demo -- test requests` (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md, bảng tình huống
// docs/demo-db/requests.md). Chỉ sửa dữ liệu của người 'dt-'. Ngày lấy theo hôm nay (giờ VN) và theo đơn đã seed, không viết cứng.
// Mỗi test ghi gì thì tự dọn (huỷ đơn, xoá ngày lễ đã thêm), trừ khi việc ghi chính là điều được kiểm.
// Lỗi đã biết: test.fail(true, 'BUG-requests-<n>: …'); chi tiết ở docs/demo-db/requests.md.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { DayPicker } from '../../../scripts/demo/areas/requests';
import { ADMIN, addMonths, apiAs, demoMonths, demoReadyFor, weekday } from './fixtures/demo';

test.skip(!demoReadyFor('requests'), 'Chạy qua npm run demo -- test requests');
// Không dùng chế độ serial: một test lỗi không được chặn các test sau. workers = 1 nên test vẫn chạy theo thứ tự trong file.

const json = { 'Content-Type': 'application/json' };
const M = demoMonths();
const NEXT = addMonths(M.m0, 1);
const DAY_MS = 86_400_000;
const shift = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

type Req = {
  id: string;
  employeeId: string;
  type: string;
  status: string;
  title: string;
  reason: string;
  reviewNote: string | null;
  leaveType: string | null;
  leaveStartDate: string | null;
  leaveEndDate: string | null;
  leaveDaysCount: number | null;
  explanationDate: string | null;
  otDate: string | null;
  advanceAmount: number | string | null;
  changeStartDate: string | null;
  changeEndDate: string | null;
  isat: { saturday: string } | null;
};
type Res<T = any> = { status: number; body: T };

/** Gọi API trong phiên đang đăng nhập của `request` (apiAs đã đăng nhập). */
function client(request: APIRequestContext) {
  const call = async <T = any>(method: string, path: string, data?: unknown): Promise<Res<T>> => {
    const res = await request.fetch(`/api/v2${path}`, { method, headers: json, data: method === 'GET' ? undefined : (data ?? {}) });
    const text = await res.text();
    let body: any = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // giữ chữ
    }
    return { status: res.status(), body };
  };
  return {
    get: <T = any>(path: string) => call<T>('GET', path),
    post: <T = any>(path: string, data?: unknown) => call<T>('POST', path, data),
    patch: <T = any>(path: string, data?: unknown) => call<T>('PATCH', path, data),
    del: <T = any>(path: string) => call<T>('DELETE', path, {})
  };
}
type Client = ReturnType<typeof client>;
const as = <T>(request: APIRequestContext, username: string, fn: (api: Client) => Promise<T>) => apiAs(request, username, () => fn(client(request)));

const listOf = async (api: Client, username: string): Promise<Req[]> => {
  const r = await api.get(`/requests?employeeId=${username}&limit=500`);
  expect(r.status, `GET /requests?employeeId=${username}`).toBe(200);
  return r.body.items;
};
const one = (items: Req[], type: string, status: string): Req => {
  const hit = items.find(r => r.type === type && r.status === status);
  expect(hit, `đơn ${type} ${status} đã seed`).toBeTruthy();
  return hit!;
};
const getReq = async (api: Client, id: string): Promise<Req> => {
  const r = await api.get(`/requests/${id}`);
  expect(r.status).toBe(200);
  return r.body.request;
};
const leaveBody = (employeeId: string | undefined, startDate: string, endDate = startDate, leaveType = 'PERSONAL_PAID') => ({
  ...(employeeId ? { employeeId } : {}),
  title: 'Đơn nghỉ',
  reason: 'Thử luật',
  leaveType,
  startDate,
  endDate
});
const otBody = (employeeId: string | undefined, otDate: string, startTime = '18:00', endTime = '20:00') => ({
  ...(employeeId ? { employeeId } : {}),
  title: 'Làm thêm',
  reason: 'Thử luật',
  otDate,
  startTime,
  endTime
});
const isatBody = (employeeId: string | undefined, saturday: string) => ({
  ...(employeeId ? { employeeId } : {}),
  saturday,
  team: 'Kinh doanh',
  conditions: { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true }
});
/** Huỷ đơn của chính `username` (dọn sau test). */
const cancelAs = (request: APIRequestContext, username: string, id: string) =>
  as(request, username, async api => expect((await api.patch(`/me/requests/${id}/cancel`)).status).toBe(200));

async function pickerOf(api: Client): Promise<DayPicker> {
  const holidays = new Set<string>();
  for (const year of new Set([M.m1, M.m0, NEXT, addMonths(NEXT, 1)].map(m => m.slice(0, 4)))) {
    const r = await api.get(`/holidays?year=${year}`);
    for (const h of r.body.items ?? []) holidays.add(String(h.date).slice(0, 10));
  }
  return new DayPicker(holidays);
}

// ---------------------------------------------------------------- danh mục và đọc đơn

test('catalogue routes list 6 leave types, 7 explanation cases and 4 iSAT conditions', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const types = await api.get('/requests/leave-types');
    expect(types.status).toBe(200);
    expect(types.body.leaveTypes.map((t: any) => t.label)).toEqual([
      'Phép năm',
      'Việc riêng có lương',
      'Việc riêng không lương',
      'Chế độ BHXH',
      'Phúc lợi nội bộ',
      'Không lương'
    ]);
    const cases = await api.get('/requests/explanation-cases');
    expect(cases.status).toBe(200);
    expect(cases.body.cases).toHaveLength(7);
    const conditions = await api.get('/requests/isat/conditions');
    expect(conditions.status).toBe(200);
    expect(conditions.body.conditions).toHaveLength(4);
  });
});

test('every request kind has a pending, approved, rejected and cancelled request', async ({ request }) => {
  const matrix: Array<[string, string]> = [
    ['dt-an', 'LEAVE'],
    ['dt-binh', 'OVERTIME'],
    ['dt-chi', 'SHIFT_CHANGE'],
    ['dt-dung', 'EXPLANATION'],
    ['dt-giang', 'ADVANCE'],
    ['dt-hoa', 'LEAVE_WITH_MAKEUP'],
    ['dt-khoa', 'ISAT']
  ];
  await as(request, ADMIN, async api => {
    for (const [username, type] of matrix) {
      const statuses = new Set((await listOf(api, username)).filter(r => r.type === type).map(r => r.status));
      expect([...statuses].sort(), `${username} ${type}`).toEqual(['APPROVED', 'CANCELLED', 'PENDING', 'REJECTED']);
    }
  });
});

test('list totals agree with the status filters and paging returns every row once', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const all = await api.get('/requests?limit=1000');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(all.body.items.length);
    let sum = 0;
    for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']) {
      const r = await api.get(`/requests?status=${status}&limit=1`);
      expect(r.status).toBe(200);
      expect(r.body.total, status).toBe(all.body.items.filter((x: Req) => x.status === status).length);
      sum += r.body.total;
    }
    expect(sum).toBe(all.body.total);
    const ids: string[] = [];
    for (let offset = 0; offset < all.body.total; offset += 7) {
      const page = await api.get(`/requests?limit=7&offset=${offset}`);
      expect(page.status).toBe(200);
      ids.push(...page.body.items.map((x: Req) => x.id));
    }
    expect(new Set(ids).size).toBe(all.body.total);
    expect(ids.length).toBe(all.body.total);
  });
});

test('unknown request ids give 404', async ({ request }) => {
  const ghost = '00000000-0000-4000-8000-000000000000';
  await as(request, ADMIN, async api => {
    expect((await api.get(`/requests/${ghost}`)).status).toBe(404);
    expect((await api.patch(`/requests/${ghost}/review`, { action: 'APPROVE' })).status).toBe(404);
  });
  await as(request, 'dt-phu', async api => {
    expect((await api.get(`/me/requests/${ghost}`)).status).toBe(404);
    expect((await api.patch(`/me/requests/${ghost}/cancel`)).status).toBe(404);
    expect((await api.post('/me/requests/khong-co-loai', {})).status).toBe(404);
  });
});

// Route có :id mà id không phải uuid: GET để PostgreSQL báo lỗi kiểu uuid (500); PATCH đã trả 4xx.
for (const [who, method, path, bug] of [
  [ADMIN, 'GET', '/requests/khong-co', true],
  ['dt-phu', 'GET', '/me/requests/khong-co', true],
  [ADMIN, 'PATCH', '/requests/khong-co/review', false],
  [ADMIN, 'PATCH', '/requests/khong-co/cancel', false],
  ['dt-phu', 'PATCH', '/me/requests/khong-co/cancel', false]
] as const) {
  test(`a malformed request id never gives 500: ${method} ${path}`, async ({ request }) => {
    test.fail(bug, 'BUG-requests-7: id đơn không phải uuid làm PostgreSQL báo "invalid input syntax for type uuid", BE trả 500');
    const body = path.endsWith('/review') ? { action: 'APPROVE' } : path.endsWith('/cancel') && who === ADMIN ? { employeeId: 'dt-phu' } : {};
    const res = await as(request, who, api => (method === 'GET' ? api.get(path) : api.patch(path, body)));
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(500);
  });
}

test('a staff account cannot call the Admin request routes', async ({ request }) => {
  const target = await as(request, ADMIN, async api => one(await listOf(api, 'dt-lam'), 'LEAVE', 'PENDING'));
  await as(request, 'dt-phu', async api => {
    expect((await api.get('/requests')).status).toBe(403);
    expect((await api.get(`/requests/${target.id}`)).status).toBe(403);
    expect((await api.post('/requests/leave', leaveBody('dt-phu', shift(M.today, 30)))).status).toBe(403);
    expect((await api.patch(`/requests/${target.id}/review`, { action: 'APPROVE' })).status).toBe(403);
  });
  await as(request, ADMIN, async api => expect((await getReq(api, target.id)).status).toBe('PENDING'));
});

// ---------------------------------------------------------------- duyệt, từ chối, huỷ

test('an approved request cannot be approved or rejected again', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const approved = one(await listOf(api, 'dt-an'), 'LEAVE', 'APPROVED');
    for (const action of ['APPROVE', 'REJECT']) {
      const r = await api.patch(`/requests/${approved.id}/review`, { action, note: 'Thử duyệt lại' });
      expect(r.status, `${action} lần hai`).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
    }
    const after = await getReq(api, approved.id);
    expect(after.status).toBe('APPROVED');
    expect(after.reviewNote).toBe(approved.reviewNote);
  });
});

test('a rejected or cancelled request cannot be reviewed or cancelled', async ({ request }) => {
  const items = await as(request, ADMIN, api => listOf(api, 'dt-binh'));
  const rejected = one(items, 'OVERTIME', 'REJECTED');
  const cancelled = one(items, 'OVERTIME', 'CANCELLED');
  await as(request, ADMIN, async api => {
    for (const r of [rejected, cancelled]) {
      const res = await api.patch(`/requests/${r.id}/review`, { action: 'APPROVE' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  });
  await as(request, 'dt-binh', async api => {
    for (const r of [rejected, cancelled, one(items, 'OVERTIME', 'APPROVED')]) {
      expect((await api.patch(`/me/requests/${r.id}/cancel`)).status, r.status).toBe(409);
    }
  });
  await as(request, ADMIN, async api => {
    expect((await getReq(api, rejected.id)).status).toBe('REJECTED');
    expect((await getReq(api, cancelled.id)).status).toBe('CANCELLED');
  });
});

test('a review with an unknown action is refused and the request stays pending', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const pending = (await listOf(api, 'dt-lam')).filter(r => r.type === 'LEAVE' && r.status === 'PENDING')[0];
    const r = await api.patch(`/requests/${pending.id}/review`, { action: 'MAYBE' });
    expect(r.status).toBe(400);
    expect((await getReq(api, pending.id)).status).toBe('PENDING');
  });
});

test('staff file and cancel their own pending request, and cannot cancel someone else’s', async ({ request }) => {
  const picker = await as(request, ADMIN, pickerOf);
  const day = picker.day(NEXT, 1, 0);
  for (let round = 1; round <= 2; round++) {
    // Huỷ xong thì ngày được trả lại: nộp lại đúng ngày đó được.
    const created = await as(request, 'dt-phu', api => api.post('/me/requests/leave', leaveBody(undefined, day)));
    expect(created.status, `lần ${round}: ${JSON.stringify(created.body)}`).toBe(201);
    expect(created.body.request.status).toBe('PENDING');
    await as(request, 'dt-phu', async api => {
      const r = await api.patch(`/me/requests/${created.body.request.id}/cancel`);
      expect(r.status).toBe(200);
      expect(r.body.request.status).toBe('CANCELLED');
    });
  }
  const someoneElse = await as(request, ADMIN, async api => one(await listOf(api, 'dt-an'), 'LEAVE', 'PENDING'));
  await as(request, 'dt-phu', async api => {
    const r = await api.patch(`/me/requests/${someoneElse.id}/cancel`);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });
  await as(request, ADMIN, async api => expect((await getReq(api, someoneElse.id)).status).toBe('PENDING'));
});

test('staff only see their own requests through /me', async ({ request }) => {
  const other = await as(request, ADMIN, async api => one(await listOf(api, 'dt-an'), 'LEAVE', 'APPROVED'));
  await as(request, 'dt-binh', async api => {
    const mine = await api.get('/me/requests');
    expect(mine.status).toBe(200);
    expect(mine.body.items.map((r: Req) => r.id)).not.toContain(other.id);
    expect((await api.get(`/me/requests/${other.id}`)).status).toBe(404);
  });
});

test('Admin and each employee read the same requests with the same status', async ({ request }) => {
  // dt-nam đã nghỉ việc nên tài khoản bị khoá, không đăng nhập được.
  const people = ['dt-an', 'dt-binh', 'dt-chi', 'dt-dung', 'dt-giang', 'dt-hoa', 'dt-khoa', 'dt-lam', 'dt-mai', 'dt-quan'];
  const adminView = new Map<string, Map<string, string>>();
  await as(request, ADMIN, async api => {
    for (const u of people) adminView.set(u, new Map((await listOf(api, u)).map(r => [r.id, r.status])));
  });
  for (const u of people) {
    await as(request, u, async api => {
      const mine = await api.get('/me/requests');
      expect(mine.status).toBe(200);
      const staffView = new Map<string, string>(mine.body.items.map((r: Req) => [r.id, r.status]));
      expect(Object.fromEntries(staffView), u).toEqual(Object.fromEntries(adminView.get(u)!));
      for (const id of staffView.keys()) {
        const detail = await api.get(`/me/requests/${id}`);
        expect(detail.status).toBe(200);
        expect(detail.body.request.status).toBe(staffView.get(id));
        expect(detail.body.steps.length).toBeGreaterThan(0);
      }
    });
  }
});

test('/me request counts add up to the list', async ({ request }) => {
  for (const u of ['dt-an', 'dt-khoa', 'dt-giang']) {
    await as(request, u, async api => {
      const { counts, items } = (await api.get('/me/requests')).body;
      const n = (s: string) => items.filter((r: Req) => r.status === s).length;
      expect(counts, u).toEqual({ all: items.length, pending: n('PENDING'), approved: n('APPROVED'), rejected: n('REJECTED'), cancelled: n('CANCELLED') });
      const pending = await api.get('/me/requests?status=PENDING');
      expect(pending.body.items).toHaveLength(n('PENDING'));
    });
  }
});

// ---------------------------------------------------------------- trùng ngày (day_status)

test('a leave overlapping a pending leave is refused', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const before = await listOf(api, 'dt-lam');
    const range = before.find(r => r.type === 'LEAVE' && r.status === 'PENDING' && r.leaveStartDate !== r.leaveEndDate)!;
    const r = await api.post('/requests/leave', leaveBody('dt-lam', shift(range.leaveStartDate!, 1)));
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    expect(await listOf(api, 'dt-lam')).toHaveLength(before.length);
  });
});

test('a leave on a Saturday with a pending iSAT is refused and names the iSAT', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const isat = one(await listOf(api, 'dt-lam'), 'ISAT', 'PENDING');
    const r = await api.post('/requests/leave', leaveBody('dt-lam', isat.isat!.saturday));
    expect(r.status).toBe(400);
    expect(r.body.error ?? r.body.message ?? JSON.stringify(r.body)).toContain('iSAT');
  });
});

test('a leave range over an approved iSAT Saturday skips that Saturday with a warning', async ({ request }) => {
  const { saturday, friday } = await as(request, ADMIN, async api => {
    const sat = one(await listOf(api, 'dt-lam'), 'ISAT', 'APPROVED').isat!.saturday;
    return { saturday: sat, friday: (await pickerOf(api)).isWorkday(shift(sat, -1)) ? shift(sat, -1) : null };
  });
  test.skip(!friday, 'Thứ Sáu trước Thứ Bảy iSAT là ngày lễ');
  const created = await as(request, ADMIN, api => api.post('/requests/leave', leaveBody('dt-lam', friday!, saturday)));
  try {
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.request.leaveDaysCount).toBe(1);
    expect(created.body.warnings.join(' ')).toContain(`${saturday.slice(8, 10)}/${saturday.slice(5, 7)}`);
  } finally {
    if (created.status === 201) await cancelAs(request, 'dt-lam', created.body.request.id);
  }
});

test('OT on a leave day is refused', async ({ request }) => {
  const day = (await as(request, ADMIN, pickerOf)).day(NEXT, 2, 0);
  const leave = await as(request, 'dt-phu', api => api.post('/me/requests/leave', leaveBody(undefined, day)));
  expect(leave.status, JSON.stringify(leave.body)).toBe(201);
  try {
    const ot = await as(request, ADMIN, api => api.post('/requests/overtime', otBody('dt-phu', day)));
    expect(ot.status, JSON.stringify(ot.body)).toBe(400);
  } finally {
    await cancelAs(request, 'dt-phu', leave.body.request.id);
  }
});

test('a shift change over a leave day is accepted and the leave day stays leave', async ({ request }) => {
  const picker = await as(request, ADMIN, pickerOf);
  const [mon, tue, wed] = picker.days(NEXT, 3, 3);
  const leave = await as(request, 'dt-phu', api => api.post('/me/requests/leave', leaveBody(undefined, tue)));
  expect(leave.status, JSON.stringify(leave.body)).toBe(201);
  const change = await as(request, ADMIN, api =>
    api.post('/requests/shift-change', { employeeId: 'dt-phu', title: 'Đổi ca', reason: 'Thử luật', startDate: mon, endDate: wed, shiftType: 'FLEX', startTime: '06:00' })
  );
  try {
    expect(change.status, JSON.stringify(change.body)).toBe(201);
    expect(change.body.warnings.join(' ')).toContain(`${tue.slice(8, 10)}/${tue.slice(5, 7)}`);
    await as(request, ADMIN, async api => expect((await getReq(api, leave.body.request.id)).status).toBe('PENDING'));
  } finally {
    if (change.status === 201) await cancelAs(request, 'dt-phu', change.body.request.id);
    await cancelAs(request, 'dt-phu', leave.body.request.id);
  }
});

test('a leave can be filed on a day with a pending shift change', async ({ request }) => {
  const [mon, tue] = (await as(request, ADMIN, pickerOf)).days(NEXT, 4, 2);
  const change = await as(request, 'dt-phu', api =>
    api.post('/me/requests/shift-change', { title: 'Đổi ca', reason: 'Thử luật', startDate: mon, endDate: tue, shiftType: 'NORMAL', startTime: '10:00' })
  );
  expect(change.status, JSON.stringify(change.body)).toBe(201);
  const leave = await as(request, 'dt-phu', api => api.post('/me/requests/leave', leaveBody(undefined, tue)));
  try {
    expect(leave.status, JSON.stringify(leave.body)).toBe(201);
  } finally {
    if (leave.status === 201) await cancelAs(request, 'dt-phu', leave.body.request.id);
    await cancelAs(request, 'dt-phu', change.body.request.id);
  }
});

test('OT and leave-with-makeup cannot share a month', async ({ request }) => {
  const picker = await as(request, ADMIN, pickerOf);
  await as(request, ADMIN, async api => {
    // dt-hoa có đơn nghỉ có làm bù chờ duyệt ở tháng sau → không đăng ký OT tháng đó.
    const ot = await api.post('/requests/overtime', otBody('dt-hoa', picker.day(NEXT, 3, 0)));
    expect(ot.status, JSON.stringify(ot.body)).toBe(400);
    // dt-binh có đơn OT chờ duyệt ở tháng sau → không nộp nghỉ có làm bù tháng đó.
    const lwm = await api.post('/requests/leave-with-makeup', {
      employeeId: 'dt-binh',
      title: 'Nghỉ có làm bù',
      reason: 'Thử luật',
      startDate: picker.day(NEXT, 3, 0),
      endDate: picker.day(NEXT, 3, 0),
      slots: [picker.day(NEXT, 3, 2), picker.day(NEXT, 3, 3)].map(date => ({ date, startTime: '18:00', endTime: '22:00' }))
    });
    expect(lwm.status, JSON.stringify(lwm.body)).toBe(400);
  });
});

test('leave-with-makeup needs exactly 8 makeup hours, all after the leave day', async ({ request }) => {
  const picker = await as(request, ADMIN, pickerOf);
  const leaveDay = picker.day(NEXT, 4, 3);
  const body = (slots: string[]) => ({
    title: 'Nghỉ có làm bù',
    reason: 'Thử luật',
    startDate: leaveDay,
    endDate: leaveDay,
    slots: slots.map(date => ({ date, startTime: '18:00', endTime: '22:00' }))
  });
  await as(request, 'dt-phu', async api => {
    const short = await api.post('/me/requests/leave-with-makeup', body([shift(leaveDay, 1)]));
    expect(short.status, JSON.stringify(short.body)).toBe(400);
    const before = await api.post('/me/requests/leave-with-makeup', body([shift(leaveDay, -1), shift(leaveDay, 1)]));
    expect(before.status, JSON.stringify(before.body)).toBe(400);
    expect((await api.get('/me/requests')).body.items.filter((r: Req) => r.type === 'LEAVE_WITH_MAKEUP')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- ngày lễ thắng đơn nghỉ (luật 05/11)

/** Thêm ngày lễ `date` trong lúc chạy `fn`, rồi xoá. Ngày đã là ngày lễ thì bỏ qua test. */
async function withHoliday(request: APIRequestContext, date: string, fn: () => Promise<void>) {
  const added = await as(request, ADMIN, api => api.post('/holidays', { date, name: 'Ngày lễ thử (demo requests)' }));
  test.skip(added.status !== 201 && added.status !== 200, `không thêm được ngày lễ ${date}: ${JSON.stringify(added.body)}`);
  try {
    await fn();
  } finally {
    await as(request, ADMIN, async api => expect((await api.del(`/holidays/${date}`)).status).toBe(200));
  }
}

test('a holiday added before approval leaves the leave with fewer days', async ({ request }) => {
  const leave = await as(request, ADMIN, async api =>
    (await listOf(api, 'dt-lam')).find(r => r.type === 'LEAVE' && r.status === 'PENDING' && r.leaveStartDate !== r.leaveEndDate)!
  );
  expect(leave.leaveDaysCount).toBe(3);
  await withHoliday(request, shift(leave.leaveStartDate!, 1), async () => {
    await as(request, ADMIN, async api => {
      const r = await api.patch(`/requests/${leave.id}/review`, { action: 'APPROVE' });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.request.status).toBe('APPROVED');
      expect(r.body.request.leaveDaysCount).toBe(2);
    });
  });
});

test('a leave whose only day became a holiday cannot be approved', async ({ request }) => {
  const leave = await as(request, ADMIN, async api =>
    (await listOf(api, 'dt-lam')).find(r => r.type === 'LEAVE' && r.status === 'PENDING' && r.leaveStartDate === r.leaveEndDate)!
  );
  await withHoliday(request, leave.leaveStartDate!, async () => {
    await as(request, ADMIN, async api => {
      const r = await api.patch(`/requests/${leave.id}/review`, { action: 'APPROVE' });
      expect(r.status, JSON.stringify(r.body)).toBe(409);
      expect((await getReq(api, leave.id)).status).toBe('PENDING');
    });
  });
});

test('a leave-with-makeup whose leave day became a holiday cannot be approved', async ({ request }) => {
  const lwm = await as(request, ADMIN, async api => one(await listOf(api, 'dt-lam'), 'LEAVE_WITH_MAKEUP', 'PENDING'));
  await withHoliday(request, lwm.leaveStartDate!, async () => {
    await as(request, ADMIN, async api => {
      const r = await api.patch(`/requests/${lwm.id}/review`, { action: 'APPROVE' });
      expect(r.status, JSON.stringify(r.body)).toBe(409);
      expect((await getReq(api, lwm.id)).status).toBe('PENDING');
    });
  });
});

// ---------------------------------------------------------------- iSAT

test('iSAT is refused for a past Saturday, for today and for a weekday', async ({ request }) => {
  let lastSat = shift(M.today, -1);
  while (weekday(lastSat) !== 6) lastSat = shift(lastSat, -1);
  let weekdayAhead = shift(M.today, 3);
  while (weekday(weekdayAhead) === 6 || weekday(weekdayAhead) === 0) weekdayAhead = shift(weekdayAhead, 1);
  const refused = [lastSat, weekdayAhead, ...(weekday(M.today) === 6 ? [M.today] : [])];
  await as(request, ADMIN, async api => {
    for (const day of refused) expect((await api.post('/requests/isat', isatBody('dt-khoa', day))).status, day).toBe(400);
  });
  await as(request, 'dt-khoa', async api => {
    for (const day of refused) expect((await api.post('/me/requests/isat', isatBody(undefined, day))).status, day).toBe(400);
  });
});

test('an iSAT self-assessment under 4/4 is saved as rejected without Admin', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const auto = (await listOf(api, 'dt-khoa')).filter(r => r.type === 'ISAT' && r.status === 'REJECTED');
    expect(auto.some(r => (r.reviewNote ?? '').includes('chưa đạt')), 'đơn tự đánh giá 3/4').toBeTruthy();
  });
});

test('a second iSAT for the same Saturday is refused', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const pending = one(await listOf(api, 'dt-khoa'), 'ISAT', 'PENDING');
    expect((await api.post('/requests/isat', isatBody('dt-khoa', pending.isat!.saturday))).status).toBe(400);
  });
});

test('interns cannot file OT or iSAT', async ({ request }) => {
  const picker = await as(request, ADMIN, pickerOf);
  const sat = picker.saturdays(M.today, 1)[0];
  await as(request, 'dt-oanh', async api => {
    expect((await api.post('/me/requests/overtime', otBody(undefined, picker.day(NEXT, 1, 0)))).status).toBe(400);
    expect((await api.post('/me/requests/isat', isatBody(undefined, sat))).status).toBe(400);
    expect((await api.get('/me/requests')).body.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- giải trình

test('a rejected explanation day cannot be filed again, a cancelled one can', async ({ request }) => {
  const items = await as(request, ADMIN, api => listOf(api, 'dt-dung'));
  const body = (workDate: string) => ({ employeeId: 'dt-dung', title: 'Giải trình', reason: 'Nộp lại', workDate, cases: ['LATE_CHECK_IN'] });
  await as(request, ADMIN, async api => {
    const again = await api.post('/requests/explanation', body(one(items, 'EXPLANATION', 'REJECTED').explanationDate!));
    expect(again.status, JSON.stringify(again.body)).toBe(400);
  });
  const refiled = await as(request, ADMIN, api => api.post('/requests/explanation', body(one(items, 'EXPLANATION', 'CANCELLED').explanationDate!)));
  expect(refiled.status, JSON.stringify(refiled.body)).toBe(201);
  await cancelAs(request, 'dt-dung', refiled.body.request.id);
});

test('an explanation for a future day is refused', async ({ request }) => {
  await as(request, 'dt-phu', async api => {
    const r = await api.post('/me/requests/explanation', { title: 'Giải trình', reason: 'Thử', workDate: shift(M.today, 1), cases: ['LATE_CHECK_IN'] });
    expect(r.status).toBe(400);
  });
});

// ---------------------------------------------------------------- nhân viên tự nộp: luật đã chốt 05/11 (phiên staff-requests đang làm)

/** Nộp như dt-phu; đơn lỡ được nhận thì huỷ ngay, rồi trả mã. */
async function selfFile(request: APIRequestContext, kind: string, body: Record<string, unknown>): Promise<Res> {
  return as(request, 'dt-phu', async api => {
    const r = await api.post(`/me/requests/${kind}`, body);
    if (r.status === 201) await api.patch(`/me/requests/${r.body.request.id}/cancel`);
    return r;
  });
}

test('staff cannot file a leave for a day before today', async ({ request }) => {
  test.fail(true, 'BUG-requests-1: /me nhận đơn nghỉ ngày đã qua (luật 05/11: chỉ từ hôm nay; phiên staff-requests đang làm)');
  const picker = await as(request, ADMIN, pickerOf);
  let past = shift(M.today, -1);
  while (!picker.isWorkday(past)) past = shift(past, -1);
  expect((await selfFile(request, 'leave', leaveBody(undefined, past))).status).toBe(400);
});

test('staff cannot file a leave after the end of next month', async ({ request }) => {
  test.fail(true, 'BUG-requests-2: /me nhận đơn nghỉ sau hết tháng sau (luật 05/11; phiên staff-requests đang làm)');
  const far = (await as(request, ADMIN, pickerOf)).day(addMonths(NEXT, 1), 1, 0);
  expect((await selfFile(request, 'leave', leaveBody(undefined, far))).status).toBe(400);
});

test('staff OT must start and end on the hour', async ({ request }) => {
  test.fail(true, 'BUG-requests-3: /me nhận OT 18:30–20:30 (luật 05/11: giờ tròn; phiên staff-requests đang làm)');
  const day = (await as(request, ADMIN, pickerOf)).day(NEXT, 1, 3);
  expect((await selfFile(request, 'overtime', otBody(undefined, day, '18:30', '20:30'))).status).toBe(400);
});

test('staff can file an advance only on the 16th and 17th', async ({ request }) => {
  const day = Number(M.today.slice(8, 10));
  test.skip(day === 16 || day === 17, 'Hôm nay là ngày được nộp tạm ứng');
  test.fail(true, 'BUG-requests-4: /me nhận tạm ứng ngoài ngày 16–17 (luật 05/11; phiên staff-requests đang làm)');
  expect((await selfFile(request, 'advance', { title: 'Tạm ứng', reason: 'Thử', period: M.m0, amount: 1_000_000 })).status).toBe(400);
});

test('the advance amount is set by the server, not by the client', async ({ request }) => {
  test.fail(true, 'BUG-requests-5: số tiền tạm ứng lấy theo client gửi (luật 05/11: 80% lương ngày công 01–15, chỉ đọc; phiên staff-requests đang làm)');
  const r = await as(request, ADMIN, api =>
    api.post('/requests/advance', { employeeId: 'dt-phu', title: 'Tạm ứng', reason: 'Thử', period: M.m0, amount: 987_654_321 })
  );
  if (r.status === 201) await cancelAs(request, 'dt-phu', r.body.request.id);
  // Được nhận thì số tiền phải do server tính; dt-phu chưa có ngày công 01–15 nên server cũng có thể từ chối (số được ứng 0).
  expect(r.status === 201 ? Number(r.body.request.advanceAmount) : null).not.toBe(987_654_321);
});

// ---------------------------------------------------------------- người đã nghỉ việc

test('a resigned employee keeps readable requests and the pending one stays in the queue', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const staff = (await api.get('/employees')).body.employees.find((e: any) => e.account.username === 'dt-nam');
    expect(staff.contract.resignedOn, 'ngày nghỉ việc').toBeTruthy();
    const items = await listOf(api, 'dt-nam');
    expect(items.map(r => r.status).sort()).toEqual(['APPROVED', 'PENDING']);
    const queue = await api.get('/requests?status=PENDING&limit=1000');
    expect(queue.body.items.map((r: Req) => r.id)).toContain(one(items, 'LEAVE', 'PENDING').id);
  });
});

test('a resigned employee reads back as Đã nghỉ việc', async ({ request }) => {
  test.fail(true, 'BUG-requests-8: DELETE /employees ghi contract_status = NULL (CHECK chỉ nhận probation/official), đọc lại thành "nv"');
  await as(request, ADMIN, async api => {
    const staff = (await api.get('/employees')).body.employees.find((e: any) => e.account.username === 'dt-nam');
    expect(staff.contract.status).toBe('nghiviec');
  });
});

// ---------------------------------------------------------------- tháng đã chốt công (chạy cuối: chốt tháng trước)

test.describe('a locked month', () => {
  test.beforeAll(async ({ request }) => {
    await as(request, ADMIN, async api => {
      const r = await api.post(`/system/periods/${M.m1}/lock`);
      expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    });
  });

  test('Admin can still approve and reject the pending requests of a locked month', async ({ request }) => {
    await as(request, ADMIN, async api => {
      const items = await listOf(api, 'dt-mai');
      const leave = one(items, 'LEAVE', 'PENDING');
      const explanation = one(items, 'EXPLANATION', 'PENDING');
      expect(leave.leaveStartDate!.startsWith(M.m1)).toBeTruthy();
      expect((await api.patch(`/requests/${leave.id}/review`, { action: 'APPROVE' })).status).toBe(200);
      expect((await api.patch(`/requests/${explanation.id}/review`, { action: 'REJECT', note: 'Không có xác nhận' })).status).toBe(200);
    });
  });

  test('an explanation for a day of a locked month can still be filed', async ({ request }) => {
    const day = (await as(request, ADMIN, pickerOf)).day(M.m1, 4, 2);
    await as(request, 'dt-mai', async api => {
      const r = await api.post('/me/requests/explanation', {
        title: 'Giải trình',
        reason: 'Quên chấm công',
        workDate: day,
        cases: ['MISSING_CHECK_IN', 'MISSING_CHECK_OUT'],
        actualCheckIn: '08:00',
        actualCheckOut: '17:00'
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    });
  });

  test('no new leave can be filed for a locked month, by Admin or by the employee', async ({ request }) => {
    test.fail(true, 'BUG-requests-6: tháng đã chốt công vẫn nhận đơn nghỉ mới (luật 05/11: chỉ còn giải trình; phiên staff-requests và period-lifecycle đang làm)');
    const [first, second] = (await as(request, ADMIN, pickerOf)).days(M.m1, 4, 2, 3);
    const byAdmin = await as(request, ADMIN, api => api.post('/requests/leave', leaveBody('dt-mai', first)));
    if (byAdmin.status === 201) await cancelAs(request, 'dt-mai', byAdmin.body.request.id);
    const bySelf = await as(request, 'dt-mai', api => api.post('/me/requests/leave', leaveBody(undefined, second)));
    if (bySelf.status === 201) await cancelAs(request, 'dt-mai', bySelf.body.request.id);
    expect(byAdmin.status).toBe(400);
    expect(bySelf.status).toBe(400);
  });
});
