import { expect, test } from '@playwright/test';

// Cài đặt › Phân quyền trên dữ liệu giả: BE v2 không có API cho "Xử lý yêu cầu" (bảng v1 /settings/params đã bỏ),
// nên địa chỉ cũ của Xử lý yêu cầu đưa về Vai trò. Thanh tab (cần /roles thật) được kiểm ở tests/api/settings.spec.ts.
test('the old Xử lý yêu cầu address opens Vai trò', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/cai-dat/phan-quyen/xu-ly-yeu-cau');
  await expect(page).toHaveURL(/\/admin\/cai-dat\/phan-quyen$/);
});
