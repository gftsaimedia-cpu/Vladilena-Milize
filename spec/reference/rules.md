# Luật nghiệp vụ dạng lớp

> Sinh tự động bởi `scripts/docs/gen-spec.js` (`npm run spec:gen`) từ `lib/domain/**/rules/*.js` và các file `*-rule.js` (lớp kế thừa `Rule`). Đừng sửa tay: `test/unit/spec-reference.test.js` so sánh file này với bản dựng từ mã.

Mỗi luật là một lớp kế thừa `Rule` (`lib/domain/shared/rule.js`), trả về `Violation` (`block` = từ chối, `warn` = cảnh báo kèm hệ quả); `RuleSet` chạy lần lượt. Con số của luật nằm ở bộ tham số (một nguồn, ví dụ `OtLimits` trong `lib/domain/overtime/ot-limits.js`), không nằm trong luật.

## `lib/domain/overtime/rules/day-hours-cap-rule.js`

| Lớp | Mã (code) | Mô tả (chú thích trên lớp) |
| --- | --- | --- |
| [`DayHoursCapRule`](../../lib/domain/overtime/rules/day-hours-cap-rule.js#L13) | `DAY_HOURS_CAP` | Trần giờ ròng một ngày (OT + làm thêm + làm bù, không tính giờ nghỉ giữa ca). Chặn 400 DAY_HOURS_CAP. context: { limits: OtLimits, params, clean, prevDays, holidays } |

## `lib/domain/overtime/rules/isat-monthly-limit-rule.js`

| Lớp | Mã (code) | Mô tả (chú thích trên lớp) |
| --- | --- | --- |
| [`IsatMonthlyLimitRule`](../../lib/domain/overtime/rules/isat-monthly-limit-rule.js#L9) | `SHEET_ISAT_LIMIT` | Giới hạn số ngày iSAT một tháng (isat.monthlyLimit, mặc định null = không giới hạn). Chỉ CẢNH BÁO, và chỉ khi tổng TĂNG so với lịch đang lưu (dữ liệu cũ đã vượt thì vẫn lưu được ngày khác). Bộ máy không cắt theo giới hạn này: ngày iSAT vượt vẫn được trả nếu Admin duyệt. context: { params, month, clean, prevDays } |

## `lib/domain/overtime/rules/monthly-ot-cap-rule.js`

| Lớp | Mã (code) | Mô tả (chú thích trên lớp) |
| --- | --- | --- |
| [`MonthlyOtCapRule`](../../lib/domain/overtime/rules/monthly-ot-cap-rule.js#L10) | `OT_MONTH_CAP` | Trần giờ OT một tháng (OT cộng giờ ca chính làm ngày lễ). Chặn 400 OT_MONTH_CAP khi vượt trần VÀ tăng so với lịch đang lưu (dữ liệu cũ đã vượt thì vẫn lưu được ngày khác). context: { limits: OtLimits, month, clean, prevDays, holidays } |

## `lib/domain/timesheet/rules/benefit-rules.js`

| Lớp | Mã (code) | Mô tả (chú thích trên lớp) |
| --- | --- | --- |
| [`MakeupHoursBenefitRule`](../../lib/domain/timesheet/rules/benefit-rules.js#L11) | `BENEFIT_NOT_ALLOWED` | Làm bù theo giờ của ngày khai MỚI hoặc ĐỔI (máy chủ không tin giao diện). Bộ máy không kiểm cờ này nên khoản vẫn chờ Admin duyệt và, nếu được duyệt, có tiền. Câu cảnh báo kèm details.code vì giao diện đọc mã này. |
| [`OtBenefitRule`](../../lib/domain/timesheet/rules/benefit-rules.js#L25) | `BENEFIT_NOT_ALLOWED` |  |
| [`HolidayOtBenefitRule`](../../lib/domain/timesheet/rules/benefit-rules.js#L37) | `BENEFIT_NOT_ALLOWED` | Làm ngày lễ là OT: ngày lễ trong lịch khai đi làm (giờ vào – ra là khung giờ OT) cũng cần quyền lợi OT, cùng cách cảnh báo như OT ngày thường |
| [`ApprovedLeaveBenefitRule`](../../lib/domain/timesheet/rules/benefit-rules.js#L49) | `BENEFIT_NOT_ALLOWED` | Giữ ngày cũ chưa đổi loại để có thể sửa/xóa từng ngày sau khi chuyển nhóm; không cho nhóm mới thêm, chuyển loại hoặc khôi phục ngày nghỉ được duyệt |
| [`AbsenceDeclarationRule`](../../lib/domain/timesheet/rules/benefit-rules.js#L59) | `BENEFIT_NOT_ALLOWED` |  |

## `lib/domain/timesheet/rules/day-calendar-rules.js`

| Lớp | Mã (code) | Mô tả (chú thích trên lớp) |
| --- | --- | --- |
| [`MakeupDayRule`](../../lib/domain/timesheet/rules/day-calendar-rules.js#L12) | `SHEET_MAKEUP_DAY_REMOVED` `SHEET_MAKEUP_DAY_LEGACY` | Loại ngày 'makeup' (làm bù cả ngày) không còn: khai mới hoặc sửa thì chặn; ngày đã lưu gửi lại không đổi thì giữ nguyên (bộ máy tính 0) để lưu được các ngày khác |
| [`SundayRule`](../../lib/domain/timesheet/rules/day-calendar-rules.js#L30) | `SHEET_SUNDAY` |  |
| [`IsatDayRule`](../../lib/domain/timesheet/rules/day-calendar-rules.js#L40) | — | iSAT chặn cứng: chỉ vào thứ isat.weekday và chỉ chức vụ có quyền lợi iSAT; ngày iSAT đã lưu và không đổi loại giữ nguyên |
| [`OffScheduleRule`](../../lib/domain/timesheet/rules/day-calendar-rules.js#L54) | `SHEET_OFF_SCHEDULE` | Ngày ngoài lịch làm việc: chỉ được khai nghỉ không lương. Ca chính không có tiền; chỉ đoạn OT đã duyệt và có chấm công liền mạch được trả |
| [`HolidayMakeupRule`](../../lib/domain/timesheet/rules/day-calendar-rules.js#L68) | `SHEET_MAKEUP_ON_HOLIDAY` | Không khai làm bù vào ngày lễ, chặn: giờ làm bù kèm ngày đi làm, ngày làm bù dự kiến của "Nghỉ, sẽ làm bù". Bộ máy không trả giờ làm bù ngày lễ. Ngày đã lưu và không đổi (lễ thêm sau khi khai) giữ nguyên. |

## `lib/domain/timesheet/rules/extra-hours-rules.js`

| Lớp | Mã (code) | Mô tả (chú thích trên lớp) |
| --- | --- | --- |
| [`ExtraNightRule`](../../lib/domain/timesheet/rules/extra-hours-rules.js#L12) | `SHEET_EXTRA_NIGHT` | Nhóm luật về giờ làm thêm (OT, làm bù) khai quanh ca. Mỗi luật nhận DayContext. Làm bù / OT không được rơi vào khung 22h–6h (ngày đã lưu từ trước và không đổi giờ thì giữ nguyên): chỉ xét đoạn trước ca và sau ca |
| [`HolidayOtSpillRule`](../../lib/domain/timesheet/rules/extra-hours-rules.js#L31) | `SHEET_EXTRA_ON_HOLIDAY` | OT ngày lễ được khai và được trả, làm bao nhiêu giờ tính bấy nhiêu; chỉ phút nằm trong ngày lễ hưởng giá OT ngày lễ, phút sang ngày thường (sau 0 giờ) tính như OT thường. Chỉ báo (không chặn) khi đoạn OT tràn sang ngày thường kề bên, để người khai biết phần đó không hưởng giá ngày lễ. (Làm bù ngày lễ chặn ở HolidayMakeupRule.) |

## `lib/domain/timesheet/rules/overlap-rules.js`

| Lớp | Mã (code) | Mô tả (chú thích trên lớp) |
| --- | --- | --- |
| [`ConsecutiveDaysOverlapRule`](../../lib/domain/timesheet/rules/overlap-rules.js#L15) | `SHEET_DAYS_OVERLAP` | Không chặn lại cặp giờ đã lưu chưa sửa: dữ liệu đã lưu có thể gắn ca sau 0h với ngày bắt đầu ca đêm. Mỗi luật nhận SheetContext. Hai ngày liền nhau trong cùng lần lưu |
| [`MonthBoundaryOverlapRule`](../../lib/domain/timesheet/rules/overlap-rules.js#L32) | `SHEET_DAYS_OVERLAP` | Qua ranh giới tháng: ngày cuối tháng trước ↔ ngày 1 tháng này, ngày cuối tháng này ↔ ngày 1 tháng sau (chỉ kiểm khi ngày giáp ranh của tháng này vừa đổi) |

## `lib/domain/timesheet/rules/unpaid-with-leave-rule.js`

| Lớp | Mã (code) | Mô tả (chú thích trên lớp) |
| --- | --- | --- |
| [`UnpaidWithLeaveRule`](../../lib/domain/timesheet/rules/unpaid-with-leave-rule.js#L8) | `SHEET_UNPAID_WITH_LEAVE` | Phép năm: ngày phép chờ duyệt hoặc đã duyệt tính là đã dùng (chờ duyệt giữ chỗ); ngày bị từ chối trả lại phép (leaveDates). T2–T6 còn phép năm thì phải dùng phép năm, không được chọn "Nghỉ không lương" (thứ 7 chọn tự do; ngày đã lưu từ trước giữ nguyên). Phụ thuộc: leaveDates(u, { month, days }) và ledgerFor(date) trả sổ phép năm của tháng chứa date. |
