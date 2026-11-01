# Route của giao diện Vue

> Sinh tự động bởi `scripts/docs/gen-spec.ts` (`npm run spec:gen`) từ `web/src/router/index.js` và `web/src/router/routes/*.js`. Đừng sửa tay: `test/unit/spec-reference.test.js` so sánh file này với bản dựng từ mã.

Giao diện duy nhất là ứng dụng Vue 3 ở `web/` (máy chủ phục vụ `web/dist`; mọi đường dẫn không có đuôi file trả `index.html`, router Vue xử lý tiếp). Cột *khung* là `meta.layout` (`admin`, `phone`, `staffDesktop`, `blank`).

Số route: **40**.

| Đường dẫn | Màn / chuyển hướng | Khung | Tiêu đề | Khai báo |
| --- | --- | --- | --- | --- |
| `/` | chuyển hướng () => useSessionStore().home  | — | — | [`web/src/router/index.js:20`](../../web/src/router/index.js#L20) |
| `/thiet-ke` | [`web/src/views/DesignIndex.vue`](../../web/src/views/DesignIndex.vue) | `blank` | Mục lục thiết kế | [`web/src/router/index.js:22`](../../web/src/router/index.js#L22) |
| `/admin` | chuyển hướng '/admin/tong-quan' | — | — | [`web/src/router/index.js:26`](../../web/src/router/index.js#L26) |
| `/nhan-vien` | chuyển hướng () => (window.innerWidth <= PHONE_MAX ? '/nv/hom-nay' : '/nv-may-tinh') | — | — | [`web/src/router/index.js:28`](../../web/src/router/index.js#L28) |
| `/:pathMatch(.*)*` | [`web/src/views/NotFound.vue`](../../web/src/views/NotFound.vue) | `blank` | Không có trang này | [`web/src/router/index.js:39`](../../web/src/router/index.js#L39) |
| `/admin/cham-cong` | [`web/src/views/admin/attendance/AttendanceShell.vue`](../../web/src/views/admin/attendance/AttendanceShell.vue) | `admin` | Chấm công & phép | [`web/src/router/routes/admin-attendance.js:4`](../../web/src/router/routes/admin-attendance.js#L4) |
| `bang-cong` | — | — | — | [`web/src/router/routes/admin-attendance.js:9`](../../web/src/router/routes/admin-attendance.js#L9) |
| `hom-nay` | [`web/src/views/admin/attendance/TodayView.vue`](../../web/src/views/admin/attendance/TodayView.vue) | — | Chấm công · Hôm nay | [`web/src/router/routes/admin-attendance.js:11`](../../web/src/router/routes/admin-attendance.js#L11) |
| `sua-gio` | [`web/src/views/admin/attendance/EditRequestsView.vue`](../../web/src/views/admin/attendance/EditRequestsView.vue) | — | Chấm công · Sửa giờ | [`web/src/router/routes/admin-attendance.js:16`](../../web/src/router/routes/admin-attendance.js#L16) |
| `gio-ot` | [`web/src/views/admin/attendance/OvertimeView.vue`](../../web/src/views/admin/attendance/OvertimeView.vue) | — | Chấm công · Giờ OT | [`web/src/router/routes/admin-attendance.js:21`](../../web/src/router/routes/admin-attendance.js#L21) |
| `phep-con-lai` | [`web/src/views/admin/attendance/LeaveView.vue`](../../web/src/views/admin/attendance/LeaveView.vue) | — | Chấm công · Phép còn lại | [`web/src/router/routes/admin-attendance.js:26`](../../web/src/router/routes/admin-attendance.js#L26) |
| `ca-lam` | [`web/src/views/admin/attendance/ShiftsView.vue`](../../web/src/views/admin/attendance/ShiftsView.vue) | — | Chấm công · Ca làm | [`web/src/router/routes/admin-attendance.js:31`](../../web/src/router/routes/admin-attendance.js#L31) |
| `/admin/nhan-su` | [`web/src/views/admin/staff/StaffView.vue`](../../web/src/views/admin/staff/StaffView.vue) | `admin` | Nhân sự | [`web/src/router/routes/admin-attendance.js:38`](../../web/src/router/routes/admin-attendance.js#L38) |
| `/admin/kpi` | [`web/src/views/admin/kpi/KpiShell.vue`](../../web/src/views/admin/kpi/KpiShell.vue) | `admin` | Đánh giá KPI | [`web/src/router/routes/admin-attendance.js:43`](../../web/src/router/routes/admin-attendance.js#L43) |
| `lich-su` | [`web/src/views/admin/kpi/KpiHistoryView.vue`](../../web/src/views/admin/kpi/KpiHistoryView.vue) | — | Đánh giá KPI · Lịch sử sửa điểm | [`web/src/router/routes/admin-attendance.js:49`](../../web/src/router/routes/admin-attendance.js#L49) |
| `/admin/tong-quan` | [`web/src/views/admin/overview/OverviewView.vue`](../../web/src/views/admin/overview/OverviewView.vue) | `admin` | Tổng quan | [`web/src/router/routes/admin-main.js:8`](../../web/src/router/routes/admin-main.js#L8) |
| `/admin/yeu-cau` | [`web/src/views/admin/requests/RequestsView.vue`](../../web/src/views/admin/requests/RequestsView.vue) | `admin` | Yêu cầu | [`web/src/router/routes/admin-main.js:13`](../../web/src/router/routes/admin-main.js#L13) |
| `/admin/yeu-cau/moi-thang` | [`web/src/views/admin/requests/RequestsView.vue`](../../web/src/views/admin/requests/RequestsView.vue) | `admin` | Yêu cầu · Mọi tháng | [`web/src/router/routes/admin-main.js:18`](../../web/src/router/routes/admin-main.js#L18) |
| `/admin/tro-ly-ai` | [`web/src/views/admin/assistant/AssistantView.vue`](../../web/src/views/admin/assistant/AssistantView.vue) | `admin` | Trợ lý AI | [`web/src/router/routes/admin-main.js:23`](../../web/src/router/routes/admin-main.js#L23) |
| `/admin/bang-luong` | [`web/src/views/admin/payroll/PayrollView.vue`](../../web/src/views/admin/payroll/PayrollView.vue) | `admin` | Bảng lương | [`web/src/router/routes/admin-payroll.js:5`](../../web/src/router/routes/admin-payroll.js#L5) |
| `/admin/cai-dat` | [`web/src/views/admin/settings/PayFormulaView.vue`](../../web/src/views/admin/settings/PayFormulaView.vue) | — | — | [`web/src/router/routes/admin-settings.js:7`](../../web/src/router/routes/admin-settings.js#L7) |
| `/admin/cai-dat/che-do/:loai(chuyen-trach|nhan-vien)?` | [`web/src/views/admin/settings/BenefitsView.vue`](../../web/src/views/admin/settings/BenefitsView.vue) | — | — | [`web/src/router/routes/admin-settings.js:12`](../../web/src/router/routes/admin-settings.js#L12) |
| `/admin/cai-dat/chuc-vu-bac` | [`web/src/views/admin/settings/PositionsView.vue`](../../web/src/views/admin/settings/PositionsView.vue) | — | — | [`web/src/router/routes/admin-settings.js:17`](../../web/src/router/routes/admin-settings.js#L17) |
| `/admin/cai-dat/lich` | [`web/src/views/admin/settings/CalendarView.vue`](../../web/src/views/admin/settings/CalendarView.vue) | — | — | [`web/src/router/routes/admin-settings.js:22`](../../web/src/router/routes/admin-settings.js#L22) |
| `/admin/cai-dat/kpi` | [`web/src/views/admin/settings/KpiRulesView.vue`](../../web/src/views/admin/settings/KpiRulesView.vue) | — | — | [`web/src/router/routes/admin-settings.js:27`](../../web/src/router/routes/admin-settings.js#L27) |
| `/admin/cai-dat/canh-bao` | [`web/src/views/admin/settings/AlertsView.vue`](../../web/src/views/admin/settings/AlertsView.vue) | — | — | [`web/src/router/routes/admin-settings.js:32`](../../web/src/router/routes/admin-settings.js#L32) |
| `/admin/cai-dat/phan-quyen` | [`web/src/views/admin/settings/PermRolesView.vue`](../../web/src/views/admin/settings/PermRolesView.vue) | — | — | [`web/src/router/routes/admin-settings.js:37`](../../web/src/router/routes/admin-settings.js#L37) |
| `/admin/cai-dat/phan-quyen/tai-khoan` | [`web/src/views/admin/settings/PermAccountsView.vue`](../../web/src/views/admin/settings/PermAccountsView.vue) | — | — | [`web/src/router/routes/admin-settings.js:42`](../../web/src/router/routes/admin-settings.js#L42) |
| `/admin/cai-dat/phan-quyen/xu-ly-yeu-cau` | [`web/src/views/admin/settings/PermRulesView.vue`](../../web/src/views/admin/settings/PermRulesView.vue) | — | — | [`web/src/router/routes/admin-settings.js:47`](../../web/src/router/routes/admin-settings.js#L47) |
| `/admin/cai-dat/nhat-ky` | [`web/src/views/admin/settings/AuditLogView.vue`](../../web/src/views/admin/settings/AuditLogView.vue) | — | — | [`web/src/router/routes/admin-settings.js:52`](../../web/src/router/routes/admin-settings.js#L52) |
| `/admin/cai-dat/tat-ca` | [`web/src/views/admin/settings/AllSettingsView.vue`](../../web/src/views/admin/settings/AllSettingsView.vue) | — | — | [`web/src/router/routes/admin-settings.js:57`](../../web/src/router/routes/admin-settings.js#L57) |
| `/in/phieu-luong/:month/:username` | [`web/src/views/print/PayslipPrint.vue`](../../web/src/views/print/PayslipPrint.vue) | `blank` | Phiếu lương A4 | [`web/src/router/routes/payslip.js:7`](../../web/src/router/routes/payslip.js#L7) |
| `/in/phieu-luong/:month` | [`web/src/views/print/PayslipPrint.vue`](../../web/src/views/print/PayslipPrint.vue) | `blank` | In tất cả phiếu lương | [`web/src/router/routes/payslip.js:13`](../../web/src/router/routes/payslip.js#L13) |
| `/nv-may-tinh` | [`web/src/views/staff-desktop/StaffHome.vue`](../../web/src/views/staff-desktop/StaffHome.vue) | `staffDesktop` | Nhân viên | [`web/src/router/routes/staff-desktop.js:5`](../../web/src/router/routes/staff-desktop.js#L5) |
| `/dang-nhap` | [`web/src/views/auth/LoginView.vue`](../../web/src/views/auth/LoginView.vue) | `blank` | Đăng nhập | [`web/src/router/routes/staff-desktop.js:10`](../../web/src/router/routes/staff-desktop.js#L10) |
| `/nv/hom-nay` | [`web/src/views/staff-phone/HomeView.vue`](../../web/src/views/staff-phone/HomeView.vue) | — | — | [`web/src/router/routes/staff-phone.js:7`](../../web/src/router/routes/staff-phone.js#L7) |
| `/nv/cham-cong` | [`web/src/views/staff-phone/AttendanceView.vue`](../../web/src/views/staff-phone/AttendanceView.vue) | — | — | [`web/src/router/routes/staff-phone.js:13`](../../web/src/router/routes/staff-phone.js#L13) |
| `/nv/yeu-cau` | [`web/src/views/staff-phone/RequestsView.vue`](../../web/src/views/staff-phone/RequestsView.vue) | — | — | [`web/src/router/routes/staff-phone.js:19`](../../web/src/router/routes/staff-phone.js#L19) |
| `/nv/thu-nhap` | [`web/src/views/staff-phone/IncomeView.vue`](../../web/src/views/staff-phone/IncomeView.vue) | — | — | [`web/src/router/routes/staff-phone.js:25`](../../web/src/router/routes/staff-phone.js#L25) |
| `/nv/toi` | [`web/src/views/staff-phone/ProfileView.vue`](../../web/src/views/staff-phone/ProfileView.vue) | — | — | [`web/src/router/routes/staff-phone.js:31`](../../web/src/router/routes/staff-phone.js#L31) |
