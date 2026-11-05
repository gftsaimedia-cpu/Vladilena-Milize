// Cột 3 của trang nhân viên máy tính: Thu nhập (spec staff-desktop-one-page 4.3) và ba cột cao bằng nhau (3.1). Mock, không gọi /api.
import { expect, test } from '@playwright/test';
import { openDesktop } from './fixtures/staff-desktop';

const col3 = (page: import('@playwright/test').Page) => page.locator('.sd-col').nth(2);

test('column 3 makes no /api request and logs no error', async ({ page }) => {
  const calls = await openDesktop(page, '/nv/thu-nhap');
  await expect(col3(page).getByRole('heading', { level: 2, name: 'Thu nhập' })).toBeVisible();
  await expect(col3(page).locator('.ls .ro')).toHaveCount(6);
  expect(calls).toEqual([]);
});

test('column 3 shows net pay, KPI and the lines', async ({ page }) => {
  await openDesktop(page, '/nv/thu-nhap');
  const c = col3(page);
  await expect(c.getByRole('heading', { level: 2, name: 'Thu nhập' })).toBeVisible();
  await expect(c).toContainText('Tháng 10/2026 · tạm tính');
  await expect(c).not.toContainText('Phiếu chính thức có khi Admin duyệt');
  await expect(c.getByRole('button', { name: 'Tháng trước' })).toHaveCount(0);
  const net = c.getByRole('region', { name: 'Thực nhận tháng 10' });
  for (const t of ['14.278.183', 'Admin đang duyệt phiếu', '15.538.183', '1.260.000']) await expect(net).toContainText(t);
  await expect(c.getByRole('heading', { level: 3, name: 'KPI tháng 10' })).toBeVisible();
  await expect(c.getByRole('heading', { level: 3, name: 'Các khoản' })).toBeVisible();
  const kpi = c.getByRole('region', { name: 'KPI tháng 10' });
  for (const t of ['66,14%', '1.322.800', '2.000.000', 'Wework', 'Tự đánh giá']) await expect(kpi).toContainText(t);
  await expect(c.locator('.ls .ro')).toHaveCount(6);
  await expect(c.locator('.tot')).toHaveText(/Thực nhận\s*14\.278\.183 ₫/);
});

// Chờ nội dung của cả ba cột: 7 dòng Gần đây (cột 2), thẻ Các khoản (cột 3) và ô danh sách yêu cầu (cột 1).
async function waitForColumns(page: import('@playwright/test').Page) {
  await expect(page.locator('.sd-col')).toHaveCount(3);
  await expect(page.locator('.sd-col').nth(0).getByRole('tabpanel')).toBeVisible();
  await expect(page.locator('.sd-col').nth(1).locator('.ls button.ro')).toHaveCount(7);
  await expect(col3(page).locator('.ls .ro')).toHaveCount(6);
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 1136, height: 800 }
]) {
  test(`the three columns end at the same height at ${size.width}px`, async ({ page }) => {
    await openDesktop(page, '/nv/hom-nay', size);
    await waitForColumns(page);
    const bottoms = await page.locator('.sd-col').evaluateAll(cs => cs.map(c => c.getBoundingClientRect().bottom));
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(1);
  });

  // Các ô cột luôn chạm nhau vì lưới stretch; ở đây đo khối cuối thật sự kín đáy cột.
  test(`the last block of every column fills down to the column bottom at ${size.width}px`, async ({ page }) => {
    await openDesktop(page, '/nv/hom-nay', size);
    await waitForColumns(page);
    const lastCard = ['[role="tabpanel"]', '.sd-grow > .card', '.sd-grow > .card'];
    const gaps = await page.locator('.sd-col').evaluateAll(
      (cs, sels) =>
        cs.map((c, i) => {
          const col = c.getBoundingClientRect().bottom;
          const grow = c.lastElementChild!;
          const card = grow.querySelector(sels[i])!;
          return { grow: col - grow.getBoundingClientRect().bottom, card: col - card.getBoundingClientRect().bottom, isGrow: grow.classList.contains('sd-grow') };
        }),
      lastCard
    );
    for (const g of gaps) {
      expect(g.isGrow).toBe(true);
      expect(Math.abs(g.grow)).toBeLessThanOrEqual(1);
      expect(Math.abs(g.card)).toBeLessThanOrEqual(1);
    }
  });
}

test('no horizontal scroll at 1136px and 1280px', async ({ page }) => {
  for (const width of [1136, 1280]) {
    await openDesktop(page, '/nv/hom-nay', { width, height: 800 });
    await waitForColumns(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test('the Thực nhận row sits at the bottom of its card', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await expect(col3(page).locator('.tot')).toBeVisible();
  const gap = await col3(page)
    .locator('.tot')
    .evaluate(t => t.closest('.card')!.getBoundingClientRect().bottom - t.getBoundingClientRect().bottom);
  expect(gap).toBeLessThanOrEqual(8);
});

test('the Thực nhận row stays at the bottom when the columns are taller than their content', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await waitForColumns(page);
  await page.addStyleTag({ content: '.sd-pg { min-height: 1600px }' });
  const m = await col3(page).evaluate(c => {
    const card = c.querySelector('.sd-grow > .card')!;
    const tot = card.querySelector('.tot')!;
    return {
      col: c.getBoundingClientRect().height,
      card: c.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom,
      tot: card.getBoundingClientRect().bottom - tot.getBoundingClientRect().bottom
    };
  });
  expect(m.col).toBeGreaterThanOrEqual(1500);
  expect(Math.abs(m.card)).toBeLessThanOrEqual(1);
  expect(m.tot).toBeLessThanOrEqual(8);
});

test('a short window keeps the request box and scrolls the drawer', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay', { width: 1136, height: 700 });
  const panel = page.getByRole('tabpanel', { name: 'Danh sách yêu cầu, cuộn để xem thêm' });
  expect(await panel.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(288);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.goto('/nv/yeu-cau?yc=gio-vao-0909');
  const d = page.locator('.sd-drawer');
  await expect(d).toBeVisible();
  expect(await d.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
  const box = await d.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(700);
});
