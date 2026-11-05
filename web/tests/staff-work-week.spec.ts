import { expect, test, type Page } from '@playwright/test';

// Tuần làm việc trong hồ sơ nhân sự (ngăn kéo ?nv=) trên dữ liệu giả (mock/settings.ts). Không page.route.
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Hồ sơ của Hoàng Thị Mai' });
const line = (page: Page) =>
  drawer(page)
    .locator('.fr', { has: page.getByText('Tuần làm việc', { exact: true }) })
    .locator('dd');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/nhan-su?nv=hoang-thi-mai');
});

test('profile shows the work week from the person type', async ({ page }) => {
  await expect(line(page)).toHaveText('T2–T7 · công chuẩn 26 · theo loại nhân sự');
});

test('ticking T2–T6 shows Công chuẩn 22 and no tick locks Lưu', async ({ page }) => {
  await page.getByRole('button', { name: 'Sửa tuần làm việc' }).click();
  const dlg = page.getByRole('dialog', { name: 'Tuần làm việc' });
  const save = dlg.getByRole('button', { name: 'Lưu', exact: true });
  await expect(save).toBeDisabled();
  // Ô tháng và ô lý do bo 8px như các màn cài đặt khác; ô lý do có bộ đếm N/300.
  for (const box of await dlg.locator('.inp').all()) await expect(box).toHaveCSS('border-radius', '8px');
  await expect(dlg).toContainText('0/300');
  await dlg.getByRole('radio', { name: 'Tuần riêng' }).check();
  await expect(dlg).toContainText('Công chuẩn: 26');
  await dlg.getByRole('checkbox', { name: 'T7' }).uncheck();
  await expect(dlg).toContainText('Công chuẩn: 22');
  for (const d of ['T2', 'T3', 'T4', 'T5', 'T6']) await dlg.getByRole('checkbox', { name: d }).uncheck();
  await expect(dlg).toContainText('Chọn ít nhất một ngày');
  await expect(save).toBeDisabled();
});

test('saving an own week rewrites the profile line', async ({ page }) => {
  await page.getByRole('button', { name: 'Sửa tuần làm việc' }).click();
  const dlg = page.getByRole('dialog', { name: 'Tuần làm việc' });
  await dlg.getByRole('radio', { name: 'Tuần riêng' }).check();
  await dlg.getByRole('checkbox', { name: 'T7' }).uncheck();
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await expect(line(page)).toHaveText('T2–T6 · công chuẩn 22 · riêng từ 10/2026');
});

test('a week from a later month shows as upcoming', async ({ page }) => {
  await page.getByRole('button', { name: 'Sửa tuần làm việc' }).click();
  const dlg = page.getByRole('dialog', { name: 'Tuần làm việc' });
  await dlg.getByRole('radio', { name: 'Tuần riêng' }).check();
  await dlg.getByRole('checkbox', { name: 'T7' }).uncheck();
  await dlg.getByRole('combobox', { name: 'Áp dụng từ tháng' }).selectOption({ label: 'Tháng 12/2026' });
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await expect(line(page)).toHaveText('T2–T7 · công chuẩn 26 · theo loại nhân sự; từ 12/2026: T2–T6 · công chuẩn 22');
});

test('Escape closes only the work-week dialog and focus returns to Sửa', async ({ page }) => {
  const edit = page.getByRole('button', { name: 'Sửa tuần làm việc' });
  await edit.click();
  await expect(page.getByRole('dialog', { name: 'Tuần làm việc' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Tuần làm việc' })).toHaveCount(0);
  await expect(drawer(page)).toBeVisible();
  await expect(edit).toBeFocused();
});
