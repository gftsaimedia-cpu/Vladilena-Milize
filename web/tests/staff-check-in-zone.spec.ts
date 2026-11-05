import { expect, test, type Page } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

const OFFICE = { latitude: 10.7769, longitude: 106.7009 };
const FAR = { latitude: 10.782296, longitude: 106.7009 }; // 600 m về phía bắc
const PARTS = '/tests/fixtures/staff-parts.html';

// Bọc navigator.geolocation để đếm: started = số lần xin vị trí, active = số watch còn chạy. hang = không bao giờ trả vị trí.
async function trackGeo(page: Page, hang = false) {
  await page.addInitScript(hangs => {
    const g = navigator.geolocation;
    const ids = new Set<number>();
    const state = { started: 0, active: 0 };
    (window as any).__geo = state;
    const watch = g.watchPosition.bind(g);
    const clear = g.clearWatch.bind(g);
    const get = g.getCurrentPosition.bind(g);
    g.watchPosition = (ok, err, opts) => {
      state.started++;
      const id = hangs ? 1000 + state.started : watch(ok, err, opts);
      ids.add(id);
      state.active = ids.size;
      return id;
    };
    g.clearWatch = id => {
      if (!hangs) clear(id);
      ids.delete(id);
      state.active = ids.size;
    };
    g.getCurrentPosition = (ok, err, opts) => {
      state.started++;
      if (!hangs) get(ok, err, opts);
    };
  }, hang);
}
const geo = (page: Page) => page.evaluate(() => (window as any).__geo as { started: number; active: number });

test('outside the zone the punch button is locked with the distance', async ({ page, context }) => {
  await context.setGeolocation(FAR);
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card.getByRole('button', { name: /Check-out/ })).toBeDisabled();
  await expect(card).toContainText('Bạn đang cách văn phòng 600 m');
});

test.describe('without location permission', () => {
  test.use({ permissions: [] });
  test('the punch button is locked with Không lấy được vị trí', async ({ page }) => {
    await openPhone(page, '/nv/hom-nay');
    const card = page.getByRole('region', { name: 'Ca hôm nay' });
    await expect(card).toContainText('Không lấy được vị trí');
    await expect(card.getByRole('button', { name: /Check-out/ })).toBeDisabled();
  });

  test('Thử lại asks again: after granting the permission the button unlocks', async ({ page, context }) => {
    await openPhone(page, '/nv/hom-nay');
    const card = page.getByRole('region', { name: 'Ca hôm nay' });
    await expect(card).toContainText('Không lấy được vị trí');
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(OFFICE);
    await card.getByRole('button', { name: 'Thử lại' }).click();
    await expect(card.getByRole('button', { name: /Check-out/ })).toBeEnabled();
    await expect(card).not.toContainText('Không lấy được vị trí');
    await expect(card.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
  });
});

test('Thử lại shows only when the position cannot be read', async ({ page, context }) => {
  await context.setGeolocation(FAR);
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card).toContainText('Bạn đang cách văn phòng 600 m');
  await expect(card.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
});

test('the lock follows the position: walking into the zone unlocks without a reload', async ({ page, context }) => {
  await context.setGeolocation(FAR);
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card.getByRole('button', { name: /Check-out/ })).toBeDisabled();
  await expect(card).toContainText('Bạn đang cách văn phòng 600 m');
  await context.setGeolocation(OFFICE);
  await expect(card.getByRole('button', { name: /Check-out/ })).toBeEnabled();
  await expect(card).not.toContainText('Bạn đang cách văn phòng');
});

test('while the position is pending the card says Đang lấy vị trí… and the button is disabled', async ({ page }) => {
  await trackGeo(page, true);
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card).toContainText('Đang lấy vị trí…');
  await expect(card.getByRole('button', { name: /Check-out/ })).toBeDisabled();
});

test('at the office the button works as before', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card.getByRole('button', { name: /Check-out/ })).toBeEnabled();
  await expect(card).toContainText('Đúng vị trí văn phòng GFT');
});

test('the desktop page locks the same way', async ({ page, context }) => {
  await context.setGeolocation(FAR);
  await openPhone(page, '/nv/hom-nay', { width: 1280, height: 900 });
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card).toContainText('Bạn đang cách văn phòng 600 m');
  await expect(card.getByRole('button', { name: /Check-out/ })).toBeDisabled();
});

test('the watch is cleared when the button stops showing', async ({ page }) => {
  await trackGeo(page);
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card.getByRole('button', { name: /Check-out/ })).toBeEnabled();
  expect(await geo(page)).toEqual({ started: 1, active: 1 });
  await card.getByRole('button', { name: /Check-out/ }).click();
  await expect(card.getByRole('button', { name: /Check-out/ })).toHaveCount(0);
  expect(await geo(page)).toEqual({ started: 1, active: 0 });
});

test('a finished shift asks for no location', async ({ page }) => {
  await trackGeo(page);
  await page.goto(`${PARTS}?part=shift&zone=1&out=17:05`);
  await expect(page.getByRole('region', { name: 'Ca hôm nay' })).toContainText('Đã check-out');
  expect(await geo(page)).toEqual({ started: 0, active: 0 });
});

test('a shift with a button and a zone asks for the location once and keeps it watched', async ({ page }) => {
  await trackGeo(page);
  await page.goto(`${PARTS}?part=shift&zone=1`);
  await expect(page.getByRole('button', { name: /Check-out/ })).toBeEnabled();
  expect(await geo(page)).toEqual({ started: 1, active: 1 });
});
