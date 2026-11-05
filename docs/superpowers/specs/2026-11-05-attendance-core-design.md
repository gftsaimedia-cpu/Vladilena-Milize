# Chấm công lõi BE v2 (spec 2) — thiết kế

- Ngày: 2026-11-05
- Nhánh: `claude/interesting-maxwell-4c6da0`, worktree `.claude/worktrees/vigilant-feynman-dbb291`, tách từ `main` 6dcce9e (đã chứa 620e434).
- Trạng thái: người dùng đã duyệt spec trong chat ngày 2026-11-05 ("Duyệt spec"). Plan: `docs/superpowers/plans/2026-11-05-attendance-core.md`.

## 1. Mục tiêu và phạm vi

Mỗi người, mỗi ngày có **đúng một dòng ngày công** trong `timesheet_entries`. Dòng nói ngày đó là loại gì, có trường hợp chấm công nào cần giải trình, giải trình đang ở đâu, được trả mấy ngày lương, bị trừ bao nhiêu phút, có tính là ngày đi làm hay ngày nghỉ không, và có bao nhiêu phút làm bù.

Lương, app nhân viên (`/me`) và màn Chấm công của Admin cùng đọc dòng đó. Một ngày không còn hiện "vắng" ở chỗ này mà được trả lương theo cách khác ở chỗ kia.

Người dùng chọn hướng **B: ghi lúc xảy ra** (2026-11-05): `timesheet_entries` là nơi đọc duy nhất. Mọi thao tác làm đổi ngày công đều ghi lại dòng ngay lúc đó. Để các điểm ghi không lệch nhau, mọi điểm đều đi qua **một hàm** `refreshDays`, và hàm này dựng dòng bằng **một hàm thuần** `buildDay`.

### 1.1 Bốn lỗ đã kiểm trong code (main 6dcce9e)

| # | Lỗ | Chỗ trong code |
|---|---|---|
| 1 | Đơn nghỉ đã duyệt chỉ ghi `work_schedules` ON_LEAVE, không tạo dòng công nào. Lương và `/me` chỉ đọc `timesheet_entries`, nên ngày nghỉ có lương không được trả và `/me` hiện "vắng". `applyApprovedLeave` không ai gọi. iSAT: lương có trả (đọc riêng `isat_registrations`), nhưng `/me` vẫn hiện "vắng". | `requests.service.ts` (`markLeaveDays`), `daily-timesheet.ts` (`applyApprovedLeave`), `payroll.service.ts` (vòng lặp `timesheets`), `me/domain/me-views.ts` (`daySummaryOf`) |
| 2 | Lương không đọc đơn giải trình. Mọi dòng NORMAL/FLEX/NIGHT trả đủ ngày. Trễ/sớm trừ theo phút thô. | `payroll.service.ts` |
| 3 | Chấm công Chủ nhật tự tạo lịch Normal 08–17, và lương đếm dòng đó là 1 ngày công. | `attendance.repository.ts` (`ensureDefaultSchedule`), `employee-payslip.ts` (đếm `NORMAL/FLEX/NIGHT`) |
| 4 | Ra muộn tới +30 phút vẫn hợp lệ, luật là 15. Bộ dò riêng của nhánh staff-requests (`explanationCasesOf`) cũng dùng 30 và không có LATE_CHECK_OUT. Ngày vắng hẳn không có dòng nào. | `daily-timesheet.ts` (`diffOutMin <= 30`), `claude/staff-requests-e8fd71:src/modules/requests/domain/explanation-detect.ts` |

## 2. Luật đã chốt (người dùng, trong chat)

Chỉ những luật dưới đây được dùng. Thứ gì không có ở đây thì không làm, hoặc nằm ở mục 12 dưới dạng phán quyết kỹ thuật để người dùng xem.

Ví dụ dùng chung: Bình, nv bậc 1, lương cơ bản 6.000.000, công chuẩn 26 → lương ngày 230.769, lương giờ 28.846.

| Mã | Luật | Ngày chốt | Ví dụ |
|---|---|---|---|
| L1 | Ngày làm có lịch mà không có giờ vào, giờ ra → 0 đ. | 04/11 | |
| L2 | Ngày chấm sai phải giải trình. Không nộp hoặc bị từ chối → 0 đ. Được duyệt → trả theo trường hợp (L4). | 04/11 | |
| L3 | Bảy trường hợp cần giải trình: vào trễ quá 15 phút; ra sớm (dù 1 phút); thiếu giờ vào; thiếu giờ ra; vào sớm quá 15 phút; ra muộn quá 15 phút khi không có OT; ra muộn quá 30 phút là "quên check-out". | 04/11 | |
| L4 | Giải trình được duyệt: trễ và sớm trừ theo khối 30 phút (≤ 15 không trừ; 16–44 → 30; 45–74 → 60; 75–104 → 90). Các trường hợp khác trả đủ ngày. | 04/11 | Vào 08:40 ca 08–17, đã duyệt → 230.769 − 14.423 = 216.346 |
| L5 | Ngày vừa trễ vừa sớm: làm tròn từng bên rồi cộng (giống mặc định `lateEarlyRule: 'separate'` của v1). | 05/11 | Vào 08:20, ra 16:40 → 30 + 30 = 60 phút → trừ 28.846 |
| L6 | Giải trình còn chờ lúc tính lương → phiếu nháp hiện ngày đó 0 đ kèm cờ. | 04/11 | |
| L7 | Ra giữa ca rồi vào lại không được phép: lần ra trong ca là ra sớm. | 04/11 | |
| L8 | OT có khung đã duyệt mà giờ ra lệch khỏi giờ hết khung → phải giải trình, nhưng chỉ để biết, tiền ngày không đổi. Phần này áp luôn cho khung làm bù (duyệt ở phần 2 thiết kế, 05/11). | 04/11, 05/11 | |
| L9 | Lễ, phép có lương, iSAT: 1 lương ngày cho loại có cờ (`paidHoliday`, `paidLeave`, `isat`), không phụ cấp. Nghỉ không lương 0 đ. BHXH 0 đ. | 04/11 | nv 230.769, tts 0 |
| L10 | Lễ lấy từ lịch lễ công ty và chỉ tính khi rơi vào ngày làm của người đó. | 04/11 | |
| L11 | Ngày chưa tới không phải ngày vắng. | 05/11 | |
| L12 | Ngày ngoài tuần làm việc (Chủ nhật; Thứ Bảy với tts hoặc người có tuần riêng), có làm qua OT hoặc làm bù đã duyệt → không phải ngày công: không lương ngày, không vào số ngày đi làm, không giải trình theo ca 08–17. Chỉ có tiền OT hoặc tiền giờ bù. | 05/11 | OT 08–12 CN 15/11 → chỉ 4 × 28.846 × 2 = 230.769 |
| L13 | Ngày trước `start_date` và sau `resigned_on` (chính ngày nghỉ việc vẫn là ngày làm) là ngoài thời gian làm: không vắng, không trả, không tính chuyên cần. Lễ rơi vào đó không trả. | 05/11 | Chi vào 11/11 → 02–10/11 không ảnh hưởng gì |
| L14 | Nghỉ có làm bù: ngày nghỉ 0 đ. Mỗi phút có mặt trong khung bù đã duyệt trả ×1 lương giờ, hiện ở ngày bù. | 05/11 | Đủ 8h → 230.769; chỉ 4h → 115.385 |
| L15 | Chuyên cần: mất khi số ngày nghỉ ≥ 3. Đếm mọi loại nghỉ trừ iSAT, và đếm cả ngày vắng. | 04/11 | |
| L16 | Nghỉ có làm bù chỉ đếm vào chuyên cần khi cuối tháng bù còn thiếu. Số ngày đếm = làm tròn lên (giờ còn thiếu ÷ 8), không quá số ngày nghỉ có bù. | 05/11 | Bù đủ → không đếm; thiếu 1h → đếm 1 |
| L17 | Ngày đi làm sai giờ, chưa giải trình hoặc bị từ chối: 0 đ, không vào số ngày đi làm, **không** tính là ngày nghỉ cho chuyên cần. | 05/11 | Trễ 40 phút ngày 03, 04, 05/11, không giải trình → mất 692.308, giữ chuyên cần |
| L18 | Thu nhập tạm tính của nhân viên chỉ tính ngày đã qua. | 05/11 | |
| L19 | Loại nghỉ theo 6 nhóm. Nhóm trả lương (`payGroup`): PAID = Phép năm, Việc riêng có lương, Phúc lợi nội bộ; UNPAID = Việc riêng không lương, Không lương; SOCIAL_INSURANCE = Chế độ BHXH. | 04/11 (spec 1) | |
| L20 | Làm lệch giờ so với lịch mà không có đơn đổi ca: không quyết ở đây (để AI agent sau này). Ngày đó vẫn đo theo lịch như bình thường. | 04/11 | |

## 3. Các loại ngày

Cột `status` của `timesheet_entries` là loại ngày.

| `status` | Khi nào | `pay_units` | `counts_as_workday` | `counts_as_day_off` |
|---|---|---|---|---|
| `OUTSIDE` | trước `start_date` hoặc sau `resigned_on` (L13) | 0 | không | không |
| `HOLIDAY` | lễ công ty rơi vào ngày làm của tuần người đó (L10) | 1 nếu có cờ `paidHoliday`, ngược lại 0 | không | không |
| `ISAT` | lịch ngày đó là iSAT đã duyệt | 1 nếu có cờ `isat`, ngược lại 0 | không | không |
| `LEAVE_PAID` | lịch ON_LEAVE từ đơn LEAVE nhóm PAID, và loại nhân sự có cờ `paidLeave` | 1 | không | có |
| `LEAVE_UNPAID` | lịch ON_LEAVE từ đơn LEAVE nhóm UNPAID hoặc SOCIAL_INSURANCE, hoặc nhóm PAID với loại không có cờ `paidLeave` | 0 | không | có |
| `LEAVE_MAKEUP` | lịch ON_LEAVE từ đơn LEAVE_WITH_MAKEUP (L14) | 0 | không | không (xét ở cấp tháng, L16) |
| `REST` | ngày ngoài tuần làm việc, không có khung OT hoặc khung bù đã duyệt | 0 | không | không |
| `EXTRA` | ngày ngoài tuần làm việc, có khung OT hoặc khung bù đã duyệt (L12) | 0 | không | không |
| `PENDING` | ngày làm chưa tới mốc xét (mục 4.3): ngày tương lai, hoặc hôm nay đang làm | 0 | không | không |
| `PRESENT` | ngày làm đã xét, có ít nhất một lần chấm, hoặc có giải trình được duyệt cho ngày vắng | theo mục 5 | có nếu `pay_units` = 1 | không |
| `ABSENT` | ngày làm đã xét, không có lần chấm nào, chưa có giải trình được duyệt | 0 | không | có |

Thứ tự xét (cái trước thắng):

1. `OUTSIDE`
2. `HOLIDAY` (lễ trên ngày làm)
3. lịch ON_LEAVE: `ISAT`, `LEAVE_MAKEUP`, `LEAVE_PAID`, `LEAVE_UNPAID`
4. không phải ngày làm: `EXTRA` hoặc `REST`. Lễ rơi vào ngày nghỉ tuần cũng đi vào đây và không được trả.
5. ngày làm: `PENDING`, `PRESENT` hoặc `ABSENT`.

"Ngày làm" là thứ trong tuần thuộc tuần làm việc của người đó trong tháng đó (mục 9). Chủ nhật không bao giờ là ngày làm.

Đơn nghỉ đã duyệt không thể giữ ngày lễ (2c7088b bỏ ngày lễ ra khỏi đơn lúc duyệt), nên bước 2 đứng trước bước 3 không làm mất ngày nghỉ nào.

## 4. Bộ dò trường hợp giải trình

### 4.1 Một bộ dò duy nhất

`src/modules/attendance/domain/explanation-detect.ts`:

```ts
detectCases(input: {
  date: string;                       // ngày công 'YYYY-MM-DD'
  shift: { start: string; end: string } | null;   // null trên ngày EXTRA/HOLIDAY
  windows: Array<{ kind: 'OT' | 'MAKEUP'; start: string; end: string }>; // khung đã duyệt của ngày
  checkIn: Date | null;               // lần vào đầu tiên
  checkOut: Date | null;              // lần ra cuối cùng
  firstOutInShift: Date | null;       // lần ra đầu tiên trước giờ hết ca (L7)
  graceMinutes: number;               // ân hạn vào trễ (mục 9), mặc định 15
  evaluated: boolean;                 // đã tới mốc xét (4.3)
}): { cases: DetectedCase[]; lateMinutes: number; earlyMinutes: number }

type DetectedCase = { code: ExplanationCase; minutes: number; affectsPay: boolean };
```

Mã trường hợp là 7 mã đã có ở `requests/domain/explanation-cases.ts`. `refreshDays` và form giải trình của nhân viên (nhánh staff-requests) **cùng dùng** hàm này. Giờ ca hiểu theo giờ Việt Nam; ca đêm có giờ hết ca ở ngày hôm sau.

### 4.2 Luật dò

- **Mốc đầu và mốc cuối dự kiến:**
  - Mốc đầu là giờ bắt đầu của khung sớm nhất nằm trước ca; nếu không có khung nào như vậy thì là giờ vào ca.
  - Mốc cuối là giờ kết thúc của khung muộn nhất nằm sau ca; nếu không có thì là giờ hết ca.
- **Ảnh hưởng tiền** (`affectsPay: true`), đo so với **ca**:
  - `LATE_CHECK_IN`: vào sau giờ vào ca + ân hạn. `minutes` = số phút sau giờ vào ca, lấy phần nguyên.
  - `EARLY_CHECK_IN`: vào trước giờ vào ca quá 15 phút, khi không có khung nào trước ca.
  - `EARLY_CHECK_OUT`: có lần ra trước giờ hết ca (`firstOutInShift`). `minutes` = giờ hết ca − lần ra đó, lấy phần nguyên.
  - `LATE_CHECK_OUT`: ra sau giờ hết ca hơn 15 phút và tới 30 phút, khi không có khung nào sau ca.
  - `FORGOT_CHECK_OUT`: ra sau giờ hết ca quá 30 phút, khi không có khung nào sau ca.
  - `MISSING_CHECK_IN`: không có lần vào, mà có lần ra hoặc ngày đã xét.
  - `MISSING_CHECK_OUT`: không có lần ra và ngày đã xét.
- **Chỉ để biết** (`affectsPay: false`, L8): lệch so với **khung**.
  - Vào sau giờ bắt đầu khung trước ca quá 15 phút, nhưng chưa trễ so với ca: `LATE_CHECK_IN`.
  - Vào trước mốc đầu quá 15 phút: `EARLY_CHECK_IN`.
  - Ra sau giờ hết ca nhưng trước giờ hết khung sau ca: `EARLY_CHECK_OUT`.
  - Ra sau giờ hết khung quá 15 phút (tới 30) hoặc quá 30 phút: `LATE_CHECK_OUT` hoặc `FORGOT_CHECK_OUT`.
  - Trên ngày `EXTRA` và `HOLIDAY` (không có ca), mọi trường hợp đều là "chỉ để biết". Thiếu giờ vào hoặc ra ở đây chỉ ảnh hưởng tiền OT và tiền bù.
- Một mã chỉ xuất hiện một lần trong một ngày. Khi cùng một mã vừa ảnh hưởng tiền vừa chỉ để biết, bản ảnh hưởng tiền thắng.

### 4.3 Mốc xét

Ngày làm được xét (rời `PENDING`) khi một trong hai điều sau đúng:

- đã có cả lần vào lẫn lần ra;
- giờ hiện tại ≥ mốc cuối dự kiến + 30 phút.

Trước mốc đó, ngày là `PENDING`, không có trường hợp "thiếu", và trả 0 (L11, L18).

*Ví dụ:* ca 08–17, chưa chấm gì. Lúc 17:29 ngày vẫn là `PENDING`. Lúc 17:30 job xét ngày thành `ABSENT`.

## 5. Tiền của ngày đi làm (`PRESENT`)

- **Giải trình của ngày:** lấy đơn EXPLANATION mới nhất, không tính đơn đã huỷ, có `explanation_date` = ngày đó. `explanation_status` là `NONE`, `PENDING`, `APPROVED` hoặc `REJECTED`. Một đơn được duyệt phủ mọi trường hợp dò được của ngày đó.
- **Không có trường hợp ảnh hưởng tiền:** `pay_units` = 1, `deduction_minutes` = 0.
- **Có trường hợp ảnh hưởng tiền:**
  - `APPROVED` → `pay_units` = 1. `deduction_minutes` = khối(phút trễ) + khối(phút sớm) (L4, L5), với khối(m) = 0 khi m ≤ 15, ngược lại ⌊(m + 15) ÷ 30⌋ × 30. Tổng không quá 480 (mục 12, R7).
  - `PENDING`, `NONE` hoặc `REJECTED` → `pay_units` = 0 (L2, L6, L17).
- **Ngày vắng có giải trình được duyệt:** quên cả vào lẫn ra, có giờ ghi trong đơn. Ngày thành `PRESENT` với hai mã thiếu, và `pay_units` = 1.
- **Phút làm bù** (`makeup_minutes`): số phút trùng giữa [lần vào, lần ra] và từng khung bù đã duyệt của ngày. Thiếu một bên mà giải trình đã duyệt có ghi giờ thì dùng giờ ghi trong đơn, giống cách phiên payslip-print đo OT. Áp cho ngày `PRESENT` và `EXTRA`.
- **Ví dụ** (Bình, ca 08–17):

| Chấm | Giải trình | Kết quả |
|---|---|---|
| 08:05–17:10 | — | `PRESENT`, 1, trừ 0 → 230.769 |
| 08:40–17:00 | đã duyệt | `PRESENT`, 1, trừ 30 → 216.346 |
| 08:40–17:00 | chưa nộp | `PRESENT`, 0 → 0 đ, cờ "chưa giải trình" |
| 08:20–16:40 | đã duyệt | trừ 30 + 30 = 60 → 201.923 |
| không chấm | — | `ABSENT`, 0, tính 1 ngày nghỉ cho chuyên cần |
| ca 08–17, khung bù 18–22, chấm 08:00–21:00 | — | `PRESENT`, 1. `EARLY_CHECK_OUT` chỉ để biết, 60 phút. `makeup_minutes` = 180 |

## 6. Dữ liệu (`migrations/postgres/schema.sql`, sửa thẳng)

Bảng `timesheet_entries`:

- **Cột giữ nguyên:** `id`, `employee_id`, `work_date`, `actual_check_in`, `actual_check_out`, `work_hours` (giờ có mặt), `late_minutes`, `early_minutes` (phút thô của các mã ảnh hưởng tiền), `is_locked`, `created_at`, `updated_at`. Khoá duy nhất (`employee_id`, `work_date`) giữ nguyên.
- **Cột nới thành NULL được:** `shift_type`, `shift_start_time`, `shift_end_time`, `shift_allowance_pct`. Các cột này rỗng trên những ngày không có ca.
- **`status`:** thêm `CHECK (status IN ('OUTSIDE','HOLIDAY','ISAT','LEAVE_PAID','LEAVE_UNPAID','LEAVE_MAKEUP','REST','EXTRA','PENDING','PRESENT','ABSENT'))`.
- **Cột mới:**

| Cột | Kiểu | Nghĩa |
|---|---|---|
| `leave_type` | TEXT NULL, CHECK 6 mã | loại nghỉ của ngày `LEAVE_*` |
| `source_request_id` | UUID NULL REFERENCES system_requests | đơn nghỉ, nghỉ có bù hoặc iSAT của ngày |
| `cases_json` | TEXT NOT NULL DEFAULT '[]' | `[{ code, minutes, affectsPay }]` |
| `explanation_status` | TEXT NOT NULL DEFAULT 'NONE', CHECK 4 giá trị | |
| `explanation_request_id` | UUID NULL REFERENCES system_requests | |
| `pay_units` | REAL NOT NULL DEFAULT 0, CHECK IN (0, 1) | |
| `deduction_minutes` | INTEGER NOT NULL DEFAULT 0, CHECK ≥ 0 | |
| `counts_as_workday` | BOOLEAN NOT NULL DEFAULT false | |
| `counts_as_day_off` | BOOLEAN NOT NULL DEFAULT false | |
| `makeup_minutes` | INTEGER NOT NULL DEFAULT 0, CHECK ≥ 0 | |

- **Cột cũ ghi cho khớp:**
  - `work_units` = `pay_units`.
  - `day_status` lấy từ dòng, để FE cũ vẫn đọc được: `PENDING` → `PLANNED` hoặc `IN_PROGRESS`; `PRESENT` có mã ảnh hưởng tiền mà chưa duyệt → `NEEDS_EXPLANATION`; `PRESENT` còn lại → `VALID`; `LEAVE_*` và `ISAT` → `ON_LEAVE`; các loại khác → `PLANNED`.
  - `check_in_status` và `check_out_status` lấy từ mã.
  - `ot_hours` luôn 0: OT do payslip-print đo từ khung và giờ có mặt.

`DailyTimesheet` (domain) đổi theo các cột trên. `calculate` và `applyApprovedLeave` bị bỏ; `buildDay` thay chỗ của chúng.

## 7. Ghi: `refreshDays`

### 7.1 Hàm và nguồn

`AttendanceDaysService` (`src/modules/attendance/attendance-days.service.ts`):

- `refreshDays(employeeId, dates, { trx, now })`
- `refreshMonth(employeeId, month, { trx, now })`
- `refreshDateForAll(date, { trx, now })`

Mỗi lần gọi:

1. **Tải nguồn cho các ngày đó.** `AttendanceDaysRepository.loadSources` đọc thẳng các bảng; module chấm công không import module khác.
   - Hồ sơ: uuid, loại, `start_date`, `resigned_on`, ca mặc định `staff.shift_*`.
   - Cờ `paidLeave`/`paidHoliday`/`isat` của phiên bản loại nhân sự đang hiệu lực trong tháng.
   - Tuần làm việc và ân hạn, lấy qua cổng (mục 9).
   - Lịch `work_schedules`, kèm loại đơn và `leave_type` của `source_request_id`.
   - Các lần chấm `punch_events`.
   - Khung OT đã duyệt (`system_requests` OVERTIME: `ot_date`, `ot_start_time`, `ot_end_time`).
   - Khung bù đã duyệt (`makeup_slots` của đơn LEAVE_WITH_MAKEUP đã duyệt).
   - Đơn giải trình theo ngày.
   - Ngày lễ `company_holidays`.
2. **Dựng dòng** bằng hàm thuần `buildDay` (`domain/attendance-day.ts`).
3. **Ghi đè** bằng `INSERT … ON CONFLICT (employee_id, work_date) DO UPDATE … WHERE timesheet_entries.is_locked = false`. Dòng đã khoá không bị ghi lại.

**Ca của ngày làm:** nếu ngày đó có dòng lịch SHIFT_CHANGE thì lấy giờ của dòng đó; nếu không thì lấy ca mặc định trong hồ sơ lúc ghi. Dòng lịch REGULAR do chấm công tự tạo không được dùng (mục 12, R3). Vì vậy dòng REGULAR mà chấm công Chủ nhật tạo ra không còn biến Chủ nhật thành ngày công.

**Khoá:** mọi lần ghi chạy trong transaction, dưới khoá tư vấn của nhân viên `requests_<uuid>`, là khoá mà Đơn từ đang dùng (R2). Chấm công, Đơn từ, job và Lương dùng chung khoá này, nên các thao tác trên cùng một người không chồng lên nhau.

### 7.2 Điểm kích hoạt

| # | Thao tác | Ngày được ghi lại | Chỗ sửa |
|---|---|---|---|
| T1 | Chấm công (`recordPunch`) | ngày công đó | `attendance.service.ts`: bỏ `timesheet.calculate`, gọi `refreshDays` trong transaction có khoá |
| T2 | Nộp, duyệt, từ chối, huỷ đơn | ngày đơn giữ trong `day_status`; ngày OT (`ot_date`); ngày của khung bù; khoảng đổi ca; Thứ Bảy iSAT; ngày giải trình | `requests.service.ts`, trên cùng `trx`. Bỏ `updateDayStatus(..., 'VALID')` của giải trình. |
| T3 | Thêm, thêm nhanh, xoá ngày lễ | ngày đó, cho mọi người còn làm việc ngày đó | `holidays.service.ts` |
| T4 | Lưu hồ sơ nhân sự (ngày vào làm, nghỉ việc, loại, bậc, ca mặc định) | các tháng từ tháng nhỏ nhất của ngày vào làm hay nghỉ việc (cũ và mới) tới hết tháng hiện tại; các tháng đã khoá giữ nguyên nhờ `is_locked` | `employees.service.ts` |
| T5 | Job mỗi giờ (mục 7.3) | ngày còn thiếu dòng của tháng hiện tại và tháng trước; dòng `PENDING` đã tới mốc xét | `attendance-days.job.ts` |
| T6 | Tính lương một người một tháng | cả tháng | `payroll.service.ts` |
| T7 | Admin bấm tính lại (`POST /attendance/recalculate`, nhận `workDate` hoặc `month`) | ngày hoặc tháng đó | `attendance.controller.ts` |

### 7.3 Job

- `AttendanceDaysJob.runOnce(now)` duyệt mọi người còn làm việc trong tháng. Với mỗi người, dưới khoá của người đó:
  1. ghi mọi ngày của tháng hiện tại và tháng trước còn thiếu dòng;
  2. ghi lại các dòng `PENDING` có `work_date` ≤ hôm nay mà đã tới mốc xét.
- Điểm vào thật (`server.ts` gọi `createServer({ startJobs: true })` trong `bootstrap.ts`) khởi động job sau khi app Nest `init`: chạy một lần ngay, rồi chạy mỗi giờ (`setInterval(...).unref()`). Test dựng app bằng `createServer()` nên không chạy job (R5); test gọi thẳng `runOnce`.
- Một lần chạy giữ khoá tư vấn `attendance_days_job`, nên hai lần chạy không bao giờ chồng nhau.

## 8. Đọc

### 8.1 Lương

Phần này dựng trên `payroll.service.ts` của phiên payslip-print (mục 9.2).

- Đầu `generateMonthlyPayslip`: `refreshMonth` (T6). Sau đó đọc các dòng ngày của tháng. Không còn đọc `isat_registrations`.
- **Dòng ngày trên phiếu:** mọi dòng trừ `OUTSIDE`, `REST` và `PENDING`.
  - `daySalary` = `pay_units` × lương ngày.
  - `deductionAmount` = làm tròn(`deduction_minutes` ÷ 60 × lương giờ).
  - Tiền bù = làm tròn(`makeup_minutes` ÷ 60 × lương giờ), nằm trên dòng của ngày bù (L14).
  - Phụ cấp flex/đêm theo dòng: chỉ khi `counts_as_workday`.
  - OT giữ cách của payslip-print: giờ có mặt trong khung OT × hệ số, đo trên các dòng `PRESENT`, `EXTRA`, `HOLIDAY`.
- **Đếm:**
  - Ngày đi làm (lương cơ bản thực tế, phụ cấp đi lại, tỉ lệ chuyên cần) = số dòng `counts_as_workday`.
  - Ngày nghỉ cho chuyên cần = số dòng `counts_as_day_off` + số ngày bù thiếu (L16): nợ = 480 × số dòng `LEAVE_MAKEUP`; đã bù = Σ `makeup_minutes` của tháng; thiếu = max(0, nợ − đã bù); số ngày = min(số dòng `LEAVE_MAKEUP`, ⌈thiếu ÷ 480⌉).
  - Phép có lương, iSAT, lễ: theo dòng `LEAVE_PAID`, `ISAT`, `HOLIDAY` có `pay_units` = 1.
  - Ngưỡng mất chuyên cần không đổi ở đây (R14).
- `EmployeePayslip` đếm theo các trường mới của dòng ngày (`countsAsWorkday`, `countsAsDayOff`, `kind`), không còn suy ra từ `shiftCode`. Bỏ `makeupWorkDates` (R10).
- **Cảnh báo trên phiếu:** mỗi ngày `PRESENT` hoặc `ABSENT` có mã ảnh hưởng tiền mà chưa được duyệt sinh một cảnh báo:
  - `EXPLANATION_PENDING`: "03/11 chờ giải trình";
  - `EXPLANATION_MISSING`: "05/11 chưa giải trình";
  - `EXPLANATION_REJECTED`: "06/11 giải trình bị từ chối".
  - Chặn chốt kỳ khi còn giải trình chờ thuộc phiên chốt kỳ (mục 11).

### 8.2 App nhân viên (`/me`)

`me/domain/me-views.ts`:

- `daySummaryOf` đọc dòng ngày. `DayKind` thêm `outside` và `extra`. `LeaveKind` thêm `isat` và `makeup`. `DaySummary` thêm `explanation` (`none|pending|approved|rejected`) và `cases`.

| `status` | `kind` |
|---|---|
| `OUTSIDE` | `outside` |
| `REST` | `off` |
| `EXTRA` | `extra` |
| `HOLIDAY` | `leave` / `holiday` |
| `ISAT` | `leave` / `isat` |
| `LEAVE_PAID` | `leave` / `paid` |
| `LEAVE_UNPAID` | `leave` / `unpaid` |
| `LEAVE_MAKEUP` | `leave` / `makeup` |
| `PENDING` | `future` (sau hôm nay) hoặc `work` (hôm nay) |
| `PRESENT` có mã ảnh hưởng tiền chưa duyệt | `todo` |
| `PRESENT` có trừ phút | `late` |
| `PRESENT` còn lại | `work` |
| `ABSENT` | `absent` |

- Tổng của tháng:
  - `workDays` = số dòng `counts_as_workday`;
  - `standardDays` = số ngày làm của tuần người đó trong tháng (qua cổng ở mục 9);
  - `paidLeaveDays` = số dòng `LEAVE_PAID`, `HOLIDAY`, `ISAT` có `pay_units` = 1 (R11).
- Thu nhập tạm tính đi qua `generateMonthlyPayslip`. Ngày `PENDING` trả 0, nên chỉ ngày đã qua mới được tính (L18).

### 8.3 Admin

- `GET /api/v2/attendance/timesheets` trả thêm: `leaveType`, `cases`, `explanationStatus`, `payUnits`, `deductionMinutes`, `countsAsWorkday`, `countsAsDayOff`, `makeupMinutes`. Các trường ca có thể `null`.
- `status` có thêm các giá trị mới. FE Admin hiện chỉ hiểu PRESENT, LEAVE_PAID, LEAVE_UNPAID, ABSENT, HOLIDAY (`web/src/builders/api/attendance.ts`). Nối FE là việc của phiên FE; spec này chỉ cập nhật `docs/api/v2-contract.md` và để ghi chú ở thư mục ghi chú chung.
- `POST /api/v2/attendance/recalculate` nhận `{ employeeId, workDate }` hoặc `{ employeeId, month }` và gọi `refreshDays`.

## 9. Phụ thuộc và phối hợp

### 9.1 Cổng cài đặt

`attendance/attendance-settings.port.ts`:

```ts
interface AttendanceSettingsPort {
  graceMinutes(month: string, trx?): Promise<number>;           // settingsFor(month).attendance.lateGraceMinutes
  workWeek(employeeUuid: string, month: string, trx?): Promise<number[]>; // workWeekOf(uuid, month).weekdays, 1..6
}
```

- **Bản tạm**, dùng khi module `settings` chưa có trên `main`:
  - tuần làm việc đọc `position_types.regular_dows` của phiên bản đang hiệu lực;
  - ân hạn trả hằng `DEFAULT_LATE_GRACE_MINUTES = 15`, đặt duy nhất ở file cổng.
- Khi `src/modules/settings` vào `main`, chỉ cần viết lại bản cổng thành lời gọi `SettingsReader.settingsFor` / `workWeekOf`. Plan có một task cho việc này; task chỉ chạy khi kiểm `git merge-base --is-ancestor claude/settings-store-7d80cb main` đúng.

### 9.2 Các phiên khác

- **settings-store** (`local_2648d8e5-e128-4548-aa1b-996705cb2612`, nhánh `claude/settings-store-7d80cb`): spec của họ định sửa `DailyTimesheet.calculate` để nhận ân hạn và thêm `NOT_A_WORKDAY`. Phiên này nhắn họ rằng:
  - `calculate` đã được thay bằng `buildDay`;
  - ân hạn đi qua cổng ở 9.1;
  - khi đổi tuần làm việc hoặc ân hạn từ tháng M, họ cần gọi `refreshMonth` cho các tháng ≥ M tới tháng hiện tại;
  - chặn chấm công ngày ngoài tuần (`NOT_A_WORKDAY`) vẫn là việc của họ.
- **payslip-print** (`local_cdac11a7-d8b0-4a22-a771-7b69a1435d84`, nhánh `claude/payslip-print-1bf918`): các task lương (mục 8.1) làm sau cùng. Nếu lúc đó nhánh này chưa có trên `main`, phiên này merge nó vào nhánh của mình (chỉ cục bộ, không đụng nhánh của họ). Người dùng đã duyệt cách này ở phần 5.
- **staff-requests** (`local_85045dbe-9062-467b-b345-3688a48752c5`, nhánh `claude/staff-requests-e8fd71`): phiên này nhắn họ cho form giải trình gọi `detectCases` của Chấm công, thay cho `explanationCasesOf`. Bộ dò của họ thiếu LATE_CHECK_OUT và dùng ngưỡng 30.
- **FE:** ghi chú các `status` và trường mới vào thư mục ghi chú chung.

## 10. Kiểm thử

Chỉ chạy test. Không chạy typecheck hay prettier, theo quy định của người dùng.

- **Thuần:**
  - `detectCases`: mọi trường hợp ở 4.2; ân hạn 10 và 15; ca đêm; khung trước và sau ca; ngày `EXTRA`.
  - `buildDay`: từng dòng của bảng mục 3, thứ tự xét, mọi ví dụ ở mục 2 và mục 5.
  - Khối 30 phút: 15, 16, 44, 45, 74, 75; 20 + 20.
- **Service với fake:** `refreshDays` bỏ qua dòng đã khoá; các điểm kích hoạt T1–T7 gọi đúng ngày.
- **Real-PG** (`*.pg.test.ts`, `withTempDb`):
  - chấm công tạo dòng `PRESENT`; Chủ nhật có OT ra dòng `EXTRA`;
  - duyệt phép năm ra `LEAVE_PAID`; từ chối thì ngày về `PENDING` hoặc `ABSENT`;
  - nghỉ có bù ra `LEAVE_MAKEUP` cộng `makeup_minutes` ở ngày bù;
  - iSAT ra `ISAT`;
  - giải trình: nộp thì `PENDING`, duyệt thì trả đủ ngày trừ khối, từ chối thì 0;
  - thêm và xoá ngày lễ;
  - job: tạo đủ ngày của tháng, `PENDING` thành `ABSENT` sau mốc xét;
  - dòng đã khoá không đổi;
  - phiếu lương cả tháng của Bình với số tiền ở mục 2 và 5, kể cả chuyên cần và nghỉ có bù;
  - `/me/attendance`.
- `npm test` với `PG_TEST_URL` trỏ vào container PostgreSQL dùng một lần, cổng riêng chưa ai dùng (không dùng 55433, 55442, 55462–55466). Xoá container sau khi chạy.
- Báo cáo cuối ghi rõ route nào chưa có test real-PG.

## 11. Ngoài phạm vi

- Tiền OT và hệ số OT (payslip-print).
- Kho cài đặt, vùng chấm công, chặn chấm công ngày ngoài tuần hoặc ngày lễ (settings-store).
- Form đơn của nhân viên (staff-requests).
- Chốt kỳ, duyệt kỳ, chặn chốt khi còn giải trình chờ, ảnh chụp dòng ngày lúc chốt.
- Luật ≥ 14 ngày không lương thì không đóng bảo hiểm; mức trần bảo hiểm.
- Làm lệch giờ không có đơn đổi ca (L20).
- Nối giao diện FE.
- Chuyển các dòng công cũ sang dạng mới: DB dev là dữ liệu giả và được dựng lại từ `schema.sql`.

## 12. Phán quyết kỹ thuật (người dùng xem khi duyệt spec)

| Mã | Quyết định | Lý do | Rủi ro nếu sai |
|---|---|---|---|
| R1 | Tách từ `main` 6dcce9e, không phải 620e434. | `main` đã đi tiếp (staff-app, audit-log), và 620e434 nằm trong đó. | Không có. |
| R2 | Chấm công, Đơn từ, job, Lương dùng chung khoá `requests_<uuid>`. Chấm công trước đây khoá `punch_<uuid>_<ngày>` và ghi ngoài transaction. | Một người chỉ có một luồng ghi ngày công tại một thời điểm. | Chấm công chờ khi Admin đang duyệt đơn của chính người đó (vài mili giây). |
| R3 | Ca của ngày làm = dòng lịch SHIFT_CHANGE, nếu không có thì ca mặc định trong hồ sơ. Dòng REGULAR không được dùng. | Dòng REGULAR là bản sao ca hồ sơ lúc chấm, có thể đã cũ, và chính nó đang biến Chủ nhật thành ngày công. | Nếu có nơi khác ghi REGULAR với giờ khác hồ sơ thì giờ đó bị bỏ qua. |
| R4 | Dòng đã khoá không bao giờ bị ghi lại; thao tác gây ra lần ghi (duyệt đơn…) vẫn chạy bình thường. | Khoá là để giữ kỳ đã chốt. | Một đơn được duyệt sau khi khoá không đổi được ngày công. Việc chặn duyệt khi đã khoá là của phiên chốt kỳ. |
| R5 | Job chỉ khởi động từ điểm vào thật (`server.ts` → `createServer({ startJobs: true })`), không khởi động khi test dựng app. | Test `auth-http.pg` dựng app; job chạy trên DB tạm có thể vướng lúc xoá DB. | Không có. |
| R6 | Ngày `ABSENT` có giải trình đang chờ vẫn tính là ngày nghỉ cho chuyên cần, cho tới khi được duyệt. | Theo đúng nghĩa "đang chờ thì 0 đ" (L6). | Phiếu nháp giữa tháng có thể hiện mất chuyên cần trong lúc chờ. |
| R7 | Phút bị trừ một ngày không quá 480, nên tiền ngày không bao giờ âm. | Ra sớm ngay sau khi vào có thể cho ra hơn 8h trừ. | Không có. |
| R8 | Ngày làm được xét ngay khi có đủ vào và ra, hoặc tại mốc cuối + 30 phút. | Cho `/me` thấy kết quả ngay sau khi check-out. | Không có (L7 giữ lần ra sớm đầu tiên). |
| R9 | Phút làm bù dùng giờ ghi trong giải trình đã duyệt khi thiếu một bên. | Giống cách payslip-print đo OT. | Không có. |
| R10 | Bỏ `makeupWorkDates`, tức là bỏ việc xoá phụ cấp flex/đêm trên "ngày làm bù" kiểu cũ (lịch MAKE_UP). | Làm bù giờ là khung trả ×1 riêng; ca của ngày vẫn hưởng phụ cấp bình thường. | Không có lịch MAKE_UP nào còn được ghi. |
| R11 | `paidLeaveDays` của `/me` tính cả iSAT và lễ có lương. | Cả ba đều là "nghỉ hưởng lương". | Con số trên app khác ý người dùng; chỉ là hiển thị. |
| R12 | Đơn nhóm PAID của loại không có cờ `paidLeave` ghi `LEAVE_UNPAID`. | `/me` hiện đúng "không lương" cho người đó. | Không có. |
| R13 | Giải trình của ngày = đơn mới nhất không bị huỷ. Đơn được duyệt phủ mọi mã dò được, kể cả khi giờ chấm được sửa sau. | Mỗi ngày chỉ có một đơn giải trình (spec 1); đơn bị từ chối không nộp lại được. | Giờ chấm sửa sau khi duyệt làm lộ một trường hợp mới mà không ai xét. |
| R14 | Không đổi ngưỡng mất chuyên cần ở đây. Code hiện là ≥ 5; luật là ≥ 3. | settings-store D15 đổi ngưỡng qua cài đặt. | Nếu settings-store không làm, ngưỡng vẫn sai. Ghi trong báo cáo cuối. |
| R15 | `ot_hours` luôn 0. | OT do payslip-print đo từ khung. | FE nào đang đọc `ot_hours` sẽ thấy 0. |
| R16 | Job bảo đảm dòng cho tháng hiện tại và tháng trước. Tháng cũ hơn có dòng khi tính lương tháng đó hoặc khi Admin gọi tính lại tháng. | Đủ cho `/me` (lùi tới tháng vào làm) sau lần tính lương đầu, mà không phải quét mọi tháng mỗi giờ. | `/me` xem một tháng cũ chưa từng tính lương sẽ thấy các ngày trống. |

## 13. Ví dụ đầu–cuối (tháng 11/2026, Bình nv bậc 1)

| Ngày | Sự việc | Dòng | Tiền ngày |
|---|---|---|---|
| T2 02/11 | 08:02–17:05 | `PRESENT` | 230.769 |
| T3 03/11 | 08:40–17:00, giải trình đã duyệt | `PRESENT`, trừ 30 | 216.346 |
| T4 04/11 | 08:40–17:00, chưa giải trình | `PRESENT`, 0, cảnh báo | 0 |
| T5 05/11 | không chấm | `ABSENT`, ngày nghỉ | 0 |
| T3 10/11 | nghỉ có bù, bù 18–22 ngày 12/11 và 16/11, làm đủ | `LEAVE_MAKEUP` | 0 |
| T5 12/11 | 08:00–22:00, khung bù 18–22 | `PRESENT`, `makeup_minutes` 240 | 230.769 + 115.385 |
| CN 15/11 | OT 08–12 đã duyệt, 08:00–12:00 | `EXTRA` | 0 (OT 230.769 do payslip-print) |
| T2 16/11 | 08:00–22:00, khung bù 18–22 | `PRESENT`, `makeup_minutes` 240 | 230.769 + 115.385 |
| T4 18/11 | Phép năm đã duyệt | `LEAVE_PAID`, ngày nghỉ | 230.769 |

Ngày nghỉ cho chuyên cần: 05/11 và 18/11 → 2. Nghỉ có bù đã bù đủ → không đếm. Ngày 04/11 không đếm (L17). Với ngưỡng 3 thì Bình giữ chuyên cần.
