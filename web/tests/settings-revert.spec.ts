import { expect, test, type Page } from '@playwright/test';
import { revertLines, revertMonth } from '../src/builders/api/settings-screens';
import { groupHistory, resetSettingsMock, saveGroup, settingsAt } from '../src/mock/settings';
import { inApp } from './fixtures/in-app';

// Hoàn tác trong Tất cả cài đặt theo tháng áp dụng của dòng lịch sử: hộp mở ở tháng của dòng, các câu so với số của
// tháng đang chọn trong hộp. Dữ liệu giả (mock/settings.ts) trong bộ nhớ, không page.route, không goto lại giữa các bước.
const item = (page: Page, key: string) => page.locator(`[data-setting-key="${key}"]`);
const revertDialog = (page: Page) => page.getByRole('dialog', { name: 'Hoàn tác' });
const settingsIn = (page: Page, month: string, group: string) =>
  inApp(page, `const S = await import('/src/mock/settings.ts'); return S.settingsAt('${month}').groups.${group}.values;`);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

// Lưu qua hộp "Lưu thay đổi" từ tháng `label`; chờ hộp đóng (lưu xong) rồi mới đi tiếp.
async function saveFrom(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Áp dụng từ tháng' }).selectOption({ label });
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dlg).toHaveCount(0);
}

test('revertMonth is the row month but never before minMonth; revertLines compares with that month', () => {
  resetSettingsMock();
  saveGroup('insurance', { effectiveMonth: '2026-11', values: { bhxhPct: 8.5 }, reason: null, stamp: 0 });
  const [row] = groupHistory('insurance').items;
  expect(revertMonth(row, '2026-10')).toBe('2026-11');
  expect(revertMonth({ ...row, month: '2026-09' }, '2026-10')).toBe('2026-10');
  expect(revertLines('insurance', row, settingsAt('2026-11').groups.insurance.values, '2026-11')).toEqual([
    'BHXH 8,5% → 8%, áp dụng từ tháng 11/2026'
  ]);
  expect(revertLines('insurance', row, settingsAt('2026-10').groups.insurance.values, '2026-10')).toEqual([]);
});

test('revertLines lists every KPI weight that differs at the chosen month', () => {
  resetSettingsMock();
  const a = saveGroup('kpi-weights', { effectiveMonth: '2026-10', values: { wework: 38, user: 24, peer: 20, manager: 12, self: 6 }, reason: null, stamp: 0 });
  saveGroup('kpi-weights', { effectiveMonth: '2026-12', values: { wework: 38, user: 20, peer: 20, manager: 12, self: 10 }, reason: null, stamp: a.stamp });
  const first = groupHistory('kpi-weights').items.find(h => h.month === '2026-10')!;
  expect(revertLines('kpiWeights', first, settingsAt('2026-12').groups.kpiWeights.values, '2026-12')).toEqual([
    'Trọng số Base Wework 38% → 40%, áp dụng từ tháng 12/2026',
    'Trọng số Người dùng 20% → 24%, áp dụng từ tháng 12/2026',
    'Trọng số Đồng nghiệp 20% → 18%, áp dụng từ tháng 12/2026',
    'Trọng số Tự đánh giá 10% → 6%, áp dụng từ tháng 12/2026'
  ]);
});

test('Hoàn tác of a change saved from a later month opens on that month and puts that month back', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=bao-hiem');
  await page.getByRole('textbox', { name: 'BHXH' }).fill('8,5');
  await saveFrom(page, 'Tháng 11/2026');
  await expect(page.getByRole('textbox', { name: 'BHXH' })).toHaveValue('8'); // thẻ đã về 10/2026

  const bhxh = item(page, 'bhxhPct');
  await bhxh.getByRole('button', { name: 'Lịch sử' }).click();
  await bhxh.getByRole('button', { name: 'Hoàn tác' }).click();
  const dlg = revertDialog(page);
  await expect(dlg.getByRole('combobox', { name: 'Áp dụng từ tháng' })).toHaveValue('2026-11');
  await expect(dlg.locator('li')).toHaveText(['BHXH 8,5% → 8%, áp dụng từ tháng 11/2026']);
  await dlg.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.getByText('Đã hoàn tác')).toBeVisible();
  expect(await settingsIn(page, '2026-11', 'insurance')).toMatchObject({ bhxhPct: 8 });

  // Dòng mới (8,5 → 8 từ 11/2026) còn hoàn tác được; dòng cũ đưa về 8, mà 11/2026 đang là 8, nên tắt.
  const rows = bhxh.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('8,5% → 8%');
  await expect(rows.nth(0).getByRole('button', { name: 'Hoàn tác' })).toBeEnabled();
  await expect(rows.nth(1)).toContainText('8% → 8,5%');
  await expect(rows.nth(1).getByRole('button', { name: 'Hoàn tác' })).toBeDisabled();
});

test('a KPI revert lists every weight that changes at the month picked in the dialog', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=luong-kpi');
  await page.getByRole('textbox', { name: 'Base Wework' }).fill('38');
  await page.getByRole('textbox', { name: 'Đồng nghiệp' }).fill('20');
  await saveFrom(page, 'Tháng 10/2026'); // 10/2026: 38/24/20/12/6
  await page.getByRole('textbox', { name: 'Người dùng' }).fill('20');
  await page.getByRole('textbox', { name: 'Tự đánh giá' }).fill('10');
  await saveFrom(page, 'Tháng 12/2026'); // 12/2026: 38/20/20/12/10

  const wework = item(page, 'wework');
  await wework.getByRole('button', { name: 'Lịch sử' }).click();
  await expect(wework.locator('tbody tr')).toHaveCount(1);
  await wework.getByRole('button', { name: 'Hoàn tác' }).click();
  const dlg = revertDialog(page);
  const month = dlg.getByRole('combobox', { name: 'Áp dụng từ tháng' });
  await expect(month).toHaveValue('2026-10');
  await expect(dlg.locator('li')).toHaveText([
    'Trọng số Base Wework 38% → 40%, áp dụng từ tháng 10/2026',
    'Trọng số Đồng nghiệp 20% → 18%, áp dụng từ tháng 10/2026'
  ]);
  await month.selectOption({ label: 'Tháng 12/2026' });
  await expect(dlg.locator('li')).toHaveText([
    'Trọng số Base Wework 38% → 40%, áp dụng từ tháng 12/2026',
    'Trọng số Người dùng 20% → 24%, áp dụng từ tháng 12/2026',
    'Trọng số Đồng nghiệp 20% → 18%, áp dụng từ tháng 12/2026',
    'Trọng số Tự đánh giá 10% → 6%, áp dụng từ tháng 12/2026'
  ]);
  await dlg.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.getByText('Đã hoàn tác')).toBeVisible();
  expect(await settingsIn(page, '2026-12', 'kpiWeights')).toEqual({ wework: 40, user: 24, peer: 18, manager: 12, self: 6 });
});
