import type { Page } from '@playwright/test';

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
