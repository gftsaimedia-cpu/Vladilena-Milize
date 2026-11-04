import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

const TABS = [
  ['Hôm nay', '/nv/hom-nay'],
  ['Chấm công', '/nv/cham-cong'],
  ['Yêu cầu', '/nv/yeu-cau'],
  ['Thu nhập', '/nv/thu-nhap'],
  ['Tôi', '/nv/toi']
] as const;
const nav = page => page.getByRole('navigation', { name: 'Điều hướng' });

test('the staff phone app makes no /api call on any tab', async ({ page }) => {
  const calls = await openPhone(page, '/nv/hom-nay');
  for (const [name, path] of TABS) {
    await nav(page).getByRole('link', { name }).click();
    await expect(page).toHaveURL(path);
  }
  expect(calls).toEqual([]);
});

test('tab bar lists five tabs in order and marks only the open one', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  await expect(nav(page).getByRole('link')).toHaveText(TABS.map(([n]) => n));
  for (const [name, path] of TABS) {
    await page.goto(path);
    await expect(nav(page).getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
  }
});

test('tab bar floats 16px above the bottom and no tab scrolls sideways', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  for (const [, path] of TABS) {
    await page.goto(path);
    const box = await nav(page).boundingBox();
    expect(Math.round(box!.y + box!.height)).toBe(844 - 16);
    expect(Math.round(box!.x)).toBe(16);
    expect(Math.round(box!.height)).toBe(68);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(w[0]).toBe(w[1]);
  }
});

test('Tôi shows Nam’s profile and work facts', async ({ page }) => {
  await openPhone(page, '/nv/toi');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tôi');
  await expect(page.getByText('Lê Hoàng Nam', { exact: true })).toBeVisible();
  await expect(page.getByText('nam.le@gft.vn')).toBeVisible();
  await expect(page.getByText('Chính thức', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Công việc' })).toBeVisible();
  const facts = page.locator('.kv');
  await expect(facts.locator('.k')).toHaveText([
    'Mã nhân viên', 'Phòng ban', 'Chức danh', 'Ca làm', 'Ngày vào làm', 'Phép năm còn lại'
  ]);
  await expect(facts.locator('.v')).toHaveText([
    'GFT-0142', 'Kinh doanh', 'Nhân viên kinh doanh', 'HC 08:00–17:00', '04/03/2024', '11 ngày'
  ]);
  await expect(page.getByText('Thông tin do Admin quản lý. Thấy sai thì báo Admin để sửa.')).toBeVisible();
});

test('Đổi mật khẩu opens a sheet that validates, closes, and returns focus', async ({ page }) => {
  await openPhone(page, '/nv/toi');
  const open = page.getByRole('button', { name: 'Đổi mật khẩu' });
  await open.click();
  await expect(page).toHaveURL(/hop=doi-mat-khau/);
  const sheet = page.getByRole('dialog', { name: 'Đổi mật khẩu' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Tài khoản nhanvien')).toBeVisible();
  await expect(sheet.getByRole('button', { name: '×' })).toHaveCount(0);
  await sheet.getByLabel('Mật khẩu hiện tại').fill('cu');
  await sheet.getByLabel(/^Mật khẩu mới/).fill('123');
  await sheet.getByLabel('Nhập lại mật khẩu mới').fill('123');
  await sheet.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Mật khẩu mới cần ít nhất 6 ký tự.');
  await sheet.getByLabel(/^Mật khẩu mới/).fill('123456');
  await sheet.getByLabel('Nhập lại mật khẩu mới').fill('123456');
  await sheet.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/hop=/);
  await expect(open).toBeFocused();
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
});

test('password deep link opens the sheet; Escape and Huỷ close it', async ({ page }) => {
  await openPhone(page, '/nv/toi?hop=doi-mat-khau');
  const sheet = page.getByRole('dialog', { name: 'Đổi mật khẩu' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/hop=/);
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await page.getByRole('dialog', { name: 'Đổi mật khẩu' }).getByRole('button', { name: 'Huỷ' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Đăng xuất signs out to /dang-nhap', async ({ page }) => {
  const calls = await openPhone(page, '/nv/toi');
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/dang-nhap/);
  expect(calls).toEqual([]);
});

// Ở Task 1 chưa màn nào dựng RequestRow (J1, J4 còn là màn tạm): gắn thẳng thành phần thật vào trang đang mở,
// dùng chung router của app. Vue phải là cùng bản app đang dùng, nên lấy đường dẫn của nó từ mã Vite đã biên dịch.
async function mountRequestRow(page, replace: boolean) {
  await page.evaluate(async replace => {
    const file = '/src/views/staff-phone/components/RequestRow.vue';
    const code = await (await fetch(file)).text();
    const vueUrl = code.match(/from\s+["'](\/node_modules\/\.vite\/deps\/vue\.js[^"']*)["']/)[1];
    const { createApp, h } = await import(vueUrl);
    const { default: RequestRow } = await import(file);
    const router = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$router;
    const host = Object.assign(document.createElement('div'), { id: 'rr-host', className: 'ph-app' });
    document.body.prepend(host); // đầu trang: thanh tab nổi ở đáy không che dòng
    const row = {
      id: 'phep-1210',
      icon: 'leave',
      title: 'Phép năm 12/10',
      status: 'done',
      statusText: 'Đã duyệt',
      month: '2026-10'
    };
    createApp({ render: () => h(RequestRow, { row, replace }) }).use(router).mount(host);
  }, replace);
}

test('a request row never claims aria-current, even on /nv/yeu-cau', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  await mountRequestRow(page, true);
  const row = page.locator('#rr-host').getByRole('link', { name: 'Phép năm 12/10, Đã duyệt' });
  await expect(row).toHaveAttribute('href', '/nv/yeu-cau?yc=phep-1210');
  await expect(row).not.toHaveAttribute('aria-current');
  await expect(row).not.toHaveClass(/router-link/);
  const before = await page.evaluate(() => history.length);
  await row.click();
  await expect(page).toHaveURL(/\/nv\/yeu-cau\?yc=phep-1210$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
});
