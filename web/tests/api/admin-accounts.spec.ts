// Nhân sự và tài khoản của Admin trên BE thật (playwright.api.config.ts): thêm nhân sự từ /admin/nhan-su, "Tạo tài khoản" ở
// Phân quyền › Tài khoản (BUG-staff-5), đổi vai trò Nhân viên ↔ Admin có tác dụng thật (BUG-staff-8), ô vai trò của chính
// mình bị khoá. Tài khoản admin lấy từ PW_ADMIN_USER / PW_ADMIN_PASS. Mỗi lần chạy tạo hai nhân sự mới (tên có mã lần
// chạy), nên chỉ chạy trên DB thử.
import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from '@playwright/test';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
const RUN = `R${Date.now().toString().slice(-6)}`; // một từ, viết hoa sẵn: BE giữ nguyên khi chuẩn hoá họ tên
const json = { 'Content-Type': 'application/json' };

const HAI = { name: `Phan Thị Hai ${RUN}`, username: `phan-thi-hai-${RUN.toLowerCase()}`, password: 'Hai@2026' };
const TAM = { name: `Lê Văn Tâm ${RUN}`, username: `le-van-tam-${RUN.toLowerCase()}`, password: 'Tam@2026' };
const ADMIN_LABEL = 'Quản trị viên (Admin)';
const STAFF_LABEL = 'Nhân viên (Staff)';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
});

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(username);
  await page.locator('#lg-pass').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/dang-nhap/);
}

// Phiên API riêng của một người (không dùng chung cookie với trang Admin).
async function sessionOf(baseURL: string, username: string, password: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  const res = await ctx.post('/api/v2/auth/login', { headers: json, data: { username, password } });
  expect(res.ok(), `đăng nhập ${username}: ${await res.text()}`).toBeTruthy();
  return ctx;
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Thêm nhân sự' });
const field = (page: Page, label: string) => dialog(page).getByLabel(label, { exact: true });

async function fillNewStaff(page: Page, who: { name: string; username: string; password: string }) {
  await field(page, 'Họ tên').fill(who.name);
  await expect(field(page, 'Tên đăng nhập')).toHaveValue(who.username);
  await field(page, 'Mật khẩu ban đầu').fill(who.password);
  await field(page, 'Chức danh').fill('Kế toán viên');
  await field(page, 'Loại nhân sự').selectOption({ label: 'Nhân viên' });
  await field(page, 'Bậc').selectOption({ label: 'Bậc 2 · Chuyên viên' });
  await field(page, 'Trạng thái').selectOption({ label: 'Thử việc' });
  await field(page, 'Ngày sinh').fill('02/04/1998');
}

async function openAccounts(page: Page, q: string) {
  await page.goto('/admin/cai-dat/phan-quyen/tai-khoan');
  await page.getByRole('textbox', { name: 'Tìm tên' }).fill(q);
}

test('Admin adds a person from Nhân sự; BE keeps the form and the person can sign in as staff', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await expect(page).toHaveURL(/\/admin\//);
  await page.goto('/admin/nhan-su');
  await page.getByRole('button', { name: 'Thêm nhân sự' }).click();
  await field(page, 'Tên đăng nhập').fill(ADMIN_USER);
  await expect(dialog(page).getByText(`Tên đăng nhập ${ADMIN_USER} đã có người dùng.`)).toBeVisible();
  await field(page, 'Tên đăng nhập').fill('');
  await fillNewStaff(page, HAI);
  await dialog(page).getByRole('button', { name: 'Tạo nhân sự' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByText(`Đã thêm ${HAI.name} (${HAI.username})`)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bảng danh sách nhân sự' }).getByText(HAI.name)).toBeVisible();

  const { employee } = await (await page.request.get(`/api/v2/employees/${HAI.username}`)).json();
  expect(employee.profile).toMatchObject({ familyName: 'Phan Thị Hai', givenName: RUN, fullName: HAI.name, birthday: '1998-04-02' });
  expect(employee.account.roles).toEqual(['staff']);
  expect(employee.contract).toMatchObject({ status: 'thuviec', position: { type: 'nv', level: 2, jobTitle: 'Kế toán viên' } });
  expect(employee.contract.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  const hai = await sessionOf(baseURL!, HAI.username, HAI.password);
  const me = await (await hai.get('/api/v2/auth/me')).json();
  expect(me.user.role).toBe('staff');
  expect(me.caps).toEqual([]);
  await hai.dispose();
});

test('Tạo tài khoản opens the same form and the new account shows up as Nhân viên', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await openAccounts(page, RUN);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/cai-dat\/phan-quyen\/tai-khoan\?hop=them-nhan-su$/);
  await fillNewStaff(page, TAM);
  await dialog(page).getByRole('button', { name: 'Tạo nhân sự' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByText(`Đã thêm ${TAM.name} (${TAM.username})`)).toBeVisible();
  await expect(page.getByRole('combobox', { name: `Vai trò của ${TAM.name}` })).toHaveValue(STAFF_LABEL);
});

test('changing a role from Tài khoản moves the person between staff and Admin rights', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await openAccounts(page, HAI.name);
  const role = page.getByRole('combobox', { name: `Vai trò của ${HAI.name}` });
  const hai = await sessionOf(baseURL!, HAI.username, HAI.password);
  try {
    await role.selectOption({ label: ADMIN_LABEL });
    await expect(page.getByText(`Đã đổi vai trò của ${HAI.name} thành ${ADMIN_LABEL}`)).toBeVisible();
    let me = await (await hai.get('/api/v2/auth/me')).json();
    expect(me.user.role).toBe('admin');
    expect(me.caps).toContain('staff.manage');
    expect((await hai.get('/api/v2/employees')).status()).toBe(200);

    await page.reload();
    await page.getByRole('textbox', { name: 'Tìm tên' }).fill(HAI.name);
    await expect(role).toHaveValue(ADMIN_LABEL);

    await role.selectOption({ label: STAFF_LABEL });
    await expect(page.getByText(`Đã đổi vai trò của ${HAI.name} thành ${STAFF_LABEL}`)).toBeVisible();
    me = await (await hai.get('/api/v2/auth/me')).json();
    expect(me.user.role).toBe('staff');
    expect(me.caps).toEqual([]);
    expect((await hai.get('/api/v2/employees')).status()).toBe(403);
    await page.reload();
    await page.getByRole('textbox', { name: 'Tìm tên' }).fill(HAI.name);
    await expect(role).toHaveValue(STAFF_LABEL);
  } finally {
    await hai.dispose();
  }
});

test('the role of the signed-in Admin cannot be changed from its own row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  const { user } = await (await page.request.get('/api/v2/auth/me')).json();
  await openAccounts(page, user.name);
  await expect(page.getByRole('combobox', { name: `Vai trò của ${user.name}` })).toBeDisabled();
});

test('the role picker offers only Admin and Nhân viên', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await openAccounts(page, HAI.name);
  await expect(page.getByRole('combobox', { name: `Vai trò của ${HAI.name}` }).locator('option')).toHaveText([ADMIN_LABEL, STAFF_LABEL]);
});
