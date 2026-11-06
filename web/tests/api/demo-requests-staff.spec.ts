// Đơn từ trong app nhân viên với BE thật: /nv/yeu-cau trên điện thoại (dưới 1136px) và máy tính (từ 1136px):
// danh sách, số trên thanh lọc, chi tiết, huỷ, nút Tạo yêu cầu. Chạy qua `npm run demo -- test requests`; bảng tình huống ở
// docs/demo-db/requests.md. Test này chỉ đọc (không duyệt, không huỷ đơn nào), kỳ vọng đọc từ API lúc chạy.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, apiAs, demoReadyFor, signIn } from './fixtures/demo';

test.skip(!demoReadyFor('requests'), 'Chạy qua npm run demo -- test requests');

const json = { 'Content-Type': 'application/json' };
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const STATUS_TEXT: Record<string, string> = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã huỷ' };

type Req = { id: string; type: string; status: string; reviewNote: string | null };

function watchConsole(page: Page, allow: RegExp[] = []) {
  const errors: string[] = [];
  page.on('console', m => {
    if (m.type() === 'error' && !allow.some(a => a.test(m.text()))) errors.push(m.text());
  });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return () => expect(errors, 'lỗi console').toEqual([]);
}

/** Đơn của `username` như nhân viên đó đọc qua /me. */
const myRequests = (request: APIRequestContext, username: string): Promise<Req[]> =>
  apiAs(request, username, async () => {
    const res = await request.get('/api/v2/me/requests', { headers: json });
    expect(res.status()).toBe(200);
    return (await res.json()).items;
  });
/** Trạng thái đơn như Admin đọc qua /requests/:id. */
const adminStatus = (request: APIRequestContext, ids: string[]): Promise<Map<string, Req>> =>
  apiAs(request, ADMIN, async () => {
    const out = new Map<string, Req>();
    for (const id of ids) {
      const res = await request.get(`/api/v2/requests/${id}`, { headers: json });
      expect(res.status()).toBe(200);
      out.set(id, (await res.json()).request);
    }
    return out;
  });

function tabCounts(items: Req[]) {
  const n = (...s: string[]) => items.filter(r => s.includes(r.status)).length;
  return { 'Tất cả': items.length, 'Chờ duyệt': n('PENDING'), 'Đã duyệt': n('APPROVED'), 'Từ chối': n('REJECTED', 'CANCELLED') };
}

async function expectList(page: Page, items: Req[]) {
  for (const [label, count] of Object.entries(tabCounts(items))) {
    await expect(page.getByRole('tab', { name: `${label} ${count}` })).toBeVisible();
  }
  const rows = page.locator('a.ro');
  await expect(rows).toHaveCount(items.length);
  for (const r of items) {
    await expect(page.locator(`a.ro[data-yc="${r.id}"]`)).toHaveAttribute('aria-label', new RegExp(`, ${STATUS_TEXT[r.status]}$`));
  }
}

async function openRequest(page: Page, id: string) {
  await page.goto(`/nv/yeu-cau?yc=${id}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('phone: the filter counts and rows match my requests', async ({ page, request }) => {
  const consoleOk = watchConsole(page);
  const items = await myRequests(request, 'dt-an');
  expect(items.length).toBeGreaterThanOrEqual(4);
  await page.setViewportSize(PHONE);
  await signIn(page, 'dt-an');
  await page.goto('/nv/yeu-cau');
  await expect(page.getByRole('heading', { level: 1, name: 'Yêu cầu' })).toBeVisible();
  await expectList(page, items);
  consoleOk();
});

test('phone: each request opens with the status Admin sees', async ({ page, request }) => {
  const consoleOk = watchConsole(page);
  await page.setViewportSize(PHONE);
  for (const username of ['dt-an', 'dt-khoa']) {
    const items = await myRequests(request, username);
    const admin = await adminStatus(request, items.map(r => r.id));
    await page.context().clearCookies(); // người trước còn phiên thì /dang-nhap chuyển đi chỗ khác
    await signIn(page, username);
    for (const r of items) {
      const dialog = await openRequest(page, r.id);
      await expect(dialog.locator('.st')).toHaveText(STATUS_TEXT[admin.get(r.id)!.status]);
      if (r.type === 'ISAT') await expect(dialog).toContainText('Nghỉ Thứ Bảy (iSAT)');
    }
  }
  consoleOk();
});

test('desktop: the Yêu cầu box shows the same list and opens the drawer', async ({ page, request }) => {
  const consoleOk = watchConsole(page);
  await page.setViewportSize(DESKTOP);
  for (const username of ['dt-an', 'dt-giang']) {
    const items = await myRequests(request, username);
    const admin = await adminStatus(request, items.map(r => r.id));
    await page.context().clearCookies(); // người trước còn phiên thì /dang-nhap chuyển đi chỗ khác
    await signIn(page, username);
    await page.goto('/nv/yeu-cau');
    await expect(page.getByRole('heading', { level: 2, name: 'Yêu cầu' })).toBeVisible();
    await expectList(page, items);
    for (const r of items) {
      const dialog = await openRequest(page, r.id);
      await expect(dialog.locator('.st')).toHaveText(STATUS_TEXT[admin.get(r.id)!.status]);
    }
  }
  consoleOk();
});

test('a request of someone else does not open', async ({ page, request }) => {
  // Máy chủ trả 404 cho đơn không phải của mình: trình duyệt ghi "Failed to load resource … 404", đó là đúng luồng.
  const consoleOk = watchConsole(page, [/status of 404/]);
  const other = (await myRequests(request, 'dt-binh'))[0];
  await page.setViewportSize(PHONE);
  await signIn(page, 'dt-an');
  await page.goto(`/nv/yeu-cau?yc=${other.id}`);
  await expect(page).toHaveURL(/\/nv\/yeu-cau$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  consoleOk();
});

test('approved, rejected and cancelled requests offer no cancel button', async ({ page, request }) => {
  const consoleOk = watchConsole(page);
  const done = (await myRequests(request, 'dt-an')).filter(r => r.status !== 'PENDING');
  expect(done.map(r => r.status).sort()).toEqual(['APPROVED', 'CANCELLED', 'REJECTED']);
  await page.setViewportSize(PHONE);
  await signIn(page, 'dt-an');
  for (const r of done) {
    const dialog = await openRequest(page, r.id);
    await expect(dialog.getByRole('button', { name: /huỷ|hủy/i })).toHaveCount(0);
  }
  consoleOk();
});

test('a pending request can be cancelled from the app', async ({ page, request }) => {
  test.fail(true, 'BUG-requests-10: chi tiết đơn đang chờ không có nút huỷ (luật 05/11: huỷ được đơn đang chờ, không hỏi lý do; phiên staff-requests đang làm)');
  const pending = (await myRequests(request, 'dt-an')).find(r => r.status === 'PENDING')!;
  await page.setViewportSize(PHONE);
  await signIn(page, 'dt-an');
  const dialog = await openRequest(page, pending.id);
  // Chỉ kiểm nút có mặt, không bấm: test này không đổi dữ liệu.
  await expect(dialog.getByRole('button', { name: /huỷ|hủy/i })).toBeVisible({ timeout: 3000 });
});

test('Tạo yêu cầu offers the six request kinds', async ({ page }) => {
  test.fail(true, 'BUG-requests-11: nút Tạo yêu cầu chỉ báo "Chưa có luồng tạo yêu cầu trong bản mockup" (luật 05/11: 6 loại; phiên staff-requests đang làm)');
  await page.setViewportSize(PHONE);
  await signIn(page, 'dt-phu');
  await page.goto('/nv/yeu-cau');
  await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
  for (const kind of ['Đơn nghỉ', 'Nghỉ có làm bù', 'Làm thêm giờ', 'Đổi ca', 'Giải trình', 'Tạm ứng']) {
    await expect(page.getByText(kind, { exact: true })).toBeVisible({ timeout: 3000 });
  }
});

test('the Admin note on a rejected request shows in my request detail', async ({ page, request }) => {
  test.fail(true, 'BUG-requests-12: ghi chú Admin khi từ chối không hiện ở chi tiết đơn của nhân viên, dù hộp duyệt ghi "Nhân viên xem được ghi chú trong chi tiết yêu cầu"');
  const rejected = (await myRequests(request, 'dt-an')).find(r => r.status === 'REJECTED')!;
  expect(rejected.reviewNote).toBeTruthy();
  await page.setViewportSize(PHONE);
  await signIn(page, 'dt-an');
  const dialog = await openRequest(page, rejected.id);
  await expect(dialog).toContainText(rejected.reviewNote!, { timeout: 3000 });
});
