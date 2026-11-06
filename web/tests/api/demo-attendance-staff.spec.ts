// App nhân viên trên BE thật: Check-in, Check-out hôm nay (/nv/hom-nay, điện thoại và máy tính ≥ 1136px) và màn Chấm công
// (/nv/cham-cong). /me/punches dùng giờ thật nên chỉ thử được hôm nay; ngày đã qua do seed chấm hộ (scripts/demo/areas/attendance.ts).
// Chạy qua `npm run demo -- test attendance`. Tài liệu và danh sách lỗi: docs/demo-db/attendance.md.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, addMonths, apiAs, demoMonths, demoReadyFor, personNamed, signIn } from './fixtures/demo';
import { attendancePlan } from '../../../scripts/demo/people/attendance';

test.skip(!demoReadyFor('attendance'), 'Chạy qua npm run demo -- test attendance');

const plan = attendancePlan(demoMonths());
const { m0, m1, today } = plan.months;
const PHONE = { width: 390, height: 844 };
const json = { 'Content-Type': 'application/json' };
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fullName = (u: string) => `${personNamed(u).familyName} ${personNamed(u).givenName}`;
const monthLabel = (ym: string) => `Tháng ${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`;
const isSunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
const late40 = plan.days.find(d => d.username === 'cc-tre' && d.case === 'late-40' && d.date.startsWith(m1))!.date;

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

/** Nhãn ô hôm nay của `username` trên lưới tuần Admin (đăng nhập Admin trong một trang riêng). */
async function adminTodayCell(page: Page, username: string): Promise<string> {
  const admin = await page.context().browser()!.newPage();
  try {
    await signIn(admin, ADMIN);
    await admin.goto('/admin/cham-cong');
    const grid = admin.getByRole('region', { name: 'Lưới chấm công' });
    await expect(grid.locator('td [aria-label]').first()).toBeAttached();
    const labels = await grid.locator('td [aria-label]').evaluateAll(els => els.map(e => e.getAttribute('aria-label') || ''));
    const hit = labels.find(l => l.startsWith(`${fullName(username)}, `) && l.includes(` ${ddmm(today)}: `));
    expect(hit, `ô hôm nay của ${username}`).toBeTruthy();
    return hit!;
  } finally {
    await admin.close();
  }
}

const myToday = async (page: Page) => (await (await page.request.get('/api/v2/me/today')).json()) as any;
const punch = (page: Page, kind: 'IN' | 'OUT') => page.request.post('/api/v2/me/punches', { headers: json, data: { kind } });

test.describe('điện thoại: check-in và check-out hôm nay', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(isSunday, 'Chủ nhật: luật chặn check-in ngoài tuần làm việc (D14, settings-store) chưa vào main nên không thử');
  test.use({ viewport: PHONE });

  test('chưa check-in: thẻ ca chỉ có nút Check-in', async ({ page }) => {
    const check = guard(page);
    await signIn(page, 'cc-hom-nay');
    const card = page.getByRole('region', { name: 'Ca hôm nay' });
    await expect(card).toContainText('Chưa check-in');
    await expect(card.getByRole('button', { name: /Check-in/ })).toBeEnabled();
    await expect(card.getByRole('button', { name: /Check-out/ })).toHaveCount(0);
    check();
  });

  test('check-in: thẻ ca "Đang trong ca", không còn nút Check-in; giờ vào giống ô hôm nay trên lưới Admin', async ({ page }) => {
    const check = guard(page);
    await signIn(page, 'cc-hom-nay');
    const card = page.getByRole('region', { name: 'Ca hôm nay' });
    await card.getByRole('button', { name: /Check-in/ }).click();
    await expect(card).toContainText('Đang trong ca');
    await expect(card.getByRole('button', { name: /Check-in/ })).toHaveCount(0);
    await expect(card.getByRole('button', { name: /Check-out/ })).toBeEnabled();
    const t = await myToday(page);
    expect(t.punches.in).toMatch(/^\d{2}:\d{2}$/);
    await expect(card).toContainText(`vào ${t.punches.in}`);
    const cell = await adminTodayCell(page, 'cc-hom-nay');
    expect(cell).toContain(`${t.punches.in}–…`);
    expect(cell).toContain('đang làm');
    check();
  });

  test('đã check-in: BE từ chối check-in lần nữa và giữ giờ vào cũ', async ({ page }) => {
    test.fail(true, 'BUG-attendance-12: POST /me/punches nhận thêm lần check-in khi đã check-in (luật: một lần vào, một lần ra mỗi ngày)');
    await signIn(page, 'cc-hom-nay');
    const before = (await myToday(page)).punches.in;
    const res = await punch(page, 'IN');
    expect((await myToday(page)).punches.in, 'giờ vào không đổi').toBe(before);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('check-out: thẻ ca "Đã check-out", không còn nút chấm nào', async ({ page }) => {
    const check = guard(page);
    await signIn(page, 'cc-hom-nay');
    const card = page.getByRole('region', { name: 'Ca hôm nay' });
    await card.getByRole('button', { name: /Check-out/ }).click();
    await expect(card).toContainText('Đã check-out');
    await expect(card.getByRole('button')).toHaveCount(0);
    const t = await myToday(page);
    expect(t.punches.out).toMatch(/^\d{2}:\d{2}$/);
    const cell = await adminTodayCell(page, 'cc-hom-nay');
    expect(cell).toContain(`${t.punches.in}–${t.punches.out}`);
    check();
  });

  test('đã check-out: BE từ chối check-in lại (ra giữa ca rồi vào lại không được phép)', async ({ page }) => {
    test.fail(true, 'BUG-attendance-12: POST /me/punches nhận check-in sau khi đã check-out (luật 04/11: ra giữa ca rồi vào lại không được phép)');
    await signIn(page, 'cc-hom-nay');
    const res = await punch(page, 'IN');
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('máy tính (≥ 1136px): check-in và check-out hôm nay', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(isSunday, 'Chủ nhật: luật chặn check-in ngoài tuần làm việc (D14, settings-store) chưa vào main nên không thử');
  test.use({ viewport: { width: 1280, height: 800 } });

  test('cột Hôm nay: Check-in rồi Check-out, mỗi lúc chỉ có đúng một nút; "Gần đây" hiện giờ của hôm nay', async ({ page }) => {
    const check = guard(page);
    await signIn(page, 'cc-may-tinh');
    const card = page.getByRole('region', { name: 'Ca hôm nay' });
    await expect(card.getByRole('button')).toHaveCount(1);
    await card.getByRole('button', { name: /Check-in/ }).click();
    await expect(card).toContainText('Đang trong ca');
    await expect(card.getByRole('button')).toHaveCount(1);
    await card.getByRole('button', { name: /Check-out/ }).click();
    await expect(card).toContainText('Đã check-out');
    await expect(card.getByRole('button')).toHaveCount(0);
    const t = await myToday(page);
    const recent = page.getByRole('button', { name: new RegExp(`${ddmm(today)} ${t.punches.in} – ${t.punches.out}, `) });
    await expect(recent).toBeVisible();
    check();
  });
});

// ---------------------------------------------------------------- màn Chấm công của nhân viên

/** Lùi từ tháng này tới `ym`: mỗi lần bấm "Tháng trước" chờ nhãn tháng mới hiện rồi mới bấm tiếp (bấm lúc đang tải sẽ lùi quá). */
async function toMonth(page: Page, ym: string) {
  await expect(page.getByText(monthLabel(m0), { exact: true })).toBeVisible();
  for (let cur = m0; cur > ym; ) {
    cur = addMonths(cur, -1);
    await page.getByRole('button', { name: 'Tháng trước' }).click();
    await expect(page.getByText(monthLabel(cur), { exact: true })).toBeVisible();
  }
}

async function lateMinutesAdmin(request: APIRequestContext, username: string, date: string): Promise<number> {
  return apiAs(request, ADMIN, async () => {
    const { employee } = await (await request.get(`/api/v2/employees/${username}`)).json();
    const { timesheet } = await (await request.get(`/api/v2/attendance/timesheets/${employee.profile.uuid}/${date}`)).json();
    return timesheet.metrics.lateMinutes;
  });
}

test('điện thoại, Chấm công tháng trước: ngày trễ 40 phút hiện "đi muộn"; hộp ngày cho cùng giờ và số phút trễ như Admin', async ({ page, request }) => {
  const check = guard(page);
  const late = await lateMinutesAdmin(request, 'cc-tre', late40);
  await page.setViewportSize(PHONE);
  await signIn(page, 'cc-tre');
  await page.goto('/nv/cham-cong');
  await toMonth(page, m1);
  const cell = page.locator(`button.dn[data-date="${late40}"]`);
  await expect(cell).toHaveAttribute('aria-label', new RegExp(`${ddmm(late40)}: đi muộn$`));
  await cell.click();
  await expect(page).toHaveURL(new RegExp(`ngay=${late40}`));
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Giờ vào08:40');
  await expect(sheet).toContainText('Giờ ra17:00');
  await expect(sheet).toContainText(`Đi muộn${late} phút`);
  check();
});

test('máy tính, ?ngay= của ngày trễ mở ngăn kéo với cùng giờ và số phút trễ như Admin', async ({ page, request }) => {
  const check = guard(page);
  const late = await lateMinutesAdmin(request, 'cc-tre', late40);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'cc-tre');
  await page.goto(`/nv/cham-cong?ngay=${late40}`);
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('Giờ vào08:40');
  await expect(drawer).toContainText(`Đi muộn${late} phút`);
  check();
});

test('điện thoại: lịch tháng ca Night hiện ngày có giờ ra sáng hôm sau là "đi làm"', async ({ page }) => {
  const check = guard(page);
  const date = plan.days.find(d => d.username === 'cc-dem' && d.case === 'on-time' && d.date.startsWith(m1))!.date;
  await page.setViewportSize(PHONE);
  await signIn(page, 'cc-dem');
  await page.goto('/nv/cham-cong');
  await toMonth(page, m1);
  await expect(page.locator(`button.dn[data-date="${date}"]`)).toHaveAttribute('aria-label', new RegExp(`${ddmm(date)}: đi làm$`));
  await page.locator(`button.dn[data-date="${date}"]`).click();
  await expect(page.getByRole('dialog')).toContainText('Giờ vào21:55');
  await expect(page.getByRole('dialog')).toContainText('Giờ ra07:00');
  check();
});

test('lịch tháng và ô số: tên cho trình đọc màn hình ghi đúng tháng đang xem', async ({ page }) => {
  test.fail(true, 'BUG-attendance-17: MonthCalendar.vue và MonthTiles.vue viết cứng aria-label "Lịch tháng 10", "Chỉ số tháng 10"');
  await page.setViewportSize(PHONE);
  await signIn(page, 'cc-dung-gio');
  await page.goto('/nv/cham-cong');
  for (const ym of [m0, m1]) {
    if (ym === m1) await toMonth(page, m1);
    const n = Number(ym.slice(5, 7));
    await expect(page.getByText(monthLabel(ym), { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: `Lịch tháng ${n}`, exact: true }), monthLabel(ym)).toBeVisible();
    await expect(page.getByRole('group', { name: `Chỉ số tháng ${n}`, exact: true }), monthLabel(ym)).toBeVisible();
  }
});

test('thực tập sinh: dòng ca trên màn Chấm công ghi tuần thứ Hai – thứ Sáu', async ({ page }) => {
  test.fail(true, 'BUG-attendance-7: dòng ca của app nhân viên viết cứng "thứ Hai – thứ Bảy" cho mọi loại nhân sự');
  await page.setViewportSize(PHONE);
  await signIn(page, 'cc-tts');
  await page.goto('/nv/cham-cong');
  await expect(page.getByText(/^Ca .* · thứ Hai – thứ Sáu$/)).toBeVisible();
});

test('tháng này: số "Ngày công" trên màn nhân viên đúng bằng số ngày đã đi làm đủ giờ vào và ra', async ({ page }) => {
  const check = guard(page);
  const worked = plan.days.filter(d => d.username === 'cc-dung-gio' && d.date.startsWith(m0) && d.date < today).length;
  await page.setViewportSize(PHONE);
  await signIn(page, 'cc-dung-gio');
  await page.goto('/nv/cham-cong');
  const tile = page.locator('.at-tile').filter({ hasText: 'Ngày công' }).locator('b');
  await expect(tile).toHaveText(new RegExp(`^${worked} / \\d+$`));
  check();
});
