import { expect, test, type Page } from '@playwright/test';

// Trang in phiếu lương A4 theo trạng thái phiếu (board PayslipA4Page1) và hai đường mở nó (In phiếu của ngăn kéo, In tất cả
// của Bảng lương), trên dữ liệu giả: không page.route, không gọi /api. Tiền và ngày công là tháng mẫu chung (mock/payslip-a4.ts);
// tên, loại · bậc, hợp đồng và trạng thái theo phiếu của mã trên đường dẫn (mock/payroll.ts).

const stubPrint = (page: Page) =>
  page.context().addInitScript(() => {
    (window as any).__prints = 0;
    window.print = () => { (window as any).__prints += 1; };
  });
const prints = (page: Page) => page.evaluate(() => (window as any).__prints as number);
const p1 = (page: Page) => page.getByRole('region', { name: 'Trang 1/2' });
const who = (page: Page, label: string) =>
  page.locator('.who > div').filter({ has: page.getByText(label, { exact: true }) }).locator('b');
const DRAFT_LINE = 'Bản nháp, chưa phải lương chính thức';
const SUB_DONE = 'Từ 01/10 đến 31/10/2026 · công chuẩn theo quy chế: 26 ngày';
const SUB_EST = 'Từ 01/10 đến 31/10/2026 · tạm tính cả tháng, số liệu tới 02/11 · công chuẩn theo quy chế: 26 ngày';

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

for (const [status, id, name, level, suffix, state] of [
  ['done', 'GFT-0101', 'Nguyễn Thu Hà', 3, 'chính thức', 'Đã duyệt'],
  ['pending', 'GFT-0142', 'Lê Hoàng Nam', 2, 'tạm tính', 'Chờ duyệt'],
  ['draft', 'GFT-0123', 'Võ Đức Thịnh', 3, 'tạm tính', 'Nháp'],
  ['rejected', 'GFT-0156', 'Đỗ Mai Linh', 2, 'tạm tính', 'Bị từ chối']
] as const) {
  test(`a ${status} slip prints "· ${suffix}", Tình trạng ${state}${status === 'draft' ? ' and the draft line' : ''}`, async ({ page }) => {
    const calls = trackApi(page);
    await page.goto(`/in/phieu-luong/2026-10/${id}`);
    await expect(p1(page).getByRole('heading', { level: 1 })).toHaveText(`Phiếu lương tháng 10/2026 · ${suffix}`);
    await expect(who(page, 'Họ tên')).toHaveText(name);
    await expect(who(page, 'Loại · bậc')).toHaveText(`NV · Bậc ${level}`);
    await expect(who(page, 'Tình trạng')).toHaveText(state);
    await expect(who(page, 'Trạng thái nhân sự')).toHaveText('HĐLĐ từ 3 tháng');
    await expect(p1(page).locator('.sub')).toHaveText(status === 'done' ? SUB_DONE : SUB_EST);
    await expect(page.getByText(DRAFT_LINE, { exact: true })).toHaveCount(status === 'draft' ? 1 : 0);
    expect(await prints(page)).toBe(0);
    expect(calls).toEqual([]);
  });
}

test('the draft line is bold text after an orange outlined dot, right under the sub-line, not a pill', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-10/GFT-0123');
  const line = page.getByText(DRAFT_LINE, { exact: true });
  await expect(line).toHaveCSS('font-weight', '600');
  await expect(line).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(line).toHaveCSS('border-top-width', '0px');
  const dot = line.locator('i');
  await expect(dot).toHaveCSS('border-top-color', 'rgb(235, 151, 61)');
  await expect(dot).toHaveCSS('border-top-width', '2px');
  await expect(dot).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const sub = (await p1(page).locator('.sub').boundingBox())!;
  const box = (await line.boundingBox())!;
  expect(box.x).toBeCloseTo(sub.x, 0);
  expect(box.y).toBeGreaterThan(sub.y + sub.height - 1);
  expect(box.y - (sub.y + sub.height)).toBeLessThan(16);
});

test('the five header cells keep each value on one line', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-10/GFT-0123');
  await expect(page.locator('.who > div')).toHaveCount(5);
  const heights = await page.locator('.who > div b').evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().height)));
  expect(heights).toEqual([18, 18, 18, 18, 18]);
});

test('every person prints the shared sample month: the money is not made up per slip', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-10/GFT-0142');
  await expect(page.getByRole('region', { name: 'Trang 2/2' }).locator('.net')).toHaveText(/Thực nhận\s*9\.657\.922 ₫/);
  await expect(p1(page).locator('.sh .lb')).toHaveText('Lương ngày 230.769 · số tiền tính bằng đồng');
});

test('the print-all page renders exactly the approved slips, in table order', async ({ page }) => {
  const calls = trackApi(page);
  await page.goto('/in/phieu-luong/2026-10');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(2);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(['Phiếu lương tháng 10/2026 · chính thức', 'Phiếu lương tháng 10/2026 · chính thức']);
  await expect(who(page, 'Họ tên')).toHaveText(['Nguyễn Thu Hà', 'Trần Minh Quân']);
  await expect(who(page, 'Tình trạng')).toHaveText(['Đã duyệt', 'Đã duyệt']);
  await expect(page.getByText(DRAFT_LINE)).toHaveCount(0);
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
  await expect(tab.getByRole('heading', { level: 1 })).toHaveText('Phiếu lương tháng 10/2026 · tạm tính');
  await expect(who(tab, 'Họ tên')).toHaveText('Lê Hoàng Nam');
  await expect(who(tab, 'Tình trạng')).toHaveText('Chờ duyệt');
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
  for (const [e, suffix] of [[a4[0], 'chính thức'], [a4[1], 'tạm tính']] as const) {
    await page.goto(e.to);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Phiếu lương tháng 10/2026 · ${suffix}`);
  }
  await expect(page.getByText(DRAFT_LINE, { exact: true })).toBeVisible();
});
