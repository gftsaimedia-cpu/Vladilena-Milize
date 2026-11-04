import { expect, test, type Page } from '@playwright/test';

function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}
const NAMES = [
  'Nguyễn Thu Hà',
  'Trần Minh Quân',
  'Lê Hoàng Nam',
  'Phạm Ngọc Anh',
  'Võ Đức Thịnh',
  'Đỗ Mai Linh',
  'Bùi Quốc Huy',
  'Hoàng Thị Mai',
  'Phan Minh Khoa',
  'Đặng Văn Phúc'
];
const table = (page: Page) => page.getByRole('region', { name: 'Bảng danh sách nhân sự' });
const rows = (page: Page) => table(page).locator('tbody tr');
const names = (page: Page) => table(page).locator('tbody .nn');
const row = (page: Page, name: string) => rows(page).filter({ has: page.locator('.nn', { hasText: name }) });
const stat = (page: Page, label: string) =>
  page.getByRole('region', { name: 'Chỉ số nhân sự' }).getByRole('article', { name: label });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('staff list follows board I without calling /api', async ({ page }) => {
  const calls = trackApi(page);
  await page.goto('/admin/nhan-su');

  await expect(page.getByRole('heading', { level: 1, name: 'Nhân sự' })).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  for (const name of [
    'Nhập từ Excel',
    'Thêm nhân sự',
    'Bộ lọc',
    'Gán ca',
    'Đổi phòng ban',
    'Trang trước',
    'Trang sau',
    'Sửa hồ sơ'
  ]) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: /^Cách tính/ })).toHaveCount(0);

  await expect(page.getByRole('region', { name: 'Chỉ số nhân sự' }).getByRole('article')).toHaveCount(4);
  await expect(stat(page, 'Nhân sự đang làm')).toContainText('128');
  await expect(stat(page, 'Nhân sự đang làm')).toContainText('người');
  await expect(stat(page, 'Nhân sự đang làm')).toContainText('Tăng');
  await expect(stat(page, 'Nhân sự đang làm')).toContainText('4');
  await expect(stat(page, 'Nhân sự đang làm')).toContainText('so với tháng 9');
  await expect(stat(page, 'Vào làm tháng 10')).toContainText('6');
  await expect(stat(page, 'Vào làm tháng 10')).toContainText('Tăng');
  await expect(stat(page, 'Vào làm tháng 10')).toContainText('2');
  await expect(stat(page, 'Nghỉ việc tháng 10')).toContainText('2');
  await expect(stat(page, 'Nghỉ việc tháng 10')).toContainText('Giảm');
  await expect(stat(page, 'Nghỉ việc tháng 10')).toContainText('1');
  await expect(stat(page, 'Nghỉ việc tháng 10')).toContainText('so với tháng 9');
  await expect(stat(page, 'Thâm niên trung bình')).toContainText('3,2');
  await expect(stat(page, 'Thâm niên trung bình')).toContainText('năm');
  await expect(stat(page, 'Thâm niên trung bình')).toContainText('0,3 năm');
  await expect(stat(page, 'Thâm niên trung bình')).toContainText('so với năm 2025');

  const card = page.getByRole('region', { name: 'Danh sách nhân sự', exact: true });
  await expect(card.getByRole('heading', { name: 'Danh sách nhân sự' })).toBeVisible();
  await expect(card).toContainText('131 hồ sơ');

  await expect(names(page)).toHaveText(NAMES);
  await expect(page.getByText('Hiển thị 1–10 trong 131 hồ sơ')).toBeVisible();
  await expect(row(page, 'Đặng Văn Phúc')).toHaveClass(/gone/);

  const label = (name: string) => row(page, name).locator('.stt');
  await expect(label('Lê Hoàng Nam')).toHaveText('Chính thức');
  await expect(label('Đỗ Mai Linh')).toHaveText('Thử việc');
  await expect(label('Hoàng Thị Mai')).toHaveText('Tạm nghỉ');
  await expect(label('Đặng Văn Phúc')).toHaveText('Đã nghỉ việc');

  const pending = row(page, 'Đỗ Mai Linh').locator('[title="Chưa kích hoạt tài khoản"]');
  await expect(pending).toBeVisible();
  await expect(pending).toContainText('linh.do@gft.vn');
  await expect(pending).toContainText(', chưa kích hoạt tài khoản');
  await expect(row(page, 'Lê Hoàng Nam').locator('[title="Đã kích hoạt tài khoản"]')).toContainText('nam.le@gft.vn');

  expect(calls).toEqual([]);
});

test('each cell holds one value on one line under six named columns', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);

  const heads = (await table(page).locator('thead th').allTextContents()).map(t => t.trim()).filter(Boolean);
  expect(heads).toEqual(['Nhân viên', 'Email', 'Phòng ban', 'Chức danh', 'Trạng thái', 'Ngày vào làm']);

  const wraps = await table(page)
    .locator('tbody th, tbody td')
    .evaluateAll(els => els.map(el => getComputedStyle(el).whiteSpace));
  expect(wraps.length).toBeGreaterThan(0);
  expect(wraps.every(w => w === 'nowrap')).toBe(true);

  const nam = row(page, 'Lê Hoàng Nam');
  await expect(nam).toContainText('nam.le@gft.vn');
  await expect(nam).toContainText('Kinh doanh');
  await expect(nam).toContainText('Nhân viên kinh doanh');
  await expect(nam).toContainText('04/03/2024');

  for (const absent of ['GFT-', 'Bậc', 'năm', '08:00']) {
    await expect(table(page)).not.toContainText(absent);
  }
});

for (const width of [375, 768, 1024, 1440]) {
  test(`staff table scrolls inside its own region at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/nhan-su');
    await expect(names(page)).toHaveCount(10);

    await expect(table(page)).toHaveAttribute('tabindex', '0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const sizes = await table(page).evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    if (width < 1440) {
      expect(sizes.scroll).toBeGreaterThan(sizes.client);
      await table(page).focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => table(page).evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    } else {
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
    }
  });
}

test('staff screen has one dark card and no shadows', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);

  await expect(page.locator('.kc.dk')).toHaveCount(1);
  const dark = stat(page, 'Nhân sự đang làm');
  await expect(dark).toHaveClass(/dk/);
  await expect(dark).toHaveCSS('background-color', 'rgb(28, 28, 28)');
  await expect(dark.locator('.kc-v')).toHaveCSS('color', 'rgb(232, 195, 114)');
  for (const label of ['Vào làm tháng 10', 'Nghỉ việc tháng 10', 'Thâm niên trung bình']) {
    await expect(stat(page, label)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  }

  const shadows = await page
    .locator('.staff, .staff *')
    .evaluateAll(els => els.map(el => getComputedStyle(el).boxShadow).filter(s => s !== 'none'));
  expect(shadows).toEqual([]);
});

const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Tìm theo tên, mã hoặc email' });
const inactiveSwitch = (page: Page) => page.getByRole('switch', { name: /Chưa kích hoạt tài khoản/ });

test('search matches name, code and email without diacritics or extra spaces', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  const box = searchBox(page);
  await expect(box).toHaveAttribute('placeholder', 'Tìm tên, mã, email…');

  const cases: [string, string[], string?][] = [
    ['  do mai ', ['Đỗ Mai Linh'], '1 kết quả trên trang này'],
    ['hoang', ['Lê Hoàng Nam', 'Hoàng Thị Mai'], '2 kết quả trên trang này'],
    ['GFT-0118', ['Hoàng Thị Mai']],
    ['phuc.dang', ['Đặng Văn Phúc']],
    ['dang', ['Đặng Văn Phúc']],
    ['tai chinh', [], '0 kết quả trên trang này'],
    ['   ', NAMES, 'Hiển thị 1–10 trong 131 hồ sơ']
  ];
  for (const [x, expected, footer] of cases) {
    await box.fill(x);
    await expect(names(page)).toHaveText(expected);
    if (footer) await expect(page.getByText(footer)).toBeVisible();
    if (x === 'tai chinh') {
      await expect(table(page).locator('td.empty')).toHaveText('Không có nhân sự nào khớp bộ lọc trên trang này.');
      await expect(table(page).locator('td.empty')).toHaveAttribute('colspan', '7');
    }
  }
});

test('topbar search opens the list with q and the query survives a reload', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const top = page.getByLabel('Tìm nhân viên');
  await top.fill('Quân');
  await top.press('Enter');

  await expect(page).toHaveURL(/\/admin\/nhan-su\?q=Qu%C3%A2n/);
  const box = searchBox(page);
  await expect(box).toHaveValue('Quân');
  await expect(names(page)).toHaveText(['Trần Minh Quân']);

  await top.fill('linh');
  await top.press('Enter');
  await expect(box).toHaveValue('linh');
  await expect(names(page)).toHaveText(['Đỗ Mai Linh']);

  await box.fill('nam');
  await expect(page).toHaveURL(/q=nam/);
  await page.reload();
  await expect(box).toHaveValue('nam');
  await expect(names(page)).toHaveText(['Lê Hoàng Nam']);

  await box.fill('');
  await expect(page).toHaveURL('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
});

test('inactive switch keeps only accounts not yet activated', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  const sw = inactiveSwitch(page);
  const box = searchBox(page);
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(sw).toContainText('2');

  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(names(page)).toHaveText(['Đỗ Mai Linh', 'Phan Minh Khoa']);
  await expect(page.getByText('2 kết quả trên trang này')).toBeVisible();
  await expect(sw).toHaveCSS('border-color', 'rgb(28, 28, 28)');

  await box.fill('khoa');
  await expect(names(page)).toHaveText(['Phan Minh Khoa']);
  await expect(sw).toContainText('2');

  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(names(page)).toHaveText(['Phan Minh Khoa']);
  await expect(page.getByText('1 kết quả trên trang này')).toBeVisible();

  await box.fill('');
  await expect(names(page)).toHaveCount(10);
  await expect(page.getByText('Hiển thị 1–10 trong 131 hồ sơ')).toBeVisible();
});
