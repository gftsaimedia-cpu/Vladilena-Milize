// Hộp "Thêm nhân sự" ở /admin/nhan-su trên dữ liệu giả: nút Tạo chỉ bật khi biểu mẫu đủ và đúng (ngăn trước, không
// báo lỗi sau); tên đăng nhập gợi ý từ họ tên; tạo xong đóng hộp và báo. Không gọi /api nào.
// Với BE thật (POST /api/v2/employees, đăng nhập bằng tài khoản mới): tests/api/admin-accounts.spec.ts.
import { expect, test, type Page } from '@playwright/test';

function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Thêm nhân sự' });
const field = (page: Page, label: string) => dialog(page).getByLabel(label, { exact: true });
const create = (page: Page) => dialog(page).getByRole('button', { name: 'Tạo nhân sự' });

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/nhan-su');
  await page.getByRole('button', { name: 'Thêm nhân sự' }).click();
  await expect(dialog(page)).toBeVisible();
}

async function fillValid(page: Page) {
  await field(page, 'Họ tên').fill('Phan Thị Hai');
  await field(page, 'Mật khẩu ban đầu').fill('Hai@2026');
  await field(page, 'Loại nhân sự').selectOption({ label: 'Nhân viên' });
  await field(page, 'Bậc').selectOption({ label: 'Bậc 2 · Chuyên viên' });
  await field(page, 'Trạng thái').selectOption({ label: 'Thử việc' });
}

test('Thêm nhân sự opens the dialog with Tạo nhân sự off and today as the start date', async ({ page }) => {
  const calls = trackApi(page);
  await open(page);
  await expect(create(page)).toBeDisabled();
  await expect(field(page, 'Ngày vào làm')).toHaveValue('28/10/2026');
  await expect(field(page, 'Ca làm việc')).toHaveValue('NORMAL');
  expect(calls).toEqual([]);
});

test('the username is suggested from the name until the Admin types one', async ({ page }) => {
  await open(page);
  await field(page, 'Họ tên').fill('Đặng Thu Trang');
  await expect(field(page, 'Tên đăng nhập')).toHaveValue('dang-thu-trang');
  await field(page, 'Tên đăng nhập').fill('Trang.DT 01');
  await expect(field(page, 'Tên đăng nhập')).toHaveValue('trang.dt01');
  await field(page, 'Họ tên').fill('Đặng Thu Trang B');
  await expect(field(page, 'Tên đăng nhập')).toHaveValue('trang.dt01');
});

test('clearing the username leaves it empty and Tạo nhân sự off; a new name suggests again', async ({ page }) => {
  await open(page);
  await fillValid(page);
  await field(page, 'Tên đăng nhập').fill('');
  await expect(field(page, 'Tên đăng nhập')).toHaveValue('');
  await expect(create(page)).toBeDisabled();
  await field(page, 'Họ tên').fill('Phan Thị Hà');
  await expect(field(page, 'Tên đăng nhập')).toHaveValue('phan-thi-ha');
  await expect(create(page)).toBeEnabled();
});

test('Tạo nhân sự turns on only when every required field is right', async ({ page }) => {
  await open(page);
  await fillValid(page);
  await expect(create(page)).toBeEnabled();

  await field(page, 'Mật khẩu ban đầu').fill('12345');
  await expect(create(page)).toBeDisabled();
  await field(page, 'Mật khẩu ban đầu').fill('123456');
  await expect(create(page)).toBeEnabled();

  await field(page, 'Họ tên').fill('');
  await expect(create(page)).toBeDisabled();
  await field(page, 'Họ tên').fill('Phan Thị Hai');
  await expect(create(page)).toBeEnabled();

  await field(page, 'Ngày vào làm').fill('');
  await expect(create(page)).toBeDisabled();
  await field(page, 'Ngày vào làm').fill('01/11/2026');
  await expect(create(page)).toBeEnabled();
});

test('a username someone already has is named and keeps Tạo nhân sự off', async ({ page }) => {
  await open(page);
  await fillValid(page);
  await field(page, 'Tên đăng nhập').fill('hoang-thi-mai');
  await expect(dialog(page).getByText('Tên đăng nhập hoang-thi-mai đã có người dùng.')).toBeVisible();
  await expect(create(page)).toBeDisabled();
});

test('levels follow the type, and only NV asks for Thử việc or Chính thức', async ({ page }) => {
  await open(page);
  await expect(field(page, 'Bậc')).toBeDisabled();
  await expect(field(page, 'Trạng thái')).toHaveCount(0);
  await field(page, 'Loại nhân sự').selectOption({ label: 'Thực tập sinh' });
  await expect(field(page, 'Bậc').locator('option:not([value=""])')).toHaveCount(6);
  await expect(field(page, 'Trạng thái')).toHaveCount(0);
  await field(page, 'Bậc').selectOption({ label: 'Bậc 6 · Practitioner in Training' });
  await field(page, 'Loại nhân sự').selectOption({ label: 'Nhân viên' });
  await expect(field(page, 'Bậc').locator('option:not([value=""])')).toHaveCount(4);
  await expect(field(page, 'Bậc')).toHaveValue('');
  await expect(field(page, 'Trạng thái')).toBeVisible();
});

test('an NV on the night shift must pick the 40% or 60% night allowance', async ({ page }) => {
  await open(page);
  await fillValid(page);
  await expect(field(page, 'Phụ cấp ca đêm')).toHaveCount(0);
  await field(page, 'Ca làm việc').selectOption({ label: 'Ca đêm' });
  await expect(create(page)).toBeDisabled();
  await expect(field(page, 'Phụ cấp ca đêm').locator('option:not([value=""])')).toHaveText(['40%', '60%']);
  await field(page, 'Phụ cấp ca đêm').selectOption({ label: '60%' });
  await expect(create(page)).toBeEnabled();
  await field(page, 'Loại nhân sự').selectOption({ label: 'Chuyên trách viên' });
  await expect(field(page, 'Phụ cấp ca đêm')).toHaveCount(0);
});

test('creating closes the dialog and says who was added, without calling /api', async ({ page }) => {
  const calls = trackApi(page);
  await open(page);
  await fillValid(page);
  await create(page).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByText('Đã thêm Phan Thị Hai (phan-thi-hai)')).toBeVisible();
  expect(calls).toEqual([]);
});

test('Huỷ closes the dialog without creating anyone', async ({ page }) => {
  await open(page);
  await fillValid(page);
  await dialog(page).getByRole('button', { name: 'Huỷ' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByText(/Đã thêm/)).toHaveCount(0);
});

test('the dialog lives at ?hop=them-nhan-su: the button sets it, the link opens it, closing drops it', async ({ page }) => {
  await open(page);
  await expect(page).toHaveURL(/\/admin\/nhan-su\?hop=them-nhan-su$/);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/nhan-su$/);

  await page.goto('/admin/nhan-su?hop=them-nhan-su');
  await expect(dialog(page)).toBeVisible();
  await fillValid(page);
  await create(page).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/nhan-su$/);
});
