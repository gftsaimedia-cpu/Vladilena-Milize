// Bảng lương (board G, G2, 06/11): cặp bộ lọc nhân sự dùng chung, không có cột ô chọn mặc định,
// "Tính lại lương" mở chế độ chọn (phiếu đã duyệt khoá), làm xong thì thoát chế độ và báo kết quả.
import { expect, test, type Page } from '@playwright/test';

const URL10 = '/admin/bang-luong?thang=2026-10';
const table = (page: Page) => page.getByRole('region', { name: 'Bảng lương tháng 10, cuộn ngang để xem các khoản' });
const names = (page: Page) => table(page).locator('tbody a.nn');
const card = (page: Page) => page.getByRole('region', { name: 'Phiếu lương tháng 10' });
const pstSel = (page: Page) => card(page).getByRole('combobox', { name: 'Trạng thái nhân sự', exact: true });
const deptSel = (page: Page) => card(page).getByRole('combobox', { name: 'Phòng ban', exact: true });
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Tính lại lương cho nhiều phiếu' });
const pick = (page: Page, name: string) => page.getByRole('checkbox', { name: `Chọn phiếu của ${name}` });
const all = (page: Page) => page.getByRole('checkbox', { name: 'Chọn tất cả phiếu tính lại được đang hiện' });
const result = (page: Page) => page.locator('.rsl[role="status"]');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('the filter pair and search sit on the first row, status buttons on the row below', async ({ page }) => {
  await page.goto(URL10);
  await expect(names(page)).toHaveCount(10);
  await expect(card(page).getByRole('combobox', { name: /^Phòng ban: / })).toHaveCount(0);
  const p = (await pstSel(page).boundingBox())!;
  const d = (await deptSel(page).boundingBox())!;
  const f = (await page.getByRole('group', { name: 'Lọc theo trạng thái' }).boundingBox())!;
  expect(p.x).toBeLessThan(d.x);
  expect(Math.abs(p.y - d.y)).toBeLessThan(2);
  expect(f.y).toBeGreaterThan(p.y + p.height);
  await expect(page.getByRole('button', { name: 'Tính lại lương' })).toBeVisible();
});

test('staff status and department filters narrow the payslips', async ({ page }) => {
  await page.goto(URL10);
  await expect(names(page)).toHaveCount(10);
  await deptSel(page).selectOption({ label: 'Sản xuất' });
  await expect(names(page)).toHaveText(['Bùi Quốc Huy', 'Trịnh Văn Long', 'Lý Thanh Tâm', 'Ngô Gia Bảo']);
  await deptSel(page).selectOption({ label: 'Tất cả phòng ban' });
  await pstSel(page).selectOption({ label: 'Đang thử việc' });
  await expect(names(page)).toHaveText(['Đỗ Mai Linh', 'Lý Thanh Tâm']);
  await pstSel(page).selectOption({ label: 'Tài khoản tôi quản lý' });
  await expect(names(page)).toHaveText(['Bùi Quốc Huy', 'Trịnh Văn Long', 'Lý Thanh Tâm', 'Ngô Gia Bảo']);
});

test('no checkbox column by default', async ({ page }) => {
  await page.goto(URL10);
  await expect(names(page)).toHaveCount(10);
  await expect(table(page).getByRole('checkbox')).toHaveCount(0);
});

// Tính cả kỳ (POST không kèm employeeIds) là đường duy nhất đưa kỳ từ Đã chốt công sang Đã tính và tạo phiếu cho người mới;
// lần chạy mới thay mọi phiếu nên phiếu đã duyệt về nháp: hỏi trước, nói rõ số phiếu đã duyệt phải duyệt lại.
test('the header recalculates the whole period after warning that approved payslips go back to draft', async ({ page }) => {
  await page.goto(URL10);
  await expect(names(page)).toHaveCount(10);
  await page.locator('.title').getByRole('button', { name: 'Tính lại cả kỳ' }).click();
  const dlg = page.getByRole('dialog', { name: 'Tính lại cả kỳ lương tháng 10/2026' });
  await expect(dlg).toContainText('86 phiếu đã duyệt sẽ về nháp và phải duyệt lại.');
  await dlg.getByRole('button', { name: 'Huỷ' }).click();
  await expect(dlg).toHaveCount(0);

  await page.locator('.title').getByRole('button', { name: 'Tính lại cả kỳ' }).click();
  await dlg.getByRole('button', { name: 'Tính lại cả kỳ' }).click();
  await expect(dlg).toHaveCount(0);
  // Bản giả có 10 dòng phiếu (số 128 của board chỉ ở ô đếm), nên chỉ khớp dạng câu.
  await expect(page.getByText(/^Đã tính \d+ phiếu lương\.$/)).toBeVisible();
});

test('recalculate: approved payslips are locked and select all takes only the rest', async ({ page }) => {
  await page.goto(URL10);
  await expect(names(page)).toHaveCount(10);
  await page.getByRole('button', { name: 'Tính lại lương' }).click();

  await expect(bar(page)).toContainText('Đã chọn 0 / 8 phiếu');
  await expect(bar(page).getByRole('button', { name: 'Chọn ít nhất 1 phiếu' })).toBeDisabled();
  await expect(pick(page, 'Nguyễn Thu Hà')).toBeDisabled();
  await expect(pick(page, 'Nguyễn Thu Hà')).toHaveAttribute('title', 'Phiếu đã duyệt, không tính lại được');

  await all(page).click();
  await expect(bar(page)).toContainText('Đã chọn 8 / 8 phiếu');
  await expect(pick(page, 'Trần Minh Quân')).toHaveAttribute('aria-checked', 'false');
  await bar(page).getByRole('button', { name: 'Tính lại 8 phiếu' }).click();

  await expect(result(page)).toHaveText('Đã tính lại 8 phiếu lương.');
  await expect(bar(page)).toHaveCount(0);
  await expect(table(page).getByRole('checkbox')).toHaveCount(0);
});

test('recalculate follows the filters while picking', async ({ page }) => {
  await page.goto(URL10);
  await expect(names(page)).toHaveCount(10);
  await page.getByRole('button', { name: 'Tính lại lương' }).click();
  await pick(page, 'Lê Hoàng Nam').click();
  await pick(page, 'Bùi Quốc Huy').click();
  await expect(bar(page)).toContainText('Đã chọn 2 / 8 phiếu');
  await deptSel(page).selectOption({ label: 'Sản xuất' });
  await expect(bar(page)).toContainText('Đã chọn 1 / 4 phiếu');
  await bar(page).getByRole('button', { name: 'Tính lại 1 phiếu' }).click();
  await expect(result(page)).toHaveText('Đã tính lại 1 phiếu lương.');
});

// Chặn trước: mọi phiếu đang hiện đều đã duyệt thì không có phiếu để tính lại, nút khoá kèm lời giải thích.
test('Tính lại lương is disabled when every shown payslip is approved', async ({ page }) => {
  await page.goto(URL10);
  await expect(names(page)).toHaveCount(10);
  await page.getByRole('group', { name: 'Lọc theo trạng thái' }).getByRole('button', { name: /^Đã duyệt/ }).click();
  const btn = page.getByRole('button', { name: 'Tính lại lương' });
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute('title', 'Không có phiếu nào tính lại được trong danh sách đang lọc');
  await page.getByRole('group', { name: 'Lọc theo trạng thái' }).getByRole('button', { name: /^Tất cả/ }).click();
  await expect(btn).toBeEnabled();
});

test('an approved period has no recalculate button', async ({ page }) => {
  await page.goto(URL10);
  await page.evaluate(async () => {
    (await import('/src/mock/period.ts')).demo.unapproved = 0;
  });
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  await page.getByRole('button', { name: 'Tháng sau' }).click();
  await page.getByRole('button', { name: 'Phê duyệt kỳ lương' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Phê duyệt kỳ lương' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tính lại lương' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tính lại cả kỳ' })).toHaveCount(0);
});
