import { expect, test } from '@playwright/test';

// Cài đặt không còn chữ "xem trước", "chưa chốt" hay số đếm "chưa xác nhận" ở menu. Không page.route.
for (const path of [
  '/admin/cai-dat',
  '/admin/cai-dat/tat-ca',
  '/admin/cai-dat/lich',
  '/admin/cai-dat/kpi',
  '/admin/cai-dat/che-do/nhan-vien'
])
  test(`${path} has no preview or unconfirmed wording`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await expect(page.locator('.main')).toBeVisible();
    for (const t of ['Xem trước', 'chưa chốt', 'Chưa xác nhận', 'chưa ai xác nhận', 'chưa có dữ liệu giả'])
      await expect(page.locator('body')).not.toContainText(t);
    await expect(page.locator('nav.sub .cnt2')).toHaveCount(0);
  });
