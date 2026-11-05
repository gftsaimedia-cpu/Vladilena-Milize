// Bản in phiếu lương A4 (board P1, P2 của Đợt 8) trên dữ liệu giả: không page.route, không gọi /api.
import { expect, test, type Page } from '@playwright/test';

const SLIP = '/in/phieu-luong/2026-10/demo_a_broken';
const sheetPage = (page: Page, n: 1 | 2) => page.getByRole('region', { name: `Trang ${n}/2` });

// Bộ ghi request /api, lỗi chạy và console.error của trang hiện tại; test đầu khẳng định nó rỗng.
let calls: string[] = [];
test.beforeEach(async ({ page }) => {
  calls = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  page.on('pageerror', err => calls.push(`pageerror: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') calls.push(`console.error: ${msg.text()}`);
  });
});

test('the A4 slip comes from mock data: two sheets, no /api call', async ({ page }) => {
  await page.goto(SLIP);
  await expect(sheetPage(page, 1)).toBeVisible();
  await expect(sheetPage(page, 2)).toBeVisible();
  await expect(page.locator('.pl-a4')).toHaveCount(2);
  expect(calls).toEqual([]);
});

test('page 1 header follows P1, for any username and ?ten=', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-10/nhanvien?ten=Nguy%E1%BB%85n%20Thu%20H%C3%A0');
  const p1 = sheetPage(page, 1);
  await expect(p1.getByRole('img', { name: 'GFT' })).toBeVisible();
  await expect(p1.getByRole('heading', { level: 1 })).toHaveText('Phiếu lương tháng 10/2026');
  await expect(p1.locator('.sub')).toHaveText('Từ 01/10 đến 31/10/2026 · tạm tính cả tháng, số liệu tới 02/11 · công chuẩn theo quy chế: 26 ngày');
  await expect(p1.locator('.who > div')).toHaveText([
    /Họ tên\s*NV thử nghiệm/, /Loại · bậc\s*NV · Bậc 1/, /Tình trạng\s*HĐLĐ từ 3 tháng/, /Kỳ lương\s*Tháng 10\/2026/
  ]);
  await expect(p1.getByRole('heading', { level: 2 })).toHaveText('Chấm công tháng 10/2026');
  await expect(p1.locator('.sh .lb')).toHaveText('Lương ngày 230.769 · số tiền tính bằng đồng');
});

test('page 2 running head follows P2', async ({ page }) => {
  await page.goto(SLIP);
  const p2 = sheetPage(page, 2);
  await expect(p2.locator('.rh b')).toHaveText('Phiếu lương tháng 10/2026 · NV thử nghiệm');
  await expect(p2.locator('.rh .lb')).toHaveText('NV · Bậc 1 · HĐLĐ từ 3 tháng · từ 01/10 đến 31/10/2026');
  await expect(p2.getByRole('heading', { level: 2 })).toHaveText('Tổng hợp lương');
  await expect(p2.locator('.sh .lb')).toHaveText('Số tiền tính bằng đồng');
});

test('each sheet ends with the slogan and its page number', async ({ page }) => {
  await page.goto(SLIP);
  for (const n of [1, 2] as const) {
    const ft = sheetPage(page, n).locator('footer.ft');
    await expect(ft).toContainText(`Trang ${n}/2`);
    await expect(ft.getByRole('img', { name: 'Trao trọn niềm tin, gửi trọn giải pháp.' })).toBeVisible();
  }
});

test('another month shows the load error', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-11/demo_a_broken');
  await expect(page.getByText('Không tải được phiếu lương.')).toBeVisible();
  await expect(page.locator('.pl-a4')).toHaveCount(0);
});

const att = (page: Page) => sheetPage(page, 1).getByRole('table', { name: 'Chấm công tháng 10/2026' });
const dayRow = (page: Page, dm: string) =>
  att(page).locator('tbody tr').filter({ has: page.locator('td:first-child', { hasText: dm }) });

test('page 1 prints one row per day that needs one', async ({ page }) => {
  await page.goto(SLIP);
  await expect(att(page).locator('tbody tr')).toHaveCount(29);
  await expect(dayRow(page, '04/10')).toHaveCount(0);
  await expect(dayRow(page, '18/10')).toHaveCount(0);
  await expect(dayRow(page, '11/10').getByRole('cell').nth(1)).toHaveText('Chủ nhật');
  await expect(dayRow(page, '25/10').getByRole('cell').nth(1)).toHaveText('Chủ nhật');
  await expect(att(page).locator('tbody tr.off')).toHaveCount(8);
  for (const [mark, n] of [['work', 21], ['paid', 4], ['unpaid', 2], ['absent', 1], ['pending', 1]] as const)
    await expect(att(page).locator(`tbody .dot.m-${mark}`)).toHaveCount(n);
});

test('page 1 keeps OT, make-up and notes in their own columns', async ({ page }) => {
  await page.goto(SLIP);
  await expect(att(page).locator('thead th')).toHaveText([
    'Ngày', 'Loại ngày', 'Vào – ra', 'Giờ', 'OT', 'Làm bù', 'Ghi chú', 'Cộng / trừ', 'Thành tiền'
  ]);
  const cells = (dm: string) => dayRow(page, dm).getByRole('cell');
  await expect(cells('09/10')).toHaveText([/T6\s*09\/10/, 'Normal', '08:00–22:00', '8', '4', '', '', '+173.077', '403.846']);
  await expect(cells('22/10')).toHaveText([/T5\s*22\/10/, 'Normal', '08:00–22:00', '8', '', '4', '', '', '230.769']);
  await expect(cells('26/10')).toHaveText([/T2\s*26\/10/, 'Normal', '08:40–17:00', '7,33', '', '', 'Muộn 40 phút', '−14.423', '216.346']);
  await expect(cells('28/10')).toHaveText([/T4\s*28\/10/, 'Chờ giải trình', '08:20–17:00', '7,67', '', '', 'Muộn 20 phút', '', '0']);
  await expect(cells('05/10')).toHaveText([/T2\s*05\/10/, 'Phép năm', '', '', '', '', '', '', '230.769']);
  await expect(cells('11/10')).toHaveText([/CN\s*11\/10/, 'Chủ nhật', '08:00–12:00', '', '4', '', '', '+230.769', '230.769']);
  await expect(cells('20/10')).toHaveText([/T3\s*20\/10/, 'Nghỉ có làm bù', '', '', '', '', 'Bù 22/10, 25/10', '', '230.769']);
  const heights = await att(page).locator('tbody tr').evaluateAll(rows => rows.map(r => r.getBoundingClientRect().height));
  expect(Math.max(...heights)).toBeLessThanOrEqual(22);
});

test('day marks and off rows use the GFT colours', async ({ page }) => {
  await page.goto(SLIP);
  const look = (sel: string) =>
    sheetPage(page, 1).locator(sel).first().evaluate(e => {
      const c = getComputedStyle(e);
      return [c.backgroundColor, c.borderTopWidth, c.borderTopColor];
    });
  expect((await look('.lg .dot.m-work'))[0]).toBe('rgb(28, 28, 28)');
  expect((await look('.lg .dot.m-paid'))[0]).toBe('rgb(47, 90, 168)');
  expect((await look('.lg .dot.m-absent'))[0]).toBe('rgb(180, 63, 63)');
  expect(await look('.lg .dot.m-unpaid')).toEqual(['rgba(0, 0, 0, 0)', '2px', 'rgb(47, 90, 168)']);
  expect(await look('.lg .dot.m-pending')).toEqual(['rgba(0, 0, 0, 0)', '2px', 'rgb(235, 151, 61)']);
  expect((await look('tbody tr.off td'))[0]).toBe('rgb(245, 245, 245)');
});

test('page 1 ends with the summary strip and the legend, and has no money total', async ({ page }) => {
  await page.goto(SLIP);
  const p1 = sheetPage(page, 1);
  await expect(p1.locator('.sts > div')).toHaveText([
    /Ngày công\s*19 ngày/, /Ca Flex · Night\s*3 · 3 ca/, /Nghỉ có lương\s*3 ngày/, /iSAT\s*1 ngày/,
    /Không lương, BHXH\s*2 ngày/, /Vắng\s*1 ngày/, /Chờ giải trình\s*1 ngày/, /OT\s*10 giờ/,
    /Làm bù\s*8 giờ/, /Trừ giờ đi muộn\s*0,5 giờ/
  ]);
  await expect(p1.locator('.lg .keys > span')).toHaveText(['Đi làm', 'Nghỉ có lương', 'Nghỉ không lương', 'Vắng', 'Chờ giải trình']);
  for (const m of ['work', 'paid', 'unpaid', 'absent', 'pending']) await expect(p1.locator(`.lg .dot.m-${m}`)).toHaveCount(1);
  await expect(p1.locator('.lg p')).toHaveText(
    'Giờ, OT, Làm bù tính bằng giờ. OT ngày thường ×1,5, thứ 7 và Chủ nhật ×2, ngày lễ ×3. Làm bù là giờ làm để bù cho ngày đã nghỉ, không phải OT.'
  );
  await expect(p1).not.toContainText('Tổng thu nhập');
  await expect(p1).not.toContainText('Thực nhận');
});

test('prints as two A4 sheets that do not overflow, with no text under 12px', async ({ page }) => {
  await page.goto(SLIP);
  await expect(sheetPage(page, 1).locator('.lg')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const sheets = page.locator('.pl-a4');
  await expect(sheets).toHaveCount(2);
  expect(await sheets.evaluateAll(ss => ss.map(s => s.scrollHeight <= s.clientHeight))).toEqual([true, true]);
  const small = await sheets.evaluateAll(ss =>
    ss.flatMap(s =>
      [...s.querySelectorAll('*')]
        .filter(e => [...e.childNodes].some(n => n.nodeType === 3 && (n.textContent || '').trim()))
        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 12)
        .map(e => (e.textContent || '').trim())
    )
  );
  expect(small).toEqual([]);
  const gap = await sheetPage(page, 1).evaluate(
    s => s.querySelector('footer.ft')!.getBoundingClientRect().top - s.querySelector('.lg')!.getBoundingClientRect().bottom
  );
  expect(gap).toBeGreaterThanOrEqual(42);
});
