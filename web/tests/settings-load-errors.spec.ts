import { expect, test, type Page } from '@playwright/test';

// Các màn Cài đặt khi kho cài đặt không trả lời: mỗi thẻ hiện "Không tải được … Thử lại" thay vì để trống; máy chủ trả lời
// lại thì bấm Thử lại là thẻ hiện đủ. Móc của dữ liệu giả (services/settings-store.ts): window.__mockSettingsDown = true
// thì mọi lời gọi kho cài đặt bị từ chối; là mảng tên hàm (vd. ['getShifts']) thì chỉ các hàm đó bị từ chối.
type Down = true | string[];

async function settingsDown(page: Page, down: Down) {
  await page.addInitScript(d => ((window as unknown as { __mockSettingsDown: Down }).__mockSettingsDown = d), down);
}
const settingsUp = (page: Page) =>
  page.evaluate(() => ((window as unknown as { __mockSettingsDown: Down | false }).__mockSettingsDown = false));

// Bấm lần lượt mọi nút Thử lại đang hiện (mỗi lần bấm, dòng báo lỗi của thẻ đó mất đi).
async function retryAll(page: Page) {
  const retry = page.getByRole('button', { name: 'Thử lại' });
  while ((await retry.count()) > 0) await retry.first().click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('Lịch shows a retry line on every settings card and fills them after Thử lại', async ({ page }) => {
  await settingsDown(page, true);
  await page.goto('/admin/cai-dat/lich');
  for (const what of ['lịch năm', 'ca làm', 'ngày trả lương', 'vùng chấm công']) {
    await expect(page.getByRole('alert').filter({ hasText: `Không tải được ${what}.` })).toBeVisible();
  }

  await settingsUp(page);
  await retryAll(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Lịch năm' })).toBeVisible();
  await expect(page.getByText('6 ca cố định')).toBeVisible();
  await expect(page.getByLabel('Ngày trả lương hằng tháng')).toHaveValue('10');
  await expect(page.getByLabel('Bán kính vùng chấm công')).toHaveValue('150');
});

test('the pay-day card still shows when only the shift list fails', async ({ page }) => {
  await settingsDown(page, ['getShifts']);
  await page.goto('/admin/cai-dat/lich');
  await expect(page.getByRole('alert').filter({ hasText: 'Không tải được ca làm.' })).toBeVisible();
  await expect(page.getByLabel('Ngày trả lương hằng tháng')).toHaveValue('10');
});

test('Cách tính lương shows a retry line instead of an empty page', async ({ page }) => {
  await settingsDown(page, true);
  await page.goto('/admin/cai-dat');
  await expect(page.getByRole('alert')).toContainText('Không tải được cách tính lương.');

  await settingsUp(page);
  await retryAll(page);
  await expect(page.getByRole('cell', { name: 'Tiền làm thêm giờ' })).toBeVisible();
});

test('a pay drawer opens with a retry line when its numbers fail to load', async ({ page }) => {
  await settingsDown(page, true);
  await page.goto('/admin/cai-dat?hop=lam-them');
  const drawer = page.getByRole('dialog', { name: 'Tiền làm thêm giờ' });
  await expect(drawer.getByRole('alert')).toContainText('Không tải được số đang áp dụng.');

  await settingsUp(page);
  await drawer.getByRole('button', { name: 'Thử lại' }).click();
  await expect(drawer.getByLabel('Ngày thường')).toHaveValue('1,5');
});

test('Quy tắc KPI shows a retry line instead of an empty page', async ({ page }) => {
  await settingsDown(page, true);
  await page.goto('/admin/cai-dat/kpi');
  await expect(page.getByRole('alert')).toContainText('Không tải được trọng số KPI.');

  await settingsUp(page);
  await retryAll(page);
  await expect(page.locator('.wts')).toContainText('40%');
});

test('a group in Tất cả cài đặt shows a retry line instead of loading forever', async ({ page }) => {
  await settingsDown(page, true);
  await page.goto('/admin/cai-dat/tat-ca');
  await expect(page.getByRole('alert')).toContainText('Không tải được nhóm OT.');

  await settingsUp(page);
  await retryAll(page);
  await expect(page.getByLabel('Hệ số OT ngày thường')).toHaveValue('1,5');
});
