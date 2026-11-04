import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

const tabs = page => page.getByRole('tablist', { name: 'Lọc theo trạng thái' });
const rows = page => page.getByRole('tabpanel').getByRole('link');
const kv = (sheet, key) => sheet.locator('.kv', { has: sheet.page().getByText(key, { exact: true }) }).locator('.v');

test('Yêu cầu makes no /api call', async ({ page }) => {
  const calls = await openPhone(page, '/nv/yeu-cau?yc=phep-1210');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(calls).toEqual([]);
});

test('list groups four requests by month under the Tất cả tab', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Yêu cầu');
  await expect(tabs(page).getByRole('tab')).toHaveText(['Tất cả 4', 'Chờ duyệt 1', 'Đã duyệt 2', 'Từ chối 1']);
  await expect(tabs(page).getByRole('tab', { name: 'Tất cả 4' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('Tháng 10');
  await expect(page.getByRole('tabpanel')).toContainText('Tháng 9');
  await expect(rows(page)).toHaveCount(4);
  await expect(page.locator('a.ro[aria-current]')).toHaveCount(0);
  for (const [i, name] of [
    'Thiếu giờ ra 27/10, Chờ duyệt',
    'Phép năm 12/10, Đã duyệt',
    'Tạm ứng 1.500.000 ₫, Đã duyệt',
    'Khai giờ vào 09/09, Từ chối'
  ].entries()) {
    await expect(rows(page).nth(i)).toHaveAccessibleName(name);
  }
});

test('tabs filter by status and hide empty month groups', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  await tabs(page).getByRole('tab', { name: 'Chờ duyệt 1' }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAccessibleName('Thiếu giờ ra 27/10, Chờ duyệt');
  await expect(page.getByRole('tabpanel')).not.toContainText('Tháng 9');
  await tabs(page).getByRole('tab', { name: 'Từ chối 1' }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole('tabpanel')).not.toContainText('Tháng 10');
  await tabs(page).getByRole('tab', { name: 'Đã duyệt 2' }).click();
  await expect(rows(page)).toHaveCount(2);
});

test('arrow, Home and End keys move between tabs', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  const all = tabs(page).getByRole('tab', { name: 'Tất cả 4' });
  await all.focus();
  await page.keyboard.press('ArrowRight');
  const pend = tabs(page).getByRole('tab', { name: 'Chờ duyệt 1' });
  await expect(pend).toBeFocused();
  await expect(pend).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tabs(page).getByRole('tab', { name: 'Từ chối 1' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(all).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs(page).getByRole('tab', { name: 'Từ chối 1' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(all).toHaveAttribute('aria-selected', 'true');
  await expect(tabs(page).locator('[tabindex="0"]')).toHaveCount(1);
});

test('Tạo yêu cầu shows a notice and opens nothing', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Chưa có luồng tạo yêu cầu trong bản mockup.' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/nv\/yeu-cau$/);
});

test('the Phép năm 12/10 sheet follows J5 and closes back to its row', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  const row = page.getByRole('link', { name: 'Phép năm 12/10, Đã duyệt' });
  await row.click();
  await expect(page).toHaveURL(/\?yc=phep-1210$/);
  const sheet = page.getByRole('dialog', { name: 'Phép năm 12/10' });
  await expect(sheet).toContainText('Đơn nghỉ');
  await expect(sheet).toContainText('Đã duyệt');
  await expect(kv(sheet, 'Ngày nghỉ')).toHaveText('Thứ Hai 12/10/2026');
  await expect(kv(sheet, 'Thời gian')).toHaveText('Cả ngày');
  await expect(kv(sheet, 'Hình thức')).toHaveText('Phép năm');
  await expect(kv(sheet, 'Lý do')).toHaveText('“Việc gia đình.”');
  await expect(kv(sheet, 'Phép năm còn lại')).toHaveText('11 ngày');
  const steps = sheet.getByLabel('Các bước');
  await expect(steps).toContainText('Đã gửi');
  await expect(steps).toContainText('08/10 09:12');
  await expect(steps).toContainText('Trưởng phòng Kinh doanh đã duyệt');
  await expect(steps).toContainText('09/10 10:30');
  await sheet.getByRole('button', { name: 'Đóng' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/nv\/yeu-cau$/);
  await expect(row).toBeFocused();
});

test('pending and rejected requests show their steps', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau?yc=giai-trinh-2710');
  let sheet = page.getByRole('dialog', { name: 'Thiếu giờ ra 27/10' });
  await expect(sheet).toContainText('Giải trình');
  await expect(kv(sheet, 'Giờ ra khai')).toHaveText('17:30');
  await expect(sheet.getByLabel('Các bước')).toContainText('Chờ Admin duyệt');
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/yc=/);

  await page.goto('/nv/yeu-cau?yc=gio-vao-0909');
  sheet = page.getByRole('dialog', { name: 'Khai giờ vào 09/09' });
  await expect(sheet).toContainText('Từ chối');
  await expect(sheet.getByLabel('Các bước')).toContainText('Admin đã từ chối');
  await expect(sheet.getByLabel('Các bước')).toContainText('10/09 10:15');
});

test('a filtered tab survives opening and closing a request', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  await tabs(page).getByRole('tab', { name: 'Từ chối 1' }).click();
  const row = page.getByRole('link', { name: 'Khai giờ vào 09/09, Từ chối' });
  await row.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click();
  await expect(tabs(page).getByRole('tab', { name: 'Từ chối 1' })).toHaveAttribute('aria-selected', 'true');
  await expect(row).toBeFocused();
});

test('?yc=khong-co opens nothing and is dropped from the URL', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau?yc=khong-co');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Yêu cầu');
  await expect(page).not.toHaveURL(/yc=/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the status tabs fit inside the strip at 320px and 360px', async ({ page }) => {
  for (const w of [320, 360]) {
    await openPhone(page, '/nv/yeu-cau', { width: w, height: 800 });
    const strip = tabs(page);
    await expect(strip.getByRole('tab')).toHaveCount(4);
    const m = await strip.evaluate(el => {
      const s = el.getBoundingClientRect();
      return {
        overflow: el.scrollWidth - el.clientWidth,
        tabs: [...el.querySelectorAll('[role="tab"]')].map(t => {
          const r = t.getBoundingClientRect();
          return { text: t.textContent, left: r.left - s.left, right: s.right - r.right, clip: t.scrollWidth - t.clientWidth };
        })
      };
    });
    expect(m.overflow, `strip scrollWidth at ${w}px`).toBeLessThanOrEqual(0);
    for (const t of m.tabs) {
      expect(t.left, `${t.text} left edge at ${w}px`).toBeGreaterThanOrEqual(0);
      expect(t.right, `${t.text} right edge at ${w}px`).toBeGreaterThanOrEqual(0);
      expect(t.clip, `${t.text} clipped at ${w}px`).toBeLessThanOrEqual(0);
    }
  }
});

// Thông báo "Tạo yêu cầu" nổi trên thanh tab, không che và không chặn thanh tab, không bóng (thanh tab của app điện thoại cấm bóng).
for (const size of [
  { width: 320, height: 640 },
  { width: 390, height: 844 }
]) {
  test(`the Tạo yêu cầu notice floats above the tab bar at ${size.width}px`, async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau', size);
    await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
    const toast = page.getByRole('status').filter({ hasText: 'Chưa có luồng tạo yêu cầu trong bản mockup.' });
    await expect(toast).toBeVisible();
    const bar = (await page.getByRole('navigation', { name: 'Điều hướng' }).boundingBox())!;
    const box = (await toast.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y - 8);
    const hit = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest('nav[aria-label="Điều hướng"]'),
      [bar.x + bar.width / 2, bar.y + bar.height / 2]
    );
    expect(hit).toBe(true);
    await expect(toast).toHaveCSS('box-shadow', 'none');
  });
}
