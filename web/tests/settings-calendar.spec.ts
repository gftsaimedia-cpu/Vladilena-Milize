import { expect, test, type Page } from '@playwright/test';

// Cài đặt › Lịch, ca & chấm công trên dữ liệu giả (mock/settings.ts): ngày lễ, chấm ngày trả lương, 6 ca cố định. Không page.route.
const day = (page: Page, d: number, m: number) => page.getByRole('button', { name: `Ngày ${d} tháng ${m}`, exact: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('calendar shows holidays and pay-day dots from the pay days', async ({ page }) => {
  await page.goto('/admin/cai-dat/lich');
  await expect(page.locator('.title p')).toContainText('11 ngày lễ');
  await expect(page.locator('.title p')).toContainText('trả lương ngày 10 tháng sau');
  await expect(day(page, 10, 11)).toHaveClass(/\bpay\b/);
  await expect(day(page, 10, 1)).toHaveClass(/\bpay\b/);
  await expect(day(page, 11, 11)).not.toHaveClass(/\bpay\b/);
});

test('the six fixed shifts are plain text', async ({ page }) => {
  await page.goto('/admin/cai-dat/lich');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Ca làm' }) });
  await expect(card.locator('tbody tr')).toHaveCount(6);
  await expect(card.locator('tbody tr').nth(4)).toContainText('Night 1');
  await expect(card.locator('tbody tr').nth(4)).toContainText('22:00');
  await expect(card.locator('tbody tr').nth(4)).toContainText('07:00');
  await expect(card.locator('tbody tr').nth(4)).toContainText('hôm sau');
  await expect(card.locator('input, select')).toHaveCount(0);
});
