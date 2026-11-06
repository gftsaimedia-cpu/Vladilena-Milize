// Sửa hồ sơ và Cho nghỉ việc từ ngăn kéo hồ sơ ở /admin/nhan-su?nv=<id>, trên dữ liệu giả. Hộp Sửa hồ sơ là hộp Thêm
// nhân sự đã điền sẵn: tên đăng nhập chỉ xem, không có mật khẩu, Lưu chỉ bật khi có thay đổi và biểu mẫu đúng.
// Cho nghỉ việc hỏi lại trước khi làm; người đã nghỉ việc không còn hai nút này. Không gọi /api nào.
// Với BE thật: PUT /api/v2/employees/:username và DELETE /api/v2/employees/:username (nghỉ việc từ hôm nay, khoá tài khoản).
import { expect, test, type Locator, type Page } from '@playwright/test';

function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

const drawer = (page: Page, name: string) => page.getByRole('dialog', { name: `Hồ sơ của ${name}` });
const fact = (d: Locator, label: string) => d.locator('.fr', { has: d.page().getByText(label, { exact: true }) }).locator('dd');
const editBox = (page: Page) => page.getByRole('dialog', { name: 'Sửa hồ sơ' });
const field = (page: Page, label: string) => editBox(page).getByLabel(label, { exact: true });
const saveBtn = (page: Page) => editBox(page).getByRole('button', { name: 'Lưu thay đổi' });
const endBox = (page: Page) => page.getByRole('dialog', { name: 'Cho nghỉ việc' });
const row = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Bảng danh sách nhân sự' })
    .locator('tbody tr')
    .filter({ has: page.locator('.nn', { hasText: name }) });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

async function openEdit(page: Page, id: string, name: string) {
  await page.goto(`/admin/nhan-su?nv=${id}`);
  await drawer(page, name).getByRole('button', { name: 'Sửa hồ sơ' }).click();
  await expect(editBox(page)).toBeVisible();
}

test('the drawer offers Sửa hồ sơ and Cho nghỉ việc, but not for someone who has already left', async ({ page }) => {
  await page.goto('/admin/nhan-su?nv=le-hoang-nam');
  const d = drawer(page, 'Lê Hoàng Nam');
  await expect(d.getByRole('button', { name: 'Sửa hồ sơ' })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Cho nghỉ việc' })).toBeVisible();

  await page.goto('/admin/nhan-su?nv=dang-van-phuc');
  const gone = drawer(page, 'Đặng Văn Phúc');
  await expect(gone.getByRole('link', { name: 'Xem chấm công' })).toBeVisible();
  await expect(gone.getByRole('button', { name: 'Sửa hồ sơ' })).toHaveCount(0);
  await expect(gone.getByRole('button', { name: 'Cho nghỉ việc' })).toHaveCount(0);
});

test('Sửa hồ sơ starts from the person as saved: username read-only, no password, Lưu off until something changes', async ({ page }) => {
  await openEdit(page, 'le-hoang-nam', 'Lê Hoàng Nam');
  await expect(field(page, 'Họ tên')).toHaveValue('Lê Hoàng Nam');
  await expect(field(page, 'Tên đăng nhập')).toHaveValue('le-hoang-nam');
  await expect(field(page, 'Tên đăng nhập')).toHaveAttribute('readonly', '');
  await expect(field(page, 'Mật khẩu ban đầu')).toHaveCount(0);
  await expect(field(page, 'Chức danh')).toHaveValue('Nhân viên kinh doanh');
  await expect(field(page, 'Loại nhân sự')).toHaveValue('nv');
  await expect(field(page, 'Bậc')).toHaveValue('2');
  await expect(field(page, 'Trạng thái')).toHaveValue('nv');
  await expect(field(page, 'Ca làm việc')).toHaveValue('NORMAL');
  await expect(field(page, 'Phòng ban').locator('option:checked')).toHaveText('Kinh doanh');
  await expect(field(page, 'Ngày vào làm')).toHaveValue('04/03/2024');
  await expect(saveBtn(page)).toBeDisabled();

  await field(page, 'Chức danh').fill('Trưởng nhóm kinh doanh');
  await expect(saveBtn(page)).toBeEnabled();
  await field(page, 'Chức danh').fill('Nhân viên kinh doanh');
  await expect(saveBtn(page)).toBeDisabled();
  await field(page, 'Họ tên').fill('');
  await expect(saveBtn(page)).toBeDisabled();
});

test('saving closes the box, says so, and the drawer and list show the change, without calling /api', async ({ page }) => {
  const calls = trackApi(page);
  await openEdit(page, 'le-hoang-nam', 'Lê Hoàng Nam');
  await field(page, 'Chức danh').fill('Trưởng nhóm kinh doanh');
  await field(page, 'Phòng ban').selectOption({ label: 'Marketing' });
  await field(page, 'Bậc').selectOption({ label: 'Bậc 3 · Lead' });
  await saveBtn(page).click();

  await expect(editBox(page)).toHaveCount(0);
  await expect(page.getByText('Đã lưu hồ sơ của Lê Hoàng Nam')).toBeVisible();
  const d = drawer(page, 'Lê Hoàng Nam');
  await expect(fact(d, 'Chức danh')).toHaveText('Trưởng nhóm kinh doanh');
  await expect(fact(d, 'Phòng ban')).toHaveText('Marketing');
  await expect(fact(d, 'Loại · bậc')).toHaveText('NV · Bậc 3');
  await expect(row(page, 'Lê Hoàng Nam')).toContainText('Marketing');
  expect(calls).toEqual([]);

  await d.getByRole('button', { name: 'Sửa hồ sơ' }).click();
  await expect(field(page, 'Chức danh')).toHaveValue('Trưởng nhóm kinh doanh');
  await expect(field(page, 'Bậc')).toHaveValue('3');
});

test('moving someone from Thử việc to Chính thức updates the status everywhere', async ({ page }) => {
  await openEdit(page, 'do-mai-linh', 'Đỗ Mai Linh');
  await expect(field(page, 'Trạng thái')).toHaveValue('thuviec');
  await field(page, 'Trạng thái').selectOption({ label: 'Chính thức' });
  await saveBtn(page).click();
  await expect(editBox(page)).toHaveCount(0);
  await expect(drawer(page, 'Đỗ Mai Linh').locator('.idr')).toContainText('Chính thức');
  await expect(row(page, 'Đỗ Mai Linh')).toContainText('Chính thức');
});

test('Huỷ leaves the profile as it was', async ({ page }) => {
  await openEdit(page, 'le-hoang-nam', 'Lê Hoàng Nam');
  await field(page, 'Chức danh').fill('Khác');
  await editBox(page).getByRole('button', { name: 'Huỷ' }).click();
  await expect(editBox(page)).toHaveCount(0);
  await expect(fact(drawer(page, 'Lê Hoàng Nam'), 'Chức danh')).toHaveText('Nhân viên kinh doanh');
});

test('Cho nghỉ việc asks first; Huỷ changes nothing', async ({ page }) => {
  await page.goto('/admin/nhan-su?nv=le-hoang-nam');
  await drawer(page, 'Lê Hoàng Nam').getByRole('button', { name: 'Cho nghỉ việc' }).click();
  await expect(endBox(page)).toBeVisible();
  await expect(endBox(page)).toContainText('Lê Hoàng Nam');
  await expect(endBox(page)).toContainText('28/10/2026');
  await expect(endBox(page)).toContainText('khoá');
  await endBox(page).getByRole('button', { name: 'Huỷ' }).click();
  await expect(endBox(page)).toHaveCount(0);
  await expect(drawer(page, 'Lê Hoàng Nam').locator('.idr')).toContainText('Chính thức');
});

test('confirming ends the job today: status Đã nghỉ việc in drawer and list, and the two buttons go away', async ({ page }) => {
  const calls = trackApi(page);
  await page.goto('/admin/nhan-su?nv=le-hoang-nam');
  const d = drawer(page, 'Lê Hoàng Nam');
  await d.getByRole('button', { name: 'Cho nghỉ việc' }).click();
  await endBox(page).getByRole('button', { name: 'Cho nghỉ việc' }).click();

  await expect(endBox(page)).toHaveCount(0);
  await expect(page.getByText('Đã cho Lê Hoàng Nam nghỉ việc từ 28/10/2026')).toBeVisible();
  await expect(d.locator('.idr')).toContainText('Đã nghỉ việc');
  await expect(d.getByRole('button', { name: 'Sửa hồ sơ' })).toHaveCount(0);
  await expect(d.getByRole('button', { name: 'Cho nghỉ việc' })).toHaveCount(0);
  await expect(row(page, 'Lê Hoàng Nam')).toContainText('Đã nghỉ việc');
  expect(calls).toEqual([]);
});
