// Chốt công (thanh kỳ lương ở /admin/cham-cong, POST /system/periods/:month/lock) và ngày lễ (/admin/cai-dat/lich, /holidays) trên BE thật.
// Chỉ chốt tháng m3 (ba tháng trước, chỉ cc-chot có công): chốt tháng này hay tháng trước sẽ chặn các mảng khác.
// Chạy qua `npm run demo -- test attendance`. Tài liệu và danh sách lỗi: docs/demo-db/attendance.md.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, addMonths, apiAs, demoMonths, demoReadyFor, signIn } from './fixtures/demo';
import { attendancePlan, punchedAt } from '../../../scripts/demo/people/attendance';

test.skip(!demoReadyFor('attendance'), 'Chạy qua npm run demo -- test attendance');

const plan = attendancePlan(demoMonths());
const { m0, m1, today } = plan.months;
const m3 = plan.m3;
const json = { 'Content-Type': 'application/json' };
const monthTitle = (ym: string) => `tháng ${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`;
const firstChot = plan.days.find(d => d.username === 'cc-chot')!;
const sundayOf = (ym: string) => {
  for (let d = 1; d <= 7; d++) {
    const iso = `${ym}-0${d}`;
    if (new Date(`${iso}T00:00:00Z`).getUTCDay() === 0) return iso;
  }
  throw new Error(ym);
};

/** (b) không lỗi console, không lỗi JS, không route /api trả 5xx (trừ những đường đã ghi lỗi). */
function guard(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on('response', r => {
    if (r.status() >= 500 && r.url().includes('/api/')) problems.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return () => expect(problems, 'không lỗi console, không 5xx').toEqual([]);
}

const periodOf = (request: APIRequestContext, month: string) =>
  apiAs(request, ADMIN, async () => {
    const { periods } = await (await request.get('/api/v2/system/periods')).json();
    return (periods as any[]).find(p => p.month === month) ?? null;
  });

const uuidOf = (request: APIRequestContext, username: string) =>
  apiAs(request, ADMIN, async () => (await (await request.get(`/api/v2/employees/${username}`)).json()).employee.profile.uuid as string);

/** Trạng thái kỳ công tháng `ym` ở app nhân viên của cc-chot. Lùi từng tháng, chờ nhãn tháng mới hiện rồi mới bấm tiếp. */
async function staffMonthState(page: Page, ym: string): Promise<string> {
  const label = (m: string) => `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}`;
  await signIn(page, 'cc-chot');
  await page.goto('/nv/cham-cong');
  await expect(page.getByText(label(m0), { exact: true })).toBeVisible();
  for (let cur = m0; cur > ym; ) {
    cur = addMonths(cur, -1);
    await page.getByRole('button', { name: 'Tháng trước' }).click();
    await expect(page.getByText(label(cur), { exact: true })).toBeVisible();
  }
  const state = page.getByText(/^Kỳ công (đã chốt|đang mở)$/);
  await expect(state).toBeVisible();
  return (await state.textContent())!.trim();
}

// ---------------------------------------------------------------- Chốt công

test('tháng này chưa hết: thanh kỳ lương không có nút "Chốt công"', async ({ page }) => {
  test.fail(true, 'BUG-attendance-13: nút "Chốt công" hiện cả với tháng đang chạy (luật: chỉ chốt sau khi hết tháng; phiên lifecycle)');
  await signIn(page, ADMIN);
  await page.goto(`/admin/cham-cong?thang=${m0}`);
  await expect(page.getByRole('region', { name: 'Các bước kỳ lương' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chốt công' })).toHaveCount(0);
});

test('tháng trước: nút "Chốt công" có khi và chỉ khi tháng chưa chốt (theo /system/periods)', async ({ page, request }) => {
  const check = guard(page);
  const p = await periodOf(request, m1);
  const locked = !!p && p.status !== 'open';
  await signIn(page, ADMIN);
  await page.goto(`/admin/cham-cong?thang=${m1}`);
  await expect(page.getByRole('region', { name: 'Các bước kỳ lương' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chốt công' })).toHaveCount(locked ? 0 : 1);
  check();
});

test.describe('chốt công tháng m3 qua giao diện rồi thử sửa', () => {
  test.describe.configure({ mode: 'serial' });

  test('trước khi chốt: app nhân viên ghi "Kỳ công đang mở"', async ({ page }) => {
    const check = guard(page);
    expect(await staffMonthState(page, m3)).toBe('Kỳ công đang mở');
    check();
  });

  test('Admin bấm "Chốt công", đồng ý: báo đã chốt, nút biến mất, /system/periods ghi attendance_locked', async ({ page, request }) => {
    const check = guard(page);
    await signIn(page, ADMIN);
    await page.goto(`/admin/cham-cong?thang=${m3}`);
    const dialogs: string[] = [];
    page.on('dialog', d => {
      dialogs.push(d.message());
      void d.accept();
    });
    await page.getByRole('button', { name: 'Chốt công' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Đã chốt công ${monthTitle(m3)}.` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chốt công' })).toHaveCount(0);
    expect(dialogs[0]).toContain(`Chốt công ${monthTitle(m3)}?`);
    expect((await periodOf(request, m3))?.status).toBe('attendance_locked');
    check();
  });

  test('sau khi chốt: app nhân viên ghi "Kỳ công đã chốt"', async ({ page }) => {
    const check = guard(page);
    expect(await staffMonthState(page, m3)).toBe('Kỳ công đã chốt');
    check();
  });

  test('tháng đã chốt: BE từ chối Admin chấm hộ', async ({ request }) => {
    test.fail(true, 'BUG-attendance-14: POST /attendance/punches vẫn nhận giờ chấm trong tháng đã chốt công');
    const employeeId = await uuidOf(request, 'cc-chot');
    // Cùng giờ vào đã có (07:55): nếu BE lỡ nhận thì giờ vào sớm nhất của ngày vẫn như cũ.
    const status = await apiAs(request, ADMIN, async () =>
      (
        await request.post('/api/v2/attendance/punches', {
          headers: json,
          data: { employeeId, type: 'IN', workDate: firstChot.date, punchedAt: punchedAt(firstChot.date, firstChot.punches[0]), note: 'demo thử tháng đã chốt' }
        })
      ).status()
    );
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  test('tháng đã chốt: BE từ chối tính lại bảng công', async ({ request }) => {
    test.fail(true, 'BUG-attendance-14: POST /attendance/recalculate vẫn tính lại ngày của tháng đã chốt công');
    const employeeId = await uuidOf(request, 'cc-chot');
    const status = await apiAs(request, ADMIN, async () =>
      (await request.post('/api/v2/attendance/recalculate', { headers: json, data: { employeeId, workDate: firstChot.date } })).status()
    );
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  test('tháng đã chốt: BE từ chối thêm ngày lễ vào tháng đó', async ({ request }) => {
    test.fail(true, 'BUG-attendance-14: POST /holidays vẫn thêm ngày lễ vào tháng đã chốt công');
    const date = sundayOf(m3);
    await apiAs(request, ADMIN, async () => {
      const res = await request.post('/api/v2/holidays', { headers: json, data: { date, name: 'demo thử tháng đã chốt' } });
      try {
        expect(res.status()).toBeGreaterThanOrEqual(400);
        expect(res.status()).toBeLessThan(500);
      } finally {
        if (res.ok()) await request.delete(`/api/v2/holidays/${date}`, { headers: json, data: {} });
      }
    });
  });
});

// ---------------------------------------------------------------- Ngày lễ: /admin/cai-dat/lich

const holidaysOf = (request: APIRequestContext, year: number) =>
  apiAs(request, ADMIN, async () => ((await (await request.get(`/api/v2/holidays?year=${year}`)).json()).items as { date: string; name: string }[]));

async function openCalendar(page: Page, year: number) {
  await signIn(page, ADMIN);
  await page.goto('/admin/cai-dat/lich');
  const shown = page.locator('button[aria-label="Năm trước"] + b');
  await expect(shown).toHaveText(/^\d{4}$/);
  for (let i = 0; i < 6 && Number(await shown.textContent()) !== year; i++) {
    await page.getByRole('button', { name: Number(await shown.textContent()) < year ? 'Năm sau' : 'Năm trước' }).click();
  }
  await expect(shown).toHaveText(String(year));
  await expect(page.getByText(`Năm ${year} ·`)).toBeVisible();
}

test('năm có ngày lễ seed: số ngày lễ và các ô ngày lễ khớp /holidays', async ({ page, request }) => {
  const check = guard(page);
  const year = Number(plan.holiday.date.slice(0, 4));
  const items = await holidaysOf(request, year);
  expect(items.map(h => h.date)).toContain(plan.holiday.date);
  await openCalendar(page, year);
  await expect(page.getByText(`${items.length} ngày lễ`, { exact: true })).toBeVisible();
  const d = plan.holiday.date;
  await expect(page.getByRole('button', { name: `Bỏ ngày lễ ${d.slice(8, 10)}/${d.slice(5, 7)}` })).toBeVisible();
  check();
});

test.describe('ngày lễ năm xa (không ai dùng): thêm, bỏ qua giao diện', () => {
  test.describe.configure({ mode: 'serial' });
  const year = Number(today.slice(0, 4)) + 3;
  const FIXED = ['01-01', '04-30', '05-01', '09-02'].map(md => `${year}-${md}`);

  test.afterAll(async ({ request }) => {
    await apiAs(request, ADMIN, async () => {
      for (const h of await holidaysOf(request, year)) await request.delete(`/api/v2/holidays/${h.date}`, { headers: json, data: {} });
    });
  });

  test('"Thêm các ngày lễ cố định": thêm đủ 4 ngày; bấm lần nữa báo đã có đủ, không thêm trùng', async ({ page, request }) => {
    const check = guard(page);
    expect(await holidaysOf(request, year)).toEqual([]);
    await openCalendar(page, year);
    await page.getByRole('button', { name: `Thêm các ngày lễ cố định ${year}` }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã thêm 4 ngày lễ cố định.' })).toBeVisible();
    expect((await holidaysOf(request, year)).map(h => h.date).sort()).toEqual(FIXED);
    await expect(page.getByText('4 ngày lễ', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Thêm các ngày lễ cố định ${year}` }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Các ngày lễ cố định đã có đủ.' })).toBeVisible();
    expect(await holidaysOf(request, year)).toHaveLength(4);
    check();
  });

  test('nút ✕ của một ngày lễ: bỏ đúng ngày đó', async ({ page, request }) => {
    const check = guard(page);
    await openCalendar(page, year);
    await page.getByRole('button', { name: 'Bỏ ngày lễ 02/09' }).click();
    await expect(page.getByRole('button', { name: 'Bỏ ngày lễ 02/09' })).toHaveCount(0);
    expect((await holidaysOf(request, year)).map(h => h.date).sort()).toEqual(FIXED.slice(0, 3));
    check();
  });

  test('hộp "Thêm ngày lễ": nút thêm khoá tới khi có ngày và tên; thêm hai ngày liền nhau rồi bỏ cả khoảng', async ({ page, request }) => {
    const check = guard(page);
    await openCalendar(page, year);
    await page.getByRole('button', { name: 'Thêm ngày lễ', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const submit = dialog.getByRole('button', { name: 'Thêm ngày lễ' });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Từ ngày').fill(`07/01/${year}`);
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Đến ngày').fill(`06/01/${year}`);
    await dialog.getByLabel('Tên ngày lễ').fill('Nghỉ demo chấm công');
    await expect(submit, 'đến ngày trước từ ngày: chưa cho thêm').toBeDisabled();
    await dialog.getByLabel('Đến ngày').fill(`08/01/${year}`);
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog).toHaveCount(0);
    const added = (await holidaysOf(request, year)).filter(h => h.name === 'Nghỉ demo chấm công').map(h => h.date);
    expect(added.sort()).toEqual([`${year}-01-07`, `${year}-01-08`]);
    await page.getByRole('button', { name: 'Bỏ ngày lễ 07/01 – 08/01' }).click();
    await expect(page.getByRole('button', { name: 'Bỏ ngày lễ 07/01 – 08/01' })).toHaveCount(0);
    expect((await holidaysOf(request, year)).filter(h => h.name === 'Nghỉ demo chấm công')).toEqual([]);
    check();
  });

  test('bấm vào ngày đã là ngày lễ trên lịch năm: không mở hộp thêm trùng ngày', async ({ page }) => {
    test.fail(true, 'BUG-attendance-15: bấm ngày đã là ngày lễ vẫn mở "Thêm ngày lễ" điền sẵn ngày đó, bấm thêm thì BE báo lỗi trùng');
    await openCalendar(page, year);
    await page.getByRole('button', { name: 'Ngày 1 tháng 1', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test('API ngày lễ: dữ liệu sai bị từ chối bằng 4xx, không 500', async ({ request }) => {
  const year = Number(today.slice(0, 4)) + 4;
  await apiAs(request, ADMIN, async () => {
    const statuses: Record<string, number> = {};
    statuses['ngày sai'] = (await request.post('/api/v2/holidays', { headers: json, data: { date: `${year}-02-30`, name: 'x' } })).status();
    statuses['thiếu tên'] = (await request.post('/api/v2/holidays', { headers: json, data: { date: `${year}-03-03`, name: '' } })).status();
    statuses['năm sai'] = (await request.get('/api/v2/holidays?year=abc')).status();
    statuses['thêm cố định năm sai'] = (await request.post('/api/v2/holidays/quick-add', { headers: json, data: { year: 'abc' } })).status();
    statuses['bỏ ngày không có'] = (await request.delete(`/api/v2/holidays/${year}-03-04`, { headers: json, data: {} })).status();
    const first = await request.post('/api/v2/holidays', { headers: json, data: { date: `${year}-03-05`, name: 'demo trùng' } });
    try {
      expect(first.ok(), 'ngày lễ hợp lệ thêm được').toBe(true);
      statuses['thêm trùng ngày'] = (await request.post('/api/v2/holidays', { headers: json, data: { date: `${year}-03-05`, name: 'demo trùng' } })).status();
    } finally {
      await request.delete(`/api/v2/holidays/${year}-03-05`, { headers: json, data: {} });
    }
    for (const [k, s] of Object.entries(statuses)) {
      expect(s, k).toBeGreaterThanOrEqual(400);
      expect(s, k).toBeLessThan(500);
    }
    expect(await holidaysOf(request, year)).toEqual([]);
  });
});
