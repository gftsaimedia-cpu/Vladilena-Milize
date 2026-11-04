import { expect, test, type Page } from '@playwright/test';

const staff = [
  {
    username: 'linh',
    name: 'Linh Nguyễn',
    type: 'nv',
    level: 'L1',
    shiftCode: 'day',
    startDate: '2026-01-01',
    contractType: 'full-time',
    insurance: true,
    payrollSubject: true,
    locked: false,
    rev: 1
  },
  {
    username: 'minh',
    name: 'Minh Trần',
    type: 'nv',
    level: 'L2',
    shiftCode: '',
    startDate: '',
    contractType: 'part-time',
    insurance: false,
    payrollSubject: true,
    locked: true,
    rev: 1
  }
];
staff.push(
  ...Array.from({ length: 20 }, (_, index) => ({
    username: `z${String(index).padStart(2, '0')}`,
    name: `Zzz nhân sự ${String(index).padStart(2, '0')}`,
    type: 'nv',
    level: 'L1',
    shiftCode: '',
    startDate: '2026-01-01',
    contractType: 'full-time',
    insurance: true,
    payrollSubject: true,
    locked: false,
    rev: 1
  }))
);

async function mockAdminApi(
  page: Page,
  options: {
    requests?: unknown[];
    staff?: unknown[];
    caps?: string[];
  } = {}
) {
  const requestCalls: string[] = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api', '');
    const method = route.request().method();
    let body: any = {};
    if (path === '/me') {
      body = {
        user: { username: 'demo_admin', name: 'Demo Admin', role: 'admin' },
        roles: ['admin'],
        caps: options.caps ?? [
          'config.read',
          'payroll.calculate',
          'payroll.approve',
          'attendance.correct',
          'attendance.lock',
          'request.decide.*'
        ],
        payrollSubject: true,
        serverNow: '2026-11-03T12:00:00.000Z'
      };
    } else if (path === '/approvals' && method === 'GET') {
      requestCalls.push(url.search);
      body = {
        items: options.requests ?? [],
        counts: { pending: options.requests?.length ?? 0, approved: 0, rejected: 0 }
      };
    } else if (path === '/approvals/decide' && method === 'PUT') {
      body = { decided: 1 };
    } else if (path === '/staff') {
      body = { staff: options.staff ?? staff };
    } else if (path === '/positions') body = { positions: [] };
    else if (path === '/catalog/shifts') body = { shifts: [] };
    else if (path === '/settings/shifts') body = { shifts: [] };
    else if (path === '/explanations') body = { items: [], waitingForYou: 0, toRead: 0 };
    else if (path === '/today') body = { rows: [] };
    else if (/^\/periods\/\d{4}-\d{2}$/.test(path))
      body = { status: 'open', totals: { people: 2, gross: 0, net: 0, approved: 0, pending: 0, draft: 2, error: 0 } };
    else if (path === '/periods') body = { periods: [] };
    else if (path.includes('/estimates')) body = { totals: { people: 2, gross: 0, net: 0 } };
    else if (path === '/holidays') body = { dates: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return requestCalls;
}

test.fixme(
  'requests show the active period scope, retain unrelated query state, and expose selection actions',
  { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Yêu cầu (đợt sau)' } },
  async ({ page }, testInfo) => {
    const calls = await mockAdminApi(page, {
      requests: [
        { username: 'linh', date: '2026-11-02', kind: 'Đổi công', detail: 'Bổ sung giờ công', rev: 1, fingerprint: 'a' }
      ]
    });
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/yeu-cau?thang=2026-11&nv=linh&q=needle');
      await expect(page.getByRole('heading', { name: 'Yêu cầu', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /Tháng 11/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Chọn tất cả' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.grp-h').getByRole('button', { name: 'Đồng ý 1 yêu cầu' })).toBeEnabled();
      if (width === 375) await page.screenshot({ path: testInfo.outputPath('requests-375.png'), fullPage: true });
      const rowSelection = page.locator('.request-table-scroll tbody button.cb');
      await expect(rowSelection).toHaveCount(1);
      await rowSelection.click();
      await expect(page.locator('.grp-h').getByRole('button', { name: 'Đồng ý cả loạt' })).toBeDisabled();
      await rowSelection.click();
      await expect(page.locator('.grp-h').getByRole('button', { name: 'Đồng ý 1 yêu cầu' })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.getByRole('button', { name: /Mọi tháng/ }).click();
      await expect(page).toHaveURL(/\/admin\/yeu-cau\/moi-thang\?thang=2026-11&nv=linh&q=needle$/);
    }
    expect(calls.some(query => query.includes('month=2026-11'))).toBeTruthy();
  }
);

test.fixme(
  'request task groups remain limited to capabilities in the active session',
  { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Yêu cầu (đợt sau)' } },
  async ({ page }) => {
    await mockAdminApi(page, { caps: ['request.decide.advance'] });
    await page.goto('/admin/yeu-cau?thang=2026-11');
    await expect(page.getByRole('heading', { name: 'Yêu cầu', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạm ứng' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Giải trình/ })).toHaveCount(0);
  }
);
