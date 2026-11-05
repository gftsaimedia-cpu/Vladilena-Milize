# Nền móng xác thực và `api()` thật — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BE mặc định đóng (guard + năng lực + phiên thu hồi được + giới hạn đăng nhập); FE gọi BE thật qua `api()`, có công tắc `VITE_DATA=mock|api`, đăng nhập/đăng xuất/đổi mật khẩu thật.

**Architecture:** Guard toàn cục `APP_GUARD` trong `AuthModule` đọc cookie, gán `req.user`, kiểm dấu `@Public/@Authenticated/@RequireCap`. Năng lực theo vai trò trong một file domain. FE: `http.ts` dùng `fetch`, `data-mode.ts` chọn cài đặt mock hoặc api cho từng service.

**Tech Stack:** NestJS 10 + Express + Kysely/pg, `node:test` + tsx; Vue 3 + Vite + Pinia, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-fe-be-auth-foundation-design.md`

**Execution (chat 2026-11-05):** người dùng đặt goal "làm cho đến khi nối xong các API hiện có với FE…" → chạy native, liên tục. Thư mục không phải git repo → **không có bước commit**; mỗi task kết thúc bằng `npm test` xanh.

## Global Constraints

- Node >= 22.13. Không chạy `npm run typecheck`, `npm run format:check`.
- Chỉ sửa `src/`, `web/`, `test/v2/`, `docs/superpowers/`. Không sửa `deploy/`, `scripts/`, `Dockerfile`.
- Năng lực: `config.read`, `config.write`, `payroll.calculate`, `payroll.approve`, `attendance.correct`, `attendance.lock`, `audit.read`, `staff.manage`, `requests.review`. `admin` có tất cả, `staff` không có gì.
- Mã lỗi: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `INVALID_CREDENTIALS` 401, `ACCOUNT_LOCKED` 403, `TOO_MANY_ATTEMPTS` 429, `UNSUPPORTED_MEDIA_TYPE` 415, `PAYLOAD_TOO_LARGE` 413, `INVALID_JSON` 400.
- Câu sai đăng nhập: "Sai tên đăng nhập hoặc mật khẩu". Câu chưa nối FE: "Màn này chưa nối dữ liệu thật." (`code: 'not_connected'`, status 501).
- Giới hạn đăng nhập: 5 lần sai / 15 phút mỗi (IP, tên); 30 tên / 15 phút mỗi IP.
- Cookie: `session=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=<SESSION_DAYS*86400>` (+ `; Secure` khi `COOKIE_SECURE=1`), `SESSION_DAYS` mặc định 14.

## Review Focus

1. Route mới thêm quên dấu quyền → phải bị test "mặc định đóng" bắt (Task 1).
2. Cookie `session` có nhiều cookie khác đứng trước/sau (`a=1; session=x; b=2`) → vẫn đọc đúng (Task 2, test `reads session among other cookies`).
3. Token giả mạo có payload JSON hỏng hoặc base64 rác → `verifySession` trả `null`, không ném 500 (Task 3, test `garbage token`).
4. Tên đăng nhập khác hoa/thường hoặc có khoảng trắng → giới hạn đăng nhập đếm chung một khoá (Task 4, test `normalizes username`).
5. FE nhận 204/body rỗng hoặc HTML từ proxy → không ném lỗi parse thô (Task 8, xử lý `bad_response`; kiểm tay khi chạy dự án `api`).

---

### Task 1: Decorator quyền, bảng năng lực, test "mặc định đóng"

**Files:**
- Create: `src/common/decorators/access.decorator.ts`, `src/modules/auth/domain/capabilities.ts`, `src/modules/auth/domain/index.ts`
- Modify: `src/common/index.ts`, mọi `src/modules/*/*.controller.ts` (gắn dấu theo bảng 5.2 của spec)
- Test: `test/v2/auth-access.test.ts`

**Interfaces:**
- Produces: `Public()`, `Authenticated()`, `RequireCap(cap: Capability)`; hằng `ACCESS_KEY = 'access'`; kiểu `AccessRule = { kind: 'public' } | { kind: 'authenticated' } | { kind: 'cap'; cap: Capability }`; `type Capability`; `ALL_CAPS: readonly Capability[]`; `capsOf(role: string): Capability[]`.

- [ ] Test `every handler declares exactly one access rule`: duyệt controllers của các module trong `AppModule` (đọc metadata `imports` → `controllers`), mỗi method có `PATH_METADATA` phải có `Reflect.getMetadata(ACCESS_KEY, handler)` khác undefined.
- [ ] Test `access table matches spec`: bảng `[controller, method, expected]` cho từng route ở spec 5.2 (ví dụ `[SystemController, 'health', {kind:'public'}]`, `[HolidaysController, 'create', {kind:'cap', cap:'config.write'}]`).
- [ ] Test `capsOf`: `capsOf('admin')` deepEqual `ALL_CAPS` (9 phần tử), `capsOf('staff')` và `capsOf('xyz')` là `[]`.
- [ ] Chạy `node --import tsx --test test/v2/auth-access.test.ts` → FAIL (module chưa có).
- [ ] Cài decorator bằng `SetMetadata(ACCESS_KEY, rule)`; gắn dấu cho mọi handler. Gắn ở mức method (không mức class) để bảng trong test đọc thẳng.
- [ ] Chạy lại → PASS; `npm test` → xanh.

### Task 2: `AuthGuard` toàn cục

**Files:**
- Create: `src/modules/auth/auth.guard.ts`
- Modify: `src/modules/auth/auth.module.ts` (provider `{ provide: APP_GUARD, useClass: AuthGuard }`), `src/common/exceptions/http.exception.ts` (`UnauthorizedError` mặc định `code: 'UNAUTHENTICATED'`)
- Test: `test/v2/auth-guard.test.ts`

**Interfaces:**
- Consumes: `ACCESS_KEY`, `capsOf`, `AuthService.verifySession(token): Promise<AuthenticatedUser | null>`.
- Produces: `readSessionCookie(header: string | undefined): string` (export từ `auth.guard.ts`); `req.user: AuthenticatedUser`.

- [ ] Test với `ExecutionContext` giả (`getHandler`, `getClass`, `switchToHttp().getRequest()`) và `AuthService` giả: không cookie + cap → ném `HttpError` 401 `UNAUTHENTICATED`; staff + cap → 403 `FORBIDDEN`; admin + cap → `true` và `req.user.username === 'admin'`; public không cookie → `true`; authenticated + staff → `true`; handler không có dấu → 403 (phòng thủ).
- [ ] Test `reads session among other cookies`: `readSessionCookie('a=1; session=tok; b=2') === 'tok'`; không có → `''`.
- [ ] FAIL → cài → PASS → `npm test` xanh.

### Task 3: Phiên có `session_version`, đăng nhập an toàn, `/auth/me`, đổi mật khẩu

**Files:**
- Modify: `src/modules/auth/auth.service.ts`, `src/modules/auth/auth.controller.ts`; xoá `src/modules/auth/auth.helpers.ts` (require `../../platform/http` không tồn tại, không ai import)
- Test: `test/v2/auth-session.test.ts`; sửa `test/v2/auth-system.test.ts` cho chữ ký mới

**Interfaces:**
- Produces:
  - `AuthService.createSessionToken(username: string, sessionVersion: number): string`
  - `AuthService.verifySession(token: string): Promise<AuthenticatedUser | null>` (`AuthenticatedUser` thêm `payrollSubject: boolean`)
  - `AuthService.login(username, password): Promise<{ user: AuthenticatedUser; token: string }>` ném `HttpError` 401 `INVALID_CREDENTIALS` / 403 `ACCOUNT_LOCKED`
  - `AuthService.changePassword(username, oldPass, newPass): Promise<string>` (trả token mới)
  - `AuthService.mePayload(user: AuthenticatedUser | null): MePayload` với `MePayload = { user: null } | { user, roles: string[], caps: Capability[], payrollSubject: boolean, serverNow: string }`
  - `createCookieHeader(token)` đọc `SESSION_DAYS`, `COOKIE_SECURE` lúc gọi (không lúc nạp module)
- Controller: `POST v2/auth/login` → `{ ok: true, user }`; `POST v2/auth/logout`; `GET v2/auth/me` và `GET me` → `mePayload`; `PUT v2/auth/password` → đặt cookie mới, `{ ok: true }`. Xoá `POST login`, `POST logout`, `PUT password`.

- [ ] Tests (dùng `createScriptedKysely` trả dòng `staff`): token đúng `sv` → user; `sv` lệch → null; token không có `sv` → null; `garbage token` (`'abc.def'`, `'x'`, payload không phải JSON có chữ ký đúng) → null; `locked_at` → null; login không có tài khoản và sai mật khẩu → cùng `code: 'INVALID_CREDENTIALS'` và cùng câu; khoá + sai → `INVALID_CREDENTIALS`; khoá + đúng → `ACCOUNT_LOCKED`; `changePassword` sinh câu `UPDATE` có `session_version` +1 và token mới mang `sv` mới; `mePayload(null)` deepEqual `{ user: null }`; `payrollSubject` null+admin → false, null+staff → true, 0 → false, 1 → true; cookie có `Secure` khi `COOKIE_SECURE=1`, `Max-Age=1209600` mặc định, `Max-Age=86400` khi `SESSION_DAYS=1`.
- [ ] FAIL → cài. Không có tài khoản thì vẫn `verifyPassword(pass, DUMMY_HASH)` với `DUMMY_HASH = hashPassword('dummy-password')` tính một lần.
- [ ] PASS → `npm test` xanh.

### Task 4: `LoginRateLimiter`

**Files:**
- Create: `src/modules/auth/domain/login-rate-limiter.ts`
- Modify: `src/modules/auth/auth.controller.ts` (login dùng `req.ip`), `src/modules/auth/auth.module.ts` (provider `LoginRateLimiter` với `now = Date.now`)
- Test: `test/v2/auth-rate-limit.test.ts`

**Interfaces:**
- Produces: `class LoginRateLimiter { constructor(now?: () => number); check(ip: string, username: string): { allowed: true } | { allowed: false; retryAfterSec: number }; recordFailure(ip, username): void; recordSuccess(ip, username): void }`. Hằng `WINDOW_MS = 15*60_000`, `MAX_FAILURES = 5`, `MAX_NAMES_PER_IP = 30`.
- Controller: bị chặn → `HttpError(429, 'Bạn đã thử quá nhiều lần. Thử lại sau <n> phút.', { code: 'TOO_MANY_ATTEMPTS' })` và header `Retry-After`.

- [ ] Tests: 5 lần sai rồi `check` → `allowed:false`, `retryAfterSec` ≤ 900; qua 15 phút → mở; `recordSuccess` xoá; tên thứ 31 khác nhau từ một IP → chặn, IP khác vẫn qua; `normalizes username` (`' Nam '` và `'nam'` cùng khoá); mục hết hạn bị dọn (kích thước map nội bộ về 0 sau cửa sổ).
- [ ] FAIL → cài → PASS → `npm test` xanh.

### Task 5: Bootstrap — trust proxy, 415, giới hạn body

**Files:**
- Modify: `src/bootstrap.ts`
- Test: `test/v2/bootstrap-http.test.ts`

**Interfaces:**
- Produces: `requireJsonBody(req, res, next)` và `jsonBodyErrors(err, req, res, next)` export từ `src/common/http-guards.ts` (file mới) để test được không cần Nest.

- [ ] Tests với `req/res` giả: `POST` không `Content-Type` → 415 `UNSUPPORTED_MEDIA_TYPE`; `POST application/json; charset=utf-8` → `next()`; `GET` không header → `next()`; lỗi `type: 'entity.too.large'` → 413 `PAYLOAD_TOO_LARGE`; lỗi `type: 'entity.parse.failed'` → 400 `INVALID_JSON`.
- [ ] FAIL → cài; trong `createServer`: `instance.set('trust proxy', Number(process.env.TRUST_PROXY) || 0)`, `instance.use('/api', requireJsonBody)`, `express.json({ limit: '1mb' })`, `instance.use(jsonBodyErrors)`.
- [ ] PASS → `npm test` xanh.

### Task 6: Người thao tác lấy từ phiên

**Files:**
- Modify: `src/modules/{requests,employees,holidays,payroll,system}/*.controller.ts`
- Test: `test/v2/actor-from-session.test.ts`

- [ ] Test: `RequestsController.reviewRequest('id', { action: 'APPROVE', reviewerId: 'mallory' }, user)` với service giả ghi lại tham số → reviewer là `user.username`. Tương tự `EmployeesController.deactivate` dùng `user.username`.
- [ ] FAIL → bỏ mọi `|| 'system'` và `body.reviewerId`; tham số `@CurrentUser() user: UserSession` (không còn optional). `CurrentUser` đọc `req.user`.
- [ ] PASS → `npm test` xanh.

### Task 7: Test HTTP trên Postgres

**Files:**
- Create: `test/v2/auth-http.pg.test.ts`

- [ ] Theo khuôn `payroll-repository.pg.test.ts` (DB tạm, chạy 5 migration, xoá DB khi xong). Chèn `admin` (role admin) và `nv1` (role staff) với `hashPassword('Matkhau@123')`. Đặt `process.env.DATABASE_URL` tới DB tạm **trước** khi `require('../../src/bootstrap')`; `createServer().listen(0)`.
- [ ] Các ca ở spec 8.2. Thiếu `PG_TEST_URL` → `t.skip`.
- [ ] Chạy với `PG_TEST_URL` (Postgres local theo `docs/postgres-local.md`) → PASS. Không có Docker → ghi rõ "chưa chạy được" trong báo cáo.

### Task 8: FE `api()` thật, proxy, công tắc

**Files:**
- Modify: `web/src/services/http.ts`, `web/vite.config.ts`, `web/package.json`, `web/playwright.config.ts`
- Create: `web/src/services/data-mode.ts`, `web/src/env.d.ts` (khai báo `ImportMetaEnv.VITE_DATA`)

**Interfaces:**
- Produces: `MOCK: boolean`; `notConnected(): Promise<never>` (export từ `data-mode.ts`, ném `ApiError(501, 'Màn này chưa nối dữ liệu thật.', { code: 'not_connected' })`); `api.patch`.

- [ ] Cài `api()` theo spec 6.1 và 7.2. Body JSON đọc bằng `res.text()` rồi `JSON.parse` trong `try`; rỗng → `{}`.
- [ ] `package.json`: `"dev:mock": "vite --mode mock"`; tạo `web/.env.mock` với `VITE_DATA=mock`. Playwright: `webServer.command` dùng `npm run dev:mock -- ...`.
- [ ] Kiểm: `npm --prefix web run test:ui` → 20 file xanh như trước.

### Task 9: FE phiên thật, service chỉ-mock trả `not_connected`

**Files:**
- Modify: `web/src/services/session.ts`, `web/src/stores/session.ts`, `web/src/services/{staff-phone,admin-attendance,admin-hr,admin-payroll,shell,admin-main}.ts`, `web/src/stores/{period,shell}.ts`, `web/src/components/shell/{BellDrawer,InboxDetail}.vue`

- [ ] Session theo spec 6.4. `stores/session.ts` `load()`: `MOCK ? mockAccount… : await api.get('/auth/me')`.
- [ ] Mỗi hàm service dữ liệu giả: `MOCK ? <mock> : notConnected()` (Task "nối màn" sau sẽ thay `notConnected` bằng cài đặt thật).
- [ ] Component/store import **giá trị** từ `@/mock` để đọc dữ liệu nghiệp vụ: chuyển qua service. Hằng hiển thị giữ nguyên.
- [ ] Kiểm: Playwright mock xanh; `npm --prefix web run build` (mặc định `api`) rồi `grep -r "aicb.mock.session" web/dist` → không có kết quả.

### Task 10: Playwright dự án `api`

**Files:**
- Create: `web/tests/api/auth.spec.ts`, `web/tests/api/README.md` không cần (ghi hướng dẫn chạy trong comment đầu file)
- Modify: `web/playwright.config.ts` (2 project: `mock` testDir `./tests` bỏ qua `api/**`; `api` testDir `./tests/api`, chỉ chạy khi có `PW_API=1`)

- [ ] 4 ca ở spec 8.3. Tài khoản lấy từ `PW_ADMIN_USER/PW_ADMIN_PASS`, `PW_STAFF_USER/PW_STAFF_PASS`; fixture tạo nhân viên qua `POST /api/v2/employees` nếu chưa có.
- [ ] Chạy khi có BE + Postgres; không có → ghi rõ trong báo cáo.

---

Sau plan này: plan `2026-11-05-fe-wire-existing-apis.md` (nối từng màn FE với API hiện có) và spec `2026-11-05-missing-apis-design.md` (API còn thiếu).
