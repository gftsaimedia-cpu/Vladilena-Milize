// Đơn từ trên màn Admin với BE thật: Tổng quan (thẻ số, thẻ Việc cần duyệt, cửa sổ duyệt), chuông, tab Cần xử lý của
// Chấm công, và hai địa chỉ cũ /admin/yeu-cau*. Chạy qua `npm run demo -- test requests`; bảng tình huống ở
// docs/demo-db/requests.md. Con số kỳ vọng đọc từ API lúc chạy (các mảng khác cũng thêm người), không viết cứng.
// Test duyệt và từ chối chỉ đụng bốn đơn chờ của dt-quan.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, apiAs, demoMonths, demoReadyFor, signIn } from './fixtures/demo';

test.skip(!demoReadyFor('requests'), 'Chạy qua npm run demo -- test requests');

const json = { 'Content-Type': 'application/json' };
const M = demoMonths();

type Req = { id: string; employeeId: string; type: string; status: string; reviewNote: string | null };
type Employee = { profile: { uuid?: string; fullName: string }; account: { username: string }; contract: { status: string; resignedOn?: string | null } };

/** Lỗi console và lỗi trang trong lúc test; gọi hàm trả về ở cuối test để kiểm. */
function watchConsole(page: Page, allow: RegExp[] = []) {
  const errors: string[] = [];
  page.on('console', m => {
    if (m.type() === 'error' && !allow.some(a => a.test(m.text()))) errors.push(m.text());
  });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return () => expect(errors, 'lỗi console').toEqual([]);
}

async function get<T = any>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(`/api/v2${path}`, { headers: json });
  expect(res.status(), `GET ${path}`).toBe(200);
  return res.json();
}

/** Dữ liệu Admin đọc qua API: đơn chờ, nhân sự, họ tên theo username và uuid. */
async function adminData(request: APIRequestContext) {
  return apiAs(request, ADMIN, async () => {
    const pending: Req[] = (await get(request, '/requests?status=PENDING&limit=1000')).items;
    const employees: Employee[] = (await get(request, '/employees')).employees;
    const nameOf = new Map<string, string>();
    for (const e of employees) {
      nameOf.set(e.account.username, e.profile.fullName);
      if (e.profile.uuid) nameOf.set(e.profile.uuid, e.profile.fullName);
    }
    return { pending, employees, nameOf };
  });
}

const requestsOf = (request: APIRequestContext, username: string): Promise<Req[]> =>
  apiAs(request, ADMIN, async () => (await get(request, `/requests?employeeId=${username}&limit=500`)).items);
const statusOf = (request: APIRequestContext, id: string): Promise<Req> =>
  apiAs(request, ADMIN, async () => (await get(request, `/requests/${id}`)).request);
const pendingOfQuan = async (request: APIRequestContext, type: string): Promise<Req> => {
  const hit = (await requestsOf(request, 'dt-quan')).find(r => r.type === type && r.status === 'PENDING');
  expect(hit, `đơn ${type} chờ duyệt của dt-quan`).toBeTruthy();
  return hit!;
};
/** Trạng thái đơn `id` như nhân viên `username` thấy qua /me. */
const staffSees = (request: APIRequestContext, username: string, id: string): Promise<string> =>
  apiAs(request, username, async () => (await get(request, `/me/requests/${id}`)).request.status);

const bellButton = (page: Page) => page.getByRole('button', { name: /^Thông báo, \d+ việc cần xử lý$/ });

test('the old request addresses open Tổng quan and keep the month', async ({ page }) => {
  const consoleOk = watchConsole(page);
  await signIn(page, ADMIN);
  for (const path of ['/admin/yeu-cau', '/admin/yeu-cau/moi-thang']) {
    await page.goto(`${path}?thang=${M.m1}`);
    await expect(page).toHaveURL(new RegExp(`/admin/tong-quan\\?thang=${M.m1}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();
  }
  consoleOk();
});

test('Tổng quan request numbers match the pending queue', async ({ page, request }) => {
  const consoleOk = watchConsole(page);
  const { pending } = await adminData(request);
  const n = pending.length;
  expect(n, 'có đơn chờ đã seed').toBeGreaterThan(0);
  await signIn(page, ADMIN);
  await page.goto('/admin/tong-quan');
  await expect(page.getByText(`Còn ${n} việc`)).toBeVisible();
  await expect(page.getByRole('article', { name: 'Yêu cầu chờ duyệt' }).locator('.kpi-v')).toHaveText(String(n));
  const card = page.locator('section.ap');
  await expect(card.locator('.count')).toHaveText(String(n));
  await expect(card.locator('li.ap-row')).toHaveCount(n);
  // Tổng các nhóm của thẻ bằng số đơn chờ.
  const groupCounts = await card.locator('h3.apg .gn').allTextContents();
  expect(groupCounts.reduce((sum, t) => sum + Number(t), 0)).toBe(n);
  await expect(bellButton(page)).toHaveAccessibleName(`Thông báo, ${n} việc cần xử lý`);
  consoleOk();
});

test('Tổng quan staff, attendance and payroll cards agree with each other and the APIs', async ({ page, request }) => {
  const consoleOk = watchConsole(page);
  const { employees } = await adminData(request);
  // Cách màn tính "đang làm": hồ sơ không ở trạng thái nghỉ việc.
  const active = employees.filter(e => e.contract.status !== 'nghiviec');
  const ids = new Set(active.flatMap(e => [e.profile.uuid, e.account.username].filter(Boolean) as string[]));
  const { timesheets, payslips } = await apiAs(request, ADMIN, async () => ({
    timesheets: (await get(request, `/attendance/timesheets?startDate=${M.today}&endDate=${M.today}`)).timesheets ?? [],
    payslips: (await get(request, `/payroll/${M.m0}`)).items ?? []
  }));
  const present = new Set(timesheets.filter((t: any) => t.workDate === M.today && t.actualCheckIn && ids.has(t.employeeId)).map((t: any) => t.employeeId)).size;

  await signIn(page, ADMIN);
  await page.goto('/admin/tong-quan');
  await expect(page.getByRole('article', { name: 'Nhân sự đang làm' }).locator('.kpi-v')).toHaveText(String(active.length));
  const presentCard = page.getByRole('article', { name: 'Có mặt hôm nay' });
  await expect(presentCard.locator('.kpi-v')).toHaveText(`${present} / ${active.length}`);
  await expect(page.locator('section.at .sub')).toHaveText(`có mặt hôm nay · ${present} / ${active.length}`);
  const fund = page.getByRole('article', { name: `Quỹ lương tháng ${Number(M.m0.slice(5, 7))}` });
  await expect(fund.locator('.kpi-n')).toHaveText(payslips.length ? `${payslips.length} phiếu lương` : 'chưa tính lương');
  consoleOk();
});

test('Nhân sự đang làm does not count a resigned employee', async ({ page, request }) => {
  const { employees } = await adminData(request);
  const working = employees.filter(e => !e.contract.resignedOn || e.contract.resignedOn > M.today).length;
  await signIn(page, ADMIN);
  await page.goto('/admin/tong-quan');
  await expect(page.getByRole('article', { name: 'Nhân sự đang làm' }).locator('.kpi-v')).toHaveText(String(working));
});

test('the bell lists exactly the pending requests, each under the employee name', async ({ page, request }) => {
  const consoleOk = watchConsole(page);
  const { pending, nameOf } = await adminData(request);
  await signIn(page, ADMIN);
  await page.goto('/admin/tong-quan?hop=chuong');
  const drawer = page.getByRole('dialog', { name: 'Thông báo' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: `Cần duyệt ${pending.length}` })).toBeVisible();
  const rows = drawer.locator('.bd-row');
  await expect(rows).toHaveCount(pending.length);
  // (c) Đơn đã duyệt, từ chối hay huỷ không được hiện ra để duyệt: chuông có đúng các đơn đang chờ.
  expect((await rows.evaluateAll(els => els.map(e => e.getAttribute('data-id')))).sort()).toEqual(pending.map(r => r.id).sort());
  for (const r of pending) {
    const name = nameOf.get(r.employeeId);
    expect(name, `họ tên của ${r.employeeId}`).toBeTruthy();
    await expect(drawer.locator(`.bd-row[data-id="${r.id}"]`)).toHaveAttribute('aria-label', new RegExp(`, ${name}`));
  }
  consoleOk();
});

test('approving from the Tổng quan card updates the bell and the employee app', async ({ page, request }) => {
  const consoleOk = watchConsole(page);
  const leave = await pendingOfQuan(request, 'LEAVE');
  const before = (await adminData(request)).pending.length;
  await signIn(page, ADMIN);
  await page.goto('/admin/tong-quan');
  const row = page.locator('section.ap li.ap-row').filter({ hasText: 'Tạ Văn Quân' }).filter({ hasText: 'Việc riêng có lương' });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Duyệt yêu cầu của Tạ Văn Quân' }).click();
  await expect(page.getByText('Đã duyệt yêu cầu của Tạ Văn Quân.')).toBeVisible();
  await expect(bellButton(page)).toHaveAccessibleName(`Thông báo, ${before - 1} việc cần xử lý`);
  await expect(page.locator('section.ap .count')).toHaveText(String(before - 1));
  expect((await statusOf(request, leave.id)).status).toBe('APPROVED');
  expect(await staffSees(request, 'dt-quan', leave.id)).toBe('APPROVED');
  consoleOk();
});

test('rejecting from the bell needs a note, and the employee sees the rejection', async ({ page, request }) => {
  const consoleOk = watchConsole(page);
  const ot = await pendingOfQuan(request, 'OVERTIME');
  const before = (await adminData(request)).pending.length;
  const note = 'Tối đó không có quản lý trực, em đăng ký hôm khác nhé';
  await signIn(page, ADMIN);
  await page.goto('/admin/tong-quan?hop=chuong');
  await page.locator(`.bd-row[data-id="${ot.id}"]`).click();
  const detail = page.getByRole('dialog', { name: 'Chi tiết yêu cầu' });
  await expect(detail.getByText('Làm thêm · 2 giờ')).toBeVisible();
  await detail.getByRole('button', { name: 'Từ chối', exact: true }).click();
  await expect(detail.getByRole('alert')).toBeVisible();
  expect((await statusOf(request, ot.id)).status, 'chưa ghi chú thì chưa từ chối').toBe('PENDING');
  await detail.getByLabel('Ghi chú cho nhân viên').fill(note);
  await detail.getByRole('button', { name: 'Từ chối', exact: true }).click();
  await expect(page.locator(`.bd-row[data-id="${ot.id}"]`)).toHaveCount(0);
  await expect(bellButton(page)).toHaveAccessibleName(`Thông báo, ${before - 1} việc cần xử lý`);
  const after = await statusOf(request, ot.id);
  expect(after.status).toBe('REJECTED');
  expect(after.reviewNote).toBe(note);
  expect(await staffSees(request, 'dt-quan', ot.id)).toBe('REJECTED');
  consoleOk();
});

test('the approval dialog shows the request and approves it', async ({ page, request }) => {
  const consoleOk = watchConsole(page);
  const change = await pendingOfQuan(request, 'SHIFT_CHANGE');
  await signIn(page, ADMIN);
  await page.goto('/admin/tong-quan');
  const row = page.locator('section.ap li.ap-row').filter({ hasText: 'Tạ Văn Quân' }).filter({ hasText: 'Đổi ca' });
  await row.locator('button.apo').click();
  const dialog = page.getByRole('dialog', { name: 'Duyệt yêu cầu' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Tạ Văn Quân' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Đổi ca' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Đã duyệt yêu cầu của Tạ Văn Quân.')).toBeVisible();
  expect((await statusOf(request, change.id)).status).toBe('APPROVED');
  expect(await staffSees(request, 'dt-quan', change.id)).toBe('APPROVED');
  consoleOk();
});

test('Chấm công › Cần xử lý lists every pending request that has days', async ({ page, request }) => {
  test.fail(true, 'BUG-requests-9: tab Cần xử lý luôn trống: builders/api/attendance.ts khoá người theo username, đơn chờ mang employeeId là uuid');
  const consoleOk = watchConsole(page);
  const { pending, employees } = await adminData(request);
  const active = new Set(employees.filter(e => e.contract.status !== 'nghiviec').flatMap(e => [e.profile.uuid, e.account.username]));
  const withDays = pending.filter(r => r.type !== 'ADVANCE' && active.has(r.employeeId));
  await signIn(page, ADMIN);
  await page.goto('/admin/cham-cong?xem=can-xu-ly');
  await expect(page.locator('#att-tab-pending .badge')).toHaveText(String(withDays.length));
  await expect(page.locator('.pend .pr')).toHaveCount(withDays.length);
  consoleOk();
});

test('approving an explanation from Chấm công › Cần xử lý', async ({ page, request }) => {
  test.fail(true, 'BUG-requests-9: tab Cần xử lý luôn trống: builders/api/attendance.ts khoá người theo username, đơn chờ mang employeeId là uuid');
  const consoleOk = watchConsole(page);
  const explanation = await pendingOfQuan(request, 'EXPLANATION');
  await signIn(page, ADMIN);
  await page.goto('/admin/cham-cong?xem=can-xu-ly');
  await page.locator(`.pend .pr[data-id="${explanation.id}"]`).click({ timeout: 5000 });
  const pane = page.getByRole('region', { name: 'Chi tiết việc đang chọn' });
  await pane.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(page.locator(`.pend .pr[data-id="${explanation.id}"]`)).toHaveCount(0);
  expect((await statusOf(request, explanation.id)).status).toBe('APPROVED');
  expect(await staffSees(request, 'dt-quan', explanation.id)).toBe('APPROVED');
  consoleOk();
});
