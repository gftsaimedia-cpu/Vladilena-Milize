import { expect, test, type Page } from '@playwright/test';
import { inApp } from './fixtures/in-app';

// Chuông và ngăn kéo thông báo chạy trên nguồn việc giả dùng chung (mock/inbox.ts): không page.route, không gọi /api.
const bellOf = (page: Page) => page.locator('.topbar .bell');
const drawerOf = (page: Page) => page.getByRole('dialog', { name: 'Thông báo' });
const detailOf = (page: Page) => page.getByRole('region', { name: 'Chi tiết yêu cầu' });
const kpiOf = (page: Page) =>
  page
    .getByRole('region', { name: 'Chỉ số chính' })
    .getByRole('article', { name: 'Yêu cầu chờ duyệt' })
    .locator('.kpi-v');
const rowOf = (page: Page, name: string) => drawerOf(page).getByRole('button', { name: new RegExp(`^${name}, `) });

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

test('bell drawer lists one line per pending item in five groups', async ({ page }) => {
  const calls = trackApi(page);
  await page.goto('/admin/tong-quan');
  const bell = bellOf(page);
  await expect(bell).toHaveAccessibleName('Thông báo, 13 việc cần xử lý');
  await bell.click();

  const drawer = drawerOf(page);
  const tab = drawer.getByRole('tab', { name: /^Cần duyệt/ });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(tab).toContainText('13');

  await expect(drawer.getByRole('heading', { level: 3 })).toHaveText([
    /^Chấm công\s*2$/,
    /^Đơn nghỉ\s*3$/,
    /^Làm thêm, làm bù\s*2$/,
    /^Giải trình\s*4$/,
    /^Tạm ứng\s*2$/
  ]);
  await expect(drawer.getByRole('button', { name: 'Bùi Quốc Huy, Đơn nghỉ: Nghỉ ốm 28/10' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Mai Phương Thảo, Tạm ứng: 3.000.000 ₫' })).toBeVisible();

  await expect(detailOf(page)).toHaveCount(0);
  await expect(drawer.getByText('Bấm một yêu cầu để xem chi tiết.')).toBeVisible();
  expect(calls).toEqual([]);
});

test('sick leave detail shows the leave type and the reason as separate facts', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await bellOf(page).click();
  await rowOf(page, 'Bùi Quốc Huy').click();

  const detail = detailOf(page);
  await expect(detail).toBeFocused();
  await expect(detail.getByRole('heading', { name: 'Nghỉ ốm · 1 ngày' })).toBeVisible();
  const fact = (label: string) =>
    detail.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd');
  await expect(fact('Hình thức')).toHaveText('Nghỉ ốm');
  await expect(fact('Lý do')).toHaveText('“Sốt cao, đã đi khám.”');
  await expect(fact('Đính kèm')).toHaveText('Giấy khám bệnh · 1 tệp');
});

test('approving in the bell updates the bell, the overview and selects the next item', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const bell = bellOf(page);
  await bell.click();
  await rowOf(page, 'Nguyễn Thu Hà').click();
  await detailOf(page).getByRole('button', { name: 'Duyệt yêu cầu của Nguyễn Thu Hà' }).click();

  await expect(drawerOf(page).getByText('Đã duyệt yêu cầu của Nguyễn Thu Hà.')).toBeVisible();
  await expect(bell).toHaveAccessibleName('Thông báo, 12 việc cần xử lý');
  await expect(detailOf(page).getByRole('heading', { name: 'Bùi Quốc Huy' })).toBeVisible();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(drawerOf(page)).toHaveCount(0);
  await expect(kpiOf(page)).toHaveText('10');
  await expect(page.getByRole('list', { name: 'Việc cần duyệt' }).getByRole('listitem').first()).toContainText(
    'Bùi Quốc Huy'
  );
});

test('forgotten punches offer a reminder and a stand-in entry', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const bell = bellOf(page);
  await bell.click();

  await rowOf(page, 'Trịnh Văn Long').click();
  const detail = detailOf(page);
  await expect(detail.getByRole('button', { name: 'Nhắc giải trình' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Khai thay giờ ra' })).toBeVisible();
  await expect(detail.getByRole('link', { name: 'Mở hồ sơ chấm công' })).toHaveAttribute(
    'href',
    '/admin/cham-cong/nhan-vien/trinh-van-long'
  );
  await detail.getByRole('button', { name: 'Nhắc giải trình' }).click();
  await expect(drawerOf(page).getByText('Đã nhắc Trịnh Văn Long giải trình.')).toBeVisible();
  await expect(bell).toHaveAccessibleName('Thông báo, 12 việc cần xử lý');

  await rowOf(page, 'Lý Thanh Tâm').click();
  await expect(detail.getByRole('button', { name: 'Khai thay giờ vào' })).toBeVisible();
  await detail.getByRole('button', { name: 'Khai thay giờ vào' }).click();
  await expect(drawerOf(page).getByText('Đã ghi nhận khai thay cho Lý Thanh Tâm.')).toBeVisible();

  await rowOf(page, 'Mai Phương Thảo').click();
  await expect(detail.getByRole('heading', { name: 'Mai Phương Thảo' })).toBeVisible();
  await expect(detail.getByRole('link', { name: 'Mở hồ sơ chấm công' })).toHaveCount(0);
});

test('escape closes the detail first, then the drawer, returning focus', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const bell = bellOf(page);
  await bell.click();
  const row = rowOf(page, 'Lê Hoàng Nam');
  await row.click();
  await expect(detailOf(page)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(detailOf(page)).toHaveCount(0);
  await expect(drawerOf(page)).toBeVisible();
  await expect(row).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(drawerOf(page)).toHaveCount(0);
  await expect(bell).toBeFocused();
});

test('resolving the last item leaves focus on the Cần duyệt tab', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await inApp(
    page,
    `const inbox = await import('/src/mock/inbox.ts');
     for (const id of ['ib-c1','ib-c2','ib-l1','ib-l2','ib-l3','ib-o1','ib-o2','ib-e1','ib-e2','ib-e3','ib-e4','ib-a1']) {
       inbox.resolveInboxItem(id);
     }`
  );
  const bell = bellOf(page);
  await bell.click();
  const drawer = drawerOf(page);
  await expect(drawer.locator('button[data-id]')).toHaveCount(1);
  await rowOf(page, 'Trương Quốc Việt').click();
  await detailOf(page).getByRole('button', { name: 'Duyệt yêu cầu của Trương Quốc Việt' }).click();

  await expect(drawer.getByText('Không còn yêu cầu nào chờ duyệt.')).toBeVisible();
  await expect(drawer.getByRole('tab', { name: /^Cần duyệt/ })).toBeFocused();
  await expect(detailOf(page)).toHaveCount(0);
  await expect(bell).toHaveAccessibleName('Thông báo, 0 việc cần xử lý');
  await expect(bell.locator('i')).toHaveCount(0);
});

test('a row name reads in the ink colour, not the sidebar group grey', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await bellOf(page).click();
  await expect(rowOf(page, 'Bùi Quốc Huy').locator('b')).toHaveCSS('color', 'rgb(33, 33, 33)');
  await expect(drawerOf(page).getByRole('heading', { level: 3 }).first()).toHaveCSS('color', 'rgb(97, 97, 97)');
});

test('the detail avatar is 44px wide under the default compact density', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'gon');
  await bellOf(page).click();
  await rowOf(page, 'Trịnh Văn Long').click();
  const avatar = detailOf(page).locator('[class*="av"]').first();
  await expect(avatar).toHaveText('VL');
  const box = await avatar.boundingBox();
  expect(Math.round(box!.width)).toBe(44);
});

test('keyboard focus on a bell control draws a 2px ink outline', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await bellOf(page).click();
  const drawer = drawerOf(page);
  await rowOf(page, 'Lê Hoàng Nam').click();
  await page.keyboard.press('Escape');
  await expect(rowOf(page, 'Lê Hoàng Nam')).toBeFocused();
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (!(await drawer.evaluate(el => el.contains(document.activeElement)))) continue;
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return [s.outlineColor, s.outlineWidth, s.outlineStyle].join(' ');
    });
    expect(outline).toBe('rgb(33, 33, 33) 2px solid');
    seen.add(await page.evaluate(() => document.activeElement!.className || document.activeElement!.tagName));
  }
  expect(seen.size).toBeGreaterThanOrEqual(4);
});

test('on a narrow screen the covered drawer is inert while a detail is open', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/admin/tong-quan');
  await bellOf(page).click();
  await rowOf(page, 'Lê Hoàng Nam').click();
  const drawer = drawerOf(page);
  for (const part of ['.bd-h', '.bd-tabs', '.bd-body', '.bd-f']) {
    await expect(drawer.locator(part)).toHaveAttribute('inert', '');
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('.bd-h, .bd-tabs, .bd-body, .bd-f'))).toBeNull();
  }
  await page.keyboard.press('Escape');
  await expect(drawer.locator('.bd-h')).not.toHaveAttribute('inert', '');
  await expect(rowOf(page, 'Lê Hoàng Nam')).toBeFocused();
});

test('Mở hồ sơ chấm công closes the drawer, also when already on that profile', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await bellOf(page).click();
  await rowOf(page, 'Trịnh Văn Long').click();
  await detailOf(page).getByRole('link', { name: 'Mở hồ sơ chấm công' }).click();
  await expect(page).toHaveURL(/\/admin\/cham-cong\/nhan-vien\/trinh-van-long/);
  await expect(drawerOf(page)).toHaveCount(0);

  await bellOf(page).click();
  await rowOf(page, 'Trịnh Văn Long').click();
  await detailOf(page).getByRole('link', { name: 'Mở hồ sơ chấm công' }).click();
  await expect(drawerOf(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/cham-cong\/nhan-vien\/trinh-van-long/);
});

test('system news tab lists three read-only notes', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await bellOf(page).click();
  const drawer = drawerOf(page);
  await drawer.getByRole('tab', { name: 'Tin hệ thống · 3' }).click();
  const panel = drawer.getByRole('tabpanel');
  await expect(panel.getByRole('listitem')).toHaveCount(3);
  await expect(panel).toContainText('Đã nhận dữ liệu máy chấm công lúc 09:30.');
  await expect(panel.getByRole('button')).toHaveCount(0);
});
