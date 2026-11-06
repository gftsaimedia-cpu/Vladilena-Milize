// Cặp bộ lọc nhân sự dùng chung (06/11) trên các màn ngoài Nhân sự và Bảng lương:
// Chấm công tuần (E) và Cần xử lý (L2) giữ trạng thái nhân sự ở ?ns, phòng ban ở ?pb.
import { expect, test, type Page } from '@playwright/test';

const pstSel = (page: Page) => page.getByRole('combobox', { name: 'Trạng thái nhân sự', exact: true });
const deptSel = (page: Page) => page.getByRole('combobox', { name: 'Phòng ban', exact: true });
const gridRows = (page: Page) => page.locator('tbody tr');
const pendList = (page: Page) => page.getByRole('region', { name: 'Danh sách việc cần xử lý, cuộn để xem thêm' });
const pendRows = (page: Page) => pendList(page).getByRole('button');
const pendingTab = (page: Page) => page.getByRole('tab', { name: /^Cần xử lý/ });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('chấm công tuần lọc theo trạng thái nhân sự (?ns) và phòng ban (?pb)', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await expect(gridRows(page)).toHaveCount(11);
  await expect(page.getByRole('combobox', { name: 'Nhóm' })).toHaveCount(0);

  await pstSel(page).selectOption({ label: 'Đang thử việc' });
  await expect(page).toHaveURL(/ns=try/);
  await expect(gridRows(page)).toHaveCount(2);
  await expect(gridRows(page).nth(0)).toContainText('Đỗ Mai Linh');
  await expect(gridRows(page).nth(1)).toContainText('Lý Thanh Tâm');
  await expect(page.getByText('Hiển thị 2 trong 128 nhân viên')).toBeVisible();

  await deptSel(page).selectOption({ label: 'Sản xuất' });
  await expect(page).toHaveURL(/pb=S%E1%BA%A3n/);
  await expect(gridRows(page)).toHaveCount(1);
  await expect(gridRows(page)).toContainText('Lý Thanh Tâm');

  await page.reload();
  await expect(gridRows(page)).toHaveCount(1);
  await expect(pstSel(page)).toHaveValue('try');
  await expect(deptSel(page)).toHaveValue('Sản xuất');

  await deptSel(page).selectOption({ label: 'Tất cả phòng ban' });
  await pstSel(page).selectOption({ label: 'Tài khoản tôi quản lý' });
  await expect(page).not.toHaveURL(/pb=/);
  await expect(gridRows(page)).toHaveCount(4);
  for (const name of ['Bùi Quốc Huy', 'Trịnh Văn Long', 'Lý Thanh Tâm', 'Ngô Gia Bảo']) await expect(page.locator('tbody')).toContainText(name);

  await pstSel(page).selectOption({ label: 'Tất cả nhân sự' });
  await expect(page).not.toHaveURL(/ns=/);
  await expect(gridRows(page)).toHaveCount(11);
});

test('an unknown ?ns falls back to all and leaves the URL', async ({ page }) => {
  await page.goto('/admin/cham-cong?ns=abc');
  await expect(gridRows(page)).toHaveCount(11);
  await expect(page).not.toHaveURL(/ns=/);
  await expect(pstSel(page)).toHaveValue('all');
});

test('cần xử lý dùng cùng cặp bộ lọc', async ({ page }) => {
  await page.goto('/admin/cham-cong?xem=can-xu-ly&ns=try');
  await expect(pendRows(page)).toHaveCount(2);
  await expect(pendList(page)).toContainText('Đỗ Mai Linh');
  await expect(pendList(page)).toContainText('Lý Thanh Tâm');
  await expect(pendingTab(page)).toContainText('2');

  await deptSel(page).selectOption({ label: 'Sản xuất' });
  await expect(pendRows(page)).toHaveCount(1);
  await expect(pendList(page)).toContainText('Lý Thanh Tâm');

  await deptSel(page).selectOption({ label: 'Tất cả phòng ban' });
  await pstSel(page).selectOption({ label: 'Tài khoản tôi quản lý' });
  await expect(pendRows(page)).toHaveCount(4);
  await expect(page).toHaveURL(/xem=can-xu-ly/);
});

// Tổng quan (A): thẻ bảng lương dùng cặp bộ lọc, lọc tại chỗ trên các dòng của thẻ.
test('Tổng quan: bảng lương có cặp bộ lọc thay nút Lọc', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const card = page.locator('.card.pt');
  const rows = card.locator('tbody tr');
  await expect(rows).toHaveCount(6);
  await expect(card.getByRole('button', { name: 'Lọc', exact: true })).toHaveCount(0);

  const p = card.getByRole('combobox', { name: 'Trạng thái nhân sự', exact: true });
  const d = card.getByRole('combobox', { name: 'Phòng ban', exact: true });
  const f = card.getByRole('textbox', { name: 'Tìm theo tên' });
  const [pb, db, fb] = [(await p.boundingBox())!, (await d.boundingBox())!, (await f.boundingBox())!];
  expect(pb.x).toBeLessThan(db.x);
  expect(db.x).toBeLessThan(fb.x);
  expect(Math.abs(pb.y + pb.height / 2 - (fb.y + fb.height / 2))).toBeLessThan(3);

  await d.selectOption({ label: 'Kỹ thuật' });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Trần Minh Quân');
  await expect(rows.nth(1)).toContainText('Võ Đức Thịnh');

  await d.selectOption({ label: 'Tất cả phòng ban' });
  await p.selectOption({ label: 'Đang thử việc' });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Đỗ Mai Linh');
});
