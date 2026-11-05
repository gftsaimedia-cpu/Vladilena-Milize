# Map 45 board design → route/view FE (2026-11-05)

Đối chiếu theo tên route, query và tên file (scout, chưa so nội dung từng board). Tổng: Đã có 39 · Lệch 1 · Chưa xác minh 5.

| Board | Route | Vue chính | Trạng thái |
|---|---|---|---|
| Main (A) | /admin/* | components/shell/AdminSidebar.vue | Đã có |
| SidebarLight (B) | — | AdminSidebar.vue | **Lệch**: không thấy biến thể thanh bên sáng |
| BellInbox / BellAdvance / BellSystem | ?hop=chuong | shell/BellDrawer.vue, BellDetail.vue | Đã có (80% tạm ứng chưa xác minh) |
| AttendanceWeek | /admin/cham-cong | admin/attendance/AttendanceWeekView.vue | Đã có |
| AttendanceEmployee | /admin/cham-cong/nhan-vien/:id | AttendanceEmployeeView.vue | Đã có |
| AttendancePending | /admin/cham-cong?xem=can-xu-ly | attendance/parts/PendingList.vue | Đã có |
| Payroll | /admin/bang-luong | admin/payroll/PayrollView.vue | Đã có |
| Payslip | /admin/bang-luong?phieu=id | payroll/payslip/PayslipDrawer.vue | Đã có |
| Staff / StaffDetail | /admin/nhan-su, ?nv=id | admin/staff/StaffView.vue, StaffDrawer.vue | Đã có |
| StaffWorkWeek | /admin/nhan-su?nv=id | staff/parts/WorkWeekDialog.vue | Đã có |
| OverviewApprove | /admin/tong-quan | overview/parts/ApprovalDialog.vue | Đã có |
| SettingsPay / SettingsPayKpi | /admin/cai-dat?hop=luong-ngay-cong / luong-kpi | settings/PayFormulaView.vue, pay/PayDrawer.vue | Đã có |
| SettingsPayConfirm | /admin/cai-dat | settings/fields/SaveConfirmDialog.vue | Chưa xác minh |
| SettingsAll / SettingsCalendar | /admin/cai-dat/tat-ca, /lich | AllSettingsView.vue, CalendarView.vue | Đã có |
| PhoneHome | /nv/hom-nay | staff-phone/HomeView.vue | Đã có |
| PhoneCheckinFar / NoLocation / OffDay | /nv/hom-nay | HomeView.vue | Chưa xác minh (trạng thái khoá check-in) |
| PhoneAttendance / PhoneDay | /nv/cham-cong, ?ngay= | AttendanceView.vue, DaySheet.vue | Đã có |
| PhoneRequests / PhoneRequest / Rejected / Cancel | /nv/yeu-cau, ?yc= | RequestsView.vue, RequestSheet.vue | Đã có |
| PhoneNewRequest + Leave/Makeup/OT/Shift/Explain/Advance | /nv/yeu-cau?tao= | views/staff-requests/*Form.vue | Đã có |
| PhoneRequestSent | /nv/yeu-cau | — | Chưa xác minh |
| PhoneIncome / PhoneMe | /nv/thu-nhap, /nv/toi | IncomeView.vue, ProfileView.vue | Đã có |
| StaffDesktop / Day / Request / NewRequest | /nv/* (≥1136px) | staff-desktop/StaffDesktopPage.vue, parts/SideDrawer.vue | Đã có |
| PayslipA4Page1 / Page2 | /in/phieu-luong/:month/:id | print/parts/A4Attendance.vue, A4Summary.vue | Đã có |
