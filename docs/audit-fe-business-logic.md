# Rà FE còn tự tính nghiệp vụ (06/11/2026)

Nguyên tắc: FE chỉ hiện dữ liệu, BE tính, DB lưu. Bảng dưới là các chỗ FE (không tính `mock/`) còn tự tính hoặc nhân bản luật của BE. `P` = `web/src/`. Mức rủi ro lệch: Cao / Vừa / Thấp. Tất cả đều loại A (cần chuyển sang BE); loại B (chỉ UX, giữ) ghi ở cuối.

| # | file:line | FE đang tính | BE đã có? | Rủi ro |
|---|---|---|---|---|
| 1 | P/constants/labels.ts:28; P/builders/api/payslip-a4.ts:137; P/views/admin/payroll/payslip/SlipKpi.vue:49 | Trọng số KPI 40/24/18/12/6 cứng, in lên phiếu A4 và hiện "(40%)" | Có: settings `kpiWeights` | Cao |
| 2 | P/services/admin-payroll.ts:73-77; P/views/admin/payroll/payslip/PayslipDrawer.vue:50; P/mock/payroll-calc.ts | Engine tính lại phiếu: công, KPI, BH 10,5%, thuế bậc, giảm trừ, 26 công (chỉ nhánh mock) | Có | Vừa |
| 3 | P/builders/api/payroll.ts:82-99; P/views/admin/payroll/parts/PayTiles.vue:29,36 | Cộng gross/BH/thuế/tạm ứng/net, deductions, netShare % | Một phần (có ở /overview, không có ở GET /payroll/:month) | Vừa |
| 4 | P/views/admin/payroll/parts/PayTable.vue:36-47 | Dòng tổng bảng lương cộng từng cột | Như mục 3 | Vừa |
| 5 | P/builders/api/payroll.ts:208; P/views/admin/payroll/payslip/SlipAttendance.vue:22 | `late.minutes` luôn rỗng nên hiện "Đi muộn 0 phút" | Thiếu số phút | Vừa |
| 6 | P/views/admin/payroll/payslip/SlipSummary.vue:26 | Ngưỡng "không quá 15 phút nên không trừ" cứng | Có: `lateGraceMinutes` | Vừa |
| 7 | P/views/admin/payroll/payslip/SlipSummary.vue:49,51 | "Quyết toán phép dư", "Nghỉ lễ hưởng lương" ghi cứng 0 | Có: `paidLeavePay`, `holidayPay`, `leaveSettlementPay` | Vừa |
| 8 | P/builders/api/staff-requests.ts:35,192; P/views/staff-requests/MakeupLeaveForm.vue:63,140,223 | 480 phút/ngày nợ bù, tự đếm required, chặn thêm khung | Có: `owedMinutes`, `makeupMinutesRequired` | Vừa |
| 9 | P/builders/api/staff-requests.ts:150-170 | Trần 12 giờ/ngày, tự trừ khung đã chọn | Có: `days[].hours` | Vừa |
| 10 | P/builders/api/staff-requests.ts:51-66,82-101,118-141,181,284-287 | Engine tự quyết ngày chọn được (nghỉ, bù, đổi ca, OT) | Có: `days[].workday/claim`, preview | Vừa |
| 11 | P/builders/api/staff-requests.ts:346-349; P/builders/api/settings-screens.ts:138,183 | Chữ "80% lương ngày công 01–15" cứng | Một phần: thiếu tỉ lệ | Vừa |
| 12 | P/builders/api/settings.ts:261-262; P/views/admin/staff/parts/WorkWeekDialog.vue:27 | Công chuẩn = round(n×52/12) | Có `standardWorkdays` nhưng chỉ sau khi lưu | Vừa |
| 13 | P/builders/api/staff.ts:56-60,98-114; P/builders/api/benefits.ts:118-126 | Đang làm, thâm niên, vào/nghỉ việc, delta, headcount theo loại | Chưa rõ | Vừa |
| 14 | P/builders/api/settings-screens.ts:93 | "Công chuẩn 22 (T2–T6) · 26 (T2–T7)" cứng | Có | Thấp |
| 15 | P/builders/api/check-in.ts:16-30 | Haversine so bán kính, khoá nút Check-in/out (BE phải chặn) | Có zone | Thấp |
| 16 | P/views/admin/payroll/PayrollView.vue:33; payslip/PayslipDrawer.vue:38 | Khoá Tính lương/Duyệt theo trạng thái kỳ | Có: 409 | Thấp |
| 17 | P/views/admin/payroll/payslip/SlipKpi.vue:35-41; P/mock/payroll-calc.ts:51-52 | FE cắt thập phân (72,5→72), mock làm tròn (→73): hai luật mâu thuẫn | Chưa rõ BE làm tròn thế nào | Thấp |
| 18 | P/builders/api/staff-phone.ts:311,326-327 | Tự tính giờ làm = out − in | Có `workedMinutes` | Thấp |
| 19 | P/builders/api/staff-phone.ts:381-391 | Khấu trừ = BH+thuế+tạm ứng | Một phần | Thấp |
| 20 | P/services/staff-phone.ts:36-38 | "Hôm nay", "Đang làm" lấy từ đồng hồ trình duyệt | Có `MeToday.date` | Thấp |
| 21 | P/services/admin-payroll.ts:21-24 → P/builders/api/payroll.ts:160 | Ngày tương lai/không lương theo ngày máy | Có `dailyLines` | Thấp |
| 22 | P/builders/api/staff-requests.ts:79-85,97-98; P/views/staff-requests/OvertimeForm.vue:38 | Trừ 40 giờ: `otCapMinutes − otMinutes` | Có | Thấp |
| 23 | P/builders/api/staff-requests.ts:284-287,299-304 | Đếm ngày làm để ghi "3 ngày làm việc" | Có `preview.summary.daysCount` | Thấp |
| 24 | P/builders/api/calendar.ts:7,21 | Đếm ngày lễ từ khoảng | Chưa rõ | Thấp |
| 25 | P/builders/api/settings.ts:155-157 | Kiểm tổng trọng số = 100 | Có `kpiWeights.sum` (BE phải kiểm) | Thấp |
| 26 | P/views/admin/payroll/payslip/SlipSummary.vue:58,100; P/builders/api/payslip-a4.ts:125-127 | Nhãn cứng "BH 10,5%", "BHXH 8%…", "×1,5 ×2 ×3" | Rate có trong settings | Thấp |
| 27 | P/builders/api/payroll.ts:218-231 | workPay = base + leavePay + isat | Không có | Thấp |
| 28 | P/builders/admin-attendance/common.ts:52 | Parse "Vào trễ N phút" từ ghi chú | Có `lateMinutes` | Thấp |

Loại B (giữ, chỉ UX): làm sạch ký tự ở SlipKpi, kiểm workdays ≥ 1 ở PositionDialog, min/max lấy từ BE `limits`, đổi dấu hiển thị, định dạng %, tổng hiển thị, tuổi việc từ `Date.now`, vẽ thanh giờ.

Đã kiểm, không vi phạm: `AdvanceForm.vue` (chỉ ghép chữ từ `ctx.today`), `stores/period.ts` (dùng `serverNow`), `overview.ts` và `attendance.ts` (chỉ ánh xạ DTO).

Câu hỏi còn mở khi sửa: BE có chặn chấm công ngoài vùng không; `GET /payroll/:month` có tổng không; BE có trả số phút đi muộn trong chi tiết không; BE làm tròn điểm KPI thế nào; `/employees` có thống kê headcount không.

## Đã chuyển sang BE (nhóm lương, 06/11/2026)

Mục 1–7, 17, 19, 21, 26, 27 đã chuyển; 2 và 16 giữ phần UX. Trường mới ở `docs/api/v2-contract.md` (§3.5):

- 1, 26: phiếu (`details.rates`) trả `kpiWeights`, `insurancePct`, `otMultipliers`, `lateGraceMinutes` theo cài đặt của kỳ. FE in nhãn từ đây (màn phiếu, bản in A4); phiếu cũ không có `rates` thì không in tỉ lệ.
- 3, 4: `GET /payroll/:month` trả `totals` (tổng cả kỳ và từng cột). FE hiện tổng cả kỳ, không cộng theo bộ lọc hay trang.
- 5, 6, 7, 27: `details.lateMinutes` (chỉ phút quá ân hạn), `rates.lateGraceMinutes`, `leaveSettlementPay`, `holidayPay`, `holidayPaidDays`, `workPay`.
- 2: nhánh thật gọi BE (PUT KPI rồi POST calculate, đọc lại phiếu); máy tính giả chỉ còn trong `mock/`.
- 16: giữ. Ẩn nút Tính lương / Duyệt theo trạng thái kỳ chỉ là UX, BE vẫn chặn bằng 409.
- 17: luật điểm KPI của BE là chuẩn: 0–100, tối đa 2 chữ số thập phân, lưu `điểm × 100` làm tròn; tổng điểm % làm tròn 2 chữ số chỉ để hiện, tiền tính trên tổng chưa làm tròn. FE nhập điểm lẻ và hiện đúng giá trị BE; mock theo cùng luật.
- 19: `details.deductionTotal` (bản tạm tính của `/me/income` chỉ gồm tạm ứng).
- 21: `details.calendar` (loại từng ngày do BE quyết); FE không so ngày máy.
- 12, 25: chưa làm (không chạm cùng file với nhóm lương).

## Tiến độ sau khi hợp nhất với remote (06/11/2026)

- Nhân viên: SSE `/realtime/me`; tổng tiền nghỉ phép (`leavePay`), năm phần KPI, khoá nút chấm công (`POST /me/punches/check`), chữ luật (`rules.shiftGapMinutes`) và bộ chọn giờ bù (`POST /me/requests/leave-with-makeup/plan`) đều do BE tính.
- Admin: #13 làm lại trên nền remote (`GET /employees` trả `work` từng người và `summary`); công chuẩn của tuần sắp đổi (`upcoming`) và bảng công chuẩn theo số ngày (`standardByDays`) do BE trả; tổng giờ làm thêm trên phiếu lấy từ `totalOtHours` của BE.
- Còn ở FE và được giữ: kiểm tổng trọng số KPI trước khi lưu và tổng các ô đang nhập ở ngăn Cách tính lương (kiểm nhập liệu, BE kiểm lại khi lưu), tổng số ngày lễ của năm đang xem (đếm các dòng BE đã gửi), vị trí vẽ thanh thời gian ở lịch sử chấm công (hình học).

## Rà soát phía Admin (07/11/2026)

- **Realtime:** BE phát thêm `request.filed`, `period.changed`, `staff.changed` (chỉ qua `/stream` của Admin). Chuông, số cạnh mục Yêu cầu, Tổng quan, Yêu cầu, Chấm công, Hồ sơ chấm công, Bảng lương, Nhân sự và Tài khoản tự cập nhật.
- **Số đếm do BE tính:** `GET /requests` trả `counts` đủ 8 loại đơn (iSAT và nghỉ giữa ca trước đây thiếu); `GET /payroll/:month` trả `totals.statusCounts`. FE không còn tự đếm các thẻ trạng thái của Yêu cầu và Bảng lương.
- **Còn ở FE và được giữ có chủ ý:** lọc, tìm, sắp xếp, phân trang trên danh sách đã tải (Nhân sự, Bảng lương, Yêu cầu: vài trăm dòng, đổi tức thì); dựng file CSV từ dòng đang hiện; kiểm tổng trọng số KPI trước khi lưu (BE kiểm lại); số ngày lễ của năm (đếm các dòng BE đã gửi); hình học (vòng tròn kỳ lương, thanh giờ, bán kính vùng chấm công). Chữ "5 phút trước" dùng giờ máy chủ đã hiệu chỉnh (`clockOffsetMs`), không dùng đồng hồ máy khách thô.
- **Tab Vai trò:** ma trận vai trò không có API ở BE v2, nên với BE thật tab bị ẩn và địa chỉ cũ chuyển sang Tài khoản (dữ liệu giả vẫn giữ màn cũ).
- **Ô bấm được:** bốn thẻ chỉ số, thẻ Chấm công và thẻ Kỳ lương ở Tổng quan dẫn tới màn tương ứng; ngày trong lịch sử chấm công của một nhân viên mở chi tiết ngày.
