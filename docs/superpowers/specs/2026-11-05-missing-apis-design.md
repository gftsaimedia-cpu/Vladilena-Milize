# API còn thiếu để FE chạy hết trên dữ liệu thật — thiết kế

- Ngày: 2026-11-05
- Trạng thái: bản kế hoạch thiết kế, **chờ người dùng duyệt** trước khi viết plan triển khai
- Nguồn: đối chiếu từng màn của `web/` với BE v2 sau spec 1 (`2026-11-05-fe-be-auth-foundation-design.md`)
- Quy ước chung: mọi route mới mang đúng một dấu `@Public` / `@Authenticated` / `@RequireCap` (test "mặc định đóng" bắt buộc); BE trả dữ liệu nghiệp vụ (ngày ISO, phút, tiền là số đồng), FE định dạng trong `web/src/builders/api/`.

## 1. Tình trạng nối hiện tại (chế độ `api`)

| Màn FE | Nguồn dữ liệu | Tình trạng |
|---|---|---|
| Đăng nhập, đăng xuất, đổi mật khẩu, phân khu Admin/NV | `/api/v2/auth/*` | **Đã nối** |
| Nhân sự (`/admin/nhan-su`): danh sách, thẻ chỉ số, ngăn kéo hồ sơ | `GET /employees`, `GET /employees/:username` | **Đã nối** (phòng ban, mã NV, email, quản lý trực tiếp hiện "—": BE chưa có) |
| Chuông, chi tiết việc chờ, duyệt / từ chối | `GET /requests?status=PENDING`, `PATCH /requests/:id/review` | **Đã nối** (chưa có "nhắc giải trình", "khai thay", tin hệ thống) |
| Cài đặt › Lịch nghỉ lễ | `GET/POST/DELETE /holidays` | **Đã nối** (ngày trả lương chưa có) |
| Cài đặt › Nhật ký | `GET /system/audit?limit&offset` | **Đã nối** (lọc chỉ trong trang; kiểm chuỗi băm chưa có) |
| Bảng lương: bảng cả kỳ | `GET /payroll/:month` | **Đã nối** (phòng ban, ngày trả, so sánh tháng trước để trống) |
| Bảng lương: ngăn kéo phiếu, chấm KPI trong phiếu | `GET /payroll/:month/:username`, `PUT /payroll/:month/kpi/:username` rồi `POST /payroll/:month/calculate` cho người đó | **Đã nối** (lịch sử sửa KPI trống; xem trước khi gõ không tính lại tiền — tiền đổi sau khi lưu) |
| Bảng lương: duyệt / từ chối từng phiếu | — | Chưa có API (mục 3.3) |
| Yêu cầu (`/admin/yeu-cau`), Giải trình, Tạm ứng | `GET /requests` (+ `type=`), `PATCH /requests/:id/review` | **Đã nối** (lọc tháng và đếm tại FE; "huỷ duyệt tạm ứng" chưa có API) |
| Chấm công Admin: lưới 4 tuần, thẻ số, chi tiết ngày, hồ sơ chấm công từng người | `GET /attendance/timesheets?startDate&endDate`, `/employees`, đơn chờ | **Đã nối** (giờ vào/ra trung bình, phòng ban, thanh giờ chi tiết và lịch sử sửa giờ để trống) |
| Thanh kỳ lương | `GET /system/periods` (mốc khoá công, tính, duyệt, trả) | **Đã nối** (KPI coi như xong khi đã tính lương) |
| Cài đặt › Chức vụ & bậc (xem) | `GET /employees/meta/positions` | **Đã nối** (quyền lợi theo chức vụ chưa trả; sửa chức vụ / bậc chưa có API) |
| Cài đặt › Ca làm (xem) | `GET /employees/meta/shifts` | **Đã nối một phần**: tên, loại ca; giờ vào/ra và vùng chấm công chưa có ở BE |
| Cài đặt › Phân quyền: tóm tắt, Tài khoản (đổi vai trò, khoá / mở khoá, đặt lại mật khẩu) | `GET /roles`, `GET /employees`, `PUT /employees/:username` | **Đã nối**; BE sửa kèm: khoá luôn ghi `locked_at`, đổi mật khẩu tăng `session_version` |
| Cài đặt › Phân quyền: ma trận vai trò, tạo / ngừng vai trò | — | Chưa có API (mục 3.7; trái quyết định chỉ 2 vai trò) |
| Tổng quan | — | Chưa có API (mục 3.5) |
| Cài đặt: tham số, chế độ, công thức lương, KPI, xử lý yêu cầu | đang gọi `/settings/params` (V1) | Chưa có API (mục 3.7) |
| App nhân viên `/nv/*` (Hôm nay + Check-in/out, Chấm công tháng, chi tiết ngày, Yêu cầu, Thu nhập chính thức/tạm tính, Tôi) | **mới:** `/api/v2/me/{profile,today,punches,attendance,attendance/:date,requests,requests/:id,requests/:kind,requests/:id/cancel,income,kpi/self}` | **Đã nối** (mục 3.1 đã làm) |
| `/nv-may-tinh` (màn nhân viên trên máy tính) | còn dựng trên V1 (`/sheet`, `/punch`, `PUT /sheet`) | Chế độ `api` chuyển sang `/nv/hom-nay`; dựng lại màn máy tính trên `/me` là việc riêng |

Nút mới thêm cho API có sẵn: **"Thêm các ngày lễ cố định"** (Lịch → `POST /holidays/quick-add`), **"Tính lương / Tính lại lương"** (Bảng lương → `POST /payroll/:month/calculate`), **"Chốt công"** (thanh kỳ lương, cần `attendance.lock` → `POST /system/periods/:month/lock`).

API BE có sẵn mà FE **chưa có màn / biểu mẫu** để dùng: `POST /employees` (thêm nhân sự), `DELETE /employees/:username` (cho thôi việc), `POST /requests/*` và `PATCH /requests/:id/cancel` (Admin nộp / huỷ thay nhân viên), `GET /requests/isat/conditions`, `POST /attendance/punches` + `/recalculate` (Admin chấm thay, tính lại công), `GET/PUT /system/settings` (khoá–giá trị thô). Các mục này cần thiết kế biểu mẫu mới (theo design system GFT) nên tách thành spec giao diện riêng; nối theo cùng cách (`web/src/builders/api/*`).

## 2. Thứ tự đề xuất

1. **Nhóm "của tôi" `/api/v2/me/*`** (mục 3.1): mở khoá app nhân viên — mục tiêu đã chốt của đợt nối FE–BE.
2. **Hiệu năng & đúng nghĩa** cho các màn đã nối: lọc theo tháng và duyệt hàng loạt ở BE (3.2), API gộp cho Chấm công (3.4) — hiện FE đọc toàn bộ đơn / bảng công rồi gộp tại chỗ, ổn với vài chục người nhưng không cho vài trăm.
3. **Duyệt phiếu, chốt kỳ** (3.3), **mở lại kỳ** (3.6), **Tổng quan** (3.5).
4. **Cài đặt** (3.7): khối lượng lớn nhất, làm sau cùng; tách nhiều spec nhỏ.
5. Song song: **spec vận hành** (migration runner, secret bắt buộc, sao lưu) — chặn ngày dùng thật.

Mỗi mục là một spec → plan riêng. Mục 3.1 có đủ chi tiết để viết plan ngay khi được duyệt.

## 3. Thiết kế từng nhóm

### 3.1 Nhóm "của tôi" — `@Authenticated()`, danh tính chỉ lấy từ `req.user`

Không route nào trong nhóm nhận `employeeId` / `username` từ client. Module mới `src/modules/me/` (controller mỏng) gọi lại service sẵn có của attendance, requests, payroll, employees.

| Route | Trả về | Dùng cho |
|---|---|---|
| `GET /api/v2/me/today` | `{ date, shift: { type, start, end }, punches: { in, out }, workedMinutes, geofence: { required, ok }, week: DaySummary[7], alert: { date, kind } \| null }` | J1 Hôm nay, `/nv-may-tinh` |
| `POST /api/v2/me/punches` | body `{ kind: 'IN'\|'OUT', lat, lng, accuracyM }` → `{ punch, today }` | Check-in / Check-out |
| `GET /api/v2/me/attendance?month=` | `{ month, periodState, shift, totals: { workDays, standardDays, lateCount, paidLeaveDays }, days: DaySummary[] }` | J2 Chấm công |
| `GET /api/v2/me/attendance/:date` | `{ date, kind, in, out, lateMinutes, leave, claim }` | J3 chi tiết ngày |
| `GET /api/v2/me/requests?status=` | `{ counts, items: RequestDTO[] }` | J4 Yêu cầu |
| `GET /api/v2/me/requests/:id` | `{ request: RequestDTO, steps: { label, at, state }[] }` | J5 chi tiết |
| `POST /api/v2/me/requests/{leave,overtime,advance,explanation,isat,shift-change}` | như route admin hiện có nhưng `employeeId = req.user.username` | Nộp đơn |
| `PATCH /api/v2/me/requests/:id/cancel` | chỉ huỷ đơn của mình, còn `PENDING` | Huỷ đơn |
| `GET /api/v2/me/income?month=` | `{ month, state: 'estimate'\|'official', payslip: EmployeePayslipDTO }` — phiếu đã chốt nếu có, không thì tính tạm (không lưu) | J6 Thu nhập |
| `PUT /api/v2/me/kpi/self?month=` | body `{ score }` → điểm tự đánh giá | KPI tự chấm (`/nv-may-tinh`) |
| `GET /api/v2/me/profile` | `{ name, username, contract, position, shift, leave: { total, used, remaining }, dependants }` | J7 Tôi |

`DaySummary = { date, kind: 'work'\|'late'\|'leave'\|'absent'\|'todo'\|'off'\|'future', in, out, lateMinutes }`.

Cần thêm ở BE: `PayrollService.estimate(username, month)` (tính phiếu tạm không ghi `payroll_runs`); `AttendanceService.monthSummary(username, month)`; lịch sử các bước duyệt của đơn (đọc `reviewed_by/at` sẵn có, thêm `created_at` làm bước "Đã gửi").

Test bắt buộc: một nhân viên không đọc được dữ liệu người khác qua bất kỳ route `/me/*` nào (body hay query có `employeeId` lạ bị bỏ qua); huỷ đơn của người khác → 404.

### 3.2 Yêu cầu, giải trình, tạm ứng (Admin) — `requests.review`

FE hiện gọi ba nguồn V1 (`/approvals` theo từng ngày tự khai có `rev/fingerprint`, `/explanations`, `/advance-approvals`). BE v2 đã gộp mọi thứ thành `system_requests`. Đề xuất **đổi FE theo BE**, không dựng lại API V1:

- Mở rộng `GET /api/v2/requests` thêm `month=YYYY-MM` (lọc theo ngày áp dụng của đơn), `q=` (tên/tên đăng nhập), trả thêm `counts: { pending, approved, rejected }` cho cả tháng.
- `PATCH /api/v2/requests/review` (hàng loạt): body `{ action, note?, ids: string[] }`, một transaction, trả `{ decided }`; đơn nào không còn `PENDING` thì từ chối cả loạt với `409 REQUEST_STALE` (thay `rev/fingerprint` của V1).
- FE: viết `web/src/builders/api/requests.ts` dựng dòng `RequestTable` từ `RequestDTO`; bỏ ba service V1.

### 3.3 Phiếu lương chi tiết, KPI trong phiếu, duyệt phiếu — `payroll.calculate` / `payroll.approve`

- `GET /api/v2/payroll/:month/:username` đã có, nhưng ngăn kéo cần thêm: lịch ngày công theo ngày (`dailyLines` đã có trong `details` — chỉ cần FE dựng), lịch sử sửa KPI (`kpi_score_log` có sẵn) → thêm `kpiHistory: { at, actor, part, from, to }[]` vào phản hồi.
- `PUT /payroll/:month/kpi/:username` đã có; thêm `?recalculate=1` để trả luôn phiếu tính lại (FE bỏ bản tính tại chỗ `mock/payroll-calc`).
- Mới: `POST /api/v2/payroll/:month/:username/decision` body `{ decision: 'approve'\|'reject', note? }` (`payroll.approve`) và `POST /api/v2/payroll/:month/finalize` chốt kỳ (`payroll.approve`), ghi `audit_log`.
- Bảng cả kỳ: thêm `periodRange`, `payday` (tham số), `previousNet` để FE hiện "so với tháng trước".

### 3.4 Chấm công Admin — `attendance.correct`

- `GET /api/v2/attendance/week?from=YYYY-MM-DD&q=&group=` → `{ days: string[7], rows: { username, name, days: DaySummary[7] }[], pending: { username, date, kind }[] }`.
- `GET /api/v2/attendance/employees/:username?month=` → `{ person, totals, days: DaySummary[], history: { at, actor, text }[] }`.
- `GET /api/v2/attendance/timesheets/:employeeId/:workDate` đã có — FE dùng cho hộp chi tiết ngày.
- Sửa giờ: `PUT /api/v2/attendance/timesheets/:username/:date` body `{ in, out, reason }` (ghi `audit_log`); hiện chỉ có `recalculate`.

### 3.5 Tổng quan — mọi năng lực đọc

`GET /api/v2/overview?month=` → `{ kpis: { headcount, presentToday, pendingRequests, payrollNet }, attendance: { today: counts by kind }, payroll: { status, lines: top N }, period: { month, state } }`. Gộp từ service sẵn có; không bảng mới.

### 3.6 Kỳ lương — `config.read` / `attendance.lock`

`GET /api/v2/system/periods/:month` → `{ month, status, steps: { key, label, done, at, by }[] }` (các bước: mở kỳ, chốt công, tính lương, duyệt, chốt kỳ) để dựng thanh kỳ lương; `POST /periods/:month/lock` đã có, thêm `POST /periods/:month/unlock` (`attendance.lock`, bắt buộc `reason`).

### 3.7 Cài đặt — tách nhiều spec

| Màn | API cần | Ghi chú |
|---|---|---|
| Tham số, chế độ, công thức lương, KPI | `GET/PUT /api/v2/params?group=` có phiên bản (`param_versions` có sẵn), `POST /params/preview`, `POST /params/revert` | lớn nhất; phải theo luật lương đã chốt, hỏi nguồn (spec/, app tham chiếu) khi mâu thuẫn |
| Chức vụ & bậc | `GET/PUT /api/v2/positions`, `PUT /positions/:code/levels` | bảng `position_types/levels` có sẵn |
| Ca làm, vùng chấm công | `GET/PUT /api/v2/shifts`, `GET/PUT /api/v2/geofence` | bảng `work_shifts`, tham số geofence |
| Phân quyền | `GET/POST/PUT /api/v2/roles`, `PUT /employees/:username/roles` | chỉ khi bỏ quyết định D3 (chỉ admin/staff); cần bảng vai trò → năng lực trong DB |
| Tài khoản | `POST /api/v2/employees/:username/lock`, `/unlock`, `/reset-password` (tăng `session_version`) | dùng ngay được với 2 vai trò |

## 4. Rủi ro ghi nhận khi nối

- `EmployeesRepository.toRow` luôn ghi `payroll_subject: 1`: sửa trước khi nối màn sửa hồ sơ.
- Các controller bọc mọi lỗi thành `400 err.message`: sửa ở spec 3.1 cho route mới (lỗi nghiệp vụ có `code`, lỗi lạ đi `500`).
- `GET /requests` không có `month`: chuông hiện đọc tối đa 200 đơn chờ; quá 200 thì số trên chuông đúng (đọc `total`) nhưng danh sách thiếu.
- Nhật ký: BE không lọc và không đếm tổng; với nhật ký dài, bộ lọc của màn chỉ đúng trong trang.
