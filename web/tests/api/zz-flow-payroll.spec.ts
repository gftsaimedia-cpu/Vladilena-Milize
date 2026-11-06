// Tên bắt đầu bằng zz- để Playwright chạy file này CUỐI CÙNG: trả lương một tháng cũ làm mốc "tháng đang mở" của Cài đặt (minMonth) nhảy sang tháng sau
// nó, mà settings.spec.ts / staff-app.spec.ts mặc định tháng hiện tại.
// Nhóm 4 (phần lương) — chốt công → tính lương → duyệt phiếu → phê duyệt kỳ → trả lương bằng giao diện, so mọi con số hiện trên màn với JSON của BE
// (tổng thu nhập, thực nhận, khấu trừ, số phiếu đã duyệt, dòng của nhân viên, thu nhập chính thức bên nhân viên). Kỳ chọn tự động là một tháng cũ còn sạch
// vì kỳ đã trả lương không mở lại được; chạy lại nhiều lần trên cùng DB vẫn được.
import { DESKTOP, PHONE, OFFICE, adminApi, adminPunchDays, apiAs, createStaff, expect, freshMonth, json, signIn, signInAdmin, skipWithoutAdmin, test, vnMonth, workdaysOf, type Staff } from './scenarios/helpers';
import type { APIRequestContext } from '@playwright/test';
import { moneyText } from '../../src/utils/format';

test.use({ permissions: ['geolocation'], geolocation: OFFICE });
test.describe.configure({ mode: 'serial' });

let admin: APIRequestContext;
let staff: Staff;
let PM = '';
let monthsBack = 0;

const vnd = (n: number) => n.toLocaleString('vi-VN');
// Tổng tiền hiện theo đơn vị tự chọn của FE (tỷ / triệu / đồng) tuỳ độ lớn; dùng đúng hàm hiện của app để so với số BE.
const ty = (n: number) => moneyText(n);
const strip = (page: import('@playwright/test').Page) => page.locator('.period');

test.beforeAll(async ({ baseURL }) => {
  skipWithoutAdmin();
  admin = await adminApi(baseURL!);
  PM = await freshMonth(admin);
  const now = vnMonth();
  monthsBack = (Number(now.slice(0, 4)) - Number(PM.slice(0, 4))) * 12 + Number(now.slice(5, 7)) - Number(PM.slice(5, 7));
  staff = await createStaff(admin, baseURL!, 'payf', monthsBack);
  await adminPunchDays(admin, staff.id, workdaysOf(PM, 4));
});
test.afterAll(async () => {
  await admin?.dispose();
});

test('kỳ lương trọn vòng trên giao diện, số hiển thị khớp BE từng bước', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESKTOP);
  await signInAdmin(page);
  await page.goto(`/admin/bang-luong?thang=${PM}`);
  await expect(strip(page)).toContainText('Đang chấm công');

  // Chốt công → Tính lương
  page.once('dialog', d => d.accept());
  await strip(page).getByRole('button', { name: 'Chốt công' }).click();
  await expect(strip(page)).toContainText('Đang chấm KPI');
  await page.getByRole('button', { name: /^Tính( lại| lương)$/ }).click();
  await expect(strip(page)).toContainText('Chờ phê duyệt');

  // Số trên bảng = số của BE
  const list = await (await admin.get(`/api/v2/payroll/${PM}`)).json();
  const mine = list.items.find((i: any) => i.username === staff.username);
  expect(mine, 'phiếu của nhân viên thử').toBeTruthy();
  expect(mine.details.actualWorkDays).toBe(4);
  await page.reload();
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: staff.name }) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(`${mine.details.actualWorkDays} / ${mine.details.standardWorkdays}`);
  await expect(row).toContainText(vnd(mine.net));
  await expect(row).toContainText(vnd(mine.insurance));
  await expect(row).toContainText('Nháp');
  const tile = (label: string) => page.locator('.tile, article, section').filter({ hasText: label });
  await expect(page.getByText(ty(list.totals.net)).first()).toBeVisible();
  await expect(page.getByText(ty(list.totals.gross)).first()).toBeVisible();
  await expect(page.getByText(`0 / ${list.items.length}`, { exact: true }).first()).toBeVisible(); // Phiếu đã duyệt
  void tile;

  // Duyệt phiếu của nhân viên thử bằng ngăn kéo, các phiếu khác bằng API.
  await row.getByRole('link', { name: staff.name }).click();
  const drawer = page.getByRole('dialog', { name: `Phiếu lương của ${staff.name}` });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(vnd(mine.net));
  await drawer.getByRole('button', { name: 'Duyệt phiếu' }).click();
  await expect(drawer.locator('.pd-status')).toContainText(`Đã duyệt phiếu lương của ${staff.name}`);
  await page.keyboard.press('Escape');
  for (const it of list.items.filter((i: any) => i.username !== staff.username)) {
    const ok = await admin.post(`/api/v2/payroll/${PM}/${it.username}/decision`, { headers: json, data: { decision: 'approve' } });
    expect(ok.ok(), await ok.text()).toBeTruthy();
  }
  await page.reload();
  await expect(page.getByText(`${list.items.length} / ${list.items.length}`).first()).toBeVisible();

  // Phê duyệt kỳ
  const view = await (await admin.get(`/api/v2/system/periods/${PM}`)).json();
  const approve = page.getByRole('button', { name: 'Phê duyệt kỳ lương' });
  expect(view.actions.approve.enabled, JSON.stringify(view.actions.approve)).toBe(true);
  await approve.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Phê duyệt kỳ lương' }).click();
  await expect(strip(page)).toContainText('Chờ trả lương');
  expect((await (await admin.get(`/api/v2/system/periods/${PM}`)).json()).status).toBe('approved');

  // Nhân viên thấy phiếu CHÍNH THỨC với đúng số của BE
  const own = await apiAs(baseURL!, staff.username, staff.password);
  const inc = await (await own.get(`/api/v2/me/income?month=${PM}`)).json();
  expect(inc.state).toBe('official');
  const sp = await page.context().browser()!.newContext({ viewport: PHONE, baseURL: baseURL!, permissions: ['geolocation'], geolocation: OFFICE });
  const staffPage = await sp.newPage();
  await signIn(staffPage, staff.username, staff.password);
  await staffPage.goto('/nv/thu-nhap');
  const label = `Tháng ${Number(PM.slice(5, 7))}/${PM.slice(0, 4)}`;
  for (let i = 0; i < 12 && !(await staffPage.locator('body').innerText()).includes(label); i++) {
    await staffPage.getByRole('button', { name: /Tháng trước/ }).first().click();
    await staffPage.waitForTimeout(250);
  }
  await expect(staffPage.locator('body')).toContainText(vnd(inc.payslip.netIncome ?? inc.payslip.net));
  await sp.close();
  await own.dispose();

  // Trả lương
  await strip(page).getByRole('button', { name: 'Đã trả lương' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Đã trả lương' }).click();
  await expect.poll(async () => (await (await admin.get(`/api/v2/system/periods/${PM}`)).json()).status, { timeout: 5000 }).toBe('paid');
  await expect(strip(page)).toContainText(/Đã trả lương/);
  await expect(page.getByRole('button', { name: /Huỷ phê duyệt|Tính lại/ })).toHaveCount(0);
});
