# Route của giao diện Vue

> Sinh tự động bởi `scripts/docs/gen-spec.ts` (`npm run spec:gen`) từ `web/src/router/index.ts` và `web/src/router/routes/*.ts`. Đừng sửa tay: `test/unit/spec-reference.test.ts` so sánh file này với bản dựng từ mã.

Giao diện duy nhất là ứng dụng Vue 3 ở `web/` (máy chủ phục vụ `web/dist`; mọi đường dẫn không có đuôi file trả `index.html`, router Vue xử lý tiếp). Cột *khung* là `meta.layout` (`admin`, `phone`, `staffDesktop`, `blank`).

Số route: **38**.

| Đường dẫn | Màn / chuyển hướng | Khung | Tiêu đề | Khai báo |
| --- | --- | --- | --- | --- |
| `/` | chuyển hướng () => useSessionStore().home  | — | — | [`web/src/router/index.ts:20`](../../web/src/router/index.ts#L20) |
| `/thiet-ke` | [`web/src/views/DesignIndex.vue`](../../web/src/views/DesignIndex.vue) | `blank` | Mục lục thiết kế | [`web/src/router/index.ts:22`](../../web/src/router/index.ts#L22) |
| `/admin` | chuyển hướng '/admin/tong-quan' | — | — | [`web/src/router/index.ts:26`](../../web/src/router/index.ts#L26) |
| `/nhan-vien` | chuyển hướng () => (window.innerWidth <= PHONE_MAX ? '/nv/hom-nay' : '/nv-may-tinh') | — | — | [`web/src/router/index.ts:28`](../../web/src/router/index.ts#L28) |
| `/:pathMatch(.*)*` | [`web/src/views/NotFound.vue`](../../web/src/views/NotFound.vue) | `blank` | Không có trang này | [`web/src/router/index.ts:39`](../../web/src/router/index.ts#L39) |
| `/admin/cham-cong` | [`web/src/views/admin/attendance/AttendanceShell.vue`](../../web/src/views/admin/attendance/AttendanceShell.vue) | `admin` | Chấm công | [`web/src/router/routes/admin-attendance.ts:4`](../../web/src/router/routes/admin-attendance.ts#L4) |
| `bang-cong` | — | — | — | [`web/src/router/routes/admin-attendance.ts:9`](../../web/src/router/routes/admin-attendance.ts#L9) |
| `hom-nay` | — | — | — | [`web/src/router/routes/admin-attendance.ts:11`](../../web/src/router/routes/admin-attendance.ts#L11) |
| `sua-gio` | — | — | — | [`web/src/router/routes/admin-attendance.ts:15`](../../web/src/router/routes/admin-attendance.ts#L15) |
| `gio-ot` | — | — | — | [`web/src/router/routes/admin-attendance.ts:19`](../../web/src/router/routes/admin-attendance.ts#L19) |
| `phep-con-lai` | — | — | — | [`web/src/router/routes/admin-attendance.ts:23`](../../web/src/router/routes/admin-attendance.ts#L23) |
| `ca-lam` | — | — | — | [`web/src/router/routes/admin-attendance.ts:27`](../../web/src/router/routes/admin-attendance.ts#L27) |
| `/admin/nhan-su` | [`web/src/views/admin/staff/StaffView.vue`](../../web/src/views/admin/staff/StaffView.vue) | `admin` | Nhân sự | [`web/src/router/routes/admin-attendance.ts:33`](../../web/src/router/routes/admin-attendance.ts#L33) |
| `/admin/kpi` | [`web/src/views/admin/kpi/KpiShell.vue`](../../web/src/views/admin/kpi/KpiShell.vue) | `admin` | Đánh giá KPI | [`web/src/router/routes/admin-attendance.ts:38`](../../web/src/router/routes/admin-attendance.ts#L38) |
| `lich-su` | [`web/src/views/admin/kpi/KpiHistoryView.vue`](../../web/src/views/admin/kpi/KpiHistoryView.vue) | — | Đánh giá KPI · Lịch sử sửa điểm | [`web/src/router/routes/admin-attendance.ts:44`](../../web/src/router/routes/admin-attendance.ts#L44) |
| `/admin/tong-quan` | [`web/src/views/admin/overview/OverviewView.vue`](../../web/src/views/admin/overview/OverviewView.vue) | `admin` | Tổng quan | [`web/src/router/routes/admin-main.ts:7`](../../web/src/router/routes/admin-main.ts#L7) |
| `/admin/yeu-cau` | [`web/src/views/admin/requests/RequestsView.vue`](../../web/src/views/admin/requests/RequestsView.vue) | `admin` | Yêu cầu | [`web/src/router/routes/admin-main.ts:12`](../../web/src/router/routes/admin-main.ts#L12) |
| `/admin/yeu-cau/moi-thang` | [`web/src/views/admin/requests/RequestsView.vue`](../../web/src/views/admin/requests/RequestsView.vue) | `admin` | Yêu cầu · Mọi tháng | [`web/src/router/routes/admin-main.ts:17`](../../web/src/router/routes/admin-main.ts#L17) |
| `/admin/bang-luong` | [`web/src/views/admin/payroll/PayrollView.vue`](../../web/src/views/admin/payroll/PayrollView.vue) | `admin` | Bảng lương | [`web/src/router/routes/admin-payroll.ts:5`](../../web/src/router/routes/admin-payroll.ts#L5) |
| `/admin/cai-dat` | [`web/src/views/admin/settings/PayFormulaView.vue`](../../web/src/views/admin/settings/PayFormulaView.vue) | — | — | [`web/src/router/routes/admin-settings.ts:7`](../../web/src/router/routes/admin-settings.ts#L7) |
| `/admin/cai-dat/che-do/:loai(chuyen-trach|nhan-vien)?` | [`web/src/views/admin/settings/BenefitsView.vue`](../../web/src/views/admin/settings/BenefitsView.vue) | — | — | [`web/src/router/routes/admin-settings.ts:12`](../../web/src/router/routes/admin-settings.ts#L12) |
| `/admin/cai-dat/chuc-vu-bac` | [`web/src/views/admin/settings/PositionsView.vue`](../../web/src/views/admin/settings/PositionsView.vue) | — | — | [`web/src/router/routes/admin-settings.ts:17`](../../web/src/router/routes/admin-settings.ts#L17) |
| `/admin/cai-dat/lich` | [`web/src/views/admin/settings/CalendarView.vue`](../../web/src/views/admin/settings/CalendarView.vue) | — | — | [`web/src/router/routes/admin-settings.ts:22`](../../web/src/router/routes/admin-settings.ts#L22) |
| `/admin/cai-dat/kpi` | [`web/src/views/admin/settings/KpiRulesView.vue`](../../web/src/views/admin/settings/KpiRulesView.vue) | — | — | [`web/src/router/routes/admin-settings.ts:27`](../../web/src/router/routes/admin-settings.ts#L27) |
| `/admin/cai-dat/phan-quyen` | [`web/src/views/admin/settings/PermRolesView.vue`](../../web/src/views/admin/settings/PermRolesView.vue) | — | — | [`web/src/router/routes/admin-settings.ts:32`](../../web/src/router/routes/admin-settings.ts#L32) |
| `/admin/cai-dat/phan-quyen/tai-khoan` | [`web/src/views/admin/settings/PermAccountsView.vue`](../../web/src/views/admin/settings/PermAccountsView.vue) | — | — | [`web/src/router/routes/admin-settings.ts:37`](../../web/src/router/routes/admin-settings.ts#L37) |
| `/admin/cai-dat/phan-quyen/xu-ly-yeu-cau` | [`web/src/views/admin/settings/PermRulesView.vue`](../../web/src/views/admin/settings/PermRulesView.vue) | — | — | [`web/src/router/routes/admin-settings.ts:42`](../../web/src/router/routes/admin-settings.ts#L42) |
| `/admin/cai-dat/nhat-ky` | [`web/src/views/admin/settings/AuditLogView.vue`](../../web/src/views/admin/settings/AuditLogView.vue) | — | — | [`web/src/router/routes/admin-settings.ts:47`](../../web/src/router/routes/admin-settings.ts#L47) |
| `/admin/cai-dat/tat-ca` | [`web/src/views/admin/settings/AllSettingsView.vue`](../../web/src/views/admin/settings/AllSettingsView.vue) | — | — | [`web/src/router/routes/admin-settings.ts:52`](../../web/src/router/routes/admin-settings.ts#L52) |
| `/in/phieu-luong/:month/:username` | [`web/src/views/print/PayslipPrint.vue`](../../web/src/views/print/PayslipPrint.vue) | `blank` | Phiếu lương A4 | [`web/src/router/routes/payslip.ts:7`](../../web/src/router/routes/payslip.ts#L7) |
| `/in/phieu-luong/:month` | [`web/src/views/print/PayslipPrint.vue`](../../web/src/views/print/PayslipPrint.vue) | `blank` | In tất cả phiếu lương | [`web/src/router/routes/payslip.ts:13`](../../web/src/router/routes/payslip.ts#L13) |
| `/nv-may-tinh` | [`web/src/views/staff-desktop/StaffHome.vue`](../../web/src/views/staff-desktop/StaffHome.vue) | `staffDesktop` | Nhân viên | [`web/src/router/routes/staff-desktop.ts:5`](../../web/src/router/routes/staff-desktop.ts#L5) |
| `/dang-nhap` | [`web/src/views/auth/LoginView.vue`](../../web/src/views/auth/LoginView.vue) | `blank` | Đăng nhập | [`web/src/router/routes/staff-desktop.ts:10`](../../web/src/router/routes/staff-desktop.ts#L10) |
| `/nv/hom-nay` | [`web/src/views/staff-phone/HomeView.vue`](../../web/src/views/staff-phone/HomeView.vue) | — | — | [`web/src/router/routes/staff-phone.ts:7`](../../web/src/router/routes/staff-phone.ts#L7) |
| `/nv/cham-cong` | [`web/src/views/staff-phone/AttendanceView.vue`](../../web/src/views/staff-phone/AttendanceView.vue) | — | — | [`web/src/router/routes/staff-phone.ts:13`](../../web/src/router/routes/staff-phone.ts#L13) |
| `/nv/yeu-cau` | [`web/src/views/staff-phone/RequestsView.vue`](../../web/src/views/staff-phone/RequestsView.vue) | — | — | [`web/src/router/routes/staff-phone.ts:19`](../../web/src/router/routes/staff-phone.ts#L19) |
| `/nv/thu-nhap` | [`web/src/views/staff-phone/IncomeView.vue`](../../web/src/views/staff-phone/IncomeView.vue) | — | — | [`web/src/router/routes/staff-phone.ts:25`](../../web/src/router/routes/staff-phone.ts#L25) |
| `/nv/toi` | [`web/src/views/staff-phone/ProfileView.vue`](../../web/src/views/staff-phone/ProfileView.vue) | — | — | [`web/src/router/routes/staff-phone.ts:31`](../../web/src/router/routes/staff-phone.ts#L31) |
