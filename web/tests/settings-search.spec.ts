import { expect, test, type Page } from '@playwright/test';
import { ALL_GROUPS, normalizeSearch, searchSettings } from '../src/builders/api/settings-screens';

// Cài đặt › Tất cả cài đặt trên dữ liệu giả (mock/settings.ts): tám nhóm, tìm kiếm, lưu. Không page.route.
// Dữ liệu giả nằm trong bộ nhớ và về lại ban đầu sau mỗi lần tải trang, nên test lưu rồi kiểm không được goto lại.
const item = (page: Page, key: string) => page.locator(`[data-setting-key="${key}"]`);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('the group table has eight groups with 3 · 1 · 5 · 1 · 1 · 3 · 4 · 1 items', () => {
  expect(ALL_GROUPS.map(g => [g.name, g.items.length])).toEqual([
    ['OT', 3],
    ['Phụ cấp', 1],
    ['KPI', 5],
    ['Khấu trừ', 1],
    ['Tạm ứng', 1],
    ['Bảo hiểm', 3],
    ['Thuế', 4],
    ['Kỳ lương', 1]
  ]);
  expect(ALL_GROUPS.find(g => g.key === 'thue')?.items.find(i => i.key === 'brackets')?.brackets).toBe(true);
  expect(ALL_GROUPS.find(g => g.key === 'tam-ung')?.group).toBeNull();
});

test('search text drops diacritics, đ and extra spaces', () => {
  expect(normalizeSearch('  Giảm   TRỪ Đồng  ')).toBe('giam tru dong');
  expect(searchSettings('   ')).toEqual([]);
  expect(searchSettings('giam tru').map(r => [r.groupKey, r.itemKey, r.title, r.groupName])).toEqual([
    ['thue', 'personalDeduction', 'Giảm trừ bản thân', 'Thuế'],
    ['thue', 'dependantDeduction', 'Giảm trừ người phụ thuộc', 'Thuế']
  ]);
  expect(searchSettings('bao hiem').map(r => r.itemKey)).toEqual(['bhxhPct', 'bhytPct', 'bhtnPct']);
});

test('groups list only the eight groups with their item counts', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca');
  for (const [name, n] of [['OT', 3], ['Phụ cấp', 1], ['KPI', 5], ['Khấu trừ', 1], ['Tạm ứng', 1], ['Bảo hiểm', 3], ['Thuế', 4], ['Kỳ lương', 1]])
    await expect(page.getByRole('button', { name: `${name} ${n}`, exact: true })).toBeVisible();
  await expect(page.locator('[data-setting-key]')).toHaveCount(3);
  await expect(item(page, 'weekdayRate')).toContainText('Hệ số OT ngày thường');
});

test('no gold strip, no Chưa xác nhận filter, no menu count', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca');
  for (const t of ['chưa ai xác nhận', 'Chưa xác nhận', 'Xem trước']) await expect(page.locator('body')).not.toContainText(t);
  await expect(page.getByRole('link', { name: 'Tất cả cài đặt' })).toHaveText(/^\s*Tất cả cài đặt\s*$/);
});

test('search finds items across groups without diacritics', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca');
  await page.getByRole('textbox', { name: 'Tìm theo tên cài đặt' }).fill('giam tru');
  await page.getByRole('button', { name: /Giảm trừ bản thân/ }).click();
  await expect(page).toHaveURL(/group=thue/);
  await expect(page).toHaveURL(/setting=personalDeduction/);
  await expect(page.getByRole('textbox', { name: 'Giảm trừ bản thân' })).toBeFocused();
});

test('?q= fills the search box and lists the matching items', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?q=b%E1%BA%A3o%20hi%E1%BB%83m');
  await expect(page.getByRole('textbox', { name: 'Tìm theo tên cài đặt' })).toHaveValue('bảo hiểm');
  await expect(page.locator('.result')).toHaveCount(3);
  await expect(page.locator('.result').filter({ hasText: 'BHYT' })).toContainText('Mở mục');
});

test('Tạm ứng is text only', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=tam-ung');
  await expect(item(page, 'advance')).toContainText('80% lương của ngày công 01–15');
  await expect(item(page, 'advance').getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Áp dụng từ tháng' })).toHaveCount(0);
});

test('frame search carries only month context and returns to its source with Back', async ({ page }) => {
  const source = '/admin/cai-dat/lich?thang=2026-11&hop=old&group=old&setting=old.setting';
  await page.goto(source);
  await page.getByLabel('Tìm cài đặt').fill('thuế');
  await page.getByLabel('Tìm cài đặt').press('Enter');

  await expect(page).toHaveURL(/\/admin\/cai-dat\/tat-ca\?thang=2026-11&q=thu%E1%BA%BF$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(source);
});

test('month and reason appear only once something changed; Lưu is locked until then', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=bao-hiem');
  const save = page.getByRole('button', { name: 'Lưu', exact: true });
  await expect(page.getByRole('textbox', { name: 'BHXH' })).toHaveValue('8');
  await expect(save).toBeDisabled();
  await expect(page.getByText('Chưa có thay đổi')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Áp dụng từ tháng' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'BHXH' }).fill('9');
  await expect(item(page, 'bhxhPct')).toContainText('Đang áp dụng 8%');
  await expect(page.getByRole('combobox', { name: 'Áp dụng từ tháng' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Lý do' })).toBeVisible();
  await expect(save).toBeEnabled();
  await page.getByRole('button', { name: 'Huỷ', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'BHXH' })).toHaveValue('8');
  await expect(save).toBeDisabled();
});

test('KPI keeps Lưu locked while the five weights do not total 100', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=luong-kpi');
  await expect(page.locator('[data-setting-key]')).toHaveCount(5);
  await page.getByRole('textbox', { name: 'Người dùng' }).fill('22');
  await expect(page.getByText('Tổng 98/100')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Tự đánh giá' }).fill('8');
  await expect(page.getByText('Tổng 98/100')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeEnabled();
});

test('switching group with unsaved edits asks first and keeps the edit when declined', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=bao-hiem');
  await page.getByRole('textbox', { name: 'BHXH' }).fill('9');
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name: 'Thuế 4', exact: true }).click();
  await expect(page).toHaveURL(/group=bao-hiem/);
  await expect(page.getByRole('textbox', { name: 'BHXH' })).toHaveValue('9');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Thuế 4', exact: true }).click();
  await expect(page).toHaveURL(/group=thue/);
  await expect(item(page, 'personalDeduction')).toBeVisible();
});

// P6 (docs/superpowers/specs/2026-11-05-positions-settings-design.md): không thêm chức vụ mới, BE cũng không có
// POST /positions, nên Tất cả cài đặt không có nút "Thêm chức vụ" và địa chỉ cũ ?hop=them-chuc-vu không mở hộp nào.
test('the old ?hop=them-chuc-vu address opens no add-position dialog', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?hop=them-chuc-vu');
  await expect(page.getByRole('heading', { name: 'Tất cả cài đặt' }).or(page.getByRole('alert'))).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Thêm chức vụ' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Thêm chức vụ' })).toHaveCount(0);
});

test('saving BHXH 8% → 8,5% from 11/2026 confirms the change line', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=bao-hiem');
  await page.getByRole('textbox', { name: 'BHXH' }).fill('8,5');
  await page.getByRole('combobox', { name: 'Áp dụng từ tháng' }).selectOption({ label: 'Tháng 11/2026' });
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await expect(dlg).toContainText('BHXH 8% → 8,5%, áp dụng từ tháng 11/2026');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu')).toBeVisible();
});

test('tax brackets refuse a bound below the previous one', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=thue');
  const b2 = page.getByRole('textbox', { name: 'Bậc 2 · đến' });
  await b2.fill('5.000.000');
  await expect(page.getByText('Phải lớn hơn 10.000.000 đ')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  await b2.fill('35.000.000');
  await expect(page.locator('tr', { has: page.getByText('3', { exact: true }) })).toContainText('35.000.000 đ');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Lưu thay đổi' })).toContainText('Biểu thuế bậc 2, đến 30.000.000 đ → 35.000.000 đ, áp dụng từ tháng 10/2026');
});

test('the bracket table shows five rows, the last one without a limit', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=thue');
  const table = item(page, 'brackets');
  await expect(table.getByRole('columnheader')).toHaveText(['Bậc', 'Thu nhập trên', 'Đến', 'Thuế suất']);
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(table.locator('tbody tr').nth(0)).toContainText('0 đ');
  await expect(table.getByRole('textbox', { name: 'Bậc 1 · đến' })).toHaveValue('10.000.000');
  await expect(table.getByRole('textbox', { name: 'Bậc 5 · thuế suất' })).toHaveValue('35');
  await expect(table.getByRole('textbox', { name: 'Bậc 5 · đến' })).toHaveCount(0);
  await expect(table.locator('tbody tr').nth(4)).toContainText('100.000.000 đ');
  await expect(table.locator('tbody tr').nth(4)).toContainText('Không giới hạn');
  await expect(table).toContainText('Mức “thu nhập trên” của mỗi bậc lấy theo mức “đến” của bậc trước.');
  await table.getByRole('textbox', { name: 'Bậc 3 · thuế suất' }).fill('150');
  await expect(table.getByRole('textbox', { name: 'Bậc 3 · thuế suất' })).toHaveValue('20');
});
