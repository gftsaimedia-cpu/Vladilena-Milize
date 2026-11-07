// Form Giải trình chỉ hiện ngày của tháng đang xem (?thang=YYYY-MM, hoặc tháng của ?ngay=), trên dữ liệu giả.
// Hôm nay 28/10/2026; ngày cần giải trình đều nằm trong tháng 10.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openDesktop } from './fixtures/staff-desktop';
import { openPhone } from './fixtures/staff-phone';

const sheetOf = (page: Page, name: string) => page.getByRole('dialog', { name });
const dayOptions = (select: Locator) => select.locator('option:not([value=""])');

test.describe('phone', () => {
  test('tháng 10: chỉ các ngày của tháng 10', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=giai-trinh&thang=2026-10');
    const sheet = sheetOf(page, 'Giải trình');
    const options = dayOptions(sheet.getByLabel('Ngày'));
    await expect(options).not.toHaveCount(0);
    for (const value of await options.evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))) expect(value.startsWith('2026-10')).toBe(true);
    await expect(sheet.getByText('Ngày của tháng 10 mà máy báo cần giải trình')).toBeVisible();
  });

  test('tháng 9 không có ngày nào: ô chọn bị khoá và nói rõ', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=giai-trinh&thang=2026-09');
    const sheet = sheetOf(page, 'Giải trình');
    await expect(sheet.getByLabel('Ngày')).toBeDisabled();
    await expect(dayOptions(sheet.getByLabel('Ngày'))).toHaveCount(0);
    await expect(sheet.getByRole('status').filter({ hasText: 'Tháng 9 không có ngày nào cần giải trình' })).toBeVisible();
  });

  test('mở từ một ngày (?ngay=) thì lấy tháng của ngày đó, ngày được chọn sẵn', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=giai-trinh&ngay=2026-10-24');
    const sheet = sheetOf(page, 'Giải trình');
    await expect(sheet.getByLabel('Ngày')).toHaveValue('2026-10-24');
    await expect(sheet.getByText('Ngày của tháng 10 mà máy báo cần giải trình')).toBeVisible();
  });

  test('không có tháng và không có ngày thì hiện đủ như trước', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=giai-trinh');
    const sheet = sheetOf(page, 'Giải trình');
    await expect(dayOptions(sheet.getByLabel('Ngày'))).not.toHaveCount(0);
    await expect(sheet.getByText('Chỉ có những ngày máy báo cần giải trình và chưa gửi đơn')).toBeVisible();
  });

  test('tháng sai dạng bị bỏ qua', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=giai-trinh&thang=abc');
    await expect(dayOptions(sheetOf(page, 'Giải trình').getByLabel('Ngày'))).not.toHaveCount(0);
  });

  test('đổi từ menu sang Giải trình giữ tháng đang chọn', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=chon&thang=2026-09');
    const sheet = sheetOf(page, 'Tạo yêu cầu');
    await sheet.getByRole('button', { name: /Giải trình/ }).click();
    await expect(page).toHaveURL(/tao=giai-trinh&thang=2026-09$/);
    await expect(sheetOf(page, 'Giải trình').getByLabel('Ngày')).toBeDisabled();
  });
});

test('máy tính: bấm Tạo yêu cầu mang theo tháng đang xem ở cột Chấm công', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await page.getByRole('button', { name: /Tạo yêu cầu/ }).click();
  await expect(page).toHaveURL(/tao=chon&thang=2026-10$/);
});
