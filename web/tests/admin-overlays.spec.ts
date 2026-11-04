import { expect, test } from '@playwright/test';

test.describe('admin overlays', () => {
  test('wide modal and drawer fit the viewport at supported widths', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto('/tests/fixtures/admin-overlays.html');
      await page.getByRole('button', { name: 'Open modal' }).click();
      const modal = page.getByRole('dialog', { name: 'Outer modal' });
      await expect(modal).toBeVisible();
      const modalBounds = await modal.boundingBox();
      expect(modalBounds).not.toBeNull();
      expect(modalBounds!.x).toBeGreaterThanOrEqual(0);
      expect(modalBounds!.x + modalBounds!.width).toBeLessThanOrEqual(width);
      await page.getByRole('button', { name: 'Open drawer' }).click();
      const drawer = page.getByRole('dialog', { name: 'Inner drawer' });
      await expect(drawer).toBeVisible();
      const drawerBounds = await drawer.boundingBox();
      expect(drawerBounds).not.toBeNull();
      expect(drawerBounds!.x).toBeGreaterThanOrEqual(0);
      expect(drawerBounds!.x + drawerBounds!.width).toBeLessThanOrEqual(width);
    }
  });

  test('a drawer without floating keeps its inline width, full height and shadow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tests/fixtures/admin-overlays.html');
    await page.getByRole('button', { name: 'Open modal' }).click();
    await page.getByRole('button', { name: 'Open drawer' }).click();
    const drawer = page.getByRole('dialog', { name: 'Inner drawer' });
    await expect(drawer).toBeVisible();
    // Bề rộng truyền cho AppDrawer là hằng của fixture, đọc ra từ trang.
    const drawerWidth = Number(await page.locator('main').getAttribute('data-drawer-width'));
    expect(drawerWidth).toBeGreaterThan(0);
    await expect(drawer).not.toHaveClass(/floating/);
    const b = (await drawer.boundingBox())!;
    expect([Math.round(b.x + b.width), Math.round(b.y), Math.round(b.width), Math.round(b.height)]).toEqual([1440, 0, drawerWidth, 900]);
    await expect(drawer).toHaveCSS('border-top-left-radius', '0px');
    await expect(drawer).not.toHaveCSS('box-shadow', 'none');
  });

  test('focuses the top overlay, traps Tab, and restores focus through nested close', async ({ page }) => {
    await page.goto('/tests/fixtures/admin-overlays.html');
    const modalOpener = page.getByRole('button', { name: 'Open modal' });
    await modalOpener.focus();
    await page.keyboard.press('Enter');
    const modal = page.getByRole('dialog', { name: 'Outer modal' });
    const modalClose = modal.getByRole('button', { name: 'Đóng' });
    await expect(modalClose).toBeFocused();

    const drawerOpener = page.getByRole('button', { name: 'Open drawer' });
    await drawerOpener.focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'Inner drawer' });
    const drawerClose = drawer.getByRole('button', { name: 'Đóng' });
    await expect(drawerClose).toBeFocused();
    const drawerLast = page.getByRole('button', { name: 'Drawer footer action' });
    await drawerLast.focus();
    await page.keyboard.press('Tab');
    await expect(drawerClose).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(drawerLast).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(drawerOpener).toBeFocused();
    await expect(modal).toBeVisible();
    const modalLast = page.getByRole('button', { name: 'Modal footer action' });
    await modalLast.focus();
    await page.keyboard.press('Tab');
    await expect(modalClose).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(modalLast).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(modalOpener).toBeFocused();
  });

  test('preserves nested scroll lock and keeps long content and explicit close reachable', async ({ page }) => {
    await page.goto('/tests/fixtures/admin-overlays.html');
    await page.evaluate(() => {
      document.documentElement.style.overflow = 'auto';
    });
    await page.getByRole('button', { name: 'Open modal' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
    await page.getByRole('button', { name: 'Open drawer' }).click();
    await page.getByRole('button', { name: 'Drawer footer action' }).focus();
    await expect(page.getByRole('button', { name: 'Drawer footer action' })).toBeInViewport();
    await page.getByRole('button', { name: 'Đóng' }).last().click();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
    await page.getByRole('button', { name: 'Đóng' }).first().click();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('auto');
  });

  test('dismissable false blocks backdrop and Escape while retaining explicit close', async ({ page }) => {
    await page.goto('/tests/fixtures/admin-overlays.html');
    await page.getByRole('button', { name: 'Open locked modal' }).click();
    const modal = page.getByRole('dialog', { name: 'Locked modal' });
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();
    await page.locator('.ov-root > .scrim').click({ position: { x: 4, y: 4 } });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Đóng' }).click();
    await expect(modal).toHaveCount(0);
  });
});
