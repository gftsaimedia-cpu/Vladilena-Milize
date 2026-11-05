// Khung trang nhân viên trên máy tính: chọn giao diện theo bề ngang (mốc 1136px), thanh trên, menu tài khoản.
import { expect, test } from '@playwright/test';
import { openDesktop } from './fixtures/staff-desktop';

test('the desktop page makes no /api request and logs no error', async ({ page }) => {
  const calls = await openDesktop(page, '/nv/hom-nay');
  await expect(page.getByRole('button', { name: 'Lê Hoàng Nam' })).toBeVisible();
  expect(calls).toEqual([]);
});

test('from 1136px the desktop page replaces the phone app', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay', { width: 1136, height: 800 });
  await expect(page.getByRole('banner')).toContainText('Nhân viên');
  await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toHaveCount(0);
  await page.setViewportSize({ width: 1135, height: 800 });
  await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lê Hoàng Nam' })).toHaveCount(0);
});

test('crossing 1136px switches live without a reload', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await page.evaluate(() => ((window as any).__mark = 1));
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: 'Lê Hoàng Nam' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__mark)).toBe(1);
});

test('old staff URLs land on /nv/hom-nay', async ({ page }) => {
  await openDesktop(page, '/nv-may-tinh');
  await expect(page).toHaveURL(/\/nv\/hom-nay$/);
  await page.goto('/nhan-vien');
  await expect(page).toHaveURL(/\/nv\/hom-nay$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/nhan-vien');
  await expect(page).toHaveURL(/\/nv\/hom-nay$/);
});

test('the account menu follows /nv/toi', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const account = page.getByRole('button', { name: 'Lê Hoàng Nam' });
  const menu = page.getByRole('region', { name: 'Tài khoản của tôi' });
  await account.click();
  await expect(page).toHaveURL(/\/nv\/toi$/);
  await expect(account).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).not.toContainText('nam.le@gft.vn'); // không có dòng email (người dùng chốt 05/11)
  for (const t of ['Chính thức', 'GFT-0142', 'Kinh doanh', 'HC 08:00–17:00', '04/03/2024', '11 ngày',
    'Thông tin do Admin quản lý. Thấy sai thì báo Admin để sửa.']) await expect(menu).toContainText(t);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/nv\/hom-nay$/);
  await expect(menu).toBeHidden();
  await expect(account).toBeFocused();
  await page.goto('/nv/toi');
  await expect(menu).toBeVisible();
  await page.getByRole('banner').getByText('Nhân viên', { exact: true }).click(); // bấm ra ngoài menu, trúng chỗ không có liên kết
  await expect(page).toHaveURL(/\/nv\/hom-nay$/);
});

test('Đổi mật khẩu in the menu sets hop and hides the menu', async ({ page }) => {
  await openDesktop(page, '/nv/toi');
  await page.getByRole('region', { name: 'Tài khoản của tôi' }).getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page).toHaveURL(/\/nv\/toi\?hop=doi-mat-khau$/);
  await expect(page.getByRole('region', { name: 'Tài khoản của tôi' })).toBeHidden();
});

test('signing out from the menu returns to /dang-nhap', async ({ page }) => {
  await openDesktop(page, '/nv/toi');
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/dang-nhap/);
});

test('the design index lists the desktop boards', async ({ page }) => {
  await openDesktop(page, '/thiet-ke');
  const group = page.locator('section', { has: page.getByRole('heading', { name: /Nhân viên · máy tính/ }) });
  await expect(group.getByRole('link')).toHaveText([
    'Nhân viên trên máy tính · một trang ba cột',
    'Máy tính · ngăn kéo một ngày (27/10)',
    'Máy tính · ngăn kéo yêu cầu bị từ chối',
    'Máy tính · menu tài khoản',
    'Đăng nhập',
    'Đăng nhập · sai mật khẩu'
  ]);
  await expect(group.getByRole('link', { name: 'Máy tính · ngăn kéo yêu cầu bị từ chối' }))
    .toHaveAttribute('href', '/nv/yeu-cau?yc=gio-vao-0909');
  await expect(page.locator('a[href^="/nv-may-tinh"]')).toHaveCount(0);
});

// F1: trên điện thoại đổi tab vẫn cuộn về đầu (chỉ trang máy tính giữ vị trí cuộn).
test('on the phone, switching tabs still scrolls to the top', async ({ page }) => {
  await openDesktop(page, '/nv/thu-nhap', { width: 390, height: 500 });
  await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(50);
  await page.getByRole('navigation', { name: 'Điều hướng' }).getByRole('link', { name: 'Hôm nay' }).click();
  await expect(page).toHaveURL(/\/nv\/hom-nay$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

// F2: lớp CSS toàn cục (.who, .note, .big…) không được làm vỡ bố cục menu tài khoản.
test('the account menu keeps the name above the facts and the note without a border', async ({ page }) => {
  await openDesktop(page, '/nv/toi');
  const menu = page.getByRole('region', { name: 'Tài khoản của tôi' });
  await expect(menu).toBeVisible();
  const m = await menu.evaluate(el => {
    const name = [...el.querySelectorAll('div')].find(d => d.textContent === 'Lê Hoàng Nam')!.getBoundingClientRect();
    const facts = el.querySelector('.sd-facts')!.getBoundingClientRect();
    const note = [...el.querySelectorAll('p')].find(p => p.textContent!.startsWith('Thông tin do Admin'))!;
    return {
      nameBottom: name.bottom,
      nameHeight: name.height,
      factsTop: facts.top,
      border: getComputedStyle(note).borderTopWidth
    };
  });
  expect(m.factsTop).toBeGreaterThanOrEqual(m.nameBottom);
  expect(m.nameHeight).toBeLessThanOrEqual(24);
  expect(m.border).toBe('0px');
});
