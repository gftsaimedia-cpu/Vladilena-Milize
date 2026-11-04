import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

const nav = page => page.getByRole('navigation', { name: 'Điều hướng' });

test('Check-out on Hôm nay carries to Chấm công through the tab bar', async ({ page }) => {
  const calls = await openPhone(page, '/nv/hom-nay');
  await page.getByRole('button', { name: 'Check-out lúc 09:40' }).click();
  await expect(page.getByText('Đã check-out')).toBeVisible();
  await nav(page).getByRole('link', { name: 'Chấm công' }).click();
  const recent = page.locator('section', { has: page.getByRole('heading', { name: 'Gần đây' }) });
  const latest = recent.getByRole('button', { name: /Thứ Tư 28\/10/ });
  await expect(latest).toContainText('07:59 – 09:40');
  await latest.click();
  const sheet = page.getByRole('dialog', { name: 'Thứ Tư 28/10/2026' });
  await expect(sheet.locator('.kv', { hasText: 'Giờ ra' }).locator('.v')).toHaveText('09:40');
  await sheet.getByRole('button', { name: 'Đóng' }).click();
  await nav(page).getByRole('link', { name: 'Hôm nay' }).click();
  await expect(page.getByText('Đã check-out')).toBeVisible();
  await expect(page.getByRole('button', { name: /Check-out lúc/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Tuần này' }).getByRole('link', { name: /28\/10/ })).toHaveAccessibleName(/đi làm/);
  expect(calls).toEqual([]);
});

test('Hôm nay links open the day and the request sheets', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  await page.getByRole('link', { name: '27/10 thiếu giờ ra · chờ duyệt giải trình' }).click();
  await expect(page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click();
  await nav(page).getByRole('link', { name: 'Hôm nay' }).click();
  await page.getByRole('link', { name: 'Phép năm 12/10, Đã duyệt' }).click();
  await expect(page.getByRole('dialog', { name: 'Phép năm 12/10' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Yêu cầu' })).toHaveAttribute('aria-current', 'page');
});

test('a J4 request row opens its sheet without aria-current or a new history entry', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  const row = page.getByRole('link', { name: 'Phép năm 12/10, Đã duyệt' });
  await expect(row).toHaveAttribute('href', '/nv/yeu-cau?yc=phep-1210');
  await expect(row).not.toHaveAttribute('aria-current');
  const before = await page.evaluate(() => history.length);
  await row.click();
  await expect(page).toHaveURL(/\/nv\/yeu-cau\?yc=phep-1210$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
  await expect(page.getByRole('dialog', { name: 'Phép năm 12/10' })).toBeVisible();
});

test('no screen scrolls sideways at 320px and 360px and the tab bar never covers the last row', async ({ page }) => {
  for (const size of [
    { width: 320, height: 640 },
    { width: 360, height: 640 }
  ]) {
    await openPhone(page, '/nv/hom-nay', size);
    for (const path of ['/nv/hom-nay', '/nv/cham-cong', '/nv/yeu-cau', '/nv/thu-nhap', '/nv/toi']) {
      const label = `${size.width}px ${path}`;
      await page.goto(path);
      await expect(page.locator('.ph > *').first()).toBeVisible();
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(sw, label).toBe(cw);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const bar = await nav(page).boundingBox();
      const last = await page.locator('.ph > *:not(nav)').last().boundingBox();
      expect(last!.y + last!.height, label).toBeLessThanOrEqual(bar!.y);
    }
  }
});

test('closing a sheet opened from Hôm nay lands on the matching J2 day and J4 row', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  await page.getByRole('link', { name: '27/10 thiếu giờ ra · chờ duyệt giải trình' }).click();
  await expect(page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /27\/10/ }).and(page.locator('.dn'))).toBeFocused();

  await nav(page).getByRole('link', { name: 'Hôm nay' }).click();
  await page.getByRole('link', { name: 'Phép năm 12/10, Đã duyệt' }).click();
  await expect(page.getByRole('dialog', { name: 'Phép năm 12/10' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Phép năm 12/10, Đã duyệt' })).toBeFocused();
});
