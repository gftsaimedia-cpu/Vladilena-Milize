import { expect, test, type Page } from '@playwright/test';

const me = {
  user: {
    username: 'demo_staff',
    name: 'Linh Nguyễn',
    givenName: 'Linh',
    role: 'staff',
    shiftCode: 'day',
    startDate: '2026-01-01',
    jobTitle: 'Nhân viên'
  },
  roles: ['staff'],
  caps: [],
  payrollSubject: true,
  serverNow: '2026-11-03T12:00:00.000Z',
  positionLabel: 'Nhân viên',
  geofenceRequired: true,
  benefits: { paidLeave: true },
  holidays: []
};

const session = {
  id: 'session-1',
  date: '2026-11-02',
  state: 'closed',
  status: 'checked-out',
  entry: {
    presIn: '2026-11-02T01:00:00.000Z',
    presOut: null,
    reason: 'forgot-out',
    requestedOut: false
  }
};

const sheet = {
  month: '2026-11',
  rev: 1,
  days: {},
  approvals: {},
  actualReport: { missing: [], report: {} },
  scheduledDates: Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`),
  attendanceSessions: [session],
  workSchedule: { describe: { label: 'Thứ Hai đến Thứ Sáu' } },
  leaveBalance: { balance: 8, granted: 12, used: 4 },
  kpiParts: {}
};

const punch = {
  serverNow: me.serverNow,
  canCheckIn: true,
  open: null,
  lastSession: null,
  done: null,
  shiftConfig: { shifts: { day: { name: 'Ca ngày', start: '08:00', end: '17:00' } } }
};

const estimate = {
  m: { count: 2, total: 120000, net: { net: 120000, gross: 120000 } },
  net: { net: 120000, gross: 120000 },
  toDate: { count: 2, upTo: '2026-11-03' },
  label: 'Ước tính tạm thời'
};

function dataFor(path: string) {
  if (path === '/me') return me;
  if (path === '/punch') return punch;
  if (path === '/explanations') return { items: [], absent: [] };
  if (path.startsWith('/sheet')) return sheet;
  if (path.startsWith('/me/estimate')) return estimate;
  if (path.startsWith('/advance-approvals')) return { items: [], rev: 1 };
  return {};
}

async function mockStaffApi(
  page: Page,
  failures: Record<string, number> = {},
  options: {
    me?: Partial<typeof me>;
    punchGate?: Promise<void>;
    onPunch?: (type?: string) => void;
    failAt?: Record<string, number[]>;
    requestGates?: Record<string, Promise<void>>;
    onRequest?: (key: string) => void;
    punchReply?: (body: any) => unknown;
    punchState?: () => unknown;
    punchGates?: Record<string, Promise<void>>;
  } = {}
) {
  const hits: Record<string, number> = {};
  const queryHits: Record<string, number> = {};
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api', '');
    const requestKey = path + url.search;
    options.onRequest?.(requestKey);
    hits[path] = (hits[path] || 0) + 1;
    queryHits[requestKey] = (queryHits[requestKey] || 0) + 1;
    if (path.includes('/payslips/')) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }
    const failCount = failures[requestKey] ?? failures[path] ?? 0;
    const hitCount = failures[requestKey] === undefined ? hits[path] : queryHits[requestKey];
    if (options.requestGates?.[requestKey]) await options.requestGates[requestKey];
    if (hitCount <= failCount || options.failAt?.[path]?.includes(hits[path])) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Server temporarily unavailable' })
      });
      return;
    }
    if (path === '/punch' && route.request().method() === 'POST') {
      const postBody = route.request().postDataJSON();
      options.onPunch?.(postBody.type);
      const gate = options.punchGates?.[postBody.type] || options.punchGate;
      if (gate) await gate;
      const body = options.punchReply ? options.punchReply(postBody) : { ok: true, serverNow: me.serverNow };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      return;
    }
    const body = path === '/me' ? { ...me, ...options.me } : dataFor(path);
    const responseBody =
      path === '/punch' && route.request().method() === 'GET' && options.punchState ? options.punchState() : body;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseBody) });
  });
}

for (const [width, columnCount] of [
  [768, 1],
  [1024, 1],
  [1440, 3]
] as const) {
  test.fixme(
    `staff desktop keeps its task order without overflow at ${width}px`,
    { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Cổng nhân viên (đợt sau)' } },
    async ({ page }) => {
      await page.setViewportSize({ width, height: 960 });
      await mockStaffApi(page);
      await page.goto('/nv-may-tinh?kb=linh');
      const columns = page.locator('.pg > .col');
      await expect(columns).toHaveCount(3);
      await expect(columns.nth(0)).toContainText('Ca hôm nay');
      await expect(columns.nth(1)).toContainText('Chấm công tháng');
      await expect(columns.nth(2)).toContainText('Thu nhập');
      await expect(columns.nth(2)).toContainText('Yêu cầu');
      const metrics = await page.locator('.pg').evaluate(el => ({
        columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      }));
      expect(metrics.columns).toBe(columnCount);
      expect(metrics.pageWidth).toBe(metrics.viewportWidth);
    }
  );
}
