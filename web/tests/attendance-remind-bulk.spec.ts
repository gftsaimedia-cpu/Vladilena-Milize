// Chấm công · Cần xử lý (board L3, 06/11): nút "Nhắc giải trình" đếm số việc nhắc đang hiện và mở chế độ chọn.
// Trong chế độ chỉ chọn được việc quên chấm công, bấm dòng là chọn / bỏ chọn, khung phải liệt kê người sẽ được nhắc.
import { expect, test, type Page } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

const PENDING = '/admin/cham-cong?xem=can-xu-ly';
const listOf = (page: Page) => page.getByRole('region', { name: 'Danh sách việc cần xử lý, cuộn để xem thêm' });
const remindBtn = (page: Page) => page.getByRole('button', { name: /^Nhắc giải trình \d+$/ });
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Nhắc giải trình cho nhiều người' });
const pick = (page: Page, name: string) => listOf(page).getByRole('checkbox', { name: new RegExp(`^Chọn ${name},`) });
const all = (page: Page) => page.getByRole('checkbox', { name: 'Chọn tất cả việc nhắc được đang hiện' });
const targets = (page: Page) => page.getByRole('region', { name: 'Người sẽ được nhắc' });
const result = (page: Page) => page.locator('.rsl[role="status"]');
const pstSel = (page: Page) => page.getByRole('combobox', { name: 'Trạng thái nhân sự', exact: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('nút Nhắc giải trình đếm số việc nhắc đang hiện', async ({ page }) => {
  await page.goto(PENDING);
  await expect(listOf(page).getByRole('button')).toHaveCount(11);
  await expect(remindBtn(page)).toHaveText(/Nhắc giải trình\s*2/);
  await expect(remindBtn(page)).toBeEnabled();

  // Đỗ Mai Linh (thử việc) không có việc nhắc: số về 0 và nút khoá.
  await page.getByRole('textbox', { name: 'Lọc theo tên' }).fill('linh');
  await expect(listOf(page).getByRole('button')).toHaveCount(1);
  await expect(remindBtn(page)).toHaveText(/Nhắc giải trình\s*0/);
  await expect(remindBtn(page)).toBeDisabled();

  await page.getByRole('textbox', { name: 'Lọc theo tên' }).fill('');
  await pstSel(page).selectOption({ label: 'Đang thử việc' });
  await expect(remindBtn(page)).toHaveText(/Nhắc giải trình\s*1/);

  // Tab Tuần không có nút này.
  await page.getByRole('tab', { name: 'Tuần' }).click();
  await expect(remindBtn(page)).toHaveCount(0);
});

test('chế độ nhắc: chỉ chọn được việc quên chấm công, khung phải liệt kê người được nhắc, chạy xong báo kết quả', async ({ page }) => {
  await page.goto(PENDING);
  await remindBtn(page).click();

  await expect(bar(page)).toContainText('Đã chọn 0 / 2 người');
  await expect(bar(page).getByRole('button', { name: 'Chọn ít nhất 1 người' })).toBeDisabled();
  await expect(remindBtn(page)).toHaveCount(0);

  // Việc khác (duyệt đơn, giải trình đã gửi) mờ và khoá.
  await expect(pick(page, 'Trần Minh Quân')).toBeDisabled();
  await expect(pick(page, 'Trần Minh Quân')).toHaveAttribute('title', 'Chỉ nhắc được việc quên chấm công');
  await expect(targets(page)).toContainText('Chưa chọn ai.');

  // Bấm dòng là chọn, không mở chi tiết.
  await pick(page, 'Trịnh Văn Long').click();
  await expect(pick(page, 'Trịnh Văn Long')).toHaveAttribute('aria-checked', 'true');
  await expect(page).not.toHaveURL(/viec=/);
  await expect(bar(page)).toContainText('Đã chọn 1 / 2 người');
  await expect(targets(page)).toContainText('Trịnh Văn Long');
  await expect(targets(page)).not.toContainText('Lý Thanh Tâm');

  await pick(page, 'Trịnh Văn Long').click();
  await expect(bar(page)).toContainText('Đã chọn 0 / 2 người');

  await all(page).click();
  await expect(bar(page)).toContainText('Đã chọn 2 / 2 người');
  await expect(targets(page)).toContainText('Trịnh Văn Long');
  await expect(targets(page)).toContainText('Lý Thanh Tâm');

  await bar(page).getByRole('button', { name: 'Nhắc 2 người' }).click();
  await expect(result(page)).toHaveText('Đã gửi nhắc giải trình cho 2 người.');
  await expect(bar(page)).toHaveCount(0);
  await expect(listOf(page).getByRole('checkbox')).toHaveCount(0);
  // Việc nhắc ở lại danh sách tới khi nhân viên gửi giải trình.
  await expect(listOf(page).getByRole('button')).toHaveCount(11);
});

test('huỷ thoát chế độ chọn và không nhắc ai', async ({ page }) => {
  await page.goto(PENDING);
  await remindBtn(page).click();
  await pick(page, 'Lý Thanh Tâm').click();
  await bar(page).getByRole('button', { name: 'Huỷ, thoát chế độ chọn' }).click();
  await expect(bar(page)).toHaveCount(0);
  await expect(result(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Chi tiết việc đang chọn' })).toBeVisible();
});

test('việc đã nhắc hiện "Đã nhắc" trên chuông', async ({ page }) => {
  await page.goto(PENDING);
  await remindBtn(page).click();
  await pick(page, 'Trịnh Văn Long').click();
  await bar(page).getByRole('button', { name: 'Nhắc 1 người' }).click();
  await expect(result(page)).toHaveText('Đã gửi nhắc giải trình cho 1 người.');

  await page.locator('.topbar .bell').click();
  const drawer = page.getByRole('dialog', { name: 'Thông báo' });
  await drawer.getByRole('button', { name: /, Trịnh Văn Long( · |$)/ }).click();
  await expect(page.getByRole('dialog', { name: 'Chi tiết yêu cầu' }).getByText('Đã nhắc: 09:40 28/10', { exact: true })).toBeVisible();
});
