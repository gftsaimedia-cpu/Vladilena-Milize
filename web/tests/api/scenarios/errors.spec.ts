// Nhóm 2 — Lỗi máy chủ / mạng trên từng màn chính: 500, 409, 429, 502 trả HTML, mạng rớt. Mỗi màn phải hiện khối "Không tải được…" với
// nút Thử lại, bấm được, không trắng trang; hết lỗi thì Thử lại đưa dữ liệu về. Console/pageerror sạch (fixture trong helpers.ts).
import { DESKTOP, FAIL_TEXT, OFFICE, PHONE, adminApi, breakApi, createStaff, expect, fillRequest, savedSetting, signIn, signInAdmin, skipWithoutAdmin, submitRequestUI, test, type Fail, type Staff } from './helpers';
import type { APIRequestContext, Page } from '@playwright/test';

test.use({ permissions: ['geolocation'], geolocation: OFFICE });

let admin: APIRequestContext;
let staff: Staff;
test.beforeAll(async ({ baseURL }) => {
  skipWithoutAdmin();
  admin = await adminApi(baseURL!);
  staff = await createStaff(admin, baseURL!, 'err');
});
test.afterAll(async () => {
  await admin?.dispose();
});

const MODES: Fail[] = ['e500', 'e409', 'e429', 'e502html', 'abort'];
const retryButton = (page: Page) => page.getByRole('button', { name: 'Thử lại' }).first();

// [tên, đường dẫn, dấu hiệu "đã có dữ liệu"]
// Màn gom nhiều thẻ (Cài đặt › Tất cả) báo lỗi từng thẻ bằng câu chung, không chép câu của máy chủ.
const GENERIC_ONLY = new Set(['Cài đặt › Cách tính lương', 'Cài đặt › Lịch', 'Cài đặt › KPI', 'Cài đặt › Chức vụ và bậc', 'Cài đặt › Chế độ']);
const settingsH1 = (p: Page) => p.locator('h1').first();
const ADMIN_SCREENS: Array<[string, string, (p: Page) => ReturnType<Page['locator']>]> = [
  ['Tổng quan', '/admin/tong-quan', p => p.getByRole('heading', { name: 'Tổng quan' })],
  ['Chấm công', '/admin/cham-cong', p => p.getByRole('region', { name: 'Lưới chấm công' })],
  ['Bảng lương', '/admin/bang-luong', p => p.locator('.period')],
  ['Nhân sự', '/admin/nhan-su', p => p.getByRole('heading', { name: 'Danh sách nhân sự' })],
  ['Cài đặt › Cách tính lương', '/admin/cai-dat/tat-ca', p => p.getByRole('heading', { name: 'Tất cả cài đặt' }).first()],
  ['Cài đặt › Tài khoản', '/admin/cai-dat/phan-quyen/tai-khoan', p => p.getByRole('textbox', { name: 'Tìm tên' })],
  ['Cài đặt › Lịch', '/admin/cai-dat/lich', settingsH1],
  ['Cài đặt › KPI', '/admin/cai-dat/kpi', settingsH1],
  ['Cài đặt › Chức vụ và bậc', '/admin/cai-dat/chuc-vu-bac', settingsH1],
  ['Cài đặt › Chế độ', '/admin/cai-dat/che-do', settingsH1],
  ['Cài đặt › Nhật ký', '/admin/cai-dat/nhat-ky', p => p.getByRole('button', { name: /Kiểm tra nhật ký/ })]
];

for (const [name, path, ok] of ADMIN_SCREENS) {
  for (const mode of MODES) {
    test(`admin ${name}: ${mode} → khối lỗi có Thử lại, bấm Thử lại thì có dữ liệu`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await signInAdmin(page);
      const broken = await breakApi(page, mode);
      await page.goto(path);
      await expect(page.getByRole('alert').filter({ hasText: /Không tải được/ }).first()).toBeVisible();
      if (!GENERIC_ONLY.has(name)) await expect(page.locator('body')).toContainText(FAIL_TEXT[mode]);
      await expect(retryButton(page)).toBeVisible();
      // Bấm Thử lại khi còn lỗi: vẫn có khối lỗi, không trắng trang.
      await retryButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: /Không tải được/ }).first()).toBeVisible();
      await broken.restore();
      // Màn có nhiều thẻ (Lịch) báo lỗi riêng từng thẻ: bấm hết các nút Thử lại.
      for (let n = await page.getByRole('button', { name: 'Thử lại' }).count(); n > 0; n--) await page.getByRole('button', { name: 'Thử lại' }).first().click();
      await expect(ok(page)).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: /Không tải được/ })).toHaveCount(0);
    });
  }
}

const STAFF_SCREENS: Array<[string, string]> = [
  ['Hôm nay', '/nv/hom-nay'],
  ['Chấm công', '/nv/cham-cong'],
  ['Yêu cầu', '/nv/yeu-cau'],
  ['Thu nhập', '/nv/thu-nhap'],
  ['Tôi', '/nv/toi']
];
for (const [name, path] of STAFF_SCREENS) {
  for (const mode of ['e500', 'abort', 'e502html'] as Fail[]) {
    test(`nhân viên (điện thoại) ${name}: ${mode} → "Không tải được dữ liệu" + Thử lại`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await signIn(page, staff.username, staff.password);
      const broken = await breakApi(page, mode);
      await page.goto(path);
      await expect(page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' }).first()).toBeVisible();
      await expect(retryButton(page)).toBeVisible();
      await broken.restore();
      await retryButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })).toHaveCount(0);
      await expect(page.locator('h1, .home .name').first()).toBeVisible();
    });
  }
}

test('nhân viên (máy tính): mọi cột lỗi đều có Thử lại, hết lỗi thì cả trang có dữ liệu', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff.username, staff.password);
  const broken = await breakApi(page, 'e500');
  await page.goto('/nv/hom-nay');
  await expect(page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' }).first()).toBeVisible();
  await broken.restore();
  const n = await page.getByRole('button', { name: 'Thử lại' }).count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await page.getByRole('button', { name: 'Thử lại' }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: staff.name })).toBeVisible();
});

// ---------- Lỗi khi thao tác (không chỉ khi tải) ----------
// Đếm số lời gọi tới đường dẫn khớp `re` (kèm phương thức) và làm chúng chậm `delayMs` để bấm đúp có đủ thời gian trùng nhau.
async function countCalls(page: Page, re: RegExp, method: string, delayMs = 500) {
  const calls = { n: 0 };
  await page.route(re, async route => {
    if (route.request().method() !== method) return route.fallback();
    calls.n++;
    await new Promise(r => setTimeout(r, delayMs));
    return route.fallback();
  });
  return calls;
}

test.describe('thao tác của nhân viên', () => {
  test('Check-in: 500 hiện câu của máy chủ và nút bấm lại được; bấm nhanh hai lần chỉ gửi một lần', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signIn(page, staff.username, staff.password);
    const card = page.getByRole('region', { name: 'Ca hôm nay' });
    const broken = await breakApi(page, 'e500', { only: /\/me\/punches$/ });
    await card.getByRole('button', { name: /Check-in/ }).click();
    await expect(page.getByText('Lỗi máy chủ thử')).toBeVisible();
    await expect(card).toContainText('Chưa check-in');
    await expect(card.getByRole('button', { name: /Check-in/ })).toBeEnabled();
    await broken.restore();
    const calls = await countCalls(page, /\/api\/v2\/me\/punches$/, 'POST');
    const btn = card.getByRole('button', { name: /Check-in/ });
    await btn.dblclick();
    await expect(card).toContainText('Đang trong ca');
    expect(calls.n).toBe(1);
  });

  test('Check-in khi mạng rớt: báo không kết nối, vẫn chưa vào ca', async ({ page }) => {
    await page.setViewportSize(PHONE);
    const s = await createStaff(admin, test.info().project.use.baseURL!, 'net');
    await signIn(page, s.username, s.password);
    const card = page.getByRole('region', { name: 'Ca hôm nay' });
    const broken = await breakApi(page, 'abort', { only: /\/me\/punches$/ });
    await card.getByRole('button', { name: /Check-in/ }).click();
    await expect(page.getByText('Không kết nối được máy chủ.').first()).toBeVisible();
    await expect(card).toContainText('Chưa check-in');
    await broken.restore();
  });

  test('Gửi đơn: 500 giữ form và hiện câu lỗi dưới nút; bấm đúp chỉ gửi một đơn', async ({ page }) => {
    await page.setViewportSize(PHONE);
    const s = await createStaff(admin, test.info().project.use.baseURL!, 'send');
    await signIn(page, s.username, s.password);
    const { send, reason } = await fillRequest(page, 'ot', { pick: 4 });
    await expect(send).toBeEnabled();
    const broken = await breakApi(page, 'e500', { only: /\/me\/requests\/overtime$/ });
    await send.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Lỗi máy chủ thử' })).toBeVisible();
    await expect(page.locator('.nr-form textarea')).toHaveValue(reason);
    await broken.restore();
    await expect(send).toBeEnabled();
    const calls = await countCalls(page, /\/api\/v2\/me\/requests\/overtime$/, 'POST');
    await send.dblclick();
    await expect(page.locator('.toast.ok').filter({ hasText: 'Đã gửi yêu cầu' })).toBeVisible();
    expect(calls.n).toBe(1);
    const mine = await (await page.request.get('/api/v2/me/requests')).json();
    expect(mine.items.filter((r: any) => /OVERTIME/i.test(r.kind ?? r.type ?? ''))).toHaveLength(1);
  });

  test('Tạo yêu cầu: request-context lỗi có nút Thử lại', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signIn(page, staff.username, staff.password);
    const broken = await breakApi(page, 'e500', { only: /\/me\/request-context$/ });
    await page.goto('/nv/yeu-cau?tao=chon');
    await expect(page.getByRole('alert').filter({ hasText: 'Lỗi máy chủ thử' })).toBeVisible();
    await broken.restore();
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByRole('button', { name: /Làm thêm giờ/ })).toBeVisible();
  });

  test('mở một đơn / một ngày khi mạng rớt: có thông báo, không lỗi chưa bắt', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signIn(page, staff.username, staff.password);
    const broken = await breakApi(page, 'abort', { only: /\/me\/(requests\/[^/]+|attendance\/\d{4}-\d{2}-\d{2})$/ });
    await page.goto('/nv/yeu-cau?yc=khong-co-that');
    await expect(page.locator('.toast.error, .toast').filter({ hasText: 'Không kết nối được máy chủ' }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/yc=/);
    await page.goto('/nv/cham-cong?ngay=2026-11-05');
    await expect(page.locator('.toast.error, .toast').filter({ hasText: 'Không kết nối được máy chủ' }).first()).toBeVisible();
    await broken.restore();
  });
});

test.describe('thao tác của admin', () => {
  test('duyệt từ chuông: 500 báo lỗi, việc ở lại; bấm đúp chỉ duyệt một lần', async ({ page, browser, baseURL }) => {
    const s = await createStaff(admin, baseURL!, 'appr');
    const reason = await submitRequestUI(browser, baseURL!, s, 'ot', { pick: 4 });
    await page.setViewportSize(DESKTOP);
    await signInAdmin(page);
    await page.getByRole('button', { name: /Thông báo/ }).click();
    const row = page.getByRole('dialog', { name: 'Thông báo' }).getByRole('button', { name: new RegExp(`Làm thêm.*${s.name}`) });
    await row.click();
    const broken = await breakApi(page, 'e500', { only: /\/requests\/[^/]+\/review$/ });
    await page.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(page.locator('.toast').filter({ hasText: 'Lỗi máy chủ thử' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toBeEnabled();
    await broken.restore();
    const calls = await countCalls(page, /\/api\/v2\/requests\/[^/]+\/review$/, 'PATCH');
    await page.getByRole('button', { name: 'Duyệt', exact: true }).dblclick();
    await expect(page.getByRole('dialog', { name: 'Thông báo' }).locator('[aria-live=polite]')).toHaveText(`Đã duyệt yêu cầu của ${s.name}.`);
    expect(calls.n).toBe(1);
    void reason;
  });

  test('chuông: thông báo tải lỗi có Thử lại', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAdmin(page);
    const broken = await breakApi(page, 'e500', { only: /\/requests/ });
    await page.getByRole('button', { name: /Thông báo/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Thông báo' });
    await expect(dlg.getByText(/Không tải được thông báo/)).toBeVisible();
    await broken.restore();
    await dlg.getByRole('button', { name: 'Thử lại' }).click();
    await expect(dlg.getByText(/Không tải được thông báo/)).toHaveCount(0);
  });

  test('lưu cài đặt: 500 hiện lỗi và vẫn lưu lại được; bấm Lưu đúp trong hộp xác nhận chỉ gửi một lần', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAdmin(page);
    const cur = (await savedSetting(page, 'attendance')).lateGraceMinutes as number;
    const to = cur === 11 ? 12 : 11;
    await page.goto('/admin/cai-dat/tat-ca?group=khau-tru');
    await page.getByRole('textbox', { name: 'Đi trễ vẫn hợp lệ', exact: true }).fill(String(to));
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
    const broken = await breakApi(page, 'e500', { only: /\/settings\/attendance$/ });
    await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.locator('.toast, [role=alert]').filter({ hasText: 'Lỗi máy chủ thử' }).first()).toBeVisible();
    await broken.restore();
    const calls = await countCalls(page, /\/api\/v2\/settings\/attendance$/, 'PUT');
    const dlg2 = page.getByRole('dialog', { name: 'Lưu thay đổi' });
    if (await dlg2.count() === 0) await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.getByRole('dialog', { name: 'Lưu thay đổi' }).getByRole('button', { name: 'Lưu', exact: true }).dblclick();
    // Lưu áp dụng từ một tháng cũ trên DB lớn có thể mất vài giây (BE tính lại nhiều tháng).
    await expect(page.getByRole('dialog', { name: 'Lưu thay đổi' })).toHaveCount(0, { timeout: 30_000 });
    expect(calls.n).toBe(1);
    expect((await savedSetting(page, 'attendance')).lateGraceMinutes).toBe(to);
  });
});

// ---------- Máy chủ không trả lời (treo) ----------
test('máy chủ treo: sau 30 giây (đồng hồ giả) màn hiện "Không tải được" với câu quá lâu và Thử lại tải được khi máy chủ hồi', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.clock.install();
  await signIn(page, staff.username, staff.password);
  let hang = true;
  await page.route('**/api/v2/me/income**', route => (hang ? new Promise(() => {}) : route.continue()));
  await page.goto('/nv/thu-nhap');
  await expect(page.getByText('Đang tải')).toBeVisible();
  await page.clock.runFor(29_000);
  await expect(page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })).toHaveCount(0);
  await page.clock.runFor(2_000);
  await expect(page.getByRole('alert').filter({ hasText: 'Máy chủ phản hồi quá lâu' })).toBeVisible();
  hang = false;
  await retryButton(page).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Không tải được dữ liệu' })).toHaveCount(0);
  await expect(page.locator('h1').first()).toBeVisible();
});

test('admin: máy chủ treo ở Bảng lương cũng hết treo sau 30 giây và có Thử lại', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.clock.install();
  await signInAdmin(page);
  let hang = true;
  await page.route(/\/api\/v2\/payroll\/\d{4}-\d{2}$/, route => (hang ? new Promise(() => {}) : route.continue()));
  const asked = page.waitForRequest(/\/api\/v2\/payroll\/\d{4}-\d{2}$/);
  await page.goto('/admin/bang-luong');
  await asked;
  await page.clock.runFor(31_000);
  await expect(page.getByRole('alert').filter({ hasText: 'Máy chủ phản hồi quá lâu' })).toBeVisible();
  hang = false;
  await retryButton(page).click();
  await expect(page.locator('.period')).toBeVisible();
});

// Chuông: không đếm được số việc chờ thì hiện "?" (không rõ), không im lặng hiện 0; đọc lại được thì hiện số thật.
test('admin bell: số việc chờ lỗi → dấu ?, không phải 0', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAdmin(page);
  await page.route('**/api/v2/overview/pending-count', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }));
  await page.goto('/admin/tong-quan');
  const bell = page.locator('.topbar .bell');
  await expect(bell).toHaveAccessibleName('Thông báo, không rõ số việc cần xử lý');
  await expect(bell.locator('i')).toHaveText('?');
  await page.unroute('**/api/v2/overview/pending-count');
  await page.reload();
  await expect(bell).not.toHaveAccessibleName(/không rõ/);
  await expect(bell.getByText('?', { exact: true })).toHaveCount(0);
});

test('chuông: GET /overview/pending-count khớp đơn chờ + ngày cần giải trình', async () => {
  const [count, pending, due] = await Promise.all([
    admin.get('/api/v2/overview/pending-count').then(r => r.json()),
    admin.get('/api/v2/requests?status=PENDING&limit=1').then(r => r.json()),
    admin.get('/api/v2/requests/explanations-due').then(r => r.json())
  ]);
  expect(count.count).toBe(pending.total + due.items.length);
});
