# Đơn từ theo luật ngày công (BE v2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đơn nghỉ, nghỉ có làm bù, OT, đổi ca và giải trình nhận đủ trường theo luật đã chốt. Đơn sai luật bị chặn lúc nộp. Admin đọc lại được mọi trường. Duyệt đơn thì ghi đúng lịch. Có thêm lịch lễ công ty.

**Architecture:**
- Luật thuần nằm trong `src/modules/requests/domain/`, gồm danh mục, ngày làm việc, khung giờ và `EmployeeDays`. Các file này không đụng DB.
- `RequestsService` đọc ngữ cảnh qua `RequestsRepository` và `HolidaysRepository`, rồi mỗi lần nộp đơn chạy dưới khoá theo nhân sự.
- Khung OT và khung bù chỉ lưu trong đơn (hướng A): bảng con `makeup_slots`, còn OT ở các cột sẵn có.
- Module mới `holidays` lo lịch lễ công ty.

**Tech Stack:** NestJS 10, Kysely 0.29 + pg, PostgreSQL 16, `node:test` qua `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-04-requests-rules-design.md`. Các số §x trong plan là mục của spec này.

## Global Constraints

- Lệnh xác minh duy nhất là `npm test`. Không chạy `npm run typecheck`, không chạy `format:check`.
- Không áp migration lên DB nào.
- Không đọc `.env` và không lấy thông tin đăng nhập DB.
- Không đụng docker/container. Không push.
- Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Định dạng:
  - Ngày `YYYY-MM-DD`; giờ `HH:mm`, kiểm bằng `/^([01]\d|2[0-3]):[0-5]\d$/`.
  - Trong câu báo lỗi, ngày viết `dd/mm`, riêng tháng viết `YYYY-MM`.
  - Thứ trong tuần theo `getUTCDay()` (0 = CN … 6 = T7), giống `position_types.regular_dows`.
- File trong `src/modules/requests/domain/` không import Nest, Kysely hay DB.
- Đọc cột DATE/TIME từ PostgreSQL phải dùng `to_char` trong SQL:
  - DATE dùng `to_char(col, 'YYYY-MM-DD')`, TIME dùng `to_char(col, 'HH24:MI')`.
  - Nếu đọc thẳng, pg trả DATE thành `Date` theo múi giờ máy và ngày bị lệch.
- Không dùng JSONB (`skills/backend-design-standards` mục 1.2).
- Lỗi do sai luật: service ném `Error` với câu tiếng Việt **đúng như plan ghi**. Controller bọc thành 400 `BAD_REQUEST` như các route hiện có.
- Truy vấn bảng con (`isat_*`, `makeup_slots`, `explanation_cases`) chỉ chạy khi trang kết quả có đơn thuộc loại tương ứng. Test iSAT đang kiểm số câu SQL nên phải giữ điều này.
- Hằng số:
  - Khung OT/bù trong `06:00`–`22:00`; cách ca `60` phút.
  - Ca tính `480` phút; trần ngày `720` phút.
  - Nợ làm bù `480` phút cho mỗi ngày nghỉ.
  - Trần OT tháng `40` giờ.

## Review Focus

1. **Ca đêm qua ranh tháng.** Ca 22–07 ngày 30/11 kéo đến 07:00 ngày 01/12, nên khung 01/12 07:30–09:00 phải bị chặn. Test ở Task 2.
2. **Thân yêu cầu sai kiểu.** `slots` là chuỗi, khung thiếu trường, `cases` là chuỗi. Các trường hợp này phải trả 400 với câu lỗi rõ ràng, không được thành lỗi 500. Test ở Task 8 và Task 10.
3. **Hai đơn của cùng người nộp cùng lúc.** Mọi lần nộp đơn thuộc spec này phải chạy trong `withLock('requests_<uuid>')`. Đơn iSAT giữ nguyên như hiện tại (§2). Test ở Task 5 (tạm ứng) và ở từng Task 6–10.
4. **Khoảng nghỉ chỉ có CN hoặc ngày lễ.** Trả "Khoảng nghỉ không có ngày làm việc", không được lưu đơn 0 ngày. Test ở Task 6.
5. **Đơn đổi ca đang chờ.** Đơn OT nộp sau phải kiểm theo ca mới của đơn đổi ca đó (§5.2 bước 2). Test ở Task 7.

## Rulings (quyết định trong phạm vi spec)

- Ruling: migration mang số `0005_requests_rules.sql` — iSAT dùng `0004` — nếu lúc làm Task 0 đã có số khác thì lấy số tiếp theo và sửa tên ở Task 3 và Task 11.
- Ruling: dòng lịch có `status = 'ON_LEAVE'` thì ngày đó coi như không có ca (§5.2 bước 3) — người đang nghỉ không làm ca, và §5.3 đã coi ngày đó là ngày đang nghỉ — rủi ro nếu sai: phần đuôi ca đêm của ngày nghỉ hôm trước không chặn khung sáng hôm sau.
- Ruling: hai đơn đổi ca "trùng ngày" (§6.4 bước 4) khi các **ngày được đổi** của chúng giao nhau — đúng ý "chỉ đổi các ngày làm việc" — rủi ro thấp.
- Ruling: `RequestsService.now: () => Date` là thuộc tính công khai để test cố định "hôm nay" (§6.5) — không thêm tham số constructor — không có rủi ro hành vi.
- Ruling: `HolidaysRepository` được inject `@Optional()` giống `AttendanceRepository`, nhưng khi đọc ngữ cảnh mà thiếu thì ném "Thiếu lịch lễ công ty" — để hỏng thì báo to, không âm thầm bỏ qua ngày lễ — rủi ro: module quên import `HolidaysModule` sẽ lỗi ngay khi nộp đơn, test ở Task 5 bắt được.
- Ruling: các lỗi định dạng ngày/giờ giữ nguyên câu tiếng Anh sẵn có của domain (`startDate must be a valid YYYY-MM-DD date string, got: …`) — tránh đổi chữ không cần thiết — rủi ro: câu lỗi lẫn hai ngôn ngữ.

## Thứ tự và phụ thuộc

- Task 0 chạy trước tiên.
- Task 1 và 2 độc lập với nhau.
- Task 3 cần Task 1 và 2. Task 4 cần bảng do Task 3 tạo. Task 5 cần Task 2, 3 và 4.
- Task 6–10 cần Task 5. Task 8 dùng helper của Task 6. Task 9 dùng `withShiftOverride` của Task 5.
- Task 11 chạy cuối cùng.

---

### Task 0: Đồng bộ nhánh sau khi iSAT merge

**Files:** chỉ thao tác git.

- [ ] **Step 1: Kiểm nhánh iSAT đã vào pure-v2**

Run: `git log --oneline -15 refs/heads/feat/pure-v2-backend`
Expected: thấy các commit iSAT, ví dụ `feat(requests): submit, review and document iSAT requests` và `feat(payroll): pay approved iSAT Saturdays`.
Nếu chưa thấy thì **dừng và báo người dùng**, vì merge vào nhánh chung là quyết định của họ.

- [ ] **Step 2: Merge pure-v2 vào nhánh này**

Run: `git merge refs/heads/feat/pure-v2-backend`
Expected: merge sạch, vì nhánh này mới chỉ có spec và plan.

- [ ] **Step 3: Chốt số migration**

Run: `ls migrations/postgres`
Expected: số lớn nhất là `0004_isat_registrations.sql`, nên migration mới là `0005`. Nếu khác thì ghi Ruling vào plan.

- [ ] **Step 4: Chạy test nền**

Run: `npm test`
Expected: 0 fail. Ghi lại số test pass/skip làm mốc.

---

### Task 1: Danh mục và ngày làm việc (domain thuần)

**Files:**
- Create: `src/modules/requests/domain/leave-types.ts`, `explanation-cases.ts`, `shift-frames.ts`, `working-days.ts`
- Modify: `src/modules/requests/domain/index.ts` (export 4 file mới); `src/modules/requests/domain/types.ts` (bỏ định nghĩa `LeaveType` cũ và re-export từ `leave-types.ts`)
- Test: `test/v2/requests-calendar.test.ts`

**Interfaces — Produces:**
```ts
// leave-types.ts
export type LeaveType = 'ANNUAL' | 'PERSONAL_PAID' | 'PERSONAL_UNPAID' | 'SOCIAL_INSURANCE' | 'WELFARE' | 'UNPAID';
export type LeavePayGroup = 'PAID' | 'UNPAID' | 'SOCIAL_INSURANCE';
export const LEAVE_TYPES: ReadonlyArray<{ code: LeaveType; label: string; payGroup: LeavePayGroup }>;
export function isLeaveType(value: unknown): value is LeaveType;
// explanation-cases.ts
export type ExplanationCase = 'LATE_CHECK_IN' | 'EARLY_CHECK_OUT' | 'MISSING_CHECK_IN' | 'MISSING_CHECK_OUT'
  | 'EARLY_CHECK_IN' | 'LATE_CHECK_OUT' | 'FORGOT_CHECK_OUT';
export const EXPLANATION_CASES: ReadonlyArray<{ code: ExplanationCase; label: string }>;
export function isExplanationCase(value: unknown): value is ExplanationCase;
// shift-frames.ts
export type FrameShiftType = 'NORMAL' | 'FLEX' | 'NIGHT';
export interface ShiftFrame { shiftType: FrameShiftType; startTime: string; endTime: string }
export const SHIFT_FRAMES: ReadonlyArray<ShiftFrame>;
export function findShiftFrame(shiftType: unknown, startTime: unknown): ShiftFrame | null;
// working-days.ts
export function addDays(date: string, days: number): string;
export function eachDate(from: string, to: string): string[];          // gồm cả hai đầu
export function weekday(date: string): number;                          // 0 = CN … 6 = T7
export function monthOf(date: string): string;                          // 'YYYY-MM'
export function lastDayOfMonth(month: string): string;                  // '2026-11' → '2026-11-30'
export function formatDayMonth(date: string): string;                   // '2026-11-12' → '12/11'
export function workingDays(from: string, to: string, regularDows: readonly number[], holidays: ReadonlySet<string>): string[];
export function vietnamToday(now: Date): string;                        // ngày theo UTC+7
```
Nhãn (`label`) lấy đúng chữ ở bảng §9 của spec.

- [ ] **Step 1: Viết test fail**

```ts
test('LEAVE_TYPES are the six PDF groups', () => {
  assert.deepEqual(LEAVE_TYPES.map(t => [t.code, t.label, t.payGroup]), [
    ['ANNUAL', 'Phép năm', 'PAID'], ['PERSONAL_PAID', 'Việc riêng có lương', 'PAID'],
    ['PERSONAL_UNPAID', 'Việc riêng không lương', 'UNPAID'], ['SOCIAL_INSURANCE', 'Chế độ BHXH', 'SOCIAL_INSURANCE'],
    ['WELFARE', 'Phúc lợi nội bộ', 'PAID'], ['UNPAID', 'Không lương', 'UNPAID']
  ]);
  assert.equal(isLeaveType('PAID'), false);
  assert.equal(isLeaveType('ANNUAL'), true);
});
test('EXPLANATION_CASES are the seven cases in order', () => {
  assert.deepEqual(EXPLANATION_CASES.map(c => c.code), ['LATE_CHECK_IN', 'EARLY_CHECK_OUT', 'MISSING_CHECK_IN',
    'MISSING_CHECK_OUT', 'EARLY_CHECK_IN', 'LATE_CHECK_OUT', 'FORGOT_CHECK_OUT']);
  assert.equal(EXPLANATION_CASES[6].label, 'Quên check-out (ra muộn quá 30 phút)');
  assert.equal(isExplanationCase('X'), false);
});
test('SHIFT_FRAMES are the six frames', () => {
  assert.deepEqual(SHIFT_FRAMES.map(f => `${f.shiftType} ${f.startTime}-${f.endTime}`), ['NORMAL 08:00-17:00',
    'NORMAL 10:00-19:00', 'FLEX 06:00-15:00', 'FLEX 13:00-22:00', 'NIGHT 22:00-07:00', 'NIGHT 21:00-06:00']);
  assert.equal(findShiftFrame('FLEX', '13:00')?.endTime, '22:00');
  assert.equal(findShiftFrame('NORMAL', '09:00'), null);
  assert.equal(findShiftFrame('CUSTOM', '08:00'), null);
});
test('workingDays follows the type weekdays and skips holidays', () => {
  const nv = [1, 2, 3, 4, 5, 6], tts = [1, 2, 3, 4, 5], none = new Set<string>();
  assert.deepEqual(workingDays('2026-11-13', '2026-11-16', nv, none), ['2026-11-13', '2026-11-14', '2026-11-16']);
  assert.deepEqual(workingDays('2026-11-13', '2026-11-16', tts, none), ['2026-11-13', '2026-11-16']);
  assert.deepEqual(workingDays('2026-09-01', '2026-09-03', nv, new Set(['2026-09-02'])), ['2026-09-01', '2026-09-03']);
  assert.deepEqual(workingDays('2026-11-15', '2026-11-15', nv, none), []);
});
test('date helpers', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.deepEqual(eachDate('2026-11-29', '2026-12-01'), ['2026-11-29', '2026-11-30', '2026-12-01']);
  assert.equal(weekday('2026-11-15'), 0);
  assert.equal(lastDayOfMonth('2026-02'), '2026-02-28');
  assert.equal(formatDayMonth('2026-11-12'), '12/11');
  assert.equal(vietnamToday(new Date('2026-11-04T18:30:00Z')), '2026-11-05');
});
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `node --import tsx --test test/v2/requests-calendar.test.ts`
Expected: FAIL vì chưa có module.

- [ ] **Step 3: Viết 4 file theo Interfaces**

Ngày tính bằng `Date.UTC` để không phụ thuộc múi giờ máy.

- [ ] **Step 4: Chạy lại test, thấy pass**

Run: `node --import tsx --test test/v2/requests-calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/requests/domain test/v2/requests-calendar.test.ts
git commit -m "feat(requests): add leave types, explanation cases, shift frames and working days"
```

---

### Task 2: Khung giờ OT/làm bù (domain thuần)

**Files:**
- Create: `src/modules/requests/domain/time-window.ts`
- Modify: `src/modules/requests/domain/index.ts`
- Test: `test/v2/requests-time-window.test.ts`

**Interfaces — Consumes:** `formatDayMonth` của Task 1.

**Interfaces — Produces:**
```ts
export const WINDOW_EARLIEST = '06:00', WINDOW_LATEST = '22:00';
export const SHIFT_GAP_MINUTES = 60, SHIFT_WORK_MINUTES = 480, DAY_CAP_MINUTES = 720;
export type WindowKind = 'OT' | 'MAKEUP';
export interface ClockWindow { date: string; startTime: string; endTime: string; kind: WindowKind }
export interface ShiftSpan { startDate: string; startTime: string; endTime: string } // endTime <= startTime: ca kéo sang hôm sau
export function toMinutes(time: string): number;
export function workMinutes(startTime: string, endTime: string): number;   // §5.4
export function formatHours(minutes: number): string;                       // 480 → '8', 450 → '7,5'
export function windowError(window: ClockWindow, shifts: readonly ShiftSpan[], others: readonly ClockWindow[]): string | null;
export function dayCapError(date: string, hasShift: boolean, windows: readonly ClockWindow[]): string | null;
```

`windowError` kiểm 3 điều đầu của §5.5, theo thứ tự dưới đây, và trả câu lỗi đầu tiên gặp:
1. Giờ sai định dạng hoặc `start >= end` → `Giờ khung không hợp lệ: ${s}–${e}`.
2. Khung không nằm trong 06–22 → `Khung ${s}–${e} ngày ${dd/mm} phải nằm trong 06:00–22:00`.
3. Khung chạm ca hoặc cách ca dưới 60 phút → `Khung ${s}–${e} ngày ${dd/mm} phải cách ca ${ss}–${se} ít nhất 1 giờ`. So bằng phút tuyệt đối: (số ngày tính từ mốc) × 1440 + phút trong ngày.
4. Chồng lên một khung trong `others` có cùng `date` (hai khoảng nửa mở `[a, b)` giao nhau) → `Khung ${s}–${e} ngày ${dd/mm} chồng lên khung ${s2}–${e2}`.

`dayCapError` chỉ cộng các khung có `date` bằng ngày đang xét. Tổng = `(hasShift ? 480 : 0) + Σ workMinutes`. Tổng > 720 → `Ngày ${dd/mm} vượt 12 giờ (ca + OT + làm bù = ${formatHours(total)} giờ)`.

- [ ] **Step 1: Viết test fail**

```ts
const w = (date: string, s: string, e: string, kind: WindowKind = 'OT') => ({ date, startTime: s, endTime: e, kind });
const day = [{ startDate: '2026-11-12', startTime: '08:00', endTime: '17:00' }];
test('workMinutes: 4h work then 1h break', () => {
  for (const [s, e, m] of [['18:00', '22:00', 240], ['06:00', '07:00', 60], ['08:00', '17:00', 480],
    ['08:00', '20:00', 600], ['06:00', '20:00', 720], ['06:00', '21:00', 720], ['06:00', '22:00', 780]] as const)
    assert.equal(workMinutes(s, e), m, `${s}-${e}`);
});
test('windowError on shift 08–17', () => {
  assert.equal(windowError(w('2026-11-12', '06:00', '07:00'), day, []), null);
  assert.equal(windowError(w('2026-11-12', '18:00', '22:00'), day, []), null);
  assert.match(windowError(w('2026-11-12', '17:00', '19:00'), day, [])!, /phải cách ca 08:00–17:00 ít nhất 1 giờ/);
  assert.match(windowError(w('2026-11-12', '07:30', '08:00'), day, [])!, /ít nhất 1 giờ/);
  assert.match(windowError(w('2026-11-12', '21:00', '23:00'), day, [])!, /phải nằm trong 06:00–22:00/);
  assert.match(windowError(w('2026-11-12', '05:00', '06:00'), [], [])!, /06:00–22:00/);
  assert.match(windowError(w('2026-11-12', '19:00', '18:00'), [], [])!, /Giờ khung không hợp lệ: 19:00–18:00/);
  assert.match(windowError(w('2026-11-12', '6:00', '07:00'), [], [])!, /Giờ khung không hợp lệ/);
});
test('night shift tail blocks the next morning, across month end too', () => {
  const night = [{ startDate: '2026-11-10', startTime: '22:00', endTime: '07:00' }];
  assert.match(windowError(w('2026-11-11', '07:30', '09:00'), night, [])!, /cách ca 22:00–07:00 ít nhất 1 giờ/);
  assert.equal(windowError(w('2026-11-11', '08:00', '12:00'), night, []), null);
  assert.equal(windowError(w('2026-11-10', '17:00', '21:00'), night, []), null);
  const last = [{ startDate: '2026-11-30', startTime: '22:00', endTime: '07:00' }];
  assert.match(windowError(w('2026-12-01', '07:30', '09:00'), last, [])!, /ít nhất 1 giờ/);
});
test('windows of the same day may not overlap', () => {
  assert.match(windowError(w('2026-11-12', '18:00', '20:00'), day, [w('2026-11-12', '19:00', '22:00', 'MAKEUP')])!,
    /chồng lên khung 19:00–22:00/);
  assert.equal(windowError(w('2026-11-12', '18:00', '20:00'), day, [w('2026-11-12', '20:00', '22:00')]), null);
  assert.equal(windowError(w('2026-11-12', '18:00', '20:00'), day, [w('2026-11-13', '18:00', '20:00')]), null);
});
test('dayCapError counts the shift as 8 hours', () => {
  assert.equal(dayCapError('2026-11-12', true, [w('2026-11-12', '18:00', '22:00')]), null);
  assert.equal(dayCapError('2026-11-12', true, [w('2026-11-12', '06:00', '07:00'), w('2026-11-12', '18:00', '22:00')]),
    'Ngày 12/11 vượt 12 giờ (ca + OT + làm bù = 13 giờ)');
  assert.equal(dayCapError('2026-11-15', false, [w('2026-11-15', '06:00', '20:00')]), null);
  assert.equal(dayCapError('2026-11-15', false, [w('2026-11-15', '06:00', '21:00')]), null);
  assert.match(dayCapError('2026-11-15', false, [w('2026-11-15', '06:00', '22:00')])!, /= 13 giờ/);
});
test('formatHours', () => {
  assert.deepEqual([formatHours(480), formatHours(450), formatHours(780)], ['8', '7,5', '13']);
});
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `node --import tsx --test test/v2/requests-time-window.test.ts`
Expected: FAIL vì chưa có module.

- [ ] **Step 3: Viết `time-window.ts` theo Interfaces**

- [ ] **Step 4: Chạy lại test, thấy pass**

Run: `node --import tsx --test test/v2/requests-time-window.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/requests/domain test/v2/requests-time-window.test.ts
git commit -m "feat(requests): add OT and makeup time-window rules"
```

---

### Task 3: Mô hình dữ liệu đơn, migration và lưu trữ; bỏ đơn sửa giờ

**Files:**
- Create: `migrations/postgres/0005_requests_rules.sql`. Chép **nguyên văn** khối SQL ở §4 của spec.
- Modify:
  - `src/database/schema.ts`:
    - `SystemRequestsTable` bỏ `correction_*` và `makeup_*`, thêm `explanation_date`, `actual_check_in`, `actual_check_out`, `change_start_date`, `change_end_date`;
    - thêm `MakeupSlotsTable`, `ExplanationCasesTable`, `CompanyHolidaysTable` và 3 mục tương ứng trong `DB`.
  - `src/modules/requests/domain/types.ts`, `src/modules/requests/domain/system-request.ts`.
  - `src/modules/requests/requests.repository.ts`, `src/modules/requests/requests.service.ts`, `src/modules/requests/requests.controller.ts`.
  - `src/modules/attendance/domain/work-schedule.ts`: xoá `withMakeUp`.
  - `src/modules/payroll/payroll.repository.ts`: `correction_date` → `explanation_date`, trường `correctionDate` → `explanationDate`.
  - `test/v2/payroll-month-rows.test.ts`: đổi theo tên mới.
- Test: `test/v2/requests-persistence.test.ts`

**Interfaces — Consumes:** `workMinutes` (Task 2), `ExplanationCase`, `LeaveType` (Task 1).

**Interfaces — Produces:**
```ts
// types.ts
export type RequestType = 'LEAVE' | 'OVERTIME' | 'ADVANCE' | 'SHIFT_CHANGE' | 'LEAVE_WITH_MAKEUP' | 'EXPLANATION' | 'ISAT';
export interface MakeupSlot { date: string; startTime: string; endTime: string; workMinutes: number }
export interface MakeupSlotRow { request_id: string; work_date: string; start_time: string; end_time: string; work_minutes: number }
export interface ExplanationCaseRow { request_id: string; case_code: ExplanationCase }
// SystemRequestProps / SystemRequest: bỏ correctionDate, correctionPunchType, correctionActualTime, makeupStartTime,
// makeupEndTime; thêm explanationDate, actualCheckIn, actualCheckOut, explanationCases: ExplanationCase[],
// changeStartDate, changeEndDate, makeupSlots: MakeupSlot[]  (mặc định [] cho hai mảng)
// SystemRequestDTO (§9): mọi trường đều có mặt (không còn trường tuỳ chọn), thêm owedMinutes: number | null
//   (= 480 × leaveDaysCount với LEAVE_WITH_MAKEUP, null với loại khác), makeupSlots, explanationCases, isat.
// system-request.ts
toMakeupSlotRows(): MakeupSlotRow[];
toExplanationCaseRows(): ExplanationCaseRow[];
static fromRow(row: any, isat?: IsatRegistration | null,
  children?: { makeupSlots?: MakeupSlot[]; explanationCases?: ExplanationCase[] }): SystemRequest;
// requests.repository.ts
listActive(employeeId: string): Promise<SystemRequest[]>;   // status IN ('PENDING','APPROVED'), có bảng con
```

**Factory dùng tạm trong task này** (Task 6–10 sẽ đổi tham số):
- `createExplanationRequest` ghi `explanationDate` (từ `workDate`), `actualCheckIn`, `actualCheckOut`.
- `createShiftChangeRequest` ghi `changeStartDate = changeEndDate = changeDate`.
- `createLeaveWithMakeupRequest`:
  - `leaveStartDate = leaveEndDate = leaveDate`;
  - `leaveType = null`, `leaveDaysCount = 1`;
  - một khung `{ date: makeupDate, startTime, endTime, workMinutes: workMinutes(start, end) }`.
- Xoá `createCorrectionRequest`, `CreateCorrectionParams`, `CorrectionPunchType`.

**Repository**
- **Đọc:** `findById`, `list`, `listActive` chọn rõ từng cột của `system_requests`. Sáu cột DATE (`leave_start_date`, `leave_end_date`, `explanation_date`, `ot_date`, `change_start_date`, `change_end_date`) chọn qua `to_char(<cột>, 'YYYY-MM-DD')` và giữ nguyên tên cột làm alias.
- **Bảng con:** `attachChildren` thay `attachIsat`.
  - Giữ nguyên phần iSAT.
  - `makeup_slots` đọc bằng `to_char("work_date", 'YYYY-MM-DD')`, sắp `order by work_date, start_time`, chỉ khi trang có đơn `LEAVE_WITH_MAKEUP`.
  - `explanation_cases` chỉ đọc khi trang có đơn `EXPLANATION`. Mã trả về sắp theo thứ tự trong `EXPLANATION_CASES`.
- **Ghi:** `save` mở giao dịch khi đơn có iSAT, có khung bù hoặc có trường hợp giải trình.
  - Dòng con chèn với `on conflict do nothing`: khoá `(request_id, work_date, start_time)` cho khung bù, `(request_id, case_code)` cho trường hợp giải trình.
  - Đơn không có bảng con thì chỉ ghi một câu SQL.
  - Danh sách cột trong upsert cập nhật theo cột mới.

**Service**
- Xoá `createCorrectionRequest`, `CreateCorrectionInput` và `formatTimeToHHmm`.
- Duyệt `EXPLANATION` đọc `req.explanationDate`.
- Duyệt `SHIFT_CHANGE` đọc `req.changeStartDate`.
- Duyệt `LEAVE_WITH_MAKEUP` chỉ `withLeave` các ngày từ `leaveStartDate` đến `leaveEndDate` theo ngày lịch, không ghi lịch cho khung bù. Task 8 sẽ sửa thành chỉ ngày làm việc.
- Duyệt `OVERTIME` **không ghi lịch** (§7).

**Controller:** xoá `@Post('correction')`.

- [ ] **Step 1: Viết test fail**

Test dùng `createScriptedKysely` (`test/v2/helpers/scripted-kysely.ts`) và `FakeAttendanceRepository` chép từ `test/v2/requests.test.ts`.

```ts
test('round trip keeps slots, cases and the new columns', () => {
  const req = new SystemRequest({ id: 'r1', employeeId: 'u1', title: 't', type: 'LEAVE_WITH_MAKEUP', reason: 'r',
    status: 'PENDING', leaveStartDate: '2026-11-10', leaveEndDate: '2026-11-11', leaveDaysCount: 2,
    makeupSlots: [{ date: '2026-11-15', startTime: '06:00', endTime: '20:00', workMinutes: 720 },
      { date: '2026-11-16', startTime: '18:00', endTime: '22:00', workMinutes: 240 }] });
  const row = req.toRow();
  assert.ok(!('correction_date' in row) && !('makeup_start_time' in row));
  assert.deepEqual(req.toMakeupSlotRows()[0],
    { request_id: 'r1', work_date: '2026-11-15', start_time: '06:00', end_time: '20:00', work_minutes: 720 });
  const back = SystemRequest.fromRow(row, null, { makeupSlots: req.makeupSlots });
  assert.deepEqual(back.toJSON(), req.toJSON());
  assert.equal(req.toJSON().owedMinutes, 960);
});
test('DTO of an OT request has empty child lists and null owedMinutes', () => {
  const dto = new SystemRequest({ id: 'r2', employeeId: 'u1', title: 't', type: 'OVERTIME', reason: 'r',
    status: 'PENDING', otDate: '2026-11-12', otStartTime: '18:00', otEndTime: '22:00', otHours: 4 }).toJSON();
  assert.deepEqual([dto.makeupSlots, dto.explanationCases, dto.owedMinutes, dto.changeStartDate], [[], [], null, null]);
});
test('save writes a leave-with-makeup request and its slots in one transaction', async () => {
  const { db, log } = createScriptedKysely();
  await new RequestsRepository(db).save(lwmRequest());   // lwmRequest() dựng giống test đầu
  assert.deepEqual(log.map(e => (typeof e === 'string' ? e : e.sql.match(/^insert into "(\w+)"/)?.[1])),
    ['BEGIN', 'system_requests', 'makeup_slots', 'COMMIT']);
  assert.match((log[2] as ScriptedQuery).sql, /on conflict \("request_id", "work_date", "start_time"\) do nothing/);
});
test('save writes explanation cases in the same transaction', /* … */);
// kỳ vọng: ['BEGIN', 'system_requests', 'explanation_cases', 'COMMIT']; on conflict ("request_id", "case_code") do nothing
test('a request without children is one statement', async () => { /* OT → log.length === 1 */ });
test('list reads DATE columns as text and loads children only for their types', async () => {
  // trang chỉ có đơn OT: 1 câu; câu đó khớp /to_char\("ot_date", 'YYYY-MM-DD'\) as "ot_date"/ và
  // /to_char\("leave_start_date", 'YYYY-MM-DD'\) as "leave_start_date"/
  // trang có đơn LEAVE_WITH_MAKEUP: thêm 1 câu đọc makeup_slots khớp /to_char\("work_date", 'YYYY-MM-DD'\)/ và
  // /order by "work_date", "start_time"/, parameters = [id]
});
test('listActive keeps PENDING and APPROVED of one employee', async () => {
  // SQL có `"employee_id" = $1` và `"status" in ($2, $3)` với parameters ['u1', 'PENDING', 'APPROVED']
});
test('the correction request is gone', () => {
  assert.equal((SystemRequest as any).createCorrectionRequest, undefined);
  assert.equal((RequestsService.prototype as any).createCorrectionRequest, undefined);
  assert.equal((RequestsController.prototype as any).createCorrection, undefined);
  assert.equal((WorkSchedule.prototype as any).withMakeUp, undefined);
});
test('approving OT writes no schedule; approving leave-with-makeup marks the leave day only', async () => {
  // dùng fake: duyệt OT 2026-11-12 → att.schedules.size === 0
  // đơn nghỉ có làm bù (nghỉ 10/11, bù 12/11) → chỉ có lịch 10/11 với status 'ON_LEAVE'
});
```

Sửa `test/v2/payroll-month-rows.test.ts`:
- mọi chỗ `correction_date` đổi thành `explanation_date`, mọi chỗ `correctionDate` đổi thành `explanationDate` (5 chỗ ở bản iSAT);
- các giá trị kỳ vọng giữ nguyên.

- [ ] **Step 2: Chạy test, thấy fail**

Run: `node --import tsx --test test/v2/requests-persistence.test.ts test/v2/payroll-month-rows.test.ts`
Expected: FAIL.

- [ ] **Step 3: Thực hiện theo Files và Interfaces ở trên**

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: 0 fail. Các test iSAT (`requests-isat-*.test.ts`) và test cũ `requests.test.ts` vẫn xanh.

- [ ] **Step 5: Commit**

```bash
git add migrations/postgres/0005_requests_rules.sql src test/v2
git commit -m "feat(requests): store makeup slots and explanation cases, drop time corrections"
```

---

### Task 4: Lịch lễ công ty (module `holidays`)

**Files:**
- Create: `src/modules/holidays/index.ts`, `holidays.module.ts`, `holidays.repository.ts`, `holidays.service.ts`, `holidays.controller.ts`, `holidays.errors.ts`
- Modify: `src/app.module.ts` (thêm `HolidaysModule`); `docs/api/v2-contract.md` (thêm mục `### 3.7. Holidays Module (Lịch lễ công ty)` theo §8 của spec)
- Test: `test/v2/holidays.test.ts`

**Interfaces — Consumes:** `vietnamToday`, `formatDayMonth` (Task 1); bảng `company_holidays` (Task 3).

**Interfaces — Produces:**
```ts
export interface Holiday { date: string; name: string }
export class HolidayNotFoundError extends Error {}
export const FIXED_HOLIDAYS: ReadonlyArray<{ monthDay: string; name: string }>;
// [{'01-01','Tết Dương lịch'}, {'04-30','Ngày Giải phóng miền Nam'}, {'05-01','Quốc tế Lao động'}, {'09-02','Quốc khánh'}]
class HolidaysRepository {
  listBetween(from: string, to: string): Promise<Holiday[]>;          // to_char, sắp theo ngày
  insert(holiday: Holiday, createdBy: string | null): Promise<boolean>; // false = ngày đã có
  remove(date: string): Promise<boolean>;                             // false = không có
}
class HolidaysService {
  list(year: number): Promise<Holiday[]>;
  add(input: { date: unknown; name: unknown }, createdBy: string | null): Promise<Holiday>;
  quickAdd(year: unknown, createdBy: string | null): Promise<string[]>;  // các ngày vừa thêm
  remove(date: string): Promise<void>;                                  // ném HolidayNotFoundError
}
// HolidaysModule: providers [HolidaysRepository, HolidaysService], exports cả hai
```

**Câu lỗi**
- Ngày sai: `Ngày lễ không hợp lệ: ${v}`.
- Tên trống (sau khi trim): `Tên ngày lễ không được trống`.
- Trùng ngày: `Ngày ${dd/mm/yyyy} đã có trong lịch lễ`.
- Năm sai (không phải số nguyên 2000–2100): `Năm không hợp lệ: ${v}`.
- Xoá ngày không có: `Không có ngày lễ ${date}`, trả 404 với code `HOLIDAY_NOT_FOUND`.

**Controller `api/v2/holidays`**
- `GET ?year` → `{ items }`. Không gửi `year` thì lấy năm của `vietnamToday(new Date())`.
- `POST` → `{ created: true, holiday }`.
- `POST quick-add` → `{ added }`.
- `DELETE :date` → `{ deleted: true }`.
- `createdBy = user?.username ?? null`.
- Lỗi khác trả 400 `BAD_REQUEST`.

- [ ] **Step 1: Viết test fail**

Service dùng repo giả trong bộ nhớ. Repository dùng scripted Kysely.

```ts
test('add, duplicate and validation', async () => {
  const svc = new HolidaysService(new MemoryHolidays());
  assert.deepEqual(await svc.add({ date: '2026-09-02', name: ' Quốc khánh ' }, 'admin'), { date: '2026-09-02', name: 'Quốc khánh' });
  await assert.rejects(svc.add({ date: '2026-09-02', name: 'x' }, null), /Ngày 02\/09\/2026 đã có trong lịch lễ/);
  await assert.rejects(svc.add({ date: '2026-02-30', name: 'x' }, null), /Ngày lễ không hợp lệ: 2026-02-30/);
  await assert.rejects(svc.add({ date: '2026-10-10', name: '  ' }, null), /Tên ngày lễ không được trống/);
});
test('quickAdd adds the four fixed days once', async () => {
  const svc = new HolidaysService(new MemoryHolidays());
  assert.deepEqual(await svc.quickAdd(2026, 'admin'), ['2026-01-01', '2026-04-30', '2026-05-01', '2026-09-02']);
  assert.deepEqual(await svc.quickAdd(2026, 'admin'), []);
  assert.deepEqual((await svc.list(2026)).map(h => h.name), ['Tết Dương lịch', 'Ngày Giải phóng miền Nam', 'Quốc tế Lao động', 'Quốc khánh']);
  await assert.rejects(svc.quickAdd('abc', null), /Năm không hợp lệ: abc/);
});
test('remove a day, then the missing day is 404', async () => {
  const svc = new HolidaysService(new MemoryHolidays());
  await svc.add({ date: '2026-09-02', name: 'Quốc khánh' }, null);
  await svc.remove('2026-09-02');
  assert.deepEqual(await svc.list(2026), []);
  await assert.rejects(svc.remove('2026-09-02'), HolidayNotFoundError);
});
test('repository reads dates as text and inserts idempotently', async () => {
  // listBetween: SQL khớp /to_char\("holiday_date", 'YYYY-MM-DD'\)/ và /order by "holiday_date"/
  // insert: SQL khớp /on conflict \("holiday_date"\) do nothing returning/; respond [] → false, respond [row] → true
});
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `node --import tsx --test test/v2/holidays.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết module theo Interfaces, đăng ký vào `AppModule`, viết mục docs 3.7**

- [ ] **Step 4: Chạy test**

Run: `npm test`
Expected: 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/modules/holidays src/app.module.ts docs/api/v2-contract.md test/v2/holidays.test.ts
git commit -m "feat(holidays): add the company holiday calendar"
```

---

### Task 5: Ngữ cảnh nộp đơn: hồ sơ, cờ quyền lợi, lịch, khoá, uuid

**Files:**
- Create:
  - `src/modules/requests/domain/employee-days.ts`;
  - `test/v2/helpers/requests-fakes.ts`;
  - `test/v2/requests-context.test.ts`.
- Modify:
  - `src/modules/requests/requests.repository.ts`;
  - `src/modules/requests/requests.service.ts`;
  - `src/modules/requests/requests.module.ts` (thêm `HolidaysModule` vào `imports`);
  - `src/modules/requests/domain/index.ts`;
  - `test/v2/requests.test.ts` (chuyển test "4. … tạm ứng" sang `requests-context.test.ts`).

**Interfaces — Consumes:** `ShiftSpan`, `ClockWindow` (Task 2); `workingDays`, `addDays`, `eachDate` (Task 1); `listActive` (Task 3); `HolidaysRepository.listBetween` (Task 4).

**Interfaces — Produces:**
```ts
// requests.repository.ts
export interface StaffContext {
  employeeId: string;                 // staff.uuid
  employeeType: string;
  defaultShift: { startTime: string; endTime: string };   // staff.shift_start_time / shift_end_time
  leaveBalance: number;               // staff.leave_balance, NULL → 0
  leaveBalanceOn: string | null;      // staff.leave_balance_on
  benefits: { ot: boolean; makeup: boolean; leaveAccount: boolean };
  regularDows: number[] | null;       // null = loại nhân sự chưa cấu hình
}
export interface ScheduleDay { date: string; startTime: string; endTime: string; onLeave: boolean }
findStaffContext(employeeIdOrUsername: string, month: string): Promise<StaffContext | null>;
listScheduleDays(employeeId: string, from: string, to: string): Promise<ScheduleDay[]>;
// domain/employee-days.ts
export interface EmployeeDaysInput { regularDows: readonly number[]; holidays: readonly string[];
  defaultShift: { startTime: string; endTime: string }; schedules: readonly ScheduleDay[]; activeRequests: readonly SystemRequest[] }
export class EmployeeDays {
  constructor(input: EmployeeDaysInput);
  isHoliday(date: string): boolean;
  isWorkingDay(date: string): boolean;
  workingDaysBetween(from: string, to: string): string[];
  shiftOf(date: string): ShiftSpan | null;          // §5.2
  shiftsAround(date: string): ShiftSpan[];          // ca của D−1, D, D+1 (bỏ null)
  isOnLeave(date: string): boolean;                 // §5.3
  windowsOn(date: string): ClockWindow[];           // OT + khung bù của các đơn đang chờ/đã duyệt trên ngày đó
  withShiftOverride(dates: readonly string[], frame: { startTime: string; endTime: string }): EmployeeDays;
}
// requests.service.ts
constructor(repo, @Optional() attendanceRepo?, @Optional() txCoordinator?, @Optional() @Inject(HolidaysRepository) holidaysRepo?)
now: () => Date;
protected resolveStaff(employeeIdOrUsername: string, month: string): Promise<StaffContext>;  // 'Không tìm thấy nhân sự: ${id}'
protected requireTypeConfig(staff: StaffContext): number[];   // `Thiếu cấu hình loại nhân sự ${employeeType}`
protected loadDays(staff: StaffContext, from: string, to: string): Promise<{ days: EmployeeDays; active: SystemRequest[] }>;
protected underEmployeeLock<T>(employeeId: string, fn: () => Promise<T>): Promise<T>;  // key `requests_${employeeId}`; không có txCoordinator thì chạy thẳng, như reviewRequest
```

**Chi tiết**
- **`findStaffContext`**
  - Tìm `staff` theo `uuid` hoặc `username`.
  - Lấy bản `position_types` mới nhất có `effective_month <= month`, theo cách của `findIsatProfile`.
  - Cờ lấy từ `position_type_benefits` của bản đó; thiếu dòng thì coi là tắt.
  - `regular_dows` là chuỗi JSON (`'[1,2,3,4,5,6]'`), đọc bằng `JSON.parse`.
  - Không có bản `position_types` nào thì `regularDows: null` và mọi cờ đều tắt.
- **`listScheduleDays`**
  - `to_char("work_date", 'YYYY-MM-DD')`, `to_char("planned_start_time", 'HH24:MI')`, `to_char("planned_end_time", 'HH24:MI')`.
  - `onLeave = status === 'ON_LEAVE'`.
- **`shiftOf(D)`** chạy theo thứ tự §5.2:
  1. D là ngày lễ → `null`.
  2. Có đơn `SHIFT_CHANGE` (trong danh sách đơn đang chờ/đã duyệt) phủ D và D là ngày làm việc → ca của đơn đó.
  3. Có dòng lịch cho D: `onLeave` thì `null` (Ruling), ngược lại lấy giờ của dòng lịch.
  4. D là ngày làm việc → ca mặc định.
  5. Còn lại → `null`.
  `startDate` của ca luôn là D.
- **`windowsOn(D)`**: lấy khung từ đơn OT (`otDate`, `otStartTime`, `otEndTime`) và từ `makeupSlots` của đơn nghỉ có làm bù, chỉ các đơn đang chờ/đã duyệt. Đơn OT cũ thiếu giờ hoặc giờ sai định dạng thì bỏ qua.
- **`isOnLeave(D)`**: D nằm trong khoảng `leaveStartDate`–`leaveEndDate` của một đơn `LEAVE` hoặc `LEAVE_WITH_MAKEUP` đang chờ/đã duyệt, hoặc dòng lịch của D có `onLeave`.
- **`loadDays`**
  - Đọc lịch và ngày lễ trong khoảng `[from − 1, to + 1]`.
  - `active = repo.listActive(staff.employeeId)`.
  - Thiếu `holidaysRepo` thì ném `Thiếu lịch lễ công ty`.
- **`createAdvanceRequest`**: `resolveStaff(employeeId, period)`, lưu `employeeId = staff.employeeId`, và chạy trong `underEmployeeLock`.

**`test/v2/helpers/requests-fakes.ts`** cung cấp:
- `NV_UUID` / `TTS_UUID`;
- `staffContext(overrides)`: mặc định là nv `nv01`, ca 08:00–17:00, số dư phép 12, mọi cờ bật, `regularDows` [1..6]; với tts thì `regularDows` [1..5], `ot` và `leaveAccount` tắt;
- `FakeRequestsRepository`: đơn lưu trong bộ nhớ, hồ sơ tra theo cả uuid lẫn username, có `schedules: ScheduleDay[]` và mọi hàm đã override;
- `FakeAttendanceRepository` (chuyển từ `requests.test.ts`);
- `FakeHolidaysRepository` với `dates: Holiday[]`;
- `RecordingLock` với `keys: string[]`, trong đó `withLock(key, fn)` ghi `key` rồi gọi `fn(undefined)`;
- `makeService()` trả về `{ service, repo, att, holidays, lock }`.

- [ ] **Step 1: Viết test fail**

```ts
test('shiftOf: holiday, then shift change, then schedule, then default', () => {
  const days = new EmployeeDays({ regularDows: [1, 2, 3, 4, 5, 6], holidays: ['2026-09-02'],
    defaultShift: { startTime: '08:00', endTime: '17:00' },
    schedules: [{ date: '2026-09-02', startTime: '08:00', endTime: '17:00', onLeave: false },
      { date: '2026-11-13', startTime: '09:00', endTime: '18:00', onLeave: false },
      { date: '2026-11-17', startTime: '08:00', endTime: '17:00', onLeave: true }],
    activeRequests: [shiftChange('2026-11-12', '2026-11-12', 'NORMAL', '10:00', '19:00', 'PENDING')] });
  assert.equal(days.shiftOf('2026-09-02'), null);
  assert.deepEqual(days.shiftOf('2026-11-12'), { startDate: '2026-11-12', startTime: '10:00', endTime: '19:00' });
  assert.equal(days.shiftOf('2026-11-13')?.startTime, '09:00');
  assert.equal(days.shiftOf('2026-11-14')?.startTime, '08:00');  // T7 của nv
  assert.equal(days.shiftOf('2026-11-15'), null);                // CN
  assert.equal(days.shiftOf('2026-11-17'), null);                // lịch ON_LEAVE
});
test('isOnLeave counts pending and approved leave, not rejected', /* đơn REJECTED không tính; ngày 17/11 có lịch ON_LEAVE thì tính */);
test('windowsOn lists OT and makeup slots of the day', /* 1 đơn OT 12/11 18–22 + 1 khung bù 12/11 06–07 → 2 khung, kind 'OT' và 'MAKEUP' */);
test('withShiftOverride changes only the given days', /* override ['2026-11-12'] → 10:00–19:00; 13/11 vẫn như cũ */);
test('advance request is stored under the uuid and filed under the lock', async () => {
  const { service, lock } = makeService();
  const dto = await service.createAdvanceRequest({ employeeId: 'nv01', title: 't', reason: 'r', amount: 1_000_000, period: '2026-11' });
  assert.equal(dto.employeeId, NV_UUID);
  assert.deepEqual(lock.keys, [`requests_${NV_UUID}`]);
  await assert.rejects(service.createAdvanceRequest({ employeeId: 'ghost', title: 't', reason: 'r', amount: 1, period: '2026-11' }),
    /Không tìm thấy nhân sự: ghost/);
});
test('loadDays without the holiday repository fails loudly', /* RequestsService(repo, att) → nộp đơn OT bị lỗi /Thiếu lịch lễ công ty/ (chạy được sau Task 7; ở Task 5 gọi thẳng loadDays) */);
test('findStaffContext reads the type version in effect', async () => {
  // scripted: staff { uuid 'u1', type 'nv', shift 08:00/17:00, leave_balance null, leave_balance_on null };
  // position_types { id 2, regular_dows '[1,2,3,4,5,6]' }; benefits [{benefit:'ot',enabled:1},{benefit:'makeup',enabled:1},{benefit:'leaveAccount',enabled:0}]
  // kỳ vọng: leaveBalance 0, benefits { ot: true, makeup: true, leaveAccount: false }, regularDows [1..6];
  // câu SQL position_types có tham số '2026-11' và /order by "effective_month" desc/
});
test('listScheduleDays reads dates and times as text', /* SQL khớp to_char("work_date", 'YYYY-MM-DD') và to_char("planned_start_time", 'HH24:MI'); status 'ON_LEAVE' → onLeave true */);
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `node --import tsx --test test/v2/requests-context.test.ts`
Expected: FAIL.

- [ ] **Step 3: Thực hiện theo Interfaces, thêm `HolidaysModule` vào `imports` của `RequestsModule`**

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/modules/requests test/v2
git commit -m "feat(requests): load staff, schedule and holiday context under an employee lock"
```

---

### Task 6: Đơn nghỉ (§6.1) và duyệt đơn nghỉ

**Files:**
- Modify:
  - `src/modules/requests/domain/system-request.ts`: `createLeaveRequest` kiểm `isLeaveType`, báo `Loại nghỉ không hợp lệ: ${v}`.
  - `src/modules/requests/requests.service.ts`.
  - `src/modules/requests/requests.controller.ts`: thêm `@Get('leave-types')` **trước** `@Get(':id')`. Route `leave` vẫn chuyển cả body; service không đọc `daysCount`.
  - `docs/api/v2-contract.md` §3.4: viết lại mục `POST /requests/leave`, thêm `GET /requests/leave-types`.
  - `test/v2/requests.test.ts`: xoá test "2. Nộp đơn nghỉ phép…".
  - `test/v2/requests-isat-domain.test.ts` và `test/v2/requests-isat-repository.test.ts`: đơn nghỉ mẫu đang dùng `leaveType: 'PAID'`, đổi thành `'ANNUAL'`. Không đổi gì khác.
- Test: `test/v2/requests-leave.test.ts`

**Interfaces — Consumes:** Task 5 (`resolveStaff`, `requireTypeConfig`, `loadDays`, `underEmployeeLock`, `EmployeeDays`); `LEAVE_TYPES`, `isLeaveType`, `eachDate`, `monthOf`, `formatDayMonth` (Task 1).

**Interfaces — Produces** (Task 8 dùng lại):
```ts
export interface CreateLeaveInput { employeeId: string; title: string; reason: string; leaveType: unknown; startDate: unknown; endDate: unknown }
protected assertLeaveRangeFree(days: EmployeeDays, active: readonly SystemRequest[], start: string, end: string): void;
protected markLeaveDays(req: SystemRequest): Promise<void>;   // duyệt: withLeave cho từng ngày làm việc trong khoảng
// controller: listLeaveTypes(): { leaveTypes: typeof LEAVE_TYPES }
```

**`createLeaveRequest` kiểm theo thứ tự**
1. `leaveType`, rồi `startDate` và `endDate`, dùng câu lỗi domain sẵn có.
2. `resolveStaff(employeeId, monthOf(startDate))` và `requireTypeConfig`.
3. Từ bước này chạy trong `underEmployeeLock`: `loadDays(start, end)`.
4. `days = workingDaysBetween(start, end)`. Rỗng → `Khoảng nghỉ không có ngày làm việc`.
5. `assertLeaveRangeFree`:
   - trùng đơn `LEAVE` hoặc `LEAVE_WITH_MAKEUP` đang chờ/đã duyệt → `Đã có đơn nghỉ trùng ngày (${dd/mm} – ${dd/mm})`, dùng khoảng của đơn đã có;
   - một ngày trong khoảng có khung → `Ngày ${dd/mm} đã có khung OT hoặc làm bù`.
6. Riêng `ANNUAL`:
   - cờ `leaveAccount` tắt → `Loại nhân sự này không có Phép năm`;
   - còn lại = `leaveBalance` − Σ `leaveDaysCount` của các đơn `ANNUAL` đang chờ/đã duyệt có `leaveStartDate >= leaveBalanceOn` (khi `leaveBalanceOn` khác null);
   - xin vượt → `Phép năm còn ${n} ngày, xin ${k} ngày`, số lẻ viết dấu phẩy.
7. Tạo đơn với `daysCount = days.length`, lưu, trả DTO.

**Duyệt `LEAVE`:** `markLeaveDays`. Ngày làm việc tính lại lúc duyệt bằng `loadDays`.

- [ ] **Step 1: Viết test fail**

Dùng `makeService()`.

```ts
test('old PAID code is refused', async () => assert.rejects(leave({ leaveType: 'PAID' }), /Loại nghỉ không hợp lệ: PAID/));
test('server counts working days and ignores daysCount', async () => {
  assert.equal((await leave({ startDate: '2026-11-13', endDate: '2026-11-16', daysCount: 9 })).leaveDaysCount, 3);
  assert.equal((await leave({ employeeId: 'tts01', leaveType: 'UNPAID', startDate: '2026-11-13', endDate: '2026-11-16' })).leaveDaysCount, 2);
});
test('a holiday inside the range is not counted', /* holidays ['2026-09-02'], 01–03/09 → 2 */);
test('a range with only Sunday or holidays is refused', async () =>
  assert.rejects(leave({ startDate: '2026-11-15', endDate: '2026-11-15' }), /Khoảng nghỉ không có ngày làm việc/));
test('overlap with a pending leave is refused; a rejected one does not block', /* /Đã có đơn nghỉ trùng ngày \(12\/11 – 12\/11\)/ */);
test('leave on a day with an OT window is refused', /* OT đã duyệt 12/11 18–22 → /Ngày 12\/11 đã có khung OT hoặc làm bù/ */);
test('annual leave balance', async () => {
  // leaveBalance 2: ANNUAL 13–16/11 (3 ngày) → /Phép năm còn 2 ngày, xin 3 ngày/
  // leaveBalance 3 + đơn ANNUAL đang chờ 1 ngày: xin 3 → /Phép năm còn 2 ngày, xin 3 ngày/
  // leaveBalanceOn '2026-11-01' + đơn ANNUAL đã duyệt 05/10 (5 ngày), leaveBalance 3: xin 3 → được
});
test('tts has no annual leave', async () =>
  assert.rejects(leave({ employeeId: 'tts01', leaveType: 'ANNUAL' }), /Loại nhân sự này không có Phép năm/));
test('approval marks only working days; rejection writes nothing', async () => {
  // 13–16/11 duyệt → att.schedules có 13, 14, 16 với status 'ON_LEAVE'; không có 15
  // đơn khác 23/11 bị từ chối → không có lịch 23/11
});
test('filed under the employee lock', /* lock.keys === [`requests_${NV_UUID}`] sau một đơn nghỉ hợp lệ */);
test('controller lists leave types', () =>
  assert.deepEqual(new RequestsController(service).listLeaveTypes(), { leaveTypes: LEAVE_TYPES }));
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `node --import tsx --test test/v2/requests-leave.test.ts`
Expected: FAIL.

- [ ] **Step 3: Thực hiện, rồi viết lại docs mục đơn nghỉ**

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/modules/requests docs/api/v2-contract.md test/v2
git commit -m "feat(requests): leave requests use the six leave types and server-counted days"
```

---

### Task 7: Đơn OT (§6.3)

**Files:**
- Modify:
  - `src/modules/requests/requests.service.ts`;
  - `src/modules/requests/requests.controller.ts` (route `overtime` truyền `otDate`, `targetDate`, `startTime`, `endTime`);
  - `docs/api/v2-contract.md` §3.4 (mục `POST /requests/overtime`);
  - `test/v2/requests.test.ts` (xoá test "3. … trần OT 4h/ngày").
- Test: `test/v2/requests-overtime.test.ts`

**Interfaces — Consumes:** Task 5; `windowError`, `dayCapError`, `workMinutes` (Task 2).

**Interfaces — Produces:**
```ts
export interface CreateOvertimeInput { employeeId: string; title: string; reason: string;
  otDate?: unknown; targetDate?: unknown; startTime?: unknown; endTime?: unknown }
```

**`createOvertimeRequest` kiểm theo thứ tự**
1. `date = otDate ?? targetDate`. Kiểm ngày và hai giờ bằng câu lỗi domain sẵn có. Bỏ cách mặc định 18:00.
2. `resolveStaff(monthOf(date))` và `requireTypeConfig`. Cờ `ot` tắt → `Loại nhân sự này không có OT`.
3. Trong `underEmployeeLock`: `loadDays(date, date)`.
4. `isOnLeave(date)` → `Ngày ${dd/mm} đang nghỉ, không đăng ký OT được`.
5. Đặt `window = { date, startTime, endTime, kind: 'OT' }`, rồi kiểm `windowError(window, shiftsAround(date), windowsOn(date))`.
6. Kiểm `dayCapError(date, shiftOf(date) !== null, [...windowsOn(date), window])`.
7. Σ `otHours` của các đơn OT đang chờ/đã duyệt có `otDate` trong cùng tháng, cộng giờ đơn này, vượt 40 → giữ nguyên câu của v2: `Tổng số giờ làm thêm trong tháng ${YYYY-MM} không được vượt quá 40 giờ theo Luật Lao động (đã có ${x}h, đăng ký thêm ${y}h)`.
8. Có đơn `LEAVE_WITH_MAKEUP` đang chờ/đã duyệt với `leaveStartDate` trong tháng → `Tháng ${YYYY-MM} đã có đơn nghỉ có làm bù, không đăng ký OT được`.
9. `hours = workMinutes(start, end) / 60`. Tạo đơn, lưu.

- [ ] **Step 1: Viết test fail**

```ts
test('tts cannot file OT', async () => assert.rejects(ot({ employeeId: 'tts01' }), /Loại nhân sự này không có OT/));
test('both times are required', async () => assert.rejects(ot({ endTime: undefined }), /endTime must be a valid HH:mm/));
test('windows around shift 08–17', async () => {
  assert.equal((await ot({ otDate: '2026-11-12', startTime: '18:00', endTime: '22:00' })).otHours, 4);
  await assert.rejects(ot({ otDate: '2026-11-13', startTime: '17:00', endTime: '19:00' }), /ít nhất 1 giờ/);
  await assert.rejects(ot({ otDate: '2026-11-13', startTime: '21:00', endTime: '23:00' }), /06:00–22:00/);
});
test('several windows a day up to 12 hours', async () => {
  await ot({ otDate: '2026-11-12', startTime: '06:00', endTime: '07:00' });
  await ot({ otDate: '2026-11-12', startTime: '18:00', endTime: '21:00' });          // 8 + 1 + 3 = 12
  await assert.rejects(ot({ otDate: '2026-11-12', startTime: '19:00', endTime: '20:00' }), /chồng lên khung 18:00–21:00/);
  await assert.rejects(ot({ otDate: '2026-11-12', startTime: '21:00', endTime: '22:00' }), /vượt 12 giờ \(ca \+ OT \+ làm bù = 13 giờ\)/);
});
test('a holiday and a Sunday have no shift', async () => {
  // holidays ['2026-09-02']: 08–20 → otHours 10; Sunday 15/11: 06–20 được, 06–22 → /vượt 12 giờ/
});
test('no OT on a leave day', /* đơn nghỉ đã duyệt 12/11 → /Ngày 12\/11 đang nghỉ, không đăng ký OT được/ */);
test('monthly cap of 40 hours', /* đơn OT đã duyệt otHours 38 ngày 02/11 (đưa thẳng vào repo) → 18–22 bị /đã có 38h, đăng ký thêm 4h/ */);
test('a month with leave-with-makeup refuses OT', /* đơn nghỉ có làm bù đang chờ 10/11 → OT 20/11 → /Tháng 2026-11 đã có đơn nghỉ có làm bù/ */);
test('a pending shift change moves the shift used for checks', async () => {
  // đơn SHIFT_CHANGE đang chờ 12/11 NORMAL 10:00–19:00:
  // OT 12/11 18–22 → /cách ca 10:00–19:00 ít nhất 1 giờ/; OT 12/11 20:00–22:00 → được
});
test('username is stored as uuid, under the employee lock', /* employeeId 'nv01' → dto.employeeId === NV_UUID; lock.keys === [`requests_${NV_UUID}`] */);
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `node --import tsx --test test/v2/requests-overtime.test.ts`
Expected: FAIL.

- [ ] **Step 3: Thực hiện, rồi viết lại docs mục OT**

Docs ghi rõ: `hours`/`otHours` client gửi bị bỏ qua, `otRateMultiplier` không còn.

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/modules/requests docs/api/v2-contract.md test/v2
git commit -m "feat(requests): check OT windows against the shift, day cap and makeup months"
```

---

### Task 8: Đơn nghỉ có làm bù (§6.2)

**Files:**
- Modify:
  - `src/modules/requests/domain/types.ts`, `src/modules/requests/domain/system-request.ts` (tham số factory mới);
  - `src/modules/requests/requests.service.ts`;
  - `src/modules/requests/requests.controller.ts` (thêm `@Post('leave-with-makeup')`);
  - `docs/api/v2-contract.md` §3.4 (mục mới).
- Test: `test/v2/requests-makeup.test.ts`

**Interfaces — Consumes:** Task 5; `assertLeaveRangeFree` và `markLeaveDays` (Task 6); `windowError`, `dayCapError`, `workMinutes`, `formatHours` (Task 2); `lastDayOfMonth` (Task 1).

**Interfaces — Produces:**
```ts
export interface CreateLeaveWithMakeupParams { employeeId: string; title: string; reason: string;
  startDate: string; endDate: string; daysCount: number; makeupSlots: MakeupSlot[] }
export interface CreateLeaveWithMakeupInput { employeeId: string; title: string; reason: string;
  startDate: unknown; endDate: unknown; slots: unknown }
```
Factory ghi `type 'LEAVE_WITH_MAKEUP'`, `leaveType null`, hai ngày nghỉ, `leaveDaysCount` và `makeupSlots`.

**`createLeaveWithMakeupRequest` kiểm theo thứ tự**
1. Kiểm `startDate` và `endDate` bằng câu lỗi domain sẵn có.
2. `slots` không phải mảng → `slots phải là danh sách khung bù`. Một khung không phải object, hoặc thiếu/sai `date`, `startTime`, `endTime` → `Khung bù thứ ${i + 1} không hợp lệ`.
3. `resolveStaff(monthOf(startDate))` và `requireTypeConfig`. Cờ `makeup` tắt → `Loại nhân sự này không có làm bù`.
4. Hai ngày nghỉ hoặc ngày của bất kỳ khung nào khác tháng nhau → `Ngày nghỉ và khung bù phải nằm trong cùng một tháng`.
5. Trong `underEmployeeLock`: `loadDays(startDate, lastDayOfMonth(month))`.
6. Ngày nghỉ = `workingDaysBetween(start, end)`. Rỗng → `Khoảng nghỉ không có ngày làm việc`. Sau đó gọi `assertLeaveRangeFree`.
7. `endDate === lastDayOfMonth(month)` → `Không còn ngày trong tháng để xếp đủ giờ bù`.
8. Có đơn OT đang chờ/đã duyệt trong tháng → `Tháng ${YYYY-MM} đã có đơn OT, không nộp đơn nghỉ có làm bù được`.
9. Duyệt từng khung, theo thứ tự ngày rồi đến giờ:
   - `date <= endDate` → `Khung bù ngày ${dd/mm} phải sau ngày nghỉ cuối ${dd/mm}`;
   - `isOnLeave(date)` → `Ngày ${dd/mm} đang nghỉ, không xếp khung bù được`;
   - kiểm `windowError(slot, shiftsAround(date), [...windowsOn(date), ...các khung mới khác cùng ngày])`.
10. Với mỗi ngày có khung: kiểm `dayCapError(date, shiftOf(date) !== null, [...windowsOn(date), ...các khung mới trên ngày đó])`.
11. Σ `workMinutes` ≠ 480 × số ngày nghỉ → `Cần đúng ${formatHours(nợ)} giờ bù, đang xếp ${formatHours(tổng)} giờ`.
12. Tạo đơn, lưu (ghi cả bảng con trong một giao dịch, Task 3).

**Duyệt `LEAVE_WITH_MAKEUP`:** thay phần tạm ở Task 3 bằng `markLeaveDays`. Không ghi lịch cho khung bù.

- [ ] **Step 1: Viết test fail**

```ts
const s = (date: string, startTime: string, endTime: string) => ({ date, startTime, endTime });
test('one day off needs exactly 8 hours', async () => {
  const dto = await lwm({ startDate: '2026-11-10', endDate: '2026-11-10', slots: [s('2026-11-12', '18:00', '22:00'), s('2026-11-16', '18:00', '22:00')] });
  assert.equal(dto.owedMinutes, 480);
  assert.deepEqual(dto.makeupSlots.map(x => x.workMinutes), [240, 240]);
  assert.equal(dto.leaveType, null);
});
test('two days need 16 hours and a Sunday slot is allowed', async () => {
  await lwm({ startDate: '2026-11-10', endDate: '2026-11-11', slots: [s('2026-11-15', '06:00', '20:00'), s('2026-11-16', '18:00', '22:00')] });
});
test('too few or too many hours', async () => {
  await assert.rejects(lwm({ slots: [s('2026-11-12', '18:00', '22:00')] }), /Cần đúng 8 giờ bù, đang xếp 4 giờ/);
  await assert.rejects(lwm({ slots: [s('2026-11-12', '18:00', '22:00'), s('2026-11-13', '18:00', '22:00'), s('2026-11-16', '06:00', '07:00')] }),
    /đang xếp 9 giờ/);
});
test('slots must come after the last leave day', /* khung 09/11 hoặc 10/11 với ngày nghỉ 10/11 → /phải sau ngày nghỉ cuối 10\/11/ */);
test('slots must stay in the month', /* nghỉ 27/11, khung 01/12 → /cùng một tháng/ */);
test('a leave on the last day of the month has no room', /* lwm({ startDate: '2026-11-30', endDate: '2026-11-30', slots: [s('2026-11-12', '18:00', '22:00'), s('2026-11-16', '18:00', '22:00')] }) → /Không còn ngày trong tháng để xếp đủ giờ bù/ */);
test('filed under the employee lock', /* lock.keys === [`requests_${NV_UUID}`] sau một đơn hợp lệ */);
test('a month with OT refuses the request', /* đơn OT đã duyệt 05/11 → /Tháng 2026-11 đã có đơn OT/ */);
test('slots follow the window rules', async () => {
  // khung 12/11 17:00–21:00 → /ít nhất 1 giờ/;
  // 12/11 06–07 + 12/11 18–22 + 13/11 18–21 → /Ngày 12\/11 vượt 12 giờ/;
  // 12/11 18–20 + 12/11 19–21 → /chồng lên khung/
});
test('malformed slots give a clear error', async () => {
  await assert.rejects(lwm({ slots: 'abc' }), /slots phải là danh sách khung bù/);
  await assert.rejects(lwm({ slots: [{ date: '2026-11-12', startTime: '18:00' }] }), /Khung bù thứ 1 không hợp lệ/);
});
test('the makeup flag is required', /* staffContext({ benefits: { ot: true, makeup: false, leaveAccount: true } }) → /không có làm bù/ */);
test('approval marks the leave day only and getById returns the slots', async () => {
  // duyệt đơn nghỉ 10/11 → lịch 10/11 có status ON_LEAVE; không có lịch 12/11 và 16/11;
  // getById(id).makeupSlots có 2 khung
});
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `node --import tsx --test test/v2/requests-makeup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Thực hiện, rồi viết docs mục `POST /requests/leave-with-makeup`**

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/modules/requests docs/api/v2-contract.md test/v2
git commit -m "feat(requests): leave with makeup schedules exactly 8 hours per day off"
```

---

### Task 9: Đơn đổi ca (§6.4)

**Files:**
- Modify:
  - `src/modules/requests/domain/types.ts`, `src/modules/requests/domain/system-request.ts`;
  - `src/modules/requests/requests.service.ts`;
  - `src/modules/requests/requests.controller.ts` (thêm `@Post('shift-change')`);
  - `docs/api/v2-contract.md` §3.4.
- Test: `test/v2/requests-shift-change.test.ts`

**Interfaces — Consumes:** Task 5 (`withShiftOverride`, `windowsOn`, `shiftsAround`); `findShiftFrame`, `ShiftFrame` (Task 1); `windowError` (Task 2).

**Interfaces — Produces:**
```ts
export interface CreateShiftChangeParams { employeeId: string; title: string; reason: string; startDate: string; endDate: string; frame: ShiftFrame }
export interface CreateShiftChangeInput { employeeId: string; title: string; reason: string;
  startDate: unknown; endDate: unknown; shiftType: unknown; startTime: unknown }
```

**`createShiftChangeRequest` kiểm theo thứ tự**
1. `findShiftFrame(shiftType, startTime)` trả null → `Khung ca không hợp lệ: ${shiftType} ${startTime}`.
2. Kiểm `startDate` và `endDate` (`startDate must be…`, `endDate (…) cannot be earlier…`).
3. `resolveStaff` và `requireTypeConfig`.
4. Trong `underEmployeeLock`: `loadDays(startDate, addDays(endDate, 1))`.
5. `changed = workingDaysBetween(start, end)`. Rỗng → `Khoảng đổi ca không có ngày làm việc`.
6. Một ngày trong `changed` đang nghỉ → `Ngày ${dd/mm} đang nghỉ, không đổi ca được`.
7. Một đơn `SHIFT_CHANGE` khác đang chờ/đã duyệt có ngày được đổi giao với `changed` → `Ngày ${dd/mm} đã có đơn đổi ca khác`.
8. Đặt `next = days.withShiftOverride(changed, frame)`. Xét từng ngày D thuộc `changed` hoặc là ngày kế sau của một ngày trong đó (sắp tăng, bỏ trùng):
   - với mỗi khung `w` trong `next.windowsOn(D)`: nếu `windowError(w, next.shiftsAround(D), [])` khác null → `${dd/mm}: khung ${w.kind === 'OT' ? 'OT' : 'bù'} ${w.startTime}–${w.endTime} chạm ca mới ${frame.startTime}–${frame.endTime}`;
   - sau đó `dayCapError(D, next.shiftOf(D) !== null, next.windowsOn(D))` khác null → ném đúng câu đó (§5.5 bước 4).
9. Tạo đơn, lưu.

**Duyệt `SHIFT_CHANGE`:** với mỗi ngày làm việc trong khoảng `changeStartDate`–`changeEndDate`, chạy `ensureDefaultSchedule` rồi `withShiftChange(newShiftType, newStartTime, newEndTime, id)`. Phần này thay bản một ngày ở Task 3.

- [ ] **Step 1: Viết test fail**

```ts
test('only the six frames', async () => {
  await assert.rejects(sc({ shiftType: 'NORMAL', startTime: '09:00' }), /Khung ca không hợp lệ: NORMAL 09:00/);
  await assert.rejects(sc({ shiftType: 'CUSTOM', startTime: '08:00' }), /Khung ca không hợp lệ: CUSTOM 08:00/);
  assert.equal((await sc({ shiftType: 'FLEX', startTime: '13:00' })).newEndTime, '22:00');
});
test('approval changes only working days', async () => {
  // 13–16/11 NIGHT 22:00 duyệt → lịch 13, 14, 16 có shiftType 'NIGHT', 22:00–07:00; không có 15
});
test('a makeup slot that the new shift touches blocks the change', async () => {
  // đơn nghỉ có làm bù đã duyệt, khung 12/11 18–22 → đổi 12/11 NORMAL 10:00 →
  // /12\/11: khung bù 18:00–22:00 chạm ca mới 10:00–19:00/
});
test('a night shift reaches next morning OT', async () => {
  // OT đã duyệt 13/11 06:00–07:00 → đổi 12/11 NIGHT 22:00 → /13\/11: khung OT 06:00–07:00 chạm ca mới 22:00–07:00/
});
test('another shift change on the same day is refused', /* đơn đang chờ 12/11 → đơn mới 11–13/11 → /Ngày 12\/11 đã có đơn đổi ca khác/ */);
test('leave days and Sunday-only ranges are refused', /* /Ngày 12\/11 đang nghỉ, không đổi ca được/; 15/11 → /Khoảng đổi ca không có ngày làm việc/ */);
test('filed under the employee lock', /* lock.keys === [`requests_${NV_UUID}`] sau một đơn hợp lệ */);
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `node --import tsx --test test/v2/requests-shift-change.test.ts`
Expected: FAIL.

- [ ] **Step 3: Thực hiện, rồi viết docs mục `POST /requests/shift-change`**

Docs liệt kê đủ 6 khung ca.

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/modules/requests docs/api/v2-contract.md test/v2
git commit -m "feat(requests): shift-change requests pick one of six frames over a date range"
```

---

### Task 10: Đơn giải trình (§6.5)

**Files:**
- Modify:
  - `src/modules/requests/domain/types.ts`, `src/modules/requests/domain/system-request.ts`;
  - `src/modules/requests/requests.service.ts`;
  - `src/modules/requests/requests.controller.ts`: thêm `@Get('explanation-cases')` **trước** `@Get(':id')`; route `explanation` truyền `workDate`, `cases`, `actualCheckIn`, `actualCheckOut`;
  - `docs/api/v2-contract.md` §3.4.
- Delete: `test/v2/requests.test.ts`. Test "1. … giải trình" của file này được chuyển sang file mới.
- Test: `test/v2/requests-explanation.test.ts`

**Interfaces — Consumes:** Task 5 (`resolveStaff`, `underEmployeeLock`, `now`); `EXPLANATION_CASES`, `isExplanationCase`, `vietnamToday` (Task 1).

**Interfaces — Produces:**
```ts
export interface CreateExplanationParams { employeeId: string; title: string; reason: string; workDate: string;
  cases: ExplanationCase[]; actualCheckIn: string | null; actualCheckOut: string | null }
export interface CreateExplanationInput { employeeId: string; title: string; reason: string;
  workDate: unknown; cases: unknown; actualCheckIn?: unknown; actualCheckOut?: unknown }
// controller: listExplanationCases(): { cases: typeof EXPLANATION_CASES }
```

**`createExplanationRequest` kiểm theo thứ tự**
1. Kiểm `workDate` bằng câu lỗi domain sẵn có. Ngày sau `vietnamToday(this.now())` → `Không giải trình cho ngày trong tương lai`.
2. `cases`:
   - không phải mảng hoặc mảng rỗng → `Cần chọn ít nhất 1 trường hợp giải trình`;
   - mã lạ → `Trường hợp giải trình không hợp lệ: ${c}`;
   - mã lặp → `Trường hợp giải trình bị lặp: ${c}`.
   Mã lưu theo thứ tự trong `EXPLANATION_CASES`.
3. Giờ thực tế: `undefined`, `null` hoặc `''` thì lưu null. Sai định dạng → `Giờ thực tế không hợp lệ: ${v}`.
4. `resolveStaff(monthOf(workDate))`. Không cần cấu hình loại nhân sự.
5. Trong `underEmployeeLock`: nếu `repo.list({ employeeId: uuid, type: 'EXPLANATION' })` có đơn cùng `explanationDate` với status `PENDING`, `APPROVED` hoặc `REJECTED` → `Ngày ${dd/mm} đã có đơn giải trình`.
6. Tạo đơn, lưu (ghi bảng con trong một giao dịch).

**Duyệt:** giữ `updateDayStatus(employeeId, explanationDate, 'VALID')`.

- [ ] **Step 1: Viết test fail**

```ts
test('cases are required, known and unique', async () => {
  await assert.rejects(expl({ cases: [] }), /Cần chọn ít nhất 1 trường hợp giải trình/);
  await assert.rejects(expl({ cases: 'LATE_CHECK_IN' }), /Cần chọn ít nhất 1 trường hợp giải trình/);
  await assert.rejects(expl({ cases: ['X'] }), /Trường hợp giải trình không hợp lệ: X/);
  await assert.rejects(expl({ cases: ['LATE_CHECK_IN', 'LATE_CHECK_IN'] }), /bị lặp: LATE_CHECK_IN/);
});
test('stores cases in catalogue order and both actual times', async () => {
  const dto = await expl({ cases: ['EARLY_CHECK_OUT', 'LATE_CHECK_IN'], actualCheckIn: '08:20', actualCheckOut: '16:40' });
  assert.deepEqual([dto.explanationCases, dto.actualCheckIn, dto.actualCheckOut, dto.explanationDate],
    [['LATE_CHECK_IN', 'EARLY_CHECK_OUT'], '08:20', '16:40', '2026-11-04']);
});
test('no explanation for a future day', async () => {
  service.now = () => new Date('2026-11-04T10:00:00Z');
  await assert.rejects(expl({ workDate: '2026-11-05' }), /Không giải trình cho ngày trong tương lai/);
});
test('one explanation per day; rejected blocks, cancelled does not', async () => { /* /Ngày 04\/11 đã có đơn giải trình/ */ });
test('username is stored as uuid, under the employee lock', /* employeeId 'nv01' → dto.employeeId === NV_UUID; lock.keys === [`requests_${NV_UUID}`] */);
test('a bad actual time is refused', async () => assert.rejects(expl({ actualCheckOut: '25:00' }), /Giờ thực tế không hợp lệ: 25:00/));
test('approval marks the day VALID', /* như test cũ "1." */);
test('controller lists explanation cases', () =>
  assert.deepEqual(new RequestsController(service).listExplanationCases(), { cases: EXPLANATION_CASES }));
```

- [ ] **Step 2: Chạy test, thấy fail**

Run: `node --import tsx --test test/v2/requests-explanation.test.ts`
Expected: FAIL.

- [ ] **Step 3: Thực hiện, rồi viết lại docs mục giải trình**

Docs bỏ `targetPunchType` và `actualPunchTime`, thêm `GET /requests/explanation-cases`.

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: 0 fail.

- [ ] **Step 5: Commit**

```bash
git add -A src/modules/requests docs/api/v2-contract.md test/v2
git commit -m "feat(requests): explanations record the chosen cases and actual times"
```

---

### Task 11: Test PostgreSQL thật và rà tài liệu

**Files:**
- Create: `test/v2/requests-repository.pg.test.ts`
- Modify: `docs/api/v2-contract.md`:
  - §2 (bảng ánh xạ): bỏ dòng đơn sửa giờ nếu có;
  - §3.4: thêm mục chung cho `GET /requests` và `GET /requests/:id`, gồm các trường theo loại ở §9 và tác dụng khi duyệt ở §7 (cả 2 tác dụng phụ).

**Interfaces — Consumes:**
- `RequestsRepository.save`, `findById`, `listActive`, `findStaffContext`, `listScheduleDays`;
- `HolidaysRepository.insert`, `listBetween`, `remove`.

Làm theo mẫu `test/v2/payroll-repository.pg.test.ts`: `PG_TEST_URL`, DB tạm, `DROP … WITH (FORCE)` trong `finally`. `MIGRATIONS` là mọi file trong `migrations/postgres` sắp theo tên.

- [ ] **Step 1: Viết test**

```ts
// sau khi chạy migration: thêm staff ('pg-user', uuid 'pg-uuid-1', type 'nv', level 1)
assert.deepEqual((await repo.findStaffContext('pg-user', '2026-11'))?.benefits, { ot: true, makeup: true, leaveAccount: true });
// đơn nghỉ có làm bù (nghỉ 2026-11-10, khung 12/11 và 16/11 18–22): lưu → findById có leaveStartDate '2026-11-10',
// makeupSlots[0].date '2026-11-12', workMinutes 240; duyệt rồi lưu lại → vẫn đúng 2 khung
// đơn giải trình có cases ['LATE_CHECK_IN'] → findById().explanationCases khớp
// listActive('pg-uuid-1') có cả hai; từ chối đơn giải trình → listActive còn 1
// CHECK: chèn leave_type 'PAID', case_code 'X' hoặc type 'TIME_CORRECTION' → bị từ chối
// lịch lễ: insert 2026-09-02 → true, chèn lại → false; listBetween('2026-01-01', '2026-12-31') →
// [{ date: '2026-09-02', name: 'Quốc khánh' }]; remove → true
// work_schedules 2026-11-12 10:00–19:00 ON_LEAVE → listScheduleDays →
// [{ date: '2026-11-12', startTime: '10:00', endTime: '19:00', onLeave: true }]
```

- [ ] **Step 2: Chạy test**

Run: `npm test`
Expected: 0 fail, test PG báo skip (`PG_TEST_URL chưa đặt`).
Không tự lấy thông tin DB. Báo cáo cuối ghi rõ test PG chưa chạy và đưa người dùng lệnh: `PG_TEST_URL="postgres://<user>:<pass>@<host>:<port>/postgres" node --import tsx --test test/v2/requests-repository.pg.test.ts`.

- [ ] **Step 3: Rà docs**

§3.4 phải khớp §6–§9 của spec. Không còn nhắc `correction`, `daysCount`, `otRateMultiplier` hay `targetPunchType`.

- [ ] **Step 4: Commit**

```bash
git add test/v2/requests-repository.pg.test.ts docs/api/v2-contract.md
git commit -m "test(requests): cover the requests repository and holidays on PostgreSQL"
```
