import { expect, test, type Page } from '@playwright/test';
import { inApp } from './fixtures/in-app';

// Chuông và ngăn kéo thông báo theo bảng thiết kế BellInbox, chạy trên nguồn việc giả dùng chung (mock/inbox.ts):
// không page.route, không gọi /api.
const bellOf = (page: Page) => page.locator('.topbar .bell');
const drawerOf = (page: Page) => page.getByRole('dialog', { name: 'Thông báo' });
const detailOf = (page: Page) => page.getByRole('dialog', { name: 'Chi tiết yêu cầu' });
const filtersOf = (page: Page) => drawerOf(page).getByRole('group', { name: 'Lọc thông báo' });
const filterOf = (page: Page, name: string) => filtersOf(page).getByRole('button', { name: new RegExp(`^${name}`) });
const liveOf = (page: Page) => drawerOf(page).locator('[aria-live="polite"]');
const kpiOf = (page: Page) =>
  page
    .getByRole('region', { name: 'Chỉ số chính' })
    .getByRole('article', { name: 'Yêu cầu chờ duyệt' })
    .locator('.kpi-v');
// Dòng việc: "<loại · ngày>, <họ tên> · <phòng ban>"; dòng tin hệ thống: "<tin>, <nơi gửi>".
const rowOf = (page: Page, who: string) => drawerOf(page).getByRole('button', { name: new RegExp(`, ${who}( · |$)`) });
const rows = (page: Page) => drawerOf(page).locator('button[data-id]');
const dots = (page: Page) => drawerOf(page).locator('.bd-ud');
const fact = (page: Page, label: string) =>
  detailOf(page).locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd');
const REST_BUT_A2 = "['ib-c1','ib-c2','ib-l1','ib-l2','ib-l3','ib-o1','ib-o2','ib-e1','ib-e2','ib-e3','ib-e4','ib-a1']";

function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

async function openBell(page: Page, url = '/admin/tong-quan') {
  await page.goto(url);
  await bellOf(page).click();
  await expect(drawerOf(page)).toBeVisible();
}

async function leaveOnlyA2(page: Page) {
  await inApp(
    page,
    `const inbox = await import('/src/mock/inbox.ts');
     for (const id of ${REST_BUT_A2}) inbox.resolveInboxItem(id);`
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('the drawer opens on Tất cả with the design header, three filters and six groups', async ({ page }) => {
  const calls = trackApi(page);
  await page.goto('/admin/tong-quan');
  const bell = bellOf(page);
  await expect(bell).toHaveAccessibleName('Thông báo, 13 việc cần xử lý');
  await bell.click();

  const drawer = drawerOf(page);
  await expect(drawer.getByRole('heading', { level: 2, name: 'Thông báo' })).toBeVisible();
  const markRead = drawer.getByRole('button', { name: 'Đánh dấu đã đọc' });
  await expect(markRead).toBeVisible();
  await expect(markRead).toHaveCSS('text-decoration-line', 'underline');
  const close = drawer.getByRole('button', { name: 'Đóng', exact: true });
  await expect(close).toBeVisible();
  await expect(close).toHaveText('');
  await expect(close.locator('svg')).toHaveCount(1);

  await expect(filtersOf(page).getByRole('button')).toHaveText([/^Tất cả\s*16$/, /^Cần duyệt\s*13$/, /^Hệ thống\s*3$/]);
  await expect(filterOf(page, 'Tất cả')).toHaveAttribute('aria-pressed', 'true');
  await expect(filterOf(page, 'Cần duyệt')).toHaveAttribute('aria-pressed', 'false');
  await expect(filterOf(page, 'Hệ thống')).toHaveAttribute('aria-pressed', 'false');

  await expect(drawer.getByRole('heading', { level: 3 })).toHaveText([
    /^Chấm công\s*2$/,
    /^Đơn nghỉ\s*3$/,
    /^Làm thêm, làm bù\s*2$/,
    /^Giải trình\s*4$/,
    /^Tạm ứng\s*2$/,
    /^Hệ thống\s*3$/
  ]);
  await expect(rows(page)).toHaveCount(16);
  await expect(drawer.getByRole('region', { name: 'Danh sách thông báo, cuộn để xem thêm' })).toBeVisible();

  await expect(detailOf(page)).toHaveCount(0);
  await expect(page.getByText('Bấm một yêu cầu để xem chi tiết.')).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('opening the bell puts focus on the pressed filter, not on Đánh dấu đã đọc', async ({ page }) => {
  await openBell(page);
  await expect(filterOf(page, 'Tất cả')).toHaveAttribute('aria-pressed', 'true');
  await expect(filterOf(page, 'Tất cả')).toBeFocused();
  await expect(drawerOf(page).getByRole('button', { name: 'Đánh dấu đã đọc' })).not.toBeFocused();
  await expect(dots(page)).toHaveCount(3);

  await page.keyboard.press('Escape');
  await expect(drawerOf(page)).toHaveCount(0);
  await expect(bellOf(page)).toBeFocused();
});

test('Cần duyệt and Hệ thống filter the list; the pressed filter reads black with a gold count', async ({ page }) => {
  await openBell(page);
  const drawer = drawerOf(page);

  await filterOf(page, 'Cần duyệt').click();
  await expect(filterOf(page, 'Cần duyệt')).toHaveAttribute('aria-pressed', 'true');
  await expect(filterOf(page, 'Tất cả')).toHaveAttribute('aria-pressed', 'false');
  await expect(rows(page)).toHaveCount(13);
  await expect(drawer.getByRole('heading', { level: 3 })).toHaveCount(5);
  await expect(drawer.getByRole('heading', { level: 3, name: /^Hệ thống/ })).toHaveCount(0);
  await expect(filterOf(page, 'Cần duyệt')).toHaveCSS('background-color', 'rgb(28, 28, 28)');
  await expect(filterOf(page, 'Cần duyệt')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(filterOf(page, 'Cần duyệt').locator('.bd-fc')).toHaveCSS('color', 'rgb(232, 195, 114)');

  await filterOf(page, 'Hệ thống').click();
  await expect(rows(page)).toHaveCount(3);
  await expect(drawer.getByRole('heading', { level: 3 })).toHaveCount(0);
  const labels = await rows(page).evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
  expect(labels).toEqual([
    'Máy chấm công đã đồng bộ ngày 27/10, Chấm công',
    'Phiếu lương tháng 9 đã gửi, Bảng lương',
    '3 nhân viên chưa kích hoạt tài khoản, Nhân sự'
  ]);
  await expect(detailOf(page)).toHaveCount(0);

  await filterOf(page, 'Tất cả').click();
  await expect(rows(page)).toHaveCount(16);
  await expect(drawer.getByRole('heading', { level: 3 }).first()).toHaveCSS('position', 'sticky');
});

test('a row reads type · date with the age, then name · department, behind a type icon', async ({ page }) => {
  await openBell(page);
  const row = drawerOf(page).getByRole('button', {
    name: 'Quên Check-out · 27/10, Trịnh Văn Long · Sản xuất',
    exact: true
  });
  await expect(row).toBeVisible();
  await expect(row.locator('.bd-nm')).toHaveText('Quên Check-out · 27/10');
  await expect(row.locator('.bd-ag')).toHaveText('1 ngày');
  await expect(row.locator('.bd-mt')).toHaveText('Trịnh Văn Long · Sản xuất');
  await expect(row).not.toContainText('VL');
  const icon = row.locator('.bd-ic');
  await expect(icon.locator('svg')).toHaveCount(1);
  const box = (await icon.boundingBox())!;
  expect(Math.round(box.width)).toBe(32);
  expect(Math.round(box.height)).toBe(32);
  await expect(icon).toHaveCSS('border-radius', '50px');

  await expect(row.locator('.bd-nm')).toHaveCSS('color', 'rgb(33, 33, 33)');
  await expect(row.locator('.bd-nm')).toHaveCSS('font-weight', '600');
  await expect(drawerOf(page).getByRole('heading', { level: 3 }).first()).toHaveCSS('color', 'rgb(97, 97, 97)');

  for (const name of [
    'Làm thêm 3 giờ · 23/10, Võ Đức Thịnh · Kỹ thuật',
    'Thiếu giờ ra · 27/10, Lê Hoàng Nam · Kinh doanh',
    'Tạm ứng 3.900.000 ₫, Mai Phương Thảo · Tài chính',
    'Tạm ứng 5.200.000 ₫, Trương Quốc Việt · Kỹ thuật',
    'Máy chấm công đã đồng bộ ngày 27/10, Chấm công'
  ]) {
    await expect(drawerOf(page).getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(rowOf(page, 'Chấm công').locator('.bd-ag')).toHaveText('06:00');
  await expect(rowOf(page, 'Nhân sự').locator('.bd-ag')).toHaveText('1 tuần');
});

test('unread dots clear on select and with Đánh dấu đã đọc, and stay cleared after reopening', async ({ page }) => {
  await openBell(page);
  await expect(dots(page)).toHaveCount(3);
  for (const who of ['Bùi Quốc Huy', 'Lê Hoàng Nam', 'Chấm công']) {
    await expect(rowOf(page, who).locator('.bd-ud')).toHaveCount(1);
  }
  const dot = rowOf(page, 'Bùi Quốc Huy').locator('.bd-ud');
  await expect(dot).toHaveCSS('background-color', 'rgb(47, 90, 168)');
  await expect(dot).toHaveCSS('width', '6px');

  await rowOf(page, 'Bùi Quốc Huy').click();
  await expect(rowOf(page, 'Bùi Quốc Huy').locator('.bd-ud')).toHaveCount(0);
  await expect(dots(page)).toHaveCount(2);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(drawerOf(page)).toHaveCount(0);
  await bellOf(page).click();
  await expect(dots(page)).toHaveCount(2);

  await drawerOf(page).getByRole('button', { name: 'Đánh dấu đã đọc' }).click();
  await expect(dots(page)).toHaveCount(0);
  await drawerOf(page).getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(drawerOf(page)).toHaveCount(0);
  await bellOf(page).click();
  await expect(rows(page)).toHaveCount(16);
  await expect(dots(page)).toHaveCount(0);
});

test('the detail opens as a card left of the drawer without covering the list', async ({ page }) => {
  await openBell(page);
  const row = rowOf(page, 'Nguyễn Thu Hà');
  await row.click();

  const detail = detailOf(page);
  await expect(detail).toBeFocused();
  const d = (await detail.boundingBox())!;
  const w = (await drawerOf(page).boundingBox())!;
  expect(Math.abs(w.x + w.width - 1424)).toBeLessThanOrEqual(1);
  expect(Math.abs(w.width - 440)).toBeLessThanOrEqual(1);
  expect(Math.abs(w.y - 16)).toBeLessThanOrEqual(1);
  expect(Math.abs(d.x + d.width - (1440 - 468))).toBeLessThanOrEqual(1);
  expect(Math.abs(d.width - 380)).toBeLessThanOrEqual(1);
  expect(Math.abs(d.y - 16)).toBeLessThanOrEqual(1);
  expect(d.y + d.height).toBeLessThanOrEqual(900 - 16 + 1);
  expect(d.x + d.width).toBeLessThanOrEqual(w.x);
  await expect(detail).toHaveCSS('border-radius', '24px');

  await expect(row).toHaveCSS('background-color', 'rgb(255, 249, 236)');
  await expect(row.locator('.bd-nm')).toHaveCSS('text-decoration-line', 'underline');

  await expect(detail.locator('.bdd-grp')).toHaveText('Đơn nghỉ');
  await expect(detail.getByRole('button', { name: 'Đóng chi tiết' })).toBeVisible();
  const avatar = detail.locator('.bdd-av');
  await expect(avatar).toHaveText('TH');
  expect(Math.round((await avatar.boundingBox())!.width)).toBe(44);
  await expect(detail.getByRole('heading', { name: 'Nguyễn Thu Hà' })).toHaveCSS('font-size', '16px');
  await expect(detail).toContainText('Tài chính · Kế toán tổng hợp');
  await expect(detail.getByRole('heading', { name: 'Phép năm · 2 ngày' })).toHaveCSS('font-size', '18px');
  await expect(detail).toContainText('Thứ Năm 29/10 – Thứ Sáu 30/10');
  await expect(fact(page, 'Phép năm còn')).toHaveText('6 ngày');
  await expect(fact(page, 'Gửi lúc')).toHaveText('27/10 16:20');

  const note = detail.getByRole('textbox', { name: 'Ghi chú cho nhân viên' });
  await expect(note).toHaveAttribute('placeholder', 'Ví dụ: ngày này máy chấm công vẫn ghi nhận giờ vào 08:47');
  await expect(note).toHaveCSS('border-radius', '8px');
  expect(Math.round((await note.boundingBox())!.height)).toBe(88);
  await expect(detail.getByText('Bắt buộc khi từ chối. Nhân viên xem được ghi chú trong chi tiết yêu cầu.')).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Từ chối', exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Duyệt', exact: true })).toBeVisible();
  await expect(detail.getByRole('link', { name: /Mở hồ sơ chấm công/ })).toHaveCount(0);
});

test('sick leave detail shows the leave type and the reason as separate facts', async ({ page }) => {
  await openBell(page);
  await rowOf(page, 'Bùi Quốc Huy').click();
  const detail = detailOf(page);
  await expect(detail).toBeFocused();
  await expect(detail.getByRole('heading', { name: 'Nghỉ ốm · 1 ngày' })).toBeVisible();
  await expect(fact(page, 'Hình thức')).toHaveText('Nghỉ ốm');
  await expect(fact(page, 'Lý do')).toHaveText('“Sốt cao, đã đi khám.”');
  await expect(fact(page, 'Đính kèm')).toHaveText('Giấy khám bệnh · 1 tệp');
});

test('advance detail shows the pay for 01–15 and the fixed amount', async ({ page }) => {
  await openBell(page);
  await rowOf(page, 'Mai Phương Thảo').click();
  const detail = detailOf(page);
  await expect(detail.locator('.bdd-grp')).toHaveText('Tạm ứng');
  await expect(detail.getByRole('heading', { name: 'Tạm ứng 3.900.000 ₫' })).toBeVisible();
  await expect(detail).toContainText('Trừ vào lương tháng 10');
  await expect(fact(page, 'Lương ngày công 01–15/10')).toHaveText('4.875.000 ₫ · 13 ngày');
  await expect(fact(page, 'Số tiền được ứng')).toHaveText(/^3\.900\.000 ₫\s*80% lương ngày công 01–15, cố định$/);
  await expect(fact(page, 'Lý do')).toHaveText('“Đóng học phí cho con.”');
  await expect(fact(page, 'Gửi lúc')).toHaveText('27/10 09:30');
  await expect(detail.getByRole('link', { name: /Mở hồ sơ chấm công/ })).toHaveCount(0);

  await rowOf(page, 'Trương Quốc Việt').click();
  await expect(detail.getByRole('heading', { name: 'Tạm ứng 5.200.000 ₫' })).toBeVisible();
  await expect(fact(page, 'Lương ngày công 01–15/10')).toHaveText('6.500.000 ₫ · 13 ngày');
  await expect(fact(page, 'Số tiền được ứng')).toHaveText(/^5\.200\.000 ₫\s*80% lương ngày công 01–15, cố định$/);
});

test('rejecting without a note shows an alert and decides nothing; typing clears it', async ({ page }) => {
  await openBell(page);
  await rowOf(page, 'Nguyễn Thu Hà').click();
  const detail = detailOf(page);
  const note = detail.getByRole('textbox', { name: 'Ghi chú cho nhân viên' });
  const hint = detail.getByText('Bắt buộc khi từ chối. Nhân viên xem được ghi chú trong chi tiết yêu cầu.');

  await note.fill('   ');
  await detail.getByRole('button', { name: 'Từ chối', exact: true }).click();
  const alert = detail.getByRole('alert');
  await expect(alert).toHaveText('Ghi lý do từ chối để nhân viên biết vì sao.');
  await expect(note).toHaveCSS('border-top-color', 'rgb(180, 63, 63)');
  await expect(hint).toBeHidden();
  await expect(bellOf(page)).toHaveAccessibleName('Thông báo, 13 việc cần xử lý');
  await expect(rowOf(page, 'Nguyễn Thu Hà')).toBeVisible();
  await expect(detail.getByRole('heading', { name: 'Nguyễn Thu Hà' })).toBeVisible();

  await note.pressSequentially('T');
  await expect(detail.getByRole('alert')).toHaveCount(0);
  await expect(hint).toBeVisible();
  await expect(note).toHaveCSS('border-top-color', 'rgb(138, 138, 138)');
});

test('rejecting with a note removes the item and selects the next one', async ({ page }) => {
  await openBell(page);
  await rowOf(page, 'Nguyễn Thu Hà').click();
  const detail = detailOf(page);
  await detail.getByRole('textbox', { name: 'Ghi chú cho nhân viên' }).fill('Trùng lịch kiểm kê cuối tháng.');
  await detail.getByRole('button', { name: 'Từ chối', exact: true }).click();

  await expect(liveOf(page)).toHaveText('Đã từ chối yêu cầu của Nguyễn Thu Hà.');
  await expect(rowOf(page, 'Nguyễn Thu Hà')).toHaveCount(0);
  await expect(bellOf(page)).toHaveAccessibleName('Thông báo, 12 việc cần xử lý');
  await expect(detail.getByRole('heading', { name: 'Bùi Quốc Huy' })).toBeVisible();
  await expect(detail).toBeFocused();
  await expect(detail.getByRole('textbox', { name: 'Ghi chú cho nhân viên' })).toHaveValue('');
  await expect(filtersOf(page).getByRole('button')).toHaveText([/^Tất cả\s*15$/, /^Cần duyệt\s*12$/, /^Hệ thống\s*3$/]);
  await expect(drawerOf(page).getByRole('heading', { level: 3, name: /^Đơn nghỉ/ })).toHaveText(/^Đơn nghỉ\s*2$/);
});

test('approving in the bell updates the bell, the overview and selects the next item', async ({ page }) => {
  await openBell(page);
  const bell = bellOf(page);
  await rowOf(page, 'Nguyễn Thu Hà').click();
  await detailOf(page).getByRole('button', { name: 'Duyệt', exact: true }).click();

  await expect(liveOf(page)).toHaveText('Đã duyệt yêu cầu của Nguyễn Thu Hà.');
  await expect(bell).toHaveAccessibleName('Thông báo, 12 việc cần xử lý');
  await expect(detailOf(page).getByRole('heading', { name: 'Bùi Quốc Huy' })).toBeVisible();

  // Duyệt kèm ghi chú cũng được.
  await detailOf(page).getByRole('textbox', { name: 'Ghi chú cho nhân viên' }).fill('Nhớ nộp giấy khám.');
  await detailOf(page).getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(liveOf(page)).toHaveText('Đã duyệt yêu cầu của Bùi Quốc Huy.');
  await expect(detailOf(page).getByRole('heading', { name: 'Phạm Ngọc Anh' })).toBeVisible();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(drawerOf(page)).toHaveCount(0);
  await expect(kpiOf(page)).toHaveText('9');
  await expect(page.getByRole('list', { name: 'Việc cần duyệt' }).getByRole('listitem').first()).toContainText(
    'Phạm Ngọc Anh'
  );
});

test('a forgotten punch offers one primary Nhắc giải trình button, no Khai thay and no note', async ({ page }) => {
  await openBell(page);
  await rowOf(page, 'Trịnh Văn Long').click();
  const detail = detailOf(page);
  await expect(detail.locator('.bdd-grp')).toHaveText('Chấm công');
  await expect(fact(page, 'Giờ ra')).toHaveText('Chưa có');
  await expect(detail.getByRole('textbox')).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Từ chối', exact: true })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: /Khai thay/ })).toHaveCount(0);
  await expect(detail.getByText(/Khai thay/)).toHaveCount(0);
  // Chỉ nút Đóng chi tiết và nút nhắc.
  await expect(detail.getByRole('button')).toHaveText(['', 'Nhắc giải trình']);
  const remind = detail.getByRole('button', { name: 'Nhắc giải trình', exact: true });
  await expect(remind).toHaveClass(/bdd-b1/);
  await expect(remind).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(detail.getByText(/^Đã nhắc/)).toHaveCount(0);
  await expect(detail.getByRole('link', { name: 'Mở hồ sơ chấm công' })).toHaveAttribute(
    'href',
    '/admin/cham-cong/nhan-vien/trinh-van-long'
  );

  await rowOf(page, 'Lý Thanh Tâm').click();
  await expect(detail.getByRole('heading', { name: 'Lý Thanh Tâm' })).toBeVisible();
  await expect(fact(page, 'Giờ vào')).toHaveText('Chưa có');
  await expect(detail.getByRole('button', { name: /Khai thay/ })).toHaveCount(0);
  await expect(detail.getByRole('button')).toHaveText(['', 'Nhắc giải trình']);
});

test('Nhắc giải trình keeps the item, shows when it was sent and turns into Nhắc lại', async ({ page }) => {
  const calls = trackApi(page);
  await openBell(page);
  const bell = bellOf(page);
  await rowOf(page, 'Trịnh Văn Long').click();
  const detail = detailOf(page);
  await detail.getByRole('button', { name: 'Nhắc giải trình', exact: true }).click();

  await expect(liveOf(page)).toHaveText('Đã nhắc Trịnh Văn Long giải trình.');
  const sent = detail.getByText('Đã nhắc: 09:40 28/10', { exact: true });
  await expect(sent).toBeVisible();
  const again = detail.getByRole('button', { name: 'Nhắc lại', exact: true });
  await expect(again).toBeVisible();
  await expect(again).toHaveClass(/bdd-b1/);
  await expect(again).toBeFocused();
  await expect(detail.getByRole('button', { name: 'Nhắc giải trình', exact: true })).toHaveCount(0);
  const line = (await sent.boundingBox())!;
  const button = (await again.boundingBox())!;
  expect(line.y + line.height).toBeLessThanOrEqual(button.y);

  // Việc ở lại: vẫn đang chọn, vẫn trong nhóm Chấm công, số chuông và số "Cần duyệt" không đổi.
  await expect(detail.getByRole('heading', { name: 'Trịnh Văn Long' })).toBeVisible();
  await expect(rowOf(page, 'Trịnh Văn Long')).toHaveAttribute('aria-current', 'true');
  await expect(bell).toHaveAccessibleName('Thông báo, 13 việc cần xử lý');
  await expect(filtersOf(page).getByRole('button')).toHaveText([/^Tất cả\s*16$/, /^Cần duyệt\s*13$/, /^Hệ thống\s*3$/]);
  await expect(drawerOf(page).getByRole('heading', { level: 3, name: /^Chấm công/ })).toHaveText(/^Chấm công\s*2$/);

  // Nhắc lại: việc vẫn ở lại, câu báo vẫn là câu nhắc.
  await again.click();
  await expect(liveOf(page)).toHaveText('Đã nhắc Trịnh Văn Long giải trình.');
  await expect(detail.getByRole('heading', { name: 'Trịnh Văn Long' })).toBeVisible();
  await expect(detail.getByText('Đã nhắc: 09:40 28/10', { exact: true })).toBeVisible();
  await expect(bell).toHaveAccessibleName('Thông báo, 13 việc cần xử lý');

  // Lần nhắc gắn với từng việc: Lý Thanh Tâm chưa được nhắc.
  await rowOf(page, 'Lý Thanh Tâm').click();
  await expect(detail.getByRole('heading', { name: 'Lý Thanh Tâm' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Nhắc giải trình', exact: true })).toBeVisible();
  await expect(detail.getByText(/^Đã nhắc/)).toHaveCount(0);

  // Đóng rồi mở lại chuông: lần nhắc vẫn còn; thẻ Tổng quan vẫn đếm 11 yêu cầu chờ duyệt.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(drawerOf(page)).toHaveCount(0);
  await expect(kpiOf(page)).toHaveText('11');
  await bell.click();
  await rowOf(page, 'Trịnh Văn Long').click();
  await expect(detailOf(page).getByText('Đã nhắc: 09:40 28/10', { exact: true })).toBeVisible();
  await expect(detailOf(page).getByRole('button', { name: 'Nhắc lại', exact: true })).toBeVisible();
  expect(calls).toEqual([]);
});

test('a system note opens its own detail with a link and no actions', async ({ page }) => {
  await openBell(page, '/admin/tong-quan?thang=2026-10');
  await rowOf(page, 'Chấm công').click();
  const detail = detailOf(page);
  await expect(detail).toBeFocused();
  await expect(detail.locator('.bdd-grp')).toHaveText('Hệ thống');
  await expect(detail.locator('.bdd-av svg')).toHaveCount(1);
  await expect(detail.getByRole('heading', { name: 'Máy chấm công' })).toBeVisible();
  await expect(detail).toContainText('Tin hệ thống · hôm nay 06:00');
  await expect(detail.getByRole('heading', { name: 'Đã đồng bộ dữ liệu ngày 27/10' })).toBeVisible();
  await expect(detail).toContainText('Thứ Ba 27/10');
  await expect(fact(page, 'Đồng bộ lúc')).toHaveText('28/10 06:00');
  await expect(fact(page, 'Thiếu giờ ra')).toHaveText('2 người');
  await expect(fact(page, 'Đi muộn')).toHaveText('1 người');
  await expect(detail.getByRole('button')).toHaveText(['']); // chỉ nút Đóng chi tiết
  await expect(detail.getByRole('textbox')).toHaveCount(0);
  await expect(detail.getByRole('link', { name: 'Mở chấm công tuần' })).toHaveAttribute(
    'href',
    '/admin/cham-cong?thang=2026-10'
  );

  await rowOf(page, 'Bảng lương').click();
  await expect(detail).toContainText('Tin hệ thống · 25/10 17:00');
  await expect(detail.getByRole('heading', { name: 'Đã gửi phiếu lương tháng 9' })).toBeVisible();
  await expect(fact(page, 'Gửi tới')).toHaveText('Tất cả nhân viên đang làm');
  await expect(detail.getByRole('link', { name: 'Mở bảng lương' })).toHaveAttribute(
    'href',
    '/admin/bang-luong?thang=2026-10'
  );

  await rowOf(page, 'Nhân sự').click();
  await expect(detail.getByRole('heading', { name: '3 nhân viên chưa kích hoạt tài khoản' })).toBeVisible();
  await expect(fact(page, 'Còn chờ')).toHaveText('3 người');
  await expect(detail.getByRole('link', { name: 'Mở Nhân sự' })).toHaveAttribute('href', '/admin/nhan-su?thang=2026-10');

  await rowOf(page, 'Chấm công').click();
  await detail.getByRole('link', { name: 'Mở chấm công tuần' }).click();
  await expect(page).toHaveURL(/\/admin\/cham-cong\?thang=2026-10$/);
  await expect(drawerOf(page)).toHaveCount(0);
});

test('switching filters keeps the open item when it still belongs, else opens the first of the new filter', async ({
  page
}) => {
  await openBell(page);
  await filterOf(page, 'Hệ thống').click();
  await expect(detailOf(page)).toHaveCount(0);
  await filterOf(page, 'Tất cả').click();

  await rowOf(page, 'Lê Hoàng Nam').click();
  await filterOf(page, 'Cần duyệt').click();
  await expect(detailOf(page).getByRole('heading', { name: 'Lê Hoàng Nam' })).toBeVisible();
  await filterOf(page, 'Hệ thống').click();
  await expect(detailOf(page).getByRole('heading', { name: 'Máy chấm công' })).toBeVisible();
  await expect(filterOf(page, 'Hệ thống')).toBeFocused();
  await expect(rowOf(page, 'Chấm công').locator('.bd-ud')).toHaveCount(0);
});

test('after the last request in Tất cả the next selection moves on to the system notes', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await leaveOnlyA2(page);
  await bellOf(page).click();
  await rowOf(page, 'Trương Quốc Việt').click();
  await detailOf(page).getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(liveOf(page)).toHaveText('Đã duyệt yêu cầu của Trương Quốc Việt.');
  await expect(detailOf(page).getByRole('heading', { name: 'Máy chấm công' })).toBeVisible();
  await expect(filtersOf(page).getByRole('button')).toHaveText([/^Tất cả\s*3$/, /^Cần duyệt\s*0$/, /^Hệ thống\s*3$/]);
});

test('deciding the last pending request on Cần duyệt shows the empty text and focuses the filter', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await leaveOnlyA2(page);
  const bell = bellOf(page);
  await bell.click();
  await filterOf(page, 'Cần duyệt').click();
  await expect(rows(page)).toHaveCount(1);
  await rowOf(page, 'Trương Quốc Việt').click();
  await detailOf(page).getByRole('button', { name: 'Duyệt', exact: true }).click();

  await expect(drawerOf(page).getByText('Không còn yêu cầu nào chờ duyệt.')).toBeVisible();
  await expect(filterOf(page, 'Cần duyệt')).toBeFocused();
  await expect(detailOf(page)).toHaveCount(0);
  await expect(bell).toHaveAccessibleName('Thông báo, 0 việc cần xử lý');
  await expect(bell.locator('i')).toHaveCount(0);
});

test('escape closes the detail first, then the drawer, returning focus', async ({ page }) => {
  await openBell(page);
  const bell = bellOf(page);
  const row = rowOf(page, 'Lê Hoàng Nam');
  await row.click();
  await expect(detailOf(page)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(detailOf(page)).toHaveCount(0);
  await expect(drawerOf(page)).toBeVisible();
  await expect(row).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(drawerOf(page)).toHaveCount(0);
  await expect(bell).toBeFocused();
});

test('Đóng chi tiết closes the card and returns focus to its row', async ({ page }) => {
  await openBell(page);
  const row = rowOf(page, 'Đỗ Mai Linh');
  await row.click();
  await detailOf(page).getByRole('button', { name: 'Đóng chi tiết' }).click();
  await expect(detailOf(page)).toHaveCount(0);
  await expect(drawerOf(page)).toBeVisible();
  await expect(row).toBeFocused();
});

test('clicking the backdrop closes the drawer and its detail', async ({ page }) => {
  await openBell(page);
  await rowOf(page, 'Lê Hoàng Nam').click();
  await expect(detailOf(page)).toBeVisible();
  await page.mouse.click(200, 600);
  await expect(detailOf(page)).toHaveCount(0);
  await expect(drawerOf(page)).toHaveCount(0);
});

test('Tab stays inside the drawer and its detail card', async ({ page }) => {
  await openBell(page);
  await rowOf(page, 'Lê Hoàng Nam').click();
  await expect(detailOf(page)).toBeFocused();
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab');
    const where = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el?.closest('[aria-label="Chi tiết yêu cầu"]')) return 'detail';
      if (el?.closest('[aria-label="Thông báo"]')) return 'drawer';
      return 'outside';
    });
    expect(where).not.toBe('outside');
    seen.add(where);
  }
  expect([...seen].sort()).toEqual(['detail', 'drawer']);
});

test('keyboard focus on a bell control draws a 2px ink outline', async ({ page }) => {
  await openBell(page);
  const drawer = drawerOf(page);
  await rowOf(page, 'Lê Hoàng Nam').click();
  await page.keyboard.press('Escape');
  await expect(rowOf(page, 'Lê Hoàng Nam')).toBeFocused();
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (!(await drawer.evaluate(el => el.contains(document.activeElement)))) continue;
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return [s.outlineColor, s.outlineWidth, s.outlineStyle].join(' ');
    });
    expect(outline).toBe('rgb(33, 33, 33) 2px solid');
    seen.add(await page.evaluate(() => document.activeElement!.className || document.activeElement!.tagName));
  }
  expect(seen.size).toBeGreaterThanOrEqual(4); // dòng, Đánh dấu đã đọc, Đóng, mục lọc, vùng danh sách
});

test('on a narrow screen the covered drawer is inert while a detail is open', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/admin/tong-quan');
  await bellOf(page).click();
  await rowOf(page, 'Lê Hoàng Nam').click();
  const drawer = drawerOf(page);
  for (const part of ['.bd-h', '.bd-flt', '.bd-body']) {
    await expect(drawer.locator(part)).toHaveAttribute('inert', '');
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('.bd-h, .bd-flt, .bd-body'))).toBeNull();
  }
  await page.keyboard.press('Escape');
  await expect(drawer.locator('.bd-h')).not.toHaveAttribute('inert', '');
  await expect(rowOf(page, 'Lê Hoàng Nam')).toBeFocused();
});

test('Mở hồ sơ chấm công closes the drawer, also when already on that profile', async ({ page }) => {
  await openBell(page);
  await rowOf(page, 'Trịnh Văn Long').click();
  await detailOf(page).getByRole('link', { name: 'Mở hồ sơ chấm công' }).click();
  await expect(page).toHaveURL(/\/admin\/cham-cong\/nhan-vien\/trinh-van-long/);
  await expect(drawerOf(page)).toHaveCount(0);

  await bellOf(page).click();
  await rowOf(page, 'Trịnh Văn Long').click();
  await detailOf(page).getByRole('link', { name: 'Mở hồ sơ chấm công' }).click();
  await expect(drawerOf(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/cham-cong\/nhan-vien\/trinh-van-long/);
});

test('the drawer has no footer hint and no link to the old Yêu cầu page', async ({ page }) => {
  await openBell(page, '/admin/tong-quan?thang=2026-11');
  await expect(drawerOf(page).getByRole('link', { name: 'Mở trang Yêu cầu' })).toHaveCount(0);
  await expect(drawerOf(page).locator('a[href^="/admin/yeu-cau"]')).toHaveCount(0);
  await expect(drawerOf(page).getByText('Bấm một yêu cầu để xem chi tiết.')).toHaveCount(0);
  await expect(drawerOf(page).locator('footer')).toHaveCount(0);
  await expect(liveOf(page)).toHaveText('');
});
