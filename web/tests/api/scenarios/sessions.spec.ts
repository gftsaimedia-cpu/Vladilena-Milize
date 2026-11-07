// Nhóm 1 — Phiên: hết hạn, bị khoá, bị đăng xuất ở nơi khác giữa chừng; đăng nhập sai nhiều lần; chặn chéo khu Admin / nhân viên.
// Mọi màn phải về đăng nhập với câu báo rõ ràng, không treo, không còn dữ liệu cũ của phiên trước.
import { ADMIN_PASS, ADMIN_USER, DESKTOP, OFFICE, PHONE, adminApi, apiAs, createStaff, expect, expectAtLogin, json, signIn, resetPassword, setLocked, signInAdmin, skipWithoutAdmin, test, type Staff } from './helpers';
import { REST_DAY_REASON, REST_DAY_TODAY } from '../rest-day';
import type { APIRequestContext } from '@playwright/test';

test.use({ permissions: ['geolocation'], geolocation: OFFICE });

let admin: APIRequestContext;
test.beforeAll(async ({ baseURL }) => {
  skipWithoutAdmin();
  admin = await adminApi(baseURL!);
});
test.afterAll(async () => {
  await admin?.dispose();
});

const EXPIRED = /Phiên đăng nhập đã hết hạn/;

test.describe('phiên hết hạn giữa chừng', () => {
  test('staff phone: cookie bị xoá → bấm sang tab khác về đăng nhập, có thông báo, không còn dữ liệu cũ', async ({ page, baseURL, context }) => {
    const s = await createStaff(admin, baseURL!, 'phsess');
    await page.setViewportSize(PHONE);
    await signIn(page, s.username, s.password);
    await expect(page.locator('.home .name')).toHaveText(s.name);
    await context.clearCookies();
    await page.getByRole('link', { name: /Thu nhập/ }).first().click();
    await expectAtLogin(page);
    await expect(page).toHaveURL(/tiep=%2Fnv%2Fthu-nhap|tiep=\/nv\/thu-nhap/);
    await expect(page.getByText(EXPIRED)).toBeVisible();
    await expect(page.getByText(s.name)).toHaveCount(0);
    // Đăng nhập lại thì quay về đúng chỗ đang dở.
    await page.locator('#lg-user').fill(s.username);
    await page.locator('#lg-pass').fill(s.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await expect(page).toHaveURL(/\/nv\/thu-nhap/);
    // Quay lại bằng nút Back không hiện lại dữ liệu của phiên đã mất khi lại hết hạn.
  });

  test('staff desktop: Check-in khi phiên đã mất → về đăng nhập, không treo nút', async ({ page, baseURL, context }) => {
    test.skip(REST_DAY_TODAY, REST_DAY_REASON);
    const s = await createStaff(admin, baseURL!, 'dksess');
    await page.setViewportSize(DESKTOP);
    await signIn(page, s.username, s.password);
    await expect(page.getByRole('heading', { level: 1, name: s.name })).toBeVisible();
    await context.clearCookies();
    await page.getByRole('button', { name: /Check-in/ }).first().click();
    await expectAtLogin(page);
    await expect(page.getByText(EXPIRED)).toBeVisible();
    await expect(page.getByText(s.name)).toHaveCount(0);
  });

  test('admin: cookie bị xoá, đổi sang Chấm công / Bảng lương / Nhân sự / Cài đặt đều về đăng nhập một lần', async ({ page, context }) => {
    await page.setViewportSize(DESKTOP);
    await signInAdmin(page);
    await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
    await context.clearCookies();
    await page.reload(); // tải lại: phiên rỗng → cổng route chặn
    await expectAtLogin(page);
    // Mỗi màn: đăng nhập, xoá cookie, bấm một mục trên thanh bên.
    for (const [nav, path] of [['Chấm công', 'cham-cong'], ['Bảng lương', 'bang-luong'], ['Nhân sự', 'nhan-su'], ['Cài đặt', 'cai-dat']] as const) {
      await signInAdmin(page);
      await page.goto('/admin/tong-quan');
      await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
      await context.clearCookies();
      await page.getByRole('link', { name: nav, exact: true }).first().click();
      await expectAtLogin(page);
      await expect(page).toHaveURL(new RegExp(`tiep=.*${path}`));
      await expect(page.getByText(EXPIRED)).toBeVisible();
      await expect(page.getByRole('navigation')).toHaveCount(0); // không còn khung Admin
    }
  });

  test('admin mở màn đang tự tải lại (Chấm công) và phiên mất: không treo, về đăng nhập', async ({ page, context }) => {
    await page.setViewportSize(DESKTOP);
    await signInAdmin(page);
    await page.goto('/admin/cham-cong');
    await expect(page.getByRole('region', { name: 'Lưới chấm công' })).toBeVisible();
    await context.clearCookies();
    await page.getByRole('button', { name: 'Tháng trước' }).click(); // đổi kỳ → gọi lại /attendance/week
    await expectAtLogin(page);
    await expect(page.getByText(EXPIRED)).toBeVisible();
  });
});

test.describe('tài khoản bị khoá / đổi mật khẩu khi đang mở app', () => {
  test('admin khoá nhân viên đang mở app → thao tác kế tiếp về đăng nhập; đăng nhập lại hiện đúng câu của BE', async ({ page, baseURL }) => {
    const s = await createStaff(admin, baseURL!, 'lock');
    await page.setViewportSize(PHONE);
    await signIn(page, s.username, s.password);
    await expect(page.locator('.home .name')).toHaveText(s.name);
    await setLocked(admin, s.username, true);
    await page.getByRole('link', { name: /Chấm công/ }).first().click();
    await expectAtLogin(page);
    await expect(page.getByText(EXPIRED)).toBeVisible();
    await page.locator('#lg-user').fill(s.username);
    await page.locator('#lg-pass').fill(s.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await expect(page.getByRole('alert')).toContainText('Tài khoản đã bị tạm khóa');
    await expect(page).toHaveURL(/dang-nhap/);
  });

  test('admin đặt lại mật khẩu → phiên cũ của nhân viên mất, mật khẩu cũ bị từ chối', async ({ page, baseURL }) => {
    const s = await createStaff(admin, baseURL!, 'reset');
    await page.setViewportSize(PHONE);
    await signIn(page, s.username, s.password);
    await resetPassword(admin, s.username, 'MatKhauMoi@2026');
    // Phiên đã bị huỷ: thao tác kế tiếp đưa về đăng nhập. Màn Hôm nay còn đang tải dở lúc đặt lại thì đã tự về đăng nhập rồi
    // (máy chậm), nên chỉ bấm khi liên kết còn đó.
    const link = page.getByRole('link', { name: /Yêu cầu/ }).first();
    if (await link.isVisible().catch(() => false)) await link.click({ timeout: 5000 }).catch(() => {});
    await expectAtLogin(page);
    await page.locator('#lg-user').fill(s.username);
    await page.locator('#lg-pass').fill(s.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await expect(page.getByRole('alert')).toContainText('Sai tên đăng nhập hoặc mật khẩu');
  });
});

test.describe('hạ quyền giữa chừng', () => {
  test('admin bị hạ xuống nhân viên khi đang mở Tổng quan: thao tác kế tiếp không treo, không hiện dữ liệu Admin', async ({ page, baseURL }) => {
    const a2 = await createStaff(admin, baseURL!, 'demote');
    const up = await admin.put(`/api/v2/employees/${a2.username}`, { headers: json, data: { account: { roles: ['admin'] } } });
    expect(up.ok(), await up.text()).toBeTruthy();
    await page.setViewportSize(DESKTOP);
    await signIn(page, a2.username, a2.password);
    await expect(page).toHaveURL(/admin\/tong-quan/);
    await expect(page.getByText('Quỹ lương')).toBeVisible();
    const down = await admin.put(`/api/v2/employees/${a2.username}`, { headers: json, data: { account: { roles: ['staff'] } } });
    expect(down.ok(), await down.text()).toBeTruthy();
    await page.getByRole('button', { name: 'Tháng trước' }).click();
    // Hoặc về đăng nhập (phiên bị thu hồi) hoặc hiện khối lỗi có câu của máy chủ; tuyệt đối không treo ở "đang tải" hay dữ liệu cũ.
    await expect(page.getByRole('alert').filter({ hasText: /Không tải được|đăng nhập/ }).or(page.locator('#lg-user'))).toBeVisible();
    await expect(page.getByText('Quỹ lương')).toHaveCount(0);
  });
});

test.describe('đăng nhập sai nhiều lần', () => {
  test('5 lần sai → khoá tạm; câu của BE hiện nguyên văn và nút vẫn bấm lại được sau khi gõ lại', async ({ page, baseURL }) => {
    const s = await createStaff(admin, baseURL!, 'brute');
    await page.goto('/dang-nhap');
    for (let i = 0; i < 5; i++) {
      await page.locator('#lg-user').fill(s.username);
      await page.locator('#lg-pass').fill(`sai-${i}`);
      await page.getByRole('button', { name: /đăng nhập/i }).click();
      await expect(page.getByRole('alert')).toContainText('Sai tên đăng nhập hoặc mật khẩu');
    }
    await page.locator('#lg-pass').fill('sai-6');
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await expect(page.getByRole('alert')).toContainText(/Bạn đã thử quá nhiều lần\. Thử lại sau \d+ phút\./);
    // Ngay cả mật khẩu đúng cũng bị chặn trong lúc khoá, và giao diện không treo.
    await page.locator('#lg-pass').fill(s.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await expect(page.getByRole('alert')).toContainText('quá nhiều lần');
    await expect(page).toHaveURL(/dang-nhap/);
    await expect(page.getByRole('button', { name: /đăng nhập/i })).toBeEnabled();
  });

  test('ô trống / chỉ khoảng trắng: nút Đăng nhập mờ; Enter không gửi', async ({ page }) => {
    await page.goto('/dang-nhap');
    const go = page.getByRole('button', { name: /đăng nhập/i });
    await expect(go).toBeDisabled();
    await page.locator('#lg-user').fill('   ');
    await page.locator('#lg-pass').fill('abc');
    await expect(go).toBeDisabled();
    let posts = 0;
    page.on('request', r => r.url().includes('/auth/login') && r.method() === 'POST' && posts++);
    await page.locator('#lg-pass').press('Enter');
    await page.waitForTimeout(300);
    expect(posts).toBe(0);
  });

  test('máy chủ lỗi 500 / mạng rớt khi đăng nhập hiện câu rõ, không treo', async ({ page }) => {
    await page.goto('/dang-nhap');
    await page.route('**/api/v2/auth/login', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Lỗi máy chủ","code":"INTERNAL"}' }));
    await page.locator('#lg-user').fill('x');
    await page.locator('#lg-pass').fill('y');
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await expect(page.getByRole('alert')).toContainText('Lỗi máy chủ');
    await page.unroute('**/api/v2/auth/login');
    await page.route('**/api/v2/auth/login', r => r.abort());
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await expect(page.getByRole('alert')).toContainText('Không kết nối được máy chủ');
    await expect(page.getByRole('button', { name: /đăng nhập/i })).toBeEnabled();
  });
});

test.describe('chặn chéo khu', () => {
  let staff: Staff;
  test.beforeAll(async ({ baseURL }) => {
    staff = await createStaff(admin, baseURL!, 'cross');
  });

  test('nhân viên gõ URL /admin/* bị đưa về trang nhân viên, không thấy dữ liệu Admin', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signIn(page, staff.username, staff.password);
    for (const p of ['/admin/tong-quan', '/admin/cham-cong', '/admin/bang-luong', '/admin/nhan-su', '/admin/cai-dat', '/admin/cai-dat/phan-quyen/tai-khoan', '/admin/cham-cong/nhan-vien/' + staff.username]) {
      await page.goto(p);
      await expect(page, p).toHaveURL(/\/nv\/hom-nay/);
      await expect(page.getByText('Quỹ lương')).toHaveCount(0);
    }
    // API Admin trực tiếp cũng bị từ chối.
    for (const p of ['/api/v2/employees', '/api/v2/overview', '/api/v2/realtime/stream']) {
      expect((await page.request.get(p)).status(), p).toBe(403);
    }
  });

  test('admin gõ URL /nv/* được đưa về Tổng quan', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAdmin(page);
    for (const p of ['/nv/hom-nay', '/nv/cham-cong', '/nv/yeu-cau', '/nv/thu-nhap', '/nv/toi']) {
      await page.goto(p);
      await expect(page, p).toHaveURL(/\/admin\/tong-quan/);
    }
  });

  test('chưa đăng nhập: mọi đường dẫn khu kín về đăng nhập và nhớ chỗ đến; /dang-nhap khi đã đăng nhập đưa về trang chủ', async ({ page }) => {
    for (const p of ['/admin/tong-quan', '/nv/hom-nay', '/in/phieu-luong/2026-10']) {
      await page.goto(p);
      await expectAtLogin(page);
    }
    await signIn(page, staff.username, staff.password);
    await page.goto('/dang-nhap');
    await expect(page).toHaveURL(/\/nv\/hom-nay/);
    // ?tiep= trỏ ra ngoài không được theo.
    await page.context().clearCookies();
    await page.goto('/dang-nhap?tiep=//evil.example.com');
    await page.locator('#lg-user').fill(staff.username);
    await page.locator('#lg-pass').fill(staff.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/nv\/hom-nay/);
  });

  test('nhân viên không xem được phiếu in của người khác', async ({ page, baseURL }) => {
    const other = await createStaff(admin, baseURL!, 'other');
    await page.setViewportSize(DESKTOP);
    await signIn(page, staff.username, staff.password);
    const res = await page.request.get(`/api/v2/payroll/2026-10/${other.username}`);
    expect(res.status()).toBe(403);
  });
});
void ADMIN_PASS; void ADMIN_USER; void apiAs;
