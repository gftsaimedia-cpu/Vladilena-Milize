import { expect, test, type Page } from '@playwright/test';

// Hai màn Cài đặt "Chế độ theo loại nhân sự" và "Chức vụ & bậc" trên dữ liệu giả (mock/positions.ts): không page.route.
// Tháng giả 10/2026; Nhân viên có thêm phiên bản từ 12/2026 với Flex 25%. Lưu chỉ ghi lại lời gọi vào
// globalThis.__mockPositionsWrites.
const writes = (page: Page) => page.evaluate(() => (globalThis as { __mockPositionsWrites?: unknown[] }).__mockPositionsWrites);
const saveBar = (page: Page) => page.locator('.savebar').getByRole('button', { name: 'Lưu', exact: true });
const FLEX_LINE = 'Nhân viên · Phụ cấp Flex: 20% → 25% · 12 người';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('the benefits screen shows one row per type and only the six ticks', async ({ page }) => {
  await page.goto('/admin/cai-dat/che-do/nhan-vien');
  const tables = page.locator('table.ql');
  await expect(tables.first().locator('tbody tr')).toHaveCount(1);
  await expect(page.getByText('Theo từng người')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Bậc', exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Nghỉ được duyệt' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Thêm chế độ' })).toHaveCount(0);
  await expect(page.getByText('Cờ thuế và bảo hiểm của khoản thêm')).toHaveCount(0);
  await expect(tables.nth(1).locator('thead th')).toHaveText(['Nghỉ phép năm', 'iSAT', 'OT', 'Làm bù']);
});

test('Lưu stays off until a value really changes', async ({ page }) => {
  await page.goto('/admin/cai-dat/che-do/nhan-vien');
  const flex = page.getByLabel('Phụ cấp Flex · Nhân viên');
  await expect(flex).toHaveValue('20');
  await expect(saveBar(page)).toBeDisabled();
  await flex.fill('25');
  await expect(saveBar(page)).toBeEnabled();
  await flex.fill('20');
  await expect(saveBar(page)).toBeDisabled();
});

test('the confirm dialog lists the change against the chosen month', async ({ page }) => {
  await page.goto('/admin/cai-dat/che-do/nhan-vien');
  await page.getByLabel('Phụ cấp Flex · Nhân viên').fill('25');
  await saveBar(page).click();

  const dlg = page.getByRole('dialog', { name: 'Lưu chế độ' });
  await expect(dlg.getByText(FLEX_LINE)).toBeVisible();
  const month = dlg.getByLabel('Áp dụng từ tháng');
  await expect(month.locator('option')).toHaveCount(6);
  await expect(month.locator('option').first()).toHaveText('Tháng 10/2026');

  const ok = dlg.getByRole('button', { name: 'Lưu', exact: true });
  await month.selectOption({ label: 'Tháng 12/2026' });
  await expect(dlg.getByText(FLEX_LINE)).toHaveCount(0);
  await expect(ok).toBeDisabled();

  await month.selectOption({ label: 'Tháng 10/2026' });
  await ok.click();
  await expect(dlg).toHaveCount(0);
  expect(await writes(page)).toEqual([
    {
      method: 'PUT',
      path: '/positions',
      body: { effectiveMonth: '2026-10', items: [{ code: 'nv', expectedRev: 0, changes: { flexPct: 25 } }] }
    }
  ]);
});

test('Sửa chức vụ starts at this month, shows NV night by person and blocks bad numbers', async ({ page }) => {
  await page.goto('/admin/cai-dat/chuc-vu-bac');
  await page.getByRole('button', { name: 'Sửa chức vụ Nhân viên' }).click();

  const dlg = page.getByRole('dialog', { name: 'Sửa chức vụ' });
  const month = dlg.getByLabel('Áp dụng từ tháng');
  await expect(month.locator('option')).toHaveCount(6);
  await expect(month.locator('option').first()).toHaveText('Tháng 10/2026');
  await expect(dlg.getByText('Theo từng người')).toBeVisible();
  await expect(dlg.getByLabel('Phụ cấp Night')).toHaveCount(0);

  const ok = dlg.getByRole('button', { name: 'Lưu', exact: true });
  await expect(ok).toBeDisabled();

  const days = dlg.getByLabel('Ngày công chuẩn');
  await days.clear();
  await days.pressSequentially('40');
  await expect(days).toHaveValue('4');
  await expect(ok).toBeEnabled();
  await days.clear();
  await days.pressSequentially('2,5');
  await expect(days).toHaveValue('25');

  const flex = dlg.getByLabel('Phụ cấp Flex');
  await flex.clear();
  await flex.pressSequentially('12,5');
  await expect(flex).toHaveValue('12,5');
  await flex.clear();
  await flex.pressSequentially('100,5');
  await expect(flex).toHaveValue('100,');
});

test('level dialogs keep a night field for TTS and add the next NV level', async ({ page }) => {
  await page.goto('/admin/cai-dat/chuc-vu-bac');
  await page.getByRole('button', { name: 'Sửa bậc 1 của Thực tập sinh' }).click();
  const edit = page.getByRole('dialog', { name: 'Sửa bậc 1' });
  await expect(edit.getByLabel('Phụ cấp đêm')).toBeVisible();
  await edit.getByRole('button', { name: 'Huỷ' }).click();
  await expect(edit).toHaveCount(0);

  const nv = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Nhân viên', exact: true }) });
  await nv.getByRole('button', { name: 'Thêm bậc' }).click();
  const add = page.getByRole('dialog', { name: 'Thêm bậc' });
  await expect(add.getByText('Theo từng người')).toBeVisible();
  const addButton = add.getByRole('button', { name: 'Thêm bậc' });
  await expect(addButton).toBeDisabled();
  await add.getByLabel('Tên bậc').fill('Bậc 5');
  await add.getByLabel('Lương cơ bản').fill('9000000');
  await expect(addButton).toBeEnabled();
  await addButton.click();
  await expect(add).toHaveCount(0);
  expect(await writes(page)).toContainEqual({
    method: 'POST',
    path: '/positions/nv/levels',
    body: {
      effectiveMonth: '2026-10',
      level: 5,
      values: { name: 'Bậc 5', baseSalary: 9000000, kpiMax: null, nightPct: null }
    }
  });
});
