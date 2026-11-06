# Plan: phòng ban, lọc nhân sự, chọn nhiều (BE)

Spec: `docs/superpowers/specs/2026-11-06-staff-filters-bulk-design.md`. Mỗi task: test đỏ → code → test xanh → commit.
Lệnh kiểm: `PG_TEST_URL=postgres://…/postgres node --import tsx --test <file>`; cuối cùng `npm test`.

| # | Task | Nơi sửa |
|---|------|---------|
| 1 | Schema: `departments`, `staff.department_id/on_leave_from/on_leave_to`, seed; kiểu DB | `schema.sql`, `src/database/schema.ts` |
| 2 | `staffStatusOf` + bộ lọc thuần (parse `staffStatus`/`departmentId`) | `departments/domain/` |
| 3 | Module `departments`: repo, service, 4 route, nhật ký `department.create/update/delete` | `src/modules/departments/` |
| 4 | `StaffDirectory` (đọc `staff` + `departments`) | `departments/` |
| 5 | `GET /payroll/:month`: lọc, `employee`, `totals` theo dòng đã lọc | `payroll.controller.ts` |
| 6 | Test ghim tính lại từng phần phiếu đã duyệt → Nháp | `test/v2/` |
| 7 | `GET /requests`: lọc, `employee`, `sort=inbox`, `counts`, loại iSAT | `requests.*` |
| 8 | `POST /requests/review-many` | `requests.*` |
| 9 | `GET /requests/explanations-due` lọc + `POST …/remind-many` | `explanations.service.ts`, `requests.controller.ts` |
| 10 | `employees/**`: `departmentId`, khoảng tạm nghỉ, `staffStatus` trong DTO và `GET /employees` | `employees/**` |
| 11 | `POST /employees/shift`, `POST /employees/department` | `employees/**` |
| 12 | `attendance/week` lọc `staffStatus`/`departmentId` | `overview/**` |
| 13 | `docs/api/v2-contract.md`, chạy `npm test`, báo cáo | docs |
