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

for (const screen of [
  { path: '/nv/cham-cong', previousData: '.stats', query: '/sheet?month=2026-10' },
  { path: '/nv/thu-nhap', previousData: '.slip', query: '/me/estimate?month=2026-10' }
]) {
  test.fixme(
    `${screen.path} hides the previous month's values while the new month request is pending or fails`,
    { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Cổng nhân viên (đợt sau)' } },
    async ({ page }) => {
      let releaseRequest: () => void = () => {};
      let monthAttempts = 0;
      const requestGate = new Promise<void>(resolve => (releaseRequest = resolve));
      await page.setViewportSize({ width: 375, height: 812 });
      await mockStaffApi(
        page,
        { [screen.query]: 1 },
        {
          requestGates: { [screen.query]: requestGate },
          onRequest: key => {
            if (key === screen.query) monthAttempts++;
          }
        }
      );
      await page.goto(screen.path);
      await expect(page.locator(screen.previousData)).toBeVisible();

      await page.getByRole('button', { name: 'Tháng trước' }).click();
      await expect(page.getByText('Tháng 10/2026')).toBeVisible();
      await expect(page.getByRole('status')).toContainText('Đang tải dữ liệu');
      await expect(page.locator(screen.previousData)).toHaveCount(0);
      await expect.poll(() => monthAttempts).toBe(1);
      releaseRequest();
      await expect(page.getByRole('alert')).toContainText('Máy chủ trả lỗi 500');
      await expect(page.locator(screen.previousData)).toHaveCount(0);
      expect(monthAttempts).toBe(1);
    }
  );
}

for (const screen of [
  { path: '/nv/cham-cong', oldMonthContent: '.stats', query: '/sheet?month=2026-10' },
  { path: '/nv/thu-nhap', oldMonthContent: '.slip', query: '/me/estimate?month=2026-10' }
]) {
  test.fixme(
    `${screen.path} can return to the last loaded month after the new month fails`,
    { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Cổng nhân viên (đợt sau)' } },
    async ({ page }) => {
      let releaseRequest: () => void = () => {};
      const requestGate = new Promise<void>(resolve => (releaseRequest = resolve));
      await page.setViewportSize({ width: 375, height: 812 });
      await mockStaffApi(page, { [screen.query]: 1 }, { requestGates: { [screen.query]: requestGate } });
      await page.goto(screen.path);
      await expect(page.locator(screen.oldMonthContent)).toBeVisible();
      await page.getByRole('button', { name: 'Tháng trước' }).click();
      await expect(page.getByText('Tháng 10/2026')).toBeVisible();
      await expect(page.locator(screen.oldMonthContent)).toHaveCount(0);
      releaseRequest();
      await expect(page.getByRole('alert')).toContainText('Máy chủ trả lỗi 500');

      await page.getByRole('button', { name: /Quay lại Tháng 11\/2026/ }).click();
      await expect(page.getByText('Tháng 11/2026')).toBeVisible();
      await expect(page.locator(screen.oldMonthContent)).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
  );
}

for (const path of ['/nv/cham-cong', '/nv/thu-nhap']) {
  test.fixme(
    `${path} handles month context 500 with retry and no unhandled rejection`,
    { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Cổng nhân viên (đợt sau)' } },
    async ({ page }) => {
      const pageErrors: string[] = [];
      let meRequests = 0;
      await page.setViewportSize({ width: 375, height: 812 });
      page.on('pageerror', error => pageErrors.push(error.message));
      await mockStaffApi(
        page,
        {},
        {
          failAt: { '/me': [2] },
          onRequest: key => {
            if (key === '/me') meRequests++;
          }
        }
      );
      await page.goto(path);
      await expect(page.getByRole('alert')).toContainText('Máy chủ trả lỗi 500');
      await expect(pageErrors).toEqual([]);
      expect(meRequests).toBe(2);
      await page.getByRole('button', { name: 'Thử lại' }).click();
      await expect(page.locator(path.endsWith('cham-cong') ? '.stats' : '.slip')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(pageErrors).toEqual([]);
      expect(meRequests).toBe(3);
    }
  );
}

test.fixme(
  'home disables check-in while a slow request is pending and prevents duplicate punches',
  { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Cổng nhân viên (đợt sau)' } },
  async ({ page }) => {
    let punchPosts = 0;
    let releasePunch: () => void = () => {};
    const punchGate = new Promise<void>(resolve => (releasePunch = resolve));
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success: (position: unknown) => void) {
            success({ coords: { latitude: 10.7, longitude: 106.6, accuracy: 9 }, timestamp: Date.now() });
          }
        }
      });
    });
    await mockStaffApi(page, {}, { me: { geofenceRequired: false }, punchGate, onPunch: () => punchPosts++ });
    await page.goto('/nv/hom-nay');
    const checkIn = page.locator('.cta');
    const firstClick = checkIn.click();
    await expect.poll(() => punchPosts).toBe(1);
    await expect(checkIn).toBeDisabled();
    await expect(checkIn).toContainText('Đang xử lý');
    await checkIn.click({ force: true });
    expect(punchPosts).toBe(1);
    releasePunch();
    await firstClick;
    await expect(checkIn).toBeEnabled();
    expect(punchPosts).toBe(1);
  }
);

test.fixme(
  'GPS denied explains the check-in block and sends no punch request',
  { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Cổng nhân viên (đợt sau)' } },
  async ({ page }) => {
    let punchPosts = 0;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(_success: unknown, failure: (error: { code: number }) => void) {
            failure({ code: 1 });
          }
        }
      });
    });
    await mockStaffApi(page, {}, { onPunch: () => punchPosts++ });
    await page.goto('/nv/hom-nay');
    await page.getByRole('button', { name: /Check-in/ }).click();
    await expect(page.locator('.gps').filter({ hasText: 'Không lấy được vị trí' })).toBeVisible();
    expect(punchPosts).toBe(0);
  }
);

test.fixme(
  'GPS grant sends coordinates for check-in; check-out sends one request with the open session id',
  { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Cổng nhân viên (đợt sau)' } },
  async ({ page }) => {
    const punchBodies: any[] = [];
    let shiftState: 'not-started' | 'working' = 'not-started';
    let releaseIn: () => void = () => {};
    let releaseOut: () => void = () => {};
    const inGate = new Promise<void>(resolve => (releaseIn = resolve));
    const outGate = new Promise<void>(resolve => (releaseOut = resolve));
    const postedTypes: string[] = [];
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success: (position: unknown) => void) {
            success({ coords: { latitude: 10.7, longitude: 106.6, accuracy: 9 }, timestamp: Date.now() });
          }
        }
      });
    });
    await mockStaffApi(
      page,
      {},
      {
        punchGates: { in: inGate, out: outGate },
        onPunch: type => postedTypes.push(type || ''),
        punchReply: body => {
          punchBodies.push(body);
          if (body.type === 'in') shiftState = 'working';
          return { ok: true, serverNow: '2026-11-03T12:01:00.000Z' };
        },
        punchState: () =>
          shiftState === 'working'
            ? {
                ...punch,
                open: { id: 'open-session-1', since: '19:00', at: '2026-11-03T12:00:00.000Z' }
              }
            : punch
      }
    );
    await page.goto('/nv/hom-nay');
    const checkIn = page.locator('.cta');
    const inClick = checkIn.click();
    await expect.poll(() => postedTypes.filter(type => type === 'in').length).toBe(1);
    await expect(checkIn).toBeDisabled();
    await expect(checkIn).toContainText('Đang xử lý');
    await checkIn.click({ force: true });
    expect(postedTypes.filter(type => type === 'in')).toHaveLength(1);
    releaseIn();
    await inClick;
    await expect.poll(() => punchBodies.length).toBe(1);
    await expect(page.getByRole('button', { name: /Check-out/ })).toBeVisible();
    expect(punchBodies[0].location).toEqual({ lat: 10.7, lng: 106.6, accuracy: 9 });

    const checkOut = page.locator('.cta');
    const outClick = checkOut.click();
    await expect.poll(() => postedTypes.filter(type => type === 'out').length).toBe(1);
    await expect(checkOut).toBeDisabled();
    await expect(checkOut).toContainText('Đang xử lý');
    await checkOut.click({ force: true });
    expect(postedTypes.filter(type => type === 'out')).toHaveLength(1);
    releaseOut();
    await outClick;
    await expect.poll(() => punchBodies.length).toBe(2);
    expect(punchBodies[1]).toMatchObject({ type: 'out', sessionId: 'open-session-1' });
  }
);

test.fixme(
  'request deep link closes back to the same path and preserves unrelated query keys',
  { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Cổng nhân viên (đợt sau)' } },
  async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockStaffApi(page);
    await page.goto('/nv/yeu-cau?hop=xin-nghi&kb=linh&keep=1');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveURL(/hop=xin-nghi/);
    await page.locator('.ph-sheet .sheet-close').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?kb=linh&keep=1/);
    await expect(page.getByText('Yêu cầu của tôi')).toBeVisible();
  }
);

const phoneScreens = [
  { path: '/nv/hom-nay', failure: '/punch', failCount: 1, loaded: '.home' },
  { path: '/nv/cham-cong', failure: '/sheet', failCount: 1, loaded: '.stats' },
  { path: '/nv/yeu-cau', failure: '/sheet', failCount: 1, loaded: '.req' },
  { path: '/nv/thu-nhap', failure: '/me/estimate', failCount: 1, loaded: '.slip' },
  { path: '/nv/toi', failure: '/punch', failCount: 1, loaded: '.toi' }
];

for (const screen of phoneScreens) {
  test.fixme(
    `phone ${screen.path} presents retry after 500 and loads after 200`,
    { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Cổng nhân viên (đợt sau)' } },
    async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await mockStaffApi(page, { [screen.failure]: screen.failCount });
      await page.goto(screen.path);

      await expect(page.getByRole('alert')).toContainText('Máy chủ trả lỗi 500');
      const retry = page.getByRole('button', { name: 'Thử lại' });
      await expect(retry).toBeVisible();
      await retry.click();
      await expect(page.locator(screen.loaded)).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);

      const tabs = page.getByRole('navigation', { name: 'Điều hướng' }).getByRole('link');
      await expect(tabs).toHaveCount(5);
      await expect(tabs).toHaveText(['Hôm nay', 'Chấm công', 'Yêu cầu', 'Thu nhập', 'Tôi']);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBe(0);
    }
  );
}

test.fixme(
  'nested staff sheets trap focus and Escape closes only the top sheet',
  { annotation: { type: 'fixme', description: 'Chờ dữ liệu giả cho màn Cổng nhân viên (đợt sau)' } },
  async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockStaffApi(page);
    await page.goto('/nv/cham-cong');
    const day = page.getByRole('button', { name: '2', exact: true });
    await day.click();
    const dialogs = page.getByRole('dialog');
    await expect(dialogs).toHaveCount(1);
    await page.getByRole('button', { name: 'Giải trình lượt này' }).click();
    await expect(dialogs).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Đóng' }).last()).toBeFocused();
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');

    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Gửi giải trình' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialogs).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Giải trình lượt này' })).toBeFocused();
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');

    await page.locator('.ph-sheet .sheet-close').click();
    await expect(dialogs).toHaveCount(0);
    await expect(day).toBeFocused();
    await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
  }
);

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
