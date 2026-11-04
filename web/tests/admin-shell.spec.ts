import { expect, test, type Page } from '@playwright/test';

async function mockAdminApi(page: Page) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api', '');
    let body: Record<string, unknown> = {};
    if (path === '/me') {
      body = {
        user: { username: 'demo_admin', name: 'Demo Admin', role: 'admin' },
        roles: ['admin'],
        caps: [
          'config.read',
          'payroll.calculate',
          'payroll.approve',
          'attendance.correct',
          'attendance.lock',
          'audit.read'
        ],
        payrollSubject: true,
        serverNow: '2026-11-03T12:00:00.000Z'
      };
    } else if (path === '/approvals/count') body = { pending: 2 };
    else if (path === '/alerts') body = { missingPunches: [], pendingApprovals: 2 };
    else if (path === '/explanations') body = { items: [], waitingForYou: 0, toRead: 0 };
    else if (/^\/periods\/\d{4}-\d{2}$/.test(path)) body = { status: 'reviewed', needsRecalculate: true };
    else if (path === '/periods') body = { periods: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.fixme(
  'mobile admin drawer is keyboard accessible, closes on navigation and preserves queries',
  { annotation: { type: 'fixme', description: 'Viết lại ở Task 3–4 của plan khung mock' } },
  async ({ page }) => {
    await mockAdminApi(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/admin/tong-quan?thang=2026-10&q=needle&nv=staff&kb=empty');

    const toggle = page.locator('.mobile-nav-toggle');
    const sidebar = page.locator('#admin-navigation');
    const nav = page.getByRole('navigation', { name: 'Điều hướng' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAccessibleName('Mở điều hướng');
    await expect(sidebar).not.toHaveClass(/mobile-open/);
    await expect(sidebar).toHaveAttribute('inert');
    await expect(sidebar.locator('a').first()).toBeHidden();

    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAccessibleName('Đóng điều hướng');
    await expect(nav.locator('a').first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(sidebar.locator('button.me')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).toHaveAttribute('inert');
    await page.keyboard.press('Tab');
    await expect(page.locator('.period .mpick button').first()).toBeFocused();

    await toggle.click();
    await page.getByRole('link', { name: 'Cài đặt', exact: true }).click();
    await expect(page).toHaveURL('/admin/cai-dat?thang=2026-10');
    await expect(sidebar.locator('a[aria-current="page"]')).toContainText('Cài đặt');
    await page.goBack();
    await expect(page).toHaveURL('/admin/tong-quan?thang=2026-10&q=needle&nv=staff&kb=empty');
    await toggle.click();
    await page.getByRole('link', { name: 'Đánh giá KPI' }).click();
    await expect(page).toHaveURL('/admin/kpi?thang=2026-10');
    await expect(sidebar.locator('a[aria-current="page"]')).toContainText('Đánh giá KPI');
    await expect(sidebar).not.toHaveClass(/mobile-open/);

    await toggle.click();
    await page.getByRole('button', { name: /Demo Admin/ }).click();
    await expect(sidebar).not.toHaveClass(/mobile-open/);
  }
);

test('navigation drops stale hop and view queries without reopening a shell dialog', async ({ page }) => {
  await mockAdminApi(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/admin/tong-quan?thang=2026-10&hop=chuong&q=needle&nv=staff');
  await expect(page.getByRole('dialog', { name: 'Việc cần xử lý' })).toBeVisible();
  await page.getByRole('link', { name: 'Đánh giá KPI' }).click();
  await expect(page).toHaveURL('/admin/kpi?thang=2026-10');
  await expect(page.getByRole('dialog', { name: 'Việc cần xử lý' })).toHaveCount(0);
});

test('mobile drawer closes when resized to desktop', async ({ page }) => {
  await mockAdminApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/tong-quan');
  await page.locator('.mobile-nav-toggle').click();
  await expect(page.locator('#admin-navigation')).toHaveClass(/mobile-open/);
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.locator('#admin-navigation')).not.toHaveClass(/mobile-open/);
  await expect(page.locator('#admin-navigation')).not.toHaveAttribute('inert');
  await expect(page.locator('.mobile-nav-toggle')).toBeHidden();
});

for (const width of [375, 768, 1024]) {
  test(`period strip keeps controls visible and steps keyboard-scrollable at ${width}px`, async ({ page }) => {
    await mockAdminApi(page);
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/admin/tong-quan?thang=2026-10');
    const period = page.locator('.period');
    const month = period.locator('.mpick');
    const bell = period.locator('.bell');
    const steps = period.locator('.steps');
    await expect(month).toBeVisible();
    await expect(bell).toBeVisible();
    await expect(steps).toHaveAttribute('tabindex', '0');
    await expect(steps).toHaveAttribute('role', 'region');

    const status = period.locator('.state');
    await status.evaluate(el => {
      el.textContent = 'Trạng thái kỳ lương đang chờ hoàn tất phê duyệt và kiểm tra lần cuối';
    });
    const metrics = await page.evaluate(() => {
      const rect = (selector: string) => {
        const box = document.querySelector(selector)!.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };
      const stepsEl = document.querySelector<HTMLElement>('.period .steps')!;
      return {
        viewport: innerWidth,
        month: rect('.period .mpick'),
        bell: rect('.period .bell'),
        state: rect('.period .state'),
        steps: rect('.period .steps'),
        stepsClientWidth: stepsEl.clientWidth,
        stepsScrollWidth: stepsEl.scrollWidth,
        stepsOverflow: getComputedStyle(stepsEl).overflowX
      };
    });
    for (const box of [metrics.month, metrics.bell, metrics.state, metrics.steps]) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(metrics.viewport);
    }
    expect(metrics.stepsOverflow).toBe('auto');
    await steps.focus();
    await expect(steps).toBeFocused();
    await expect(page).toHaveURL(/\?thang=2026-10$/);
  });
}
