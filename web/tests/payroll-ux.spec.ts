import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
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
  // Chờ phông chữ tải xong rồi mới đo hàng nút lọc, kẻo chữ đổi bề rộng làm nút nhảy hàng.
  await page.evaluate(() => document.fonts.ready);
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
  const frozen = ['th.pt-who', 'td.net', 'td.st'];
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
  await table(page).locator('thead th.pt-who').click();
  expect(await clicks()).toBe(1);
});

// Nhãn nhóm nằm giữa nhóm cột của nó; khi mép trái nhóm trôi dưới cột nhân viên đứng yên, nhãn bị đẩy sang phải và vẫn đọc được.
const groupLabel = (page: Page, name: string) => table(page).locator('thead .gh > span', { hasText: name });
const subHeads = (page: Page) => table(page).locator('thead tr:nth-child(2) th');
async function centreOf(items: Locator[]) {
  const boxes = await Promise.all(items.map(i => i.boundingBox()));
  const left = Math.min(...boxes.map(b => b!.x));
  const right = Math.max(...boxes.map(b => b!.x + b!.width));
  return (left + right) / 2;
}

test('group labels sit centred over their columns', async ({ page }) => {
  await page.goto(URL10);
  await expect(rows(page)).toHaveCount(10);
  const heads = await subHeads(page).all();
  expect(heads).toHaveLength(9);
  // Ở 1440px hộp cuộn hẹp hơn bảng: Thu nhập nằm trọn ở đầu, Khấu trừ chỉ nằm trọn khi cuộn tới cuối.
  for (const [name, cols, end] of [
    ['Thu nhập', heads.slice(0, 6), false],
    ['Khấu trừ', heads.slice(6, 9), true],
  ] as const) {
    await table(page).evaluate((el, toEnd) => (el.scrollLeft = toEnd ? el.scrollWidth : 0), end);
    const b = (await groupLabel(page, name).boundingBox())!;
    expect(Math.abs(b.x + b.width / 2 - (await centreOf([...cols]))), name).toBeLessThanOrEqual(2);
  }
});

test('group label stays readable beside the frozen column when scrolled', async ({ page }) => {
  await page.goto(URL10);
  await expect(rows(page)).toHaveCount(10);
  await table(page).evaluate(el => (el.scrollLeft = 600));
  const box = (await table(page).boundingBox())!;
  const who = (await table(page).locator('thead th.pt-who').boundingBox())!;
  const b = (await groupLabel(page, 'Thu nhập').boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(who.x + who.width - 1);
  expect(b.x).toBeGreaterThanOrEqual(box.x);
  expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1);
});

test('group label stays inside the visible table at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(URL10);
  await expect(rows(page)).toHaveCount(10);
  const box = (await table(page).boundingBox())!;
  for (const at of [0, 100, 200]) {
    await table(page).evaluate((el, x) => (el.scrollLeft = x), at);
    const b = (await groupLabel(page, 'Thu nhập').boundingBox())!;
    expect(b.x, `left at ${at}`).toBeGreaterThanOrEqual(box.x);
    expect(b.x + b.width, `right at ${at}`).toBeLessThanOrEqual(box.x + box.width);
  }
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
  const who = (await rows(page).first().locator('th.pt-who').boundingBox())!;
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
  await expect(row(page, 'Lê Hoàng Nam').locator('th.pt-who')).toHaveCSS('background-color', 'rgb(255, 249, 236)');
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

test('payslip opens with focus on Đóng and Tab still reaches the arrows', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  await expect(d.getByRole('button', { name: 'Đóng' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(d.getByRole('button', { name: 'Phiếu sau' })).toBeFocused();
});

test('summary rows are 35px in both densities, groups 12px apart, labels inset 8px', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  const unpaid = line(d, /^Nghỉ không lương/);
  const heights = async () => [Math.round((await unpaid.boundingBox())!.height), Math.round((await line(d, /^Các khoản miễn thuế/).boundingBox())!.height)];
  expect(await heights()).toEqual([35, 35]);
  // Mật độ Rộng (không có data-density): luật chung 56px không được chạm vào bảng phiếu.
  await page.evaluate(() => delete document.documentElement.dataset.density);
  expect(await heights()).toEqual([35, 35]);
  const title = (name: RegExp) => d.getByRole('row', { name }).first().boundingBox();
  const first = (await title(/^Ngày công và lương cơ bản/))!;
  const second = (await title(/^Nghỉ phép và ngày lễ/))!;
  expect(Math.round(second.height - first.height)).toBe(12);
  await expect(unpaid.locator('th')).toHaveCSS('padding-left', '8px');
  await expect(d.getByRole('rowheader', { name: 'Nghỉ phép và ngày lễ' })).toHaveCSS('padding-left', '8px');
});

// SlipSummary gắn riêng (fixtures/slip-summary.html): nội dung Task 5 chưa có, nên thử bằng slot dấu.
const SUMMARY = '/tests/fixtures/slip-summary.html';
const kpiGroup = (page: Page) =>
  page.locator('tbody', { has: page.getByRole('rowheader', { name: 'Lương KPI', exact: true }) }).locator('tr');

test('KPI group order: score cells first, then total, flag, pay, then history', async ({ page }) => {
  await page.goto(`${SUMMARY}?slots=1&id=GFT-0063`);
  const texts = await kpiGroup(page).evaluateAll(trs => trs.map(tr => (tr.textContent ?? '').replace(/\s+/g, ' ').trim()));
  expect(texts).toHaveLength(6);
  expect(texts[0]).toBe('Lương KPI');
  expect(texts[1]).toBe('SLOT-KPI');
  expect(texts[2]).toMatch(/^Tổng điểm KPI/);
  expect(texts[3]).toMatch(/^Thiếu điểm Tự đánh giá/);
  expect(texts[4]).toMatch(/^Lương KPI \(đề xuất/);
  expect(texts[5]).toBe('SLOT-HISTORY');
});

test('KPI group renders no slot rows when the slots are empty', async ({ page }) => {
  await page.goto(`${SUMMARY}?id=GFT-0142`);
  await expect(kpiGroup(page)).toHaveCount(3);
  await expect(page.getByText('SLOT-KPI')).toHaveCount(0);
});

// Chấm điểm KPI trong phiếu (spec 4.4): gõ là tính lại, rời ô là lưu, lịch sử sửa điểm.
const score = (d: ReturnType<typeof slip>, part: string, name: string) => d.getByLabel(`Điểm ${part} của ${name}, phần trăm`);

test('payslip history lists the past score edits', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  const toggle = d.getByRole('button', { name: 'Lịch sử sửa điểm (3)' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const items = d.getByRole('list', { name: 'Lịch sử sửa điểm' }).getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText('27/10 · Quản lý trực tiếp 60 → 65');
  await expect(items.first()).toContainText('Trưởng phòng Kinh doanh');
});

test('typing a score recomputes KPI, tax and net at once', async ({ page }) => {
  await page.goto(URL10);
  await openSlip(page, 'Võ Đức Thịnh');
  const d = slip(page, 'Võ Đức Thịnh');
  await expect(d.getByText('Chưa sửa điểm lần nào')).toBeVisible();
  await score(d, 'Tự đánh giá', 'Võ Đức Thịnh').fill('100');
  await expect(line(d, /^Tổng điểm KPI/)).toContainText('84,52%');
  await expect(line(d, /^Lương KPI \(đề xuất/)).toContainText('3.380.800');
  await expect(line(d, /^Thuế TNCN/)).toContainText('134.809');
  await expect(line(d, /^Thực nhận/)).toContainText('24.261.376 ₫');
  await score(d, 'Tự đánh giá', 'Võ Đức Thịnh').press('Tab');
  await d.getByRole('button', { name: 'Lịch sử sửa điểm (1)' }).click();
  await expect(d.getByRole('list', { name: 'Lịch sử sửa điểm' })).toContainText('28/10 · Tự đánh giá 85 → 100');
  await d.getByRole('button', { name: 'Đóng' }).click();
  await expect(row(page, 'Võ Đức Thịnh')).toContainText('24.261.376');
});

test('a missing score counts as zero and is flagged', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0063`);
  const huy = slip(page, 'Bùi Quốc Huy');
  const self = score(huy, 'Tự đánh giá', 'Bùi Quốc Huy');
  await expect(self).toHaveCSS('border-top-color', 'rgb(235, 151, 61)');
  await expect(huy.getByText('Thiếu điểm Tự đánh giá')).toBeVisible();
  await self.fill('80');
  await expect(huy.getByText('Thiếu điểm Tự đánh giá')).toHaveCount(0);
  await expect(line(huy, /^Tổng điểm KPI/)).toContainText('78,86%');
  await expect(line(huy, /^Lương KPI \(đề xuất/)).toContainText('1.577.200');
  await self.press('Tab');
  await huy.getByRole('button', { name: 'Đóng' }).click();
  await expect(row(page, 'Bùi Quốc Huy').locator('[title^="Thiếu điểm"]')).toHaveCount(0);
  await openSlip(page, 'Lê Hoàng Nam');
  const nam = slip(page, 'Lê Hoàng Nam');
  await score(nam, 'Base Wework', 'Lê Hoàng Nam').fill('');
  await expect(nam.getByText('Thiếu điểm Base Wework')).toBeVisible();
  await expect(line(nam, /^Tổng điểm KPI/)).toContainText('41,34%');
  await expect(line(nam, /^Thực nhận/)).toContainText('13.782.183 ₫');
});

test('closing right after typing keeps the score', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0123`);
  await score(slip(page, 'Võ Đức Thịnh'), 'Tự đánh giá', 'Võ Đức Thịnh').fill('100');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row(page, 'Võ Đức Thịnh')).toContainText('24.261.376');
});

test('moving to the next slip right after typing keeps the score', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0123`);
  const d = slip(page, 'Võ Đức Thịnh');
  await score(d, 'Tự đánh giá', 'Võ Đức Thịnh').fill('100');
  await d.getByRole('button', { name: 'Phiếu sau' }).click();
  await expect(slip(page, 'Đỗ Mai Linh')).toBeVisible();
  await slip(page, 'Đỗ Mai Linh').getByRole('button', { name: 'Đóng' }).click();
  await expect(row(page, 'Võ Đức Thịnh')).toContainText('24.261.376');
});

test('score inputs drop junk and cap at 100', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  const self = score(d, 'Tự đánh giá', 'Lê Hoàng Nam');
  // Dấu thập phân cắt tại đó: "72,5" thành 72, không thành 725 rồi kẹp 100.
  for (const [typed, shown] of [['abc', ''], ['150', '100'], ['1a5', '15'], ['007', '7'], ['72,5', '72'], ['72.5', '72'], ['.5', '']]) {
    await self.fill(typed);
    await expect(self).toHaveValue(shown);
  }
  await self.fill('abc');
  await expect(d.getByText('Thiếu điểm Tự đánh giá')).toBeVisible();
});

test('typing a decimal key by key stops at the point instead of becoming 725', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  const self = score(d, 'Tự đánh giá', 'Lê Hoàng Nam');
  for (const typed of ['72,5', '72.5']) {
    await self.fill('');
    await self.pressSequentially(typed);
    await expect(self).toHaveValue('72');
    await expect(line(d, /^Tổng điểm KPI/)).toContainText('65,96%');
  }
  // Xoá một ký tự thì gõ tiếp được: "7" rồi "3" thành 73.
  await self.press('Backspace');
  await expect(self).toHaveValue('7');
  await self.pressSequentially('3');
  await expect(self).toHaveValue('73');
  await expect(line(d, /^Tổng điểm KPI/)).toContainText('66,02%');
  // Dán / điền cả chuỗi vẫn cắt tại dấu; gõ liền "725" không dấu vẫn kẹp 100.
  await self.fill('');
  await self.pressSequentially('725');
  await expect(self).toHaveValue('100');
});

test('score inputs are 56x32 rectangles with 8px corners and a 2px ink focus ring', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  const wework = score(d, 'Base Wework', 'Lê Hoàng Nam');
  await expect(wework).toHaveCSS('border-top-left-radius', '8px');
  const b = (await wework.boundingBox())!;
  expect([Math.round(b.width), Math.round(b.height)]).toEqual([56, 32]);
  await expect(d.getByText('Base Wework (40%)')).toBeVisible();
  await expect(d.getByText('Tự đánh giá (6%)')).toBeVisible();
  // Mọi ô nằm trong khung 8px của bảng phiếu.
  const edge = await d.evaluate(el => {
    const t = el.querySelector('.ss-t')!.getBoundingClientRect();
    return [...el.querySelectorAll('input')].map(i => i.getBoundingClientRect().left - t.left);
  });
  expect(edge).toHaveLength(5);
  expect(Math.min(...edge)).toBeGreaterThanOrEqual(8);
  await wework.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(wework).toBeFocused();
  await expect(wework).toHaveCSS('outline-width', '2px');
  await expect(wework).toHaveCSS('outline-color', 'rgb(33, 33, 33)');
});

test('disabling an arrow at a list end moves focus to the other arrow', async ({ page }) => {
  await page.goto(URL10);
  await openSlip(page, 'Trần Minh Quân');
  const quan = slip(page, 'Trần Minh Quân');
  await quan.getByRole('button', { name: 'Phiếu trước' }).click();
  const ha = slip(page, 'Nguyễn Thu Hà');
  await expect(ha.getByRole('button', { name: 'Phiếu trước' })).toBeDisabled();
  await expect(ha.getByRole('button', { name: 'Phiếu sau' })).toBeFocused();
  await ha.getByRole('button', { name: 'Đóng' }).click();
  await openSlip(page, 'Ngô Gia Bảo');
  await slip(page, 'Ngô Gia Bảo').getByRole('button', { name: 'Phiếu trước' }).click();
  await slip(page, 'Lý Thanh Tâm').getByRole('button', { name: 'Phiếu sau' }).click();
  const bao = slip(page, 'Ngô Gia Bảo');
  await expect(bao.getByRole('button', { name: 'Phiếu sau' })).toBeDisabled();
  await expect(bao.getByRole('button', { name: 'Phiếu trước' })).toBeFocused();
});

test('payslip on a 375px phone has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  await expect(score(d, 'Base Wework', 'Lê Hoàng Nam')).toBeVisible();
  expect(await d.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await expect(d.getByRole('button', { name: 'Đóng' })).toBeVisible();
  // Lưới ô điểm 3 cột: ô thứ tư xuống hàng hai.
  const tops = await d.locator('input').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops.slice(0, 3)).size).toBe(1);
  expect(tops[3]).toBeGreaterThan(tops[0]);
});

test('KPI group keeps 35px rows around the score cells', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  expect(Math.round((await line(d, /^Tổng điểm KPI/).boundingBox())!.height)).toBe(35);
  expect(Math.round((await line(d, /^Lương KPI \(đề xuất/).boundingBox())!.height)).toBe(35);
});

test('closing with a slow save still refreshes the board row', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0123`);
  // Độ trễ đặt trong trang (mock/respond.ts đọc __mockLatencyMs), không dùng page.route.
  await page.evaluate(() => ((window as unknown as { __mockLatencyMs: number }).__mockLatencyMs = 300));
  await score(slip(page, 'Võ Đức Thịnh'), 'Tự đánh giá', 'Võ Đức Thịnh').fill('100');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row(page, 'Võ Đức Thịnh')).toContainText('24.261.376');
});

test('blanking a score and closing puts the orange dot on that board row', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const nam = row(page, 'Lê Hoàng Nam');
  await expect(nam.locator('.kt')).toHaveCount(0);
  await score(slip(page, 'Lê Hoàng Nam'), 'Base Wework', 'Lê Hoàng Nam').fill('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(nam.locator('.kt')).toHaveCount(1);
  await expect(nam.getByText('Thiếu điểm Base Wework, tính 0')).toHaveCount(1);
});

test('the next slip shows its own stored scores after typing in the previous one', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const nam = slip(page, 'Lê Hoàng Nam');
  await score(nam, 'Tự đánh giá', 'Lê Hoàng Nam').fill('11');
  await nam.getByRole('button', { name: 'Phiếu sau' }).click();
  const anh = slip(page, 'Phạm Ngọc Anh');
  await expect(anh).toBeVisible();
  await expect(score(anh, 'Tự đánh giá', 'Phạm Ngọc Anh')).not.toHaveValue('11');
  await expect(score(anh, 'Tự đánh giá', 'Phạm Ngọc Anh')).not.toHaveValue('');
  await expect(line(anh, /^Tổng điểm KPI/)).toContainText('80,72%');
});

test('history starts closed on the next slip', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const nam = slip(page, 'Lê Hoàng Nam');
  await nam.getByRole('button', { name: 'Lịch sử sửa điểm (3)' }).click();
  await expect(nam.getByRole('list', { name: 'Lịch sử sửa điểm' })).toBeVisible();
  await nam.getByRole('button', { name: 'Phiếu sau' }).click();
  await expect(slip(page, 'Phạm Ngọc Anh')).toBeVisible();
  await slip(page, 'Phạm Ngọc Anh').getByRole('button', { name: 'Phiếu trước' }).click();
  await expect(slip(page, 'Lê Hoàng Nam').getByRole('button', { name: 'Lịch sử sửa điểm (3)' })).toHaveAttribute('aria-expanded', 'false');
});

const pushRoute = (page: Page, to: string) =>
  page.evaluate(t => {
    const app = (document.querySelector('#app') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => void } } } } }).__vue_app__;
    app.config.globalProperties.$router.push(t);
  }, to);

test('a typed score survives the slip changing or closing without the buttons', async ({ page }) => {
  await page.goto(URL10);
  await openSlip(page, 'Lê Hoàng Nam');
  await score(slip(page, 'Lê Hoàng Nam'), 'Tự đánh giá', 'Lê Hoàng Nam').fill('11');
  // Đường dẫn đổi sang phiếu khác ngoài nút Đóng và hai mũi tên (như sửa địa chỉ hay Back).
  await pushRoute(page, `${URL10}&phieu=GFT-0117`);
  await expect(slip(page, 'Phạm Ngọc Anh')).toBeVisible();
  await expect(row(page, 'Lê Hoàng Nam')).not.toContainText('14.278.183');
  // Ngăn kéo đóng vì đường dẫn bỏ ?phieu (Back về bảng): điểm đang gõ vẫn lưu.
  await score(slip(page, 'Phạm Ngọc Anh'), 'Tự đánh giá', 'Phạm Ngọc Anh').fill('50');
  await pushRoute(page, URL10);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row(page, 'Phạm Ngọc Anh')).not.toContainText('17.286.462');
});

test('approving and rejecting update the slip, table, tiles and overview', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const nam = slip(page, 'Lê Hoàng Nam');
  await nam.getByRole('button', { name: 'Duyệt phiếu' }).click();
  await expect(nam.getByText('Đã duyệt', { exact: true })).toBeVisible();
  await expect(nam.getByRole('status')).toHaveText('Đã duyệt phiếu lương của Lê Hoàng Nam.');
  await expect(nam.getByRole('button', { name: /^(Duyệt phiếu|Từ chối)$/ })).toHaveCount(0);
  await nam.getByRole('button', { name: 'Đóng' }).click();
  await expect(filters(page).getByRole('button', { name: 'Chờ duyệt 28', exact: true })).toBeVisible();
  await expect(filters(page).getByRole('button', { name: 'Đã duyệt 87', exact: true })).toBeVisible();
  await expect(tile(page, 'Phiếu đã duyệt')).toContainText('87 / 128');
  const nav = page.getByRole('navigation', { name: 'Điều hướng' });
  await nav.getByRole('link', { name: 'Tổng quan' }).click();
  await expect(page.getByRole('region', { name: 'Kỳ lương tháng 10' })).toContainText('87');
  await expect(page.getByRole('region', { name: 'Bảng lương tháng 10' }).locator('tbody tr', { hasText: 'Lê Hoàng Nam' })).toContainText('Đã duyệt');
  await nav.getByRole('link', { name: 'Bảng lương', exact: true }).click();
  await openSlip(page, 'Trịnh Văn Long');
  await slip(page, 'Trịnh Văn Long').getByRole('button', { name: 'Từ chối' }).click();
  await expect(slip(page, 'Trịnh Văn Long').getByRole('status')).toHaveText('Đã từ chối phiếu lương của Trịnh Văn Long.');
  await slip(page, 'Trịnh Văn Long').getByRole('button', { name: 'Đóng' }).click();
  await expect(filters(page).getByRole('button', { name: 'Từ chối 2', exact: true })).toBeVisible();
});

test('an already approved slip has no decision buttons', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0101`);
  const ha = slip(page, 'Nguyễn Thu Hà');
  await expect(ha.getByRole('status')).toHaveText('Đã duyệt phiếu lương của Nguyễn Thu Hà.');
  await expect(ha.getByRole('button', { name: 'Duyệt phiếu' })).toHaveCount(0);
  await expect(ha.getByRole('button', { name: 'Từ chối' })).toHaveCount(0);
});

test('print calls the browser dialog and prints only the slip', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__prints = 0;
    window.print = () => { (window as any).__prints += 1; };
  });
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  await d.getByRole('button', { name: 'In phiếu' }).click();
  expect(await page.evaluate(() => (window as any).__prints)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(table(page)).toBeHidden();
  await expect(d.getByRole('heading', { name: 'Tổng hợp lương' })).toBeVisible();
  await expect(d.getByRole('button', { name: 'In phiếu' })).toBeHidden();
  await expect(d.getByRole('button', { name: 'Duyệt phiếu' })).toBeHidden();
});

test('while a decision is in flight the buttons are disabled, then focus lands on the status line', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__mockLatencyMs = 1500;
  });
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const nam = slip(page, 'Lê Hoàng Nam');
  await nam.getByRole('button', { name: 'Duyệt phiếu' }).click();
  await expect(nam.getByRole('button', { name: 'Duyệt phiếu' })).toBeDisabled();
  await expect(nam.getByRole('button', { name: 'Từ chối' })).toBeDisabled();
  await expect(nam.getByRole('status')).toHaveText('Đã duyệt phiếu lương của Lê Hoàng Nam.');
  await expect(nam.getByRole('status')).toBeFocused();
});

const nameLink = (page: Page, name: string) => table(page).getByRole('link', { name, exact: true });

test('after approving in a filtered list, closing puts focus on the next pending row', async ({ page }) => {
  await page.goto(URL10);
  await filters(page).getByRole('button', { name: /^Chờ duyệt/ }).click();
  await nameLink(page, 'Lê Hoàng Nam').focus();
  await page.keyboard.press('Enter');
  const nam = slip(page, 'Lê Hoàng Nam');
  await nam.getByRole('button', { name: 'Duyệt phiếu' }).click();
  await expect(nam.getByRole('status')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(nam).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  await expect(nameLink(page, 'Phạm Ngọc Anh')).toBeFocused();
});

test('after approving the last pending row, closing puts focus on the previous row', async ({ page }) => {
  await page.goto(URL10);
  await filters(page).getByRole('button', { name: /^Chờ duyệt/ }).click();
  await nameLink(page, 'Ngô Gia Bảo').focus();
  await page.keyboard.press('Enter');
  const bao = slip(page, 'Ngô Gia Bảo');
  await bao.getByRole('button', { name: 'Duyệt phiếu' }).click();
  await expect(bao.getByRole('status')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(bao).toHaveCount(0);
  await expect(nameLink(page, 'Trịnh Văn Long')).toBeFocused();
});

test('closing after stepping to the next slip puts focus on that slip\u2019s name link', async ({ page }) => {
  await page.goto(URL10);
  await nameLink(page, 'Lê Hoàng Nam').focus();
  await page.keyboard.press('Enter');
  await slip(page, 'Lê Hoàng Nam').getByRole('button', { name: 'Phiếu sau' }).click();
  const anh = slip(page, 'Phạm Ngọc Anh');
  await expect(anh).toBeVisible();
  await anh.getByRole('button', { name: 'Đóng' }).click();
  await expect(anh).toHaveCount(0);
  await expect(nameLink(page, 'Phạm Ngọc Anh')).toBeFocused();
});

test('the table avatar is 32px at the default Gọn density, not shrunk by the global .who .av rule', async ({ page }) => {
  await page.goto(URL10);
  await expect(page.locator('html')).toHaveAttribute('data-density', 'gon');
  const av = rows(page).first().locator('[aria-hidden="true"]').filter({ hasText: /^[A-ZĐ]{1,2}$/ }).first();
  const b = (await av.boundingBox())!;
  expect([Math.round(b.width), Math.round(b.height)]).toEqual([32, 32]);
  await expect(av).toHaveCSS('font-size', '11px');
});

// Mọi ô tương tác mới của Bảng lương và phiếu lương dùng vòng tiêu điểm mực 2px (--text), không phải màu nhấn toàn cục.
async function expectInkRing(page: Page, target: Locator, ring: Locator = target) {
  await target.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(target).toBeFocused();
  await expect(ring).toHaveCSS('outline-color', 'rgb(33, 33, 33)');
  await expect(ring).toHaveCSS('outline-style', 'solid');
  await expect(ring).toHaveCSS('outline-width', '2px');
}

test('board controls show the 2px ink focus ring', async ({ page }) => {
  await page.goto(URL10);
  await expectInkRing(page, filters(page).getByRole('button', { name: /^Chờ duyệt/ }));
  await expectInkRing(page, page.getByLabel('Tìm theo tên', { exact: true }), page.locator('label.find'));
  await expectInkRing(page, page.getByLabel('Phòng ban'));
  await expectInkRing(page, page.getByRole('button', { name: /^Xuất/ }));
  await expectInkRing(page, page.getByRole('region', { name: 'Các bước kỳ lương' }));
  await expectInkRing(page, nameLink(page, 'Lê Hoàng Nam'));
  await expectInkRing(page, rows(page).first().getByRole('checkbox'));
});

test('payslip drawer controls show the 2px ink focus ring', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  await expectInkRing(page, d.getByRole('button', { name: 'In phiếu' }));
  await expectInkRing(page, d.getByRole('button', { name: 'Phiếu sau' }));
  await expectInkRing(page, d.getByRole('button', { name: 'Đóng' }));
  await expectInkRing(page, d.getByRole('link', { name: /Xem từng ngày/ }));
});

test('after a typed decimal point, selecting all and retyping replaces the value', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  const self = score(d, 'Tự đánh giá', 'Lê Hoàng Nam');
  await self.fill('');
  await self.pressSequentially('72,');
  await expect(self).toHaveValue('72');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('80');
  await expect(self).toHaveValue('80');
  // Con trỏ không ở cuối ô thì gõ cũng thoát khỏi trạng thái "đã qua dấu".
  await self.fill('');
  await self.pressSequentially('72,');
  await page.keyboard.press('Home');
  await page.keyboard.type('1');
  await expect(self).toHaveValue('100');
});
