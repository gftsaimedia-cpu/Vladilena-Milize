// Màn Chấm công của Admin trên BE thật (/admin/cham-cong, các đường dẫn cũ, /admin/cham-cong/nhan-vien/:id): cùng một ngày,
// cùng một con số thì giống app nhân viên (/me/attendance). Người và ngày lấy từ scripts/demo/people/attendance.ts.
// Chạy qua `npm run demo -- test attendance`. Tài liệu và danh sách lỗi: docs/demo-db/attendance.md.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, apiAs, demoMonths, demoReadyFor, personNamed, signIn } from './fixtures/demo';
import { attendancePlan, type DayCase } from '../../../scripts/demo/people/attendance';

test.skip(!demoReadyFor('attendance'), 'Chạy qua npm run demo -- test attendance');

const plan = attendancePlan(demoMonths());
const { m0, m1, today } = plan.months;
const CORE = 'phiên attendance-core đang làm (spec 2026-11-05-attendance-core-design.md)';
const fullName = (u: string) => `${personNamed(u).familyName} ${personNamed(u).givenName}`;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const plannedDay = (who: string, c: DayCase) => plan.days.find(d => d.username === who && d.case === c)!.date;
/**
 * Người có ngày công trong tháng trước (bỏ hai người chỉ chấm hôm nay và người của tháng m3). Bỏ cả cc-nghi-viec: Admin ẩn
 * người đã nghỉ việc ở mọi tháng ("Không tìm thấy nhân viên này."), còn có hiện ở tháng họ còn làm hay không là câu hỏi Q3.
 */
const M1_PEOPLE = [...new Set(plan.days.filter(d => d.date.startsWith(m1)).map(d => d.username))].filter(u => u !== 'cc-nghi-viec');

/** (b) không lỗi console, không lỗi JS, không route /api trả 5xx trong lúc test. */
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

async function myMonth(request: APIRequestContext, username: string, month: string): Promise<any> {
  return apiAs(request, username, async () => {
    const res = await request.get(`/api/v2/me/attendance?month=${month}`);
    expect(res.status(), `/me/attendance ${username} ${month}`).toBe(200);
    return res.json();
  });
}
const dayIn = (m: any, date: string) => m.days.find((d: any) => d.date === date);

/** Nhãn của ô ngày trong lưới tuần: "<tên>, <thứ> dd/mm: <trạng thái>[, giờ]". */
async function gridCell(page: Page, username: string, date: string): Promise<string> {
  const re = new RegExp(`^${fullName(username)}, [^,]+ ${ddmm(date)}: `);
  const grid = page.getByRole('region', { name: 'Lưới chấm công' });
  await expect(grid.locator('td [aria-label]').first()).toBeAttached();
  const all = await grid.locator('td [aria-label]').evaluateAll(els => els.map(e => e.getAttribute('aria-label') || ''));
  const hit = all.find(a => re.test(a));
  expect(hit, `ô ${username} ${date} trong lưới`).toBeTruthy();
  return hit!;
}

const statValue = (page: Page, label: string) => page.getByRole('article', { name: label }).locator('.sv');

test('các đường dẫn cũ của Chấm công chuyển về màn tuần, màn tuần mở không lỗi', async ({ page }) => {
  const check = guard(page);
  await signIn(page, ADMIN);
  for (const [from, path, query] of [
    ['/admin/cham-cong/hom-nay', '/admin/cham-cong', ''],
    ['/admin/cham-cong/bang-cong', '/admin/cham-cong', ''],
    ['/admin/cham-cong/phep-con-lai', '/admin/cham-cong', ''],
    ['/admin/cham-cong/sua-gio', '/admin/cham-cong', 'xem=can-xu-ly'],
    ['/admin/cham-cong/gio-ot', '/admin/cham-cong', 'xem=can-xu-ly'],
    ['/admin/cham-cong/ca-lam', '/admin/nhan-su', 'loc=chua-co-ca']
  ]) {
    await page.goto(from);
    await expect(page, from).toHaveURL(new RegExp(`${path}(\\?.*)?$`));
    if (query) expect(new URL(page.url()).search, from).toContain(query);
  }
  await page.goto('/admin/cham-cong');
  await expect(page.getByRole('heading', { level: 1, name: 'Chấm công' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lưới chấm công' })).toBeVisible();
  check();
});

test('lưới tuần: ngày đã qua của người đúng giờ và người trễ giống app nhân viên', async ({ page, request }) => {
  const check = guard(page);
  const onTime = plan.days.filter(d => d.username === 'cc-dung-gio' && d.date >= plan.lastWeekTuesday && d.date < today).map(d => d.date);
  expect(onTime.length).toBeGreaterThan(0);
  await signIn(page, ADMIN);
  await page.goto('/admin/cham-cong');
  for (const [who, date] of [...onTime.map(d => ['cc-dung-gio', d] as const), ['cc-tre', plan.lastWeekTuesday] as const]) {
    const me = dayIn(await myMonth(request, who, date.slice(0, 7)), date);
    const label = await gridCell(page, who, date);
    const kind = me.kind === 'late' ? 'Đi muộn' : 'Đi làm';
    expect(label, `${who} ${date}`).toContain(`${kind}, ${me.in}–${me.out}`);
  }
  check();
});

test('lưới tuần: cột "Công kỳ" bằng số ngày công nhân viên thấy trong tháng này', async ({ page, request }) => {
  const check = guard(page);
  await signIn(page, ADMIN);
  await page.goto('/admin/cham-cong');
  for (const who of ['cc-dung-gio', 'cc-tre', 'cc-giua-thang', 'cc-thieu']) {
    const me = await myMonth(request, who, m0);
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: fullName(who), exact: true }) });
    await expect(row.locator('td.s1'), who).toHaveText(String(me.totals.workDays));
  }
  check();
});

test('hôm nay chưa chấm: Admin và app nhân viên cho cùng trạng thái', async ({ page, request }) => {
  test.fail(true, `BUG-attendance-8: Admin hiện "Chưa Check-in", app nhân viên hiện "vắng" cho cùng ngày hôm nay — ${CORE}`);
  const check = guard(page);
  await signIn(page, ADMIN);
  await page.goto('/admin/cham-cong');
  const admin = await gridCell(page, 'cc-dem', today);
  expect(admin).toContain('Chưa Check-in');
  const me = dayIn(await myMonth(request, 'cc-dem', m0), today);
  expect(me.kind, 'app nhân viên cũng chưa coi là vắng').not.toBe('absent');
  check();
});

for (const who of M1_PEOPLE) {
  test(`hồ sơ chấm công tháng trước của ${who}: "Ngày đi làm" bằng số ngày công nhân viên thấy`, async ({ page, request }) => {
    const check = guard(page);
    const me = await myMonth(request, who, m1);
    await signIn(page, ADMIN);
    await page.goto(`/admin/cham-cong/nhan-vien/${who}?thang=${m1}`);
    await expect(page.getByRole('heading', { level: 2, name: fullName(who) })).toBeVisible();
    await expect(statValue(page, 'Ngày đi làm')).toHaveText(String(me.totals.workDays));
    check();
  });
}

test('hồ sơ chấm công: "Lần đi muộn" bằng số lần đi muộn nhân viên thấy (người có cả ngày về sớm)', async ({ page, request }) => {
  test.fail(true, 'BUG-attendance-9: Admin chỉ đếm ngày vào trễ, app nhân viên đếm cả ngày về sớm');
  const me = await myMonth(request, 'cc-tre', m1);
  await signIn(page, ADMIN);
  await page.goto(`/admin/cham-cong/nhan-vien/cc-tre?thang=${m1}`);
  await expect(statValue(page, 'Lần đi muộn')).toHaveText(String(me.totals.lateCount));
});

test('hồ sơ chấm công: "Lần đi muộn" bằng app nhân viên khi chỉ có ngày vào trễ', async ({ page, request }) => {
  // cc-dung-gio không trễ ngày nào; cc-giua-thang cũng vậy: hai bên cùng 0.
  for (const who of ['cc-dung-gio', 'cc-giua-thang']) {
    const me = await myMonth(request, who, m1);
    if (!page.url().includes('/admin')) await signIn(page, ADMIN);
    await page.goto(`/admin/cham-cong/nhan-vien/${who}?thang=${m1}`);
    await expect(statValue(page, 'Lần đi muộn'), who).toHaveText(String(me.totals.lateCount));
  }
});

test('hồ sơ chấm công, "Bảng giờ": giờ vào, giờ ra từng ngày giống app nhân viên', async ({ page, request }) => {
  const check = guard(page);
  const cases: DayCase[] = ['late-16', 'late-40', 'early-out-30', 'late-early', 'late-out-45'];
  const me = await myMonth(request, 'cc-tre', m1);
  await signIn(page, ADMIN);
  await page.goto(`/admin/cham-cong/nhan-vien/cc-tre?thang=${m1}`);
  await page.getByRole('tab', { name: 'Bảng giờ' }).click();
  const table = page.getByRole('table', { name: 'Bảng giờ' });
  for (const c of cases) {
    const date = plannedDay('cc-tre', c);
    const d = dayIn(me, date);
    const row = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(` ${ddmm(date)}$`) }) });
    await expect(row.getByRole('cell').nth(0), `${c} vào`).toHaveText(d.in);
    await expect(row.getByRole('cell').nth(1), `${c} ra`).toHaveText(d.out);
  }
  check();
});

test('hồ sơ chấm công ca Night: ngày có giờ ra sáng hôm sau hiện đủ giờ vào, giờ ra như app nhân viên', async ({ page, request }) => {
  const check = guard(page);
  const date = plannedDay('cc-dem', 'on-time');
  const d = dayIn(await myMonth(request, 'cc-dem', m1), date);
  await signIn(page, ADMIN);
  await page.goto(`/admin/cham-cong/nhan-vien/cc-dem?thang=${m1}`);
  await page.getByRole('tab', { name: 'Bảng giờ' }).click();
  const row = page.getByRole('table', { name: 'Bảng giờ' }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(` ${ddmm(date)}$`) }) });
  await expect(row.getByRole('cell').nth(0)).toHaveText(d.in);
  await expect(row.getByRole('cell').nth(1)).toHaveText(d.out);
  check();
});

test('hộp chi tiết ngày (bấm một ngày trên dải tháng) cho cùng giờ và trạng thái như app nhân viên', async ({ page, request }) => {
  const check = guard(page);
  const date = plannedDay('cc-tre', 'late-40');
  const d = dayIn(await myMonth(request, 'cc-tre', m1), date);
  await signIn(page, ADMIN);
  await page.goto(`/admin/cham-cong/nhan-vien/cc-tre?thang=${m1}`);
  await page.locator(`.ms-i[data-date="${date}"]`).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const value = (k: string) => dialog.locator('.dd-r').filter({ has: page.locator('dt', { hasText: k }) }).locator('dd');
  await expect(value('Trạng thái')).toHaveText('Đi muộn');
  await expect(value('Giờ vào')).toHaveText(d.in);
  await expect(value('Giờ ra')).toHaveText(d.out);
  check();
});

test('hồ sơ chấm công: ngày lễ công ty hiện là nghỉ lễ, không phải vắng', async ({ page }) => {
  test.fail(true, `BUG-attendance-5: lịch lễ công ty không vào bảng công, ngày lễ hiện "Vắng" — ${CORE}`);
  await signIn(page, ADMIN);
  await page.goto(`/admin/cham-cong/nhan-vien/cc-dung-gio?thang=${m1}`);
  await expect(page.locator(`.ms-i[data-date="${plan.holiday.date}"]`)).toHaveAttribute('aria-label', /Nghỉ lễ/);
});
