import { expect, test } from '@playwright/test';

const rows = Array.from({ length: 31 }, (_, index) => {
  const n = index + 1;
  const status = n === 1 ? 'draft' : n === 2 ? 'approved' : n === 3 ? 'error' : 'pending';
  return {
    username: `staff${n}`,
    name: `Nhân sự ${n}`,
    type: 'nv',
    level: 1,
    daysWorked: 20,
    gross: n * 100000,
    insurance: 10000,
    tax: 5000,
    advance: 2000,
    net: n * 100000 - 17000,
    tienNgayCong: n * 100000,
    phuCap: 0,
    ot: 0,
    kpi: 0,
    status,
    errorMessage: status === 'error' ? 'Thiếu dữ liệu' : undefined,
    rev: 1
  };
});

test.fixme(
  'payroll hierarchy keeps totals and every compact/wide column reachable at all widths',
  { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Bảng lương (đợt sau)' } },
  async ({ page }) => {
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api', '');
      let body: any = {};
      if (path === '/me')
        body = {
          user: { username: 'admin', name: 'Admin', role: 'admin' },
          roles: ['admin'],
          caps: ['payroll.calculate', 'payroll.approve', 'config.read'],
          payrollSubject: true
        };
      else if (/^\/periods\/\d{4}-\d{2}$/.test(path))
        body = {
          status: 'calculated',
          rev: 1,
          totals: {
            people: 31,
            gross: 49600000,
            insurance: 310000,
            tax: 155000,
            advance: 62000,
            net: 49073000,
            approved: 1,
            pending: 28,
            draft: 1,
            error: 1
          },
          run: { runNo: 2 },
          stages: { attendanceLocked: { at: '2026-10-01T00:00:00Z' }, approved: {}, paid: {} }
        };
      else if (path.includes('/payslips')) {
        const params = url.searchParams;
        const pageNo = Number(params.get('page') || 1);
        const pageSize = Number(params.get('pageSize') || 14);
        const start = (pageNo - 1) * pageSize;
        body = { rows: rows.slice(start, start + pageSize), total: 31, page: pageNo };
      } else body = {};
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/bang-luong?thang=2026-10&kb=cho-phe-duyet');
      await expect(page.getByRole('heading', { name: 'Bảng lương', exact: true })).toBeVisible();
      await expect(page.getByText('1/31 phiếu đã phê duyệt · còn 28 phiếu chờ phê duyệt')).toBeVisible();
      const compactRegion = page.getByRole('region', { name: 'Bảng lương, cuộn ngang để xem đủ cột' });
      await expect(compactRegion).toHaveAttribute('tabindex', '0');
      await expect(compactRegion.getByText('100.000', { exact: true })).toBeVisible();
      await expect(page.getByText('1–14 trên 31 phiếu')).toBeVisible();
      expect(
        await page
          .locator('.card')
          .evaluate(
            card => card.compareDocumentPosition(document.querySelector('.formula')!) & Node.DOCUMENT_POSITION_FOLLOWING
          )
      ).toBeTruthy();
      const compactSize = await compactRegion.evaluate(region => ({
        client: region.clientWidth,
        viewport: innerWidth
      }));
      expect(compactSize.client).toBeLessThanOrEqual(compactSize.viewport);

      await page.getByRole('button', { name: 'Xem đủ cột' }).click();
      await expect(page.getByRole('heading', { name: /đủ cột/ })).toBeVisible();
      await expect(compactRegion.getByRole('cell', { name: '100.000', exact: true }).first()).toBeVisible();
      const scroll = await compactRegion.evaluate(region => ({
        client: region.clientWidth,
        content: region.scrollWidth
      }));
      if (width < 1440) expect(scroll.content).toBeGreaterThanOrEqual(scroll.client);
      await compactRegion.focus();
    }
  }
);
