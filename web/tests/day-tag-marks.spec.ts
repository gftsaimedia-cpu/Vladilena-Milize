// Dấu hiệu ngày (loại ngày, ca, OT/bù/nghỉ, kết quả chấm công) trên lịch Admin và lịch nhân viên, trên dữ liệu giả.
// Nhãn do BE dựng; FE chỉ hiển thị, nên hai bên phải cho ra cùng một chú giải.
import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

test('admin month strip marks each day and the day box lists type, shift and result', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/cham-cong/nhan-vien/le-hoang-nam');
  const strip = page.getByRole('region', { name: /^Các ngày tháng/ });
  await expect(strip.locator('.dmk').first()).toBeVisible();
  await expect(strip.locator('.mk.review.valid').first()).toBeVisible();
  const legend = page.getByRole('group', { name: 'Dấu hiệu của ngày' });
  await expect(legend).toContainText('Làm thêm (OT)');
  await expect(legend).toContainText('Giải trình bị từ chối');
  await strip.locator('button.ms-i').first().click();
  const box = page.getByRole('dialog');
  await expect(box.getByLabel('Loại ngày và kết quả')).toContainText('Ngày làm');
  await expect(box.getByLabel('Loại ngày và kết quả')).toContainText('HC 08:00–17:00');
});

test('staff calendar shows the same marks and legend as the admin one', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  await expect(page.locator('.at-grid .dc .dmk').first()).toBeVisible();
  const legend = page.getByRole('group', { name: 'Dấu hiệu của ngày' });
  await expect(legend).toContainText('Nghỉ không lương');
  await expect(legend).toContainText('Quá hạn giải trình');
  await page.locator('.at-grid button.dn.work').first().click();
  await expect(page.getByLabel('Loại ngày và kết quả')).toContainText('HC 08:00–17:00');
});
