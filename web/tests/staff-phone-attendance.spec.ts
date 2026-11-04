import { expect, test, type Locator, type Page } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

const cal = (page: Page) => page.getByRole('region', { name: 'Lịch tháng 10' });
const recent = (page: Page) => page.locator('section', { has: page.getByRole('heading', { name: 'Gần đây' }) });
const day = (page: Page) => page.getByRole('dialog');
const kv = (sheet: Locator, key: string) =>
  sheet.locator('.kv', { has: sheet.page().getByText(key, { exact: true }) }).locator('.v');

test('Chấm công makes no /api call', async ({ page }) => {
  const calls = await openPhone(page, '/nv/cham-cong?ngay=2026-10-27');
  await expect(day(page)).toBeVisible();
  expect(calls).toEqual([]);
});

test('header, month switch and the three tiles follow J2', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chấm công');
  await expect(page.getByText('Ca HC 08:00–17:00 · thứ Hai – thứ Bảy')).toBeVisible();
  await expect(page.getByText('Tháng 10/2026')).toBeVisible();
  await expect(page.getByText('Kỳ công đang mở')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tháng trước' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tháng sau' })).toBeDisabled();
  const tiles = page.getByRole('group', { name: 'Chỉ số tháng 10' });
  await expect(tiles).toContainText('21 / 26');
  await expect(tiles).toContainText('Ngày công');
  await expect(tiles).toContainText('Lần đi muộn');
  await expect(tiles).toContainText('Ngày nghỉ có lương');
});

test('calendar paints October by group and only days with data are buttons', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  await expect(cal(page).getByRole('button')).toHaveCount(24);
  await expect(cal(page).getByRole('img')).toHaveCount(7);
  await expect(cal(page).getByRole('button', { name: 'Thứ Năm 01/10: đi làm' })).toHaveClass(/work/);
  await expect(cal(page).getByRole('button', { name: 'Thứ Hai 12/10: nghỉ có lương' })).toHaveClass(/leave/);
  await expect(cal(page).getByRole('button', { name: 'Thứ Bảy 17/10: nghỉ có lương' })).toHaveClass(/leave/);
  await expect(cal(page).getByRole('button', { name: 'Thứ Ba 27/10: cần xử lý' })).toHaveClass(/todo/);
  await expect(cal(page).getByRole('button', { name: 'Hôm nay, thứ Tư 28/10: đang làm' })).toHaveClass(/today/);
  await expect(cal(page).getByRole('img', { name: 'Chủ nhật 04/10: không có ca' })).toBeVisible();
  await expect(cal(page).getByRole('img', { name: 'Thứ Năm 29/10: chưa tới' })).toBeVisible();
  for (const t of ['Đi làm', 'Đi muộn', 'Nghỉ có lương', 'Cần xử lý']) await expect(cal(page)).toContainText(t);
});

test('Gần đây lists the five latest days with times', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  await expect(page.getByRole('heading', { name: 'Gần đây' })).toBeVisible();
  await expect(recent(page).getByRole('button')).toHaveText([
    /Thứ Tư 28\/10\s*07:59 – …/,
    /Thứ Ba 27\/10\s*08:12 – \?/,
    /Thứ Hai 26\/10\s*07:56 – 17:10/,
    /Thứ Bảy 24\/10\s*07:52 – 17:04/,
    /Thứ Sáu 23\/10\s*07:58 – 17:02/
  ]);
});

test('27/10 sheet shows the late check-in and the pending explanation, then closes back', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  const cell = cal(page).getByRole('button', { name: 'Thứ Ba 27/10: cần xử lý' });
  await cell.click();
  await expect(page).toHaveURL(/\?ngay=2026-10-27$/);
  const sheet = page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' });
  await expect(sheet).toContainText('Ca HC 08:00–17:00');
  await expect(sheet).toContainText('Cần xử lý');
  await expect(kv(sheet, 'Giờ vào')).toHaveText('08:12');
  await expect(kv(sheet, 'Giờ ra')).toHaveText('Chưa có');
  await expect(kv(sheet, 'Đi muộn')).toHaveText('12 phút');
  await expect(sheet).toContainText('Đã gửi giải trình lúc 20:14');
  await expect(sheet).toContainText('Giờ ra khai 17:30 · chờ Admin duyệt');
  await expect(sheet).toContainText('12:30');
  await sheet.getByRole('button', { name: 'Đóng' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/nv\/cham-cong$/);
  await expect(cell).toBeFocused();
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
});

test('other day kinds use the same sheet', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong?ngay=2026-10-26');
  let sheet = page.getByRole('dialog', { name: 'Thứ Hai 26/10/2026' });
  await expect(sheet).toContainText('Đi làm');
  await expect(kv(sheet, 'Giờ vào')).toHaveText('07:56');
  await expect(kv(sheet, 'Giờ ra')).toHaveText('17:10');
  await expect(sheet.getByText('Đi muộn', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/ngay=/);

  await page.goto('/nv/cham-cong?ngay=2026-10-12');
  sheet = page.getByRole('dialog', { name: 'Thứ Hai 12/10/2026' });
  await expect(sheet).toContainText('Nghỉ có lương');
  await expect(kv(sheet, 'Hình thức')).toHaveText('Phép năm');
  await expect(kv(sheet, 'Thời gian')).toHaveText('Cả ngày');
  await expect(sheet.getByText('Giờ vào', { exact: true })).toHaveCount(0);

  await page.goto('/nv/cham-cong?ngay=2026-10-28');
  sheet = page.getByRole('dialog', { name: 'Thứ Tư 28/10/2026' });
  await expect(sheet).toContainText('Đang làm');
  await expect(kv(sheet, 'Giờ vào')).toHaveText('07:59');
  await expect(kv(sheet, 'Giờ ra')).toHaveText('Chưa có');
  await page.locator('.ph-sheet-scrim').click({ position: { x: 10, y: 10 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a Gần đây row opens its day', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  await recent(page).getByRole('button', { name: /Thứ Bảy 24\/10/ }).click();
  await expect(page.getByRole('dialog', { name: 'Thứ Bảy 24/10/2026' })).toBeVisible();
  await expect(page).toHaveURL(/ngay=2026-10-24/);
});

for (const bad of ['2026-10-29', '2026-10-04', 'abc']) {
  test(`?ngay=${bad} opens nothing and is dropped from the URL`, async ({ page }) => {
    await openPhone(page, `/nv/cham-cong?ngay=${bad}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chấm công');
    await expect(page).not.toHaveURL(/ngay=/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

// Ô ngày của lịch tháng co theo cột (tối đa 40px): không cuộn ngang, không thò ra khỏi thẻ, canh giữa, các ô cách nhau ≥ 6px.
for (const w of [320, 330, 360]) {
  test(`calendar cells stay inside the card at ${w}px`, async ({ page }) => {
    await openPhone(page, '/nv/cham-cong', { width: w, height: 800 });
    await expect(cal(page).locator('.dn')).toHaveCount(31);
    const m = await page.evaluate(() => {
      const card = document.querySelector('section[aria-label="Lịch tháng 10"]')!;
      const cells = [...card.querySelectorAll('.dn')].map(e => e.getBoundingClientRect());
      const c = card.getBoundingClientRect();
      const padRight = parseFloat(getComputedStyle(card).paddingRight);
      const root = document.documentElement;
      // Hàng 1 của lưới có 3 ô trống rồi 4 ô ngày (01–04), hàng 2 là 05–11 (bảy ô liền nhau).
      const row = cells.slice(4, 11);
      const gaps = row.slice(1).map((r, i) => r.left - row[i].right);
      const sunday = cells[10]; // 11/10 là Chủ nhật, cột cuối
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        lastRight: sunday.right,
        limit: c.right - padRight,
        leftGap: row[0].left - c.left,
        rightGap: c.right - sunday.right,
        minGap: Math.min(...gaps)
      };
    });
    expect(m.scrollWidth).toBe(m.clientWidth);
    expect(m.lastRight).toBeLessThanOrEqual(m.limit + 0.5);
    expect(Math.abs(m.leftGap - m.rightGap)).toBeLessThanOrEqual(1);
    expect(m.minGap).toBeGreaterThanOrEqual(6);
  });
}

test('calendar cells are exactly 40px at 390px', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  for (const i of [0, 10, 27]) {
    const box = await cal(page).locator('.dn').nth(i).boundingBox();
    expect(box!.width).toBe(40);
    expect(box!.height).toBe(40);
  }
});

test('Gần đây rows say the day status in their accessible name, not only by colour', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  await expect(recent(page).getByRole('button', { name: /Thứ Ba 27\/10/ })).toHaveAccessibleName(/Cần xử lý/);
  await expect(recent(page).getByRole('button', { name: /Thứ Tư 28\/10/ })).toHaveAccessibleName(/Đang làm/);
  await expect(recent(page).getByRole('button', { name: /Thứ Hai 26\/10/ })).toHaveAccessibleName(/Đi làm/);
});
