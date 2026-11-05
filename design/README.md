# Thiết kế: Admin Dashboard Concept

Bản sao 45 artboard từ design board "Admin Dashboard Concept" (https://claude.ai/artifact/6ro7y3NXoqxGWHfVsBr1Hd), bản 1793895031-a57b, lấy ngày 05/11/2026.

- `*.dc.html`: mỗi file một artboard. File cần runtime của Design (`support.js`, font và ảnh `/_blob/...`), nên mở trực tiếp sẽ thiếu font, ảnh và phần tương tác.
- `canvas.json`: vị trí, tên và ghi chú các đợt trên board.
- `ds/gft-ai-cb/tokens.json`: màu, chữ, khoảng cách của design system GFT AI C&B.

| File | Khổ | Nội dung |
|---|---|---|
| [Main.dc.html](Main.dc.html) | 1440×1400 | A · Thanh bên tối (đen–vàng GFT) |
| [SidebarLight.dc.html](SidebarLight.dc.html) | 1440×1400 | B · Thanh bên sáng (sát ảnh mẫu) |
| [BellInbox.dc.html](BellInbox.dc.html) | 1440×1400 | C · Chuông theo mẫu: 3 tab Tất cả · Cần duyệt · Hệ thống; trong danh sách các loại tách bằng tiêu đề nhóm; chấm xanh là tin mới; cao tối đa 680px. Từ chối phải ghi lý do cho nhân viên |
| [BellAdvance.dc.html](BellAdvance.dc.html) | 1440×1400 | C2 · Chuông ở tab Cần duyệt, mở đơn tạm ứng: số tiền được ứng = 80% lương ngày công 01–15, cố định, không ai chỉnh được; Admin chỉ duyệt hoặc từ chối |
| [BellSystem.dc.html](BellSystem.dc.html) | 1440×1400 | C3 · Chuông ở tab Hệ thống: tin chỉ để đọc, khung chi tiết có link tới đúng chỗ liên quan, không có nút duyệt |
| [AttendanceWeek.dc.html](AttendanceWeek.dc.html) | 1440×1100 | E · Chấm công · Tuần (kéo ngang; cột tên và Công/Trễ/OT đứng yên) |
| [AttendanceEmployee.dc.html](AttendanceEmployee.dc.html) | 1440×1290 | F · Hồ sơ chấm công một người (bấm tên ở E) |
| [Payroll.dc.html](Payroll.dc.html) | 1440×1240 | G · Bảng lương tháng (đã gộp KPI): kéo ngang các khoản, cột tên và Thực nhận/Trạng thái đứng yên |
| [Payslip.dc.html](Payslip.dc.html) | 1440×1400 | H · Phiếu lương một người theo mẫu phiếu GFT: tổng hợp lương, phụ cấp từng loại, nhập điểm KPI ngay trong phiếu |
| [Staff.dc.html](Staff.dc.html) | 1440×1200 | I · Nhân sự theo ảnh mẫu: mỗi ô một giá trị; tìm tên/mã/email, lọc chưa kích hoạt, chọn nhiều người |
| [StaffDetail.dc.html](StaffDetail.dc.html) | 1440×1200 | I2 · Hồ sơ một người (bấm tên Hoàng Thị Mai ở I): lý do tạm nghỉ, bậc, ca, hợp đồng nằm ở đây |
| [PhoneHome.dc.html](PhoneHome.dc.html) | 390×1060 | J1 · Hôm nay: ca đang làm và nút Check-out, tuần này, thu nhập tạm tính, yêu cầu gần đây |
| [PhoneAttendance.dc.html](PhoneAttendance.dc.html) | 390×1180 | J2 · Chấm công: lịch tháng tô theo nhóm màu của Admin; bấm một ngày để xem |
| [PhoneDay.dc.html](PhoneDay.dc.html) | 390×844 | J3 · Một ngày (bấm 27/10 ở J2): giờ vào, giờ ra, giải trình đã gửi |
| [PhoneRequests.dc.html](PhoneRequests.dc.html) | 390×844 | J4 · Yêu cầu của tôi: lọc theo trạng thái. Nút Tạo yêu cầu mở J8 (Đợt 9); dòng Khai giờ vào 09/09 (Từ chối) mở J5b |
| [PhoneRequest.dc.html](PhoneRequest.dc.html) | 390×844 | J5 · Một yêu cầu (bấm Phép năm 12/10 ở J4): hình thức, lý do, các bước duyệt |
| [PhoneIncome.dc.html](PhoneIncome.dc.html) | 390×1320 | J6 · Thu nhập: thực nhận dự kiến, KPI 5 phần, các khoản |
| [PhoneMe.dc.html](PhoneMe.dc.html) | 390×980 | J7 · Tôi: hồ sơ do Admin quản lý, đổi mật khẩu, đăng xuất |
| [StaffDesktop.dc.html](StaffDesktop.dc.html) | 1440×1210 | K1 · Nhân viên trên máy tính (từ 1136px): một trang ghép J1–J7, ba cột cao bằng nhau (Hôm nay + Yêu cầu / Chấm công / Thu nhập); Tôi nằm ở menu avatar |
| [StaffDesktopDay.dc.html](StaffDesktopDay.dc.html) | 1440×900 | K2 · Bấm ngày 27/10 ở K1: chi tiết ngày mở ngăn kéo bên phải (nội dung giống J3) |
| [PhoneNewRequest.dc.html](PhoneNewRequest.dc.html) | 390×844 | J8 · Tạo yêu cầu, bước 1 (bấm Tạo yêu cầu ở J4): chọn loại, mỗi dòng mở form của nó (J9, J14–J18). Tạm ứng khoá ngoài ngày 16–17; đổi Hôm nay sang 16/10 trong Tweaks để mở |
| [PhoneNewLeave.dc.html](PhoneNewLeave.dc.html) | 390×844 | J9 · Bước 2 · Đơn nghỉ: hình thức, từ ngày – đến ngày, lý do. Máy tự đếm ngày làm việc; đổi Hình thức để thấy dòng số dư phép |
| [PhoneRequestSent.dc.html](PhoneRequestSent.dc.html) | 390×844 | J10 · Gửi xong: tấm đóng, báo đã gửi, đơn mới Chờ duyệt ở đầu danh sách J4 |
| [StaffDesktopNewRequest.dc.html](StaffDesktopNewRequest.dc.html) | 1440×900 | K3 · Máy tính: Tạo yêu cầu ở K1 mở ngăn kéo phải, hai bước như J8–J9 (bấm ‹ để xem bước chọn loại) |
| [PhoneRequestRejected.dc.html](PhoneRequestRejected.dc.html) | 390×844 | J5b · Yêu cầu bị từ chối (bấm Khai giờ vào 09/09 ở J4): lý do từ chối của Admin nằm ngay dưới bước từ chối |
| [StaffDesktopRequest.dc.html](StaffDesktopRequest.dc.html) | 1440×900 | K3b · Máy tính: bấm Khai giờ vào 09/09 ở K1, cùng nội dung J5b trong ngăn kéo phải |
| [OverviewApprove.dc.html](OverviewApprove.dc.html) | 1440×1400 | L1 · Bấm một dòng ở thẻ Việc cần duyệt (A), ví dụ Bùi Quốc Huy: cửa sổ phê duyệt mở ngay trên Tổng quan, cùng nội dung thẻ chi tiết của chuông. Từ chối phải ghi lý do |
| [AttendancePending.dc.html](AttendancePending.dc.html) | 1440×1100 | L2 · Chấm công · tab Cần xử lý: danh sách gọn bên trái (xếp theo ngày), chi tiết và nút xử lý bên phải; bấm dòng để đổi, xử lý xong tự sang việc kế |
| [SettingsPay.dc.html](SettingsPay.dc.html) | 1440×900 | M1 · Cài đặt › Cách tính lương: 6 khoản, khoản khác mặc định có • Đã chỉnh; ngăn Tiền làm thêm giờ đang sửa ngày thường ×1.6 |
| [SettingsPayConfirm.dc.html](SettingsPayConfirm.dc.html) | 1440×900 | M2 · Bấm Lưu ở M1: hộp xác nhận liệt kê thay đổi (OT ngày thường ×1.5 → ×1.6, áp dụng từ tháng 11/2026), thay cho Xem trước |
| [SettingsPayKpi.dc.html](SettingsPayKpi.dc.html) | 1440×1300 | M3 · Ngăn Lương KPI: 5 trọng số, tổng 98/100 nên Lưu bị khoá |
| [SettingsAll.dc.html](SettingsAll.dc.html) | 1440×1440 | M4 · Tất cả cài đặt: nhóm Thuế có biểu thuế 5 bậc, lịch sử và Hoàn tác từng mục; bỏ dải vàng và lọc Chưa xác nhận |
| [SettingsCalendar.dc.html](SettingsCalendar.dc.html) | 1440×2080 | M5 · Lịch, ca & chấm công: ngày trả lương 1–28 theo tháng, 6 ca chỉ xem, vùng chấm công lưu là áp dụng ngay |
| [StaffWorkWeek.dc.html](StaffWorkWeek.dc.html) | 1440×1200 | N1 · Hồ sơ nhân sự: dòng Tuần làm việc; Sửa mở hộp chọn T2…T7 hoặc Theo loại nhân sự, công chuẩn tự tính (bấm thử được) |
| [PhoneCheckinFar.dc.html](PhoneCheckinFar.dc.html) | 390×1060 | J11 · Hôm nay: ngoài vùng chấm công, nút Check-in khoá, hiện cách văn phòng 600 m |
| [PhoneCheckinNoLocation.dc.html](PhoneCheckinNoLocation.dc.html) | 390×1060 | J12 · Hôm nay: không lấy được vị trí, nút Check-in khoá |
| [PhoneCheckinOffDay.dc.html](PhoneCheckinOffDay.dc.html) | 390×1060 | J13 · Hôm nay: thứ Bảy không phải ngày làm (tuần T2–T6), nút Check-in khoá; ngày ngoài tuần hiện nghỉ |
| [PhoneNewMakeup.dc.html](PhoneNewMakeup.dc.html) | 390×844 | J14 · Nghỉ có làm bù: nghỉ 02/11, xếp khung bù sau ngày nghỉ cuối và trong tháng 11; đủ 8 / 8 giờ mới gửi được (thêm, bỏ, đổi giờ để thử) |
| [PhoneNewOT.dc.html](PhoneNewOT.dc.html) | 390×844 | J15 · Làm thêm giờ: giờ tròn ngoài ca, cách ca 1 giờ, không qua 22h; dòng Đã đăng ký tháng 10: 9 / 40 giờ |
| [PhoneNewShift.dc.html](PhoneNewShift.dc.html) | 390×844 | J16 · Đổi ca: chọn 1 trong 6 khung; ngày đang nghỉ trong khoảng giữ nguyên là ngày nghỉ |
| [PhoneNewExplain.dc.html](PhoneNewExplain.dc.html) | 390×844 | J17 · Giải trình: chỉ ngày máy báo; trường hợp máy tự điền; ô giờ theo trường hợp (đổi sang 09/10 để thấy Vào muộn, không có ô giờ) |
| [PhoneNewAdvance.dc.html](PhoneNewAdvance.dc.html) | 390×844 | J18 · Tạm ứng ngày 16/10: không ô số tiền, không ô lý do; số tiền do máy tính, Admin chỉ duyệt hoặc từ chối |
| [PhoneRequestCancel.dc.html](PhoneRequestCancel.dc.html) | 390×844 | J19 · Huỷ đơn đang chờ duyệt: hỏi lại Huỷ đơn này?, rồi chuyển Đã huỷ và trả lại các ngày (bấm thử) |
| [PayslipA4Page1.dc.html](PayslipA4Page1.dc.html) | 794×1123 | P1 · Trang 1 · Chấm công: mỗi ngày một dòng, hiện rõ OT, làm bù, từng loại nghỉ |
| [PayslipA4Page2.dc.html](PayslipA4Page2.dc.html) | 794×1123 | P2 · Trang 2 · Các khoản: lương cơ bản, nghỉ, OT, phụ cấp, KPI, bảo hiểm, thuế, Thực nhận, chữ ký |
