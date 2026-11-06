import { expect, test, type Page } from '@playwright/test';

// Trang in phiếu lương A4 (board PayslipA4Page1) với mọi trạng thái phiếu và hai đường mở nó (In phiếu của ngăn kéo, In tất cả
// của Bảng lương), trên dữ liệu giả: không page.route, không gọi /api. Tiền và ngày công là tháng mẫu chung (mock/payslip-a4.ts);
// tên, loại · bậc, hợp đồng và trạng thái nhân sự theo phiếu của mã trên đường dẫn (mock/payroll.ts).
// D11 (06/11): bản in không ghi trạng thái phiếu nào (nháp, chờ duyệt, đã duyệt, bị từ chối, đã trả).

const stubPrint = (page: Page) =>
  page.context().addInitScript(() => {
    (window as any).__prints = 0;
    window.print = () => { (window as any).__prints += 1; };
  });
const prints = (page: Page) => page.evaluate(() => (window as any).__prints as number);
const p1 = (page: Page) => page.getByRole('region', { name: 'Trang 1/2' });
const who = (page: Page, label: string) =>
  page.locator('.who > div').filter({ has: page.getByText(label, { exact: true }) }).locator('b');
const TITLE = 'Phiếu lương tháng 10/2026';
const SUB = 'Từ 01/10 đến 31/10/2026 · công chuẩn theo quy chế: 26 ngày';
const WHO_LABELS = ['Họ tên', 'Loại · bậc', 'Trạng thái nhân sự', 'Kỳ lương'];
// Chữ trạng thái phiếu không được xuất hiện ở đâu trên bản in (dòng ngày "Chờ giải trình" là cờ giải trình, không phải trạng thái).
const SLIP_STATUS = /bản nháp|\bnháp\b|chờ duyệt|đã duyệt|bị từ chối|đã trả/i;

function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

test.beforeEach(async ({ page }) => {
  await stubPrint(page);
});

for (const [status, id, name, level] of [
  ['done', 'GFT-0101', 'Nguyễn Thu Hà', 3],
  ['pending', 'GFT-0142', 'Lê Hoàng Nam', 2],
  ['draft', 'GFT-0123', 'Võ Đức Thịnh', 3],
  ['rejected', 'GFT-0156', 'Đỗ Mai Linh', 2]
] as const) {
  test(`D11: a ${status} slip prints no slip status: plain title and sub-line, no Tình trạng cell, no draft line`, async ({ page }) => {
    const calls = trackApi(page);
    await page.goto(`/in/phieu-luong/2026-10/${id}`);
    await expect(p1(page).getByRole('heading', { level: 1 })).toHaveText(TITLE);
    await expect(p1(page).locator('.sub')).toHaveText(SUB);
    await expect(p1(page).locator('.who .lb')).toHaveText(WHO_LABELS);
    await expect(who(page, 'Họ tên')).toHaveText(name);
    await expect(who(page, 'Loại · bậc')).toHaveText(`NV · Bậc ${level}`);
    await expect(who(page, 'Trạng thái nhân sự')).toHaveText('Chính thức');
    await expect(p1(page).locator('header')).not.toContainText(/chính thức|tạm tính/i);
    await expect(page.locator('.print-root')).not.toContainText(SLIP_STATUS);
    expect(await prints(page)).toBe(0);
    expect(calls).toEqual([]);
  });
}

test('the four header cells keep each value on one line', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-10/GFT-0123');
  await expect(page.locator('.who > div')).toHaveCount(4);
  const heights = await page.locator('.who > div b').evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().height)));
  expect(heights).toEqual([18, 18, 18, 18]);
});

test('every person prints the shared sample month: the money is not made up per slip', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-10/GFT-0142');
  await expect(page.getByRole('region', { name: 'Trang 2/2' }).locator('.net')).toHaveText(/Thực nhận\s*9\.657\.922 ₫/);
  await expect(p1(page).locator('.sh .lb')).toHaveText('Lương ngày 230.769 · số tiền tính bằng đồng');
});

// Trạng thái nhân sự và phép còn lại theo phiếu trên đường dẫn: GFT-0172 đang thử việc, không có tài khoản phép (null).
test('a probation slip with no leave account prints Thử việc and "—" for the remaining leave, never "null"', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-10/GFT-0172');
  await expect(who(page, 'Họ tên')).toHaveText('Lý Thanh Tâm');
  await expect(who(page, 'Trạng thái nhân sự')).toHaveText('Thử việc');
  const p2 = page.getByRole('region', { name: 'Trang 2/2' });
  await expect(p2.locator('.end')).toContainText(/Ngày phép năm còn lại\s*—/);
  await expect(page.locator('.print-root')).not.toContainText('null');
  await expect(p2.locator('.end')).not.toContainText('— ngày');
});

test('the print-all page renders exactly the approved slips, in table order', async ({ page }) => {
  const calls = trackApi(page);
  await page.goto('/in/phieu-luong/2026-10');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(2);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText([TITLE, TITLE]);
  await expect(who(page, 'Họ tên')).toHaveText(['Nguyễn Thu Hà', 'Trần Minh Quân']);
  await expect(page.locator('.who .lb')).toHaveText([...WHO_LABELS, ...WHO_LABELS]);
  await expect(page.locator('.print-root')).not.toContainText(SLIP_STATUS);
  expect(await prints(page)).toBe(0);
  expect(calls).toEqual([]);
});

test('?in=1 opens the print dialog once, for one slip and for all', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-10/GFT-0142?in=1');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => prints(page)).toBe(1);
  await page.goto('/in/phieu-luong/2026-10?in=1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(2);
  await expect.poll(() => prints(page)).toBe(1);
  await page.waitForTimeout(300);
  expect(await prints(page)).toBe(1);
});

test('print-all for a month without mock data shows the load error', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-11');
  await expect(page.getByText('Không tải được phiếu lương.')).toBeVisible();
  await expect(page.locator('.pl-a4')).toHaveCount(0);
});

test('In phiếu in the drawer opens that person’s A4 and prints it once', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/bang-luong?thang=2026-10&phieu=GFT-0142');
  const d = page.getByRole('dialog', { name: 'Phiếu lương của Lê Hoàng Nam' });
  const [tab] = await Promise.all([page.context().waitForEvent('page'), d.getByRole('button', { name: 'In phiếu' }).click()]);
  await expect(tab).toHaveURL('/in/phieu-luong/2026-10/GFT-0142?in=1');
  await expect(tab.getByRole('heading', { level: 1 })).toHaveText(TITLE);
  await expect(who(tab, 'Họ tên')).toHaveText('Lê Hoàng Nam');
  await expect(tab.locator('.print-root')).not.toContainText(SLIP_STATUS);
  await expect.poll(() => prints(tab)).toBe(1);
});

test('In tất cả opens the approved slips and prints them once', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/bang-luong?thang=2026-10');
  const [tab] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('button', { name: 'In tất cả' }).click()]);
  await expect(tab).toHaveURL('/in/phieu-luong/2026-10?in=1');
  await expect(who(tab, 'Họ tên')).toHaveText(['Nguyễn Thu Hà', 'Trần Minh Quân']);
  await expect.poll(() => prints(tab)).toBe(1);
});

test('the design index opens the two A4 entries on real mock slips', async ({ page }) => {
  const { default: entries } = await import('../src/design-index/payslip');
  const a4 = entries.filter(e => e.to.startsWith('/in/phieu-luong/'));
  expect(a4.map(e => [e.title, e.to])).toEqual([
    ['Bản in A4 · tháng 10 chính thức', '/in/phieu-luong/2026-10/GFT-0101'],
    ['Bản in A4 · tháng 10 bản nháp', '/in/phieu-luong/2026-10/GFT-0123']
  ]);
  for (const e of a4) {
    await page.goto(e.to);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
    await expect(page.locator('.print-root')).not.toContainText(SLIP_STATUS);
  }
});
