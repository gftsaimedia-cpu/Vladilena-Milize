// Phần dùng chung của các spec demo-staff-*.spec.ts (mảng staff, docs/demo-db/staff.md). Không phải file test.
import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test';
import { passwordOf } from './fixtures/demo';

export const json = { 'Content-Type': 'application/json' };

/** Các đường dẫn API chưa có ở BE v2 (phiên settings-store đang làm): 404 ở đây ghi vào "chưa phủ", không tính là lỗi. */
export const NOT_BUILT = [/^\/api\/v2\/settings\//];

/**
 * Theo dõi một trang cho bất biến (b): không lỗi JS, không lỗi console, không API nào trả 5xx,
 * không API nào trả 404 ngoài danh sách NOT_BUILT. Dòng "Failed to load resource" của trình duyệt không tính:
 * mã của phản hồi đã được kiểm riêng (401/403/409 có chủ đích trong test thì truyền vào `expected`).
 */
export function watchPage(page: Page) {
  const problems: string[] = [];
  const missing = new Set<string>();
  const expected: Array<{ path: RegExp; status: number }> = [];
  page.on('pageerror', e => problems.push(`lỗi JS: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on('response', r => {
    const url = new URL(r.url());
    if (!url.pathname.startsWith('/api/')) return;
    const status = r.status();
    const line = `${status} ${r.request().method()} ${url.pathname}`;
    if (status >= 500) problems.push(line);
    else if (status === 404 && NOT_BUILT.some(rx => rx.test(url.pathname))) missing.add(`${r.request().method()} ${url.pathname}`);
    else if (status >= 400 && !expected.some(e => e.status === status && e.path.test(url.pathname))) problems.push(line);
  });
  return {
    problems,
    missing,
    /** Cho phép một mã lỗi có chủ đích (ví dụ 401 khi thử sai mật khẩu). */
    allow(path: RegExp, status: number) {
      expected.push({ path, status });
    },
    /** Gọi ở cuối test: không có vấn đề nào. Đường dẫn chưa có ở BE thì ghi vào chú thích của test. */
    check() {
      if (missing.size) test.info().annotations.push({ type: 'chưa phủ', description: `BE chưa có: ${[...missing].join(', ')}` });
      expect(problems, 'bất biến (b): không lỗi JS, console, 5xx hay 4xx ngoài dự kiến').toEqual([]);
    }
  };
}

/** Một phiên API riêng (hũ cookie riêng) đăng nhập như `username`; nhớ gọi dispose(). */
export async function sessionOf(username: string, password = passwordOf(username)): Promise<APIRequestContext> {
  const baseURL = test.info().project.use.baseURL;
  const ctx = await pwRequest.newContext({ baseURL });
  const login = await ctx.post('/api/v2/auth/login', { headers: json, data: { username, password } });
  // POST /auth/login trả 201 (mặc định POST của NestJS); FE chỉ xét res.ok, nên test cũng chỉ đòi 2xx.
  expect(login.ok(), `đăng nhập ${username}: ${login.status()}`).toBe(true);
  return ctx;
}

/** Một phiên API chưa đăng nhập. */
export async function anonymous(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: test.info().project.use.baseURL });
}

/** Thử đăng nhập, trả mã và thân (không ném lỗi). */
export async function tryLogin(ctx: APIRequestContext, username: string, password: string) {
  const r = await ctx.post('/api/v2/auth/login', { headers: json, data: { username, password } });
  return { status: r.status(), ok: r.ok(), body: await r.json().catch(() => null), retryAfter: r.headers()['retry-after'] };
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' như app hiện. */
export const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Điền ô đăng nhập và bấm Đăng nhập (không chờ chuyển trang). */
export async function fillLogin(page: Page, username: string, password: string) {
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(username);
  await page.locator('#lg-pass').fill(password);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
}
