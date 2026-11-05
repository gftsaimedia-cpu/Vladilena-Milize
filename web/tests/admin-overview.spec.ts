import { expect, test, type Page } from '@playwright/test';

// Tổng quan chạy trên dữ liệu giả (mock/overview.ts): không page.route, không gọi /api.
const bellOf = (page: Page) => page.locator('.topbar .bell');
const requestsKpi = (page: Page) =>
  page.getByRole('region', { name: 'Chỉ số chính' }).getByRole('article', { name: 'Yêu cầu chờ duyệt' });
const queueOf = (page: Page) => page.getByRole('region', { name: 'Việc cần duyệt, cuộn để xem thêm' });
const cardOf = (page: Page) => page.getByRole('region', { name: /^Việc cần duyệt$/ });
const openRows = (page: Page) => queueOf(page).getByRole('button', { name: /^Mở cửa sổ duyệt: / });
const rowOf = (page: Page, text: string) => openRows(page).filter({ hasText: new RegExp(text) });
const approvalDialog = (page: Page) => page.getByRole('dialog', { name: 'Duyệt yêu cầu' });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('overview shows the mock figures', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
  await expect(
    page.getByText('Còn 4 việc phải xong trước khi chốt lương tháng 10 · hạn 31/10, còn 3 ngày')
  ).toBeVisible();

  const kpis = page.getByRole('region', { name: 'Chỉ số chính' });
  for (const text of ['2,48 tỷ', '128', '113']) await expect(kpis).toContainText(text);
  await expect(requestsKpi(page).locator('.kpi-v')).toHaveText('11');

  await expect(page.getByRole('figure', { name: /hôm nay 28\/10 88%/ })).toBeVisible();

  const period = page.getByRole('region', { name: 'Kỳ lương tháng 10' });
  await expect(period).toContainText('Chờ duyệt');
  await expect(period).toContainText('86');

  await expect(openRows(page)).toHaveCount(13);
  await expect(openRows(page).first()).toContainText('Trịnh Văn Long');
  await expect(openRows(page).first()).toContainText('Quên Check-out · 27/10');
  await expect(rowOf(page, 'Nguyễn Thu Hà')).toContainText('Phép năm · 29–30/10');
});

test('the approvals list is grouped like the bell and scrolls inside the card', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const queue = queueOf(page);
  await expect(queue).toHaveAttribute('tabindex', '0');
  await expect(queue.getByRole('heading', { level: 3 })).toHaveText([
    'Chấm công 2',
    'Đơn nghỉ 3',
    'Làm thêm, làm bù 2',
    'Giải trình 4',
    'Tạm ứng 2'
  ]);
  const sizes: [string, number][] = [
    ['Chấm công', 2],
    ['Đơn nghỉ', 3],
    ['Làm thêm, làm bù', 2],
    ['Giải trình', 4],
    ['Tạm ứng', 2]
  ];
  for (const [name, n] of sizes) {
    await expect(queue.getByRole('list', { name, exact: true }).getByRole('listitem')).toHaveCount(n);
  }
  expect(await queue.evaluate(el => el.scrollHeight > el.clientHeight)).toBeTruthy();
  // Tiêu đề, số đếm và "Xem tất cả" đứng ngoài vùng cuộn.
  const card = cardOf(page);
  await expect(card.getByRole('heading', { name: 'Việc cần duyệt', level: 2 })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Xem tất cả', exact: true })).toBeVisible();
  await expect(card.locator('.count')).toHaveText('13');
});

test('three cards share one row with equal top, width and height at 1440x900', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await expect(openRows(page)).toHaveCount(13);
  const boxes = await page.locator('.trio > *').evaluateAll(els =>
    els.map(el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, width: r.width, height: r.height };
    })
  );
  expect(boxes).toHaveLength(3);
  for (const b of boxes) {
    expect(Math.abs(b.top - boxes[0].top)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.width - boxes[0].width)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.height - boxes[0].height)).toBeLessThanOrEqual(1);
  }
});

test('below the breakpoint the cards stack at 300px or wider and the list is capped near 420px', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/admin/tong-quan');
  await expect(openRows(page)).toHaveCount(13);
  const boxes = await page.locator('.trio > *').evaluateAll(els =>
    els.map(el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width };
    })
  );
  expect(boxes[1].top).toBeGreaterThan(boxes[0].top);
  expect(boxes[2].top).toBeGreaterThan(boxes[1].top);
  expect(boxes[0].left).toBe(boxes[2].left);
  expect(boxes[2].width).toBeGreaterThanOrEqual(300);
  const height = await queueOf(page).evaluate(el => el.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(421);
  expect(height).toBeGreaterThan(240);
});

test('tick approves at once, cross opens the dialog with the note focused', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await expect(rowOf(page, 'Nguyễn Thu Hà')).toBeVisible();

  await page.getByRole('button', { name: 'Duyệt yêu cầu của Nguyễn Thu Hà' }).click();
  await expect(approvalDialog(page)).toHaveCount(0);
  await expect(rowOf(page, 'Nguyễn Thu Hà')).toHaveCount(0);
  await expect(openRows(page)).toHaveCount(12);
  await expect(requestsKpi(page).locator('.kpi-v')).toHaveText('10');
  await expect(bellOf(page)).toHaveAccessibleName('Thông báo, 12 việc cần xử lý');
  await expect(page.getByText('Đã duyệt yêu cầu của Nguyễn Thu Hà.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duyệt yêu cầu của Bùi Quốc Huy' })).toBeFocused();

  await page.getByRole('button', { name: 'Từ chối yêu cầu của Bùi Quốc Huy' }).click();
  const dialog = approvalDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Bùi Quốc Huy');
  await expect(dialog.getByLabel('Ghi chú cho nhân viên')).toBeFocused();
  await expect(openRows(page)).toHaveCount(12);
});

test('a row opens the approval dialog with the right person; Esc closes it and returns focus', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const row = rowOf(page, 'Bùi Quốc Huy');
  await expect(row).toHaveAccessibleName('Mở cửa sổ duyệt: Nghỉ ốm · 28/10, Bùi Quốc Huy · Sản xuất');
  await row.click();
  const dialog = approvalDialog(page);
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Đóng', exact: true })).toHaveCount(1);
  await expect(dialog.getByRole('heading', { name: 'Bùi Quốc Huy' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Nghỉ ốm · 1 ngày' })).toBeVisible();
  await expect(dialog).toContainText('Đơn nghỉ');
  await expect(dialog.getByRole('button', { name: 'Duyệt', exact: true })).toBeVisible();
  expect((await dialog.boundingBox())?.width).toBe(480);
  expect(new URL(page.url()).search).toBe('');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeFocused();
  await expect(openRows(page)).toHaveCount(13);
});

test('rejecting without a note shows the alert; with a note the row leaves and the count drops', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await rowOf(page, 'Bùi Quốc Huy').click();
  const dialog = approvalDialog(page);
  await dialog.getByRole('button', { name: 'Từ chối', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Ghi lý do từ chối để nhân viên biết vì sao.');
  await expect(dialog).toBeVisible();
  await expect(openRows(page)).toHaveCount(13);

  await dialog.getByLabel('Ghi chú cho nhân viên').fill('Chưa có giấy khám bệnh.');
  await dialog.getByRole('button', { name: 'Từ chối', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Đã từ chối yêu cầu của Bùi Quốc Huy.')).toBeVisible();
  await expect(openRows(page)).toHaveCount(12);
  await expect(cardOf(page).locator('.count')).toHaveText('12');
  await expect(rowOf(page, 'Bùi Quốc Huy')).toHaveCount(0);
  await expect(requestsKpi(page).locator('.kpi-v')).toHaveText('10');
  // Focus sang nút mở của dòng đang ở cùng vị trí (Phạm Ngọc Anh).
  await expect(rowOf(page, 'Phạm Ngọc Anh')).toBeFocused();
});

test('approving from the dialog closes it and focuses the last row when the last one leaves', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await rowOf(page, 'Trương Quốc Việt').click();
  const dialog = approvalDialog(page);
  await dialog.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Đã duyệt yêu cầu của Trương Quốc Việt.')).toBeVisible();
  await expect(openRows(page)).toHaveCount(12);
  await expect(rowOf(page, 'Mai Phương Thảo')).toBeFocused();
});

test('a missing-punch row has no tick or cross, only a chevron, and its dialog offers Nhắc giải trình', async ({
  page
}) => {
  await page.goto('/admin/tong-quan');
  const row = rowOf(page, 'Trịnh Văn Long');
  const item = queueOf(page).getByRole('listitem').filter({ hasText: 'Trịnh Văn Long' });
  await expect(item.getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Duyệt yêu cầu của Trịnh Văn Long' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Từ chối yêu cầu của Trịnh Văn Long' })).toHaveCount(0);
  await expect(row.locator('.ap-chev')).toBeVisible();

  await row.click();
  const dialog = approvalDialog(page);
  await expect(dialog.getByRole('button', { name: 'Nhắc giải trình' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Khai thay giờ ra' })).toBeVisible();
  await expect(dialog.getByLabel('Ghi chú cho nhân viên')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Nhắc giải trình' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Đã nhắc Trịnh Văn Long giải trình.')).toBeVisible();
  await expect(openRows(page)).toHaveCount(12);
});

test('Mở hồ sơ chấm công in the dialog closes it and navigates', async ({ page }) => {
  await page.goto('/admin/tong-quan?thang=2026-11');
  await rowOf(page, 'Trịnh Văn Long').click();
  await approvalDialog(page).getByRole('link', { name: 'Mở hồ sơ chấm công' }).click();
  await expect(page).toHaveURL(/\/admin\/cham-cong\/nhan-vien\/trinh-van-long\?thang=2026-11$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('approving every request shows the empty state and focuses Xem tất cả', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const approve = page.getByRole('button', { name: /^Duyệt yêu cầu của / });
  await expect(approve.first()).toBeVisible();
  while (await approve.count()) {
    const label = (await approve.first().getAttribute('aria-label')) as string;
    await approve.first().click();
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  // Còn 2 dòng Quên chấm công: chỉ xử lý được trong cửa sổ (Nhắc giải trình).
  await expect(openRows(page)).toHaveCount(2);
  while (await openRows(page).count()) {
    await openRows(page).first().click();
    await approvalDialog(page).getByRole('button', { name: 'Nhắc giải trình' }).click();
    await expect(approvalDialog(page)).toHaveCount(0);
  }
  await expect(page.getByText('Không còn yêu cầu nào chờ duyệt.')).toBeVisible();
  await expect(requestsKpi(page).locator('.kpi-v')).toHaveText('0');
  await expect(bellOf(page)).toHaveAccessibleName('Thông báo, 0 việc cần xử lý');
  await expect(page.getByRole('link', { name: 'Xem tất cả', exact: true })).toBeFocused();
});

test('payroll table filters by status and searches without accents', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const table = page.getByRole('region', { name: 'Bảng lương tháng 10' });
  const rows = table.locator('tbody tr');
  const filters = page.getByRole('group', { name: 'Lọc theo trạng thái' });
  const search = page.getByLabel('Tìm theo tên hoặc phòng ban');

  await filters.getByRole('button', { name: /^Chờ duyệt/ }).click();
  await expect(filters.getByRole('button', { name: /^Chờ duyệt/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Lê Hoàng Nam');
  await expect(rows.nth(1)).toContainText('Phạm Ngọc Anh');

  await filters.getByRole('button', { name: /^Tất cả/ }).click();
  await expect(rows).toHaveCount(6);

  await search.fill('quan');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Trần Minh Quân');

  await search.fill('QUÂN');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Trần Minh Quân');

  await search.fill('xyz');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('Không có phiếu nào khớp.')).toBeVisible();
});

test('month change relabels the overview', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  await expect(page.getByRole('heading', { name: 'Kỳ lương tháng 9' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bảng lương tháng 9' })).toBeVisible();
});

test('overview fits 375px and the table scrolls in its own region', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/tong-quan');
  const table = page.getByRole('region', { name: 'Bảng lương tháng 10' });
  await expect(table).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(table).toHaveAttribute('tabindex', '0');
  expect(await table.evaluate(el => el.scrollWidth > el.clientWidth)).toBeTruthy();
});

test('overview links keep the chosen month', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  await expect(page).toHaveURL(/thang=2026-09/);
  const links: [string, RegExp][] = [
    ['Mở bảng lương', /\/admin\/bang-luong\?thang=2026-09/],
    ['Xem tất cả', /\/admin\/tong-quan\?thang=2026-09&hop=chuong$/],
    ['Mở bảng lương đầy đủ', /\/admin\/bang-luong\?thang=2026-09/]
  ];
  for (const [name, url] of links) {
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', url);
  }
  await page.getByRole('link', { name: 'Mở bảng lương', exact: true }).click();
  await expect(page).toHaveURL(/thang=2026-09/);
});

test('overview rows and totals follow the payroll mock', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const nam = page.getByRole('region', { name: 'Bảng lương tháng 10' }).locator('tbody tr', { hasText: 'Lê Hoàng Nam' });
  for (const text of ['24 / 26', '12.000.000', '2.215.384', '14.278.183', 'Chờ duyệt']) await expect(nam).toContainText(text);
  const period = page.getByRole('region', { name: 'Kỳ lương tháng 10' });
  for (const text of ['2,11 tỷ ₫', '0,37 tỷ ₫', '85%', '86']) await expect(period).toContainText(text);
});

test('Xem tất cả opens the bell drawer on the overview and keeps the month', async ({ page }) => {
  await page.goto('/admin/tong-quan?thang=2026-11');
  await expect(page.getByRole('dialog', { name: 'Thông báo' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Xem tất cả', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Thông báo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Thông báo' })).toBeVisible();
  const url = new URL(page.url());
  expect(url.pathname).toBe('/admin/tong-quan');
  expect(url.searchParams.get('thang')).toBe('2026-11');
});

test('Xem tất cả opens the bell drawer again after it was closed', async ({ page }) => {
  await page.goto('/admin/tong-quan?thang=2026-11');
  const drawer = page.getByRole('dialog', { name: 'Thông báo' });
  const all = page.getByRole('link', { name: 'Xem tất cả', exact: true });
  await all.click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await all.click();
  await expect(drawer).toBeVisible();
});

test('from the drawer opened by Xem tất cả, Mở hồ sơ chấm công still reaches the profile', async ({ page }) => {
  await page.goto('/admin/tong-quan?thang=2026-11');
  await page.getByRole('link', { name: 'Xem tất cả', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Thông báo' });
  await drawer.getByRole('button', { name: /, Trịnh Văn Long · / }).click();
  await page.getByRole('link', { name: 'Mở hồ sơ chấm công' }).click();
  await expect(page).toHaveURL(/\/admin\/cham-cong\/nhan-vien\/trinh-van-long\?thang=2026-11$/);
  await expect(drawer).toHaveCount(0);
});
