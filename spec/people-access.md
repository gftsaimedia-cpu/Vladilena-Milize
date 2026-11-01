# Nhân sự và phân quyền — đặc tả theo mã hiện tại

Phạm vi: tài khoản, đăng nhập, phiên, vai trò và năng lực (`ROUTE_CAPS`, từ chối theo mặc định), vai trò tuỳ chỉnh, hồ sơ nhân viên, khoá tài khoản, chức vụ, loại và bậc (danh mục DB), cờ quyền lợi (`benefit.*`) cùng những việc mỗi cờ mở hoặc chặn, ca làm (danh mục DB và giờ ca), người nào vào bảng lương của một tháng, cấu hình hệ thống (`src/platform/config.ts`, các khoá `settings` liên quan).
Tài liệu mô tả **đúng mã đang chạy**. Chỗ chú thích trong mã nói khác mã thì theo mã, và chỗ đó được ghi ở mục 8.
Ký hiệu `file:dòng` trỏ tới vị trí trong cây mã hiện tại; khi dòng dịch chuyển, tìm theo tên hàm đi kèm. Số tiền của bộ máy lương, chấm công và yêu cầu nằm ở các spec cùng thư mục (`payroll-engine.md`, `attendance.md`, `requests.md`).

---

## 1. Phạm vi và file

| File | Việc |
| --- | --- |
| `src/platform/auth.ts` | Băm mật khẩu scrypt (đồng bộ và bất đồng bộ), băm giả chống dò tên, giới hạn đoán mật khẩu trong bộ nhớ, khoá ký phiên, tạo/đọc cookie phiên ký HMAC, `TRUST_PROXY`, mật khẩu Admin đầu tiên. |
| `src/platform/authz.ts` | Danh sách năng lực `CAPS`, vai trò mặc định `ROLE_CAPS` + phạm vi `ROLE_SCOPE`, vai trò tuỳ chỉnh đọc từ `settings['roles.custom']`, bảng chính sách route `ROUTE_CAPS`, `routeKey()`, `gate()`, `can()`, `rolesOf()`, `capsOf()`, `scopeOf()`, `auditSensitivities()`, `isSelfDecision()`. |
| `src/domain/roles/roles.ts` | Vai trò tuỳ chỉnh: mô tả cho `GET /api/roles` (`describeAll`), tạo / sửa / ngưng dùng (`create`, `update`, `deprecate`), ma trận khu vực Không/Xem/Sửa (`AREAS`, `EXTRAS`, `APPROVAL_ITEMS`), `rolesOfStaff`, `rolesRevOf`, `syncPayroll`, `reconcileStaffRole`. |
| `src/modules/roles/roles.controller.ts` | Handler HTTP mỏng cho `/api/roles*`, gọi `src/domain/roles/roles.ts`. |
| `src/domain/staff.ts` | Hồ sơ gửi ra ngoài: `publicStaff`, `staffForViewer` (che trường theo quyền), `staffRevision` (số phiên bản hồ sơ), hàm `ownerView`, `sheetForViewer`. |
| `src/domain/employee/person-name.ts` | Lớp thuần `PersonName`: tách họ tên Việt (tên = chữ cuối), viết hoa chữ đầu. |
| `src/domain/employee/profile.ts` | Lớp `Profile` (một dòng `staff` dạng đối tượng), `CONTRACT_STATUSES`, `isResignedBy`. |
| `src/domain/employee/employee.ts` | Lớp `Employee` = Profile + Position (của tháng) + Shift; trả lời câu hỏi quyền lợi, phụ cấp ca, `view()`. |
| `src/domain/employee/employee-repository.ts` | Chỉ đọc bảng `staff` theo uuid / username, `UUID_RE`. |
| `src/domain/employee/employee-directory.ts` | Dựng `Employee` của một tháng từ repository + danh mục chức vụ + danh mục ca; `trace()` nhật ký theo uuid. |
| `src/modules/employees/employees.controller.ts` | `GET /api/employees/:uuid`, `GET /api/employees/:uuid/trace`. |
| `src/domain/employee/index.ts` | Gom export. |
| `src/domain/positions.ts` | `GET /api/positions`, `GET /api/entitlements`, `POST /api/positions`, `POST /api/positions/:code/levels` (qua `src/params/save.ts`); cờ quyền lợi của người đăng nhập (`myPosition`), cờ khai lịch (`sheetFlagsOf`, `checkRequestFlags`), `activeCodesOf`, `withLeave`. |
| `src/domain/isat-rule.ts` | `isatRefusal({ params, staff, date })`: lý do một ngày iSAT không hợp lệ (thiếu `benefit.isat` hoặc sai thứ `isat.weekday`), hoặc `null`. |
| `src/domain/position/seed-data.ts` | Tên chức vụ, tên bậc, danh mục 6 ca (mã mới → khoá giờ ca cũ lấy từ `src/engine/punch.ts` `SHIFT_CODES`). |
| `src/domain/position/benefits.ts` | Danh sách 14 tên cờ quyền lợi `BENEFITS`: 13 cờ đang đọc và `holidayWork` (nằm trong `RETIRED_BENEFITS`, danh mục, tham số và bộ máy không đọc cờ này). |
| `src/domain/position/position.ts` | Lớp `Position` (chức vụ + bậc hiệu lực của tháng). |
| `src/domain/position/position-catalog.ts` | Repository danh mục chức vụ/bậc: đọc theo tháng, `saveType`, `saveLevel` (khoá lạc quan `rev`), `paramRows()` đổi danh mục thành dòng tham số. |
| `src/modules/catalog/catalog.controller.ts` | `GET /api/catalog/positions`, `PUT /api/catalog/positions/:code`, `PUT /api/catalog/levels`. |
| `src/domain/shift/shift.ts` | Lớp `Shift`, `KINDS = normal/flex/night`. |
| `src/domain/shift/shift-catalog.ts` | Repository `work_shifts`: `list`, `find` (mã mới hoặc cũ), `canonicalOf`, `presetOf`, `save`, `paramRows()`. |
| `src/modules/catalog/catalog.controller.ts` | `GET /api/catalog/shifts`, `PUT /api/catalog/shifts`. |
| `src/domain/shifts.ts` | Giờ ca (`shift.preset.<preset>.in|out`): `GET/PUT /api/settings/shifts`, `labelOf`, `employeeView` (gửi kèm `/api/punch`). |
| `src/domain/shared/catalog-change.ts` | Một đường ghi chung cho sửa danh mục: khoá kỳ, giao dịch, `catalog_rev`, `config_rev`, nhật ký, sự kiện. |
| `src/domain/shared/repository.ts` | Lớp gốc repository: `one/all/run/transaction`, `updateWithRev`. |
| `src/domain/shared/domain-error.ts` | `DomainError` (status + code) để server trả 4xx có mã. |
| `src/domain/catalog-params.ts` | Gom dòng tham số của danh mục (chức vụ, bậc, ca, quy tắc lương mới) có id lớn để `src/params/store.ts` chồng lên; số `catalog_rev`. |
| `src/domain/container.ts` | Composition root dựng lười `employees`, `positions`, `shifts`, ...; dựng lại khi kết nối DB đổi. |
| `src/domain/input.ts` | `USERNAME_RE`, `validMonth`, `validDate`, `TIME_RE`, `NOTE_MAX`. |
| `src/app.module.ts` | Đăng ký các module Nest (`roles`, `catalog`, `employees`, `positions`, `leave`, `blocks`, ...); thứ tự `FEATURE_MODULES` là thứ tự khớp route. |
| `src/domain/payroll/payroll-service.ts` (`payrollPeople`) | Ai vào bảng lương của một tháng, hợp đồng và `insured` hiệu lực của từng người (mục 4.15). |
| `src/domain/payroll/policy.ts` | `PayrollPolicy`: `tenureContract`, `contractFor` (ba khoá `shift.allowance.basis`, `tax.contract.basis`, `tax.longTermMonths` nằm trong `DEFAULTS`). |
| `src/platform/config.ts` | Hằng số kỹ thuật (giới hạn, độ dài, thời hạn, tháng nền danh mục ...). |
| `src/platform/warnings.ts` | `warnIf`, `warn`, `selfDecision`, `optionalReason`: cảnh báo vào phản hồi, chạy tiếp. |
| `src/platform/audit.ts` | Ghi nhật ký (`write`, `staffSaved`, `staffLock`), ngữ cảnh `context(me)`. |
| `src/platform/events.ts` | SSE: `roles.changed`, `params.changed`, `closeUser`. |
| `src/platform/db.ts` (phần liên quan) | Bảng `staff`, `staff_roles`, `settings`; `getStaff`, `getStaffRow`, `listStaff`, `upsertStaff`, `lockStaff`, `unlockStaff`, `setPassword`, `getSessionVersion`, `bumpSessionVersion`, `isPayrollSubject`, `setPayrollSubject`, `roles.*`, `assertPeriodOpen`. |
| `src/platform/http.ts` (phần liên quan) | `readJson` (bắt buộc `application/json`, 1 MB), `clientIp` (theo `TRUST_PROXY`), `HttpError`. |
| `src/ops/route-classes.ts` | Route nặng và route ghi không giới hạn tốc độ (`POST /login`, `POST /logout`, `POST /punch`). |
| `src/modules/auth/auth.controller.ts` / `src/modules/staff/staff.controller.ts` / `src/modules/sheet/sheet.controller.ts` (phần liên quan) | Cổng quyền (`src/http/api-gate.ts`), `checkInDay` (ngày nghỉ đã khai đóng Check-in), `POST /login`, `POST /logout`, `GET /me`, `PUT /password`, `GET /staff`, `POST /staff/:u/password`, `PUT /staff/:u/roles`, `PUT /staff/shift-bulk`, `PUT|DELETE /staff/:u`, tạo Admin đầu tiên, `Roles.reconcileStaffRole()` lúc nạp. |

---

## 2. Dữ liệu

### 2.1 Bảng `staff` (một dòng một tài khoản / một người)

Tạo ở `migrations/postgres/0001_baseline.sql`.

| Cột | Kiểu | Ý nghĩa / quy tắc |
| --- | --- | --- |
| `username` | TEXT PK | Tên đăng nhập. Không đổi được: trigger `staff_username_fixed` (`migrations/postgres/0001_baseline.sql`). Server ép chữ thường và kiểm `USERNAME_RE = /^[a-z0-9._-]{2,40}$/` (`src/domain/input.ts`). |
| `uuid` | TEXT, UNIQUE | Sinh một lần (`crypto.randomUUID()` trong `upsertStaff`, `db.ts`; dòng thêm thẳng bằng SQL được trigger `staff_uuid_default` sinh, `migrations/postgres/0001_baseline.sql`). Không đổi được khi đã có (`staff_uuid_fixed`). |
| `name` | TEXT NOT NULL | Họ tên hiển thị. |
| `family_name`, `given_name` | TEXT | Họ (gồm tên đệm) và tên. Tính trong `upsertStaff` (`db.ts`): nếu `familyName`/`givenName` gửi kèm ghép lại đúng bằng `titleCase(name)` thì dùng, ngược lại tách lại từ `name` (tên = chữ cuối). |
| `role` | TEXT `'staff' \| 'admin'` | Loại tài khoản cũ. `role='admin'` luôn cho vai trò `admin` mà không cần dòng `staff_roles` (`db.ts`). |
| `type` | TEXT | Mã chức vụ (dữ liệu, không cố định 3 mã). |
| `level` | INTEGER | Bậc trong chức vụ; Admin ngoài bảng lương giữ `0`. |
| `night_pct` | INTEGER | Phụ cấp đêm người này chọn trong `nightOptions` (null nếu chức vụ/bậc không có bảng lựa chọn). |
| `idorm` | INTEGER 0/1 | Chỉ nhận 1 khi cờ quyền lợi `idorm` của chức vụ/bậc bật. |
| `shift_code` | TEXT | Ca cố định, lưu **mã mới** của danh mục ca (`Normal1`…`Night2`); mã cũ `n1…g2` được đổi khi lưu (`db.ts`) và một lần cho dữ liệu cũ (`db.ts`). |
| `pass_hash` | TEXT NOT NULL | `scrypt$<muối hex>$<khoá hex>`. |
| `created_at` | TEXT | ISO. |
| `start_date`, `birthday` | TEXT `YYYY-MM-DD` | Ngày vào làm, ngày sinh (phép năm). |
| `leave_adjust` | REAL | Điều chỉnh phép tay, bước 0,5 ngày. |
| `contract` | TEXT `long \| short \| NULL` | NULL = theo `type.<mã>.defaultContract`. Bảng lương không dùng cột này để tính thuế và bảo hiểm mà suy hợp đồng từ thâm niên (mục 4.15). |
| `insured` | INTEGER 1/0/NULL | NULL = theo mặc định (xem mục 8: hai quy tắc mặc định khác nhau). |
| `dependants` | INTEGER ≥ 0 | Số người phụ thuộc. |
| `job_title` | TEXT | Vị trí in trên phiếu. |
| `tax_on`, `deduct_on`, `advance_on` | INTEGER 1/0/NULL | NULL = có. |
| `locked_at`, `locked_by` | TEXT | Khoá tài khoản; NULL = đang hoạt động. |
| `session_version` | INTEGER, mặc định 0 | Tăng là mọi cookie cũ hết hiệu lực. |
| `payroll_subject` | INTEGER 1/0/NULL | Nhân sự được trả lương. NULL = suy từ `role` (`admin` → 0). Mốc `staff_payroll_subject_v1` điền giá trị cho dòng cũ (`db.ts`). |
| `contract_status` | TEXT `probation \| official \| NULL` | CHECK ở `migrations/postgres/0001_baseline.sql`; chỉ để hiển thị, không đổi tiền. |
| `resigned_on` | TEXT | Ngày nghỉ việc; `Profile.isResignedBy(d)` = `resigned_on < d` (`profile.ts`). |
| `leave_balance`, `leave_balance_on` | REAL, TEXT | Số dư phép lưu sẵn, do `src/domain/leave` làm mới (`container.leave.start(config.LEAVE_REFRESH_MS)`, `src/modules/**/*.controller.ts`). |
| `schedule_json` | | Cột còn trong DB đã chạy trước đây (lịch riêng cũ); không còn đọc hay ghi, không có migration xoá. |

Đọc ra: `rowToStaff` (`db.ts`) đổi cột sang camelCase và **điền mặc định**: `contract` NULL → `defaultContract(type)` (resolver do server đặt = `type.<mã>.defaultContract` của tháng hiện tại, lỗi thì `tts→short`, còn lại `long`, `db.ts`); `insured` NULL → `contract === 'long'`; `taxOn/deductOn/advanceOn` NULL → `true`; `payrollSubject` NULL → `role !== 'admin'`. `session_version` được đưa ra dưới tên `sessionVersion` rồi `publicStaff` bỏ đi.

### 2.2 Bảng `staff_roles`

`db.ts`. Cột: `id`, `username`, `role`, `granted_by`, `granted_at`, `revoked_at`.
- Chỉ thêm dòng; thu hồi = đặt `revoked_at` một lần. Trigger cấm DELETE và cấm sửa trường khác.
- Chỉ mục duy nhất `(username, role) WHERE revoked_at IS NULL`: một vai trò còn hiệu lực một lần.
- `grant` kiểm `ROLE_RE = /^[a-z][a-z_]{1,31}$/` và tài khoản có thật (404 `ROLE_USER_UNKNOWN`), đã có thì trả dòng cũ (`db.ts`). `revoke` không kiểm "Admin cuối cùng" (`db.ts`).
- `countRole('admin')` đếm tài khoản **chưa khoá** có `role='admin'` hoặc dòng `admin` còn hiệu lực (`db.ts`).

### 2.3 Bảng danh mục (`migrations/postgres/0001_baseline.sql`)

| Bảng | Khoá | Cột chính |
| --- | --- | --- |
| `benefit_types` | `code` | Danh mục quyền lợi (nạp từ `BENEFITS`). |
| `position_types` | `id`; UNIQUE `(code, effective_month)` | `name`, `workdays` (1–31), `flex_pct`, `night_pct`, `travel_pct`, `attendance_pct` (0–100, đơn vị %), `regular_dows` (JSON mảng thứ 0=CN…6=T7), `makeup_dows` (cột cũ, không đọc, ghi `[]`), `reason`, `updated_by`, `updated_at`, `rev`. |
| `position_type_benefits` | `(type_id, benefit)` | `enabled` 0/1, mỗi phiên bản chức vụ một bộ đủ cờ. |
| `position_levels` | `id`; UNIQUE `(type_code, level_no, effective_month)` | `name`, `base_salary` (VND nguyên ≥ 0), `kpi_max` (NULL = không có KPI), `night_pct` (NULL = theo chức vụ), `reason`, `updated_by`, `updated_at`, `rev`. |
| `work_shifts` | `code` | `preset` (UNIQUE, khoá giờ ca cũ), `name`, `kind` (`normal/flex/night`), `sort`, `deprecated` 0/1, `updated_by`, `updated_at`, `rev`. |

Nạp nền một lần dưới mốc `position_catalog_v1` (`migrations/postgres/0001_baseline.sql`), tháng áp dụng `config.CATALOG_BASE_MONTH` (tháng nền cố định dạng `YYYY-MM`, sớm hơn mọi tháng lương nên dòng nền hiệu lực ở mọi tháng):
- Chức vụ = mọi mã có khoá `type.<mã>.workdays` trong `PayrollParams.DEFAULTS`.
- `flex_pct = pctOf(type.<mã>.flexBonus ?? shift.flex.bonus)`, `travel_pct = pctOf(type.<mã>.travel)`, `attendance_pct = pctOf(type.<mã>.attendance)`, `pctOf(r) = round(r × 10000) / 100`.
- `night_pct` = phần tử đầu của `type.<mã>.nightOptions` nếu có, không thì `pctOf(shift.night.bonus)` (mặc định 0,3 → 30).
- Bậc: `level.<mã>.<n>.base` liên tiếp từ 1; tên lấy `seed-data.ts` → `level.<mã>.<n>.name` → `Bậc n`.
- Ca: 6 dòng `Normal1/2 (normal)`, `Flex1/2 (flex)`, `Night1/2 (night)`, preset từ `src/engine/punch.ts SHIFT_CODES`.

### 2.4 Khoá `settings` dùng trong module

| Khoá | Giá trị | Ai ghi |
| --- | --- | --- |
| `session_secret` | hex 32 byte | `auth.sessionSecret` khi không có `SESSION_SECRET` và không phải production (`auth.ts`). |
| `roles.custom` | `{ rev, roles: [{ code, label, caps, approvals, scope, rev, deprecated, deprecatedAt?, copiedFrom, createdBy, createdAt, updatedAt }] }` | `src/domain/roles/roles.ts save()` (`roles.ts`). |
| `agents_enabled` | `'1' \| '0'` (vắng/lạ = `'0'`) | `PUT /settings/agents`. |
| `catalog_rev` | số nguyên | `catalogParams.bump()` mỗi lần sửa danh mục. |
| `config_rev` | số nguyên | `configRev.bump()` (danh mục, agents, geofence, tham số). |
| `geofence`, `holidays`, `params_mode` | | Module khác; đọc ở `/me`, `/login`. |
| Mốc một lần | `staff_identity_v1`, `staff_payroll_subject_v1`, `position_catalog_v1`, `staff_shift_codes_v1` | `db.once`. |

### 2.5 Bộ nhớ trong tiến trình (mất khi khởi động lại)

| Bộ nhớ | Nơi | Nội dung |
| --- | --- | --- |
| `attempts` | `auth.ts` | khoá `"<địa chỉ>|<80 ký tự đầu của tên>"` → `{ failures: [ms], lockedUntil }`. |
| `sprayed` | `auth.ts` | địa chỉ → `{ users: Map(tên → lần sai cuối), lockedUntil }`. |
| `SECRET`, `SESSION_DAYS`, `COOKIE` | `auth.ts` | Đọc một lần lúc nạp module. |
| `DUMMY_HASH` | `auth.ts` | Băm giả, sinh lúc nạp. |
| Container | `src/domain/container.ts` | Repository dựng một lần mỗi kết nối DB. |
| `catalogParams` cache | `src/domain/catalog-params.ts,36-52` | Dòng tham số danh mục, nhớ theo `(db, catalog_rev)`. |
| `paramsStore.resolve` cache | `src/params/store.ts` | Khoá `mode:lastId:catalogRev`. |
| `warnings` context | `src/platform/warnings.ts` | Danh sách cảnh báo của yêu cầu hiện tại. |

### 2.6 Trạng thái và chuyển trạng thái

**Tài khoản**

| Trạng thái | Điều kiện | Chuyển |
| --- | --- | --- |
| Hoạt động | `locked_at IS NULL` | → Khoá: `DELETE /staff/:u` hoặc `PUT /staff/:u {locked:true}`; `lockStaff` đặt `locked_at`, `locked_by` và **tăng `session_version`** (`db.ts`). |
| Khoá | `locked_at` có giá trị | → Hoạt động: `PUT /staff/:u {locked:false}`; `unlockStaff` **không** tăng `session_version` (`db.ts`). Không có xoá tài khoản. |

Tài khoản khoá: `readSession` trả null (`auth.ts`), đăng nhập 403, `rolesOf` = `[]`, `effectiveRoles` = `[]`, không tính vào `countAdmins`.

**Vai trò tuỳ chỉnh**: `đang dùng` → `ngưng dùng` (`deprecate` hoặc `PUT {active:false}`). Không có chiều ngược lại (409 `ROLE_DEPRECATED`). Không xoá.

**Ca trong danh mục**: `deprecated` 0 ↔ 1 bằng `PUT /catalog/shifts`. Ca ngưng dùng không hiện trong `GET /settings/shifts` (`src/domain/shifts.ts`) nhưng `find()` vẫn tìm thấy (người đang giữ vẫn dùng được).

**Phiên bản dòng danh mục**: chức vụ/bậc theo tháng áp dụng. Sửa đúng tháng của dòng đang hiệu lực = UPDATE dòng đó (`rev+1`); tháng khác = INSERT dòng mới với `rev = rev cũ + 1` (bậc mới hoàn toàn: `rev = 0`) (`position-catalog.ts`,).

---

## 3. API

Chung cho mọi route `/api/*` (`src/http/api-gate.ts`, `ApiGate.open`):
1. `routeKey(method, seg)` (`authz.ts`) → `policyOf`. Không có chính sách: 401 nếu chưa đăng nhập, ngược lại **403 `NO_ROUTE_POLICY`**.
2. Không phải `public`: chưa đăng nhập 401 `Chưa đăng nhập` (không có `code`); `gate()` trả lỗi thì **403 `FORBIDDEN_CAP`** kèm `cap`.
3. Route nặng (`GET /staff`, `GET /team`, ...) có thể 503 `OVERLOADED`.
4. Lệnh ghi của người đã đăng nhập (trừ `POST /login`, `POST /logout`, `POST /punch`) bị giới hạn `WRITE_RATE_PER_MINUTE = 240`/phút/người → 429 `WRITE_RATE_LIMITED` + `Retry-After`.
5. Thân yêu cầu: có thân mà không phải `application/json` → 415 `UNSUPPORTED_MEDIA_TYPE`; > 1 MB → 413; không phải object → 400.
6. Lỗi `HttpError` trả `{ error, ...details }`; lỗi có `code` + `httpStatus < 500` (DomainError, storeError) trả `{ error, code, ...details }` (`src/modules/auth/auth.controller.ts` / `src/modules/attendance/attendance.controller.ts`).
7. Phản hồi 2xx mang thêm `warnings[]` khi có cảnh báo (`src/platform/http.ts send`).

Không route nào dưới đây có `periodScope` trong `ROUTE_CAPS`; khoá kỳ chỉ có ở các route danh mục/tham số (qua `assertPeriodOpen(..., 'params')` hoặc `src/params/save.ts`).

### 3.1 Đăng nhập, phiên, mật khẩu

| Route | Quyền | Input | Output | Lỗi chính | Khoá kỳ / cảnh báo |
| --- | --- | --- | --- | --- | --- |
| `POST /login` | public | `{ username, password }` | 200 `{ user (publicStaff), holidays, geofenceRequired, geofence? }` + `Set-Cookie` | 429 (không `code`) `Đăng nhập sai quá nhiều lần. Thử lại sau N phút.` + `Retry-After` giây; 401 `Sai tên đăng nhập hoặc mật khẩu`; 403 `Tài khoản đã bị khoá...` (không `code`); 503 `OVERLOADED` (hàng đợi băm đầy) | Không áp dụng. |
| `POST /logout` | public | — | 200 `{ ok: true }` + cookie rỗng `Max-Age=0` | — | — |
| `GET /me` | public | — | `{ user \| null, serverNow, roles, caps, payrollSubject, agentsEnabled, holidays, benefits, positionLabel, geofenceRequired?, geofence? }` | — | `agentsEnabled` trả công tắc Agents. |
| `PUT /password` | authenticated | `{ current, next }` | 200 `{ ok: true }` + cookie mới | 400 `Mật khẩu hiện tại không đúng`; 400 `Mật khẩu mới cần ít nhất 6 ký tự` (không `code`) | Không. |
| `GET /events` | authenticated | — | luồng SSE | 401, 503 `EVENTS_FULL` | — |

### 3.2 Hồ sơ và tài khoản

| Route | Quyền (ROUTE_CAPS) | Input | Output | Lỗi chính | Khoá kỳ / cảnh báo |
| --- | --- | --- | --- | --- | --- |
| `GET /staff` | `profile.read` (phạm vi all) | — | `{ staff: [staffForViewer(...) + leave nếu chức vụ có leaveAccount] }` | 403 `FORBIDDEN_CAP` | — |
| `PUT /staff/:u` (tạo hoặc sửa) | `profile.write` | xem 4.6 | `{ staff, created }`; Admin tự đặt mật khẩu của mình thì kèm cookie mới | 400 (tên đăng nhập, họ tên, `GIVEN_NAME_REQUIRED`, `BAD_CONTRACT_STATUS`, `BAD_RESIGNED_ON`, vai trò, loại nhân sự, level, nightPct, ca, ngày, điều chỉnh phép, hợp đồng, bảo hiểm, người phụ thuộc, jobTitle, cờ thuế, `USE_PASSWORD_RESET`, `Tài khoản mới cần mật khẩu`, tự bỏ Admin); 403 `FORBIDDEN_CAP` (`salary.write`, `roles.manage`, `staff.lock`); 403 `SELF_DECISION_FORBIDDEN` (đặt mật khẩu qua hồ sơ của chính mình); cảnh báo `SELF_DECISION_FORBIDDEN` (tự sửa lương/ca/phép); 404 khi chỉ khoá mà không có tài khoản; 409 `STAFF_STALE` `{ currentRev }`; 409 `LAST_ADMIN` | Không kiểm khoá kỳ. `START_DATE_REQUIRED` và tự sửa trường lương/ca/phép của chính mình: cảnh báo. |
| `DELETE /staff/:u` (khoá) | `staff.lock` | — | `{ ok: true, locked: true }` | 404; 400 `Không thể khoá tài khoản đang đăng nhập`; 403 `FORBIDDEN_CAP` (khoá Admin cần `roles.manage`); 409 `LAST_ADMIN` | Không. |
| `POST /staff/:u/password` | `roles.manage` | `{ password, reason? }` | `{ ok: true }` | 400 `USE_OWN_PASSWORD` (chính mình); 404; 400 độ dài < 6; 400 `REASON_REQUIRED` (lý do > 300) | Lý do không bắt buộc. |
| `PUT /staff/:u/roles` | `roles.manage` | `{ roles: [mã], reason?, expectedRev? }` | `{ username, roles, granted, revoked, rev }` | 400 roles không hợp lệ; 400 `expectedRev phải là số nguyên`; 404; 409 `ROLES_STALE` `{ rev }`; 403 `SELF_ADMIN_REMOVAL`; 409 `ROLE_DERIVED` `{ role }`; 400 `ROLE_DEPRECATED`; 409 `LAST_ADMIN`; cảnh báo `ROLE_STAFF_NO_LEVEL` | Lý do như trên. |
| `PUT /staff/shift-bulk` | `profile.write` | `{ usernames[], preset? \| in+out, effective?, reason? }` | `{ ok, shiftCode, updated: [{username, shiftCode}], unchanged: [username] }` | 400 `USERNAMES_REQUIRED`, `TOO_MANY` (> `system.staff.bulkMax` = 200), danh sách sai/lặp, `SHIFT_UNKNOWN`, `EFFECTIVE_UNSUPPORTED`; 404 `STAFF_NOT_FOUND` `{ missing }`; 403/cảnh báo `SELF_DECISION_FORBIDDEN` | Không kiểm khoá kỳ. |
| `GET /employees/:uuid?month=` | `profile.read` | `month` mặc định tháng hiện tại | `{ month, employee: Employee.view() đã che }` | 400 `BAD_UUID`, `BAD_MONTH`; 404 `EMPLOYEE_NOT_FOUND` | — |
| `GET /employees/:uuid/trace?beforeId=&limit=` | `audit.read` | `limit` mặc định 50, tối đa 200 | `{ uuid, username, items: [audit.publicRow] }` | 400 `BAD_UUID`, `BAD_CURSOR`; 404 | Lọc theo `auditSensitivities(me)`. |

### 3.3 Vai trò

| Route | Quyền | Input | Output | Lỗi chính |
| --- | --- | --- | --- | --- |
| `GET /roles` | `roles.manage` | — | `describeAll()`: `{ roles[], rev, caps, reservedCaps, areas, extras, approvalItems, scopes, limits{labelMax,codeMax,customMax}, staff: [{username,name,roles,rev,locked}] }` | — |
| `POST /roles` | `roles.manage` | `{ label?, copyFrom?, code?, caps? \| levels/perms + extras?, approvals?/approve?, scope?, reason? }` | `{ role, rev }` | 409 `ROLE_LIMIT`; 400 `ROLE_COPY_UNKNOWN` / 404 `ROLE_COPY_UNKNOWN`; 400 `ROLE_LABEL_INVALID`; 409 `ROLE_LABEL_CLASH`; 400 `ROLE_CODE_INVALID`; 409 `ROLE_CODE_CLASH`; 400 `ROLE_CAPS_INVALID`, `ROLE_CAP_RESERVED`, `ROLE_CAP_UNKNOWN`, `ROLE_APPROVAL_UNKNOWN`, `ROLE_LEVELS_INVALID`, `ROLE_SCOPE_INVALID`; 400 `REASON_REQUIRED` (chỉ khi lý do > 300; lý do không bắt buộc khi tạo) |
| `PUT /roles/:code` | `roles.manage` | `{ rev (bắt buộc), label?, caps? \| levels/perms + extras?, approvals?, scope?, active?, reason }` | `{ role, rev, changed }` | 403 `ROLE_BUILTIN_READONLY`; 404 `ROLE_NOT_FOUND`; 400 `ROLE_REV_REQUIRED`; 409 `ROLE_STALE` `{ rev }`; 409 `ROLE_DEPRECATED`; 403 `ROLE_SELF_ESCALATION`; 400 `REASON_REQUIRED` (block: 10–300 ký tự) |
| `POST /roles/:code/deprecate` | `roles.manage` | `{ rev, reason }` | `{ role, rev, holders }` | như trên |

`active: false` trong `PUT` chuyển sang `deprecate` (`roles.ts`). Mã vai trò trong URL được `decodeURIComponent`, lỗi giải mã → 400 (`src/modules/roles/roles.controller.ts`). Không có khoá kỳ.

### 3.4 Chức vụ, bậc, ca

| Route | Quyền ở cổng | Quyền / kiểm trong handler | Input | Output | Lỗi chính | Khoá kỳ / cảnh báo |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /positions?month=` | `config.read` | — | | `{ month, paramsRev, positions: Positions.list }` | 400 `BAD_MONTH` | — |
| `GET /entitlements?month=` | `config.read` | — | | `{ month, paramsRev, positions, blocks, cells }` | 400 `BAD_MONTH` | — |
| `POST /positions` | `config.read` | `config.payroll` (`save.ts`) | `{ label, copyFrom, short?, effectiveMonth?, reason, basis?, acknowledge? }` | kết quả `save()` + `position` | 403 `FORBIDDEN_CAP`; 400 `POSITION_BAD_BODY`, `PARAM_INVALID_VALUE`, `POSITION_UNKNOWN`; 409 `POSITION_CODE_CLASH`, `POSITION_LIMIT` (`system.positions.max` = 30); lỗi của `save()` | Tháng áp dụng < tháng mở sớm nhất: cảnh báo `PERIOD_LOCKED` `{minEffectiveMonth}`. Lý do: không bắt buộc, tối đa 300. Ghi vào `param_versions`, **không** vào bảng danh mục. |
| `POST /positions/:code/levels` | `config.payroll` | `config.payroll` | `{ name, base, kpi?, effectiveMonth?, reason, acknowledge? }` | kết quả `save()` + `level` | như trên | như trên |
| `GET /catalog/positions?month=` | `config.read` | — | | `{ month, baseMonth, benefits, positions: [{...typeView, levels: [levelView]}] }` | 400 `BAD_MONTH` | — |
| `PUT /catalog/positions/:code` | `config.payroll` | — | `{ changes, effectiveMonth, reason?, expectedRev (bắt buộc) }` | `{ position, configRev }` | 400 `POSITION_BAD_CODE`, `CATALOG_CHANGES_REQUIRED`, `BAD_MONTH`, `CATALOG_REV_REQUIRED`, `CATALOG_FIELD_UNKNOWN`, `CATALOG_BAD_NAME`, `CATALOG_BAD_WORKDAYS`, `CATALOG_BAD_PCT`, `CATALOG_BAD_DOWS`, `CATALOG_BAD_BENEFITS`; 404 `POSITION_NOT_FOUND`; 409 `POSITION_STALE` `{ current }` | `assertPeriodOpen(effectiveMonth,'params')`: tháng đã chốt công trở đi → cảnh báo `PERIOD_LOCKED`. Lý do không bao giờ bắt buộc. |
| `PUT /catalog/levels` | `config.payroll` | — | `{ type, level, changes, effectiveMonth, reason?, expectedRev? }` (bắt buộc khi bậc đã có ở tháng đó) | `{ level, configRev }` | như trên + `CATALOG_BAD_LEVEL`, `CATALOG_BAD_MONEY`; 409 `LEVEL_STALE`; 404 `LEVEL_NOT_FOUND` | như trên |
| `GET /catalog/shifts` | `config.read` | — | | `{ shifts: [Shift] }` (gồm ca ngưng dùng) | | — |
| `PUT /catalog/shifts` | `config.payroll` | — | `{ code (mới hoặc cũ), changes: {name?,kind?,sort?,deprecated?}, expectedRev (bắt buộc), reason? }` | `{ shift: {before,after}.after, configRev }` | 400 `SHIFT_CODE_REQUIRED`, `CATALOG_CHANGES_REQUIRED`, `CATALOG_REV_REQUIRED`, `CATALOG_FIELD_UNKNOWN`, `SHIFT_BAD_NAME`, `SHIFT_BAD_KIND`, `SHIFT_BAD_SORT`, `SHIFT_BAD_FLAG`; 404 `SHIFT_UNKNOWN`; 409 `SHIFT_STALE` | Kiểm khoá kỳ của **tháng hiện tại** (`src/modules/catalog/catalog.controller.ts`). |
| `GET /settings/shifts?month=` | `config.read` | — | | `{ month, paramsRev, editable, hours, shifts: [{code,preset,name,kind,in,out}] }` | 400 `BAD_MONTH` | — |
| `PUT /settings/shifts` | `config.read` | `config.payroll` theo khoá; `SHIFT_ALLOW_EDIT` ở production | `{ shifts: [{code,in,out}], effectiveMonth?, reason, expectedRev, acknowledge? }` | kết quả `paramsSave.save` | 400 `SHIFTS_REQUIRED`, `SHIFT_UNKNOWN`; lỗi `save()`: `PARAM_REV_REQUIRED`, 409 `PARAMS_STALE`, `SHIFT_EDIT_NOT_ALLOWED`, `FORBIDDEN_CAP`, `PERIOD_LOCKED`, `PARAMS_DEFAULTS_ONLY` | như `POST /positions`. |

### 3.5 Cấu hình hệ thống

| Route | Quyền | Input | Output | Lỗi | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `GET /settings/agents`, `PUT /settings/agents` | `roles.manage` | `{ enabled: boolean }` | `{ enabled }` | 400 `enabled` không phải boolean | Chỉ ghi khi đổi giá trị; xem `spec/platform.md`. |
| `GET /settings/version` | authenticated | — | `{ configRev, mode, epoch, build }` | | |

---

## 4. Cách tính / quy tắc

### 4.1 Tham số dùng trong module (khoá registry → mặc định)

`src/platform/auth.ts` đọc **`PayrollParams.DEFAULTS` lúc nạp module**, không đọc bộ tham số đã lưu (`auth.ts`). Các khoá `system.staff.bulkMax`, `system.positions.max`, `insurance.coverage.*`, `type.<mã>.*`, `level.<mã>.<n>.*` được đọc từ bộ tham số của tháng (`rulesFor(tháng).params`).

| Khoá | Mặc định | Đơn vị | Dùng ở |
| --- | --- | --- | --- |
| `system.auth.scryptSaltBytes` | 16 | byte | muối mật khẩu |
| `system.auth.scryptKeyBytes` | 64 | byte | độ dài khoá scrypt |
| `system.auth.usernameKeyChars` | 80 | ký tự | cắt tên trong khoá giới hạn đoán |
| `system.auth.trustProxyMaxHops` | 10 | proxy | `TRUST_PROXY` hợp lệ 1..10 |
| `system.auth.adminPasswordMinProduction` | 12 | ký tự | `ADMIN_PASSWORD` ở production |
| `system.auth.generatedPasswordBytes` | 12 | byte | mật khẩu Admin tự sinh (base64url) |
| `system.auth.sessionSecretBytes` | 32 | byte | khoá ký tự sinh |
| `system.auth.passMarkChars` | 16 | ký tự | dấu mật khẩu trong cookie |
| `system.login.maxFailures` | 5 | lần | khoá cặp (địa chỉ, tên) |
| `system.login.sprayUsers` | 30 | tên | khoá cả địa chỉ |
| `system.login.windowMin` | 15 | phút | cửa sổ đếm và thời gian khoá |
| `system.login.maxKeys` | 5000 | mục | trần mỗi bảng nhớ |
| `system.session.days` | 14 | ngày | thời hạn phiên (biến `SESSION_DAYS` thắng) |
| `unit.msPerSecond`, `unit.msPerDay`, `unit.minutesPerDay` | 1000, 86400000, 1440 | | đổi đơn vị |
| `system.staff.bulkMax` | 200 | người | `PUT /staff/shift-bulk` |
| `system.positions.max` | 30 | chức vụ | `POST /positions` |
| `insurance.coverage.long` / `.short` | true / false | | `insured` hiệu lực khi cột NULL (staff.ts, PUT /staff) |
| `type.<mã>.defaultContract` | tts=`short`, ctv/nv=`long` | | hợp đồng mặc định |
| `type.<mã>.startDateRequired` | tts=false, ctv/nv=true | | `START_DATE_REQUIRED` |
| `type.<mã>.nightOptions`, `level.<mã>.<n>.nightOptions` | | % | lựa chọn `nightPct` |
| `type.<mã>.benefit.<cờ>`, `level.<mã>.<n>.benefit.<cờ>` | | bool | `benefitOf` |

Hằng `src/platform/config.ts` dùng trực tiếp: `PASSWORD_MIN_LENGTH = 6`, `REASON_MIN = 10`, `REASON_MAX = 300`, `ROLES_CUSTOM_MAX = 30`, `ROLE_CODE_MAX = 32`, `ROLE_LABEL_MAX = 40`, `POSITION_LABEL_MAX = 40`, `ERROR_ECHO_*`, `AUDIT_PAGE_DEFAULT = 50`, `AUDIT_PAGE_MAX = 200`, `PASSWORD_HASH_CONCURRENCY = 4` (biến môi trường cùng tên ghi đè), `PASSWORD_HASH_QUEUE_MAX = 200`, `WRITE_RATE_PER_MINUTE = 240`, `OVERLOAD_RETRY_AFTER_SEC = 3`, `CATALOG_BASE_MONTH` (tháng nền cố định dạng `YYYY-MM`), `CATALOG_ROW_ID_BASE = 2^40`.

Biến môi trường: `SESSION_SECRET`, `SESSION_DAYS`, `SESSION_COOKIE_NAME` (mặc định `luong_sid`, phải khớp `/^[A-Za-z0-9_-]+$/` nếu không thì ném lỗi lúc nạp), `COOKIE_SECURE=1`, `NODE_ENV=production`, `TRUST_PROXY`, `ADMIN_PASSWORD`, `SHIFT_ALLOW_EDIT`, `SCHEDULE_ALLOW_EDIT`, `PARAMS_ALLOW_ACTIVATE`. "Production" ở module này = `NODE_ENV=production` **hoặc** `COOKIE_SECURE=1` (`auth.ts`, `save.ts`), trừ `bootstrapAdminPassword` chỉ xét `NODE_ENV` (`auth.ts,188`).

### 4.2 Mật khẩu

- Băm: `salt = randomBytes(16).hex`, `hash = scrypt(password, salt, 64).hex`, lưu `scrypt$salt$hash` (`auth.ts`, bản async).
- Kiểm: chuỗi lưu không bắt đầu `scrypt$` → sai. So bằng `timingSafeEqual` sau khi so độ dài (`auth.ts`).
- `verifyLogin(password, row)`: luôn chạy một lần scrypt; không có tài khoản thì băm với `DUMMY_HASH`, kết quả `!!row && khớp` (`auth.ts`).
- Độ dài tối thiểu: `config.PASSWORD_MIN_LENGTH = 6` ký tự (`String.length`, tính theo đơn vị UTF-16). Không có tối đa riêng ngoài trần 1 MB thân yêu cầu. Không có quy tắc độ phức tạp.
- `POST /login` chạy kiểm mật khẩu qua `hashGate` (tối đa 4 phép băm đồng thời, hàng đợi 200, đầy → 503 `OVERLOADED`, `src/modules/auth/auth.controller.ts,574`). `PUT /password`, `POST /staff/:u/password`, `PUT /staff/:u` gọi `hashPasswordAsync`/`verifyPasswordAsync` **không** qua `hashGate`.

### 4.3 Giới hạn đoán mật khẩu (`auth.ts`, `src/modules/auth/auth.controller.ts` / `src/modules/staff/staff.controller.ts`)

Khoá cặp `key = "<địa chỉ>|<username.slice(0,80)>"`. Địa chỉ = `clientIp(req)`: không có `TRUST_PROXY` hợp lệ → địa chỉ socket; có `n` → phần tử thứ `n` tính từ cuối của `X-Forwarded-For`, không phải IP hợp lệ thì địa chỉ socket (`http.ts`).

Trình tự `POST /login`:
1. `u = String(username).trim().toLowerCase()`.
2. `wait = loginWait(key)` = max(giây còn khoá của cặp, giây còn khoá của địa chỉ), sau khi dọn mục hết hạn. `wait > 0` → 429, `Retry-After = wait`, câu nói `ceil(wait/60)` phút. Không chạy băm.
3. Đọc `row = getStaffRow(u)`; kiểm mật khẩu (luôn băm).
4. Sai: `loginFailed(key)`:
   - Bảng địa chỉ: bỏ tên có lần sai cũ ≥ 15 phút; ghi tên này = thời điểm hiện tại; số tên khác nhau ≥ 30 → khoá địa chỉ 15 phút và xoá danh sách tên. Bảng đầy (5000) và địa chỉ mới → dọn mục không khoá; vẫn đầy thì bỏ qua lớp này.
   - Bảng cặp: lọc lần sai trong 15 phút, thêm lần này; đủ 5 → khoá cặp 15 phút, xoá danh sách. Bảng đầy toàn mục đang khoá → không nhận mục mới (không đẩy khoá đang có ra).
   - Lần sai làm địa chỉ bị khoá → 429 với `addressWait`; ngược lại 401.
5. Đúng mật khẩu nhưng `locked_at` có giá trị → 403 **trước** khi xoá bộ đếm (bộ đếm không được xoá).
6. Thành công: `loginSucceeded(key)` xoá mục cặp và xoá tên này khỏi danh sách của địa chỉ; trả hồ sơ + cookie.

Giới hạn chỉ áp cho `POST /login`. `PUT /password` (kiểm mật khẩu hiện tại) không đếm lần sai.

### 4.4 Phiên

- Khoá ký: `SESSION_SECRET` nếu có; production mà thiếu → ném lỗi lúc nạp `src/platform/auth.ts` (máy chủ không khởi động); dev/sandbox → đọc/sinh `settings.session_secret` (`auth.ts`).
- Cookie: `<payload base64url>.<HMAC-SHA256(payload) base64url>`; payload `{ u: username, v: passMark(u), sv: session_version, exp: now + SESSION_DAYS × 86400000 }` (`auth.ts`).
- `passMark(u) = HMAC("pw:" + pass_hash).slice(0,16)` → đổi mật khẩu (đổi `pass_hash`) làm mọi cookie cũ sai dấu.
- Thuộc tính: `Path=/; HttpOnly; SameSite=Lax; Max-Age=<SESSION_DAYS×86400>`, thêm `; Secure` khi `COOKIE_SECURE=1` (`auth.ts`).
- `readSession(cookie)` trả username khi **đủ** các điều kiện: chữ ký đúng (so `timingSafeEqual`); `exp > now`; `v` có và bằng `passMark(u)` hiện tại; tài khoản tồn tại; `locked_at` NULL; `(sv ?? 0) === session_version` hiện tại. Lỗi parse → null (`auth.ts`).
- Mỗi yêu cầu: `me = getStaff(readSession(cookie))` (`src/http/api-gate.ts`).
- Thu hồi phiên:

| Việc | Tăng `session_version` | Đổi `pass_hash` | Đóng SSE (`closeUser`, lý do) | Cấp cookie mới |
| --- | --- | --- | --- | --- |
| `POST /logout` (có `me`) | có | | `logout` | cookie rỗng |
| `PUT /password` | có | có | `password` | có (cho trình duyệt đang đổi) |
| `POST /staff/:u/password` | có | có | `password` | không |
| `PUT /staff/:u` có `password` cho tài khoản đã có | (luôn 400 `USE_PASSWORD_RESET` trước khi tới đây, xem 4.6) | | | |
| Khoá tài khoản | có (trong `lockStaff`) | | `locked` | |
| Mở khoá | không | | | |

- SSE: mỗi nhịp tim gọi lại `readSession(cookie)` của kết nối; khác người hoặc null → đóng luồng (`events.ts`).

### 4.5 Năng lực, vai trò, phạm vi

**Năng lực** (`authz.ts`): 32 tên trong `CAPS` + họ `request.decide.<loại>` (`request.decide.*` = mọi loại).

**Vai trò mặc định** (`authz.ts`, chỉ đọc):

| Vai trò | Phạm vi | Năng lực |
| --- | --- | --- |
| `admin` | all | mọi `CAPS` + `request.decide.*` |
| `cb` | all | `profile.read`, `contract.read`, `salary.read`, `salary.write`, `attendance.read`, `attendance.correct`, `attendance.lock`, `request.decide.*`, `kpi.score.write`, `payroll.view`, `payroll.calculate`, `payroll.approve`, `payroll.override`, `period.reopen`, `config.read`, `config.payroll`, `ai.review.read`, `ai.review.dismiss`, `audit.read`, `report.read`, `report.export` |
| `accounting` | all | `profile.read`, `profile.sensitive.read`, `salary.read`, `payroll.view`, `payroll.pay`, `config.read`, `config.legal`, `audit.read`, `report.read`, `report.export` |
| `hr` | all | `profile.read`, `profile.write`, `contract.read`, `contract.write`, `attendance.read`, `request.decide.leave`, `report.read`, `report.export` |
| `manager` | team | `profile.read`, `attendance.read`, `request.decide.*`, `report.read` |
| `staff` | self | `profile.read`, `attendance.read`, `salary.read`, `payroll.view`, `contract.read` |

**Vai trò hiệu lực của một người** `rolesOf(me)` (`authz.ts`):
1. `me` null hoặc `me.locked` → `[]`.
2. `store.roles.effectiveRoles(username)` = vai trò `staff_roles` còn hiệu lực + `admin` nếu `staff.role='admin'`; tài khoản khoá → `[]`.
3. Thêm `staff` nếu `me.payrollSubject`.
4. Chỉ giữ vai trò mặc định hoặc vai trò tuỳ chỉnh **còn dùng**; sắp xếp.

**Năng lực tuỳ chỉnh** `customCapsOf(def)` = các `caps` thuộc `CAPS` trừ `RESERVED_CAPS = ['roles.manage']` + `request.decide.<loại>` cho mỗi `approvals` thuộc `ApprovalView.ITEMS`. Lọc lại mỗi lần đọc từ DB (dữ liệu sửa tay không cấp được `roles.manage`). Phạm vi tuỳ chỉnh lạ → `all`. Vai trò tuỳ chỉnh trùng mã vai trò mặc định bị bỏ (`authz.ts`).

**Khớp năng lực** `grants(roleCaps, cap)`: bằng nhau; hoặc năng lực vai trò kết thúc `.*` và `cap` bắt đầu bằng phần trước `*`; hoặc hỏi `request.decide.*` và vai trò có bất kỳ `request.decide.<x>` (`authz.ts`).

**Phạm vi** `scopeOf(me, cap)` = phạm vi rộng nhất (`self < team < all`) trong các vai trò có năng lực đó; không có → null.

**`can(me, cap, target)`** (`authz.ts`): không phạm vi → false; không có `target` hoặc phạm vi `all` → true; `self` hoặc `team` → `target.username === me.username` (`team` hiện bằng `self` vì chưa có bảng phân nhóm).

**Cổng `gate(me, policy)`** (`authz.ts`):
- `public` / `authenticated` → qua.
- `cap: 'self-or:<x>'` → qua ở cổng; handler tự gọi `can(me, x, target)`.
- `cap: 'request.decide.*'` → qua khi có **bất kỳ** phạm vi.
- `cap` khác → chỉ qua khi `scopeOf(me, cap) === 'all'`. Hệ quả: vai trò `staff` (phạm vi self) bị 403 ở mọi route có `cap` thường, kể cả `profile.read`.

**Năng lực chỉ vai trò mặc định `admin` có**: `profile.read.pii`, `profile.sensitive.write`, `attendance.import`, `period.reopen.inputs`, `config.profile`, `roles.manage`, `staff.lock`. Vai trò tuỳ chỉnh nhận được mọi năng lực trong `CAPS` trừ `roles.manage`.

**Ma trận khu vực Không / Xem / Sửa** (`AREAS`, `src/domain/roles/roles.ts`): mỗi khu vực là một tập năng lực xem và một tập năng lực thêm khi chọn Sửa (Sửa gồm cả Xem).

| Khu vực (`id`) | Nhóm | Xem | Sửa thêm | Theo phạm vi |
| --- | --- | --- | --- | --- |
| `profile` Hồ sơ & hợp đồng | main | `profile.read`, `contract.read` | `profile.write`, `contract.write` | có |
| `attendance` Chấm công & nghỉ phép | main | `attendance.read` | `attendance.correct`, `attendance.import` | không |
| `pay` Lương & phụ cấp | main | `salary.read`, `payroll.view` | `salary.write`, `payroll.calculate`, `payroll.override` | có |
| `kpi` KPI | main | (không có mức Xem) | `kpi.score.write` | không |
| `report` Báo cáo | main | `report.read` | `report.export` | không |
| `settings_formula` Công thức lương & quyền lợi | settings | `config.read` | `config.payroll` | không |
| `settings_tax` Bảo hiểm & thuế | settings | `config.read` | `config.legal` | không |
| `settings_period` Kỳ lương & chấm công | settings | `config.read` | `config.payroll` | không |
| `access` Phân quyền & tài khoản | settings | (không có mức Xem) | `staff.lock` | không |

Năng lực lẻ (`EXTRAS`): `attendance.lock`, `payroll.approve`, `profile.sensitive.read` (luôn hiện trên màn); `profile.sensitive.write`, `profile.read.pii`, `payroll.pay`, `period.reopen`, `period.reopen.inputs`, `config.profile`, `ai.review.read`, `ai.review.dismiss`, `audit.read`.

Bảng chính sách đầy đủ của mọi route nằm ở mục 4.14.

**Mức nhạy cảm nhật ký** `auditSensitivities(me)`: luôn `normal`; thêm `pay` nếu `salary.read` phạm vi all; thêm `pii` nếu `profile.sensitive.read` phạm vi all (`authz.ts`).

**Tự quyết cho mình** `isSelfDecision(me, u)` = `me.payrollSubject && u === me.username` (`authz.ts`). Admin ngoài bảng lương không bao giờ là "tự quyết".

**Khoá chính sách route** `routeKey(method, seg)` (`authz.ts`): `seg = ['api', ...]`. Các mẫu có tham số được đặt tên (`/periods/:month...`, `/staff/:u/schedule[/preview]`, `/blocks/:code/<bước>`, `/positions/:code/levels`, `/pay-entries/...`, `/advance-requests/:id/<bước>`, `/explanations/:id/<bước>`, `/catalog/positions/:code`, `/employees/:uuid[/<bước>]`, `PUT /staff/shift-bulk`, `/roles/:code[/<bước>]`, `/staff/:u/roles`, `/staff/:u/password`, `PUT|DELETE /staff/:u`). Còn lại: `METHOD /<seg1>/<seg2>`. Thứ tự các dòng `if` quyết định kết quả (ví dụ `PUT /staff/shift-bulk` phải đứng trước `PUT /staff/:u`).

### 4.6 Hồ sơ `PUT /staff/:u` (tạo hoặc sửa) — trình tự đúng như mã (`src/modules/staff/staff.controller.ts`)

1. `username = decodeURIComponent(seg[2]).toLowerCase()`; lỗi giải mã → 400; không khớp `USERNAME_RE` → 400. `prev = getStaffRow(username)` (có thể null = tạo mới).
2. `expectedRev` (tuỳ chọn, chuỗi khác rỗng): khác `staffRevision(username)` → 409 `STAFF_STALE { currentRev }`. Gửi mà không phải chuỗi → 400. Thiếu → ghi đè.
3. `locked` có mặt mà không phải boolean → 400; có mặt mà `can(me,'staff.lock')` false → 403. `locked:true` cho chính mình → 400. Có boolean → `guardAdminLock(locked)`: nếu tài khoản đích là Admin (`staff.role='admin'` hoặc dòng vai trò `admin`), người làm phải có `roles.manage`; khoá Admin chưa khoá khi `countAdmins() < 2` → 409 `LAST_ADMIN`.
4. **Chỉ khoá/mở khoá**: thân chỉ có `locked` (cộng `expectedRev`) → không có tài khoản 404; `lockStaff`/`unlockStaff`, nhật ký chỉ khi trạng thái thật sự đổi; khoá thì `closeUser(...,'locked')`; trả `{ staff, created: false }`. Không kiểm trường khác.
5. Họ tên: có `familyName` hoặc `givenName` (chuỗi) → `PersonName(family, given)`, thiếu tên → 400 `GIVEN_NAME_REQUIRED`, `name = họ + ' ' + tên` (viết hoa chữ đầu). Không có → `name = String(b.name).trim()`. Rỗng → 400 `Thiếu họ tên`.
6. `contractStatus`: khác `probation/official/null/''` → 400 `BAD_CONTRACT_STATUS`. Thiếu (`undefined`) → giữ giá trị đang lưu; `null`/`''` → xoá.
7. `resignedOn`: không phải ngày hợp lệ → 400 `BAD_RESIGNED_ON`. Thiếu → giữ; `null`/`''` → xoá.
8. `role`: khác `admin/staff/null/undefined` → 400. **Thiếu → `'staff'`**. Cấp hoặc gỡ `admin` (so với `prev.role`, tài khoản mới coi như `staff`) mà không có `roles.manage` → 403.
9. `type`: phải thuộc `activeCodesOf(params tháng hiện tại)` (chức vụ chưa ngưng dùng) hoặc bằng `prev.type`, nếu không 400. **Thiếu → `Positions.defaultCode`** (chức vụ đầu tiên của `registry.TYPES`).
10. `payrollSubject`: có mà không phải boolean → 400. Giá trị dùng: có → theo đó; không có mà vai trò đổi → `role !== 'admin'`; còn lại `undefined` (giữ). `inPayroll` = giá trị trên, hoặc giá trị đang lưu, hoặc `role !== 'admin'` cho tài khoản mới.
11. `needsLevel = role !== 'admin' || inPayroll`. `level`: không cần → giữ `prev.level ?? 0`; cần mà `b.level` trống → (khi vai trò đổi trong cùng yêu cầu, bậc cũ còn hợp lệ) hoặc **1**; còn lại `Number(b.level)`. Cần mà không phải nguyên trong `1..levelCountOf(type)` → 400.
12. `nightPct`: `nightOptions = typeParam(params, type, 'nightOptions', level)` (bậc thắng chức vụ). Có bảng: gửi giá trị → phải thuộc bảng **hoặc** bằng giá trị đang lưu (cùng `type`); không gửi → giữ giá trị đang lưu nếu còn trong bảng, không thì phần tử đầu. Không có bảng → `null`.
13. `idorm = benefitOf(params, type, 'idorm', level) && !!b.idorm` (**thiếu → false**).
14. `shiftCode`: trống → **null**; có thì phải là khoá trong `rulesFor().punch.SHIFT` (mã cũ hoặc mã mới), nếu không 400 `Ca cố định không hợp lệ`; lưu `canonicalOf(code) || code`.
15. `startDate = b.startDate ? String : null` (**thiếu → null**). `birthday`: thiếu và người làm **không** có `profile.read.pii` với tài khoản đã có → giữ giá trị cũ; còn lại theo thân (**thiếu → null**). Sai ngày → 400.
16. `warnIf('START_DATE_REQUIRED', needsLevel && type.<type>.startDateRequired === true && !startDate)`.
17. `leaveAdjust = round(Number(b.leaveAdjust)||0 × 2) / 2` (**thiếu → 0**); `|leaveAdjust| > 365` → 400.
18. `contract`: thiếu → giữ; `null/''` → null; khác `long/short` → 400. `insured`: thiếu → giữ cột thô; khác `null/boolean/0/1` → 400. `dependants`: thiếu → giữ; `null/''` → 0; số hoặc chuỗi chữ số; ngoài `0..20` → 400. `jobTitle`: thiếu → giữ; > 80 ký tự sau trim → 400. `taxOn/deductOn/advanceOn`: thiếu → giữ cột; khác `null/boolean/0/1` → 400.
19. Trường lương đổi (`payFields`): tài khoản mới → luôn `['type','level']`; tài khoản cũ → so `effectivePay(cũ)` với `effectivePay(mới)` trên `type, level, nightPct (null → phần tử đầu nightOptions), idorm, contract (null → defaultContract), insured (null → insurance.coverage.<contract>), dependants, taxOn/deductOn/advanceOn (null → true)`.
20. Tự sửa của chính mình (`isSelfDecision`): danh sách `own = payFields + leaveAdjust (nếu đổi) + shiftCode (nếu đổi) + password (nếu gửi)`. Có `password` → 403 `SELF_DECISION_FORBIDDEN { fields }`; còn lại `selfDecision`: cảnh báo.
21. `payFields` khác rỗng và không có `salary.write` (bất kỳ phạm vi) → 403 `FORBIDDEN_CAP { fields }`. Vì tài khoản mới luôn có `payFields`, người không có `salary.write` (ví dụ `hr`) không tạo được tài khoản.
22. `password` cho tài khoản **khác** đã có mà thiếu `roles.manage` → 403; `password` cho **bất kỳ** tài khoản đã có → 400 `USE_PASSWORD_RESET`. Hệ quả: mật khẩu qua hồ sơ chỉ dùng khi tạo mới.
23. Tạo mới: `password` < 6 → 400; băm. Không có `pass_hash` → 400 `Tài khoản mới cần mật khẩu`. Sửa chính mình thành không phải admin → 400.
24. Giao dịch 1: `upsertStaff(...)` (cột `payroll_subject` chỉ đổi khi `payrollSubject` không `undefined`, dùng `COALESCE`; `contract_status`/`resigned_on` giữ nguyên khi `undefined`); nếu `needsLevel && (mới || đổi type || payrollSubject===true)` → `reconcileStaffType(username, type)` (đồng bộ lại dòng duyệt của mọi tháng đã có lịch); nếu sau lưu `payrollSubject` false mà còn dòng vai trò `staff` → thu hồi; `audit.staffSaved`; nếu cờ `payrollSubject` đổi → thêm nhật ký `staff.payrollSubject`.
25. Sau giao dịch 1 (chỉ đạt khi tạo mới có mật khẩu, nên nhánh này không thực sự chạy cho tài khoản cũ): `bumpSessionVersion` + `closeUser`.
26. Giao dịch 2 (riêng): `locked` boolean → khoá/mở khoá + nhật ký nếu đổi; khoá → `closeUser`.
27. Trả `{ staff: staffForViewer(me, getStaff(u)), created: !prev }`.

Tóm tắt "thiếu trường thì sao" cho người viết giao diện:

| Giữ giá trị đang lưu khi thiếu | Đặt lại khi thiếu |
| --- | --- |
| `contractStatus`, `resignedOn`, `payrollSubject`, `nightPct` (nếu còn hợp lệ), `contract`, `insured`, `dependants`, `jobTitle`, `taxOn`, `deductOn`, `advanceOn`, `locked`, `birthday` (chỉ khi người làm không có `profile.read.pii`), họ/tên tách (tách lại từ `name`) | `role` → `staff`, `type` → chức vụ mặc định, `level` → 1, `idorm` → false, `shiftCode` → null, `startDate` → null, `birthday` → null (người làm có `profile.read.pii`), `leaveAdjust` → 0, `name` bắt buộc |

**Số phiên bản hồ sơ** `staffRevision(u)` = 16 ký tự hex đầu của SHA-256 trên JSON các cặp `[cột, giá trị]` của dòng `staff` đã sắp theo tên cột, **bỏ** `session_version`, `pass_hash`, `leave_balance`, `leave_balance_on` (`staff.ts`). Cột nào có trong bảng `staff` đều được tính vào số này, trừ các cột bỏ qua ở trên.

**Che trường khi gửi ra** (`staff.ts`):
- `publicStaff`: bỏ `sessionVersion`. Với `role !== 'admin'` thêm `insured` hiệu lực (cột có giá trị → theo cột; NULL → `insurance.coverage.<contract>` của tháng hiện tại), `insuredExplicit`, `levelName` (= `level.<type>.<level>.name` tháng hiện tại hoặc null). `role='admin'` trả nguyên, không có ba trường này.
- `staffForViewer`: thêm `rev`; không có `salary.read` với người đó → bỏ `dependants, contract, insured, insuredExplicit, taxOn, deductOn, advanceOn`; không có `profile.read.pii` → bỏ `birthday`. `type`, `level`, `nightPct`, `idorm`, `leaveAdjust` **không** bị che.
- `GET /employees/:uuid` (`src/modules/employees/employees.controller.ts`): không có `salary.read` → bỏ `position.baseSalary`, `position.kpiMax`; không có `profile.read.pii` → bỏ `birthday`.

### 4.7 Gán vai trò `PUT /staff/:u/roles` (`src/modules/staff/staff.controller.ts`)

1. `roles` phải là mảng tên thuộc `knownRoleSet()` (mặc định + mọi vai trò tuỳ chỉnh, kể cả đã ngưng dùng). `want = unique(roles).sort()`.
2. Trong giao dịch: `rev = rolesRevOf(mọi dòng staff_roles của người đó)` = số dòng + số dòng đã thu hồi. `expectedRev` có và khác → 409 `ROLES_STALE`.
3. `current = rolesOfStaff(target)` (dòng còn hiệu lực + `admin` từ `staff.role` + `staff` từ `payrollSubject`, chỉ tên đã biết, **không** xét khoá). `toGrant = want − current`, `toRevoke = current − want`.
4. Tự bỏ `admin` của mình → 403 `SELF_ADMIN_REMOVAL`.
5. Vai trò cần gỡ mà không có dòng `staff_roles` và không phải `staff` (tức `admin` từ `staff.role`) → 409 `ROLE_DERIVED`.
6. Gán vai trò tuỳ chỉnh đã ngưng dùng → 400 `ROLE_DEPRECATED`.
7. `grant` từng vai trò mới (kể cả `staff`, tạo dòng), `revoke` từng vai trò có dòng.
8. `syncPayroll(actx, u, want.includes('staff'), target.payrollSubject)`: cờ đổi thì `setPayrollSubject` + nhật ký `staff.payrollSubject` (mức `pay`). Vừa bật `staff` mà `level < 1` → cảnh báo `ROLE_STAFF_NO_LEVEL`.
9. `countAdmins() < 1` → 409 `LAST_ADMIN` (cả giao dịch hoàn tác).
10. Nhật ký `role.grant` / `role.revoke` mỗi vai trò (mức `pii`).
11. Có đổi → SSE `roles.changed` cho người đó.

Lúc khởi động `Roles.reconcileStaffRole()` (`src/modules/staff/staff.controller.ts`, `roles.ts`): tài khoản có dòng `staff` còn hiệu lực mà `payrollSubject` false → bật cờ, nhật ký với `actor: 'system'`.

### 4.8 Vai trò tuỳ chỉnh (`src/domain/roles/roles.ts`)

- **Lý do** `parseReason(value)`: trống → null. Có → trim; > 300 → 400 `REASON_REQUIRED` (`roles.ts`).
- **Tên** `parseLabel`: trim, gộp khoảng trắng; 1..40 ký tự (đếm theo code point); không chứa `<` `>`. Trùng tên (không phân biệt hoa thường, locale `vi`) với vai trò mặc định hoặc vai trò tuỳ chỉnh khác → 409 `ROLE_LABEL_CLASH`.
- **Mã**: gửi `code` → khớp `/^[a-z][a-z_]{1,31}$/` và không phải tên thuộc `Object.prototype`; không gửi → `codeFromLabel(label)` (bỏ dấu, `đ→d`, chữ thường, ký tự khác chữ thành `_`, cắt 32, bỏ `_` hai đầu). Trùng mã mặc định hoặc tuỳ chỉnh → 409 `ROLE_CODE_CLASH`.
- **Năng lực từ thân** `capsFromBody`: `perms {khu vực: khong|xem|sua}` = `levels {khu vực: none|view|edit}`; `approve` = `approvals`. Gửi cả `caps` và `levels` → 400. `levels` → `capsFromLevels`: `view` cho năng lực `area.view`, `edit` cho `view + edit`; khu vực không có `view` không nhận mức `view`. Rồi `parseCaps`: `request.decide.*` → mọi loại; `request.decide.<x>` → loại x (phải thuộc `APPROVAL_ITEMS`); `roles.manage` → 400 `ROLE_CAP_RESERVED`; tên lạ → 400 `ROLE_CAP_UNKNOWN`. `approvals` gửi riêng **thay hẳn** loại suy từ `caps`.
- **Loại yêu cầu được duyệt** (`APPROVAL_ITEMS`, thứ tự trên màn): `leave` (Nghỉ phép năm), `isat` (iSAT), `approved` (Nghỉ được duyệt), `ot` (Làm thêm giờ), `makeup_hours` (Làm bù theo giờ), `holiday_work` (OT ngày lễ), `willmakeup` (Nghỉ, sẽ làm bù). `makeup_day` nằm trong `RETIRED_ITEMS`: đầu vào mang loại này bị bỏ qua, không báo lỗi, không lưu.
- **Tạo**: tối đa 30 vai trò tuỳ chỉnh (kể cả đã ngưng) → 409 `ROLE_LIMIT`. Sao chép từ vai trò mặc định: lấy năng lực được phép (bỏ `roles.manage`), loại duyệt, phạm vi; từ tuỳ chỉnh (kể cả đã ngưng): lấy `caps`, `approvals`, `scope`. Tên mặc định khi sao chép: `<tên nguồn> (bản sao)`. Phạm vi mặc định `all`. `rev = 1`. Lưu `settings['roles.custom'].rev + 1`.
- **Sửa**: bắt buộc `rev` nguyên bằng `def.rev` (400 `ROLE_REV_REQUIRED` / 409 `ROLE_STALE`). Người đang giữ vai trò này thêm năng lực hoặc loại duyệt → 403 `ROLE_SELF_ESCALATION` (bớt thì được). Không đổi gì → không ghi, `changed: false`. Có đổi → `def.rev + 1`, `table.rev + 1`, nhật ký `role.update`, SSE `roles.changed` cho mọi người có dòng gán vai trò này **còn hiệu lực** (`holdersOf`, `roles.ts`; kể cả tài khoản đang khoá).
- **Ngưng dùng**: người giữ mất năng lực ngay (vì `activeCustomRoles` bỏ vai trò ngưng); dòng gán giữ nguyên. Trả `holders` = số người.
- **Mô tả** (`describeAll`): vai trò mặc định `readOnly: true`, `isDefault` chỉ `staff`; vai trò ngưng dùng có `caps: []`, `storedCaps`, `deprecatedAt`. `users` = số tài khoản **chưa khoá** giữ vai trò (theo `rolesOfStaff`). Mức khu vực `levelOf`: đủ năng lực Sửa (và khu vực có năng lực) → `edit`; đủ năng lực Xem → `view`; còn lại `none`.

### 4.9 Danh mục chức vụ, bậc (`position-catalog.ts`)

- Đọc tháng `m`: mỗi mã lấy dòng có `effective_month ≤ m` lớn nhất; mỗi bậc cũng vậy. Bậc chỉ xuất hiện khi đã có dòng `≤ m`.
- `position(type, level, m)`: không có dòng chức vụ hoặc bậc → null. `nightPct = level.night_pct ?? type.night_pct`. `schedule[dow] = 'regular'` cho `regular_dows`; cột `makeup_dows` không còn đọc, dòng mới ghi `[]`. `benefits` = mọi mã `benefit_types` trừ `RETIRED_BENEFITS` (thiếu dòng = false).
- `saveType(code, changes, {effectiveMonth, by, at, reason, expectedRev})`:
  1. Tháng dạng `YYYY-MM`; trường chỉ trong `name, workdays, flexPct, nightPct, travelPct, attendancePct, regularDows, benefits`.
  2. `name` 1..40 ký tự (`String.length`) sau trim khác rỗng; `workdays` nguyên 1..31; `%` số hữu hạn 0..100; `dows` mảng số nguyên 0..6 không trùng; `benefits` object `{mã có trong benefit_types trừ RETIRED_BENEFITS: boolean}`.
  3. Giao dịch: dòng hiệu lực tại `effectiveMonth` phải có (404). `expectedRev` có thì phải bằng `rev` của dòng đó (409 `POSITION_STALE { current }`) — route bắt buộc gửi.
  4. Trộn: trường không gửi lấy từ dòng hiện tại; `regularDows` được sắp tăng.
  5. `effective_month` của dòng hiện tại = tháng áp dụng → UPDATE (`rev+1`); khác → INSERT dòng mới `rev = rev cũ + 1`.
  6. Ghi lại **toàn bộ** cờ quyền lợi cho dòng (cờ cũ + cờ gửi lên, không gồm cờ trong `RETIRED_BENEFITS`).
- `saveLevel(type, level, changes, ...)`: `level` nguyên ≥ 1; chức vụ phải có ở tháng đó; bậc chưa có → chỉ được thêm `level = số bậc hiện có + 1`, và khi thêm bắt buộc `name` và `baseSalary`; `baseSalary` / `kpiMax` là số nguyên an toàn ≥ 0 (`kpiMax` null = không có KPI); `nightPct` 0..100 hoặc null. `expectedRev` chỉ kiểm khi gửi; route bắt buộc gửi khi bậc đã có.
- `paramRows()` (đổi danh mục thành tham số, áp theo `effective_month` của từng dòng):

| Khoá tham số | Giá trị | Đơn vị |
| --- | --- | --- |
| `type.<mã>.workdays` | `workdays` | ngày |
| `type.<mã>.flexBonus` | `flex_pct / 100` | tỉ lệ |
| `type.<mã>.travel` | `travel_pct / 100` | tỉ lệ |
| `type.<mã>.attendance` | `attendance_pct / 100` | tỉ lệ |
| `type.<mã>.nightPct` | `night_pct` | **%** (không chia 100); bộ máy chỉ đọc khoá này (và `level.<mã>.<n>.nightPct`) khi `shift.allowance.basis = 'assigned'` |
| `type.<mã>.dows` | mảng thứ | |
| `type.<mã>.benefit.<cờ>` | bool | mọi cờ trừ `RETIRED_BENEFITS` |
| `level.<mã>.<n>.name`, `.base` | tên, VND | |
| `level.<mã>.<n>.kpi` | `kpi_max` (chỉ khi khác null) | VND |
| `level.<mã>.<n>.nightPct` | `night_pct` (chỉ khi khác null) | % |

- Trộn với tham số (`src/params/store.ts`): dòng danh mục nhận id `CATALOG_ROW_ID_BASE + i + 1`, chồng lên **ở cả hai chế độ** `params_mode`; theo từng khoá, dòng có tháng áp dụng muộn hơn thắng, cùng tháng thì danh mục thắng. Bộ nhớ đệm `resolve` đổi khoá khi `catalog_rev` đổi.

### 4.10 Danh mục ca và giờ ca

- `ShiftCatalog.find(code)`: tìm theo `code = ?` **hoặc** `preset = ?` (mã mới hoặc cũ). `canonicalOf` → mã mới; `presetOf` → khoá giờ cũ.
- `save`: chỉ `name` (1..40), `kind` (`normal/flex/night`), `sort` (số nguyên an toàn), `deprecated` (boolean); `updateWithRev` với `expectedRev` (route bắt buộc).
- `paramRows()` áp ở tháng `CATALOG_BASE_MONTH` (tức mọi tháng): `shift.kind.<mã mới> = kind`; nếu `preset ≠ code` thêm `shift.kind.<preset> = kind` và `shift.alias.<mã mới> = preset`. Đổi loại ca vì vậy đổi phụ cấp ca của mọi tháng mà bộ máy đọc khoá này.
- `Shift.allowance()` = `null` cho `normal`, ngược lại `kind`. `Employee.shiftAllowancePct()` = `position.nightPct` nếu `night`, `position.flexPct` nếu `flex`, 0 nếu không có ca/không có vị trí (`employee.ts`).
- `shift.allowance.basis = 'assigned'` (mặc định trong `DEFAULTS`, mọi tháng): bộ máy lấy loại ca từ danh mục ca (qua `shift.kind.*`) và phụ cấp ca đêm theo bậc: `level.<mã>.<n>.nightPct`, không có thì `type.<mã>.nightPct`, không có nữa thì phần tử đầu `nightOptions` (`src/engine/payroll-engine.ts,222-236`). Cột `staff.night_pct` (phụ cấp đêm chọn theo người) chỉ được dùng khi bản chụp tham số cũ thiếu khoá `shift.allowance.basis` (bộ máy khi đó đoán ca theo giờ có mặt).
- Giờ ca (`src/domain/shifts.ts`): `shiftsOf(m)` = ca chưa ngưng trong danh mục có giờ `rulesFor(m).punch.SHIFT[preset]`, rồi giờ ca không có trong danh mục (mã = preset, tên = PRESET viết hoa, `kind: null`). `hours = time.workHoursPerDay + time.breakHours` (8 + 1 = 9 giờ). `PUT /settings/shifts` đổi `{code,in,out}` thành `shift.preset.<preset>.in|out` rồi gọi `paramsSave.save` (một đường với `PUT /settings/params`). `employeeView(m)` gửi `{ shifts: {mã: {name,start,end}}, earlyCheckinHours (attendance.earlyCheckinMaxHours = 4), openSessionMaxHours (attendance.openSessionMaxHours = 16) }`.
- Gán ca hàng loạt: `preset` hoặc cặp `in/out` trùng đúng một ca trong `punch.SHIFT`; mã phải là khoá của `punch.SHIFT`; lưu mã mới; `effective` chỉ nhận ngày hiện tại (hoặc trống); người làm là nhân sự lương và có mình trong danh sách mà ca của mình đổi → `selfDecision`. Một giao dịch: chỉ ghi người có `shift_code` khác, câu lệnh SQL trực tiếp `UPDATE staff SET shift_code` (`src/modules/settings/settings-shifts.controller.ts` / `src/modules/settings/settings.controller.ts`), nhật ký `staff.update` mỗi người.

### 4.11 Cờ quyền lợi và những việc mỗi cờ mở

Cờ là khoá `type.<mã>.benefit.<cờ>` (theo chức vụ) và `level.<mã>.<bậc>.benefit.<cờ>` (ghi đè theo bậc; khoá bậc có giá trị boolean thì thắng chức vụ). `benefitOf(params, type, flag, level)` (`src/platform/request-rules.ts`) trả `true` chỉ khi cờ đúng `true`; vắng khoá hoặc mã chức vụ lạ là `false`. `Positions.benefitsOf` (`src/params/positions.ts`) trả cùng kết quả cho cả 13 cờ của `BENEFIT_FLAGS`. Trong DB cờ nằm ở `position_type_benefits` (theo chức vụ, mỗi phiên bản một bộ); ghi đè theo bậc chỉ có trong bộ tham số.

| Cờ | Tác dụng trong mã |
| --- | --- |
| `ot` | Khai OT trên lịch (`src/domain/timesheet/` (nối ở `timesheet/services.ts`)), khai đi làm ngày lễ trong lịch có khung giờ vào – ra và khai OT từ lượt chấm công (`src/domain/ot.ts`): thiếu cờ thì lưu kèm cảnh báo `BENEFIT_NOT_ALLOWED` (khoản không được trả tiền). Bộ máy: thiếu cờ thì không có giờ OT và không có giờ làm ngày lễ, ngày lễ chỉ còn lương lễ nếu chức vụ có `paidHoliday` (`src/engine/payroll-engine.ts,472`). Khối cấu hình "Làm thêm (OT)" bật theo cờ này. |
| `makeup` | Khối cấu hình "Làm bù" (hệ số `holiday.makeupRate`) bật theo cờ này (`src/params/blocks.ts`); `src/engine/payroll-engine.ts` không đọc cờ này. |
| `makeupHours` | Khai làm bù theo giờ trên lịch (`extraKind='makeup'`): thiếu cờ thì cảnh báo `BENEFIT_NOT_ALLOWED` (khoản chờ duyệt và nếu được duyệt vẫn có tiền) (`checkRequestFlags`, `src/domain/positions.ts`). |
| `makeupDay` | Bộ máy (`src/engine/payroll-engine.ts`) và máy chủ không đọc. Màn danh mục chức vụ lọc riêng cờ này khỏi danh sách cờ hiển thị và chỉ giữ nhãn cho nhật ký; `src/engine/payroll-params.ts,771,796` vẫn giữ mặc định `type.<mã>.benefit.makeupDay: true`. |
| `paidHoliday` | Ngày lễ trong thời gian làm việc được lương ngày (`src/engine/payroll-engine.ts`); thiếu cờ thì lương lễ là 0. |
| `paidLeave` | Ngày nghỉ phép năm có lương ngày. |
| `isat` | Ngày iSAT được khai và được trả; điều kiện đầy đủ ở "iSAT" dưới. |
| `approvedLeave` | Khai "Nghỉ được duyệt": thiếu cờ thì `BENEFIT_NOT_ALLOWED` (ngày chờ Admin duyệt, không lương), trừ ngày đã lưu loại này từ trước (`timesheet/timesheet-validator.ts`). |
| `absenceDeclarable` | Khai nghỉ phép (`leave`) hoặc nghỉ không lương vào ngày trong lịch: thiếu cờ thì `BENEFIT_NOT_ALLOWED` (`timesheet/timesheet-validator.ts`). |
| `leaveAccount` | Có tài khoản phép năm: `withLeave` thêm `leave` vào hồ sơ trả ra; ngày trong lịch còn phép năm thì không khai nghỉ không lương (`timesheet/timesheet-validator.ts`); sổ phép (`src/domain/leave/leave-account-service.ts`); quy đổi phép dư (`src/domain/payroll/payroll-service.ts`). |
| `idorm` | Cho phép đặt `staff.idorm = 1` (mục 4.6 bước 13); bộ máy đọc `staff.idorm` làm biến `iDorm` (`src/engine/payroll-engine.ts`). |
| `breakPay` | Giờ nghỉ đêm có lương: `breakPay === false` thì 0, vắng khoá vẫn trả (`src/engine/payroll-engine.ts`). |
| `holidayWork` | Nằm trong `RETIRED_BENEFITS`: danh mục, tham số và bộ máy không đọc. Làm ngày lễ theo cờ `ot`. |

**Dữ liệu cờ gửi cho giao diện** (`src/domain/positions.ts`):
- `myPosition(me)` (, gửi trong `GET /me`): `me.payrollSubject` false → `{ benefits: null, positionLabel: null }`. Ngược lại `benefits = Positions.benefitsOf(params, type, level)` kèm `startDateRequired`, và `positionLabel = defOf(type).label` nếu có `type.<type>.workdays`.
- `sheetFlagsOf(params, type, level)` → 6 cờ `canOt, canIsat, canApproved, canDeclareAbsence, hasLeaveAccount, canMakeupHours`; `PUT /sheet` đọc `canOt, canApproved, canDeclareAbsence, hasLeaveAccount` (`src/domain/timesheet/` (nối ở `timesheet/services.ts`)), `canMakeupHours` đi vào `checkRequestFlags`; `canIsat` không nơi nào đọc.
- `checkRequestFlags(flags, day, date, { onBehalf })` chỉ kiểm làm bù theo giờ qua `warnIf('BENEFIT_NOT_ALLOWED', ...)`. `onBehalf` (Admin khai thay, khoản được duyệt luôn trong lần lưu) chỉ đổi câu cảnh báo.
- `activeCodesOf(params)`: mã chức vụ có `type.<mã>.workdays` và `position.def.<mã>.deprecated` không bật.
- `withLeave(params, staff)`: chức vụ/bậc có `leaveAccount` → thêm `leave: leaveSummary(staff)`.

**iSAT** (`src/domain/isat-rule.ts`): `isatRefusal({ params, staff, date })` trả lý do từ chối hoặc `null`.
1. Chức vụ/bậc không có `benefit.isat` → `BENEFIT_NOT_ALLOWED`.
2. Ngày không đúng thứ `isat.weekday` (mặc định `6`, thứ Bảy; `src/engine/payroll-params.ts`) → `SHEET_ISAT_WEEKDAY`.

Chặn cứng (400) cả với Admin ở: `PUT /sheet` khi ngày được khai hoặc đổi sang loại iSAT, trừ ngày iSAT đã lưu và giữ nguyên loại thì được miễn kiểm (`src/domain/timesheet/` (nối ở `timesheet/services.ts`)); `PUT /approvals/decide` khi duyệt khoản iSAT (`src/modules/sheet/sheet.controller.ts` / `src/modules/approvals/approvals.controller.ts`). Danh sách kiểm khi chốt công đếm các ngày iSAT đã lưu vi phạm hai điều kiện trên bằng cảnh báo `ISAT_INVALID` (`src/domain/period/periods.ts`). Bộ máy chỉ trả lương ngày iSAT khi chức vụ có cờ `isat` và ngày đúng thứ `isat.weekday` (`src/engine/payroll-engine.ts`).

**Check-in trên ngày đã khai nghỉ cả ngày** (`checkInDay`, `src/modules/sheet/sheet.controller.ts` / `src/modules/approvals/approvals.controller.ts`): ngày có khoản OT hoặc làm bù theo giờ đã duyệt thì luôn được Check-in. Ngày có loại `isat`, `leave` hoặc `unpaid` đóng Check-in, trừ khi khoản bị từ chối (chờ duyệt, đã duyệt hay chưa có khoản đều đóng). Ngày có loại `approved` hoặc `willmakeup` đóng Check-in chỉ khi khoản đã duyệt. Còn lại, nhân viên chỉ Check-in được ngày là ngày làm việc trong lịch được gán và không phải ngày lễ; ngày khác trả câu báo "không có lịch làm việc hay giờ OT/làm bù được duyệt".

### 4.12 Đường vào giao diện sau đăng nhập


### 4.13 Tài khoản Admin đầu tiên (`src/modules/auth/auth.controller.ts`, `auth.ts`)

Chỉ khi chạy trực tiếp (`require.main === module`) và bảng `staff` trống: `ADMIN_PASSWORD` có → production cần ≥ 12 ký tự (thiếu → thoát mã 1); không có → production thoát mã 1, còn lại sinh 12 byte ngẫu nhiên base64url (không in). Tạo `admin` / `Admin` / `role=admin` / `type=defaultCode` / `level=0` (băm đồng bộ). Không bao giờ in mật khẩu.

### 4.14 Bảng chính sách route `ROUTE_CAPS` (`src/platform/authz.ts`)

Khoá = `METHOD /<đoạn 1>/<đoạn 2>` hoặc tên do `routeKey()` đặt. Bốn dạng chính sách và cách cổng `gate()` xử lý ở mục 4.5. `periodScope` (khoá kỳ ở cổng) chỉ có ở: `PUT /holidays`, `PUT /sheet`, `PUT /sheet/bulk`, `POST /punch`, `PUT /approvals/decide`, `POST /ot`, `PUT /ot`, `PUT /staff/:u/schedule` (đều `attendance`), `PUT /kpi/scores` (`kpi`), `PUT /slip-override` (`slip`); mọi route khác là `null`.

| Dạng | Route |
| --- | --- |
| `public` | `POST /login`, `POST /logout`, `GET /me`, `GET /health` |
| `authenticated` | `PUT /password`, `GET /holidays`, `GET /punch`, `POST /punch`, `PUT /sheet`, `GET /events`, `GET /settings/version`, `GET /me/estimate`, `GET /advance-requests`, `POST /advance-requests`, `POST /advance-requests/:id/cancel`, `GET /advance-approvals`, `POST /advance-approvals/request`, `POST /advance-approvals/withdraw`, `GET /explanations`, `POST /explanations`, `POST /explanations/:id/answer` |
| `self-or:<năng lực>` | `GET /sheet` (`attendance.read`), `PUT /kpi/scores` (`kpi.score.write`), `GET /staff/:u/schedule` (`profile.read`), `GET /periods/:month/payslips/:username` (`payroll.view`), `GET /leave/ledger` (`profile.read`) |
| `profile.read` | `GET /staff`, `GET /employees/:uuid` |
| `profile.write` | `PUT /staff/:u`, `PUT /staff/shift-bulk`, `POST /leave/refresh` |
| `staff.lock` | `DELETE /staff/:u` |
| `roles.manage` | `GET /roles`, `POST /roles`, `PUT /roles/:code`, `POST /roles/:code/deprecate`, `PUT /staff/:u/roles`, `POST /staff/:u/password` |
| `config.read` | `GET /positions`, `GET /entitlements`, `POST /positions`, `GET /settings/params`, `PUT /settings/params`, `POST /settings/params/preview`, `POST /settings/params/revert`, `GET /settings/shifts`, `PUT /settings/shifts`, `GET /settings/first-run`, `GET /catalog/positions`, `GET /catalog/shifts` |
| `config.payroll` | `PUT /holidays`, `PUT /settings/geofence`, `POST /positions/:code/levels`, `POST /blocks`, `PUT /catalog/positions/:code`, `PUT /catalog/levels`, `PUT /catalog/shifts` |
| `config.legal` | `PUT /blocks/:code/confirm`, `POST /pay-entries/:id/confirm-flags` |
| `request.decide.*` (có bất kỳ phạm vi) | `GET /approvals`, `GET /approvals/count`, `GET /alerts`, `PUT /approvals/decide`, `PUT /sheet/bulk`, `PUT /advance-requests/:id/decide`, `POST /advance-approvals/approve`, `POST /advance-approvals/reject`, `POST /advance-approvals/cancel`, `POST /advance-approvals/approve-all` |
| `attendance.read` | `GET /today`, `GET /attendance` |
| `attendance.correct` | `GET /ot`, `POST /ot`, `PUT /ot`, `POST /explanations/:id/decide` |
| `attendance.lock` | `POST /periods/:month/lock-attendance` |
| `kpi.score.write` | `GET /kpi/scores` |
| `salary.read` | `GET /pay-entries` |
| `salary.write` | `POST /pay-entries`, `POST /pay-entries/bulk`, `PUT /pay-entries/:id`, `POST /pay-entries/:id/void` |
| `payroll.view` | `GET /team`, `GET /periods`, `GET /periods/:month`, `GET /periods/:month/payslips`, `GET /periods/:month/estimates`, `GET /periods/:month/estimates/:username` |
| `payroll.calculate` | `POST /periods/:month/calculate` |
| `payroll.approve` | `POST /periods/:month/approve`, `PUT /periods/:month/payslips/decide`, `PUT /pay-entries/:id/decide` |
| `payroll.pay` | `POST /periods/:month/mark-paid` |
| `payroll.override` | `GET /slip-override`, `PUT /slip-override` |
| `period.reopen` | `POST /periods/:month/reopen` |
| `ai.review.read` | `GET /ai/review`, `POST /periods/:month/ai-review` |
| `ai.review.dismiss` | `POST /ai/findings` |
| `audit.read` | `GET /audit`, `GET /audit/verify`, `GET /periods/:month/verify`, `GET /employees/:uuid/trace` |

Route có chính sách `config.read` nhưng sửa dữ liệu (`POST /positions`, `PUT /settings/params`, `PUT /settings/shifts` ...) kiểm lại năng lực ghi theo khoá trong `src/params/save.ts`. Route `authenticated` hoặc `self-or:` tự giới hạn theo người trong handler.

### 4.15 Nhân sự vào bảng lương của một tháng (`payrollPeople`, `src/domain/payroll/payroll-service.ts`)

Danh sách người được tính lương trong tháng `YYYY-MM` lấy từ `store.listStaff()` rồi:
1. **Hợp đồng hiệu lực**: `PayrollPolicy.contractFor(params, startDate, month, staff.contract)`. Khi `tax.contract.basis = 'tenure'` (mặc định trong `DEFAULTS`, mọi tháng), hợp đồng suy từ thâm niên: `'long'` nếu tới hết tháng lương người đó đã đủ `tax.longTermMonths` tháng tròn kể từ `startDate` (mặc định `tax.longTermMonths = 3`; tháng tròn tính theo cùng ngày của tháng sau, tháng ngắn hơn lùi về ngày cuối tháng), `'short'` nếu chưa đủ. Thiếu hoặc sai `startDate` thì giữ `staff.contract`. Bản chụp tham số cũ thiếu khoá `tax.contract.basis` giữ `staff.contract`.
2. **Bảo hiểm**: người có cột `insured` NULL đóng khi `insurance.coverage.<hợp đồng hiệu lực>` của tháng đúng `true`; cột có giá trị thì giữ.
3. **Lọc**: chỉ `payrollSubject`; `startDate` hợp lệ thì phải `<=` ngày cuối tháng; `resignedOn` hợp lệ thì phải `>=` ngày 1 của tháng (nghỉ việc từ trước tháng thì không vào bảng); tài khoản đã khoá chỉ vào khi tháng đó có ngày đã khai trong bảng chấm công hoặc có lượt Check-in/out.
4. Bộ máy từ chối tính người có `type` không có trong bảng chức vụ của tháng (`PAYROLL_BAD_TYPE`) hoặc `level` không có trong bảng bậc (`PAYROLL_BAD_LEVEL`) (`src/engine/payroll-engine.ts`).

---

## 5. Realtime và nhật ký

### 5.1 SSE (`src/platform/events.ts`)

| Sự kiện | Khi nào (module này) | Người nhận | Payload |
| --- | --- | --- | --- |
| `roles.changed` | `PUT /staff/:u/roles` có gán/gỡ; `PUT /roles/:code` có đổi; `POST /roles/:code/deprecate` | chính người bị đổi (`users`) | `{}` |
| `params.changed` | sửa danh mục (`applyCatalogChange`, sau COMMIT): `{ configRev, fromMonth: effectiveMonth, kind: 'catalog', groups: ['position' \| 'position-level' \| 'shift'], by }`; `POST /positions`, `POST /positions/:code/levels`, `PUT /settings/shifts` (theo `saved.notice`); `PUT /settings/agents` có đổi (`kind: 'agents'`, `fromMonth` = tháng hiện tại) | tất cả; người có `config.read` nhận `configRev, fromMonth, kind, groups, by`, người khác chỉ `configRev, fromMonth` | |
| khung `bye` | `closeUser(username, reason)` với `reason` = `logout`, `password`, `locked` | mọi kết nối của tài khoản đó | `{ reason }` |
| khung `hello` | mở luồng | | `{ epoch, serverTime, configRev, build }` |

Không phát sự kiện: lưu hồ sơ `PUT /staff/:u`, khoá/mở khoá (ngoài `bye`), gán ca hàng loạt, đặt lại mật khẩu (ngoài `bye`). Giao diện nhân viên nghe `roles.changed` để đọc lại `/api/me`.

### 5.2 Nhật ký (`audit_log`, ghi trong cùng giao dịch)

| `action` | `entityKind` / `entityId` | Mức | Nội dung |
| --- | --- | --- | --- |
| `password.change` | `staff` / username | normal | không before/after |
| `password.reset` | `staff` / username | normal | `reason` |
| `staff.create` / `staff.update` | `staff` / username | normal | trường thường đổi (`name, familyName, givenName, role, shiftCode, startDate, jobTitle, contractStatus, resignedOn`) + `passwordSet: true` nếu có; luôn có dòng khi tạo mới |
| `staff.create` / `staff.update` | như trên | pay | trường tiền đổi (`type, level, nightPct, idorm, contract, insured, dependants, leaveAdjust, taxOn, deductOn, advanceOn`) |
| `staff.create` / `staff.update` | như trên | pii | `after: { changed: ['birthday'] }`, không giá trị |
| `staff.update` (gán ca hàng loạt) | `staff` / username | normal | `{ shiftCode }` cũ/mới, `reason` |
| `staff.payrollSubject` | `staff` / username | pay | cờ cũ/mới |
| `staff.lock` / `staff.unlock` | `staff` / username | normal | `after: { locked }`, chỉ khi trạng thái đổi |
| `role.grant` / `role.revoke` | `staff_role` / `username:role` | pii | `{ role, active }`, `reason` |
| `role.create` / `role.update` / `role.deprecate` | `role` / code | normal | snapshot `{ label, caps, approvals, scope, deprecated }` (+ `copiedFrom` khi tạo), `reason` |
| `catalog.position.save` | `position` / code | pay | `month`, view trước/sau, `reason` |
| `catalog.level.save` | `position-level` / `type:level` | pay | như trên |
| `catalog.shift.save` | `shift` / code | pay | `month` = tháng hiện tại |
| `param.set`, `param.mode` | (src/params/save.ts) | theo khoá | từ `POST /positions`, `POST /positions/:code/levels`, `PUT /settings/shifts` |

Mọi dòng có `actor`, `actorRoles` (= `rolesOf(me)` lúc làm), `requestId`, `subject_uuid`/`actor_uuid` (tra từ username khi ghi). Khi yêu cầu có cảnh báo, `after.warnings` = mã cảnh báo; `after.self = true` nếu có `SELF_DECISION_FORBIDDEN`/`APPROVAL_SELF` và `subject === actor` (`audit.ts`). Dữ liệu có mẫu bí mật (`scrypt$`, `luong_sid`, `pass_hash`, `session_secret`, `lat:`/`lng:`) → ném lỗi, không ghi gì (`audit.ts,33`).

---

## 6. Phụ thuộc

### 6.1 Module này gọi

- `src/platform/db.ts`: mọi đọc/ghi `staff`, `staff_roles`, `settings`, `audit_log`, `payroll_periods` (`assertPeriodOpen`), `work_shifts` (trong `upsertStaff`).
- `src/engine/payroll-params.ts` (`DEFAULTS`): `src/platform/auth.ts`, `migrations/postgres/0001_baseline.sql`, `src/params/positions.ts`.
- `src/engine/approval-view.ts` (`ITEMS`): `src/platform/authz.ts` (`DECIDE_ITEMS`).
- `src/engine/punch.ts` (`SHIFT_CODES`, `SHIFT` qua `rulesFor().punch`): `seed-data.ts`, `src/modules/**/*.controller.ts` (ca của hồ sơ, gán ca), `shifts.ts`.
- `src/platform/request-rules.ts` (`rulesFor`, `monthParams`, `typeParam`, `benefitOf`, `levelCountOf`, `vnToday`): `src/modules/**/*.controller.ts` hồ sơ, `staff.ts`, `positions.ts`, `shifts.ts`.
- `src/params/store.ts`, `src/params/save.ts`, `src/params/positions.ts`, `src/params/registry.ts`, `src/params/config-rev.ts`.
- `src/domain/approvals/index.ts` (`reconcileStaffType`), `src/domain/sheet.ts` (`leaveSummary`), `src/domain/attendance/geofence-policy.ts` (`geofenceView`), `src/domain/attendance/index.ts`.
- `src/platform/warnings.ts`, `src/platform/audit.ts`, `src/platform/events.ts`, `src/platform/announce.ts`, `src/platform/http.ts`, `src/ops/limiters.ts`.

### 6.2 Ai gọi module này

- **Mọi route** qua `authz.gate`/`routeKey`/`can` (`src/http/api-gate.ts`), và nhiều handler gọi `authz.can`, `authz.isSelfDecision`, `authz.DECIDE_ALL`, `authz.auditSensitivities` (kỳ lương, duyệt, tạm ứng, giải trình, khoản điền thêm, tham số).
- `src/platform/audit.ts` gọi `authz.rolesOf` cho mọi dòng nhật ký.
- `src/platform/events.ts` gọi `auth.readSession` mỗi nhịp tim và `authz` để chọn tầng người nhận.
- `src/platform/http.ts clientIp` gọi `auth.trustedHops` (dùng cho giới hạn đăng nhập và nhật ký chấm công).
- `src/params/store.ts` đọc `catalogParams.rows()` → **bộ máy lương, chấm công, phép, lịch, KPI đều đọc danh mục chức vụ/bậc/ca qua bộ tham số của tháng**.
- `store.getStaff`/`listStaff`/`rowToStaff` dùng ở mọi module tính lương, chấm công, duyệt.

### 6.3 File dùng chung trình duyệt và máy chủ (UMD)

`src/engine/payroll-params.ts`, `src/engine/approval-view.ts`, `src/engine/punch.ts`, `src/engine/payroll-calendar.ts` (qua `src/domain/input.ts`), `src/engine/work-schedule.ts`, `src/engine/leave.ts` (máy chủ nạp bằng `require`).

### 6.4 Đổi X thì phải kiểm tra Y

| Đổi | Kiểm tra |
| --- | --- |
| Thêm route mới | Thêm khoá vào `ROUTE_CAPS` (`authz.ts`), nếu có tham số trong đường dẫn thì thêm nhánh `routeKey` **đúng thứ tự** (`authz.ts`); `src/ops/route-classes.ts` nếu là route nặng/ghi tự do; test `permissions-matrix`, `route-dispatch-golden`, `route-classes`. |
| Thứ tự nhánh `routeKey` | Các khoá `/staff/*`: `shift-bulk`, `:u/roles`, `:u/password`, `:u/schedule` phải đứng trước `PUT|DELETE /staff/:u`. |
| `src/engine/approval-view.ts ITEMS` | `src/domain/roles/roles.ts APPROVAL_ITEMS` (danh sách riêng: nếu thiếu, tạo/sửa vai trò với loại mới bị 400 `ROLE_APPROVAL_UNKNOWN` dù `authz` chấp nhận). `makeup_day` (Làm bù cả ngày) còn trong `ITEMS` vì khoá tham số còn, nhưng không còn trong `APPROVAL_ITEMS`: vai trò gửi loại này thì bị bỏ qua (`RETIRED_ITEMS`). |
| `RESERVED_CAPS` | `PUT /staff/:u` và `POST /staff/:u/password` dựa vào việc chỉ `admin` có `roles.manage`; `guardAdminLock`. |
| Cột mới trong `staff` | `staffRevision` tự tính cột đó; nếu cột tự đổi (kỹ thuật) phải thêm vào `REV_SKIP_COLUMNS` (`staff.ts`) nếu không Admin bị 409 `STAFF_STALE` giả. Thêm vào `rowToStaff`, `upsertStaff` (câu `ON CONFLICT` liệt kê từng cột), `audit.ts STAFF_PLAIN/STAFF_PAY/STAFF_PII`, `staffForViewer PAY_STAFF_FIELDS` nếu là trường tiền, `effectivePay` ở `src/modules/staff/staff.controller.ts` nếu đổi tiền, `Profile.fromRow`. |
| Quy tắc "thiếu trường" trong `PUT /staff/:u` | Khách gọi (tạo hoặc sửa tài khoản) phải gửi đủ các trường "đặt lại khi thiếu" (mục 4.6), nếu không sẽ xoá ngày vào làm, ca, điều chỉnh phép, iDorm, đổi chức vụ về mặc định. |
| `passMark` / `system.auth.passMarkChars` / `SESSION_SECRET` / `SESSION_COOKIE_NAME` | Mọi phiên đang mở hết hiệu lực. |
| `system.auth.scryptKeyBytes` | Mọi mật khẩu đã băm không đăng nhập được. |
| `lockStaff` / `unlockStaff` / `bumpSessionVersion` | `readSession` (so `sv`), `events.closeUser`, `countAdmins` (bỏ tài khoản khoá). |
| `store.roles.effectiveRoles` | `authz.rolesOf` (mọi quyền), `audit.context`. `roles.rolesOfStaff` là bản riêng (màn Phân quyền, gán vai trò) — sửa cả hai nếu đổi quy tắc "ai có vai trò gì". |
| Cờ `payrollSubject` | Vai trò `staff` tự dẫn xuất (`rolesOf`), `isSelfDecision`, `publicStaff`, `myPosition`, danh sách bảng lương/duyệt (`listApprovals` bỏ người ngoài bảng lương), `reconcileStaffRole`. |
| Bảng danh mục chức vụ / `paramRows` | Bộ máy lương và mọi module đọc `type.*`/`level.*`; đơn vị: `flexBonus/travel/attendance` là tỉ lệ, `nightPct` là %; `src/params/positions.ts copyChanges` bỏ khoá `.nightPct`. |
| `BENEFITS` (`position/benefits.ts`) | `src/params/positions.ts BENEFIT_FLAGS` (bản riêng, không có `holidayWork`), bảng `benefit_types` (dòng mới chỉ nạp ở mốc một lần), `sheetFlagsOf`/`checkRequestFlags` (`src/domain/positions.ts`), `src/domain/timesheet/` (nối ở `timesheet/services.ts`), `src/domain/ot.ts`, `src/domain/isat-rule.ts`, `src/engine/payroll-engine.ts` (mục 4.11). |
| Danh mục ca / `shift.kind.*` / `shift.alias.*` | `src/engine/punch.ts`, `src/engine/actual-hours.ts`, phụ cấp ca trong bộ máy lương, `seed-data.ts SHIFTS`, `PRESET_RE` trong `src/modules/staff/staff.controller.ts`. |
| `PersonName` | `db.rowToStaff`, `db.upsertStaff`, `Profile.fromRow`, mốc `staff_identity_v1`. |
| `config.REASON_MIN/MAX`, `PASSWORD_MIN_LENGTH` | Bản sao trong `src/platform/db.ts`. |

---

## 7. Test hiện có

API (`test/api/`): `mvp-auth.test.ts`, `*(đã bỏ)`, `security-headers.test.ts`, `password-reset-admin.test.ts`, `permissions-matrix.test.ts`, `route-dispatch-golden.test.ts`, `period-permissions.test.ts`, `roles-and-bulk-shift.test.ts`, `roles-custom.test.ts`, `roles-giao-dien.test.ts`, `*(đã bỏ)`, `lock-admin-guard.test.ts`, `*(đã bỏ)`, `self-edit-guard.test.ts`, `staff-profile-validation.test.ts`, `staff-revision.test.ts`, `v1a-s6-hr-staff-put.test.ts`, `optimistic-rev.test.ts`, `audit-log.test.ts`, `audit-paging.test.ts`, `events.test.ts`, `(đã bỏ)`, `domain-catalog-routes.test.ts`, `position-copy.test.ts`, `levels-add.test.ts`, `levels-entitlements.test.ts`, `levels-idorm.test.ts`, `levels-night-options.test.ts`, `levels-request-flags.test.ts`, `entitlement-write.test.ts`, `shifts-edit.test.ts`, `shifts-settings-route.test.ts`, `punch-shift-config.test.ts`, `shift-code-validation-regression.test.ts`, `checkin.test.ts`, `review-fixes.test.ts`, `review-fixes-positions.test.ts`, `verify-fixes.test.ts`, `contract-web.test.ts`, `*(đã bỏ)`, `*(đã bỏ)`, `api-input-validation.test.ts`.

Unit (`test/unit/`): `*(đã bỏ)`, `domain-classes.test.ts`, `roles-khu-vuc.test.ts`, `route-classes.test.ts`, `limiters.test.ts`, `warnings.test.ts`, `require-cycles.test.ts`, `position-defaults-zero-drift.test.ts`, `isat-saturday-entitled.test.ts`.

Hỗ trợ: `test/helpers/api-fixture.ts`, `test/helpers/sse-client.ts`, `test/session-contract-helper.ts`.

(Danh sách chọn theo tên file và tìm chuỗi `/api/login`, `/roles`, `shift-bulk`, `locked: true`, `catalog/`, `ROUTE_CAPS`, `PersonName`, `isatRefusal`; dấu `*` thay cho phần tiền tố ngày trong tên file.)

---
## 8. Điểm chưa nhất quán trong code

Mô tả chỗ mã đang không nhất quán; không phải danh sách việc phải làm. "Chưa có nơi gọi" = kết quả tìm chuỗi trong `lib/`, `src/modules/**/*.controller.ts`, `public/` (không tính test).

### 8.1 Hai nơi tính cùng một thứ khác nhau

1. **`insured` mặc định khi cột NULL**: `src/platform/db.ts` dùng `contract === 'long'`; `src/domain/staff.ts` và `src/modules/**/*.controller.ts` dùng tham số `insurance.coverage.<contract>`. Hai giá trị trùng nhau chỉ khi tham số giữ mặc định (`long=true`, `short=false`). Ai đọc `getStaff().insured` (không qua `publicStaff`) nhận quy tắc cũ.
2. **Vai trò của một người** có ba bản: `authz.rolesOf` (`authz.ts`: có xét khoá, bỏ vai trò tuỳ chỉnh đã ngưng), `roles.rolesOfStaff` (`roles.ts`: không xét khoá, giữ vai trò đã ngưng), `store.roles.effectiveRoles` (`db.ts`: không thêm `staff`).
3. **Quyền lợi của chức vụ**: `request-rules.benefitOf` (`request-rules.ts`) và `Positions.benefitsOf` (`src/params/positions.ts`) cho bậc ghi đè (`level.<mã>.<n>.benefit.<cờ>`); `PositionCatalog.position` / `Employee.can` (`position-catalog.ts`, `employee.ts`) chỉ đọc cờ của chức vụ trong DB, bỏ qua ghi đè theo bậc.
4. **Phụ cấp đêm của một người**: hồ sơ lưu `staff.night_pct` chọn trong `nightOptions` (`src/modules/employees/employees.controller.ts`); `Employee.shiftAllowancePct` (`employee.ts`) và `GET /employees/:uuid` dùng `position.nightPct` của danh mục (`level.night_pct ?? type.night_pct`), không đọc `staff.night_pct`.
5. **Hai đường thêm bậc**: `POST /positions/:code/levels` (`src/params/save.ts`, ghi `param_versions`, kiểm tháng mở sớm nhất, kiểm bậc có ở tháng muộn hơn, lý do không bắt buộc) và `PUT /catalog/levels` (`position-catalog.ts`, ghi `position_levels`, chỉ `assertPeriodOpen` của tháng áp dụng, không kiểm tháng muộn hơn, lý do không bao giờ bắt buộc).
6. **Hai nguồn chức vụ**: `POST /positions` chỉ ghi `param_versions` (`save.ts`); `PositionCatalog.typeCodes()` đọc bảng `position_types` (`position-catalog.ts`). Chức vụ thêm bằng `POST /positions` không có trong `GET /catalog/positions`, `PUT /catalog/positions/:code` trả 404 `POSITION_NOT_FOUND`, và `GET /employees/:uuid` trả `position: null` cho người thuộc chức vụ đó.
7. **Hai đường đổi ca của người**: `PUT /staff/:u` (qua `upsertStaff`, nhật ký `staffSaved`) và `PUT /staff/shift-bulk` (SQL trực tiếp `src/modules/staff/staff.controller.ts` / `src/modules/sheet/sheet.controller.ts`, nhật ký riêng). Cả hai không phát sự kiện.
8. **Đơn vị trong `paramRows`**: `flexBonus/travel/attendance` đổi % → tỉ lệ, nhưng `type.<mã>.nightPct` và `level.<mã>.<n>.nightPct` giữ % (`position-catalog.ts,367`).
9. **Bộ tham số của module đăng nhập**: `src/platform/auth.ts` đọc `PayrollParams.DEFAULTS` lúc nạp; `src/modules/staff/staff.controller.ts` / `src/modules/sheet/sheet.controller.ts` đọc `system.staff.bulkMax` từ bộ tham số đã lưu. Các khoá `system.login.*`, `system.session.days`, `system.auth.*` nếu được lưu vào `param_versions` không có tác dụng.
10. **Ba bộ kiểm lý do**: `roles.parseReason` (`roles.ts`), `warnings.optionalReason` (`warnings.ts` theo dòng của file), `db.softReason` (`db.ts`); `src/modules/staff/staff.controller.ts reasonOf` bọc `optionalReason`. Mọi lý do đều không bắt buộc. Route danh mục (`catalog-change.ts`) không kiểm lý do.
11. **`uuidOf`**: `src/platform/db.ts` và `employee-repository.ts` cùng tra uuid theo username.
12. **Kiểm `role === 'admin'` thay cho năng lực**: `staff.ts` (bỏ `insured`, `levelName`), `src/domain/attendance/geofence-policy.ts` (chỉ gửi toạ độ vùng cho `staff.role='admin'`). Người có vai trò `admin` qua `staff_roles` (không phải `staff.role`) bị đối xử như tài khoản thường ở ba chỗ này.

### 8.2 Danh sách / hằng số chép nhiều nơi

13. Cờ quyền lợi: `src/domain/position/benefits.ts` (`BENEFITS`) và `src/params/positions.ts` (`BENEFIT_FLAGS`), cộng bảng `benefit_types`.
14. Loại yêu cầu duyệt: `src/domain/roles/roles.ts` (`APPROVAL_ITEMS`) và `src/engine/approval-view.ts` (`ITEMS`, thứ tự khác).
15. Mã chức vụ: `position-catalog.ts` viết cứng `/^[a-z][a-z0-9]{1,15}$/`; `src/params/positions.ts` dựng từ `config.POSITION_CODE_MIN/MAX`.
16. Mã vai trò: `src/platform/db.ts` viết cứng `/^[a-z][a-z_]{1,31}$/`; `src/domain/roles/roles.ts` dựng từ `config.ROLE_CODE_MAX`.
17. Trạng thái hợp đồng: `src/modules/**/*.controller.ts` (mảng viết tay), `profile.ts` (`CONTRACT_STATUSES`), CHECK ở `migrations/postgres/0001_baseline.sql`, `db.ts`.
18. Tên vai trò mặc định: `src/domain/roles/roles.ts` (giao diện Vue có bản sao nhãn riêng ở `web/src`).
19. Độ dài lý do: `config.ts`, `db.ts`, khoá registry `control.reasonMinLength`/`control.reasonMaxLength` (không được máy chủ đọc).
20. Độ dài mật khẩu: `config.ts` (số `6` viết thẳng).
21. Tên đăng nhập: máy chủ `/^[a-z0-9._-]{2,40}$/` (`input.ts`).
22. `config.ts` (`LOGIN_*`, `SESSION_DAYS`, `STAFF_BULK_MAX`) là nguồn trích xuất của registry (`scripts/params/key-map.ts`) nhưng lúc chạy không được đọc; máy chủ đọc bản trong `DEFAULTS`/bộ tham số.

### 8.3 Số nghiệp vụ / kỹ thuật viết cứng

23. `src/modules/**/*.controller.ts` `581` `Math.ceil(wait / 60)` (giây/phút).
24. `src/modules/**/*.controller.ts` bước 0,5 ngày (`× 2 / 2`) và trần ±365 ngày điều chỉnh phép; trần 20 người phụ thuộc; 80 ký tự vị trí công việc; câu "2–40 ký tự" viết tay.
25. `position-catalog.ts` `DOW_MAX = 6`, `PCT_MAX = 100`, `WORKDAYS_MAX = 31`, `HUNDRED = 100`; `slice(0, 40)` thay vì `config.ERROR_ECHO_FIELD_MAX`; `migrations/postgres/0001_baseline.sql` CHECK `1..31`, `× 10000 / 100`.
26. `sheetFlagsOf` trả cờ `canIsat` (`src/domain/positions.ts`) nhưng không nơi nào đọc; iSAT được kiểm bằng `isatRefusal` (`src/domain/isat-rule.ts`) chứ không qua cờ này.

### 8.4 Mã không có nơi gọi hoặc không có tác dụng

27. `src/platform/auth.ts` `FALLBACK`: mọi khoá trong đó đã có trong `DEFAULTS` (`src/engine/payroll-params.ts,822`) và `param()` ưu tiên `DEFAULTS`, nên bảng này không bao giờ được dùng. Chú thích `auth.ts` nói "các khoá ... mà registry chưa có".
28. `authz.can` nhánh `team` (`authz.ts`) giống hệt nhánh `self`.
29. `EmployeeRepository.list`, `EmployeeRepository.uuidOf`, `Employee.can`, `Employee.benefits`, `Employee.baseSalary`, `Employee.worksOn`: chưa có nơi gọi ngoài lớp/test.
30. `src/http/api-gate.ts` `needAdmin()` chỉ kiểm `policy.cap` có khai báo; cổng thật đã chạy trước đó.
31. `src/modules/**/*.controller.ts`: nhánh "đặt lại mật khẩu qua hồ sơ cho tài khoản đã có" không thể chạy vì luôn ném 400 `USE_PASSWORD_RESET` trước; tương tự (cấp cookie mới khi Admin tự đặt mật khẩu qua hồ sơ).

### 8.5 Chú thích nói khác mã

33. `src/platform/auth.ts` nhắc route `POST /staff`; không có route này (tạo tài khoản là `PUT /staff/:u`, `ROUTE_CAPS` không có khoá `POST /staff`).
34. `src/domain/employee/profile.ts` nói "sửa và ghi xuống DB đi qua EmployeeRepository (có nhật ký, khoá lạc quan)"; `employee-repository.ts` và mã cho thấy repository chỉ đọc, ghi đi qua `src/modules/staff/staff.controller.ts` → `store.upsertStaff`.
35. `src/platform/db.ts` chú thích cột `staff`: `type` "'tts' | 'ctv' | 'nv'", `night_pct` "chỉ nhóm 'nv': 40 | 60", `shift_code` "n1 n2 f1 f2 g1 g2"; mã hiện cho chức vụ là dữ liệu, `nightOptions` theo chức vụ/bậc, và `shift_code` lưu mã mới `Normal1…Night2` (`db.ts,1921-1946`).
36. `src/platform/config.ts` nói các hằng `LOGIN_*` dùng cho `src/platform/auth.ts`; `src/platform/auth.ts` đọc `system.login.*` từ `DEFAULTS`.
37. `src/domain/shared/repository.ts` "thiếu expectedRev = ghi đè như các màn cũ" đúng với lớp, nhưng cả ba route danh mục bắt buộc `expectedRev` cho chức vụ và ca (`src/modules/catalog/catalog.controller.ts`, `src/modules/catalog/catalog.controller.ts`); chỉ bậc cho phép thiếu khi thêm mới.

### 8.6 Hành vi dễ gây lỗi dây chuyền (mô tả theo mã)

39. `PUT /staff/:u` là "lưu cả biểu mẫu" với một số trường và "sửa một phần" với số khác (bảng ở 4.6). Gửi thiếu `type`, `role`, `shiftCode`, `startDate`, `leaveAdjust`, `idorm` sẽ đặt lại các trường đó.
40. `PUT /staff/:u` có cả trường hồ sơ và `locked`: hồ sơ ghi ở giao dịch 1 (`src/modules/staff/staff.controller.ts`), khoá ở giao dịch 2; lỗi ở giao dịch 2 để lại hồ sơ đã lưu.
41. `PUT /staff/:u` và `PUT /staff/shift-bulk` đổi trường tiền/ca mà không kiểm khoá kỳ (`periodScope` null, không gọi `assertPeriodOpen`/`warnFrozen`).
43. Đổi loại ca (`PUT /catalog/shifts`) áp cho mọi tháng (`shift-catalog.ts`, tháng nền) nhưng chỉ kiểm khoá kỳ của tháng hiện tại (`src/modules/catalog/catalog.controller.ts`).
44. `holdersOf(code)` (`roles.ts`) và `describeAll` đếm người giữ khác nhau: `holdersOf` lấy mọi dòng `staff_roles` còn hiệu lực (kể cả tài khoản đang khoá), `users` trong `describeAll` chỉ đếm tài khoản chưa khoá; số `holders` trả về khi ngưng dùng vì vậy có thể lớn hơn số `users` trên màn Phân quyền.
45. `SESSION_DAYS` từ biến môi trường không được kiểm (`auth.ts`): giá trị không phải số → `exp` NaN, mọi phiên mới không hợp lệ và `Max-Age=NaN`.
46. `GET /employees/:uuid/trace`: `limit` âm không bị chặn (`src/modules/employees/employees.controller.ts`: `Math.min(-5, 200) = -5`), khác `GET /audit` kiểm `limit ≥ 1` (`src/modules/employees/employees.controller.ts` / `src/modules/audit/audit.controller.ts`).
47. `PUT /password`, `POST /staff/:u/password`, `PUT /staff/:u` băm mật khẩu ngoài `hashGate` (`src/modules/auth/auth.controller.ts,1852,2304`) trong khi `POST /login` qua `hashGate`; kiểm mật khẩu hiện tại ở `PUT /password` không có giới hạn đoán ngoài giới hạn ghi 240/phút.
48. Gán tên: khi lưu hồ sơ không gửi `familyName`/`givenName`, `upsertStaff` tách lại họ/tên từ `name` (`db.ts`): tên hai chữ đã nhập riêng trước đó (ví dụ họ "Nguyễn Văn", tên "An Bình") bị tách lại thành tên "Bình".
49. `ROUTE_CAPS` cho thêm chức vụ và thêm bậc khác nhau ở cổng: `POST /positions` cần `config.read` (`authz.ts`), `POST /positions/:code/levels` cần `config.payroll` (`authz.ts`); cả hai kiểm lại `config.payroll` trong `save.ts`.
51. Hai danh sách cờ quyền lợi lệch nhau: `BENEFITS` có 14 tên (gồm `holidayWork`), `BENEFIT_FLAGS` có 13; `makeupDay` nằm ở cả hai nhưng bộ máy và máy chủ không đọc giá trị; riêng màn danh mục chức vụ lọc cờ này khỏi danh sách hiển thị và `src/engine/payroll-params.ts,771,796` giữ mặc định `true`.
52. Hợp đồng dùng để tính thuế và bảo hiểm có hai nguồn: bảng lương dùng hợp đồng suy từ thâm niên (mục 4.15), còn `rowToStaff`, `publicStaff` và `effectivePay` ở `PUT /staff/:u` dùng cột `contract` (NULL → `defaultContract`). Hợp đồng và `insured` hiện trên màn Hồ sơ có thể khác với phiếu lương.
