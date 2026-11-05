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

// Thẻ "Ngày trả lương": 1–28, áp dụng từ một tháng, hộp xác nhận rồi lưu.
const payCard = (page: Page) => page.locator('section', { has: page.getByRole('heading', { name: 'Ngày trả lương' }) });
const payField = (page: Page) => payCard(page).getByRole('textbox', { name: 'Ngày trả lương hằng tháng' });
const fromMonth = (page: Page) => payCard(page).getByRole('combobox', { name: 'Áp dụng từ tháng' });
const savePay = (page: Page) => payCard(page).getByRole('button', { name: 'Lưu', exact: true });

async function savePay15From1226(page: Page) {
  await page.goto('/admin/cai-dat/lich');
  await fromMonth(page).selectOption({ label: 'Tháng 12/2026' });
  await payField(page).fill('15');
  await savePay(page).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await expect(dlg).toContainText('Ngày trả lương 10 → 15, áp dụng từ tháng 12/2026');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu')).toBeVisible();
}

test('pay-day field takes only 1 to 28', async ({ page }) => {
  await page.goto('/admin/cai-dat/lich');
  const card = payCard(page);
  const f = payField(page);
  await expect(card).toContainText('Bắt đầu tính công: ngày 1');
  await expect(card).toContainText('Chưa có thay đổi');
  await f.fill('29');
  await expect(f).toHaveValue('10');
  await f.fill('0');
  await expect(card).toContainText('Từ 1 đến 28');
  await expect(savePay(page)).toBeDisabled();
});

test('saving pay day 15 from 12/2026 moves the dots from that month on', async ({ page }) => {
  await savePay15From1226(page);
  await expect(day(page, 10, 12)).toHaveClass(/\bpay\b/);
  await page.getByRole('button', { name: 'Năm sau' }).click();
  await expect(day(page, 15, 1)).toHaveClass(/\bpay\b/);
  await expect(day(page, 10, 1)).not.toHaveClass(/\bpay\b/);
});

test('switching the month makes untouched fields follow that month', async ({ page }) => {
  await savePay15From1226(page);
  const card = payCard(page);
  await fromMonth(page).selectOption({ label: 'Tháng 12/2026' });
  await expect(payField(page)).toHaveValue('15');
  await expect(card).toContainText('Chưa có thay đổi');
  await fromMonth(page).selectOption({ label: 'Tháng 11/2026' });
  await expect(payField(page)).toHaveValue('10');
});
