import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

test('Hôm nay makes no /api call', async ({ page }) => {
  const calls = await openPhone(page, '/nv/hom-nay');
  await expect(page.getByText('Lê Hoàng Nam')).toBeVisible();
  expect(calls).toEqual([]);
});

test('greeting shows Nam and the mock date', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const hello = page.locator('header').first();
  await expect(hello).toContainText('Chào buổi sáng');
  await expect(hello).toContainText('Lê Hoàng Nam');
  await expect(hello).toContainText('Thứ Tư');
  await expect(hello).toContainText('28/10/2026');
  await expect(hello.getByText('HN', { exact: true })).toBeVisible();
});

test('today card shows the shift, worked time and the Check-out button', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card).toContainText('Ca HC · 08:00–17:00');
  await expect(card).toContainText('Đang trong ca');
  await expect(card).toContainText('1g 41p');
  await expect(card).toContainText('đã làm · vào 07:59');
  await expect(card).toContainText('08:00');
  await expect(card).toContainText('17:00');
  await expect(card.getByRole('button', { name: 'Check-out lúc 09:40' })).toBeVisible();
  await expect(card).toContainText('Đúng vị trí văn phòng GFT');
  // 101/540 của nửa vòng bán kính 100 (π·100) ≈ 58.8
  await expect(card.locator('svg path').nth(1)).toHaveAttribute('stroke-dasharray', /^58\.8 /);
});

test('Check-out records 09:40 and switches the card to the done state', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await card.getByRole('button', { name: 'Check-out lúc 09:40' }).click();
  await expect(card).toContainText('Đã check-out');
  await expect(card).toContainText('đã làm · vào 07:59 · ra 09:40');
  await expect(card).toContainText('1g 41p');
  await expect(card).not.toContainText('Đang trong ca');
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(card).not.toContainText('Đúng vị trí văn phòng GFT');
});

test('this week links days with data and marks the rest as images', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const week = page.getByRole('region', { name: 'Tuần này' });
  await expect(week).toContainText('26/10 – 01/11');
  for (const [name, date] of [
    ['Thứ Hai 26/10: đi làm', '2026-10-26'],
    ['Thứ Ba 27/10: cần xử lý', '2026-10-27'],
    ['Hôm nay, thứ Tư 28/10: đang làm', '2026-10-28']
  ]) {
    await expect(week.getByRole('link', { name, exact: true })).toHaveAttribute('href', `/nv/cham-cong?ngay=${date}`);
  }
  for (const name of [
    'Thứ Năm 29/10: chưa tới',
    'Thứ Sáu 30/10: chưa tới',
    'Thứ Bảy 31/10: chưa tới',
    'Chủ nhật 01/11: không có ca'
  ]) {
    await expect(week.getByRole('img', { name })).toBeVisible();
  }
  await expect(week.getByRole('link', { name: 'Thứ Ba 27/10: cần xử lý', exact: true })).toHaveClass(/todo/);
  await expect(week.getByRole('link', { name: 'Hôm nay, thứ Tư 28/10: đang làm' })).toHaveClass(/today/);
  await expect(week.getByRole('link', { name: '27/10 thiếu giờ ra · chờ duyệt giải trình' })).toHaveAttribute(
    'href',
    '/nv/cham-cong?ngay=2026-10-27'
  );
});

test('income card and the two latest requests link to their screens', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const income = page.getByRole('link', { name: /Thu nhập tháng 10 · tạm tính/ });
  await expect(income).toContainText('14.278.183');
  await expect(income).toHaveAttribute('href', '/nv/thu-nhap');
  await expect(page.getByRole('heading', { name: 'Yêu cầu của tôi' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute('href', '/nv/yeu-cau');
  await expect(page.getByRole('link', { name: 'Thiếu giờ ra 27/10, Chờ duyệt' })).toHaveAttribute(
    'href',
    '/nv/yeu-cau?yc=giai-trinh-2710'
  );
  await expect(page.getByRole('link', { name: 'Phép năm 12/10, Đã duyệt' })).toHaveAttribute(
    'href',
    '/nv/yeu-cau?yc=phep-1210'
  );
});

// Ô ngày của thẻ "Tuần này" co theo cột (tối đa 40px): không cuộn ngang, không thò ra khỏi thẻ, canh giữa.
for (const w of [341, 360, 375]) {
  test(`week cells stay inside the card at ${w}px`, async ({ page }) => {
    await openPhone(page, '/nv/hom-nay', { width: w, height: 800 });
    const week = page.getByRole('region', { name: 'Tuần này' });
    await expect(week.locator('.dn')).toHaveCount(7);
    const m = await page.evaluate(() => {
      const card = document.querySelector('section[aria-label="Tuần này"]')!;
      const cells = [...card.querySelectorAll('.dn')].map(e => e.getBoundingClientRect());
      const c = card.getBoundingClientRect();
      const padRight = parseFloat(getComputedStyle(card).paddingRight);
      const root = document.documentElement;
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        lastRight: cells[6].right,
        limit: c.right - padRight,
        leftGap: cells[0].left - c.left,
        rightGap: c.right - cells[6].right
      };
    });
    expect(m.scrollWidth).toBe(m.clientWidth);
    expect(m.lastRight).toBeLessThanOrEqual(m.limit + 0.5);
    expect(Math.abs(m.leftGap - m.rightGap)).toBeLessThanOrEqual(1);
  });
}

test('week cells are exactly 40px wide at 390px', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const week = page.getByRole('region', { name: 'Tuần này' });
  const box = await week.locator('.dn').nth(1).boundingBox();
  expect(box!.width).toBe(40);
  expect(box!.height).toBe(40);
});

test('Check-out by keyboard announces the new state and keeps focus on the card', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card.getByRole('status')).toHaveText('Đang trong ca');
  await card.getByRole('button', { name: 'Check-out lúc 09:40' }).focus();
  await page.keyboard.press('Enter');
  await expect(card.getByRole('status')).toHaveText('Đã check-out');
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(card).toBeFocused();
  await expect(page.locator('body')).not.toBeFocused();
});
