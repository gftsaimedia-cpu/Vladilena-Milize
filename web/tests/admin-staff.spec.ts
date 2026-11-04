import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { StaffRow } from '../src/mock/staff';
import { csvCell, staffCsv } from '../src/views/admin/staff/staffCsv';

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

const pick = (page: Page, name: string) => page.getByRole('checkbox', { name: `Chọn ${name}` });
const all = (page: Page) => page.getByRole('checkbox', { name: 'Chọn tất cả dòng đang hiện' });
const selb = (page: Page) => page.locator('.selb[aria-live="polite"]');

async function exportCsv(page: Page, name: string) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
  expect(dl.suggestedFilename()).toBe('danh-sach-nhan-su.csv');
  return fs.readFileSync(await dl.path(), 'utf8');
}

test('selecting rows counts them, tints them and labels the export', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  await expect(all(page)).toHaveAttribute('aria-checked', 'false');
  await expect(selb(page)).toHaveCount(1);
  await expect(selb(page)).toBeEmpty();
  await expect(page.getByRole('columnheader', { name: 'Chọn tất cả dòng đang hiện' })).toHaveAttribute('scope', 'col');

  await pick(page, 'Lê Hoàng Nam').click();
  await expect(pick(page, 'Lê Hoàng Nam')).toHaveAttribute('aria-checked', 'true');
  await expect(row(page, 'Lê Hoàng Nam').locator('th')).toHaveCSS('background-color', 'rgb(255, 249, 236)');
  await expect(row(page, 'Lê Hoàng Nam')).toHaveClass(/\bon\b/);
  await expect(selb(page)).toHaveText('Đã chọn 1');
  await expect(all(page)).toHaveAttribute('aria-checked', 'mixed');
  await expect(page.getByRole('button', { name: 'Xuất 1 người đã chọn ra Excel' })).toBeVisible();
  for (const name of ['Gán ca', 'Đổi phòng ban']) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }

  await pick(page, 'Lê Hoàng Nam').click();
  await expect(pick(page, 'Lê Hoàng Nam')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText(/^Đã chọn/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xuất danh sách ra Excel' })).toBeVisible();
});

test('select all follows the rows on screen and hidden picks are kept but not counted', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  const sw = inactiveSwitch(page);
  const box = searchBox(page);

  await sw.click();
  await all(page).click();
  await expect(all(page)).toHaveAttribute('aria-checked', 'true');
  await expect(selb(page)).toHaveText('Đã chọn 2');

  await sw.click();
  await expect(names(page)).toHaveCount(10);
  await expect(all(page)).toHaveAttribute('aria-checked', 'mixed');
  await expect(selb(page)).toHaveText('Đã chọn 2');

  await box.fill('nam');
  await expect(names(page)).toHaveText(['Lê Hoàng Nam']);
  await expect(all(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText(/^Đã chọn/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xuất danh sách ra Excel' })).toBeVisible();

  await box.fill('');
  await expect(selb(page)).toHaveText('Đã chọn 2');
  await expect(pick(page, 'Đỗ Mai Linh')).toHaveAttribute('aria-checked', 'true');

  await all(page).click();
  await expect(all(page)).toHaveAttribute('aria-checked', 'true');
  await expect(selb(page)).toHaveText('Đã chọn 10');
  await all(page).click();
  await expect(all(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText(/^Đã chọn/)).toHaveCount(0);
});

test('export downloads the shown or the selected rows as CSV', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);

  const t = await exportCsv(page, 'Xuất danh sách ra Excel');
  expect(t.charCodeAt(0)).toBe(0xfeff);
  const lines = t.slice(1).split('\r\n');
  expect(lines).toHaveLength(12);
  expect(lines[0]).toBe('Mã;Họ tên;Email;Phòng ban;Chức danh;Trạng thái;Ngày vào làm;Tài khoản');
  expect(lines[1]).toBe(
    'GFT-0108;Nguyễn Thu Hà;thuha.nguyen@gft.vn;Tài chính;Kế toán tổng hợp;Chính thức;12/03/2021;Đã kích hoạt'
  );
  expect(lines[6]).toBe(
    'GFT-0201;Đỗ Mai Linh;linh.do@gft.vn;Marketing;Thiết kế đồ hoạ;Thử việc;01/09/2026;Chưa kích hoạt'
  );

  await pick(page, 'Lê Hoàng Nam').click();
  await pick(page, 'Hoàng Thị Mai').click();
  const two = (await exportCsv(page, 'Xuất 2 người đã chọn ra Excel')).slice(1).split('\r\n');
  expect(two).toHaveLength(4);
  expect(two[1].startsWith('GFT-0142;Lê Hoàng Nam;')).toBe(true);
  expect(two[2].startsWith('GFT-0118;Hoàng Thị Mai;')).toBe(true);

  await pick(page, 'Lê Hoàng Nam').click();
  await pick(page, 'Hoàng Thị Mai').click();
  await inactiveSwitch(page).click();
  const inactive = (await exportCsv(page, 'Xuất danh sách ra Excel')).slice(1).split('\r\n');
  expect(inactive).toHaveLength(4);
  expect(inactive[1].startsWith('GFT-0201;Đỗ Mai Linh;')).toBe(true);
  expect(inactive[2]).toContain(';Phan Minh Khoa;');
});

test('csv quotes cells holding a semicolon, a quote or a line break', () => {
  expect(csvCell('Kế toán')).toBe('Kế toán');
  expect(csvCell('a;b')).toBe('"a;b"');
  expect(csvCell('nói "có"')).toBe('"nói ""có"""');
  expect(csvCell('dòng 1\ndòng 2')).toBe('"dòng 1\ndòng 2"');
  expect(csvCell('dòng 1\r\ndòng 2')).toBe('"dòng 1\r\ndòng 2"');

  const odd: StaffRow = {
    id: 'x',
    name: 'Ngô "Béo"; Văn',
    initials: 'NB',
    code: 'GFT-9',
    email: 'x@gft.vn',
    activated: false,
    dept: 'Kinh doanh;\nMiền Bắc',
    title: 'Trưởng nhóm',
    status: 'ok',
    statusLabel: 'Chính thức',
    joined: '2024-03-04'
  };
  const out = staffCsv([odd]);
  expect(out.charCodeAt(0)).toBe(0xfeff);
  expect(out.endsWith('\r\n')).toBe(true);
  expect(out.slice(1).split('\r\n')[1]).toBe(
    'GFT-9;"Ngô ""Béo""; Văn";x@gft.vn;"Kinh doanh;\nMiền Bắc";Trưởng nhóm;Chính thức;04/03/2024;Chưa kích hoạt'
  );
});
