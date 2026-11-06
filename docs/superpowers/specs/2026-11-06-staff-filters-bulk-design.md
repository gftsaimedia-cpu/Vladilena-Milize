# Thiết kế: phòng ban, lọc nhân sự, chọn nhiều (BE)

Nguồn yêu cầu: `docs/fe-yeu-cau/admin-loc-nhan-su-chon-nhieu--api-be.md`. Nhánh `claude/admin-filters-bulk`, tách từ local main `7f1e99f`.

## Đã chốt (người dùng, trong chat 06/11)

- Q4 chọn (b): tính lại từng phần một phiếu đã duyệt thì phiếu về Nháp; không thêm `PAYSLIP_APPROVED`, không thêm route bỏ duyệt từng phiếu.
- "Đang làm việc" gồm cả người thử việc.
- "Đang tạm nghỉ" theo cách B: Admin đặt trong hồ sơ kèm ngày bắt đầu và ngày kết thúc.
- Tab Yêu cầu không hiện iSAT; BE loại.
- Nhắc giải trình lại người đã được nhắc: giữ nguyên hành vi hiện tại (ghi đè), không thêm khoảng cách tối thiểu (Q5 chưa chốt).

## Ruling (tự quyết theo spec, người dùng chưa trả lời)

- Ruling: `on_leave_to` được để trống (nghỉ chưa rõ ngày về) — đề xuất đã nêu trong chat, chưa có phản hồi — nếu sai: người bỏ trống ngày về vẫn hiện "Đang tạm nghỉ" đến khi Admin sửa.
- Ruling: người đã nghỉ việc (`resigned`) luôn thắng `on_leave` — như trên — nếu sai: người nghỉ việc trong khoảng tạm nghỉ sẽ lọt vào "Đang tạm nghỉ".
- Ruling: `mine` = `all` cho đến khi có phạm vi theo bậc (Q7) — chọn theo mặc định của tài liệu — nếu sai: Admin thấy nhiều người hơn mục đã đặt tên.
- Ruling: gán ca nhiều người có hiệu lực ngay, như `PUT /employees/:username` hiện nay (Q3 chưa chốt) — không thêm luật mới — nếu sai: bảng công đổi ca ngay từ hôm gán, không từ đầu tháng sau.
- Ruling: phòng ban không chặn loại nhân sự (Q8 chưa chốt).
- Không làm: phạm vi quản lý theo bậc (§6), vì Trưởng nhóm được làm gì chưa chốt.

## Kiến trúc

1. **`StaffDirectory`** (module `departments`, xuất ra): đọc bảng `staff` + `departments`, nhận `{ staffStatus, departmentId, q }`, trả `{ uuid, username, name, departmentId, departmentName, jobTitle, staffStatus }[]`. `staffStatusOf()` là hàm thuần trong `departments/domain/`; `GET /employees` và `attendance/week` dùng lại đúng hàm này.
   - `staffStatus` ∈ `probation | working | on_leave | resigned`. `nghiviec` → `resigned`; `thuviec`/`probation` → `probation`; còn lại `working`. Có khoảng tạm nghỉ chứa hôm nay (giờ Việt Nam) và chưa nghỉ việc → `on_leave`.
   - Bộ lọc: `all` không lọc; `working` = `working` + `probation`; `mine` = `all`; `probation`, `on_leave`, `resigned` đúng giá trị. Lạ → `400 INVALID_FILTER`. `departmentId` = số hoặc `none`.
2. **Schema** (`schema.sql`, không file đánh số): bảng `departments`; cột `staff.department_id`, `staff.on_leave_from`, `staff.on_leave_to`; seed "Phòng ban 1", "Phòng ban 2".
3. **Chọn nhiều** (quy ước chung): 1–200 phần tử, rỗng/sai kiểu/trùng → `400 INVALID_IDS`; mỗi phần tử một giao dịch; `200 { done, failed }`; lỗi cả lô giữ mã của route một phần tử; mỗi phần tử một dòng nhật ký cùng mã với route một phần tử.
4. **Yêu cầu**: lọc qua tập id (uuid + username) vào `employeeIds` có sẵn; `sort=inbox` (chờ trước, cũ nhất trước; đã xử lý sau, mới nhất trước) bằng `ORDER BY` ở SQL; `counts` theo bộ lọc nhân sự và `q`, không theo `status`/`type`; iSAT loại khỏi `counts` và khỏi danh sách khi `sort=inbox`.
5. **review-many**: duyệt tuần tự theo thứ tự `ids` bằng `reviewRequest`; sau cả lô tính lại lương một lần cho mỗi cặp (người, tháng).

## Phạm vi (theo thứ tự làm)

- Lát 1: phòng ban + `StaffDirectory`; `payroll/:month` lọc + `totals`; tab Yêu cầu; `review-many`; `explanations-due` lọc + `remind-many`; test ghim tính lại từng phần phiếu đã duyệt.
- Lát 2 (đã mở khoá, Chấm công đã vào main): `employees/**` — `departmentId`, khoảng tạm nghỉ, `staffStatus` trong DTO và `GET /employees`; `POST /employees/shift`, `POST /employees/department`; lọc `attendance/week`.
- Không làm: §6; bug lạ ngoài phạm vi chỉ ghi vào `docs/superpowers/notes/2026-11-06-bugs-found.md`.

## Kiểm thử

TDD, test trong `test/v2/`. PG riêng `luong-test-pg-filters`. Không chạy typecheck, prettier. Cập nhật `docs/api/v2-contract.md` (có `api-contract-doc.test.ts`).
