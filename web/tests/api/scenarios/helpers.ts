// Hạ tầng chung cho kịch bản mức giao diện với BE thật (soát lỗi): đăng nhập, tạo nhân viên qua API, kiểm console sạch.
// Mọi file kịch bản dùng `test` của file này: một fixture tự động ghi lại console.error / pageerror / cảnh báo Vue và làm
// test fail nếu có (trừ dòng "Failed to load resource" mà trình duyệt tự in cho phản hồi 4xx/5xx và lỗi mạng giả cố ý).
// Mỗi file tạo nhân viên mới có hậu tố ngẫu nhiên nên chạy lại được; chỉ chạy trên DB thử.
import { expect, request as pwRequest, test as base, type APIRequestContext, type Browser, type Page } from '@playwright/test';

export const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
export const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
export const json = { 'Content-Type': 'application/json' };
export const PHONE = { width: 390, height: 844 };
export const DESKTOP = { width: 1440, height: 900 };
export const OFFICE = { latitude: 10.7769, longitude: 106.7009 };

export const vnMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
export const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export const addMonth = (ym: string, n: number) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
export const rand = () => Math.random().toString(36).slice(2, 8);

export type Staff = { id: string; username: string; password: string; name: string; given: string };

// ---------- console sạch ----------
const IGNORED = [/Failed to load resource/i, /net::ERR_/i];
export type ConsoleLog = { errors: string[] };

/** Gắn bộ ghi console/pageerror vào một trang; trả danh sách lỗi (đối tượng sống). */
export function watchConsole(page: Page): ConsoleLog {
  const log: ConsoleLog = { errors: [] };
  page.on('pageerror', e => log.errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !IGNORED.some(r => r.test(t))) log.errors.push(`console.error: ${t}`);
    else if (m.type() === 'warning' && /\[Vue warn\]/.test(t)) log.errors.push(`vue-warn: ${t}`);
  });
  return log;
}

export const test = base.extend<{ consoleLog: ConsoleLog }>({
  consoleLog: [
    async ({ page }, use) => {
      const log = watchConsole(page);
      await use(log);
      expect(log.errors, 'console/pageerror phải sạch').toEqual([]);
    },
    { auto: true }
  ]
});
export { expect };

// ---------- API ----------
export function skipWithoutAdmin() {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
}

/** Phiên API riêng của một người (không chung cookie với trang). */
export async function apiAs(baseURL: string, username: string, password: string): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL });
  const res = await ctx.post('/api/v2/auth/login', { headers: json, data: { username, password } });
  expect(res.ok(), `đăng nhập ${username}: ${await res.text()}`).toBeTruthy();
  return ctx;
}
export const adminApi = (baseURL: string) => apiAs(baseURL, ADMIN_USER, ADMIN_PASS);

/** Tạo nhân viên mới (tên, tài khoản có hậu tố ngẫu nhiên), vào làm ngày 01 của `monthsBack` tháng trước. */
export async function createStaff(admin: APIRequestContext, baseURL: string, tag: string, monthsBack = 0): Promise<Staff> {
  const suffix = rand();
  const username = `pw-${tag}-${suffix}`;
  const given = `${tag.replace(/[^a-z]/gi, '')}${suffix.replace(/\d/g, 'x')}`;
  const password = 'PwScen@12345';
  const created = await admin.post('/api/v2/employees', {
    headers: json,
    data: {
      account: { username, password, roles: ['staff'] },
      profile: { name: { familyName: 'Kịch', givenName: given } },
      contract: { status: 'nv', effectiveFrom: `${addMonth(vnMonth(), -monthsBack)}-01`, position: { type: 'nv', level: 1 } }
    }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const id = (await created.json()).employee.profile.uuid as string;
  const own = await apiAs(baseURL, username, password);
  try {
    const name = (await (await own.get('/api/v2/me/profile')).json()).name as string;
    return { id, username, password, given, name };
  } finally {
    await own.dispose();
  }
}

// ---------- giao diện ----------
export async function signIn(page: Page, username: string, password: string, expectUrl: RegExp = /^(?!.*dang-nhap)/) {
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(username);
  await page.locator('#lg-pass').fill(password);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await expect(page).toHaveURL(expectUrl);
  await expect(page).not.toHaveURL(/dang-nhap/);
}
export const signInAdmin = (page: Page) => signIn(page, ADMIN_USER, ADMIN_PASS);

/** Không có thanh cuộn ngang. */
export async function expectNoHScroll(page: Page, what = '') {
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(w.sw, `${what} tràn ngang (${w.sw} > ${w.cw})`).toBeLessThanOrEqual(w.cw + 1);
}

/** Trang đang hiện màn đăng nhập (đã bị đẩy ra). */
export async function expectAtLogin(page: Page) {
  await expect(page).toHaveURL(/\/dang-nhap/);
  await expect(page.locator('#lg-user')).toBeVisible();
}

export async function setLocked(admin: APIRequestContext, username: string, locked: boolean) {
  const res = await admin.put(`/api/v2/employees/${username}`, { headers: json, data: { account: { isLocked: locked } } });
  expect(res.ok(), await res.text()).toBeTruthy();
}
export async function resetPassword(admin: APIRequestContext, username: string, password: string) {
  const res = await admin.put(`/api/v2/employees/${username}`, { headers: json, data: { account: { password } } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

// ---------- giả lỗi mạng / máy chủ ----------
export type Fail = 'e500' | 'e409' | 'e429' | 'e502html' | 'abort';
export const FAIL_TEXT: Record<Fail, RegExp> = {
  e500: /Lỗi máy chủ thử/,
  e409: /Dữ liệu vừa được người khác đổi/,
  e429: /Thao tác quá nhanh, thử lại sau/,
  e502html: /Máy chủ đang lỗi \(mã 502\)/,
  abort: /Không kết nối được máy chủ/
};
export function failHandler(mode: Fail) {
  return (route: import('@playwright/test').Route) => {
    if (mode === 'abort') return route.abort();
    if (mode === 'e502html') return route.fulfill({ status: 502, contentType: 'text/html', body: '<html><body>Bad Gateway</body></html>' });
    const map = {
      e500: [500, 'Lỗi máy chủ thử', 'INTERNAL'],
      e409: [409, 'Dữ liệu vừa được người khác đổi', 'STALE'],
      e429: [429, 'Thao tác quá nhanh, thử lại sau', 'RATE_LIMITED']
    } as const;
    const [status, error, code] = map[mode];
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error, code }) });
  };
}
/**
 * Làm mọi lời gọi /api/v2/* (trừ phiên, luồng realtime và những đường dẫn `except`) trả lỗi `mode`, cho tới khi gọi `restore()`.
 * Có thể đặt `only` để chỉ làm lỗi đúng các đường dẫn khớp.
 */
export async function breakApi(page: Page, mode: Fail, opts: { only?: RegExp; except?: RegExp } = {}) {
  const handler = failHandler(mode);
  const pattern = (url: URL) => {
    if (!url.pathname.startsWith('/api/v2/')) return false;
    if (/\/auth\/|\/realtime\//.test(url.pathname)) return false;
    if (opts.except && opts.except.test(url.pathname)) return false;
    return opts.only ? opts.only.test(url.pathname) : true;
  };
  await page.route(pattern, handler);
  return { restore: () => page.unroute(pattern, handler) };
}

// ---------- gửi đơn bằng giao diện nhân viên (điện thoại) ----------
export type KindSlug = 'nghi' | 'nghi-bu' | 'ot' | 'doi-ca' | 'giai-trinh' | 'tam-ung';

/** Xếp các khung bù (mỗi dòng một ngày khác nhau, giờ rộng nhất) tới khi đủ giờ. */
async function fillMakeupSlots(page: Page) {
  const group = page.getByRole('group', { name: 'Khung bù' });
  for (let i = 1; i <= 8; i++) {
    const count = await group.locator('.nr-cnt').innerText();
    const m = count.match(/(\d+)\s*\/\s*(\d+)/);
    if (m && m[1] === m[2]) return;
    if (i > 1) await page.getByRole('button', { name: 'Thêm khung bù' }).click();
    const date = page.getByLabel(`Ngày bù, khung ${i}`);
    // Dòng mới hiện sau lượt gọi BE (form xếp hàng các thao tác): chờ có ngày bù chọn được rồi mới đọc.
    await expect.poll(() => date.locator('option:not([disabled])').count()).toBeGreaterThan(0);
    const dvals = await date.locator('option:not([disabled])').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean));
    await date.selectOption(dvals[i - 1] ?? dvals[0]);
    const from = page.getByLabel(`Từ giờ, khung ${i}`);
    // Giờ chọn được do BE tính (POST …/leave-with-makeup/plan) nên về sau một lượt gọi: chờ có lựa chọn rồi mới đọc.
    await expect.poll(() => from.locator('option:not([disabled])').count()).toBeGreaterThan(0);
    const fvals = await from.locator('option:not([disabled])').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean));
    await from.selectOption(fvals[fvals.length - 1]);
    const to = page.getByLabel(`Đến giờ, khung ${i}`);
    await expect.poll(() => to.locator('option:not([disabled])').count()).toBeGreaterThan(0);
    const tvals = await to.locator('option:not([disabled])').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean));
    await to.selectOption(tvals[tvals.length - 1]);
  }
}

/**
 * Mở form `slug` ở /nv/yeu-cau và điền: mọi ô chọn còn trống lấy lựa chọn thật thứ `pick` (0 = đầu tiên), ô giờ <input type=time>
 * lấy `times`, nút radio đầu tiên, lý do `reason`. `leaveType` chọn hình thức nghỉ (mặc định Phép năm; nhân viên mới hết phép).
 * Trả nút Gửi (bật nếu xem trước đồng ý) và lý do đã gõ.
 */
export async function fillRequest(page: Page, slug: KindSlug, opts: { pick?: number; times?: string[]; reason?: string; leaveType?: string } = {}) {
  const { pick = 3, times = ['08:00', '17:00'], reason = `Lý do kịch bản ${rand()}`, leaveType = 'PERSONAL_UNPAID' } = opts;
  await page.goto(`/nv/yeu-cau?tao=${slug}`);
  const form = page.locator('.nr-form');
  const send = page.getByRole('button', { name: 'Gửi yêu cầu' });
  await expect(send).toBeVisible();
  await page.waitForTimeout(300);
  if (slug === 'nghi') await form.locator('select').first().selectOption(leaveType);
  for (let round = 0; round < 6; round++) {
    const selects = form.locator('select:not([disabled]):not([aria-label])');
    const n = await selects.count();
    for (let i = 0; i < n; i++) {
      const sel = selects.nth(i);
      if ((await sel.inputValue()) !== '') continue;
      const values = await sel.locator('option:not([disabled])').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean));
      if (values.length) await sel.selectOption(values[Math.min(pick, values.length - 1)]);
    }
    await page.waitForTimeout(60);
  }
  if (slug === 'nghi-bu') await fillMakeupSlots(page);
  const timeInputs = await form.locator('input[type=time]').all();
  for (let i = 0; i < timeInputs.length; i++) await timeInputs[i].fill(times[i] ?? times[times.length - 1]);
  const radio = form.locator('input[type=radio]');
  if (await radio.count()) await radio.nth(2).check();
  const ta = form.locator('textarea');
  if (await ta.count()) await ta.first().fill(reason);
  return { send, reason };
}

/** Nhân viên gửi một đơn bằng giao diện điện thoại trong một ngữ cảnh trình duyệt riêng; trả lý do đã gõ. */
export async function submitRequestUI(browser: Browser, baseURL: string, staff: Staff, slug: KindSlug, opts: Parameters<typeof fillRequest>[2] = {}) {
  const ctx = await browser.newContext({ viewport: PHONE, permissions: ['geolocation'], geolocation: OFFICE, baseURL });
  const page = await ctx.newPage();
  try {
    await signIn(page, staff.username, staff.password);
    const { send, reason } = await fillRequest(page, slug, opts);
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.locator('.toast.ok').filter({ hasText: 'Đã gửi yêu cầu' })).toBeVisible();
    return reason;
  } finally {
    await ctx.close();
  }
}

// ---------- kỳ lương sạch cho kịch bản trọn luồng ----------
/** Tháng (từ 4 tháng trước trở về) còn ở trạng thái `open` và chưa ai chạm tới: kỳ đã trả lương thì không mở lại được nên mỗi lần chạy lấy tháng mới. */
export async function freshMonth(admin: APIRequestContext): Promise<string> {
  for (let back = 4; back < 60; back++) {
    const m = addMonth(vnMonth(), -back);
    const v = await (await admin.get(`/api/v2/system/periods/${m}`)).json();
    if (v.status !== 'open') continue;
    const slips = await (await admin.get(`/api/v2/payroll/${m}`)).json();
    if ((slips.items ?? []).length === 0) return m;
  }
  throw new Error('không còn tháng sạch');
}

/** Các ngày làm việc T2–T6 đầu tiên của tháng `ym`. */
export function workdaysOf(ym: string, n: number): string[] {
  const out: string[] = [];
  for (let d = 1; out.length < n; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    if (dow >= 1 && dow <= 5) out.push(iso);
  }
  return out;
}

/** Admin chấm công hộ: vào 08:00, ra 17:00 (giờ VN) cho từng ngày. */
export async function adminPunchDays(admin: APIRequestContext, employeeId: string, days: string[], inTime = '08:00') {
  for (const d of days) {
    for (const [type, t] of [['IN', inTime], ['OUT', '17:00']] as const) {
      const r = await admin.post('/api/v2/attendance/punches', { headers: json, data: { employeeId, type, punchedAt: `${d}T${t}:00+07:00` } });
      expect(r.ok(), `${type} ${d}: ${await r.text()}`).toBeTruthy();
    }
  }
}

/**
 * Giá trị đang lưu của một nhóm cài đặt ở tháng mà màn Cài đặt ghi vào (tháng sớm nhất được áp dụng, `minMonth`): trên DB đã chạy nhiều lần,
 * các phiên bản cài đặt theo tháng chồng lên nhau nên đọc mặc định có thể ra tháng khác.
 */
export async function savedSetting(page: Page, group: string): Promise<Record<string, any>> {
  const first = await (await page.request.get('/api/v2/settings')).json();
  const res = await page.request.get(`/api/v2/settings?month=${first.minMonth}`);
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).groups[group].values;
}
