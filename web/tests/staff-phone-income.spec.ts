import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

test('Thu nhập makes no /api call', async ({ page }) => {
  const calls = await openPhone(page, '/nv/thu-nhap');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Thu nhập');
  expect(calls).toEqual([]);
});

test('net pay card follows J6', async ({ page }) => {
  await openPhone(page, '/nv/thu-nhap');
  await expect(page.getByText('Phiếu chính thức có khi Admin duyệt')).toBeVisible();
  await expect(page.getByText('Tạm tính', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tháng trước' })).toBeDisabled();
  const net = page.getByRole('region', { name: 'Thực nhận tháng 10' });
  for (const t of ['Thực nhận dự kiến', '14.278.183', 'Admin đang duyệt phiếu', 'Tổng thu nhập', '15.538.183', 'Khấu trừ', '1.260.000'])
    await expect(net).toContainText(t);
});

test('KPI card shows the total, KPI pay and the five scores', async ({ page }) => {
  await openPhone(page, '/nv/thu-nhap');
  const kpi = page.getByRole('region', { name: 'KPI tháng 10' });
  for (const t of ['5 phần', '66,14%', 'Tổng điểm', 'Lương KPI', '1.322.800', 'Mức đề xuất', '2.000.000'])
    await expect(kpi).toContainText(t);
  const scores = kpi.locator('.sc > div');
  await expect(scores).toHaveText([/62\s*Wework/, /70\s*Người dùng/, /68\s*Đồng nghiệp/, /65\s*Quản lý/, /75\s*Tự đánh giá/]);
  await expect(kpi.locator('svg circle')).toHaveCount(51);
  await expect(kpi.locator('svg circle.on')).toHaveCount(33);
});

test('line items add up to the net pay and there is no full-payslip link', async ({ page }) => {
  await openPhone(page, '/nv/thu-nhap');
  await expect(page.getByRole('heading', { name: 'Các khoản' })).toBeVisible();
  const lines = page.locator('.ls .ro');
  await expect(lines.locator('.t')).toHaveText([
    'Lương ngày công', 'Nghỉ phép, iSAT', 'Phụ cấp', 'Lương KPI', 'Bảo hiểm bắt buộc', 'Thuế TNCN'
  ]);
  await expect(lines.locator('.v')).toHaveText(['11.076.923', '923.076', '2.215.384', '1.322.800', '−1.260.000', '0']);
  await expect(page.locator('.tot')).toHaveText(/Thực nhận\s*14\.278\.183 ₫/);
  await expect(page.getByRole('link', { name: 'Xem phiếu lương đầy đủ' })).toHaveCount(0);
});

test('design index lists the eight phone boards', async ({ page }) => {
  await openPhone(page, '/thiet-ke');
  const group = page.locator('section', { has: page.getByRole('heading', { name: /Nhân viên · điện thoại/ }) });
  const links = group.getByRole('link');
  await expect(links).toHaveText([
    'Hôm nay · đang trong ca',
    'Chấm công · tháng 10',
    'Hộp trượt · một ngày chấm công (27/10)',
    'Yêu cầu của tôi',
    'Hộp trượt · một yêu cầu (Phép năm 12/10)',
    'Thu nhập · tháng 10 tạm tính',
    'Tôi',
    'Hộp trượt · đổi mật khẩu'
  ]);
  const hrefs = await links.evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect(hrefs).toEqual([
    '/nv/hom-nay',
    '/nv/cham-cong',
    '/nv/cham-cong?ngay=2026-10-27',
    '/nv/yeu-cau',
    '/nv/yeu-cau?yc=phep-1210',
    '/nv/thu-nhap',
    '/nv/toi',
    '/nv/toi?hop=doi-mat-khau'
  ]);
});
