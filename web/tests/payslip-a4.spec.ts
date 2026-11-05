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
