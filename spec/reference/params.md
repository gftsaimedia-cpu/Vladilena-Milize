# Danh mục tham số lương

> Sinh tự động bởi `scripts/docs/gen-spec.ts` (`npm run spec:gen`) từ `src/params/registry.data.json` qua `scripts/params/doc.ts` (không kể các khoá lớp "bỏ"). Đừng sửa tay: `test/unit/spec-reference.test.ts` so sánh file này với bản dựng từ mã.

# Danh mục cấu hình (sinh từ registry)

Sinh bởi `npm run params:doc` từ `src/params/registry.data.json` và `src/engine/payroll-params.ts → DEFAULTS`. Không sửa tay.

## Nhóm 1. Kỳ lương

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `fixed.period.cutoff` | Kỳ công: từ ngày 1 đến cuối tháng | cố định | fixed |  |  | locked | — | Quy chế công ty | Sau |
| `period.reportDeadlineDay` | Hạn nộp chấm công (ngày của tháng sau) | số(day) | quantity |  | 3 ngày | admin | có | Chủ dự án chốt ngày 15/10/2026 | V1-B |
| `period.lateDeclaration` | Khai chấm công sau hạn | chọn | choice | Chỉ cảnh báo (mặc định) · Chặn [chưa có] · Chuyển kỳ sau [chưa có] | warn | admin | chưa | policy: chính sách | V2 |
| `period.payDay` | Ngày trả lương (ngày của tháng sau) | số(day) | quantity |  | 10 ngày | admin | có | Bộ luật Lao động 2019, Điều 97 về kỳ hạn trả lương (cần pháp chế xác nhận); ngày 5 hay ngày 10 chờ C&B chốt | V1-B |
| `period.payDayOnHoliday` | Ngày trả lương trùng ngày nghỉ | chọn | choice | Trả ngày làm việc liền trước (mặc định) · Trả ngày làm việc liền sau [chưa có] | before | admin | chưa | policy: chính sách | V1-B |
| `period.payDayMinGapDays` | Cảnh báo khi ngày trả cách hạn nộp công dưới … ngày | số(day) | quantity |  | 0 ngày | admin | chưa | policy: chính sách | V1-B |
| `advance.rate` | Tạm ứng: % lương cơ bản thực nhận | số(ratio) | percent |  | 80 % | admin | có | ceiling: quy chế công ty (cảnh báo nếu > 100 %) | V1-B |
| `advance.untilDay` | Tạm ứng tính cho ngày đi làm từ ngày 1 đến ngày | số(day) | quantity |  | 15 ngày | admin | có | Quy chế công ty; mặc định ngày 15 theo chủ dự án 27/10/2026 (từ 23/10 đến 27/10 từng là 20) | V1-B |
| `advance.basis` | Cách tính tạm ứng | chọn | choice | Theo ngày đi làm (mặc định) · % cố định theo level [chưa có] · Số tiền theo level [chưa có] · Chỉ khi nhân sự gửi yêu cầu [chưa có] | byWorkedDays | admin | có | Quy chế công ty | V2 |
| `advance.eligibleTypes.<type>` | Loại nhân sự được tạm ứng | bảng | table |  | eligibleTypes.ctv: Có; eligibleTypes.nv: Có; eligibleTypes.tts: Có | admin | có | policy: chính sách | V2 |

## Nhóm 2. Loại nhân sự và bậc lương

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `level.<type>.<level>.name`, `level.<type>.<level>.base`, `level.<type>.<level>.kpi` | Bảng level: lương cơ bản và KPI tối đa | bảng | table |  | 1.base: 6.000.000; 1.kpi: 1.500.000; 1.name: Fresher … (+33) | admin | có | floor: Nghị định 293/2025/NĐ-CP về mức lương tối thiểu vùng | V1-B |
| `type.<type>.workdays` | Ngày công chuẩn | số(day) | quantity |  | ctv.workdays: 26 ngày; nv.workdays: 26 ngày; tts.workdays: 22 ngày | admin | có | Quy chế lương | V1-B |
| `type.<type>.benefit.<flag>` | Quyền lợi theo loại nhân sự | bảng | table |  | benefit.absenceDeclarable: Có; benefit.approvedLeave: Không; benefit.breakPay: Có … (+36) | admin | có | policy: chính sách; cảnh báo nếu loại có hợp đồng lao động mà lễ hoặc phép = Không (BLLĐ Điều 112, 113; cần pháp chế xác nhận) | V2 |
| `type.<type>.startDateRequired` | Bắt buộc ngày bắt đầu làm | chọn | toggle | Không (mặc định) · Có | ctv.startDateRequired: Có; nv.startDateRequired: Có; tts.startDateRequired: Không | admin | có | Chính sách công ty | V2 |
| `type.<type>.defaultContract` | Hợp đồng mặc định của chức vụ | chọn | choice | Dài hạn (mặc định) · Ngắn hạn | ctv.defaultContract: long; nv.defaultContract: long; tts.defaultContract: short | admin | có | Chính sách công ty và quy định về thuế thu nhập cá nhân | V2 |
| `pay.method` | Cách tính lương | chọn | choice | A. Mẫu số cố định, không trần (mặc định) · B. Mẫu số cố định, trần 100 % [chưa có] · C. Mẫu số = số ngày làm việc thực của tháng [chưa có] · D. Lương tháng trừ ngày không lương [chưa có] | A | admin | có | policy: Bộ luật Lao động 2019, Điều 96 về hình thức trả lương | V1-B |
| `pay.otHourlyDivisor` | Lương giờ dùng để trả OT chia cho | chọn | choice | Theo cách tính lương đã chọn (mặc định) · Ngày công chuẩn cố định [chưa có] | byMethod | admin | chưa | Nghị định 145/2020/NĐ-CP, Điều 55 về cách tính lương giờ (cần pháp chế xác nhận) | V1-B |
| `type.<type>.probationPayPct` | Lương thử việc (% lương của công việc) | số(ratio) | percent |  | ctv.probationPayPct: 100 %; nv.probationPayPct: 100 %; tts.probationPayPct: 100 % | admin | chưa | floor: Bộ luật Lao động 2019, Điều 26 | V2 |
| `fixed.pay.midMonthChange` | Đổi loại, level hoặc lương giữa tháng: áp cho cả tháng, hiệu lực từ ngày 01 | cố định | fixed |  |  | locked | — | Đề xuất, chờ chủ dự án chốt | Sau |
| `type.<type>.dows` | Lịch làm việc theo loại: TTS thứ Hai đến thứ Sáu; CTV, NV thứ Hai đến thứ Bảy | cố định | fixed |  | ctv.dows: [1,2,3,4,5,6]; nv.dows: [1,2,3,4,5,6]; tts.dows: [1,2,3,4,5] | locked | — | Quy chế lương |  |
| `type.<type>.workdaysMode` | Cách tính ngày công chuẩn | chọn | choice | Cố định (mặc định) · Tự đếm theo lịch của tháng | ctv.workdaysMode: fixed; nv.workdaysMode: fixed; tts.workdaysMode: fixed | admin | có | Chính sách công ty (chủ dự án 16/10/2026: mặc định cố định) | V2 |
| `fixed.type.catalog` | Ba loại nhân sự: Thực tập sinh, Chuyên trách viên, Nhân viên | cố định | fixed |  |  | locked | — | Mặc định của hệ thống | Sau |

## Nhóm 3. Danh mục phụ cấp

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `type.<type>.travel` | Phụ cấp đi lại | số(ratio) | percent |  | ctv.travel: 0 %; nv.travel: 15 %; tts.travel: 0 % | admin | có | Quy chế công ty | V1-B |
| `type.<type>.attendance` | Phụ cấp chuyên cần | số(ratio) | percent |  | ctv.attendance: 0 %; nv.attendance: 25 %; tts.attendance: 0 % | admin | có | Quy chế công ty | V1-B |
| `fixed.allowance.idorm` | iDorm là cờ hồ sơ, không phải phụ cấp | cố định | fixed |  |  | locked | — | Quy chế công ty |  |
| `shift.flex.bonus`, `type.<type>.flexBonus` | Phụ cấp ca Flex | số(ratio) | percent |  | flex.bonus: 10 %; ctv.flexBonus: 10 %; nv.flexBonus: 20 % … (+1) | admin | có | Quy chế công ty | V1-B |
| `shift.night.bonus` | Phụ cấp ca đêm (TTS, CTV) | số(ratio) | percent |  | 30 % | admin | có | floor: Bộ luật Lao động 2019, Điều 98 khoản 2 | V1-B |
| `type.nv.nightOptions` | Các mức phụ cấp ca đêm cho Nhân viên | bảng | table |  | [40,60] | admin | có | floor: Bộ luật Lao động 2019, Điều 98 khoản 2 | V1-B |
| `allowance.item.<code>` | Danh mục phụ cấp tuỳ chỉnh (ăn trưa, trách nhiệm…): thêm khoản bằng cách ghép khối | bảng | formula |  |  | admin | — | Đề xuất; mức miễn thuế và việc tính vào lương đóng bảo hiểm chờ kế toán xác nhận (Luật Bảo hiểm xã hội, Điều 31; Nghị định 158/2025/NĐ-CP, Điều 7) | V2 |
| `allowance.assign` | Gán phụ cấp tuỳ chỉnh theo từng người | bảng | table |  |  | admin | — | Đề xuất, chờ C&B chốt | V2 |

## Nhóm 4. Chuyên cần

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `type.nv.maxAbsent` | Mất phụ cấp chuyên cần khi nghỉ từ … ngày trong tháng | số(day) | quantity |  | 3 ngày | admin | có | ceiling: quy chế công ty (cảnh báo nếu < 1) | V1-B |
| `attendance.overLimitHours` | Mất phụ cấp chuyên cần khi tổng giờ vượt ngưỡng từ … giờ trong tháng | số(hour) | quantity |  | 24 giờ | admin | có | policy: chính sách (cảnh báo nếu < 8) | V1-B |
| `fixed.attendance.overLimitFormula` | Cách tính giờ vượt ngưỡng | cố định | fixed |  |  | locked | — | Quy chế công ty |  |
| `attendance.lossMode` | Cách mất phụ cấp chuyên cần | chọn | choice | Mất toàn bộ (mặc định) · Giảm theo bậc [chưa có] | all | admin | có | policy: lead 15/10 (mất toàn bộ); chính sách | V2 |
| `attendance.tiers` | Bảng giảm theo bậc (số ngày nghỉ và % giữ lại) | bảng | tierTable |  | [] | admin | có | policy: chính sách | V2 |
| `attendance.overLimitTolerance` | Biên độ giờ vượt ngưỡng | số(hour) | quantity |  | 0 giờ | admin | có | policy: chính sách | V2 |
| `attendance.shortHoursRounding` | Làm tròn giờ thiếu chưa bù trước khi cộng vào giờ vượt ngưỡng | chọn | choice | Không làm tròn (mặc định) · Xuống 0,5 giờ [chưa có] · Xuống 1 giờ [chưa có] | none | admin | có | policy: chính sách | V2 |
| `fixed.attendance.leaveCounts` | Phép năm tính là ngày nghỉ khi xét chuyên cần | cố định | fixed |  |  | locked | — | Bộ luật Lao động 2019, Điều 113 (cần pháp chế xác nhận) |  |
| `fixed.attendance.proration` | Phụ cấp chuyên cần theo tỷ lệ ngày đi làm | cố định | fixed |  |  | locked | — | Quy chế công ty |  |

## Nhóm 5. OT và làm thêm

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `ot.rate` | Hệ số OT ngày thường | số(ratio) | percent |  | 150 % | admin | có | floor: Bộ luật Lao động 2019, Điều 98 khoản 1 | V1-B |
| `ot.weekendRate` | Hệ số OT cuối tuần | số(ratio) | percent |  | 200 % | admin | có | floor: Bộ luật Lao động 2019, Điều 98 khoản 1 | V1-B |
| `ot.holidayRate` | Làm ngày lễ | số(ratio) | percent |  | 300 % | admin | có | floor: Bộ luật Lao động 2019, Điều 98 khoản 1 | V1-B |
| `night.breakPremium` | Phụ trội giờ nghỉ đêm (giờ nghỉ bắt buộc rơi vào 22:00 đến 06:00 trả lương giờ cộng phần này) | số(ratio) | percent |  | 30 % | admin | có | floor: Bộ luật Lao động 2019, Điều 98 khoản 2 | V1-B |
| `night.otAddRate` | Phụ trội làm ngày lễ ban đêm (% × hệ số lễ) | số(ratio) | percent |  | 20 % | admin | có | floor: Bộ luật Lao động 2019, Điều 98 khoản 3 | V1-B |
| `ot.nightAddScope` | Phụ trội OT ban đêm áp dụng cho | chọn | choice | Chỉ ngày lễ (mặc định) · Mọi OT ban đêm [chưa có] | holidayOnly | admin | chưa | Chờ pháp chế xác nhận: mặc định có thể thấp hơn Bộ luật Lao động 2019, Điều 98 khoản 3 nếu có OT đêm ngày thường | V2 |
| `ot.afterMakeup` | OT khi còn nợ giờ bù | chọn | choice | Chặn đến khi cân (mặc định) · Độc lập [chưa có] | block | admin | có | policy: chính sách | V2 |
| `holiday.makeupRate` | Làm bù rơi vào ngày lễ | số(count) | quantity |  | 3 | admin | có | floor: Bộ luật Lao động 2019, Điều 98 khoản 1 | V1-B |
| `fixed.ot.taxExempt` | Phần OT và làm đêm miễn thuế | cố định | fixed |  |  | locked | — | Luật Thuế thu nhập cá nhân số 109/2025/QH15, Điều 4 khoản 8; Nghị định 253/2026, Điều 26 | Sau |
| `fixed.ot.makeupPool` | Làm bù gộp theo tháng | cố định | fixed |  |  | locked | — | Quy chế công ty |  |
| `fixed.ot.weeklyRest` | Làm việc cuối tuần ngoài lịch | cố định | fixed |  |  | locked | — | Bộ luật Lao động 2019, Điều 98 khoản 1 | Sau |
| `fixed.ot.approval` | OT, làm bù, làm ngày lễ phải được duyệt mới trả | cố định | fixed |  |  | locked | — | Chủ dự án chốt ngày 14/10/2026 và lead chốt ngày 15/10/2026 |  |

## Nhóm 6. Chấm công

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `fixed.attendance.primarySource` | Nguồn chấm công chính: Check-in/out trên app có kiểm GPS | cố định | fixed |  |  | locked | — | Chủ dự án quyết định: AiCB là hệ thống chấm công |  |
| `attendance.sources.file` | Nhập file chấm công (CSV) để đối soát | chọn | toggle | Tắt (mặc định) · Bật [chưa có] | Không | admin | chưa | Đề xuất, chờ chủ dự án chốt; máy chấm công chỉ nhập giờ, không nhập dữ liệu sinh trắc (Nghị định 356/2025/NĐ-CP, Điều 4) | V2 |
| `fixed.attendance.conflictRule` | Khi app và máy/file lệch nhau | cố định | fixed |  |  | locked | — | Đề xuất, chờ chủ dự án chốt | Sau |
| `fixed.attendance.device` | Máy chấm công | cố định | fixed |  |  | locked | — | Đề xuất, chờ chủ dự án chốt | Sau |
| `geofence.enabled` | Kiểm vị trí khi Check-in | chọn | toggle | Tắt (mặc định) · Bật | Không | admin | — | Chủ dự án chốt về kiểm vị trí Check-in | V1-B |
| `geofence.lat`, `geofence.lng` | Vị trí công ty (vĩ độ, kinh độ) | số(degree) | quantity |  | geofence.lat: trống; geofence.lng: trống | admin | — | structure: cấu trúc: cứng | V1-B |
| `geofence.radiusM` | Bán kính chấm công | số(meter) | quantity |  | trống | admin | — | structure: Giới hạn cố định của hệ thống | V1-B |
| `geofence.maxAccuracyM` | Độ chính xác GPS tối đa | số(meter) | quantity |  | 100 mét | admin | — | structure: Giới hạn cố định của hệ thống | V1-B |
| `attendance.graceMin` | Đi trễ, về sớm tới … phút không trừ | số(minute) | quantity |  | 15 phút | admin | có | Chủ dự án chốt ngày 14/10/2026 | V1-B |
| `attendance.stepMin` | Bậc trừ khi vượt mức | số(minute) | quantity |  | 30 phút | admin | có | Chủ dự án chốt ngày 14/10/2026 | V1-B |
| `attendance.cutRounding` | Cách tính số phút bị trừ (từ mức miễn trở lên) | chọn | choice | Bậc làm tròn nửa lên (mặc định) · Làm tròn lên theo bậc [chưa có] · Đúng số phút [chưa có] | halfUpStep | admin | có | policy: Bộ luật Lao động 2019, Điều 127 khoản 2 | V2 |
| `attendance.graceScope` | Cách áp mức miễn (graceMin) | chọn | choice | Mỗi lượt (mặc định) · Tổng mỗi tháng [chưa có] · Số lần mỗi tháng [chưa có] | perPunch | admin | chưa | policy: Bộ luật Lao động 2019, Điều 127 khoản 2 | V2 |
| `attendance.graceMonthlyMin` | Tổng phút miễn mỗi tháng (khi chọn "Tổng mỗi tháng") | số(minute) | quantity |  | 0 phút | admin | chưa | policy: chính sách | V2 |
| `attendance.graceMonthlyCount` | Số lần miễn mỗi tháng (khi chọn "Số lần mỗi tháng") | số(times) | quantity |  | 0 lần | admin | chưa | policy: chính sách | V2 |
| `attendance.lateEarlyRule` | Đi trễ và về sớm cùng ngày | chọn | choice | Xét riêng (mặc định) · Cộng phút rồi làm tròn | separate | admin | có | Chủ dự án chốt ngày 14/10/2026 | V1-B |
| `attendance.gapRule` | Ra ngoài giữa ca | chọn | choice | Trừ theo bậc (mặc định) · Trừ đúng số phút · Bỏ qua | step | admin | có | policy: chính sách | V1-B |
| `attendance.missingOneSideRule` | Quên chấm một đầu (Check-in hoặc Check-out) | chọn | choice | Chờ Admin xử lý (mặc định) · Tính là vắng [chưa có] | pending | admin | có | Chủ dự án chốt ngày 14/10/2026 | V2 |
| `attendance.missingAllRule` | Ngày có lịch mà không chấm công | chọn | choice | Tính theo lịch đã khai · Tính là vắng (mặc định) · Chờ Admin xử lý | absent | admin | có | Chủ dự án chốt ngày 14/10/2026; đổi mặc định thành "tính theo lịch đã khai" tối 23/10/2026; chốt lại ngày 28/10/2026: ngày khai đi làm mà không có Check-in/Check-out là nghỉ không phép, áp dụng từ tháng 10 | V1-B |
| `attendance.offScheduleRule` | Đi làm ngoài lịch chưa được duyệt | chọn | choice | Không trả tiền (mặc định) · Coi như ngày đã khai · Chặn Check-in [chưa có] | unpaid | admin | có | Chủ dự án chốt ngày 14/10/2026; chờ pháp chế xem lại rủi ro | V1-B |
| `attendance.makeupDayStepRule` | Làm bù cả ngày (TTS thứ Bảy) | chọn | choice | Trả đúng phút (mặc định) · Cắt theo bậc | exact | admin | có | policy: chính sách | V1-B |
| `attendance.openSessionMaxHours` | Lượt Check-in mở quá … giờ thì tính là quên Check-out | số(hour) | quantity |  | 16 giờ | admin | chưa | policy: chính sách | V1-B |
| `attendance.earlyCheckinMaxHours` | Nhận Check-in sớm hơn giờ ca tối đa … giờ | số(hour) | quantity |  | 4 giờ | admin | chưa | policy: chính sách | V1-B |
| `geofence.outside` | Check-in ngoài vùng GPS | chọn | choice | Chặn (mặc định) · Cho chấm nhưng chờ duyệt [chưa có] | block | admin | chưa | policy: chính sách; không bao giờ lưu toạ độ (cố định) | V2 |
| `attendance.beyondShiftRule`, `attendance.extraWindowRule`, `attendance.extraSourceRule`, `attendance.futureDaysRule`, `attendance.declaredLeaveRule`, `attendance.undeclaredPunchRule` | Luật chấm công đã chốt (7 điều) | cố định | fixed |  | attendance.beyondShiftRule: cap8; attendance.declaredLeaveRule: declared; attendance.extraSourceRule: calendar … (+3) | locked | — | Chủ dự án chốt ngày 14/10/2026 và 15/10/2026 | Sau |
| `shift.preset.<code>.in`, `shift.preset.<code>.out` | Ca cố định (6 ca) | bảng | table |  | f1.in: 06:00; f1.out: 15:00; f2.in: 13:00 … (+9) | admin | có | policy: chính sách | V1-B |
| `time.workHoursPerDay` | Giờ làm việc mỗi công | cố định(hour) | fixed |  | 8 giờ | locked | — | Bộ luật Lao động 2019, Điều 105 (cần pháp chế xác nhận) | Sau |
| `time.maxSpanHours` | Ca tối đa từ giờ vào đến giờ ra | cố định(hour) | fixed |  | 9 giờ | locked | — | Quy chế công ty | Sau |
| `time.breakAfterWorkHours`, `time.breakHours` | Làm … giờ thì nghỉ … giờ | cố định(hour) | fixed |  | time.breakAfterWorkHours: 4 giờ; time.breakHours: 1 giờ | locked | — | Bộ luật Lao động 2019, Điều 109 (cần pháp chế xác nhận) | Sau |
| `time.nightStartHour`, `time.nightEndHour` | Khung giờ đêm | cố định(hour) | fixed |  | time.nightEndHour: 6 giờ; time.nightStartHour: 22 giờ | locked | — | Bộ luật Lao động 2019, Điều 106 (cần pháp chế xác nhận) | Sau |
| `time.shiftStructure` | Ca qua đêm thuộc ngày bắt đầu ca | cố định | fixed |  |  | locked | — | Mặc định của hệ thống |  |
| `geofence.earthRadiusM` | Bán kính Trái Đất (mét) dùng tính khoảng cách GPS | cố định(meter) | fixed |  | 6.371.000 mét | locked | — | Hằng số vật lý |  |

## Nhóm 7. Nghỉ và phép

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `leave.accrualMode` | Cách cộng phép năm | chọn | choice | App (mặc định) · 12 ngày/năm chia theo tháng [chưa có] · Cấp đủ đầu năm [chưa có] | app | admin | chưa | Bộ luật Lao động 2019, Điều 113 và 114 (cần pháp chế xác nhận); lead chốt ngày 15/10/2026 giữ phép năm như app | V2 |
| `fixed.leave.seniority` | Thâm niên: +1 ngày mỗi 5 năm làm việc | cố định | fixed |  |  | locked | — | Bộ luật Lao động 2019, Điều 114 (cần pháp chế xác nhận) | V2 |
| `leave.accrual.start` | Phép cộng ngày đầu đi làm | số(day) | quantity |  | 0 ngày | admin | có | Chủ dự án 23/10/2026 (Bộ luật Lao động 45/2019/QH14 Điều 113: theo tỷ lệ tháng làm việc; cần pháp chế xác nhận) | V1-B |
| `leave.accrual.perMonth` | Phép cộng mỗi tháng tròn | số(day) | quantity |  | 1 ngày | admin | có | ceiling: Bộ luật Lao động 2019, Điều 113 | V1-B |
| `leave.accrual.birthday` | Phép cộng vào ngày sinh nhật | số(day) | quantity |  | 1 ngày | admin | có | Quy chế phúc lợi GFT (iFourteen: từ cấp Nhân viên trở lên); chủ dự án 26/10/2026 (THAO-LUAN Đ40) | V1-B |
| `leave.birthdayMode` | Phép sinh nhật hoặc iFourteen | chọn | choice | Cộng vào phép năm (mặc định) · Kho riêng [chưa có] | addToAnnual | admin | chưa | Lead chốt ngày 15/10/2026 giữ phép năm như app và thêm iFourteen; chi tiết chờ lead trả lời | V2 |
| `fixed.leave.expiry` | Phép hết hạn cuối tháng 1 năm sau, quy tiền vào lương tháng 2 | cố định | fixed |  |  | locked | — | Đề xuất, chờ C&B chốt | Sau |
| `leave.settleMethod` | Cách quyết toán phép còn lại khi nghỉ việc (luật: phép còn lại được trả) | chọn | choice | Admin nhập tay (mặc định) · Tự tính [chưa có] | manual | admin | chưa | policy: Bộ luật Lao động 2019, Điều 113 khoản 3 | V2 |
| `fixed.leave.noNegative` | Không cho phép âm | cố định | fixed |  |  | locked | — | Chuyên viên C&B chốt |  |
| `leave.useLeaveFirst` | Phải dùng phép năm trước khi nghỉ không lương | chọn | choice | Không bắt buộc (mặc định) · Bắt buộc [chưa có] | optional | admin | chưa | policy: chính sách | V2 |
| `holiday.compensatory` | Nghỉ bù khi ngày lễ trùng ngày nghỉ hằng tuần | chọn | choice | Admin thêm tay (mặc định) · App đề xuất [chưa có] | manual | admin | chưa | Bộ luật Lao động 2019, Điều 112 khoản 3 (cần pháp chế xác nhận) | V2 |
| `fixed.leave.unit` | Đơn vị nghỉ: cả ngày | cố định | fixed |  |  | locked | — | Đề xuất, chờ C&B chốt | Sau |
| `leave.ifourteen.days` | Phép sinh nhật hoặc iFourteen (kho riêng) | số(day) | quantity |  | 0 ngày | admin | chưa | Lead chốt ngày 15/10/2026 thêm iFourteen; chi tiết chờ lead trả lời | V2 |
| `isat.monthlyLimit` | Giới hạn iSAT mỗi tháng | số(times) | quantity |  | trống | admin | có | policy: chính sách | V2 |
| `holidays` | Ngày nghỉ lễ | bảng | table |  | [] | admin | — | Bộ luật Lao động 2019, Điều 112 về số ngày nghỉ lễ (cần pháp chế xác nhận) | V1-B |
| `table.requestTypes` | Danh mục loại nghỉ và loại yêu cầu | bảng | table |  |  | admin | — | Chủ dự án chốt ngày 14/10/2026 |  |
| `leave.expiry.month` | Phép năm hết hạn vào cuối tháng | số(month) | quantity |  | 1 tháng | admin | có | Chủ dự án 23/10/2026; Bộ luật Lao động 45/2019/QH14 Điều 113 khoản 3 (cần pháp chế xác nhận) | V1-B |
| `leave.expiry.fromYear` | Phép hết hạn áp dụng từ năm | số(count) | quantity |  | 2.026 | admin | có | Chủ dự án 23/10/2026; Bộ luật Lao động 45/2019/QH14 Điều 113 khoản 3 (cần pháp chế xác nhận) | V1-B |

## Nhóm 8. KPI

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `fixed.kpi.cycle` | Chu kỳ KPI: hằng tháng | cố định | fixed |  |  | locked | — | Lead chốt ngày 15/10/2026 | Sau |
| `kpi.weight.wework`, `kpi.weight.user`, `kpi.weight.peer`, `kpi.weight.manager`, `kpi.weight.self` | Trọng số: Base Wework, người dùng, đồng nghiệp, quản lý trực tiếp, tự đánh giá | bảng | table |  | weight.manager: 12; weight.peer: 18; weight.self: 6 … (+2) | admin | chưa | structure: Quy chế lương 3P; tổng ≠ 100 là cứng | V1-B |
| `kpi.weworkMin` | Điều kiện đạt: Base Wework từ … điểm | số(percentPoints) | percent |  | 75 % | admin | chưa | Quy chế lương 3P | V1-B |
| `type.<type>.kpiPass` | Điều kiện đạt: tổng từ … % | số(percentPoints) | percent |  | ctv.kpiPass: 75 %; nv.kpiPass: 75 % | admin | có | Quy chế lương 3P | V1-B |
| `kpi.belowPassRule` | Tổng dưới mức đạt | chọn | choice | KPI = 0 (mặc định) · Vẫn trả theo % [chưa có] · Theo bậc [chưa có] | zero | admin | có | Quy chế lương 3P; chờ lead trả lời về cách trả theo bậc | V2 |
| `kpi.weworkGateRule` | Base Wework dưới mức đạt | chọn | choice | KPI = 0 (mặc định) · Chỉ cảnh báo [chưa có] | zero | admin | có | Quy chế lương 3P; chờ lead trả lời | V2 |
| `kpi.incompleteRule` | Chưa đủ 5 điểm thành phần | chọn | choice | Chờ điểm (mặc định) · Thiếu điểm tính là 0 [chưa có] · Theo tháng trước [chưa có] | waiting | admin | có | Quy chế lương 3P; chờ lead trả lời | V2 |
| `fixed.kpi.backpay` | Kỳ đã duyệt mà thiếu điểm KPI: không trả bù | cố định | fixed |  |  | locked | — | policy: chính sách | Sau |
| `kpi.overLimitHours` | KPI nhân tỷ lệ ngày đi làm khi giờ vượt ngưỡng trên … giờ | số(hour) | quantity |  | 24 giờ | admin | có | policy: chính sách | V1-B |
| `kpi.ratioRule` | Hệ số ngày đi làm của tiền KPI | chọn | choice | Chỉ khi giờ vượt ngưỡng > ngưỡng (mặc định) · Luôn nhân [chưa có] · Không nhân [chưa có] | whenOverLimit | admin | chưa | Quy chế lương 3P | V2 |
| `kpi.payCurveRule` | Đường cong tiền KPI | chọn | choice | Tỷ lệ thuận (mặc định) · Theo bảng bậc [chưa có] | linear | admin | chưa | Quy chế lương 3P; chờ lead trả lời | V2 |
| `fixed.kpi.formula` | Công thức thưởng KPI | cố định | fixed |  |  | locked | — | Quy chế lương 3P |  |
| `kpi.scoreMax` | Điểm KPI tối đa của một thành phần | cố định | fixed |  | 100 | locked | — | Quy chế lương 3P |  |
| `kpi.scoreDecimals` | Điểm KPI: số chữ số thập phân | cố định(count) | fixed |  | 2 | locked | — | Quy chế lương 3P |  |

## Nhóm 9. Duyệt

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `request.type.<code>.pendingRule`, `request.type.<code>.rejectedRule`, `request.type.<code>.countsAbsent` | Danh mục loại yêu cầu và loại nghỉ | bảng | table |  | approved.countsAbsent: Có; approved.pendingRule: unpaid; approved.rejectedRule: unpaid … (+21) | admin | có | floor: Bộ luật Lao động 2019, Điều 115 | V1-B |
| `approval.batch` | Duyệt cả lô các khoản không có cảnh báo AI | chọn | toggle | Cho phép (mặc định) · Không [chưa có] | Có | admin | chưa | policy: chính sách | V2 |
| `approval.pendingAtLock` | Khoản còn chờ duyệt tới ngày chốt công | chọn | choice | Cho chốt có xác nhận (mặc định) · Chặn chốt [chưa có] | confirm | admin | chưa | policy: chính sách | V1-B |
| `period.editPastMonths` | Khai, sửa lịch tháng đã qua | chọn | choice | Tới khi chốt công tháng đó (mặc định) · Chỉ N tháng gần nhất [chưa có] | untilLock | admin | chưa | policy: chính sách | V2 |
| `period.editPastMonthsN` | Số tháng gần nhất được sửa (khi chọn "N tháng gần nhất") | số(month) | quantity |  | 2 tháng | admin | chưa | policy: chính sách | V2 |
| `fixed.approval.noAutoApprove` | Không tự động duyệt khi quá hạn | cố định | fixed |  |  | locked | — | Tách nhiệm vụ giữa người khai và người duyệt |  |
| `fixed.approval.rejectReason` | Từ chối và đổi quyết định bắt buộc ghi lý do | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.approval.noSelf` | Không tự duyệt khoản của chính mình | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.approval.aiFlagged` | Khoản có cảnh báo AI không vào duyệt cả lô, không duyệt một chạm; AI không chạy thì khoá duyệt cả lô | cố định | fixed |  |  | locked | — | Chủ dự án chốt |  |
| `fixed.approval.lock` | Duyệt cả lô: một khoản lệch thì cả lô không lưu | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |

## Nhóm 10. Thuế và bảo hiểm

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `tax.insurance.employee.bhxh` | BHXH người lao động đóng | số(ratio) | percent |  | 8 % | accounting | có | exact: Luật Bảo hiểm xã hội 2024 | V1-B |
| `tax.insurance.employee.bhyt` | BHYT người lao động đóng | số(ratio) | percent |  | 1,5 % | accounting | có | exact: Luật Bảo hiểm xã hội 2024 | V1-B |
| `tax.insurance.employee.bhtn` | BHTN người lao động đóng | số(ratio) | percent |  | 1 % | accounting | có | exact: Luật Việc làm 2025 | V1-B |
| `tax.insurance.employer.bhxh`, `tax.insurance.employer.bhyt`, `tax.insurance.employer.bhtn` | Công ty đóng (chỉ tham khảo, không trừ vào lương) | số(ratio) | percent |  | employer.bhtn: 1 %; employer.bhxh: 17,5 %; employer.bhyt: 3 % | accounting | có | exact: Luật Bảo hiểm xã hội 2024 | V1-B |
| `law.luongCoSo` | Lương cơ sở | số(vnd) | money |  | 2.530.000 ₫ | accounting | có | exact: Nghị định 161/2026 | V1-B |
| `law.region` | Vùng lương tối thiểu của công ty | chọn | choice | Vùng I (mặc định) · II [chưa có] · III [chưa có] · IV [chưa có] | 1 | accounting | có | exact: Nghị định 293/2025/NĐ-CP | V1-B |
| `law.regionMinWage.<region>` | Lương tối thiểu vùng I, II, III, IV | số(vnd) | money |  | regionMinWage.1: 5.310.000 ₫; regionMinWage.2: trống; regionMinWage.3: trống … (+1) | accounting | có | exact: Nghị định 293/2025/NĐ-CP | V1-B |
| `fixed.tax.capMultiple` | Trần đóng = 20 lần | cố định | fixed |  |  | locked | — | Luật Bảo hiểm xã hội 2024; Luật Việc làm 2025 | V1-B |
| `tax.insurance.skipDays` | Từ … ngày không lương trong tháng thì tháng đó không đóng BH | số(day) | quantity |  | 14 ngày | accounting | có | exact: Luật Bảo hiểm xã hội 2024 | V1-B |
| `tax.deduction.personal` | Giảm trừ bản thân | số(vnd) | money |  | 15.500.000 ₫ | accounting | có | exact: Nghị quyết 110/2025/UBTVQH15 | V1-B |
| `tax.deduction.dependant` | Giảm trừ mỗi người phụ thuộc | số(vnd) | money |  | 6.200.000 ₫ | accounting | có | exact: Nghị quyết 110/2025/UBTVQH15 | V1-B |
| `tax.brackets` | Biểu thuế lũy tiến từng phần | bảng | table |  | [[10000000,0.05],[30000000,0.1],[60000000,0.2],[100000000,0.3],[null,0.35]] | accounting | có | release: Luật Thuế thu nhập cá nhân số 109/2025/QH15, Điều 9 | V1-B |
| `tax.method.long` | Cách tính thuế của hợp đồng dài hạn | chọn | choice | Lũy tiến từng phần (mặc định) · Khấu trừ một mức cố định [chưa có] · Không khấu trừ [chưa có] | progressive | accounting | có | Luật Thuế thu nhập cá nhân số 109/2025/QH15; Nghị định 253/2026/NĐ-CP (cần kế toán xác nhận) | V2 |
| `tax.method.short` | Cách tính thuế của hợp đồng ngắn hạn | chọn | choice | Khấu trừ một mức cố định (mặc định) · Lũy tiến từng phần [chưa có] · Không khấu trừ [chưa có] | flat | accounting | có | Luật Thuế thu nhập cá nhân số 109/2025/QH15; Nghị định 253/2026/NĐ-CP (cần kế toán xác nhận) | V2 |
| `tax.casual.rate` | Khấu trừ cho người không có hợp đồng lao động từ 3 tháng | số(ratio) | percent |  | 10 % | accounting | có | exact: Nghị định 253/2026, Điều 50 khoản 2 | V1-B |
| `tax.casual.threshold` | Ngưỡng áp dụng khấu trừ nói trên | số(vnd) | money |  | 5.000.000 ₫ | accounting | có | exact: Nghị định 253/2026, Điều 50 khoản 2 | V1-B |
| `tax.exempt.nightPremium` | Miễn thuế: phụ trội giờ làm đêm | số(ratio) | percent |  | 30 % | accounting | có | exact: Luật Thuế thu nhập cá nhân số 109/2025/QH15, Điều 4 khoản 8 | V1-B |
| `tax.exempt.otRate` | Miễn thuế: hệ số OT ngày thường (chỉ phần trên lương giờ thường) | số(ratio) | percent |  | 150 % | accounting | có | exact: Luật Thuế thu nhập cá nhân số 109/2025/QH15, Điều 4 khoản 8 | V1-B |
| `tax.exempt.weekendRate` | Miễn thuế: hệ số OT cuối tuần (chỉ phần trên lương giờ thường) | số(ratio) | percent |  | 200 % | accounting | có | exact: Luật Thuế thu nhập cá nhân số 109/2025/QH15, Điều 4 khoản 8 | V1-B |
| `tax.exempt.holidayRate` | Miễn thuế: hệ số làm ngày lễ (chỉ phần trên lương giờ thường) | số(ratio) | percent |  | 300 % | accounting | có | exact: Luật Thuế thu nhập cá nhân số 109/2025/QH15, Điều 4 khoản 8 | V1-B |
| `tax.exempt.otMethod` | Cách tính phần làm thêm giờ được miễn thuế | chọn | choice | Theo đơn giá luật định (mặc định) · Theo số giờ [chưa có] | byRate | accounting | có | Luật Thuế thu nhập cá nhân số 109/2025/QH15, Điều 4; Nghị định 253/2026/NĐ-CP (chưa có văn bản hướng dẫn, cần kế toán hoặc pháp chế xác nhận) | V2 |
| `tax.arise.mode` | Điều kiện phát sinh thuế của hợp đồng dài hạn | chọn | choice | Vượt mức giảm trừ bản thân (mặc định) · Vượt một ngưỡng riêng [chưa có] | personalDeduction | accounting | có | Luật Thuế thu nhập cá nhân số 109/2025/QH15; Nghị định 253/2026/NĐ-CP (cần kế toán xác nhận) | V2 |
| `fixed.tax.method` | Cách tính thuế theo loại hợp đồng | cố định | fixed |  |  | locked | — | Luật Thuế thu nhập cá nhân số 109/2025/QH15; Nghị định 253/2026 |  |
| `insurance.base` | Căn cứ đóng BH | chọn | choice | Lương cơ bản của level (hoặc lương riêng) (mặc định) · Lương cơ bản cộng phụ cấp có cờ "tính vào lương đóng BH" · Thuộc tính tiền của bậc (lương đóng BH) [chưa có] | baseSalary | accounting | có | exact: Luật Bảo hiểm xã hội số 41/2024/QH15, Điều 31 | V2 |
| `insurance.coverage.long` | Hợp đồng dài hạn có đóng bảo hiểm | chọn | toggle | Có (mặc định) · Không [chưa có] | Có | accounting | có | Luật Bảo hiểm xã hội số 41/2024/QH15 (cần pháp chế xác nhận) | V2 |
| `insurance.coverage.short` | Hợp đồng ngắn hạn có đóng bảo hiểm | chọn | toggle | Không (mặc định) · Có | Không | accounting | có | Luật Bảo hiểm xã hội số 41/2024/QH15 (cần pháp chế xác nhận) | V2 |
| `insurance.baseAttr` | Thuộc tính của bậc dùng làm nền đóng bảo hiểm | chọn | choice | Chưa chọn (mặc định) |  | accounting | có | Luật Bảo hiểm xã hội số 41/2024/QH15 (cần pháp chế xác nhận) | V2 |
| `insurance.floorMode` | Sàn của nền đóng bảo hiểm | chọn | choice | Không áp sàn, chỉ cảnh báo (mặc định) · Nâng nền đóng lên lương tối thiểu vùng [chưa có] | none | accounting | có | Luật Bảo hiểm xã hội số 41/2024/QH15 (cần pháp chế xác nhận) | V2 |
| `fixed.insurance.floor` | Lương đóng BH không thấp hơn lương tối thiểu vùng | cố định | fixed |  |  | locked | — | Luật Bảo hiểm xã hội số 41/2024/QH15 (cần pháp chế xác nhận) | V2 |
| `fixed.tax.effectiveBy` | Tham số thuế và bảo hiểm áp theo tháng trả lương | cố định | fixed |  |  | locked | — | Thông tư 111/2013/TT-BTC về thời điểm tính thuế theo chi trả (cần pháp chế xác nhận) | V1-B |

## Nhóm 11. AI (soát dữ liệu, chỉ gợi ý)

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `ai.threshold.isatPerMonth` | iSAT: gắn cờ từ … lần mỗi tháng | số(times) | quantity |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.approvedLeavePerMonth` | "Nghỉ được duyệt": từ … lần mỗi tháng | số(times) | quantity |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.rejectedLookbackDays` | Khoản cùng loại bị từ chối trong … ngày gần nhất | số(day) | quantity |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.repeatedEditsRev` | Khoản chờ duyệt đã đổi từ … lần (rev) | số(count) | quantity |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.presenceGapMin` | Lệch giờ khai và Check-in từ … phút | số(minute) | quantity |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.otMedianFactor` | OT của một người từ … lần trung vị nhóm | số(count) | quantity |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.otMedianMinHours` | và ít nhất … giờ OT trong tháng | số(hour) | quantity |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.otMedianMinPeers` | chỉ so khi có ít nhất … người có OT | số(count) | quantity |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.impactVnd` | "Tác động tiền lớn" từ … ₫ | số(vnd) | money |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.slipDiffVnd` | Số sửa trên phiếu lệch từ … ₫ | số(vnd) | money |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.slipDiffRatio` | và lệch từ … % so với số tự tính | số(ratio) | percent |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.kpiFullMonths` | Tự chấm KPI 100 % từ … tháng liền | số(month) | quantity |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.netChangePct` | Thực nhận đổi quá … % so với tháng trước | số(ratio) | percent |  | rỗng | admin | có | Chủ dự án chốt mức 20% | V1-B |
| `ai.rule.<id>.enabled` | Bật luật cảnh báo | chọn | toggle | Bật (mặc định) · Tắt | rỗng | admin | có | Chính sách công ty, do C&B chọn | V1-B |
| `fixed.ai.dismissReason` | Bỏ qua cảnh báo bắt buộc ghi lý do | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.ai.lock` | AI không chạy thì khoá duyệt cả lô | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.ai.local` | AI chỉ chạy trong công ty, chỉ gợi ý | cố định | fixed |  |  | locked | — | Chủ dự án chốt ngày 14/10/2026 |  |
| `ai.limit.evidenceListMax` | AI: số mục tối đa trong một danh sách ở bằng chứng của phát hiện | số(count) | quantity |  | rỗng | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `ai.threshold.paramChangePeoplePct` | Công thức hoặc tham số đổi làm đổi thực nhận từ … % số người thì gắn "Cần xem" | số(ratio) | percent |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.formulaChangeTotalVnd` | Thay đổi cài đặt làm đổi tổng thực nhận từ … ₫ thì gắn "Cần xem" | số(vnd) | money |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.overrideEntryRoundVnd` | Số sửa phiếu tăng đúng bội của … ₫ thì gắn "giống khoản cộng thêm" | số(vnd) | money |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |
| `ai.threshold.scopeLeakMinPeople` | Thay đổi cho một chức vụ chạm từ … người ngoài chức vụ thì gắn "Cần xem" | số(count) | quantity |  | rỗng | admin | có | Đề xuất, chờ C&B chốt | V1-B |

## Nhóm 12. Phiếu lương

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `fixed.slip.template` | Mẫu phiếu: "BẢNG CHI TIẾT LƯƠNG NHÂN VIÊN" | cố định | fixed |  |  | locked | — | Quy chế công ty | Sau |
| `fixed.slip.overrideReason` | Sửa số trên phiếu bắt buộc ghi lý do | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `slip.staffVisibleFrom` | Sau khi chốt, nhân sự thấy số nào | chọn | choice | Chỉ số ước tính · Phiếu chính thức từ khi duyệt kỳ [chưa có] · Phiếu chính thức từ khi chi trả (mặc định) | afterPaid | admin | có | Chủ dự án quyết; Bộ luật Lao động 2019, Điều 95 khoản 3 về bảng kê trả lương (cần pháp chế xác nhận) | V1-B |
| `fixed.slip.estimateLabel` | Phiếu ghi rõ "ước tính" hay "đã chốt", "tính đến ngày …"; che số tài khoản | cố định | fixed |  |  | locked | — | Chủ dự án chốt |  |
| `fixed.slip.lines` | Dòng của phiếu | cố định | fixed |  |  | locked | — | Quy chế công ty |  |
| `formula.tongThuNhap` | Công thức: Tổng thu nhập | công thức | formula |  | “tổng thu nhập = tổng sáu thành phần ngày + (đi lại + chuyên ” | locked | — | Chủ dự án chốt ngày 15/10/2026: công thức là chữ gõ, hệ thống tự phân tích | V1-B |
| `formula.phuCapDiLai` | Công thức: Phụ cấp đi lại | công thức | formula |  | “đi lại = nếu loại có phụ cấp thì (nếu ở iDorm thì 0 ngược lạ” | locked | — | Chủ dự án chốt ngày 15/10/2026: công thức là chữ gõ, hệ thống tự phân tích | V1-B |
| `formula.phuCapChuyenCan` | Công thức: Phụ cấp chuyên cần | công thức | formula |  | “chuyên cần = nếu loại có phụ cấp thì (nếu giữ được chuyên cầ” | locked | — | Chủ dự án chốt ngày 15/10/2026: công thức là chữ gõ, hệ thống tự phân tích | V1-B |
| `formula.luongKpi` | Công thức: Lương KPI | công thức | formula |  | “lương KPI = nếu loại có KPI thì (nếu KPI đạt thì (nếu KPI nă” | locked | — | Chủ dự án chốt ngày 15/10/2026: công thức là chữ gõ, hệ thống tự phân tích | V1-B |
| `formula.heSoNgayKpi` | Công thức: Hệ số ngày KPI | công thức | formula |  | “hệ số ngày đi làm của KPI = nếu vượt ngưỡng giờ KPI (giờ vượ” | locked | — | Chủ dự án chốt ngày 15/10/2026: công thức là chữ gõ, hệ thống tự phân tích | V1-B |
| `formula.tyLeNgayDiLam` | Công thức: Tỷ lệ ngày đi làm | công thức | formula |  | “tỷ lệ ngày đi làm = số ngày đi làm ÷ ngày công chuẩn” | locked | — | Chủ dự án chốt ngày 15/10/2026: công thức là chữ gõ, hệ thống tự phân tích | V1-B |
| `formula.tamUng` | Công thức: Tạm ứng | công thức | formula |  | “tạm ứng = nếu bật tạm ứng thì làm tròn đồng (tỷ lệ tạm ứng ×” | locked | — | Chủ dự án chốt ngày 15/10/2026: công thức là chữ gõ, hệ thống tự phân tích | V1-B |

## Nhóm 13. Hồ sơ, hợp đồng, vòng đời

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `employeeCode.pattern` | Mẫu gợi ý mã nhân viên mới | chọn | choice | {type}{unit}{seq:2} (mặc định) · {type}{unit}{seq:3} [chưa có] · {type}{seq:4} [chưa có] · {unit}{seq:3} [chưa có] | {type}{unit}{seq:2} | admin | chưa | Chủ dự án chốt ngày 15/10/2026 | V2 |
| `employeeCode.onTypeOrUnitChange` | Khi đổi loại nhân sự hoặc chuyển đơn vị | chọn | choice | Cấp mã mới (mặc định) · Giữ mã [chưa có] | newCode | admin | chưa | Chính sách công ty | V2 |
| `employeeCode.reuseAfterLeave` | Mã của người đã nghỉ | chọn | choice | Không cấp lại (mặc định) · Cho cấp lại [chưa có] | never | admin | chưa | Chính sách công ty | V2 |
| `contract.type.<code>` | Danh mục loại hợp đồng | bảng | table |  |  | admin | — | Bộ luật Lao động 2019, Điều 20 (cần pháp chế xác nhận); cờ thuế và bảo hiểm chỉ có tác dụng từ tháng đã chọn | V2 |
| `contract.deriveFrom` | Tháng bắt đầu suy cờ thuế, BH từ hợp đồng | số(yearMonth) | quantity |  | trống | admin | chưa | Chủ dự án chốt | V2 |
| `contract.expiryWarnDays` | Nhắc hợp đồng sắp hết hạn trước … ngày | số(day) | quantity |  | 30 ngày | admin | chưa | Đề xuất, chờ C&B chốt | V2 |
| `catalog.orgUnits`, `catalog.positions`, `catalog.workLocations` | Cây đơn vị, danh mục chức danh, địa điểm làm việc | bảng | table |  | catalog.orgUnits: []; catalog.positions: []; catalog.workLocations: [] | admin | chưa | Chủ dự án chốt | V2 |

## Nhóm 14. Hệ thống (giới hạn kỹ thuật)

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `system.session.days` | Số ngày phiên đăng nhập | số(day) | quantity |  | 14 ngày | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.login.maxFailures` | Số lần đăng nhập sai tối đa mỗi (địa chỉ, tên) | số(count) | quantity |  | 5 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.login.sprayUsers` | Số tên đăng nhập khác nhau sai tối đa mỗi địa chỉ | số(count) | quantity |  | 30 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.login.windowMin` | Cửa sổ đếm đăng nhập sai (phút) | số(minute) | quantity |  | 15 phút | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.login.maxKeys` | Số khoá đăng nhập giữ trong bộ nhớ | số(count) | quantity |  | 5.000 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.http.maxBodyBytes` | Cỡ thân yêu cầu tối đa | số(bytes) | quantity |  | 1.000.000 byte | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.approval.maxDecideItems` | Số khoản tối đa một lần duyệt | số(count) | quantity |  | 200 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.page.approvals.default` | Danh sách duyệt: cỡ trang mặc định | số(count) | quantity |  | 200 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.page.approvals.max` | Danh sách duyệt: cỡ trang tối đa | số(count) | quantity |  | 500 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.page.corrections.default` | Danh sách điều chỉnh giờ: cỡ trang mặc định | số(count) | quantity |  | 50 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.page.corrections.max` | Danh sách điều chỉnh giờ: cỡ trang tối đa | số(count) | quantity |  | 100 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.backup.keep` | Số bản sao lưu giữ lại | số(count) | quantity |  | 30 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.import.maxBytes` | Cỡ tệp nhập chấm công tối đa | số(bytes) | quantity |  | 5.242.880 byte | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.reveal.maxPerHour` | Số lần xem đầy đủ thông tin nhạy cảm mỗi giờ mỗi người | số(count) | quantity |  | 30 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.audit.pageMax` | Nhật ký hệ thống: số dòng tối đa một trang | số(count) | quantity |  | 200 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.page.payslips.default` | Danh sách phiếu lương: cỡ trang mặc định | số(count) | quantity |  | 50 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.page.payslips.max` | Danh sách phiếu lương: cỡ trang tối đa | số(count) | quantity |  | 200 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.audit.pageDefault` | Nhật ký hệ thống: số dòng mặc định một trang | số(count) | quantity |  | 50 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.slipOverride.reasonRequired` | Bắt buộc lý do khi sửa số phiếu (chuyển tiếp) | chọn | toggle | Chưa bắt buộc (giao diện hiện tại chưa gửi lý do) (mặc định) · Bắt buộc (theo TK 6.5) | Không | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.params.maxChanges` | Lưu cài đặt: số thay đổi tối đa một lần Lưu | số(count) | quantity |  | 50 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.params.previewMaxPeople` | Xem trước tác động: số người tối đa trong bảng (tổng vẫn tính cả) | số(count) | quantity |  | 50 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.positions.maxCopyKeys` | Thêm chức vụ: số thay đổi tối đa một lô sao chép | số(count) | quantity |  | 200 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.events.heartbeatSec` | Kênh báo: nhịp tim (giây) | số(second) | quantity |  | 25 giây | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.positions.max` | Số chức vụ tối đa | số(count) | quantity |  | 30 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.events.retryMs` | Kênh báo: gợi ý nối lại (mili giây) | số(millisecond) | quantity |  | 3.000 ms | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.events.maxPerUser` | Kênh báo: số kết nối tối đa mỗi người | số(count) | quantity |  | 5 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.events.maxTotal` | Kênh báo: số kết nối tối đa cả máy chủ | số(count) | quantity |  | 3.000 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.events.maxBacklogBytes` | Kênh báo: byte chờ ghi tối đa của một kết nối | số(bytes) | quantity |  | 262.144 byte | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.attr.maxPerClass` | Thuộc tính của lớp: số tối đa mỗi lớp | số(count) | quantity |  | 20 | ops | — | Đề xuất, chờ C&B chốt | V1-A đọc |
| `system.auth.scryptSaltBytes` | Mật khẩu: độ dài muối scrypt (byte) | cố định(bytes) | fixed |  | 16 byte | locked | — | Giới hạn cố định của hệ thống |  |
| `system.auth.scryptKeyBytes` | Mật khẩu: độ dài khoá scrypt (byte) | cố định(bytes) | fixed |  | 64 byte | locked | — | Giới hạn cố định của hệ thống |  |
| `system.auth.usernameKeyChars` | Giới hạn đoán mật khẩu: số ký tự tên đăng nhập đưa vào khoá | số(count) | quantity |  | 80 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.auth.trustProxyMaxHops` | Số tầng máy chủ trung gian tối đa được tin | cố định(count) | fixed |  | 10 | locked | — | Giới hạn cố định của hệ thống |  |
| `system.auth.adminPasswordMinProduction` | Môi trường thật: độ dài tối thiểu mật khẩu Admin (ký tự) | số(count) | quantity |  | 12 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.auth.generatedPasswordBytes` | Mật khẩu Admin tự sinh: số byte ngẫu nhiên | cố định(bytes) | fixed |  | 12 byte | locked | — | Giới hạn cố định của hệ thống |  |
| `system.auth.sessionSecretBytes` | Khoá ký phiên tự sinh: số byte | cố định(bytes) | fixed |  | 32 byte | locked | — | Giới hạn cố định của hệ thống |  |
| `system.auth.passMarkChars` | Dấu mật khẩu trong cookie phiên: độ dài (ký tự) | cố định(count) | fixed |  | 16 | locked | — | Giới hạn cố định của hệ thống |  |
| `system.staff.bulkMax` | Gán ca hàng loạt: số người tối đa mỗi lần | số(count) | quantity |  | 200 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.entries.requireApproval` | Khoản điền thêm: bắt buộc người duyệt khác người lập | chọn | toggle | Bắt buộc người duyệt khác người lập (mặc định) · Không bắt buộc (khoản có hiệu lực ngay khi lập) | Có | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.entries.maxPerBatch` | Khoản điền thêm: số khoản tối đa mỗi lần nhập hàng loạt | số(count) | quantity |  | 200 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.entries.maxAmount` | Khoản điền thêm: số tiền tối đa mỗi khoản | số(vnd) | money |  | 100.000.000.000 ₫ | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |
| `system.entries.labelMaxLength` | Khoản điền thêm: số ký tự tối đa của nhãn | số(count) | quantity |  | 80 | ops | — | Cấu hình kỹ thuật, do bộ phận vận hành đặt | V1-A đọc |

## Nhóm 15. Luật cố định và đơn vị

| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |
|---|---|---|---|---|---|---|---|---|---|
| `unit.minutesPerHour` | Phút trong một giờ | cố định | fixed |  | 60 | locked | — | Đơn vị đo cố định |  |
| `unit.minutesPerDay` | Phút trong một ngày | cố định | fixed |  | 1.440 | locked | — | Đơn vị đo cố định |  |
| `unit.daysPerWeek` | Ngày trong một tuần | cố định | fixed |  | 7 | locked | — | Đơn vị đo cố định |  |
| `unit.percent` | Mẫu số phần trăm | cố định | fixed |  | 100 | locked | — | Đơn vị đo cố định |  |
| `unit.owedHoursEpsilon` | Giờ bù còn nợ không quá mức này (giờ) thì coi như đã cân | cố định | fixed |  | 0,001 | locked | — | Giới hạn cố định của hệ thống |  |
| `time.flexStartBeforeHour` | Vào trước … giờ (hoặc ra từ giờ bắt đầu khung đêm) thì tính ca Flex | cố định(hour) | fixed |  | 7 giờ | locked | — | Giới hạn cố định của hệ thống |  |
| `isat.weekday` | iSAT chỉ áp dụng vào thứ (0 = Chủ nhật … 6 = Thứ Bảy) | cố định | fixed |  | 6 | locked | — | Quy tắc iSAT của công ty |  |
| `unit.msPerDay` | Mili giây trong một ngày | cố định | fixed |  | 86.400.000 | locked | — | Đơn vị đo cố định |  |
| `unit.vnUtcOffsetMin` | Chênh múi giờ Việt Nam so với UTC (phút) | cố định | fixed |  | 420 | locked | — | Múi giờ Việt Nam không đổi giờ mùa hè |  |
| `money.roundTo` | Làm tròn tiền đến (đồng) | cố định | fixed |  | 1 | locked | — | Tiền tính bằng đồng nguyên; chỉ làm tròn ở bước tính thực lĩnh |  |
| `money.roundMode` | Kiểu làm tròn | cố định | fixed |  | halfUp | locked | — | Tiền tính bằng đồng nguyên; chỉ làm tròn ở bước tính thực lĩnh |  |
| `attendance.overLimitCompare` | So giờ vượt ngưỡng với ngưỡng cho chuyên cần | cố định | fixed |  | gte | locked | — | Quy tắc đã chốt: đủ ngưỡng là mất |  |
| `kpi.overLimitCompare` | So giờ vượt ngưỡng với ngưỡng cho KPI | cố định | fixed |  | gt | locked | — | Quy tắc đã chốt: vượt hẳn mới nhân tỷ lệ |  |
| `attendance.absentCompare` | So số ngày nghỉ với ngưỡng mất chuyên cần | cố định | fixed |  | gte | locked | — | Lead chốt ngày 15/10/2026 |  |
| `attendance.graceCompare` | So phút trễ với mức miễn | cố định | fixed |  | gte | locked | — | Chủ dự án chốt ngày 14/10/2026: đủ mức miễn là bị trừ |  |
| `kpi.passCompare` | So tổng điểm KPI với mức đạt | cố định | fixed |  | gte | locked | — | Quy chế lương 3P |  |
| `kpi.weworkMinCompare` | So điểm Base Wework với mức đạt | cố định | fixed |  | gte | locked | — | Quy chế lương 3P |  |
| `tax.casual.thresholdCompare` | So tổng thu nhập với ngưỡng khấu trừ 10 % | cố định | fixed |  | gte | locked | — | Nghị định 253/2026, Điều 50 khoản 2 |  |
| `tax.personalCompare` | So (chịu thuế trừ BH) với giảm trừ bản thân để phát sinh thuế | cố định | fixed |  | gt | locked | — | Luật Thuế thu nhập cá nhân số 109/2025/QH15 |  |
| `tax.insurance.skipCompare` | So số ngày không lương với ngưỡng không đóng BH | cố định | fixed |  | gte | locked | — | Luật Bảo hiểm xã hội 2024 (điều khoản cần kế toán xác nhận) |  |
| `tax.insurance.capMultiple` | Trần đóng bảo hiểm tính bằng số lần (lương cơ sở, lương tối thiểu vùng) | cố định | fixed |  | 20 | locked | — | Luật Bảo hiểm xã hội 2024; Luật Việc làm 2025 |  |
| `law.floor.otRate` | Sàn luật: hệ số OT ngày thường | cố định | fixed |  | 1,5 | locked | — | Bộ luật Lao động 2019, Điều 98 (cần pháp chế xác nhận) |  |
| `law.floor.weekendOtRate` | Sàn luật: hệ số OT cuối tuần | cố định | fixed |  | 2 | locked | — | Bộ luật Lao động 2019, Điều 98 (cần pháp chế xác nhận) |  |
| `law.floor.holidayRate` | Sàn luật: hệ số làm ngày lễ | cố định | fixed |  | 3 | locked | — | Bộ luật Lao động 2019, Điều 98 (cần pháp chế xác nhận) |  |
| `law.floor.nightPremium` | Sàn luật: phụ trội làm đêm | cố định | fixed |  | 0,3 | locked | — | Bộ luật Lao động 2019, Điều 98 (cần pháp chế xác nhận) |  |
| `law.floor.nightOtAddRate` | Sàn luật: phụ trội OT ban đêm | cố định | fixed |  | 0,2 | locked | — | Bộ luật Lao động 2019, Điều 98 (cần pháp chế xác nhận) |  |
| `law.floor.probationPayRate` | Sàn lương thử việc | cố định | fixed |  | 0,85 | locked | — | Bộ luật Lao động 2019, Điều 26 (cần pháp chế xác nhận) |  |
| `law.floor.privateLeave.marriage` | Sàn ngày việc riêng có lương: kết hôn | cố định | fixed |  | 3 | locked | — | Bộ luật Lao động 2019, Điều 115 (cần pháp chế xác nhận) |  |
| `law.floor.privateLeave.childMarriage` | Sàn ngày việc riêng có lương: con kết hôn | cố định | fixed |  | 1 | locked | — | Bộ luật Lao động 2019, Điều 115 (cần pháp chế xác nhận) |  |
| `law.floor.privateLeave.death` | Sàn ngày việc riêng có lương: cha mẹ, vợ chồng, con mất | cố định | fixed |  | 3 | locked | — | Bộ luật Lao động 2019, Điều 115 (cần pháp chế xác nhận) |  |
| `law.ceiling.otDayTotalHours` | Trần OT mỗi ngày: tổng giờ bình thường cộng OT | cố định | fixed |  | 12 | locked | — | Bộ luật Lao động 2019, Điều 107 (cần pháp chế xác nhận) |  |
| `law.ceiling.otMonthHours` | Trần OT mỗi tháng | cố định | fixed |  | 40 | locked | — | Bộ luật Lao động 2019, Điều 107 (cần pháp chế xác nhận) |  |
| `law.ceiling.fixedTermMonths` | Trần hợp đồng xác định thời hạn (tháng) | cố định | fixed |  | 36 | locked | — | Bộ luật Lao động 2019, Điều 20 (cần pháp chế xác nhận) |  |
| `law.ceiling.probationDays.manager` | Trần thời gian thử việc: quản lý doanh nghiệp (ngày) | cố định | fixed |  | 180 | locked | — | Bộ luật Lao động 2019, Điều 25 (cần pháp chế xác nhận) |  |
| `law.ceiling.probationDays.college` | Trần thời gian thử việc: cao đẳng trở lên (ngày) | cố định | fixed |  | 60 | locked | — | Bộ luật Lao động 2019, Điều 25 (cần pháp chế xác nhận) |  |
| `law.ceiling.probationDays.vocational` | Trần thời gian thử việc: trung cấp (ngày) | cố định | fixed |  | 30 | locked | — | Bộ luật Lao động 2019, Điều 25 (cần pháp chế xác nhận) |  |
| `law.ceiling.probationDays.other` | Trần thời gian thử việc: việc khác (ngày) | cố định | fixed |  | 6 | locked | — | Bộ luật Lao động 2019, Điều 25 (cần pháp chế xác nhận) |  |
| `law.ceiling.compensationShare` | Trần khấu trừ bồi thường mỗi tháng | cố định | fixed |  | 0,3 | locked | — | Bộ luật Lao động 2019, Điều 102 (cần pháp chế xác nhận) |  |
| `control.reasonMinLength` | Độ dài lý do bắt buộc: tối thiểu (ký tự) | cố định | fixed |  | 10 | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `control.reasonMaxLength` | Độ dài lý do bắt buộc: tối đa (ký tự) | cố định | fixed |  | 300 | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `leave.seniority.stepYears` | Thâm niên: +1 ngày phép mỗi … năm | cố định | fixed |  | 5 | locked | — | Bộ luật Lao động 2019, Điều 114 (cần pháp chế xác nhận) |  |
| `control.reasonRequired.reject` | Lý do bắt buộc khi từ chối | cố định | fixed |  | Có | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `control.reasonRequired.changeDecision` | Lý do bắt buộc khi đổi quyết định | cố định | fixed |  | Có | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `control.reasonRequired.aiDismiss` | Lý do bắt buộc khi bỏ qua cảnh báo AI | cố định | fixed |  | Có | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `control.reasonRequired.slipOverride` | Lý do bắt buộc khi sửa số phiếu | cố định | fixed |  | Có | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `control.reasonRequired.paramChange` | Lý do bắt buộc khi đổi tham số | cố định | fixed |  | Có | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `control.reasonRequired.periodReopen` | Lý do bắt buộc khi mở lại kỳ | cố định | fixed |  | Có | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `net.stepOrder` | Thứ tự các bước tính thực lĩnh | cố định | fixed |  | ["gross","exemptAndTaxable","insurance","pit","advance","otherDeductions","extraIncome"] | locked | — | Khung tính thực lĩnh của công ty |  |
| `net.deductionPriority` | Thứ tự ưu tiên khoản trừ khác (đề xuất, chờ pháp chế và kế toán) | cố định | fixed |  | ["courtOrder","compensation","taxSettlement","recovery","unionFee","loanRepayment"] | locked | — | Đề xuất, chờ pháp chế và kế toán chốt |  |
| `geofence.radiusM.min` | Khoảng hợp lệ của GPS: radiusM.min | cố định(meter) | fixed |  | 20 mét | locked | — | Giới hạn cố định của hệ thống |  |
| `geofence.radiusM.max` | Khoảng hợp lệ của GPS: radiusM.max | cố định(meter) | fixed |  | 5.000 mét | locked | — | Giới hạn cố định của hệ thống |  |
| `geofence.maxAccuracyM.min` | Khoảng hợp lệ của GPS: maxAccuracyM.min | cố định(meter) | fixed |  | 10 mét | locked | — | Giới hạn cố định của hệ thống |  |
| `geofence.maxAccuracyM.max` | Khoảng hợp lệ của GPS: maxAccuracyM.max | cố định(meter) | fixed |  | 1.000 mét | locked | — | Giới hạn cố định của hệ thống |  |
| `geofence.maxAccuracyM.default` | Khoảng hợp lệ của GPS: maxAccuracyM.default | cố định(meter) | fixed |  | 100 mét | locked | — | Giới hạn cố định của hệ thống |  |
| `fixed.control.reasons` | Lý do bắt buộc khi: đổi tham số, từ chối, đổi quyết định, sửa số phiếu, bỏ qua cảnh báo AI, mở lại kỳ, sửa mã nhân viên | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.control.audit` | Mọi thay đổi cấu hình, duyệt, sửa số, khoá, mở lại, hồ sơ nhạy cảm đều vào audit_log, chỉ thêm dòng | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.control.snapshot` | Phiếu của kỳ đã duyệt là bản chụp bất biến kèm phiên bản tham số và bộ máy | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.control.lock` | Tháng đã khoá không sửa được (lịch, duyệt, chấm công, tham số có hiệu lực trong tháng đó); mở lại cần quyền và lý do | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.control.noSelf` | Không ai quyết định về chính mình (duyệt, lương riêng, số sửa phiếu, vai trò, xem thông tin nhạy cảm) | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.control.defaultsMode` | params_mode = defaults-only bỏ qua mọi dòng tham số, dùng mặc định | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.control.effectiveMonth` | Tham số có tháng áp dụng; không thêm dòng có hiệu lực trong tháng đã khoá | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.control.estimate` | Mọi số là ước tính cho tới khi kỳ được chốt | cố định | fixed |  |  | locked | — | Chủ dự án chốt |  |
| `fixed.control.twoFlows` | Hai luồng Lịch ước tính và Check-in/out tách riêng, nối một chiều | cố định | fixed |  |  | locked | — | Chủ dự án chốt |  |
| `fixed.control.money` | Tiền là đồng nguyên; chỉ làm tròn ở chỗ mã đang làm tròn; thời gian là phút nguyên | cố định | fixed |  |  | locked | — | Chủ dự án chốt |  |
| `fixed.control.attendanceCorrection` | Sửa giờ chấm công bắt buộc lý do, giữ giờ bấm gốc | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `fixed.control.accountPrivacy` | Khoá tài khoản (không xoá); che số tài khoản, mã số thuế/CCCD; không lưu toạ độ GPS | cố định | fixed |  |  | locked | — | Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15; chủ dự án quyết định |  |
| `fixed.control.noBackdate` | Không đặt hiệu lực lùi vào tháng đã chốt; mở lại tháng cần quyền và lý do | cố định | fixed |  |  | locked | — | Điều khiển bắt buộc của hệ thống |  |
| `unit.msPerSecond` | Mili giây trong một giây | cố định | fixed |  | 1.000 | locked | — | Đơn vị đo cố định |  |
| `shift.allowance.basis` | Phụ cấp ca tính theo | cố định | fixed |  | assigned | locked | — | Quy chế lương |  |
| `tax.contract.basis` | Loại hợp đồng tính thuế và bảo hiểm | cố định | fixed |  | tenure | locked | — | Quy chế lương |  |
| `tax.longTermMonths` | Số tháng thâm niên để tính hợp đồng dài | cố định | fixed |  | 3 | locked | — | Quy chế lương |  |
