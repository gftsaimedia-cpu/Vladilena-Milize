import { expect, test, type Page } from '@playwright/test';

const summary = {
  month: '2026-11',
  weights: { wework: 40, user: 20, peer: 10, manager: 20, self: 10 },
  items: [
    {
      username: 'an',
      name: 'An Nguyễn',
      type: 'nv',
      level: 1,
      scores: { wework: 90, user: 90, peer: 90, manager: 90, self: 90 },
      complete: true,
      pass: true,
      total: 90,
      kpiMax: 2_000_000,
      amtApproved: 1_800_000
    },
    {
      username: 'binh',
      name: 'Bình Trần',
      type: 'nv',
      level: 2,
      scores: { wework: 80, user: null, peer: null, manager: null, self: null },
      complete: false,
      pass: false,
      total: null,
      kpiMax: 2_000_000,
      amtProposed: 0
    }
  ]
};

async function mockKpiApi(page: Page, empty = false) {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api', '');
    let body: Record<string, unknown> = {};
    if (path === '/me') {
      body = {
        user: { username: 'demo_admin', name: 'Demo Admin', role: 'admin' },
        roles: ['admin'],
        caps: ['config.read', 'audit.read'],
        payrollSubject: true,
        serverNow: '2026-11-03T12:00:00.000Z'
      };
    } else if (path === '/kpi/scores') {
      body = empty ? { ...summary, items: [] } : summary;
    } else if (path === '/audit') {
      body = {
        rows: [
          {
            id: 8,
            action: 'kpi.score',
            subject: 'an',
            at: '2026-11-02T08:00:00.000Z',
            actor: 'demo_admin'
          }
        ]
      };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

for (const width of [375, 1440]) {
  test.fixme(
    `KPI operations and settings stay distinct at ${width}px`,
    { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Đánh giá KPI (đợt sau)' } },
    async ({ page }) => {
      await mockKpiApi(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/kpi?thang=2026-11');

      await expect(page.getByRole('heading', { name: 'Đánh giá KPI' })).toBeVisible();
      await expect(page.getByText('1/2 người đạt, 1 người chưa chấm đủ')).toBeVisible();
      await expect(page.locator('.kpis').getByText('1.800.000₫', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Quy tắc KPI' })).toHaveAttribute('href', '/admin/cai-dat/kpi');

      await page.getByRole('link', { name: /Lịch sử sửa điểm/ }).click();
      await expect(page).toHaveURL('/admin/kpi/lich-su?thang=2026-11');
      await expect(page.getByRole('heading', { name: 'Lịch sử sửa điểm tháng 11' })).toBeVisible();
      await expect(page.getByText('An Nguyễn')).toBeVisible();
    }
  );

  test.fixme(
    `KPI no-data state is distinct at ${width}px`,
    { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Đánh giá KPI (đợt sau)' } },
    async ({ page }) => {
      await mockKpiApi(page, true);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/kpi?thang=2026-11');

      await expect(
        page.locator('.title').getByText('Chưa có dữ liệu KPI của tháng này', { exact: true })
      ).toBeVisible();
      await expect(page.getByText(/người đạt, .*người chưa chấm đủ/)).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Quy tắc KPI' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Lịch sử sửa điểm/ })).toBeVisible();
    }
  );
}
