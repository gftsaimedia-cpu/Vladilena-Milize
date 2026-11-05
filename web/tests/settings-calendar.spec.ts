import { expect, test, type Page } from '@playwright/test';
import { inApp } from './fixtures/in-app';

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
  // Lưu xong thẻ vẫn ở 12/2026, với số vừa lưu.
  await expect(fromMonth(page)).toHaveValue('2026-12');
  await expect(payField(page)).toHaveValue('15');
  await expect(card).toContainText('Chưa có thay đổi');
  await fromMonth(page).selectOption({ label: 'Tháng 11/2026' });
  await expect(payField(page)).toHaveValue('10');
  await fromMonth(page).selectOption({ label: 'Tháng 12/2026' });
  await expect(payField(page)).toHaveValue('15');
  await expect(card).toContainText('Chưa có thay đổi');
});

// Review Focus 2: ô đã gõ giữ số khi đổi tháng, còn câu xác nhận so với số của tháng đang chọn.
test('a typed pay day survives a month switch and the confirm line compares with the chosen month', async ({ page }) => {
  await savePay15From1226(page);
  const card = payCard(page);
  await fromMonth(page).selectOption({ label: 'Tháng 10/2026' });
  await expect(payField(page)).toHaveValue('10');
  await payField(page).fill('20');
  await fromMonth(page).selectOption({ label: 'Tháng 12/2026' });
  await expect(payField(page)).toHaveValue('20');
  await expect(card).toContainText('Có 1 thay đổi chưa lưu');
  await savePay(page).click();
  await expect(page.getByRole('dialog', { name: 'Lưu thay đổi' }).locator('li')).toHaveText([
    'Ngày trả lương 15 → 20, áp dụng từ tháng 12/2026'
  ]);
});

// Thẻ "Vùng chấm công": lưu là áp dụng ngay, không theo tháng, không có ô lý do.
const zoneCard = (page: Page) => page.locator('section', { has: page.getByRole('heading', { name: 'Vùng chấm công' }) });

test('zone radius takes 20 to 5000 m and saves at once', async ({ page }) => {
  await page.goto('/admin/cai-dat/lich');
  const zone = zoneCard(page);
  const r = zone.getByRole('textbox', { name: 'Bán kính vùng chấm công' });
  await expect(r).toHaveValue('150');
  await r.fill('6000');
  await expect(r).toHaveValue('150');
  await r.fill('10');
  await expect(zone.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  await r.fill('200');
  await zone.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await expect(dlg).toContainText('Bán kính 150 m → 200 m, áp dụng ngay');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu')).toBeVisible();
  await expect(r).toHaveValue('200');
  await expect(zone).toContainText('Chưa có thay đổi');
});

test('a stale zone save keeps the typed radius and says the zone was reloaded', async ({ page }) => {
  await page.goto('/admin/cai-dat/lich');
  const zone = zoneCard(page);
  const r = zone.getByRole('textbox', { name: 'Bán kính vùng chấm công' });
  await expect(r).toHaveValue('150');
  await r.fill('200');
  // Người khác vừa lưu vùng (đổi vĩ độ) nên stamp trên màn đã cũ.
  await inApp(page, `const S = await import('/src/mock/settings.ts'); const z = S.zoneOf(); S.saveZoneOf({ ...z.zone, lat: 10.8, reason: null, stamp: z.stamp });`);
  await zone.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Lưu thay đổi' }).getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Có người vừa lưu trước, đã tải lại')).toBeVisible();
  await expect(r).toHaveValue('200');
  await expect(zone.getByRole('textbox', { name: 'Vĩ độ' })).toHaveValue('10,8'); // ô chưa gõ theo vùng vừa tải
  await expect(zone).toContainText('Có thay đổi chưa lưu');
  await zone.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Lưu thay đổi' })).toContainText('Bán kính 150 m → 200 m, áp dụng ngay');
});

test('an empty latitude or longitude says Nhập một số under its box', async ({ page }) => {
  await page.goto('/admin/cai-dat/lich');
  const zone = zoneCard(page);
  await zone.getByRole('textbox', { name: 'Vĩ độ' }).fill('');
  await expect(zone.locator('.zn-fld', { hasText: 'Vĩ độ' })).toContainText('Nhập một số');
  await zone.getByRole('textbox', { name: 'Kinh độ' }).fill('');
  await expect(zone.locator('.zn-fld', { hasText: 'Kinh độ' })).toContainText('Nhập một số');
  await expect(zone.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
});

test('Dùng vị trí hiện tại fills the coordinates', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 10.8, longitude: 106.65 });
  await page.goto('/admin/cai-dat/lich');
  const zone = zoneCard(page);
  await zone.getByRole('button', { name: 'Dùng vị trí hiện tại' }).click();
  await expect(zone.getByRole('textbox', { name: 'Vĩ độ' })).toHaveValue('10,8');
  await expect(zone.getByRole('textbox', { name: 'Kinh độ' })).toHaveValue('106,65');
});
