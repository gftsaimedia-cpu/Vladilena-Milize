import { expect, test, type Page } from '@playwright/test';

// Các bước kỳ lương trên dữ liệu giả (mock/period.ts): tháng 10 ở "Đã tính", còn phiếu chưa duyệt nên Phê duyệt kỳ bị khoá.
// Trạng thái kỳ giả nằm trong bộ nhớ trang; `demo.unapproved` đặt qua module của Vite để mở khoá nút.
const URL10 = '/admin/bang-luong?thang=2026-10';
const strip = (page: Page) => page.locator('.period');
const approveBtn = (page: Page) => page.getByRole('button', { name: 'Phê duyệt kỳ lương' });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('approve is locked while slips are unapproved, with the reason shown', async ({ page }) => {
  await page.goto(URL10);
  await expect(strip(page)).toContainText('Chờ phê duyệt');
  await expect(approveBtn(page)).toBeDisabled();
  await expect(strip(page).locator('.why')).toContainText(/^Còn \d+ phiếu chưa duyệt$/);
  await expect(page.getByRole('button', { name: 'Mở lại công' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đã trả lương' })).toHaveCount(0);
});

test('approve, then undo with a required reason', async ({ page }) => {
  await page.goto(URL10);
  await page.evaluate(async () => {
    (await import('/src/mock/period.ts')).demo.unapproved = 0;
  });
  // đổi tháng đi rồi về để đọc lại kỳ
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  await page.getByRole('button', { name: 'Tháng sau' }).click();
  await expect(approveBtn(page)).toBeEnabled();
  await approveBtn(page).click();
  const dlg = page.getByRole('dialog', { name: 'Phê duyệt kỳ lương tháng 10/2026' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Phê duyệt kỳ lương' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(strip(page)).toContainText('Chờ trả lương');
  await expect(approveBtn(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Đã trả lương' })).toHaveCount(0); // chưa tới ngày trả lương

  // Ngăn kéo phiếu khi kỳ đã phê duyệt: không còn Duyệt / Từ chối, điểm KPI chỉ xem, có câu giải thích.
  await page.locator('tbody tr').filter({ hasText: /Nháp|Chờ duyệt/ }).first().locator('a.nn').click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('Kỳ lương đã phê duyệt: không duyệt, từ chối hay sửa điểm KPI được nữa.')).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Duyệt phiếu' })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Từ chối' })).toHaveCount(0);
  await expect(drawer.getByText('Điểm KPI chỉ xem: kỳ lương đã phê duyệt.')).toBeVisible();
  await expect(drawer.getByRole('textbox', { name: /^Điểm .* phần trăm$/ }).first()).toHaveAttribute('readonly', '');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Huỷ phê duyệt' }).click();
  const undo = page.getByRole('dialog', { name: 'Huỷ phê duyệt tháng 10/2026' });
  const ok = undo.getByRole('button', { name: 'Huỷ phê duyệt' });
  await expect(ok).toBeDisabled();
  await undo.getByLabel(/Lý do/).fill('Sai điểm KPI');
  await ok.click();
  await expect(undo).toHaveCount(0);
  await expect(strip(page)).toContainText('Chờ phê duyệt');
  await expect(approveBtn(page)).toBeEnabled();
});
