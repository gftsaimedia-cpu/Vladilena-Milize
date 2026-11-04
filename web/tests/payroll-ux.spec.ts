import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { PayrollLine } from '../src/mock/payroll';
import { payrollCsv } from '../src/views/admin/payroll/payrollCsv';

// Bảng lương và phiếu lương chạy trên dữ liệu giả (mock/payroll.ts): không page.route, không gọi /api.
// Trạng thái giả nằm trong bộ nhớ trang: sau lần goto đầu, đi tiếp bằng liên kết trong app.
const URL10 = '/admin/bang-luong?thang=2026-10';
const table = (page: Page) => page.getByRole('region', { name: 'Bảng lương tháng 10, cuộn ngang để xem các khoản' });
const rows = (page: Page) => table(page).locator('tbody tr');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });
const filters = (page: Page) => page.getByRole('group', { name: 'Lọc theo trạng thái' });
const tiles = (page: Page) => page.getByRole('region', { name: 'Chỉ số kỳ lương' });
const tile = (page: Page, name: string) => tiles(page).getByRole('article', { name, exact: true });

function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('October payroll shows the board figures', async ({ page }) => {
  const calls = trackApi(page);
  await page.goto(URL10);
  await expect(page.getByRole('heading', { name: 'Bảng lương', exact: true })).toBeVisible();
  await expect(page.getByText('Kỳ lương tháng 10/2026 · công 01–31/10 · công chuẩn 26 ngày · trả lương 05/11/2026')).toBeVisible();
  await expect(page.locator('.period .steps .step')).toHaveCount(6);
  await expect(tile(page, 'Tổng thu nhập tháng 10')).toContainText('2,48');
  await expect(tile(page, 'Tổng thu nhập tháng 10')).toContainText('▲ 3,2% so với tháng 9');
  await expect(tile(page, 'Thực nhận')).toContainText('2,11');
  await expect(tile(page, 'Thực nhận')).toContainText('85% tổng thu nhập');
  await expect(tile(page, 'Khấu trừ')).toContainText('0,37');
  await expect(tile(page, 'Khấu trừ')).toContainText('Bảo hiểm 0,26 · Thuế 0,09 · Tạm ứng 0,02');
  await expect(tile(page, 'Phiếu đã duyệt')).toContainText('86 / 128');
  for (const name of ['Tất cả 128', 'Nháp 12', 'Chờ duyệt 29', 'Đã duyệt 86', 'Từ chối 1'])
    await expect(filters(page).getByRole('button', { name, exact: true })).toBeVisible();
  await expect(rows(page)).toHaveCount(10);
  // Mật độ mặc định là Gọn: dòng 42px, cả ô tên (th) lẫn ô số (td).
  expect((await rows(page).first().boundingBox())?.height).toBe(42);
  // Năm nút lọc trạng thái cùng một hàng ở 1440px.
  const tops = await filters(page).getByRole('button').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  expect(tops).toHaveLength(5);
  expect(new Set(tops).size).toBe(1);
  await expect(row(page, 'Lê Hoàng Nam')).toContainText('24 / 26');
  await expect(row(page, 'Lê Hoàng Nam')).toContainText('14.278.183');
  await expect(row(page, 'Đỗ Mai Linh')).toContainText('−125.000');
  await expect(row(page, 'Bùi Quốc Huy').locator('[title="Thiếu điểm Tự đánh giá, tính 0"]')).toContainText('1.481.200');
  await expect(table(page).locator('tfoot')).toContainText('Tổng 10 phiếu đang hiện');
  await expect(table(page).locator('tfoot')).toContainText('171.959.432');
  await expect(page.getByText('Thiếu điểm KPI, cột thiếu tính 0 điểm')).toBeVisible();
  await expect(page.getByText('Hiển thị 10 trong 128 phiếu')).toBeVisible();
  expect(calls).toEqual([]);
});

test('status filter, department and accent-free search', async ({ page }) => {
  await page.goto(URL10);
  await filters(page).getByRole('button', { name: /^Chờ duyệt/ }).click();
  await expect(filters(page).getByRole('button', { name: /^Chờ duyệt/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(4);
  for (const [i, name] of ['Lê Hoàng Nam', 'Phạm Ngọc Anh', 'Trịnh Văn Long', 'Ngô Gia Bảo'].entries())
    await expect(rows(page).nth(i)).toContainText(name);
  await expect(page.getByText('Hiển thị 4 trong 29 phiếu')).toBeVisible();
  await filters(page).getByRole('button', { name: /^Tất cả/ }).click();
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Sản xuất' });
  await expect(rows(page)).toHaveCount(4);
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Tất cả' });
  const search = page.getByLabel('Tìm theo tên', { exact: true });
  await search.fill('hoang nam');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Lê Hoàng Nam');
  await search.fill('xyz');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText('Không có phiếu nào khớp.')).toBeVisible();
  await expect(table(page).locator('tfoot')).toHaveCount(0);
});

test('filters stack and search folds đ and spaces', async ({ page }) => {
  await page.goto(URL10);
  await filters(page).getByRole('button', { name: /^Chờ duyệt/ }).click();
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Sản xuất' });
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText('Trịnh Văn Long');
  await expect(rows(page).nth(1)).toContainText('Ngô Gia Bảo');
  await expect(page.getByText('Hiển thị 2 trong 29 phiếu')).toBeVisible();
  await filters(page).getByRole('button', { name: /^Tất cả/ }).click();
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Tất cả' });
  await page.getByLabel('Tìm theo tên', { exact: true }).fill('  do mai ');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Đỗ Mai Linh');
});

test('one gold tile, and kem ground with the light sidebar', async ({ page }) => {
  await page.goto(URL10);
  await expect(rows(page)).toHaveCount(10);
  const golds = await page.locator('main').evaluate(root =>
    [...root.querySelectorAll('*')].filter(el => getComputedStyle(el).backgroundColor === 'rgb(232, 195, 114)').length
  );
  expect(golds).toBe(1);
  await page.getByRole('button', { name: /Quản trị viên/ }).click();
  await page.locator('.pop .mr', { hasText: 'Màu nền' }).getByRole('button', { name: 'Kem' }).click();
  await page.locator('.pop .mr', { hasText: 'Thanh bên' }).getByRole('button', { name: 'Sáng' }).click();
  await page.keyboard.press('Escape');
  await expect(rows(page)).toHaveCount(10);
  await expect(table(page).locator('td.ded').first()).toHaveCSS('background-color', 'rgb(251, 248, 241)');
});

test('other months show the mockup notice', async ({ page }) => {
  await page.goto('/admin/bang-luong?thang=2026-09');
  await expect(page.getByRole('heading', { name: 'Bảng lương', exact: true })).toBeVisible();
  await expect(page.locator('.period .state')).toContainText('Đã trả lương');
  await expect(page.getByText('Bản mockup chỉ có bảng lương tháng 10/2026.')).toBeVisible();
  await expect(tiles(page)).toHaveCount(0);
  await expect(table(page)).toHaveCount(0);
});

test('frozen columns stay put and mouse drag scrolls without opening a slip', async ({ page }) => {
  await page.goto(URL10);
  const box = (await table(page).boundingBox())!;
  // Ba ô đứng yên phải nằm trong hộp cuộn ở cả hai đầu: ở scrollLeft = 0 Thực nhận và Trạng thái vốn nằm ngoài hộp,
  // nên chỉ position: sticky mới đưa chúng vào; ở cuối thì cột trái là phần bị đẩy ra nếu không đứng yên.
  const frozen = ['th.who', 'td.net', 'td.st'];
  for (const at of ['start', 'end']) {
    await table(page).evaluate((el, end) => (el.scrollLeft = end ? el.scrollWidth : 0), at === 'end');
    for (const sel of frozen) {
      const b = (await rows(page).first().locator(sel).boundingBox())!;
      expect(b.x, `${sel} at ${at}`).toBeGreaterThanOrEqual(box.x - 1);
      expect(b.x + b.width, `${sel} at ${at}`).toBeLessThanOrEqual(box.x + box.width + 1);
    }
  }
  await table(page).evaluate(el => (el.scrollLeft = 0));
  // Chữ nhóm dính trái cách mép cột nhân viên 14px (296 + 14 ở màn rộng).
  await expect(table(page).locator('thead .gh > span').first()).toHaveCSS('left', '310px');
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 300, box.y + 120, { steps: 10 });
  await page.mouse.up();
  expect(await table(page).evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  // Chromium chuyển cú bấm sau khi kéo (đã bắt con trỏ) về chính hộp cuộn, nên liên kết không nhận nó dù có nuốt hay không;
  // đếm cú bấm tới hộp ở pha nổi bọt: kéo thì 0 (bị nuốt), bấm thường thì 1.
  await table(page).evaluate(el => {
    (window as any).__clicks = 0;
    el.addEventListener('click', () => (window as any).__clicks++);
  });
  const clicks = () => page.evaluate(() => (window as any).__clicks as number);
  const name = (await table(page).getByRole('link', { name: 'Lê Hoàng Nam', exact: true }).boundingBox())!;
  await page.mouse.move(name.x + name.width / 2, name.y + name.height / 2);
  await page.mouse.down();
  await page.mouse.move(name.x + name.width / 2 + 200, name.y + name.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page).not.toHaveURL(/phieu=/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await clicks()).toBe(0);
  await table(page).locator('thead th.who').click();
  expect(await clicks()).toBe(1);
});

test('a press released outside the table does not start a drag later', async ({ page }) => {
  await page.goto(URL10);
  const box = (await table(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 2, box.y + 120);
  await page.mouse.move(box.x + box.width / 2, box.y - 40);
  await page.mouse.up();
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.move(box.x + box.width / 2 - 200, box.y + 120, { steps: 10 });
  expect(await table(page).evaluate(el => el.scrollLeft)).toBe(0);
});

test('export downloads the shown rows, or only the selected ones', async ({ page }) => {
  await page.goto(URL10);
  const read = async (name: string) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()]);
    expect(dl.suggestedFilename()).toBe('bang-luong-2026-10.csv');
    const text = readFileSync(await dl.path(), 'utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    return text.slice(1).split('\r\n').filter(Boolean);
  };
  const all = await read('Xuất bảng lương ra Excel');
  expect(all[0]).toBe('Mã;Họ tên;Phòng ban;Chức danh;Ngày công;Tiền ngày công;Lương KPI;Phụ cấp;Làm thêm;Trừ giờ;Tổng thu nhập;Bảo hiểm;Thuế TNCN;Tạm ứng;Thực nhận;Trạng thái');
  expect(all).toHaveLength(11);
  expect(all).toContain('GFT-0142;Lê Hoàng Nam;Kinh doanh;Nhân viên kinh doanh;24;11999999;1322800;2215384;0;0;15538183;1260000;0;0;14278183;Chờ duyệt');
  await page.getByLabel('Chọn phiếu của Lê Hoàng Nam').check();
  await page.getByLabel('Chọn phiếu của Đỗ Mai Linh').check();
  const two = await read('Xuất 2 phiếu đã chọn ra Excel');
  expect(two).toHaveLength(3);
  expect(two[2]).toBe('GFT-0156;Đỗ Mai Linh;Marketing;Thiết kế đồ hoạ;22;12000000;1443200;1692308;0;-125000;15010508;1365000;0;0;13645508;Từ chối');
});

test('payroll fits 375px and the table scrolls in its own region', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(URL10);
  await expect(rows(page)).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 375)).toBeTruthy();
  expect(await table(page).evaluate(el => el.scrollWidth > el.clientWidth)).toBeTruthy();
  const who = (await rows(page).first().locator('th.who').boundingBox())!;
  expect(Math.round(who.width)).toBe(184);
  await expect(table(page).locator('thead .gh > span').first()).toHaveCSS('left', '198px');
});

test('csv quotes cells holding ; " or a line break', () => {
  const line = {
    id: 'GFT-9',
    name: 'A;B',
    dept: 'Có "ngoặc"',
    title: 'Dòng 1\nDòng 2',
    days: 1,
    workPay: 0,
    kpiPay: 0,
    allowance: 0,
    ot: 0,
    lateCut: 0,
    gross: 0,
    insurance: 0,
    tax: 0,
    advance: 0,
    net: 0,
    status: 'draft'
  } as unknown as PayrollLine;
  expect(payrollCsv([line]).split('\r\n')[1]).toBe('GFT-9;"A;B";"Có ""ngoặc""";"Dòng 1\nDòng 2";1;0;0;0;0;0;0;0;0;0;0;Nháp');
});

// Phiếu lương (board H): ngăn kéo nổi mở bằng ?phieu=<mã nhân viên>.
const slip = (page: Page, name: string) => page.getByRole('dialog', { name: `Phiếu lương của ${name}` });
const line = (dialog: ReturnType<typeof slip>, label: RegExp) => dialog.getByRole('row', { name: label });
const openSlip = (page: Page, name: string) => table(page).getByRole('link', { name, exact: true }).click();

test('clicking a name opens that payslip', async ({ page }) => {
  await page.goto(URL10);
  await openSlip(page, 'Lê Hoàng Nam');
  await expect(page).toHaveURL(/phieu=GFT-0142/);
  const d = slip(page, 'Lê Hoàng Nam');
  await expect(d).toContainText('Phiếu lương tháng 10/2026');
  await expect(d).toContainText('Kinh doanh · Nhân viên kinh doanh · GFT-0142');
  await expect(d).toContainText('NV · Bậc 2');
  await expect(d).toContainText('HĐLĐ từ 3 tháng');
  await expect(d.getByRole('img', { name: 'Chấm công tháng 10: 24 ngày công, 1 phép, 1 iSAT, 1 chờ giải trình, 0 không lương' })).toBeVisible();
  await expect(d.getByRole('link', { name: /Xem từng ngày/ })).toHaveAttribute('href', '/admin/cham-cong?thang=2026-10');
  await expect(line(d, /^Chờ giải trình/)).toContainText('27/10 · tạm tính 0 đ tới khi duyệt');
  await expect(line(d, /^Tổng điểm KPI/)).toContainText('66,14%');
  await expect(line(d, /^Lương KPI \(đề xuất/)).toContainText('2.000.000');
  await expect(line(d, /^Lương KPI \(đề xuất/)).toContainText('1.322.800');
  await expect(line(d, /^Giờ và tiền bị trừ/)).toContainText('Đi muộn 12 phút, không quá 15 phút nên không trừ');
  await expect(line(d, /^Thuế TNCN/)).toContainText('Lũy tiến · 0 người phụ thuộc');
  await expect(line(d, /^Thực nhận/)).toContainText('14.278.183 ₫');
  await expect(d).toContainText('11 ngày');
  await expect(row(page, 'Lê Hoàng Nam').locator('th.who')).toHaveCSS('background-color', 'rgb(255, 249, 236)');
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  await expect(page).toHaveURL(URL10);
});

test('previous and next walk the rows shown when the slip opened', async ({ page }) => {
  await page.goto(URL10);
  await openSlip(page, 'Lê Hoàng Nam');
  await slip(page, 'Lê Hoàng Nam').getByRole('button', { name: 'Phiếu sau' }).click();
  await expect(page).toHaveURL(/phieu=GFT-0117/);
  await slip(page, 'Phạm Ngọc Anh').getByRole('button', { name: 'Đóng' }).click();
  await openSlip(page, 'Nguyễn Thu Hà');
  await expect(slip(page, 'Nguyễn Thu Hà').getByRole('button', { name: 'Phiếu trước' })).toBeDisabled();
  await slip(page, 'Nguyễn Thu Hà').getByRole('button', { name: 'Đóng' }).click();
  await filters(page).getByRole('button', { name: /^Chờ duyệt/ }).click();
  await openSlip(page, 'Ngô Gia Bảo');
  await expect(slip(page, 'Ngô Gia Bảo').getByRole('button', { name: 'Phiếu sau' })).toBeDisabled();
  await slip(page, 'Ngô Gia Bảo').getByRole('button', { name: 'Phiếu trước' }).click();
  await expect(slip(page, 'Trịnh Văn Long')).toBeVisible();
});

test('floating drawer: rounded, no shadow, 540px; 16px margins at 375px', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  await expect(d).toHaveCSS('border-radius', '24px');
  await expect(d).toHaveCSS('box-shadow', 'none');
  expect(Math.round((await d.boundingBox())!.width)).toBe(540);
  await page.setViewportSize({ width: 375, height: 812 });
  const b = (await d.boundingBox())!;
  expect([Math.round(b.x), Math.round(b.width)]).toEqual([16, 343]);
});

test('a stale phieu link opens nothing and is dropped', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-9999`);
  await expect(rows(page)).toHaveCount(10);
  await expect(page).toHaveURL(URL10);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  await expect(page.getByText('Bản mockup chỉ có bảng lương tháng 10/2026.')).toBeVisible();
  await page.goto('/admin/bang-luong?thang=2026-09&phieu=GFT-0142');
  await expect(page.getByText('Bản mockup chỉ có bảng lương tháng 10/2026.')).toBeVisible();
  await expect(page).toHaveURL('/admin/bang-luong?thang=2026-09');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
