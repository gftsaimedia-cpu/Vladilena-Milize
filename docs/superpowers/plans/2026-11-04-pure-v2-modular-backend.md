# Kế hoạch triển khai Backend thuần V2 theo kiến trúc Modular Monolith

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển đổi toàn diện Backend sang kiến trúc Modular Monolith thuần V2, đóng gói logic vào 6 feature modules tự chứa, loại bỏ triệt để mã V1 và các thư mục phân tán vào `legacy_archive/`, sửa lỗi advisory lock trong giao dịch, và xuất tài liệu hợp đồng API `/api/v2/*` cho Frontend Agent.

**Architecture:** Áp dụng mô hình Modular Monolith chuẩn NestJS kết hợp Kysely ORM chạy trên PostgreSQL 16. Gom 20 module cũ và các tầng phân tán (`src/domain/`, `src/platform/`, `src/engine/`, `src/params/`, `src/data/`, `src/ops/`, `src/core/`) thành 6 Feature Modules tự chứa (`employees`, `requests`, `attendance`, `payroll`, `auth/roles`, `system`), 1 `database` module tập trung, và 1 `common` module. Mọi truy vấn DB thực hiện trực tiếp trên 21 bảng PostgreSQL hiện hành, loại bỏ 100% các truy vấn vào các bảng SQLite cũ đã xóa (`timesheets`, `sheet_approvals`, `attendance_sessions`).

**Tech Stack:** NestJS 10, TypeScript, Kysely, PostgreSQL 16 (`pg.Pool`), Docker, Express.

**Spec:** `docs/superpowers/specs/2026-11-04-pure-v2-modular-backend-design.md`

## Global Constraints
- **Phạm vi Backend duy nhất:** Chỉ thao tác mã nguồn Backend trong `src/` và tài liệu hợp đồng trong `docs/api/`; tuyệt đối không sửa đổi mã nguồn Frontend trong `web/` (do Agent khác phụ trách).
- **An toàn dữ liệu:** Không xóa hay làm thay đổi dữ liệu hiện hữu trong database `luong_local` trên PostgreSQL.
- **Quy chuẩn API:** Toàn bộ endpoint nghiệp vụ mới phải có tiền tố `/api/v2/*` theo chuẩn RESTful.
- **Xử lý tranh chấp:** Mọi thao tác ghi DB có tranh chấp (punch, tính lương, duyệt đơn) phải dùng giao dịch Kysely và khóa phân tán `pg_advisory_xact_lock` thực thi trực tiếp trên transaction client (`trx`).
- **Cách ly mã cũ:** Các thư mục cũ (`src/domain/`, `src/platform/`, `src/engine/`, `src/params/`, `src/ops/`, `src/data/`, `src/core/`, các module `staff`, `approvals`, `ui-bridge`, và `test/`) được chuyển vào `legacy_archive/` và được `.gitignore`.

## Review Focus
- **Advisory lock leak:** Đảm bảo `pg_advisory_xact_lock` chạy trên `trx`, không chạy trên root Kysely instance.
- **Transaction poisoning:** Đảm bảo không còn bất kỳ dòng code nào truy vấn vào các bảng SQLite cũ (`timesheets`, `sheet_approvals`, `attendance_sessions`, `punches`, `punch_requests`, `corrections`).
- **Employee update integrity:** `PUT /api/v2/employees/:id` cập nhật thành công các trường hồ sơ, chức vụ, bậc mà không kích hoạt truy vấn legacy gây abort giao dịch PostgreSQL (`25P02`).
- **Request submission & approval concurrency:** Đảm bảo đơn từ được nộp và duyệt an toàn, không bị race condition hay vi phạm unique constraint dẫn đến 500.
- **Attendance & Timesheet entry calculation:** Đảm bảo punch event ghi đúng vào `punch_events` và tính toán ngày công lưu vào `timesheet_entries`.

---

### Task 1: Hạ tầng kết nối Dữ liệu & Tiện ích chung (`src/database/` & `src/common/`)

**Files:**
- Create: `src/database/schema.ts`
- Create: `src/database/kysely.ts`
- Create: `src/database/transaction.ts`
- Create: `src/database/database.module.ts`
- Create: `src/database/index.ts`
- Create: `src/common/exceptions/http.exception.ts`
- Create: `src/common/filters/api-exception.filter.ts`
- Create: `src/common/decorators/current-user.decorator.ts`
- Create: `src/common/interceptors/response.interceptor.ts`
- Create: `src/common/index.ts`

**Interfaces:**
- Consumes: `process.env.DATABASE_URL`, `pg.Pool`, `kysely`.
- Produces: `DatabaseModule`, `@Inject('KYSELY_DB') db: Kysely<DB>`, `TransactionCoordinator.runInTransaction(cb)`, `ApiExceptionFilter`.

- [ ] **Step 1: Viết test cho TransactionCoordinator và Advisory Lock**
  - Tạo `test/v2/database-transaction.test.ts`.
  - Test kiểm tra `runInTransaction` cung cấp `trx` và lấy khóa `pg_advisory_xact_lock` trực tiếp trên `trx` thành công.

- [ ] **Step 2: Chạy test để xác nhận test fail**
  - Chạy: `node --import tsx test/v2/database-transaction.test.ts`
  - Kỳ vọng: FAIL (chưa có module `src/database/`).

- [ ] **Step 3: Triển khai `src/database/` và `src/common/`**
  - Sao chép các định nghĩa bảng PostgreSQL chuẩn vào `src/database/schema.ts`.
  - Cấu hình `pg.Pool` và `Kysely<DB>` với `PostgresDialect` tiêu chuẩn trong `src/database/kysely.ts`.
  - Triển khai `TransactionCoordinator` trong `src/database/transaction.ts` hỗ trợ chạy callback trong giao dịch Kysely và hàm `acquireAdvisoryLock(trx, key)` gọi trực tiếp trên instance `trx`.
  - Tạo `DatabaseModule` xuất `KYSELY_DB` và `TransactionCoordinator`.
  - Triển khai `ApiExceptionFilter` chuẩn hóa định dạng lỗi `{ error: string, code?: string }`, bắt mã `23505` thành 409 `CONFLICT`.

- [ ] **Step 4: Chạy test xác nhận pass**
  - Chạy: `node --import tsx test/v2/database-transaction.test.ts`
  - Kỳ vọng: PASS.

- [ ] **Step 5: Commit**
  - `git add src/database/ src/common/ test/v2/database-transaction.test.ts`
  - `git commit -m "feat(infra): add database module with transaction coordinator and common filters"`

---

### Task 2: Đóng gói Feature Module Employees tự chứa (`src/modules/employees/`)

**Files:**
- Create: `src/modules/employees/domain/person-name.ts`
- Create: `src/modules/employees/domain/position.ts`
- Create: `src/modules/employees/domain/shift.ts`
- Create: `src/modules/employees/domain/employee-contract.ts`
- Create: `src/modules/employees/domain/employee-profile.ts`
- Create: `src/modules/employees/domain/employee-account.ts`
- Create: `src/modules/employees/domain/employee.ts`
- Create: `src/modules/employees/employees.repository.ts`
- Create: `src/modules/employees/employees.service.ts`
- Create: `src/modules/employees/employees.controller.ts`
- Create: `src/modules/employees/employees.module.ts`
- Create: `src/modules/employees/index.ts`

**Interfaces:**
- Consumes: `KYSELY_DB`, `TransactionCoordinator` từ `DatabaseModule`.
- Produces: `EmployeesModule`, các route `/api/v2/employees/*`:
  - `GET /api/v2/employees`: danh sách nhân sự.
  - `GET /api/v2/employees/:username`: thông tin chi tiết nhân sự.
  - `POST /api/v2/employees`: tạo nhân sự mới.
  - `PUT /api/v2/employees/:username`: cập nhật hồ sơ, chức vụ, ca trực (không gọi bảng legacy).
  - `DELETE /api/v2/employees/:username`: ngừng hoạt động nhân sự.
  - `GET /api/v2/employees/meta/positions`: danh mục chức vụ (`position_types`, `position_levels`).
  - `GET /api/v2/employees/meta/shifts`: danh mục ca làm việc (`work_shifts`).

- [ ] **Step 1: Viết test cho EmployeesService và EmployeesController**
  - Tạo `test/v2/employees.test.ts`.
  - Test kiểm tra: tạo nhân viên, cập nhật thông tin nhân viên (`tran-minh-ngoc`) không kích hoạt câu truy vấn vào bảng `timesheets` và trả về kết quả 200 thành công.

- [ ] **Step 2: Chạy test để xác nhận test fail**
  - Chạy: `node --import tsx test/v2/employees.test.ts`
  - Kỳ vọng: FAIL (chưa có `EmployeesModule`).

- [ ] **Step 3: Triển khai `src/modules/employees/`**
  - Di chuyển các domain models (`PersonName`, `Position`, `Shift`, `EmployeeContract`, `EmployeeProfile`, `EmployeeAccount`, `Employee`) từ `src/domain/employee-v2/`, `src/domain/position/`, `src/domain/shift/` vào `src/modules/employees/domain/`.
  - Triển khai `EmployeesRepository` truy vấn trực tiếp các bảng: `staff`, `staff_roles`, `position_types`, `position_levels`, `work_shifts`, `work_schedules`. Tuyệt đối không gọi `timesheets` hay `attendance_sessions`.
  - Triển khai `EmployeesService` chứa toàn bộ business logic quản lý nhân sự, mã hóa mật khẩu khi đổi mật khẩu, đồng bộ ca làm việc.
  - Triển khai `EmployeesController` với đầy đủ các endpoint RESTful `/api/v2/employees/*`.

- [ ] **Step 4: Chạy test xác nhận pass**
  - Chạy: `node --import tsx test/v2/employees.test.ts`
  - Kỳ vọng: PASS.

- [ ] **Step 5: Commit**
  - `git add src/modules/employees/ test/v2/employees.test.ts`
  - `git commit -m "feat(employees): implement self-contained employees v2 module"`

---

### Task 3: Đóng gói Feature Module Requests tự chứa (`src/modules/requests/`)

**Files:**
- Create: `src/modules/requests/domain/system-request.ts`
- Create: `src/modules/requests/domain/types.ts`
- Create: `src/modules/requests/requests.repository.ts`
- Create: `src/modules/requests/requests.service.ts`
- Create: `src/modules/requests/requests.controller.ts`
- Create: `src/modules/requests/requests.module.ts`
- Create: `src/modules/requests/index.ts`

**Interfaces:**
- Consumes: `KYSELY_DB`, `TransactionCoordinator` từ `DatabaseModule`.
- Produces: `RequestsModule`, các route `/api/v2/requests/*`:
  - `GET /api/v2/requests`: lấy danh sách đơn từ (hỗ trợ lọc theo loại đơn: nghỉ phép, OT, đổi ca, giải trình, tạm ứng).
  - `GET /api/v2/requests/:id`: lấy chi tiết đơn từ.
  - `POST /api/v2/requests`: tạo đơn yêu cầu mới.
  - `PUT /api/v2/requests/:id/review`: duyệt (`APPROVED`) hoặc từ chối (`REJECTED`) đơn.
  - `DELETE /api/v2/requests/:id`: hủy đơn (khi đang ở trạng thái `PENDING`).

- [ ] **Step 1: Viết test cho RequestsService và RequestsController**
  - Tạo `test/v2/requests.test.ts`.
  - Test kiểm tra: nộp đơn nghỉ phép, duyệt đơn nghỉ phép, nộp đơn tạm ứng, duyệt đơn tạm ứng, chặn duyệt 2 lần (idempotency).

- [ ] **Step 2: Chạy test để xác nhận test fail**
  - Chạy: `node --import tsx test/v2/requests.test.ts`
  - Kỳ vọng: FAIL (chưa có `RequestsModule`).

- [ ] **Step 3: Triển khai `src/modules/requests/`**
  - Đóng gói logic domain `SystemRequest` từ `src/domain/request-v2/` vào `src/modules/requests/domain/`.
  - Triển khai `RequestsRepository` truy vấn bảng `system_requests` bằng Kysely thuần.
  - Triển khai `RequestsService`: tích hợp luật kiểm tra trần OT, kiểm tra số dư phép, áp dụng advisory lock `acquireAdvisoryLock(trx, 'request_' + id)` khi duyệt đơn.
  - Triển khai `RequestsController` phục vụ `/api/v2/requests/*`.

- [ ] **Step 4: Chạy test xác nhận pass**
  - Chạy: `node --import tsx test/v2/requests.test.ts`
  - Kỳ vọng: PASS.

- [ ] **Step 5: Commit**
  - `git add src/modules/requests/ test/v2/requests.test.ts`
  - `git commit -m "feat(requests): implement self-contained requests v2 module"`

---

### Task 4: Đóng gói Feature Module Attendance tự chứa (`src/modules/attendance/`)

**Files:**
- Create: `src/modules/attendance/domain/punch-event.ts`
- Create: `src/modules/attendance/domain/daily-timesheet.ts`
- Create: `src/modules/attendance/domain/geofence-policy.ts`
- Create: `src/modules/attendance/domain/work-schedule.ts`
- Create: `src/modules/attendance/attendance.repository.ts`
- Create: `src/modules/attendance/attendance.service.ts`
- Create: `src/modules/attendance/attendance.controller.ts`
- Create: `src/modules/attendance/attendance.module.ts`
- Create: `src/modules/attendance/index.ts`

**Interfaces:**
- Consumes: `KYSELY_DB`, `TransactionCoordinator` từ `DatabaseModule`.
- Produces: `AttendanceModule`, các route `/api/v2/attendance/*`:
  - `POST /api/v2/attendance/punch`: chấm công Check-in / Check-out (ghi vào `punch_events`).
  - `GET /api/v2/attendance/timesheets`: lấy dữ liệu bảng công theo nhân viên hoặc theo ngày (`timesheet_entries`).
  - `GET /api/v2/attendance/punches`: xem lịch sử quẹt thẻ.
  - `POST /api/v2/attendance/recalculate`: tính toán lại ngày công khi có giải trình được duyệt.

- [ ] **Step 1: Viết test cho AttendanceService và AttendanceController**
  - Tạo `test/v2/attendance.test.ts`.
  - Test kiểm tra: Check-in lần 1 ghi nhận giờ vào; Check-out lần 2 ghi nhận giờ ra và tự động tính `work_minutes`, `ot_minutes` lưu vào `timesheet_entries`.

- [ ] **Step 2: Chạy test để xác nhận test fail**
  - Chạy: `node --import tsx test/v2/attendance.test.ts`
  - Kỳ vọng: FAIL (chưa có `AttendanceModule`).

- [ ] **Step 3: Triển khai `src/modules/attendance/`**
  - Đóng gói các domain models `PunchEvent`, `DailyTimesheet`, `GeofencePolicy`, `WorkSchedule` vào `src/modules/attendance/domain/`.
  - Triển khai `AttendanceRepository` truy vấn bảng `punch_events` và `timesheet_entries`.
  - Triển khai `AttendanceService` với cơ chế tính công thuần V2, dùng advisory lock theo `employee_date` trong `TransactionCoordinator` để tránh race condition khi 2 lần punch diễn ra đồng thời.
  - Triển khai `AttendanceController` phục vụ `/api/v2/attendance/*`.

- [ ] **Step 4: Chạy test xác nhận pass**
  - Chạy: `node --import tsx test/v2/attendance.test.ts`
  - Kỳ vọng: PASS.

- [ ] **Step 5: Commit**
  - `git add src/modules/attendance/ test/v2/attendance.test.ts`
  - `git commit -m "feat(attendance): implement self-contained attendance v2 module"`

---

### Task 5: Đóng gói Feature Module Payroll tự chứa (`src/modules/payroll/`)

**Files:**
- Create: `src/modules/payroll/domain/employee-payslip.ts`
- Create: `src/modules/payroll/domain/kpi-scoring.ts`
- Create: `src/modules/payroll/payroll.repository.ts`
- Create: `src/modules/payroll/payroll.service.ts`
- Create: `src/modules/payroll/payroll.controller.ts`
- Create: `src/modules/payroll/payroll.module.ts`
- Create: `src/modules/payroll/index.ts`

**Interfaces:**
- Consumes: `KYSELY_DB`, `TransactionCoordinator` từ `DatabaseModule`, `EmployeesService`, `AttendanceService`.
- Produces: `PayrollModule`, các route `/api/v2/payroll/*`:
  - `POST /api/v2/payroll/:month/calculate`: kích hoạt tính lương chu kỳ cho toàn thể nhân sự.
  - `GET /api/v2/payroll/:month`: lấy danh sách bảng lương chu kỳ.
  - `GET /api/v2/payroll/:month/:employeeId`: xem chi tiết phiếu lương cá nhân.
  - `PUT /api/v2/payroll/:month/:employeeId/override`: điều chỉnh số liệu phiếu lương (kèm lý do và audit log).
  - `PUT /api/v2/payroll/:month/kpi/:username`: nhập điểm đánh giá KPI tháng.

- [ ] **Step 1: Viết test cho PayrollService và PayrollController**
  - Tạo `test/v2/payroll.test.ts`.
  - Test kiểm tra: tính lương tháng cho 1 nhân viên, kiểm tra lương thực nhận (`net_pay`), nhập điểm KPI và tính lại phiếu lương.

- [ ] **Step 2: Chạy test để xác nhận test fail**
  - Chạy: `node --import tsx test/v2/payroll.test.ts`
  - Kỳ vọng: FAIL (chưa có `PayrollModule`).

- [ ] **Step 3: Triển khai `src/modules/payroll/`**
  - Đóng gói `EmployeePayslip` và `KpiScoring` vào `src/modules/payroll/domain/`.
  - Triển khai `PayrollRepository` thao tác trên các bảng: `payroll_runs`, `payslips`, `pay_entries`, `slip_overrides`, `kpi_scores`, `kpi_score_log`.
  - Triển khai `PayrollService`: kết hợp dữ liệu chức vụ, bậc từ `EmployeesService`, dữ liệu công từ `AttendanceService`, áp dụng công thức lương V2 chuẩn, ghi nhận kết quả và chốt phiên tính lương vào `payroll_runs`.
  - Triển khai `PayrollController` phục vụ `/api/v2/payroll/*`.

- [ ] **Step 4: Chạy test xác nhận pass**
  - Chạy: `node --import tsx test/v2/payroll.test.ts`
  - Kỳ vọng: PASS.

- [ ] **Step 5: Commit**
  - `git add src/modules/payroll/ test/v2/payroll.test.ts`
  - `git commit -m "feat(payroll): implement self-contained payroll v2 module"`

---

### Task 6: Tinh gọn Auth, Roles và System Modules (`src/modules/auth/`, `roles/`, `system/`)

**Files:**
- Refactor: `src/modules/auth/auth.service.ts`
- Refactor: `src/modules/auth/auth.controller.ts`
- Refactor: `src/modules/auth/auth.module.ts`
- Refactor: `src/modules/roles/roles.guard.ts`
- Refactor: `src/modules/roles/roles.module.ts`
- Refactor: `src/modules/system/system.service.ts`
- Refactor: `src/modules/system/system.controller.ts`
- Refactor: `src/modules/system/system.module.ts`

**Interfaces:**
- Consumes: `KYSELY_DB` từ `DatabaseModule`.
- Produces: `AuthModule` (xác thực session/cookie, đổi mật khẩu), `RolesModule` (phân quyền vai trò), `SystemModule` (quản lý cài đặt `settings`, nhật ký `audit_log`, quản lý chu kỳ `payroll_periods`).

- [ ] **Step 1: Viết test cho Auth và System services**
  - Tạo `test/v2/auth-system.test.ts`.
  - Test kiểm tra: đăng nhập thành công trả về thông tin người dùng và cookie; đọc và ghi `settings` thành công; ghi nhật ký `audit_log` thành công.

- [ ] **Step 2: Chạy test để xác nhận test fail**
  - Chạy: `node --import tsx test/v2/auth-system.test.ts`
  - Kỳ vọng: FAIL hoặc phụ thuộc mã cũ.

- [ ] **Step 3: Refactor `auth`, `roles`, và `system`**
  - Chuyển `auth` sang truy vấn trực tiếp bảng `staff` qua Kysely, băm mật khẩu bằng scrypt tiêu chuẩn, loại bỏ các file phụ thuộc trong `src/platform/auth.ts`.
  - Chuyển `system` sang quản lý `settings`, `audit_log`, `payroll_periods` trực tiếp bằng Kysely, tích hợp các chức năng từ các module vệ tinh cũ (`audit`, `settings`, `periods`).
  - Triển khai `RolesGuard` chuẩn NestJS để bảo vệ endpoint theo vai trò (`admin`, `manager`, `staff`).

- [ ] **Step 4: Chạy test xác nhận pass**
  - Chạy: `node --import tsx test/v2/auth-system.test.ts`
  - Kỳ vọng: PASS.

- [ ] **Step 5: Commit**
  - `git add src/modules/auth/ src/modules/roles/ src/modules/system/ test/v2/auth-system.test.ts`
  - `git commit -m "refactor(auth-system): modernize auth, roles and system modules with pure kysely"`

---

### Task 7: Cập nhật Bootstrap, Cắt bỏ V1 và Lưu trữ vào `legacy_archive/`

**Files:**
- Modify: `src/app.module.ts`
- Modify: `src/main.ts`
- Modify: `src/bootstrap.ts`
- Create directory: `legacy_archive/`
- Move to `legacy_archive/`:
  - `src/modules/staff/`
  - `src/modules/approvals/`
  - `src/modules/ui-bridge/`
  - `src/modules/employee-v2/` (đã hợp nhất vào `src/modules/employees/`)
  - `src/modules/request-v2/` (đã hợp nhất vào `src/modules/requests/`)
  - `src/modules/attendance-v2/` (đã hợp nhất vào `src/modules/attendance/`)
  - `src/modules/payroll-v2/` (đã hợp nhất vào `src/modules/payroll/`)
  - `src/modules/positions/`
  - `src/modules/catalog/`
  - `src/modules/leave/`
  - `src/modules/advance/`
  - `src/modules/kpi/`
  - `src/modules/pay-entries/`
  - `src/modules/blocks/`
  - `src/modules/periods/`
  - `src/modules/audit/`
  - `src/modules/settings/`
  - `src/domain/`
  - `src/platform/`
  - `src/engine/`
  - `src/params/`
  - `src/ops/`
  - `src/data/`
  - `src/core/`
  - `test/` (ngoại trừ thư mục `test/v2/`)
- Modify: `.gitignore` (thêm `legacy_archive/`)

**Interfaces:**
- Consumes: 6 Feature Modules V2 + `DatabaseModule`.
- Produces: Ứng dụng NestJS khởi động sạch sẽ, gọn gàng, không còn bất kỳ import nào từ mã cũ.

- [ ] **Step 1: Cập nhật `src/app.module.ts`**
  - Chỉ đăng ký đúng các module: `DatabaseModule`, `AuthModule`, `RolesModule`, `EmployeesModule`, `RequestsModule`, `AttendanceModule`, `PayrollModule`, `SystemModule`.
  - Cấu hình global filter `ApiExceptionFilter`.

- [ ] **Step 2: Cập nhật `src/main.ts` và `src/bootstrap.ts`**
  - Loại bỏ các lệnh gọi legacy: `store.purgePunchRequests`, `store.upsertStaff`, `attachAccessLog`.
  - Khởi tạo tài khoản `admin` ban đầu thông qua `EmployeesService` nếu danh sách nhân sự rỗng.
  - Lắng nghe cổng HTTP một cách chuẩn mực.

- [ ] **Step 3: Di chuyển mã cũ vào `legacy_archive/`**
  - Tạo thư mục `legacy_archive/`.
  - Di chuyển các thư mục liệt kê ở trên vào `legacy_archive/`.
  - Thêm `legacy_archive/` vào `.gitignore`.

- [ ] **Step 4: Kiểm tra biên dịch TypeScript**
  - Chạy: `node --import tsx src/server.ts` trong vài giây hoặc kiểm tra import graph.
  - Xác nhận không còn lỗi "module not found" hay "relation timesheets does not exist".

- [ ] **Step 5: Commit**
  - `git add -A`
  - `git commit -m "refactor(core): archive legacy v1 codebase and rewire pure v2 modular monolith"`

---

### Task 8: Bộ Test TDD Toàn diện & Kiểm tra Concurrency (`test/v2/`)

**Files:**
- Create: `test/v2/concurrency-locks.test.ts`
- Create: `test/v2/full-workflow.test.ts`

**Interfaces:**
- Consumes: Toàn bộ API V2 đang chạy trên máy chủ test.
- Produces: Bằng chứng xác minh (evidence) tự động chứng minh hệ thống hoạt động ổn định và an toàn khi chịu tải cạnh tranh.

- [ ] **Step 1: Viết test Concurrency Lock**
  - Tạo `test/v2/concurrency-locks.test.ts`.
  - Bắn 10 yêu cầu Check-in/Check-out đồng thời cho cùng 1 nhân viên; xác minh advisory lock tuần tự hóa các yêu cầu, không xảy ra lỗi crash 500 hay bản ghi trùng lặp.

- [ ] **Step 2: Viết test End-to-End Workflow**
  - Tạo `test/v2/full-workflow.test.ts`.
  - Luồng: Đăng nhập Admin -> Tạo nhân viên mới -> Nộp đơn xin nghỉ -> Quản lý duyệt đơn -> Check-in công -> Tính lương tháng -> Xem phiếu lương -> Cập nhật hồ sơ nhân viên (`tran-minh-ngoc`).

- [ ] **Step 3: Chạy toàn bộ test suite V2**
  - Chạy: `node --import tsx test/v2/concurrency-locks.test.ts`
  - Chạy: `node --import tsx test/v2/full-workflow.test.ts`
  - Kỳ vọng: Tất cả các test đều PASS.

- [ ] **Step 4: Commit**
  - `git add test/v2/`
  - `git commit -m "test(v2): add end-to-end and concurrency verification suite"`

---

### Task 9: Biên soạn Tài liệu Hợp đồng API V2 cho Frontend Agent (`docs/api/v2-contract.md`)

**Files:**
- Create: `docs/api/v2-contract.md`

**Interfaces:**
- Consumes: Hiện thực API V2 thực tế của toàn bộ 6 modules.
- Produces: Tài liệu hợp đồng API chi tiết, chuẩn xác 100% để Frontend Agent kết nối giao diện Vue.

- [ ] **Step 1: Viết tài liệu hợp đồng chi tiết `docs/api/v2-contract.md`**
  - Quy ước chung: Base URL, Định dạng JSON, Xử lý Cookie/Session, Mã lỗi chuẩn (`code`, `error`, HTTP status).
  - Đặc tả từng endpoint: Method, URL, Header, URL Params, Query Params, Request Body schema mẫu, Response Body schema mẫu (200/201), Error Responses (400, 401, 403, 404, 409).
  - Cung cấp bảng ánh xạ từ các API V1 cũ sang API V2 mới để Frontend Agent dễ dàng thay thế trong `web/src/services/`.

- [ ] **Step 2: Commit**
  - `git add docs/api/v2-contract.md`
  - `git commit -m "docs(api): create v2 api contract for frontend integration"`

---

### Task 10: Xác minh Thực tế & Báo cáo Hoàn thành (Smoke Test)

**Files:**
- N/A (Verification step)

**Interfaces:**
- Consumes: Container Docker đang chạy và database PostgreSQL.
- Produces: Báo cáo bằng chứng xác minh (commands, exit codes, responses).

- [ ] **Step 1: Rebuild Docker image & khởi động container**
  - Chạy: `docker build -t luong-nhan-su:local .`
  - Chạy: `docker restart luong-app`
  - Kiểm tra log container: `docker logs --tail 50 luong-app` đảm bảo NestJS khởi động sạch sẽ và `HEALTHCHECK` trả về 200.

- [ ] **Step 2: Smoke test kiểm chứng các endpoint chính**
  - Gọi `GET /api/v2/employees` qua curl hoặc script test; xác minh trả về danh sách nhân sự (gồm `tran-minh-ngoc`).
  - Gọi `PUT /api/v2/employees/tran-minh-ngoc` để cập nhật họ tên/bậc; xác minh trả về 200 thành công, **không còn lỗi 500 hay transaction abort**.
  - Gọi `GET /api/v2/requests` xác minh trả về danh sách đơn từ 200.
  - Gọi `GET /api/v2/payroll/2026-11` xác minh trả về bảng lương 200.

- [ ] **Step 3: Ghi nhận kết quả và báo cáo cho người dùng**
  - Trình bày kết quả xác minh, đường dẫn tài liệu hợp đồng API `docs/api/v2-contract.md` và sẵn sàng bàn giao cho Frontend Agent.
