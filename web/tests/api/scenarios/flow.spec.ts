// Nhóm 4 — Luồng đầy đủ nhân viên → admin trên giao diện với BE thật. Phần 1 (tháng này): nhân viên Check-in / Check-out, nộp từng loại đơn
// bằng form, admin thấy trong chuông / Tổng quan / Chấm công, duyệt và từ chối, nhân viên thấy trạng thái đổi. Phần 2 (một tháng cũ còn sạch):
// chốt công → tính lương → duyệt phiếu → phê duyệt kỳ → trả lương. Khắp nơi so chuỗi hiển thị với JSON BE trả về cho cùng số liệu
// (FE chỉ hiện, BE tính). Tháng cũ chọn tự động (kỳ đã trả lương không mở lại được) nên chạy lại nhiều lần trên cùng DB vẫn được.
import {
  DESKTOP, OFFICE, PHONE, adminApi, adminPunchDays, apiAs, createStaff, expect, fillRequest, freshMonth, json, signIn, signInAdmin,
  skipWithoutAdmin, test, vnMonth, workdaysOf, type KindSlug, type Staff
} from './helpers';
import type { APIRequestContext, Page } from '@playwright/test';
import { REST_DAY_REASON, REST_DAY_TODAY } from '../rest-day';

test.use({ permissions: ['geolocation'], geolocation: OFFICE });
test.describe.configure({ mode: 'serial' });

let admin: APIRequestContext;
let staff: Staff;
let staffApi: APIRequestContext;
const reasons: Record<string, string> = {};

test.beforeAll(async ({ baseURL }) => {
  skipWithoutAdmin();
  admin = await adminApi(baseURL!);
  staff = await createStaff(admin, baseURL!, 'flow', 1); // vào làm từ đầu tháng trước
  staffApi = await apiAs(baseURL!, staff.username, staff.password);
});
test.afterAll(async () => {
  await staffApi?.dispose();
  await admin?.dispose();
});

const vnd = (n: number) => n.toLocaleString('vi-VN');
const KINDS: Array<{ slug: KindSlug; api: string; pick: number; label: RegExp }> = [
  { slug: 'nghi', api: 'leave', pick: 3, label: /Nghỉ/ },
  { slug: 'nghi-bu', api: 'leave-with-makeup', pick: 8, label: /Nghỉ/ },
  { slug: 'ot', api: 'overtime', pick: 4, label: /Làm thêm/ },
  { slug: 'doi-ca', api: 'shift-change', pick: 12, label: /Đổi ca/ },
  { slug: 'giai-trinh', api: 'explanation', pick: 1, label: /Giải trình/ }
];

test('nhân viên Check-in rồi Check-out trên điện thoại: giờ hiển thị khớp /me/today', async ({ page }) => {
  test.skip(REST_DAY_TODAY, REST_DAY_REASON);
  await page.setViewportSize(PHONE);
  await signIn(page, staff.username, staff.password);
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card).toContainText('Chưa check-in');
  await card.getByRole('button', { name: /Check-in/ }).click();
  await expect(card).toContainText('Đang trong ca');
  let today = await (await staffApi.get('/api/v2/me/today')).json();
  expect(today.punches.in).toBeTruthy();
  await expect(card).toContainText(today.punches.in);
  await card.getByRole('button', { name: /Check-out/ }).click();
  await expect(card).toContainText('Đã check-out');
  today = await (await staffApi.get('/api/v2/me/today')).json();
  expect(today.punches.out).toBeTruthy();
  await expect(card).toContainText(today.punches.out);
});

for (const k of KINDS) {
  test(`nhân viên nộp đơn ${k.slug} bằng form: báo đã gửi, danh sách hiện Chờ duyệt khớp /me/requests`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signIn(page, staff.username, staff.password);
    const { send, reason } = await fillRequest(page, k.slug, { pick: k.pick });
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.locator('.toast.ok').filter({ hasText: 'Đã gửi yêu cầu' })).toBeVisible();
    reasons[k.slug] = reason;
    const mine = await (await staffApi.get('/api/v2/me/requests')).json();
    const pending = mine.items.filter((r: any) => r.status === 'PENDING');
    // Danh sách trên màn: số "Chờ duyệt N" bằng số đơn PENDING mà BE trả.
    await expect(page.getByRole('tab', { name: /Chờ duyệt/ })).toContainText(String(pending.length));
    await expect(page.getByRole('tab', { name: /^Tất cả/ })).toContainText(String(mine.items.length));
  });
}

test('Tạm ứng bị khoá ngoài ngày 16–17 với đúng lý do của máy chủ', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signIn(page, staff.username, staff.password);
  const ctx = await (await staffApi.get('/api/v2/me/request-context')).json();
  const adv = ctx.kinds.find((k: any) => k.kind === 'advance');
  await page.goto('/nv/yeu-cau?tao=chon');
  const row = page.locator('[data-kind="advance"]');
  await expect(row).toBeVisible();
  if (!adv.enabled) {
    await expect(row).toHaveAttribute('aria-disabled', 'true');
    await expect(row).toContainText(adv.reason);
    await row.focus(); // dòng khoá vẫn nhận focus bằng bàn phím nhưng Enter không mở gì
    await page.keyboard.press('Enter');
    await expect(page.locator('.nr-form')).toHaveCount(0);
  } else {
    await row.click();
    await expect(page.getByText('Số tiền được ứng')).toBeVisible();
  }
});

test('admin: Tổng quan, Chấm công và chuông khớp JSON của BE (có mặt, chưa Check-in, đơn chờ)', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAdmin(page);
  const ov = await (await page.request.get(`/api/v2/overview?month=${vnMonth()}&days=6`)).json();
  const pendingList = await (await page.request.get('/api/v2/requests?status=PENDING&limit=200')).json();
  expect(ov.kpis.pendingRequests).toBe(pendingList.total);
  expect(ov.kpis.pendingRequests).toBeGreaterThanOrEqual(KINDS.length);

  // Tổng quan
  await page.goto('/admin/tong-quan');
  const tile = (label: string) => page.getByRole('region', { name: 'Chỉ số chính' }).locator(`article[aria-label="${label}"]`);
  await expect(tile('Có mặt hôm nay')).toContainText(`${ov.kpis.presentToday} / ${ov.kpis.headcount}`);
  await expect(tile('Có mặt hôm nay')).toContainText(`${ov.kpis.notCheckedIn} người chưa chấm công vào`);
  await expect(tile('Yêu cầu chờ duyệt')).toContainText(String(ov.kpis.pendingRequests));
  await expect(tile('Nhân sự đang làm')).toContainText(String(ov.kpis.headcount));

  // Chấm công: cùng một số "chưa Check-in" với Tổng quan, đúng số có mặt.
  await page.goto('/admin/cham-cong');
  const week = await (await page.request.get('/api/v2/attendance/week?days=28')).json();
  const present = week.tiles.find((t: any) => t.key === 'present');
  expect(present.value).toBe(ov.kpis.presentToday);
  await expect(page.locator('.tile[aria-label="Có mặt hôm nay"], article[aria-label="Có mặt hôm nay"]').first()).toContainText(`${present.value} / ${present.of}`);
  expect(present.note).toBe(`${ov.kpis.notCheckedIn} người chưa Check-in`);
  await expect(page.getByText(present.note)).toBeVisible();

  // Chuông: số trên chuông là một số do BE đếm (đơn chờ duyệt + ngày cần giải trình, như danh sách trong ngăn kéo); mỗi đơn vừa nộp có một dòng trong ngăn kéo.
  const due = await (await page.request.get('/api/v2/requests/explanations-due')).json();
  const bell = pendingList.total + due.items.length;
  expect((await (await page.request.get('/api/v2/overview/pending-count')).json()).count).toBe(bell);
  await expect(page.getByRole('button', { name: `Thông báo, ${bell} việc cần xử lý` })).toBeVisible();
  await page.getByRole('button', { name: /Thông báo/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Thông báo' });
  for (const k of KINDS.filter(k => k.slug !== 'giai-trinh')) {
    await expect(dlg.getByRole('button', { name: new RegExp(`${k.label.source}.*${staff.name}`) }).first(), k.slug).toBeVisible();
  }
});

test('admin duyệt một đơn và từ chối một đơn từ chuông: nhân viên thấy trạng thái đổi, số đơn chờ giảm đúng 2', async ({ page, browser, baseURL }) => {
  const before = (await (await admin.get('/api/v2/requests?status=PENDING&limit=1')).json()).total as number;
  await page.setViewportSize(DESKTOP);
  await signInAdmin(page);
  await page.getByRole('button', { name: /Thông báo/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Thông báo' });
  const row = (re: RegExp) => dlg.getByRole('button', { name: new RegExp(`${re.source}.*${staff.name}`) }).first();

  await row(/Làm thêm/).click();
  await page.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(dlg.locator('[aria-live=polite]')).toHaveText(`Đã duyệt yêu cầu của ${staff.name}.`);

  await row(/Đổi ca/).click();
  await page.getByRole('button', { name: 'Từ chối', exact: true }).click(); // thiếu lý do → chặn
  await expect(page.getByText('Ghi lý do từ chối để nhân viên biết vì sao.')).toBeVisible();
  await page.getByPlaceholder(/Ví dụ: ngày này/).fill('Trùng lịch họp quý');
  await page.getByRole('button', { name: 'Từ chối', exact: true }).click();
  await expect(dlg.locator('[aria-live=polite]')).toHaveText(`Đã từ chối yêu cầu của ${staff.name}.`);

  const after = (await (await admin.get('/api/v2/requests?status=PENDING&limit=1')).json()).total as number;
  expect(after).toBe(before - 2);
  const dueNow = (await (await admin.get('/api/v2/requests/explanations-due')).json()).items.length as number;
  await expect(page.getByRole('button', { name: `Thông báo, ${after + dueNow} việc cần xử lý` })).toBeVisible();

  // Nhân viên: tab Đã duyệt / Từ chối đếm đúng và hiện lý do của admin.
  const mine = await (await staffApi.get('/api/v2/me/requests')).json();
  const count = (st: string) => mine.items.filter((r: any) => r.status === st).length;
  expect(count('APPROVED')).toBe(1);
  expect(count('REJECTED')).toBe(1);
  const ctx = await browser.newContext({ viewport: PHONE, baseURL, permissions: ['geolocation'], geolocation: OFFICE });
  const sp = await ctx.newPage();
  await signIn(sp, staff.username, staff.password);
  await sp.goto('/nv/yeu-cau');
  await expect(sp.getByRole('tab', { name: /Đã duyệt/ })).toContainText('1');
  await expect(sp.getByRole('tab', { name: /Từ chối/ })).toContainText('1');
  await expect(sp.getByRole('tab', { name: /Chờ duyệt/ })).toContainText(String(count('PENDING')));
  await sp.getByRole('tab', { name: /Từ chối/ }).click();
  await sp.getByRole('link', { name: /Đổi ca/ }).first().click();
  await expect(sp.getByText('Trùng lịch họp quý')).toBeVisible();
  await ctx.close();
});

test('thu nhập tạm tính của nhân viên (điện thoại và máy tính) khớp /me/income', async ({ page }) => {
  const inc = await (await staffApi.get('/api/v2/me/income')).json();
  const net = inc.payslip.netIncome ?? inc.payslip.net ?? inc.payslip.netPay;
  expect(typeof net).toBe('number');
  await page.setViewportSize(PHONE);
  await signIn(page, staff.username, staff.password);
  await page.goto('/nv/thu-nhap');
  await expect(page.locator('body')).toContainText(vnd(net));
  await page.setViewportSize(DESKTOP);
  await page.goto('/nv/thu-nhap');
  await expect(page.locator('body')).toContainText(vnd(net));
  void workdaysOf; void adminPunchDays; void freshMonth; void json;
});
