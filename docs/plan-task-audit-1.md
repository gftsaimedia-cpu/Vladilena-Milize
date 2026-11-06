# Audit task plan vs code (1)

Ngày: 2026-11-05. Phạm vi: 12 plan trong `docs/superpowers/plans/`, 92 task. Chỉ đọc code, không sửa gì khác.

Cách kiểm: (a) tên file/symbol mà plan nêu, grep trong `src`, `web/src`, `web/tests`, `test`, `migrations`; (b) file plan nêu là "Delete" thì coi zero hit là đúng ý; (c) đối chiếu git log và spec khi có file bị đổi/xoá. Các task "OK" không đọc từng dòng, chỉ kiểm symbol/file/test chính.

Tổng: OK 76 · Thiếu 6 · Bỏ có chủ đích 5 · Chưa chắc 5.

## 2026-11-04-admin-bell-attendance

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T1 Nguồn việc chung, ngăn kéo chuông, bỏ Yêu cầu | Thiếu (một phần) | `web/src/components/shell/BellDrawer.vue` thay BellPopover (OK); `InboxDetail.vue:11` chỉ có prop `item`, thiếu `showPerson`/`profileLink` (plan dòng 109) |
| T2 Dữ liệu giả chấm công | OK | `web/src/mock/attendance.ts` tồn tại; test `web/tests/attendance-mock.spec.ts` |
| T3 Màn Chấm công theo tuần | OK | `web/src/views/admin/attendance/AttendanceWeekView.vue`, `parts/WeekGrid.vue` |
| T4 Cuộn lưới tuần | OK | `web/src/views/admin/attendance/useGridScroll.ts` |
| T5 Hồ sơ chấm công | OK | `web/src/views/admin/attendance/AttendanceEmployeeView.vue`; `links.ts:11` `employeePath` |

## 2026-11-04-admin-mock-shell-overview

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T1 Cắt kết nối BE, phiên giả | Bỏ có chủ đích (đã đảo) | `web/vite.config.ts:20` vẫn có `proxy` `/api` tới BE; commit `00d04b7` nối lại overview API, `aa8148d`, `5ea7475` nối lại v2 |
| T2 Cách ly test cũ (`test.fixme`) | Chưa chắc | Không còn `test.fixme` trong `web/tests`; chưa xác minh test nào đã được bật lại |
| T3 Dữ liệu khung, thanh trên, dải kỳ lương | OK | `web/src/builders/period-strip.ts` còn; `buildStrip`, `STEP_LABELS`, `STATE_LABEL`, `getBell` đã xoá (zero hit, đúng plan) |
| T4 Thanh bên nổi hai kiểu | OK | `web/src/components/shell/AdminSidebar.vue`, `AdminTopbar.vue` tồn tại |
| T5 Tổng quan mới | Bỏ có chủ đích (thay thế) | `web/src/services/admin-main.ts:39` `resolveRequest`, `:89` `getOverview` thay `approveRequest`/`decideRequest`; `OverviewView.vue` tồn tại; `00d04b7` đưa overview sang API thật |

## 2026-11-04-admin-payroll-kpi

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T1 Dữ liệu giả Bảng lương, 6 bước kỳ lương | OK | `web/src/mock/payroll.ts`, `payroll-calc.ts` tồn tại |
| T2 Màn Bảng lương | OK | `web/src/services/admin-payroll.ts` tồn tại |
| T3 Cột đứng yên, CSV | OK | Không có symbol thiếu được phát hiện |
| T4 Ngăn kéo và phiếu lương H | OK | `web/src/mock/payslip-a4.ts`, `services/payslip.ts` tồn tại |
| T5 Chấm điểm KPI trong phiếu | OK | `payroll-calc.ts` tồn tại; không có symbol thiếu |
| T6 Duyệt, từ chối, in phiếu | OK | `web/src/services/admin-payroll.ts:60` tham số `'approve' \| 'reject'` |
| T7 Bỏ màn Đánh giá KPI | Bỏ có chủ đích | Commit `a9db8e8` "fold KPI scoring into Bảng lương and drop the KPI screen"; `PATHS.danhGiaKpi` không còn; `admin-kpi` không còn |

## 2026-11-04-admin-staff-list

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T1 Dữ liệu giả, màn danh sách | OK | `web/src/views/admin/staff/StaffView.vue`; `AddStaffDialog.vue`, `builders/admin-hr/staff.ts` đã xoá đúng plan |
| T2 Tìm theo tên, mã, công tắc | OK | `web/src/views/admin/staff/staffFilter.ts` |
| T3 Chọn nhiều dòng, CSV | OK | `web/src/views/admin/staff/staffCsv.ts` |
| T4 Ngăn kéo hồ sơ | OK | `web/src/views/admin/staff/StaffDrawer.vue` |

## 2026-11-04-isat-request

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T0 Môi trường (merge nhánh) | Chưa chắc | Việc git, không có sản phẩm trong code |
| T1 Domain `IsatRegistration`, `createIsatRequest` | OK | `src/modules/requests/domain/isat.ts`; `test/v2/requests-isat-domain.test.ts` |
| T2 Migration `0004_isat_registrations.sql`, repository | Bỏ có chủ đích (gộp) | Commit `e68a5c1` "fold the numbered migrations into one schema.sql"; `migrations/postgres/schema.sql:409` `isat_registrations`, `:422` `isat_registration_conditions` |
| T3 Service, duyệt ghi lịch, controller | OK | `test/v2/requests-isat-service.test.ts`, `requests-isat-repository.test.ts` |
| T4 Nối lương | OK | `src/modules/payroll/payroll.repository.ts`, `domain/advance-quote.ts` có tham chiếu isat |

## 2026-11-04-payroll-v2-rules

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T1 Cảnh báo và KPI (`payroll-warning.ts`, `kpi-pay.ts`) | Thiếu (một phần) | `src/modules/payroll/domain/payroll-warning.ts:1-5` không có `CONTRACT_START_MISSING` (plan dòng 180); `kpi-pay.ts` tồn tại |
| T2 BH và TNCN | OK | `src/modules/payroll/domain/insurance.ts`, `personal-income-tax.ts` |
| T3 Đọc dữ liệu tháng; migration 0003 | OK | Migration `0003` đã gộp vào `schema.sql` (commit `e68a5c1`), không tính là thiếu |
| T4 Phiếu lương, `EmployeePayslip`, `PayrollService` | Thiếu (một phần) | `contractStart`/`contractEnd` không có trong `src` (plan dòng 308, 322); `employee-payslip.ts` chỉ có `contractStatusText` |
| T5 Lưu và đọc phiếu lương | OK | `src/modules/payroll/payroll.repository.ts` tồn tại |
| T6 API KPI, mã lỗi | OK | `src/modules/payroll/payroll.service.ts` tồn tại |
| T7 Sửa sau review | Chưa chắc | Không có symbol nêu rõ trong plan |
| T8 Thuế và BH theo nhãn hợp đồng | Thiếu (một phần) | Có `resolveContractTerm`, `isInsured` (`domain/contract-term.ts:11,17`); thiếu `contractStart`/`contractEnd`/`CONTRACT_START_MISSING` |

## 2026-11-04-requests-rules

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T0 Đồng bộ nhánh | Chưa chắc | Việc git, không có sản phẩm trong code |
| T1 Danh mục và ngày làm việc | OK | `src/modules/requests/domain/` tồn tại |
| T2 Khung giờ OT/làm bù | OK | `test/v2/requests-overtime.test.ts`, `requests-makeup.test.ts` |
| T3 Mô hình đơn, bỏ đơn sửa giờ | OK | `createCorrectionRequest`, `CreateCorrectionInput`, `formatTimeToHHmm` đã xoá; `requests.repository.ts` có `attachChildren` (thay `attachIsat`); migration `0005` đã gộp vào `schema.sql` |
| T4 Lịch lễ công ty | OK | `test/v2/holidays.test.ts` |
| T5 Ngữ cảnh nộp đơn | OK | `test/v2/requests-context.test.ts`, `requests-filing-context.test.ts` |
| T6 Đơn nghỉ và duyệt | OK | `test/v2/requests-leave.test.ts`, `requests-review.test.ts` |
| T7 Đơn OT | OK | `test/v2/requests-overtime.test.ts` |
| T8 Đơn nghỉ có làm bù | OK | `test/v2/requests-makeup.test.ts` |
| T9 Đơn đổi ca | OK | `test/v2/requests-shift-change.test.ts` |
| T10 Đơn giải trình | OK | `test/v2/requests-explanation.test.ts` |
| T11 Test PostgreSQL thật | OK | `test/v2/requests-*.pg.test.ts` (ví dụ `requests-period.pg.test.ts`, `requests-review.pg.test.ts`) |

Ghi chú: plan trỏ `test/v2/requests.test.ts` không tồn tại, nhưng có bộ `test/v2/requests-*.test.ts` thay thế.

## 2026-11-04-staff-phone-app

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T1 Nền app và màn Tôi (J7) | Thiếu (một phần) | `getSelfKpi`, `saveSelfKpi`, `mockStaffApi` không có trong code; `web/src/services/staff-desktop.ts` không tồn tại (plan dòng 66, 409; spec R11). `web/src/services/staff-phone.ts` không export KPI |
| T2 J1 Hôm nay | OK | `web/src/views/staff-phone/HomeView.vue` |
| T3 J2 Chấm công, J3 hộp ngày | OK | `web/src/views/staff-phone/AttendanceView.vue`, `components/DaySheet.vue` |
| T4 J4 Yêu cầu, J5 hộp yêu cầu | OK | `web/src/views/staff-phone/RequestsView.vue`, `components/RequestSheet.vue` |
| T5 J6 Thu nhập | OK | `web/src/views/staff-phone/IncomeView.vue`, `components/KpiCard.vue` |
| T6 Luồng qua nhiều màn | OK | Không có symbol thiếu; `web/tests/staff-ux.spec.ts` đã xoá (commit `32cc78e`) |

## 2026-11-05-attendance-core

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T1 `detectCases` | OK | `test/v2/attendance-explanation-detect.test.ts` |
| T2 `buildDay` | OK | `test/v2/attendance-day.test.ts` |
| T3 Lược đồ, ghi đè dòng ngày | OK | `saveTimesheet` đã xoá theo T6; `src/modules/attendance/attendance-days.repository.ts` |
| T4 `loadSources` | OK | `test/v2/attendance-days-sources.pg.test.ts` |
| T5 `AttendanceDaysService` | OK | `src/modules/attendance/attendance-days.service.ts` |
| T6 Chấm công T1, bỏ cách tính cũ | OK | `calculate`, `applyApprovedLeave`, `saveTimesheet` không còn trong `src` |
| T7 Đơn ghi lại ngày công | OK | `test/v2/attendance-requests.pg.test.ts` |
| T8 Ngày lễ và hồ sơ nhân sự | OK | `test/v2/attendance-holidays-employees.pg.test.ts` |
| T9 Job mỗi giờ | OK | `src/modules/attendance/attendance-days.job.ts` |
| T10 App nhân viên `/me` | OK | `src/modules/me/me.controller.ts` |
| T11 Lương đọc dòng ngày | OK | `makeupWorkDates` bỏ có chủ đích (plan dòng 815, 869, R10); `payroll.service.ts:518` `makeupPay` |
| T12 Thay cổng cài đặt (có điều kiện) | Bỏ có chủ đích (đã thay) | `DEFAULT_LATE_GRACE_MINUTES` và `PositionTypeAttendanceSettings` không còn; `src/modules/attendance/attendance.module.ts:22` dùng `SettingsAttendanceSettings`; `attendance-settings.port.ts` tồn tại |
| T13 Ví dụ đầu–cuối tháng 11 | OK | `test/v2/attendance-november.pg.test.ts` |

## 2026-11-05-audit-log

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T1 Chuỗi băm | OK | `test/v2/audit-chain.test.ts` |
| T2 Kiểm entry và query | OK | `test/v2/audit-entry.test.ts`, `audit-query.test.ts` |
| T3 Ghi nhật ký (`AuditLog.append`) | OK | `test/v2/audit-log.pg.test.ts` |
| T4 Đọc và kiểm tra | OK | `src/modules/audit/audit.controller.ts` (`list`, `verify` ở `:13`, `:19`) |
| T5 Route, module, dọn chỗ cũ | OK | `getAuditLogs`, `listAuditLogs` đã xoá khỏi `src/modules/system` (zero hit) |
| T6 Builder FE nhãn, gộp × N | OK | `web/src/builders/api/audit.ts`, `web/src/builders/admin-config/audit.ts`; `auditResponseFromRows` đã xoá đúng plan |
| T7 Service FE, view | OK | `auditState` đã xoá đúng plan; `web/src/builders/admin-config/audit-labels.ts` |
| T8 Xác minh toàn bộ | Chưa chắc | Việc kiểm tra, chưa đối chiếu kết quả chạy test |

## 2026-11-05-day-status

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T1 Bảng `day_status`, repository | OK | `migrations/postgres/schema.sql`; `test/v2/day-status.pg.test.ts` |
| T2 `planClaims` | OK | `test/v2/requests-day-status.test.ts` |
| T3 Fake, `loadDays`, nghỉ có làm bù | OK | `test/v2/requests-attendance-days.test.ts` |
| T4 Đổi ca, OT, khung bù, giải trình | OK | `test/v2/requests-shift-change.test.ts`, `requests-overtime.test.ts` |
| T5 Nộp iSAT dưới khoá nhân viên | OK | `test/v2/requests-isat-service.test.ts` |
| T6 Duyệt, từ chối, huỷ | OK | `test/v2/requests-review.test.ts` |
| T7 API `warnings`, `DAY_CONFLICT` | OK | `test/v2/requests-day-conflict-http.test.ts` |
| T8 Kịch bản PostgreSQL | OK | `test/v2/day-status.pg.test.ts` |
| T9 FE hiện lỗi duyệt | OK | `web/src/services/admin-main.ts` `resolveRequest` gọi `toast.error` (dòng ~54, nhánh `ApiError`); `BulkApproveDialog` không tồn tại, plan chỉ tham chiếu, không sửa |

## 2026-11-05-fe-be-auth-foundation

| Task | Kết quả | Bằng chứng |
|---|---|---|
| T1 Decorator quyền, test mặc định đóng | OK | `test/v2/auth-access.test.ts`, `auth-guard.test.ts` |
| T2 `AuthGuard` toàn cục | OK | `src/modules/auth/auth.guard.ts` |
| T3 Phiên `session_version`, `/auth/me` | OK | `test/v2/auth-session.test.ts` |
| T4 `LoginRateLimiter` | OK | `test/v2/auth-rate-limit.test.ts` |
| T5 Bootstrap | OK | `src/bootstrap.ts`; `test/v2/bootstrap-http.test.ts` |
| T6 Người thao tác từ phiên | OK | `test/v2/actor-from-session.test.ts` |
| T7 Test HTTP trên Postgres | OK | `test/v2/auth-http.pg.test.ts` |
| T8 FE `api()` thật, proxy, công tắc | OK | `web/src/services/data-mode.ts:1`; `web/vite.config.ts:20`; `web/package.json:12` `dev:mock` |
| T9 FE phiên thật, service chỉ-mock | Thiếu (một phần) | Plan dòng 143 yêu cầu tạo `web/.env.mock` với `VITE_DATA=mock`; file không tồn tại |
| T10 Playwright dự án `api` | OK | `web/tests/api/auth.spec.ts`; `web/package.json:16` `test:api` |

Ghi chú: `src/modules/auth/auth.helpers.ts` đã xoá đúng plan; `web/tests/api/README.md` không cần theo plan.

## Danh sách Thiếu

1. `2026-11-04-admin-bell-attendance` T1: `InboxDetail.vue:11` thiếu prop `showPerson`/`profileLink`.
2. `2026-11-04-payroll-v2-rules` T1: `payroll-warning.ts:1-5` thiếu code `CONTRACT_START_MISSING`.
3. `2026-11-04-payroll-v2-rules` T4: thiếu `contractStart`/`contractEnd` trong `EmployeePayslip`.
4. `2026-11-04-payroll-v2-rules` T8: thiếu `contractStart`/`contractEnd`/`CONTRACT_START_MISSING`; chỉ có `resolveContractTerm`/`isInsured`.
5. `2026-11-04-staff-phone-app` T1: thiếu `getSelfKpi`/`saveSelfKpi`, `services/staff-desktop.ts`, `mockStaffApi`.
6. `2026-11-05-fe-be-auth-foundation` T9: thiếu `web/.env.mock`.

## Chưa chắc

- `admin-mock-shell-overview` T2: test `fixme` đã bật lại hay chưa.
- `isat-request` T0, `requests-rules` T0: task git, không có sản phẩm trong code.
- `payroll-v2-rules` T7 và `audit-log` T8: task sửa sau review/xác minh, không có symbol để kiểm.
- Các task OK chỉ kiểm symbol/file/test chính, chưa chạy test.
