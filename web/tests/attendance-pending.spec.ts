import { expect, test, type Page } from '@playwright/test';

// Tab "Cần xử lý" của Chấm công: danh sách bên trái, chi tiết việc đang chọn bên phải (từ 900px), chạy trên dữ liệu giả.
// Mỗi test mở một trang mới nên 11 việc có ngày công luôn đủ khi bắt đầu.
test.use({ reducedMotion: 'reduce' });

const PENDING = '/admin/cham-cong?xem=can-xu-ly';
const listOf = (page: Page) => page.getByRole('region', { name: 'Danh sách việc cần xử lý, cuộn để xem thêm' });
const paneOf = (page: Page) => page.getByRole('region', { name: 'Chi tiết việc đang chọn' });
const rowsOf = (page: Page) => listOf(page).getByRole('button');
const rowOf = (page: Page, name: string) => listOf(page).getByRole('button', { name: new RegExp(`^${name},`) });
const pendingTab = (page: Page) => page.getByRole('tab', { name: /^Cần xử lý/ });
const noteAlert = (page: Page) => paneOf(page).getByRole('alert');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('two panes sit under the toolbar and the first row is selected', async ({ page }) => {
  await page.goto(PENDING);
  await expect(rowsOf(page)).toHaveCount(11);

  const list = listOf(page);
  await expect(list).toHaveAttribute('tabindex', '0');
  await expect(list).toContainText('Xếp theo ngày công, cũ nhất trước');
  expect((await list.boundingBox())!.width).toBeGreaterThanOrEqual(399);
  expect((await list.boundingBox())!.width).toBeLessThanOrEqual(401);
  expect((await list.boundingBox())!.height).toBeGreaterThanOrEqual(630);
  expect((await list.boundingBox())!.height).toBeLessThanOrEqual(650);

  const first = rowsOf(page).first();
  await expect(first).toContainText('Trần Minh Quân');
  await expect(first).toContainText('15/10');
  await expect(first).toContainText('Giải trình · Đi muộn 9 phút');
  await expect(first).toHaveAttribute('aria-current', 'true');
  await expect(rowsOf(page).nth(1)).not.toHaveAttribute('aria-current', 'true');

  const pane = paneOf(page);
  await expect(pane).toBeVisible();
  await expect(pane).toContainText('Giải trình');
  await expect(pane.getByRole('heading', { name: 'Trần Minh Quân', level: 3 })).toBeVisible();
  await expect(pane.getByRole('heading', { name: 'Đi muộn 9 phút', level: 4 })).toBeVisible();
  await expect(pane.getByRole('link', { name: 'Mở hồ sơ chấm công' })).toBeVisible();
  await expect(pane.getByRole('button', { name: 'Duyệt', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đóng chi tiết' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the toolbar keeps only the tabs and the two filters on this tab', async ({ page }) => {
  await page.goto(PENDING);
  await expect(rowsOf(page)).toHaveCount(11);
  await expect(page.getByRole('textbox', { name: 'Lọc theo tên' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Nhóm' })).toBeVisible();
  for (const name of ['Tuần trước', 'Tuần sau', 'Hôm nay']) await expect(page.getByRole('button', { name })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Chú giải' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Excel|Xuất/ })).toHaveCount(0);
});

test('rows are 12px rounded, the selected one is cream with an underlined name', async ({ page }) => {
  await page.goto(PENDING);
  await expect(rowsOf(page)).toHaveCount(11);
  const selected = rowsOf(page).first();
  await expect(selected).toHaveCSS('border-top-left-radius', '12px');
  await expect(selected).toHaveCSS('background-color', 'rgb(255, 249, 236)');
  await expect(selected.locator('.nn')).toHaveCSS('text-decoration-line', 'underline');
  await expect(rowsOf(page).nth(1)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(rowsOf(page).nth(1).locator('.av')).toHaveText('MĐ');
});

test('clicking another row changes the pane and ?viec, keeps the other keys and opens no dialog', async ({ page }) => {
  await page.goto(`${PENDING}&thang=2026-10`);
  await expect(rowsOf(page)).toHaveCount(11);

  await rowOf(page, 'Hoàng Minh Đức').click();
  await expect(page).toHaveURL(/viec=ib-e4/);
  await expect(page).toHaveURL(/xem=can-xu-ly/);
  await expect(page).toHaveURL(/thang=2026-10/);
  await expect(rowOf(page, 'Hoàng Minh Đức')).toHaveAttribute('aria-current', 'true');
  await expect(rowOf(page, 'Trần Minh Quân')).not.toHaveAttribute('aria-current', 'true');
  await expect(paneOf(page).getByRole('heading', { name: 'Hoàng Minh Đức', level: 3 })).toBeVisible();
  await expect(paneOf(page)).toContainText('Về sớm 30 phút');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/hop=/);

  await page.reload();
  await expect(rowOf(page, 'Hoàng Minh Đức')).toHaveAttribute('aria-current', 'true');
});

test('a missing, wrong or filtered-out ?viec falls back to the first visible row', async ({ page }) => {
  await page.goto(`${PENDING}&viec=ib-l3`);
  await expect(rowOf(page, 'Phạm Ngọc Anh')).toHaveAttribute('aria-current', 'true');

  await page.goto(`${PENDING}&viec=khong-co`);
  await expect(rowsOf(page)).toHaveCount(11);
  await expect(rowsOf(page).first()).toHaveAttribute('aria-current', 'true');
  await expect(paneOf(page)).toContainText('Trần Minh Quân');
});

test('rejecting without a note shows the alert and keeps the row', async ({ page }) => {
  await page.goto(PENDING);
  await expect(rowsOf(page)).toHaveCount(11);
  await paneOf(page).getByRole('button', { name: 'Từ chối', exact: true }).click();

  await expect(noteAlert(page)).toHaveText('Ghi lý do từ chối để nhân viên biết vì sao.');
  await expect(page.locator('#bell-note')).toBeFocused();
  await expect(rowsOf(page)).toHaveCount(11);
  await expect(pendingTab(page)).toContainText('11');
});

test('approving removes the row, selects the next one, drops the badge and moves focus to the row', async ({ page }) => {
  await page.goto(PENDING);
  await expect(rowsOf(page)).toHaveCount(11);
  await expect(pendingTab(page)).toContainText('11');

  await paneOf(page).getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(page.getByText('Đã duyệt yêu cầu của Trần Minh Quân.')).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(10);
  await expect(pendingTab(page)).toContainText('10');
  await expect(rowOf(page, 'Trần Minh Quân')).toHaveCount(0);
  await expect(rowsOf(page).first()).toContainText('Hoàng Minh Đức');
  await expect(rowsOf(page).first()).toHaveAttribute('aria-current', 'true');
  await expect(rowsOf(page).first()).toBeFocused();
  await expect(page).toHaveURL(/viec=ib-e4/);
  await expect(paneOf(page).getByRole('heading', { name: 'Hoàng Minh Đức', level: 3 })).toBeVisible();
});

test('rejecting with a note says so, and the last row hands selection back to the first one', async ({ page }) => {
  await page.goto(`${PENDING}&viec=ib-l3`);
  await expect(rowOf(page, 'Phạm Ngọc Anh')).toHaveAttribute('aria-current', 'true');
  await paneOf(page).getByRole('textbox', { name: 'Ghi chú cho nhân viên' }).fill('Hết phép trong kỳ này.');
  await paneOf(page).getByRole('button', { name: 'Từ chối', exact: true }).click();

  await expect(page.getByText('Đã từ chối yêu cầu của Phạm Ngọc Anh.')).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(10);
  await expect(rowsOf(page).first()).toHaveAttribute('aria-current', 'true');
  await expect(rowsOf(page).first()).toBeFocused();
  await expect(page).toHaveURL(/viec=ib-e3/);
});

test('an attendance item shows Nhắc giải trình and no approve buttons', async ({ page }) => {
  await page.goto(PENDING);
  await rowOf(page, 'Lý Thanh Tâm').click();
  await expect(rowOf(page, 'Lý Thanh Tâm')).toHaveAttribute('aria-current', 'true');

  const pane = paneOf(page);
  await expect(pane).toContainText('Chấm công');
  await expect(pane.getByRole('button', { name: 'Nhắc giải trình' })).toBeVisible();
  // Đã bỏ "Khai thay giờ" (người dùng chốt 05/11): chuông và khung này chỉ còn "Nhắc giải trình".
  await expect(pane.getByRole('button', { name: /Khai thay/ })).toHaveCount(0);
  await expect(pane.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0);
  await expect(pane.getByRole('link', { name: 'Mở hồ sơ chấm công' })).toBeVisible();
});

test('every item in the pane offers the attendance profile link, leave requests included', async ({ page }) => {
  await page.goto(PENDING);
  await rowOf(page, 'Bùi Quốc Huy').click();
  await expect(paneOf(page)).toContainText('Đơn nghỉ');
  await expect(paneOf(page).getByRole('link', { name: 'Mở hồ sơ chấm công' })).toHaveAttribute(
    'href',
    /\/admin\/cham-cong\/nhan-vien\/bui-quoc-huy/
  );
});

test('the name filter keeps a selection that is still visible and otherwise picks the first visible row', async ({ page }) => {
  await page.goto(PENDING);
  await expect(rowsOf(page)).toHaveCount(11);
  await rowOf(page, 'Lê Hoàng Nam').click();
  await expect(page).toHaveURL(/viec=ib-e1/);

  await page.getByRole('textbox', { name: 'Lọc theo tên' }).fill('nam');
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowsOf(page).first()).toContainText('Lê Hoàng Nam');
  await expect(rowsOf(page).first()).toHaveAttribute('aria-current', 'true');
  await expect(paneOf(page)).toContainText('Lê Hoàng Nam');

  await page.getByRole('textbox', { name: 'Lọc theo tên' }).fill('linh');
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowsOf(page).first()).toContainText('Đỗ Mai Linh');
  await expect(rowsOf(page).first()).toHaveAttribute('aria-current', 'true');
  await expect(paneOf(page).getByRole('heading', { name: 'Đỗ Mai Linh', level: 3 })).toBeVisible();
});

// Nhắc giải trình không xử lý xong việc (người dùng chốt 05/11): việc ở lại tới khi nhân viên gửi giải trình, như ở chuông.
test('Nhắc giải trình keeps the item selected, shows when it was sent and turns into Nhắc lại', async ({ page }) => {
  await page.goto(PENDING);
  await expect(rowsOf(page)).toHaveCount(11);
  await rowOf(page, 'Lý Thanh Tâm').click();
  await paneOf(page).getByRole('button', { name: 'Nhắc giải trình', exact: true }).click();

  await expect(page.getByText('Đã nhắc Lý Thanh Tâm giải trình.')).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(11);
  await expect(rowOf(page, 'Lý Thanh Tâm')).toHaveAttribute('aria-current', 'true');
  await expect(paneOf(page)).toContainText('Lý Thanh Tâm');
  await expect(paneOf(page).getByText('Đã nhắc: 09:40 28/10', { exact: true })).toBeVisible();
  await expect(paneOf(page).getByRole('button', { name: 'Nhắc lại', exact: true })).toBeFocused();
});

test('approving every request leaves only the attendance items, each with Nhắc giải trình', async ({ page }) => {
  await page.goto(PENDING);
  await expect(rowsOf(page)).toHaveCount(11);
  // Mỗi vòng: tìm dòng còn nút Duyệt, duyệt nó, danh sách bớt một dòng; hết dòng có Duyệt thì dừng.
  for (;;) {
    const n = await rowsOf(page).count();
    let approved = false;
    for (let i = 0; i < n && !approved; i++) {
      await rowsOf(page).nth(i).click();
      const approve = paneOf(page).getByRole('button', { name: 'Duyệt', exact: true });
      if (await approve.count()) {
        await approve.click();
        await expect(rowsOf(page)).toHaveCount(n - 1);
        approved = true;
      }
    }
    if (!approved) break;
  }
  const left = await rowsOf(page).count();
  expect(left).toBeGreaterThan(0);
  for (let i = 0; i < left; i++) {
    await rowsOf(page).nth(i).click();
    await expect(paneOf(page)).toContainText('Chấm công');
    await expect(paneOf(page).getByRole('button', { name: 'Nhắc giải trình', exact: true })).toBeVisible();
  }
  await expect(listOf(page)).not.toContainText('Không còn việc nào cần xử lý.');
});

test('below 900px only the list stays and a row opens the day dialog as before', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto(PENDING);
  await expect(rowsOf(page)).toHaveCount(11);
  await expect(paneOf(page)).toHaveCount(0);
  await expect(rowsOf(page).first()).not.toHaveAttribute('aria-current', 'true');

  await rowOf(page, 'Lê Hoàng Nam').click();
  await expect(page).toHaveURL(/hop=chi-tiet-ngay/);
  await expect(page).not.toHaveURL(/viec=/);
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Lê Hoàng Nam · Thứ Ba 27/10/2026');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rowOf(page, 'Lê Hoàng Nam')).toBeFocused();
});

test('resizing across 900px switches between the two layouts without leaving the tab', async ({ page }) => {
  await page.goto(PENDING);
  await expect(paneOf(page)).toBeVisible();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(paneOf(page)).toHaveCount(0);
  await expect(pendingTab(page)).toHaveAttribute('aria-selected', 'true');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(paneOf(page)).toBeVisible();
});

test('the Tuần tab is unchanged: week grid and navigation, no panes', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await expect(page.getByRole('region', { name: 'Lưới chấm công' })).toBeVisible();
  for (const name of ['Tuần trước', 'Tuần sau', 'Hôm nay']) await expect(page.getByRole('button', { name })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Chú giải' })).toBeVisible();
  await expect(paneOf(page)).toHaveCount(0);
  await expect(listOf(page)).toHaveCount(0);

  await page.getByRole('button', { name: /^Lê Hoàng Nam, Thứ Ba 27\/10:/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
