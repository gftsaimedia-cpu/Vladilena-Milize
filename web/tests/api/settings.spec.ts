// Cài đặt trên BE thật (playwright.api.config.ts): kho cài đặt /api/v2/settings. Tài khoản admin lấy từ PW_ADMIN_USER /
// PW_ADMIN_PASS. Test đổi cài đặt chung của công ty (nhóm số, vùng chấm công, ngày trả lương) và tạo nhân viên thử, nên chỉ chạy
// trên DB thử. Mỗi test đọc số đang lưu rồi đổi sang số khác, nên chạy lại nhiều lần trên cùng DB vẫn được.
// Vùng chấm công đặt ở OFFICE (BE không có cách xoá vùng): staff-app.spec.ts chấm công ở đúng điểm đó.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
const SUFFIX = Date.now().toString(36);
const STAFF_USER = `pw-set-${SUFFIX}`;
const STAFF_PASS = 'PwSet@12345';
const STAFF_GIVEN = `Tuần ${SUFFIX}`;
const PHONE = { width: 390, height: 844 };
const OFFICE = { latitude: 10.7769, longitude: 106.7009 };
const FAR = { latitude: 10.782296, longitude: 106.7009 }; // 600 m về phía bắc
const json = { 'Content-Type': 'application/json' };

// Ngày và tháng theo giờ Việt Nam.
const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const TODAY = vnToday();
const THIS = TODAY.slice(0, 7);
const addMonth = (ym: string, n: number) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dowOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = CN, 1 = T2 … 6 = T7
const TODAY_DOW = dowOf(TODAY);
const monthText = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
const START = addMonth(THIS, -2);
// Số theo cách gõ trên màn: dấu phẩy thập phân.
const vn = (n: number) => String(n).replace('.', ',');
const pick = (now: unknown, a: number, b: number) => (now === a ? b : a);

test.describe.configure({ mode: 'serial' });

async function asAdmin<T>(request: APIRequestContext, fn: () => Promise<T>): Promise<T> {
  const login = await request.post('/api/v2/auth/login', { headers: json, data: { username: ADMIN_USER, password: ADMIN_PASS } });
  expect(login.ok(), 'đăng nhập admin cho fixture').toBeTruthy();
  try {
    return await fn();
  } finally {
    await request.post('/api/v2/auth/logout', { headers: json, data: {} });
  }
}

test.beforeAll(async ({ request }) => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
  await asAdmin(request, async () => {
    const created = await request.post('/api/v2/employees', {
      headers: json,
      data: {
        username: STAFF_USER,
        password: STAFF_PASS,
        profile: { familyName: 'Thử', givenName: STAFF_GIVEN },
        account: { username: STAFF_USER, roles: ['staff'] },
        contract: { status: 'nv', effectiveFrom: `${START}-01`, position: { type: 'nv', level: 1 } }
      }
    });
    expect(created.ok(), await created.text()).toBeTruthy();
  });
});

async function signIn(page: Page, username: string, password: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(username);
  await page.locator('#lg-pass').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/dang-nhap/);
}

// Số đang lưu của một nhóm ở tháng `month` (mặc định tháng đang mở), đọc bằng phiên của trang.
// Không nêu tháng thì đọc ở tháng mà màn Cài đặt ghi vào (`minMonth`, tháng sớm nhất còn áp dụng được): các kịch bản kỳ lương
// (scenarios/flow-payroll.spec.ts) dùng tháng cũ nên tháng đó đổi theo DB; đọc theo tháng hôm nay sẽ lệch trên DB đã chạy nhiều lần.
async function saved(page: Page, group: string, month?: string) {
  const at = month ?? (await (await page.request.get('/api/v2/settings')).json()).minMonth;
  const res = await page.request.get(`/api/v2/settings?month=${at}`);
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).groups[group].values as Record<string, any>;
}

// Bấm Lưu (một nút Lưu trên trang hoặc trong `scope`), xác nhận trong hộp "Lưu thay đổi", chờ hộp đóng.
async function saveAndConfirm(page: Page, scope: Page | ReturnType<Page['locator']> = page) {
  await scope.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dlg).toHaveCount(0);
}

test('Phân quyền offers only the Vai trò and Tài khoản tabs', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await page.goto('/admin/cai-dat/phan-quyen/tai-khoan');
  const tabs = page.locator('.tabs.in');
  await expect(tabs.getByRole('link', { name: /Tài khoản/ })).toBeVisible();
  await expect(tabs.getByRole('link', { name: /Vai trò/ })).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'Xử lý yêu cầu' })).toHaveCount(0);
});

test('no settings page calls the v1 settings routes', async ({ page }) => {
  const v1: string[] = [];
  page.on('request', r => {
    const path = new URL(r.url()).pathname;
    if (/\/api\/v2\/(settings\/params|settings\/first-run|blocks\/)/.test(path)) v1.push(`${r.method()} ${path}`);
  });
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  const pages = [
    '/admin/cai-dat',
    '/admin/cai-dat/lich',
    '/admin/cai-dat/kpi',
    '/admin/cai-dat/tat-ca',
    '/admin/cai-dat/phan-quyen',
    '/admin/cai-dat/phan-quyen/xu-ly-yeu-cau'
  ];
  for (const path of pages) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(v1).toEqual([]);
});

// ---------- Tất cả cài đặt: mỗi nhóm số lưu được, tải lại vẫn còn ----------

const FIELDS = [
  { key: 'lam-them', group: 'overtime', field: 'weekdayRate', label: 'Hệ số OT ngày thường', a: 1.6, b: 1.7 },
  { key: 'phu-cap', group: 'attendance', field: 'diligenceLostFromDays', label: 'Mất chuyên cần', a: 4, b: 5 },
  { key: 'khau-tru', group: 'attendance', field: 'lateGraceMinutes', label: 'Đi trễ vẫn hợp lệ', a: 10, b: 20 },
  { key: 'bao-hiem', group: 'insurance', field: 'bhxhPct', label: 'BHXH', a: 8.5, b: 9 },
  { key: 'thue', group: 'tax', field: 'shortContractPct', label: 'Tỉ lệ khấu trừ', a: 12, b: 15 },
  { key: 'ky-luong', group: 'payCalendar', field: 'payDay', label: 'Ngày trả lương', a: 15, b: 20 }
];

for (const f of FIELDS) {
  test(`Tất cả cài đặt › ${f.key}: ${f.label} saves and is still there after a reload`, async ({ page }) => {
    await signIn(page, ADMIN_USER, ADMIN_PASS);
    const to = pick((await saved(page, f.group))[f.field], f.a, f.b);
    await page.goto(`/admin/cai-dat/tat-ca?group=${f.key}`);
    const box = page.getByRole('textbox', { name: f.label, exact: true });
    await box.fill(vn(to));
    await saveAndConfirm(page);
    await page.reload();
    await expect(box).toHaveValue(vn(to));
    expect((await saved(page, f.group))[f.field]).toBe(to);
  });
}

test('Tất cả cài đặt › thue: a tax bracket rate saves and is still there after a reload', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  const to = pick((await saved(page, 'tax')).brackets[0].ratePct, 5, 6);
  await page.goto('/admin/cai-dat/tat-ca?group=thue');
  const rate = page.getByRole('textbox', { name: 'Bậc 1 · thuế suất' });
  await expect(page.locator('[data-setting-key="brackets"] tbody tr')).toHaveCount(5);
  await rate.fill(vn(to));
  await saveAndConfirm(page);
  await page.reload();
  await expect(rate).toHaveValue(vn(to));
  expect((await saved(page, 'tax')).brackets[0].ratePct).toBe(to);
});

test('KPI weights: Quy tắc KPI shows the saved weights; Lịch sử lists the change and Hoàn tác puts it back', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  const before = await saved(page, 'kpiWeights');
  const user = before.user >= 2 ? before.user - 2 : before.user + 2;
  const self = before.self + (before.user - user);
  await page.goto('/admin/cai-dat/tat-ca?group=luong-kpi');
  await page.getByRole('textbox', { name: 'Người dùng', exact: true }).fill(String(user));
  await page.getByRole('textbox', { name: 'Tự đánh giá', exact: true }).fill(String(self));
  await saveAndConfirm(page);
  expect(await saved(page, 'kpiWeights')).toEqual({ ...before, user, self });

  await page.goto('/admin/cai-dat/kpi');
  const weight = (label: string) => page.locator('.wts > div', { has: page.locator('.l', { hasText: label }) }).locator('.v');
  await expect(weight('Người dùng')).toHaveText(`${user}%`);
  await expect(weight('Tự đánh giá')).toHaveText(`${self}%`);

  await page.goto('/admin/cai-dat/tat-ca?group=luong-kpi');
  const item = page.locator('[data-setting-key="user"]');
  await item.getByRole('button', { name: 'Lịch sử' }).click();
  const newest = item.locator('tbody tr').first();
  await expect(newest).toContainText(`${before.user}% → ${user}%`);
  await newest.getByRole('button', { name: 'Hoàn tác' }).click();
  const dlg = page.getByRole('dialog', { name: 'Hoàn tác' });
  await expect(dlg.locator('li')).toHaveText([
    `Trọng số Người dùng ${user}% → ${before.user}%, áp dụng từ tháng ${monthText(THIS)}`,
    `Trọng số Tự đánh giá ${self}% → ${before.self}%, áp dụng từ tháng ${monthText(THIS)}`
  ]);
  await dlg.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.getByText('Đã hoàn tác')).toBeVisible();
  expect(await saved(page, 'kpiWeights')).toEqual(before);
});

// ---------- Cách tính lương: ngăn kéo lưu vào kho cài đặt ----------

test('Cách tính lương: the OT drawer saves the weekend rate and the row shows it after a reload', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  const to = pick((await saved(page, 'overtime')).weekendRate, 2.5, 2.2);
  await page.goto('/admin/cai-dat');
  const row = page.locator('tbody tr', { has: page.getByText('Tiền làm thêm giờ', { exact: true }) });
  await row.getByRole('button', { name: 'Sửa' }).click();
  const drawer = page.getByRole('dialog', { name: 'Tiền làm thêm giờ' });
  await drawer.getByRole('textbox', { name: 'Cuối tuần' }).fill(vn(to));
  await saveAndConfirm(page, drawer);
  await expect(drawer).toHaveCount(0);
  await expect(row).toContainText(`cuối tuần ×${to}`);
  await page.reload();
  await expect(row).toContainText(`cuối tuần ×${to}`);
  expect((await saved(page, 'overtime')).weekendRate).toBe(to);
});

// ---------- Lịch, ca & chấm công ----------

const card = (page: Page, heading: string) => page.locator('section', { has: page.getByRole('heading', { name: heading }) });

test('Lịch: the six fixed shifts load from the server', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await page.goto('/admin/cai-dat/lich');
  const shifts = card(page, 'Ca làm');
  await expect(shifts).toContainText('6 ca cố định');
  await expect(shifts.locator('tbody tr')).toHaveCount(6);
});

test('Lịch: a new pay day saves, moves the dot on the calendar and is still there after a reload', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  const to = pick((await saved(page, 'payCalendar')).payDay, 12, 14);
  await page.goto('/admin/cai-dat/lich');
  const pay = card(page, 'Ngày trả lương');
  const field = pay.getByRole('textbox', { name: 'Ngày trả lương hằng tháng' });
  await field.fill(String(to));
  await saveAndConfirm(page, pay);
  await expect(page.getByText('Đã lưu')).toBeVisible();
  // Lương tháng này trả ngày `to` của tháng sau; tháng 12 thì chấm nằm ở lịch năm sau.
  const next = addMonth(THIS, 1);
  if (next.slice(0, 4) !== THIS.slice(0, 4)) await page.getByRole('button', { name: 'Năm sau' }).click();
  const dot = page.getByRole('button', { name: `Ngày ${to} tháng ${Number(next.slice(5, 7))}`, exact: true });
  await expect(dot).toHaveClass(/\bpay\b/);
  await page.reload();
  await expect(field).toHaveValue(String(to));
});

test('Lịch: the attendance zone saves at once and is still there after a reload', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  const before = (await (await page.request.get('/api/v2/settings/attendance-zone')).json()).zone;
  const radius = pick(before?.radiusM, 150, 200);
  await page.goto('/admin/cai-dat/lich');
  const zone = card(page, 'Vùng chấm công');
  await zone.getByRole('textbox', { name: 'Vĩ độ' }).fill(vn(OFFICE.latitude));
  await zone.getByRole('textbox', { name: 'Kinh độ' }).fill(vn(OFFICE.longitude));
  const r = zone.getByRole('textbox', { name: 'Bán kính vùng chấm công' });
  await r.fill(String(radius));
  await saveAndConfirm(page, zone);
  await expect(page.getByText('Đã lưu')).toBeVisible();
  await page.reload();
  await expect(r).toHaveValue(String(radius));
  const after = (await (await page.request.get('/api/v2/settings/attendance-zone')).json()).zone;
  expect(after).toEqual({ lat: OFFICE.latitude, lng: OFFICE.longitude, radiusM: radius });
});

// ---------- App nhân viên: Check-in khoá theo vùng và vị trí ----------

async function staffHome(page: Page) {
  await signIn(page, STAFF_USER, STAFF_PASS);
  await page.setViewportSize(PHONE);
  await page.goto('/nv/hom-nay');
  return page.getByRole('region', { name: 'Ca hôm nay' });
}

test.describe('staff Check-in on a workday', () => {
  test.beforeEach(() => test.skip(TODAY_DOW === 0, 'Chủ nhật không có ca để chấm'));

  test('far from the office Check-in is locked with the distance', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(FAR);
    const shift = await staffHome(page);
    await expect(shift).toContainText('Bạn đang cách văn phòng 600 m');
    await expect(shift.getByRole('button', { name: /Check-in/ })).toBeDisabled();
  });

  test('without location permission Check-in is locked with Không lấy được vị trí', async ({ page }) => {
    const shift = await staffHome(page);
    await expect(shift).toContainText('Không lấy được vị trí');
    await expect(shift.getByRole('button', { name: /Check-in/ })).toBeDisabled();
  });

  test('at the office Check-in is open', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(OFFICE);
    const shift = await staffHome(page);
    await expect(shift.getByRole('button', { name: /Check-in/ })).toBeEnabled();
  });
});

test('the staff app shows the pay date of this month on Thu nhập', async ({ page, request }) => {
  const payDate: string = await asAdmin(request, async () => {
    const res = await request.get(`/api/v2/settings/pay-days?year=${THIS.slice(0, 4)}`);
    expect(res.ok(), await res.text()).toBeTruthy();
    return (await res.json()).items.find((i: { month: string }) => i.month === THIS).payDate;
  });
  await signIn(page, STAFF_USER, STAFF_PASS);
  await page.setViewportSize(PHONE);
  await page.goto('/nv/thu-nhap');
  await expect(page.locator('main')).toContainText(`trả ngày ${payDate.slice(8, 10)}/${payDate.slice(5, 7)}`);
});

// ---------- Tuần làm việc riêng: hồ sơ nhân sự, app nhân viên, lưới chấm công ----------

test.describe('an own work week without today’s weekday', () => {
  test.beforeEach(() => test.skip(TODAY_DOW === 0, 'Chủ nhật vốn không phải ngày làm'));

  test('the profile saves it and shows it after a reload', async ({ page }) => {
    await signIn(page, ADMIN_USER, ADMIN_PASS);
    await page.goto(`/admin/nhan-su?nv=${STAFF_USER}`);
    const profile = page.getByRole('dialog', { name: /^Hồ sơ của / });
    const line = profile.locator('.fr', { has: page.getByText('Tuần làm việc', { exact: true }) }).locator('dd');
    await expect(line).toContainText('theo loại nhân sự');
    await profile.getByRole('button', { name: 'Sửa tuần làm việc' }).click();
    const dlg = page.getByRole('dialog', { name: 'Tuần làm việc' });
    await dlg.getByRole('radio', { name: 'Tuần riêng' }).check();
    await dlg.getByRole('checkbox', { name: `T${TODAY_DOW + 1}` }).uncheck();
    await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dlg).toHaveCount(0);
    await expect(line).toContainText(`riêng từ ${monthText(THIS)}`);
    await page.reload();
    await expect(line).toContainText(`riêng từ ${monthText(THIS)}`);
    const week = await (await page.request.get(`/api/v2/settings/work-weeks/${STAFF_USER}`)).json();
    expect(week.source).toBe('own');
    expect(week.weekdays).not.toContain(TODAY_DOW);
  });

  test('the staff app locks Check-in and marks today nghỉ', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(OFFICE);
    const shift = await staffHome(page);
    await expect(shift).toContainText('Hôm nay không phải ngày làm của bạn');
    await expect(shift.getByRole('button', { name: /Check-in/ })).toBeDisabled();
    const today = page.getByRole('region', { name: 'Tuần này' }).locator('.dn.today');
    await expect(today).toHaveClass(/\boff\b/);
  });

  test('the attendance grid uses each month’s week: today’s weekday is off only from this month', async ({ page }) => {
    await signIn(page, ADMIN_USER, ADMIN_PASS);
    await page.goto('/admin/cham-cong');
    // Máy chủ lấy tên đăng nhập làm tên hiển thị của nhân viên thử, nên tìm theo phần đuôi riêng của lần chạy.
    await page.getByRole('textbox', { name: 'Lọc theo tên' }).fill(SUFFIX);
    const row = page.locator('tbody tr', { hasText: SUFFIX });
    await expect(row).toHaveCount(1);
    // Lưới 4 tuần bắt đầu thứ Hai của tuần cách hôm nay 14 ngày (như gridFromOf).
    const back = addDays(TODAY, -14);
    const from = addDays(back, -((dowOf(back) + 6) % 7));
    for (let i = 0; i < 28; i++) {
      const date = addDays(from, i);
      if (dowOf(date) !== TODAY_DOW) continue;
      const pill = row.locator('td.dc').nth(i).locator('.pill');
      if (date >= `${THIS}-01`) await expect(pill, date).toHaveClass(/\boff\b/);
      else await expect(pill, date).not.toHaveClass(/\boff\b/);
    }
  });
});
