# Chấm công lõi BE v2 (spec 2): kế hoạch triển khai

> **Cho agent thực thi:** BẮT BUỘC dùng `superpowers:subagent-driven-development` (khuyên dùng) hoặc `superpowers:executing-plans` để chạy plan theo từng task. Các bước dùng checkbox (`- [ ]`) để theo dõi.

**Mục tiêu:** mỗi người, mỗi ngày có đúng một dòng `timesheet_entries`, dựng bằng một hàm thuần. Lương, `/me` và màn Chấm công Admin cùng đọc dòng đó.

**Kiến trúc:** hướng B, ghi lúc xảy ra. Mọi điểm kích hoạt (chấm công, đơn từ, ngày lễ, hồ sơ, job, lương, tính lại) gọi `AttendanceDaysService.refreshDays`. Hàm này tải nguồn (`AttendanceDaysRepository.loadSources`), dựng dòng bằng `buildDay` (thuần), rồi ghi đè dòng chưa khoá. Mọi lần ghi giữ khoá tư vấn `requests_<uuid>`.

**Công nghệ:** NestJS, Kysely, PostgreSQL, `node:test` chạy qua `tsx`. Không có bước build.

**Spec:** `docs/superpowers/specs/2026-11-05-attendance-core-design.md`. Mã luật L1–L20 và phán quyết R1–R16 trong plan này lấy từ spec đó. Người thực thi đọc cả spec lẫn plan.

## Ràng buộc chung

- Nhánh `claude/interesting-maxwell-4c6da0`, worktree `C:\Users\52.AI UD\Project\Vladilena-Milize\.claude\worktrees\vigilant-feynman-dbb291`, gốc `main` 6dcce9e.
- Không đụng các nhánh FE-lead: `claude/admin-ui-concept-6445c9`, `claude/vigilant-feynman-dbb291`, `claude/musing-brahmagupta-cbd29d`.
- Không push, không merge vào `main`, không in hay commit secret.
- Chỉ sửa lược đồ trong `migrations/postgres/schema.sql`; không thêm file migration đánh số.
- Kiểm thử chỉ bằng test:
  - một file: `node --import tsx --test test/v2/<tên>.test.ts`;
  - toàn bộ: `npm test`.
- Không chạy `npm run typecheck`, không chạy prettier.
- Test real-PG (`*.pg.test.ts`):
  - dùng `withTempDb` trong `test/v2/helpers/pg-temp-db.ts`;
  - `PG_TEST_URL` trỏ vào container PostgreSQL dùng một lần, ở cổng chưa ai dùng. Không dùng 55433, 55442, 55462–55466, 55471. Kiểm cổng bằng `docker ps` trước khi chọn;
  - xoá container sau khi chạy.
- Lệnh dựng container (thay `<port>`):
  - `docker run -d --rm --name pg-att-core -e POSTGRES_PASSWORD=pg -p <port>:5432 postgres:16`
  - `PG_TEST_URL=postgres://postgres:pg@localhost:<port>/postgres`
- Không hard-code tham số cài đặt. Hằng ân hạn duy nhất là `DEFAULT_LATE_GRACE_MINUTES = 15`, chỉ đặt trong `attendance-settings.port.ts`.
- Khoá của nhân viên: `requests_<uuid>`, dựng bằng `employeeLockKey(uuid)`. Khoá của job: `attendance_days_job`.
- Giờ theo Việt Nam (UTC+7). Cột DATE và TIME đọc qua `to_char`, như các repository đang làm.
- Code chấm công chỉ import **hằng và kiểu thuần** từ `requests/domain` (`ExplanationCase`, `LEAVE_TYPES`). Không import module Nest của module khác.
- Comment và thông báo lỗi viết tiếng Việt, theo phong cách hiện có.
- Mỗi task kết thúc bằng một commit. Lời commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Khi gặp chỗ mơ hồ, ghi vào plan dòng `Ruling: <quyết định> — <lý do> — <rủi ro nếu sai>` (CLAUDE.md §4).

## Trọng tâm review

Năm tình huống spec ngầm đòi hỏi nhưng dễ lọt test. Mỗi dòng đã có test ở task được ghi trong ngoặc.

1. **Ca đêm 22:00–06:00.** Giờ hết ca nằm ở ngày hôm sau, và lần ra 05:50 sáng hôm sau là ra sớm 10 phút của ngày công trước. (Task 1, Task 2)
2. **Hồ sơ thiếu dữ liệu.** `start_date` rỗng nghĩa là không có ngày nào `OUTSIDE`. Loại nhân sự không có phiên bản trong tháng, hoặc `regular_dows` sai dạng, nghĩa là tuần rỗng: mọi ngày là `REST` và không lỗi. (Task 2, Task 4)
3. **Giải trình bị huỷ.** Đơn mới nhất bị huỷ thì giải trình của ngày là đơn không huỷ mới nhất trước đó. Không còn đơn nào thì là `NONE`. (Task 4, Task 7)
4. **Ngày đã khoá.** Chấm công vào ngày đã khoá bị từ chối và không lưu lần chấm. Duyệt đơn vẫn chạy, nhưng dòng đã khoá giữ nguyên. (Task 3, Task 6, Task 7)
5. **Đổi trạng thái sau khi ngày đã có dòng.** Ngày đã là `ABSENT` mà sau đó phép năm được duyệt thì thành `LEAVE_PAID`. Từ chối đơn thì ngày quay về `ABSENT` hoặc `PENDING`. (Task 7)

## Phán quyết của plan (người dùng xem khi duyệt plan)

| Mã | Quyết định | Lý do | Rủi ro nếu sai |
|---|---|---|---|
| P1 | `EARLY_CHECK_OUT` chỉ sinh khi số phút (lấy phần nguyên) ≥ 1. Ra lúc 16:59:30 với ca hết 17:00 không phải ra sớm. | `minutes` = 0 mà vẫn sinh mã thì vô nghĩa. Lần chấm có giây. | Ra sớm dưới 1 phút không bị bắt. |
| P2 | Ngày không có dòng trên `/me`: sau hôm nay là `future`, còn lại là `off` (ô trống). | R16: tháng cũ chưa tính lương "thấy các ngày trống", không phải "vắng". | Ô trống có thể bị đọc là ngày nghỉ tuần. |
| P3 | `refreshDays` nhận `trx` của người gọi vẫn lấy lại khoá `requests_<uuid>` trên `trx` đó. | Khoá tư vấn của PostgreSQL lấy lại được trong cùng phiên, nên an toàn nếu người gọi quên khoá. | Không có. |
| P4 | Ngày lễ (T3) và hồ sơ (T4) ghi lại dòng **sau khi** lần ghi của chúng xong. Mỗi người chạy trong một transaction riêng. Lỗi trả về cho Admin; làm lại thao tác là đủ. | Ngày lễ áp cho mọi người. Một transaction giữ nhiều khoá dễ khoá chéo. | Lỗi giữa chừng để vài người chưa được ghi lại cho tới khi job hoặc Admin tính lại. |
| P5 | `recordPunch` thôi tạo dòng lịch REGULAR và bỏ tham số `shiftConfig`. | R3 bỏ qua dòng REGULAR, và trong `src` không có nơi nào truyền `shiftConfig`. | Không có. |
| P6 | Người "đang làm" với job và T3: có `uuid`, `locked_at` rỗng, và thời gian làm phủ khoảng ngày đang xét. | Giống `PayrollRepository.listEligibleEmployees`, cộng thêm điều kiện ngày. | Tài khoản Admin không khoá cũng có dòng ngày (vô hại). |
| P7 | Các cột ca chỉ có giá trị trên dòng `PENDING`, `PRESENT`, `ABSENT`. | Spec §6: rỗng trên ngày không có ca. | Không có. |
| P8 | Phiếu lương thêm trường `makeupPay` (tổng tiền bù của các dòng) và cộng vào thu nhập gộp. | L14 trả tiền bù nhưng `EmployeePayslip` chưa có chỗ chứa. | Bản in A4 chưa hiện dòng này cho tới khi phiên FE nối. |
| P9 | Cảnh báo giải trình ghi một cảnh báo mỗi ngày. Lời ngắn kiểu "04/11 chưa giải trình", `fields: [ngày]`. | Spec §8.1. | Không có. |
| P10 | Cột cũ `check_in_status` và `check_out_status` lấy từ mã ảnh hưởng tiền. Cách đổi ở Task 2. | Spec §6 cần FE cũ đọc được. | Không có. |
| P11 | Kiểu trạng thái mới tên là `AttendanceDayStatus`. | `work-schedule.ts` đã có kiểu `DayStatus` (trạng thái cũ). | Không có. |

---

### Task 1: Bộ dò trường hợp giải trình `detectCases`

**Files:**
- Tạo: `src/modules/attendance/domain/calendar.ts`
- Tạo: `src/modules/attendance/domain/explanation-detect.ts`
- Sửa: `src/modules/attendance/domain/index.ts` (export)
- Test: `test/v2/attendance-explanation-detect.test.ts`

**Interfaces:**
- Dùng: `ExplanationCase` từ `src/modules/requests/domain/explanation-cases.ts`.
- Tạo ra:

  ```ts
  // calendar.ts
  export function vnInstant(date: string, hhmm: string): Date;          // 'YYYY-MM-DD' + 'HH:mm' giờ VN
  export function addDaysText(date: string, n: number): string;
  export function weekdayOf(date: string): number;                     // 0 = CN … 6 = T7
  export function datesOfMonth(month: string): string[];               // 'YYYY-MM' → mọi ngày của tháng
  export function monthOfDate(date: string): string;
  export function monthsBetween(from: string, to: string): string[];   // 'YYYY-MM' tới 'YYYY-MM', gồm hai đầu
  // explanation-detect.ts
  export type WindowKind = 'OT' | 'MAKEUP';
  export interface TimeWindow { kind: WindowKind; start: string; end: string }   // 'HH:mm'
  export interface DetectInput {
    date: string; shift: { start: string; end: string } | null; windows: readonly TimeWindow[];
    checkIn: Date | null; checkOut: Date | null; firstOutInShift: Date | null;
    graceMinutes: number; evaluated: boolean;
  }
  export interface DetectedCase { code: ExplanationCase; minutes: number; affectsPay: boolean }
  export interface DetectResult { cases: DetectedCase[]; lateMinutes: number; earlyMinutes: number }
  export function detectCases(input: DetectInput): DetectResult;
  export function expectedBounds(date: string, shift: DetectInput['shift'], windows: readonly TimeWindow[]):
    { start: Date; end: Date } | null;   // mốc đầu, mốc cuối dự kiến (spec §4.2)
  ```

- [ ] **Bước 1: Viết test fail.**
  - Nền chung: `date '2026-11-03'`, ca 08:00–17:00, không khung, ân hạn 15, `evaluated: true`. Hàm `at(hm)` = `vnInstant('2026-11-03', hm)`.
  - Mỗi test dưới đây so `cases` bằng `deepEqual`.

  | Test | Đầu vào | Kết quả |
  |---|---|---|
  | `on time` | 08:05–17:10 | `cases` rỗng, `lateMinutes` 0, `earlyMinutes` 0 |
  | `late in after grace` | vào 08:16 | `[{LATE_CHECK_IN,16,true}]`, `lateMinutes` 16 |
  | | vào 08:15 | không có mã |
  | `grace 10` | vào 08:11 | `LATE_CHECK_IN` 11 |
  | | vào 08:10 | không có mã |
  | `early out even 1 minute` | `firstOutInShift` và `checkOut` 16:59 | `[{EARLY_CHECK_OUT,1,true}]`, `earlyMinutes` 1 |
  | | 16:59:30 | không có mã (P1) |
  | `early in` | vào 07:44 | `EARLY_CHECK_IN` 16, ảnh hưởng tiền |
  | | vào 07:45 | không có mã |
  | `late out / forgot` | ra 17:15 | không có mã |
  | | ra 17:16 | `LATE_CHECK_OUT` 16 |
  | | ra 17:30 | `LATE_CHECK_OUT` 30 |
  | | ra 17:31 | `FORGOT_CHECK_OUT` 31 |
  | `missing` | chỉ có ra 17:00 | `MISSING_CHECK_IN` |
  | | không chấm, `evaluated: false` | `cases` rỗng |
  | | không chấm, `evaluated: true` | `MISSING_CHECK_IN`, `MISSING_CHECK_OUT` |
  | | vào 08:00, chưa ra, `evaluated: false` | rỗng |
  | | vào 08:00, chưa ra, `evaluated: true` | `MISSING_CHECK_OUT` |
  | `mid-shift out is early (L7)` | `firstOutInShift` 12:00, `checkOut` 17:05 | `[{EARLY_CHECK_OUT,300,true}]` |
  | `makeup window after shift` | khung `MAKEUP` 18:00–22:00 | xem chi tiết dưới bảng |
  | `window before shift` | khung `OT` 06:00–08:00 | xem chi tiết dưới bảng |
  | `no shift (EXTRA)` | ca `null`, khung `OT` 08:00–12:00 | xem chi tiết dưới bảng |
  | `night shift` | ca 22:00–06:00 | xem chi tiết dưới bảng |
  | `one entry per code, pay wins` | khung `MAKEUP` 18:00–22:00, `firstOutInShift` 16:00, `checkOut` 21:00 | đúng một `EARLY_CHECK_OUT`, ảnh hưởng tiền, `minutes` 60 |
  | `expectedBounds` | ca 08–17 + khung 18–22 | mốc cuối 22:00 |
  | | ca đêm 22–06 | mốc cuối là 06:00 ngày 04/11 |
  | | ca `null`, không khung | `null` |

  Chi tiết các dòng còn lại:
  - **`makeup window after shift`:**
    - ra 21:00 → `[{EARLY_CHECK_OUT,60,false}]`, `earlyMinutes` 0;
    - ra 22:20 → `LATE_CHECK_OUT` 20, chỉ để biết;
    - ra 22:31 → `FORGOT_CHECK_OUT` 31, chỉ để biết.
  - **`window before shift`:**
    - vào 06:20 → `[{LATE_CHECK_IN,20,false}]`, `lateMinutes` 0;
    - vào 05:40 → `EARLY_CHECK_IN` 20, chỉ để biết, không có `EARLY_CHECK_IN` ảnh hưởng tiền.
  - **`no shift (EXTRA)`:**
    - vào 08:40, ra 11:00 → `LATE_CHECK_IN` 40 và `EARLY_CHECK_OUT` 60, cả hai chỉ để biết, `lateMinutes` và `earlyMinutes` đều 0;
    - không có lần ra, `evaluated` → `MISSING_CHECK_OUT` chỉ để biết.
  - **`night shift`:**
    - vào 03/11 22:20 → `LATE_CHECK_IN` 20;
    - `firstOutInShift` và `checkOut` 04/11 05:50 → `EARLY_CHECK_OUT` 10, ảnh hưởng tiền.

- [ ] **Bước 2: Chạy test, phải fail.**
  - Lệnh: `node --import tsx --test test/v2/attendance-explanation-detect.test.ts`
  - Kỳ vọng: FAIL vì chưa có module.

- [ ] **Bước 3: Viết `calendar.ts` và `explanation-detect.ts` theo spec §4.2.**
  - Ca hoặc khung có giờ hết ≤ giờ bắt đầu thì giờ hết nằm ở ngày hôm sau.
  - Khung có `start` < giờ vào ca là khung trước ca. Khung có `end` > giờ hết ca là khung sau ca.
  - Phút là phần nguyên của hiệu thời điểm, tính bằng phút.
  - Thứ tự `cases`: `LATE_CHECK_IN`, `EARLY_CHECK_IN`, `EARLY_CHECK_OUT`, `LATE_CHECK_OUT`, `FORGOT_CHECK_OUT`, `MISSING_CHECK_IN`, `MISSING_CHECK_OUT`.
  - Một mã chỉ xuất hiện một lần. Nếu có cả bản ảnh hưởng tiền lẫn bản chỉ để biết thì giữ bản ảnh hưởng tiền.

- [ ] **Bước 4: Chạy test, phải pass.** Cùng lệnh, kỳ vọng PASS.

- [ ] **Bước 5: Commit, rồi báo phiên staff-requests.**
  - Commit:

    ```bash
    git add src/modules/attendance/domain test/v2/attendance-explanation-detect.test.ts
    git commit -m "feat(attendance): one explanation-case detector for timesheet and staff form"
    ```

  - Gửi `SendMessage` tới `local_85045dbe-9062-467b-b345-3688a48752c5`. Nội dung: `detectCases` đã ở `src/modules/attendance/domain/explanation-detect.ts`, commit `<sha>`, nhánh `claude/interesting-maxwell-4c6da0`. Form giải trình gọi hàm này thay cho `explanationCasesOf` (ngưỡng 15/30, có `LATE_CHECK_OUT`).

### Task 2: Hàm dựng dòng ngày `buildDay`

**Files:**
- Tạo: `src/modules/attendance/domain/attendance-day.ts`
- Sửa: `src/modules/attendance/domain/index.ts`
- Test: `test/v2/attendance-day.test.ts`

**Interfaces:**
- Dùng: Task 1. Từ `requests/domain` dùng `LEAVE_TYPES` (`payGroup`) và kiểu `LeaveTypeCode`. `ScheduleType` và `ScheduleStatus` lấy từ `work-schedule.ts`.
- Tạo ra:

  ```ts
  export type AttendanceDayStatus = 'OUTSIDE'|'HOLIDAY'|'ISAT'|'LEAVE_PAID'|'LEAVE_UNPAID'|'LEAVE_MAKEUP'
    |'REST'|'EXTRA'|'PENDING'|'PRESENT'|'ABSENT';
  export type ExplanationStatus = 'NONE'|'PENDING'|'APPROVED'|'REJECTED';
  export interface ShiftFacts { type: 'NORMAL'|'FLEX'|'NIGHT'; start: string; end: string; allowancePct: number }
  export interface ScheduleFacts { scheduleType: ScheduleType; status: ScheduleStatus; shiftType: string;
    start: string; end: string; sourceRequestId: string|null; requestType: string|null; leaveType: LeaveTypeCode|null }
  export interface ExplanationFacts { requestId: string; status: 'PENDING'|'APPROVED'|'REJECTED';
    checkIn: string|null; checkOut: string|null }   // giờ 'HH:mm' ghi trong đơn
  export interface DayFacts { date: string; schedule: ScheduleFacts|null; punches: ReadonlyArray<{ type: 'IN'|'OUT'; at: Date }>;
    otWindows: ReadonlyArray<{ start: string; end: string }>; makeupWindows: ReadonlyArray<{ start: string; end: string }>;
    explanation: ExplanationFacts|null; isHoliday: boolean }
  export interface Benefits { paidLeave: boolean; paidHoliday: boolean; isat: boolean }
  export interface DaySources extends DayFacts { now: Date; employment: { startDate: string|null; resignedOn: string|null };
    benefits: Benefits; workWeek: readonly number[]; graceMinutes: number; defaultShift: ShiftFacts }
  export interface AttendanceDay {
    employeeId: string; workDate: string; status: AttendanceDayStatus; shift: ShiftFacts|null;
    checkIn: Date|null; checkOut: Date|null; workHours: number; lateMinutes: number; earlyMinutes: number;
    leaveType: LeaveTypeCode|null; sourceRequestId: string|null; cases: DetectedCase[];
    explanationStatus: ExplanationStatus; explanationRequestId: string|null;
    payUnits: 0|1; deductionMinutes: number; countsAsWorkday: boolean; countsAsDayOff: boolean; makeupMinutes: number;
    dayStatus: DayStatus; checkInStatus: CheckInStatus; checkOutStatus: CheckOutStatus;  // cột cũ (spec §6)
  }
  export const MAX_DEDUCTION_MINUTES = 480;
  export function deductionBlock(minutes: number): number;
  export function buildDay(employeeId: string, src: DaySources): AttendanceDay;
  ```

- [ ] **Bước 1: Viết test fail.**
  - Hàm `src(o)` dựng nguồn mặc định:
    - `date '2026-11-03'` (thứ Ba), `now 2026-11-30T12:00:00Z`;
    - vào làm `2026-01-01`, chưa nghỉ việc;
    - mọi cờ phúc lợi bật, tuần `[1,2,3,4,5,6]`, ân hạn 15;
    - ca mặc định NORMAL 08:00–17:00, phụ cấp 0;
    - không lịch, không chấm, không khung, không giải trình, không lễ.
  - Các test:
    - **`deductionBlock`:** 15 → 0; 16 → 30; 44 → 30; 45 → 60; 74 → 60; 75 → 90; `deductionBlock(20) + deductionBlock(20)` = 60.
    - **Bảng spec §5, mỗi dòng một test:**
      - 08:05–17:10 → `PRESENT`, `payUnits` 1, `deductionMinutes` 0, `countsAsWorkday` true;
      - 08:40–17:00 + giải trình APPROVED → `PRESENT`, 1, trừ 30, `explanationStatus` `APPROVED`;
      - 08:40–17:00 không giải trình → `PRESENT`, 0, `countsAsWorkday` false, `countsAsDayOff` false, `dayStatus` `NEEDS_EXPLANATION`, `checkInStatus` `LATE`;
      - 08:20–16:40 + APPROVED → trừ 60;
      - không chấm → `ABSENT`, 0, `countsAsDayOff` true, `cases` có hai mã thiếu;
      - khung bù 18–22, chấm 08:00–21:00 → `PRESENT`, 1, `cases` = `[{EARLY_CHECK_OUT,60,false}]`, `makeupMinutes` 180.
    - **Giải trình chưa xong:** `PENDING` → `payUnits` 0, `explanationStatus` `PENDING`. `REJECTED` → 0.
    - **R6:** không chấm + giải trình `PENDING` → `ABSENT`, `countsAsDayOff` true.
    - **Ngày vắng có giải trình duyệt:** không chấm + APPROVED, giờ 08:00/17:00 → `PRESENT`, 1, trừ 0, hai mã thiếu.
    - **R7:** vào 08:00, ra 08:05, APPROVED → `deductionMinutes` 480.
    - **`OUTSIDE`:**
      - `startDate '2026-11-11'`, ngày 11-03 → `OUTSIDE`, 0;
      - `resignedOn '2026-11-03'` → 11-03 không phải `OUTSIDE`, 11-04 là `OUTSIDE`;
      - lễ trên ngày ngoài thời gian làm → `OUTSIDE`;
      - `startDate null` → không bao giờ `OUTSIDE`.
    - **`HOLIDAY`:**
      - ngày làm, `paidHoliday` bật → `HOLIDAY`, 1, `shift` null;
      - cờ tắt → 0;
      - lễ ngày `2026-11-01` (CN) → `REST`;
      - lễ thứ Bảy `2026-11-07` với tuần `[1..5]` → `REST`.
    - **`ISAT`:** lịch `ISAT`/`ON_LEAVE`, `requestType 'ISAT'` → `ISAT`, `payUnits` 1, có `sourceRequestId`. Cờ `isat` tắt → 0.
    - **Đơn nghỉ:**
      - `LEAVE` `ANNUAL` → `LEAVE_PAID`, 1, `countsAsDayOff` true, `leaveType 'ANNUAL'`;
      - `paidLeave` tắt → `LEAVE_UNPAID` (R12);
      - `PERSONAL_UNPAID` → `LEAVE_UNPAID`;
      - `SOCIAL_INSURANCE` → `LEAVE_UNPAID`;
      - `LEAVE_WITH_MAKEUP` → `LEAVE_MAKEUP`, 0, `countsAsDayOff` false;
      - lễ + lịch nghỉ cùng ngày → `HOLIDAY`.
    - **Ngày ngoài tuần:**
      - CN `2026-11-15` không khung → `REST`;
      - CN, khung OT 08–12, chấm 08:00–12:00 → `EXTRA`, 0, `countsAsWorkday` false, `shift` null, `cases` rỗng;
      - CN, khung bù 08–12, chấm 08:00–12:00 → `makeupMinutes` 240;
      - CN có lịch REGULAR và có chấm nhưng không khung → `REST` (R3).
    - **Lịch:**
      - SHIFT_CHANGE FLEX 10:00–19:00, vào 10:05 → không có mã;
      - cùng lịch đó, vào 08:00 → có `EARLY_CHECK_IN`;
      - lịch REGULAR 09:00–18:00 bị bỏ qua: vào 08:00 không có mã (R3).
    - **`PENDING` (ngày `2026-11-30`):**
      - `now` 09:00Z (16:00 VN), không chấm → `PENDING`, `dayStatus` `PLANNED`;
      - `now` 10:30Z (17:30 VN) → `ABSENT`;
      - chỉ có lần vào 08:00 lúc 16:00 VN → `PENDING`, `dayStatus` `IN_PROGRESS`;
      - có đủ vào và ra trước mốc → `PRESENT` (R8);
      - ngày `2026-12-02` → `PENDING`.
    - **Ca đêm:** ca mặc định NIGHT 22:00–06:00, chấm 03/11 22:00 và 04/11 05:50, không giải trình → `PRESENT`, 0, `EARLY_CHECK_OUT` 10.
    - **Cột cũ:**
      - ra 17:20 không khung → `checkOutStatus` `LATE_WITHOUT_OT`;
      - 08:00–17:00 → `workHours` 9, `checkInStatus` `VALID`, `checkOutStatus` `VALID`.

- [ ] **Bước 2: Chạy test, phải fail.**
  - Lệnh: `node --import tsx --test test/v2/attendance-day.test.ts`
  - Kỳ vọng: FAIL.

- [ ] **Bước 3: Viết `buildDay` theo spec §3, §4.3, §5.**
  - **Thứ tự xét:** `OUTSIDE` → `HOLIDAY` (lễ trên ngày làm) → lịch `ON_LEAVE` → ngày ngoài tuần (`EXTRA`/`REST`) → ngày làm.
  - **Ngày làm:** `workWeek` chứa `weekdayOf(date)`. Chủ nhật không bao giờ là ngày làm.
  - **Lịch `ON_LEAVE`:**
    - `scheduleType === 'ISAT'` hoặc `requestType === 'ISAT'` → `ISAT`;
    - `requestType === 'LEAVE_WITH_MAKEUP'` → `LEAVE_MAKEUP`;
    - `requestType === 'LEAVE'` → `LEAVE_PAID` khi `payGroup === 'PAID'` và `benefits.paidLeave`; ngược lại `LEAVE_UNPAID`.
  - **Ca của ngày làm:** lịch `SHIFT_CHANGE` (trạng thái khác `CANCELLED`) thì dùng ca của lịch; ngược lại dùng `defaultShift` (R3).
  - **Đo giờ:**
    - `checkIn` = lần `IN` sớm nhất; `checkOut` = lần `OUT` muộn nhất;
    - `firstOutInShift` = lần `OUT` sớm nhất trước giờ hết ca;
    - mốc xét = có cả hai lần chấm, hoặc `now ≥ expectedBounds().end + 30 phút`.
  - **Khung truyền cho `detectCases`:**
    - ngày làm: khung OT và khung bù;
    - ngày `EXTRA` và `HOLIDAY`: ca `null` cùng các khung.
  - **Phút bù:** phần giao giữa [vào, ra] và từng khung bù. Thiếu một bên mà giải trình đã duyệt có giờ thì dùng giờ trong đơn (R9). Chỉ tính cho `PRESENT` và `EXTRA`.
  - **Cột cũ (P10):**

    | Cột | Giá trị | Khi nào |
    |---|---|---|
    | `checkInStatus` | `LATE` | có `LATE_CHECK_IN` ảnh hưởng tiền |
    | | `EARLY` | có `EARLY_CHECK_IN` ảnh hưởng tiền |
    | | `MISSED` | có `MISSING_CHECK_IN` |
    | | `VALID` | có lần vào |
    | | `PENDING` | còn lại |
    | `checkOutStatus` | `EARLY` | có `EARLY_CHECK_OUT` ảnh hưởng tiền |
    | | `LATE_WITHOUT_OT` | có `LATE_CHECK_OUT` hoặc `FORGOT_CHECK_OUT` ảnh hưởng tiền |
    | | `MISSED` | có `MISSING_CHECK_OUT` |
    | | `VALID` | có lần ra |
    | | `PENDING` | còn lại |
    | `dayStatus` | `IN_PROGRESS` | `PENDING` có lần chấm |
    | | `PLANNED` | `PENDING` chưa có lần chấm |
    | | `NEEDS_EXPLANATION` | `PRESENT` có mã ảnh hưởng tiền chưa duyệt |
    | | `VALID` | `PRESENT` còn lại |
    | | `ON_LEAVE` | `LEAVE_*` và `ISAT` |
    | | `PLANNED` | các loại khác |

  - **Giờ có mặt:** `workHours` = (ra − vào) tính bằng giờ, làm tròn 2 chữ số. Thiếu một bên thì 0.

- [ ] **Bước 4: Chạy test, phải pass.** Cùng lệnh, kỳ vọng PASS.

- [ ] **Bước 5: Commit.**

  ```bash
  git add src/modules/attendance/domain test/v2/attendance-day.test.ts
  git commit -m "feat(attendance): pure buildDay for one day row per person"
  ```

### Task 3: Lược đồ, kiểu dòng và ghi đè dòng ngày

**Files:**
- Sửa: `migrations/postgres/schema.sql` (bảng `timesheet_entries`, spec §6)
- Sửa: `src/database/schema.ts` (`TimesheetEntriesTable`)
- Sửa: `src/modules/attendance/domain/daily-timesheet.ts` (`fromRow`/`toJSON` đọc và trả cột mới; `status` dùng `AttendanceDayStatus`)
- Tạo: `src/modules/attendance/attendance-days.repository.ts`
- Test: `test/v2/attendance-days-repository.pg.test.ts`

**Interfaces:**
- Dùng: `AttendanceDay` (Task 2).
- Tạo ra:

  ```ts
  export interface AttendanceDayRecord extends AttendanceDay { isLocked: boolean }
  @Injectable() export class AttendanceDaysRepository {
    constructor(@Inject(KYSELY_DB) qb: Kysely<DB>);
    withTransaction(trx: Kysely<DB>): AttendanceDaysRepository;
    upsertDays(days: readonly AttendanceDay[], now: Date): Promise<void>;  // ON CONFLICT … WHERE is_locked = false
    listDays(employeeId: string, from: string, to: string): Promise<AttendanceDayRecord[]>;  // theo work_date tăng
  }
  ```

  - `DailyTimesheetDTO` có thêm: `leaveType`, `cases`, `explanationStatus`, `explanationRequestId`, `payUnits`, `deductionMinutes`, `countsAsWorkday`, `countsAsDayOff`, `makeupMinutes`. Các trường ca được phép `null` (spec §8.3).

- [ ] **Bước 1: Viết test fail** (real-PG, `withTempDb`, seed một nhân sự `nv` có `uuid`).
  - `upsert writes every new column`: ghi dòng `PRESENT` (dựng bằng `buildDay` cho ví dụ 08:40–17:00 đã duyệt). `listDays` trả về giống hệt: `cases` là mảng, `checkIn` là `Date`, `payUnits` 1, `deductionMinutes` 30, `isLocked` false. `work_units` = 1, `ot_hours` = 0.
  - `second upsert updates in place`: ghi hai lần, lần sau là `ABSENT`. Còn đúng một dòng, và dòng đó là `ABSENT`.
  - `locked row is never rewritten`: `UPDATE … SET is_locked = true`, rồi ghi `ABSENT`. `listDays` vẫn trả dòng cũ, `isLocked` true.
  - `rest row has null shift`: dòng `REST` ghi được; `shift_type` là NULL.
  - `check constraints`: SQL thô `status = 'FOO'` bị từ chối; `pay_units = 0.5` bị từ chối.
  - `admin DTO`: `new AttendanceRepository(db).findTimesheet(uuid, date)` → `toJSON()` có `payUnits`, `cases`, `explanationStatus`, `deductionMinutes`, `countsAsWorkday`, `countsAsDayOff`, `makeupMinutes`, `leaveType`.

- [ ] **Bước 2: Chạy test, phải fail.**
  - Lệnh: `PG_TEST_URL=… node --import tsx --test test/v2/attendance-days-repository.pg.test.ts`
  - Kỳ vọng: FAIL.

- [ ] **Bước 3: Sửa lược đồ và repository.**
  - Lược đồ đúng theo spec §6: các cột ca cho phép NULL; `CHECK` của `status`; 10 cột mới cùng `CHECK`.
  - `leave_type` dùng `CHECK` 6 mã giống `system_requests.leave_type`.
  - `upsertDays`:
    - dòng mới lấy `id` từ `randomUUID()`;
    - `created_at` và `updated_at` lấy từ `now`;
    - chỉ cập nhật `updated_at` khi có ghi đè;
    - `cases_json` = `JSON.stringify(cases)`;
    - ghi luôn các cột cũ: `work_units = pay_units`, `ot_hours = 0`, `day_status`, `check_in_status`, `check_out_status`.
  - `listDays`: `work_date` đọc qua `to_char(…, 'YYYY-MM-DD')`.
  - Code cũ (`calculate`, `saveTimesheet`) vẫn giữ tới Task 6.

- [ ] **Bước 4: Chạy test, phải pass.**
  - Chạy file test của task: kỳ vọng PASS.
  - Chạy `npm test` có `PG_TEST_URL`: kỳ vọng không test nào có sẵn hỏng. Nếu `pg-date-columns.test.ts` hay `business-today.test.ts` hỏng chỉ vì cột mới, sửa test đó cho khớp.

- [ ] **Bước 5: Commit.**

  ```bash
  git add migrations/postgres/schema.sql src/database/schema.ts src/modules/attendance test/v2
  git commit -m "feat(attendance): timesheet_entries holds the full day row; locked rows stay"
  ```

### Task 4: Cổng cài đặt và tải nguồn `loadSources`

**Files:**
- Tạo: `src/modules/attendance/attendance-settings.port.ts`
- Sửa: `src/modules/attendance/attendance-days.repository.ts` (thêm `loadSources`)
- Test: `test/v2/attendance-days-sources.pg.test.ts`

**Interfaces:**
- Dùng: `DayFacts`, `ShiftFacts`, `Benefits` (Task 2).
- Tạo ra:

  ```ts
  export const DEFAULT_LATE_GRACE_MINUTES = 15;
  export abstract class AttendanceSettingsPort {
    abstract graceMinutes(month: string, trx?: Kysely<DB>): Promise<number>;
    abstract workWeek(employeeUuid: string, month: string, trx?: Kysely<DB>): Promise<number[]>;  // 1..6, tăng dần
  }
  @Injectable() export class PositionTypeAttendanceSettings extends AttendanceSettingsPort { /* bản tạm, spec §9.1 */ }
  // trong AttendanceDaysRepository:
  export interface EmployeeFacts { employeeId: string; type: string; startDate: string|null; resignedOn: string|null; defaultShift: ShiftFacts }
  loadSources(employeeId: string, dates: readonly string[]):
    Promise<{ employee: EmployeeFacts; benefitsByMonth: Map<string, Benefits>; days: DayFacts[] }>;  // days theo thứ tự dates
  ```

- [ ] **Bước 1: Viết test fail** (real-PG).
  - **Dữ liệu mẫu:**
    - nhân sự `nv`: vào làm `2026-01-05`, ca NORMAL 08:00–17:00;
    - thêm hai phiên bản `position_types` cho loại `nv-test`:
      - `2000-01` với `[1,2,3,4,5,6]` và benefit `paidLeave`/`paidHoliday`/`isat` bật;
      - `2026-11` với `[1,2,3,4,5]` và `isat` tắt.
  - **Test:**
    - **Tuần làm việc:** `workWeek(uuid,'2026-10')` = `[1,2,3,4,5,6]`; `workWeek(uuid,'2026-11')` = `[1,2,3,4,5]`.
    - **Tuần rỗng:**
      - `regular_dows = '[0,"x",7]'` → `[]`;
      - loại không có phiên bản → `[]`;
      - không lỗi trong cả hai trường hợp.
    - **Ân hạn:** `graceMinutes('2026-11')` = 15.
    - **Phúc lợi theo tháng:** `benefitsByMonth.get('2026-10').isat` true; `.get('2026-11').isat` false.
    - **Nguồn của từng ngày:**
      - lịch `ON_LEAVE` từ đơn LEAVE `ANNUAL` đã duyệt → `requestType 'LEAVE'`, `leaveType 'ANNUAL'`, giờ dạng `'HH:mm'`;
      - lần chấm sắp theo thời điểm;
      - chỉ có khung OT của đơn APPROVED: đơn PENDING cùng ngày không xuất hiện;
      - chỉ có khung bù của đơn LWM APPROVED;
      - giải trình: REJECTED cũ, PENDING mới hơn, CANCELLED mới nhất → `explanation.status` = `PENDING`. Đổi đơn PENDING thành CANCELLED → `explanation` là đơn REJECTED;
      - ngày có `company_holidays` → `isHoliday` true.
    - **Nhân sự không tồn tại:** `loadSources('khong-co', …)` ném `Error` có chữ `Không tìm thấy nhân sự`.

- [ ] **Bước 2: Chạy test, phải fail.** Kỳ vọng FAIL.

- [ ] **Bước 3: Viết cổng và `loadSources`.**
  - Phiên bản loại nhân sự: `code = staff.type`, `effective_month <= month`, lấy dòng mới nhất (như `findStaffContext`).
  - `workWeek` giữ số nguyên 1..6, bỏ trùng, sắp tăng.
  - Ca mặc định:
    - lấy `staff.shift_type`/`shift_start_time`/`shift_end_time`; rỗng thì NORMAL 08:00–17:00;
    - `allowancePct`: NORMAL 0, FLEX 10, NIGHT 30, như `recordPunch` đang làm.
  - Giải trình: `type = 'EXPLANATION'`, `status <> 'CANCELLED'`; mỗi ngày lấy đơn có `created_at` mới nhất.
  - Mỗi loại nguồn dùng một truy vấn cho cả khoảng ngày, không truy vấn từng ngày.

- [ ] **Bước 4: Chạy test, phải pass.** Kỳ vọng PASS.

- [ ] **Bước 5: Commit.**

  ```bash
  git add src/modules/attendance test/v2/attendance-days-sources.pg.test.ts
  git commit -m "feat(attendance): load day sources and settings port (temporary position-type adapter)"
  ```

### Task 5: `AttendanceDaysService` và nối module

**Files:**
- Tạo: `src/modules/attendance/attendance-days.service.ts`
- Sửa: `src/modules/attendance/attendance-days.repository.ts` (thêm `activeEmployeeIds`)
- Sửa: `src/modules/attendance/attendance.module.ts`
- Sửa: `src/modules/attendance/index.ts` (export)
- Test: `test/v2/attendance-days-service.pg.test.ts`

**Interfaces:**
- Dùng: Task 2–4. `TransactionCoordinator` và `DatabaseTransaction` từ `src/database/transaction.ts`.
- Tạo ra:

  ```ts
  export const employeeLockKey = (employeeId: string): string => `requests_${employeeId}`;
  export interface RefreshOptions { trx?: DatabaseTransaction; now?: Date }
  @Injectable() export class AttendanceDaysService {
    refreshDays(employeeId: string, dates: readonly string[], opts?: RefreshOptions): Promise<AttendanceDayRecord[]>;
    refreshMonth(employeeId: string, month: string, opts?: RefreshOptions): Promise<AttendanceDayRecord[]>;
    refreshDateForAll(date: string, opts?: { now?: Date }): Promise<number>;   // số người đã ghi
  }
  // AttendanceDaysRepository:
  activeEmployeeIds(from: string, to: string): Promise<string[]>;   // P6
  ```

  - `refreshDays` trả về các dòng đọc lại từ DB, nên dòng đã khoá hiện đúng giá trị đang lưu.
  - Module: `providers` thêm `AttendanceDaysRepository`, `AttendanceDaysService` và `{ provide: AttendanceSettingsPort, useClass: PositionTypeAttendanceSettings }`. `exports` thêm cả ba.

- [ ] **Bước 1: Viết test fail** (real-PG).
  - **Dữ liệu mẫu:** chèn lần chấm thẳng vào `punch_events`.
  - **Test:**
    - **`refreshDays` tạo dòng:** chấm 08:05–17:10 ngày 03/11, `now 2026-11-30T12:00Z` → trả một dòng `PRESENT`, `payUnits` 1. Dòng nằm trong DB.
    - **Khoá:** dùng lớp con của `TransactionCoordinator` ghi lại khoá → khoá đã lấy là `requests_<uuid>`.
    - **Ngày trùng và danh sách rỗng:**
      - `dates` có trùng → mỗi ngày một dòng;
      - `dates` rỗng → trả `[]`, không lấy khoá.
    - **Dòng đã khoá:** giữ nguyên, và được trả về với giá trị đang lưu.
    - **`refreshMonth('2026-11')`:** 30 dòng; ngày 01, 08, 15, 22, 29 là `REST`.
    - **Có `trx` của người gọi:** chạy trong `coordinator.run(trx => …)`. Ném lỗi sau khi gọi → transaction lùi lại và không còn dòng nào (dòng ghi trên đúng `trx` đó).
    - **`refreshDateForAll('2026-11-03')`:**
      - 2 người đang làm, 1 người nghỉ việc từ `2026-10-31`, 1 người `locked_at` khác NULL → trả 2;
      - chỉ hai người đầu có dòng.

- [ ] **Bước 2: Chạy test, phải fail.** Kỳ vọng FAIL.

- [ ] **Bước 3: Viết service.**
  - Có `trx`: `coordinator.acquireAdvisoryLock(trx, employeeLockKey(id))` rồi chạy trên `repo.withTransaction(trx)` (P3).
  - Không có `trx`: `coordinator.withLock(employeeLockKey(id), trx => …)`.
  - Mỗi tháng có trong `dates` gọi cổng một lần: `workWeek` và `graceMinutes` với cùng `trx`.
  - `now` mặc định là `new Date()`.
  - `refreshDateForAll` ghi từng người, mỗi người một transaction (P4).

- [ ] **Bước 4: Chạy test, phải pass.** Kỳ vọng PASS.

- [ ] **Bước 5: Commit.**

  ```bash
  git add src/modules/attendance test/v2/attendance-days-service.pg.test.ts
  git commit -m "feat(attendance): refreshDays under the shared employee lock"
  ```

### Task 6: Chấm công (T1), tính lại (T7), bỏ cách tính cũ, cập nhật contract

**Files:**
- Sửa: `src/modules/attendance/attendance.service.ts` (`recordPunch`, `recalculateTimesheet`, thêm `recalculateMonth`)
- Sửa: `src/modules/attendance/attendance.controller.ts` (`POST recalculate`)
- Sửa: `src/modules/attendance/domain/daily-timesheet.ts` (bỏ `calculate`, `applyApprovedLeave` và các kiểu chỉ chúng dùng)
- Sửa: `src/modules/attendance/attendance.repository.ts` (bỏ `saveTimesheet`; bỏ `ensureDefaultSchedule` nếu không còn ai gọi)
- Sửa test: `test/v2/attendance.test.ts`, `test/v2/business-today.test.ts`, `test/v2/pg-date-columns.test.ts`
- Tạo: `test/v2/attendance-punch.pg.test.ts`
- Sửa: `docs/api/v2-contract.md` (mục `GET /api/v2/attendance/timesheets`, `POST /api/v2/attendance/recalculate`)
- Ghi chú ngoài repo: thêm mục "Trạng thái và trường mới cho FE" vào `…\side-session-notes\local_b2b5206f-005f-44d5-8c9a-a9c302c12b9a\attendance-core-coordination.md`

**Interfaces:**
- Dùng: `AttendanceDaysService`, `employeeLockKey` (Task 5).
- Tạo ra:
  - `AttendanceService` nhận thêm `@Inject(AttendanceDaysService) days`.
  - `recalculateMonth(employeeId: string, month: string): Promise<DailyTimesheetDTO[]>`.
  - `RecordPunchInput` bỏ `shiftConfig` (P5).

- [ ] **Bước 1: Viết test fail** (real-PG, `attendance-punch.pg.test.ts`, service dựng trên DB thật).
  - **Chấm ngày làm:** IN 08:40 và OUT 17:00 ngày 03/11 → kết quả có `timesheet.payUnits` 0 và `timesheet.dayStatus` `NEEDS_EXPLANATION`. Dòng trong DB là `PRESENT`.
  - **Chấm Chủ nhật:** IN ngày `2026-11-15` không có OT → dòng `REST`. `work_schedules` không có dòng nào của ngày đó (P5).
  - **Ngày nghỉ:** lịch `ON_LEAVE` → ném lỗi, không lưu lần chấm.
  - **Ngày đã khoá:** ném lỗi, không lưu lần chấm, dòng giữ nguyên.
  - **Tính lại:**
    - `recalculateTimesheet(uuid,'2026-11-03')` trả DTO của ngày;
    - `recalculateMonth(uuid,'2026-11')` trả 30 DTO.
  - **Controller** (unit, gọi thẳng phương thức với service giả):
    - `{employeeId, month:'2026-11'}` → `{ timesheets }`;
    - `{employeeId, workDate}` → `{ timesheet }`;
    - thiếu cả hai → `BadRequestError` mã `MISSING_PARAMS`;
    - `month:'2026-13'` → `BadRequestError` mã `INVALID_MONTH`.
  - Viết lại các test cũ có dùng `calculate` để chúng kiểm `recordPunch` qua `AttendanceDaysService` giả. `AttendanceDaysService` giả ghi lại lời gọi `refreshDays`.

- [ ] **Bước 2: Chạy test, phải fail.** Kỳ vọng FAIL.

- [ ] **Bước 3: Viết code.**
  - Nếu lúc này `claude/settings-store-7d80cb` đã vào `main`: đưa `main` vào nhánh trước (như Task 12 bước 2). Giữ nguyên các chặn của họ trong `recordPunch` (`NOT_A_WORKDAY`, `OUTSIDE_ZONE`, `NO_LOCATION`, `hasApprovedWorkOn`, `workdayOf`, `DEFAULT_SHIFT`), đặt chúng bên trong khoá mới, trước bước lưu lần chấm.
  - `recordPunch` chạy trong `withLock(employeeLockKey(employeeId), trx => …)`.
  - Mọi truy vấn chạy trên `repo.withTransaction(trx)`.
  - Thứ tự trong khoá:
    1. đọc lịch để chặn ngày `ON_LEAVE`;
    2. chặn ngày đã khoá;
    3. lưu lần chấm;
    4. `days.refreshDays(id, [workDate], { trx })`;
    5. trả `findTimesheet(...).toJSON()` đọc trên `trx`.
  - Không có `txCoordinator` thì chạy thẳng, không có `trx` (giữ hành vi test cũ).
  - Cập nhật `docs/api/v2-contract.md`: trường mới, 11 giá trị `status`, các trường ca có thể `null`, `recalculate` nhận `workDate` hoặc `month`.

- [ ] **Bước 4: Chạy lại test.**
  - Lệnh: file test của task, rồi `npm test` có `PG_TEST_URL`.
  - Kỳ vọng: PASS. Không còn chỗ nào trong `src` gọi `.calculate(` hay `applyApprovedLeave`.
  - Kiểm bằng: `grep -rn "\.calculate(\|applyApprovedLeave" src`, kỳ vọng không có kết quả.

- [ ] **Bước 5: Commit.**

  ```bash
  git add src/modules/attendance test/v2 docs/api/v2-contract.md
  git commit -m "feat(attendance): punches and recalculate write the day row; drop calculate"
  ```

### Task 7: Đơn từ ghi lại ngày công (T2)

**Files:**
- Tạo: `src/modules/requests/domain/request-dates.ts`
- Sửa: `src/modules/requests/requests.service.ts`
- Sửa: `src/modules/requests/requests.module.ts` (giữ `imports: [AttendanceModule, HolidaysModule]`, giờ dùng thêm `AttendanceDaysService`)
- Sửa: `src/modules/attendance/attendance.repository.ts` (bỏ `updateDayStatus`)
- Sửa: `test/v2/helpers/requests-fakes.ts`
- Sửa: các test requests đang kiểm `updateDayStatus`
- Tạo: `test/v2/attendance-requests.pg.test.ts`

**Interfaces:**
- Dùng: `AttendanceDaysService.refreshDays` (Task 5). `eachDate` từ `requests/domain/working-days.ts`.
- Tạo ra:
  - `requestDates(req: SystemRequest): string[]`. Kết quả không trùng và sắp tăng:
    - LEAVE và LWM: `leaveStartDate..leaveEndDate` cộng `makeupSlots[].date`;
    - SHIFT_CHANGE: `changeStartDate..changeEndDate`;
    - OVERTIME: `otDate`;
    - ISAT: `isat.saturday`;
    - EXPLANATION: `explanationDate`;
    - ADVANCE: `[]`.
  - `RequestsService` nhận thêm tham số thứ 6: `@Optional() @Inject(AttendanceDaysService) attendanceDays?`.
  - `underEmployeeLock(employeeId, fn: (stores, trx?) => …)` truyền thêm `trx` cho `fn`.
  - Fake: `RecordingDays { calls: Array<{ employeeId; dates; trx }> }`. `makeService()` trả thêm `attendanceDays`.

- [ ] **Bước 1: Viết test fail.**
  - **Unit:**
    - `requestDates` cho từng loại đơn;
    - với `makeService()`:
      - nộp giải trình ngày 03/11 → `attendanceDays.calls` = `[{ employeeId: NV_UUID, dates: ['2026-11-03'], trx: LOCK_TRX }]`;
      - duyệt đơn nghỉ 10–11/11 → một lời gọi với đúng hai ngày;
      - từ chối và huỷ cũng gọi;
      - đơn ADVANCE không gọi;
      - duyệt giải trình không còn gọi `updateDayStatus`.
  - **Real-PG** (`serviceOn(db)` dựng thêm `AttendanceDaysService` thật):
    - duyệt `ANNUAL` một ngày làm của `nv` có `paidLeave` → dòng `LEAVE_PAID`, `payUnits` 1;
    - từ chối thì dòng về `ABSENT` (ngày đã qua theo `service.now`) hoặc `PENDING` (ngày tới);
    - ngày đã `ABSENT` rồi được duyệt phép → `LEAVE_PAID`;
    - LWM duyệt → ngày nghỉ `LEAVE_MAKEUP`. Ngày bù có chấm 18:00–22:00 → `makeupMinutes` 240;
    - iSAT duyệt → `ISAT`;
    - OT Chủ nhật 08–12 duyệt, rồi chấm 08:00–12:00 → `EXTRA`;
    - giải trình ngày trễ 40 phút: nộp → `PENDING`, `payUnits` 0; duyệt → 1, trừ 30; một ngày khác bị từ chối → 0;
    - nộp giải trình rồi huỷ → `explanationStatus` `NONE`;
    - ngày đã khoá: duyệt phép vẫn thành công, dòng giữ nguyên.

- [ ] **Bước 2: Chạy test, phải fail.** Kỳ vọng FAIL.

- [ ] **Bước 3: Gọi `attendanceDays?.refreshDays(req.employeeId, requestDates(req), { trx, now: this.now() })`.**
  - Gọi ngay sau `stores.requests.save(req)` ở mọi `create*`, ở `reviewRequest` và ở `cancelRequest`.
  - Bỏ nhánh `updateDayStatus(..., 'VALID')` và phương thức `updateDayStatus`.

- [ ] **Bước 4: Chạy lại test.**
  - Lệnh: các file test requests, file mới, rồi `npm test` có `PG_TEST_URL`.
  - Kỳ vọng: PASS.

- [ ] **Bước 5: Commit.**

  ```bash
  git add src/modules/requests src/modules/attendance test/v2
  git commit -m "feat(requests): submit, review and cancel rewrite the affected day rows"
  ```

### Task 8: Ngày lễ (T3) và hồ sơ nhân sự (T4)

**Files:**
- Sửa: `src/modules/holidays/holidays.service.ts`, `holidays.module.ts` (`imports: [AttendanceModule]`)
- Sửa: `src/modules/employees/employees.service.ts`, `employees.repository.ts`, `employees.module.ts` (`imports: [AttendanceModule]`)
- Test: `test/v2/attendance-holidays-employees.pg.test.ts`

**Interfaces:**
- Dùng: `refreshDateForAll`, `refreshMonth`, `monthsBetween`, `monthOfDate`. `businessDateText` từ `src/common/business-date.ts`.
- Tạo ra:
  - `HolidaysService` và `EmployeesService` nhận thêm `@Optional() @Inject(AttendanceDaysService) attendanceDays?`.
  - `EmployeesRepository.employmentDates(idOrUsername: string): Promise<{ uuid: string; startDate: string|null; resignedOn: string|null } | null>`.

- [ ] **Bước 1: Viết test fail** (real-PG).
  - **Ngày lễ:**
    - `add({date:'2026-11-03'})` → dòng của hai người đang làm là `HOLIDAY`;
    - `remove('2026-11-03')` → dòng về `PRESENT` hoặc `ABSENT`;
    - `quickAdd(2026)` → dòng của mọi ngày lễ vừa thêm có trạng thái đúng.
  - **Hồ sơ:**
    - đổi `start_date` từ `2026-11-01` thành `2026-11-11` qua `EmployeesService.save` (`now` cố định trong tháng 11/2026) → các dòng 02–10/11 thành `OUTSIDE`;
    - đặt `resignedOn` bằng `deactivate` → các ngày sau ngày nghỉ việc trong tháng hiện tại thành `OUTSIDE`;
    - một tháng có dòng đã khoá thì dòng đó giữ nguyên.

- [ ] **Bước 2: Chạy test, phải fail.** Kỳ vọng FAIL.

- [ ] **Bước 3: Viết code (P4).**
  - **Ngày lễ:** gọi `refreshDateForAll` sau `add` và `remove`, và cho từng ngày `quickAdd` trả về.
  - **Hồ sơ:**
    - `save` và `deactivate` đọc `employmentDates` trước và sau khi ghi;
    - tháng bắt đầu = tháng nhỏ nhất trong bốn ngày (cũ/mới × vào làm/nghỉ việc) và tháng hiện tại; ngày nào rỗng thì bỏ qua;
    - tháng hiện tại = `businessDateText(now).slice(0, 7)`;
    - gọi `refreshMonth` cho từng tháng trong `monthsBetween(tháng bắt đầu, tháng hiện tại)`.

- [ ] **Bước 4: Chạy lại test.** Lệnh: file test, rồi `npm test`. Kỳ vọng PASS.

- [ ] **Bước 5: Commit.**

  ```bash
  git add src/modules/holidays src/modules/employees test/v2
  git commit -m "feat(attendance): holidays and employee dates rewrite day rows"
  ```

### Task 9: Job mỗi giờ (T5)

**Files:**
- Tạo: `src/modules/attendance/attendance-days.job.ts`
- Sửa: `src/modules/attendance/attendance-days.repository.ts` (thêm `datesNeedingRefresh`)
- Sửa: `src/modules/attendance/attendance.module.ts` (provider `AttendanceDaysJob`)
- Sửa: `src/bootstrap.ts` (`createServer(opts?: { startJobs?: boolean })`), `src/server.ts`
- Test: `test/v2/attendance-days-job.pg.test.ts`, `test/v2/attendance-days-job.test.ts`

**Interfaces:**
- Dùng: `activeEmployeeIds`, `refreshDays`, `datesOfMonth`.
- Tạo ra:

  ```ts
  // AttendanceDaysRepository:
  datesNeedingRefresh(employeeId: string, from: string, to: string, today: string): Promise<string[]>;
  //   ngày trong [from,to] chưa có dòng, cộng ngày đang PENDING có work_date ≤ today
  @Injectable() export class AttendanceDaysJob {
    runOnce(now?: Date): Promise<{ employees: number; days: number }>;   // dưới khoá 'attendance_days_job'
    start(intervalMs?: number): void;   // mặc định 3_600_000: chạy ngay một lần, rồi setInterval(...).unref()
    stop(): void;
  }
  ```

  - `server.ts` gọi `createServer({ startJobs: require.main === module })`.
  - Khi `startJobs` bật, `createServer` gọi `app.get(AttendanceDaysJob).start()` sau `app.init()`.

- [ ] **Bước 1: Viết test fail.**
  - **Real-PG:**
    - `runOnce(2026-11-03T12:00Z)` cho một người vào làm từ trước tháng 10 → đủ 31 + 30 dòng;
    - ngày 04–30/11 là `PENDING`;
    - ngày 03/11 không chấm là `ABSENT` (đã qua 17:30 VN);
    - chạy lại `runOnce` với cùng `now` → `days` = 0;
    - `runOnce(2026-11-04T11:00Z)` → dòng 04/11 thành `ABSENT`, `days` = 1.
  - **Unit:** lớp con thay `runOnce` bằng bộ đếm.
    - `start(50)` → gọi `runOnce` ngay;
    - sau ~120 ms đã gọi ít nhất 2 lần;
    - `stop()` → không gọi thêm;
    - `runOnce` ném lỗi → lỗi ghi qua `console.error`, timer vẫn chạy.

- [ ] **Bước 2: Chạy test, phải fail.** Kỳ vọng FAIL.

- [ ] **Bước 3: Viết job.**
  - Lấy khoá job bằng `coordinator.withLock('attendance_days_job', …)`.
  - Bên trong, mỗi người gọi `refreshDays(id, dates, { now })`, không truyền `trx`: mỗi người một transaction có khoá riêng.
  - Khoảng ngày: từ ngày đầu tháng trước tới ngày cuối tháng hiện tại, tính theo `businessDateText(now)`.
  - Sửa `createServer` và `server.ts` như phần Interfaces.

- [ ] **Bước 4: Chạy lại test.**
  - Lệnh: hai file test của task, rồi `npm test`.
  - Kỳ vọng: PASS. `auth-http.pg.test.ts` vẫn xanh, chứng tỏ test dựng app không khởi động job.

- [ ] **Bước 5: Commit.**

  ```bash
  git add src/modules/attendance src/bootstrap.ts src/server.ts test/v2
  git commit -m "feat(attendance): hourly job fills missing days and closes pending ones"
  ```

### Task 10: App nhân viên `/me` đọc dòng ngày

**Files:**
- Sửa: `src/modules/me/domain/me-views.ts` (`DayKind`, `LeaveKind`, `DaySummary`, `TimesheetLike`, `daySummaryOf`, `monthOf`)
- Sửa: `src/modules/me/me.controller.ts`: truyền `workWeek` từ `AttendanceSettingsPort` vào `monthOf`
- Sửa test: `test/v2/me-domain.test.ts`, `test/v2/me-controller.test.ts`
- Tạo: `test/v2/me-attendance.pg.test.ts`

**Interfaces:**
- Dùng: `DailyTimesheetDTO` (Task 3), `AttendanceSettingsPort` (Task 4).
- Tạo ra:

  ```ts
  export type DayKind = 'work'|'late'|'leave'|'absent'|'todo'|'off'|'future'|'outside'|'extra';
  export type LeaveKind = 'paid'|'unpaid'|'holiday'|'isat'|'makeup';
  export type DaySummary = { date; kind; leave?; in; out; lateMinutes; explanation: 'none'|'pending'|'approved'|'rejected'; cases: DetectedCase[] };
  export function monthOf(timesheets, month, today, periodStatus: string|null|undefined, workWeek: readonly number[]);
  ```

- [ ] **Bước 1: Viết test fail.**
  - **Pure:** mỗi dòng của bảng spec §8.2 một test, ví dụ:
    - `PRESENT` 08:40 chưa duyệt → `todo`;
    - `PRESENT` có trừ 30 → `late`;
    - `PENDING` hôm nay → `work`;
    - `PENDING` ngày mai → `future`;
    - `EXTRA` → `extra`;
    - `ISAT` → `leave`/`isat`;
    - `LEAVE_MAKEUP` → `leave`/`makeup`.
  - **Ngày không có dòng (P2):** ngày đã qua → `off`; ngày tới → `future`.
  - **`monthOf` với tuần `[1..5]` tháng 11/2026:**
    - `standardDays` = 21;
    - `workDays` = số dòng `countsAsWorkday`;
    - `paidLeaveDays` đếm `LEAVE_PAID`, `HOLIDAY` và `ISAT` có `payUnits` 1 (R11);
    - `HOLIDAY` có `payUnits` 0 không được đếm.
  - **Real-PG HTTP:** làm theo `auth-http.pg.test.ts`: đặt `DATABASE_URL` trước khi `require` bootstrap, rồi đăng nhập `nv1`.
    - chấm 08:40–17:00 ngày đã qua, rồi gọi `GET /api/v2/me/attendance?month=…` → ngày đó `kind` = `todo`, `explanation` = `none`, `cases[0].code` = `LATE_CHECK_IN`;
    - kiểm lại đường dẫn route trong `me.controller.ts` trước khi viết test.

- [ ] **Bước 2: Chạy test, phải fail.** Kỳ vọng FAIL.

- [ ] **Bước 3: Viết theo bảng spec §8.2.**
  - `/me/today` và `/me/attendance/:date` dùng `daySummaryOf` mới.
  - Phần ước tính thu nhập vẫn đi qua `generateMonthlyPayslip`.

- [ ] **Bước 4: Chạy lại test.** Lệnh: các file test của task, rồi `npm test`. Kỳ vọng PASS.

- [ ] **Bước 5: Commit.**

  ```bash
  git add src/modules/me test/v2
  git commit -m "feat(me): staff days read the shared day row"
  ```

### Task 11: Lương đọc dòng ngày (T6, spec §8.1)

**Files:**
- Merge cục bộ: `claude/payslip-print-1bf918` (xem Bước 1)
- Sửa: `src/modules/payroll/payroll.module.ts` (`imports: [AttendanceModule]`)
- Sửa: `src/modules/payroll/payroll.service.ts`, `payroll.repository.ts` (bỏ đọc `isat_registrations` và dòng công cũ trong dữ liệu tháng)
- Sửa: `src/modules/payroll/domain/employee-payslip.ts`, `domain/payroll-warning.ts`
- Tạo: `src/modules/payroll/domain/makeup-shortfall.ts`
- Sửa test lương có sẵn: các dòng ngày dựng tay cần thêm trường mới
- Test: `test/v2/payroll-attendance-days.test.ts`, `test/v2/payroll-attendance-days.pg.test.ts`

**Interfaces:**
- Dùng: `AttendanceDaysService.refreshMonth`, `AttendanceDayRecord` (Task 5).
- Tạo ra:
  - `PayrollService` nhận thêm `@Inject(AttendanceDaysService) days`, và có `now: () => Date = () => new Date()` như `RequestsService` (test đặt lại).
  - `makeupShortfallDays(lwmDays: number, makeupMinutes: number): number` = `min(lwmDays, ceil(max(0, 480·lwmDays − makeupMinutes) ÷ 480))`.
  - `DailyAttendanceLineProps` thêm `kind: AttendanceDayStatus`, `countsAsWorkday`, `countsAsDayOff`, `payUnits`, `makeupMinutes`, `makeupPay`.
  - `EmployeePayslip` thêm `makeupPay` và cộng vào `grossIncome` (P8); bỏ `makeupWorkDates` (R10).
  - `PayrollWarningCode` thêm `EXPLANATION_PENDING`, `EXPLANATION_MISSING`, `EXPLANATION_REJECTED`.
  - `explanationWarning(code, date): PayrollWarning`, lời dạng `dd/mm chờ giải trình` / `dd/mm chưa giải trình` / `dd/mm giải trình bị từ chối`, `fields: [date]` (P9).

- [ ] **Bước 1: Đưa code payslip-print vào nhánh.**
  - Chạy `git merge-base --is-ancestor claude/payslip-print-1bf918 main`.
    - Đúng → đưa `main` mới vào nhánh: `sync_with_base_branch` của ccd_host nếu có, không thì `git merge main`.
    - Sai → `git merge --no-ff claude/payslip-print-1bf918` (người dùng đã duyệt ở spec §9.2; chỉ cục bộ, không đụng nhánh của họ).
  - Giải xung đột, chạy `npm test` có `PG_TEST_URL`, commit merge.
  - Ghi `Ruling:` vào plan nếu phải chọn khi giải xung đột.

- [ ] **Bước 2: Viết test fail.**
  - **Pure:**
    - `makeupShortfallDays`: (1, 480) → 0; (1, 420) → 1; (2, 480) → 1; (2, 0) → 2; (0, 0) → 0.
  - **`EmployeePayslip`** với các dòng dựng tay (Bình: `baseSalary` 6.000.000, công chuẩn 26):
    - 20 dòng `PRESENT`, `countsAsWorkday` → `actualWorkDays` 20;
    - 1 dòng `LEAVE_PAID` `payUnits` 1 → `paidLeavePay` 230.769;
    - 1 `HOLIDAY` `payUnits` 1 → `holidayPay` 230.769;
    - 1 `HOLIDAY` `payUnits` 0 → không đếm;
    - 1 `ISAT` 1 → `isatPay` 230.769;
    - `LEAVE_MAKEUP` cùng 240 phút bù: thiếu 240 phút → 1 ngày nghỉ cho chuyên cần;
    - dòng `PRESENT` có `payUnits` 0 → không vào `actualWorkDays`, không là ngày nghỉ (L17);
    - phụ cấp chuyên cần: 2 ngày nghỉ → giữ; ngưỡng mất vẫn là `absenceDays <= 4` (R14);
    - `makeupPay` = tổng `makeupPay` các dòng, và có trong `grossIncome`.
  - **Real-PG:** dữ liệu tháng 11 của Bình gồm:
    - 02/11 chấm 08:02–17:05;
    - 03/11 08:40–17:00 có giải trình đã duyệt;
    - 04/11 08:40–17:00 chưa giải trình;
    - 05/11 không chấm;
    - các ngày làm còn lại chấm 08:00–17:00.

    `generateMonthlyPayslip(uuid,'2026-11')` phải cho:
    - dòng 03/11: `daySalary` 230.769, `deductionAmount` 14.423;
    - dòng 04/11 và 05/11: `daySalary` 0;
    - `warnings` có `EXPLANATION_MISSING` cho `2026-11-04` và `2026-11-05`, không có cảnh báo cho 03/11;
    - không có dòng ngày cho ngày `REST` hoặc `OUTSIDE`;
    - có dòng 30/11 dù `now` thật là ngày khác: `refreshMonth` chạy với `now` truyền vào service (service có `now` như `RequestsService`).

- [ ] **Bước 3: Chạy test, phải fail.** Kỳ vọng FAIL.

- [ ] **Bước 4: Viết code theo spec §8.1.**
  - Đầu `generateMonthlyPayslip`: `const rows = await this.days.refreshMonth(employeeId, month, { now: this.now() })`.
  - Dòng phiếu: mọi dòng trừ `OUTSIDE`, `REST`, `PENDING`.
    - `daySalary` = `round(payUnits × dayRate)`;
    - `deductionHours` = `deductionMinutes / 60`;
    - `deductionAmount` = `round(deductionHours × hourRate)`;
    - `makeupPay` = `round(makeupMinutes / 60 × hourRate)`;
    - phụ cấp flex/đêm chỉ khi `countsAsWorkday`.
  - `shiftCode` của dòng:
    - `PRESENT`/`ABSENT` → loại ca;
    - `LEAVE_PAID` → `LEAVE`, `LEAVE_UNPAID` → `UNPAID`;
    - `ISAT`, `HOLIDAY`, `EXTRA` giữ nguyên tên;
    - `LEAVE_MAKEUP` → `MAKEUP_LEAVE`.
  - OT giữ cách của payslip-print. Giờ có mặt lấy từ `checkIn`/`checkOut` của dòng và giờ trong giải trình đã duyệt, đo trên dòng `PRESENT`, `EXTRA`, `HOLIDAY`.
  - Bỏ `isatDates` và `makeupWorkDates`.
  - `EmployeePayslip` đếm theo trường mới, không suy ra từ `shiftCode`:
    - ngày đi làm = số dòng `countsAsWorkday`;
    - flex/đêm = dòng `countsAsWorkday` có ca FLEX/NIGHT;
    - `paidLeaveDays`/`isatDays`/`holidayPaidDays` = dòng `LEAVE_PAID`/`ISAT`/`HOLIDAY` có `payUnits` 1;
    - `unpaidLeaveDays` = dòng `LEAVE_UNPAID`;
    - `allowanceRatio` = ngày đi làm ÷ công chuẩn;
    - `absenceDays` = số dòng `countsAsDayOff` + `makeupShortfallDays(số dòng LEAVE_MAKEUP, Σ makeupMinutes)`.
  - Cảnh báo: mỗi dòng `PRESENT`/`ABSENT` có mã ảnh hưởng tiền mà `explanationStatus` khác `APPROVED`.

- [ ] **Bước 5: Chạy lại test.**
  - Lệnh: các file test lương, rồi `npm test` có `PG_TEST_URL`.
  - Kỳ vọng: PASS.

- [ ] **Bước 6: Commit.**

  ```bash
  git add src/modules/payroll test/v2
  git commit -m "feat(payroll): payslip reads the shared day row (explanations, leave, makeup, warnings)"
  ```

### Task 12: Thay cổng cài đặt (có điều kiện)

**Files:**
- Sửa: `src/modules/attendance/attendance-settings.port.ts`, `attendance.module.ts`
- Test: `test/v2/attendance-settings-port.pg.test.ts`

- [ ] **Bước 1: Kiểm điều kiện.**
  - Chạy `git merge-base --is-ancestor claude/settings-store-7d80cb main`.
  - Sai → không làm task này. Ghi vào plan:

    `Ruling: giữ bản tạm của cổng — settings-store chưa vào main — ân hạn cố định 15 và tuần lấy từ position_types cho tới khi có task tiếp theo`

    Đưa dòng đó vào báo cáo cuối, rồi sang Task 13.
- [ ] **Bước 2: Đưa `main` vào nhánh.**
  - Dùng `sync_with_base_branch` (ccd_host) nếu có, không thì `git merge main`.
  - Chạy `npm test`, rồi commit merge.
- [ ] **Bước 3: Viết test fail.** Cài `lateGraceMinutes` 10 từ tháng `2026-12` và tuần riêng `[1,2,3,4,5]` cho một người qua kho cài đặt. Cổng phải trả 10, và tuần đó cho đúng người đó và tháng đó.
- [ ] **Bước 4: Viết `SettingsAttendanceSettings`** gọi `SettingsReader.settingsFor(month).attendance.lateGraceMinutes` và `workWeekOf(uuid, month).weekdays`. Đổi `useClass` trong module. Xoá `PositionTypeAttendanceSettings` cùng hằng `DEFAULT_LATE_GRACE_MINUTES` nếu không còn ai dùng.
  - Gắn ghi lại ngày công vào kho cài đặt (spec §9.2, settings-store xác nhận 05/11): sau khi `SettingsService.saveWorkWeek` và `saveGroup('attendance')` ghi xong, gọi `refreshMonth` cho các tháng từ `effectiveMonth` tới tháng hiện tại. `saveWorkWeek` chỉ ghi lại người đó; `saveGroup('attendance')` ghi lại mọi người đang làm (P6). Test: đổi ân hạn thành 10 từ tháng hiện tại → dòng vào 08:12 thành `LATE_CHECK_IN`.
- [ ] **Bước 5: Chạy lại test.** Lệnh: file test, rồi `npm test`. Kỳ vọng PASS.
- [ ] **Bước 6: Commit.**

  ```bash
  git commit -am "feat(attendance): settings port reads the settings store"
  ```

### Task 13: Ví dụ đầu–cuối tháng 11 và xác minh toàn nhánh

**Files:**
- Test: `test/v2/attendance-november.pg.test.ts`

- [ ] **Bước 1: Viết test theo spec §13.**
  - Đi hết luồng thật: `RequestsService` → `AttendanceService.recordPunch` → `PayrollService.generateMonthlyPayslip`.
  - Đặt `service.now` cho từng bước để đơn nộp đúng luật thời gian.
  - Bình (`nv` bậc 1, lương cơ bản 6.000.000, công chuẩn 26, tuần T2–T7). Mọi ngày làm không nêu trong §13 chấm 08:00–17:00.
  - Kiểm:

    | Ngày | Dòng | `daySalary` | Khác |
    |---|---|---|---|
    | 02/11 | `PRESENT` | 230.769 | |
    | 03/11 | `PRESENT`, trừ 30 | 230.769 | `deductionAmount` 14.423 |
    | 04/11 | `PRESENT`, `payUnits` 0 | 0 | có cảnh báo |
    | 05/11 | `ABSENT` | 0 | |
    | 10/11 | `LEAVE_MAKEUP` | 0 | |
    | 12/11 | `PRESENT` | 230.769 | `makeupMinutes` 240, `makeupPay` 115.385 |
    | 15/11 | `EXTRA` | 0 | `otPay` 230.769 |
    | 16/11 | `PRESENT` | 230.769 | `makeupMinutes` 240, `makeupPay` 115.385 |
    | 18/11 | `LEAVE_PAID` | 230.769 | |

  - Ngày nghỉ cho chuyên cần = 2 (05/11 và 18/11). Không có ngày bù thiếu. Phụ cấp chuyên cần được giữ.

- [ ] **Bước 2: Chạy test.**
  - Lệnh: `node --import tsx --test test/v2/attendance-november.pg.test.ts`.
  - Kỳ vọng: PASS. Nếu fail, dùng `superpowers:systematic-debugging`; không sửa số trong test.

- [ ] **Bước 3: Commit.**

  ```bash
  git add test/v2/attendance-november.pg.test.ts
  git commit -m "test(attendance): November end-to-end example from spec 2"
  ```

- [ ] **Bước 4: Xác minh toàn nhánh.**
  - Dựng container mới, chạy `npm test` có `PG_TEST_URL`.
  - Ghi lại số test pass, fail và skip, rồi xoá container.
  - Không chạy typecheck hay prettier.

- [ ] **Bước 5: Lập danh sách route chưa có test real-PG.**
  - So các route của `attendance.controller.ts`, `me.controller.ts`, `requests` và `holidays` với các file `*.pg.test.ts` đã viết.
  - Ghi danh sách này vào báo cáo cuối, kèm ghi chú R14 (ngưỡng chuyên cần vẫn là ≥ 5 trong code) và kết quả Task 12.
