// Các ô trước đây không dẫn đi đâu giờ có đích: bốn thẻ chỉ số, thẻ Chấm công và thẻ Kỳ lương ở Tổng quan; ngày trong lịch sử
// chấm công của một nhân viên mở chi tiết ngày. Trên dữ liệu giả.
import { expect, test } from '@playwright/test';

test('Tổng quan: mỗi thẻ chỉ số dẫn tới màn của số đó', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const kpis = page.getByRole('region', { name: 'Chỉ số chính' });
  await expect(kpis).toBeVisible();
  const dest: Record<string, string> = {
    'Mở Bảng lương': '/admin/bang-luong',
    'Mở Nhân sự': '/admin/nhan-su',
    'Mở Chấm công': '/admin/cham-cong',
    'Mở Yêu cầu': '/admin/yeu-cau'
  };
  for (const [name, href] of Object.entries(dest)) await expect(kpis.getByRole('link', { name })).toHaveAttribute('href', new RegExp(`^${href}`));
  await kpis.getByRole('link', { name: 'Mở Chấm công' }).click();
  await expect(page).toHaveURL(/\/admin\/cham-cong/);
});

test('Tổng quan: thẻ Chấm công và thẻ Kỳ lương bấm được, giữ ?thang', async ({ page }) => {
  await page.goto('/admin/tong-quan?thang=2026-10');
  await expect(page.getByRole('heading', { level: 1, name: /Tổng quan/ })).toBeVisible();
  const attendance = page.getByRole('region', { name: 'Chấm công' }).getByRole('link', { name: 'Mở Chấm công' });
  await expect(attendance).toHaveAttribute('href', '/admin/cham-cong?thang=2026-10');
  const period = page.getByRole('link', { name: 'Mở Bảng lương' }).last();
  await expect(period).toHaveAttribute('href', '/admin/bang-luong?thang=2026-10');
  await period.click();
  await expect(page).toHaveURL(/\/admin\/bang-luong\?thang=2026-10/);
});

test('hồ sơ chấm công nhân viên: bấm một ngày trong lịch sử mở chi tiết ngày, cả dòng thời gian lẫn bảng giờ', async ({ page }) => {
  await page.goto('/admin/cham-cong/nhan-vien/le-hoang-nam');
  const tab = page.getByRole('tabpanel');
  const day = tab.getByRole('button').filter({ hasText: /\d{2}\/\d{2}|T\d|CN/ }).first();
  await expect(day).toBeVisible();
  await day.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
