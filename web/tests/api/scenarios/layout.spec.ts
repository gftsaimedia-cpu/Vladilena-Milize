// Nhóm 6 — Giao diện hẹp (390px) và rộng (1440px) trên BE thật: các màn chính không tràn ngang, nút / liên kết nằm trong tầm bấm; bàn phím
// (Tab, Enter, Esc) đi hết các form chính. Console / pageerror sạch (fixture trong helpers.ts).
import { DESKTOP, OFFICE, PHONE, adminApi, createStaff, expect, expectNoHScroll, signIn, signInAdmin, skipWithoutAdmin, test, type Staff } from './helpers';
import { REST_DAY_REASON, REST_DAY_TODAY } from '../rest-day';
import type { APIRequestContext, Page } from '@playwright/test';

test.use({ permissions: ['geolocation'], geolocation: OFFICE });

let admin: APIRequestContext;
let staff: Staff;
test.beforeAll(async ({ baseURL }) => {
  skipWithoutAdmin();
  admin = await adminApi(baseURL!);
  staff = await createStaff(admin, baseURL!, 'lay', 1);
});
test.afterAll(async () => {
  await admin?.dispose();
});

/**
 * Các nút / liên kết / ô nhập đang hiện mà nằm ngoài khung nhìn theo chiều ngang, không nằm trong một vùng tự cuộn ngang
 * (bảng rộng có thanh cuộn riêng là chủ ý) và không bị phần tử khác phủ lên tâm.
 */
async function unreachable(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const scrollableX = (el: Element | null) => {
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const st = getComputedStyle(p);
        if (/(auto|scroll)/.test(st.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || (el as HTMLElement).closest('[inert], [aria-hidden="true"], .sr-only')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (scrollableX(el)) continue;
      const label = `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}]`;
      if (r.left < -1 || r.right > vw + 1) out.push(`${label} ngoài khung ngang (${Math.round(r.left)}..${Math.round(r.right)} / ${vw})`);
    }
    return out;
  });
}

const ADMIN_SCREENS = ['/admin/tong-quan', '/admin/cham-cong', '/admin/bang-luong', '/admin/nhan-su', '/admin/cai-dat', '/admin/cai-dat/tat-ca', '/admin/cai-dat/lich', '/admin/cai-dat/phan-quyen/tai-khoan', '/admin/cai-dat/nhat-ky'];
const STAFF_SCREENS = ['/nv/hom-nay', '/nv/cham-cong', '/nv/yeu-cau', '/nv/thu-nhap', '/nv/toi'];

for (const [label, size] of [['390px', { width: 390, height: 844 }], ['1440px', DESKTOP]] as const) {
  test(`admin ${label}: các màn chính không tràn ngang và không có nút nằm ngoài khung`, async ({ page }) => {
    await page.setViewportSize(size);
    await signInAdmin(page);
    for (const path of ADMIN_SCREENS) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoHScroll(page, `${path} @${label}`);
      expect(await unreachable(page), `${path} @${label}`).toEqual([]);
    }
  });

  test(`nhân viên ${label}: các màn chính không tràn ngang và không có nút nằm ngoài khung`, async ({ page }) => {
    await page.setViewportSize(size);
    await signIn(page, staff.username, staff.password);
    for (const path of STAFF_SCREENS) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoHScroll(page, `${path} @${label}`);
      expect(await unreachable(page), `${path} @${label}`).toEqual([]);
    }
  });
}

test('đăng nhập 390px: không tràn, Tab đi đúng thứ tự, Enter ở ô mật khẩu đăng nhập', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/dang-nhap');
  await expectNoHScroll(page, 'đăng nhập');
  expect(await unreachable(page)).toEqual([]);
  await expect(page.locator('#lg-user')).toBeFocused(); // tự đặt focus vào ô tên
  await page.keyboard.type(staff.username);
  await page.keyboard.press('Tab');
  await expect(page.locator('#lg-pass')).toBeFocused();
  await page.keyboard.type(staff.password);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Hiện' })).toBeFocused();
  await page.keyboard.press('Enter'); // bật hiện mật khẩu, không gửi form
  await expect(page.locator('#lg-pass')).toHaveAttribute('type', 'text');
  await expect(page).toHaveURL(/dang-nhap/);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /đăng nhập/i })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/nv\/hom-nay/);
});

test('form Làm thêm giờ chỉ bằng bàn phím: chọn ngày, giờ, gõ lý do, Tab tới Gửi và Enter gửi', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signIn(page, staff.username, staff.password);
  await page.goto('/nv/yeu-cau?tao=ot');
  const send = page.getByRole('button', { name: 'Gửi yêu cầu' });
  await expect(send).toBeDisabled();
  const sel = (id: string) => page.locator(`.nr-form select[id$="-${id}"]`);
  await expect(sel('ngay')).toBeFocused(); // form tự đặt focus vào ô đầu
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(sel('tu')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(sel('den')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(page.locator('.nr-form textarea')).toBeFocused();
  await page.keyboard.type('Gõ bằng bàn phím');
  await expect(send).toBeEnabled(); // nút chỉ bật khi lần xem trước của máy chủ đồng ý; Tab quá sớm thì bỏ qua nút khoá
  await page.keyboard.press('Tab');
  await expect(send).toBeFocused();
  await expect(send).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast.ok').filter({ hasText: 'Đã gửi yêu cầu' })).toBeVisible();
});

test('chuông Admin: mở bằng Enter, Esc đóng và trả focus về chuông; ngăn kéo không tràn ở 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAdmin(page);
  await page.goto('/admin/tong-quan');
  const bell = page.getByRole('button', { name: /Thông báo/ });
  await bell.focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('dialog', { name: 'Thông báo' });
  await expect(dlg).toBeVisible();
  const box = await dlg.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(bell).toBeFocused();
});

test('nút bấm được ở 390px: Check-in, Tạo yêu cầu và Đăng xuất nằm trong khung và nhận cú bấm thật', async ({ page }) => {
  test.skip(REST_DAY_TODAY, REST_DAY_REASON);
  await page.setViewportSize(PHONE);
  await signIn(page, staff.username, staff.password);
  await page.getByRole('region', { name: 'Ca hôm nay' }).getByRole('button', { name: /Check-in/ }).click({ trial: true });
  await page.goto('/nv/yeu-cau');
  await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/nv/toi');
  await page.getByRole('button', { name: /Đăng xuất/ }).click();
  await expect(page).toHaveURL(/dang-nhap/);
});
