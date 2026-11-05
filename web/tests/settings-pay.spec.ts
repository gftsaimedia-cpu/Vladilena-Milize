import { expect, test, type Page } from '@playwright/test';

// Cài đặt › Cách tính lương trên dữ liệu giả (mock/settings.ts): danh sách sáu khoản, ngăn kéo sửa và xem. Không page.route.
const row = (page: Page, name: string) => page.locator('tbody tr', { has: page.getByText(name, { exact: true }) });
const drawer = (page: Page, title: string) => page.getByRole('dialog', { name: title });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('pay formula lists six items and nothing about unconfirmed policies', async ({ page }) => {
  await page.goto('/admin/cai-dat');
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.locator('.title p')).toContainText('0 khoản đã chỉnh');
  await expect(page.locator('body')).not.toContainText('chưa chốt');
  await expect(page.locator('body')).not.toContainText('Xem trước');
  await expect(row(page, 'Lương theo ngày công')).toContainText('Công chuẩn 22 (T2–T6) · 26 (T2–T7)');
  await expect(row(page, 'Tiền làm thêm giờ')).toContainText('Ngày thường ×1.5 · cuối tuần ×2 · ngày lễ ×3');
  await expect(row(page, 'Phụ cấp')).toContainText('Mất chuyên cần khi nghỉ từ 3 ngày');
  await expect(row(page, 'Lương KPI')).toContainText('Trọng số 40 · 24 · 18 · 12 · 6');
  await expect(row(page, 'Khấu trừ đi muộn')).toContainText('Đi trễ tới 15 phút vẫn hợp lệ');
  await expect(row(page, 'Tạm ứng')).toContainText('80% lương của ngày công 01–15');
  await expect(page.locator('.foot')).toContainText('Chưa có thay đổi nào.');
  await expect(page.locator('.foot')).toContainText('Mỗi lần sửa được ghi vào Nhật ký thay đổi.');
  await expect(page.getByRole('link', { name: 'Mở nhật ký' })).toHaveAttribute('href', '/admin/cai-dat/nhat-ky');
});

test('OT 1.5 → 1.6 from the open month marks the row Đã chỉnh', async ({ page }) => {
  await page.goto('/admin/cai-dat');
  await row(page, 'Tiền làm thêm giờ').getByRole('button', { name: 'Sửa' }).click();
  const d = drawer(page, 'Tiền làm thêm giờ');
  await d.getByRole('textbox', { name: 'Ngày thường' }).fill('1,6');
  await expect(d).toContainText('Đang áp dụng ×1.5');
  await expect(d).toContainText('Có 1 thay đổi chưa lưu');
  await d.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await expect(dlg).toContainText('OT ngày thường ×1.5 → ×1.6, áp dụng từ tháng 10/2026');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(row(page, 'Tiền làm thêm giờ')).toContainText('Ngày thường ×1.6');
  await expect(row(page, 'Tiền làm thêm giờ')).toContainText('• Đã chỉnh');
  await expect(page.locator('.title p')).toContainText('1 khoản đã chỉnh');
});

test('saving from 11/2026 gives the user example line and the recent-change footer', async ({ page }) => {
  await page.goto('/admin/cai-dat');
  await row(page, 'Tiền làm thêm giờ').getByRole('button', { name: 'Sửa' }).click();
  const d = drawer(page, 'Tiền làm thêm giờ');
  await d.getByRole('textbox', { name: 'Ngày thường' }).fill('1,6');
  await d.getByLabel('Áp dụng từ tháng').selectOption({ label: 'Tháng 11/2026' });
  await d.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await expect(dlg).toContainText('OT ngày thường ×1.5 → ×1.6, áp dụng từ tháng 11/2026');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(row(page, 'Tiền làm thêm giờ')).not.toContainText('Đã chỉnh');
  await expect(row(page, 'Tiền làm thêm giờ')).toContainText('Ngày thường ×1.5');
  await expect(page.locator('.foot')).toContainText('Thay đổi gần đây: Tiền làm thêm giờ, OT ngày thường ×1.6 từ tháng 11/2026.');
});

test('Huỷ discards the edit', async ({ page }) => {
  await page.goto('/admin/cai-dat');
  await row(page, 'Tiền làm thêm giờ').getByRole('button', { name: 'Sửa' }).click();
  const d = drawer(page, 'Tiền làm thêm giờ');
  await d.getByRole('textbox', { name: 'Ngày thường' }).fill('1,6');
  await expect(d).toContainText('Có 1 thay đổi chưa lưu');
  await d.getByRole('button', { name: 'Huỷ', exact: true }).click();
  await expect(d).toHaveCount(0);
  await row(page, 'Tiền làm thêm giờ').getByRole('button', { name: 'Sửa' }).click();
  await expect(drawer(page, 'Tiền làm thêm giờ').getByRole('textbox', { name: 'Ngày thường' })).toHaveValue('1,5');
});

test('OT refuses a third decimal and a value under the legal floor locks Lưu', async ({ page }) => {
  await page.goto('/admin/cai-dat?hop=lam-them');
  const d = drawer(page, 'Tiền làm thêm giờ');
  const f = d.getByRole('textbox', { name: 'Ngày thường' });
  await f.fill('1,555');
  await expect(f).toHaveValue('1,5');
  await f.fill('1,4');
  await expect(d).toContainText('Từ ×1.5 đến ×5');
  await expect(d.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
});

test('Lưu is locked until something changes', async ({ page }) => {
  await page.goto('/admin/cai-dat?hop=khau-tru');
  const d = drawer(page, 'Khấu trừ đi muộn, về sớm');
  await expect(d).toContainText('Chưa có thay đổi');
  await expect(d.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  await d.getByRole('textbox', { name: 'Đi trễ tới' }).fill('20');
  await expect(d.getByRole('button', { name: 'Lưu', exact: true })).toBeEnabled();
  await expect(d).toContainText('Đang áp dụng 15 phút');
});

test('Phụ cấp shows type figures as text with a link to Chức vụ & bậc', async ({ page }) => {
  await page.goto('/admin/cai-dat?hop=phu-cap');
  const d = drawer(page, 'Phụ cấp');
  await expect(d).toContainText('Nhân viên');
  await expect(d).toContainText('Đi lại');
  await expect(d).toContainText('15%');
  await expect(d.getByRole('link', { name: 'Sửa ở Chức vụ & bậc' })).toHaveAttribute('href', '/admin/cai-dat/chuc-vu-bac');
  // Chỉ một ô số (chuyên cần); các con số theo loại là chữ. Ô còn lại là ô lý do.
  await expect(d.getByRole('textbox', { name: 'Mất chuyên cần khi nghỉ từ' })).toHaveCount(1);
  await expect(d.getByRole('textbox', { name: 'Đi lại' })).toHaveCount(0);
  await expect(d.getByRole('textbox')).toHaveCount(2);
});

test('Lương theo ngày công and Tạm ứng are read-only', async ({ page }) => {
  await page.goto('/admin/cai-dat');
  await row(page, 'Lương theo ngày công').getByRole('button', { name: 'Xem' }).click();
  const a = drawer(page, 'Lương theo ngày công');
  await expect(a.getByRole('textbox')).toHaveCount(0);
  await expect(a.getByRole('button', { name: 'Lưu', exact: true })).toHaveCount(0);
  await expect(a).toContainText('Công chuẩn');
  await expect(a).toContainText('26 ngày');
  await expect(a).toContainText('Fresher');
  await expect(a).toContainText('6.000.000 đ');
  await expect(a.getByRole('link', { name: 'Sửa ở Chức vụ & bậc' })).toHaveAttribute('href', '/admin/cai-dat/chuc-vu-bac');
  await a.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await expect(a).toHaveCount(0);

  await row(page, 'Tạm ứng').getByRole('button', { name: 'Xem' }).click();
  const b = drawer(page, 'Tạm ứng');
  await expect(b.getByRole('textbox')).toHaveCount(0);
  await expect(b.getByRole('button', { name: 'Lưu', exact: true })).toHaveCount(0);
  await expect(b).toContainText('80% lương của ngày công 01–15');
});

test('KPI weights must total 100 before Lưu unlocks', async ({ page }) => {
  await page.goto('/admin/cai-dat?hop=luong-kpi');
  const d = drawer(page, 'Lương KPI');
  await d.getByRole('textbox', { name: 'Người dùng' }).fill('22');
  await expect(d).toContainText('Tổng 98/100');
  await expect(d.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  await d.getByRole('textbox', { name: 'Tự đánh giá' }).fill('8');
  await expect(d).toContainText('Tổng 100/100');
  await d.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await expect(dlg).toContainText('Trọng số Người dùng 24% → 22%, áp dụng từ tháng 10/2026');
  await expect(dlg).toContainText('Trọng số Tự đánh giá 6% → 8%, áp dụng từ tháng 10/2026');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(row(page, 'Lương KPI')).toContainText('Trọng số 40 · 22 · 18 · 12 · 8');
  await expect(row(page, 'Lương KPI')).toContainText('• Đã chỉnh');
  await expect(page.locator('.foot')).toContainText('Thay đổi gần đây: Lương KPI, Trọng số 40 · 22 · 18 · 12 · 8 từ tháng 10/2026.');
});

test('KPI drawer shows the total at all times and the max KPI per level as text', async ({ page }) => {
  await page.goto('/admin/cai-dat?hop=luong-kpi');
  const d = drawer(page, 'Lương KPI');
  await expect(d).toContainText('Trọng số của 5 điểm KPI, cộng lại đủ 100');
  await expect(d).toContainText('Tổng 100/100');
  await expect(d).toContainText('KPI tối đa theo bậc');
  await expect(d).toContainText('Chuyên trách viên · Fresher');
  await expect(d).toContainText('1.500.000 đ');
  await expect(d.getByRole('link', { name: 'Sửa ở Chức vụ & bậc' })).toBeVisible();
});
