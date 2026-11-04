import { expect, test, type Page } from '@playwright/test';
import entries from '../src/design-index/admin-attendance';
import { inApp } from './fixtures/in-app';

// Chấm công theo tuần chạy trên dữ liệu giả (mock/attendance.ts): không page.route, không gọi /api.
// Mỗi test mở một trang mới nên module giả luôn bắt đầu từ trạng thái ban đầu (13 việc chờ, 11 việc có ngày).
let calls: string[] = [];

// Cuộn về cột gần nhất phải xong ngay trong test, không chờ hoạt ảnh.
test.use({ reducedMotion: 'reduce' });

const gridOf = (page: Page) => page.getByRole('region', { name: 'Lưới chấm công' });
const tileOf = (page: Page, name: string) =>
  page.getByRole('region', { name: 'Chỉ số chấm công' }).getByRole('article', { name });
const cellOf = (page: Page, name: string | RegExp) => page.getByRole('button', { name });
const dialogOf = (page: Page) => page.getByRole('dialog');
const rowsOf = (page: Page) => page.locator('tbody tr');
const pendingTab = (page: Page) => page.getByRole('tab', { name: /^Cần xử lý/ });
const bellOf = (page: Page) => page.locator('.topbar .bell');

// Chờ lưới dựng xong và tuần hôm nay nằm đúng chỗ (mount đặt scrollLeft 1344) rồi mới bấm hay kéo.
async function settleWeek(page: Page) {
  await expect(rowsOf(page)).toHaveCount(11);
  await expect.poll(() => gridOf(page).evaluate(el => el.scrollLeft)).toBe(1344);
}

test.beforeEach(async ({ page }) => {
  calls = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('attendance week shows tiles, the current week and today without calling /api', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await expect(page.getByRole('heading', { name: 'Chấm công', level: 1 })).toBeVisible();
  await expect(page.getByText('Kỳ công 01–31/10/2026 · hôm nay Thứ Tư 28/10')).toBeVisible();

  await expect(page.getByRole('region', { name: 'Chỉ số chấm công' }).getByRole('article')).toHaveCount(6);
  await expect(tileOf(page, 'Cần xử lý').locator('.tile-v')).toHaveText('11');
  await expect(tileOf(page, 'Cần xử lý').locator('.tile-n')).toHaveText('2 quên chấm · 9 yêu cầu chờ duyệt');
  await expect(tileOf(page, 'Nghỉ có phép').locator('.tile-n')).toHaveText('3 đơn chờ duyệt');

  await expect(page.getByRole('tab', { name: 'Tuần', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(pendingTab(page)).toContainText('11');
  await expect(page.getByRole('tab', { name: 'Tháng' })).toHaveCount(0);

  await expect(page.locator('.wk-label')).toHaveText('26/10 – 01/11/2026');
  await expect.poll(() => gridOf(page).evaluate(el => el.scrollLeft)).toBe(1344);
  await expect(rowsOf(page)).toHaveCount(11);
  const count = (group: string) => page.locator(`[data-group="${group}"] .ct`);
  await expect(count('work')).toHaveText('25');
  await expect(count('late')).toHaveText('2');
  await expect(count('leave')).toHaveText('0');
  await expect(count('absent')).toHaveText('0');
  await expect(count('todo')).toHaveText('8');
  await expect(page.getByText('Hiển thị 11 trong 128 nhân viên')).toBeVisible();
  expect(calls).toEqual([]);
});

test('cells read their state and off days are not buttons', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await expect(rowsOf(page)).toHaveCount(11);

  const todo = cellOf(page, 'Lê Hoàng Nam, Thứ Ba 27/10: Cần xử lý, Thiếu giờ ra');
  await expect(todo).toHaveClass(/\btodo\b/);
  const late = cellOf(page, 'Phạm Ngọc Anh, Thứ Tư 28/10: Đi muộn, 08:21–…, đang làm');
  await expect(late).toHaveClass(/\blate\b/);
  await expect(late.locator('.dot')).toHaveCount(1);

  const off = 'Nguyễn Thu Hà, Chủ nhật 01/11: không có ca';
  await expect(page.getByRole('img', { name: off })).toBeVisible();
  await expect(cellOf(page, off)).toHaveCount(0);
  await expect(cellOf(page, 'Nguyễn Thu Hà, Thứ Bảy 31/10: ca dự kiến 08:00–17:00')).toBeVisible();
  await expect(cellOf(page, 'Ngô Gia Bảo, Chủ nhật 01/11: Cần xử lý, Làm bù')).toHaveClass(/\btodo\b/);

  await expect(page.locator('th[data-date="2026-11-01"]')).toHaveCSS('color', 'rgb(158, 158, 158)');
  await expect(page.locator('th[data-date="2026-10-31"]')).not.toHaveCSS('color', 'rgb(158, 158, 158)');

  const link = page.getByRole('link', { name: 'Lê Hoàng Nam' });
  await expect(link).toHaveAttribute('href', '/admin/cham-cong/nhan-vien/le-hoang-nam');
  await expect(link).toHaveAttribute('draggable', 'false');
});

test('name and department filters live in the URL and survive dialog, reload, back and forward', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await page.getByRole('navigation', { name: 'Điều hướng' }).getByRole('link', { name: 'Chấm công', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Lọc theo tên' });
  const dept = page.getByRole('combobox', { name: 'Phòng ban' });

  await name.fill('nam');
  await expect(page).toHaveURL(/q=nam/);
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowsOf(page)).toContainText('Lê Hoàng Nam');

  await name.fill('');
  await dept.selectOption('Sản xuất');
  await expect(page).toHaveURL(/pb=S%E1%BA%A3n/);
  await expect(rowsOf(page)).toHaveCount(4);

  await cellOf(page, /^Bùi Quốc Huy, Thứ Hai 26\/10:/).click();
  await expect(dialogOf(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(page).toHaveURL(/pb=S%E1%BA%A3n/);
  await expect(rowsOf(page)).toHaveCount(4);

  await page.reload();
  await expect(rowsOf(page)).toHaveCount(4);
  await expect(dept).toHaveValue('Sản xuất');

  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/tong-quan/);
  await page.goForward();
  await expect(page).toHaveURL(/pb=S%E1%BA%A3n/);
  await expect(rowsOf(page)).toHaveCount(4);

  await page.getByRole('textbox', { name: 'Lọc theo tên' }).fill('xyz');
  await expect(page.getByText('Không có nhân viên nào khớp.')).toBeVisible();
  await expect(page.getByText('Hiển thị 0 trong 128 nhân viên')).toBeVisible();
});

test('unknown department in the URL falls back to all', async ({ page }) => {
  await page.goto('/admin/cham-cong?pb=Kho');
  await expect(rowsOf(page)).toHaveCount(11);
  await expect(page).not.toHaveURL(/pb=/);
  await expect(page.getByRole('combobox', { name: 'Phòng ban' }).locator('option:checked')).toHaveText(
    'Phòng ban: Tất cả'
  );
});

test('phone keeps the labelled filters inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/cham-cong');
  for (const control of [
    page.getByRole('textbox', { name: 'Lọc theo tên' }),
    page.getByRole('combobox', { name: 'Phòng ban' })
  ]) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }
  await page.getByRole('textbox', { name: 'Lọc theo tên' }).fill('linh');
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowsOf(page)).toContainText('Đỗ Mai Linh');
});

test('phone keeps all four week buttons inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/cham-cong');
  for (const name of ['Tuần trước', 'Tuần sau', 'Hôm nay']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box!.x, name).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(375);
  }
});

test('pending tab lists every day to handle in date order', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await pendingTab(page).click();
  await expect(page).toHaveURL(/xem=can-xu-ly/);

  const list = page.getByRole('list', { name: 'Việc cần xử lý chấm công' });
  const items = list.getByRole('listitem');
  await expect(items).toHaveCount(11);
  await expect(items.nth(0)).toContainText('Trần Minh Quân');
  await expect(items.nth(0)).toContainText('15/10');
  await expect(items.nth(3)).toContainText('Lý Thanh Tâm');
  await expect(items.nth(4)).toContainText('Đỗ Mai Linh');
  await expect(items.nth(10)).toContainText('Phạm Ngọc Anh');
  await expect(items.nth(10)).toContainText('03/11');

  await page.reload();
  await expect(pendingTab(page)).toHaveAttribute('aria-selected', 'true');
  await list.getByRole('button', { name: /Lê Hoàng Nam/ }).click();
  await expect(dialogOf(page)).toHaveAccessibleName('Lê Hoàng Nam · Thứ Ba 27/10/2026');
});

test('day dialog deep-links, shows the request and closes back to the grid', async ({ page }) => {
  await page.goto('/admin/cham-cong?thang=2026-10&q=nam');
  const cell = cellOf(page, /^Lê Hoàng Nam, Thứ Ba 27\/10:/);
  await cell.click();
  await expect(page).toHaveURL(/hop=chi-tiet-ngay/);
  await expect(page).toHaveURL(/nv=le-hoang-nam/);
  await expect(page).toHaveURL(/ngay=2026-10-27/);

  const dialog = dialogOf(page);
  const row = (label: RegExp) => dialog.locator('.dd-r', { hasText: label });
  await expect(dialog.getByText('Kinh doanh · Nhân viên kinh doanh · Ca HC 08:00–17:00')).toBeVisible();
  await expect(row(/^Giờ vào/)).toContainText('08:12');
  await expect(row(/^Giờ ra/)).toContainText('Chưa có');
  await expect(dialog.getByRole('button', { name: 'Duyệt yêu cầu của Lê Hoàng Nam' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Mở hồ sơ chấm công' })).toBeVisible();

  await page.reload();
  await expect(dialogOf(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/cham-cong\?thang=2026-10&q=nam$/);

  await cell.click();
  await expect(dialogOf(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cell).toBeFocused();
});

test('approving in the day dialog updates the cell, the tile and the bell', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await settleWeek(page);
  await cellOf(page, /^Lê Hoàng Nam, Thứ Ba 27\/10:/).click();
  await dialogOf(page).getByRole('button', { name: 'Duyệt yêu cầu của Lê Hoàng Nam' }).click();

  await expect(page.getByText('Đã duyệt yêu cầu của Lê Hoàng Nam.')).toBeVisible();
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(cellOf(page, 'Lê Hoàng Nam, Thứ Ba 27/10: Đi muộn, 08:12–?')).toHaveClass(/\blate\b/);
  await expect(tileOf(page, 'Cần xử lý').locator('.tile-v')).toHaveText('10');
  await expect(page.locator('[data-group="todo"] .ct')).toHaveText('7');
  await expect(bellOf(page)).toHaveAccessibleName('Thông báo, 12 việc cần xử lý');
});

test('after deciding an item in Cần xử lý, focus lands on the row now at that place, or the one before it', async ({
  page
}) => {
  await page.goto('/admin/cham-cong?xem=can-xu-ly');
  const list = page.getByRole('list', { name: 'Việc cần xử lý chấm công' });
  const rows = list.getByRole('button');
  await expect(rows).toHaveCount(11);
  const names = await rows.locator('.nn').allInnerTexts();
  const at = 3;
  await rows.nth(at).click();
  await dialogOf(page).locator('.acts .btn').first().click();
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(rows).toHaveCount(10);
  await expect(rows.nth(at)).toBeFocused();
  await expect(rows.nth(at)).toContainText(names[at + 1]);

  // Dòng cuối: hết dòng ở đúng chỗ đó thì về dòng liền trước.
  await rows.nth(9).click();
  await dialogOf(page).locator('.acts .btn').first().click();
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(rows).toHaveCount(9);
  await expect(rows.nth(8)).toBeFocused();
});

test('a grid cell that turns into a plain span hands focus to the nearest cell in its row', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await settleWeek(page);
  await cellOf(page, 'Ngô Gia Bảo, Chủ nhật 01/11: Cần xử lý, Làm bù').click();
  await dialogOf(page).getByRole('button', { name: 'Duyệt yêu cầu của Ngô Gia Bảo' }).click();
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Ngô Gia Bảo, Chủ nhật 01/11: không có ca' })).toBeVisible();
  await expect(cellOf(page, /^Ngô Gia Bảo, Thứ Bảy 31\/10:/)).toBeFocused();
  await expect(weekLabel(page)).toHaveText('26/10 – 01/11/2026');
});

test('design index entries for the attendance screens open real mock data', async ({ page }) => {
  const entry = (file: string) => entries.find(e => e.file === file)!.to;
  await page.goto(entry('cham-cong.html'));
  await expect(rowsOf(page)).toHaveCount(11);

  await page.goto(entry('dlg-cc-chi-tiet-ngay.html'));
  await expect(dialogOf(page)).toHaveAccessibleName('Lê Hoàng Nam · Thứ Ba 27/10/2026');

  await page.goto(entry('drw-thong-bao.html'));
  await expect(page.getByRole('dialog', { name: 'Thông báo' })).toBeVisible();

  await page.goto(entry('cc-ho-so.html'));
  await expect(page.getByRole('heading', { name: 'Lê Hoàng Nam', level: 2 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Các ngày tháng 10' })).toBeVisible();

  for (const e of entries.filter(e => /^(cham-cong|cc-)/.test(e.file) || /(chi-tiet-ngay|thong-bao)/.test(e.file))) {
    expect(e.to, e.file).toContain('thang=2026-10');
  }
});

test('deciding an item already handled elsewhere warns instead of confirming', async ({ page }) => {
  await page.goto('/admin/cham-cong?hop=chi-tiet-ngay&nv=le-hoang-nam&ngay=2026-10-27');
  await expect(dialogOf(page)).toBeVisible();
  await inApp(page, `const I = await import('/src/mock/inbox.ts'); return I.resolveInboxItem('ib-e1') !== null;`);
  await dialogOf(page).getByRole('button', { name: 'Duyệt yêu cầu của Lê Hoàng Nam' }).click();

  await expect(page.getByText('Yêu cầu này đã được xử lý.')).toBeVisible();
  await expect(page.getByText('Đã duyệt yêu cầu của Lê Hoàng Nam.')).toHaveCount(0);
});

test('bad day links close quietly', async ({ page }) => {
  for (const query of [
    'nv=khong-co&ngay=2026-10-27',
    'nv=le-hoang-nam&ngay=2026-13-01',
    'nv=le-hoang-nam&ngay=hom-qua'
  ]) {
    await page.goto(`/admin/cham-cong?hop=chi-tiet-ngay&${query}`);
    await expect(page).toHaveURL(/\/admin\/cham-cong$/);
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(gridOf(page)).toBeVisible();
  }
});

test('other months show the empty line', async ({ page }) => {
  await page.goto('/admin/cham-cong?thang=2026-09');
  await expect(page.getByText('Chưa có dữ liệu chấm công giả cho tháng 9/2026.')).toBeVisible();
  await expect(gridOf(page)).toHaveCount(0);
});

test('old attendance links land on the week view', async ({ page }) => {
  await page.goto('/admin/cham-cong/bang-cong?thang=2026-10');
  await expect(page).toHaveURL(/\/admin\/cham-cong\?thang=2026-10$/);

  for (const path of ['sua-gio', 'gio-ot']) {
    await page.goto(`/admin/cham-cong/${path}`);
    await expect(page).toHaveURL(/xem=can-xu-ly/);
    await expect(pendingTab(page)).toHaveAttribute('aria-selected', 'true');
  }

  await page.goto('/admin/cham-cong/hom-nay');
  await expect(page).toHaveURL(/\/admin\/cham-cong$/);
  await expect(dialogOf(page)).toHaveCount(0);
});

test('attendance css stays inside the attendance screens after navigating away', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await expect(rowsOf(page)).toHaveCount(11);
  await page.getByRole('navigation', { name: 'Điều hướng' }).getByRole('link', { name: 'Tổng quan', exact: true }).click();
  await expect(page).toHaveURL(/tong-quan/);
  // Phần tử mang class chung (.b của ô chữ ở Nhân sự, .legend ở Tổng quan) không được nhận kiểu của chú giải chấm công.
  const styles = await page.evaluate(() => {
    const probe = (cls: string) => {
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = 'Thử nghiệm kiểu dáng';
      document.body.append(el);
      const cs = getComputedStyle(el);
      const out = { width: el.getBoundingClientRect().width, display: cs.display, radius: cs.borderTopLeftRadius };
      el.remove();
      return out;
    };
    return { b: probe('b'), legend: probe('legend') };
  });
  expect(styles.b.display).toBe('block');
  expect(styles.b.width).toBeGreaterThan(12);
  expect(styles.b.radius).toBe('0px');
  expect(styles.legend.display).toBe('block');
});

test('legend items are flat: no capsule, no border', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  const item = page.locator('[data-group="work"]');
  await expect(item).toBeVisible();
  await expect(item).toHaveCSS('border-top-width', '0px');
  await expect(item).toHaveCSS('border-top-left-radius', '0px');
  await expect(item).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('pill and dot rules apply only under the attendance root', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await expect(rowsOf(page)).toHaveCount(11);
  const out = await page.evaluate(() => {
    const probe = (html: string) => {
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.append(host);
      const el = host.firstElementChild as HTMLElement;
      const cs = getComputedStyle(el);
      const r = { bg: cs.backgroundColor, height: el.getBoundingClientRect().height };
      host.remove();
      return r;
    };
    return {
      work: probe('<button class="pill work">Thử</button>'),
      fu: probe('<button class="pill fu">Thử</button>'),
      dot: probe('<span class="pill"><span class="dot"></span></span>')
    };
  });
  expect(out.work.bg).not.toBe('rgb(28, 28, 28)');
  expect(out.work.height).not.toBe(30);
  expect(out.fu.bg).not.toBe('rgb(255, 255, 255)');
});

test('the planned-shift legend swatch looks like the planned cell it explains', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await settleWeek(page);
  const look = (sel: string) =>
    page.locator(sel).first().evaluate(el => {
      const cs = getComputedStyle(el);
      return [cs.backgroundColor, cs.borderTopStyle, cs.borderTopWidth, cs.borderTopColor].join(' ');
    });
  const swatch = await look('.att .b.fu');
  const cell = await look('td.dc button.pill.fu');
  expect(swatch).toBe(cell);
  expect(swatch).toBe('rgb(255, 255, 255) dashed 1px rgb(224, 224, 224)');
});

test('the legend is a labelled group on the week and on the profile', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await expect(page.getByRole('group', { name: 'Chú giải' })).toHaveCount(1);
  await page.goto('/admin/cham-cong/nhan-vien/le-hoang-nam');
  await expect(page.getByRole('group', { name: 'Chú giải' })).toHaveCount(1);
});

test('comfortable density keeps 48px day cells and an 8px gap between adjacent pills', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await settleWeek(page);
  await page.evaluate(() => document.documentElement.removeAttribute('data-density'));
  const out = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('tbody tr:first-child td.dc'));
    const heights = cells.map(td => Math.round(td.getBoundingClientRect().height));
    let gap = -1;
    for (let i = 0; i + 1 < cells.length && gap < 0; i++) {
      const a = cells[i].querySelector('button.pill');
      const b = cells[i + 1].querySelector('button.pill');
      if (a && b) gap = Math.round(b.getBoundingClientRect().left - a.getBoundingClientRect().right);
    }
    return { heights: Array.from(new Set(heights)), gap };
  });
  expect(out.heights).toEqual([48]);
  expect(out.gap).toBe(8);
});

test('the name cell shows the name alone and planned cells carry their hours only in the accessible name', async ({
  page
}) => {
  await page.goto('/admin/cham-cong');
  await settleWeek(page);
  const first = page.locator('tbody th.nm a').first();
  await expect(first).toHaveText('Nguyễn Thu Hà');
  expect(await first.evaluate(el => (el as HTMLElement).innerText.includes('\n'))).toBe(false);
  const names = (await page.locator('tbody th.nm').allInnerTexts()).join(' ');
  expect(names).not.toMatch(/Kinh doanh|Kỹ thuật|Tài chính|Sản xuất|Marketing|Nhân sự/);

  const planned = page.locator('td.dc button.pill.fu');
  expect(await planned.count()).toBeGreaterThan(0);
  const texts = await planned.evaluateAll(els => els.map(el => (el.textContent ?? '').trim()));
  expect(texts.filter(Boolean)).toEqual([]);
  await expect(cellOf(page, 'Nguyễn Thu Hà, Thứ Bảy 31/10: ca dự kiến 08:00–17:00')).toHaveText('');
});

const scrollLeftOf = (page: Page) => gridOf(page).evaluate(el => el.scrollLeft);
const weekLabel = (page: Page) => page.locator('.wk-label');
const legendCount = (page: Page, group: string) => page.locator(`.att .gc[data-group="${group}"] .ct`);
// Đếm click lọt tới vùng cuộn (pha nổi bọt) sau lượt kéo: cú click bị chặn ở pha capture thì không bao giờ tới đây.
const countClicks = (page: Page) =>
  gridOf(page).evaluate(el => {
    const w = window as unknown as { __clicks: number };
    w.__clicks = 0;
    el.addEventListener('click', () => (w.__clicks += 1));
  });
const clicksSeen = (page: Page) => page.evaluate(() => (window as unknown as { __clicks: number }).__clicks);

async function centerOf(locator: ReturnType<Page['locator']>) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('the week place is kept in the URL and survives switching tabs and the profile round trip', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await settleWeek(page);
  const prev = page.getByRole('button', { name: 'Tuần trước' });
  await prev.click();
  await prev.click();
  await expect(weekLabel(page)).toHaveText('12/10 – 18/10/2026');
  await expect(page).toHaveURL(/tuan=2026-10-12/);

  await pendingTab(page).click();
  await expect(gridOf(page)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Tuần', exact: true }).click();
  await expect(weekLabel(page)).toHaveText('12/10 – 18/10/2026');
  await expect.poll(() => scrollLeftOf(page)).toBe(0);

  await page.getByRole('link', { name: 'Nguyễn Thu Hà' }).click();
  await expect(page).toHaveURL(/\/admin\/cham-cong\/nhan-vien\/nguyen-thu-ha/);
  await page.goBack();
  await expect(rowsOf(page)).toHaveCount(11);
  await expect(weekLabel(page)).toHaveText('12/10 – 18/10/2026');
  await expect.poll(() => scrollLeftOf(page)).toBe(0);
});

test('a bad week value opens at today and one past the grid is clamped to the last week', async ({ page }) => {
  await page.goto('/admin/cham-cong?tuan=hom-qua');
  await settleWeek(page);
  await expect(weekLabel(page)).toHaveText('26/10 – 01/11/2026');

  await page.goto('/admin/cham-cong?tuan=2030-01-01');
  await expect(rowsOf(page)).toHaveCount(11);
  await expect(weekLabel(page)).toHaveText('02/11 – 08/11/2026');
  await page.goto('/admin/cham-cong?tuan=2020-01-01');
  await expect(rowsOf(page)).toHaveCount(11);
  await expect(weekLabel(page)).toHaveText('12/10 – 18/10/2026');
});

test('week buttons move by seven days and Hôm nay returns to this week', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  const prev = page.getByRole('button', { name: 'Tuần trước' });
  const next = page.getByRole('button', { name: 'Tuần sau' });
  await expect(weekLabel(page)).toHaveText('26/10 – 01/11/2026');

  await prev.click();
  await expect(weekLabel(page)).toHaveText('19/10 – 25/10/2026');
  await expect(legendCount(page, 'work')).toHaveText('62');
  await expect(legendCount(page, 'late')).toHaveText('1');
  await expect(legendCount(page, 'leave')).toHaveText('1');
  await expect(legendCount(page, 'todo')).toHaveText('2');

  await prev.click();
  await expect(weekLabel(page)).toHaveText('12/10 – 18/10/2026');
  await expect(prev).toBeDisabled();
  await expect(next).toBeFocused();
  await expect(legendCount(page, 'work')).toHaveText('63');
  await expect(legendCount(page, 'absent')).toHaveText('1');
  await expect(legendCount(page, 'leave')).toHaveText('1');
  await expect(legendCount(page, 'todo')).toHaveText('1');

  await page.getByRole('button', { name: 'Hôm nay' }).click();
  await expect(weekLabel(page)).toHaveText('26/10 – 01/11/2026');
  await expect(prev).toBeEnabled();

  await next.click();
  await expect(weekLabel(page)).toHaveText('02/11 – 08/11/2026');
  await expect(next).toBeDisabled();
  await expect(prev).toBeFocused();
});

test('dragging scrolls, snaps to a day and opens nothing', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await settleWeek(page);
  await countClicks(page);

  const { x, y } = await centerOf(cellOf(page, /^Lê Hoàng Nam, Thứ Ba 27\/10:/));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 150, y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => scrollLeftOf(page)).toBe(1536);
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/hop=/);
  expect(await clicksSeen(page)).toBe(0);

  // Bắt đầu kéo ngay trên liên kết tên: không điều hướng sang hồ sơ.
  const link = await centerOf(page.getByRole('link', { name: 'Lê Hoàng Nam' }));
  await page.mouse.move(link.x, link.y);
  await page.mouse.down();
  await page.mouse.move(link.x + 150, link.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => scrollLeftOf(page)).toBe(1344);
  await expect(page).toHaveURL(/\/admin\/cham-cong$/);
  expect(await clicksSeen(page)).toBe(0);

  // Cờ chặn tự xoá: một cú bấm thường ngay sau đó vẫn tới nơi và mở hộp.
  await cellOf(page, /^Lê Hoàng Nam, Thứ Ba 27\/10:/).click();
  await expect(dialogOf(page)).toBeVisible();
  expect(await clicksSeen(page)).toBe(1);
});

test('a press released outside the grid does not leave a phantom drag behind', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await settleWeek(page);
  const box = (await gridOf(page).boundingBox())!;
  const inside = { x: box.x + box.width / 2, y: box.y + 60 };
  const outside = { x: box.x + box.width / 2, y: box.y - 120 };

  await page.mouse.move(inside.x, inside.y);
  await page.mouse.down();
  await page.mouse.move(inside.x + 2, inside.y);
  await page.mouse.move(outside.x, outside.y);
  await page.mouse.up();
  const before = await scrollLeftOf(page);

  await page.mouse.move(inside.x, inside.y, { steps: 3 });
  await page.mouse.move(inside.x + 60, inside.y, { steps: 6 });
  await page.waitForTimeout(100);
  expect(await scrollLeftOf(page)).toBe(before);
  await expect(gridOf(page)).not.toHaveClass(/dragging/);
});

test('keyboard scrolls the focused grid by day and by week', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  const grid = gridOf(page);
  await settleWeek(page);
  await grid.focus();

  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scrollLeftOf(page)).toBe(1440);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => scrollLeftOf(page)).toBe(1248);
  await page.keyboard.press('PageUp');
  await expect.poll(() => scrollLeftOf(page)).toBe(576);

  await page.keyboard.press('Home');
  await expect.poll(() => scrollLeftOf(page)).toBe(0);
  await expect(grid).toBeFocused();
  await expect(weekLabel(page)).toHaveText('12/10 – 18/10/2026');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);
  expect(await scrollLeftOf(page)).toBe(0);

  await page.keyboard.press('End');
  const atMax = () => grid.evaluate(el => el.scrollLeft === el.scrollWidth - el.clientWidth);
  await expect.poll(atMax).toBe(true);
  await expect(weekLabel(page)).toHaveText('02/11 – 08/11/2026');
  await expect(grid).toBeFocused();
  const max = await scrollLeftOf(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(100);
  expect(await scrollLeftOf(page)).toBe(max);
});

test('keys pressed inside a cell are not taken by the grid', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await settleWeek(page);
  await cellOf(page, /^Lê Hoàng Nam, Thứ Ba 27\/10:/).focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(100);
  expect(await scrollLeftOf(page)).toBe(1344);
});

test('end of the grid keeps names and totals in view', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/admin/cham-cong');
  const grid = gridOf(page);
  await expect(rowsOf(page)).toHaveCount(11);
  await grid.focus();
  await page.keyboard.press('End');
  await expect(weekLabel(page)).toHaveText('02/11 – 08/11/2026');

  const frame = (await grid.boundingBox())!;
  const inside = async (locator: ReturnType<Page['locator']>) => {
    const b = (await locator.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(b.x + b.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
  };
  await inside(page.getByText('Nguyễn Thu Hà', { exact: true }));
  await inside(page.locator('thead th.s3'));
  await inside(page.locator('thead th.dc', { hasText: '08/11' }));
});

for (const width of [375, 768, 1024, 1440]) {
  test(`grid scrolls inside its own region at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/cham-cong');
    const grid = gridOf(page);
    await expect(rowsOf(page)).toHaveCount(11);

    await expect(grid).toHaveAttribute('tabindex', '0');
    await grid.focus();
    await expect(grid).toBeFocused();

    const sizes = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(sizes.doc).toBeLessThanOrEqual(sizes.inner);
    expect(await grid.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);

    const nm = (await page.locator('thead th.nm').boundingBox())!;
    expect(Math.abs(nm.width - (width === 375 ? 140 : 220))).toBeLessThanOrEqual(1);
    await expect(page.locator('thead th.s3')).toHaveCSS('position', width === 375 ? 'static' : 'sticky');
  });
}

test('day columns are exactly 96px once fonts have loaded', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await expect(rowsOf(page)).toHaveCount(11);
  await page.evaluate(() => document.fonts.ready);

  const m = await page.evaluate(() => {
    const table = document.querySelector('table.tw') as HTMLElement;
    const base = table.getBoundingClientRect().left;
    const widths = [...table.querySelectorAll('thead th.dc')].map(th => th.getBoundingClientRect().width);
    const today = (table.querySelector('th[data-date="2026-10-26"]') as HTMLElement).getBoundingClientRect().left - base;
    const cols = [...table.querySelectorAll('col')].map(c => c.getBoundingClientRect().width);
    return { widths, today, table: table.getBoundingClientRect().width, cols };
  });
  expect(m.widths).toHaveLength(28);
  for (const w of m.widths) expect(Math.abs(w - 96)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(m.today - 220 - 1344)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(m.table - 3100)).toBeLessThanOrEqual(0.5);
});

test('keyboard focus ring on a day pill is drawn inside its cell, in a colour the pill does not swallow', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await settleWeek(page);
  await page.keyboard.press('Shift'); // lần focus sau tính là bàn phím nên :focus-visible bật

  for (const kind of ['work', 'late', 'leave', 'absent', 'todo']) {
    const pill = page.locator(`tbody td.dc button.pill.${kind}`).first();
    await pill.focus();
    const r = await pill.evaluate(el => {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const cell = el.closest('td')!.getBoundingClientRect();
      // Mép ngoài của vòng focus: hộp pill nở ra (độ dày + khoảng cách); âm nghĩa là vòng nằm trong pill.
      const grow = Math.max(0, parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset));
      return {
        focused: el.matches(':focus-visible'),
        width: cs.outlineWidth,
        style: cs.outlineStyle,
        offset: parseFloat(cs.outlineOffset),
        ring: cs.outlineColor,
        fill: cs.backgroundColor,
        inside:
          box.left - grow >= cell.left - 0.01 &&
          box.right + grow <= cell.right + 0.01 &&
          box.top - grow >= cell.top - 0.01 &&
          box.bottom + grow <= cell.bottom + 0.01
      };
    });
    expect(r.focused, kind).toBe(true);
    expect(r.style, kind).toBe('solid');
    expect(r.width, kind).toBe('2px');
    expect(r.offset, kind).toBeLessThan(0);
    expect(r.inside, `${kind} ring stays inside its cell`).toBe(true);
    expect(r.ring, `${kind} ring differs from the pill colour`).not.toBe(r.fill);
  }
});

// Cột ngày co giãn theo bề rộng vùng cuộn: bề rộng đo được là số thật, không phải hằng 96.
const dayWidthOf = (page: Page) => page.locator('thead th.dc').first().evaluate(el => el.getBoundingClientRect().width);

test('on a wide screen the day columns stretch so seven days fill the card', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/admin/cham-cong?thang=2026-10');
  await expect(rowsOf(page)).toHaveCount(11);
  await page.evaluate(() => document.fonts.ready);
  const grid = gridOf(page);

  // Vùng cuộn lấp đầy thẻ, không còn dải trắng bên phải.
  const gap = await grid.evaluate(el => {
    const card = el.parentElement!.getBoundingClientRect();
    return card.right - el.getBoundingClientRect().right;
  });
  expect(Math.abs(gap)).toBeLessThan(2);

  const colW = await dayWidthOf(page);
  expect(colW).toBeGreaterThan(96);
  expect(colW % 1).toBe(0);

  // Đúng 7 ô tiêu đề ngày nằm trọn trong vùng nhìn thấy (giữa cột tên và cột tổng).
  const visible = () =>
    page.evaluate(() => {
      const nm = document.querySelector('thead th.nm')!.getBoundingClientRect();
      const s1 = document.querySelector('thead th.s1')!.getBoundingClientRect();
      const scr = document.querySelector('.scr')!.getBoundingClientRect();
      return [...document.querySelectorAll('thead th.dc')]
        .map(th => ({ t: th.querySelector('.wd')!.textContent!.trim().slice(0, 2), r: th.getBoundingClientRect() }))
        .filter(({ r }) => r.left >= nm.right - 0.5 && r.right <= s1.left + 0.5 && r.left >= scr.left && r.right <= scr.right)
        .map(({ t }) => t);
    });
  await expect(weekLabel(page)).toHaveText('26/10 – 01/11/2026');
  expect(await visible()).toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);

  // Tuần sau đi đúng 7 ngày; bảng chạm mép phải vùng cuộn khi cuộn hết.
  await page.getByRole('button', { name: 'Tuần trước' }).click();
  await expect(weekLabel(page)).toHaveText('19/10 – 25/10/2026');
  const before = await scrollLeftOf(page);
  await page.getByRole('button', { name: 'Tuần sau' }).click();
  await expect(weekLabel(page)).toHaveText('26/10 – 01/11/2026');
  await expect.poll(() => scrollLeftOf(page)).toBe(before + 7 * colW);

  await grid.focus();
  await page.keyboard.press('End');
  await expect(weekLabel(page)).toHaveText('02/11 – 08/11/2026');
  const edge = await page.evaluate(() => {
    const scr = document.querySelector('.scr')!.getBoundingClientRect();
    return scr.right - document.querySelector('thead th.s3')!.getBoundingClientRect().right;
  });
  expect(Math.abs(edge)).toBeLessThan(2);
});

for (const width of [1024, 375]) {
  test(`day columns stay 96px at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/cham-cong?thang=2026-10');
    await expect(rowsOf(page)).toHaveCount(11);
    await page.evaluate(() => document.fonts.ready);
    expect(await dayWidthOf(page)).toBe(96);
    await expect.poll(() => scrollLeftOf(page)).toBe(14 * 96);
  });
}

test('resizing keeps the week in view, re-snaps to a column and never writes the URL', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/admin/cham-cong?thang=2026-10');
  await expect(rowsOf(page)).toHaveCount(11);
  const wide = await dayWidthOf(page);
  await expect.poll(() => scrollLeftOf(page)).toBe(14 * wide);

  // Đổi cỡ khi chưa rời tuần hôm nay: không ghi ?tuan.
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect.poll(async () => (await dayWidthOf(page)) !== wide).toBe(true);
  const mid = await dayWidthOf(page);
  await expect.poll(() => scrollLeftOf(page)).toBe(14 * mid);
  await expect(weekLabel(page)).toHaveText('26/10 – 01/11/2026');
  await page.waitForTimeout(300);
  expect(new URL(page.url()).searchParams.has('tuan')).toBe(false);

  // Về tuần 12/10 rồi đổi cỡ: nhãn vẫn là 12/10 và vẫn nằm đúng cột.
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect.poll(async () => await dayWidthOf(page)).toBe(wide);
  await gridOf(page).focus();
  await page.keyboard.press('Home');
  await expect(weekLabel(page)).toHaveText('12/10 – 18/10/2026');
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect.poll(async () => await dayWidthOf(page)).toBe(mid);
  await expect(weekLabel(page)).toHaveText('12/10 – 18/10/2026');
  await expect.poll(() => scrollLeftOf(page)).toBe(0);
});

test('a name opened right after the grid scrolled still reaches the profile while its page is loading', async ({ page }) => {
  // Trang hồ sơ nạp chậm: lần ghi ?tuan (120ms sau cú cuộn) rơi vào lúc điều hướng còn dở và không được huỷ nó.
  await page.route('**/AttendanceEmployeeView.vue*', async route => {
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.goto('/admin/cham-cong?thang=2026-10');
  await settleWeek(page);
  await gridOf(page).evaluate(async el => {
    el.scrollLeft -= 3 * 96;
    await new Promise(resolve => setTimeout(resolve, 40));
    (el.querySelector('tbody th.nm a') as HTMLElement).click();
  });
  await expect(page).toHaveURL(/\/admin\/cham-cong\/nhan-vien\/nguyen-thu-ha/);
});
