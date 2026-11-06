// Bước kỳ lương trên BE thật (playwright.api.config.ts): Chốt công → Tính lương cả kỳ → duyệt phiếu → Phê duyệt kỳ, rồi lùi về.
// Dùng tháng cách đây 2 tháng (staff-app.spec.ts đã dùng tháng trước) và trả kỳ về "Đang chấm công" khi xong, để chạy lại được.
// Thanh kỳ và các nút bấm bằng giao diện; việc duyệt từng phiếu làm qua API cho rẻ. Nếu DB thử có người cần phiếu mà không
// tính được (ví dụ tài khoản admin không có hợp đồng) thì Phê duyệt kỳ vẫn khoá: test kiểm đúng nhánh khoá thay vì ép duyệt.
// Lưu ý: tính lương cả kỳ ({}) bỏ qua người thiếu cấu hình lương; tài khoản admin (loại 'ql') của DB thử không có bậc lương, nên
// thường vẫn "chưa có phiếu" và nhánh phê duyệt thật không chạy; khi DB có đủ cấu hình thì nhánh đó chạy.
// Tài khoản admin lấy từ PW_ADMIN_USER / PW_ADMIN_PASS; chỉ chạy trên DB thử.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
const json = { 'Content-Type': 'application/json' };
const vnMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
const addMonth = (ym: string, n: number) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
const MONTH = addMonth(vnMonth(), -2);
const base = `/api/v2/system/periods/${MONTH}`;

const strip = (page: Page) => page.locator('.period');
const approveBtn = (page: Page) => page.getByRole('button', { name: 'Phê duyệt kỳ lương' });

async function view(request: APIRequestContext) {
  const res = await request.get(base);
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

// Đưa kỳ về "open" bằng các bước lùi của BE (huỷ phê duyệt, mở lại công), để test chạy lại được sau lần chạy dở.
async function reopen(request: APIRequestContext) {
  let v = await view(request);
  if (v.status === 'approved') v = await (await request.post(`${base}/unapprove`, { headers: json, data: { reason: 'pw-reset' } })).json();
  if (v.status === 'calculated' || v.status === 'attendance_locked') await request.post(`${base}/unlock`, { headers: json, data: { reason: 'pw-reset' } });
  expect((await view(request)).status).toBe('open');
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page, request }) => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
  await page.setViewportSize({ width: 1440, height: 900 });
  const login = await request.post('/api/v2/auth/login', { headers: json, data: { username: ADMIN_USER, password: ADMIN_PASS } });
  expect(login.ok(), 'đăng nhập admin').toBeTruthy();
  await reopen(request);
});

test.afterEach(async ({ request }) => {
  if (ADMIN_PASS) await reopen(request).catch(() => {});
});

test('lock, calculate, approve slips, then approve the period (or see why it is locked)', async ({ page, request }) => {
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(ADMIN_USER);
  await page.locator('#lg-pass').fill(ADMIN_PASS);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/dang-nhap/);
  await page.goto(`/admin/bang-luong?thang=${MONTH}`);

  // Đang chấm công: chỉ có Chốt công, chưa có nút phê duyệt.
  await expect(strip(page)).toContainText('Đang chấm công');
  await expect(approveBtn(page)).toHaveCount(0);
  page.once('dialog', d => d.accept());
  await strip(page).getByRole('button', { name: 'Chốt công' }).click();
  await expect(strip(page)).toContainText('Đang chấm KPI');
  await expect(strip(page).getByRole('button', { name: 'Mở lại công' })).toBeVisible();

  // Tính lương cả kỳ: kỳ sang "calculated", nút Phê duyệt hiện nhưng còn khoá vì phiếu chưa duyệt.
  // Tháng chưa có phiếu: nút "Tính lương" trên tiêu đề. Đã có bảng (lần chạy trước để lại): "Tính lại cả kỳ" rồi xác nhận.
  // (Tính lại vài phiếu qua chế độ chọn là lần chạy riêng phần, BE không chuyển kỳ sang Đã tính.)
  const whole = page.locator('.title').getByRole('button', { name: 'Tính lương' });
  if (await whole.count()) await whole.click();
  else {
    await page.locator('.title').getByRole('button', { name: 'Tính lại cả kỳ' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Tính lại cả kỳ' }).click();
  }
  await expect(strip(page)).toContainText('Chờ phê duyệt');
  await expect(approveBtn(page)).toBeDisabled();
  await expect(page.locator('.title .why')).toContainText('phiếu chưa duyệt');
  const blocked = await request.post(`${base}/approve`, { headers: json, data: {} });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).code).toBe('PERIOD_BLOCKED');

  // Duyệt mọi phiếu của kỳ; màn đọc lại kỳ thì số phiếu chưa duyệt về 0.
  const { items } = await (await request.get(`/api/v2/payroll/${MONTH}`)).json();
  for (const it of items) {
    const ok = await request.post(`/api/v2/payroll/${MONTH}/${it.username}/decision`, { headers: json, data: { decision: 'approve' } });
    expect(ok.ok(), await ok.text()).toBeTruthy();
  }
  await page.reload();
  const now = await view(request);
  expect(now.actions.approve.blockers.unapprovedSlips).toBe(0);

  if (!now.actions.approve.enabled) {
    // Còn vướng ngoài phiếu (người chưa có phiếu, đơn chờ duyệt): nút khoá và nói đúng lý do của máy chủ.
    await expect(approveBtn(page)).toBeDisabled();
    await expect(page.locator('.title .why')).toHaveText(now.actions.approve.reason);
    return;
  }
  await approveBtn(page).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Phê duyệt kỳ lương' }).click();
  await expect(strip(page)).toContainText('Chờ trả lương');
  await expect(page.getByRole('button', { name: 'Tính lại lương' })).toHaveCount(0);
  expect((await view(request)).status).toBe('approved');
  // Tháng này đã quá ngày trả lương nên nút "Đã trả lương" hiện; không bấm vì kỳ đã trả không mở lại được (không dọn được DB thử).
  await expect(strip(page).getByRole('button', { name: 'Đã trả lương' })).toBeVisible();

  // Huỷ phê duyệt bắt buộc ghi lý do.
  await strip(page).getByRole('button', { name: 'Huỷ phê duyệt' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByRole('button', { name: 'Huỷ phê duyệt' })).toBeDisabled();
  await dlg.getByLabel(/Lý do/).fill('Sửa điểm KPI');
  await dlg.getByRole('button', { name: 'Huỷ phê duyệt' }).click();
  await expect(strip(page)).toContainText('Chờ phê duyệt');
  expect((await view(request)).status).toBe('calculated');
});

test('a 409 from the server shows its Vietnamese message', async ({ page, request }) => {
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(ADMIN_USER);
  await page.locator('#lg-pass').fill(ADMIN_PASS);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/dang-nhap/);
  await page.goto(`/admin/bang-luong?thang=${MONTH}`);
  await expect(strip(page).getByRole('button', { name: 'Chốt công' })).toBeVisible();
  // Kỳ đã chốt từ nơi khác trong lúc trang còn hiện nút Chốt công: bấm thì máy chủ trả 409.
  await request.post(`${base}/lock`, { headers: json, data: {} });
  page.once('dialog', d => d.accept());
  await strip(page).getByRole('button', { name: 'Chốt công' }).click();
  await expect(page.locator('.toast, [role="alert"], [role="status"]').filter({ hasText: /không làm được thao tác này/ })).toBeVisible();
  await expect(strip(page).getByRole('button', { name: 'Mở lại công' })).toBeVisible();
});
