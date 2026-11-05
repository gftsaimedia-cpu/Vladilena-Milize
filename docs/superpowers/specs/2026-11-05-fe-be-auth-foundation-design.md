# Nối FE với BE — spec 1: Nền móng xác thực và `api()` thật

- Ngày: 2026-11-05
- Trạng thái: chờ người dùng duyệt
- Loại: Architectural (đổi giao diện giữa FE và BE)
- Nguồn quyết định: người dùng trong chat ngày 2026-11-05

## 1. Bối cảnh

Khảo sát ngày 2026-11-05 (thư mục tải về, **không phải git repo**, nên không xác định được commit của `feat/pure-v2-backend`):

- **FE (`web/`)** chạy hoàn toàn bằng dữ liệu giả. `api()` trong `web/src/services/http.ts` không gọi mạng, luôn ném `ApiError` mã `mock_missing`. Phiên đăng nhập là giả (`web/src/mock/accounts.ts`, mặc định `admin`). Vite chưa có proxy `/api`.
- **BE (`src/`)** có 8 module dưới `/api/v2/*` và auth ở `/api/{login,logout,me,password}` cùng `/api/v2/auth/*`. **Không có middleware xác thực**: không chỗ nào gán `req.user`, nên `@CurrentUser()` luôn `undefined`, mọi API nghiệp vụ mở cho bất kỳ ai, và các controller lấy người thao tác từ body hoặc ghi `'system'`.
- `GET /api/me` chỉ trả `{ me: user }`, thiếu `roles`, `caps`, `payrollSubject`, `serverNow` mà `web/src/stores/session.ts` cần.
- Token phiên tự ký HMAC, 30 ngày, không thu hồi được. Bảng `staff` đã có cột `session_version` nhưng chưa dùng.

## 2. Mục tiêu đợt nối FE–BE và cách chia

Mục tiêu cuối: **app nhân viên chạy trên dữ liệu thật, đủ an toàn cho nhân viên thật dùng.** Deploy bằng Docker Compose + Caddy (mẫu có sẵn ở `deploy/`).

Chia thành các spec nối tiếp, mỗi spec có plan và lượt duyệt riêng:

1. **Spec 1 (tài liệu này):** nền móng xác thực, phân quyền ở BE; `api()` thật, công tắc dữ liệu giả và phiên đăng nhập thật ở FE.
2. **Spec 2:** app nhân viên (`/nv/*`, `/nv-may-tinh`) đọc và ghi dữ liệu thật qua nhóm `/api/v2/me/*`.
3. **Spec vận hành (sau):** migration runner, bắt buộc secret, admin đầu tiên, compose/Caddy cho khớp v2, sao lưu. Người dùng đã tạm hoãn phần này.
4. **Sau đó:** nối các màn Admin.

**Không đưa nhân viên thật vào dùng trước khi xong spec 2 và spec vận hành.**

## 3. Quyết định đã chốt

| # | Quyết định |
|---|------------|
| D1 | Làm nền móng trước, rồi app nhân viên, rồi Admin. |
| D2 | Đích là môi trường thật (Docker Compose + Caddy). Phần vận hành tách spec riêng, tạm hoãn. |
| D3 | Đợt đầu chỉ có hai vai trò: `admin` và `staff`. Kiểm quyền viết theo năng lực để mở rộng sau. |
| D4 | Hướng C: BE có nhóm API "của tôi" (`/api/v2/me/*`, spec 2) lấy danh tính từ phiên; BE trả dữ liệu nghiệp vụ, FE định dạng và gắn nhãn; giữ dữ liệu giả sau công tắc `VITE_DATA`. |
| D5 | Thay đổi nằm trong `src/` (BE) và `web/` (FE). Test ở `test/v2/` và `web/tests/`. Không sửa `deploy/`, `scripts/`, `Dockerfile`, `docs/` ngoài file spec/plan này. |

## 4. Phạm vi

**Trong phạm vi:** mục 5 (BE), mục 6 (FE), mục 7 (lỗi), mục 8 (kiểm thử).

**Ngoài phạm vi:**
- Nhóm `/api/v2/me/*` và mọi màn nhân viên đọc dữ liệu thật (spec 2).
- Nối các màn Admin.
- Migration runner, bắt buộc `SESSION_SECRET`/`ADMIN_PASSWORD`, bỏ mật khẩu admin mặc định, sửa compose/Caddy, sao lưu (spec vận hành).
- Sửa `docs/api/v2-contract.md`, `docs/HANDOFF-V2-BACKEND.md` (hai file này đang lệch với code và sẽ tiếp tục lệch).
- Các vai trò ngoài `admin`/`staff`.

## 5. BE: xác thực, phiên, quyền

### 5.1 Guard toàn cục, mặc định đóng

- `AuthGuard` đăng ký bằng `APP_GUARD` trong `AuthModule`. Guard đọc cookie `session`, gọi `AuthService.verifySession`, gán `req.user` (dạng `UserSession` sẵn có trong `src/common/decorators/current-user.decorator.ts`).
- Mọi route dưới `/api/*` bắt buộc có phiên hợp lệ, trừ route có `@Public()`.
- Route có `@RequireCap(cap)` bắt buộc người dùng có năng lực đó. Thiếu thì 403.
- Route có `@Authenticated()` chỉ cần phiên hợp lệ, không cần năng lực.
- Mỗi route phải có đúng một trong ba dấu: `@Public()`, `@Authenticated()` hoặc `@RequireCap(...)`. Test ở mục 8.1 bảo đảm điều này.
- Ba decorator đặt ở `src/common/decorators/` cạnh `current-user.decorator.ts`.

### 5.2 Năng lực theo vai trò

File duy nhất `src/modules/auth/domain/capabilities.ts`:

- Danh sách năng lực: `config.read`, `config.write`, `payroll.calculate`, `payroll.approve`, `attendance.correct`, `attendance.lock`, `audit.read`, `staff.manage`, `requests.review`. Sáu năng lực đầu tiên trùng với `ADMIN_CAPS` của FE (trừ `config.write`, mới thêm).
- `admin` có tất cả. `staff` không có năng lực nào.
- Hàm `capsOf(role): string[]`. Vai trò lạ trả mảng rỗng.

Gắn năng lực cho route hiện có:

| Controller | Route | Năng lực |
|---|---|---|
| auth | `POST /api/v2/auth/login`, `POST /api/v2/auth/logout`, `GET /api/v2/auth/me`, `GET /api/me` | `@Public()` |
| auth | `PUT /api/v2/auth/password` | `@Authenticated()` |
| system | `GET /api/health`, `GET /api/v2/system/health` | `@Public()` |
| system | `GET settings`, `GET periods` | `config.read` |
| system | `PUT settings/:key` | `config.write` |
| system | `GET audit` | `audit.read` |
| system | `POST periods/:month/lock` | `attendance.lock` |
| employees | tất cả | `staff.manage` |
| roles | `GET /api/roles`, `GET /api/v2/roles` | `staff.manage` |
| holidays | `GET` | `config.read` |
| holidays | `POST`, `POST quick-add`, `DELETE` | `config.write` |
| attendance | tất cả | `attendance.correct` |
| requests | tất cả | `requests.review` |
| payroll | `GET :month`, `GET :month/:employeeId`, `POST :month/calculate`, `PUT :month/kpi/:username` | `payroll.calculate` |

Hệ quả: trong khoảng giữa spec 1 và spec 2, nhân viên đăng nhập được nhưng không gọi được API nghiệp vụ nào.

### 5.3 Người thao tác lấy từ phiên

- Bỏ mọi chỗ dự phòng `|| 'system'` và mọi trường người thao tác do client gửi (`reviewerId` trong `PATCH /requests/:id/review`). Người thao tác luôn là `req.user.username`.
- Các route admin vẫn nhận `employeeId`/`username` của **người được thao tác** từ body hoặc path, vì admin làm thay nhân viên.

### 5.4 Phiên

- Payload token: `{ u: username, sv: session_version, exp }`. Token không có `sv` (token cũ) bị từ chối, nên mọi người đăng nhập lại một lần sau khi triển khai.
- `verifySession` từ chối khi: chữ ký sai, hết hạn, không có tài khoản, `locked_at` có giá trị, hoặc `sv` khác `staff.session_version`.
- Đổi mật khẩu tăng `session_version` lên 1, rồi cấp cookie mới cho thiết bị đang đổi, nên thiết bị đó vẫn đăng nhập còn các thiết bị khác bị đăng xuất.
- Khoá tài khoản đã cắt phiên nhờ kiểm `locked_at`, không cần tăng `session_version`.
- Đăng xuất chỉ xoá cookie trên thiết bị đó.
- Thời hạn phiên: `SESSION_DAYS` (mặc định 14 ngày). Cookie: `HttpOnly; SameSite=Lax; Path=/; Max-Age=<SESSION_DAYS ngày>`, thêm `Secure` khi `COOKIE_SECURE=1`.
- `upsert` của `EmployeesRepository` không ghi đè `session_version` khi cập nhật (đã kiểm), nên sửa hồ sơ không làm sống lại phiên cũ.

### 5.5 Đường dẫn auth

Giữ:
- `POST /api/v2/auth/login` → `{ ok: true, user }` và đặt cookie. **Không** trả `token` trong body nữa (cookie `HttpOnly` là đủ; trả token trong body làm mất tác dụng của `HttpOnly`).
- `POST /api/v2/auth/logout` → `{ ok: true }`, xoá cookie.
- `GET /api/v2/auth/me` → xem 5.6.
- `PUT /api/v2/auth/password`, body `{ oldPassword, newPassword }`.
- `GET /api/me`: alias công khai của `GET /api/v2/auth/me`, giữ vì `HEALTHCHECK` trong `Dockerfile` gọi đường này và cần mã 200.
- `GET /api/health`.

Bỏ: `POST /api/login`, `POST /api/logout`, `PUT /api/password`.

### 5.6 `GET /api/v2/auth/me`

Luôn trả 200.

- Chưa đăng nhập hoặc phiên không hợp lệ: `{ user: null }`.
- Đã đăng nhập:

```json
{
  "user": { "uuid": "...", "username": "nam.le", "name": "Lê Hoàng Nam", "role": "staff", "type": "nv", "level": 1 },
  "roles": ["staff"],
  "caps": [],
  "payrollSubject": true,
  "serverNow": "2026-11-05T02:40:00.000Z"
}
```

- `roles` = `[staff.role]`.
- `caps` = `capsOf(staff.role)`.
- `payrollSubject`: `staff.payroll_subject` là `null` thì bằng `role !== 'admin'`; có giá trị thì bằng `payroll_subject === 1`.
- `serverNow` = giờ máy chủ dạng ISO.

Dạng này khớp `apply()` trong `web/src/stores/session.ts`.

### 5.7 Đăng nhập

- Thứ tự kiểm: tìm tài khoản → kiểm mật khẩu → kiểm khoá. Không có tài khoản hoặc sai mật khẩu đều báo cùng một câu "Sai tên đăng nhập hoặc mật khẩu" (401). Chỉ khi mật khẩu đúng mới báo "Tài khoản đã bị tạm khóa" (403).
- Không có tài khoản thì vẫn chạy `verifyPassword` với một chuỗi băm giả, để thời gian phản hồi không để lộ tên nào có thật.

### 5.8 Giới hạn đăng nhập sai

- Class thuần `LoginRateLimiter` ở `src/modules/auth/domain/login-rate-limiter.ts`, nhận hàm `now()` từ ngoài vào, lưu trong bộ nhớ (một container).
- Luật:
  - 5 lần sai trong 15 phút cho mỗi cặp (IP, tên đăng nhập đã chuẩn hoá) thì chặn cặp đó tới hết cửa sổ;
  - mỗi IP thử tối đa 30 tên đăng nhập khác nhau trong 15 phút.
- Đăng nhập đúng xoá bộ đếm của cặp đó.
- Bị chặn: 429, `code: TOO_MANY_ATTEMPTS`, header `Retry-After` (giây). Khi bị chặn thì không kiểm mật khẩu.
- Dọn mục hết hạn khi ghi, để bộ nhớ không phình.
- IP lấy từ `req.ip`. `bootstrap.ts` đặt `instance.set('trust proxy', n)` với `n = Number(TRUST_PROXY)`, mặc định 0. Compose đặt sẵn `TRUST_PROXY=1`.

### 5.9 Chặn ghi không phải JSON và giới hạn body

- Middleware trong `bootstrap.ts`, đặt trước `express.json`: với `/api/*` và phương thức `POST`, `PUT`, `PATCH`, `DELETE`, header `Content-Type` phải bắt đầu bằng `application/json`, nếu không thì 415 `UNSUPPORTED_MEDIA_TYPE`. Kết hợp `SameSite=Lax`, form từ trang lạ không gửi được request ghi.
- `express.json({ limit: '1mb' })`, khớp `request_body 1MB` của Caddyfile.

## 6. FE: `api()` thật, công tắc dữ liệu giả, phiên thật

### 6.1 `api()` gọi thật (`web/src/services/http.ts`)

- `fetch('/api/v2' + path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body })`. `GET` không có body. Phương thức ghi luôn gửi `Content-Type: application/json`, kể cả body rỗng (`{}`).
- Giữ nguyên chữ ký: `api(method, path, body, opts)`, `api.get/post/put/del`, `qs`, `newRequestId`, `ApiError`, `onUnauthorized`, `onWarnings`.
- Thêm `api.patch`.
- 2xx: trả JSON. Có mảng `warnings` khác rỗng thì gọi handler của `onWarnings`.
- Lỗi: xem mục 7.2.
- 401 gọi handler của `onUnauthorized`, trừ khi `path === '/auth/login'`.

### 6.2 Vite proxy

`web/vite.config.ts`: `server.proxy['/api'] = { target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: false }`. Cùng origin nên cookie `HttpOnly` chạy bình thường, không cần CORS. Sửa comment đầu file cho đúng.

### 6.3 Công tắc `VITE_DATA`

- `web/src/services/data-mode.ts` xuất `export const MOCK = import.meta.env.VITE_DATA === 'mock'`. Không đặt biến thì là `api`.
- `web/package.json`: thêm lệnh `dev:mock` (`VITE_DATA=mock vite`). `npm run dev` và `npm run build` dùng `api`.
- `web/playwright.config.ts`: dự án hiện có chạy dev server với `VITE_DATA=mock`. Thêm dự án `api` riêng cho `tests/api/` (mục 8.3).
- Mỗi service đang trả dữ liệu giả chọn cài đặt theo `MOCK`, cùng tên hàm và cùng kiểu trả về:
  - `services/session.ts`, `stores/session.ts`: phiên thật hoặc phiên giả (6.4).
  - `services/staff-phone.ts`, `admin-attendance.ts`, `admin-hr.ts`, `admin-payroll.ts`, `shell.ts`, và các hàm dùng dữ liệu giả trong `admin-main.ts`: chế độ `mock` giữ nguyên; chế độ `api` thì ném `ApiError(501, 'Màn này chưa nối dữ liệu thật.', { code: 'not_connected' })`.
  - `stores/period.ts`, `stores/shell.ts` và các component đang import **giá trị** (không phải kiểu) từ `@/mock` (`BellDrawer.vue`, `InboxDetail.vue` và các view trong danh sách khảo sát): plan liệt kê từng import; giá trị nào là dữ liệu nghiệp vụ giả thì lấy qua service, giá trị nào là hằng hiển thị (nhãn, màu) thì giữ.
- **Yêu cầu an toàn:** ở chế độ `api`, không service nào trả dữ liệu giả, và phiên giả không bao giờ được đọc. Import kiểu từ `@/mock` vẫn được phép.
- Các service gọi `api()` theo đường dẫn V1 (`admin-config`, `admin-perm`, `admin-catalog`, `admin-advance`, `admin-explanations`, `payslip`, `staff-desktop`, `staff-requests`) giữ nguyên: ở chế độ `api` chúng nhận 404 hoặc 403 từ BE và hiện lỗi. Spec 2 và các spec Admin sẽ thay.

### 6.4 Phiên thật ở chế độ `api`

- `services/session.ts`:
  - `login({ username, password })`: chuẩn hoá tên (cắt khoảng trắng, viết thường), gọi `POST /auth/login`, rồi `loadSession()`.
  - `logout()`: gọi `POST /auth/logout`, rồi `useSessionStore().clear()`.
  - `changePassword(current, next)`: gọi `PUT /auth/password` với `{ oldPassword: current, newPassword: next }`.
- `stores/session.ts`: `load()` gọi `GET /auth/me` rồi `apply(data)`. Lỗi mạng thì `main.ts` đã có sẵn `catch(() => session.clear())`.
- Chế độ `mock` giữ nguyên hành vi hiện tại (`mock/accounts.ts`).

### 6.5 Kết quả cuối spec 1

- Chế độ `api`: đăng nhập, đăng xuất, đổi mật khẩu chạy thật. Admin vào khung Admin; các màn chưa nối hiện trạng thái lỗi "chưa nối dữ liệu thật" hoặc lỗi từ BE, không bao giờ hiện số giả. Nhân viên vào khu nhân viên; các màn chưa có dữ liệu cho tới spec 2.
- Chế độ `mock`: mọi thứ như hiện tại.

## 7. Xử lý lỗi

### 7.1 BE

Tất cả đi qua `ApiExceptionFilter` có sẵn, dạng `{ error, code, details }`.

| Tình huống | HTTP | `code` |
|---|---|---|
| Không có phiên, phiên hết hạn hoặc bị thu hồi (route cần phiên) | 401 | `UNAUTHENTICATED` |
| Có phiên nhưng thiếu năng lực | 403 | `FORBIDDEN` |
| Sai tên hoặc mật khẩu | 401 | `INVALID_CREDENTIALS` |
| Tài khoản bị khoá (mật khẩu đúng) | 403 | `ACCOUNT_LOCKED` |
| Bị giới hạn đăng nhập | 429 + `Retry-After` | `TOO_MANY_ATTEMPTS` |
| Ghi không phải JSON | 415 | `UNSUPPORTED_MEDIA_TYPE` |
| Body quá 1 MB | 413 | `PAYLOAD_TOO_LARGE` |
| Body JSON hỏng | 400 | `INVALID_JSON` |

Lỗi xác thực và phân quyền ném từ guard, không bị các khối `try/catch` của controller bọc thành 400.

**Rủi ro biết trước, để lại cho spec 2:** các controller hiện bọc mọi lỗi thành 400 kèm `err.message`, có thể lộ câu lỗi nội bộ (ví dụ của DB).

### 7.2 FE

| Tình huống | Kết quả |
|---|---|
| `fetch` ném lỗi (mất mạng, máy chủ tắt) | `ApiError(0, 'Không kết nối được máy chủ.', { code: 'network' })` |
| Phản hồi không phải JSON (ví dụ 502 HTML của Caddy) | `ApiError(status, 'Máy chủ đang lỗi (mã <status>).', { code: 'bad_response' })` |
| Phản hồi lỗi JSON | `ApiError(status, body.error, body)`, nên `err.code` = `body.code` |
| 401 giữa chừng | handler sẵn có trong `main.ts`: xoá phiên, về `/dang-nhap?tiep=<trang>` |
| 429 | hiện nguyên văn `body.error` |

## 8. Kiểm thử

Viết test fail trước rồi mới viết code. Không chạy `npm run typecheck` hay `npm run format:check` (theo `CLAUDE.md`).

### 8.1 BE, không cần DB (`test/v2/`)

- **Mặc định đóng:** duyệt mọi controller trong `AppModule` qua metadata của Nest; mỗi handler phải có đúng một dấu `@Public()`, `@Authenticated()` hoặc `@RequireCap(...)`. Kiểm thêm bảng năng lực ở 5.2 cho từng route.
- **Guard** (với `ExecutionContext` giả và `AuthService` giả): không cookie → 401 `UNAUTHENTICATED`; phiên `staff` gọi route `@RequireCap` → 403; phiên `admin` → qua; route `@Public` không phiên → qua; route `@Authenticated` có phiên `staff` → qua.
- **Phiên** (dùng `test/v2/helpers/scripted-kysely.ts`): token đúng `sv` → hợp lệ; `sv` cũ → `null`; token không có `sv` → `null`; tài khoản khoá → `null`; đổi mật khẩu tăng `session_version` và trả cookie mới.
- **Đăng nhập:** tài khoản không tồn tại và sai mật khẩu cho cùng `code` và câu báo; khoá + sai mật khẩu → `INVALID_CREDENTIALS`; khoá + đúng mật khẩu → `ACCOUNT_LOCKED`.
- **`/auth/me`:** đúng dạng cho admin, staff, chưa đăng nhập; quy tắc `payrollSubject` cho `payroll_subject` null/0/1.
- **`LoginRateLimiter`:** lần thứ 6 trong 15 phút bị chặn và có `retryAfter`; qua 15 phút thì mở; đăng nhập đúng xoá bộ đếm; tên thứ 31 từ một IP bị chặn; mục hết hạn được dọn.
- **Người thao tác:** `PATCH /requests/:id/review` dùng `req.user.username`, bỏ qua `reviewerId` trong body.
- **Cookie:** có `Secure` khi `COOKIE_SECURE=1`, không có khi không đặt; `Max-Age` theo `SESSION_DAYS`.

### 8.2 BE, có Postgres (`test/v2/auth-http.pg.test.ts`)

Bỏ qua khi không có `PG_TEST_URL`, theo cách `payroll-repository.pg.test.ts` đang làm. Dựng DB tạm từ `migrations/postgres/*.sql`, chạy `createServer()` trên cổng ngẫu nhiên:

- Đăng nhập admin → `GET /api/v2/auth/me` có `caps` → `GET /api/v2/employees` 200 → đăng xuất → gọi lại 401.
- Đăng nhập staff → `GET /api/v2/employees` 403.
- `POST` với `Content-Type: text/plain` → 415.
- `GET /api/me` không cookie → 200 `{ user: null }`.

### 8.3 FE

- 20 file test Playwright hiện có (`web/tests/*.spec.ts`) chạy với `VITE_DATA=mock` và phải giữ xanh.
- `web/tests/api/auth.spec.ts` (dự án Playwright `api`, cần BE chạy trên Postgres với một admin và một staff do fixture tạo qua API admin):
  - admin đăng nhập → tới `/admin/tong-quan`;
  - staff đăng nhập → tới khu nhân viên;
  - sai mật khẩu → hiện "Sai tên đăng nhập hoặc mật khẩu";
  - đăng xuất → về `/dang-nhap`, tải lại trang vẫn ở `/dang-nhap`.
- `npm run build` ở chế độ `api`, rồi kiểm `web/dist` không chứa chuỗi `aicb.mock.session`.

### 8.4 Lệnh xác minh

- `npm test` ở gốc repo (BE). Các test 8.2 cần `PG_TEST_URL`; muốn có Postgres thì dựng theo `docs/postgres-local.md`, **hỏi người dùng trước** khi chạy Docker.
- `npm --prefix web run test:ui` (Playwright, chế độ mock).
- Playwright dự án `api` và `npm --prefix web run build` như 8.3.
- Hiện máy chưa có `node_modules` ở gốc lẫn `web/`; cần `npm ci` ở cả hai trước.

## 9. Rủi ro và việc để sau

| Rủi ro | Xử lý |
|---|---|
| `SESSION_SECRET` có giá trị mặc định viết cứng trong `auth.service.ts`; admin đầu tiên mặc định `Admin@123456` | Spec vận hành. **Chặn đưa vào dùng thật** tới khi xong. |
| Chưa có migration runner | Spec vận hành. |
| Không có script sao lưu DB | Spec vận hành; chạy `pg_dump` trên máy chủ. |
| Controller bọc lỗi thành 400 kèm `err.message` | Spec 2. |
| `EmployeesRepository.toRow` luôn ghi `payroll_subject: 1`, nên admin được sửa hồ sơ qua API sẽ thành "thuộc bảng lương" và vào được khu nhân viên | Ghi nhận; sửa khi nối màn Nhân sự Admin. |
| Bộ giới hạn đăng nhập trong bộ nhớ mất khi khởi động lại container và không dùng chung được khi chạy nhiều container | Chấp nhận: deploy một container. |
| Thư mục không phải git repo | Hỏi người dùng vị trí repo gốc trước bước tạo worktree. |
| Tài liệu `docs/api/v2-contract.md`, `HANDOFF` lệch code | Ngoài phạm vi theo D5. |

## 10. Phác thảo spec 2 (để định hướng, chưa duyệt)

Nhóm `/api/v2/me/*`, chỉ cần `@Authenticated()`, danh tính lấy từ `req.user`:
- `GET /me/today`: ca, giờ vào/ra hôm nay, trạng thái vị trí, 7 ngày trong tuần.
- `POST /me/punches`: chấm công cho chính mình (kèm toạ độ).
- `GET /me/attendance?month=`: các ngày trong tháng và số liệu gộp.
- `GET /me/requests`, `GET /me/requests/:id`, `POST /me/requests/{leave,overtime,advance,explanation,isat}`, `PATCH /me/requests/:id/cancel`.
- `GET /me/income?month=`: phiếu đã duyệt hoặc số tạm tính.
- `GET /me/profile`.

FE thay cài đặt chế độ `api` của `services/staff-phone.ts` và `services/staff-desktop.ts`, dùng `builders/` để định dạng.
