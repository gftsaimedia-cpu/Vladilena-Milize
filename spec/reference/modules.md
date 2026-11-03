# Module NestJS

> Sinh tự động bởi `scripts/docs/gen-spec.ts` (`npm run spec:gen`) từ cây `src/` (import và decorator). Đừng sửa tay: `test/unit/spec-reference.test.ts` so sánh file này với bản dựng từ mã.

Luật kiến trúc do `test/unit/architecture.test.ts` giữ: module nghiệp vụ chỉ import module khác qua `index.ts`; hạ tầng (`src/http`, `src/shared`) không phụ thuộc module; `AppModule` (`src/app.module.ts`) đăng ký mọi module, `NotFoundModule` đứng cuối.

## Hạ tầng (`src/`)

| File | Việc |
| --- | --- |
| `src/bootstrap.ts` | dựng `http.Server`: tiêu đề bảo mật, file tĩnh ngoài `/api`, chuyển `/api/*` cho Nest; mã hoá lại `%` để Express không lỗi giải mã |
| `src/main.ts` | khởi động thật: tạo admin đầu tiên, hẹn giờ dọn bảng nhớ lượt chấm công, sổ phép, mở cổng, tắt êm |
| `src/app.init.ts` | khởi tạo cấp ứng dụng (bộ chọn hợp đồng mặc định, đồng bộ vai trò staff) |
| `src/app.module.ts` | gốc module: guard, interceptor, filter toàn cục; danh sách module |
| `src/env.ts` | nạp `.env` không ghi đè biến đã đặt |
| `src/http/api-gate.ts` | cổng quyền, giới hạn tải, giới hạn tốc độ ghi, ngữ cảnh nhật ký, cổng khoá kỳ |
| `src/http/api.guard.ts` | guard toàn cục gọi `ApiGate` |
| `src/http/request-scope.interceptor.ts` | phạm vi một yêu cầu: cảnh báo, bộ quy tắc theo tháng, báo tin sau COMMIT |
| `src/http/api-exception.filter.ts` | đổi mọi lỗi thành JSON (`HttpError`, lỗi có mã của store, `Overloaded`, 500) |
| `src/http/api-context.ts` | `ApiContext` và decorator `@Ctx()` |
| `src/http/load-control.ts` | monitor, cổng băm mật khẩu, giới hạn tốc độ ghi, bộ từ chối tải |
| `src/http/not-found.controller.ts` | 404 cho đường dẫn không module nào nhận |
| `src/data/*` | lớp truy vấn có kiểu (Kysely) trên kết nối của ứng dụng: `db-dialect.ts` (chạy qua `prepare().all/run` của SQLite/PostgreSQL), `schema.generated.ts` (kiểu bảng sinh từ migration, `npm run db:types`), repository (`SettingsRepository`) |
| `src/shared/reason.ts` | `reasonOf`: lý do ghi nhận tối đa `config.REASON_MAX` ký tự |

## Module nghiệp vụ (`src/modules/*`)

| Module | Route | File | Import module khác |
| --- | --- | --- | --- |
| `advance` | `GET /api/advance-requests`<br>`GET /api/advance-approvals`<br>`POST /api/advance-approvals/request`<br>`POST /api/advance-approvals/withdraw`<br>`POST /api/advance-approvals/approve`<br>`POST /api/advance-approvals/reject`<br>`POST /api/advance-approvals/cancel`<br>`POST /api/advance-approvals/approve-all` | `advance-approvals.handlers.ts` `advance-requests.handlers.ts` `advance.controller.ts` `advance.module.ts` `index.ts` | — |
| `approvals` | `GET /api/approvals`<br>`GET /api/approvals/count`<br>`GET /api/alerts`<br>`PUT /api/approvals/decide` | `approvals.controller.ts` `approvals.helpers.ts` `approvals.module.ts` `index.ts` | — |
| `attendance` | `GET /api/punch`<br>`POST /api/punch`<br>`GET /api/ot`<br>`POST /api/ot`<br>`PUT /api/ot`<br>`GET /api/today`<br>`GET /api/attendance` | `attendance.controller.ts` `attendance.helpers.ts` `attendance.module.ts` `index.ts` | `sheet` |
| `attendance-v2` | `POST /api/v2/attendance/punches`<br>`GET /api/v2/attendance/punches`<br>`GET /api/v2/attendance/timesheets`<br>`GET /api/v2/attendance/timesheets/:employeeId/:workDate` | `attendance-v2.controller.ts` `attendance-v2.module.ts` `attendance-v2.service.ts` `index.ts` | — |
| `audit` | `GET /api/audit`<br>`GET /api/audit/verify` | `audit.controller.ts` `audit.helpers.ts` `audit.module.ts` `index.ts` | — |
| `auth` | `POST /api/login`<br>`POST /api/logout`<br>`GET /api/me`<br>`PUT /api/password` | `auth.controller.ts` `auth.helpers.ts` `auth.module.ts` `index.ts` | — |
| `blocks` | `POST /api/blocks`<br>`PUT /api/blocks/:code/confirm` | `blocks.controller.ts` `blocks.module.ts` `index.ts` | — |
| `catalog` | `GET /api/catalog/positions`<br>`PUT /api/catalog/positions/:code`<br>`PUT /api/catalog/levels`<br>`GET /api/catalog/shifts`<br>`PUT /api/catalog/shifts` | `catalog.controller.ts` `catalog.module.ts` `index.ts` | — |
| `employee-v2` | `GET /api/v2/employees`<br>`GET /api/v2/employees/:username`<br>`POST /api/v2/employees`<br>`PUT /api/v2/employees/:username`<br>`PATCH /api/v2/employees/:username/profile`<br>`PATCH /api/v2/employees/:username/account`<br>`PATCH /api/v2/employees/:username/contract`<br>`PATCH /api/v2/employees/:username/position`<br>`PATCH /api/v2/employees/:username/shift`<br>`PATCH /api/v2/employees/:username/leave`<br>`DELETE /api/v2/employees/:username` | `employee-v2.controller.ts` `employee-v2.module.ts` `employee-v2.service.ts` `index.ts` | — |
| `employees` | `GET /api/employees/:uuid`<br>`GET /api/employees/:uuid/trace` | `employees.controller.ts` `employees.module.ts` `index.ts` | — |
| `explanations` | `GET /api/explanations`<br>`POST /api/explanations`<br>`POST /api/explanations/:id/answer`<br>`POST /api/explanations/:id/decide` | `explanations.controller.ts` `explanations.handlers.ts` `explanations.module.ts` `index.ts` | — |
| `kpi` | `GET /api/kpi/scores`<br>`PUT /api/kpi/scores` | `index.ts` `kpi.controller.ts` `kpi.module.ts` | — |
| `leave` | `GET /api/leave/ledger`<br>`POST /api/leave/refresh` | `index.ts` `leave.controller.ts` `leave.module.ts` | — |
| `pay-entries` | `GET /api/pay-entries`<br>`POST /api/pay-entries`<br>`POST /api/pay-entries/bulk`<br>`PUT /api/pay-entries/:id`<br>`PUT /api/pay-entries/:id/decide`<br>`POST /api/pay-entries/:id/void`<br>`POST /api/pay-entries/:id/confirm-flags` | `index.ts` `pay-entries.controller.ts` `pay-entries.module.ts` | — |
| `periods` | `GET /api/slip-override`<br>`PUT /api/slip-override`<br>`GET /api/periods`<br>`GET /api/periods/:month`<br>`POST /api/periods/:month/lock-attendance`<br>`POST /api/periods/:month/calculate`<br>`POST /api/periods/:month/approve`<br>`POST /api/periods/:month/mark-paid`<br>`POST /api/periods/:month/reopen`<br>`GET /api/periods/:month/payslips`<br>`GET /api/periods/:month/estimates`<br>`GET /api/periods/:month/estimates/:username`<br>`GET /api/periods/:month/payslips/:username`<br>`PUT /api/periods/:month/payslips/decide`<br>`GET /api/periods/:month/verify` | `index.ts` `periods.controller.ts` `periods.helpers.ts` `periods.module.ts` | — |
| `positions` | `GET /api/positions`<br>`GET /api/entitlements`<br>`POST /api/positions`<br>`POST /api/positions/:code/levels` | `index.ts` `positions.controller.ts` `positions.module.ts` | — |
| `request-v2` | `POST /api/v2/requests/leave`<br>`POST /api/v2/requests/correction`<br>`POST /api/v2/requests/overtime`<br>`POST /api/v2/requests/advance`<br>`GET /api/v2/requests`<br>`GET /api/v2/requests/:id`<br>`PATCH /api/v2/requests/:id/review`<br>`PATCH /api/v2/requests/:id/cancel` | `index.ts` `request-v2.controller.ts` `request-v2.module.ts` `request-v2.service.ts` | — |
| `roles` | `GET /api/roles`<br>`POST /api/roles`<br>`PUT /api/roles/:code`<br>`POST /api/roles/:code/deprecate` | `index.ts` `roles.controller.ts` `roles.module.ts` | — |
| `settings` | `GET /api/settings/shifts`<br>`PUT /api/settings/shifts`<br>`GET /api/holidays`<br>`PUT /api/holidays`<br>`PUT /api/settings/geofence`<br>`GET /api/settings/params`<br>`GET /api/settings/first-run`<br>`GET /api/settings/version`<br>`PUT /api/settings/params`<br>`POST /api/settings/params/preview`<br>`POST /api/settings/params/revert` | `index.ts` `settings-shifts.controller.ts` `settings.controller.ts` `settings.helpers.ts` `settings.module.ts` | — |
| `sheet` | `GET /api/me/estimate`<br>`GET /api/sheet`<br>`PUT /api/sheet`<br>`PUT /api/sheet/bulk`<br>`PUT /api/staff/shift-bulk` | `index.ts` `sheet.controller.ts` `sheet.helpers.ts` `sheet.module.ts` | — |
| `staff` | `GET /api/staff`<br>`GET /api/team`<br>`POST /api/staff/:u/password`<br>`PUT /api/staff/:u/roles`<br>`POST /api/staff`<br>`PUT /api/staff/:u`<br>`GET /api/staff/:u/schedule` | `index.ts` `staff.controller.ts` `staff.helpers.ts` `staff.module.ts` | — |
| `system` | `GET /api/health`<br>`GET /api/events` | `index.ts` `system.controller.ts` `system.module.ts` | — |
