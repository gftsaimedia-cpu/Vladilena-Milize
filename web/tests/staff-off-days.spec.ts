import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

test('days outside the work week show nghỉ', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const week = page.getByRole('region', { name: 'Tuần này' });
  // Tuần 26/10 – 01/11 của dữ liệu giả chỉ có một ô ngoài tuần làm: Chủ nhật 01/11.
  await expect(week.locator('.dn.off')).toHaveCount(1);
  await expect(week.locator('.off-cap')).toHaveCount(1);
  await expect(week.locator('.off-cap')).toHaveText('nghỉ');
  await openPhone(page, '/nv/cham-cong');
  const off = page.locator('.at-grid .dn.off');
  await expect(off.first()).toBeVisible();
  const count = await off.count();
  await expect(page.locator('.at-grid .off-cap')).toHaveCount(count);
  await expect(page.locator('.off-cap').first()).toHaveText('nghỉ');
});

test('income shows the pay date on home, income and desktop', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  await expect(page.locator('main')).toContainText('trả ngày 10/11');
  await openPhone(page, '/nv/thu-nhap');
  await expect(page.locator('main')).toContainText('trả ngày 10/11');
  await openPhone(page, '/nv/hom-nay', { width: 1280, height: 900 });
  await expect(page.locator('body')).toContainText('trả ngày 10/11');
});
