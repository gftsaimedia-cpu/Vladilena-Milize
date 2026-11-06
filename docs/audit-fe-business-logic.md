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

## Tiến độ xử lý (06/11/2026)

- Đã chuyển sang BE (FE chỉ hiện): #1–#7, #8–#10, #11 (form tạm ứng), #12, #17, #18, #19, #20, #21, #22, #23, #26, #27; #28 bỏ mã chết.
- Giữ vì chỉ là UX hoặc nhãn mô tả: #14, #15 (BE đã chặn bằng `OUTSIDE_ZONE`/`NOT_A_WORKDAY`, FE chỉ khoá nút sớm), #16, #24, #25 (BE đã kiểm tổng = 100 khi lưu, FE giữ dòng "Tổng x/100"); chữ "80%" ở màn Cài đặt chỉ-đọc (BE chưa có trường).
- #13 đã làm: BE `GET /employees` trả `work` từng người và `summary` (đang làm, vào/nghỉ, thâm niên, theo loại/bậc/hợp đồng), FE chỉ ánh xạ. #2 phần mock giữ trong `mock/` (đúng chỗ).
