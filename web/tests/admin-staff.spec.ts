import fs from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { tenure, type StaffRow } from '../src/mock/staff';
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

  // Ô Email chỉ còn chữ: không dấu kích hoạt, không chữ ẩn "chưa kích hoạt" (06/11, tình trạng tài khoản xem trong hồ sơ).
  await expect(row(page, 'Đỗ Mai Linh').locator('td').first()).toHaveText('linh.do@gft.vn');
  await expect(table(page).locator('[title*="kích hoạt"]')).toHaveCount(0);

  expect(calls).toEqual([]);
});

test('no inactive switch and no checkbox column until a bulk action starts', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.getByText('Chưa kích hoạt tài khoản')).toHaveCount(0);
  await expect(table(page).getByRole('checkbox')).toHaveCount(0);
  await expect(table(page).locator('col')).toHaveCount(6);
  await expect(page.getByText(/^Đã chọn/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gán ca' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đổi phòng ban' })).toBeVisible();
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
const pstSel = (page: Page) => page.getByRole('combobox', { name: 'Trạng thái nhân sự', exact: true });
const deptSel = (page: Page) => page.getByRole('combobox', { name: 'Phòng ban', exact: true });

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
      await expect(table(page).locator('td.empty')).toHaveAttribute('colspan', '6');
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

test('staff status and department filters narrow the list', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  await expect(pstSel(page)).toHaveValue('all');
  await expect(pstSel(page).locator('option')).toHaveText([
    'Tất cả nhân sự',
    'Đang làm việc',
    'Tài khoản tôi quản lý',
    'Đang thử việc',
    'Đang tạm nghỉ',
    'Đã nghỉ việc'
  ]);
  await expect(deptSel(page).locator('option')).toHaveText([
    'Tất cả phòng ban',
    'Kinh doanh',
    'Kỹ thuật',
    'Marketing',
    'Nhân sự',
    'Sản xuất',
    'Tài chính'
  ]);

  await pstSel(page).selectOption({ label: 'Đã nghỉ việc' });
  await expect(names(page)).toHaveText(['Đặng Văn Phúc']);
  await expect(page.getByText('1 kết quả trên trang này')).toBeVisible();

  await pstSel(page).selectOption({ label: 'Đang làm việc' });
  await deptSel(page).selectOption({ label: 'Sản xuất' });
  await expect(names(page)).toHaveText(['Bùi Quốc Huy', 'Phan Minh Khoa']);

  await deptSel(page).selectOption({ label: 'Tất cả phòng ban' });
  await pstSel(page).selectOption({ label: 'Tài khoản tôi quản lý' });
  await expect(names(page)).toHaveText(['Bùi Quốc Huy', 'Phan Minh Khoa', 'Đặng Văn Phúc']);

  await pstSel(page).selectOption({ label: 'Đang thử việc' });
  await expect(names(page)).toHaveText(['Đỗ Mai Linh', 'Phan Minh Khoa']);
  await pstSel(page).selectOption({ label: 'Đang tạm nghỉ' });
  await expect(names(page)).toHaveText(['Hoàng Thị Mai']);

  await searchBox(page).fill('linh');
  await expect(names(page)).toHaveText([]);
  await pstSel(page).selectOption({ label: 'Tất cả nhân sự' });
  await expect(names(page)).toHaveText(['Đỗ Mai Linh']);
});

test('the filter pair sits before the search box on one line', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  const a = await pstSel(page).boundingBox();
  const b = await deptSel(page).boundingBox();
  const c = await searchBox(page).boundingBox();
  expect(a!.x).toBeLessThan(b!.x);
  expect(b!.x).toBeLessThan(c!.x);
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  await expect(pstSel(page)).toHaveCSS('border-radius', '8px');
});

const bar = (page: Page, title: string) => page.getByRole('toolbar', { name: `${title} cho nhiều người` });
const pick = (page: Page, name: string) => page.getByRole('checkbox', { name: `Chọn ${name}` });
const all = (page: Page) => page.getByRole('checkbox', { name: 'Chọn tất cả người chọn được đang hiện' });
const result = (page: Page) => page.locator('.rsl[role="status"]');

test('moving people to another department needs people and a department', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  await page.getByRole('button', { name: 'Đổi phòng ban' }).click();

  const b = bar(page, 'Đổi phòng ban');
  await expect(b).toBeVisible();
  await expect(b).toContainText('Đã chọn 0 / 9 người');
  const go = b.getByRole('button', { name: 'Chọn ít nhất 1 người' });
  await expect(go).toBeDisabled();
  await expect(pick(page, 'Đặng Văn Phúc')).toBeDisabled();
  await expect(pick(page, 'Đặng Văn Phúc')).toHaveAttribute('title', 'Đã nghỉ việc, không chọn được');
  await expect(row(page, 'Đặng Văn Phúc')).toHaveClass(/bkoff/);
  await expect(page.getByRole('button', { name: 'Gán ca' })).toHaveCount(0);

  await pick(page, 'Nguyễn Thu Hà').click();
  await expect(pick(page, 'Nguyễn Thu Hà')).toHaveAttribute('aria-checked', 'true');
  await expect(b).toContainText('Đã chọn 1 / 9 người');
  await expect(b.getByRole('button', { name: 'Chọn phòng ban mới' })).toBeDisabled();

  await b.getByRole('combobox', { name: 'Phòng ban mới' }).selectOption({ label: 'Marketing' });
  await b.getByRole('button', { name: 'Đổi phòng ban cho 1 người' }).click();

  await expect(result(page)).toHaveText('Đã chuyển 1 người sang phòng Marketing.');
  await expect(b).toHaveCount(0);
  await expect(table(page).getByRole('checkbox')).toHaveCount(0);
  await expect(row(page, 'Nguyễn Thu Hà').locator('td').nth(1)).toHaveText('Marketing');
});

test('assigning a shift to everyone who can take it', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  await page.getByRole('button', { name: 'Gán ca' }).click();

  const b = bar(page, 'Gán ca');
  await expect(b.getByRole('combobox', { name: 'Ca làm' })).toHaveValue('hc');
  await all(page).click();
  await expect(all(page)).toHaveAttribute('aria-checked', 'true');
  await expect(b).toContainText('Đã chọn 9 / 9 người');
  await expect(pick(page, 'Đặng Văn Phúc')).toHaveAttribute('aria-checked', 'false');

  await b.getByRole('button', { name: 'Gán ca cho 9 người' }).click();
  await expect(result(page)).toHaveText('Đã gán ca Hành chính · 08:00–17:00 cho 9 người.');
  await expect(b).toHaveCount(0);
});

test('filters keep working while picking and only shown rows are counted', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  await page.getByRole('button', { name: 'Gán ca' }).click();
  const b = bar(page, 'Gán ca');
  await pick(page, 'Nguyễn Thu Hà').click();
  await pick(page, 'Bùi Quốc Huy').click();
  await expect(b).toContainText('Đã chọn 2 / 9 người');

  await deptSel(page).selectOption({ label: 'Sản xuất' });
  await expect(names(page)).toHaveText(['Bùi Quốc Huy', 'Phan Minh Khoa', 'Đặng Văn Phúc']);
  await expect(b).toContainText('Đã chọn 1 / 2 người');
  await expect(all(page)).toHaveAttribute('aria-checked', 'mixed');
  await b.getByRole('button', { name: 'Gán ca cho 1 người' }).click();
  await expect(result(page)).toHaveText('Đã gán ca Hành chính · 08:00–17:00 cho 1 người.');
});

test('cancel leaves select mode and the next run starts from zero', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  await page.getByRole('button', { name: 'Gán ca' }).click();
  await pick(page, 'Lê Hoàng Nam').click();
  await expect(row(page, 'Lê Hoàng Nam')).toHaveClass(/\bon\b/);
  await bar(page, 'Gán ca').getByRole('button', { name: 'Huỷ, thoát chế độ chọn' }).click();
  await expect(bar(page, 'Gán ca')).toHaveCount(0);
  await expect(table(page).getByRole('checkbox')).toHaveCount(0);
  await expect(row(page, 'Lê Hoàng Nam')).not.toHaveClass(/\bon\b/);

  await page.getByRole('button', { name: 'Gán ca' }).click();
  await expect(bar(page, 'Gán ca')).toContainText('Đã chọn 0 / 9 người');
  await expect(result(page)).toHaveCount(0);
});

// Chặn trước: lọc ra toàn người đã nghỉ việc thì không có ai để chọn, hai nút khoá kèm lời giải thích.
test('bulk actions are disabled when nobody shown can be picked', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  await pstSel(page).selectOption({ label: 'Đã nghỉ việc' });
  await expect(names(page)).toHaveText(['Đặng Văn Phúc']);
  for (const name of ['Gán ca', 'Đổi phòng ban']) {
    const btn = page.getByRole('button', { name });
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute('title', 'Không có người nào chọn được trong danh sách đang lọc');
  }
  await pstSel(page).selectOption({ label: 'Đang làm việc' });
  await expect(page.getByRole('button', { name: 'Gán ca' })).toBeEnabled();
});

async function exportCsv(page: Page, name: string) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
  expect(dl.suggestedFilename()).toBe('danh-sach-nhan-su.csv');
  return fs.readFileSync(await dl.path(), 'utf8');
}

test('export downloads the rows the filters show as CSV', async ({ page }) => {
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

  await pstSel(page).selectOption({ label: 'Đang thử việc' });
  const trial = (await exportCsv(page, 'Xuất danh sách ra Excel')).slice(1).split('\r\n');
  expect(trial).toHaveLength(4);
  expect(trial[1].startsWith('GFT-0201;Đỗ Mai Linh;')).toBe(true);
  expect(trial[2]).toContain(';Phan Minh Khoa;');
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

test('keyboard targets show a 2px ink focus ring and Space toggles a row in select mode', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);

  const ring = async (target: Locator) => {
    await target.focus();
    await expect(target).toHaveCSS('outline-style', 'solid');
    await expect(target).toHaveCSS('outline-width', '2px');
  };

  await ring(pstSel(page));
  await ring(page.getByRole('button', { name: 'Gán ca' }));
  await ring(page.getByRole('button', { name: 'Xuất danh sách ra Excel' }));
  await page.getByRole('button', { name: 'Gán ca' }).press('Enter');
  const nam = pick(page, 'Lê Hoàng Nam');
  await ring(nam);
  await page.keyboard.press('Space');
  await expect(nam).toHaveAttribute('aria-checked', 'true');
  await expect(bar(page, 'Gán ca')).toContainText('Đã chọn 1 / 9 người');
  await ring(all(page));

  await searchBox(page).focus();
  const find = page.locator('.find');
  await expect(find).toHaveCSS('outline-style', 'solid');
  await expect(find).toHaveCSS('outline-width', '2px');
  await expect(find).toHaveCSS('outline-color', 'rgb(33, 33, 33)');
});

const drawer = (page: Page, name: string) => page.getByRole('dialog', { name: `Hồ sơ của ${name}` });
const fact = (d: Locator, label: string) =>
  d.locator('.fr', { has: d.page().getByText(label, { exact: true }) }).locator('dd');
const nameLink = (page: Page, name: string) => page.getByRole('link', { name, exact: true });
const prevBtn = (page: Page) => page.getByRole('button', { name: 'Người trước' });
const nextBtn = (page: Page) => page.getByRole('button', { name: 'Người sau' });

test("a name opens Hoàng Thị Mai's profile as on board I2", async ({ page }) => {
  const calls = trackApi(page);
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);

  await nameLink(page, 'Hoàng Thị Mai').click();
  await expect(page).toHaveURL('/admin/nhan-su?nv=hoang-thi-mai');
  const d = drawer(page, 'Hoàng Thị Mai');
  await expect(d.getByRole('heading', { level: 2, name: 'Hồ sơ nhân sự' })).toBeVisible();
  await expect(d).toContainText('GFT-0118 · Kế toán viên');
  await expect(d.locator('.stt')).toHaveText('Tạm nghỉ');
  await expect(d.locator('.nt')).toContainText('Nghỉ thai sản');
  await expect(d.locator('.nt')).toContainText('15/09/2026 – 15/03/2027 · đi làm lại 16/03/2027');
  await expect(d.getByRole('heading', { level: 3 })).toHaveText(['Công việc', 'Hợp đồng', 'Tài khoản']);

  const facts: [string, string][] = [
    ['Phòng ban', 'Tài chính'],
    ['Chức danh', 'Kế toán viên'],
    ['Loại · bậc', 'NV · Bậc 2'],
    ['Quản lý trực tiếp', 'Nguyễn Thu Hà'],
    ['Ca làm', 'Hành chính · 08:00–17:00'],
    ['Ngày vào làm', '02/05/2022 · 4 năm 5 tháng'],
    ['Loại hợp đồng', 'HĐLĐ không xác định thời hạn'],
    ['Đóng bảo hiểm', 'Có'],
    ['Người phụ thuộc', '1'],
    ['Email', 'mai.hoang@gft.vn'],
    ['Kích hoạt', 'Đã kích hoạt']
  ];
  for (const [label, value] of facts) await expect(fact(d, label)).toHaveText(value);

  await expect(d.getByRole('link', { name: 'Xem chấm công' })).toHaveAttribute(
    'href',
    '/admin/cham-cong/nhan-vien/hoang-thi-mai'
  );
  await expect(page.getByRole('button', { name: 'Sửa hồ sơ' })).toHaveCount(0);

  await expect(d).toHaveCSS('border-radius', '24px');
  await expect(d).toHaveCSS('box-shadow', 'none');
  const box = await d.boundingBox();
  expect(Math.abs(box!.width - 480)).toBeLessThanOrEqual(1);
  expect(Math.abs(box!.x + box!.width - 1424)).toBeLessThanOrEqual(1);

  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  await expect(page).toHaveURL('/admin/nhan-su');
  await expect(nameLink(page, 'Hoàng Thị Mai')).toBeFocused();
  expect(calls).toEqual([]);
});

test('other profiles show their own values and a dash where no board gives one', async ({ page }) => {
  await page.goto('/admin/nhan-su?nv=le-hoang-nam');
  const d = drawer(page, 'Lê Hoàng Nam');
  await expect(d).toContainText('GFT-0142 · Nhân viên kinh doanh');
  await expect(d.locator('.nt')).toHaveCount(0);
  const facts: [string, string][] = [
    ['Loại · bậc', 'NV · Bậc 2'],
    ['Quản lý trực tiếp', '—'],
    ['Ca làm', 'Hành chính · 08:00–17:00'],
    ['Ngày vào làm', '04/03/2024 · 2 năm 7 tháng'],
    ['Loại hợp đồng', 'HĐLĐ từ 3 tháng'],
    ['Người phụ thuộc', '0'],
    ['Kích hoạt', 'Đã kích hoạt']
  ];
  for (const [label, value] of facts) await expect(fact(d, label)).toHaveText(value);

  await page.mouse.click(200, 450);
  await expect(d).toHaveCount(0);

  await nameLink(page, 'Phan Minh Khoa').click();
  const k = drawer(page, 'Phan Minh Khoa');
  await expect(fact(k, 'Ngày vào làm')).toHaveText('26/10/2026 · 2 ngày');
  await expect(fact(k, 'Loại · bậc')).toHaveText('—');
  await expect(fact(k, 'Kích hoạt')).toHaveText('Chưa kích hoạt');

  await nextBtn(page).click();
  const p = drawer(page, 'Đặng Văn Phúc');
  await expect(fact(p, 'Ngày vào làm')).toHaveText('11/11/2019');
  await expect(p.locator('.stt')).toHaveText('Đã nghỉ việc');

  await page.goto('/admin/nhan-su?thang=2026-10&nv=le-hoang-nam');
  await expect(drawer(page, 'Lê Hoàng Nam').getByRole('link', { name: 'Xem chấm công' })).toHaveAttribute(
    'href',
    '/admin/cham-cong/nhan-vien/le-hoang-nam?thang=2026-10'
  );
});

test('previous and next walk the rows shown when the drawer opened', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);

  await nameLink(page, 'Lê Hoàng Nam').click();
  await expect(drawer(page, 'Lê Hoàng Nam')).toBeVisible();
  await nextBtn(page).click();
  await expect(page).toHaveURL(/nv=pham-ngoc-anh/);
  await expect(drawer(page, 'Phạm Ngọc Anh')).toBeVisible();
  await expect(nextBtn(page)).toBeFocused();

  await page.keyboard.press('Escape');
  await nameLink(page, 'Nguyễn Thu Hà').click();
  await expect(drawer(page, 'Nguyễn Thu Hà')).toBeVisible();
  await expect(prevBtn(page)).toBeDisabled();
  await expect(nextBtn(page)).toBeEnabled();

  await page.keyboard.press('Escape');
  await nameLink(page, 'Hoàng Thị Mai').click();
  await expect(drawer(page, 'Hoàng Thị Mai')).toBeVisible();
  await nextBtn(page).click();
  await expect(drawer(page, 'Phan Minh Khoa')).toBeVisible();
  await nextBtn(page).click();
  await expect(drawer(page, 'Đặng Văn Phúc')).toBeVisible();
  await expect(nextBtn(page)).toBeDisabled();
  await expect(prevBtn(page)).toBeFocused();

  await page.keyboard.press('Escape');
  await pstSel(page).selectOption({ label: 'Đang thử việc' });
  await nameLink(page, 'Đỗ Mai Linh').click();
  await expect(drawer(page, 'Đỗ Mai Linh')).toBeVisible();
  await expect(prevBtn(page)).toBeDisabled();
  await nextBtn(page).click();
  await expect(drawer(page, 'Phan Minh Khoa')).toBeVisible();
  await expect(nextBtn(page)).toBeDisabled();
  await expect(prevBtn(page)).toBeFocused();
});

test('opening the drawer keeps ?q, and ?nv and the walk list survive even if q changes underneath', async ({ page }) => {
  await page.goto('/admin/nhan-su?q=hoang');
  await expect(names(page)).toHaveText(['Lê Hoàng Nam', 'Hoàng Thị Mai']);

  await nameLink(page, 'Lê Hoàng Nam').click();
  await expect(page).toHaveURL(/q=hoang/);
  await expect(page).toHaveURL(/nv=le-hoang-nam/);
  await expect(prevBtn(page)).toBeDisabled();
  await expect(nextBtn(page)).toBeEnabled();

  await searchBox(page).fill('nam');
  await expect(page).toHaveURL(/q=nam/);
  await expect(page).toHaveURL(/nv=le-hoang-nam/);
  await expect(drawer(page, 'Lê Hoàng Nam')).toBeVisible();
  await expect(nextBtn(page)).toBeEnabled();

  await nextBtn(page).click();
  await expect(drawer(page, 'Hoàng Thị Mai')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/admin/nhan-su?q=nam');
});

test('drawer links survive a reload and stale ones are dropped', async ({ page }) => {
  await page.goto('/admin/nhan-su?q=nam&nv=le-hoang-nam');
  await expect(drawer(page, 'Lê Hoàng Nam')).toBeVisible();
  await page.reload();
  await expect(drawer(page, 'Lê Hoàng Nam')).toBeVisible();
  await expect(names(page)).toHaveText(['Lê Hoàng Nam']);
  await expect(prevBtn(page)).toBeDisabled();
  await expect(nextBtn(page)).toBeDisabled();

  await page.goto('/admin/nhan-su?thang=2026-10&nv=khong-co');
  await expect(page).toHaveURL('/admin/nhan-su?thang=2026-10');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(names(page)).toHaveCount(10);

  await page.goto('/admin/nhan-su?hop=sua-ho-so&nv=linh');
  await expect(names(page)).toHaveCount(10);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).not.toContain('nv=');
});

test('keyboard opens the drawer from a name and it fits 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);

  await nameLink(page, 'Lê Hoàng Nam').focus();
  await page.keyboard.press('Enter');
  const d = drawer(page, 'Lê Hoàng Nam');
  await expect(d).toBeVisible();
  const box = await d.boundingBox();
  expect(Math.abs(box!.x - 16)).toBeLessThanOrEqual(1);
  expect(Math.abs(box!.width - 343)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(d.getByRole('link', { name: 'Xem chấm công' })).toBeInViewport();
});

test('drawer buttons and links show a 2px ink focus ring', async ({ page }) => {
  await page.goto('/admin/nhan-su?nv=le-hoang-nam');
  const d = drawer(page, 'Lê Hoàng Nam');
  await expect(d).toBeVisible();
  const targets = [
    prevBtn(page),
    nextBtn(page),
    d.getByRole('button', { name: 'Đóng' }),
    d.getByRole('link', { name: 'Xem chấm công' }),
    nameLink(page, 'Lê Hoàng Nam')
  ];
  for (const target of targets) {
    await target.focus();
    await expect(target).toHaveCSS('outline-style', 'solid');
    await expect(target).toHaveCSS('outline-width', '2px');
    await expect(target).toHaveCSS('outline-color', 'rgb(33, 33, 33)');
  }
});

test('tenure counts months and days and never prints a negative span', () => {
  expect(tenure('2022-05-02', '2026-10-28')).toBe('4 năm 5 tháng');
  expect(tenure('2026-10-26', '2026-10-28')).toBe('2 ngày');
  expect(tenure('2026-09-28', '2026-10-28')).toBe('1 tháng');
  expect(tenure('2026-10-28', '2026-10-28')).toBe('0 ngày');
  expect(tenure('2026-11-05', '2026-10-28')).toBe('');
});

test('design index lists the profile drawer instead of the old staff dialogs', async ({ page }) => {
  await page.goto('/thiet-ke');
  await expect(page.getByRole('link', { name: 'Ngăn kéo Hồ sơ nhân sự · Hoàng Thị Mai' })).toHaveAttribute(
    'href',
    '/admin/nhan-su?nv=hoang-thi-mai'
  );
  for (const gone of ['Hộp Thêm nhân sự', 'Ngăn kéo Sửa hồ sơ', 'Nhân sự · Lọc chưa có ca']) {
    await expect(page.getByRole('link', { name: gone })).toHaveCount(0);
  }
});

test('rows are 42px tall in Gọn and 56px in the roomy density, avatar and toolbar keep their spec size', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  const heights = async () =>
    (await rows(page).first().evaluate(tr => [
      tr.getBoundingClientRect().height,
      ...Array.from(tr.children).map(c => c.getBoundingClientRect().height)
    ])) as number[];
  expect((await heights()).every(h => h === 42)).toBe(true);

  const av = rows(page).first().locator('.stav');
  await expect(av).toHaveCSS('width', '32px');
  await expect(av).toHaveCSS('height', '32px');
  await expect(av).toHaveCSS('font-size', '12px');
  await expect(page.locator('.stools')).toHaveCSS('padding-bottom', '16px');

  await page.addInitScript(() => localStorage.setItem('aicb.v2.ui', JSON.stringify({ density: '' })));
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  expect((await heights()).every(h => h === 56)).toBe(true);
});

test('departed rows are muted in every cell, the name and the pill text stay as the spec says', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(names(page)).toHaveCount(10);
  const gone = row(page, 'Đặng Văn Phúc');
  const muted = 'rgb(97, 97, 97)';
  await expect(gone.locator('th')).toHaveCSS('color', muted);
  await expect(gone.locator('td').nth(1)).toHaveCSS('color', muted);
  await expect(gone.locator('td').nth(2)).toHaveCSS('color', muted);
  await expect(gone.locator('.nn')).toHaveCSS('color', muted);
  await expect(row(page, 'Lê Hoàng Nam').locator('.nn')).toHaveCSS('color', 'rgb(33, 33, 33)');
  await expect(gone.locator('.stt')).toHaveCSS('color', 'rgb(33, 33, 33)');
});

test('a person hidden by the filter opens with both arrows disabled and focus kept inside', async ({ page }) => {
  await page.goto('/admin/nhan-su?q=nam&nv=hoang-thi-mai');
  await expect(names(page)).toHaveText(['Lê Hoàng Nam']);
  await expect(drawer(page, 'Hoàng Thị Mai')).toBeVisible();
  await expect(prevBtn(page)).toBeDisabled();
  await expect(nextBtn(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Đóng' })).toBeFocused();
});
