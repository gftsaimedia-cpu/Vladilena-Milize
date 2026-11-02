# Spec module Chấm công (attendance)

Tài liệu này mô tả **mã đang chạy** của phần chấm công: Check-in/out, phiên làm việc (lượt), Admin khai thay giờ có mặt, giải trình, nhãn trạng thái, giờ công thực tế và phút trừ, cổng Check-in, giờ bấm thật trên dòng ngày của phiếu. Viết từ mã. Số dòng (`file:dòng`) ứng với cây mã hiện tại. Công thức tiền (lương ngày, OT, thuế, bảo hiểm, chuyên cần) nằm ở `spec/payroll-engine.md`; ở đây chỉ ghi chỗ chấm công đưa dữ liệu vào bộ máy (mục 4.11).

Quy ước trong tài liệu:

- "Lượt" = một dòng `attendance_sessions` (một lần Check-in tới Check-out). "Ngày công" của lượt = `entry.plannedShift.date` nếu có, không thì `attendance_sessions.date` (ca đêm thuộc ngày bắt đầu ca).
- "Lịch khai" / "lịch ước tính" = `timesheets.days_json` (mỗi ngày một bản khai), đọc qua `estimateSheet` (chỉ giữ các trường khai tay `kind, shift, in, out, extraKind, extraIn, extraOut, preset, breakMin`, cộng `punchNote`, `makeupPlans`/`makeupDate`; bỏ ngày `pending`; `src/domain/payroll/payroll-service.ts`).
- `rulesFor(tháng)` = bộ quy tắc dựng từ bộ tham số hiệu lực của tháng (`src/platform/request-rules.ts`). `rulesFor()` không đối số = tháng hiện tại theo giờ VN.
- Giờ VN = UTC+7 (`unit.vnUtcOffsetMin` = 420), không có giờ mùa hè.
- Lịch làm việc của người: NV, CTV làm Thứ Hai đến Thứ Bảy; TTS làm Thứ Hai đến Thứ Sáu (`type.<loại>.dows`); Chủ nhật không bao giờ là ngày làm (`src/engine/work-schedule.ts`).

---

## 1. Phạm vi và file

### Máy chủ

| File | Việc |
| --- | --- |
| `src/domain/attendance/attendance-sessions.ts` | Tạo bảng `attendance_sessions`, `punch_requests`, thêm cột `session_id` vào `punches`/`corrections`; hàm cửa hàng của lượt (`getSession`, `openSession`, `lastSession`, `listSessions`, `createSession`, `updateSession`, `sessionPunches`, `getPunchRequest`, `savePunchRequest`, `purgePunchRequests`); đợt chuyển dữ liệu một lần từ `attendance_days` + `punches` sang lượt (`migrateAttendanceSessions`, chạy khi khởi động nếu chưa có dấu `attendance_sessions_v1`); giấu lượt Admin khai trước chưa tới giờ ra (`NOT_SCHEDULED`). Được trộn vào `src/platform/db.ts`. |
| `src/platform/db.ts` | Bảng `punches`, `corrections`, `attendance_days`, `timesheets`, `settings`; `addPunch`, `listCorrections` (, chỉ đọc lịch sử), `getSheet`/`setSheet` (/), cổng khoá kỳ `assertPeriodOpen`. |
| `src/domain/attendance/index.ts` | Hàm dùng chung cho lượt: hồ sơ cho quy tắc punch (`punchStaff`), gắn lượt bấm và điều chỉnh vào lượt (`sessionHistory`, `sessionsWithHistory`, `sessionsFor`), tự đóng lượt mở quá hạn (`closeStale`, `closeStaleIn`, `closeStaleFor`), kiểm chồng giờ (`sessionOverlap`), kiểm `version` của lượt (`correctionVersion`), gom tin realtime (`punchHints`, `hintPunch`, `announcePunches`). |
| `src/domain/attendance/session-status.ts` | Lớp `SessionStatus` (thuần, ngưỡng tiêm từ ngoài): `classify(session, { explanations, sheetDay })` trả `{ status, statusNote }` của một lượt (mục 2.7). |
| `src/domain/attendance/session-view.ts` | Lượt gửi cho màn hình: `sessionHistory`, `sessionsWithHistory`, `sessionsFor` cộng `status` / `statusNote` (`withStatus`: giải trình theo lô `session_id`, giải trình đã quyết định của ngày công, ngày khai từ `estimateSheet` mỗi người mỗi tháng một lần) và `superseded: true` (`supersededIds`). `src/modules/**/*.controller.ts` đọc lượt từ đây. |
| `src/domain/attendance/admin-presence.ts` | Lớp `AdminPresence`: tạo / sửa / xoá lượt đã đóng `origin:'sheet.onBehalf'` khi Admin khai thay lịch (`sync`) và khi Admin duyệt giải trình ngày quên chấm (`syncExplanation`). |
| `src/domain/sheet.ts` | `estimateSheet` (lịch khai đã lọc trường), `neighborDays` (ngày cuối tháng trước, ngày 1 tháng sau), `leaveSummary`. |
| `src/domain/timesheet/` (nối ở `timesheet/services.ts`) | Kiểm nghiệp vụ khi lưu lịch (`checkSheet`), kiểm giờ làm thêm (`checkExtraTimes`), mã ca của ngày Admin khai thay (`adminShiftOf`), khoá lạc quan lịch (`assertSheetRev`), định dạng `dd/mm` (`dm`). |
| `src/domain/sheet-on-behalf.ts` | Xác định người sở hữu lịch khi Admin khai thay (`sheetOwner`), duyệt ngay khoản và gọi `AdminPresence.sync` (`approveOnBehalf`, trả `{ decided, presence }`). |
| `src/domain/sheet-bulk.ts` | Admin chấm công thay nhiều người, nhiều ngày, một ca (`PUT /api/sheet/bulk`, mục 3.4b): `plan` (`parse` đầu vào và đổi mã ca thành giờ vào – ra, `owners` kiểm quyền và tìm từng người), `save` (cả lô trong một giao dịch). |
| `src/domain/overtime/hour-limits.ts` | Trần giờ làm thêm (hằng `DAY_HOURS_CAP` 12, `MONTH_OT_CAP` 40 và các hàm kiểm), giới hạn của lịch khai: iSAT tháng. |
| `src/domain/isat-rule.ts` | `isatRefusal`: ngày iSAT phải đúng `isat.weekday` và chức vụ (bậc) có `benefit.isat`; dùng ở `PUT /api/sheet`, duyệt khoản iSAT (`src/modules/sheet/sheet.controller.ts`), danh sách kiểm kỳ lương (`src/domain/period/periods.ts`). |
| `src/domain/overtime/worked-hours.ts` | Giờ ca dạng phút, khung đêm, loại ca (`shiftFor`), giờ OT của lịch (`estimateOtHours`) và của lượt (`actualOtHours`), giờ lễ + OT theo tháng. |
| `src/domain/ot.ts` | Danh sách OT ở Check-in/out (`listOt`), kiểm khai OT trên lượt (`validateOtDeclaration`). |
| `src/domain/attendance/geofence-policy.ts` | Vùng GPS khi Check-in (`checkGeofence`), làm sạch cài đặt (`cleanGeofence`), dạng xem theo người (`geofenceView`). |
| `src/domain/schedule.ts` | Lịch làm việc của một người (theo loại nhân sự) cho máy chủ, và `GET /staff/:u/schedule`: `scheduleOf`, `isWorkDay`, `isWorkDayFn`, `scheduleView`, `team`, `punchSchedule`. |
| `src/domain/shifts.ts` | Giờ ca cho nhân viên qua `/api/punch` (`employeeView(month)`) và màn Ca làm của Admin. |
| `src/domain/explanation/*` | Giải trình: lớp `Explanation` (`explanation.ts`), bảng (`migrations/postgres/0001_baseline.sql`), đọc/ghi (`explanation-repository.ts`), nghiệp vụ (`explanation-service.ts`), ngày vắng không phép giải trình được (`absent-day.ts`: `AbsentDay.stateOf`), phút Check-out muộn (`late-checkout.ts`), Check-out muộn chờ duyệt và đồng bộ lượt (`late-checkout-session.ts`, lớp `LateCheckout`), route (`src/modules/explanations/explanations.controller.ts`). |
| `src/domain/explanation/explanations.ts` | Lối vào chuyển tiếp tới `container.explanations`; xuất `lateCheckoutMin`, `needsExplanation`, `heldByUser`, `explainedByUser`, `submitLate`, `request`, `answer`, `decide`. |
| `src/domain/container.ts` | Dựng lười `explanations`, `explanationRepository`, `lateCheckout`, `adminPresence`, `sessionStatus` với phụ thuộc tiêm qua constructor; dựng lại khi `store.db` đổi. |
| `src/platform/announce.ts` | `announceSetting` (tin `params.changed`), `attendanceHints` / `announceAttendance` (tin `attendance.changed` kind `forgot`; không nơi nào thêm gợi ý, mục 8). |
| `src/modules/attendance`, `src/modules/sheet`, `src/modules/settings`... (controller) | Route `/api/punch`, `/api/sheet`, `/api/me/estimate`, `/api/ot`, `/api/today`, `/api/attendance`, `/api/team`, `/api/alerts`, `/api/settings/geofence`, `/api/holidays`; hàm `checkInDay`, `checkInVerdict`, `punchState`, `punchExtras`, `cutRuleView`, `actualReportView`, `checkoutPreview`, `cleanDays`, `holidayOtConflicts`; dọn `punch_requests` định kỳ. |
| `src/platform/authz.ts` | `ROUTE_CAPS` (quyền từng route, `periodScope`). |
| `src/platform/warnings.ts` | `warnIf` / `warn` / `selfDecision` / `optionalReason`: ghi cảnh báo vào phản hồi, chạy tiếp. |
| `src/domain/payroll/payroll-service.ts` | Nạp lượt vào đầu vào tính lương, ngày giữ vì giải trình (`heldFor`,), `estimateDays`. |
| `src/domain/payroll/slip-paid.ts` | Gắn giờ bấm thật vào dòng ngày của bản chụp phiếu khi đọc (`withPunchTimes`,), cùng bốn cột tiền của dòng ngày (`dayRowsOf`). |
| `src/domain/period/periods.ts` | Danh sách kiểm kỳ (`checklist`,): đếm lượt mở, quên chấm, chờ đối soát, giải trình chưa quyết định, iSAT sai. |

### Dùng chung trình duyệt và máy chủ (UMD, `public/`)

| File | Việc |
| --- | --- |
| `src/engine/punch.ts` | Quy tắc Check-in/out (`PunchRules`): bảng ca, ngày công của lần Check-in, ca dự kiến, dựng ngày từ khoảng có mặt, quên Check-out, khung Check-in, cảnh báo Check-out sớm, khoảng cách GPS. |
| `src/engine/actual-hours.ts` | `ActualHours`: tính ngày hiệu lực từ lịch khai + lượt (`apply`), số phút trừ (`cutMin`), phút trễ để hiển thị (`lateMinutes`), giờ bấm thật từng ngày (`punchTimesOf`). |
| `src/engine/work-schedule.ts` | `WorkSchedule`: ngày nào là ngày làm của loại nhân sự, ngày công chuẩn. |
| `src/engine/payroll-calendar.ts` | `PayrollCalendar`: kiểm ngày/tháng, tách giờ ca chính và đoạn làm thêm theo ngày lễ / khung đêm. |
| `src/engine/attendance-status.ts` | `AttendanceStatus` (trình duyệt và test): `LABEL` (sáu nhãn), `DAY_ORDER`, `TONE`, `statusOf` (đọc `session.status`; thiếu trường thì `entry.kind 'pending'` (trừ `reason 'open'`) ⇒ Chờ xử lý, còn lại theo `state`), `labelOf`, `noteOf`, `dayStatus` (nhãn ô ngày, bỏ qua lượt `superseded`), `dayNotes`. |
| `src/engine/payroll-engine.ts` | Bộ máy lương: chạy `ActualHours.apply` trong `computeMonth`, áp ngày giữ vì giải trình, đếm ngày công trong `calcMonth` (ngoài phạm vi, chỉ ghi điểm nối). |
| `src/engine/approval-view.ts` | `payView`: bỏ / đổi khoản tự khai chưa duyệt trước khi `ActualHours.apply` chạy (ngoài phạm vi, chỉ ghi điểm nối). |

### Giao diện dùng module (chỉ đọc, không tính tiền)


---

## 2. Dữ liệu

### 2.1 Bảng

**`attendance_sessions`** (`src/domain/attendance/attendance-sessions.ts`)

| Cột | Ý nghĩa |
| --- | --- |
| `id` | khoá, cũng trả ra là `sessionId` |
| `username` | người chấm |
| `date` | ngày công `YYYY-MM-DD` (ca đêm: ngày bắt đầu; lượt ngoài ca: ngày VN của giờ vào) |
| `state` | `open` \| `closed` (CHECK) |
| `entry_json` | toàn bộ nội dung lượt (bảng 2.2) |
| `version` | khoá lạc quan, `updateSession` tăng 1 mỗi lần ghi |
| `legacy_key` | UNIQUE, chỉ dòng do đợt chuyển dữ liệu tạo (`day:<u>:<d>`, `punch:<idIn>:<idOut>`, `open:<id>`) |
| `created_at`, `updated_at` | ISO |

Chỉ mục: `session_one_open` UNIQUE (username) WHERE state='open' ⇒ **mỗi người tối đa một lượt mở**; `session_user_date (username,date,id)`; `punches_session`, `corrections_session`.

**`punches`** (`src/platform/db.ts`, cột thêm `context_json`, `session_id` `src/domain/attendance/attendance-sessions.ts`): một dòng mỗi lần bấm, chỉ thêm, không sửa. `type` `in`/`out`; `auto` 1 = máy chủ tự đóng lượt quá hạn; `context_json` = `{ plannedShift }` (lượt Check-out muộn thêm `lateCheckout: true`); `ip` chỉ tham khảo.

**`punch_requests`** (`src/domain/attendance/attendance-sessions.ts,31`): `(username, request_id)` khoá; `operation` = JSON `{type, sessionId}`; `response_json` = `punchState` lúc trả; `created_at` (dòng không có `created_at` không bao giờ bị dọn).

**`corrections`** (`src/platform/db.ts`, thêm `context_json`, `session_id`, `session_version`): lịch sử yêu cầu điều chỉnh giờ. Không có route ghi; vẫn được đọc ra ở `GET /api/sheet` và trong `sessionHistory`, và quyết định đã có vẫn tham gia nhãn lượt.

**`attendance_days`** (`src/platform/db.ts`): dữ liệu của bản lưu giờ chấm công tách khỏi lịch, chỉ còn là nguồn của đợt chuyển dữ liệu.

**`timesheets`** (`src/platform/db.ts`, `getSheet`/`setSheet`): `days_json`, `kpi_pct`, `kpi_amt`, `kpi_adm_pct`, `kpi_adm_amt`, `rev`. `setSheet` tăng `rev` mỗi lần lưu.

**`explanations`** (`migrations/postgres/0001_baseline.sql`): `id, username, date, kind ('late-checkout'|'admin'|'ai'), session_id, prompt, rule_id, requested_by, requested_at, status ('requested'|'answered'|'approved'|'rejected'), answer, answered_at, decided_by, decided_at, decision_note, rev`.

**`sheet_approvals`** (`src/domain/approvals/approvals.ts`): trạng thái duyệt khoản tự khai của lịch (module duyệt, không mô tả ở đây).

### 2.2 Nội dung `entry_json` của lượt

| Trường | Ai ghi | Ý nghĩa |
| --- | --- | --- |
| `kind` | `PunchRules` | `work` (đủ ca, ngày trong lịch), `makeup` (đủ ca, ngày ngoài lịch: chỉ đoạn làm thêm đã duyệt được trả), `pending` (chưa xác nhận) |
| `reason` | | với `pending`: `open`, `forgot-out`, `off-shift`, `incomplete-shift`, `multiple-sessions`, `legacy-review` (từ đợt chuyển dữ liệu), `needs-review` (được nhận diện, không đường nào tạo ra) |
| `src` | | `punch` (bấm thật), `admin` (lượt Admin ghi) |
| `presIn`, `presOut` | | giờ có mặt ISO UTC, giữ đúng tới giây |
| `plannedShift` | lúc Check-in | `{ code, date, in, out, startIso, endIso, kind: 'work'|'makeup' }` ghi lại lúc Check-in; đổi ca trong hồ sơ không đổi lượt đang có |
| `outsideShift`, `assignedShift` | Check-in ngoài khung ca / ngoài lịch | `outsideShift: true`, `assignedShift` = `planShift` của ngày VN thực (có thể null) |
| `in`, `out`, `preset`, `breakMin`, `extraKind/In/Out`, `attendanceConfirmed`, `attendanceApproved` | `buildDay` khi lượt đủ điều kiện | ca được gán (hoặc ca Admin chọn) làm căn cứ; `attendanceApproved` chỉ khi thiếu giờ và `approveIncomplete` |
| `outsideZone` | Check-in | `true` khi GPS không đạt |
| `requestedOut` | Check-out muộn | giờ bấm chờ Admin duyệt giải trình |
| `origin`, `declaredBy`, `declaredAt`, `explanationId` | AdminPresence | `origin: 'sheet.onBehalf'` đánh dấu lượt Admin; `explanationId` chỉ có ở lượt ghi do duyệt giải trình ngày |
| `otDeclaration`, `otNeedsReview`, `otReview`, `otDeclarationHistory`, `otHistory` | `POST/PUT /api/ot` | khai và duyệt OT ở Check-in/out |

### 2.3 Trạng thái lượt và chuyển trạng thái

```
(không có) --Check-in trong khung ca, ngày trong lịch--> open, pending/open, có plannedShift
(không có) --Check-in ngoài khung, có khoản ot / makeup_hours đã duyệt phủ giờ bấm--> open, pending/open, outsideShift
open --Check-out không muộn--> closed + entry do LateCheckout.closedEntry:
        outsideShift hoặc không plannedShift  -> pending/off-shift (giữ presOut)
        buildDay: đủ ca -> work|makeup (attendanceConfirmed)
                  thiếu giờ -> pending/incomplete-shift
                  không chồng ca -> pending/off-shift
        trùng ca với lượt thật khác -> pending/multiple-sessions
open --Check-out muộn quá CHECKOUT_GRACE_MIN--> closed, pending/forgot-out, requestedOut, không presOut
open --mở quá attendance.openSessionMaxHours--> closed, pending/forgot-out (closeStale), punch auto
closed pending/forgot-out + requestedOut --giải trình được duyệt--> closed + closedEntry(requestedOut) (giữ requestedOut)
closed (presOut === requestedOut) --quyết định đổi sang không duyệt--> closed pending/forgot-out
(không có) --Admin khai thay ngày đi làm có giờ--> closed, src admin, origin sheet.onBehalf
(không có) --duyệt giải trình ngày quên chấm--> closed, src admin, origin sheet.onBehalf, explanationId
lượt Admin --Admin khai thay lại ngày đó--> sửa (updateSession) hoặc xoá (DELETE ... AND origin=?)
lượt Admin có explanationId --giải trình đổi sang không duyệt--> xoá
```

Không có route nào mở lại lượt đã đóng hay xoá lượt bấm thật.

### 2.4 Settings và cấu hình

| Khoá | Nơi đọc | Ghi chú |
| --- | --- | --- |
| `settings.holidays` | khắp nơi | mảng ngày lễ |
| `settings.geofence` | `src/domain/attendance/geofence-policy.ts` | `{lat,lng,radiusM,maxAccuracyM}` hoặc null |
| `settings.attendance_sessions_v1` | `src/domain/attendance/attendance-sessions.ts` | dấu đã chạy đợt chuyển dữ liệu |
| `config.CHECKOUT_GRACE_MIN` = 30 | `src/platform/config.ts` | phút Check-out muộn cho phép |
| `config.PUNCH_REQUEST_KEEP_DAYS` = 30, `PUNCH_REQUEST_PURGE_MS` = 86400000 | | dọn `punch_requests` |
| `config.SQL_IN_CHUNK` = 500 | | số id mỗi câu `IN` |

### 2.5 Bộ nhớ đệm

- `rulesFor(tháng)`: mỗi yêu cầu HTTP nhớ một bản mỗi tháng (`AsyncLocalStorage`, `src/platform/request-rules.ts`).
- `PunchRules.create`, `ActualHours.create`, `WorkSchedule.create`, `PayrollCalendar.create`: nhớ theo đối tượng bộ tham số (`WeakMap`).
- `container`: dựng mỗi dịch vụ một lần, dựng lại khi `store.db` đổi (`src/domain/container.ts`).
- `punchHints` (Map trong tiến trình, `src/domain/attendance/index.ts`): gom (người, ngày) đã đổi trong một yêu cầu, phát sau khi yêu cầu xong.

### 2.6 Tham số registry dùng trong module (giá trị mặc định)

| Khoá | Mặc định | Dùng ở |
| --- | --- | --- |
| `shift.preset.<n1|n2|f1|f2|g1|g2>.in/.out` | 08–17, 10–19, 06–15, 13–22, 21–06, 22–07 | `punch.ts` `SHIFT`, `actual-hours.ts` `SHIFT_TIMES` |
| `shift.alias.<mã mới>` | (không có) | đổi mã ca trong danh mục (`Normal1`…`Night2` và ca thêm) → khoá giờ ca (`punch.ts`) |
| `attendance.openSessionMaxHours` | 16 | quên Check-out |
| `attendance.earlyCheckinMaxHours` | 4 | khung Check-in sớm |
| `attendance.graceMin` | 15 | phút miễn trừ |
| `attendance.stepMin` | 30 | bậc làm tròn phút trừ |
| `attendance.cutRounding` | `halfUpStep` | `halfUpStep` \| `ceilStep` \| `exact` |
| `attendance.lateEarlyRule` | `separate` | `separate` \| `combined` |
| `attendance.gapRule` | `step` | `step` \| `exact` \| `ignore` |
| `attendance.missingAllRule` | `absent` | `declared` \| `absent` \| `pending` |
| `attendance.offScheduleRule` | `unpaid` | `unpaid` \| `declared` |
| `attendance.beyondShiftRule`, `extraWindowRule`, `extraSourceRule`, `futureDaysRule`, `declaredLeaveRule`, `missingOneSideRule`, `undeclaredPunchRule` | `cap8`, `continuous`, `calendar`, `none`, `declared`, `pending`, `report` | chỉ có một giá trị hợp lệ; mã không rẽ nhánh theo chúng |
| `holiday.makeupRate` | 3 | hệ số giờ làm bù rơi ngày lễ (`makeupHolidayRate`, 1–10) |
| `time.workHoursPerDay` | 8 | một công = 480 phút |
| `time.breakAfterWorkHours`, `time.breakHours` | 4, 1 | nghỉ MỘT lần 60 phút sau 240 phút làm |
| `time.nightStartHour`, `time.nightEndHour` | 22, 6 | khung đêm của `PayrollCalendar` |
| `law.ceiling.otDayTotalHours`, `law.ceiling.otMonthHours` | 12, 40 | hai trần giờ làm duy nhất (`DAY_HOURS_CAP`, `MONTH_OT_CAP`, `src/domain/overtime/hour-limits.ts`), chặn 400 |
| `isat.monthlyLimit` | null | không giới hạn |
| `isat.weekday` | 6 | iSAT chỉ Thứ Bảy |
| `type.<nv|ctv|tts>.dows` / `.workdays` / `.workdaysMode` | NV, CTV: T2–T7, 26 ngày; TTS: T2–T6, 22 ngày; `fixed` | lịch làm việc |
| `unit.*` | 60, 1440, 86400000, 420 | đơn vị |

---

## 3. API

Quy tắc chung (mọi route dưới đây, `src/modules/**/*.controller.ts`):

- Cổng quyền: route không có trong `ROUTE_CAPS` ⇒ 403 `NO_ROUTE_POLICY`; chưa đăng nhập ⇒ 401; thiếu năng lực ⇒ 403 `FORBIDDEN_CAP` (kèm `cap`). `self-or:<nl>` và `authenticated` để handler tự giới hạn.
- Lệnh ghi (khác GET) bị giới hạn tốc độ theo người: 429 `WRITE_RATE_LIMITED` (trừ route trong `UNLIMITED_WRITE_ROUTES`).
- Lỗi trả `{ error, ...details }`; lỗi có mã của store / DomainError trả `{ error, code, ...details }`.
- Phản hồi 2xx dạng đối tượng mang thêm `warnings: [{ code, message, severity, details? }]` khi có cảnh báo (`src/platform/http.ts`).
- **Khoá kỳ** (`guardPeriod`, `src/http/api-gate.ts`) chỉ ở route có `periodScope`: với scope `attendance`, tháng bị khoá khi kỳ của tháng có trạng thái từ `attendance_locked` trở lên (`src/platform/db.ts,1080`). Lưu và thêm cảnh báo `PERIOD_LOCKED` `{ month, status, scope }`; kỳ `approved`/`paid` thêm `PERIOD_FROZEN` (`warnFrozen`, `src/modules/periods/periods.helpers.ts` / `src/http/api-gate.ts`).

### 3.1 `GET /api/punch` — quyền: `authenticated`

- Không phải `payrollSubject` ⇒ 200 `{ enabled:false, canCheckIn:false, openSession:null, lastSession:null, serverNow }`.
- Gọi `closeStale(u)` (có thể GHI: đóng lượt quá hạn) rồi trả `{ ...punchState(u), ...punchExtras(u) }` (`src/modules/attendance/attendance.controller.ts`).
- `punchState` (`src/modules/attendance/attendance.controller.ts`): `enabled:true`, `canCheckIn` (= không có lượt mở và quyền Check-in mục 3.2b cho phép), `checkInBlock` (câu lý do) cùng `checkInCode` (chỉ có khi không có lượt mở và bị chặn), `checkInEntitlement` (chỉ có khi `canCheckIn`; ngày công xét là ngày `openSessionDay` gán cho một lượt Check-in lúc này), `openSession`, `lastSession` (kèm `punches`, `corrections`, `status`, `statusNote`), `open: { id, at, since, date, plannedShift } | null`, `date`, `workDate`, `scheduled` (ngày đó trong lịch của người), `record` (entry của lượt mở, hoặc lượt gần nhất), `sunday:false`, `outside:''` (hằng), `done: { in, out } | null` (lượt gần nhất đã có giờ ra), `pending` (reason khi lượt gần nhất là `pending`).
- `lastSession` = lượt có `COALESCE(presOut, presIn, created_at)` lớn nhất, bỏ lượt Admin chưa tới giờ ra (`src/domain/attendance/attendance-sessions.ts`): lượt Admin đã qua giờ ra có thể là "lượt gần nhất".
- `punchExtras` (`src/modules/attendance/attendance.controller.ts`, không lưu vào bản phát lại): `serverNow`, `cutRule` (bảng phút trừ của tháng hiện tại, `cutRuleView`: `{ graceMin, stepMin, shiftWorkMin, rounding, table[0..480] }`), `shiftConfig` (`shiftsDomain.employeeView`: giờ ca và hai ngưỡng Check-in), `checkoutPreview` (: `{ early, cutEnd, cutStart, paidMin }` nếu Check-out lúc này, hoặc null).

### 3.2 `POST /api/punch` — quyền: `authenticated`, periodScope `attendance`

Input: `{ type: 'in'|'out', requestId, sessionId? (bắt buộc với out), location?: {lat,lng,accuracy} (in), explanation? (out muộn) }`. Output: như `GET /api/punch` (phần `punchState` lấy từ bản phát lại nếu `requestId` đã dùng; `punchExtras` luôn lấy mới).

Trình tự (`src/modules/attendance/attendance.controller.ts`), tất cả trong MỘT giao dịch:

1. Không `payrollSubject` ⇒ 403 (Admin: "Admin không chấm công").
2. `type` sai hoặc `requestId` không khớp `/^[A-Za-z0-9._:-]{8,120}$/` ⇒ 400. `out` thiếu `sessionId` số nguyên dương ⇒ 400.
3. `operation = JSON.stringify({type, sessionId: out ? sessionId : null})`. Đã có `punch_requests` cùng `requestId`: khác `operation` ⇒ 409 "requestId đã dùng cho thao tác khác"; trùng ⇒ trả lại `response_json` cũ, không ghi gì.
4. `closeStale(u)`.
5. **Check-in**: `checkGeofence(location)` (mục 4.9) → có lượt mở ⇒ 409 "Bạn đang có lượt mở — Check-out trước" → `openSessionDay(punchStaff(u), now)` → `checkInVerdict(u, now)` (409 `CHECKIN_NOT_ALLOWED` hoặc `CHECKIN_OUTSIDE_SHIFT`, mục 3.2b) → `guardPeriod(opened.date)` → cờ `outsideZone` → `sessionOverlap(u, now, now+1ms)` khác rỗng ⇒ 400 (câu "Giờ có mặt chồng với lượt ngày …") → `createSession(open)` → `addPunch('in', ip, context {plannedShift})`.
6. **Check-out**: lượt không có / của người khác ⇒ 404; đã đóng ⇒ 409 "Lượt này đã Check-out"; `guardPeriod(session.date)`; giờ ra < `presIn` ⇒ 400. Lấy ngày khai của lịch (`estimateSheet(...).days[session.date]`). Nếu `needsExplanation(session, now, sheetDay)` ⇒ `LateCheckout.record` (mục 4.7), ngược lại `LateCheckout.checkOut`. Máy chủ **không** chặn hay hỏi gì khi Check-out sớm: hộp xác nhận nằm ở giao diện (mục 4.14).
7. `hintPunch(u, session.date)`; `response = punchState(u)`; `savePunchRequest`.

**3.2a Cổng ngày của Check-in** (`checkInDay`, `src/modules/attendance/attendance.controller.ts`; do `checkInVerdict` gọi). Ngày công mà lượt nhận (`opened.date`: ca đêm thuộc ngày bắt đầu ca, lượt ngoài khung ca thuộc ngày bấm) phải thoả MỘT trong hai:

- ngày làm việc trong lịch được gán (`schedule.isWorkDay`, lịch theo loại nhân sự; Chủ nhật không bao giờ là ngày làm) và không nằm trong `settings.holidays`; hoặc
- ngày có khoản `ot` (kể cả OT ngày lễ) hoặc `makeup_hours` ở trạng thái `approved` theo `sheetApprovals` (khoản Admin khai thay được duyệt ngay khi lưu nên được tính).

Ngày tự khai đi làm không có khoản duyệt, khoản chờ duyệt hay bị từ chối đều không mở Check-in. Không đạt ⇒ 409 `CHECKIN_NOT_ALLOWED` với câu "Hôm nay bạn không có lịch làm việc hay giờ OT/làm bù được duyệt nên không Check-in được."; giao dịch hoàn tác nên không có lượt, lượt bấm hay `requestId` nào được ghi.

Ngày nghỉ cả ngày cũng đóng Check-in, trừ khi ngày đó có khoản `ot` hoặc `makeup_hours` đã duyệt:

| Loại ngày khai | Đóng Check-in khi |
| --- | --- |
| `isat`, `leave` (nghỉ phép năm), `unpaid` (nghỉ không lương) | khoản không bị `rejected` (chờ duyệt, đã duyệt, hoặc khai mà chưa có khoản duyệt) |
| `approved` (nghỉ được duyệt), `willmakeup` (nghỉ, sẽ làm bù) | khoản ở trạng thái `approved` |

Câu báo: "Hôm nay bạn <nghỉ iSAT | nghỉ phép năm | nghỉ không lương | nghỉ được duyệt | nghỉ, sẽ làm bù>, không Check-in được." Check-out lượt đang mở, chấm công và khai thay của Admin không qua cổng này.

**3.2b Quyền Check-in theo giờ bấm** (`CheckinEntitlement.decide`, `src/domain/attendance/checkin-entitlement.ts`; `src/modules/attendance/attendance.controller.ts` gọi qua `checkInVerdict` ở bước 5 và trong `punchState`, nên `GET /api/punch` và `POST /api/punch` luôn cùng kết luận). Được Check-in khi một trong hai:

- giờ bấm nằm trong khung ca được gán (`PunchRules.checkInMsg` = '': từ `start − attendance.earlyCheckinMaxHours` đến trước `end` của lần ca gần giờ bấm nhất) và ngày công của lượt qua cổng 3.2a: quyền `shift` (ngày ngoài lịch hay ngày lễ không có khung ca: chỉ khoảng giờ của khoản đã duyệt mới cho Check-in);
- giờ bấm nằm trong khoảng giờ của khoản `ot` hoặc `makeup_hours` đã duyệt của ngày bắt đầu ca (xét ngày hôm trước, hôm nay, hôm sau của giờ bấm): trước ca `[extraIn, in)`, sau ca `[out, extraOut)` tính từ giờ ca của ngày khai; quyền `ot` / `makeup_hours`. Ngày lễ có OT đã duyệt: cả khung `[extraIn hoặc in, extraOut hoặc out)`, vì giờ vào – ra của ngày lễ là khung OT.

Không đạt ⇒ 409, không ghi gì. `CHECKIN_OUTSIDE_SHIFT` khi ngoài khung ca (kể cả chưa gán ca) và không khoản đã duyệt nào phủ giờ đó (có khoản chờ duyệt phủ giờ đó thì câu báo nói đang chờ duyệt); `CHECKIN_NOT_ALLOWED` khi ngày công không qua cổng 3.2a trong khung ca, hoặc ngày đã khai nghỉ cả ngày. `GET /api/punch` trả `canCheckIn`, và khi không có lượt mở: `checkInBlock` (câu báo) cùng `checkInCode` khi bị chặn, `checkInEntitlement` (`shift` | `ot` | `makeup_hours`) khi được. Lượt qua cổng bằng khoản ngoài khung ca vẫn là lượt `outsideShift` (cần giải trình lúc bấm, Check-out ra `pending/off-shift`). Admin khai thay và `adminPresence` không qua cổng này.

Lỗi chính: 400 / 403 / 404 / 409 nêu trên; 409 `CHECKOUT_NEEDS_EXPLANATION` `{ sessionId, lateMin, graceMin }`; 400 `EXPLANATION_TEXT_TOO_LONG` (> 500 ký tự); 409 `SESSION_STALE`; 409 `SESSION_OVERLAP` (giải trình đã duyệt nhưng giờ chồng lượt khác). Lỗi làm hoàn tác giao dịch, nên `requestId` chưa được lưu và có thể gửi lại.

### 3.3 `GET /api/sheet?month=&user=` — quyền: `self-or:attendance.read`

- `month` sai ⇒ 400. `user` mặc định chính mình.
- Người ngoài bảng lương xem chính mình và không có `attendance.read` ⇒ 200 với lịch rỗng, `payrollSubject:false`.
- Xem người khác cần `attendance.read` ở phạm vi người đó ⇒ không thì 403.
- Nếu người được xem là `payrollSubject`: `closeStale(staff)` (có thể GHI).
- Output (`src/modules/sheet/sheet.controller.ts`): các trường lịch của `sheetForViewer` (`days`, `kpiPct`, `kpiAmt`…), `rev`, hồ sơ tóm tắt người được xem (khi xem người khác), `attendanceSessions` (lượt của tháng kèm `punches`, `corrections`, `status`, `statusNote`, `superseded`), `otherLeave`, `neighbors`, `workSchedule` + `scheduledDates`, `kpiWeights`, `kpiParts`, `corrections` (lịch sử của tháng), `approvals` (trạng thái duyệt từng ngày), `leaveBalance`, `actualReport` (`{ report, missing, absent }` từ `actualReportView`), `cutRule`.

### 3.4 `PUT /api/sheet` — quyền: `authenticated`, periodScope `attendance`

Input: `{ month, days, kpiPct?, kpiAmt?, user? (khai thay), expectedRev?, confirmDays?, preserveKpi? }`. `preserveKpi:true` chỉ dùng với lịch của chính người gọi, không gửi kèm `kpiPct` / `kpiAmt`; máy chủ giữ giá trị KPI đang lưu mà không đưa chúng vào phản hồi. Output: `{ ok, rev, approvals, reset, resubmitted, removed, onBehalf?, autoApproved?, warnings? }`.

Trình tự (`src/modules/sheet/sheet.controller.ts`):

1. `month` sai ⇒ 400.
2. `sheetOwner(caller, user)` (`src/domain/sheet-on-behalf.ts`): `user` không phải chuỗi ⇒ 400; khác người gọi mà người gọi không có `request.decide.*` ở phạm vi người đó ⇒ 403 `FORBIDDEN_CAP`; tên sai ⇒ 400; không có ⇒ 404; không thuộc bảng lương ⇒ 400.
3. `guardPeriod(month)`.
4. `cleanDays(days)` (mục 4.4) — lỗi định dạng luôn 400.
5. `checkSheet` (mục 4.5) — kiểm nghiệp vụ là cảnh báo; vài lỗi chặn cứng.
6. `checkSheetLimits` (mục 4.5.3).
7. Khai thay: giữ nguyên `kpiPct`, `kpiAmt` đang lưu của người được khai. Nếu người gọi lưu lịch của chính mình với `preserveKpi:true`, máy chủ cũng giữ nguyên hai trường đó từ DB; yêu cầu này không được kèm KPI fields, không đọc hay trả KPI cho client.
8. Giao dịch: `assertSheetRev` (lệch ⇒ 409 `SHEET_STALE` `{ rev }`; `expectedRev` không phải số nguyên ≥ 0 ⇒ 400; thiếu thì ghi đè) → `setSheet` → `approvals.reconcile(declaredItems(clean, {holidays, staffType, schedule}))` → nếu khai thay: `approveOnBehalf` (duyệt ngay khoản người gọi có quyền, `AdminPresence.sync`, nhật ký `sheet.onBehalf`). `confirmDays` sai dạng ⇒ 400; lượt Admin đã đổi so với bản đã đọc ⇒ 409 `SESSION_STALE`.
9. Sau giao dịch: `approvals.changed` nếu có thay đổi duyệt; khai thay thêm `estimate.changed` (người được khai) và `request.decided`.

Lưu ý: lưu lịch của nhân viên **không** tạo, sửa hay xoá lượt chấm công nào; chỉ khai thay của Admin đụng tới lượt (qua `AdminPresence`).

### 3.4b `PUT /api/sheet/bulk` — quyền: `request.decide.*` (cổng), periodScope `attendance`

Admin chấm công thay nhiều người, nhiều ngày, một ca trong một lần. Input: `{ month, usernames, days, confirmDays?, expectedRevs? }`; `days` = `{ 'YYYY-MM-DD': { kind: 'work', preset } }` (1..31 ngày thuộc `month`, mỗi ngày chỉ có hai khoá `kind` và `preset`, không nhận giờ tự nhập). Output: `{ ok, month, results, warnings? }`; mỗi phần tử `results` (cùng thứ tự `usernames`) là `{ username, rev, autoApproved, reset, resubmitted, removed, presence: { set, removed, skipped }, skipped: [{ date, kind }] }`.

Trình tự (nhánh `PUT /sheet/bulk` của `src/modules/sheet/sheet.controller.ts`, `src/domain/sheet-bulk.ts`):

1. Cổng `ROUTE_CAPS`: thiếu `request.decide.*` ⇒ 403 `FORBIDDEN_CAP` trước khi đọc thân. Route nằm trong `HEAVY_ROUTES` (máy chủ nghẽn ⇒ 503 + `Retry-After`).
2. `parse`: thân không phải object hoặc `month` sai ⇒ 400; `usernames` rỗng ⇒ 400 `USERNAMES_REQUIRED`; nhiều hơn `system.staff.bulkMax` (200) ⇒ 400 `TOO_MANY`; tên sai dạng hoặc lặp ⇒ 400; `days` rỗng, quá 31 ngày, ngày ngoài tháng, giá trị khác `{ kind:'work', preset }` ⇒ 400 `BULK_DAY_INVALID`; `preset` không có trong bảng ca ⇒ 400 `SHIFT_UNKNOWN`; ngày sau hôm nay (giờ Việt Nam) ⇒ 400 `BULK_DAY_FUTURE`; `expectedRevs` không phải `{ tên trong danh sách: số nguyên ≥ 0 }` hoặc `confirmDays` sai ⇒ 400 (`confirmDays` mặc định là mọi ngày của `days`). Mã ca đổi sang mã của danh mục (`canonicalOf`); giờ vào – ra của ngày lấy từ bảng ca.
3. `owners`: mỗi người cần `request.decide.*` ở phạm vi người đó ⇒ không thì 403 `FORBIDDEN_CAP` kèm `username` (trước khi tìm người); không có tài khoản ⇒ 404 `STAFF_NOT_FOUND` `{ missing }`; không thuộc bảng lương ⇒ 400 `NOT_PAYROLL_SUBJECT` `{ usernames }`.
4. `guardPeriod(month)`.
5. Một giao dịch cho cả lô, lần lượt từng người: `assertSheetRev` với `expectedRevs[tên]` (lệch ⇒ 409 `SHEET_STALE` `{ username, rev }`) → lịch mới = lịch ước tính đang lưu cộng các ngày được chấm (ngày đã khai `work` chỉ đổi `in`, `out`, `preset`, giữ phần làm thêm, `breakMin`, giải trình; ngày đang khai khác `work` không bị ghi đè và được trả ở `skipped`) → `cleanDays` → `checkSheet` (`onBehalf`) → `checkSheetLimits` → `selfDecision` khi người đó là chính người gọi → `setSheet` (giữ `kpiPct`, `kpiAmt`) → `reconcile` → `approveOnBehalf` (`presence` = kết quả `AdminPresence.sync`). Cuối giao dịch: một dòng nhật ký `sheet.onBehalfBulk` `{ people, days, shifts }` (`entityId` = tháng); mỗi người còn dòng `sheet.onBehalf` như `PUT /api/sheet`.
6. Tất cả hoặc không: một lỗi cứng của bất kỳ người nào (400 `DAY_HOURS_CAP`, `OT_MONTH_CAP`, `EXTRA_WRONG_SIDE`…, 409 `SHEET_STALE`, 409 `SESSION_STALE`) hoàn tác cả lô; thân lỗi mang `username` (và `date` nếu có), `error` mở đầu bằng họ tên người đó. Cảnh báo (`checkSheet`, `AdminPresence`, `PERIOD_LOCKED`) không chặn: mỗi cảnh báo của một người mở đầu bằng họ tên và có `details.username` (`warnings.scope`). Chính người gọi nằm trong `usernames` thì vẫn lưu, một cảnh báo `SELF_DECISION_FORBIDDEN`, dòng nhật ký `sheet.onBehalf` của người đó có `after.self = true`.
7. Sau giao dịch: `approvals.changed` nếu có dòng duyệt đổi; `estimate.changed` cho từng người; `request.decided` cho các khoản được duyệt ngay.

### 3.5 `GET /api/me/estimate?month=&rows=1` — quyền: `authenticated`

Số ước tính của chính người gọi (`periods.estimate`, `src/modules/sheet/sheet.controller.ts`). `month` sai ⇒ 400 `BAD_MONTH`. Đi qua cùng chuỗi tính lương (mục 4.11); dòng ngày trả kèm giờ bấm thật (`dayRowsOf`).

### 3.6 `GET /api/ot?status=` — quyền: `attendance.correct`

`listOt(status)` (`src/domain/ot.ts`): mọi lượt (mọi tháng) có `extraKind === 'ot'`, lọc `pending` (chưa `otReview`) / `approved` / `rejected`; mỗi dòng = entry trải phẳng + trường lượt + `sessionId`, `name`; sắp ngày giảm dần. `status` lạ ⇒ `pending`. Trả `{ ot: [...] }`.

### 3.7 `POST /api/ot` — quyền: `attendance.correct`, periodScope `attendance`

Input `{ sessionId, version, extraIn?, extraOut?, reason }`. Output `{ ok, sessionId, sessionVersion }`.

Trong giao dịch (`src/modules/attendance/attendance.controller.ts`): `sessionId` sai ⇒ 400; không có ⇒ 404; `version` thiếu ⇒ 400, lệch ⇒ 409; nhân sự không có / ngoài bảng lương ⇒ 400; `guardPeriod(session.date)`; `reason` cắt 300 ký tự; `validateOtDeclaration` (mục 4.8); nếu lượt đã có OT thì đẩy bản cũ vào `otDeclarationHistory` (và `otHistory` nếu đã duyệt); xoá `otReview`; đặt `otDeclaration {by, at, reason}`, `otNeedsReview: true`; `updateSession` (lệch ⇒ 409); nhật ký `ot.declare`. Sau đó: `attendance.changed` kind `ot`.

### 3.8 `PUT /api/ot` — quyền: `attendance.correct`, periodScope `attendance`

Input `{ sessionId, version, action: 'approve'|'reject', note? }`. Output `{ ok:true }`.

Trong giao dịch (`src/modules/attendance/attendance.controller.ts`): lượt không có OT ⇒ 404; `version` lệch ⇒ 409; lượt đang mở ⇒ 409; `guardPeriod`; tự duyệt OT của mình ⇒ cảnh báo `SELF_DECISION_FORBIDDEN`; đã có `otReview` ⇒ 409; `action` sai ⇒ 400; duyệt: có `otDeclaration` thì chạy lại `validateOtDeclaration`, không thì `extraFits` ⇒ `OT_OUTSIDE_PRESENCE`. Ghi `otNeedsReview:false`, `otReview { ok, by, at, note? }`; nhật ký `ot.decide`. Sau đó: `punch.corrected` (người đó), `attendance.changed` kind `ot`.

**Quan trọng**: OT ghi ở Check-in/out không bao giờ ra tiền (mục 4.8).

### 3.9 `GET /api/today` — quyền: `attendance.read`

`closeStaleFor(mọi payrollSubject)` rồi mỗi người một dòng (`src/modules/attendance/attendance.controller.ts`): lượt của ngày hiện tại (ngày VN của thời điểm đọc) = lượt đang mở, hoặc `date` = ngày hiện tại, hoặc `presOut` rơi vào ngày hiện tại, hoặc lượt quên Check-out có `forgotOutDate(presIn)` = ngày hiện tại; chọn lượt mở, không thì lượt có `presOut||presIn` muộn nhất. Trường: `username, name, type, shiftCode, date, sessionId, sessionCount, plannedShift, presIn, presOut, open, in, out, late (ActualHours.lateMinutes), kind, reason, status, statusNote` (của lượt được chọn, mục 2.7; không có lượt thì `null` và `''`). Trả `{ today, rows }`.

### 3.10 `GET /api/attendance?month=` — quyền: `attendance.read`

`closeStaleFor(payrollSubject)`; trả `{ month, rows }`, mỗi dòng là lượt của tháng kèm `punches`, `corrections`, `status`, `statusNote`, `superseded` (mục 2.7), `name`, `type` (`src/modules/attendance/attendance.controller.ts`).

### 3.11 `GET /api/team?month=` — quyền: `payroll.view`

Mỗi `payrollSubject` (`src/modules/staff/staff.controller.ts`): `staff`, các trường lịch (`sheetForViewer`), `workSchedule` (lịch theo loại nhân sự của người), `approvals`, `kpiParts`, `pendingApprovals`, `attendanceSessions`, `pendingDays` (lượt `kind==='pending'` và `reason!=='open'`), `pendingOt` (lượt có OT chưa `otReview`). Thêm `schedules` (lịch từng chức vụ), `holidays`.

### 3.12 `GET /api/alerts?month=` — quyền: `request.decide.*` (ít nhất một nhóm)

Với người nằm trong phạm vi `attendance.correct` của người gọi (`src/modules/approvals/approvals.controller.ts`): `closeStaleFor`; thêm `forgot-out` cho lượt quên Check-out; chạy `ActualHours.apply` trên lịch khai (`estimateSheet`, không qua `payView`) và thêm ngày `forgot-in`/`forgot-out`. Cùng lần chạy đó lấy `absent` (ngày trong lịch đã qua giờ ra ca, không có lượt nào) và bỏ ngày đã có giải trình ở bất kỳ trạng thái nào (`explanations.explainedByUser`). Trả `{ missingPunches: [{username,name,date,kind}], absentNoExplanation: [{username,name,date}], pendingApprovals }`; `absentNoExplanation` sắp theo tên đăng nhập rồi ngày, chỉ gồm người trong phạm vi `attendance.correct` của người gọi.

### 3.13 Giải trình — `src/modules/explanations/explanations.controller.ts`

| Route | Quyền | Input | Output / lỗi |
| --- | --- | --- | --- |
| `GET /api/explanations?status=&user=` | `authenticated` | | `{ items[] (view + name + requestedOut), waitingForYou, toRead }`. Người có `attendance.correct` phạm vi `all` thấy mọi người (lọc `user`), người khác chỉ thấy của mình. `user` sai dạng ⇒ 400. Tối đa 200 dòng. |
| `POST /api/explanations` `{ username, date, prompt, source?, ruleId? }` | `authenticated`; yêu cầu người khác cần `attendance.correct` phạm vi `all` | | Không đủ quyền ⇒ 403 `FORBIDDEN_CAP`; kind `ai` nnếu `source==='ai'` (requestedBy `ai (<admin>)`), không thì `admin`; 404 `NO_SUCH_USER`, 400 `BAD_DATE`, 400 `EXPLANATION_TEXT_REQUIRED`/`_TOO_LONG`. Trạng thái `requested`. |
| `POST /api/explanations` `{ date, text }` (không có `sessionId`; `username` bỏ trống hoặc là chính mình) | `authenticated` | | Nhân viên tự giải trình ngày vắng của chính mình (`submitAbsentDay`, `AbsentDay.stateOf`): ngày trong lịch (và thời gian làm việc của người, không phải ngày lễ), đã qua giờ ra ca, không có lượt Check-in/out nào (kể cả lượt Admin ghi), kỳ chưa chốt công, chưa có giải trình nào về ngày đó. Tạo giải trình kind `admin`, `requestedBy` = người gửi, `prompt` cố định, `status: answered` (chờ Admin duyệt), nhật ký `explanation.self`. Lỗi: 400 `BAD_DATE`, `EXPLANATION_TEXT_REQUIRED`/`_TOO_LONG`, `EXPLANATION_DAY_FUTURE`, `EXPLANATION_DAY_OFF_SCHEDULE`; 409 `EXPLANATION_DAY_PUNCHED` (đã có lượt), `EXPLANATION_DAY_NOT_ABSENT` (đã khai nghỉ, ca hôm nay chưa kết thúc, không thuộc bảng lương), `EXPLANATION_PERIOD_LOCKED` (kỳ từ `attendance_locked` trở đi), `EXPLANATION_EXISTS` (đã có giải trình về ngày, mọi trạng thái kể cả bị từ chối và Admin đã hỏi). Có `username` khác mình thì thuộc dòng Admin yêu cầu ở trên (403 `FORBIDDEN_CAP` với nhân viên). Duyệt hoặc từ chối đi `decide` sẵn có: duyệt ⇒ một công theo giờ ca, từ chối ⇒ vắng. |
| `POST /api/explanations` `{ sessionId, text }` (kh?ng c? `username` kh?c m?nh) | `authenticated` | | Phi?n owner ?? ??ng thi?u Check-in/out: t?o gi?i tr?nh kind `punch-in` ho?c `punch-out` theo ??u thi?u; ki?m tra tr?ng ??ng kind; kh?ng ??i entry/gi? v? kh?ng ch?y `LateCheckout.sync`. Phi?n kh?ng c?/kh?c owner ? 404 `SESSION_NOT_FOUND`; kh?ng c?n thi?u ? 409 `SESSION_NOT_MISSING_PUNCH`; ?? c? c?ng kind ? 409 `EXPLANATION_EXISTS`. Check-out mu?n ti?p t?c d?ng `submitLate` ri?ng. |
| `POST /api/explanations/:id/answer` `{ text }` | `authenticated` | | Chỉ chủ giải trình (403 `FORBIDDEN`); trạng thái phải `requested` (409 `NOT_REQUESTED`); 404 `NOT_FOUND`. |
| `POST /api/explanations/:id/decide` `{ approve, note?, expectedRev? }` | `attendance.correct` | | `expectedRev` lệch ⇒ 409 `EXPLANATION_STALE`; trạng thái `requested` ⇒ 409 `NOT_ANSWERED`; tự duyệt ⇒ cảnh báo `SELF_DECISION_FORBIDDEN`. Duyệt lại được (đổi `approved` ↔ `rejected`). Cùng giao dịch: `LateCheckout.sync` (mục 4.7) và `AdminPresence.syncExplanation` (mục 4.6.1); phản hồi `{ item, recorded }`. |

Không route giải trình nào có `periodScope` ở cổng: làm được cả khi kỳ đã khoá chấm công, kể cả khi quyết định làm đổi giờ ra của lượt (riêng việc ghi / xoá lượt Admin ở mục 4.6.1 gọi `assertPeriodOpen`). Mọi route ghi giải trình phát `approvals.changed` và `punch.changed` (người giải trình); giải trình có `session_id` phát thêm `attendance.changed` kind `explanation`.

### 3.14 Cài đặt liên quan

- `PUT /api/settings/geofence` (`config.payroll`): thân `null` hoặc `{ geofence: null }` = tắt; còn lại `cleanGeofence` (400 khi sai); nhật ký `setting.geofence` không ghi toạ độ; phát `params.changed` kind `geofence` (`src/modules/settings/settings.controller.ts`).
- `PUT /api/holidays` (`config.payroll`, periodScope `attendance` cho các ngày thật sự đổi, `src/modules/settings/settings.controller.ts`): kiểm thiếu phép (`HOLIDAY_LEAVE_CONFLICT`) và `holidayOtConflicts` (`HOLIDAY_OT_CONFLICT`: thêm lễ vào ngày đã có giờ làm thêm trên lịch khai, ngày có lượt có OT, hoặc tổng giờ lễ + OT tháng vượt `MONTH_OT_CAP` (40) và tăng) — cả hai là cảnh báo; rồi `reconcileHolidayWork` (khoản "đi làm ngày lễ"), nhật ký `holiday.set`.

---

## 4. Cách tính / quy tắc

### 4.1 Thời gian và ca (`src/engine/punch.ts`)

- Phút giờ VN: `vmin(iso) = floor(ms / 60000) + 420` (`up` thì `ceil`). `dateOf`, `timeOf` đọc phút VN như UTC.
- Bảng ca `SHIFT[code] = [in, out]` dựng từ mọi khoá `shift.preset.<code>.in`; mã trong danh mục (`Normal1`…`Night2` và `shift.alias.*`) là thuộc tính ẩn trỏ cùng giờ (`:31-57,72-73`).
- `span(a,b)` = độ dài a→b qua nửa đêm; a = b ⇒ 24 giờ.
- `occurrence(code, v)`: trong 3 lần ca (ngày trước, chính ngày, ngày sau theo ngày VN của v) chọn lần có giờ bắt đầu gần v nhất; `{ start, end, date }`.
- `workDate(code, inIso)` = `occurrence.date`, không có ca ⇒ ngày VN của giờ vào.
- `planShift(staff, date)`: không có ca ⇒ null. Giờ ca luôn là ca của `staff.shiftCode`. `kind` = `'work'` nếu ngày trong lịch của người (`staff.isWorkDay(date)`, giải theo tháng của ngày), không thì `'makeup'` (lượt ngoài lịch). `startIso` = 00:00 VN của `date` + giờ vào; `endIso` = start + `span`.
- `checkInMsg(code, iso)`: '' khi `start − earlyCheckinMaxHours×60 ≤ v < end` của lần ca gần nhất; không có ca ⇒ câu lỗi. Máy chủ dùng hàm này để chọn trong/ngoài ca (qua `openSessionDay`) và làm khung ca của quyền Check-in (mục 3.2b); giao diện dùng để hiện khung giờ (mục 4.14).
- `openSessionDay(staff, inIso)`: "trong ca" khi `checkInMsg` = '' VÀ ngày công trong lịch ⇒ `openDay` (entry `pending/open`, `plannedShift` = `planShift(staff, workDate)`, `date` = ngày công). Ngoài ⇒ `date` = ngày VN thực, `outsideShift: true`, `assignedShift = planShift(staff, ngày VN)`.
- `buildDay(staff, inIso, outIso, src, { plannedShift?, approveIncomplete? })`: không ca ⇒ `pending/off-shift`; khoảng có mặt không giao ca ⇒ `pending/off-shift`; vào sau giờ bắt đầu hoặc ra trước giờ kết thúc (so đến phút, `presIn`/`presOut` chưa làm tròn) ⇒ `pending/incomplete-shift` trừ khi `approveIncomplete`; còn lại ⇒ entry `kind = plannedShift.kind`, `in/out/preset` = ca, `breakMin:0`, `attendanceConfirmed:true`, `attendanceApproved:true` nếu thiếu giờ. `presIn/presOut` luôn giữ nguyên giây.
- `forgotOut(inIso, nowIso)` = `vmin(now) − vmin(in) > openSessionMaxHours×60` (lớn hơn hẳn). `staleBefore(now)` = ISO của `vmin(now) − MAX_OPEN`. `forgotOutDate(in)` = ngày VN của `vmin(in)+MAX_OPEN+1`.
- `checkoutWarning(open, nowIso)`: khi `plannedShift.endIso` còn sau giờ hiện tại ⇒ `{ endIso, remainingMinutes }` (làm tròn lên), ngược lại null.
- `presenceFor(code, date, tin, tout)`: giờ vào là lần `tin` (hôm trước / hôm đó / hôm sau) gần giờ bắt đầu ca của `date` nhất; giờ ra = vào + `span(tin, tout)`.
- `extraFits(e)`: đoạn làm thêm trước ca phải bắt đầu ≥ giờ vào thực, đoạn sau ca phải kết thúc ≤ giờ ra thực; '' = hợp lệ.
- `workBounds(e, date)`: khoảng [bắt đầu, kết thúc] tính cả làm thêm, dùng kiểm chồng giờ giữa các ngày khai.
- `lateMin(code, inIso)` = `max(0, ceil(v − occurrence.start))` (; phút thô, không bỏ giờ nghỉ; chỉ chữ "sớm / muộn N phút" ở app nhân viên).

### 4.2 Lượt mở quá hạn (`src/domain/attendance/index.ts`)

- `closeStale(staff)` trong giao dịch: lượt mở có `presIn` và `forgotOut(presIn, now)` ⇒ entry = entry cũ + `kind:'pending'`, `reason:'forgot-out'`, bỏ `presOut`; `state:'closed'`; thêm punch `out` với **giờ = lúc phát hiện** (không phải `presIn + 16h`), `auto:true`; `hintPunch`.
- `closeStaleFor(list)`: một câu SQL lấy người có lượt mở với `presIn < staleBefore(now)` rồi chỉ gọi `closeStale` cho người đó (đường đọc `/attendance`, `/today`, `/team`, `/alerts`).
- `closeStaleIn(month, names)`: lượt mở có `date` trong tháng (dùng ở `periods.checklist`).
- Gọi ở: `GET /api/punch`, `POST /api/punch`, `GET /api/sheet` (`closeStale`); `/today`, `/attendance`, `/team`, `/alerts` (`closeStaleFor`); `periods.checklist` (`closeStaleIn`).

### 4.3 Chồng giờ

- `sessionOverlap(username, inIso, outIso, excludeId)` (`src/domain/attendance/index.ts`): duyệt `listSessions({username})` (đã giấu lượt Admin chưa tới giờ ra), bỏ lượt `excludeId`, lượt không `presIn`, lượt `origin === 'sheet.onBehalf'`; lượt mở coi như kéo dài vô hạn; chồng khi `a < end && b > start`.
- `AdminPresence.#overlap` (`admin-presence.ts`): khác ở chỗ bỏ qua lượt Admin của chính ngày đó, lượt đã đóng thiếu `presOut` hoặc chờ đối soát, và lượt `off-shift` đã đóng cùng ngày công.

### 4.4 Làm sạch lịch khai `cleanDays` (`src/modules/sheet/sheet.helpers.ts`) — luôn chặn (400)

- `days` phải là object; khoá là ngày hợp lệ; `kind` thiếu = `work`; `kind` ∈ `work, makeup, leave, unpaid, willmakeup, approved, isat` (`makeup` là loại không còn khai được, chỉ để ngày đã lưu gửi lại không đổi đi qua; khai hoặc sửa bị chặn ở `checkSheet`, mục 4.5.1).
- `work`/`makeup`: `in`, `out` dạng `HH:MM`; `extraIn`/`extraOut` dạng `HH:MM` nếu có; `extraKind` chỉ `makeup`/`ot`; giờ làm thêm trùng giờ ca coi như không có; thiếu `extraKind` mà có `extraOut` ⇒ `makeup`; `checkExtraTimes` (mục 4.5.1); `preset` phải là mã ca có trong `SHIFT` (`PRESET_RE` + `hasOwn`); `breakMin` nguyên 0..1440. Không giới hạn độ dài ca. Lưu `{kind, shift: shiftFor(in,out), in, out, extraKind, extraIn, extraOut, preset, breakMin}`.
- Mọi loại: `punchNote` (chuỗi, cắt khoảng trắng, ≤ `NOTE_MAX` = 300).
- `willmakeup`: `makeupPlans` (≤ 31 dòng, ô sai dạng thành '', bỏ dòng trống) hoặc dạng chỉ có ngày `makeupDate`.
- `shiftFor(in,out)` (`src/domain/overtime/worked-hours.ts`): chồng 22h–6h ⇒ `night`; vào trước 07:00 hoặc ra ≥ 22:00 ⇒ `flex`; còn lại `normal`.

### 4.5 Kiểm nghiệp vụ lịch khai `checkSheet` (`src/domain/timesheet/` (nối ở `timesheet/services.ts`))

Chạy trên hồ sơ người sở hữu lịch (khai thay: người được khai), bộ tham số và lịch của tháng. "Không đổi" (`unchanged`) = ngày đã lưu có cùng `kind/in/out/extraKind/extraIn/extraOut`.

#### 4.5.1 Chặn cứng (400)

| Mã | Điều kiện |
| --- | --- |
| (không mã) | ngày không thuộc tháng |
| — / `EXTRA_WRONG_SIDE` | `checkExtraTimes`: có `extraKind` mà không giờ; giờ làm thêm nằm sai phía ca |
| `DAY_HOURS_CAP` | `limits.checkDayHours` (gọi ở `checkSheet`, `ot-sheet.payOnSheet`) và `limits.assertDayHours` (`validateOtDeclaration`, `POST /ot`): ngày vừa thêm hoặc đổi giờ có đoạn OT / làm thêm / làm bù có giờ ròng = (giờ vào → giờ ra) + đoạn trước ca + đoạn sau ca − giờ nghỉ (`time.breakHours` trừ một lần cho mỗi đoạn có độ dài ≥ `time.breakAfterWorkHours` + `time.breakHours`: ca chính và đoạn làm bù; đoạn OT và ngày lễ không trừ) > 12. Ngày không đổi so với lịch đang lưu giữ nguyên. `POST /ot` cộng thêm OT của các lượt khác cùng ngày |
| `SHEET_MAKEUP_DAY_REMOVED` | ngày `kind: 'makeup'` khai hoặc sửa (so với ngày đã lưu): 400 "Không còn loại ngày Làm bù cả ngày. Giờ làm bù khai ở ngày đi làm, trước hoặc sau ca." kèm `date`. Ngày `makeup` đã lưu gửi lại không đổi: không chặn, cảnh báo `SHEET_MAKEUP_DAY_LEGACY` "Ngày dd/mm: loại Làm bù cả ngày không còn dùng, không tính lương. Hãy khai lại." |
| `SHEET_MAKEUP_ON_HOLIDAY` | giờ làm bù trên ngày lễ (trừ ngày không đổi), hoặc ngày làm bù dự kiến của `willmakeup` rơi ngày lễ |
| `OT_MONTH_CAP` | `limits.checkMonthOt` (qua `checkSheetLimits`) và `limits.assertMonthOt` (`POST /ot`, so với lịch đang lưu): tổng giờ OT thô của tháng cộng giờ ca chính làm ngày lễ (`monthOtHours` = `estimateHolidayOtHours`: giờ OT của ngày có `extraKind==='ot'`, kể cả phần rơi vào ngày lễ, cộng `splitMainWork(...).holidayH` của ngày đi làm; không có làm bù) > 40 và tăng so với lịch đang lưu; câu báo "OT (kể cả giờ làm ngày lễ) tối đa 40 giờ" |
| `BENEFIT_NOT_ALLOWED` / `SHEET_ISAT_WEEKDAY` (iSAT) | ngày iSAT khai thêm hoặc đổi loại sang iSAT mà chức vụ (bậc) không có `benefit.isat`, hoặc không đúng `isat.weekday`: `isatRefusal` (`src/domain/isat-rule.ts`, gọi ở `timesheet/timesheet-validator.ts`), kiểm quyền lợi trước rồi thứ; áp cho cả Admin khai thay. Ngày iSAT đã lưu và không đổi loại giữ nguyên, danh sách kiểm kỳ báo `ISAT_INVALID`. Duyệt khoản iSAT (`PUT /approvals/decide`, approve) kiểm lại hai điều kiện này, sai thì 400 cả lô |

#### 4.5.2 Cảnh báo (`warnIf`: lưu và thêm cảnh báo)

| Mã | Điều kiện (vi phạm) |
| --- | --- |
| `SHEET_DAYS_OVERLAP` | hai ngày liền nhau (và ngày giáp ranh tháng nếu ngày đầu/cuối tháng đã đổi so với lịch đã lưu) có `workBounds(a).end > workBounds(b).start`; bỏ qua cặp không đổi |
| `SHEET_SUNDAY` | ngày Chủ nhật (mọi loại ngày, **kể cả ngày không đổi**) |
| `SHEET_OFF_SCHEDULE` | ngoài lịch, đã đổi, không phải `unpaid` (không xét Chủ nhật, đã có `SHEET_SUNDAY`) |
| `SHEET_SHIFT_MISMATCH` | chỉ nhân sự tự khai: `work` có ca được gán mà giờ khác ca, và khác giờ đã lưu (không xét ngày lễ); giờ khớp ca ⇒ gán `preset` = mã ca, lệch ⇒ `preset` bỏ (ngày tính theo ca được gán). Admin khai thay không có mã này |
| `SHEET_ADMIN_SHIFT_REQUIRED` | chỉ Admin khai thay: `preset` = `adminShiftOf` (mã ca Admin gửi nếu có trong danh mục; không gửi thì ca có đúng giờ vào – ra, ưu tiên ca được gán; không ca nào khớp thì `''`); ngày `work` đổi mà `preset` là `''` ⇒ lưu, cảnh báo ngày đó tính theo ca được gán. Ngày không đổi bỏ qua |
| `SHEET_EXTRA_NIGHT` | đoạn làm thêm (trước ca / sau ca) chồng 22h–6h, ngày đã đổi |
| (`warn` không điều kiện) `SHEET_EXTRA_ON_HOLIDAY` | OT trên ngày lễ tràn sang ngày thường kề bên |
| `checkRequestFlags` (`src/domain/positions.ts`) | quyền lợi chức vụ / bậc cho làm bù, đi làm lễ |
| `BENEFIT_NOT_ALLOWED` | OT mà chức vụ không có quyền lợi `ot` (cùng câu "Chức vụ của bạn không có overtime" cho OT ngày thường và cho ngày lễ khai giờ vào – ra: làm ngày lễ là OT, không có cờ riêng); nghỉ được duyệt thêm mà không có quyền lợi; khai nghỉ trong lịch khi không được khai nghỉ |
| `SHEET_UNPAID_WITH_LEAVE` | nghỉ không lương chọn ở T2–T6 trong lịch khi còn ≥ 1 ngày phép |

#### 4.5.3 `checkSheetLimits` (`src/domain/overtime/hour-limits.ts`)

`OT_MONTH_CAP` (cứng, ở trên) và `SHEET_ISAT_LIMIT` khi `isat.monthlyLimit` là số (cảnh báo). Cả hai chỉ xét khi tổng tăng. Không còn trần OT ngày, trần giờ lễ + OT tháng hay trần OT năm riêng: chỉ hai trần `DAY_HOURS_CAP` và `MONTH_OT_CAP`.

#### 4.5.4 Giờ OT của lịch

`estimateOtHours(x)` = giờ đoạn trước ca cộng giờ đoạn sau ca khi `extraKind==='ot'`; OT không có giờ nghỉ nên mỗi phút có mặt trong đoạn là một phút OT (OT 17:00–22:00 sau ca ngày là 5 giờ). `extraOtHours`, `actualOtHours` (bỏ OT bị từ chối) đều dùng giờ thô này. Trần OT tháng (`OT_MONTH_CAP`, `MONTH_OT_CAP`) = giờ OT thô cộng giờ ca chính làm ngày lễ, mỗi phút ngày lễ một phút, không trừ giờ nghỉ (`limits.monthOtHours`, gọi `estimateHolidayOtHours`); không còn trần giờ lễ + OT tháng hay trần năm riêng. Giờ ròng của trần ngày (`limits.dayNetHours`) khớp `calcDay`: `hours + extra`. Đoạn làm bù theo giờ vẫn trừ giờ nghỉ của đoạn trong bộ máy (`splitExtraWork`).

### 4.6 Admin khai thay ⇒ lượt Admin (`src/domain/attendance/admin-presence.ts`)

Admin chấm công cho một người (quên chấm, đi làm ca khác ca được gán) bằng cách khai thay lịch: `PUT /api/sheet` có `user` khác người gọi, sau khi lịch đã ghi (`sheet-on-behalf.ts`); nhiều người một lần thì `PUT /api/sheet/bulk` (mục 3.4b), mỗi người đi qua cùng `approveOnBehalf`.

1. Ngày xét = các ngày trong tháng có trường `kind/in/out/preset/extraIn/extraOut` (`PRESENCE_FIELDS`) khác giữa lịch cũ và lịch lưu, cộng mọi ngày trong `confirmDays` (≤ 31 ngày thuộc tháng, sai ⇒ 400).
2. Đọc mọi lượt của người đó, mọi tháng, kể cả lượt Admin chưa tới giờ ra (`includeScheduled`).
3. Mỗi ngày: `mine` = lượt Admin có ngày công đó. "Muốn" = ngày mới là `work` có `in`,`out`.
4. `#build` trả null kèm cảnh báo nếu: ngày đã có lượt thật dùng được (đã đóng, có `presIn`,`presOut`, `plannedShift.startIso`, không chờ đối soát) ⇒ `ADMIN_PRESENCE_REAL_PUNCH`; không dựng được ca ⇒ `ADMIN_PRESENCE_NO_SHIFT`; chồng lượt khác ⇒ `ADMIN_PRESENCE_OVERLAP`. Ngược lại: `plannedShift = planShift(staff, date)` với `staff.shiftCode` = `day.preset` khi mã đó có trong bảng ca (**ca Admin chọn**), không thì ca được gán (người chưa gán ca nhưng Admin chọn ca vẫn dựng được lượt); khoảng có mặt `presenceOf` = `presenceFor(code, date, extraIn||in, extraOut||out)` (gồm cả đoạn làm thêm đã khai); entry = `buildDay(..., 'admin', { plannedShift, approveIncomplete:true })` (giờ không chồng ca vẫn ra `pending/off-shift` và vẫn được ghi).
5. Có entry ⇒ `#write`: sửa lượt Admin đầu tiên (giữ trường OT `extraKind/In/Out` của lượt cũ, bỏ `attendanceApproved`, `reason`, `explanationId`) hoặc tạo mới, `state:'closed'`, thêm `origin`, `declaredBy`, `declaredAt`; nhật ký `attendance.admin.set`. Các lượt Admin thừa của ngày bị xoá. Không có entry ⇒ xoá mọi lượt Admin của ngày (nhật ký `attendance.admin.remove`). Xoá bằng `DELETE ... WHERE id=? AND version=? AND json_extract(entry_json,'$.origin')=?`, lệch ⇒ 409 `SESSION_STALE`.
6. `hintPunch` cho ngày có thay đổi.

**Tiền theo ca Admin chọn.** `plannedShift.code` của lượt Admin = ca Admin chọn; `ActualHours.apply` đặt `preset` của ngày hiệu lực bằng mã đó (mục 4.10.3) và bộ máy lấy loại ca (`normal` / `flex` / `night`) từ `preset` của ngày, rồi mới tới ca được gán, khi tham số `shift.allowance.basis` = `'assigned'` (`src/engine/payroll-engine.ts` đọc, `shiftOfDay` ở dùng). Tham số này không nằm trong bảng tham số mặc định mà do `src/domain/payroll/policy.ts` ghi theo tháng, có hiệu lực từ tháng bắt đầu chuyển đổi; ở tháng chưa có giá trị `'assigned'`, loại ca lấy từ giờ có mặt (`shiftFor(vào, ra)`) nên ca Admin chọn không đổi loại ca hay phụ cấp; phụ cấp ca, giờ nghỉ đêm có lương, giờ thiếu đều tính theo ca này. Nhân viên Check-in/out và tự khai vẫn theo ca được gán (không có `preset` khác).

Lượt Admin có `presOut` sau thời điểm hiện tại bị **giấu** khỏi `lastSession` và `listSessions` thường (`src/domain/attendance/attendance-sessions.ts,56-86`): trước giờ ra lượt chỉ là lịch. Không giấu khỏi `getSession`, `openSession`, câu SQL của `closeStaleFor`, và `listSessions({ includeScheduled: true })`.

#### 4.6.1 Duyệt giải trình ngày ⇒ lượt Admin theo giờ ca (`AdminPresence.syncExplanation`,)

Gọi trong giao dịch của `POST /api/explanations/:id/decide`, sau `lateCheckout.sync`; bỏ qua giải trình `late-checkout`. Phản hồi thêm `recorded` (đã ghi lượt).

- **Duyệt**, ngày công của giải trình là ngày thiếu chấm (`missesPunch`,: không lượt thật dùng được, không lượt mở hoặc chờ đối soát, mọi lượt đã đóng chỉ có một đầu giờ; ngày không lượt nào cũng là thiếu chấm) và chưa có lượt Admin nào ⇒ ghi MỘT lượt Admin: giờ vào = giờ bắt đầu ca, giờ ra = giờ kết thúc ca (`forgottenPresence`; đoạn OT / giờ bù không ghi), `origin`, `declaredBy` là người duyệt, `explanationId` là id giải trình; nhật ký `attendance.admin.set` có `reason` = `Giải trình <id>`. Ca của lượt: ca Admin chọn cho ngày trong lịch khai nếu có, không thì ca được gán. Lượt thật bị `superseded`, nhãn `admin`, ngày là 1 ngày công với giờ ca như Admin ghi nhận (giờ vào thật trễ của lượt quên Check-out không bị trừ).
- Ngày trễ / về sớm (đã có giờ vào và ra): chỉ hết giữ, không ghi lượt; `ActualHours` vẫn cắt theo `cutMin` với bậc làm tròn hiện hành.
- Không dựng được lượt (người chưa gán ca, ngày ngoài lịch, ngày đã khai nghỉ, ngày lễ không khai giờ đi làm, giờ ca chồng lượt khác) ⇒ cảnh báo `EXPLANATION_NOT_RECORDED`, quyết định vẫn lưu. Ngày lễ có khai giờ đi làm lấy khung đã khai.
- **Không duyệt** (hoặc đổi từ duyệt sang từ chối) ⇒ xoá đúng lượt Admin có `explanationId` của giải trình; lượt Admin khai tay (không dấu) giữ nguyên. Khai thay lại ngày qua lịch bỏ `explanationId`, lượt thành lượt tay.
- Ghi hoặc xoá lượt gọi `assertPeriodOpen(tháng, 'attendance')`: kỳ đã khoá chấm công ⇒ cảnh báo `PERIOD_LOCKED`, quyết định vẫn lưu.

### 4.7 Check-out và Check-out muộn

**Phút muộn** `lateCheckoutMin(session, atIso, sheetDay)` (`src/domain/explanation/late-checkout.ts`):
- Không `plannedShift.endIso/out` ⇒ 0 (lượt ngoài ca không bao giờ là "muộn").
- `extra` = max(`spanH(planned.out, session.entry.extraOut)`, `spanH(planned.out, sheetDay.extraOut)`) phút (làm tròn).
- `allowedUntil = planned.endIso + extra`; kết quả = `max(0, round((at − allowedUntil)/60000))`.
- `needsExplanation` = phút muộn **>** `CHECKOUT_GRACE_MIN` (30).

**Check-out thường** `LateCheckout.checkOut` (`late-checkout-session.ts`): entry = `closedEntry(staff, session, at)`; `sessionOverlap` (trừ chính nó) ⇒ 400; `updateSession` closed (lệch ⇒ 409 `SESSION_STALE`); punch `out`. Check-out sớm cũng đi đường này: lượt đóng `pending/incomplete-shift` (mục 2.3) và nhãn là Chờ xử lý (mục 2.7).

`closedEntry`: lượt `outsideShift` hoặc không `plannedShift` ⇒ `{...cũ, kind:'pending', reason:'off-shift', presOut}`; ngược lại `buildDay(punchStaff, presIn, out, 'punch', {plannedShift})`; nếu có lượt khác (không phải lượt Admin) cùng `plannedShift.startIso` và cùng mã ca (so qua `canonicalOf`) và entry không pending ⇒ `pending/multiple-sessions`, `attendanceConfirmed:false`; giữ `outsideZone`.

**Check-out muộn** `LateCheckout.record`:
1. Chưa có giải trình Check-out muộn của lượt và không gửi `explanation` ⇒ 409 `CHECKOUT_NEEDS_EXPLANATION` `{ sessionId, lateMin, graceMin }` (không ghi gì).
2. Có chữ và giải trình cũ chưa duyệt (hoặc chưa có) ⇒ `submitLate` (tạo `answered` hoặc `resubmit`), nhật ký `explanation.late-checkout`. Giải trình cũ đã duyệt ⇒ không gửi lại.
3. Lượt ⇒ `closed`, entry cũ + `kind:'pending'`, `reason:'forgot-out'`, `requestedOut: at`, bỏ `presOut`; punch `out` (không auto) kèm `lateCheckout:true`.
4. `sync(giải trình)`: nếu giải trình đã `approved` thì áp ngay giờ ra.

**Đồng bộ theo quyết định** `LateCheckout.sync(view)`, gọi trong giao dịch của `decide` và cuối `record`:
- Chỉ giải trình `late-checkout` có `sessionId`; lượt phải `closed`, có `requestedOut`, `src !== 'admin'`.
- `approved` và chưa có `presOut` ⇒ entry = `closedEntry(staff, session, requestedOut)` + `requestedOut`; chồng giờ ⇒ 409 `SESSION_OVERLAP`; nhật ký `checkout.late.apply`.
- Không `approved` và `presOut === requestedOut` ⇒ entry chỉ giữ `src, presIn, plannedShift, outsideShift, assignedShift, outsideZone, requestedOut` + `pending/forgot-out`; nhật ký `checkout.late.revert`.
- Còn lại: không đổi.

### 4.8 OT khai ở Check-in/out (`src/domain/ot.ts`)

`validateOtDeclaration(staff, session, body)`:
- Lượt chưa đóng ⇒ 409 (luôn). Không `plannedShift` ⇒ 400 (luôn). Lượt đang khai làm bù ⇒ 409 (luôn). Giờ OT sai dạng ⇒ 400; không có đoạn nào ⇒ 400; `presIn/presOut` không hợp lệ ⇒ 400.
- Cảnh báo: `BENEFIT_NOT_ALLOWED` (chức vụ không có OT), `OT_NEEDS_CONFIRMED_SHIFT` (chưa `attendanceConfirmed` hoặc không phải `work`), `OT_OUTSIDE_PRESENCE` (`extraFits`), `OT_NIGHT` (đoạn OT chồng 22h–6h). Hai trần giờ làm của `POST /ot` (`DAY_HOURS_CAP`, `OT_MONTH_CAP`) chặn 400, không qua `warnIf`.
- Trả entry đề xuất `{...entry, in: plan.in, out: plan.out, extraKind:'ot', extraIn, extraOut}` (giờ trùng biên ca = '').

`actualOtHours(entry)` = `extraOtHours` nếu chưa duyệt hoặc đã duyệt, 0 nếu bị từ chối (`overtime/worked-hours.ts`). `actualHolidayOtHours(rows)` = tổng OT các lượt + giờ lễ của ca chính (mỗi `plannedShift` một lần, lấy max).

**OT này không ra tiền**: `ActualHours.apply` dùng ngày khai trên lịch làm nguồn đoạn làm thêm (`effective = clone(declared)`, `actual-hours.ts`) và bỏ `otReview` (`LOCKED_FIELDS`,). Nó chỉ tham gia trần giờ lễ + OT (`holidayOtConflicts`, `validateOtDeclaration`) và danh sách `/api/ot`.

### 4.9 GPS (`src/domain/attendance/geofence-policy.ts`)

Chưa bật vùng ⇒ không kiểm. Bật: (1) thiếu / sai vị trí ⇒ cảnh báo `GEO_NO_LOCATION`, (2) `accuracy > maxAccuracyM` ⇒ cảnh báo `GEO_LOW_ACCURACY`, (3) haversine (`punch.ts`, R = 6.371 km) > `radiusM` ⇒ cảnh báo `GEO_OUTSIDE`. Check-in vẫn thành công, entry `outsideZone: true`. Không lưu toạ độ ở đâu cả; GPS không tham gia tính lương. `cleanGeofence`: lat −90..90, lng −180..180, `radiusM` 20..5000, `maxAccuracyM` 10..1000 (mặc định 100). Nhân viên chỉ biết có bật vùng hay không; Admin thấy cả cài đặt (`geofenceView`).

### 4.10 Giờ công thực tế `ActualHours.apply(days, sessions, ctx)` (`src/engine/actual-hours.ts`)

Đầu vào: `days` (lịch khai; trong bộ máy là kết quả `payView`), `sessions` (`[{state, date, entry}]`), `ctx { asOf, staff, holidays, month }`. Thuần, không I/O.

**Bước 0.** `out` = bản sao `days`. `from` không hợp lệ ⇒ trả luôn `{ days: out, report:{}, missing:[], absent:[] }`.

**Bước 1.** `today` = ngày VN của `asOf`. Bỏ lượt Admin có `presOut > asOf`. Gom lượt theo ngày công (`groupByDate`,).

**Bước 2. Ngày mặc định**: khi có `ctx.month` và `today`: mỗi ngày của tháng thoả `from ≤ ngày ≤ today`, ≥ `staff.startDate`, ≤ `staff.resignedOn`, trong lịch làm việc, không lễ, chưa khai (không có bản khai hoặc bản khai rỗng) ⇒ coi như `{ kind:'work', in, out }` theo ca của người (không ca ⇒ `{kind:'work'}`). Nhân viên không phải khai "Đi làm": ngày trong lịch tự là ngày đi làm, có Check-in/out hợp lệ mới có công.

**Bước 3. Từng ngày** (hợp của ngày khai, ngày có lượt, ngày mặc định; sắp tăng; bỏ ngày < `from` và ngày > `resignedOn`):

1. `declared` = ngày mặc định hoặc ngày khai.
2. `kind` = `declared.kind` hoặc `work` nếu có `in`,`out`.
3. `isWork` = `work` và không phải [ngày lễ mà không có `in`,`out`]. Ngày `makeup` (loại không còn dùng) không phải `isWork`: đi nhánh khai nghỉ, giữ nguyên (bộ máy tính 0).
4. `offDay` = ngoài lịch; `offSchedule` = `isWork ? offDay : (offDay || ngày lễ)`.
5. Lượt của ngày; `inspectDay`: `open` (có lượt mở), `review` (`needs-review`/`legacy-review`), `forgotOut` (có vào không ra), `forgotIn` (có ra không vào), `usable` (vào < ra và có `plannedShift.startIso`). Có lượt thật usable ⇒ chỉ dùng lượt thật; chỉ có lượt Admin usable ⇒ xoá các cờ `forgotIn/forgotOut/review`.

**Bước 4. Rẽ nhánh** (thứ tự đúng như mã):

| Điều kiện | `out[date]` | `report[date].state` | missing / absent |
| --- | --- | --- | --- |
| không khai, không có lượt | (không đổi) | — | |
| không khai, có lượt, `offSchedule` và `offScheduleRule='unpaid'` | (không đổi) | `off-schedule` | |
| không khai, có lượt thiếu một đầu (không lượt dùng được, không lượt mở) | `pending` theo thứ tự `review`, `forgot-in`, `forgot-out` | `review` / `forgot-in` / `forgot-out` | missing |
| không khai, còn lại | (không đổi) | `undeclared-punch` | |
| khai nghỉ (không `isWork`), có lượt | (không đổi) | `declared-wins` | |
| `offSchedule`, `unpaid`, không có khoản làm thêm / làm bù đã duyệt | xoá | `off-schedule` (`paid:false`) | |
| ngày > today | `pending/not-yet` (hoặc `declared-wins` nếu `missingAllRule='declared'` và không lượt) | `not-yet` | |
| có lượt mở | `pending/open` | `open` | |
| `review` | `pending/review` | `review` | missing |
| `forgotIn` | `pending/forgot-in` | `forgot-in` | missing |
| `forgotOut` | `pending/forgot-out` | `forgot-out` | missing |
| không usable, có lượt | `pending/off-shift` | `off-shift` | missing |
| không lượt, `missingAllRule='declared'` | ngày mặc định: xoá; ngày khai: giữ | `declared-wins` (ngày khai) | |
| không lượt, ca chưa kết thúc (`asOf <` 00:00 ngày + kết thúc của ca khai, tính cả `extraOut`) | `pending/not-yet` | `not-yet` | |
| không lượt, `offSchedule` | xoá | `no-checkin` | |
| không lượt, `missingAllRule='absent'` (mặc định) | `{kind:'noshow'}` | `absent` | absent |
| không lượt, `missingAllRule='pending'` | `pending/forgot-in` | `forgot-in` | missing |
| usable nhưng `bestShift` không phủ phút làm nào, hoặc phút trả ≤ 0 | `pending/off-shift` | `off-shift` | missing |
| usable, `offSchedule`, `unpaid`, không đoạn làm thêm giữ được | xoá | `off-schedule` | |
| usable, `offSchedule`, `unpaid`, có đoạn làm thêm | effective + `cutStartMin = 480`, `cutEndMin = 0`, `breakMin = 0`, `extraOnly:true` | `ok` | |
| usable | effective (4.10.3) | `ok` (kèm `late`, `early`, `gapMin`, `cutStartMin`, `cutEndMin`, `gapCutMin`, `paidMin`, `breakPayOff`, `extra`) | |

Cuối hàm: ngày mặc định ở trạng thái `not-yet` bị bỏ khỏi `out` và `report`; rồi **giờ bấm thật** được ghi vào `out[date]` của các ngày `work`, `noshow` và `pending` (trừ `not-yet`): `punchIn` = giờ vào sớm nhất, `punchOut` = giờ ra muộn nhất của nhóm lượt đã dùng để tính ngày (nhóm của `bestShift`, không có lượt usable thì mọi lượt của ngày), dạng `HH:MM` giờ VN, `null` khi thiếu bên đó (`punchTimes`,; mục 4.13).

Quy tắc ngày công: **ngày công = ngày có Check-in/out hợp lệ** (lượt usable, hoặc lượt Admin khai thay / duyệt giải trình). Ngày khai hoặc mặc định là đi làm trong lịch mà không có lượt nào và ca đã kết thúc là nghỉ không phép (`noshow`, `missingAllRule='absent'`).

#### 4.10.1 Phân tích ca (`analyseShift`,)

- `bestShift`: nhóm lượt usable theo `plannedShift.code|startIso`, chọn nhóm phủ nhiều phút làm nhất.
- `presenceRuns(list, forExtra)`: ca chính lấy giờ vào làm tròn **xuống**, giờ ra làm tròn **lên** theo phút (nghiêng về nhân sự); đoạn làm thêm ngược lại. Gộp khoảng chồng hoặc sát nhau.
- Ca dài `len` phút (≤ 1440). Phút thứ `o` là phút làm khi `o < 240 || o ≥ 300` (nghỉ đúng một lần từ phút 240 tới 300). `workTotal` = số phút làm (ca 9 giờ: 480).
- `missedStart` = phút làm trước phút làm đầu tiên có mặt; `missedEnd` = sau phút làm cuối có mặt; `gapMin` = phút làm vắng ở giữa. Không phủ phút nào ⇒ `coveredWork = 0`.
- `breakCovered` = ca ngắn hơn 300 phút, hoặc một khoảng có mặt phủ trọn [start+240, start+300].

#### 4.10.2 Phút trừ (`cutMin`, `cutsOf`)

`cutMin(m)` với `m = floor(phút)`:
- `m <= graceMin` (15) ⇒ 0; chỉ trừ khi `m > graceMin`.
- `exact` ⇒ `min(480, m)`.
- `ceilStep` ⇒ `min(480, 30 × ceil(m/30))`.
- `halfUpStep` (mặc định) ⇒ `min(480, 30 × floor((2m + 30) / 60))`: 16–44 → 30, 45–74 → 60, 75–104 → 90…

`cutsOf(shift)`: `separate` ⇒ `cutStartMin = cutMin(missedStart)`, `cutEndMin = cutMin(missedEnd)` (vào trễ và về sớm xét riêng từng lần); `combined` ⇒ `total = cutMin(missedStart+missedEnd)`, chia phần đầu trước. Khoảng trống: `step` ⇒ `cutMin(gapMin)`, `exact` ⇒ `gapMin`, `ignore` ⇒ 0.

`workCap = min(480, workTotal)`; `paidMin = max(0, workCap − cutStartMin − cutEndMin − breakMin)`.

#### 4.10.3 Ngày hiệu lực

`effective` = bản sao của ngày khai bỏ các trường `LOCKED_FIELDS`, rồi gán: đoạn làm thêm đã cắt, `kind` = kind của ngày khai, `in/out` = ca của lượt (`plan`), `preset = plan.code`, `breakMin = gapCutMin`, `cutStartMin`, `cutEndMin`; `breakPayOff:true` khi `!breakCovered`; `makeupHolRate = holiday.makeupRate` khi đoạn giữ lại là làm bù và hệ số > 1.

#### 4.10.4 Cắt đoạn làm thêm (`clipExtra`,)

- Loại = `extraKind` của ngày khai (thiếu mà có `extraOut` ⇒ `makeup`); khác `ot`/`makeup` ⇒ không có.
- Giới hạn theo giờ đã khai: `postCap = span(declared.out, extraOut)`, `preCap = span(extraIn, declared.in)` (chỉ khi giờ làm thêm khác giờ ca khai).
- Sau ca: muốn tới `shift.end + min(span(plan.out, extraOut), postCap)`; chỉ giữ phần có mặt **liền mạch** từ biên ca (khoảng có mặt chứa phút `shift.end−1` và kéo qua `shift.end`).
- Trước ca: đối xứng với `shift.start`.
- Trả `{ extraKind, extraIn, extraOut }` dạng `HH:MM` VN.
- Ngày lễ (`ngày công` thuộc `ctx.holidays`) có khai `in` và `out`: khung giờ trả là khung đã khai, không phải ca được gán (`holidayWindow`,: bản sao `plan` với `in`/`out` và mốc ISO của khung khai; mã ca giữ nguyên để tính phụ cấp ca). Giờ trả = khung đã khai ∩ khoảng có mặt liền mạch (`analyseShift` trên khung đó, `clipExtra` cho đoạn OT trước / sau); giờ có mặt ngoài khung không tính. Ngày lễ khai OT là một khoản OT (`ApprovalView.itemOf` trả `item:'ot'`, `holiday:true`); dòng duyệt lưu `holiday_work` được đọc như `ot`. Ngày có Check-in/out hợp lệ tính 1 ngày công. Ngày có đoạn làm bù giữ nguyên (một ngày chỉ một loại làm thêm). Ngày lễ khai đi làm mà hết ca không có Check-in/out là `noshow` (vắng).

#### 4.10.5 `lateMinutes(plannedShift, presIn)`

`missedStart` của `analyseShift` với một khoảng [presIn, endIso] (phút làm, đã bỏ giờ nghỉ). Chỉ để hiển thị (`/today`, màn Admin, ngưỡng nhãn "Vào trễ" của lượt).

### 4.11 Từ chấm công đến tiền công

Chuỗi: `loadInputs` → `computeMonth` → `calcMonth`; công thức tiền ở `spec/payroll-engine.md`.

1. `loadInputs` (`src/domain/payroll/payroll-service.ts`): lượt của đúng tháng luôn được nạp; ngày giữ vì giải trình `heldFor`: ngày của tháng có giải trình **chưa duyệt** (`requested`, `answered`) hoặc **bị từ chối** (`rejected`), mọi kind (`explanation-repository.ts` `heldByUser`). Ngày có lượt Admin đóng (`AdminPresence.declaredDates`) không bị giữ vì giải trình chưa quyết định, nhưng **bị giữ nếu giải trình bị từ chối**. `explanationRejected` liệt kê phần bị từ chối của các ngày giữ.
2. `computeMonth` (`src/engine/payroll-engine.ts`): `payView` (bỏ / đổi khoản chưa duyệt) → `ActualHours.apply(payDays, sessions, {asOf, staff, holidays, month})` thay toàn bộ `payDays` → mỗi ngày trong `explanationHold` ⇒ `{ kind:'unpaid', punchIn, punchOut, held: 'rejected' | 'pending' }` (giữ giờ bấm thật của ngày, `held` = `rejected` nếu giải trình ngày đó bị từ chối, còn lại `pending`) → `calcMonth`. Giải trình **bị từ chối ⇒ ngày không tính công**; giải trình **được duyệt** ⇒ hết giữ: late / early duyệt thì `ActualHours` vẫn cắt phút theo bậc làm tròn hiện hành; quên chấm duyệt thì ngày là 1 ngày công theo giờ ca của lượt Admin (mục 4.6.1).
3. `calcDay` (`payroll-engine.ts`): `attendanceConfirmed` ⇒ giờ ca = `plannedShift`; `noshow` ⇒ 0 đồng, không lương lễ (ngày lễ khai đi làm mà vắng mất lương lễ); `pending` ⇒ 0 đồng; `unpaid` (kể cả ngày giữ) ⇒ 0 đồng; `cutStartMin/cutEndMin` trừ phút làm (`workedHours`,); `extraOnly` ⇒ không lương ngày, không phụ cấp, không giờ thiếu.
4. Giờ làm bù theo giờ: trả đủ toàn bộ giờ làm bù đã duyệt và có mặt liền ca, `makeupH × lương giờ` (cộng phần trả thêm của giờ rơi ngày lễ theo `makeupHolRate`), **không cắt theo số giờ còn nợ**. Ngày có lịch ca và giờ làm bù vẫn hưởng phụ cấp ca cùng Off Paid đủ điều kiện của ca chính; đoạn làm bù chỉ nhận lương giờ cơ bản, không có phụ cấp ca hay Off Paid riêng. `extraOnly` ngoài lịch vẫn không có phụ cấp ca hay Off Paid. Ngày có OT cũng giữ các khoản của ca chính.
5. OT theo ngày: giờ OT rơi ngày thường trong lịch của người ×`ot.rate` (1,5); rơi Thứ Bảy, Chủ nhật **không nằm trong lịch của người** ×`ot.weekendRate` (2); giờ rơi ngày lễ ×`ot.holidayRate` (3), phần trong khung đêm cộng thêm `night.otAddRate × ot.holidayRate`, áp cho cả giờ ca chính rơi ngày lễ lẫn giờ OT rơi ngày lễ (`holNightH = holMainNightH + holExtraNightH`,); ca đêm sang ngày lễ tách theo ngày dân sự của từng phút. OT ngày thường chỉ ra tiền khi tới trước ngày đó không còn giờ phải bù (`otBlocked`, theo `ot.afterMakeup`; giờ chưa tính vào `otHold`).
6. **Đếm ngày công** (`calcMonth`,): `r.count++` khi ngày là `work` và không `extraOnly`, hoặc ngày lễ có giờ làm > 0. Chỉ xét ngày `WorkSchedule.isWorkDay` (cộng ngày ngoài lịch có `extraOnly`). Ngày `noshow` vào số ngày nghỉ. Ngày `makeup` (loại không còn dùng): `calcDay` trả 0 đồng, không ngày công, không giờ làm bù. `noShowDates()` luôn rỗng; vắng đến từ `ActualHours.apply`.
7. **Ngày nghỉ xét chuyên cần** (`finishMonth`,) = nghỉ phép + nghỉ không lương (gồm ngày giữ vì giải trình) + nghỉ được duyệt (khi `request.type.approved.countsAbsent`) − khoản miễn + vắng không phép + `min(số ngày "Nghỉ, sẽ làm bù", ceil(giờ bù còn thiếu / 8))`; ngày iSAT không cộng vào số ngày nghỉ xét chuyên cần. Ngày iSAT cũng được cộng lại riêng vào tỷ lệ ngày làm dùng để tính phụ cấp chuyên cần, để không làm giảm khoản này; phụ cấp đi lại tiếp tục dựa trên ngày đi làm thực tế. Ngưỡng: `type.<mã>.maxAbsent` cho số ngày, `type.<mã>.overLimitHours` (khác null) hoặc `attendance.overLimitHours`, cộng `attendance.overLimitTolerance`, cho giờ vượt.
8. Phần còn lại (miễn thuế chỉ phần cao hơn lương giờ thường, bảo hiểm theo ngày có lương, phụ cấp) ở `spec/payroll-engine.md`.

### 4.12 Các nơi khác chạy `ActualHours.apply`

| Nơi | Đầu vào lịch | Ghi chú |
| --- | --- | --- |
| bộ máy lương (`computeMonth`) | `payView` (đã bỏ khoản chưa duyệt) | nguồn tiền |
| `actualReportView` (`src/modules/sheet/sheet.controller.ts`, `GET /api/sheet`) | lịch khai (`estimateSheet`) | chạy từ đầu tháng; không áp ngày giữ vì giải trình |
| `GET /api/alerts` (`src/modules/approvals/approvals.controller.ts`) | lịch khai | lấy `forgot-in`/`forgot-out` cho `missingPunches` và `absent` cho `absentNoExplanation` |
| `checkoutPreview` (`src/modules/approvals/approvals.controller.ts`) | ngày giả `{kind:'work', in, out}` của `plannedShift` + lượt mở đóng tại lúc này | trả null nếu không `ok` |
| `periods.checklist` (`src/domain/period/periods.ts`) | qua `computeFor` (như bộ máy) | `FORGOT_PUNCH`, `PUNCH_REVIEW` |

### 4.13 Giờ bấm thật trên dòng ngày của phiếu

- Nguồn: `ActualHours.apply` ghi `punchIn` / `punchOut` (mục 4.10) vào ngày `work`, `noshow`, `pending` (trừ `not-yet`); ngày giữ vì giải trình mang cùng hai trường (`payroll-engine.ts`) cộng `held`. Bản chụp phiếu có hai trường này trong `m.rows[]`.
- Bản chụp không có hai trường (dòng `work`, `noshow`, ngày lễ có giờ làm, `pending` trừ `not-yet`, hoặc ngày `held`): `withPunchTimes` (`src/domain/payroll/slip-paid.ts`) lấy từ các lượt của tháng bằng `ActualHours.punchTimesOf` khi đọc, thiếu thì `null` cả hai. Bản chụp trong DB không đổi; khi so bản chụp đã lưu với bản tính lại, `withoutPunchTimes` bỏ `punchIn`, `punchOut`, `held`.
- Hiển thị: ô "Vào – ra" của dòng ngày là `HH:MM – HH:MM`; bên nào không có giờ bấm thì in `--:--`. Ngày vắng, ngày chờ xử lý (trừ chưa tới ngày) và ngày giữ vì giải trình đều in giờ bấm thật ở ô này; ca qua nửa đêm thì giờ ra là giờ đồng hồ của sáng hôm sau.
- Nhãn ngày giữ: `held === 'rejected'` ⇒ "Bị từ chối", còn lại ⇒ "Chờ xử lý". Ngày giữ không có tiền.
- Phiếu của nhân viên và bản A4 không có công thức; công thức dưới từng dòng Chi tiết chỉ có ở phiếu Admin (`src/domain/payroll/slip-formulas.ts`, ngoài phạm vi module này).

### 4.14 Luồng Check-out sớm và muộn (giao diện nhân viên)

- `PunchRules.checkoutWarning` trả cảnh báo khi giờ hiện tại trước `plannedShift.endIso`; `punchView` đặt `earlyWarning` cho lượt đang mở có ca (không áp lượt `outsideShift`).
- Bấm Check-out khi `earlyWarning` còn hiệu lực: giao diện nạp lại `GET /api/punch`, lấy `checkoutPreview` mới (máy chủ chạy `ActualHours.apply` như thể Check-out ngay bây giờ) rồi hiện hộp "Ca làm chưa kết thúc": giờ kết thúc ca, thời gian còn lại, và nếu `checkoutPreview.early > 0` thì "về sớm N phút", số phút sẽ bị trừ (`cutEnd`) hoặc "chưa bị trừ (đến N phút không trừ)". Hai nút: **Vẫn Check-out** (gửi `POST /api/punch`) và **Tiếp tục làm** (đóng hộp, không gửi).
- Check-out sớm đã gửi: lượt đóng `pending/incomplete-shift`; nhãn lượt là **Chờ xử lý** với lý do "Về sớm N phút" (mục 2.7); ngày vẫn được tính tiền với phút trừ theo bậc làm tròn (mục 4.10.2).
- Check-out muộn quá `CHECKOUT_GRACE_MIN`: máy chủ trả 409 `CHECKOUT_NEEDS_EXPLANATION`; giao diện mở hộp giải trình (`NV.askLateExplanation`) rồi gửi lại cùng lần bấm kèm `explanation`. Hộp huỷ ⇒ lượt giữ nguyên. Kết quả: lượt "Quên Check-out" kèm `requestedOut`, nhãn Chờ xử lý "Check-out muộn N phút", cho tới khi Admin quyết định giải trình (mục 4.7).
- Check-in: khay kết quả hiện ca, giờ vào ca, "Giờ bị trừ do vào muộn" lấy từ `checkoutPreview.cutStart`; `punchView` tắt nút Check-in khi `punch.checkInBlock` là chuỗi: máy chủ đã báo ngoài khung ca không có khoản đã duyệt phủ giờ đó (mục 3.2b).
- Mỗi lần bấm dùng một `requestId` (UUID) giữ qua tải lại trang cho tới khi máy chủ trả lời dứt khoát; gửi lại sau lỗi mạng nhận bản phát lại, không chấm hai lần.

### 4.15 Trường hợp biên đáng nhớ

- Check-in ngoài khung ca hay chưa gán ca chỉ qua cổng khi có khoản `ot` / `makeup_hours` đã duyệt phủ giờ bấm (mục 3.2b): lượt thành `outsideShift`, Check-out ra `pending/off-shift`; ngày đó không ra tiền nếu Admin chưa đồng ý.
- Check-out sau `openSessionMaxHours` giờ không làm được: lượt đã tự đóng `forgot-out`, POST trả 409 "Lượt này đã Check-out".
- Giải trình Admin/AI yêu cầu, hoặc nhân viên tự gửi `POST /api/explanations {sessionId}` cho lượt bất kỳ của mình, giữ ngày đó (không tính công) tới khi được duyệt; bị từ chối giữ ngày kể cả khi ngày có lượt Admin khai thay (giải trình chờ thì ngày có lượt Admin vẫn được trả). Danh sách kiểm kỳ có `EXPLANATION_PENDING` (cảnh báo) đếm ngày giải trình chưa quyết định, và ngày giải trình bị từ chối không còn tính vào `FORGOT_PUNCH` / `PUNCH_REVIEW` (`src/domain/period/periods.ts`).
- Ngày trong lịch không có lượt nào: nhân viên tự gửi giải trình cho chính mình bằng `POST /api/explanations { date, text }` (mục 3.13), hoặc Admin yêu cầu theo `username` và `date`; `GET /api/alerts` có `absentNoExplanation` và danh sách kiểm kỳ có `ABSENT_NO_EXPLANATION` (cảnh báo, không chặn chốt công) cho ngày `noshow` chưa có giải trình nào (không nằm trong `missingPunches` vì ngày là vắng, không phải quên Check-in/out); giải trình đang chờ nằm trong `toRead` và `EXPLANATION_PENDING` như giải trình khác. Chưa có giải trình ⇒ vắng không phép; giải trình chưa quyết định ⇒ ngày giữ (`held: 'pending'`, 0 đồng); duyệt ⇒ 1 công theo giờ ca, tiền bằng ngày Check-in/out đủ ca; từ chối ⇒ ngày giữ (`held: 'rejected'`), không công, 0 đồng.
- Ngày khai "Đi làm" trên ngày lễ không có giờ = nghỉ lễ, không bao giờ vắng; có giờ mà không chấm = `noshow`, mất lương lễ.
- Lượt Admin khai trước (ngày tương lai) chỉ "hiện" khi đã qua giờ ra; trước đó vẫn tồn tại trong DB.
- Lượt `pending/incomplete-shift` và `pending/multiple-sessions` vẫn được tính tiền (usable) với phút trừ.
- `punch_requests` lưu `punchState` lúc trả; phát lại sau đó trả trạng thái cũ (phần `punchExtras` lấy mới).
- Danh sách kiểm kỳ: mọi mục được hạ thành cảnh báo (`soften`, import ở `src/domain/period/periods.ts`, gọi ở và); `FORGOT_PUNCH`, `PUNCH_REVIEW` là mục `block` thô ở mọi tháng (chốt công khi còn mục chưa bỏ qua thì thêm cảnh báo `PERIOD_NOT_READY`).

### 2.7 Nhãn hiển thị của lượt (`status`, `statusNote`)

Máy chủ tính cho từng lượt gửi ra màn hình (`SessionStatus.classify`, `session-status.ts`); giao diện chỉ đổi mã ra chữ (`src/engine/attendance-status.ts`). Nhãn không đổi giờ, tiền hay luồng giải trình.

| `status` | Nhãn | Khi nào |
| --- | --- | --- |
| `checked-in` | Đã Check-in | Lượt đang mở, giờ vào hợp lệ. |
| `checked-out` | Đã Check-out | Lượt đóng, giờ vào / ra hợp lệ. |
| `pending` | Chờ xử lý | Việc mới nhất của lượt còn chờ (giải trình `requested` / `answered`), hoặc giờ chưa hợp lệ (bên dưới). Yêu cầu điều chỉnh còn `pending` không tính. |
| `approved` | Được phê duyệt | Việc mới nhất là duyệt; hoặc chưa có việc nào mà `entry.attendanceApproved` (Admin xác nhận thiếu giờ). |
| `rejected` | Bị từ chối | Việc mới nhất của lượt (giải trình có `session_id`, giải trình đã quyết định của ngày công không có `session_id`, yêu cầu điều chỉnh) là không duyệt. |
| `admin` | Đã chấm công | `entry.origin === 'sheet.onBehalf'` (Admin khai thay hoặc ghi theo giải trình ngày), hoặc `entry.src === 'admin'` mà lượt không có yêu cầu điều chỉnh được duyệt. Không xét giờ. Giải trình ngày (không `session_id`) mới nhất bị từ chối thì lượt Admin không còn thắng nhãn `admin`. |

Ưu tiên: admin > việc mới nhất (quyết định lấy `decidedAt`, việc còn chờ lấy lúc gửi) > `attendanceApproved` > giờ chưa hợp lệ > checked-in / checked-out.

Giờ chưa hợp lệ (`#issues`, mỗi lý do một câu trong `statusNote`, nối bằng ` · `):

- `pending/forgot-out` không `requestedOut` ⇒ "Quên Check-out"; có `requestedOut` ⇒ "Check-out muộn N phút" (N = `lateCheckoutMin`).
- `off-shift`, `outsideShift`, hoặc lượt so được với ca mà không có `plannedShift` ⇒ "Ngoài ca" (không đo trễ / sớm); `multiple-sessions` ⇒ "Nhiều lượt trong một ca"; `legacy-review` / `needs-review` ⇒ "Cần đối soát giờ chấm"; có giờ ra không giờ vào ⇒ "Quên Check-in"; lý do `pending` khác ⇒ "Cần Admin xem lại"; `outsideZone` ⇒ "Ngoài vùng GPS". `incomplete-shift` chỉ xét theo giờ (trễ / sớm).
- **Vào trễ**: phút trễ theo `ActualHours.lateMinutes` > `attendance.graceMin` (tính cả lượt đang mở) ⇒ "Vào trễ N phút".
- **Về sớm**: giờ ra sớm hơn `plannedShift.endIso` dù 1 phút (làm tròn lên) ⇒ "Về sớm N phút".
- **Check-out muộn**: giờ ra muộn hơn cuối ca + làm thêm đã khai sau ca quá `CHECKOUT_GRACE_MIN` ⇒ "Check-out muộn N phút".

OT, `extraKind`, `otReview`, đi làm ngày lễ không đổi `status`.

`statusNote` của lượt có việc đã quyết định / đang chờ: `rejected` / `approved` là lý do giờ đầu tiên (quyết định về yêu cầu điều chỉnh thêm "Yêu cầu điều chỉnh giờ · " ở trước), không có lý do giờ thì "Giải trình Check-out muộn" (giải trình có `session_id`) / "Giải trình" (giải trình ngày) / "Yêu cầu điều chỉnh giờ"; `approved` do `attendanceApproved` dùng lý do giờ đầu tiên hoặc "Thiếu giờ"; giải trình còn chờ ⇒ "Đã gửi giải trình, chờ Admin" (`answered`) hoặc "Chờ nhân viên giải trình" (`requested`). `checked-in`, `checked-out`, `admin`: `''`.

Nhãn của ô ngày (`AttendanceStatus.dayStatus`, thứ tự `DAY_ORDER`): Chờ xử lý > Bị từ chối > Đã Check-in > Được phê duyệt > Đã chấm công > Đã Check-out; bỏ qua lượt `superseded`, trừ khi mọi lượt đều `superseded`.

`superseded` (`session-view.ts`, cùng luật `ActualHours.inspectDay`): trong cùng ngày công của một người, nếu có lượt Admin dùng được: có lượt chấm thật dùng được ⇒ lượt Admin bị thay (ngày tính theo giờ thật); không có ⇒ mọi lượt bấm đã đóng còn lại của ngày bị thay (quên Check-in/out, chờ đối soát, Check-out muộn chờ duyệt). Lượt đang mở giữ nguyên. Nhãn riêng của từng lượt vẫn giữ.

---

## 5. Realtime và nhật ký

### 5.1 SSE (`src/platform/events.ts`, `GET /api/events`)

| Tin | Payload | Người nhận | Phát khi |
| --- | --- | --- | --- |
| `punch.changed` | `{ month, date }` | chính người đó | `announcePunches` sau yêu cầu có `hintPunch` (Check-in/out, tự đóng, lượt Admin đổi, áp/hoàn giờ Check-out muộn); route giải trình |
| `attendance.changed` | `{ kind:'punch', month }` | có `attendance.correct` phạm vi `all` | `announcePunches`, mỗi tháng một tin |
| `attendance.changed` | `{ kind:'ot', month }` | như trên | `POST/PUT /api/ot` |
| `attendance.changed` | `{ kind:'explanation', month }` | như trên | route giải trình, khi giải trình gắn với một lượt |
| `attendance.changed` | `{ kind:'forgot', month }` | như trên | `announceAttendance` — không bao giờ có gợi ý nên không phát |
| `punch.corrected` | `{ month, date }` | người có OT | `PUT /api/ot` |
| `approvals.changed` | `{ month, pending }` | có `request.decide.*` | `PUT /api/sheet` và `PUT /api/sheet/bulk` khi duyệt đổi; route giải trình |
| `estimate.changed` | `{ month }` | người được khai | `PUT /api/sheet` khai thay; `PUT /api/sheet/bulk` (mỗi người một tin) |
| `request.decided` | `{ month, date, decision }` | người được duyệt | khai thay có khoản được duyệt ngay |
| `params.changed` | `{ configRev, fromMonth, kind, by, groups }` | mọi người | geofence, holidays |

Thời điểm: `punchHints`/`attendanceHints` được phát sau khi controller trả xong, ở `RequestScopeInterceptor` (`src/http/request-scope.interceptor.ts`); lỗi thì xoá, không phát. Các tin khác phát ngay sau giao dịch trong handler.

### 5.2 Nhật ký kiểm toán

| Action | entityKind | Nơi ghi |
| --- | --- | --- |
| `sheet.onBehalf` | `timesheet` (`<u>:<tháng>`), `after { changedDays, autoApproved }` | `sheet-on-behalf.ts` |
| `attendance.admin.set` / `attendance.admin.remove` | `attendance_session`, before/after `{presIn, presOut, shift}`, `reason` (`Giải trình <id>` khi do duyệt giải trình) | `admin-presence.ts` |
| `ot.declare` | `attendance_session`, `reason` | `src/modules/**/*.controller.ts` |
| `ot.decide` | `attendance_session`, `after { status }`, `reason` | `src/modules/**/*.controller.ts+` |
| `explanation.late-checkout`, `explanation.request`, `explanation.self`, `explanation.answer`, `explanation.decide` | `explanation`, trường `username,date,kind,status,decisionNote` | `late-checkout-session.ts`, `src/modules/explanations/explanations.controller.ts` |
| `checkout.late.apply` / `checkout.late.revert` | `attendance_session`, `before/after { presOut }`, `explanationId` | `late-checkout-session.ts` |
| `setting.geofence`, `holiday.set` | `setting` | `src/modules/**/*.controller.ts` |

Không có dòng nhật ký cho: Check-in / Check-out thường (bằng chứng là bảng `punches`), tự đóng lượt quá hạn, nhân viên tự lưu lịch.

---

## 6. Phụ thuộc

### 6.1 Ai gọi module này

- `src/modules/**/*.controller.ts` (route mục 3), `src/app.module.ts` → `src/modules/explanations/explanations.controller.ts`.
- `src/domain/payroll/payroll-service.ts`: `listSessions`, `heldByUser`, `AdminPresence.declaredDates`.
- `src/domain/period/periods.ts`: `closeStaleIn`, `listSessions`, `computeFor`, `isatRefusal`.
- `src/domain/payroll/slip-paid.ts`: `ActualHours.punchTimesOf`.
- `src/domain/approvals/index.ts`, `src/domain/approvals/approvals.ts`: `declaredItems`/`reconcile` cho lịch khai.
- Giao diện ở mục 1.

### 6.2 Module này gọi

`src/platform/db.ts` (store), `src/platform/request-rules.ts` (`rulesFor`, `nowIso`, `vnToday`, `benefitOf`), `src/platform/warnings.ts`, `src/platform/audit.ts`, `src/platform/events.ts`, `src/platform/authz.ts`, `src/platform/config.ts`, `src/domain/positions.ts` (`sheetFlagsOf`, `checkRequestFlags`), `src/domain/leave-days.ts` + `src/engine/leave.ts` (số dư phép), `src/params/store.ts` (bộ tham số theo tháng), `src/domain/shift/*` (danh mục ca, `canonicalOf`).

### 6.3 Dùng chung trình duyệt và máy chủ

`src/engine/punch.ts`, `src/engine/actual-hours.ts`, `src/engine/work-schedule.ts`, `src/engine/payroll-calendar.ts`, `src/engine/approval-view.ts`, `src/engine/payroll-engine.ts`, `src/engine/payroll-params.ts`, `src/engine/attendance-status.ts`. Mỗi file có `FALLBACK` phải bằng `PayrollParams.DEFAULTS` (`scripts/params/check-fallbacks.ts`). Máy chủ dùng bản `rulesFor(tháng).<mô-đun>`; trình duyệt và vài chỗ máy chủ (`admin-presence.ts` và `late-checkout.ts` dùng bản trần/mặc định ở một số hàm) dùng bản mặc định.

### 6.4 Đổi X thì phải kiểm tra Y

| Đổi | Kiểm tra |
| --- | --- |
| `PunchRules.buildDay` / `planShift` | Check-out (`closedEntry`), Admin khai thay (`#build`), đợt chuyển dữ liệu, `ActualHours.inspectDay` (điều kiện usable), test `punch-rules`, `checkin`, `admin-khai-thay` |
| `PunchRules.openSessionDay` / `checkInMsg` / `occurrence` | ngày công của lượt (`date`), `checkInDay`, `CheckinEntitlement.decide`, `guardPeriod` dùng ngày đó, ca đêm cuối tháng, `/today`, `punchView` |
| `attendance.openSessionMaxHours` | `forgotOut`, `staleBefore` (SQL `closeStaleFor`), `forgotOutDate` (`/today`), `shiftConfig` gửi nhân viên |
| `CHECKOUT_GRACE_MIN` / `lateCheckoutMin` | `POST /api/punch` (409), lượt `forgot-out` + `requestedOut`, ngày giữ vì giải trình, nhãn "Check-out muộn", màn giải trình hai phía |
| `ADMIN_ORIGIN` | nguồn `src/domain/attendance/attendance-sessions.ts` (cũng dùng trong SQL), `src/engine/actual-hours.ts` (chép tay), mọi `origin !==` trong `sessionOverlap`, `closedEntry` |
| Ẩn lượt Admin chưa tới giờ ra (`NOT_SCHEDULED`) | `listSessions`, `lastSession`, `AdminPresence.sync` (`includeScheduled`), `ActualHours.apply` (lọc lại theo `asOf`), băm đầu vào kỳ lương |
| `ActualHours.apply` (bất kỳ nhánh nào) | bộ máy lương, `actualReportView`, `/alerts`, `checkoutPreview`, `periods.checklist`, test `actual-hours`, `payroll-attendance`, `payroll-golden` |
| `cutMin` / `attendance.graceMin|stepMin|cutRounding` | `cutRuleView` (bảng gửi nhân viên), `checkoutPreview`, ngưỡng "Vào trễ" của `SessionStatus` |
| Giờ nghỉ (`time.breakAfterWorkHours/breakHours`) | `analyseShift.isWorkOffset`, `PayrollCalendar.splitMainWork/splitExtraWork` (đoạn OT không có giờ nghỉ), `payroll-engine.breakSlots` — phải cùng một luật |
| `cleanDays` / `checkSheet` | `AdminPresence.sync` (trường so sánh), `approvals.declaredItems`, `estimateDays` (`ESTIMATE_FIELDS`) |
| `estimateDays` / `ESTIMATE_FIELDS` | `estimateSheet` (mọi nơi đọc lịch), băm đầu vào kỳ lương |
| `heldByUser` / trạng thái giải trình | `heldFor`, `AdminPresence.declaredDates`, `computeMonth`, lỗi thời của lần tính (băm), `periods.checklist`, giao diện giải trình |
| `punchTimes` / `punchTimesOf` | `slip-paid.withPunchTimes`, `withoutPunchTimes` |
| Lịch làm việc (`type.*.dows`) | `planShift.kind`, `openSessionDay`, `checkInDay`, ngày mặc định của `apply`, `checkSheet` `SHEET_OFF_SCHEDULE`, `isWorkDay` của bộ máy |
| Bảng ca (`shift.preset.*`, danh mục ca) | `SHIFT` (punch), `SHIFT_TIMES` (actual-hours), `PRESET_RE` (server), ca Admin chọn (`adminShiftOf`) |
| Ngày lễ | `checkSheet` (OT lễ), `apply` (isWork, ngày mặc định, `holidayWindow`), `calcDay` (noshow mất lương lễ), `holidayOtConflicts`, `reconcileHolidayWork`, `checkInDay` |

---

## 7. Test hiện có

API (`test/api/`): `attendance-session-status`, `attendance-sessions`, `checkin`, `staff-checkin-gate`, `session-migration`, `punch-shift-config`, `today-overnight`, `fixed-attendance`, `geofence`, `admin-entered-shift-pay`, `admin-entry-shift-required`, `explanation-attendance-event`, `checklist-punch-review`, `period-sessions-month`, `holiday-ot-guard`, `approvals-holiday-work`, `makeup-day-removed`, `alerts`, `schedule-punch`, `schedule-estimate-calendar`, `schedule-isat-holiday-makeup`, `sheet-rev`, `sheet-shift-lock`, `shift-code-validation-regression`, `period-lock-guards`, `optimistic-rev`, `slip-row-columns-api`, `sandbox-reset-explanations`, `permissions-matrix`; các file đặt tên theo chức năng có tiền tố thời gian: `*-admin-khai-thay`, `*-realtime-cham-cong`, `*-doc-cham-cong-khong-ghi`, `*-don-punch-requests`, `*-gio-thuc-te-mac-dinh`, `*-admin-willmakeup-on-behalf`, `*-staff-sheet-rev`, `*-late-checkout-approval`, `*-block-ot-late-checkout`, `*-holiday-ot-entry`, `*-makeup-entry-fixes`, `*-makeup-date-note-ai-block`, `*-checklist-explanation-pending`, `*-explanation-declared-off-day`, `*-explanation-forgot-punch-approved`, `*-explanation-late-early-approved`, `*-explanation-rejected-no-workday`, `*-held-day-row-punch-times`, `*-merge-punch-times-explanation`, `*-sandbox-reset-period-state`.

Unit (`test/unit/`): `punch-rules`, `actual-hours`, `schedule-actual-hours`, `payroll-attendance`, `session-status`, `session-supersede`, `attendance-status`, `attendance-makeup-days`, `checkin-blocked-on-off-day`, `isat-calendar`, `isat-saturday-entitled`, `holiday-break-paid-once`, `holiday-ot-after-night-shift`, `holiday-ot-approved-window`, `holiday-row-display`, `makeup-into-holiday`, `makeup-paid-in-full`, `makeup-surplus-removed`, `no-ot-benefit-holiday`, `ot-day-allowance`, `ot-no-break`, `ot-unscheduled-day-paid`, `ot-weekend-rate`, `legacy-makeup-day-engine`, `day-picker-no-makeup`, `approval-view-holiday-ot`, `payroll-holiday`, `geofence-distance`, `slip-real-punch-times`, `slip-real-punch-times-ui`, `slip-holiday-day-cells`, `schedule-module`, `schedule-copies`, `schedule-defaults-zero-drift`, `schedule-workdays-computed`, `work-schedule-days`, `approval-rules-counts-absent`, `old-snapshot-counts-absent`, `payroll-golden`; có tiền tố thời gian: `*-cut-over-grace`, `*-held-by-user-status`, `*-session-status-day-explanation`, `*-slip-held-day-punch-times`, `*-holiday-rules`, `*-makeup-review-fixes`, `*-nhan-vien-punch-luu-request-id`.

UI (`test/ui/`): `admin-attendance-grid-labels`, `attendance-labels`, `admin-makeup-calendar`, `day-kind-options`, `isat-only-saturday-entitled`, `staff-holiday-ot-request`, `staff-self-requests`.

Tự kiểm của mô-đun: `node src/engine/punch.ts` (`src/engine/punch.ts`).

---

## 8. Điểm chưa nhất quán và phần chưa nối trong code

Chỉ ghi nhận hiện trạng của mã.

### 8.1 Logic trùng lặp / hai nơi tính một việc khác nhau

1. **Phút vào muộn tính nhiều cách.** `ActualHours.lateMinutes` theo bộ tham số tháng ở `/today` (`src/modules/attendance/attendance.controller.ts`) và ở nhãn lượt (`SessionStatus` qua `rules(month)`); cùng hàm nhưng bản trần (mặc định) ở màn Admin; `PunchRules.lateMin` phút thô có tính cả giờ nghỉ, theo lần ca gần nhất của **mã ca** chứ không theo `plannedShift` ở app nhân viên; báo cáo `apply` (`missedStart`, chỉ phút làm). Phút **ra sớm** ở màn Admin tính thô `endIso − presOut` (`earlyMinutes`), khác `missedEnd` của `ActualHours` (bỏ giờ nghỉ).
2. **`ActualHours.apply` chạy trên đầu vào khác bộ máy.** Bộ máy chạy trên lịch đã qua `payView`; `actualReportView`, `/alerts` chạy trên lịch khai; `checkoutPreview` dựng ngày giả `kind:'work'` bỏ qua ngày khai thật (làm bù, OT). Trạng thái ngày nhân viên / Admin thấy có thể khác ngày được trả (vd. khoản đi làm lễ chưa duyệt bị bỏ trong bộ máy nhưng hiện `absent` cho nhân viên). `actualReport` cũng không áp ngày giữ vì giải trình.
3. **Hai hàm kiểm chồng giờ lượt** với luật loại trừ khác nhau: `sessionOverlap` (`src/domain/attendance/index.ts`) và `AdminPresence.#overlap` (`admin-presence.ts`).
4. **Bảng đổi mã ca hai nơi**: `SHIFT_CODES` + `shiftAliases` (`src/engine/punch.ts`) và `ShiftCatalog.canonicalOf/presetOf` (`src/domain/shift/shift-catalog.ts`); thêm `PRESET_RE` riêng ở `src/modules/sheet/sheet.helpers.ts`.
5. **`ADMIN_ORIGIN` chép tay** ở `src/engine/actual-hours.ts` (nguồn: `src/domain/attendance/attendance-sessions.ts`).
6. **Trần giờ làm một nguồn**: `DAY_HOURS_CAP` (`src/domain/overtime/hour-limits.ts`, giờ ròng một ngày) và `MONTH_OT_CAP`, đọc từ `law.ceiling.otDayTotalHours` / `law.ceiling.otMonthHours` của `DEFAULTS`.
7. **Khung đêm 22h–6h hai nguồn**: `overlapsNight` và `shiftFor` viết cứng 1320/360/420 (`src/domain/overtime/worked-hours.ts`), trong khi `PayrollCalendar` đọc `time.nightStartHour/nightEndHour`.
8. **Giờ OT ngày lễ đếm ở hai nơi**: lịch khai (`estimateHolidayOtHours`) và Check-in/out (`actualHolidayOtHours`). Cùng giờ thô, khác nguồn dữ liệu.
9. **Hai hàm giờ OT**: `estimateOtHours` (lịch khai), `actualOtHours` (lượt, bỏ OT bị từ chối); cả hai đếm giờ thô, không trừ giờ nghỉ.

### 8.2 Mã chết / trường không ai đọc

10. `attendanceHints` không bao giờ được thêm, nên `announceAttendance` và tin `attendance.changed` kind `forgot` không bao giờ phát (`src/platform/announce.ts`).
11. `noShowDates()` luôn trả tập rỗng (`src/engine/payroll-engine.ts`); vắng thật đến từ `ActualHours.apply` (`kind:'noshow'`).
12. (đã gỡ) Lớp `AttendanceCalendar` chưa nối đã bị xoá khỏi mã; số ngày đi làm do `ActualHours` và bộ máy lương tính.
14. Trường ghi mà không đọc: `otNeedsReview`, `otDeclarationHistory`, `otHistory` (`src/modules/attendance/attendance.controller.ts` `1410`). `punchState` trả hằng `sunday:false`, `outside:''`.
15. Tính năng sửa giờ (`corrections`) không có route ghi nhưng `GET /api/sheet` vẫn trả `corrections` và mọi lượt vẫn kèm `corrections` (`src/domain/attendance/index.ts`); hàm kiểm `version` của lượt vẫn tên `correctionVersion` dù chỉ OT dùng.
16. Tham số `time.maxSpanHours` (9) còn trong `src/engine/payroll-params.ts` nhưng không mã nào đọc. Các ô chính sách một giá trị (`beyondShiftRule`, `extraWindowRule`, `extraSourceRule`, `futureDaysRule`, `declaredLeaveRule`, `missingOneSideRule`, `undeclaredPunchRule`) chỉ được kiểm hợp lệ, không rẽ nhánh nào.
17. OT ghi ở Check-in/out (`POST/PUT /api/ot`) không bao giờ ra tiền (mục 4.8) nhưng vẫn đi qua đầy đủ kiểm trần, duyệt, nhật ký, và vẫn được cộng vào trần giờ lễ + OT (`src/modules/attendance/attendance.controller.ts`, `ot.ts`).
18. `PunchRules.checkInMsg` còn câu "nhờ Admin ghi giờ" / "nhờ Admin gán ca"; câu này chỉ hiện qua `punchView` (`mode: 'window' | 'noshift'`) khi máy chủ không trả `checkInBlock`; máy chủ dùng câu của `CheckinEntitlement`.

### 8.3 Số nghiệp vụ viết cứng (không qua registry)

19. `src/domain/overtime/worked-hours.ts` (1320, 360, 420 của khung đêm); `src/domain/timesheet/` (nối ở `timesheet/services.ts`) (1440, 60); `src/modules/**/*.controller.ts` (`breakMin` ≤ 1440); `src/domain/attendance/geofence-policy.ts` (20–5000 m, 100 m, 10–1000 m); `src/domain/explanation/explanation-service.ts` (`TEXT_MAX` 500, khác `NOTE_MAX` 300 và `control.reasonMaxLength`); `src/modules/**/*.controller.ts` `1395` (lý do OT cắt 300 ký tự viết cứng); `DAY_HOURS_CAP` = 12 và `MONTH_OT_CAP` = 40 (`src/domain/overtime/hour-limits.ts`) là hai trần chặn cứng, đọc từ khoá luật `law.ceiling.otDayTotalHours` / `law.ceiling.otMonthHours` của `DEFAULTS`.

### 8.4 Hành vi dễ gây lỗi dây chuyền

22. Lượt `kind:'pending'` lý do `incomplete-shift` / `multiple-sessions` vẫn được tính tiền (`actual-hours.ts`) nhưng bị đếm vào `pendingDays` ở `/team` (`src/modules/attendance/attendance.controller.ts` / `src/modules/sheet/sheet.controller.ts`).
23. Lượt Admin chỉ được đồng bộ khi Admin khai thay (`sheet-on-behalf.ts`): nhân viên tự đổi ngày đó (sang nghỉ, đổi giờ) thì lượt Admin cũ vẫn còn với giờ cũ.
24. `AdminPresence.#build` ghi cả entry `pending/off-shift` khi giờ khai không chồng ca (`admin-presence.ts` + `punch.ts`): ngày đó thành "không khớp ca, chờ Admin" thay vì báo lỗi lúc lưu.
25. `SHEET_SUNDAY` không miễn ngày không đổi (`timesheet/timesheet-validator.ts`) như các kiểm khác: một ngày Chủ nhật đã lưu làm mọi lần lưu sau của tháng đó có cảnh báo `SHEET_SUNDAY`.
26. `lateCheckoutMin` dùng `spanH(planned.out, extraOut)` (`late-checkout.ts`); `spanH` trả 24 giờ khi hai giờ bằng nhau và gần 24 giờ khi `extraOut` sớm hơn `planned.out` (`overtime/worked-hours.ts`). Ngày khai có ca khác ca được gán (vd. ca gán 08–17, khai 06–15 kèm `extraOut` 17:00) cho khoảng được phép ~24 giờ, nên Check-out muộn không bị đòi giải trình.
27. Route giải trình không khoá kỳ ở cổng (`src/platform/authz.ts`) nhưng quyết định đổi `presOut` của lượt (`late-checkout-session.ts`) và ngày giữ vì giải trình đổi tiền; kỳ đã khoá chấm công vẫn bị thay đổi dữ liệu đầu vào khi quyết định là Check-out muộn.
28. Mọi giải trình chưa duyệt (cả kind `admin`, `ai`) giữ ngày công (`heldByUser`); `POST /api/explanations {sessionId, text}` cho phép nhân viên tự tạo giải trình Check-out muộn cho bất kỳ lượt nào của mình, kể cả lượt không muộn, và việc này tự giữ ngày đó (`src/modules/explanations/explanations.controller.ts`, `explanation-service.ts`); `POST /api/explanations {date, text}` cho phép nhân viên giải trình ngày vắng của chính mình (không có lượt nào).
29. Lượt Admin bị giấu theo đồng hồ (`NOT_SCHEDULED`, `src/domain/attendance/attendance-sessions.ts`): kết quả `listSessions` — và do đó đầu vào kỳ lương — đổi chỉ vì thời gian trôi qua giờ ra của lượt Admin khai trước.
