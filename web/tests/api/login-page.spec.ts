// Trang đăng nhập ở bản thật (playwright.api.config.ts): không đăng nhập, không ghi gì vào DB.
import { expect, test } from '@playwright/test';

test('the real build does not show the mockup login hint', async ({ page }) => {
  await page.goto('/dang-nhap');
  await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
  await expect(page.getByText('Bản mockup: mật khẩu bất kỳ')).toHaveCount(0);
});
