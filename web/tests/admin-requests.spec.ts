// Tab Yêu cầu (board Q1–Q4, 06/11): thẻ đếm lọc theo trạng thái, cột trái lọc theo loại, bảng đơn chờ trước,
// duyệt ngay trên dòng, từ chối trong ngăn chi tiết (bắt buộc lý do), ?don mở ngăn. Dữ liệu giả: đơn chờ là việc "duyệt"
// của mock/inbox (cùng nguồn với chuông), đơn đã xử lý từ mock/admin-requests.ts.
import { expect, test, type Page } from '@playwright/test';
import { requestRowsFromDto } from '../src/builders/api/admin-requests';
import type { RequestDTO } from '../src/builders/api/inbox';

test.use({ reducedMotion: 'reduce' });

const URL = '/admin/yeu-cau';
const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng' });
const navLink = (page: Page) => nav(page).getByRole('link', { name: /^Yêu cầu/ });
const tiles = (page: Page) => page.getByRole('region', { name: 'Lọc theo trạng thái đơn' });
const tile = (page: Page, label: string) => tiles(page).getByRole('button', { name: new RegExp(`^${label}`) });
const kinds = (page: Page) => page.getByRole('navigation', { name: 'Loại đơn' });
const kind = (page: Page, label: string) => kinds(page).getByRole('button', { name: new RegExp(`^${label}`) });
const rows = (page: Page) => page.getByRole('table', { name: 'Yêu cầu' }).locator('tbody tr');
const rowOf = (page: Page, name: string) => rows(page).filter({ hasText: name });
const drawer = (page: Page, name: string) => page.getByRole('dialog', { name: `Chi tiết yêu cầu của ${name}` });
const bell = (page: Page) => page.locator('.topbar .bell');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('menu có mục Yêu cầu dưới Tổng quan, kèm số đơn chờ', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const links = nav(page).getByRole('link');
  await expect(links.nth(0)).toHaveText(/^Tổng quan/);
  await expect(links.nth(1)).toHaveText(/^Yêu cầu\s*11$/);
  await expect(navLink(page)).toHaveAccessibleName(/^Yêu cầu.*11 chờ duyệt/);
  await navLink(page).click();
  await expect(page).toHaveURL(/\/admin\/yeu-cau/);
  await expect(page.getByRole('heading', { name: 'Yêu cầu', exact: true })).toBeVisible();
  await expect(navLink(page)).toHaveAttribute('aria-current', 'page');
});

test('thẻ đếm lọc theo trạng thái, cột trái lọc theo loại', async ({ page }) => {
  await page.goto(URL);
  await expect(rows(page)).toHaveCount(18);
  await expect(tile(page, 'Tất cả')).toContainText('18');
  await expect(tile(page, 'Chờ duyệt')).toContainText('11');
  await expect(tile(page, 'Đã duyệt')).toContainText('5');
  await expect(tile(page, 'Từ chối')).toContainText('1');
  await expect(tile(page, 'Đã huỷ')).toContainText('1');
  await expect(tile(page, 'Tất cả')).toHaveAttribute('aria-pressed', 'true');

  // Đơn chờ trước, cũ nhất trước; đơn đã xử lý sau.
  await expect(rows(page).first()).toContainText('Trần Minh Quân');
  await expect(rows(page).nth(10)).toContainText('Chờ duyệt');
  await expect(rows(page).nth(11)).not.toContainText('Chờ duyệt');

  await tile(page, 'Chờ duyệt').click();
  await expect(tile(page, 'Chờ duyệt')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(11);

  await expect(kind(page, 'Đơn nghỉ')).toContainText('3');
  await expect(kind(page, 'Nghỉ có làm bù')).toContainText('1');
  await expect(kind(page, 'Giải trình')).toContainText('4');
  await expect(kind(page, 'Tạm ứng')).toContainText('2');
  await kind(page, 'Giải trình').click();
  await expect(kind(page, 'Giải trình')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).first()).toContainText('Trần Minh Quân');

  await tile(page, 'Tất cả').click();
  await expect(rows(page)).toHaveCount(6);
  await kind(page, 'Tất cả loại').click();
  await page.getByRole('combobox', { name: 'Phòng ban', exact: true }).selectOption({ label: 'Sản xuất' });
  for (const name of ['Bùi Quốc Huy', 'Ngô Gia Bảo', 'Lý Thanh Tâm', 'Đặng Văn Phúc']) await expect(rowOf(page, name)).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Lọc theo tên' }).fill('bao');
  await expect(rows(page)).toHaveCount(1);
});

test('duyệt ngay trên dòng: đơn rời nhóm chờ, chuông giảm 1', async ({ page }) => {
  await page.goto(URL);
  await expect(bell(page)).toHaveAccessibleName('Thông báo, 13 việc cần xử lý');
  await page.getByRole('button', { name: 'Duyệt yêu cầu của Võ Đức Thịnh' }).click();
  await expect(page.getByText('Đã duyệt yêu cầu của Võ Đức Thịnh.')).toBeVisible();
  await expect(tile(page, 'Chờ duyệt')).toContainText('10');
  await expect(tile(page, 'Đã duyệt')).toContainText('6');
  await expect(rowOf(page, 'Võ Đức Thịnh')).toContainText('Đã duyệt');
  await expect(rowOf(page, 'Võ Đức Thịnh').getByRole('button', { name: 'Xem yêu cầu của Võ Đức Thịnh' })).toHaveCount(2);
  await expect(bell(page)).toHaveAccessibleName('Thông báo, 12 việc cần xử lý');
  await expect(navLink(page)).toHaveText(/10$/);
});

test('từ chối: nút khoá tới khi có lý do; xong thì đơn ở nhóm Từ chối, xem lại thấy lý do', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Từ chối yêu cầu của Lê Hoàng Nam, mở ô ghi lý do' }).click();
  await expect(page).toHaveURL(/don=ib-e1/);
  await expect(page).toHaveURL(/tuchoi=1/);
  const d = drawer(page, 'Lê Hoàng Nam');
  await expect(d).toBeVisible();
  // Một ô ghi chú ở chân ngăn (board Q3): mở bằng Từ chối thì focus vào ô và câu gợi ý nhắc ghi lý do.
  const note = d.getByRole('textbox', { name: 'Ghi chú cho nhân viên' });
  await expect(note).toBeFocused();
  await expect(d.getByText('Ghi lý do để bật nút Từ chối. Nhân viên đọc được ghi chú này.')).toBeVisible();
  const reject = d.getByRole('button', { name: 'Từ chối', exact: true });
  await expect(reject).toBeDisabled();
  await expect(d.getByRole('button', { name: 'Duyệt', exact: true })).toBeEnabled();
  await note.fill('   ');
  await expect(reject).toBeDisabled();

  await note.fill('Camera ghi bạn ra lúc 17:05.');
  await expect(reject).toBeEnabled();
  await reject.click();
  await expect(page.getByText('Đã từ chối yêu cầu của Lê Hoàng Nam.')).toBeVisible();
  await expect(page).not.toHaveURL(/tuchoi=1/);
  await expect(d).toContainText('Đã từ chối');
  await expect(d).toContainText('Camera ghi bạn ra lúc 17:05.');
  await expect(d.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0);
  await expect(d.getByRole('textbox')).toHaveCount(0);

  await d.getByRole('button', { name: 'Đóng' }).click();
  await expect(page).not.toHaveURL(/don=/);
  await tile(page, 'Từ chối').click();
  await expect(rows(page)).toHaveCount(2);
  // Nút Xem ở cột Thao tác (nút tên người cũng mở cùng ngăn).
  await rowOf(page, 'Lê Hoàng Nam').getByRole('button', { name: 'Xem yêu cầu của Lê Hoàng Nam' }).last().click();
  await expect(drawer(page, 'Lê Hoàng Nam')).toContainText('Camera ghi bạn ra lúc 17:05.');
  await expect(page).toHaveURL(/don=ib-e1/);
});

test('?don sai thì bỏ khỏi đường dẫn', async ({ page }) => {
  await page.goto(`${URL}?don=khong-co&tuchoi=1`);
  await expect(rows(page)).toHaveCount(18);
  await expect(page).not.toHaveURL(/don=/);
  await expect(page).not.toHaveURL(/tuchoi=/);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto(`${URL}?don=d4`);
  await expect(drawer(page, 'Trần Minh Quân')).toContainText('Camera cổng ghi bạn vào lúc 08:45, không phải 08:00.');
});

test('/admin/yeu-cau/moi-thang vẫn chuyển về Tổng quan', async ({ page }) => {
  await page.goto('/admin/yeu-cau/moi-thang?thang=2026-10');
  await expect(page).toHaveURL('/admin/tong-quan?thang=2026-10');
});

// Q5 (06/11): chế độ chọn chỉ cho đơn đang chờ; Từ chối không làm hàng loạt vì mỗi đơn cần lý do.
test('duyệt nhiều đơn: chỉ đơn chờ chọn được, nút Duyệt/Từ chối trên dòng ẩn, chạy xong báo "Đã duyệt N đơn."', async ({ page }) => {
  await page.goto(URL);
  const bulk = page.getByRole('button', { name: 'Duyệt nhiều đơn' });
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  // Bộ lọc không còn đơn chờ thì không có nút.
  await tile(page, 'Đã duyệt').click();
  await expect(rows(page)).toHaveCount(5);
  await expect(bulk).toHaveCount(0);
  await tile(page, 'Tất cả').click();

  await bulk.click();
  const bar = page.getByRole('toolbar', { name: 'Duyệt nhiều đơn cho nhiều đơn' });
  await expect(bar).toContainText('Đã chọn 0 / 11 đơn');
  await expect(bar).toContainText('Từ chối vẫn làm ở từng đơn vì cần ghi lý do');
  await expect(bar.getByRole('button', { name: 'Chọn ít nhất 1 đơn' })).toBeDisabled();
  await expect(bulk).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Duyệt yêu cầu của / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Từ chối yêu cầu của / })).toHaveCount(0);
  const locked = page.getByRole('checkbox', { name: 'Chọn đơn của Hoàng Thị Mai' });
  await expect(locked).toBeDisabled();
  await expect(locked).toHaveAttribute('title', 'Đơn đã xử lý, không chọn được');

  await kind(page, 'Giải trình').click();
  const all = page.getByRole('checkbox', { name: 'Chọn tất cả đơn chờ duyệt đang hiện' });
  await all.click();
  await expect(bar).toContainText('Đã chọn 4 / 4 đơn');
  await page.getByRole('checkbox', { name: 'Chọn đơn của Đỗ Mai Linh' }).click();
  await expect(bar).toContainText('Đã chọn 3 / 4 đơn');
  await expect(all).toHaveAttribute('aria-checked', 'mixed');
  await bar.getByRole('button', { name: 'Duyệt 3 đơn' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Đã duyệt 3 đơn.' })).toBeVisible();
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await kind(page, 'Tất cả loại').click();
  await expect(tile(page, 'Chờ duyệt')).toContainText('8');
  await expect(tile(page, 'Đã duyệt')).toContainText('8');
  await expect(rowOf(page, 'Đỗ Mai Linh')).toContainText('Chờ duyệt');
  await expect(bell(page)).toHaveAccessibleName('Thông báo, 10 việc cần xử lý');
  await expect(navLink(page)).toHaveText(/8$/);
});

// Bàn phím: vào chế độ chọn thì tiêu điểm tới nút Huỷ của thanh đen (nút vừa bấm biến mất); thoát (Huỷ hoặc chạy xong)
// thì tiêu điểm về lại nút đã mở chế độ, không rơi về đầu trang.
test('select mode moves focus to Huỷ on entry and back to "Duyệt nhiều đơn" on leaving', async ({ page }) => {
  await page.goto(URL);
  const bulk = page.getByRole('button', { name: 'Duyệt nhiều đơn' });
  const quit = page.getByRole('button', { name: 'Huỷ, thoát chế độ chọn' });
  await bulk.focus();
  await page.keyboard.press('Enter');
  await expect(quit).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(quit).toHaveCount(0);
  await expect(bulk).toBeFocused();

  await page.keyboard.press('Enter');
  await page.getByRole('checkbox', { name: 'Chọn đơn của Đỗ Mai Linh' }).click();
  await page.getByRole('button', { name: 'Duyệt 1 đơn' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã duyệt 1 đơn.' })).toBeVisible();
  await expect(bulk).toBeFocused();
});

// Vòng duyệt chạy từng đơn một: đang chạy thì Huỷ khoá (Huỷ không dừng được các đơn đã gửi đi), chạy xong mới thoát.
test('Huỷ is locked while the approvals run', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Duyệt nhiều đơn' }).click();
  const bar = page.getByRole('toolbar', { name: 'Duyệt nhiều đơn cho nhiều đơn' });
  await page.getByRole('checkbox', { name: 'Chọn đơn của Đỗ Mai Linh' }).click();
  await page.evaluate(() => ((window as unknown as { __mockLatencyMs: number }).__mockLatencyMs = 400));
  await bar.getByRole('button', { name: 'Duyệt 1 đơn' }).click();
  await expect(bar.getByRole('button', { name: 'Đang duyệt…' })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Huỷ, thoát chế độ chọn' })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Đã duyệt 1 đơn.' })).toBeVisible();
  await expect(bar).toHaveCount(0);
});

// Hai lần tải chồng nhau: lần tải chậm bắt đầu trước (dữ liệu cũ) xong sau lần tải sau khi duyệt, không được đè lên.
test('a slow earlier load does not overwrite the list after an approval', async ({ page }) => {
  await page.goto(URL);
  await expect(rowOf(page, 'Võ Đức Thịnh')).toContainText('Chờ duyệt');
  await page.evaluate(async () => {
    const w = window as unknown as { __mockLatencyMs: number };
    w.__mockLatencyMs = 600;
    const app = (document.querySelector('#app') as unknown as { __vue_app__: any }).__vue_app__;
    app.config.globalProperties.$pinia._s.get('shell').version++;
    // Đợi watcher của màn chạy (lần tải chậm đã chụp dữ liệu lúc này) rồi mới bỏ độ trễ.
    await new Promise(r => setTimeout(r, 0));
    w.__mockLatencyMs = 0;
  });
  await page.getByRole('button', { name: 'Duyệt yêu cầu của Võ Đức Thịnh' }).click();
  await expect(rowOf(page, 'Võ Đức Thịnh')).toContainText('Đã duyệt');
  await page.waitForTimeout(900);
  await expect(rowOf(page, 'Võ Đức Thịnh')).toContainText('Đã duyệt');
});

// Máy chủ thật: màn gộp hai lần đọc (đơn chờ, đơn gần đây) nên một đơn chờ có thể về hai lần. Danh sách bỏ trùng theo id
// và giữ thứ tự của board: đơn chờ cũ nhất trước, rồi đơn đã xử lý mới xử lý nhất trước.
test('real-server rows drop duplicate ids and keep pending oldest first, then latest reviewed first', () => {
  const leave = (id: string, status: RequestDTO['status'], createdAt: string, reviewedAt?: string) => ({
    id,
    employeeId: 'e1',
    type: 'LEAVE' as const,
    status,
    reason: 'Việc nhà',
    createdAt,
    leaveType: 'ANNUAL',
    leaveStartDate: '2026-10-29',
    leaveEndDate: '2026-10-29',
    leaveDaysCount: 1,
    reviewedAt: reviewedAt ?? null
  });
  const people = new Map([['e1', { name: 'Lê Hoàng Nam', title: 'Kỹ thuật · Kỹ sư' }]]);
  const rows = requestRowsFromDto(
    [
      leave('ok-old', 'APPROVED', '2026-10-20T01:00:00Z', '2026-10-21T01:00:00Z'),
      leave('pend-new', 'PENDING', '2026-10-27T01:00:00Z'),
      leave('rej-late', 'REJECTED', '2026-10-22T01:00:00Z', '2026-10-26T01:00:00Z'),
      leave('pend-old', 'PENDING', '2026-10-23T01:00:00Z'),
      leave('pend-new', 'PENDING', '2026-10-27T01:00:00Z')
    ],
    people,
    Date.parse('2026-10-28T01:00:00Z')
  );
  expect(rows.map(r => r.id)).toEqual(['pend-old', 'pend-new', 'rej-late', 'ok-old']);
});
