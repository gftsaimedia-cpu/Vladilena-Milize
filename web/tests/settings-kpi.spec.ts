import { expect, test } from '@playwright/test';

// Cài đặt › Quy tắc KPI trên dữ liệu giả (mock/settings.ts): năm trọng số chỉ xem, sửa ở Cách tính lương › Lương KPI. Không page.route.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('KPI rules show the five weights read-only with a link to edit', async ({ page }) => {
  await page.goto('/admin/cai-dat/kpi');
  const wts = page.locator('.wts');
  for (const t of ['Base Wework', '40%', 'Người dùng', '24%', 'Đồng nghiệp', '18%', 'Quản lý', '12%', 'Tự đánh giá', '6%', '100%']) {
    await expect(wts).toContainText(t);
  }
  await expect(page.locator('.main input')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sửa trong Cách tính lương › Lương KPI' })).toHaveAttribute(
    'href',
    '/admin/cai-dat?hop=luong-kpi'
  );
});
