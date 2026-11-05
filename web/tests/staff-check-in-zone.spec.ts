import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

test('outside the zone the punch button is locked with the distance', async ({ page, context }) => {
  await context.setGeolocation({ latitude: 10.782296, longitude: 106.7009 });
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
});

test('at the office the button works as before', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card.getByRole('button', { name: /Check-out/ })).toBeEnabled();
  await expect(card).toContainText('Đúng vị trí văn phòng GFT');
});

test('the desktop page locks the same way', async ({ page, context }) => {
  await context.setGeolocation({ latitude: 10.782296, longitude: 106.7009 });
  await openPhone(page, '/nv/hom-nay', { width: 1280, height: 900 });
  await expect(page.getByRole('region', { name: 'Ca hôm nay' })).toContainText('Bạn đang cách văn phòng 600 m');
});
